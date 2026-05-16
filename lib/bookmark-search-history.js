/**
 * BookmarkSearchHistory — 搜索历史管理模块
 *
 * 提供搜索记录管理功能:
 *   - recordSearch(query)              — 保存搜索记录（含时间戳）
 *   - getSearchHistory(limit)          — 获取最近搜索记录
 *   - getPopularSearches(limit)        — 获取最热门搜索
 *   - getSuggestions(partial)          — 根据前缀返回自动补全建议
 *   - clearHistory()                   — 清除所有历史
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 纯前端实现，内存存储，所有函数为纯函数或无副作用的管理函数
 * - const/let 优先，禁止 var，无分号风格
 */

// ==================== 类型定义 ====================

/**
 * @typedef {Object} SearchEntry
 * @property {string} id        — 唯一标识
 * @property {string} query     — 搜索关键词
 * @property {number} timestamp — 搜索时间戳（毫秒）
 * @property {number} count     — 该查询累计出现次数
 */

// ==================== 内部状态 ====================

/** @type {SearchEntry[]} */
let _history = []

/** @type {Map<string, SearchEntry>} 用于快速查找重复项 */
let _queryIndex = new Map()

/** 自增 ID 计数器 */
let _idCounter = 0

// ==================== 辅助函数 ====================

/**
 * 归一化搜索关键词：trim + 合并多余空格 + 转小写
 * @param {string} query
 * @returns {string}
 */
function normalizeQuery(query) {
  if (typeof query !== 'string') return ''
  return query
    .trim()
    .replace(/\s{2,}/g, ' ')
    .toLowerCase()
}

/**
 * 生成唯一 ID
 * @returns {string}
 */
function generateId() {
  _idCounter++
  return `sh_${_idCounter}_${Date.now()}`
}

// ==================== 公共 API ====================

/**
 * 保存搜索查询
 *
 * 如果查询已存在（归一化后相同），则更新时间戳并累加计数；
 * 否则创建新条目。
 * 空白或无效查询会被忽略。
 *
 * @param {string} query — 搜索关键词
 * @returns {SearchEntry | null} 保存的条目，无效查询返回 null
 */
export function recordSearch(query) {
  try {
    const normalized = normalizeQuery(query)
    if (!normalized) return null

    // 检查是否已存在相同查询
    const existing = _queryIndex.get(normalized)
    if (existing) {
      existing.timestamp = Date.now()
      existing.count++
      // 将该条目移到历史列表最前面
      _history = _history.filter(e => e.id !== existing.id)
      _history.unshift(existing)
      return existing
    }

    // 创建新条目
    const entry = {
      id: generateId(),
      query: normalized,
      timestamp: Date.now(),
      count: 1,
    }

    _history.unshift(entry)
    _queryIndex.set(normalized, entry)
    return entry
  } catch {
    return null
  }
}

/**
 * 获取最近搜索记录
 *
 * 按时间戳降序排列（最新的在前）。
 *
 * @param {number} [limit=20] — 返回数量上限
 * @returns {SearchEntry[]}
 */
export function getSearchHistory(limit) {
  try {
    const n = limit === undefined ? 20 : Math.max(0, Math.floor(Number(limit)))
    return _history.slice(0, n)
  } catch {
    return []
  }
}

/**
 * 获取最热门搜索
 *
 * 按出现次数降序排列，次数相同则按最新时间排序。
 *
 * @param {number} [limit=10] — 返回数量上限
 * @returns {SearchEntry[]}
 */
export function getPopularSearches(limit = 10) {
  try {
    const n = Math.max(0, Math.floor(Number(limit) || 0))
    const sorted = [..._history].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return b.timestamp - a.timestamp
    })
    return sorted.slice(0, n > 0 ? n : sorted.length)
  } catch {
    return []
  }
}

/**
 * 获取搜索自动补全建议
 *
 * 返回所有以 partial 开头（前缀匹配，归一化后）的搜索记录，
 * 按出现次数降序排列。
 *
 * @param {string} partial — 前缀关键词
 * @returns {string[]} 匹配的查询字符串列表（去重）
 */
export function getSuggestions(partial) {
  try {
    if (typeof partial !== 'string') return []
    const prefix = normalizeQuery(partial)
    if (!prefix) return []

    const matches = _history
      .filter(e => e.query.startsWith(prefix))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return b.timestamp - a.timestamp
      })

    // 去重（理论上 _queryIndex 保证唯一，这里做防御）
    const seen = new Set()
    const suggestions = []
    for (const entry of matches) {
      if (!seen.has(entry.query)) {
        seen.add(entry.query)
        suggestions.push(entry.query)
      }
    }
    return suggestions
  } catch {
    return []
  }
}

/**
 * 清除所有搜索历史
 */
export function clearHistory() {
  try {
    _history = []
    _queryIndex = new Map()
    _idCounter = 0
  } catch {
    // silently handle errors during reset
  }
}
