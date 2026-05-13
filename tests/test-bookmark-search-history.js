/**
 * 测试 lib/bookmark-search-history.js — 搜索历史管理
 *
 * 测试范围:
 *   addSearchQuery     — 正常保存、空查询、重复查询、归一化
 *   getSearchHistory   — 限制数量、排序顺序
 *   getPopularSearches — 频率排序、次数相同按时间
 *   getSearchSuggestions — 前缀匹配、空输入
 *   clearHistory       — 清除全部
 *   removeSearchEntry  — 删除指定条目、不存在的 ID
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  addSearchQuery,
  getSearchHistory,
  getPopularSearches,
  getSearchSuggestions,
  clearHistory,
  removeSearchEntry,
} = await import('../lib/bookmark-search-history.js')

// ==================== 辅助函数 ====================

/**
 * 添加一组测试搜索记录
 */
function seedHistory() {
  addSearchQuery('react hooks')       // sh_1
  addSearchQuery('vue composition')    // sh_2
  addSearchQuery('react hooks')        // sh_3 → duplicate, count=2
  addSearchQuery('node.js streams')    // sh_4
  addSearchQuery('react router')       // sh_5
  addSearchQuery('react hooks')        // sh_6 → duplicate, count=3
  addSearchQuery('vue router')         // sh_7
  addSearchQuery('python flask')       // sh_8
}

// ==================== 测试 ====================

describe('BookmarkSearchHistory', () => {

  // 每个测试前重置状态
  beforeEach(() => {
    clearHistory()
  })

  // ─── addSearchQuery ───────────────────────────────────────────────────

  describe('addSearchQuery', () => {
    it('1. saves a new search query with correct fields', () => {
      const entry = addSearchQuery('react tutorial')
      assert.ok(entry)
      assert.ok(typeof entry.id === 'string' && entry.id.length > 0)
      assert.equal(entry.query, 'react tutorial')
      assert.ok(typeof entry.timestamp === 'number')
      assert.equal(entry.count, 1)
    })

    it('2. returns null for empty string', () => {
      assert.equal(addSearchQuery(''), null)
    })

    it('3. returns null for whitespace-only string', () => {
      assert.equal(addSearchQuery('   '), null)
    })

    it('4. returns null for non-string input', () => {
      assert.equal(addSearchQuery(null), null)
      assert.equal(addSearchQuery(undefined), null)
      assert.equal(addSearchQuery(123), null)
    })

    it('5. increments count for duplicate query', () => {
      addSearchQuery('react hooks')
      const entry = addSearchQuery('react hooks')
      assert.equal(entry.count, 2)
      addSearchQuery('react hooks')
      assert.equal(entry.count, 3)
    })

    it('6. normalizes query: trims and lowercases', () => {
      const entry = addSearchQuery('  React Hooks  ')
      assert.equal(entry.query, 'react hooks')
    })

    it('7. normalizes query: collapses multiple spaces', () => {
      const entry = addSearchQuery('react   hooks   tutorial')
      assert.equal(entry.query, 'react hooks tutorial')
    })

    it('8. treats normalized duplicates as the same query', () => {
      addSearchQuery('React Hooks')
      const entry2 = addSearchQuery('react hooks')
      assert.equal(entry2.count, 2)
    })

    it('9. updates timestamp on duplicate query', () => {
      const entry1 = addSearchQuery('test query')
      const ts1 = entry1.timestamp
      // Force different timestamp
      const entry2 = addSearchQuery('test query')
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
      addSearchQuery('first')
      addSearchQuery('second')
      addSearchQuery('third')
      const history = getSearchHistory()
      assert.equal(history[0].query, 'third')
      assert.equal(history[1].query, 'second')
      assert.equal(history[2].query, 'first')
    })

    it('13. moves duplicate queries to the front', () => {
      addSearchQuery('alpha')
      addSearchQuery('beta')
      addSearchQuery('alpha') // should move alpha to front
      const history = getSearchHistory()
      assert.equal(history[0].query, 'alpha')
      assert.equal(history[1].query, 'beta')
    })

    it('14. returns empty array when history is empty', () => {
      const history = getSearchHistory(10)
      assert.deepEqual(history, [])
    })

    it('15. handles limit larger than history size', () => {
      addSearchQuery('only one')
      const history = getSearchHistory(100)
      assert.equal(history.length, 1)
    })

    it('16. returns empty array for limit of 0', () => {
      addSearchQuery('test')
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
      addSearchQuery('alpha')
      addSearchQuery('beta')
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
      addSearchQuery('one')
      addSearchQuery('two')
      const popular = getPopularSearches(50)
      assert.equal(popular.length, 2)
    })
  })

  // ─── getSearchSuggestions ────────────────────────────────────────────

  describe('getSearchSuggestions', () => {
    it('22. returns prefix-matching suggestions', () => {
      seedHistory()
      const suggestions = getSearchSuggestions('react')
      assert.ok(suggestions.includes('react hooks'))
      assert.ok(suggestions.includes('react router'))
      assert.ok(!suggestions.includes('vue composition'))
    })

    it('23. returns suggestions sorted by frequency', () => {
      seedHistory()
      const suggestions = getSearchSuggestions('react')
      assert.equal(suggestions[0], 'react hooks') // count=3, highest
    })

    it('24. returns empty array for non-matching prefix', () => {
      seedHistory()
      const suggestions = getSearchSuggestions('xyz')
      assert.deepEqual(suggestions, [])
    })

    it('25. returns empty array for empty prefix', () => {
      seedHistory()
      assert.deepEqual(getSearchSuggestions(''), [])
      assert.deepEqual(getSearchSuggestions('   '), [])
    })

    it('26. normalizes partial input for matching', () => {
      addSearchQuery('react hooks')
      const suggestions = getSearchSuggestions('  REACT  ')
      assert.ok(suggestions.includes('react hooks'))
    })

    it('27. returns unique suggestions (no duplicates)', () => {
      addSearchQuery('test')
      addSearchQuery('test')
      addSearchQuery('testing')
      const suggestions = getSearchSuggestions('test')
      const uniqueCheck = new Set(suggestions)
      assert.equal(suggestions.length, uniqueCheck.size)
    })

    it('28. returns empty array for non-string input', () => {
      assert.deepEqual(getSearchSuggestions(null), [])
      assert.deepEqual(getSearchSuggestions(undefined), [])
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
      assert.deepEqual(getSearchSuggestions('react'), [])
    })

    it('32. allows adding new entries after clearing', () => {
      addSearchQuery('before')
      clearHistory()
      const entry = addSearchQuery('after')
      assert.equal(entry.count, 1)
      assert.equal(getSearchHistory().length, 1)
    })
  })

  // ─── removeSearchEntry ───────────────────────────────────────────────

  describe('removeSearchEntry', () => {
    it('33. removes a specific entry by id', () => {
      const entry = addSearchQuery('to be deleted')
      assert.equal(getSearchHistory().length, 1)
      const removed = removeSearchEntry(entry.id)
      assert.equal(removed, true)
      assert.equal(getSearchHistory().length, 0)
    })

    it('34. returns false for non-existent id', () => {
      addSearchQuery('exists')
      assert.equal(removeSearchEntry('nonexistent_id'), false)
    })

    it('35. returns false for invalid input', () => {
      assert.equal(removeSearchEntry(''), false)
      assert.equal(removeSearchEntry(null), false)
      assert.equal(removeSearchEntry(undefined), false)
    })

    it('36. removes from suggestions after deletion', () => {
      const entry = addSearchQuery('react hooks')
      addSearchQuery('react router')
      removeSearchEntry(entry.id)
      const suggestions = getSearchSuggestions('react')
      assert.ok(!suggestions.includes('react hooks'))
      assert.ok(suggestions.includes('react router'))
    })

    it('37. allows re-adding a query after removal', () => {
      const entry = addSearchQuery('deleted query')
      removeSearchEntry(entry.id)
      const newEntry = addSearchQuery('deleted query')
      assert.equal(newEntry.count, 1)
      assert.notEqual(newEntry.id, entry.id)
    })

    it('38. does not affect other entries when removing one', () => {
      addSearchQuery('keep this')
      const toRemove = addSearchQuery('remove this')
      addSearchQuery('keep this too')
      removeSearchEntry(toRemove.id)
      assert.equal(getSearchHistory().length, 2)
    })
  })
})
