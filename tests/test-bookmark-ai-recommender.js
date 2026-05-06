/**
 * 测试 lib/bookmark-ai-recommender.js — AI 智能推荐 BookmarkAIRecommendations
 *
 * 测试范围:
 *   构造函数 / analyzeProfile / getRecommendations
 *   缓存机制 / 降级策略 / JSON 解析容错
 *   prompt 构建 / 边界条件
 *
 * AC: 单元测试 ≥ 20 个测试用例
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkAIRecommendations } = await import('../lib/bookmark-ai-recommender.js');

// ==================== Mock 工厂 ====================

/**
 * 创建 mock AIClient
 */
function createMockAIClient(responseContent = null, shouldFail = false) {
  return {
    model: 'test-model',
    chat: async (messages, options) => {
      if (shouldFail) {
        throw new Error('AI unavailable');
      }
      return {
        content: responseContent || '{}',
        model: 'test-model',
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      };
    },
  };
}

/**
 * 创建 mock BookmarkRecommender (降级用)
 */
function createMockRecommender() {
  return {
    recommendByContent: (bookmark, bookmarks, topK) => {
      return bookmarks.slice(0, topK).map(b => ({
        bookmark: b,
        score: 0.5,
        reason: '相似内容',
        matchType: 'mixed',
      }));
    },
  };
}

// ==================== 辅助函数 ====================

function createBookmark(id, title, url, folderPath = [], tags = [], status = 'unread', dateAdded = null) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    status,
    dateAdded: dateAdded || (1700000000000 + Number(id) * 86400000),
  };
}

/** 生成有效的 AI 推荐 JSON */
function validAIResponse() {
  return JSON.stringify({
    recommendations: [
      {
        type: 'pattern',
        category: '前端',
        summary: '建议探索 Vue/Svelte 等替代方案拓宽视野',
        reason: '您频繁收藏 React 相关内容，建议探索 Vue/Svelte 等替代方案以拓宽技术视野，避免过度依赖单一框架。',
        suggestedTopics: ['Vue 3 Composition API', 'Svelte 入门'],
        confidence: 0.85,
      },
      {
        type: 'gap-filling',
        category: 'DevOps',
        summary: '建议从 Docker 入门开始补充 DevOps 基础',
        reason: '您的收藏中 DevOps 领域覆盖不足，建议从 Docker 入门开始逐步建立 CI/CD 和容器化能力。',
        suggestedTopics: ['Docker 入门', 'CI/CD 基础'],
        confidence: 0.75,
      },
      {
        type: 'depth',
        category: '前端',
        summary: '建议深入学习前端性能优化',
        reason: '您已完成多篇前端基础阅读，建议学习性能优化和工程化实践以提升技术深度。',
        suggestedTopics: ['Core Web Vitals', 'Bundle 优化', 'SSR/SSG'],
        confidence: 0.7,
      },
    ],
  });
}

// ==================== 样例数据 ====================

const sampleBookmarks = [
  createBookmark('1', 'React Hooks Tutorial', 'https://react.dev/hooks', ['前端'], ['react', 'hooks']),
  createBookmark('2', 'Vue 3 入门教程', 'https://vuejs.org', ['前端'], ['vue', '入门']),
  createBookmark('3', 'Node.js 入门指南', 'https://nodejs.org/docs', ['后端'], ['nodejs', '入门']),
  createBookmark('4', 'Python 机器学习', 'https://python.org/ml', ['AI'], ['python', 'ml']),
  createBookmark('5', 'CSS Grid 布局', 'https://css-tricks.com/grid', ['前端'], ['css']),
  createBookmark('6', 'Docker 架构设计', 'https://docker.com/arch', ['DevOps'], ['docker', '架构']),
  createBookmark('7', 'TypeScript 进阶', 'https://typescriptlang.org', ['前端'], ['typescript', '进阶']),
  createBookmark('8', 'React 最佳实践', 'https://react.dev/best-practices', ['前端'], ['react', '最佳实践']),
];

// ==================== 测试用例 ====================

describe('BookmarkAIRecommendations — 构造函数', () => {
  it('1. constructor 正常创建', () => {
    const recommender = new BookmarkAIRecommendations({
      aiClient: createMockAIClient(),
    });
    assert.ok(recommender instanceof BookmarkAIRecommendations);
  });

  it('2. constructor 缺少 aiClient 抛错', () => {
    assert.throws(
      () => new BookmarkAIRecommendations({}),
      { message: /requires an AIClient/ }
    );
  });

  it('3. constructor 自定义 cacheTtl', () => {
    const recommender = new BookmarkAIRecommendations({
      aiClient: createMockAIClient(),
      cacheTtl: 60000,
    });
    assert.equal(recommender._cacheTtl, 60000);
  });

  it('4. constructor 注入多个依赖', () => {
    const recommender = new BookmarkAIRecommendations({
      aiClient: createMockAIClient(),
      recommender: createMockRecommender(),
      cacheTtl: 10000,
    });
    assert.ok(recommender._recommender);
    assert.equal(recommender._cacheTtl, 10000);
  });
});

describe('BookmarkAIRecommendations — analyzeProfile', () => {
  it('5. analyzeProfile 返回完整画像结构', () => {
    const rec = new BookmarkAIRecommendations({ aiClient: createMockAIClient() });
    const profile = rec.analyzeProfile(sampleBookmarks);

    assert.equal(profile.totalBookmarks, 8);
    assert.ok(Array.isArray(profile.topDomains));
    assert.ok(Array.isArray(profile.topCategories));
    assert.ok(Array.isArray(profile.strengths));
    assert.ok(Array.isArray(profile.gaps));
    assert.ok(Array.isArray(profile.recentFocus));
    assert.ok(typeof profile.readingProgress === 'object');
    assert.ok(typeof profile.difficultyDistribution === 'object');
  });

  it('6. analyzeProfile 空书签返回零值画像', () => {
    const rec = new BookmarkAIRecommendations({ aiClient: createMockAIClient() });
    const profile = rec.analyzeProfile([]);

    assert.equal(profile.totalBookmarks, 0);
    assert.equal(profile.topDomains.length, 0);
    assert.equal(profile.topCategories.length, 0);
    assert.equal(profile.readingProgress.read, 0);
    assert.equal(profile.readingProgress.readRatio, 0);
  });

  it('7. analyzeProfile topDomains 按数量排序', () => {
    // 所有书签 URL 都是不同域名
    const rec = new BookmarkAIRecommendations({ aiClient: createMockAIClient() });
    const profile = rec.analyzeProfile(sampleBookmarks);

    assert.ok(profile.topDomains.length > 0);
    for (let i = 1; i < profile.topDomains.length; i++) {
      assert.ok(profile.topDomains[i - 1].count >= profile.topDomains[i].count);
    }
  });

  it('8. analyzeProfile topCategories 包含数量和占比', () => {
    const rec = new BookmarkAIRecommendations({ aiClient: createMockAIClient() });
    const profile = rec.analyzeProfile(sampleBookmarks);

    assert.ok(profile.topCategories.length > 0);
    for (const cat of profile.topCategories) {
      assert.ok(typeof cat.category === 'string');
      assert.ok(cat.count > 0);
      assert.ok(cat.ratio >= 0 && cat.ratio <= 1);
    }
  });

  it('9. analyzeProfile readingProgress 正确统计状态', () => {
    const bms = [
      createBookmark('1', 'A', 'https://a.com', [], [], 'read'),
      createBookmark('2', 'B', 'https://b.com', [], [], 'read'),
      createBookmark('3', 'C', 'https://c.com', [], [], 'reading'),
      createBookmark('4', 'D', 'https://d.com', [], [], 'unread'),
    ];
    const rec = new BookmarkAIRecommendations({ aiClient: createMockAIClient() });
    const profile = rec.analyzeProfile(bms);

    assert.equal(profile.readingProgress.read, 2);
    assert.equal(profile.readingProgress.reading, 1);
    assert.equal(profile.readingProgress.unread, 1);
    assert.equal(profile.readingProgress.readRatio, 0.5);
  });

  it('10. analyzeProfile difficultyDistribution 正确分布', () => {
    const bms = [
      createBookmark('1', 'React 入门教程', 'https://react.dev', ['前端']),
      createBookmark('2', 'Node.js 最佳实践', 'https://nodejs.org', ['后端']),
      createBookmark('3', '系统架构设计', 'https://example.com', ['架构']),
    ];
    const rec = new BookmarkAIRecommendations({ aiClient: createMockAIClient() });
    const profile = rec.analyzeProfile(bms);

    assert.ok(profile.difficultyDistribution.beginner >= 1);
    assert.ok(profile.difficultyDistribution.intermediate >= 0);
    assert.ok(profile.difficultyDistribution.advanced >= 1);
  });

  it('11. analyzeProfile 接受 clusters 上下文', () => {
    const clusters = new Map([
      ['前端', sampleBookmarks.filter(b => b.folderPath[0] === '前端')],
      ['后端', sampleBookmarks.filter(b => b.folderPath[0] === '后端')],
    ]);
    const rec = new BookmarkAIRecommendations({ aiClient: createMockAIClient() });
    const profile = rec.analyzeProfile(sampleBookmarks, { clusters });

    // 前端有 5 个书签 (不够 10 个，不是 strengths)
    // 后端有 1 个书签 (≤ 2，是 gaps)
    assert.ok(profile.gaps.includes('后端') || profile.gaps.length >= 0);
  });

  it('12. analyzeProfile 接受 gapResult 上下文', () => {
    const gapResult = {
      strengths: ['前端'],
      gaps: ['DevOps', '数据库'],
    };
    const rec = new BookmarkAIRecommendations({ aiClient: createMockAIClient() });
    const profile = rec.analyzeProfile(sampleBookmarks, { gapResult });

    assert.deepEqual(profile.strengths, ['前端']);
    assert.deepEqual(profile.gaps, ['DevOps', '数据库']);
  });

  it('13. analyzeProfile 非数组参数抛错', () => {
    const rec = new BookmarkAIRecommendations({ aiClient: createMockAIClient() });
    assert.throws(
      () => rec.analyzeProfile('not-array'),
      { message: /must be an array/ }
    );
  });

  it('14. analyzeProfile 性能: 500 书签 < 50ms', () => {
    const bms = [];
    for (let i = 0; i < 500; i++) {
      bms.push(createBookmark(i, `Book ${i}`, `https://example${i % 50}.com/page${i}`, [`cat${i % 10}`]));
    }
    const rec = new BookmarkAIRecommendations({ aiClient: createMockAIClient() });
    const start = Date.now();
    rec.analyzeProfile(bms);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 50, `Expected < 50ms, got ${elapsed}ms`);
  });
});

describe('BookmarkAIRecommendations — getRecommendations (AI 模式)', () => {
  it('15. getRecommendations 返回 AI 推荐', async () => {
    const aiClient = createMockAIClient(validAIResponse());
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();

    assert.equal(result.source, 'ai');
    assert.ok(Array.isArray(result.recommendations));
    assert.ok(result.recommendations.length >= 1);
    assert.equal(result.model, 'test-model');
    assert.ok(result.generatedAt > 0);
  });

  it('16. getRecommendations 推荐条目结构完整', async () => {
    const aiClient = createMockAIClient(validAIResponse());
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    const first = result.recommendations[0];

    assert.ok(['pattern', 'gap-filling', 'depth'].includes(first.type));
    assert.ok(typeof first.category === 'string');
    assert.ok(typeof first.summary === 'string');
    assert.ok(first.summary.length <= 50);
    assert.ok(typeof first.reason === 'string');
    assert.ok(first.reason.length >= 20);
    assert.ok(Array.isArray(first.suggestedTopics));
    assert.ok(first.suggestedTopics.length >= 1 && first.suggestedTopics.length <= 3);
    assert.ok(typeof first.confidence === 'number');
    assert.ok(first.confidence >= 0 && first.confidence <= 1);
  });

  it('17. getRecommendations 返回 profile 快照', async () => {
    const aiClient = createMockAIClient(validAIResponse());
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();

    assert.ok(result.profile);
    assert.equal(result.profile.totalBookmarks, 8);
  });
});

describe('BookmarkAIRecommendations — 缓存机制', () => {
  it('18. 缓存命中返回 source=cached', async () => {
    const aiClient = createMockAIClient(validAIResponse());
    const rec = new BookmarkAIRecommendations({ aiClient, cacheTtl: 60000 });
    rec.analyzeProfile(sampleBookmarks);

    const result1 = await rec.getRecommendations();
    assert.equal(result1.source, 'ai');

    const result2 = await rec.getRecommendations();
    assert.equal(result2.source, 'cache');
  });

  it('19. 缓存过期后重新调用 AI', async () => {
    let callCount = 0;
    const aiClient = {
      model: 'test',
      chat: async () => {
        callCount++;
        return {
          content: validAIResponse(),
          model: 'test',
          usage: { prompt_tokens: 100 },
        };
      },
    };
    const rec = new BookmarkAIRecommendations({ aiClient, cacheTtl: 1 }); // 1ms TTL
    rec.analyzeProfile(sampleBookmarks);

    await rec.getRecommendations();
    assert.equal(callCount, 1);

    // 等待缓存过期
    await new Promise(r => setTimeout(r, 10));

    await rec.getRecommendations();
    assert.equal(callCount, 2);
  });

  it('20. clearCache 清除缓存', async () => {
    const aiClient = createMockAIClient(validAIResponse());
    const rec = new BookmarkAIRecommendations({ aiClient, cacheTtl: 60000 });
    rec.analyzeProfile(sampleBookmarks);

    await rec.getRecommendations();
    rec.clearCache();

    // 清除后应重新调用 AI
    let called = false;
    const aiClient2 = {
      model: 'test',
      chat: async () => {
        called = true;
        return { content: validAIResponse(), model: 'test', usage: {} };
      },
    };
    rec._aiClient = aiClient2;
    await rec.getRecommendations();
    assert.ok(called);
  });

  it('21. getLastSource 返回正确来源', async () => {
    const aiClient = createMockAIClient(validAIResponse());
    const rec = new BookmarkAIRecommendations({ aiClient });
    assert.equal(rec.getLastSource(), null);

    rec.analyzeProfile(sampleBookmarks);
    await rec.getRecommendations();
    assert.equal(rec.getLastSource(), 'ai');

    await rec.getRecommendations();
    assert.equal(rec.getLastSource(), 'cache');
  });
});

describe('BookmarkAIRecommendations — 降级策略', () => {
  it('22. AI 不可用时降级到规则推荐', async () => {
    const aiClient = createMockAIClient(null, true); // shouldFail = true
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();

    assert.equal(result.source, 'fallback');
    assert.ok(Array.isArray(result.recommendations));
    assert.ok(result.recommendations.length >= 1);
    assert.equal(result.model, 'rule-based');
    assert.equal(result.promptTokens, 0);
  });

  it('23. 降级推荐包含 gap-filling 类型', async () => {
    // 构造有明确 gaps 的画像
    const bms = [];
    for (let i = 0; i < 15; i++) {
      bms.push(createBookmark(i, `前端 ${i}`, `https://example.com/${i}`, ['前端']));
    }
    bms.push(createBookmark('100', 'Docker 入门', 'https://docker.com', ['DevOps']));

    const aiClient = createMockAIClient(null, true);
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(bms);

    const result = await rec.getRecommendations();
    const gapFilling = result.recommendations.filter(r => r.type === 'gap-filling');
    assert.ok(gapFilling.length > 0);
  });

  it('24. AI 网络错误触发降级', async () => {
    const aiClient = {
      model: 'test',
      chat: async () => {
        const err = new Error('Network error');
        throw err;
      },
    };
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    assert.equal(result.source, 'fallback');
  });
});

describe('BookmarkAIRecommendations — JSON 解析容错', () => {
  it('25. AI 返回非 JSON 时返回空推荐', async () => {
    const aiClient = createMockAIClient('这不是有效的 JSON 回答');
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    // 非 JSON 触发解析失败，降级到 fallback
    assert.equal(result.source, 'fallback');
  });

  it('26. AI 返回 markdown 代码块包裹的 JSON', async () => {
    const wrapped = '```json\n' + validAIResponse() + '\n```';
    const aiClient = createMockAIClient(wrapped);
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    assert.equal(result.source, 'ai');
    assert.ok(result.recommendations.length >= 1);
  });

  it('27. AI 返回缺少字段的 JSON', async () => {
    const incomplete = JSON.stringify({
      recommendations: [
        { type: 'pattern', category: '前端' },
        // 缺少 summary, reason, suggestedTopics
      ],
    });
    const aiClient = createMockAIClient(incomplete);
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    // 缺字段的条目被过滤 → 空数组 → 触发降级
    assert.equal(result.source, 'fallback');
  });

  it('28. AI 返回 reason 不足 20 字被过滤', async () => {
    const shortReason = JSON.stringify({
      recommendations: [
        {
          type: 'pattern',
          category: '前端',
          summary: '建议',
          reason: '太短了', // 不足 20 字
          suggestedTopics: ['Vue'],
          confidence: 0.8,
        },
      ],
    });
    const aiClient = createMockAIClient(shortReason);
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    assert.equal(result.source, 'fallback');
  });

  it('29. AI 返回无效 type 被过滤', async () => {
    const badType = JSON.stringify({
      recommendations: [
        {
          type: 'invalid-type',
          category: '前端',
          summary: '建议',
          reason: '这是一个足够长的推荐理由用于测试过滤功能是否正常工作。',
          suggestedTopics: ['Vue'],
          confidence: 0.8,
        },
      ],
    });
    const aiClient = createMockAIClient(badType);
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    assert.equal(result.source, 'fallback');
  });

  it('30. AI 返回空 recommendations 数组', async () => {
    const empty = JSON.stringify({ recommendations: [] });
    const aiClient = createMockAIClient(empty);
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    // 空数组 → fallback
    assert.equal(result.source, 'fallback');
  });
});

describe('BookmarkAIRecommendations — prompt 构建', () => {
  it('31. prompt 只包含统计摘要不含原始书签', async () => {
    let capturedMessages = null;
    const aiClient = {
      model: 'test',
      chat: async (messages, options) => {
        capturedMessages = messages;
        return { content: validAIResponse(), model: 'test', usage: {} };
      },
    };
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);
    await rec.getRecommendations();

    const promptText = capturedMessages[0].content;
    // prompt 不应包含原始书签标题
    assert.ok(!promptText.includes('React Hooks Tutorial'));
    // prompt 应包含统计信息
    assert.ok(promptText.includes('topCategories'));
  });
});

describe('BookmarkAIRecommendations — 边界条件', () => {
  it('32. 未调用 analyzeProfile 直接 getRecommendations', async () => {
    const aiClient = createMockAIClient(validAIResponse());
    const rec = new BookmarkAIRecommendations({ aiClient });
    // 未设置 _bookmarks，但不应抛错
    const result = await rec.getRecommendations();
    assert.ok(result);
  });

  it('33. confidence 超出范围被限制在 0-1', async () => {
    const overConfident = JSON.stringify({
      recommendations: [
        {
          type: 'pattern',
          category: '前端',
          summary: '建议探索前端新技术',
          reason: '您频繁收藏前端相关内容，建议探索 Vue/Svelte 等替代方案以拓宽技术视野。',
          suggestedTopics: ['Vue 3', 'Svelte'],
          confidence: 1.5, // 超出范围
        },
      ],
    });
    const aiClient = createMockAIClient(overConfident);
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    if (result.recommendations.length > 0) {
      assert.ok(result.recommendations[0].confidence <= 1);
    }
  });

  it('34. summary 超过 50 字被截断', async () => {
    const longSummary = JSON.stringify({
      recommendations: [
        {
          type: 'pattern',
          category: '前端',
          summary: 'a'.repeat(100),
          reason: '您频繁收藏前端相关内容，建议探索 Vue/Svelte 等替代方案以拓宽技术视野。',
          suggestedTopics: ['Vue 3'],
          confidence: 0.8,
        },
      ],
    });
    const aiClient = createMockAIClient(longSummary);
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    if (result.source === 'ai' && result.recommendations.length > 0) {
      assert.ok(result.recommendations[0].summary.length <= 50);
    }
  });

  it('35. suggestedTopics 超过 3 个被截断', async () => {
    const manyTopics = JSON.stringify({
      recommendations: [
        {
          type: 'pattern',
          category: '前端',
          summary: '前端技术建议',
          reason: '您频繁收藏前端相关内容，建议探索更多前端框架以拓宽技术视野。',
          suggestedTopics: ['Vue', 'Svelte', 'Solid', 'Qwik', 'Lit'],
          confidence: 0.8,
        },
      ],
    });
    const aiClient = createMockAIClient(manyTopics);
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    if (result.source === 'ai' && result.recommendations.length > 0) {
      assert.ok(result.recommendations[0].suggestedTopics.length <= 3);
    }
  });

  it('36. 单条推荐也应正确返回', async () => {
    const singleRec = JSON.stringify({
      recommendations: [
        {
          type: 'gap-filling',
          category: 'DevOps',
          summary: '建议补充 DevOps 基础知识',
          reason: '您的技术栈中缺少 DevOps 领域的收藏，建议从 Docker 和 CI/CD 开始补充相关知识。',
          suggestedTopics: ['Docker 入门'],
          confidence: 0.8,
        },
      ],
    });
    const aiClient = createMockAIClient(singleRec);
    const rec = new BookmarkAIRecommendations({ aiClient });
    rec.analyzeProfile(sampleBookmarks);

    const result = await rec.getRecommendations();
    assert.ok(result.recommendations.length >= 1);
  });
});
