/**
 * PageSummarizer — 一键全文总结引擎
 *
 * 使用 Readability-like 算法提取正文，调用 AI 生成结构化摘要，
 * 支持流式输出和保存到知识库。
 */

'use strict';

// ==================== Readability-like 内容提取 ====================

/** 不可见 / 噪音标签集合 */
const NOISE_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
  'SVG', 'CANVAS', 'HEADER', 'FOOTER', 'NAV', 'FORM', 'INPUT',
  'TEXTAREA', 'SELECT', 'BUTTON', 'LABEL', 'FIGURE'
]);

/** 内容标签集合 — 用于计算段落密度 */
const CONTENT_TAGS = new Set([
  'P', 'LI', 'PRE', 'BLOCKQUOTE', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
]);

/** 高置信度内容选择器 */
const POSITIVE_SELECTORS = [
  'article', 'main', '[role="main"]',
  '.post-content', '.article-content', '.entry-content',
  '.post-body', '.article-body', '.story-body',
  '.markdown-body', '.content-body', '.page-content',
  '#article', '#content', '#main'
];

/** 负面选择器 — 导航、广告等 */
const NEGATIVE_SELECTORS = [
  'nav', 'aside', '.sidebar', '.ad', '.advertisement',
  '.comment', '.comments', '.related', '.recommended',
  '.footer', '.header', '.menu', '.breadcrumb',
  '.social', '.share', '.widget'
];

export class PageSummarizer {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxContentLength=8000] — 提取内容最大长度
   * @param {number} [options.minParagraphLength=30] — 最小段落长度
   */
  constructor(options = {}) {
    this.maxContentLength = options.maxContentLength || 8000;
    this.minParagraphLength = options.minParagraphLength || 30;
  }

  // ==================== 正文提取 ====================

  /**
   * 从 HTML 中提取主要正文内容
   * 使用 Readability-like 算法：候选评分 → 最佳区域 → 段落收集
   *
   * @param {string} html — 页面 HTML 字符串
   * @returns {{ title: string, content: string, excerpt: string, charCount: number }}
   */
  extractMainContent(html) {
    if (!html || typeof html !== 'string') {
      return { title: '', content: '', excerpt: '', charCount: 0 };
    }

    // 解析 HTML（支持浏览器和 Node.js 环境）
    const doc = this._parseHTML(html);
    if (!doc) {
      return { title: '', content: '', excerpt: '', charCount: 0 };
    }

    // 提取标题
    const title = this._extractTitle(doc);

    // 清理噪音元素
    this._removeNoiseElements(doc);

    // 策略 1: 尝试高置信度选择器
    let mainContent = this._tryHighConfidenceSelectors(doc);

    // 策略 2: 如果高置信度选择器结果不够，使用评分算法
    if (!mainContent || this._getTextLength(mainContent) < 200) {
      mainContent = this._scoreAndSelectBestCandidate(doc);
    }

    // 收集段落文本
    const paragraphs = this._collectParagraphs(mainContent || doc.body);

    // 合并并截断
    let content = paragraphs.join('\n\n');
    if (content.length > this.maxContentLength) {
      content = content.slice(0, this.maxContentLength - 20) + '\n\n[内容已截取…]';
    }

    const excerpt = content.slice(0, 200).replace(/\n+/g, ' ').trim();

    return {
      title,
      content,
      excerpt,
      charCount: content.length
    };
  }

  // ==================== AI 摘要生成 ====================

  /**
   * 调用 AI 生成结构化摘要
   *
   * @param {string} content — 正文内容
   * @param {Object} [options]
   * @param {'brief'|'detailed'} [options.length='brief'] — 摘要长度
   * @param {'zh'|'en'} [options.language='zh'] — 输出语言
   * @param {Object} [options.aiClient] — AIClient 实例
   * @param {Function} [options.onChunk] — 流式输出回调 onChunk(text)
   * @param {AbortSignal} [options.signal] — 取消信号
   * @returns {Promise<string>} 完整摘要文本
   */
  async generateSummary(content, options = {}) {
    if (!content || typeof content !== 'string') {
      throw new Error('内容不能为空');
    }

    const {
      length = 'brief',
      language = 'zh',
      aiClient,
      onChunk,
      signal
    } = options;

    if (!aiClient) {
      throw new Error('需要提供 aiClient 实例');
    }

    const prompt = this._buildPrompt(content, { length, language });
    const messages = [{ role: 'user', content: prompt }];
    const streamOpts = {
      systemPrompt: this._getSystemPrompt(language),
      signal,
      model: aiClient.model,
      maxTokens: aiClient.maxTokens || 4096
    };

    let fullResponse = '';

    // 流式调用
    if (onChunk && typeof onChunk === 'function') {
      for await (const chunk of aiClient.chatStream(messages, streamOpts)) {
        if (signal?.aborted) break;
        fullResponse += chunk;
        onChunk(chunk);
      }
    } else {
      // 非流式调用
      fullResponse = await aiClient.chat(messages, streamOpts);
    }

    return fullResponse;
  }

  // ==================== Prompt 构建 ====================

  /**
   * @private
   * 构建摘要 prompt
   */
  _buildPrompt(content, options) {
    const { length, language } = options;

    const lengthGuide = length === 'detailed'
      ? '请生成详细摘要，每个要点可以展开说明（2-3 句），重要细节尽可能保留。'
      : '请生成简洁摘要，每个要点精炼到一句话。';

    if (language === 'en') {
      return `Please generate a structured summary of the following content:
1. Core Topic (one sentence)
2. Key Points (3-5 items)
3. Important Details
4. Action Suggestions

${lengthGuide}

Content:
${content}`;
    }

    return `请对以下内容生成结构化摘要：
1. 核心主题（一句话）
2. 关键要点（3-5个）
3. 重要细节
4. 行动建议

${lengthGuide}

内容：
${content}`;
  }

  /**
   * @private
   * 系统 prompt
   */
  _getSystemPrompt(language) {
    if (language === 'en') {
      return 'You are a professional content summarizer. Generate clear, well-structured summaries in Markdown format. Use bullet points for key points and details.';
    }
    return '你是一个专业的内容摘要助手。请用 Markdown 格式生成清晰、结构化的摘要。关键要点和细节使用列表格式。';
  }

  // ==================== 内部：HTML 解析 ====================

  /** @private */
  _parseHTML(html) {
    if (typeof DOMParser !== 'undefined') {
      try {
        return new DOMParser().parseFromString(html, 'text/html');
      } catch {
        return null;
      }
    }
    // Node.js 环境 — 基本标签解析（测试用）
    return this._basicParse(html);
  }

  /**
   * @private
   * 基本 HTML 解析（Node.js 测试环境用）
   */
  _basicParse(html) {
    // 构建轻量级 DOM 树（用于测试）
    const bodyContent = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                            .replace(/<style[\s\S]*?<\/style>/gi, '')
                            .replace(/<head[\s\S]*?<\/head>/gi, '');

    const elements = [];
    const tagRegex = /<(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = tagRegex.exec(bodyContent)) !== null) {
      elements.push({ tag: match[1].toUpperCase(), innerHTML: match[2], textContent: this._stripTags(match[2]) });
    }

    return {
      title: this._extractTitleFromRegex(html),
      body: { innerHTML: bodyContent, textContent: this._stripTags(bodyContent), querySelectorAll: () => elements },
      querySelectorAll: (sel) => elements.filter(el => {
        const tag = sel.replace(/[^a-z]/gi, '').toUpperCase();
        return el.tag === tag;
      }),
      querySelector: (sel) => {
        const tag = sel.replace(/[^a-z]/gi, '').toUpperCase();
        return elements.find(el => el.tag === tag) || null;
      }
    };
  }

  /** @private */
  _stripTags(html) {
    return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** @private */
  _extractTitle(doc) {
    // h1 → og:title → <title>
    const h1 = doc.querySelector('h1');
    if (h1?.textContent?.trim()) return h1.textContent.trim();

    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle?.getAttribute?.('content')) return ogTitle.getAttribute('content');

    return doc.title || '';
  }

  /** @private */
  _extractTitleFromRegex(html) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) return this._stripTags(h1Match[1]);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) return this._stripTags(titleMatch[1]);
    return '';
  }

  // ==================== 内部：噪音清理 ====================

  /** @private */
  _removeNoiseElements(doc) {
    if (!doc.body) return;
    NOISE_TAGS.forEach(tag => {
      const els = doc.body.querySelectorAll?.(tag);
      if (els?.forEach) {
        els.forEach(el => el.remove?.());
      }
    });
    // 移除负面选择器
    NEGATIVE_SELECTORS.forEach(sel => {
      try {
        const els = doc.querySelectorAll?.(sel) || [];
        els.forEach?.(el => el.remove?.());
      } catch { /* 忽略无效选择器 */ }
    });
  }

  // ==================== 内部：高置信度选择器 ====================

  /** @private */
  _tryHighConfidenceSelectors(doc) {
    for (const sel of POSITIVE_SELECTORS) {
      try {
        const el = doc.querySelector(sel);
        if (el && this._getTextLength(el) > 100) {
          return el;
        }
      } catch { /* 忽略无效选择器 */ }
    }
    return null;
  }

  // ==================== 内部：评分算法 ====================

  /** @private */
  _scoreAndSelectBestCandidate(doc) {
    const candidates = doc.body?.querySelectorAll?.('div, section') || [];
    if (!candidates.length) return doc.body;

    let bestCandidate = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      const score = this._scoreCandidate(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    return bestCandidate || doc.body;
  }

  /** @private */
  _scoreCandidate(element) {
    const text = element.textContent || '';
    const textLen = text.replace(/\s+/g, '').length;
    if (textLen < 50) return -1000;

    let score = 0;

    // 文本长度得分（对数尺度）
    score += Math.log2(textLen + 1) * 2;

    // 段落密度得分
    const paragraphs = (element.innerHTML || '').match(/<p[\s>]/gi) || [];
    score += paragraphs.length * 3;

    // 内容标签比例
    const contentLen = this._getContentTextLength(element);
    const totalLen = textLen || 1;
    const density = contentLen / totalLen;
    score += density * 20;

    // 负面得分：链接密度高 = 导航区域
    const links = element.querySelectorAll?.('a') || [];
    const linkTextLen = Array.from(links).reduce((sum, a) => sum + (a.textContent?.length || 0), 0);
    const linkDensity = textLen > 0 ? linkTextLen / textLen : 0;
    if (linkDensity > 0.5) score -= 50;
    if (linkDensity > 0.3) score -= 20;

    // 负面得分：输入框过多 = 表单
    const inputs = element.querySelectorAll?.('input, textarea, select') || [];
    score -= inputs.length * 10;

    return score;
  }

  // ==================== 内部：段落收集 ====================

  /** @private */
  _collectParagraphs(root) {
    if (!root) return [];

    const paragraphs = [];
    const walker = this._createTextWalker(root);

    if (walker) {
      let node;
      while ((node = walker.nextNode?.())) {
        const text = node.textContent?.trim();
        if (text && text.length >= this.minParagraphLength) {
          const tag = node.tagName?.toUpperCase();
          if (tag?.startsWith('H')) {
            const level = parseInt(tag[1]) || 2;
            paragraphs.push('#'.repeat(Math.min(level, 4)) + ' ' + text);
          } else if (tag === 'LI') {
            paragraphs.push('- ' + text);
          } else if (tag === 'BLOCKQUOTE') {
            paragraphs.push('> ' + text);
          } else {
            paragraphs.push(text);
          }
        }
      }
    }

    return paragraphs;
  }

  /** @private */
  _createTextWalker(root) {
    // 浏览器环境
    if (typeof document !== 'undefined' && document.createTreeWalker) {
      return document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(node) {
            if (NOISE_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
            if (CONTENT_TAGS.has(node.tagName)) return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
    }
    // Node.js 测试环境 — 返回简单迭代器
    return this._simpleWalker(root);
  }

  /** @private */
  _simpleWalker(root) {
    const items = [];
    const collect = (el) => {
      if (!el) return;
      if (el.tag && CONTENT_TAGS.has(el.tag)) {
        items.push(el);
      }
      const children = el.children || el.childNodes || [];
      for (const child of children) {
        collect(child);
      }
    };
    collect(root);
    let idx = 0;
    return {
      nextNode() {
        if (idx >= items.length) return null;
        const node = items[idx++];
        // 确保 tagName 可访问
        node.tagName = node.tag || node.tagName || 'P';
        return node;
      }
    };
  }

  // ==================== 内部：辅助方法 ====================

  /** @private */
  _getTextLength(el) {
    return (el.textContent || '').replace(/\s+/g, '').length;
  }

  /** @private */
  _getContentTextLength(el) {
    if (!el.querySelectorAll) return this._getTextLength(el);
    let len = 0;
    for (const tag of CONTENT_TAGS) {
      const els = el.querySelectorAll(tag) || [];
      els.forEach?.(e => { len += (e.textContent || '').length; });
    }
    return len || this._getTextLength(el);
  }
}
