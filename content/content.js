/**
 * Content Script - 注入到网页中，负责提取页面内容
 */

(function () {
  'use strict';

  // 防止重复注入
  if (window.__AI_ASSISTANT_INJECTED__) return;
  window.__AI_ASSISTANT_INJECTED__ = true;

  /**
   * 提取页面核心内容
   * 采用 Reader Mode 思路，过滤噪音，保留正文
   */
  function extractPageContent() {
    const url = location.href;
    const title = document.title;

    // 策略1：尝试 article / main 标签
    const mainEl = document.querySelector('article, main, [role="main"], .post-content, .article-content, .entry-content');

    let paragraphs = [];

    if (mainEl) {
      paragraphs = extractFromElement(mainEl);
    }

    // 策略2：如果没找到主内容区，遍历所有段落
    if (paragraphs.length < 3) {
      paragraphs = extractFromDocument();
    }

    // 提取代码块
    const codeBlocks = [...document.querySelectorAll('pre code, code')]
      .filter(el => el.offsetHeight > 0 && el.textContent.trim().length > 10)
      .map(el => ({
        lang: el.className.replace(/language-|lang-/, '') || 'text',
        code: el.textContent.trim()
      }))
      // 去重（嵌套 code 标签）
      .filter((item, i, arr) => arr.findIndex(c => c.code === item.code) === i);

    // 提取页面元信息
    const meta = extractMeta();

    return {
      url,
      title,
      content: paragraphs.join('\n\n'),
      codeBlocks,
      meta,
      extractedAt: new Date().toISOString()
    };
  }

  /**
   * 从指定元素中提取内容
   */
  function extractFromElement(el) {
    const blocks = el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th');
    return [...blocks]
      .filter(block => isVisible(block))
      .map(block => {
        const tag = block.tagName.toLowerCase();
        const text = block.textContent.trim();
        if (tag.startsWith('h')) {
          const level = parseInt(tag[1]);
          return '#'.repeat(level) + ' ' + text;
        }
        if (tag === 'li') return '- ' + text;
        if (tag === 'blockquote') return '> ' + text;
        return text;
      })
      .filter(text => text.length > 5);
  }

  /**
   * 从整个文档提取内容（兜底策略）
   */
  function extractFromDocument() {
    // 排除的标签
    const excludeTags = new Set(['SCRIPT', 'STYLE', 'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'NOSCRIPT', 'SVG', 'IFRAME']);

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (excludeTags.has(node.tagName)) return NodeFilter.FILTER_REJECT;
          if (!isVisible(node)) return NodeFilter.FILTER_REJECT;
          if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'].includes(node.tagName)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    const results = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text.length > 15) {
        results.push(text);
      }
    }
    return results.slice(0, 200); // 限制数量，避免过长
  }

  /**
   * 提取页面元信息
   */
  function extractMeta() {
    const getMeta = (name) => {
      const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return el ? el.content : '';
    };

    return {
      description: getMeta('description') || getMeta('og:description'),
      author: getMeta('author'),
      keywords: getMeta('keywords'),
      siteName: getMeta('og:site_name') || location.hostname
    };
  }

  /**
   * 获取用户选中的文本
   */
  function getSelection() {
    const sel = window.getSelection();
    return sel ? sel.toString().trim() : '';
  }

  /**
   * 判断元素是否可见
   */
  function isVisible(el) {
    if (!el.offsetHeight || !el.offsetWidth) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  /**
   * 高亮页面中的相关文本（用于标记 AI 引用的内容）
   */
  function highlightText(text) {
    // 移除旧高亮
    document.querySelectorAll('.ai-assistant-highlight').forEach(el => {
      el.replaceWith(el.textContent);
    });

    if (!text) return;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(text);
      if (idx === -1) continue;

      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + text.length);

      const span = document.createElement('span');
      span.className = 'ai-assistant-highlight';
      span.style.cssText = 'background: #fef08a; padding: 1px 4px; border-radius: 3px; transition: background 0.3s;';
      range.surroundContents(span);

      span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
  }

  /**
   * 监听来自 sidebar / background 的消息
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'extractContent':
        sendResponse(extractPageContent());
        break;

      case 'getSelection':
        sendResponse({ selection: getSelection() });
        break;

      case 'highlight':
        highlightText(request.text);
        sendResponse({ success: true });
        break;

      case 'ping':
        sendResponse({ alive: true });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
    return true; // 保持消息通道开放
  });

})();
