/**
 * reportExporter.ts - 报告导出工具 v7
 * 
 * 支持 PDF 导出（DOCX 已移除，用户不需要）
 * - PDF: 使用 html2pdf.js + DOM克隆法 + 图表截图 + 智能分页
 * 
 * v7 改进（修复空白多+分页错乱）：
 * - 移除 avoid-all 分页模式，改用 css + legacy 模式
 * - 对大 section（图表区、数据表格）前插入分页提示
 * - 缩小图表高度避免单图表超出一页
 * - 移除底部空白占位
 */

/**
 * 导出为 PDF（DOM克隆法 + 图表截图 + 智能分页）
 */
export async function exportToPDF(element: HTMLElement, filename = '分析报告.pdf') {
  try {
    const html2pdf = (await import('html2pdf.js')).default
    
    // ── Step 1: 克隆DOM ──
    const clone = element.cloneNode(true) as HTMLElement
    
    // ── Step 2: 隐藏控制栏和不需要导出的元素 ──
    clone.id = 'pdf-export-clone'
    clone.style.position = 'relative'
    clone.style.inset = 'auto'
    clone.style.width = '794px'
    clone.style.minHeight = 'auto'
    clone.style.height = 'auto'
    clone.style.overflow = 'visible'
    clone.style.backdropFilter = 'none'
    clone.style.WebkitBackdropFilter = 'none'
    clone.style.background = '#f5f7fa'
    clone.style.animation = 'none'
    clone.style.transition = 'none'
    clone.style.zIndex = '-1'
    clone.style.opacity = '1'
    clone.style.padding = '32px 40px'
    clone.style.boxSizing = 'border-box'
    clone.style.transform = 'none'
    clone.style.display = 'block'
    
    // ── Step 3: 遍历所有子元素，修正CSS ──
    clone.querySelectorAll('*').forEach(el => {
      const htmlEl = el as HTMLElement
      if (htmlEl.style) {
        // 隐藏控制栏等不需要导出的元素
        if (htmlEl.getAttribute('data-no-print') === 'true') {
          htmlEl.style.display = 'none'
          return
        }
        
        // backdropFilter 全部移除（html2canvas 不支持）
        htmlEl.style.backdropFilter = 'none'
        htmlEl.style.WebkitBackdropFilter = 'none'
        
        // fixed 改为 relative
        if (htmlEl.style.position === 'fixed') {
          htmlEl.style.position = 'relative'
          htmlEl.style.inset = 'auto'
        }
        
        // 关闭所有动画/过渡
        htmlEl.style.animation = 'none'
        htmlEl.style.transition = 'none'
        htmlEl.style.transform = 'none'
        htmlEl.style.opacity = '1'
        
        // 确保可滚动容器展开
        const computed = getComputedStyle(htmlEl)
        if (computed.overflowY === 'auto' || computed.overflowY === 'scroll') {
          htmlEl.style.overflow = 'visible'
          htmlEl.style.maxHeight = 'none'
        }
        
        // RevealSection 动画容器：强制显示
        if (htmlEl.style.opacity === '0' || htmlEl.style.transform?.includes('translateY')) {
          htmlEl.style.opacity = '1'
          htmlEl.style.transform = 'none'
        }
        
        // Collapse 组件在 PDF 中强制展开（溯源面板）
        if (htmlEl.classList.contains('ant-collapse') || htmlEl.classList.contains('ant-collapse-header')) {
          // 不做特殊处理，折叠状态就是 PDF 中应该的
        }
        
        // Ant Design Drawer 在 PDF 中不显示
        if (htmlEl.classList.contains('ant-drawer')) {
          htmlEl.style.display = 'none'
        }
      }
    })
    
    // ── Step 3.5: 优化间距，减少空白 ──
    // 报告标题区缩小 margin
    clone.querySelectorAll('[style*="margin: 0 auto 48px"]').forEach(el => {
      ;(el as HTMLElement).style.margin = '0 auto 24px'
    })
    // 移除底部多余空白
    clone.querySelectorAll('div').forEach(el => {
      const htmlEl = el as HTMLElement
      const h = parseInt(htmlEl.style.height || '')
      if (h === 60 && htmlEl.childElementCount === 0) {
        htmlEl.style.height = '20px' // 缩小底部空白
      }
    })
    // 每个 cin-report-section 的 marginBottom 缩小
    clone.querySelectorAll('.cin-report-section').forEach(el => {
      ;(el as HTMLElement).style.marginBottom = '24px'
      ;(el as HTMLElement).style.pageBreakInside = 'avoid'
    })
    
    // ── Step 4: 将 ECharts 图表转为截图 ──
    const originalCharts = element.querySelectorAll(
      '.chart-canvas-wrapper canvas, div[id^="chart-"] canvas, .echarts-for-react canvas, [data-echarts] canvas'
    )
    const chartImageMap = new Map<number, string>()
    
    originalCharts.forEach((canvas, index) => {
      try {
        const htmlCanvas = canvas as HTMLCanvasElement
        const dataURL = htmlCanvas.toDataURL('image/png', 1.0)
        chartImageMap.set(index, dataURL)
      } catch (e) {
        console.warn('图表截图失败:', e)
      }
    })
    
    if (chartImageMap.size > 0) {
      const cloneCanvases = clone.querySelectorAll('canvas')
      cloneCanvases.forEach((canvas, index) => {
        const dataURL = chartImageMap.get(index)
        if (dataURL) {
          const img = document.createElement('img')
          img.src = dataURL
          img.style.width = '100%'
          img.style.height = 'auto'
          img.style.maxHeight = '240px'
          img.style.objectFit = 'contain'
          img.style.display = 'block'
          img.style.borderRadius = '8px'
          canvas.parentNode?.replaceChild(img, canvas)
        }
      })
    }
    
    // ── Step 5: 在大 section 前插入分页提示 ──
    // 找到所有 .cin-report-section，在"图表"和"数据表格"前加分页
    const sections = clone.querySelectorAll('.cin-report-section')
    sections.forEach(section => {
      const titleEl = section.querySelector('h2, .ant-typography')
      const titleText = titleEl?.textContent || ''
      // 在"数据可视化"和"数据明细"前分页
      if (titleText.includes('数据可视化') || titleText.includes('数据明细') || titleText.includes('数据表格')) {
        ;(section as HTMLElement).style.pageBreakBefore = 'auto'
        // 插入一个小间距的分页提示
        const spacer = document.createElement('div')
        spacer.style.pageBreakBefore = 'auto'
        spacer.style.height = '8px'
        section.parentNode?.insertBefore(spacer, section)
      }
    })
    
    // ── Step 6: 插入到body渲染 ──
    document.body.appendChild(clone)
    
    await new Promise(resolve => requestAnimationFrame(resolve))
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // ── Step 7: 导出PDF ──
    const opt = {
      margin: [8, 8, 8, 8],  // mm: 上右下左（缩小页边距）
      filename,
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f5f7fa',
        scrollX: 0,
        scrollY: 0,
        windowWidth: 794,
        windowHeight: clone.scrollHeight,
        logging: false,
        allowTaint: true,
        removeContainer: true,
      },
      jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait' as const,
        compress: true,
      },
      pagebreak: { 
        // 使用 css + legacy 模式（不用 avoid-all，避免大空白）
        mode: ['css', 'legacy'],
        before: '.page-break-before',
        after: '.page-break-after',
        // 仅避免在 table 内部分页，允许 section 之间分页
        avoid: ['table', 'thead', 'tr'],
      },
    }
    
    await html2pdf().set(opt).from(clone).save()
    
    // ── Step 8: 清理克隆节点 ──
    document.body.removeChild(clone)
    
    return true
  } catch (e) {
    console.error('PDF导出失败:', e)
    const residual = document.getElementById('pdf-export-clone')
    if (residual) document.body.removeChild(residual)
    return false
  }
}

/**
 * 导出为 DOCX（已废弃，保留空函数防止编译错误）
 */
export async function exportToDOCX(_reportData: any, _filename?: string) {
  console.warn('DOCX导出已废弃，请使用PDF导出')
  return false
}

/**
 * HTML 转义
 */
export function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
