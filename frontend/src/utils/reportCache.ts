/**
 * 语义缓存 - 基于文件Hash的快速报告恢复
 * ========================================
 * 用法：上传文件前先算 Hash，命中缓存则直接返回上次报告，不调后端。
 * 缓存存在 localStorage，key=文件Hash，value=报告摘要+时间戳。
 *
 * 策略：
 * - Hash 算法：SHA-256（浏览器原生 SubtleCrypto）
 * - 缓存上限：20条（LRU淘汰）
 * - 缓存有效期：24小时
 */

const CACHE_PREFIX = 'insightflow_cache_'
const CACHE_INDEX_KEY = 'insightflow_cache_index'
const MAX_CACHE_ENTRIES = 20
const CACHE_TTL_MS = 24 * 60 * 60 * 1000  // 24小时

interface CacheEntry {
  hash: string
  fileName: string
  fileSize: number
  timestamp: number
  report: any  // 完整报告数据
}

interface CacheIndex {
  entries: Array<{ hash: string; fileName: string; fileSize: number; timestamp: number }>
}

/**
 * 计算文件 SHA-256 Hash
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 获取缓存索引
 */
function getCacheIndex(): CacheIndex {
  try {
    const raw = localStorage.getItem(CACHE_INDEX_KEY)
    return raw ? JSON.parse(raw) : { entries: [] }
  } catch {
    return { entries: [] }
  }
}

/**
 * 保存缓存索引
 */
function saveCacheIndex(index: CacheIndex): void {
  try {
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index))
  } catch {
    // localStorage 满了，清理旧缓存
    clearExpiredCache()
  }
}

/**
 * 清理过期缓存
 */
function clearExpiredCache(): void {
  const index = getCacheIndex()
  const now = Date.now()

  // 删除过期条目
  const validEntries = index.entries.filter(e => {
    if (now - e.timestamp > CACHE_TTL_MS) {
      try { localStorage.removeItem(CACHE_PREFIX + e.hash) } catch {}
      return false
    }
    return true
  })

  index.entries = validEntries
  saveCacheIndex(index)
}

/**
 * LRU 淘汰：超过上限时删除最旧的
 */
function evictIfNeeded(): void {
  const index = getCacheIndex()
  if (index.entries.length >= MAX_CACHE_ENTRIES) {
    // 按时间排序，删掉最旧的
    index.entries.sort((a, b) => a.timestamp - b.timestamp)
    const toRemove = index.entries.slice(0, index.entries.length - MAX_CACHE_ENTRIES + 1)
    for (const entry of toRemove) {
      try { localStorage.removeItem(CACHE_PREFIX + entry.hash) } catch {}
    }
    index.entries = index.entries.slice(toRemove.length)
    saveCacheIndex(index)
  }
}

/**
 * 检查文件是否有缓存命中
 * 返回 null 表示未命中，否则返回缓存中的报告
 */
export function getCache(hash: string): { report: any; cachedAt: Date; age: string } | null {
  clearExpiredCache()

  try {
    const raw = localStorage.getItem(CACHE_PREFIX + hash)
    if (!raw) return null

    const entry: CacheEntry = JSON.parse(raw)
    const ageMs = Date.now() - entry.timestamp

    // 检查过期
    if (ageMs > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + hash)
      return null
    }

    const ageStr = formatAge(ageMs)

    return {
      report: entry.report,
      cachedAt: new Date(entry.timestamp),
      age: ageStr,
    }
  } catch {
    return null
  }
}

/**
 * 保存报告到缓存
 */
export function saveCache(hash: string, file: File, report: any): void {
  evictIfNeeded()

  const entry: CacheEntry = {
    hash,
    fileName: file.name,
    fileSize: file.size,
    timestamp: Date.now(),
    report,
  }

  try {
    localStorage.setItem(CACHE_PREFIX + hash, JSON.stringify(entry))

    // 更新索引
    const index = getCacheIndex()
    // 移除同 hash 的旧索引
    index.entries = index.entries.filter(e => e.hash !== hash)
    index.entries.push({
      hash,
      fileName: file.name,
      fileSize: file.size,
      timestamp: entry.timestamp,
    })
    saveCacheIndex(index)
  } catch (e) {
    console.warn('缓存保存失败:', e)
  }
}

/**
 * 格式化缓存时间
 */
function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

/**
 * 获取所有缓存条目（用于管理界面）
 */
export function getCacheEntries(): Array<{ hash: string; fileName: string; fileSize: number; timestamp: number }> {
  clearExpiredCache()
  return getCacheIndex().entries
}

/**
 * 清除所有缓存
 */
export function clearAllCache(): void {
  const index = getCacheIndex()
  for (const entry of index.entries) {
    try { localStorage.removeItem(CACHE_PREFIX + entry.hash) } catch {}
  }
  try { localStorage.removeItem(CACHE_INDEX_KEY) } catch {}
}

/**
 * 删除指定缓存
 */
export function deleteCache(hash: string): void {
  try { localStorage.removeItem(CACHE_PREFIX + hash) } catch {}
  const index = getCacheIndex()
  index.entries = index.entries.filter(e => e.hash !== hash)
  saveCacheIndex(index)
}
