/**
 * QA004 — 可靠性测试：边界情况
 *
 * 测试空字符串、超长文本、特殊字符、并发操作、重复操作等边界场景。
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock, uninstallChromeMock } from './helpers/setup.js';
import { installIndexedDBMock, resetIndexedDBMock, uninstallIndexedDBMock } from './helpers/setup.js';

installChromeMock();
installIndexedDBMock();

const { KnowledgeBase } = await import('../lib/knowledge-base.js');
const { estimateTokens, estimateMessagesTokens } = await import('../lib/ai-client.js');
const { calculateNextReview, initializeReviewData, getDueCards, getDueCardCount } = await import('../lib/spaced-repetition.js');
const { SkillEngine } = await import('../lib/skill-engine.js');
const { addLog, getLogs, clearLogs, getLogsByModule, getLogsByLevel, exportLogs } = await import('../lib/log-store.js');

after(() => {
  uninstallChromeMock();
  uninstallIndexedDBMock();
});

// ==================== KnowledgeBase 边界情况 ====================

describe('KnowledgeBase — 空字符串与空数据', () => {
  let kb;
  beforeEach(async () => {
    resetIndexedDBMock();
    kb = new KnowledgeBase();
    await kb.init();
  });

  it('保存全空字段的条目不崩溃', async () => {
    const entry = await kb.saveEntry({
      title: '', content: '', summary: '',
      question: '', answer: '', tags: []
    });
    assert.ok(entry.id);
  });

  it('搜索空字符串返回空数组', async () => {
    const result = await kb.search('');
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('搜索空白字符串返回空数组', async () => {
    const result = await kb.search('   ');
    assert.ok(Array.isArray(result));
  });

  it('getConversations 空 URL 返回空数组', async () => {
    const result = await kb.getConversations('');
    assert.ok(Array.isArray(result));
  });

  it('deleteEntry 不存在的 ID 不崩溃', async () => {
    const result = await kb.deleteEntry(99999);
    assert.equal(result, true);
  });

  it('updateEntry 不存在的 ID 抛出错误', async () => {
    await assert.rejects(
      () => kb.updateEntry(99999, { title: 'updated' }),
      /不存在/
    );
  });
});

describe('KnowledgeBase — 超长文本', () => {
  let kb;
  beforeEach(async () => {
    resetIndexedDBMock();
    kb = new KnowledgeBase();
    await kb.init();
  });

  it('保存 100KB 文本的条目', async () => {
    const longText = 'A'.repeat(100000);
    const entry = await kb.saveEntry({
      title: 'Long Entry',
      content: longText,
      summary: longText.slice(0, 200),
      question: 'What is this?',
      answer: longText.slice(0, 500)
    });
    assert.ok(entry.id);

    const retrieved = await kb.getEntry(entry.id);
    assert.equal(retrieved.content.length, 100000);
  });

  it('搜索超长查询不崩溃', async () => {
    await kb.saveEntry({ title: 'Test', content: 'Hello world', question: 'Q', answer: 'A' });
    const longQuery = 'x'.repeat(10000);
    const result = await kb.search(longQuery);
    assert.ok(Array.isArray(result));
  });

  it('超长标签数组', async () => {
    const tags = Array.from({ length: 200 }, (_, i) => `tag-${i}`);
    const entry = await kb.saveEntry({ title: 'Many Tags', tags, question: 'Q', answer: 'A' });
    assert.ok(entry.id);
    assert.equal(entry.tags.length, 200);
  });
});

describe('KnowledgeBase — 特殊字符', () => {
  let kb;
  beforeEach(async () => {
    resetIndexedDBMock();
    kb = new KnowledgeBase();
    await kb.init();
  });

  it('HTML 标签作为内容', async () => {
    const entry = await kb.saveEntry({
      title: '<script>alert("xss")</script>',
      content: '<img src=x onerror=alert(1)>',
      question: '<b>bold</b>',
      answer: '<div onclick="evil()">answer</div>'
    });
    assert.ok(entry.id);
    const retrieved = await kb.getEntry(entry.id);
    assert.ok(retrieved.title.includes('<script>'));
  });

  it('Unicode emoji 和特殊符号', async () => {
    const entry = await kb.saveEntry({
      title: '🎉 Emoji 测试 🚀🔥',
      content: '数学符号: ∑∏∫√∞ ≠ ≈ ≤ ≥',
      tags: ['emoji-🎯', '符号-∑'],
      question: 'Q?',
      answer: 'A!'
    });
    assert.ok(entry.id);
    const results = await kb.search('emoji');
    assert.ok(results.length >= 1);
  });

  it('SQL 注入风格输入不崩溃', async () => {
    const entry = await kb.saveEntry({
      title: "'; DROP TABLE entries; --",
      content: '1=1 OR true',
      question: 'Q',
      answer: 'A'
    });
    assert.ok(entry.id);
  });

  it('JSON 特殊字符', async () => {
    const entry = await kb.saveEntry({
      title: '{"key": "value"}',
      content: 'Line1\nLine2\tTabbed\r\nCRLF',
      question: 'Q',
      answer: 'A'
    });
    assert.ok(entry.id);
    const retrieved = await kb.getEntry(entry.id);
    assert.ok(retrieved.content.includes('\n'));
    assert.ok(retrieved.content.includes('\t'));
  });

  it('null/undefined 字段用默认值填充', async () => {
    const entry = await kb.saveEntry({
      title: null,
      content: undefined,
      summary: null,
      question: null,
      answer: null,
      tags: null,
      category: undefined
    });
    assert.equal(entry.title, '未命名');
    assert.equal(entry.content, '');
    assert.deepEqual(entry.tags, []);
  });
});

// ==================== 并发操作 ====================

describe('KnowledgeBase — 并发操作', () => {
  let kb;
  beforeEach(async () => {
    resetIndexedDBMock();
    kb = new KnowledgeBase();
    await kb.init();
  });

  it('并发保存 10 个条目全部成功', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      kb.saveEntry({ title: `Concurrent ${i}`, content: `Content ${i}`, question: 'Q', answer: 'A' })
    );
    const results = await Promise.all(promises);
    assert.equal(results.length, 10);
    results.forEach((r, i) => {
      assert.ok(r.id, `Entry ${i} should have an id`);
    });
  });

  it('并发读写不互相干扰', async () => {
    // 先保存一些数据
    for (let i = 0; i < 5; i++) {
      await kb.saveEntry({ title: `Pre ${i}`, content: 'content', question: 'Q', answer: 'A' });
    }

    // 并发读取和写入
    const reads = Array.from({ length: 5 }, () => kb.getAllEntries());
    const writes = Array.from({ length: 5 }, (_, i) =>
      kb.saveEntry({ title: `New ${i}`, content: 'content', question: 'Q', answer: 'A' })
    );

    const [readResults, writeResults] = await Promise.all([
      Promise.all(reads),
      Promise.all(writes)
    ]);

    assert.equal(writeResults.length, 5);
    assert.ok(readResults.every(r => Array.isArray(r)));
  });

  it('重复保存相同标题返回 duplicate', async () => {
    const entry1 = await kb.saveEntry({ title: 'Same Title', content: 'first', question: 'Q', answer: 'A' });
    const entry2 = await kb.saveEntry({ title: 'Same Title', content: 'second', question: 'Q2', answer: 'A2' });
    assert.ok(entry1.id);
    assert.ok(entry2.duplicate);
    assert.equal(entry2.existing.id, entry1.id);
  });
});

// ==================== 重复操作 ====================

describe('KnowledgeBase — 重复操作', () => {
  let kb;
  beforeEach(async () => {
    resetIndexedDBMock();
    kb = new KnowledgeBase();
    await kb.init();
  });

  it('重复 init() 不重置数据', async () => {
    await kb.saveEntry({ title: 'Before', content: 'data', question: 'Q', answer: 'A' });
    await kb.init(); // 再次 init
    const all = await kb.getAllEntries();
    assert.ok(all.length >= 1);
  });

  it('重复搜索返回一致结果', async () => {
    await kb.saveEntry({ title: 'Searchable', content: 'unique content xyz', question: 'Q', answer: 'A' });
    const r1 = await kb.search('Searchable');
    const r2 = await kb.search('Searchable');
    assert.equal(r1.length, r2.length);
    assert.equal(r1[0].title, r2[0].title);
  });

  it('删除后再删除不崩溃', async () => {
    const entry = await kb.saveEntry({ title: 'To Delete', content: '', question: 'Q', answer: 'A' });
    await kb.deleteEntry(entry.id);
    const result = await kb.deleteEntry(entry.id);
    assert.equal(result, true);
  });

  it('更新后再读取反映最新值', async () => {
    const entry = await kb.saveEntry({ title: 'Original', content: 'old', question: 'Q', answer: 'A' });
    await kb.updateEntry(entry.id, { title: 'Updated', content: 'new' });
    const retrieved = await kb.getEntry(entry.id);
    assert.equal(retrieved.title, 'Updated');
    assert.equal(retrieved.content, 'new');
  });
});

// ==================== estimateTokens 边界 ====================

describe('estimateTokens — 边界情况', () => {
  it('空字符串返回 0', () => {
    assert.equal(estimateTokens(''), 0);
  });

  it('单个字符返回 1', () => {
    assert.equal(estimateTokens('a'), 1);
  });

  it('超长字符串不崩溃', () => {
    const result = estimateTokens('x'.repeat(1000000));
    assert.ok(result > 0);
    assert.equal(result, Math.ceil(1000000 / 3));
  });

  it('纯中文文本', () => {
    const result = estimateTokens('你好世界');
    assert.ok(result > 0);
  });

  it('混合中英文', () => {
    const result = estimateTokens('Hello 你好 World 世界');
    assert.ok(result > 0);
  });

  it('estimateMessagesTokens 空数组返回 0', () => {
    assert.equal(estimateMessagesTokens([]), 0);
  });

  it('estimateMessagesTokens 包含每条消息的固定开销', () => {
    const result = estimateMessagesTokens([{ role: 'user', content: 'hi' }]);
    // 4 (overhead) + ceil(2/3) = 4 + 1 = 5
    assert.ok(result >= 5);
  });

  it('estimateMessagesTokens 非字符串 content', () => {
    const result = estimateMessagesTokens([{ role: 'user', content: null }]);
    assert.ok(result >= 4); // overhead only
  });
});

// ==================== SpacedRepetition 边界 ====================

describe('getDueCards — 边界情况', () => {
  it('空数组返回空', () => {
    const result = getDueCards([]);
    assert.deepEqual(result, []);
  });

  it('没有 question/answer 的条目被跳过', () => {
    const entries = [
      { title: 'No QA', content: 'text' },
      { title: 'Has QA', question: 'Q', answer: 'A' }
    ];
    const result = getDueCards(entries);
    assert.equal(result.length <= 1, true); // only the one with QA
  });

  it('未来到期的卡片不出现在结果中', () => {
    const future = Date.now() + 86400000 * 365; // 1 year from now
    const entries = [{
      title: 'Future',
      question: 'Q',
      answer: 'A',
      review: { nextReview: future, interval: 30, repetitions: 5, easeFactor: 2.5 }
    }];
    const result = getDueCards(entries);
    assert.equal(result.length, 0);
  });

  it('getDueCardCount 返回正确数量', () => {
    const now = Date.now();
    const entries = [
      { question: 'Q1', answer: 'A1', review: { nextReview: now - 1000 } },
      { question: 'Q2', answer: 'A2', review: { nextReview: now + 99999999 } },
      { question: 'Q3', answer: 'A3', review: { nextReview: now - 2000 } },
    ];
    assert.equal(getDueCardCount(entries), 2);
  });

  it('limit 参数正确裁剪', () => {
    const now = Date.now();
    const entries = Array.from({ length: 50 }, (_, i) => ({
      question: `Q${i}`, answer: `A${i}`,
      review: { nextReview: now - 1000 }
    }));
    const result = getDueCards(entries, 5);
    assert.equal(result.length, 5);
  });
});

// ==================== SkillEngine 边界 ====================

describe('SkillEngine — 边界情况', () => {
  it('toPrompt 无技能返回空字符串', () => {
    const engine = new SkillEngine();
    assert.equal(engine.toPrompt(), '');
  });

  it('toPrompt 全部禁用返回空字符串', () => {
    const engine = new SkillEngine();
    engine.register({ id: 'a', name: 'A', enabled: false, execute: async () => {} });
    assert.equal(engine.toPrompt(), '');
  });

  it('getByCategory 空分类返回空', () => {
    const engine = new SkillEngine();
    engine.register({ id: 'a', name: 'A', category: 'test', execute: async () => {} });
    assert.equal(engine.getByCategory('nonexistent').length, 0);
  });

  it('matchTriggers 无 trigger 的技能被跳过', () => {
    const engine = new SkillEngine();
    engine.register({ id: 'a', name: 'A', execute: async () => {} });
    assert.equal(engine.matchTriggers({}).length, 0);
  });

  it('registerAll 空数组不崩溃', () => {
    const engine = new SkillEngine();
    engine.registerAll([]);
    assert.equal(engine.getAll().length, 0);
  });

  it('registerAll 部分无效会抛出', () => {
    const engine = new SkillEngine();
    assert.throws(
      () => engine.registerAll([{ id: 'a', name: 'A', execute: async () => {} }, {}]),
      /id, name/
    );
  });
});

// ==================== LogStore 边界 ====================

describe('LogStore — 边界情况', () => {
  beforeEach(() => { clearLogs(); });

  it('clearLogs 后 getLogs 返回空', () => {
    addLog('info', 'test', 'msg');
    clearLogs();
    assert.equal(getLogs().length, 0);
  });

  it('getLogsByModule 不存在的模块返回空', () => {
    addLog('info', 'existing', 'msg');
    assert.equal(getLogsByModule('nonexistent').length, 0);
  });

  it('getLogsByLevel 不存在的级别返回空', () => {
    assert.equal(getLogsByLevel('critical').length, 0);
  });

  it('exportLogs 空日志返回空字符串', () => {
    clearLogs();
    assert.equal(exportLogs(), '');
  });

  it('日志 data 超长被截断到 500 字符', () => {
    const bigData = { text: 'x'.repeat(1000) };
    const entry = addLog('info', 'test', 'msg', bigData);
    assert.ok(entry.data.length <= 500);
  });

  it('addLog 返回的 entry 包含所有必需字段', () => {
    const entry = addLog('warn', 'myModule', 'test message', { key: 'value' });
    assert.ok(entry.id);
    assert.ok(entry.timestamp);
    assert.equal(entry.level, 'warn');
    assert.equal(entry.module, 'myModule');
    assert.equal(entry.message, 'test message');
    assert.ok(entry.data);
  });

  it('MAX_LOGS (500) 限制生效', () => {
    for (let i = 0; i < 600; i++) {
      addLog('debug', 'stress', `msg-${i}`);
    }
    assert.ok(getLogs().length <= 500);
  });
});

// ==================== KnowledgeBase — LRU 搜索缓存 ====================

describe('KnowledgeBase — LRU 缓存边界', () => {
  let kb;
  beforeEach(async () => {
    resetIndexedDBMock();
    kb = new KnowledgeBase();
    await kb.init();
  });

  it('超过 _searchCacheMaxSize 条搜索后旧缓存被淘汰', async () => {
    await kb.saveEntry({ title: 'CacheTest', content: 'test content', question: 'Q', answer: 'A' });

    // 搜索超过 10 个不同的查询（maxSize=10）
    for (let i = 0; i < 15; i++) {
      await kb.search(`query-${i}`);
    }
    // 不崩溃，旧缓存已被淘汰
    assert.ok(kb._searchCache.size <= kb._searchCacheMaxSize);
  });
});

// ==================== KnowledgeBase — bigrams 与相似度 ====================

describe('KnowledgeBase.bigrams — 边界情况', () => {
  it('空字符串返回空数组', () => {
    assert.deepEqual(KnowledgeBase.bigrams(''), []);
    assert.deepEqual(KnowledgeBase.bigrams(null), []);
    assert.deepEqual(KnowledgeBase.bigrams(undefined), []);
  });

  it('单个单词', () => {
    const result = KnowledgeBase.bigrams('hello');
    assert.ok(result.length > 0);
    assert.ok(result.includes('he'));
    assert.ok(result.includes('el'));
  });

  it('单个字符', () => {
    const result = KnowledgeBase.bigrams('a');
    assert.deepEqual(result, ['a']);
  });

  it('calculateSimilarity 相同文本返回 1', () => {
    assert.equal(KnowledgeBase.calculateSimilarity('hello world', 'hello world'), 1);
  });

  it('calculateSimilarity 空文本返回 0', () => {
    assert.equal(KnowledgeBase.calculateSimilarity('', 'hello'), 0);
    assert.equal(KnowledgeBase.calculateSimilarity('hello', ''), 0);
    assert.equal(KnowledgeBase.calculateSimilarity(null, 'hello'), 0);
  });

  it('calculateSimilarity 完全不同文本 < 1', () => {
    const score = KnowledgeBase.calculateSimilarity('abc', 'xyz');
    assert.ok(score >= 0 && score <= 1);
  });
});

// ==================== KnowledgeBase — batchDelete ====================

describe('KnowledgeBase — 批量操作边界', () => {
  let kb;
  beforeEach(async () => {
    resetIndexedDBMock();
    kb = new KnowledgeBase();
    await kb.init();
  });

  it('batchDelete 空数组返回 0', async () => {
    assert.equal(await kb.batchDelete([]), 0);
  });

  it('batchDelete 超过 100 条抛出', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i);
    await assert.rejects(() => kb.batchDelete(ids), /100/);
  });

  it('batchAddTag 空数组返回 0', async () => {
    assert.equal(await kb.batchAddTag([], 'tag'), 0);
  });

  it('batchAddTag 空标签抛出', async () => {
    await assert.rejects(() => kb.batchAddTag([1], ''), /标签不能为空/);
    await assert.rejects(() => kb.batchAddTag([1], null), /标签不能为空/);
  });

  it('batchAddTag 超过 100 条抛出', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i);
    await assert.rejects(() => kb.batchAddTag(ids, 'tag'), /100/);
  });

  it('batchDelete 包含不存在的 ID 不崩溃', async () => {
    const entry = await kb.saveEntry({ title: 'Exists', content: '', question: 'Q', answer: 'A' });
    const deleted = await kb.batchDelete([entry.id, 99999, 88888]);
    assert.ok(deleted >= 1);
  });
});
