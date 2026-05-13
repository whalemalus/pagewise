/**
 * Tests for BookmarkErrorHandler — 错误处理与优雅降级模块
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyError,
  handleBookmarkError,
  createErrorBoundary,
  logError,
  ERROR_CATEGORIES,
} from '../lib/bookmark-error-handler.js'

// ==================== ERROR_CATEGORIES 常量 ====================

describe('ERROR_CATEGORIES', () => {
  it('应包含所有 5 个错误类别', () => {
    assert.equal(Object.keys(ERROR_CATEGORIES).length, 5)
    assert.equal(ERROR_CATEGORIES.NETWORK, 'network')
    assert.equal(ERROR_CATEGORIES.PERMISSION, 'permission')
    assert.equal(ERROR_CATEGORIES.STORAGE, 'storage')
    assert.equal(ERROR_CATEGORIES.VALIDATION, 'validation')
    assert.equal(ERROR_CATEGORIES.UNKNOWN, 'unknown')
  })

  it('应为冻结对象', () => {
    assert.ok(Object.isFrozen(ERROR_CATEGORIES))
  })
})

// ==================== classifyError ====================

describe('classifyError', () => {
  // ---- 显式 category 标记 ----

  it('应识别显式 category 字段', () => {
    const error = { category: 'network', message: 'something' }
    assert.equal(classifyError(error), 'network')
  })

  it('应忽略无效的显式 category', () => {
    const error = { category: 'invalid_cat', message: 'something' }
    // 无效 category 会 fallthrough 到关键词匹配
    assert.equal(typeof classifyError(error), 'string')
  })

  // ---- TypeError / RangeError → validation ----

  it('应将 TypeError 分类为 validation', () => {
    const error = new TypeError('Cannot read property of undefined')
    assert.equal(classifyError(error), ERROR_CATEGORIES.VALIDATION)
  })

  it('应将 RangeError 分类为 validation', () => {
    const error = new RangeError('Value out of range')
    assert.equal(classifyError(error), ERROR_CATEGORIES.VALIDATION)
  })

  it('应将 SyntaxError 分类为 validation', () => {
    const error = new SyntaxError('Unexpected token')
    assert.equal(classifyError(error), ERROR_CATEGORIES.VALIDATION)
  })

  it('应将 URIError 分类为 validation', () => {
    const error = new URIError('Invalid URI')
    assert.equal(classifyError(error), ERROR_CATEGORIES.VALIDATION)
  })

  // ---- NetworkError / AbortError → network ----

  it('应将 NetworkError 分类为 network', () => {
    const error = new Error('NetworkError: failed to fetch')
    error.name = 'NetworkError'
    assert.equal(classifyError(error), ERROR_CATEGORIES.NETWORK)
  })

  it('应将 AbortError 分类为 network', () => {
    const error = new Error('The operation was aborted')
    error.name = 'AbortError'
    assert.equal(classifyError(error), ERROR_CATEGORIES.NETWORK)
  })

  // ---- QuotaExceededError → storage ----

  it('应将 QuotaExceededError 分类为 storage', () => {
    const error = new Error('Quota exceeded')
    error.name = 'QuotaExceededError'
    assert.equal(classifyError(error), ERROR_CATEGORIES.STORAGE)
  })

  // ---- NotAllowedError / SecurityError → permission ----

  it('应将 NotAllowedError 分类为 permission', () => {
    const error = new Error('Not allowed')
    error.name = 'NotAllowedError'
    assert.equal(classifyError(error), ERROR_CATEGORIES.PERMISSION)
  })

  it('应将 SecurityError 分类为 permission', () => {
    const error = new Error('Security violation')
    error.name = 'SecurityError'
    assert.equal(classifyError(error), ERROR_CATEGORIES.PERMISSION)
  })

  it('应将 EvalError 分类为 permission', () => {
    const error = new EvalError('eval not allowed')
    assert.equal(classifyError(error), ERROR_CATEGORIES.PERMISSION)
  })

  // ---- 关键词匹配 ----

  it('应通过 message 中的 "fetch" 关键词分类为 network', () => {
    const error = new Error('fetch request failed')
    assert.equal(classifyError(error), ERROR_CATEGORIES.NETWORK)
  })

  it('应通过 message 中的 "timeout" 关键词分类为 network', () => {
    const error = new Error('Request timeout exceeded')
    assert.equal(classifyError(error), ERROR_CATEGORIES.NETWORK)
  })

  it('应通过 message 中的 "permission denied" 分类为 permission', () => {
    const error = new Error('Permission denied for bookmarks')
    assert.equal(classifyError(error), ERROR_CATEGORIES.PERMISSION)
  })

  it('应通过 message 中的 "quota" 关键词分类为 storage', () => {
    const error = new Error('storage quota exceeded')
    assert.equal(classifyError(error), ERROR_CATEGORIES.STORAGE)
  })

  it('应通过 message 中的 "invalid" 关键词分类为 validation', () => {
    const error = new Error('invalid bookmark id')
    assert.equal(classifyError(error), ERROR_CATEGORIES.VALIDATION)
  })

  // ---- null / undefined / 字符串 ----

  it('null 应返回 unknown', () => {
    assert.equal(classifyError(null), ERROR_CATEGORIES.UNKNOWN)
  })

  it('undefined 应返回 unknown', () => {
    assert.equal(classifyError(undefined), ERROR_CATEGORIES.UNKNOWN)
  })

  it('字符串错误应能被关键词匹配', () => {
    assert.equal(classifyError('network error'), ERROR_CATEGORIES.NETWORK)
  })

  it('无意义字符串应返回 unknown', () => {
    assert.equal(classifyError('abc123'), ERROR_CATEGORIES.UNKNOWN)
  })

  it('无 message 的空对象应返回 unknown', () => {
    assert.equal(classifyError({}), ERROR_CATEGORIES.UNKNOWN)
  })
})

// ==================== handleBookmarkError ====================

describe('handleBookmarkError', () => {
  it('应返回包含 category 的结构化响应', () => {
    const result = handleBookmarkError(new TypeError('bad input'))
    assert.equal(result.category, 'validation')
  })

  it('应包含原始错误消息', () => {
    const result = handleBookmarkError(new Error('something broke'))
    assert.equal(result.message, 'something broke')
  })

  it('应为每个类别返回恢复建议数组', () => {
    const categories = ['network', 'permission', 'storage', 'validation', 'unknown']
    for (const cat of categories) {
      const error = { category: cat, message: 'test' }
      const result = handleBookmarkError(error)
      assert.ok(Array.isArray(result.recovery), `recovery for ${cat} should be array`)
      assert.ok(result.recovery.length > 0, `recovery for ${cat} should have items`)
    }
  })

  it('应包含 ISO 时间戳', () => {
    const result = handleBookmarkError(new Error('test'))
    assert.ok(result.timestamp)
    assert.ok(!isNaN(new Date(result.timestamp).getTime()))
  })

  it('应包含 context 信息', () => {
    const context = { operation: 'search', component: 'indexer', metadata: { query: 'react' } }
    const result = handleBookmarkError(new Error('fail'), context)
    assert.equal(result.context.operation, 'search')
    assert.equal(result.context.component, 'indexer')
    assert.deepEqual(result.context.metadata, { query: 'react' })
  })

  it('应为 context 提供默认值', () => {
    const result = handleBookmarkError(new Error('fail'))
    assert.equal(result.context.operation, 'unknown')
    assert.equal(result.context.component, 'unknown')
    assert.deepEqual(result.context.metadata, {})
  })

  it('应正确处理字符串错误', () => {
    const result = handleBookmarkError('permission denied')
    assert.equal(result.category, 'permission')
    assert.equal(result.message, 'permission denied')
  })

  it('应正确处理 null 错误', () => {
    const result = handleBookmarkError(null)
    assert.equal(result.category, 'unknown')
    assert.equal(result.message, '未知错误')
  })
})

// ==================== createErrorBoundary ====================

describe('createErrorBoundary', () => {
  it('应返回一个函数', () => {
    const boundary = createErrorBoundary(async () => {}, () => {})
    assert.equal(typeof boundary, 'function')
  })

  it('fn 不是函数时应抛出 TypeError', () => {
    assert.throws(
      () => createErrorBoundary('not a function', () => {}),
      { name: 'TypeError' }
    )
  })

  it('fallback 不是函数时应抛出 TypeError', () => {
    assert.throws(
      () => createErrorBoundary(async () => {}, 'not a function'),
      { name: 'TypeError' }
    )
  })

  it('成功路径应返回 fn 的结果', async () => {
    const fn = async (x) => x * 2
    const fallback = () => -1
    const boundary = createErrorBoundary(fn, fallback)
    const result = await boundary(21)
    assert.equal(result, 42)
  })

  it('错误路径应调用 fallback', async () => {
    const error = new Error('boom')
    const fn = async () => { throw error }
    const fallback = (err) => `recovered: ${err.message}`
    const boundary = createErrorBoundary(fn, fallback)
    const result = await boundary()
    assert.equal(result, 'recovered: boom')
  })

  it('fallback 应接收原始错误和参数', async () => {
    const error = new Error('fail')
    const fn = async () => { throw error }
    let receivedArgs = null
    const fallback = (err, ...args) => {
      receivedArgs = { err, args }
      return 'ok'
    }
    const boundary = createErrorBoundary(fn, fallback)
    await boundary('a', 'b')
    assert.equal(receivedArgs.err, error)
    assert.deepEqual(receivedArgs.args, ['a', 'b'])
  })

  it('应正确传递多个参数给 fn', async () => {
    const fn = async (a, b, c) => a + b + c
    const fallback = () => 0
    const boundary = createErrorBoundary(fn, fallback)
    const result = await boundary(10, 20, 30)
    assert.equal(result, 60)
  })
})

// ==================== logError ====================

describe('logError', () => {
  it('应返回包含 level 字段的结构化日志', () => {
    const result = logError(new Error('test'))
    assert.equal(result.level, 'ERROR')
  })

  it('应包含错误类别', () => {
    const result = logError(new TypeError('bad'))
    assert.equal(result.category, 'validation')
  })

  it('应包含错误消息', () => {
    const result = logError(new Error('something wrong'))
    assert.equal(result.message, 'something wrong')
  })

  it('应包含 stack 信息', () => {
    const error = new Error('stacked')
    const result = logError(error)
    assert.ok(result.stack)
    assert.ok(result.stack.includes('stacked'))
  })

  it('字符串错误应没有 stack', () => {
    const result = logError('string error')
    assert.equal(result.stack, null)
  })

  it('应包含 context 信息', () => {
    const context = { operation: 'delete', component: 'core' }
    const result = logError(new Error('fail'), context)
    assert.equal(result.context.operation, 'delete')
    assert.equal(result.context.component, 'core')
  })

  it('应为 context 提供默认值', () => {
    const result = logError(new Error('fail'))
    assert.equal(result.context.operation, 'unknown')
    assert.equal(result.context.component, 'unknown')
    assert.deepEqual(result.context.metadata, {})
  })

  it('应包含 ISO 时间戳', () => {
    const result = logError(new Error('test'))
    assert.ok(result.timestamp)
    assert.ok(!isNaN(new Date(result.timestamp).getTime()))
  })

  it('应正确处理 null 错误', () => {
    const result = logError(null)
    assert.equal(result.level, 'ERROR')
    assert.equal(result.category, 'unknown')
    assert.equal(result.message, '未知错误')
    assert.equal(result.stack, null)
  })
})
