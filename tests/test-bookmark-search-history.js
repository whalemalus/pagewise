/**
 * 测试 lib/bookmark-search-history.js — 搜索历史管理
 *
 * 测试范围:
 *   recordSearch       — 正常保存、空查询、重复查询、归一化
 *   getSearchHistory   — 限制数量、排序顺序
 *   getPopularSearches — 频率排序、次数相同按时间
 *   getSuggestions     — 前缀匹配、空输入
 *   clearHistory       — 清除全部
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  recordSearch,
  getSearchHistory,
  getPopularSearches,
  getSuggestions,
  clearHistory,
} = await import('../lib/bookmark-search-history.js')

// ==================== 辅助函数 ====================

/**
 * 添加一组测试搜索记录
 */
function seedHistory() {
  recordSearch('react hooks')
  recordSearch('vue composition')
  recordSearch('react hooks')       // duplicate → count=2
  recordSearch('node.js streams')
  recordSearch('react router')
  recordSearch('react hooks')       // duplicate → count=3
  recordSearch('vue router')
  recordSearch('python flask')
}

// ==================== 测试 ====================

describe('BookmarkSearchHistory', () => {

  // 每个测试前重置状态
  beforeEach(() => {
    clearHistory()
  })

  // ─── recordSearch ────────────────────────────────────────────────────

  describe('recordSearch', () => {
    it('1. saves a new search query with correct fields', () => {
      const entry = recordSearch('react tutorial')
      assert.ok(entry)
      assert.ok(typeof entry.id === 'string' && entry.id.length > 0)
      assert.equal(entry.query, 'react tutorial')
      assert.ok(typeof entry.timestamp === 'number')
      assert.equal(entry.count, 1)
    })

    it('2. returns null for empty string', () => {
      assert.equal(recordSearch(''), null)
    })

    it('3. returns null for whitespace-only string', () => {
      assert.equal(recordSearch('   '), null)
    })

    it('4. returns null for non-string input', () => {
      assert.equal(recordSearch(null), null)
      assert.equal(recordSearch(undefined), null)
      assert.equal(recordSearch(123), null)
    })

    it('5. increments count for duplicate query', () => {
      recordSearch('react hooks')
      const entry = recordSearch('react hooks')
      assert.equal(entry.count, 2)
      recordSearch('react hooks')
      assert.equal(entry.count, 3)
    })

    it('6. normalizes query: trims and lowercases', () => {
      const entry = recordSearch('  React Hooks  ')
      assert.equal(entry.query, 'react hooks')
    })

    it('7. normalizes query: collapses multiple spaces', () => {
      const entry = recordSearch('react   hooks   tutorial')
      assert.equal(entry.query, 'react hooks tutorial')
    })

    it('8. treats normalized duplicates as the same query', () => {
      recordSearch('React Hooks')
      const entry2 = recordSearch('react hooks')
      assert.equal(entry2.count, 2)
    })

    it('9. updates timestamp on duplicate query', () => {
      const entry1 = recordSearch('test query')
      const ts1 = entry1.timestamp
      const entry2 = recordSearch('test query')
      assert.ok(entry2.timestamp >= ts1)
    })
  })

  // ─── getSearchHistory ────────────────────────────────────────────────

  describe('getSearchHistory', () => {
    it('10. returns all history when no limit given', () => {
      seedHistory()
      const history = getSearchHistory()
      assert.equal(history.length, 6) // 6 unique queries
    })

    it('11. respects limit parameter', () => {
      seedHistory()
      const history = getSearchHistory(3)
      assert.equal(history.length, 3)
    })

    it('12. returns results in reverse chronological order', () => {
      recordSearch('first')
      recordSearch('second')
      recordSearch('third')
      const history = getSearchHistory()
      assert.equal(history[0].query, 'third')
      assert.equal(history[1].query, 'second')
      assert.equal(history[2].query, 'first')
    })

    it('13. moves duplicate queries to the front', () => {
      recordSearch('alpha')
      recordSearch('beta')
      recordSearch('alpha') // should move alpha to front
      const history = getSearchHistory()
      assert.equal(history[0].query, 'alpha')
      assert.equal(history[1].query, 'beta')
    })

    it('14. returns empty array when history is empty', () => {
      const history = getSearchHistory(10)
      assert.deepEqual(history, [])
    })

    it('15. handles limit larger than history size', () => {
      recordSearch('only one')
      const history = getSearchHistory(100)
      assert.equal(history.length, 1)
    })

    it('16. returns empty array for limit of 0', () => {
      recordSearch('test')
      const history = getSearchHistory(0)
      assert.deepEqual(history, [])
    })
  })

  // ─── getPopularSearches ──────────────────────────────────────────────

  describe('getPopularSearches', () => {
    it('17. returns searches sorted by frequency descending', () => {
      seedHistory()
      const popular = getPopularSearches()
      assert.equal(popular[0].query, 'react hooks')    // count=3
      assert.ok(popular[0].count >= popular[1].count)
    })

    it('18. respects limit parameter', () => {
      seedHistory()
      const popular = getPopularSearches(2)
      assert.equal(popular.length, 2)
    })

    it('19. sorts by timestamp when count is equal', () => {
      recordSearch('alpha')
      recordSearch('beta')
      // Both have count=1, beta is more recent
      const popular = getPopularSearches()
      assert.equal(popular[0].query, 'beta')
      assert.equal(popular[1].query, 'alpha')
    })

    it('20. returns empty array when history is empty', () => {
      const popular = getPopularSearches()
      assert.deepEqual(popular, [])
    })

    it('21. returns all entries when limit exceeds size', () => {
      recordSearch('one')
      recordSearch('two')
      const popular = getPopularSearches(50)
      assert.equal(popular.length, 2)
    })
  })

  // ─── getSuggestions ──────────────────────────────────────────────────

  describe('getSuggestions', () => {
    it('22. returns prefix-matching suggestions', () => {
      seedHistory()
      const suggestions = getSuggestions('react')
      assert.ok(suggestions.includes('react hooks'))
      assert.ok(suggestions.includes('react router'))
      assert.ok(!suggestions.includes('vue composition'))
    })

    it('23. returns suggestions sorted by frequency', () => {
      seedHistory()
      const suggestions = getSuggestions('react')
      assert.equal(suggestions[0], 'react hooks') // count=3, highest
    })

    it('24. returns empty array for non-matching prefix', () => {
      seedHistory()
      const suggestions = getSuggestions('xyz')
      assert.deepEqual(suggestions, [])
    })

    it('25. returns empty array for empty prefix', () => {
      seedHistory()
      assert.deepEqual(getSuggestions(''), [])
      assert.deepEqual(getSuggestions('   '), [])
    })

    it('26. normalizes partial input for matching', () => {
      recordSearch('react hooks')
      const suggestions = getSuggestions('  REACT  ')
      assert.ok(suggestions.includes('react hooks'))
    })

    it('27. returns unique suggestions (no duplicates)', () => {
      recordSearch('test')
      recordSearch('test')
      recordSearch('testing')
      const suggestions = getSuggestions('test')
      const uniqueCheck = new Set(suggestions)
      assert.equal(suggestions.length, uniqueCheck.size)
    })

    it('28. returns empty array for non-string input', () => {
      assert.deepEqual(getSuggestions(null), [])
      assert.deepEqual(getSuggestions(undefined), [])
    })
  })

  // ─── clearHistory ────────────────────────────────────────────────────

  describe('clearHistory', () => {
    it('29. removes all history entries', () => {
      seedHistory()
      assert.ok(getSearchHistory().length > 0)
      clearHistory()
      assert.deepEqual(getSearchHistory(), [])
    })

    it('30. resets popular searches', () => {
      seedHistory()
      clearHistory()
      assert.deepEqual(getPopularSearches(), [])
    })

    it('31. resets suggestions', () => {
      seedHistory()
      clearHistory()
      assert.deepEqual(getSuggestions('react'), [])
    })

    it('32. allows adding new entries after clearing', () => {
      recordSearch('before')
      clearHistory()
      const entry = recordSearch('after')
      assert.equal(entry.count, 1)
      assert.equal(getSearchHistory().length, 1)
    })
  })
})
