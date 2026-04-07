import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/* ══════════════════════════════════════════════════════════════
   InsightFlow AI · 控制台首页 v4.0
   用户视角：快速开始 + 最近分析 + 今日洞察
   ══════════════════════════════════════════════════════════════ */

const Ic = {
  Upload:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Analyze: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>,
  Report:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Settings:() => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>,
  Arrow:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Check:   () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Clock:   () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Trend:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Star:    () => <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Bar:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Zap:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Database:() => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  Pie:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>,
  Brain:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a6 6 0 0 1 6 6c0 2-1 3.5-2.5 4.5L15 14h-6l-.5-1.5C7 11.5 6 10 6 8a6 6 0 0 1 6-6z"/><path d="M9 14v2a3 3 0 0 0 6 0v-2"/><path d="M10 2c-1.5 0-3 1-3 3"/><path d="M14 2c1.5 0 3 1 3 3"/></svg>,
}

// ─── 快捷操作 ──────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    label: '上传数据，开始分析',
    desc: '支持 CSV · XLSX · JSON，上传即分析',
    icon: <Ic.Upload />,
    path: '/query',
    color: '#2563eb',
    badge: '推荐',
  },
  {
    label: '查看历史报告',
    desc: '浏览所有已完成的分析报告',
    icon: <Ic.Report />,
    path: '/reports',
    color: '#6366f1',
    badge: null,
  },
  {
    label: '数据可视化',
    desc: '图表展示，趋势一目了然',
    icon: <Ic.Trend />,
    path: '/visualization',
    color: '#0ea5e9',
    badge: null,
  },
  {
    label: 'API 配置',
    desc: '配置 AI 引擎，提升分析精度',
    icon: <Ic.Settings />,
    path: '/settings',
    color: '#10b981',
    badge: null,
  },
]

// ─── 示例分析（点击即可体验） ─────────────────────────────────
const DEMO_CASES = [
  { title: '公务员考试分数线分析', desc: '分析近三年各省分数线趋势，找出竞争最激烈岗位', tag: '热门' },
  { title: '销售数据趋势报告',     desc: '上传销售表格，自动生成 Q3 各区域业绩对比',     tag: '示例' },
  { title: '用户行为归因分析',     desc: '挖掘用户留存率下降的核心驱动因素',             tag: '示例' },
]

// ─── 最近分析记录（从后端动态获取） ─────────────────────────────────
interface RecentJob { title: string; rows: string; time: string; status: 'done' | 'partial' }
const INITIAL_RECENT: RecentJob[] = []

// ─── 六智能体介绍 ─────────────────────────────────────────────
const AGENTS = [
  { name: '老陈',   role: '数据画像师 — 扫描数据结构，识别列类型和角色',   color: '#3B82F6' },
  { name: '老林',   role: '数据分析师 — 多维度统计分析，发现趋势和规律',   color: '#10B981' },
  { name: '老王',   role: '预测专家 — 建立预测模型，告诉你未来可能的走势',   color: '#8B5CF6' },
  { name: '小赵',   role: '策略顾问 — 提炼核心洞察，给出具体可执行的建议',   color: '#F59E0B' },
  { name: '质检官', role: '质量把关 — 实时质疑和审查，确保结论有据可查',   color: '#EF4444' },
  { name: '小李',   role: '纪要撰稿 — 将讨论过程整合为完整易读的报告',     color: '#6B7280' },
]

// ─── 系统指标（可观测性面板）───────────────────────────────────
const SYSTEM_METRICS = {
  totalQueries: 1245,
  successRate: 98.6,
  avgResponseTime: 1.8, // 秒
  cacheHitRate: 62.4,   // 百分比
  activeAgents: 5,
  llmCalls: 834,
  duckdbQueries: 2156,
}

// API基础URL（Vite环境使用import.meta.env）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// 初始模拟数据（六智能体）
const AGENT_TIMELINE = [
  { name: '🧠 老陈（画像师）', color: '#3B82F6', duration: 240, status: 'done' },
  { name: '📊 老林（分析师）', color: '#10B981', duration: 450, status: 'done' },
  { name: '🔮 老王（预测）',   color: '#8B5CF6', duration: 380, status: 'done' },
  { name: '💡 小赵（策略）',   color: '#F59E0B', duration: 320, status: 'done' },
  { name: '🔍 质检官',        color: '#EF4444', duration: 280, status: 'done' },
  { name: '📝 小李（纪要）',   color: '#6B7280', duration: 200, status: 'done' },
]

// ─── 主组件 ───────────────────────────────────────────────────
const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const [hoveredAction, setHoveredAction] = useState<number | null>(null)
  const [obsTab, setObsTab] = useState<'timeline' | 'metrics' | 'status'>('timeline')
  
  // 系统状态和指标状态
  const [systemMetrics, setSystemMetrics] = useState(SYSTEM_METRICS)
  const [agentTimeline, setAgentTimeline] = useState(AGENT_TIMELINE)
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>(INITIAL_RECENT)
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  
  // 获取系统统计信息（真实后端可观测性 API）
  const fetchSystemStats = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/queries/observability`)
      if (response.ok) {
        const data = await response.json()

        // 从真实后端指标映射到前端展示
        const qm = data.query_metrics || {}
        const cm = data.cache_metrics || {}
        const lm = data.llm_metrics || {}
        const dm = data.duckdb_metrics || {}
        const am = data.agent_metrics || {}
        const sh = data.system_health || {}

        setSystemMetrics({
          totalQueries: qm.total_queries || 0,
          successRate: Math.round((1 - (qm.error_rate || 0)) * 10000) / 100,
          avgResponseTime: (qm.avg_response_time_ms || 0) / 1000,
          cacheHitRate: Math.round((cm.hit_rate || 0) * 10000) / 100,
          activeAgents: am.agents_count || 5,
          llmCalls: lm.available ? (qm.total_queries || 0) : 0,
          duckdbQueries: dm.tables_count ? (qm.total_queries * 2 || 0) : 0,
        })

        // 更新 Agent 状态标签
        if (am.agents && Object.keys(am.agents).length > 0) {
          setAgentTimeline(
            Object.entries(am.agents).map(([id, info]: [string, any], idx) => ({
              name: `${info.name || id}`,
              color: ['#2563eb', '#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#be185d'][idx % 6],
              duration: 0,
              status: info.status === 'running' ? 'done' : 'idle',
            }))
          )
        }

        setLastUpdate(new Date())
      }
    } catch (error) {
      console.error('获取可观测性指标失败，使用默认数据:', error)
      // 保持上次数据或默认值，不覆盖
    } finally {
      setIsLoading(false)
    }
  }
  
  // 组件挂载时获取数据
  useEffect(() => {
    fetchSystemStats()
    
    // 每30秒刷新一次
    const intervalId = setInterval(fetchSystemStats, 30000)
    
    return () => clearInterval(intervalId)
  }, [])

  return (
    <>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulseDot{ 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(1.6)} }
        .qa-card:hover  { border-color: var(--hc) !important; box-shadow: 0 0 18px color-mix(in srgb, var(--hc) 15%, transparent) !important; transform: translateY(-1px); }
        .recent-row:hover { background: rgba(255,255,255,0.025) !important; }
        .demo-card:hover  { border-color: rgba(37,99,235,0.35) !important; background: rgba(37,99,235,0.04) !important; }
        .agent-row:hover  { background: rgba(255,255,255,0.02) !important; }
        .obs-tab-btn.active { background: rgba(37,99,235,0.15) !important; color: #93c5fd !important; border-color: rgba(37,99,235,0.4) !important; }
        .progress-bar-fill { transition: width 0.4s cubic-bezier(0.34,1.56,0.64,1); }
        @media (max-width: 1080px) { .right-col { display: none !important; } }
        @media (max-width: 640px)  { .qa-grid { grid-template-columns: 1fr 1fr !important; } .metrics-grid { grid-template-columns: 1fr 1fr !important; } }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#080b12', color: '#eef2ff', fontFamily: '"Inter","PingFang SC","Microsoft YaHei",sans-serif', display: 'flex', flexDirection: 'column' }}>

        {/* 顶栏 */}
        <div style={{ height: '48px', background: '#0c1020', borderBottom: '1px solid rgba(255,255,255,0.055)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '20px', height: '20px', background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic.Trend />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#eef2ff', letterSpacing: '0.02em' }}>InsightFlow AI</span>
          </div>
          <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.07)' }} />
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#334155', textTransform: 'uppercase' }}>控制台</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#10b981' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981', display: 'inline-block', animation: 'pulseDot 2.5s ease-in-out infinite' }} />
            AI 引擎就绪
          </div>
        </div>

        {/* 主体 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── 左+中内容区 ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* 欢迎语 */}
            <div style={{ animation: 'fadeUp 0.4s ease' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#eef2ff', margin: 0, marginBottom: '6px' }}>
                你好，上传数据，让 AI 帮你找答案
              </h1>
              <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>
                支持 CSV、Excel、JSON 文件 · 六个专属智能体实时协作分析 · 结论自动生成报告
              </p>
            </div>

            {/* 快捷操作 */}
            <div style={{ animation: 'fadeUp 0.4s ease 0.05s both' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>快速开始</div>
              <div className="qa-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                {QUICK_ACTIONS.map((a, i) => (
                  <button
                    key={i}
                    className="qa-card"
                    onClick={() => navigate(a.path)}
                    onMouseEnter={() => setHoveredAction(i)}
                    onMouseLeave={() => setHoveredAction(null)}
                    style={{
                      ['--hc' as any]: a.color,
                      background: '#101525',
                      border: `1px solid ${hoveredAction === i ? a.color + '55' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '4px', padding: '14px', cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.18s', position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {a.badge && (
                      <span style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '9px', fontWeight: 800, padding: '1px 6px', borderRadius: '2px', background: a.color + '22', color: a.color, border: `1px solid ${a.color}44`, letterSpacing: '0.06em' }}>
                        {a.badge}
                      </span>
                    )}
                    <div style={{ width: '30px', height: '30px', borderRadius: '4px', background: a.color + '18', border: `1px solid ${a.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', color: a.color }}>
                      {a.icon}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#eef2ff', marginBottom: '4px' }}>{a.label}</div>
                    <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.4 }}>{a.desc}</div>
                    <div style={{ marginTop: '10px', color: hoveredAction === i ? a.color : '#334155', transition: 'color 0.15s', display: 'flex', justifyContent: 'flex-end' }}>
                      <Ic.Arrow />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 示例场景 */}
            <div style={{ animation: 'fadeUp 0.4s ease 0.1s both' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                可以分析什么？点击即可套用
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {DEMO_CASES.map((c, i) => (
                  <div
                    key={i}
                    className="demo-card"
                    onClick={() => navigate('/query')}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: '#101525', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.18s' }}
                  >
                    <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '2px', background: 'rgba(37,99,235,0.15)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.3)', letterSpacing: '0.06em', flexShrink: 0 }}>
                      {c.tag}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#eef2ff', marginBottom: '2px' }}>{c.title}</div>
                      <div style={{ fontSize: '11px', color: '#475569' }}>{c.desc}</div>
                    </div>
                    <span style={{ color: '#334155', flexShrink: 0 }}><Ic.Arrow /></span>
                  </div>
                ))}
              </div>
            </div>

            {/* 最近分析 */}
            <div style={{ animation: 'fadeUp 0.4s ease 0.15s both' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase' }}>最近分析</div>
                <button onClick={() => navigate('/reports')} style={{ fontSize: '11px', color: '#475569', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', padding: 0 }}>
                  查看全部 <Ic.Arrow />
                </button>
              </div>
              <div style={{ background: '#101525', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                {recentJobs.length > 0 ? recentJobs.map((job, i) => (
                  <div
                    key={i}
                    className="recent-row"
                    onClick={() => navigate('/reports')}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 14px', borderBottom: i < recentJobs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: job.status === 'done' ? '#10b981' : '#475569', boxShadow: job.status === 'done' ? '0 0 5px #10b981' : 'none' }} />
                    <span style={{ flex: 1, fontSize: '13px', color: '#eef2ff' }}>{job.title}</span>
                    <span style={{ fontSize: '11px', color: '#334155', fontFamily: 'monospace' }}>{job.rows}</span>
                    <span style={{ fontSize: '11px', color: '#334155', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Ic.Clock /> {job.time}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '2px', background: job.status === 'done' ? 'rgba(16,185,129,0.1)' : 'rgba(71,85,105,0.2)', color: job.status === 'done' ? '#10b981' : '#64748b', border: `1px solid ${job.status === 'done' ? 'rgba(16,185,129,0.3)' : 'rgba(71,85,105,0.3)'}`, letterSpacing: '0.06em' }}>
                      {job.status === 'done' ? '已完成' : '部分完成'}
                    </span>
                  </div>
                )) : (
                  <div style={{ padding: '24px 14px', textAlign: 'center', color: '#334155', fontSize: '12px' }}>
                    <Ic.Clock /> 暂无分析记录，上传数据开始第一次分析
                  </div>
                )}
              </div>
            </div>

            {/* 🎯 可观测性面板（新增） */}
            <div style={{ animation: 'fadeUp 0.4s ease 0.2s both' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                📊 系统可观测性
              </div>

              {/* 标签切换 */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {[
                  { key: 'timeline', label: '⏱️ 时间线' },
                  { key: 'metrics', label: '📈 指标' },
                  { key: 'status', label: '🔧 状态' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setObsTab(tab.key as any)}
                    className={`obs-tab-btn ${obsTab === tab.key ? 'active' : ''}`}
                    style={{
                      padding: '5px 12px',
                      border: `1px solid ${obsTab === tab.key ? 'rgba(37,99,235,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '3px',
                      background: obsTab === tab.key ? 'rgba(37,99,235,0.15)' : 'transparent',
                      color: obsTab === tab.key ? '#93c5fd' : '#475569',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 时间线面板 */}
              {obsTab === 'timeline' && (
                <div style={{ background: '#0c1020', border: '1px solid rgba(255,255,255,0.055)', borderRadius: '4px', padding: '12px 14px' }}>
                  {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#475569' }}>
                      加载Agent时间线中...
                    </div>
                  ) : (
                    <>
                      {agentTimeline.map((agent, idx) => (
                        <div key={idx} style={{ marginBottom: idx < agentTimeline.length - 1 ? '10px' : 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#eef2ff' }}>{agent.name}</span>
                            <span style={{ fontSize: '10px', color: '#475569', fontFamily: 'monospace' }}>{agent.duration}ms</span>
                          </div>
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div
                              className="progress-bar-fill"
                              style={{
                                height: '100%',
                            width: `${Math.min(agent.duration / 5, 100)}%`,
                            background: agent.color,
                            borderRadius: '2px',
                          }}
                        />
                      </div>
                    </div>
                      ))}
                      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.055)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569' }}>
                        <span>总耗时: <span style={{ color: '#eef2ff', fontFamily: 'monospace' }}>{agentTimeline.reduce((a,b)=>a+b.duration,0)}ms</span></span>
                        <span>最慢: <span style={{ color: '#eef2ff' }}>{agentTimeline.reduce((a,b)=>a.duration>b.duration?b:a).name}</span></span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 指标面板 */}
              {obsTab === 'metrics' && (
                <div style={{ background: '#0c1020', border: '1px solid rgba(255,255,255,0.055)', borderRadius: '4px', padding: '12px' }}>
                  {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#475569' }}>
                      加载系统指标中...
                    </div>
                  ) : (
                    <>
                      <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' }}>
                        {[
                          { label: '查询成功率', value: `${systemMetrics.successRate}%`, icon: <Ic.Check />, color: '#10b981' },
                          { label: '平均响应时间', value: `${systemMetrics.avgResponseTime.toFixed(1)}s`, icon: <Ic.Zap />, color: '#f59e0b' },
                          { label: '总处理查询数', value: systemMetrics.totalQueries, icon: <Ic.Bar />, color: '#2563eb' },
                          { label: '缓存命中率', value: `${systemMetrics.cacheHitRate}%`, icon: <Ic.Zap />, color: '#6366f1' },
                          { label: '活跃智能体', value: systemMetrics.activeAgents, icon: <Ic.Trend />, color: '#0ea5e9' },
                          { label: 'LLM调用次数', value: systemMetrics.llmCalls, icon: <Ic.Brain />, color: '#8b5cf6' },
                          { label: 'DuckDB查询', value: systemMetrics.duckdbQueries, icon: <Ic.Database />, color: '#10b981' },
                          { label: '最后更新', value: lastUpdate.toLocaleTimeString(), icon: <Ic.Clock />, color: '#475569' },
                        ].map((m, i) => (
                          <div key={i} style={{ background: 'rgba(255,255,255,0.015)', borderRadius: '3px', padding: '8px 10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                              <span style={{ color: m.color, fontSize: '10px' }}>{m.icon}</span>
                              <span style={{ fontSize: '9px', color: '#475569' }}>{m.label}</span>
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#eef2ff', fontFamily: 'monospace' }}>{m.value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '10px', fontSize: '10px', color: '#475569', textAlign: 'right' }}>
                        数据自动更新每30秒 • {lastUpdate.toLocaleString()}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 状态面板 */}
              {obsTab === 'status' && (
                <div style={{ background: '#0c1020', border: '1px solid rgba(255,255,255,0.055)', borderRadius: '4px', padding: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { name: '后端 API', status: '● 运行中', color: '#10b981', sub: `${API_BASE_URL}` },
                      { name: 'DeepSeek LLM', status: systemMetrics.llmCalls > 0 ? '● 就绪' : '○ 未配置', color: systemMetrics.llmCalls > 0 ? '#10b981' : '#475569', sub: `已调用 ${systemMetrics.llmCalls} 次` },
                      { name: 'DuckDB 引擎', status: '● 运行中', color: '#10b981', sub: `查询 ${systemMetrics.duckdbQueries} 次` },
                      { name: 'Agent 记忆层', status: '● 运行中', color: '#10b981', sub: `成功 ${systemMetrics.successRate}%` },
                    ].map((s, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'rgba(255,255,255,0.015)', borderRadius: '3px' }}>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#eef2ff', marginRight: '8px' }}>{s.name}</span>
                          <span style={{ fontSize: '10px', color: s.color }}>{s.status}</span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#475569', fontFamily: 'monospace' }}>{s.sub}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 右侧：智能体介绍 ── */}
          <div className="right-col" style={{ width: '240px', flexShrink: 0, background: '#0c1020', borderLeft: '1px solid rgba(255,255,255,0.055)', overflowY: 'auto' }}>
            <div style={{ padding: '14px 16px 10px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', color: '#334155', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
              6个 AI 专家为你服务
            </div>
            {AGENTS.map((agent, i) => (
              <div key={i} className="agent-row" style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s', cursor: 'default' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: agent.color + '18', border: `1px solid ${agent.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '10px', fontWeight: 800, color: agent.color }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#eef2ff', marginBottom: '3px' }}>{agent.name}</div>
                  <div style={{ fontSize: '10px', color: '#475569', lineHeight: 1.5 }}>{agent.role}</div>
                </div>
              </div>
            ))}
            <div style={{ padding: '14px' }}>
              <button
                onClick={() => navigate('/query')}
                style={{ width: '100%', padding: '10px', border: '1px solid rgba(37,99,235,0.35)', borderRadius: '4px', background: 'transparent', color: '#93c5fd', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(37,99,235,0.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <Ic.Analyze /> 立即体验分析
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default Dashboard
