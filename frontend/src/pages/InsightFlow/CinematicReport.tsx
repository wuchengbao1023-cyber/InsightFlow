/**
 * CinematicReport.tsx - 麦肯锡式专业分析报告 v3
 * 
 * v3 改造（2026-04-03）—— 从流水账到专业报告：
 * - 执行摘要（结论先行，100字回答核心问题）
 * - 核心发现（带严重等级标签的结构化发现）
 * - 图表区（ECharts，与之前一致）
 * - 分析论证（精炼正文，不是聊天记录）
 * - 风险提示 + 策略建议（带优先级标签）
 * - 溯源面板（可折叠，默认隐藏辩论过程）
 * 
 * 核心理念："过程要吵，结果要静"
 * - 给老板看：是专业的精炼报告
 * - 给技术看：展开溯源面板看到多智能体协作流
 */

import React, { useEffect, useRef, useState } from 'react'
import { Button, Typography, Tag, Collapse, Drawer, Timeline, Tooltip } from 'antd'
import {
  CloseOutlined,
  FullscreenOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  DatabaseOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  FileTextOutlined,
  WarningOutlined,
  BulbOutlined,
  AimOutlined,
  SearchOutlined,
  MessageOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import InsightChart from '../../components/analysis/InsightChart'
import { exportToPDF, exportToDOCX } from '../../utils/reportExporter'
import type { AnalysisRound } from './types'
import { useResponsive } from './useResponsive'

const { Title, Text, Paragraph } = Typography
const { Panel } = Collapse

interface CinematicReportProps {
  round: AnalysisRound | null
  visible: boolean
  onClose: () => void
  onExportPDF?: (el: HTMLDivElement) => void
}

/* ═══════════════════════════════════════════════════════════
   样式常量 — 磨砂白底 + 黑字
   ═══════════════════════════════════════════════════════════ */

const sectionBg = 'rgba(255,255,255,0.7)'
const sectionBorder = '1px solid rgba(0,0,0,0.06)'
const sectionRadius = 16

function sectionContainer(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: sectionBg,
    borderRadius: sectionRadius,
    padding: typeof window !== 'undefined' && window.innerWidth < 768 ? 20 : 28,
    border: sectionBorder,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
    ...extra,
  }
}

/* ═══════════════════════════════════════════════════════════
   图表图标映射
   ═══════════════════════════════════════════════════════════ */

const chartIcons: Record<string, React.ReactNode> = {
  line: <LineChartOutlined />,
  bar: <BarChartOutlined />,
  bar_horizontal: <BarChartOutlined />,
  pie: <PieChartOutlined />,
}

/* ═══════════════════════════════════════════════════════════
   严重等级颜色
   ═══════════════════════════════════════════════════════════ */

const severityColors: Record<string, { bg: string; border: string; text: string; tag: string }> = {
  high: { bg: 'rgba(239,68,68,0.08)', border: '#ef4444', text: '#dc2626', tag: 'red' },
  medium: { bg: 'rgba(250,173,20,0.08)', border: '#faad14', text: '#d48806', tag: 'orange' },
  low: { bg: 'rgba(82,196,26,0.08)', border: '#52c41a', text: '#389e0d', tag: 'green' },
}

const priorityLabels: Record<string, string> = {
  '高': '高优先级',
  '中': '中优先级',
  '低': '低优先级',
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级',
}

/* ═══════════════════════════════════════════════════════════
   工具函数：清洗 Markdown 格式符号
   ═══════════════════════════════════════════════════════════ */

/** 去除 Markdown 粗体/斜体标记和标题符号，保留换行 */
function stripMarkdown(text: string): string {
  if (!text) return text
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')        // *italic* → italic
    .replace(/^#{1,6}\s+/gm, '')         // ## heading → heading
    .replace(/^[-*+]\s+/gm, '')          // - list → list
    .replace(/^\d+\.\s+/gm, '')          // 1. list → list
    .replace(/~~(.+?)~~/g, '$1')        // ~~strike~~ → strike
    .replace(/`{1,3}(.+?)`{1,3}/g, '$1') // `code` → code
}

/* ═══════════════════════════════════════════════════════════
   主组件
   ═══════════════════════════════════════════════════════════ */

export default function CinematicReport({ round, visible, onClose, onExportPDF }: CinematicReportProps) {
  const reportRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showDebateDrawer, setShowDebateDrawer] = useState(false)
  const responsive = useResponsive()
  // 逐段出现动画：记录已可见的 section index
  const [visibleSections, setVisibleSections] = useState<number>(0)
  // 收集所有需要展示的 section DOM 引用
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])

  // 逐段出现动画：每 300ms 淡入下一个 section
  useEffect(() => {
    if (!visible) {
      setVisibleSections(0)
      return
    }
    setVisibleSections(0)
    const timer = setInterval(() => {
      setVisibleSections(prev => {
        if (prev >= 20) {
          clearInterval(timer)
          return prev
        }
        return prev + 1
      })
    }, 300)
    return () => clearInterval(timer)
  }, [visible])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      reportRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const handleExportPDF = async () => {
    if (!reportRef.current) return
    setExporting(true)
    try {
      await exportToPDF(reportRef.current)
    } finally {
      setExporting(false)
    }
  }

  const handleExportDOCX = async () => {
    if (!round?.report) return
    setExporting(true)
    try {
      await exportToDOCX({
        title: report.title,
        subtitle: report.subtitle,
        generated_at: report.generated_at,
        sections: report.sections,
        question: round.question,
        elapsed: round.elapsed,
        meta: report._meta,
        executive_summary: report.executive_summary,
      })
    } finally {
      setExporting(false)
    }
  }

  if (!visible || !round?.report) return null

  const { report } = round
  const sections = report.sections || []

  // 提取各类 section（v6 新结构）
  const keyFindingsSection = sections.find((s: any) => s.type === 'key_findings')
  const metricsSection = sections.find((s: any) => s.type === 'metrics')
  const chartsSection = sections.find((s: any) => s.type === 'charts')
  const analysisSection = sections.find((s: any) => s.type === 'analysis')
  const risksSection = sections.find((s: any) => s.type === 'risks')
  const recommendationsSection = sections.find((s: any) => s.type === 'recommendations')
  const qualitySection = sections.find((s: any) => s.type === 'quality')
  const tracePanelSection = sections.find((s: any) => s.type === 'trace_panel')
  const debateLogSection = sections.find((s: any) => s.type === 'debate_log')
  const costSection = sections.find((s: any) => s.type === 'cost_report')
  const tableSection = sections.find((s: any) => s.type === 'data_table')

  // 兼容旧版（v5及以下）
  const discussionSection = sections.find((s: any) => s.type === 'discussion_summary')
  const insightsSection = sections.find((s: any) => s.type === 'insights')
  const adviceSection = sections.find((s: any) => s.type === 'advice' || s.type === 'suggestions')
  const qaSection = sections.find((s: any) => s.type === 'qa_record')

  // 图表数据
  const chartsRaw = chartsSection?.items || []
  const charts = chartsRaw
    .map((item: any) => item.echarts_data || null)
    .filter(Boolean)

  // 报告元数据
  const meta = report._meta || {}
  const isV6 = report.version === 'v6_professional' || !!report.executive_summary

  return (
    <div
      ref={reportRef}
      id="cinematic-report-root"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(245, 247, 250, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 1000,
        overflow: 'auto',
        padding: responsive.isMobile ? '20px 16px' : '40px 60px',
        animation: 'cinFadeInUp 0.5s ease',
        color: '#1a1a2e',
      }}
    >
      {/* ═══ 顶部控制栏 ═══ */}
      <div style={{
        position: 'fixed',
        top: responsive.isMobile ? 12 : 20,
        right: responsive.isMobile ? 12 : 20,
        display: 'flex',
        gap: responsive.isMobile ? 6 : 12,
        zIndex: 1001,
        flexWrap: responsive.isMobile ? 'wrap' : 'nowrap',
        justifyContent: 'flex-end',
        maxWidth: responsive.isMobile ? 'calc(100vw - 24px)' : undefined,
      }}>
        {isV6 && !responsive.isMobile && (
          <Tag color="purple" style={{ fontSize: 12, padding: '4px 12px', margin: 0 }}>
            专业报告 v6
          </Tag>
        )}
        {debateLogSection?.data?.has_debate && (
          <Tooltip title="查看完整辩论过程">
            <Button
              icon={<HistoryOutlined />}
              onClick={() => setShowDebateDrawer(true)}
              style={{ background: 'rgba(114,46,209,0.1)', borderColor: '#722ed1', color: '#722ed1' }}
              size={responsive.isMobile ? 'small' : 'middle'}
            >
              {!responsive.isMobile && '辩论记录'}
            </Button>
          </Tooltip>
        )}
        <Button
          icon={<FullscreenOutlined />}
          onClick={toggleFullscreen}
          style={{ background: 'rgba(0,0,0,0.06)', borderColor: 'rgba(0,0,0,0.1)', color: '#333' }}
          size={responsive.isMobile ? 'small' : 'middle'}
        >
          {!responsive.isMobile && (isFullscreen ? '退出全屏' : '全屏')}
        </Button>
        <Button
          icon={<DownloadOutlined />}
          type="primary"
          onClick={handleExportPDF}
          loading={exporting}
          size={responsive.isMobile ? 'small' : 'middle'}
        >
          {!responsive.isMobile && '导出PDF'}
        </Button>
        {!responsive.isMobile && (
          <Button
            icon={<FileTextOutlined />}
            onClick={handleExportDOCX}
            loading={exporting}
            style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff' }}
          >
            导出Word
          </Button>
        )}
        <Button
          danger
          icon={<CloseOutlined />}
          onClick={onClose}
          style={{ fontWeight: 600 }}
          size={responsive.isMobile ? 'small' : 'middle'}
        >
          {!responsive.isMobile && '关闭'}
        </Button>
      </div>

      {/* ═══ 报告标题 ═══ */}
      <div style={{ textAlign: 'center', marginBottom: responsive.isMobile ? 24 : 48, maxWidth: 800, margin: '0 auto ' + (responsive.isMobile ? '24px' : '48px') }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: responsive.isMobile ? 8 : 12, marginBottom: responsive.isMobile ? 10 : 16 }}>
          <ThunderboltOutlined style={{ fontSize: responsive.isMobile ? 24 : 32, color: '#1890ff' }} />
          <Title level={1} style={{ color: '#1a1a2e', margin: 0, fontSize: responsive.isMobile ? 24 : 38 }}>
            {report.title || '分析报告'}
          </Title>
        </div>
        {report.subtitle && (
          <Text style={{ color: '#555', fontSize: responsive.isMobile ? 13 : 15, display: 'block', marginBottom: 8 }}>
            {report.subtitle}
          </Text>
        )}
        <Text style={{ color: '#666', fontSize: responsive.isMobile ? 14 : 16 }}>
          {round.question}
        </Text>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Tag color="blue">分析完成</Tag>
          <Tag color="green">{round.elapsed}s</Tag>
          {meta.agents?.length ? <Tag color="purple">{meta.agents.length} 个Agent协作</Tag> : null}
          {meta.has_debate ? <Tag color="orange">{meta.debate_verdict || '已审查'}</Tag> : null}
        </div>
      </div>

      {/* ═══ v6: 执行摘要（结论先行）═══ */}
      {isV6 && report.executive_summary && (
        <RevealSection index={1} visibleAt={visibleSections}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(24,144,255,0.08) 0%, rgba(114,46,209,0.08) 100%)',
          borderRadius: 20,
          padding: responsive.isMobile ? '20px 18px' : '32px 36px',
          border: '1px solid rgba(24,144,255,0.15)',
          marginBottom: responsive.isMobile ? 20 : 40,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* 装饰角标 */}
          <div style={{
            position: 'absolute', top: 0, right: 0,
            background: '#1890ff', color: '#fff',
            fontSize: 11, fontWeight: 600,
            padding: '4px 16px 4px 20px',
            borderBottomLeftRadius: 12,
          }}>
            EXECUTIVE SUMMARY
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <AimOutlined style={{ fontSize: 22, color: '#1890ff' }} />
            <Text style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>核心结论</Text>
          </div>
          <Paragraph style={{ color: '#1a1a2e', fontSize: 17, lineHeight: 2, margin: 0 }}>
            {stripMarkdown(report.executive_summary)}
          </Paragraph>
        </div>
        </RevealSection>
      )}

      {/* ═══ v6: 核心发现 ═══ */}
      {isV6 && keyFindingsSection?.findings?.length > 0 && (
        <RevealSection index={2} visibleAt={visibleSections}>
        <Section title="核心发现" icon={<ThunderboltOutlined />} accentColor="#1890ff">
          <div style={{ display: 'grid', gap: 14 }}>
            {keyFindingsSection.findings.map((finding: any, i: number) => {
              const sev = severityColors[finding.severity] || severityColors.medium
              return (
                <div key={i} style={{
                  background: sev.bg,
                  borderRadius: 12,
                  padding: '18px 22px',
                  borderLeft: `4px solid ${sev.border}`,
                  display: 'flex',
                  gap: 16,
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    flexShrink: 0,
                    width: 32, height: 32,
                    borderRadius: '50%',
                    background: sev.border,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>
                        {finding.title}
                      </Text>
                      <Tag color={sev.tag} style={{ fontSize: 11 }}>
                        {finding.severity === 'high' ? '关键' : finding.severity === 'medium' ? '重要' : '参考'}
                      </Tag>
                    </div>
                    <Text style={{ color: '#444', fontSize: 14, lineHeight: 1.8 }}>
                      {stripMarkdown(finding.content)}
                    </Text>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
        </RevealSection>
      )}

      {/* ═══ 核心指标卡 ═══ */}
      {metricsSection?.cards && metricsSection.cards.length > 0 && (
        <RevealSection index={3} visibleAt={visibleSections}>
        <Section title="核心指标" icon={<DatabaseOutlined />} accentColor="#1890ff">
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(metricsSection.cards.length, 4)}, 1fr)`,
            gap: 16,
          }}>
            {metricsSection.cards.map((card: any, i: number) => (
              <div key={i} style={{
                background: 'rgba(24, 144, 255, 0.08)',
                borderRadius: 12,
                padding: '20px 16px',
                border: '1px solid rgba(24, 144, 255, 0.15)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a2e' }}>
                  {card.value}
                </div>
                {card.sub && (
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                    {card.sub}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
        </RevealSection>
      )}

      {/* ═══ 图表（ECharts 接入）═══ */}
      {charts.length > 0 && (
        <RevealSection index={4} visibleAt={visibleSections}>
        <Section title="数据可视化" icon={<BarChartOutlined />} accentColor="#6366f1">
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(charts.length, 2)}, 1fr)`,
            gap: 20,
          }}>
            {charts.map((chart: any, i: number) => (
              <div key={i} style={{
                background: 'rgba(99, 102, 241, 0.06)',
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(99, 102, 241, 0.12)',
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(99, 102, 241, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span style={{ color: '#818cf8' }}>
                    {chartIcons[chart.type] || <BarChartOutlined />}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                    {stripMarkdown(chart.title || `图表 ${i + 1}`)}
                  </span>
                  {chart.stats && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#666' }}>
                      均值 {chart.stats.mean} · 中位 {chart.stats.median}
                    </span>
                  )}
                </div>
                <InsightChart data={chart} height={300} />
              </div>
            ))}
          </div>
        </Section>
        </RevealSection>
      )}

      {/* ═══ v6: 分析论证 ═══ */}
      {isV6 && analysisSection?.content && (
        <RevealSection index={5} visibleAt={visibleSections}>
        <Section title="分析论证" icon={<FileTextOutlined />} accentColor="#1890ff">
          <Paragraph style={{ color: '#333', fontSize: 15, lineHeight: 2.2, whiteSpace: 'pre-wrap' }}>
            {stripMarkdown(analysisSection.content)}
          </Paragraph>
        </Section>
        </RevealSection>
      )}

      {/* ═══ v6: 风险提示 ═══ */}
      {isV6 && risksSection?.items?.length > 0 && (
        <RevealSection index={6} visibleAt={visibleSections}>
        <Section title="风险提示" icon={<WarningOutlined />} accentColor="#ef4444">
          <div style={{ display: 'grid', gap: 10 }}>
            {risksSection.items.map((risk: any, i: number) => (
              <div key={i} style={{
                background: 'rgba(239, 68, 68, 0.06)',
                borderLeft: '4px solid #ef4444',
                borderRadius: '0 10px 10px 0',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <WarningOutlined style={{ color: '#ef4444', fontSize: 16 }} />
                <Text style={{ color: '#333', fontSize: 14 }}>{typeof risk === 'string' ? stripMarkdown(risk) : stripMarkdown(risk.text || risk.content)}</Text>
              </div>
            ))}
          </div>
        </Section>
        </RevealSection>
      )}

      {/* ═══ v6: 策略建议 ═══ */}
      {isV6 && recommendationsSection?.items?.length > 0 && (
        <RevealSection index={7} visibleAt={visibleSections}>
        <Section title="策略建议" icon={<BulbOutlined />} accentColor="#52c41a">
          <div style={{ display: 'grid', gap: 14 }}>
            {recommendationsSection.items.map((rec: any, i: number) => {
              const priority = priorityLabels[rec.priority] || ''
              return (
                <div key={i} style={{
                  background: 'rgba(82, 196, 26, 0.06)',
                  borderLeft: '4px solid #52c41a',
                  borderRadius: '0 12px 12px 0',
                  padding: '18px 22px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      background: '#52c41a', color: '#fff',
                      fontSize: 11, fontWeight: 600,
                      padding: '2px 10px', borderRadius: 10,
                    }}>
                      建议 {i + 1}
                    </span>
                    {priority && <Tag color="green" style={{ fontSize: 11 }}>{priority}</Tag>}
                  </div>
                  <Text style={{ color: '#333', fontSize: 14, display: 'block', marginBottom: 4 }}>
                    {stripMarkdown(rec.action || rec.text || rec.title)}
                  </Text>
                  {rec.expected_impact && (
                    <Text style={{ color: '#888', fontSize: 12 }}>
                      预期效果：{stripMarkdown(rec.expected_impact)}
                    </Text>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
        </RevealSection>
      )}

      {/* ═══ v6: 溯源面板（可折叠，默认隐藏）═══ */}
      {isV6 && tracePanelSection?.data && (
        <RevealSection index={8} visibleAt={visibleSections}>
        <div style={{ marginBottom: 40 }}>
          <Collapse
            bordered={false}
            style={{ background: 'rgba(0,0,0,0.02)', borderRadius: sectionRadius }}
          >
            <Panel
              header={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SearchOutlined style={{ color: '#722ed1', fontSize: 18 }} />
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e' }}>
                    AI分析溯源
                  </span>
                  <Tag color="purple" style={{ fontSize: 11 }}>
                    技术详情
                  </Tag>
                  {tracePanelSection.data.debate_overview && (
                    <Tag style={{ fontSize: 11 }}>
                      辩论{tracePanelSection.data.debate_overview.total_rounds}轮 · 
                      修正{tracePanelSection.data.debate_overview.corrections_made}处
                    </Tag>
                  )}
                </div>
              }
              key="trace"
              style={{
                background: sectionBg,
                borderRadius: sectionRadius,
                border: sectionBorder,
              }}
            >
              <TracePanel data={tracePanelSection.data} />
            </Panel>
          </Collapse>
        </div>
        </RevealSection>
      )}

      {/* ═══ 兼容旧版：讨论纪要 ═══ */}
      {!isV6 && discussionSection?.summary && (
        <Section title="讨论纪要" icon={<TeamOutlined />} accentColor="#722ed1">
          <Paragraph style={{ color: '#333', fontSize: 15, lineHeight: 2, whiteSpace: 'pre-wrap' }}>
            {stripMarkdown(discussionSection.summary)}
          </Paragraph>
        </Section>
      )}

      {/* ═══ 兼容旧版：洞察总结 ═══ */}
      {!isV6 && insightsSection && (
        <Section title={insightsSection.title || '核心洞察'} icon={<ThunderboltOutlined />} accentColor="#52c41a">
          {insightsSection.categories ? (
            <div style={{ display: 'grid', gap: 20 }}>
              {(['过去', '现在', '未来', '建议'] as const).map(cat => {
                const items = insightsSection.categories[cat]
                if (!items || items.length === 0) return null
                const catColors: Record<string, string> = { '过去': '#faad14', '现在': '#1890ff', '未来': '#722ed1', '建议': '#52c41a' }
                return (
                  <div key={cat}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: catColors[cat] || '#888',
                      marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: catColors[cat],
                      }} />
                      {cat}
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {items.map((item: any, i: number) => (
                        <InsightItem key={i} item={item} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <Paragraph style={{ color: '#333', fontSize: 15, lineHeight: 2 }}>
              {insightsSection.content || ''}
            </Paragraph>
          )}
        </Section>
      )}

      {/* ═══ 兼容旧版：策略建议 ═══ */}
      {!isV6 && adviceSection && (adviceSection.items?.length > 0) && (
        <Section title={adviceSection.title || '策略建议'} icon={<ThunderboltOutlined />} accentColor="#52c41a">
          <div style={{ display: 'grid', gap: 12 }}>
            {(adviceSection.items as any[]).map((item: any, i: number) => (
              <div key={i} style={{
                background: 'rgba(82, 196, 26, 0.08)',
                borderLeft: '4px solid #52c41a',
                padding: '14px 20px',
                borderRadius: '0 10px 10px 0',
              }}>
                <Text style={{ color: '#333', fontSize: 14 }}>
                  {item.text || item.title || item}
                </Text>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ═══ 数据表格 ═══ */}
      {tableSection && (tableSection.data?.length > 0) && (
        <Section title={tableSection.title || '数据明细'} icon={<FileTextOutlined />} accentColor="#1890ff">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(24, 144, 255, 0.12)' }}>
                  {(tableSection.columns || []).map((h: string, i: number) => (
                    <th key={i} style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      color: '#1a1a2e',
                      fontWeight: 600,
                      fontSize: 13,
                      borderBottom: '1px solid rgba(0,0,0,0.08)',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(tableSection.data || []).slice(0, 50).map((row: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                    {(tableSection.columns || []).map((col: string, j: number) => {
                      const val = row[col]
                      return (
                        <td key={j} style={{
                          padding: '10px 16px',
                          color: '#333',
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                        }}>
                          {typeof val === 'number' ? val.toLocaleString() : String(val ?? '')}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {(tableSection.data || []).length > 50 && (
              <div style={{ textAlign: 'center', padding: 12, color: '#555', fontSize: 12 }}>
                仅显示前50行，共 {(tableSection.data || []).length} 行
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ═══ 数据质量说明 ═══ */}
      {qualitySection && (
        <Section title={qualitySection.title || '数据说明'} icon={<SafetyCertificateOutlined />} accentColor="#faad14">
          {qualitySection.quality_score != null && (
            <div style={{
              display: 'inline-block',
              background: qualitySection.quality_score >= 80
                ? 'rgba(82, 196, 26, 0.15)'
                : qualitySection.quality_score >= 60
                  ? 'rgba(250, 173, 20, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
              borderRadius: 8,
              padding: '8px 16px',
              marginBottom: 16,
            }}>
              <Text style={{ color: '#333', fontSize: 14 }}>
                数据质量评分：<b style={{
                  color: qualitySection.quality_score >= 80 ? '#52c41a'
                    : qualitySection.quality_score >= 60 ? '#faad14'
                    : '#ef4444',
                }}>{qualitySection.quality_score}</b>/100
              </Text>
            </div>
          )}
          {qualitySection.warnings?.length > 0 && (
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {qualitySection.warnings.map((w: string, i: number) => (
                <div key={i} style={{ color: '#faad14', fontSize: 13 }}>
                  ⚠️ {w}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ═══ 兼容旧版：质检记录 ═══ */}
      {!isV6 && qaSection && qaSection.rounds?.length > 0 && (
        <Section title="质检记录" icon={<SafetyCertificateOutlined />} accentColor="#ef4444">
          <Text style={{ color: '#888', fontSize: 14, display: 'block', marginBottom: 16 }}>
            {qaSection.summary}
          </Text>
          <div style={{ display: 'grid', gap: 10 }}>
            {qaSection.rounds.map((r: any, i: number) => (
              <div key={i} style={{
                background: 'rgba(239, 68, 68, 0.06)',
                borderRadius: 8,
                padding: '12px 16px',
                border: '1px solid rgba(239, 68, 68, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <Tag color={r.passed ? 'green' : 'red'}>
                  第{r.round}轮 · {r.score}分
                </Tag>
                <Text style={{ color: '#999', fontSize: 12 }}>
                  {r.issues_count} 个问题
                </Text>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ═══ AI运行成本 ═══ */}
      {costSection && costSection.total_calls > 0 && (
        <Section title="AI运行成本" icon={<DollarOutlined />} accentColor="#0ea5e9">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 16,
          }}>
            <div style={{ textAlign: 'center', padding: 12 }}>
              <div style={{ fontSize: 11, color: '#888' }}>调用次数</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}>{costSection.total_calls}</div>
            </div>
            <div style={{ textAlign: 'center', padding: 12 }}>
              <div style={{ fontSize: 11, color: '#888' }}>Token 总量</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}>
                {((costSection.total_input_tokens || 0) + (costSection.total_output_tokens || 0)).toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: 12 }}>
              <div style={{ fontSize: 11, color: '#888' }}>预估费用</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#52c41a' }}>
                {costSection.estimated_cost || `¥${(costSection.estimated_cost_yuan || 0).toFixed(4)}`}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ═══ 报告底部 ═══ */}
      <div style={{
        marginTop: 48,
        paddingTop: 24,
        borderTop: '1px solid rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}>
          <Text style={{ color: '#888', fontSize: 12 }}>
            {report.generated_at ? `报告生成于 ${report.generated_at}` : 'InsightFlow 自动生成'}
            {' · '}
            {meta.agents?.length ? `参与Agent: ${meta.agents.join('、')}` : ''}
          </Text>
      </div>

      <div style={{ height: 60 }} />

      {/* ═══ 完整辩论记录 Drawer（独立于报告）═══ */}
      <Drawer
        title={
          <span>
            <TeamOutlined style={{ marginRight: 8, color: '#722ed1' }} />
            完整辩论记录
          </span>
        }
        placement="right"
        width={responsive.isMobile ? '90%' : 620}
        open={showDebateDrawer}
        onClose={() => setShowDebateDrawer(false)}
        styles={{ body: { padding: '20px 24px', background: '#fafafa' } }}
      >
        <DebateLogDrawer data={debateLogSection?.data} />
      </Drawer>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   逐段出现动画容器
   ═══════════════════════════════════════════════════════════ */

function RevealSection({ index, visibleAt, children }: { index: number; visibleAt: number; children: React.ReactNode }) {
  const isVisible = index < visibleAt
  return (
    <div style={{
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'translateY(0)' : 'translateY(24px)',
      transition: 'opacity 0.6s ease, transform 0.6s ease',
    }}>
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   完整辩论记录 Drawer 内容
   ═══════════════════════════════════════════════════════════ */

function DebateLogDrawer({ data }: { data: any }) {
  if (!data) return <Text style={{ color: '#999' }}>暂无辩论记录</Text>

  return (
    <div>
      {/* 辩论结果概要 */}
      {data.verdict && (
        <div style={{
          background: '#f0f5ff',
          borderRadius: 10,
          padding: '14px 18px',
          marginBottom: 20,
          borderLeft: '4px solid #1890ff',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>
            辩论结论：{data.verdict}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Tag>{data.total_rounds} 轮辩论</Tag>
          </div>
        </div>
      )}

      {/* 辩论轮次 Timeline */}
      {data.rounds?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 15, fontWeight: 700, display: 'block', marginBottom: 14 }}>
            辩论过程详录
          </Text>
          <Timeline
            items={data.rounds.map((round: any, i: number) => ({
              color: round.resolved ? 'green' : 'red',
              children: (
                <div key={i} style={{ marginBottom: 12 }}>
                  <Tag color="purple" style={{ marginBottom: 8 }}>第 {round.round} 轮</Tag>

                  <div style={{
                    background: '#fff1f0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginBottom: 8,
                    borderLeft: '3px solid #ef4444',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>
                      质检官质疑
                    </div>
                    <div style={{ fontSize: 13, color: '#333', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                      {stripMarkdown(round.challenger_message || '')}
                    </div>
                    {round.issues_found?.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {round.issues_found.map((issue: string, j: number) => (
                          <Tag key={j} color="red" style={{ fontSize: 11, marginBottom: 4 }}>{issue}</Tag>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{
                    background: '#f6ffed',
                    borderRadius: 8,
                    padding: '10px 14px',
                    borderLeft: '3px solid #52c41a',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#52c41a', marginBottom: 4 }}>
                      {round.defender} 辩护
                    </div>
                    <div style={{ fontSize: 13, color: '#333', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                      {stripMarkdown(round.defender_message || '')}
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                    {round.resolved ? '已解决' : '未完全解决'}
                  </div>
                </div>
              ),
            }))}
          />
        </div>
      )}

      {/* 各 Agent 辩论历史 */}
      {data.agent_histories && Object.keys(data.agent_histories).length > 0 && (
        <div>
          <Text style={{ fontSize: 15, fontWeight: 700, display: 'block', marginBottom: 14 }}>
            各分析师的修正记录
          </Text>
          {Object.entries(data.agent_histories).map(([role, history]: [string, any]) => (
            <div key={role} style={{ marginBottom: 16 }}>
              <Tag color="blue" style={{ marginBottom: 8, fontSize: 12 }}>{role}</Tag>
              {(history as any[]).map((h: any, i: number) => (
                <div key={i} style={{
                  background: '#fff',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 6,
                  border: '1px solid #e8e8e8',
                }}>
                  <Tag style={{ fontSize: 10 }}>Round {h.round}</Tag>
                  {h.challenger_message && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                      质疑：{stripMarkdown(String(h.challenger_message).slice(0, 200))}...
                    </div>
                  )}
                  {h.defense_message && (
                    <div style={{ fontSize: 12, color: '#52c41a', marginTop: 4 }}>
                      修正：{stripMarkdown(String(h.defense_message).slice(0, 200))}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   溯源面板组件（可折叠内容）
   ═══════════════════════════════════════════════════════════ */

function TracePanel({ data }: { data: any }) {
  if (!data) return null

  return (
    <div style={{ padding: '8px 0' }}>
      {/* 辩论总览 */}
      {data.debate_overview && (
        <div style={{
          background: 'rgba(114, 46, 209, 0.06)',
          borderRadius: 10,
          padding: '14px 18px',
          marginBottom: 16,
        }}>
          <Text style={{ fontSize: 13, fontWeight: 600, color: '#722ed1', display: 'block', marginBottom: 8 }}>
            辩论审查结果
          </Text>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Tag>{data.debate_overview.verdict}</Tag>
            <Tag>{data.debate_overview.total_rounds} 轮辩论</Tag>
            <Tag>{data.debate_overview.issues_total} 个问题</Tag>
            <Tag color="green">{data.debate_overview.issues_resolved} 个已解决</Tag>
            <Tag color="orange">{data.debate_overview.corrections_made} 处修正</Tag>
          </div>
        </div>
      )}

      {/* 各Agent最终结论 */}
      {data.agent_final_conclusions && Object.keys(data.agent_final_conclusions).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: 600, color: '#333', display: 'block', marginBottom: 10 }}>
            各分析师最终结论
          </Text>
          <div style={{ display: 'grid', gap: 8 }}>
            {Object.entries(data.agent_final_conclusions).map(([role, conclusion]: [string, any]) => (
              <div key={role} style={{
                background: 'rgba(24, 144, 255, 0.04)',
                borderRadius: 8,
                padding: '10px 16px',
                border: '1px solid rgba(24, 144, 255, 0.1)',
              }}>
                <Text style={{ color: '#1890ff', fontSize: 12, fontWeight: 600 }}>{role}</Text>
                <div style={{ color: '#555', fontSize: 13, marginTop: 4, lineHeight: 1.7 }}>
                  {String(conclusion)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 辩论修正记录 */}
      {data.debate_history?.length > 0 && (
        <div>
          <Text style={{ fontSize: 13, fontWeight: 600, color: '#333', display: 'block', marginBottom: 10 }}>
            辩论修正记录
          </Text>
          <div style={{ display: 'grid', gap: 8 }}>
            {data.debate_history.map((record: any, i: number) => (
              <div key={i} style={{
                background: 'rgba(250, 173, 20, 0.06)',
                borderRadius: 8,
                padding: '10px 16px',
                border: '1px solid rgba(250, 173, 20, 0.1)',
              }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <Tag style={{ fontSize: 11 }}>{record.agent}</Tag>
                  <Tag color="orange" style={{ fontSize: 11 }}>第{record.round}轮</Tag>
                </div>
                <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 4 }}>
                  质疑：{stripMarkdown(record.issue)}
                </div>
                <div style={{ fontSize: 12, color: '#52c41a' }}>
                  修正：{stripMarkdown(record.correction)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* v6.1: 完整辩论轮次详情 */}
      {data.debate_rounds?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: 600, color: '#333', display: 'block', marginBottom: 10 }}>
            辩论轮次详情
          </Text>
          <div style={{ display: 'grid', gap: 10 }}>
            {data.debate_rounds.map((round: any, i: number) => (
              <div key={i} style={{
                background: round.resolved ? 'rgba(82,196,26,0.04)' : 'rgba(239,68,68,0.04)',
                borderRadius: 8,
                padding: '10px 14px',
                border: `1px solid ${round.resolved ? 'rgba(82,196,26,0.15)' : 'rgba(239,68,68,0.15)'}`,
              }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <Tag color="purple" style={{ fontSize: 10 }}>Round {round.round}</Tag>
                  <Tag color={round.resolved ? 'green' : 'red'} style={{ fontSize: 10 }}>
                    {round.resolved ? '已解决' : '待处理'}
                  </Tag>
                </div>
                {round.issues_found?.length > 0 && (
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                    发现问题：{round.issues_found.join('、').slice(0, 100)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {round.challenger}: {stripMarkdown(String(round.challenger_message).slice(0, 200))}...
                </div>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: 4 }}>
                  {round.defender}: {stripMarkdown(String(round.defender_message).slice(0, 200))}...
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   子组件：Section 区块
   ═══════════════════════════════════════════════════════════ */

function Section({
  title,
  icon,
  accentColor = '#1890ff',
  children,
}: {
  title: string
  icon: React.ReactNode
  accentColor?: string
  children: React.ReactNode
}) {
  return (
    <div className="cin-report-section" style={{ marginBottom: 40 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 18,
        paddingBottom: 10,
        borderBottom: `2px solid ${accentColor}30`,
      }}>
        <span style={{ color: accentColor, fontSize: 20 }}>{icon}</span>
        <Title level={2} style={{ color: '#1a1a2e', margin: 0, fontSize: 22 }}>
          {title}
        </Title>
      </div>
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   子组件：洞察条目（兼容旧版）
   ═══════════════════════════════════════════════════════════ */

function InsightItem({ item }: { item: any }) {
  const text = item.text || item.value || item.description || item.content || ''
  const source = item.ref?.agent || item.source || ''
  return (
    <div style={{
      background: 'rgba(82, 196, 26, 0.06)',
      borderRadius: 8,
      padding: '10px 16px',
      borderLeft: '3px solid rgba(82, 196, 26, 0.4)',
    }}>
      <div style={{ color: '#333', fontSize: 14, lineHeight: 1.7 }}>
        {text}
      </div>
      {source && (
        <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
          来源: {source}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   CSS 动画注入
   ═══════════════════════════════════════════════════════════ */

if (typeof document !== 'undefined') {
  if (!document.getElementById('cinematic-report-css')) {
    const style = document.createElement('style')
    style.id = 'cinematic-report-css'
    style.textContent = `
      @keyframes cinFadeInUp {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes cinSectionReveal {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .cin-report-section {
        animation: cinSectionReveal 0.6s ease forwards;
      }
    `
    document.head.appendChild(style)
  }
}
