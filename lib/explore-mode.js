/**
 * ExploreMode — Explore 快捷模式
 *
 * 参考 Kimi 浏览器助手的探索模式设计：
 * - Ctrl+J 快捷键切换探索模式
 * - 探索模式下选中文本自动触发解释
 * - 右下角浮标状态指示器
 * - Esc 退出探索模式
 */

'use strict';

class ExploreMode {
  /**
   * @param {Object} [options]
   * @param {number} [options.debounceMs=300] — 自动解释防抖延迟（ms）
   * @param {number} [options.minSelectionLength=2] — 最小选中文本长度
   * @param {string} [options.indicatorText='🔍 探索模式'] — 状态指示器文本
   */
  constructor(options = {}) {
    /** @type {boolean} 探索模式是否激活 */
    this._active = false;
    /** @type {HTMLElement|null} 状态指示器 DOM */
    this._indicatorEl = null;
    /** @type {number} 防抖延迟 */
    this._debounceMs = options.debounceMs ?? 300;
    /** @type {number} 最小选中文本长度 */
    this._minSelectionLength = options.minSelectionLength ?? 2;
    /** @type {string} 状态指示器文本 */
    this._indicatorText = options.indicatorText ?? '🔍 探索模式';
    /** @type {number|null} 防抖定时器 */
    this._debounceTimer = null;
    /** @type {string} 上一次触发解释的文本（避免重复触发） */
    this._lastExplainedText = '';

    // 绑定事件回调以便 addEventListener / removeEventListener
    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundMouseUp = this._handleMouseUp.bind(this);
  }

  // ==================== 生命周期 ====================

  /**
   * 启用探索模式
   * 创建状态指示器，注册键盘和鼠标事件监听
   */
  enable() {
    if (this._active) return;
    this._active = true;
    this._lastExplainedText = '';
    this._createIndicator();
    this._registerEvents();
    this._emitStateChange();
  }

  /**
   * 禁用探索模式
   * 移除状态指示器，注销事件监听
   */
  disable() {
    if (!this._active) return;
    this._active = false;
    this._lastExplainedText = '';
    this._removeIndicator();
    this._unregisterEvents();
    this._clearDebounce();
    this._emitStateChange();
  }

  /**
   * 切换探索模式
   */
  toggle() {
    if (this._active) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * 查询探索模式是否激活
   * @returns {boolean}
   */
  isActive() {
    return this._active;
  }

  /**
   * 销毁实例，移除所有事件和 DOM
   */
  destroy() {
    this.disable();
    this._indicatorEl = null;
  }

  // ==================== 事件处理 ====================

  /**
   * @private 注册全局事件监听
   */
  _registerEvents() {
    document.addEventListener('keydown', this._boundKeyDown, { passive: false });
    document.addEventListener('mouseup', this._boundMouseUp, { passive: true });
  }

  /**
   * @private 注销全局事件监听
   */
  _unregisterEvents() {
    document.removeEventListener('keydown', this._boundKeyDown);
    document.removeEventListener('mouseup', this._boundMouseUp);
  }

  /**
   * @private 键盘事件处理
   * - Ctrl+J / Cmd+J: 切换探索模式（由外部快捷键系统处理，此处作为兜底）
   * - Esc: 退出探索模式
   * @param {KeyboardEvent} e
   */
  _handleKeyDown(e) {
    // Esc 退出探索模式
    if (e.key === 'Escape' && this._active) {
      e.preventDefault();
      this.disable();
      return;
    }

    // Ctrl+J / Cmd+J 切换（兜底，content.js 中也有监听）
    if (e.key === 'j' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      this.toggle();
    }
  }

  /**
   * @private 鼠标松开事件处理
   * 探索模式下，选中文本后自动触发解释
   * @param {MouseEvent} _e
   */
  _handleMouseUp(_e) {
    if (!this._active) return;

    // 清除之前的防抖
    this._clearDebounce();

    this._debounceTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';

      if (text.length >= this._minSelectionLength && text !== this._lastExplainedText) {
        this._lastExplainedText = text;
        this._autoExplain(text);
      }
    }, this._debounceMs);
  }

  /**
   * @private 清除防抖定时器
   */
  _clearDebounce() {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  // ==================== 自动解释 ====================

  /**
   * @private 自动触发解释：向 background 发送消息
   * @param {string} text — 选中的文本
   */
  _autoExplain(text) {
    if (!text) return;

    const message = {
      action: 'exploreExplain',
      selection: text,
      source: 'exploreMode',
      url: typeof location !== 'undefined' ? location.href : '',
      timestamp: Date.now()
    };

    try {
      chrome.runtime.sendMessage(message);
    } catch (_e) {
      // chrome.runtime 不可用时静默失败（测试环境等）
    }
  }

  // ==================== 状态指示器 ====================

  /**
   * @private 创建右下角浮动状态指示器
   */
  _createIndicator() {
    if (this._indicatorEl) return;

    const el = document.createElement('div');
    el.className = 'pw-explore-mode-indicator';
    el.textContent = this._indicatorText;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', '探索模式已开启');

    // 点击指示器也可以退出探索模式
    el.addEventListener('click', () => {
      this.disable();
    });

    document.body.appendChild(el);
    this._indicatorEl = el;

    // 触发动画：下一帧添加 visible 类
    requestAnimationFrame(() => {
      if (this._indicatorEl) {
        this._indicatorEl.classList.add('pw-explore-mode-indicator--visible');
      }
    });
  }

  /**
   * @private 移除状态指示器
   */
  _removeIndicator() {
    if (!this._indicatorEl) return;

    const el = this._indicatorEl;
    el.classList.remove('pw-explore-mode-indicator--visible');
    el.classList.add('pw-explore-mode-indicator--hiding');

    // 动画结束后移除 DOM
    const cleanup = () => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    };

    el.addEventListener('transitionend', cleanup, { once: true });
    // 兜底：200ms 后强制移除
    setTimeout(cleanup, 200);

    this._indicatorEl = null;
  }

  // ==================== 状态变更事件 ====================

  /**
   * @private 发送状态变更消息到 background
   */
  _emitStateChange() {
    try {
      chrome.runtime.sendMessage({
        action: 'exploreModeStateChange',
        active: this._active,
        timestamp: Date.now()
      });
    } catch (_e) {
      // chrome.runtime 不可用时静默失败
    }
  }
}

// 导出: 支持 ES Module
export { ExploreMode };
export default ExploreMode;

// Global registration for non-module contexts (e.g., content scripts loaded via manifest)
if (typeof globalThis !== 'undefined') {
  globalThis.ExploreMode = ExploreMode;
}
