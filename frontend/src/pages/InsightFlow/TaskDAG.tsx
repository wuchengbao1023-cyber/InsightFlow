/**
 * TaskDAG.tsx — v5.2 任务流水线可视化
 * 
 * 底部水平流水线布局，自适应节点数量，不遮挡思考气泡。
 * 每个节点是一个紧凑的胶囊卡片，上下分行显示任务类型+Agent名。
 * SVG 连线用贝塞尔曲线 + 数据流动画展示依赖关系。
 */

import React, { useMemo } from 'react'
import { AGENT_COLORS } from './types'

// ── 类型定义 ──

interface DAGNode {
  id: string
  type: string
  assigned_to: string
  status: string
  description: string
}

interface DAGEdge {
  from: string
  to: string
}

interface DAGData {
  nodes: DAGNode[]
  edges: DAGEdge[]
}

interface TaskDAGProps {
  dag: DAGData | null
  visible: boolean
}

// ── 状态样式 ──

const STATUS_STYLE: Record<string, { bg: string; border: string; glow: string; label: string; labelColor: string }> = {
  pending:    { bg: 'rgba(100, 116, 139, 0.2)',  border: '#475569', glow: 'transparent',        label: '等待',   labelColor: '#64748B' },
  ready:      { bg: 'rgba(59, 130, 246, 0.15)',  border: '#3B82F6', glow: 'rgba(59,130,246,0.3)', label: '就绪',   labelColor: '#60A5FA' },
  running:    { bg: 'rgba(245, 158, 11, 0.15)',  border: '#F59E0B', glow: 'rgba(245,158,11,0.4)', label: '执行中', labelColor: '#FBBF24' },
  success:    { bg: 'rgba(16, 185, 129, 0.15)',  border: '#10B981', glow: 'rgba(16,185,129,0.3)', label: '完成',   labelColor: '#34D399' },
  failed:     { bg: 'rgba(239, 68, 68, 0.15)',   border: '#EF4444', glow: 'rgba(239,68,68,0.3)',  label: '失败',   labelColor: '#F87171' },
  correcting: { bg: 'rgba(168, 85, 247, 0.15)',  border: '#A855F7', glow: 'rgba(168,85,247,0.4)', label: '修正中', labelColor: '#C084FC' },
  cancelled:  { bg: 'rgba(100, 116, 139, 0.1)',  border: '#334155', glow: 'transparent',         label: '取消',   labelColor: '#475569' },
}

// ── Agent 信息 ──

const AGENT_INFO: Record<string, { icon: string; name: string }> = {
  'DATA_ENGINEER':     { icon: '🏗️', name: '老陈' },
  'DATA_ANALYST':      { icon: '📊', name: '老林' },
  'FORECAST_ANALYST':  { icon: '🔮', name: '老王' },
  'STRATEGY_ADVISOR':  { icon: '🎯', name: '小赵' },
  'QUALITY_REVIEWER':  { icon: '✅', name: '质检官' },
  'REPORT_EDITOR':     { icon: '📝', name: '小李' },
  'data_engineer':     { icon: '🏗️', name: '老陈' },
  'data_analyst':      { icon: '📊', name: '老林' },
  'forecast_analyst':  { icon: '🔮', name: '老王' },
  'strategy_advisor':  { icon: '🎯', name: '小赵' },
  'quality_reviewer':  { icon: '✅', name: '质检官' },
  'report_editor':     { icon: '📝', name: '小李' },
}

const TYPE_LABELS: Record<string, string> = {
  data_profile: '数据画像', data_query: '数据查询', analyze_data: '数据分析',
  predict_trend: '趋势预测', validate_result: '结果验证', generate_insight: '策略洞察',
  write_report: '报告生成', correct_analysis: '修正分析', custom: '自定义',
}

// ── 常量 ──

const NODE_W = 64         // 节点宽度（缩小）
const NODE_H = 28         // 节点高度（缩小）
const NODE_GAP = 2        // 同层节点间距
const LAYER_GAP = 48      // 层间距（用于SVG连线区域）
const ARROW_W = 18        // 箭头区域宽度（缩小）

// ── 布局算法：拓扑分层 ──

function computeLayers(nodes: DAGNode[], edges: DAGEdge[]): string[][] {
  if (!nodes.length) return []
  
  const inDegree = new Map<string, number>()
  const adjList = new Map<string, string[]>()
  const nodeIds = nodes.map(n => n.id)

  nodeIds.forEach(id => { inDegree.set(id, 0); adjList.set(id, []) })
  edges.forEach(({ from, to }) => {
    if (nodeIds.includes(from) && nodeIds.includes(to)) {
      inDegree.set(to, (inDegree.get(to) || 0) + 1)
      adjList.get(from)?.push(to)
    }
  })

  const layers: string[][] = []
  const assigned = new Set<string>()
  let queue = nodeIds.filter(id => (inDegree.get(id) || 0) === 0)

  while (queue.length > 0) {
    layers.push([...queue])
    queue.forEach(id => assigned.add(id))
    const next: string[] = []
    queue.forEach(id => {
      adjList.get(id)?.forEach(t => {
        if (!assigned.has(t)) {
          inDegree.set(t, (inDegree.get(t) || 0) - 1)
          if (inDegree.get(t) === 0) { next.push(t); assigned.add(t) }
        }
      })
    })
    queue = next
  }

  // 未分配的节点
  nodeIds.forEach(id => {
    if (!assigned.has(id)) {
      if (!layers.length) layers.push([])
      layers[layers.length - 1].push(id)
    }
  })

  return layers
}

// ── 单个节点卡片 ──

function TaskNodeCard({ node }: { node: DAGNode }) {
  // 兼容两种数据格式：扁平 {assigned_to} 和嵌套 {data: {assigned_to}}
  const d = (node as any).data || node
  const st = STATUS_STYLE[node.status] || STATUS_STYLE.pending
  const agent = AGENT_INFO[d.assigned_to] || { icon: '📋', name: d.assigned_to || '?' }
  const typeLabel = TYPE_LABELS[d.type] || d.type || '任务'
  const isCorrected = (d.id || '').includes('_corrected')
  const isRunning = node.status === 'running'
  const agentColor = AGENT_COLORS[d.assigned_to] || '#666'

  return (
    <div style={{
      width: NODE_W,
      height: NODE_H,
      background: st.bg,
      border: `1px solid ${isCorrected ? st.border : agentColor}`,
      borderRadius: 6,
      borderStyle: isCorrected ? 'dashed' : 'solid',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      position: 'relative',
      boxShadow: isRunning ? `0 0 10px ${st.glow}` : 'none',
      transition: 'box-shadow 0.3s, border-color 0.3s',
      flexShrink: 0,
      padding: '0 6px',
    }}>
      {/* running 呼吸发光 */}
      {isRunning && (
        <div style={{
          position: 'absolute', inset: -1, borderRadius: 7,
          border: `1px solid ${st.glow}`,
          animation: 'dag-pulse 2s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      <span style={{ fontSize: 9, lineHeight: 1 }}>{agent.icon}</span>
      <span style={{
        fontSize: 8, fontWeight: 600, color: st.labelColor,
        fontFamily: 'system-ui, sans-serif', lineHeight: 1, whiteSpace: 'nowrap',
      }}>
        {agent.name}
      </span>
      <span style={{
        width: 4, height: 4, borderRadius: '50%',
        background: st.border, flexShrink: 0,
        boxShadow: isRunning ? `0 0 4px ${st.glow}` : 'none',
      }} />
    </div>
  )
}

// ── 层间箭头 ──

function LayerArrow({ sourceSuccess, targetActive }: { sourceSuccess: boolean; targetActive: boolean }) {
  const color = sourceSuccess && targetActive ? '#3B82F6' : '#333'
  const active = sourceSuccess && targetActive

  return (
    <svg width={ARROW_W} height={20} style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <marker id={`dag-arr-${active ? 'on' : 'off'}`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4" fill="none" stroke={color} strokeWidth="1" />
        </marker>
      </defs>
      <line x1={2} y1={10} x2={ARROW_W - 5} y2={10} stroke={color} strokeWidth={active ? 1.5 : 1} opacity={active ? 0.7 : 0.3} markerEnd={`url(#dag-arr-${active ? 'on' : 'off'})`} />
      {/* 数据流动画粒子 */}
      {active && (
        <circle r={1.5} fill="#3B82F6" opacity={0.9}>
          <animateMotion dur="1s" repeatCount="indefinite" path={`M2,10 L${ARROW_W - 5},10`} />
        </circle>
      )}
    </svg>
  )
}

// ── 主组件 ──

export default function TaskDAG({ dag, visible }: TaskDAGProps) {
  console.log('[TaskDAG v5.2] render, dag nodes:', dag?.nodes?.length || 0, 'visible:', visible)
  const { layers, nodeMap } = useMemo(() => {
    if (!dag || !dag.nodes.length) return { layers: [] as string[][], nodeMap: new Map<string, DAGNode>() }
    const nMap = new Map(dag.nodes.map(n => [n.id, n]))
    return { layers: computeLayers(dag.nodes, dag.edges), nodeMap: nMap }
  }, [dag])

  if (!visible || !layers.length) return null

  // 计算每层的平均状态，用于判断层间连线是否 active
  const getLayerStatus = (layerIds: string[]) => {
    let hasSuccess = false
    let hasRunning = false
    let allSuccess = true
    layerIds.forEach(id => {
      const s = nodeMap.get(id)?.status
      if (s === 'success') hasSuccess = true
      else if (s === 'running') hasRunning = true
      if (s !== 'success') allSuccess = false
    })
    return { hasSuccess, hasRunning, allSuccess }
  }

  return (
    <>
      {/* 呼吸动画 keyframes */}
      <style>{`
        @keyframes dag-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.02); }
        }
      `}</style>

      <div style={{
        position: 'absolute',
        bottom: 68,
        left: 0,
        right: 0,
        background: 'rgba(8, 8, 18, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '4px 16px',
        zIndex: 10,
        pointerEvents: 'none',
        overflowX: 'auto',
        overflowY: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}>
        {/* 标题 */}
        <span style={{
          fontSize: 7, color: '#555', fontWeight: 600, letterSpacing: 0.8,
          textTransform: 'uppercase', fontFamily: 'system-ui, sans-serif',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          &#x1F517; Pipeline <span style={{ color: '#F59E0B', fontWeight: 700 }}>v5.2</span>
        </span>

        {/* 流水线 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: NODE_GAP }}>
          {layers.map((layer, layerIdx) => {
            const layerStatus = getLayerStatus(layer)
            return (
              <React.Fragment key={`layer-${layerIdx}`}>
                {/* 层间箭头 */}
                {layerIdx > 0 && (
                  <LayerArrow
                    sourceSuccess={getLayerStatus(layers[layerIdx - 1]).allSuccess}
                    targetActive={layerStatus.hasRunning || layerStatus.hasSuccess}
                  />
                )}
                {/* 同层节点竖排 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {layer.map(nodeId => {
                    const node = nodeMap.get(nodeId)
                    if (!node) return null
                    return <TaskNodeCard key={nodeId} node={node} />
                  })}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </>
  )
}
