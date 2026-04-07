/**
 * InsightFlow v4.1 常量定义
 */

// API基础URL
// SSE 流式端点用 EventSource（原生SSE，无缓冲问题），必须用绝对URL
// 其他端点走 Vite proxy 相对路径
export const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL
  ? `${(import.meta as any).env.VITE_API_BASE_URL}/api/insightflow`
  : '/api/insightflow'
// EventSource 需要绝对 URL（跨域SSE，后端已配CORS）
// 生产环境通过 VITE_SSE_BASE_URL 环境变量覆盖
export const SSE_BASE = (import.meta as any).env?.VITE_SSE_BASE_URL
  ? (import.meta as any).env.VITE_SSE_BASE_URL
  : 'http://localhost:8001/api/insightflow'

// Agent 角色元数据
// 覆盖所有可能的 key（中文名 / 英文 role / 旧版常量），保证 WarRoom 永远能找到
export const AGENT_META: Record<string, { name: string; color: string; icon: string; desc: string }> = {
  // ── 讨论室 Agent（后端 orchestrator 用中文 key） ──
  '老陈': { name: '老陈 · 数据工程师', color: '#3B82F6', icon: '🏗️', desc: '数据扫描、字段解析、基础统计' },
  '老林': { name: '老林 · 数据分析师', color: '#10B981', icon: '📊', desc: '趋势发现、分类对比、图表生成' },
  '老王': { name: '老王 · 预测先知',   color: '#8B5CF6', icon: '🔮', desc: '时序预测、趋势外推' },
  '小赵': { name: '小赵 · 策略顾问',   color: '#F59E0B', icon: '🎯', desc: '洞察提炼、战略建议' },
  '质检官': { name: '质检官',          color: '#EF4444', icon: '✅', desc: '数字溯源、逻辑一致、质量审核' },
  '小李': { name: '小李 · 报告主编',   color: '#06B6D4', icon: '📝', desc: '报告组装、数字溯源、成本追踪' },

  // ── 旧版英文常量（向下兼容） ──
  DATA_ENGINEER:     { name: '老陈 · 数据工程师', color: '#3B82F6', icon: '🏗️', desc: '数据加载、清洗、结构分析' },
  DATA_ANALYST:      { name: '老林 · 数据分析师', color: '#10B981', icon: '📊', desc: '统计分析、趋势识别' },
  FORECAST_ANALYST:  { name: '老王 · 预测先知',   color: '#F59E0B', icon: '🔮', desc: '趋势预测、未来推演' },
  STRATEGY_ADVISOR:  { name: '小赵 · 策略顾问',   color: '#8B5CF6', icon: '🎯', desc: '综合研判、战略建议' },
  QUALITY_REVIEWER:  { name: '质检官',            color: '#EF4444', icon: '✅', desc: '数据验证、逻辑审查' },
  REPORT_EDITOR:     { name: '小李 · 报告主编',   color: '#06B6D4', icon: '📝', desc: '报告撰写、章节编排' },

  // ── 其他 InsightFlow Agent（agent_manager 可能发的） ──
  chief_analyst:    { name: '老陈 · 首席分析师', color: '#3B82F6', icon: '🧠', desc: 'ReAct推理、任务编排' },
  data_detective:   { name: '老林 · 数据侦探',   color: '#10B981', icon: '🔍', desc: '异常检测、因果推断' },
  prediction_prophet: { name: '老王 · 预测先知', color: '#8B5CF6', icon: '🔮', desc: '时序预测、风险评估' },
  optimization_advisor: { name: '小赵 · 优化顾问', color: '#F59E0B', icon: '💡', desc: 'A/B测试、ROI分析' },
  narrative_writer: { name: '小李 · 报告主编',   color: '#06B6D4', icon: '📝', desc: '报告生成、数据故事' },
  compliance_auditor: { name: '质检官',           color: '#EF4444', icon: '✅', desc: '合规检查、PII检测' },
}

// 全局CSS动画（只注入一次）
export const ANIM_CSS = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  .if-fade-in { animation: fadeIn 0.3s ease-out; }
  .if-fade-in-up { animation: fadeInUp 0.4s ease-out; }
  .if-cursor { animation: blink 0.8s infinite; color: #64748B; font-weight: 300; }
  .if-shimmer {
    background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }
  .if-spin { animation: spin-slow 1.5s linear infinite; }
  .agent-dot {
    width: 6px; height: 6px; border-radius: 50%;
    display: inline-block; margin-right: 2px;
    animation: pulse 1.2s infinite;
  }
  .agent-dot:nth-child(2) { animation-delay: 0.2s; }
  .agent-dot:nth-child(3) { animation-delay: 0.4s; }

  /* WarRoom：完成脉冲 */
  @keyframes warroom-done-pulse {
    0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.3); }
    70% { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
    100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
  }

  /* 分析面板：进度条流动 */
  @keyframes warroom-progress {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`

// 注入CSS（只一次）
if (typeof document !== 'undefined') {
  const existing = document.getElementById('if-v41-anim')
  if (!existing) {
    const style = document.createElement('style')
    style.id = 'if-v41-anim'
    style.textContent = ANIM_CSS
    document.head.appendChild(style)
  }
}
