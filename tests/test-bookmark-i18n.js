/**
 * 测试 lib/bookmark-i18n.js — BookmarkI18n
 *
 * 书签国际化 (R80):
 *   - 中英文界面切换
 *   - 所有用户可见字符串外部化
 *   - 语言偏好持久化存储
 *   - 新增语言只需添加翻译文件
 *
 * AC: 单元测试 ≥ 30 个用例
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupTestEnv } from './helpers/setup.js'

const {
  BOOKMARK_I18N_KEYS,
  bookmarkZhCN,
  bookmarkEnUS,
  registerBookmarkLocale,
  getStatusLabel,
  formatDateByLocale,
  createBookmarkT,
  getLocaleDateOptions,
} = await import('../lib/bookmark-i18n.js')

// ==================== 常量导出 ====================

describe('BookmarkI18n — 常量导出', () => {
  it('导出 BOOKMARK_I18N_KEYS 常量对象', () => {
    assert.ok(BOOKMARK_I18N_KEYS)
    assert.equal(typeof BOOKMARK_I18N_KEYS, 'object')
  })

  it('BOOKMARK_I18N_KEYS 包含搜索、过滤、状态、统计等核心 key', () => {
    const requiredKeys = [
      'search.placeholder',
      'filter.folder',
      'filter.tag',
      'filter.status',
      'filter.all',
      'status.unread',
      'status.reading',
      'status.read',
      'stats.total',
      'stats.unread',
    ]
    for (const key of requiredKeys) {
      assert.ok(
        BOOKMARK_I18N_KEYS[key],
        `Missing key mapping: ${key}`
      )
    }
  })

  it('BOOKMARK_I18N_KEYS 包含面板相关的 key', () => {
    const panelKeys = [
      'panel.loading',
      'panel.error.loadFailed',
      'panel.error.retry',
      'panel.empty.title',
      'panel.empty.refresh',
      'panel.empty.hint',
      'panel.detail.clickHint',
      'panel.detail.similarBookmarks',
    ]
    for (const key of panelKeys) {
      assert.ok(
        BOOKMARK_I18N_KEYS[key],
        `Missing panel key: ${key}`
      )
    }
  })

  it('BOOKMARK_I18N_KEYS 包含弹窗概览相关的 key', () => {
    const overviewKeys = [
      'overview.domainDistribution',
      'overview.folderDistribution',
      'overview.recentlyAdded',
      'overview.viewGraph',
      'overview.noData',
      'overview.noResults',
      'overview.moreHint',
    ]
    for (const key of overviewKeys) {
      assert.ok(
        BOOKMARK_I18N_KEYS[key],
        `Missing overview key: ${key}`
      )
    }
  })
})

// ==================== 中文语言包 ====================

describe('BookmarkI18n — 中文语言包 (bookmarkZhCN)', () => {
  it('bookmarkZhCN 是一个对象', () => {
    assert.ok(bookmarkZhCN)
    assert.equal(typeof bookmarkZhCN, 'object')
  })

  it('bookmarkZhCN 包含所有 BOOKMARK_I18N_KEYS 中定义的 key 的翻译', () => {
    for (const [key, i18nKey] of Object.entries(BOOKMARK_I18N_KEYS)) {
      assert.ok(
        bookmarkZhCN[i18nKey] !== undefined,
        `Chinese translation missing for key "${key}" → "${i18nKey}"`
      )
    }
  })

  it('bookmarkZhCN 的值都是非空字符串', () => {
    for (const [key, value] of Object.entries(bookmarkZhCN)) {
      assert.equal(typeof value, 'string', `Value for "${key}" should be string`)
      assert.ok(value.length > 0, `Value for "${key}" should not be empty`)
    }
  })

  it('bookmarkZhCN 包含正确的中文翻译 (抽样检查)', () => {
    assert.equal(bookmarkZhCN[BOOKMARK_I18N_KEYS['status.unread']], '待读')
    assert.equal(bookmarkZhCN[BOOKMARK_I18N_KEYS['status.reading']], '阅读中')
    assert.equal(bookmarkZhCN[BOOKMARK_I18N_KEYS['status.read']], '已读')
    assert.equal(bookmarkZhCN[BOOKMARK_I18N_KEYS['search.placeholder']], '搜索书签...')
    assert.equal(bookmarkZhCN[BOOKMARK_I18N_KEYS['panel.loading']], '正在加载书签数据...')
  })
})

// ==================== 英文语言包 ====================

describe('BookmarkI18n — 英文语言包 (bookmarkEnUS)', () => {
  it('bookmarkEnUS 是一个对象', () => {
    assert.ok(bookmarkEnUS)
    assert.equal(typeof bookmarkEnUS, 'object')
  })

  it('bookmarkEnUS 包含所有 BOOKMARK_I18N_KEYS 中定义的 key 的翻译', () => {
    for (const [key, i18nKey] of Object.entries(BOOKMARK_I18N_KEYS)) {
      assert.ok(
        bookmarkEnUS[i18nKey] !== undefined,
        `English translation missing for key "${key}" → "${i18nKey}"`
      )
    }
  })

  it('bookmarkEnUS 的值都是非空字符串', () => {
    for (const [key, value] of Object.entries(bookmarkEnUS)) {
      assert.equal(typeof value, 'string', `Value for "${key}" should be string`)
      assert.ok(value.length > 0, `Value for "${key}" should not be empty`)
    }
  })

  it('bookmarkEnUS 包含正确的英文翻译 (抽样检查)', () => {
    assert.equal(bookmarkEnUS[BOOKMARK_I18N_KEYS['status.unread']], 'Unread')
    assert.equal(bookmarkEnUS[BOOKMARK_I18N_KEYS['status.reading']], 'Reading')
    assert.equal(bookmarkEnUS[BOOKMARK_I18N_KEYS['status.read']], 'Read')
    assert.equal(bookmarkEnUS[BOOKMARK_I18N_KEYS['search.placeholder']], 'Search bookmarks...')
    assert.equal(bookmarkEnUS[BOOKMARK_I18N_KEYS['panel.loading']], 'Loading bookmark data...')
  })

  it('中英文语言包的 key 完全一致', () => {
    const zhKeys = Object.keys(bookmarkZhCN).sort()
    const enKeys = Object.keys(bookmarkEnUS).sort()
    assert.deepEqual(zhKeys, enKeys, 'zh-CN and en-US should have identical keys')
  })
})

// ==================== 注册机制 ====================

describe('BookmarkI18n — registerBookmarkLocale', () => {
  let env

  beforeEach(async () => {
    env = setupTestEnv()
  })

  it('registerBookmarkLocale 将 bookmark 语言包注册到 i18n 系统', async () => {
    const { t, setLocale, registerLocale } = await import('../lib/i18n.js')
    registerBookmarkLocale()
    setLocale('zh-CN')
    const result = t(BOOKMARK_I18N_KEYS['status.unread'])
    assert.equal(result, '待读')
  })

  it('切换语言后翻译结果自动更新', async () => {
    const { t, setLocale, registerLocale } = await import('../lib/i18n.js')
    registerBookmarkLocale()
    setLocale('zh-CN')
    assert.equal(t(BOOKMARK_I18N_KEYS['status.reading']), '阅读中')
    setLocale('en-US')
    assert.equal(t(BOOKMARK_I18N_KEYS['status.reading']), 'Reading')
  })

  it('注册后 i18n 系统的 getSupportedLocales 包含 zh-CN 和 en-US', async () => {
    const { getSupportedLocales } = await import('../lib/i18n.js')
    registerBookmarkLocale()
    const locales = getSupportedLocales()
    assert.ok(locales.includes('zh-CN'))
    assert.ok(locales.includes('en-US'))
  })
})

// ==================== createBookmarkT ====================

describe('BookmarkI18n — createBookmarkT', () => {
  let env

  beforeEach(async () => {
    env = setupTestEnv()
  })

  it('createBookmarkT 返回一个函数', () => {
    const bt = createBookmarkT()
    assert.equal(typeof bt, 'function')
  })

  it('createBookmarkT 的返回函数支持 BOOKMARK_I18N_KEYS 映射', async () => {
    const { setLocale } = await import('../lib/i18n.js')
    registerBookmarkLocale()
    setLocale('zh-CN')
    const bt = createBookmarkT()
    assert.equal(bt('status.unread'), '待读')
    assert.equal(bt('status.reading'), '阅读中')
    assert.equal(bt('status.read'), '已读')
  })

  it('createBookmarkT 的返回函数在英文环境下返回英文', async () => {
    const { setLocale } = await import('../lib/i18n.js')
    registerBookmarkLocale()
    setLocale('en-US')
    const bt = createBookmarkT()
    assert.equal(bt('status.unread'), 'Unread')
    assert.equal(bt('status.reading'), 'Reading')
    assert.equal(bt('status.read'), 'Read')
  })

  it('createBookmarkT 的返回函数支持参数插值', async () => {
    const { setLocale } = await import('../lib/i18n.js')
    registerBookmarkLocale()
    setLocale('zh-CN')
    const bt = createBookmarkT()
    const result = bt('stats.bookmarkCount', { count: 42 })
    assert.ok(result.includes('42'), `Should contain "42", got: ${result}`)
  })

  it('createBookmarkT 对未知 key 返回原始 key', async () => {
    const { setLocale } = await import('../lib/i18n.js')
    registerBookmarkLocale()
    setLocale('zh-CN')
    const bt = createBookmarkT()
    const result = bt('nonexistent.key')
    assert.equal(result, 'nonexistent.key')
  })
})

// ==================== getStatusLabel ====================

describe('BookmarkI18n — getStatusLabel', () => {
  let env

  beforeEach(async () => {
    env = setupTestEnv()
  })

  it('中文环境下返回中文状态标签', async () => {
    const { setLocale } = await import('../lib/i18n.js')
    registerBookmarkLocale()
    setLocale('zh-CN')
    assert.equal(getStatusLabel('unread'), '待读')
    assert.equal(getStatusLabel('reading'), '阅读中')
    assert.equal(getStatusLabel('read'), '已读')
  })

  it('英文环境下返回英文状态标签', async () => {
    const { setLocale } = await import('../lib/i18n.js')
    registerBookmarkLocale()
    setLocale('en-US')
    assert.equal(getStatusLabel('unread'), 'Unread')
    assert.equal(getStatusLabel('reading'), 'Reading')
    assert.equal(getStatusLabel('read'), 'Read')
  })

  it('未知状态返回状态码本身', async () => {
    const { setLocale } = await import('../lib/i18n.js')
    registerBookmarkLocale()
    setLocale('zh-CN')
    assert.equal(getStatusLabel('unknown'), 'unknown')
  })

  it('null/undefined 状态返回空串', async () => {
    assert.equal(getStatusLabel(null), '')
    assert.equal(getStatusLabel(undefined), '')
  })
})

// ==================== 日期格式化 ====================

describe('BookmarkI18n — formatDateByLocale', () => {
  it('对有效时间戳返回格式化日期字符串', () => {
    const ts = new Date(2026, 4, 13, 10, 30).getTime()
    const result = formatDateByLocale(ts, 'zh-CN')
    assert.equal(typeof result, 'string')
    assert.ok(result.length > 0)
  })

  it('中文环境返回包含年月日的格式', () => {
    const ts = new Date(2026, 4, 13, 10, 30).getTime()
    const result = formatDateByLocale(ts, 'zh-CN')
    assert.ok(result.includes('2026'), `Should contain year "2026", got: ${result}`)
  })

  it('英文环境返回格式化日期', () => {
    const ts = new Date(2026, 4, 13, 10, 30).getTime()
    const result = formatDateByLocale(ts, 'en-US')
    assert.equal(typeof result, 'string')
    assert.ok(result.length > 0)
    assert.ok(result.includes('2026'), `Should contain year "2026", got: ${result}`)
  })

  it('无效时间戳返回空串', () => {
    assert.equal(formatDateByLocale(null, 'zh-CN'), '')
    assert.equal(formatDateByLocale(undefined, 'zh-CN'), '')
    assert.equal(formatDateByLocale('invalid', 'zh-CN'), '')
    assert.equal(formatDateByLocale(0, 'zh-CN'), '')
  })

  it('不指定语言时使用默认语言', () => {
    const ts = new Date(2026, 4, 13, 10, 30).getTime()
    const result = formatDateByLocale(ts)
    assert.equal(typeof result, 'string')
    assert.ok(result.length > 0)
  })
})

// ==================== getLocaleDateOptions ====================

describe('BookmarkI18n — getLocaleDateOptions', () => {
  it('返回有效的 Intl.DateTimeFormat options 对象', () => {
    const opts = getLocaleDateOptions('zh-CN')
    assert.ok(opts)
    assert.equal(typeof opts, 'object')
    assert.equal(opts.year, 'numeric')
    assert.equal(opts.month, '2-digit')
    assert.equal(opts.day, '2-digit')
  })

  it('返回的 options 包含 hour 和 minute', () => {
    const opts = getLocaleDateOptions('en-US')
    assert.equal(opts.hour, '2-digit')
    assert.equal(opts.minute, '2-digit')
  })

  it('不指定语言时返回默认 options', () => {
    const opts = getLocaleDateOptions()
    assert.ok(opts)
    assert.equal(opts.year, 'numeric')
  })
})

// ==================== 语言包完整性 ====================

describe('BookmarkI18n — 语言包完整性', () => {
  it('所有 BOOKMARK_I18N_KEYS 的 value 都是非空字符串', () => {
    for (const [key, value] of Object.entries(BOOKMARK_I18N_KEYS)) {
      assert.equal(typeof value, 'string', `Key "${key}" mapping should be string`)
      assert.ok(value.startsWith('bookmark.'), `Key "${key}" mapping should start with "bookmark.", got: ${value}`)
    }
  })

  it('BOOKMARK_I18N_KEYS 中没有重复的 i18n key', () => {
    const values = Object.values(BOOKMARK_I18N_KEYS)
    const unique = new Set(values)
    assert.equal(values.length, unique.size, 'All i18n key mappings should be unique')
  })

  it('bookmarkZhCN 和 bookmarkEnUS 的 key 数量与 BOOKMARK_I18N_KEYS 的 value 数量一致', () => {
    const uniqueKeys = new Set(Object.values(BOOKMARK_I18N_KEYS))
    assert.equal(Object.keys(bookmarkZhCN).length, uniqueKeys.size, 'zh-CN should cover all keys')
    assert.equal(Object.keys(bookmarkEnUS).length, uniqueKeys.size, 'en-US should cover all keys')
  })

  it('支持插值的 key 包含 {{}} 占位符', () => {
    // 检查 bookmarkCount key 包含插值
    const countKey = BOOKMARK_I18N_KEYS['stats.bookmarkCount']
    if (countKey) {
      assert.ok(
        bookmarkZhCN[countKey].includes('{{'),
        `stats.bookmarkCount zh-CN should contain interpolation placeholder`
      )
      assert.ok(
        bookmarkEnUS[countKey].includes('{{'),
        `stats.bookmarkCount en-US should contain interpolation placeholder`
      )
    }
  })
})

