/**
 * InsightFlow 2026 — 溯源面板 + SQL 追问
 *
 * 统一体验：
 * 1. 推理链溯源卡片（每个分析结论可展开查看SQL+计算逻辑）
 * 2. SQL 追问（用户对任何结论发起追问，Agent实时查库回答）
 * 3. 自进化状态（展示Agent学习进度）
 */

import React, { useState, useCallback } from 'react'
import { Typography, Tag, Input, Collapse, Tooltip, Spin, Space, Empty } from 'antd'
import {
  SearchOutlined, CodeOutlined, CalculatorOutlined,
  DatabaseOutlined, ExperimentOutlined, RocketOutlined,
  CloseCircleOutlined, WarningOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import { API_BASE } from './constants'

const { Text, Paragraph } = Typography

// ══════════════════════════════════════════════════════════
// 类型定义
// ══════════════════════════════════════════════════════════

interface ReasoningStep {
  id: string
  agent: string
  claim: string
  method: string
  sql?: string
  raw_result?: any[]
  computation?: string
  source_columns?: string[]
  confidence?: number
  contradictions?: string[]
}

interface ReasoningChain {
  total_steps: number
  steps: ReasoningStep[]
  validation?: { valid: boolean; contradictions?: any[] }
}

interface EvolutionData {
  new_lessons: number
  total_lessons: number
  agents_evolved: string[]
  stats: Record<string, any>
}

// ══════════════════════════════════════════════════════════
// 推理链溯源面板
// ══════════════════════════════════════════════════════════

export function ReasoningPanel({ chain }: { chain: ReasoningChain | null }) {
  if (!chain || !chain.steps || chain.steps.length === 0) return null

  const hasContradictions = chain.validation?.contradictions?.length > 0

  return (
    <div className="if-fade-in-up" style={{ margin: '16px 0' }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 12,
        border: `1px solid ${hasContradictions ? '#FDE68A' : '#E2E8F0'}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        overflow: 'hidden',
      }}>
        {/* 头部 */}
        <div style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #F1F5F9',
          background: hasContradictions ? '#FFFBEB' : '#F8FAFC',
        }}>
          <Space size={8}>
            <ExperimentOutlined style={{ color: hasContradictions ? '#D97706' : '#6366F1', fontSize: 15 }} />
            <Text style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>推理链溯源</Text>
            <Tag style={{ fontSize: 10, borderRadius: 4 }}>{chain.total_steps}步</Tag>
            {hasContradictions && (
              <Tag color="warning" style={{ fontSize: 10, borderRadius: 4 }}>
                <WarningOutlined /> {chain.validation!.contradictions!.length}处矛盾
              </Tag>
            )}
          </Space>
          <Tooltip title="每个分析结论都可以追溯到SQL查询和计算逻辑">
            <Text style={{ fontSize: 11, color: '#94A3B8' }}>可验证AI ✓</Text>
          </Tooltip>
        </div>

        {/* 步骤列表 */}
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          <Collapse
            ghost
            size="small"
            items={chain.steps.map((step, i) => ({
              key: step.id || String(i),
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <ConfidenceDot confidence={step.confidence || 0.5} />
                  <AgentBadge agent={step.agent} />
                  <Text style={{ color: '#334155', flex: 1 }} ellipsis>
                    {step.claim?.replace(/^数据查询:\s*/, '') || '分析步骤'}
                  </Text>
                  {step.method && (
                    <Tag style={{ fontSize: 9, margin: 0, borderRadius: 3 }} color="default">
                      {step.method}
                    </Tag>
                  )}
                </div>
              ),
              children: <StepDetail step={step} />,
            }))}
          />
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// 数据侦探追问组件
// ══════════════════════════════════════════════════════════

export function DataDetectivePanel({ enabled }: { enabled: boolean }) {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DetectiveResult | null>(null)
  const [streaming, setStreaming] = useState('')

  const handleQuery = useCallback(async () => {
    if (!question.trim() || loading) return

    setLoading(true)
    setResult(null)
    setStreaming('')
    const q = question.trim()

    try {
      const resp = await fetch(`${API_BASE}/detective/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })

      if (!resp.ok || !resp.body) throw new Error('请求失败')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullExplanation = ''
      let finalResult: any = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const event = JSON.parse(data)
              switch (event.type) {
                case 'thinking':
                  setStreaming(event.data)
                  break
                case 'sql':
                  setStreaming(prev => prev + `\n\n生成的SQL:\n${event.data}`)
                  break
                case 'result':
                  setStreaming(prev => prev + `\n\n查询返回${event.data?.row_count || 0}行`)
                  break
                case 'explanation_delta':
                  fullExplanation += event.data
                  setStreaming(fullExplanation)
                  break
                case 'done':
                  finalResult = event.data
                  break
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      setResult(finalResult || { success: true, explanation: fullExplanation, question: q })
      setStreaming('')
      setQuestion('')
    } catch (err: any) {
      setResult({ success: false, error: err.message, question: q })
      setStreaming('')
    } finally {
      setLoading(false)
    }
  }, [question, loading])

  return (
    <div className="if-fade-in-up" style={{ margin: '16px 0' }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 12,
        border: '1px solid #E0E7FF',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        overflow: 'hidden',
        opacity: enabled ? 1 : 0.5,
        pointerEvents: enabled ? 'auto' : 'none',
      }}>
        {/* 头部 */}
        <div style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid #EEF2FF',
          background: 'linear-gradient(135deg, #EEF2FF 0%, #FFFFFF 100%)',
        }}>
          <SearchOutlined style={{ color: '#4F46E5', fontSize: 15 }} />
          <Text style={{ fontSize: 13, fontWeight: 600, color: '#1E1B4B' }}>数据侦探</Text>
          <Tag color="purple" style={{ fontSize: 10, borderRadius: 4 }}>NL2SQL</Tag>
          <Text style={{ fontSize: 11, color: '#818CF8', marginLeft: 'auto' }}>
            对分析结果有疑问？直接追问数据
          </Text>
        </div>

        {/* 追问输入 */}
        <div style={{ padding: '12px 16px' }}>
          <Input.Search
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onSearch={handleQuery}
            placeholder="例如：Q3华东区销售额是多少？各区域利润率排名？"
            enterButton={<Space size={4}><DatabaseOutlined /> 查询</Space>}
            loading={loading}
            disabled={!enabled}
            style={{ borderRadius: 8 }}
          />
        </div>

        {/* 流式输出 */}
        {streaming && (
          <div style={{
            padding: '12px 16px', borderTop: '1px solid #F1F5F9',
            fontSize: 13, lineHeight: 1.7, color: '#334155',
          }}>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13 }}>
              {streaming}<span className="if-cursor">▌</span>
            </pre>
          </div>
        )}

        {/* 查询结果 */}
        {result && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #F1F5F9' }}>
            {result.success ? (
              <div>
                {/* SQL展示 */}
                {result.sql && (
                  <div style={{
                    background: '#F8FAFC', borderRadius: 6, padding: '8px 12px',
                    marginBottom: 8, border: '1px solid #E2E8F0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <CodeOutlined style={{ color: '#64748B', fontSize: 12 }} />
                      <Text style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>SQL</Text>
                    </div>
                    <code style={{ fontSize: 11, color: '#334155', wordBreak: 'break-all' }}>
                      {result.sql}
                    </code>
                  </div>
                )}

                {/* 解释 */}
                {result.explanation && (
                  <Paragraph style={{ fontSize: 13, lineHeight: 1.7, color: '#1E293B', marginBottom: 0 }}>
                    {result.explanation}
                  </Paragraph>
                )}

                {/* 数据预览 */}
                {result.result?.rows?.length > 0 && (
                  <div style={{
                    marginTop: 8, maxHeight: 150, overflow: 'auto',
                    background: '#FAFAFA', borderRadius: 6, padding: 8,
                    border: '1px solid #F1F5F9',
                  }}>
                    <DataPreview rows={result.result.rows.slice(0, 10)} columns={result.result.columns} />
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                color: '#DC2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <CloseCircleOutlined /> {result.error || '查询失败'}
              </div>
            )}
          </div>
        )}

        {/* 空状态 */}
        {!result && !streaming && (
          <div style={{ padding: '8px 16px 12px', textAlign: 'center' }}>
            <Text style={{ fontSize: 11, color: '#CBD5E1' }}>
              💡 试试问一些具体的数据问题，比如"哪个区域销售额最高"
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// 自进化状态卡片
// ══════════════════════════════════════════════════════════

export function EvolutionCard({ evolution }: { evolution: EvolutionData | null }) {
  if (!evolution) return null

  return (
    <div className="if-fade-in" style={{ margin: '8px 0' }}>
      <div style={{
        background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
        borderRadius: 8, padding: '8px 14px',
        border: '1px solid #BBF7D0',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <RocketOutlined style={{ color: '#16A34A', fontSize: 14 }} />
        <Text style={{ fontSize: 12, color: '#166534' }}>
          <b>Agent自进化</b>：本次新增 <b>{evolution.new_lessons}</b> 条经验，
          累计 <b>{evolution.total_lessons}</b> 条
        </Text>
        {evolution.agents_evolved?.length > 0 && (
          <div style={{ marginLeft: 'auto' }}>
            {evolution.agents_evolved.map(a => (
              <Tag key={a} color="green" style={{ fontSize: 10, borderRadius: 4, margin: '0 2px' }}>
                {a}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// 内部子组件
// ══════════════════════════════════════════════════════════

interface DetectiveResult {
  success: boolean
  question?: string
  sql?: string
  result?: { rows: any[]; columns: string[]; row_count: number }
  explanation?: string
  error?: string
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color = confidence >= 0.8 ? '#22C55E' : confidence >= 0.5 ? '#F59E0B' : '#EF4444'
  return (
    <Tooltip title={`置信度 ${(confidence * 100).toFixed(0)}%`}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, flexShrink: 0,
        boxShadow: `0 0 4px ${color}40`,
      }} />
    </Tooltip>
  )
}

function AgentBadge({ agent }: { agent: string }) {
  const agentColors: Record<string, string> = {
    '老林': '#10B981',
    '老陈': '#3B82F6',
    '小赵': '#8B5CF6',
    '质检官': '#EF4444',
    '数据侦探': '#4F46E5',
    '小王': '#F59E0B',
  }
  return (
    <Tag
      style={{
        fontSize: 10, borderRadius: 4, margin: 0,
        background: `${agentColors[agent] || '#64748B'}15`,
        color: agentColors[agent] || '#64748B',
        border: `1px solid ${agentColors[agent] || '#64748B'}30`,
      }}
    >
      {agent}
    </Tag>
  )
}

function StepDetail({ step }: { step: ReasoningStep }) {
  return (
    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.8 }}>
      {/* SQL */}
      {step.sql && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <CodeOutlined style={{ color: '#6366F1', fontSize: 11 }} />
            <Text style={{ fontSize: 11, color: '#6366F1', fontWeight: 600 }}>查询SQL</Text>
          </div>
          <pre style={{
            background: '#F8FAFC', borderRadius: 6, padding: '8px 12px',
            border: '1px solid #E2E8F0', fontSize: 11, color: '#1E293B',
            overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0,
          }}>
            {step.sql}
          </pre>
        </div>
      )}

      {/* 计算逻辑 */}
      {step.computation && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <CalculatorOutlined style={{ color: '#059669', fontSize: 11 }} />
            <Text style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>计算逻辑</Text>
          </div>
          <div style={{
            background: '#F0FDF4', borderRadius: 6, padding: '6px 12px',
            border: '1px solid #BBF7D0', fontSize: 11, color: '#166534',
            fontFamily: 'monospace',
          }}>
            {step.computation}
          </div>
        </div>
      )}

      {/* 数据源列 */}
      {step.source_columns?.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 11, color: '#64748B' }}>
            数据源列：
            {step.source_columns.map(c => (
              <Tag key={c} style={{ fontSize: 10, margin: '0 2px', borderRadius: 3 }}>{c}</Tag>
            ))}
          </Text>
        </div>
      )}

      {/* 原始数据预览 */}
      {step.raw_result?.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <DatabaseOutlined style={{ color: '#64748B', fontSize: 11 }} />
            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>原始数据（前5行）</Text>
          </div>
          <div style={{
            maxHeight: 120, overflow: 'auto',
            background: '#FAFAFA', borderRadius: 6, padding: 8,
            border: '1px solid #F1F5F9',
          }}>
            <DataPreview rows={step.raw_result.slice(0, 5)} columns={Object.keys(step.raw_result[0])} />
          </div>
        </div>
      )}

      {/* 矛盾标记 */}
      {step.contradictions?.length > 0 && (
        <div style={{
          marginTop: 8, padding: '6px 12px',
          background: '#FEF3C7', borderRadius: 6,
          border: '1px solid #FDE68A',
        }}>
          <WarningOutlined style={{ color: '#D97706', marginRight: 4 }} />
          <Text style={{ fontSize: 11, color: '#92400E' }}>
            矛盾: {step.contradictions.join('; ')}
          </Text>
        </div>
      )}
    </div>
  )
}

function DataPreview({ rows, columns }: { rows: any[]; columns: string[] }) {
  if (!rows.length || !columns?.length) return null

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col} style={{
              padding: '3px 8px', textAlign: 'left',
              borderBottom: '1px solid #E2E8F0', color: '#64748B',
              fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap',
            }}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map(col => (
              <td key={col} style={{
                padding: '3px 8px',
                borderBottom: '1px solid #F1F5F9',
                color: '#334155', whiteSpace: 'nowrap',
              }}>
                {typeof row[col] === 'number' ? row[col].toLocaleString() : String(row[col] ?? '-')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
