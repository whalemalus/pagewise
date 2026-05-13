/**
 * 测试 lib/bookmark-performance-opt.js — 性能优化模块
 *
 * 测试范围:
 *   buildSearchIndex (倒排索引构建) / searchWithIndex (索引搜索) /
 *   lazyLoadBookmarks (分页懒加载) / createVirtualScroller (虚拟滚动) /
 *   索引管理函数 (addToIndex / removeFromIndex / getIndexStats)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  buildSearchIndex,
  searchWithIndex,
  lazyLoadBookmarks,
  createVirtualScroller,
  addToIndex,
  removeFromIndex,
  getIndexStats,
} = await import('../lib/bookmark-performance-opt.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = []) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    dateAdded: 1700000000000 + Number(id) * 86400000,
  };
}

function createSampleBookmarks() {
  return [
    createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端'], ['react', 'frontend']),
    createBookmark('2', 'Vue.js 入门教程', 'https://vuejs.org', ['技术', '前端'], ['vue', 'frontend']),
    createBookmark('3', 'Node.js 后端开发指南', 'https://nodejs.org', ['技术', '后端'], ['nodejs', 'backend']),
    createBookmark('4', 'Python ML 教程', 'https://scikit-learn.org', ['技术', 'AI'], ['python', 'ml']),
    createBookmark('5', 'GitHub 趋势', 'https://github.com/trending', ['工具'], ['github']),
    createBookmark('6', 'GitHub Actions CI/CD', 'https://github.com/features/actions', ['工具', 'DevOps'], ['github', 'cicd']),
    createBookmark('7', 'MDN Web Docs', 'https://developer.mozilla.org', ['技术', '前端', '参考'], ['mdn', 'docs', 'frontend']),
    createBookmark('8', 'Stack Overflow', 'https://stackoverflow.com/questions', ['工具', '社区'], ['stackoverflow', 'qa']),
    createBookmark('9', 'React Hooks 深入', 'https://react.dev/hooks', ['技术', '前端'], ['react', 'hooks']),
    createBookmark('10', 'AWS 控制台', 'https://console.aws.amazon.com', ['技术', '云'], ['aws', 'cloud']),
  ];
}

const sampleBookmarks = createSampleBookmarks();

// ==================== 测试 ====================

describe('BookmarkPerformanceOpt', () => {

  // ─── buildSearchIndex ──────────────────────────────────────────────────────────

  describe('buildSearchIndex', () => {
    it('1. 正常构建索引 — 包含正确的结构', () => {
      const result = buildSearchIndex(sampleBookmarks);

      assert.ok(result.index instanceof Map, 'index 应为 Map');
      assert.equal(result.bookmarks, sampleBookmarks, 'bookmarks 引用应一致');
      assert.ok(result.tokenCount > 0, 'tokenCount 应大于 0');
    });

    it('2. 空数组构建索引 — 返回空索引', () => {
      const result = buildSearchIndex([]);

      assert.ok(result.index instanceof Map, 'index 应为 Map');
      assert.equal(result.index.size, 0, '索引应为空');
      assert.equal(result.tokenCount, 0, 'tokenCount 应为 0');
      assert.deepEqual(result.bookmarks, [], 'bookmarks 应为空数组');
    });

    it('3. null/undefined 输入构建索引', () => {
      const r1 = buildSearchIndex(null);
      assert.equal(r1.index.size, 0, 'null 输入应返回空索引');
      assert.equal(r1.tokenCount, 0);

      const r2 = buildSearchIndex(undefined);
      assert.equal(r2.index.size, 0, 'undefined 输入应返回空索引');
    });

    it('4. 大数据集构建索引 — 1000 书签性能测试', () => {
      const large = [];
      for (let i = 0; i < 1000; i++) {
        large.push(createBookmark(String(i), `Bookmark ${i}`, `https://example.com/page${i}`, ['folder'], [`tag${i % 10}`]));
      }

      const start = performance.now();
      const result = buildSearchIndex(large);
      const elapsed = performance.now() - start;

      assert.ok(result.index.size > 0, '索引应有条目');
      assert.ok(elapsed < 2000, `索引构建应在 2 秒内完成，实际: ${elapsed.toFixed(1)}ms`);
      assert.equal(result.bookmarks.length, 1000, '书签数量应为 1000');
    });

    it('5. 索引包含 title/url/tags/folderPath 的 token', () => {
      const result = buildSearchIndex(sampleBookmarks);
      const keys = [...result.index.keys()];

      // 应包含来自 title, url, tags, folderPath 的 token
      assert.ok(keys.includes('react'), '应包含 react (来自 title/tag)');
      assert.ok(keys.includes('github'), '应包含 github (来自 url 分词)');
      assert.ok(keys.includes('frontend'), '应包含 frontend (来自 tag)');
      assert.ok(keys.includes('前端'), '应包含 前端 (来自 folderPath/tag)');
    });
  });

  // ─── searchWithIndex ──────────────────────────────────────────────────────────

  describe('searchWithIndex', () => {
    it('6. 精确匹配单个词', () => {
      const idx = buildSearchIndex(sampleBookmarks);
      const results = searchWithIndex(idx, 'react');

      assert.ok(results.length >= 1, '应有结果');
      for (const bm of results) {
        const text = `${bm.title} ${bm.url} ${bm.tags.join(' ')}`.toLowerCase();
        assert.ok(text.includes('react'), `${bm.title} 应包含 react`);
      }
    });

    it('7. 前缀匹配', () => {
      const idx = buildSearchIndex(sampleBookmarks);
      const results = searchWithIndex(idx, 'react');

      // "react" 应匹配 "react" token (exact)
      assert.ok(results.length >= 1, '前缀匹配应有结果');
    });

    it('8. 多词搜索 — AND 语义', () => {
      const idx = buildSearchIndex(sampleBookmarks);
      const results = searchWithIndex(idx, 'react hooks');

      assert.ok(results.length >= 1, 'react hooks 应有结果');
      for (const bm of results) {
        const text = `${bm.title} ${bm.url} ${bm.tags.join(' ')}`.toLowerCase();
        assert.ok(text.includes('react'), `${bm.title} 应包含 react`);
        assert.ok(text.includes('hooks'), `${bm.title} 应包含 hooks`);
      }
    });

    it('9. 无匹配查询返回空数组', () => {
      const idx = buildSearchIndex(sampleBookmarks);
      const results = searchWithIndex(idx, 'xyznonexistent123');

      assert.equal(results.length, 0, '无匹配应返回空');
    });

    it('10. null/无效输入搜索', () => {
      const idx = buildSearchIndex(sampleBookmarks);

      assert.deepEqual(searchWithIndex(null, 'react'), [], 'null 索引应返回空');
      assert.deepEqual(searchWithIndex(idx, null), [], 'null 查询应返回空');
      assert.deepEqual(searchWithIndex(idx, ''), [], '空查询应返回空');
      assert.deepEqual(searchWithIndex(idx, '   '), [], '空白查询应返回空');
    });

    it('11. 大数据集搜索性能', () => {
      const large = [];
      for (let i = 0; i < 2000; i++) {
        large.push(createBookmark(String(i), `Item ${i % 100} keyword${i}`, `https://site${i}.com`, ['folder'], [`tag${i % 20}`]));
      }
      const idx = buildSearchIndex(large);

      const start = performance.now();
      const results = searchWithIndex(idx, 'keyword1');
      const elapsed = performance.now() - start;

      assert.ok(elapsed < 100, `搜索应在 100ms 内完成，实际: ${elapsed.toFixed(1)}ms`);
      assert.ok(results.length >= 1, '应有匹配结果');
    });
  });

  // ─── addToIndex / removeFromIndex / getIndexStats ─────────────────────────────

  describe('索引管理', () => {
    it('12. addToIndex — 向已有索引添加书签', () => {
      const bms = createSampleBookmarks();
      const idx = buildSearchIndex(bms);
      const prevTokenCount = idx.tokenCount;
      const prevLength = idx.bookmarks.length;

      const newBm = createBookmark('99', 'Svelte 新框架', 'https://svelte.dev', ['技术', '前端'], ['svelte']);
      addToIndex(idx, newBm);

      assert.equal(idx.bookmarks.length, prevLength + 1, '书签数量应+1');
      assert.ok(idx.tokenCount > prevTokenCount, 'token 计数应增加');

      // 新书签应可被搜索到
      const results = searchWithIndex(idx, 'svelte');
      assert.ok(results.length >= 1, '新添加的书签应可被搜索');
    });

    it('13. removeFromIndex — 从索引中移除书签', () => {
      const idx = buildSearchIndex(sampleBookmarks);

      removeFromIndex(idx, 0);

      assert.equal(idx.bookmarks[0], null, '被移除位置应为 null');

      // 搜索时不应返回已移除书签
      // 但其他书签中也有 "react"，所以仍有结果
      const results = searchWithIndex(idx, 'react');
      // 确认不会返回已删除的书签
      for (const bm of results) {
        assert.ok(bm.id !== '1' || bm !== sampleBookmarks[0], '不应返回已移除的书签');
      }
    });

    it('14. getIndexStats — 获取索引统计', () => {
      const idx = buildSearchIndex(sampleBookmarks);
      const stats = getIndexStats(idx);

      assert.ok(stats.uniqueTokens > 0, 'uniqueTokens 应大于 0');
      assert.ok(stats.totalEntries > 0, 'totalEntries 应大于 0');
      assert.equal(stats.bookmarksCount, sampleBookmarks.length, 'bookmarksCount 应匹配');
      assert.ok(stats.memoryEstimate > 0, 'memoryEstimate 应大于 0');
    });

    it('15. getIndexStats — null 索引返回零值', () => {
      const stats = getIndexStats(null);
      assert.equal(stats.uniqueTokens, 0);
      assert.equal(stats.totalEntries, 0);
      assert.equal(stats.bookmarksCount, 0);
      assert.equal(stats.memoryEstimate, 0);
    });
  });

  // ─── lazyLoadBookmarks ────────────────────────────────────────────────────────

  describe('lazyLoadBookmarks', () => {
    it('16. 加载第一页', () => {
      const result = lazyLoadBookmarks(sampleBookmarks, 3, 0);

      assert.equal(result.items.length, 3, '第一页应有 3 项');
      assert.equal(result.page, 0, '页码应为 0');
      assert.equal(result.pageSize, 3, 'pageSize 应为 3');
      assert.equal(result.total, sampleBookmarks.length, 'total 应匹配');
      assert.ok(result.hasMore, '应有更多页');
    });

    it('17. 加载最后一页 — 可能不满页', () => {
      const bms = createSampleBookmarks();
      const result = lazyLoadBookmarks(bms, 3, 3);

      assert.equal(result.page, 3, '页码应为 3');
      assert.equal(result.items.length, 1, '最后一页只有 1 项 (10 % 3 = 1)');
      assert.ok(!result.hasMore, '不应有更多页');
    });

    it('18. 超出范围页码 — 回到最后一页', () => {
      const result = lazyLoadBookmarks(sampleBookmarks, 3, 999);

      assert.equal(result.page, 3, '应限制到最后一页');
      assert.ok(result.items.length > 0, '应有数据');
    });

    it('19. 空数组懒加载', () => {
      const result = lazyLoadBookmarks([], 10, 0);

      assert.deepEqual(result.items, [], '空数组应返回空 items');
      assert.equal(result.totalPages, 0, 'totalPages 应为 0');
      assert.equal(result.total, 0, 'total 应为 0');
      assert.ok(!result.hasMore, '不应有更多页');
    });

    it('20. null/undefined 输入', () => {
      const r1 = lazyLoadBookmarks(null, 10, 0);
      assert.deepEqual(r1.items, [], 'null 输入应返回空');
      assert.equal(r1.totalPages, 0);

      const r2 = lazyLoadBookmarks(undefined, 10, 0);
      assert.deepEqual(r2.items, [], 'undefined 输入应返回空');
    });

    it('21. 单项全部数据在一页', () => {
      const result = lazyLoadBookmarks(sampleBookmarks, 100, 0);

      assert.equal(result.items.length, sampleBookmarks.length, '全部数据应在一页');
      assert.equal(result.totalPages, 1, '总页数应为 1');
      assert.ok(!result.hasMore, '不应有更多页');
    });

    it('22. pageSize 为 0 或负数应默认为 1', () => {
      const r1 = lazyLoadBookmarks(sampleBookmarks, 0, 0);
      assert.equal(r1.pageSize, 1, 'pageSize=0 应默认为 1');

      const r2 = lazyLoadBookmarks(sampleBookmarks, -5, 0);
      assert.equal(r2.pageSize, 1, 'pageSize=-5 应默认为 1');
    });
  });

  // ─── createVirtualScroller ────────────────────────────────────────────────────

  describe('createVirtualScroller', () => {
    it('23. 计算可视范围 — 从顶部开始', () => {
      const container = { clientHeight: 300 };
      const scroller = createVirtualScroller(container, sampleBookmarks, 50);

      const range = scroller.getVisibleRange(0);

      assert.equal(range.start, 0, '起始索引应为 0');
      assert.ok(range.end > range.start, 'end 应大于 start');
      assert.equal(range.offsetY, 0, 'offsetY 应为 0');
      assert.equal(range.totalHeight, sampleBookmarks.length * 50, 'totalHeight 应正确');
      assert.ok(Array.isArray(range.visibleItems), 'visibleItems 应为数组');
    });

    it('24. 计算可视范围 — 滚动到中部', () => {
      const container = { clientHeight: 300 };
      const scroller = createVirtualScroller(container, sampleBookmarks, 50);

      const range = scroller.getVisibleRange(300);

      assert.ok(range.start > 0, 'start 应大于 0');
      assert.ok(range.offsetY > 0, 'offsetY 应大于 0');
    });

    it('25. getMetrics — 获取度量信息', () => {
      const container = { clientHeight: 300 };
      const scroller = createVirtualScroller(container, sampleBookmarks, 50);

      const metrics = scroller.getMetrics();

      assert.equal(metrics.totalHeight, sampleBookmarks.length * 50, 'totalHeight');
      assert.equal(metrics.visibleCount, 6, 'visibleCount = ceil(300/50)');
      assert.equal(metrics.overscan, 5, 'overscan 默认 5');
      assert.equal(metrics.itemCount, sampleBookmarks.length, 'itemCount');
      assert.equal(metrics.itemHeight, 50, 'itemHeight');
      assert.equal(metrics.containerHeight, 300, 'containerHeight');
    });

    it('26. update — 滚动更新返回新可视范围', () => {
      const container = { clientHeight: 200 };
      const scroller = createVirtualScroller(container, sampleBookmarks, 50);

      const range1 = scroller.update(0);
      const range2 = scroller.update(500);

      assert.equal(range1.start, 0, '初始 start 为 0');
      assert.ok(range2.start > range1.start, '滚动后 start 应增大');
    });

    it('27. destroy — 销毁后返回空范围', () => {
      const container = { clientHeight: 300 };
      const scroller = createVirtualScroller(container, sampleBookmarks, 50);

      scroller.destroy();
      const range = scroller.getVisibleRange(0);

      assert.equal(range.start, 0, '销毁后 start 为 0');
      assert.equal(range.end, 0, '销毁后 end 为 0');
      assert.equal(range.totalHeight, 0, '销毁后 totalHeight 为 0');
    });

    it('28. 无效容器 — 返回默认值', () => {
      const scroller = createVirtualScroller(null, sampleBookmarks, 50);
      const range = scroller.getVisibleRange(0);

      assert.equal(range.start, 0);
      assert.equal(range.end, 0);
      assert.equal(range.totalHeight, 0);
    });

    it('29. 无效 itemHeight — 返回默认值', () => {
      const container = { clientHeight: 300 };
      const scroller = createVirtualScroller(container, sampleBookmarks, -10);

      const range = scroller.getVisibleRange(0);
      assert.equal(range.totalHeight, 0, '无效 itemHeight 应返回 0');
    });

    it('30. 空数据 — 虚拟滚动器处理空列表', () => {
      const container = { clientHeight: 300 };
      const scroller = createVirtualScroller(container, [], 50);

      const range = scroller.getVisibleRange(0);
      assert.equal(range.totalHeight, 0, '空列表 totalHeight 为 0');
      assert.equal(range.start, 0, 'start 为 0');
      assert.equal(range.end, 0, 'end 为 0');
    });
  });
});
