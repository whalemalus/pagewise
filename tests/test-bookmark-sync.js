/**
 * test-bookmark-sync.js — BookmarkSync 模块测试
 *
 * 测试 lib/bookmark-sync.js 的所有导出功能:
 *   - initSync, getSyncStatus, getLastError, resetSync
 *   - syncToCloud, syncFromCloud
 *   - resolveConflict (local_wins, remote_wins, merge)
 *   - getLastSyncTime
 *   - estimateBytes, splitBookmarks
 *   - 状态常量, 错误分类, null 输入处理
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  initSync,
  getSyncStatus,
  getLastError,
  resetSync,
  syncToCloud,
  syncFromCloud,
  resolveConflict,
  getLastSyncTime,
  estimateBytes,
  splitBookmarks,
  SYNC_STATUS_IDLE,
  SYNC_STATUS_SYNCING,
  SYNC_STATUS_SUCCESS,
  SYNC_STATUS_ERROR,
  SYNC_STATUS_QUOTA_EXCEEDED,
  SYNC_STATUS_NETWORK_ERROR,
  SYNC_STATUS_CONFLICT,
  CONFLICT_STRATEGY_LOCAL,
  CONFLICT_STRATEGY_REMOTE,
  CONFLICT_STRATEGY_MERGE,
  SYNC_KEY,
  SYNC_TIME_KEY,
  SYNC_FORMAT_VERSION,
  SYNC_ITEM_MAX_BYTES,
  SYNC_TOTAL_MAX_BYTES,
} from '../lib/bookmark-sync.js'

// ==================== Simple Storage Mock ====================

/**
 * 创建简单存储 mock，匹配 bookmark-sync 期望的接口:
 *   get(key) -> value | null
 *   set(key, value) -> void
 *   remove(key) -> void
 */
function createSimpleStorage() {
  const store = new Map()
  return {
    async get(key) {
      return store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null
    },
    async set(key, value) {
      store.set(key, JSON.parse(JSON.stringify(value)))
    },
    async remove(key) {
      store.delete(key)
    },
    _store: store,
  }
}

function createFailingStorage(errorMsg = 'storage error') {
  return {
    async get() { throw new Error(errorMsg) },
    async set() { throw new Error(errorMsg) },
    async remove() { throw new Error(errorMsg) },
  }
}

function createQuotaStorage() {
  return {
    async get() { throw new Error('QUOTA_BYTES exceeded') },
    async set() { throw new Error('QUOTA_BYTES exceeded') },
    async remove() { throw new Error('QUOTA_BYTES exceeded') },
  }
}

function createNetworkStorage() {
  return {
    async get() { throw new Error('network request failed') },
    async set() { throw new Error('NetworkError when attempting to fetch') },
    async remove() { throw new Error('offline') },
  }
}

// ==================== Helpers ====================

function makeBookmarks(n, prefix = 'bm') {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    title: `Bookmark ${i + 1}`,
    url: `https://example.com/${i + 1}`,
    createdAt: new Date(2025, 0, i + 1).toISOString(),
  }))
}

// ==================== Tests ====================

describe('BookmarkSync — sync status constants', () => {
  it('should export all status constants as strings', () => {
    assert.equal(typeof SYNC_STATUS_IDLE, 'string')
    assert.equal(typeof SYNC_STATUS_SYNCING, 'string')
    assert.equal(typeof SYNC_STATUS_SUCCESS, 'string')
    assert.equal(typeof SYNC_STATUS_ERROR, 'string')
    assert.equal(typeof SYNC_STATUS_QUOTA_EXCEEDED, 'string')
    assert.equal(typeof SYNC_STATUS_NETWORK_ERROR, 'string')
    assert.equal(typeof SYNC_STATUS_CONFLICT, 'string')
  })

  it('should export conflict strategy constants', () => {
    assert.equal(CONFLICT_STRATEGY_LOCAL, 'local_wins')
    assert.equal(CONFLICT_STRATEGY_REMOTE, 'remote_wins')
    assert.equal(CONFLICT_STRATEGY_MERGE, 'merge')
  })

  it('should export sync key constants', () => {
    assert.equal(typeof SYNC_KEY, 'string')
    assert.equal(typeof SYNC_TIME_KEY, 'string')
    assert.equal(SYNC_FORMAT_VERSION, '1.0')
    assert.equal(typeof SYNC_ITEM_MAX_BYTES, 'number')
    assert.equal(typeof SYNC_TOTAL_MAX_BYTES, 'number')
  })
})

describe('BookmarkSync — initSync', () => {
  beforeEach(() => resetSync())

  it('should succeed with valid storage object', () => {
    const storage = createSimpleStorage()
    const result = initSync(storage)
    assert.equal(result.success, true)
    assert.equal(result.status, SYNC_STATUS_IDLE)
    assert.deepEqual(result.errors, [])
  })

  it('should fail with null storage', () => {
    const result = initSync(null)
    assert.equal(result.success, false)
    assert.equal(result.status, SYNC_STATUS_ERROR)
    assert.ok(result.errors.length > 0)
  })

  it('should fail with undefined storage', () => {
    const result = initSync(undefined)
    assert.equal(result.success, false)
    assert.equal(result.status, SYNC_STATUS_ERROR)
  })

  it('should fail when storage is missing get/set/remove methods', () => {
    const result = initSync({})
    assert.equal(result.success, false)
    assert.equal(result.status, SYNC_STATUS_ERROR)
    assert.equal(result.errors.length, 3)
  })

  it('should fail when storage is missing only some methods', () => {
    const result = initSync({ get: () => {}, set: () => {} })
    assert.equal(result.success, false)
    assert.ok(result.errors.some(e => e.includes('remove')))
  })
})

describe('BookmarkSync — getSyncStatus & getLastError', () => {
  beforeEach(() => resetSync())

  it('should return idle status initially', () => {
    assert.equal(getSyncStatus(), SYNC_STATUS_IDLE)
  })

  it('should return null error initially', () => {
    assert.equal(getLastError(), null)
  })
})

describe('BookmarkSync — resetSync', () => {
  it('should reset all internal state', () => {
    initSync(createSimpleStorage())
    resetSync()
    assert.equal(getSyncStatus(), SYNC_STATUS_IDLE)
    assert.equal(getLastError(), null)
  })
})

describe('BookmarkSync — estimateBytes', () => {
  it('should return 0 for null', () => {
    assert.equal(estimateBytes(null), 0)
  })

  it('should return 0 for undefined', () => {
    assert.equal(estimateBytes(undefined), 0)
  })

  it('should return a positive number for an object', () => {
    const size = estimateBytes({ hello: 'world' })
    assert.ok(size > 0)
    assert.ok(size < 100)
  })

  it('should return Infinity for circular reference data', () => {
    const circular = {}
    circular.self = circular
    // JSON.stringify throws on circular, so estimateBytes returns Infinity
    assert.equal(estimateBytes(circular), Infinity)
  })
})

describe('BookmarkSync — splitBookmarks', () => {
  it('should return empty array for non-array input', () => {
    assert.deepEqual(splitBookmarks(null, 1000), [])
    assert.deepEqual(splitBookmarks(undefined, 1000), [])
    assert.deepEqual(splitBookmarks('not-array', 1000), [])
  })

  it('should return empty array for empty bookmarks', () => {
    assert.deepEqual(splitBookmarks([], 1000), [])
  })

  it('should return empty array for invalid maxBytes', () => {
    assert.deepEqual(splitBookmarks(makeBookmarks(5), 0), [])
    assert.deepEqual(splitBookmarks(makeBookmarks(5), -1), [])
    assert.deepEqual(splitBookmarks(makeBookmarks(5), 'bad'), [])
  })

  it('should split bookmarks into chunks when data exceeds maxBytes', () => {
    const bms = makeBookmarks(10)
    const singleSize = estimateBytes(bms[0])
    // Use maxBytes that allows ~3 bookmarks per chunk
    const maxBytes = singleSize * 3
    const chunks = splitBookmarks(bms, maxBytes)
    assert.ok(chunks.length > 1)
    // Total bookmarks across chunks should equal input
    const total = chunks.reduce((sum, c) => sum + c.length, 0)
    assert.equal(total, 10)
  })

  it('should keep all in one chunk when under limit', () => {
    const bms = makeBookmarks(3)
    const chunks = splitBookmarks(bms, SYNC_TOTAL_MAX_BYTES)
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].length, 3)
  })

  it('should skip bookmarks that individually exceed maxBytes', () => {
    const bms = makeBookmarks(3)
    // Make one bookmark extremely large
    bms[1].hugeData = 'x'.repeat(10000)
    const chunks = splitBookmarks(bms, 500)
    // The huge bookmark should be skipped
    const total = chunks.reduce((sum, c) => sum + c.length, 0)
    assert.ok(total < 3)
  })
})

describe('BookmarkSync — syncToCloud', () => {
  beforeEach(() => resetSync())

  it('should fail if not initialized', async () => {
    const result = await syncToCloud([])
    assert.equal(result.success, false)
    assert.equal(result.status, SYNC_STATUS_ERROR)
    assert.ok(result.errors[0].includes('未初始化'))
  })

  it('should fail if bookmarks is not an array', async () => {
    initSync(createSimpleStorage())
    const result = await syncToCloud('not-array')
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('数组'))
  })

  it('should succeed with empty bookmarks array', async () => {
    const storage = createSimpleStorage()
    initSync(storage)
    const result = await syncToCloud([])
    assert.equal(result.success, true)
    assert.equal(result.syncedCount, 0)
    assert.equal(getSyncStatus(), SYNC_STATUS_SUCCESS)
  })

  it('should succeed syncing small bookmarks (non-chunked)', async () => {
    const storage = createSimpleStorage()
    initSync(storage)
    const bms = makeBookmarks(5)
    const result = await syncToCloud(bms)
    assert.equal(result.success, true)
    assert.equal(result.syncedCount, 5)
    // Data should be stored
    const stored = await storage.get(SYNC_KEY)
    assert.ok(stored)
    assert.equal(stored.bookmarks.length, 5)
    assert.equal(stored.version, SYNC_FORMAT_VERSION)
  })

  it('should chunk data when exceeding SYNC_ITEM_MAX_BYTES', async () => {
    const storage = createSimpleStorage()
    initSync(storage)
    // Create bookmarks with large data to force chunking
    const bms = Array.from({ length: 20 }, (_, i) => ({
      id: `big-${i}`,
      title: `Bookmark ${i}`,
      url: `https://example.com/${i}`,
      description: 'x'.repeat(500),
      createdAt: new Date().toISOString(),
    }))
    const result = await syncToCloud(bms)
    assert.equal(result.success, true)
    assert.equal(result.syncedCount, 20)
    // Should have chunk keys
    const timeData = await storage.get(SYNC_TIME_KEY)
    assert.ok(timeData)
    assert.ok(timeData.chunks > 0)
    // Original key should be removed for chunked data
    const originalData = await storage.get(SYNC_KEY)
    assert.equal(originalData, null)
  })

  it('should set sync time after successful upload', async () => {
    const storage = createSimpleStorage()
    initSync(storage)
    await syncToCloud(makeBookmarks(2))
    const time = await getLastSyncTime()
    assert.ok(time)
    assert.equal(typeof time, 'string')
  })

  it('should handle storage error during upload', async () => {
    initSync(createFailingStorage('write failed'))
    const result = await syncToCloud(makeBookmarks(3))
    assert.equal(result.success, false)
    assert.equal(getSyncStatus(), SYNC_STATUS_ERROR)
  })
})

describe('BookmarkSync — syncFromCloud', () => {
  beforeEach(() => resetSync())

  it('should fail if not initialized', async () => {
    const result = await syncFromCloud()
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('未初始化'))
  })

  it('should return empty bookmarks when no cloud data exists', async () => {
    initSync(createSimpleStorage())
    const result = await syncFromCloud()
    assert.equal(result.success, true)
    assert.deepEqual(result.bookmarks, [])
    assert.ok(result.warnings.length > 0)
  })

  it('should download bookmarks from cloud', async () => {
    const storage = createSimpleStorage()
    initSync(storage)
    const bms = makeBookmarks(4)
    await syncToCloud(bms)
    resetSync()
    initSync(storage)
    const result = await syncFromCloud()
    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 4)
  })

  it('should handle corrupted sync data', async () => {
    const storage = createSimpleStorage()
    // Manually inject corrupted data
    await storage.set(SYNC_KEY, 'not-an-object')
    await storage.set(SYNC_TIME_KEY, { time: '2025-01-01', chunks: 0 })
    initSync(storage)
    const result = await syncFromCloud()
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('格式无效'))
  })

  it('should handle data with corrupted bookmarks field', async () => {
    const storage = createSimpleStorage()
    await storage.set(SYNC_KEY, { version: '1.0', bookmarks: 'not-array' })
    await storage.set(SYNC_TIME_KEY, { time: '2025-01-01', chunks: 0 })
    initSync(storage)
    const result = await syncFromCloud()
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('损坏'))
  })

  it('should warn on version mismatch', async () => {
    const storage = createSimpleStorage()
    await storage.set(SYNC_KEY, {
      version: '99.0',
      bookmarks: [{ id: '1', title: 'Test' }],
    })
    await storage.set(SYNC_TIME_KEY, { time: '2025-01-01', chunks: 0 })
    initSync(storage)
    const result = await syncFromCloud()
    assert.equal(result.success, true)
    assert.ok(result.warnings.some(w => w.includes('版本')))
  })

  it('should skip invalid bookmarks and warn', async () => {
    const storage = createSimpleStorage()
    await storage.set(SYNC_KEY, {
      version: SYNC_FORMAT_VERSION,
      bookmarks: [
        { id: '1', title: 'Valid' },
        { noId: true },
        null,
        { id: '2', title: 'Also Valid' },
      ],
    })
    await storage.set(SYNC_TIME_KEY, { time: '2025-01-01', chunks: 0 })
    initSync(storage)
    const result = await syncFromCloud()
    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 2)
    assert.ok(result.warnings.length > 0)
  })

  it('should download chunked data correctly', async () => {
    const storage = createSimpleStorage()
    initSync(storage)
    // Create large bookmarks to force chunking
    const bms = Array.from({ length: 20 }, (_, i) => ({
      id: `chunk-${i}`,
      title: `Chunk Bookmark ${i}`,
      url: `https://example.com/chunk/${i}`,
      description: 'y'.repeat(500),
    }))
    await syncToCloud(bms)
    resetSync()
    initSync(storage)
    const result = await syncFromCloud()
    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 20)
  })

  it('should handle storage error during download', async () => {
    initSync(createFailingStorage('read failed'))
    const result = await syncFromCloud()
    assert.equal(result.success, false)
    assert.equal(getSyncStatus(), SYNC_STATUS_ERROR)
  })
})

describe('BookmarkSync — resolveConflict', () => {
  it('should fail when local is not an array', () => {
    const result = resolveConflict(null, [])
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('local'))
  })

  it('should fail when remote is not an array', () => {
    const result = resolveConflict([], 'not-array')
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('remote'))
  })

  it('should fail with unsupported strategy', () => {
    const result = resolveConflict([], [], 'invalid_strategy')
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('不支持'))
  })

  it('should return local bookmarks with local_wins strategy', () => {
    const local = [{ id: '1', title: 'Local' }]
    const remote = [{ id: '1', title: 'Remote' }]
    const result = resolveConflict(local, remote, CONFLICT_STRATEGY_LOCAL)
    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 1)
    assert.equal(result.bookmarks[0].title, 'Local')
    assert.equal(result.strategy, CONFLICT_STRATEGY_LOCAL)
  })

  it('should return remote bookmarks with remote_wins strategy', () => {
    const local = [{ id: '1', title: 'Local' }]
    const remote = [{ id: '1', title: 'Remote' }]
    const result = resolveConflict(local, remote, CONFLICT_STRATEGY_REMOTE)
    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 1)
    assert.equal(result.bookmarks[0].title, 'Remote')
  })

  it('should merge bookmarks taking newer entries', () => {
    const local = [
      { id: '1', title: 'Old Local', updatedAt: '2025-01-01' },
      { id: '2', title: 'Only Local', updatedAt: '2025-01-01' },
    ]
    const remote = [
      { id: '1', title: 'Newer Remote', updatedAt: '2025-06-01' },
      { id: '3', title: 'Only Remote', updatedAt: '2025-03-01' },
    ]
    const result = resolveConflict(local, remote, CONFLICT_STRATEGY_MERGE)
    assert.equal(result.success, true)
    assert.equal(result.bookmarks.length, 3)
    // id 1: remote is newer
    const bm1 = result.bookmarks.find(b => b.id === '1')
    assert.equal(bm1.title, 'Newer Remote')
    // id 3: only in remote, added
    assert.equal(result.added, 1)
  })

  it('should default to merge strategy', () => {
    const local = [{ id: '1', title: 'A', updatedAt: '2025-01-01' }]
    const remote = [{ id: '2', title: 'B', updatedAt: '2025-01-01' }]
    const result = resolveConflict(local, remote)
    assert.equal(result.strategy, CONFLICT_STRATEGY_MERGE)
    assert.equal(result.bookmarks.length, 2)
  })

  it('should not mutate original arrays', () => {
    const local = [{ id: '1', title: 'Local' }]
    const remote = [{ id: '1', title: 'Remote' }]
    const localOrig = JSON.stringify(local)
    const remoteOrig = JSON.stringify(remote)
    resolveConflict(local, remote, CONFLICT_STRATEGY_MERGE)
    assert.deepEqual(local, JSON.parse(localOrig))
    assert.deepEqual(remote, JSON.parse(remoteOrig))
  })
})

describe('BookmarkSync — getLastSyncTime', () => {
  beforeEach(() => resetSync())

  it('should return null when no sync has occurred', async () => {
    const time = await getLastSyncTime()
    assert.equal(time, null)
  })

  it('should return sync time after upload', async () => {
    const storage = createSimpleStorage()
    initSync(storage)
    await syncToCloud(makeBookmarks(1))
    const time = await getLastSyncTime()
    assert.ok(time)
    assert.equal(typeof time, 'string')
    // Should be valid ISO string
    assert.ok(!isNaN(new Date(time).getTime()))
  })

  it('should return null when not initialized and no prior sync', async () => {
    const time = await getLastSyncTime()
    assert.equal(time, null)
  })
})

describe('BookmarkSync — error classification', () => {
  beforeEach(() => resetSync())

  it('should classify quota errors', async () => {
    initSync(createQuotaStorage())
    const result = await syncToCloud(makeBookmarks(1))
    assert.equal(result.success, false)
    assert.equal(result.status, SYNC_STATUS_QUOTA_EXCEEDED)
  })

  it('should classify network errors', async () => {
    initSync(createNetworkStorage())
    const result = await syncToCloud(makeBookmarks(1))
    assert.equal(result.success, false)
    assert.equal(result.status, SYNC_STATUS_NETWORK_ERROR)
  })

  it('should classify generic errors', async () => {
    initSync(createFailingStorage('something unexpected'))
    const result = await syncToCloud(makeBookmarks(1))
    assert.equal(result.success, false)
    assert.equal(result.status, SYNC_STATUS_ERROR)
  })
})

describe('BookmarkSync — round-trip sync', () => {
  beforeEach(() => resetSync())

  it('should upload and download identical bookmarks', async () => {
    const storage = createSimpleStorage()
    initSync(storage)
    const original = makeBookmarks(7)
    const uploadResult = await syncToCloud(original)
    assert.equal(uploadResult.success, true)

    resetSync()
    initSync(storage)
    const downloadResult = await syncFromCloud()
    assert.equal(downloadResult.success, true)
    assert.equal(downloadResult.bookmarks.length, 7)
    assert.equal(downloadResult.bookmarks[0].id, original[0].id)
    assert.equal(downloadResult.bookmarks[6].title, original[6].title)
  })
})
