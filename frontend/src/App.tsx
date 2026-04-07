import React, { Suspense, lazy, useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { ConfigProvider, theme as antTheme } from 'antd'


// 组件
import Sidebar from './components/layout/Sidebar'
import LoadingScreen from './components/common/LoadingScreen'
import ErrorBoundary from './components/common/ErrorBoundary'

// 页面（懒加载）
const Dashboard      = lazy(() => import('./pages/Dashboard'))
const QueryAnalyzer  = lazy(() => import('./pages/QueryAnalyzer'))
const DataExplorer   = lazy(() => import('./pages/DataExplorer'))
const AgentMatrix    = lazy(() => import('./pages/AgentMatrix'))
const Visualization  = lazy(() => import('./pages/Visualization'))
const Reports        = lazy(() => import('./pages/Reports'))
const Settings       = lazy(() => import('./pages/Settings'))
const InsightFlow    = lazy(() => import('./pages/InsightFlow'))
const Login          = lazy(() => import('./pages/Login'))

// 状态管理
import { useAppStore } from './store/appStore'

// ─── Ant Design 浅色商务主题 Token ─────────────────────
const ANT_THEME = {
  algorithm: antTheme.defaultAlgorithm,  // 浅色模式
  token: {
    // 主色 — 深蓝
    colorPrimary:        '#1E40AF',
    colorPrimaryHover:   '#1D4ED8',
    colorPrimaryActive:  '#1E3A8A',
    colorPrimaryBorder:  'rgba(30,64,175,0.25)',
    colorPrimaryBg:      'rgba(30,64,175,0.04)',
    colorPrimaryBgHover: 'rgba(30,64,175,0.08)',
    // 背景
    colorBgBase:         '#FFFFFF',
    colorBgContainer:    '#FFFFFF',
    colorBgElevated:     '#F8FAFC',
    colorBgLayout:       '#F1F5F9',
    colorBgSpotlight:    '#F1F5F9',
    colorBgMask:         'rgba(15,23,42,0.45)',
    // 文字
    colorText:           '#0F172A',
    colorTextSecondary:  '#475569',
    colorTextTertiary:   '#94A3B8',
    colorTextQuaternary: '#CBD5E1',
    colorTextDisabled:   '#CBD5E1',
    colorTextHeading:    '#0F172A',
    colorTextPlaceholder:'#94A3B8',
    // 边框
    colorBorder:         '#E2E8F0',
    colorBorderSecondary:'#F1F5F9',
    colorSplit:          '#E2E8F0',
    // 链接
    colorLink:           '#1D4ED8',
    colorLinkHover:      '#1E40AF',
    colorLinkActive:     '#1E3A8A',
    // 信息/成功/警告/错误
    colorInfo:           '#0EA5E9',
    colorSuccess:        '#10B981',
    colorWarning:        '#F59E0B',
    colorError:          '#EF4444',
    // 圆角
    borderRadius:         8,
    borderRadiusLG:       12,
    borderRadiusSM:       6,
    borderRadiusXS:       4,
    // 字体
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize:   14,
    fontSizeLG: 16,
    fontSizeSM: 12,
    lineHeight: 1.6,
    // 阴影
    boxShadow:          '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    boxShadowSecondary: '0 4px 6px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.03)',
    // 控件高度
    controlHeight:   36,
    controlHeightLG: 44,
    controlHeightSM: 28,
    // 间距
    padding:     16,
    paddingLG:   24,
    paddingSM:   12,
    paddingXS:   8,
  },
  components: {
    Card: {
      colorBgContainer: '#FFFFFF',
      colorBorderSecondary: '#E2E8F0',
      boxShadowTertiary: '0 1px 2px rgba(0,0,0,0.03)',
    },
    Button: {
      fontWeight: 500,
      borderRadius: 6,
    },
    Input: {
      colorBgContainer: '#FFFFFF',
      activeShadow: '0 0 0 2px rgba(30,64,175,0.1)',
      hoverBorderColor: '#1D4ED8',
      activeBorderColor: '#1E40AF',
    },
    Select: {
      colorBgContainer: '#FFFFFF',
      optionSelectedBg: 'rgba(30,64,175,0.06)',
    },
    Table: {
      headerBg: '#F8FAFC',
      rowHoverBg: '#F1F5F9',
      borderColor: '#E2E8F0',
    },
    Modal: {
      colorBgElevated: '#FFFFFF',
    },
    Tabs: {
      inkBarColor: '#1E40AF',
    },
    Progress: {
      defaultColor: '#1E40AF',
    },
  },
}

// ─── 移动端底部 Tab 导航 ──────────────────────────────────────
const BOTTOM_NAV = [
  {
    path: '/insightflow', label: '智析',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M12 12v4"/><path d="M9 15l3 2 3-2"/></svg>
  },
  {
    path: '/settings', label: '设置',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
  },
]

const BottomNav: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <>
      <style>{`
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .bottom-nav-inner { padding-bottom: calc(8px + env(safe-area-inset-bottom)); }
        }
        .bottom-nav-item { transition: all 0.18s cubic-bezier(0.16,1,0.3,1); }
        .bottom-nav-item:active { transform: scale(0.9); }
      `}</style>
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 300,
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(24px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
        borderTop: '1px solid #E2E8F0',
        boxShadow: '0 -1px 3px rgba(0,0,0,0.05)',
      }}>
        <div
          className="bottom-nav-inner"
          style={{
            display: 'flex',
            alignItems: 'stretch',
            padding: '8px 0',
          }}
        >
          {BOTTOM_NAV.map(item => {
            const active = location.pathname === item.path ||
              (item.path !== '/dashboard' && item.path !== '/insightflow' && location.pathname.startsWith(item.path))
            return (
              <button
                key={item.path}
                className="bottom-nav-item"
                onClick={() => navigate(item.path)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: active ? '#1E40AF' : '#94A3B8',
                }}
              >
                {/* 活跃指示线 */}
                {active && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    width: 24,
                    height: 2,
                    background: '#1E40AF',
                    borderRadius: '0 0 2px 2px',
                  }} />
                )}
                <span style={{
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  filter: active ? 'none' : 'none',
                  transition: 'filter 0.18s',
                }}>
                  <svg
                    style={{ width: '100%', height: '100%' }}
                    viewBox={item.svg.props.viewBox}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={item.svg.props.strokeWidth}
                    strokeLinecap={item.svg.props.strokeLinecap}
                    strokeLinejoin={item.svg.props.strokeLinejoin}
                  >
                    {item.svg.props.children}
                  </svg>
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  letterSpacing: 0.3,
                  lineHeight: 1,
                }}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}

// ─── 主组件 ──────────────────────────────────────────────────
const App: React.FC = () => {
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const location = useLocation()
  const [showSidebarOnInsightFlow, setShowSidebarOnInsightFlow] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!localStorage.getItem('insightflow_auth')
  })

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth
      setIsMobile(w < 768)
      setIsTablet(w >= 768 && w < 1024)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // 路由变化时重置
  useEffect(() => { setShowSidebarOnInsightFlow(false) }, [location.pathname])

  // InsightFlow 页面：侧边栏默认隐藏，可悬浮按钮展开
  const isInsightFlow = location.pathname === '/insightflow'
  const sidebarVisible = !isMobile && (!isInsightFlow || showSidebarOnInsightFlow)

  // 平板时强制折叠侧边栏
  const effectiveCollapsed = sidebarCollapsed || isTablet

  const sidebarWidth = isMobile || isInsightFlow && !showSidebarOnInsightFlow ? 0 : (effectiveCollapsed ? 64 : 220)

  return (
    <ErrorBoundary>
      <ConfigProvider theme={ANT_THEME}>
        {/* 登录守卫 */}
        {!isLoggedIn ? (
          <Suspense fallback={<LoadingScreen />}>
            <Login onLogin={() => setIsLoggedIn(true)} />
          </Suspense>
        ) : isMobile && isInsightFlow ? (
          /* 手机端 InsightFlow：全屏独立渲染，无侧边栏、无底部导航 */
          <main style={{ width: '100%', height: '100vh', height: '100dvh', overflow: 'hidden' }}>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/insightflow"   element={<InsightFlow />} />
                <Route path="*"              element={<Navigate to="/insightflow" replace />} />
              </Routes>
            </Suspense>
          </main>
        ) : (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#F8FAFC' }}>
          {/* 侧边栏 */}
          {sidebarVisible && <Sidebar forceCollapsed={isTablet} />}

          {/* InsightFlow 页面：悬浮按钮展开/收起侧边栏 */}
          {isInsightFlow && !isMobile && (
            <div
              onClick={() => setShowSidebarOnInsightFlow(v => !v)}
              title={showSidebarOnInsightFlow ? '收起侧边栏' : '展开侧边栏'}
              style={{
                position: 'fixed', left: showSidebarOnInsightFlow ? effectiveCollapsed ? 72 : 228 : 8, top: 72, zIndex: 300,
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(12px)',
                border: '1px solid #E2E8F0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#64748B', fontSize: 13,
                transition: 'all 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
            >
              {showSidebarOnInsightFlow ? '✕' : '☰'}
            </div>
          )}

          <main style={{
            marginLeft: sidebarWidth,
            flex: 1,
            transition: 'margin-left 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
            minHeight: '100vh',
            overflow: 'auto',
            background: '#F8FAFC',
            position: 'relative',
          }}>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/"              element={<Navigate to="/insightflow" replace />} />
                <Route path="/insightflow"   element={<InsightFlow />} />
                <Route path="/dashboard"     element={<Dashboard />} />
                <Route path="/query"         element={<QueryAnalyzer />} />
                <Route path="/explore"       element={<DataExplorer />} />
                <Route path="/agents"        element={<AgentMatrix />} />
                <Route path="/visualization" element={<Visualization />} />
                <Route path="/reports"       element={<Reports />} />
                <Route path="/settings"      element={<Settings />} />
                <Route path="*"              element={<Navigate to="/insightflow" replace />} />
              </Routes>
            </Suspense>
          </main>

          {/* 移动端底部导航（InsightFlow 页面不显示，它自带输入框） */}
          {isMobile && !isInsightFlow && <BottomNav />}
        </div>
        )}
      </ConfigProvider>
    </ErrorBoundary>
  )
}

export default App
