"""
InsightFlow 讨论室协调器 v3
=============================

从"固定流水线"彻底重写为"多Agent讨论室"模式。

核心概念：
- discussion_context：共享讨论上下文，所有Agent的每一条发言都追加到这里
- pending_agents：待执行Agent队列，由Agent的triggers驱动
- 收敛检测：连续平静轮 / has_triggers → 自动结束或触发小赵共识确认
- need_sql：老林请求补充SQL时，后端拦截执行并重新触发老林

新SSE事件流：
- data_ready: 数据扫描完成，等待用户任务
- agent_message: Agent发言（流式）
- round_end: 本轮结束
- turn_highlight: 讨论转向标记
- discussion_end: 讨论结束（含统计）
- report_ready: 最终报告
- error: 错误
- cost_update: 成本更新

P0范围：只做讨论引擎骨架 + SSE，不含Agent Prompt改造（P1-P3）。
"""

import asyncio
import json
import logging
from typing import Dict, Any, AsyncGenerator, Optional, List, Set
from datetime import datetime

logger = logging.getLogger(__name__)

# ── 讨论引擎常量 ──────────────────────────────────────────────
MAX_ROUNDS = 5           # 最大讨论轮次
MAX_CONTEXT_TOKENS = 15000  # 上下文截断阈值（token估算）
KEEP_RECENT_ROUNDS = 2   # 上下文截断时保留最近N轮完整发言
CALM_THRESHOLD = 1       # 连续平静轮阈值（历史有触发时）
CALM_THRESHOLD_NO_HISTORY = 2  # 连续平静轮阈值（历史无触发时）
AGENT_COLORS = {
    "老陈": "#3B82F6",
    "老林": "#10B981",
    "老王": "#8B5CF6",
    "小赵": "#F59E0B",
    "质检官": "#EF4444",
    "小李": "#6B7280",
}


class DiscussionState:
    """讨论室全局状态"""

    def __init__(self):
        self.discussion_context: List[Dict[str, Any]] = []
        self.pending_agents: List[str] = []
        self.round_executed: Set[str] = set()
        self.round_number: int = 0
        self.calm_rounds: int = 0
        self.has_triggers: bool = False
        self.max_round: int = MAX_ROUNDS
        self.zhao_triggered: bool = False  # 小赵是否已被触发过（共识确认）

        # 工作产物（不放discussion_context）
        self.chen_profile: Optional[Dict[str, Any]] = None
        self.lin_precomputed: Optional[Dict[str, Any]] = None
        self.wang_results: Optional[Dict[str, Any]] = None
        self.current_task: Optional[str] = None
        self.table_name: Optional[str] = None

        # 统计
        self.message_count: int = 0
        self.question_count: int = 0
        self.correction_count: int = 0

        # Token追踪
        self.cost_tracker: Dict[str, Any] = {
            "calls": [],
            "total_input_tokens": 0,
            "total_output_tokens": 0,
        }

        # 质检历史（用于报告中的质检记录板块）
        self.qa_history: List[Dict[str, Any]] = []

    def reset(self):
        """重置讨论状态（开始新一轮讨论）"""
        self.__init__()


class InsightFlowOrchestrator:
    """讨论室协调器 v3 — 管理多Agent围绕议题进行多轮讨论"""

    def __init__(self):
        from .chen import get_chen
        from .lin import get_lin
        from .wang import get_wang
        from .zhao import get_zhao
        from .li import get_li
        from .guard import get_guard

        self.chen = get_chen()
        self.lin = get_lin()
        self.wang = get_wang()
        self.zhao = get_zhao()
        self.li = get_li()
        self.guard = get_guard()

        self.state = DiscussionState()

    # ═══════════════════════════════════════════════════════════
    # 公开方法
    # ═══════════════════════════════════════════════════════════

    async def scan_data(self, table_name: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        文件上传后只做数据扫描，不分析。
        返回SSE事件流，前端收到data_ready后显示输入框等待用户任务。
        """
        yield {"type": "agent_start", "data": {"agent": "老陈", "step": "scan", "desc": "正在扫描数据..."}}

        try:
            chen_profile = await self.chen.profile(table_name)
        except Exception as e:
            yield {"type": "error", "data": {"message": f"数据扫描失败: {str(e)}"}}
            return

        if chen_profile.get("_error"):
            yield {"type": "error", "data": {"message": f"数据扫描失败: {chen_profile['_error']}"}}
            return

        # 存入全局状态
        self.state.chen_profile = chen_profile
        self.state.table_name = table_name

        # 生成讨论摘要（100-200 token的发言文本）
        summary = self._generate_scan_summary(chen_profile)
        self.state.discussion_context.append({
            "role": "老陈",
            "content": summary,
            "mentions": [],
            "triggers": [],
            "round": 0,
            "meta": {"questioned": False, "corrected": False}
        })

        yield {
            "type": "agent_message",
            "data": {
                "agent": "老陈",
                "round": 0,
                "message": summary,
                "meta": {"questioned": False, "corrected": False},
                "color": AGENT_COLORS.get("老陈", "#666")
            }
        }

        shape = chen_profile.get("shape", [0, 0])
        columns = chen_profile.get("columns", [])
        excluded = [c for c in columns if c.get("action") == "exclude"]

        yield {
            "type": "data_ready",
            "data": {
                "table_name": table_name,
                "total_rows": shape[0],
                "total_columns": len(columns),
                "excluded_columns": len(excluded),
                "profile_summary": self._chen_brief(chen_profile),
                "has_time": any(c.get("type") == "time" for c in columns),
                "has_metric": any(c.get("role") in ("metric", "primary") for c in columns)
            }
        }

        logger.info(f"[讨论室] 数据扫描完成: {table_name}, {shape[0]}行{shape[1]}列")

    async def start_discussion(
        self, task: str, table_name: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        用户下达任务，启动讨论。
        流程：预计算 → 执行循环 → 收敛 → 报告
        """
        if table_name:
            self.state.table_name = table_name

        if not self.state.chen_profile:
            yield {"type": "error", "data": {"message": "数据未扫描，请先上传文件"}}
            return

        # 重置讨论状态（保留chen_profile和table_name）
        chen_profile = self.state.chen_profile
        saved_table = self.state.table_name
        self.state.reset()
        self.state.chen_profile = chen_profile
        self.state.table_name = saved_table
        self.state.current_task = task

        # 重置推理链（每次新分析）
        from .reasoning_chain import reset_reasoning_chain
        reset_reasoning_chain()

        # 初始化数据侦探（加载schema）
        from .nl2sql import get_detective
        detective = get_detective()
        if chen_profile:
            detective.set_schema(saved_table, chen_profile)
            logger.info(f"[讨论室] 数据侦探已就绪, schema: {saved_table}")

        start_time = datetime.now()

        # 追加用户任务到上下文
        self._append_message("user", task, mentions=[], triggers=[])
        yield {
            "type": "agent_message",
            "data": {
                "agent": "user",
                "round": 0,
                "message": task,
                "meta": {},
                "color": "#38BDF8"
            }
        }

        # ── 预计算阶段（老林）────────────────────────────────────
        try:
            lin_result = await self.lin.analyze(chen_profile, self.state.table_name)
            self.state.lin_precomputed = lin_result

            # 老王预测（如果有时间列）
            has_time = any(
                c.get("type") == "time" for c in chen_profile.get("columns", [])
            )
            if has_time:
                lin_result = await self.wang.forecast(lin_result)
                self.state.lin_precomputed = lin_result

        except Exception as e:
            logger.error(f"[讨论室] 预计算失败: {e}")
            yield {"type": "error", "data": {"message": f"数据预计算失败: {str(e)}"}}
            return

        # ── 触发初始Agent ───────────────────────────────────────
        self.state.round_number = 1
        self.state.round_executed.clear()

        # 根据问题类型选择参与Agent（全员协作模式）
        selected_agents = self._select_analysis_team(task)
        
        # 发送"组成分析团队"消息（格式：[{role, name}...]，匹配前端期望）
        agents_payload = [{"role": a, "name": self._get_agent_display_name(a)} for a in selected_agents]
        yield {
            "type": "team_selected",
            "data": {
                "agents": agents_payload,
                "task": task
            }
        }
        
        # 初始触发：邀请选中的所有Agent（并行参与）
        for agent in selected_agents:
            if agent not in self.state.pending_agents:
                self.state.pending_agents.append(agent)
        
        logger.info(f"[讨论室] 分析团队组成: {selected_agents}, 任务: {task}")

        # ── 核心执行循环 ─────────────────────────────────────────
        while True:
            # 收敛检测
            if not self.state.pending_agents:
                should_end = await self._check_convergence()
                if should_end == "end":
                    break
                elif should_end == "zhao":
                    self.state.pending_agents.append("小赵_共识")
                    self.state.zhao_triggered = True
                else:
                    # continue 或未知 → 队列仍空，强制结束避免空pop
                    logger.warning(f"[讨论室] 收敛返回'{should_end}'但队列为空，结束讨论")
                    break

            # 超过最大轮次
            if self.state.round_number > self.state.max_round:
                logger.warning(f"[讨论室] 达到最大轮次{self.state.max_round}，强制结束")
                break

            # 二次检查：收敛检测后队列仍可能为空
            if not self.state.pending_agents:
                break

            # 取出下一个Agent
            agent_key = self.state.pending_agents.pop(0)
            agent_name = agent_key.split("_")[0]

            # 防同轮重复触发
            if agent_name in self.state.round_executed:
                logger.debug(f"[讨论室] {agent_name}本轮已执行，跳过")
                continue

            self.state.round_executed.add(agent_name)

            # ── 执行Agent ───────────────────────────────────────
            try:
                async for event in self._execute_agent(agent_key):
                    yield event
            except Exception as e:
                logger.error(f"[讨论室] {agent_key}执行失败: {e}", exc_info=True)
                yield {"type": "error", "data": {"message": f"{agent_name}执行出错: {str(e)}"}}
                # 不中断讨论，继续处理队列

            # 检查轮次结束
            if not self.state.pending_agents:
                self.state.round_number += 1
                self.state.round_executed.clear()
                yield {
                    "type": "round_end",
                    "data": {"round": self.state.round_number - 1}
                }
                self._append_message("system", f"—— 第{self.state.round_number - 1}轮结束 ——", meta={})

        # ── 讨论结束 ────────────────────────────────────────────
        total_rounds = self.state.round_number - 1
        self._append_message(
            "system",
            f"讨论结束，共{total_rounds}轮，{self.state.message_count}条发言",
            meta={}
        )

        # 检测讨论转向
        highlights = self._detect_turn_highlights()
        for hl in highlights:
            yield {"type": "turn_highlight", "data": {"text": hl}}

        yield {
            "type": "discussion_end",
            "data": {
                "rounds": total_rounds,
                "messages": self.state.message_count,
                "corrections": self.state.correction_count,
                "context": self._build_context()  # 完整上下文给前端展示
            }
        }

        # ── 触发小李生成报告 ─────────────────────────────────────
        yield {"type": "agent_start", "data": {"agent": "小李", "step": "report", "desc": "正在生成讨论纪要..."}}

        elapsed = (datetime.now() - start_time).total_seconds()

        try:
            # P5: 使用讨论纪要模式生成报告
            # 从discussion_context提取共识
            consensus = []
            for msg in self.state.discussion_context:
                if msg.get("role") == "小赵" and msg.get("content", "").startswith("基于以上讨论"):
                    # 小赵共识确认的发言
                    meta = msg.get("meta", {})
                    if meta.get("consensus"):
                        consensus = meta.get("consensus", [])
                    break

            # 获取质检数据
            qa_history = []
            try:
                from .guard import get_guard
                guard = get_guard()
                # 从讨论上下文中提取小赵的洞察作为质检输入
                zhao_insights = []
                for msg in self.state.discussion_context:
                    if msg.get("role") == "小赵":
                        content = msg.get("content", "")
                        if len(content) > 50:
                            zhao_insights.append({"text": content, "category": "洞察"})
                zhao_result = {"insights": zhao_insights}
                # 调用质检官获取结构化质检结果
                qa_result = await guard.inspect(
                    self.state.chen_profile or {},
                    self.state.lin_precomputed or {"analyses": []},
                    zhao_result,
                    self.state.cost_tracker
                )
                if qa_result:
                    self.state.qa_history.append({
                        "round": len(self.state.qa_history) + 1,
                        "score": qa_result.get("score", 0),
                        "passed": qa_result.get("passed", False),
                        "issues_count": len(qa_result.get("issues", [])),
                        "issues_summary": [
                            f"{i.get('criterion', '?')}: {i.get('detail', '')[:50]}"
                            for i in qa_result.get("issues", [])[:5]
                        ]
                    })
                    qa_history = self.state.qa_history
            except Exception as e:
                logger.warning(f"[讨论室] 质检获取失败: {e}")

            report = await self.li.compile_discussion(
                self.state.chen_profile,
                self.state.lin_precomputed or {"analyses": []},
                self.state.discussion_context,
                consensus=consensus,
                cost_tracker=self.state.cost_tracker,
                qa_history=qa_history,
                task=self.state.current_task or "数据分析"
            )
        except Exception as e:
            logger.error(f"[讨论室] 报告生成失败: {e}")
            report = {"error": str(e)}

        yield {
            "type": "report_ready",
            "data": {
                "report": report,
                "elapsed_seconds": round(elapsed, 2),
                "table_name": self.state.table_name,
                "discussion_context": self.state.discussion_context,
                "cost_tracker": self.state.cost_tracker,
                "reasoning_chain": self._get_reasoning_chain_data(),
            }
        }

        logger.info(
            f"[讨论室] 完成: {total_rounds}轮, "
            f"{self.state.message_count}条发言, "
            f"{self.state.correction_count}次修正, "
            f"耗时{elapsed:.1f}秒"
        )

        # ── 自进化：从讨论中提取经验教训 ────────────────────
        yield {"type": "system", "data": {"message": "正在从本次讨论中提取经验教训..."}}
        try:
            from .agent_memory import get_agent_memory
            memory = get_agent_memory()

            # 推断分析领域（从用户任务中提取关键词）
            domain = self._infer_analysis_domain(self.state.current_task or "")

            # 从讨论转向中提取经验
            turn_lessons = memory._extract_turn_lessons(self.state.discussion_context)
            for agent, lesson in turn_lessons.items():
                memory.add_lessons(agent, [lesson], domain=domain, source="qa_discuss")

            stats = memory.get_stats()
            lesson_count = stats["total_lessons"]
            logger.info(f"[自进化] 当前共{lesson_count}条经验, 本次新增{len(turn_lessons)}条")

            yield {
                "type": "evolution",
                "data": {
                    "new_lessons": len(turn_lessons),
                    "total_lessons": lesson_count,
                    "agents_evolved": list(turn_lessons.keys()),
                    "stats": stats,
                }
            }
        except Exception as e:
            logger.debug(f"[自进化] 经验提取失败（不影响分析结果）: {e}")

    # ═══════════════════════════════════════════════════════════
    # 核心执行循环方法
    # ═══════════════════════════════════════════════════════════

    async def _check_convergence(self) -> str:
        """
        收敛检测。
        返回: "end"=结束, "zhao"=触发小赵共识确认, "continue"=继续讨论
        """
        self.state.calm_rounds += 1

        if self.state.zhao_triggered:
            # 小赵已经做过共识确认了，直接结束
            return "end"

        if self.state.has_triggers:
            # 历史中有触发记录（说明有质疑/修正发生过）
            if self.state.calm_rounds >= CALM_THRESHOLD:
                return "zhao"
        else:
            # 历史中从未有过触发（讨论可能很平淡）
            if self.state.calm_rounds >= CALM_THRESHOLD_NO_HISTORY:
                return "zhao"

        # 第一轮还没有任何发言就空了（不应该发生）
        if self.state.round_number == 1 and self.state.message_count == 0:
            return "end"

        return "continue"

    async def _execute_agent(self, agent_key: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        执行一个Agent。解析输出中的mentions、triggers、need_sql。
        """
        agent_name = agent_key.split("_")[0]
        is_supplement = "_补充" in agent_key
        is_consensus = "_共识" in agent_key

        context = self._build_context()

        # ── 直接调用Agent的discuss方法 ──
        result = None
        if agent_name == "老陈":
            result = await self.chen.discuss(context, self.state.chen_profile)
        elif agent_name == "老林":
            if is_supplement:
                sup_key = None
                if self.state.lin_precomputed:
                    keys = [k for k in self.state.lin_precomputed if k.startswith("supplement_")]
                    if keys:
                        sup_key = keys[-1]
                result = await self.lin.discuss_supplement(context, self.state.lin_precomputed, sup_key)
            else:
                result = await self.lin.discuss(context, self.state.lin_precomputed)
        elif agent_name == "小赵":
            if is_consensus:
                result = await self.zhao.discuss_consensus(context)
            else:
                result = await self.zhao.discuss(context)
        elif agent_name == "质检官":
            result = await self.guard.discuss(context, self.state.chen_profile)
        elif agent_name == "老王":
            result = None

        if result is None:
            return

        # ── need_sql拦截 ────────────────────────────────────────
        if result.get("need_sql"):
            sql = result.get("sql", "")
            reason = result.get("reason", "未说明原因")
            logger.info(f"[讨论室] {agent_name}请求补充SQL: {reason}")

            # 如果Agent没给SQL，数据侦探自动生成
            if not sql:
                try:
                    from .nl2sql import get_detective
                    detective = get_detective()
                    detect_result = await detective.query(
                        question=reason,
                        context=self._build_context_text()[-500:],
                    )
                    if detect_result.get("success"):
                        sql = detect_result["sql"]
                        yield {
                            "type": "system",
                            "data": {"message": f"🔍 数据侦探自动生成SQL并执行成功"}
                        }
                except Exception as e:
                    logger.debug(f"[讨论室] 数据侦探生成SQL失败: {e}")

            if sql:
                try:
                    from ..core.duckdb_engine import get_duckdb_engine
                    duck = get_duckdb_engine()
                    sql_result = duck.execute_query(sql)

                    if self.state.lin_precomputed is None:
                        self.state.lin_precomputed = {}
                    sup_key = f"supplement_{len(self.state.lin_precomputed)}"
                    self.state.lin_precomputed[sup_key] = sql_result

                    # 把老林重新加入队列
                    self.state.pending_agents.append("老林_补充")
                    logger.info(f"[讨论室] 补充SQL执行成功，已重新触发老林")

                    # 推送"SQL执行成功"的透明化反馈
                    row_count = sql_result.get("row_count", 0) if isinstance(sql_result, dict) else 0
                    yield {
                        "type": "system",
                        "data": {"message": f"✅ 数据侦探执行SQL成功（返回 {row_count} 行），老林正在补充分析..."}
                    }
                except Exception as e:
                    error_msg = str(e)
                    logger.error(f"[讨论室] 补充SQL执行失败: {error_msg}")

                    # 透明化展示失败过程，而非默默失败
                    yield {
                        "type": "system",
                        "data": {"message": f"⚠️ SQL执行失败：{error_msg[:80]}，正在尝试修正..."}
                    }

                    # 尝试修正SQL（把特殊字符列名加引号）
                    fixed_sql = self._try_fix_sql(sql, error_msg)
                    if fixed_sql and fixed_sql != sql:
                        try:
                            retry_result = duck.execute_query(fixed_sql)
                            if self.state.lin_precomputed is None:
                                self.state.lin_precomputed = {}
                            retry_key = f"supplement_{len(self.state.lin_precomputed)}_fixed"
                            self.state.lin_precomputed[retry_key] = retry_result
                            self.state.pending_agents.append("老林_补充")
                            row_count = retry_result.get("row_count", 0) if isinstance(retry_result, dict) else 0
                            yield {
                                "type": "system",
                                "data": {"message": f"✅ SQL修正成功（返回 {row_count} 行），老林继续分析..."}
                            }
                        except Exception as e2:
                            # 最终失败：让老林基于已有数据给出定性结论
                            yield {
                                "type": "system",
                                "data": {"message": f"❌ SQL修正失败，老林将基于已有数据给出定性分析"}
                            }
                            self._append_message(
                                "system",
                                f"SQL执行失败（已尝试修正）：{str(e2)[:80]}，老林需要基于现有数据做定性分析",
                                triggers=["老林_补充"]
                            )
                            self.state.pending_agents.append("老林_补充")
                    else:
                        self._append_message(
                            "system",
                            f"SQL执行失败：{error_msg[:80]}",
                            triggers=["老林_补充"]
                        )
                        self.state.pending_agents.append("老林_补充")
            return

        # ── 正常发言处理 ─────────────────────────────────────────
        message = result.get("message", "")
        mentions = result.get("mentions", [])
        triggers = result.get("triggers", [])
        data_update = result.get("data_update")

        if not message:
            return

        # 追加到上下文
        meta = {"questioned": False, "corrected": False}
        self._append_message(agent_name, message, mentions=mentions, triggers=triggers, meta=meta)

        # 更新data_update到工作产物
        if data_update and agent_name == "老林":
            if self.state.lin_precomputed is None:
                self.state.lin_precomputed = {}
            self.state.lin_precomputed.update(data_update)

        agent_color = AGENT_COLORS.get(agent_name, "#666")

        # ── 流式打字推送：thinking_start → thinking_delta(逐句) → thinking_end ──
        # 前端 WarRoom 监听这三个事件，实现逐字打字效果
        yield {
            "type": "thinking_start",
            "data": {
                "agent": agent_name,
                "name": agent_name,
                "color": agent_color,
                "round": self.state.round_number,
            }
        }

        # 逐句推送（按句号/换行分割，保留标点）
        import re as _re
        # 先按段落拆，再在每段内按句拆，每次 yield 一小块
        chunks = _re.split(r'(?<=[。！？\n])', message)
        for chunk in chunks:
            if not chunk:
                continue
            yield {
                "type": "thinking_delta",
                "data": {
                    "agent": agent_name,
                    "delta": chunk,
                }
            }
            # 小延迟让前端渲染平滑（asyncio.sleep 在 generator 里不好用，改用同步直推）

        yield {
            "type": "thinking_end",
            "data": {
                "agent": agent_name,
                "full_text": message,
            }
        }

        # ── 同时保留 agent_message 事件（前端对话流 + mentions 气泡用） ──
        yield {
            "type": "agent_message",
            "data": {
                "agent": agent_name,
                "round": self.state.round_number,
                "message": message,
                "mentions": mentions,
                "meta": meta,
                "color": agent_color,
            }
        }

        # 更新统计
        if triggers:
            self.state.has_triggers = True

        # 解析triggers，加入pending_agents
        for t in triggers:
            t_name = t.split("_")[0]
            if t_name not in self.state.round_executed:
                self.state.pending_agents.append(t)

    # ═══════════════════════════════════════════════════════════
    # 分析团队选择（全员协作模式）
    # ═══════════════════════════════════════════════════════════
    
    def _get_agent_display_name(self, agent_key: str) -> str:
        """获取Agent的中文显示名"""
        names = {
            "老陈": "老陈 · 数据工程师",
            "老林": "老林 · 数据分析师",
            "老王": "老王 · 预测先知",
            "小赵": "小赵 · 策略顾问",
            "质检官": "质检官",
            "小李": "小李 · 报告主编",
        }
        return names.get(agent_key, agent_key)

    def _select_analysis_team(self, task: str) -> List[str]:
        """
        根据问题类型选择参与分析的员工组合。
        默认全员参与（6人），每个角色都有其价值。
        注意：此方法仅用于 start_discussion（v3讨论室），v4 的 analyze_question 使用 ConversationManager.select_agents()
        """
        # 排序：老陈→老林→老王→小赵→质检官→小李
        return ["老陈", "老林", "老王", "小赵", "质检官", "小李"]

    # ═══════════════════════════════════════════════════════════
    # 上下文管理
    # ═══════════════════════════════════════════════════════════

    def _append_message(
        self,
        role: str,
        content: str,
        mentions: Optional[List[str]] = None,
        triggers: Optional[List[str]] = None,
        meta: Optional[Dict[str, Any]] = None
    ):
        """追加一条发言到discussion_context"""
        msg = {
            "role": role,
            "content": content,
            "mentions": mentions or [],
            "triggers": triggers or [],
            "round": self.state.round_number,
            "meta": meta or {"questioned": False, "corrected": False}
        }
        self.state.discussion_context.append(msg)
        self.state.message_count += 1

        # 更新has_triggers
        if triggers:
            self.state.has_triggers = True

    def _try_fix_sql(self, sql: str, error: str) -> Optional[str]:
        """
        尝试自动修复 SQL 中最常见的问题：
        1. 列名含特殊字符（%、(、)、/、空格）→ 用双引号包裹
        2. 列名含中文斜杠 → 替换为双引号
        """
        import re as _re

        fixed = sql

        # 修复1：未被引号保护的含特殊字符列名（非英文字母/数字/下划线）
        # 找到 FROM/WHERE/SELECT/GROUP BY 后面的列名候选
        # 策略：把所有未被引号包裹的 word 如果包含特殊字符就加双引号
        def quote_identifier(match: '_re.Match') -> str:
            word = match.group(0)
            # 如果已经有引号，跳过
            if word.startswith('"') or word.startswith("'"):
                return word
            # 如果包含特殊字符（%、/、空格、括号、中文等），加双引号
            if _re.search(r'[%/()\s\u4e00-\u9fff]', word):
                return f'"{word}"'
            return word

        # 简化方案：只针对 "字段名含%" 这个最常见的问题
        if "%" in error or "syntax error" in error.lower():
            # 找出所有未加引号的含特殊字符的标识符
            # 匹配：字母/数字/中文/特殊字符的组合（但不包含SQL关键字周围的空格）
            fixed = _re.sub(
                r'(?<!["\'])(\b\w*[%/()\u4e00-\u9fff]\w*\b)(?!["\'])',
                lambda m: f'"{m.group(0)}"' if m.group(0) not in (
                    'SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'BY', 'LIMIT',
                    'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'AS', 'ON', 'JOIN',
                    'INNER', 'LEFT', 'RIGHT', 'OUTER', 'HAVING', 'DISTINCT',
                    'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'CASE', 'WHEN', 'THEN',
                    'ELSE', 'END',
                ) else m.group(0),
                fixed
            )

        if fixed != sql:
            logger.info(f"[讨论室] SQL自动修正: {sql[:60]}... → {fixed[:60]}...")

        return fixed if fixed != sql else None

    def _build_context(self) -> str:
        """
        构建讨论上下文（纯文本拼接，不含emoji）。
        按轮次截断：保留最近2轮完整 + 更早轮次的摘要。
        """
        if not self.state.discussion_context:
            return ""

        # 检查是否需要截断（注意：这是粗略估算，中文约2字符/token，
        # 仅用于决定是否触发截断逻辑，非精确token计数）
        estimated_tokens = sum(
            len(m.get("content", "")) for m in self.state.discussion_context
        ) // 2  # 中文约2字符/token

        if estimated_tokens < MAX_CONTEXT_TOKENS:
            return self._format_messages(self.state.discussion_context)

        # 按轮次截断
        total_rounds = max(
            (m.get("round", 0) for m in self.state.discussion_context),
            default=0
        )

        if total_rounds <= KEEP_RECENT_ROUNDS:
            return self._format_messages(self.state.discussion_context)

        # 保留最近N轮
        recent = [m for m in self.state.discussion_context
                  if m.get("round", 0) >= total_rounds - KEEP_RECENT_ROUNDS + 1]

        # 更早轮次：压缩成摘要
        older = [m for m in self.state.discussion_context
                 if m.get("round", 0) < total_rounds - KEEP_RECENT_ROUNDS + 1]
        summary = self._summarize_older_rounds(older)

        combined = [{"role": "system", "content": summary}] + recent
        return self._format_messages(combined)

    def _format_messages(self, messages: List[Dict[str, Any]]) -> str:
        """将消息列表格式化为纯文本"""
        lines = []
        for msg in messages:
            role = msg.get("role", "system")
            content = msg.get("content", "")
            mentions = msg.get("mentions", [])
            prefix = f"[{role}]"

            mention_str = " ".join(f"@{m}" for m in mentions)
            if mention_str:
                mention_str = " " + mention_str

            lines.append(f"{prefix}{mention_str}: {content}")

        return "\n".join(lines)

    def _summarize_older_rounds(self, messages: List[Dict[str, Any]]) -> str:
        """将更早的轮次压缩成摘要"""
        if not messages:
            return ""

        first_round = messages[0].get("round", "?")
        last_round = messages[-1].get("round", "?")

        parts = []
        for m in messages:
            role = m.get("role", "?")
            content = m.get("content", "")[:80]
            mentions = m.get("mentions", [])
            if mentions:
                content += f"（引用：{'、'.join(mentions)}）"
            parts.append(f"{role}：{content}...")

        return f"（第{first_round}-{last_round}轮摘要：{'；'.join(parts)}）"

    # ═══════════════════════════════════════════════════════════
    # 讨论转向检测（纯后端逻辑）
    # ═══════════════════════════════════════════════════════════

    def _detect_turn_highlights(self) -> List[str]:
        """
        检测讨论中的"转向"时刻（质检质疑→Agent修正）。
        返回高亮文本列表。
        """
        highlights = []
        ctx = self.state.discussion_context

        for i in range(len(ctx) - 1):
            msg_i = ctx[i]
            msg_next = ctx[i + 1]

            # 检测：质检官发言且mentions了某个Agent
            if msg_i.get("role") != "质检官":
                continue
            mentions = msg_i.get("mentions", [])
            if not mentions:
                continue

            # 下一条是否是被质疑Agent的回应
            target = mentions[0]
            if msg_next.get("role") != target:
                continue

            # 标记meta
            msg_i["meta"]["questioned"] = True
            msg_next["meta"]["corrected"] = True
            self.state.question_count += 1
            self.state.correction_count += 1

            # 生成高亮文本
            content_i = msg_i.get("content", "")[:40]
            highlights.append(
                f"讨论转向：质检质疑后，{target}修正了观点"
            )

        return highlights

    # ═══════════════════════════════════════════════════════════
    # 辅助方法
    # ═══════════════════════════════════════════════════════════

    def _generate_scan_summary(self, chen_profile: Dict[str, Any]) -> str:
        """生成老陈的扫描摘要发言（100-200 token）"""
        columns = chen_profile.get("columns", [])
        shape = chen_profile.get("shape", [0, 0])
        total_rows = shape[0]

        excluded = [c for c in columns if c.get("action") == "exclude"]
        metrics = [c for c in columns if c.get("role") in ("metric", "primary")]
        dims = [c for c in columns if c.get("role") == "dimension"]
        quality = chen_profile.get("quality", {}).get("score", "?")

        parts = [f"扫描完成，共{total_rows}行{len(columns)}列数据"]
        if excluded:
            parts.append(f"排除{len(excluded)}列（{'、'.join(c['name'] for c in excluded[:3])}等）")
        if metrics:
            primary = next((c for c in metrics if c.get("is_primary")), metrics[0])
            _ps = primary.get("stats") or {}
            parts.append(f"主指标列：{primary['name']}")
            if _ps.get("min") is not None:
                parts.append(f"数值范围 {_ps.get('min')}~{_ps.get('max')}")
        if dims:
            low_card = [c for c in dims if (c.get("stats") or {}).get("unique_count", 999) <= 20]
            if low_card:
                parts.append(
                    f"关键分类维度：{'、'.join(c['name'] for c in low_card[:3])}"
                )
        parts.append(f"数据质量{quality}分")

        return "；".join(parts) + "。请下达分析任务。"

    def _chen_brief(self, chen_profile: Dict[str, Any]) -> str:
        """老陈画像的简要文本（用于Agent参考，不放context）"""
        columns = chen_profile.get("columns", [])
        shape = chen_profile.get("shape", [0, 0])
        quality = chen_profile.get("quality", {}).get("score", "?")

        col_summary = []
        for c in columns:
            if c.get("action") == "exclude":
                continue
            role = c.get("role", "?")
            col_type = c.get("type", "?")
            unique = (c.get("stats") or {}).get("unique_count", "?")
            col_summary.append(f"  {c['name']}: {role}/{col_type}, 唯一值={unique}")

        return (
            f"数据概况: {shape[0]}行 x {shape[1]}列, 质量{quality}分\n"
            f"列信息:\n" + "\n".join(col_summary[:15])
            + (f"\n...(共{len(columns)}列)" if len(columns) > 15 else "")
        )

    def _summarize_precomputed(self) -> str:
        """老林预计算结果的摘要文本（放prompt里，不放context）"""
        if not self.state.lin_precomputed:
            return "（暂无预计算结果）"

        analyses = self.state.lin_precomputed.get("analyses", [])
        if not analyses:
            return "（预计算未产出分析结果）"

        summaries = []
        for a in analyses[:6]:
            rule = a.get("_rule", "?")
            title = a.get("title", "")
            summary = a.get("summary", "")
            summaries.append(f"  规则{rule}: {title} — {summary}")

        result = f"共{len(analyses)}项分析结果:\n" + "\n".join(summaries)
        if len(analyses) > 6:
            result += f"\n  ...(共{len(analyses)}项)"

        return result

    def _infer_analysis_domain(self, task: str) -> str:
        """从用户任务中推断分析领域（用于经验分类）"""
        if not task:
            return "通用"

        domain_keywords = {
            "销售分析": ["销售", "营收", "收入", "销售额", "销量", "业绩"],
            "财务分析": ["利润", "成本", "费用", "预算", "毛利", "净利", "现金流"],
            "用户分析": ["用户", "客户", "会员", "留存", "转化", "活跃"],
            "运营分析": ["运营", "效率", "产能", "库存", "供应链", "交付"],
            "人力资源": ["员工", "薪资", "绩效", "离职", "招聘", "部门"],
            "市场营销": ["营销", "广告", "投放", "渠道", "推广", "获客"],
        }

        task_lower = task.lower()
        for domain, keywords in domain_keywords.items():
            for kw in keywords:
                if kw in task_lower:
                    return domain

        return "通用"

    def _get_reasoning_chain_data(self) -> Dict[str, Any]:
        """获取当前推理链数据（供report_ready事件使用）"""
        try:
            from .reasoning_chain import get_reasoning_chain
            chain = get_reasoning_chain()
            return chain.to_dict()
        except Exception as e:
            logger.debug(f"[推理链] 获取数据失败: {e}")
            return {"total_steps": 0, "steps": [], "validation": {"valid": True}}

    # ═══════════════════════════════════════════════════════════
    # 兼容性：保留旧版接口（供路由层过渡使用）
    # ═══════════════════════════════════════════════════════════

    async def run(self, table_name: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        兼容旧版run()接口。
        P4阶段前端改造后会改用scan_data + start_discussion，
        当前保留此方法确保不中断现有功能。
        """
        # 第一步：扫描数据
        async for event in self.scan_data(table_name):
            yield event

        # 自动生成一个默认任务
        profile = self.state.chen_profile or {}
        file_name = profile.get("file", "数据")
        default_task = f"请分析这份{file_name}数据，找出关键规律和洞察。"

        # 启动讨论
        async for event in self.start_discussion(default_task, table_name):
            yield event

    # ═══════════════════════════════════════════════════════════
    # v4: 对话驱动 — 多Agent并行流式分析
    # ═══════════════════════════════════════════════════════════

    async def analyze_question(
        self, question: str, conv_manager=None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        v4.1 核心方法：用户提问 → 多Agent讨论式并行分析。

        与v4.0的区别：
        - Agent能看到彼此的输出（讨论室共享上下文）
        - Agent可以@引用其他Agent（交叉验证）
        - Agent可以请求need_sql（数据侦探执行SQL并注入结果）
        - 质检可以质疑Agent，Agent会修正
        - 报告直接回答用户问题

        流程：
        1. 意图分类 → 选择Agent
        2. 预计算（老林分析数据）
        3. 第一轮：Agent并行讨论（共享上下文，能引用彼此）
        4. 处理need_sql（数据侦探执行 → 结果注入 → 触发补充）
        5. 质量审查（质检官审查 → 被质疑Agent修正）
        6. 报告主编生成论文级报告

        SSE事件流（与讨论室对齐）：
        - team_selected: { agents, intent }
        - thinking_start: { agent, name, color }
        - thinking_delta: { agent, delta }
        - thinking_end: { agent }
        - collaboration: { from_agent, to_agent, content }
        - review_start / review_result: 质量审查
        - report_ready: 最终报告
        - analysis_complete: 完成
        - error: 错误
        """
        from .conversation_manager import AGENT_ROLES
        from ..utils.llm_client import llm
        import asyncio

        start_time = datetime.now()

        # token追踪辅助函数：每次LLM调用后收集usage
        def _track_usage(agent_name: str):
            """从llm.last_usage提取token用量并记录到cost_tracker"""
            try:
                usage = llm.last_usage or {}
                inp = usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0)
                out = usage.get("completion_tokens", 0) or usage.get("output_tokens", 0)
                if inp or out:
                    self.state.cost_tracker["calls"].append({
                        "agent": agent_name, "input_tokens": inp, "output_tokens": out,
                    })
                    self.state.cost_tracker["total_input_tokens"] += inp
                    self.state.cost_tracker["total_output_tokens"] += out
            except Exception:
                pass

        if not self.state.chen_profile:
            yield {"type": "error", "data": {"message": "数据未扫描，请先上传文件"}}
            return

        conv = conv_manager

        # ── Step 1: 意图分类 + Agent选择 ──────────────────
        yield {"type": "system", "data": {"message": "正在分析您的问题，选择最佳分析师团队..."}}
        logger.info(f"[v4.1] Step1 开始: question={question[:50]}")

        intent = await conv.classify_intent(question)
        logger.info(f"[v4.1] 意图分类完成: {intent}")
        selected_agents = conv.select_agents(intent, question)
        logger.info(f"[v4.1] 选中的Agent: {selected_agents}")

        # Agent信息（给前端展示）
        agent_info = [
            {"role": role, **AGENT_ROLES.get(role, {})}
            for role in selected_agents
        ]

        yield {
            "type": "team_selected",
            "data": {
                "intent": intent,
                "agents": agent_info,
                "question": question,
            }
        }

        # 记录用户消息
        conv.add_message("user", question)
        conv.state.round_number += 1

        # ── Step 2: 预计算（老林分析数据）──────────────────
        yield {"type": "system", "data": {"message": "数据分析师正在扫描数据..."}}
        logger.info(f"[v4.1] Step2 开始: 老林预计算...")

        try:
            lin_result = await self.lin.analyze(self.state.chen_profile, self.state.table_name)
            self.state.lin_precomputed = lin_result
            conv.state.lin_precomputed = lin_result
            logger.info(f"[v4.1] Step2 完成: lin_result keys={list(lin_result.keys()) if lin_result else 'None'}")
        except Exception as e:
            logger.error(f"[v4.1] 预计算失败: {e}", exc_info=True)
            yield {"type": "error", "data": {"message": f"数据预计算失败: {str(e)}"}}

        # ── Step 3: 构建讨论室上下文（关键改动！）─────────
        # 数据概况（老陈的profile摘要）
        chen_profile = self.state.chen_profile
        shape = chen_profile.get("shape", [0, 0])
        quality = chen_profile.get("quality", {}).get("score", "?")
        columns = chen_profile.get("columns", [])
        active_cols = [c for c in columns if c.get("action") != "exclude"]

        data_brief = f"数据规模：{shape[0]}行 × {shape[1]}列，质量评分：{quality}/100\n关键字段：\n"
        for c in active_cols[:15]:
            col_desc = f"  - {c['name']}（{c.get('type', '?')}）"
            if c.get("role"):
                col_desc += f"，语义：{c['role']}"
            stats = c.get("stats") or {}
            if stats.get("mean") is not None:
                col_desc += f"，均值{stats['mean']}"
            elif stats.get("unique_count") is not None:
                col_desc += f"，{stats['unique_count']}个唯一值"
            data_brief += col_desc + "\n"

        # 【B2新增】注入真实数据样本（前5行），让Agent看到实际数据而非猜测
        data_sample = ""
        try:
            from ..core.duckdb_engine import get_duckdb_engine
            duck = get_duckdb_engine()
            table = self.state.table_name
            if table:
                sample_result = duck.execute_query(f"SELECT * FROM \"{table}\" LIMIT 5")
                if sample_result and sample_result.get("data"):
                    rows = sample_result["data"]
                    cols = sample_result.get("columns", [])
                    data_sample = "\n### 数据样本（前5行真实数据）\n"
                    data_sample += "| " + " | ".join(str(c) for c in cols[:10]) + " |\n"
                    data_sample += "| " + " | ".join("---" for _ in cols[:10]) + " |\n"
                    for row in rows:
                        vals = [str(row.get(c, ""))[:30] for c in cols[:10]]
                        data_sample += "| " + " | ".join(vals) + " |\n"
                    data_sample += f"\n💡 数据表名：\"{table}\"（DuckDB），写SQL时请直接使用此表名\n"
        except Exception as e:
            logger.debug(f"[v4.1] 数据样本获取失败（不影响分析）: {e}")

        # 老林的自动分析结果摘要
        lin_analyses = lin_result.get("analyses", []) if lin_result else []
        lin_brief = ""
        if lin_analyses:
            lin_brief = "\n数据分析师（老林）的自动分析结果：\n"
            for i, a in enumerate(lin_analyses[:5]):
                lin_brief += f"  {i+1}. {a.get('type', '?')}：{a.get('summary', '无摘要')}\n"

        # 讨论室共享prompt（所有Agent都能看到）
        discussion_context = f"""## 讨论室 — 共享上下文

### 用户的原始问题
{question}

### 数据概况
{data_brief}
{data_sample}
{lin_brief}

### 讨论规则（重要！）
1. **必须直接回答用户的问题**：先给出明确的答案，再展开分析
2. **引用数据**：每个结论必须有数据支撑，禁止编造数字
3. **交叉验证**：你可以引用其他分析师的观点，格式：@数据分析师 @策略顾问
4. **请求SQL**：如果你需要验证某个数据假设，在回复末尾输出 JSON:
   {{"need_sql": true, "sql": "SELECT ...", "reason": "为什么需要这条SQL"}}
5. **发现错误**：如果你发现其他分析师的数据有误，指出问题并给出正确结论
6. **简洁有力**：避免空泛的模板句式，每条结论要包含具体对象+具体数字+具体行动
"""

        # 为每个Agent定制讨论式prompt
        agent_prompts = {
            "DATA_ENGINEER": f"""你是数据工程师。你的职责是提供数据支撑、字段解释和结构说明。
{discussion_context}
你是第一个发言的。请基于数据概况，说明数据中与用户问题直接相关的字段和数据特征。给出用户问题涉及的关键数据指标。""",

            "DATA_ANALYST": f"""你是数据分析师。你的职责是深入分析数据，找出关键规律。
{discussion_context}
请分析数据中与用户问题相关的规律。如果需要查询特定数据，使用 need_sql 机制请求SQL查询。
注意：不要"假设"查询结果，必须通过 need_sql 获取真实数据。""",

            "FORECAST_ANALYST": f"""你是预测分析师。你的职责是基于历史数据做趋势预测。
{discussion_context}
请基于数据做趋势分析和预测。给出预测值和置信区间。""",

            "STRATEGY_ADVISOR": f"""你是策略顾问。你的职责是基于数据分析，给出有价值的战略建议。
{discussion_context}
请基于数据和可能的讨论，给出明确的战略建议。
关键：你的建议必须包含 具体对象（哪个地区/部门/岗位）+ 具体数字 + 具体行动。""",

            "QUALITY_REVIEWER": f"""你是质量审查员。你的职责是审查其他分析师的结论。
{discussion_context}
（你会在其他分析师发言后被触发，届时你会看到他们的完整输出。）""",

            "REPORT_EDITOR": f"""你是报告主编。你的职责是整合讨论结果。
{discussion_context}
（你会在所有Agent发言后被触发，届时你会看到所有人的输出。）""",
        }

        # ── Step 4: Agent并行讨论（共享上下文）───────────
        # 构建 LLM messages：system prompt + 用户问题
        base_messages = [{"role": "user", "content": question}]

        event_queue: asyncio.Queue[Optional[Dict]] = asyncio.Queue()
        results: Dict[str, Dict[str, Any]] = {}
        discussion_log: List[Dict[str, Any]] = []  # 完整讨论记录

        async def run_agent_discuss(role: str) -> None:
            """单个Agent的讨论式执行"""
            role_info = AGENT_ROLES.get(role, {})
            try:
                await event_queue.put({"type": "thinking_start", "data": {"agent": role, "name": role_info.get("name", role), "color": role_info.get("color", "#666")}})

                # DATA_ENGINEER：直接用profile数据（不调LLM）
                if role == "DATA_ENGINEER":
                    profile = self.state.chen_profile
                    full_text = (
                        f"数据已准备就绪。\n\n"
                        f"**数据规模**：{shape[0]}行 × {shape[1]}列\n"
                        f"**质量评分**：{quality}/100\n\n"
                        f"**关键字段**：\n"
                    )
                    for c in active_cols[:12]:
                        stats = c.get("stats") or {}
                        desc = f"- **{c['name']}**（{c.get('type', '?')}）"
                        if stats.get("mean") is not None:
                            desc += f"：均值{stats['mean']}，范围[{stats['min']}, {stats['max']}]"
                        elif stats.get("unique_count") is not None:
                            desc += f"：{stats['unique_count']}个唯一值"
                        full_text += desc + "\n"

                    # 注入老林的分析结果
                    if lin_analyses:
                        full_text += "\n\n**老林的自动分析发现**：\n"
                        for a in lin_analyses[:5]:
                            full_text += f"- {a.get('summary', '无')}\n"

                    await event_queue.put({"type": "thinking_delta", "data": {"agent": role, "delta": full_text}})
                    results[role] = {"role": role, "content": full_text, "full_text": full_text, "mentions": [], "need_sql": False}
                    discussion_log.append({"role": role_info.get("name", role), "content": full_text})
                    await event_queue.put({"type": "thinking_end", "data": {"agent": role}})
                    return

                # 其他Agent：LLM流式，注入讨论室prompt
                custom_prompt = agent_prompts.get(role, agent_prompts["DATA_ANALYST"])
                messages = [
                    {"role": "system", "content": custom_prompt}
                ] + base_messages

                full_text = ""
                async for delta in llm.chat_stream(messages, model="deepseek-chat", temperature=0.4, max_tokens=2000):
                    full_text += delta
                    await event_queue.put({"type": "thinking_delta", "data": {"agent": role, "delta": delta}})
                    await asyncio.sleep(0.003)

                # 解析输出中的need_sql和mentions
                need_sql = False
                sql = ""
                sql_reason = ""
                mentions = []

                # 检查need_sql（JSON块）
                import re
                json_match = re.search(r'\{[\s\S]*?"need_sql"\s*:\s*true[\s\S]*?\}', full_text)
                if json_match:
                    try:
                        sql_data = json.loads(json_match.group())
                        need_sql = sql_data.get("need_sql", False)
                        sql = sql_data.get("sql", "")
                        sql_reason = sql_data.get("reason", "")
                        logger.info(f"[v4.1] {role} 请求SQL: {sql_reason}")
                    except json.JSONDecodeError:
                        pass

                # 检查@mentions
                for ak, av in AGENT_ROLES.items():
                    if f"@{av['name']}" in full_text and ak != role:
                        mentions.append(ak)

                results[role] = {
                    "role": role, "content": full_text, "full_text": full_text,
                    "mentions": mentions, "need_sql": need_sql, "sql": sql, "sql_reason": sql_reason,
                }
                discussion_log.append({"role": role_info.get("name", role), "content": full_text})
                await event_queue.put({"type": "thinking_end", "data": {"agent": role}})

            except Exception as e:
                logger.error(f"[v4.1] {role} 执行失败: {e}")
                await event_queue.put({"type": "thinking_delta", "data": {"agent": role, "delta": f"\n[分析出错: {str(e)}]"}})
                await event_queue.put({"type": "thinking_end", "data": {"agent": role}})

        # 启动所有Agent并行
        logger.info(f"[v4.1] Step4 开始: {len(selected_agents)}个Agent并行讨论: {selected_agents}")
        tasks = [asyncio.create_task(run_agent_discuss(role)) for role in selected_agents]

        # 消费事件队列
        sentinel_count = 0
        total_agents = len(selected_agents)
        while sentinel_count < total_agents:
            try:
                event = await asyncio.wait_for(event_queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                if all(t.done() for t in tasks):
                    break
                continue
            if event is None:
                sentinel_count += 1
                continue
            yield event

        await asyncio.gather(*tasks, return_exceptions=True)

        # 收集各Agent的token用量
        for role in selected_agents:
            _track_usage(role)

        # 排空残余事件
        while not event_queue.empty():
            event = event_queue.get_nowait()
            if event is not None:
                yield event

        # ── Step 5: 处理need_sql（数据侦探执行SQL）──────
        for role, r in results.items():
            if r.get("need_sql") and r.get("sql"):
                sql = r["sql"]
                reason = r.get("sql_reason", "Agent请求")

                # 先让数据侦探修正SQL（如果需要）
                if not sql.strip():
                    try:
                        from .nl2sql import get_detective
                        detective = get_detective()
                        detect_result = await detective.query(question=reason, context=f"数据概况：{data_brief}")
                        if detect_result.get("success"):
                            sql = detect_result["sql"]
                    except Exception as e:
                        logger.debug(f"[v4.1] 数据侦探生成SQL失败: {e}")

                if not sql.strip():
                    continue

                yield {
                    "type": "system",
                    "data": {"message": f"🔍 {AGENT_ROLES.get(role, {}).get('name', role)}请求SQL查询，数据侦探正在执行..."}
                }

                try:
                    from ..core.duckdb_engine import get_duckdb_engine
                    duck = get_duckdb_engine()
                    sql_result = duck.execute_query(sql)

                    # 把SQL结果注入上下文
                    result_text = f"SQL执行成功，结果：\n{str(sql_result)}"

                    # 触发请求Agent补充分析
                    role_info = AGENT_ROLES.get(role, {})
                    yield {
                        "type": "collaboration",
                        "data": {
                            "from_role": "system",
                            "to_role": role,
                            "from_name": "数据侦探",
                            "to_name": role_info.get("name", role),
                            "content": f"SQL查询结果已就绪，{role_info.get('name', role)}正在补充分析..."
                        }
                    }

                    # 补充prompt
                    supplement_prompt = f"""{agent_prompts.get(role, '')}

## 补充信息（数据侦探刚执行的SQL结果）
SQL: {sql}
结果: {str(sql_result)[:1000]}

请基于真实查询结果，修正或补充你之前的分析。如果之前的"假设"数据与真实数据不符，必须明确指出并给出正确结论。"""

                    sup_messages = [
                        {"role": "system", "content": supplement_prompt},
                        {"role": "user", "content": f"请基于以下SQL结果补充分析：\n{str(sql_result)[:800]}"}
                    ]

                    yield {
                        "type": "thinking_start",
                        "data": {"agent": role, "name": role_info.get("name", ""), "color": role_info.get("color", "#666")}
                    }

                    sup_text = ""
                    async for delta in llm.chat_stream(sup_messages, model="deepseek-chat", temperature=0.3, max_tokens=1000):
                        sup_text += delta
                        yield {"type": "thinking_delta", "data": {"agent": role, "delta": delta}}
                        await asyncio.sleep(0.003)

                    # 更新结果
                    results[role]["content"] += f"\n\n---\n**【数据侦探补充】**\n{sup_text}"
                    results[role]["full_text"] = results[role]["content"]
                    results[role]["need_sql"] = False  # 已处理
                    discussion_log.append({"role": f"{role_info.get('name', role)}（补充）", "content": sup_text})

                    yield {"type": "thinking_end", "data": {"agent": role}}

                except Exception as e:
                    logger.error(f"[v4.1] SQL执行失败: {e}")
                    yield {"type": "system", "data": {"message": f"SQL执行失败：{str(e)}"}}

        # ── Step 6: 质量审查（按需介入）──────────────────
        if len(results) >= 2:
            yield {"type": "review_start", "data": {"message": "🔍 质量审查员正在核查分析结论..."}}

            # 构建审查上下文（包含完整讨论记录）
            review_content = "\n\n".join(
                f"## {AGENT_ROLES.get(r['role'], {}).get('name', r['role'])}\n{r['content']}"
                for r in results.values()
                if r['role'] != "QUALITY_REVIEWER"
            )

            review_messages = [
                {"role": "system", "content": f"""你是质量审查员。请严格审查以下分析结论。

## 审查标准
1. **数字真实性**：每个数字必须来自真实数据，"假设"或"声称"的数字必须标记为不可信
2. **SQL执行**：分析师是否真的执行了SQL，还是只写了SQL没执行就"假设"了结果
3. **逻辑一致性**：不同分析师的结论之间不能有矛盾
4. **直接回答**：是否直接回答了用户的问题

## 用户原始问题
{question}

## 待审查的分析结论
{review_content}

请指出问题。如果没有问题，输出"审查通过"。如果发现问题，指出具体是哪个分析师的哪个结论有问题，并说明原因。"""},
                {"role": "user", "content": "请审查以上分析结论。"}
            ]

            review_text = ""
            yield {
                "type": "thinking_start",
                "data": {"agent": "QUALITY_REVIEWER", "name": "质量审查员", "color": "#EF4444"}
            }
            try:
                async for delta in llm.chat_stream(review_messages, model="deepseek-chat", temperature=0.2, max_tokens=1000):
                    review_text += delta
                    yield {"type": "thinking_delta", "data": {"agent": "QUALITY_REVIEWER", "delta": delta}}
                    await asyncio.sleep(0.005)
            except Exception as e:
                review_text = f"审查失败: {e}"

            yield {"type": "thinking_end", "data": {"agent": "QUALITY_REVIEWER"}}

            # 收集质检的token用量
            _track_usage("质检官")

            # 修复质检判定：用正向信号"审查通过"判断，而非反向关键词（"没有使用假设数据"会被误判）
            PASSED_SIGNALS = ["审查通过", "未发现问题", "质量合格", "没有发现问题", "结论可靠"]
            ISSUE_SIGNALS = ["编造", "SQL未执行", "数据来源不明确", "建议修正", "存在矛盾"]
            has_passed = any(sig in review_text for sig in PASSED_SIGNALS)
            has_real_issues = any(sig in review_text for sig in ISSUE_SIGNALS)
            # 只有确实发现问题才判为不通过；如果包含"审查通过"或无明确问题信号，视为通过
            has_issues = has_real_issues and not has_passed
            yield {
                "type": "review_result",
                "data": {
                    "passed": not has_issues,
                    "content": review_text,
                }
            }

            results["QUALITY_REVIEWER"] = {"role": "QUALITY_REVIEWER", "content": review_text, "full_text": review_text}
            discussion_log.append({"role": "质量审查员", "content": review_text})

            # 如果质检发现问题，触发被质疑Agent修正
            if has_issues:
                for role_key, r in list(results.items()):
                    if role_key == "QUALITY_REVIEWER":
                        continue
                    role_name = AGENT_ROLES.get(role_key, {}).get("name", role_key)
                    if role_name in review_text and "修正" in review_text:
                        yield {
                            "type": "collaboration",
                            "data": {
                                "from_role": "QUALITY_REVIEWER",
                                "to_role": role_key,
                                "from_name": "质量审查员",
                                "to_name": role_name,
                                "content": f"{role_name}的结论被质疑，正在修正..."
                            }
                        }

                        fix_prompt = f"""{agent_prompts.get(role_key, '')}

## 质量审查员的反馈
{review_text}

请修正你之前的分析中被质疑的部分。给出正确结论。"""

                        fix_messages = [
                            {"role": "system", "content": fix_prompt},
                            {"role": "user", "content": "请根据质检反馈修正你的结论。"}
                        ]

                        yield {
                            "type": "thinking_start",
                            "data": {"agent": role_key, "name": role_name, "color": AGENT_ROLES.get(role_key, {}).get("color", "#666")}
                        }

                        fix_text = ""
                        async for delta in llm.chat_stream(fix_messages, model="deepseek-chat", temperature=0.3, max_tokens=800):
                            fix_text += delta
                            yield {"type": "thinking_delta", "data": {"agent": role_key, "delta": delta}}
                            await asyncio.sleep(0.005)

                        results[role_key]["content"] += f"\n\n---\n**【质检修正】**\n{fix_text}"
                        results[role_key]["full_text"] = results[role_key]["content"]
                        discussion_log.append({"role": f"{role_name}（修正）", "content": fix_text})

                        yield {"type": "thinking_end", "data": {"agent": role_key}}
                        break  # 一次只修一个，避免太慢

        # ── Step 7: 生成论文级报告（直接回答问题！）──────
        elapsed = (datetime.now() - start_time).total_seconds()

        for r in results.values():
            role_info = AGENT_ROLES.get(r["role"], {})
            conv.add_message("agent", r["content"], agent=role_info.get("name", r["role"]))

        yield {"type": "system", "data": {"message": "📝 报告主编正在整合分析结果..."}}

        report = await self._v4_generate_report(question, results, conv)

        yield {
            "type": "report_ready",
            "data": {
                "report": report,
                "elapsed_seconds": round(elapsed, 2),
                "table_name": self.state.table_name,
            }
        }

        yield {
            "type": "analysis_complete",
            "data": {
                "question": question,
                "agents_count": len(results),
                "elapsed_seconds": round(elapsed, 2),
            }
        }

        logger.info(f"[v4.1] 分析完成: {question[:30]}... | {len(results)}个Agent | {elapsed:.1f}秒")

    async def _v4_generate_report(
        self,
        question: str,
        results: Dict[str, Dict[str, Any]],
        conv_manager=None,
    ) -> Dict[str, Any]:
        """v4.1: 生成论文级分析报告（直接回答用户问题）"""
        from .conversation_manager import AGENT_ROLES
        from ..utils.llm_client import llm
        from .li import get_li

        # 使用小李的报告生成能力
        li = get_li()

        # 构建讨论上下文（兼容li.compile_discussion格式）
        discussion_context = []
        for r in results.values():
            role_info = AGENT_ROLES.get(r["role"], {})
            discussion_context.append({
                "role": role_info.get("name", r["role"]),
                "content": r.get("content", ""),
                "mentions": r.get("mentions", []),
                "triggers": [],
                "round": 1,
                "meta": {"questioned": False, "corrected": False},
            })

        try:
            report = await li.compile_discussion(
                self.state.chen_profile,
                self.state.lin_precomputed or {"analyses": []},
                discussion_context,
                consensus=[],
                cost_tracker=self.state.cost_tracker,
                qa_history=self.state.qa_history if self.state.qa_history else None,
                task=question,
            )
            return report
        except Exception as e:
            logger.error(f"[v4.1] 报告生成失败: {e}")
            # 降级：手动组装报告（直接回答问题！）
            sections = []

            # 第一部分：直接回答
            direct_answer_parts = []
            for role, r in results.items():
                if role in ("QUALITY_REVIEWER", "DATA_ENGINEER", "REPORT_EDITOR"):
                    continue
                role_info = AGENT_ROLES.get(role, {})
                content = r.get("content", "")
                # 取前500字作为回答
                direct_answer_parts.append(f"**{role_info.get('name', role)}**：{content[:500]}")

            sections.append({
                "type": "summary",
                "title": f"答案：{question}",
                "content": "\n\n".join(direct_answer_parts),
            })

            # 后续部分：各Agent详细分析
            for role, r in results.items():
                if role in ("QUALITY_REVIEWER", "REPORT_EDITOR"):
                    continue
                role_info = AGENT_ROLES.get(role, {})
                sections.append({
                    "type": "analysis",
                    "title": role_info.get("name", role),
                    "content": r.get("content", "")[:800],
                })

            # 质检结果
            qr = results.get("QUALITY_REVIEWER")
            if qr:
                sections.append({
                    "type": "qa",
                    "title": "质量审查",
                    "content": qr.get("content", "")[:400],
                })

            return {
                "title": f"分析报告 — {question}",
                "sections": sections,
                "summary": "\n\n".join(direct_answer_parts[:3]) if direct_answer_parts else f"关于「{question}」的分析已完成。",
                "_meta": {
                    "agents": list(results.keys()),
                    "analyses_count": len([r for r in results if r not in ("QUALITY_REVIEWER", "REPORT_EDITOR")]),
                    "insights_count": 0,
                    "forecasted_count": 0,
                    "question": question,
                },
            }


    # ═══════════════════════════════════════════════════════════
    # v5: 多Agent协作分析 — ReWOO + Debate + TaskPool
    # ═══════════════════════════════════════════════════════════

    async def analyze_question_v5(
        self, question: str, conv_manager=None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        v5 核心方法：多Agent协作分析。

        架构（来自意见.txt）：
        ┌─────────────────┐
        │   主管 AI       │  ← 任务分解（Supervisor）
        └────────┬────────┘
        ┌────────▼────────┐
        │   任务池(DAG)   │  ← 状态驱动，并行执行
        └────────┬────────┘
        ┌────────▼────────────────────────────────────┐
        │ 老陈  │  老林  │  老王  │  小赵  │  质检官 │  ← Agent并行
        └────────┴────────┴────────┴────────┴────────┘
        ┌─────────────────┐
        │  Debate 辩论框架 │  ← 对抗性审查
        └────────┬────────┘
        ┌────────▼────────┐
        │  小李·报告主编   │  ← 整合生成
        └─────────────────┘

        流程：
        1. 主管AI分解任务 → TaskPool（DAG依赖图）
        2. 并行执行就绪任务（asyncio.gather）
        3. 完成后自动触发下游任务（事件驱动）
        4. Debate辩论框架审查分析结论
        5. 如有修正 → 创建correction_task → 重新执行
        6. 报告主编整合最终结果

        新增SSE事件：
        - supervisor_decompose: 主管分解任务
        - task_pool_update: 任务池状态更新
        - debate_start / debate_end: 辩论开始/结束
        """
        from .conversation_manager import AGENT_ROLES
        from .supervisor import get_supervisor
        from .task_pool import TaskPool, Task, TaskType, TaskStatus
        from .debate import get_debate_framework
        from ..utils.llm_client import llm

        start_time = datetime.now()

        if not self.state.chen_profile:
            yield {"type": "error", "data": {"message": "数据未扫描，请先上传文件"}}
            return

        conv = conv_manager

        # ── Phase 1: 主管AI任务分解（ReWOO核心）───────────
        yield {"type": "system", "data": {"message": "🧠 主管AI正在分解任务..."}}
        logger.info(f"[v5] Phase1 开始: 主管AI任务分解")

        supervisor = get_supervisor()
        task_definitions = await supervisor.decompose(
            question=question,
            chen_profile=self.state.chen_profile,
            table_name=self.state.table_name,
        )

        # 映射 supervisor 的 type 字符串 → TaskType 枚举
        type_map = {
            "data_query": TaskType.DATA_QUERY,
            "analyze_data": TaskType.ANALYZE_DATA,
            "predict_trend": TaskType.PREDICT_TREND,
            "validate_result": TaskType.VALIDATE_RESULT,
            "generate_insight": TaskType.GENERATE_INSIGHT,
            "write_report": TaskType.WRITE_REPORT,
            "data_profile": TaskType.DATA_PROFILE,
        }

        # 修正 depends_on 中的 task ID 为实际 ID
        tasks_list = []
        for i, td in enumerate(task_definitions):
            actual_depends = []
            for dep in td.get("depends_on", []):
                # dep 可能是 "task_1" 格式
                idx = int(dep.replace("task_", "")) - 1
                if 0 <= idx < len(task_definitions):
                    actual_depends.append(f"v5_task_{idx + 1}")
            tasks_list.append({
                "task_type": type_map.get(td.get("type", "analyze_data"), TaskType.ANALYZE_DATA),
                "description": td.get("description", ""),
                "depends_on": actual_depends,
                "assigned_to": td.get("assigned_to", "DATA_ANALYST"),
            })

        yield {
            "type": "supervisor_decompose",
            "data": {
                "question": question,
                "tasks_count": len(tasks_list),
                "tasks": [
                    {
                        "id": f"v5_task_{i+1}",
                        "type": t["task_type"].value,
                        "description": t["description"],
                        "depends_on": t["depends_on"],
                        "assigned_to": t["assigned_to"],
                    }
                    for i, t in enumerate(tasks_list)
                ],
            }
        }

        logger.info(f"[v5] 主管分解为 {len(tasks_list)} 个子任务")

        # ── Phase 2: 构建任务池（DAG依赖图）──────────────
        pool = TaskPool()

        for i, t in enumerate(tasks_list):
            task = Task(
                task_type=t["task_type"],
                description=t["description"],
                depends_on=t["depends_on"],
                assigned_to=t["assigned_to"],
                priority=i + 1,
                task_id=f"v5_task_{i+1}",
            )
            pool.add_task(task)

        # 通知前端任务池状态
        yield {
            "type": "task_pool_update",
            "data": {
                "phase": "initialized",
                "pool": pool.get_progress(),
                "dag": pool.get_dag_data(),
            }
        }

        # ── Phase 3: 构建讨论上下文（复用v4.1逻辑）───────
        chen_profile = self.state.chen_profile
        shape = chen_profile.get("shape", [0, 0])
        quality = chen_profile.get("quality", {}).get("score", "?")
        columns = chen_profile.get("columns", [])
        active_cols = [c for c in columns if c.get("action") != "exclude"]

        data_brief = f"数据规模：{shape[0]}行 x {shape[1]}列，质量评分：{quality}/100\n关键字段：\n"
        for c in active_cols[:15]:
            col_desc = f"  - {c['name']}（{c.get('type', '?')}）"
            if c.get("role"):
                col_desc += f"，语义：{c['role']}"
            stats = c.get("stats") or {}
            if stats.get("mean") is not None:
                col_desc += f"，均值{stats['mean']}"
            elif stats.get("unique_count") is not None:
                col_desc += f"，{stats['unique_count']}个唯一值"
            data_brief += col_desc + "\n"

        # 真实数据样本
        data_sample = ""
        try:
            from ..core.duckdb_engine import get_duckdb_engine
            duck = get_duckdb_engine()
            table = self.state.table_name
            if table:
                sample_result = duck.execute_query(f"SELECT * FROM \"{table}\" LIMIT 5")
                if sample_result and sample_result.get("data"):
                    rows = sample_result["data"]
                    cols = sample_result.get("columns", [])
                    data_sample = "\n### 数据样本（前5行真实数据）\n"
                    data_sample += "| " + " | ".join(str(c) for c in cols[:10]) + " |\n"
                    data_sample += "| " + " | ".join("---" for _ in cols[:10]) + " |\n"
                    for row in rows:
                        vals = [str(row.get(c, ""))[:30] for c in cols[:10]]
                        data_sample += "| " + " | ".join(vals) + " |\n"
                    data_sample += f"\n数据表名：\"{table}\"（DuckDB），写SQL时请直接使用此表名\n"
        except Exception as e:
            logger.debug(f"[v5] 数据样本获取失败: {e}")

        # 老林预计算
        lin_precomputed = self.state.lin_precomputed
        lin_brief = ""
        if lin_precomputed:
            lin_analyses = lin_precomputed.get("analyses", [])
            if lin_analyses:
                lin_brief = "\n老林的自动分析结果：\n"
                for i, a in enumerate(lin_analyses[:5]):
                    lin_brief += f"  {i+1}. {a.get('type', '?')}：{a.get('summary', '无摘要')}\n"
        else:
            # 如果还没预计算，先做一次
            yield {"type": "system", "data": {"message": "数据分析师正在预计算..."}}
            try:
                lin_result = await self.lin.analyze(self.state.chen_profile, self.state.table_name)
                self.state.lin_precomputed = lin_result
                lin_precomputed = lin_result
                conv.state.lin_precomputed = lin_result
                lin_analyses = lin_result.get("analyses", [])
                if lin_analyses:
                    lin_brief = "\n老林的自动分析结果：\n"
                    for i, a in enumerate(lin_analyses[:5]):
                        lin_brief += f"  {i+1}. {a.get('type', '?')}：{a.get('summary', '无摘要')}\n"
            except Exception as e:
                logger.error(f"[v5] 预计算失败: {e}")

        # 共享上下文（所有Agent可见）
        shared_context = f"""## 讨论室 — 共享上下文

### 用户的问题
{question}

### 数据概况
{data_brief}
{data_sample}
{lin_brief}

### 讨论规则
1. 必须直接回答用户的问题
2. 引用数据：每个结论必须有数据支撑，禁止编造数字
3. 简洁有力：避免空泛的模板句式
"""

        # 发送 team_selected（前端需要）
        assigned_agents = list(set(t["assigned_to"] for t in tasks_list))
        agent_info = [{"role": role, **AGENT_ROLES.get(role, {})} for role in assigned_agents]
        yield {
            "type": "team_selected",
            "data": {
                "intent": "v5_parliament",
                "agents": agent_info,
                "question": question,
            }
        }

        if conv:
            conv.add_message("user", question)
            conv.state.round_number += 1

        # ── Phase 4: DAG驱动并行执行 ────────────────────
        yield {"type": "system", "data": {"message": f"📋 任务池已就绪，共{len(tasks_list)}个子任务，开始并行执行..."}}
        logger.info(f"[v5] Phase4 开始: DAG驱动并行执行")

        # 结果存储（Agent执行结果）
        task_results: Dict[str, Dict[str, Any]] = {}
        event_queue: asyncio.Queue[Optional[Dict]] = asyncio.Queue()

        # token追踪
        def _track_usage(agent_name: str):
            try:
                usage = llm.last_usage or {}
                inp = usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0)
                out = usage.get("completion_tokens", 0) or usage.get("output_tokens", 0)
                if inp or out:
                    self.state.cost_tracker["calls"].append({
                        "agent": agent_name, "input_tokens": inp, "output_tokens": out,
                    })
                    self.state.cost_tracker["total_input_tokens"] += inp
                    self.state.cost_tracker["total_output_tokens"] += out
            except Exception:
                pass

        # Agent角色 → prompt模板
        role_prompts = {
            "DATA_ENGINEER": f"""你是数据工程师。你的职责是提供数据支撑和字段解释。
{shared_context}
请基于数据概况，说明与问题直接相关的字段和数据特征。给出关键数据指标。""",

            "DATA_ANALYST": f"""你是数据分析师。你的职责是深入分析数据，找出规律和洞察。
{shared_context}
请分析数据中与用户问题相关的规律。每个结论要包含具体数字。
如果需要查询特定数据，在回复末尾输出: {{"need_sql": true, "sql": "SELECT ...", "reason": "原因"}}""",

            "FORECAST_ANALYST": f"""你是预测分析师（老王）。你的职责是基于数据做趋势预测、潜力评估、前景判断。
{shared_context}
请基于数据做趋势分析和评估。给出各对象的发展潜力和前景判断。如果有时间列就做预测，没有时间列就基于当前数据做横向对比评估。""",

            "STRATEGY_ADVISOR": f"""你是策略顾问。你的职责是基于数据分析给出战略建议。
{shared_context}
请基于数据和分析结论，给出明确的战略建议。关键：具体对象+具体数字+具体行动。""",

            "QUALITY_REVIEWER": f"""你是质量审查员。你的职责是审查分析结论。
{shared_context}
请严格审查分析结论的数字真实性、逻辑一致性。""",

            "REPORT_EDITOR": f"""你是报告主编。你的职责是整合分析结果。
{shared_context}
请基于所有Agent的分析结果，整合生成最终报告。""",
        }

        async def execute_single_task(task: Task) -> None:
            """执行单个子任务（Agent工作单元）"""
            role = task.assigned_to
            role_info = AGENT_ROLES.get(role, {"name": role, "color": "#666"})
            agent_name = role_info.get("name", role)
            agent_color = role_info.get("color", "#666")

            await event_queue.put({
                "type": "task_pool_update",
                "data": {
                    "phase": "task_started",
                    "task": task.to_dict(),
                    "pool": pool.get_progress(),
                }
            })
            await event_queue.put({
                "type": "thinking_start",
                "data": {"agent": role, "name": agent_name, "color": agent_color, "round": 0},
            })

            try:
                # 收集依赖任务的输出（注入到prompt中）
                dep_context = ""
                for dep_id in task.depends_on:
                    dep_result = task_results.get(dep_id)
                    if dep_result:
                        dep_task = pool.get_task(dep_id)
                        dep_role = dep_task.assigned_to if dep_task else "unknown"
                        dep_name = AGENT_ROLES.get(dep_role, {}).get("name", dep_role)
                        dep_context += f"\n### {dep_name}的输出（任务{dep_id}）\n{dep_result.get('content', '')[-1000:]}\n"

                # DATA_ENGINEER：直接用profile（不调LLM）
                if role == "DATA_ENGINEER" and task.type != TaskType.DATA_QUERY:
                    full_text = (
                        f"数据已准备就绪。\n\n"
                        f"**数据规模**：{shape[0]}行 x {shape[1]}列\n"
                        f"**质量评分**：{quality}/100\n\n"
                        f"**关键字段**：\n"
                    )
                    for c in active_cols[:12]:
                        stats = c.get("stats") or {}
                        desc = f"- **{c['name']}**（{c.get('type', '?')}）"
                        if stats.get("mean") is not None:
                            desc += f"：均值{stats['mean']}，范围[{stats['min']}, {stats['max']}]"
                        elif stats.get("unique_count") is not None:
                            desc += f"：{stats['unique_count']}个唯一值"
                        full_text += desc + "\n"

                    if lin_precomputed:
                        lin_analyses = lin_precomputed.get("analyses", [])
                        if lin_analyses:
                            full_text += "\n\n**老林的自动分析发现**：\n"
                            for a in lin_analyses[:5]:
                                full_text += f"- {a.get('summary', '无')}\n"

                    # 批量推送（每 40ms 一批，而非逐句）
                    chunks = full_text.split("\n")
                    batch = []
                    last_flush = asyncio.get_event_loop().time()
                    for chunk in chunks:
                        if chunk.strip():
                            batch.append(chunk + "\n")
                            now = asyncio.get_event_loop().time()
                            if now - last_flush >= 0.04 or len(batch) >= 5:
                                combined = "".join(batch)
                                await event_queue.put({"type": "thinking_delta", "data": {"agent": role, "delta": combined}})
                                batch = []
                                last_flush = now
                    if batch:
                        await event_queue.put({"type": "thinking_delta", "data": {"agent": role, "delta": "".join(batch)}})
                    await asyncio.sleep(0.02)

                    result_data = {"role": role, "content": full_text, "full_text": full_text, "mentions": [], "need_sql": False}
                    task_results[task.id] = result_data
                    await event_queue.put({"type": "thinking_end", "data": {"agent": role}})

                elif role == "REPORT_EDITOR":
                    # 报告主编：不在任务池阶段执行，留到最后
                    await event_queue.put({"type": "thinking_end", "data": {"agent": role}})
                    result_data = {"role": role, "content": "(待生成)", "full_text": "(待生成)", "mentions": []}
                    task_results[task.id] = result_data

                else:
                    # 其他Agent：LLM流式调用
                    base_prompt = role_prompts.get(role, role_prompts["DATA_ANALYST"])
                    custom_prompt = base_prompt
                    if dep_context:
                        custom_prompt = f"{base_prompt}\n\n## 前序任务的输出{dep_context}\n请基于以上输出，完成你的任务：{task.description}"

                    messages = [
                        {"role": "system", "content": custom_prompt},
                        {"role": "user", "content": f"请完成以下任务：{task.description}"},
                    ]

                    full_text = ""
                    delta_buffer = ""
                    last_flush = asyncio.get_event_loop().time()
                    async for delta in llm.chat_stream(messages, model="deepseek-chat", temperature=0.4, max_tokens=2000):
                        full_text += delta
                        delta_buffer += delta
                        now = asyncio.get_event_loop().time()
                        # 令牌桶节流：每 30ms 批量推送一次，确保前端收到的delta足够大
                        if now - last_flush >= 0.03:
                            await event_queue.put({"type": "thinking_delta", "data": {"agent": role, "delta": delta_buffer}})
                            delta_buffer = ""
                            last_flush = now
                    # flush 剩余
                    if delta_buffer:
                        await event_queue.put({"type": "thinking_delta", "data": {"agent": role, "delta": delta_buffer}})

                    # 解析 need_sql 和 mentions
                    need_sql = False
                    sql = ""
                    sql_reason = ""
                    mentions = []

                    import re
                    json_match = re.search(r'\{[\s\S]*?"need_sql"\s*:\s*true[\s\S]*?\}', full_text)
                    if json_match:
                        try:
                            sql_data = json.loads(json_match.group())
                            need_sql = sql_data.get("need_sql", False)
                            sql = sql_data.get("sql", "")
                            sql_reason = sql_data.get("reason", "")
                        except json.JSONDecodeError:
                            pass

                    for ak, av in AGENT_ROLES.items():
                        if f"@{av['name']}" in full_text and ak != role:
                            mentions.append(ak)

                    result_data = {
                        "role": role, "content": full_text, "full_text": full_text,
                        "mentions": mentions, "need_sql": need_sql, "sql": sql, "sql_reason": sql_reason,
                    }
                    task_results[task.id] = result_data
                    await event_queue.put({"type": "thinking_end", "data": {"agent": role}})

                    # 如果请求了SQL，尝试执行
                    if need_sql and sql:
                        try:
                            from ..core.duckdb_engine import get_duckdb_engine
                            duck_engine = get_duckdb_engine()
                            sql_result = duck_engine.execute_query(sql)
                            result_text = f"SQL执行成功，结果：\n{str(sql_result)}"

                            # 补充分析
                            sup_prompt = f"{custom_prompt}\n\n## 补充信息（数据侦探刚执行的SQL结果）\nSQL: {sql}\n结果: {str(sql_result)[:1000]}\n请基于真实查询结果，修正或补充你的分析。"
                            sup_messages = [
                                {"role": "system", "content": sup_prompt},
                                {"role": "user", "content": f"请基于以下SQL结果补充分析：\n{str(sql_result)[:800]}"},
                            ]

                            await event_queue.put({
                                "type": "collaboration",
                                "data": {
                                    "from_role": "system", "to_role": role,
                                    "from_name": "数据侦探", "to_name": agent_name,
                                    "content": f"SQL查询结果已就绪，{agent_name}正在补充分析...",
                                }
                            })
                            await event_queue.put({
                                "type": "thinking_start",
                                "data": {"agent": role, "name": agent_name, "color": agent_color},
                            })

                            sup_text = ""
                            sup_buffer = ""
                            sup_last_flush = asyncio.get_event_loop().time()
                            async for delta in llm.chat_stream(sup_messages, model="deepseek-chat", temperature=0.3, max_tokens=1000):
                                sup_text += delta
                                sup_buffer += delta
                                now = asyncio.get_event_loop().time()
                                if now - sup_last_flush >= 0.03:
                                    await event_queue.put({"type": "thinking_delta", "data": {"agent": role, "delta": sup_buffer}})
                                    sup_buffer = ""
                                    sup_last_flush = now
                            if sup_buffer:
                                await event_queue.put({"type": "thinking_delta", "data": {"agent": role, "delta": sup_buffer}})

                            result_data["content"] += f"\n\n---\n**【数据侦探补充】**\n{sup_text}"
                            result_data["full_text"] = result_data["content"]
                            result_data["need_sql"] = False

                            await event_queue.put({"type": "thinking_end", "data": {"agent": role}})

                        except Exception as e:
                            logger.error(f"[v5] SQL执行失败: {e}")
                            await event_queue.put({"type": "system", "data": {"message": f"SQL执行失败：{str(e)}"}})

                # 完成任务
                pool.complete_task(task.id, task_results[task.id])
                _track_usage(role)

                await event_queue.put({
                    "type": "task_pool_update",
                    "data": {
                        "phase": "task_completed",
                        "task": task.to_dict(),
                        "pool": pool.get_progress(),
                        "dag": pool.get_dag_data(),
                    }
                })

            except Exception as e:
                logger.error(f"[v5] 任务 {task.id} 执行失败: {e}", exc_info=True)
                pool.fail_task(task.id, str(e))
                await event_queue.put({
                    "type": "thinking_delta",
                    "data": {"agent": role, "delta": f"\n[任务执行出错: {str(e)}]"},
                })
                await event_queue.put({"type": "thinking_end", "data": {"agent": role}})

        # ── DAG驱动执行循环 ──
        # 持续获取就绪任务并并行执行，直到所有任务完成
        max_iterations = 20  # 防止无限循环
        iteration = 0

        while iteration < max_iterations:
            iteration += 1
            ready_tasks = pool.get_ready_tasks()

            if not ready_tasks:
                # 检查是否所有任务都已完成
                all_terminal = all(t.is_terminal for t in pool.get_all_tasks().values())
                if all_terminal:
                    break
                # 等待一下再检查（异步等待其他任务完成）
                await asyncio.sleep(0.2)
                continue

            # 并行执行所有就绪任务
            exec_tasks = [execute_single_task(t) for t in ready_tasks]

            # 消费事件队列（同时执行任务并推送SSE事件）
            async def run_and_consume():
                await asyncio.gather(*exec_tasks, return_exceptions=True)
                await event_queue.put(None)  # sentinel

            consumer = asyncio.create_task(run_and_consume())

            while True:
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    if consumer.done():
                        break
                    continue
                if event is None:
                    break
                yield event

            await consumer
            logger.info(f"[v5] DAG第{iteration}波执行完成，已就绪任务: {[t.id for t in ready_tasks]}")

        # 排空残余事件
        while not event_queue.empty():
            event = event_queue.get_nowait()
            if event is not None:
                yield event

        # ── Phase 5: Debate辩论框架 ─────────────────────
        # 收集所有分析结果（排除质检官和报告主编）
        analysis_results = {}
        for task_id, result in task_results.items():
            role = result.get("role", "")
            if role not in ("QUALITY_REVIEWER", "REPORT_EDITOR"):
                analysis_results[role] = result

        if analysis_results:
            yield {"type": "system", "data": {"message": "⚖️ 辩论阶段开始 — 质检官正在审查分析结论..."}}
            logger.info(f"[v5] Phase5 开始: Debate辩论框架")

            debate = get_debate_framework()
            async for debate_event in debate.run_debate(
                analysis_results=analysis_results,
                question=question,
                chen_profile=self.state.chen_profile,
                lin_precomputed=lin_precomputed,
            ):
                yield debate_event

            # 收集辩论后的更新结果
            debate_result = debate.result
            logger.info(f"[v5] 辩论结束: {debate_result.final_verdict}")

            # ── Phase 5.5: 修正任务回退执行（v5.1 新增）─────────
            # 对应意见.txt 的 ReWOO 动态修正机制：
            # "质检官发现问题 → 发布 correction_task → Agent监听 → 重新分析 → 结果自动更新"
            if debate_result.correction_suggestions:
                yield {"type": "system", "data": {
                    "message": f"🔄 辩论发现 {len(debate_result.correction_suggestions)} 个需要回退的问题，正在创建修正任务..."
                }}
                logger.info(f"[v5.1] Phase5.5 开始: {len(debate_result.correction_suggestions)} 个修正任务回退执行")

                for suggestion in debate_result.correction_suggestions:
                    suggestion.applied = True

                    # 1. 使用 TaskPool 的 correct_task 创建修正任务
                    correction = pool.correct_task(
                        original_task_id=suggestion.target_task_id,
                        correction_description=suggestion.issue_description,
                    )

                    if not correction:
                        logger.warning(f"[v5.1] 修正任务创建失败: {suggestion.target_task_id}")
                        continue

                    # 2. 通知前端修正任务已创建
                    yield {
                        "type": "task_pool_update",
                        "data": {
                            "phase": "correction_created",
                            "task": correction.to_dict(),
                            "pool": pool.get_progress(),
                            "dag": pool.get_dag_data(),
                            "reason": suggestion.issue_description[:100],
                        }
                    }
                    yield {
                        "type": "system",
                        "data": {
                            "message": f"🔄 修正任务: {suggestion.issue_description[:60]}... → {suggestion.target_agent_role}"
                        }
                    }

                    # 3. 执行修正任务（复用 execute_single_task 逻辑）
                    role = suggestion.target_agent_role
                    role_info = AGENT_ROLES.get(role, {"name": role, "color": "#A855F7"})
                    agent_name = role_info.get("name", role)
                    agent_color = role_info.get("color", "#666")

                    await event_queue.put({
                        "type": "task_pool_update",
                        "data": {
                            "phase": "task_started",
                            "task": correction.to_dict(),
                            "pool": pool.get_progress(),
                        }
                    })
                    await event_queue.put({
                        "type": "thinking_start",
                        "data": {"agent": role, "name": agent_name, "color": agent_color, "round": 0},
                    })

                    try:
                        # 收集原始任务输出
                        original_result = task_results.get(suggestion.target_task_id, {})
                        original_text = original_result.get("content", original_result.get("full_text", ""))

                        # 修正 prompt
                        base_prompt = role_prompts.get(role, role_prompts["DATA_ANALYST"])
                        fix_messages = [
                            {"role": "system", "content": base_prompt},
                            {"role": "user", "content": suggestion.correction_prompt},
                        ]

                        fix_text = ""
                        async for delta in llm.chat_stream(fix_messages, model="deepseek-chat", temperature=0.3, max_tokens=1500):
                            fix_text += delta
                            await event_queue.put({"type": "thinking_delta", "data": {"agent": role, "delta": delta}})
                            await asyncio.sleep(0.003)

                        # 4. 更新原始任务结果（追加修正内容）
                        updated_content = (
                            original_text +
                            f"\n\n---\n**【🔄 辩论回退修正 — {debate_result.total_rounds}轮辩论后】**\n{fix_text}"
                        )
                        task_results[suggestion.target_task_id] = {
                            "role": role,
                            "content": updated_content,
                            "full_text": updated_content,
                            "mentions": [],
                            "need_sql": False,
                        }
                        _track_usage(role)

                        # 5. 完成修正任务
                        pool.complete_task(correction.id, {"content": fix_text})

                        await event_queue.put({"type": "thinking_end", "data": {"agent": role}})
                        await event_queue.put({
                            "type": "task_pool_update",
                            "data": {
                                "phase": "task_completed",
                                "task": correction.to_dict(),
                                "pool": pool.get_progress(),
                                "dag": pool.get_dag_data(),
                            }
                        })

                        logger.info(f"[v5.1] 修正任务完成: {correction.id}")

                    except Exception as e:
                        logger.error(f"[v5.1] 修正任务执行失败: {e}", exc_info=True)
                        pool.fail_task(correction.id, str(e))
                        await event_queue.put({"type": "thinking_end", "data": {"agent": role}})

                # 排空残余事件
                while not event_queue.empty():
                    event = event_queue.get_nowait()
                    if event is not None:
                        yield event

                logger.info(f"[v5.1] Phase5.5 完成: 所有修正任务已执行")

        # ── Phase 6: 生成报告 ──────────────────────────
        elapsed = (datetime.now() - start_time).total_seconds()

        # 记录到对话历史
        if conv:
            for task_id, result in task_results.items():
                role = result.get("role", "")
                role_info = AGENT_ROLES.get(role, {})
                conv.add_message("agent", result.get("content", ""), agent=role_info.get("name", role))

        yield {"type": "system", "data": {"message": "📝 报告主编小李正在整合分析结果..."}}
        yield {
            "type": "thinking_start",
            "data": {
                "agent": "REPORT_EDITOR",
                "name": "小李 · 报告主编",
                "color": "#6B7280",
                "round": 0,
            }
        }
        # 小李参与感：逐步推送报告生成进度
        report_sections_labels = [
            "正在汇总各分析师核心结论...",
            "正在交叉验证数据一致性...",
            "正在整合辩论审查结果...",
            "正在撰写执行摘要...",
            "正在组织核心发现与论证...",
            "正在完善风险提示与策略建议...",
            "正在生成溯源面板...",
            "报告生成完成，正在排版..."
        ]
        for label in report_sections_labels:
            yield {
                "type": "thinking_delta",
                "data": {"agent": "REPORT_EDITOR", "delta": label + "\n"}
            }
            await asyncio.sleep(0.15)

        logger.info(f"[v5] Phase6 开始: 生成专业报告")

        # 构建辩论结果字典（传递给报告生成器）
        debate_result_dict = debate.result.to_dict() if analysis_results else None

        report = await self._v5_generate_report(question, task_results, analysis_results, conv, debate_result_dict)

        yield {"type": "thinking_end", "data": {"agent": "REPORT_EDITOR"}}

        yield {
            "type": "report_ready",
            "data": {
                "report": report,
                "elapsed_seconds": round(elapsed, 2),
                "table_name": self.state.table_name,
                "task_pool": pool.get_progress(),
                "debate_result": debate.result.to_dict() if analysis_results else None,
            }
        }

        yield {
            "type": "analysis_complete",
            "data": {
                "question": question,
                "agents_count": len(task_results),
                "tasks_total": len(tasks_list),
                "tasks_completed": sum(1 for t in pool.get_all_tasks().values() if t.status == TaskStatus.SUCCESS),
                "debate_rounds": debate.result.total_rounds if analysis_results else 0,
                "elapsed_seconds": round(elapsed, 2),
            }
        }

        logger.info(
            f"[v5] 多Agent协作完成: {question[:30]}... | "
            f"{len(tasks_list)}个任务 | {debate.result.total_rounds if analysis_results else 0}轮辩论 | "
            f"{elapsed:.1f}秒"
        )

    async def _v5_generate_report(
        self,
        question: str,
        task_results: Dict[str, Dict[str, Any]],
        analysis_results: Dict[str, Dict[str, Any]],
        conv_manager=None,
        debate_result=None,
    ) -> Dict[str, Any]:
        """v5→v6: 生成麦肯锡式专业分析报告（精炼结论，而非流水账）
        
        v6 改造要点：
        1. 使用 compile_professional_report 替代 compile_discussion
        2. 辩论过程只保留最终修正版，中间过程存入 _debate_history 供溯源
        3. LLM精炼生成核心发现、分析论证、风险提示、策略建议
        4. 报告控制在2000字以内，不再是2万字流水账
        """
        from .conversation_manager import AGENT_ROLES
        from .li import get_li

        li = get_li()

        try:
            # v6: 使用专业报告模式
            report = await li.compile_professional_report(
                question=question,
                chen_profile=self.state.chen_profile,
                lin_result=self.state.lin_precomputed or {"analyses": []},
                agent_results=task_results,
                debate_result=debate_result,
                cost_tracker=self.state.cost_tracker,
            )
            return report
        except Exception as e:
            logger.error(f"[v5→v6] 专业报告生成失败，降级到旧方法: {e}")
            # 降级：使用旧版 compile_discussion
            from .li import get_li
            li = get_li()

            discussion_context = []
            for task_id, result in task_results.items():
                role = result.get("role", "")
                if role == "REPORT_EDITOR":
                    continue
                role_info = AGENT_ROLES.get(role, {})
                discussion_context.append({
                    "role": role_info.get("name", role),
                    "content": result.get("content", ""),
                    "mentions": result.get("mentions", []),
                    "triggers": [],
                    "round": 1,
                    "meta": {"questioned": False, "corrected": False},
                })

            try:
                report = await li.compile_discussion(
                    self.state.chen_profile,
                    self.state.lin_precomputed or {"analyses": []},
                    discussion_context,
                    consensus=[],
                    cost_tracker=self.state.cost_tracker,
                    qa_history=self.state.qa_history if self.state.qa_history else None,
                    task=question,
                )
                return report
            except Exception as e2:
                logger.error(f"[v5] 降级报告也失败: {e2}")
                sections = []
                for role, result in analysis_results.items():
                    role_info = AGENT_ROLES.get(role, {})
                    content = result.get("content", "")
                    sections.append({
                        "type": "analysis",
                        "title": role_info.get("name", role),
                        "content": content[:500],
                    })
                return {
                    "title": f"分析报告 — {question}",
                    "sections": sections,
                    "summary": f"关于「{question}」的分析已完成。",
                    "_meta": {"agents": list(analysis_results.keys()), "version": "v5_fallback"},
                }


# 单例
_orchestrator: Optional[InsightFlowOrchestrator] = None


def get_orchestrator() -> InsightFlowOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = InsightFlowOrchestrator()
    return _orchestrator
