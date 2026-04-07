/**
 * InsightTag — 洞察标签条目
 * 输入: level(key/warn/info/action) / text / icon / color
 * 按重要程度显示不同颜色，是唯一来自 LLM 输出的展示区域
 */
import React from 'react'

export interface InsightItem {
  level: 'key' | 'warn' | 'info' | 'action'
  text: string
  icon?: string
  color?: string
  source?: string
}

interface InsightListProps {
  items: InsightItem[]
  title?: string
}

const LEVEL_STYLE: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  key:    { bg: '#ef444411', border: '#ef444433', dot: '#ef4444', label: '关键' },
  warn:   { bg: '#f59e0b11', border: '#f59e0b33', dot: '#f59e0b', label: '注意' },
  info:   { bg: '#6366f111', border: '#6366f133', dot: '#6366f1', label: '洞察' },
  action: { bg: '#10b98111', border: '#10b98133', dot: '#10b981', label: '建议' },
}

const InsightList: React.FC<InsightListProps> = ({ items, title }) => {
  if (!items || items.length === 0) return null

  return (
    <div style={{
      background: '#0a0f1e',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* 标题栏 */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ fontSize: '14px' }}>💡</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
          {title || '数据洞察'}
        </span>
        <span style={{ fontSize: '10px', color: '#334155', marginLeft: 'auto' }}>
          {items.length} 条
        </span>
      </div>

      {/* 洞察条目 */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {items.map((item, i) => {
          const style  = LEVEL_STYLE[item.level] || LEVEL_STYLE.info
          const color  = item.color || style.dot
          const border = item.color ? item.color + '33' : style.border
          const bg     = item.color ? item.color + '11' : style.bg

          return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '9px 12px',
                borderRadius: '5px',
                background: bg,
                border: `1px solid ${border}`,
                transition: 'opacity 0.2s',
              }}
            >
              {/* 左侧标签 */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                paddingTop: '1px', flexShrink: 0,
              }}>
                <span style={{ fontSize: '14px', lineHeight: 1 }}>{item.icon || '📌'}</span>
                <span style={{
                  fontSize: '9px', color: color, fontWeight: 700,
                  letterSpacing: '0.03em', whiteSpace: 'nowrap',
                }}>
                  {style.label}
                </span>
              </div>

              {/* 文字内容 */}
              <span style={{
                fontSize: '12px', color: '#cbd5e1', lineHeight: 1.6, flex: 1,
              }}>
                {item.text}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default InsightList
