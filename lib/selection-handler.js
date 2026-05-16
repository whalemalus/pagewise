/**
 * SelectionHandler — 选中文本智能处理
 *
 * 根据文本类型执行不同处理逻辑：
 *   explainCode      — 代码片段解释
 *   previewURL       — URL 预览
 *   searchError      — 错误解决方案搜索
 *   calculateMath    — 数学计算
 *   translateEnglish — 英文翻译
 */

'use strict';

/**
 * @typedef {Object} HandlerResult
 * @property {string} action  — 执行的动作名
 * @property {string} type    — 文本类型
 * @property {*}      payload — 处理结果数据
 */

class SelectionHandler {
  /**
   * @param {Object} options
   * @param {Function} [options.onMessage] — 发送消息的回调（替代 chrome.runtime.sendMessage）
   * @param {Function} [options.onAction]  — 通用动作回调
   */
  constructor(options = {}) {
    this._onMessage = options.onMessage || null;
    this._onAction = options.onAction || null;
  }

  /**
   * 根据类型执行不同处理
   * @param {string} text — 选中文本
   * @param {string} type — 文本类型
   * @param {Object} [meta] — 额外信息 (如 language)
   * @returns {HandlerResult}
   */
  handleSelection(text, type, meta = {}) {
    if (!text || typeof text !== 'string') {
      return { action: 'noop', type, payload: { error: 'empty text' } };
    }

    const handlers = {
      code:    () => this.explainCode(text, meta),
      url:     () => this.previewURL(text),
      error:   () => this.searchError(text),
      math:    () => this.calculateMath(text),
      english: () => this.translateEnglish(text),
    };

    const handler = handlers[type];
    if (handler) {
      return handler();
    }

    return this._handleUnknown(text);
  }

  /**
   * 代码片段解释
   * @param {string} text — 代码文本
   * @param {Object} [meta]
   * @returns {HandlerResult}
   */
  explainCode(text, meta = {}) {
    const language = meta.language || this._guessLanguage(text);
    const payload = {
      code: text,
      language,
      prompt: `请解释以下${language !== 'unknown' ? language : ''}代码的功能和含义：\n\n\`\`\`${language}\n${text}\n\`\`\``,
    };

    this._emit('explainCode', payload);

    return { action: 'explainCode', type: 'code', payload };
  }

  /**
   * URL 预览
   * @param {string} text — URL 文本
   * @returns {HandlerResult}
   */
  previewURL(text) {
    const url = this._normalizeURL(text);
    const domain = this._extractDomain(url);

    const payload = {
      url,
      domain,
      prompt: `请帮我预览和总结这个链接的内容：${url}`,
    };

    this._emit('previewURL', payload);

    return { action: 'previewURL', type: 'url', payload };
  }

  /**
   * 错误解决方案搜索
   * @param {string} text — 错误信息
   * @returns {HandlerResult}
   */
  searchError(text) {
    const errorType = this._extractErrorType(text);
    const payload = {
      errorText: text,
      errorType,
      prompt: `请帮我分析以下错误信息并提供解决方案：\n\n${text}`,
    };

    this._emit('searchError', payload);

    return { action: 'searchError', type: 'error', payload };
  }

  /**
   * 数学计算
   * @param {string} text — 数学表达式
   * @returns {HandlerResult}
   */
  calculateMath(text) {
    const expression = text.replace(/\s+/g, '');
    const result = this._safeEval(expression);

    const payload = {
      expression: text,
      result,
      prompt: `请计算以下数学表达式并解释：${text}`,
    };

    this._emit('calculateMath', payload);

    return { action: 'calculateMath', type: 'math', payload };
  }

  /**
   * 英文翻译
   * @param {string} text — 英文文本
   * @returns {HandlerResult}
   */
  translateEnglish(text) {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const payload = {
      text,
      wordCount,
      targetLang: 'zh-CN',
      prompt: `请将以下英文翻译为中文：\n\n${text}`,
    };

    this._emit('translateEnglish', payload);

    return { action: 'translateEnglish', type: 'english', payload };
  }

  // ==================== 辅助方法 ====================

  /**
   * 处理未知类型
   * @param {string} text
   * @returns {HandlerResult}
   * @private
   */
  _handleUnknown(text) {
    const payload = {
      text,
      prompt: `请帮我分析以下内容：\n\n${text}`,
    };

    this._emit('generalQuery', payload);

    return { action: 'generalQuery', type: 'unknown', payload };
  }

  /**
   * 猜测代码语言
   * @param {string} code
   * @returns {string}
   * @private
   */
  _guessLanguage(code) {
    if (/\b(import\s+.*from\s+|export\s+(default\s+)?(class|function|const|let|var)\b|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|=>\s*[{(]|console\.log)/.test(code)) return 'javascript';
    if (/\b(def\s+\w+\s*\(|class\s+\w+(\(.*\))?\s*:|print\s*\(|import\s+\w+)\b/.test(code) && !/=>/.test(code)) return 'python';
    if (/\b(public\s+static\s+void|private\s+|protected\s+|System\.out)\b/.test(code)) return 'java';
    if (/\b(fmt\.Print|func\s+\w+\s*\(|package\s+\w+)\b/.test(code)) return 'go';
    if (/\b(SELECT\s+.*\s+FROM|INSERT\s+INTO|CREATE\s+TABLE)\b/i.test(code)) return 'sql';
    if (/<[a-zA-Z][^>]*>/.test(code) && /<\/[a-zA-Z]/.test(code)) return 'html';
    if (/^\s*\{[\s\S]*"[\w]+":/.test(code) && /[}\]]\s*$/.test(code)) return 'json';
    return 'unknown';
  }

  /**
   * 标准化 URL
   * @param {string} text
   * @returns {string}
   * @private
   */
  _normalizeURL(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('www.')) {
      return 'https://' + trimmed;
    }
    return trimmed;
  }

  /**
   * 提取域名
   * @param {string} url
   * @returns {string}
   * @private
   */
  _extractDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return '';
    }
  }

  /**
   * 提取错误类型名
   * @param {string} text
   * @returns {string}
   * @private
   */
  _extractErrorType(text) {
    const errorMatch = text.match(/\b\w*Error\b/i);
    if (errorMatch) return errorMatch[0];
    const exceptionMatch = text.match(/\b\w*Exception\b/i);
    if (exceptionMatch) return exceptionMatch[0];
    return 'UnknownError';
  }

  /**
   * 安全的数学表达式求值
   * @param {string} expr
   * @returns {number|string}
   * @private
   */
  _safeEval(expr) {
    // 只允许数字和运算符
    if (!/^[\d\s+\-*/().^%]+$/.test(expr)) {
      return 'N/A';
    }
    try {
      // 将 ^ 替换为 ** (幂运算)
      const jsExpr = expr.replace(/\^/g, '**');
      const result = Function('"use strict"; return (' + jsExpr + ')')();
      if (typeof result === 'number' && isFinite(result)) {
        return result;
      }
      return 'N/A';
    } catch {
      return 'N/A';
    }
  }

  /**
   * 触发消息 / 回调
   * @param {string} action
   * @param {Object} payload
   * @private
   */
  _emit(action, payload) {
    if (this._onAction) {
      this._onAction(action, payload);
    }
    if (this._onMessage) {
      this._onMessage({ action, payload, source: 'selectionHandler', timestamp: Date.now() });
    }
  }
}

export { SelectionHandler };
export default SelectionHandler;

// Global registration for non-module contexts (e.g., content scripts loaded via manifest)
if (typeof globalThis !== 'undefined') {
  globalThis.SelectionHandler = SelectionHandler;
}
