/**
 * 测试 lib/bookmark-clusterer.js — 主题聚类引擎
 *
 * 测试范围:
 *   cluster / getCategories / moveBookmark / mergeCategories / getCategoryForBookmark
 *   领域识别准确性 / 中文关键词 / 空输入 / 边界情况
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkClusterer } = await import('../lib/bookmark-clusterer.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = []) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    dateAdded: 1700000000000 + Number(id) * 1000,
  };
}

const sampleBookmarks = [
  // 前端
  createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端']),
  createBookmark('2', 'Vue.js 入门教程', 'https://vuejs.org', ['技术', '前端']),
  createBookmark('3', 'CSS Grid 完全指南', 'https://css-tricks.com/grid', ['前端', 'CSS']),
  createBookmark('4', 'TypeScript Handbook', 'https://typescriptlang.org', ['技术', '前端']),
  createBookmark('5', 'Webpack 配置指南', 'https://webpack.js.org', ['前端工具']),
  // 后端
  createBookmark('6', 'Node.js 后端开发指南', 'https://nodejs.org', ['技术', '后端']),
  createBookmark('7', 'Python Django 入门', 'https://djangoproject.com', ['技术', '后端']),
  createBookmark('8', 'Go 语言编程指南', 'https://go.dev', ['技术', '后端']),
  // 数据库
  createBookmark('9', 'PostgreSQL 教程', 'https://postgresql.org', ['技术', '数据库']),
  createBookmark('10', 'Redis 缓存策略', 'https://redis.io', ['技术', '数据库']),
  // DevOps
  createBookmark('11', 'Docker 入门', 'https://docker.com', ['DevOps']),
  createBookmark('12', 'Kubernetes 实战', 'https://kubernetes.io', ['DevOps']),
  // AI/ML
  createBookmark('13', 'TensorFlow 官方教程', 'https://tensorflow.org', ['AI']),
  createBookmark('14', 'PyTorch 深度学习', 'https://pytorch.org', ['AI', '深度学习']),
  createBookmark('15', 'OpenAI GPT 文档', 'https://openai.com', ['AI', '大模型']),
  // 移动开发
  createBookmark('16', 'Flutter 开发手册', 'https://flutter.dev', ['移动']),
  createBookmark('17', 'React Native 入门', 'https://reactnative.dev', ['移动']),
  // 安全
  createBookmark('18', 'OWASP 安全指南', 'https://owasp.org', ['安全']),
  // 云服务
  createBookmark('19', 'AWS Lambda 文档', 'https://aws.amazon.com/lambda', ['云']),
  // 数据
  createBookmark('20', 'D3.js 数据可视化', 'https://d3js.org', ['数据']),
  // 测试
  createBookmark('21', 'Jest 测试框架', 'https://jestjs.io', ['测试']),
  // 设计
  createBookmark('22', 'Figma 设计工具', 'https://figma.com', ['设计']),
  // 工具
  createBookmark('23', 'GitHub 指南', 'https://github.com', ['工具']),
  // 架构
  createBookmark('24', 'GraphQL 入门', 'https://graphql.org', ['架构']),
  // 性能
  createBookmark('25', 'Web 性能优化', 'https://web.dev/performance', ['性能']),
  // 其他 — 不含任何匹配关键词
  createBookmark('26', '猫咪写真集', 'https://example.com/cats', ['生活']),
  createBookmark('27', '烹饪食谱大全', 'https://example.com/cooking', ['生活']),
  // 中文关键词
  createBookmark('28', '机器学习入门教程', 'https://example.com/ml', ['技术']),
  createBookmark('29', '前端框架对比分析', 'https://example.com/fe', ['技术']),
  createBookmark('30', '数据库索引优化技巧', 'https://example.com/db', ['技术']),
];

// ==================== 测试 ====================

describe('BookmarkClusterer', () => {
  let clusterer;

  beforeEach(() => {
    clusterer = new BookmarkClusterer(sampleBookmarks);
  });

  // ─── 1. 构造函数 ──────────────────────────────────────────────────────────

  it('1. 构造函数 — 正常初始化', () => {
    assert.ok(clusterer instanceof BookmarkClusterer, '应成功创建实例');
  });

  // ─── 2. cluster 返回正确格式 ────────────────────────────────────────────

  it('2. cluster 返回 Map，每个 category 包含书签数组', () => {
    const result = clusterer.cluster();

    assert.ok(result instanceof Map, '应返回 Map');
    assert.ok(result.size > 0, '应有至少一个分类');

    for (const [cat, bookmarks] of result) {
      assert.ok(typeof cat === 'string', 'category 应为 string');
      assert.ok(Array.isArray(bookmarks), `${cat} 的值应为数组`);
      assert.ok(bookmarks.length > 0, `${cat} 不应为空数组`);
      for (const bm of bookmarks) {
        assert.ok(bm.id !== undefined, `${cat} 中书签应有 id`);
        assert.ok(bm.title !== undefined, `${cat} 中书签应有 title`);
      }
    }
  });

  // ─── 3. 前端领域识别 ────────────────────────────────────────────────────

  it('3. 前端领域识别 — react/vue/css/typescript', () => {
    const result = clusterer.cluster();
    const frontend = result.get('前端');

    assert.ok(frontend, '应存在"前端"分类');
    const ids = frontend.map(b => b.id);

    assert.ok(ids.includes('1'), 'React 书签应归入前端');
    assert.ok(ids.includes('2'), 'Vue 书签应归入前端');
    assert.ok(ids.includes('3'), 'CSS 书签应归入前端');
    assert.ok(ids.includes('4'), 'TypeScript 书签应归入前端');
  });

  // ─── 4. 后端领域识别 ────────────────────────────────────────────────────

  it('4. 后端领域识别 — node/python/django/go', () => {
    const result = clusterer.cluster();
    const backend = result.get('后端');

    assert.ok(backend, '应存在"后端"分类');
    const ids = backend.map(b => b.id);

    assert.ok(ids.includes('6'), 'Node.js 书签应归入后端');
    assert.ok(ids.includes('7'), 'Django 书签应归入后端');
    assert.ok(ids.includes('8'), 'Go 书签应归入后端');
  });

  // ─── 5. AI/ML 领域识别 ─────────────────────────────────────────────────

  it('5. AI/ML 领域识别 — tensorflow/pytorch/openai', () => {
    const result = clusterer.cluster();
    const ai = result.get('AI/ML');

    assert.ok(ai, '应存在"AI/ML"分类');
    const ids = ai.map(b => b.id);

    assert.ok(ids.includes('13'), 'TensorFlow 书签应归入 AI/ML');
    assert.ok(ids.includes('14'), 'PyTorch 书签应归入 AI/ML');
    assert.ok(ids.includes('15'), 'OpenAI 书签应归入 AI/ML');
  });

  // ─── 6. 数据库/DevOps/其他领域识别 ─────────────────────────────────────

  it('6. 多领域识别 — 数据库/DevOps/安全/云服务', () => {
    const result = clusterer.cluster();

    const db = result.get('数据库');
    assert.ok(db, '应存在"数据库"分类');
    assert.ok(db.map(b => b.id).includes('9'), 'PostgreSQL 应归入数据库');
    assert.ok(db.map(b => b.id).includes('10'), 'Redis 应归入数据库');

    const devops = result.get('DevOps');
    assert.ok(devops, '应存在"DevOps"分类');
    assert.ok(devops.map(b => b.id).includes('11'), 'Docker 应归入 DevOps');
    assert.ok(devops.map(b => b.id).includes('12'), 'Kubernetes 应归入 DevOps');

    const sec = result.get('安全');
    assert.ok(sec, '应存在"安全"分类');
    assert.ok(sec.map(b => b.id).includes('18'), 'OWASP 应归入安全');

    const cloud = result.get('云服务');
    assert.ok(cloud, '应存在"云服务"分类');
    assert.ok(cloud.map(b => b.id).includes('19'), 'AWS Lambda 应归入云服务');
  });

  // ─── 7. "其他"分类兜底 ────────────────────────────────────────────────

  it('7. 未匹配书签归入"其他"分类', () => {
    const result = clusterer.cluster();
    const other = result.get('其他');

    assert.ok(other, '应存在"其他"分类');
    const ids = other.map(b => b.id);

    assert.ok(ids.includes('26'), '猫咪写真集应归入其他');
    assert.ok(ids.includes('27'), '烹饪食谱应归入其他');
  });

  // ─── 8. getCategories 返回正确格式 ────────────────────────────────────

  it('8. getCategories 返回分类概览列表', () => {
    const categories = clusterer.getCategories();

    assert.ok(Array.isArray(categories), '应返回数组');
    assert.ok(categories.length >= 10, '应有 10+ 个非空分类');

    for (const cat of categories) {
      assert.ok(typeof cat.name === 'string', '应有 name');
      assert.ok(typeof cat.count === 'number', '应有 count');
      assert.ok(cat.count > 0, 'count 应 > 0');
      assert.ok(Array.isArray(cat.keywords), '应有 keywords 数组');
    }

    // 确认主要分类都存在
    const names = categories.map(c => c.name);
    assert.ok(names.includes('前端'), '应包含前端');
    assert.ok(names.includes('后端'), '应包含后端');
    assert.ok(names.includes('AI/ML'), '应包含 AI/ML');
  });

  // ─── 9. moveBookmark 正常操作 ──────────────────────────────────────────

  it('9. moveBookmark — 成功移动书签到新分类', () => {
    // 把 "猫咪写真集" 从 "其他" 移到 "设计"
    const ok = clusterer.moveBookmark('26', '其他', '设计');
    assert.equal(ok, true, '移动应返回 true');

    const cat = clusterer.getCategoryForBookmark('26');
    assert.equal(cat, '设计', '移动后应在"设计"分类');
  });

  // ─── 10. moveBookmark 无效操作 ─────────────────────────────────────────

  it('10. moveBookmark — 无效操作返回 false', () => {
    // 书签不在指定的 fromCategory 中
    const ok = clusterer.moveBookmark('1', '数据库', '前端');
    assert.equal(ok, false, '来源分类不对应返回 false');

    // 不存在的书签
    const ok2 = clusterer.moveBookmark('nonexistent', '前端', '后端');
    assert.equal(ok2, false, '不存在的书签应返回 false');
  });

  // ─── 11. mergeCategories 正常操作 ─────────────────────────────────────

  it('11. mergeCategories — 成功合并两个分类', () => {
    const result = clusterer.cluster();
    const dbBefore = result.get('数据库');
    const dbCount = dbBefore ? dbBefore.length : 0;

    const ok = clusterer.mergeCategories('数据库', '后端', '后端与数据');
    assert.equal(ok, true, '合并应返回 true');

    const merged = clusterer.cluster().get('后端与数据');
    assert.ok(merged, '合并后应存在"后端与数据"');

    // 原分类不应存在
    assert.equal(clusterer.cluster().get('数据库'), undefined, '数据库分类应被移除');
    assert.equal(clusterer.cluster().get('后端'), undefined, '后端分类应被移除');
  });

  // ─── 12. mergeCategories 无效操作 ─────────────────────────────────────

  it('12. mergeCategories — 两个分类都不存在时返回 false', () => {
    const ok = clusterer.mergeCategories('不存在A', '不存在B', '合并');
    assert.equal(ok, false, '都不存在时应返回 false');
  });

  // ─── 13. getCategoryForBookmark ───────────────────────────────────────

  it('13. getCategoryForBookmark — 正确返回分类名', () => {
    assert.equal(clusterer.getCategoryForBookmark('1'), '前端', 'React 书签应在前端');
    assert.equal(clusterer.getCategoryForBookmark('6'), '后端', 'Node.js 书签应在后端');
    assert.equal(clusterer.getCategoryForBookmark('13'), 'AI/ML', 'TensorFlow 书签应在 AI/ML');
  });

  it('13b. getCategoryForBookmark — 不存在的书签返回 null', () => {
    assert.equal(clusterer.getCategoryForBookmark('nonexistent'), null, '不存在应返回 null');
    assert.equal(clusterer.getCategoryForBookmark('999'), null, '不存在应返回 null');
  });

  // ─── 14. 空输入处理 ───────────────────────────────────────────────────

  it('14. 空数组输入 — 不报错，返回空结果', () => {
    const empty = new BookmarkClusterer([]);
    const result = empty.cluster();
    assert.ok(result instanceof Map, '应返回 Map');
    assert.equal(result.size, 0, '空输入应无分类');

    const cats = empty.getCategories();
    assert.deepEqual(cats, [], '空输入 getCategories 应返回空数组');
  });

  it('14b. 非数组输入 — 不报错，等同空', () => {
    const bad = new BookmarkClusterer(null);
    const result = bad.cluster();
    assert.equal(result.size, 0, 'null 输入应无分类');

    const bad2 = new BookmarkClusterer(undefined);
    assert.equal(bad2.cluster().size, 0, 'undefined 输入应无分类');
  });

  // ─── 15. 中文关键词识别 ───────────────────────────────────────────────

  it('15. 中文关键词 — "机器学习"识别为 AI/ML', () => {
    const result = clusterer.cluster();
    const ai = result.get('AI/ML');

    assert.ok(ai, '应存在 AI/ML 分类');
    assert.ok(ai.map(b => b.id).includes('28'), '中文"机器学习"书签应归入 AI/ML');
  });

  it('15b. 中文关键词 — "前端框架"识别为前端', () => {
    const result = clusterer.cluster();
    const frontend = result.get('前端');
    assert.ok(frontend.map(b => b.id).includes('29'), '中文"前端框架"书签应归入前端');
  });

  it('15c. 中文关键词 — "数据库索引优化"识别为数据库', () => {
    const result = clusterer.cluster();
    const db = result.get('数据库');
    assert.ok(db, '应存在数据库分类');
    assert.ok(db.map(b => b.id).includes('30'), '中文"数据库索引优化"书签应归入数据库');
  });

  // ─── 16. 所有书签都被分类 ─────────────────────────────────────────────

  it('16. 所有书签都被分配到某个分类', () => {
    const result = clusterer.cluster();
    let total = 0;
    for (const [, bookmarks] of result) {
      total += bookmarks.length;
    }
    assert.equal(total, sampleBookmarks.length, `总分类书签数 ${total} 应等于输入数 ${sampleBookmarks.length}`);
  });

  // ─── 17. 多轮操作后状态一致 ──────────────────────────────────────────

  it('17. 多轮 moveBookmark + mergeCategories 后状态一致', () => {
    // 把所有前端书签逐个移到自定义分类
    const frontendBookmarks = clusterer.cluster().get('前端');
    for (const bm of frontendBookmarks) {
      clusterer.moveBookmark(bm.id, '前端', '自定义前端');
    }
    // 再把自定义前端和后端合并为"全栈开发"
    clusterer.mergeCategories('自定义前端', '后端', '全栈开发');

    const result = clusterer.cluster();
    const fullstack = result.get('全栈开发');
    assert.ok(fullstack, '应存在"全栈开发"');
    const ids = fullstack.map(b => b.id);
    assert.ok(ids.includes('1'), 'React 书签应在全栈开发');
    assert.ok(ids.includes('6'), 'Node.js 书签应在全栈开发');

    // 原分类应已消失
    assert.equal(result.get('前端'), undefined, '前端应已移除');
    assert.equal(result.get('自定义前端'), undefined, '自定义前端应已移除');
  });
});
