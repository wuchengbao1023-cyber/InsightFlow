import React from 'react'
import { Spin, Typography } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

interface LoadingScreenProps {
  message?: string
  subMessage?: string
  fullScreen?: boolean
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = '加载中...',
  subMessage = 'DataMind OS 正在为您准备数据',
  fullScreen = true,
}) => {
  const loadingIcon = (
    <LoadingOutlined 
      style={{ fontSize: 48, color: '#1890ff' }} 
      spin 
    />
  )

  const content = (
    <div className="flex-center flex-col gap-6 p-8">
      {/* 加载动画 */}
      <div className="relative">
        <Spin indicator={loadingIcon} size="large" />
        
        {/* 外圈动画 */}
        <div className="absolute inset-0 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
      </div>

      {/* 加载信息 */}
      <div className="text-center">
        <Title level={4} className="!mb-2 !text-gray-800">
          {message}
        </Title>
        <Text type="secondary" className="text-gray-500">
          {subMessage}
        </Text>
      </div>

      {/* 进度指示器 */}
      <div className="w-64">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse"
            style={{ width: '60%' }}
          ></div>
        </div>
        <div className="flex-between text-xs text-gray-500 mt-2">
          <span>正在初始化智能体...</span>
          <span>60%</span>
        </div>
      </div>

      {/* 智能体状态 */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {['首席分析师', '数据侦探', '预测先知'].map((agent, index) => (
          <div 
            key={agent}
            className="flex-center flex-col p-3 bg-gray-50 rounded-lg border border-gray-200"
          >
            <div className="w-8 h-8 bg-blue-100 rounded-full flex-center mb-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
            </div>
            <Text className="text-xs text-gray-600">{agent}</Text>
          </div>
        ))}
      </div>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex-center">
        {content}
      </div>
    )
  }

  return content
}

export default LoadingScreen