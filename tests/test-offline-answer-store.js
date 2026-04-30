/**
 * 测试 lib/offline-answer-store.js — 离线回答持久化存储
 *
 * 迭代 #14: 离线回答保存 — AI 回答离线可用
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/setup.js';

installIndexedDBMock();

const {
  addOfflineAnswer,
  getOfflineAnswer,
  getOfflineAnswersByUrl,
  getAllOfflineAnswers,
  deleteOfflineAnswer,
  clearOfflineAnswers,
  searchOfflineAnswers,
  evictOverflow,
  getOfflineStats,
} = await import('../lib/offline-answer-store.js');

beforeEach(() => {
  resetIndexedDBMock();
  installIndexedDBMock();
});

afterEach(() => {
  resetIndexedDBMock();
});

// ==================== 辅助 ====================

function makeEntry(overrides = {}) {
  return {
    cacheKey: overrides.cacheKey || 'key_' + Math.random().toString(36).slice(2, 10),
    url: overrides.url || 'https://example.com/page',
    title: overrides.title || 'Example Page',
    question: overrides.question || '什么是闭包？',
    answer: overrides.answer || '闭包是函数与其词法环境的组合。',
    model: overrides.model || 'gpt-4o',
    createdAt: overrides.createdAt || new Date().toISOString(),
  };
}

// ==================== addOfflineAnswer ====================

describe('addOfflineAnswer()', () => {
  it('保存一条离线回答并返回记录', async () => {
    const entry = makeEntry({ cacheKey: 'test_key_1' });
    const result = await addOfflineAnswer(entry);

    assert.equal(result.cacheKey, 'test_key_1');
    assert.equal(result.url, 'https://example.com/page');
    assert.equal(result.question, '什么是闭包？');
    assert.equal(result.answer, '闭包是函数与其词法环境的组合。');
    assert.equal(result.model, 'gpt-4o');
    assert.ok(result.createdAt, '应有 createdAt');
  });

  it('缺少 cacheKey 时抛出错误', async () => {
    const entry = makeEntry();
    entry.cacheKey = ''; // 直接赋空（makeEntry 用 || 会 fallback）
    await assert.rejects(
      () => addOfflineAnswer(entry),
      /cacheKey is required/
    );
  });

  it('缺少 answer 时抛出错误', async () => {
    const entry = makeEntry();
    entry.answer = ''; // 直接赋空
    await assert.rejects(
      () => addOfflineAnswer(entry),
      /answer is required/
    );
  });

  it('同一 cacheKey 覆盖更新而非重复创建', async () => {
    const key = 'dup_key';
    await addOfflineAnswer(makeEntry({ cacheKey: key, answer: 'v1' }));
    await addOfflineAnswer(makeEntry({ cacheKey: key, answer: 'v2' }));

    const result = await getOfflineAnswer(key);
    assert.equal(result.answer, 'v2', '应更新为最新值');

    const all = await getAllOfflineAnswers();
    const matches = all.filter(a => a.cacheKey === key);
    assert.equal(matches.length, 1, '同一 cacheKey 只应有一条记录');
  });

  it('不同 cacheKey 创建不同记录', async () => {
    await addOfflineAnswer(makeEntry({ cacheKey: 'k1' }));
    await addOfflineAnswer(makeEntry({ cacheKey: 'k2' }));

    const all = await getAllOfflineAnswers();
    assert.equal(all.length, 2);
  });
});

// ==================== getOfflineAnswer ====================

describe('getOfflineAnswer()', () => {
  it('返回指定 cacheKey 的回答', async () => {
    await addOfflineAnswer(makeEntry({ cacheKey: 'find_me', answer: '找到答案' }));

    const result = await getOfflineAnswer('find_me');
    assert.ok(result, '应找到回答');
    assert.equal(result.answer, '找到答案');
    assert.equal(result.cacheKey, 'find_me');
  });

  it('无匹配时返回 null', async () => {
    const result = await getOfflineAnswer('nonexistent');
    assert.equal(result, null);
  });
});

// ==================== getOfflineAnswersByUrl ====================

describe('getOfflineAnswersByUrl()', () => {
  it('返回指定 URL 的所有离线回答', async () => {
    await addOfflineAnswer(makeEntry({ cacheKey: 'u1', url: 'https://a.com', answer: 'A1' }));
    await addOfflineAnswer(makeEntry({ cacheKey: 'u2', url: 'https://a.com', answer: 'A2' }));
    await addOfflineAnswer(makeEntry({ cacheKey: 'u3', url: 'https://b.com', answer: 'B1' }));

    const results = await getOfflineAnswersByUrl('https://a.com');
    assert.equal(results.length, 2);
    assert.ok(results.every(r => r.url === 'https://a.com'));
  });

  it('无匹配 URL 时返回空数组', async () => {
    await addOfflineAnswer(makeEntry({ url: 'https://a.com' }));
    const results = await getOfflineAnswersByUrl('https://nonexistent.com');
    assert.equal(results.length, 0);
  });
});

// ==================== getAllOfflineAnswers ====================

describe('getAllOfflineAnswers()', () => {
  it('返回所有离线回答，按 createdAt 倒序', async () => {
    await addOfflineAnswer(makeEntry({
      cacheKey: 'old',
      createdAt: '2026-04-28T10:00:00Z'
    }));
    await addOfflineAnswer(makeEntry({
      cacheKey: 'mid',
      createdAt: '2026-04-29T10:00:00Z'
    }));
    await addOfflineAnswer(makeEntry({
      cacheKey: 'new',
      createdAt: '2026-04-30T10:00:00Z'
    }));

    const all = await getAllOfflineAnswers();
    assert.equal(all.length, 3);
    // 最新的在前
    assert.equal(all[0].cacheKey, 'new');
    assert.equal(all[2].cacheKey, 'old');
  });

  it('无数据时返回空数组', async () => {
    const all = await getAllOfflineAnswers();
    assert.deepEqual(all, []);
  });
});

// ==================== deleteOfflineAnswer ====================

describe('deleteOfflineAnswer()', () => {
  it('删除指定 cacheKey 的回答', async () => {
    await addOfflineAnswer(makeEntry({ cacheKey: 'del_me' }));
    const result = await deleteOfflineAnswer('del_me');
    assert.equal(result, true);

    const found = await getOfflineAnswer('del_me');
    assert.equal(found, null);
  });

  it('删除后不影响其他回答', async () => {
    await addOfflineAnswer(makeEntry({ cacheKey: 'keep' }));
    await addOfflineAnswer(makeEntry({ cacheKey: 'remove' }));

    await deleteOfflineAnswer('remove');

    const all = await getAllOfflineAnswers();
    assert.equal(all.length, 1);
    assert.equal(all[0].cacheKey, 'keep');
  });
});

// ==================== clearOfflineAnswers ====================

describe('clearOfflineAnswers()', () => {
  it('清空所有离线回答', async () => {
    await addOfflineAnswer(makeEntry({ cacheKey: 'c1' }));
    await addOfflineAnswer(makeEntry({ cacheKey: 'c2' }));
    await addOfflineAnswer(makeEntry({ cacheKey: 'c3' }));

    await clearOfflineAnswers();

    const all = await getAllOfflineAnswers();
    assert.equal(all.length, 0);
  });
});

// ==================== searchOfflineAnswers ====================

describe('searchOfflineAnswers()', () => {
  it('按问题关键词搜索', async () => {
    await addOfflineAnswer(makeEntry({
      cacheKey: 's1',
      question: 'JavaScript 闭包是什么？',
      answer: '闭包是函数...'
    }));
    await addOfflineAnswer(makeEntry({
      cacheKey: 's2',
      question: 'Python 装饰器',
      answer: '装饰器是一种...'
    }));

    const results = await searchOfflineAnswers('闭包');
    assert.equal(results.length, 1);
    assert.equal(results[0].cacheKey, 's1');
  });

  it('按回答内容搜索', async () => {
    await addOfflineAnswer(makeEntry({
      cacheKey: 's3',
      question: 'Q',
      answer: 'React 的 Virtual DOM 提高了渲染效率'
    }));
    await addOfflineAnswer(makeEntry({
      cacheKey: 's4',
      question: 'Q2',
      answer: 'Python 是一门解释型语言'
    }));

    const results = await searchOfflineAnswers('Virtual DOM');
    assert.equal(results.length, 1);
    assert.equal(results[0].cacheKey, 's3');
  });

  it('搜索不区分大小写', async () => {
    await addOfflineAnswer(makeEntry({
      cacheKey: 's5',
      question: 'What is JavaScript?'
    }));

    const results = await searchOfflineAnswers('javascript');
    assert.equal(results.length, 1);
  });

  it('无匹配时返回空数组', async () => {
    await addOfflineAnswer(makeEntry({ question: 'Hello' }));
    const results = await searchOfflineAnswers('nonexistent-xyz');
    assert.equal(results.length, 0);
  });

  it('空关键词返回所有回答', async () => {
    await addOfflineAnswer(makeEntry({ cacheKey: 'a' }));
    await addOfflineAnswer(makeEntry({ cacheKey: 'b' }));

    const results = await searchOfflineAnswers('');
    assert.equal(results.length, 2);
  });

  it('多个匹配全部返回', async () => {
    await addOfflineAnswer(makeEntry({ cacheKey: 'm1', question: 'JavaScript basics' }));
    await addOfflineAnswer(makeEntry({ cacheKey: 'm2', question: 'JavaScript closure' }));
    await addOfflineAnswer(makeEntry({ cacheKey: 'm3', question: 'Python basics' }));

    const results = await searchOfflineAnswers('JavaScript');
    assert.equal(results.length, 2);
  });
});

// ==================== evictOverflow ====================

describe('evictOverflow()', () => {
  it('当条目超过 maxEntries 时删除最旧的', async () => {
    // 创建 5 条记录
    for (let i = 0; i < 5; i++) {
      await addOfflineAnswer(makeEntry({
        cacheKey: `evict_${i}`,
        createdAt: new Date(Date.now() - (5 - i) * 10000).toISOString()
      }));
    }

    // 限制为 3 条
    const deleted = await evictOverflow(3);

    assert.equal(deleted, 2, '应删除 2 条');
    const all = await getAllOfflineAnswers();
    assert.equal(all.length, 3, '剩余应为 3 条');

    // 验证删除的是最旧的
    const keys = all.map(a => a.cacheKey);
    assert.ok(keys.includes('evict_4'), '最新的应保留');
    assert.ok(keys.includes('evict_3'), '次新应保留');
    assert.ok(keys.includes('evict_2'), '第三新应保留');
    assert.ok(!keys.includes('evict_0'), '最旧的应被删除');
    assert.ok(!keys.includes('evict_1'), '次旧的应被删除');
  });

  it('未超过限制时不删除', async () => {
    await addOfflineAnswer(makeEntry({ cacheKey: 'e1' }));
    await addOfflineAnswer(makeEntry({ cacheKey: 'e2' }));

    const deleted = await evictOverflow(10);
    assert.equal(deleted, 0);

    const all = await getAllOfflineAnswers();
    assert.equal(all.length, 2);
  });

  it('默认限制 200 条', async () => {
    // 只验证函数可不传参数调用
    const deleted = await evictOverflow();
    assert.equal(typeof deleted, 'number');
  });
});

// ==================== getOfflineStats ====================

describe('getOfflineStats()', () => {
  it('返回统计信息', async () => {
    await addOfflineAnswer(makeEntry({
      cacheKey: 'st1',
      createdAt: '2026-04-28T10:00:00Z'
    }));
    await addOfflineAnswer(makeEntry({
      cacheKey: 'st2',
      createdAt: '2026-04-30T12:00:00Z'
    }));

    const stats = await getOfflineStats();
    assert.equal(stats.count, 2);
    assert.equal(stats.oldest, '2026-04-28T10:00:00Z');
    assert.equal(stats.newest, '2026-04-30T12:00:00Z');
  });

  it('无数据时返回 count=0', async () => {
    const stats = await getOfflineStats();
    assert.equal(stats.count, 0);
    assert.equal(stats.oldest, null);
    assert.equal(stats.newest, null);
  });
});
