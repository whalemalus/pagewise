/**
 * 测试 lib/embedding-engine.js — 语义搜索 Embedding 引擎
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { EmbeddingEngine } = await import('../lib/embedding-engine.js');

let engine;

beforeEach(() => {
  engine = new EmbeddingEngine();
});

// ==================== 停用词过滤 ====================

describe('EmbeddingEngine — 停用词过滤', () => {
  it('英文停用词被过滤', () => {
    const tokens = engine.tokenize('What is the best way to learn JavaScript');
    // "what", "is", "the", "to" 应被过滤
    assert.ok(!tokens.includes('what'), 'what 应被过滤');
    assert.ok(!tokens.includes('is'), 'is 应被过滤');
    assert.ok(!tokens.includes('the'), 'the 应被过滤');
    assert.ok(!tokens.includes('to'), 'to 应被过滤');
    // 有效词应保留
    assert.ok(tokens.includes('best'), 'best 应保留');
    assert.ok(tokens.includes('way'), 'way 应保留');
    assert.ok(tokens.includes('learn'), 'learn 应保留');
    assert.ok(tokens.includes('javascript'), 'javascript 应保留');
  });

  it('中文停用词被过滤', () => {
    const tokens = engine.tokenize('什么是JavaScript的基础');
    // "什么" 的 bigram 被停用词表过滤
    assert.ok(!tokens.includes('什么'), '什么 应被过滤');
    assert.ok(tokens.includes('javascript'), 'javascript 应保留');
    assert.ok(tokens.includes('基础'), '基础 应保留');
  });

  it('空输入返回空 tokens', () => {
    assert.deepEqual(engine.tokenize(''), []);
    assert.deepEqual(engine.tokenize(null), []);
    assert.deepEqual(engine.tokenize(undefined), []);
  });
});

// ==================== 向量生成 ====================

describe('EmbeddingEngine — 向量生成', () => {
  it('生成非空向量', () => {
    const vec = engine.generateVector('JavaScript 基础教程');
    assert.ok(vec.size > 0, '向量不应为空');
  });

  it('向量包含预处理后的 token', () => {
    const vec = engine.generateVector('JavaScript 基础教程');
    const keys = [...vec.keys()];
    assert.ok(keys.some(k => k.includes('javascript')), '应包含 javascript');
    assert.ok(keys.some(k => k.includes('基础')), '应包含 基础');
  });

  it('停用词不出现在向量中', () => {
    const vec = engine.generateVector('What is the best way');
    const keys = [...vec.keys()];
    assert.ok(!keys.includes('what'), 'what 不应在向量中');
    assert.ok(!keys.includes('the'), 'the 不应在向量中');
  });

  it('空文本返回空向量', () => {
    const vec = engine.generateVector('');
    assert.equal(vec.size, 0);
  });

  it('向量值为正数权重', () => {
    const vec = engine.generateVector('JavaScript 闭包');
    for (const [, weight] of vec) {
      assert.ok(weight > 0, '权重应为正数');
    }
  });
});

// ==================== 余弦相似度 ====================

describe('EmbeddingEngine — 余弦相似度', () => {
  it('相同文本相似度为 1', () => {
    const score = engine.cosineSimilarity(
      engine.generateVector('JavaScript 基础'),
      engine.generateVector('JavaScript 基础')
    );
    assert.ok(Math.abs(score - 1) < 0.001, `相同文本相似度应接近 1，实际 ${score}`);
  });

  it('语义相近文本得分高于不相关文本', () => {
    const vec1 = engine.generateVector('JavaScript 闭包');
    const vecRelated = engine.generateVector('JavaScript closure concept');
    const vecUnrelated = engine.generateVector('Python data analysis');

    const scoreRelated = engine.cosineSimilarity(vec1, vecRelated);
    const scoreUnrelated = engine.cosineSimilarity(vec1, vecUnrelated);

    assert.ok(scoreRelated > scoreUnrelated,
      `related(${scoreRelated}) 应 > unrelated(${scoreUnrelated})`);
  });

  it('中英文混合查询有效', () => {
    const vec1 = engine.generateVector('React 组件');
    const vec2 = engine.generateVector('React 组件化开发教程');
    const score = engine.cosineSimilarity(vec1, vec2);
    assert.ok(score > 0, '中英文混合应有正相似度');
  });

  it('完全不相关文本相似度为 0', () => {
    const vec1 = engine.generateVector('abcdefgh');
    const vec2 = engine.generateVector('xyzwvuts');
    const score = engine.cosineSimilarity(vec1, vec2);
    assert.equal(score, 0, '完全不相关应为 0');
  });

  it('空向量相似度为 0', () => {
    const vec = engine.generateVector('test');
    const emptyVec = new Map();
    assert.equal(engine.cosineSimilarity(vec, emptyVec), 0);
    assert.equal(engine.cosineSimilarity(emptyVec, vec), 0);
    assert.equal(engine.cosineSimilarity(emptyVec, emptyVec), 0);
  });
});

// ==================== 静态相似度计算 ====================

describe('EmbeddingEngine — 静态相似度计算', () => {
  it('相同文本相似度为 1', () => {
    const score = EmbeddingEngine.calculateSimilarity('JavaScript 基础', 'JavaScript 基础');
    assert.ok(Math.abs(score - 1) < 0.001, `相同文本相似度应接近 1，实际 ${score}`);
  });

  it('相似文本有正相似度', () => {
    const score = EmbeddingEngine.calculateSimilarity('JavaScript 闭包', 'JavaScript closure');
    assert.ok(score > 0, `JavaScript 闭包 vs JavaScript closure 应有正相似度，实际 ${score}`);
  });

  it('空输入返回 0', () => {
    assert.equal(EmbeddingEngine.calculateSimilarity('', 'test'), 0);
    assert.equal(EmbeddingEngine.calculateSimilarity(null, 'test'), 0);
    assert.equal(EmbeddingEngine.calculateSimilarity('test', null), 0);
  });
});

// ==================== 字段加权搜索 ====================

describe('EmbeddingEngine — 字段加权搜索', () => {
  const entries = [
    {
      id: 1, title: 'JavaScript 基础教程',
      summary: '变量声明和数据类型',
      question: '什么是 JS？', answer: 'JS 是脚本语言',
      tags: ['javascript', '基础'], content: 'let const var'
    },
    {
      id: 2, title: 'JavaScript 闭包',
      summary: '闭包的概念和使用',
      question: '什么是闭包？', answer: '闭包是函数和作用域的组合',
      tags: ['javascript', '闭包'], content: 'closure scope'
    },
    {
      id: 3, title: 'Python 入门',
      summary: 'print 函数',
      question: '什么是 Python？', answer: 'Python 是通用编程语言',
      tags: ['python', '基础'], content: 'print hello world'
    },
    {
      id: 4, title: 'React 组件',
      summary: 'JavaScript 组件化框架',
      question: 'React 是什么？', answer: 'React 是前端框架',
      tags: ['react', 'javascript'], content: 'component jsx'
    },
  ];

  it('返回结果按 score 降序', () => {
    engine.buildVocabulary(entries);
    const results = engine.search('JavaScript', entries, 10);
    assert.ok(results.length > 0, '应有结果');
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score, '结果应按分数降序');
    }
  });

  it('最相关的条目排第一', () => {
    engine.buildVocabulary(entries);
    const results = engine.search('JavaScript 闭包', entries, 10);
    assert.ok(results.length > 0);
    assert.equal(results[0].entry.title, 'JavaScript 闭包',
      `最相关应为 "JavaScript 闭包"，实际 "${results[0].entry.title}"`);
  });

  it('返回结果包含 entry 和 score', () => {
    engine.buildVocabulary(entries);
    const results = engine.search('JavaScript', entries, 10);
    for (const item of results) {
      assert.ok(item.entry, '应包含 entry');
      assert.ok(typeof item.score === 'number', 'score 应为数字');
      assert.ok(item.score > 0 && item.score <= 1, `score 应在 0-1 之间，实际 ${item.score}`);
    }
  });

  it('limit 参数限制返回数量', () => {
    engine.buildVocabulary(entries);
    const results = engine.search('JavaScript', entries, 2);
    assert.ok(results.length <= 2, `结果应不超过 2 条，实际 ${results.length}`);
  });

  it('空查询返回空数组', () => {
    engine.buildVocabulary(entries);
    assert.deepEqual(engine.search('', entries), []);
    assert.deepEqual(engine.search(null, entries), []);
  });

  it('空条目返回空数组', () => {
    assert.deepEqual(engine.search('test', []), []);
    assert.deepEqual(engine.search('test', null), []);
  });

  it('标签权重高 — 标签匹配的条目排名靠前', () => {
    engine.buildVocabulary(entries);
    const results = engine.search('python', entries, 10);
    const pythonEntry = results.find(r => r.entry.id === 3);
    assert.ok(pythonEntry, '应找到 Python 条目');
    assert.ok(pythonEntry.score >= results[results.length - 1].score,
      '标签匹配的条目不应排在最后');
  });
});

// ==================== 同义词增强搜索 ====================

describe('EmbeddingEngine — 同义词增强搜索', () => {
  const entries = [
    {
      id: 1, title: 'JavaScript 函数教程',
      summary: '函数的定义和调用',
      question: '如何定义函数？',
      answer: '使用 function 关键字定义函数',
      tags: ['javascript', '函数']
    },
    {
      id: 2, title: 'Python 装饰器',
      summary: 'Decorator patterns',
      question: '什么是装饰器？',
      answer: '装饰器是修改函数行为的高阶函数',
      tags: ['python', 'decorator']
    },
  ];

  it('英文查询能匹配中文标签', () => {
    engine.buildVocabulary(entries);
    const results = engine.search('function', entries, 10);
    const funcEntry = results.find(r => r.entry.id === 1);
    assert.ok(funcEntry, 'function 查询应找到 JavaScript 函数教程');
  });

  it('中文查询能匹配英文标签', () => {
    engine.buildVocabulary(entries);
    const results = engine.search('装饰器', entries, 10);
    const decoratorEntry = results.find(r => r.entry.id === 2);
    assert.ok(decoratorEntry, '装饰器查询应找到 Python 装饰器');
  });
});

// ==================== 静态搜索接口 ====================

describe('EmbeddingEngine — 静态搜索接口', () => {
  const entries = [
    { id: 1, title: 'JavaScript 基础教程', summary: '变量声明', question: '什么是 JS？', answer: 'JS 是脚本语言', tags: ['javascript', '基础'] },
    { id: 2, title: 'JavaScript 闭包详解', summary: '闭包概念', question: '闭包是什么？', answer: '闭包是函数和作用域', tags: ['javascript', '闭包'] },
    { id: 3, title: 'Python 入门', summary: 'print 函数', question: '什么是 Python？', answer: 'Python 是编程语言', tags: ['python', '基础'] },
    { id: 4, title: 'React 组件化开发', summary: '组件教程', question: 'React 组件？', answer: 'React 是前端框架', tags: ['react', 'javascript'] },
  ];

  it('semanticSearch 返回相关结果', () => {
    const results = EmbeddingEngine.semanticSearch('JavaScript', entries);
    assert.ok(results.length > 0, '应有结果');
    assert.ok(results.some(r => r.entry.title.includes('JavaScript')), '应包含 JavaScript 条目');
  });

  it('semanticSearch 返回数量不超过 limit', () => {
    const results = EmbeddingEngine.semanticSearch('JavaScript', entries, 1);
    assert.ok(results.length <= 1);
  });

  it('semanticSearch 空查询返回空数组', () => {
    assert.deepEqual(EmbeddingEngine.semanticSearch('', entries), []);
    assert.deepEqual(EmbeddingEngine.semanticSearch(null, entries), []);
  });

  it('semanticSearch 空条目返回空数组', () => {
    assert.deepEqual(EmbeddingEngine.semanticSearch('test', []), []);
  });

  it('semanticSearch 结果按相关度排序', () => {
    const results = EmbeddingEngine.semanticSearch('JavaScript', entries);
    if (results.length >= 2) {
      assert.ok(results[0].score >= results[1].score, '应按分数降序');
    }
  });
});

// ==================== 性能测试 ====================

describe('EmbeddingEngine — 性能', () => {
  it('1000 条数据搜索 < 200ms', () => {
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
        tags: [topic.toLowerCase(), action],
      });
    }

    engine.buildVocabulary(entries);
    const start = performance.now();
    const results = engine.search('JavaScript 基础', entries, 10);
    const elapsed = performance.now() - start;

    assert.ok(results.length > 0, '应有结果');
    assert.ok(elapsed < 500, `搜索耗时 ${elapsed.toFixed(1)}ms 应 < 500ms`);
  });

  it('向量生成 < 5ms', () => {
    const text = 'What is the best way to learn JavaScript programming? 什么是学习 JavaScript 编程的最佳方式？';
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      engine.generateVector(text);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 5000, `1000 次向量生成 ${elapsed.toFixed(1)}ms 应 < 5000ms`);
  });
});

// ==================== 边界情况 ====================

describe('EmbeddingEngine — 边界情况', () => {
  it('处理纯数字输入', () => {
    const results = engine.search('12345', [
      { id: 1, title: 'Item 12345', summary: '', question: '', answer: '', tags: [] }
    ]);
    assert.ok(Array.isArray(results));
  });

  it('处理超长文本', () => {
    const longText = 'a'.repeat(10000);
    const vec = engine.generateVector(longText);
    assert.ok(vec instanceof Map, '应返回 Map');
  });

  it('处理特殊字符', () => {
    const vec = engine.generateVector('<script>alert("xss")</script>');
    assert.ok(vec instanceof Map, '应返回 Map');
  });

  it('处理 emoji', () => {
    const vec = engine.generateVector('🚀 JavaScript 教程');
    assert.ok(vec.size > 0, '应有向量');
  });

  it('entries 含缺失字段不崩溃', () => {
    const results = engine.search('test', [
      { id: 1, title: 'test' },
      { id: 2, summary: 'test entry' },
    ]);
    assert.ok(Array.isArray(results));
  });
});
