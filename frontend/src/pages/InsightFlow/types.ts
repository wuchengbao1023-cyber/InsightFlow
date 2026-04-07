/**
 * InsightFlow v4.1 类型定义
 */

import type { AGENT_META as _AGENT_META_TYPE } from './constants'

// Agent 颜色（供 ChatBubblePanel / 其他组件使用）
export const AGENT_COLORS: Record<string, string> = {
  '老陈': '#3B82F6',
  '老林': '#10B981',
  '老王': '#8B5CF6',
  '小赵': '#F59E0B',
  '质检官': '#EF4444',
  '小李': '#06B6D4',
  DATA_ENGINEER: '#3B82F6',
  DATA_ANALYST: '#10B981',
  FORECAST_ANALYST: '#8B5CF6',
  STRATEGY_ADVISOR: '#F59E0B',
  QUALITY_REVIEWER: '#EF4444',
  REPORT_EDITOR: '#06B6D4',
}

// Agent 图标
export const AGENT_ICONS: Record<string, string> = {
  '老陈': '🏗️',
  '老林': '📊',
  '老王': '🔮',
  '小赵': '🎯',
  '质检官': '✅',
  '小李': '📝',
  DATA_ENGINEER: '🏗️',
  DATA_ANALYST: '📊',
  FORECAST_ANALYST: '🔮',
  STRATEGY_ADVISOR: '🎯',
  QUALITY_REVIEWER: '✅',
  REPORT_EDITOR: '📝',
}

export interface AgentThinking {
  role: string
  name: string
  color: string
  icon: string
  text: string
  isStreaming: boolean
  startedAt: number
}

export interface ChatMessage {
  id: string
  type: 'user' | 'system' | 'agent_result' | 'review' | 'report' | 'qa' | 'cost'
  content: string
  /** 供气泡面板渲染的 message 字段（部分 SSE 事件用 message 而非 content） */
  message?: string
  agentName?: string
  agentColor?: string
  agentIcon?: string
  timestamp: string
  time?: string          // 气泡内显示的时间（与 timestamp 相同格式）
  agents?: Array<{ role: string; name: string; icon: string; color: string; content: string }>
  /** 质检相关 */
  score?: number
  passed?: boolean
  issues?: any[]
  /** 轮次（用于讨论室对话面板分隔线） */
  round?: number
  /** 来源 agent 名 */
  agent?: string
}

export interface AnalysisRound {
  question: string
  id: string
  selectedRoles: string[]  // 本轮选中的Agent角色列表
  agentThinking: Record<string, AgentThinking>
  messages: ChatMessage[]
  report: any
  status: 'active' | 'complete'
  elapsed: number
}

// ── v5.1: DAG 可视化类型 ──

export interface DAGNode {
  id: string
  type: string
  assigned_to: string
  status: string
  description: string
}

export interface DAGEdge {
  from: string
  to: string
}

export interface DAGData {
  nodes: DAGNode[]
  edges: DAGEdge[]
}
