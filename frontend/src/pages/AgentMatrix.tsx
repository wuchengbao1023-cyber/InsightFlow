import React, { useState, useEffect } from 'react'
import {
  Card,
  Row,
  Col,
  Typography,
  Button,
  Space,
  Tag,
  Statistic,
  Progress,
  Timeline,
  List,
  Avatar,
  Modal,
  Input,
  Select,
  Alert,
  Divider,
  Tooltip,
  Badge,
  Switch,
  Tabs,
  Empty,
  message,
} from 'antd'
import {
  RobotOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
  CodeOutlined,
  FileTextOutlined,
  AuditOutlined,
  SafetyOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  HistoryOutlined,
  SettingOutlined,
  ApiOutlined,
  DashboardOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SyncOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import { useAgentStore } from '../store/appStore'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Option } = Select
const { TabPane } = Tabs

const AgentMatrix: React.FC = () => {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [taskModalVisible, setTaskModalVisible] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [activeTab, setActiveTab] = useState('overview')
  const [autoAssign, setAutoAssign] = useState(true)

  const {
    agents,
    agentTasks,
    setSelectedAgent: setStoreSelectedAgent,
    updateAgentStatus,
    assignTask,
    completeTask,
  } = useAgentStore()

  useEffect(() => {
    if (selectedAgent) {
      setStoreSelectedAgent(selectedAgent)
    }
  }, [selectedAgent, setStoreSelectedAgent])

  const agentDetails = {
    chief_analyst: {
      name: '首席分析师',
      description: '意图识别、NL2SQL、任务拆解与 Agent 编排调度',
      capabilities: ['自然语言理解', 'NL2SQL', '任务编排', 'DAG分解'],
      color: '#1890ff',
      icon: <TeamOutlined />,
      emoji: '🧠',
      role: '大脑 · 总指挥',
    },
    data_detective: {
      name: '数据侦探',
      description: '多方法融合异常检测（Z-Score + IQR + 滑动窗口 + 马氏距离）+ 因果推断',
      capabilities: ['Z-Score检测', 'IQR检测', '马氏距离', '因果推断'],
      color: '#52c41a',
      icon: <LineChartOutlined />,
      emoji: '🔍',
      role: '分析 · 异常猎手',
    },
    prediction_prophet: {
      name: '预测先知',
      description: '时序预测、趋势分析、置信区间估计，支持多步预测',
      capabilities: ['时间序列预测', '趋势分析', '置信区间', '多步预测'],
      color: '#faad14',
      icon: <ThunderboltOutlined />,
      emoji: '🔮',
      role: '预测 · 趋势洞见',
    },
    optimization_advisor: {
      name: '优化顾问',
      description: 'A/B 实验分析（t检验 + Cohen\'s d）+ Pareto 多目标优化 + ROI 评估',
      capabilities: ['A/B实验分析', 'Pareto优化', 'ROI/NPV/IRR', 'Tornado敏感性'],
      color: '#13c2c2',
      icon: <CodeOutlined />,
      emoji: '⚙️',
      role: '决策 · 优化引擎',
    },
    narrative_writer: {
      name: '叙事作家',
      description: '汇总所有 Agent 输出，生成结构清晰的中文分析报告',
      capabilities: ['报告生成', '多Agent整合', '洞察提炼', '可视化摘要'],
      color: '#722ed1',
      icon: <FileTextOutlined />,
      emoji: '📝',
      role: '输出 · 报告生成',
    },
  }

  const handleAssignTask = () => {
    if (selectedAgent && newTask.trim()) {
      assignTask(selectedAgent, newTask)
      setNewTask('')
      setTaskModalVisible(false)
    }
  }

  const handleAgentAction = (agentId: string, action: 'start' | 'pause' | 'reset') => {
    switch (action) {
      case 'start':
        updateAgentStatus(agentId, 'processing', '手动启动任务')
        break
      case 'pause':
        updateAgentStatus(agentId, 'idle', null)
        break
      case 'reset':
        updateAgentStatus(agentId, 'idle', null)
        // 清除任务
        break
    }
  }

  const getAgentTasks = (agentId: string) => {
    return agentTasks[agentId] || []
  }

  const getActiveTasks = () => {
    return agents.filter(agent => agent.status === 'processing').length
  }

  const getTotalTasks = () => {
    return Object.values(agentTasks).reduce((total, tasks) => total + tasks.length, 0)
  }

  const getSuccessRate = () => {
    const allTasks = Object.values(agentTasks).flat()
    if (allTasks.length === 0) return 100
    
    const completedTasks = allTasks.filter(task => task.status === 'completed')
    return (completedTasks.length / allTasks.length) * 100
  }

  const renderAgentCard = (agent: typeof agents[0]) => {
    const details = agentDetails[agent.id as keyof typeof agentDetails]
    if (!details) return null  // 跳过已移除的 Agent
    const tasks = getAgentTasks(agent.id)
    const activeTask = tasks.find(task => task.status === 'processing')

    return (
      <Card
        key={agent.id}
        hoverable
        className={`border-2 ${selectedAgent === agent.id ? 'border-blue-500' : 'border-gray-200'}`}
        onClick={() => setSelectedAgent(agent.id)}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 28 }}>{details.emoji}</span>
            <div>
              <Title level={5} className="!mb-0">{details.name}</Title>
              <Text type="secondary" className="text-xs">{details.role}</Text>
            </div>
          </div>
          <Tag color={agent.status === 'processing' ? 'processing' : 'default'}>
            {agent.status === 'processing' ? '运行中' : '待机'}
          </Tag>
        </div>

        <Text type="secondary" className="text-xs block mb-3" style={{ minHeight: 36 }}>
          {details.description}
        </Text>

        {activeTask && (
          <Alert
            message={<span className="text-xs">当前任务：{activeTask.description}</span>}
            type="info"
            showIcon
            className="mb-3"
          />
        )}

        <div className="mb-3">
          <Space wrap size={4}>
            {details.capabilities.map(cap => (
              <Tag key={cap} color="blue" style={{ fontSize: 11 }}>
                {cap}
              </Tag>
            ))}
          </Space>
        </div>

        <div className="mb-2">
          <div className="flex justify-between mb-1">
            <Text type="secondary" className="text-xs">成功率</Text>
            <Text strong className="text-xs">{(agent.performance.successRate * 100).toFixed(0)}%</Text>
          </div>
          <Progress
            percent={agent.performance.successRate * 100}
            strokeColor={agent.performance.successRate > 0.9 ? '#52c41a' : '#faad14'}
            size="small"
            showInfo={false}
          />
        </div>

        <div className="flex justify-between items-center">
          <Space>
            <Tooltip title={agent.status === 'processing' ? '暂停' : '启动'}>
              <Button
                type="text"
                icon={agent.status === 'processing' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  handleAgentAction(agent.id, agent.status === 'processing' ? 'pause' : 'start')
                }}
              />
            </Tooltip>
            <Tooltip title="分配任务">
              <Button
                type="text"
                icon={<PlusOutlined />}
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedAgent(agent.id)
                  setTaskModalVisible(true)
                }}
              />
            </Tooltip>
          </Space>
          <Text type="secondary" className="text-xs">
            {agent.performance.tasksCompleted} 个任务
          </Text>
        </div>
      </Card>
    )
  }

  const renderAgentDetails = () => {
    if (!selectedAgent) return null

    const agent = agents.find(a => a.id === selectedAgent)
    const details = agentDetails[selectedAgent as keyof typeof agentDetails]
    const tasks = getAgentTasks(selectedAgent)

    if (!agent || !details) return null

    return (
      <Card className="mt-6">
        <div className="flex-between items-start mb-6">
          <Space>
            <Avatar
              size={64}
              style={{ backgroundColor: details.color }}
              icon={details.icon}
            />
            <div>
              <Title level={3} className="!mb-1">{details.name}</Title>
              <Text type="secondary">{details.description}</Text>
            </div>
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setTaskModalVisible(true)}
            >
              分配任务
            </Button>
            <Button
              icon={<SettingOutlined />}
              onClick={() => message.info('配置功能开发中')}
            >
              配置
            </Button>
          </Space>
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane
            tab={
              <span>
                <DashboardOutlined />
                概览
              </span>
            }
            key="overview"
          >
            <Row gutter={[16, 16]} className="mb-6">
              <Col xs={24} sm={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="任务总数"
                    value={agent.performance.tasksCompleted}
                    prefix={<RobotOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="成功率"
                    value={agent.performance.successRate * 100}
                    suffix="%"
                    valueStyle={{ color: '#52c41a' }}
                    prefix={<CheckCircleOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="平均响应时间"
                    value={agent.performance.avgResponseTime}
                    suffix="秒"
                    prefix={<ClockCircleOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="当前状态"
                    value={agent.status === 'processing' ? '运行中' : '空闲'}
                    valueStyle={{ 
                      color: agent.status === 'processing' ? '#52c41a' : '#d9d9d9'
                    }}
                    prefix={agent.status === 'processing' ? <SyncOutlined spin /> : <PauseCircleOutlined />}
                  />
                </Card>
              </Col>
            </Row>

            <div className="mb-6">
              <Title level={5} className="!mb-4">能力详情</Title>
              <Row gutter={[16, 16]}>
                {details.capabilities.map((capability, index) => (
                  <Col xs={24} sm={12} md={8} key={index}>
                    <Card size="small" hoverable>
                      <div className="text-center">
                        <div className="text-2xl mb-2" style={{ color: details.color }}>
                          {['🔍', '📊', '⚡', '🎯', '📝', '🛡️', '🔒'][index % 7]}
                        </div>
                        <Text strong>{capability}</Text>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>

            <div>
              <Title level={5} className="!mb-4">性能趋势</Title>
              <Alert
                message="性能分析"
                description={
                  <Space direction="vertical" size="small">
                    <div className="flex-between">
                      <Text>任务处理效率</Text>
                      <Tag color="green">优秀</Tag>
                    </div>
                    <div className="flex-between">
                      <Text>资源利用率</Text>
                      <Tag color="blue">良好</Tag>
                    </div>
                    <div className="flex-between">
                      <Text>错误率</Text>
                      <Tag color="orange">低</Tag>
                    </div>
                    <div className="flex-between">
                      <Text>协作能力</Text>
                      <Tag color="purple">高</Tag>
                    </div>
                  </Space>
                }
                type="info"
                showIcon
              />
            </div>
          </TabPane>

          <TabPane
            tab={
              <span>
                <HistoryOutlined />
                任务历史
                <Badge count={tasks.length} className="ml-2" />
              </span>
            }
            key="tasks"
          >
            <List
              dataSource={tasks}
              renderItem={(task) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        style={{ 
                          backgroundColor: 
                            task.status === 'completed' ? '#52c41a' :
                            task.status === 'processing' ? '#1890ff' :
                            task.status === 'failed' ? '#f5222d' : '#d9d9d9'
                        }}
                        icon={
                          task.status === 'completed' ? <CheckCircleOutlined /> :
                          task.status === 'processing' ? <SyncOutlined spin /> :
                          task.status === 'failed' ? <WarningOutlined /> : <ClockCircleOutlined />
                        }
                      />
                    }
                    title={
                      <Text ellipsis className="!mb-0">
                        {task.description}
                      </Text>
                    }
                    description={
                      <Space>
                        <Text type="secondary" className="text-xs">
                          {task.createdAt.toLocaleString('zh-CN')}
                        </Text>
                        <Tag color={
                          task.status === 'completed' ? 'success' :
                          task.status === 'processing' ? 'processing' :
                          task.status === 'failed' ? 'error' : 'default'
                        }>
                          {task.status === 'completed' ? '已完成' :
                           task.status === 'processing' ? '处理中' :
                           task.status === 'failed' ? '失败' : '等待中'}
                        </Tag>
                        {task.completedAt && (
                          <Text type="secondary" className="text-xs">
                            完成: {task.completedAt.toLocaleTimeString('zh-CN')}
                          </Text>
                        )}
                      </Space>
                    }
                  />
                  <Space>
                    {task.status === 'processing' && (
                      <Button
                        size="small"
                        onClick={() => completeTask(selectedAgent, task.id, { message: '手动完成' })}
                      >
                        完成
                      </Button>
                    )}
                    {task.status === 'pending' && (
                      <Button
                        size="small"
                        onClick={() => updateAgentStatus(selectedAgent, 'processing', task.description)}
                      >
                        开始
                      </Button>
                    )}
                  </Space>
                </List.Item>
              )}
              locale={{ emptyText: '暂无任务记录' }}
            />
          </TabPane>

          <TabPane
            tab={
              <span>
                <ApiOutlined />
                协作记录
              </span>
            }
            key="collaboration"
          >
            <Timeline>
              <Timeline.Item color="green">
                <Text strong>与数据侦探协作</Text>
                <div>共同完成销售数据异常分析</div>
                <Text type="secondary" className="text-xs">2026-03-23 14:30</Text>
              </Timeline.Item>
              <Timeline.Item color="blue">
                <Text strong>协调预测先知</Text>
                <div>制定下季度销售预测计划</div>
                <Text type="secondary" className="text-xs">2026-03-23 11:15</Text>
              </Timeline.Item>
              <Timeline.Item color="orange">
                <Text strong>请求优化顾问协助</Text>
                <div>优化营销策略推荐算法</div>
                <Text type="secondary" className="text-xs">2026-03-22 16:45</Text>
              </Timeline.Item>
              <Timeline.Item color="purple">
                <Text strong>指导叙事作家</Text>
                <div>生成季度业绩报告框架</div>
                <Text type="secondary" className="text-xs">2026-03-22 09:20</Text>
              </Timeline.Item>
            </Timeline>
          </TabPane>
        </Tabs>
      </Card>
    )
  }

  return (
    <div className="agent-matrix-page">
      <div className="flex-between mb-6">
        <div>
          <Title level={3} className="!mb-2">智能体矩阵</Title>
          <Text type="secondary">
            5个专业化AI代理协同工作，覆盖分析 → 异常检测 → 预测 → 优化 → 报告完整链路
          </Text>
        </div>
        <Space>
          <Switch
            checkedChildren="自动分配"
            unCheckedChildren="手动分配"
            checked={autoAssign}
            onChange={setAutoAssign}
          />
          <Button
            icon={<MessageOutlined />}
            onClick={() => message.info('通信功能开发中')}
          >
            智能体通信
          </Button>
        </Space>
      </div>

      {/* 系统概览 */}
      <Card className="mb-6">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="活跃智能体"
              value={getActiveTasks()}
              suffix={`/5`}
              prefix={<RobotOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="总任务数"
              value={getTotalTasks()}
              prefix={<DashboardOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="成功率"
              value={getSuccessRate()}
              suffix="%"
              precision={1}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="协作效率"
              value={94.2}
              suffix="%"
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Col>
        </Row>
      </Card>

      {/* 智能体网格 */}
      <Title level={4} className="!mb-4">智能体列表</Title>
      <Row gutter={[16, 16]}>
        {agents.map(agent => (
          <Col xs={24} sm={12} md={8} lg={6} key={agent.id}>
            {renderAgentCard(agent)}
          </Col>
        ))}
      </Row>

      {/* 选中智能体详情 */}
      {renderAgentDetails()}

      {/* 系统控制面板 */}
      <Card className="mt-6">
        <Title level={5} className="!mb-4">系统控制</Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Card size="small" hoverable>
              <div className="text-center">
                <div className="text-3xl mb-2 text-blue-500">
                  <SyncOutlined spin />
                </div>
                <Text strong className="block mb-1">启动所有智能体</Text>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    agents.forEach(agent => {
                      if (agent.status === 'idle') {
                        updateAgentStatus(agent.id, 'processing', '系统启动')
                      }
                    })
                    message.success('所有智能体已启动')
                  }}
                >
                  立即执行
                </Button>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card size="small" hoverable>
              <div className="text-center">
                <div className="text-3xl mb-2 text-orange-500">
                  <PauseCircleOutlined />
                </div>
                <Text strong className="block mb-1">暂停所有任务</Text>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    agents.forEach(agent => {
                      updateAgentStatus(agent.id, 'idle', null)
                    })
                    message.success('所有智能体已暂停')
                  }}
                >
                  立即执行
                </Button>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card size="small" hoverable>
              <div className="text-center">
                <div className="text-3xl mb-2 text-green-500">
                  <DashboardOutlined />
                </div>
                <Text strong className="block mb-1">性能监控</Text>
                <Button
                  type="link"
                  size="small"
                  onClick={() => message.info('监控面板开发中')}
                >
                  查看详情
                </Button>
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 分配任务模态框 */}
      <Modal
        title="分配新任务"
        open={taskModalVisible}
        onCancel={() => setTaskModalVisible(false)}
        onOk={handleAssignTask}
        okText="分配任务"
        cancelText="取消"
        width={600}
      >
        <Space direction="vertical" size="large" className="w-full">
          <div>
            <Text strong className="block mb-2">目标智能体</Text>
            {selectedAgent && (
              <Alert
                message={agentDetails[selectedAgent as keyof typeof agentDetails]?.name}
                description={agentDetails[selectedAgent as keyof typeof agentDetails]?.description}
                type="info"
                showIcon
              />
            )}
          </div>

          <div>
            <Text strong className="block mb-2">任务描述</Text>
            <TextArea
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="详细描述任务内容，例如：分析销售数据中的异常值并生成报告"
              rows={4}
              autoSize={{ minRows: 4, maxRows: 8 }}
            />
          </div>

          <div>
            <Text strong className="block mb-2">任务优先级</Text>
            <Select
              value={taskPriority}
              onChange={setTaskPriority}
              className="w-full"
            >
              <Option value="low">
                <Tag color="green">低优先级</Tag>
              </Option>
              <Option value="medium">
                <Tag color="orange">中优先级</Tag>
              </Option>
              <Option value="high">
                <Tag color="red">高优先级</Tag>
              </Option>
            </Select>
          </div>

          <div>
            <Text strong className="block mb-2">任务选项</Text>
            <Space direction="vertical" size="small" className="w-full">
              <div className="flex-between">
                <Text>启用智能体协作</Text>
                <Switch defaultChecked />
              </div>
              <div className="flex-between">
                <Text>生成详细报告</Text>
                <Switch defaultChecked />
              </div>
              <div className="flex-between">
                <Text>发送完成通知</Text>
                <Switch defaultChecked />
              </div>
              <div className="flex-between">
                <Text>失败时重试</Text>
                <Switch defaultChecked />
              </div>
            </Space>
          </div>

          <Divider />

          <Alert
            message="任务分配建议"
            description={
              <Space direction="vertical" size="small">
                <Text>• 任务描述越详细，分析结果越准确</Text>
                <Text>• 高优先级任务会优先处理</Text>
                <Text>• 复杂任务会自动分配给多个智能体协作</Text>
                <Text>• 任务进度可以在任务历史中查看</Text>
              </Space>
            }
            type="info"
            showIcon
          />
        </Space>
      </Modal>

      {/* 5 Agent 执行流程图 */}
      <Card className="mt-6">
        <Title level={5} className="!mb-4">🕸️ Agent 执行链路（LangGraph 状态机）</Title>
        <div
          style={{
            background: 'linear-gradient(135deg, #f0f7ff 0%, #f5f0ff 100%)',
            borderRadius: 12,
            padding: '24px 16px',
          }}
        >
          {/* 流程节点 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 0 }}>
            {[
              { id: 'chief_analyst',      emoji: '🧠', name: '首席分析师', role: '意图识别\nNL2SQL', color: '#1890ff' },
              { id: 'data_detective',     emoji: '🔍', name: '数据侦探',   role: '异常检测\n因果推断', color: '#52c41a' },
              { id: 'prediction_prophet', emoji: '🔮', name: '预测先知',   role: '时序预测\n趋势分析', color: '#faad14', optional: true },
              { id: 'optimization_advisor',emoji: '⚙️',name: '优化顾问',  role: 'A/B实验\nPareto优化', color: '#13c2c2', optional: true },
              { id: 'narrative_writer',   emoji: '📝', name: '叙事作家',   role: '汇总报告\n洞察输出', color: '#722ed1' },
            ].map((node, idx, arr) => (
              <React.Fragment key={node.id}>
                {/* Agent 节点 */}
                <div style={{ textAlign: 'center', minWidth: 90 }}>
                  <div
                    style={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: `${node.color}22`,
                      border: `2px solid ${node.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 6px',
                      fontSize: 24,
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedAgent(node.id)}
                  >
                    {node.emoji}
                  </div>
                  <Text strong style={{ fontSize: 12, display: 'block' }}>{node.name}</Text>
                  <Text type="secondary" style={{ fontSize: 10, whiteSpace: 'pre-line' }}>{node.role}</Text>
                  {node.optional && (
                    <Tag color="orange" style={{ fontSize: 10, marginTop: 4 }}>条件路由</Tag>
                  )}
                </div>

                {/* 箭头 */}
                {idx < arr.length - 1 && (
                  <div style={{ color: '#aaa', fontSize: 20, margin: '0 4px', paddingBottom: 20 }}>→</div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* 说明 */}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              首席分析师解析意图 → 数据侦探分析数据 → <Tag color="orange" style={{fontSize:10}}>条件路由</Tag> 预测/优化（按需激活）→ 叙事作家输出报告
            </Text>
          </div>
        </div>
      </Card>

      {/* 帮助提示 */}
      <Alert
        message="使用提示"
        description={
          <Space direction="vertical" size="small">
            <Text>• 点击智能体卡片查看详细信息和任务历史</Text>
            <Text>• 使用"分配任务"按钮为智能体分配新任务</Text>
            <Text>• 在系统控制面板中可以批量管理智能体状态</Text>
            <Text>• 开启自动分配模式，系统会根据任务类型自动选择最合适的智能体</Text>
          </Space>
        }
        type="info"
        showIcon
        className="mt-6"
      />
    </div>
  )
}

export default AgentMatrix
