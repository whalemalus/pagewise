/**
 * 测试 lib/bookmark-notifier.js — 书签通知系统
 *
 * 测试范围:
 *   BookmarkNotifier 构造 / notifyDeadLinks / notifyNewBookmarks
 *   notifyDuplicates / notifyBackupComplete / setNotificationPrefs
 *   getNotificationPrefs / getNotificationHistory / clearHistory
 *   getStats / 通知合并 / 类型禁用 / 全局开关
 *   边界情况 / 常量导出
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  BookmarkNotifier,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_LEVELS,
  DEFAULT_LEVELS,
  DEFAULT_CHANNEL,
  MAX_HISTORY,
  MERGE_INTERVAL,
} = await import('../lib/bookmark-notifier.js')

// ==================== 测试辅助 ====================

/**
 * 创建测试环境，返回 notifier 和捕获的通知列表
 */
function createTestEnv(initialTime = 1000000) {
  let currentTime = initialTime
  const dispatched = []

  const fakeDispatch = (notification) => {
    dispatched.push(notification)
  }

  const fakeNow = () => currentTime

  const notifier = new BookmarkNotifier({
    dispatch: fakeDispatch,
    now: fakeNow,
  })

  const advanceTime = (ms) => { currentTime += ms }
  const getDispatched = () => [...dispatched]
  const clearDispatched = () => { dispatched.length = 0 }

  return { notifier, advanceTime, getDispatched, clearDispatched, fakeNow: () => currentTime }
}

// ==================== 构造函数 ====================

describe('BookmarkNotifier 构造', () => {
  it('应创建通知器实例', () => {
    const notifier = new BookmarkNotifier()
    assert.ok(notifier instanceof BookmarkNotifier)
  })

  it('应有默认偏好设置', () => {
    const notifier = new BookmarkNotifier()
    const prefs = notifier.getNotificationPrefs()
    assert.equal(prefs.enabled, true)
    assert.deepEqual(prefs.channels, ['browser'])
    assert.equal(prefs.sound, false)
    assert.equal(prefs.mergeInterval, MERGE_INTERVAL)
  })

  it('应有空的历史记录', () => {
    const notifier = new BookmarkNotifier()
    const history = notifier.getNotificationHistory()
    assert.equal(history.length, 0)
  })

  it('应有零统计', () => {
    const notifier = new BookmarkNotifier()
    const stats = notifier.getStats()
    assert.equal(stats.totalSent, 0)
    assert.equal(stats.historySize, 0)
    assert.deepEqual(stats.byType, {})
  })
})

// ==================== 常量导出 ====================

describe('常量导出', () => {
  it('应导出正确的 NOTIFICATION_TYPES', () => {
    assert.deepEqual(NOTIFICATION_TYPES, ['dead-links', 'new-bookmarks', 'duplicates', 'backup-complete'])
  })

  it('应导出正确的 NOTIFICATION_CHANNELS', () => {
    assert.deepEqual(NOTIFICATION_CHANNELS, ['browser', 'badge', 'sound'])
  })

  it('应导出正确的 NOTIFICATION_LEVELS', () => {
    assert.deepEqual(NOTIFICATION_LEVELS, ['info', 'warning', 'error'])
  })

  it('应导出 DEFAULT_LEVELS 映射', () => {
    assert.equal(DEFAULT_LEVELS['dead-links'], 'warning')
    assert.equal(DEFAULT_LEVELS['new-bookmarks'], 'info')
    assert.equal(DEFAULT_LEVELS['duplicates'], 'warning')
    assert.equal(DEFAULT_LEVELS['backup-complete'], 'info')
  })

  it('应导出 DEFAULT_CHANNEL', () => {
    assert.equal(DEFAULT_CHANNEL, 'browser')
  })

  it('应导出 MAX_HISTORY 和 MERGE_INTERVAL', () => {
    assert.equal(MAX_HISTORY, 500)
    assert.equal(MERGE_INTERVAL, 5000)
  })
})

// ==================== notifyDeadLinks ====================

describe('notifyDeadLinks', () => {
  it('应通知死链并返回 sent=true', () => {
    const { notifier, getDispatched } = createTestEnv()
    const links = [
      { url: 'https://example.com/404', title: 'Missing Page', status: 404 },
      { url: 'https://example.com/500', title: 'Server Error', status: 500 },
    ]
    const result = notifier.notifyDeadLinks(links)

    assert.equal(result.sent, true)
    assert.equal(result.reason, null)
    assert.ok(result.notification)
    assert.equal(result.notification.type, 'dead-links')
    assert.equal(result.notification.data.count, 2)
    assert.equal(getDispatched().length, 1)
  })

  it('应包含死链详情在 notification.data 中', () => {
    const { notifier } = createTestEnv()
    const links = [
      { url: 'https://a.com', title: 'A', status: 404 },
      { url: 'https://b.com', title: 'B', status: 403 },
    ]
    const result = notifier.notifyDeadLinks(links)

    assert.equal(result.notification.data.links.length, 2)
    assert.equal(result.notification.data.links[0].url, 'https://a.com')
    assert.equal(result.notification.data.links[1].status, 403)
  })

  it('空数组应返回 sent=false', () => {
    const { notifier } = createTestEnv()
    const result = notifier.notifyDeadLinks([])
    assert.equal(result.sent, false)
    assert.equal(result.reason, 'no-dead-links')
  })

  it('死链 > 10 个时 level 应为 error', () => {
    const { notifier } = createTestEnv()
    const links = Array.from({ length: 11 }, (_, i) => ({
      url: `https://example.com/${i}`,
      status: 404,
    }))
    const result = notifier.notifyDeadLinks(links)
    assert.equal(result.notification.level, 'error')
  })

  it('死链 <= 10 个时使用默认级别 warning', () => {
    const { notifier } = createTestEnv()
    const links = [{ url: 'https://example.com/1', status: 404 }]
    const result = notifier.notifyDeadLinks(links)
    assert.equal(result.notification.level, 'warning')
  })

  it('应拒绝非数组参数', () => {
    const { notifier } = createTestEnv()
    assert.throws(() => notifier.notifyDeadLinks('not-array'), /links 必须是数组/)
    assert.throws(() => notifier.notifyDeadLinks(null), /links 必须是数组/)
  })
})

// ==================== notifyNewBookmarks ====================

describe('notifyNewBookmarks', () => {
  it('应通知新书签并返回 sent=true', () => {
    const { notifier, getDispatched } = createTestEnv()
    const result = notifier.notifyNewBookmarks(5)

    assert.equal(result.sent, true)
    assert.ok(result.notification)
    assert.equal(result.notification.type, 'new-bookmarks')
    assert.equal(result.notification.data.count, 5)
    assert.ok(result.notification.title.includes('5'))
    assert.equal(getDispatched().length, 1)
  })

  it('count=0 应返回 sent=false', () => {
    const { notifier } = createTestEnv()
    const result = notifier.notifyNewBookmarks(0)
    assert.equal(result.sent, false)
    assert.equal(result.reason, 'zero-count')
  })

  it('应拒绝负数', () => {
    const { notifier } = createTestEnv()
    assert.throws(() => notifier.notifyNewBookmarks(-1), /非负数字/)
  })

  it('应拒绝非数字', () => {
    const { notifier } = createTestEnv()
    assert.throws(() => notifier.notifyNewBookmarks('5'), /非负数字/)
    assert.throws(() => notifier.notifyNewBookmarks(NaN), /非负数字/)
    assert.throws(() => notifier.notifyNewBookmarks(Infinity), /非负数字/)
    assert.throws(() => notifier.notifyNewBookmarks(null), /非负数字/)
  })
})

// ==================== notifyDuplicates ====================

describe('notifyDuplicates', () => {
  it('应通知重复书签并返回 sent=true', () => {
    const { notifier, getDispatched } = createTestEnv()
    const result = notifier.notifyDuplicates(3)

    assert.equal(result.sent, true)
    assert.ok(result.notification)
    assert.equal(result.notification.type, 'duplicates')
    assert.equal(result.notification.data.count, 3)
    assert.equal(getDispatched().length, 1)
  })

  it('count=0 应返回 sent=false', () => {
    const { notifier } = createTestEnv()
    const result = notifier.notifyDuplicates(0)
    assert.equal(result.sent, false)
    assert.equal(result.reason, 'zero-count')
  })

  it('应拒绝负数', () => {
    const { notifier } = createTestEnv()
    assert.throws(() => notifier.notifyDuplicates(-1), /非负数字/)
  })
})

// ==================== notifyBackupComplete ====================

describe('notifyBackupComplete', () => {
  it('应通知备份完成并返回 sent=true', () => {
    const { notifier, getDispatched } = createTestEnv()
    const result = notifier.notifyBackupComplete('/backups/bookmarks-2026.html')

    assert.equal(result.sent, true)
    assert.ok(result.notification)
    assert.equal(result.notification.type, 'backup-complete')
    assert.equal(result.notification.data.path, '/backups/bookmarks-2026.html')
    assert.ok(result.notification.body.includes('bookmarks-2026'))
    assert.equal(getDispatched().length, 1)
  })

  it('应拒绝空字符串', () => {
    const { notifier } = createTestEnv()
    assert.throws(() => notifier.notifyBackupComplete(''), /非空字符串/)
    assert.throws(() => notifier.notifyBackupComplete('   '), /非空字符串/)
  })

  it('应拒绝非字符串', () => {
    const { notifier } = createTestEnv()
    assert.throws(() => notifier.notifyBackupComplete(123), /非空字符串/)
    assert.throws(() => notifier.notifyBackupComplete(null), /非空字符串/)
  })
})

// ==================== setNotificationPrefs / getNotificationPrefs ====================

describe('setNotificationPrefs', () => {
  it('应部分更新 enabled', () => {
    const { notifier } = createTestEnv()
    const prefs = notifier.setNotificationPrefs({ enabled: false })
    assert.equal(prefs.enabled, false)
    // 其他字段不变
    assert.deepEqual(prefs.channels, ['browser'])
  })

  it('应更新 channels', () => {
    const { notifier } = createTestEnv()
    const prefs = notifier.setNotificationPrefs({ channels: ['browser', 'badge'] })
    assert.deepEqual(prefs.channels, ['browser', 'badge'])
  })

  it('应更新 levels', () => {
    const { notifier } = createTestEnv()
    const prefs = notifier.setNotificationPrefs({
      levels: { 'dead-links': 'error' },
    })
    assert.equal(prefs.levels['dead-links'], 'error')
    // 其他级别不变
    assert.equal(prefs.levels['new-bookmarks'], 'info')
  })

  it('应更新 types (禁用特定类型)', () => {
    const { notifier } = createTestEnv()
    const prefs = notifier.setNotificationPrefs({
      types: { 'dead-links': false },
    })
    assert.equal(prefs.types['dead-links'], false)
  })

  it('应更新 sound', () => {
    const { notifier } = createTestEnv()
    const prefs = notifier.setNotificationPrefs({ sound: true })
    assert.equal(prefs.sound, true)
  })

  it('应更新 mergeInterval', () => {
    const { notifier } = createTestEnv()
    const prefs = notifier.setNotificationPrefs({ mergeInterval: 10000 })
    assert.equal(prefs.mergeInterval, 10000)
  })

  it('应拒绝非对象参数', () => {
    const { notifier } = createTestEnv()
    assert.throws(() => notifier.setNotificationPrefs(null), /prefs 必须是对象/)
    assert.throws(() => notifier.setNotificationPrefs('str'), /prefs 必须是对象/)
  })

  it('应拒绝非法 channels', () => {
    const { notifier } = createTestEnv()
    assert.throws(
      () => notifier.setNotificationPrefs({ channels: ['invalid'] }),
      /不支持的通知渠道/
    )
  })

  it('应拒绝非法 levels', () => {
    const { notifier } = createTestEnv()
    assert.throws(
      () => notifier.setNotificationPrefs({ levels: { 'dead-links': 'critical' } }),
      /不支持的通知级别/
    )
  })

  it('应拒绝非布尔 enabled', () => {
    const { notifier } = createTestEnv()
    assert.throws(() => notifier.setNotificationPrefs({ enabled: 'yes' }), /布尔值/)
  })

  it('应拒绝非布尔 types 值', () => {
    const { notifier } = createTestEnv()
    assert.throws(
      () => notifier.setNotificationPrefs({ types: { 'dead-links': 'yes' } }),
      /布尔值/
    )
  })

  it('应拒绝非法 mergeInterval', () => {
    const { notifier } = createTestEnv()
    assert.throws(() => notifier.setNotificationPrefs({ mergeInterval: -1 }), /非负数字/)
    assert.throws(() => notifier.setNotificationPrefs({ mergeInterval: 'fast' }), /非负数字/)
  })

  it('返回的 prefs 应是副本 (不影响内部状态)', () => {
    const { notifier } = createTestEnv()
    const prefs1 = notifier.getNotificationPrefs()
    prefs1.enabled = false
    const prefs2 = notifier.getNotificationPrefs()
    assert.equal(prefs2.enabled, true)
  })
})

// ==================== 全局开关禁用 ====================

describe('全局开关禁用', () => {
  it('disabled 时所有通知应返回 sent=false', () => {
    const { notifier } = createTestEnv()
    notifier.setNotificationPrefs({ enabled: false })

    const r1 = notifier.notifyDeadLinks([{ url: 'https://x.com', status: 404 }])
    assert.equal(r1.sent, false)
    assert.equal(r1.reason, 'disabled')

    const r2 = notifier.notifyNewBookmarks(5)
    assert.equal(r2.sent, false)
    assert.equal(r2.reason, 'disabled')

    const r3 = notifier.notifyDuplicates(3)
    assert.equal(r3.sent, false)
    assert.equal(r3.reason, 'disabled')

    const r4 = notifier.notifyBackupComplete('/path')
    assert.equal(r4.sent, false)
    assert.equal(r4.reason, 'disabled')
  })
})

// ==================== 类型级禁用 ====================

describe('类型级禁用', () => {
  it('禁用 dead-links 类型后应返回 sent=false', () => {
    const { notifier } = createTestEnv()
    notifier.setNotificationPrefs({ types: { 'dead-links': false } })

    const result = notifier.notifyDeadLinks([{ url: 'https://x.com', status: 404 }])
    assert.equal(result.sent, false)
    assert.equal(result.reason, 'type-disabled')
  })

  it('其他类型不受影响', () => {
    const { notifier } = createTestEnv()
    notifier.setNotificationPrefs({ types: { 'dead-links': false } })

    const result = notifier.notifyNewBookmarks(5)
    assert.equal(result.sent, true)
  })
})

// ==================== 通知合并 ====================

describe('通知合并', () => {
  it('mergeInterval 内的同类型通知应被合并', () => {
    const { notifier, advanceTime, getDispatched } = createTestEnv()

    // 第一条发送
    const r1 = notifier.notifyNewBookmarks(5)
    assert.equal(r1.sent, true)
    assert.equal(getDispatched().length, 1)

    // 1秒后再发 (在默认 5s 合并间隔内) → 应被合并
    advanceTime(1000)
    const r2 = notifier.notifyNewBookmarks(3)
    assert.equal(r2.sent, false)
    assert.equal(r2.reason, 'merged')
    assert.equal(getDispatched().length, 1) // 不应额外分发
  })

  it('超过 mergeInterval 后应正常发送', () => {
    const { notifier, advanceTime, getDispatched } = createTestEnv()

    notifier.notifyNewBookmarks(5)
    advanceTime(MERGE_INTERVAL + 1)

    const r2 = notifier.notifyNewBookmarks(3)
    assert.equal(r2.sent, true)
    assert.equal(getDispatched().length, 2)
  })

  it('不同类型的通知不受合并影响', () => {
    const { notifier, advanceTime, getDispatched } = createTestEnv()

    notifier.notifyNewBookmarks(5)
    advanceTime(1000)

    // 不同类型 → 不应被合并
    const result = notifier.notifyDuplicates(3)
    assert.equal(result.sent, true)
    assert.equal(getDispatched().length, 2)
  })
})

// ==================== getNotificationHistory ====================

describe('getNotificationHistory', () => {
  it('应记录所有已发送的通知', () => {
    const { notifier } = createTestEnv()
    notifier.notifyDeadLinks([{ url: 'https://a.com', status: 404 }])
    notifier.notifyNewBookmarks(3)
    notifier.notifyBackupComplete('/path')

    const history = notifier.getNotificationHistory()
    assert.equal(history.length, 3)
    assert.equal(history[0].type, 'dead-links')
    assert.equal(history[1].type, 'new-bookmarks')
    assert.equal(history[2].type, 'backup-complete')
  })

  it('应支持按 type 过滤', () => {
    const { notifier, advanceTime } = createTestEnv()
    notifier.notifyNewBookmarks(1)
    advanceTime(MERGE_INTERVAL + 1)
    notifier.notifyDeadLinks([{ url: 'x', status: 404 }])
    advanceTime(MERGE_INTERVAL + 1)
    notifier.notifyNewBookmarks(2)

    const history = notifier.getNotificationHistory({ type: 'new-bookmarks' })
    assert.equal(history.length, 2)
    for (const entry of history) {
      assert.equal(entry.type, 'new-bookmarks')
    }
  })

  it('应支持 limit 参数', () => {
    const { notifier, advanceTime } = createTestEnv()
    for (let i = 0; i < 10; i++) {
      notifier.notifyNewBookmarks(i + 1)
      advanceTime(MERGE_INTERVAL + 1)
    }

    const history = notifier.getNotificationHistory({ limit: 3 })
    assert.equal(history.length, 3)
  })

  it('应支持 since 时间戳过滤', () => {
    const { notifier, advanceTime, fakeNow } = createTestEnv()
    notifier.notifyNewBookmarks(1)
    advanceTime(MERGE_INTERVAL + 1)
    const cutoff = fakeNow()
    advanceTime(MERGE_INTERVAL + 1)
    notifier.notifyNewBookmarks(2)
    advanceTime(MERGE_INTERVAL + 1)
    notifier.notifyNewBookmarks(3)

    const history = notifier.getNotificationHistory({ since: cutoff })
    // 只有 cutoff 之后的应被返回
    for (const entry of history) {
      assert.ok(entry.timestamp >= cutoff)
    }
    assert.equal(history.length, 2)
  })

  it('被合并的通知不应出现在历史中', () => {
    const { notifier, advanceTime } = createTestEnv()
    notifier.notifyNewBookmarks(5)
    advanceTime(1000) // 在合并间隔内
    notifier.notifyNewBookmarks(3) // 被合并

    const history = notifier.getNotificationHistory()
    assert.equal(history.length, 1) // 只有第一条
  })
})

// ==================== clearHistory ====================

describe('clearHistory', () => {
  it('应清空通知历史', () => {
    const { notifier } = createTestEnv()
    notifier.notifyNewBookmarks(5)
    notifier.notifyBackupComplete('/path')

    assert.equal(notifier.getNotificationHistory().length, 2)
    notifier.clearHistory()
    assert.equal(notifier.getNotificationHistory().length, 0)
  })
})

// ==================== getStats ====================

describe('getStats', () => {
  it('应正确统计各类型通知数', () => {
    const { notifier, advanceTime } = createTestEnv()
    notifier.notifyDeadLinks([{ url: 'a', status: 404 }])
    advanceTime(MERGE_INTERVAL + 1)
    notifier.notifyNewBookmarks(5)
    advanceTime(MERGE_INTERVAL + 1)
    notifier.notifyNewBookmarks(3)
    advanceTime(MERGE_INTERVAL + 1)
    notifier.notifyBackupComplete('/path')

    const stats = notifier.getStats()
    assert.equal(stats.totalSent, 4)
    assert.equal(stats.historySize, 4)
    assert.equal(stats.byType['dead-links'], 1)
    assert.equal(stats.byType['new-bookmarks'], 2)
    assert.equal(stats.byType['backup-complete'], 1)
  })

  it('初始统计应为零', () => {
    const { notifier } = createTestEnv()
    const stats = notifier.getStats()
    assert.equal(stats.totalSent, 0)
    assert.equal(stats.historySize, 0)
    assert.deepEqual(stats.byType, {})
  })
})

// ==================== 通知条目结构 ====================

describe('通知条目结构', () => {
  it('通知条目应有完整的字段', () => {
    const { notifier } = createTestEnv()
    const result = notifier.notifyBackupComplete('/backups/test.html')
    const entry = result.notification

    assert.ok(entry.id.startsWith('notif-'))
    assert.equal(entry.type, 'backup-complete')
    assert.equal(entry.title, '书签备份完成')
    assert.ok(entry.body.includes('/backups/test.html'))
    assert.equal(entry.level, 'info')
    assert.deepEqual(entry.data, { path: '/backups/test.html' })
    assert.equal(entry.timestamp, 1000000)
    assert.deepEqual(entry.channel, ['browser'])
  })

  it('ID 应唯一', () => {
    const { notifier, advanceTime } = createTestEnv()
    const ids = new Set()
    for (let i = 0; i < 10; i++) {
      const r = notifier.notifyNewBookmarks(i + 1)
      advanceTime(MERGE_INTERVAL + 1)
      ids.add(r.notification.id)
    }
    assert.equal(ids.size, 10)
  })
})

// ==================== 历史裁剪 ====================

describe('历史裁剪', () => {
  it('超过 MAX_HISTORY 时应裁剪旧记录', () => {
    const { notifier, advanceTime } = createTestEnv()

    // 发送超过 MAX_HISTORY 条通知
    for (let i = 0; i < MAX_HISTORY + 10; i++) {
      notifier.notifyNewBookmarks(1)
      advanceTime(MERGE_INTERVAL + 1)
    }

    const history = notifier.getNotificationHistory({ limit: MAX_HISTORY + 100 })
    assert.ok(history.length <= MAX_HISTORY)
  })
})

// ==================== dispatch 异常处理 ====================

describe('dispatch 异常处理', () => {
  it('dispatch 抛异常不应影响返回结果', () => {
    let currentTime = 1000000
    const notifier = new BookmarkNotifier({
      dispatch: () => { throw new Error('dispatch error') },
      now: () => currentTime,
    })

    const result = notifier.notifyNewBookmarks(5)
    assert.equal(result.sent, true)
    assert.ok(result.notification)
  })
})
