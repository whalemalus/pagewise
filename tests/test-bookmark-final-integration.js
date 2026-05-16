import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { BookmarkCollector } from '../lib/bookmark-collector.js'
import { BookmarkIndexer } from '../lib/bookmark-indexer.js'
import { BookmarkGraphEngine } from '../lib/bookmark-graph.js'
import { BookmarkSearch } from '../lib/bookmark-search.js'
import { BookmarkRecommender } from '../lib/bookmark-recommender.js'
import { createBackup, validateBackup, restoreBackup } from '../lib/bookmark-backup.js'
import { batchAddTag } from '../lib/bookmark-batch.js'
import NotificationManager from '../lib/bookmark-notifications.js'
import { BookmarkAnalytics } from '../lib/bookmark-analytics.js'
import { AdvancedTagManager } from '../lib/bookmark-advanced-tags.js'
import { recordSearch, getSearchHistory, getSuggestions } from '../lib/bookmark-search-history.js'

const sampleBookmarks = [
  { id: '1', title: 'JavaScript Guide', url: 'https://js.guide/intro', folderPath: 'Dev/Frontend', dateAdded: Date.now() - 86400000 },
  { id: '2', title: 'Python Tutorial', url: 'https://python.org/learn', folderPath: 'Dev/Backend', dateAdded: Date.now() - 7200000 },
  { id: '3', title: 'Docker Docs', url: 'https://docker.com/docs', folderPath: 'DevOps', dateAdded: Date.now() - 3600000 },
  { id: '4', title: 'React Patterns', url: 'https://react.dev/patterns', folderPath: 'Dev/Frontend', dateAdded: Date.now() },
  { id: '5', title: 'K8s Handbook', url: 'https://k8s.io/handbook', folderPath: 'DevOps', dateAdded: Date.now() }
]

describe('R101: Full Integration', () => {
  it('all modules importable', () => {
    assert.ok(BookmarkCollector)
    assert.ok(BookmarkIndexer)
    assert.ok(BookmarkGraphEngine)
    assert.ok(BookmarkSearch)
    assert.ok(BookmarkRecommender)
    assert.ok(createBackup)
    assert.ok(NotificationManager)
    assert.ok(BookmarkAnalytics)
    assert.ok(AdvancedTagManager)
    assert.ok(recordSearch)
  })

  it('index → search pipeline', () => {
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(sampleBookmarks)
    const results = indexer.search('javascript')
    assert.ok(results.length > 0)
  })

  it('graph → recommend pipeline', () => {
    const graph = new BookmarkGraphEngine()
    graph.buildGraph(sampleBookmarks)
    const rec = new BookmarkRecommender(graph)
    const suggestions = rec.recommend('1', 3)
    assert.ok(Array.isArray(suggestions))
  })

  it('backup → restore roundtrip', () => {
    const result = createBackup(sampleBookmarks)
    assert.ok(result.success)
    assert.ok(result.backup)
    const validation = validateBackup(result.backup)
    assert.ok(validation.valid)
    const restored = restoreBackup(result.backup)
    assert.ok(restored.success)
  })

  it('notification lifecycle', () => {
    const nm = new NotificationManager()
    nm.notify('Test alert', 'info')
    assert.ok(nm.getUnreadCount() >= 1)
    const all = nm.getNotifications()
    assert.ok(all.length >= 1)
  })

  it('analytics functions work', () => {
    const stats = BookmarkAnalytics.getVisitStats(sampleBookmarks)
    assert.ok(stats)
    const trend = BookmarkAnalytics.getCollectionTrend(sampleBookmarks, 7)
    assert.ok(Array.isArray(trend))
  })

  it('advanced tags work', () => {
    const tm = new AdvancedTagManager()
    const color = tm.assignColor('javascript')
    assert.ok(color)
    assert.equal(tm.getColor('javascript'), color)
  })

  it('search history works', () => {
    recordSearch('test query')
    const history = getSearchHistory()
    assert.ok(history.length >= 1)
  })

  it('batch operations work', () => {
    const items = JSON.parse(JSON.stringify(sampleBookmarks))
    const result = batchAddTag(items, ['1', '2'], 'new-tag')
    assert.ok(result)
  })

  it('empty data handled', () => {
    const indexer = new BookmarkIndexer()
    indexer.buildIndex([])
    const results = indexer.search('anything')
    assert.ok(Array.isArray(results))

    const nm = new NotificationManager()
    assert.equal(nm.getUnreadCount(), 0)
  })

  it('large dataset performance', () => {
    const large = Array.from({ length: 500 }, (_, i) => ({
      id: String(i), title: `Bookmark ${i} topic-${i % 20}`,
      url: `https://example${i % 50}.com/page${i}`, folderPath: `Folder${i % 10}`
    }))
    const start = Date.now()
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(large)
    indexer.search('topic-5')
    assert.ok(Date.now() - start < 500)
  })

  it('cross-module: index → tag → backup → restore → search', () => {
    const items = JSON.parse(JSON.stringify(sampleBookmarks))
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(items)
    batchAddTag(items, ['1', '3'], 'tagged')
    const result = createBackup(items)
    const restored = restoreBackup(result.backup)
    assert.ok(restored.success)
    indexer.buildIndex(restored.bookmarks)
    const r = indexer.search('docker')
    assert.ok(r.length > 0)
  })
})
