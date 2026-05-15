/**
 * test-depth-chat-mode.js — ChatMode 深度测试
 *
 * 测试范围:
 *   初始化/销毁     — 构造器默认值、destroy 清理
 *   打开/关闭       — open/close 生命周期、重复调用幂等
 *   消息发送        — openChat/closeChat/chatSend 消息
 *   上下文管理      — 页面上下文设置/获取、buildContextPrompt
 *   显示模式切换    — toggleDisplayMode、存储持久化
 *   错误处理        — storage 异常静默、chrome.runtime 不可用
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ==================== DOM / Chrome Mock ====================

class MockElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.textContent = '';
    this.placeholder = '';
    this.rows = 0;
    this.value = '';
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
  remove() { /* noop */ }
  focus() {}
  get classList() {
    const self = this;
    return {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
    };
  }
}

let _rafCallback = null;

function installMocks() {
  _rafCallback = null;
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
  globalThis.requestAnimationFrame = (cb) => { _rafCallback = cb; };
  globalThis.chrome = {
    runtime: {
      _messages: [],
      sendMessage(msg) { this._messages.push(msg); },
    },
  };
}

function teardownMocks() {
  delete globalThis.document;
  delete globalThis.requestAnimationFrame;
  delete globalThis.chrome;
  _rafCallback = null;
}

// ==================== 导入被测模块 ====================

const { ChatMode, DISPLAY_FLOATING, DISPLAY_SIDEBAR, STORAGE_KEY_DISPLAY_MODE } =
  await import('../lib/chat-mode.js');

// ==================== 辅助函数 ====================

function makePageContext(overrides = {}) {
  return {
    title: 'Test Page',
    url: 'https://example.com',
    summary: 'This is a test page summary for testing purposes.',
    ...overrides,
  };
}

function makeStorage() {
  const store = {};
  return {
    async get(key) { return { [key]: store[key] }; },
    async set(obj) { Object.assign(store, obj); },
    store,
  };
}

function makeFailingStorage() {
  return {
    async get() { throw new Error('storage get failed'); },
    async set() { throw new Error('storage set failed'); },
  };
}

function sentMessages() {
  return chrome.runtime._messages;
}

// ==================== 测试 ====================

describe('ChatMode', () => {
  beforeEach(() => {
    installMocks();
  });

  afterEach(() => {
    teardownMocks();
  });

  // ─── 1. 构造器默认值 ──────────────────────────────────────────────────

  it('1. 构造器 — 默认值正确', () => {
    const cm = new ChatMode();
    assert.equal(cm.isOpen(), false);
    assert.equal(cm.getDisplayMode(), DISPLAY_SIDEBAR);
    assert.equal(cm.getPageContext(), null);
    assert.equal(cm._maxContextLength, 500);
    assert.equal(cm._chatPromptPrefix, '');
  });

  // ─── 2. 构造器自定义参数 ──────────────────────────────────────────────

  it('2. 构造器 — 自定义 options 生效', () => {
    const storage = makeStorage();
    const cm = new ChatMode({
      defaultDisplayMode: DISPLAY_FLOATING,
      maxContextLength: 200,
      chatPromptPrefix: '前缀：',
      storage,
    });
    assert.equal(cm.getDisplayMode(), DISPLAY_FLOATING);
    assert.equal(cm._maxContextLength, 200);
    assert.equal(cm._chatPromptPrefix, '前缀：');
  });

  // ─── 3. open — 激活状态 + 上下文设置 ─────────────────────────────────

  it('3. open — 设置 isOpen=true 并保存页面上下文', async () => {
    const cm = new ChatMode();
    const ctx = makePageContext();
    await cm.open(ctx);
    assert.equal(cm.isOpen(), true);
    assert.deepEqual(cm.getPageContext(), ctx);
  });

  // ─── 4. open — 幂等性（重复调用不重复打开） ──────────────────────────

  it('4. open — 幂等：重复调用不会重置状态', async () => {
    const cm = new ChatMode();
    await cm.open(makePageContext());
    const firstMessages = sentMessages().length;
    await cm.open({ title: 'overwrite' }); // 应被忽略
    assert.equal(cm.isOpen(), true);
    assert.equal(sentMessages().length, firstMessages); // 不应多发消息
    assert.equal(cm.getPageContext().title, 'Test Page'); // 上下文未被覆盖
  });

  // ─── 5. close — 关闭状态清理 ──────────────────────────────────────────

  it('5. close — 设置 isOpen=false 并发送 closeChat 消息', async () => {
    const cm = new ChatMode();
    await cm.open(makePageContext());
    cm.close();
    assert.equal(cm.isOpen(), false);
    const msgs = sentMessages();
    const closeMsg = msgs.find(m => m.action === 'closeChat');
    assert.ok(closeMsg, '应发送 closeChat 消息');
  });

  // ─── 6. close — 幂等性（未打开时调用无副作用） ───────────────────────

  it('6. close — 未打开时调用无副作用', () => {
    const cm = new ChatMode();
    cm.close();
    assert.equal(cm.isOpen(), false);
    assert.equal(sentMessages().length, 0);
  });

  // ─── 7. destroy — 完整清理 ───────────────────────────────────────────

  it('7. destroy — 清理所有资源', async () => {
    const cm = new ChatMode();
    await cm.open(makePageContext());
    cm.destroy();
    assert.equal(cm.isOpen(), false);
    assert.equal(cm.getPageContext(), null);
    assert.equal(cm._floatingEl, null);
    assert.equal(cm._storage, null);
  });

  // ─── 8. 消息发送 — openChat ──────────────────────────────────────────

  it('8. open — 发送 openChat 消息含 displayMode 和 pageContext', async () => {
    const ctx = makePageContext();
    const cm = new ChatMode();
    await cm.open(ctx);
    const openMsg = sentMessages().find(m => m.action === 'openChat');
    assert.ok(openMsg, '应发送 openChat 消息');
    assert.equal(openMsg.displayMode, DISPLAY_SIDEBAR);
    assert.deepEqual(openMsg.pageContext, ctx);
    assert.ok(typeof openMsg.timestamp === 'number');
  });

  // ─── 9. toggleDisplayMode — 切换并持久化 ─────────────────────────────

  it('9. toggleDisplayMode — 切换显示模式并持久化到 storage', async () => {
    const storage = makeStorage();
    const cm = new ChatMode({ storage });
    assert.equal(cm.getDisplayMode(), DISPLAY_SIDEBAR);

    const mode1 = await cm.toggleDisplayMode();
    assert.equal(mode1, DISPLAY_FLOATING);
    assert.equal(storage.store[STORAGE_KEY_DISPLAY_MODE], DISPLAY_FLOATING);

    const mode2 = await cm.toggleDisplayMode();
    assert.equal(mode2, DISPLAY_SIDEBAR);
    assert.equal(storage.store[STORAGE_KEY_DISPLAY_MODE], DISPLAY_SIDEBAR);
  });

  // ─── 10. toggleDisplayMode — 打开时切换会重建浮窗 ───────────────────

  it('10. toggleDisplayMode — 打开状态下切换到 floating 创建浮窗面板', async () => {
    const cm = new ChatMode();
    await cm.open();
    assert.equal(cm._floatingEl, null); // sidebar 模式无浮窗

    await cm.toggleDisplayMode(); // → floating
    assert.ok(cm._floatingEl, '切到 floating 应创建浮窗');
    assert.equal(cm._floatingEl.className, 'pw-chat-floating-panel');
  });

  // ─── 11. 存储恢复 — _restoreDisplayMode ──────────────────────────────

  it('11. open — 从 storage 恢复上次的显示模式', async () => {
    const storage = makeStorage();
    storage.store[STORAGE_KEY_DISPLAY_MODE] = DISPLAY_FLOATING;
    const cm = new ChatMode({ storage });
    assert.equal(cm.getDisplayMode(), DISPLAY_SIDEBAR); // 默认 sidebar

    await cm.open();
    assert.equal(cm.getDisplayMode(), DISPLAY_FLOATING); // 被恢复
  });

  // ─── 12. buildContextPrompt — 完整上下文 ─────────────────────────────

  it('12. buildContextPrompt — 完整页面上下文生成正确 prompt', () => {
    const cm = new ChatMode({ chatPromptPrefix: '请解释这个页面：' });
    cm.setPageContext({
      title: 'MDN',
      url: 'https://developer.mozilla.org',
      summary: 'Web technology documentation.',
    });
    const prompt = cm.buildContextPrompt();
    assert.ok(prompt.includes('页面标题：MDN'));
    assert.ok(prompt.includes('页面链接：https://developer.mozilla.org'));
    assert.ok(prompt.includes('页面摘要：Web technology documentation.'));
    assert.ok(prompt.includes('请解释这个页面：'));
  });

  // ─── 13. buildContextPrompt — 摘要超长截断 ───────────────────────────

  it('13. buildContextPrompt — 超长摘要被截断到 maxContextLength', () => {
    const cm = new ChatMode({ maxContextLength: 20 });
    cm.setPageContext({
      title: 'Long Page',
      url: 'https://example.com',
      summary: 'A'.repeat(100),
    });
    const prompt = cm.buildContextPrompt();
    assert.ok(prompt.includes('A'.repeat(20) + '...'), '摘要应被截断并附加 ...');
    assert.ok(!prompt.includes('A'.repeat(21) + '...'), '不应包含更多字符');
  });

  // ─── 14. buildContextPrompt — 无上下文 + 无前缀返回空串 ──────────────

  it('14. buildContextPrompt — 无上下文无前缀时返回空串', () => {
    const cm = new ChatMode();
    assert.equal(cm.buildContextPrompt(), '');
  });

  // ─── 15. 错误处理 — storage 异常静默、chrome.runtime 不可用 ──────────

  it('15. 错误处理 — storage 异常和 chrome.runtime 不可用不抛出', async () => {
    const failingStorage = makeFailingStorage();
    // 模拟 chrome.runtime 不可用
    delete chrome.runtime;
    const cm = new ChatMode({ storage: failingStorage });

    // open 不应抛出
    await cm.open(makePageContext());
    assert.equal(cm.isOpen(), true);

    // toggleDisplayMode 不应抛出（storage 写入失败）
    await cm.toggleDisplayMode();

    // close 不应抛出（sendMessage 失败）
    cm.close();
    assert.equal(cm.isOpen(), false);

    // destroy 不应抛出
    cm.destroy();
  });
});
