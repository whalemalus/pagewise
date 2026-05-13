/**
 * BookmarkImportExport — 书签导入导出模块
 *
 * 提供书签数据的多格式导出与导入功能:
 *   - exportToHTML(bookmarks)      — 导出为 Chrome 书签 HTML 格式
 *   - exportToJSON(bookmarks)      — 导出为 JSON 字符串
 *   - exportToCSV(bookmarks)       — 导出为 CSV 字符串
 *   - importFromHTML(htmlString)   — 从 Chrome 书签 HTML 解析书签数组
 *   - importFromJSON(jsonString)   — 从 JSON 字符串解析书签数组
 *   - validateImportData(data)     — 校验导入数据的合法性
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 纯函数，无副作用
 * - const/let 优先，禁止 var，无分号风格
 */

// ==================== 类型定义 ====================

/**
 * @typedef {Object} Bookmark
 * @property {string}   id          — 唯一标识
 * @property {string}   title       — 书签标题
 * @property {string}   url         — 书签 URL
 * @property {string[]} folderPath  — 文件夹路径（每级一个元素）
 * @property {number}   dateAdded   — 添加时间（Chrome 微秒时间戳或毫秒时间戳）
 * @property {string}   dateAddedISO — ISO 8601 格式时间
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}   valid  — 是否合法
 * @property {string[]}  errors — 错误信息列表
 */

// ==================== 导出: HTML ====================

/**
 * 将书签数组导出为 Chrome 书签 HTML 格式
 * （NETSCAPE-Bookmark-file-1 标准格式）
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @returns {string} Chrome 书签 HTML 字符串
 */
export function exportToHTML(bookmarks) {
  if (!Array.isArray(bookmarks)) return _htmlShell('')

  const folderGroups = _groupByFolder(bookmarks)
  const body = _buildHtmlTree(folderGroups)
  return _htmlShell(body)
}

/**
 * 生成 HTML 外壳（含 DOCTYPE 和元信息）
 *
 * @param {string} body — 内容 HTML
 * @returns {string} 完整 HTML
 * @private
 */
function _htmlShell(body) {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    body,
    '</DL><p>'
  ]
  return lines.join('\n')
}

/**
 * 按文件夹路径对书签分组
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @returns {Map<string, Bookmark[]>} 文件夹路径 → 书签数组
 * @private
 */
function _groupByFolder(bookmarks) {
  const groups = new Map()
  for (const bm of bookmarks) {
    const key = Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(bm)
  }
  return groups
}

/**
 * 递归构建 HTML 树结构
 *
 * 从根路径（空字符串）开始，递归生成每一层的文件夹和书签。
 * 子文件夹的 HTML 通过递归调用正确嵌套在父 `<DL>` 内。
 *
 * @param {Map<string, Bookmark[]>} folderGroups — 分组后的书签
 * @returns {string} HTML 内容
 * @private
 */
function _buildHtmlTree(folderGroups) {
  return _buildFolderHtml('', folderGroups)
}

/**
 * 递归生成指定路径下的文件夹 HTML
 *
 * @param {string} path — 当前文件夹路径（空字符串表示根）
 * @param {Map<string, Bookmark[]>} folderGroups — 分组映射
 * @returns {string} 该路径对应的 `<DL><p>...</DL><p>` HTML
 * @private
 */
function _buildFolderHtml(path, folderGroups) {
  const items = folderGroups.get(path) || []
  const depth = path ? path.split('/').length : 0

  // 找出此路径的直接子文件夹
  // 先过滤出以此路径为前缀的键，再提取下一级文件夹名
  const pathPrefix = path ? path + '/' : ''
  const seen = new Map()
  for (const [key] of folderGroups) {
    if (key === path) continue
    if (!key.startsWith(pathPrefix)) continue
    const remainder = key.slice(pathPrefix.length)
    const parts = remainder.split('/')
    const name = parts[0]
    if (name && !seen.has(name)) {
      seen.set(name, path ? path + '/' + name : name)
    }
  }

  const indent = '    '
  const lines = ['<DL><p>']
  // 子文件夹
  for (const [name, fullPath] of seen) {
    lines.push(`${indent}<DT><H3>${_escapeHtml(name)}</H3>`)
    lines.push(_buildFolderHtml(fullPath, folderGroups))
  }
  // 书签条目
  for (const bm of items) {
    const addDate = _toChromeTimestamp(bm.dateAdded)
    lines.push(`${indent}<DT><A HREF="${_escapeAttr(bm.url)}" ADD_DATE="${addDate}">${_escapeHtml(bm.title || '')}</A>`)
  }
  lines.push('</DL><p>')
  return lines.join('\n')
}

// ==================== 导出: JSON ====================

/**
 * 将书签数组导出为 JSON 字符串
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @returns {string} 格式化的 JSON 字符串
 */
export function exportToJSON(bookmarks) {
  if (!Array.isArray(bookmarks)) return '[]'
  const data = bookmarks.map(bm => ({
    id: String(bm.id || ''),
    title: bm.title || '',
    url: bm.url || '',
    folderPath: Array.isArray(bm.folderPath) ? [...bm.folderPath] : [],
    dateAdded: bm.dateAdded || 0,
    dateAddedISO: bm.dateAddedISO || ''
  }))
  return JSON.stringify(data, null, 2)
}

// ==================== 导出: CSV ====================

/**
 * 将书签数组导出为 CSV 字符串
 *
 * 列: title, url, folderPath, dateAddedISO, id
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @returns {string} CSV 字符串（含表头，UTF-8 BOM）
 */
export function exportToCSV(bookmarks) {
  if (!Array.isArray(bookmarks)) return ''

  const BOM = '﻿'
  const header = 'title,url,folderPath,dateAddedISO,id'
  const rows = bookmarks.map(bm => {
    const title = _csvEscape(bm.title || '')
    const url = _csvEscape(bm.url || '')
    const folderPath = _csvEscape(
      Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : ''
    )
    const dateAddedISO = _csvEscape(bm.dateAddedISO || '')
    const id = _csvEscape(String(bm.id || ''))
    return `${title},${url},${folderPath},${dateAddedISO},${id}`
  })
  return BOM + [header, ...rows].join('\n')
}

/**
 * CSV 字段转义（含逗号、双引号、换行时用双引号包裹）
 *
 * @param {string} value — 原始值
 * @returns {string} 转义后的值
 * @private
 */
function _csvEscape(value) {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

// ==================== 导入: HTML ====================

/**
 * 从 Chrome 书签 HTML 格式解析书签数组
 *
 * 使用基于标签扫描的解析器（非正则），确保正确处理
 * HREF 属性中包含 &amp;、&quot; 等 HTML 实体的 URL。
 *
 * Chrome 书签 HTML 的 DL 结构:
 *   根 DL（无名称，外层容器）→ 子 DL（每个一个文件夹/书签容器）
 *
 * 采用「DL 深度 × 文件夹栈」策略：
 *   - 每遇 <DL> depth++，每遇 </DL> depth--
 *   - 每遇 <DT><H3> → 将文件夹名压入栈，并记录其 DL 深度
 *   - 每遇 </DL> 且深度匹配 → 弹出对应的文件夹
 *   - 书签始终以当前文件夹栈为 folderPath
 *
 * @param {string} htmlString — Chrome 书签 HTML 字符串
 * @returns {Bookmark[]} 解析后的书签数组
 */
export function importFromHTML(htmlString) {
  if (typeof htmlString !== 'string' || !htmlString.trim()) return []

  const bookmarks = []
  const folderStack = []
  // 记录每个文件夹对应的 DL 深度（用于在 </DL> 时精确弹出）
  const folderDepths = []
  let depth = 0

  const tagRegex = /<(?:\/DL|DL|DT>\s*<H3|DT>\s*<A)\b/gi

  let pos = 0

  while (pos < htmlString.length) {
    tagRegex.lastIndex = pos
    const match = tagRegex.exec(htmlString)
    if (!match) break

    const tagStart = match.index
    const tagText = match[0]
    const tagName = tagText.replace(/^<\s*/, '')
    pos = tagStart + tagText.length

    // <DL> — 进入新层级
    if (/^DL\b/i.test(tagName)) {
      depth++
      continue
    }

    // </DL> — 离开当前层级
    if (/^\/DL\b/i.test(tagName)) {
      depth--
      // 精确弹出：只在深度匹配时弹出文件夹
      if (folderDepths.length && folderDepths[folderDepths.length - 1] === depth) {
        folderDepths.pop()
        folderStack.pop()
      }
      continue
    }

    // <DT><H3 ...>name</H3> — 文件夹标题
    const h3Match = htmlString.slice(tagStart).match(
      /^<DT>\s*<H3[^>]*>([\s\S]*?)<\/H3>/i
    )
    if (h3Match) {
      const folderName = _unescapeHtml(h3Match[1].trim())
      // 文件夹的 DL 容器在下一轮 <DL> 时 depth++（变为 depth+1），
      // 其 </DL> 关闭时 depth 回到当前 depth，此时弹出
      folderStack.push(folderName)
      folderDepths.push(depth)
      pos = tagStart + h3Match[0].length
      continue
    }

    // <DT><A ...>title</A> — 书签链接
    const aMatch = htmlString.slice(tagStart).match(
      /^<DT>\s*<A\b([\s\S]*?)<\/A>/i
    )
    if (aMatch) {
      const attrsAndContent = aMatch[1]
      // 提取 HREF 属性值
      const hrefMatch = attrsAndContent.match(/\bHREF\s*=\s*"([\s\S]*?)"/i)
      const url = hrefMatch ? _unescapeHtml(hrefMatch[1]) : ''

      // 提取 ADD_DATE 属性值
      const addMatch = attrsAndContent.match(/\bADD_DATE\s*=\s*"(\d+)"/i)
      const dateAdded = addMatch ? parseInt(addMatch[1], 10) : 0

      // 提取链接文本（最后一个 > 之后的内容）
      const lastGt = attrsAndContent.lastIndexOf('>')
      const title = lastGt >= 0
        ? _unescapeHtml(attrsAndContent.slice(lastGt + 1).trim())
        : ''

      if (url) {
        bookmarks.push({
          id: _generateId(),
          title,
          url,
          folderPath: [...folderStack],
          dateAdded,
          dateAddedISO: dateAdded ? _fromChromeTimestamp(dateAdded) : ''
        })
      }
      pos = tagStart + aMatch[0].length
      continue
    }

    // 无法识别的 DT 标签，跳过
    pos = tagStart + tagText.length
  }

  return bookmarks
}

// ==================== 导入: JSON ====================

/**
 * 从 JSON 字符串解析书签数组
 *
 * @param {string} jsonString — JSON 字符串
 * @returns {Bookmark[]} 解析后的书签数组
 * @throws {Error} JSON 解析失败时抛出错误
 */
export function importFromJSON(jsonString) {
  if (typeof jsonString !== 'string') {
    throw new Error('importFromJSON: 输入必须是字符串')
  }

  const data = JSON.parse(jsonString)
  const items = Array.isArray(data) ? data : [data]

  return items.map(item => ({
    id: String(item.id || _generateId()),
    title: item.title || '',
    url: item.url || '',
    folderPath: Array.isArray(item.folderPath) ? [...item.folderPath] : [],
    dateAdded: item.dateAdded || 0,
    dateAddedISO: item.dateAddedISO || ''
  }))
}

// ==================== 校验 ====================

/**
 * 校验导入数据的合法性
 *
 * 检查项:
 * 1. 数据必须是非空数组
 * 2. 每条书签必须包含 title 字段
 * 3. 每条书签必须包含 url 字段，且格式合法
 * 4. folderPath（如存在）必须是数组
 * 5. dateAdded（如存在）必须是数字
 *
 * @param {any} data — 待校验数据
 * @returns {ValidationResult} 校验结果
 */
export function validateImportData(data) {
  const errors = []

  if (!data) {
    errors.push('数据为空')
    return { valid: false, errors }
  }

  const items = Array.isArray(data) ? data : [data]

  if (items.length === 0) {
    errors.push('书签列表为空')
    return { valid: false, errors }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const prefix = `书签[${i}]`

    // 对象检查
    if (!item || typeof item !== 'object') {
      errors.push(`${prefix}: 必须是对象`)
      continue
    }

    // title 检查
    if (!item.title || typeof item.title !== 'string') {
      errors.push(`${prefix}: 缺少有效的 title 字段`)
    }

    // url 检查
    if (!item.url || typeof item.url !== 'string') {
      errors.push(`${prefix}: 缺少有效的 url 字段`)
    } else {
      // 基本 URL 格式校验
      const urlPattern = /^(https?|ftp|file|chrome|chrome-extension|moz-extension):\/\/.+$/i
      if (!urlPattern.test(item.url)) {
        // 允许 javascript: 和 data: URL
        if (!/^javascript:/i.test(item.url) && !/^data:/i.test(item.url)) {
          errors.push(`${prefix}: url 格式不合法 — "${item.url.slice(0, 80)}"`)
        }
      }
    }

    // folderPath 检查
    if (item.folderPath !== undefined && !Array.isArray(item.folderPath)) {
      errors.push(`${prefix}: folderPath 必须是数组`)
    }

    // dateAdded 检查
    if (item.dateAdded !== undefined && typeof item.dateAdded !== 'number') {
      errors.push(`${prefix}: dateAdded 必须是数字`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ==================== 工具函数 ====================

/**
 * HTML 实体转义
 *
 * @param {string} str — 原始字符串
 * @returns {string} 转义后的字符串
 * @private
 */
function _escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * HTML 属性转义（与 _escapeHtml 相同，语义区分）
 *
 * @param {string} str — 原始字符串
 * @returns {string} 转义后的字符串
 * @private
 */
function _escapeAttr(str) {
  return _escapeHtml(str)
}

/**
 * HTML 实体反转义
 *
 * @param {string} str — 包含 HTML 实体的字符串
 * @returns {string} 反转义后的字符串
 * @private
 */
function _unescapeHtml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}

/**
 * 将时间戳转换为 Chrome 书签时间戳（秒）
 * Chrome 书签使用 Unix 秒时间戳
 * 输入可能是毫秒或 Chrome 微秒（> 1e15）
 *
 * @param {number} timestamp — 时间戳
 * @returns {number} 秒级时间戳
 * @private
 */
function _toChromeTimestamp(timestamp) {
  if (!timestamp) return 0
  // Chrome 微秒 → 秒
  if (timestamp > 1e15) return Math.floor(timestamp / 1e6)
  // 毫秒 → 秒
  if (timestamp > 1e12) return Math.floor(timestamp / 1e3)
  // 已经是秒
  return Math.floor(timestamp)
}

/**
 * 从 Chrome 书签秒时间戳生成 ISO 字符串
 *
 * @param {number} chromeTimestamp — 秒级时间戳
 * @returns {string} ISO 8601 字符串
 * @private
 */
function _fromChromeTimestamp(chromeTimestamp) {
  if (!chromeTimestamp) return ''
  // 如果是微秒（Chrome 有些地方用微秒）
  const ms = chromeTimestamp > 1e15
    ? chromeTimestamp / 1e3
    : chromeTimestamp > 1e12
      ? chromeTimestamp
      : chromeTimestamp * 1000
  try {
    return new Date(ms).toISOString()
  } catch {
    return ''
  }
}

/**
 * 生成简短唯一 ID
 *
 * @returns {string} 8 位十六进制 ID
 * @private
 */
function _generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
