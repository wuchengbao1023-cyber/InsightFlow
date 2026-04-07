/**
 * InsightFlow v5 — 全屏左右分栏 · 多Agent协作 · 多文件对比
 *
 * 交互范式大改：
 * - 左右分栏：左侧WarRoom分析面板 + 右侧对话流（全屏利用）
 * - 分析完成后：全屏专业分析报告弹出
 * - 多文件上传：支持批量上传对比分析
 * - 智能建议：分析完成后给出追问提示
 */

import React, { useState, useRef, useCallback } from 'react'
import {
  Upload, Button, Typography, Space, Tag, Drawer,
  Popconfirm, Tooltip, Input, message,
} from 'antd'
import {
  FileTextOutlined,
  DeleteOutlined, SendOutlined, StopOutlined,
  ThunderboltOutlined,
  ExclamationCircleFilled,
  PlusOutlined,
  BulbOutlined,
  ReloadOutlined,
  TeamOutlined,
  MenuOutlined,
} from '@ant-design/icons'

// 从拆分模块导入
import { API_BASE, SSE_BASE, AGENT_META } from './InsightFlow/constants'
import type { AnalysisRound } from './InsightFlow/types'
import { useScrollToBottom } from './InsightFlow/components'
import {
  WelcomeUpload, UploadingState, UserBubble, SystemBubble,
  ReviewCard, ReportSection,
} from './InsightFlow/components'
import Roundtable from './InsightFlow/Roundtable'
import CinematicReport from './InsightFlow/CinematicReport'
import SmartSuggestions from './InsightFlow/SmartSuggestions'
import TaskDAG from './InsightFlow/TaskDAG'
import { useResponsive } from './InsightFlow/useResponsive'

const { Text } = Typography
const { Dragger } = Upload

// ══════════════════════════════════════════════════════════
// localStorage 持久化
// ══════════════════════════════════════════════════════════
const STORAGE_KEY = 'insightflow_session'

interface PersistedSession {
  fileNames: string[]
  tableName: string
  sessionId: string
  dataInfo: { rows: number; cols: number; quality?: number } | null
  rounds: AnalysisRound[]
  savedAt: number
}

function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as PersistedSession
    // 24小时过期
    if (Date.now() - session.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

function saveSession(data: Omit<PersistedSession, 'savedAt'>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch (e) {
    console.warn('保存会话失败:', e)
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}

// ══════════════════════════════════════════════════════════
// 主组件
// ══════════════════════════════════════════════════════════

export default function InsightFlow() {
  const responsive = useResponsive()

  // ── 会话状态 ──
  const [phase, setPhase] = useState<'welcome' | 'uploading' | 'ready' | 'idle'>('welcome')
  const [fileNames, setFileNames] = useState<string[]>([])
  const [tableName, setTableName] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [dataInfo, setDataInfo] = useState<{ rows: number; cols: number; quality?: number } | null>(null)
  const [error, setError] = useState('')
  const [isMultiFile, setIsMultiFile] = useState(false)

  // ── 对话与分析（不直接恢复，等校验通过后恢复）──
  const [rounds, setRounds] = useState<AnalysisRound[]>([])

  // ── 保存会话到 localStorage ──
  const saveCurrentSession = useCallback(() => {
    saveSession({ fileNames, tableName, sessionId, dataInfo, rounds })
  }, [fileNames, tableName, sessionId, dataInfo, rounds])

  // 监听状态变化，保存当前数据信息（供侧边栏历史查看）
  React.useEffect(() => {
    if (phase === 'ready' && sessionId) {
      saveCurrentSession()
    }
  }, [fileNames, tableName, sessionId, dataInfo, rounds, phase, saveCurrentSession])

  // ── 启动时清理旧session，永远从上传界面开始 ──
  React.useEffect(() => {
    clearSession()
  }, [])

  // ── 对话与分析 ──
  const [question, setQuestion] = useState('')
  const [reasoningChain, setReasoningChain] = useState<any>(null)
  const [evolution, setEvolution] = useState<any>(null)
  const [taskPoolState, setTaskPoolState] = useState<{ total: number; completed: number; running: number }>({ total: 0, completed: 0, running: 0 })
  const [dagData, setDagData] = useState<{ nodes: any[]; edges: any[] } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const roundsRef = useRef<AnalysisRound[]>([])
  roundsRef.current = rounds

  // ── 专业分析报告 ──
  const [showCinematic, setShowCinematic] = useState(false)
  const [cinematicRound, setCinematicRound] = useState<AnalysisRound | null>(null)

  // ── 当前活跃的分析轮次 ──
  const activeRound = rounds.length > 0 ? rounds[rounds.length - 1] : null
  const isActive = activeRound?.status === 'active'
  const scrollRef = useScrollToBottom([rounds, activeRound?.status])

  const [drawerVisible, setDrawerVisible] = useState(false)

  // ── 多文件上传 ──
  const handleUploadMulti = useCallback(async (files: File[]) => {
    if (files.length < 2) {
      message.warning('多文件对比分析至少需要2个文件')
      return
    }
    if (files.length > 10) {
      message.warning('最多同时上传10个文件')
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setPhase('uploading')
    setError('')
    setRounds([])
    setIsMultiFile(true)
    setUploadProgress(`正在上传 ${files.length} 个文件...`)

    const fd = new FormData()
    files.forEach(f => fd.append('files', f))

    try {
      setUploadProgress('正在读取和分析数据结构...')
      const resp = await fetch(`${API_BASE}/upload/multi`, {
        method: 'POST', body: fd, signal: abortRef.current.signal,
      })
      if (!resp.ok) throw new Error(`上传失败: ${resp.statusText}`)

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        let ev = '', dt = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) ev = line.slice(7).trim()
          else if (line.startsWith('data: ')) dt = line.slice(6).trim()
          else if (line === '' && ev && dt) {
            try {
              const data = JSON.parse(dt)
              if (ev === 'data_ready') {
                const names = data.file_names || [data.filename]
                setUploadProgress('数据就绪！')
                message.success(`上传成功！${names.length} 个文件，${data.total_rows} 行 × ${data.total_columns} 列`)
                setFileNames(names)
                setTableName(data.table_name)
                setSessionId(data.session_id || '')
                setDataInfo({ rows: data.total_rows, cols: data.total_columns, quality: data.quality_score })
                setPhase('ready')
              } else if (ev === 'error') {
                const errMsg = data.message || '上传失败'
                setError(errMsg)
                setPhase('welcome')
                setUploadProgress('')
                message.error(errMsg)
              }
            } catch (e) { console.warn('[upload-multi] SSE parse:', e) }
            ev = ''; dt = ''
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return
      const errMsg = e.message || '上传失败'
      setError(errMsg)
      setPhase('welcome')
      setUploadProgress('')
      message.error(errMsg)
    }
  }, [])
  const [uploadProgress, setUploadProgress] = useState('')

  // ── 单文件上传 ──
  const handleUpload = useCallback(async (file: File) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setPhase('uploading')
    setError('')
    setRounds([])
    setIsMultiFile(false)
    setUploadProgress(`正在上传 ${file.name}...`)

    // 缓存检查
    try {
      const { computeFileHash, getCache } = await import('../utils/reportCache')
      const hash = await computeFileHash(file)
      const cached = getCache(hash)
      if (cached) {
        setUploadProgress('命中缓存，正在加载...')
        message.info(`命中缓存（${cached.age}），直接加载报告`)
        setFileNames([file.name])
        setTableName(cached.table_name || '')
        setSessionId(cached.session_id || '')
        setDataInfo(cached.dataInfo || { rows: 0, cols: 0 })
        setPhase('ready')
        setUploadProgress('')
        return
      }
    } catch (e) {
      console.warn('缓存检查失败，继续上传:', e)
    }

    // PII脱敏（仅CSV文件）+ PDF/Word等二进制文件直接上传
    let uploadFile = file
    const isTextFile = file.name.endsWith('.csv') || file.name.endsWith('.json') || file.name.endsWith('.tsv')
    if (isTextFile) {
      try {
        const { sanitizeCsv, getPiiSummary } = await import('../utils/pii')
        setUploadProgress('正在检测敏感信息...')
        const csvText = await file.text()
        const piiResult = sanitizeCsv(csvText)
        if (piiResult.piiCount > 0) {
          message.warning(getPiiSummary(piiResult))
          uploadFile = new File([piiResult.sanitized], file.name, { type: file.type })
        }
      } catch (e) {
        console.warn('PII检测失败，使用原始文件:', e)
      }
    }

    setUploadProgress('正在上传文件...')
    const fd = new FormData()
    fd.append('file', uploadFile)

    try {
      const resp = await fetch(`${API_BASE}/upload`, {
        method: 'POST', body: fd, signal: abortRef.current.signal,
      })
      if (!resp.ok) throw new Error(`上传失败: ${resp.statusText}`)

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      setUploadProgress('正在读取和分析数据结构...')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        let ev = '', dt = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) ev = line.slice(7).trim()
          else if (line.startsWith('data: ')) dt = line.slice(6).trim()
          else if (line === '' && ev && dt) {
            try {
              const data = JSON.parse(dt)
              if (ev === 'data_ready') {
                setUploadProgress('数据就绪！')
                message.success(`上传成功！${data.total_rows} 行 × ${data.total_columns} 列`)
                setFileNames([file.name])
                setTableName(data.table_name)
                setSessionId(data.session_id || '')
                setDataInfo({ rows: data.total_rows, cols: data.total_columns, quality: data.quality_score })
                setPhase('ready')
                setTimeout(() => setUploadProgress(''), 1500)
              } else if (ev === 'progress') {
                setUploadProgress(data.message || '处理中...')
              } else if (ev === 'error') {
                const errMsg = data.message || '上传失败'
                setError(errMsg)
                setPhase('welcome')
                setUploadProgress('')
                message.error(errMsg)
              }
            } catch (e) { console.warn('[upload] SSE parse:', e) }
            ev = ''; dt = ''
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return
      const errMsg = e.message || '上传失败'
      setError(errMsg)
      setPhase('welcome')
      setUploadProgress('')
      message.error(errMsg)
    }
  }, [])

  // 英文key到中文key的映射（在组件外定义，供所有handler复用）
  const EN_TO_CN: Record<string, string> = {
    'DATA_ENGINEER': '老陈',
    'DATA_ANALYST': '老林',
    'FORECAST_ANALYST': '老王',
    'STRATEGY_ADVISOR': '小赵',
    'QUALITY_REVIEWER': '质检官',
    'REPORT_EDITOR': '小李',
  }

  // ══════════════════════════════════════════════════════════
  // RAF 帧同步批量合并 — Vercel AI SDK 架构灵感
  // 高频 thinking_delta 事件在同一帧内合并为一个 setState
  // 典型场景：100ms内收到10个delta → 只触发1次React渲染
  // ══════════════════════════════════════════════════════════
  const deltaBufferRef = useRef<Map<string, string>>(new Map())
  const rafIdRef = useRef<number | null>(null)

  // flush: 把缓冲区中所有 delta 一次性写入 rounds state
  const flushDeltaBuffer = useCallback(() => {
    rafIdRef.current = null
    const buffer = deltaBufferRef.current
    if (buffer.size === 0) return
    
    // 取出所有 delta，清空缓冲区
    const deltas = new Map(buffer)
    buffer.clear()
    
    // 单次 setState 合并所有 pending delta
    setRounds(prev => prev.map(r => {
      let updated = r
      deltas.forEach((delta, agentKey) => {
        const existing = updated.agentThinking[agentKey]
        if (existing) {
          updated = {
            ...updated,
            agentThinking: {
              ...updated.agentThinking,
              [agentKey]: {
                ...existing,
                text: existing.text + delta,
              },
            },
          }
        }
      })
      return updated
    }))
  }, [])

  // scheduleDelta: 缓存 delta，如果还没有 RAF 调度则注册一帧
  const scheduleDelta = useCallback((agentKey: string, delta: string) => {
    const buffer = deltaBufferRef.current
    // 合并到缓冲区（同 agent 的多个 delta 拼接）
    buffer.set(agentKey, (buffer.get(agentKey) || '') + delta)
    
    // 如果当前帧还没有调度 flush，注册下一个动画帧
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushDeltaBuffer)
    }
  }, [flushDeltaBuffer])

  // 组件卸载时清理 RAF
  React.useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  // 处理SSE事件（核心渲染逻辑）
  const processAskEvent = useCallback((event: string, data: any, roundId: string, _startTime: number) => {
    // 辅助函数：将英文 agent key 转为中文
    const toCN = (key: string) => EN_TO_CN[key] || key
    switch (event) {
      case 'team_selected': {
        console.log('[team_selected] agents:', JSON.stringify(data.agents))
        // 支持英文 role 和中文 agent 名两种格式
        const roles = (data.agents || []).map((a: any) => a.role || a.agent || a.name).filter(Boolean)
        const nameStr = (data.agents || []).map((a: any) => {
          const key = a.role || a.agent || a.name || ''
          return (AGENT_META[key]?.name || a.name || key).split(' · ')[0]
        }).join(' + ')
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return {
            ...r,
            selectedRoles: roles,
            messages: [...r.messages, {
              id: `${roundId}-team`,
              type: 'system',
              content: `${nameStr} 组成分析团队`,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            }],
          }
        }))
        break
      }

      // ── agent_message：后端讨论室发的主要事件，驱动 WarRoom ──
      case 'agent_message': {
        const rawAgentKey = data.agent || ''
        const agentKey = toCN(rawAgentKey)
        console.log('[agent_message] agentKey:', rawAgentKey, '→', agentKey, '| data:', JSON.stringify(data).slice(0, 200))
        if (!agentKey || agentKey === 'user' || agentKey === 'system') break
        const meta = AGENT_META[rawAgentKey] || AGENT_META[agentKey] || { name: agentKey, color: data.color || '#64748B', icon: '🤖', desc: '' }
        const fullText: string = data.message || ''
        const mentions: string[] = data.mentions || []

        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          const rolesSet = new Set(r.selectedRoles)
          rolesSet.add(agentKey)
          if (agentKey === '质检官') {
            return {
              ...r,
              selectedRoles: Array.from(rolesSet),
              messages: [...r.messages, {
                id: `${roundId}-guard-${Date.now()}`,
                type: 'review' as const,
                content: fullText,
                agentName: '质检官',
                agentColor: '#EF4444',
                agentIcon: '✅',
                timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
              }],
              agentThinking: {
                ...r.agentThinking,
                [agentKey]: {
                  role: agentKey,
                  name: meta.name,
                  color: meta.color,
                  icon: meta.icon,
                  text: fullText,
                  isStreaming: false,
                  startedAt: Date.now(),
                }
              }
            }
          }
          const newMessages = [...r.messages]
          if (mentions.length > 0) {
            const mentionNames = mentions.map(m => {
              const mMeta = AGENT_META[m]
              return mMeta ? mMeta.name.split(' · ')[0] : toCN(m)
            }).join('、')
            newMessages.push({
              id: `${roundId}-mention-${Date.now()}`,
              type: 'system' as const,
              content: `💬 ${meta.name.split(' · ')[0]} → @${mentionNames}`,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            })
          }
          return {
            ...r,
            selectedRoles: Array.from(rolesSet),
            messages: newMessages,
            agentThinking: {
              ...r.agentThinking,
              [agentKey]: {
                role: agentKey,
                name: meta.name,
                color: meta.color,
                icon: meta.icon,
                text: fullText,
                isStreaming: false,
                startedAt: Date.now(),
              }
            }
          }
        }))
        break
      }

      case 'thinking_start': {
        if (!data || typeof data !== 'object') {
          console.warn('[thinking_start] 收到异常 data，跳过:', data)
          break
        }
        const rawAgentKey = data.agent || ''
        const agentKey = toCN(rawAgentKey)
        console.log('[thinking_start] agentKey:', rawAgentKey, '→', agentKey, '| data:', JSON.stringify(data).slice(0, 200))
        if (!agentKey) break
        const meta = AGENT_META[rawAgentKey] || AGENT_META[agentKey] || { name: data.name || agentKey, color: data.color || '#666', icon: '🤖', desc: '' }
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          const rolesSet = new Set(r.selectedRoles)
          rolesSet.add(agentKey)
          return {
            ...r,
            selectedRoles: Array.from(rolesSet),
            agentThinking: {
              ...r.agentThinking,
              [agentKey]: {
                role: agentKey,
                name: meta.name,
                color: meta.color,
                icon: meta.icon,
                text: '',
                isStreaming: true,
                startedAt: Date.now(),
              },
            },
          }
        }))
        break
      }

      case 'thinking_delta': {
        if (!data || typeof data !== 'object') break
        const rawAgentKey = data.agent || ''
        const agentKey = toCN(rawAgentKey)
        if (!agentKey) break
        const delta = typeof data.delta === 'string' ? data.delta : ''
        // 使用 RAF 帧同步批量合并，而非每个 delta 触发 setState
        scheduleDelta(agentKey, delta)
        break
      }

      case 'thinking_end': {
        if (!data || typeof data !== 'object') break
        const rawAgentKey = data.agent || ''
        const agentKey = toCN(rawAgentKey)
        if (!agentKey) break
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          const thinking = r.agentThinking[agentKey]
          if (!thinking) return r
          return {
            ...r,
            agentThinking: {
              ...r.agentThinking,
              [agentKey]: {
                ...thinking,
                isStreaming: false,
              },
            },
          }
        }))
        break
      }

      case 'collaboration': {
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return {
            ...r,
            messages: [...r.messages, {
              id: `${roundId}-collab-${Date.now()}`,
              type: 'system',
              content: `${data.to_name || '分析师'} 被引用，正在补充分析`,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            }],
          }
        }))
        break
      }

      case 'review_start': {
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return {
            ...r,
            messages: [...r.messages, {
              id: `${roundId}-review-start`,
              type: 'system',
              content: '🔍 质量审查员正在核查分析结论...',
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            }],
          }
        }))
        break
      }

      case 'review_result': {
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return {
            ...r,
            messages: [...r.messages, {
              id: `${roundId}-review`,
              type: 'review',
              content: data.content,
              agentName: '质量审查员',
              agentColor: '#EF4444',
              agentIcon: '🔍',
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            }],
          }
        }))
        break
      }

      case 'report_ready': {
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return { ...r, report: data.report }
        }))
        if (data.reasoning_chain) {
          setReasoningChain(data.reasoning_chain)
        }
        setTimeout(() => {
          const latestRound = roundsRef.current.find(r => r.id === roundId)
          if (latestRound || data.report) {
            setCinematicRound({
              ...(latestRound || { question: '', id: roundId, selectedRoles: [], agentThinking: {}, messages: [], status: 'complete' as const, elapsed: 0 }),
              report: data.report,
              status: 'complete',
            } as AnalysisRound)
            setShowCinematic(true)
          }
        }, 800)
        break
      }

      case 'analysis_complete': {
        const elapsed = (data && data.elapsed_seconds) || 0
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return { ...r, status: 'complete' as const, elapsed }
        }))
        setPhase('ready')
        break
      }

      // ── v5: 多Agent协作事件 ──
      case 'supervisor_decompose': {
        // 主管AI任务分解完成
        const tasks = data?.tasks || []
        const taskListStr = tasks.map((t: any, i: number) =>
          `${i + 1}. ${t.description?.substring(0, 40) || t.type} → ${t.assigned_to}`
        ).join('\n')
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return {
            ...r,
            messages: [...r.messages, {
              id: `${roundId}-supervisor-${Date.now()}`,
              type: 'system',
              content: `🧠 主管AI已分解为 ${tasks.length} 个子任务:\n${taskListStr}`,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            }],
          }
        }))
        break
      }

      case 'task_pool_update': {
        // 任务池状态更新（进度追踪 + DAG 数据）
        const phase = data?.phase || ''
        const pool = data?.pool || {}
        if (phase === 'initialized') {
          setTaskPoolState({ total: pool.total || 0, completed: 0, running: 0 })
        } else if (phase === 'task_completed') {
          setTaskPoolState(prev => ({
            ...prev,
            completed: prev.completed + 1,
            running: Math.max(0, prev.running - 1),
          }))
        } else if (phase === 'task_started') {
          setTaskPoolState(prev => ({
            ...prev,
            running: prev.running + 1,
          }))
        } else if (phase === 'correction_created') {
          // v5.1: 修正任务创建
          setRounds(prev => prev.map(r => {
            if (r.id !== roundId) return r
            return {
              ...r,
              messages: [...r.messages, {
                id: `${roundId}-correction-${Date.now()}`,
                type: 'system',
                content: `🔄 创建修正任务: ${data?.reason || '辩论发现问题'}...`,
                timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
              }],
            }
          }))
        }
        // 存储最新 DAG 数据
        if (data?.dag?.nodes?.length > 0) {
          setDagData(data.dag)
        }
        break
      }

      case 'debate_start': {
        // 辩论开始
        const participants = data?.participants || []
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return {
            ...r,
            messages: [...r.messages, {
              id: `${roundId}-debate-start`,
              type: 'system',
              content: '⚖️ 质量辩论开始 — ' + (data.message || '质检官正在审查...'),
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            }],
          }
        }))
        break
      }

      case 'debate_challenge_start': {
        // 辩论：质检官开始质疑
        // thinking_start 已在通用逻辑中处理
        break
      }

      case 'debate_challenge_end': {
        // 辩论：质检官质疑结束
        break
      }

      case 'debate_end': {
        // 辩论结束
        const verdict = data?.verdict || '未知'
        const rounds = data?.total_rounds || 0
        const issuesTotal = data?.issues_total || 0
        const resolved = data?.issues_resolved || 0
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return {
            ...r,
            messages: [...r.messages, {
              id: `${roundId}-debate-end`,
              type: 'system',
              content: `⚖️ 辩论结束：${verdict}（${rounds}轮辩论，${issuesTotal}个问题，${resolved}个已解决）`,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            }],
          }
        }))
        break
      }

      case 'system': {
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return {
            ...r,
            messages: [...r.messages, {
              id: `${roundId}-sys-${Date.now()}`,
              type: 'system',
              content: data.message,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            }],
          }
        }))
        break
      }

      case 'evolution': {
        setEvolution(data)
        setRounds(prev => prev.map(r => {
          if (r.id !== roundId) return r
          return {
            ...r,
            messages: [...r.messages, {
              id: `${roundId}-evo-${Date.now()}`,
              type: 'system',
              content: `🧬 Agent自进化：新增${data.new_lessons}条经验，累计${data.total_lessons}条`,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            }],
          }
        }))
        break
      }

      case 'error': {
        const errMsg = (data && typeof data === 'object')
          ? (data.message || data.msg || data.error || '分析出错')
          : (typeof data === 'string' ? data : '分析出错')
        const errType = (data && typeof data === 'object') ? (data.type || '') : ''
        console.warn('[InsightFlow error event]', 'msg:', errMsg, 'type:', errType)
        setError(errMsg)
        setRounds(prev => prev.map(r => r.id === roundId ? { ...r, status: 'complete' as const } : r))
        if (errType === 'session_not_ready' || String(errMsg).includes('上传')) {
          // session 失效 → 清除本地缓存，回到 welcome 重新上传
          clearSession()
          setFileNames([])
          setTableName('')
          setSessionId('')
          setDataInfo(null)
          setPhase('welcome')
          message.error('数据会话已过期，请重新上传文件')
        } else {
          setPhase('ready')
          message.error(errMsg)
        }
        break
      }
    }
  }, [])

  // ── 提问 → 分析 ──
  const handleAsk = useCallback(async (customQuestion?: string) => {
    const q = (customQuestion || question).trim()
    if (!q || phase !== 'ready') return

    // ── 提问前快速校验 session 是否有效 ──
    try {
      const statusResp = await fetch(`${API_BASE}/status`)
      const statusData = await statusResp.json()
      if (!statusData.session || !statusData.session.session_id) {
        // 后端 session 丢失 → 强制回到 welcome
        clearSession()
        setFileNames([])
        setTableName('')
        setSessionId('')
        setDataInfo(null)
        setPhase('welcome')
        message.error('后端会话已过期，请重新上传文件')
        return
      }
    } catch {
      // 网络异常不阻断，让后续 fetch 报错即可
    }

    setQuestion('')
    setError('')
    lastQuestionRef.current = q  // 记住问题，停止后可恢复

    const roundId = `${Date.now()}`
    const newRound: AnalysisRound = {
      question: q, id: roundId,
      selectedRoles: [],
      agentThinking: {},
      messages: [
        {
          id: `${roundId}-user`,
          type: 'user', content: q,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        },
      ],
      report: null, status: 'active', elapsed: 0,
    }
    setRounds(prev => [...prev, newRound])
    setReasoningChain(null)
    setEvolution(null)
    setTaskPoolState({ total: 0, completed: 0, running: 0 })
    setDagData(null)

    const oldRef = abortRef.current as any
    if (oldRef?.close) oldRef.close()
    else if (oldRef?.abort) oldRef.abort()
    abortRef.current = null
    setPhase('idle')

    const startTime = Date.now()

    try {
      // ── 使用 EventSource（浏览器原生SSE）替代 fetch + ReadableStream ──
      // EventSource 原生支持 SSE 协议，不存在跨域流式截断问题
      const params = new URLSearchParams({
        question: q,
        table_name: tableName || '',
        session_id: sessionId || '',
      })
      const sseUrl = `${SSE_BASE}/ask/stream?${params.toString()}`
      console.log('[SSE] EventSource connecting:', sseUrl)

      const es = new EventSource(sseUrl)
      abortRef.current = { abort: () => es.close() } as any

      es.addEventListener('system', (e) => {
        try {
          const data = JSON.parse(e.data)
          console.log('[InsightFlow SSE] system', data)
          processAskEvent('system', data, roundId, startTime)
        } catch (err) {
          console.error('[SSE] system parse error:', err)
        }
      })

      es.addEventListener('team_selected', (e) => {
        try {
          const data = JSON.parse(e.data)
          console.log('[InsightFlow SSE] team_selected', data)
          processAskEvent('team_selected', data, roundId, startTime)
        } catch (err) {
          console.error('[SSE] team_selected parse error:', err)
        }
      })

      es.addEventListener('thinking_start', (e) => {
        try {
          const data = JSON.parse(e.data)
          console.log('[InsightFlow SSE] thinking_start', data)
          processAskEvent('thinking_start', data, roundId, startTime)
        } catch (err) {
          console.error('[SSE] thinking_start parse error:', err)
        }
      })

      es.addEventListener('thinking_delta', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('thinking_delta', data, roundId, startTime)
        } catch (err) {
          // thinking_delta 高频事件，静默忽略解析错误
        }
      })

      es.addEventListener('thinking_end', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('thinking_end', data, roundId, startTime)
        } catch (err) {
          console.error('[SSE] thinking_end parse error:', err)
        }
      })

      es.addEventListener('agent_message', (e) => {
        try {
          const data = JSON.parse(e.data)
          console.log('[InsightFlow SSE] agent_message', data.agent, JSON.stringify(data).slice(0, 150))
          processAskEvent('agent_message', data, roundId, startTime)
        } catch (err) {
          console.error('[SSE] agent_message parse error:', err)
        }
      })

      es.addEventListener('agent_start', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('agent_start', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('review_start', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('review_start', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('review_result', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('review_result', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('report_ready', (e) => {
        try {
          const data = JSON.parse(e.data)
          console.log('[InsightFlow SSE] report_ready', JSON.stringify(data).slice(0, 200))
          processAskEvent('report_ready', data, roundId, startTime)
        } catch (err) {
          console.error('[SSE] report_ready parse error:', err)
        }
      })

      es.addEventListener('analysis_complete', (e) => {
        try {
          const data = JSON.parse(e.data)
          console.log('[InsightFlow SSE] analysis_complete', data)
          processAskEvent('analysis_complete', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('collaboration', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('collaboration', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('evolution', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('evolution', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('turn_highlight', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('turn_highlight', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('discussion_end', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('discussion_end', data, roundId, startTime)
        } catch (err) {}
      })

      // ── v5: 多Agent协作事件 ──
      es.addEventListener('supervisor_decompose', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('supervisor_decompose', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('task_pool_update', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('task_pool_update', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('debate_start', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('debate_start', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('debate_end', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('debate_end', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('debate_challenge_start', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('debate_challenge_start', data, roundId, startTime)
        } catch (err) {}
      })

      es.addEventListener('debate_challenge_end', (e) => {
        try {
          const data = JSON.parse(e.data)
          processAskEvent('debate_challenge_end', data, roundId, startTime)
        } catch (err) {}
      })

      // 后端业务错误（在 /ask/stream 中 event: error → app_error）
      es.addEventListener('app_error', (e) => {
        try {
          const data = JSON.parse(e.data)
          console.warn('[SSE] app_error:', data)
          processAskEvent('error', data, roundId, startTime)
        } catch (err) {
          console.error('[SSE] app_error parse error:', err)
        }
      })

      // EventSource 内置 error 事件（网络错误、连接断开等）
      es.onerror = () => {
        console.log('[SSE] Connection ended, readyState:', es.readyState)
        es.close()
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        setRounds(prev => prev.map(r => r.id === roundId ? { ...r, status: 'complete' as const, elapsed: parseFloat(elapsed) } : r))
        setPhase('ready')
      }
    } catch (e: any) {
      // EventSource 构造可能抛异常（如无效URL）
      console.error('[SSE] EventSource init error:', e)
      setError(e.message || '分析失败')
      setRounds(prev => prev.map(r => r.id === roundId ? { ...r, status: 'complete' as const } : r))
      setPhase('ready')
    }
  }, [question, phase, tableName])

  // 记住最近的问题，停止后可以重新提问
  const lastQuestionRef = useRef('')

  // ── 停止分析 ──
  const handleStop = useCallback(() => {
    // 1. 关闭 SSE 连接
    const ref = abortRef.current as any
    if (ref?.close) ref.close()
    else if (ref?.abort) ref.abort()
    abortRef.current = null

    // 2. 把当前活跃轮次标记为完成
    setRounds(prev => prev.map(r =>
      r.status === 'active' ? { ...r, status: 'complete' as const } : r
    ))

    // 3. 恢复问题文本到输入框 + ready 状态
    if (lastQuestionRef.current) {
      setQuestion(lastQuestionRef.current)
    }
    setPhase('ready')
    setError('')
    setDagData(null)

    message.info('已停止分析，可重新提问或输入新问题')
  }, [])

  // 清除所有数据，回到上传界面
  const handleClear = useCallback(() => {
    const ref = abortRef.current as any
    if (ref?.close) ref.close()
    else if (ref?.abort) ref.abort()
    clearSession()

    const currentTable = tableName
    setPhase('welcome')
    setRounds([])
    setFileNames([])
    setTableName('')
    setSessionId('')
    setDataInfo(null)
    setReasoningChain(null)
    setEvolution(null)
    setError('')
    setQuestion('')
    setShowCinematic(false)
    setIsMultiFile(false)
    setDagData(null)

    // 同时清除后端持久化 session + 数据表
    fetch(`${API_BASE}/session/clear`, { method: 'POST' }).catch(() => {})
    if (currentTable) {
      fetch(`${API_BASE}/files/${encodeURIComponent(currentTable)}`, { method: 'DELETE' }).catch(() => {})
    }
    message.success('已清空所有数据')
  }, [tableName])

  // 删除指定文档
  const handleDeleteFile = useCallback((index: number) => {
    setFileNames(prev => prev.filter((_, i) => i !== index))
    setTableName('')
    setSessionId('')
    setDataInfo(null)
    setPhase('welcome')
    message.success('文档已移除')
  }, [])

  // ── 智能建议点击 ──
  const handleSuggestionClick = useCallback((q: string) => {
    if (q) handleAsk(q)
  }, [handleAsk])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  // ── 上传属性 ──
  const uploadProps = {
    showUploadList: false,
    beforeUpload: (file: File) => { handleUpload(file); return false },
  }

  const multiUploadProps = {
    showUploadList: false,
    multiple: true,
    beforeUpload: (_file: File, fileList: File[]) => {
      handleUploadMulti(fileList)
      return false
    },
  }

  // ── 渲染 ──

  // ══════════════════════════════════════════════════════════
  // 统一界面：顶栏 + 中间区域 + 底部输入框
  // ══════════════════════════════════════════════════════════

  // 收集所有Agent思考数据（跨轮次），将英文key转换为中文key
  const rawThinking = activeRound?.agentThinking || {}
  const latestThinking: Record<string, any> = {}
  for (const [key, val] of Object.entries(rawThinking)) {
    const cnKey = EN_TO_CN[key] || key  // 英文转中文，如果找不到就用原key
    latestThinking[cnKey] = val
  }
  
  const latestRoles = (activeRound?.selectedRoles || []).map((r: string) => EN_TO_CN[r] || r)
  const hasActivePanel = Object.keys(latestThinking).length > 0

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column', background: '#F5F7FA',
      position: 'relative',
    }}>
      {/* ── 上传进度覆盖层（全屏遮罩） ── */}
      {phase === 'uploading' && uploadProgress && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '4px solid #E2E8F0', borderTopColor: '#3B82F6',
            className: 'if-spin',
          }} />
          <Text style={{ color: '#334155', fontSize: 15, fontWeight: 500 }}>{uploadProgress}</Text>
          <Text style={{ color: '#94A3B8', fontSize: 12 }}>请稍候，正在处理您的数据...</Text>
        </div>
      )}

      {/* ── 顶栏 ── */}
      <header style={{
        height: responsive.isMobile ? 44 : 48, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        padding: responsive.isMobile ? '0 12px' : '0 20px',
        background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #E8ECF1', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: responsive.isMobile ? 6 : 12 }}>
          <TeamOutlined style={{ color: '#3B82F6', fontSize: responsive.isMobile ? 14 : 20 }} />
          <span style={{ fontWeight: 700, fontSize: responsive.isMobile ? 13 : 16, color: '#0F172A' }}>DataMind OS</span>
          {isActive && (
            <Tag color="red" style={{ margin: 0, fontSize: 11 }}>
              <span className="agent-dot" />分析中
            </Tag>
          )}
        </div>

        {/* 文件信息 + 操作按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: responsive.isMobile ? 2 : 8 }}>
          {fileNames.length > 0 && !responsive.isMobile && (
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500, background: 'rgba(0,0,0,0.04)', padding: '3px 8px', borderRadius: 4 }}>
              📄 {fileNames[0]}{fileNames.length > 1 ? (' +' + (fileNames.length - 1)) : ''}
            </span>
          )}
          {fileNames.length > 0 && responsive.isMobile && (
            <span style={{ fontSize: 11, color: '#94A3B8', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📄{fileNames[0]}
            </span>
          )}
          <Button
            size="small"
            type="text"
            icon={<MenuOutlined />}
            style={{ color: '#64748B', fontSize: 14 }}
            onClick={() => setDrawerVisible(true)}
          />
          {fileNames.length > 0 && (
            <Button
              size="small"
              type="text"
              icon={<DeleteOutlined />}
              style={{ color: '#94A3B8', fontSize: 14 }}
              onClick={handleClear}
            />
          )}
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════
          主体区域：
          - 分析中 → 圆桌会议（深色）
          - 空闲 → 上传区 + 数据状态 + 历史记录（浅色磨砂白）
      ═══════════════════════════════════════════════════════ */}
      {isActive ? (
        // ── 分析中：圆桌会议 ──
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#050508', minHeight: 0 }}>
          <TaskDAG dag={dagData} visible={isActive} />
          <Roundtable
            agents={latestThinking}
            selectedRoles={latestRoles}
            isRunning={true}
            messages={activeRound?.messages || []}
            meetingMinutes=""
            fileName={fileNames[0] || '数据文件'}
            fileNames={fileNames}
            phase={phase}
            onUpload={handleUploadMulti}
            rounds={rounds}
            taskPool={taskPoolState}
          />
        </div>
      ) : (
        // ── 空闲态：上传区 + 数据状态（磨砂白） ──
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'flex-start',
          padding: responsive.isMobile ? '16px 16px 8px' : '0 24px',
          overflowY: 'auto',
          minHeight: 0,
          WebkitOverflowScrolling: 'touch',
        }}>
          {/* 上传区 + 数据状态 */}
          <WelcomeUpload
            onUpload={handleUpload}
            onUploadMulti={handleUploadMulti}
            uploadProps={uploadProps}
            multiUploadProps={multiUploadProps}
            dataInfo={dataInfo}
            fileNames={fileNames}
          />

          {/* 已完成的历史分析记录 */}
          {rounds.length > 0 && (
            <div style={{
              width: '100%', maxWidth: responsive.isMobile ? 400 : 520,
              padding: responsive.isMobile ? '0 4px' : '0',
              marginTop: 12,
            }}>
              {rounds.filter(r => r.status === 'complete' || r.status === 'active').map((round, idx) => (
                <div key={round.id} style={{
                  marginBottom: 8, padding: '10px 14px',
                  background: 'rgba(255,255,255,0.8)', borderRadius: 10,
                  border: '1px solid #E8ECF1', cursor: 'pointer',
                  transition: 'box-shadow 0.2s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                  onClick={() => {
                    if (round.report) {
                      setCinematicRound(round)
                      setShowCinematic(true)
                    }
                  }}
                >
                  <div style={{ fontSize: 13, color: '#334155', marginBottom: 2 }}>
                    <span style={{ color: '#94A3B8', marginRight: 8 }}>Q{idx + 1}</span>
                    {round.question}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>
                    {round.messages.length} 条消息 · {round.elapsed}s
                    {round.report && <span style={{ color: '#3B82F6', marginLeft: 12 }}>查看报告 →</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div style={{ color: '#EF4444', fontSize: 13, maxWidth: 400, textAlign: 'center', marginTop: 8 }}>
              <ExclamationCircleFilled style={{ marginRight: 6 }} />{error}
            </div>
          )}
        </div>
      )}

      {/* ── 底部输入框（始终可见，磨砂白底） ── */}
      <div style={{
          padding: responsive.isMobile ? '6px 10px calc(6px + env(safe-area-inset-bottom, 0px))' : '10px 24px 14px',
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid #E8ECF1',
          display: 'flex',
          gap: responsive.isMobile ? 6 : 12,
          alignItems: 'flex-end',
          flexShrink: 0,
          zIndex: 10,
          maxHeight: responsive.isMobile ? '45vh' : 'none',
          overflow: 'hidden',
        }}>
          <Input.TextArea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={fileNames.length > 0 ? "输入你的问题..." : "请先上传数据文件..."}
            disabled={fileNames.length === 0}
            autoSize={{ minRows: 1, maxRows: responsive.isMobile ? 2 : 4 }}
            style={{
              flex: 1,
              background: fileNames.length > 0 ? '#fff' : '#F1F5F9',
              border: '1px solid #E2E8F0',
              color: '#0F172A',
              borderRadius: 10,
              fontSize: responsive.isMobile ? 14 : 16,
            }}
          />
          {isActive ? (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleStop}
              style={{ flexShrink: 0, borderRadius: 10 }}
            >
              {!responsive.isMobile && '停止'}
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => handleAsk()}
              disabled={!question.trim() || fileNames.length === 0}
              style={{ flexShrink: 0, borderRadius: 10, background: '#3B82F6', borderColor: '#3B82F6' }}
            >
              {!responsive.isMobile && '发送'}
            </Button>
          )}
        </div>

      {/* ── 侧边栏：文件管理 + 历史记录 ── */}
      <Drawer
        title="文件与历史"
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={responsive.isMobile ? '85%' : 400}
        styles={{
          header: { background: '#FAFBFD', borderBottom: '1px solid #E8ECF1', color: '#0F172A' },
          body: { padding: 0, background: '#F5F7FA' }
        }}
      >
        {/* 已上传文件区域 */}
        <div style={{ padding: 16, borderBottom: '1px solid #E8ECF1' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>
            📁 已上传文件 ({fileNames.length})
          </div>
          {fileNames.length > 0 ? (
            fileNames.map((name, idx) => (
              <div key={idx} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '10px 12px', 
                background: '#fff', 
                borderRadius: 8,
                marginBottom: 8,
                border: '1px solid #E8ECF1'
              }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </div>
                  {dataInfo && idx === 0 && (
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                      {dataInfo.rows} 行 · {dataInfo.cols} 列
                    </div>
                  )}
                </div>
                <Button 
                  type="text" 
                  size="small" 
                  icon={<DeleteOutlined />}
                  style={{ color: '#EF4444', marginLeft: 8 }}
                  onClick={() => handleDeleteFile(idx)}
                />
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 20 }}>
              暂无上传文件
            </div>
          )}
        </div>

        {/* 分析历史 */}
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>
            📋 分析历史 ({rounds.length})
          </div>
          {rounds.map((round, idx) => (
            <div key={round.id} style={{ 
              marginBottom: 12, 
              padding: 12, 
              background: '#fff', 
              borderRadius: 8,
              border: '1px solid #E8ECF1'
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#0F172A', fontSize: 13 }}>
                问题 {idx + 1}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>{round.question}</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                {round.messages.length} 条消息 · {round.elapsed}s
              </div>
            </div>
          ))}
          {rounds.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 20 }}>
              暂无分析记录
            </div>
          )}
        </div>
      </Drawer>

      {/* ── 专业分析报告弹窗 ── */}
      <CinematicReport
        round={cinematicRound}
        visible={showCinematic}
        onClose={() => setShowCinematic(false)}
      />
    </div>
  )
}
