/**
 * SmartSuggestions — 智能分析提示
 *
 * 分析完成后，根据数据特征和用户问题，给出追问建议。
 * 让用户知道"还可以这样分析"。
 */

import React, { useState, useCallback } from 'react'
import { Tag, Tooltip } from 'antd'
import {
  BulbOutlined, ArrowRightOutlined,
} from '@ant-design/icons'

interface SmartSuggestionsProps {
  /** 当前报告/分析上下文 */
  report: any
  /** 数据概况（chen_profile） */
  dataInfo?: { rows: number; cols: number; quality?: number }
  /** 点击建议时的回调 */
  onSuggestionClick: (question: string) => void
  /** 是否显示 */
  visible: boolean
}

/** 基于数据类型的建议模板 */
const SUGGESTION_TEMPLATES = {
  has_time: [
    { icon: '📈', label: '趋势分析', template: '分析{field}的时间趋势和周期性变化' },
    { icon: '🔮', label: '未来预测', template: '基于历史数据预测{field}未来走势' },
    { icon: '📊', label: '同比环比', template: '{field}的同比和环比增长率分析' },
  ],
  has_category: [
    { icon: '🏆', label: '排名分析', template: '{field}的TOP10排名和占比分析' },
    { icon: '🥧', label: '结构分析', template: '{field}的构成比例和分布特征' },
    { icon: '🔀', label: '交叉分析', template: '不同{field}之间的对比和差异' },
  ],
  has_numeric: [
    { icon: '📉', label: '异常检测', template: '{field}中是否存在异常值和离群点' },
    { icon: '🔗', label: '关联分析', template: '分析{field}与其他指标的关联关系' },
    { icon: '📊', label: '分布特征', template: '{field}的统计分布和集中趋势' },
  ],
  general: [
    { icon: '🔍', label: '深度分析', template: '对数据进行更深入的多维分析' },
    { icon: '💡', label: '商业洞察', template: '从数据中提取可操作的商业建议' },
    { icon: '📋', label: '数据摘要', template: '生成一份完整的数据分析摘要报告' },
    { icon: '❓', label: '自定义问题', template: null }, // 特殊：让用户自由输入
  ],
}

function getFieldNames(report: any): string[] {
  // 尝试从报告中提取字段名
  if (!report) return ['数据']
  const sections = report?.sections || []
  for (const sec of sections) {
    // 从metrics/summary中提取
    if (sec.content) {
      const matches = sec.content.match(/[【「]?([^\s、，。,.\n]{2,15}?)[】」]?(?:的|中|内)/g)
      if (matches && matches.length > 0) {
        return matches.map(m => m.replace(/[【「】」的中的内]/g, '').trim()).slice(0, 3)
      }
    }
  }
  return ['数据']
}

export default function SmartSuggestions({
  report, dataInfo, onSuggestionClick, visible,
}: SmartSuggestionsProps) {
  const [expanded, setExpanded] = useState(false)

  const generateSuggestions = useCallback(() => {
    if (!report) return []

    const fields = getFieldNames(report)
    const field = fields[0] || '数据'
    const suggestions: Array<{ icon: string; label: string; question: string; category: string }> = []

    // 根据数据特征生成建议
    const allTemplates = [...SUGGESTION_TEMPLATES.general]

    // 检查是否有时间相关字段（启发式）
    const hasTime = report?.sections?.some((s: any) =>
      /时间|日期|月|年|季度|week|month|year|date|time/i.test(s.title || s.content || '')
    )
    if (hasTime) {
      allTemplates.unshift(...SUGGESTION_TEMPLATES.has_time)
    }

    // 检查是否有分类字段
    const hasCategory = report?.sections?.some((s: any) =>
      /类别|类型|区域|部门|category|type|region|department/i.test(s.title || s.content || '')
    )
    if (hasCategory) {
      allTemplates.unshift(...SUGGESTION_TEMPLATES.has_category)
    }

    // 数值型字段
    const hasNumeric = report?.sections?.some((s: any) =>
      /金额|收入|数量|销售额|amount|revenue|sales|count/i.test(s.title || s.content || '')
    )
    if (hasNumeric) {
      allTemplates.unshift(...SUGGESTION_TEMPLATES.has_numeric)
    }

    // 去重并生成具体问题
    const seen = new Set<string>()
    for (const tpl of allTemplates) {
      if (seen.has(tpl.label)) continue
      seen.add(tpl.label)

      if (tpl.template) {
        suggestions.push({
          icon: tpl.icon,
          label: tpl.label,
          question: tpl.template.replace('{field}', field),
          category: hasTime && tpl.label.includes('趋势') ? '时间序列'
            : hasCategory && tpl.label.includes('排名') ? '分类分析'
            : hasNumeric ? '数值分析' : '综合分析',
        })
      } else {
        suggestions.push({
          icon: tpl.icon,
          label: tpl.label,
          question: '',  // 空字符串 = 自由输入
          category: '自由探索',
        })
      }

      if (suggestions.length >= 6) break
    }

    return suggestions
  }, [report])

  const suggestions = generateSuggestions()

  if (!visible || suggestions.length === 0) return null

  return (
    <div className="smart-suggestions if-fade-in-up" style={{
      margin: '16px 0',
      borderRadius: 14,
      background: '#FFFBEB',
      border: '1px solid #FDE68A',
      overflow: 'hidden',
    }}>
      {/* 标题栏 */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid #FDE68A' : 'none',
          transition: 'background 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#FEF9C3')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <BulbOutlined style={{ color: '#D97706', fontSize: 15 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>
          你还可以这样分析
        </span>
        <span style={{ fontSize: 11, color: '#B45309', marginLeft: 'auto' }}>
          {expanded ? '收起' : `${suggestions.length} 条建议`}
        </span>
        <ArrowRightOutlined
          style={{
            fontSize: 10, color: '#B45309',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
          }}
        />
      </div>

      {/* 建议列表 */}
      {expanded && (
        <div style={{
          padding: '12px 16px',
          display: 'flex', flexWrap: 'wrap', gap: 8,
          animation: 'if-fade-in-up 0.3s ease both',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              onClick={() => s.question && onSuggestionClick(s.question)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                background: s.question ? '#FFFFFF' : 'transparent',
                border: `1px solid ${s.question ? '#FDE68A' : '#FBBF24'}`,
                cursor: s.question ? 'pointer' : 'default',
                fontSize: 12, color: '#92400E',
                transition: 'all 0.2s',
                boxShadow: s.question ? '0 1px 2px rgba(0,0,0,0.03)' : 'none',
              }}
              onMouseEnter={e => {
                if (s.question) {
                  e.currentTarget.style.background = '#FEF3C7'
                  e.currentTarget.style.borderColor = '#F59E0B'
                }
              }}
              onMouseLeave={e => {
                if (s.question) {
                  e.currentTarget.style.background = '#FFFFFF'
                  e.currentTarget.style.borderColor = '#FDE68A'
                }
              }}
            >
              <span style={{ fontSize: 13 }}>{s.icon}</span>
              <span style={{ fontWeight: 500 }}>{s.label}</span>
              {s.category && s.category !== '自由探索' && (
                <Tag style={{ fontSize: 9, margin: 0, padding: '0 4px', lineHeight: '14px', borderRadius: 3, background: '#FEF3C7', color: '#B45309', border: 'none' }}>
                  {s.category}
                </Tag>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
