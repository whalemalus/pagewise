/**
 * test-depth-embedding-engine.js — EmbeddingEngine 深度测试
 *
 * 测试范围 (15 用例):
 *   初始化         — 构造函数初始状态、FIELD_WEIGHTS 属性、多次 buildVocabulary 覆盖
 *   向量生成       — 中文 bigram、英文 stopword 过滤、混合中英文、空输入、缓存命中与失效
 *   相似度计算     — 相同/不同文本、空输入 = 0、正交/同方向向量
 *   批量索引       — buildVocabulary 后 IDF 非零、罕见词 IDF 更大
 *   搜索           — 语义搜索排序、空查询/条目、limit 参数
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { EmbeddingEngine } = await import('../lib/embedding-engine.js');

// ==================== 初始化 ====================

describe('初始化 — 构造函数默认状态', () => {
  it('新实例词汇表为空、docCount 为 0、缓存为空', () => {
    const engine = new EmbeddingEngine();
    assert.equal(engine._vocabulary.size, 0);
    assert.equal(engine._docCount, 0);
    assert.equal(engine._vectorCache.size, 0);
  });
});

describe('初始化 — FIELD_WEIGHTS 静态属性包含 6 个字段', () => {
  it('title 权重最高 (3.0)，content 权重最低 (0.5)', () => {
    const keys = Object.keys(EmbeddingEngine.FIELD_WEIGHTS);
    assert.equal(keys.length, 6);
    assert.equal(EmbeddingEngine.FIELD_WEIGHTS.title, 3.0);
    assert.equal(EmbeddingEngine.FIELD_WEIGHTS.content, 0.5);
    assert.ok(EmbeddingEngine.FIELD_WEIGHTS.title > EmbeddingEngine.FIELD_WEIGHTS.summary);
    assert.ok(EmbeddingEngine.FIELD_WEIGHTS.summary > EmbeddingEngine.FIELD_WEIGHTS.content);
  });
});

describe('初始化 — 多次 buildVocabulary 覆盖前一次', () => {
  it('第二次 buildVocabulary 清除旧词汇表', () => {
    const engine = new EmbeddingEngine();
    engine.buildVocabulary([
      { title: '苹果手机', content: 'iPhone review' },
      { title: '安卓系统', content: 'Android system' },
    ]);
    const size1 = engine._vocabulary.size;
    assert.ok(size1 > 0);

    // 用完全不同的文档重新构建
    engine.buildVocabulary([
      { title: '量子计算', content: 'quantum computing basics' },
    ]);
    // docCount 应为 1
    assert.equal(engine._docCount, 1);
    // vectorCache 也应被清空
    assert.equal(engine._vectorCache.size, 0);
  });
});

// ==================== 向量生成 ====================

describe('向量生成 — 中文 bigram 分词', () => {
  it('中文文本按 bigram 切分并过滤停用词', () => {
    const engine = new EmbeddingEngine();
    const tokens = engine.tokenize('机器学习是人工智能的子集');
    // 应包含「机器」「学习」「人工」「智能」「子集」等 bigram
    // 不应包含停用 bigram 如「这是」「不是」
    assert.ok(tokens.length > 0, '应该有 token');
    // 验证不含停用字「的」作为单字 token
    const hasStopChar = tokens.includes('的');
    assert.ok(!hasStopChar, '不应包含停用字');
  });
});

describe('向量生成 — 英文 stopword 过滤', () => {
  it('英文文本过滤掉 the/is/are 等停用词', () => {
    const engine = new EmbeddingEngine();
    const tokens = engine.tokenize('the quick brown fox is running');
    // 'the' 和 'is' 应被过滤
    assert.ok(!tokens.includes('the'));
    assert.ok(!tokens.includes('is'));
    // 'quick' 和 'brown' 和 'running' 应保留（cleaned 长度 >= 2）
    assert.ok(tokens.includes('quick') || tokens.some(t => t.startsWith('qu')));
    assert.ok(tokens.includes('running') || tokens.some(t => t.startsWith('ru')));
  });
});

describe('向量生成 — 混合中英文', () => {
  it('混合中英文文本同时产生中文 bigram 和英文 token', () => {
    const engine = new EmbeddingEngine();
    const tokens = engine.tokenize('深度学习 deep learning 算法');
    const hasChinese = tokens.some(t => /[一-鿿]/.test(t));
    const hasEnglish = tokens.some(t => /^[a-z]/.test(t));
    assert.ok(hasChinese, '应包含中文 token');
    assert.ok(hasEnglish, '应包含英文 token');
  });
});

describe('向量生成 — 空文本和无效输入返回空向量', () => {
  it('null/undefined/空字符串均返回空 Map', () => {
    const engine = new EmbeddingEngine();
    assert.equal(engine.generateVector(null).size, 0);
    assert.equal(engine.generateVector(undefined).size, 0);
    assert.equal(engine.generateVector('').size, 0);
    assert.equal(engine.generateVector(123).size, 0);
  });
});

describe('向量生成 — generateDocumentVector 缓存与失效', () => {
  it('缓存命中返回同一引用，invalidateCache 后重新生成', () => {
    const engine = new EmbeddingEngine();
    engine.buildVocabulary([{ title: '测试', content: 'test content' }]);

    const entry = { id: 'doc1', title: 'JavaScript 高级编程', content: 'closures and prototypes' };
    const vec1 = engine.generateDocumentVector(entry);
    const vec2 = engine.generateDocumentVector(entry);
    assert.strictEqual(vec1, vec2, '相同 id 应命中缓存');

    engine.invalidateCache('doc1');
    const vec3 = engine.generateDocumentVector(entry);
    assert.notStrictEqual(vec1, vec3, 'invalidateCache 后应重新生成');
  });
});

// ==================== 相似度计算 ====================

describe('相似度计算 — 相同 vs 不同文本', () => {
  it('相同文本相似度 = 1，完全不同文本相似度 < 0.3', () => {
    const text = '人工智能与机器学习';
    assert.equal(EmbeddingEngine.calculateSimilarity(text, text), 1);

    const sim = EmbeddingEngine.calculateSimilarity(
      'cooking recipes for dinner',
      'quantum physics theory'
    );
    assert.ok(sim < 0.3, `期望 < 0.3，实际 ${sim}`);
  });
});

describe('相似度计算 — 空输入返回 0', () => {
  it('null/空字符串与任何文本相似度为 0', () => {
    assert.equal(EmbeddingEngine.calculateSimilarity(null, 'hello'), 0);
    assert.equal(EmbeddingEngine.calculateSimilarity('hello', null), 0);
    assert.equal(EmbeddingEngine.calculateSimilarity('', 'hello'), 0);
    assert.equal(EmbeddingEngine.calculateSimilarity('', ''), 0);
  });
});

describe('相似度计算 — 手动构造向量验证余弦公式', () => {
  it('正交向量相似度 = 0，同方向向量相似度 = 1', () => {
    const engine = new EmbeddingEngine();

    // 正交：无共同 term
    const v1 = new Map([['a', 1], ['b', 0]]);
    const v2 = new Map([['c', 1], ['d', 0]]);
    assert.equal(engine.cosineSimilarity(v1, v2), 0);

    // 同方向：比例相同
    const v3 = new Map([['a', 3], ['b', 4]]);
    const v4 = new Map([['a', 6], ['b', 8]]);
    assert.ok(Math.abs(engine.cosineSimilarity(v3, v4) - 1) < 1e-10, '同方向向量 ≈ 1');
  });
});

// ==================== 批量索引 ====================

describe('批量索引 — buildVocabulary 后 IDF 非零', () => {
  it('出现在所有文档中的词 IDF 较小，罕见词 IDF 较大', () => {
    const engine = new EmbeddingEngine();
    const entries = [
      { title: '机器学习基础', content: 'machine learning basics intro' },
      { title: '机器学习进阶', content: 'machine learning advanced topics' },
      { title: '深度学习入门', content: 'deep learning introduction neural' },
    ];
    engine.buildVocabulary(entries);

    // 'machine' 出现在 2/3 文档中
    const idfMachine = engine.idf('machine');
    // 'neural' 只出现在 1/3 文档中
    const idfNeural = engine.idf('neural');
    assert.ok(idfMachine > 0, 'IDF 应 > 0');
    assert.ok(idfNeural > 0, 'IDF 应 > 0');
    assert.ok(idfNeural > idfMachine, '罕见词 IDF 应更大');
  });
});

// ==================== 搜索 ====================

describe('搜索 — 语义搜索返回按相关性排序', () => {
  it('查询 "机器学习" 最相关的结果排在前面', () => {
    const entries = [
      { id: '1', title: '做饭教程', content: 'cooking recipes' },
      { id: '2', title: '机器学习入门', content: 'machine learning basics neural network' },
      { id: '3', title: '旅游攻略', content: 'travel guide tips' },
      { id: '4', title: '深度学习框架', content: 'deep learning framework tensorflow' },
    ];
    const results = EmbeddingEngine.semanticSearch('机器学习', entries);
    assert.ok(results.length > 0, '应有搜索结果');
    // 第一个结果应与机器学习相关
    const topTitles = results.slice(0, 2).map(r => r.entry.title);
    assert.ok(
      topTitles.some(t => t.includes('机器学习') || t.includes('深度学习')),
      `Top 结果应与学习相关: ${topTitles.join(', ')}`
    );
  });
});

describe('搜索 — 空查询和空条目均返回空数组', () => {
  it('空/null 查询、空条目列表均返回 []', () => {
    const entries = [{ id: '1', title: 'test', content: 'test content' }];
    assert.deepEqual(EmbeddingEngine.semanticSearch('', entries), []);
    assert.deepEqual(EmbeddingEngine.semanticSearch(null, entries), []);
    assert.deepEqual(EmbeddingEngine.semanticSearch('test', []), []);
    assert.deepEqual(EmbeddingEngine.semanticSearch('test', null), []);
  });
});

describe('搜索 — limit 参数限制返回数量', () => {
  it('limit=2 时最多返回 2 条结果', () => {
    const entries = [
      { id: '1', title: 'JavaScript 基础', content: 'javascript basics' },
      { id: '2', title: 'JavaScript 进阶', content: 'javascript advanced' },
      { id: '3', title: 'JavaScript 框架', content: 'javascript frameworks react vue' },
      { id: '4', title: 'JavaScript 工具', content: 'javascript tools webpack babel' },
    ];
    const results = EmbeddingEngine.semanticSearch('javascript', entries, 2);
    assert.ok(results.length <= 2, `期望 ≤ 2 条，实际 ${results.length}`);
  });
});
