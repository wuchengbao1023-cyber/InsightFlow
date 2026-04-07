"""
InsightFlow v5 — Debate 辩论框架
===================================

对抗性思考的王者。让Agent之间像人类一样进行辩论，
从而提升结论的准确性，降低单一Agent产生"幻觉"的风险。

核心机制：
1. 质检官 + 策略顾问 组成"质疑方"
2. 被质疑的Agent（老林/老王等）作为"辩护方"
3. 多轮辩论：质疑 → 辩护 → 再质疑 → 再辩护 → 收敛
4. 收敛判断：连续无新发现 / 达到最大轮次
5. 如果质疑成立 → 创建修正任务，重新分析

流程：
  分析Agent产出结论
    → 质检官审查（发现问题）
    → 质疑消息推送给被质疑Agent
    → 被质疑Agent辩护/修正
    → 质检官复审
    → 收敛 or 继续辩论

Author: InsightFlow AI Team
"""

import asyncio
import json
import logging
from typing import Dict, Any, List, Optional, AsyncGenerator
from datetime import datetime

logger = logging.getLogger(__name__)


# ── 辩论配置 ──────────────────────────────────────────────

MAX_DEBATE_ROUNDS = 3       # 最大辩论轮次（避免无限循环）
CONVERGENCE_THRESHOLD = 2   # 连续无新发现时收敛


class DebateTurn:
    """单轮辩论记录"""

    def __init__(
        self,
        round_number: int,
        challenger: str,
        challenger_message: str,
        defender: str,
        defender_message: str = "",
        issues_found: List[str] = None,
        resolved: bool = False,
    ):
        self.round_number = round_number
        self.challenger = challenger  # 质疑方（质检官/小赵）
        self.challenger_message = challenger_message
        self.defender = defender  # 辩护方（被质疑Agent）
        self.defender_message = defender_message
        self.issues_found = issues_found or []
        self.resolved = resolved  # 本轮是否解决
        self.timestamp = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "round": self.round_number,
            "challenger": self.challenger,
            "challenger_message": self.challenger_message,
            "defender": self.defender,
            "defender_message": self.defender_message,
            "issues_found": self.issues_found,
            "resolved": self.resolved,
        }


class CorrectionSuggestion:
    """
    单条修正建议（供 orchestrator 创建 correction_task 使用）。
    
    对应意见.txt 中描述的 ReWOO 动态修正机制：
    "质检官发现问题 → 发布 correction_task → 老林监听 → 重新分析 → 结果自动更新"
    """

    def __init__(
        self,
        target_task_id: str,
        target_agent_role: str,
        original_task_type: str,
        issue_description: str,
        correction_prompt: str,
        severity: str = "medium",  # low / medium / high
    ):
        self.target_task_id = target_task_id
        self.target_agent_role = target_agent_role
        self.original_task_type = original_task_type
        self.issue_description = issue_description
        self.correction_prompt = correction_prompt
        self.severity = severity
        self.applied = False  # 是否已被 orchestrator 应用

    def to_dict(self) -> Dict[str, Any]:
        return {
            "target_task_id": self.target_task_id,
            "target_agent_role": self.target_agent_role,
            "original_task_type": self.original_task_type,
            "issue_description": self.issue_description,
            "correction_prompt": self.correction_prompt,
            "severity": self.severity,
            "applied": self.applied,
        }


class DebateResult:
    """
    辩论最终结果。
    
    v5.1 新增 correction_suggestions 字段：
    当质检官发现需要回退到任务池重新执行的问题时，
    返回结构化的修正建议列表，由 orchestrator 创建 correction_task。
    """

    def __init__(self):
        self.turns: List[DebateTurn] = []
        self.total_rounds: int = 0
        self.issues_total: int = 0
        self.issues_resolved: int = 0
        self.corrections_made: int = 0
        self.final_verdict: str = "通过"  # 通过 / 部分修正 / 需回退 / 未通过
        # v5.1: 结构化修正建议（回退到任务池执行）
        self.correction_suggestions: List[CorrectionSuggestion] = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_rounds": self.total_rounds,
            "issues_total": self.issues_total,
            "issues_resolved": self.issues_resolved,
            "corrections_made": self.corrections_made,
            "final_verdict": self.final_verdict,
            "correction_suggestions": [s.to_dict() for s in self.correction_suggestions],
            "needs_retry": len(self.correction_suggestions) > 0,
            "turns": [t.to_dict() for t in self.turns],
        }


class DebateFramework:
    """
    辩论框架 — 管理Agent之间的对抗性讨论。

    用法：
        debate = DebateFramework()
        async for event in debate.run_debate(
            analysis_results={...},
            question="...",
            chen_profile={...},
        ):
            yield event  # SSE事件
    """

    def __init__(self):
        self.result = DebateResult()
        self._calm_rounds = 0  # 连续无新发现的轮次

    async def run_debate(
        self,
        analysis_results: Dict[str, Dict[str, Any]],
        question: str,
        chen_profile: Dict[str, Any],
        lin_precomputed: Optional[Dict[str, Any]] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        执行辩论流程。

        参数：
            analysis_results: {role: {"content": "...", "full_text": "...", ...}}
            question: 用户原始问题
            chen_profile: 数据画像
            lin_precomputed: 老林的预计算结果

        生成SSE事件：
            debate_start: 辩论开始
            debate_round: 辩论轮次（包含质疑方和辩护方的发言）
            debate_challenge: 质疑方发言（流式）
            debate_defense: 辩护方发言（流式）
            debate_end: 辩论结束
        """
        from ..utils.llm_client import llm
        from .conversation_manager import AGENT_ROLES

        # 获取需要辩论的分析结果（排除质检官和报告主编自身）
        debatable_roles = [
            role for role in analysis_results.keys()
            if role not in ("QUALITY_REVIEWER", "REPORT_EDITOR")
        ]

        if not debatable_roles:
            yield {"type": "debate_end", "data": {"reason": "无可辩论的分析结果"}}
            return

        # ── 发送辩论开始事件 ──
        yield {
            "type": "debate_start",
            "data": {
                "message": "⚖️ 质量辩论开始 — 质检官正在审查分析结论...",
                "participants": ["质检官"] + [
                    AGENT_ROLES.get(r, {}).get("name", r) for r in debatable_roles
                ],
            }
        }

        # ── 构建审查上下文 ──
        review_context = self._build_review_context(analysis_results, question)

        # ── 多轮辩论 ──
        for round_num in range(1, MAX_DEBATE_ROUNDS + 1):
            self.result.total_rounds = round_num
            logger.info(f"[辩论] 第{round_num}轮开始")

            # ── Step 1: 质检官质疑 ──
            challenge_text = ""
            yield {
                "type": "debate_challenge_start",
                "data": {
                    "round": round_num,
                    "challenger": "质检官",
                    "challenger_color": "#EF4444",
                }
            }

            challenge_prompt = self._build_challenge_prompt(
                review_context, question, round_num, self.result.turns
            )

            try:
                challenge_text = ""
                ch_buffer = ""
                ch_last_flush = asyncio.get_event_loop().time()
                async for delta in llm.chat_stream(
                    [{"role": "user", "content": challenge_prompt}],
                    model="deepseek-chat",
                    temperature=0.2,
                    max_tokens=800,
                ):
                    challenge_text += delta
                    ch_buffer += delta
                    now = asyncio.get_event_loop().time()
                    if now - ch_last_flush >= 0.03:
                        yield {
                            "type": "thinking_delta",
                            "data": {
                                "agent": "QUALITY_REVIEWER",
                                "delta": ch_buffer,
                            }
                        }
                        ch_buffer = ""
                        ch_last_flush = now
                if ch_buffer:
                    yield {
                        "type": "thinking_delta",
                        "data": {
                            "agent": "QUALITY_REVIEWER",
                            "delta": ch_buffer,
                        }
                    }
            except Exception as e:
                challenge_text = f"审查失败: {e}"
                logger.error(f"[辩论] 质检官发言失败: {e}")

            yield {
                "type": "debate_challenge_end",
                "data": {
                    "round": round_num,
                    "full_text": challenge_text,
                }
            }

            # ── Step 2: 解析质疑内容 ──
            issues = self._extract_issues(challenge_text)
            challenged_agents = self._identify_challenged_agents(
                challenge_text, debatable_roles, AGENT_ROLES
            )

            if not challenged_agents:
                # 质检官没有质疑任何人 → 辩论结束
                self._calm_rounds += 1
                if self._calm_rounds >= CONVERGENCE_THRESHOLD:
                    logger.info(f"[辩论] 连续{self._calm_rounds}轮无新发现，收敛结束")
                    break
                continue

            self._calm_rounds = 0  # 有新发现，重置平静计数

            # ── Step 3: 被质疑Agent辩护 ──
            for agent_role in challenged_agents:
                agent_info = AGENT_ROLES.get(agent_role, {"name": agent_role, "color": "#666"})
                agent_name = agent_info.get("name", agent_role)
                original_result = analysis_results.get(agent_role, {})
                original_text = original_result.get("content", original_result.get("full_text", ""))

                yield {
                    "type": "collaboration",
                    "data": {
                        "from_role": "QUALITY_REVIEWER",
                        "to_role": agent_role,
                        "from_name": "质检官",
                        "to_name": agent_name,
                        "content": f"质检官质疑了{agent_name}的结论，{agent_name}正在辩护...",
                    }
                }

                defense_text = ""
                yield {
                    "type": "thinking_start",
                    "data": {
                        "agent": agent_role,
                        "name": agent_name,
                        "color": agent_info.get("color", "#666"),
                    }
                }

                defense_prompt = f"""你是{agent_name}。质检官对你的分析结论提出了质疑。

## 你的原始分析
{original_text[-1500:]}

## 质检官的质疑（第{round_num}轮）
{challenge_text}

## 请回应
1. 如果质检官说得对，承认并修正你的结论（给出正确数据）
2. 如果质检官误解了，解释清楚你的逻辑
3. 如果质检官的数据有误，指出正确数据
4. 不要空泛回应，每条回应必须包含具体数据或明确理由"""

                try:
                    defense_text = ""
                    def_buffer = ""
                    def_last_flush = asyncio.get_event_loop().time()
                    async for delta in llm.chat_stream(
                        [{"role": "user", "content": defense_prompt}],
                        model="deepseek-chat",
                        temperature=0.3,
                        max_tokens=800,
                    ):
                        defense_text += delta
                        def_buffer += delta
                        now = asyncio.get_event_loop().time()
                        if now - def_last_flush >= 0.03:
                            yield {
                                "type": "thinking_delta",
                                "data": {"agent": agent_role, "delta": def_buffer}
                            }
                            def_buffer = ""
                            def_last_flush = now
                    if def_buffer:
                        yield {
                            "type": "thinking_delta",
                            "data": {"agent": agent_role, "delta": def_buffer}
                        }
                except Exception as e:
                    defense_text = f"辩护失败: {e}"
                    logger.error(f"[辩论] {agent_name}辩护失败: {e}")

                yield {"type": "thinking_end", "data": {"agent": agent_role}}

                # v5.2: 只保留最终修正版（替换而非追加）
                # 根因修复：之前每轮辩论都追加辩护内容到content，
                # 导致3轮辩论后每Agent content膨胀到5000+字，全部灌入报告变成2万字流水账
                if defense_text and "辩护失败" not in defense_text:
                    # 保存原始分析到 _debate_history（供溯源使用，不进报告）
                    if "_debate_history" not in analysis_results[agent_role]:
                        analysis_results[agent_role]["_debate_history"] = []
                    analysis_results[agent_role]["_debate_history"].append({
                        "round": round_num,
                        "challenger_message": challenge_text[:500],
                        "defense_message": defense_text,
                        "original_content": original_text[:500],
                    })

                    # 关键改动：用LLM精炼辩护后的最终结论，替换原始content
                    try:
                        from ..utils.llm_client import llm
                        refine_prompt = f"""你是{agent_name}。经过辩论审查，你需要输出最终修正版分析结论。

## 你的原始分析
{original_text[-1000:]}

## 质检官的质疑（第{round_num}轮）
{challenge_text[:500]}

## 你的辩护回应
{defense_text}

## 要求
1. 输出一份**精炼的最终结论**（不超过300字）
2. 只保留已被验证的正确数据和分析
3. 明确标注哪些数据/结论经过修正
4. 不要输出"我承认错误"之类的过程描述，直接给出正确结论
5. 使用专业客观的语言"""
                        refined = await llm.chat(
                            [{"role": "user", "content": refine_prompt}],
                            model="deepseek-chat",
                            temperature=0.2,
                            max_tokens=500,
                        )
                        # 用精炼后的最终版替换原始content
                        analysis_results[agent_role]["content"] = refined
                        analysis_results[agent_role]["full_text"] = refined
                    except Exception as refine_err:
                        logger.warning(f"[辩论] LLM精炼失败，使用截断版: {refine_err}")
                        # 降级：只用最后一轮辩护内容（截断到800字）
                        analysis_results[agent_role]["content"] = defense_text[:800]
                        analysis_results[agent_role]["full_text"] = defense_text[:800]

                    self.result.corrections_made += 1

                # 记录辩论轮次
                turn = DebateTurn(
                    round_number=round_num,
                    challenger="质检官",
                    challenger_message=challenge_text,
                    defender=agent_name,
                    defender_message=defense_text,
                    issues_found=issues,
                    resolved="修正" in defense_text or "承认" in defense_text,
                )
                self.result.turns.append(turn)
                self.result.issues_total += len(issues)

                if turn.resolved:
                    self.result.issues_resolved += len(issues)

            # ── Step 4: 检查是否收敛 ──
            # 如果这轮质疑没有发现新问题（issues为空），增加平静计数
            if not issues:
                self._calm_rounds += 1
            else:
                self._calm_rounds = 0

            # 检查最终判定
            is_passing = any(
                sig in challenge_text
                for sig in ["审查通过", "未发现问题", "质量合格", "结论可靠", "无需修正"]
            )
            if is_passing:
                logger.info(f"[辩论] 第{round_num}轮质检官认可结论，辩论结束")
                break

            if self._calm_rounds >= CONVERGENCE_THRESHOLD:
                logger.info(f"[辩论] 连续{self._calm_rounds}轮无新问题，辩论结束")
                break

        # ── 辩论结束 ──
        # v5.1: 生成结构化修正建议（对应意见.txt 的 correction_task 自动触发机制）
        self._generate_correction_suggestions(analysis_results)

        if self.result.issues_total > 0 and self.result.issues_resolved == self.result.issues_total:
            self.result.final_verdict = "通过（所有问题已修正）"
        elif self.result.issues_total == 0:
            self.result.final_verdict = "通过（未发现问题）"
        elif self.result.correction_suggestions:
            # 有未解决的严重问题，需要回退到任务池重新执行
            self.result.final_verdict = "需回退"
        elif self.result.issues_resolved > 0:
            self.result.final_verdict = "部分修正"
        else:
            self.result.final_verdict = "未通过"

        yield {
            "type": "debate_end",
            "data": {
                "verdict": self.result.final_verdict,
                "total_rounds": self.result.total_rounds,
                "issues_total": self.result.issues_total,
                "issues_resolved": self.result.issues_resolved,
                "corrections_made": self.result.corrections_made,
                "debate_log": self.result.to_dict(),
            }
        }

        logger.info(
            f"[辩论] 结束: {self.result.final_verdict}, "
            f"{self.result.total_rounds}轮, "
            f"{self.result.issues_total}个问题, "
            f"{self.result.issues_resolved}个已解决"
        )

    def _build_review_context(
        self,
        analysis_results: Dict[str, Dict[str, Any]],
        question: str,
    ) -> str:
        """构建审查上下文"""
        from .conversation_manager import AGENT_ROLES

        parts = [f"## 用户问题\n{question}\n\n## 分析结论\n"]
        for role, result in analysis_results.items():
            if role in ("QUALITY_REVIEWER", "REPORT_EDITOR"):
                continue
            name = AGENT_ROLES.get(role, {}).get("name", role)
            content = result.get("content", result.get("full_text", ""))
            # 只取最后1500字（避免token过多）
            parts.append(f"### {name}\n{content[-1500:]}\n")

        return "\n".join(parts)

    def _build_challenge_prompt(
        self,
        review_context: str,
        question: str,
        round_num: int,
        previous_turns: List[DebateTurn],
    ) -> str:
        """构建质检官的质疑prompt"""
        prompt = f"""你是质量审查员。请严格审查以下分析结论，找出问题并质疑。

{review_context}

## 审查标准
1. **数字真实性**：每个数字必须来自真实数据，"假设"、"大概"、"可能"的数据标记为不可信
2. **逻辑一致性**：不同分析结论之间不能有矛盾
3. **直接回答**：是否直接回答了用户的问题
4. **数据支撑**：每个结论是否有具体数据支撑

## 输出格式
- 如果发现问题：指出具体是哪个分析师的哪个结论有问题，说明原因，@对应的分析师
- 如果没有问题：明确说"审查通过"或"结论可靠"
- 不要空泛批评，必须指出具体问题

注意：这是第{round_num}轮审查。"""

        # 如果有历史辩论轮次，加入上下文
        if previous_turns:
            prompt += "\n\n## 前几轮辩论历史\n"
            for turn in previous_turns[-2:]:
                prompt += f"### 第{turn.round_number}轮\n"
                prompt += f"质检官：{turn.challenger_message[:300]}\n"
                if turn.defender_message:
                    prompt += f"{turn.defender}的回应：{turn.defender_message[:300]}\n"

        return prompt

    def _extract_issues(self, challenge_text: str) -> List[str]:
        """从质疑文本中提取具体问题"""
        issues = []
        import re

        # 提取列表项
        items = re.findall(r'[•\-\d]+[.、)]\s*(.+?)(?=•|[-\d]+[.、)]|$)', challenge_text, re.DOTALL)
        for item in items:
            item = item.strip()
            if len(item) > 10 and any(
                kw in item for kw in ["问题", "错误", "不准确", "矛盾", "假设", "缺乏", "未", "没有"]
            ):
                issues.append(item[:200])

        return issues[:5]  # 最多返回5个问题

    def _identify_challenged_agents(
        self,
        challenge_text: str,
        debatable_roles: List[str],
        agent_roles: Dict[str, Any],
    ) -> List[str]:
        """识别被质疑的Agent"""
        challenged = []
        for role in debatable_roles:
            name = agent_roles.get(role, {}).get("name", role)
            # 检查是否在质疑文本中提及
            if name in challenge_text or role in challenge_text:
                challenged.append(role)

        # 如果没有明确提及，但确实有问题，质疑第一个分析Agent
        if not challenged and any(
            kw in challenge_text for kw in ["问题", "错误", "不准确", "修正"]
        ):
            challenged = [r for r in debatable_roles if r != "DATA_ENGINEER"][:1]

        return challenged

    def _generate_correction_suggestions(
        self,
        analysis_results: Dict[str, Dict[str, Any]],
    ) -> List[CorrectionSuggestion]:
        """
        v5.1: 从辩论结果中提取需要回退到任务池的修正建议。
        
        对应意见.txt 的 ReWOO 动态修正机制：
        "质检官发现问题 → 发布 correction_task → Agent监听 → 重新分析 → 结果自动更新"
        
        生成条件：
        1. 辩论中存在未解决的严重问题
        2. 被质疑的 Agent 已尝试辩护但仍存在问题
        3. 修正任务会被回退到 TaskPool 重新执行
        """
        suggestions = []

        for turn in self.result.turns:
            # 跳过已解决的问题
            if turn.resolved:
                continue

            # 只处理最后一轮的未解决问题（避免重复）
            if turn.round_number < self.result.total_rounds:
                continue

            # 从 defender 名称反向找到 role key
            defender_role = None
            from .conversation_manager import AGENT_ROLES
            for role, info in AGENT_ROLES.items():
                name = info.get("name", "").split(" · ")[0]
                if name == turn.defender:
                    defender_role = role
                    break

            if not defender_role:
                continue

            # 找到对应的 task_id
            target_task_id = None
            for task_id, result in analysis_results.items():
                if result.get("role") == defender_role:
                    target_task_id = task_id
                    break

            if not target_task_id:
                continue

            # 判断严重程度
            severity = "medium"
            critical_keywords = ["严重", "根本性", "完全错误", "数据造假", "编造"]
            if any(kw in turn.challenger_message for kw in critical_keywords):
                severity = "high"
            elif any(kw in turn.challenger_message for kw in ["轻微", "小问题", "建议"]):
                severity = "low"

            # 构建修正 prompt
            correction_prompt = (
                f"辩论审查发现你的分析存在以下问题：\n"
                f"{turn.challenger_message[-500:]}\n\n"
                f"你的辩护：{turn.defender_message[-300:]}\n\n"
                f"请基于质检官的质疑，重新分析并修正你的结论。"
                f"每条修正必须包含具体数据和依据。"
            )

            suggestion = CorrectionSuggestion(
                target_task_id=target_task_id,
                target_agent_role=defender_role,
                original_task_type=turn.defender_message[:50],  # 标记来源
                issue_description="; ".join(turn.issues_found[:3]) if turn.issues_found else turn.challenger_message[:200],
                correction_prompt=correction_prompt,
                severity=severity,
            )
            suggestions.append(suggestion)

        self.result.correction_suggestions = suggestions
        return suggestions


# ── 单例 ──────────────────────────────────────────────────────

_debate: Optional[DebateFramework] = None


def get_debate_framework() -> DebateFramework:
    global _debate
    if _debate is None:
        _debate = DebateFramework()
    return _debate
