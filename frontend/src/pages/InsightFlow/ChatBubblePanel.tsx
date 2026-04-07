import React, { useRef, useEffect, useState } from 'react'
import { Card, Space, Tag, Typography, Spin } from 'antd'
import type { ChatMessage } from './types'
import { AGENT_COLORS, AGENT_ICONS } from './types'
import { AGENT_META } from './constants'
import MarkdownText from './utils/markdown'

const { Text } = Typography

// ── 高亮文本中的 @引用 ──
function HighlightMentions({ text }: { text: string }) {
  const parts = text.split(/(@\[[^\]]+\]|@[^\s#,，。【】]+)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const clean = part.replace('@', '').replace(/[\[\]]/g, '')
          const meta = AGENT_META[clean]
          const color = meta?.color || '#3B82F6'
          return (
            <span key={i} style={{
              background: `${color}18`, color, fontWeight: 600,
              borderRadius: 4, padding: '0 4px', fontSize: 'inherit',
            }}>
              @{clean}
            </span>
          )
        }
        return part
      })}
    </>
  )
}

// ── 消息气泡（带@高亮） ──
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const color = AGENT_COLORS[msg.agent || ''] || '#60a5fa'
  const isQA = msg.type === 'qa' || msg.type === 'review'
  const isCost = msg.type === 'cost'
  const isSystem = msg.type === 'system'
  // content 和 message 字段都可能是文本内容（兼容新旧 SSE 事件）
  const text = msg.content || msg.message || ''

  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', margin: '4px 0' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 14px', borderRadius: 20,
          background: '#F1F5F9', fontSize: 11, color: '#64748B',
          border: '1px solid #E2E8F0',
        }}>
          {text}
        </span>
      </div>
    )
  }

  if (isQA) {
    const passed = msg.passed ?? (msg.score != null ? msg.score >= 60 : true)
    return (
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        background: passed ? '#F0FDF4' : '#FFF7F7',
        borderRadius: 10, padding: '8px 12px',
        border: `1px solid ${passed ? '#BBF7D0' : '#FECACA'}`,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: passed ? '#DCFCE7' : '#FEE2E2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
        }}>
          {passed ? '✅' : '⚠️'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Text style={{ color: '#16A34A', fontWeight: 700, fontSize: 12 }}>
              {msg.agent || msg.agentName || '质检官'}
            </Text>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 20,
              background: passed ? '#DCFCE7' : '#FEE2E2',
              color: passed ? '#16A34A' : '#DC2626', fontWeight: 700,
            }}>
              {passed ? 'PASS' : 'FAIL'}
            </span>
            {msg.score != null && (
              <Text style={{ color: passed ? '#16A34A' : '#DC2626', fontSize: 12, fontWeight: 700 }}>
                {Math.round(msg.score)}分
              </Text>
            )}
            {(msg.time || msg.timestamp) && (
              <Text style={{ color: '#94A3B8', fontSize: 10, marginLeft: 'auto' }}>
                {msg.time || msg.timestamp}
              </Text>
            )}
          </div>
          {text && (
            <div style={{ fontSize: 12, lineHeight: 1.7, color: passed ? '#166534' : '#7F1D1D' }}>
              <HighlightMentions text={text} />
            </div>
          )}
          {msg.issues?.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {msg.issues.map((iss: any, j: number) => (
                <div key={j} style={{ fontSize: 11, color: '#DC2626' }}>
                  ❌ {typeof iss === 'string' ? iss : iss.criterion ? `[${iss.criterion}] ${iss.detail}` : JSON.stringify(iss)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: '#EFF6FF', border: `1px solid #BFDBFE`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14,
      }}>
        {AGENT_ICONS[msg.agent || ''] || '⚙️'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Text style={{ color, fontWeight: 700, fontSize: 12 }}>
            {msg.agent || msg.agentName || 'Agent'}
          </Text>
          {(msg.time || msg.timestamp) && (
            <Text style={{ color: '#94A3B8', fontSize: 10 }}>
              {msg.time || msg.timestamp}
            </Text>
          )}
          {msg.score !== undefined && (
            <Tag color={msg.passed ? 'success' : 'warning'} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', borderRadius: 10 }}>
              {msg.score}分
            </Tag>
          )}
        </div>
        {text && (
          <div style={{
            padding: '6px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.6,
            background: '#F8FAFC', border: '1px solid #F1F5F9',
            color: '#334155',
          }}>
            <HighlightMentions text={text} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── 轮次分隔线 ──
function RoundDivider({ round }: { round: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      margin: '10px 0 6px',
    }}>
      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
      <span style={{
        fontSize: 10, color: '#94A3B8', background: '#F8FAFC',
        padding: '2px 10px', borderRadius: 20, border: '1px solid #E2E8F0',
        fontWeight: 600,
      }}>
        第 {round} 轮
      </span>
      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
    </div>
  )
}

/** 右侧对话气泡面板 */
export default function ChatBubblePanel({
  messages,
  isRunning,
}: {
  messages: ChatMessage[]
  isRunning: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [lastRound, setLastRound] = useState(0)

  // 自动滚动到底
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages])

  // 追踪轮次变化
  const currentRound = messages.length > 0
    ? (messages[messages.length - 1] as any).round || lastRound
    : 1

  return (
    <Card
      size="small"
      title={
        <Space>
          <span>💬</span>
          <span style={{ color: '#0F172A', fontWeight: 700, fontSize: 13 }}>讨论室对话</span>
          {isRunning && <Spin size="small" />}
        </Space>
      }
      extra={
        !isRunning && messages.length > 0 ? (
          <span style={{ fontSize: 10, color: '#94A3B8' }}>
            {messages.filter(m => m.type !== 'system').length} 条发言
          </span>
        ) : null
      }
      style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', height: '100%' }}
      styles={{ body: { padding: '12px 14px' } }}
    >
      <div ref={scrollRef} style={{ maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          {messages.map((msg, i) => {
            const msgRound = (msg as any).round || 1
            const showRoundDivider = i === 0 || msgRound !== ((messages[i - 1] as any).round || 1)
            return (
              <React.Fragment key={i}>
                {showRoundDivider && (
                  <RoundDivider round={msgRound} />
                )}
                <MessageBubble msg={msg} />
              </React.Fragment>
            )
          })}
          {isRunning && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', background: '#3B82F6',
                animation: 'pulse 1.2s infinite',
              }} />
              <Text style={{ color: '#64748B', fontSize: 11 }}>分析团队协作中...</Text>
            </div>
          )}
        </Space>
      </div>
    </Card>
  )
}
