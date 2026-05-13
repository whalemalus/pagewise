/**
 * 测试 lib/bookmark-backup-restore.js — 备份创建/完整性验证/恢复/备份列表
 *
 * 测试范围:
 *   - computeChecksum — 校验和计算
 *   - createBackup — 正常/空/大数据集/无效输入
 *   - validateBackup — 有效/损坏/缺失字段/null
 *   - restoreFromBackup — 成功/部分恢复/失败
 *   - listBackups — 列表/排序/限制/错误处理
 *   - deleteBackup — 删除/错误处理
 *   - BACKUP_FORMAT_VERSION 常量导出
 *   - null/undefined/边界输入
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  BACKUP_FORMAT_VERSION,
  BACKUP_PREFIX,
  MAX_BACKUPS,
  computeChecksum,
  createBackup,
  validateBackup,
  restoreFromBackup,
  listBackups,
  deleteBackup,
} = await import('../lib/bookmark-backup-restore.js')

// ==================== 辅助函数 ====================

function bm(id, title, url, folderPath = [], tags = []) {
  return { id: String(id), title, url, folderPath, tags }
}

function createTestBookmarks(count) {
  const bookmarks = []
  for (let i = 0; i < count; i++) {
    bookmarks.push(bm(i, `Bookmark ${i}`, `https://example.com/page${i}`, ['folder'], ['tag']))
  }
  return bookmarks
}

/** 创建一个 mock storage */
function mockStorage(existingItems = []) {
  return {
    _items: [...existingItems],
    async list(prefix) {
      return this._items.filter(item => !prefix || (item.backupId && item.backupId.startsWith(prefix)))
    },
    async remove(key) {
      this._items = this._items.filter(item => item.backupId !== key)
    },
  }
}

// ==================== 常量 ====================

describe('BACKUP_FORMAT_VERSION', () => {
  it('应导出为字符串', () => {
    assert.equal(typeof BACKUP_FORMAT_VERSION, 'string')
  })

  it('应为 "1.0"', () => {
    assert.equal(BACKUP_FORMAT_VERSION, '1.0')
  })
})

describe('BACKUP_PREFIX', () => {
  it('应导出为 "pagewise-backup"', () => {
    assert.equal(BACKUP_PREFIX, 'pagewise-backup')
  })
})

describe('MAX_BACKUPS', () => {
  it('应导出为正整数', () => {
    assert.ok(Number.isInteger(MAX_BACKUPS) && MAX_BACKUPS > 0)
  })
})

// ==================== computeChecksum ====================

describe('computeChecksum', () => {
  it('对相同输入返回相同结果', () => {
    const a = computeChecksum('hello world')
    const b = computeChecksum('hello world')
    assert.equal(a, b)
  })

  it('对不同输入返回不同结果', () => {
    const a = computeChecksum('hello')
    const b = computeChecksum('world')
    assert.notEqual(a, b)
  })

  it('空字符串返回非零哈希', () => {
    const hash = computeChecksum('')
    assert.ok(hash !== '0')
  })

  it('null 返回 "0"', () => {
    assert.equal(computeChecksum(null), '0')
  })

  it('undefined 返回 "0"', () => {
    assert.equal(computeChecksum(undefined), '0')
  })

  it('数字输入返回 "0"', () => {
    assert.equal(computeChecksum(12345), '0')
  })

  it('返回十六进制字符串', () => {
    const hash = computeChecksum('test')
    assert.match(hash, /^[0-9a-f]+$/)
  })
})

// ==================== createBackup ====================

describe('createBackup — 正常创建', () => {
  it('成功创建备份，包含所有必需字段', () => {
    const bookmarks = [bm(1, 'Test', 'https://test.com')]
    const result = createBackup(bookmarks)

    assert.equal(result.success, true)
    assert.ok(result.backup)
    assert.equal(result.backup.version, BACKUP_FORMAT_VERSION)
    assert.ok(result.backup.backupId)
    assert.ok(result.backup.createdAt)
    assert.equal(result.backup.bookmarkCount, 1)
    assert.ok(result.backup.checksum)
    assert.deepEqual(result.backup.bookmarks, bookmarks)
  })

  it('包含 metadata 信息', () => {
    const bookmarks = [bm(1, 'Test', 'https://test.com')]
    const meta = { source: 'chrome', description: '测试备份' }
    const result = createBackup(bookmarks, meta)

    assert.equal(result.success, true)
    assert.deepEqual(result.backup.metadata, meta)
  })

  it('默认 metadata 为空对象', () => {
    const result = createBackup([])
    assert.deepEqual(result.backup.metadata, {})
  })

  it('创建时间是有效 ISO 字符串', () => {
    const result = createBackup([])
    const date = new Date(result.backup.createdAt)
    assert.ok(!isNaN(date.getTime()))
  })

  it('backupId 包含 BACKUP_PREFIX', () => {
    const result = createBackup([])
    assert.ok(result.backup.backupId.startsWith(BACKUP_PREFIX))
  })
})

describe('createBackup — 空书签', () => {
  it('空数组创建成功，bookmarkCount 为 0', () => {
    const result = createBackup([])
    assert.equal(result.success, true)
    assert.equal(result.backup.bookmarkCount, 0)
    assert.deepEqual(result.backup.bookmarks, [])
  })
})

describe('createBackup — 大数据集', () => {
  it('能处理 1000 条书签', () => {
    const bookmarks = createTestBookmarks(1000)
    const result = createBackup(bookmarks)

    assert.equal(result.success, true)
    assert.equal(result.backup.bookmarkCount, 1000)
    assert.equal(result.backup.bookmarks.length, 1000)
  })

  it('大数据集的校验和可验证', () => {
    const bookmarks = createTestBookmarks(500)
    const result = createBackup(bookmarks)

    const validation = validateBackup(result.backup)
    assert.equal(validation.valid, true)
  })
})

describe('createBackup — 深拷贝隔离', () => {
  it('修改原始书签不影响备份', () => {
    const bookmarks = [bm(1, 'Original', 'https://test.com')]
    const result = createBackup(bookmarks)

    bookmarks[0].title = 'Modified'
    assert.equal(result.backup.bookmarks[0].title, 'Original')
  })

  it('不同调用返回不同的 backupId', () => {
    const b1 = createBackup([])
    const b2 = createBackup([])
    assert.notEqual(b1.backup.backupId, b2.backup.backupId)
  })
})

// ==================== validateBackup ====================

describe('validateBackup — 有效备份', () => {
  it('刚创建的备份验证通过', () => {
    const bookmarks = [bm(1, 'Test', 'https://test.com')]
    const { backup } = createBackup(bookmarks)

    const result = validateBackup(backup)
    assert.equal(result.valid, true)
    assert.equal(result.errors.length, 0)
  })

  it('空书签备份验证通过', () => {
    const { backup } = createBackup([])
    const result = validateBackup(backup)
    assert.equal(result.valid, true)
  })
})

describe('validateBackup — null/undefined', () => {
  it('null 输入返回无效', () => {
    const result = validateBackup(null)
    assert.equal(result.valid, false)
    assert.ok(result.errors.length > 0)
  })

  it('undefined 输入返回无效', () => {
    const result = validateBackup(undefined)
    assert.equal(result.valid, false)
    assert.ok(result.errors.length > 0)
  })
})

describe('validateBackup — 损坏的备份', () => {
  it('篡改书签数据后校验和不匹配', () => {
    const { backup } = createBackup([bm(1, 'Test', 'https://test.com')])
    backup.bookmarks[0].title = 'Tampered'

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('校验和')))
  })

  it('篡改 checksum 后验证失败', () => {
    const { backup } = createBackup([bm(1, 'Test', 'https://test.com')])
    backup.checksum = 'deadbeef'

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
  })

  it('修改 checksum 为其他有效值', () => {
    const { backup } = createBackup([])
    backup.checksum = 'aabbccdd'

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
  })
})

describe('validateBackup — 缺失字段', () => {
  it('缺少 version 字段', () => {
    const { backup } = createBackup([])
    delete backup.version

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('version')))
  })

  it('缺少 backupId 字段', () => {
    const { backup } = createBackup([])
    delete backup.backupId

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('backupId')))
  })

  it('缺少 createdAt 字段', () => {
    const { backup } = createBackup([])
    delete backup.createdAt

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('createdAt')))
  })

  it('缺少 checksum 字段', () => {
    const { backup } = createBackup([])
    delete backup.checksum

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('checksum')))
  })

  it('缺少 bookmarks 字段', () => {
    const { backup } = createBackup([])
    delete backup.bookmarks

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('bookmarks')))
  })

  it('错误的 version 值', () => {
    const { backup } = createBackup([])
    backup.version = '2.0'

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('版本')))
  })

  it('无效的 createdAt 字符串', () => {
    const { backup } = createBackup([])
    backup.createdAt = 'not-a-date'

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
  })
})

describe('validateBackup — 非对象输入', () => {
  it('字符串输入返回无效', () => {
    const result = validateBackup('not-an-object')
    assert.equal(result.valid, false)
  })

  it('数组输入返回无效', () => {
    const result = validateBackup([1, 2, 3])
    assert.equal(result.valid, false)
  })

  it('数字输入返回无效', () => {
    const result = validateBackup(42)
    assert.equal(result.valid, false)
  })
})

describe('validateBackup — 警告', () => {
  it('bookmarkCount 不匹配时产生警告', () => {
    const { backup } = createBackup([bm(1, 'Test', 'https://test.com')])
    backup.bookmarkCount = 999

    const result = validateBackup(backup)
    assert.ok(result.warnings.some(w => w.includes('bookmarkCount')))
  })
})

// ==================== restoreFromBackup ====================

describe('restoreFromBackup — 成功恢复', () => {
  it('从有效备份恢复书签', () => {
    const bookmarks = [bm(1, 'A', 'https://a.com'), bm(2, 'B', 'https://b.com')]
    const { backup } = createBackup(bookmarks, { source: 'test' })

    const result = restoreFromBackup(backup)
    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 2)
    assert.deepEqual(result.bookmarks, bookmarks)
    assert.deepEqual(result.metadata, { source: 'test' })
    assert.equal(result.errors.length, 0)
  })

  it('恢复的数据是深拷贝', () => {
    const bookmarks = [bm(1, 'A', 'https://a.com')]
    const { backup } = createBackup(bookmarks)

    const result = restoreFromBackup(backup)
    result.bookmarks[0].title = 'Modified'

    // 原始备份不受影响
    assert.equal(backup.bookmarks[0].title, 'A')
  })

  it('恢复空书签备份', () => {
    const { backup } = createBackup([])
    const result = restoreFromBackup(backup)

    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 0)
  })

  it('恢复时包含 metadata', () => {
    const meta = { description: '备份', version: 2 }
    const { backup } = createBackup([bm(1, 'X', 'https://x.com')], meta)

    const result = restoreFromBackup(backup)
    assert.deepEqual(result.metadata, meta)
  })
})

describe('restoreFromBackup — 部分恢复（跳过无效书签）', () => {
  it('跳过无效结构的书签', () => {
    const { backup } = createBackup([bm(1, 'Valid', 'https://valid.com')])
    // 注入一个无效书签
    backup.bookmarks.push(null)
    backup.bookmarks.push({ noId: true })
    // 重新计算 checksum 以便通过验证阶段（不过校验和会不匹配）
    // 我们直接设置 checksum 为匹配值
    const payload = { bookmarks: backup.bookmarks, metadata: backup.metadata || {} }
    backup.checksum = computeChecksum(JSON.stringify(payload))

    const result = restoreFromBackup(backup)
    assert.equal(result.success, true)
    // 有效书签只剩第一个和第三个（null 被跳过，noId 被跳过）
    assert.equal(result.bookmarks.length, 1)
    assert.ok(result.warnings.some(w => w.includes('已跳过')))
  })
})

describe('restoreFromBackup — 失败场景', () => {
  it('null 输入返回失败', () => {
    const result = restoreFromBackup(null)
    assert.equal(result.success, false)
    assert.equal(result.bookmarks, null)
  })

  it('undefined 输入返回失败', () => {
    const result = restoreFromBackup(undefined)
    assert.equal(result.success, false)
  })

  it('损坏的备份返回失败', () => {
    const { backup } = createBackup([bm(1, 'Test', 'https://test.com')])
    backup.bookmarks.push({ id: 'extra' })
    // 不更新 checksum → 校验和不匹配

    const result = restoreFromBackup(backup)
    assert.equal(result.success, false)
    assert.ok(result.errors.length > 0)
  })

  it('缺少 version 的备份返回失败', () => {
    const { backup } = createBackup([])
    delete backup.version

    const result = restoreFromBackup(backup)
    assert.equal(result.success, false)
  })
})

// ==================== listBackups ====================

describe('listBackups', () => {
  it('成功列出备份', async () => {
    const storage = mockStorage([
      { backupId: 'pagewise-backup-1', createdAt: '2026-01-01T00:00:00Z' },
      { backupId: 'pagewise-backup-2', createdAt: '2026-02-01T00:00:00Z' },
    ])

    const result = await listBackups(storage)
    assert.equal(result.success, true)
    assert.equal(result.backups.length, 2)
  })

  it('按创建时间降序排列', async () => {
    const storage = mockStorage([
      { backupId: 'pagewise-backup-1', createdAt: '2026-01-01T00:00:00Z' },
      { backupId: 'pagewise-backup-2', createdAt: '2026-06-01T00:00:00Z' },
      { backupId: 'pagewise-backup-3', createdAt: '2026-03-01T00:00:00Z' },
    ])

    const result = await listBackups(storage)
    assert.equal(result.backups[0].createdAt, '2026-06-01T00:00:00Z')
    assert.equal(result.backups[1].createdAt, '2026-03-01T00:00:00Z')
    assert.equal(result.backups[2].createdAt, '2026-01-01T00:00:00Z')
  })

  it('限制最大备份数量', async () => {
    const items = []
    for (let i = 0; i < 60; i++) {
      items.push({ backupId: `pagewise-backup-${i}`, createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` })
    }
    const storage = mockStorage(items)

    const result = await listBackups(storage)
    assert.equal(result.backups.length, MAX_BACKUPS)
  })

  it('过滤掉没有 createdAt 的项', async () => {
    const storage = mockStorage([
      { backupId: 'pagewise-backup-1', createdAt: '2026-01-01T00:00:00Z' },
      { backupId: 'pagewise-backup-bad' },
    ])

    const result = await listBackups(storage)
    assert.equal(result.backups.length, 1)
  })

  it('空存储返回空列表', async () => {
    const storage = mockStorage([])
    const result = await listBackups(storage)
    assert.equal(result.success, true)
    assert.equal(result.backups.length, 0)
  })
})

describe('listBackups — 错误处理', () => {
  it('null storage 返回失败', async () => {
    const result = await listBackups(null)
    assert.equal(result.success, false)
    assert.ok(result.errors.length > 0)
  })

  it('storage 缺少 list 方法返回失败', async () => {
    const result = await listBackups({})
    assert.equal(result.success, false)
  })

  it('storage.list 抛出异常时返回失败', async () => {
    const storage = {
      list() { throw new Error('IO error') },
    }
    const result = await listBackups(storage)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('IO error'))
  })

  it('storage.list 返回非数组时返回失败', async () => {
    const storage = {
      async list() { return 'not-array' },
    }
    const result = await listBackups(storage)
    assert.equal(result.success, false)
  })
})

// ==================== deleteBackup ====================

describe('deleteBackup', () => {
  it('成功删除备份', async () => {
    const storage = mockStorage([
      { backupId: 'pagewise-backup-1', createdAt: '2026-01-01T00:00:00Z' },
    ])

    const result = await deleteBackup(storage, 'pagewise-backup-1')
    assert.equal(result.success, true)
    assert.equal(storage._items.length, 0)
  })

  it('null storage 返回失败', async () => {
    const result = await deleteBackup(null, 'backup-1')
    assert.equal(result.success, false)
  })

  it('storage 缺少 remove 方法返回失败', async () => {
    const result = await deleteBackup({}, 'backup-1')
    assert.equal(result.success, false)
  })

  it('无效 backupId 返回失败', async () => {
    const storage = mockStorage()
    const result = await deleteBackup(storage, '')
    assert.equal(result.success, false)
  })

  it('null backupId 返回失败', async () => {
    const storage = mockStorage()
    const result = await deleteBackup(storage, null)
    assert.equal(result.success, false)
  })

  it('storage.remove 抛出异常时返回失败', async () => {
    const storage = {
      async remove() { throw new Error('Write error') },
    }
    const result = await deleteBackup(storage, 'backup-1')
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('Write error'))
  })
})

// ==================== 端到端 Round-Trip ====================

describe('完整 round-trip: 创建 → 验证 → 恢复', () => {
  it('原始书签数据与恢复后数据一致', () => {
    const original = [
      bm(1, 'GitHub', 'https://github.com', ['开发', '工具'], ['code']),
      bm(2, 'MDN', 'https://developer.mozilla.org', ['开发', '文档'], ['docs', 'web']),
      bm(3, 'StackOverflow', 'https://stackoverflow.com', ['开发']),
    ]
    const meta = { source: 'chrome', exportDate: '2026-05-13' }

    // 1. 创建备份
    const { success, backup } = createBackup(original, meta)
    assert.equal(success, true)

    // 2. 验证备份
    const validation = validateBackup(backup)
    assert.equal(validation.valid, true)

    // 3. 恢复
    const restored = restoreFromBackup(backup)
    assert.equal(restored.success, true)
    assert.deepEqual(restored.bookmarks, original)
    assert.deepEqual(restored.metadata, meta)
  })
})
