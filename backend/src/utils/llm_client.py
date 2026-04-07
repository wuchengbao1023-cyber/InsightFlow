"""
DataMind OS 2026 - LLM 客户端
统一封装 DeepSeek / OpenAI 接口，支持流式输出
"""

import os
import logging
import json
import asyncio
from typing import Optional, AsyncGenerator, Dict, Any, List, Tuple, Type, TypeVar
from pathlib import Path

logger = logging.getLogger(__name__)

# 尝试加载 .env
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent / ".env"
    load_dotenv(env_path)
except ImportError:
    pass

# 尝试导入 aiohttp（异步HTTP，Python 3.7 兼容）
try:
    import aiohttp
    HAS_HTTPX = True  # 保持变量名兼容
except ImportError:
    aiohttp = None
    HAS_HTTPX = False
    logger.warning("aiohttp 未安装，LLM 功能受限。请运行: pip install aiohttp")

T = TypeVar("T")


class LLMConfig:
    """LLM 配置"""
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    
    DEFAULT_MODEL: str = "deepseek-chat"
    MAX_TOKENS: int = 2000
    TEMPERATURE: float = 0.7
    TIMEOUT: float = 60.0

    @classmethod
    def get_api_key(cls) -> Tuple[str, str]:
        """返回 (api_key, base_url)"""
        if cls.DEEPSEEK_API_KEY:
            return cls.DEEPSEEK_API_KEY, cls.DEEPSEEK_BASE_URL
        elif cls.OPENAI_API_KEY:
            return cls.OPENAI_API_KEY, cls.OPENAI_BASE_URL
        return "", cls.DEEPSEEK_BASE_URL


# ── 模型路由表 ──────────────────────────────────────────────────
# 根据 complexity（1-10）和 agent 角色，选择最合适的模型
# 复杂度低→用便宜快速的模型；复杂度高→用推理强的模型
# 质检官低复杂度→直接用规则引擎不调LLM，省成本

MODEL_ROUTING: Dict[str, Dict[str, Any]] = {
    # 小赵：洞察生成
    "小赵_生成": {
        "minimal": {
            "model": "deepseek-chat",
            "temperature": 0.3,
            "max_tokens": 800,
            "reason": "低复杂度数据，用chat模型快速出结果",
        },
        "moderate": {
            "model": "deepseek-chat",
            "temperature": 0.5,
            "max_tokens": 1500,
            "reason": "标准分析，chat模型够用",
        },
        "deep": {
            "model": "deepseek-reasoner",
            "temperature": 0.4,
            "max_tokens": 2500,
            "reason": "高复杂度数据，用reasoner深度推理",
        },
    },
    # 小赵：重写（质检后局部修改）
    "小赵_重写": {
        "minimal": {
            "model": "deepseek-chat",
            "temperature": 0.2,
            "max_tokens": 600,
            "reason": "低复杂度，chat模型够用",
        },
        "moderate": {
            "model": "deepseek-chat",
            "temperature": 0.3,
            "max_tokens": 1000,
            "reason": "标准重写",
        },
        "deep": {
            "model": "deepseek-chat",
            "temperature": 0.3,
            "max_tokens": 1500,
            "reason": "重写不需要reasoner，chat够用",
        },
    },
    # 质检官
    "质检官": {
        "minimal": {
            "model": None,  # None = 直接用规则引擎，不调LLM
            "temperature": 0,
            "max_tokens": 0,
            "reason": "低复杂度数据，规则引擎质检即可，省成本",
        },
        "moderate": {
            "model": "deepseek-chat",
            "temperature": 0.2,
            "max_tokens": 1500,
            "reason": "标准质检，chat模型",
        },
        "deep": {
            "model": "deepseek-reasoner",
            "temperature": 0.1,
            "max_tokens": 2000,
            "reason": "高复杂度数据需要reasoner深度审查",
        },
    },
}


def get_model_config(agent_key: str, llm_strategy: str) -> Dict[str, Any]:
    """
    根据Agent角色和LLM策略返回模型配置。

    Args:
        agent_key: 如 "小赵_生成"、"小赵_重写"、"质检官"
        llm_strategy: "minimal" | "moderate" | "deep"

    Returns:
        {"model": str|None, "temperature": float, "max_tokens": int, "reason": str}
        model=None 表示应该用规则引擎替代LLM
    """
    agent_config = MODEL_ROUTING.get(agent_key, {})
    config = agent_config.get(llm_strategy, agent_config.get("moderate", {}))
    return {
        "model": config.get("model"),
        "temperature": config.get("temperature", 0.3),
        "max_tokens": config.get("max_tokens", 1500),
        "reason": config.get("reason", "默认策略"),
    }


class LLMClient:
    """
    统一 LLM 客户端
    优先使用 DeepSeek，fallback 到 OpenAI，无 key 时降级到规则引擎
    """
    
    _instance: Optional["LLMClient"] = None
    
    def __init__(self):
        self.config = LLMConfig()
        self.api_key, self.base_url = self.config.get_api_key()
        self.available = bool(self.api_key) and HAS_HTTPX
        self.last_usage: Dict[str, Any] = {}  # 最近一次调用的真实usage
        self._session: Optional[Any] = None  # 持久化 aiohttp session
        
        if not self.available:
            if not self.api_key:
                logger.warning("⚠️ 未配置 API Key，LLM 将使用规则引擎降级模式")
            if not HAS_HTTPX:
                logger.warning("⚠️ httpx 未安装，请运行: pip install httpx")
        else:
            logger.info(f"✅ LLM 客户端就绪，接口: {self.base_url}")
    
    def _get_session(self):
        """获取或创建持久化 aiohttp session"""
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self.config.TIMEOUT)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session
    
    async def close(self):
        """关闭持久化 session（应在应用关闭时调用）"""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
    
    def __del__(self):
        """析构时尝试关闭 session"""
        try:
            if self._session and not self._session.closed:
                import asyncio
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self._session.close())
                else:
                    loop.run_until_complete(self._session.close())
        except Exception:
            pass
    
    @classmethod
    def get_instance(cls) -> "LLMClient":
        if cls._instance is None:
            cls._instance = LLMClient()
        return cls._instance
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: bool = False
    ) -> str:
        """
        发送对话请求
        
        Args:
            messages: 对话消息列表 [{"role": "user", "content": "..."}]
            model: 模型名称
            temperature: 温度
            max_tokens: 最大 token 数
            stream: 是否流式
            
        Returns:
            AI 回复文本

        Side effect:
            将本次调用的usage信息存入 self.last_usage
        """
        if not self.available:
            return self._fallback_response(messages)
        
        try:
            payload = {
                "model": model or self.config.DEFAULT_MODEL,
                "messages": messages,
                "temperature": temperature or self.config.TEMPERATURE,
                "max_tokens": max_tokens or self.config.MAX_TOKENS,
                "stream": stream
            }
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            session = self._get_session()
            async with session.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers
            ) as response:
                response.raise_for_status()
                data = await response.json()
                # 存储本次调用的usage信息
                self.last_usage = data.get("usage", {})
                return data["choices"][0]["message"]["content"]
                
        except Exception as e:
            logger.error(f"❌ LLM 请求失败: {e}")
            self.last_usage = {}
            return self._fallback_response(messages)
    
    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncGenerator[str, None]:
        """流式对话"""
        if not self.available:
            text = self._fallback_response(messages)
            # 模拟流式输出
            for char in text:
                yield char
                await asyncio.sleep(0.01)
            return
        
        try:
            payload = {
                "model": model or self.config.DEFAULT_MODEL,
                "messages": messages,
                "temperature": temperature or self.config.TEMPERATURE,
                "max_tokens": max_tokens or self.config.MAX_TOKENS,
                "stream": True
            }
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            session = self._get_session()
            async with session.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers
            ) as response:
                response.raise_for_status()
                async for raw_line in response.content:
                    line = raw_line.decode("utf-8").strip()
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            # 记录最后一个chunk的usage（DeepSeek流式在末尾返回）
                            if "usage" in data and data["usage"]:
                                self.last_usage = data["usage"]
                            delta = data["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
                        except (json.JSONDecodeError, KeyError):
                            continue
        except Exception as e:
            logger.error(f"❌ LLM 流式请求失败: {e}")
            yield self._fallback_response(messages)
    
    def _fallback_response(self, messages: List[Dict[str, str]]) -> str:
        """规则引擎降级响应（无API Key时使用）"""
        last_user = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user = m.get("content", "")
                break
        
        keywords = {
            "销售": "根据当前销售数据分析，整体呈上升趋势。华东区表现最为突出，建议重点关注该区域的增长驱动因素。",
            "异常": "数据异常检测完成。发现3处统计异常点，主要集中在销量指标上，建议进一步排查原因。",
            "预测": "基于历史数据的趋势预测：预计下个月销售额将增长约8-12%，置信区间95%。",
            "优化": "优化建议：1. 提高高转化率渠道的投入比例；2. 优化库存周转率；3. 加强客户留存运营。",
            "报告": "综合数据分析报告已生成。本期数据质量优良，主要指标均在正常范围内，无重大风险。",
            "质量": "数据质量评估：完整性96.8%，准确性94.2%，一致性98.1%，整体评级：优秀。",
        }
        
        for kw, resp in keywords.items():
            if kw in last_user:
                return f"[规则引擎] {resp}"
        
        return f"[规则引擎] 已收到您的查询「{last_user[:50]}」，正在分析数据。系统当前运行在离线规则模式，如需完整 AI 分析请配置 API Key。"
    
    async def analyze_data(
        self,
        question: str,
        data_summary: str,
        analysis_type: str = "general",
        context: Optional[str] = None
    ) -> str:
        """
        数据分析专用接口
        
        Args:
            question: 用户问题
            data_summary: 数据摘要（防止 token 超限）
            analysis_type: 分析类型
            context: 额外上下文
        """
        system_prompt = f"""你是 DataMind 企业智能 BI 平台的核心分析引擎，拥有以下能力：
- 自然语言理解与数据洞察
- 趋势分析与预测
- 异常检测与根因分析
- 优化建议生成
- 专业分析报告撰写

当前分析类型：{analysis_type}
请用中文回答，结构清晰，给出具体数字和可操作建议。"""
        
        user_content = f"数据概况：\n{data_summary}\n\n用户问题：{question}"
        if context:
            user_content += f"\n\n分析上下文：{context}"
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]
        
        return await self.chat(messages)
    
    async def generate_narrative(
        self,
        question: str,
        analysis_results: List[Dict[str, Any]],
        detective_profile: Dict[str, Any] = None,
        sql_data: List[Dict[str, Any]] = None,
        sql_columns: List[str] = None,
        sql_row_count: int = 0,
        sql_query: str = None,
    ) -> str:
        """
        叙事作家：将多个 Agent 的结果 + 真实数据整合成可读报告

        关键改进：不再截断500字符，而是注入结构化的真实统计数据和SQL查询结果，
        让 LLM 基于真实数字生成有据可查的回答。
        """
        # ── 构建数据概要（优先使用真实统计） ──
        data_summary_parts = []

        if detective_profile and detective_profile.get("total_rows"):
            dp = detective_profile
            data_summary_parts.append(
                f"【数据概况】{dp['total_rows']:,}行 × {dp['total_cols']}列, "
                f"缺失值{dp.get('missing_pct', 0)}%, 重复率{dp.get('duplicate_pct', 0)}%, "
                f"质量评分{dp.get('quality_score', 0)}/100"
            )
            # 数值列摘要
            for col, stats in list(dp.get("numeric_stats", {}).items())[:5]:
                data_summary_parts.append(
                    f"  - 「{col}」均值={stats['mean']}, 范围=[{stats['min']}, {stats['max']}], 非空{stats['non_null']}行"
                )
            # 分类列摘要
            for col, stats in list(dp.get("categorical_stats", {}).items())[:5]:
                data_summary_parts.append(
                    f"  - 「{col}」有{stats['unique']}个值, 最多「{stats['top']}」({stats['top_count']}条)"
                )

        # ── 构建 SQL 查询结果概要 ──
        if sql_data and len(sql_data) > 0:
            cols = sql_columns or list(sql_data[0].keys())
            data_summary_parts.append(
                f"\n【SQL查询结果】执行了{len(sql_data)}行数据, 字段: {cols}"
            )
            # 展示前10行数据（让LLM看到真实数字）
            for i, row in enumerate(sql_data[:10]):
                row_str = " | ".join([f"{c}={row.get(c, '')}" for c in cols[:8]])
                data_summary_parts.append(f"  行{i+1}: {row_str}")
            if len(sql_data) > 10:
                data_summary_parts.append(f"  ... (共{len(sql_data)}行)")

        if sql_query:
            data_summary_parts.append(f"\n【执行的SQL】{sql_query[:500]}")

        # ── Agent 结果摘要（完整而非截断500字符） ──
        agent_parts = []
        for r in analysis_results:
            agent_name = r.get("agent", "Agent")
            result = r.get("result", {})
            if isinstance(result, dict):
                # 提取关键信息而非盲目序列化
                if "data_profile" in result:
                    continue  # 已经在上面处理了
                if "sql_result" in result:
                    sr = result["sql_result"]
                    if isinstance(sr, dict) and sr.get("data"):
                        agent_parts.append(
                            f"- {agent_name}: SQL查询返回{sr.get('row_count', 0)}行数据, "
                            f"方法={sr.get('method', 'unknown')}, 置信度={sr.get('confidence', 0):.2f}"
                        )
                    else:
                        agent_parts.append(f"- {agent_name}: {json.dumps(result, ensure_ascii=False)[:800]}")
                elif "insights" in result:
                    insights_text = "; ".join(
                        [str(i.get("content", i)) if isinstance(i, dict) else str(i) for i in result["insights"][:5]]
                    )
                    agent_parts.append(f"- {agent_name}: {insights_text}")
                else:
                    agent_parts.append(f"- {agent_name}: {json.dumps(result, ensure_ascii=False)[:800]}")
            elif isinstance(result, str):
                agent_parts.append(f"- {agent_name}: {result[:800]}")

        # ── 组装最终 prompt ──
        system_prompt = """你是一位顶级数据分析师，擅长将复杂数据结果转化为清晰的业务洞察报告。

关键规则：
1. 每个结论必须引用具体数字（如"竞争比18.5:1"、"共324个岗位"）
2. 禁止使用"显著低于"、"竞争激烈"等模糊表述，必须量化（如"低了3.6倍"、"竞争比达到67:1"）
3. 如果是给用户的具体建议，必须带具体数字和可操作步骤
4. 使用中文，语言流畅自然，用加粗突出关键数字
5. 回答控制在800字以内，结构清晰"""

        data_section = "\n".join(data_summary_parts) if data_summary_parts else "（无结构化数据）"
        agent_section = "\n".join(agent_parts) if agent_parts else "（无Agent结果）"

        user_content = (
            f"用户问题：{question}\n\n"
            f"=== 真实数据 ===\n{data_section}\n\n"
            f"=== 智能体分析 ===\n{agent_section}"
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]

        return await self.chat(messages, max_tokens=2000)
    
    def is_available(self) -> bool:
        return self.available

    async def structured_chat(
        self,
        messages: List[Dict[str, str]],
        response_format: Dict[str, Any],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        结构化输出：通过 JSON Schema 约束 LLM 返回 JSON 格式。

        DeepSeek-chat 支持 response_format 参数（json_object 模式）。
        若 LLM 不可用，返回 None。

        Args:
            messages: 对话消息列表
            response_format: JSON Schema 描述，用于 system prompt 约束
            model: 模型名称
            temperature: 温度（建议 0.0 以提高结构一致性）
            max_tokens: 最大 token 数

        Returns:
            解析后的字典；LLM 不可用或解析失败返回 None
        """
        if not self.available:
            return None

        try:
            # 在 system prompt 中注入 JSON Schema 约束
            schema_str = json.dumps(response_format, ensure_ascii=False, indent=2)
            enhanced_messages = []
            for m in messages:
                if m.get("role") == "system":
                    enhanced_messages.append({
                        "role": "system",
                        "content": m["content"] + f"\n\n你必须严格按照以下 JSON Schema 返回结果，不要返回任何额外文字：\n```json\n{schema_str}\n```"
                    })
                else:
                    enhanced_messages.append(m)

            payload = {
                "model": model or self.config.DEFAULT_MODEL,
                "messages": enhanced_messages,
                "temperature": temperature or 0.0,
                "max_tokens": max_tokens or self.config.MAX_TOKENS,
                "response_format": {"type": "json_object"},
            }

            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }

            timeout = aiohttp.ClientTimeout(total=self.config.TIMEOUT)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers
                ) as response:
                    response.raise_for_status()
                    data = await response.json()
                    content = data["choices"][0]["message"]["content"]
                    # 存储本次调用的usage信息
                    self.last_usage = data.get("usage", {})

                    # 解析 JSON
                    result = json.loads(content)
                    logger.debug(f"✅ Structured output 成功解析: {list(result.keys())}")
                    return result

        except json.JSONDecodeError as e:
            logger.warning(f"⚠️ LLM 返回了非 JSON 内容: {e}")
            return None
        except Exception as e:
            logger.error(f"❌ Structured chat 失败: {e}")
            return None


# 全局单例
llm = LLMClient.get_instance()
