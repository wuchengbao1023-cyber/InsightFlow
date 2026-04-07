"""
数据侦探 - Agentic NL2SQL 工具
=================================

不是单次 Text-to-SQL，而是Agent可以主动调用的**数据分析工具**。

核心设计：
1. Schema感知：从老陈的profile提取表结构，注入prompt
2. LLM生成SQL：自然语言→DuckDB SQL
3. 安全执行：复用DuckDB引擎的安全阀（只读+行数限制+超时）
4. 结果解释：LLM把查询结果翻译成人类可读的分析
5. 推理链记录：每个查询自动创建ReasoningStep

使用场景：
- Agent讨论中：need_sql字段 → orchestrator调用 → 结果注入讨论
- 前端追问：用户点击"追问"按钮 → NL2SQL查询 → 展示结果
"""

import logging
import json
import re
from typing import Dict, Any, List, Optional, AsyncGenerator
from datetime import datetime

logger = logging.getLogger(__name__)


class DataDetective:
    """数据侦探：Agent的数据查询工具"""

    def __init__(self):
        self.name = "数据侦探"
        self.role = "数据分析工具"
        self._table_name: Optional[str] = None
        self._schema: Optional[Dict[str, Any]] = None
        self._query_count = 0

    # ═══════════════════════════════════════════════════════════
    # Schema管理
    # ═══════════════════════════════════════════════════════════

    def set_schema(self, table_name: str, chen_profile: Dict[str, Any]) -> None:
        """
        设置当前表的schema信息（从老陈的profile提取）。

        Args:
            table_name: DuckDB中的表名
            chen_profile: 老陈的数据画像结果
        """
        self._table_name = table_name
        self._schema = self._extract_schema(table_name, chen_profile)
        logger.info(f"[数据侦探] Schema已加载: {table_name}, {len(self._schema['columns'])}列")

    def _extract_schema(self, table_name: str, profile: Dict[str, Any]) -> Dict[str, Any]:
        """从老陈的profile中提取精简schema（给LLM用的）"""
        columns = []
        for col in profile.get("columns", []):
            if col.get("action") == "exclude":
                continue  # 排除列不参与查询
            columns.append({
                "name": col.get("name", ""),
                "type": col.get("type", "unknown"),
                "role": col.get("role", ""),        # metric/dimension/time
                "semantic": col.get("semantic", ""),
                "sample": col.get("sample", [])[:3],  # 取前3个样本值
                "stats": {
                    "min": col.get("min"),
                    "max": col.get("max"),
                    "mean": col.get("mean"),
                    "unique_count": col.get("unique_count"),
                    "null_pct": col.get("null_pct", 0),
                } if col.get("type") == "numeric" else None,
            })

        return {
            "table": table_name,
            "columns": columns,
            "row_count": profile.get("shape", [0, 0])[0],
            "primary_metrics": [c["name"] for c in columns if c.get("role") == "metric" and c.get("is_primary")],
            "time_columns": [c["name"] for c in columns if c.get("role") == "time"],
            "dimension_columns": [c["name"] for c in columns if c.get("role") == "dimension"],
        }

    def get_schema_prompt(self) -> str:
        """生成给LLM的schema描述（自然语言）"""
        if not self._schema:
            return "（未加载数据schema）"

        lines = [f"表名: {self._schema['table']}，共{self._schema['row_count']}行"]

        # 按角色分组
        metrics = [c for c in self._schema["columns"] if c.get("role") == "metric"]
        dims = [c for c in self._schema["columns"] if c.get("role") == "dimension"]
        times = [c for c in self._schema["columns"] if c.get("role") == "time"]

        if times:
            lines.append(f"时间列: {', '.join(c['name'] for c in times)}")
        if dims:
            lines.append(f"维度列: {', '.join(c['name'] for c in dims)}")
        if metrics:
            for c in metrics:
                sample = f"(样本: {', '.join(str(v) for v in c.get('sample', [])[:2])})" if c.get("sample") else ""
                lines.append(f"  指标 {c['name']} {sample}")

        return "\n".join(lines)

    # ═══════════════════════════════════════════════════════════
    # NL2SQL 核心
    # ═══════════════════════════════════════════════════════════

    async def query(
        self,
        question: str,
        context: str = "",
    ) -> Dict[str, Any]:
        """
        自然语言 → SQL → 执行 → 解释。

        Args:
            question: 用户/Agent的自然语言问题
            context: 额外上下文（如讨论中前面的发言）

        Returns:
            {
                "success": bool,
                "question": str,
                "sql": str,
                "result": {...},        # DuckDB查询结果
                "explanation": str,     # LLM对结果的自然语言解释
                "reasoning_step": {...}, # 可选，推理链步骤
            }
        """
        if not self._schema:
            return {"success": False, "error": "未加载数据schema，请先上传数据"}

        self._query_count += 1

        # Step 1: LLM生成SQL
        sql = await self._generate_sql(question, context)

        if not sql:
            return {"success": False, "question": question, "error": "无法生成有效的SQL查询"}

        # Step 2: 执行SQL
        result = await self._execute_sql(sql)

        if not result.get("success"):
            # 如果SQL失败，尝试LLM修正一次
            logger.debug(f"[数据侦探] SQL执行失败，尝试修正: {result.get('error')}")
            sql = await self._fix_sql(sql, question, result.get("error", ""))
            if sql:
                result = await self._execute_sql(sql)

        if not result.get("success"):
            return {
                "success": False,
                "question": question,
                "sql": sql,
                "error": result.get("error", "查询执行失败"),
            }

        # Step 3: 解释结果
        explanation = await self._explain_result(question, sql, result)

        # Step 4: 记录到推理链
        reasoning_step = None
        try:
            from .reasoning_chain import get_reasoning_chain
            chain = get_reasoning_chain()
            chain.add_step(
                agent=self.name,
                claim=f"数据查询: {question}",
                method="nl2sql",
                sql=sql,
                raw_result=result.get("rows", [])[:10],
                computation=f"NL2SQL查询, 返回{result.get('row_count', 0)}行",
                source_columns=result.get("columns", []),
                confidence=0.95,
            )
            reasoning_step = chain.steps[-1].to_dict() if chain.steps else None
        except Exception as e:
            logger.debug(f"[数据侦探] 推理链记录失败: {e}")

        logger.info(f"[数据侦探] 查询#{self._query_count}: {question[:50]}... → {result.get('row_count', 0)}行")

        return {
            "success": True,
            "question": question,
            "sql": sql,
            "result": result,
            "explanation": explanation,
            "reasoning_step": reasoning_step,
        }

    async def query_stream(
        self,
        question: str,
        context: str = "",
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        流式版本：先生成SQL展示给用户看，然后执行，再流式解释。

        Yields:
            {"type": "thinking", "data": "..."}  - 思考过程
            {"type": "sql", "data": "..."}       - 生成的SQL
            {"type": "result", "data": {...}}    - 查询结果
            {"type": "explanation_delta", "data": "..."}  - 解释（逐token）
            {"type": "done", "data": {...}}      - 完整结果
        """
        if not self._schema:
            yield {"type": "done", "data": {"success": False, "error": "未加载数据schema"}}
            return

        self._query_count += 1

        # Step 1: 生成SQL
        yield {"type": "thinking", "data": f"正在分析问题: {question}"}
        sql = await self._generate_sql(question, context)

        if not sql:
            yield {"type": "done", "data": {"success": False, "error": "无法生成SQL"}}
            return

        yield {"type": "sql", "data": sql}

        # Step 2: 执行
        result = await self._execute_sql(sql)
        if not result.get("success"):
            # 尝试修正
            yield {"type": "thinking", "data": "SQL执行失败，尝试修正..."}
            sql = await self._fix_sql(sql, question, result.get("error", ""))
            if sql:
                yield {"type": "sql", "data": f"修正后: {sql}"}
                result = await self._execute_sql(sql)

        if not result.get("success"):
            yield {"type": "done", "data": {"success": False, "sql": sql, "error": result.get("error", "")}}
            return

        yield {"type": "result", "data": result}

        # Step 3: 流式解释
        explanation = ""
        try:
            from ..utils import llm
            llm_client = llm.get_llm()

            messages = self._build_explain_messages(question, sql, result)
            async for token in llm_client.chat_stream(messages, temperature=0.3, max_tokens=500):
                explanation += token
                yield {"type": "explanation_delta", "data": token}
        except Exception as e:
            explanation = f"查询返回{result.get('row_count', 0)}行数据。"
            yield {"type": "explanation_delta", "data": explanation}

        # 记录推理链
        try:
            from .reasoning_chain import get_reasoning_chain
            chain = get_reasoning_chain()
            chain.add_step(
                agent=self.name,
                claim=f"数据查询: {question}",
                method="nl2sql",
                sql=sql,
                raw_result=result.get("rows", [])[:10],
                computation=f"NL2SQL查询, 返回{result.get('row_count', 0)}行",
                source_columns=result.get("columns", []),
                confidence=0.95,
            )
        except Exception:
            pass

        yield {"type": "done", "data": {
            "success": True,
            "question": question,
            "sql": sql,
            "result": result,
            "explanation": explanation,
        }}

    # ═══════════════════════════════════════════════════════════
    # 内部方法
    # ═══════════════════════════════════════════════════════════

    async def _generate_sql(self, question: str, context: str = "") -> Optional[str]:
        """LLM: 自然语言 → DuckDB SQL"""
        from ..utils import llm
        llm_client = llm.get_llm()

        if not llm_client.available:
            return None

        schema_desc = self.get_schema_prompt()
        table = self._schema["table"]

        prompt = f"""你是一个SQL专家。根据以下数据schema和用户问题，生成DuckDB SQL查询。

数据Schema:
{schema_desc}

{f"讨论上下文（供参考）: {context[:500]}" if context else ""}

用户问题: {question}

要求:
1. 只生成一条SELECT语句，不要解释
2. 表名用 "{table}"
3. 列名用双引号包裹，如 "列名"
4. 结果限制在100行以内（加 LIMIT 100）
5. 如果问题涉及时间范围，使用WHERE过滤
6. 使用中文列别名让结果更易读

只输出SQL，不要其他文字。"""

        try:
            raw = await llm_client.chat(
                [{"role": "user", "content": prompt}],
                temperature=0.1,  # 低温度确保SQL准确
                max_tokens=300,
            )

            # 提取SQL（可能被```sql包裹）
            sql = self._extract_sql(raw)
            return sql if sql else None

        except Exception as e:
            logger.debug(f"[数据侦探] SQL生成失败: {e}")
            return None

    async def _fix_sql(
        self,
        broken_sql: str,
        question: str,
        error_msg: str,
    ) -> Optional[str]:
        """SQL执行失败时，让LLM尝试修正"""
        from ..utils import llm
        llm_client = llm.get_llm()

        if not llm_client.available:
            return None

        prompt = f"""以下SQL查询执行失败了，请修正它。

Schema: {self.get_schema_prompt()}

原始问题: {question}

失败的SQL:
```sql
{broken_sql}
```

错误信息: {error_msg}

请输出修正后的SQL（只输出SQL，不要解释）。"""

        try:
            raw = await llm_client.chat(
                [{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=300,
            )
            return self._extract_sql(raw)
        except Exception:
            return None

    async def _execute_sql(self, sql: str) -> Dict[str, Any]:
        """执行SQL（通过DuckDB引擎）"""
        try:
            from ..core.duckdb_engine import get_engine
            engine = get_engine()
            return await engine.query(sql, table_name=self._table_name)
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _explain_result(
        self,
        question: str,
        sql: str,
        result: Dict[str, Any],
    ) -> str:
        """LLM: 查询结果 → 自然语言解释"""
        from ..utils import llm
        llm_client = llm.get_llm()

        if not llm_client.available:
            rows = result.get("rows", [])[:5]
            return f"查询返回{result.get('row_count', 0)}行数据。前5行: {json.dumps(rows, ensure_ascii=False, default=str)[:300]}"

        messages = self._build_explain_messages(question, sql, result)

        try:
            return await llm_client.chat(messages, temperature=0.3, max_tokens=500)
        except Exception as e:
            return f"查询返回{result.get('row_count', 0)}行数据。"

    def _build_explain_messages(
        self,
        question: str,
        sql: str,
        result: Dict[str, Any],
    ) -> List[Dict[str, str]]:
        """构建结果解释的messages"""
        rows = result.get("rows", [])[:10]
        columns = result.get("columns", [])
        row_count = result.get("row_count", 0)

        # 精简结果数据（避免token浪费）
        data_str = json.dumps(rows, ensure_ascii=False, default=str)
        if len(data_str) > 2000:
            data_str = data_str[:2000] + "...(截断)"

        return [
            {
                "role": "system",
                "content": "你是数据分析助手。请用简洁的中文解释SQL查询结果，直接回答用户的问题。不要重复SQL，聚焦于数据告诉我们的洞察。"
            },
            {
                "role": "user",
                "content": f"""用户问题: {question}

SQL查询:
```sql
{sql}
```

查询结果（{row_count}行，列: {', '.join(columns)}）:
{data_str}

请解释这个结果回答了什么问题，有什么关键发现。"""
            }
        ]

    def _extract_sql(self, text: str) -> Optional[str]:
        """从LLM输出中提取SQL（处理```sql包裹）"""
        text = text.strip()
        if not text:
            return None

        # 处理 ```sql ... ``` 包裹
        if "```" in text:
            lines = text.split("\n")
            in_block = False
            sql_lines = []
            for line in lines:
                if line.strip().startswith("```"):
                    if in_block:
                        break
                    in_block = True
                    continue
                if in_block:
                    sql_lines.append(line)
            if sql_lines:
                text = "\n".join(sql_lines)

        # 验证是有效的SELECT
        text = text.strip().rstrip(";")
        if text.upper().startswith("SELECT") or text.upper().startswith("WITH"):
            return text

        return None


# ═══════════════════════════════════════════════════════════
# 单例
# ═══════════════════════════════════════════════════════════

_detective_instance: Optional[DataDetective] = None


def get_detective() -> DataDetective:
    """获取数据侦探单例"""
    global _detective_instance
    if _detective_instance is None:
        _detective_instance = DataDetective()
    return _detective_instance
