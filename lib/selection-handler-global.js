/**
 * SelectionHandler — Non-module version for content scripts
 * Original: lib/selection-handler.js (ES Module)
 * This file registers SelectionHandler as a global for IIFE content scripts.
 */
(function() {
'use strict';

class SelectionHandler {
  constructor(options = {}) {
    this._onMessage = options.onMessage || null;
    this._onAction = options.onAction || null;
  }

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
    if (handler) return handler();
    return this._handleUnknown(text);
  }

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

  previewURL(text) {
    const url = this._normalizeURL(text);
    const domain = this._extractDomain(url);
    const payload = { url, domain, prompt: `请帮我预览和总结这个链接的内容：${url}` };
    this._emit('previewURL', payload);
    return { action: 'previewURL', type: 'url', payload };
  }

  searchError(text) {
    const errorType = this._extractErrorType(text);
    const payload = { errorText: text, errorType, prompt: `请帮我分析以下错误信息并提供解决方案：\n\n${text}` };
    this._emit('searchError', payload);
    return { action: 'searchError', type: 'error', payload };
  }

  calculateMath(text) {
    const expression = text.replace(/\s+/g, '');
    const result = this._safeEval(expression);
    const payload = { expression: text, result, prompt: `请计算以下数学表达式并解释：${text}` };
    this._emit('calculateMath', payload);
    return { action: 'calculateMath', type: 'math', payload };
  }

  translateEnglish(text) {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const payload = { text, wordCount, targetLang: 'zh-CN', prompt: `请将以下英文翻译为中文：\n\n${text}` };
    this._emit('translateEnglish', payload);
    return { action: 'translateEnglish', type: 'english', payload };
  }

  _handleUnknown(text) {
    const payload = { text, prompt: `请帮我分析以下内容：\n\n${text}` };
    this._emit('generalQuery', payload);
    return { action: 'generalQuery', type: 'unknown', payload };
  }

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

  _normalizeURL(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('www.')) return 'https://' + trimmed;
    return trimmed;
  }

  _extractDomain(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  _extractErrorType(text) {
    const errorMatch = text.match(/\b\w*Error\b/i);
    if (errorMatch) return errorMatch[0];
    const exceptionMatch = text.match(/\b\w*Exception\b/i);
    if (exceptionMatch) return exceptionMatch[0];
    return 'UnknownError';
  }

  _safeEval(expr) {
    if (!/^[\d\s+\-*/().^%]+$/.test(expr)) return 'N/A';
    try {
      const jsExpr = expr.replace(/\^/g, '**');
      const result = Function('"use strict"; return (' + jsExpr + ')')();
      if (typeof result === 'number' && isFinite(result)) return result;
      return 'N/A';
    } catch { return 'N/A'; }
  }

  _emit(action, payload) {
    if (this._onAction) this._onAction(action, payload);
    if (this._onMessage) this._onMessage({ action, payload, source: 'selectionHandler', timestamp: Date.now() });
  }
}

globalThis.SelectionHandler = SelectionHandler;
})();
