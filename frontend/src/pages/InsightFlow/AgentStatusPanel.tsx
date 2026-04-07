import React from 'react'
import { Card, Space, Tag, Typography, Spin, Row, Col, Statistic } from 'antd'
import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons'
import type { ChatMessage } from './types'
import { AGENT_COLORS, AGENT_ICONS, AGENT_ROLES } from './types'

const { Text } = Typography

/** 左侧员工状态面板 */
export default function AgentStatusPanel({ agents, messages, isRunning }: {
  agents: string[]; messages: ChatMessage[]; isRunning: boolean
}) {
  const getAgentStatus = (agent: string) => {
    const msgs = messages.filter(m => m.agent === agent)
    if (msgs.some(m => m.type === 'done') && msgs.filter(m => m.type === 'start').length <= msgs.filter(m => m.type === 'done').length) return 'done'
    if (msgs.some(m => m.type === 'start' || m.type === 'thinking')) return 'active'
    return 'waiting'
  }

  const getLastMsg = (agent: string) => {
    const msgs = messages.filter(m => m.agent === agent)
    if (!msgs.length) return ''
    const last = msgs[msgs.length - 1]
    if (last.type === 'done') return last.message || ''
    if (last.type === 'thinking') return last.message
    return last.message
  }

  return (
    <Card size="small" title={<Space><span>👥</span><span style={{ color: '#eef2ff' }}>团队状态</span></Space>}
      style={{ background: '#0f1929', border: '1px solid rgba(37,99,235,0.15)', height: '100%' }}>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        {agents.map(agent => {
          const status = getAgentStatus(agent)
          const color = AGENT_COLORS[agent] || '#60a5fa'
          const lastMsg = getLastMsg(agent)
          return (
            <div key={agent} style={{
              padding: '8px 12px', borderRadius: 8,
              background: status === 'done' ? `${color}10` : status === 'active' ? `${color}08` : 'transparent',
              border: `1px solid ${status === 'done' ? color + '30' : status === 'active' ? color + '20' : 'rgba(255,255,255,0.04)'}`,
              transition: 'all 0.3s'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{AGENT_ICONS[agent]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color, fontWeight: 600, fontSize: 12 }}>{agent}</Text>
                    <Text style={{ color: '#475569', fontSize: 10 }}>{AGENT_ROLES[agent]}</Text>
                  </div>
                  {lastMsg && <Text style={{ color: '#64748b', fontSize: 11, display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastMsg}</Text>}
                </div>
                {status === 'done' && <CheckCircleOutlined style={{ color: '#34d399', fontSize: 14 }} />}
                {status === 'active' && <Spin indicator={<LoadingOutlined style={{ color, fontSize: 12 }} />} />}
                {status === 'waiting' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#334155' }} />}
              </div>
            </div>
          )
        })}
      </Space>
    </Card>
  )
}
