import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ThemeConfig } from 'antd'

interface AppState {
  // 主题
  theme: ThemeConfig
  themeMode: 'ancient' | 'cyber' | 'moonwhite' | 'snownight' | 'abyss'
  
  // 布局
  sidebarCollapsed: boolean
  sidebarWidth: number
  
  // 用户
  user: {
    id: string
    name: string
    email: string
    avatar: string
    role: string
  } | null
  
  // 设置
  settings: {
    language: string
    timezone: string
    notifications: boolean
    autoSave: boolean
    queryCache: boolean
  }
  
  // 系统状态
  systemStatus: {
    connected: boolean
    lastSync: Date | null
    agentsActive: number
    queriesProcessed: number
  }
  
  // Actions
  toggleTheme: () => void
  setTheme: (mode: AppState['themeMode']) => void
  toggleSidebar: () => void
  setUser: (user: AppState['user']) => void
  updateSettings: (settings: Partial<AppState['settings']>) => void
  updateSystemStatus: (status: Partial<AppState['systemStatus']>) => void
}

// ==================== 多主题配置 ====================

/** 古风青铜 - 深墨底色 + 玉绿 + 墨金 */
const ancientTheme: ThemeConfig = {
  token: {
    colorPrimary: '#4a9c6a',
    colorLink: '#c8a84b',
    borderRadius: 4,
    colorBgContainer: '#0d1f14',
    colorBgElevated: '#142a1c',
    colorBgLayout: '#080c09',
    colorText: '#e8d5a0',
    colorTextSecondary: '#8ca882',
    colorBorder: '#2a4a3a',
    colorSplit: '#1a3028',
    fontFamily: '"Noto Serif SC", "Source Han Serif SC", serif',
  },
  components: {
    Layout: { headerBg: '#0d1f14', siderBg: '#0d1f14' },
    Menu: { darkItemBg: '#0d1f14', darkSubMenuItemBg: '#142a1c',
            darkItemSelectedBg: '#1e4030', darkItemHoverBg: '#1a3028',
            darkItemColor: '#8ca882', darkItemSelectedColor: '#c8a84b' },
    Button: { primaryColor: '#e8d5a0' },
    Card: { colorBgContainer: '#0d1f14', colorBorderSecondary: '#2a4a3a' },
    Table: { colorBgContainer: '#0d1f14', headerBg: '#142a1c',
             colorText: '#e8d5a0', borderColor: '#2a4a3a' },
  },
}

/** 赛博暗黑 - 极深黑 + 霓虹青 + 紫 */
const cyberTheme: ThemeConfig = {
  token: {
    colorPrimary: '#00d4aa',
    colorLink: '#a855f7',
    borderRadius: 2,
    colorBgContainer: '#0a0a0f',
    colorBgElevated: '#111118',
    colorBgLayout: '#050508',
    colorText: '#e2e8f0',
    colorTextSecondary: '#94a3b8',
    colorBorder: '#1e293b',
    colorSplit: '#0f172a',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  },
  components: {
    Layout: { headerBg: '#0a0a0f', siderBg: '#0a0a0f' },
    Menu: { darkItemBg: '#0a0a0f', darkSubMenuItemBg: '#111118',
            darkItemSelectedBg: '#0d2b22', darkItemHoverBg: '#0f1a2a',
            darkItemColor: '#94a3b8', darkItemSelectedColor: '#00d4aa' },
    Card: { colorBgContainer: '#0a0a0f', colorBorderSecondary: '#1e293b' },
    Table: { colorBgContainer: '#0a0a0f', headerBg: '#111118',
             colorText: '#e2e8f0', borderColor: '#1e293b' },
  },
}

/** 月白浅雅 - 淡米底 + 靛青 + 深墨 */
const moonwhiteTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1a5c8c',
    colorLink: '#8b4513',
    borderRadius: 6,
    colorBgContainer: '#faf7f2',
    colorBgElevated: '#f0ebe0',
    colorBgLayout: '#f5f0e8',
    colorText: '#2c2c2c',
    colorTextSecondary: '#6b5e4e',
    colorBorder: '#d4c9b8',
    colorSplit: '#e8e0d0',
    fontFamily: '"Noto Serif SC", "PingFang SC", serif',
  },
  components: {
    Layout: { headerBg: '#2c3e50', headerColor: '#f5f0e8', siderBg: '#faf7f2' },
    Menu: { itemBg: '#faf7f2', subMenuItemBg: '#f0ebe0',
            itemSelectedBg: '#e8e0d0', itemHoverBg: '#f0ebe0',
            itemColor: '#6b5e4e', itemSelectedColor: '#1a5c8c' },
    Card: { colorBgContainer: '#faf7f2', colorBorderSecondary: '#d4c9b8' },
    Table: { colorBgContainer: '#faf7f2', headerBg: '#f0ebe0',
             colorText: '#2c2c2c', borderColor: '#d4c9b8' },
  },
}

/** 雪夜极简 - 纯白 + 冰蓝 + 深灰 */
const snowNightTheme: ThemeConfig = {
  token: {
    colorPrimary: '#2563eb',
    colorLink: '#7c3aed',
    borderRadius: 8,
    colorBgContainer: '#ffffff',
    colorBgElevated: '#f8fafc',
    colorBgLayout: '#f1f5f9',
    colorText: '#1e293b',
    colorTextSecondary: '#64748b',
    colorBorder: '#e2e8f0',
    colorSplit: '#f1f5f9',
    fontFamily: '"Inter", "PingFang SC", sans-serif',
  },
  components: {
    Layout: { headerBg: '#1e293b', headerColor: '#f8fafc', siderBg: '#ffffff' },
    Menu: { itemBg: '#ffffff', subMenuItemBg: '#f8fafc',
            itemSelectedBg: '#eff6ff', itemHoverBg: '#f8fafc',
            itemColor: '#64748b', itemSelectedColor: '#2563eb' },
    Card: { colorBgContainer: '#ffffff', colorBorderSecondary: '#e2e8f0' },
    Table: { colorBgContainer: '#ffffff', headerBg: '#f8fafc',
             colorText: '#1e293b', borderColor: '#e2e8f0' },
  },
}

/** 深渊极夜 - 纯黑 + 血橙 + 深红 */
const abyssTheme: ThemeConfig = {
  token: {
    colorPrimary: '#f97316',
    colorLink: '#ef4444',
    borderRadius: 0,
    colorBgContainer: '#0c0c0c',
    colorBgElevated: '#141414',
    colorBgLayout: '#080808',
    colorText: '#d4d4d4',
    colorTextSecondary: '#737373',
    colorBorder: '#262626',
    colorSplit: '#1a1a1a',
    fontFamily: '"Roboto Mono", monospace',
  },
  components: {
    Layout: { headerBg: '#0c0c0c', siderBg: '#0c0c0c' },
    Menu: { darkItemBg: '#0c0c0c', darkSubMenuItemBg: '#141414',
            darkItemSelectedBg: '#1f1008', darkItemHoverBg: '#1a1a1a',
            darkItemColor: '#737373', darkItemSelectedColor: '#f97316' },
    Card: { colorBgContainer: '#0c0c0c', colorBorderSecondary: '#262626' },
    Table: { colorBgContainer: '#0c0c0c', headerBg: '#141414',
             colorText: '#d4d4d4', borderColor: '#262626' },
  },
}

const THEMES: Record<string, ThemeConfig> = {
  ancient: ancientTheme,
  cyber: cyberTheme,
  moonwhite: moonwhiteTheme,
  snownight: snowNightTheme,
  abyss: abyssTheme,
}

/** CSS 变量映射（注入到 document.body） */
const THEME_CSS_VARS: Record<string, Record<string, string>> = {
  ancient: {
    '--bg': '#080c09', '--bg-card': '#0d1f14', '--accent': '#4a9c6a',
    '--accent2': '#c8a84b', '--text': '#e8d5a0', '--text-muted': '#8ca882',
    '--border': '#2a4a3a', '--sidebar-width': '220px',
  },
  cyber: {
    '--bg': '#050508', '--bg-card': '#0a0a0f', '--accent': '#00d4aa',
    '--accent2': '#a855f7', '--text': '#e2e8f0', '--text-muted': '#94a3b8',
    '--border': '#1e293b', '--sidebar-width': '220px',
  },
  moonwhite: {
    '--bg': '#f5f0e8', '--bg-card': '#faf7f2', '--accent': '#1a5c8c',
    '--accent2': '#8b4513', '--text': '#2c2c2c', '--text-muted': '#6b5e4e',
    '--border': '#d4c9b8', '--sidebar-width': '220px',
  },
  snownight: {
    '--bg': '#f1f5f9', '--bg-card': '#ffffff', '--accent': '#2563eb',
    '--accent2': '#7c3aed', '--text': '#1e293b', '--text-muted': '#64748b',
    '--border': '#e2e8f0', '--sidebar-width': '220px',
  },
  abyss: {
    '--bg': '#080808', '--bg-card': '#0c0c0c', '--accent': '#f97316',
    '--accent2': '#ef4444', '--text': '#d4d4d4', '--text-muted': '#737373',
    '--border': '#262626', '--sidebar-width': '220px',
  },
}

function applyCSSVars(mode: string) {
  const vars = THEME_CSS_VARS[mode]
  if (vars && typeof document !== 'undefined') {
    Object.entries(vars).forEach(([k, v]) => {
      document.body.style.setProperty(k, v)
    })
    document.body.setAttribute('data-theme', mode)
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 初始状态 - 默认古风主题
      theme: ancientTheme,
      themeMode: 'ancient',
      sidebarCollapsed: false,
      sidebarWidth: 220,
      user: {
        id: 'user_001',
        name: '吴',
        email: 'wu@datamind.ai',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=吴',
        role: '产品经理',
      },
      settings: {
        language: 'zh-CN',
        timezone: 'Asia/Shanghai',
        notifications: true,
        autoSave: true,
        queryCache: true,
      },
      systemStatus: {
        connected: true,
        lastSync: new Date(),
        agentsActive: 7,
        queriesProcessed: 1245,
      },
      
      // Actions
      toggleTheme: () => {
        const { themeMode } = get()
        const modes: AppState['themeMode'][] = ['ancient', 'cyber', 'moonwhite', 'snownight', 'abyss']
        const idx = modes.indexOf(themeMode)
        const nextMode = modes[(idx + 1) % modes.length]
        applyCSSVars(nextMode)
        set({ themeMode: nextMode, theme: THEMES[nextMode] })
      },
      
      setTheme: (mode) => {
        applyCSSVars(mode)
        set({ themeMode: mode, theme: THEMES[mode] })
      },
      
      toggleSidebar: () => {
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
          sidebarWidth: state.sidebarCollapsed ? 220 : 80,
        }))
      },
      
      setUser: (user) => {
        set({ user })
      },
      
      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }))
      },
      
      updateSystemStatus: (newStatus) => {
        set((state) => ({
          systemStatus: { ...state.systemStatus, ...newStatus },
        }))
      },
    }),
    {
      name: 'datamind-app-storage',
      partialize: (state) => ({
        themeMode: state.themeMode,
        sidebarCollapsed: state.sidebarCollapsed,
        settings: state.settings,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        // 恢复时重新应用 CSS 变量
        if (state?.themeMode) {
          applyCSSVars(state.themeMode)
          state.theme = THEMES[state.themeMode] || ancientTheme
        }
      },
    }
  )
)

// 查询状态管理
interface QueryState {
  currentQuery: string
  queryHistory: Array<{
    id: string
    query: string
    timestamp: Date
    result?: any
    error?: string
  }>
  queryResults: Record<string, any>
  isLoading: boolean
  error: string | null
  
  // Actions
  setCurrentQuery: (query: string) => void
  executeQuery: (query: string) => Promise<void>
  clearQuery: () => void
  addToHistory: (query: string, result?: any, error?: string) => void
  clearHistory: () => void
}

export const useQueryStore = create<QueryState>((set, get) => ({
  currentQuery: '',
  queryHistory: [],
  queryResults: {},
  isLoading: false,
  error: null,
  
  setCurrentQuery: (query) => {
    set({ currentQuery: query })
  },
  
  executeQuery: async (query) => {
    set({ isLoading: true, error: null })
    
    try {
      // 真实 API 调用后端
      const response = await apiClient.post('/queries/natural-language', {
        question: query,
        data_source: null,
        context: {},
        visualization_type: 'auto',
        detailed: true
      })
      
      // apiClient 拦截器已提取 response.data
      const result = response as any
      
      const queryId = result.query_id || `query_${Date.now()}`
      
      set((state) => ({
        queryResults: { ...state.queryResults, [queryId]: result },
        isLoading: false,
      }))
      
      get().addToHistory(query, result)
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '查询执行失败，请检查后端服务是否启动'
      set({ 
        error: errorMsg,
        isLoading: false,
      })
      get().addToHistory(query, undefined, errorMsg)
    }
  },
  
  clearQuery: () => {
    set({ currentQuery: '', error: null })
  },
  
  addToHistory: (query, result, error) => {
    const historyItem = {
      id: `hist_${Date.now()}`,
      query,
      timestamp: new Date(),
      result,
      error,
    }
    
    set((state) => ({
      queryHistory: [historyItem, ...state.queryHistory].slice(0, 50), // 保留最近50条
    }))
  },
  
  clearHistory: () => {
    set({ queryHistory: [] })
  },
}))

// 智能体状态管理
interface AgentState {
  agents: Array<{
    id: string
    name: string
    role: string
    status: 'idle' | 'processing' | 'error'
    currentTask: string | null
    performance: {
      tasksCompleted: number
      successRate: number
      avgResponseTime: number
    }
  }>
  selectedAgent: string | null
  agentTasks: Record<string, Array<{
    id: string
    description: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    createdAt: Date
    completedAt?: Date
    result?: any
  }>>
  
  // Actions
  setSelectedAgent: (agentId: string | null) => void
  updateAgentStatus: (agentId: string, status: AgentState['agents'][0]['status'], task?: string) => void
  assignTask: (agentId: string, taskDescription: string) => void
  completeTask: (agentId: string, taskId: string, result?: any) => void
  failTask: (agentId: string, taskId: string, error: string) => void
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [
    {
      id: 'chief_analyst',
      name: '首席分析师',
      role: '任务分解与协调',
      status: 'idle',
      currentTask: null,
      performance: { tasksCompleted: 124, successRate: 0.95, avgResponseTime: 1.2 },
    },
    {
      id: 'data_detective',
      name: '数据侦探',
      role: '异常检测与模式发现',
      status: 'processing',
      currentTask: '分析销售数据异常',
      performance: { tasksCompleted: 89, successRate: 0.92, avgResponseTime: 2.5 },
    },
    {
      id: 'prediction_prophet',
      name: '预测先知',
      role: '趋势预测与风险评估',
      status: 'idle',
      currentTask: null,
      performance: { tasksCompleted: 67, successRate: 0.88, avgResponseTime: 3.8 },
    },
    {
      id: 'optimization_advisor',
      name: '优化顾问',
      role: '方案推荐与自动调优',
      status: 'idle',
      currentTask: null,
      performance: { tasksCompleted: 45, successRate: 0.90, avgResponseTime: 4.2 },
    },
    {
      id: 'narrative_writer',
      name: '叙事作家',
      role: '报告生成与故事叙述',
      status: 'idle',
      currentTask: null,
      performance: { tasksCompleted: 78, successRate: 0.94, avgResponseTime: 5.1 },
    },
  ],
  selectedAgent: null,
  agentTasks: {},
  
  setSelectedAgent: (agentId) => {
    set({ selectedAgent: agentId })
  },
  
  updateAgentStatus: (agentId, status, task) => {
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === agentId
          ? { ...agent, status, currentTask: task || agent.currentTask }
          : agent
      ),
    }))
  },
  
  assignTask: (agentId, taskDescription) => {
    const taskId = `task_${Date.now()}`
    const task = {
      id: taskId,
      description: taskDescription,
      status: 'pending' as const,
      createdAt: new Date(),
    }
    
    set((state) => ({
      agentTasks: {
        ...state.agentTasks,
        [agentId]: [...(state.agentTasks[agentId] || []), task],
      },
    }))
    
    // 模拟任务开始处理
    setTimeout(() => {
      set((state) => ({
        agents: state.agents.map((agent) =>
          agent.id === agentId
            ? { ...agent, status: 'processing', currentTask: taskDescription }
            : agent
        ),
        agentTasks: {
          ...state.agentTasks,
          [agentId]: (state.agentTasks[agentId] || []).map((t) =>
            t.id === taskId ? { ...t, status: 'processing' } : t
          ),
        },
      }))
      
      // 模拟任务完成（3-8秒后）
      const completionTime = 3000 + Math.random() * 5000
      setTimeout(() => {
        set((state) => ({
          agents: state.agents.map((agent) =>
            agent.id === agentId
              ? { ...agent, status: 'idle', currentTask: null }
              : agent
          ),
          agentTasks: {
            ...state.agentTasks,
            [agentId]: (state.agentTasks[agentId] || []).map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'completed',
                    completedAt: new Date(),
                    result: { message: '任务执行成功', confidence: 0.85 },
                  }
                : t
            ),
          },
        }))
      }, completionTime)
    }, 500)
  },
  
  completeTask: (agentId, taskId, result) => {
    set((state) => ({
      agentTasks: {
        ...state.agentTasks,
        [agentId]: (state.agentTasks[agentId] || []).map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: 'completed',
                completedAt: new Date(),
                result,
              }
            : task
        ),
      },
    }))
  },
  
  failTask: (agentId, taskId, error) => {
    set((state) => ({
      agentTasks: {
        ...state.agentTasks,
        [agentId]: (state.agentTasks[agentId] || []).map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: 'failed',
                completedAt: new Date(),
                result: { error },
              }
            : task
        ),
      },
    }))
  },
}))

// 数据状态管理
interface DataState {
  dataSources: Array<{
    id: string
    name: string
    type: 'database' | 'file' | 'api' | 'demo'
    description: string
    connected: boolean
    lastSync: Date | null
  }>
  currentDataSource: string | null
  datasets: Record<string, any[]>
  selectedDataset: string | null
  
  // Actions
  setCurrentDataSource: (sourceId: string | null) => void
  addDataSource: (source: DataState['dataSources'][0]) => void
  updateDataSource: (sourceId: string, updates: Partial<DataState['dataSources'][0]>) => void
  removeDataSource: (sourceId: string) => void
  setSelectedDataset: (datasetId: string | null) => void
  loadDataset: (datasetId: string, data: any[]) => void
}

export const useDataStore = create<DataState>((set) => ({
  dataSources: [
    {
      id: 'demo_sales',
      name: '演示销售数据',
      type: 'demo',
      description: '包含销售、客户、产品的演示数据',
      connected: true,
      lastSync: new Date(),
    },
    {
      id: 'demo_users',
      name: '演示用户数据',
      type: 'demo',
      description: '用户行为和分析数据',
      connected: true,
      lastSync: new Date(),
    },
    {
      id: 'csv_import',
      name: 'CSV导入数据',
      type: 'file',
      description: '从CSV文件导入的数据',
      connected: true,
      lastSync: new Date('2026-03-22'),
    },
  ],
  currentDataSource: 'demo_sales',
  datasets: {
    demo_sales: [
      { date: '2026-01-01', region: '华东', product: '产品A', sales: 1200, profit: 300 },
      { date: '2026-01-02', region: '华东', product: '产品B', sales: 800, profit: 200 },
      { date: '2026-01-03', region: '华南', product: '产品A', sales: 1500, profit: 400 },
      { date: '2026-01-04', region: '华南', product: '产品C', sales: 900, profit: 250 },
      { date: '2026-01-05', region: '华北', product: '产品B', sales: 1100, profit: 280 },
    ],
    demo_users: [
      { id: 1, name: '用户A', age: 28, income: 50000, purchases: 12, loyalty: 0.85 },
      { id: 2, name: '用户B', age: 35, income: 75000, purchases: 8, loyalty: 0.72 },
      { id: 3, name: '用户C', age: 42, income: 60000, purchases: 15, loyalty: 0.91 },
      { id: 4, name: '用户D', age: 31, income: 55000, purchases: 6, loyalty: 0.68 },
      { id: 5, name: '用户E', age: 26, income: 45000, purchases: 10, loyalty: 0.79 },
    ],
  },
  selectedDataset: 'demo_sales',
  
  setCurrentDataSource: (sourceId) => {
    set({ currentDataSource: sourceId })
  },
  
  addDataSource: (source) => {
    set((state) => ({
      dataSources: [...state.dataSources, source],
    }))
  },
  
  updateDataSource: (sourceId, updates) => {
    set((state) => ({
      dataSources: state.dataSources.map((source) =>
        source.id === sourceId ? { ...source, ...updates } : source
      ),
    }))
  },
  
  removeDataSource: (sourceId) => {
    set((state) => ({
      dataSources: state.dataSources.filter((source) => source.id !== sourceId),
      currentDataSource: state.currentDataSource === sourceId ? null : state.currentDataSource,
    }))
  },
  
  setSelectedDataset: (datasetId) => {
    set({ selectedDataset: datasetId })
  },
  
  loadDataset: (datasetId, data) => {
    set((state) => ({
      datasets: { ...state.datasets, [datasetId]: data },
    }))
  },
}))

// 可视化状态管理
interface VisualizationState {
  charts: Array<{
    id: string
    title: string
    type: 'line' | 'bar' | 'pie' | 'scatter' | 'heatmap' | '3d'
    data: any[]
    config: Record<string, any>
    position: { x: number; y: number; width: number; height: number }
  }>
  layout: {
    rows: number
    cols: number
    spacing: number
    backgroundColor: string
  }
  selectedChart: string | null
  
  // Actions
  addChart: (chart: Omit<VisualizationState['charts'][0], 'id'>) => void
  updateChart: (chartId: string, updates: Partial<VisualizationState['charts'][0]>) => void
  removeChart: (chartId: string) => void
  setSelectedChart: (chartId: string | null) => void
  updateLayout: (layout: Partial<VisualizationState['layout']>) => void
  resetLayout: () => void
}

export const useVisualizationStore = create<VisualizationState>((set) => ({
  charts: [
    {
      id: 'chart_1',
      title: '销售额趋势',
      type: 'line',
      data: [
        { date: '2026-01', sales: 1200 },
        { date: '2026-02', sales: 1800 },
        { date: '2026-03', sales: 1500 },
        { date: '2026-04', sales: 2200 },
        { date: '2026-05', sales: 1900 },
      ],
      config: { color: '#1890ff', showGrid: true },
      position: { x: 0, y: 0, width: 6, height: 4 },
    },
    {
      id: 'chart_2',
      title: '区域分布',
      type: 'pie',
      data: [
        { region: '华东', value: 45 },
        { region: '华南', value: 25 },
        { region: '华北', value: 20 },
        { region: '其他', value: 10 },
      ],
      config: { colors: ['#1890ff', '#52c41a', '#faad14', '#ff4d4f'] },
      position: { x: 6, y: 0, width: 6, height: 4 },
    },
    {
      id: 'chart_3',
      title: '产品销量',
      type: 'bar',
      data: [
        { product: '产品A', sales: 1200 },
        { product: '产品B', sales: 800 },
        { product: '产品C', sales: 1500 },
        { product: '产品D', sales: 900 },
      ],
      config: { color: '#13c2c2', horizontal: false },
      position: { x: 0, y: 4, width: 6, height: 4 },
    },
  ],
  layout: {
    rows: 8,
    cols: 12,
    spacing: 16,
    backgroundColor: '#ffffff',
  },
  selectedChart: null,
  
  addChart: (chart) => {
    const newChart = {
      ...chart,
      id: `chart_${Date.now()}`,
    }
    
    set((state) => ({
      charts: [...state.charts, newChart],
    }))
  },
  
  updateChart: (chartId, updates) => {
    set((state) => ({
      charts: state.charts.map((chart) =>
        chart.id === chartId ? { ...chart, ...updates } : chart
      ),
    }))
  },
  
  removeChart: (chartId) => {
    set((state) => ({
      charts: state.charts.filter((chart) => chart.id !== chartId),
      selectedChart: state.selectedChart === chartId ? null : state.selectedChart,
    }))
  },
  
  setSelectedChart: (chartId) => {
    set({ selectedChart: chartId })
  },
  
  updateLayout: (newLayout) => {
    set((state) => ({
      layout: { ...state.layout, ...newLayout },
    }))
  },
  
  resetLayout: () => {
    set({
      layout: {
        rows: 8,
        cols: 12,
        spacing: 16,
        backgroundColor: '#ffffff',
      },
    })
  },
}))

// API客户端
import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      // 服务器返回错误
      const { status, data } = error.response
      
      switch (status) {
        case 401:
          // 未授权，跳转到登录
          window.location.href = '/login'
          break
        case 403:
          // 禁止访问
          console.error('权限不足:', data.message)
          break
        case 404:
          // 资源不存在
          console.error('资源不存在:', data.message)
          break
        case 500:
          // 服务器错误
          console.error('服务器错误:', data.message)
          break
        default:
          console.error('请求错误:', data.message)
      }
    } else if (error.request) {
      // 请求发送但无响应
      console.error('网络错误: 无法连接到服务器')
    } else {
      // 请求配置错误
      console.error('请求配置错误:', error.message)
    }
    
    return Promise.reject(error)
  }
)

// API函数
export const api = {
  // 查询相关
  query: {
    naturalLanguage: (data: any) => apiClient.post('/queries/natural-language', data),
    getHistory: (limit?: number) => apiClient.get(`/queries/history?limit=${limit || 10}`),
    getStats: () => apiClient.get('/queries/stats'),
    batchQuery: (queries: any[]) => apiClient.post('/queries/batch', { queries }),
    getSuggestions: (prefix: string, limit?: number) => 
      apiClient.get(`/queries/suggestions?prefix=${prefix}&limit=${limit || 5}`),
  },
  
  // 智能体相关
  agents: {
    list: () => apiClient.get('/agents'),
    getStatus: (agentId: string) => apiClient.get(`/agents/${agentId}`),
    assignTask: (agentId: string, task: any) => apiClient.post(`/agents/${agentId}/tasks`, task),
    getHistory: (agentId: string, limit?: number) => 
      apiClient.get(`/agents/${agentId}/history?limit=${limit || 10}`),
    getPerformance: (agentId: string) => apiClient.get(`/agents/${agentId}/performance`),
    getMatrixStatus: () => apiClient.get('/agents/matrix/status'),
    coordinate: (data: any) => apiClient.post('/agents/matrix/coordinate', data),
  },
  
  // 数据相关
  data: {
    listSources: () => apiClient.get('/queries/data-sources'),
    upload: (fileType: string, dataName: string, description?: string) =>
      apiClient.post('/queries/upload', { file_type: fileType, data_name: dataName, description }),
  },
  
  // 系统相关
  system: {
    health: () => apiClient.get('/health'),
    status: () => apiClient.get('/'),
    cache: {
      status: () => apiClient.get('/queries/cache/status'),
      clear: () => apiClient.post('/queries/cache/clear'),
    },
  },
  
  // 用户相关
  auth: {
    login: (credentials: any) => apiClient.post('/auth/login', credentials),
    logout: () => apiClient.post('/auth/logout'),
    profile: () => apiClient.get('/auth/profile'),
    updateProfile: (data: any) => apiClient.put('/auth/profile', data),
  },
}

// ═══════════════════════════════════════════════════════════════
// 分析报告持久化 Store — 页面切换不丢失
// ═══════════════════════════════════════════════════════════════

export interface AgentOutputRecord {
  agentId: string
  agentName: string
  agentColor: string
  title: string
  lines: string[]
  chartData?: number[]
  statsData?: Record<string, string>
}

export interface AnalysisReport {
  id: string
  createdAt: string
  fileName: string
  fileKey: string          // 文件名（用于去重显示）
  fileSize: number
  dataSource: string
  instruction: string
  useRealData: boolean
  rows?: number
  columns?: number
  agentOutputs: AgentOutputRecord[]
  status: 'complete' | 'partial'
  executionMs?: number
}

interface AnalysisState {
  reports: AnalysisReport[]
  addReport: (report: AnalysisReport) => void
  removeReport: (id: string) => void
  clearReports: () => void
  getLatestReport: () => AnalysisReport | undefined
}

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set, get) => ({
      reports: [],

      addReport: (report) => {
        set((state) => ({
          reports: [report, ...state.reports].slice(0, 50), // 最多保留 50 份
        }))
      },

      removeReport: (id) => {
        set((state) => ({
          reports: state.reports.filter((r) => r.id !== id),
        }))
      },

      clearReports: () => {
        set({ reports: [] })
      },

      getLatestReport: () => {
        const { reports } = get()
        return reports.length > 0 ? reports[0] : undefined
      },
    }),
    {
      name: 'insightflow-analysis-reports', // localStorage key
      partialize: (state) => ({ reports: state.reports }),
    }
  )
)

// 导出类型
export type { AppState, QueryState, AgentState, DataState, VisualizationState, AnalysisState }