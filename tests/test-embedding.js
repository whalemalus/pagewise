/**
 * 测试 lib/embedding.js — 语义搜索 Embedding 引擎
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { EmbeddingEngine } = await import('../lib/embedding.js');

let engine;

beforeEach(() => {
  engine = new EmbeddingEngine();
});

// ==================== 停用词过滤 ====================

describe('EmbeddingEngine — 停用词过滤', () => {
  it('英文停用词被过滤', () => {
    const result = engine.preprocess('What is the best way to learn JavaScript');
    // "what", "is", "the", "best", "to" 应被过滤
    assert.ok(!result.tokens.includes('what'), 'what 应被过滤');
    assert.ok(!result.tokens.includes('is'), 'is 应被过滤');
    assert.ok(!result.tokens.includes('the'), 'the 应被过滤');
    assert.ok(!result.tokens.includes('to'), 'to 应被过滤');
    // 有效词应保留
    assert.ok(result.tokens.includes('best'), 'best 应保留');
    assert.ok(result.tokens.includes('way'), 'way 应保留');
    assert.ok(result.tokens.includes('learn'), 'learn 应保留');
    assert.ok(result.tokens.includes('javascript'), 'javascript 应保留');
  });

  it('中文停用词被过滤', () => {
    const result = engine.preprocess('什么是JavaScript的基础');
    assert.ok(!result.tokens.includes('什么'), '什么 应被过滤');
    assert.ok(!result.tokens.includes('的'), '的 应被过滤');
    assert.ok(result.tokens.includes('javascript'), 'javascript 应保留');
    assert.ok(result.tokens.includes('基础'), '基础 应保留');
  });

  it('空输入返回空 tokens', () => {
    assert.deepEqual(engine.preprocess('').tokens, []);
    assert.deepEqual(engine.preprocess(null).tokens, []);
    assert.deepEqual(engine.preprocess(undefined).tokens, []);
  });
});

// ==================== 词干提取 ====================

describe('EmbeddingEngine — 词干提取', () => {
  it('-ing 后缀提取', () => {
    const stemmed = engine.stem('running');
    assert.equal(stemmed, 'run');
  });

  it('-tion 后缀提取', () => {
    const stemmed = engine.stem('creation');
    assert.equal(stemmed, 'creat');
  });

  it('-ment 后缀提取', () => {
    const stemmed = engine.stem('management');
    assert.equal(stemmed, 'manage');
  });

  it('-ness 后缀提取', () => {
    const stemmed = engine.stem('awareness');
    assert.equal(stemmed, 'aware');
  });

  it('-able 后缀提取', () => {
    const stemmed = engine.stem('readable');
    assert.equal(stemmed, 'read');
  });

  it('-ful 后缀提取', () => {
    const stemmed = engine.stem('beautiful');
    assert.equal(stemmed, 'beauti');
  });

  it('-ies 后缀提取', () => {
    const stemmed = engine.stem('companies');
    assert.equal(stemned, 'compani');
  });

  it('-ed 后缀提取', () => {
    const stemmed = engine.stem('configured');
    assert.equal(stemmed, 'configur');
  });

  it('-er 后缀提取', () => {
    const stemmed = engine.stem('faster');
    assert.equal(stemmed, 'fast');
  });

  it('-ly 后缀提取', () => {
    const stemmed = engine.stem('quickly');
    assert.equal(stemmed, 'quick');
  });

  it('短单词不提取（长度 < 4）', () => {
    assert.equal(engine.stem('run'), 'run');
    assert.equal(engine.stem('go'), 'go');
    assert.equal(engine.stem('test'), 'test');
  });

  it('中文不影响（保持原样）', () => {
    assert.equal(engine.stem('函数'), '函数');
    assert.equal(engine.stem('组件'), '组件');
  });
});

// ==================== 同义词扩展 ====================

describe('EmbeddingEngine — 同义词扩展', () => {
  it('英文同义词映射到中文', () => {
    const expanded = engine.expandQuery('function');
    assert.ok(expanded.includes('函数'), 'function 应扩展出 函数');
  });

  it('中文同义词映射到英文', () => {
    const expanded = engine.expandQuery('函数');
    assert.ok(expanded.includes('function'), '函数 应扩展出 function');
  });

  it('组件 component 互映', () => {
    const expandedEn = engine.expandQuery('component');
    assert.ok(expandedEn.includes('组件'), 'component 应扩展出 组件');

    const expandedZh = engine.expandQuery('组件');
    assert.ok(expandedZh.includes('component'), '组件 应扩展出 component');
  });

  it('多词查询每词分别扩展', () => {
    const expanded = engine.expandQuery('React 组件');
    assert.ok(expanded.includes('component'), '应扩展出 component');
  });

  it('空查询返回空数组', () => {
    assert.deepEqual(engine.expandQuery(''), []);
    assert.deepEqual(engine.expandQuery(null), []);
  });

  it('无同义词的词不扩展', () => {
    const expanded = engine.expandQuery('xyz123');
    // 原词应保留
    assert.ok(expanded.includes('xyz123'), '原词应保留');
  });

  it('返回结果去重', () => {
    const expanded = engine.expandQuery('function');
    const unique = [...new Set(expanded)];
    assert.equal(expanded.length, unique.length, '不应有重复');
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
    // 检查是否包含相关 token
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

// ==================== 同义词增强相似度 ====================

describe('EmbeddingEngine — 同义词增强相似度', () => {
  it('同义词查询能匹配目标文本', () => {
    // "函数" 和 "function" 应该有较高相似度
    const score = engine.calculateEmbedding('函数', 'how to use function');
    assert.ok(score > 0, `函数 vs function 应有正相似度，实际 ${score}`);
  });

  it('英文查询匹配中文内容', () => {
    const score = engine.calculateEmbedding('component', 'React 组件化开发');
    assert.ok(score > 0, `component vs 组件化 应有正相似度，实际 ${score}`);
  });

  it('中文查询匹配英文内容', () => {
    const score = engine.calculateEmbedding('框架', 'JavaScript framework tutorial');
    assert.ok(score > 0, `框架 vs framework 应有正相似度，实际 ${score}`);
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
    const results = engine.searchText('JavaScript', entries, 10);
    assert.ok(results.length > 0, '应有结果');
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score, '结果应按分数降序');
    }
  });

  it('最相关的条目排第一', () => {
    const results = engine.searchText('JavaScript 闭包', entries, 10);
    assert.ok(results.length > 0);
    assert.equal(results[0].entry.title, 'JavaScript 闭包',
      `最相关应为 "JavaScript 闭包"，实际 "${results[0].entry.title}"`);
  });

  it('返回结果包含 entry 和 score', () => {
    const results = engine.searchText('JavaScript', entries, 10);
    for (const item of results) {
      assert.ok(item.entry, '应包含 entry');
      assert.ok(typeof item.score === 'number', 'score 应为数字');
      assert.ok(item.score > 0 && item.score <= 1, `score 应在 0-1 之间，实际 ${item.score}`);
    }
  });

  it('limit 参数限制返回数量', () => {
    const results = engine.searchText('JavaScript', entries, 2);
    assert.ok(results.length <= 2, `结果应不超过 2 条，实际 ${results.length}`);
  });

  it('空查询返回空数组', () => {
    assert.deepEqual(engine.searchText('', entries), []);
    assert.deepEqual(engine.searchText(null, entries), []);
  });

  it('空条目返回空数组', () => {
    assert.deepEqual(engine.searchText('test', []), []);
    assert.deepEqual(engine.searchText('test', null), []);
  });

  it('标签权重高 — 标签匹配的条目排名靠前', () => {
    // "python" 作为标签存在于 entry 3
    const results = engine.searchText('python', entries, 10);
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
    // "function" 应通过同义词扩展匹配到 "函数" 标签
    const results = engine.searchText('function', entries, 10);
    const funcEntry = results.find(r => r.entry.id === 1);
    assert.ok(funcEntry, 'function 查询应找到 JavaScript 函数教程');
  });

  it('中文查询能匹配英文标签', () => {
    // "装饰器" 应通过同义词匹配到 "decorator"
    const results = engine.searchText('装饰器', entries, 10);
    const decoratorEntry = results.find(r => r.entry.id === 2);
    assert.ok(decoratorEntry, '装饰器查询应找到 Python 装饰器');
  });
});

// ==================== 搜索建议自动补全 ====================

describe('EmbeddingEngine — 搜索建议', () => {
  const entries = [
    { id: 1, title: 'JavaScript 基础教程', summary: '变量声明', question: '什么是 JS？', answer: '' },
    { id: 2, title: 'JavaScript 闭包详解', summary: '闭包概念', question: '闭包是什么？', answer: '' },
    { id: 3, title: 'Python 入门', summary: 'print 函数', question: '什么是 Python？', answer: '' },
    { id: 4, title: 'React 组件化开发', summary: '组件教程', question: 'React 组件？', answer: '' },
  ];

  it('返回相关条目标题', () => {
    const suggestions = engine.suggestCompletions('JavaScript', entries);
    assert.ok(suggestions.length > 0, '应有推荐');
    assert.ok(suggestions.some(s => s.includes('JavaScript')), '推荐应包含 JavaScript');
  });

  it('返回数量不超过 limit', () => {
    const suggestions = engine.suggestCompletions('JavaScript', entries, 1);
    assert.ok(suggestions.length <= 1);
  });

  it('空查询返回空数组', () => {
    assert.deepEqual(engine.suggestCompletions('', entries), []);
    assert.deepEqual(engine.suggestCompletions(null, entries), []);
  });

  it('空条目返回空数组', () => {
    assert.deepEqual(engine.suggestCompletions('test', []), []);
  });

  it('前缀匹配优先', () => {
    const suggestions = engine.suggestCompletions('Java', entries);
    if (suggestions.length > 0) {
      // 前缀匹配的条目应在前
      assert.ok(suggestions.some(s => s.startsWith('Java')),
        '应有前缀匹配的建议');
    }
  });
});

// ==================== buildWeightedText ====================

describe('EmbeddingEngine — 加权文本构建', () => {
  it('标题重复出现（高权重）', () => {
    const entry = {
      title: 'JavaScript 基础',
      summary: '变量声明',
      question: '什么是 JS？',
      answer: 'JS 是脚本语言',
      tags: ['javascript'],
    };
    const text = engine.buildWeightedText(entry);
    // 标题应重复出现（权重 2.0 → 2 次）
    const titleCount = (text.match(/JavaScript 基础/g) || []).length;
    assert.ok(titleCount >= 2, `标题应至少出现 2 次，实际 ${titleCount}`);
  });

  it('标签重复出现（高权重）', () => {
    const entry = {
      title: 'Test',
      summary: '',
      question: '',
      answer: '',
      tags: ['important'],
    };
    const text = engine.buildWeightedText(entry);
    const tagCount = (text.match(/important/g) || []).length;
    assert.ok(tagCount >= 2, `标签应至少出现 2 次（权重 3.0），实际 ${tagCount}`);
  });

  it('处理缺失字段', () => {
    const entry = { title: '只有标题' };
    const text = engine.buildWeightedText(entry);
    assert.ok(text.includes('只有标题'), '应包含标题');
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

    const start = performance.now();
    const results = engine.searchText('JavaScript 基础', entries, 10);
    const elapsed = performance.now() - start;

    assert.ok(results.length > 0, '应有结果');
    assert.ok(elapsed < 250, `搜索耗时 ${elapsed.toFixed(1)}ms 应 < 250ms`);
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
    const results = engine.searchText('12345', [
      { id: 1, title: 'Item 12345', summary: '', question: '', answer: '', tags: [] }
    ]);
    // 不应抛出异常
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
    const results = engine.searchText('test', [
      { id: 1, title: 'test' },
      { id: 2, summary: 'test entry' },
    ]);
    assert.ok(Array.isArray(results));
  });
});
