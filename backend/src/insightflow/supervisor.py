"""
InsightFlow v5 — 主管AI任务分解器（Supervisor）
================================================

ReWOO 范式的核心组件：
- 接收用户问题 → 分解为可执行子任务列表
- 定义任务间的依赖关系（DAG）
- 指定每个子任务由哪个Agent执行
- 动态感知数据特征（有无时间列、哪些字段可用等）

流程：
1. Supervisor 接收用户问题 + 数据画像
2. 输出结构化任务列表（JSON），每个任务含：type, description, depends_on, assigned_to
3. 任务被提交到 TaskPool，由 DAG 驱动并行执行

Author: InsightFlow AI Team
"""

import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


# ── Supervisor 分解模板 ──────────────────────────────────────

# 任务分解的 Few-shot 示例
DECOMPOSE_EXAMPLES = """
### 示例1
用户问题："哪个行业增长最快？"
数据特征：有时间列(年份)、有行业字段、有增长率指标

任务分解结果：
[
  {"type": "data_query", "description": "从数据库中提取各行业每年的增长率数据，按年份和行业分组", "depends_on": [], "assigned_to": "DATA_ENGINEER"},
  {"type": "analyze_data", "description": "分析各行业增长率的趋势，找出增长率最高的行业", "depends_on": ["task_1"], "assigned_to": "DATA_ANALYST"},
  {"type": "validate_result", "description": "验证分析结论的数据准确性和逻辑严谨性", "depends_on": ["task_2"], "assigned_to": "QUALITY_REVIEWER"},
  {"type": "generate_insight", "description": "基于分析结果，给出战略建议", "depends_on": ["task_2", "task_3"], "assigned_to": "STRATEGY_ADVISOR"},
  {"type": "write_report", "description": "整合以上所有结果，写一份完整的分析报告", "depends_on": ["task_2", "task_3", "task_4"], "assigned_to": "REPORT_EDITOR"}
]

### 示例2
用户问题："预测下个季度的销售额"
数据特征：有时间列(日期)、有销售额字段

任务分解结果：
[
  {"type": "analyze_data", "description": "分析历史销售额的时间序列特征：趋势、季节性、同比环比", "depends_on": [], "assigned_to": "DATA_ANALYST"},
  {"type": "predict_trend", "description": "基于历史销售额数据，预测下个季度的销售额", "depends_on": ["task_1"], "assigned_to": "FORECAST_ANALYST"},
  {"type": "validate_result", "description": "验证预测模型的合理性：检查置信区间、异常值处理", "depends_on": ["task_2"], "assigned_to": "QUALITY_REVIEWER"},
  {"type": "generate_insight", "description": "基于预测结果，给出业务行动建议", "depends_on": ["task_2", "task_3"], "assigned_to": "STRATEGY_ADVISOR"},
  {"type": "write_report", "description": "整合预测结果和洞察，生成最终报告", "depends_on": ["task_2", "task_3", "task_4"], "assigned_to": "REPORT_EDITOR"}
]
"""


# ── 任务类型说明（给LLM的参考）──────────────────────────────

TASK_TYPE_GUIDE = """
### 任务类型说明
- data_query: 从数据库中提取特定数据（老陈执行，需要写SQL）
- analyze_data: 深入分析数据，找出规律和洞察（老林执行）
- predict_trend: 基于数据做趋势预测、潜力评估、前景判断（老王执行，不限于时间列）
- validate_result: 验证其他Agent的分析结论（质检官执行）
- generate_insight: 基于分析结果给出战略建议（小赵执行）
- write_report: 整合所有结果，生成最终报告（小李执行，通常作为最后一个任务）

### Agent 角色映射
- DATA_ENGINEER: 老陈 · 数据工程师 → data_query
- DATA_ANALYST: 老林 · 数据分析师 → analyze_data
- FORECAST_ANALYST: 老王 · 预测先知 → predict_trend
- QUALITY_REVIEWER: 质检官 → validate_result
- STRATEGY_ADVISOR: 小赵 · 策略顾问 → generate_insight
- REPORT_EDITOR: 小李 · 报告主编 → write_report

### 依赖规则
- depends_on 是任务ID列表（如 ["task_1", "task_2"]）
- 任务ID使用 task_1, task_2, task_3 ... 顺序编号
- 没有依赖的任务 depends_on 为 []
- validate_result 应该依赖被审查的分析任务
- write_report 应该依赖所有前面的任务
- report任务总是最后一个
"""


class TaskDecomposer:
    """
    主管AI任务分解器。

    接收用户问题 + 数据画像，输出结构化任务列表。
    支持两种模式：
    1. LLM模式：调用LLM智能分解（精确但慢，~2-3秒）
    2. 规则模式：基于意图分类的模板匹配（快，~0秒）
    """

    def __init__(self):
        self._use_llm = True  # 默认使用LLM分解

    async def decompose(
        self,
        question: str,
        chen_profile: Dict[str, Any],
        table_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        将用户问题分解为子任务列表。

        返回格式：
        [
            {
                "type": "analyze_data",
                "description": "分析...",
                "depends_on": [],
                "assigned_to": "DATA_ANALYST",
            },
            ...
        ]
        """
        # 提取数据特征
        data_features = self._extract_data_features(chen_profile)

        if self._use_llm:
            try:
                tasks = await self._llm_decompose(question, data_features, chen_profile)
                if tasks and len(tasks) >= 2:
                    return tasks
            except Exception as e:
                logger.warning(f"[Supervisor] LLM分解失败，降级为规则模式: {e}")

        # 降级为规则模式
        return self._rule_decompose(question, data_features, chen_profile)

    def _extract_data_features(self, chen_profile: Dict[str, Any]) -> Dict[str, Any]:
        """从数据画像中提取关键特征"""
        columns = chen_profile.get("columns", [])
        shape = chen_profile.get("shape", [0, 0])

        features = {
            "has_time": False,
            "has_metric": False,
            "time_columns": [],
            "metric_columns": [],
            "dimension_columns": [],
            "total_rows": shape[0],
            "total_columns": shape[1],
        }

        for col in columns:
            col_type = col.get("type", "")
            col_role = col.get("role", "")
            col_name = col.get("name", "")

            if col_type == "time":
                features["has_time"] = True
                features["time_columns"].append(col_name)
            if col_role in ("metric", "primary"):
                features["has_metric"] = True
                features["metric_columns"].append(col_name)
            if col_role == "dimension":
                features["dimension_columns"].append(col_name)

        return features

    async def _llm_decompose(
        self,
        question: str,
        features: Dict[str, Any],
        chen_profile: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """使用LLM智能分解任务"""
        from ..utils.llm_client import llm

        # 构建数据概况
        data_brief = (
            f"数据规模：{features['total_rows']}行 x {features['total_columns']}列\n"
            f"有时间列：{'是（' + ','.join(features['time_columns']) + '）' if features['has_time'] else '否'}\n"
            f"数值指标列：{', '.join(features['metric_columns'][:5]) or '无'}\n"
            f"分类维度列：{', '.join(features['dimension_columns'][:5]) or '无'}\n"
        )

        prompt = f"""你是InsightFlow的"主管AI"。你的职责是将用户的分析问题分解为多个可执行的子任务，分配给专业Agent执行。

{TASK_TYPE_GUIDE}

{DECOMPOSE_EXAMPLES}

## 当前数据特征
{data_brief}

## 用户的问题
{question}

## 要求
1. 分解为3-6个子任务（不要太多，也不要太少）
2. {"包含 predict_trend 类型的任务（数据有时间列）" if features["has_time"] else "如果问题涉及潜力评估、前景判断、排名对比、趋势分析，也要包含 predict_trend 任务让预测分析师参与"}
3. validate_result 至少审查一个分析类任务
4. write_report 总是最后一个任务，依赖前面的主要任务
5. depends_on 中的ID必须与前面的任务的ID对应
6. 尽量让不同类型的Agent都参与（预测分析师不应只在有时间列时才参与）

请直接输出JSON数组，不要其他文字。格式如下：
[
  {{"type": "任务类型", "description": "具体描述", "depends_on": [], "assigned_to": "AGENT角色"}}
]"""

        messages = [
            {"role": "system", "content": "你是任务分解专家。只输出JSON，不要其他文字。"},
            {"role": "user", "content": prompt},
        ]

        # 使用较快的模型和较低温度
        response = ""
        async for delta in llm.chat_stream(
            messages, model="deepseek-chat", temperature=0.1, max_tokens=1000
        ):
            response += delta

        # 解析JSON
        return self._parse_task_json(response)

    def _parse_task_json(self, response: str) -> List[Dict[str, Any]]:
        """从LLM响应中解析任务JSON"""
        import re

        # 尝试提取JSON数组
        json_match = re.search(r'\[\s*\{.*?\}\s*\]', response, re.DOTALL)
        if not json_match:
            # 尝试提取 ```json ... ``` 块
            json_match = re.search(r'```json\s*(.*?)\s*```', response, re.DOTALL)
        if not json_match:
            json_match = re.search(r'```\s*(.*?)\s*```', response, re.DOTALL)

        if not json_match:
            logger.warning(f"[Supervisor] 无法从响应中提取JSON: {response[:200]}")
            return []

        try:
            tasks = json.loads(json_match.group(1) if '```' in response else json_match.group())
            if not isinstance(tasks, list):
                return []

            # 验证和标准化
            valid_tasks = []
            for i, t in enumerate(tasks):
                if not isinstance(t, dict):
                    continue
                task_type = t.get("type", "analyze_data")
                desc = t.get("description", "")
                depends = t.get("depends_on", [])
                assigned = t.get("assigned_to", "DATA_ANALYST")

                if not desc:
                    continue

                # 标准化 depends_on（确保是列表）
                if isinstance(depends, str):
                    depends = [d.strip() for d in depends.split(",") if d.strip()]

                valid_tasks.append({
                    "type": task_type,
                    "description": desc,
                    "depends_on": depends,
                    "assigned_to": assigned,
                })

            return valid_tasks
        except json.JSONDecodeError as e:
            logger.warning(f"[Supervisor] JSON解析失败: {e}")
            return []

    def _rule_decompose(
        self,
        question: str,
        features: Dict[str, Any],
        chen_profile: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """
        规则模式：基于意图分类的模板匹配。

        虽然不如LLM灵活，但零延迟，适合降级使用。
        """
        q = question.lower()

        # ── 判断问题类型 ──
        is_predictive = any(kw in q for kw in ["预测", "预计", "未来", "将会", "下个"])
        is_trend = any(kw in q for kw in ["趋势", "增长", "变化", "增速", "同比", "环比"])
        is_comparative = any(kw in q for kw in ["对比", "比较", "哪个", "差异", "vs"])
        is_ranking = any(kw in q for kw in ["最好", "最高", "最大", "TOP", "排名", "前十"])
        is_causal = any(kw in q for kw in ["为什么", "原因", "导致", "因素"])
        is_distribution = any(kw in q for kw in ["占比", "构成", "分布", "比例"])

        tasks = []
        metric_desc = ", ".join(features["metric_columns"][:3]) or "关键指标"
        dim_desc = ", ".join(features["dimension_columns"][:3]) or "分类字段"

        # Task 1: 数据准备（老陈）
        tasks.append({
            "type": "data_query",
            "description": f"提取与问题相关的数据：{metric_desc}等指标，按{dim_desc}等维度分组",
            "depends_on": [],
            "assigned_to": "DATA_ENGINEER",
        })

        # Task 2: 数据分析（老林）— 总是需要的
        analysis_desc = "分析数据"
        if is_trend or is_predictive:
            analysis_desc = f"分析{metric_desc}的时间序列特征和变化趋势"
        elif is_comparative:
            analysis_desc = f"对比分析{dim_desc}之间的差异"
        elif is_ranking:
            analysis_desc = f"找出{metric_desc}的排名情况"
        elif is_causal:
            analysis_desc = f"分析导致数据变化的关键因素"
        elif is_distribution:
            analysis_desc = f"分析{dim_desc}的分布结构和占比"
        else:
            analysis_desc = f"深入分析{metric_desc}的规律和洞察"

        tasks.append({
            "type": "analyze_data",
            "description": analysis_desc,
            "depends_on": ["task_1"],
            "assigned_to": "DATA_ANALYST",
        })

        next_task_id = 3

        # Task 3: 预测/趋势评估（老王参与更多场景）
        # 老王不只是做时间序列预测，还能做趋势判断、潜力评估、前景分析
        wang_should_join = (
            features["has_time"] and (is_trend or is_predictive)  # 原有：时间列+趋势/预测词
            or any(kw in q for kw in ["潜力", "前景", "值得", "机会", "走势", "预期", "看好"])  # 新增：潜力/前景等词
        )
        if wang_should_join or is_comparative or is_ranking:
            tasks.append({
                "type": "predict_trend",
                "description": f"基于历史数据和趋势特征，评估{dim_desc}中{metric_desc}的发展潜力和前景",
                "depends_on": ["task_2"],
                "assigned_to": "FORECAST_ANALYST",
            })
            next_task_id += 1

        # 质检任务（依赖分析任务）
        validate_deps = ["task_2"]
        if next_task_id > 3:
            validate_deps.append(f"task_{next_task_id - 1}")

        tasks.append({
            "type": "validate_result",
            "description": "验证分析结论的数据准确性和逻辑严谨性",
            "depends_on": validate_deps,
            "assigned_to": "QUALITY_REVIEWER",
        })
        next_task_id += 1

        # 策略建议
        strategy_deps = validate_deps[:]
        tasks.append({
            "type": "generate_insight",
            "description": "基于分析结果，给出明确的战略建议和行动方案",
            "depends_on": strategy_deps,
            "assigned_to": "STRATEGY_ADVISOR",
        })
        next_task_id += 1

        # 报告（最后一个）
        report_deps = [f"task_{i}" for i in range(1, next_task_id)]
        tasks.append({
            "type": "write_report",
            "description": f"整合所有分析结果，生成关于「{question}」的完整报告",
            "depends_on": report_deps,
            "assigned_to": "REPORT_EDITOR",
        })

        return tasks

    def decompose_sync(
        self,
        question: str,
        chen_profile: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """同步版本（不调LLM，仅规则模式）"""
        features = self._extract_data_features(chen_profile)
        return self._rule_decompose(question, features, chen_profile)


# ── 单例 ──────────────────────────────────────────────────────

_supervisor: Optional[TaskDecomposer] = None


def get_supervisor() -> TaskDecomposer:
    global _supervisor
    if _supervisor is None:
        _supervisor = TaskDecomposer()
    return _supervisor
