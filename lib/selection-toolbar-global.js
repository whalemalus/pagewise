/**
 * SelectionToolbar — Non-module version for content scripts
 * Original: lib/selection-toolbar.js (ES Module)
 * This file registers SelectionToolbar as a global for IIFE content scripts.
 * Depends on: selection-detector-global.js, selection-handler-global.js (loaded before this)
 */
(function() {
'use strict';

class SelectionToolbar {
  constructor(options = {}) {
    this._toolbarEl = null;
    this._visible = false;
    this._currentText = '';
    this._currentType = null;
    this._currentMeta = null;
    this._delay = options.delay || 200;
    this._offsetY = options.offsetY || 10;
    this._edgeMargin = options.edgeMargin || 8;
    this._onMouseDown = null;
    this._onMouseUp = null;
    this._mouseUpTimer = null;

    this._detector = options.detector || new SelectionDetector();
    this._handler = options.handler || new SelectionHandler(options.handlerOptions || {});

    this._boundMouseUp = this._handleMouseUp.bind(this);
    this._boundMouseDown = this._handleMouseDown.bind(this);

    this._baseActions = [
      { id: 'explain',    label: '📖 解释',  action: 'selectionExplain' },
      { id: 'translate',  label: '🌐 翻译',  action: 'selectionTranslate' },
      { id: 'summarize',  label: '📝 总结',  action: 'selectionSummarize' },
      { id: 'askAI',      label: '🤖 问AI',  action: 'selectionAskAI' },
    ];

    this._typeActions = {
      code:    [{ id: 'explainCode',   label: '💡 解释代码',  action: 'selectionExplainCode' }],
      url:     [{ id: 'previewURL',    label: '🔗 预览链接',  action: 'selectionPreviewURL' }],
      error:   [{ id: 'searchError',   label: '🔍 搜索方案',  action: 'selectionSearchError' }],
      math:    [{ id: 'calculateMath', label: '🔢 计算',      action: 'selectionCalculateMath' }],
      english: [{ id: 'translateEN',   label: '🌐 翻译英文',  action: 'selectionTranslateEN' }],
    };

    this._actions = [...this._baseActions];
  }

  listenForSelection() {
    document.addEventListener('mouseup', this._boundMouseUp, { passive: true });
    document.addEventListener('mousedown', this._boundMouseDown, { passive: true });
  }

  destroy() {
    document.removeEventListener('mouseup', this._boundMouseUp);
    document.removeEventListener('mousedown', this._boundMouseDown);
    this.hideToolbar();
    this._toolbarEl = null;
  }

  _handleMouseUp() {
    if (this._mouseUpTimer) clearTimeout(this._mouseUpTimer);
    this._mouseUpTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text.length > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const detection = this._detector.detectType(text);
        this.showToolbar(text, rect, detection);
      } else {
        this.hideToolbar();
      }
    }, this._delay);
  }

  _handleMouseDown(e) {
    if (this._toolbarEl && this._toolbarEl.contains(e.target)) return;
    this.hideToolbar();
  }

  showToolbar(text, rect, detection) {
    if (!text) return;
    this._currentText = text;
    this._currentType = detection?.type || null;
    this._currentMeta = detection || null;
    this._updateActions(this._currentType);

    if (!this._toolbarEl) {
      this._toolbarEl = this._createToolbarDOM();
    } else {
      this._rebuildButtons();
    }

    let top = rect.top - this._toolbarEl.offsetHeight - this._offsetY;
    let left = rect.left + rect.width / 2 - this._toolbarEl.offsetWidth / 2;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = this._edgeMargin;

    if (top < margin) top = rect.bottom + this._offsetY;
    if (top + this._toolbarEl.offsetHeight > vh - margin) top = vh - margin - this._toolbarEl.offsetHeight;
    if (left < margin) left = margin;
    if (left + this._toolbarEl.offsetWidth > vw - margin) left = vw - margin - this._toolbarEl.offsetWidth;

    this._toolbarEl.style.top = top + 'px';
    this._toolbarEl.style.left = left + 'px';
    this._toolbarEl.style.display = 'flex';

    this._toolbarEl.classList.remove('pagewise-toolbar--visible');
    void this._toolbarEl.offsetHeight;
    this._toolbarEl.classList.add('pagewise-toolbar--visible');
    this._visible = true;
  }

  hideToolbar() {
    if (this._toolbarEl) {
      this._toolbarEl.style.display = 'none';
      this._toolbarEl.classList.remove('pagewise-toolbar--visible');
    }
    this._visible = false;
    this._currentText = '';
    this._currentType = null;
    this._currentMeta = null;
  }

  get visible() { return this._visible; }
  get currentText() { return this._currentText || ''; }
  get currentType() { return this._currentType; }
  get currentMeta() { return this._currentMeta; }
  get detector() { return this._detector; }
  get handler() { return this._handler; }

  triggerAction(actionId) {
    const actionDef = this._actions.find(a => a.id === actionId);
    if (!actionDef) return;
    const text = this._currentText;
    if (!text) return;

    if (this._typeActions[this._currentType]?.some(a => a.id === actionId)) {
      this._handler.handleSelection(text, this._currentType, this._currentMeta || {});
    }

    const message = {
      action: actionDef.action,
      selection: text,
      type: this._currentType,
      source: 'selectionToolbar',
      timestamp: Date.now()
    };

    chrome.runtime.sendMessage(message);
    this.hideToolbar();
  }

  _updateActions(type) {
    this._actions = [...this._baseActions];
    if (type && this._typeActions[type]) {
      this._actions = [...this._typeActions[type], ...this._baseActions];
    }
  }

  _rebuildButtons() {
    if (!this._toolbarEl) return;
    while (this._toolbarEl.firstChild) {
      this._toolbarEl.removeChild(this._toolbarEl.firstChild);
    }
    for (const actionDef of this._actions) {
      const btn = this._createButton(actionDef);
      this._toolbarEl.appendChild(btn);
    }
  }

  _createButton(actionDef) {
    const btn = document.createElement('button');
    btn.className = 'pagewise-toolbar-btn';
    btn.dataset.action = actionDef.id;
    btn.textContent = actionDef.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.triggerAction(actionDef.id);
    });
    return btn;
  }

  _createToolbarDOM() {
    const toolbar = document.createElement('div');
    toolbar.className = 'pagewise-toolbar';
    toolbar.style.display = 'none';
    for (const actionDef of this._actions) {
      const btn = this._createButton(actionDef);
      toolbar.appendChild(btn);
    }
    document.body.appendChild(toolbar);
    return toolbar;
  }
}

globalThis.SelectionToolbar = SelectionToolbar;
})();
