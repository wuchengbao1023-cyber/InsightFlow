"""
推理链溯源系统 (Reasoning Provenance)
=====================================

核心概念：
- Agent的每个结论都可追溯到：数据源 → SQL → 原始结果 → 计算逻辑
- DAG结构支持步骤间依赖
- 可自动检测矛盾结论
- 前端可渲染为可展开的溯源卡片

数据流：
    lin.py 分析规则 → 构建 ReasoningStep → 写入 ReasoningChain
    zhao.py 洞察生成 → 关联推理步骤（step_id）
    li.py 报告生成 → 嵌入推理链（可折叠卡片）
    前端 components → 渲染溯源卡片
"""

import json
import logging
from typing import Dict, Any, List, Optional, Set
from datetime import datetime

logger = logging.getLogger(__name__)


class ReasoningStep:
    """
    单个推理步骤 — 从数据到结论的完整链路。
    
    Example:
        step = ReasoningStep(
            agent="老林",
            claim="Q3销售额同比增长23%",
            method="sql_analysis",
            sql="SELECT quarter, SUM(amount) FROM sales GROUP BY quarter",
            raw_result=[{"quarter":1,"sum":120}, {"quarter":2,"sum":135}, ...],
            computation="(166-135)/135 = 23%",
            source_columns=["quarter", "amount"],
            confidence=0.95,
            rule="A",
        )
    """
    _counter = 0

    def __init__(
        self,
        agent: str,
        claim: str,
        method: str = "code_analysis",
        sql: Optional[str] = None,
        raw_result: Any = None,
        computation: Optional[str] = None,
        source_columns: Optional[List[str]] = None,
        confidence: float = 0.9,
        rule: Optional[str] = None,
        step_id: Optional[int] = None,
        parent_step: Optional[int] = None,
        chart_type: Optional[str] = None,
        title: Optional[str] = None,
    ):
        ReasoningStep._counter += 1
        self.step_id = step_id if step_id is not None else ReasoningStep._counter
        self.agent = agent
        self.claim = claim
        self.method = method  # "sql_analysis" / "code_analysis" / "llm_reasoning"
        self.sql = sql
        self.raw_result = raw_result
        self.computation = computation  # 人类可读的计算过程
        self.source_columns = source_columns or []
        self.confidence = confidence
        self.rule = rule  # lin.py的规则标识（A/B/C/D/E/F）
        self.parent_step = parent_step  # 上游步骤ID（DAG依赖）
        self.chart_type = chart_type  # 图表类型（line/bar/scatter/pie）
        self.title = title
        self.created_at = datetime.now().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "step_id": self.step_id,
            "agent": self.agent,
            "claim": self.claim,
            "method": self.method,
            "confidence": self.confidence,
            "source_columns": self.source_columns,
            "rule": self.rule,
            "created_at": self.created_at,
        }
        if self.sql:
            d["sql"] = self.sql
        if self.computation:
            d["computation"] = self.computation
        if self.title:
            d["title"] = self.title
        if self.chart_type:
            d["chart_type"] = self.chart_type
        if self.parent_step is not None:
            d["parent_step"] = self.parent_step
        # raw_result只保留摘要（避免太大）
        if self.raw_result is not None:
            d["result_preview"] = self._preview_result()
            d["result_rows"] = len(self.raw_result) if isinstance(self.raw_result, list) else 1
        return d

    def to_full_dict(self) -> Dict[str, Any]:
        """完整序列化（含raw_result，用于调试）"""
        d = self.to_dict()
        d["raw_result"] = self.raw_result
        return d

    def _preview_result(self) -> str:
        """生成原始结果的预览文本"""
        if not self.raw_result:
            return "无结果"
        if isinstance(self.raw_result, list):
            if len(self.raw_result) <= 3:
                return str(self.raw_result)
            return f"[{len(self.raw_result)}行数据] 前3行: {str(self.raw_result[:3])}"
        return str(self.raw_result)[:200]


class ReasoningChain:
    """
    推理链 — 管理分析过程中产生的所有推理步骤。
    
    支持：
    - 添加步骤（构建DAG）
    - 按agent/claim查找
    - 矛盾检测
    - 序列化为前端可渲染格式
    """

    def __init__(self):
        self.steps: List[ReasoningStep] = []
        self._analysis_domain: str = ""

    def set_domain(self, domain: str):
        """设置分析领域"""
        self._analysis_domain = domain

    @classmethod
    def reset_counter(cls):
        """重置步骤计数器（每次新分析前调用）"""
        ReasoningStep._counter = 0

    def add_step(self, step: ReasoningStep) -> int:
        """添加推理步骤，返回step_id"""
        self.steps.append(step)
        logger.debug(
            f"[推理链] #{step.step_id} {step.agent}: {step.claim[:50]}... "
            f"(method={step.method}, confidence={step.confidence})"
        )
        return step.step_id

    def add_from_analysis(
        self,
        agent: str = "老林",
        title: str = "",
        summary: str = "",
        rule: str = "",
        sql: Optional[str] = None,
        raw_result: Any = None,
        computation: Optional[str] = None,
        source_columns: Optional[List[str]] = None,
        chart_type: Optional[str] = None,
        confidence: Optional[float] = None,
    ) -> int:
        """
        从老林的分析结果快捷创建推理步骤。
        
        这是lin.py → reasoning_chain的主要接口。
        """
        step = ReasoningStep(
            agent=agent,
            claim=summary or title,
            method="sql_analysis" if sql else "code_analysis",
            sql=sql,
            raw_result=raw_result,
            computation=computation,
            source_columns=source_columns,
            confidence=confidence or 0.9,
            rule=rule,
            chart_type=chart_type,
            title=title,
        )
        return self.add_step(step)

    def get_steps_by_agent(self, agent: str) -> List[ReasoningStep]:
        """获取某Agent的所有推理步骤"""
        return [s for s in self.steps if s.agent == agent]

    def find_by_claim(self, keyword: str) -> List[ReasoningStep]:
        """按claim关键词查找"""
        return [s for s in self.steps if keyword.lower() in s.claim.lower()]

    def get_step(self, step_id: int) -> Optional[ReasoningStep]:
        """按ID获取步骤"""
        for s in self.steps:
            if s.step_id == step_id:
                return s
        return None

    def detect_contradictions(self) -> List[Dict[str, Any]]:
        """
        检测矛盾结论。
        
        简单策略：同一个Agent对同一组source_columns的不同结论中，
        如果数值方向相反（一个说上升一个说下降），标记为矛盾。
        
        Returns:
            [{"step_a": int, "step_b": int, "description": str}]
        """
        contradictions = []

        # 按source_columns分组
        from collections import defaultdict
        col_groups: Dict[str, List[ReasoningStep]] = defaultdict(list)
        for step in self.steps:
            if step.source_columns:
                key = ",".join(sorted(step.source_columns))
                col_groups[key].append(step)

        # 检测方向性矛盾
        direction_keywords_up = ["上升", "增长", "增加", "提高", "提升", "上升", "涨"]
        direction_keywords_down = ["下降", "减少", "降低", "下滑", "下跌", "降"]

        for col_key, steps in col_groups.items():
            if len(steps) < 2:
                continue
            for i, step_a in enumerate(steps):
                for step_b in steps[i + 1:]:
                    a_up = any(kw in step_a.claim for kw in direction_keywords_up)
                    a_down = any(kw in step_a.claim for kw in direction_keywords_down)
                    b_up = any(kw in step_b.claim for kw in direction_keywords_up)
                    b_down = any(kw in step_b.claim for kw in direction_keywords_down)

                    if (a_up and b_down) or (a_down and b_up):
                        contradictions.append({
                            "step_a": step_a.step_id,
                            "step_b": step_b.step_id,
                            "claim_a": step_a.claim,
                            "claim_b": step_b.claim,
                            "description": (
                                f"{step_a.agent}的#{step_a.step_id}和#{step_b.step_id} "
                                f"关于{col_key}的结论方向矛盾"
                            ),
                        })

        return contradictions

    def validate(self) -> Dict[str, Any]:
        """
        验证推理链完整性。
        
        Returns:
            {
                "valid": bool,
                "total_steps": int,
                "agents_used": list,
                "contradictions": list,
                "low_confidence": list,
                "orphan_steps": list,
            }
        """
        contradictions = self.detect_contradictions()

        # 低置信度步骤
        low_confidence = [
            s.to_dict() for s in self.steps if s.confidence < 0.7
        ]

        # 孤儿步骤（parent_step引用了不存在的步骤）
        step_ids = {s.step_id for s in self.steps}
        orphans = [
            s.to_dict() for s in self.steps
            if s.parent_step is not None and s.parent_step not in step_ids
        ]

        agents_used = list(set(s.agent for s in self.steps))

        return {
            "valid": len(contradictions) == 0 and len(orphans) == 0,
            "total_steps": len(self.steps),
            "agents_used": agents_used,
            "contradictions": contradictions,
            "low_confidence": low_confidence,
            "orphan_steps": orphans,
        }

    def to_dict(self) -> Dict[str, Any]:
        """序列化为字典（不含raw_result）"""
        return {
            "domain": self._analysis_domain,
            "total_steps": len(self.steps),
            "steps": [s.to_dict() for s in self.steps],
            "validation": self.validate(),
        }

    def to_full_dict(self) -> Dict[str, Any]:
        """完整序列化（含raw_result）"""
        return {
            "domain": self._analysis_domain,
            "total_steps": len(self.steps),
            "steps": [s.to_full_dict() for s in self.steps],
            "validation": self.validate(),
        }

    def to_html_cards(self) -> str:
        """
        生成前端可渲染的溯源卡片HTML。
        每个推理步骤是一个可折叠的卡片。
        """
        if not self.steps:
            return ""

        cards = []
        for step in self.steps:
            conf_color = (
                "#10B981" if step.confidence >= 0.8
                else "#F59E0B" if step.confidence >= 0.6
                else "#EF4444"
            )

            sql_section = ""
            if step.sql:
                sql_section = f"""
                <details class="provenance-sql">
                    <summary>SQL查询</summary>
                    <pre><code>{step.sql}</code></pre>
                </details>"""

            result_section = ""
            if step.raw_result:
                preview = step._preview_result()
                result_section = f"""
                <details class="provenance-result">
                    <summary>原始结果 ({len(step.raw_result) if isinstance(step.raw_result, list) else '?'}行)</summary>
                    <pre><code>{preview}</code></pre>
                </details>"""

            computation_section = ""
            if step.computation:
                computation_section = f"""
                <div class="provenance-computation">
                    <span class="label">计算过程:</span> {step.computation}
                </div>"""

            card = f"""
            <div class="provenance-card" data-step="{step.step_id}" data-agent="{step.agent}">
                <div class="provenance-header">
                    <span class="provenance-badge" style="background:{conf_color}">
                        #{step.step_id} {step.agent}
                    </span>
                    <span class="provenance-confidence">置信度 {step.confidence:.0%}</span>
                    {f'<span class="provenance-rule">规则{step.rule}</span>' if step.rule else ''}
                </div>
                <div class="provenance-claim">{step.claim}</div>
                {computation_section}
                {sql_section}
                {result_section}
                {f'<div class="provenance-columns">数据源: {", ".join(step.source_columns)}</div>' if step.source_columns else ''}
            </div>"""
            cards.append(card)

        contradictions = self.detect_contradictions()
        warning_html = ""
        if contradictions:
            warning_items = "\n".join(
                f"<li>{c['description']}</li>" for c in contradictions
            )
            warning_html = f"""
            <div class="provenance-warning">
                ⚠️ 检测到 {len(contradictions)} 处方向矛盾：
                <ul>{warning_items}</ul>
            </div>"""

        css = """
        <style>
        .provenance-card { border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin:8px 0; }
        .provenance-header { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
        .provenance-badge { padding:2px 8px; border-radius:4px; color:white; font-size:12px; font-weight:600; }
        .provenance-confidence { font-size:12px; color:#64748b; }
        .provenance-rule { font-size:11px; color:#94A3B8; background:#f1f5f9; padding:1px 6px; border-radius:3px; }
        .provenance-claim { font-size:14px; color:#1e293b; margin-bottom:6px; }
        .provenance-computation { font-size:12px; color:#475569; background:#f8fafc; padding:4px 8px; border-radius:4px; margin:4px 0; }
        .provenance-computation .label { font-weight:600; color:#334155; }
        .provenance-sql, .provenance-result { margin:4px 0; }
        .provenance-sql summary, .provenance-result summary { font-size:12px; color:#3B82F6; cursor:pointer; }
        .provenance-sql pre, .provenance-result pre { background:#1e293b; color:#e2e8f0; padding:8px; border-radius:6px; font-size:12px; overflow-x:auto; }
        .provenance-columns { font-size:11px; color:#94A3B8; margin-top:4px; }
        .provenance-warning { background:#FEF3C7; border:1px solid #F59E0B; border-radius:8px; padding:12px; margin:12px 0; }
        .provenance-warning ul { margin:4px 0; padding-left:20px; }
        .provenance-warning li { font-size:13px; color:#92400E; }
        </style>"""

        return f"""{css}{warning_html}{chr(10).join(cards)}"""


# ── 单例（每次分析重置） ──────────────────────────────────
_reasoning_chain: Optional[ReasoningChain] = None


def get_reasoning_chain() -> ReasoningChain:
    global _reasoning_chain
    if _reasoning_chain is None:
        _reasoning_chain = ReasoningChain()
    return _reasoning_chain


def reset_reasoning_chain():
    """重置推理链（每次新分析前调用）"""
    global _reasoning_chain
    ReasoningStep._counter = 0
    _reasoning_chain = ReasoningChain()
