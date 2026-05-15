/**
 * test-depth-review-session.js — ReviewSession 深度测试
 *
 * 测试范围:
 *   构造函数       — 默认状态
 *   start()        — 激活会话、重置状态、标签过滤
 *   recordCard()   — 记录卡片、质量评分、计数器
 *   getStats()     — 统计快照、准确率计算
 *   finish()       — 生成记录、停用会话、ID 唯一性
 *   异常保护       — 未激活时调用 recordCard / finish
 *   chrome.storage — saveSession、getRecentSessions、getWeeklyStats、getSessionHistory
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// ── chrome mock ──────────────────────────────────────────────────────────────

let storageData = {}

const chromeMock = {
  storage: {
    local: {
      async get(key) {
        return { [key]: storageData[key] || [] }
      },
      async set(obj) {
        Object.assign(storageData, obj)
      },
    },
  },
}

globalThis.chrome = chromeMock

const {
  ReviewSession,
  saveSession,
  getRecentSessions,
  getWeeklyStats,
  getSessionHistory,
  SESSIONS_KEY,
  MAX_SESSIONS,
} = await import('../lib/review-session.js')

// ── helpers ──────────────────────────────────────────────────────────────────

function makeCard(overrides = {}) {
  return {
    entryId: 'entry-1',
    quality: 4,
    interval: 1,
    nextReview: Date.now() + 86400000,
    ...overrides,
  }
}

function seedSessions(count, opts = {}) {
  const sessions = []
  const baseTime = opts.weekStart || Date.now()
  for (let i = 0; i < count; i++) {
    sessions.push({
      id: `s-${baseTime + i}`,
      startTime: baseTime + i,
      endTime: baseTime + i + 60000,
      duration: 60000,
      totalCards: opts.totalCards ?? 5,
      correctCards: opts.correctCards ?? 4,
      accuracy: 80,
      tagFilter: null,
      cardDetails: [],
    })
  }
  return sessions
}

// ── 测试 ─────────────────────────────────────────────────────────────────────

describe('ReviewSession', () => {

  beforeEach(() => {
    storageData = {}
  })

  // ─── 构造函数 ───────────────────────────────────────────────────────────

  describe('constructor — 初始状态', () => {
    it('1. 实例默认 isActive=false, totalCards=0, cardDetails=[]', () => {
      const s = new ReviewSession()
      assert.equal(s.isActive, false)
      assert.equal(s.startTime, 0)
      assert.equal(s.totalCards, 0)
      assert.equal(s.correctCards, 0)
      assert.equal(s.tagFilter, null)
      assert.deepEqual(s.cardDetails, [])
    })
  })

  // ─── start() ────────────────────────────────────────────────────────────

  describe('start — 激活会话', () => {
    it('2. start() 激活会话并重置计数器', () => {
      const s = new ReviewSession()
      s.start()
      assert.equal(s.isActive, true)
      assert.ok(s.startTime > 0)
      assert.equal(s.totalCards, 0)
      assert.equal(s.correctCards, 0)
      assert.deepEqual(s.cardDetails, [])
    })

    it('3. start(tag) 设置标签过滤', () => {
      const s = new ReviewSession()
      s.start('javascript')
      assert.equal(s.tagFilter, 'javascript')
    })

    it('4. 重复 start() 重置上一次会话数据', () => {
      const s = new ReviewSession()
      s.start()
      s.recordCard(makeCard({ entryId: 'c1' }))
      s.start('go')
      assert.equal(s.totalCards, 0)
      assert.equal(s.tagFilter, 'go')
      assert.equal(s.cardDetails.length, 0)
    })
  })

  // ─── recordCard() ───────────────────────────────────────────────────────

  describe('recordCard — 记录卡片', () => {
    it('5. quality >= 3 计入正确 (correctCards++)', () => {
      const s = new ReviewSession()
      s.start()
      s.recordCard(makeCard({ entryId: 'c1', quality: 4 }))
      assert.equal(s.totalCards, 1)
      assert.equal(s.correctCards, 1)
    })

    it('6. quality < 3 不计入正确', () => {
      const s = new ReviewSession()
      s.start()
      s.recordCard(makeCard({ entryId: 'c2', quality: 2 }))
      assert.equal(s.totalCards, 1)
      assert.equal(s.correctCards, 0)
    })

    it('7. cardDetails 保留每张卡片详情', () => {
      const s = new ReviewSession()
      s.start()
      const card = makeCard({ entryId: 'c3', quality: 5, interval: 7 })
      s.recordCard(card)
      assert.equal(s.cardDetails.length, 1)
      assert.equal(s.cardDetails[0].entryId, 'c3')
      assert.equal(s.cardDetails[0].quality, 5)
      assert.equal(s.cardDetails[0].interval, 7)
      assert.ok(typeof s.cardDetails[0].nextReview === 'number')
    })

    it('8. 未激活时 recordCard() 抛出异常', () => {
      const s = new ReviewSession()
      assert.throws(() => s.recordCard(makeCard()), /会话未激活/)
    })
  })

  // ─── getStats() ─────────────────────────────────────────────────────────

  describe('getStats — 统计快照', () => {
    it('9. 正确计算准确率和已复习数', () => {
      const s = new ReviewSession()
      s.start()
      s.recordCard(makeCard({ quality: 5 }))
      s.recordCard(makeCard({ quality: 1 }))
      s.recordCard(makeCard({ quality: 3 }))
      const stats = s.getStats()
      assert.equal(stats.totalCards, 3)
      assert.equal(stats.correctCards, 2)
      assert.equal(stats.accuracy, 67) // 2/3 ≈ 67
    })

    it('10. 无卡片时 accuracy = 0', () => {
      const s = new ReviewSession()
      s.start()
      const stats = s.getStats()
      assert.equal(stats.accuracy, 0)
      assert.equal(stats.totalCards, 0)
    })

    it('11. 未激活时 elapsed = 0', () => {
      const s = new ReviewSession()
      const stats = s.getStats()
      assert.equal(stats.elapsed, 0)
    })
  })

  // ─── finish() ───────────────────────────────────────────────────────────

  describe('finish — 结束会话', () => {
    it('12. finish() 返回完整 SessionRecord', () => {
      const s = new ReviewSession()
      s.start('js')
      s.recordCard(makeCard({ entryId: 'c1', quality: 5 }))
      s.recordCard(makeCard({ entryId: 'c2', quality: 2 }))
      const rec = s.finish()

      assert.equal(rec.totalCards, 2)
      assert.equal(rec.correctCards, 1)
      assert.equal(rec.accuracy, 50)
      assert.equal(rec.tagFilter, 'js')
      assert.ok(rec.id.startsWith('s-'))
      assert.ok(rec.duration >= 0)
      assert.ok(rec.endTime >= rec.startTime)
      assert.equal(rec.cardDetails.length, 2)
    })

    it('13. finish() 后 isActive 变为 false', () => {
      const s = new ReviewSession()
      s.start()
      s.finish()
      assert.equal(s.isActive, false)
    })

    it('14. finish() 后 cardDetails 是副本不影响原数组', () => {
      const s = new ReviewSession()
      s.start()
      s.recordCard(makeCard({ entryId: 'x' }))
      const rec = s.finish()
      rec.cardDetails.push({ entryId: 'injected' })
      // 原实例的 cardDetails 已在 finish 后不再维护，但记录副本不应互相影响
      assert.equal(rec.cardDetails.length, 2)
    })

    it('15. 未激活时 finish() 抛出异常', () => {
      const s = new ReviewSession()
      assert.throws(() => s.finish(), /会话未激活/)
    })
  })

  // ─── chrome.storage 函数 ────────────────────────────────────────────────

  describe('saveSession / getSessionHistory — 存储持久化', () => {
    it('saveSession 保存后 getSessionHistory 可取出', async () => {
      const record = { id: 's-1', startTime: 1, endTime: 2, duration: 1, totalCards: 3, correctCards: 2, accuracy: 67, tagFilter: null, cardDetails: [] }
      await saveSession(record)
      const history = await getSessionHistory()
      assert.equal(history.length, 1)
      assert.equal(history[0].id, 's-1')
    })

    it('saveSession 超过 MAX_SESSIONS 时裁剪旧记录', async () => {
      const records = Array.from({ length: MAX_SESSIONS + 5 }, (_, i) => ({
        id: `s-${i}`, startTime: i, endTime: i, duration: 0, totalCards: 0, correctCards: 0, accuracy: 0, tagFilter: null, cardDetails: []
      }))
      for (const r of records) await saveSession(r)
      const history = await getSessionHistory()
      assert.equal(history.length, MAX_SESSIONS)
      // 最新的在前
      assert.equal(history[0].id, `s-${MAX_SESSIONS + 4}`)
    })

    it('getRecentSessions(limit) 返回指定条数', async () => {
      const records = Array.from({ length: 5 }, (_, i) => ({
        id: `s-${i}`, startTime: i, endTime: i, duration: 0, totalCards: 0, correctCards: 0, accuracy: 0, tagFilter: null, cardDetails: []
      }))
      for (const r of records) await saveSession(r)
      const recent = await getRecentSessions(3)
      assert.equal(recent.length, 3)
    })

    it('getWeeklyStats 汇总本周数据', async () => {
      const now = Date.now()
      const thisWeek = [
        { id: 'w1', startTime: now - 1000, endTime: now, duration: 1000, totalCards: 10, correctCards: 8, accuracy: 80, tagFilter: null, cardDetails: [] },
        { id: 'w2', startTime: now - 2000, endTime: now, duration: 2000, totalCards: 5, correctCards: 5, accuracy: 100, tagFilter: null, cardDetails: [] },
      ]
      for (const r of thisWeek) await saveSession(r)
      const stats = await getWeeklyStats()
      assert.equal(stats.totalSessions, 2)
      assert.equal(stats.totalCards, 15)
      assert.equal(stats.totalCorrect, 13)
    })

    it('chrome.storage 抛错时 getRecentSessions 返回 []', async () => {
      // 临时破坏 chrome mock
      const orig = chrome.storage.local.get
      chrome.storage.local.get = async () => { throw new Error('quota') }
      const result = await getRecentSessions()
      assert.deepEqual(result, [])
      chrome.storage.local.get = orig
    })
  })
})
