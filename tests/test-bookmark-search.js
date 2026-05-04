/**
 * 测试 lib/bookmark-search.js — 书签搜索
 *
 * 测试范围:
 *   search (综合搜索) / searchByFilter (条件过滤) / getSearchSuggestions (搜索建议)
 *   防抖 / 排序 / 过滤 / 图谱扩展 / 边界情况
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkIndexer } = await import('../lib/bookmark-indexer.js');
const { BookmarkGraphEngine } = await import('../lib/bookmark-graph.js');
const { BookmarkSearch } = await import('../lib/bookmark-search.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = [], status) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    status: status || 'unread',
    dateAdded: 1700000000000 + Number(id) * 86400000,
    dateAddedISO: new Date(1700000000000 + Number(id) * 86400000).toISOString(),
  };
}

const sampleBookmarks = [
  createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端'], ['react', 'frontend']),
  createBookmark('2', 'Vue.js 入门教程', 'https://vuejs.org', ['技术', '前端'], ['vue', 'frontend']),
  createBookmark('3', 'Node.js 后端开发指南', 'https://nodejs.org', ['技术', '后端'], ['nodejs', 'backend']),
  createBookmark('4', 'Python Machine Learning', 'https://scikit-learn.org', ['技术', 'AI'], ['python', 'ml']),
  createBookmark('5', 'GitHub 开源项目推荐', 'https://github.com/trending', ['工具'], ['github']),
  createBookmark('6', 'JavaScript 高级程序设计', 'https://javascript.info', ['技术', '前端', 'JS'], ['javascript', 'frontend']),
  createBookmark('7', 'TypeScript Handbook', 'https://typescriptlang.org', ['技术', '前端'], ['typescript', 'frontend'], 'reading'),
  createBookmark('8', 'CSS Grid 完全指南', 'https://css-tricks.com/grid', ['技术', '前端', 'CSS'], ['css', 'grid']),
  createBookmark('9', 'React Hooks 深入', 'https://react.dev/reference/hooks', ['技术', '前端'], ['react', 'hooks'], 'read'),
  createBookmark('10', 'GitHub Actions CI/CD', 'https://github.com/features/actions', ['工具', 'DevOps'], ['github', 'cicd']),
];

// ==================== 测试 ====================

describe('BookmarkSearch', () => {
  let indexer;
  let graphEngine;
  let search;

  beforeEach(() => {
    indexer = new BookmarkIndexer();
    indexer.buildIndex(sampleBookmarks);
    graphEngine = new BookmarkGraphEngine();
    graphEngine.buildGraph(sampleBookmarks);
    search = new BookmarkSearch(indexer, graphEngine);
    search.setKnownTags(['react', 'vue', 'frontend', 'backend', 'python', 'ml', 'css', 'grid', 'javascript', 'typescript', 'github', 'cicd', 'nodejs', 'hooks']);
  });

  // ─── 1. 构造函数 ────────────────────────────────────────────────────────────

  it('1. 构造函数 — 需要有效的 indexer 和 graphEngine', () => {
    assert.ok(search instanceof BookmarkSearch, '应成功创建实例');

    assert.throws(
      () => new BookmarkSearch(),
      /requires a BookmarkIndexer/,
      '传入空参数应抛出异常',
    );
    assert.throws(
      () => new BookmarkSearch(null, graphEngine),
      /requires a BookmarkIndexer/,
      '传入 null indexer 应抛出异常',
    );
    assert.throws(
      () => new BookmarkSearch(indexer, null),
      /requires a BookmarkGraphEngine/,
      '传入 null graphEngine 应抛出异常',
    );
  });

  // ─── 2. search 基本功能 ─────────────────────────────────────────────────────

  it('2. search 返回匹配的搜索结果', () => {
    const results = search.search('react');

    assert.ok(Array.isArray(results), '应返回数组');
    assert.ok(results.length > 0, '应有匹配结果');

    for (const r of results) {
      assert.ok(r.id !== undefined, '应有 id 字段');
      assert.ok(typeof r.score === 'number', 'score 应为 number');
      assert.ok(r.bookmark !== undefined, '应有 bookmark 字段');
      assert.ok(Array.isArray(r.highlights), '应有 highlights 数组');
    }
  });

  // ─── 3. search 中文搜索 ─────────────────────────────────────────────────────

  it('3. search 支持中文关键词搜索', () => {
    const results = search.search('文档');

    assert.ok(results.length > 0, '中文 "文档" 应有匹配结果');
    // "React 官方文档" 应在结果中
    const found = results.find(r => r.bookmark.title.includes('文档'));
    assert.ok(found, '应找到标题包含 "文档" 的书签');
  });

  // ─── 4. search 空查询处理 ───────────────────────────────────────────────────

  it('4. search 空/无效查询返回空数组', () => {
    assert.deepEqual(search.search(''), [], '空字符串应返回空数组');
    assert.deepEqual(search.search(null), [], 'null 应返回空数组');
    assert.deepEqual(search.search(undefined), [], 'undefined 应返回空数组');
    assert.deepEqual(search.search(123), [], '非字符串应返回空数组');
    assert.deepEqual(search.search('   '), [], '纯空格应返回空数组');
  });

  // ─── 5. search 按文件夹过滤 ─────────────────────────────────────────────────

  it('5. search 支持按文件夹过滤', () => {
    const allResults = search.search('前端');
    const frontEndResults = search.search('前端', { folder: '前端' });

    // 过滤后结果数应 <= 未过滤结果
    assert.ok(frontEndResults.length <= allResults.length, '过滤后结果应更少或相等');

    for (const r of frontEndResults) {
      assert.ok(
        r.bookmark.folderPath.some(f => f.includes('前端')),
        `书签 ${r.bookmark.title} 应在前端文件夹中`,
      );
    }
  });

  // ─── 6. search 按标签过滤 ───────────────────────────────────────────────────

  it('6. search 支持按标签过滤', () => {
    const results = search.search('前端', { tags: ['react'] });

    for (const r of results) {
      assert.ok(
        r.bookmark.tags && r.bookmark.tags.map(t => t.toLowerCase()).includes('react'),
        `书签 ${r.bookmark.title} 应有 react 标签`,
      );
    }
  });

  // ─── 7. search 按状态过滤 ───────────────────────────────────────────────────

  it('7. search 支持按状态过滤', () => {
    const readingResults = search.search('前端', { status: 'reading' });

    for (const r of readingResults) {
      assert.equal(r.bookmark.status, 'reading', `书签 ${r.bookmark.title} 状态应为 reading`);
    }

    const readResults = search.search('前端', { status: 'read' });
    for (const r of readResults) {
      assert.equal(r.bookmark.status, 'read', `书签 ${r.bookmark.title} 状态应为 read`);
    }
  });

  // ─── 8. search 按日期排序 ───────────────────────────────────────────────────

  it('8. search 支持按日期排序 (sortBy: date)', () => {
    const results = search.search('前端', { sortBy: 'date' });

    assert.ok(results.length >= 2, '应有多条结果');

    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1].bookmark.dateAdded || 0;
      const curr = results[i].bookmark.dateAdded || 0;
      assert.ok(prev >= curr, `日期应降序: ${prev} >= ${curr}`);
    }
  });

  // ─── 9. search 按标题排序 ───────────────────────────────────────────────────

  it('9. search 支持按标题排序 (sortBy: title)', () => {
    const results = search.search('前端', { sortBy: 'title' });

    assert.ok(results.length >= 2, '应有多条结果');

    for (let i = 1; i < results.length; i++) {
      const prev = (results[i - 1].bookmark.title || '').toLowerCase();
      const curr = (results[i].bookmark.title || '').toLowerCase();
      assert.ok(prev <= curr, `标题应升序: "${prev}" <= "${curr}"`);
    }
  });

  // ─── 10. search limit 限制 ──────────────────────────────────────────────────

  it('10. search 支持 limit 限制结果数量', () => {
    const r3 = search.search('前端', { limit: 3 });
    const r5 = search.search('前端', { limit: 5 });
    const r10 = search.search('前端', { limit: 10 });

    assert.ok(r3.length <= 3, 'limit=3 时最多 3 个结果');
    assert.ok(r5.length <= 5, 'limit=5 时最多 5 个结果');
    assert.ok(r10.length <= 10, 'limit=10 时最多 10 个结果');
    assert.ok(r3.length <= r5.length, 'limit=3 结果应 <= limit=5');
  });

  // ─── 11. search 图谱扩展 ───────────────────────────────────────────────────

  it('11. search 结果包含图谱扩展的相关书签', () => {
    // 搜索 "react" — 索引匹配 react 相关书签，图谱应扩展出相似书签
    const results = search.search('react');

    // 应该有结果
    assert.ok(results.length >= 2, '应有多个结果（含图谱扩展）');

    // 结果中应包含与 react 标题相似或同域名的书签
    const titles = results.map(r => r.bookmark.title);
    assert.ok(titles.length > 0, '应有搜索结果标题');
  });

  // ─── 12. searchByFilter 基本功能 ───────────────────────────────────────────

  it('12. searchByFilter 按文件夹过滤返回正确结果', () => {
    const results = search.searchByFilter({ folder: 'AI' });

    assert.ok(results.length > 0, '应有 AI 文件夹的书签');

    for (const r of results) {
      assert.ok(
        r.bookmark.folderPath.some(f => f.includes('AI')),
        `书签 ${r.bookmark.title} 应在 AI 文件夹`,
      );
    }
  });

  // ─── 13. searchByFilter 多条件组合 ──────────────────────────────────────────

  it('13. searchByFilter 支持多条件组合过滤', () => {
    const results = search.searchByFilter({
      folder: '前端',
      tags: ['react'],
    });

    for (const r of results) {
      assert.ok(
        r.bookmark.folderPath.some(f => f.includes('前端')),
        `书签 ${r.bookmark.title} 应在前端文件夹`,
      );
      assert.ok(
        r.bookmark.tags.map(t => t.toLowerCase()).includes('react'),
        `书签 ${r.bookmark.title} 应有 react 标签`,
      );
    }
  });

  // ─── 14. searchByFilter 按域名过滤 ──────────────────────────────────────────

  it('14. searchByFilter 支持按域名过滤', () => {
    const results = search.searchByFilter({ domain: 'github.com' });

    assert.ok(results.length > 0, '应有 github.com 域名的书签');

    for (const r of results) {
      assert.ok(
        r.bookmark.url.includes('github.com'),
        `书签 URL 应包含 github.com: ${r.bookmark.url}`,
      );
    }
  });

  // ─── 15. searchByFilter 空过滤返回全部 ──────────────────────────────────────

  it('15. searchByFilter 空过滤条件返回所有书签', () => {
    const results = search.searchByFilter({});

    assert.equal(results.length, sampleBookmarks.length, `应返回全部 ${sampleBookmarks.length} 个书签`);
  });

  // ─── 16. getSearchSuggestions 基本功能 ──────────────────────────────────────

  it('16. getSearchSuggestions 返回匹配的建议', () => {
    const suggestions = search.getSearchSuggestions('react');

    assert.ok(Array.isArray(suggestions), '应返回数组');
    assert.ok(suggestions.length > 0, '应有匹配建议');

    for (const s of suggestions) {
      assert.ok(typeof s === 'string', '建议应为字符串');
      assert.ok(s.toLowerCase().includes('react'), `建议 "${s}" 应包含 "react"`);
    }
  });

  // ─── 17. getSearchSuggestions 包含标签和标题 ────────────────────────────────

  it('17. getSearchSuggestions 包含标签和书签标题建议', () => {
    const suggestions = search.getSearchSuggestions('java');

    // 应包含 "javascript" 标签
    assert.ok(
      suggestions.some(s => s.toLowerCase().includes('javascript')),
      '应包含 javascript 标签建议',
    );

    // 应包含 "JavaScript 高级程序设计" 标题
    assert.ok(
      suggestions.some(s => s.includes('JavaScript 高级程序设计')),
      '应包含 JavaScript 书签标题建议',
    );
  });

  // ─── 18. getSearchSuggestions 空输入 ────────────────────────────────────────

  it('18. getSearchSuggestions 空/无效输入返回空数组', () => {
    assert.deepEqual(search.getSearchSuggestions(''), [], '空字符串应返回空数组');
    assert.deepEqual(search.getSearchSuggestions(null), [], 'null 应返回空数组');
    assert.deepEqual(search.getSearchSuggestions(undefined), [], 'undefined 应返回空数组');
  });

  // ─── 19. getSearchSuggestions 中文标签 ──────────────────────────────────────

  it('19. getSearchSuggestions 支持中文标签建议', () => {
    // 更新标签加入中文
    search.setKnownTags(['前端', '后端', '人工智能', '前端框架']);
    const suggestions = search.getSearchSuggestions('前端');

    assert.ok(
      suggestions.some(s => s === '前端'),
      '应包含 "前端" 标签',
    );
    assert.ok(
      suggestions.some(s => s === '前端框架'),
      '应包含 "前端框架" 标签',
    );
  });

  // ─── 20. 防抖搜索建议 ──────────────────────────────────────────────────────

  it('20. getSearchSuggestionsDebounced 防抖回调', (_, done) => {
    let callbackInvoked = false;
    let receivedSuggestions = null;

    search.getSearchSuggestionsDebounced('react', (suggestions) => {
      callbackInvoked = true;
      receivedSuggestions = suggestions;
    });

    // 在 200ms 内不应被调用
    assert.equal(callbackInvoked, false, '不应立即调用回调');

    setTimeout(() => {
      assert.equal(callbackInvoked, true, '200ms 后应调用回调');
      assert.ok(Array.isArray(receivedSuggestions), '回调应收到数组');
      done();
    }, 300);
  });

  // ─── 21. 防抖覆盖前一次调用 ────────────────────────────────────────────────

  it('21. getSearchSuggestionsDebounced 快速输入只触发最后一次', (_, done) => {
    let callCount = 0;
    let lastSuggestions = null;

    // 快速连续输入
    search.getSearchSuggestionsDebounced('r', () => { callCount++; });
    search.getSearchSuggestionsDebounced('re', () => { callCount++; });
    search.getSearchSuggestionsDebounced('rea', () => { callCount++; });
    search.getSearchSuggestionsDebounced('reac', () => { callCount++; });
    search.getSearchSuggestionsDebounced('react', (s) => {
      callCount++;
      lastSuggestions = s;
    });

    setTimeout(() => {
      assert.equal(callCount, 1, '快速输入应只触发最后一次回调');
      assert.ok(Array.isArray(lastSuggestions), '最后回调应收到建议');
      done();
    }, 300);
  });

  // ─── 22. getStats 统计信息 ─────────────────────────────────────────────────

  it('22. getStats 返回正确的统计信息', () => {
    const stats = search.getStats();

    assert.equal(stats.totalBookmarks, sampleBookmarks.length, '书签总数应匹配');
    assert.ok(stats.totalTokens > 0, '应有 token');
    assert.ok(stats.knownTagsCount > 0, '应有已知标签');
    assert.equal(stats.searchHistorySize, 0, '初始搜索历史应为空');

    // 触发一次搜索后检查历史
    search.search('react');
    const stats2 = search.getStats();
    assert.equal(stats2.searchHistorySize, 1, '搜索一次后历史应为 1');
  });
});
