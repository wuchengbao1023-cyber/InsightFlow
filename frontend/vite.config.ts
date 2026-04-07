import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    strictPort: true,  // 严格使用3000端口
    open: '/',  // 默认打开首页
    proxy: {
      // SSE 流式端点必须独立配置，禁用所有缓冲
      '/api/insightflow/ask': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
        // SSE 必须禁用代理缓冲，否则流式响应会被截断
        headers: {
          'Accept': 'text/event-stream',
          'X-Accel-Buffering': 'no',
          'Cache-Control': 'no-cache, no-transform',
        },
      },
      '/api/insightflow/upload': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/api/insightflow/upload/multi': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@styles': path.resolve(__dirname, './src/styles'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['echarts', 'echarts-for-react'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          ui: ['antd', '@ant-design/icons'],
          utils: ['lodash', 'date-fns', 'immer', 'zod'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})