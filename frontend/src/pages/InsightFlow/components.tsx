/**
 * InsightFlow v4.1 子组件合集
 * 从 InsightFlow.tsx 拆分的纯展示组件
 */
import React, { useState, useRef, useEffect } from 'react'
import { Typography, Card, Button, Tag, Tabs, Upload } from 'antd'
import {
  CloudUploadOutlined, BulbOutlined, FilePdfOutlined,
  TeamOutlined, CheckCircleFilled, ExclamationCircleFilled,
  PlusOutlined,
} from '@ant-design/icons'
import type { AgentThinking, ChatMessage } from './types'
import MarkdownText, { mdToHtml } from './utils/markdown'
import { ReasoningPanel, DataDetectivePanel, EvolutionCard } from './ProvenancePanel'
import { useResponsive } from './useResponsive'

const { Title, Text } = Typography
const { Dragger } = Upload

/** 欢迎 + 上传区 — 磨砂白风格 */
export function WelcomeUpload({ onUpload, onUploadMulti, uploadProps, multiUploadProps, dataInfo, fileNames }: {
  onUpload: (f: File) => void
  onUploadMulti?: (files: File[]) => void
  uploadProps: any
  multiUploadProps?: any
  dataInfo?: { rows: number; cols: number; quality?: number } | null
  fileNames?: string[]
}) {
  const [hover, setHover] = React.useState<string | null>(null)
  const responsive = useResponsive()
  const hasUploaded = dataInfo && fileNames && fileNames.length > 0

  // 6个Agent的图片和名称，从 public/agents/ 加载
  const agents = [
    { src: '/agents/1.png', name: '陈', color: '#3B82F6' },
    { src: '/agents/2.png', name: '林', color: '#10B981' },
    { src: '/agents/3.png', name: '王', color: '#8B5CF6' },
    { src: '/agents/4.png', name: '赵', color: '#F59E0B' },
    { src: '/agents/5.png', name: '检', color: '#EF4444' },
    { src: '/agents/6.png', name: '李', color: '#06B6D4' },
  ]

  React.useEffect(() => {
    if (document.getElementById('upload-agents')) return
    const s = document.createElement('style')
    s.id = 'upload-agents'
    s.textContent = `
      @keyframes agent-idle {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
      .agent-peek { animation: agent-idle 3s ease-in-out infinite; }
      .ap1{animation-delay:0s} .ap2{animation-delay:.5s} .ap3{animation-delay:1s}
      .ap4{animation-delay:1.5s} .ap5{animation-delay:2s} .ap6{animation-delay:2.5s}
    `
    document.head.appendChild(s)
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      padding: responsive.isMobile ? '20px 16px' : '0 24px',
      position: 'relative',
      overflowY: 'auto',
    }}>
      {/* 标题区 */}
      <div style={{ textAlign: 'center', marginBottom: responsive.isMobile ? 20 : 36, flexShrink: 0 }}>
        <h1 style={{
          margin: 0,
          fontSize: responsive.isMobile ? 18 : 26,
          fontWeight: 700, color: '#0F172A',
          letterSpacing: '-0.5px', lineHeight: 1.5,
        }}>
          丢一个文件进来，<br/>剩下的事我们来做
        </h1>
      </div>

      {/* ── Agent半身探出（卡片后面） ── */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: responsive.isMobile ? 340 : 480,
      }}>
        {/* Agent 头像 */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: responsive.isMobile ? 6 : 10,
          marginBottom: -12, pointerEvents: 'none', position: 'relative',
          zIndex: 0,
        }}>
          {agents.map((a, i) => (
            <div
              key={a.name}
              className={`agent-peek ap${i + 1}`}
            >
              <img
                src={a.src}
                alt={a.name}
                style={{
                  width: responsive.isMobile ? 36 : 48, height: 'auto', display: 'block',
                  opacity: 0.85,
                }}
                loading="lazy"
              />
            </div>
          ))}
        </div>

        {/* 拖拽卡片 */}
        <div
          style={{
            width: '100%', borderRadius: 16, overflow: 'visible',
            marginBottom: 12, transition: 'all 0.3s ease', position: 'relative',
            transform: hover === 'single' ? 'translateY(-2px)' : 'none',
            boxShadow: hover === 'single'
              ? '0 8px 30px rgba(59,130,246,0.1), 0 0 0 2px rgba(59,130,246,0.15)'
              : '0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.06)',
            background: '#fff',
            zIndex: 1,
          }}
          onMouseEnter={() => setHover('single')}
          onMouseLeave={() => setHover(null)}
        >
          <Dragger
            {...uploadProps}
            showUploadList={false}
            style={{
              background: 'transparent', border: 'none',
              padding: responsive.isMobile ? '20px 14px 16px' : '28px 24px 24px',
              borderRadius: 16,
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '4px 0',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <CloudUploadOutlined style={{ fontSize: 20, color: '#3B82F6' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>
                  拖拽文件到此处，或点击选择
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>
                  支持 Excel、CSV、JSON、PDF、Word
                </div>
              </div>
            </div>
          </Dragger>
        </div>
      </div>

      {/* 数据状态 / 多文件上传提示 — 上传成功后这里变成数据信息 */}
      {hasUploaded ? (
        <div style={{
          marginBottom: 16, padding: '10px 20px',
          background: 'rgba(59,130,246,0.06)', borderRadius: 8,
          border: '1px solid rgba(59,130,246,0.12)',
          display: 'flex', alignItems: 'center', gap: 12,
          flexWrap: 'wrap', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
            📄 {fileNames[0]}{fileNames.length > 1 ? ` 等${fileNames.length}个文件` : ''}
          </span>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            {dataInfo.rows} 行 × {dataInfo.cols} 列
          </span>
          {dataInfo.quality != null && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: dataInfo.quality >= 80 ? '#10B981' : dataInfo.quality >= 60 ? '#F59E0B' : '#EF4444',
            }}>
              质量 {dataInfo.quality}%
            </span>
          )}
        </div>
      ) : (
        /* 多文件对比 — 未上传时显示 */
        onUploadMulti && multiUploadProps && (
          <div
            onMouseEnter={() => setHover('multi')}
            onMouseLeave={() => setHover(null)}
            style={{ marginBottom: 24 }}
          >
            <Dragger
              {...multiUploadProps}
              showUploadList={false}
              style={{ background: 'transparent', border: 'none', padding: 0 }}
            >
              <span style={{
                fontSize: 13, color: hover === 'multi' ? '#3B82F6' : '#94A3B8',
                cursor: 'pointer', transition: 'color 0.2s',
              }}>
                需要对比多个文件？批量上传
              </span>
            </Dragger>
          </div>
        )
      )}

      {/* 底部能力点 */}
      <div style={{ marginTop: 'auto', display: 'flex', gap: responsive.isMobile ? 24 : 40, paddingBottom: responsive.isMobile ? 16 : 0 }}>
        {[
          { label: '结构化报告', sub: '而非原始数据' },
          { label: '策略建议', sub: '可落地的行动项' },
        ].map(item => (
          <div key={item.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 2 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 11, color: '#CBD5E1' }}>{item.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 上传中 */
export function UploadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: 16 }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid #E2E8F0', borderTopColor: '#3B82F6',
        className: 'if-spin',
      }} />
      <Text style={{ color: '#475569', fontSize: 14 }}>正在读取和分析数据结构...</Text>
    </div>
  )
}

/** 用户消息气泡 */
export function UserBubble({ content }: { content: string }) {
  return (
    <div className="if-fade-in-up" style={{
      display: 'flex', justifyContent: 'flex-end', margin: '8px 0',
    }}>
      <div style={{
        maxWidth: '85%', padding: '10px 16px',
        borderRadius: '16px 16px 4px 16px',
        background: '#1E40AF', color: '#FFFFFF',
        fontSize: 14, lineHeight: 1.6,
        boxShadow: '0 1px 4px rgba(30,64,175,0.15)',
      }}>
        {content}
      </div>
    </div>
  )
}

/** 系统消息 */
export function SystemBubble({ content }: { content: string }) {
  return (
    <div className="if-fade-in" style={{ textAlign: 'center', margin: '10px 0' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 14px',
        background: '#F1F5F9', borderRadius: 20,
        fontSize: 12, color: '#64748B',
      }}>
        {content}
      </span>
    </div>
  )
}

/** Agent实时思考面板 */
export function AgentThinkingPanel({ agents }: { agents: Record<string, AgentThinking> }) {
  const list = Object.values(agents)
  const activeCount = list.filter(a => a.isStreaming).length

  return (
    <div className="if-fade-in" style={{
      background: '#FFFFFF', borderRadius: 14,
      border: '1px solid #E8ECF1',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid #F1F5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamOutlined style={{ color: '#64748B', fontSize: 13 }} />
          <Text style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
            分析团队
          </Text>
          {activeCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 11, color: '#3B82F6', marginLeft: 4,
            }}>
              <span className="agent-dot" style={{ background: '#3B82F6' }} />
              <span className="agent-dot" style={{ background: '#3B82F6' }} />
              <span className="agent-dot" style={{ background: '#3B82F6' }} />
              {activeCount} 位分析中
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: 12 }}>
        {list.map(agent => (
          <div key={agent.role} style={{
            marginBottom: list.indexOf(agent) < list.length - 1 ? 12 : 0,
            paddingBottom: list.indexOf(agent) < list.length - 1 ? 12 : 0,
            borderBottom: list.indexOf(agent) < list.length - 1 ? '1px solid #F8FAFC' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>{agent.icon}</span>
              <Text style={{ fontSize: 13, fontWeight: 600, color: agent.color }}>
                {agent.name}
              </Text>
              {agent.isStreaming && (
                <span style={{
                  fontSize: 10, padding: '1px 8px', borderRadius: 10,
                  background: agent.color + '12', color: agent.color,
                  fontWeight: 500,
                }}>
                  分析中
                </span>
              )}
              {!agent.isStreaming && agent.text && (
                <CheckCircleFilled style={{ fontSize: 12, color: '#10B981' }} />
              )}
            </div>

            <div style={{
              fontSize: 13, lineHeight: 1.8, color: '#334155',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              paddingLeft: 28,
            }}>
              {agent.text ? (
                <>
                  <MarkdownText text={agent.text} />
                  {agent.isStreaming && <span className="if-cursor">▎</span>}
                </>
              ) : agent.isStreaming ? (
                <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                  <div className="if-shimmer" style={{ width: '80%', height: 12 }} />
                  <div className="if-shimmer" style={{ width: '60%', height: 12 }} />
                  <div className="if-shimmer" style={{ width: '70%', height: 12 }} />
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Agent分析结果卡片 */
export function AgentResultCard({ message }: { message: ChatMessage }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.classList.add('if-fade-in-up')
    }
  }, [])

  return (
    <div ref={ref} style={{
      margin: '12px 0', background: '#FFFFFF',
      borderRadius: 12, border: '1px solid #E8ECF1',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid #F8FAFC',
      }}>
        <span style={{ fontSize: 16 }}>{message.agentIcon || '🤖'}</span>
        <Text style={{ fontSize: 13, fontWeight: 600, color: message.agentColor || '#475569' }}>
          {message.agentName}
        </Text>
        <Text style={{ fontSize: 10, color: '#94A3B8', marginLeft: 'auto' }}>{message.timestamp}</Text>
      </div>
      <div style={{ padding: '12px 16px', fontSize: 13, lineHeight: 1.8, color: '#334155' }}>
        <MarkdownText text={message.content} />
      </div>
    </div>
  )
}

/** 质量审查卡片（支持结构化 pass/fail 数据 + 纯文本 fallback） */
export function ReviewCard({ message }: { message: ChatMessage }) {
  // 支持两种格式：
  // 1. 结构化: { pass_items: [], fail_items: [], score: number, summary: string }
  // 2. 纯文本: message.content 为普通 Markdown 文本
  let structured: { pass_items?: string[]; fail_items?: string[]; score?: number; summary?: string; items?: any[] } | null = null
  try {
    if (message.content?.trim().startsWith('{')) {
      structured = JSON.parse(message.content)
    }
  } catch { /* 纯文本 fallback */ }

  if (structured) {
    const { pass_items = [], fail_items = [], score, summary } = structured
    const passed = fail_items.length === 0
    const cardBg = passed ? '#F0FDF4' : '#FFF7F7'
    const cardBorder = passed ? '#BBF7D0' : '#FECACA'
    const accentColor = passed ? '#16A34A' : '#EF4444'

    return (
      <div className="if-fade-in-up" style={{
        margin: '12px 0', background: cardBg,
        borderRadius: 12, border: `1px solid ${cardBorder}`,
        overflow: 'hidden',
      }}>
        {/* 头部 */}
        <div style={{
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: `1px solid ${passed ? '#DCFCE7' : '#FEE2E2'}`,
          background: passed ? 'rgba(22,163,74,0.05)' : 'rgba(239,68,68,0.05)',
        }}>
          {passed
            ? <CheckCircleFilled style={{ color: accentColor, fontSize: 14 }} />
            : <ExclamationCircleFilled style={{ color: accentColor, fontSize: 14 }} />
          }
          <Text style={{ fontSize: 13, fontWeight: 700, color: accentColor }}>
            {message.agentName || '质检官'}
          </Text>
          {score != null && (
            <div style={{
              marginLeft: 'auto', padding: '2px 10px', borderRadius: 20,
              background: `${accentColor}18`, color: accentColor,
              fontSize: 12, fontWeight: 700,
            }}>
              {Math.round(score)}分
            </div>
          )}
          <div style={{
            padding: '2px 10px', borderRadius: 20,
            background: `${accentColor}18`, color: accentColor,
            fontSize: 11, fontWeight: 700,
          }}>
            {passed ? 'PASS' : 'FAIL'}
          </div>
        </div>

        {/* 摘要 */}
        {summary && (
          <div style={{ padding: '10px 16px 0', fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
            {summary}
          </div>
        )}

        {/* 通过项 */}
        {pass_items.length > 0 && (
          <div style={{ padding: '8px 16px 4px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#16A34A', marginBottom: 4 }}>✅ 通过项</div>
            {pass_items.map((item, i) => (
              <div key={i} style={{ fontSize: 12, color: '#166534', paddingLeft: 8, lineHeight: 2 }}>
                · {item}
              </div>
            ))}
          </div>
        )}

        {/* 失败项 */}
        {fail_items.length > 0 && (
          <div style={{ padding: '4px 16px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', marginBottom: 4 }}>❌ 问题项</div>
            {fail_items.map((item, i) => (
              <div key={i} style={{ fontSize: 12, color: '#7F1D1D', paddingLeft: 8, lineHeight: 2 }}>
                · {item}
              </div>
            ))}
          </div>
        )}

        {/* 时间戳 */}
        {message.timestamp && (
          <div style={{ padding: '0 16px 10px', fontSize: 10, color: '#94A3B8' }}>
            {message.timestamp}
          </div>
        )}
      </div>
    )
  }

  // 纯文本 fallback（旧格式兼容）
  return (
    <div className="if-fade-in-up" style={{
      margin: '12px 0', background: '#FFFBFB',
      borderRadius: 12, border: '1px solid #FECACA',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid #FEF2F2',
      }}>
        <ExclamationCircleFilled style={{ color: '#EF4444', fontSize: 14 }} />
        <Text style={{ fontSize: 13, fontWeight: 600, color: '#991B1B' }}>
          {message.agentName || '质检官'}
        </Text>
      </div>
      <div style={{ padding: '12px 16px', fontSize: 13, lineHeight: 1.8, color: '#7F1D1D' }}>
        <MarkdownText text={message.content} />
      </div>
      {message.timestamp && (
        <div style={{ padding: '0 16px 10px', fontSize: 10, color: '#94A3B8' }}>
          {message.timestamp}
        </div>
      )}
    </div>
  )
}

/** 报告区域 */
export function ReportSection({ report, onExportPDF, elapsed, reasoningChain, evolution }: {
  report: any; onExportPDF: (el: HTMLDivElement) => void; elapsed: number;
  reasoningChain?: any; evolution?: any;
}) {
  const reportRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const sections = report?.sections || []

  const overviewSection = sections.find((s: any) => s.type === 'metrics' || s.type === 'summary')
  const insightsSection = sections.find((s: any) => s.type === 'insights')
  const hasReasoning = reasoningChain?.steps?.length > 0

  return (
    <div className="if-fade-in-up" style={{ margin: '20px 0' }}>
      <div ref={reportRef} style={{
        background: '#FFFFFF', borderRadius: 14,
        border: '1px solid #E2E8F0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #F1F5F9',
          background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BulbOutlined style={{ color: '#1E40AF', fontSize: 18 }} />
            <Text style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>分析报告</Text>
            {elapsed > 0 && <Tag style={{ fontSize: 10, margin: 0 }} color="blue">{elapsed}s</Tag>}
          </div>
          <Button
            size="small" icon={<FilePdfOutlined />}
            onClick={() => reportRef.current && onExportPDF(reportRef.current)}
            style={{ borderRadius: 6 }}
          >
            导出PDF
          </Button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* 自进化状态 */}
          <EvolutionCard evolution={evolution} />

          <Tabs activeKey={activeTab} onChange={setActiveTab} size="small" items={[
            {
              key: 'overview',
              label: '总览',
              children: overviewSection ? (
                <div style={{ fontSize: 13, lineHeight: 1.8, color: '#334155' }}>
                  <div dangerouslySetInnerHTML={{ __html: mdToHtml(overviewSection.content) }} />
                </div>
              ) : <Text type="secondary" style={{ fontSize: 13 }}>暂无总览</Text>,
            },
            {
              key: 'insights',
              label: '核心发现',
              children: insightsSection ? (
                <div style={{ fontSize: 13, lineHeight: 1.8, color: '#334155' }}>
                  {insightsSection.all?.map((insight: any, i: number) => (
                    <div key={i} style={{
                      padding: '8px 0',
                      borderBottom: i < (insightsSection.all?.length || 0) - 1 ? '1px solid #F8FAFC' : 'none',
                    }}>
                      {insight.category && <Tag style={{ fontSize: 10, marginBottom: 4, borderRadius: 4 }}>{insight.category}</Tag>}
                      <div>{typeof insight === 'string' ? insight : insight.text || insight.content}</div>
                    </div>
                  ))}
                  {!insightsSection.all && (
                    <div dangerouslySetInnerHTML={{ __html: mdToHtml(insightsSection.content) }} />
                  )}
                </div>
              ) : <Text type="secondary" style={{ fontSize: 13 }}>暂无洞察</Text>,
            },
            {
              key: 'raw',
              label: '完整报告',
              children: sections.length > 0 ? (
                <div style={{ fontSize: 13, lineHeight: 1.8, color: '#334155' }}>
                  {sections.map((s: any, i: number) => (
                    <div key={i} style={{ marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 6, fontSize: 14 }}>
                        {s.title || s.type}
                      </div>
                      <div dangerouslySetInnerHTML={{ __html: mdToHtml(s.content) }} />
                    </div>
                  ))}
                </div>
              ) : <Text type="secondary" style={{ fontSize: 13 }}>暂无数据</Text>,
            },
            ...(hasReasoning ? [{
              key: 'provenance',
              label: <span>🔬 溯源</span>,
              children: <ReasoningPanel chain={reasoningChain} />,
            }] : []),
            {
              key: 'detective',
              label: <span>🔍 数据侦探</span>,
              children: <DataDetectivePanel enabled={!!report} />,
            },
          ]} />
        </div>
      </div>
    </div>
  )
}

/** 自定义 Hook：智能滚动（用户上滑时不强制滚动到底部） */
export function useScrollToBottom(deps: any[]) {
  const ref = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleScroll = () => {
      // 距离底部超过120px视为用户主动上滑
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
      userScrolledUpRef.current = !atBottom
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (ref.current && !userScrolledUpRef.current) {
      ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' })
    }
  }, deps)
  return ref
}
