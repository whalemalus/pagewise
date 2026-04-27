/**
 * 测试 lib/knowledge-base.js — 知识库（使用 IndexedDB mock）
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

describe('KnowledgeBase 初始化', () => {
  it('init() 后 db 不为 null', () => {
    assert.ok(kb.db, 'db 应已初始化');
  });

  it('db 包含 entries 和 conversations 对象存储', () => {
    assert.ok(kb.db.objectStoreNames.contains('entries'));
    assert.ok(kb.db.objectStoreNames.contains('conversations'));
  });

  it('ensureInit() 不会重复初始化', async () => {
    const dbBefore = kb.db;
    await kb.ensureInit();
    assert.equal(kb.db, dbBefore, '不应重新初始化');
  });
});

// ==================== 知识条目 CRUD ====================

describe('KnowledgeBase 条目 CRUD', () => {
  it('saveEntry() 保存并返回含 id 的记录', async () => {
    const entry = await kb.saveEntry({
      title: '测试标题',
      content: '测试内容',
      tags: ['javascript', 'test'],
      category: '技术',
      question: '这是什么？',
      answer: '这是一个测试。',
    });

    assert.ok(entry.id, '应生成 id');
    assert.equal(entry.title, '测试标题');
    assert.equal(entry.content, '测试内容');
    assert.deepEqual(entry.tags, ['javascript', 'test']);
    assert.ok(entry.createdAt, '应有 createdAt');
  });

  it('saveEntry() 使用默认值', async () => {
    const entry = await kb.saveEntry({});
    assert.equal(entry.title, '未命名');
    assert.equal(entry.content, '');
    assert.deepEqual(entry.tags, []);
    assert.equal(entry.category, '未分类');
  });

  it('getEntry() 获取已保存条目', async () => {
    const saved = await kb.saveEntry({ title: '查找测试' });
    const found = await kb.getEntry(saved.id);
    assert.ok(found, '应找到条目');
    assert.equal(found.title, '查找测试');
  });

  it('getEntry() 不存在的 id 返回 null', async () => {
    const found = await kb.getEntry(99999);
    assert.equal(found, null);
  });

  it('updateEntry() 更新已有条目', async () => {
    const saved = await kb.saveEntry({ title: '原始标题' });
    const updated = await kb.updateEntry(saved.id, { title: '更新后标题' });

    assert.equal(updated.title, '更新后标题');
    assert.ok(updated.updatedAt, '应更新 updatedAt');

    const refetched = await kb.getEntry(saved.id);
    assert.equal(refetched.title, '更新后标题');
  });

  it('deleteEntry() 删除条目', async () => {
    const saved = await kb.saveEntry({ title: '待删除' });
    await kb.deleteEntry(saved.id);

    const found = await kb.getEntry(saved.id);
    assert.equal(found, null, '删除后应找不到');
  });
});

// ==================== 查询 ====================

describe('KnowledgeBase 查询', () => {
  beforeEach(async () => {
    await kb.saveEntry({
      title: 'JavaScript 基础',
      content: '变量声明 let const',
      tags: ['javascript', '基础'],
      category: '前端',
      sourceUrl: 'https://example.com/js',
    });
    await kb.saveEntry({
      title: 'Python 入门',
      content: 'print hello world',
      tags: ['python', '基础'],
      category: '后端',
      sourceUrl: 'https://example.com/py',
    });
    await kb.saveEntry({
      title: 'React 教程',
      content: '组件化开发',
      tags: ['react', 'javascript'],
      category: '前端',
      sourceUrl: 'https://example.com/react',
    });
  });

  it('getAllEntries() 返回所有条目', async () => {
    const entries = await kb.getAllEntries();
    assert.equal(entries.length, 3);
  });

  it('getAllEntries() limit 参数', async () => {
    const entries = await kb.getAllEntries(2);
    assert.equal(entries.length, 2);
  });

  it('searchByTag() 按标签搜索', async () => {
    const jsEntries = await kb.searchByTag('javascript');
    assert.equal(jsEntries.length, 2, '应有 2 个含 javascript 标签的条目');

    const pyEntries = await kb.searchByTag('python');
    assert.equal(pyEntries.length, 1);
  });

  it('searchByUrl() 按 URL 搜索', async () => {
    const entries = await kb.searchByUrl('https://example.com/js');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].title, 'JavaScript 基础');
  });

  it('search() 全文搜索', async () => {
    const results = await kb.search('javascript');
    assert.ok(results.length >= 1, '应找到含 javascript 的条目');
    assert.ok(results.some(e => e.title.includes('JavaScript')));
  });

  it('search() 不区分大小写', async () => {
    const results = await kb.search('PYTHON');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Python 入门');
  });

  it('getAllTags() 返回标签统计', async () => {
    const tags = await kb.getAllTags();
    assert.ok(tags.length > 0, '应有标签');
    const jsTag = tags.find(t => t.tag === 'javascript');
    assert.ok(jsTag, '应有 javascript 标签');
    assert.equal(jsTag.count, 2);
  });

  it('getAllCategories() 返回分类统计', async () => {
    const cats = await kb.getAllCategories();
    assert.ok(cats.length > 0);
    const fe = cats.find(c => c.category === '前端');
    assert.ok(fe, '应有前端分类');
    assert.equal(fe.count, 2);
  });
});

// ==================== 导出 ====================

describe('KnowledgeBase 导出', () => {
  beforeEach(async () => {
    await kb.saveEntry({
      title: '导出测试',
      content: '内容',
      tags: ['test'],
      question: 'Q1',
      answer: 'A1',
      sourceUrl: 'https://example.com',
      sourceTitle: 'Example',
    });
  });

  it('exportJSON() 返回有效 JSON', async () => {
    const json = await kb.exportJSON();
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, '导出测试');
  });

  it('exportMarkdown() 返回 Markdown', async () => {
    const md = await kb.exportMarkdown();
    assert.ok(md.includes('# AI 知识库导出'));
    assert.ok(md.includes('## 导出测试'));
    assert.ok(md.includes('### 问题'));
    assert.ok(md.includes('### 回答'));
  });
});
