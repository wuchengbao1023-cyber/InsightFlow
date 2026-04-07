import React, { useState } from 'react'
import { useAnalysisStore, type AnalysisReport } from '../store/appStore'

/* ══════════════════════════════════════════════════════════════
   InsightFlow AI · 分析报告归档 v2.0
   从全局 Store 读取真实分析结果
   ══════════════════════════════════════════════════════════════ */

// ─── SVG 图标 ─────────────────────────────────────────────────────────────────

const Icon = {
  FileText: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  Download: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  Trash: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Filter: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  ),
  Zap: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  TrendUp: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  Eye: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  ArrowLeft: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  ),
}

// Agent 颜色映射
const AGENT_COLORS: Record<string, string> = {
  analyst: '#2563eb',
  detective: '#0ea5e9',
  prophet: '#6366f1',
  advisor: '#10b981',
  narrator: '#f59e0b',
}

const AGENT_NAMES: Record<string, string> = {
  analyst: '首席分析师',
  detective: '数据侦探',
  prophet: '预测先知',
  advisor: '优化顾问',
  narrator: '叙事作家',
}

// ─── 迷你图表 ───────────────────────────────────────────────────────────────

const MiniChart: React.FC<{ color: string; values?: number[] }> = ({ color, values = [30,55,42,68,74,61,82,77,91,88,95,100] }) => (
  <svg viewBox="0 0 100 40" width="100%" height="100%" style={{ display: 'block' }}>
    <defs>
      <linearGradient id={`g-${color}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.4" />
        <stop offset="100%" stopColor={color} stopOpacity="0.03" />
      </linearGradient>
    </defs>
    <path
      d={values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (values.length - 1)) * 100} ${40 - (v / 100) * 36}`).join(' ') + ` L 100 40 L 0 40 Z`}
      fill={`url(#g-${color})`}
    />
    <path
      d={values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (values.length - 1)) * 100} ${40 - (v / 100) * 36}`).join(' ')}
      fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
)

// ─── 报告详情弹窗 ───────────────────────────────────────────────────────────

const ReportDetail: React.FC<{ report: AnalysisReport; onClose: () => void }> = ({ report, onClose }) => {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '90%', maxWidth: '720px', maxHeight: '80vh',
          background: '#101525', borderRadius: '8px',
          border: '1px solid rgba(37,99,235,0.2)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* 头 */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon.FileText />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#eef2ff' }}>{report.fileName}</div>
            <div style={{ fontSize: '11px', color: '#4b5680', marginTop: '2px' }}>
              {report.createdAt} · {report.useRealData ? '🟢 AI 分析' : '🟡 本地模拟'} · {report.executionMs ? `${(report.executionMs / 1000).toFixed(1)}s` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', padding: '4px' }}>
            ✕
          </button>
        </div>

        {/* 指令 */}
        {report.instruction && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(37,99,235,0.04)' }}>
            <div style={{ fontSize: '10px', color: '#4b5680', marginBottom: '4px', fontWeight: 600 }}>分析指令</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>{report.instruction}</div>
          </div>
        )}

        {/* Agent 输出详情 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {report.agentOutputs.map((ao, idx) => (
            <div key={ao.agentId + idx} style={{
              background: '#0c1020', borderRadius: '6px', border: `1px solid rgba(255,255,255,0.055)`,
              overflow: 'hidden',
            }}>
              {/* Agent 头 */}
              <div style={{
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px',
                background: AGENT_COLORS[ao.agentId] + '0a',
                borderBottom: `1px solid ${AGENT_COLORS[ao.agentId]}15`,
              }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: AGENT_COLORS[ao.agentId] || '#2563eb' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#eef2ff' }}>{AGENT_NAMES[ao.agentId] || ao.agentName}</span>
                <span style={{ fontSize: '10px', color: '#475569' }}>·</span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{ao.title}</span>
              </div>

              {/* 统计数据 */}
              {ao.statsData && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px', padding: '10px 14px 0' }}>
                  {Object.entries(ao.statsData).map(([k, v]) => (
                    <div key={k} style={{ background: '#080b12', borderRadius: '3px', padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#eef2ff', fontFamily: 'monospace' }}>{v}</div>
                      <div style={{ fontSize: '9px', color: '#4b5680' }}>{k}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 内容 */}
              <div style={{ padding: '10px 14px 14px' }}>
                {ao.lines.map((line, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.8, fontFamily: 'monospace', display: 'flex', gap: '8px' }}>
                    <span style={{ color: AGENT_COLORS[ao.agentId] || '#2563eb', flexShrink: 0, fontSize: '10px', marginTop: '3px' }}>›</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

const Reports: React.FC = () => {
  const { reports, removeReport, clearReports } = useAnalysisStore()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [detailReport, setDetailReport] = useState<AnalysisReport | null>(null)

  const filtered = reports.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q || r.fileName.toLowerCase().includes(q) || r.instruction.toLowerCase().includes(q)
    const matchFilter = filter === 'all' || (filter === 'real' && r.useRealData) || (filter === 'local' && !r.useRealData)
    return matchSearch && matchFilter
  })

  // 按文件名去重显示
  const seenFiles = new Set<string>()
  const uniqueReports = filtered.filter(r => {
    const key = r.fileKey
    if (seenFiles.has(key)) return false
    seenFiles.add(key)
    return true
  })

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .report-card { transition: border-color 0.2s, box-shadow 0.2s; }
        .report-card:hover { border-color: rgba(37,99,235,0.35) !important; box-shadow: 0 0 0 1px rgba(37,99,235,0.15) !important; }
        .report-action-btn:hover { background: rgba(37,99,235,0.1) !important; border-color: rgba(37,99,235,0.4) !important; color: #93c5fd !important; }
        .search-input:focus { border-color: #2563eb !important; }
        .filter-btn.active { border-color: rgba(37,99,235,0.5) !important; color: #93c5fd !important; background: rgba(37,99,235,0.08) !important; }
        .filter-btn:hover { border-color: rgba(37,99,235,0.3) !important; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#080b12', color: '#eef2ff', fontFamily: '"Inter","PingFang SC","Microsoft YaHei",sans-serif' }}>
        {/* 顶栏 */}
        <div style={{ height: '48px', background: '#0c1020', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '10px' }}>
          <Icon.FileText />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Analysis Archive</span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#4b5680', fontFamily: 'monospace' }}>
            {uniqueReports.length} 份报告
          </span>
          {reports.length > 0 && (
            <button
              onClick={clearReports}
              style={{ fontSize: '10px', color: '#475569', background: 'none', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '4px', cursor: 'pointer', padding: '3px 10px', transition: 'all 0.15s' }}
            >
              清空全部
            </button>
          )}
        </div>

        {/* 搜索 + 筛选栏 */}
        <div style={{ padding: '16px 24px', background: '#0c1020', borderBottom: '1px solid rgba(255,255,255,0.055)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '0 0 240px' }}>
            <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#4b5680', pointerEvents: 'none' }}>
              <Icon.Search />
            </div>
            <input
              className="search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索文件名或分析指令…"
              style={{
                width: '100%', background: '#080b12', border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: '4px', padding: '8px 12px 8px 32px', color: '#eef2ff',
                fontSize: '12px', outline: 'none', transition: 'border-color 0.15s',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#4b5680', display: 'flex', alignItems: 'center', gap: '4px' }}><Icon.Filter /> 筛选:</span>
            {[
              { key: 'all', label: '全部' },
              { key: 'real', label: '🟢 AI 分析' },
              { key: 'local', label: '🟡 本地模拟' },
            ].map(f => (
              <button
                key={f.key}
                className={`filter-btn${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '4px 10px', border: `1px solid ${filter === f.key ? 'rgba(37,99,235,0.5)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: '3px', background: filter === f.key ? 'rgba(37,99,235,0.08)' : 'transparent',
                  color: filter === f.key ? '#93c5fd' : '#4b5680',
                  fontSize: '11px', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 报告列表 */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {uniqueReports.map((report, idx) => {
            const isHovered = hoverId === report.id
            const chartColor = report.agentOutputs[0]?.agentColor || AGENT_COLORS[report.agentOutputs[0]?.agentId] || '#2563eb'
            const agentNames = [...new Set(report.agentOutputs.map(ao => AGENT_NAMES[ao.agentId] || ao.agentName))]
            return (
              <div
                key={report.id}
                className="report-card"
                onMouseEnter={() => setHoverId(report.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  background: '#101525', border: '1px solid rgba(255,255,255,0.065)',
                  borderRadius: '6px', padding: '0', overflow: 'hidden',
                  animation: `fadeSlideIn 0.3s ease ${idx * 0.05}s both`,
                  display: 'flex',
                }}
              >
                {/* 左侧彩色状态条 */}
                <div style={{ width: '3px', flexShrink: 0, background: report.useRealData ? chartColor : '#475569' }} />

                {/* 主内容 */}
                <div style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* 标题行 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#eef2ff' }}>{report.fileName}</span>
                        <span style={{
                          fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', padding: '2px 6px',
                          borderRadius: '2px',
                          background: report.useRealData ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                          color: report.useRealData ? '#10b981' : '#f59e0b',
                          border: `1px solid ${report.useRealData ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                        }}>
                          {report.useRealData ? 'AI' : 'DEMO'}
                        </span>
                        {report.executionMs && (
                          <span style={{ fontSize: '9px', color: '#4b5680', fontFamily: 'monospace' }}>
                            {(report.executionMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>

                      {/* 元数据行 */}
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <MetaItem icon="file" label={report.fileName} />
                        <MetaItem icon="time" label={report.createdAt} />
                        {report.instruction && <MetaItem icon="zap" label={report.instruction.slice(0, 40) + (report.instruction.length > 40 ? '…' : '')} />}
                      </div>

                      {/* Agent badges */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px', alignItems: 'center' }}>
                        {agentNames.map(name => {
                          const agentId = Object.entries(AGENT_NAMES).find(([, v]) => v === name)?.[0] || 'analyst'
                          const color = AGENT_COLORS[agentId] || '#2563eb'
                          return (
                            <span key={name} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '2px', background: color + '12', color, border: `1px solid ${color}30` }}>
                              {name}
                            </span>
                          )
                        })}
                        <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.06)', margin: '0 2px' }} />
                        <span style={{ fontSize: '10px', color: '#4b5680' }}>
                          {report.agentOutputs.reduce((sum, ao) => sum + ao.lines.length, 0)} 条分析结论
                        </span>
                      </div>

                      {/* 摘要（取叙事作家的最后结论行） */}
                      <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {report.agentOutputs.find(ao => ao.agentId === 'narrator')?.lines.slice(-1)[0]
                          || report.agentOutputs[0]?.lines[0]
                          || '分析已完成'}
                      </p>
                    </div>

                    {/* 右侧迷你图 */}
                    <div style={{
                      width: '120px', flexShrink: 0, height: '64px',
                      opacity: isHovered ? 1 : 0.4, transition: 'opacity 0.25s',
                      background: '#0c1020', borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.055)', overflow: 'hidden',
                      padding: '4px',
                    }}>
                      <MiniChart color={chartColor} />
                    </div>
                  </div>

                  {/* 操作栏 */}
                  <div style={{
                    display: 'flex', gap: '6px', marginTop: '10px', paddingTop: '10px',
                    borderTop: `1px solid ${isHovered ? 'rgba(255,255,255,0.06)' : 'transparent'}`,
                    height: isHovered ? 'auto' : '0', overflow: 'hidden',
                    transition: 'height 0.2s, border-color 0.2s',
                    opacity: isHovered ? 1 : 0,
                  }}>
                    {[
                      { icon: <Icon.Eye />, label: '查看详情', onClick: () => setDetailReport(report) },
                      { icon: <Icon.Download />, label: '下载 TXT', onClick: () => {
                        const text = report.agentOutputs.flatMap(ao => [`【${AGENT_NAMES[ao.agentId] || ao.agentName}】${ao.title}`, ...ao.lines, '']).join('\n')
                        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url; a.download = `分析报告_${report.fileName}.txt`; a.click()
                        URL.revokeObjectURL(url)
                      }},
                      { icon: <Icon.Trash />, label: '删除', onClick: () => removeReport(report.id) },
                    ].map(btn => (
                      <button
                        key={btn.label}
                        className="report-action-btn"
                        onClick={btn.onClick}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '5px 11px', border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: '3px', background: 'transparent', cursor: 'pointer',
                          color: '#475569', fontSize: '11px', fontWeight: 500,
                          transition: 'all 0.15s',
                        }}
                      >
                        {btn.icon}{btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}

          {uniqueReports.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#334155' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>📊</div>
              <div style={{ fontSize: '14px', color: '#475569', marginBottom: '6px' }}>暂无分析报告</div>
              <div style={{ fontSize: '12px', color: '#2d3748' }}>前往「智能分析」页面上传数据并分析，结果会自动保存到这里</div>
            </div>
          )}
        </div>
      </div>

      {/* 详情弹窗 */}
      {detailReport && (
        <ReportDetail report={detailReport} onClose={() => setDetailReport(null)} />
      )}
    </>
  )
}

// ─── 元数据条目 ───────────────────────────────────────────────────────────────

const MetaItem: React.FC<{ icon: string; label: string }> = ({ icon, label }) => {
  const icons: Record<string, React.ReactNode> = {
    file: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
    time: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    zap: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#4b5680', fontFamily: 'monospace' }}>
      {icons[icon]}{label}
    </span>
  )
}

export default Reports
