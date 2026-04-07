/**
 * AgentWarRoom — Agent 分析面板
 *
 * 六个Agent并排坐着，同时打字，一目了然。
 * 每个Agent一列卡片，流式展示思考过程。
 *
 * v6 升级（2026-04-02）：
 * - 分析完成后底部展示ECharts交互式图表
 * - 图表数据来自后端 li._build_charts 的 echarts_data 字段
 *
 * 视觉效果：
 * - 待机：灰色空卡片 + 呼吸灯等待
 * - 分析中：顶部进度条动画 + 流式打字 + 光标闪烁
 * - 完成：绿色边框 + ✓ 标记 + 全内容展开
 *
 * 2026-04-01 改版：
 * - 卡片高度自适应（不用maxHeight截断）
 * - 分析中：maxHeight 45vh + 自动滚底
 * - 完成后：全部展开，无高度限制
 * - 响应式：Agent <= 3时两列，>3时三列
 */

import React, { useEffect, useRef, useState } from 'react'
import { Tag } from 'antd'
import { CheckCircleFilled, ClockCircleFilled, DownOutlined, UpOutlined } from '@ant-design/icons'
import MarkdownText from './utils/markdown'
import InsightChart, { type ChartData } from '../../components/analysis/InsightChart'
import type { AgentThinking } from './types'

interface WarRoomProps {
  /** 当前所有正在思考的Agent（包含已完成但还在显示的） */
  agents: Record<string, AgentThinking>
  /** 所有被选中的Agent角色列表（包含还没开始的） */
  selectedRoles: string[]
  /** 是否还在运行中 */
  isRunning: boolean
  /** 分析完成后的图表数据（可选） */
  charts?: ChartData[]
}

/** Agent状态：waiting / active / done / idle */
function getAgentStatus(
  role: string,
  agents: Record<string, AgentThinking>,
  isRunning: boolean
): 'waiting' | 'active' | 'done' | 'idle' {
  const agent = agents[role]
  if (!agent) {
    return isRunning ? 'waiting' : 'idle'
  }
  if (agent.isStreaming) return 'active'
  return 'done'
}

/** 单个Agent工位卡片 */
function AgentWorkstation({
  role,
  agent,
  status,
  index,
  isGlobalRunning,
}: {
  role: string
  agent: AgentThinking | undefined
  status: 'waiting' | 'active' | 'done' | 'idle'
  index: number
  isGlobalRunning: boolean
}) {
  const textRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  // 自动滚动到底部（只对流式生效）
  useEffect(() => {
    if (textRef.current && agent?.isStreaming) {
      textRef.current.scrollTop = textRef.current.scrollHeight
    }
  }, [agent?.text, agent?.isStreaming])

  // 分析完成后自动展开
  useEffect(() => {
    if (status === 'done') {
      setCollapsed(false)
    }
  }, [status])

  // 颜色
  const color = agent?.color || '#94A3B8'
  const name = agent?.name || role
  const icon = agent?.icon || '🤖'

  // 根据状态决定样式
  const borderColor = status === 'active' ? color
    : status === 'done' ? '#10B981'
    : status === 'waiting' ? '#E2E8F0'
    : '#F1F5F9'

  const bgColor = status === 'idle' ? '#F8FAFC'
    : status === 'waiting' ? '#FAFBFD'
    : '#FFFFFF'

  // 内容高度策略：
  // - 分析中：固定 45vh，方便并排比较
  // - 完成后：自适应内容高度，全部展开
  const contentStyle: React.CSSProperties = status === 'active' && !collapsed
    ? { flex: 1, height: '45vh', overflowY: 'auto' }
    : status === 'done' && !collapsed
    ? { flex: 1, overflow: 'visible' }  // 完成后不截断
    : { flex: 1, overflow: 'hidden' }

  // 入场延迟（错开动画）
  const delay = index * 80

  // 文本长度（用于显示字数统计）
  const textLen = agent?.text?.length || 0
  const isLongContent = textLen > 500

  return (
    <div
      className="if-fade-in-up"
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
        flex: '1 1 0',
        minWidth: 0,
        background: bgColor,
        borderRadius: 14,
        border: `2px solid ${borderColor}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        boxShadow: status === 'active'
          ? `0 2px 12px ${color}18, 0 0 0 1px ${color}10`
          : status === 'done'
          ? '0 1px 4px rgba(16,185,129,0.08)'
          : '0 1px 2px rgba(0,0,0,0.03)',
        position: 'relative',
      }}
    >
      {/* 顶部进度条（分析中时显示） */}
      {status === 'active' && (
        <div style={{
          height: 3,
          background: `linear-gradient(90deg, ${color}60, ${color}, ${color}60)`,
          backgroundSize: '200% 100%',
          animation: 'warroom-progress 1.5s linear infinite',
        }} />
      )}

      {/* Agent头部信息 */}
      <div style={{
        padding: '12px 14px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: status === 'active' ? `1px solid ${color}10` : '1px solid #F1F5F9',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: status === 'idle' ? '#94A3B8' : color,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {name}
          </div>
        </div>
        {/* 状态标记 */}
        {status === 'active' && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color,
            animation: 'pulse 1.2s infinite',
            boxShadow: `0 0 6px ${color}60`,
          }} />
        )}
        {status === 'done' && (
          <CheckCircleFilled style={{ fontSize: 14, color: '#10B981' }} />
        )}
        {status === 'waiting' && (
          <ClockCircleFilled style={{ fontSize: 14, color: '#CBD5E1' }} />
        )}
      </div>

      {/* Agent输出内容 */}
      <div
        ref={textRef}
        style={{
          padding: '10px 14px',
          fontSize: 12,
          lineHeight: 1.8,
          color: status === 'idle' ? '#94A3B8' : '#334155',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          transition: 'height 0.3s ease',
          ...contentStyle,
        }}
      >
        {status === 'idle' ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#CBD5E1' }}>
            <span style={{ fontSize: 24 }}>💤</span>
            <div style={{ fontSize: 11, marginTop: 8 }}>待命中</div>
          </div>
        ) : status === 'waiting' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
            <div className="if-shimmer" style={{ height: 12, width: '90%' }} />
            <div className="if-shimmer" style={{ height: 12, width: '70%', animationDelay: '0.2s' }} />
            <div className="if-shimmer" style={{ height: 12, width: '80%', animationDelay: '0.4s' }} />
            <div style={{
              textAlign: 'center', marginTop: 12, fontSize: 11, color: '#94A3B8',
              animation: 'pulse 2s infinite',
            }}>
              等待数据就绪...
            </div>
          </div>
        ) : agent?.text ? (
          <>
            <MarkdownText text={collapsed && isLongContent ? agent.text.slice(0, 300) + '...' : agent.text} />
            {agent.isStreaming && <span className="if-cursor">▎</span>}
          </>
        ) : agent?.isStreaming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="if-shimmer" style={{ height: 12, width: '85%' }} />
            <div className="if-shimmer" style={{ height: 12, width: '65%', animationDelay: '0.15s' }} />
            <div className="if-shimmer" style={{ height: 12, width: '75%', animationDelay: '0.3s' }} />
          </div>
        ) : null}
      </div>

      {/* 底部：字数统计 + 折叠按钮 */}
      {status === 'done' && isLongContent && (
        <div style={{
          padding: '6px 14px',
          borderTop: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: '#94A3B8' }}>
            {textLen} 字
          </span>
          <span
            onClick={() => setCollapsed(c => !c)}
            style={{
              fontSize: 10, color: '#64748B', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
              userSelect: 'none',
            }}
          >
            {collapsed ? '展开' : '收起'}
            {collapsed ? <DownOutlined style={{ fontSize: 9 }} /> : <UpOutlined style={{ fontSize: 9 }} />}
          </span>
        </div>
      )}
    </div>
  )
}

/** 战争指挥室主组件 */
export default function AgentWarRoom({ agents, selectedRoles, isRunning, charts }: WarRoomProps) {
  // 响应式列数：<=3 Agent 两列，>3 Agent 三列（四列以上挤，三列最佳）
  const cols = selectedRoles.length <= 3 ? 2 : 3
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: 10,
    alignItems: 'stretch',
  }

  // 滚动引用（自动滚到底部）
  const containerRef = useRef<HTMLDivElement>(null)
  const prevTextsRef = useRef('')

  // 跟踪文本总长度，有新内容时自动滚到底
  const currentTexts = Object.values(agents).map(a => a.text).join('')
  useEffect(() => {
    if (isRunning && containerRef.current && currentTexts !== prevTextsRef.current) {
      prevTextsRef.current = currentTexts
      // 只在用户没有手动上滑时才自动滚底
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      if (distanceFromBottom < 150) {
        containerRef.current.scrollTo({ top: scrollHeight, behavior: 'smooth' })
      }
    }
  }, [currentTexts, isRunning])

  // 图表区域：有图表数据且分析不在运行中时展示
  const hasCharts = charts && charts.length > 0 && !isRunning

  return (
    <div className="if-fade-in" style={{ margin: '16px 0' }}>
      {/* 指挥室标题 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 12, padding: '0 4px',
      }}>
        <span style={{ fontSize: 14 }}>🏢</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>分析团队</span>
        {isRunning && (
          <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', borderRadius: 10 }}>
            实时协作中
          </Tag>
        )}
        {!isRunning && Object.keys(agents).length > 0 && (
          <Tag color="success" style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', borderRadius: 10 }}>
            分析完成
          </Tag>
        )}
        <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
          {Object.values(agents).filter(a => !a.isStreaming).length} / {selectedRoles.length} 完成
        </span>
      </div>

      {/* Agent并排工位（网格布局） */}
      <div ref={containerRef} style={gridStyle} className="warroom-grid">
        {selectedRoles.map((role, i) => {
          const status = getAgentStatus(role, agents, isRunning)
          return (
            <AgentWorkstation
              key={role}
              role={role}
              agent={agents[role]}
              status={status}
              index={i}
              isGlobalRunning={isRunning}
            />
          )
        })}
      </div>

      {/* 📊 数据图表区（分析完成后展示，核心差异化！） */}
      {hasCharts && (
        <div className="if-fade-in-up" style={{ marginTop: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12, padding: '0 4px',
          }}>
            <span style={{ fontSize: 14 }}>📊</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>数据图表</span>
            <Tag color="purple" style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', borderRadius: 10 }}>
              交互式
            </Tag>
            <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
              {charts!.length} 张图表 · 悬停查看详情
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(charts!.length, 2)}, 1fr)`,
            gap: 12,
          }}>
            {charts!.map((chart, i) => (
              <div key={i} style={{
                background: '#F8FAFC',
                borderRadius: 12,
                border: '1px solid #E2E8F0',
                overflow: 'hidden',
                transition: 'box-shadow 0.2s ease',
              }}>
                {chart.title && (
                  <div style={{
                    padding: '10px 14px 0',
                    fontSize: 12, fontWeight: 600, color: '#334155',
                  }}>
                    📈 {chart.title}
                  </div>
                )}
                <InsightChart data={chart} height={240} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 注入WarRoom专用CSS */}
      <style>{`
        @keyframes warroom-progress {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* 完成态的卡片去掉高度限制 */
        .warroom-grid > div {
          min-height: 120px;
        }

        /* 完成后的卡片内容不截断 */
        .warroom-grid > div > div:nth-child(3) {
          max-height: none !important;
          overflow: visible !important;
        }

        /* 分析中的卡片保持固定高度 */
        .warroom-grid > div:has(.if-cursor) > div:nth-child(3) {
          max-height: 45vh !important;
          overflow-y: auto !important;
        }
      `}</style>
    </div>
  )
}
