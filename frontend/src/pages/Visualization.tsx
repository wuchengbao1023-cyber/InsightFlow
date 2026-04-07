import React, { useState, useEffect, useRef } from 'react'
import {
  Card,
  Row,
  Col,
  Typography,
  Button,
  Space,
  Select,
  Input,
  Tabs,
  Empty,
  Alert,
  Divider,
  Tooltip,
  Modal,
  Slider,
  ColorPicker,
  Switch,
  Badge,
  Dropdown,
  MenuProps,
} from 'antd'
import {
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  AreaChartOutlined,
  RadarChartOutlined,
  DotChartOutlined,
  DashboardOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ShareAltOutlined,
  EyeOutlined,
  SettingOutlined,
  SaveOutlined,
  UndoOutlined,
  RedoOutlined,
  FullscreenOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  DatabaseOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { useVisualizationStore, useDataStore } from '../store/appStore'

const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { TabPane } = Tabs
const { Search } = Input

const Visualization: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedChart, setSelectedChart] = useState<string | null>(null)
  const [chartModalVisible, setChartModalVisible] = useState(false)
  const [chartType, setChartType] = useState('line')
  const [chartTitle, setChartTitle] = useState('')
  const [dataSource, setDataSource] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [chartConfig, setChartConfig] = useState({
    showGrid: true,
    showLegend: true,
    animate: true,
    responsive: true,
  })

  const containerRef = useRef<HTMLDivElement>(null)

  const {
    charts,
    layout,
    selectedChart: storeSelectedChart,
    addChart,
    updateChart,
    removeChart,
    setSelectedChart: setStoreSelectedChart,
    updateLayout,
  } = useVisualizationStore()

  const { dataSources, datasets } = useDataStore()

  useEffect(() => {
    if (selectedChart) {
      setStoreSelectedChart(selectedChart)
    }
  }, [selectedChart, setStoreSelectedChart])

  const chartTypes = [
    { value: 'line', label: '折线图', icon: <LineChartOutlined />, color: '#1890ff' },
    { value: 'bar', label: '柱状图', icon: <BarChartOutlined />, color: '#52c41a' },
    { value: 'pie', label: '饼图', icon: <PieChartOutlined />, color: '#faad14' },
    { value: 'area', label: '面积图', icon: <AreaChartOutlined />, color: '#13c2c2' },
    { value: 'scatter', label: '散点图', icon: <DotChartOutlined />, color: '#722ed1' },
    { value: 'heatmap', label: '热力图', icon: <RadarChartOutlined />, color: '#eb2f96' },
    { value: 'radar', label: '雷达图', icon: <RadarChartOutlined />, color: '#f5222d' },
  ]

  const sampleData = {
    line: [
      { date: '2026-01', sales: 1200, profit: 300 },
      { date: '2026-02', sales: 1800, profit: 450 },
      { date: '2026-03', sales: 1500, profit: 380 },
      { date: '2026-04', sales: 2200, profit: 550 },
      { date: '2026-05', sales: 1900, profit: 480 },
    ],
    bar: [
      { product: '产品A', sales: 1200, target: 1000 },
      { product: '产品B', sales: 800, target: 900 },
      { product: '产品C', sales: 1500, target: 1200 },
      { product: '产品D', sales: 900, target: 800 },
    ],
    pie: [
      { region: '华东', value: 45 },
      { region: '华南', value: 25 },
      { region: '华北', value: 20 },
      { region: '其他', value: 10 },
    ],
  }

  const handleCreateChart = () => {
    if (!chartTitle.trim()) {
      return
    }

    const newChart = {
      title: chartTitle,
      type: chartType as any,
      data: sampleData[chartType as keyof typeof sampleData] || [],
      config: {
        color: chartTypes.find(t => t.value === chartType)?.color || '#1890ff',
        showGrid: chartConfig.showGrid,
        showLegend: chartConfig.showLegend,
        animate: chartConfig.animate,
      },
      position: {
        x: 0,
        y: charts.length * 4,
        width: 6,
        height: 4,
      },
    }

    addChart(newChart)
    setChartModalVisible(false)
    setChartTitle('')
    setChartType('line')
  }

  const handleChartAction = (chartId: string, action: string) => {
    switch (action) {
      case 'edit':
        setEditMode(true)
        setSelectedChart(chartId)
        break
      case 'delete':
        Modal.confirm({
          title: '确认删除',
          content: '确定要删除这个图表吗？',
          onOk: () => {
            removeChart(chartId)
            if (selectedChart === chartId) {
              setSelectedChart(null)
            }
          },
        })
        break
      case 'fullscreen':
        setFullscreen(true)
        setSelectedChart(chartId)
        break
      case 'download':
        message.info('下载功能开发中')
        break
      case 'share':
        message.info('分享功能开发中')
        break
    }
  }

  const renderChartPreview = (chart: typeof charts[0]) => {
    const chartTypeInfo = chartTypes.find(t => t.value === chart.type)

    return (
      <Card
        key={chart.id}
        className={`chart-preview ${selectedChart === chart.id ? 'border-blue-500' : ''}`}
        hoverable
        onClick={() => setSelectedChart(chart.id)}
        style={{
          gridColumn: `span ${chart.position.width}`,
          gridRow: `span ${chart.position.height}`,
        }}
      >
        <div className="flex-between mb-3">
          <Space>
            {chartTypeInfo?.icon}
            <Text strong>{chart.title}</Text>
          </Space>
          <Space>
            <Badge
              count={chart.type.toUpperCase()}
              style={{ backgroundColor: chartTypeInfo?.color }}
            />
            <Dropdown
              menu={{
                items: [
                  { key: 'edit', label: '编辑', icon: <EditOutlined /> },
                  { key: 'fullscreen', label: '全屏', icon: <FullscreenOutlined /> },
                  { key: 'download', label: '下载', icon: <DownloadOutlined /> },
                  { key: 'share', label: '分享', icon: <ShareAltOutlined /> },
                  { type: 'divider' },
                  { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
                ],
                onClick: ({ key }) => handleChartAction(chart.id, key),
              }}
              trigger={['click']}
            >
              <Button type="text" icon={<SettingOutlined />} size="small" />
            </Dropdown>
          </Space>
        </div>

        <div className="chart-placeholder h-48 flex-center">
          <div className="text-center">
            <div className="text-4xl mb-2" style={{ color: chartTypeInfo?.color }}>
              {chartTypeInfo?.icon}
            </div>
            <Text type="secondary">{chartTypeInfo?.label}</Text>
            <div className="mt-2">
              <Tag color="blue">{chart.data.length} 数据点</Tag>
            </div>
          </div>
        </div>

        <Divider className="my-3" />

        <div className="text-xs text-gray-500">
          <Space>
            <Tooltip title="数据源">
              <DatabaseOutlined />
            </Tooltip>
            <Text>演示数据</Text>
            <Tooltip title="最后更新">
              <ClockCircleOutlined />
            </Tooltip>
            <Text>刚刚</Text>
          </Space>
        </div>
      </Card>
    )
  }

  const renderChartDetail = () => {
    if (!selectedChart) return null

    const chart = charts.find(c => c.id === selectedChart)
    if (!chart) return null

    const chartTypeInfo = chartTypes.find(t => t.value === chart.type)

    return (
      <Card className="mt-6">
        <div className="flex-between mb-6">
          <Space>
            <div className="text-3xl" style={{ color: chartTypeInfo?.color }}>
              {chartTypeInfo?.icon}
            </div>
            <div>
              <Title level={3} className="!mb-1">{chart.title}</Title>
              <Text type="secondary">{chartTypeInfo?.label} · 创建于 刚刚</Text>
            </div>
          </Space>
          <Space>
            <Button icon={<SaveOutlined />}>保存</Button>
            <Button icon={<DownloadOutlined />}>导出</Button>
            <Button icon={<ShareAltOutlined />}>分享</Button>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              onClick={() => message.info('智能分析功能开发中')}
            >
              智能分析
            </Button>
          </Space>
        </div>

        <Tabs>
          <TabPane tab="数据" key="data">
            <div className="mb-4">
              <Alert
                message="数据预览"
                description="这是图表使用的数据，可以在下方进行编辑"
                type="info"
                showIcon
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    {Object.keys(chart.data[0] || {}).map(key => (
                      <th key={key} className="border p-2 text-left">
                        <Text strong>{key}</Text>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chart.data.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      {Object.values(row).map((value, i) => (
                        <td key={i} className="border p-2">
                          {String(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabPane>

          <TabPane tab="配置" key="config">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <div>
                  <Text strong className="block mb-2">图表类型</Text>
                  <Select
                    value={chart.type}
                    onChange={(value) => updateChart(chart.id, { type: value })}
                    className="w-full"
                  >
                    {chartTypes.map(type => (
                      <Option key={type.value} value={type.value}>
                        <Space>
                          {type.icon}
                          {type.label}
                        </Space>
                      </Option>
                    ))}
                  </Select>
                </div>
              </Col>
              <Col xs={24} md={12}>
                <div>
                  <Text strong className="block mb-2">图表标题</Text>
                  <Input
                    value={chart.title}
                    onChange={(e) => updateChart(chart.id, { title: e.target.value })}
                  />
                </div>
              </Col>
              <Col xs={24} md={12}>
                <div>
                  <Text strong className="block mb-2">主颜色</Text>
                  <ColorPicker
                    value={chart.config.color}
                    onChange={(color) => updateChart(chart.id, { 
                      config: { ...chart.config, color: color.toHexString() }
                    })}
                  />
                </div>
              </Col>
              <Col xs={24} md={12}>
                <div>
                  <Text strong className="block mb-2">尺寸</Text>
                  <Space>
                    <Input
                      addonBefore="宽"
                      value={chart.position.width}
                      onChange={(e) => updateChart(chart.id, {
                        position: { ...chart.position, width: parseInt(e.target.value) || 1 }
                      })}
                      style={{ width: 100 }}
                    />
                    <Input
                      addonBefore="高"
                      value={chart.position.height}
                      onChange={(e) => updateChart(chart.id, {
                        position: { ...chart.position, height: parseInt(e.target.value) || 1 }
                      })}
                      style={{ width: 100 }}
                    />
                  </Space>
                </div>
              </Col>
            </Row>

            <Divider />

            <div>
              <Text strong className="block mb-4">显示选项</Text>
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={8}>
                  <div className="flex-between">
                    <Text>显示网格</Text>
                    <Switch
                      checked={chart.config.showGrid}
                      onChange={(checked) => updateChart(chart.id, {
                        config: { ...chart.config, showGrid: checked }
                      })}
                    />
                  </div>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <div className="flex-between">
                    <Text>显示图例</Text>
                    <Switch
                      checked={chart.config.showLegend}
                      onChange={(checked) => updateChart(chart.id, {
                        config: { ...chart.config, showLegend: checked }
                      })}
                    />
                  </div>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <div className="flex-between">
                    <Text>动画效果</Text>
                    <Switch
                      checked={chart.config.animate}
                      onChange={(checked) => updateChart(chart.id, {
                        config: { ...chart.config, animate: checked }
                      })}
                    />
                  </div>
                </Col>
              </Row>
            </div>
          </TabPane>

          <TabPane tab="洞察" key="insights">
            <Alert
              message="智能分析结果"
              description="基于图表数据的AI分析洞察"
              type="info"
              showIcon
              className="mb-4"
            />

            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Card>
                  <Title level={5} className="!mb-4">趋势分析</Title>
                  <Space direction="vertical" size="small">
                    <div className="flex-between">
                      <Text>整体趋势</Text>
                      <Tag color="green">上升</Tag>
                    </div>
                    <div className="flex-between">
                      <Text>增长速率</Text>
                      <Text strong>15.2%</Text>
                    </div>
                    <div className="flex-between">
                      <Text>波动性</Text>
                      <Tag color="orange">中等</Tag>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card>
                  <Title level={5} className="!mb-4">异常检测</Title>
                  <Space direction="vertical" size="small">
                    <div className="flex-between">
                      <Text>异常点数量</Text>
                      <Tag color="red">2个</Tag>
                    </div>
                    <div className="flex-between">
                      <Text>置信度</Text>
                      <Text strong>87.5%</Text>
                    </div>
                    <div className="flex-between">
                      <Text>建议操作</Text>
                      <Button type="link" size="small">查看详情</Button>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </TabPane>
        </Tabs>
      </Card>
    )
  }

  const renderDashboard = () => {
    return (
      <div
        ref={containerRef}
        className="dashboard-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridAutoRows: 'minmax(100px, auto)',
          gap: `${layout.spacing}px`,
          backgroundColor: layout.backgroundColor,
          padding: '16px',
          minHeight: '600px',
        }}
      >
        {charts.map(renderChartPreview)}
        
        {charts.length === 0 && (
          <div className="col-span-full flex-center h-96">
            <Empty
              description="暂无图表，点击右上角按钮创建第一个图表"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="visualization-page">
      <div className="flex-between mb-6">
        <div>
          <Title level={3} className="!mb-2">数据可视化</Title>
          <Text type="secondary">
            创建、管理和分享交互式数据图表
          </Text>
        </div>
        <Space>
          <Button
            icon={<UndoOutlined />}
            onClick={() => message.info('撤销功能开发中')}
          >
            撤销
          </Button>
          <Button
            icon={<RedoOutlined />}
            onClick={() => message.info('重做功能开发中')}
          >
            重做
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setChartModalVisible(true)}
          >
            新建图表
          </Button>
        </Space>
      </div>

      {/* 控制工具栏 */}
      <Card className="mb-6">
        <div className="flex-between">
          <Space>
            <Text strong>布局设置：</Text>
            <Input
              addonBefore="列数"
              value={layout.cols}
              onChange={(e) => updateLayout({ cols: parseInt(e.target.value) || 1 })}
              style={{ width: 120 }}
            />
            <Input
              addonBefore="间距"
              value={layout.spacing}
              onChange={(e) => updateLayout({ spacing: parseInt(e.target.value) || 0 })}
              style={{ width: 120 }}
            />
            <ColorPicker
              value={layout.backgroundColor}
              onChange={(color) => updateLayout({ backgroundColor: color.toHexString() })}
            />
          </Space>
          <Space>
            <Tooltip title="编辑模式">
              <Switch
                checkedChildren="编辑"
                unCheckedChildren="查看"
                checked={editMode}
                onChange={setEditMode}
              />
            </Tooltip>
            <Tooltip title="全屏">
              <Button
                icon={<FullscreenOutlined />}
                onClick={() => setFullscreen(!fullscreen)}
              />
            </Tooltip>
            <Button
              icon={<FilterOutlined />}
              onClick={() => message.info('过滤功能开发中')}
            >
              数据过滤
            </Button>
          </Space>
        </div>
      </Card>

      {/* 主要内容区域 */}
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane
          tab={
            <span>
              <DashboardOutlined />
              仪表板
              <Badge count={charts.length} className="ml-2" />
            </span>
          }
          key="dashboard"
        >
          {renderDashboard()}
        </TabPane>

        <TabPane
          tab={
            <span>
              <DatabaseOutlined />
              数据源
            </span>
          }
          key="datasources"
        >
          <Card>
            <Title level={5} className="!mb-4">可用数据源</Title>
            <Row gutter={[16, 16]}>
              {dataSources.map(source => (
                <Col xs={24} sm={12} md={8} key={source.id}>
                  <Card
                    hoverable
                    onClick={() => setDataSource(source.id)}
                    className={dataSource === source.id ? 'border-blue-500' : ''}
                  >
                    <div className="flex-between mb-3">
                      <Space>
                        <DatabaseOutlined style={{ color: source.connected ? '#52c41a' : '#d9d9d9' }} />
                        <Text strong>{source.name}</Text>
                      </Space>
                      <Tag color={source.connected ? 'success' : 'error'}>
                        {source.connected ? '已连接' : '未连接'}
                      </Tag>
                    </div>
                    <Paragraph ellipsis={{ rows: 2 }} className="!mb-3">
                      {source.description}
                    </Paragraph>
                    <div className="flex-between">
                      <Text type="secondary" className="text-xs">
                        {source.lastSync ? `最后同步: ${source.lastSync.toLocaleDateString('zh-CN')}` : '从未同步'}
                      </Text>
                      <Button
                        type="link"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          message.info('数据预览功能开发中')
                        }}
                      >
                        预览
                      </Button>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </TabPane>

        <TabPane
          tab={
            <span>
              <BarChartOutlined />
              图表库
            </span>
          }
          key="gallery"
        >
          <Card>
            <Title level={5} className="!mb-4">图表模板库</Title>
            <Row gutter={[16, 16]}>
              {chartTypes.map(type => (
                <Col xs={24} sm={12} md={8} lg={6} key={type.value}>
                  <Card
                    hoverable
                    className="text-center"
                    onClick={() => {
                      setChartType(type.value)
                      setChartModalVisible(true)
                    }}
                  >
                    <div className="text-4xl mb-3" style={{ color: type.color }}>
                      {type.icon}
                    </div>
                    <Text strong className="block mb-1">{type.label}</Text>
                    <Text type="secondary" className="text-xs">
                      适用于趋势、比较、分布等分析
                    </Text>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </TabPane>
      </Tabs>

      {/* 选中图表详情 */}
      {renderChartDetail()}

      {/* 创建图表模态框 */}
      <Modal
        title="创建新图表"
        open={chartModalVisible}
        onCancel={() => setChartModalVisible(false)}
        onOk={handleCreateChart}
        okText="创建图表"
        cancelText="取消"
        width={800}
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <div>
              <Text strong className="block mb-2">图表类型</Text>
              <div className="grid grid-cols-2 gap-3">
                {chartTypes.map(type => (
                  <div
                    key={type.value}
                    className={`p-4 border rounded-lg cursor-pointer text-center ${
                      chartType === type.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                    onClick={() => setChartType(type.value)}
                  >
                    <div className="text-2xl mb-2" style={{ color: type.color }}>
                      {type.icon}
                    </div>
                    <Text strong>{type.label}</Text>
                  </div>
                ))}
              </div>
            </div>
          </Col>

          <Col xs={24} md={12}>
            <Space direction="vertical" size="large" className="w-full">
              <div>
                <Text strong className="block mb-2">图表标题</Text>
                <Input
                  value={chartTitle}
                  onChange={(e) => setChartTitle(e.target.value)}
                  placeholder="例如：销售额趋势分析"
                />
              </div>

              <div>
                <Text strong className="block mb-2">数据源</Text>
                <Select
                  value={dataSource}
                  onChange={setDataSource}
                  className="w-full"
                  placeholder="选择数据源"
                >
                  {dataSources.map(source => (
                    <Option key={source.id} value={source.id}>
                      <Space>
                        <DatabaseOutlined />
                        {source.name}
                      </Space>
                    </Option>
                  ))}
                </Select>
              </div>

              <div>
                <Text strong className="block mb-2">图表配置</Text>
                <Space direction="vertical" size="small" className="w-full">
                  <div className="flex-between">
                    <Text>显示网格线</Text>
                    <Switch
                      checked={chartConfig.showGrid}
                      onChange={(checked) => setChartConfig({ ...chartConfig, showGrid: checked })}
                    />
                  </div>
                  <div className="flex-between">
                    <Text>显示图例</Text>
                    <Switch
                      checked={chartConfig.showLegend}
                      onChange={(checked) => setChartConfig({ ...chartConfig, showLegend: checked })}
                    />
                  </div>
                  <div className="flex-between">
                    <Text>启用动画</Text>
                    <Switch
                      checked={chartConfig.animate}
                      onChange={(checked) => setChartConfig({ ...chartConfig, animate: checked })}
                    />
                  </div>
                  <div className="flex-between">
                    <Text>响应式设计</Text>
                    <Switch
                      checked={chartConfig.responsive}
                      onChange={(checked) => setChartConfig({ ...chartConfig, responsive: checked })}
                    />
                  </div>
                </Space>
              </div>

              <div>
                <Text strong className="block mb-2">尺寸设置</Text>
                <Row gutter={16}>
                  <Col span={12}>
                    <div>
                      <Text type="secondary" className="text-xs block mb-1">宽度 (列)</Text>
                      <Slider
                        min={1}
                        max={6}
                        value={6}
                        onChange={(value) => {}}
                      />
                    </div>
                  </Col>
                  <Col span={12}>
                    <div>
                      <Text type="secondary" className="text-xs block mb-1">高度 (行)</Text>
                      <Slider
                        min={2}
                        max={8}
                        value={4}
                        onChange={(value) => {}}
                      />
                    </div>
                  </Col>
                </Row>
              </div>
            </Space>
          </Col>
        </Row>

        <Divider />

        <Alert
          message="创建建议"
          description={
            <Space direction="vertical" size="small">
              <Text>• 折线图适合展示时间序列数据的趋势变化</Text>
              <Text>• 柱状图适合比较不同类别的数据</Text>
              <Text>• 饼图适合展示部分与整体的比例关系</Text>
              <Text>• 散点图适合展示两个变量之间的关系</Text>
            </Space>
          }
          type="info"
          showIcon
        />
      </Modal>

      {/* 全屏模式 */}
      {fullscreen && selectedChart && (
        <div className="fixed inset-0 bg-white z-50 p-4">
          <div className="flex-between mb-4">
            <Title level={3}>全屏预览</Title>
            <Space>
              <Button icon={<DownloadOutlined />}>导出</Button>
              <Button
                icon={<FullscreenOutlined />}
                onClick={() => setFullscreen(false)}
              >
                退出全屏
              </Button>
            </Space>
          </div>
          <div className="h-[calc(100vh-100px)] border rounded-lg flex-center">
            <Empty
              description="全屏图表预览开发中"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        </div>
      )}

      {/* 帮助提示 */}
      <Alert
        message="使用提示"
        description={
          <Space direction="vertical" size="small">
            <Text>• 在仪表板中拖拽图表可以调整位置</Text>
            <Text>• 点击图表右上角设置按钮可以进行更多操作</Text>
            <Text>• 在数据源标签页中选择要可视化的数据</Text>
            <Text>• 使用图表库中的模板快速创建常用图表</Text>
          </Space>
        }
        type="info"
        showIcon
        className="mt-6"
      />
    </div>
  )
}

export default Visualization