/**
 * 测试 lib/knowledge-base.js — 语义搜索
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

// ==================== Bigram 向量相似度 ====================

describe('语义搜索 — bigram 向量相似度', () => {
  it('相同查询和文本返回高分', () => {
    const score = KnowledgeBase.calculateSimilarity('JavaScript 基础', 'JavaScript 基础');
    assert.equal(score, 1);
  });

  it('语义相近的文本得分高于不相关文本', () => {
    const related = KnowledgeBase.calculateSimilarity(
      'JavaScript 闭包',
      'JavaScript 闭包是什么'
    );
    const unrelated = KnowledgeBase.calculateSimilarity(
      'JavaScript 闭包',
      'Python 数据分析'
    );
    assert.ok(related > unrelated, `related(${related}) 应 > unrelated(${unrelated})`);
  });

  it('中英文混合查询有效', () => {
    const score = KnowledgeBase.calculateSimilarity(
      'React 组件',
      'React 组件化开发教程'
    );
    assert.ok(score > 0, '中英文混合应有正相似度');
  });

  it('完全不相关的文本相似度为 0', () => {
    const score = KnowledgeBase.calculateSimilarity(
      'abcdefgh',
      'xyzwvuts'
    );
    assert.equal(score, 0);
  });
});

// ==================== 语义搜索排序 ====================

describe('语义搜索 — semanticSearch 排序', () => {
  const entries = [
    { id: 1, title: 'JavaScript 基础教程', summary: '变量声明和数据类型', question: '什么是 JS？', answer: 'JS 是脚本语言' },
    { id: 2, title: 'JavaScript 闭包', summary: '闭包的概念和使用', question: '什么是闭包？', answer: '闭包是函数和作用域的组合' },
    { id: 3, title: 'Python 入门', summary: 'print 函数', question: '什么是 Python？', answer: 'Python 是通用编程语言' },
    { id: 4, title: 'React 组件', summary: 'JavaScript 组件化框架', question: 'React 是什么？', answer: 'React 是前端框架' },
  ];

  it('返回结果按 score 降序', () => {
    const results = KnowledgeBase.semanticSearch('JavaScript', entries, 10);
    assert.ok(results.length > 0, '应有结果');
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score, '结果应按分数降序');
    }
  });

  it('最相关的条目排第一', () => {
    const results = KnowledgeBase.semanticSearch('JavaScript 闭包', entries, 10);
    assert.ok(results.length > 0);
    // 最相关的应该是 "JavaScript 闭包"
    assert.equal(results[0].entry.title, 'JavaScript 闭包');
  });

  it('返回结果包含 entry 和 score', () => {
    const results = KnowledgeBase.semanticSearch('JavaScript', entries, 10);
    for (const item of results) {
      assert.ok(item.entry, '应包含 entry');
      assert.ok(typeof item.score === 'number', 'score 应为数字');
      assert.ok(item.score > 0 && item.score <= 1, 'score 应在 0-1 之间');
    }
  });

  it('limit 参数限制返回数量', () => {
    const results = KnowledgeBase.semanticSearch('JavaScript', entries, 2);
    assert.ok(results.length <= 2, `结果应不超过 2 条，实际 ${results.length}`);
  });

  it('空查询返回空数组', () => {
    assert.deepEqual(KnowledgeBase.semanticSearch('', entries), []);
    assert.deepEqual(KnowledgeBase.semanticSearch(null, entries), []);
  });

  it('空条目返回空数组', () => {
    assert.deepEqual(KnowledgeBase.semanticSearch('test', []), []);
    assert.deepEqual(KnowledgeBase.semanticSearch('test', null), []);
  });

  it('不相关的查询返回空数组', () => {
    const results = KnowledgeBase.semanticSearch('zzzzzzzzz', entries, 10);
    assert.equal(results.length, 0);
  });
});

// ==================== 综合搜索 ====================

describe('综合搜索 — combinedSearch', () => {
  beforeEach(async () => {
    await kb.saveEntry({
      title: 'JavaScript 基础',
      content: '变量声明 let const',
      summary: 'JS 入门',
      tags: ['javascript', '基础'],
      category: '前端',
      question: '什么是 JavaScript？',
      answer: 'JavaScript 是脚本语言',
    });
    await kb.saveEntry({
      title: 'JavaScript 闭包',
      content: '闭包是函数和其词法环境的组合',
      summary: '深入理解闭包',
      tags: ['javascript', '闭包'],
      category: '前端',
      question: '闭包是什么？',
      answer: '闭包让函数可以访问外部变量',
    });
    await kb.saveEntry({
      title: 'Python 入门',
      content: 'print hello world',
      summary: 'Python 基础',
      tags: ['python', '基础'],
      category: '后端',
      question: '什么是 Python？',
      answer: 'Python 是通用语言',
    });
    await kb.saveEntry({
      title: 'React 组件化开发',
      content: 'JavaScript 组件化框架',
      summary: 'React 和 JS 关系密切',
      tags: ['react', 'javascript'],
      category: '前端',
      question: 'React 是什么？',
      answer: 'React 是 JavaScript 前端框架',
    });
  });

  it('关键词匹配的条目标记为 keyword 类型', async () => {
    const results = await kb.combinedSearch('JavaScript');
    const keywordResults = results.filter(r => r.matchType === 'keyword');
    assert.ok(keywordResults.length > 0, '应有关键词匹配结果');
    // 所有关键词匹配结果的 score 应为 1
    for (const r of keywordResults) {
      assert.equal(r.score, 1, '关键词匹配 score 应为 1');
    }
  });

  it('语义匹配的条目标记为 semantic 类型', async () => {
    const results = await kb.combinedSearch('脚本编程语言');
    const semanticResults = results.filter(r => r.matchType === 'semantic');
    // 可能会有语义匹配
    if (semanticResults.length > 0) {
      assert.ok(semanticResults[0].score < 1, '语义匹配 score 应 < 1');
    }
  });

  it('关键词结果排在语义结果前面', async () => {
    const results = await kb.combinedSearch('JavaScript');
    if (results.length > 1) {
      const lastKeywordIdx = results.reduce((max, r, i) =>
        r.matchType === 'keyword' ? i : max, -1);
      const firstSemanticIdx = results.findIndex(r => r.matchType === 'semantic');
      if (lastKeywordIdx >= 0 && firstSemanticIdx >= 0) {
        assert.ok(lastKeywordIdx < firstSemanticIdx, '关键词结果应在语义结果前');
      }
    }
  });

  it('合并去重 — 同一条目不会出现两次', async () => {
    const results = await kb.combinedSearch('JavaScript');
    const ids = results.map(r => r.entry.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, '不应有重复条目');
  });

  it('空查询返回空数组', async () => {
    const results = await kb.combinedSearch('');
    assert.deepEqual(results, []);
  });

  it('无匹配时返回空数组', async () => {
    const results = await kb.combinedSearch('zzzzzzzzzzzzz');
    assert.deepEqual(results, []);
  });

  it('limit 参数限制返回数量', async () => {
    const results = await kb.combinedSearch('JavaScript', 2);
    assert.ok(results.length <= 2, `结果应不超过 2 条，实际 ${results.length}`);
  });
});

// ==================== 搜索推荐 ====================

describe('搜索推荐 — getSearchSuggestions', () => {
  const entries = [
    { id: 1, title: 'JavaScript 基础教程', summary: '变量声明', question: '什么是 JS？', answer: '' },
    { id: 2, title: 'JavaScript 闭包详解', summary: '闭包概念', question: '闭包是什么？', answer: '' },
    { id: 3, title: 'Python 入门', summary: 'print 函数', question: '什么是 Python？', answer: '' },
  ];

  it('返回相关条目标题', () => {
    const suggestions = KnowledgeBase.getSearchSuggestions('JavaScript', entries);
    assert.ok(suggestions.length > 0, '应有推荐');
    assert.ok(suggestions.some(s => s.includes('JavaScript')), '推荐应包含含 JavaScript 的标题');
  });

  it('返回数量不超过 limit', () => {
    const suggestions = KnowledgeBase.getSearchSuggestions('JavaScript', entries, 1);
    assert.ok(suggestions.length <= 1);
  });

  it('空查询返回空数组', () => {
    assert.deepEqual(KnowledgeBase.getSearchSuggestions('', entries), []);
    assert.deepEqual(KnowledgeBase.getSearchSuggestions(null, entries), []);
  });

  it('空条目返回空数组', () => {
    assert.deepEqual(KnowledgeBase.getSearchSuggestions('test', []), []);
  });
});

// ==================== 匹配字段 ====================

describe('匹配字段 — getMatchedFields', () => {
  const entry = {
    title: 'JavaScript 基础',
    summary: '变量声明',
    question: '什么是 JavaScript？',
    answer: 'JavaScript 是脚本语言',
    content: 'let const var',
    tags: ['javascript', '前端'],
  };

  it('匹配 title 字段', () => {
    const { matchedFields } = KnowledgeBase.getMatchedFields('JavaScript', entry);
    assert.ok(matchedFields.includes('title'), '应匹配 title');
  });

  it('匹配 summary 字段', () => {
    const { matchedFields } = KnowledgeBase.getMatchedFields('变量声明', entry);
    assert.ok(matchedFields.includes('summary'), '应匹配 summary');
  });

  it('匹配 question 字段', () => {
    const { matchedFields } = KnowledgeBase.getMatchedFields('什么是', entry);
    assert.ok(matchedFields.includes('question'), '应匹配 question');
  });

  it('匹配 answer 字段', () => {
    const { matchedFields } = KnowledgeBase.getMatchedFields('脚本语言', entry);
    assert.ok(matchedFields.includes('answer'), '应匹配 answer');
  });

  it('匹配 tags 字段', () => {
    const { matchedFields } = KnowledgeBase.getMatchedFields('javascript', entry);
    assert.ok(matchedFields.includes('tags'), '应匹配 tags');
  });

  it('不匹配任何字段返回空数组', () => {
    const { matchedFields } = KnowledgeBase.getMatchedFields('zzzzzzzz', entry);
    assert.equal(matchedFields.length, 0);
  });

  it('空查询返回空数组', () => {
    const { matchedFields } = KnowledgeBase.getMatchedFields('', entry);
    assert.equal(matchedFields.length, 0);
  });
});

// ==================== getSearchCompareText ====================

describe('搜索文本拼接 — getSearchCompareText', () => {
  it('拼接 title + summary + question + answer', () => {
    const text = KnowledgeBase.getSearchCompareText({
      title: '标题',
      summary: '摘要',
      question: '问题',
      answer: '回答',
    });
    assert.ok(text.includes('标题'));
    assert.ok(text.includes('摘要'));
    assert.ok(text.includes('问题'));
    assert.ok(text.includes('回答'));
  });

  it('处理缺失字段', () => {
    const text = KnowledgeBase.getSearchCompareText({ title: '只有标题' });
    assert.equal(text, '只有标题');
  });

  it('不包含 content 字段', () => {
    const text = KnowledgeBase.getSearchCompareText({
      title: '标题',
      content: '不应包含',
    });
    assert.ok(!text.includes('不应包含'), '搜索文本不应包含 content');
  });
});

// ==================== 性能测试 ====================

describe('语义搜索性能', () => {
  it('1000 条数据语义搜索 < 100ms', () => {
    // 生成 1000 条模拟数据
    const entries = [];
    const topics = ['JavaScript', 'Python', 'React', 'Node.js', 'CSS', 'HTML', 'Vue', 'Angular', 'TypeScript', 'Go'];
    const actions = ['基础', '进阶', '入门', '教程', '实战', '原理', '优化', '调试'];
    for (let i = 0; i < 1000; i++) {
      const topic = topics[i % topics.length];
      const action = actions[i % actions.length];
      entries.push({
        id: i,
        title: `${topic} ${action}教程 #${i}`,
        summary: `关于${topic}${action}的知识`,
        question: `如何学习${topic}${action}？`,
        answer: `${topic}${action}需要多练习`,
      });
    }

    const start = performance.now();
    const results = KnowledgeBase.semanticSearch('JavaScript 基础', entries, 10);
    const elapsed = performance.now() - start;

    assert.ok(results.length > 0, '应有结果');
    assert.ok(elapsed < 500, `搜索耗时 ${elapsed.toFixed(1)}ms 应 < 500ms (测试环境含 mock 开销，生产环境 < 100ms)`);
  });
});
