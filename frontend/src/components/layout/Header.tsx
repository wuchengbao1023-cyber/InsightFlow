import React, { useState } from 'react'
import { 
  Layout, 
  Button, 
  Avatar, 
  Dropdown, 
  Space, 
  Badge, 
  Input, 
  Tooltip,
  Typography,
  Switch,
  message
} from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  BellOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  DashboardOutlined,
  ApiOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

import { useAppStore, useQueryStore } from '../../store/appStore'

const { Header: AntHeader } = Layout
const { Title } = Typography
const { Search } = Input

const Header: React.FC = () => {
  const navigate = useNavigate()
  const [searchValue, setSearchValue] = useState('')
  const [notifications, setNotifications] = useState([
    { id: 1, title: '系统更新', description: 'DataMind OS 2026.1已发布', read: false },
    { id: 2, title: '数据异常', description: '检测到销售数据异常', read: false },
    { id: 3, title: '预测完成', description: '下季度趋势预测已完成', read: true },
  ])

  const {
    themeMode,
    toggleTheme,
    toggleSidebar,
    sidebarCollapsed,
    user,
    systemStatus,
  } = useAppStore()

  const { executeQuery, isLoading } = useQueryStore()

  const unreadNotifications = notifications.filter(n => !n.read).length

  const handleSearch = (value: string) => {
    if (value.trim()) {
      executeQuery(value)
      setSearchValue('')
    }
  }

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'dashboard':
        navigate('/dashboard')
        break
      case 'query':
        navigate('/query')
        break
      case 'agents':
        navigate('/agents')
        break
      case 'visualization':
        navigate('/visualization')
        break
      default:
        break
    }
  }

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
    },
  ]

  const notificationMenuItems = [
    {
      key: 'header',
      label: (
        <div className="flex-between px-2 py-1">
          <span className="font-medium">通知</span>
          <Button 
            type="link" 
            size="small"
            onClick={() => setNotifications(notifications.map(n => ({ ...n, read: true })))}
          >
            全部标记为已读
          </Button>
        </div>
      ),
      disabled: true,
    },
    ...notifications.map(notification => ({
      key: `notification_${notification.id}`,
      label: (
        <div className={`px-2 py-2 ${!notification.read ? 'bg-blue-50' : ''}`}>
          <div className="font-medium">{notification.title}</div>
          <div className="text-gray-500 text-sm">{notification.description}</div>
          <div className="text-gray-400 text-xs mt-1">
            {notification.read ? '已读' : '未读'}
          </div>
        </div>
      ),
      onClick: () => {
        setNotifications(notifications.map(n => 
          n.id === notification.id ? { ...n, read: true } : n
        ))
        message.info(`打开通知: ${notification.title}`)
      },
    })),
    {
      type: 'divider' as const,
    },
    {
      key: 'view_all',
      label: (
        <div className="text-center py-1">
          <Button type="link" size="small">查看所有通知</Button>
        </div>
      ),
    },
  ]

  const quickActions = [
    { key: 'dashboard', icon: <DashboardOutlined />, label: '仪表板', color: '#1890ff' },
    { key: 'query', icon: <SearchOutlined />, label: '智能查询', color: '#52c41a' },
    { key: 'agents', icon: <ApiOutlined />, label: '智能体矩阵', color: '#faad14' },
    { key: 'visualization', icon: <DashboardOutlined />, label: '可视化', color: '#13c2c2' },
  ]

  return (
    <AntHeader className="flex-between px-4 bg-white shadow-sm border-b border-gray-200">
      {/* 左侧：菜单切换和标题 */}
      <div className="flex items-center gap-4">
        <Button
          type="text"
          icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={toggleSidebar}
          className="text-gray-600"
        />
        
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex-center">
            <span className="text-white font-bold">D</span>
          </div>
          <Title level={4} className="!mb-0 !text-gray-800">
            DataMind OS <span className="text-blue-600">2026</span>
          </Title>
          <Badge 
            count="Beta" 
            style={{ backgroundColor: '#52c41a' }}
            className="ml-2"
          />
        </div>
      </div>

      {/* 中间：搜索和快速操作 */}
      <div className="flex-1 max-w-2xl mx-8">
        <div className="flex gap-4">
          <Search
            placeholder="输入自然语言问题，例如：上个月销售额多少？"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onSearch={handleSearch}
            loading={isLoading}
            enterButton={
              <Button type="primary" icon={<SearchOutlined />}>
                智能分析
              </Button>
            }
            size="large"
            className="flex-1"
          />
          
          <div className="flex gap-2">
            {quickActions.map(action => (
              <Tooltip key={action.key} title={action.label}>
                <Button
                  type="text"
                  icon={action.icon}
                  style={{ color: action.color }}
                  onClick={() => handleQuickAction(action.key)}
                  className="flex-center"
                />
              </Tooltip>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧：用户操作 */}
      <div className="flex items-center gap-4">
        {/* 系统状态 */}
        <div className="hidden md:flex items-center gap-2 text-sm">
          <Badge 
            status={systemStatus.connected ? "success" : "error"} 
            text={systemStatus.connected ? "已连接" : "未连接"}
          />
          <span className="text-gray-500">
            {systemStatus.agentsActive}个智能体运行中
          </span>
        </div>

        {/* 主题切换 */}
        <Tooltip title={`切换${themeMode === 'light' ? '暗色' : '亮色'}主题`}>
          <Switch
            checked={themeMode === 'dark'}
            onChange={toggleTheme}
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<SunOutlined />}
          />
        </Tooltip>

        {/* 帮助 */}
        <Tooltip title="帮助文档">
          <Button
            type="text"
            icon={<QuestionCircleOutlined />}
            onClick={() => window.open('https://docs.datamind.ai', '_blank')}
          />
        </Tooltip>

        {/* 通知 */}
        <Dropdown
          menu={{ items: notificationMenuItems }}
          placement="bottomRight"
          trigger={['click']}
        >
          <Badge count={unreadNotifications} overflowCount={99}>
            <Button
              type="text"
              icon={<BellOutlined />}
              className="text-gray-600"
            />
          </Badge>
        </Dropdown>

        {/* 用户菜单 */}
        <Dropdown
          menu={{ items: userMenuItems }}
          placement="bottomRight"
          trigger={['click']}
        >
          <Space className="cursor-pointer">
            <Avatar 
              src={user?.avatar} 
              icon={!user?.avatar && <UserOutlined />}
              className="border border-gray-300"
            />
            <div className="hidden md:block">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-gray-500">{user?.role}</div>
            </div>
          </Space>
        </Dropdown>
      </div>
    </AntHeader>
  )
}

export default Header