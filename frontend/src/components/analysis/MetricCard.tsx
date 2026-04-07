/**
 * MetricCard — 顶部关键指标卡
 * 输入: label/value/sub/color/icon/suffix/trend
 * 特点: 大号数字 + 渐变背景 + 数字滚动动画 + 千分位格式化
 */
import React, { useState, useEffect, useRef } from 'react'

export interface MetricCardData {
  label: string
  value: string | number
  sub?: string
  color?: string
  icon?: string        // 语义图标名
  suffix?: string      // 附加单位
  trend?: 'up' | 'down' | 'flat'
}

const ICON_MAP: Record<string, string> = {
  database: '🗄️',
  check:    '✅',
  warning:  '⚠️',
  shield:   '🛡️',
  arrow_up: '↑',
  arrow_down:'↓',
  median:   '≈',
  range:    '↔',
}

/**
 * 从字符串中提取数字部分，用于动画
 * 例如 "16,202" → 16202, "128.0" → 128.0
 */
function extractNumber(value: string | number): number | null {
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/[^0-9.]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/**
 * 格式化数字（千分位），保留原始格式中的小数
 */
function formatNumber(num: number, originalValue: string): string {
  const parts = originalValue.split('.')
  const decimals = parts.length > 1 ? parts[parts.length - 1].length : 0
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function useCountUp(target: number | null, duration = 800, enabled = true) {
  const [display, setDisplay] = useState(target ?? 0)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled || target === null) {
      setDisplay(target ?? 0)
      return
    }

    // 整数和简单小数做动画，复杂格式直接显示
    if (target > 99999) {
      setDisplay(target)
      return
    }

    startTimeRef.current = performance.now()
    const startVal = 0

    function tick(now: number) {
      const elapsed = now - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      // easeOutExpo 缓动
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      const current = startVal + (target - startVal) * eased
      setDisplay(current)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration, enabled])

  return display
}

const MetricCard: React.FC<{ data: MetricCardData; animate?: boolean }> = ({ data, animate = true }) => {
  const color = data.color || '#6366f1'
  const icon  = ICON_MAP[data.icon || ''] || '📊'
  const numTarget = extractNumber(data.value)
  const animatedValue = useCountUp(numTarget, 800, animate)

  // 决定显示什么：有数字就显示动画后的格式化数字，否则显示原文
  const displayValue = numTarget !== null
    ? formatNumber(animatedValue, String(data.value))
    : String(data.value)

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f1929 0%, #111827 100%)',
      border: `1px solid ${color}33`,
      borderTop: `3px solid ${color}`,
      borderRadius: '8px',
      padding: '16px 18px',
      minWidth: '130px',
      flex: '1 1 130px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: 'default',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
      ;(e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${color}22`
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
      ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
    }}
    >
      {/* 背景光晕 */}
      <div style={{
        position: 'absolute', right: '-10px', top: '-10px',
        width: '60px', height: '60px', borderRadius: '50%',
        background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* 图标 + 标签 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <span style={{ fontSize: '14px' }}>{icon}</span>
        <span style={{ fontSize: '11px', color: '#64748b', letterSpacing: '0.03em' }}>{data.label}</span>
      </div>

      {/* 主数值 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '6px' }}>
        <span style={{
          fontSize: '26px', fontWeight: 700, color: '#f1f5f9',
          fontFamily: 'ui-monospace, monospace', lineHeight: 1,
          letterSpacing: '-0.02em',
        }}>
          {displayValue}
        </span>
        {data.suffix && (
          <span style={{ fontSize: '12px', color: '#475569' }}>{data.suffix}</span>
        )}
        {data.trend === 'up' && <span style={{ fontSize: '12px', color: '#10b981' }}>↑</span>}
        {data.trend === 'down' && <span style={{ fontSize: '12px', color: '#ef4444' }}>↓</span>}
      </div>

      {/* 副标题 */}
      {data.sub && (
        <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.4 }}>{data.sub}</div>
      )}
    </div>
  )
}

export const MetricCardRow: React.FC<{ cards: MetricCardData[] }> = ({ cards }) => {
  if (!cards || cards.length === 0) return null
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '10px',
      padding: '0 0 16px',
    }}>
      {cards.map((card, i) => (
        <MetricCard key={i} data={card} animate />
      ))}
    </div>
  )
}

export default MetricCard
