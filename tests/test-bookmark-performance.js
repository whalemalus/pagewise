/**
 * 测试 lib/bookmark-performance.js — 性能优化器
 *
 * 测试范围:
 *   构造器 / buildGraphBatched / buildIndexBatched / computeSimilarityBatched
 *   createWorker / runInWorker / trimCache / getVisibleNodes / getPerformanceStats
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkPerformanceOptimizer } = await import('../lib/bookmark-performance.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = []) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    dateAdded: 1700000000000 + Number(id) * 1000,
    dateAddedISO: new Date(1700000000000 + Number(id) * 1000).toISOString(),
  };
}

function generateBookmarks(count) {
  const domains = ['react.dev', 'vuejs.org', 'nodejs.org', 'python.org', 'github.com',
    'css-tricks.com', 'typescriptlang.org', 'mozilla.org', 'stackoverflow.com', 'dev.to'];
  const topics = ['React', 'Vue', 'Node.js', 'Python', 'GitHub', 'CSS', 'TypeScript', 'MDN', 'StackOverflow', 'DevTo'];
  const bookmarks = [];
  for (let i = 0; i < count; i++) {
    const di = i % domains.length;
    const ti = i % topics.length;
    bookmarks.push(createBookmark(
      String(i),
      `${topics[ti]} 教程 #${i}`,
      `https://${domains[di]}/page/${i}`,
      ['技术', topics[ti]],
    ));
  }
  return bookmarks;
}

const sampleBookmarks = generateBookmarks(8);

// ==================== 测试 ====================

describe('BookmarkPerformanceOptimizer', () => {
  let optimizer;

  beforeEach(() => {
    optimizer = new BookmarkPerformanceOptimizer({ batchSize: 3, cacheMaxSize: 10, workerEnabled: false });
  });

  // ─── 1. 构造器与默认值 ─────────────────────────────────────────────────────

  it('1. 默认构造器参数正确', () => {
    const opt = new BookmarkPerformanceOptimizer();
    const stats = opt.getPerformanceStats();
    assert.equal(stats.batchSize, 500, '默认 batchSize 应为 500');
    assert.equal(stats.cacheMaxSize, 5000, '默认 cacheMaxSize 应为 5000');
    assert.equal(stats.workerEnabled, false, '默认 workerEnabled 应为 false');
    assert.equal(stats.buildTime, 0, '初始 buildTime 应为 0');
    assert.equal(stats.cacheHits, 0, '初始 cacheHits 应为 0');
    assert.equal(stats.cacheMisses, 0, '初始 cacheMisses 应为 0');
    assert.equal(stats.totalProcessed, 0, '初始 totalProcessed 应为 0');
  });

  it('2. 自定义构造器参数', () => {
    const opt = new BookmarkPerformanceOptimizer({ batchSize: 100, cacheMaxSize: 100, workerEnabled: true });
    const stats = opt.getPerformanceStats();
    assert.equal(stats.batchSize, 100);
    assert.equal(stats.cacheMaxSize, 100);
    assert.equal(stats.workerEnabled, true);
  });

  // ─── 3. buildGraphBatched 分批构建图谱 ────────────────────────────────────

  it('3. buildGraphBatched 分批构建图谱返回 { nodes, edges }', async () => {
    const graph = await optimizer.buildGraphBatched(sampleBookmarks);
    assert.ok(Array.isArray(graph.nodes), '应返回 nodes 数组');
    assert.ok(Array.isArray(graph.edges), '应返回 edges 数组');
    assert.equal(graph.nodes.length, 8, '应有 8 个节点');
    assert.ok(graph.edges.length > 0, '应有边存在');
  });

  it('4. buildGraphBatched 进度回调', async () => {
    const progressCalls = [];
    await optimizer.buildGraphBatched(sampleBookmarks, (progress) => {
      progressCalls.push({ ...progress });
    });
    assert.ok(progressCalls.length > 0, '应有进度回调');
    const last = progressCalls[progressCalls.length - 1];
    assert.equal(last.current, last.total, '最后进度 current 应等于 total');
  });

  it('5. buildGraphBatched 空书签返回空图谱', async () => {
    const graph = await optimizer.buildGraphBatched([]);
    assert.deepEqual(graph, { nodes: [], edges: [] });
  });

  // ─── 6. buildIndexBatched 分批构建索引 ────────────────────────────────────

  it('6. buildIndexBatched 分批构建索引', async () => {
    const indexer = await optimizer.buildIndexBatched(sampleBookmarks);
    assert.ok(indexer, '应返回 indexer 实例');
    // 验证索引确实包含书签
    const results = indexer.search('React');
    assert.ok(results.length > 0, '搜索 React 应有结果');
  });

  it('7. buildIndexBatched 进度回调', async () => {
    const progressCalls = [];
    await optimizer.buildIndexBatched(sampleBookmarks, (progress) => {
      progressCalls.push({ ...progress });
    });
    assert.ok(progressCalls.length > 0, '应有进度回调');
  });

  it('8. buildIndexBatched 空书签不报错', async () => {
    const indexer = await optimizer.buildIndexBatched([]);
    assert.ok(indexer, '应返回 indexer 实例');
    const results = indexer.search('test');
    assert.equal(results.length, 0, '空索引搜索无结果');
  });

  // ─── 9. computeSimilarityBatched 分批计算相似度 ──────────────────────────

  it('9. computeSimilarityBatched 分批计算相似度', async () => {
    const pairs = [
      { a: sampleBookmarks[0], b: sampleBookmarks[1] },
      { a: sampleBookmarks[2], b: sampleBookmarks[3] },
      { a: sampleBookmarks[4], b: sampleBookmarks[5] },
      { a: sampleBookmarks[6], b: sampleBookmarks[7] },
    ];
    const results = await optimizer.computeSimilarityBatched(pairs);
    assert.ok(Array.isArray(results), '应返回数组');
    assert.equal(results.length, 4, '应有 4 个结果');
    for (const r of results) {
      assert.ok(typeof r.similarity === 'number', '每个结果应有 similarity');
      assert.ok(r.similarity >= 0 && r.similarity <= 1, 'similarity 应在 0-1 之间');
      assert.ok(r.a && r.b, '每个结果应保留 a/b 对');
    }
  });

  it('10. computeSimilarityBatched 进度回调', async () => {
    const pairs = [
      { a: sampleBookmarks[0], b: sampleBookmarks[1] },
      { a: sampleBookmarks[2], b: sampleBookmarks[3] },
      { a: sampleBookmarks[4], b: sampleBookmarks[5] },
      { a: sampleBookmarks[6], b: sampleBookmarks[7] },
    ];
    const progressCalls = [];
    await optimizer.computeSimilarityBatched(pairs, (progress) => {
      progressCalls.push({ ...progress });
    });
    assert.ok(progressCalls.length > 0, '应有进度回调');
  });

  // ─── 11. trimCache LRU 缓存淘汰 ─────────────────────────────────────────

  it('11. trimCache 淘汰超出限制的缓存条目', () => {
    const cache = new Map();
    for (let i = 0; i < 20; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    const trimmed = optimizer.trimCache(cache, 10);
    assert.equal(trimmed.size, 10, '应保留 maxSize 个条目');
    // 最新添加的应保留 (LRU: 保留后插入的)
    assert.ok(trimmed.has('key19'), '应保留最新条目 key19');
    assert.ok(!trimmed.has('key0'), '应淘汰最旧条目 key0');
  });

  it('12. trimCache 未超出限制时不淘汰', () => {
    const cache = new Map();
    cache.set('a', 1);
    cache.set('b', 2);
    const trimmed = optimizer.trimCache(cache, 10);
    assert.equal(trimmed.size, 2, '未超出时应保留全部');
  });

  // ─── 13. getVisibleNodes 视口裁剪 ────────────────────────────────────────

  it('13. getVisibleNodes 只返回视口内的节点', () => {
    const nodes = [
      { id: '1', x: 100, y: 100, label: 'A' },
      { id: '2', x: 500, y: 500, label: 'B' },
      { id: '3', x: 1000, y: 1000, label: 'C' },
      { id: '4', x: 50, y: 50, label: 'D' },
    ];
    const viewport = { x: 0, y: 0, width: 200, height: 200 };
    const visible = optimizer.getVisibleNodes(nodes, viewport);
    assert.equal(visible.length, 2, '视口内应有 2 个节点');
    for (const node of visible) {
      assert.ok(node.x >= viewport.x && node.x <= viewport.x + viewport.width,
        `节点 ${node.id} x 应在视口范围内`);
      assert.ok(node.y >= viewport.y && node.y <= viewport.y + viewport.height,
        `节点 ${node.id} y 应在视口范围内`);
    }
  });

  it('14. getVisibleNodes 空视口返回空数组', () => {
    const nodes = [{ id: '1', x: 100, y: 100 }];
    const visible = optimizer.getVisibleNodes(nodes, { x: 9999, y: 9999, width: 10, height: 10 });
    assert.equal(visible.length, 0, '视口外应无节点');
  });

  it('15. getVisibleNodes 带 padding 可以包含部分边缘节点', () => {
    const nodes = [
      { id: '1', x: 210, y: 100, label: 'A' },
      { id: '2', x: 500, y: 500, label: 'B' },
    ];
    const viewport = { x: 0, y: 0, width: 200, height: 200 };
    // 不带 padding 时 node 1 (x=210) 在视口外
    const noPadVisible = optimizer.getVisibleNodes(nodes, viewport, 0);
    assert.equal(noPadVisible.length, 0, '无 padding 时边缘节点不可见');
    // 带 padding=20 时 node 1 (x=210) 在扩展视口内
    const withPadVisible = optimizer.getVisibleNodes(nodes, viewport, 20);
    assert.equal(withPadVisible.length, 1, '有 padding 时边缘节点可见');
  });

  // ─── 16. getPerformanceStats 性能统计 ─────────────────────────────────────

  it('16. getPerformanceStats 记录处理后的统计', async () => {
    await optimizer.buildGraphBatched(sampleBookmarks);
    const stats = optimizer.getPerformanceStats();
    assert.ok(stats.buildTime > 0, 'buildTime 应 > 0');
    assert.equal(stats.totalProcessed, 8, 'totalProcessed 应为 8');
    assert.equal(stats.batchCount, 3, 'batchCount 应为 ceil(8/3)=3');
  });

  // ─── 17. createWorker 创建 Worker 封装 ───────────────────────────────────

  it('17. createWorker 返回 Worker 接口对象', () => {
    const workerWrapper = optimizer.createWorker();
    assert.ok(workerWrapper, '应返回 Worker 封装');
    assert.equal(typeof workerWrapper.postMessage, 'function', '应有 postMessage 方法');
    assert.equal(typeof workerWrapper.terminate, 'function', '应有 terminate 方法');
  });

  // ─── 18. runInWorker 在 Worker 中执行操作 ────────────────────────────────

  it('18. runInWorker 运行操作并返回结果', async () => {
    const result = await optimizer.runInWorker('computeSimilarity', {
      pairs: [
        { a: sampleBookmarks[0], b: sampleBookmarks[1] },
      ],
    });
    assert.ok(result, '应返回结果');
    assert.ok(Array.isArray(result), '结果应为数组');
    assert.equal(result.length, 1, '应有 1 个结果');
    assert.ok(typeof result[0].similarity === 'number', '结果应有 similarity');
  });

  // ─── 19. 边界: 无效输入 ──────────────────────────────────────────────────

  it('19. buildGraphBatched 处理非数组输入', async () => {
    const graph = await optimizer.buildGraphBatched(null);
    assert.deepEqual(graph, { nodes: [], edges: [] }, 'null 应返回空图谱');
  });

  it('20. computeSimilarityBatched 空对列表', async () => {
    const results = await optimizer.computeSimilarityBatched([]);
    assert.deepEqual(results, [], '空对列表应返回空数组');
  });
});
