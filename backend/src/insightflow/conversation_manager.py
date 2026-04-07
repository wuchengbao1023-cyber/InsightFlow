"""
InsightFlow v4 — 对话管理器
==============================

核心职责：
1. 会话状态管理（文件、数据画像、对话历史）
2. 用户消息解析（意图识别 → 任务分解 → Agent选择）
3. 上下文维护（跨轮次对话记忆）
4. 报告生成编排

v4 核心变化：
- 从"上传即分析"改为"对话驱动"
- 用户提问后，编排器智能选择Agent并行执行
- Agent输出流式推送到前端（一个字一个字）
"""

import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


# ── Agent 角色定义 ──────────────────────────────────────────
AGENT_ROLES = {
    "DATA_ENGINEER": {
        "name": "数据工程师",
        "color": "#3B82F6",
        "description": "数据加载、清洗、结构分析",
        "icon": "database",
    },
    "DATA_ANALYST": {
        "name": "数据分析师",
        "color": "#10B981",
        "description": "统计分析、趋势识别、多维对比",
        "icon": "bar-chart",
    },
    "FORECAST_ANALYST": {
        "name": "预测分析师",
        "color": "#F59E0B",
        "description": "趋势预测、模型拟合、未来推演",
        "icon": "line-chart",
    },
    "STRATEGY_ADVISOR": {
        "name": "策略顾问",
        "color": "#8B5CF6",
        "description": "综合研判、战略建议、商业洞察",
        "icon": "lightbulb",
    },
    "QUALITY_REVIEWER": {
        "name": "质量审查员",
        "color": "#EF4444",
        "description": "数据验证、逻辑审查、事实核查",
        "icon": "shield-check",
    },
    "REPORT_EDITOR": {
        "name": "报告主编",
        "color": "#06B6D4",
        "description": "报告撰写、章节编排、格式规范",
        "icon": "file-text",
    },
}

# ── 意图 → Agent 映射（v5: 扩大参与度，让更多Agent协作） ──────────────────────────────────────
INTENT_AGENT_MAP = {
    # 描述性问题 → 3个Agent（数据工程师准备数据，数据分析师分析，报告主编记录）
    "descriptive": ["DATA_ENGINEER", "DATA_ANALYST", "REPORT_EDITOR"],
    # 比较性问题 → 3个Agent（多维对比需要数据+分析+策略）
    "comparative": ["DATA_ENGINEER", "DATA_ANALYST", "STRATEGY_ADVISOR"],
    # 趋势问题 → 4个Agent（数据+预测+策略+报告）
    "trend": ["DATA_ENGINEER", "DATA_ANALYST", "FORECAST_ANALYST", "STRATEGY_ADVISOR"],
    # 预测问题 → 4个Agent（基础数据+历史分析+预测+验证）
    "predictive": ["DATA_ANALYST", "FORECAST_ANALYST", "STRATEGY_ADVISOR", "QUALITY_REVIEWER"],
    # 因果问题 → 4个Agent（原因分析需要多角度）
    "causal": ["DATA_ANALYST", "FORECAST_ANALYST", "STRATEGY_ADVISOR", "QUALITY_REVIEWER"],
    # 探索性问题 → 4个Agent（探索需要发散思维）
    "exploratory": ["DATA_ANALYST", "FORECAST_ANALYST", "STRATEGY_ADVISOR", "REPORT_EDITOR"],
    # 排名问题 → 3个Agent（数据+排名+洞察）
    "ranking": ["DATA_ENGINEER", "DATA_ANALYST", "STRATEGY_ADVISOR"],
    # 分布问题 → 3个Agent（结构分析）
    "distribution": ["DATA_ENGINEER", "DATA_ANALYST", "REPORT_EDITOR"],
    # 相关性问题 → 4个Agent
    "correlation": ["DATA_ANALYST", "FORECAST_ANALYST", "STRATEGY_ADVISOR", "QUALITY_REVIEWER"],
    # 异常问题 → 4个Agent（异常需要数据+分析+质检）
    "anomaly": ["DATA_ENGINEER", "DATA_ANALYST", "QUALITY_REVIEWER", "STRATEGY_ADVISOR"],
    # 总结问题 → 全员参与（综合分析）
    "summary": ["DATA_ENGINEER", "DATA_ANALYST", "FORECAST_ANALYST", "STRATEGY_ADVISOR", "REPORT_EDITOR"],
    # 默认 → 至少4个Agent参与
    "default": ["DATA_ENGINEER", "DATA_ANALYST", "STRATEGY_ADVISOR", "REPORT_EDITOR"],
}

# 意图分类prompt
INTENT_CLASSIFIER_PROMPT = """你是一个意图分类器。根据用户的数据分析问题和数据概况，判断问题类型。

可选意图类型：
- descriptive: 描述性问题（平均值、总量、分布情况）
- comparative: 比较性问题（A和B哪个好、对比分析）
- trend: 趋势问题（增长率、变化趋势）
- predictive: 预测问题（未来趋势、预计值）
- causal: 因果问题（为什么、原因分析）
- exploratory: 探索性问题（有什么发现、洞察）
- ranking: 排名问题（最好的、最高的、TOP N）
- distribution: 分布问题（占比、构成、结构）
- correlation: 相关性问题（A和B的关系）
- anomaly: 异常问题（异常值、离群点）
- summary: 总结问题（综合分析、整体概况）

只返回意图类型英文词，不要其他文字。"""


class ConversationState:
    """对话会话状态"""

    def __init__(self):
        self.session_id: str = ""
        self.created_at: str = ""
        self.table_name: Optional[str] = None
        self.filename: Optional[str] = None
        self.chen_profile: Optional[Dict[str, Any]] = None  # 数据画像

        # ── 多文件支持 ──
        self.table_names: List[str] = []      # 多文件各自的表名
        self.file_names: List[str] = []       # 多文件各自的文件名
        self.merge_view: Optional[str] = None # 合并视图名
        self.is_multi_file: bool = False      # 是否多文件模式

        # 对话历史
        self.messages: List[Dict[str, Any]] = []  # {"role": "user"/"agent"/"system", "content": ..., "agent": ..., "round": int}
        self.round_number: int = 0

        # 当前分析状态
        self.current_question: Optional[str] = None
        self.current_intent: Optional[str] = None
        self.selected_agents: List[str] = []
        self.analysis_context: List[Dict[str, Any]] = []  # 当前轮次的分析上下文

        # 工作产物
        self.lin_precomputed: Optional[Dict[str, Any]] = None
        self.wang_results: Optional[Dict[str, Any]] = None

        # 统计
        self.token_tracker: Dict[str, Any] = {
            "calls": [],
            "total_input_tokens": 0,
            "total_output_tokens": 0,
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "table_name": self.table_name,
            "filename": self.filename,
            "is_multi_file": self.is_multi_file,
            "files_count": len(self.file_names) if self.is_multi_file else 1,
            "messages_count": len(self.messages),
            "round_number": self.round_number,
            "tokens": {
                "input": self.token_tracker["total_input_tokens"],
                "output": self.token_tracker["total_output_tokens"],
            },
        }


class ConversationManager:
    """
    对话管理器 — 管理会话状态、意图识别、Agent选择
    """

    def __init__(self):
        self.state = ConversationState()
        self._initialized = False

    def init_session(self, table_name: str, filename: str, chen_profile: Dict[str, Any],
                     table_names: List[str] = None, file_names: List[str] = None,
                     merge_view: str = None):
        """初始化会话（文件上传后调用）"""
        import uuid
        self.state = ConversationState()
        self.state.session_id = str(uuid.uuid4())[:8]
        self.state.created_at = datetime.now().isoformat()
        self.state.table_name = table_name
        self.state.filename = filename
        self.state.chen_profile = chen_profile
        self._initialized = True

        # 多文件模式
        if table_names and len(table_names) > 1:
            self.state.is_multi_file = True
            self.state.table_names = table_names
            self.state.file_names = file_names or []
            self.state.merge_view = merge_view

        # 持久化 session 到磁盘
        try:
            from .session_store import get_session_store
            store = get_session_store()
            store.save(
                session_id=self.state.session_id,
                table_name=table_name,
                filename=filename,
                chen_profile=chen_profile,
                table_names=table_names,
                file_names=file_names,
                merge_view=merge_view,
            )
        except Exception as e:
            logger.warning("[会话] 持久化保存失败（不影响使用）: %s", e)

        logger.info(f"[会话] 初始化: {self.state.session_id}, 表={table_name}, 多文件={self.state.is_multi_file}")

    def restore_session(self) -> bool:
        """从持久化存储恢复会话（服务重启后调用）"""
        try:
            from .session_store import get_session_store
            store = get_session_store()
            if not store.exists:
                return False

            # 验证 DuckDB 中是否真的还有这些表
            from ..core.duckdb_engine import get_duckdb_engine
            duck = get_duckdb_engine()
            tables = duck.list_tables()
            if store.table_name not in tables:
                logger.warning("[会话] Session 文件存在但 DuckDB 表不存在，清除 session")
                store.clear()
                return False

            self.state = ConversationState()
            self.state.session_id = store.session_id
            self.state.created_at = store._data.get("created_at", "")
            self.state.table_name = store.table_name
            self.state.filename = store.filename
            self.state.chen_profile = store.chen_profile
            self.state.is_multi_file = store.is_multi_file
            self.state.table_names = store.table_names
            self.state.file_names = store.file_names
            self.state.merge_view = store._data.get("merge_view")
            self._initialized = True

            logger.info("[会话] 从持久化恢复: %s, 表=%s, 文件=%s",
                       self.state.session_id, store.table_name, store.filename)
            return True
        except Exception as e:
            logger.warning("[会话] 恢复失败: %s", e)
            return False

    def is_ready(self) -> bool:
        """会话是否已初始化"""
        return self._initialized and self.state.chen_profile is not None

    def reset(self):
        """重置会话（同时清除持久化）"""
        self.state = ConversationState()
        self._initialized = False
        try:
            from .session_store import get_session_store
            get_session_store().clear()
        except Exception:
            pass

    async def classify_intent(self, question: str) -> str:
        """
        意图分类：纯规则匹配（关键词映射）。
        v4.2优化：去掉LLM分类调用，省5-8秒延迟。
        """
        return self._rule_based_intent(question)

    def _rule_based_intent(self, question: str) -> str:
        """基于关键词的意图分类（降级方案）"""
        q = question.lower()

        keywords_map = {
            "predictive": ["预测", "预计", "未来", "将会", "趋势走向"],
            "trend": ["趋势", "增长", "变化", "增速", "同比", "环比", "走势"],
            "comparative": ["对比", "比较", "哪个", "差异", "vs", "versus"],
            "ranking": ["最好", "最高", "最大", "TOP", "排名", "前十", "榜首"],
            "distribution": ["占比", "构成", "分布", "比例", "结构"],
            "anomaly": ["异常", "离群", "突变", "不正常"],
            "correlation": ["相关", "关联", "影响", "关系"],
            "causal": ["为什么", "原因", "导致", "因素"],
            "summary": ["总结", "概况", "整体", "综合"],
        }

        for intent, keywords in keywords_map.items():
            for kw in keywords:
                if kw in q:
                    return intent

        return "default"

    def select_agents(self, intent: str, question: str) -> List[str]:
        """
        根据意图选择需要参与的Agent。
        数据工程师永远在（基础数据保障）。
        """
        candidate_roles = INTENT_AGENT_MAP.get(intent, INTENT_AGENT_MAP["default"])

        # 检查是否有时间列（决定是否需要预测分析师）
        has_time = False
        if self.state.chen_profile:
            has_time = any(
                c.get("type") == "time" for c in self.state.chen_profile.get("columns", [])
            )

        selected = ["DATA_ENGINEER"]  # 基础保障，永远在
        for role in candidate_roles:
            if role == "FORECAST_ANALYST" and not has_time:
                continue  # 没有时间列就不需要预测分析师
            if role not in selected:
                selected.append(role)

        # 限制最多4个Agent并行（避免太多卡片）
        if len(selected) > 4:
            selected = selected[:4]

        self.state.selected_agents = selected
        logger.info(f"[会话] 意图={intent}, 选择Agent={selected}")

        return selected

    def build_analysis_messages(self, question: str) -> List[Dict[str, str]]:
        """
        构建传给Agent的LLM messages。
        包含：系统prompt + 数据概况 + 对话上下文 + 当前问题。
        """
        profile = self.state.chen_profile or {}

        # 数据概况
        shape = profile.get("shape", [0, 0])
        quality = profile.get("quality", {})
        columns = profile.get("columns", [])
        col_names = [c.get("name", "") for c in columns[:15]]

        data_overview = (
            f"## 数据概况\n"
            f"- 表名: {self.state.table_name}\n"
            f"- 规模: {shape[0]}行 × {shape[1]}列\n"
            f"- 质量评分: {quality.get('score', '?')}/100\n"
            f"- 字段: {', '.join(col_names)}\n"
        )

        # 关键指标
        numeric_stats = profile.get("numeric_stats", {})
        if numeric_stats:
            data_overview += "\n## 关键数值指标\n"
            for col, stats in list(numeric_stats.items())[:8]:
                data_overview += (
                    f"- {col}: 均值={stats.get('mean', '?')}, "
                    f"范围=[{stats.get('min', '?')}, {stats.get('max', '?')}], "
                    f"非空={stats.get('non_null', '?')}行\n"
                )

        # 分类字段
        cat_stats = profile.get("categorical_stats", {})
        if cat_stats:
            data_overview += "\n## 分类字段\n"
            for col, stats in list(cat_stats.items())[:5]:
                data_overview += (
                    f"- {col}: {stats.get('unique', '?')}个唯一值, "
                    f"最多「{stats.get('top', '?')}」({stats.get('top_count', '?')}条)\n"
                )

        # 构建messages
        system_prompt = (
            "你是一位专业的数据分析专家，正在参与团队协作分析。\n"
            "请基于提供的数据概况进行分析，给出有数据支撑的结论。\n"
            "规则：\n"
            "1. 每个结论必须引用具体数字\n"
            "2. 禁止使用模糊表述（如'显著'、'很大'），必须量化\n"
            "3. 如果需要其他Agent提供数据，用 @角色名 提及\n"
            "4. 用中文回答，结构清晰\n"
            f"\n{data_overview}"
        )

        messages = [{"role": "system", "content": system_prompt}]

        # 加入历史对话上下文（最近2轮摘要）
        recent = self.state.messages[-6:]  # 最近3条（用户+Agent各3条）
        for msg in recent:
            if msg.get("role") == "user":
                messages.append({"role": "user", "content": msg["content"]})
            elif msg.get("role") == "agent" and msg.get("content"):
                messages.append({"role": "assistant", "content": f"[{msg.get('agent', 'Agent')}]: {msg['content']}"})

        # 当前问题
        messages.append({"role": "user", "content": question})

        return messages

    def add_message(self, role: str, content: str, agent: Optional[str] = None, meta: Optional[Dict] = None):
        """追加一条消息到对话历史"""
        msg = {
            "role": role,
            "content": content,
            "agent": agent,
            "round": self.state.round_number,
            "timestamp": datetime.now().isoformat(),
            "meta": meta or {},
        }
        self.state.messages.append(msg)

    def get_context_for_report(self) -> Dict[str, Any]:
        """获取报告生成所需的完整上下文"""
        ctx = {
            "table_name": self.state.table_name,
            "filename": self.state.filename,
            "chen_profile": self.state.chen_profile,
            "lin_precomputed": self.state.lin_precomputed,
            "messages": self.state.messages,
            "rounds": self.state.round_number,
            "token_tracker": self.state.token_tracker,
        }
        if self.state.is_multi_file:
            ctx["is_multi_file"] = True
            ctx["file_names"] = self.state.file_names
            ctx["table_names"] = self.state.table_names
            ctx["merge_view"] = self.state.merge_view
        return ctx
