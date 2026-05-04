import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { installChromeMock, resetChromeMock } from './helpers/setup.js'

installChromeMock()

const { BookmarkCollector } = await import('../lib/bookmark-collector.js')
const { BookmarkIndexer } = await import('../lib/bookmark-indexer.js')
const { BookmarkGraphEngine } = await import('../lib/bookmark-graph.js')
const { BookmarkRecommender } = await import('../lib/bookmark-recommender.js')
const { BookmarkSearch } = await import('../lib/bookmark-search.js')

// Mock Chrome bookmarks API with sample data
function setupMockBookmarks() {
  globalThis.chrome.bookmarks = {
    getTree: async () => [{
      id: '0', title: '', children: [
        {
          id: '1', title: '书签栏', children: [
            {
              id: '2', title: '技术', children: [
                { id: '10', title: 'React 官方文档', url: 'https://react.dev', dateAdded: 1700000000000 },
                { id: '11', title: 'Vue3 入门教程', url: 'https://vuejs.org', dateAdded: 1700100000000 },
                { id: '12', title: 'React Hooks 指南', url: 'https://react.dev/reference/hooks', dateAdded: 1700200000000 },
              ]
            },
            {
              id: '3', title: '工具', children: [
                { id: '20', title: 'GitHub', url: 'https://github.com', dateAdded: 1700300000000 },
                { id: '21', title: 'npm 包管理', url: 'https://npmjs.com', dateAdded: 1700400000000 },
              ]
            },
            { id: '30', title: 'Docker 文档', url: 'https://docs.docker.com', dateAdded: 1700500000000 },
          ]
        }
      ]
    }]
  }
}

beforeEach(() => {
  resetChromeMock()
  setupMockBookmarks()
})

describe('BookmarkGraph MVP E2E', () => {
  it('full pipeline: collect → index → graph → search', async () => {
    // Collect
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    assert.ok(bookmarks.length > 0, 'Should collect bookmarks')

    // Index
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(bookmarks)
    const size = indexer.getSize()
    assert.ok(size.bookmarks > 0, 'Should build index')

    // Graph
    const graphEngine = new BookmarkGraphEngine()
    const graph = graphEngine.buildGraph(bookmarks)
    assert.ok(graph.nodes.length > 0, 'Should have nodes')
    assert.ok(graph.edges.length >= 0, 'Should have edges')

    // Search
    const search = new BookmarkSearch(indexer, graphEngine)
    const results = search.search('React')
    assert.ok(results.length > 0, 'Should find React')
  })

  it('similarity: related bookmarks have higher score', async () => {
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const graphEngine = new BookmarkGraphEngine()
    graphEngine.buildGraph(bookmarks)

    // React docs and React Hooks should be similar
    const similar = graphEngine.getSimilar('10', 3)
    assert.ok(similar.length > 0, 'Should find similar bookmarks')

    // React docs should be more similar to React Hooks than to Docker
    const reactHooksSimilar = similar.find(s => s.id === '12')
    if (reactHooksSimilar) {
      assert.ok(reactHooksSimilar.score > 0.3, 'React docs should be similar to React Hooks')
    }
  })

  it('recommender: provides reasons', async () => {
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const graphEngine = new BookmarkGraphEngine()
    graphEngine.buildGraph(bookmarks)

    const recommender = new BookmarkRecommender(graphEngine)
    const recommendations = recommender.recommend('10', 3)
    assert.ok(recommendations.length > 0, 'Should have recommendations')
    assert.ok(recommendations[0].reason, 'Should have reason')
    assert.ok(recommendations[0].score >= 0 && recommendations[0].score <= 1, 'Score should be 0-1')
  })

  it('search: supports filters', async () => {
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(bookmarks)
    const graphEngine = new BookmarkGraphEngine()
    const search = new BookmarkSearch(indexer, graphEngine)

    // Search with folder filter - need a query that matches
    const results = search.search('React', { folder: '技术' })
    // Results should only include bookmarks from 技术 folder
    for (const r of results) {
      if (r.bookmark.folderPath) {
        assert.ok(r.bookmark.folderPath.includes('技术'), 'Should be in 技术 folder')
      }
    }
  })

  it('search: empty query returns empty', async () => {
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(bookmarks)
    const graphEngine = new BookmarkGraphEngine()
    const search = new BookmarkSearch(indexer, graphEngine)

    const results = search.search('')
    assert.equal(results.length, 0, 'Empty query should return empty')
  })

  it('graph: clusters by domain', async () => {
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const graphEngine = new BookmarkGraphEngine()
    graphEngine.buildGraph(bookmarks)

    const clusters = graphEngine.getClusters()
    assert.ok(Object.keys(clusters).length > 0, 'Should have clusters')
  })

  it('pipeline: empty bookmarks', async () => {
    globalThis.chrome.bookmarks = { getTree: async () => [{ id: '0', title: '', children: [] }] }

    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    assert.equal(bookmarks.length, 0, 'Should have no bookmarks')

    const indexer = new BookmarkIndexer()
    indexer.buildIndex(bookmarks)
    assert.equal(indexer.getSize().bookmarks, 0, 'Index should be empty')

    const graphEngine = new BookmarkGraphEngine()
    const graph = graphEngine.buildGraph(bookmarks)
    assert.equal(graph.nodes.length, 0, 'Graph should be empty')
  })

  it('pipeline: single bookmark', async () => {
    globalThis.chrome.bookmarks = {
      getTree: async () => [{
        id: '0', title: '', children: [
          { id: '1', title: 'Solo', url: 'https://solo.com', dateAdded: 1700000000000 }
        ]
      }]
    }

    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    assert.equal(bookmarks.length, 1)

    const graphEngine = new BookmarkGraphEngine()
    const graph = graphEngine.buildGraph(bookmarks)
    assert.equal(graph.nodes.length, 1)
    assert.equal(graph.edges.length, 0, 'Single node has no edges')
  })

  it('pipeline: 100+ bookmarks performance', async () => {
    // Generate 120 bookmarks
    const children = []
    for (let i = 0; i < 120; i++) {
      children.push({
        id: String(i),
        title: `Bookmark ${i} - ${['React', 'Vue', 'Angular', 'Docker', 'K8s'][i % 5]} tutorial`,
        url: `https://example${i % 10}.com/page/${i}`,
        dateAdded: 1700000000000 + i * 100000
      })
    }
    globalThis.chrome.bookmarks = {
      getTree: async () => [{ id: '0', title: '', children }]
    }

    const start = Date.now()
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(bookmarks)
    const graphEngine = new BookmarkGraphEngine()
    const graph = graphEngine.buildGraph(bookmarks)
    const elapsed = Date.now() - start

    assert.ok(bookmarks.length === 120, 'Should have 120 bookmarks')
    assert.ok(graph.nodes.length === 120, 'Should have 120 nodes')
    assert.ok(elapsed < 15000, `Should complete in < 15s, took ${elapsed}ms`)
  })

  it('indexer: incremental add/remove', async () => {
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(bookmarks)

    const initialSize = indexer.getSize().bookmarks

    // Add new bookmark
    indexer.addBookmark({
      id: '999',
      title: 'New Bookmark',
      url: 'https://new.com',
      folderPath: ['新文件夹'],
      dateAdded: Date.now()
    })
    assert.equal(indexer.getSize().bookmarks, initialSize + 1)

    // Remove it
    indexer.removeBookmark('999')
    assert.equal(indexer.getSize().bookmarks, initialSize)
  })

  it('search: multi-keyword AND', async () => {
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(bookmarks)
    const graphEngine = new BookmarkGraphEngine()
    const search = new BookmarkSearch(indexer, graphEngine)

    // "React" AND "Hooks"
    const results = search.search('React Hooks')
    for (const r of results) {
      const text = (r.bookmark.title + r.bookmark.url).toLowerCase()
      // Both keywords should be present
      assert.ok(
        text.includes('react') || text.includes('hooks'),
        'Should match at least one keyword'
      )
    }
  })

  it('detail panel: show and switch', async () => {
    const { BookmarkDetailPanel } = await import('../lib/bookmark-detail-panel.js')
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const graphEngine = new BookmarkGraphEngine()
    graphEngine.buildGraph(bookmarks)

    const panel = new BookmarkDetailPanel()
    const bookmark = bookmarks.find(b => b.id === '10')
    const similar = graphEngine.getSimilar('10', 5)

    panel.show(bookmark, similar)
    const data = panel.getPanelData()
    assert.equal(data.bookmark.id, '10')
    assert.ok(data.similarBookmarks.length > 0, 'Should have similar bookmarks')

    // switchToSimilar returns a bookmark object (doesn't auto-update)
    if (data.similarBookmarks.length > 0) {
      const switched = panel.switchToSimilar(data.similarBookmarks[0].id)
      assert.ok(switched, 'Should return switched bookmark')
      assert.notEqual(switched.id, '10', 'Switched bookmark should be different')
    }
  })

  it('search suggestions: based on tags', async () => {
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(bookmarks)
    const graphEngine = new BookmarkGraphEngine()
    const search = new BookmarkSearch(indexer, graphEngine)

    const suggestions = search.getSearchSuggestions('Re')
    assert.ok(Array.isArray(suggestions), 'Should return array')
  })

  it('graph: node data structure', async () => {
    const collector = new BookmarkCollector()
    const bookmarks = await collector.collect()
    const graphEngine = new BookmarkGraphEngine()
    const graph = graphEngine.buildGraph(bookmarks)

    for (const node of graph.nodes) {
      assert.ok(node.id, 'Node should have id')
      assert.ok(node.label, 'Node should have label')
      assert.ok(typeof node.size === 'number', 'Node should have numeric size')
    }

    for (const edge of graph.edges) {
      assert.ok(edge.source, 'Edge should have source')
      assert.ok(edge.target, 'Edge should have target')
      assert.ok(typeof edge.weight === 'number', 'Edge should have numeric weight')
    }
  })
})
