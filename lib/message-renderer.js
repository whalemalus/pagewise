/**
 * MessageRenderer — 消息渲染系统
 * 从 sidebar.js 提取的消息创建、更新、操作处理逻辑
 * 支持懒渲染：当消息超过 50 条时只渲染最近的 50 条，
 * 滚动到顶部时动态加载更早的消息。
 */

import { renderMarkdown } from './utils.js';

/** DOM 中最多同时渲染的消息数 */
export const MAX_RENDERED = 50;
/** 每次滚动到顶部加载的旧消息数 */
export const LOAD_BATCH = 20;

export class MessageRenderer {
  /**
   * @param {Object} deps - 依赖注入
   * @param {HTMLElement} deps.chatArea - 聊天区域 DOM 元素
   * @param {Function} deps.escapeHtml - HTML 转义函数
   * @param {Function} deps.scrollToBottom - 滚动到底部函数
   * @param {Object} deps.evolution - 进化引擎实例
   * @param {string} deps.currentTabId - 当前标签页 ID
   * @param {Function} deps.saveToKnowledgeBase - 保存到知识库（SidebarApp 方法）
   * @param {Function} deps.handleBranch - 处理分支（SidebarApp 方法）
   * @param {Function} deps.runAllCodeBlocks - 运行所有代码块（SidebarApp 方法）
   * @param {Function} deps.executeCodeSandbox - 沙箱执行代码（SidebarApp 方法）
   */
  constructor({ chatArea, escapeHtml, scrollToBottom, evolution, currentTabId, saveToKnowledgeBase, handleBranch, runAllCodeBlocks, executeCodeSandbox }) {
    this.chatArea = chatArea;
    this.escapeHtml = escapeHtml;
    this.scrollToBottom = scrollToBottom;
    this.evolution = evolution;
    this.currentTabId = currentTabId;
    this._saveToKnowledgeBase = saveToKnowledgeBase;
    this._handleBranch = handleBranch;
    this._runAllCodeBlocks = runAllCodeBlocks;
    this._executeCodeSandbox = executeCodeSandbox;

    // ---- Lazy rendering state ----
    /** @type {Array<{type:string, data:string, extra?:string}>} */
    this._allMessages = [];
    /** Range of _allMessages currently rendered in DOM [start, end) */
    this._renderedRange = { start: 0, end: 0 };
    this._loadingOlder = false;
    this._initLazyRendering();
  }

  /**
   * 设置 sentinel 元素和 IntersectionObserver，
   * 滚动到顶部时自动加载更早的消息。
   */
  _initLazyRendering() {
    this._sentinel = document.createElement('div');
    this._sentinel.className = 'pw-lazy-sentinel';
    this._sentinel.style.height = '1px';
    this.chatArea.appendChild(this._sentinel);

    this._observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !this._loadingOlder) {
          this._loadingOlder = true;
          this._renderOlderMessages();
          // Disconnect temporarily to avoid rapid re-firing
          this._observer?.disconnect();
          // Re-observe after a short delay
          setTimeout(() => {
            if (this._sentinel && this.chatArea) {
              this._observer?.observe(this._sentinel);
            }
            this._loadingOlder = false;
          }, 100);
        }
      },
      { root: this.chatArea, threshold: 0 }
    );
    this._observer.observe(this._sentinel);
  }

  /**
   * Prepend the next batch of older messages to the DOM
   * and remove the newest rendered ones to keep count ≤ MAX_RENDERED.
   */
  _renderOlderMessages() {
    const { start } = this._renderedRange;
    if (start <= 0) return; // nothing older

    const newStart = Math.max(0, start - LOAD_BATCH);
    // Create DOM elements for older messages
    const fragment = document.createDocumentFragment();
    for (let i = newStart; i < start; i++) {
      const msg = this._allMessages[i];
      const el = this._createMessageElement(msg);
      fragment.appendChild(el);
    }
    // Insert before the first currently-rendered message (or before sentinel)
    const firstRendered = this.chatArea.querySelector('.pw-lazy-msg');
    if (firstRendered) {
      this.chatArea.insertBefore(fragment, firstRendered);
    } else {
      this.chatArea.insertBefore(fragment, this._sentinel);
    }

    this._renderedRange.start = newStart;

    // Remove excess newest messages from DOM
    this._trimRenderedMessages();
  }

  /**
   * Remove excess rendered messages to keep DOM size ≤ MAX_RENDERED.
   * Removes from the *oldest* end (top) when scrolling down,
   * or from the *newest* end (bottom) when loading older messages.
   */
  _trimRenderedMessages() {
    const rendered = this.chatArea.querySelectorAll('.pw-lazy-msg');
    const count = rendered.length;
    if (count <= MAX_RENDERED) return;

    // We loaded older messages at the top → remove newest from the bottom
    const excess = count - MAX_RENDERED;
    // Remove from end (newest rendered) to keep older context
    for (let i = rendered.length - 1; i >= rendered.length - excess; i--) {
      rendered[i].remove();
    }
    this._renderedRange.end -= excess;
  }

  /**
   * Create a DOM element from a stored message data object.
   * @param {{type:string, data:string, extra?:string}} msg
   * @returns {HTMLElement}
   */
  _createMessageElement(msg) {
    switch (msg.type) {
      case 'user': return this._buildUserElement(msg.data, msg.extra);
      case 'ai':   return this._buildAIElement(msg.data);
      case 'system': return this._buildSystemElement(msg.data);
      default: {
        const d = document.createElement('div');
        d.className = 'message pw-lazy-msg';
        d.textContent = msg.data;
        return d;
      }
    }
  }

  /**
   * Build a user message DOM element (no side-effects).
   */
  _buildUserElement(text, selection = '') {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-user pw-lazy-msg';
    messageDiv.innerHTML = `
      <div class="message-bubble">
        ${selection ? `<div class="selection-quote" style="font-size:11px;opacity:0.8;margin-bottom:4px;padding:4px 8px;background:rgba(255,255,255,0.15);border-radius:4px;border-left:2px solid rgba(255,255,255,0.4);">"${this.escapeHtml(selection.slice(0, 200))}"</div>` : ''}
        ${this.escapeHtml(text)}
      </div>
    `;
    return messageDiv;
  }

  /**
   * Build an AI message DOM element (no side-effects).
   */
  _buildAIElement(content) {
    const hasRunnableCode = /```(?:html|javascript)\n[\s\S]*?```/i.test(content);
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-ai pw-lazy-msg';
    messageDiv.innerHTML = `
      <div class="message-content">
        <div class="message-bubble">${renderMarkdown(content)}</div>
        <div class="message-actions">
          <button class="msg-action-btn" data-action="copy">复制</button>
          <button class="msg-action-btn" data-action="save">💾 保存</button>
          <button class="msg-action-btn" data-action="highlight">📌 高亮</button>
          <button class="msg-action-btn" data-action="branch">🔀 分支</button>
          ${hasRunnableCode ? '<button class="msg-action-btn msg-action-run" data-action="run">▶️ 运行</button>' : ''}
        </div>
      </div>
    `;
    messageDiv.querySelectorAll('.msg-action-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleMessageAction(btn.dataset.action, messageDiv));
    });
    if (hasRunnableCode) {
      this.injectCodeBlockRunButtons(messageDiv, content);
    }
    return messageDiv;
  }

  /**
   * Build a system message DOM element (no side-effects).
   */
  _buildSystemElement(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message pw-lazy-msg';
    messageDiv.innerHTML = `
      <div style="text-align:center;font-size:12px;color:var(--text-muted);padding:4px 0;">
        ${this.escapeHtml(text)}
      </div>
    `;
    return messageDiv;
  }

  /**
   * Append a newly created message to the DOM and manage the sliding window.
   * @param {HTMLElement} messageDiv
   */
  _appendNewMessage(messageDiv) {
    // Insert before the sentinel so sentinel is always last
    this.chatArea.insertBefore(messageDiv, this._sentinel);
    this._renderedRange.end = this._allMessages.length;

    // Remove oldest rendered messages if exceeding the cap
    const rendered = this.chatArea.querySelectorAll('.pw-lazy-msg');
    if (rendered.length > MAX_RENDERED) {
      const excess = rendered.length - MAX_RENDERED;
      for (let i = 0; i < excess; i++) {
        rendered[i].remove();
      }
      this._renderedRange.start += excess;
    }
  }

  addUserMessage(text, selection = '') {
    const welcome = this.chatArea.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Store in data array
    this._allMessages.push({ type: 'user', data: text, extra: selection });

    // Build & append DOM
    const messageDiv = this._buildUserElement(text, selection);
    this._appendNewMessage(messageDiv);
    this.scrollToBottom();
  }

  addAIMessage(content) {
    // Store in data array
    this._allMessages.push({ type: 'ai', data: content });

    // Build & append DOM
    const messageDiv = this._buildAIElement(content);
    this._appendNewMessage(messageDiv);
    this.scrollToBottom();
    return messageDiv;
  }

  updateAIMessage(messageEl, content) {
    const bubble = messageEl.querySelector('.message-bubble');
    bubble.innerHTML = renderMarkdown(content);
    this.scrollToBottom();
  }

  addSystemMessage(text) {
    // Store in data array
    this._allMessages.push({ type: 'system', data: text });

    // Build & append DOM
    const messageDiv = this._buildSystemElement(text);
    this._appendNewMessage(messageDiv);
    this.scrollToBottom();
    return messageDiv;
  }

  showLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message message-ai';
    loadingDiv.innerHTML = `
      <div class="thinking-indicator">
        <div class="thinking-dots">
          <span class="thinking-dot"></span>
          <span class="thinking-dot"></span>
          <span class="thinking-dot"></span>
        </div>
        <span class="thinking-text">正在思考...</span>
      </div>
    `;
    this.chatArea.appendChild(loadingDiv);
    this.scrollToBottom();
    return loadingDiv;
  }

  async handleMessageAction(action, messageEl) {
    const bubble = messageEl.querySelector('.message-bubble');
    const text = bubble.textContent;

    // 找到最近的交互 ID
    const lastInteraction = this.evolution.interactions.slice(-1)[0];
    const interactionId = lastInteraction?.id;

    switch (action) {
      case 'copy':
        await navigator.clipboard.writeText(text);
        this.addSystemMessage('已复制到剪贴板');
        if (interactionId) this.evolution.recordSignal('copied', interactionId);
        break;
      case 'run':
        this._runAllCodeBlocks(messageEl);
        if (interactionId) this.evolution.recordSignal('code_executed', interactionId);
        break;
      case 'save':
        await this._saveToKnowledgeBase(text);
        if (interactionId) this.evolution.recordSignal('saved_to_kb', interactionId);
        break;
      case 'highlight': {
        // 从当前页面获取选中文本
        let selectionInfo = null;
        try {
          selectionInfo = await chrome.tabs.sendMessage(this.currentTabId, { action: 'getSelectionInfo' });
        } catch (e) {}

        // 如果没有选中文本，尝试从 AI 回答中提取代码
        let textToHighlight = selectionInfo?.text || '';
        let xpath = selectionInfo?.xpath || '';
        let offset = selectionInfo?.offset || 0;

        if (!textToHighlight) {
          const codeMatch = text.match(/`([^`]+)`/);
          if (codeMatch) {
            textToHighlight = codeMatch[1];
            xpath = '';
            offset = 0;
          }
        }

        if (!textToHighlight) {
          this.addSystemMessage('请先在页面中选中文本');
          break;
        }

        try {
          const result = await chrome.tabs.sendMessage(this.currentTabId, {
            action: 'saveHighlight',
            highlight: { text: textToHighlight, xpath, offset }
          });
          if (result?.success) {
            this.addSystemMessage(result.duplicate ? '该文本已高亮 ✓' : '已高亮标注 📌');
            if (!result.duplicate) {
              // incrementCounter 由 SidebarApp 通过 import 在原位置调用
              // 保持向后兼容：动态导入
              try {
                const { incrementCounter } = await import('./stats.js');
                incrementCounter('totalHighlights');
              } catch (e) {}
            }
          } else {
            this.addSystemMessage(`高亮失败：${result?.error || '未知错误'}`);
          }
        } catch (e) {
          this.addSystemMessage('高亮失败：请刷新页面后重试');
        }
        if (interactionId) this.evolution.recordSignal('highlighted', interactionId);
        break;
      }
      case 'branch':
        this._handleBranch(messageEl);
        break;
    }
  }

  /**
   * 为消息中的可运行代码块注入独立运行按钮
   * @param {HTMLElement} messageEl - 消息 DOM 元素
   * @param {string} rawContent - 原始 Markdown 内容
   */
  injectCodeBlockRunButtons(messageEl, rawContent) {
    const blocks = this.extractRunnableCodeBlocks(rawContent);
    if (blocks.length === 0) return;

    const codeBlockWrappers = messageEl.querySelectorAll('.code-block-wrapper');
    let blockIndex = 0;

    codeBlockWrappers.forEach((wrapper) => {
      const codeEl = wrapper.querySelector('code');
      if (!codeEl) return;

      const langClass = codeEl.className || '';
      const isHtml = /lang-html/i.test(langClass);
      const isJs = /lang-javascript/i.test(langClass) || /lang-js/i.test(langClass);

      if (!isHtml && !isJs) return;

      const lang = isHtml ? 'html' : 'javascript';

      // 找到对应的原始代码块（按顺序匹配）
      const codeData = blocks[blockIndex];
      blockIndex++;
      if (!codeData) return;

      // 添加运行按钮
      const runBtn = document.createElement('button');
      runBtn.className = 'code-run-btn';
      runBtn.textContent = '▶️ 运行';
      runBtn.title = '运行代码';
      runBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._executeCodeSandbox(codeData.code, lang, wrapper);
      });
      wrapper.appendChild(runBtn);
    });
  }

  /**
   * 从原始 Markdown 内容中提取 HTML/JavaScript 代码块
   * @param {string} markdownContent - 原始 Markdown 文本
   * @returns {Array<{lang: string, code: string}>} 代码块列表
   */
  extractRunnableCodeBlocks(markdownContent) {
    const blocks = [];
    const regex = /```(html|javascript)\n([\s\S]*?)```/gi;
    let match;
    while ((match = regex.exec(markdownContent)) !== null) {
      blocks.push({ lang: match[1].toLowerCase(), code: match[2] });
    }
    return blocks;
  }

  /**
   * Returns the total number of messages stored (including those not in DOM).
   * @returns {number}
   */
  getMessageCount() {
    return this._allMessages.length;
  }

  /**
   * Clean up the IntersectionObserver and sentinel. Call when the renderer
   * is no longer needed (e.g. sidebar closes).
   */
  destroy() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._sentinel && this._sentinel.parentNode) {
      this._sentinel.remove();
    }
    this._sentinel = null;
  }
}
