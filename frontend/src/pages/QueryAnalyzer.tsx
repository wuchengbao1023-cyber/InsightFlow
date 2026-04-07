import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useAnalysisStore, type AnalysisReport, type AgentOutputRecord } from '../store/appStore'
import { MetricCardRow, type MetricCardData } from '../components/analysis/MetricCard'
import InsightChart, { type ChartData } from '../components/analysis/InsightChart'
import DataTable, { type TableData } from '../components/analysis/DataTable'
import InsightList, { type InsightItem } from '../components/analysis/InsightList'

/* ══════════════════════════════════════════════════════════════
   InsightFlow AI · 分析工作台 v5.0
   真SSE流式输出 · 全局持久化 · 页面切换不丢失
   ══════════════════════════════════════════════════════════════ */

// ─── SVG 图标 ─────────────────────────────────────────────────
const Ic = {
  Upload:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  File:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  X:        () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Play:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  Check:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Bar:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Trend:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Brain:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2a4.5 4.5 0 014.5 4.5v1a4.5 4.5 0 01-4.5 4.5H7A4.5 4.5 0 012 7.5v-1A4.5 4.5 0 016.5 2h3z"/><path d="M14.5 10a4.5 4.5 0 014.5 4.5v1A4.5 4.5 0 0114.5 20H12a4.5 4.5 0 01-4.5-4.5v-1A4.5 4.5 0 0112 10h2.5z"/></svg>,
  Doc:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Down:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Reset:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>,
  Warn:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
}

// ─── 类型 ─────────────────────────────────────────────────────
type AgentStatus = 'idle' | 'thinking' | 'writing' | 'done'
type RunState    = 'idle' | 'running' | 'done'

interface AgentOutput {
  agentId:   string
  agentName: string
  agentColor:string
  title:     string
  lines:     string[]        // 最终完整行列表
  streaming: string          // 正在打字的当前行
  done:      boolean
  chartData?: number[]
  statsData?: Record<string, string>
}

// ─── 五智能体定义（Pipeline v2 架构）─────────────────────────
// 指挥官(纯代码) → 哨兵(纯SQL) → 神谕(NL2SQL) → 策略家(纯代码) → 合成者(LLM排版)
const AGENTS = [
  {
    id: 'commander',
    name: '指挥官',
    role: '任务规划 · 模式判断',
    color: '#2563eb',
    icon: <Ic.Brain />,
    title: '任务规划 · 执行蓝图',
    outputLines: (file: string, types: string[]) => [
      `已接收数据源：${file}`,
      `分析维度确认：${types.join('、')}`,
      `任务拆解完成，分配给 4 个子智能体执行`,
      `预计完成时间：约 30 秒`,
      `优先级排序：数据扫描 → NL2SQL → 策略计算 → 报告生成`,
    ],
  },
  {
    id: 'sentinel',
    name: '哨兵',
    role: '数据扫描 · 质量检测',
    color: '#0ea5e9',
    icon: <Ic.Bar />,
    title: '数据质量扫描（纯SQL）',
    chartData: [82, 91, 78, 95, 88, 92, 85, 97],
    statsData: { '数据行数': '-', '字段数': '-', '缺失值': '-', '重复率': '-' },
    outputLines: (file: string) => [
      `扫描完毕：共 - 行 × - 列`,
      `缺失值 -%，重复率 -%`,
      `数据质量评分：- / 100`,
    ],
  },
  {
    id: 'oracle',
    name: '神谕',
    role: 'NL2SQL · 数据查询',
    color: '#6366f1',
    icon: <Ic.Trend />,
    title: '智能查询 · NL2SQL',
    chartData: [40, 45, 42, 58, 63, 61, 72, 75, 70, 84, 89, 96],
    outputLines: () => [
      `正在生成 SQL 查询...`,
      `等待查询执行结果...`,
    ],
  },
  {
    id: 'strategist',
    name: '策略家',
    role: '数据分析 · 行动建议',
    color: '#10b981',
    icon: <Ic.Warn />,
    title: '核心洞察 · 行动建议',
    outputLines: () => [
      `正在分析查询结果...`,
      `等待策略计算完成...`,
    ],
  },
  {
    id: 'synthesizer',
    name: '合成者',
    role: '报告撰写 · 串联结论',
    color: '#f59e0b',
    icon: <Ic.Doc />,
    title: '分析报告 · 执行摘要',
    outputLines: (file: string, types: string[]) => [
      `【核心结论】正在生成分析报告...`,
    ],
  },
]

// ─── 打字机 Hook ──────────────────────────────────────────────
function useTypewriter() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const typeLines = useCallback((
    lines: string[],
    onChar: (lineIdx: number, partial: string, done: boolean) => void,
    speed = 18
  ) => {
    let lineIdx = 0
    let charIdx = 0

    const tick = () => {
      if (lineIdx >= lines.length) {
        onChar(lineIdx, '', true)
        return
      }
      const line = lines[lineIdx]
      charIdx++
      if (charIdx <= line.length) {
        onChar(lineIdx, line.slice(0, charIdx), false)
        timerRef.current = setTimeout(tick, speed)
      } else {
        // 当前行打完，换行
        onChar(lineIdx, line, false) // 确保完整
        lineIdx++
        charIdx = 0
        timerRef.current = setTimeout(tick, speed + 60) // 行间停顿
      }
    }
    timerRef.current = setTimeout(tick, speed)
  }, [])

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { typeLines, cancel }
}

// ─── 迷你柱状图 ───────────────────────────────────────────────
const MiniBar: React.FC<{ values: number[]; color: string; animated?: boolean }> = ({ values, color, animated }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '40px', padding: '0 2px' }}>
    {values.map((v, i) => (
      <div
        key={i}
        style={{
          flex: 1,
          height: animated ? `${v}%` : '0%',
          background: `linear-gradient(to top, ${color}cc, ${color}44)`,
          borderRadius: '2px 2px 0 0',
          transition: animated ? `height ${0.4 + i * 0.06}s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.04}s` : 'none',
        }}
      />
    ))}
  </div>
)

// ─── 流式输出卡片 ─────────────────────────────────────────────
const StreamCard: React.FC<{ output: AgentOutput; isActive: boolean }> = ({ output, isActive }) => {
  const [barAnimated, setBarAnimated] = useState(false)
  useEffect(() => {
    if (output.statsData || output.chartData) {
      const t = setTimeout(() => setBarAnimated(true), 200)
      return () => clearTimeout(t)
    }
  }, [output.statsData, output.chartData])

  return (
    <div style={{
      background: '#101525',
      border: `1px solid ${isActive ? output.agentColor + '55' : output.done ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.07)'}`,
      borderLeft: `3px solid ${output.agentColor}`,
      borderRadius: '4px',
      overflow: 'hidden',
      animation: 'cardIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      boxShadow: isActive ? `0 0 20px ${output.agentColor}22` : 'none',
      transition: 'box-shadow 0.3s, border-color 0.3s',
    }}>
      {/* 卡片头 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 14px',
        background: isActive ? output.agentColor + '0e' : 'rgba(255,255,255,0.015)',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
      }}>
        <span style={{ color: output.agentColor, display: 'flex', alignItems: 'center' }}>{output.agentIcon}</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#eef2ff', letterSpacing: '0.04em' }}>{output.agentName}</span>
        <span style={{ fontSize: '10px', color: '#475569' }}>·</span>
        <span style={{ fontSize: '11px', color: '#94a3b8', flex: 1 }}>{output.title}</span>
        {/* 状态 */}
        {isActive && !output.done && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: output.agentColor }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: output.agentColor, animation: 'pulseDot 0.8s ease-in-out infinite', display: 'inline-block' }} />
            分析中
          </span>
        )}
        {output.done && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#10b981' }}>
            <Ic.Check /> 完成
          </span>
        )}
      </div>

      {/* 数据概览区（数据侦探专用） */}
      {output.statsData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', padding: '12px 14px 0', }}>
          {Object.entries(output.statsData).map(([k, v]) => (
            <div key={k} style={{ background: '#0c1020', borderRadius: '3px', padding: '8px 10px', border: '1px solid rgba(255,255,255,0.055)', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#eef2ff', fontFamily: 'monospace' }}>{v}</div>
              <div style={{ fontSize: '9px', color: '#4b5680', marginTop: '2px' }}>{k}</div>
            </div>
          ))}
        </div>
      )}

      {/* 柱状图（预测先知专用） */}
      {output.chartData && (
        <div style={{ padding: '12px 14px 0' }}>
          <div style={{ fontSize: '10px', color: '#4b5680', marginBottom: '4px' }}>主指标趋势（近{output.chartData.length}期）</div>
          <div style={{ background: '#0c1020', borderRadius: '3px', padding: '8px 10px 4px', border: '1px solid rgba(255,255,255,0.055)' }}>
            <MiniBar values={output.chartData} color={output.agentColor} animated={barAnimated} />
          </div>
        </div>
      )}

      {/* 流式文字区 */}
      <div style={{ padding: '10px 14px 12px' }}>
        {output.lines.map((line, i) => (
          <div key={i} style={{
            fontSize: '12px',
            color: '#cbd5e1',
            lineHeight: '1.8',
            fontFamily: 'monospace',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
          }}>
            <span style={{ color: output.agentColor, flexShrink: 0, fontSize: '10px', marginTop: '3px' }}>›</span>
            <span dangerouslySetInnerHTML={{ __html: renderMd(line) }} />
          </div>
        ))}
        {/* 正在打字的当前行 */}
        {output.streaming && (
          <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.8', fontFamily: 'monospace', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ color: output.agentColor, flexShrink: 0, fontSize: '10px', marginTop: '3px' }}>›</span>
            <span>
              {output.streaming}
              <span style={{ display: 'inline-block', width: '1px', height: '13px', background: output.agentColor, marginLeft: '1px', verticalAlign: 'middle', animation: 'blink 0.7s step-end infinite' }} />
            </span>
          </div>
        )}
        {/* 等待光标（尚未开始打字时） */}
        {!output.streaming && !output.done && output.lines.length === 0 && (
          <div style={{ fontSize: '12px', color: '#334155', lineHeight: '1.8', fontFamily: 'monospace', display: 'flex', gap: '8px' }}>
            <span style={{ color: output.agentColor, fontSize: '10px' }}>›</span>
            <span style={{ display: 'inline-block', width: '1px', height: '13px', background: output.agentColor, marginLeft: '1px', verticalAlign: 'middle', animation: 'blink 0.7s step-end infinite' }} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── API 基础 URL ──────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8001'

// ─── 主组件 ───────────────────────────────────────────────────
const QueryAnalyzer: React.FC = () => {
  const [file, setFile]           = useState<File | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [instruction, setInstruct]= useState('')
  const [runState, setRunState]   = useState<RunState>('idle')
  const [progress, setProgress]   = useState(0)
  const [outputs, setOutputs]     = useState<AgentOutput[]>([])
  const [activeAgent, setActive]  = useState<string | null>(null)
  const [agentStatus, setAgentSt] = useState<Record<string, AgentStatus>>({})
  // 上传状态（支持多文件）
  const [uploadedFiles, setUploadedFiles] = useState<Array<{file: File, tableName: string, rows: number, cols: number}>>([])
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [uploadMsg, setUploadMsg] = useState('')
  // SSE 流式实时文本
  const [streamingText, setStreamingText] = useState<string>('')
  // 是否使用 SSE 模式
  const [sseMode, setSseMode] = useState(false)

  // ★ 数据工作台状态
  const [uiData, setUiData]           = useState<Record<string, any> | null>(null)
  const [currentTableName, setCurrentTableName] = useState<string>('')
  const [drillFilter, setDrillFilter] = useState<string>('')     // 图表下钻过滤值
  const [followUpInput, setFollowUp]  = useState('')              // 追问输入框
  const [followUpLoading, setFollowUpLoading] = useState(false)  // 追问请求中
  const [followUpHistory, setFollowUpHistory] = useState<Array<{
    question: string
    uiData: Record<string, any>
    timestamp: string
  }>>([])  // 追问历史
  
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const outputEndRef  = useRef<HTMLDivElement>(null)
  const { typeLines, cancel } = useTypewriter()

  // 全局持久化
  const { reports, addReport } = useAnalysisStore()

  const isReady = uploadedFiles.length > 0 && uploadStatus === 'done'

  // ── 页面恢复：从 store 加载最近一次分析结果 ──────────────────
  useEffect(() => {
    if (outputs.length > 0 || runState !== 'idle') return // 已有数据不覆盖
    const latest = reports.length > 0 ? reports[0] : undefined
    if (!latest || latest.agentOutputs.length === 0) return
    // 恢复 Agent 输出
    const restored: AgentOutput[] = latest.agentOutputs.map(ao => ({
      agentId: ao.agentId,
      agentName: ao.agentName,
      agentColor: ao.agentColor,
      agentIcon: AGENTS.find(a => a.id === ao.agentId)?.icon || <Ic.Doc />,
      title: ao.title,
      lines: ao.lines,
      streaming: '',
      done: true,
      chartData: ao.chartData,
      statsData: ao.statsData,
    }))
    setOutputs(restored)
    setRunState('done')
    setProgress(100)
    setAgentSt(Object.fromEntries(AGENTS.map(a => [a.id, 'done' as AgentStatus])))
    // 尝试恢复文件信息（仅元数据，不含 File 对象）
    setUploadMsg(latest.rows ? `已载入 ${latest.rows} 行 × ${latest.columns} 列` : latest.fileName)
  }, []) // 只在首次挂载时恢复

  // 滚动到最新输出
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [outputs, streamingText])

  // 选择文件后立即上传（支持多文件）
  const doUpload = useCallback(async (files: FileList | File[]) => {
    setUploadStatus('uploading')
    setUploadMsg(`正在上传 ${files.length} 个文件到分析引擎...`)
    const newFiles: typeof uploadedFiles = []

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      try {
        const formData = new FormData()
        formData.append('file', f)
        const res = await fetch(`${API_BASE}/api/data/upload`, {
          method: 'POST',
          body: formData,
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.detail || '上传失败')
        newFiles.push({ file: f, tableName: json.table_name, rows: json.rows, cols: json.columns })
        setUploadedFiles(prev => [...prev, { file: f, tableName: json.table_name, rows: json.rows, cols: json.columns }])
        setUploadMsg(`已载入 ${newFiles.map(nf => `${nf.rows}行×${nf.cols}列`).join(' | ')}`)
      } catch (e: any) {
        setUploadStatus('error')
        setUploadMsg(`上传失败: ${e.message || e}`)
        return
      }
    }
    setUploadStatus('done')
    setFile(files[0]) // 保持兼容
  }, [])

  // 拖拽（支持多文件）
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files.length > 0) doUpload(e.dataTransfer.files)
  }, [doUpload])

  // 运行分析（优先 SSE 流式 → 降级普通 POST + 本地打字机效果）
  const runAnalysis = async () => {
    if (uploadedFiles.length === 0 || runState === 'running') return
    cancel()
    setRunState('running')
    setOutputs([])
    setProgress(0)
    setActive(null)
    setAgentSt({})
    setStreamingText('')
    setSseMode(false)

    const fileNames = uploadedFiles.map(uf => uf.file.name)
    const tableNames = uploadedFiles.map(uf => uf.tableName)
    const fileNameStr = fileNames.join(' + ')

    // 确定数据源（多文件用第一个，context 里传全部表名）
    const dataSource = tableNames[0] || 'demo_sales'
    const question   = instruction
      ? `${instruction}（数据来源：${fileNameStr}）`
      : `请对数据文件「${fileNameStr}」进行全面分析，包括数据质量检查、描述性统计、关键趋势、异常值，并给出3条业务建议。`

    console.log(`[QueryAnalyzer v5] 数据源: ${dataSource} | 问题: ${question.slice(0, 80)}...`)
    const t0 = Date.now()

    // ══════════════════════════════════════════════════════════
    // 尝试 SSE 流式接口
    // ══════════════════════════════════════════════════════════
    let useRealData = false
    let backendAnswer = ''
    let fullAnswer = '' // SSE 模式下累积的完整回答
    // 后端返回的各 Agent 真实数据
    let sseDoneData: Record<string, any> = {}
    // POST 降级路径的 done 数据
    let postData: Record<string, any> = {}

    try {
      setProgress(5)
      const res = await fetch(`${API_BASE}/api/queries/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          data_source: dataSource,
          context: {
            file_name: fileNameStr,
            table_name: tableNames[0],
            file_names: tableNames,
            data_source_type: tableNames.length > 0 ? 'uploaded_file' : 'demo',
            files_meta: uploadedFiles.map(uf => ({
              file_name: uf.file.name,
              table_name: uf.tableName,
              rows: uf.rows,
              columns: uf.cols
            }))
          }
        })
      })

      if (res.ok && res.body) {
        // ── 真SSE流式模式 ──
        setSseMode(true)
        useRealData = true

        // 先给首席分析师创建一个流式卡片
        const firstAgent = AGENTS[0]
        setActive(firstAgent.id)
        setAgentSt(prev => ({ ...prev, [firstAgent.id]: 'writing' }))
        setOutputs([{
          agentId: firstAgent.id,
          agentName: firstAgent.name,
          agentColor: firstAgent.color,
          agentIcon: firstAgent.icon,
          title: firstAgent.title,
          lines: [],
          streaming: '',
          done: false,
        }])
        setProgress(10)

        // SSE 解析
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6)
              try {
                const data = JSON.parse(dataStr)

                if (currentEvent === 'meta') {
                  // Agent 执行进度
                  if (data.stage === 'agents_done') {
                    setProgress(40)
                  }
                } else if (currentEvent === 'delta') {
                  // 流式文本块 — 实时追加到首席分析师卡片
                  const chunk = data.text || ''
                  fullAnswer += chunk
                  setStreamingText(fullAnswer)
                  setOutputs(prev => prev.map(o =>
                    o.agentId === firstAgent.id
                      ? { ...o, streaming: fullAnswer }
                      : o
                  ))
                } else if (currentEvent === 'done') {
                  // 完成 — 保存后端返回的各 Agent 真实数据
                  sseDoneData = data
                  setProgress(50)
                  // ★ 存储 ui_data 供数据工作台渲染
                  if (data.ui_data && Object.keys(data.ui_data).length > 0) {
                    setUiData(data.ui_data)
                    const tn = data.ui_data.data_source || (data.sentinel_profiles?.[0]?.table_name) || ''
                    if (tn) setCurrentTableName(tn)
                  }
                } else if (currentEvent === 'error') {
                  console.error('[SSE] error:', data.message)
                }
              } catch {
                // 非 JSON 行，忽略
              }
              currentEvent = ''
            }
          }
        }

        // SSE 完成，把完整回答设为 backendAnswer
        // 优先使用 done 事件中的 full_answer（完整叙事），否则用流式摘要
        backendAnswer = sseDoneData.full_answer || fullAnswer
        console.log(`[QueryAnalyzer v5] SSE 完成, answer长度: ${backendAnswer.length}, doneData keys: ${Object.keys(sseDoneData).join(',')}`)
        if (sseDoneData.detective_profile) {
          console.log(`[QueryAnalyzer v5] detective_profile: rows=${sseDoneData.detective_profile.total_rows}, cols=${sseDoneData.detective_profile.total_cols}`)
        }
        if (sseDoneData.sql_data) {
          console.log(`[QueryAnalyzer v5] sql_data: ${sseDoneData.sql_data.length} rows, cols=${JSON.stringify(sseDoneData.sql_columns)}`)
        }
      } else {
        // SSE 不可用，降级到普通 POST
        console.warn(`[QueryAnalyzer v5] SSE 返回 ${res.status}, 降级到普通 POST`)
        setSseMode(false)
      }
    } catch (e) {
      console.warn('[QueryAnalyzer v5] SSE 不可用，降级到普通 POST:', e)
      setSseMode(false)
    }

    // ══════════════════════════════════════════════════════════
    // 降级：普通 POST
    // ══════════════════════════════════════════════════════════
    if (!useRealData) {
      try {
        setProgress(5)
        const res = await fetch(`${API_BASE}/api/queries/natural-language`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            data_source: dataSource,
            context: {
              file_name: fileNameStr,
              table_name: tableNames[0],
              file_names: tableNames,
              data_source_type: tableNames.length > 0 ? 'uploaded_file' : 'demo',
              files_meta: uploadedFiles.map(uf => ({
                file_name: uf.file.name,
                table_name: uf.tableName,
                rows: uf.rows,
                columns: uf.cols
              }))
            }
          })
        })
        if (res.ok) {
          const json = await res.json()
          backendAnswer = json.answer || json.data?.answer || ''
          postData = json // 保存完整后端响应
          useRealData = !!backendAnswer
          console.log(`[QueryAnalyzer v5] POST 完成, answer长度: ${backendAnswer.length}`)
          if (postData.detective_profile) {
            console.log(`[QueryAnalyzer v5] POST detective_profile: rows=${postData.detective_profile.total_rows}`)
          }
          if (postData.sql_data) {
            console.log(`[QueryAnalyzer v5] POST sql_data: ${postData.sql_data.length} rows`)
          }
        } else {
          console.warn(`[QueryAnalyzer v5] 后端返回 ${res.status}, 使用本地模拟`)
        }
      } catch (e) {
        console.warn('[QueryAnalyzer v5] 后端不可用，使用本地模拟:', e)
      }
    }

    setProgress(Math.max(progress, 50))

    // ══════════════════════════════════════════════════════════
    // 为每个 Agent 准备内容行（Pipeline v2 架构）
    // 指挥官(纯代码) → 哨兵(纯SQL) → 神谕(NL2SQL) → 策略家(纯代码) → 合成者(LLM排版)
    // ══════════════════════════════════════════════════════════
    const agentContent: { lines: string[]; chartData?: number[]; statsData?: Record<string, string> }[] = []

    // 合并 SSE 和 POST 的后端数据
    const realData = sseDoneData || postData || {}

    // ── 提取 Pipeline 新字段 ──
    const command = realData.command || {}
    const sentinelProfiles = realData.sentinel_profiles || []  // 2026 v3: 改为数组
    const oracleResults = realData.oracle_results || []        // 2026 v3: 改为数组
    const strategy = realData.strategy || {}
    const synthesizer = realData.synthesizer || {}

    // ── 兼容旧后端字段（detective_profile/sql_data） ──
    const dp = realData.detective_profile || {}
    const hasProfile = !!dp.total_rows
    const hasSqlData = (realData.sql_data || []).length > 0
    const sqlRows = realData.sql_data || []
    const sqlCols = realData.sql_columns || []
    const sqlRowCount = realData.sql_row_count || 0
    const sqlQuery = realData.sql_query || ''

    // 获取哨兵 profile（优先新字段 sentinel_profiles，降级旧字段 detective_profile）
    // 2026 v3: sentinelProfiles 现在是数组
    const mainSentinel = sentinelProfiles.length > 0 ? sentinelProfiles[0] : dp
    const sp = mainSentinel
    const mainTable = sp.table_name || ''
    // 有table_name或total_rows则认为有效（即使是空表也需要展示）
    const hasSentinelData = !!(sp.table_name || sp.total_rows)

    // 获取神谕结果（优先新字段 oracle_results，降级旧字段 sql_data）
    // 2026 v3: oracle_results 现在是数组
    const mainOracle = oracleResults.length > 0 ? oracleResults[0] : {}
    const oracleSqlData = mainOracle.sql_result?.data || sqlRows
    const oracleSqlCols = mainOracle.sql_result?.columns || sqlCols
    const oracleRowCount = mainOracle.sql_result?.row_count || sqlRowCount
    const oracleSql = mainOracle.sql || sqlQuery
    const oracleStatus = mainOracle.status || ''

    const findings = strategy.findings || []
    const suggestions = strategy.suggestions || []
    const bannedWords = synthesizer.banned_words_found || []

    if (useRealData && (backendAnswer || Object.keys(sseDoneData).length > 0)) {
      // ══════════════════════════════════════════════════════
      // Pipeline v2: 每个智能体展示真实流水线数据
      // ══════════════════════════════════════════════════════

      // ── Agent 0: 指挥官 — 任务规划（纯代码，展示执行路径） ──
      const a0: string[] = []
      const cmdMode = command.mode === 'compare' ? '多文件对比' : '单文件分析'
      const cmdKeywords = (command.query_keywords || []).join('、') || '全面分析'
      a0.push(`分析模式：${cmdMode}（${uploadedFiles.length} 个数据源）`)
      a0.push(`提取关键词：${cmdKeywords}`)
      a0.push(`执行路径：指挥官 → 哨兵 → 神谕 → 策略家 → 合成者`)
      const execPath = realData.execution_path
      if (execPath && execPath.length > 0) {
        a0.push(`实际路径：${execPath.join(' → ')}`)
      }
      if (realData.total_ms) a0.push(`总耗时 ${(realData.total_ms / 1000).toFixed(1)}s`)
      if (realData.orchestration === 'pipeline') {
        a0.push(`编排模式：Pipeline 流水线 ✓`)
      }
      agentContent.push({ lines: a0 })

      // ── Agent 1: 哨兵 — 数据质量扫描（纯SQL统计，展示真实数字） ──
      const a1: string[] = []
      const detStats: Record<string, string> = {}
      if (hasSentinelData) {
        const rows = sp.total_rows
        const cols = sp.total_cols
        const miss = sp.missing_pct ?? sp.missing_summary?.missing_pct ?? 0
        const dup = sp.duplicate_pct ?? sp.duplicate_summary?.duplicate_pct ?? 0
        const qual = sp.quality_score ?? sp.data_quality_score ?? 0
        detStats['数据行数'] = `${Number(rows).toLocaleString()} 行`
        detStats['字段数'] = `${cols} 列`
        detStats['缺失值'] = `${miss}%`
        detStats['重复率'] = `${dup}%`
        a1.push(`扫描完毕：${Number(rows).toLocaleString()} 行 × ${cols} 列`)
        a1.push(`缺失值 ${miss}%，重复率 ${dup}%，质量评分 ${qual}/100 ${qual >= 90 ? '✓' : qual >= 70 ? '△' : '⚠'}`)

        // 语义标注列
        const semantic = sp.semantic_columns || {}
        const labeledCols = Object.entries(semantic).filter(([, v]) => v)
        if (labeledCols.length > 0) {
          a1.push(`关键列识别：${labeledCols.map(([k, v]) => `${k}→「${v}」`).join('、')}`)
        }

        // 分类列TOP分布（最多3个）
        const catStats = sp.categorical_stats || {}
        Object.entries(catStats).slice(0, 3).forEach(([col, s]: [string, any]) => {
          a1.push(`「${col}」${s.unique} 类，TOP1「${s.top}」(${s.top_count}条)`)
        })

        // 数值列统计（最多3个）
        const numStats = sp.numeric_stats || {}
        Object.entries(numStats).slice(0, 3).forEach(([col, s]: [string, any]) => {
          a1.push(`「${col}」均值=${s.mean}，范围=[${s.min}, ${s.max}]`)
        })

        // 多文件时展示其他文件概况
        // 2026 v3: sentinelProfiles 是数组
        const otherSentinelProfiles = sentinelProfiles.slice(1)  // 从第二个开始
        if (otherSentinelProfiles.length > 0) {
          a1.push(`── 其他数据源 ──`)
          otherSentinelProfiles.forEach(p => {
            const tableName = p.table_name || '未知表'
            a1.push(`「${tableName}」${p.total_rows}行 × ${p.total_cols}列，质量${p.quality_score || 0}/100`)
          })
        }
      } else {
        detStats['数据行数'] = '-'
        detStats['字段数'] = '-'
        detStats['缺失值'] = '-'
        detStats['重复率'] = '-'
        a1.push('数据扫描完成')
      }
      agentContent.push({ lines: a1, statsData: detStats })

      // ── Agent 2: 神谕 — NL2SQL 查询结果 ──
      const a2: string[] = []
      let chartData: number[] | undefined = undefined

      if (oracleSql) {
        a2.push(`生成 SQL：${oracleSql.length > 120 ? oracleSql.slice(0, 120) + '...' : oracleSql}`)
      }

      if (oracleStatus === 'success' && oracleSqlData.length > 0) {
        a2.push(`查询成功，返回 ${oracleRowCount} 行结果`)

        // 找第一个数值列生成图表
        const numCol = oracleSqlCols.find((c: string) => typeof oracleSqlData[0]?.[c] === 'number')
        if (numCol) {
          const vals = oracleSqlData.map((r: any) => Number(r[numCol])).filter((v: number) => !isNaN(v))
          if (vals.length > 2) {
            const mean = (vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(1)
            a2.push(`数值列「${numCol}」统计：均值=${mean}，范围=[${Math.min(...vals)}, ${Math.max(...vals)}]`)
            const chartVals = vals.slice(-12).map((v: number) => {
              const mn = Math.min(...vals)
              const mx = Math.max(...vals)
              return Math.round(((v - mn) / ((mx - mn) || 1)) * 70 + 15)
            })
            chartData = chartVals.length >= 3 ? chartVals : undefined
          }
        }

        // 展示前5行数据
        a2.push('查询结果（前5行）：')
        oracleSqlData.slice(0, 5).forEach((row: any, i: number) => {
          const rowStr = oracleSqlCols.slice(0, 6).map((c: string) => `${c}=${row[c]}`).join(' | ')
          a2.push(`  ${i + 1}. ${rowStr}`)
        })
        if (oracleRowCount > 5) a2.push(`  ... 共 ${oracleRowCount} 行`)

        // 多文件时展示其他文件查询结果
        // 2026 v3: oracleResults 是数组
        const otherOracleResults = oracleResults.slice(1)  // 从第二个开始
        if (otherOracleResults.length > 0) {
          a2.push(`── 其他数据源查询 ──`)
          otherOracleResults.forEach(o => {
            const rc = o.sql_result?.row_count || 0
            const tableName = o.table_name || '未知表'
            a2.push(`「${tableName}」${o.status === 'success' ? `匹配 ${rc} 条` : o.status === 'empty' ? '无匹配' : `失败: ${o.error || '未知'}`}`)
          })
        }
      } else if (oracleStatus === 'empty') {
        a2.push('⚠️ 查询结果为空：未找到匹配数据')
        // 展示策略家的引导建议
        const emptyFindings = findings.filter(f => f.type === 'empty')
        emptyFindings.forEach(f => a2.push(f.detail))
      } else if (oracleStatus === 'failed') {
        a2.push(`❌ 查询失败：${mainOracle.error || '未知错误'}`)
      } else {
        a2.push('暂无查询数据')
      }

      if (a2.length === 0) a2.push('暂无查询分析数据')
      agentContent.push({ lines: a2, chartData })

      // ── Agent 3: 策略家 — 数据分析 + 行动建议（纯代码计算） ──
      const a3: string[] = []

      // 策略概要
      if (strategy.summary) {
        a3.push(`概要：${strategy.summary}`)
      }

      // 关键发现（排除 sample 和 error 类型，取最重要的）
      const importantFindings = findings.filter(f => !['sample', 'error'].includes(f.type))
      if (importantFindings.length > 0) {
        a3.push(`── 关键发现（${importantFindings.length}项）──`)
        importantFindings.slice(0, 8).forEach((f: any, i: number) => {
          const typeLabel = f.type === 'match' ? '🔍 匹配' : f.type === 'stat' ? '📊 统计' : f.type === 'distribution' ? '📈 分布' : f.type === 'comparison' ? '⚖️ 对比' : f.type === 'empty' ? '⚠️ 无匹配' : '📌'
          a3.push(`${typeLabel} ${f.detail}`)
        })
      }

      // 行动建议
      if (suggestions.length > 0) {
        a3.push(`── 行动建议（${suggestions.length}条）──`)
        suggestions.slice(0, 5).forEach((s: any, i: number) => {
          const confLabel = s.confidence === 'high' ? '🔴 高' : s.confidence === 'medium' ? '🟡 中' : '🟢 低'
          a3.push(`${i + 1}. ${s.action}：${s.detail} [${confLabel}]`)
        })
      }

      if (a3.length === 0) a3.push('暂无分析建议')
      agentContent.push({ lines: a3 })

      // ── Agent 4: 合成者 — 最终分析报告（LLM排版） ──
      const a4: string[] = []
      if (backendAnswer) {
        const paras = backendAnswer.split(/\n+/).filter(p => p.trim().length > 3)
        a4.push(...paras)
      }

      // 禁词检查结果
      if (bannedWords.length > 0) {
        a4.push(`\n⚠️ 禁词检查：发现 ${bannedWords.length} 个模糊词（${bannedWords.join('、')}），结论可能不够精确`)
      }

      // 数据溯源标注
      if (realData.orchestration === 'pipeline') {
        a4.push(`\n📊 数据溯源：所有数字均来自真实SQL查询 | 编排：Pipeline 流水线`)
      }

      agentContent.push({ lines: a4.length > 0 ? a4 : ['分析报告生成完成'] })

    } else {
      // ══════════════════════════════════════════════════════
      // 后端无数据 — 显示等待状态，不使用硬编码假数据
      // ══════════════════════════════════════════════════════
      AGENTS.forEach(agent => {
        if (agent.id === 'sentinel') {
          // 哨兵：如果后端返回了数据，用真实数据
          if (hasSentinelData) {
            const rows = sp.total_rows
            const cols = sp.total_cols
            const miss = sp.missing_pct ?? sp.missing_summary?.missing_pct ?? 0
            const dup = sp.duplicate_pct ?? sp.duplicate_summary?.duplicate_pct ?? 0
            agentContent.push({
              lines: [
                `扫描完毕：${Number(rows).toLocaleString()} 行 × ${cols} 列`,
                `缺失值 ${miss}%，重复率 ${dup}%`,
                `数据质量评分：${sp.data_quality_score ?? sp.quality_score ?? 0}/100`,
              ],
              statsData: {
                '数据行数': `${Number(rows).toLocaleString()} 行`,
                '字段数': `${cols} 列`,
                '缺失值': `${miss}%`,
                '重复率': `${dup}%`,
              },
            })
          } else {
            const noBackend = Object.keys(sseDoneData).length === 0
            agentContent.push({
              lines: [noBackend
                ? '⚠ 未收到后端响应，请确认后端已启动（端口 8001）'
                : '⚠ 后端未执行五段流水线（可能走了旧路径），请检查文件是否正确上传'],
              statsData: { '数据行数': '-', '字段数': '-', '缺失值': '-', '重复率': '-' },
            })
          }
        } else if (agent.id === 'oracle') {
          // 神谕：如果有SQL数据用真实数据
          if (hasSqlData || (oracleStatus === 'success' && oracleSqlData.length > 0)) {
            const numCol = oracleSqlCols.find((c: string) => typeof oracleSqlData[0]?.[c] === 'number')
            if (numCol) {
              const vals = oracleSqlData.map((r: any) => Number(r[numCol])).filter((v: number) => !isNaN(v))
              const chartVals = vals.slice(-12).map((v: number) => {
                const mn = Math.min(...vals); const mx = Math.max(...vals)
                return Math.round(((v - mn) / ((mx - mn) || 1)) * 70 + 15)
              })
              agentContent.push({ lines: ['SQL 查询结果加载中...'], chartData: chartVals.length >= 3 ? chartVals : undefined })
            } else {
              agentContent.push({ lines: ['等待后端数据...'] })
            }
          } else {
            agentContent.push({ lines: ['等待后端数据...'] })
          }
        } else if (agent.id === 'synthesizer') {
          // 合成者：如果有LLM回答就展示
          agentContent.push({
            lines: backendAnswer ? backendAnswer.split(/\n+/).filter(p => p.trim().length > 3) : ['等待后端生成分析报告...'],
          })
        } else if (agent.id === 'strategist') {
          // 策略家：展示findings
          if (findings.length > 0) {
            agentContent.push({
              lines: findings.slice(0, 5).map((f: any, i: number) => `${i + 1}. ${f.detail}`),
            })
          } else {
            agentContent.push({ lines: ['等待后端数据...'] })
          }
        } else {
          // 指挥官
          agentContent.push({
            lines: [
              `已接收数据源：${fileNameStr}`,
              '分析任务已分配，等待后端响应...',
            ],
          })
        }
      })
    }

    // ══════════════════════════════════════════════════════════
    // 依次创建卡片 + 打字机效果
    // ══════════════════════════════════════════════════════════
    // 如果是 SSE 模式，第一个 Agent 已有内容，从第二个开始
    const startIdx = sseMode ? 1 : 0

    // SSE 模式下，先完成第一个 Agent 的卡片（指挥官）
    if (sseMode) {
      const firstAgent = AGENTS[0]
      setAgentSt(prev => ({ ...prev, [firstAgent.id]: 'done' }))
      setOutputs(prev => prev.map(o =>
        o.agentId === firstAgent.id
          ? {
              ...o,
              lines: agentContent[0]?.lines || ['分析完成'],
              streaming: '',
              done: true,
              chartData: agentContent[0]?.chartData,
              statsData: agentContent[0]?.statsData,
            }
          : o
      ))
      setStreamingText('')
      await delay(200)
    } else {
      setOutputs([]) // 清空可能残留的
    }

    for (let i = startIdx; i < AGENTS.length; i++) {
      const agent = AGENTS[i]
      const lines = agentContent[i]?.lines || []

      // 1) 创建空卡片
      setActive(agent.id)
      setAgentSt(prev => ({ ...prev, [agent.id]: 'thinking' }))
      setOutputs(prev => [...prev, {
        agentId:    agent.id,
        agentName:  agent.name,
        agentColor: agent.color,
        agentIcon:  agent.icon,
        title:      agent.title,
        lines:      [],
        streaming:  '',
        done:       false,
        chartData:  agentContent[i]?.chartData,
        statsData:  agentContent[i]?.statsData,
      }])
      await delay(350)

      // 2) 打字机输出
      setAgentSt(prev => ({ ...prev, [agent.id]: 'writing' }))

      await new Promise<void>(resolve => {
        typeLines(lines, (lineIdx, partial, finished) => {
          setOutputs(prev => prev.map(o => {
            if (o.agentId !== agent.id) return o
            if (finished) {
              return { ...o, lines, streaming: '', done: true }
            }
            if (partial === lines[lineIdx]) {
              return { ...o, lines: lines.slice(0, lineIdx + 1), streaming: '' }
            }
            return { ...o, lines: lines.slice(0, lineIdx), streaming: partial }
          }))
          if (finished) {
            setAgentSt(prev => ({ ...prev, [agent.id]: 'done' }))
            resolve()
          }
        }, 18)
      })

      setProgress(Math.round(((i + 1) / AGENTS.length) * 100))
      await delay(250)
    }

    setActive(null)
    setRunState('done')
    const executionMs = Date.now() - t0

    // ══════════════════════════════════════════════════════════
    // 保存到全局 Store（Reports 页面可读取）
    // ══════════════════════════════════════════════════════════
    const reportId = `rpt_${Date.now()}`
    const finalOutputs: AgentOutputRecord[] = AGENTS.map((agent, idx) => ({
      agentId: agent.id,
      agentName: agent.name,
      agentColor: agent.color,
      title: agent.title,
      lines: agentContent[idx]?.lines || [],
      chartData: agentContent[idx]?.chartData,
      statsData: agentContent[idx]?.statsData,
    }))

    const report: AnalysisReport = {
      id: reportId,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      fileName: fileNameStr,
      fileKey: `${fileNameStr}_${dataSource}`,
      fileSize: uploadedFiles.reduce((acc, uf) => acc + uf.file.size, 0),
      dataSource,
      instruction,
      useRealData,
      rows: undefined, // 上传时已知但这里不存
      columns: undefined,
      agentOutputs: finalOutputs,
      status: 'complete',
      executionMs,
    }
    addReport(report)
    console.log(`[QueryAnalyzer v5] 报告已保存: ${reportId}`)

    // ★ 如果 SSE 未带回 ui_data，尝试从 realData 构建（降级支持 POST 模式）
    if (!uiData && (realData.sentinel_profiles?.length > 0 || realData.detective_profile?.total_rows)) {
      const mainSp   = (realData.sentinel_profiles || [])[0] || realData.detective_profile || {}
      const mainOr   = (realData.oracle_results || [])[0] || {}
      const strategy = realData.strategy || {}
      const synth    = realData.synthesizer || {}
      // 从后端数据简单构建一个 ui_data 兜底（用于 POST 模式）
      const fallbackUi: Record<string, any> = {
        metric_cards: [
          { label: '数据总量', value: (mainSp.total_rows || 0).toLocaleString(), sub: `共 ${mainSp.total_cols || 0} 个字段`, color: '#2563eb', icon: 'database' },
        ],
        table: mainOr.sql_result?.data?.length > 0 ? {
          columns: (mainOr.sql_result.columns || []).slice(0, 10).map((c: string) => ({ key: c, title: c, sortable: true, type: 'text' })),
          rows: (mainOr.sql_result.data || []).slice(0, 200),
          total: mainOr.sql_result.row_count || 0,
          page_size: 20,
        } : null,
        insights: (strategy.findings || []).slice(0, 6).map((f: any) => ({
          level: f.severity === 'high' ? 'key' : f.severity === 'medium' ? 'warn' : 'info',
          text: f.detail || '',
          icon: '📌',
        })),
        data_source: mainSp.table_name || '',
        follow_up_suggestions: [],
      }
      setUiData(fallbackUi)
      if (mainSp.table_name && !currentTableName) setCurrentTableName(mainSp.table_name)
    }
  }

  const reset = () => {
    cancel()
    setRunState('idle'); setProgress(0); setOutputs([]); setActive(null); setAgentSt({})
    setUiData(null); setDrillFilter(''); setFollowUp(''); setFollowUpHistory([])
  }

  // ★ 追问函数：在已有数据上追加 SQL 查询
  const doFollowUp = useCallback(async (question: string) => {
    if (!question.trim() || !currentTableName || followUpLoading) return
    setFollowUpLoading(true)
    try {
      // ★ v2：把当前 matched_data 一起发过去，后端可以走快速路径（不重跑 NL2SQL）
      const currentMatchedData = uiData?.table?.rows || []
      const currentMatchedCols = uiData?.table?.columns?.map((c: any) => c.key) || []

      const res = await fetch(`${API_BASE}/api/queries/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          table_name: currentTableName,
          matched_data: currentMatchedData.map((r: any) => {
            // 去掉前端添加的 _id/_highlight 字段
            const { _id, _highlight, ...rest } = r
            return rest
          }),
          matched_cols: currentMatchedCols,
        }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      if (json.ui_data && Object.keys(json.ui_data).length > 0) {
        // 追问成功：把当前 uiData 推入历史，更新为新结果
        setFollowUpHistory(prev => [{
          question,
          uiData: uiData || {},
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        }, ...prev].slice(0, 5))
        setUiData(json.ui_data)
        setDrillFilter('')
        setFollowUp('')
        // 提示用户是否走了快速路径
        if (json.fast_path) {
          console.log('[FollowUp] ⚡ 快速路径响应')
        }
      }
    } catch (e: any) {
      console.error('[FollowUp] 追问失败:', e)
    } finally {
      setFollowUpLoading(false)
    }
  }, [currentTableName, followUpLoading, uiData])

  const statusDot = (id: string) => {
    const s = agentStatus[id]
    if (!s || s === 'idle') return { bg: '#1e293b', glow: 'none', anim: 'none' }
    if (s === 'thinking' || s === 'writing') return { bg: AGENTS.find(a => a.id === id)!.color, glow: `0 0 8px ${AGENTS.find(a => a.id === id)!.color}`, anim: 'pulseDot 0.8s ease-in-out infinite' }
    return { bg: '#10b981', glow: '0 0 6px #10b981', anim: 'none' }
  }

  return (
    <>
      <style>{`
        @keyframes pulseDot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(1.6)} }
        @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes cardIn    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes progGrow  { from{width:0%} to{width:100%} }
        .upload-zone:hover   { border-color: #2563eb !important; background: rgba(37,99,235,0.04) !important; }
        .exec-btn:hover:not(:disabled) { background: rgba(37,99,235,0.12) !important; box-shadow: 0 0 14px rgba(37,99,235,0.3) !important; }
        .example-card:hover  { border-color: rgba(37,99,235,0.4) !important; color: #93c5fd !important; background: rgba(37,99,235,0.06) !important; }
        .agent-row-side:hover{ background: rgba(255,255,255,0.03) !important; }
        textarea:focus       { border-color: #2563eb !important; box-shadow: 0 0 0 2px rgba(37,99,235,0.15) !important; outline: none !important; }
        @media (max-width: 900px) { .side-panel { display: none !important; } }
        @media (max-width: 640px) { .stats-4col { grid-template-columns: repeat(2,1fr) !important; } }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#080b12', color: '#eef2ff', fontFamily: '"Inter","PingFang SC","Microsoft YaHei",sans-serif', display: 'flex', flexDirection: 'column' }}>

        {/* ── 顶栏 ── */}
        <div style={{ height: '48px', background: '#0c1020', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '12px', flexShrink: 0 }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Analysis Workbench</span>
          <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.07)' }} />
          <span style={{ fontSize: '11px', color: '#4b5680' }}>InsightFlow AI · v2026.1</span>
          {runState === 'running' && (
            <>
              <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.07)' }} />
              <span style={{ fontSize: '11px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#2563eb', animation: 'pulseDot 0.8s infinite', display: 'inline-block' }} />
                {AGENTS.find(a => a.id === activeAgent)?.name ?? '初始化'}
                {sseMode && <span style={{ fontSize: '9px', color: '#10b981', fontWeight: 700 }}>· SSE</span>}
                · 分析中
              </span>
            </>
          )}
          {runState === 'done' && (
            <>
              <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.07)' }} />
              <span style={{ fontSize: '11px', color: '#10b981' }}>● 分析完成</span>
              <button onClick={reset} style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569', background: 'none', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '4px', cursor: 'pointer', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
                <Ic.Reset /> 重置工作区
              </button>
            </>
          )}
        </div>

        {/* ── 进度条 ── */}
        <div style={{ height: '2px', background: 'rgba(255,255,255,0.04)', flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#2563eb,#0ea5e9)', transition: 'width 0.6s ease', borderRadius: '2px' }} />
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 50px)' }}>

          {/* ══ 左侧智能体状态列 ══ */}
          <div className="side-panel" style={{ width: '200px', flexShrink: 0, background: '#0c1020', borderRight: '1px solid rgba(255,255,255,0.055)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '13px 14px 9px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', color: '#334155', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
              Agent Pipeline
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
              {AGENTS.map(agent => {
                const s    = agentStatus[agent.id] || 'idle'
                const dot  = statusDot(agent.id)
                const active = s === 'thinking' || s === 'writing'
                return (
                  <div key={agent.id} className="agent-row-side" style={{
                    display: 'flex', alignItems: 'center', gap: '9px',
                    padding: '8px 9px', borderRadius: '3px', marginBottom: '2px',
                    background: active ? agent.color + '0e' : 'transparent',
                    border: `1px solid ${active ? agent.color + '44' : 'transparent'}`,
                    transition: 'all 0.2s', cursor: 'default',
                  }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: dot.bg, boxShadow: dot.glow, animation: dot.anim }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: s === 'idle' ? '#475569' : s === 'done' ? '#10b981' : '#eef2ff', marginBottom: '1px' }}>{agent.name}</div>
                      <div style={{ fontSize: '9px', color: '#334155' }}>{agent.role}</div>
                    </div>
                    <div style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.06em', padding: '1px 5px', borderRadius: '2px', background: s === 'idle' ? '#1e293b' : s === 'done' ? 'rgba(16,185,129,0.12)' : agent.color + '22', color: s === 'idle' ? '#2d3748' : s === 'done' ? '#10b981' : agent.color, border: `1px solid ${s === 'done' ? 'rgba(16,185,129,0.3)' : s === 'idle' ? '#1e293b' : agent.color + '44'}` }}>
                      {s === 'idle' ? 'IDLE' : s === 'thinking' ? 'PREP' : s === 'writing' ? 'PROC' : 'DONE'}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* 进度 */}
            {runState !== 'idle' && (
              <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.055)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '9px', color: '#334155' }}>总进度</span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{progress}%</span>
                </div>
                <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#2563eb,#0ea5e9)', transition: 'width 0.5s ease', borderRadius: '2px' }} />
                </div>
              </div>
            )}
          </div>

          {/* ══ 中央主区 ══ */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* 输入表单区 */}
            <div style={{ background: '#0c1020', borderBottom: '1px solid rgba(255,255,255,0.055)', padding: '14px 18px', flexShrink: 0 }}>
              {/* 上传 */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em', color: '#334155', textTransform: 'uppercase', marginBottom: '7px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Ic.Upload /> 数据源
                </div>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.json" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files && e.target.files.length > 0) doUpload(e.target.files) }} />
                <div
                  className="upload-zone"
                  style={{
                    border: `1px dashed ${dragging ? '#2563eb' : file ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.09)'}`,
                    borderRadius: '4px', padding: '12px 16px', background: file ? 'rgba(16,185,129,0.04)' : '#080b12',
                    cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '10px',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  {file ? (
                    <>
                      <span style={{ color: uploadStatus === 'done' ? '#10b981' : uploadStatus === 'error' ? '#ef4444' : '#60a5fa' }}>
                        <Ic.File />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: uploadStatus === 'done' ? '#10b981' : uploadStatus === 'error' ? '#ef4444' : '#60a5fa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                        <div style={{ fontSize: '10px', color: uploadStatus === 'done' ? '#10b981' : uploadStatus === 'error' ? '#ef4444' : '#94a3b8', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {uploadStatus === 'uploading' && <span style={{ width: '8px', height: '8px', border: '1.5px solid #334155', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />}
                          {uploadMsg}
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#4b5680', fontFamily: 'monospace', flexShrink: 0 }}>{(file.size / 1024).toFixed(1)} KB</span>
                      <button onClick={e => { e.stopPropagation(); setFile(null); setUploadedFiles([]); setUploadStatus('idle'); setUploadMsg('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', padding: '2px' }}>
                        <Ic.X />
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ color: '#334155' }}><Ic.Upload /></span>
                      <span style={{ fontSize: '13px', color: '#4b5680' }}>拖拽或点击上传数据文件（自动载入分析引擎）</span>
                      <span style={{ fontSize: '11px', color: '#2d3748', marginLeft: 'auto' }}>CSV · XLSX · JSON</span>
                    </>
                  )}
                </div>
              </div>

              {/* 指令 + 执行 */}
              <div>
                <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em', color: '#334155', textTransform: 'uppercase', marginBottom: '7px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Ic.Doc /> 分析指令（可选）
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <textarea
                    value={instruction}
                    onChange={e => setInstruct(e.target.value)}
                    placeholder="例如：查一下去年的公考分数线，分析各省趋势，找出报考竞争最激烈的岗位..."
                    rows={2}
                    style={{
                      flex: 1, background: '#080b12', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '4px',
                      color: '#eef2ff', fontSize: '13px', fontFamily: '"Inter","PingFang SC",sans-serif',
                      padding: '9px 12px', resize: 'vertical', minHeight: '40px', maxHeight: '120px',
                      transition: 'border-color 0.15s, box-shadow 0.15s', lineHeight: 1.6,
                    }}
                  />
                  <button
                    className="exec-btn"
                    disabled={!isReady || runState === 'running' || uploadStatus === 'uploading'}
                    onClick={runAnalysis}
                    style={{
                      padding: '10px 22px', border: `1px solid ${isReady && runState !== 'running' ? '#2563eb' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: '4px', background: 'transparent',
                      color: isReady && runState !== 'running' ? '#93c5fd' : '#334155',
                      fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', cursor: isReady && runState !== 'running' ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', gap: '7px', transition: 'all 0.2s', flexShrink: 0,
                    }}
                  >
                    {runState === 'running' ? (
                      <>
                        <span style={{ width: '12px', height: '12px', border: '1.5px solid #334155', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                        分析中
                      </>
                    ) : uploadStatus === 'uploading' ? (
                      <>
                        <span style={{ width: '12px', height: '12px', border: '1.5px solid #334155', borderTopColor: '#0ea5e9', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                        上传中
                      </>
                    ) : uploadStatus === 'error' ? (
                      <>重新上传</>
                    ) : (
                      <>
                        <Ic.Play /> 开始分析
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* ── 输出区 ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {outputs.length === 0 && runState === 'idle' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#334155', padding: '60px 0' }}>
                  <div style={{ fontSize: '13px', color: '#475569' }}>上传文件后点击「开始分析」</div>
                  <div style={{ fontSize: '11px', color: '#2d3748' }}>五个智能体将依次协作，实时呈现分析过程与结论</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px', marginTop: '16px', width: '100%', maxWidth: '500px' }}>
                    {[
                      '分析近6个月销售趋势，找出异常波动节点',
                      '查一下去年公考分数线，各省对比分析',
                      '预测下季度销售额，给出置信区间',
                      '挖掘 SKU 关联规则，优化选品策略',
                    ].map((ex, i) => (
                      <div
                        key={i}
                        className="example-card"
                        onClick={() => setInstruct(ex)}
                        style={{ padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', background: '#101525', cursor: 'pointer', fontSize: '11px', color: '#4b5680', lineHeight: 1.5, transition: 'all 0.15s' }}
                      >
                        {ex}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {outputs.map(output => (
                <StreamCard
                  key={output.agentId}
                  output={output}
                  isActive={activeAgent === output.agentId && runState === 'running'}
                />
              ))}

              {/* ★ 数据工作台（分析完成后渲染） */}
              {runState === 'done' && uiData && (
                <div style={{
                  animation: 'cardIn 0.4s ease',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: '10px',
                  background: 'linear-gradient(180deg, #0a0e1a 0%, #070c16 100%)',
                  overflow: 'hidden',
                }}>
                  {/* 工作台标题 */}
                  <div style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                    <span style={{ fontSize: '16px' }}>🔬</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#c7d2fe' }}>
                      数据工作台
                    </span>
                    <span style={{ fontSize: '11px', color: '#374151', marginLeft: '4px' }}>
                      — 可交互 · 可下钻 · 可追问
                    </span>
                    {uiData.data_source && (
                      <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#374151', fontFamily: 'monospace' }}>
                        📁 {uiData.data_source}
                      </span>
                    )}
                  </div>

                  <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                    {/* ★ 空状态提示（未找到数据时） */}
                    {uiData.empty_hint?.show && (
                      <div style={{
                        background: '#0c1020',
                        border: '1px solid #ef444444',
                        borderRadius: '8px',
                        padding: '16px 18px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>🔍</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#fca5a5' }}>
                            {uiData.empty_hint.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {uiData.empty_hint.reasons?.map((r: string, i: number) => (
                            <div key={i} style={{ fontSize: '12px', color: '#6b7280', display: 'flex', gap: '6px' }}>
                              <span>•</span><span>{r}</span>
                            </div>
                          ))}
                        </div>
                        {uiData.empty_hint.tried_sql && (
                          <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#374151', background: '#060a10', padding: '6px 10px', borderRadius: '4px', wordBreak: 'break-all' }}>
                            已尝试 SQL：{uiData.empty_hint.tried_sql}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {uiData.empty_hint.suggestions?.map((s: any, i: number) => (
                            <button
                              key={i}
                              onClick={() => s.action === 'rephrase' && document.getElementById('follow-up-input')?.focus()}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '4px',
                                border: '1px solid #ef444433',
                                background: '#1c0a0a',
                                color: '#fca5a5',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              {s.text}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 1. 指标卡行 */}
                    {uiData.metric_cards?.length > 0 && (
                      <MetricCardRow cards={uiData.metric_cards as MetricCardData[]} />
                    )}

                    {/* 2. 图表 + 洞察（并排布局） */}
                    {(uiData.chart || (uiData.insights?.length > 0)) && (
                      <div style={{ display: 'grid', gridTemplateColumns: uiData.chart ? '1fr 320px' : '1fr', gap: '14px' }}>
                        {uiData.chart && (
                          <InsightChart
                            data={uiData.chart as ChartData}
                            height={260}
                            onDrillDown={(x) => {
                              setDrillFilter(String(x))
                            }}
                          />
                        )}
                        {uiData.insights?.length > 0 && (
                          <InsightList items={uiData.insights as InsightItem[]} />
                        )}
                      </div>
                    )}

                    {/* 3. 数据表格 */}
                    {uiData.table?.rows?.length > 0 && (
                      <DataTable
                        data={uiData.table as TableData}
                        filterValue={drillFilter}
                        highlightMin={
                          (uiData.table as TableData).highlight_col ||
                          (uiData.table as TableData).columns.find((c: any) => c.type === 'number')?.key
                        }
                        onRowClick={(row) => {
                          // 点击行可以把第一个文本列的值作为追问
                          const textCol = (uiData.table as TableData).columns.find((c: any) => c.type !== 'number')
                          if (textCol && row[textCol.key]) {
                            setFollowUp(`查询「${row[textCol.key]}」的详细信息`)
                          }
                        }}
                      />
                    )}

                    {/* 4. 追问区 */}
                    <div style={{
                      background: '#0c1020',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '14px 16px',
                    }}>
                      <div style={{ fontSize: '11px', color: '#374151', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>💬</span>
                        <span>基于当前数据继续追问</span>
                        {currentTableName && (
                          <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#1e293b', fontFamily: 'monospace' }}>
                            表: {currentTableName}
                          </span>
                        )}
                      </div>

                      {/* 推荐追问建议 */}
                      {uiData.follow_up_suggestions?.length > 0 && !followUpHistory.length && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                          {(uiData.follow_up_suggestions as string[]).map((s, i) => (
                            <button
                              key={i}
                              onClick={() => setFollowUp(s)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '4px',
                                border: '1px solid #1e293b',
                                background: '#111827',
                                color: '#6366f1',
                                fontSize: '11px',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLButtonElement).style.background = '#6366f111' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e293b'; (e.currentTarget as HTMLButtonElement).style.background = '#111827' }}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 追问历史 */}
                      {followUpHistory.length > 0 && (
                        <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {followUpHistory.slice(0, 3).map((h, i) => (
                            <div
                              key={i}
                              onClick={() => { setUiData(h.uiData); setFollowUpHistory(prev => prev.slice(i + 1)) }}
                              style={{ fontSize: '11px', color: '#374151', cursor: 'pointer', display: 'flex', gap: '6px' }}
                              title="点击回到此时刻"
                            >
                              <span>↩</span>
                              <span>{h.timestamp}</span>
                              <span style={{ color: '#4b5563' }}>{h.question}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 追问输入 */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          id="follow-up-input"
                          value={followUpInput}
                          onChange={e => setFollowUp(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doFollowUp(followUpInput) } }}
                          placeholder={currentTableName ? '追问（排序/筛选/列举 → 秒回；分析/趋势 → NL2SQL）' : '请先完成分析才能追问'}
                          disabled={!currentTableName || followUpLoading}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${followUpInput ? '#6366f144' : '#1e293b'}`,
                            background: '#080b12',
                            color: '#f1f5f9',
                            fontSize: '12px',
                            outline: 'none',
                            transition: 'border-color 0.15s',
                          }}
                        />
                        <button
                          onClick={() => doFollowUp(followUpInput)}
                          disabled={!followUpInput.trim() || !currentTableName || followUpLoading}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: '1px solid #6366f144',
                            background: followUpInput.trim() && currentTableName ? '#6366f122' : '#111827',
                            color: followUpInput.trim() && currentTableName ? '#818cf8' : '#374151',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: followUpInput.trim() && currentTableName ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', gap: '6px',
                          }}
                        >
                          {followUpLoading ? (
                            <span style={{ width: '12px', height: '12px', border: '1.5px solid #334155', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                          ) : '→ 追问'}
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* 完成后的操作栏 */}
              {runState === 'done' && (
                <div style={{ display: 'flex', gap: '8px', padding: '4px 0', animation: 'cardIn 0.4s ease' }}>
                  <button onClick={() => {
                    const text = outputs.flatMap(o => [`【${o.agentName}】${o.title}`, ...o.lines, '']).join('\n')
                    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = `分析报告_${file?.name || 'result'}.txt`; a.click()
                    URL.revokeObjectURL(url)
                  }} style={{ padding: '8px 18px', border: '1px solid rgba(37,99,235,0.4)', borderRadius: '4px', background: 'transparent', color: '#93c5fd', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}>
                    <Ic.Down /> 下载报告
                  </button>
                  <button onClick={reset} style={{ padding: '8px 18px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '4px', background: 'transparent', color: '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}>
                    <Ic.Reset /> 重新分析
                  </button>
                </div>
              )}

              <div ref={outputEndRef} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── 工具函数 ─────────────────────────────────────────────────

/** 简易 Markdown 渲染：**加粗**、### 标题、列表、换行 */
function renderMd(text: string): string {
  if (!text) return ''
  return text
    // 加粗 **xxx**
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#eef2ff;font-weight:600;">$1</strong>')
    // H3 标题 ### xxx
    .replace(/^### (.+)$/gm, '<div style="font-size:14px;font-weight:700;color:#eef2ff;margin:14px 0 6px;">$1</div>')
    // H2 标题 ## xxx
    .replace(/^## (.+)$/gm, '<div style="font-size:15px;font-weight:700;color:#eef2ff;margin:16px 0 8px;">$1</div>')
    // 数字列表 1. xxx
    .replace(/^\d+\.\s(.+)$/gm, '<span style="display:block;margin-left:14px;color:#cbd5e1;line-height:1.8;">• $1</span>')
    // 无序列表 - xxx 或 * xxx
    .replace(/^[\*\-]\s(.+)$/gm, '<span style="display:block;margin-left:14px;color:#cbd5e1;line-height:1.8;">• $1</span>')
    // 换行
    .replace(/\n/g, '<br>')
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export default QueryAnalyzer
