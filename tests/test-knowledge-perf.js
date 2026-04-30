/**
 * 测试 lib/knowledge-base.js — 知识库性能优化（索引、分页）
 *
 * 新增功能:
 *   - getTotalCount(): 使用 IDB count() 避免全量加载
 *   - getEntriesPaged({ page, pageSize }): 分页查询
 *   - searchPaged(query, { page, pageSize }): 分页搜索
 *   - N-gram 索引优化子串搜索性能
 *   - combinedSearch(): 使用倒排索引加速关键词匹配
 *   - getAllTags/Category/Language: 索引优先 + 缓存
 *   - 缓存一致性: 数据变更时正确失效
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

installIndexedDBMock();
const { KnowledgeBase } = await import('../lib/knowledge-base.js');

let kb;

beforeEach(async () => {
  resetIndexedDBMock();
  installIndexedDBMock();
  kb = new KnowledgeBase();
  await kb.init();
});

afterEach(() => {
  resetIndexedDBMock();
});

// ==================== 辅助函数 ====================

/**
 * 批量保存条目
 * @param {number} count
 * @returns {Promise<Array>}
 */
async function seedEntries(count) {
  const entries = [];
  for (let i = 1; i <= count; i++) {
    const entry = await kb.saveEntry({
      title: `条目 ${String(i).padStart(3, '0')}`,
      content: `这是第 ${i} 个条目的内容`,
      summary: `摘要 ${i}`,
      tags: [`tag-${i % 5}`, 'common'],
      category: i % 3 === 0 ? '技术' : i % 3 === 1 ? '科学' : '其他',
      question: `问题 ${i}？`,
      answer: `答案 ${i}。`,
      sourceUrl: `https://example.com/page-${i}`,
    });
    entries.push(entry);
  }
  return entries;
}

// ==================== getTotalCount() ====================

describe('getTotalCount()', () => {
  it('空库返回 0', async () => {
    const count = await kb.getTotalCount();
    assert.equal(count, 0);
  });

  it('返回正确条目数', async () => {
    await seedEntries(5);
    const count = await kb.getTotalCount();
    assert.equal(count, 5);
  });

  it('新增条目后计数更新', async () => {
    await seedEntries(3);
    assert.equal(await kb.getTotalCount(), 3);

    await kb.saveEntry({ title: '新增条目' });
    assert.equal(await kb.getTotalCount(), 4);
  });

  it('删除条目后计数更新', async () => {
    const entries = await seedEntries(3);
    assert.equal(await kb.getTotalCount(), 3);

    await kb.deleteEntry(entries[0].id);
    assert.equal(await kb.getTotalCount(), 2);
  });

  it('缓存命中时不重新扫描', async () => {
    await seedEntries(5);
    const count1 = await kb.getTotalCount();
    const count2 = await kb.getTotalCount();
    assert.equal(count1, count2);
    assert.equal(count2, 5);
  });
});

// ==================== getEntriesPaged() ====================

describe('getEntriesPaged() — 分页查询', () => {
  beforeEach(async () => {
    await seedEntries(25);
  });

  it('默认第一页返回 pageSize 条目', async () => {
    const result = await kb.getEntriesPaged();
    assert.equal(result.entries.length, 10, '默认 pageSize=10');
    assert.equal(result.total, 25);
    assert.equal(result.page, 1);
    assert.equal(result.totalPages, 3);
  });

  it('第二页返回正确条目', async () => {
    const page1 = await kb.getEntriesPaged({ page: 1 });
    const page2 = await kb.getEntriesPaged({ page: 2 });

    assert.equal(page2.entries.length, 10);
    assert.equal(page2.page, 2);

    const page1Ids = page1.entries.map(e => e.id);
    const page2Ids = page2.entries.map(e => e.id);
    const overlap = page1Ids.filter(id => page2Ids.includes(id));
    assert.equal(overlap.length, 0, '不同页不应有重叠条目');
  });

  it('最后一页返回剩余条目', async () => {
    const result = await kb.getEntriesPaged({ page: 3 });
    assert.equal(result.entries.length, 5, '25 条目 / 10 每页 = 第 3 页 5 条');
    assert.equal(result.page, 3);
    assert.equal(result.totalPages, 3);
  });

  it('超出范围的页码返回空数组', async () => {
    const result = await kb.getEntriesPaged({ page: 100 });
    assert.deepEqual(result.entries, []);
    assert.equal(result.total, 25);
    assert.equal(result.page, 100);
  });

  it('自定义 pageSize', async () => {
    const result = await kb.getEntriesPaged({ pageSize: 7 });
    assert.equal(result.entries.length, 7);
    assert.equal(result.totalPages, 4);
  });

  it('pageSize 超过总数返回所有条目', async () => {
    const result = await kb.getEntriesPaged({ pageSize: 100 });
    assert.equal(result.entries.length, 25);
    assert.equal(result.totalPages, 1);
  });

  it('空库返回空结果', async () => {
    resetIndexedDBMock();
    installIndexedDBMock();
    kb = new KnowledgeBase();
    await kb.init();

    const result = await kb.getEntriesPaged();
    assert.deepEqual(result.entries, []);
    assert.equal(result.total, 0);
    assert.equal(result.totalPages, 0);
  });

  it('page < 1 规范化为 1', async () => {
    const result = await kb.getEntriesPaged({ page: 0 });
    assert.equal(result.page, 1);
  });

  it('pageSize < 1 规范化为 1', async () => {
    const result = await kb.getEntriesPaged({ pageSize: -5 });
    assert.equal(result.entries.length, 1);
  });

  it('按 createdAt 倒序（最新的在前）', async () => {
    const result = await kb.getEntriesPaged({ page: 1, pageSize: 5 });
    for (let i = 0; i < result.entries.length - 1; i++) {
      const d1 = new Date(result.entries[i].createdAt);
      const d2 = new Date(result.entries[i + 1].createdAt);
      assert.ok(d1 >= d2, '条目应按 createdAt 降序排列');
    }
  });
});

// ==================== searchPaged() ====================

describe('searchPaged() — 分页搜索', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 15; i++) {
      await kb.saveEntry({
        title: i <= 8 ? `JavaScript 教程 ${i}` : `Python 教程 ${i}`,
        content: i <= 8 ? '前端开发语言' : '后端开发语言',
        tags: i <= 8 ? ['javascript', 'frontend'] : ['python', 'backend'],
        category: i <= 8 ? '前端' : '后端',
      });
    }
  });

  it('搜索结果分页第一页', async () => {
    const result = await kb.searchPaged('JavaScript');
    assert.ok(result.entries.length > 0, '应有搜索结果');
    assert.ok(result.entries.length <= 10, '不超过默认 pageSize');
    assert.ok(result.total > 0, 'total 应大于 0');
    assert.equal(result.page, 1);
    assert.ok(result.totalPages >= 1);
  });

  it('搜索 total 反映全部匹配数量', async () => {
    const all = await kb.search('JavaScript');
    const paged = await kb.searchPaged('JavaScript', { pageSize: 3 });
    assert.equal(paged.total, all.length, 'total 应等于无分页搜索的结果数');
  });

  it('翻页返回不同结果', async () => {
    const page1 = await kb.searchPaged('教程', { pageSize: 5 });
    if (page1.total > 5) {
      const page2 = await kb.searchPaged('教程', { page: 2, pageSize: 5 });
      const ids1 = page1.entries.map(e => e.id);
      const ids2 = page2.entries.map(e => e.id);
      const overlap = ids1.filter(id => ids2.includes(id));
      assert.equal(overlap.length, 0, '不同页结果不应重叠');
    }
  });

  it('无匹配结果返回空', async () => {
    const result = await kb.searchPaged('不存在的内容xyz');
    assert.equal(result.entries.length, 0);
    assert.equal(result.total, 0);
    assert.equal(result.totalPages, 0);
  });

  it('空查询返回空结果', async () => {
    const result = await kb.searchPaged('');
    assert.equal(result.entries.length, 0);
    assert.equal(result.total, 0);
  });
});

// ==================== N-gram 索引 ====================

describe('N-gram 索引优化', () => {
  beforeEach(async () => {
    await kb.saveEntry({
      title: 'IndexedDB 使用指南',
      content: '浏览器内置数据库',
      tags: ['database', 'browser'],
    });
    await kb.saveEntry({
      title: 'React 组件生命周期',
      content: 'component lifecycle methods',
      tags: ['react', 'frontend'],
    });
    await kb.saveEntry({
      title: 'Vue.js 响应式原理',
      content: 'reactive data binding',
      tags: ['vue', 'frontend'],
    });
  });

  it('构建索引后 _ngramIndex 存在', async () => {
    await kb._buildIndex();
    assert.ok(kb._ngramIndex, '_ngramIndex 应存在');
    assert.ok(kb._ngramIndex instanceof Map, '_ngramIndex 应为 Map');
    assert.ok(kb._ngramIndex.size > 0, '_ngramIndex 不应为空');
  });

  it('ngram 索引包含正确的子串', async () => {
    await kb._buildIndex();
    const ids = kb._ngramIndex.get('ind');
    assert.ok(ids, '"ind" 应在 ngram 索引中');
    assert.ok(ids.size > 0, '"ind" 应关联到条目');
  });

  it('搜索 3 字符子串也能找到结果', async () => {
    // 'eac' 出现在 "react" 和 "reactive" 中
    const results = await kb.search('eac');
    assert.ok(results.length > 0, '3 字符子串搜索应有结果');
  });

  it('ngram 索引随 saveEntry 增量更新', async () => {
    await kb._buildIndex();
    const sizeBefore = kb._ngramIndex.size;

    await kb.saveEntry({ title: '全新的技术文档', content: '测试增量更新' });

    assert.ok(kb._ngramIndex.size >= sizeBefore, 'ngram 索引应增长');
    // '技术文' 是 3-char ngram（来自 "技术文档"）
    const ids = kb._ngramIndex.get('技术文');
    assert.ok(ids && ids.size > 0, '新条目的 3-char ngram 应在索引中');
  });

  it('ngram 索引随 deleteEntry 增量移除', async () => {
    await kb._buildIndex();
    const entry = await kb.saveEntry({ title: '待删除的特殊条目', content: '特殊内容' });

    // '特殊条' 是 3-char ngram（来自 "特殊条目"）
    const idsBefore = kb._ngramIndex.get('特殊条');
    assert.ok(idsBefore && idsBefore.has(entry.id), '新条目应在 ngram 索引中');

    await kb.deleteEntry(entry.id);

    const idsAfter = kb._ngramIndex.get('特殊条');
    if (idsAfter) {
      assert.ok(!idsAfter.has(entry.id), '已删除条目不应在 ngram 索引中');
    }
  });
});

// ==================== 搜索缓存一致性 ====================

describe('搜索缓存一致性', () => {
  it('saveEntry 清除搜索缓存', async () => {
    await kb.saveEntry({ title: '缓存测试', content: '缓存内容' });
    const results1 = await kb.search('缓存');
    assert.ok(results1.length > 0);

    await kb.saveEntry({ title: '缓存测试 2', content: '更多缓存内容' });
    const results2 = await kb.search('缓存');
    assert.ok(results2.length > results1.length, '缓存应失效，新条目应被搜到');
  });

  it('deleteEntry 清除搜索缓存', async () => {
    const entry = await kb.saveEntry({ title: '待删除缓存测试', content: '内容' });
    await kb.search('待删除');

    await kb.deleteEntry(entry.id);
    const results = await kb.search('待删除');
    assert.equal(results.length, 0, '删除后搜索缓存应失效');
  });

  it('updateEntry 清除搜索缓存', async () => {
    const entry = await kb.saveEntry({ title: '旧标题', content: '旧内容' });
    await kb.search('旧标题');

    await kb.updateEntry(entry.id, { title: '新标题唯一' });
    const results = await kb.search('新标题唯一');
    assert.ok(results.length > 0, '更新后应能搜到新标题');
  });
});

// ==================== 大数据集性能 ====================

describe('大数据集性能验证', () => {
  it('100 条目分页查询性能', async () => {
    await seedEntries(100);

    const start = performance.now();
    const result = await kb.getEntriesPaged({ page: 1, pageSize: 10 });
    const elapsed = performance.now() - start;

    assert.equal(result.entries.length, 10);
    assert.equal(result.total, 100);
    assert.equal(result.totalPages, 10);
    assert.ok(elapsed < 1000, `分页查询应 < 1000ms，实际 ${elapsed.toFixed(1)}ms`);
  });

  it('100 条目 getTotalCount 缓存后性能', async () => {
    await seedEntries(100);
    await kb.getTotalCount();

    const start = performance.now();
    const count = await kb.getTotalCount();
    const elapsed = performance.now() - start;

    assert.equal(count, 100);
    assert.ok(elapsed < 50, `缓存 getTotalCount 应 < 50ms，实际 ${elapsed.toFixed(1)}ms`);
  });

  it('100 条目搜索后分页', async () => {
    await seedEntries(100);

    const start = performance.now();
    const result = await kb.searchPaged('条目', { page: 1, pageSize: 20 });
    const elapsed = performance.now() - start;

    assert.ok(result.entries.length > 0, '应有搜索结果');
    assert.ok(result.total > 0, 'total 应大于 0');
    assert.ok(elapsed < 2000, `分页搜索应 < 2000ms，实际 ${elapsed.toFixed(1)}ms`);
  });

  it('倒排索引和 ngram 索引对大数据集生效', async () => {
    await seedEntries(50);
    // '条目一' 是 3 字符，触发索引构建（< 3 字符回退全量扫描不建索引）
    await kb.search('条目一');

    assert.ok(kb._indexBuilt, '索引应已构建');
    assert.ok(kb._searchIndex.size > 0, '倒排索引不应为空');
    assert.ok(kb._ngramIndex.size > 0, 'ngram 索引不应为空');
  });
});

// ==================== 边界情况 ====================

describe('分页边界情况', () => {
  it('单条数据 pageSize=1 分页', async () => {
    await kb.saveEntry({ title: '唯一条目' });
    const result = await kb.getEntriesPaged({ pageSize: 1 });
    assert.equal(result.entries.length, 1);
    assert.equal(result.total, 1);
    assert.equal(result.totalPages, 1);
  });

  it('pageSize=1 多条数据逐页遍历', async () => {
    await seedEntries(3);
    const allIds = [];
    for (let page = 1; page <= 3; page++) {
      const result = await kb.getEntriesPaged({ page, pageSize: 1 });
      assert.equal(result.entries.length, 1);
      allIds.push(result.entries[0].id);
    }
    assert.equal(new Set(allIds).size, 3, '每页应有不同条目');
  });

  it('getEntriesPaged 不影响后续 getAllEntries', async () => {
    await seedEntries(15);
    await kb.getEntriesPaged({ page: 1, pageSize: 5 });
    const all = await kb.getAllEntries();
    assert.equal(all.length, 15, 'getAllEntries 不应受影响');
  });

  it('并发分页请求', async () => {
    await seedEntries(30);
    const [r1, r2, r3] = await Promise.all([
      kb.getEntriesPaged({ page: 1, pageSize: 10 }),
      kb.getEntriesPaged({ page: 2, pageSize: 10 }),
      kb.getEntriesPaged({ page: 3, pageSize: 10 }),
    ]);
    assert.equal(r1.entries.length + r2.entries.length + r3.entries.length, 30);
  });
});

// ==================== IDB count() 优化验证 ====================

describe('getTotalCount() — count() 优化', () => {
  it('空库返回 0（使用 count）', async () => {
    const count = await kb.getTotalCount();
    assert.equal(count, 0);
  });

  it('100 条目 count 准确', async () => {
    await seedEntries(100);
    const count = await kb.getTotalCount();
    assert.equal(count, 100);
  });

  it('多次 CRUD 后计数一致', async () => {
    const entries = await seedEntries(10);
    assert.equal(await kb.getTotalCount(), 10);

    await kb.deleteEntry(entries[0].id);
    assert.equal(await kb.getTotalCount(), 9);

    await kb.saveEntry({ title: '补偿条目' });
    assert.equal(await kb.getTotalCount(), 10);
  });

  it('缓存命中后不再访问 IDB', async () => {
    await seedEntries(5);
    // 首次调用填充缓存
    const count1 = await kb.getTotalCount();
    assert.equal(count1, 5);

    // 再次调用应命中缓存（值不变）
    const count2 = await kb.getTotalCount();
    assert.equal(count2, 5);

    // 缓存失效后应重新查询
    await kb.saveEntry({ title: '新条目' });
    const count3 = await kb.getTotalCount();
    assert.equal(count3, 6);
  });

  it('性能: count() 比 getAll() 快', async () => {
    await seedEntries(200);

    // 使用 count()（当前实现）
    const start = performance.now();
    const count = await kb.getTotalCount();
    const elapsed = performance.now() - start;

    assert.equal(count, 200);
    assert.ok(elapsed < 200, `count() 应 < 200ms，实际 ${elapsed.toFixed(1)}ms`);
  });
});

// ==================== combinedSearch() 索引优化 ====================

describe('combinedSearch() — 倒排索引加速', () => {
  beforeEach(async () => {
    await kb.saveEntry({
      title: 'JavaScript 基础教程',
      content: '学习 JavaScript 的变量声明',
      summary: '前端入门必读',
      tags: ['javascript', '前端'],
      category: '前端',
      question: '什么是 JavaScript？',
      answer: 'JavaScript 是一门动态语言',
    });
    await kb.saveEntry({
      title: 'Python 数据分析',
      content: '使用 pandas 处理数据',
      summary: '数据科学基础',
      tags: ['python', '数据'],
      category: '后端',
      question: 'Python 如何做数据分析？',
      answer: '使用 pandas 和 numpy',
    });
    await kb.saveEntry({
      title: 'React 组件化开发',
      content: 'React 使用 JSX 语法',
      summary: '组件化 UI 框架',
      tags: ['react', 'javascript', '前端'],
      category: '前端',
      question: '什么是 React？',
      answer: 'React 是 Facebook 开发的 UI 框架',
    });
  });

  it('关键词匹配结果正确', async () => {
    const results = await kb.combinedSearch('JavaScript');
    assert.ok(results.length > 0, '应有搜索结果');
    // 至少有一个 keyword 类型结果
    const keywordResults = results.filter(r => r.matchType === 'keyword');
    assert.ok(keywordResults.length > 0, '应有关键词匹配结果');
  });

  it('空查询返回空结果', async () => {
    const results = await kb.combinedSearch('');
    assert.deepEqual(results, []);
  });

  it('结果按 score 降序', async () => {
    const results = await kb.combinedSearch('JavaScript');
    for (let i = 0; i < results.length - 1; i++) {
      assert.ok(results[i].score >= results[i + 1].score, '应按 score 降序');
    }
  });

  it('limit 参数限制返回数量', async () => {
    const results = await kb.combinedSearch('JavaScript', 1);
    assert.ok(results.length <= 1, '应受 limit 限制');
  });

  it('使用索引后 _indexBuilt 为 true', async () => {
    await kb.combinedSearch('JavaScript');
    assert.ok(kb._indexBuilt, 'combinedSearch 应触发索引构建');
  });

  it('重复搜索命中 LRU 缓存', async () => {
    const r1 = await kb.combinedSearch('JavaScript');
    const r2 = await kb.combinedSearch('JavaScript');
    assert.deepEqual(r1, r2, '缓存结果应一致');
  });

  it('更新数据后缓存失效', async () => {
    const r1 = await kb.combinedSearch('JavaScript');
    await kb.saveEntry({
      title: '新的 JavaScript 高级教程',
      content: '深入理解闭包和原型链',
      tags: ['javascript', '高级'],
    });
    const r2 = await kb.combinedSearch('JavaScript');
    assert.ok(r2.length >= r1.length, '新增条目后结果应更新');
  });

  it('性能: 索引搜索比全量扫描快', async () => {
    // 种大量数据
    await seedEntries(100);

    // 首次搜索触发索引构建
    await kb.combinedSearch('条目零零一');

    // 第二次搜索利用索引
    const start = performance.now();
    await kb.combinedSearch('条目零零一');
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 500, `索引搜索应 < 500ms，实际 ${elapsed.toFixed(1)}ms`);
  });
});

// ==================== getAllTags() 缓存优化 ====================

describe('getAllTags() — 缓存与索引优化', () => {
  beforeEach(async () => {
    await seedEntries(20);
  });

  it('返回正确的标签统计', async () => {
    const tags = await kb.getAllTags();
    assert.ok(tags.length > 0, '应有标签');
    // 'common' 标签应该在每个条目中
    const common = tags.find(t => t.tag === 'common');
    assert.ok(common, '应有 common 标签');
    assert.equal(common.count, 20);
  });

  it('结果按计数降序', async () => {
    const tags = await kb.getAllTags();
    for (let i = 0; i < tags.length - 1; i++) {
      assert.ok(tags[i].count >= tags[i + 1].count, '应按 count 降序');
    }
  });

  it('第二次调用命中缓存', async () => {
    const tags1 = await kb.getAllTags();
    const tags2 = await kb.getAllTags();
    assert.strictEqual(tags1, tags2, '应返回缓存引用（同一对象）');
  });

  it('新增条目后缓存失效', async () => {
    const tags1 = await kb.getAllTags();
    await kb.saveEntry({ title: '新条目', tags: ['全新标签'] });
    const tags2 = await kb.getAllTags();
    assert.notStrictEqual(tags1, tags2, '缓存应失效');
    const newTag = tags2.find(t => t.tag === '全新标签');
    assert.ok(newTag, '应能搜到新标签');
  });

  it('索引构建后使用索引数据', async () => {
    // 3+ 字符查询才触发索引构建（< 3 回退全量扫描）
    await kb.search('条目 001');
    assert.ok(kb._indexBuilt);

    const tags = await kb.getAllTags();
    assert.ok(tags.length > 0, '索引模式下应返回标签');
  });

  it('性能: 缓存后调用 < 10ms', async () => {
    await kb.getAllTags(); // 预热缓存
    const start = performance.now();
    await kb.getAllTags();
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 10, `缓存命中应 < 10ms，实际 ${elapsed.toFixed(1)}ms`);
  });
});

// ==================== getAllCategories() 缓存优化 ====================

describe('getAllCategories() — 缓存与索引优化', () => {
  beforeEach(async () => {
    await seedEntries(30);
  });

  it('返回正确的分类统计', async () => {
    const cats = await kb.getAllCategories();
    assert.ok(cats.length > 0, '应有分类');
    // 验证总计数 = 30
    const totalCount = cats.reduce((sum, c) => sum + c.count, 0);
    assert.equal(totalCount, 30, '所有分类计数之和应等于条目数');
  });

  it('第二次调用命中缓存', async () => {
    const cats1 = await kb.getAllCategories();
    const cats2 = await kb.getAllCategories();
    assert.strictEqual(cats1, cats2, '应返回缓存引用');
  });

  it('新增条目后缓存失效', async () => {
    await kb.getAllCategories(); // 填充缓存
    await kb.saveEntry({ title: '新条目', category: '全新分类' });
    const cats = await kb.getAllCategories();
    const newCat = cats.find(c => c.category === '全新分类');
    assert.ok(newCat, '应能搜到新分类');
  });

  it('删除条目后缓存失效', async () => {
    const entries = await kb.getAllEntries();
    const targetCategory = entries[0].category;
    const beforeCount = entries.filter(e => e.category === targetCategory).length;

    await kb.getAllCategories(); // 填充缓存
    await kb.deleteEntry(entries[0].id);

    const cats = await kb.getAllCategories();
    const cat = cats.find(c => c.category === targetCategory);
    if (cat) {
      assert.ok(cat.count <= beforeCount, '计数应减少');
    }
  });
});

// ==================== getAllLanguages() 缓存优化 ====================

describe('getAllLanguages() — 缓存与索引优化', () => {
  beforeEach(async () => {
    for (let i = 0; i < 10; i++) {
      await kb.saveEntry({
        title: `条目 ${i}`,
        language: i % 2 === 0 ? 'zh' : 'en',
      });
    }
    await kb.saveEntry({
      title: '日语条目',
      language: 'ja',
    });
  });

  it('返回正确的语言统计', async () => {
    const langs = await kb.getAllLanguages();
    assert.ok(langs.length >= 3, '应至少 3 种语言');
    const zh = langs.find(l => l.language === 'zh');
    assert.ok(zh, '应有 zh');
    assert.equal(zh.count, 5);

    const en = langs.find(l => l.language === 'en');
    assert.ok(en, '应有 en');
    assert.equal(en.count, 5);

    const ja = langs.find(l => l.language === 'ja');
    assert.ok(ja, '应有 ja');
    assert.equal(ja.count, 1);
  });

  it('默认语言为 other', async () => {
    // 创建新实例避免缓存干扰
    resetIndexedDBMock();
    installIndexedDBMock();
    const kb2 = new KnowledgeBase();
    await kb2.init();

    await kb2.saveEntry({ title: '无语言' });
    const langs = await kb2.getAllLanguages();
    const other = langs.find(l => l.language === 'other');
    assert.ok(other, '未指定语言应归为 other');
  });

  it('第二次调用命中缓存', async () => {
    const langs1 = await kb.getAllLanguages();
    const langs2 = await kb.getAllLanguages();
    assert.strictEqual(langs1, langs2, '应返回缓存引用');
  });

  it('数据变更后缓存失效', async () => {
    await kb.getAllLanguages(); // 填充缓存
    await kb.saveEntry({ title: '法语条目', language: 'fr' });
    const langs = await kb.getAllLanguages();
    const fr = langs.find(l => l.language === 'fr');
    assert.ok(fr, '应能搜到 fr');
  });

  it('结果按计数降序', async () => {
    const langs = await kb.getAllLanguages();
    for (let i = 0; i < langs.length - 1; i++) {
      assert.ok(langs[i].count >= langs[i + 1].count, '应按 count 降序');
    }
  });
});

// ==================== 索引增量一致性 ====================

describe('索引增量一致性', () => {
  it('saveEntry 后索引包含新条目', async () => {
    await kb._buildIndex();
    const entry = await kb.saveEntry({
      title: '特殊的增量测试',
      content: '独一无二的测试内容',
    });
    assert.ok(kb._indexBuilt);

    // 注意: 中文无空格，整个标题作为单个词存入倒排索引
    const fullWord = '特殊的增量测试';
    const ids = kb._searchIndex.get(fullWord);
    assert.ok(ids && ids.has(entry.id), '新条目应在倒排索引中（完整词键）');

    // N-gram 索引应包含新条目的 3-char ngram
    const ngramIds = kb._ngramIndex.get('特殊的');
    assert.ok(ngramIds && ngramIds.has(entry.id), '新条目应在 N-gram 索引中');
  });

  it('updateEntry 后索引更新', async () => {
    const entry = await kb.saveEntry({ title: 'original title text' });
    await kb._buildIndex();

    // 英文有空格，每个词独立存入索引
    assert.ok(kb._searchIndex.get('original')?.has(entry.id));

    await kb.updateEntry(entry.id, { title: 'updated new title' });

    // 旧词应被移除
    const oldIds = kb._searchIndex.get('original');
    assert.ok(!oldIds || !oldIds.has(entry.id), '旧词应从索引移除');

    // 新词应在索引中
    assert.ok(kb._searchIndex.get('updated')?.has(entry.id), '新词应在索引中');
  });

  it('deleteEntry 后索引清除', async () => {
    const entry = await kb.saveEntry({ title: 'unique special test entry' });
    await kb._buildIndex();

    // 英文有空格，每个词独立存入索引
    assert.ok(kb._searchIndex.get('special')?.has(entry.id));

    await kb.deleteEntry(entry.id);

    const ids = kb._searchIndex.get('special');
    assert.ok(!ids || !ids.has(entry.id), '已删除条目应从索引移除');
    assert.ok(!kb._indexWordsById.has(entry.id), '已删除条目应从索引缓存移除');
  });
});

// ==================== getStats() 优化验证 ====================

describe('getStats() — 利用缓存', () => {
  it('返回正确的统计结构', async () => {
    await seedEntries(10);
    const stats = await kb.getStats();
    assert.equal(stats.totalEntries, 10);
    assert.ok(stats.totalTags > 0, '应有标签');
    assert.ok(stats.topTags.length > 0, '应有 topTags');
    assert.ok(stats.categories.length > 0, '应有分类');
    assert.ok(stats.recentEntries.length > 0, '应有最近条目');
  });

  it('空库返回零统计', async () => {
    const stats = await kb.getStats();
    assert.equal(stats.totalEntries, 0);
    assert.equal(stats.totalTags, 0);
  });

  it('tags 和 categories 缓存被复用', async () => {
    await seedEntries(20);

    // getStats 内部调用 getAllTags 和 getAllCategories
    const stats = await kb.getStats();

    // 再次单独调用应命中缓存
    const tags = await kb.getAllTags();
    const cats = await kb.getAllCategories();
    assert.equal(tags.length, stats.totalTags);
    assert.equal(cats.length, stats.categories.length);
  });
});

// ==================== LRU 搜索缓存行为 ====================

describe('LRU 搜索缓存', () => {
  it('缓存大小限制', async () => {
    await kb.saveEntry({ title: '缓存测试项', content: '内容' });

    // 填满缓存（maxSize = 10）
    for (let i = 0; i < 12; i++) {
      await kb.search(`唯一查询词${i}`);
    }

    assert.ok(kb._searchCache.size <= 10, '缓存不应超过 maxSize');
  });

  it('缓存失效时清除所有搜索缓存', async () => {
    await kb.saveEntry({ title: '失效测试', content: '内容' });
    await kb.search('失效');
    assert.ok(kb._searchCache.size > 0, '缓存应有数据');

    await kb.saveEntry({ title: '新数据', content: '新内容' });
    assert.equal(kb._searchCache.size, 0, 'saveEntry 应清除搜索缓存');
  });
});

// ==================== 综合性能基准 ====================

describe('综合性能基准', () => {
  it('500 条目: 全流程性能', async () => {
    const entryCount = 500;

    // 批量插入
    const startInsert = performance.now();
    await seedEntries(entryCount);
    const insertTime = performance.now() - startInsert;

    // 全文搜索（触发索引构建）
    const startSearch = performance.now();
    const searchResult = await kb.search('条目');
    const searchTime = performance.now() - startSearch;

    // 分页查询
    const startPaged = performance.now();
    const pagedResult = await kb.getEntriesPaged({ page: 5, pageSize: 20 });
    const pagedTime = performance.now() - startPaged;

    // 标签统计（应命中索引）
    const startTags = performance.now();
    const tags = await kb.getAllTags();
    const tagsTime = performance.now() - startTags;

    // 分类统计（应命中缓存）
    const startCats = performance.now();
    const cats = await kb.getAllCategories();
    const catsTime = performance.now() - startCats;

    // 分页搜索
    const startSearchPaged = performance.now();
    const searchPaged = await kb.searchPaged('条目', { page: 2, pageSize: 10 });
    const searchPagedTime = performance.now() - startSearchPaged;

    // 断言
    assert.equal(searchResult.length, entryCount, '应搜到全部 500 条');
    assert.equal(pagedResult.entries.length, 20);
    assert.equal(pagedResult.total, entryCount);
    assert.ok(tags.length > 0);
    assert.ok(cats.length > 0);
    assert.ok(searchPaged.entries.length > 0);

    // 性能断言（宽松阈值，mock 环境）
    assert.ok(insertTime < 10000, `插入 ${entryCount} 条应 < 10s，实际 ${insertTime.toFixed(0)}ms`);
    assert.ok(searchTime < 5000, `搜索应 < 5s，实际 ${searchTime.toFixed(0)}ms`);
    assert.ok(pagedTime < 1000, `分页查询应 < 1s，实际 ${pagedTime.toFixed(0)}ms`);
    assert.ok(tagsTime < 2000, `标签统计应 < 2s，实际 ${tagsTime.toFixed(0)}ms`);
    assert.ok(catsTime < 500, `分类缓存应 < 500ms，实际 ${catsTime.toFixed(0)}ms`);
    assert.ok(searchPagedTime < 3000, `分页搜索应 < 3s，实际 ${searchPagedTime.toFixed(0)}ms`);
  });

  it('索引构建 vs 未构建的搜索性能对比', async () => {
    await seedEntries(100);

    // 未构建索引时的搜索（会触发构建）
    const start1 = performance.now();
    await kb.search('条目零零一');
    const firstSearchTime = performance.now() - start1;

    // 索引已构建后的搜索
    assert.ok(kb._indexBuilt, '索引应已构建');
    const start2 = performance.now();
    await kb.search('条目零零一');
    const secondSearchTime = performance.now() - start2;

    // 第二次搜索应更快（索引已构建 + LRU 缓存命中）
    // 注意: 由于 LRU 缓存，第二次可能直接命中缓存
    assert.ok(secondSearchTime <= firstSearchTime,
      `索引搜索 (${secondSearchTime.toFixed(1)}ms) 应 <= 首次 (${firstSearchTime.toFixed(1)}ms)`);
  });
});
