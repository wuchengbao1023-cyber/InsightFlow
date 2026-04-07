import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from 'react-query'
import zhCN from 'antd/locale/zh_CN'
import 'antd/dist/reset.css'
import './styles/global.css'
import App from './App'
// 创建React Query客户端
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5分钟
    },
  },
})

// 根组件 — 固定深海蓝暗色主题，不随 store 主题切换
const Root: React.FC = () => {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider locale={zhCN}>
          <App />
        </ConfigProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)