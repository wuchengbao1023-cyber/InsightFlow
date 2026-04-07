/**
 * InsightFlow v4.1 Markdown 渲染工具
 */
import React from 'react'

/** 行内Markdown渲染（粗体、斜体、代码） */
export function renderInlineMd(text: string): React.ReactNode {
  if (!text) return null
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} style={{ fontWeight: 600 }}>{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={match.index}>{match[3]}</em>)
    } else if (match[4]) {
      parts.push(<code key={match.index} style={{
        background: '#F1F5F9', padding: '1px 5px', borderRadius: 4,
        fontSize: '0.9em', color: '#1E40AF', fontFamily: 'monospace',
      }}>{match[4]}</code>)
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

/** Markdown→HTML（用于报告区域，因为报告是已完成的静态内容） */
export function mdToHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:#F1F5F9;padding:1px 5px;border-radius:4px;font-size:12px;color:#1E40AF">$1</code>')
    .replace(/^### (.*$)/gm, '<h4 style="margin:14px 0 6px;font-weight:600;color:#0F172A;font-size:14px">$1</h4>')
    .replace(/^## (.*$)/gm, '<h3 style="margin:18px 0 8px;font-weight:700;color:#0F172A;font-size:15px">$1</h3>')
    .replace(/^- (.*$)/gm, '<div style="padding-left:16px;margin:2px 0"><span style="color:#94A3B8;margin-right:6px">•</span>$1</div>')
    .replace(/^\d+\. (.*$)/gm, '<div style="padding-left:16px;margin:2px 0">$&</div>')
    .replace(/\n/g, '<br/>')
}

/** 简单Markdown渲染（纯文本组件，不用dangerouslySetInnerHTML） */
export default function MarkdownText({ text }: { text: string }) {
  if (!text) return null
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  let inTable = false
  let tableRows: string[][] = []

  const flushTable = () => {
    if (tableRows.length === 0) return
    const headerCells = tableRows[0]
    const bodyRows = tableRows.slice(2)
    elements.push(
      <div key={`table-${elements.length}`} style={{
        overflowX: 'auto', margin: '8px 0', borderRadius: 8,
        border: '1px solid #E8ECF1',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {headerCells.map((cell, i) => (
                <th key={i} style={{
                  padding: '6px 12px', textAlign: 'left',
                  background: '#F1F5F9', borderBottom: '1px solid #E2E8F0',
                  fontWeight: 600, color: '#334155', whiteSpace: 'nowrap',
                }}>
                  {renderInlineMd(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '6px 12px', borderBottom: '1px solid #F1F5F9',
                    color: '#475569', lineHeight: 1.5,
                  }}>
                    {renderInlineMd(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableRows = []
    inTable = false
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 检测表格行
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!inTable) inTable = true
      const cells = line.split('|').slice(1, -1).map(c => c.trim())
      if (cells.some(c => /^[-:]+$/.test(c))) {
        tableRows.push(cells)
        continue
      }
      tableRows.push(cells)
      continue
    } else if (inTable) {
      flushTable()
    }

    // 代码块
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={`code-${i}`} style={{
          background: '#F8FAFC', borderRadius: 8, padding: '12px 16px',
          overflow: 'auto', fontSize: 12, lineHeight: 1.6,
          border: '1px solid #E8ECF1', margin: '8px 0',
        }}>
          <code style={{ color: '#334155' }}>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    // 标题
    if (line.startsWith('### ')) {
      elements.push(<div key={`h4-${i}`} style={{ fontWeight: 600, color: '#0F172A', marginTop: 14, marginBottom: 6, fontSize: 14 }}>{renderInlineMd(line.slice(4))}</div>)
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(<div key={`h3-${i}`} style={{ fontWeight: 700, color: '#0F172A', marginTop: 18, marginBottom: 8, fontSize: 15 }}>{renderInlineMd(line.slice(3))}</div>)
      continue
    }
    if (line.startsWith('# ')) {
      elements.push(<div key={`h2-${i}`} style={{ fontWeight: 700, color: '#0F172A', marginTop: 20, marginBottom: 10, fontSize: 16 }}>{renderInlineMd(line.slice(2))}</div>)
      continue
    }

    // 列表
    if (line.match(/^[-*]\s/)) {
      elements.push(
        <div key={`li-${i}`} style={{ paddingLeft: 16, position: 'relative', margin: '2px 0' }}>
          <span style={{ position: 'absolute', left: 4, color: '#94A3B8' }}>•</span>
          <span>{renderInlineMd(line.replace(/^[-*]\s/, ''))}</span>
        </div>
      )
      continue
    }

    // 有序列表
    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)?.[1] || '1'
      elements.push(
        <div key={`ol-${i}`} style={{ paddingLeft: 16, position: 'relative', margin: '2px 0' }}>
          <span style={{ position: 'absolute', left: 0, color: '#94A3B8', fontSize: 12 }}>{num}.</span>
          <span>{renderInlineMd(line.replace(/^\d+\.\s/, ''))}</span>
        </div>
      )
      continue
    }

    // 空行
    if (line.trim() === '') {
      elements.push(<div key={`blank-${i}`} style={{ height: 8 }} />)
      continue
    }

    // 普通段落
    elements.push(<div key={`p-${i}`} style={{ margin: '2px 0' }}>{renderInlineMd(line)}</div>)
  }

  if (inTable) flushTable()

  return <>{elements}</>
}
