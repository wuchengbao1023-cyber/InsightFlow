import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'

const NAV_ITEMS = [
  {
    path: '/insightflow', label: '智析',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M12 12v4"/><path d="M9 15l3 2 3-2"/></svg>
  },
  {
    path: '/settings', label: '设置',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
  },
]

interface SidebarProps {
  /** 平板强制折叠，忽略用户展开操作 */
  forceCollapsed?: boolean
}

const Sidebar: React.FC<SidebarProps> = ({ forceCollapsed = false }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar } = useAppStore()

  const collapsed = forceCollapsed || sidebarCollapsed
  const W = collapsed ? 64 : 220

  return (
    <div style={{
      width: W, minWidth: W, height: '100vh',
      position: 'fixed', left: 0, top: 0, bottom: 0,
      background: 'rgba(255, 255, 255, 0.82)',
      backdropFilter: 'blur(24px) saturate(1.6)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
      borderRight: '1px solid #E2E8F0',
      boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
      display: 'flex', flexDirection: 'column',
      zIndex: 200,
      transition: 'width 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
      fontFamily: '"Inter","SF Pro Display","PingFang SC","Microsoft YaHei",sans-serif',
      overflow: 'hidden',
    }}>

      {/* ── 内联样式 ── */}
      <style>{`
        /* 导航项 */
        .nav-item {
          position: relative;
          cursor: pointer;
          border-radius: 10px;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }

        /* 悬停 */
        .nav-item:hover {
          background: #EFF6FF !important;
        }
        .nav-item:hover .nav-label {
          color: #1E40AF !important;
        }
        .nav-item:hover .nav-icon-wrap {
          color: #2563EB !important;
        }

        /* 活跃态 */
        .nav-item.active {
          background: #EFF6FF !important;
          box-shadow: inset 3px 0 0 #1E40AF;
        }
        .nav-item.active .nav-label {
          color: #1E40AF !important;
          font-weight: 700 !important;
        }
        .nav-item.active .nav-icon-wrap {
          color: #1E40AF !important;
        }

        /* 折叠按钮 */
        .collapse-btn {
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        }
        .collapse-btn:hover {
          background: #F1F5F9 !important;
          color: #475569 !important;
        }

        /* Logo */
        .logo-icon { box-shadow: 0 1px 4px rgba(30,64,175,0.2); }

        /* 版本徽标 */
        .version-badge {
          font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
          padding: 1px 5px; border-radius: 4px;
          background: #EFF6FF;
          border: 1px solid #BFDBFE;
          color: #1E40AF;
        }
      `}</style>

      {/* ── Logo 区域 ── */}
      <div style={{
        height: 64,
        display: 'flex', alignItems: 'center',
        padding: collapsed ? '0 14px' : '0 16px',
        borderBottom: '1px solid #F1F5F9',
        gap: 10,
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {/* Logo 图标 */}
        <div
          className="logo-icon"
          style={{
            width: 34, height: 34,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 45%, #2563EB 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.95)" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>

        {/* 文字 */}
        {!collapsed && (
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap',
            }}>
              <span style={{
                fontSize: 14.5, fontWeight: 800,
                letterSpacing: -0.2,
                color: '#0F172A',
                whiteSpace: 'nowrap',
              }}>
                InsightFlow
              </span>
              <span className="version-badge">AI</span>
            </div>
            <div style={{
              fontSize: 10, color: '#94A3B8', letterSpacing: 0.3,
              whiteSpace: 'nowrap', marginTop: 1,
            }}>
              Your AI Data Analyst Team
            </div>
          </div>
        )}
      </div>

      {/* ── 导航区域 ── */}
      <nav style={{
        flex: 1,
        padding: '10px 7px',
        display: 'flex', flexDirection: 'column',
        gap: 2,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path ||
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path))

          return (
            <div
              key={item.path}
              className={`nav-item${active ? ' active' : ''}`}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: collapsed ? '11px 0' : '11px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: active ? '#1E40AF' : '#64748B',
              }}
            >
              {/* 图标 */}
              <span
                className="nav-icon-wrap"
                style={{
                  width: 18, height: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  color: active ? '#1E40AF' : '#94A3B8',
                  transition: 'all 0.18s ease',
                }}
              >
                <svg
                  style={{ width: '100%', height: '100%' }}
                  viewBox={item.svg.props.viewBox}
                  fill={item.svg.props.fill}
                  stroke="currentColor"
                  strokeWidth={item.svg.props.strokeWidth}
                  strokeLinecap={item.svg.props.strokeLinecap}
                  strokeLinejoin={item.svg.props.strokeLinejoin}
                >
                  {item.svg.props.children}
                </svg>
              </span>

              {/* 文字标签 */}
              {!collapsed && (
                <span
                  className="nav-label"
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    color: active ? '#1E40AF' : '#475569',
                    whiteSpace: 'nowrap',
                    letterSpacing: 0.1,
                    transition: 'all 0.15s',
                  }}
                >
                  {item.label}
                </span>
              )}
            </div>
          )
        })}
      </nav>

      {/* ── 底部状态 ── */}
      {!collapsed && (
        <div style={{
          padding: '8px 10px 4px',
          borderTop: '1px solid #F1F5F9',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px',
            borderRadius: 10,
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#10B981',
              flexShrink: 0,
            }}/>
            <span style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap' }}>6 智能体 · 待命中</span>
          </div>
        </div>
      )}

      {/* 折叠按钮 - 始终显示 */}
      <div
        className="collapse-btn"
        onClick={toggleSidebar}
        style={{
          height: 44,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          borderTop: '1px solid #F1F5F9',
          color: '#94A3B8',
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8,
          transition: 'all 0.2s',
          fontSize: 16, color: '#64748B',
          background: '#F1F5F9',
          border: '1px solid #E2E8F0',
        }} title={collapsed ? '展开侧边栏' : '收起侧边栏'}>
          {collapsed ? '»' : '«'}
        </span>
      </div>
    </div>
  )
}

export default Sidebar
