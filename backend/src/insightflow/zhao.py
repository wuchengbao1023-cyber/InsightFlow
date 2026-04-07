"""
小赵 - 策略顾问 (Strategist)
===================================

职责：拿到老陈+老林+老王的所有结果，用LLM写有意义的洞察。
特点：这是唯一大量调LLM的地方，洞察分4类：过去/现在/未来/建议。

输入：chen_profile + lin_result（含老王的forecast）
输出：
    {
        "insights": [
            {"level": "key", "category": "过去", "text": "..."},
            {"level": "key", "category": "现在", "text": "..."},
            {"level": "forecast", "category": "未来", "text": "..."},
            {"level": "advice", "category": "建议", "text": "..."},
        ],
        "contradictions": [...],
        "data_quality_notes": [...]
    }

关键原则：
- 每条洞察必须引用具体数字，数字必须来自老陈/老林/老王的输出
- 没有预测数据时，"未来"类洞察改为"趋势延伸推断"
- 如果老林说趋势A，老王预测结果是B的反方向，必须在contradictions里标注
- 绝对不能编数字，只能用数据中存在的
"""

import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


STRATEGIST_SYSTEM_PROMPT = """你是一名资深数据策略顾问，擅长从数据分析结果中提炼洞察，给出有价值的战略建议。

你的铁律（违反任何一条，你的输出将被丢弃）：
1. 每条洞察必须引用具体数字——数字必须来自提供的数据，绝对禁止编造
2. 禁止出现以下废话：
   - "建议进一步分析" / "建议重点关注" / "建议优化"（没有具体对象的）
   - "分时段安排" / "现场流程" / "分批处理"（数据里没有的概念）
   - "建议对XXX进行关注"（关注什么？怎么关注？）
3. 每条"建议"必须包含：具体对象（哪个部门/专业/地区）+ 具体数字 + 具体行动
4. 如果数据是招录/考试类，用行业术语：竞争比、进面、上岸、红海岗位、洼地岗位
5. 如果数据是销售/财务类，用行业术语：增速、占比、环比、同比、头部效应
6. 禁止对已被标记为"排除"的列（序号、姓名、编号）做任何分析
7. 洞察分4类：过去（历史规律）、现在（当前状态）、未来（趋势预测）、建议（可操作）
8. 发现数据矛盾时，必须如实标注，不要掩盖
9. 使用中文，语言简洁有力，每条不超过100字"""


class StrategyConsultant:
    """小赵 - 策略顾问：LLM驱动，提炼洞察，分过去/现在/未来/建议"""

    def __init__(self):
        self.name = "小赵"
        self.role = "策略顾问"
        logger.info(f"🧠 {self.name}({self.role}) 上线")

    async def advise(
        self,
        chen_profile: Dict[str, Any],
        lin_result: Dict[str, Any],
        llm_strategy: str = "moderate"
    ) -> Dict[str, Any]:
        """
        基于前三人的结果，用LLM生成洞察和建议。

        Args:
            chen_profile: 老陈画像
            lin_result: 老林+老王结果
            llm_strategy: "minimal" | "moderate" | "deep"（由老陈complexity决定）
        """
        logger.info(f"[小赵] 开始生成洞察: {chen_profile.get('file', '?')}, 策略: {llm_strategy}")

        # 1. 提取关键数字，构建数据摘要
        data_summary = self._build_data_summary(chen_profile, lin_result)

        # 2. 检测矛盾
        contradictions = self._detect_contradictions(lin_result)

        # 3. 根据策略选择模型
        from ..utils.llm_client import LLMClient, get_model_config
        model_cfg = get_model_config("小赵_生成", llm_strategy)
        model_name = model_cfg["model"]
        logger.info(f"[小赵] 模型路由: {model_name or '规则引擎'}（{model_cfg['reason']}）")

        # 4. 调LLM生成洞察（使用全局单例，避免丢失last_usage追踪）
        insights = []
        try:
            from ..utils.llm_client import llm as _llm
            _llm_inst = _llm
            if _llm_inst.is_available() and model_name:
                insights = await self._llm_generate_insights(
                    _llm_inst, data_summary, contradictions,
                    model=model_name,
                    temperature=model_cfg["temperature"],
                    max_tokens=model_cfg["max_tokens"],
                    target_count=8 if llm_strategy == "minimal" else 12 if llm_strategy == "deep" else 8,
                )
            else:
                # LLM不可用或策略指定不用LLM
                insights = self._rule_based_insights(chen_profile, lin_result)
                if not model_name:
                    logger.info("[小赵] 策略指定规则引擎模式")
                else:
                    logger.warning("[小赵] LLM不可用，使用规则生成洞察")
        except Exception as e:
            logger.error(f"[小赵] LLM调用失败: {e}")
            insights = self._rule_based_insights(chen_profile, lin_result)

        # 5. 数据质量备注
        quality_notes = self._collect_quality_notes(chen_profile, lin_result)

        result = {
            "insights": insights,
            "contradictions": contradictions,
            "data_quality_notes": quality_notes,
            "data_summary_used": data_summary,
            "_agent": self.name,
            "_model_used": model_name or "规则引擎",
            "_llm_strategy": llm_strategy,
            "timestamp": datetime.now().isoformat()
        }

        logger.info(f"[小赵] 完成: {len(insights)}条洞察, 模型={model_name or '规则引擎'}")
        return result

    def _build_data_summary(
        self, chen_profile: Dict[str, Any], lin_result: Dict[str, Any]
    ) -> str:
        """把老陈+老林+老王的关键数字整理成文字摘要，喂给LLM"""
        lines = []
        file_name = chen_profile.get("file", "数据文件")
        shape = chen_profile.get("shape", [0, 0])
        lines.append(f"## 数据概况")
        lines.append(f"- 文件：{file_name}")
        lines.append(f"- 规模：{shape[0]}行 × {shape[1]}列")
        quality = chen_profile.get("quality", {})
        lines.append(f"- 质量评分：{quality.get('score', 'N/A')}/100（缺失率{quality.get('missing_rate', 'N/A')}）")

        # ── 排除列警告（直接告诉LLM哪些列不能分析）──────────────────
        excluded_cols = [
            c for c in chen_profile.get("columns", [])
            if c.get("action") == "exclude"
        ]
        if excluded_cols:
            excluded_names = [f"{c['name']}（{c.get('exclude_reason', '无意义')}）" for c in excluded_cols]
            lines.append(f"\n⚠️ 已排除列（禁止分析、禁止提及）：{', '.join(excluded_names)}")
            lines.append(f"⚠️ 特别注意：不得对上述列做任何统计或洞察")

        # 有效列信息
        lines.append(f"\n## 有效数据列")
        for col in chen_profile.get("columns", []):
            if col.get("action") == "exclude":
                continue  # 排除列不展示给LLM
            col_type = col.get("type", "?")
            name = col.get("name", "?")
            role = col.get("role", col_type)
            stats = col.get("stats") or {}
            agg = col.get("aggregate_value")
            primary_tag = "【主指标】" if col.get("is_primary") else ""
            if col_type == "numeric" and stats:
                lines.append(f"- {primary_tag}{name}（{role}）: "
                              f"范围[{stats.get('min')}, {stats.get('max')}], "
                              f"均值{stats.get('mean')}, 中位数{stats.get('median')}")
            elif col_type == "time":
                if stats:
                    lines.append(f"- {name}（时间）: 范围[{int(stats.get('min', 0))}, {int(stats.get('max', 0))}]")
                else:
                    lines.append(f"- {name}（时间）")
            elif col_type == "category":
                agg_note = f"，汇总值={agg}" if agg else ""
                lines.append(f"- {name}（{role}, {col.get('unique_count', '?')}种值{agg_note}）: "
                              f"样本{col.get('sample_values', [])[:3]}")

        # 分析结果
        lines.append(f"\n## 分析发现（老林+老王）")
        for analysis in lin_result.get("analyses", []):
            lines.append(f"\n### {analysis.get('title', analysis.get('id'))}")
            lines.append(f"  过滤条件: {analysis.get('filters', '全量')}")
            lines.append(f"  摘要: {analysis.get('summary', '')}")
            if analysis.get("trend"):
                lines.append(f"  趋势: {analysis['trend']} ({analysis.get('change_pct', 0):+.1f}%)")

            # 预测信息
            forecast = analysis.get("forecast")
            if forecast and forecast.get("available"):
                preds = forecast.get("predictions", [])
                if preds:
                    pred_str = ", ".join([f"{p['x']}年预测{p['y']}" for p in preds[:3]])
                    lines.append(f"  预测（R²={forecast['r_squared']}, 置信度{forecast['confidence']}）: {pred_str}")
            elif forecast and not forecast.get("available"):
                lines.append(f"  预测: {forecast.get('reason', '无法预测')}")

            # 关键数据点（最多5个）
            data_pts = [p for p in analysis.get("data", []) if p.get("type") != "predicted"]
            if data_pts and len(data_pts) <= 10:
                lines.append(f"  数据: {data_pts}")
            elif data_pts:
                lines.append(f"  数据（首尾各3个）: 开始={data_pts[:3]}, 结尾={data_pts[-3:]}")

        # 老王的异常发现
        forecaster_summary = lin_result.get("_forecaster_summary", {})
        anomalies = forecaster_summary.get("anomalies", [])
        if anomalies:
            lines.append(f"\n## 老王发现的异常点")
            for a in anomalies:
                lines.append(f"  ⚠ {a}")

        # 无预测提示
        forecasted = forecaster_summary.get("forecasted", 0)
        if forecasted == 0:
            lines.append(f"\n## 预测说明")
            lines.append(f"  本数据集无时间趋势列，老王未执行预测。")
            lines.append(f"  '未来'类洞察请基于现状规律进行合理推断，但须注明'基于现状推断'。")

        return "\n".join(lines)

    async def _llm_generate_insights(
        self, llm, data_summary: str, contradictions: List[str],
        model: str = None, temperature: float = 0.5,
        max_tokens: int = 1500, target_count: int = 8
    ) -> List[Dict[str, Any]]:
        """调LLM生成结构化洞察"""

        contradiction_note = ""
        if contradictions:
            contradiction_note = "\n\n注意以下数据矛盾，必须在洞察中提及：\n" + "\n".join(f"- {c}" for c in contradictions)

        user_prompt = f"""请基于以下数据分析结果，生成4-8条洞察。

{data_summary}{contradiction_note}

请严格按照以下JSON格式返回，不要有任何额外文字：
{{
    "insights": [
        {{"level": "key", "category": "过去", "text": "基于数据中实际数字的历史洞察",
          "ref": {{"agent": "老林", "finding": "具体数据发现"}},
          "reasoning": "从这个发现得出该洞察的推理过程"}},
        {{"level": "key", "category": "现在", "text": "当前状态洞察，必须包含具体部门/分类名称和数字",
          "ref": {{"agent": "老林", "finding": "具体数据发现"}},
          "reasoning": "推理过程"}},
        {{"level": "forecast", "category": "未来", "text": "基于预测数字的前瞻（无预测则基于现状推断并注明）",
          "ref": null,
          "reasoning": "基于XX现象推测"}},
        {{"level": "advice", "category": "建议", "text": "具体可操作的建议，格式：[具体对象]+[具体数字]+[具体行动]",
          "ref": {{"agent": "老林", "finding": "数据依据"}},
          "reasoning": "为什么这么建议"}}
    ]
}}

关于ref字段（数据来源引用）：
- ref.agent: 此条洞察的数据来自哪个Agent（"老陈"/"老林"/"老王"）
- ref.finding: 具体引用的数据发现内容（一句话概括）
- 如果是推测性洞察（无直接数据支撑），ref设为null

关于reasoning字段（推理过程）：
- 用一句话解释"我为什么从那个数据发现得出这个洞察"
- 如果是推测，明确说"基于XX现象推测"
- 不要超过30字

死规则（违反则输出无效）：
1. 每条 text 必须包含具体数字（来自上面的数据，不能编造）
2. 建议类禁止出现：
   - "建议进一步分析" / "建议重点关注某指标"
   - "分时段安排" / "现场流程优化" 等数据中没有的内容
   - 空泛的"建议加强XXX管理"
3. 建议类必须格式：具体对象 + 数字依据 + 具体行动
4. 禁止分析被标记为排除的列（序号、姓名、编号等）
5. 如数据是招录/考试类，用：竞争比、进面、上岸、红海岗位、洼地岗位
6. 共生成{target_count}条，过去/现在/未来/建议 各至少1条"""

        messages = [
            {"role": "system", "content": STRATEGIST_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]

        try:
            response = await llm.chat(
                messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            # 解析JSON
            text = response.strip()
            # 找到JSON部分
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                json_str = text[start:end]
                parsed = json.loads(json_str)
                insights = parsed.get("insights", [])
                # 验证格式 + 过滤无效条目
                valid_insights = []
                for item in insights:
                    if isinstance(item, dict) and item.get("text") and item.get("category"):
                        text_content = item["text"]
                        # 过滤明显废话（没有数字的"建议"类）
                        if item.get("category") == "建议":
                            has_number = any(c.isdigit() for c in text_content)
                            has_vague = any(v in text_content for v in [
                                "建议进一步", "建议重点关注", "分时段", "现场流程",
                                "建议优化", "建议加强", "关注该指标"
                            ])
                            if has_vague and not has_number:
                                logger.warning(f"[小赵] 过滤废话建议: {text_content[:50]}")
                                continue
                        valid_insights.append({
                            "level": item.get("level", "key"),
                            "category": item.get("category", "现在"),
                            "text": text_content,
                            "ref": item.get("ref"),          # 数据来源引用
                            "reasoning": item.get("reasoning")  # 推理过程
                        })
                logger.info(f"[小赵] LLM生成了{len(valid_insights)}条洞察")
                return valid_insights
        except Exception as e:
            logger.error(f"[小赵] LLM响应解析失败: {e}")

        return []

    async def rewrite(
        self,
        chen_profile: Dict[str, Any],
        lin_result: Dict[str, Any],
        existing_insights: List[Dict[str, Any]],
        feedback: Dict[str, Any],
        cost_tracker: Dict[str, Any],
        llm_strategy: str = "moderate"
    ) -> List[Dict[str, Any]]:
        """
        质检反馈后，只重写指定条目（不是全部重写）。

        Args:
            chen_profile: 老陈的画像
            lin_result: 老林+老王的结果
            existing_insights: 当前全部洞察
            feedback: 质检反馈 {"rewrite": [3, 5], "keep": [0, 1, 2, 4]}
            cost_tracker: Token追踪器

        Returns:
            重写后的完整洞察列表
        """
        logger.info(f"[小赵] 开始局部重写，需重写条目: {feedback.get('rewrite', [])}")

        rewrite_indices = set(feedback.get("rewrite", []))
        keep_indices = set(feedback.get("keep", []))

        # 构建反馈摘要
        qa_issues = feedback.get("issues", [])
        feedback_text = "\n".join(
            f"- 第{iss.get('insight_index', '?')}条「{iss.get('criterion', '?')}」: {iss.get('detail', '')} → 建议: {iss.get('fix', '')}"
            for iss in qa_issues
        )

        # 对需要重写的条目调LLM
        data_summary = self._build_data_summary(chen_profile, lin_result)

        try:
            from ..utils.llm_client import llm as _llm, get_model_config
            if _llm.is_available() and model_cfg["model"]:
                new_insights = await self._llm_rewrite_insights(
                    _llm, data_summary, existing_insights, rewrite_indices, feedback_text,
                    model=model_cfg["model"],
                    temperature=model_cfg["temperature"],
                    max_tokens=model_cfg["max_tokens"],
                )
                if new_insights:
                    # 替换指定条目
                    result = list(existing_insights)
                    for idx in rewrite_indices:
                        if idx < len(result) and idx - min(rewrite_indices) < len(new_insights):
                            result[idx] = new_insights[idx - min(rewrite_indices)]

                    # 记录Token（从API获取真实值）
                    usage = getattr(_llm, 'last_usage', {})
                    input_tokens = usage.get("prompt_tokens", len(data_summary) + len(feedback_text))
                    output_tokens = usage.get("completion_tokens", sum(len(i.get("text", "")) for i in new_insights))
                    total_tokens = usage.get("total_tokens", input_tokens + output_tokens)

                    cost_tracker["calls"].append({
                        "agent": "小赵",
                        "action": "rewrite",
                        "rewrite_count": len(rewrite_indices),
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "total_tokens": total_tokens,
                        "model": usage.get("model", _llm.config.DEFAULT_MODEL if hasattr(_llm, 'config') else "deepseek-chat")
                    })

                    logger.info(f"[小赵] 重写完成: 替换了{len(rewrite_indices)}条洞察")
                    return result
        except Exception as e:
            logger.error(f"[小赵] 重写失败: {e}")

        # LLM不可用或失败时，删除有问题的条目
        result = [insight for i, insight in enumerate(existing_insights) if i not in rewrite_indices]
        logger.info(f"[小赵] LLM重写失败，已删除{len(rewrite_indices)}条有问题的洞察")
        return result

    async def _llm_rewrite_insights(
        self,
        llm,
        data_summary: str,
        existing_insights: List[Dict[str, Any]],
        rewrite_indices: set,
        feedback_text: str,
        model: str = None,
        temperature: float = 0.3,
        max_tokens: int = 1000
    ) -> List[Dict[str, Any]]:
        """LLM重写指定条目"""

        # 构建需要重写的条目列表
        rewrite_items = []
        for i in sorted(rewrite_indices):
            if i < len(existing_insights):
                insight = existing_insights[i]
                rewrite_items.append(f"第{i}条 [{insight.get('category', '?')}]: {insight.get('text', '')}")

        user_prompt = f"""以下是质检官的反馈。请根据反馈和数据重写有问题的洞察。

## 质检反馈
{feedback_text}

## 需要重写的洞察
{chr(10).join(rewrite_items)}

## 数据来源（只能用这些数据中的数字）
{data_summary}

请严格按以下JSON格式返回重写后的洞察（只返回重写的条目，不要返回其他条目）：
{{
    "rewritten": [
        {{"level": "key", "category": "过去/现在/未来/建议", "text": "修正后的洞察文本"}}
    ]
}}

死规则：
1. 每条text必须包含具体数字（来自上面的数据）
2. 建议类必须：具体对象 + 数字依据 + 具体行动
3. 禁止废话模板
4. 禁止分析排除列"""

        messages = [
            {"role": "system", "content": STRATEGIST_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]

        response = await llm.chat(messages, model=model, temperature=temperature, max_tokens=max_tokens)
        text = response.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(text[start:end])
            rewritten = parsed.get("rewritten", [])
            valid = []
            for item in rewritten:
                if isinstance(item, dict) and item.get("text") and item.get("category"):
                    valid.append({
                        "level": item.get("level", "key"),
                        "category": item.get("category", "现在"),
                        "text": item["text"]
                    })
            return valid
        return []

    def _rule_based_insights(
        self, chen_profile: Dict[str, Any], lin_result: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """LLM不可用时的规则备用洞察"""
        insights = []
        analyses = lin_result.get("analyses", [])

        for analysis in analyses:
            summary = analysis.get("summary", "")
            if not summary:
                continue

            rule = analysis.get("_rule", "")
            forecast = analysis.get("forecast", {})

            if rule == "A":  # 时间趋势
                trend = analysis.get("trend", "")
                change = analysis.get("change_pct", 0)
                category = "过去" if abs(change) > 0 else "现在"
                insights.append({
                    "level": "key",
                    "category": category,
                    "text": summary
                })
                if forecast and forecast.get("available"):
                    preds = forecast.get("predictions", [])
                    if preds:
                        insights.append({
                            "level": "forecast",
                            "category": "未来",
                            "text": f"预计{preds[0]['x']}年将达到{preds[0]['y']:.2f}（R²={forecast.get('r_squared', '?')}, 置信度{forecast.get('confidence', '?')}）"
                        })
            elif rule in ("B", "C"):  # 对比/排名
                insights.append({
                    "level": "key",
                    "category": "现在",
                    "text": summary
                })

        if not insights:
            insights.append({
                "level": "key",
                "category": "现在",
                "text": f"数据包含{chen_profile.get('shape', [0])[0]}行记录，"
                        f"质量评分{chen_profile.get('quality', {}).get('score', 'N/A')}分"
            })

        return insights

    def _detect_contradictions(self, lin_result: Dict[str, Any]) -> List[str]:
        """检测分析结果中的矛盾"""
        contradictions = []
        for analysis in lin_result.get("analyses", []):
            trend = analysis.get("trend", "")
            forecast = analysis.get("forecast", {})
            if not forecast or not forecast.get("available"):
                continue

            slope = forecast.get("slope", 0)
            if trend == "下降" and slope > 0:
                contradictions.append(
                    f"「{analysis.get('title', analysis['id'])}」：历史趋势为下降，"
                    f"但线性回归预测斜率为正（{slope:.4f}），可能近年趋势已反转"
                )
            elif trend == "上升" and slope < 0:
                contradictions.append(
                    f"「{analysis.get('title', analysis['id'])}」：历史趋势为上升，"
                    f"但线性回归预测斜率为负（{slope:.4f}），数据可能有近期拐点"
                )

        return contradictions

    def _collect_quality_notes(
        self, chen_profile: Dict[str, Any], lin_result: Dict[str, Any]
    ) -> List[str]:
        """收集所有质量备注"""
        notes = list(chen_profile.get("warnings", []))
        anomalies = lin_result.get("_forecaster_summary", {}).get("anomalies", [])
        notes.extend(anomalies)
        return notes

    async def discuss(
        self,
        context: str
    ) -> Dict[str, Any]:
        """
        讨论室模式：小赵普通讨论发言（被触发时）。
        注意：在讨论室架构中，小赵主要通过"共识确认"触发，不应在早期被触发。

        Args:
            context: discussion_context构建的纯文本上下文

        Returns:
            {"message": str, "mentions": list, "triggers": list}
        """
        from ..utils import llm

        # 自进化：注入历史经验
        from .agent_memory import get_agent_memory
        experience = get_agent_memory().build_experience_prompt("小赵")

        prompt = f"""你是策略顾问"小赵"。你在团队讨论中是最后发言的人。
{experience}
讨论上下文：
{context}

规则：
1. 你的发言以"基于以上讨论"开头
2. 必须引用讨论中的具体发现
3. 如果有被质疑修正的结论，必须体现修正过程
4. 像开会一样说话
5. 不设置triggers

请输出JSON格式：
{{"message": "你的发言", "mentions": ["引用了谁"], "triggers": []}}
只输出JSON。"""

        try:
            raw = await llm.chat([{"role": "user", "content": prompt}], temperature=0.4)
            result = self._parse_discuss_output(raw)
            if result:
                result["triggers"] = []  # 小赵普通发言不触发其他人
            return result
        except Exception as e:
            logger.error(f"[小赵] 讨论发言失败: {e}")
            return {
                "message": f"[系统] 小赵发言失败: {str(e)}",
                "mentions": [],
                "triggers": []
            }

    async def discuss_consensus(
        self,
        context: str
    ) -> Dict[str, Any]:
        """
        讨论室模式：小赵共识确认（收敛检测触发）。
        总结讨论达成的共识，标注每条结论的来源和质检状态。

        Args:
            context: discussion_context构建的纯文本上下文

        Returns:
            {
                "message": str,
                "mentions": list,
                "triggers": list,
                "consensus": [{"text": str, "source": str, "qa_status": str}],
                "unresolved": list
            }
        """
        from ..utils import llm

        prompt = f"""你是策略顾问"小赵"。讨论即将结束，请做最终共识确认。

讨论上下文：
{context}

请按以下格式输出JSON：
{{
  "message": "基于以上讨论，团队达成了以下共识：\\n1. XXX — 老林发现，质检确认\\n2. YYY — 质疑后修正\\n...",
  "mentions": ["老林", "质检官"],
  "triggers": [],
  "consensus": [
    {{"text": "共识内容", "source": "老林", "qa_status": "confirmed"}},
    {{"text": "共识内容", "source": "质检修正后", "qa_status": "corrected"}}
  ],
  "unresolved": ["未解决的分歧（如有）"]
}}
只输出JSON。"""

        try:
            raw = await llm.chat([{"role": "user", "content": prompt}], temperature=0.3)
            result = self._parse_discuss_output(raw)
            if result:
                # 共识确认后triggers强制为空
                result["triggers"] = []
                # 确保有consensus字段
                result.setdefault("consensus", [])
                result.setdefault("unresolved", [])
            return result
        except Exception as e:
            logger.error(f"[小赵] 共识确认失败: {e}")
            return {
                "message": "讨论结束，请查看上方讨论记录。",
                "mentions": [],
                "triggers": [],
                "consensus": [],
                "unresolved": []
            }

    def _parse_discuss_output(self, raw: str) -> Optional[Dict[str, Any]]:
        """解析小赵的讨论输出JSON"""
        if not raw:
            return None

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


# 单例
_zhao_instance: Optional[StrategyConsultant] = None

def get_zhao() -> StrategyConsultant:
    global _zhao_instance
    if _zhao_instance is None:
        _zhao_instance = StrategyConsultant()
    return _zhao_instance
