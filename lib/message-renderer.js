/**
 * MessageRenderer — 消息渲染系统
 * 从 sidebar.js 提取的消息创建、更新、操作处理逻辑
 */

import { renderMarkdown } from './utils.js';

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
  }

  addUserMessage(text, selection = '') {
    const welcome = this.chatArea.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-user';
    messageDiv.innerHTML = `
      <div class="message-bubble">
        ${selection ? `<div class="selection-quote" style="font-size:11px;opacity:0.8;margin-bottom:4px;padding:4px 8px;background:rgba(255,255,255,0.15);border-radius:4px;border-left:2px solid rgba(255,255,255,0.4);">"${this.escapeHtml(selection.slice(0, 200))}"</div>` : ''}
        ${this.escapeHtml(text)}
      </div>
    `;
    this.chatArea.appendChild(messageDiv);
    this.scrollToBottom();
  }

  addAIMessage(content) {
    const hasRunnableCode = /```(?:html|javascript)\n[\s\S]*?```/i.test(content);
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-ai';
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
    // 为可运行的代码块注入独立的运行按钮
    if (hasRunnableCode) {
      this.injectCodeBlockRunButtons(messageDiv, content);
    }
    this.chatArea.appendChild(messageDiv);
    this.scrollToBottom();
    return messageDiv;
  }

  updateAIMessage(messageEl, content) {
    const bubble = messageEl.querySelector('.message-bubble');
    bubble.innerHTML = renderMarkdown(content);
    this.scrollToBottom();
  }

  addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.innerHTML = `
      <div style="text-align:center;font-size:12px;color:var(--text-muted);padding:4px 0;">
        ${this.escapeHtml(text)}
      </div>
    `;
    this.chatArea.appendChild(messageDiv);
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
}
