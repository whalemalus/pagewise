/**
 * QA002 功能正确性测试 — 对话存储模块
 *
 * 测试范围：创建对话、消息 CRUD、历史查询、导出、去重、清理
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/setup.js';

installIndexedDBMock();

const {
  saveConversation,
  getConversationByUrl,
  getAllConversations,
  deleteConversation,
  deleteOldConversations,
  searchConversations,
} = await import('../lib/conversation-store.js');

beforeEach(() => {
  resetIndexedDBMock();
  installIndexedDBMock();
});

afterEach(() => {
  resetIndexedDBMock();
});

// ==================== 创建对话 ====================

describe('QA002-conversation: 创建对话', () => {
  it('保存对话返回含 id 和时间戳的完整记录', async () => {
    const result = await saveConversation(
      'https://example.com/page1',
      '测试页面',
      [{ role: 'user', content: '你好', timestamp: '2026-05-15T10:00:00Z' }]
    );

    assert.ok(result.id, '应有自增 id');
    assert.equal(result.url, 'https://example.com/page1');
    assert.equal(result.title, '测试页面');
    assert.equal(result.messages.length, 1);
    assert.ok(result.createdAt, '应有 createdAt');
    assert.ok(result.updatedAt, '应有 updatedAt');
  });

  it('url 为空时抛出错误', async () => {
    await assert.rejects(
      () => saveConversation('', 'title', []),
      { message: 'url is required' }
    );
  });

  it('同一 URL 更新已有记录而非创建新记录', async () => {
    await saveConversation('https://same-url.com', '标题v1', [
      { role: 'user', content: '问题1' }
    ]);
    await saveConversation('https://same-url.com', '标题v2', [
      { role: 'user', content: '问题1' },
      { role: 'assistant', content: '回答1' }
    ]);

    const all = await getAllConversations();
    const matches = all.filter(c => c.url === 'https://same-url.com');
    assert.equal(matches.length, 1, '同一 URL 只应有一条记录');
    assert.equal(matches[0].messages.length, 2);
    assert.equal(matches[0].title, '标题v2');
  });

  it('不同 URL 创建不同记录', async () => {
    await saveConversation('https://a.com', 'A', []);
    await saveConversation('https://b.com', 'B', []);
    await saveConversation('https://c.com', 'C', []);

    const all = await getAllConversations();
    assert.equal(all.length, 3);
  });
});

// ==================== 消息 CRUD ====================

describe('QA002-conversation: 消息 CRUD', () => {
  it('通过 saveConversation 追加消息', async () => {
    await saveConversation('https://page.com', 'Page', [
      { role: 'user', content: 'Q1' }
    ]);
    const updated = await saveConversation('https://page.com', 'Page', [
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' }
    ]);

    assert.equal(updated.messages.length, 3);
    assert.equal(updated.messages[0].content, 'Q1');
    assert.equal(updated.messages[1].content, 'A1');
    assert.equal(updated.messages[2].content, 'Q2');
  });

  it('空消息数组也能保存', async () => {
    const result = await saveConversation('https://empty.com', 'Empty', []);
    assert.deepEqual(result.messages, []);
  });

  it('删除对话后按 URL 查询返回 null', async () => {
    const conv = await saveConversation('https://del.com', 'Delete', []);
    await deleteConversation(conv.id);

    const found = await getConversationByUrl('https://del.com');
    assert.equal(found, null);
  });

  it('删除对话后不影响其他对话', async () => {
    const conv1 = await saveConversation('https://keep.com', 'Keep', []);
    await new Promise(r => setTimeout(r, 10));
    const conv2 = await saveConversation('https://drop.com', 'Drop', []);

    await deleteConversation(conv2.id);

    const all = await getAllConversations();
    assert.equal(all.length, 1);
    assert.equal(all[0].url, 'https://keep.com');
  });
});

// ==================== 历史查询 ====================

describe('QA002-conversation: 历史查询', () => {
  it('getConversationByUrl 返回指定 URL 的对话', async () => {
    await saveConversation('https://target.com', 'Target', [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ]);
    await saveConversation('https://other.com', 'Other', []);

    const conv = await getConversationByUrl('https://target.com');
    assert.ok(conv);
    assert.equal(conv.url, 'https://target.com');
    assert.equal(conv.title, 'Target');
    assert.equal(conv.messages.length, 2);
  });

  it('getConversationByUrl 无匹配返回 null', async () => {
    await saveConversation('https://exists.com', 'Exists', []);
    const conv = await getConversationByUrl('https://not-exists.com');
    assert.equal(conv, null);
  });

  it('getAllConversations 按 updatedAt 倒序排列', async () => {
    await saveConversation('https://first.com', 'First', []);
    await new Promise(r => setTimeout(r, 10));
    await saveConversation('https://second.com', 'Second', []);
    await new Promise(r => setTimeout(r, 10));
    await saveConversation('https://third.com', 'Third', []);

    const all = await getAllConversations();
    assert.equal(all.length, 3);
    assert.equal(all[0].url, 'https://third.com', '最新在前');
    assert.equal(all[2].url, 'https://first.com', '最旧在后');
  });

  it('getAllConversations 无数据返回空数组', async () => {
    const all = await getAllConversations();
    assert.deepEqual(all, []);
  });
});

// ==================== 搜索 ====================

describe('QA002-conversation: 搜索对话', () => {
  it('按消息内容搜索匹配', async () => {
    await saveConversation('https://js.com', 'JS页面', [
      { role: 'user', content: 'JavaScript 闭包是什么？' },
      { role: 'assistant', content: '闭包是函数与其词法环境的组合' }
    ]);
    await saveConversation('https://py.com', 'Python页面', [
      { role: 'user', content: 'Python 列表推导式' }
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
    await saveConversation('https://example.com', 'JavaScript Tutorial', [
      { role: 'user', content: 'What is JavaScript?' }
    ]);

    const results = await searchConversations('javascript');
    assert.equal(results.length, 1);
  });

  it('空关键词返回所有对话', async () => {
    await saveConversation('https://a.com', 'A', []);
    await saveConversation('https://b.com', 'B', []);
    await saveConversation('https://c.com', 'C', []);

    const results = await searchConversations('');
    assert.equal(results.length, 3);
  });

  it('无匹配关键词返回空数组', async () => {
    await saveConversation('https://example.com', 'Title', [
      { role: 'user', content: 'Hello World' }
    ]);

    const results = await searchConversations('nonexistent-xyz-999');
    assert.equal(results.length, 0);
  });
});
