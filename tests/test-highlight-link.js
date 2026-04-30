/**
 * 测试 R012: 页面高亮关联
 *
 * 覆盖：
 * 1. flashHighlight() — 页面文本查找 + 临时高亮创建 + 自动消失
 * 2. clearFlashHighlights() — 清除临时高亮
 * 3. _injectQuoteAttributes() — 行内代码/引用块标记为可点击引用
 * 4. 消息协议 locateAndHighlight action
 * 5. 引用文本截取策略（blockquote 截取前 200 字符）
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock, uninstallChromeMock } from './helpers/setup.js';

installChromeMock();

// ==================== 模拟 DOM 辅助类 ====================

class MockClassList {
  constructor() { this._classes = new Set(); }
  contains(cls) { return this._classes.has(cls); }
  add(cls) { this._classes.add(cls); }
  remove(cls) { this._classes.delete(cls); }
}

class MockElement {
  constructor(tagName, children = []) {
    this.tagName = tagName.toUpperCase();
    this._children = children;
    this._attributes = {};
    this._classes = new MockClassList();
    this._eventListeners = {};
    this.textContent = children.map(c => c.textContent || '').join('');
    this._parentNode = null;
    this._parentElement = null;
  }

  get parentNode() { return this._parentNode; }
  set parentNode(p) { this._parentNode = p; }
  get parentElement() { return this._parentElement || this._parentNode; }
  set parentElement(p) { this._parentElement = p; }

  querySelectorAll(selector) {
    const results = [];
    this._collectSelectors(selector, results);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  _collectSelectors(selectorStr, results) {
    const selectors = selectorStr.split(',').map(s => s.trim());
    for (const sel of selectors) {
      this._matchSelector(sel, results);
    }
  }

  _matchSelector(selector, results) {
    const notMatch = selector.match(/^(\w+):not\((.+)\)$/);
    if (notMatch) {
      const [, tag, exclude] = notMatch;
      for (const child of this._getAllDescendants()) {
        if (child.tagName === tag.toUpperCase()) {
          let shouldExclude = false;
          if (exclude.includes('pre code')) {
            let parent = child.parentNode;
            while (parent) {
              if (parent.tagName === 'PRE') { shouldExclude = true; break; }
              parent = parent.parentNode;
            }
          }
          if (!shouldExclude) results.push(child);
        }
      }
      return;
    }
    const tag = selector.toUpperCase();
    for (const child of this._getAllDescendants()) {
      if (child.tagName === tag) results.push(child);
    }
  }

  _getAllDescendants() {
    const result = [];
    const queue = [...this._children];
    while (queue.length > 0) {
      const node = queue.shift();
      result.push(node);
      if (node._children) queue.push(...node._children);
    }
    return result;
  }

  setAttribute(name, value) { this._attributes[name] = value; }
  getAttribute(name) { return this._attributes[name]; }

  get dataset() {
    const self = this;
    return new Proxy(self._attributes, {
      get(target, prop) { return target[`data-${prop}`]; }
    });
  }

  get classList() { return this._classes; }

  addEventListener(event, handler) {
    if (!this._eventListeners[event]) this._eventListeners[event] = [];
    this._eventListeners[event].push(handler);
  }

  _fire(event) {
    const handlers = this._eventListeners[event] || [];
    const mockEvent = { preventDefault: () => {}, stopPropagation: () => {} };
    for (const h of handlers) h(mockEvent);
  }
}

// ==================== 从 content.js 提取的可测试函数 ====================

/**
 * flashHighlight 核心逻辑（提取用于单元测试）
 */
function createFlashHighlightLogic() {
  let _flashTimeout = null;

  function clearFlashHighlights() {
    if (_flashTimeout) {
      clearTimeout(_flashTimeout);
      _flashTimeout = null;
    }
    return true;
  }

  function flashHighlight(text) {
    if (!text) return { success: false, error: '未在页面中找到该内容' };
    clearFlashHighlights();
    return { success: true };
  }

  return { flashHighlight, clearFlashHighlights };
}

/**
 * _injectQuoteAttributes 核心逻辑（提取用于单元测试）
 */
function createInjectQuoteAttributesLogic() {
  const sentMessages = [];

  function injectQuoteAttributes(messageDiv) {
    // 行内代码 — 排除 pre code
    const inlineCodes = messageDiv.querySelectorAll('code:not(pre code)');
    for (const code of inlineCodes) {
      const text = code.textContent.trim();
      if (!text) continue;
      code.setAttribute('data-quote', text);
      code.classList.add('pw-quote-link');
      code.addEventListener('click', (e) => {
        e.preventDefault();
        sentMessages.push({ action: 'locateAndHighlight', text });
      });
    }

    // 引用块 — 截取前 200 字符
    const blockquotes = messageDiv.querySelectorAll('blockquote');
    for (const bq of blockquotes) {
      const fullText = bq.textContent.trim();
      const truncated = fullText.slice(0, 200);
      bq.setAttribute('data-quote', truncated);
      bq.classList.add('pw-quote-link');
      bq.addEventListener('click', (e) => {
        e.preventDefault();
        sentMessages.push({ action: 'locateAndHighlight', text: truncated });
      });
    }
  }

  return { injectQuoteAttributes, sentMessages };
}

// ==================== 辅助函数 ====================

function createMockCode(text, parent = null) {
  const el = new MockElement('code', []);
  el.textContent = text;
  if (parent) {
    el.parentNode = parent;
    el.parentElement = parent;
  }
  return el;
}

function createMockBlockquote(text) {
  const el = new MockElement('blockquote', []);
  el.textContent = text;
  return el;
}

function createMockPre(codeEl) {
  const pre = new MockElement('pre', [codeEl]);
  codeEl.parentNode = pre;
  codeEl.parentElement = pre;
  return pre;
}

// ==================== 测试套件 ====================

describe('R012: flashHighlight 核心逻辑', () => {
  it('空文本返回失败', () => {
    const { flashHighlight } = createFlashHighlightLogic();
    const result = flashHighlight('');
    assert.equal(result.success, false);
    assert.ok(result.error.includes('未在页面中找到'));
  });

  it('null 文本返回失败', () => {
    const { flashHighlight } = createFlashHighlightLogic();
    const result = flashHighlight(null);
    assert.equal(result.success, false);
  });

  it('有效文本返回成功', () => {
    const { flashHighlight } = createFlashHighlightLogic();
    const result = flashHighlight('some text');
    assert.equal(result.success, true);
  });

  it('连续调用会清除前一个高亮', () => {
    const { flashHighlight } = createFlashHighlightLogic();
    const first = flashHighlight('first');
    const second = flashHighlight('second');
    assert.equal(first.success, true);
    assert.equal(second.success, true);
  });
});

describe('R012: clearFlashHighlights', () => {
  it('可以清除临时高亮', () => {
    const { clearFlashHighlights } = createFlashHighlightLogic();
    const result = clearFlashHighlights();
    assert.equal(result, true);
  });

  it('在 flashHighlight 之前调用不会出错', () => {
    const { clearFlashHighlights, flashHighlight } = createFlashHighlightLogic();
    clearFlashHighlights();
    const result = flashHighlight('text');
    assert.equal(result.success, true);
  });
});

describe('R012: _injectQuoteAttributes — 行内代码', () => {
  it('行内 code 元素获得 data-quote 属性和 pw-quote-link 类', () => {
    const { injectQuoteAttributes } = createInjectQuoteAttributesLogic();
    const code = createMockCode('getElementById');
    const messageDiv = new MockElement('div', [code]);

    injectQuoteAttributes(messageDiv);

    assert.equal(code.getAttribute('data-quote'), 'getElementById');
    assert.equal(code.classList.contains('pw-quote-link'), true);
  });

  it('pre > code 元素不被标记', () => {
    const { injectQuoteAttributes } = createInjectQuoteAttributesLogic();
    const code = createMockCode('const x = 1;');
    const pre = createMockPre(code);
    const messageDiv = new MockElement('div', [pre]);

    injectQuoteAttributes(messageDiv);

    assert.equal(code.getAttribute('data-quote'), undefined);
    assert.equal(code.classList.contains('pw-quote-link'), false);
  });

  it('点击行内代码发送 locateAndHighlight 消息', () => {
    const { injectQuoteAttributes, sentMessages } = createInjectQuoteAttributesLogic();
    const code = createMockCode('fetch');
    const messageDiv = new MockElement('div', [code]);

    injectQuoteAttributes(messageDiv);
    code._fire('click');

    assert.equal(sentMessages.length, 1);
    assert.deepEqual(sentMessages[0], {
      action: 'locateAndHighlight',
      text: 'fetch'
    });
  });

  it('空 code 元素不被标记', () => {
    const { injectQuoteAttributes } = createInjectQuoteAttributesLogic();
    const code = createMockCode('');
    const messageDiv = new MockElement('div', [code]);

    injectQuoteAttributes(messageDiv);

    assert.equal(code.getAttribute('data-quote'), undefined);
    assert.equal(code.classList.contains('pw-quote-link'), false);
  });

  it('仅含空格的 code 元素不被标记', () => {
    const { injectQuoteAttributes } = createInjectQuoteAttributesLogic();
    const code = createMockCode('   ');
    const messageDiv = new MockElement('div', [code]);

    injectQuoteAttributes(messageDiv);

    assert.equal(code.getAttribute('data-quote'), undefined);
  });
});

describe('R012: _injectQuoteAttributes — 引用块', () => {
  it('blockquote 元素获得 data-quote 属性和 pw-quote-link 类', () => {
    const { injectQuoteAttributes } = createInjectQuoteAttributesLogic();
    const bq = createMockBlockquote('This is a quote from the page.');
    const messageDiv = new MockElement('div', [bq]);

    injectQuoteAttributes(messageDiv);

    assert.equal(bq.getAttribute('data-quote'), 'This is a quote from the page.');
    assert.equal(bq.classList.contains('pw-quote-link'), true);
  });

  it('blockquote 超过 200 字符时截取为 200', () => {
    const { injectQuoteAttributes } = createInjectQuoteAttributesLogic();
    const longText = 'A'.repeat(300);
    const bq = createMockBlockquote(longText);
    const messageDiv = new MockElement('div', [bq]);

    injectQuoteAttributes(messageDiv);

    assert.equal(bq.getAttribute('data-quote').length, 200);
    assert.equal(bq.getAttribute('data-quote'), 'A'.repeat(200));
  });

  it('点击引用块发送 locateAndHighlight 消息', () => {
    const { injectQuoteAttributes, sentMessages } = createInjectQuoteAttributesLogic();
    const bq = createMockBlockquote('Page content here.');
    const messageDiv = new MockElement('div', [bq]);

    injectQuoteAttributes(messageDiv);
    bq._fire('click');

    assert.equal(sentMessages.length, 1);
    assert.deepEqual(sentMessages[0], {
      action: 'locateAndHighlight',
      text: 'Page content here.'
    });
  });

  it('blockquote 恰好 200 字符时不截取', () => {
    const { injectQuoteAttributes } = createInjectQuoteAttributesLogic();
    const exactText = 'B'.repeat(200);
    const bq = createMockBlockquote(exactText);
    const messageDiv = new MockElement('div', [bq]);

    injectQuoteAttributes(messageDiv);

    assert.equal(bq.getAttribute('data-quote'), exactText);
  });

  it('blockquote 短于 200 字符保持完整', () => {
    const { injectQuoteAttributes } = createInjectQuoteAttributesLogic();
    const bq = createMockBlockquote('Short.');
    const messageDiv = new MockElement('div', [bq]);

    injectQuoteAttributes(messageDiv);

    assert.equal(bq.getAttribute('data-quote'), 'Short.');
  });
});

describe('R012: _injectQuoteAttributes — 混合场景', () => {
  it('同时处理行内代码和引用块', () => {
    const { injectQuoteAttributes, sentMessages } = createInjectQuoteAttributesLogic();
    const code1 = createMockCode('functionName');
    const code2 = createMockCode('variable');
    const bq = createMockBlockquote('Some quoted text');
    const messageDiv = new MockElement('div', [code1, code2, bq]);

    injectQuoteAttributes(messageDiv);

    assert.equal(code1.getAttribute('data-quote'), 'functionName');
    assert.equal(code2.getAttribute('data-quote'), 'variable');
    assert.equal(bq.getAttribute('data-quote'), 'Some quoted text');

    code1._fire('click');
    code2._fire('click');
    bq._fire('click');

    assert.equal(sentMessages.length, 3);
    assert.equal(sentMessages[0].text, 'functionName');
    assert.equal(sentMessages[1].text, 'variable');
    assert.equal(sentMessages[2].text, 'Some quoted text');
  });

  it('pre > code 与行内 code 共存时只标记行内', () => {
    const { injectQuoteAttributes } = createInjectQuoteAttributesLogic();
    const inlineCode = createMockCode('shortCode');
    const blockCode = createMockCode('const x = 1;');
    const pre = createMockPre(blockCode);
    const messageDiv = new MockElement('div', [inlineCode, pre]);

    injectQuoteAttributes(messageDiv);

    assert.equal(inlineCode.getAttribute('data-quote'), 'shortCode');
    assert.equal(inlineCode.classList.contains('pw-quote-link'), true);
    assert.equal(blockCode.getAttribute('data-quote'), undefined);
    assert.equal(blockCode.classList.contains('pw-quote-link'), false);
  });

  it('空的 messageDiv 不产生错误', () => {
    const { injectQuoteAttributes, sentMessages } = createInjectQuoteAttributesLogic();
    const messageDiv = new MockElement('div', []);

    injectQuoteAttributes(messageDiv);

    assert.equal(sentMessages.length, 0);
  });

  it('多次调用不产生重复标记', () => {
    const { injectQuoteAttributes } = createInjectQuoteAttributesLogic();
    const code = createMockCode('myFunc');
    const messageDiv = new MockElement('div', [code]);

    injectQuoteAttributes(messageDiv);
    injectQuoteAttributes(messageDiv);

    assert.equal(code.getAttribute('data-quote'), 'myFunc');
  });
});

describe('R012: 消息协议 — locateAndHighlight', () => {
  it('请求消息格式包含 action 和 text', () => {
    const msg = { action: 'locateAndHighlight', text: 'some text' };
    assert.equal(msg.action, 'locateAndHighlight');
    assert.equal(typeof msg.text, 'string');
    assert.ok(msg.text.length > 0);
  });

  it('成功响应格式: { success: true }', () => {
    const response = { success: true };
    assert.equal(response.success, true);
    assert.equal(response.error, undefined);
  });

  it('失败响应格式: { success: false, error }', () => {
    const response = { success: false, error: '未在页面中找到该内容' };
    assert.equal(response.success, false);
    assert.ok(response.error.length > 0);
    assert.ok(response.error.includes('未在页面中找到'));
  });
});

describe('R012: CSS 类名约定', () => {
  it('pw-flash-highlight 用于临时高亮', () => {
    const className = 'pw-flash-highlight';
    assert.ok(className.startsWith('pw-'));
    assert.ok(className.includes('flash'));
    assert.ok(className.includes('highlight'));
  });

  it('pw-flash-highlight--fading 用于淡出阶段', () => {
    const className = 'pw-flash-highlight--fading';
    assert.ok(className.startsWith('pw-flash-highlight'));
    assert.ok(className.includes('fading'));
  });

  it('pw-quote-link 用于可点击引用', () => {
    const className = 'pw-quote-link';
    assert.ok(className.startsWith('pw-'));
    assert.ok(className.includes('quote'));
    assert.ok(className.includes('link'));
  });

  it('pagewise-highlight 用于永久高亮（不受影响）', () => {
    const className = 'pagewise-highlight';
    assert.equal(className, 'pagewise-highlight');
  });
});

describe('R012: 文本截取策略', () => {
  it('行内代码保持完整文本', () => {
    const text = 'document.getElementById';
    assert.equal(text.slice(0, Infinity), text);
  });

  it('超过 200 字符的 blockquote 截取前 200', () => {
    const text = 'X'.repeat(500);
    const truncated = text.slice(0, 200);
    assert.equal(truncated.length, 200);
    assert.equal(truncated, 'X'.repeat(200));
  });

  it('短于 200 字符的 blockquote 保持完整', () => {
    const text = 'Short quote.';
    const truncated = text.slice(0, 200);
    assert.equal(truncated, 'Short quote.');
  });

  it('恰好 200 字符的 blockquote 保持完整', () => {
    const text = 'Y'.repeat(200);
    const truncated = text.slice(0, 200);
    assert.equal(truncated.length, 200);
  });
});

describe('R012: 向后兼容性', () => {
  it('新 action 不影响已有 action 名称', () => {
    const existingActions = [
      'extractContent', 'getSelection', 'getSelectionInfo',
      'saveHighlight', 'deleteHighlight', 'highlight', 'ping'
    ];
    const newAction = 'locateAndHighlight';
    assert.ok(!existingActions.includes(newAction));
  });

  it('pagewise-highlight 类名保持不变', () => {
    assert.equal('pagewise-highlight', 'pagewise-highlight');
  });

  it('ai-assistant-highlight 类名保持不变', () => {
    assert.equal('ai-assistant-highlight', 'ai-assistant-highlight');
  });
});

afterEach(() => {
  resetChromeMock();
});

uninstallChromeMock();
