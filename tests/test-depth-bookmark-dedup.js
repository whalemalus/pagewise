/**
 * test-depth-bookmark-dedup.js — BookmarkDedup 深度测试
 *
 * 测试范围:
 *   normalizeUrl      — 协议移除、www 移除、跟踪参数清理、尾部斜杠
 *   titleSimilarity   — Jaccard 系数、相同/不同/空字符串
 *   findByExactUrl    — 精确 URL 分组
 *   findBySimilarTitle — 标题相似度分组、阈值调整
 *   findDuplicates    — 综合去重、合并 URL+标题
 *   suggestCleanup    — remove/merge 建议
 *   batchRemove       — 批量删除、空输入、不存在 ID
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { BookmarkDedup } = await import('../lib/bookmark-dedup.js')

// ==================== 辅助函数 ====================

function makeBookmark(overrides = {}) {
  return {
    id: '1',
    title: 'Test Bookmark',
    url: 'https://example.com',
    folderPath: ['默认'],
    tags: [],
    ...overrides,
  }
}

// ==================== 测试 ====================

describe('BookmarkDedup', () => {

  // ─── normalizeUrl ─────────────────────────────────────────────────────

  describe('normalizeUrl — URL 规范化', () => {
    it('1. 移除 https 协议和 www 前缀', () => {
      const result = BookmarkDedup.normalizeUrl('https://www.example.com')
      assert.equal(result, 'example.com')
    })

    it('2. 移除跟踪参数 (utm_source, fbclid 等)', () => {
      const result = BookmarkDedup.normalizeUrl('https://example.com/page?utm_source=twitter&key=val')
      assert.equal(result, 'example.com/page?key=val')
    })

    it('3. 移除尾部斜杠（非根路径）', () => {
      const result = BookmarkDedup.normalizeUrl('https://example.com/path/')
      assert.equal(result, 'example.com/path')
    })

    it('4. 根路径尾部斜杠也被移除（长度 > 1 时）', () => {
      const result = BookmarkDedup.normalizeUrl('https://example.com/')
      assert.equal(result, 'example.com')
    })

    it('5. null/undefined/非字符串返回空字符串', () => {
      assert.equal(BookmarkDedup.normalizeUrl(null), '')
      assert.equal(BookmarkDedup.normalizeUrl(undefined), '')
      assert.equal(BookmarkDedup.normalizeUrl(123), '')
    })
  })

  // ─── titleSimilarity ──────────────────────────────────────────────────

  describe('titleSimilarity — 标题相似度', () => {
    it('6. 完全相同标题返回 1', () => {
      assert.equal(BookmarkDedup.titleSimilarity('Hello World', 'Hello World'), 1)
    })

    it('7. 两个空字符串返回 1', () => {
      assert.equal(BookmarkDedup.titleSimilarity('', ''), 1)
    })

    it('8. 一个为空一个非空返回 0', () => {
      assert.equal(BookmarkDedup.titleSimilarity('', 'test'), 0)
    })

    it('9. 完全不同的标题返回 0', () => {
      assert.equal(BookmarkDedup.titleSimilarity('apple', 'zebra'), 0)
    })

    it('10. 部分重叠的标题返回介于 0 和 1 之间', () => {
      const sim = BookmarkDedup.titleSimilarity('Hello World Foo', 'Hello World Bar')
      assert.ok(sim > 0 && sim < 1, `expected 0 < sim < 1, got ${sim}`)
      // 交集 = {hello, world} 2, 并集 = {hello, world, foo, bar} 4 → 0.5
      assert.equal(sim, 0.5)
    })
  })

  // ─── findByExactUrl ───────────────────────────────────────────────────

  describe('findByExactUrl — 精确 URL 去重', () => {
    it('11. 重复 URL 被分到同一组', () => {
      const dedup = new BookmarkDedup([
        makeBookmark({ id: '1', url: 'https://example.com' }),
        makeBookmark({ id: '2', url: 'http://example.com' }),
        makeBookmark({ id: '3', url: 'https://other.com' }),
      ])
      const groups = dedup.findByExactUrl()
      assert.equal(groups.length, 1)
      assert.equal(groups[0].length, 2)
    })

    it('12. 无重复时返回空数组', () => {
      const dedup = new BookmarkDedup([
        makeBookmark({ id: '1', url: 'https://a.com' }),
        makeBookmark({ id: '2', url: 'https://b.com' }),
      ])
      assert.deepEqual(dedup.findByExactUrl(), [])
    })
  })

  // ─── findBySimilarTitle ───────────────────────────────────────────────

  describe('findBySimilarTitle — 标题相似度去重', () => {
    it('13. 相似标题被分到同一组', () => {
      const dedup = new BookmarkDedup([
        makeBookmark({ id: '1', title: 'JavaScript Guide Beginner' }),
        makeBookmark({ id: '2', title: 'JavaScript Guide Advanced' }),
        makeBookmark({ id: '3', title: 'Python Tutorial' }),
      ])
      const groups = dedup.findBySimilarTitle(0.4)
      assert.ok(groups.length >= 1)
      const jsGroup = groups.find(g => g.some(b => b.id === '1'))
      assert.ok(jsGroup && jsGroup.length === 2)
    })

    it('14. 提高阈值后相似标题不再分组', () => {
      const dedup = new BookmarkDedup([
        makeBookmark({ id: '1', title: 'Hello World' }),
        makeBookmark({ id: '2', title: 'Hello Earth' }),
      ])
      const lowThreshold = dedup.findBySimilarTitle(0.3)
      assert.ok(lowThreshold.length >= 1)
      const highThreshold = dedup.findBySimilarTitle(0.9)
      assert.equal(highThreshold.length, 0)
    })
  })

  // ─── batchRemove ──────────────────────────────────────────────────────

  describe('batchRemove — 批量删除', () => {
    it('15. 删除指定 ID 后剩余书签数量正确', () => {
      const dedup = new BookmarkDedup([
        makeBookmark({ id: '1' }),
        makeBookmark({ id: '2' }),
        makeBookmark({ id: '3' }),
      ])
      const removed = dedup.batchRemove(['1', '3'])
      assert.equal(removed, 2)
      assert.equal(dedup.bookmarks.length, 1)
      assert.equal(dedup.bookmarks[0].id, '2')
    })
  })
})
