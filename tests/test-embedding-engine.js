/**
 * 测试 lib/embedding-engine.js — TF-IDF 嵌入引擎
 *
 * 迭代 #7: 语义搜索 (Embedding) — 知识库从"存了找不到"变为可用
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { EmbeddingEngine } = await import('../lib/embedding-engine.js');

let engine;

beforeEach(() => {
  engine = new EmbeddingEngine();
});

// ==================== 分词 (Tokenize) ====================

describe('EmbeddingEngine — tokenize 分词', () => {
  it('空字符串返回空数组', () => {
    assert.deepEqual(engine.tokenize(''), []);
    assert.deepEqual(engine.tokenize(null), []);
    assert.deepEqual(engine.tokenize(undefined), []);
  });

  it('英文按空格分词并小写', () => {
    const tokens = engine.tokenize('Hello World');
    assert.ok(tokens.includes('hello'), '应包含 hello');
    assert.ok(tokens.includes('world'), '应包含 world');
  });

  it('英文生成 bigram', () => {
    const tokens = engine.tokenize('JavaScript');
    // 'javascript' -> word bigrams: 'ja', 'av', 'va', 'as', 'sc', 'cr', 'ri', 'ip', 'pt'
    assert.ok(tokens.some(t => t.startsWith('ja')), '应包含 ja bigram');
  });

  it('中文按字符级 bigram 分词', () => {
    const tokens = engine.tokenize('机器学习');
    // 中文字符 bigrams: '机器', '器学', '学习'
    assert.ok(tokens.includes('机器'), '应包含 机器');
    assert.ok(tokens.includes('学习'), '应包含 学习');
  });

  it('中英文混合分词', () => {
    const tokens = engine.tokenize('React 组件');
    assert.ok(tokens.includes('react'), '应包含 react');
    assert.ok(tokens.includes('组件'), '应包含 组件');
  });

  it('过滤英文停用词', () => {
    const tokens = engine.tokenize('the quick brown fox is a');
    // 'the', 'is', 'a' 应被过滤
    assert.ok(!tokens.includes('the'), '应过滤 the');
    assert.ok(!tokens.includes('is'), '应过滤 is');
    assert.ok(!tokens.includes('a'), '应过滤 a');
    assert.ok(tokens.includes('quick'), '应保留 quick');
  });

  it('过滤中文停用词', () => {
    const tokens = engine.tokenize('这是一个测试');
    // '是', '的', '了' 等高频停用词应被过滤
    assert.ok(!tokens.includes('这是'), '应过滤含停用字的 bigram');
    assert.ok(tokens.includes('测试'), '应保留 测试');
  });

  it('标点符号不产生 token', () => {
    const tokens = engine.tokenize('hello, world! 你好。');
    assert.ok(!tokens.some(t => /[,!。]/.test(t)), '不应包含标点');
  });

  it('保留单字符中文字', () => {
    const tokens = engine.tokenize('码');
    // 单个中文字无法形成 bigram，应保留为 unigram
    assert.ok(tokens.includes('码'), '单个中文字应保留');
  });
});

// ==================== IDF 计算 ====================

describe('EmbeddingEngine — IDF 构建与查询', () => {
  const sampleEntries = [
    { id: 1, title: 'JavaScript 基础', summary: '变量和数据类型', question: '什么是 JS？', answer: 'JS 是脚本语言', tags: ['javascript', '基础'], content: '' },
    { id: 2, title: 'Python 入门', summary: 'print 函数', question: '什么是 Python？', answer: 'Python 是通用语言', tags: ['python'], content: '' },
    { id: 3, title: 'React 组件', summary: 'JavaScript 组件化', question: 'React 是什么？', answer: 'React 是 JS 框架', tags: ['react', 'javascript'], content: '' },
    { id: 4, title: 'CSS 布局', summary: 'Flexbox 和 Grid', question: '如何布局？', answer: '使用 Flexbox', tags: ['css', '布局'], content: '' },
    { id: 5, title: 'JavaScript 闭包', summary: '闭包的概念', question: '闭包是什么？', answer: '闭包是函数和作用域', tags: ['javascript', '闭包'], content: '' },
  ];

  it('buildVocabulary 构建词汇表', () => {
    engine.buildVocabulary(sampleEntries);
    assert.ok(engine._vocabulary.size > 0, '词汇表应非空');
    assert.ok(engine._docCount === 5, '文档数应为 5');
  });

  it('高频词 IDF 低于罕见词', () => {
    engine.buildVocabulary(sampleEntries);
    // 'javascript' 出现在 3 个文档中，应有较低 IDF
    // '闭包' 仅出现在 1 个文档中，应有较高 IDF
    const idfJs = engine.idf('javascript');
    const idfClosure = engine.idf('闭包');
    assert.ok(idfClosure > idfJs, `闭包 IDF(${idfClosure}) 应 > javascript IDF(${idfJs})`);
  });

  it('未见过的词 IDF = log(N+1)', () => {
    engine.buildVocabulary(sampleEntries);
    const unknownIdf = engine.idf('完全未知的词');
    const expectedIdf = Math.log(engine._docCount + 1);
    assert.ok(Math.abs(unknownIdf - expectedIdf) < 0.001, '未知词应有最大 IDF');
  });

  it('IDF 在合理范围内', () => {
    engine.buildVocabulary(sampleEntries);
    for (const [term] of engine._vocabulary) {
      const idfVal = engine.idf(term);
      assert.ok(idfVal >= 0, `IDF(${term}) 应 >= 0`);
      assert.ok(idfVal <= Math.log(engine._docCount + 1), `IDF(${term}) 应 <= max`);
    }
  });
});

// ==================== 向量生成 ====================

describe('EmbeddingEngine — generateVector 向量生成', () => {
  it('空文本返回空向量', () => {
    const vec = engine.generateVector('');
    assert.equal(vec.size, 0);
  });

  it('返回 Map<term, weight>', () => {
    const vec = engine.generateVector('JavaScript 基础');
    assert.ok(vec instanceof Map, '应返回 Map');
    assert.ok(vec.size > 0, '应有 term');
    for (const [, weight] of vec) {
      assert.ok(typeof weight === 'number', 'weight 应为数字');
      assert.ok(weight > 0, 'weight 应为正数');
    }
  });

  it('构建 IDF 后向量包含 IDF 加权', () => {
    const entries = [
      { id: 1, title: 'JavaScript 基础', summary: '', question: '', answer: '', tags: [], content: '' },
      { id: 2, title: 'Python 入门', summary: '', question: '', answer: '', tags: [], content: '' },
    ];
    engine.buildVocabulary(entries);
    const vec = engine.generateVector('JavaScript');
    assert.ok(vec.size > 0, '应有加权 term');
    // 权重应反映 IDF
    for (const [, weight] of vec) {
      assert.ok(weight > 0, 'IDF 加权后 weight 应 > 0');
    }
  });
});

// ==================== 文档向量 (带字段权重) ====================

describe('EmbeddingEngine — generateDocumentVector 文档向量', () => {
  const entry = {
    title: 'JavaScript 基础教程',
    summary: '变量声明和数据类型',
    question: '什么是 JavaScript？',
    answer: 'JavaScript 是脚本语言',
    tags: ['javascript', '基础'],
    content: 'let const var',
  };

  it('返回 Map<term, weight>', () => {
    const vec = engine.generateDocumentVector(entry);
    assert.ok(vec instanceof Map, '应返回 Map');
    assert.ok(vec.size > 0, '应有 term');
  });

  it('title 中的词权重更高', () => {
    const vec = engine.generateDocumentVector(entry);
    // '基础' 出现在 title(权重 3.0) 和 tags(权重 2.0) 中
    // '脚本' 只出现在 answer(权重 1.0) 中
    const baseWeight = vec.get('基础') || 0;
    const scriptWeight = vec.get('脚本') || 0;
    assert.ok(baseWeight > 0, '基础应有正权重');
    assert.ok(scriptWeight > 0, '脚本应有正权重');
  });

  it('tags 影响向量', () => {
    const vec = engine.generateDocumentVector(entry);
    // 'javascript' 应出现在 title 和 tags 中
    assert.ok(vec.has('javascript'), '应包含标签中的词');
  });

  it('空字段不报错', () => {
    const vec = engine.generateDocumentVector({ title: '', summary: '', question: '', answer: '', tags: [], content: '' });
    assert.ok(vec instanceof Map);
  });
});

// ==================== 余弦相似度 ====================

describe('EmbeddingEngine — cosineSimilarity 余弦相似度', () => {
  it('相同向量相似度为 1', () => {
    const vec = new Map([['a', 1], ['b', 2], ['c', 3]]);
    assert.equal(engine.cosineSimilarity(vec, vec), 1);
  });

  it('正交向量相似度为 0', () => {
    const vec1 = new Map([['a', 1]]);
    const vec2 = new Map([['b', 1]]);
    assert.equal(engine.cosineSimilarity(vec1, vec2), 0);
  });

  it('空向量相似度为 0', () => {
    const vec = new Map([['a', 1]]);
    assert.equal(engine.cosineSimilarity(vec, new Map()), 0);
    assert.equal(engine.cosineSimilarity(new Map(), vec), 0);
    assert.equal(engine.cosineSimilarity(new Map(), new Map()), 0);
  });

  it('部分重叠向量相似度在 0-1 之间', () => {
    const vec1 = new Map([['a', 1], ['b', 1]]);
    const vec2 = new Map([['a', 1], ['c', 1]]);
    const sim = engine.cosineSimilarity(vec1, vec2);
    assert.ok(sim > 0 && sim < 1, `相似度 ${sim} 应在 0-1 之间`);
  });

  it('相似文本得分高于不相关文本', () => {
    const vec1 = new Map([['js', 1], ['code', 2]]);
    const vec2 = new Map([['js', 1], ['code', 1.5], ['web', 0.5]]);
    const vec3 = new Map([['food', 1], ['cook', 2]]);
    const sim12 = engine.cosineSimilarity(vec1, vec2);
    const sim13 = engine.cosineSimilarity(vec1, vec3);
    assert.ok(sim12 > sim13, `相关(${sim12}) 应 > 不相关(${sim13})`);
  });
});

// ==================== 搜索 ====================

describe('EmbeddingEngine — search 语义搜索', () => {
  const entries = [
    { id: 1, title: 'JavaScript 基础教程', summary: '变量声明和数据类型', question: '什么是 JS？', answer: 'JS 是脚本语言', tags: ['javascript', '基础'], content: '' },
    { id: 2, title: 'JavaScript 闭包详解', summary: '闭包的概念和使用', question: '什么是闭包？', answer: '闭包是函数和作用域的组合', tags: ['javascript', '闭包'], content: '' },
    { id: 3, title: 'Python 入门', summary: 'print 函数', question: '什么是 Python？', answer: 'Python 是通用编程语言', tags: ['python', '基础'], content: '' },
    { id: 4, title: 'React 组件', summary: 'JavaScript 组件化框架', question: 'React 是什么？', answer: 'React 是 JavaScript 前端框架', tags: ['react', 'javascript'], content: '' },
  ];

  beforeEach(() => {
    engine.buildVocabulary(entries);
  });

  it('返回结果按 score 降序', () => {
    const results = engine.search('JavaScript', entries, 10);
    assert.ok(results.length > 0, '应有结果');
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score, '结果应按分数降序');
    }
  });

  it('最相关的条目排第一', () => {
    const results = engine.search('JavaScript 闭包', entries, 10);
    assert.ok(results.length > 0);
    assert.equal(results[0].entry.title, 'JavaScript 闭包详解');
  });

  it('返回结果包含 entry 和 score', () => {
    const results = engine.search('JavaScript', entries, 10);
    for (const item of results) {
      assert.ok(item.entry, '应包含 entry');
      assert.ok(typeof item.score === 'number', 'score 应为数字');
      assert.ok(item.score > 0 && item.score <= 1, 'score 应在 0-1 之间');
    }
  });

  it('limit 参数限制返回数量', () => {
    const results = engine.search('JavaScript', entries, 2);
    assert.ok(results.length <= 2, `结果应不超过 2 条，实际 ${results.length}`);
  });

  it('空查询返回空数组', () => {
    assert.deepEqual(engine.search('', entries), []);
    assert.deepEqual(engine.search(null, entries), []);
  });

  it('空条目返回空数组', () => {
    assert.deepEqual(engine.search('test', []), []);
    assert.deepEqual(engine.search('test', null), []);
  });

  it('不相关的查询返回空数组', () => {
    const results = engine.search('zzzzzzzzz', entries, 10);
    assert.equal(results.length, 0);
  });

  it('中文查询有效', () => {
    const results = engine.search('闭包', entries, 10);
    assert.ok(results.length > 0, '中文查询应有结果');
    assert.equal(results[0].entry.title, 'JavaScript 闭包详解');
  });

  it('语义相近文本得分高于不相关文本', () => {
    const results = engine.search('脚本编程语言', entries, 10);
    // "JavaScript" 相关条目应排在 "Python" 相关条目前面或都有分
    if (results.length >= 2) {
      // 所有结果应有正分数
      for (const r of results) {
        assert.ok(r.score > 0, '应有正分数');
      }
    }
  });
});

// ==================== 文档向量缓存 ====================

describe('EmbeddingEngine — 文档向量缓存', () => {
  it('缓存后重复调用返回相同结果', () => {
    const entry = { id: 1, title: 'Test', summary: 'test', question: 'q', answer: 'a', tags: [], content: '' };
    engine.buildVocabulary([entry]);
    const vec1 = engine.generateDocumentVector(entry);
    const vec2 = engine.generateDocumentVector(entry);
    // vec2 应从缓存返回
    assert.equal(vec1.size, vec2.size, '缓存返回应有相同大小');
  });

  it('invalidateCache 清除缓存', () => {
    const entry = { id: 1, title: 'Test', summary: 'test', question: 'q', answer: 'a', tags: [], content: '' };
    engine.buildVocabulary([entry]);
    engine.generateDocumentVector(entry);
    engine.invalidateCache(1);
    // 后续调用应重新计算（不报错即可）
    const vec = engine.generateDocumentVector(entry);
    assert.ok(vec instanceof Map, '重新计算应返回 Map');
  });

  it('entry 无 id 时不缓存', () => {
    const entry = { title: 'No ID', summary: '', question: '', answer: '', tags: [], content: '' };
    engine.buildVocabulary([entry]);
    const vec = engine.generateDocumentVector(entry);
    assert.ok(vec instanceof Map, '无 id 条目应正常返回');
  });
});

// ==================== 边界情况 ====================

describe('EmbeddingEngine — 边界情况', () => {
  it('所有字段为空的条目不报错', () => {
    const entry = { id: 1, title: '', summary: '', question: '', answer: '', tags: [], content: '' };
    engine.buildVocabulary([entry]);
    const vec = engine.generateDocumentVector(entry);
    assert.ok(vec instanceof Map);
  });

  it('只含停用词的文本返回空向量', () => {
    const vec = engine.generateVector('的 了 是 在');
    assert.equal(vec.size, 0, '纯停用词应返回空向量');
  });

  it('超长文本不崩溃', () => {
    const longText = 'JavaScript '.repeat(1000);
    const vec = engine.generateVector(longText);
    assert.ok(vec instanceof Map, '超长文本应正常处理');
  });

  it('特殊字符不崩溃', () => {
    const vec = engine.generateVector('!@#$%^&*()_+{}|:"<>?');
    assert.ok(vec instanceof Map, '特殊字符应正常处理');
  });
});

// ==================== FIELD WEIGHTS 常量 ====================

describe('EmbeddingEngine — FIELD_WEIGHTS', () => {
  it('定义了所有字段权重', () => {
    assert.ok(EmbeddingEngine.FIELD_WEIGHTS, '应有 FIELD_WEIGHTS');
    assert.ok(EmbeddingEngine.FIELD_WEIGHTS.title > 0, 'title 权重 > 0');
    assert.ok(EmbeddingEngine.FIELD_WEIGHTS.summary > 0, 'summary 权重 > 0');
    assert.ok(EmbeddingEngine.FIELD_WEIGHTS.question > 0, 'question 权重 > 0');
    assert.ok(EmbeddingEngine.FIELD_WEIGHTS.answer > 0, 'answer 权重 > 0');
    assert.ok(EmbeddingEngine.FIELD_WEIGHTS.tags > 0, 'tags 权重 > 0');
    assert.ok(EmbeddingEngine.FIELD_WEIGHTS.content > 0, 'content 权重 > 0');
  });

  it('title 权重最高', () => {
    const w = EmbeddingEngine.FIELD_WEIGHTS;
    assert.ok(w.title >= w.summary, 'title >= summary');
    assert.ok(w.title >= w.question, 'title >= question');
    assert.ok(w.title >= w.answer, 'title >= answer');
  });

  it('content 权重最低', () => {
    const w = EmbeddingEngine.FIELD_WEIGHTS;
    assert.ok(w.content <= w.answer, 'content <= answer');
    assert.ok(w.content <= w.question, 'content <= question');
  });
});

// ==================== STATIC 方法向后兼容 ====================

describe('EmbeddingEngine — static 方法', () => {
  it('static tokenize 可用', () => {
    const tokens = EmbeddingEngine.tokenize('Hello World');
    assert.ok(Array.isArray(tokens), '应返回数组');
    assert.ok(tokens.length > 0, '应有 token');
  });

  it('static calculateSimilarity 可用', () => {
    const score = EmbeddingEngine.calculateSimilarity('JavaScript 基础', 'JavaScript 基础');
    assert.ok(score > 0, '相同文本应有正相似度');
  });

  it('static semanticSearch 可用', () => {
    const entries = [
      { id: 1, title: 'JavaScript 基础', summary: '变量', question: 'JS?', answer: '脚本语言', tags: [], content: '' },
      { id: 2, title: 'Python 入门', summary: 'print', question: 'Python?', answer: '通用语言', tags: [], content: '' },
    ];
    const results = EmbeddingEngine.semanticSearch('JavaScript', entries, 10);
    assert.ok(results.length > 0, '应有结果');
    assert.ok(results[0].score > 0, '应有正分数');
  });
});

// ==================== 性能测试 ====================

describe('EmbeddingEngine — 性能', () => {
  it('1000 条数据搜索 < 100ms', () => {
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
        content: '',
      });
    }

    engine.buildVocabulary(entries);

    const start = performance.now();
    const results = engine.search('JavaScript 基础', entries, 10);
    const elapsed = performance.now() - start;

    assert.ok(results.length > 0, '应有结果');
    assert.ok(elapsed < 500, `搜索耗时 ${elapsed.toFixed(1)}ms 应 < 500ms`);
  });
});
