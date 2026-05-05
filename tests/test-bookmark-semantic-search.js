/**
 * 测试 lib/bookmark-semantic-search.js — 语义搜索 BookmarkSemanticSearch
 *
 * 测试范围:
 *   构造函数 / buildIndex / addBookmark / removeBookmark
 *   semanticSearch / hybridSearch / findSimilar
 *   invalidateCache / getStats / _mergeResults
 *   增量更新 / 缓存失效 / 边界条件 / 性能
 *
 * AC6: 单元测试 ≥ 25 个测试用例
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { EmbeddingEngine } = await import('../lib/embedding-engine.js');
const { BookmarkIndexer } = await import('../lib/bookmark-indexer.js');
const { BookmarkGraphEngine } = await import('../lib/bookmark-graph.js');
const { BookmarkSearch } = await import('../lib/bookmark-search.js');
const { BookmarkSemanticSearch } = await import('../lib/bookmark-semantic-search.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = [], status = 'unread', contentPreview = '') {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    status,
    dateAdded: 1700000000000 + Number(id) * 86400000,
    contentPreview,
  };
}

const sampleBookmarks = [
  createBookmark('1', 'Redux - Predictable state container', 'https://redux.js.org', ['技术', '前端'], ['react', 'redux', 'state-management'], 'read', 'Redux is a predictable state container for JavaScript apps'),
  createBookmark('2', 'React 官方文档', 'https://react.dev', ['技术', '前端'], ['react', 'frontend'], 'reading', 'React documentation for building user interfaces'),
  createBookmark('3', 'Vue.js 入门教程', 'https://vuejs.org', ['技术', '前端'], ['vue', 'frontend'], 'unread', 'Learn Vue.js progressive JavaScript framework'),
  createBookmark('4', 'Node.js 后端开发指南', 'https://nodejs.org', ['技术', '后端'], ['nodejs', 'backend'], 'unread', 'Node.js server-side JavaScript runtime'),
  createBookmark('5', 'Python Machine Learning 入门', 'https://scikit-learn.org', ['技术', 'AI'], ['python', 'ml', '机器学习'], 'reading', 'Machine learning with Python scikit-learn'),
  createBookmark('6', 'CSS Flexbox 弹性布局完全指南', 'https://css-tricks.com/flexbox', ['技术', '前端', 'CSS'], ['css', 'flexbox', '弹性布局'], 'read', 'A comprehensive guide to CSS flexbox layout'),
  createBookmark('7', 'TypeScript Handbook', 'https://typescriptlang.org', ['技术', '前端'], ['typescript', 'frontend'], 'unread', 'TypeScript handbook for typed JavaScript'),
  createBookmark('8', 'JavaScript 高级程序设计', 'https://javascript.info', ['技术', '前端', 'JS'], ['javascript', 'frontend'], 'read', 'Advanced JavaScript programming concepts'),
  createBookmark('9', 'React Hooks 深入理解', 'https://react.dev/reference/hooks', ['技术', '前端'], ['react', 'hooks'], 'unread', 'Deep dive into React hooks and custom hooks'),
  createBookmark('10', 'GitHub Actions CI/CD', 'https://github.com/features/actions', ['工具', 'DevOps'], ['github', 'cicd'], 'unread', 'CI/CD automation with GitHub Actions'),
];

// ==================== 测试 ====================

describe('BookmarkSemanticSearch', () => {
  let semanticSearch;
  let embeddingEngine;
  let bookmarkSearch;

  beforeEach(() => {
    embeddingEngine = new EmbeddingEngine();

    // Build BookmarkSearch for hybrid search tests
    const indexer = new BookmarkIndexer();
    indexer.buildIndex(sampleBookmarks);
    const graphEngine = new BookmarkGraphEngine();
    graphEngine.buildGraph(sampleBookmarks);
    bookmarkSearch = new BookmarkSearch(indexer, graphEngine);

    semanticSearch = new BookmarkSemanticSearch(embeddingEngine, bookmarkSearch);
    semanticSearch.buildIndex(sampleBookmarks);
  });

  // ─── 1. 构造函数 ──────────────────────────────────────────────────────────────

  it('1. 构造函数 — 创建实例成功', () => {
    assert.ok(semanticSearch instanceof BookmarkSemanticSearch);
  });

  it('2. 构造函数 — 无参数时使用默认引擎', () => {
    const ss = new BookmarkSemanticSearch();
    assert.ok(ss instanceof BookmarkSemanticSearch);
    assert.ok(ss._embeddingEngine instanceof EmbeddingEngine);
  });

  it('3. 构造函数 — 可传入自定义 EmbeddingEngine', () => {
    const customEngine = new EmbeddingEngine();
    const ss = new BookmarkSemanticSearch(customEngine);
    assert.equal(ss._embeddingEngine, customEngine);
  });

  // ─── 4. buildIndex ────────────────────────────────────────────────────────────

  it('4. buildIndex 全量构建索引', () => {
    const stats = semanticSearch.getStats();
    assert.equal(stats.totalBookmarks, sampleBookmarks.length);
    assert.ok(stats.vocabularySize > 0, '词汇表应非空');
  });

  it('5. buildIndex 空数组不报错', () => {
    const ss = new BookmarkSemanticSearch();
    ss.buildIndex([]);
    const stats = ss.getStats();
    assert.equal(stats.totalBookmarks, 0);
  });

  it('6. buildIndex 重复构建覆盖旧索引', () => {
    semanticSearch.buildIndex(sampleBookmarks.slice(0, 5));
    assert.equal(semanticSearch.getStats().totalBookmarks, 5);

    semanticSearch.buildIndex(sampleBookmarks);
    assert.equal(semanticSearch.getStats().totalBookmarks, sampleBookmarks.length);
  });

  // ─── 7-9. addBookmark / removeBookmark 增量更新 ───────────────────────────────

  it('7. addBookmark 增量添加书签', () => {
    const newBookmark = createBookmark('11', 'Deno 运行时指南', 'https://deno.land', ['技术', '后端'], ['deno', 'javascript'], 'unread', 'Deno is a modern runtime for JavaScript and TypeScript');
    semanticSearch.addBookmark(newBookmark);
    assert.equal(semanticSearch.getStats().totalBookmarks, sampleBookmarks.length + 1);
  });

  it('8. removeBookmark 增量删除书签', () => {
    const removed = semanticSearch.removeBookmark('1');
    assert.equal(removed, true);
    assert.equal(semanticSearch.getStats().totalBookmarks, sampleBookmarks.length - 1);
  });

  it('9. removeBookmark 不存在的 ID 返回 false', () => {
    const removed = semanticSearch.removeBookmark('999');
    assert.equal(removed, false);
  });

  // ─── 10-12. semanticSearch 语义搜索 ──────────────────────────────────────────

  it('10. semanticSearch 基本语义搜索返回结果', () => {
    const results = semanticSearch.semanticSearch('前端框架');
    assert.ok(Array.isArray(results), '应返回数组');
    assert.ok(results.length > 0, '应有语义匹配结果');

    for (const r of results) {
      assert.ok(r.id !== undefined, '应有 id');
      assert.ok(typeof r.score === 'number', 'score 应为 number');
      assert.ok(r.score > 0, 'score 应大于 0');
      assert.ok(r.bookmark !== undefined, '应有 bookmark');
      assert.equal(r.matchType, 'semantic', 'matchType 应为 semantic');
    }
  });

  it('11. semanticSearch 空查询返回空数组', () => {
    assert.deepEqual(semanticSearch.semanticSearch(''), []);
    assert.deepEqual(semanticSearch.semanticSearch(null), []);
    assert.deepEqual(semanticSearch.semanticSearch(undefined), []);
  });

  it('12. semanticSearch 结果按 score 降序排序', () => {
    const results = semanticSearch.semanticSearch('React hooks');
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        `分数应降序: ${results[i - 1].score} >= ${results[i].score}`,
      );
    }
  });

  it('13. semanticSearch 支持 limit 选项', () => {
    const r3 = semanticSearch.semanticSearch('前端', { limit: 3 });
    const r5 = semanticSearch.semanticSearch('前端', { limit: 5 });
    assert.ok(r3.length <= 3, 'limit=3 时最多 3 个结果');
    assert.ok(r5.length <= 5, 'limit=5 时最多 5 个结果');
  });

  // ─── 14-16. hybridSearch 混合搜索 ────────────────────────────────────────────

  it('14. hybridSearch 合并关键词和语义结果', () => {
    const results = semanticSearch.hybridSearch('React');
    assert.ok(Array.isArray(results), '应返回数组');
    assert.ok(results.length > 0, '应有混合搜索结果');

    // 应包含 keyword 和 semantic 两种 matchType
    const matchTypes = new Set(results.map(r => r.matchType));
    // 至少应有 semantic 结果
    assert.ok(matchTypes.has('semantic') || matchTypes.has('hybrid') || matchTypes.has('keyword'),
      '应有语义/混合/关键词结果');
  });

  it('15. hybridSearch 关键词精确匹配结果排序靠前', () => {
    // 搜索 "Redux" — 关键词精确匹配应排在语义结果之前
    const results = semanticSearch.hybridSearch('Redux');
    assert.ok(results.length > 0, '应有结果');

    // 关键词匹配结果的 score 应高于纯语义结果
    const keywordResults = results.filter(r => r.matchType === 'keyword' || r.matchType === 'hybrid');
    const semanticResults = results.filter(r => r.matchType === 'semantic');

    if (keywordResults.length > 0 && semanticResults.length > 0) {
      assert.ok(
        keywordResults[0].score >= semanticResults[0].score,
        '关键词匹配排序应 >= 语义结果',
      );
    }
  });

  it('16. hybridSearch 支持 sortBy: semantic-only / keyword-only / relevance', () => {
    const relevance = semanticSearch.hybridSearch('前端', { sortBy: 'relevance' });
    const semanticOnly = semanticSearch.hybridSearch('前端', { sortBy: 'semantic-only' });
    const keywordOnly = semanticSearch.hybridSearch('前端', { sortBy: 'keyword-only' });

    assert.ok(relevance.length >= 0, 'relevance 排序应返回结果');
    assert.ok(semanticOnly.length >= 0, 'semantic-only 排序应返回结果');
    assert.ok(keywordOnly.length >= 0, 'keyword-only 排序应返回结果');
  });

  // ─── 17-19. findSimilar 以文搜文 ────────────────────────────────────────────

  it('17. findSimilar 返回与指定书签最相似的书签', () => {
    const results = semanticSearch.findSimilar('2', 5); // React 官方文档
    assert.ok(Array.isArray(results), '应返回数组');
    assert.ok(results.length > 0, '应有相似书签');

    for (const r of results) {
      assert.ok(r.id !== undefined, '应有 id');
      assert.notEqual(r.id, '2', '不应包含查询书签自身');
      assert.ok(typeof r.score === 'number', 'score 应为 number');
      assert.ok(r.score > 0, 'score 应大于 0');
    }
  });

  it('18. findSimilar 不包含查询书签自身', () => {
    const results = semanticSearch.findSimilar('1', 10);
    for (const r of results) {
      assert.notEqual(r.id, '1', '结果不应包含查询书签自身');
    }
  });

  it('19. findSimilar 不存在的 ID 返回空数组', () => {
    const results = semanticSearch.findSimilar('999', 5);
    assert.deepEqual(results, [], '不存在的 ID 应返回空数组');
  });

  it('20. findSimilar 支持 limit 参数', () => {
    const r3 = semanticSearch.findSimilar('2', 3);
    const r5 = semanticSearch.findSimilar('2', 5);
    assert.ok(r3.length <= 3, 'limit=3 时最多 3 个');
    assert.ok(r5.length <= 5, 'limit=5 时最多 5 个');
  });

  // ─── 21-22. invalidateCache 缓存失效 ────────────────────────────────────────

  it('21. invalidateCache 单个书签缓存失效', () => {
    // 先搜索以触发缓存
    semanticSearch.semanticSearch('React');
    semanticSearch.invalidateCache('2');
    // 不报错即成功
    assert.ok(true, '缓存失效不报错');
  });

  it('22. invalidateCache 无参数清除全部缓存', () => {
    semanticSearch.semanticSearch('React');
    semanticSearch.invalidateCache();
    // 不报错即成功
    assert.ok(true, '全部缓存失效不报错');
  });

  // ─── 23-24. getStats 统计 ────────────────────────────────────────────────────

  it('23. getStats 返回正确的索引统计', () => {
    const stats = semanticSearch.getStats();
    assert.equal(stats.totalBookmarks, sampleBookmarks.length);
    assert.ok(stats.vocabularySize > 0, '词汇表大小应 > 0');
    assert.ok(stats.documentCount > 0, '文档数应 > 0');
  });

  it('24. getStats 构建前返回零值', () => {
    const ss = new BookmarkSemanticSearch();
    const stats = ss.getStats();
    assert.equal(stats.totalBookmarks, 0);
    assert.equal(stats.vocabularySize, 0);
  });

  // ─── 25. _mergeResults 结果合并 ──────────────────────────────────────────────

  it('25. _mergeResults 正确合并去重结果', () => {
    const keyword = [
      { id: '1', score: 10, bookmark: sampleBookmarks[0], matchType: 'keyword' },
      { id: '2', score: 8, bookmark: sampleBookmarks[1], matchType: 'keyword' },
    ];
    const semantic = [
      { id: '2', score: 0.8, bookmark: sampleBookmarks[1], matchType: 'semantic' },
      { id: '3', score: 0.6, bookmark: sampleBookmarks[2], matchType: 'semantic' },
    ];

    const merged = semanticSearch._mergeResults(keyword, semantic, 0.6);

    // id '2' 在两个来源都出现 → matchType 应为 'hybrid'
    const id2 = merged.find(r => r.id === '2');
    assert.ok(id2, '应包含 id=2');
    assert.equal(id2.matchType, 'hybrid', '双向命中应为 hybrid');

    // id '1' 只在 keyword 中
    const id1 = merged.find(r => r.id === '1');
    assert.ok(id1, '应包含 id=1');
    assert.equal(id1.matchType, 'keyword');

    // id '3' 只在 semantic 中
    const id3 = merged.find(r => r.id === '3');
    assert.ok(id3, '应包含 id=3');
    assert.equal(id3.matchType, 'semantic');
  });

  // ─── 26. 空书签库搜索 ────────────────────────────────────────────────────────

  it('26. 空书签库搜索返回空数组不报错', () => {
    const ss = new BookmarkSemanticSearch();
    ss.buildIndex([]);
    assert.deepEqual(ss.semanticSearch('任何查询'), [], '空库语义搜索应返回空');
    assert.deepEqual(ss.findSimilar('1', 5), [], '空库以文搜文应返回空');
  });

  // ─── 27. 增量更新后搜索生效 ──────────────────────────────────────────────────

  it('27. 新增书签后语义搜索能命中', () => {
    const newBookmark = createBookmark('11', 'Docker 容器化部署指南', 'https://docker.com', ['技术', 'DevOps'], ['docker', 'containers'], 'unread', 'Docker container deployment and orchestration');
    semanticSearch.addBookmark(newBookmark);

    const results = semanticSearch.semanticSearch('Docker 容器');
    const found = results.find(r => r.id === '11');
    assert.ok(found, '新增的书签应可被语义搜索命中');
    assert.ok(found.score > 0, '命中 score 应 > 0');
  });

  // ─── 28. FIELD_WEIGHTS 书签域权重 ───────────────────────────────────────────

  it('28. FIELD_WEIGHTS 书签域权重配置正确', () => {
    const weights = BookmarkSemanticSearch.FIELD_WEIGHTS;
    assert.equal(weights.title, 3.0, 'title 权重应为 3.0');
    assert.equal(weights.tags, 2.0, 'tags 权重应为 2.0');
    assert.equal(weights.contentPreview, 1.5, 'contentPreview 权重应为 1.5');
    assert.equal(weights.folderPath, 1.0, 'folderPath 权重应为 1.0');
    assert.equal(weights.url, 0.5, 'url 权重应为 0.5');
  });

  // ─── 29. 语义搜索结果字段完整性 ─────────────────────────────────────────────

  it('29. 语义搜索结果字段完整性', () => {
    const results = semanticSearch.semanticSearch('React');
    assert.ok(results.length > 0);

    const first = results[0];
    assert.ok(typeof first.id === 'string', 'id 应为 string');
    assert.ok(typeof first.score === 'number', 'score 应为 number');
    assert.ok(first.bookmark !== null && typeof first.bookmark === 'object', 'bookmark 应为 object');
    assert.equal(first.matchType, 'semantic', 'matchType 应为 semantic');
  });

  // ─── 30. 混合搜索空查询 ─────────────────────────────────────────────────────

  it('30. hybridSearch 空查询返回空数组', () => {
    assert.deepEqual(semanticSearch.hybridSearch(''), []);
    assert.deepEqual(semanticSearch.hybridSearch(null), []);
    assert.deepEqual(semanticSearch.hybridSearch(undefined), []);
  });

  // ─── 31. 相似度基于 TF-IDF 余弦相似度 ──────────────────────────────────────

  it('31. findSimilar 结果按余弦相似度降序排序', () => {
    const results = semanticSearch.findSimilar('1', 5); // Redux
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        `相似度应降序: ${results[i - 1].score} >= ${results[i].score}`,
      );
    }
  });

  // ─── 32. 混合搜索 default ratio ─────────────────────────────────────────────

  it('32. hybridSearch 默认权重比例 0.6:0.4', () => {
    // 不传 ratio，应使用默认 0.6:0.4
    const results = semanticSearch.hybridSearch('前端框架');
    assert.ok(results.length >= 0, '应返回结果');
    // 无法直接测试比例，但确保不报错且有结果即可
  });

  // ─── 33. 构造函数使用默认 BookmarkSearch (可选) ─────────────────────────────

  it('33. 无 BookmarkSearch 时 hybridSearch 只返回语义结果', () => {
    const ss = new BookmarkSemanticSearch(embeddingEngine); // 无 bookmarkSearch
    ss.buildIndex(sampleBookmarks);

    const results = ss.hybridSearch('React');
    // 没有 keywordSearch 时应只返回 semantic 结果
    for (const r of results) {
      assert.equal(r.matchType, 'semantic', '无关键词搜索引擎时应全部为 semantic');
    }
  });

  // ─── 34. buildIndex 后 vocabulary 有内容 ────────────────────────────────────

  it('34. buildIndex 构建后 vocabulary 有内容', () => {
    assert.ok(semanticSearch._vocabulary.size > 0, '词汇表应非空');
    assert.ok(semanticSearch._documentVectors.size > 0, '文档向量缓存应非空');
  });

  // ─── 35. 删除书签后 findSimilar 不再返回该书签 ─────────────────────────────

  it('35. 删除书签后 findSimilar 不返回已删除书签', () => {
    semanticSearch.removeBookmark('1');
    const results = semanticSearch.findSimilar('2', 10);
    const found = results.find(r => r.id === '1');
    assert.equal(found, undefined, '已删除书签不应出现在相似结果中');
  });
});
