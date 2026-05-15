/**
 * SelectionDetector — 选中文本智能类型检测
 *
 * 根据选中文本内容自动判断类型：
 *   code    — 代码片段
 *   url     — URL 链接
 *   error   — 错误/异常信息
 *   math    — 数学表达式
 *   english — 英文文本
 *   unknown — 未知类型
 */

'use strict';

/**
 * @typedef {Object} TypeMatch
 * @property {string}  type       — 匹配到的类型
 * @property {number}  confidence — 置信度 0-1
 * @property {string}  [language] — 代码语言 (仅 code 类型)
 */

/** 正则匹配规则集 */
const TYPE_RULES = [
  {
    type: 'url',
    pattern: /^(https?:\/\/|www\.)[^\s]+$/i,
    confidence: 0.95,
  },
  {
    type: 'error',
    patterns: [
      /error[:\s]/i,
      /exception[:\s]/i,
      /traceback/i,
      /stack\s*trace/i,
      /fatal[:\s]/i,
      /warning[:\s]/i,
      /errno\s+\d+/i,
      /segmentation\s*fault/i,
      /cannot\s+find\s+module/i,
      /is\s+not\s+defined/i,
      /undefined\s+is\s+not/i,
      /null\s+reference/i,
      /permission\s+denied/i,
      /ECONNREFUSED/i,
      /ENOENT/i,
      /TypeError/i,
      /ReferenceError/i,
      /SyntaxError/i,
      /RangeError/i,
      /at\s+.*\(.*\.js:\d+:\d+\)/,
      /File ".*", line \d+/,
      /Traceback \(most recent call last\)/,
    ],
    confidence: 0.9,
  },
  {
    type: 'code',
    patterns: [
      /\b(function\s+\w+\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=)\b/,
      /\b(import\s+.*from\s+|export\s+(default\s+)?(class|function|const|let|var)\b)/,
      /\b(class\s+\w+(\s+extends\s+\w+)?)\s*\{/,
      /\b(if\s*\(.*\)\s*\{|for\s*\(.*\)\s*\{|while\s*\(.*\)\s*\{)/,
      /\b(def\s+\w+\s*\(|class\s+\w+(\(.*\))?\s*:)/,
      /\b(public\s+static\s+void|private\s+|protected\s+)/,
      /\b(console\.log|print\s*\(|System\.out|fmt\.Print)/,
      /\b(=>\s*\{|=>\s*\(|=>\s*\[)/,
      /[{};]\s*$/m,
      /^\s*(\/\/|#|\/\*|\*\/)/m,
      /\b(SELECT\s+.*\s+FROM\s+|INSERT\s+INTO\s+|CREATE\s+TABLE)\b/i,
    ],
    confidence: 0.85,
    detectLanguage(text) {
      if (/\b(import\s+.*from\s+|export\s+(default\s+)?(class|function|const|let|var)\b|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|=>\s*[{(]|console\.log)/.test(text)) return 'javascript';
      if (/\b(def\s+\w+\s*\(|class\s+\w+(\(.*\))?\s*:|print\s*\(|import\s+\w+)\b/.test(text) && !/=>/.test(text)) return 'python';
      if (/\b(public\s+static\s+void|private\s+|protected\s+|System\.out)\b/.test(text)) return 'java';
      if (/\b(fmt\.Print|func\s+\w+\s*\(|package\s+\w+)\b/.test(text)) return 'go';
      if (/\b(SELECT\s+.*\s+FROM|INSERT\s+INTO|CREATE\s+TABLE)\b/i.test(text)) return 'sql';
      if (/\b(fn\s+\w+\s*\(|let\s+mut\s+|impl\s+\w+)\b/.test(text)) return 'rust';
      if (/<[a-zA-Z][^>]*>/.test(text) && /<\/[a-zA-Z]/.test(text)) return 'html';
      if (/^\s*\{[\s\S]*"[\w]+":/.test(text) && /[}\]]\s*$/.test(text)) return 'json';
      return 'unknown';
    },
    confidence: 0.85,
  },
  {
    type: 'math',
    patterns: [
      /^[\d\s+\-*/().^%]+$/,
      /\b(sin|cos|tan|log|ln|sqrt|abs|ceil|floor|round|exp|pow)\s*\(/i,
      /[∫∑∏√π∞∈∉⊂⊃∪∩≤≥≠≈∂∇]/,
      /\b(lim|d\/dx)\b/,
      /\d+\s*[+\-*/^%]\s*\d+/,
      /\b\d+\s*!=?\s*0\b/,
      /\b\d+(\.\d+)?\s*[+\-*/]\s*\d+(\.\d+)?/,
    ],
    confidence: 0.8,
  },
  {
    type: 'english',
    pattern: /^[a-zA-Z\s.,!?;:'"()\-]+$/,
    minLength: 20,
    confidence: 0.7,
  },
];

class SelectionDetector {
  /**
   * 检测选中文本的类型
   * @param {string} text — 选中的文本
   * @returns {TypeMatch} 匹配结果
   */
  detectType(text) {
    if (!text || typeof text !== 'string') {
      return { type: 'unknown', confidence: 0 };
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return { type: 'unknown', confidence: 0 };
    }

    // 按优先级依次匹配
    for (const rule of TYPE_RULES) {
      const result = this._matchRule(rule, trimmed);
      if (result) {
        return result;
      }
    }

    return { type: 'unknown', confidence: 0 };
  }

  /**
   * 匹配单条规则
   * @param {Object} rule
   * @param {string} text
   * @returns {TypeMatch|null}
   * @private
   */
  _matchRule(rule, text) {
    // minLength 前置校验 (如英文需要 20+ 字符)
    if (rule.minLength && text.length < rule.minLength) {
      return null;
    }

    // 单正则匹配
    if (rule.pattern && rule.pattern.test(text)) {
      const result = { type: rule.type, confidence: rule.confidence };
      if (rule.detectLanguage) {
        result.language = rule.detectLanguage(text);
      }
      return result;
    }

    // 多正则匹配（任一命中即可）
    if (rule.patterns) {
      const matchCount = rule.patterns.filter(p => p.test(text)).length;
      if (matchCount > 0) {
        // 匹配越多置信度越高
        const ratio = matchCount / rule.patterns.length;
        const adjusted = Math.min(rule.confidence + ratio * 0.1, 1.0);
        const result = { type: rule.type, confidence: parseFloat(adjusted.toFixed(2)) };
        if (rule.detectLanguage) {
          result.language = rule.detectLanguage(text);
        }
        return result;
      }
    }

    return null;
  }

  /**
   * 批量检测多个文本
   * @param {string[]} texts
   * @returns {TypeMatch[]}
   */
  detectBatch(texts) {
    return texts.map(t => this.detectType(t));
  }

  /**
   * 返回所有支持的类型列表
   * @returns {string[]}
   */
  getSupportedTypes() {
    return ['code', 'url', 'error', 'math', 'english', 'unknown'];
  }
}

export { SelectionDetector, TYPE_RULES };
export default SelectionDetector;
