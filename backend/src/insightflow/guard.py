"""
质检官 - QualityGuard (LLM-as-Judge)
=====================================

职责：读所有人的输出，用LLM做质检，打分 + 精确反馈。
特点：LLM-as-Judge，不是规则打分。反馈精确到条目级别。

质检标准：
1. 数字溯源：每个洞察中的数字必须能在上游数据中找到来源
2. 逻辑一致：不同Agent的结论之间不能有矛盾
3. 无废话：禁止模板化的无信息量文字
4. 建议具体：建议必须包含 具体对象+数字+行动
5. 排除有效：被标记为exclude的列不能出现

输入：chen_profile + lin_result + zhao_result
输出：
{
    "score": 0-100,
    "passed": bool (>=80),
    "issues": [
        {"agent": "小赵", "insight_index": 3, "criterion": "数字溯源",
         "detail": "...", "fix": "..."}
    ],
    "feedback_to": {
        "小赵": {"rewrite": [3, 5], "keep": [0, 1, 2, 4]}
    },
    "cost": {"input_tokens": N, "output_tokens": N, "model": "..."}
}

不通过时：orchestrator把feedback_to发给对应Agent，只重写出问题的条目。
最多2轮（省成本）。
"""

import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# 通过阈值
PASS_THRESHOLD = 80
# 最大质检轮数
MAX_QA_ROUNDS = 2


QA_SYSTEM_PROMPT = """你是一个严格的数据分析质检官。你的工作是检查AI分析师们的产出质量。

## 质检标准
1. **数字溯源**：每个洞察中出现的数字，必须能在上游数据中找到对应来源。找不到来源的数字视为幻觉。
2. **逻辑一致**：不同Agent的结论之间不能有矛盾。如有矛盾，必须有合理解释。
3. **无废话**：禁止出现以下模板句式：
   - "数据完整性良好"
   - "建议进一步分析"
   - "可进行深度分析"
   - "值得关注"
   - "数据质量整体较好"
   - "建议加强管理"
   - 任何没有具体对象、具体数字、具体行动的空泛表述
4. **建议具体**：建议类洞察必须同时包含：具体对象（哪个部门/专业/地区）+ 具体数字 + 具体行动（做什么）。
5. **排除有效**：被标记为exclude的列（如序号、姓名、编号）不能出现在任何洞察中。

## 输出格式
请严格按以下JSON格式输出，不要有任何额外文字：
{
    "items": [
        {"check": "数字溯源", "result": "pass", "thought": "逐条检查数字来源的思路", "challenges": []},
        {"check": "数字溯源", "result": "fail", "thought": "发现XX问题", "agent": "小赵", "insight_index": 3, "fix": "改为...", "challenges": []},
        {"check": "逻辑检验", "result": "pass", "thought": "检查推理链", "challenges": [{"target": "小赵", "issue": "XX判断缺乏直接证据", "resolution": "但已标注为推测，可接受"}]}
    ],
    "score": 72,
    "passed": false,
    "feedback_to": {
        "小赵": {"rewrite": [3, 5], "keep": [0, 1, 2, 4]}
    }
}

## thought字段（必填）
描述你的检查思路，让用户看到"质检官在认真思考"：
- 数字溯源：说"检查第1条的124.59→老林有，第2条的921→老林有..."
- 逻辑检验：说"小赵说XX→验证上游数据→一致/不一致"
- 废话检查：说"逐条扫描模板句式→发现/未发现"

## challenges字段（强烈建议填写）
challenges是"我考虑过但没有打回的问题"，即使result是pass也应该有：
- 格式：{"target": "Agent名", "issue": "具体问题", "resolution": "为什么判定可接受"}
- 有challenges说明质检认真，没有challenges反而显得敷衍

## 打分规则
- 每个有问题的洞察扣 10-15 分
- 严重幻觉（编造数据）扣 20 分
- 废话/模板文字每条扣 5 分
- 基础分 100 分，扣完为止
- 总分 >= 80 通过，< 80 需要重做"""


class QualityGuard:
    """质检官：LLM-as-Judge，精确到条目的质检反馈"""

    def __init__(self):
        self.name = "质检官"
        self.role = "QualityGuard"
        self.round_count = 0
        self.history: List[Dict[str, Any]] = []
        logger.info(f"🔍 {self.name}({self.role}) 上线")

    def reset(self):
        """重置质检状态（每次新分析前调用）"""
        self.round_count = 0
        self.history = []

    async def inspect(
        self,
        chen_profile: Dict[str, Any],
        lin_result: Dict[str, Any],
        zhao_result: Dict[str, Any],
        cost_tracker: Dict[str, Any],
        llm_strategy: str = "moderate"
    ) -> Dict[str, Any]:
        """
        执行一次质检。

        Returns:
            {
                "score": int,
                "passed": bool,
                "issues": [...],
                "feedback_to": {...},
                "cost": {...}
            }
        """
        self.round_count += 1
        round_num = self.round_count
        logger.info(f"[质检官] 第{round_num}轮质检开始")

        # 1. 构建质检上下文
        qa_context = self._build_qa_context(chen_profile, lin_result, zhao_result, round_num)

        # 2. 根据策略决定是否调LLM
        from ..utils.llm_client import get_model_config
        model_cfg = get_model_config("质检官", llm_strategy)
        model_name = model_cfg["model"]
        logger.info(f"[质检官] 第{round_num}轮, 模型路由: {model_name or '规则引擎'}（{model_cfg['reason']}）")

        if model_name is None:
            # 低复杂度 → 直接用规则引擎，不调LLM
            logger.info(f"[质检官] 策略={llm_strategy}，使用规则引擎质检（省成本）")
            qa_result = self._rule_based_judge(chen_profile, zhao_result)
        else:
            # 调LLM做质检
            insights_count = len(zhao_result.get("insights", []))
            qa_result = await self._llm_judge(
                qa_context, cost_tracker,
                model=model_name,
                temperature=model_cfg["temperature"],
                max_tokens=model_cfg["max_tokens"],
                insights_count=insights_count,
            )

        # 如果LLM不可用，使用规则质检
        if qa_result is None:
            qa_result = self._rule_based_judge(chen_profile, zhao_result)

        score = qa_result.get("score", 0)
        passed = score >= PASS_THRESHOLD
        issues = qa_result.get("issues", [])
        feedback_to = qa_result.get("feedback_to", {})
        cost = qa_result.get("cost", {})

        # 3. 记录历史
        round_record = {
            "round": round_num,
            "score": score,
            "passed": passed,
            "issues_count": len(issues),
            "issues_summary": [f"{i.get('criterion', '?')}→{i.get('detail', '')[:50]}" for i in issues[:5]]
        }
        self.history.append(round_record)

        logger.info(f"[质检官] 第{round_num}轮质检完成: {score}分, {'通过' if passed else '未通过'}")

        return {
            "score": score,
            "passed": passed,
            "issues": issues,
            "feedback_to": feedback_to,
            "cost": cost,
            "round": round_num
        }

    def _build_qa_context(
        self,
        chen_profile: Dict[str, Any],
        lin_result: Dict[str, Any],
        zhao_result: Dict[str, Any],
        round_num: int
    ) -> str:
        """构建给质检LLM的上下文"""

        lines = [f"## 第{round_num}轮质检"]

        # 上游数据（老陈 + 老林）
        lines.append("\n### 上游数据来源（老陈+老林的统计结果）")
        for col in chen_profile.get("columns", []):
            if col.get("action") == "exclude":
                continue
            col_type = col.get("type", "?")
            name = col.get("name", "?")
            role = col.get("role", col_type)
            stats = col.get("stats") or {}
            if col_type == "numeric" and stats:
                lines.append(f"- {name}（{role}）: 范围[{stats.get('min')}, {stats.get('max')}], "
                             f"均值{stats.get('mean')}, 中位数{stats.get('median')}")
            elif col_type == "category":
                lines.append(f"- {name}（{role}, {col.get('unique_count', '?')}种值）: "
                             f"样本{col.get('sample_values', [])[:3]}")

        # 老林的分析摘要
        for analysis in lin_result.get("analyses", []):
            lines.append(f"\n- 分析「{analysis.get('title', '')}」: {analysis.get('summary', '')}")
            if analysis.get("trend"):
                lines.append(f"  趋势: {analysis['trend']} ({analysis.get('change_pct', 0):+.1f}%)")

        # 排除列
        excluded = [c for c in chen_profile.get("columns", []) if c.get("action") == "exclude"]
        if excluded:
            names = [c["name"] for c in excluded]
            lines.append(f"\n⚠️ 已排除列（不得出现在任何洞察中）: {', '.join(names)}")

        # 小赵的洞察（逐条标号）
        insights = zhao_result.get("insights", [])
        lines.append(f"\n### 小赵的洞察（共{len(insights)}条，请逐条检查）")
        for i, insight in enumerate(insights):
            category = insight.get("category", "?")
            text = insight.get("text", "")
            level = insight.get("level", "?")
            lines.append(f"\n第{i}条 [{category}][{level}]: {text}")

        # 非首轮质检时，附上上一轮的反馈
        if round_num > 1 and self.history:
            prev = self.history[-1]
            lines.append(f"\n### 上一轮质检结果（第{prev['round']}轮，{prev['score']}分）")
            for issue in prev.get("issues_summary", []):
                lines.append(f"- {issue}")
            lines.append("\n请重点检查上述问题是否已修正。")

        return "\n".join(lines)

    async def _llm_judge(
        self,
        qa_context: str,
        cost_tracker: Dict[str, Any],
        model: str = None,
        temperature: float = 0.2,
        max_tokens: int = 1500,
        insights_count: int = 0,
    ) -> Optional[Dict[str, Any]]:
        """调LLM做质检判断，返回结构化结果"""

        try:
            from ..utils.llm_client import llm
            if not llm.is_available():
                logger.warning("[质检官] LLM不可用，使用规则质检")
                return None

            user_prompt = f"""请对以下分析师产出进行质检：

{qa_context}

请严格按JSON格式输出质检结果。"""

            messages = [
                {"role": "system", "content": QA_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ]

            response = await llm.chat(messages, model=model, temperature=temperature, max_tokens=max_tokens)

            # 记录Token消耗（从API response获取真实值）
            usage = getattr(llm, 'last_usage', {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            # 兜底：如果API未返回usage（如降级模式），用字符估算
            if input_tokens == 0:
                input_tokens = len(qa_context) + len(QA_SYSTEM_PROMPT)
            if output_tokens == 0:
                output_tokens = len(response)
            total_tokens = usage.get("total_tokens", input_tokens + output_tokens)
            model_used = usage.get("model", model or "规则引擎")

            cost_tracker["calls"].append({
                "agent": "质检官",
                "round": self.round_count,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens,
                "model": model_used
            })

            # 解析JSON
            text = response.strip()
            start = text.find("{")
            end = text.rfind("}") + 1
            if start < 0 or end <= start:
                logger.warning(f"[质检官] LLM响应无法解析为JSON")
                return None

            json_str = text[start:end]
            parsed = json.loads(json_str)

            # 提取issues、thought和challenges
            items = parsed.get("items", [])
            issues = []
            check_thoughts = []  # 每个检查项的思考过程
            all_challenges = []   # 所有挑战（考虑过但没打回的问题）
            feedback_to: Dict[str, Dict[str, Any]] = {}

            for item in items:
                # 收集思考过程
                if item.get("thought"):
                    check_thoughts.append({
                        "check": item.get("check", "?"),
                        "result": item.get("result", "pass"),
                        "thought": item["thought"]
                    })
                # 收集挑战
                for ch in item.get("challenges", []):
                    all_challenges.append(ch)

                if item.get("result") == "fail":
                    issue = {
                        "criterion": item.get("check", "未分类"),
                        "detail": item.get("detail", "质检未通过"),
                        "agent": item.get("agent", "小赵"),
                        "insight_index": item.get("insight_index"),
                        "fix": item.get("fix", "")
                    }
                    issues.append(issue)

                    # 构建反馈
                    agent_name = item.get("agent", "小赵")
                    idx = item.get("insight_index")
                    if agent_name and idx is not None:
                        if agent_name not in feedback_to:
                            feedback_to[agent_name] = {"rewrite": [], "keep": []}
                        feedback_to[agent_name]["rewrite"].append(idx)

            # 为有反馈的agent构建keep列表
            for agent_name, fb in feedback_to.items():
                actual_count = insights_count if insights_count > 0 else 10
                all_indices = list(range(actual_count))
                rewrite_set = set(fb["rewrite"])
                fb["keep"] = [i for i in all_indices if i not in rewrite_set]

            score = parsed.get("score", 50)
            score = max(0, min(100, score))  # 钳制

            return {
                "score": score,
                "passed": score >= PASS_THRESHOLD,
                "issues": issues,
                "feedback_to": feedback_to,
                "thinking": check_thoughts,      # 质检思考过程
                "challenges": all_challenges,     # 考虑过但没打回的问题
                "cost": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": total_tokens,
                    "model": model_used
                }
            }

        except json.JSONDecodeError as e:
            logger.error(f"[质检官] JSON解析失败: {e}")
            return None
        except Exception as e:
            logger.error(f"[质检官] LLM质检异常: {e}")
            return None

    def _rule_based_judge(
        self,
        chen_profile: Dict[str, Any],
        zhao_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """规则引擎降级质检（LLM不可用时）"""

        insights = zhao_result.get("insights", [])
        excluded_cols = {c["name"] for c in chen_profile.get("columns", [])
                         if c.get("action") == "exclude"}

        issues = []
        feedback_to: Dict[str, Dict[str, Any]] = {}
        deductions = 0

        # 废话检测
        VAGUE_PHRASES = [
            "建议进一步分析", "建议重点关注", "分时段安排", "现场流程",
            "建议优化", "建议加强", "数据完整性良好", "可进行深度分析",
            "值得关注", "数据质量整体较好", "建议加强管理"
        ]

        for i, insight in enumerate(insights):
            text = insight.get("text", "")
            category = insight.get("category", "")
            agent = "小赵"

            # 检查1：排除列泄露
            for col_name in excluded_cols:
                if col_name in text:
                    issues.append({
                        "criterion": "排除有效",
                        "detail": f"第{i}条洞察提到了已排除的列「{col_name}」",
                        "agent": agent,
                        "insight_index": i,
                        "fix": f"删除关于「{col_name}」的描述"
                    })
                    deductions += 10

            # 检查2：废话检测
            for phrase in VAGUE_PHRASES:
                if phrase in text:
                    issues.append({
                        "criterion": "无废话",
                        "detail": f"第{i}条包含无信息量模板「{phrase}」",
                        "agent": agent,
                        "insight_index": i,
                        "fix": "删除此条或替换为有具体数字的事实"
                    })
                    deductions += 5
                    break

            # 检查3：建议类是否有数字
            if category == "建议":
                has_number = any(c.isdigit() for c in text)
                if not has_number:
                    issues.append({
                        "criterion": "建议具体",
                        "detail": f"第{i}条建议没有包含任何具体数字",
                        "agent": agent,
                        "insight_index": i,
                        "fix": "补充具体数字依据"
                    })
                    deductions += 10

            # 检查4：洞察是否有数字
            if category != "建议":
                has_number = any(c.isdigit() for c in text)
                if not has_number:
                    issues.append({
                        "criterion": "数字溯源",
                        "detail": f"第{i}条洞察没有引用任何具体数字",
                        "agent": agent,
                        "insight_index": i,
                        "fix": "补充来自数据的具体数字"
                    })
                    deductions += 10

        # 构建feedback_to
        failed_indices = set()
        for issue in issues:
            idx = issue.get("insight_index")
            agent = issue.get("agent", "小赵")
            if idx is not None:
                if agent not in feedback_to:
                    feedback_to[agent] = {"rewrite": [], "keep": []}
                feedback_to[agent]["rewrite"].append(idx)
                failed_indices.add(idx)

        # 补全keep列表
        for agent, fb in feedback_to.items():
            rewrite_set = set(fb["rewrite"])
            fb["keep"] = [i for i in range(len(insights)) if i not in rewrite_set]

        score = max(0, 100 - deductions)
        passed = score >= PASS_THRESHOLD

        return {
            "score": score,
            "passed": passed,
            "issues": issues,
            "feedback_to": feedback_to,
            "cost": {
                "input_tokens": 0,
                "output_tokens": 0,
                "model": "规则引擎"
            }
        }

    def get_history(self) -> List[Dict[str, Any]]:
        """返回所有轮次的质检历史"""
        return self.history

    def get_final_summary(self) -> Dict[str, Any]:
        """返回最终质检总结"""
        return {
            "total_rounds": self.round_count,
            "history": self.history,
            "final_score": self.history[-1]["score"] if self.history else None,
            "final_passed": self.history[-1]["passed"] if self.history else False
        }

    async def discuss(
        self,
        context: str,
        chen_profile: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        讨论室模式：质检官实时参与讨论，像开会一样质疑。

        Args:
            context: discussion_context构建的纯文本上下文
            chen_profile: 数据画像（用于排除列检查）

        Returns:
            {"message": str, "mentions": list, "triggers": list}
        """
        from ..utils import llm

        # 提取排除列信息（给质检官参考）
        excluded = [c["name"] for c in chen_profile.get("columns", [])
                    if c.get("action") == "exclude"]
        exclude_note = ""
        if excluded:
            exclude_note = f"\n\n排除列（不得出现在讨论中）：{', '.join(excluded)}"

        # 自进化：注入历史经验（质检官记住之前查出过什么问题）
        from .agent_memory import get_agent_memory
        experience = get_agent_memory().build_experience_prompt("质检官")

        prompt = f"""你是质检官，正在参与团队讨论。你是实时参与，不是事后检查。
{experience}
讨论上下文：
{context}
{exclude_note}

讨论上下文：
{context}
{exclude_note}

职责：
1. 当其他Agent的发言有数据来源不明确、逻辑跳跃、推测性表述时，@对方 直接指出
2. 如果对方修正了你说的问题，回应"收到"或继续追问
3. 不要输出格式化检查清单，像开会一样说话
4. 如果你认为讨论已充分（没有新问题需要质疑），triggers 设为空
5. 如果你发现讨论有重要方向性问题，triggers 设为["老林"]让他补充
6. 发言控制在2-3句话

请输出JSON格式：
{{"message": "你的发言", "mentions": ["你引用了谁"], "triggers": ["下一步谁"]}}
只输出JSON。"""

        try:
            raw = await llm.chat([{"role": "user", "content": prompt}], temperature=0.3)
            return self._parse_discuss_output(raw)
        except Exception as e:
            logger.error(f"[质检官] 讨论发言失败: {e}")
            return {
                "message": f"[系统] 质检官发言失败: {str(e)}",
                "mentions": [],
                "triggers": []
            }

    def _parse_discuss_output(self, raw: str) -> Dict[str, Any]:
        """解析质检官的讨论输出JSON"""
        if not raw:
            return {"message": "", "mentions": [], "triggers": []}

        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)

        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                parsed.setdefault("message", str(parsed))
                parsed.setdefault("mentions", [])
                parsed.setdefault("triggers", [])
                return parsed
        except json.JSONDecodeError:
            pass


        return {"message": raw, "mentions": [], "triggers": []}

    async def generate_lessons(
        self,
        qa_result: Dict[str, Any],
        discussion_context: List[Dict[str, Any]],
        analysis_domain: str = "通用",
    ) -> Dict[str, List[str]]:
        """
        自进化入口：从质检结果中提取经验教训并写入Agent记忆。
        
        两种提取路径：
        1. inspect模式的issues → 结构化经验
        2. discuss模式的讨论转向 → 质疑→修正经验

        Args:
            qa_result: 质检结果（inspect返回或discuss上下文）
            discussion_context: 完整讨论上下文
            analysis_domain: 分析领域（用于经验分类）

        Returns:
            {agent_name: [lesson1, lesson2, ...]}
        """
        from .agent_memory import get_agent_memory

        memory = get_agent_memory()

        # 路径1：从inspect的issues提取
        lessons_by_agent = memory.generate_lessons_from_qa(
            qa_result, discussion_context, analysis_domain
        )

        # 路径2：如果issues为空（讨论模式），LLM反思提取
        if not lessons_by_agent:
            try:
                llm_lessons = await self._llm_reflect(discussion_context)
                if llm_lessons:
                    memory.add_lessons(
                        agent=llm_lessons.get("agent", "通用"),
                        contents=llm_lessons.get("lessons", []),
                        domain=analysis_domain,
                        source="self_reflect",
                    )
                    lessons_by_agent = {llm_lessons["agent"]: llm_lessons["lessons"]}
            except Exception as e:
                logger.debug(f"[质检官] LLM反思提取经验失败: {e}")

        total = sum(len(v) for v in lessons_by_agent.values())
        if total > 0:
            logger.info(f"[自进化] 提取了{total}条经验教训: {list(lessons_by_agent.keys())}")

        return lessons_by_agent

    async def _llm_reflect(
        self,
        discussion_context: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        LLM反思模式：让质检官从讨论过程中总结经验教训。
        用于没有显式issues的场景（如discuss模式）。
        """
        from ..utils import llm

        if not llm.is_available():
            return None

        # 只取Agent发言（跳过system消息）
        agent_msgs = [
            f"[{m['role']}]: {m['content'][:200]}"
            for m in discussion_context
            if m.get("role") not in ("system", "user") and m.get("content")
        ]

        if not agent_msgs:
            return None

        prompt = f"""请从以下AI分析师的讨论中，总结出最有价值的经验教训。
这些经验将帮助分析师们在未来的分析中做得更好。

讨论记录：
{chr(10).join(agent_msgs[-10:])}

请输出JSON格式：
{{
    "agent": "最需要改进的Agent名",
    "lessons": [
        "具体的经验教训1（要通用化，不要引用特定数据）",
        "具体的经验教训2"
    ]
}}
只输出JSON，不要其他文字。"""

        try:
            raw = await llm.chat(
                [{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=300,
            )
            text = raw.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                lines = [l for l in lines if not l.strip().startswith("```")]
                text = "\n".join(lines)
            parsed = json.loads(text)
            if isinstance(parsed, dict) and "lessons" in parsed:
                return parsed
        except Exception as e:
            logger.debug(f"[质检官] 反思解析失败: {e}")

        return None


# 单例
_guard_instance: Optional[QualityGuard] = None

def get_guard() -> QualityGuard:
    global _guard_instance
    if _guard_instance is None:
        _guard_instance = QualityGuard()
    return _guard_instance
