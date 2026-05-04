/**
 * BookmarkGraph V1.0 E2E 测试
 * Phase B 全模块集成测试 (R53-R61)
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'

// 测试用书签数据
function createTestBookmarks() {
  return [
    { id: '1', title: 'React Tutorial for Beginners', url: 'https://reactjs.org/tutorial', folderPath: ['Frontend', 'React'], dateAdded: 1700000000000 },
    { id: '2', title: 'Vue.js Best Practices', url: 'https://vuejs.org/best-practices', folderPath: ['Frontend', 'Vue'], dateAdded: 1700100000000 },
    { id: '3', title: 'Node.js Express Guide', url: 'https://nodejs.org/express', folderPath: ['Backend', 'Node'], dateAdded: 1700200000000 },
    { id: '4', title: 'Python Django Tutorial', url: 'https://djangoproject.com/tutorial', folderPath: ['Backend', 'Python'], dateAdded: 1700300000000 },
    { id: '5', title: 'Docker Container Basics', url: 'https://docker.com/get-started', folderPath: ['DevOps'], dateAdded: 1700400000000 },
    { id: '6', title: 'Machine Learning with TensorFlow', url: 'https://tensorflow.org/tutorials', folderPath: ['AI', 'ML'], dateAdded: 1700500000000 },
    { id: '7', title: 'MySQL Performance Optimization', url: 'https://mysql.com/optimization', folderPath: ['Database', 'MySQL'], dateAdded: 1700600000000 },
    { id: '8', title: 'React Hooks Deep Dive', url: 'https://reactjs.org/hooks', folderPath: ['Frontend', 'React'], dateAdded: 1700700000000 },
    { id: '9', title: 'Kubernetes Deployment Guide', url: 'https://kubernetes.io/deploy', folderPath: ['DevOps', 'K8s'], dateAdded: 1700800000000 },
    { id: '10', title: 'GraphQL API Design', url: 'https://graphql.org/learn', folderPath: ['Backend', 'GraphQL'], dateAdded: 1700900000000 },
    { id: '11', title: 'AWS Lambda Serverless', url: 'https://aws.amazon.com/lambda', folderPath: ['Cloud', 'AWS'], dateAdded: 1701000000000 },
    { id: '12', title: 'Security Best Practices', url: 'https://owasp.org/top10', folderPath: ['Security'], dateAdded: 1701100000000 },
    { id: '13', title: 'React Tutorial for Beginners', url: 'https://reactjs.org/tutorial', folderPath: ['Backup'], dateAdded: 1701200000000 }, // 重复 URL
    { id: '14', title: 'React入门教程', url: 'https://react.dev/learn', folderPath: ['Frontend', 'React'], dateAdded: 1701300000000 },
    { id: '15', title: 'Redis Caching Strategy', url: 'https://redis.io/docs', folderPath: ['Database', 'Redis'], dateAdded: 1701400000000 },
  ]
}

describe('R62: BookmarkGraph V1.0 E2E', () => {
  let BookmarkClusterer, BookmarkLearningPath, BookmarkTagger
  let BookmarkTagEditor, BookmarkGapDetector, BookmarkStatusManager
  let BookmarkFolderAnalyzer, BookmarkDedup, BookmarkImportExport
  let BookmarkCollector, BookmarkIndexer, BookmarkGraphEngine

  before(async () => {
    const clustererMod = await import('../lib/bookmark-clusterer.js')
    BookmarkClusterer = clustererMod.BookmarkClusterer

    const learningMod = await import('../lib/bookmark-learning-path.js')
    BookmarkLearningPath = learningMod.BookmarkLearningPath

    const taggerMod = await import('../lib/bookmark-tagger.js')
    BookmarkTagger = taggerMod.BookmarkTagger

    const editorMod = await import('../lib/bookmark-tag-editor.js')
    BookmarkTagEditor = editorMod.BookmarkTagEditor

    const gapMod = await import('../lib/bookmark-gap-detector.js')
    BookmarkGapDetector = gapMod.BookmarkGapDetector

    const statusMod = await import('../lib/bookmark-status.js')
    BookmarkStatusManager = statusMod.BookmarkStatusManager

    const folderMod = await import('../lib/bookmark-folder-analyzer.js')
    BookmarkFolderAnalyzer = folderMod.BookmarkFolderAnalyzer

    const dedupMod = await import('../lib/bookmark-dedup.js')
    BookmarkDedup = dedupMod.BookmarkDedup

    const ioMod = await import('../lib/bookmark-io.js')
    BookmarkImportExport = ioMod.BookmarkImportExport

    const collectorMod = await import('../lib/bookmark-collector.js')
    BookmarkCollector = collectorMod.BookmarkCollector

    const indexerMod = await import('../lib/bookmark-indexer.js')
    BookmarkIndexer = indexerMod.BookmarkIndexer

    const graphMod = await import('../lib/bookmark-graph.js')
    BookmarkGraphEngine = graphMod.BookmarkGraphEngine
  })

  // ===== 集成流程测试 =====

  it('1. 完整流程: 采集 → 索引 → 图谱构建', async () => {
    const bookmarks = createTestBookmarks()
    const indexer = new BookmarkIndexer()
    indexer.buildIndex(bookmarks)
    const graph = new BookmarkGraphEngine()

    assert.equal(indexer.getSize().bookmarks, 15)
    const graphData = graph.buildGraph(bookmarks)
    assert.ok(graphData.nodes.length > 0)
    assert.ok(Array.isArray(graphData.edges))
  })

  it('2. 图谱 → 聚类 → 学习路径生成', async () => {
    const bookmarks = createTestBookmarks()
    const clusterer = new BookmarkClusterer(bookmarks)
    const clusters = clusterer.cluster()

    assert.ok(clusters instanceof Map)
    assert.ok(clusters.size > 0)

    const lp = new BookmarkLearningPath({ bookmarks, clusters })
    const paths = lp.getAllPaths()
    assert.ok(paths instanceof Map)

    const progress = lp.getOverallProgress()
    assert.equal(progress.total, 15)
    assert.equal(progress.read, 0)
  })

  it('3. 书签 → 标签生成 → 标签编辑 → 标签搜索', async () => {
    const bookmarks = createTestBookmarks()
    const tagger = new BookmarkTagger(bookmarks)
    const allTags = tagger.generateAllTags()

    assert.ok(allTags.size > 0)
    for (const [id, tags] of allTags) {
      assert.ok(tags.length >= 1)
      assert.ok(tags.length <= 5)
    }

    // 编辑标签
    const editor = new BookmarkTagEditor({ bookmarks, existingTags: tagger.getTagFrequency() })
    const added = editor.addTag('1', 'custom-tag')
    assert.ok(added)
    assert.ok(editor.getTags('1').includes('custom-tag'))

    // 自动补全
    const suggestions = editor.getAutocomplete('cus', 5)
    assert.ok(suggestions.includes('custom-tag'))
  })

  it('4. 书签 → 状态标记 → 按状态过滤 → 统计', async () => {
    const bookmarks = createTestBookmarks()
    const status = new BookmarkStatusManager(bookmarks)

    status.setStatus('1', 'read')
    status.setStatus('2', 'reading')
    status.batchSetStatus(['3', '4', '5'], 'read')

    const counts = status.getStatusCounts()
    assert.equal(counts.read, 4)
    assert.equal(counts.reading, 1)
    assert.equal(counts.unread, 10)

    const readBooks = status.getByStatus('read')
    assert.equal(readBooks.length, 4)
  })

  it('5. 书签 → 重复检测 → 清理建议 → 批量删除', async () => {
    const bookmarks = createTestBookmarks()
    const dedup = new BookmarkDedup(bookmarks)

    const dups = dedup.findByExactUrl()
    assert.ok(dups.length > 0) // id 1 和 13 URL 相同

    const suggestions = dedup.suggestCleanup()
    assert.ok(suggestions.length > 0)

    const removed = dedup.batchRemove(['13'])
    assert.equal(removed, 1)
  })

  it('6. 书签 → 文件夹分析 → 整理建议', async () => {
    const bookmarks = createTestBookmarks()
    const analyzer = new BookmarkFolderAnalyzer(bookmarks)

    const analysis = analyzer.analyzeFolders()
    assert.ok(analysis.length > 0)

    const tree = analyzer.getFolderTree()
    assert.ok(Array.isArray(tree))

    const depth = analyzer.getMaxDepth()
    assert.ok(depth >= 1)
  })

  it('7. 书签 → 知识盲区检测 → 报告生成', async () => {
    const bookmarks = createTestBookmarks()
    const clusterer = new BookmarkClusterer(bookmarks)
    const clusters = clusterer.cluster()
    const tagger = new BookmarkTagger(bookmarks)

    const detector = new BookmarkGapDetector({
      bookmarks,
      clusters,
      tags: tagger.getTagFrequency()
    })

    const gaps = detector.detectGaps()
    assert.ok(Array.isArray(gaps))

    const report = detector.generateReport()
    assert.ok(report.summary)
    assert.ok(Array.isArray(report.strengths))
    assert.ok(Array.isArray(report.weaknesses))
    assert.ok(Array.isArray(report.recommendations))
  })

  it('8. 数据导出 → 数据导入 → 数据一致性', async () => {
    const bookmarks = createTestBookmarks()
    const clusterer = new BookmarkClusterer(bookmarks)
    const tagger = new BookmarkTagger(bookmarks)
    const status = new BookmarkStatusManager(bookmarks)
    status.setStatus('1', 'read')

    const io = new BookmarkImportExport({
      bookmarks,
      clusters: clusterer.cluster(),
      tags: tagger.generateAllTags(),
      statuses: new Map(bookmarks.map(b => [b.id, status.getStatus(b.id) || 'unread']))
    })

    const json = io.exportJSON()
    assert.ok(json.length > 0)

    const parsed = JSON.parse(json)
    assert.ok(parsed.bookmarks)
    assert.ok(parsed.version)

    const imported = io.importFromJSON(json)
    assert.equal(imported.bookmarks.length, 15)
  })

  // ===== 模块交互测试 =====

  it('9. 聚类结果 → 盲区检测联动', async () => {
    const bookmarks = createTestBookmarks()
    const clusterer = new BookmarkClusterer(bookmarks)
    const clusters = clusterer.cluster()

    // Frontend 类应该有多个书签
    const frontend = clusters.get('前端')
    assert.ok(frontend)
    assert.ok(frontend.length >= 2)

    const detector = new BookmarkGapDetector({ bookmarks, clusters, tags: new Map() })
    const coverage = detector.getDomainCoverage()
    assert.ok(coverage.length > 0)
  })

  it('10. 标签生成 → 标签编辑 → 频率更新', async () => {
    const bookmarks = createTestBookmarks()
    const tagger = new BookmarkTagger(bookmarks)
    const tags1 = tagger.getTagFrequency()

    const editor = new BookmarkTagEditor({ bookmarks, existingTags: tags1 })
    editor.addTag('1', 'react') // 可能已存在
    editor.addTag('1', 'brand-new-tag')

    const updatedTags = editor.getAllTags()
    assert.ok(updatedTags.includes('brand-new-tag'))
  })

  it('11. 状态管理 → 学习路径进度', async () => {
    const bookmarks = createTestBookmarks()
    const clusterer = new BookmarkClusterer(bookmarks)
    const clusters = clusterer.cluster()

    const lp = new BookmarkLearningPath({ bookmarks, clusters })
    lp.markAsRead('1')
    lp.markAsRead('8') // 两个 React 书签

    const progress = lp.getProgress('前端')
    assert.ok(progress.read >= 1)
    assert.ok(progress.percent > 0)
  })

  it('12. 文件夹分析 → 聚类分类', async () => {
    const bookmarks = createTestBookmarks()
    const analyzer = new BookmarkFolderAnalyzer(bookmarks)
    const clusterer = new BookmarkClusterer(bookmarks)

    const folders = analyzer.analyzeFolders()
    const clusters = clusterer.cluster()

    // 两种分析都应该产生结果
    assert.ok(folders.length > 0)
    assert.ok(clusters.size > 0)
  })

  it('13. 去重 → 导出（不含重复）', async () => {
    const bookmarks = createTestBookmarks()
    const dedup = new BookmarkDedup(bookmarks)

    // 去除重复
    dedup.batchRemove(['13'])
    const cleanBookmarks = bookmarks.filter(b => b.id !== '13')

    const io = new BookmarkImportExport({ bookmarks: cleanBookmarks })
    const csv = io.exportCSV()
    const lines = csv.trim().split('\n')
    assert.equal(lines.length, 15) // 14 书签 + 1 表头
  })

  // ===== 边界/错误处理 =====

  it('14. 空书签集全模块兼容', async () => {
    const empty = []

    const clusterer = new BookmarkClusterer(empty)
    assert.equal(clusterer.cluster().size, 0)

    const tagger = new BookmarkTagger(empty)
    assert.equal(tagger.generateAllTags().size, 0)

    const status = new BookmarkStatusManager(empty)
    const counts = status.getStatusCounts()
    assert.equal(counts.unread, 0)
    assert.equal(counts.reading, 0)
    assert.equal(counts.read, 0)

    const analyzer = new BookmarkFolderAnalyzer(empty)
    assert.equal(analyzer.analyzeFolders().length, 0)

    const dedup = new BookmarkDedup(empty)
    assert.equal(dedup.findDuplicates().length, 0)

    const lp = new BookmarkLearningPath({ bookmarks: empty, clusters: new Map() })
    const progress = lp.getOverallProgress()
    assert.equal(progress.total, 0)
    assert.equal(progress.read, 0)
    assert.equal(progress.percent, 0)
  })

  it('15. 大量书签 (100+) 性能测试', async () => {
    const bookmarks = []
    const domains = ['github.com', 'stackoverflow.com', 'medium.com', 'dev.to', 'docs.python.org']
    const topics = ['react', 'vue', 'node', 'python', 'docker', 'k8s', 'aws', 'ml', 'security', 'database']

    for (let i = 0; i < 150; i++) {
      const domain = domains[i % domains.length]
      const topic = topics[i % topics.length]
      bookmarks.push({
        id: String(i),
        title: `${topic} article ${i}`,
        url: `https://${domain}/${topic}/${i}`,
        folderPath: ['Tech', topic],
        dateAdded: Date.now() - i * 86400000
      })
    }

    const start = Date.now()

    const indexer = new BookmarkIndexer()
    indexer.buildIndex(bookmarks)
    const graph = new BookmarkGraphEngine()
    graph.buildGraph(bookmarks)

    const clusterer = new BookmarkClusterer(bookmarks)
    clusterer.cluster()

    const tagger = new BookmarkTagger(bookmarks)
    tagger.generateAllTags()

    const elapsed = Date.now() - start
    assert.ok(elapsed < 10000, `应 <10s，实际 ${elapsed}ms`)

    assert.equal(indexer.getSize().bookmarks, 150)
  })
})
