/**
 * Error Handler - 全局错误处理、分类与重试机制
 *
 * 提供：
 * - AI 错误分类与友好提示
 * - 指数退避重试（速率限制）
 * - 内容提取错误处理
 * - 存储错误处理
 */

// ==================== 错误类型枚举 ====================

export const ErrorType = {
  NETWORK: 'network',
  AUTH: 'auth',
  MODEL_NOT_FOUND: 'model_not_found',
  TOKEN_LIMIT: 'token_limit',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown'
};

// ==================== 友好错误消息 ====================

const ERROR_MESSAGES = {
  [ErrorType.NETWORK]: '网络连接失败，请检查网络',
  [ErrorType.AUTH]: 'API Key 无效，请检查设置',
  [ErrorType.MODEL_NOT_FOUND]: '模型名称错误，请检查设置',
  [ErrorType.TOKEN_LIMIT]: '输入内容过长，请缩短',
  [ErrorType.RATE_LIMIT]: '请求频繁，请稍后重试',
  [ErrorType.SERVER_ERROR]: '服务器错误，请稍后重试',
  [ErrorType.TIMEOUT]: '请求超时，请重试',
  [ErrorType.UNKNOWN]: '请求失败，请稍后重试'
};

// 内容提取错误消息
export const CONTENT_ERROR_MESSAGES = {
  NO_CONTENT: '无法提取页面内容',
  NO_YOUTUBE_CAPTIONS: '该视频没有字幕',
  PDF_READ_ERROR: '无法读取 PDF 内容',
  STORAGE_UNAVAILABLE: '存储不可用，请检查浏览器设置',
  STORAGE_QUOTA: '存储空间不足'
};

// ==================== AI 错误分类 ====================

/**
 * 分类 AI API 错误
 * @param {Error} error - 原始错误
 * @returns {{ type: string, message: string, retryable: boolean, originalMessage: string }}
 */
export function classifyAIError(error) {
  const msg = (error?.message || '').toLowerCase();
  const originalMessage = error?.message || '';

  // 超时
  if (error?.name === 'AbortError' || msg.includes('timeout') || msg.includes('超时')) {
    return {
      type: ErrorType.TIMEOUT,
      message: ERROR_MESSAGES[ErrorType.TIMEOUT],
      retryable: true,
      originalMessage
    };
  }

  // 网络错误
  if (
    error instanceof TypeError ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch') ||
    msg.includes('err_connection') ||
    msg.includes('err_name_not_resolved') ||
    msg.includes('network') ||
    msg.includes('网络')
  ) {
    return {
      type: ErrorType.NETWORK,
      message: ERROR_MESSAGES[ErrorType.NETWORK],
      retryable: true,
      originalMessage
    };
  }

  // API 状态码检测
  const statusMatch = originalMessage.match(/API\s*(\d{3})/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    return classifyByStatusCode(status, originalMessage);
  }

  // 关键字检测（用于非标准错误格式）
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid') && msg.includes('key')) {
    return {
      type: ErrorType.AUTH,
      message: ERROR_MESSAGES[ErrorType.AUTH],
      retryable: false,
      originalMessage
    };
  }

  if (msg.includes('model') && (msg.includes('not found') || msg.includes('does not exist') || msg.includes('invalid'))) {
    return {
      type: ErrorType.MODEL_NOT_FOUND,
      message: ERROR_MESSAGES[ErrorType.MODEL_NOT_FOUND],
      retryable: false,
      originalMessage
    };
  }

  if (msg.includes('token') && (msg.includes('limit') || msg.includes('exceed') || msg.includes('too long') || msg.includes('maximum'))) {
    return {
      type: ErrorType.TOKEN_LIMIT,
      message: ERROR_MESSAGES[ErrorType.TOKEN_LIMIT],
      retryable: false,
      originalMessage
    };
  }

  if (msg.includes('rate') || msg.includes('429') || msg.includes('too many requests') || msg.includes('throttl')) {
    return {
      type: ErrorType.RATE_LIMIT,
      message: ERROR_MESSAGES[ErrorType.RATE_LIMIT],
      retryable: true,
      originalMessage
    };
  }

  return {
    type: ErrorType.UNKNOWN,
    message: ERROR_MESSAGES[ErrorType.UNKNOWN],
    retryable: false,
    originalMessage
  };
}

/**
 * 根据 HTTP 状态码分类
 * @param {number} status
 * @param {string} originalMessage
 */
function classifyByStatusCode(status, originalMessage) {
  if (status === 401 || status === 403) {
    return {
      type: ErrorType.AUTH,
      message: ERROR_MESSAGES[ErrorType.AUTH],
      retryable: false,
      originalMessage
    };
  }
  if (status === 404) {
    return {
      type: ErrorType.MODEL_NOT_FOUND,
      message: ERROR_MESSAGES[ErrorType.MODEL_NOT_FOUND],
      retryable: false,
      originalMessage
    };
  }
  if (status === 429) {
    return {
      type: ErrorType.RATE_LIMIT,
      message: ERROR_MESSAGES[ErrorType.RATE_LIMIT],
      retryable: true,
      originalMessage
    };
  }
  if (status === 413) {
    return {
      type: ErrorType.TOKEN_LIMIT,
      message: ERROR_MESSAGES[ErrorType.TOKEN_LIMIT],
      retryable: false,
      originalMessage
    };
  }
  if (status >= 500) {
    return {
      type: ErrorType.SERVER_ERROR,
      message: ERROR_MESSAGES[ErrorType.SERVER_ERROR],
      retryable: true,
      originalMessage
    };
  }
  return {
    type: ErrorType.UNKNOWN,
    message: ERROR_MESSAGES[ErrorType.UNKNOWN],
    retryable: false,
    originalMessage
  };
}

// ==================== 重试机制 ====================

/**
 * 带指数退避的重试函数（仅用于速率限制）
 * @param {Function} fn - 要重试的异步函数
 * @param {Object} options
 * @param {number} options.maxRetries - 最大重试次数（默认 3）
 * @param {number} options.baseDelay - 基础延迟 ms（默认 1000）
 * @param {Function} options.onRetry - 重试时回调 (attempt, delay, error)
 * @returns {Promise<*>}
 */
export async function retryWithBackoff(fn, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, onRetry } = options;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const classified = classifyAIError(error);

      // 只对速率限制进行自动重试
      if (classified.type === ErrorType.RATE_LIMIT && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt); // 指数退避
        if (onRetry) {
          onRetry(attempt + 1, delay, classified);
        }
        await sleep(delay);
        continue;
      }

      // 其他错误直接抛出
      throw error;
    }
  }
  throw lastError;
}

/**
 * 延迟
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 内容提取错误 ====================

/**
 * 分类内容提取错误
 * @param {Error} error
 * @param {string} pageType - 'youtube' | 'pdf' | 'general'
 * @returns {{ message: string, fallback: boolean, fallbackLabel?: string }}
 */
export function classifyContentError(error, pageType = 'general') {
  const msg = (error?.message || '').toLowerCase();

  if (pageType === 'youtube' || msg.includes('caption') || msg.includes('subtitle') || msg.includes('字幕')) {
    return {
      message: CONTENT_ERROR_MESSAGES.NO_YOUTUBE_CAPTIONS,
      fallback: false
    };
  }

  if (pageType === 'pdf' || msg.includes('pdf')) {
    return {
      message: CONTENT_ERROR_MESSAGES.PDF_READ_ERROR,
      fallback: true,
      fallbackLabel: '手动输入内容'
    };
  }

  // 通用页面提取失败
  return {
    message: CONTENT_ERROR_MESSAGES.NO_CONTENT,
    fallback: true,
    fallbackLabel: '手动输入内容'
  };
}

// ==================== 存储错误 ====================

/**
 * 检测 IndexedDB 是否可用
 * @returns {boolean}
 */
export function isIndexedDBAvailable() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * 分类存储错误
 * @param {Error} error
 * @returns {{ message: string, fatal: boolean }}
 */
export function classifyStorageError(error) {
  const msg = (error?.message || '').toLowerCase();

  // 存储空间不足
  if (
    msg.includes('quota') ||
    msg.includes('exceeded') ||
    msg.includes('storage') && msg.includes('full') ||
    msg.includes('空间不足')
  ) {
    return {
      message: CONTENT_ERROR_MESSAGES.STORAGE_QUOTA,
      fatal: false
    };
  }

  // IndexedDB 不可用
  if (
    msg.includes('indexeddb') ||
    msg.includes('not allowed') ||
    msg.includes('blocked') ||
    msg.includes('不可用')
  ) {
    return {
      message: CONTENT_ERROR_MESSAGES.STORAGE_UNAVAILABLE,
      fatal: true
    };
  }

  return {
    message: '存储操作失败',
    fatal: false
  };
}

// ==================== 全局错误捕获安装 ====================

/**
 * 安装全局错误捕获（window.onerror + unhandledrejection）
 * 在 sidebar 中调用，捕获未处理的错误并显示友好提示
 *
 * @param {Function} showToast - 显示 toast 的回调 (message, type)
 */
export function installGlobalErrorHandler(showToast) {
  if (typeof window === 'undefined') return;

  // 同步错误
  window.onerror = function (message, source, lineno, colno, error) {
    console.error('[PageWise 全局错误]', { message, source, lineno, colno, error });
    showToast(
      `发生了一个意外错误：${typeof message === 'string' ? message.slice(0, 100) : '未知错误'}`,
      'error'
    );
    // 返回 true 阻止浏览器默认行为
    return true;
  };

  // Promise 未处理异常
  window.addEventListener('unhandledrejection', function (event) {
    console.error('[PageWise 未处理的 Promise]', event.reason);
    const reason = event.reason;
    const errorMsg = reason instanceof Error
      ? reason.message.slice(0, 100)
      : String(reason).slice(0, 100);
    showToast(`发生了一个意外错误：${errorMsg}`, 'error');
    // 阻止默认行为（console 输出）
    event.preventDefault();
  });
}

// ==================== AI 错误专用消息构建 ====================

/**
 * 构建 AI 错误的聊天区提示（带可选重试按钮）
 * @param {{ type: string, message: string }} classified
 * @param {Function} [retryFn] - 重试回调函数
 * @returns {string} HTML 字符串
 */
export function buildAIErrorMessageHTML(classified, retryFn) {
  let html = `<div class="system-message error-message">`;
  html += `<span>⚠️ ${escapeHtmlSimple(classified.message)}</span>`;

  // 网络错误和超时：提供重试按钮
  if ((classified.type === ErrorType.NETWORK || classified.type === ErrorType.TIMEOUT) && retryFn) {
    html += ` <button class="btn-retry-ai" onclick="this.closest('.error-message').retryFn()">重试</button>`;
  }

  html += `</div>`;
  return html;
}

/**
 * 简单 HTML 转义（不依赖 DOM）
 */
function escapeHtmlSimple(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
