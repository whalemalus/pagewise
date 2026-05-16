/**
 * 测试 lib/bookmark-notifications.js — NotificationManager 通知管理器
 *
 * 测试范围:
 *   NotificationManager 构造 / notify / getNotifications
 *   markAsRead / clearAll / getUnreadCount
 *   常量导出 / 参数验证 / 边界情况
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  NotificationManager,
  NOTIFICATION_TYPES,
  MAX_NOTIFICATIONS,
} = await import('../lib/bookmark-notifications.js')

// ==================== 测试辅助 ====================

/**
 * 创建测试环境，返回 manager 和时间控制工具
 */
function createTestEnv(initialTime = 1000000) {
  let currentTime = initialTime

  const fakeNow = () => currentTime
  const manager = new NotificationManager({ now: fakeNow })
  const advanceTime = (ms) => { currentTime += ms }

  return { manager, advanceTime, fakeNow: () => currentTime }
}

// ==================== 构造函数 ====================

describe('NotificationManager 构造', () => {
  it('应创建通知管理器实例', () => {
    const manager = new NotificationManager()
    assert.ok(manager instanceof NotificationManager)
  })

  it('应有空的通知列表', () => {
    const { manager } = createTestEnv()
    const notifications = manager.getNotifications()
    assert.equal(notifications.length, 0)
  })

  it('未读数应为零', () => {
    const { manager } = createTestEnv()
    assert.equal(manager.getUnreadCount(), 0)
  })
})

// ==================== 常量导出 ====================

describe('常量导出', () => {
  it('应导出正确的 NOTIFICATION_TYPES', () => {
    assert.deepEqual(NOTIFICATION_TYPES, ['info', 'warning', 'expired', 'duplicate', 'update'])
  })

  it('应导出 MAX_NOTIFICATIONS', () => {
    assert.equal(MAX_NOTIFICATIONS, 1000)
  })
})

// ==================== notify ====================

describe('notify', () => {
  it('应创建通知并返回通知对象', () => {
    const { manager } = createTestEnv()
    const notification = manager.notify('Test message', 'info')

    assert.ok(notification.id)
    assert.equal(notification.message, 'Test message')
    assert.equal(notification.type, 'info')
    assert.equal(notification.read, false)
    assert.equal(typeof notification.timestamp, 'number')
  })

  it('应支持所有五种通知类型', () => {
    const { manager, advanceTime } = createTestEnv()

    for (const type of NOTIFICATION_TYPES) {
      const n = manager.notify(`msg-${type}`, type)
      assert.equal(n.type, type)
      advanceTime(1)
    }

    assert.equal(manager.getNotifications().length, 5)
  })

  it('应返回通知副本 (不影响内部状态)', () => {
    const { manager } = createTestEnv()
    const n = manager.notify('Test', 'info')
    n.message = 'modified'

    const stored = manager.getNotifications()
    assert.equal(stored[0].message, 'Test')
  })

  it('应 trim 消息内容', () => {
    const { manager } = createTestEnv()
    const n = manager.notify('  hello  ', 'info')
    assert.equal(n.message, 'hello')
  })

  it('应拒绝空字符串消息', () => {
    const { manager } = createTestEnv()
    assert.throws(() => manager.notify('', 'info'), /非空字符串/)
    assert.throws(() => manager.notify('   ', 'info'), /非空字符串/)
  })

  it('应拒绝非字符串消息', () => {
    const { manager } = createTestEnv()
    assert.throws(() => manager.notify(123, 'info'), /非空字符串/)
    assert.throws(() => manager.notify(null, 'info'), /非空字符串/)
    assert.throws(() => manager.notify(undefined, 'info'), /非空字符串/)
  })

  it('应拒绝不支持的通知类型', () => {
    const { manager } = createTestEnv()
    assert.throws(() => manager.notify('msg', 'invalid'), /不支持的通知类型/)
    assert.throws(() => manager.notify('msg', ''), /不支持的通知类型/)
  })

  it('应维护递增 ID', () => {
    const { manager, advanceTime } = createTestEnv()
    const n1 = manager.notify('first', 'info')
    advanceTime(1)
    const n2 = manager.notify('second', 'warning')

    assert.notEqual(n1.id, n2.id)
    assert.ok(n2.id > n1.id || n2.id !== n1.id)
  })

  it('应裁剪超出 MAX_NOTIFICATIONS 的通知', () => {
    const { manager } = createTestEnv()

    // 填充到 MAX + 10
    for (let i = 0; i < MAX_NOTIFICATIONS + 10; i++) {
      manager.notify(`msg-${i}`, 'info')
    }

    const all = manager.getNotifications()
    assert.equal(all.length, MAX_NOTIFICATIONS)
    // 最早的 10 条应被裁剪
    assert.equal(all[0].message, 'msg-10')
  })
})

// ==================== getNotifications ====================

describe('getNotifications', () => {
  it('应返回所有通知 (默认无过滤)', () => {
    const { manager, advanceTime } = createTestEnv()
    manager.notify('A', 'info')
    advanceTime(1)
    manager.notify('B', 'warning')
    advanceTime(1)
    manager.notify('C', 'expired')

    const all = manager.getNotifications()
    assert.equal(all.length, 3)
  })

  it('应支持按 type 过滤', () => {
    const { manager, advanceTime } = createTestEnv()
    manager.notify('A', 'info')
    advanceTime(1)
    manager.notify('B', 'warning')
    advanceTime(1)
    manager.notify('C', 'info')

    const infos = manager.getNotifications({ type: 'info' })
    assert.equal(infos.length, 2)
    for (const n of infos) {
      assert.equal(n.type, 'info')
    }
  })

  it('应支持按 read 状态过滤', () => {
    const { manager, advanceTime } = createTestEnv()
    manager.notify('A', 'info')
    advanceTime(1)
    const n2 = manager.notify('B', 'warning')
    manager.markAsRead(n2.id)

    const unread = manager.getNotifications({ read: false })
    assert.equal(unread.length, 1)
    assert.equal(unread[0].message, 'A')

    const read = manager.getNotifications({ read: true })
    assert.equal(read.length, 1)
    assert.equal(read[0].message, 'B')
  })

  it('应支持 limit 参数', () => {
    const { manager, advanceTime } = createTestEnv()
    for (let i = 0; i < 10; i++) {
      manager.notify(`msg-${i}`, 'info')
      advanceTime(1)
    }

    const limited = manager.getNotifications({ limit: 3 })
    assert.equal(limited.length, 3)
    // 应返回最后 3 条
    assert.equal(limited[0].message, 'msg-7')
    assert.equal(limited[2].message, 'msg-9')
  })

  it('应支持组合过滤 (type + read)', () => {
    const { manager, advanceTime } = createTestEnv()
    manager.notify('A', 'info')
    advanceTime(1)
    const n2 = manager.notify('B', 'info')
    advanceTime(1)
    manager.notify('C', 'warning')
    manager.markAsRead(n2.id)

    const result = manager.getNotifications({ type: 'info', read: true })
    assert.equal(result.length, 1)
    assert.equal(result[0].message, 'B')
  })

  it('过滤无匹配时应返回空数组', () => {
    const { manager } = createTestEnv()
    manager.notify('A', 'info')

    const result = manager.getNotifications({ type: 'expired' })
    assert.deepEqual(result, [])
  })
})

// ==================== markAsRead ====================

describe('markAsRead', () => {
  it('应标记通知为已读并返回 true', () => {
    const { manager } = createTestEnv()
    const n = manager.notify('Test', 'info')

    const result = manager.markAsRead(n.id)
    assert.equal(result, true)

    const stored = manager.getNotifications()
    assert.equal(stored[0].read, true)
  })

  it('不存在的 ID 应返回 false', () => {
    const { manager } = createTestEnv()
    manager.notify('Test', 'info')

    const result = manager.markAsRead('nonexistent-id')
    assert.equal(result, false)
  })

  it('已读通知再次标记仍返回 true (幂等)', () => {
    const { manager } = createTestEnv()
    const n = manager.notify('Test', 'info')

    assert.equal(manager.markAsRead(n.id), true)
    assert.equal(manager.markAsRead(n.id), true)
    assert.equal(manager.getUnreadCount(), 0)
  })

  it('应拒绝空 ID', () => {
    const { manager } = createTestEnv()
    assert.throws(() => manager.markAsRead(''), /非空字符串/)
    assert.throws(() => manager.markAsRead('   '), /非空字符串/)
  })

  it('应拒绝非字符串 ID', () => {
    const { manager } = createTestEnv()
    assert.throws(() => manager.markAsRead(123), /非空字符串/)
    assert.throws(() => manager.markAsRead(null), /非空字符串/)
  })
})

// ==================== clearAll ====================

describe('clearAll', () => {
  it('应清空所有通知', () => {
    const { manager, advanceTime } = createTestEnv()
    manager.notify('A', 'info')
    advanceTime(1)
    manager.notify('B', 'warning')
    advanceTime(1)
    manager.notify('C', 'expired')

    manager.clearAll()

    assert.equal(manager.getNotifications().length, 0)
    assert.equal(manager.getUnreadCount(), 0)
  })

  it('空列表调用 clearAll 不应报错', () => {
    const { manager } = createTestEnv()
    manager.clearAll()
    assert.equal(manager.getNotifications().length, 0)
  })

  it('clearAll 后可继续添加通知', () => {
    const { manager } = createTestEnv()
    manager.notify('A', 'info')
    manager.clearAll()
    manager.notify('B', 'warning')

    const all = manager.getNotifications()
    assert.equal(all.length, 1)
    assert.equal(all[0].message, 'B')
  })
})

// ==================== getUnreadCount ====================

describe('getUnreadCount', () => {
  it('新通知全部未读', () => {
    const { manager, advanceTime } = createTestEnv()
    manager.notify('A', 'info')
    advanceTime(1)
    manager.notify('B', 'warning')
    advanceTime(1)
    manager.notify('C', 'duplicate')

    assert.equal(manager.getUnreadCount(), 3)
  })

  it('标记已读后未读数减少', () => {
    const { manager, advanceTime } = createTestEnv()
    const n1 = manager.notify('A', 'info')
    advanceTime(1)
    manager.notify('B', 'warning')

    assert.equal(manager.getUnreadCount(), 2)

    manager.markAsRead(n1.id)
    assert.equal(manager.getUnreadCount(), 1)
  })

  it('全部已读后应为零', () => {
    const { manager, advanceTime } = createTestEnv()
    const n1 = manager.notify('A', 'info')
    advanceTime(1)
    const n2 = manager.notify('B', 'warning')

    manager.markAsRead(n1.id)
    manager.markAsRead(n2.id)

    assert.equal(manager.getUnreadCount(), 0)
  })

  it('clearAll 后未读数为零', () => {
    const { manager } = createTestEnv()
    manager.notify('A', 'info')
    manager.notify('B', 'warning')

    manager.clearAll()
    assert.equal(manager.getUnreadCount(), 0)
  })
})
