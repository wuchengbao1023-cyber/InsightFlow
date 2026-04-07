import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Result, Button, Typography, Space, Card } from 'antd'
import { CloseCircleOutlined, ReloadOutlined, HomeOutlined } from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    })

    // 这里可以上报错误到监控系统
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      // 如果有自定义的fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-gray-50 flex-center p-4">
          <Card className="max-w-2xl w-full shadow-lg">
            <Result
              status="error"
              title="系统遇到了一些问题"
              subTitle="DataMind OS 遇到了一个意外错误"
              icon={<CloseCircleOutlined className="text-red-500 text-6xl" />}
              extra={[
                <Button
                  key="reload"
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={this.handleReload}
                  className="mr-2"
                >
                  重新加载页面
                </Button>,
                <Button
                  key="home"
                  icon={<HomeOutlined />}
                  onClick={this.handleGoHome}
                  className="mr-2"
                >
                  返回首页
                </Button>,
                <Button
                  key="reset"
                  onClick={this.handleReset}
                >
                  尝试恢复
                </Button>,
              ]}
            >
              <div className="text-left mt-8">
                <Title level={5} className="!mb-4">
                  错误详情
                </Title>
                
                <Card size="small" className="mb-4">
                  <Paragraph className="font-mono text-sm break-all">
                    {this.state.error?.toString()}
                  </Paragraph>
                </Card>

                {this.state.errorInfo && (
                  <>
                    <Title level={5} className="!mb-4">
                      组件堆栈
                    </Title>
                    <Card size="small">
                      <Paragraph className="font-mono text-xs break-all whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </Paragraph>
                    </Card>
                  </>
                )}

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <Title level={5} className="!mb-2 !text-blue-800">
                    建议操作
                  </Title>
                  <Space direction="vertical" size="small">
                    <Text className="text-blue-700">
                      1. 点击"重新加载页面"刷新应用
                    </Text>
                    <Text className="text-blue-700">
                      2. 如果问题持续，请检查网络连接
                    </Text>
                    <Text className="text-blue-700">
                      3. 清除浏览器缓存后重试
                    </Text>
                    <Text className="text-blue-700">
                      4. 联系技术支持: support@datamind.ai
                    </Text>
                  </Space>
                </div>

                {/* 调试信息（仅开发环境显示） */}
                {import.meta.env.DEV && (
                  <div className="mt-4 p-3 bg-gray-100 rounded text-xs">
                    <Text type="secondary">
                      当前URL: {window.location.href}
                      <br />
                      用户代理: {navigator.userAgent}
                      <br />
                      时间: {new Date().toLocaleString()}
                    </Text>
                  </div>
                )}
              </div>
            </Result>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary