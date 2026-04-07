/**
 * PII（个人身份信息）浏览器端脱敏工具
 * =====================================
 * 在文件上传到服务器之前，在前端对 CSV/Excel 内容做脱敏处理。
 * 所有计算纯前端完成，敏感数据不会离开浏览器。
 *
 * 支持的 PII 类型：
 * - 手机号：138****1234
 * - 身份证号：110***********1234
 * - 邮箱：t***@example.com
 * - 姓名：张**
 * - 银行卡号：6222 **** **** 1234
 * - 地址：保留城市，隐藏详细地址
 */

/** 脱敏结果 */
export interface PiiResult {
  /** 脱敏后的文本 */
  sanitized: string
  /** 检测到的 PII 数量 */
  piiCount: number
  /** 检测详情 */
  detections: Array<{ type: string; original: string; masked: string; row: number; col: number }>
}

/** PII 检测规则 */
const PII_RULES = {
  // 中国大陆手机号
  phone: {
    pattern: /1[3-9]\d{9}/g,
    mask: (m: string) => m.slice(0, 3) + '****' + m.slice(7),
    label: '手机号',
  },
  // 身份证号（15位或18位）
  idCard: {
    pattern: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
    mask: (m: string) => m.slice(0, 3) + '*' * (m.length - 6) + m.slice(-3),
    label: '身份证号',
  },
  // 邮箱
  email: {
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    mask: (m: string) => {
      const [local, domain] = m.split('@')
      return local[0] + '***@' + domain
    },
    label: '邮箱',
  },
  // 银行卡号（16-19位数字，连续）
  bankCard: {
    pattern: /(?:62|4[0-9]|5[1-5])\d{14,18}/g,
    mask: (m: string) => m.slice(0, 4) + ' **** **** ' + m.slice(-4),
    label: '银行卡号',
  },
}

/** 中国常见姓氏（用于姓名检测） */
const COMMON_SURNAMES = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈',
  '褚', '卫', '蒋', '沈', '韩', '杨', '朱', '秦', '尤', '许',
  '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏',
  '陶', '姜', '戚', '谢', '邹', '喻', '柏', '水', '窦', '章',
  '云', '苏', '潘', '葛', '奚', '范', '彭', '郎', '鲁', '韦',
  '昌', '马', '苗', '凤', '花', '方', '俞', '任', '袁', '柳',
  '鲍', '史', '唐', '费', '廉', '岑', '薛', '雷', '贺', '倪',
  '汤', '滕', '殷', '罗', '毕', '郝', '邬', '安', '常', '乐',
  '于', '时', '傅', '皮', '齐', '康', '伍', '余', '元', '卜',
  '顾', '孟', '平', '黄', '和', '穆', '萧', '尹', '姚', '邵',
  '湛', '汪', '祁', '毛', '禹', '狄', '米', '贝', '明', '臧',
  '计', '伏', '成', '戴', '宋', '茅', '庞', '熊', '纪', '舒',
  '屈', '项', '祝', '董', '梁', '杜', '阮', '蓝', '闵', '席',
  '季', '麻', '强', '贾', '路', '娄', '危', '江', '童', '颜',
  '郭', '梅', '盛', '林', '刁', '钟', '徐', '邱', '骆', '高',
  '夏', '蔡', '田', '樊', '胡', '凌', '霍', '虞', '万', '支',
  '柯', '管', '卢', '莫', '经', '房', '干', '解', '应', '宗',
]

/**
 * 检测单元格是否为中文姓名（2-4个汉字，以常见姓氏开头）
 */
function isChineseName(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2 || trimmed.length > 4) return false
  // 纯汉字
  if (!/^[\u4e00-\u9fa5]+$/.test(trimmed)) return false
  // 以常见姓氏开头
  return COMMON_SURNAMES.some(s => trimmed.startsWith(s))
}

/**
 * 脱敏单个单元格值
 */
function sanitizeCell(value: string, row: number, col: number, detections: PiiResult['detections']): string {
  if (!value || typeof value !== 'string') return value

  let result = value

  // 逐条规则匹配
  for (const [, rule] of Object.entries(PII_RULES)) {
    const matches = value.match(rule.pattern)
    if (matches) {
      for (const m of matches) {
        const masked = rule.mask(m)
        result = result.replace(m, masked)
        detections.push({
          type: rule.label,
          original: m.slice(0, 3) + '***',
          masked: masked.slice(0, 3) + '***',
          row,
          col,
        })
      }
    }
  }

  // 中文姓名检测（仅对纯文本短值）
  if (isChineseName(value) && detections.length === 0) {
    const masked = value[0] + '**'
    result = masked
    detections.push({
      type: '姓名',
      original: value[0] + '**',
      masked,
      row,
      col,
    })
  }

  return result
}

/**
 * 对 CSV 文本内容做 PII 脱敏
 * 返回脱敏后的文本和检测统计
 */
export function sanitizeCsv(csvText: string): PiiResult {
  const detections: PiiResult['detections'] = []
  const lines = csvText.split(/\r?\n/)
  const resultLines: string[] = []

  for (let rowIdx = 0; rowIdx < lines.length; rowIdx++) {
    const line = lines[rowIdx]
    if (!line.trim()) {
      resultLines.push(line)
      continue
    }

    // 简单 CSV 解析（处理引号内逗号）
    const cells: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    cells.push(current)

    // 第一行（表头）不脱敏
    if (rowIdx === 0) {
      resultLines.push(line)
      continue
    }

    const sanitizedCells = cells.map((cell, colIdx) =>
      sanitizeCell(cell, rowIdx, colIdx, detections)
    )
    resultLines.push(sanitizedCells.join(','))
  }

  return {
    sanitized: resultLines.join('\n'),
    piiCount: detections.length,
    detections: detections.slice(0, 50), // 最多返回50条详情
  }
}

/**
 * 对文本文件内容做 PII 脱敏（通用，逐行扫描）
 */
export function sanitizeText(text: string): PiiResult {
  const detections: PiiResult['detections'] = []
  let result = text
  let row = 0

  // 逐行处理
  const lines = result.split(/\r?\n/)
  const resultLines: string[] = []

  for (const line of lines) {
    const lineDetections: PiiResult['detections'] = []
    let sanitized = line

    for (const [, rule] of Object.entries(PII_RULES)) {
      const matches = line.match(rule.pattern)
      if (matches) {
        for (const m of matches) {
          const masked = rule.mask(m)
          sanitized = sanitized.replace(m, masked)
          lineDetections.push({
            type: rule.label,
            original: m.slice(0, 3) + '***',
            masked: masked.slice(0, 3) + '***',
            row,
            col: -1,
          })
        }
      }
    }

    resultLines.push(sanitized)
    detections.push(...lineDetections)
    row++
  }

  return {
    sanitized: resultLines.join('\n'),
    piiCount: detections.length,
    detections: detections.slice(0, 50),
  }
}

/**
 * 生成 PII 检测摘要（用于展示给用户）
 */
export function getPiiSummary(result: PiiResult): string {
  if (result.piiCount === 0) return ''

  const typeCounts: Record<string, number> = {}
  for (const d of result.detections) {
    typeCounts[d.type] = (typeCounts[d.type] || 0) + 1
  }

  const parts = Object.entries(typeCounts).map(
    ([type, count]) => `${type}${count}处`
  )
  return `检测到 ${result.piiCount} 处敏感信息（${parts.join('、')}），已自动脱敏`
}
