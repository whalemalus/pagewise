/**
 * R44: MessageRenderer E2E 测试
 *
 * 验证:
 *   1. addUserMessage — 创建用户消息 DOM，存储数据，移除 welcome
 *   2. addAIMessage — 创建 AI 消息 DOM，含操作按钮、代码块检测
 *   3. addSystemMessage — 创建系统消息 DOM，存储数据
 *   4. _createMessageElement — 按类型分发构建元素
 *   5. _buildUserElement — 用户消息 HTML 结构和 selection
 *   6. _buildAIElement — AI 消息 HTML 结构和 runnable code 检测
 *   7. _buildSystemElement — 系统消息 HTML 结构
 *   8. handleMessageAction — copy / run / save / highlight / branch 分支
 *   9. destroy — 清理 observer 和 sentinel
 *  10. 边界 — 空消息、超长消息、特殊字符、无 welcome
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ============================================================
// Minimal DOM + IntersectionObserver mock for Node.js
// ============================================================

class MockIntersectionObserver {
  constructor(callback, options) {
    MockIntersectionObserver.instances.push(this);
    this._callback = callback;
    this._options = options;
    this._targets = [];
  }
  observe(target) { this._targets.push(target); }
  unobserve(target) { this._targets = this._targets.filter(t => t !== target); }
  disconnect() { this._targets = []; }
  _simulateIntersect(isIntersecting) {
    this._callback([{ isIntersecting, target: this._targets[0] }]);
  }
}
MockIntersectionObserver.instances = [];

/**
 * Simple HTML parser: parses a string into a tree of MockElements
 * attached as children of `parent`. Supports nested tags with class, style,
 * data-* attributes, and text nodes.
 */
function parseHTMLInto(html, parent) {
  const tagRe = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^>]*)\/>|([^<]+)/g;
  // We use a stack-based approach instead for nested HTML
  const tokenRe = /<(\w+)([^>]*)>|<\/(\w+)>|([^<]+)/g;
  const stack = [parent];
  let match;
  while ((match = tokenRe.exec(html)) !== null) {
    const [_, openTag, openAttrs, closeTag, text] = match;
    if (closeTag) {
      if (stack.length > 1) stack.pop();
    } else if (openTag) {
      const child = new MockElement(openTag.toLowerCase());
      // Parse attributes
      const attrRe = /(\w[\w-]*)=(?:"([^"]*?)"|'([^']*?)')/g;
      let am;
      while ((am = attrRe.exec(openAttrs)) !== null) {
        const key = am[1];
        const val = am[2] !== undefined ? am[2] : am[3];
        if (key === 'class') {
          child.className = val;
        } else if (key.startsWith('data-')) {
          child.dataset[key.slice(5)] = val;
        } else if (key === 'style') {
          child.style = val; // simplified
        } else {
          child._attributes[key] = val;
        }
      }
      stack[stack.length - 1].appendChild(child);
      stack.push(child);
    } else if (text) {
      const trimmed = text.trim();
      if (trimmed && stack.length > 0) {
        const top = stack[stack.length - 1];
        // Store as textContent if no child elements
        if (top._children.length === 0) {
          top.textContent = trimmed;
        } else {
          // Create a text node stub
          const textNode = new MockElement('#text');
          textNode.textContent = trimmed;
          top.appendChild(textNode);
        }
      }
    }
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName;
    this._className = '';
    this._innerHTML = '';
    this.style = {};
    this.textContent = '';
    this._children = [];
    this.parentNode = null;
    this.dataset = {};
    this._attributes = {};
    this._eventListeners = {};
    const self = this;
    this.classList = {
      add(cls) { self._className = (self._className + ' ' + cls).trim(); },
      remove(cls) { self._className = self._className.split(' ').filter(c => c !== cls).join(' '); },
      contains(cls) { return self._className.split(' ').includes(cls); },
    };
  }

  get className() { return this._className; }
  set className(v) { this._className = v; }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(html) {
    this._innerHTML = html;
    // Parse HTML into child MockElements for querySelector/querySelectorAll
    this._children = [];
    parseHTMLInto(html, this);
  }
  appendChild(child) {
    this._children.push(child);
    child.parentNode = this;
    return child;
  }
  insertBefore(newNode, refNode) {
    const idx = this._children.indexOf(refNode);
    if (idx >= 0) {
      this._children.splice(idx, 0, newNode);
    } else {
      this._children.push(newNode);
    }
    newNode.parentNode = this;
    return newNode;
  }
  remove() {
    if (this.parentNode) {
      const idx = this.parentNode._children.indexOf(this);
      if (idx >= 0) this.parentNode._children.splice(idx, 1);
      this.parentNode = null;
    }
  }
  setAttribute(key, value) { this._attributes[key] = value; this.dataset[key] = value; }
  getAttribute(key) { return this._attributes[key] || null; }
  addEventListener(event, handler) {
    if (!this._eventListeners[event]) this._eventListeners[event] = [];
    this._eventListeners[event].push(handler);
  }
  querySelector(selector) {
    const matchClass = selector.startsWith('.') ? selector.slice(1) : null;
    const find = (el) => {
      if (matchClass && el.className && el.className.includes(matchClass)) return el;
      for (const child of (el._children || [])) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    };
    return find(this);
  }
  querySelectorAll(selector) {
    if (selector === '.pw-lazy-msg') {
      return this._children.filter(c => c.className && c.className.includes('pw-lazy-msg'));
    }
    if (selector === '.msg-action-btn') {
      const results = [];
      const traverse = (el) => {
        if (el.className && el.className.includes('msg-action-btn')) results.push(el);
        (el._children || []).forEach(traverse);
      };
      traverse(this);
      return results;
    }
    if (selector === '.code-block-wrapper') {
      const results = [];
      const traverse = (el) => {
        if (el.className && el.className.includes('code-block-wrapper')) results.push(el);
        (el._children || []).forEach(traverse);
      };
      traverse(this);
      return results;
    }
    if (selector === 'code:not(pre code)') {
      const results = [];
      const traverse = (el) => {
        if (el.tagName === 'code') results.push(el);
        (el._children || []).forEach(traverse);
      };
      traverse(this);
      return results;
    }
    if (selector === 'blockquote') {
      const results = [];
      const traverse = (el) => {
        if (el.tagName === 'blockquote') results.push(el);
        (el._children || []).forEach(traverse);
      };
      traverse(this);
      return results;
    }
    if (selector === 'code') {
      const results = [];
      const traverse = (el) => {
        if (el.tagName === 'code') results.push(el);
        (el._children || []).forEach(traverse);
      };
      traverse(this);
      return results;
    }
    return [];
  }
}

// Install mocks on globalThis before importing the module
globalThis.document = {
  createElement(tag) { return new MockElement(tag); },
  createDocumentFragment() { return new MockElement('#fragment'); },
};
globalThis.IntersectionObserver = MockIntersectionObserver;
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async () => {} } },
  writable: true,
  configurable: true,
});
globalThis.chrome = {
  tabs: { sendMessage: async () => ({}) },
};
globalThis.setTimeout = globalThis.setTimeout || ((fn, ms) => fn());

// ============================================================
// Import the module under test
// ============================================================
const { MessageRenderer, MAX_RENDERED, LOAD_BATCH } = await import('../lib/message-renderer.js');

// ============================================================
// Helpers
// ============================================================

function createRenderer(overrides = {}) {
  MockIntersectionObserver.instances.length = 0;
  const chatArea = overrides.chatArea ?? new MockElement('div');
  const renderer = new MessageRenderer({
    chatArea,
    escapeHtml: overrides.escapeHtml ?? ((s) => s),
    scrollToBottom: overrides.scrollToBottom ?? (() => {}),
    evolution: overrides.evolution ?? { interactions: [], recordSignal: () => {} },
    currentTabId: overrides.currentTabId ?? 'tab-1',
    saveToKnowledgeBase: overrides.saveToKnowledgeBase ?? (async () => {}),
    handleBranch: overrides.handleBranch ?? (() => {}),
    runAllCodeBlocks: overrides.runAllCodeBlocks ?? (() => {}),
    executeCodeSandbox: overrides.executeCodeSandbox ?? (() => {}),
  });
  return { renderer, chatArea };
}

function countRendered(chatArea) {
  return chatArea._children.filter(c => c.className && c.className.includes('pw-lazy-msg')).length;
}

// ============================================================
// Tests
// ============================================================

describe('MessageRenderer E2E', () => {

  // ──────────────────────────────────────────────
  // 1. addUserMessage
  // ──────────────────────────────────────────────
  describe('addUserMessage', () => {
    it('创建用户消息并存储到 _allMessages', () => {
      const { renderer, chatArea } = createRenderer();
      renderer.addUserMessage('你好世界');
      assert.equal(renderer.getMessageCount(), 1);
      assert.equal(renderer._allMessages[0].type, 'user');
      assert.equal(renderer._allMessages[0].data, '你好世界');
      assert.equal(countRendered(chatArea), 1);
    });

    it('添加用户消息时移除 welcome-message', () => {
      const chatArea = new MockElement('div');
      const welcome = new MockElement('div');
      welcome.className = 'welcome-message';
      welcome.innerHTML = 'Welcome';
      chatArea.appendChild(welcome);

      const { renderer } = createRenderer({ chatArea });
      assert.ok(chatArea.querySelector('.welcome-message'));

      renderer.addUserMessage('hello');

      assert.equal(chatArea.querySelector('.welcome-message'), null);
    });

    it('带 selection 参数的消息正确存储', () => {
      const { renderer } = createRenderer();
      renderer.addUserMessage('请解释这段代码', 'selected text');
      assert.equal(renderer._allMessages[0].extra, 'selected text');
    });
  });

  // ──────────────────────────────────────────────
  // 2. addAIMessage
  // ──────────────────────────────────────────────
  describe('addAIMessage', () => {
    it('创建 AI 消息并存储到 _allMessages', () => {
      const { renderer, chatArea } = createRenderer();
      renderer.addAIMessage('这是AI的回答');
      assert.equal(renderer.getMessageCount(), 1);
      assert.equal(renderer._allMessages[0].type, 'ai');
      assert.equal(renderer._allMessages[0].data, '这是AI的回答');
      assert.equal(countRendered(chatArea), 1);
    });

    it('返回创建的 messageDiv 元素', () => {
      const { renderer } = createRenderer();
      const el = renderer.addAIMessage('回答');
      assert.ok(el instanceof MockElement);
      assert.ok(el.className.includes('message-ai'));
    });
  });

  // ──────────────────────────────────────────────
  // 3. addSystemMessage
  // ──────────────────────────────────────────────
  describe('addSystemMessage', () => {
    it('创建系统消息并存储到 _allMessages', () => {
      const { renderer, chatArea } = createRenderer();
      renderer.addSystemMessage('系统通知');
      assert.equal(renderer.getMessageCount(), 1);
      assert.equal(renderer._allMessages[0].type, 'system');
      assert.equal(renderer._allMessages[0].data, '系统通知');
      assert.equal(countRendered(chatArea), 1);
    });

    it('返回创建的 messageDiv 元素', () => {
      const { renderer } = createRenderer();
      const el = renderer.addSystemMessage('test');
      assert.ok(el instanceof MockElement);
      assert.ok(el.className.includes('pw-lazy-msg'));
    });
  });

  // ──────────────────────────────────────────────
  // 4. _createMessageElement
  // ──────────────────────────────────────────────
  describe('_createMessageElement', () => {
    it('user 类型返回带 message-user 类的元素', () => {
      const { renderer } = createRenderer();
      const el = renderer._createMessageElement({ type: 'user', data: 'hi', extra: '' });
      assert.ok(el.className.includes('message-user'));
      assert.ok(el.className.includes('pw-lazy-msg'));
    });

    it('ai 类型返回带 message-ai 类的元素', () => {
      const { renderer } = createRenderer();
      const el = renderer._createMessageElement({ type: 'ai', data: '回答' });
      assert.ok(el.className.includes('message-ai'));
      assert.ok(el.className.includes('pw-lazy-msg'));
    });

    it('system 类型返回带 message 类的元素', () => {
      const { renderer } = createRenderer();
      const el = renderer._createMessageElement({ type: 'system', data: '通知' });
      assert.ok(el.className.includes('message'));
      assert.ok(el.className.includes('pw-lazy-msg'));
    });

    it('未知类型返回默认 div 元素', () => {
      const { renderer } = createRenderer();
      const el = renderer._createMessageElement({ type: 'unknown', data: 'fallback' });
      assert.ok(el.className.includes('message'));
      assert.ok(el.className.includes('pw-lazy-msg'));
      assert.equal(el.textContent, 'fallback');
    });
  });

  // ──────────────────────────────────────────────
  // 5. _buildUserElement
  // ──────────────────────────────────────────────
  describe('_buildUserElement', () => {
    it('无 selection 时不含 selection-quote', () => {
      const { renderer } = createRenderer();
      const el = renderer._buildUserElement('hello');
      assert.ok(!el.innerHTML.includes('selection-quote'));
      assert.ok(el.innerHTML.includes('hello'));
    });

    it('有 selection 时包含 selection-quote div', () => {
      const { renderer } = createRenderer();
      const el = renderer._buildUserElement('question', 'some selected text');
      assert.ok(el.innerHTML.includes('selection-quote'));
      assert.ok(el.innerHTML.includes('some selected text'));
    });
  });

  // ──────────────────────────────────────────────
  // 6. _buildAIElement — 代码块检测
  // ──────────────────────────────────────────────
  describe('_buildAIElement', () => {
    it('包含复制/保存/高亮/分支操作按钮', () => {
      const { renderer } = createRenderer();
      const el = renderer._buildAIElement('普通回答');
      assert.ok(el.innerHTML.includes('data-action="copy"'));
      assert.ok(el.innerHTML.includes('data-action="save"'));
      assert.ok(el.innerHTML.includes('data-action="highlight"'));
      assert.ok(el.innerHTML.includes('data-action="branch"'));
    });

    it('含可运行代码块时额外显示运行按钮', () => {
      const { renderer } = createRenderer();
      const md = '这是代码:\n```javascript\nconsole.log("hi");\n```';
      const el = renderer._buildAIElement(md);
      assert.ok(el.innerHTML.includes('data-action="run"'));
    });

    it('无代码块时不显示运行按钮', () => {
      const { renderer } = createRenderer();
      const el = renderer._buildAIElement('纯文本回答');
      assert.ok(!el.innerHTML.includes('data-action="run"'));
    });
  });

  // ──────────────────────────────────────────────
  // 7. _buildSystemElement
  // ──────────────────────────────────────────────
  describe('_buildSystemElement', () => {
    it('使用居中小字样式', () => {
      const { renderer } = createRenderer();
      const el = renderer._buildSystemElement('系统消息');
      assert.ok(el.innerHTML.includes('text-align:center'));
      assert.ok(el.innerHTML.includes('font-size:12px'));
    });
  });

  // ──────────────────────────────────────────────
  // 8. handleMessageAction
  // ──────────────────────────────────────────────
  describe('handleMessageAction', () => {
    it('copy 动作调用 clipboard.writeText 并添加系统消息', async () => {
      let wroteText = '';
      Object.defineProperty(globalThis, 'navigator', {
        value: { clipboard: { writeText: async (t) => { wroteText = t; } } },
        writable: true,
        configurable: true,
      });
      const { renderer } = createRenderer();
      const msgEl = renderer.addAIMessage('要复制的文本');

      await renderer.handleMessageAction('copy', msgEl);

      assert.equal(wroteText, '要复制的文本');
      const lastMsg = renderer._allMessages[renderer._allMessages.length - 1];
      assert.equal(lastMsg.type, 'system');
      assert.equal(lastMsg.data, '已复制到剪贴板');
    });

    it('run 动作调用 _runAllCodeBlocks', async () => {
      let runCalled = false;
      const { renderer } = createRenderer({
        runAllCodeBlocks: (el) => { runCalled = true; },
      });
      const msgEl = renderer.addAIMessage('回答');

      await renderer.handleMessageAction('run', msgEl);
      assert.equal(runCalled, true);
    });

    it('save 动作调用 _saveToKnowledgeBase', async () => {
      let savedText = '';
      const { renderer } = createRenderer({
        saveToKnowledgeBase: async (text) => { savedText = text; },
      });
      const msgEl = renderer.addAIMessage('重要知识');

      await renderer.handleMessageAction('save', msgEl);
      assert.equal(savedText, '重要知识');
    });

    it('branch 动作调用 _handleBranch', async () => {
      let branchEl = null;
      const { renderer } = createRenderer({
        handleBranch: (el) => { branchEl = el; },
      });
      const msgEl = renderer.addAIMessage('分支消息');

      await renderer.handleMessageAction('branch', msgEl);
      assert.equal(branchEl, msgEl);
    });

    it('copy 动作记录 evolution signal', async () => {
      let signalType = null;
      let signalId = null;
      const { renderer } = createRenderer({
        evolution: {
          interactions: [{ id: 'inter-1' }],
          recordSignal: (type, id) => { signalType = type; signalId = id; },
        },
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: { clipboard: { writeText: async () => {} } },
        writable: true,
        configurable: true,
      });
      const msgEl = renderer.addAIMessage('test');

      await renderer.handleMessageAction('copy', msgEl);
      assert.equal(signalType, 'copied');
      assert.equal(signalId, 'inter-1');
    });
  });

  // ──────────────────────────────────────────────
  // 9. destroy
  // ──────────────────────────────────────────────
  describe('destroy', () => {
    it('断开 IntersectionObserver 并移除 sentinel', () => {
      const { renderer, chatArea } = createRenderer();
      const observer = MockIntersectionObserver.instances[0];
      assert.equal(observer._targets.length, 1);

      renderer.destroy();

      assert.equal(observer._targets.length, 0);
      const hasSentinel = chatArea._children.some(
        c => c.className && c.className.includes('pw-lazy-sentinel')
      );
      assert.equal(hasSentinel, false);
    });

    it('destroy 后 _observer 为 null', () => {
      const { renderer } = createRenderer();
      assert.ok(renderer._observer);
      renderer.destroy();
      assert.equal(renderer._observer, null);
    });

    it('destroy 后 _sentinel 为 null', () => {
      const { renderer } = createRenderer();
      assert.ok(renderer._sentinel);
      renderer.destroy();
      assert.equal(renderer._sentinel, null);
    });

    it('重复调用 destroy 不抛异常', () => {
      const { renderer } = createRenderer();
      renderer.destroy();
      assert.doesNotThrow(() => renderer.destroy());
    });
  });

  // ──────────────────────────────────────────────
  // 10. 边界情况
  // ──────────────────────────────────────────────
  describe('边界情况', () => {
    it('空字符串用户消息正常处理', () => {
      const { renderer } = createRenderer();
      renderer.addUserMessage('');
      assert.equal(renderer.getMessageCount(), 1);
      assert.equal(renderer._allMessages[0].data, '');
    });

    it('空字符串 AI 消息正常处理', () => {
      const { renderer } = createRenderer();
      renderer.addAIMessage('');
      assert.equal(renderer.getMessageCount(), 1);
      assert.equal(renderer._allMessages[0].data, '');
    });

    it('超长消息（10000字符）正常存储', () => {
      const { renderer } = createRenderer();
      const longText = 'a'.repeat(10000);
      renderer.addAIMessage(longText);
      assert.equal(renderer.getMessageCount(), 1);
      assert.equal(renderer._allMessages[0].data.length, 10000);
    });

    it('特殊字符 <script> 和 HTML 标签正常处理', () => {
      const { renderer } = createRenderer();
      const xss = '<script>alert("xss")</script>';
      renderer.addUserMessage(xss);
      assert.equal(renderer._allMessages[0].data, xss);
      assert.equal(countRendered(renderer.chatArea), 1);
    });

    it('连续添加多种类型消息后消息顺序正确', () => {
      const { renderer } = createRenderer();
      renderer.addUserMessage('q1');
      renderer.addAIMessage('a1');
      renderer.addSystemMessage('s1');
      renderer.addUserMessage('q2');
      renderer.addAIMessage('a2');

      assert.equal(renderer.getMessageCount(), 5);
      assert.equal(renderer._allMessages[0].type, 'user');
      assert.equal(renderer._allMessages[1].type, 'ai');
      assert.equal(renderer._allMessages[2].type, 'system');
      assert.equal(renderer._allMessages[3].type, 'user');
      assert.equal(renderer._allMessages[4].type, 'ai');
    });

    it('addUserMessage 不带 welcome 时不影响已有消息', () => {
      const { renderer, chatArea } = createRenderer();
      renderer.addUserMessage('first');
      renderer.addUserMessage('second');
      assert.equal(renderer.getMessageCount(), 2);
    });
  });

  // ──────────────────────────────────────────────
  // 11. scrollToBottom 调用
  // ──────────────────────────────────────────────
  describe('scrollToBottom 调用', () => {
    it('addUserMessage 调用 scrollToBottom', () => {
      let called = false;
      const { renderer } = createRenderer({ scrollToBottom: () => { called = true; } });
      renderer.addUserMessage('msg');
      assert.equal(called, true);
    });

    it('addAIMessage 调用 scrollToBottom', () => {
      let called = false;
      const { renderer } = createRenderer({ scrollToBottom: () => { called = true; } });
      renderer.addAIMessage('msg');
      assert.equal(called, true);
    });

    it('addSystemMessage 调用 scrollToBottom', () => {
      let called = false;
      const { renderer } = createRenderer({ scrollToBottom: () => { called = true; } });
      renderer.addSystemMessage('msg');
      assert.equal(called, true);
    });
  });

  // ──────────────────────────────────────────────
  // 12. _appendNewMessage 和 sentinel 位置
  // ──────────────────────────────────────────────
  describe('_appendNewMessage sentinel 位置', () => {
    it('消息始终插入在 sentinel 之前', () => {
      const { renderer, chatArea } = createRenderer();
      renderer.addUserMessage('msg-1');
      renderer.addUserMessage('msg-2');

      const lastChild = chatArea._children[chatArea._children.length - 1];
      assert.ok(lastChild.className.includes('pw-lazy-sentinel'));
      const sentinelIdx = chatArea._children.indexOf(lastChild);
      assert.ok(sentinelIdx >= 2);
    });
  });
});
