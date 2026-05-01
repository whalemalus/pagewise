/**
 * E2E 测试 lib/conversation-store.js — 对话存储全部导出函数
 *
 * 测试范围：
 *   saveConversation, getConversationByUrl, getAllConversations,
 *   deleteConversation, deleteOldConversations, searchConversations
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

installIndexedDBMock();

const {
  saveConversation,
  getConversationByUrl,
  getAllConversations,
  deleteConversation,
  deleteOldConversations,
  searchConversations,
} = await import('../lib/conversation-store.js');

afterEach(() => {
  resetIndexedDBMock();
});

// ================================================================
//  1. saveConversation — 基本保存
// ================================================================

describe('saveConversation — 基本保存', () => {
  afterEach(() => { resetIndexedDBMock(); });

  it('保存对话并返回含 id 的记录', async () => {
    const result = await saveConversation(
      'https://example.com/page',
      'Example Page',
      [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！' },
      ]
    );

    assert.ok(result.id, '应返回 id');
    assert.equal(result.url, 'https://example.com/page');
    assert.equal(result.title, 'Example Page');
    assert.equal(result.messages.length, 2);
    assert.ok(result.createdAt, '应有 createdAt');
    assert.ok(result.updatedAt, '应有 updatedAt');
  });

  it('同一 URL 更新已有记录而非新建', async () => {
    await saveConversation('https://dup.com', 'V1', [
      { role: 'user', content: 'Q1' },
    ]);
    await saveConversation('https://dup.com', 'V2', [
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
    ]);

    const all = await getAllConversations();
    const matches = all.filter((c) => c.url === 'https://dup.com');
    assert.equal(matches.length, 1, '同一 URL 只应有一条记录');
    assert.equal(matches[0].title, 'V2');
    assert.equal(matches[0].messages.length, 2);
  });

  it('空消息数组时也能保存', async () => {
    const result = await saveConversation('https://empty.com', 'Empty', []);
    assert.deepEqual(result.messages, []);
  });

  it('缺少 url 时抛出错误', async () => {
    await assert.rejects(
      () => saveConversation('', 'title', []),
      (err) => {
        assert.ok(err.message.toLowerCase().includes('url'), '错误信息应含 url');
        return true;
      }
    );
  });
});

// ================================================================
//  2. getConversationByUrl — 按 URL 获取
// ================================================================

describe('getConversationByUrl — 按 URL 获取', () => {
  afterEach(() => { resetIndexedDBMock(); });

  it('返回指定 URL 的对话', async () => {
    await saveConversation('https://target.com', 'Target', [
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '回答' },
    ]);
    await saveConversation('https://other.com', 'Other', []);

    const conv = await getConversationByUrl('https://target.com');
    assert.ok(conv, '应找到对话');
    assert.equal(conv.url, 'https://target.com');
    assert.equal(conv.title, 'Target');
    assert.equal(conv.messages.length, 2);
  });

  it('无匹配时返回 null / undefined', async () => {
    const conv = await getConversationByUrl('https://nonexistent.com');
    assert.ok(!conv, '无匹配应返回 falsy 值');
  });
});

// ================================================================
//  3. getAllConversations — 获取全部
// ================================================================

describe('getAllConversations — 获取全部', () => {
  afterEach(() => { resetIndexedDBMock(); });

  it('无数据时返回空数组', async () => {
    const all = await getAllConversations();
    assert.deepEqual(all, []);
  });

  it('返回所有对话，按 updatedAt 倒序', async () => {
    await saveConversation('https://first.com', 'First', []);
    await new Promise((r) => setTimeout(r, 15));
    await saveConversation('https://second.com', 'Second', []);
    await new Promise((r) => setTimeout(r, 15));
    await saveConversation('https://third.com', 'Third', []);

    const all = await getAllConversations();
    assert.equal(all.length, 3);
    // 最新的在前
    assert.equal(all[0].url, 'https://third.com');
    assert.equal(all[2].url, 'https://first.com');
  });
});

// ================================================================
//  4. deleteConversation — 删除
// ================================================================

describe('deleteConversation — 删除', () => {
  afterEach(() => { resetIndexedDBMock(); });

  it('删除指定对话后不可再获取', async () => {
    const conv = await saveConversation('https://del.com', 'Delete Me', []);
    const result = await deleteConversation(conv.id);
    assert.equal(result, true);

    const found = await getConversationByUrl('https://del.com');
    assert.ok(!found, '删除后不应再找到');
  });

  it('删除后不影响其他对话', async () => {
    const conv1 = await saveConversation('https://keep.com', 'Keep', []);
    await new Promise((r) => setTimeout(r, 15));
    const conv2 = await saveConversation('https://remove.com', 'Remove', []);

    await deleteConversation(conv2.id);

    const all = await getAllConversations();
    assert.equal(all.length, 1);
    assert.equal(all[0].url, 'https://keep.com');
  });
});

// ================================================================
//  5. deleteOldConversations — 过期清理
// ================================================================

describe('deleteOldConversations — 过期清理', () => {
  afterEach(() => { resetIndexedDBMock(); });

  it('不影响当天的新对话', async () => {
    await saveConversation('https://new.com', 'New', []);
    const count = await deleteOldConversations(30);
    assert.equal(typeof count, 'number', '应返回删除数量');
    const all = await getAllConversations();
    assert.equal(all.length, 1, '新对话应保留');
  });

  it('返回值为数字类型', async () => {
    await saveConversation('https://a.com', 'A', []);
    await saveConversation('https://b.com', 'B', []);
    const count = await deleteOldConversations(0);
    assert.equal(typeof count, 'number');
  });
});

// ================================================================
//  6. searchConversations — 搜索
// ================================================================

describe('searchConversations — 搜索', () => {
  afterEach(() => { resetIndexedDBMock(); });

  it('按消息内容搜索', async () => {
    await saveConversation('https://js.com', 'JS', [
      { role: 'user', content: 'JavaScript 闭包是什么？' },
    ]);
    await saveConversation('https://py.com', 'Python', [
      { role: 'user', content: 'Python 列表推导式' },
    ]);

    const results = await searchConversations('闭包');
    assert.equal(results.length, 1);
    assert.equal(results[0].url, 'https://js.com');
  });

  it('按标题搜索', async () => {
    await saveConversation('https://react.com', 'React Hooks 文档', []);
    await saveConversation('https://vue.com', 'Vue.js 指南', []);

    const results = await searchConversations('React');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'React Hooks 文档');
  });

  it('搜索不区分大小写', async () => {
    await saveConversation('https://a.com', 'JavaScript Tutorial', [
      { role: 'user', content: 'What is JavaScript?' },
    ]);

    const results = await searchConversations('javascript');
    assert.equal(results.length, 1);
  });

  it('无匹配时返回空数组', async () => {
    await saveConversation('https://x.com', 'Title', [
      { role: 'user', content: 'Hello' },
    ]);

    const results = await searchConversations('nonexistent-xyz-keyword');
    assert.equal(results.length, 0);
  });

  it('空关键词返回所有对话', async () => {
    await saveConversation('https://a.com', 'A', []);
    await saveConversation('https://b.com', 'B', []);

    const results = await searchConversations('');
    assert.equal(results.length, 2);
  });
});

// ================================================================
//  7. 边界值 — 特殊字符 / 超长内容
// ================================================================

describe('边界值 — 特殊字符与超长内容', () => {
  afterEach(() => { resetIndexedDBMock(); });

  it('URL 含特殊字符可保存和检索', async () => {
    const url = 'https://example.com/path?q=hello%20world&lang=zh#section-1';
    await saveConversation(url, '特殊 URL', [
      { role: 'user', content: '含有 & ? = # % 的 URL' },
    ]);

    const conv = await getConversationByUrl(url);
    assert.ok(conv, '含特殊字符的 URL 应可检索');
    assert.equal(conv.url, url);
  });

  it('超长消息内容可保存和检索', async () => {
    const longContent = 'x'.repeat(50000);
    await saveConversation('https://long.com', 'Long', [
      { role: 'user', content: longContent },
    ]);

    const conv = await getConversationByUrl('https://long.com');
    assert.ok(conv);
    assert.equal(conv.messages[0].content.length, 50000);
  });

  it('大量对话保存后 getAllConversations 返回全部', async () => {
    for (let i = 0; i < 30; i++) {
      await saveConversation(`https://bulk-${i}.com`, `Bulk ${i}`, []);
    }

    const all = await getAllConversations();
    assert.equal(all.length, 30);
  });
});
