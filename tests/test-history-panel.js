/**
 * 测试 R10: Persistent Conversation History Panel
 *
 * Tests:
 * - Conversation store API for history panel
 * - First question title extraction logic
 * - History list data preparation
 * - Swipe-to-delete data flow
 * - Header button toggle
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
  searchConversations,
} = await import('../lib/conversation-store.js');

beforeEach(() => {
  resetIndexedDBMock();
  installIndexedDBMock();
});

afterEach(() => {
  resetIndexedDBMock();
});

// ==================== R10: First question as title ====================

describe('R10 — history item title uses first user question', () => {
  function extractDisplayTitle(conv) {
    const firstQuestion = conv.messages
      ? (conv.messages.find(m => m.role === 'user')?.content || '')
      : '';
    return firstQuestion
      ? firstQuestion.slice(0, 60) + (firstQuestion.length > 60 ? '...' : '')
      : (conv.title || '');
  }

  it('使用第一个 user 消息作为标题', async () => {
    const conv = await saveConversation(
      'https://example.com/page',
      'Example Page',
      [
        { role: 'user', content: '什么是 JavaScript 闭包？' },
        { role: 'assistant', content: '闭包是函数和其词法环境的组合...' }
      ]
    );

    const title = extractDisplayTitle(conv);
    assert.equal(title, '什么是 JavaScript 闭包？');
  });

  it('没有 user 消息时回退到页面标题', async () => {
    const conv = await saveConversation(
      'https://example.com/page',
      'Example Page',
      [{ role: 'assistant', content: '自动提取的内容' }]
    );

    const title = extractDisplayTitle(conv);
    assert.equal(title, 'Example Page');
  });

  it('长问题截断到 60 字符', async () => {
    const longQuestion = '这是一段非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的问题文本用来测试截断功能是否正常工作';
    const conv = await saveConversation(
      'https://example.com/page',
      'Page',
      [{ role: 'user', content: longQuestion }]
    );

    const title = extractDisplayTitle(conv);
    assert.ok(title.length > 60); // truncated + '...'
    assert.ok(title.endsWith('...'));
    assert.ok(title.length <= 63); // 60 + '...'
  });

  it('空消息数组回退到页面标题', async () => {
    const conv = await saveConversation(
      'https://example.com/page',
      'Example Page',
      []
    );

    const title = extractDisplayTitle(conv);
    assert.equal(title, 'Example Page');
  });
});

// ==================== R10: History list data ====================

describe('R10 — history list displays conversations from store', () => {
  it('getAllConversations 返回按 updatedAt 倒序的对话', async () => {
    await saveConversation('https://a.com', 'Page A', [
      { role: 'user', content: '第一个问题' }
    ]);
    await new Promise(r => setTimeout(r, 10));
    await saveConversation('https://b.com', 'Page B', [
      { role: 'user', content: '第二个问题' }
    ]);

    const all = await getAllConversations();
    assert.equal(all.length, 2);
    // 最新在前
    assert.equal(all[0].url, 'https://b.com');
    assert.equal(all[1].url, 'https://a.com');
  });

  it('对话包含 messages 数组和时间戳', async () => {
    await saveConversation('https://test.com', 'Test', [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ]);

    const all = await getAllConversations();
    assert.equal(all.length, 1);
    assert.ok(Array.isArray(all[0].messages));
    assert.equal(all[0].messages.length, 2);
    assert.ok(all[0].updatedAt);
    assert.ok(all[0].createdAt);
    assert.ok(all[0].id);
  });

  it('无历史对话时返回空数组', async () => {
    const all = await getAllConversations();
    assert.deepEqual(all, []);
  });
});

// ==================== R10: Click to restore ====================

describe('R10 — restore conversation by ID', () => {
  it('通过 getAllConversations + find 恢复指定对话', async () => {
    await saveConversation('https://a.com', 'A', [
      { role: 'user', content: 'Question A' },
      { role: 'assistant', content: 'Answer A' }
    ]);
    await new Promise(r => setTimeout(r, 10));
    const target = await saveConversation('https://b.com', 'B', [
      { role: 'user', content: 'Question B' },
      { role: 'assistant', content: 'Answer B' }
    ]);

    const all = await getAllConversations();
    const conv = all.find(c => c.id === target.id);
    assert.ok(conv);
    assert.equal(conv.url, 'https://b.com');
    assert.equal(conv.messages.length, 2);
    assert.equal(conv.messages[0].content, 'Question B');
  });

  it('恢复后 conversationHistory 包含完整消息', async () => {
    const saved = await saveConversation('https://restore.com', 'Restore', [
      { role: 'user', content: 'What is X?' },
      { role: 'assistant', content: 'X is ...' },
      { role: 'user', content: 'And Y?' },
      { role: 'assistant', content: 'Y is ...' }
    ]);

    const conv = await getConversationByUrl('https://restore.com');
    assert.ok(conv);
    assert.equal(conv.messages.length, 4);
    // Messages should be in order
    assert.equal(conv.messages[0].role, 'user');
    assert.equal(conv.messages[1].role, 'assistant');
    assert.equal(conv.messages[2].role, 'user');
    assert.equal(conv.messages[3].role, 'assistant');
  });
});

// ==================== R10: Swipe/button to delete ====================

describe('R10 — delete conversation (button and swipe)', () => {
  it('删除后对话从列表中消失', async () => {
    const conv = await saveConversation('https://delete.com', 'Delete Me', [
      { role: 'user', content: 'Goodbye' }
    ]);

    let all = await getAllConversations();
    assert.equal(all.length, 1);

    await deleteConversation(conv.id);

    all = await getAllConversations();
    assert.equal(all.length, 0);
  });

  it('删除指定对话不影响其他对话', async () => {
    const conv1 = await saveConversation('https://keep.com', 'Keep', []);
    await new Promise(r => setTimeout(r, 10));
    const conv2 = await saveConversation('https://remove.com', 'Remove', []);

    await deleteConversation(conv2.id);

    const all = await getAllConversations();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, conv1.id);
  });

  it('删除后恢复会话的 getConversationByUrl 返回 null', async () => {
    const conv = await saveConversation('https://gone.com', 'Gone', []);
    await deleteConversation(conv.id);

    const found = await getConversationByUrl('https://gone.com');
    assert.equal(found, null);
  });
});

// ==================== R10: Search in history panel ====================

describe('R10 — search conversations in history panel', () => {
  it('按第一个问题搜索', async () => {
    await saveConversation('https://js.com', 'JS Page', [
      { role: 'user', content: 'JavaScript 闭包是什么？' },
      { role: 'assistant', content: '闭包是...' }
    ]);
    await saveConversation('https://py.com', 'Python Page', [
      { role: 'user', content: 'Python 装饰器怎么用？' },
      { role: 'assistant', content: '装饰器是...' }
    ]);

    const results = await searchConversations('闭包');
    assert.equal(results.length, 1);
    assert.equal(results[0].url, 'https://js.com');
  });

  it('搜索无结果返回空数组', async () => {
    await saveConversation('https://example.com', 'Test', [
      { role: 'user', content: 'Hello' }
    ]);

    const results = await searchConversations('xyznonexistent');
    assert.equal(results.length, 0);
  });
});

// ==================== R10: Conversation persistence across sessions ====================

describe('R10 — conversations persist in IndexedDB', () => {
  it('保存后通过 getAllConversations 可获取', async () => {
    await saveConversation('https://persist.com', 'Persist', [
      { role: 'user', content: 'Will this persist?' },
      { role: 'assistant', content: 'Yes!' }
    ]);

    const all = await getAllConversations();
    assert.ok(all.length >= 1);
    const found = all.find(c => c.url === 'https://persist.com');
    assert.ok(found);
    assert.equal(found.messages.length, 2);
  });

  it('更新已有对话后消息列表增长', async () => {
    await saveConversation('https://update.com', 'Update', [
      { role: 'user', content: 'First' }
    ]);

    await saveConversation('https://update.com', 'Update', [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Answer' },
      { role: 'user', content: 'Second' }
    ]);

    const conv = await getConversationByUrl('https://update.com');
    assert.equal(conv.messages.length, 3);

    // 同一 URL 只有一条记录
    const all = await getAllConversations();
    const matches = all.filter(c => c.url === 'https://update.com');
    assert.equal(matches.length, 1);
  });
});
