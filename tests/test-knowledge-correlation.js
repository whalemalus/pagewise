/**
 * 测试 lib/knowledge-base.js — 知识关联引擎
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/setup.js';

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

// ==================== Bigram 分词 ====================

describe('KnowledgeBase.bigrams()', () => {
  it('空字符串返回空数组', () => {
    assert.deepEqual(KnowledgeBase.bigrams(''), []);
    assert.deepEqual(KnowledgeBase.bigrams(null), []);
    assert.deepEqual(KnowledgeBase.bigrams(undefined), []);
  });

  it('单字符返回该字符', () => {
    assert.deepEqual(KnowledgeBase.bigrams('a'), ['a']);
    assert.deepEqual(KnowledgeBase.bigrams('你'), ['你']);
  });

  it('两字符返回一个 bigram', () => {
    assert.deepEqual(KnowledgeBase.bigrams('ab'), ['ab']);
  });

  it('英文单词按 bigram 拆分', () => {
    const tokens = KnowledgeBase.bigrams('hello');
    assert.deepEqual(tokens, ['he', 'el', 'll', 'lo']);
  });

  it('多个英文单词分别拆分', () => {
    const tokens = KnowledgeBase.bigrams('hello world');
    // 'hello' -> ['he','el','ll','lo'], 'world' -> ['wo','or','rl','ld']
    assert.ok(tokens.includes('he'));
    assert.ok(tokens.includes('wo'));
    assert.equal(tokens.length, 8);
  });

  it('中文按 bigram 拆分', () => {
    const tokens = KnowledgeBase.bigrams('你好世界');
    assert.deepEqual(tokens, ['你好', '好世', '世界']);
  });

  it('混合中英文', () => {
    const tokens = KnowledgeBase.bigrams('JavaScript 编程');
    assert.ok(tokens.includes('ja'));  // 小写化
    assert.ok(tokens.includes('编程'));
  });

  it('标点符号作为分隔符', () => {
    const tokens = KnowledgeBase.bigrams('hello,world');
    assert.ok(tokens.includes('he'));
    assert.ok(tokens.includes('wo'));
  });
});

// ==================== 相似度计算 ====================

describe('KnowledgeBase.calculateSimilarity()', () => {
  it('两个空字符串返回 0', () => {
    assert.equal(KnowledgeBase.calculateSimilarity('', ''), 0);
  });

  null_text:
  it('null 输入返回 0', () => {
    assert.equal(KnowledgeBase.calculateSimilarity(null, 'hello'), 0);
    assert.equal(KnowledgeBase.calculateSimilarity('hello', null), 0);
  });

  it('相同文本返回 1', () => {
    assert.equal(KnowledgeBase.calculateSimilarity('hello', 'hello'), 1);
    assert.equal(KnowledgeBase.calculateSimilarity('你好世界', '你好世界'), 1);
  });

  it('完全不同的文本相似度接近 0', () => {
    const score = KnowledgeBase.calculateSimilarity('abcdefghij', 'xyzwvutsrq');
    assert.equal(score, 0);
  });

  it('部分重叠的文本相似度在 0-1 之间', () => {
    const score = KnowledgeBase.calculateSimilarity('hello world', 'hello there');
    assert.ok(score > 0 && score < 1, `score=${score} 应在 0-1 之间`);
  });

  it('包含关系的文本相似度较高', () => {
    const score = KnowledgeBase.calculateSimilarity(
      'JavaScript 基础教程',
      'JavaScript 高级教程'
    );
    assert.ok(score > 0.5, `score=${score} 应大于 0.5`);
  });

  it('中文文本相似度', () => {
    const score = KnowledgeBase.calculateSimilarity(
      '机器学习基础知识',
      '机器学习入门教程'
    );
    assert.ok(score > 0, '中文文本应有正相似度');
  });

  it('对称性：similarity(a,b) === similarity(b,a)', () => {
    const a = 'JavaScript 编程语言';
    const b = 'Python 编程入门';
    const score1 = KnowledgeBase.calculateSimilarity(a, b);
    const score2 = KnowledgeBase.calculateSimilarity(b, a);
    assert.ok(Math.abs(score1 - score2) < 1e-10, '相似度应具有对称性');
  });
});

// ==================== 关联查找 ====================

describe('KnowledgeBase.findRelatedEntries()', () => {
  beforeEach(async () => {
    await kb.saveEntry({
      title: 'JavaScript 基础',
      summary: '变量声明和数据类型',
      tags: ['javascript', '基础'],
      question: '什么是 JavaScript？',
    });
    await kb.saveEntry({
      title: 'JavaScript 高级特性',
      summary: '闭包和原型链',
      tags: ['javascript', '高级'],
      question: 'JavaScript 闭包是什么？',
    });
    await kb.saveEntry({
      title: 'Python 入门',
      summary: 'print 函数和变量',
      tags: ['python', '基础'],
      question: '什么是 Python？',
    });
    await kb.saveEntry({
      title: 'React 组件化开发',
      summary: 'JavaScript 组件化框架',
      tags: ['react', 'javascript'],
      question: 'React 是什么？',
    });
  });

  it('不存在的条目返回空数组', async () => {
    const result = await kb.findRelatedEntries(99999);
    assert.deepEqual(result, []);
  });

  it('返回相关条目且不包含自身', async () => {
    const entries = await kb.getAllEntries();
    const jsEntry = entries.find(e => e.title === 'JavaScript 基础');

    const related = await kb.findRelatedEntries(jsEntry.id, 5);
    assert.ok(related.length > 0, '应有相关条目');
    assert.ok(
      related.every(r => r.entry.id !== jsEntry.id),
      '不应包含自身'
    );
  });

  it('返回结果包含 entry 和 score 字段', async () => {
    const entries = await kb.getAllEntries();
    const jsEntry = entries.find(e => e.title === 'JavaScript 基础');

    const related = await kb.findRelatedEntries(jsEntry.id, 5);
    for (const item of related) {
      assert.ok(item.entry, '应包含 entry');
      assert.ok(typeof item.score === 'number', 'score 应为数字');
      assert.ok(item.score > 0 && item.score <= 1, 'score 应在 0-1 之间');
    }
  });

  it('结果按相似度降序排列', async () => {
    const entries = await kb.getAllEntries();
    const jsEntry = entries.find(e => e.title === 'JavaScript 基础');

    const related = await kb.findRelatedEntries(jsEntry.id, 5);
    for (let i = 1; i < related.length; i++) {
      assert.ok(
        related[i - 1].score >= related[i].score,
        '结果应按分数降序'
      );
    }
  });

  it('limit 参数限制返回数量', async () => {
    const entries = await kb.getAllEntries();
    const jsEntry = entries.find(e => e.title === 'JavaScript 基础');

    const related = await kb.findRelatedEntries(jsEntry.id, 2);
    assert.ok(related.length <= 2, '不应超过 limit');
  });

  it('与 JavaScript 相关的条目排名高于 Python', async () => {
    const entries = await kb.getAllEntries();
    const jsEntry = entries.find(e => e.title === 'JavaScript 基础');

    const related = await kb.findRelatedEntries(jsEntry.id, 5);
    const jsAdvIdx = related.findIndex(r => r.entry.title === 'JavaScript 高级特性');
    const pyIdx = related.findIndex(r => r.entry.title === 'Python 入门');

    // JavaScript 高级特性 应排在 Python 入门前面（或 Python 不在结果中）
    if (jsAdvIdx >= 0 && pyIdx >= 0) {
      assert.ok(jsAdvIdx < pyIdx, 'JS 相关条目应排在 Python 前面');
    }
  });

  it('getEntryCompareText 正确拼接字段', () => {
    const text = KnowledgeBase.getEntryCompareText({
      title: '标题',
      summary: '摘要',
      tags: ['tag1', 'tag2'],
      question: '问题？',
    });
    assert.ok(text.includes('标题'));
    assert.ok(text.includes('摘要'));
    assert.ok(text.includes('tag1'));
    assert.ok(text.includes('问题？'));
  });

  it('getEntryCompareText 处理缺失字段', () => {
    const text = KnowledgeBase.getEntryCompareText({ title: '只有标题' });
    assert.equal(text, '只有标题');
  });
});
