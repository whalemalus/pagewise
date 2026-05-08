/**
 * 测试 lib/bookmark-knowledge-integration.js — 书签-知识库联动 BookmarkKnowledgeIntegration
 *
 * 测试范围:
 *   构造函数 / init / sync
 *   getKnowledgeForBookmark / getBookmarksForEntry
 *   buildNavigationLinks / buildEntryNavLinks
 *   getBookmarkKnowledgeSummary / getEntryKnowledgeSummary
 *   enrichBookmark / enrichEntry
 *   getIntegrationStats / getDashboard
 *   增量更新 / 边界条件 / 性能
 *
 * AC: 单元测试 ≥ 30 个测试用例
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkKnowledgeIntegration } = await import('../lib/bookmark-knowledge-integration.js');

// ==================== 辅助: 构造书签和知识条目 ====================

function createBookmark(id, title, url, folderPath = [], tags = [], contentPreview = '', status = 'unread') {
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

function createEntry(id, title, question, answer, sourceUrl = '', tags = [], category = '未分类', summary = '') {
  return {
    id: Number(id),
    title,
    question,
    answer,
    sourceUrl,
    sourceTitle: title,
    tags,
    category,
    summary: summary || answer.substring(0, 200),
    content: question + ' ' + answer,
    language: 'en',
    createdAt: new Date().toISOString(),
  };
}

// 样本书签
const sampleBookmarks = [
  createBookmark('1', 'React Hooks 完全指南', 'https://react.dev/reference/hooks', ['技术', '前端'], ['react', 'hooks'], 'React hooks API reference and tutorial', 'reading'),
  createBookmark('2', 'Redux 状态管理教程', 'https://redux.js.org/tutorials', ['技术', '前端'], ['react', 'redux', 'state'], 'Redux predictable state container', 'unread'),
  createBookmark('3', 'Node.js Express 入门', 'https://expressjs.com/guide', ['技术', '后端'], ['nodejs', 'express', 'backend'], 'Express.js web framework for Node', 'read'),
  createBookmark('4', 'Python 机器学习入门', 'https://scikit-learn.org', ['技术', 'AI'], ['python', 'ml'], 'Machine learning with Python', 'unread'),
  createBookmark('5', 'CSS Grid 布局详解', 'https://css-tricks.com/grid', ['技术', '前端', 'CSS'], ['css', 'grid', 'layout'], 'CSS Grid layout complete guide', 'read'),
  createBookmark('6', 'TypeScript 泛型教程', 'https://typescriptlang.org/docs/generics', ['技术', '前端'], ['typescript', 'generics'], 'TypeScript generics deep dive', 'unread'),
];

// 样本知识条目
const sampleEntries = [
  createEntry(1, 'React Hooks 使用方法', '如何使用 React Hooks？', 'React Hooks 包括 useState, useEffect 等... 使用 useState 管理组件状态，useEffect 处理副作用', 'https://react.dev/reference/hooks', ['react', 'hooks'], '前端', 'React Hooks 使用方法'),
  createEntry(2, 'Redux 基本概念', 'Redux 是什么？', 'Redux 是一个可预测的状态容器，核心概念包括 Store, Action, Reducer', 'https://redux.js.org/introduction', ['react', 'redux'], '前端', 'Redux 基本概念'),
  createEntry(3, 'RESTful API 设计', '如何设计 RESTful API？', 'RESTful API 设计遵循 REST 架构约束，使用 HTTP 方法表达操作', '', ['rest', 'api', 'backend'], '后端'),
  createEntry(4, 'Express 路由', 'Express 路由是什么？', 'Express 路由定义了应用程序如何响应客户端请求。使用 app.get() app.post() 等方法', 'https://expressjs.com/guide', ['express', 'nodejs', 'backend'], '后端', 'Express 路由教程'),
  createEntry(5, 'Python 数据分析', '如何用 Python 做数据分析？', 'Python 数据分析常用库包括 NumPy, Pandas, Matplotlib', '', ['python', 'data'], 'AI/ML', 'Python 数据分析'),
  createEntry(6, 'CSS 布局方案对比', '有哪些 CSS 布局方案？', 'CSS 布局方案包括 Flexbox, Grid, 定位, 浮动等。Grid 适合二维布局', '', ['css', 'layout', 'frontend'], '前端', 'CSS 布局方案对比'),
];

// ==================== 测试 ====================

describe('BookmarkKnowledgeIntegration', () => {
  let integration;

  beforeEach(() => {
    integration = new BookmarkKnowledgeIntegration();
    integration.init(sampleBookmarks, sampleEntries);
  });

  // ─── 1. 构造函数 ──────────────────────────────────────────────────────────────

  it('1. 构造函数 — 创建实例成功', () => {
    assert.ok(integration instanceof BookmarkKnowledgeIntegration);
  });

  it('2. 构造函数 — 默认选项', () => {
    const i = new BookmarkKnowledgeIntegration();
    assert.equal(i.isReady(), false);
    assert.equal(i._syncedAt, null);
  });

  it('3. 构造函数 — 自定义选项', () => {
    const i = new BookmarkKnowledgeIntegration({
      correlationThreshold: 0.25,
      maxResults: 20,
    });
    assert.equal(i._correlationThreshold, 0.25);
    assert.equal(i._maxResults, 20);
  });

  // ─── 2. init ──────────────────────────────────────────────────────────────

  it('4. init — 初始化成功', () => {
    assert.equal(integration.isReady(), true);
  });

  it('5. init — 空数据初始化', () => {
    const i = new BookmarkKnowledgeIntegration();
    i.init([], []);
    assert.equal(i.isReady(), true);
    const stats = i.getIntegrationStats();
    assert.equal(stats.totalBookmarks, 0);
    assert.equal(stats.totalEntries, 0);
  });

  it('6. init — 非数组输入安全处理', () => {
    const i = new BookmarkKnowledgeIntegration();
    i.init(null, undefined);
    assert.equal(i.isReady(), true);
    const stats = i.getIntegrationStats();
    assert.equal(stats.totalBookmarks, 0);
    assert.equal(stats.totalEntries, 0);
  });

  // ─── 3. sync ──────────────────────────────────────────────────────────────

  it('7. sync — 同步新数据', () => {
    const newBookmarks = [...sampleBookmarks, createBookmark('100', 'New Book', 'https://new.example.com', ['新'], ['new'])];
    integration.sync(newBookmarks, sampleEntries);
    const stats = integration.getIntegrationStats();
    assert.equal(stats.totalBookmarks, 7);
  });

  it('8. sync — 更新 syncedAt', () => {
    const before = integration._syncedAt;
    integration.sync(sampleBookmarks, sampleEntries);
    assert.ok(integration._syncedAt >= before);
  });

  it('9. sync — 增量添加条目', () => {
    const newEntry = createEntry(100, 'New Topic', 'What is new topic?', 'New topic explanation', '', ['new'], '新');
    integration.sync(sampleBookmarks, [...sampleEntries, newEntry]);
    const stats = integration.getIntegrationStats();
    assert.equal(stats.totalEntries, 7);
  });

  // ─── 4. getKnowledgeForBookmark ──────────────────────────────────────────────────────

  it('10. getKnowledgeForBookmark — 返回关联知识条目', () => {
    const results = integration.getKnowledgeForBookmark('1');
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    // Bookmark 1 (React Hooks, url: react.dev/reference/hooks) 应关联 Entry 1 (相同 URL)
    assert.equal(results[0].entry.id, 1);
  });

  it('11. getKnowledgeForBookmark — 结果包含导航信息', () => {
    const results = integration.getKnowledgeForBookmark('1');
    assert.ok(results.length > 0);
    const first = results[0];
    assert.ok(typeof first.score === 'number');
    assert.ok(Array.isArray(first.matchTypes));
    assert.ok(first.entry !== undefined);
    assert.ok(typeof first.navigationHint === 'string');
  });

  it('12. getKnowledgeForBookmark — limit 参数', () => {
    const results = integration.getKnowledgeForBookmark('1', { limit: 1 });
    assert.ok(results.length <= 1);
  });

  it('13. getKnowledgeForBookmark — 不存在的书签返回空数组', () => {
    const results = integration.getKnowledgeForBookmark('nonexistent');
    assert.deepEqual(results, []);
  });

  it('14. getKnowledgeForBookmark — minScore 过滤', () => {
    const all = integration.getKnowledgeForBookmark('1');
    const highScore = integration.getKnowledgeForBookmark('1', { minScore: 0.8 });
    assert.ok(highScore.length <= all.length);
    for (const r of highScore) {
      assert.ok(r.score >= 0.8);
    }
  });

  // ─── 5. getBookmarksForEntry ──────────────────────────────────────────────────────

  it('15. getBookmarksForEntry — 返回关联书签', () => {
    const results = integration.getBookmarksForEntry(1);
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    for (const r of results) {
      assert.ok(typeof r.score === 'number');
      assert.ok(r.bookmark !== undefined);
      assert.ok(typeof r.navigationHint === 'string');
    }
  });

  it('16. getBookmarksForEntry — 不存在的条目返回空数组', () => {
    const results = integration.getBookmarksForEntry(999);
    assert.deepEqual(results, []);
  });

  it('17. getBookmarksForEntry — limit 参数', () => {
    const results = integration.getBookmarksForEntry(1, { limit: 2 });
    assert.ok(results.length <= 2);
  });

  // ─── 6. buildNavigationLinks ──────────────────────────────────────────────────────

  it('18. buildNavigationLinks — 书签导航链接', () => {
    const links = integration.buildNavigationLinks('1');
    assert.ok(links !== null);
    assert.ok(links.bookmark !== undefined);
    assert.ok(Array.isArray(links.knowledgeLinks));
    assert.ok(typeof links.totalLinks === 'number');
    assert.ok(links.knowledgeLinks.length > 0);
  });

  it('19. buildNavigationLinks — 链接包含 entryTitle 和 score', () => {
    const links = integration.buildNavigationLinks('1');
    for (const link of links.knowledgeLinks) {
      assert.ok(typeof link.entryId === 'number');
      assert.ok(typeof link.entryTitle === 'string');
      assert.ok(typeof link.score === 'number');
      assert.ok(Array.isArray(link.matchTypes));
    }
  });

  it('20. buildNavigationLinks — 不存在书签返回 null', () => {
    const links = integration.buildNavigationLinks('nonexistent');
    assert.equal(links, null);
  });

  // ─── 7. buildEntryNavLinks ──────────────────────────────────────────────────────

  it('21. buildEntryNavLinks — 条目导航链接', () => {
    const links = integration.buildEntryNavLinks(1);
    assert.ok(links !== null);
    assert.ok(links.entry !== undefined);
    assert.ok(Array.isArray(links.bookmarkLinks));
    assert.ok(typeof links.totalLinks === 'number');
  });

  it('22. buildEntryNavLinks — 链接包含 bookmarkTitle', () => {
    const links = integration.buildEntryNavLinks(1);
    for (const link of links.bookmarkLinks) {
      assert.ok(typeof link.bookmarkId === 'string');
      assert.ok(typeof link.bookmarkTitle === 'string');
      assert.ok(typeof link.bookmarkUrl === 'string');
      assert.ok(typeof link.score === 'number');
    }
  });

  it('23. buildEntryNavLinks — 不存在条目返回 null', () => {
    const links = integration.buildEntryNavLinks(999);
    assert.equal(links, null);
  });

  // ─── 8. getBookmarkKnowledgeSummary ──────────────────────────────────────────────────────

  it('24. getBookmarkKnowledgeSummary — 书签知识摘要', () => {
    const summary = integration.getBookmarkKnowledgeSummary('1');
    assert.ok(summary !== null);
    assert.ok(summary.bookmark !== undefined);
    assert.ok(typeof summary.totalRelatedEntries === 'number');
    assert.ok(typeof summary.avgCorrelationScore === 'number');
    assert.ok(Array.isArray(summary.topEntries));
    assert.ok(Array.isArray(summary.matchTypeDistribution));
  });

  it('25. getBookmarkKnowledgeSummary — 无关联书签', () => {
    const summary = integration.getBookmarkKnowledgeSummary('nonexistent');
    assert.equal(summary, null);
  });

  // ─── 9. getEntryKnowledgeSummary ──────────────────────────────────────────────────────

  it('26. getEntryKnowledgeSummary — 条目知识摘要', () => {
    const summary = integration.getEntryKnowledgeSummary(1);
    assert.ok(summary !== null);
    assert.ok(summary.entry !== undefined);
    assert.ok(typeof summary.totalRelatedBookmarks === 'number');
    assert.ok(typeof summary.avgCorrelationScore === 'number');
    assert.ok(Array.isArray(summary.topBookmarks));
  });

  it('27. getEntryKnowledgeSummary — 不存在条目返回 null', () => {
    const summary = integration.getEntryKnowledgeSummary(999);
    assert.equal(summary, null);
  });

  // ─── 10. enrichBookmark / enrichEntry ──────────────────────────────────────────────────────

  it('28. enrichBookmark — 为书签附加知识上下文', () => {
    const enriched = integration.enrichBookmark('1');
    assert.ok(enriched !== null);
    assert.ok(enriched.bookmark !== undefined);
    assert.ok(Array.isArray(enriched.knowledgeContext));
    assert.ok(typeof enriched.knowledgeCount === 'number');
    assert.ok(typeof enriched.enrichmentScore === 'number');
  });

  it('29. enrichBookmark — 不存在书签返回 null', () => {
    const enriched = integration.enrichBookmark('nonexistent');
    assert.equal(enriched, null);
  });

  it('30. enrichEntry — 为条目附加书签上下文', () => {
    const enriched = integration.enrichEntry(1);
    assert.ok(enriched !== null);
    assert.ok(enriched.entry !== undefined);
    assert.ok(Array.isArray(enriched.bookmarkContext));
    assert.ok(typeof enriched.bookmarkCount === 'number');
    assert.ok(typeof enriched.enrichmentScore === 'number');
  });

  it('31. enrichEntry — 不存在条目返回 null', () => {
    const enriched = integration.enrichEntry(999);
    assert.equal(enriched, null);
  });

  // ─── 11. getIntegrationStats ──────────────────────────────────────────────────────

  it('32. getIntegrationStats — 统计信息完整', () => {
    const stats = integration.getIntegrationStats();
    assert.equal(typeof stats.totalBookmarks, 'number');
    assert.equal(typeof stats.totalEntries, 'number');
    assert.equal(typeof stats.totalCorrelations, 'number');
    assert.equal(typeof stats.associatedBookmarks, 'number');
    assert.equal(typeof stats.associatedEntries, 'number');
    assert.equal(typeof stats.coverageRate, 'number');
    assert.ok(stats.syncedAt !== null);
  });

  it('33. getIntegrationStats — 覆盖率计算', () => {
    const stats = integration.getIntegrationStats();
    // 覆盖率 = 关联书签数 / 总书签数
    const expected = stats.totalBookmarks > 0
      ? Math.round((stats.associatedBookmarks / stats.totalBookmarks) * 1000) / 1000
      : 0;
    assert.equal(stats.coverageRate, expected);
  });

  it('34. getIntegrationStats — 空数据', () => {
    const i = new BookmarkKnowledgeIntegration();
    i.init([], []);
    const stats = i.getIntegrationStats();
    assert.equal(stats.totalBookmarks, 0);
    assert.equal(stats.totalEntries, 0);
    assert.equal(stats.totalCorrelations, 0);
    assert.equal(stats.coverageRate, 0);
  });

  // ─── 12. getDashboard ──────────────────────────────────────────────────────

  it('35. getDashboard — 仪表盘数据完整', () => {
    const dashboard = integration.getDashboard();
    assert.ok(dashboard.stats !== undefined);
    assert.ok(Array.isArray(dashboard.topCorrelatedBookmarks));
    assert.ok(Array.isArray(dashboard.suggestions));
    assert.ok(Array.isArray(dashboard.orphanBookmarks));
    assert.ok(Array.isArray(dashboard.orphanEntries));
  });

  it('36. getDashboard — topCorrelatedBookmarks 包含正确字段', () => {
    const dashboard = integration.getDashboard();
    for (const item of dashboard.topCorrelatedBookmarks) {
      assert.ok(item.bookmark !== undefined);
      assert.ok(typeof item.correlationCount === 'number');
      assert.ok(typeof item.avgScore === 'number');
    }
  });

  // ─── 13. 双向关联一致性 ──────────────────────────────────────────────────────

  it('37. 双向一致性 — 书签→条目→书签', () => {
    // 从书签 1 找关联条目
    const entries = integration.getKnowledgeForBookmark('1');
    if (entries.length > 0) {
      const topEntryId = entries[0].entry.id;
      // 从该条目反向找关联书签
      const bookmarks = integration.getBookmarksForEntry(topEntryId);
      const found = bookmarks.some(r => r.bookmark.id === '1');
      assert.ok(found, '双向关联应一致');
    }
  });

  // ─── 14. 结果排序 ──────────────────────────────────────────────────────

  it('38. getKnowledgeForBookmark — 结果按 score 降序', () => {
    const results = integration.getKnowledgeForBookmark('1');
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score,
        `Not sorted: ${results[i-1].score} < ${results[i].score}`);
    }
  });

  it('39. getBookmarksForEntry — 结果按 score 降序', () => {
    const results = integration.getBookmarksForEntry(1);
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score,
        `Not sorted: ${results[i-1].score} < ${results[i].score}`);
    }
  });

  // ─── 15. isReady / destroy ──────────────────────────────────────────────────────

  it('40. isReady — init 前为 false', () => {
    const i = new BookmarkKnowledgeIntegration();
    assert.equal(i.isReady(), false);
  });

  it('41. destroy — 清理资源', () => {
    integration.destroy();
    assert.equal(integration.isReady(), false);
    assert.equal(integration._syncedAt, null);
  });

  it('42. destroy 后调用 API 返回空结果', () => {
    integration.destroy();
    const results = integration.getKnowledgeForBookmark('1');
    assert.deepEqual(results, []);
    const stats = integration.getIntegrationStats();
    assert.equal(stats.totalBookmarks, 0);
  });
});
