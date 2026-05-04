/**
 * 测试 lib/bookmark-recommender.js — 相似书签推荐
 *
 * 测试范围:
 *   recommend / recommendByContent / getRecommendationReason
 *   推荐理由生成 / matchType 判定 / 边界情况
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkGraphEngine } = await import('../lib/bookmark-graph.js');
const { BookmarkRecommender } = await import('../lib/bookmark-recommender.js');

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
  createBookmark('9', 'React Hooks 深入', 'https://react.dev/reference/hooks', ['技术', '前端']),
  createBookmark('10', 'GitHub Actions CI/CD', 'https://github.com/features/actions', ['工具']),
];

// ==================== 测试 ====================

describe('BookmarkRecommender', () => {
  let engine;
  let recommender;

  beforeEach(() => {
    engine = new BookmarkGraphEngine();
    engine.buildGraph(sampleBookmarks);
    recommender = new BookmarkRecommender(engine);
  });

  // ─── 1. 构造函数 ────────────────────────────────────────────────────────────

  it('1. 构造函数 — 需要有效的 graphEngine 实例', () => {
    assert.ok(recommender instanceof BookmarkRecommender, '应成功创建实例');
    assert.throws(
      () => new BookmarkRecommender(),
      /requires a BookmarkGraphEngine/,
      '传入 null/undefined 应抛出异常',
    );
    assert.throws(
      () => new BookmarkRecommender(null),
      /requires a BookmarkGraphEngine/,
      '传入 null 应抛出异常',
    );
  });

  // ─── 2. recommend 基本功能 ──────────────────────────────────────────────────

  it('2. recommend 返回正确格式的推荐结果', () => {
    const results = recommender.recommend('1', 5);

    assert.ok(Array.isArray(results), '应返回数组');
    assert.ok(results.length > 0, '应有推荐结果');
    assert.ok(results.length <= 5, '结果数应 <= topK');

    for (const rec of results) {
      assert.ok(rec.bookmark !== undefined, '应有 bookmark 字段');
      assert.ok(typeof rec.score === 'number', 'score 应为 number');
      assert.ok(rec.score >= 0 && rec.score <= 1, `score ${rec.score} 应在 0-1 范围`);
      assert.ok(typeof rec.reason === 'string', 'reason 应为 string');
      assert.ok(rec.reason.length > 0, 'reason 不应为空');
      assert.ok(
        ['domain', 'folder', 'title', 'mixed'].includes(rec.matchType),
        `matchType '${rec.matchType}' 应是 domain/folder/title/mixed`,
      );
    }
  });

  // ─── 3. recommend 结果按分数降序 ────────────────────────────────────────────

  it('3. recommend 结果按相似度降序排列', () => {
    const results = recommender.recommend('1', 10);

    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        `结果应按分数降序: ${results[i - 1].score} >= ${results[i].score}`,
      );
    }
  });

  // ─── 4. recommend 不包含自身 ────────────────────────────────────────────────

  it('4. recommend 结果不包含源书签自身', () => {
    const results = recommender.recommend('1', 10);

    for (const rec of results) {
      assert.notEqual(rec.bookmark.id, '1', '推荐结果不应包含源书签自身');
    }
  });

  // ─── 5. recommend 不存在的 ID 返回空 ────────────────────────────────────────

  it('5. recommend 传入不存在的 ID 返回空数组', () => {
    const results = recommender.recommend('nonexistent', 5);
    assert.deepEqual(results, [], '不存在的 ID 应返回空数组');
  });

  // ─── 6. recommendByContent 基本功能 ─────────────────────────────────────────

  it('6. recommendByContent 基于内容返回推荐结果', () => {
    const source = createBookmark('100', 'React 新特性解读', 'https://react.dev/blog', ['技术', '前端']);
    const results = recommender.recommendByContent(source, sampleBookmarks, 5);

    assert.ok(Array.isArray(results), '应返回数组');
    assert.ok(results.length > 0, '应有推荐结果');
    assert.ok(results.length <= 5, '结果数应 <= topK');

    // 不应包含自身
    for (const rec of results) {
      assert.notEqual(rec.bookmark.id, '100', '不应包含自身');
    }
  });

  // ─── 7. recommendByContent 空输入处理 ────────────────────────────────────────

  it('7. recommendByContent 空/无效输入返回空数组', () => {
    assert.deepEqual(
      recommender.recommendByContent(null, sampleBookmarks, 5),
      [],
      'null bookmark 应返回空数组',
    );
    assert.deepEqual(
      recommender.recommendByContent({ id: '' }, sampleBookmarks, 5),
      [],
      '空 id 应返回空数组',
    );
    assert.deepEqual(
      recommender.recommendByContent(sampleBookmarks[0], null, 5),
      [],
      'null 列表应返回空数组',
    );
    assert.deepEqual(
      recommender.recommendByContent(sampleBookmarks[0], [], 5),
      [],
      '空列表应返回空数组',
    );
    assert.deepEqual(
      recommender.recommendByContent(sampleBookmarks[0], 'not-array', 5),
      [],
      '非数组应返回空数组',
    );
  });

  // ─── 8. recommendByContent 结果按分数降序 ───────────────────────────────────

  it('8. recommendByContent 结果按相似度降序排列', () => {
    const source = createBookmark('100', 'React 新特性解读', 'https://react.dev/blog', ['技术', '前端']);
    const results = recommender.recommendByContent(source, sampleBookmarks, 10);

    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        '结果应按分数降序',
      );
    }
  });

  // ─── 9. getRecommendationReason — 同域名 ───────────────────────────────────

  it('9. getRecommendationReason — 同域名生成正确理由', () => {
    const a = createBookmark('1', 'React 文档', 'https://github.com/facebook/react', []);
    const b = createBookmark('2', 'Vue 源码', 'https://github.com/vuejs/vue', []);

    const reason = recommender.getRecommendationReason(a, b);
    assert.ok(reason.includes('github.com'), `理由应包含域名 "github.com"，实际: "${reason}"`);
    assert.ok(reason.includes('同域名'), `理由应包含 "同域名"，实际: "${reason}"`);
  });

  // ─── 10. getRecommendationReason — 同文件夹 ────────────────────────────────

  it('10. getRecommendationReason — 同文件夹生成正确理由', () => {
    const a = createBookmark('1', 'React 文档', 'https://react.dev', ['技术', '前端']);
    const b = createBookmark('2', 'CSS 指南', 'https://css-tricks.com', ['技术', '前端']);

    const reason = recommender.getRecommendationReason(a, b);
    assert.ok(reason.includes('同文件夹'), `理由应包含 "同文件夹"，实际: "${reason}"`);
    assert.ok(reason.includes('技术'), `理由应包含 "技术"，实际: "${reason}"`);
  });

  // ─── 11. getRecommendationReason — 标题相似 ────────────────────────────────

  it('11. getRecommendationReason — 标题相似生成正确理由', () => {
    const a = createBookmark('1', 'React 入门教程', 'https://a.com', []);
    const b = createBookmark('2', 'React 高级指南', 'https://b.com', []);

    const reason = recommender.getRecommendationReason(a, b);
    assert.ok(reason.includes('标题相似'), `理由应包含 "标题相似"，实际: "${reason}"`);
    assert.ok(reason.includes('react'), `理由应包含共同 token "react"，实际: "${reason}"`);
  });

  // ─── 12. getRecommendationReason — 混合理由 ────────────────────────────────

  it('12. getRecommendationReason — 多因素时生成混合理由', () => {
    const a = createBookmark('1', 'React 文档', 'https://react.dev', ['技术', '前端']);
    const b = createBookmark('2', 'React Hooks 指南', 'https://react.dev/hooks', ['技术', '前端']);

    const reason = recommender.getRecommendationReason(a, b);
    // 同域名 + 同文件夹 + 标题相似
    assert.ok(reason.includes('同域名'), `混合理由应包含 "同域名"，实际: "${reason}"`);
    assert.ok(reason.includes('同文件夹'), `混合理由应包含 "同文件夹"，实际: "${reason}"`);
    assert.ok(reason.includes('；'), `多因素理由应包含分号分隔符，实际: "${reason}"`);
  });

  // ─── 13. matchType 判定正确性 ──────────────────────────────────────────────

  it('13. matchType 判定 — 仅域名匹配返回 domain', () => {
    // 构造场景: 仅域名相同，文件夹不同，标题无共同 token
    const books = [
      createBookmark('1', 'Webpack 配置指南', 'https://github.com/webpack/webpack', ['前端工具']),
      createBookmark('2', 'Redis 缓存策略', 'https://github.com/redis/redis', ['后端工具']),
      createBookmark('3', 'Flutter 开发手册', 'https://flutter.dev', ['移动']),
    ];
    engine.buildGraph(books);
    recommender = new BookmarkRecommender(engine);

    const results = recommender.recommend('1', 5);
    // id=2 仅同域名 (github.com)，文件夹和标题无交集
    const redis = results.find(r => r.bookmark.id === '2');
    if (redis) {
      assert.equal(redis.matchType, 'domain', '仅同域名时 matchType 应为 domain');
    }
  });

  // ─── 14. score 范围验证 ────────────────────────────────────────────────────

  it('14. 所有推荐分数在 0-1 范围内', () => {
    const results = recommender.recommend('1', 10);
    for (const rec of results) {
      assert.ok(rec.score >= 0, `score ${rec.score} 应 >= 0`);
      assert.ok(rec.score <= 1, `score ${rec.score} 应 <= 1`);
    }
  });

  // ─── 15. recommend topK 参数约束 ───────────────────────────────────────────

  it('15. recommend 正确限制返回数量', () => {
    const r1 = recommender.recommend('1', 1);
    const r3 = recommender.recommend('1', 3);
    const r5 = recommender.recommend('1', 5);

    assert.ok(r1.length <= 1, 'topK=1 时最多返回 1 个');
    assert.ok(r3.length <= 3, 'topK=3 时最多返回 3 个');
    assert.ok(r5.length <= 5, 'topK=5 时最多返回 5 个');

    // r1 的结果应是 r3 的第一个
    if (r1.length > 0 && r3.length > 0) {
      assert.equal(r1[0].bookmark.id, r3[0].bookmark.id, 'topK=1 的结果应与 topK=3 的第一个相同');
    }
  });
});
