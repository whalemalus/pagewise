/**
 * 测试 lib/bookmark-backup.js — 备份创建/完整性验证/恢复
 *
 * 测试范围:
 *   - computeChecksum — 校验和计算（确定性、边界、类型）
 *   - createBackup — 正常/空书签/大数据集/带选项/深拷贝隔离/无效输入
 *   - validateBackup — 有效备份/null/undefined/非对象/损坏/缺失字段/警告
 *   - restoreBackup — 成功恢复/空备份/部分恢复/深拷贝隔离/失败场景
 *   - 常量导出 — BACKUP_FORMAT_VERSION / SUPPORTED_VERSIONS
 *   - 完整 round-trip — 创建 → 验证 → 恢复
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  BACKUP_FORMAT_VERSION,
  SUPPORTED_VERSIONS,
  computeChecksum,
  createBackup,
  validateBackup,
  restoreBackup,
} = await import('../lib/bookmark-backup.js')

// ==================== 辅助函数 ====================

/**
 * 创建单个书签对象
 *
 * @param {number|string} id
 * @param {string} title
 * @param {string} url
 * @param {string[]} [folderPath]
 * @param {string[]} [tags]
 * @returns {object}
 */
function bm(id, title, url, folderPath = [], tags = []) {
  return { id: String(id), title, url, folderPath, tags }
}

/**
 * 批量创建测试书签
 *
 * @param {number} count
 * @returns {object[]}
 */
function createTestBookmarks(count) {
  const bookmarks = []
  for (let i = 0; i < count; i++) {
    bookmarks.push(bm(i, `Bookmark ${i}`, `https://example.com/page${i}`, ['folder'], ['tag']))
  }
  return bookmarks
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

describe('SUPPORTED_VERSIONS', () => {
  it('应导出为冻结数组', () => {
    assert.ok(Array.isArray(SUPPORTED_VERSIONS))
    assert.ok(Object.isFrozen(SUPPORTED_VERSIONS))
  })

  it('应包含 "1.0"', () => {
    assert.ok(SUPPORTED_VERSIONS.includes('1.0'))
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

  it('非字符串输入返回 "0"', () => {
    assert.equal(computeChecksum(null), '0')
    assert.equal(computeChecksum(undefined), '0')
    assert.equal(computeChecksum(12345), '0')
    assert.equal(computeChecksum({}), '0')
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
    assert.ok(result.backup.timestamp)
    assert.equal(result.backup.bookmarkCount, 1)
    assert.ok(result.backup.checksum)
    assert.deepEqual(result.backup.data.bookmarks, bookmarks)
  })

  it('包含 description 选项', () => {
    const bookmarks = [bm(1, 'Test', 'https://test.com')]
    const result = createBackup(bookmarks, { description: '手动备份' })

    assert.equal(result.success, true)
    assert.equal(result.backup.data.metadata.description, '手动备份')
  })

  it('包含自定义 metadata', () => {
    const bookmarks = [bm(1, 'Test', 'https://test.com')]
    const result = createBackup(bookmarks, {
      description: 'test',
      metadata: { source: 'chrome', version: 2 },
    })

    assert.equal(result.success, true)
    assert.equal(result.backup.data.metadata.description, 'test')
    assert.equal(result.backup.data.metadata.source, 'chrome')
    assert.equal(result.backup.data.metadata.version, 2)
  })

  it('默认 metadata 为空对象', () => {
    const result = createBackup([])
    assert.deepEqual(result.backup.data.metadata, {})
  })

  it('timestamp 是有效 ISO 字符串', () => {
    const result = createBackup([])
    const date = new Date(result.backup.timestamp)
    assert.ok(!isNaN(date.getTime()))
  })

  it('backupId 形如 backup-{ts}-{rand}', () => {
    const result = createBackup([])
    assert.match(result.backup.backupId, /^backup-\d+-[a-z0-9]+$/)
  })
})

describe('createBackup — 空书签', () => {
  it('空数组创建成功，bookmarkCount 为 0', () => {
    const result = createBackup([])
    assert.equal(result.success, true)
    assert.equal(result.backup.bookmarkCount, 0)
    assert.deepEqual(result.backup.data.bookmarks, [])
  })
})

describe('createBackup — 大数据集', () => {
  it('能处理 1000 条书签', () => {
    const bookmarks = createTestBookmarks(1000)
    const result = createBackup(bookmarks)

    assert.equal(result.success, true)
    assert.equal(result.backup.bookmarkCount, 1000)
    assert.equal(result.backup.data.bookmarks.length, 1000)
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
    assert.equal(result.backup.data.bookmarks[0].title, 'Original')
  })

  it('不同调用返回不同的 backupId', () => {
    const b1 = createBackup([])
    const b2 = createBackup([])
    assert.notEqual(b1.backup.backupId, b2.backup.backupId)
  })
})

describe('createBackup — 无效输入', () => {
  it('非数组输入返回失败', () => {
    const result = createBackup('not-an-array')
    assert.equal(result.success, false)
    assert.ok(result.errors.length > 0)
  })

  it('null 输入返回失败', () => {
    const result = createBackup(null)
    assert.equal(result.success, false)
  })

  it('undefined 输入返回失败', () => {
    const result = createBackup(undefined)
    assert.equal(result.success, false)
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

describe('validateBackup — null / undefined / 非对象', () => {
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

  it('缺少 timestamp 字段', () => {
    const { backup } = createBackup([])
    delete backup.timestamp

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('timestamp')))
  })

  it('缺少 checksum 字段', () => {
    const { backup } = createBackup([])
    delete backup.checksum

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('checksum')))
  })

  it('缺少 data 字段', () => {
    const { backup } = createBackup([])
    delete backup.data

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('data')))
  })
})

describe('validateBackup — 损坏的备份', () => {
  it('篡改书签数据后校验和不匹配', () => {
    const { backup } = createBackup([bm(1, 'Test', 'https://test.com')])
    backup.data.bookmarks[0].title = 'Tampered'

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('校验和')))
  })

  it('篡改 checksum 值后验证失败', () => {
    const { backup } = createBackup([bm(1, 'Test', 'https://test.com')])
    backup.checksum = 'deadbeef'

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
  })

  it('错误的 version 值', () => {
    const { backup } = createBackup([])
    backup.version = '99.0'

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('版本不兼容')))
  })

  it('无效的 timestamp 字符串', () => {
    const { backup } = createBackup([])
    backup.timestamp = 'not-a-date'

    const result = validateBackup(backup)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('timestamp')))
  })
})

describe('validateBackup — 警告', () => {
  it('bookmarkCount 不匹配时产生警告', () => {
    const { backup } = createBackup([bm(1, 'Test', 'https://test.com')])
    backup.bookmarkCount = 999

    const result = validateBackup(backup)
    assert.equal(result.valid, true)
    assert.ok(result.warnings.some(w => w.includes('bookmarkCount')))
  })
})

// ==================== restoreBackup ====================

describe('restoreBackup — 成功恢复', () => {
  it('从有效备份恢复书签', () => {
    const bookmarks = [bm(1, 'A', 'https://a.com'), bm(2, 'B', 'https://b.com')]
    const { backup } = createBackup(bookmarks, { metadata: { source: 'test' } })

    const result = restoreBackup(backup)
    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 2)
    assert.deepEqual(result.bookmarks, bookmarks)
    assert.deepEqual(result.metadata, { source: 'test' })
    assert.equal(result.errors.length, 0)
  })

  it('恢复空书签备份', () => {
    const { backup } = createBackup([])
    const result = restoreBackup(backup)

    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 0)
  })

  it('恢复时包含 metadata', () => {
    const meta = { description: '备份', version: 2 }
    const { backup } = createBackup([bm(1, 'X', 'https://x.com')], { metadata: meta })

    const result = restoreBackup(backup)
    assert.deepEqual(result.metadata, meta)
  })

  it('无 metadata 选项时返回空对象', () => {
    const { backup } = createBackup([])
    const result = restoreBackup(backup)
    assert.deepEqual(result.metadata, {})
  })
})

describe('restoreBackup — 深拷贝隔离', () => {
  it('恢复的数据是深拷贝', () => {
    const bookmarks = [bm(1, 'A', 'https://a.com')]
    const { backup } = createBackup(bookmarks)

    const result = restoreBackup(backup)
    result.bookmarks[0].title = 'Modified'

    assert.equal(backup.data.bookmarks[0].title, 'A')
  })

  it('修改恢复数据不影响原始备份', () => {
    const { backup } = createBackup([bm(1, 'X', 'https://x.com')], { metadata: { tag: 'original' } })

    const result = restoreBackup(backup)
    result.metadata.tag = 'changed'

    assert.equal(backup.data.metadata.tag, 'original')
  })
})

describe('restoreBackup — 部分恢复', () => {
  it('跳过结构无效的书签', () => {
    const { backup } = createBackup([bm(1, 'Valid', 'https://valid.com')])
    // 注入无效书签
    backup.data.bookmarks.push(null)
    backup.data.bookmarks.push({ noId: true })
    // 重新计算 checksum 以通过验证
    const dataStr = JSON.stringify(backup.data)
    backup.checksum = computeChecksum(dataStr)

    const result = restoreBackup(backup)
    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 1)
    assert.ok(result.warnings.some(w => w.includes('已跳过')))
  })
})

describe('restoreBackup — 失败场景', () => {
  it('null 输入返回失败', () => {
    const result = restoreBackup(null)
    assert.equal(result.success, false)
    assert.equal(result.bookmarks, null)
    assert.equal(result.metadata, null)
  })

  it('undefined 输入返回失败', () => {
    const result = restoreBackup(undefined)
    assert.equal(result.success, false)
  })

  it('损坏的备份（校验和不匹配）返回失败', () => {
    const { backup } = createBackup([bm(1, 'Test', 'https://test.com')])
    backup.data.bookmarks.push({ id: 'extra' })
    // 不更新 checksum → 校验和不匹配

    const result = restoreBackup(backup)
    assert.equal(result.success, false)
    assert.ok(result.errors.length > 0)
  })

  it('缺少 version 的备份返回失败', () => {
    const { backup } = createBackup([])
    delete backup.version

    const result = restoreBackup(backup)
    assert.equal(result.success, false)
  })
})

// ==================== 端到端 Round-Trip ====================

describe('完整 round-trip: 创建 → 验证 → 恢复', () => {
  it('原始书签数据与恢复后数据完全一致', () => {
    const original = [
      bm(1, 'GitHub', 'https://github.com', ['开发', '工具'], ['code']),
      bm(2, 'MDN', 'https://developer.mozilla.org', ['开发', '文档'], ['docs', 'web']),
      bm(3, 'StackOverflow', 'https://stackoverflow.com', ['开发']),
    ]
    const options = {
      description: '手动备份',
      metadata: { source: 'chrome', exportDate: '2026-05-16' },
    }

    // 1. 创建备份
    const { success, backup } = createBackup(original, options)
    assert.equal(success, true)

    // 2. 验证备份
    const validation = validateBackup(backup)
    assert.equal(validation.valid, true)

    // 3. 恢复
    const restored = restoreBackup(backup)
    assert.equal(restored.success, true)
    assert.deepEqual(restored.bookmarks, original)
    assert.equal(restored.metadata.source, 'chrome')
    assert.equal(restored.metadata.description, '手动备份')
  })

  it('大数据集 round-trip 保持完整性', () => {
    const original = createTestBookmarks(200)

    const { success, backup } = createBackup(original)
    assert.equal(success, true)

    const validation = validateBackup(backup)
    assert.equal(validation.valid, true)

    const restored = restoreBackup(backup)
    assert.equal(restored.success, true)
    assert.equal(restored.bookmarks.length, 200)
    assert.deepEqual(restored.bookmarks, original)
  })
})
