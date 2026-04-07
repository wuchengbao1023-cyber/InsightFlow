/**
 * InsightChart — 基于 ECharts 的可交互分析图表
 * 支持：柱状图(bar) / 水平柱状图(bar_horizontal) / 折线图(line) / 饼图(pie)
 * 特点：hover 弹出详情，点击触发下钻回调，ECharts 渲染
 */
import React, { useEffect, useRef, useCallback } from 'react'
import * as echarts from 'echarts'

export interface ChartPoint {
  x: string | number
  y: number
  pct?: number
}

export interface ChartSeries {
  name: string
  data: ChartPoint[]
}

export interface ChartData {
  type: 'bar' | 'bar_horizontal' | 'line' | 'pie'
  title?: string
  x_label?: string
  y_label?: string
  drillable?: boolean
  series: ChartSeries[]
  highlight?: { label: string; value: number }
  stats?: {
    min: number; max: number; mean: number; median: number; count: number
  }
}

interface InsightChartProps {
  data: ChartData
  onDrillDown?: (x: string | number) => void
  height?: number
}

const InsightChart: React.FC<InsightChartProps> = ({ data, onDrillDown, height = 260 }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<echarts.ECharts | null>(null)

  const buildOption = useCallback((d: ChartData): echarts.EChartsOption => {
    const series0 = d.series[0] || { name: '', data: [] }
    const labels  = series0.data.map(p => String(p.x))
    const values  = series0.data.map(p => p.y)
    const pcts    = series0.data.map(p => p.pct ?? 0)

    const baseColor = '#6366f1'
    const colors = values.map((_, i) => {
      // 最高值高亮
      if (Math.max(...values) === values[i]) return '#10b981'
      // 最低值高亮
      if (Math.min(...values) === values[i]) return '#ef4444'
      return baseColor
    })

    if (d.type === 'bar') {
      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#fff',
          borderColor: '#e5e7eb',
          textStyle: { color: '#1a1a2e', fontSize: 12 },
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params
            const idx = p.dataIndex
            const pct = pcts[idx]
            return `<div style="padding:4px 2px">
              <b style="color:#1a1a2e">${labels[idx]}</b><br/>
              数值：<b style="color:#10b981">${values[idx]}</b>
              ${pct ? `（占比 ${pct}%）` : ''}
            </div>`
          }
        },
        grid: { left: 40, right: 20, top: 30, bottom: 50 },
        xAxis: {
          type: 'category',
          data: labels,
          axisLabel: { color: '#64748b', fontSize: 10, rotate: labels.length > 6 ? 30 : 0 },
          axisLine: { lineStyle: { color: '#d1d5db' } },
        },
        yAxis: {
          type: 'value',
          name: d.y_label || '',
          nameTextStyle: { color: '#64748b', fontSize: 10 },
          axisLabel: { color: '#64748b', fontSize: 10 },
          splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        },
        series: [{
          type: 'bar',
          name: series0.name,
          data: values.map((v, i) => ({
            value: v,
            itemStyle: { color: colors[i], borderRadius: [3, 3, 0, 0] },
          })),
          emphasis: { itemStyle: { color: '#818cf8' } },
          barMaxWidth: 40,
        }],
      }
    }

    if (d.type === 'bar_horizontal') {
      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#fff',
          borderColor: '#e5e7eb',
          textStyle: { color: '#1a1a2e', fontSize: 12 },
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params
            const idx = p.dataIndex
            return `<b>${labels[idx]}</b>: ${values[idx]}条（${pcts[idx]}%）`
          }
        },
        grid: { left: 120, right: 30, top: 10, bottom: 20 },
        xAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } } },
        yAxis: {
          type: 'category',
          data: [...labels].reverse(),
          axisLabel: { color: '#64748b', fontSize: 11, width: 110, overflow: 'truncate' },
          axisLine: { lineStyle: { color: '#d1d5db' } },
        },
        series: [{
          type: 'bar',
          data: [...values].reverse().map((v, i) => ({
            value: v,
            itemStyle: { color: i === 0 ? '#10b981' : baseColor, borderRadius: [0, 3, 3, 0] },
          })),
          barMaxWidth: 28,
          label: { show: true, position: 'right', color: '#64748b', fontSize: 10, formatter: (p: any) => p.value },
        }],
      }
    }

    if (d.type === 'line') {
      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#fff',
          borderColor: '#e5e7eb',
          textStyle: { color: '#1a1a2e', fontSize: 12 },
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params
            const idx = p.dataIndex
            return `<div style="padding:4px 2px">
              <b style="color:#1a1a2e">${labels[idx]}</b><br/>
              ${series0.name}：<b style="color:#10b981">${values[idx]}</b>
              ${pcts[idx] ? `（占比 ${pcts[idx]}%）` : ''}
            </div>`
          }
        },
        grid: { left: 40, right: 20, top: 30, bottom: 50 },
        xAxis: {
          type: 'category',
          data: labels,
          boundaryGap: false,
          axisLabel: { color: '#64748b', fontSize: 10, rotate: labels.length > 8 ? 30 : 0 },
          axisLine: { lineStyle: { color: '#d1d5db' } },
        },
        yAxis: {
          type: 'value',
          name: d.y_label || '',
          nameTextStyle: { color: '#64748b', fontSize: 10 },
          axisLabel: { color: '#64748b', fontSize: 10 },
          splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        },
        series: [{
          type: 'line',
          name: series0.name,
          data: values,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: '#6366f1', width: 2.5 },
          itemStyle: { color: '#6366f1' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99,102,241,0.25)' },
                { offset: 1, color: 'rgba(99,102,241,0.02)' },
              ]
            }
          },
          markPoint: {
            data: [
              { type: 'max', name: '最高', itemStyle: { color: '#10b981' } },
              { type: 'min', name: '最低', itemStyle: { color: '#ef4444' } },
            ],
            symbolSize: 40,
            label: { color: '#1a1a2e', fontSize: 10 },
          },
        }],
      }
    }

    if (d.type === 'pie') {
      const pieColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6']
      return {
        backgroundColor: 'transparent',
        tooltip: {
          backgroundColor: '#fff',
          borderColor: '#e5e7eb',
          textStyle: { color: '#1a1a2e', fontSize: 12 },
          formatter: (params: any) => `<b>${params.name}</b>: ${params.value}${pcts[params.dataIndex] ? `（${pcts[params.dataIndex]}%）` : ''}`,
        },
        legend: {
          type: 'scroll',
          orient: 'vertical',
          right: 10,
          top: 20,
          bottom: 20,
          textStyle: { color: '#64748b', fontSize: 11 },
        },
        series: [{
          type: 'pie',
          radius: ['35%', '65%'],
          center: ['40%', '50%'],
          data: labels.map((label, i) => ({
            name: label,
            value: values[i],
            itemStyle: { color: pieColors[i % pieColors.length] },
          })),
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 12, color: '#1a1a2e' },
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' },
          },
        }],
      }
    }

    // 默认 bar
    return { backgroundColor: 'transparent' }
  }, [])

  // 修复 ECharts 渲染负值 rx/ry 的问题（浮点精度导致）
  const fixEllipseBug = useCallback(() => {
    if (!containerRef.current) return
    const ellipses = containerRef.current.querySelectorAll('ellipse')
    ellipses.forEach(el => {
      const rx = parseFloat(el.getAttribute('rx') || '0')
      const ry = parseFloat(el.getAttribute('ry') || '0')
      if (rx < 0) el.setAttribute('rx', String(Math.abs(rx)))
      if (ry < 0) el.setAttribute('ry', String(Math.abs(ry)))
    })
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current)
    chartRef.current = chart
    chart.setOption(buildOption(data))

    // ECharts 渲染完成后修复 ellipse 负值
    chart.on('rendered', fixEllipseBug)
    chart.on('finished', fixEllipseBug)
    fixEllipseBug() // 立即执行一次

    if (data.drillable && onDrillDown) {
      chart.on('click', (params: any) => {
        onDrillDown(params.name || params.value)
      })
    }

    const ro = new ResizeObserver(() => {
      chart.resize()
      fixEllipseBug()
    })
    ro.observe(containerRef.current)

    return () => {
      chart.dispose()
      ro.disconnect()
    }
  }, [data, onDrillDown, buildOption, fixEllipseBug])

  return (
    <div style={{
      background: 'transparent',
      border: 'none',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* 图表标题栏 */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>
          {data.title || '数据分布'}
        </span>
        <div style={{ display: 'flex', gap: '12px' }}>
          {data.stats && (
            <>
              <span style={{ fontSize: '10px', color: '#888' }}>
                最低 <b style={{ color: '#ef4444' }}>{data.stats.min}</b>
              </span>
              <span style={{ fontSize: '10px', color: '#888' }}>
                中位 <b style={{ color: '#6366f1' }}>{data.stats.median}</b>
              </span>
              <span style={{ fontSize: '10px', color: '#888' }}>
                最高 <b style={{ color: '#10b981' }}>{data.stats.max}</b>
              </span>
            </>
          )}
          {data.drillable && (
            <span style={{ fontSize: '10px', color: '#999', fontStyle: 'italic' }}>
              点击柱子可筛选
            </span>
          )}
        </div>
      </div>

      {/* ECharts 容器 */}
      <div ref={containerRef} style={{ width: '100%', height: `${height}px` }} />
    </div>
  )
}

export default InsightChart
