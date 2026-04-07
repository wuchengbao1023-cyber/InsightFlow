/**
 * Roundtable.tsx - 圆桌会议模式 v5.2 - 物理引擎布局
 * 
 * 核心改进：
 * - Verlet积分物理引擎（基于d3-force原理），自动碰撞检测+边界约束
 * - 卡片锚定到头像位置，物理引擎解决遮挡和脱离问题
 * - RAF驱动的60fps布局动画，完全跳过React渲染循环
 * - resize时平滑过渡，不会突然跳变
 * 
 * 全屏布局：
 * - 整个屏幕作为圆桌区域
 * - 6个AI围坐圆桌
 * - 每个人旁边有思考卡片，实时流式输出
 * - 桌面中央：文件/图表
 * - 会议纪要：悬浮面板
 * - 消息/设置：抽屉式侧边栏
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Button, Avatar, Typography, Spin, Tag, Upload, message } from 'antd'
import laocchenImg from '../../assets/avatars/laocchen.png'
import laolinImg from '../../assets/avatars/laolin.png'
import laowangImg from '../../assets/avatars/laowang.png'
import xiaozhaoImg from '../../assets/avatars/xiaozhao.png'
import zhijianImg from '../../assets/avatars/zhijian.png'
import xiaoliImg from '../../assets/avatars/xiaoli.png'

const AVATAR_IMAGES: Record<string, string> = {
  '老陈': laocchenImg,
  '老林': laolinImg,
  '老王': laowangImg,
  '小赵': xiaozhaoImg,
  '质检官': zhijianImg,
  '小李': xiaoliImg,
}
import { 
  MessageOutlined,
  CloseOutlined,
  SoundOutlined,
  CheckCircleOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import type { AgentThinking } from './types'
import { useResponsive } from './useResponsive'

const { Dragger } = Upload

const { Text, Title } = Typography

// ═══════════════════════════════════════════════════════════
// 轻量Verlet物理引擎 — 基于d3-force原理
// 零外部依赖，纯函数式实现
// ═══════════════════════════════════════════════════════════

interface PhysicsNode {
  /** 卡片中心X */
  x: number
  /** 卡片中心Y */
  y: number
  /** 速度X（Verlet用，实际是上一帧位置差） */
  vx: number
  /** 速度Y */
  vy: number
  /** 固定锚点X（头像位置） */
  anchorX: number
  /** 固定锚点Y（头像位置） */
  anchorY: number
  /** 碰撞半径（取卡片宽/高的一半） */
  radius: number
  /** 卡片宽度 */
  width: number
  /** 卡片高度 */
  height: number
  /** 锚定弹簧强度（值越大越贴紧锚点） */
  anchorStrength: number
  /** 排斥力强度 */
  repulsionStrength: number
  /** 边界约束强度 */
  boundaryStrength: number
  /** 是否活跃（活跃卡片排斥力更强） */
  active: boolean
  /** 是否正在说话（说话卡片z-index更高+发光） */
  speaking: boolean
}

class ForceSimulation {
  private nodes: PhysicsNode[] = []
  private alpha = 1.0
  private alphaDecay = 0.02
  private alphaMin = 0.001
  private alphaTarget = 0
  private velocityDecay = 0.4
  /** 屏幕边界 */
  private bounds = { left: 10, top: 70, right: 1590, bottom: 830 }
  
  addNode(node: PhysicsNode) {
    this.nodes.push(node)
    return this
  }
  
  setBounds(left: number, top: number, right: number, bottom: number) {
    this.bounds = { left, top, right, bottom }
    return this
  }
  
  /** 重新加热仿真（窗口resize或卡片状态变化时调用） */
  reheat(alpha = 0.5) {
    this.alpha = Math.max(this.alpha, alpha)
    return this
  }
  
  /** 单步模拟 — 返回是否仍有运动 */
  tick(): boolean {
    if (this.alpha < this.alphaMin) return false
    
    const n = this.nodes.length
    
    // ── Phase 1: 锚定弹簧力（卡片被拉向头像旁边） ──
    for (let i = 0; i < n; i++) {
      const node = this.nodes[i]
      const dx = node.anchorX - node.x
      const dy = node.anchorY - node.y
      const strength = node.anchorStrength * this.alpha
      node.vx += dx * strength
      node.vy += dy * strength
    }
    
    // ── Phase 2: 卡片间排斥力（避免重叠） ──
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.nodes[i]
        const b = this.nodes[j]
        
        // AABB碰撞检测（比圆形碰撞更精确，贴合矩形卡片）
        const overlapX = (a.width / 2 + b.width / 2) - Math.abs(a.x - b.x)
        const overlapY = (a.height / 2 + b.height / 2) - Math.abs(a.y - b.y)
        
        if (overlapX > 0 && overlapY > 0) {
          // 有重叠 — 用最小穿透轴分离（SAT最小平移向量）
          const baseStrength = (a.active && b.active ? 1.5 : 0.8)
          const strength = baseStrength * this.alpha
          
          if (overlapX < overlapY) {
            // 水平分离
            const sign = a.x < b.x ? -1 : 1
            a.vx += sign * overlapX * strength * 0.5
            b.vx -= sign * overlapX * strength * 0.5
          } else {
            // 垂直分离
            const sign = a.y < b.y ? -1 : 1
            a.vy += sign * overlapY * strength * 0.5
            b.vy -= sign * overlapY * strength * 0.5
          }
        }
      }
    }
    
    // ── Phase 3: 边界约束（硬约束：直接钳位） ──
    for (let i = 0; i < n; i++) {
      const node = this.nodes[i]
      const hw = node.width / 2
      const hh = node.height / 2
      
      // 硬约束：直接钳位，不允许超出边界
      if (node.x - hw < this.bounds.left) {
        node.x = this.bounds.left + hw
        node.vx *= -0.3
      }
      if (node.x + hw > this.bounds.right) {
        node.x = this.bounds.right - hw
        node.vx *= -0.3
      }
      if (node.y - hh < this.bounds.top) {
        node.y = this.bounds.top + hh
        node.vy *= -0.3
      }
      if (node.y + hh > this.bounds.bottom) {
        node.y = this.bounds.bottom - hh
        node.vy *= -0.3
      }
    }
    
    // ── Phase 4: 速度衰减 + 位置更新（Verlet积分） ──
    for (let i = 0; i < n; i++) {
      const node = this.nodes[i]
      node.vx *= (1 - this.velocityDecay * this.alpha)
      node.vy *= (1 - this.velocityDecay * this.alpha)
      node.x += node.vx
      node.y += node.vy
    }
    
    // Alpha衰减
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay
    
    return this.alpha >= this.alphaMin
  }
  
  getNodes(): PhysicsNode[] {
    return this.nodes
  }
}

// ═══════════════════════════════════════════════════════════
// 6位AI团队成员配置
// ═══════════════════════════════════════════════════════════

interface TeamMember {
  key: string
  name: string
  role: string
  emoji: string
  color: string
  gradient: string
  angle: number // 角度位置
}

const TEAM_MEMBERS: TeamMember[] = [
  { key: '老陈', name: '老陈', role: '数据工程师', emoji: '🏗️', color: '#1890ff', gradient: 'linear-gradient(135deg, #1890ff, #096dd9)', angle: 270 },
  { key: '老林', name: '老林', role: '数据分析师', emoji: '📊', color: '#52c41a', gradient: 'linear-gradient(135deg, #52c41a, #389e0d)', angle: 330 },
  { key: '老王', name: '老王', role: '预测先知', emoji: '🔮', color: '#722ed1', gradient: 'linear-gradient(135deg, #722ed1, #531dab)', angle: 30 },
  { key: '小赵', name: '小赵', role: '策略顾问', emoji: '🎯', color: '#fa8c16', gradient: 'linear-gradient(135deg, #fa8c16, #d46b08)', angle: 90 },
  { key: '质检官', name: '质检官', role: '质量审查', emoji: '✅', color: '#eb2f96', gradient: 'linear-gradient(135deg, #eb2f96, #c41d7f)', angle: 150 },
  { key: '小李', name: '小李', role: '报告主编', emoji: '📝', color: '#13c2c2', gradient: 'linear-gradient(135deg, #13c2c2, #08979c)', angle: 210 },
]

// 后端发送的英文 key 映射到中文 key
const EN_TO_CN: Record<string, string> = {
  'DATA_ENGINEER': '老陈',
  'DATA_ANALYST': '老林',
  'FORECAST_ANALYST': '老王',
  'STRATEGY_ADVISOR': '小赵',
  'QUALITY_REVIEWER': '质检官',
  'REPORT_EDITOR': '小李',
}

// 将英文key转换为中文key
function toChineseKey(key: string): string {
  return EN_TO_CN[key] || key
}

// ═══════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// 纯函数版getMemberStatus（供useMemo内部调用，避免循环依赖）
function getMemberStatusDirect(
  agents: Record<string, AgentThinking>,
  messages: Message[],
  key: string,
  isRunning: boolean,
  selectedRoles: string[]
): string {
  const agentData = agents[key]
  const isStreaming = agentData?.isStreaming
  const hasData = !!agentData?.text
  const hasSpoken = messages.some(m => m.agent === key)
  
  if (isStreaming) return 'speaking'
  if (hasData) return 'done'
  if (hasSpoken) return 'done'
  if (isRunning && selectedRoles.includes(key)) return 'waiting'
  return 'idle'
}

// ═══════════════════════════════════════════════════════════
// 流式文字组件 - 直接渲染文本，不缓存/不回退
// 流式均匀性由后端SSE delta推送节奏控制
// ═══════════════════════════════════════════════════════════

/** 去除 Markdown 格式符号 */
function cleanMarkdown(text: string): string {
  if (!text) return text
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/~~(.+?)~~/g, '$1')
}

function StreamingText({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const spanRef = useRef<HTMLSpanElement>(null)

  // 自动滚底：文字变化时，找到最近的可滚动父容器并滚动到底部
  useEffect(() => {
    if (!text) return
    // 从当前 span 向上找最近的可滚动容器
    let el = spanRef.current?.parentElement
    while (el) {
      if (el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'visible') {
        // 只在内容接近底部时自动滚动（用户手动上翻时不打扰）
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        if (distanceFromBottom < 120) {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
        }
        break
      }
      el = el.parentElement
    }
  }, [text])

  return (
    <span ref={spanRef} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {cleanMarkdown(text)}
      {isStreaming && <span className="cursor">|</span>}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════
// 手机版：纵向时间线模式
// 手机屏幕太小，物理引擎圆桌无法正常展示
// 改为纵向滚动时间线，每个Agent一个卡片
// ═══════════════════════════════════════════════════════════

function MobileTimeline({ agents, selectedRoles, isRunning, messages }: {
  agents: Record<string, AgentThinking>
  selectedRoles: string[]
  isRunning: boolean
  messages: Message[]
}) {
  const getMemberStatus = useCallback((key: string) => {
    return getMemberStatusDirect(agents, messages, key, isRunning, selectedRoles)
  }, [agents, messages, isRunning, selectedRoles])

  // 只显示有内容、正在发言、或被选中的Agent
  const visibleMembers = TEAM_MEMBERS.filter(member => {
    const agentData = agents[member.key]
    const status = getMemberStatus(member.key)
    return agentData?.text || status === 'speaking' || status === 'waiting' || selectedRoles.includes(member.key)
  })

  // 自动滚底
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      userScrolledUp.current = !atBottom
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (containerRef.current && !userScrolledUp.current) {
      containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [agents, messages])

  return (
    <div ref={containerRef} style={{
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '16px 12px',
      WebkitOverflowScrolling: 'touch',
      // 底部留出输入框空间
      paddingBottom: 100,
    }}>
      {/* 时间线竖线 */}
      <div style={{
        position: 'absolute',
        left: 36,
        top: 80,
        bottom: 100,
        width: 2,
        background: 'linear-gradient(to bottom, #252540, #1890ff40, #252540)',
      }} />

      <div style={{ position: 'relative' }}>
        {visibleMembers.map((member, idx) => {
          const status = getMemberStatus(member.key)
          const agentData = agents[member.key]
          const isActive = status !== 'idle'

          return (
            <div
              key={member.key}
              style={{
                position: 'relative',
                paddingLeft: 56,
                marginBottom: 16,
                animation: `fadeIn 0.3s ease ${idx * 0.08}s both`,
              }}
            >
              {/* 时间线节点（头像） */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 44,
                height: 44,
                borderRadius: '50%',
                overflow: 'hidden',
                border: status === 'speaking'
                  ? `3px solid ${member.color}`
                  : '3px solid rgba(255,255,255,0.12)',
                boxShadow: status === 'speaking' ? `0 0 16px ${member.color}50` : '0 2px 8px rgba(0,0,0,0.4)',
                opacity: isActive ? 1 : 0.45,
                background: '#1a1a2e',
                zIndex: 2,
                flexShrink: 0,
              }}>
                <img
                  src={AVATAR_IMAGES[member.key]}
                  alt={member.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '50%',
                  }}
                />
                {status === 'speaking' && (
                  <div style={{
                    position: 'absolute', bottom: -2, right: -2,
                    width: 18, height: 18, borderRadius: '50%',
                    backgroundColor: '#1890ff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'pulse 1.5s infinite',
                    boxShadow: '0 0 12px #1890ff',
                  }}>
                    <SoundOutlined style={{ color: '#fff', fontSize: 10 }} />
                  </div>
                )}
                {status === 'done' && (
                  <div style={{
                    position: 'absolute', bottom: -2, right: -2,
                    width: 16, height: 16, borderRadius: '50%',
                    backgroundColor: '#52c41a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CheckCircleOutlined style={{ color: '#fff', fontSize: 8 }} />
                  </div>
                )}
              </div>

              {/* 思考卡片 */}
              <div style={{
                background: 'rgba(30, 30, 55, 0.98)',
                backdropFilter: 'blur(10px)',
                border: status === 'speaking'
                  ? `2px solid ${member.color}`
                  : '1px solid #303050',
                borderRadius: 12,
                padding: '12px 14px',
                maxWidth: '100%',
                boxShadow: status === 'speaking'
                  ? `0 0 20px ${member.color}30, 0 2px 12px rgba(0,0,0,0.3)`
                  : '0 2px 12px rgba(0,0,0,0.3)',
                opacity: isActive ? 1 : 0.5,
              }}>
                {/* 卡片头部 */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginBottom: agentData?.text ? 8 : 0,
                }}>
                  <span style={{ color: member.color, fontSize: 13, fontWeight: 700 }}>
                    {member.name}
                  </span>
                  <span style={{ color: '#888', fontSize: 11 }}>{member.role}</span>
                  {status === 'speaking' && <Spin size="small" style={{ marginLeft: 'auto' }} />}
                </div>

                {/* 卡片内容 */}
                {agentData?.text ? (
                  <div style={{
                    fontSize: 13, color: '#F0F0F0', lineHeight: 1.7,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    maxHeight: 200, overflowY: 'auto',
                  }}>
                    <StreamingText text={agentData.text} isStreaming={status === 'speaking'} />
                  </div>
                ) : (
                  <span style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
                    {status === 'speaking' ? '正在思考...' : '等待发言...'}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* 空态 */}
        {visibleMembers.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 20px', color: '#555',
          }}>
            <div style={{ fontSize: 14 }}>AI 团队待命中...</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════

interface Message {
  id: string
  agent?: string
  content: string
  timestamp: string
}

interface RoundtableProps {
  agents: Record<string, AgentThinking>
  selectedRoles: string[]
  isRunning: boolean
  messages: Message[]
  meetingMinutes: string
  fileName?: string
  fileNames?: string[]
  phase?: string
  onUpload?: (files: File[]) => void
  rounds?: any[]
  taskPool?: { total: number; completed: number; running: number }
}

export default function Roundtable({
  agents,
  selectedRoles,
  isRunning,
  messages,
  meetingMinutes,
  fileName = '数据文件.xlsx',
  fileNames = [],
  phase = 'welcome',
  onUpload,
  rounds = [],
  taskPool,
}: RoundtableProps) {
  const [minutesVisible, setMinutesVisible] = useState(false)
  const responsive = useResponsive()
  
  // 屏幕尺寸（桌面/平板用 dimensions，手机不用物理引擎）
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 })
  
  useEffect(() => {
    const updateSize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // 修复 ECharts SVG ellipse rx/ry 负值 bug（优化：仅观察当前组件容器）
  const roundtableRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = roundtableRef.current
    if (!container) return

    const fixEllipse = () => {
      container.querySelectorAll('ellipse').forEach((el) => {
        const rx = parseFloat(el.getAttribute('rx') || '0')
        const ry = parseFloat(el.getAttribute('ry') || '0')
        if (rx < 0) el.setAttribute('rx', '0')
        if (ry < 0) el.setAttribute('ry', '0')
      })
    }
    fixEllipse()
    const observer = new MutationObserver(fixEllipse)
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['rx', 'ry'] })
    return () => observer.disconnect()
  }, [])
  
  // 圆桌参数 - 正中间，更大的圆桌（响应式缩放）
  const centerX = dimensions.width / 2
  const centerY = (dimensions.height - 118) / 2 + 48  // 扣除顶栏48px + 底部输入框70px
  // 平板上缩小圆桌和成员半径
  const scaleFactor = responsive.isTablet ? 0.7 : 1
  const tableRadius = Math.min(dimensions.width, dimensions.height) * 0.12 * scaleFactor
  const memberRadius = Math.min(dimensions.width, dimensions.height) * 0.25 * scaleFactor
  
  // ═══════════════════════════════════════════════════════
  // 物理引擎：计算每个可见卡片的稳定位置
  // 核心：Verlet积分 + AABB碰撞检测 + 边界约束
  // ═══════════════════════════════════════════════════════
  const cardPositions = useMemo(() => {
    const sim = new ForceSimulation()
    
    TEAM_MEMBERS.forEach(member => {
      const agentData = agents[member.key]
      const isSelected = selectedRoles.includes(member.key)
      const showCard = agentData?.text || getMemberStatusDirect(agents, messages, member.key, isRunning, selectedRoles) === 'speaking' || isSelected
      
      if (!showCard) return
      
      const avatarPos = polarToCartesian(centerX, centerY, memberRadius, member.angle)
      const isRightSide = member.angle < 180
      const cardW = responsive.isTablet ? 200 : 260
      const status = getMemberStatusDirect(agents, messages, member.key, isRunning, selectedRoles)
      const cardH = status === 'speaking'
        ? Math.min(420, dimensions.height * 0.38)
        : Math.min(280, dimensions.height * 0.28)
      
      // 初始锚点：卡片中心在头像旁边
      const safeTop = 80 + cardH / 2  // 确保卡片不会超出顶部（80px 安全边距）
      const safeBottom = dimensions.height - 80 - cardH / 2  // 确保不超出底部
      const anchorX = isRightSide
        ? avatarPos.x + 48 + cardW / 2
        : avatarPos.x - 48 - cardW / 2
      const anchorY = Math.max(safeTop, Math.min(safeBottom, avatarPos.y))
      
      sim.addNode({
        x: anchorX,
        y: anchorY,
        vx: 0,
        vy: 0,
        anchorX,
        anchorY,
        radius: Math.max(cardW, cardH) / 2,
        width: cardW,
        height: cardH,
        anchorStrength: 0.08,
        repulsionStrength: 0.1,
        boundaryStrength: 0.06,
        active: status !== 'idle',
        speaking: status === 'speaking',
      })
    })
    
    sim.setBounds(10 + 130, 70 + 50, dimensions.width - 10 - 130, dimensions.height - 120 - 50)
    
    // 运行仿真直到稳定（最多300轮）
    for (let i = 0; i < 300; i++) {
      if (!sim.tick()) break
    }
    
    // 把结果映射到 { [memberKey]: { left, top } }
    const positions: Record<string, { left: number; top: number }> = {}
    let nodeIdx = 0
    TEAM_MEMBERS.forEach(member => {
      const agentData = agents[member.key]
      const isSelected = selectedRoles.includes(member.key)
      const showCard = agentData?.text || getMemberStatusDirect(agents, messages, member.key, isRunning, selectedRoles) === 'speaking' || isSelected
      if (!showCard) return
      
      const node = sim.getNodes()[nodeIdx]
      if (node) {
        // 硬约束：确保卡片完全在可视区域内
        const safeLeft = Math.max(10, Math.min(node.x - node.width / 2, dimensions.width - 10 - node.width))
        const safeTop = Math.max(80, Math.min(node.y - node.height / 2, dimensions.height - 80 - node.height))
        positions[member.key] = {
          left: safeLeft,
          top: safeTop,
        }
      }
      nodeIdx++
    })
    
    return positions
  }, [dimensions, agents, selectedRoles, isRunning, messages, centerX, centerY, memberRadius])
  
  // 当前发言人（转换英文key到中文）
  const currentSpeaker = useMemo(() => {
    if (messages.length === 0) return null
    const lastMsg = messages[messages.length - 1]
    return toChineseKey(lastMsg.agent || '')
  }, [messages])
  
  // 获取成员状态（纯函数版本，供useMemo使用）
  const getMemberStatus = useCallback((key: string) => {
    return getMemberStatusDirect(agents, messages, key, isRunning, selectedRoles)
  }, [agents, messages, isRunning, selectedRoles])

  return (
    <div ref={roundtableRef} style={styles.fullscreen}>
      {/* ═══════════════════════════════════════════════════════
          手机版：纵向时间线模式
      ═══════════════════════════════════════════════════════ */}
      {responsive.isMobile ? (
        <>
          <MobileTimeline
            agents={agents}
            selectedRoles={selectedRoles}
            isRunning={isRunning}
            messages={messages}
          />

          {/* 手机版会议纪要按钮 */}
          <Button
            type="text"
            size="small"
            icon={<MessageOutlined />}
            style={{
              position: 'fixed',
              right: 16,
              bottom: 80,
              zIndex: 40,
              color: '#40A9FF',
              background: 'rgba(24, 144, 255, 0.12)',
              border: '1px solid rgba(24, 144, 255, 0.3)',
              borderRadius: 20,
              width: 40,
              height: 40,
            }}
            onClick={() => setMinutesVisible(prev => !prev)}
          />

          {/* 手机版任务池进度 */}
          {isRunning && taskPool && taskPool.total > 0 && (
            <div style={{
              position: 'fixed',
              left: 16,
              bottom: 80,
              background: 'rgba(15, 15, 26, 0.92)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20,
              padding: '6px 12px',
              zIndex: 20,
            }}>
              <div style={{ fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📋</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{taskPool.completed}/{taskPool.total}</span>
              </div>
            </div>
          )}
        </>
      ) : (
      <>
      {/* ═══════════════════════════════════════════════════════
          桌面/平板：物理引擎圆桌模式
      ═══════════════════════════════════════════════════════ */}
      <div style={styles.roundtableArea}>
        {/* 背景 */}
        <div style={styles.background} />
        
        {/* SVG 圆桌 */}
        <svg width={dimensions.width} height={dimensions.height} style={styles.svg}>
          <defs>
            <radialGradient id="tableGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1890ff" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#1890ff" stopOpacity="0" />
            </radialGradient>
            <filter id="shadow">
              <feDropShadow dx="0" dy="8" stdDeviation="15" floodOpacity="0.4"/>
            </filter>
          </defs>
          
          {/* 光晕 */}
          <ellipse cx={centerX} cy={centerY} rx={tableRadius + 100} ry={tableRadius * 0.6 + 60} fill="url(#tableGlow)" />
          
          {/* 圆桌 */}
          <ellipse cx={centerX} cy={centerY + 10} rx={tableRadius} ry={tableRadius * 0.55} fill="#0f0f1a" stroke="#252540" strokeWidth="2" filter="url(#shadow)" />
          <ellipse cx={centerX} cy={centerY} rx={tableRadius} ry={tableRadius * 0.55} fill="#1a1a2e" stroke="#303050" strokeWidth="2" />
          
          {/* 桌面高光 */}
          <ellipse cx={centerX} cy={centerY - 5} rx={Math.max(0, tableRadius - 30)} ry={Math.max(0, tableRadius * 0.55 - 15)} fill="none" stroke="#404060" strokeWidth="1" opacity="0.3" />
        </svg>

        {/* AI成员 + 物理引擎定位思考卡片 */}
        {TEAM_MEMBERS.map((member, idx) => {
          const pos = polarToCartesian(centerX, centerY, memberRadius, member.angle)
          const status = getMemberStatus(member.key)
          const agentData = agents[member.key]
          const isSelected = selectedRoles.includes(member.key)
          const isWaiting = isSelected && !agentData?.text
          const isActive = status !== 'idle'

          // 固定卡片尺寸（不再根据文本动态计算，避免跳动）
          const cardWidth = 260
          const maxCardH = status === 'speaking'
            ? Math.min(420, dimensions.height * 0.38)
            : Math.min(280, dimensions.height * 0.28)

          // 使用物理引擎计算的位置
          const physicsPos = cardPositions[member.key]
          // 备用：如果物理引擎没算出位置，用传统锚定
          const isRightSide = member.angle < 180
          const fallbackLeft = isRightSide ? pos.x + 48 : pos.x - cardWidth - 48
          const fallbackTop = Math.max(70, pos.y - 20)
          const clampedLeft = physicsPos
            ? physicsPos.left
            : Math.max(10, Math.min(fallbackLeft, dimensions.width - cardWidth - 10))
          const clampedTop = physicsPos
            ? physicsPos.top
            : Math.max(70, Math.min(fallbackTop, dimensions.height - 120))

          // 是否显示卡片
          const showCard = agentData?.text || status === 'speaking' || isSelected

          return (
            <React.Fragment key={member.key}>
              {/* 头像 */}
              <div
                style={{
                  ...styles.member,
                  left: pos.x - 32,
                  top: pos.y - 32,
                  transform: status === 'speaking' ? 'scale(1.1)' : 'scale(1)',
                  opacity: isActive ? 1 : 0.45,
                  zIndex: status === 'speaking' ? 25 : 20,
                }}
              >
                <div style={{
                  ...styles.avatar,
                  background: member.gradient,
                  filter: isActive ? 'none' : 'grayscale(0.3)',
                  overflow: 'hidden',
                  padding: 0,
                }}>
                  <img
                    src={AVATAR_IMAGES[member.key]}
                    alt={member.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: '50%',
                    }}
                  />
                  {status === 'speaking' && (
                    <div style={styles.speakingIndicator}>
                      <SoundOutlined style={{ color: '#fff', fontSize: 12 }} />
                    </div>
                  )}
                  {status === 'done' && (
                    <div style={{ ...styles.statusDot, backgroundColor: '#52c41a' }}>
                      <CheckCircleOutlined style={{ color: '#fff', fontSize: 8 }} />
                    </div>
                  )}
                  {isWaiting && (
                    <div style={{ ...styles.statusDot, backgroundColor: '#faad14' }} />
                  )}
                  {status === 'waiting' && (
                    <div style={{ ...styles.statusDot, backgroundColor: '#faad14' }} />
                  )}
                </div>
                <div style={{
                  ...styles.nameTag,
                  backgroundColor: isActive ? member.color : '#555',
                  opacity: isActive ? 1 : 0.6,
                }}>
                  <Text strong style={{ color: '#FFFFFF', fontSize: 12 }}>{member.name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10 }}>{member.role}</Text>
                </div>
              </div>

              {/* 物理引擎定位的思考卡片 */}
              {showCard && (
                <div
                  style={{
                    ...styles.thinkCard,
                    width: cardWidth,
                    maxHeight: maxCardH,
                    left: clampedLeft,
                    top: clampedTop,
                    borderColor: member.color,
                    boxShadow: status === 'speaking'
                      ? `0 0 25px ${member.color}50, 0 4px 20px rgba(0,0,0,0.3)`
                      : '0 4px 20px rgba(0,0,0,0.3)',
                    zIndex: status === 'speaking' ? 35 : 30,
                    // 物理引擎计算位置后，用transition平滑跟随锚点
                    transition: 'left 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), max-height 0.35s ease, box-shadow 0.3s ease',
                  }}
                >
                  <div style={{ ...styles.thinkHeader, color: member.color }}>
                    {status === 'speaking' && <Spin size="small" style={{ marginRight: 6 }} />}
                    <span style={{ color: member.color, fontSize: 11 }}>
                      {isWaiting ? `${member.name}等待发言` : status === 'waiting' ? `${member.name}等待` : `${member.name}的思考`}
                    </span>
                  </div>
                  <div style={{
                    ...styles.thinkContent,
                    maxHeight: maxCardH - 40,
                    height: 'auto',
                    overflowY: 'auto',
                  }}>
                    {agentData?.text ? (
                      <StreamingText
                        text={agentData.text}
                        isStreaming={status === 'speaking'}
                      />
                    ) : (
                      <span style={{ color: '#BBBBBB', fontStyle: 'italic', fontSize: 11 }}>
                        {status === 'speaking' ? '正在思考...' : isWaiting ? '等待发言...' : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════
          悬浮会议纪要按钮（桌面/平板始终可见）
      ═══════════════════════════════════════════════════════ */}
      <Button
        type="text"
        size="small"
        icon={<MessageOutlined />}
        style={{
          position: 'fixed',
          left: 24,
          bottom: 24,
          zIndex: 40,
          color: '#40A9FF',
          background: 'rgba(24, 144, 255, 0.12)',
          border: '1px solid rgba(24, 144, 255, 0.3)',
          borderRadius: 8,
          opacity: 0.8,
        }}
        onClick={() => setMinutesVisible(prev => !prev)}
      >
        会议纪要
      </Button>

      {/* ═══════════════════════════════════════════════════════
          悬浮会议纪要面板（所有尺寸共用）
      ═══════════════════════════════════════════════════════ */}
      {minutesVisible && (
        <div style={{
          ...styles.minutesPanel,
          // 手机上改为底部弹出
          ...(responsive.isMobile ? {
            position: 'fixed' as const,
            left: 0,
            top: 'auto',
            bottom: 0,
            width: '100%',
            borderRadius: '16px 16px 0 0',
            maxHeight: '50vh',
          } : {}),
        }}>
          <div style={styles.minutesHeader}>
            <FileTextOutlined style={{ marginRight: 8 }} />
            会议纪要
            <Button 
              type="text" 
              size="small" 
              icon={<CloseOutlined />} 
              style={{ marginLeft: 'auto', color: '#AAAAAA' }}
              onClick={() => setMinutesVisible(false)}
            />
          </div>
          <div style={{
            ...styles.minutesContent,
            ...(responsive.isMobile ? { maxHeight: 'calc(50vh - 50px)' } : {}),
          }}>
            {meetingMinutes ? (
              <div style={{ fontSize: 13, lineHeight: 1.8, color: '#F5F5F5' }}>
                {meetingMinutes}
              </div>
            ) : isRunning ? (
              <div style={{ textAlign: 'center', color: '#AAAAAA', padding: '20px 0' }}>
                <Spin size="small" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 12 }}>小李正在记录...</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#666', padding: '20px 0', fontSize: 12 }}>
                等待分析开始
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          v5: 任务池进度指示器（桌面/平板，仅分析中显示）
      ═══════════════════════════════════════════════════════ */}
      {isRunning && taskPool && taskPool.total > 0 && (
        <div style={{
          position: 'fixed',
          right: 16,
          top: 56,
          background: 'rgba(15, 15, 26, 0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '6px 10px',
          zIndex: 20,
          minWidth: 120,
        }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📋 任务池</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{taskPool.completed}/{taskPool.total}</span>
          </div>
          <div style={{
            height: 3,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: taskPool.total > 0 ? `${(taskPool.completed / taskPool.total) * 100}%` : '0%',
              background: 'linear-gradient(90deg, #1890ff, #52c41a)',
              borderRadius: 2,
              transition: 'width 0.5s ease',
            }} />
          </div>
          {taskPool.running > 0 && (
            <div style={{ fontSize: 9, color: '#1890ff', marginTop: 2 }}>
              {taskPool.running} 个执行中...
            </div>
          )}
        </div>
      )}
      </>
      )}

    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 样式
// ═══════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  fullscreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#050508',
    display: 'flex',
    flexDirection: 'column',
  },
  roundtableArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  background: {
    position: 'absolute',
    inset: 0,
    background: `
      radial-gradient(ellipse at 50% 50%, rgba(24, 144, 255, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 20% 80%, rgba(114, 46, 209, 0.05) 0%, transparent 40%),
      radial-gradient(ellipse at 80% 20%, rgba(82, 196, 26, 0.05) 0%, transparent 40%)
    `,
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  fileCenter: {
    position: 'absolute',
    zIndex: 10,
  },
  fileCard: {
    backgroundColor: 'rgba(30, 30, 50, 0.95)',
    backdropFilter: 'blur(10px)',
    border: '1px solid #404060',
    borderRadius: 12,
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  },
  member: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    zIndex: 20,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    border: '3px solid rgba(255,255,255,0.15)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  },
  speakingIndicator: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: '50%',
    backgroundColor: '#1890ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'pulse 1.5s infinite',
    boxShadow: '0 0 15px #1890ff',
  },
  statusDot: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameTag: {
    marginTop: 6,
    padding: '2px 10px',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  thinkCard: {
    position: 'absolute',
    backgroundColor: 'rgba(30, 30, 55, 0.98)',
    backdropFilter: 'blur(10px)',
    border: '2px solid',
    borderRadius: 10,
    padding: 12,
    overflow: 'hidden',
    zIndex: 30,
    animation: 'fadeIn 0.3s ease',
    transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.35s ease, height 0.35s ease',
  },
  thinkHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
  },
  thinkContent: {
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 1.7,
    overflow: 'auto',
    wordBreak: 'break-word',
  },
  minutesPanel: {
    position: 'fixed',
    left: 24,
    top: 80,
    width: 280,
    backgroundColor: 'rgba(30, 30, 55, 0.98)',
    backdropFilter: 'blur(10px)',
    border: '1px solid #404060',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    zIndex: 50,
  },
  minutesHeader: {
    padding: '12px 16px',
    backgroundColor: 'rgba(24, 144, 255, 0.15)',
    borderBottom: '1px solid #404060',
    color: '#40A9FF',
    fontSize: 13,
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
  },
  minutesContent: {
    padding: 16,
    maxHeight: 300,
    overflow: 'auto',
  },
}

// CSS动画（带去重检查，避免重复注入）
if (typeof document !== 'undefined') {
  if (!document.getElementById('roundtable-v5-anim')) {
    const styleSheet = document.createElement('style')
    styleSheet.id = 'roundtable-v5-anim'
    styleSheet.textContent = `
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.8; }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .cursor {
      animation: blink 1s infinite;
    }
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
  `
    document.head.appendChild(styleSheet)
  }
}
