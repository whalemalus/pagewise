/**
 * E2E 测试 lib/knowledge-base.js — KnowledgeBase 类全方法覆盖
 *
 * 测试范围：
 *   init / ensureInit / CRUD / 搜索 / 标签 / 分页 / 批量操作
 *   导入导出 / 静态方法 / 边界值
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js'

installIndexedDBMock()
const { KnowledgeBase } = await import('../lib/knowledge-base.js')

let kb
beforeEach(async () => {
  resetIndexedDBMock()
  installIndexedDBMock()
  kb = new KnowledgeBase()
  await kb.init()
})
afterEach(() => { resetIndexedDBMock() })

// ─── 辅助工厂 ────────────────────────────────────────────────────────────────
// saveEntry 会做去重检测：内容相似的条目不会重复保存。
// 因此每个测试条目必须有独特的内容和 sourceUrl。

let _seq = 0
function makeEntry(overrides = {}) {
  const n = ++_seq
  return {
    title: `Entry ${n}`,
    content: `Unique content number ${n} about topic ${n} with distinctive details ${Date.now()}-${n}`,
    tags: [`tag${n}`],
    category: `cat${n}`,
    question: `Question ${n}?`,
    answer: `Answer ${n}.`,
    sourceUrl: `https://example.com/page${n}-${Date.now()}`,
    sourceTitle: `Page ${n}`,
    language: 'en',
    ...overrides,
  }
}

// ─── 1. 构造函数 & 初始化 ─────────────────────────────────────────────────────

describe('constructor & init', () => {
  it('new KnowledgeBase() creates instance', () => {
    const instance = new KnowledgeBase()
    assert.ok(instance instanceof KnowledgeBase)
  })

  it('init() opens IndexedDB successfully', async () => {
    const instance = new KnowledgeBase()
    await assert.doesNotReject(() => instance.init())
  })

  it('ensureInit() initializes if not already done', async () => {
    const instance = new KnowledgeBase()
    await assert.doesNotReject(() => instance.ensureInit())
  })
})

// ─── 2. CRUD 基本操作 ─────────────────────────────────────────────────────────

describe('CRUD operations', () => {
  it('saveEntry returns entry object with id', async () => {
    const result = await kb.saveEntry(makeEntry())
    assert.ok(result != null)
    assert.ok(result.id != null)
  })

  it('getEntry retrieves saved entry by id', async () => {
    const saved = await kb.saveEntry(makeEntry({ title: 'Hello World' }))
    const entry = await kb.getEntry(saved.id)
    assert.ok(entry != null)
    assert.equal(entry.title, 'Hello World')
  })

  it('getEntry returns null for nonexistent id', async () => {
    const entry = await kb.getEntry(99999)
    assert.equal(entry, null)
  })

  it('updateEntry modifies fields', async () => {
    const saved = await kb.saveEntry(makeEntry({ title: 'Old Title' }))
    await kb.updateEntry(saved.id, { title: 'New Title' })
    const entry = await kb.getEntry(saved.id)
    assert.equal(entry.title, 'New Title')
  })

  it('updateEntry rejects for nonexistent id', async () => {
    await assert.rejects(() => kb.updateEntry(99999, { title: 'Ghost' }))
  })

  it('deleteEntry removes the entry', async () => {
    const saved = await kb.saveEntry(makeEntry())
    await kb.deleteEntry(saved.id)
    const entry = await kb.getEntry(saved.id)
    assert.equal(entry, null)
  })

  it('deleteEntry on nonexistent id does not throw', async () => {
    await assert.doesNotReject(() => kb.deleteEntry(99999))
  })
})

// ─── 3. 列表 & 分页 ──────────────────────────────────────────────────────────

describe('getAllEntries & pagination', () => {
  it('getAllEntries returns all saved entries', async () => {
    await kb.saveEntry(makeEntry({ title: 'Alpha' }))
    await kb.saveEntry(makeEntry({ title: 'Beta' }))
    await kb.saveEntry(makeEntry({ title: 'Gamma' }))
    const all = await kb.getAllEntries()
    assert.equal(all.length, 3)
  })

  it('getAllEntries with limit returns subset', async () => {
    for (let i = 0; i < 5; i++) await kb.saveEntry(makeEntry())
    const page = await kb.getAllEntries(2, 0)
    assert.equal(page.length, 2)
  })

  it('getAllEntries with limit=0 returns empty', async () => {
    await kb.saveEntry(makeEntry())
    const result = await kb.getAllEntries(0, 0)
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 0)
  })

  it('getTotalCount returns correct count', async () => {
    for (let i = 0; i < 4; i++) await kb.saveEntry(makeEntry())
    const count = await kb.getTotalCount()
    assert.equal(count, 4)
  })

  it('getEntriesPaged returns paged results object with entries array', async () => {
    for (let i = 0; i < 15; i++) await kb.saveEntry(makeEntry())
    const page1 = await kb.getEntriesPaged({ page: 1, pageSize: 5 })
    assert.ok(page1 != null)
    assert.ok(Array.isArray(page1.entries))
    assert.equal(page1.entries.length, 5)
    const page2 = await kb.getEntriesPaged({ page: 2, pageSize: 5 })
    assert.equal(page2.entries.length, 5)
    const page3 = await kb.getEntriesPaged({ page: 3, pageSize: 5 })
    assert.equal(page3.entries.length, 5)
  })

  it('getEntriesPaged page beyond data returns empty entries', async () => {
    await kb.saveEntry(makeEntry())
    const result = await kb.getEntriesPaged({ page: 100, pageSize: 10 })
    assert.ok(result != null)
    assert.ok(Array.isArray(result.entries))
    assert.equal(result.entries.length, 0)
  })
})

// ─── 4. 搜索 ─────────────────────────────────────────────────────────────────

describe('search', () => {
  it('search finds entries matching query text', async () => {
    await kb.saveEntry(makeEntry({ title: 'Python Basics', content: 'Python is great for data science analysis' }))
    await kb.saveEntry(makeEntry({ title: 'JavaScript Basics', content: 'JavaScript runs in the browser environment' }))
    const results = await kb.search('Python')
    assert.ok(results.length >= 1)
    assert.ok(results.some(e => e.title.includes('Python')))
  })

  it('search returns empty for no match', async () => {
    await kb.saveEntry(makeEntry({ content: 'Only JavaScript content here' }))
    const results = await kb.search('COBOL_FORTRAN_XYZ')
    assert.equal(results.length, 0)
  })

  it('search with empty string returns array', async () => {
    await kb.saveEntry(makeEntry())
    const results = await kb.search('')
    assert.ok(Array.isArray(results))
  })
})

// ─── 5. searchByTag & searchByUrl ─────────────────────────────────────────────

describe('searchByTag & searchByUrl', () => {
  it('searchByTag returns entries with specified tag', async () => {
    const u1 = `https://u1-${Date.now()}`
    const u2 = `https://u2-${Date.now()}`
    await kb.saveEntry(makeEntry({ tags: ['python', 'ml'], sourceUrl: u1, content: 'Py data sci unique content AAA' }))
    await kb.saveEntry(makeEntry({ tags: ['javascript'], sourceUrl: u2, content: 'JS browser unique content BBB' }))
    const results = await kb.searchByTag('python')
    assert.ok(results.length >= 1)
    assert.ok(results[0].tags.includes('python'))
  })

  it('searchByUrl returns entries with matching sourceUrl', async () => {
    const targetUrl = `https://target-${Date.now()}`
    await kb.saveEntry(makeEntry({ sourceUrl: targetUrl, content: 'Unique URL target content CCC' }))
    await kb.saveEntry(makeEntry({ sourceUrl: `https://other-${Date.now()}`, content: 'Different URL content DDD' }))
    const results = await kb.searchByUrl(targetUrl)
    assert.ok(results.length >= 1)
    assert.equal(results[0].sourceUrl, targetUrl)
  })
})

// ─── 6. searchPaged ──────────────────────────────────────────────────────────

describe('searchPaged', () => {
  it('searchPaged returns paged search results object', async () => {
    for (let i = 0; i < 12; i++) {
      await kb.saveEntry(makeEntry({ title: `React Tutorial ${i}`, content: `React framework tutorial part ${i} about hooks and state management` }))
    }
    const page1 = await kb.searchPaged('React', { page: 1, pageSize: 5 })
    assert.ok(page1 != null)
    assert.ok(Array.isArray(page1.entries))
    assert.equal(page1.entries.length, 5)
    const page2 = await kb.searchPaged('React', { page: 2, pageSize: 5 })
    assert.equal(page2.entries.length, 5)
  })
})

// ─── 7. 标签 & 分类 & 语言聚合 ───────────────────────────────────────────────

describe('tags, categories, languages', () => {
  it('getAllTags returns tag counts', async () => {
    await kb.saveEntry(makeEntry({ tags: ['js', 'web'], content: 'JS web dev content alpha1' }))
    await kb.saveEntry(makeEntry({ tags: ['js', 'node'], content: 'Node.js server content beta2' }))
    await kb.saveEntry(makeEntry({ tags: ['python'], content: 'Python scripting content gamma3' }))
    const tags = await kb.getAllTags()
    assert.ok(Array.isArray(tags))
    const jsTag = tags.find(t => t.tag === 'js')
    assert.ok(jsTag)
    assert.ok(jsTag.count >= 2)
  })

  it('getAllCategories returns category counts', async () => {
    await kb.saveEntry(makeEntry({ category: 'frontend', content: 'Frontend overview content AAA1' }))
    await kb.saveEntry(makeEntry({ category: 'frontend', content: 'Frontend tutorial content BBB2' }))
    await kb.saveEntry(makeEntry({ category: 'backend', content: 'Backend overview content CCC3' }))
    const cats = await kb.getAllCategories()
    assert.ok(Array.isArray(cats))
    const fe = cats.find(c => c.category === 'frontend')
    assert.ok(fe)
    assert.ok(fe.count >= 2)
  })

  it('getAllLanguages returns language objects', async () => {
    await kb.saveEntry(makeEntry({ language: 'en', content: 'English article content unique XXX' }))
    await kb.saveEntry(makeEntry({ language: 'zh', content: '中文文章内容唯一 YYY' }))
    const langs = await kb.getAllLanguages()
    assert.ok(Array.isArray(langs))
    assert.ok(langs.length >= 2)
    assert.ok(langs[0].language != null)
    assert.ok(langs[0].count != null)
  })

  it('getAggregations returns aggregated stats object', async () => {
    await kb.saveEntry(makeEntry({ tags: ['a', 'b'], category: 'cat1', content: 'Aggregation content unique ZZZ' }))
    const agg = await kb.getAggregations()
    assert.ok(agg != null)
    assert.ok(typeof agg === 'object')
  })

  it('getStats returns statistics object with totalEntries', async () => {
    await kb.saveEntry(makeEntry({ content: 'Stats content unique QQQ' }))
    const stats = await kb.getStats()
    assert.ok(stats != null)
    assert.ok(typeof stats === 'object')
    assert.ok('totalEntries' in stats)
    assert.ok(stats.totalEntries >= 1)
  })
})

// ─── 8. 导出 ─────────────────────────────────────────────────────────────────

describe('exportJSON', () => {
  it('exportJSON returns a JSON string of all entries', async () => {
    await kb.saveEntry(makeEntry({ title: 'Export 1', content: 'Export content AAA unique' }))
    await kb.saveEntry(makeEntry({ title: 'Export 2', content: 'Export content BBB unique' }))
    const data = await kb.exportJSON()
    assert.equal(typeof data, 'string')
    const parsed = JSON.parse(data)
    assert.ok(Array.isArray(parsed))
    assert.ok(parsed.length >= 2)
  })

  it('exportJSON returns valid JSON array with empty database', async () => {
    const data = await kb.exportJSON()
    const parsed = JSON.parse(data)
    assert.ok(Array.isArray(parsed))
    assert.equal(parsed.length, 0)
  })
})

// ─── 9. 批量操作 ──────────────────────────────────────────────────────────────

describe('batchDelete', () => {
  it('batchDelete removes multiple entries', async () => {
    const e1 = await kb.saveEntry(makeEntry({ title: 'BD1', content: 'Batch delete content one unique' }))
    const e2 = await kb.saveEntry(makeEntry({ title: 'BD2', content: 'Batch delete content two unique' }))
    const e3 = await kb.saveEntry(makeEntry({ title: 'BD3', content: 'Batch delete content three unique' }))
    await kb.batchDelete([e1.id, e3.id])
    const remaining = await kb.getAllEntries()
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].title, 'BD2')
  })

  it('batchDelete with empty array does not throw', async () => {
    await kb.saveEntry(makeEntry({ content: 'Keep this entry unique AAAA' }))
    await assert.doesNotReject(() => kb.batchDelete([]))
    const count = await kb.getTotalCount()
    assert.equal(count, 1)
  })
})

describe('batchAddTag', () => {
  it('batchAddTag adds a tag to multiple entries', async () => {
    const e1 = await kb.saveEntry(makeEntry({ tags: ['a'], content: 'Batch tag content one unique' }))
    const e2 = await kb.saveEntry(makeEntry({ tags: ['b'], content: 'Batch tag content two unique' }))
    await kb.batchAddTag([e1.id, e2.id], 'newtag')
    const r1 = await kb.getEntry(e1.id)
    const r2 = await kb.getEntry(e2.id)
    assert.ok(r1.tags.includes('newtag'))
    assert.ok(r2.tags.includes('newtag'))
  })

  it('batchAddTag with empty ids does not throw', async () => {
    const saved = await kb.saveEntry(makeEntry({ tags: ['x'], content: 'Batch empty tag content unique' }))
    await assert.doesNotReject(() => kb.batchAddTag([], 'newtag'))
    const entry = await kb.getEntry(saved.id)
    assert.ok(!entry.tags.includes('newtag'))
  })
})

// ─── 10. findDuplicate ────────────────────────────────────────────────────────

describe('findDuplicate', () => {
  it('findDuplicate detects similar entries and returns the match', async () => {
    await kb.saveEntry(makeEntry({
      title: 'JavaScript Closures Explained',
      content: 'A closure is a function that has access to its outer scope variables and state.',
    }))
    const dupe = await kb.findDuplicate(makeEntry({
      title: 'JavaScript Closures Explained',
      content: 'A closure is a function that has access to its outer scope variables and state.',
    }))
    assert.ok(dupe != null)
  })

  it('findDuplicate returns null/falsy for unique entry', async () => {
    await kb.saveEntry(makeEntry({
      title: 'Quantum Physics',
      content: 'Entanglement and superposition theory of quantum mechanics in modern physics research',
    }))
    const dupe = await kb.findDuplicate(makeEntry({
      title: 'Cooking Pasta',
      content: 'Boil water and add spaghetti noodles to the pot for an Italian dinner meal.',
    }))
    assert.ok(!dupe)
  })
})

// ─── 11. findRelatedEntries ───────────────────────────────────────────────────

describe('findRelatedEntries', () => {
  it('findRelatedEntries returns related entries', async () => {
    const e1 = await kb.saveEntry(makeEntry({
      title: 'JavaScript Promises',
      content: 'Promises handle asynchronous operations in JavaScript programming language.',
    }))
    await kb.saveEntry(makeEntry({
      title: 'JavaScript Async Await',
      content: 'Async await simplifies working with JavaScript promises and callbacks.',
    }))
    await kb.saveEntry(makeEntry({
      title: 'Cooking Recipes',
      content: 'How to make pasta carbonara step by step with Italian cheese.',
    }))
    const related = await kb.findRelatedEntries(e1.id, 5)
    assert.ok(Array.isArray(related))
    // There are 2 other entries; at least 1 should be returned
    assert.ok(related.length >= 1)
  })
})

// ─── 12. combinedSearch ──────────────────────────────────────────────────────

describe('combinedSearch', () => {
  it('combinedSearch returns results combining multiple strategies', async () => {
    await kb.saveEntry(makeEntry({
      title: 'React Hooks',
      content: 'useState and useEffect are React hooks for state management in components.',
      tags: ['react', 'hooks'],
    }))
    await kb.saveEntry(makeEntry({
      title: 'Vue Composition API',
      content: 'Vue 3 composition API provides similar reactivity to React hooks pattern.',
      tags: ['vue'],
    }))
    const results = await kb.combinedSearch('React hooks', 10)
    assert.ok(Array.isArray(results))
    assert.ok(results.length >= 1)
  })
})

// ─── 13. conversations ───────────────────────────────────────────────────────

describe('saveConversation & getConversations', () => {
  it('saveConversation stores and getConversations retrieves', async () => {
    const url = `https://example.com/article-${Date.now()}`
    await kb.saveConversation({
      sourceUrl: url,
      messages: [
        { role: 'user', content: 'What is this about?' },
        { role: 'assistant', content: 'This article is about JavaScript.' },
      ],
    })
    const convs = await kb.getConversations(url)
    assert.ok(Array.isArray(convs))
    assert.ok(convs.length >= 1)
  })

  it('getConversations returns empty for unknown url', async () => {
    const convs = await kb.getConversations('https://no-such-url-xyz.com/none')
    assert.ok(Array.isArray(convs))
    assert.equal(convs.length, 0)
  })
})

// ─── 14. 静态方法 ─────────────────────────────────────────────────────────────

describe('static methods', () => {
  it('KnowledgeBase.bigrams generates bigram set', () => {
    const bg = KnowledgeBase.bigrams('hello')
    assert.ok(bg)
    assert.ok(typeof bg === 'object' || Array.isArray(bg))
    const bgStr = JSON.stringify(bg)
    assert.ok(bgStr.includes('el') || bgStr.includes('ll'))
  })

  it('KnowledgeBase.calculateSimilarity returns high value for identical text', () => {
    const sim = KnowledgeBase.calculateSimilarity('hello world', 'hello world')
    assert.ok(sim >= 0.99)
  })

  it('KnowledgeBase.calculateSimilarity returns lower value for different text', () => {
    const simSame = KnowledgeBase.calculateSimilarity('hello world', 'hello world')
    const simDiff = KnowledgeBase.calculateSimilarity('hello world', 'xyz abc')
    assert.ok(simDiff < simSame)
    assert.ok(simDiff >= 0)
  })

  it('KnowledgeBase.getEntryCompareText extracts comparable text', () => {
    const text = KnowledgeBase.getEntryCompareText(makeEntry({ title: 'My Title', content: 'My Content' }))
    assert.ok(typeof text === 'string')
    assert.ok(text.length > 0)
  })

  it('KnowledgeBase.getSearchCompareText extracts searchable text', () => {
    const text = KnowledgeBase.getSearchCompareText(makeEntry({ title: 'Search Me', content: 'Searchable content here' }))
    assert.ok(typeof text === 'string')
    assert.ok(text.length > 0)
  })

  it('KnowledgeBase.semanticSearch filters and ranks entries', () => {
    const entries = [
      makeEntry({ title: 'JavaScript Basics', content: 'Variables and functions in JavaScript language' }),
      makeEntry({ title: 'Python Basics', content: 'Variables and functions in Python programming' }),
      makeEntry({ title: 'Cooking Tips', content: 'How to grill a perfect steak on charcoal' }),
    ]
    const results = KnowledgeBase.semanticSearch('JavaScript functions', entries, 2)
    assert.ok(Array.isArray(results))
    assert.ok(results.length >= 1)
    assert.ok(results.length <= 2)
  })

  it('KnowledgeBase.getSearchSuggestions returns suggestions array', () => {
    const entries = [
      makeEntry({ title: 'JavaScript Closures', content: 'Understanding closures in JavaScript deeply' }),
      makeEntry({ title: 'JavaScript Promises', content: 'Working with promises in async code' }),
      makeEntry({ title: 'CSS Grid Layout', content: 'Grid layout system in CSS3 specifications' }),
    ]
    const suggestions = KnowledgeBase.getSearchSuggestions('Java', entries, 3)
    assert.ok(Array.isArray(suggestions))
    if (suggestions.length > 0) {
      assert.ok(typeof suggestions[0] === 'string')
    }
  })
})

// ─── 15. 边界值 ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('saveEntry with minimal fields (no optional)', async () => {
    const saved = await kb.saveEntry({ title: 'Minimal', content: 'Just title and content here' })
    assert.ok(saved != null)
    assert.ok(saved.id != null)
    const entry = await kb.getEntry(saved.id)
    assert.ok(entry != null)
    assert.equal(entry.title, 'Minimal')
  })

  it('getEntriesPaged returns object with entries, total, page, totalPages', async () => {
    for (let i = 0; i < 3; i++) await kb.saveEntry(makeEntry())
    const result = await kb.getEntriesPaged({ page: 1, pageSize: 2 })
    assert.ok('entries' in result)
    assert.ok('total' in result)
    assert.ok('page' in result)
    assert.ok('totalPages' in result)
    assert.equal(result.total, 3)
    assert.equal(result.entries.length, 2)
  })

  it('KnowledgeBase.bigrams on empty string', () => {
    const bg = KnowledgeBase.bigrams('')
    assert.ok(bg != null)
  })

  it('KnowledgeBase.calculateSimilarity with empty strings', () => {
    const sim = KnowledgeBase.calculateSimilarity('', '')
    assert.ok(typeof sim === 'number')
  })

  it('saveEntry preserves all fields correctly', async () => {
    const saved = await kb.saveEntry({
      title: 'Full Entry',
      content: 'Full unique content for field preservation test',
      tags: ['tag1', 'tag2'],
      category: 'myCat',
      question: 'What?',
      answer: 'This.',
      sourceUrl: 'https://full.example.com/unique',
      sourceTitle: 'Full Page',
      language: 'fr',
    })
    const retrieved = await kb.getEntry(saved.id)
    assert.equal(retrieved.title, 'Full Entry')
    assert.equal(retrieved.content, 'Full unique content for field preservation test')
    assert.deepEqual(retrieved.tags, ['tag1', 'tag2'])
    assert.equal(retrieved.category, 'myCat')
    assert.equal(retrieved.question, 'What?')
    assert.equal(retrieved.answer, 'This.')
    assert.equal(retrieved.sourceUrl, 'https://full.example.com/unique')
    assert.equal(retrieved.sourceTitle, 'Full Page')
    assert.equal(retrieved.language, 'fr')
  })
})
