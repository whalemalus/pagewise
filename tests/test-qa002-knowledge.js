/**
 * QA002 功能正确性测试 — 知识库模块
 *
 * 测试范围：条目 CRUD、全文搜索、标签/分类、去重、导出、批量操作
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/setup.js';

// 先安装 IndexedDB mock，再导入 knowledge-base
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

// ==================== 初始化 ====================

describe('QA002-knowledge: 初始化', () => {
  it('init() 后 db 不为 null 且包含正确对象存储', () => {
    assert.ok(kb.db, 'db 应已初始化');
    assert.ok(kb.db.objectStoreNames.contains('entries'));
    assert.ok(kb.db.objectStoreNames.contains('conversations'));
  });

  it('ensureInit() 不会重复初始化', async () => {
    const dbBefore = kb.db;
    await kb.ensureInit();
    assert.equal(kb.db, dbBefore, '不应重新初始化');
  });
});

// ==================== 条目 CRUD ====================

describe('QA002-knowledge: 条目 CRUD', () => {
  it('saveEntry 保存并返回含 id 的完整记录', async () => {
    const entry = await kb.saveEntry({
      title: 'JavaScript 闭包',
      content: '闭包是函数与其词法环境的组合',
      tags: ['javascript', '基础'],
      category: '前端',
      question: '什么是闭包？',
      answer: '闭包是指函数可以访问其外部作用域的变量',
      language: 'zh'
    });

    assert.ok(entry.id, '应生成 id');
    assert.equal(entry.title, 'JavaScript 闭包');
    assert.equal(entry.content, '闭包是函数与其词法环境的组合');
    assert.deepEqual(entry.tags, ['javascript', '基础']);
    assert.equal(entry.category, '前端');
    assert.equal(entry.language, 'zh');
    assert.ok(entry.createdAt);
    assert.ok(entry.updatedAt);
  });

  it('saveEntry 空对象使用默认值', async () => {
    const entry = await kb.saveEntry({});
    assert.equal(entry.title, '未命名');
    assert.equal(entry.content, '');
    assert.deepEqual(entry.tags, []);
    assert.equal(entry.category, '未分类');
  });

  it('getEntry 获取已保存条目', async () => {
    const saved = await kb.saveEntry({ title: '查询测试' });
    const found = await kb.getEntry(saved.id);
    assert.ok(found);
    assert.equal(found.title, '查询测试');
  });

  it('getEntry 不存在的 id 返回 null', async () => {
    const found = await kb.getEntry(99999);
    assert.equal(found, null);
  });

  it('updateEntry 更新已有条目字段', async () => {
    const saved = await kb.saveEntry({ title: '原始', category: '旧分类' });
    const updated = await kb.updateEntry(saved.id, { title: '更新后', category: '新分类' });

    assert.equal(updated.title, '更新后');
    assert.equal(updated.category, '新分类');
    assert.ok(updated.updatedAt >= saved.updatedAt);

    // 重新读取确认持久化
    const refetched = await kb.getEntry(saved.id);
    assert.equal(refetched.title, '更新后');
  });

  it('deleteEntry 删除条目后 getEntry 返回 null', async () => {
    const saved = await kb.saveEntry({ title: '待删除' });
    await kb.deleteEntry(saved.id);
    const found = await kb.getEntry(saved.id);
    assert.equal(found, null);
  });

  it('getAllEntries 返回所有条目（倒序）', async () => {
    await kb.saveEntry({ title: 'A' });
    await kb.saveEntry({ title: 'B' });
    await kb.saveEntry({ title: 'C' });

    const all = await kb.getAllEntries();
    assert.equal(all.length, 3);
    // 倒序：最新在前
    assert.equal(all[0].title, 'C');
    assert.equal(all[2].title, 'A');
  });

  it('getAllEntries limit 参数限制返回数量', async () => {
    await kb.saveEntry({ title: 'X' });
    await kb.saveEntry({ title: 'Y' });
    await kb.saveEntry({ title: 'Z' });

    const limited = await kb.getAllEntries(2);
    assert.equal(limited.length, 2);
  });
});

// ==================== 全文搜索 ====================

describe('QA002-knowledge: 全文搜索', () => {
  beforeEach(async () => {
    await kb.saveEntry({
      title: 'React Hooks 详解',
      content: 'useState useEffect 组件化',
      tags: ['react', 'hooks'],
      category: '前端'
    });
    await kb.saveEntry({
      title: 'Python 入门教程',
      content: 'print hello world',
      tags: ['python', '入门'],
      category: '后端'
    });
    await kb.saveEntry({
      title: 'Vue 组件开发',
      content: '响应式数据绑定',
      tags: ['vue', '前端'],
      category: '前端'
    });
  });

  it('search 按标题关键词匹配', async () => {
    const results = await kb.search('React');
    assert.ok(results.length >= 1);
    assert.ok(results.some(e => e.title.includes('React')));
  });

  it('search 不区分大小写', async () => {
    const results = await kb.search('python');
    assert.equal(results.length, 1);
    assert.ok(results[0].title.includes('Python'));
  });

  it('searchByTag 按标签精确搜索', async () => {
    const reactEntries = await kb.searchByTag('react');
    assert.equal(reactEntries.length, 1);
    assert.ok(reactEntries[0].tags.includes('react'));

    const frontendEntries = await kb.searchByTag('vue');
    assert.equal(frontendEntries.length, 1, 'searchByTag 按精确标签匹配');
  });

  it('searchByUrl 按来源 URL 搜索', async () => {
    await kb.saveEntry({
      title: 'MDN 文档',
      sourceUrl: 'https://developer.mozilla.org/js',
      content: 'JavaScript 文档'
    });

    const found = await kb.searchByUrl('https://developer.mozilla.org/js');
    assert.equal(found.length, 1);
    assert.equal(found[0].title, 'MDN 文档');
  });

  it('search 空查询回退为全量扫描', async () => {
    const results = await kb.search('');
    assert.equal(results.length, 3);
  });
});

// ==================== 标签与分类 ====================

describe('QA002-knowledge: 标签与分类', () => {
  it('getAllTags 返回标签统计（含计数）', async () => {
    await kb.saveEntry({ title: 'A', tags: ['javascript', '基础'] });
    await kb.saveEntry({ title: 'B', tags: ['javascript', '高级'] });
    await kb.saveEntry({ title: 'C', tags: ['python'] });

    const tags = await kb.getAllTags();
    assert.ok(tags.length > 0);

    const jsTag = tags.find(t => t.tag === 'javascript');
    assert.ok(jsTag, '应有 javascript 标签');
    assert.equal(jsTag.count, 2);

    const pyTag = tags.find(t => t.tag === 'python');
    assert.ok(pyTag, '应有 python 标签');
    assert.equal(pyTag.count, 1);
  });

  it('getAllCategories 返回分类统计', async () => {
    await kb.saveEntry({ title: 'A', category: '前端' });
    await kb.saveEntry({ title: 'B', category: '前端' });
    await kb.saveEntry({ title: 'C', category: '后端' });

    const cats = await kb.getAllCategories();
    assert.ok(cats.length > 0);

    const fe = cats.find(c => c.category === '前端');
    assert.ok(fe);
    assert.equal(fe.count, 2);

    const be = cats.find(c => c.category === '后端');
    assert.ok(be);
    assert.equal(be.count, 1);
  });
});

// ==================== 去重 ====================

describe('QA002-knowledge: 去重', () => {
  it('saveEntry 相同标题返回 duplicate', async () => {
    await kb.saveEntry({ title: '唯一标题' });
    const result = await kb.saveEntry({ title: '唯一标题' });

    assert.ok(result.duplicate, '应检测为重复');
    assert.ok(result.existing);
    assert.equal(result.existing.title, '唯一标题');
  });

  it('saveEntry 相同问题（>10 字符）返回 duplicate', async () => {
    const q = '什么是 JavaScript 中的闭包概念？';
    await kb.saveEntry({ title: '标题A', question: q });
    const result = await kb.saveEntry({ title: '标题B', question: q });

    assert.ok(result.duplicate, '相同问题应检测为重复');
  });

  it('saveEntry 不同标题和内容不视为重复', async () => {
    await kb.saveEntry({ title: '标题1', content: '内容1' });
    const result = await kb.saveEntry({ title: '标题2', content: '内容2' });

    assert.ok(!result.duplicate, '不同内容不应视为重复');
    assert.ok(result.id);
  });
});

// ==================== 导出 ====================

describe('QA002-knowledge: 导出', () => {
  beforeEach(async () => {
    await kb.saveEntry({
      title: '导出测试条目',
      content: '测试内容',
      tags: ['test'],
      question: '测试问题？',
      answer: '测试回答。',
      sourceUrl: 'https://example.com',
      sourceTitle: 'Example'
    });
  });

  it('exportJSON 返回有效 JSON 且含条目数据', async () => {
    const json = await kb.exportJSON();
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, '导出测试条目');
    assert.equal(parsed[0].question, '测试问题？');
  });

  it('exportMarkdown 返回 Markdown 格式', async () => {
    const md = await kb.exportMarkdown();
    assert.ok(md.includes('# AI 知识库导出'));
    assert.ok(md.includes('## 导出测试条目'));
    assert.ok(md.includes('### 问题'));
    assert.ok(md.includes('测试问题？'));
    assert.ok(md.includes('### 回答'));
    assert.ok(md.includes('测试回答。'));
    assert.ok(md.includes('test'));
  });
});

// ==================== 批量操作 ====================

describe('QA002-knowledge: 批量操作', () => {
  it('batchDelete 删除多个条目', async () => {
    const e1 = await kb.saveEntry({ title: 'Delete1' });
    const e2 = await kb.saveEntry({ title: 'Delete2' });
    const e3 = await kb.saveEntry({ title: 'Keep' });

    const deleted = await kb.batchDelete([e1.id, e2.id]);
    assert.equal(deleted, 2);

    const all = await kb.getAllEntries();
    assert.equal(all.length, 1);
    assert.equal(all[0].title, 'Keep');
  });

  it('batchAddTag 为多个条目添加标签', async () => {
    const e1 = await kb.saveEntry({ title: 'Tagged1', tags: [] });
    const e2 = await kb.saveEntry({ title: 'Tagged2', tags: ['old'] });
    const e3 = await kb.saveEntry({ title: 'Tagged3', tags: [] });

    const updated = await kb.batchAddTag([e1.id, e2.id, e3.id], 'qa002');
    assert.equal(updated, 3);

    const check1 = await kb.getEntry(e1.id);
    assert.ok(check1.tags.includes('qa002'));

    const check2 = await kb.getEntry(e2.id);
    assert.ok(check2.tags.includes('qa002'));
    assert.ok(check2.tags.includes('old'), '应保留原有标签');
  });

  it('batchDelete 空数组返回 0', async () => {
    const deleted = await kb.batchDelete([]);
    assert.equal(deleted, 0);
  });

  it('batchAddTag 超过 100 条抛出错误', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    await assert.rejects(
      () => kb.batchAddTag(ids, 'tag'),
      { message: '批量操作最多支持 100 条' }
    );
  });
});
