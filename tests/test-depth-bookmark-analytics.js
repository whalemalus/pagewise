/**
 * test-depth-bookmark-analytics.js — BookmarkAnalytics 深度测试
 *
 * 测试范围:
 *   getOverview     — 统计计算、空数据、边界值、标签归一化
 *   getTimeline     — daily/weekly/monthly 粒度、缺失日期、无效日期
 *   getDomainStats  — 域名统计、topN 限制、www 剥离
 *   getTagStats     — 标签频率、大小写归一化、topN、空标签
 *   getFolderDepth  — 深度分布、无 folderPath、嵌套路径
 *   getGrowthRate   — 月度/季度增长率、累计计算、首期 null
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { BookmarkAnalytics } = await import('../lib/bookmark-analytics.js')

// ── 辅助工厂 ────────────────────────────────────────────────────────────────

function bm (overrides = {}) {
  return {
    id: String(Math.random()),
    title: 'Test',
    url: 'https://example.com/page',
    dateAdded: '2024-06-15T10:00:00Z',
    ...overrides,
  }
}

// ── getOverview ─────────────────────────────────────────────────────────────

describe('BookmarkAnalytics — getOverview', () => {

  it('1. 基本概览统计：正确计算各维度数量', () => {
    const bookmarks = [
      bm({ url: 'https://a.com/1', folderPath: ['Root', 'A'], tags: ['js', 'web'] }),
      bm({ url: 'https://a.com/2', folderPath: ['Root', 'B'], tags: ['js'] }),
      bm({ url: 'https://b.com/1', folderPath: ['Root', 'A'], tags: ['css'] }),
      bm({ url: 'https://b.com/2' }),
    ]
    const ov = BookmarkAnalytics.getOverview(bookmarks)
    assert.equal(ov.totalBookmarks, 4)
    assert.equal(ov.totalDomains, 2)       // a.com, b.com
    assert.equal(ov.totalTags, 3)          // js, web, css
    assert.ok(ov.totalFolders >= 3)        // Root, Root/A, Root/B
    assert.equal(ov.bookmarksWithTags, 3)
    assert.equal(ov.bookmarksWithFolders, 3)
    assert.equal(ov.bookmarksWithoutUrl, 0)  // bm() provides url by default
  })

  it('2. 空数组输入：所有字段返回 0', () => {
    const ov = BookmarkAnalytics.getOverview([])
    assert.equal(ov.totalBookmarks, 0)
    assert.equal(ov.totalFolders, 0)
    assert.equal(ov.totalTags, 0)
    assert.equal(ov.totalDomains, 0)
    assert.equal(ov.bookmarksWithTags, 0)
    assert.equal(ov.bookmarksWithFolders, 0)
    assert.equal(ov.bookmarksWithoutUrl, 0)
    assert.equal(ov.avgTagsPerBookmark, 0)
  })

  it('3. null/undefined 输入：安全回退到空结果', () => {
    for (const input of [null, undefined, 'string', 123]) {
      const ov = BookmarkAnalytics.getOverview(input)
      assert.equal(ov.totalBookmarks, 0)
      assert.equal(ov.avgTagsPerBookmark, 0)
    }
  })

  it('4. 标签大小写归一化与空白去重', () => {
    const bookmarks = [
      bm({ tags: ['JavaScript', '  javascript  ', 'JAVASCRIPT'] }),
      bm({ tags: ['CSS', 'css '] }),
    ]
    const ov = BookmarkAnalytics.getOverview(bookmarks)
    assert.equal(ov.totalTags, 2)  // javascript, css
    assert.equal(ov.avgTagsPerBookmark, 2.5) // (3+2)/2 = 2.5
  })

  it('5. 无 URL 的书签正确计数', () => {
    const bookmarks = [
      bm({ url: null }),
      bm({ url: undefined }),
      bm({ url: '' }),
      bm({ url: 'https://ok.com' }),
    ]
    const ov = BookmarkAnalytics.getOverview(bookmarks)
    assert.equal(ov.bookmarksWithoutUrl, 3)
    assert.equal(ov.totalDomains, 1)
  })
})

// ── getTimeline ─────────────────────────────────────────────────────────────

describe('BookmarkAnalytics — getTimeline', () => {

  it('6. daily 粒度：按天统计正确分组', () => {
    const bookmarks = [
      bm({ dateAdded: '2024-06-15T10:00:00Z' }),
      bm({ dateAdded: '2024-06-15T18:00:00Z' }),
      bm({ dateAdded: '2024-06-16T09:00:00Z' }),
    ]
    const tl = BookmarkAnalytics.getTimeline(bookmarks, 'daily')
    assert.equal(tl.length, 2)
    assert.equal(tl[0].count, 2)
    assert.equal(tl[1].count, 1)
    // 按时间升序
    assert.ok(tl[0].period <= tl[1].period)
  })

  it('7. weekly 粒度：按周统计正确分组', () => {
    const bookmarks = [
      bm({ dateAdded: '2024-01-08T10:00:00Z' }),
      bm({ dateAdded: '2024-01-10T10:00:00Z' }),
      bm({ dateAdded: '2024-01-22T10:00:00Z' }),
    ]
    const tl = BookmarkAnalytics.getTimeline(bookmarks, 'weekly')
    // 前两个应在同一周
    assert.ok(tl.length >= 1)
    const totalCount = tl.reduce((s, e) => s + e.count, 0)
    assert.equal(totalCount, 3)
    // period 格式为 YYYY-Wxx
    for (const entry of tl) {
      assert.match(entry.period, /^\d{4}-W\d{2}$/)
    }
  })

  it('8. monthly 粒度：按月统计正确分组', () => {
    const bookmarks = [
      bm({ dateAdded: '2024-06-01T10:00:00Z' }),
      bm({ dateAdded: '2024-06-30T10:00:00Z' }),
      bm({ dateAdded: '2024-07-01T10:00:00Z' }),
    ]
    const tl = BookmarkAnalytics.getTimeline(bookmarks, 'monthly')
    assert.equal(tl.length, 2)
    assert.equal(tl[0].period, '2024-06')
    assert.equal(tl[0].count, 2)
    assert.equal(tl[1].period, '2024-07')
    assert.equal(tl[1].count, 1)
  })

  it('9. 缺失 dateAdded 的书签被跳过', () => {
    const bookmarks = [
      bm({ dateAdded: undefined }),
      bm({ dateAdded: '' }),
      bm({ dateAdded: '2024-06-15T10:00:00Z' }),
    ]
    const tl = BookmarkAnalytics.getTimeline(bookmarks, 'daily')
    const total = tl.reduce((s, e) => s + e.count, 0)
    assert.equal(total, 1)
  })

  it('10. 空数组输入：返回空时间线', () => {
    const tl = BookmarkAnalytics.getTimeline([])
    assert.deepEqual(tl, [])
  })
})

// ── getDomainStats ──────────────────────────────────────────────────────────

describe('BookmarkAnalytics — getDomainStats', () => {

  it('11. 域名统计：www 子域名剥离 & topN 限制', () => {
    const bookmarks = [
      bm({ url: 'https://www.github.com/a' }),
      bm({ url: 'https://github.com/b' }),
      bm({ url: 'https://developer.mozilla.org/en' }),
      bm({ url: 'https://stackoverflow.com/q' }),
    ]
    const stats = BookmarkAnalytics.getDomainStats(bookmarks, 2)
    assert.equal(stats.length, 2)
    // github.com 合并了 www 和非 www
    const gh = stats.find(s => s.domain === 'github.com')
    assert.ok(gh)
    assert.equal(gh.count, 2)
    assert.equal(gh.percentage, 50) // 2/4
  })

  it('12. 无有效域名的书签：返回空数组', () => {
    const bookmarks = [
      bm({ url: null }),
      bm({ url: undefined }),
      bm({ url: '' }),
    ]
    const stats = BookmarkAnalytics.getDomainStats(bookmarks)
    assert.deepEqual(stats, [])
  })

  it('13. 百分比总和 ≤ 100', () => {
    const bookmarks = Array.from({ length: 10 }, (_, i) =>
      bm({ url: `https://site-${i % 3}.com/page` })
    )
    const stats = BookmarkAnalytics.getDomainStats(bookmarks)
    const total = stats.reduce((s, e) => s + e.percentage, 0)
    assert.ok(total <= 100.01) // 允许浮点误差
  })
})

// ── getTagStats ─────────────────────────────────────────────────────────────

describe('BookmarkAnalytics — getTagStats', () => {

  it('14. 标签频率：大小写归一化 & 降序排列', () => {
    const bookmarks = [
      bm({ tags: ['JavaScript', 'React'] }),
      bm({ tags: ['javascript', 'Node'] }),
      bm({ tags: ['JAVASCRIPT', 'react'] }),
    ]
    const stats = BookmarkAnalytics.getTagStats(bookmarks, 10)
    assert.ok(stats.length >= 3)
    // javascript 应排第一（3次）
    assert.equal(stats[0].tag, 'javascript')
    assert.equal(stats[0].count, 3)
    // 降序
    for (let i = 1; i < stats.length; i++) {
      assert.ok(stats[i].count <= stats[i - 1].count)
    }
  })

  it('15. 无标签书签：返回空数组 & 空字符串标签被忽略', () => {
    const bookmarks = [
      bm({ tags: [] }),
      bm({ tags: undefined }),
      bm({ tags: ['  ', ''] }),
      bm({ tags: null }),
    ]
    const stats = BookmarkAnalytics.getTagStats(bookmarks)
    assert.deepEqual(stats, [])
  })
})

// ── getFolderDepth ──────────────────────────────────────────────────────────

describe('BookmarkAnalytics — getFolderDepth', () => {

  it('16. 文件夹深度分布正确计算', () => {
    const bookmarks = [
      bm({ folderPath: [] }),            // depth 0
      bm({ folderPath: ['A'] }),         // depth 1
      bm({ folderPath: ['A'] }),         // depth 1
      bm({ folderPath: ['A', 'B'] }),    // depth 2
    ]
    const depth = BookmarkAnalytics.getFolderDepth(bookmarks)
    assert.equal(depth.length, 3)
    assert.deepEqual(depth[0], { depth: 0, count: 1, percentage: 25 })
    assert.deepEqual(depth[1], { depth: 1, count: 2, percentage: 50 })
    assert.deepEqual(depth[2], { depth: 2, count: 1, percentage: 25 })
  })

  it('17. 无 folderPath 的书签按深度 0 处理', () => {
    const bookmarks = [
      bm({ folderPath: undefined }),
      bm({ folderPath: null }),
    ]
    const depth = BookmarkAnalytics.getFolderDepth(bookmarks)
    assert.equal(depth.length, 1)
    assert.equal(depth[0].depth, 0)
    assert.equal(depth[0].count, 2)
    assert.equal(depth[0].percentage, 100)
  })

  it('18. 空数组输入：返回空深度分布', () => {
    assert.deepEqual(BookmarkAnalytics.getFolderDepth([]), [])
  })
})

// ── getGrowthRate ───────────────────────────────────────────────────────────

describe('BookmarkAnalytics — getGrowthRate', () => {

  it('19. 月度增长率：首期 growthRate 为 null，后续正确计算', () => {
    const bookmarks = [
      bm({ dateAdded: '2024-01-10T10:00:00Z' }),
      bm({ dateAdded: '2024-01-15T10:00:00Z' }),
      bm({ dateAdded: '2024-02-10T10:00:00Z' }),
      bm({ dateAdded: '2024-02-20T10:00:00Z' }),
      bm({ dateAdded: '2024-02-25T10:00:00Z' }),
      bm({ dateAdded: '2024-03-10T10:00:00Z' }),
    ]
    const growth = BookmarkAnalytics.getGrowthRate(bookmarks, 'monthly')
    assert.equal(growth.length, 3)
    assert.equal(growth[0].period, '2024-01')
    assert.equal(growth[0].count, 2)
    assert.equal(growth[0].cumulative, 2)
    assert.equal(growth[0].growthRate, null)
    assert.equal(growth[1].period, '2024-02')
    assert.equal(growth[1].count, 3)
    assert.equal(growth[1].cumulative, 5)
    assert.equal(growth[1].growthRate, 50) // (3-2)/2*100
    assert.equal(growth[2].period, '2024-03')
    assert.equal(growth[2].count, 1)
    assert.equal(growth[2].cumulative, 6)
  })

  it('20. 季度粒度：月份正确合并到季度', () => {
    const bookmarks = [
      bm({ dateAdded: '2024-01-10T10:00:00Z' }),
      bm({ dateAdded: '2024-02-10T10:00:00Z' }),
      bm({ dateAdded: '2024-03-10T10:00:00Z' }),
      bm({ dateAdded: '2024-04-10T10:00:00Z' }),
    ]
    const growth = BookmarkAnalytics.getGrowthRate(bookmarks, 'quarterly')
    assert.equal(growth.length, 2)
    assert.equal(growth[0].period, '2024-Q1')
    assert.equal(growth[0].count, 3)
    assert.equal(growth[0].cumulative, 3)
    assert.equal(growth[0].growthRate, null)
    assert.equal(growth[1].period, '2024-Q2')
    assert.equal(growth[1].count, 1)
    assert.equal(growth[1].cumulative, 4)
    assert.equal(growth[1].growthRate, -66.67) // (1-3)/3*100
  })

  it('21. 空数组输入：返回空增长率', () => {
    assert.deepEqual(BookmarkAnalytics.getGrowthRate([]), [])
  })

  it('22. 累计值始终递增（或等值）', () => {
    const bookmarks = [
      bm({ dateAdded: '2024-01-10T10:00:00Z' }),
      bm({ dateAdded: '2024-03-10T10:00:00Z' }),
      bm({ dateAdded: '2024-06-10T10:00:00Z' }),
    ]
    const growth = BookmarkAnalytics.getGrowthRate(bookmarks, 'monthly')
    for (let i = 1; i < growth.length; i++) {
      assert.ok(growth[i].cumulative >= growth[i - 1].cumulative)
    }
  })
})

// ── 内部工具方法 ────────────────────────────────────────────────────────────

describe('BookmarkAnalytics — 内部工具', () => {

  it('23. _extractDomain：正确提取域名并剥离 www', () => {
    assert.equal(BookmarkAnalytics._extractDomain('https://www.github.com/path'), 'github.com')
    assert.equal(BookmarkAnalytics._extractDomain('http://example.com'), 'example.com')
    assert.equal(BookmarkAnalytics._extractDomain('https://sub.domain.org/page?q=1'), 'sub.domain.org')
  })

  it('24. _extractDomain：无效输入返回空字符串', () => {
    assert.equal(BookmarkAnalytics._extractDomain(''), '')
    assert.equal(BookmarkAnalytics._extractDomain(null), '')
    assert.equal(BookmarkAnalytics._extractDomain(undefined), '')
    assert.equal(BookmarkAnalytics._extractDomain(123), '')
  })

  it('25. _toPeriod：daily/weekly/monthly 格式正确', () => {
    const d = '2024-06-15T10:00:00Z'
    assert.equal(BookmarkAnalytics._toPeriod(d, 'daily'), '2024-06-15')
    assert.match(BookmarkAnalytics._toPeriod(d, 'weekly'), /^2024-W\d{2}$/)
    assert.equal(BookmarkAnalytics._toPeriod(d, 'monthly'), '2024-06')
  })

  it('26. _toPeriod：无效日期返回空字符串', () => {
    assert.equal(BookmarkAnalytics._toPeriod('', 'daily'), '')
    assert.equal(BookmarkAnalytics._toPeriod(null, 'daily'), '')
    assert.equal(BookmarkAnalytics._toPeriod('not-a-date', 'daily'), '')
  })

  it('27. _monthToQuarter：月份正确映射到季度', () => {
    assert.equal(BookmarkAnalytics._monthToQuarter('2024-01'), '2024-Q1')
    assert.equal(BookmarkAnalytics._monthToQuarter('2024-03'), '2024-Q1')
    assert.equal(BookmarkAnalytics._monthToQuarter('2024-04'), '2024-Q2')
    assert.equal(BookmarkAnalytics._monthToQuarter('2024-12'), '2024-Q4')
  })
})
