/**
 * test-depth-error-handler.js — Error Handler 深度测试
 *
 * 测试范围:
 *   classifyAIError        — 错误分类（网络/认证/超时/速率限制/服务端/模型/Token/未知）
 *   classifyContentError   — 内容提取错误（YouTube/PDF/通用）
 *   classifyStorageError   — 存储错误（配额/不可用/通用）
 *   retryWithBackoff       — 指数退避重试（速率限制重试/非速率限制抛出/耗尽抛出/回调）
 *   buildAIErrorMessageHTML — 用户友好提示（含/不含重试按钮）
 *   ErrorType / CONTENT_ERROR_MESSAGES — 常量导出完整性
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  ErrorType,
  CONTENT_ERROR_MESSAGES,
  classifyAIError,
  classifyContentError,
  classifyStorageError,
  retryWithBackoff,
  buildAIErrorMessageHTML,
} = await import('../lib/error-handler.js')

// ════════════════════════════════════════════════════════════════════════════════
// 1. 错误分类 — 网络/认证/超时/未知
// ════════════════════════════════════════════════════════════════════════════════

describe('classifyAIError — 错误分类', () => {

  it('1. AbortError → timeout 类型，retryable=true', () => {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    const r = classifyAIError(err)
    assert.equal(r.type, ErrorType.TIMEOUT)
    assert.equal(r.retryable, true)
    assert.equal(r.message, '请求超时，请重试')
    assert.equal(r.originalMessage, 'The operation was aborted')
  })

  it('2. TypeError → network 类型，retryable=true', () => {
    const err = new TypeError('Failed to fetch')
    const r = classifyAIError(err)
    assert.equal(r.type, ErrorType.NETWORK)
    assert.equal(r.retryable, true)
    assert.equal(r.message, '网络连接失败，请检查网络')
  })

  it('3. 消息含 "API 401" → auth 类型，retryable=false', () => {
    const err = new Error('API 401 Unauthorized: Invalid API key provided')
    const r = classifyAIError(err)
    assert.equal(r.type, ErrorType.AUTH)
    assert.equal(r.retryable, false)
    assert.equal(r.message, 'API Key 无效，请检查设置')
  })

  it('4. 消息含 "API 429" → rate_limit 类型，retryable=true', () => {
    const err = new Error('API 429 Too Many Requests')
    const r = classifyAIError(err)
    assert.equal(r.type, ErrorType.RATE_LIMIT)
    assert.equal(r.retryable, true)
    assert.equal(r.message, '请求频繁，请稍后重试')
  })

  it('5. 消息含 "API 503" → server_error 类型，retryable=true', () => {
    const err = new Error('API 503 Service Unavailable')
    const r = classifyAIError(err)
    assert.equal(r.type, ErrorType.SERVER_ERROR)
    assert.equal(r.retryable, true)
    assert.equal(r.message, '服务器错误，请稍后重试')
  })

  it('6. 消息含 "model does not exist" → model_not_found 类型', () => {
    const err = new Error('The model does not exist: gpt-99')
    const r = classifyAIError(err)
    assert.equal(r.type, ErrorType.MODEL_NOT_FOUND)
    assert.equal(r.retryable, false)
    assert.equal(r.message, '模型名称错误，请检查设置')
  })

  it('7. 无任何匹配 → unknown 类型，retryable=false', () => {
    const err = new Error('Something completely unexpected happened')
    const r = classifyAIError(err)
    assert.equal(r.type, ErrorType.UNKNOWN)
    assert.equal(r.retryable, false)
    assert.equal(r.message, '请求失败，请稍后重试')
  })

  it('8. originalMessage 完整保留原始错误信息', () => {
    const longMsg = 'API 413 Payload Too Large: The request body exceeded 10MB limit'
    const err = new Error(longMsg)
    const r = classifyAIError(err)
    assert.equal(r.originalMessage, longMsg)
  })

  it('9. null/undefined 输入安全处理', () => {
    const r1 = classifyAIError(null)
    assert.equal(r1.type, ErrorType.UNKNOWN)
    assert.equal(r1.originalMessage, '')

    const r2 = classifyAIError(undefined)
    assert.equal(r2.type, ErrorType.UNKNOWN)
    assert.equal(r2.originalMessage, '')

    const r3 = classifyAIError({})
    assert.equal(r3.type, ErrorType.UNKNOWN)
    assert.equal(r3.originalMessage, '')
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// 2. 错误日志记录 — classifyAIError 返回结构完整性
// ════════════════════════════════════════════════════════════════════════════════

describe('classifyAIError — 返回结构完整性', () => {

  it('10. 返回对象包含 type/message/retryable/originalMessage 四字段', () => {
    const err = new TypeError('NetworkError: fetch failed')
    const r = classifyAIError(err)
    const keys = Object.keys(r).sort()
    assert.deepEqual(keys, ['message', 'originalMessage', 'retryable', 'type'])
    assert.equal(typeof r.type, 'string')
    assert.equal(typeof r.message, 'string')
    assert.equal(typeof r.retryable, 'boolean')
    assert.equal(typeof r.originalMessage, 'string')
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// 3. 重试逻辑 — retryWithBackoff
// ════════════════════════════════════════════════════════════════════════════════

describe('retryWithBackoff — 重试逻辑', () => {

  it('11. rate_limit 错误自动重试直到成功', async () => {
    let attempts = 0
    const fn = async () => {
      attempts++
      if (attempts < 3) {
        const err = new Error('API 429 Too Many Requests')
        throw err
      }
      return 'success'
    }

    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelay: 10,   // 加速测试
      onRetry: () => {},
    })
    assert.equal(result, 'success')
    assert.equal(attempts, 3)
  })

  it('12. 非 rate_limit 错误不重试，直接抛出', async () => {
    let attempts = 0
    const fn = async () => {
      attempts++
      throw new Error('API 401 Unauthorized')
    }

    await assert.rejects(
      () => retryWithBackoff(fn, { maxRetries: 3, baseDelay: 10 }),
      { message: 'API 401 Unauthorized' }
    )
    assert.equal(attempts, 1, '非 rate_limit 错误应只尝试 1 次')
  })

  it('13. 超过 maxRetries 后抛出最后一个错误', async () => {
    let attempts = 0
    const fn = async () => {
      attempts++
      throw new Error('API 429 Too Many Requests')
    }

    await assert.rejects(
      () => retryWithBackoff(fn, { maxRetries: 2, baseDelay: 10 }),
      { message: 'API 429 Too Many Requests' }
    )
    // 1 初始 + 2 重试 = 3 次
    assert.equal(attempts, 3)
  })

  it('14. onRetry 回调在每次重试时被调用，参数正确', async () => {
    let attempts = 0
    const retryCalls = []
    const fn = async () => {
      attempts++
      if (attempts <= 2) throw new Error('API 429 rate limit exceeded')
      return 'ok'
    }

    await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelay: 10,
      onRetry: (attempt, delay, classified) => {
        retryCalls.push({ attempt, delay, type: classified.type })
      },
    })

    assert.equal(retryCalls.length, 2)
    assert.equal(retryCalls[0].attempt, 1)
    assert.equal(retryCalls[0].delay, 10)       // baseDelay * 2^0
    assert.equal(retryCalls[0].type, ErrorType.RATE_LIMIT)
    assert.equal(retryCalls[1].attempt, 2)
    assert.equal(retryCalls[1].delay, 20)       // baseDelay * 2^1
    assert.equal(retryCalls[1].type, ErrorType.RATE_LIMIT)
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// 4. 错误恢复策略 — classifyContentError / classifyStorageError
// ════════════════════════════════════════════════════════════════════════════════

describe('classifyContentError — 内容提取错误', () => {

  it('15. YouTube 页面 → 无字幕提示，fallback=false', () => {
    const r = classifyContentError(new Error('No captions found'), 'youtube')
    assert.equal(r.message, CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS)
    assert.equal(r.fallback, false)
    assert.equal(r.fallbackLabel, undefined)
  })

  it('16. PDF 页面 → PDF 读取错误，fallback=true + 手动输入', () => {
    const r = classifyContentError(new Error('pdf parse error'), 'pdf')
    assert.equal(r.message, CONTENT_ERROR_MESSAGES.PDF_READ_ERROR)
    assert.equal(r.fallback, true)
    assert.equal(r.fallbackLabel, '手动输入内容')
  })

  it('17. 通用页面 → 无法提取提示，fallback=true', () => {
    const r = classifyContentError(new Error('some error'), 'general')
    assert.equal(r.message, CONTENT_ERROR_MESSAGES.NO_CONTENT)
    assert.equal(r.fallback, true)
    assert.equal(r.fallbackLabel, '手动输入内容')
  })
})

describe('classifyStorageError — 存储错误', () => {

  it('18. 存储空间不足 (quota) → fatal=false', () => {
    const r = classifyStorageError(new Error('QuotaExceededError: storage quota exceeded'))
    assert.equal(r.message, CONTENT_ERROR_MESSAGES.STORAGE_QUOTA)
    assert.equal(r.fatal, false)
  })

  it('19. IndexedDB 不可用 → fatal=true', () => {
    const r = classifyStorageError(new Error('IndexedDB not allowed'))
    assert.equal(r.message, CONTENT_ERROR_MESSAGES.STORAGE_UNAVAILABLE)
    assert.equal(r.fatal, true)
  })

  it('20. 通用存储错误 → fatal=false + 默认消息', () => {
    const r = classifyStorageError(new Error('unknown storage issue'))
    assert.equal(r.message, '存储操作失败')
    assert.equal(r.fatal, false)
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// 5. 用户友好提示 — buildAIErrorMessageHTML
// ════════════════════════════════════════════════════════════════════════════════

describe('buildAIErrorMessageHTML — 用户友好提示', () => {

  it('21. 网络/超时错误 + retryFn → 包含重试按钮', () => {
    const classified = { type: ErrorType.NETWORK, message: '网络连接失败，请检查网络' }
    const html = buildAIErrorMessageHTML(classified, () => {})
    assert.ok(html.includes('⚠️'))
    assert.ok(html.includes('网络连接失败，请检查网络'))
    assert.ok(html.includes('btn-retry-ai'))
    assert.ok(html.includes('重试'))
  })

  it('22. 认证错误 + retryFn → 不含重试按钮', () => {
    const classified = { type: ErrorType.AUTH, message: 'API Key 无效，请检查设置' }
    const html = buildAIErrorMessageHTML(classified, () => {})
    assert.ok(html.includes('API Key 无效，请检查设置'))
    assert.ok(!html.includes('btn-retry-ai'))
  })

  it('23. 网络错误无 retryFn → 不含重试按钮', () => {
    const classified = { type: ErrorType.NETWORK, message: '网络连接失败，请检查网络' }
    const html = buildAIErrorMessageHTML(classified)
    assert.ok(!html.includes('btn-retry-ai'))
  })

  it('24. HTML 转义: 消息中的 <script> 被安全转义', () => {
    const classified = { type: ErrorType.UNKNOWN, message: '<script>alert("xss")</script>' }
    const html = buildAIErrorMessageHTML(classified)
    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('&lt;script&gt;'))
  })
})
