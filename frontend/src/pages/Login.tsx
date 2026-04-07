import React, { useState, useEffect } from 'react'
import { Input, Button, message } from 'antd'
import { LoginOutlined, ThunderboltOutlined } from '@ant-design/icons'

const STORAGE_KEY = 'insightflow_auth'

interface LoginPageProps {
  onLogin: () => void
}

const isMobile = typeof window !== 'undefined' && window.innerWidth < 480

/**
 * 登录页 — InsightFlow 演示环境
 * 账号密码预填，一键登录即可体验
 */
export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('demo')
  const [password, setPassword] = useState('demo')
  const [loading, setLoading] = useState(false)



  // 已登录则直接跳过
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEY)
    if (token) {
      onLogin()
    }
  }, [onLogin])

  const handleLogin = async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await resp.json()
      if (data.success) {
        localStorage.setItem(STORAGE_KEY, data.token || 'demo')
        message.success('登录成功')
        onLogin()
      } else {
        message.error(data.message || '登录失败')
      }
    } catch (e) {
      message.error('网络错误，请检查后端是否启动')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute', top: -120, right: -120,
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(30,64,175,0.15) 0%, transparent 70%)',
      }} />
      <div style={{
        position: 'absolute', bottom: -80, left: -80,
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)',
      }} />

      {/* 登录卡片 */}
      <div style={{
        width: isMobile ? '90vw' : 380,
        maxWidth: 380,
        background: 'rgba(30, 41, 59, 0.8)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: isMobile ? '36px 24px 32px' : '48px 40px 40px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #3B82F6, #1E40AF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(30,64,175,0.3)',
          }}>
            <ThunderboltOutlined style={{ fontSize: 26, color: '#fff' }} />
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: '#F8FAFC',
            margin: 0, letterSpacing: 0.5,
          }}>
            InsightFlow AI
          </h1>
          <p style={{
            fontSize: 13, color: '#64748B', margin: '8px 0 0',
          }}>
            多Agent智能BI分析平台
          </p>
        </div>

        {/* 表单 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: '#94A3B8', marginBottom: 6, display: 'block' }}>
              账号
            </label>
            <Input
              size="large"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="insightflow"
              style={{
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#F8FAFC',
                height: 44,
                borderRadius: 10,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#94A3B8', marginBottom: 6, display: 'block' }}>
              密码
            </label>
            <Input.Password
              size="large"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="insightflow"
              style={{
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
                height: 44,
                borderRadius: 10,
              }}
            />
          </div>

          <Button
            type="primary"
            size="large"
            icon={<LoginOutlined />}
            loading={loading}
            onClick={handleLogin}
            style={{
              height: 48,
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 15,
              background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
              border: 'none',
              marginTop: 8,
            }}
            block
          >
            登录
          </Button>
        </div>

        {/* 底部提示 */}
        <div style={{
          textAlign: 'center', marginTop: 24,
          fontSize: 11, color: '#475569', lineHeight: 1.8,
        }}>
          演示环境 · 账号 insightflow · 直接体验
          <br />
          <span style={{ color: '#334155' }}>Powered by DeepSeek LLM + DuckDB</span>
        </div>
      </div>
    </div>
  )
}
