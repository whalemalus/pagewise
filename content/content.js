/**
 * Content Script - 注入到网页中，负责提取页面内容和高亮标注
 */

(function () {
  'use strict';

  // 防止重复注入
  if (window.__AI_ASSISTANT_INJECTED__) return;
  window.__AI_ASSISTANT_INJECTED__ = true;

  // ==================== 高亮存储 key ====================
  const HIGHLIGHTS_KEY = 'pagewiseHighlights';

  // ==================== XPath 工具 ====================

  /**
   * 获取文本节点的 XPath 路径
   * @param {Node} node - 文本节点
   * @returns {string} XPath 字符串
   */
  function getXPath(node) {
    if (!node || !node.parentNode) return '';

    const parts = [];
    let current = node;

    while (current && current !== document.documentElement) {
      const parent = current.parentNode;
      if (!parent) break;

      let index = 0;
      let sibling = parent.firstChild;
      const tagName = current.nodeName.toLowerCase();

      while (sibling) {
        if (sibling.nodeName.toLowerCase() === tagName) {
          index++;
        }
        if (sibling === current) break;
        sibling = sibling.nextSibling;
      }

      parts.unshift(`${tagName}[${index}]`);
      current = parent;
    }

    return '/' + parts.join('/');
  }

  /**
   * 通过 XPath 获取节点
   * @param {string} xpath
   * @returns {Node|null}
   */
  function getNodeByXPath(xpath) {
    try {
      const result = document.evaluate(
        xpath, document, null,
        XPathResult.FIRST_ORDERED_NODE_TYPE, null
      );
      return result.singleNodeValue;
    } catch (e) {
      return null;
    }
  }

  // ==================== 高亮功能 ====================

  /**
   * 获取用户选中文本及其位置信息
   * @returns {{ text: string, xpath: string, offset: number } | null}
   */
  function getSelectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;

    const text = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const startContainer = range.startContainer;
    const offset = range.startOffset;

    return {
      text,
      xpath: getXPath(startContainer),
      offset
    };
  }

  /**
   * 在页面中高亮指定文本（精确 XPath 匹配优先，文本搜索兜底）
   * @param {{ text: string, xpath: string, offset: number }} highlight
   * @returns {boolean} 是否成功高亮
   */
  function applyHighlight(highlight) {
    const { text, xpath, offset } = highlight;
    if (!text) return false;

    // 策略1：XPath 精确定位
    if (xpath) {
      const success = applyHighlightByXPath(text, xpath, offset);
      if (success) return true;
    }

    // 策略2：文本搜索兜底
    return applyHighlightByText(text);
  }

  /**
   * 通过 XPath 精确定位并高亮
   */
  function applyHighlightByXPath(text, xpath, offset) {
    const node = getNodeByXPath(xpath);
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;

    const idx = node.textContent.indexOf(text);
    if (idx === -1) return false;

    return wrapTextWithHighlight(node, idx, text.length);
  }

  /**
   * 通过文本搜索在页面中查找并高亮
   */
  function applyHighlightByText(text) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      // 跳过脚本/样式/已高亮区域
      const parent = node.parentElement;
      if (!parent) continue;
      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
      if (parent.classList.contains('pagewise-highlight')) continue;

      const idx = node.textContent.indexOf(text);
      if (idx !== -1) {
        return wrapTextWithHighlight(node, idx, text.length);
      }
    }
    return false;
  }

  /**
   * 用 <mark> 标签包裹文本范围
   */
  function wrapTextWithHighlight(textNode, startOffset, length) {
    try {
      const range = document.createRange();
      range.setStart(textNode, startOffset);
      range.setEnd(textNode, startOffset + length);

      const mark = document.createElement('mark');
      mark.className = 'pagewise-highlight';
      range.surroundContents(mark);
      return true;
    } catch (e) {
      // surroundContents 可能在跨节点选区时失败
      return false;
    }
  }

  /**
   * 渲染当前页面的所有高亮
   * 从 chrome.storage.local 读取数据
   */
  function restoreHighlights() {
    const url = location.href;
    chrome.storage.local.get(HIGHLIGHTS_KEY, (result) => {
      const all = result[HIGHLIGHTS_KEY] || {};
      const highlights = all[url] || [];

      // 按 offset 降序排列，避免前面的高亮影响后面的位置
      highlights.sort((a, b) => (b.offset || 0) - (a.offset || 0));

      for (const h of highlights) {
        applyHighlight(h);
      }
    });
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

  // ==================== 页面内容提取 ====================

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
      extractedAt: new Date().toISOString(),
      isYouTube: isYouTubeVideo()
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

  // ==================== YouTube 字幕提取 ====================

  /**
   * 检测当前页面是否为 YouTube 视频页面
   * @returns {boolean}
   */
  function isYouTubeVideo() {
    return location.href.includes('youtube.com/watch');
  }

  /**
   * 提取 YouTube 视频字幕
   * 优先从 DOM 提取，兜底从 ytInitialPlayerResponse API 提取
   * @returns {Promise<{ segments: Array<{text: string, start: number, duration: number}>, fullText: string } | null>}
   */
  async function extractYouTubeSubtitles() {
    // 策略 1：从 DOM 提取已展开的字幕面板
    const domResult = extractSubtitlesFromDOM();
    if (domResult && domResult.segments.length > 0) {
      return domResult;
    }

    // 策略 2：尝试展开字幕面板，等待加载后提取
    const expanded = await tryExpandTranscriptPanel();
    if (expanded) {
      await sleep(1500);
      const domResult2 = extractSubtitlesFromDOM();
      if (domResult2 && domResult2.segments.length > 0) {
        return domResult2;
      }
    }

    // 策略 3：从 ytInitialPlayerResponse 获取字幕 URL 并提取
    const apiResult = await extractSubtitlesFromAPI();
    if (apiResult && apiResult.segments.length > 0) {
      return apiResult;
    }

    return null;
  }

  /**
   * 从 DOM 中提取字幕片段
   * @returns {{ segments: Array, fullText: string } | null}
   */
  function extractSubtitlesFromDOM() {
    const segments = [];
    const segmentEls = document.querySelectorAll(
      'ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer'
    );

    for (const el of segmentEls) {
      const textEl = el.querySelector('.segment-text, yt-formatted-string.segment-text');
      const timestampEl = el.querySelector('.segment-timestamp, yt-formatted-string.segment-timestamp');
      const text = textEl?.textContent?.trim() || '';
      const timestamp = timestampEl?.textContent?.trim() || '';

      if (!text) continue;

      const startTime = parseTimestamp(timestamp);
      segments.push({ text, start: startTime, duration: 0 });
    }

    // 计算 duration（相邻字幕的时间差）
    for (let i = 0; i < segments.length; i++) {
      if (i < segments.length - 1) {
        segments[i].duration = segments[i + 1].start - segments[i].start;
      } else {
        segments[i].duration = 5; // 最后一段默认 5 秒
      }
    }

    if (segments.length === 0) return null;

    const fullText = segments.map(s => s.text).join(' ');
    return { segments, fullText };
  }

  /**
   * 尝试展开 YouTube 字幕面板
   * @returns {Promise<boolean>} 是否成功点击展开
   */
  async function tryExpandTranscriptPanel() {
    // 方式 1：点击 "显示字幕" 按钮
    const transcriptBtn = document.querySelector(
      'button[aria-label*="transcript" i], button[aria-label*="字幕" i], ' +
      'ytd-button-renderer#button-shape button[aria-label*="transcript" i]'
    );
    if (transcriptBtn) {
      transcriptBtn.click();
      return true;
    }

    // 方式 2：点击 "更多" 按钮，然后找字幕选项
    const moreBtn = document.querySelector(
      'tp-yt-paper-button#expand, #button-shape button[aria-label="更多操作" i], ' +
      'ytd-menu-renderer #button-shape button'
    );
    if (moreBtn) {
      moreBtn.click();
      await sleep(500);

      // 在弹出菜单中查找 "显示字幕" 选项
      const menuItems = document.querySelectorAll(
        'ytd-menu-service-item-renderer, tp-yt-paper-listbox yt-formatted-string'
      );
      for (const item of menuItems) {
        const itemText = item.textContent?.toLowerCase() || '';
        if (itemText.includes('transcript') || itemText.includes('字幕')) {
          item.click();
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 从 ytInitialPlayerResponse 中获取字幕 URL 并提取
   * @returns {Promise<{ segments: Array, fullText: string } | null>}
   */
  async function extractSubtitlesFromAPI() {
    try {
      const playerResponse = window.ytInitialPlayerResponse ||
        window.ytplayer?.config?.args?.player_response;

      if (!playerResponse) return null;

      let parsed = playerResponse;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          return null;
        }
      }

      const captionTracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!captionTracks || captionTracks.length === 0) return null;

      // 优先选择中文字幕，其次英语，最后第一个
      const preferred = captionTracks.find(t => t.languageCode === 'zh-Hans' || t.languageCode === 'zh-CN')
        || captionTracks.find(t => t.languageCode === 'zh')
        || captionTracks.find(t => t.languageCode === 'en')
        || captionTracks[0];

      if (!preferred || !preferred.baseUrl) return null;

      // 获取字幕 XML
      const response = await fetch(preferred.baseUrl + '&fmt=srv3');
      if (!response.ok) return null;

      const xmlText = await response.text();
      return parseSubtitleXML(xmlText);
    } catch (e) {
      return null;
    }
  }

  /**
   * 解析 YouTube 字幕 XML 格式 (srv3)
   * @param {string} xml
   * @returns {{ segments: Array, fullText: string }}
   */
  function parseSubtitleXML(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const pElements = doc.querySelectorAll('p');
    const segments = [];

    for (const p of pElements) {
      const text = p.textContent?.trim() || '';
      const start = parseInt(p.getAttribute('t') || '0', 10) / 1000; // ms -> s
      const duration = parseInt(p.getAttribute('d') || '0', 10) / 1000;

      if (!text) continue;
      segments.push({ text, start, duration });
    }

    if (segments.length === 0) {
      // 兜底：尝试 <text> 标签格式
      const textElements = doc.querySelectorAll('text');
      for (const t of textElements) {
        const text = t.textContent?.trim() || '';
        const start = parseFloat(t.getAttribute('start') || '0');
        const duration = parseFloat(t.getAttribute('dur') || '0');
        if (!text) continue;
        segments.push({ text, start, duration });
      }
    }

    const fullText = segments.map(s => s.text).join(' ');
    return { segments, fullText };
  }

  /**
   * 将时间戳字符串解析为秒数
   * 支持格式: "1:23", "01:23", "1:23:45"
   * @param {string} timestamp
   * @returns {number}
   */
  function parseTimestamp(timestamp) {
    if (!timestamp) return 0;
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  /**
   * 延迟指定毫秒
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== 浮动按钮 ====================

  /**
   * 划词提问浮动按钮
   */
  function removeFloatBtn() {
    const existing = document.getElementById('pagewise-float-btn');
    if (existing) existing.remove();
  }

  function createFloatBtn(selectedText, rect) {
    removeFloatBtn();

    const btn = document.createElement('button');
    btn.id = 'pagewise-float-btn';
    btn.textContent = '🤖 问智阅';

    // 定位到选区附近
    let top = rect.top - 36;
    let left = rect.left + rect.width / 2 - 40;

    // 防止超出视口顶部
    if (top < 8) top = rect.bottom + 8;
    // 防止超出视口左右
    if (left < 8) left = 8;
    if (left + 80 > window.innerWidth - 8) left = window.innerWidth - 88;

    btn.style.top = top + 'px';
    btn.style.left = left + 'px';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: 'contextMenuAsk', selection: selectedText });
      removeFloatBtn();
    });

    document.body.appendChild(btn);
  }

  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text.length > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        createFloatBtn(text, rect);
      } else {
        removeFloatBtn();
      }
    }, 200);
  });

  document.addEventListener('mousedown', (e) => {
    if (e.target.id !== 'pagewise-float-btn') {
      removeFloatBtn();
    }
  });

  // ==================== 消息监听 ====================

  /**
   * 监听来自 sidebar / background 的消息
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'extractContent':
        sendResponse(extractPageContent());
        break;

      case 'extractYouTubeSubtitles': {
        if (!isYouTubeVideo()) {
          sendResponse({ error: '不是 YouTube 视频页面' });
          break;
        }
        extractYouTubeSubtitles().then(result => {
          if (result) {
            // 截取前 8000 字符
            const MAX_CHARS = 8000;
            if (result.fullText.length > MAX_CHARS) {
              result.fullText = result.fullText.slice(0, MAX_CHARS) + '...';
            }
            sendResponse({ success: true, subtitles: result });
          } else {
            sendResponse({ success: false, error: '未找到视频字幕，可能视频未开启字幕功能' });
          }
        }).catch(err => {
          sendResponse({ success: false, error: `字幕提取失败: ${err.message}` });
        });
        break;
      }

      case 'isYouTubeVideo':
        sendResponse({ isYouTube: isYouTubeVideo() });
        break;

      case 'getSelection':
        sendResponse({ selection: getSelection() });
        break;

      case 'getSelectionInfo':
        sendResponse(getSelectionInfo());
        break;

      case 'saveHighlight': {
        // 收到保存高亮请求
        const info = request.highlight || getSelectionInfo();
        if (!info || !info.text) {
          sendResponse({ success: false, error: '无选中文本' });
          break;
        }

        const highlight = {
          url: location.href,
          text: info.text,
          xpath: info.xpath || '',
          offset: info.offset || 0
        };

        // 读取现有高亮并追加
        chrome.storage.local.get(HIGHLIGHTS_KEY, (result) => {
          const all = result[HIGHLIGHTS_KEY] || {};
          const urlHighlights = all[location.href] || [];

          // 去重
          const exists = urlHighlights.find(
            h => h.text === highlight.text && h.xpath === highlight.xpath && h.offset === highlight.offset
          );

          if (exists) {
            sendResponse({ success: true, highlight: exists, duplicate: true });
            return;
          }

          // 上限检查
          if (urlHighlights.length >= 50) {
            sendResponse({ success: false, error: '每个页面最多保存 50 个高亮' });
            return;
          }

          const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            ...highlight,
            createdAt: new Date().toISOString()
          };

          urlHighlights.push(entry);
          all[location.href] = urlHighlights;

          chrome.storage.local.set({ [HIGHLIGHTS_KEY]: all }, () => {
            // 在页面中应用高亮
            applyHighlight(entry);
            sendResponse({ success: true, highlight: entry });
          });
        });
        break;
      }

      case 'deleteHighlight': {
        const { id } = request;
        if (!id) {
          sendResponse({ success: false, error: '缺少高亮 ID' });
          break;
        }

        chrome.storage.local.get(HIGHLIGHTS_KEY, (result) => {
          const all = result[HIGHLIGHTS_KEY] || {};
          const urlHighlights = all[location.href] || [];
          const filtered = urlHighlights.filter(h => h.id !== id);

          if (filtered.length === urlHighlights.length) {
            sendResponse({ success: false, error: '未找到高亮' });
            return;
          }

          if (filtered.length === 0) {
            delete all[location.href];
          } else {
            all[location.href] = filtered;
          }

          chrome.storage.local.set({ [HIGHLIGHTS_KEY]: all }, () => {
            // 移除页面中的高亮标记
            const marks = document.querySelectorAll('.pagewise-highlight');
            // 简单策略：重新渲染所有剩余高亮
            marks.forEach(m => {
              const parent = m.parentNode;
              if (parent) {
                parent.replaceChild(document.createTextNode(m.textContent), m);
                parent.normalize();
              }
            });
            // 重新应用剩余高亮
            for (const h of filtered) {
              applyHighlight(h);
            }
            sendResponse({ success: true });
          });
        });
        break;
      }

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

  // ==================== 初始化：页面加载时恢复高亮 ====================
  restoreHighlights();

})();
