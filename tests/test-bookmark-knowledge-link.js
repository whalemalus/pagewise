/**
 * 测试 lib/bookmark-knowledge-link.js — 知识关联 BookmarkKnowledgeCorrelation
 *
 * 测试范围:
 *   构造函数 / buildIndex / addEntry / removeEntry
 *   getRelatedEntries / getRelatedBookmarks / getCorrelationStrength
 *   suggestCorrelations / getStats / getCorrelationSummary
 *   URL 匹配 / 标题语义相似 / 标签重叠 / 综合关联度
 *   双向关联 / 增量更新 / 边界条件 / 性能
 *
 * AC: 单元测试 ≥ 20 个测试用例
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { EmbeddingEngine } = await import('../lib/embedding-engine.js');
const { BookmarkKnowledgeCorrelation } = await import('../lib/bookmark-knowledge-link.js');

// ==================== 辅助: 构造书签和知识条目 ====================

function createBookmark(id, title, url, folderPath = [], tags = [], contentPreview = '') {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    status: 'unread',
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
  createBookmark('1', 'React Hooks 完全指南', 'https://react.dev/reference/hooks', ['技术', '前端'], ['react', 'hooks'], 'React hooks API reference and tutorial'),
  createBookmark('2', 'Redux 状态管理教程', 'https://redux.js.org/tutorials', ['技术', '前端'], ['react', 'redux', 'state'], 'Redux predictable state container'),
  createBookmark('3', 'Node.js Express 入门', 'https://expressjs.com/guide', ['技术', '后端'], ['nodejs', 'express', 'backend'], 'Express.js web framework for Node'),
  createBookmark('4', 'Python 机器学习入门', 'https://scikit-learn.org', ['技术', 'AI'], ['python', 'ml'], 'Machine learning with Python'),
  createBookmark('5', 'CSS Grid 布局详解', 'https://css-tricks.com/grid', ['技术', '前端', 'CSS'], ['css', 'grid', 'layout'], 'CSS Grid layout complete guide'),
  createBookmark('6', 'TypeScript 泛型教程', 'https://typescriptlang.org/docs/generics', ['技术', '前端'], ['typescript', 'generics'], 'TypeScript generics deep dive'),
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

describe('BookmarkKnowledgeCorrelation', () => {
  let correlation;
  let embeddingEngine;

  beforeEach(() => {
    embeddingEngine = new EmbeddingEngine();
    correlation = new BookmarkKnowledgeCorrelation(embeddingEngine);
    correlation.buildIndex(sampleBookmarks, sampleEntries);
  });

  // ─── 1. 构造函数 ──────────────────────────────────────────────────────────────

  it('1. 构造函数 — 创建实例成功', () => {
    assert.ok(correlation instanceof BookmarkKnowledgeCorrelation);
  });

  it('2. 构造函数 — 无参数时使用默认引擎', () => {
    const c = new BookmarkKnowledgeCorrelation();
    assert.ok(c instanceof BookmarkKnowledgeCorrelation);
    assert.ok(c._embeddingEngine instanceof EmbeddingEngine);
  });

  it('3. 构造函数 — 自定义引擎', () => {
    const customEngine = new EmbeddingEngine();
    const c = new BookmarkKnowledgeCorrelation(customEngine);
    assert.equal(c._embeddingEngine, customEngine);
  });

  // ─── 2. buildIndex ──────────────────────────────────────────────────────────────

  it('4. buildIndex — 全量构建成功', () => {
    const stats = correlation.getStats();
    assert.equal(stats.totalBookmarks, 6);
    assert.equal(stats.totalEntries, 6);
    assert.ok(stats.totalCorrelations > 0);
  });

  it('5. buildIndex — 空数组不报错', () => {
    correlation.buildIndex([], []);
    const stats = correlation.getStats();
    assert.equal(stats.totalBookmarks, 0);
    assert.equal(stats.totalEntries, 0);
    assert.equal(stats.totalCorrelations, 0);
  });

  it('6. buildIndex — 重复构建覆盖旧数据', () => {
    const stats1 = correlation.getStats();
    correlation.buildIndex(sampleBookmarks.slice(0, 3), sampleEntries.slice(0, 3));
    const stats2 = correlation.getStats();
    assert.equal(stats2.totalBookmarks, 3);
    assert.equal(stats2.totalEntries, 3);
    assert.ok(stats2.totalCorrelations <= stats1.totalCorrelations);
  });

  // ─── 3. getRelatedEntries ──────────────────────────────────────────────────────

  it('7. getRelatedEntries — URL 匹配的条目优先', () => {
    // Bookmark 1 (react hooks) 和 Entry 1 (react hooks) 有相同 URL
    const related = correlation.getRelatedEntries('1');
    assert.ok(related.length > 0);
    // Entry 1 应该是最高关联（URL 匹配 + 标题 + 标签）
    assert.equal(related[0].entry.id, 1);
  });

  it('8. getRelatedEntries — 无关联返回空数组', () => {
    const related = correlation.getRelatedEntries('nonexistent');
    assert.deepEqual(related, []);
  });

  it('9. getRelatedEntries — limit 参数生效', () => {
    const related = correlation.getRelatedEntries('1', { limit: 2 });
    assert.ok(related.length <= 2);
  });

  it('10. getRelatedEntries — 返回结果包含 score 和 matchTypes', () => {
    const related = correlation.getRelatedEntries('1');
    assert.ok(related.length > 0);
    for (const r of related) {
      assert.ok(typeof r.score === 'number');
      assert.ok(r.score > 0);
      assert.ok(r.score <= 1);
      assert.ok(Array.isArray(r.matchTypes));
      assert.ok(r.matchTypes.length > 0);
      assert.ok(r.entry !== undefined);
    }
  });

  // ─── 4. getRelatedBookmarks ──────────────────────────────────────────────────────

  it('11. getRelatedBookmarks — 返回相关书签', () => {
    const related = correlation.getRelatedBookmarks(1);
    assert.ok(related.length > 0);
    for (const r of related) {
      assert.ok(typeof r.score === 'number');
      assert.ok(r.score > 0);
      assert.ok(r.bookmark !== undefined);
    }
  });

  it('12. getRelatedBookmarks — 无关联返回空数组', () => {
    const related = correlation.getRelatedBookmarks(999);
    assert.deepEqual(related, []);
  });

  // ─── 5. getCorrelationStrength ──────────────────────────────────────────────────────

  it('13. getCorrelationStrength — URL 匹配强度高', () => {
    // Bookmark 3 (express) 和 Entry 4 (express) 有相同 URL
    const strength = correlation.getCorrelationStrength('3', 4);
    assert.ok(strength !== null);
    assert.ok(strength.total > 0.5, `Expected > 0.5, got ${strength.total}`);
    assert.ok(strength.urlMatch === 1.0);
  });

  it('14. getCorrelationStrength — 无关联返回 null', () => {
    const strength = correlation.getCorrelationStrength('nonexistent', 999);
    assert.equal(strength, null);
  });

  it('15. getCorrelationStrength — 包含分项得分', () => {
    const strength = correlation.getCorrelationStrength('1', 1);
    assert.ok(strength !== null);
    assert.ok(typeof strength.urlMatch === 'number');
    assert.ok(typeof strength.titleSimilarity === 'number');
    assert.ok(typeof strength.tagOverlap === 'number');
    assert.ok(typeof strength.total === 'number');
  });

  // ─── 6. addEntry / removeEntry ──────────────────────────────────────────────────────

  it('16. addEntry — 增量添加知识条目', () => {
    const newEntry = createEntry(7, 'React 组件生命周期', 'React 生命周期是什么？', 'React 组件生命周期包括 mount, update, unmount 三个阶段', '', ['react', 'lifecycle'], '前端');
    correlation.addEntry(newEntry);
    const stats = correlation.getStats();
    assert.equal(stats.totalEntries, 7);
    // 新条目应能被查到
    const related = correlation.getRelatedBookmarks(7);
    assert.ok(related.length > 0);
  });

  it('17. removeEntry — 增量删除知识条目', () => {
    const before = correlation.getStats();
    correlation.removeEntry(1);
    const after = correlation.getStats();
    assert.equal(after.totalEntries, before.totalEntries - 1);
    // 删除后不应出现在书签关联结果中
    const related = correlation.getRelatedEntries('1');
    for (const r of related) {
      assert.notEqual(r.entry.id, 1);
    }
  });

  // ─── 7. suggestCorrelations ──────────────────────────────────────────────────────

  it('18. suggestCorrelations — 返回建议列表', () => {
    const suggestions = correlation.suggestCorrelations();
    assert.ok(Array.isArray(suggestions));
    assert.ok(suggestions.length > 0);
    for (const s of suggestions) {
      assert.ok(s.bookmark !== undefined);
      assert.ok(s.entry !== undefined);
      assert.ok(typeof s.score === 'number');
      assert.ok(typeof s.reason === 'string');
    }
  });

  it('19. suggestCorrelations — limit 参数', () => {
    const suggestions = correlation.suggestCorrelations({ limit: 3 });
    assert.ok(suggestions.length <= 3);
  });

  // ─── 8. getCorrelationSummary ──────────────────────────────────────────────────────

  it('20. getCorrelationSummary — 书签关联摘要', () => {
    const summary = correlation.getCorrelationSummary('1');
    assert.ok(summary !== null);
    assert.ok(summary.bookmark !== undefined);
    assert.ok(Array.isArray(summary.relatedEntries));
    assert.ok(typeof summary.totalRelated === 'number');
  });

  it('21. getCorrelationSummary — 不存在的书签返回 null', () => {
    const summary = correlation.getCorrelationSummary('nonexistent');
    assert.equal(summary, null);
  });

  // ─── 9. getStats ──────────────────────────────────────────────────────────────

  it('22. getStats — 统计信息完整', () => {
    const stats = correlation.getStats();
    assert.equal(typeof stats.totalBookmarks, 'number');
    assert.equal(typeof stats.totalEntries, 'number');
    assert.equal(typeof stats.totalCorrelations, 'number');
    assert.equal(typeof stats.associatedBookmarks, 'number');
    assert.equal(typeof stats.associatedEntries, 'number');
    assert.equal(typeof stats.avgCorrelationsPerBookmark, 'number');
  });

  it('23. getStats — 零值', () => {
    const c = new BookmarkKnowledgeCorrelation();
    const stats = c.getStats();
    assert.equal(stats.totalBookmarks, 0);
    assert.equal(stats.totalEntries, 0);
    assert.equal(stats.totalCorrelations, 0);
    assert.equal(stats.associatedBookmarks, 0);
    assert.equal(stats.associatedEntries, 0);
    assert.equal(stats.avgCorrelationsPerBookmark, 0);
  });

  // ─── 10. 综合关联度 ──────────────────────────────────────────────────────────────

  it('24. 综合关联度 — URL + 标签都匹配时分数更高', () => {
    // Bookmark 1 has url https://react.dev/reference/hooks, Entry 1 has same url
    // Bookmark 1 also has tags ['react', 'hooks'], Entry 1 has ['react', 'hooks']
    const s1 = correlation.getCorrelationStrength('1', 1);

    // Bookmark 4 (python) 和 Entry 1 (react hooks) 无共同 URL 或标签
    const s2 = correlation.getCorrelationStrength('4', 1);

    if (s2 !== null) {
      assert.ok(s1.total > s2.total, `Expected s1(${s1.total}) > s2(${s2.total})`);
    } else {
      // s2 is null means no correlation at all
      assert.ok(s1.total > 0);
    }
  });

  it('25. 关联对称性 — getRelatedEntries 和 getRelatedBookmarks 双向一致', () => {
    // 从书签 1 找关联条目
    const relatedEntries = correlation.getRelatedEntries('1');
    if (relatedEntries.length > 0) {
      const topEntryId = relatedEntries[0].entry.id;
      // 从该条目反向找关联书签
      const relatedBookmarks = correlation.getRelatedBookmarks(topEntryId);
      const found = relatedBookmarks.some(r => r.bookmark.id === '1');
      assert.ok(found, '双向关联: 书签→条目 和 条目→书签 应一致');
    }
  });

  // ─── 11. 边界条件 ──────────────────────────────────────────────────────────────

  it('26. 只有书签没有知识条目', () => {
    const c = new BookmarkKnowledgeCorrelation(embeddingEngine);
    c.buildIndex(sampleBookmarks, []);
    const related = c.getRelatedEntries('1');
    assert.deepEqual(related, []);
    const stats = c.getStats();
    assert.equal(stats.totalEntries, 0);
  });

  it('27. 只有知识条目没有书签', () => {
    const c = new BookmarkKnowledgeCorrelation(embeddingEngine);
    c.buildIndex([], sampleEntries);
    const related = c.getRelatedBookmarks(1);
    assert.deepEqual(related, []);
    const stats = c.getStats();
    assert.equal(stats.totalBookmarks, 0);
  });

  it('28. addEntry 后 getRelatedEntries 能找到新增条目', () => {
    const newEntry = createEntry(10, 'React 虚拟 DOM', '什么是虚拟 DOM？', '虚拟 DOM 是一种编程概念，React 使用它来优化 DOM 操作', '', ['react', 'virtual-dom'], '前端');
    correlation.addEntry(newEntry);
    const related = correlation.getRelatedEntries('1');
    const found = related.some(r => r.entry.id === 10);
    assert.ok(found, '新增条目应出现在相关结果中');
  });

  // ─── 12. 关联强度排序 ──────────────────────────────────────────────────────────────

  it('29. getRelatedEntries — 结果按 score 降序', () => {
    const related = correlation.getRelatedEntries('1');
    for (let i = 1; i < related.length; i++) {
      assert.ok(related[i - 1].score >= related[i].score,
        `Results not sorted: ${related[i-1].score} < ${related[i].score}`);
    }
  });

  it('30. getRelatedBookmarks — 结果按 score 降序', () => {
    const related = correlation.getRelatedBookmarks(1);
    for (let i = 1; i < related.length; i++) {
      assert.ok(related[i - 1].score >= related[i].score,
        `Results not sorted: ${related[i-1].score} < ${related[i].score}`);
    }
  });
});
