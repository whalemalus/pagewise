/**
 * 测试 lib/error-handler.js — 错误分类与重试机制
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAIError,
  classifyContentError,
  classifyStorageError,
  isIndexedDBAvailable,
  retryWithBackoff,
  ErrorType,
  CONTENT_ERROR_MESSAGES
} from '../lib/error-handler.js';

// ==================== AI 错误分类 ====================

describe('classifyAIError - 网络错误', () => {
  it('TypeError 被识别为网络错误', () => {
    const result = classifyAIError(new TypeError('Failed to fetch'));
    assert.equal(result.type, ErrorType.NETWORK);
    assert.equal(result.message, '网络连接失败，请检查网络');
    assert.equal(result.retryable, true);
  });

  it('"网络错误" 关键字触发网络分类', () => {
    const result = classifyAIError(new Error('网络错误: fetch failed'));
    assert.equal(result.type, ErrorType.NETWORK);
    assert.equal(result.retryable, true);
  });

  it('"failed to fetch" 触发网络分类', () => {
    const result = classifyAIError(new Error('Failed to fetch'));
    assert.equal(result.type, ErrorType.NETWORK);
  });
});

describe('classifyAIError - 认证错误', () => {
  it('API 401 被识别为认证错误', () => {
    const result = classifyAIError(new Error('API 401: Unauthorized'));
    assert.equal(result.type, ErrorType.AUTH);
    assert.equal(result.message, 'API Key 无效，请检查设置');
    assert.equal(result.retryable, false);
  });

  it('API 403 被识别为认证错误', () => {
    const result = classifyAIError(new Error('API 403: Forbidden'));
    assert.equal(result.type, ErrorType.AUTH);
  });
});

describe('classifyAIError - 模型错误', () => {
  it('API 404 被识别为模型不存在', () => {
    const result = classifyAIError(new Error('API 404: Model not found'));
    assert.equal(result.type, ErrorType.MODEL_NOT_FOUND);
    assert.equal(result.message, '模型名称错误，请检查设置');
    assert.equal(result.retryable, false);
  });
});

describe('classifyAIError - Token 超限', () => {
  it('API 413 被识别为 token 超限', () => {
    const result = classifyAIError(new Error('API 413: Too large'));
    assert.equal(result.type, ErrorType.TOKEN_LIMIT);
    assert.equal(result.message, '输入内容过长，请缩短');
  });

  it('"token limit" 关键字触发 token 分类', () => {
    const result = classifyAIError(new Error('Token limit exceeded'));
    assert.equal(result.type, ErrorType.TOKEN_LIMIT);
    assert.equal(result.retryable, false);
  });
});

describe('classifyAIError - 速率限制', () => {
  it('API 429 被识别为速率限制', () => {
    const result = classifyAIError(new Error('API 429: Too Many Requests'));
    assert.equal(result.type, ErrorType.RATE_LIMIT);
    assert.equal(result.message, '请求频繁，请稍后重试');
    assert.equal(result.retryable, true);
  });

  it('"rate" 关键字触发速率限制分类', () => {
    const result = classifyAIError(new Error('Rate limit exceeded'));
    assert.equal(result.type, ErrorType.RATE_LIMIT);
  });
});

describe('classifyAIError - 超时', () => {
  it('AbortError 被识别为超时', () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    const result = classifyAIError(error);
    assert.equal(result.type, ErrorType.TIMEOUT);
    assert.equal(result.message, '请求超时，请重试');
    assert.equal(result.retryable, true);
  });

  it('"timeout" 关键字触发超时分类', () => {
    const result = classifyAIError(new Error('Request timeout'));
    assert.equal(result.type, ErrorType.TIMEOUT);
  });
});

describe('classifyAIError - 未知错误', () => {
  it('无法识别的错误返回 unknown', () => {
    const result = classifyAIError(new Error('Something weird happened'));
    assert.equal(result.type, ErrorType.UNKNOWN);
    assert.equal(result.retryable, false);
  });

  it('null/undefined 错误不崩溃', () => {
    const result = classifyAIError(null);
    assert.equal(result.type, ErrorType.UNKNOWN);
  });
});

describe('classifyAIError - 服务器错误', () => {
  it('500 被识别为 SERVER_ERROR 且可重试', () => {
    const result = classifyAIError(new Error('API 500: Internal Server Error'));
    assert.equal(result.type, ErrorType.SERVER_ERROR);
    assert.equal(result.message, '服务器错误，请稍后重试');
    assert.equal(result.retryable, true);
  });

  it('502 被识别为 SERVER_ERROR', () => {
    const result = classifyAIError(new Error('API 502: Bad Gateway'));
    assert.equal(result.type, ErrorType.SERVER_ERROR);
    assert.equal(result.retryable, true);
  });

  it('503 被识别为 SERVER_ERROR', () => {
    const result = classifyAIError(new Error('API 503: Service Unavailable'));
    assert.equal(result.type, ErrorType.SERVER_ERROR);
    assert.equal(result.retryable, true);
  });
});

// ==================== 内容提取错误分类 ====================

describe('classifyContentError', () => {
  it('YouTube 页面返回无字幕提示', () => {
    const result = classifyContentError(new Error('no captions'), 'youtube');
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS);
    assert.equal(result.fallback, false);
  });

  it('"字幕" 关键字触发 YouTube 分类', () => {
    const result = classifyContentError(new Error('无法获取字幕'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS);
  });

  it('PDF 页面返回无法读取提示', () => {
    const result = classifyContentError(new Error('read error'), 'pdf');
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.PDF_READ_ERROR);
    assert.equal(result.fallback, true);
    assert.equal(result.fallbackLabel, '手动输入内容');
  });

  it('"pdf" 关键字触发 PDF 分类', () => {
    const result = classifyContentError(new Error('PDF parsing failed'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.PDF_READ_ERROR);
  });

  it('通用页面返回无法提取提示', () => {
    const result = classifyContentError(new Error('empty content'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.NO_CONTENT);
    assert.equal(result.fallback, true);
    assert.equal(result.fallbackLabel, '手动输入内容');
  });
});

// ==================== 存储错误分类 ====================

describe('classifyStorageError', () => {
  it('quota 错误返回存储空间不足', () => {
    const result = classifyStorageError(new Error('QuotaExceededError'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_QUOTA);
    assert.equal(result.fatal, false);
  });

  it('indexeddb 错误返回存储不可用', () => {
    const result = classifyStorageError(new Error('IndexedDB not available'));
    assert.equal(result.message, CONTENT_ERROR_MESSAGES.STORAGE_UNAVAILABLE);
    assert.equal(result.fatal, true);
  });

  it('通用存储错误', () => {
    const result = classifyStorageError(new Error('something'));
    assert.equal(result.message, '存储操作失败');
    assert.equal(result.fatal, false);
  });
});

// ==================== IndexedDB 可用性检查 ====================

describe('isIndexedDBAvailable', () => {
  it('在 Node.js 环境中应返回 false（无 indexedDB）', () => {
    // Node.js 环境没有 indexedDB
    const result = isIndexedDBAvailable();
    assert.equal(result, false);
  });
});

// ==================== 重试机制 ====================

describe('retryWithBackoff', () => {
  it('成功时不重试', async () => {
    let callCount = 0;
    const fn = async () => { callCount++; return 'ok'; };
    const result = await retryWithBackoff(fn, { maxRetries: 3 });
    assert.equal(result, 'ok');
    assert.equal(callCount, 1);
  });

  it('非速率限制错误不重试', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new Error('API 401: Unauthorized');
    };
    await assert.rejects(
      () => retryWithBackoff(fn, { maxRetries: 3, baseDelay: 10 }),
      { message: /401/ }
    );
    assert.equal(callCount, 1);
  });

  it('速率限制错误自动重试', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error('API 429: Too Many Requests');
      }
      return 'success';
    };
    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 10 });
    assert.equal(result, 'success');
    assert.equal(callCount, 3);
  });

  it('超过最大重试次数后抛出错误', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new Error('API 429: Too Many Requests');
    };
    await assert.rejects(
      () => retryWithBackoff(fn, { maxRetries: 2, baseDelay: 10 }),
      { message: /429/ }
    );
    assert.equal(callCount, 3); // 初始调用 + 2 次重试
  });

  it('onRetry 回调被调用', async () => {
    let retryCalls = 0;
    const fn = async () => {
      if (retryCalls < 2) throw new Error('API 429: Rate limit');
      return 'ok';
    };
    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelay: 10,
      onRetry: () => retryCalls++
    });
    assert.equal(result, 'ok');
    assert.equal(retryCalls, 2);
  });
});
