/**
 * E2E 测试辅助工具
 *
 * 模拟 Chrome Extension 环境和页面 DOM 操作，
 * 为端到端测试提供统一的基础设置。
 */

import { createStorageMock, createTabsMock, createRuntimeMock } from './chrome-mock.js';

/**
 * 创建完整的 Chrome Extension 测试环境
 * 包含 storage、tabs、runtime、sidePanel、bookmarks 等常用 API
 *
 * @returns {{ chrome: Object, cleanup: () => void }}
 */
export function createChromeExtensionEnv() {
  const storage = createStorageMock();
  const tabs = createTabsMock();
  const runtime = createRuntimeMock();

  const bookmarksTree = [];
  let nextBookmarkId = 1;

  const chrome = {
    storage,
    tabs,
    runtime,
    sidePanel: {
      open: () => Promise.resolve(),
      setPanelBehavior: () => Promise.resolve(),
      setOptions: () => Promise.resolve(),
    },
    bookmarks: {
      getTree: () => Promise.resolve(bookmarksTree),
      search: (query) => {
        const results = [];
        const searchTree = (nodes) => {
          for (const node of nodes) {
            if (node.title && node.title.toLowerCase().includes(query.query?.toLowerCase() || '')) {
              results.push(node);
            }
            if (node.children) searchTree(node.children);
          }
        };
        searchTree(bookmarksTree);
        return Promise.resolve(results);
      },
      create: (details) => {
        const node = {
          id: String(nextBookmarkId++),
          title: details.title || '',
          url: details.url || '',
          parentId: details.parentId || null,
          children: details.url ? undefined : [],
          dateAdded: Date.now(),
        };
        // Find parent and add
        const addToParent = (nodes) => {
          for (const n of nodes) {
            if (n.id === details.parentId && n.children) {
              n.children.push(node);
              return true;
            }
            if (n.children && addToParent(n.children)) return true;
          }
          return false;
        };
        if (!addToParent(bookmarksTree)) {
          bookmarksTree.push(node);
        }
        return Promise.resolve(node);
      },
      get: (ids) => {
        const idList = Array.isArray(ids) ? ids : [ids];
        const results = [];
        const findNode = (nodes) => {
          for (const n of nodes) {
            if (idList.includes(n.id)) results.push(n);
            if (n.children) findNode(n.children);
          }
        };
        findNode(bookmarksTree);
        return Promise.resolve(results);
      },
      removeTree: (id) => {
        const removeFromTree = (nodes) => {
          for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === id) {
              nodes.splice(i, 1);
              return true;
            }
            if (nodes[i].children && removeFromTree(nodes[i].children)) return true;
          }
          return false;
        };
        removeFromTree(bookmarksTree);
        return Promise.resolve();
      },
      _tree: bookmarksTree,
    },
    contextMenus: {
      create: () => {},
      removeAll: () => Promise.resolve(),
      onClicked: { addListener: () => {} },
    },
    commands: {
      onCommand: { addListener: () => {} },
    },
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
    },
  };

  globalThis.chrome = chrome;

  return {
    chrome,
    bookmarksTree,
    cleanup: () => {
      delete globalThis.chrome;
    },
  };
}

/**
 * 创建模拟 DOM 元素
 * @param {string} tag - 标签名
 * @param {Object} [attrs] - 属性
 * @param {string} [textContent] - 文本内容
 * @returns {Object} 模拟 DOM 元素
 */
export function createElement(tag, attrs = {}, textContent = '') {
  const el = {
    tagName: tag.toUpperCase(),
    id: attrs.id || '',
    className: attrs.class || attrs.className || '',
    textContent,
    innerHTML: '',
    value: attrs.value || '',
    placeholder: attrs.placeholder || '',
    title: attrs.title || '',
    style: {},
    checked: attrs.checked || false,
    disabled: attrs.disabled || false,
    children: [],
    parentNode: null,
    attributes: { ...attrs },
    dataset: {},
    classList: {
      _classes: new Set((attrs.class || '').split(' ').filter(Boolean)),
      add(cls) { this._classes.add(cls); },
      remove(cls) { this._classes.delete(cls); },
      contains(cls) { return this._classes.has(cls); },
      toggle(cls) {
        if (this._classes.has(cls)) { this._classes.delete(cls); return false; }
        this._classes.add(cls); return true;
      },
    },
    _listeners: {},
    _setAttribute(key, value) { el.attributes[key] = value; },
    setAttribute(key, value) { el.attributes[key] = value; },
    getAttribute(key) { return el.attributes[key]; },
    removeAttribute(key) { delete el.attributes[key]; },
    addEventListener(event, handler) {
      if (!el._listeners[event]) el._listeners[event] = [];
      el._listeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (el._listeners[event]) {
        el._listeners[event] = el._listeners[event].filter(h => h !== handler);
      }
    },
    appendChild(child) {
      el.children.push(child);
      child.parentNode = el;
      return child;
    },
    removeChild(child) {
      el.children = el.children.filter(c => c !== child);
    },
    remove() {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
    querySelector(selector) {
      return _findChild(el, selector);
    },
    querySelectorAll(selector) {
      return _findAllChildren(el, selector);
    },
    closest() { return null; },
    focus() {},
    blur() {},
    click() {
      if (el._listeners.click) {
        for (const h of el._listeners.click) h();
      }
    },
    dispatchEvent(event) {
      const handlers = el._listeners[event.type] || [];
      for (const h of handlers) h(event);
      return true;
    },
  };

  // Initialize dataset from data- attrs
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('data-')) {
      const dataKey = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      el.dataset[dataKey] = value;
    }
  }

  return el;
}

/**
 * 创建模拟 Document
 * @param {Object} [elements] - 预定义元素 { id: element }
 * @returns {Object} 模拟 document 对象
 */
export function createMockDocument(elements = {}) {
  const allElements = new Map();

  const doc = {
    documentElement: createElement('html', { lang: 'zh-CN' }),
    _elements: allElements,

    getElementById(id) {
      return allElements.get(id) || null;
    },

    querySelector(selector) {
      // Simple selector support
      if (selector.startsWith('#')) {
        return allElements.get(selector.slice(1)) || null;
      }
      if (selector.startsWith('[data-i18n')) {
        for (const [, el] of allElements) {
          if (el.attributes && el.getAttribute('data-i18n')) return el;
        }
      }
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        for (const [, el] of allElements) {
          if (el.classList.contains(cls)) return el;
        }
      }
      // Tag name
      for (const [, el] of allElements) {
        if (el.tagName === selector.toUpperCase()) return el;
      }
      return null;
    },

    querySelectorAll(selector) {
      const results = [];
      if (selector === '[data-i18n]') {
        for (const [, el] of allElements) {
          if (el.getAttribute && el.getAttribute('data-i18n')) {
            results.push(el);
          }
        }
      } else if (selector === '[data-i18n-placeholder]') {
        for (const [, el] of allElements) {
          if (el.getAttribute && el.getAttribute('data-i18n-placeholder')) {
            results.push(el);
          }
        }
      } else if (selector === '[data-i18n-title]') {
        for (const [, el] of allElements) {
          if (el.getAttribute && el.getAttribute('data-i18n-title')) {
            results.push(el);
          }
        }
      } else if (selector === '[data-i18n-aria-label]') {
        for (const [, el] of allElements) {
          if (el.getAttribute && el.getAttribute('data-i18n-aria-label')) {
            results.push(el);
          }
        }
      } else if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        for (const [, el] of allElements) {
          if (el.classList.contains(cls)) results.push(el);
        }
      } else if (selector.startsWith('#')) {
        const el = allElements.get(selector.slice(1));
        if (el) results.push(el);
      }
      return results;
    },

    createElement(tag) {
      return createElement(tag);
    },
  };

  // Register pre-defined elements
  for (const [id, el] of Object.entries(elements)) {
    allElements.set(id, el);
  }

  return doc;
}

/**
 * 创建模拟页面数据
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function createMockPageData(overrides = {}) {
  return {
    content: 'This is test page content about React components.',
    title: 'Test Page - React Documentation',
    url: 'https://example.com/docs/react',
    codeBlocks: ['function App() { return <div>Hello</div>; }'],
    meta: { description: 'A test page about React' },
    ...overrides,
  };
}

/**
 * 创建模拟书签树
 * @returns {Array} 书签树节点
 */
export function createMockBookmarkTree() {
  return [
    {
      id: '1',
      title: 'Bookmarks Bar',
      children: [
        {
          id: '2',
          title: 'Tech',
          children: [
            { id: '3', title: 'React Documentation', url: 'https://react.dev', dateAdded: Date.now() },
            { id: '4', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', dateAdded: Date.now() - 86400000 },
            { id: '5', title: 'Vue.js Guide', url: 'https://vuejs.org/guide', dateAdded: Date.now() - 172800000 },
          ],
        },
        {
          id: '6',
          title: 'AI',
          children: [
            { id: '7', title: 'OpenAI Platform', url: 'https://platform.openai.com', dateAdded: Date.now() - 259200000 },
            { id: '8', title: 'Anthropic Docs', url: 'https://docs.anthropic.com', dateAdded: Date.now() - 345600000 },
          ],
        },
        { id: '9', title: 'GitHub', url: 'https://github.com', dateAdded: Date.now() - 432000000 },
      ],
    },
  ];
}

/**
 * 模拟设置数据
 * @returns {Object}
 */
export function createMockSettings() {
  return {
    apiKey: 'sk-test-key-123',
    apiProtocol: 'openai',
    apiBaseUrl: 'https://api.openai.com',
    model: 'gpt-4o',
    maxTokens: 4096,
    autoExtract: true,
    autoSave: true,
    theme: 'light',
    language: 'zh-CN',
  };
}

/**
 * 等待异步操作完成
 * @param {number} [ms=0]
 * @returns {Promise<void>}
 */
export function waitFor(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 模拟计数书签的递归函数
 * @param {Array} nodes
 * @returns {number}
 */
export function countBookmarks(nodes) {
  let count = 0;
  for (const node of nodes) {
    if (node.url) count++;
    if (node.children) count += countBookmarks(node.children);
  }
  return count;
}

// ==================== 内部工具 ====================

function _findChild(parent, selector) {
  for (const child of parent.children || []) {
    if (selector.startsWith('#') && child.id === selector.slice(1)) return child;
    if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) return child;
    if (child.tagName === selector.toUpperCase()) return child;
    const found = _findChild(child, selector);
    if (found) return found;
  }
  return null;
}

function _findAllChildren(parent, selector) {
  const results = [];
  for (const child of parent.children || []) {
    if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) results.push(child);
    if (child.tagName === selector.toUpperCase()) results.push(child);
    results.push(..._findAllChildren(child, selector));
  }
  return results;
}
