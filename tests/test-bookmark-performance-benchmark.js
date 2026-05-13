/**
 * 测试 lib/bookmark-performance-benchmark.js — 性能基准测试工具
 *
 * 测试范围:
 *   benchmarkSearch / benchmarkSort / benchmarkDedup / benchmarkMemory
 *   边界条件: 空输入 / null / 迭代次数 = 0 / 大规模数据
 *   统计正确性: avg / min / max / p50 / p95 / p99 / iterations
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkPerformanceBenchmark } = await import('../lib/bookmark-performance-benchmark.js');

// ==================== 辅助函数 ====================

function createBookmark(id, title, url, folderPath = [], tags = []) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    dateAdded: 1700000000000 + Number(id) * 1000,
    dateAddedISO: new Date(1700000000000 + Number(id) * 1000).toISOString(),
  };
}

function generateBookmarks(count) {
  const domains = [
    'react.dev', 'vuejs.org', 'nodejs.org', 'python.org', 'github.com',
    'css-tricks.com', 'typescriptlang.org', 'mozilla.org', 'stackoverflow.com', 'dev.to',
  ];
  const topics = [
    'React', 'Vue', 'Node.js', 'Python', 'GitHub', 'CSS', 'TypeScript', 'MDN', 'StackOverflow', 'DevTo',
  ];
  const bookmarks = [];
  for (let i = 0; i < count; i++) {
    const di = i % domains.length;
    const ti = i % topics.length;
    bookmarks.push(createBookmark(
      String(i),
      `${topics[ti]} Tutorial #${i}`,
      `https://${domains[di]}/page/${i}`,
      ['Tech', topics[ti]],
      [topics[ti].toLowerCase()],
    ));
  }
  return bookmarks;
}

const sampleBookmarks = generateBookmarks(20);

// ==================== 测试 ====================

describe('BookmarkPerformanceBenchmark', () => {
  const bench = new BookmarkPerformanceBenchmark();

  // ─── benchmarkSearch ──────────────────────────────────────────────────

  describe('benchmarkSearch', () => {

    it('1. 基本搜索基准测试返回正确的统计结构', () => {
      const result = bench.benchmarkSearch(sampleBookmarks, 'react', 10);
      assert.ok(typeof result.avg === 'number', 'avg 应为 number');
      assert.ok(typeof result.min === 'number', 'min 应为 number');
      assert.ok(typeof result.max === 'number', 'max 应为 number');
      assert.ok(typeof result.p50 === 'number', 'p50 应为 number');
      assert.ok(typeof result.p95 === 'number', 'p95 应为 number');
      assert.ok(typeof result.p99 === 'number', 'p99 应为 number');
      assert.equal(result.iterations, 10);
    });

    it('2. 搜索基准: min <= avg <= max', () => {
      const result = bench.benchmarkSearch(sampleBookmarks, 'react', 20);
      assert.ok(result.min <= result.avg, 'min <= avg');
      assert.ok(result.avg <= result.max, 'avg <= max');
      assert.ok(result.min >= 0, 'min >= 0');
    });

    it('3. 搜索基准: min <= p50 <= p95 <= p99 <= max', () => {
      const result = bench.benchmarkSearch(sampleBookmarks, 'node', 50);
      assert.ok(result.min <= result.p50, 'min <= p50');
      assert.ok(result.p50 <= result.p95, 'p50 <= p95');
      assert.ok(result.p95 <= result.p99, 'p95 <= p99');
      assert.ok(result.p99 <= result.max, 'p99 <= max');
    });

    it('4. 搜索基准: 100 书签场景', () => {
      const bms = generateBookmarks(100);
      const result = bench.benchmarkSearch(bms, 'python', 10);
      assert.equal(result.iterations, 10);
      assert.ok(result.avg >= 0, 'avg >= 0');
    });

    it('5. 搜索基准: 1000 书签场景', () => {
      const bms = generateBookmarks(1000);
      const result = bench.benchmarkSearch(bms, 'typescript', 5);
      assert.equal(result.iterations, 5);
      assert.ok(result.max >= 0, 'max >= 0');
    });

    it('6. 搜索基准: 10000 书签场景', () => {
      const bms = generateBookmarks(10000);
      const result = bench.benchmarkSearch(bms, 'css', 3);
      assert.equal(result.iterations, 3);
      assert.ok(result.min >= 0, 'min >= 0');
    });

    it('7. 搜索基准: 空书签数组返回全零', () => {
      const result = bench.benchmarkSearch([], 'react', 10);
      assert.equal(result.avg, 0);
      assert.equal(result.min, 0);
      assert.equal(result.max, 0);
      assert.equal(result.iterations, 10);
    });

    it('8. 搜索基准: null 书签返回全零', () => {
      const result = bench.benchmarkSearch(null, 'react', 10);
      assert.equal(result.avg, 0);
      assert.equal(result.iterations, 10);
    });

    it('9. 搜索基准: 空查询返回全零', () => {
      const result = bench.benchmarkSearch(sampleBookmarks, '', 10);
      assert.equal(result.avg, 0);
      assert.equal(result.iterations, 10);
    });

    it('10. 搜索基准: null 查询返回全零', () => {
      const result = bench.benchmarkSearch(sampleBookmarks, null, 10);
      assert.equal(result.avg, 0);
      assert.equal(result.iterations, 10);
    });

    it('11. 搜索基准: iterations=0 返回全零', () => {
      const result = bench.benchmarkSearch(sampleBookmarks, 'react', 0);
      assert.equal(result.avg, 0);
      assert.equal(result.iterations, 0);
    });
  });

  // ─── benchmarkSort ────────────────────────────────────────────────────

  describe('benchmarkSort', () => {

    it('12. 排序基准: 返回正确的统计结构', () => {
      const result = bench.benchmarkSort(sampleBookmarks, 10);
      assert.ok(typeof result.avg === 'number');
      assert.ok(typeof result.min === 'number');
      assert.ok(typeof result.max === 'number');
      assert.ok(typeof result.p50 === 'number');
      assert.ok(typeof result.p95 === 'number');
      assert.ok(typeof result.p99 === 'number');
      assert.equal(result.iterations, 10);
    });

    it('13. 排序基准: min <= avg <= max', () => {
      const result = bench.benchmarkSort(sampleBookmarks, 20);
      assert.ok(result.min <= result.avg);
      assert.ok(result.avg <= result.max);
    });

    it('14. 排序基准: 百分位单调递增', () => {
      const result = bench.benchmarkSort(sampleBookmarks, 50);
      assert.ok(result.min <= result.p50);
      assert.ok(result.p50 <= result.p95);
      assert.ok(result.p95 <= result.p99);
      assert.ok(result.p99 <= result.max);
    });

    it('15. 排序基准: 空数组返回全零', () => {
      const result = bench.benchmarkSort([], 10);
      assert.equal(result.avg, 0);
      assert.equal(result.iterations, 10);
    });

    it('16. 排序基准: 1000 书签场景', () => {
      const bms = generateBookmarks(1000);
      const result = bench.benchmarkSort(bms, 5);
      assert.equal(result.iterations, 5);
      assert.ok(result.avg >= 0);
    });

    it('17. 排序基准: null 输入返回全零', () => {
      const result = bench.benchmarkSort(null, 10);
      assert.equal(result.avg, 0);
      assert.equal(result.iterations, 10);
    });
  });

  // ─── benchmarkDedup ───────────────────────────────────────────────────

  describe('benchmarkDedup', () => {

    it('18. 去重基准: 返回正确的统计结构', () => {
      const result = bench.benchmarkDedup(sampleBookmarks, 10);
      assert.ok(typeof result.avg === 'number');
      assert.ok(typeof result.min === 'number');
      assert.ok(typeof result.max === 'number');
      assert.ok(typeof result.p50 === 'number');
      assert.ok(typeof result.p95 === 'number');
      assert.ok(typeof result.p99 === 'number');
      assert.equal(result.iterations, 10);
    });

    it('19. 去重基准: min <= avg <= max', () => {
      const result = bench.benchmarkDedup(sampleBookmarks, 20);
      assert.ok(result.min <= result.avg);
      assert.ok(result.avg <= result.max);
    });

    it('20. 去重基准: 百分位单调递增', () => {
      const result = bench.benchmarkDedup(sampleBookmarks, 30);
      assert.ok(result.min <= result.p50);
      assert.ok(result.p50 <= result.p95);
      assert.ok(result.p95 <= result.p99);
      assert.ok(result.p99 <= result.max);
    });

    it('21. 去重基准: 空数组返回全零', () => {
      const result = bench.benchmarkDedup([], 10);
      assert.equal(result.avg, 0);
      assert.equal(result.iterations, 10);
    });

    it('22. 去重基准: 1000 书签场景', () => {
      const bms = generateBookmarks(1000);
      const result = bench.benchmarkDedup(bms, 5);
      assert.equal(result.iterations, 5);
      assert.ok(result.avg >= 0);
    });

    it('23. 去重基准: null 输入返回全零', () => {
      const result = bench.benchmarkDedup(null, 10);
      assert.equal(result.avg, 0);
      assert.equal(result.iterations, 10);
    });
  });

  // ─── benchmarkMemory ──────────────────────────────────────────────────

  describe('benchmarkMemory', () => {

    it('24. 内存估算: 返回正确的结构', () => {
      const result = bench.benchmarkMemory(sampleBookmarks);
      assert.ok(typeof result.totalBytes === 'number');
      assert.ok(typeof result.perBookmarkBytes === 'number');
      assert.equal(result.count, sampleBookmarks.length);
      assert.ok(result.breakdown !== undefined);
      assert.ok(typeof result.breakdown.ids === 'number');
      assert.ok(typeof result.breakdown.titles === 'number');
      assert.ok(typeof result.breakdown.urls === 'number');
    });

    it('25. 内存估算: totalBytes > 0 对于非空书签', () => {
      const result = bench.benchmarkMemory(sampleBookmarks);
      assert.ok(result.totalBytes > 0, 'totalBytes 应大于 0');
      assert.ok(result.perBookmarkBytes > 0, 'perBookmarkBytes 应大于 0');
    });

    it('26. 内存估算: 空数组返回零', () => {
      const result = bench.benchmarkMemory([]);
      assert.equal(result.totalBytes, 0);
      assert.equal(result.perBookmarkBytes, 0);
      assert.equal(result.count, 0);
    });

    it('27. 内存估算: null 输入返回零', () => {
      const result = bench.benchmarkMemory(null);
      assert.equal(result.totalBytes, 0);
      assert.equal(result.count, 0);
    });

    it('28. 内存估算: 100 书签 > 10 书签的内存', () => {
      const bms10 = generateBookmarks(10);
      const bms100 = generateBookmarks(100);
      const mem10 = bench.benchmarkMemory(bms10);
      const mem100 = bench.benchmarkMemory(bms100);
      assert.ok(mem100.totalBytes > mem10.totalBytes, '100 书签内存应大于 10 书签');
    });

    it('29. 内存估算: breakdown 各部分之和 = totalBytes', () => {
      const result = bench.benchmarkMemory(sampleBookmarks);
      const { ids, titles, urls, folderPaths, tags, overhead } = result.breakdown;
      const sum = ids + titles + urls + folderPaths + tags + overhead;
      assert.equal(sum, result.totalBytes, 'breakdown 之和应等于 totalBytes');
    });

    it('30. 内存估算: 10000 书签场景', () => {
      const bms = generateBookmarks(10000);
      const result = bench.benchmarkMemory(bms);
      assert.equal(result.count, 10000);
      assert.ok(result.totalBytes > 0);
      assert.ok(result.perBookmarkBytes > 0);
    });
  });
});
