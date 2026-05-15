/**
 * ChatMode — Chat 快捷模式
 *
 * 参考 Kimi 浏览器助手的 Chat 模式设计：
 * - Ctrl+K 快捷键打开 Chat 模式
 * - 自动携带当前页面上下文（标题 + URL + 摘要）
 * - 支持浮窗 / 侧边栏两种显示方式
 * - 记住用户上次选择的显示方式
 */

'use strict';

/** 显示模式常量 */
const DISPLAY_FLOATING = 'floating';
const DISPLAY_SIDEBAR = 'sidebar';

const STORAGE_KEY_DISPLAY_MODE = 'pw-chat-display-mode';

class ChatMode {
  /**
   * @param {Object} [options]
   * @param {string} [options.defaultDisplayMode='sidebar'] — 默认显示方式
   * @param {number} [options.maxContextLength=500] — 页面摘要最大截取长度
   * @param {string} [options.chatPromptPrefix=''] — 自定义提问前缀
   * @param {Object} [options.storage] — 存储接口（chrome.storage.sync 的 mock）
   */
  constructor(options = {}) {
    /** @type {boolean} Chat 模式是否打开 */
    this._open = false;
    /** @type {string} 当前显示方式 */
    this._displayMode = options.defaultDisplayMode || DISPLAY_SIDEBAR;
    /** @type {string|null} 浮窗 DOM */
    this._floatingEl = null;
    /** @type {number} 页面摘要最大长度 */
    this._maxContextLength = options.maxContextLength ?? 500;
    /** @type {string} 提问前缀 */
    this._chatPromptPrefix = options.chatPromptPrefix || '';
    /** @type {Object|null} 存储接口 */
    this._storage = options.storage || null;
    /** @type {Object|null} 当前页面上下文 */
    this._pageContext = null;
    /** @type {string} 用户输入文本 */
    this._userInput = '';

    // 绑定事件回调
    this._boundKeyDown = this._handleKeyDown.bind(this);
  }

  // ==================== 常量 ====================

  /** @returns {string} */
  static get DISPLAY_FLOATING() { return DISPLAY_FLOATING; }
  /** @returns {string} */
  static get DISPLAY_SIDEBAR() { return DISPLAY_SIDEBAR; }

  // ==================== 生命周期 ====================

  /**
   * 打开 Chat 模式
   * @param {Object} [pageContext] — 页面上下文 { title, url, summary }
   */
  async open(pageContext) {
    if (this._open) return;
    this._open = true;

    if (pageContext) {
      this._pageContext = pageContext;
    }

    // 从存储恢复上次的显示方式
    await this._restoreDisplayMode();

    this._registerEvents();

    // 根据显示模式渲染
    if (this._displayMode === DISPLAY_FLOATING) {
      this._createFloatingPanel();
    }

    // 通知 background
    this._emitOpen();
  }

  /**
   * 关闭 Chat 模式
   */
  close() {
    if (!this._open) return;
    this._open = false;
    this._unregisterEvents();
    this._destroyFloatingPanel();
    this._emitClose();
  }

  /**
   * 切换显示方式（浮窗 ↔ 侧边栏）
   * @returns {string} 切换后的显示模式
   */
  async toggleDisplayMode() {
    this._displayMode =
      this._displayMode === DISPLAY_FLOATING ? DISPLAY_SIDEBAR : DISPLAY_FLOATING;

    // 持久化用户选择
    await this._saveDisplayMode();

    // 如果当前正在打开中，重新渲染
    if (this._open) {
      if (this._displayMode === DISPLAY_FLOATING) {
        this._createFloatingPanel();
      } else {
        this._destroyFloatingPanel();
      }
    }

    return this._displayMode;
  }

  /**
   * 查询 Chat 模式是否打开
   * @returns {boolean}
   */
  isOpen() {
    return this._open;
  }

  /**
   * 获取当前显示模式
   * @returns {string}
   */
  getDisplayMode() {
    return this._displayMode;
  }

  /**
   * 获取当前页面上下文
   * @returns {Object|null}
   */
  getPageContext() {
    return this._pageContext;
  }

  /**
   * 设置页面上下文
   * @param {Object} ctx — { title, url, summary }
   */
  setPageContext(ctx) {
    this._pageContext = ctx;
  }

  /**
   * 构建自动填充的 prompt 文本（页面上下文 + 用户提问前缀）
   * @returns {string}
   */
  buildContextPrompt() {
    const ctx = this._pageContext;
    if (!ctx) return this._chatPromptPrefix || '';

    const parts = [];
    if (ctx.title) parts.push(`页面标题：${ctx.title}`);
    if (ctx.url) parts.push(`页面链接：${ctx.url}`);
    if (ctx.summary) {
      const truncated = ctx.summary.length > this._maxContextLength
        ? ctx.summary.slice(0, this._maxContextLength) + '...'
        : ctx.summary;
      parts.push(`页面摘要：${truncated}`);
    }

    const contextText = parts.length > 0
      ? `[页面上下文]\n${parts.join('\n')}\n\n`
      : '';

    return contextText + (this._chatPromptPrefix || '');
  }

  /**
   * 销毁实例，清理所有资源
   */
  destroy() {
    this.close();
    this._floatingEl = null;
    this._pageContext = null;
    this._storage = null;
  }

  // ==================== 事件处理 ====================

  /**
   * @private 注册键盘事件监听
   */
  _registerEvents() {
    document.addEventListener('keydown', this._boundKeyDown, { passive: false });
  }

  /**
   * @private 注销键盘事件监听
   */
  _unregisterEvents() {
    document.removeEventListener('keydown', this._boundKeyDown);
  }

  /**
   * @private 键盘事件处理
   * - Ctrl+K / Cmd+K: 打开 Chat 模式
   * - Esc: 关闭 Chat 模式
   * @param {KeyboardEvent} e
   */
  _handleKeyDown(e) {
    // Esc 关闭 Chat 模式
    if (e.key === 'Escape' && this._open) {
      e.preventDefault();
      this.close();
      return;
    }

    // Ctrl+K / Cmd+K 打开 Chat
    if (e.key === 'k' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (!this._open) {
        this.open(this._pageContext);
      }
    }
  }

  // ==================== 浮窗面板 ====================

  /**
   * @private 创建浮窗 Chat 面板
   */
  _createFloatingPanel() {
    this._destroyFloatingPanel();

    const el = document.createElement('div');
    el.className = 'pw-chat-floating-panel';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Chat 模式');

    // 标题栏
    const header = document.createElement('div');
    header.className = 'pw-chat-header';
    header.textContent = '💬 Chat';

    // 切换按钮
    const switchBtn = document.createElement('button');
    switchBtn.className = 'pw-chat-switch-btn';
    switchBtn.textContent = '📋 侧边栏';
    switchBtn.addEventListener('click', () => this.toggleDisplayMode());
    header.appendChild(switchBtn);

    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pw-chat-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);

    el.appendChild(header);

    // 页面上下文预览
    const ctx = this._pageContext;
    if (ctx && (ctx.title || ctx.url)) {
      const ctxPreview = document.createElement('div');
      ctxPreview.className = 'pw-chat-context-preview';
      ctxPreview.textContent = `📄 ${ctx.title || ctx.url}`;
      el.appendChild(ctxPreview);
    }

    // 输入区域
    const inputArea = document.createElement('textarea');
    inputArea.className = 'pw-chat-input';
    inputArea.placeholder = '输入你的问题…';
    inputArea.rows = 3;
    el.appendChild(inputArea);

    // 发送按钮
    const sendBtn = document.createElement('button');
    sendBtn.className = 'pw-chat-send-btn';
    sendBtn.textContent = '发送';
    sendBtn.addEventListener('click', () => {
      this._userInput = inputArea.value;
      this._emitSend();
    });
    el.appendChild(sendBtn);

    document.body.appendChild(el);
    this._floatingEl = el;

    // 动画
    requestAnimationFrame(() => {
      if (this._floatingEl) {
        this._floatingEl.classList.add('pw-chat-floating-panel--visible');
      }
    });

    // 聚焦输入框
    setTimeout(() => inputArea.focus(), 100);
  }

  /**
   * @private 销毁浮窗面板
   */
  _destroyFloatingPanel() {
    if (!this._floatingEl) return;

    const el = this._floatingEl;
    el.classList.remove('pw-chat-floating-panel--visible');
    el.classList.add('pw-chat-floating-panel--hiding');

    const cleanup = () => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    };

    el.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, 200);

    this._floatingEl = null;
  }

  // ==================== 存储 ====================

  /**
   * @private 保存显示方式到存储
   */
  async _saveDisplayMode() {
    if (!this._storage) return;
    try {
      await this._storage.set({ [STORAGE_KEY_DISPLAY_MODE]: this._displayMode });
    } catch (_e) {
      // 静默失败
    }
  }

  /**
   * @private 从存储恢复显示方式
   */
  async _restoreDisplayMode() {
    if (!this._storage) return;
    try {
      const result = await this._storage.get(STORAGE_KEY_DISPLAY_MODE);
      if (result && result[STORAGE_KEY_DISPLAY_MODE]) {
        this._displayMode = result[STORAGE_KEY_DISPLAY_MODE];
      }
    } catch (_e) {
      // 静默失败
    }
  }

  // ==================== 消息发送 ====================

  /**
   * @private 通知 background Chat 模式已打开
   */
  _emitOpen() {
    const message = {
      action: 'openChat',
      displayMode: this._displayMode,
      pageContext: this._pageContext,
      timestamp: Date.now()
    };

    try {
      chrome.runtime.sendMessage(message);
    } catch (_e) {
      // chrome.runtime 不可用时静默失败
    }
  }

  /**
   * @private 通知 background Chat 模式已关闭
   */
  _emitClose() {
    try {
      chrome.runtime.sendMessage({
        action: 'closeChat',
        timestamp: Date.now()
      });
    } catch (_e) {
      // chrome.runtime 不可用时静默失败
    }
  }

  /**
   * @private 通知 background 发送用户输入
   */
  _emitSend() {
    try {
      chrome.runtime.sendMessage({
        action: 'chatSend',
        text: this._userInput,
        pageContext: this._pageContext,
        timestamp: Date.now()
      });
    } catch (_e) {
      // chrome.runtime 不可用时静默失败
    }
  }
}

// 导出: 支持 ES Module
export { ChatMode, DISPLAY_FLOATING, DISPLAY_SIDEBAR, STORAGE_KEY_DISPLAY_MODE };
export default ChatMode;
