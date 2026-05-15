/**
 * SelectionToolbar — 划线浮动快捷操作栏
 * 参考 Kimi 浏览器助手的划线浮动按钮设计
 *
 * 当用户选中文本时，在选区附近显示浮动工具栏，
 * 提供 解释/翻译/总结/问AI 四个快捷操作。
 */

'use strict';

class SelectionToolbar {
  constructor(options = {}) {
    /** @type {HTMLElement|null} 工具栏容器 DOM */
    this._toolbarEl = null;
    /** @type {boolean} 工具栏是否已显示 */
    this._visible = false;
    /** @type {string|null} 当前选中的文本 */
    this._currentText = '';
    /** @type {number} mouseup 延迟（ms），等待 Selection 完成 */
    this._delay = options.delay || 200;
    /** @type {number} 工具栏距选区的垂直偏移 */
    this._offsetY = options.offsetY || 10;
    /** @type {number} 边界安全距离 */
    this._edgeMargin = options.edgeMargin || 8;
    /** @type {Function|null} */
    this._onMouseDown = null;
    /** @type {Function|null} */
    this._onMouseUp = null;
    /** @type {number|null} */
    this._mouseUpTimer = null;

    // 绑定事件回调以便 removeEventListener
    this._boundMouseUp = this._handleMouseUp.bind(this);
    this._boundMouseDown = this._handleMouseDown.bind(this);

    // 快捷操作定义
    this._actions = [
      { id: 'explain',    label: '📖 解释',  action: 'selectionExplain' },
      { id: 'translate',  label: '🌐 翻译',  action: 'selectionTranslate' },
      { id: 'summarize',  label: '📝 总结',  action: 'selectionSummarize' },
      { id: 'askAI',      label: '🤖 问AI',  action: 'selectionAskAI' },
    ];
  }

  // ==================== 生命周期 ====================

  /**
   * 开始监听选区事件
   */
  listenForSelection() {
    document.addEventListener('mouseup', this._boundMouseUp, { passive: true });
    document.addEventListener('mousedown', this._boundMouseDown, { passive: true });
  }

  /**
   * 停止监听并移除工具栏
   */
  destroy() {
    document.removeEventListener('mouseup', this._boundMouseUp);
    document.removeEventListener('mousedown', this._boundMouseDown);
    this.hideToolbar();
    this._toolbarEl = null;
  }

  // ==================== 事件处理 ====================

  /** @private */
  _handleMouseUp() {
    // 清除之前的定时器
    if (this._mouseUpTimer) {
      clearTimeout(this._mouseUpTimer);
    }
    this._mouseUpTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';

      if (text.length > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        this.showToolbar(text, rect);
      } else {
        this.hideToolbar();
      }
    }, this._delay);
  }

  /** @private */
  _handleMouseDown(e) {
    // 点击工具栏自身不隐藏
    if (this._toolbarEl && this._toolbarEl.contains(e.target)) {
      return;
    }
    this.hideToolbar();
  }

  // ==================== 显示/隐藏 ====================

  /**
   * 在选区附近显示浮动工具栏
   * @param {string} text - 选中的文本
   * @param {DOMRect} rect - 选区的 bounding rect
   */
  showToolbar(text, rect) {
    if (!text) return;

    this._currentText = text;

    // 创建或复用工具栏 DOM
    if (!this._toolbarEl) {
      this._toolbarEl = this._createToolbarDOM();
    }

    // 定位: 选区上方 _offsetY 居中
    let top = rect.top - this._toolbarEl.offsetHeight - this._offsetY;
    let left = rect.left + rect.width / 2 - this._toolbarEl.offsetWidth / 2;

    // 边界检测
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = this._edgeMargin;

    // 上方超出 → 显示在选区下方
    if (top < margin) {
      top = rect.bottom + this._offsetY;
    }
    // 下方超出 → 限制在视口底部
    if (top + this._toolbarEl.offsetHeight > vh - margin) {
      top = vh - margin - this._toolbarEl.offsetHeight;
    }
    // 左侧超出
    if (left < margin) {
      left = margin;
    }
    // 右侧超出
    if (left + this._toolbarEl.offsetWidth > vw - margin) {
      left = vw - margin - this._toolbarEl.offsetWidth;
    }

    this._toolbarEl.style.top = top + 'px';
    this._toolbarEl.style.left = left + 'px';
    this._toolbarEl.style.display = 'flex';

    // 重触发动画
    this._toolbarEl.classList.remove('pagewise-toolbar--visible');
    // force reflow
    void this._toolbarEl.offsetHeight;
    this._toolbarEl.classList.add('pagewise-toolbar--visible');

    this._visible = true;
  }

  /**
   * 隐藏工具栏
   */
  hideToolbar() {
    if (this._toolbarEl) {
      this._toolbarEl.style.display = 'none';
      this._toolbarEl.classList.remove('pagewise-toolbar--visible');
    }
    this._visible = false;
    this._currentText = '';
  }

  // ==================== 状态查询 ====================

  /** @returns {boolean} */
  get visible() {
    return this._visible;
  }

  /** @returns {string} */
  get currentText() {
    return this._currentText || '';
  }

  // ==================== 操作触发 ====================

  /**
   * 执行快捷操作，通过 chrome.runtime.sendMessage 发送到 background
   * @param {string} actionId - 操作 ID: explain | translate | summarize | askAI
   */
  triggerAction(actionId) {
    const actionDef = this._actions.find(a => a.id === actionId);
    if (!actionDef) return;

    const text = this._currentText;
    if (!text) return;

    const message = {
      action: actionDef.action,
      selection: text,
      source: 'selectionToolbar',
      timestamp: Date.now()
    };

    chrome.runtime.sendMessage(message);
    this.hideToolbar();
  }

  // ==================== DOM 创建 ====================

  /**
   * 创建工具栏 DOM 结构
   * @returns {HTMLElement}
   * @private
   */
  _createToolbarDOM() {
    const toolbar = document.createElement('div');
    toolbar.className = 'pagewise-toolbar';
    toolbar.style.display = 'none';

    for (const actionDef of this._actions) {
      const btn = document.createElement('button');
      btn.className = 'pagewise-toolbar-btn';
      btn.dataset.action = actionDef.id;
      btn.textContent = actionDef.label;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.triggerAction(actionDef.id);
      });

      toolbar.appendChild(btn);
    }

    document.body.appendChild(toolbar);
    return toolbar;
  }
}

// 导出: 支持 ES Module
export { SelectionToolbar };
export default SelectionToolbar;
