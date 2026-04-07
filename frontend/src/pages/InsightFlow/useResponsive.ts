/**
 * useResponsive - InsightFlow 响应式断点检测
 * 
 * 三档断点：
 * - desktop: >= 1024px（物理引擎圆桌模式）
 * - tablet: 768px ~ 1023px（缩小参数的圆桌模式）
 * - mobile: < 768px（纵向时间线模式）
 */

import { useState, useEffect } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

interface ResponsiveInfo {
  breakpoint: Breakpoint
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  width: number
  height: number
}

const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
} as const

function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINTS.mobile) return 'mobile'
  if (width < BREAKPOINTS.tablet) return 'tablet'
  return 'desktop'
}

export function useResponsive(): ResponsiveInfo {
  const [info, setInfo] = useState<ResponsiveInfo>(() => {
    if (typeof window === 'undefined') {
      return { breakpoint: 'desktop', isMobile: false, isTablet: false, isDesktop: true, width: 1440, height: 900 }
    }
    const w = window.innerWidth
    const h = window.innerHeight
    const bp = getBreakpoint(w)
    return {
      breakpoint: bp,
      isMobile: bp === 'mobile',
      isTablet: bp === 'tablet',
      isDesktop: bp === 'desktop',
      width: w,
      height: h,
    }
  })

  useEffect(() => {
    let rafId: number

    const handleResize = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const w = window.innerWidth
        const h = window.innerHeight
        const bp = getBreakpoint(w)
        setInfo({
          breakpoint: bp,
          isMobile: bp === 'mobile',
          isTablet: bp === 'tablet',
          isDesktop: bp === 'desktop',
          width: w,
          height: h,
        })
      })
    }

    window.addEventListener('resize', handleResize, { passive: true })
    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return info
}
