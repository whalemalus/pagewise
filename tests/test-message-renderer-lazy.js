/**
 * 测试 lib/message-renderer.js — 懒渲染（Lazy Rendering）
 *
 * 验证:
 *   1. 消息数组 _allMessages 正确存储所有消息
 *   2. DOM 中最多渲染 MAX_RENDERED (50) 条消息
 *   3. 超过 50 条时移除最旧的 DOM 元素
 *   4. _renderOlderMessages 从数据数组加载更早消息
 *   5. sentinel 元素始终位于 chatArea 末尾
 *   6. destroy() 清理 observer 和 sentinel
 *   7. addSystemMessage 也走懒渲染路径
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
  /** Test helper: simulate intersection */
  _simulateIntersect(isIntersecting) {
    this._callback([{ isIntersecting, target: this._targets[0] }]);
  }
}
MockIntersectionObserver.instances = [];

class MockElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.className = '';
    this.innerHTML = '';
    this.style = {};
    this.textContent = '';
    this._children = [];
    this.parentNode = null;
    this.dataset = {};
    this._eventListeners = {};
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
  querySelector(selector) {
    // Simple implementation for .welcome-message and .pw-lazy-msg
    return this._children.find(child => {
      if (selector.startsWith('.')) {
        return child.className.includes(selector.slice(1));
      }
      return false;
    }) || null;
  }
  querySelectorAll(selector) {
    if (selector === '.pw-lazy-msg') {
      return this._children.filter(c => c.className && c.className.includes('pw-lazy-msg'));
    }
    if (selector === '.msg-action-btn') {
      // Return empty for simplicity — action button wiring tested separately
      return [];
    }
    return [];
  }
  addEventListener(event, handler) {
    if (!this._eventListeners[event]) this._eventListeners[event] = [];
    this._eventListeners[event].push(handler);
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
globalThis.chrome = { tabs: { sendMessage: async () => ({}) } };
globalThis.setTimeout = globalThis.setTimeout || ((fn, ms) => fn());

// We need to mock the utils.js import as well since it uses chrome APIs
// The import path resolution in the module may still try to load the real file.
// We'll handle this by pre-loading a mock utils module.
// But since the module system caches by URL, we need to set up before import.

// ============================================================
// Import the module under test
// ============================================================
const { MessageRenderer, MAX_RENDERED, LOAD_BATCH } = await import('../lib/message-renderer.js');

// ============================================================
// Helpers
// ============================================================

/** Create a fresh MessageRenderer with a fresh chatArea */
function createRenderer() {
  MockIntersectionObserver.instances.length = 0;
  const chatArea = new MockElement('div');
  const renderer = new MessageRenderer({
    chatArea,
    escapeHtml: (s) => s,
    scrollToBottom: () => {},
    evolution: { interactions: [], recordSignal: () => {} },
    currentTabId: 'tab-1',
    saveToKnowledgeBase: async () => {},
    handleBranch: () => {},
    runAllCodeBlocks: () => {},
    executeCodeSandbox: () => {},
  });
  return { renderer, chatArea };
}

/** Count .pw-lazy-msg children in chatArea */
function countRendered(chatArea) {
  return chatArea._children.filter(c => c.className && c.className.includes('pw-lazy-msg')).length;
}

// ============================================================
// Tests
// ============================================================

describe('MessageRenderer — 懒渲染', () => {

  describe('基本消息存储', () => {
    it('addUserMessage 存入 _allMessages 并创建 DOM', () => {
      const { renderer, chatArea } = createRenderer();
      renderer.addUserMessage('你好');
      assert.equal(renderer.getMessageCount(), 1);
      assert.equal(renderer._allMessages[0].type, 'user');
      assert.equal(renderer._allMessages[0].data, '你好');
      assert.equal(countRendered(chatArea), 1);
    });

    it('addAIMessage 存入 _allMessages 并创建 DOM', () => {
      const { renderer, chatArea } = createRenderer();
      renderer.addAIMessage('回答内容');
      assert.equal(renderer.getMessageCount(), 1);
      assert.equal(renderer._allMessages[0].type, 'ai');
      assert.equal(renderer._allMessages[0].data, '回答内容');
      assert.equal(countRendered(chatArea), 1);
    });

    it('addSystemMessage 存入 _allMessages 并创建 DOM', () => {
      const { renderer, chatArea } = createRenderer();
      renderer.addSystemMessage('系统提示');
      assert.equal(renderer.getMessageCount(), 1);
      assert.equal(renderer._allMessages[0].type, 'system');
      assert.equal(countRendered(chatArea), 1);
    });
  });

  describe('DOM 消息数量上限', () => {
    it('不超过 50 条消息时全部渲染', () => {
      const { renderer, chatArea } = createRenderer();
      for (let i = 0; i < 30; i++) {
        renderer.addUserMessage(`msg-${i}`);
      }
      assert.equal(renderer.getMessageCount(), 30);
      assert.equal(countRendered(chatArea), 30);
    });

    it('超过 50 条时移除最旧的 DOM 元素，保持 ≤ 50', () => {
      const { renderer, chatArea } = createRenderer();
      // Add 60 messages
      for (let i = 0; i < 60; i++) {
        renderer.addUserMessage(`msg-${i}`);
      }
      assert.equal(renderer.getMessageCount(), 60); // all stored
      assert.equal(countRendered(chatArea), MAX_RENDERED); // only 50 in DOM
    });

    it('超过上限后最新的消息在 DOM 中', () => {
      const { renderer, chatArea } = createRenderer();
      for (let i = 0; i < 55; i++) {
        renderer.addUserMessage(`msg-${i}`);
      }
      // The last rendered message should be msg-54
      const lastRendered = chatArea._children.filter(c =>
        c.className && c.className.includes('pw-lazy-msg')
      ).pop();
      assert.ok(lastRendered.innerHTML.includes('msg-54'));
    });

    it('超过上限后最旧的消息从 DOM 移除', () => {
      const { renderer, chatArea } = createRenderer();
      for (let i = 0; i < 55; i++) {
        renderer.addUserMessage(`msg-${i}`);
      }
      // msg-0 should NOT be in DOM anymore
      const renderedTexts = chatArea._children
        .filter(c => c.className && c.className.includes('pw-lazy-msg'))
        .map(c => c.innerHTML);
      const hasMsg0 = renderedTexts.some(html => html.includes('msg-0'));
      assert.equal(hasMsg0, false, 'msg-0 should have been removed from DOM');
    });
  });

  describe('_renderOlderMessages 加载更早消息', () => {
    it('从 _allMessages 加载更早的消息到 DOM 顶部', () => {
      const { renderer, chatArea } = createRenderer();
      // Add 60 messages → last 50 in DOM, range [10, 60)
      for (let i = 0; i < 60; i++) {
        renderer.addUserMessage(`msg-${i}`);
      }
      assert.equal(countRendered(chatArea), MAX_RENDERED);
      assert.equal(renderer._renderedRange.start, 10);

      // Trigger loading older messages
      renderer._renderOlderMessages();

      // Should load 20 more older messages (from index max(0,10-20)=0 to 10)
      // New range start should be 0
      assert.equal(renderer._renderedRange.start, 0);
      // Total stored is still 60
      assert.equal(renderer.getMessageCount(), 60);
      // Rendered count should still be ≤ MAX_RENDERED
      assert.ok(countRendered(chatArea) <= MAX_RENDERED);
    });

    it('不加载超出 _allMessages 的消息', () => {
      const { renderer, chatArea } = createRenderer();
      // Only 10 messages
      for (let i = 0; i < 10; i++) {
        renderer.addUserMessage(`msg-${i}`);
      }
      assert.equal(renderer._renderedRange.start, 0);
      // Calling _renderOlderMessages should be a no-op
      renderer._renderOlderMessages();
      assert.equal(renderer._renderedRange.start, 0);
      assert.equal(countRendered(chatArea), 10);
    });

    it('多次加载旧消息最终覆盖所有消息', () => {
      const { renderer, chatArea } = createRenderer();
      // Add 120 messages → range [70, 120), rendered = 50
      for (let i = 0; i < 120; i++) {
        renderer.addUserMessage(`msg-${i}`);
      }
      assert.equal(renderer._renderedRange.start, 70);

      // First load → start = 50
      renderer._renderOlderMessages();
      assert.equal(renderer._renderedRange.start, 50);

      // Second load → start = 30
      renderer._renderOlderMessages();
      assert.equal(renderer._renderedRange.start, 30);

      // Third load → start = 10
      renderer._renderOlderMessages();
      assert.equal(renderer._renderedRange.start, 10);

      // Fourth load → start = 0
      renderer._renderOlderMessages();
      assert.equal(renderer._renderedRange.start, 0);

      // Fifth load → no-op
      renderer._renderOlderMessages();
      assert.equal(renderer._renderedRange.start, 0);
    });
  });

  describe('sentinel 元素', () => {
    it('sentinel 在 chatArea 末尾', () => {
      const { renderer, chatArea } = createRenderer();
      renderer.addUserMessage('test');
      const lastChild = chatArea._children[chatArea._children.length - 1];
      assert.ok(lastChild.className.includes('pw-lazy-sentinel'));
    });

    it('多次添加消息后 sentinel 仍在末尾', () => {
      const { renderer, chatArea } = createRenderer();
      for (let i = 0; i < 10; i++) {
        renderer.addUserMessage(`msg-${i}`);
      }
      const lastChild = chatArea._children[chatArea._children.length - 1];
      assert.ok(lastChild.className.includes('pw-lazy-sentinel'));
    });
  });

  describe('IntersectionObserver', () => {
    it('构造时创建 IntersectionObserver 并 observe sentinel', () => {
      const { renderer, chatArea } = createRenderer();
      assert.equal(MockIntersectionObserver.instances.length, 1);
      const observer = MockIntersectionObserver.instances[0];
      assert.equal(observer._targets.length, 1);
      assert.ok(observer._targets[0].className.includes('pw-lazy-sentinel'));
    });

    it('模拟 sentinel 进入视口触发 _renderOlderMessages', () => {
      const { renderer, chatArea } = createRenderer();
      // Add 80 messages → range [30, 80)
      for (let i = 0; i < 80; i++) {
        renderer.addUserMessage(`msg-${i}`);
      }
      const startBefore = renderer._renderedRange.start;

      // Simulate intersection
      const observer = MockIntersectionObserver.instances[0];
      observer._simulateIntersect(true);

      // After intersection, start should have moved back
      assert.ok(renderer._renderedRange.start < startBefore);
    });
  });

  describe('混合消息类型', () => {
    it('不同类型消息都正确存储和渲染', () => {
      const { renderer, chatArea } = createRenderer();
      renderer.addUserMessage('用户消息');
      renderer.addAIMessage('AI 回答');
      renderer.addSystemMessage('系统提示');
      assert.equal(renderer.getMessageCount(), 3);
      assert.equal(renderer._allMessages[0].type, 'user');
      assert.equal(renderer._allMessages[1].type, 'ai');
      assert.equal(renderer._allMessages[2].type, 'system');
      assert.equal(countRendered(chatArea), 3);
    });
  });

  describe('destroy()', () => {
    it('断开 observer 并移除 sentinel', () => {
      const { renderer, chatArea } = createRenderer();
      const observer = MockIntersectionObserver.instances[0];
      assert.equal(observer._targets.length, 1);

      renderer.destroy();

      assert.equal(observer._targets.length, 0); // disconnected
      // sentinel should be removed from chatArea
      const hasSentinel = chatArea._children.some(c =>
        c.className && c.className.includes('pw-lazy-sentinel')
      );
      assert.equal(hasSentinel, false);
    });
  });

  describe('getMessageCount()', () => {
    it('返回 _allMessages 长度', () => {
      const { renderer } = createRenderer();
      assert.equal(renderer.getMessageCount(), 0);
      renderer.addUserMessage('a');
      renderer.addAIMessage('b');
      assert.equal(renderer.getMessageCount(), 2);
    });
  });

  describe('常量导出', () => {
    it('MAX_RENDERED = 50', () => {
      assert.equal(MAX_RENDERED, 50);
    });

    it('LOAD_BATCH = 20', () => {
      assert.equal(LOAD_BATCH, 20);
    });
  });
});
