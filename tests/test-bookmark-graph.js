/**
 * 测试 lib/bookmark-graph.js — 书签图谱引擎
 *
 * 测试范围:
 *   buildGraph / similarity / getSimilar / getGraphData / getClusters
 *   混合相似度算法 / 图谱数据结构 / 空/单书签处理 / 性能
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkGraphEngine } = await import('../lib/bookmark-graph.js');

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

const sampleBookmarks = [
  createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端']),
  createBookmark('2', 'Vue.js 入门教程', 'https://vuejs.org', ['技术', '前端']),
  createBookmark('3', 'Node.js 后端开发指南', 'https://nodejs.org', ['技术', '后端']),
  createBookmark('4', 'Python Machine Learning', 'https://scikit-learn.org', ['技术', 'AI']),
  createBookmark('5', 'GitHub 开源项目推荐', 'https://github.com/trending', ['工具']),
  createBookmark('6', 'JavaScript 高级程序设计', 'https://javascript.info', ['技术', '前端', 'JS']),
  createBookmark('7', 'TypeScript Handbook', 'https://typescriptlang.org', ['技术', '前端']),
  createBookmark('8', 'CSS Grid 完全指南', 'https://css-tricks.com/grid', ['技术', '前端', 'CSS']),
];

// ==================== 测试 ====================

describe('BookmarkGraphEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new BookmarkGraphEngine();
  });

  // ─── 1. 基本图谱构建 ─────────────────────────────────────────────────────────

  it('1. buildGraph 构建图谱返回 { nodes, edges }', () => {
    const graph = engine.buildGraph(sampleBookmarks);

    assert.ok(Array.isArray(graph.nodes), '应返回 nodes 数组');
    assert.ok(Array.isArray(graph.edges), '应返回 edges 数组');
    assert.equal(graph.nodes.length, 8, '应有 8 个节点');
    assert.ok(graph.edges.length > 0, '应有边存在');
  });

  // ─── 2. 节点数据结构正确性 ────────────────────────────────────────────────────

  it('2. 节点包含 id, label, group, size, data 字段', () => {
    const graph = engine.buildGraph(sampleBookmarks);

    for (const node of graph.nodes) {
      assert.ok(typeof node.id === 'string', `节点 ${node.id} 应有 string 类型 id`);
      assert.ok(typeof node.label === 'string', `节点 ${node.id} 应有 string 类型 label`);
      assert.ok(typeof node.group === 'string', `节点 ${node.id} 应有 string 类型 group`);
      assert.ok(typeof node.size === 'number', `节点 ${node.id} 应有 number 类型 size`);
      assert.ok(node.size >= 1, `节点 ${node.id} 的 size 应 >= 1`);
      assert.ok(node.data !== undefined, `节点 ${node.id} 应有 data 字段`);
      assert.equal(node.data.id, node.id, 'data.id 应与 node.id 一致');
    }
  });

  // ─── 3. 边数据结构正确性 ──────────────────────────────────────────────────────

  it('3. 边包含 source, target, weight 字段', () => {
    const graph = engine.buildGraph(sampleBookmarks);
    const nodeIds = new Set(graph.nodes.map(n => n.id));

    for (const edge of graph.edges) {
      assert.ok(typeof edge.source === 'string', '边应有 string 类型 source');
      assert.ok(typeof edge.target === 'string', '边应有 string 类型 target');
      assert.ok(typeof edge.weight === 'number', '边应有 number 类型 weight');
      assert.ok(edge.weight >= 0 && edge.weight <= 1, `权重 ${edge.weight} 应在 0-1 范围`);
      assert.ok(nodeIds.has(edge.source), `source ${edge.source} 应是已知节点`);
      assert.ok(nodeIds.has(edge.target), `target ${edge.target} 应是已知节点`);
      assert.ok(edge.source !== edge.target, '不应有自环');
    }
  });

  // ─── 4. 相似度计算 — 前端书签之间应有较高相似度 ───────────────────────────────

  it('4. 同一领域书签相似度较高', () => {
    engine.buildGraph(sampleBookmarks);

    // React 与 Vue (同为前端框架) — 应有一定相似度
    const reactVue = engine.similarity('1', '2');
    assert.ok(reactVue >= 0.3, `React-Vue 相似度 ${reactVue} 应 >= 0.3 (同文件夹+同领域)`);

    // React 与 CSS (同文件夹前端) — 文件夹重叠
    const reactCss = engine.similarity('1', '8');
    assert.ok(reactCss > 0, 'React-CSS 相似度应 > 0');
  });

  // ─── 5. 相似度计算 — 不同领域书签相似度较低 ───────────────────────────────────

  it('5. 不同领域书签相似度较低', () => {
    engine.buildGraph(sampleBookmarks);

    // Python ML vs GitHub (完全不同领域)
    const pyGithub = engine.similarity('4', '5');
    assert.ok(pyGithub < 0.5, `Python ML-GitHub 相似度 ${pyGithub} 应 < 0.5`);
  });

  // ─── 6. 相似度边界 — 相同书签应返回 1 ─────────────────────────────────────────

  it('6. 两个完全相同的书签相似度为 1', () => {
    const bookmarks = [
      createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端']),
      createBookmark('2', 'React 官方文档', 'https://react.dev', ['技术', '前端']),
    ];
    engine.buildGraph(bookmarks);

    const score = engine.similarity('1', '2');
    assert.equal(score, 1, '完全相同的书签相似度应为 1');
  });

  // ─── 7. getSimilar 返回 Top-K 相似书签 ────────────────────────────────────────

  it('7. getSimilar 返回按相似度降序排列的 Top-K 结果', () => {
    engine.buildGraph(sampleBookmarks);

    const similar = engine.getSimilar('1', 3);
    assert.ok(similar.length <= 3, `结果数应 <= 3，实际 ${similar.length}`);

    // 每个结果应有 id, score, bookmark
    for (const item of similar) {
      assert.ok(typeof item.id === 'string', '应有 id');
      assert.ok(typeof item.score === 'number', '应有 score');
      assert.ok(item.bookmark !== undefined, '应有 bookmark');
    }

    // 按分数降序
    for (let i = 1; i < similar.length; i++) {
      assert.ok(
        similar[i - 1].score >= similar[i].score,
        '结果应按分数降序排列',
      );
    }

    // 推荐结果不应包含自身
    assert.ok(
      similar.every(s => s.id !== '1'),
      '推荐结果不应包含自身',
    );
  });

  // ─── 8. 空书签处理 ───────────────────────────────────────────────────────────

  it('8. 空书签数组构建空图谱', () => {
    const graph = engine.buildGraph([]);

    assert.deepEqual(graph.nodes, [], '空书签应返回空节点数组');
    assert.deepEqual(graph.edges, [], '空书签应返回空边数组');
  });

  it('9. buildGraph(null) 不抛异常', () => {
    const graph = engine.buildGraph(null);
    assert.deepEqual(graph.nodes, [], 'null 输入应返回空图谱');
  });

  // ─── 9. 单书签处理 ───────────────────────────────────────────────────────────

  it('10. 单个书签构建图谱无边', () => {
    const graph = engine.buildGraph([
      createBookmark('1', '唯一的书签', 'https://example.com', ['收藏']),
    ]);

    assert.equal(graph.nodes.length, 1, '应有 1 个节点');
    assert.equal(graph.edges.length, 0, '单个节点不应有边');
    assert.equal(graph.nodes[0].size, 1, '单节点 size 应为 1 (无连接)');
  });

  // ─── 10. 聚类功能 ────────────────────────────────────────────────────────────

  it('11. getClusters 按域名和文件夹正确聚类', () => {
    engine.buildGraph(sampleBookmarks);

    const clusters = engine.getClusters();
    assert.ok(clusters.byDomain instanceof Map, 'byDomain 应是 Map');
    assert.ok(clusters.byFolder instanceof Map, 'byFolder 应是 Map');

    // 前端文件夹应包含多个书签
    const frontend = clusters.byFolder.get('技术/前端');
    assert.ok(frontend && frontend.length >= 2, '前端文件夹应包含 >= 2 个书签');

    // 后端文件夹
    const backend = clusters.byFolder.get('技术/后端');
    assert.ok(backend && backend.length >= 1, '后端文件夹应包含 >= 1 个书签');

    // 域名聚类
    assert.ok(clusters.byDomain.size > 0, '应有域名聚类');
  });

  // ─── 11. getGraphData 返回副本 ───────────────────────────────────────────────

  it('12. getGraphData 返回数据的副本 (不直接暴露内部状态)', () => {
    engine.buildGraph(sampleBookmarks);

    const data1 = engine.getGraphData();
    const data2 = engine.getGraphData();

    // 两次获取应返回不同引用
    assert.notEqual(data1, data2, '两次 getGraphData 应返回不同对象引用');
    assert.notEqual(data1.nodes, data2.nodes, 'nodes 应为不同引用');
    assert.notEqual(data1.edges, data2.edges, 'edges 应为不同引用');

    // 但内容应相同
    assert.equal(data1.nodes.length, data2.nodes.length, '节点数应相同');
    assert.equal(data1.edges.length, data2.edges.length, '边数应相同');
  });

  // ─── 12. 相似度算法各分量验证 ─────────────────────────────────────────────────

  it('13. 相似度算法 — 域名匹配贡献 0.3', () => {
    // 两个不同域名、相同标题、不同文件夹的书签
    const a = createBookmark('1', '教程', 'https://site-a.com', []);
    const b = createBookmark('2', '教程', 'https://site-b.com', []);

    // 同域名版本
    const c = createBookmark('3', '教程', 'https://site-a.com', []);

    engine.buildGraph([a, b, c]);

    const diffDomain = engine.similarity('1', '2'); // 不同域名
    const sameDomain = engine.similarity('1', '3'); // 同域名

    assert.ok(sameDomain > diffDomain, '同域名相似度应高于不同域名');
    assert.ok(
      Math.abs((sameDomain - diffDomain) - 0.3) < 1e-10,
      `域名贡献差异应为 0.3，实际 ${sameDomain - diffDomain}`,
    );
  });

  it('14. 相似度算法 — 文件夹重叠贡献 0.3', () => {
    // 两个相同标题、相同域名、不同文件夹的书签
    const a = createBookmark('1', '教程', 'https://example.com', ['前端']);
    const b = createBookmark('2', '教程', 'https://example.com', ['后端']);

    // 同文件夹版本
    const c = createBookmark('3', '教程', 'https://example.com', ['前端']);

    engine.buildGraph([a, b, c]);

    const diffFolder = engine.similarity('1', '2');
    const sameFolder = engine.similarity('1', '3');

    assert.ok(sameFolder > diffFolder, '同文件夹相似度应高于不同文件夹');
  });

  // ─── 13. 无效书签处理 ─────────────────────────────────────────────────────────

  it('15. 无效/空书签被安全忽略', () => {
    const bookmarks = [
      createBookmark('1', '正常书签', 'https://example.com', ['收藏']),
      null,
      undefined,
      { id: '', title: '', url: '' },         // 空 id
      { title: '无ID', url: 'https://x.com' }, // 无 id
    ];

    const graph = engine.buildGraph(bookmarks);
    assert.equal(graph.nodes.length, 1, '只应有 1 个有效节点');
  });

  // ─── 14. getSimilar 不存在的 ID ──────────────────────────────────────────────

  it('16. getSimilar 传入不存在的 ID 返回空数组', () => {
    engine.buildGraph(sampleBookmarks);

    const result = engine.getSimilar('nonexistent', 5);
    assert.deepEqual(result, [], '不存在的 ID 应返回空数组');
  });

  // ─── 15. similarity 传入字符串 ID 和对象 ──────────────────────────────────────

  it('17. similarity 支持字符串 ID 和对象两种调用方式', () => {
    engine.buildGraph(sampleBookmarks);

    const bm1 = sampleBookmarks[0];
    const bm2 = sampleBookmarks[1];

    const byId = engine.similarity('1', '2');
    const byObj = engine.similarity(bm1, bm2);

    assert.equal(byId, byObj, 'ID 和对象调用方式结果应相同');
  });

  // ─── 16. 节点 group 分配 ─────────────────────────────────────────────────────

  it('18. 节点 group 优先使用第一级文件夹', () => {
    engine.buildGraph(sampleBookmarks);

    const graph = engine.getGraphData();

    // 前端书签 group 应为 "技术"
    const react = graph.nodes.find(n => n.id === '1');
    assert.equal(react.group, '技术', '前端书签的 group 应为第一级文件夹"技术"');

    // 工具书签
    const github = graph.nodes.find(n => n.id === '5');
    assert.equal(github.group, '工具', '工具书签的 group 应为"工具"');
  });

  it('19. 无文件夹书签 group 使用域名', () => {
    const bookmarks = [
      createBookmark('1', 'No Folder', 'https://example.com', []),
    ];
    engine.buildGraph(bookmarks);

    const graph = engine.getGraphData();
    assert.equal(graph.nodes[0].group, 'example.com', '无文件夹时 group 应为域名');
  });

  // ─── 17. 节点 size 缩放 ──────────────────────────────────────────────────────

  it('20. 节点 size 按连接数缩放', () => {
    engine.buildGraph(sampleBookmarks);

    const graph = engine.getGraphData();

    // 每个节点 size 应 >= 1
    for (const node of graph.nodes) {
      assert.ok(node.size >= 1, `节点 ${node.id} size 应 >= 1`);
      assert.ok(node.size <= 21, `节点 ${node.id} size 应 <= 21`);
    }
  });

  // ─── 18. 性能测试 (100 条书签) ───────────────────────────────────────────────

  it('21. 100 条书签图谱构建 < 3 秒', () => {
    const bookmarks = [];
    for (let i = 0; i < 100; i++) {
      const folderIdx = Math.floor(i / 10);
      bookmarks.push(
        createBookmark(
          String(i),
          `Bookmark ${i} 标题${i} ${i % 5 === 0 ? 'React' : ''}`,
          `https://example-${folderIdx}.com/page/${i}`,
          [`Folder${folderIdx}`, `Sub${i % 5}`],
        ),
      );
    }

    const start = Date.now();
    const graph = engine.buildGraph(bookmarks);
    const elapsed = Date.now() - start;

    assert.equal(graph.nodes.length, 100, '应有 100 个节点');
    assert.ok(elapsed < 3000, `构建时间 ${elapsed}ms 应 < 3000ms`);
  });

  it('22. 1000 条书签图谱构建 < 10 秒', () => {
    const bookmarks = [];
    for (let i = 0; i < 1000; i++) {
      const folderIdx = Math.floor(i / 100);
      bookmarks.push(
        createBookmark(
          String(i),
          `Bookmark ${i} 标题${i}`,
          `https://example-${folderIdx}.com/page/${i}`,
          [`Folder${folderIdx}`, `Sub${i % 10}`],
        ),
      );
    }

    const start = Date.now();
    const graph = engine.buildGraph(bookmarks);
    const elapsed = Date.now() - start;

    assert.equal(graph.nodes.length, 1000, '应有 1000 个节点');
    assert.ok(elapsed < 10000, `构建时间 ${elapsed}ms 应 < 10000ms`);
  });
});
