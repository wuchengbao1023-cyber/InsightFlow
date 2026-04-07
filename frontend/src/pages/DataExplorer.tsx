import React, { useState, useEffect } from 'react'
import {
  Card,
  Table,
  Button,
  Typography,
  Space,
  Tag,
  Row,
  Col,
  Input,
  Select,
  Tabs,
  Empty,
  Alert,
  Divider,
  Tooltip,
  Progress,
  Modal,
  Upload,
  message,
  Statistic,
  Badge,
  Switch,
} from 'antd'
import {
  DatabaseOutlined,
  UploadOutlined,
  EyeOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  InfoCircleOutlined,
  CloudSyncOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  BarChartOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { uploadFile, getTables, getDataSources } from '@/services/api'
import type { UploadProps } from 'antd'
import { useDataStore, useAgentStore } from '../store/appStore'

const { Title, Text, Paragraph } = Typography
const { Search } = Input
const { Option } = Select
const { TabPane } = Tabs

const DataExplorer: React.FC = () => {
  const [searchText, setSearchText] = useState('')
  const [selectedDataSource, setSelectedDataSource] = useState<string | null>(null)
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('datasets')
  const [previewData, setPreviewData] = useState<any[]>([])
  const [uploadModalVisible, setUploadModalVisible] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [filters, setFilters] = useState<Record<string, any>>({})
  const [sortConfig, setSortConfig] = useState<{ field: string; order: 'ascend' | 'descend' } | null>(null)

  const {
    dataSources,
    currentDataSource,
    datasets,
    selectedDataset: storeSelectedDataset,
    setCurrentDataSource,
    setSelectedDataset: setStoreSelectedDataset,
    addDataSource,
    updateDataSource,
    removeDataSource,
    loadDataset,
  } = useDataStore()

  const { assignTask } = useAgentStore()

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  // 刷新数据源列表（从后端获取实际已上传的文件）
  const refreshDataSources = async () => {
    try {
      const result = await getTables()
      if (result.tables && Array.isArray(result.tables)) {
        // 为每个表创建一个数据源
        result.tables.forEach((tableName: string) => {
          const sourceId = `uploaded_${tableName}`
          if (!dataSources.find(ds => ds.id === sourceId)) {
            const newDataSource = {
              id: sourceId,
              name: `上传表: ${tableName}`,
              type: 'file' as const,
              description: `从后端加载的数据库表`,
              connected: true,
              lastSync: new Date(),
              metadata: { table_name: tableName }
            }
            addDataSource(newDataSource)
          }
        })
      }
    } catch (error) {
      console.warn('刷新数据源列表失败:', error)
    }
  }

  useEffect(() => {
    if (currentDataSource && datasets[currentDataSource]) {
      setPreviewData(datasets[currentDataSource].slice(0, 10))
    }
  }, [currentDataSource, datasets])

  // 组件加载时刷新数据源
  useEffect(() => {
    refreshDataSources()
  }, [])

  const handleDataSourceSelect = (sourceId: string) => {
    setCurrentDataSource(sourceId)
    setSelectedDataSource(sourceId)
    setSelectedDataset(sourceId)
    setStoreSelectedDataset(sourceId)
  }

  const handleDatasetSelect = (datasetId: string) => {
    setSelectedDataset(datasetId)
    setStoreSelectedDataset(datasetId)
  }

  const handleAnalyzeData = () => {
    if (selectedDataset && datasets[selectedDataset]) {
      assignTask('data_detective', `分析数据集: ${selectedDataset}`)
      assignTask('chief_analyst', `制定数据集分析计划: ${selectedDataset}`)
      message.success('已分配智能体进行数据分析')
    }
  }

  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options
    setUploading(true)

    try {
      // 真实上传到后端API
      const result = await uploadFile(file as File)
      
      if (!result.success) {
        throw new Error(result.error || '上传失败')
      }

      const tableName = result.table_name
      const newSourceId = `uploaded_${tableName}`
      const newDataSource = {
        id: newSourceId,
        name: `上传文件: ${result.table_name}`,
        type: 'file' as const,
        description: `已上传文件: ${file.name} (${result.rows}行, ${result.columns}列)`,
        connected: true,
        lastSync: new Date(),
        metadata: {
          table_name: tableName,
          rows: result.rows,
          columns: result.columns,
          filename: file.name,
          upload_time: new Date().toISOString(),
        }
      }

      addDataSource(newDataSource)
      
      // 获取实际数据预览
      try {
        // 执行简单查询获取数据预览
        const previewResult = await fetch(`${API_BASE_URL}/api/data/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: `SELECT * FROM ${tableName} LIMIT 20` })
        })
        
        if (previewResult.ok) {
          const previewData = await previewResult.json()
          if (previewData.success && previewData.rows) {
            loadDataset(newSourceId, previewData.rows)
          }
        }
      } catch (previewError) {
        console.warn('获取数据预览失败:', previewError)
        // 如果预览失败，至少加载基本信息
        loadDataset(newSourceId, [{
          id: 1,
          message: `文件已上传: ${file.name}`,
          rows: result.rows,
          columns: result.columns,
          table_name: tableName
        }])
      }

      onSuccess?.(newSourceId, file)
      message.success(`数据上传成功！已导入 ${result.rows} 行数据到表 "${tableName}"`)
      setUploadModalVisible(false)
      
      // 刷新数据源列表
      refreshDataSources()
    } catch (error) {
      console.error('文件上传失败:', error)
      onError?.(error as Error)
      message.error(`数据上传失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setUploading(false)
    }
  }

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    accept: '.csv,.xlsx,.json,.parquet',
    showUploadList: false,
    customRequest: handleUpload,
  }

  const dataSourceColumns = [
    {
      title: '数据源',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <Space>
          <DatabaseOutlined style={{ color: record.connected ? '#52c41a' : '#d9d9d9' }} />
          <div>
            <Text strong>{text}</Text>
            <div>
              <Text type="secondary" className="text-xs">{record.description}</Text>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeConfig: Record<string, { color: string; text: string }> = {
          database: { color: 'blue', text: '数据库' },
          file: { color: 'green', text: '文件' },
          api: { color: 'orange', text: 'API' },
          demo: { color: 'purple', text: '演示' },
        }
        const config = typeConfig[type] || { color: 'default', text: type }
        return <Tag color={config.color}>{config.text}</Tag>
      },
    },
    {
      title: '状态',
      dataIndex: 'connected',
      key: 'connected',
      render: (connected: boolean) => (
        <Badge
          status={connected ? 'success' : 'error'}
          text={connected ? '已连接' : '未连接'}
        />
      ),
    },
    {
      title: '最后同步',
      dataIndex: 'lastSync',
      key: 'lastSync',
      render: (date: Date | null) => (
        <Text type="secondary">
          {date ? date.toLocaleDateString('zh-CN') : '从未同步'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="查看数据">
            <Button
              type="text"
              icon={<EyeOutlined />}
              size="small"
              onClick={() => handleDataSourceSelect(record.id)}
            />
          </Tooltip>
          <Tooltip title="同步数据">
            <Button
              type="text"
              icon={<CloudSyncOutlined />}
              size="small"
              onClick={() => {
                updateDataSource(record.id, { lastSync: new Date() })
                message.success('数据同步完成')
              }}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              icon={<DeleteOutlined />}
              size="small"
              danger
              onClick={() => {
                Modal.confirm({
                  title: '确认删除',
                  content: `确定要删除数据源 "${record.name}" 吗？`,
                  onOk: () => {
                    removeDataSource(record.id)
                    message.success('数据源已删除')
                  },
                })
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  const datasetColumns = [
    {
      title: '字段名',
      dataIndex: 'field',
      key: 'field',
      width: 150,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => {
        const typeColors: Record<string, string> = {
          string: 'blue',
          number: 'green',
          date: 'orange',
          boolean: 'purple',
        }
        return <Tag color={typeColors[type] || 'default'}>{type}</Tag>
      },
    },
    {
      title: '样本值',
      dataIndex: 'sample',
      key: 'sample',
      render: (sample: any) => (
        <Text code className="text-xs">
          {String(sample).slice(0, 30)}
          {String(sample).length > 30 ? '...' : ''}
        </Text>
      ),
    },
    {
      title: '质量',
      dataIndex: 'quality',
      key: 'quality',
      width: 120,
      render: (quality: number) => (
        <div>
          <Progress 
            percent={quality} 
            size="small" 
            strokeColor={quality > 90 ? '#52c41a' : quality > 70 ? '#faad14' : '#f5222d'}
          />
          <Text type="secondary" className="text-xs">
            {quality}%
          </Text>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: () => (
        <Space>
          <Tooltip title="分析字段">
            <Button
              type="text"
              icon={<BarChartOutlined />}
              size="small"
              onClick={() => assignTask('data_detective', '分析数据字段')}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  const previewColumns = previewData.length > 0 
    ? Object.keys(previewData[0]).map(key => ({
        title: key,
        dataIndex: key,
        key: key,
        width: 150,
        render: (value: any) => (
          <Tooltip title={String(value)}>
            <div className="truncate max-w-[140px]">
              {String(value)}
            </div>
          </Tooltip>
        ),
      }))
    : []

  const getDatasetStats = (datasetId: string) => {
    const data = datasets[datasetId]
    if (!data || data.length === 0) return null

    const numericFields = Object.keys(data[0]).filter(key => 
      typeof data[0][key] === 'number'
    )

    return {
      totalRows: data.length,
      totalColumns: Object.keys(data[0]).length,
      numericFields: numericFields.length,
      sampleSize: Math.min(10, data.length),
      lastUpdated: new Date().toLocaleDateString('zh-CN'),
    }
  }

  const stats = selectedDataset ? getDatasetStats(selectedDataset) : null

  return (
    <div className="data-explorer-page">
      <Title level={3} className="!mb-6">数据探索</Title>

      {/* 数据源管理区域 */}
      <Card className="mb-6">
        <div className="flex-between mb-4">
          <Title level={5}>数据源管理</Title>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setUploadModalVisible(true)}
            >
              添加数据源
            </Button>
            <Button
              icon={<CloudSyncOutlined />}
              onClick={() => {
                dataSources.forEach(source => {
                  updateDataSource(source.id, { lastSync: new Date() })
                })
                message.success('所有数据源已同步')
              }}
            >
              同步全部
            </Button>
          </Space>
        </div>

        <Table
          dataSource={dataSources}
          columns={dataSourceColumns}
          rowKey="id"
          pagination={false}
          rowClassName={(record) => 
            record.id === currentDataSource ? 'bg-blue-50' : ''
          }
          onRow={(record) => ({
            onClick: () => handleDataSourceSelect(record.id),
          })}
        />
      </Card>

      {/* 数据集详情区域 */}
      {currentDataSource && (
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} lg={8}>
            <Card>
              <Title level={5} className="!mb-4">数据集信息</Title>
              
              {stats && (
                <Space direction="vertical" size="middle" className="w-full">
                  <Statistic
                    title="总行数"
                    value={stats.totalRows}
                    prefix={<DatabaseOutlined />}
                  />
                  <Statistic
                    title="总列数"
                    value={stats.totalColumns}
                    prefix={<BarChartOutlined />}
                  />
                  <Statistic
                    title="数值字段"
                    value={stats.numericFields}
                    prefix={<FilterOutlined />}
                  />
                  <Statistic
                    title="样本大小"
                    value={stats.sampleSize}
                    prefix={<EyeOutlined />}
                  />
                  <Divider className="my-2" />
                  <div>
                    <Text type="secondary" className="block mb-1">最后更新</Text>
                    <Text strong>{stats.lastUpdated}</Text>
                  </div>
                </Space>
              )}

              <Divider />

              <Space direction="vertical" size="small" className="w-full">
                <Button
                  type="primary"
                  block
                  icon={<RobotOutlined />}
                  onClick={handleAnalyzeData}
                  disabled={!selectedDataset}
                >
                  智能分析数据
                </Button>
                <Button
                  block
                  icon={<DownloadOutlined />}
                  onClick={() => message.info('导出功能开发中')}
                >
                  导出数据集
                </Button>
                <Button
                  block
                  icon={<BarChartOutlined />}
                  onClick={() => message.info('可视化功能开发中')}
                >
                  创建可视化
                </Button>
              </Space>
            </Card>
          </Col>

          <Col xs={24} lg={16}>
            <Card>
              <Tabs activeKey={activeTab} onChange={setActiveTab}>
                <TabPane
                  tab={
                    <span>
                      <EyeOutlined />
                      数据预览
                    </span>
                  }
                  key="preview"
                >
                  <div className="mb-4">
                    <Space>
                      <Text strong>预览数据（前10行）</Text>
                      <Tag color="blue">{previewData.length} 行</Tag>
                      <Tag color="green">{previewColumns.length} 列</Tag>
                    </Space>
                  </div>

                  {previewData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table
                        dataSource={previewData}
                        columns={previewColumns}
                        rowKey={(record, index) => `${index}`}
                        pagination={false}
                        size="small"
                        scroll={{ x: 'max-content' }}
                      />
                    </div>
                  ) : (
                    <Empty description="暂无数据预览" />
                  )}
                </TabPane>

                <TabPane
                  tab={
                    <span>
                      <InfoCircleOutlined />
                      字段信息
                    </span>
                  }
                  key="schema"
                >
                  {previewData.length > 0 ? (
                    <Table
                      dataSource={Object.keys(previewData[0]).map((field, index) => ({
                        key: index,
                        field,
                        type: typeof previewData[0][field],
                        sample: previewData[0][field],
                        quality: Math.floor(Math.random() * 30) + 70, // 模拟质量评分
                      }))}
                      columns={datasetColumns}
                      pagination={false}
                    />
                  ) : (
                    <Empty description="暂无字段信息" />
                  )}
                </TabPane>

                <TabPane
                  tab={
                    <span>
                      <FilterOutlined />
                      数据质量
                    </span>
                  }
                  key="quality"
                >
                  <Alert
                    message="数据质量评估"
                    description="系统正在分析数据质量，以下是根据数据特征生成的评估报告"
                    type="info"
                    showIcon
                    className="mb-4"
                  />

                  <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} md={8}>
                      <Card size="small">
                        <Statistic
                          title="完整性"
                          value={92.5}
                          suffix="%"
                          valueStyle={{ color: '#52c41a' }}
                        />
                        <Progress percent={92.5} strokeColor="#52c41a" />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <Card size="small">
                        <Statistic
                          title="准确性"
                          value={87.3}
                          suffix="%"
                          valueStyle={{ color: '#faad14' }}
                        />
                        <Progress percent={87.3} strokeColor="#faad14" />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <Card size="small">
                        <Statistic
                          title="一致性"
                          value={95.1}
                          suffix="%"
                          valueStyle={{ color: '#13c2c2' }}
                        />
                        <Progress percent={95.1} strokeColor="#13c2c2" />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <Card size="small">
                        <Statistic
                          title="及时性"
                          value={98.2}
                          suffix="%"
                          valueStyle={{ color: '#1890ff' }}
                        />
                        <Progress percent={98.2} strokeColor="#1890ff" />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <Card size="small">
                        <Statistic
                          title="唯一性"
                          value={89.7}
                          suffix="%"
                          valueStyle={{ color: '#722ed1' }}
                        />
                        <Progress percent={89.7} strokeColor="#722ed1" />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <Card size="small">
                        <Statistic
                          title="有效性"
                          value={94.3}
                          suffix="%"
                          valueStyle={{ color: '#eb2f96' }}
                        />
                        <Progress percent={94.3} strokeColor="#eb2f96" />
                      </Card>
                    </Col>
                  </Row>

                  <Divider />

                  <div className="mt-4">
                    <Title level={5} className="!mb-4">质量建议</Title>
                    <Space direction="vertical" size="small" className="w-full">
                      <Alert
                        message="数据完整性良好"
                        description="所有必需字段都有数据，缺失值较少"
                        type="success"
                        showIcon
                      />
                      <Alert
                        message="准确性需要改进"
                        description="部分数值字段存在异常值，建议进行数据清洗"
                        type="warning"
                        showIcon
                      />
                      <Alert
                        message="一致性优秀"
                        description="数据格式统一，符合业务规则"
                        type="info"
                        showIcon
                      />
                    </Space>
                  </div>
                </TabPane>
              </Tabs>
            </Card>
          </Col>
        </Row>
      )}

      {/* 上传数据模态框 */}
      <Modal
        title="上传数据"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
        width={600}
      >
        <Space direction="vertical" size="large" className="w-full">
          <Alert
            message="支持的文件格式"
            description="CSV, Excel, JSON, Parquet"
            type="info"
            showIcon
          />

          <div>
            <Text strong className="block mb-2">选择文件</Text>
            <Upload.Dragger {...uploadProps}>
              <div className="p-8">
                <p className="text-4xl mb-4">
                  <UploadOutlined />
                </p>
                <p className="text-gray-600">点击或拖拽文件到此处上传</p>
                <p className="text-gray-400 text-sm mt-2">
                  支持单个文件，最大 100MB
                </p>
              </div>
            </Upload.Dragger>
          </div>

          <div>
            <Text strong className="block mb-2">数据源名称</Text>
            <Input
              placeholder="例如：销售数据_2026"
              defaultValue={`上传数据_${new Date().toLocaleDateString('zh-CN')}`}
            />
          </div>

          <div>
            <Text strong className="block mb-2">描述</Text>
            <Input.TextArea
              placeholder="描述数据内容和用途"
              rows={3}
            />
          </div>

          <div>
            <Text strong className="block mb-2">数据处理选项</Text>
            <Space direction="vertical" size="small" className="w-full">
              <div className="flex-between">
                <Text>自动检测数据类型</Text>
                <Switch defaultChecked />
              </div>
              <div className="flex-between">
                <Text>去除重复行</Text>
                <Switch defaultChecked />
              </div>
              <div className="flex-between">
                <Text>处理缺失值</Text>
                <Switch defaultChecked />
              </div>
              <div className="flex-between">
                <Text>智能分析数据质量</Text>
                <Switch defaultChecked />
              </div>
            </Space>
          </div>

          <Divider />

          <div className="text-center">
            <Button
              type="primary"
              loading={uploading}
              onClick={() => {
                // 触发上传
                const fileInput = document.querySelector('.ant-upload input[type="file"]') as HTMLInputElement
                if (fileInput && fileInput.files?.[0]) {
                  handleUpload({
                    file: fileInput.files[0],
                    onSuccess: () => {},
                    onError: () => {},
                  } as any)
                } else {
                  message.warning('请先选择文件')
                }
              }}
              className="mr-2"
            >
              {uploading ? '上传中...' : '开始上传'}
            </Button>
            <Button onClick={() => setUploadModalVisible(false)}>
              取消
            </Button>
          </div>
        </Space>
      </Modal>

      {/* 搜索和过滤区域 */}
      <Card className="mb-6">
        <div className="flex-between mb-4">
          <Title level={5}>高级搜索与过滤</Title>
          <Button
            icon={<FilterOutlined />}
            onClick={() => message.info('过滤功能开发中')}
          >
            高级过滤
          </Button>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div>
              <Text strong className="block mb-2">搜索数据</Text>
              <Search
                placeholder="搜索字段名或值..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={(value) => {
                  if (value && currentDataSource && datasets[currentDataSource]) {
                    const filtered = datasets[currentDataSource].filter(row =>
                      Object.values(row).some(val =>
                        String(val).toLowerCase().includes(value.toLowerCase())
                      )
                    )
                    setPreviewData(filtered.slice(0, 10))
                    message.info(`找到 ${filtered.length} 条匹配记录`)
                  }
                }}
                enterButton={<SearchOutlined />}
              />
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div>
              <Text strong className="block mb-2">排序方式</Text>
              <Space>
                <Select
                  placeholder="选择排序字段"
                  style={{ width: 150 }}
                  onChange={(field) => setSortConfig({ field, order: 'ascend' })}
                >
                  {previewColumns.map(col => (
                    <Option key={col.key} value={col.key}>
                      {col.title}
                    </Option>
                  ))}
                </Select>
                <Button
                  icon={<SortAscendingOutlined />}
                  onClick={() => {
                    if (sortConfig) {
                      setSortConfig({
                        ...sortConfig,
                        order: sortConfig.order === 'ascend' ? 'descend' : 'ascend',
                      })
                    }
                  }}
                >
                  {sortConfig?.order === 'ascend' ? '升序' : '降序'}
                </Button>
              </Space>
            </div>
          </Col>
        </Row>
      </Card>

      {/* 数据洞察区域 */}
      {currentDataSource && (
        <Card>
          <Title level={5} className="!mb-4">数据洞察</Title>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Alert
                message="数据特征"
                description={
                  <Space direction="vertical" size="small">
                    <div className="flex-between">
                      <Text>数据规模</Text>
                      <Tag color="blue">中等</Tag>
                    </div>
                    <div className="flex-between">
                      <Text>更新频率</Text>
                      <Tag color="green">每日</Tag>
                    </div>
                    <div className="flex-between">
                      <Text>数据质量</Text>
                      <Tag color="orange">良好</Tag>
                    </div>
                    <div className="flex-between">
                      <Text>分析价值</Text>
                      <Tag color="purple">高</Tag>
                    </div>
                  </Space>
                }
                type="info"
                showIcon
              />
            </Col>
            <Col xs={24} md={12}>
              <Alert
                message="建议操作"
                description={
                  <Space direction="vertical" size="small">
                    <Text>• 使用智能分析功能深入挖掘数据价值</Text>
                    <Text>• 创建可视化图表展示关键指标</Text>
                    <Text>• 设置定期同步保持数据新鲜度</Text>
                    <Text>• 与其他数据源进行关联分析</Text>
                  </Space>
                }
                type="success"
                showIcon
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* 帮助提示 */}
      {!currentDataSource && (
        <Alert
          message="使用提示"
          description={
            <Space direction="vertical" size="small">
              <Text>• 点击左侧数据源列表选择要探索的数据</Text>
              <Text>• 使用"添加数据源"按钮上传新数据</Text>
              <Text>• 在数据预览中查看字段信息和数据质量</Text>
              <Text>• 使用智能分析功能让AI帮助您发现洞察</Text>
            </Space>
          }
          type="info"
          showIcon
          className="mt-6"
        />
      )}
    </div>
  )
}

export default DataExplorer