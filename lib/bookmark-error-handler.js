/**
 * BookmarkErrorHandler — 错误处理与优雅降级模块
 *
 * 提供统一的错误分类、优雅降级处理、错误边界包装和结构化日志，
 * 用于书签操作中的各类异常场景。
 *
 * 功能:
 *   - classifyError(error) — 将错误分类为 network / permission / storage / validation / unknown
 *   - handleBookmarkError(error, context) — 优雅降级处理，返回恢复建议
 *   - createErrorBoundary(fn, fallback) — 为异步函数创建错误边界
 *   - logError(error, context) — 结构化错误日志
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 * - 所有函数为纯函数（createErrorBoundary 返回纯函数）
 */

// ==================== Constants ====================

/** 错误分类常量 */
export const ERROR_CATEGORIES = Object.freeze({
  NETWORK: 'network',
  PERMISSION: 'permission',
  STORAGE: 'storage',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown',
})

/** 网络错误关键词 */
const NETWORK_KEYWORDS = Object.freeze([
  'network',
  'fetch',
  'timeout',
  'abort',
  'connection',
  'dns',
  'http',
  'request',
  'cors',
  'socket',
  'offline',
])

/** 权限错误关键词 */
const PERMISSION_KEYWORDS = Object.freeze([
  'permission',
  'denied',
  'unauthorized',
  'forbidden',
  'access',
  'blocked',
  'not allowed',
  'security',
  'sandbox',
  'csp',
])

/** 存储错误关键词 */
const STORAGE_KEYWORDS = Object.freeze([
  'storage',
  'quota',
  'quotaexceeded',
  'quota_exceeded',
  'disk',
  'persist',
  'serialize',
  'deserialize',
  'json',
  'indexeddb',
  'local storage',
  'session storage',
])

/** 验证错误关键词 */
const VALIDATION_KEYWORDS = Object.freeze([
  'invalid',
  'validation',
  'required',
  'missing',
  'range',
  'type',
  'constraint',
  'schema',
  'format',
  'malformed',
  'empty',
])

// ==================== classifyError ====================

/**
 * 将错误分类到预定义类别
 *
 * 分类逻辑:
 *   1. 检查 error.category 字段（显式标记）
 *   2. 检查 error.name 是否匹配已知类型
 *   3. 检查 error.message 中的关键词
 *   4. 默认返回 'unknown'
 *
 * @param {Error|Object|string} error — 待分类的错误
 * @returns {string} — ERROR_CATEGORIES 中的一个值
 */
export function classifyError(error) {
  if (!error) {
    return ERROR_CATEGORIES.UNKNOWN
  }

  // 显式 category 标记
  if (error.category && Object.values(ERROR_CATEGORIES).includes(error.category)) {
    return error.category
  }

  const name = (typeof error === 'object' && error !== null) ? (error.name || '') : ''
  const message = typeof error === 'string' ? error : (error.message || '')

  // TypeError / RangeError → validation
  if (name === 'TypeError' || name === 'RangeError') {
    return ERROR_CATEGORIES.VALIDATION
  }

  // SyntaxError / URIError → validation
  if (name === 'SyntaxError' || name === 'URIError') {
    return ERROR_CATEGORIES.VALIDATION
  }

  // EvalError → permission (sandbox/security related)
  if (name === 'EvalError') {
    return ERROR_CATEGORIES.PERMISSION
  }

  // NetworkError / AbortError → network
  if (name === 'NetworkError' || name === 'AbortError') {
    return ERROR_CATEGORIES.NETWORK
  }

  // QuotaExceededError → storage
  if (name === 'QuotaExceededError') {
    return ERROR_CATEGORIES.STORAGE
  }

  // NotAllowedError / SecurityError → permission
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return ERROR_CATEGORIES.PERMISSION
  }

  // 关键词匹配（不区分大小写）
  const lowerMessage = message.toLowerCase()

  for (const keyword of NETWORK_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      return ERROR_CATEGORIES.NETWORK
    }
  }
  for (const keyword of PERMISSION_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      return ERROR_CATEGORIES.PERMISSION
    }
  }
  for (const keyword of STORAGE_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      return ERROR_CATEGORIES.STORAGE
    }
  }
  for (const keyword of VALIDATION_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      return ERROR_CATEGORIES.VALIDATION
    }
  }

  return ERROR_CATEGORIES.UNKNOWN
}

// ==================== handleBookmarkError ====================

/**
 * 恢复建议映射表 — 按错误类别提供不同建议
 */
const RECOVERY_SUGGESTIONS = Object.freeze({
  [ERROR_CATEGORIES.NETWORK]: Object.freeze([
    '检查网络连接是否正常',
    '稍后重试操作',
    '确认 API 端点是否可达',
  ]),
  [ERROR_CATEGORIES.PERMISSION]: Object.freeze([
    '检查扩展权限是否完整',
    '确认 manifest.json 中的权限声明',
    '用户可能需要重新授权扩展',
  ]),
  [ERROR_CATEGORIES.STORAGE]: Object.freeze([
    '检查本地存储空间是否充足',
    '清理过期或冗余数据',
    '考虑使用压缩存储方案',
  ]),
  [ERROR_CATEGORIES.VALIDATION]: Object.freeze([
    '检查输入参数的类型和格式',
    '确认必填字段是否完整',
    '验证数据范围是否合理',
  ]),
  [ERROR_CATEGORIES.UNKNOWN]: Object.freeze([
    '检查控制台日志获取更多信息',
    '尝试重新加载扩展',
    '如问题持续，请报告 bug',
  ]),
})

/**
 * 优雅处理书签错误，返回结构化错误响应
 *
 * @param {Error|Object|string} error   — 原始错误
 * @param {Object}              [context] — 上下文信息
 * @param {string}              [context.operation] — 操作名称
 * @param {string}              [context.component] — 组件名称
 * @param {Object}              [context.metadata]  — 附加元数据
 * @returns {{ category: string, message: string, recovery: string[], timestamp: string, context: Object }}
 */
export function handleBookmarkError(error, context = {}) {
  const category = classifyError(error)
  const message = typeof error === 'string' ? error : (error?.message || '未知错误')
  const recovery = RECOVERY_SUGGESTIONS[category] || RECOVERY_SUGGESTIONS[ERROR_CATEGORIES.UNKNOWN]

  return {
    category,
    message,
    recovery,
    timestamp: new Date().toISOString(),
    context: {
      operation: context.operation || 'unknown',
      component: context.component || 'unknown',
      metadata: context.metadata || {},
    },
  }
}

// ==================== createErrorBoundary ====================

/**
 * 为异步函数创建错误边界
 *
 * 当 fn 执行成功时返回其结果，失败时调用 fallback 并返回 fallback 的结果。
 * fallback 接收 (error, ...args) 参数，允许根据上下文进行降级处理。
 *
 * @param {Function} fn       — 被包装的异步函数
 * @param {Function} fallback — 错误时的降级函数，签名 (error, ...args) => any
 * @returns {Function} — 包装后的函数
 */
export function createErrorBoundary(fn, fallback) {
  if (typeof fn !== 'function') {
    throw new TypeError('fn must be a function')
  }
  if (typeof fallback !== 'function') {
    throw new TypeError('fallback must be a function')
  }

  return async function boundaryFn(...args) {
    try {
      return await fn(...args)
    } catch (error) {
      return fallback(error, ...args)
    }
  }
}

// ==================== logError ====================

/**
 * 结构化错误日志
 *
 * 将错误信息格式化为统一的结构化对象，方便日志系统消费。
 * 不直接写入 console，而是返回结构化对象，由调用方决定如何输出。
 *
 * @param {Error|Object|string} error    — 原始错误
 * @param {Object}               [context] — 上下文信息
 * @returns {{ level: string, category: string, message: string, stack: string|null, context: Object, timestamp: string }}
 */
export function logError(error, context = {}) {
  const category = classifyError(error)
  const message = typeof error === 'string' ? error : (error?.message || '未知错误')
  const stack = (typeof error === 'object' && error !== null && error.stack) ? error.stack : null

  return {
    level: 'ERROR',
    category,
    message,
    stack,
    context: {
      operation: context.operation || 'unknown',
      component: context.component || 'unknown',
      metadata: context.metadata || {},
    },
    timestamp: new Date().toISOString(),
  }
}
