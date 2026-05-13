/**
 * BookmarkI18n — 书签国际化模块
 *
 * 功能：
 * 1. 定义所有书签相关 UI 字符串的 i18n key 映射
 * 2. 提供 zh-CN / en-US 内置语言包
 * 3. 注册语言包到全局 i18n 系统
 * 4. 提供状态标签本地化、日期格式化等工具函数
 * 5. 新增语言只需调用 registerBookmarkLocale() 并传入翻译文件
 *
 * 设计约束：
 * - 纯 JS，无构建工具依赖
 * - 与 lib/i18n.js 全局 i18n 系统集成
 * - 所有用户可见字符串通过 t() 函数获取
 * - 向后兼容：未翻译的 key 返回原始 key
 */

import {
  registerLocale,
  t as i18nT,
  setLocale as i18nSetLocale,
  getCurrentLocale,
} from './i18n.js'

// ==================== I18n Key 映射 ====================

/**
 * 书签模块所有 i18n key 的映射表
 *
 * key   = 面向开发者的简短标识（用于代码中的 bt('status.unread')）
 * value = 全局 i18n 系统中的完整 key（以 bookmark. 前缀命名空间隔离）
 */
export const BOOKMARK_I18N_KEYS = Object.freeze({
  // ─── 搜索 ───
  'search.placeholder':       'bookmark.search.placeholder',

  // ─── 过滤器 ───
  'filter.folder':            'bookmark.filter.folder',
  'filter.tag':               'bookmark.filter.tag',
  'filter.status':            'bookmark.filter.status',
  'filter.all':               'bookmark.filter.all',

  // ─── 状态 ───
  'status.unread':            'bookmark.status.unread',
  'status.reading':           'bookmark.status.reading',
  'status.read':              'bookmark.status.read',

  // ─── 统计 ───
  'stats.total':              'bookmark.stats.total',
  'stats.unread':             'bookmark.stats.unread',
  'stats.bookmarkCount':      'bookmark.stats.bookmarkCount',

  // ─── 面板状态 ───
  'panel.loading':            'bookmark.panel.loading',
  'panel.error.loadFailed':   'bookmark.panel.error.loadFailed',
  'panel.error.retry':        'bookmark.panel.error.retry',
  'panel.empty.title':        'bookmark.panel.empty.title',
  'panel.empty.refresh':      'bookmark.panel.empty.refresh',
  'panel.empty.hint':         'bookmark.panel.empty.hint',
  'panel.empty.addGuide1':    'bookmark.panel.empty.addGuide1',
  'panel.empty.addGuide2':    'bookmark.panel.empty.addGuide2',
  'panel.empty.addGuide3':    'bookmark.panel.empty.addGuide3',
  'panel.empty.addGuideTip':  'bookmark.panel.empty.addGuideTip',

  // ─── 详情面板 ───
  'panel.detail.clickHint':       'bookmark.panel.detail.clickHint',
  'panel.detail.similarBookmarks': 'bookmark.panel.detail.similarBookmarks',
  'panel.detail.similarPercent':   'bookmark.panel.detail.similarPercent',
  'panel.detail.status':           'bookmark.panel.detail.status',
  'panel.detail.tags':             'bookmark.panel.detail.tags',

  // ─── 弹窗概览 ───
  'overview.domainDistribution':  'bookmark.overview.domainDistribution',
  'overview.folderDistribution':  'bookmark.overview.folderDistribution',
  'overview.recentlyAdded':       'bookmark.overview.recentlyAdded',
  'overview.viewGraph':           'bookmark.overview.viewGraph',
  'overview.noData':              'bookmark.overview.noData',
  'overview.noResults':           'bookmark.overview.noResults',
  'overview.moreHint':            'bookmark.overview.moreHint',
  'overview.recentBookmarks':     'bookmark.overview.recentBookmarks',

  // ─── 内置集合名称 ───
  'collection.unread':            'bookmark.collection.unread',
  'collection.reading':           'bookmark.collection.reading',
  'collection.recent':            'bookmark.collection.recent',
})

// ==================== 中文语言包 ====================

export const bookmarkZhCN = Object.freeze({
  // 搜索
  'bookmark.search.placeholder': '搜索书签...',

  // 过滤器
  'bookmark.filter.folder': '文件夹',
  'bookmark.filter.tag': '标签',
  'bookmark.filter.status': '状态',
  'bookmark.filter.all': '全部{{label}}',

  // 状态
  'bookmark.status.unread': '待读',
  'bookmark.status.reading': '阅读中',
  'bookmark.status.read': '已读',

  // 统计
  'bookmark.stats.total': '书签总数',
  'bookmark.stats.unread': '待读数量',
  'bookmark.stats.bookmarkCount': '共 {{count}} 个书签',

  // 面板状态
  'bookmark.panel.loading': '正在加载书签数据...',
  'bookmark.panel.error.loadFailed': '加载失败: {{message}}',
  'bookmark.panel.error.retry': '重试',
  'bookmark.panel.empty.title': '暂无书签数据',
  'bookmark.panel.empty.refresh': '刷新书签',
  'bookmark.panel.empty.hint': '💡 您可以通过以下方式添加书签：',
  'bookmark.panel.empty.addGuide1': '在浏览器中按 <kbd>Ctrl+D</kbd> 收藏当前页面',
  'bookmark.panel.empty.addGuide2': '右键点击页面 → "为此页面添加书签"',
  'bookmark.panel.empty.addGuide3': '点击地址栏右侧的 ☆ 图标',
  'bookmark.panel.empty.addGuideTip': '添加书签后，点击下方按钮刷新。',

  // 详情面板
  'bookmark.panel.detail.clickHint': '点击图谱节点查看书签详情',
  'bookmark.panel.detail.similarBookmarks': '相似书签',
  'bookmark.panel.detail.similarPercent': '{{percent}}% 相似',
  'bookmark.panel.detail.status': '状态',
  'bookmark.panel.detail.tags': '标签',

  // 弹窗概览
  'bookmark.overview.domainDistribution': '领域分布 Top-5',
  'bookmark.overview.folderDistribution': '文件夹分布 Top-5',
  'bookmark.overview.recentlyAdded': '最近添加',
  'bookmark.overview.viewGraph': '📊 查看完整图谱',
  'bookmark.overview.noData': '暂无数据',
  'bookmark.overview.noResults': '未找到匹配的书签',
  'bookmark.overview.moreHint': '显示 {{shown}}/{{total}}，请使用搜索缩小范围',
  'bookmark.overview.recentBookmarks': '暂无书签',

  // 内置集合名称
  'bookmark.collection.unread': '未读',
  'bookmark.collection.reading': '正在阅读',
  'bookmark.collection.recent': '最近添加',
})

// ==================== 英文语言包 ====================

export const bookmarkEnUS = Object.freeze({
  // Search
  'bookmark.search.placeholder': 'Search bookmarks...',

  // Filters
  'bookmark.filter.folder': 'Folder',
  'bookmark.filter.tag': 'Tag',
  'bookmark.filter.status': 'Status',
  'bookmark.filter.all': 'All {{label}}',

  // Status
  'bookmark.status.unread': 'Unread',
  'bookmark.status.reading': 'Reading',
  'bookmark.status.read': 'Read',

  // Stats
  'bookmark.stats.total': 'Total Bookmarks',
  'bookmark.stats.unread': 'Unread',
  'bookmark.stats.bookmarkCount': '{{count}} bookmarks',

  // Panel states
  'bookmark.panel.loading': 'Loading bookmark data...',
  'bookmark.panel.error.loadFailed': 'Load failed: {{message}}',
  'bookmark.panel.error.retry': 'Retry',
  'bookmark.panel.empty.title': 'No bookmark data',
  'bookmark.panel.empty.refresh': 'Refresh Bookmarks',
  'bookmark.panel.empty.hint': '💡 You can add bookmarks by:',
  'bookmark.panel.empty.addGuide1': 'Press <kbd>Ctrl+D</kbd> in the browser to bookmark the current page',
  'bookmark.panel.empty.addGuide2': 'Right-click the page → "Bookmark this page"',
  'bookmark.panel.empty.addGuide3': 'Click the ☆ icon in the address bar',
  'bookmark.panel.empty.addGuideTip': 'After adding bookmarks, click the button below to refresh.',

  // Detail panel
  'bookmark.panel.detail.clickHint': 'Click a graph node to view bookmark details',
  'bookmark.panel.detail.similarBookmarks': 'Similar Bookmarks',
  'bookmark.panel.detail.similarPercent': '{{percent}}% similar',
  'bookmark.panel.detail.status': 'Status',
  'bookmark.panel.detail.tags': 'Tags',

  // Popup overview
  'bookmark.overview.domainDistribution': 'Top-5 Domains',
  'bookmark.overview.folderDistribution': 'Top-5 Folders',
  'bookmark.overview.recentlyAdded': 'Recently Added',
  'bookmark.overview.viewGraph': '📊 View Full Graph',
  'bookmark.overview.noData': 'No data',
  'bookmark.overview.noResults': 'No matching bookmarks found',
  'bookmark.overview.moreHint': 'Showing {{shown}}/{{total}}, use search to narrow down',
  'bookmark.overview.recentBookmarks': 'No bookmarks',

  // Built-in collections
  'bookmark.collection.unread': 'Unread',
  'bookmark.collection.reading': 'Currently Reading',
  'bookmark.collection.recent': 'Recently Added',
})

// ==================== 自动注册 ====================

// 模块加载时自动注册内置语言包到全局 i18n 系统
// 确保所有导入 bookmark-i18n.js 的模块都能正确翻译
registerLocale('zh-CN', bookmarkZhCN)
registerLocale('en-US', bookmarkEnUS)

// ==================== 注册 ====================

/**
 * 将书签语言包注册到全局 i18n 系统
 *
 * @param {Object} [options]
 * @param {Object} [options.extraLocales] - 额外语言包 { locale: messages }
 * @param {string} [options.locale] - 注册后的目标语言（不自动切换）
 */
export function registerBookmarkLocale(options = {}) {
  registerLocale('zh-CN', bookmarkZhCN)
  registerLocale('en-US', bookmarkEnUS)

  if (options.extraLocales) {
    for (const [loc, messages] of Object.entries(options.extraLocales)) {
      registerLocale(loc, messages)
    }
  }

  if (options.locale) {
    i18nSetLocale(options.locale)
  }
}

// ==================== 工具函数 ====================

/**
 * 获取本地化的状态标签
 *
 * @param {string} status — 'unread' | 'reading' | 'read'
 * @param {string} [locale] — 指定语言（默认使用当前语言）
 * @returns {string}
 */
export function getStatusLabel(status, locale) {
  if (!status) return ''

  const key = BOOKMARK_I18N_KEYS[`status.${status}`]
  if (!key) return status

  return i18nT(key, undefined, locale) || status
}

/**
 * 获取状态标签映射对象 { unread: '...', reading: '...', read: '...' }
 *
 * @param {string} [locale] — 指定语言
 * @returns {{ unread: string, reading: string, read: string }}
 */
export function getStatusLabels(locale) {
  return {
    unread: getStatusLabel('unread', locale),
    reading: getStatusLabel('reading', locale),
    read: getStatusLabel('read', locale),
  }
}

/**
 * 根据语言获取 Intl.DateTimeFormat options
 *
 * @param {string} [locale] — 语言代码
 * @returns {Object} DateTimeFormat options
 */
export function getLocaleDateOptions(locale) {
  return {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }
}

/**
 * 本地化日期格式化
 *
 * @param {number} timestamp — 时间戳 (ms)
 * @param {string} [locale] — 语言代码（默认使用当前语言）
 * @returns {string}
 */
export function formatDateByLocale(timestamp, locale) {
  if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) return ''

  const loc = locale || getCurrentLocale() || 'zh-CN'

  try {
    const dateLocale = loc === 'zh-CN' ? 'zh-CN' : loc === 'en-US' ? 'en-US' : loc
    return new Date(timestamp).toLocaleString(dateLocale, getLocaleDateOptions(loc))
  } catch {
    return ''
  }
}

/**
 * 创建书签专用翻译函数
 *
 * 自动映射短 key (如 'status.unread') 到全局 i18n key (如 'bookmark.status.unread')
 *
 * @param {string} [locale] — 指定语言
 * @returns {(key: string, params?: Object) => string}
 */
export function createBookmarkT(locale) {
  return function bt(key, params) {
    const i18nKey = BOOKMARK_I18N_KEYS[key]
    if (i18nKey) {
      return i18nT(i18nKey, params, locale)
    }
    // 如果 key 不在映射中，直接使用原始 key 查找
    return i18nT(key, params, locale)
  }
}

/**
 * 获取所有已定义的 bookmark i18n key
 * @returns {string[]}
 */
export function getAllBookmarkKeys() {
  return Object.keys(BOOKMARK_I18N_KEYS)
}

/**
 * 检查指定语言的翻译完整性
 *
 * @param {string} locale — 语言代码
 * @param {Object} messages — 语言包
 * @returns {{ complete: boolean, missing: string[] }}
 */
export function validateLocaleCompleteness(locale, messages) {
  const missing = []
  for (const [shortKey, i18nKey] of Object.entries(BOOKMARK_I18N_KEYS)) {
    if (!messages[i18nKey]) {
      missing.push(`${shortKey} → ${i18nKey}`)
    }
  }
  return {
    complete: missing.length === 0,
    missing,
  }
}
