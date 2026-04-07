# DataMind OS 2026 - 前端项目

基于React + TypeScript + Vite构建的智能BI平台前端应用。

## 🚀 快速开始

### 环境要求
- Node.js 18+ 
- npm 9+ 或 yarn 1.22+

### 安装依赖
```bash
npm install
# 或
yarn install
```

### 启动开发服务器
```bash
npm run dev
# 或
yarn dev
```

应用将在 http://localhost:3000 启动。

### 构建生产版本
```bash
npm run build
# 或
yarn build
```

### 预览生产构建
```bash
npm run preview
# 或
yarn preview
```

## 📁 项目结构

```
frontend/
├── public/              # 静态资源
├── src/
│   ├── components/      # 可复用组件
│   │   ├── common/      # 通用组件
│   │   └── layout/      # 布局组件
│   ├── pages/          # 页面组件
│   ├── store/          # 状态管理
│   ├── styles/         # 样式文件
│   ├── utils/          # 工具函数
│   ├── App.tsx         # 主应用组件
│   └── main.tsx        # 应用入口
├── .env                # 环境变量
├── package.json        # 依赖配置
├── vite.config.ts      # Vite配置
├── tailwind.config.js  # Tailwind配置
└── tsconfig.json      # TypeScript配置
```

## 🎨 技术栈

### 核心框架
- **React 18** - UI框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具

### UI组件库
- **Ant Design 5.x** - 企业级UI组件
- **Tailwind CSS** - 实用优先的CSS框架

### 状态管理
- **Zustand** - 轻量级状态管理
- **React Query** - 服务端状态管理

### 路由
- **React Router 6** - 路由管理

### 开发工具
- **ESLint** - 代码检查
- **Prettier** - 代码格式化
- **Husky** - Git钩子

## 📱 页面功能

### 1. 仪表板 (Dashboard)
- 系统概览和关键指标
- 快速操作入口
- 智能体状态监控
- 最近查询记录

### 2. 智能查询 (QueryAnalyzer)
- 自然语言查询输入
- 查询历史记录
- 智能体协作分析
- 结果可视化展示

### 3. 数据探索 (DataExplorer)
- 数据源管理
- 数据集预览
- 数据质量评估
- 数据上传功能

### 4. 智能体矩阵 (AgentMatrix)
- 智能体状态监控
- 任务分配管理
- 性能统计分析
- 协作网络展示

### 5. 可视化 (Visualization)
- 图表创建和编辑
- 仪表板布局管理
- 数据源选择
- 图表模板库

### 6. 报告 (Reports)
- 智能报告生成
- 报告历史管理
- 报告分享和导出
- 报告质量评估

### 7. 设置 (Settings)
- 用户账户管理
- 系统配置
- 通知设置
- API密钥管理

## 🏗️ 架构设计

### 状态管理策略
- **应用状态**: 主题、用户、布局设置
- **查询状态**: 当前查询、历史记录、结果
- **智能体状态**: 智能体列表、任务、性能
- **数据状态**: 数据源、数据集、选择状态
- **可视化状态**: 图表配置、布局、选择

### 组件设计原则
1. **单一职责**: 每个组件只做一件事
2. **可复用性**: 通用组件独立封装
3. **可测试性**: 组件逻辑与UI分离
4. **响应式设计**: 移动端优先

### 性能优化
- 组件懒加载
- 代码分割
- 图片优化
- 缓存策略

## 🔧 开发指南

### 创建新页面
1. 在 `src/pages/` 目录下创建新组件
2. 在 `src/pages/index.ts` 中导出
3. 在 `src/App.tsx` 中添加路由

### 创建新组件
1. 根据组件类型选择目录
2. 使用TypeScript定义Props接口
3. 遵循组件命名规范

### 状态管理
- 使用Zustand管理UI状态
- 使用React Query管理服务端状态
- 避免过度嵌套的状态

### 样式编写
- 优先使用Tailwind CSS
- 组件特定样式使用CSS Modules
- 全局样式在 `src/styles/global.css`

## 🧪 测试

### 运行测试
```bash
npm test
# 或
yarn test
```

### 测试覆盖率
```bash
npm run test:coverage
# 或
yarn test:coverage
```

## 📦 构建和部署

### 环境配置
复制 `.env.example` 为 `.env` 并修改相应配置。

### 构建优化
- 生产环境自动启用代码压缩
- 自动生成sourcemap
- 资源文件hash命名

### 部署建议
- 使用Nginx作为静态文件服务器
- 配置Gzip压缩
- 设置缓存策略

## 🔒 安全考虑

### 前端安全
- XSS防护
- CSRF令牌
- 输入验证
- 输出编码

### 数据安全
- API密钥安全存储
- 敏感数据加密
- 访问控制
- 审计日志

## 🤝 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 📄 许可证

MIT License

## 📞 支持

如有问题，请提交Issue或联系开发团队。