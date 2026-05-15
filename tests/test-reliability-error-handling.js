/**
 * QA004 — 可靠性测试：错误处理
 *
 * 测试各模块在异常输入、网络错误、存储故障等情况下的行为。
 * 确保错误被正确分类、友好提示、不崩溃。
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock, uninstallChromeMock } from './helpers/setup.js';

installChromeMock();

const {
  classifyAIError, classifyContentError, classifyStorageError,
  retryWithBackoff, ErrorType, CONTENT_ERROR_MESSAGES
} = await import('../lib/error-handler.js');
const { AIClient, estimateTokens, estimateMessagesTokens } = await import('../lib/ai-client.js');
const { KnowledgeBase } = await import('../lib/knowledge-base.js');
const { SkillEngine } = await import('../lib/skill-engine.js');
const { calculateNextReview, initializeReviewData } = await import('../lib/spaced-repetition.js');

after(() => { uninstallChromeMock(); });

// ==================== classifyAIError ====================

describe('classifyAIError — 无效/边界输入', () => {
  it('null 错误对象不崩溃，返回 UNKNOWN', () => {
    const result = classifyAIError(null);
    assert.equal(result.type, ErrorType.UNKNOWN);
    assert.equal(result.retryable, false);
  });

  it('undefined 错误对象不崩溃，返回 UNKNOWN', () => {
    const result = classifyAIError(undefined);
    assert.equal(result.type, ErrorType.UNKNOWN);
  });

  it('空对象 {} 返回 UNKNOWN', () => {
    const result = classifyAIError({});
    assert.equal(result.type, ErrorType.UNKNOWN);
    assert.equal(result.retryable, false);
  });

  it('无 message 属性的普通对象返回 UNKNOWN', () => {
    const result = classifyAIError({ code: 500 });
    assert.equal(result.type, ErrorType.UNKNOWN);
  });

  it('message 为空字符串返回 UNKNOWN', () => {
    const result = classifyAIError(new Error(''));
    assert.equal(result.type, ErrorType.UNKNOWN);
  });

  it('AbortError 被正确分类为 TIMEOUT', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const result = classifyAIError(err);
    assert.equal(result.type, ErrorType.TIMEOUT);
    assert.equal(result.retryable, true);
  });

  it('API 401 状态码被分类为 AUTH', () => {
    const result = classifyAIError(new Error('API 401: Unauthorized'));
    assert.equal(result.type, ErrorType.AUTH);
    assert.equal(result.retryable, false);
  });

  it('API 429 状态码被分类为 RATE_LIMIT', () => {
    const result = classifyAIError(new Error('API 429: Too Many Requests'));
    assert.equal(result.type, ErrorType.RATE_LIMIT);
    assert.equal(result.retryable, true);
  });

  it('API 500+ 状态码被分类为 SERVER_ERROR', () => {
    const result = classifyAIError(new Error('API 503: Service Unavailable'));
    assert.equal(result.type, ErrorType.SERVER_ERROR);
    assert.equal(result.retryable, true);
  });

  it('TypeError 被分类为 NETWORK', () => {
    const err = new TypeError('Failed to fetch');
    const result = classifyAIError(err);
    assert.equal(result.type, ErrorType.NETWORK);
    assert.equal(result.retryable, true);
  });

  it('originalMessage 始终保留原始错误消息', () => {
    const original = 'API 429: Rate limit exceeded for model gpt-4o';
    const result = classifyAIError(new Error(original));
    assert.equal(result.originalMessage, original);
  });
});

// ==================== classifyContentError ====================

describe('classifyContentError — 内容提取错误分类', () => {
  it('null 错误不崩溃', () => {
    const result = classifyContentError(null);
    assert.ok(result.message);
    assert.equal(typeof result.fallback, 'boolean');
  });

  it('YouTube 字幕缺失错误', () => {
    const result = classifyContentError(new Error('No captions available'), 'youtube');
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS);
    assert.equal(result.fallback, false);
  });

  it('PDF 读取错误提供 fallback', () => {
    const result = classifyContentError(new Error('Cannot read PDF'), 'pdf');
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.PDF_READ_ERROR);
    assert.equal(result.fallback, true);
    assert.ok(result.fallbackLabel);
  });

  it('通用页面错误提供 fallback', () => {
    const result = classifyContentError(new Error('Extraction failed'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_CONTENT);
    assert.equal(result.fallback, true);
  });

  it('字幕关键字匹配中文消息', () => {
    const result = classifyContentError(new Error('该视频没有字幕'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS);
  });
});

// ==================== classifyStorageError ====================

describe('classifyStorageError — 存储错误分类', () => {
  it('null 错误不崩溃', () => {
    const result = classifyStorageError(null);
    assert.ok(result.message);
  });

  it('QuotaExceededError 标记为非致命', () => {
    const result = classifyStorageError(new Error('QuotaExceededError'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_QUOTA);
    assert.equal(result.fatal, false);
  });

  it('存储空间不足（中文）', () => {
    const result = classifyStorageError(new Error('存储空间不足'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_QUOTA);
    assert.equal(result.fatal, false);
  });

  it('IndexedDB 不可用标记为致命', () => {
    const result = classifyStorageError(new Error('IndexedDB not allowed'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_UNAVAILABLE);
    assert.equal(result.fatal, true);
  });

  it('未知存储错误返回通用消息', () => {
    const result = classifyStorageError(new Error('Something weird'));
    assert.ok(result.message);
    assert.equal(result.fatal, false);
  });
});

// ==================== retryWithBackoff ====================

describe('retryWithBackoff — 重试机制', () => {
  it('成功时不重试', async () => {
    let calls = 0;
    const result = await retryWithBackoff(async () => {
      calls++;
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(calls, 1);
  });

  it('非速率限制错误直接抛出', async () => {
    let calls = 0;
    await assert.rejects(
      () => retryWithBackoff(async () => {
        calls++;
        throw new Error('API 401: Unauthorized');
      }),
      { message: /401/ }
    );
    assert.equal(calls, 1);
  });

  it('速率限制错误进行重试（最多 maxRetries 次）', async () => {
    let calls = 0;
    await assert.rejects(
      () => retryWithBackoff(
        async () => { calls++; throw new Error('API 429: Rate limit'); },
        { maxRetries: 2, baseDelay: 1 }
      ),
      { message: /429/ }
    );
    assert.equal(calls, 3); // 初始 + 2 次重试
  });

  it('重试成功后返回结果', async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 3) throw new Error('API 429: Rate limit');
        return 'success';
      },
      { maxRetries: 3, baseDelay: 1 }
    );
    assert.equal(result, 'success');
    assert.equal(calls, 3);
  });

  it('onRetry 回调被调用', async () => {
    const retryEvents = [];
    await assert.rejects(
      () => retryWithBackoff(
        async () => { throw new Error('Too many requests'); },
        { maxRetries: 2, baseDelay: 1, onRetry: (attempt, delay, err) => retryEvents.push({ attempt, delay }) }
      )
    );
    assert.equal(retryEvents.length, 2);
    assert.equal(retryEvents[0].attempt, 1);
    assert.equal(retryEvents[1].attempt, 2);
    // 指数退避：第一次 baseDelay*1, 第二次 baseDelay*2
    assert.equal(retryEvents[0].delay, 1);
    assert.equal(retryEvents[1].delay, 2);
  });

  it('maxRetries=0 不进行任何重试', async () => {
    let calls = 0;
    await assert.rejects(
      () => retryWithBackoff(
        async () => { calls++; throw new Error('Rate limit'); },
        { maxRetries: 0, baseDelay: 1 }
      )
    );
    assert.equal(calls, 1);
  });
});

// ==================== AIClient 错误处理 ====================

describe('AIClient — 构造和无效输入', () => {
  it('无参构造不抛出异常', () => {
    const client = new AIClient();
    assert.equal(client.apiKey, '');
    assert.equal(client.model, 'claude-sonnet-4-6');
  });

  it('未知协议不崩溃', () => {
    const client = new AIClient({ protocol: 'unknown' });
    assert.equal(client.protocol, 'unknown');
    assert.equal(client.isClaude(), false);
    assert.equal(client.isOpenAI(), false);
  });

  it('baseUrl 处理各种尾部斜杠', () => {
    const c1 = new AIClient({ baseUrl: 'https://api.example.com///' });
    assert.equal(c1.baseUrl, 'https://api.example.com');

    const c2 = new AIClient({ baseUrl: 'https://api.example.com/v1/' });
    assert.equal(c2.baseUrl, 'https://api.example.com');
  });

  it('buildRequest 空消息数组不崩溃', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const req = client.buildRequest([], {});
    assert.ok(req.url);
    assert.ok(req.body);
    assert.ok(Array.isArray(req.body.messages));
  });

  it('parseResponse 缺失字段会抛出', () => {
    const client = new AIClient({ protocol: 'claude' });
    assert.throws(() => client.parseResponse({}), /Cannot read/);
  });

  it('parseResponse OpenAI 缺失 choices 会抛出', () => {
    const client = new AIClient({ protocol: 'openai' });
    assert.throws(() => client.parseResponse({}), /Cannot read/);
  });

  it('estimateTokens 空/null/undefined 返回 0', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
    assert.equal(estimateTokens(123), 0);
  });

  it('estimateMessagesTokens 非数组返回 0', () => {
    assert.equal(estimateMessagesTokens(null), 0);
    assert.equal(estimateMessagesTokens('hello'), 0);
    assert.equal(estimateMessagesTokens(undefined), 0);
  });
});

// ==================== SkillEngine 错误处理 ====================

describe('SkillEngine — 错误处理', () => {
  it('缺少 id/name/execute 的技能注册抛出', () => {
    const engine = new SkillEngine();
    assert.throws(() => engine.register({}), /id, name/);
    assert.throws(() => engine.register({ id: 'a' }), /id, name/);
    assert.throws(() => engine.register({ id: 'a', name: 'b' }), /id, name/);
  });

  it('执行不存在的技能抛出', async () => {
    const engine = new SkillEngine();
    await assert.rejects(
      () => engine.execute('nonexistent'),
      /not found/
    );
  });

  it('执行禁用的技能抛出', async () => {
    const engine = new SkillEngine();
    engine.register({ id: 'test', name: 'Test', enabled: false, execute: async () => {} });
    await assert.rejects(
      () => engine.execute('test'),
      /disabled/
    );
  });

  it('执行抛错的技能传播错误给 onError hook', async () => {
    const engine = new SkillEngine();
    let caughtError = null;
    engine.on('onError', (skill, params, err) => { caughtError = err; });
    engine.register({ id: 'fail', name: 'Failing', execute: async () => { throw new Error('boom'); } });

    await assert.rejects(() => engine.execute('fail'), /boom/);
    assert.ok(caughtError);
    assert.equal(caughtError.message, 'boom');
  });

  it('matchTriggers 中 trigger 抛错不崩溃', () => {
    const engine = new SkillEngine();
    engine.register({
      id: 'bad-trigger',
      name: 'Bad',
      trigger: () => { throw new Error('trigger crash'); },
      execute: async () => {}
    });
    const results = engine.matchTriggers({ url: 'https://example.com' });
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 0);
  });
});

// ==================== SpacedRepetition 错误处理 ====================

describe('calculateNextReview — 边界质量值', () => {
  it('quality 超过 5 被截断为 5', () => {
    const data = initializeReviewData();
    const result = calculateNextReview(10, data);
    assert.ok(result.interval > 0);
    assert.ok(result.easeFactor >= 1.3);
  });

  it('quality 为负数被截断为 0', () => {
    const data = initializeReviewData();
    const result = calculateNextReview(-5, data);
    assert.equal(result.repetitions, 0);
    assert.equal(result.interval, 1);
  });

  it('NaN quality 不崩溃', () => {
    const data = initializeReviewData();
    const result = calculateNextReview(NaN, data);
    // NaN rounds to 0, which is < 3 => failure
    assert.equal(result.repetitions, 0);
    assert.equal(result.interval, 1);
  });

  it('easeFactor 为 NaN 时回退到默认值 2.5', () => {
    const data = { interval: 1, repetitions: 0, easeFactor: NaN };
    const result = calculateNextReview(5, data);
    assert.ok(result.easeFactor >= 1.3);
    assert.ok(!isNaN(result.easeFactor));
  });

  it('easeFactor 始终 >= 1.3', () => {
    let data = initializeReviewData();
    // 多次低质量评分应该将 easeFactor 推向最小值
    for (let i = 0; i < 20; i++) {
      data = calculateNextReview(0, data);
    }
    assert.ok(data.easeFactor >= 1.3, `easeFactor ${data.easeFactor} < 1.3`);
  });
});
