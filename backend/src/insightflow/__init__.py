"""
InsightFlow AI 2026 - 讨论室分析模块（v3）
==========================================

上传数据 → 多个AI Agent围绕用户议题进行多轮讨论 → 收敛为共识 → 生成讨论纪要。

差异化核心：Agent之间互相引用、质疑、修正，最终报告是"团队讨论的结晶"。

员工分工：
- 老陈（DataEngineer）：数据释义专家，扫描数据+讨论中回答数据问题
- 老林（DataAnalyst）：数据分析师，预计算+讨论发言+补充SQL
- 老王（Forecaster）：预测师，预计算阶段参与（无时间列时跳过）
- 小赵（Strategist）：策略顾问，共识确认时综合总结
- 质检官（QualityGuard）：实时参与讨论，质疑数据来源和逻辑
- 小李（ReportEditor）：讨论纪要报告组装

v3 架构：
- discussion_context: 共享讨论上下文
- pending_agents: 触发器队列
- 收敛检测: calm_rounds + has_triggers
- need_sql: 老林请求补充SQL → 自动执行 → 重新触发
"""
