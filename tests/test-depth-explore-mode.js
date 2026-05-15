/**
 * test-depth-explore-mode.js — ExploreMode 深度测试
 *
 * 测试范围:
 *   启用/禁用       — enable/disable 生命周期、重复调用幂等
 *   toggle          — toggle 切换状态
 *   isActive        — 查询激活状态
 *   destroy         — 完整资源清理
 *   事件触发        — 键盘事件(Esc / Ctrl+J)、鼠标选中文本
 *   状态指示器      — 指示器创建/移除
 *   防抖机制        — debounceMs 防抖、最小选中长度
 *   消息发送        — exploreExplain / exploreModeStateChange
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ==================== DOM / Chrome Mock ====================

class MockElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.textContent = '';
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this._eventListeners = {};
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  addEventListener(evt, fn, opts) {
    if (!this._eventListeners[evt]) this._eventListeners[evt] = [];
    this._eventListeners[evt].push({ fn, opts });
  }
  removeEventListener(evt, fn) {
    if (!this._eventListeners[evt]) return;
    this._eventListeners[evt] = this._eventListeners[evt].filter(e => e.fn !== fn);
  }
  get classList() {
    return {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
    };
  }
}

function installMocks() {
  globalThis.document = {
    _listeners: [],
    createElement: (tag) => new MockElement(tag),
    body: {
      appendChild(el) { return el; },
      removeChild(el) { return el; },
    },
    addEventListener(evt, fn, opts) {
      this._listeners.push({ evt, fn, opts });
    },
    removeEventListener(evt, fn) {
      this._listeners = this._listeners.filter(l => l.fn !== fn);
    },
  };
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.chrome = {
    runtime: {
      _messages: [],
      sendMessage(msg) { this._messages.push(msg); },
    },
  };
  globalThis.location = { href: 'https://test.example.com/page' };
  globalThis.window = {
    _selectionText: '',
    getSelection() {
      return { toString: () => this._selectionText };
    },
  };
}

function teardownMocks() {
  delete globalThis.document;
  delete globalThis.requestAnimationFrame;
  delete globalThis.chrome;
  delete globalThis.location;
  delete globalThis.window;
}

function sentMessages() {
  return chrome.runtime._messages;
}

function getDocumentListeners() {
  return document._listeners;
}

// ==================== 导入被测模块 ====================

const { ExploreMode } = await import('../lib/explore-mode.js');

// ==================== 测试 ====================

describe('ExploreMode', () => {
  beforeEach(() => {
    installMocks();
  });

  afterEach(() => {
    teardownMocks();
  });

  // ─── 1. 构造器默认值 ─────────────────────────────────────────────────

  it('1. 构造器 — 默认值正确', () => {
    const em = new ExploreMode();
    assert.equal(em.isActive(), false);
    assert.equal(em._debounceMs, 300);
    assert.equal(em._minSelectionLength, 2);
    assert.equal(em._indicatorText, '🔍 探索模式');
  });

  // ─── 2. 构造器自定义参数 ─────────────────────────────────────────────

  it('2. 构造器 — 自定义 options 生效', () => {
    const em = new ExploreMode({
      debounceMs: 500,
      minSelectionLength: 5,
      indicatorText: 'Custom',
    });
    assert.equal(em._debounceMs, 500);
    assert.equal(em._minSelectionLength, 5);
    assert.equal(em._indicatorText, 'Custom');
  });

  // ─── 3. enable — 激活状态 + 事件注册 + 消息发送 ──────────────────────

  it('3. enable — 设置 active=true，注册事件并发送状态变更消息', () => {
    const em = new ExploreMode();
    em.enable();
    assert.equal(em.isActive(), true);

    // 应注册了 keydown 和 mouseup 监听
    const listeners = getDocumentListeners();
    const keydown = listeners.find(l => l.evt === 'keydown');
    const mouseup = listeners.find(l => l.evt === 'mouseup');
    assert.ok(keydown, '应注册 keydown 监听');
    assert.ok(mouseup, '应注册 mouseup 监听');

    // 应发送了 exploreModeStateChange 消息
    const stateMsg = sentMessages().find(m => m.action === 'exploreModeStateChange');
    assert.ok(stateMsg, '应发送 exploreModeStateChange');
    assert.equal(stateMsg.active, true);
  });

  // ─── 4. enable — 幂等性 ──────────────────────────────────────────────

  it('4. enable — 幂等：重复调用不重复激活', () => {
    const em = new ExploreMode();
    em.enable();
    const msgs1 = sentMessages().length;
    em.enable(); // 应被忽略
    assert.equal(em.isActive(), true);
    assert.equal(sentMessages().length, msgs1); // 不应多发消息
  });

  // ─── 5. disable — 禁用状态 + 事件注销 ────────────────────────────────

  it('5. disable — 设置 active=false，注销事件并发送状态变更消息', () => {
    const em = new ExploreMode();
    em.enable();
    em.disable();
    assert.equal(em.isActive(), false);

    const stateMsgs = sentMessages().filter(m => m.action === 'exploreModeStateChange');
    const disableMsg = stateMsgs.find(m => m.active === false);
    assert.ok(disableMsg, '应发送 active=false 的状态变更消息');
  });

  // ─── 6. disable — 幂等性 ─────────────────────────────────────────────

  it('6. disable — 未激活时调用无副作用', () => {
    const em = new ExploreMode();
    em.disable(); // 不应抛出
    assert.equal(em.isActive(), false);
    assert.equal(sentMessages().length, 0);
  });

  // ─── 7. toggle — 双向切换 ────────────────────────────────────────────

  it('7. toggle — enable ↔ disable 正确切换', () => {
    const em = new ExploreMode();
    assert.equal(em.isActive(), false);

    em.toggle();
    assert.equal(em.isActive(), true);

    em.toggle();
    assert.equal(em.isActive(), false);

    em.toggle();
    assert.equal(em.isActive(), true);
  });

  // ─── 8. isActive — 状态查询一致性 ────────────────────────────────────

  it('8. isActive — 在各生命周期阶段返回正确状态', () => {
    const em = new ExploreMode();
    assert.equal(em.isActive(), false);

    em.enable();
    assert.equal(em.isActive(), true);

    em.disable();
    assert.equal(em.isActive(), false);
  });

  // ─── 9. destroy — 完整清理 ───────────────────────────────────────────

  it('9. destroy — 清理所有资源', () => {
    const em = new ExploreMode();
    em.enable();
    em.destroy();
    assert.equal(em.isActive(), false);
    assert.equal(em._indicatorEl, null);
  });

  // ─── 10. 键盘事件 — Esc 退出探索模式 ─────────────────────────────────

  it('10. 键盘事件 — Esc 键退出探索模式', () => {
    const em = new ExploreMode();
    em.enable();
    assert.equal(em.isActive(), true);

    // 模拟 Esc 键盘事件
    const listener = getDocumentListeners().find(l => l.evt === 'keydown');
    const fakeEvent = { key: 'Escape', preventDefault() {} };
    listener.fn(fakeEvent);

    assert.equal(em.isActive(), false);
  });

  // ─── 11. 键盘事件 — Ctrl+J 切换探索模式 ─────────────────────────────

  it('11. 键盘事件 — Ctrl+J 切换探索模式（先 enable 注册监听）', () => {
    const em = new ExploreMode();
    em.enable(); // 先注册 keydown 监听
    assert.equal(em.isActive(), true);

    const listener = getDocumentListeners().find(l => l.evt === 'keydown');
    // Ctrl+J → toggle → disable
    const fakeEvent = { key: 'j', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, preventDefault() {} };
    listener.fn(fakeEvent);
    assert.equal(em.isActive(), false);

    // 重新 enable 后再 Ctrl+J → toggle → disable
    em.enable();
    const listener2 = getDocumentListeners().find(l => l.evt === 'keydown');
    listener2.fn(fakeEvent);
    assert.equal(em.isActive(), false);
  });

  // ─── 12. 键盘事件 — Cmd+J 切换探索模式 ──────────────────────────────

  it('12. 键盘事件 — Cmd+J (metaKey) 切换探索模式', () => {
    const em = new ExploreMode();
    em.enable(); // 先注册 keydown 监听
    assert.equal(em.isActive(), true);

    const listener = getDocumentListeners().find(l => l.evt === 'keydown');
    const fakeEvent = { key: 'j', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false, preventDefault() {} };
    listener.fn(fakeEvent);
    assert.equal(em.isActive(), false); // toggle → disable
  });

  // ─── 13. 鼠标选中文本 — 自动触发解释消息 ─────────────────────────────

  it('13. 鼠标选中文本 — 选中文本长度 ≥ minSelectionLength 触发 exploreExplain', (_, done) => {
    const em = new ExploreMode({ debounceMs: 50, minSelectionLength: 2 });
    em.enable();

    // 模拟选中文本
    window._selectionText = 'Hello World';

    const mouseupListener = getDocumentListeners().find(l => l.evt === 'mouseup');
    mouseupListener.fn({});

    // 等待防抖定时器触发
    setTimeout(() => {
      const explainMsg = sentMessages().find(m => m.action === 'exploreExplain');
      assert.ok(explainMsg, '应发送 exploreExplain 消息');
      assert.equal(explainMsg.selection, 'Hello World');
      assert.equal(explainMsg.source, 'exploreMode');
      assert.equal(explainMsg.url, 'https://test.example.com/page');
      assert.ok(typeof explainMsg.timestamp === 'number');
      done();
    }, 80);
  });

  // ─── 14. 防抖机制 — 选中文本太短不触发 ───────────────────────────────

  it('14. 选中文本长度 < minSelectionLength 不触发 exploreExplain', (_, done) => {
    const em = new ExploreMode({ debounceMs: 50, minSelectionLength: 5 });
    em.enable();

    window._selectionText = 'Hi'; // 只有 2 字符 < 5

    const mouseupListener = getDocumentListeners().find(l => l.evt === 'mouseup');
    mouseupListener.fn({});

    setTimeout(() => {
      const explainMsg = sentMessages().find(m => m.action === 'exploreExplain');
      assert.equal(explainMsg, undefined, '不应发送 exploreExplain 消息');
      done();
    }, 80);
  });

  // ─── 15. 状态指示器 — 创建和移除 DOM 元素 ────────────────────────────

  it('15. 状态指示器 — enable 创建指示器，disable 移除指示器', () => {
    const em = new ExploreMode({ indicatorText: '📌 测试' });
    em.enable();
    assert.ok(em._indicatorEl, '应创建状态指示器');
    assert.equal(em._indicatorEl.className, 'pw-explore-mode-indicator');
    assert.equal(em._indicatorEl.textContent, '📌 测试');
    assert.equal(em._indicatorEl.attributes['role'], 'status');
    assert.equal(em._indicatorEl.attributes['aria-live'], 'polite');

    em.disable();
    assert.equal(em._indicatorEl, null, '应移除状态指示器');
  });
});
