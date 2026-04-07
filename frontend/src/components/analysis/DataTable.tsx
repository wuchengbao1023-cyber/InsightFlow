/**
 * DataTable — 可交互数据表格
 * 功能：排序、翻页、搜索、行高亮、导出 CSV
 * 不需要 LLM，纯前端渲染
 */
import React, { useState, useMemo } from 'react'

export interface TableColumn {
  key: string
  title: string
  sortable?: boolean
  type?: 'text' | 'number'
  align?: 'left' | 'right' | 'center'
}

export interface TableData {
  columns: TableColumn[]
  rows: Record<string, any>[]
  total: number
  showing?: number
  page_size?: number
}

interface DataTableProps {
  data: TableData
  onRowClick?: (row: Record<string, any>) => void
  highlightMin?: string   // 高亮最小值的列名
  filterValue?: string    // 外部下钻时传入的列值过滤
}

const DataTable: React.FC<DataTableProps> = ({ data, onRowClick, highlightMin, filterValue }) => {
  const [page, setPage]           = useState(0)
  const [sortKey, setSortKey]     = useState<string | null>(null)
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc')
  const [search, setSearch]       = useState('')
  const [activeFilter, setFilter] = useState(filterValue || '')

  const PAGE_SIZE = data.page_size || 20

  // 过滤
  const filtered = useMemo(() => {
    let rows = data.rows
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(row =>
        Object.values(row).some(v => String(v ?? '').toLowerCase().includes(q))
      )
    }
    if (activeFilter) {
      rows = rows.filter(row =>
        Object.values(row).some(v => String(v ?? '') === activeFilter)
      )
    }
    return rows
  }, [data.rows, search, activeFilter])

  // 排序
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey]
      const an = parseFloat(av); const bn = parseFloat(bv)
      if (!isNaN(an) && !isNaN(bn)) return sortDir === 'asc' ? an - bn : bn - an
      return sortDir === 'asc' ? String(av ?? '').localeCompare(String(bv ?? '')) : String(bv ?? '').localeCompare(String(av ?? ''))
    })
  }, [filtered, sortKey, sortDir])

  const pageData  = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages= Math.ceil(sorted.length / PAGE_SIZE)

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(0)
  }

  // 找最小值（用于行高亮）
  const minVal = useMemo(() => {
    if (!highlightMin) return null
    const vals = data.rows.map(r => parseFloat(r[highlightMin])).filter(v => !isNaN(v))
    return vals.length > 0 ? Math.min(...vals) : null
  }, [data.rows, highlightMin])

  // 导出 CSV
  const exportCSV = () => {
    const header = data.columns.map(c => c.title).join(',')
    const body   = sorted.map(row =>
      data.columns.map(c => {
        const v = row[c.key]
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : (v ?? '')
      }).join(',')
    ).join('\n')
    const blob = new Blob(['\uFEFF' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'data_export.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (!data.columns.length || !data.rows.length) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
        暂无数据
      </div>
    )
  }

  return (
    <div style={{
      background: '#0a0f1e',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* 表格工具栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px',
        borderBottom: '1px solid #1e293b',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
          📋 原始数据
        </span>
        <span style={{ fontSize: '11px', color: '#475569' }}>
          {filtered.length === data.rows.length
            ? `共 ${data.total.toLocaleString()} 条，显示 ${sorted.length} 条`
            : `已过滤：${filtered.length} / ${data.rows.length} 条`}
        </span>

        {/* 搜索框 */}
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="搜索..."
          style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid #1e293b',
            background: '#111827',
            color: '#f1f5f9',
            fontSize: '11px',
            outline: 'none',
            width: '140px',
          }}
        />

        {/* 过滤标签 */}
        {activeFilter && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', borderRadius: '4px',
            background: '#6366f122', border: '1px solid #6366f144',
            fontSize: '11px', color: '#818cf8',
          }}>
            筛选：{activeFilter}
            <span
              style={{ cursor: 'pointer', marginLeft: '4px', color: '#475569' }}
              onClick={() => setFilter('')}
            >✕</span>
          </div>
        )}

        {/* 导出 */}
        <button
          onClick={exportCSV}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid #1e293b',
            background: '#111827',
            color: '#64748b',
            fontSize: '11px',
            cursor: 'pointer',
          }}
          title="导出 CSV"
        >
          ↓ 导出
        </button>
      </div>

      {/* 表格内容 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#0c1020' }}>
              {data.columns.map(col => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  style={{
                    padding: '8px 12px',
                    textAlign: col.align || 'left',
                    color: sortKey === col.key ? '#818cf8' : '#64748b',
                    fontWeight: 600,
                    fontSize: '11px',
                    cursor: col.sortable ? 'pointer' : 'default',
                    borderBottom: '1px solid #1e293b',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  {col.title}
                  {col.sortable && (
                    <span style={{ marginLeft: '4px', opacity: sortKey === col.key ? 1 : 0.3 }}>
                      {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, ri) => {
              const isMin = highlightMin && minVal !== null && parseFloat(row[highlightMin]) === minVal
              return (
                <tr
                  key={row._id ?? ri}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    background: isMin ? '#ef444411' : ri % 2 === 0 ? 'transparent' : '#0c1020',
                    borderLeft: isMin ? '3px solid #ef4444' : '3px solid transparent',
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#6366f111' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isMin ? '#ef444411' : ri % 2 === 0 ? 'transparent' : '#0c1020' }}
                >
                  {data.columns.map(col => (
                    <td
                      key={col.key}
                      style={{
                        padding: '7px 12px',
                        textAlign: col.align || 'left',
                        color: col.type === 'number' ? '#93c5fd' : '#cbd5e1',
                        borderBottom: '1px solid #0f172a',
                        whiteSpace: 'nowrap',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={String(row[col.key] ?? '')}
                    >
                      {row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 翻页 */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
          padding: '10px 14px',
          borderTop: '1px solid #1e293b',
        }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #1e293b', background: '#111827', color: page === 0 ? '#334155' : '#94a3b8', fontSize: '12px', cursor: page === 0 ? 'default' : 'pointer' }}
          >
            ‹ 上一页
          </button>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            第 {page + 1} / {totalPages} 页（{sorted.length} 条）
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #1e293b', background: '#111827', color: page >= totalPages - 1 ? '#334155' : '#94a3b8', fontSize: '12px', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}
          >
            下一页 ›
          </button>
        </div>
      )}
    </div>
  )
}

export default DataTable
