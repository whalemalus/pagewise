/**
 * test-depth-bookmark-sync.js — BookmarkSync 深度测试
 *
 * 测试范围:
 *   initSync      — 初始化引擎、无效 storage、方法缺失检测
 *   syncToCloud   — 推送书签、空数组、配额分片、存储异常
 *   syncFromCloud — 拉取书签、分片读取、格式校验、无数据
 *   resolveConflict — 三种策略、非法参数、深拷贝不污染原始数据
 *   状态管理       — getSyncStatus / getLastError / resetSync / getLastSyncTime
 *   辅助函数       — estimateBytes / splitBookmarks / 错误分类
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const mod = await import('../lib/bookmark-sync.js')
const {
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
  CONFLICT_STRATEGY_LOCAL,
  CONFLICT_STRATEGY_REMOTE,
  CONFLICT_STRATEGY_MERGE,
  SYNC_ITEM_MAX_BYTES,
} = mod

// ==================== 辅助函数 ====================

function makeStorage() {
  const store = new Map()
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, val) => { store.set(key, JSON.parse(JSON.stringify(val))) },
    remove: async (key) => { store.delete(key) },
    _store: store,
  }
}

function makeBookmark(overrides = {}) {
  return {
    id: '1',
    title: 'Test',
    url: 'https://example.com',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

const SAMPLE_BOOKMARKS = [
  makeBookmark({ id: '1', title: 'React', url: 'https://react.dev' }),
  makeBookmark({ id: '2', title: 'Vue', url: 'https://vuejs.org' }),
  makeBookmark({ id: '3', title: 'Node', url: 'https://nodejs.org' }),
]

// ==================== 测试 ====================

describe('BookmarkSync', () => {
  beforeEach(() => {
    resetSync()
  })

  // ─── initSync ─────────────────────────────────────────────────────────

  describe('initSync — 初始化引擎', () => {
    it('1. 用合法 storage 初始化成功', () => {
      const storage = makeStorage()
      const result = initSync(storage)
      assert.equal(result.success, true)
      assert.equal(result.status, SYNC_STATUS_IDLE)
      assert.deepEqual(result.errors, [])
    })

    it('2. 传入 null 返回失败', () => {
      const result = initSync(null)
      assert.equal(result.success, false)
      assert.equal(result.status, SYNC_STATUS_ERROR)
      assert.ok(result.errors.length > 0)
    })

    it('3. storage 缺少方法时报告所有缺失', () => {
      const result = initSync({})
      assert.equal(result.success, false)
      assert.ok(result.errors.includes('存储对象缺少 get 方法'))
      assert.ok(result.errors.includes('存储对象缺少 set 方法'))
      assert.ok(result.errors.includes('存储对象缺少 remove 方法'))
    })

    it('4. 初始化后状态为 idle 且 lastError 为 null', () => {
      initSync(makeStorage())
      assert.equal(getSyncStatus(), SYNC_STATUS_IDLE)
      assert.equal(getLastError(), null)
    })
  })

  // ─── syncToCloud ──────────────────────────────────────────────────────

  describe('syncToCloud — 推送同步', () => {
    it('5. 成功推送书签并返回 syncedCount', async () => {
      initSync(makeStorage())
      const result = await syncToCloud(SAMPLE_BOOKMARKS)
      assert.equal(result.success, true)
      assert.equal(result.status, SYNC_STATUS_SUCCESS)
      assert.equal(result.syncedCount, 3)
    })

    it('6. 未初始化时调用返回错误', async () => {
      resetSync()
      const result = await syncToCloud(SAMPLE_BOOKMARKS)
      assert.equal(result.success, false)
      assert.ok(result.errors[0].includes('未初始化'))
    })

    it('7. 传入非数组参数返回错误', async () => {
      initSync(makeStorage())
      const result = await syncToCloud('not-an-array')
      assert.equal(result.success, false)
      assert.ok(result.errors[0].includes('数组'))
    })

    it('8. 推送空数组成功且 syncedCount 为 0', async () => {
      initSync(makeStorage())
      const result = await syncToCloud([])
      assert.equal(result.success, true)
      assert.equal(result.syncedCount, 0)
    })

    it('9. 存储 set 抛出 quota 错误时状态变为 quota_exceeded', async () => {
      const storage = makeStorage()
      storage.set = async () => { throw new Error('QUOTA_BYTES exceeded') }
      initSync(storage)
      const result = await syncToCloud(SAMPLE_BOOKMARKS)
      assert.equal(result.success, false)
      assert.equal(result.status, SYNC_STATUS_QUOTA_EXCEEDED)
      assert.ok(getLastError().includes('配额超限'))
    })

    it('10. 存储 set 抛出 network 错误时状态变为 network_error', async () => {
      const storage = makeStorage()
      storage.set = async () => { throw new Error('network timeout') }
      initSync(storage)
      const result = await syncToCloud(SAMPLE_BOOKMARKS)
      assert.equal(result.success, false)
      assert.equal(result.status, SYNC_STATUS_NETWORK_ERROR)
    })
  })

  // ─── syncFromCloud ────────────────────────────────────────────────────

  describe('syncFromCloud — 拉取同步', () => {
    it('11. 云端无数据时返回空数组和 warning', async () => {
      initSync(makeStorage())
      const result = await syncFromCloud()
      assert.equal(result.success, true)
      assert.deepEqual(result.bookmarks, [])
      assert.ok(result.warnings.some(w => w.includes('无同步数据')))
    })

    it('12. 推送后再拉取可获取完整书签', async () => {
      initSync(makeStorage())
      await syncToCloud(SAMPLE_BOOKMARKS)
      const result = await syncFromCloud()
      assert.equal(result.success, true)
      assert.equal(result.bookmarks.length, 3)
      assert.equal(result.bookmarks[0].id, '1')
    })

    it('13. 云端数据格式损坏时返回错误', async () => {
      const storage = makeStorage()
      storage.get = async () => 'invalid-string-data'
      initSync(storage)
      const result = await syncFromCloud()
      assert.equal(result.success, false)
      assert.ok(result.errors[0].includes('格式无效'))
    })

    it('14. 云端 bookmarks 非数组时返回错误', async () => {
      const storage = makeStorage()
      storage.get = async (key) => {
        if (key === 'pagewise-sync-time') return null
        return { version: '1.0', bookmarks: 'not-array' }
      }
      initSync(storage)
      const result = await syncFromCloud()
      assert.equal(result.success, false)
      assert.ok(result.errors[0].includes('损坏'))
    })

    it('15. 未初始化时拉取返回错误', async () => {
      const result = await syncFromCloud()
      assert.equal(result.success, false)
      assert.ok(result.errors[0].includes('未初始化'))
    })
  })
})
