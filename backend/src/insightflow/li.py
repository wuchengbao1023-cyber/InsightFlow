"""
小李 - 报告主编 (ReportEditor) v2
==================================

职责：把五个人的产出 + 质检记录 + 成本追踪组装成最终报告JSON。

v2升级：
1. 报告末尾增加「质检记录」板块
2. 报告增加「数字溯源」板块
3. 报告增加「AI运行成本」板块

报告结构：
1. 核心指标卡（数字+图标）
2. 关键发现（过去/现在/未来/建议洞察列表）
3. 图表区（老林+老王的所有分析）
4. 策略建议（小赵的advice类洞察）
5. 数据质量说明
6. 质检记录（新增）
7. 数字溯源（新增）
8. AI运行成本（新增）
9. 完整数据表（可排序）
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class ReportEditor:
    """小李 - 报告主编：只做组装，不创作"""

    def __init__(self):
        self.name = "小李"
        self.role = "报告主编"
        logger.info(f"📝 {self.name}({self.role}) 上线")

    async def compile(
        self,
        chen_profile: Dict[str, Any],
        lin_result: Dict[str, Any],
        zhao_result: Dict[str, Any],
        qa_history: Optional[List[Dict[str, Any]]] = None,
        cost_tracker: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        组装最终报告。

        Args:
            chen_profile: 老陈的画像
            lin_result: 老林+老王的分析结果
            zhao_result: 小赵的洞察
            qa_history: 质检历史记录
            cost_tracker: Token成本追踪器

        Returns:
            完整报告JSON，前端直接渲染
        """
        logger.info(f"[小李] 开始组装报告: {chen_profile.get('file', '?')}")

        analyses = lin_result.get("analyses", [])
        insights = zhao_result.get("insights", [])
        contradictions = zhao_result.get("contradictions", [])
        quality_notes = zhao_result.get("data_quality_notes", [])
        shape = chen_profile.get("shape", [0, 0])
        quality = chen_profile.get("quality", {})

        # ── 1. 核心指标卡 ──────────────────────────────────────────────
        metric_cards = self._build_metric_cards(chen_profile, lin_result)

        # ── 2. 洞察列表（分类） ─────────────────────────────────────────
        past_insights = [i for i in insights if i.get("category") == "过去"]
        present_insights = [i for i in insights if i.get("category") == "现在"]
        future_insights = [i for i in insights if i.get("category") == "未来"]
        advice_insights = [i for i in insights if i.get("category") == "建议"]

        # ── 3. 图表数据 ─────────────────────────────────────────────────
        charts = self._build_charts(analyses)

        # ── 4. 数据表（可排序） ─────────────────────────────────────────
        data_table = self._build_data_table(chen_profile, analyses)

        # ── 5. 一致性校验（数字对比） ─────────────────────────────────
        consistency_flags = self._check_consistency(insights, contradictions)

        # ── 6. 质检记录（新增） ──────────────────────────────────────
        qa_report = self._build_qa_report(qa_history)

        # ── 7. 数字溯源（新增） ──────────────────────────────────────
        number_trace = self._build_number_trace(chen_profile, lin_result, insights)

        # ── 8. AI运行成本（新增） ────────────────────────────────────
        cost_report = self._build_cost_report(cost_tracker)

        # ── 报告标题 ──────────────────────────────────────────────────
        file_name = chen_profile.get("file", "数据")
        time_range = self._extract_time_range(chen_profile)
        subtitle_parts = [f"共{shape[0]}行数据"]
        if time_range:
            subtitle_parts.append(time_range)
        if quality.get("score"):
            subtitle_parts.append(f"数据质量{quality['score']:.0f}分")

        report = {
            "title": self._make_title(file_name),
            "subtitle": " · ".join(subtitle_parts),
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "file_name": file_name,
            "sections": [
                {
                    "type": "metrics",
                    "title": "核心指标",
                    "cards": metric_cards
                },
                {
                    "type": "insights",
                    "title": "关键发现",
                    "categories": {
                        "过去": past_insights,
                        "现在": present_insights,
                        "未来": future_insights,
                        "建议": advice_insights
                    },
                    "all": insights
                },
                {
                    "type": "charts",
                    "title": "数据分析",
                    "items": charts
                },
                {
                    "type": "advice",
                    "title": "策略建议",
                    "items": advice_insights
                },
                {
                    "type": "quality",
                    "title": "数据说明",
                    "notes": quality_notes,
                    "warnings": chen_profile.get("warnings", []),
                    "quality_score": quality.get("score"),
                    "contradictions": contradictions,
                    "consistency_flags": consistency_flags
                },
                {
                    "type": "qa_record",
                    "title": "质检记录",
                    "record": qa_report
                },
                {
                    "type": "number_trace",
                    "title": "数字溯源",
                    "trace": number_trace
                },
                {
                    "type": "cost_report",
                    "title": "AI运行成本",
                    "cost": cost_report
                },
                {
                    "type": "data_table",
                    "title": "数据明细",
                    **data_table
                }
            ],
            # 元数据（前端可用来展示执行过程）
            "_meta": {
                "agents": ["老陈", "老林", "老王", "小赵", "质检官", "小李"],
                "analyses_count": len(analyses),
                "insights_count": len(insights),
                "contradictions_count": len(contradictions),
                "quality_score": quality.get("score"),
                "forecasted_count": lin_result.get("_forecaster_summary", {}).get("forecasted", 0),
                "qa_rounds": len(qa_history) if qa_history else 0,
                "qa_final_score": qa_history[-1]["score"] if qa_history else None,
                "qa_passed": qa_history[-1]["passed"] if qa_history else True,
                "total_tokens": (cost_tracker.get("total_input_tokens", 0) +
                                 cost_tracker.get("total_output_tokens", 0)) if cost_tracker else 0
            }
        }

        logger.info(
            f"[小李] 报告组装完成: {len(metric_cards)}张指标卡, "
            f"{len(charts)}张图表, {len(insights)}条洞察, "
            f"{len(consistency_flags)}个一致性标注, "
            f"质检{len(qa_history) if qa_history else 0}轮"
        )
        return report

    async def compile_discussion(
        self,
        chen_profile: Dict[str, Any],
        lin_result: Dict[str, Any],
        discussion_context: List[Dict[str, Any]],
        consensus: Optional[List[Dict[str, Any]]] = None,
        cost_tracker: Optional[Dict[str, Any]] = None,
        qa_history: Optional[List[Dict[str, Any]]] = None,
        task: str = "数据分析"
    ) -> Dict[str, Any]:
        """
        讨论室模式：基于讨论上下文生成讨论纪要报告。
        与compile()的区别：洞察来源是讨论共识而非小赵的advise()。

        Args:
            chen_profile: 老陈的数据画像
            lin_result: 老林的预计算结果
            discussion_context: 完整讨论上下文（所有Agent发言）
            consensus: 小赵共识确认的结构化结果 [{text, source, qa_status}]
            cost_tracker: Token成本追踪器
            qa_history: 质检历史记录 [{round, score, passed, issues_count, issues_summary}]
            task: 用户提出的任务

        Returns:
            含讨论纪要section的报告JSON
        """
        logger.info(f"[小李] 开始生成讨论纪要: {chen_profile.get('file', '?')}")

        analyses = lin_result.get("analyses", [])
        shape = chen_profile.get("shape", [0, 0])
        quality = chen_profile.get("quality", {})

        # ── 从讨论上下文提取洞察（替代小赵的insights）──
        insights = []
        if consensus:
            for c in consensus:
                category = self._infer_category(c.get("text", ""))
                insights.append({
                    "text": c.get("text", ""),
                    "category": category,
                    "ref": {"agent": c.get("source", "讨论"), "finding": c.get("text", "")},
                    "qa_status": c.get("qa_status", "unknown"),
                    "source": "讨论共识"
                })

        # 如果没有共识结构，从context里提取
        if not insights:
            for msg in discussion_context:
                role = msg.get("role", "")
                if msg.get("is_system") or role in ("user", "system"):
                    continue
                content = msg.get("content", "")
                # 过滤：跳过太短的发言和纯工具性输出
                if len(content) > 30 and not content.startswith("{"):
                    category = self._infer_category(content)
                    insights.append({
                        "text": content,
                        "category": category,
                        "ref": {"agent": role, "finding": content[:50]},
                        "source": "讨论记录"
                    })

        # 去重（相似文本只保留第一条）
        seen = set()
        unique_insights = []
        for ins in insights:
            key = ins["text"][:30]
            if key not in seen:
                seen.add(key)
                unique_insights.append(ins)
        insights = unique_insights

        # 分类
        past_insights = [i for i in insights if i.get("category") == "过去"]
        present_insights = [i for i in insights if i.get("category") == "现在"]
        future_insights = [i for i in insights if i.get("category") == "未来"]
        advice_insights = [i for i in insights if i.get("category") == "建议"]

        # ── 构建讨论纪要（LLM精炼，async）──
        discussion_summary = await self._build_discussion_summary(discussion_context, consensus)

        # ── 构建其他板块 ──
        metric_cards = self._build_metric_cards(chen_profile, lin_result)
        charts = self._build_charts(analyses)
        data_table = self._build_data_table(chen_profile, analyses)
        number_trace = self._build_number_trace(chen_profile, lin_result, insights)
        cost_report = self._build_cost_report(cost_tracker)
        qa_report = self._build_qa_report(qa_history)

        # ── 报告标题 ──
        file_name = chen_profile.get("file", "数据")
        time_range = self._extract_time_range(chen_profile)
        subtitle_parts = [f"共{shape[0]}行数据"]
        if time_range:
            subtitle_parts.append(time_range)
        if quality.get("score"):
            subtitle_parts.append(f"数据质量{quality['score']:.0f}分")

        report = {
            "title": self._make_title(file_name),
            "subtitle": " · ".join(subtitle_parts),
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "file_name": file_name,
            "summary": discussion_summary.get("summary", ""),  # 前端核心结论区直接渲染
            "sections": [
                {
                    "type": "discussion_summary",
                    "title": "讨论纪要",
                    **discussion_summary
                },
                {
                    "type": "metrics",
                    "title": "核心指标",
                    "cards": metric_cards
                },
                {
                    "type": "insights",
                    "title": "讨论共识",
                    "categories": {
                        "过去": past_insights,
                        "现在": present_insights,
                        "未来": future_insights,
                        "建议": advice_insights
                    },
                    "all": insights
                },
                {
                    "type": "charts",
                    "title": "数据分析",
                    "items": charts
                },
                {
                    "type": "advice",
                    "title": "策略建议",
                    "items": advice_insights
                },
                {
                    "type": "quality",
                    "title": "数据说明",
                    "notes": chen_profile.get("warnings", []),
                    "quality_score": quality.get("score"),
                    "contradictions": [],
                    "consistency_flags": []
                },
                {
                    "type": "number_trace",
                    "title": "数字溯源",
                    "trace": number_trace
                },
                {
                    "type": "qa_record",
                    "title": "质检记录",
                    **qa_report
                },
                {
                    "type": "cost_report",
                    "title": "AI运行成本",
                    "cost": cost_report
                },
                {
                    "type": "data_table",
                    "title": "数据明细",
                    **data_table
                }
            ],
            "_meta": {
                "agents": ["老陈", "老林", "小赵", "质检官", "小李"],
                "analyses_count": len(analyses),
                "insights_count": len(insights),
                "discussion_rounds": max((m.get("round", 0) for m in discussion_context), default=0),
                "total_messages": len([m for m in discussion_context if not m.get("is_system")]),
                "consensus_count": len(consensus) if consensus else 0,
                "mode": "discussion",
                "total_tokens": (cost_tracker.get("total_input_tokens", 0) +
                                 cost_tracker.get("total_output_tokens", 0)) if cost_tracker else 0
            }
        }

        logger.info(
            f"[小李] 讨论纪要生成完成: {len(insights)}条共识, "
            f"{len(charts)}张图表, {len(discussion_context)}条讨论记录"
        )
        return report

    async def _build_discussion_summary(
        self,
        context: List[Dict[str, Any]],
        consensus: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """构建讨论纪要摘要section（含summary字段供前端直接渲染）
        
        v5.2 改进：使用LLM精炼summary和key_points，而非简单截断拼接。
        采用 Anthropic 协调者-工作者模式灵感：LLM作为"总结者"聚合所有Agent输出。
        """
        # 提取讨论参与者
        participants = list(set(
            m.get("role", "") for m in context
            if m.get("role") and m.get("role") != "system" and not m.get("is_system")
        ))

        # 提取讨论轮次
        rounds = max((m.get("round", 0) for m in context), default=0)
        total_messages = len([m for m in context if not m.get("is_system")])

        # ── 提取有意义的发言（供LLM精炼）──
        meaningful_messages = []
        for msg in context:
            if msg.get("is_system") or msg.get("role") == "system":
                continue
            content = msg.get("content", "")
            role = msg.get("role", "")
            if len(content) > 30 and role not in ("user",):
                meaningful_messages.append({"role": role, "content": content})

        # ── LLM 精炼 summary（核心改进）──
        summary = ""
        key_points = []
        try:
            from ..utils.llm_client import llm

            # 构建精炼prompt：让LLM从讨论中提取核心结论
            if meaningful_messages:
                # 截取每个Agent的关键发言（避免prompt过长）
                agent_texts = []
                seen_roles = set()
                for m in meaningful_messages:
                    if m["role"] not in seen_roles:
                        seen_roles.add(m["role"])
                        agent_texts.append(f"【{m['role']}】{m['content'][:800]}")
                    elif len(agent_texts) < 8:  # 每个Agent最多2条发言
                        agent_texts.append(f"【{m['role']}】{m['content'][:400]}")

                refinement_prompt = f"""你是一位资深数据分析师，请基于以下多位AI专家的讨论，提炼出**3-5条核心结论**。

要求：
1. 每条结论必须包含具体数据支撑（数字、百分比、趋势等）
2. 用简洁有力的语言，不超过100字/条
3. 去除重复和模糊表述
4. 按重要性排序
5. 如果讨论中有预测、建议、风险提醒，分别标注类型

## 专家讨论记录
{chr(10).join(agent_texts[:10])}

## 请输出JSON格式
{{"conclusions": [{{"text": "结论内容", "type": "发现/预测/建议/风险"}}]}}
"""

                llm_response = await llm.chat(
                    [{"role": "user", "content": refinement_prompt}],
                    model="deepseek-chat",
                    temperature=0.3,
                    max_tokens=1000,
                )

                # 解析 LLM 结构化输出
                try:
                    # 尝试提取JSON
                    json_match = __import__('re').search(r'\{[\s\S]*\}', llm_response)
                    if json_match:
                        parsed = json.loads(json_match.group())
                        conclusions = parsed.get("conclusions", [])
                        if conclusions:
                            summary_parts = []
                            for c in conclusions[:5]:
                                text = c.get("text", "")
                                c_type = c.get("type", "")
                                prefix = {"预测": "🔮", "建议": "💡", "风险": "⚠️"}.get(c_type, "📊")
                                summary_parts.append(f"{prefix} {text}")
                                key_points.append({
                                    "agent": "AI总结",
                                    "text": text,
                                    "type": c_type,
                                })
                            summary = "\n\n".join(summary_parts)
                except (json.JSONDecodeError, AttributeError) as e:
                    logger.warning(f"[小李] LLM输出解析失败，回退到规则拼接: {e}")

        except Exception as e:
            logger.warning(f"[小李] LLM精炼失败，回退到规则拼接: {e}")

        # ── 回退：规则拼接（保持向后兼容）──
        if not summary:
            if consensus:
                summary_parts = []
                for c in consensus[:5]:
                    text = c.get("text", "")
                    if text:
                        summary_parts.append(f"• {text[:200]}")
                summary = "\n\n".join(summary_parts) if summary_parts else "分析已完成，请查看各章节的详细内容。"
            elif meaningful_messages:
                summary_parts = []
                for m in meaningful_messages[:5]:
                    role = m["role"]
                    content = m["content"]
                    brief = content[:200] + ("..." if len(content) > 200 else "")
                    summary_parts.append(f"**{role}**：{brief}")
                summary = "\n\n".join(summary_parts)
            else:
                summary = "分析已完成，请查看各章节的详细内容。"

        # ── 回退：key_points 规则拼接 ──
        if not key_points:
            for m in meaningful_messages[:8]:
                content = m["content"]
                brief = content[:80] + ("..." if len(content) > 80 else "")
                key_points.append({"agent": m["role"], "text": brief})

        # 提取讨论过程（用于前端展示完整对话）
        messages = []
        for msg in context:
            if msg.get("is_system"):
                continue
            role = msg.get("role", "")
            messages.append({
                "agent": role,
                "message": msg.get("content", ""),
                "round": msg.get("round", 0),
                "mentions": msg.get("mentions", []),
                "meta": msg.get("meta", {}),
                "time": msg.get("timestamp", "")
            })

        # 提取被修正的发言（质检质疑→Agent修正的记录）
        corrections = []
        for msg in context:
            meta = msg.get("meta", {})
            if meta.get("corrected"):
                corrections.append({
                    "agent": msg.get("role", ""),
                    "message": msg.get("content", "")[:100]
                })

        return {
            "summary": summary,  # LLM精炼的核心结论
            "participants": participants,
            "rounds": rounds,
            "total_rounds": rounds,
            "total_messages": total_messages,
            "corrections_count": len(corrections),
            "corrections": corrections,
            "consensus": consensus or [],
            "consensus_text": "\n".join(c.get("text", "") for c in (consensus or [])[:3]) if consensus else "",
            "key_points": key_points,  # LLM精炼的关键要点
            "unresolved": [],
            "messages": messages  # 完整对话记录给前端用
        }

    async def compile_professional_report(
        self,
        question: str,
        chen_profile: Dict[str, Any],
        lin_result: Dict[str, Any],
        agent_results: Dict[str, Dict[str, Any]],
        debate_result: Optional[Dict[str, Any]] = None,
        cost_tracker: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        v6 专业报告模式 — 麦肯锡式精炼报告。

        与 compile_discussion 的本质区别：
        - compile_discussion: 把讨论记录拼接到报告里 → 2万字流水账
        - compile_professional_report: 用LLM把所有Agent结论精炼成专业报告 → 2000字精炼报告

        报告结构（对标意见.txt愿景）：
        1. 核心结论（3-5条，结论先行）
        2. 数据支撑（图表+指标卡）
        3. 分析论证（逻辑推演，而非聊天记录）
        4. 风险提示
        5. 策略建议
        6. 溯源面板（可折叠，默认隐藏辩论过程）

        Args:
            question: 用户原始问题
            chen_profile: 老陈的数据画像
            lin_result: 老林的预计算结果
            agent_results: {role: {"content": "最终结论", "_debate_history": [...], ...}}
            debate_result: 辩论结果（可选，用于溯源面板）
            cost_tracker: Token成本追踪器

        Returns:
            精炼报告JSON
        """
        logger.info(f"[小李v6] 开始生成专业报告: {question[:50]}...")

        analyses = lin_result.get("analyses", [])
        shape = chen_profile.get("shape", [0, 0])
        quality = chen_profile.get("quality", {})

        # ── 1. 收集所有Agent的最终结论（精炼版，不含辩论过程）──
        agent_conclusions = {}
        for role, result in agent_results.items():
            if role in ("QUALITY_REVIEWER", "REPORT_EDITOR"):
                continue
            content = result.get("content", result.get("full_text", ""))
            if content and len(content) > 20:
                agent_conclusions[role] = content

        # ── 2. 构建图表和指标（与之前一致）──
        metric_cards = self._build_metric_cards(chen_profile, lin_result)
        charts = self._build_charts(analyses)
        data_table = self._build_data_table(chen_profile, analyses)
        number_trace = self._build_number_trace(chen_profile, lin_result, [])
        cost_report = self._build_cost_report(cost_tracker)

        # ── 3. LLM 生成专业报告（核心改进！）──
        professional_body = {}
        try:
            from ..utils.llm_client import llm

            # 构建Agent结论摘要（每个Agent最多600字）
            conclusions_text = []
            for role, content in agent_conclusions.items():
                conclusions_text.append(f"### {role}\n{content[:600]}")

            # 辩论修正摘要
            debate_summary = ""
            if debate_result:
                verdict = debate_result.get("final_verdict", "")
                rounds = debate_result.get("total_rounds", 0)
                corrections = debate_result.get("corrections_made", 0)
                debate_summary = f"经过{rounds}轮辩论审查，{verdict}，共修正{corrections}处问题。"

            professional_prompt = f"""你是一位资深商业分析师，请基于以下AI分析团队的最终结论，撰写一份**精炼的专业分析报告**。

## 用户问题
{question}

## 数据概况
共{shape[0]}行数据，{shape[1]}列。数据质量评分{quality.get('score', '未知')}分。

## 各分析师的最终结论（已经过辩论审查和修正）
{chr(10).join(conclusions_text[:6])}

{f"## 辩论审查结果{chr(10)}{debate_summary}" if debate_summary else ""}

## 报告要求（极其重要）
1. **结论先行**：用一段话（100字以内）直接回答用户问题
2. **核心发现**：3-5条关键发现，每条必须包含具体数据
3. **分析论证**：逻辑严密的数据分析，引用具体数字
4. **风险提示**：如果有潜在风险，明确指出
5. **策略建议**：基于数据的具体建议
7. **不要使用Markdown格式**（不要用**粗体**、##标题、- 列表等），用纯文本
8. **总长度控制在800-1500字**（不要灌水！）
9. 语言风格：专业、客观、精炼（像券商研报，不要像聊天记录）

## 输出JSON格式（严格遵守）
{{
  "executive_summary": "100字以内的核心结论",
  "key_findings": [
    {{"title": "发现标题", "content": "具体描述（含数据）", "severity": "high/medium/low"}}
  ],
  "analysis": "分析论证正文（300-600字，纯文本，不用Markdown）",
  "risks": ["风险1", "风险2"],
  "recommendations": [
    {{"action": "具体建议", "priority": "高/中/低", "expected_impact": "预期效果"}}
  ]
}}

重要提醒：所有输出必须是纯文本，禁止使用 * # - 等Markdown符号。用中文标点「、」分隔项目即可。"""

            llm_response = await llm.chat(
                [{"role": "user", "content": professional_prompt}],
                model="deepseek-chat",
                temperature=0.3,
                max_tokens=2000,
            )

            # 解析JSON
            import re
            json_match = re.search(r'\{[\s\S]*\}', llm_response)
            if json_match:
                professional_body = json.loads(json_match.group())
                logger.info(f"[小李v6] LLM专业报告生成成功: {len(professional_body.get('key_findings', []))}条发现")
            else:
                logger.warning("[小李v6] LLM输出未包含JSON，回退")

        except Exception as e:
            logger.warning(f"[小李v6] LLM专业报告生成失败，回退: {e}")

        # ── 4. 组装最终报告 ──
        findings = professional_body.get("key_findings", [])
        risks = professional_body.get("risks", [])
        recommendations = professional_body.get("recommendations", [])
        analysis_text = professional_body.get("analysis", "")
        executive_summary = professional_body.get("executive_summary", "")

        # 如果LLM失败，用Agent结论降级
        if not executive_summary and agent_conclusions:
            parts = []
            for role, content in list(agent_conclusions.items())[:3]:
                parts.append(content[:200])
            executive_summary = "基于多位分析师的讨论，得出以下结论：" + "；".join(parts)

        # ── 5. 构建溯源面板数据（默认隐藏）──
        trace_data = self._build_trace_panel(agent_results, debate_result)

        # ── 5.5 构建完整辩论记录（独立查看，与报告分离）──
        debate_log_data = self._build_full_debate_log(agent_results, debate_result)

        # ── 报告标题 ──
        file_name = chen_profile.get("file", "数据")
        time_range = self._extract_time_range(chen_profile)
        subtitle_parts = [f"共{shape[0]}行数据"]
        if time_range:
            subtitle_parts.append(time_range)
        if quality.get("score"):
            subtitle_parts.append(f"数据质量{quality['score']:.0f}分")

        report = {
            "title": self._make_title(file_name),
            "subtitle": " · ".join(subtitle_parts),
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "file_name": file_name,
            "version": "v6_professional",
            # v6核心：执行摘要
            "executive_summary": executive_summary,
            "sections": [
                # ── 1. 核心发现 ──
                {
                    "type": "key_findings",
                    "title": "核心发现",
                    "findings": findings,
                },
                # ── 2. 核心指标 ──
                {
                    "type": "metrics",
                    "title": "核心指标",
                    "cards": metric_cards,
                },
                # ── 3. 可视化图表 ──
                {
                    "type": "charts",
                    "title": "数据可视化",
                    "items": charts,
                },
                # ── 4. 分析论证 ──
                {
                    "type": "analysis",
                    "title": "分析论证",
                    "content": analysis_text,
                },
                # ── 5. 风险提示 ──
                {
                    "type": "risks",
                    "title": "风险提示",
                    "items": risks,
                },
                # ── 6. 策略建议 ──
                {
                    "type": "recommendations",
                    "title": "策略建议",
                    "items": recommendations,
                },
                # ── 7. 数据质量说明 ──
                {
                    "type": "quality",
                    "title": "数据说明",
                    "notes": chen_profile.get("warnings", []),
                    "quality_score": quality.get("score"),
                    "contradictions": [],
                    "consistency_flags": [],
                },
                # ── 8. 数字溯源 ──
                {
                    "type": "number_trace",
                    "title": "数字溯源",
                    "trace": number_trace,
                },
                # ── 9. 溯源面板（辩论过程，默认隐藏）──
                {
                    "type": "trace_panel",
                    "title": "AI分析溯源",
                    "data": trace_data,
                    "collapsed": True,  # 前端默认折叠
                },
                # ── 9.5 完整辩论记录（独立 Drawer 查看）──
                {
                    "type": "debate_log",
                    "title": "完整辩论记录",
                    "data": debate_log_data,
                },
                # ── 10. AI运行成本 ──
                {
                    "type": "cost_report",
                    "title": "AI运行成本",
                    "cost": cost_report,
                },
                # ── 11. 数据明细 ──
                {
                    "type": "data_table",
                    "title": "数据明细",
                    **data_table,
                },
            ],
            "_meta": {
                "agents": list(agent_conclusions.keys()),
                "question": question,
                "version": "v6_professional",
                "findings_count": len(findings),
                "risks_count": len(risks),
                "recommendations_count": len(recommendations),
                "has_debate": debate_result is not None,
                "debate_verdict": debate_result.get("final_verdict", "") if debate_result else None,
                "total_tokens": (cost_tracker.get("total_input_tokens", 0) +
                                 cost_tracker.get("total_output_tokens", 0)) if cost_tracker else 0,
            }
        }

        logger.info(
            f"[小李v6] 专业报告生成完成: {len(findings)}条发现, "
            f"{len(charts)}张图表, {len(recommendations)}条建议, "
            f"执行摘要{len(executive_summary)}字"
        )
        return report

    def _build_trace_panel(
        self,
        agent_results: Dict[str, Dict[str, Any]],
        debate_result: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """构建溯源面板数据（展示辩论修正过程，给技术人员看）
        
        v6.1 增强：增加完整辩论轮次详情，改进颗粒度
        """
        trace = {
            "agent_final_conclusions": {},
            "debate_history": [],
            "debate_rounds": [],  # v6.1: 完整辩论轮次
            "corrections": [],
        }

        # 各Agent的最终结论
        for role, result in agent_results.items():
            if role in ("QUALITY_REVIEWER", "REPORT_EDITOR"):
                continue
            content = result.get("content", "")[:500]
            trace["agent_final_conclusions"][role] = content

            # 辩论修正记录
            history = result.get("_debate_history", [])
            for h in history:
                trace["debate_history"].append({
                    "agent": role,
                    "round": h.get("round", 0),
                    "issue": h.get("challenger_message", "")[:300],
                    "correction": h.get("defense_message", "")[:300],
                    "original": h.get("original_content", "")[:300],
                })

        # 辩论总览
        if debate_result:
            trace["debate_overview"] = {
                "verdict": debate_result.get("final_verdict", ""),
                "total_rounds": debate_result.get("total_rounds", 0),
                "issues_total": debate_result.get("issues_total", 0),
                "issues_resolved": debate_result.get("issues_resolved", 0),
                "corrections_made": debate_result.get("corrections_made", 0),
            }

            # v6.1: 完整辩论轮次详情
            turns = debate_result.get("turns", [])
            for turn in turns:
                trace["debate_rounds"].append({
                    "round": turn.get("round", 0),
                    "challenger": turn.get("challenger", ""),
                    "challenger_message": turn.get("challenger_message", ""),
                    "defender": turn.get("defender", ""),
                    "defender_message": turn.get("defender_message", ""),
                    "issues_found": turn.get("issues_found", []),
                    "resolved": turn.get("resolved", False),
                })

        return trace

    def _build_full_debate_log(
        self,
        agent_results: Dict[str, Dict[str, Any]],
        debate_result: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """构建完整辩论记录（供前端 Drawer 独立查看）
        
        v6.1 新增：包含每轮的完整原文（不截断），用户想看原始辩论过程时可以展开。
        与报告正文中精炼后的结论分离。
        """
        log = {
            "has_debate": debate_result is not None,
            "verdict": "",
            "total_rounds": 0,
            "rounds": [],
            "agent_histories": {},
        }

        if not debate_result:
            return log

        log["verdict"] = debate_result.get("final_verdict", "")
        log["total_rounds"] = debate_result.get("total_rounds", 0)

        # 完整辩论轮次（不截断）
        for turn in debate_result.get("turns", []):
            log["rounds"].append({
                "round": turn.get("round", 0),
                "challenger": turn.get("challenger", ""),
                "challenger_message": turn.get("challenger_message", ""),
                "defender": turn.get("defender", ""),
                "defender_message": turn.get("defender_message", ""),
                "issues_found": turn.get("issues_found", []),
                "resolved": turn.get("resolved", False),
            })

        # 各 Agent 的完整辩论历史
        for role, result in agent_results.items():
            if role in ("QUALITY_REVIEWER", "REPORT_EDITOR"):
                continue
            history = result.get("_debate_history", [])
            if history:
                log["agent_histories"][role] = history

        return log

    def _infer_category(self, text: str) -> str:
        """根据文本内容推断洞察类别"""
        text_lower = text.lower()
        future_keywords = ["预测", "预计", "未来", "趋势", "将会", "可能", "明年", "下个"]
        advice_keywords = ["建议", "应该", "可以", "推荐", "需要", "注意", "优化", "改善"]
        past_keywords = ["去年", "前年", "过去", "历史", "同比", "相比去年"]

        for kw in advice_keywords:
            if kw in text:
                return "建议"
        for kw in future_keywords:
            if kw in text:
                return "未来"
        for kw in past_keywords:
            if kw in text:
                return "过去"
        return "现在"

    # ── 质检记录板块 ──────────────────────────────────────────────
    def _build_qa_report(self, qa_history: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
        """构建质检记录报告"""
        if not qa_history:
            return {"rounds": [], "summary": "本次分析未进行质检"}

        rounds = []
        for record in qa_history:
            rounds.append({
                "round": record.get("round", 0),
                "score": record.get("score", 0),
                "passed": record.get("passed", False),
                "issues_count": record.get("issues_count", 0),
                "issues_summary": record.get("issues_summary", [])
            })

        final = qa_history[-1]
        return {
            "total_rounds": len(qa_history),
            "final_score": final.get("score", 0),
            "final_passed": final.get("passed", False),
            "rounds": rounds,
            "summary": (
                f"经过{len(qa_history)}轮质检，最终得分{final.get('score', 0)}分，"
                f"{'通过' if final.get('passed') else '未通过（已使用当前结果）'}"
            )
        }

    # ── 新增：数字溯源板块 ──────────────────────────────────────────────
    def _build_number_trace(
        self,
        chen_profile: Dict[str, Any],
        lin_result: Dict[str, Any],
        insights: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        为报告中的关键数字建立溯源链。
        从老林的统计结果和老陈的基础统计中提取数字，匹配洞察中的引用。
        """
        traces = []

        # 从老陈的统计中提取基础数字
        for col in chen_profile.get("columns", []):
            if col.get("action") == "exclude":
                continue
            stats = col.get("stats") or {}
            if stats:
                name = col.get("name", "?")
                for key, value in stats.items():
                    if isinstance(value, (int, float)) and key not in ("missing_count", "unique_count"):
                        traces.append({
                            "display": f"{name} {key}={value}",
                            "source_agent": "老陈",
                            "source_type": "基础统计",
                            "column": name,
                            "metric": key,
                            "value": value,
                            "verified": True
                        })

        # 从老林的分析中提取数字
        for analysis in lin_result.get("analyses", []):
            title = analysis.get("title", "")
            summary = analysis.get("summary", "")
            trend = analysis.get("trend", "")
            change = analysis.get("change_pct", 0)

            if summary:
                traces.append({
                    "display": summary[:80],
                    "source_agent": "老林",
                    "source_type": "分析结果",
                    "analysis_title": title,
                    "verified": True
                })

            if trend and change:
                traces.append({
                    "display": f"{title} 趋势{trend}({change:+.1f}%)",
                    "source_agent": "老林",
                    "source_type": "趋势分析",
                    "analysis_title": title,
                    "value": change,
                    "verified": True
                })

            # 预测数据
            forecast = analysis.get("forecast", {})
            if forecast and forecast.get("available"):
                for pred in forecast.get("predictions", []):
                    traces.append({
                        "display": f"{pred.get('x', '?')}年预测{pred.get('y', '?')}",
                        "source_agent": "老王",
                        "source_type": "线性回归预测",
                        "r_squared": forecast.get("r_squared"),
                        "confidence": forecast.get("confidence"),
                        "verified": True
                    })

        # 从洞察中提取关键数字引用
        for i, insight in enumerate(insights):
            text = insight.get("text", "")
            if text:
                traces.append({
                    "display": text[:60] + ("..." if len(text) > 60 else ""),
                    "source_agent": "小赵",
                    "source_type": f"洞察[{insight.get('category', '?')}]",
                    "insight_index": i,
                    "verified": None  # 需要质检验证
                })

        return traces

    # ── 新增：AI运行成本板块 ──────────────────────────────────────────────
    def _build_cost_report(self, cost_tracker: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """构建AI运行成本报告"""
        if not cost_tracker:
            return {
                "total_calls": 0,
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "estimated_cost_yuan": 0,
                "breakdown": [],
                "summary": "无成本数据"
            }

        calls = cost_tracker.get("calls", [])
        total_input = cost_tracker.get("total_input_tokens", 0)
        total_output = cost_tracker.get("total_output_tokens", 0)

        # DeepSeek定价：input ¥1/M tokens, output ¥2/M tokens
        estimated_cost = (total_input * 1.0 / 1_000_000 + total_output * 2.0 / 1_000_000)

        # 按Agent汇总
        agent_summary = {}
        for call in calls:
            agent = call.get("agent", "未知")
            if agent not in agent_summary:
                agent_summary[agent] = {
                    "calls": 0,
                    "input_tokens": 0,
                    "output_tokens": 0
                }
            agent_summary[agent]["calls"] += 1
            agent_summary[agent]["input_tokens"] += call.get("input_tokens", 0)
            agent_summary[agent]["output_tokens"] += call.get("output_tokens", 0)

        breakdown = []
        for agent, data in agent_summary.items():
            agent_cost = (data["input_tokens"] * 1.0 / 1_000_000 +
                          data["output_tokens"] * 2.0 / 1_000_000)
            breakdown.append({
                "agent": agent,
                "calls": data["calls"],
                "input_tokens": data["input_tokens"],
                "output_tokens": data["output_tokens"],
                "cost_yuan": round(agent_cost, 4)
            })

        return {
            "total_calls": len(calls),
            "input_tokens": total_input,  # 前端 renderCost 读取 input_tokens
            "output_tokens": total_output,  # 前端 renderCost 读取 output_tokens
            "estimated_cost": f"¥{estimated_cost:.4f}",  # 前端 renderCost 读取 estimated_cost
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "estimated_cost_yuan": round(estimated_cost, 4),
            "breakdown": breakdown,
            "model": "deepseek-chat",
            "pricing": "input ¥1/M, output ¥2/M",
            "summary": f"共{len(calls)}次LLM调用，预估费用¥{estimated_cost:.4f}"
        }

    # ── 以下为原有方法（保持不变）────────────────────────────────────

    def _build_metric_cards(
        self, chen_profile: Dict[str, Any], lin_result: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """构建核心指标卡"""
        cards = []
        shape = chen_profile.get("shape", [0, 0])

        # 数据规模
        cards.append({"label": "数据行数", "value": f"{shape[0]:,}", "icon": "database"})
        cards.append({"label": "数据列数", "value": str(shape[1]), "icon": "columns"})

        # 时间范围
        for col in chen_profile.get("columns", []):
            if col.get("type") == "time" and col.get("stats"):
                stats = col["stats"]
                start = int(stats.get("min", 0))
                end = int(stats.get("max", 0))
                if start and end:
                    cards.append({
                        "label": "时间跨度",
                        "value": f"{end - start + 1}年",
                        "sub": f"{start}—{end}",
                        "icon": "calendar"
                    })
                break

        # 主数值列的当前值和趋势
        for analysis in lin_result.get("analyses", []):
            if analysis.get("_rule") != "A":
                continue
            data = [p for p in analysis.get("data", []) if p.get("type") != "predicted"]
            if not data:
                continue
            last = data[-1]
            trend = analysis.get("trend", "")
            trend_arrow = "↑" if trend == "上升" else ("↓" if trend == "下降" else "→")
            cards.append({
                "label": f"当前{analysis.get('y_col', '指标')}",
                "value": f"{last['y']:.2f}{trend_arrow}",
                "sub": f"{last['x']}年",
                "icon": "trending-down" if trend == "下降" else "trending-up"
            })

            # 预测值
            forecast = analysis.get("forecast", {})
            if forecast and forecast.get("available") and forecast.get("predictions"):
                pred = forecast["predictions"][-1]
                cards.append({
                    "label": f"预测{pred['x']}年",
                    "value": f"{pred['y']:.2f}",
                    "sub": f"R²={forecast.get('r_squared', '?')}",
                    "icon": "target"
                })
            break

        return cards

    def _build_charts(self, analyses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """整理图表数据（前端ECharts用），输出原始数据 + echarts_data"""
        charts = []
        for analysis in analyses:
            chart_type = analysis.get("type", "bar")
            raw_data = analysis.get("data", [])
            x_col = analysis.get("x_col", "")
            y_col = analysis.get("y_col", "")

            # 构建 InsightChart 可直接消费的 echarts_data
            echarts_data = self._build_echarts_data(analysis, raw_data, x_col, y_col)

            chart = {
                "id": analysis.get("id"),
                "type": chart_type,
                "title": analysis.get("title", ""),
                "summary": analysis.get("summary", ""),
                "filters": analysis.get("filters", ""),
                "x_col": x_col,
                "y_col": y_col,
                "group_col": analysis.get("group_col"),
                "data": raw_data,
                "forecast": analysis.get("forecast"),
                "correlation": analysis.get("correlation"),
                "_rule": analysis.get("_rule"),
                # 【B4新增】前端 InsightChart 可直接消费的数据
                "echarts_data": echarts_data,
            }
            charts.append(chart)
        return charts

    def _build_echarts_data(
        self, analysis: Dict[str, Any], raw_data: List, x_col: str, y_col: str
    ) -> Optional[Dict[str, Any]]:
        """
        将 analysis 原始数据转为 InsightChart 的 ChartData 格式。
        ChartData = { type, title, series: [{name, data: [{x, y, pct}]}], stats? }

        重要：老林输出 data=[{"x": val, "y": val}]（字面量key），
        但也兼容列名key格式 data=[{"年份": val, "工资": val}]。
        """
        if not raw_data:
            return None

        rule = analysis.get("_rule", "")
        # 修复规则D类型映射（multi_line 不应映射为 pie）
        chart_type_map = {"A": "line", "B": "bar", "C": "bar_horizontal", "D": "line", "F": "bar"}
        # 根据原始 analysis.type 做二次修正
        original_type = analysis.get("type", "")
        chart_type = chart_type_map.get(rule, "bar")
        # 如果原始类型是 correlation，无法用标准图表，跳过
        if original_type == "correlation":
            return None

        # 提取 x/y 值 — 修复字段名不匹配 BUG
        # 老林输出 data=[{"x": val, "y": val}]，key 是字面量 "x"/"y"
        # 需要优先用 row.get("x") 和 row.get("y")，再回退到列名
        series_data = []
        for row in raw_data[:30]:  # 最多30个数据点
            # 优先取字面量 key（老林格式），再回退到列名key
            x_val = row.get("x", row.get(x_col, row.get("label", row.get("name", ""))))
            y_val = row.get("y", row.get(y_col, row.get("value", row.get("count", 0))))

            # 规则D分组趋势：data 是 Dict[str, List] 格式 {"组名": [{"x":..., "y":...}]}
            if isinstance(x_val, dict) or (rule == "D" and isinstance(raw_data, dict)):
                break  # 分组数据单独处理

            if x_val is None or y_val is None:
                continue
            try:
                y_val = float(y_val)
            except (ValueError, TypeError):
                continue
            series_data.append({"x": str(x_val), "y": y_val, "pct": 0})

        # 规则D：分组趋势数据（多series）→ 取第一个组的series
        if rule == "D" and not series_data and isinstance(raw_data, dict):
            # raw_data = {"组A": [{"x": 1, "y": 100}, ...], "组B": [...]}
            first_group = next(iter(raw_data.values()), [])
            if first_group:
                x_col_d = analysis.get("x_col", "")
                for row in first_group[:30]:
                    x_val = row.get("x", row.get(x_col_d, ""))
                    y_val = row.get("y", 0)
                    if x_val is not None and y_val is not None:
                        try:
                            series_data.append({"x": str(x_val), "y": float(y_val), "pct": 0})
                        except (ValueError, TypeError):
                            continue

        if not series_data:
            return None

        # 计算占比
        total = sum(p["y"] for p in series_data)
        if total > 0:
            for p in series_data:
                p["pct"] = round(p["y"] / total * 100, 1)

        # 计算统计值
        values = [p["y"] for p in series_data]
        stats = {
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "mean": round(sum(values) / len(values), 2),
            "median": round(sorted(values)[len(values) // 2], 2),
            "count": len(values),
        }

        return {
            "type": chart_type,
            "title": analysis.get("title", ""),
            "x_label": x_col,
            "y_label": y_col,
            "drillable": len(series_data) >= 5,
            "series": [{"name": y_col or "数值", "data": series_data}],
            "stats": stats,
        }

    def _build_data_table(
        self, chen_profile: Dict[str, Any], analyses: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """构建数据明细表"""
        for analysis in analyses:
            if analysis.get("_rule") == "A":
                data = analysis.get("data", [])
                columns = []
                if analysis.get("x_col"):
                    columns.append(analysis["x_col"])
                if analysis.get("y_col"):
                    columns.append(analysis["y_col"])
                columns.append("type")

                return {
                    "columns": columns,
                    "data": data,
                    "sortable": True
                }

        return {
            "columns": [c.get("name") for c in chen_profile.get("columns", [])[:6]],
            "data": [],
            "sortable": False,
            "note": "完整数据请通过查询功能获取"
        }

    def _check_consistency(
        self, insights: List[Dict], contradictions: List[str]
    ) -> List[Dict[str, Any]]:
        """生成一致性标注"""
        flags = []
        for contradiction in contradictions:
            flags.append({
                "type": "warning",
                "message": contradiction,
                "color": "red"
            })
        return flags

    def _extract_time_range(self, chen_profile: Dict[str, Any]) -> Optional[str]:
        """从老陈的画像中提取时间范围"""
        for col in chen_profile.get("columns", []):
            if col.get("type") == "time" and col.get("stats"):
                stats = col["stats"]
                start = stats.get("min")
                end = stats.get("max")
                if start and end:
                    return f"{int(start)}—{int(end)}"
        return None

    def _make_title(self, file_name: str) -> str:
        """生成报告标题"""
        name = file_name
        for ext in [".csv", ".xlsx", ".xls", ".json", ".parquet"]:
            if name.lower().endswith(ext):
                name = name[:-len(ext)]
                break
        return f"{name} · 数据分析报告"


# 单例
_li_instance: Optional[ReportEditor] = None

def get_li() -> ReportEditor:
    global _li_instance
    if _li_instance is None:
        _li_instance = ReportEditor()
    return _li_instance
