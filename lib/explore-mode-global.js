/**
 * ExploreMode — Non-module version for content scripts
 * Original: lib/explore-mode.js (ES Module)
 * This file registers ExploreMode as a global for IIFE content scripts.
 */
(function() {
'use strict';

class ExploreMode {
  constructor(options = {}) {
    this._active = false;
    this._indicatorEl = null;
    this._debounceMs = options.debounceMs ?? 300;
    this._minSelectionLength = options.minSelectionLength ?? 2;
    this._indicatorText = options.indicatorText ?? '🔍 探索模式';
    this._debounceTimer = null;
    this._lastExplainedText = '';
    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundMouseUp = this._handleMouseUp.bind(this);
  }

  enable() {
    if (this._active) return;
    this._active = true;
    this._lastExplainedText = '';
    this._createIndicator();
    this._registerEvents();
    this._emitStateChange();
  }

  disable() {
    if (!this._active) return;
    this._active = false;
    this._lastExplainedText = '';
    this._removeIndicator();
    this._unregisterEvents();
    this._clearDebounce();
    this._emitStateChange();
  }

  toggle() { this._active ? this.disable() : this.enable(); }
  isActive() { return this._active; }
  destroy() { this.disable(); this._indicatorEl = null; }

  _registerEvents() {
    document.addEventListener('keydown', this._boundKeyDown, { passive: false });
    document.addEventListener('mouseup', this._boundMouseUp, { passive: true });
  }

  _unregisterEvents() {
    document.removeEventListener('keydown', this._boundKeyDown);
    document.removeEventListener('mouseup', this._boundMouseUp);
  }

  _handleKeyDown(e) {
    if (e.key === 'Escape' && this._active) { e.preventDefault(); this.disable(); return; }
    if (e.key === 'j' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) { e.preventDefault(); this.toggle(); }
  }

  _handleMouseUp(_e) {
    if (!this._active) return;
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

  _clearDebounce() {
    if (this._debounceTimer !== null) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
  }

  _autoExplain(text) {
    if (!text) return;
    try {
      chrome.runtime.sendMessage({
        action: 'exploreExplain', selection: text, source: 'exploreMode',
        url: typeof location !== 'undefined' ? location.href : '', timestamp: Date.now()
      });
    } catch (_e) {}
  }

  _createIndicator() {
    if (this._indicatorEl) return;
    const el = document.createElement('div');
    el.className = 'pw-explore-mode-indicator';
    el.textContent = this._indicatorText;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.addEventListener('click', () => this.disable());
    document.body.appendChild(el);
    this._indicatorEl = el;
    requestAnimationFrame(() => {
      if (this._indicatorEl) this._indicatorEl.classList.add('pw-explore-mode-indicator--visible');
    });
  }

  _removeIndicator() {
    if (!this._indicatorEl) return;
    const el = this._indicatorEl;
    el.classList.remove('pw-explore-mode-indicator--visible');
    el.classList.add('pw-explore-mode-indicator--hiding');
    const cleanup = () => { if (el.parentNode) el.parentNode.removeChild(el); };
    el.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, 200);
    this._indicatorEl = null;
  }

  _emitStateChange() {
    try {
      chrome.runtime.sendMessage({ action: 'exploreModeStateChange', active: this._active, timestamp: Date.now() });
    } catch (_e) {}
  }
}

globalThis.ExploreMode = ExploreMode;
})();
