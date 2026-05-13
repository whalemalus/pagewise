/**
 * BookmarkPerformanceBenchmark — 性能基准测试工具
 *
 * 对书签核心操作（搜索、排序、去重）进行基准测试，
 * 提供延迟统计（avg/min/max/p50/p95/p99）和内存估算。
 *
 * 用法:
 *   const bench = new BookmarkPerformanceBenchmark();
 *   const searchResult = bench.benchmarkSearch(bookmarks, 'react', 100);
 *   // → { avg: 1.23, min: 0.8, max: 2.1, p50: 1.1, p95: 1.9, p99: 2.05 }
 */

import { BookmarkIndexer } from './bookmark-indexer.js';
import { BookmarkDedup } from './bookmark-dedup.js';

// ==================== BookmarkPerformanceBenchmark ====================

export class BookmarkPerformanceBenchmark {

  // ==================== 搜索基准测试 ====================

  /**
   * 对书签搜索操作进行基准测试
   *
   * 流程:
   *   1. 建立索引（不计入基准时间）
   *   2. 运行 iterations 次搜索，记录每次延迟
   *   3. 返回统计数据
   *
   * @param {Object[]} bookmarks — 书签数组
   * @param {string}   query    — 搜索关键词
   * @param {number}   [iterations=100] — 测试迭代次数
   * @returns {{ avg: number, min: number, max: number, p50: number, p95: number, p99: number, iterations: number }}
   */
  benchmarkSearch(bookmarks, query, iterations = 100) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return this._emptyResult(iterations);
    }
    if (!query || typeof query !== 'string') {
      return this._emptyResult(iterations);
    }
    if (iterations <= 0) {
      return this._emptyResult(iterations);
    }

    // 预建索引（不计入基准时间）
    const indexer = new BookmarkIndexer();
    indexer.buildIndex(bookmarks);

    const latencies = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      indexer.search(query);
      const elapsed = performance.now() - start;
      latencies.push(elapsed);
    }

    return this._computeStats(latencies);
  }

  // ==================== 排序基准测试 ====================

  /**
   * 对书签排序操作进行基准测试
   *
   * 测试按 dateAdded 降序排序（最常见的书签排序场景）。
   *
   * @param {Object[]} bookmarks — 书签数组
   * @param {number}   [iterations=100] — 测试迭代次数
   * @returns {{ avg: number, min: number, max: number, p50: number, p95: number, p99: number, iterations: number }}
   */
  benchmarkSort(bookmarks, iterations = 100) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return this._emptyResult(iterations);
    }
    if (iterations <= 0) {
      return this._emptyResult(iterations);
    }

    const latencies = [];

    for (let i = 0; i < iterations; i++) {
      // 每次使用副本，避免原地排序影响后续迭代
      const copy = [...bookmarks];

      const start = performance.now();
      copy.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      const elapsed = performance.now() - start;

      latencies.push(elapsed);
    }

    return this._computeStats(latencies);
  }

  // ==================== 去重基准测试 ====================

  /**
   * 对书签去重操作进行基准测试
   *
   * 测试 findByExactUrl（URL 精确去重）的性能。
   *
   * @param {Object[]} bookmarks — 书签数组
   * @param {number}   [iterations=100] — 测试迭代次数
   * @returns {{ avg: number, min: number, max: number, p50: number, p95: number, p99: number, iterations: number }}
   */
  benchmarkDedup(bookmarks, iterations = 100) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return this._emptyResult(iterations);
    }
    if (iterations <= 0) {
      return this._emptyResult(iterations);
    }

    const latencies = [];

    for (let i = 0; i < iterations; i++) {
      const dedup = new BookmarkDedup(bookmarks);

      const start = performance.now();
      dedup.findByExactUrl();
      const elapsed = performance.now() - start;

      latencies.push(elapsed);
    }

    return this._computeStats(latencies);
  }

  // ==================== 内存估算 ====================

  /**
   * 估算书签数据结构的内存占用
   *
   * 采用简化估算模型:
   *   - 字符串: ~2 bytes per char (UTF-16)
   *   - 数组开销: 64 bytes + 每元素 8 bytes (引用)
   *   - 对象开销: 96 bytes + 属性名和值的估算
   *
   * @param {Object[]} [bookmarks] — 可选，传入则估算特定数组；不传则返回空结构估算
   * @returns {{ totalBytes: number, perBookmarkBytes: number, count: number, breakdown: Object }}
   */
  benchmarkMemory(bookmarks) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return {
        totalBytes: 0,
        perBookmarkBytes: 0,
        count: 0,
        breakdown: { ids: 0, titles: 0, urls: 0, folderPaths: 0, tags: 0, overhead: 0 },
      };
    }

    let ids = 0;
    let titles = 0;
    let urls = 0;
    let folderPaths = 0;
    let tags = 0;
    let overhead = 0;

    for (const bm of bookmarks) {
      // 对象本身的开销
      overhead += 96;

      // id (string)
      if (bm.id) {
        ids += 48 + bm.id.length * 2;
      }

      // title (string)
      if (bm.title) {
        titles += 48 + bm.title.length * 2;
      }

      // url (string)
      if (bm.url) {
        urls += 48 + bm.url.length * 2;
      }

      // folderPath (array of strings)
      if (Array.isArray(bm.folderPath)) {
        folderPaths += 64 + bm.folderPath.length * 8;
        for (const folder of bm.folderPath) {
          if (typeof folder === 'string') {
            folderPaths += 48 + folder.length * 2;
          }
        }
      }

      // tags (array of strings)
      if (Array.isArray(bm.tags)) {
        tags += 64 + bm.tags.length * 8;
        for (const tag of bm.tags) {
          if (typeof tag === 'string') {
            tags += 48 + tag.length * 2;
          }
        }
      }

      // 其他属性 (dateAdded, dateAddedISO 等)
      overhead += 40;
    }

    const breakdown = { ids, titles, urls, folderPaths, tags, overhead };
    const totalBytes = ids + titles + urls + folderPaths + tags + overhead;

    return {
      totalBytes,
      perBookmarkBytes: Math.round(totalBytes / bookmarks.length),
      count: bookmarks.length,
      breakdown,
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 计算延迟统计数据
   *
   * @param {number[]} latencies — 每次迭代的延迟（ms）
   * @returns {{ avg: number, min: number, max: number, p50: number, p95: number, p99: number, iterations: number }}
   * @private
   */
  _computeStats(latencies) {
    if (!latencies || latencies.length === 0) {
      return this._emptyResult(0);
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    return {
      avg: sum / n,
      min: sorted[0],
      max: sorted[n - 1],
      p50: this._percentile(sorted, 50),
      p95: this._percentile(sorted, 95),
      p99: this._percentile(sorted, 99),
      iterations: n,
    };
  }

  /**
   * 计算百分位数（线性插值）
   *
   * @param {number[]} sorted — 已排序的数组
   * @param {number}   p      — 百分位 (0-100)
   * @returns {number}
   * @private
   */
  _percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];

    const rank = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);

    if (lower === upper) return sorted[lower];

    const frac = rank - lower;
    return sorted[lower] * (1 - frac) + sorted[upper] * frac;
  }

  /**
   * 返回空结果（无数据时的默认值）
   *
   * @param {number} iterations
   * @returns {{ avg: number, min: number, max: number, p50: number, p95: number, p99: number, iterations: number }}
   * @private
   */
  _emptyResult(iterations) {
    return {
      avg: 0,
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      iterations: iterations || 0,
    };
  }
}

export default BookmarkPerformanceBenchmark;
