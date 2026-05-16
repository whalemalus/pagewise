/**
 * 测试 lib/bookmark-analytics.js — 书签分析仪表盘
 *
 * 测试范围:
 *   getOverview (概览) / getTimeline (时间线) / getDomainStats (域名统计) /
 *   getTagStats (标签统计) / getFolderDepth (文件夹深度) / getGrowthRate (增长率) /
 *   内部工具: _extractDomain / _toPeriod / _monthToQuarter
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkAnalytics } = await import('../lib/bookmark-analytics.js');

// ==================== 辅助: 构造书签 ====================

function bm(id, { title = `Bookmark ${id}`, url = '', folderPath, tags, dateAdded, visitCount } = {}) {
  return { id: String(id), title, url, ...(folderPath ? { folderPath } : {}), ...(tags ? { tags } : {}), ...(dateAdded ? { dateAdded } : {}), ...(typeof visitCount === 'number' ? { visitCount } : {}) };
}

// ==================== 测试 ====================

describe('BookmarkAnalytics', () => {

  // ─── getOverview ───────────────────────────────────────────────────────

  describe('getOverview', () => {

    it('1. 空数组返回全零概览', () => {
      const ov = BookmarkAnalytics.getOverview([]);
      assert.equal(ov.totalBookmarks, 0);
      assert.equal(ov.totalFolders, 0);
      assert.equal(ov.totalTags, 0);
      assert.equal(ov.totalDomains, 0);
      assert.equal(ov.bookmarksWithTags, 0);
      assert.equal(ov.bookmarksWithFolders, 0);
      assert.equal(ov.bookmarksWithoutUrl, 0);
      assert.equal(ov.avgTagsPerBookmark, 0);
    });

    it('2. 非数组输入返回全零', () => {
      const ov = BookmarkAnalytics.getOverview(null);
      assert.equal(ov.totalBookmarks, 0);
      assert.equal(ov.avgTagsPerBookmark, 0);
    });

    it('3. 单个书签 — 有url、标签和文件夹', () => {
      const ov = BookmarkAnalytics.getOverview([
        bm(1, { url: 'https://example.com/a', tags: ['js', 'node'], folderPath: ['Tech', 'Frontend'] }),
      ]);
      assert.equal(ov.totalBookmarks, 1);
      assert.equal(ov.totalFolders, 2);         // Tech, Tech/Frontend
      assert.equal(ov.totalTags, 2);
      assert.equal(ov.totalDomains, 1);
      assert.equal(ov.bookmarksWithTags, 1);
      assert.equal(ov.bookmarksWithFolders, 1);
      assert.equal(ov.bookmarksWithoutUrl, 0);
      assert.equal(ov.avgTagsPerBookmark, 2);
    });

    it('4. 多个书签 — 统计去重正确', () => {
      const ov = BookmarkAnalytics.getOverview([
        bm(1, { url: 'https://a.com', tags: ['js'], folderPath: ['A'] }),
        bm(2, { url: 'https://b.com', tags: ['js', 'python'], folderPath: ['A', 'B'] }),
        bm(3, { url: 'https://a.com', tags: ['go'], folderPath: ['C'] }),
      ]);
      assert.equal(ov.totalBookmarks, 3);
      assert.equal(ov.totalDomains, 2);          // a.com, b.com
      assert.equal(ov.totalTags, 3);             // js, python, go
      assert.equal(ov.bookmarksWithTags, 3);
      assert.equal(ov.bookmarksWithFolders, 3);
    });

    it('5. 无url的书签计入 bookmarksWithoutUrl', () => {
      const ov = BookmarkAnalytics.getOverview([
        bm(1, { url: 'https://a.com' }),
        bm(2, { url: '' }),
        bm(3),                                     // no url field
      ]);
      assert.equal(ov.bookmarksWithoutUrl, 2);
      assert.equal(ov.totalDomains, 1);
    });

    it('6. 标签大小写归一化', () => {
      const ov = BookmarkAnalytics.getOverview([
        bm(1, { tags: ['JS', 'React'] }),
        bm(2, { tags: ['js', 'react'] }),
      ]);
      assert.equal(ov.totalTags, 2);              // js, react — 大小写合并
      assert.equal(ov.avgTagsPerBookmark, 2);
    });

    it('7. avgTagsPerBookmark 小数精度', () => {
      const ov = BookmarkAnalytics.getOverview([
        bm(1, { tags: ['a'] }),
        bm(2, { tags: ['a', 'b'] }),
        bm(3, { tags: ['a', 'b', 'c'] }),
      ]);
      // 总标签使用次数 = 1+2+3 = 6, 平均 = 6/3 = 2
      assert.equal(ov.avgTagsPerBookmark, 2);
    });
  });

  // ─── getTimeline ───────────────────────────────────────────────────────

  describe('getTimeline', () => {

    it('8. 空数组返回空时间线', () => {
      assert.deepEqual(BookmarkAnalytics.getTimeline([]), []);
    });

    it('9. daily粒度 — 按日聚合', () => {
      const tl = BookmarkAnalytics.getTimeline([
        bm(1, { dateAdded: '2024-01-15' }),
        bm(2, { dateAdded: '2024-01-15' }),
        bm(3, { dateAdded: '2024-01-16' }),
      ], 'daily');
      assert.equal(tl.length, 2);
      assert.equal(tl[0].period, '2024-01-15');
      assert.equal(tl[0].count, 2);
      assert.equal(tl[1].period, '2024-01-16');
      assert.equal(tl[1].count, 1);
    });

    it('10. monthly粒度 — 按月聚合', () => {
      const tl = BookmarkAnalytics.getTimeline([
        bm(1, { dateAdded: '2024-01-10' }),
        bm(2, { dateAdded: '2024-01-25' }),
        bm(3, { dateAdded: '2024-02-05' }),
      ], 'monthly');
      assert.equal(tl.length, 2);
      assert.equal(tl[0].period, '2024-01');
      assert.equal(tl[0].count, 2);
      assert.equal(tl[1].period, '2024-02');
      assert.equal(tl[1].count, 1);
    });

    it('11. weekly粒度 — 按周聚合', () => {
      const tl = BookmarkAnalytics.getTimeline([
        bm(1, { dateAdded: '2024-01-01' }),
        bm(2, { dateAdded: '2024-01-02' }),
      ], 'weekly');
      assert.equal(tl.length, 1);
      assert.ok(tl[0].period.endsWith('W') || tl[0].period.includes('W'));
    });

    it('12. 缺失 dateAdded 的书签被跳过', () => {
      const tl = BookmarkAnalytics.getTimeline([
        bm(1, { dateAdded: '2024-01-01' }),
        bm(2),                           // no dateAdded
        bm(3, { dateAdded: '' }),         // empty
      ], 'daily');
      assert.equal(tl.length, 1);
      assert.equal(tl[0].count, 1);
    });

    it('13. 结果按时间升序排列', () => {
      const tl = BookmarkAnalytics.getTimeline([
        bm(1, { dateAdded: '2024-03-01' }),
        bm(2, { dateAdded: '2024-01-01' }),
        bm(3, { dateAdded: '2024-02-01' }),
      ], 'monthly');
      assert.deepEqual(tl.map(e => e.period), ['2024-01', '2024-02', '2024-03']);
    });
  });

  // ─── getDomainStats ────────────────────────────────────────────────────

  describe('getDomainStats', () => {

    it('14. 空数组返回空域名统计', () => {
      assert.deepEqual(BookmarkAnalytics.getDomainStats([]), []);
    });

    it('15. 按数量降序排列并计算百分比', () => {
      const ds = BookmarkAnalytics.getDomainStats([
        bm(1, { url: 'https://a.com/1' }),
        bm(2, { url: 'https://a.com/2' }),
        bm(3, { url: 'https://b.com' }),
      ]);
      assert.equal(ds.length, 2);
      assert.equal(ds[0].domain, 'a.com');
      assert.equal(ds[0].count, 2);
      assert.equal(ds[0].percentage, 66.67);
      assert.equal(ds[1].domain, 'b.com');
      assert.equal(ds[1].count, 1);
      assert.equal(ds[1].percentage, 33.33);
    });

    it('16. www.前缀被去除', () => {
      const ds = BookmarkAnalytics.getDomainStats([
        bm(1, { url: 'https://www.example.com/page' }),
        bm(2, { url: 'https://example.com/page2' }),
      ]);
      assert.equal(ds.length, 1);
      assert.equal(ds[0].domain, 'example.com');
      assert.equal(ds[0].count, 2);
    });

    it('17. topN限制返回数量', () => {
      const bms = [];
      for (let i = 0; i < 10; i++) {
        bms.push(bm(i, { url: `https://d${i}.com` }));
      }
      const ds = BookmarkAnalytics.getDomainStats(bms, 3);
      assert.equal(ds.length, 3);
    });

    it('18. 无url书签不影响百分比基数', () => {
      const ds = BookmarkAnalytics.getDomainStats([
        bm(1, { url: 'https://a.com' }),
        bm(2, { url: '' }),                // no domain
        bm(3, { url: 'https://a.com/x' }),
      ]);
      assert.equal(ds.length, 1);
      assert.equal(ds[0].count, 2);
      assert.equal(ds[0].percentage, 100);  // 2/2 有域名的
    });

    it('19. 全部无url时返回空', () => {
      const ds = BookmarkAnalytics.getDomainStats([
        bm(1, { url: '' }),
        bm(2),
      ]);
      assert.deepEqual(ds, []);
    });
  });

  // ─── getTagStats ───────────────────────────────────────────────────────

  describe('getTagStats', () => {

    it('20. 空数组返回空标签统计', () => {
      assert.deepEqual(BookmarkAnalytics.getTagStats([]), []);
    });

    it('21. 大小写归一化 — JS和js合并', () => {
      const ts = BookmarkAnalytics.getTagStats([
        bm(1, { tags: ['JS', 'React'] }),
        bm(2, { tags: ['js', 'VUE'] }),
        bm(3, { tags: ['react'] }),
      ]);
      const jsTag = ts.find(t => t.tag === 'js');
      assert.equal(jsTag.count, 2);
      const reactTag = ts.find(t => t.tag === 'react');
      assert.equal(reactTag.count, 2);
      assert.equal(ts.length, 3); // js, react, vue
    });

    it('22. 百分比基于总标签使用次数', () => {
      const ts = BookmarkAnalytics.getTagStats([
        bm(1, { tags: ['a', 'b'] }),
        bm(2, { tags: ['a'] }),
      ]);
      // 总使用 = 3次, a=2 (66.67%), b=1 (33.33)
      const aTag = ts.find(t => t.tag === 'a');
      assert.equal(aTag.percentage, 66.67);
    });

    it('23. topN限制返回数量', () => {
      const bms = [];
      const tags = [];
      for (let i = 0; i < 10; i++) {
        tags.push(`tag${i}`);
        bms.push(bm(i, { tags: [`tag${i}`] }));
      }
      const ts = BookmarkAnalytics.getTagStats(bms, 5);
      assert.equal(ts.length, 5);
    });

    it('24. 空标签和非字符串标签被跳过', () => {
      const ts = BookmarkAnalytics.getTagStats([
        bm(1, { tags: ['valid', '', '  ', null, 123] }),
      ]);
      assert.equal(ts.length, 1);
      assert.equal(ts[0].tag, 'valid');
    });
  });

  // ─── getFolderDepth ────────────────────────────────────────────────────

  describe('getFolderDepth', () => {

    it('25. 空数组返回空', () => {
      assert.deepEqual(BookmarkAnalytics.getFolderDepth([]), []);
    });

    it('26. 仅根目录书签 (无folderPath)', () => {
      const fd = BookmarkAnalytics.getFolderDepth([
        bm(1),
        bm(2),
      ]);
      assert.equal(fd.length, 1);
      assert.equal(fd[0].depth, 0);
      assert.equal(fd[0].count, 2);
      assert.equal(fd[0].percentage, 100);
    });

    it('27. 嵌套文件夹深度统计', () => {
      const fd = BookmarkAnalytics.getFolderDepth([
        bm(1),                                              // depth 0
        bm(2, { folderPath: ['A'] }),                       // depth 1
        bm(3, { folderPath: ['A'] }),                       // depth 1
        bm(4, { folderPath: ['A', 'B'] }),                  // depth 2
      ]);
      assert.equal(fd.length, 3);
      assert.equal(fd[0].depth, 0);
      assert.equal(fd[0].count, 1);
      assert.equal(fd[0].percentage, 25);
      assert.equal(fd[1].depth, 1);
      assert.equal(fd[1].count, 2);
      assert.equal(fd[2].depth, 2);
      assert.equal(fd[2].count, 1);
      assert.equal(fd[2].percentage, 25);
    });

    it('28. 混合 — 深度升序', () => {
      const fd = BookmarkAnalytics.getFolderDepth([
        bm(1, { folderPath: ['X', 'Y', 'Z'] }),
        bm(2, { folderPath: ['X'] }),
        bm(3),
      ]);
      const depths = fd.map(e => e.depth);
      assert.deepEqual(depths, [0, 1, 3]);
    });
  });

  // ─── getGrowthRate ─────────────────────────────────────────────────────

  describe('getGrowthRate', () => {

    it('29. 空数组返回空', () => {
      assert.deepEqual(BookmarkAnalytics.getGrowthRate([]), []);
      assert.deepEqual(BookmarkAnalytics.getGrowthRate([], 'quarterly'), []);
    });

    it('30. 单月 — growthRate为null', () => {
      const gr = BookmarkAnalytics.getGrowthRate([
        bm(1, { dateAdded: '2024-01-10' }),
        bm(2, { dateAdded: '2024-01-20' }),
      ], 'monthly');
      assert.equal(gr.length, 1);
      assert.equal(gr[0].period, '2024-01');
      assert.equal(gr[0].count, 2);
      assert.equal(gr[0].cumulative, 2);
      assert.equal(gr[0].growthRate, null);
    });

    it('31. 多月 — 增长率计算正确', () => {
      const gr = BookmarkAnalytics.getGrowthRate([
        bm(1, { dateAdded: '2024-01-10' }),
        bm(2, { dateAdded: '2024-01-15' }),
        bm(3, { dateAdded: '2024-02-10' }),
        bm(4, { dateAdded: '2024-02-15' }),
        bm(5, { dateAdded: '2024-02-20' }),
      ], 'monthly');
      assert.equal(gr.length, 2);
      assert.equal(gr[0].period, '2024-01');
      assert.equal(gr[0].count, 2);
      assert.equal(gr[0].growthRate, null);
      assert.equal(gr[1].period, '2024-02');
      assert.equal(gr[1].count, 3);
      assert.equal(gr[1].growthRate, 50);       // (3-2)/2 * 100 = 50
      assert.equal(gr[1].cumulative, 5);
    });

    it('32. quarterly粒度 — 月份合并到季度', () => {
      const gr = BookmarkAnalytics.getGrowthRate([
        bm(1, { dateAdded: '2024-01-10' }),
        bm(2, { dateAdded: '2024-02-10' }),
        bm(3, { dateAdded: '2024-03-10' }),
        bm(4, { dateAdded: '2024-04-10' }),
      ], 'quarterly');
      assert.equal(gr.length, 2);
      assert.equal(gr[0].period, '2024-Q1');
      assert.equal(gr[0].count, 3);
      assert.equal(gr[0].growthRate, null);
      assert.equal(gr[1].period, '2024-Q2');
      assert.equal(gr[1].count, 1);
      assert.equal(gr[1].growthRate, -66.67);   // (1-3)/3 * 100
    });

    it('33. 缺失dateAdded的书签被跳过', () => {
      const gr = BookmarkAnalytics.getGrowthRate([
        bm(1, { dateAdded: '2024-01-10' }),
        bm(2),
        bm(3, { dateAdded: '' }),
      ], 'monthly');
      assert.equal(gr.length, 1);
      assert.equal(gr[0].count, 1);
    });
  });

  // ─── 内部工具: _extractDomain ──────────────────────────────────────────

  describe('_extractDomain', () => {

    it('34. 标准https URL', () => {
      assert.equal(BookmarkAnalytics._extractDomain('https://example.com/path'), 'example.com');
    });

    it('35. 去除www前缀', () => {
      assert.equal(BookmarkAnalytics._extractDomain('https://www.google.com/search'), 'google.com');
    });

    it('36. 子域名保留', () => {
      assert.equal(BookmarkAnalytics._extractDomain('https://docs.api.github.com'), 'docs.api.github.com');
    });

    it('37. 无效URL回退手动解析', () => {
      assert.equal(BookmarkAnalytics._extractDomain('not-a-url.com/page'), 'not-a-url.com');
    });

    it('38. 空/null返回空字符串', () => {
      assert.equal(BookmarkAnalytics._extractDomain(''), '');
      assert.equal(BookmarkAnalytics._extractDomain(null), '');
      assert.equal(BookmarkAnalytics._extractDomain(undefined), '');
    });

    it('39. 大小写归一化', () => {
      assert.equal(BookmarkAnalytics._extractDomain('HTTPS://WWW.EXAMPLE.COM'), 'example.com');
    });
  });

  // ─── 内部工具: _toPeriod ──────────────────────────────────────────────

  describe('_toPeriod', () => {

    it('40. daily格式', () => {
      assert.equal(BookmarkAnalytics._toPeriod('2024-01-15', 'daily'), '2024-01-15');
    });

    it('41. monthly格式', () => {
      assert.equal(BookmarkAnalytics._toPeriod('2024-01-15', 'monthly'), '2024-01');
    });

    it('42. weekly格式包含W', () => {
      const result = BookmarkAnalytics._toPeriod('2024-01-15', 'weekly');
      assert.ok(result.includes('W'));
      assert.ok(result.startsWith('2024'));
    });

    it('43. 无效日期返回空字符串', () => {
      assert.equal(BookmarkAnalytics._toPeriod('invalid-date', 'daily'), '');
      assert.equal(BookmarkAnalytics._toPeriod('', 'daily'), '');
      assert.equal(BookmarkAnalytics._toPeriod(null, 'daily'), '');
    });
  });

  // ─── 内部工具: _monthToQuarter ─────────────────────────────────────────

  describe('_monthToQuarter', () => {

    it('44. 1-3月为Q1', () => {
      assert.equal(BookmarkAnalytics._monthToQuarter('2024-01'), '2024-Q1');
      assert.equal(BookmarkAnalytics._monthToQuarter('2024-02'), '2024-Q1');
      assert.equal(BookmarkAnalytics._monthToQuarter('2024-03'), '2024-Q1');
    });

    it('45. 4-6月为Q2', () => {
      assert.equal(BookmarkAnalytics._monthToQuarter('2024-04'), '2024-Q2');
      assert.equal(BookmarkAnalytics._monthToQuarter('2024-06'), '2024-Q2');
    });

    it('46. 10-12月为Q4', () => {
      assert.equal(BookmarkAnalytics._monthToQuarter('2024-10'), '2024-Q4');
      assert.equal(BookmarkAnalytics._monthToQuarter('2024-12'), '2024-Q4');
    });

    it('47. 格式错误时返回原值', () => {
      assert.equal(BookmarkAnalytics._monthToQuarter('bad'), 'bad');
    });
  });

  // ─── getVisitStats ─────────────────────────────────────────────────────

  describe('getVisitStats', () => {

    it('48. 空数组返回默认结构', () => {
      const vs = BookmarkAnalytics.getVisitStats([]);
      assert.equal(vs.totalVisits, 0);
      assert.equal(vs.bookmarksVisited, 0);
      assert.equal(vs.unvisitedBookmarks, 0);
      assert.equal(vs.avgVisits, 0);
      assert.equal(vs.maxVisits, 0);
      assert.deepEqual(vs.topVisited, []);
      assert.equal(vs.distribution.length, 5);
    });

    it('49. 非数组输入返回默认结构', () => {
      const vs = BookmarkAnalytics.getVisitStats(null);
      assert.equal(vs.totalVisits, 0);
      assert.equal(vs.distribution.length, 5);
    });

    it('50. 全部未访问 — 0桶填满', () => {
      const vs = BookmarkAnalytics.getVisitStats([
        bm(1, { url: 'https://a.com' }),
        bm(2, { url: 'https://b.com' }),
      ]);
      assert.equal(vs.totalVisits, 0);
      assert.equal(vs.bookmarksVisited, 0);
      assert.equal(vs.unvisitedBookmarks, 2);
      assert.equal(vs.distribution[0].count, 2);
    });

    it('51. 有访问记录 — 统计正确', () => {
      const vs = BookmarkAnalytics.getVisitStats([
        bm(1, { url: 'https://a.com', visitCount: 3 }),
        bm(2, { url: 'https://b.com', visitCount: 8 }),
        bm(3, { url: 'https://c.com' }),  // no visitCount
      ]);
      assert.equal(vs.totalVisits, 11);
      assert.equal(vs.bookmarksVisited, 2);
      assert.equal(vs.unvisitedBookmarks, 1);
      assert.equal(vs.avgVisits, 3.67);
      assert.equal(vs.maxVisits, 8);
    });

    it('52. 分布桶正确分类', () => {
      const vs = BookmarkAnalytics.getVisitStats([
        bm(1, { visitCount: 0 }),     // 0
        bm(2, { visitCount: 2 }),     // 1-5
        bm(3, { visitCount: 5 }),     // 1-5
        bm(4, { visitCount: 7 }),     // 6-10
        bm(5, { visitCount: 25 }),    // 11-50
        bm(6, { visitCount: 100 }),   // 50+
      ]);
      assert.equal(vs.distribution[0].count, 1);  // 0
      assert.equal(vs.distribution[1].count, 2);  // 1-5
      assert.equal(vs.distribution[2].count, 1);  // 6-10
      assert.equal(vs.distribution[3].count, 1);  // 11-50
      assert.equal(vs.distribution[4].count, 1);  // 50+
    });

    it('53. topVisited 排序正确且限10', () => {
      const bms = [];
      for (let i = 1; i <= 15; i++) {
        bms.push(bm(i, { url: `https://d${i}.com`, title: `Page ${i}`, visitCount: i }));
      }
      const vs = BookmarkAnalytics.getVisitStats(bms);
      assert.equal(vs.topVisited.length, 10);
      assert.equal(vs.topVisited[0].visitCount, 15);
      assert.equal(vs.topVisited[9].visitCount, 6);
    });

    it('54. visitCount为负值视为0', () => {
      const vs = BookmarkAnalytics.getVisitStats([
        bm(1, { visitCount: -5 }),
      ]);
      assert.equal(vs.totalVisits, 0);
      assert.equal(vs.unvisitedBookmarks, 1);
    });
  });

  // ─── getCollectionTrend ────────────────────────────────────────────────

  describe('getCollectionTrend', () => {

    it('55. 返回正确长度的数组', () => {
      const trend = BookmarkAnalytics.getCollectionTrend([], 7);
      assert.equal(trend.length, 7);
      assert.equal(trend[0].count, 0);
      assert.equal(trend[0].cumulative, 0);
    });

    it('56. 默认30天', () => {
      const trend = BookmarkAnalytics.getCollectionTrend([]);
      assert.equal(trend.length, 30);
    });

    it('57. 结果按日期升序', () => {
      const trend = BookmarkAnalytics.getCollectionTrend([], 5);
      for (let i = 1; i < trend.length; i++) {
        assert.ok(trend[i].date > trend[i - 1].date, `${trend[i].date} should be > ${trend[i - 1].date}`);
      }
    });

    it('58. cumulative 递增', () => {
      const trend = BookmarkAnalytics.getCollectionTrend([], 5);
      for (let i = 1; i < trend.length; i++) {
        assert.ok(trend[i].cumulative >= trend[i - 1].cumulative);
      }
    });

    it('59. 非数组输入返回空趋势', () => {
      const trend = BookmarkAnalytics.getCollectionTrend(null, 5);
      assert.equal(trend.length, 5);
    });

    it('60. 无效 days 参数回退30', () => {
      const trend = BookmarkAnalytics.getCollectionTrend([], -3);
      assert.equal(trend.length, 30);
    });
  });

  // ─── getDomainDistribution ─────────────────────────────────────────────

  describe('getDomainDistribution', () => {

    it('61. 空数组返回空分布', () => {
      assert.deepEqual(BookmarkAnalytics.getDomainDistribution([]), []);
    });

    it('62. 含 color 字段和百分比', () => {
      const dd = BookmarkAnalytics.getDomainDistribution([
        bm(1, { url: 'https://github.com/a' }),
        bm(2, { url: 'https://github.com/b' }),
        bm(3, { url: 'https://stackoverflow.com/q' }),
      ]);
      assert.equal(dd.length, 2);
      assert.equal(dd[0].domain, 'github.com');
      assert.equal(dd[0].count, 2);
      assert.equal(dd[0].percentage, 66.67);
      assert.equal(typeof dd[0].color, 'string');
      assert.ok(dd[0].color.startsWith('#'));
    });

    it('63. 按 count 降序', () => {
      const dd = BookmarkAnalytics.getDomainDistribution([
        bm(1, { url: 'https://a.com' }),
        bm(2, { url: 'https://b.com' }),
        bm(3, { url: 'https://b.com/x' }),
      ]);
      assert.equal(dd[0].domain, 'b.com');
      assert.equal(dd[0].count, 2);
    });

    it('64. topN 限制', () => {
      const bms = [];
      for (let i = 0; i < 20; i++) bms.push(bm(i, { url: `https://d${i}.com` }));
      const dd = BookmarkAnalytics.getDomainDistribution(bms, 5);
      assert.equal(dd.length, 5);
    });

    it('65. 全无url时返回空', () => {
      const dd = BookmarkAnalytics.getDomainDistribution([bm(1), bm(2)]);
      assert.deepEqual(dd, []);
    });
  });

  // ─── getActivityHeatmap ────────────────────────────────────────────────

  describe('getActivityHeatmap', () => {

    it('66. 空数组返回全零矩阵', () => {
      const hm = BookmarkAnalytics.getActivityHeatmap([]);
      assert.equal(hm.labels.length, 7);
      assert.equal(hm.hours.length, 24);
      assert.equal(hm.matrix.length, 7);
      assert.equal(hm.matrix[0].length, 24);
      assert.equal(hm.maxValue, 0);
      assert.equal(hm.totalEntries, 0);
    });

    it('67. 矩阵内所有值为0', () => {
      const hm = BookmarkAnalytics.getActivityHeatmap([]);
      for (const row of hm.matrix) {
        for (const val of row) {
          assert.equal(val, 0);
        }
      }
    });

    it('68. labels 包含周一到周日', () => {
      const hm = BookmarkAnalytics.getActivityHeatmap([]);
      assert.deepEqual(hm.labels, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });

    it('69. hours 包含 00 到 23', () => {
      const hm = BookmarkAnalytics.getActivityHeatmap([]);
      assert.equal(hm.hours.length, 24);
      assert.equal(hm.hours[0], '00');
      assert.equal(hm.hours[23], '23');
    });

    it('70. weeks 参数有效 — 非法值回退4', () => {
      const hm = BookmarkAnalytics.getActivityHeatmap([], -1);
      assert.equal(hm.totalEntries, 0);
    });

    it('71. 矩阵行数和列数固定', () => {
      const hm = BookmarkAnalytics.getActivityHeatmap([], 2);
      assert.equal(hm.matrix.length, 7);
      for (const row of hm.matrix) {
        assert.equal(row.length, 24);
      }
    });
  });

  // ─── _formatDate ───────────────────────────────────────────────────────

  describe('_formatDate', () => {

    it('72. 日期格式化为 YYYY-MM-DD', () => {
      assert.equal(BookmarkAnalytics._formatDate(new Date(2024, 0, 5)), '2024-01-05');
      assert.equal(BookmarkAnalytics._formatDate(new Date(2024, 11, 31)), '2024-12-31');
    });

    it('73. 单位数月份和日期补零', () => {
      assert.equal(BookmarkAnalytics._formatDate(new Date(2024, 2, 1)), '2024-03-01');
    });
  });
});
