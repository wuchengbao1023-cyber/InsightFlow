import React, { useState, useEffect } from 'react'

// ─── SVG 图标 ─────────────────────────────────────────────────────────────────

const Icon = {
  Key: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  ),
  Eye: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  EyeOff: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Settings: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  Wifi: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  ),
  Database: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  Cpu: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
    </svg>
  ),
  Save: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
}

// ─── 类型 ─────────────────────────────────────────────────────────────────────

type ConnStatus = 'unconfigured' | 'testing' | 'connected' | 'error'
type ModelProvider = 'deepseek' | 'openai' | 'qwen'

interface ModelConfig {
  provider: ModelProvider
  apiKey: string
  apiKeyMasked: string  // 后端返回的打码key，用于判断"已配置"
  apiKeySet: boolean     // 后端标记该key是否已配置
  model: string
  connStatus: ConnStatus
}

// ─── 样式工具 ─────────────────────────────────────────────────────────────────

const field = {
  label: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    marginBottom: '6px',
    display: 'block',
  },
  input: (focused: boolean = false) => ({
    width: '100%',
    background: 'var(--bg-card)',
    border: `1px solid ${focused ? 'var(--blue-core)' : 'var(--border-default)'}`,
    borderRadius: '4px',
    padding: '9px 12px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box' as const,
  }),
  select: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: '4px',
    padding: '9px 12px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  },
}

// ─── 子组件：状态指示 ─────────────────────────────────────────────────────────

const ConnIndicator: React.FC<{ status: ConnStatus }> = ({ status }) => {
  const map: Record<ConnStatus, { color: string; label: string; pulse: boolean }> = {
    unconfigured: { color: '#ef4444', label: '未连接',   pulse: false },
    testing:      { color: '#f59e0b', label: '检测中…', pulse: true  },
    connected:    { color: '#10b981', label: '已就绪',   pulse: false },
    error:        { color: '#ef4444', label: '连接失败', pulse: false },
  }
  const cfg = map[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: cfg.color, fontWeight: 600 }}>
      <span style={{
        width: '7px', height: '7px', borderRadius: '50%', background: cfg.color, display: 'inline-block', flexShrink: 0,
        animation: cfg.pulse ? 'pulseDot 1s ease-in-out infinite' : 'none',
        boxShadow: status === 'connected' ? `0 0 6px ${cfg.color}` : 'none',
      }} />
      {cfg.label}
    </span>
  )
}

// ─── 子组件：折叠面板 ─────────────────────────────────────────────────────────

const CollapseSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '4px', overflow: 'hidden', marginTop: '12px' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 14px', background: 'var(--bg-card)', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em',
          transition: 'background 0.15s',
        }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--text-muted)' }}>
          <Icon.ChevronRight />
        </span>
        {title}
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#334155' }}>高级选项</span>
      </button>
      {open && (
        <div style={{ padding: '14px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8001'

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'model' | 'storage' | 'system'>('model')
  const [keyVisible, setKeyVisible] = useState(false)
  const [keyFocused, setKeyFocused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState('')
  const [models, setModels] = useState<ModelConfig[]>([
    { provider: 'deepseek', apiKey: '', apiKeyMasked: '', apiKeySet: false, model: 'deepseek-chat', connStatus: 'unconfigured' },
    { provider: 'openai',   apiKey: '', apiKeyMasked: '', apiKeySet: false, model: 'gpt-4o', connStatus: 'unconfigured' },
  ])
  const [timeout, setTimeout_]   = useState(60)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [concurrent, setConcurrent] = useState(1)
  const [deepseekModel, setDeepseekModel] = useState('deepseek-chat')
  const [saved, setSaved] = useState(false)

  // 页面加载时从后端读取已有配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/settings/config`)
        if (!res.ok) return
        const cfg = await res.json()

        // DeepSeek
        if (cfg.deepseek_api_key_set) {
          updateModel(0, {
            apiKeyMasked: cfg.deepseek_api_key_masked,
            apiKeySet: true,
            connStatus: 'connected',
            model: cfg.deepseek_model || 'deepseek-chat',
          })
          setDeepseekModel(cfg.deepseek_model || 'deepseek-chat')
        }
        // OpenAI
        if (cfg.openai_api_key_set) {
          updateModel(1, {
            apiKeyMasked: cfg.openai_api_key_masked,
            apiKeySet: true,
            connStatus: 'connected',
            model: 'gpt-4o',
          })
        }
        // 高级参数
        if (cfg.request_timeout) setTimeout_(cfg.request_timeout)
        if (cfg.max_tokens) setMaxTokens(cfg.max_tokens)
        if (cfg.max_concurrent) setConcurrent(cfg.max_concurrent)
      } catch {
        // 后端未启动，静默忽略
      } finally {
        setLoading(false)
      }
    }
    loadConfig()
  }, [])

  const updateModel = (idx: number, patch: Partial<ModelConfig>) =>
    setModels(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))

  const testConnection = async (idx: number) => {
    const key = models[idx].apiKey
    if (!key && !models[idx].apiKeySet) return
    updateModel(idx, { connStatus: 'testing' })
    try {
      const res = await fetch(`${API_BASE}/api/settings/test-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: models[idx].provider,
          api_key: key || '',  // 后端会自动用 .env 中已保存的 key
          model: models[idx].provider === 'deepseek' ? deepseekModel : models[idx].model,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        updateModel(idx, { connStatus: 'connected' })
      } else {
        updateModel(idx, { connStatus: 'error' })
      }
    } catch {
      updateModel(idx, { connStatus: 'error' })
    }
  }

  const saveConfig = async () => {
    setSaveError('')
    try {
      const payload: Record<string, unknown> = {
        deepseek_model: deepseekModel,
        request_timeout: timeout,
        max_tokens: maxTokens,
      }
      // 只发送用户实际修改过的 key（非空且非打码占位符）
      if (models[0].apiKey && !models[0].apiKey.startsWith('****')) {
        payload.deepseek_api_key = models[0].apiKey
      }
      if (models[1].apiKey && !models[1].apiKey.startsWith('****')) {
        payload.openai_api_key = models[1].apiKey
      }

      const res = await fetch(`${API_BASE}/api/settings/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveError(err.detail || '保存失败')
        return
      }
      // 保存成功：更新状态，重新拉取打码值
      setSaved(true)
      global_setTimeout(() => setSaved(false), 2000)
      // 刷新配置
      const cfg = await (await fetch(`${API_BASE}/api/settings/config`)).json()
      models.forEach((_, idx) => {
        const provider = models[idx].provider
        if (provider === 'deepseek' && cfg.deepseek_api_key_set) {
          updateModel(idx, { apiKey: '', apiKeyMasked: cfg.deepseek_api_key_masked, apiKeySet: true })
        }
        if (provider === 'openai' && cfg.openai_api_key_set) {
          updateModel(idx, { apiKey: '', apiKeyMasked: cfg.openai_api_key_masked, apiKeySet: true })
        }
      })
    } catch {
      setSaveError('网络错误，请确认后端已启动')
    }
  }

  const providerNames: Record<ModelProvider, string> = {
    deepseek: 'DeepSeek',
    openai: 'OpenAI',
    qwen: '通义千问',
  }

  const tabs: { id: typeof activeTab; label: string; icon: React.ReactNode }[] = [
    { id: 'model',   label: '模型配置', icon: <Icon.Key /> },
    { id: 'storage', label: '存储引擎', icon: <Icon.Database /> },
    { id: 'system',  label: '系统监控', icon: <Icon.Cpu /> },
  ]

  return (
    <>
      <style>{`
        @keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.5)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .settings-tab:hover { color: var(--text-primary) !important; background: rgba(255,255,255,0.03) !important; }
        .settings-tab.active { color: var(--blue-light) !important; background: rgba(37,99,235,0.08) !important; border-color: var(--blue-core) !important; }
        .ghost-btn:hover { background: rgba(37,99,235,0.08) !important; border-color: var(--blue-core) !important; color: var(--blue-light) !important; }
        .ghost-btn-sm:hover { background: rgba(16,185,129,0.08) !important; border-color: rgba(16,185,129,0.5) !important; color: #10b981 !important; }
        .save-btn:hover:not(:disabled) { box-shadow: 0 0 12px rgba(37,99,235,0.3) !important; }
        .settings-input:focus { border-color: var(--blue-core) !important; box-shadow: 0 0 0 2px rgba(37,99,235,0.15) !important; }
      `}</style>

      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
        {/* 顶栏 */}
        <div style={{ height: '48px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '10px' }}>
          <Icon.Settings />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>System Configuration</span>
          {saved && (
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Icon.Check /> 配置已保存
            </span>
          )}
        </div>

        <div style={{ display: 'flex', height: 'calc(100vh - 48px)' }}>
          {/* 左侧 Tab 导航 */}
          <div style={{ width: '180px', background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', padding: '12px 8px', flexShrink: 0 }}>
            {tabs.map(t => (
              <button
                key={t.id}
                className={`settings-tab${activeTab === t.id ? ' active' : ''}`}
                onClick={() => setActiveTab(t.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '9px 12px', marginBottom: '2px',
                  border: `1px solid ${activeTab === t.id ? 'rgba(37,99,235,0.4)' : 'transparent'}`,
                  borderRadius: '4px', background: 'transparent', cursor: 'pointer',
                  color: activeTab === t.id ? 'var(--blue-light)' : 'var(--text-muted)',
                  fontSize: '12px', fontWeight: 600, textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* 主内容 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', maxWidth: '680px' }}>

            {/* ── 模型配置 Tab ── */}
            {activeTab === 'model' && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', letterSpacing: '0.04em' }}>
                  模型提供商配置
                </div>

                {models.map((m, idx) => (
                  <div key={m.provider} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '16px', marginBottom: '10px' }}>
                    {/* 提供商标题行 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {providerNames[m.provider]}
                      </span>
                      <ConnIndicator status={m.connStatus} />
                    </div>

                    {/* API Key 输入（只读，仅展示状态） */}
                    <label style={field.label}>API Key</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="settings-input"
                        type="password"
                        value={m.apiKeySet ? m.apiKeyMasked : ''}
                        placeholder={m.apiKeySet ? `已配置（后端 .env 管理）` : `未配置（需在服务器后端 .env 中设置）`}
                        readOnly
                        style={{ ...field.input(false), paddingRight: '12px', cursor: 'default', opacity: 0.7 }}
                      />
                    </div>

                    {/* 模型选择（只读） */}
                    <div style={{ marginTop: '12px' }}>
                      <label style={field.label}>默认模型</label>
                      <div style={{ position: 'relative' }}>
                        <select
                          value={m.provider === 'deepseek' ? deepseekModel : m.model}
                          disabled
                          style={{ ...field.select, opacity: 0.7, cursor: 'default' }}
                        >
                          {m.provider === 'deepseek' && <>
                            <option value="deepseek-chat">deepseek-chat</option>
                            <option value="deepseek-reasoner">deepseek-reasoner</option>
                          </>}
                          {m.provider === 'openai' && <>
                            <option value="gpt-4o">gpt-4o</option>
                            <option value="gpt-4o-mini">gpt-4o-mini</option>
                            <option value="gpt-4-turbo">gpt-4-turbo</option>
                          </>}
                          {m.provider === 'qwen' && <>
                            <option value="qwen-turbo">qwen-turbo</option>
                            <option value="qwen-plus">qwen-plus</option>
                          </>}
                        </select>
                        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}>
                          <Icon.ChevronDown />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* 高级参数折叠 */}
                <CollapseSection title="推理参数">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    {[
                      { label: '超时时间（秒）', value: timeout, setter: setTimeout_, min: 30, max: 300 },
                      { label: '最大 Token 数',  value: maxTokens, setter: setMaxTokens, min: 512, max: 16384 },
                      { label: '最大并发数',     value: concurrent, setter: setConcurrent, min: 1, max: 10 },
                    ].map(cfg => (
                      <div key={cfg.label}>
                        <label style={field.label}>{cfg.label}</label>
                        <input
                          className="settings-input"
                          type="number"
                          value={cfg.value}
                          min={cfg.min}
                          max={cfg.max}
                          onChange={e => cfg.setter(Number(e.target.value))}
                          style={field.input()}
                        />
                      </div>
                    ))}
                  </div>
                </CollapseSection>
              </div>
            )}

            {/* ── 存储引擎 Tab ── */}
            {activeTab === 'storage' && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>存储引擎配置</div>

                {[
                  { label: 'DuckDB OLAP 引擎', status: 'connected', desc: '本地分析引擎 · 10MB 限制 · 60s 超时' },
                  { label: 'SQLite 记忆层',     status: 'connected', desc: '对话上下文 · 洞察缓存 · 用户偏好' },
                  { label: 'MCP 协议连接器',   status: 'connected', desc: 'CSV / SQLite Server · 双向数据流' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '4px', marginBottom: '8px' }}>
                    <Icon.Database />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>{item.desc}</div>
                    </div>
                    <ConnIndicator status={item.status as ConnStatus} />
                  </div>
                ))}

                <CollapseSection title="数据库路径配置">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      { label: 'DuckDB 数据目录', placeholder: './data/duckdb/' },
                      { label: 'SQLite 文件路径', placeholder: './data/memory.db' },
                    ].map(f => (
                      <div key={f.label}>
                        <label style={field.label}>{f.label}</label>
                        <input className="settings-input" style={field.input()} placeholder={f.placeholder} />
                      </div>
                    ))}
                  </div>
                </CollapseSection>
              </div>
            )}

            {/* ── 系统监控 Tab ── */}
            {activeTab === 'system' && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>系统健康检查</div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  {[
                    { label: 'API 后端',    status: 'connected', detail: 'localhost:8001' },
                    { label: '数据引擎',   status: 'connected', detail: 'DuckDB 0.8.1'  },
                    { label: '记忆层',     status: 'connected', detail: 'SQLite ✓'       },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '14px', textAlign: 'center' }}>
                      <ConnIndicator status={item.status as ConnStatus} />
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', margin: '6px 0 2px' }}>{item.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{item.detail}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '12px' }}>资源用量</div>
                  {[
                    { label: 'API 延迟',    value: 240,  unit: 'ms',  color: '#10b981', pct: 24  },
                    { label: '内存占用',    value: 312,  unit: 'MB',  color: '#2563eb', pct: 61  },
                    { label: '并发请求',    value: 2,    unit: '/15', color: '#6366f1', pct: 13  },
                    { label: '缓存命中率',  value: 87.3, unit: '%',   color: '#10b981', pct: 87  },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                      <span style={{ width: '72px', fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0 }}>{item.label}</span>
                      <div style={{ flex: 1, height: '3px', background: 'var(--border-subtle)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${item.pct}%`, background: item.color, borderRadius: '2px', transition: 'width 0.5s' }} />
                      </div>
                      <span style={{ fontSize: '11px', color: item.color, fontFamily: 'var(--font-mono)', width: '60px', textAlign: 'right', flexShrink: 0 }}>
                        {item.value}{item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 保存按钮 */}
            <div style={{ marginTop: '20px', padding: '10px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              系统配置为只读模式。如需修改 API Key、模型或参数，请在服务器后端编辑 <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>.env</code> 文件后重启服务。
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// 兼容 setTimeout 全局引用
const global_setTimeout = window.setTimeout.bind(window)

export default Settings
