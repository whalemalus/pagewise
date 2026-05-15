/**
 * 集成测试 — Service Worker ↔ Content Script 通信
 *
 * 验证 SW 与 Content Script 之间的消息发送/接收、
 * 请求-响应模式、超时处理、错误传播等核心通信路径。
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStorageMock, createTabsMock, createRuntimeMock } from './helpers/chrome-mock.js';

// ==================== 消息总线 ====================

/**
 * 创建消息总线 — 真实模拟 chrome.runtime.sendMessage → onMessage 的触发链
 *
 * 在真实 Chrome 扩展中，runtime.sendMessage 会触发所有已注册的 onMessage 监听器。
 * chrome-mock 的 sendMessage 只返回固定值，不触发监听器。
 * 此消息总线让 sendMessage 真正调用 onMessage 监听器。
 */
function createMessageBus() {
  const listeners = [];

  function sendMessage(message) {
    return new Promise((resolve) => {
      let responded = false;
      const sendResponse = (response) => {
        if (!responded) {
          responded = true;
          resolve(response);
        }
      };

      // 按注册顺序调用所有监听器
      for (const listener of listeners) {
        try {
          const keepChannel = listener(message, {}, sendResponse);
          // 如果 listener 返回 true，表示会异步调用 sendResponse
          if (keepChannel) return;
          // 否则 sendResponse 可能已被同步调用
          if (responded) return;
        } catch (e) {
          sendResponse({ error: e.message });
          return;
        }
      }

      // 无监听器处理，返回 undefined
      if (!responded) resolve(undefined);
    });
  }

  function addListener(fn) { listeners.push(fn); }
  function removeListener(fn) {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  }

  return {
    listeners,
    sendMessage,
    onMessage: { addListener, removeListener },
  };
}

/**
 * 创建带消息总线的 Chrome 环境
 */
function createTestChromeEnv() {
  const storage = createStorageMock();
  const tabs = createTabsMock();
  const runtime = createRuntimeMock();
  const bus = createMessageBus();

  // 用消息总线替换 runtime.sendMessage 和 onMessage
  runtime.sendMessage = bus.sendMessage;
  runtime.onMessage = bus.onMessage;
  runtime._listeners = bus.listeners;

  const chrome = { storage, tabs, runtime };
  globalThis.chrome = chrome;

  return { chrome, bus };
}

// ==================== 测试 ====================

describe('SW↔Content 通信：消息发送与接收', () => {
  let chrome, bus;

  beforeEach(() => {
    ({ chrome, bus } = createTestChromeEnv());
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  it('SW 通过 tabs.sendMessage 向 Content Script 发送消息', async () => {
    const contentTabId = 42;
    chrome.tabs.sendMessage = async (tabId, message) => {
      assert.equal(tabId, contentTabId);
      assert.deepEqual(message, { action: 'extractContent' });
      return { content: 'hello', title: 'Test Page' };
    };

    const result = await chrome.tabs.sendMessage(contentTabId, { action: 'extractContent' });
    assert.equal(result.content, 'hello');
    assert.equal(result.title, 'Test Page');
  });

  it('Content Script 通过 runtime.sendMessage 向 SW 发送消息并接收响应', async () => {
    // SW 注册消息处理
    bus.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getPageInfo') {
        sendResponse({ url: 'https://example.com', title: 'Example' });
      }
    });

    const response = await bus.sendMessage({ action: 'getPageInfo' });
    assert.equal(response.url, 'https://example.com');
    assert.equal(response.title, 'Example');
  });

  it('SW 路由 extractFromTab 到 Content Script 并返回结果', async () => {
    const tabId = 7;

    // 模拟 tabs.sendMessage（content script 的响应）
    chrome.tabs.sendMessage = async (id, msg) => {
      assert.equal(id, tabId);
      assert.equal(msg.action, 'extractContent');
      return { content: 'page content here', title: 'Docs', url: 'https://docs.example.com' };
    };

    // SW 注册 extractFromTab 路由（与 service-worker.js 模式一致）
    bus.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extractFromTab') {
        chrome.tabs.sendMessage(request.tabId, { action: 'extractContent' })
          .then(sendResponse)
          .catch(err => sendResponse({ error: err.message }));
        return true; // 异步 sendResponse
      }
    });

    const result = await bus.sendMessage({ action: 'extractFromTab', tabId });
    assert.equal(result.content, 'page content here');
    assert.equal(result.title, 'Docs');
  });

  it('request-response 模式中 SW 返回正确结构', async () => {
    chrome.tabs._tabs.push({ id: 1, active: true, currentWindow: true, url: 'https://test.com', title: 'Test' });

    // SW 注册 getCurrentTab 处理器
    bus.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getCurrentTab') {
        chrome.tabs.query({ active: true, currentWindow: true })
          .then(([tab]) => sendResponse(tab))
          .catch(err => sendResponse({ error: err.message }));
        return true;
      }
    });

    const tab = await bus.sendMessage({ action: 'getCurrentTab' });
    assert.equal(tab.id, 1);
    assert.equal(tab.url, 'https://test.com');
  });
});

describe('SW↔Content 通信：超时与重试', () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  it('sendMessageWithRetry 在首次失败后重试成功', async () => {
    const { chrome, bus } = createTestChromeEnv();
    let attempts = 0;
    const origSend = bus.sendMessage.bind(bus);

    // 覆盖 sendMessage，前两次失败
    chrome.runtime.sendMessage = async (msg) => {
      attempts++;
      if (attempts < 3) throw new Error('No receiving end');
      return origSend(msg);
    };

    // 注册处理器
    bus.onMessage.addListener((request, sender, sendResponse) => {
      sendResponse({ success: true });
    });

    // 带重试的发送
    async function sendWithRetry(data, maxRetries = 5, interval = 10) {
      for (let i = 1; i <= maxRetries; i++) {
        try {
          return await chrome.runtime.sendMessage(data);
        } catch (e) {
          if (i >= maxRetries) throw e;
          await new Promise(r => setTimeout(r, interval));
        }
      }
    }

    const result = await sendWithRetry({ action: 'test' });
    assert.equal(result.success, true);
    assert.equal(attempts, 3);
  });

  it('sendMessageWithRetry 达到最大重试次数后抛出错误', async () => {
    const { chrome } = createTestChromeEnv();
    let attempts = 0;
    chrome.runtime.sendMessage = async () => {
      attempts++;
      throw new Error('No receiving end');
    };

    async function sendWithRetry(data, maxRetries = 3, interval = 10) {
      for (let i = 1; i <= maxRetries; i++) {
        try {
          return await chrome.runtime.sendMessage(data);
        } catch (e) {
          if (i >= maxRetries) throw e;
          await new Promise(r => setTimeout(r, interval));
        }
      }
    }

    await assert.rejects(
      () => sendWithRetry({ action: 'test' }, 3, 10),
      { message: 'No receiving end' }
    );
    assert.equal(attempts, 3);
  });

  it('tabs.sendMessage 对不存在的 tabId 模拟错误', async () => {
    const { chrome } = createTestChromeEnv();
    chrome.tabs.sendMessage = async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    };

    await assert.rejects(
      () => chrome.tabs.sendMessage(9999, { action: 'ping' }),
      { message: 'Could not establish connection. Receiving end does not exist.' }
    );
  });
});

describe('SW↔Content 通信：错误传播', () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  it('SW 处理器同步抛出异常时传播错误', async () => {
    const { chrome, bus } = createTestChromeEnv();

    bus.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'riskyAction') {
        // 故意抛出
        throw new Error('Processing failed');
      }
    });

    const response = await bus.sendMessage({ action: 'riskyAction' });
    assert.equal(response.error, 'Processing failed');
  });

  it('SW 异步处理器 reject 时返回错误对象', async () => {
    const { chrome, bus } = createTestChromeEnv();

    bus.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'asyncFail') {
        // 模拟异步操作失败后调用 sendResponse
        Promise.reject(new Error('Async operation failed'))
          .catch(err => sendResponse({ error: err.message }));
        return true;
      }
    });

    const response = await bus.sendMessage({ action: 'asyncFail' });
    assert.equal(response.error, 'Async operation failed');
  });

  it('未注册的 action 不会导致崩溃，返回 undefined', async () => {
    const { chrome, bus } = createTestChromeEnv();
    // 不注册任何 handler

    const response = await bus.sendMessage({ action: 'unknownAction' });
    assert.equal(response, undefined);
  });
});

describe('SW↔Content 通信：多标签页隔离', () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  it('消息定向发送到指定 tabId，不影响其他 tab', async () => {
    const { chrome } = createTestChromeEnv();
    const sentMessages = [];
    chrome.tabs.sendMessage = async (tabId, message) => {
      sentMessages.push({ tabId, message });
      return { tabId, received: true };
    };

    await chrome.tabs.sendMessage(1, { action: 'extractContent' });
    await chrome.tabs.sendMessage(2, { action: 'extractContent' });
    await chrome.tabs.sendMessage(3, { action: 'extractContent' });

    assert.equal(sentMessages.length, 3);
    assert.equal(sentMessages[0].tabId, 1);
    assert.equal(sentMessages[1].tabId, 2);
    assert.equal(sentMessages[2].tabId, 3);
  });

  it('contextMenu 路由传递 tabId 用于后续通信', async () => {
    const { chrome, bus } = createTestChromeEnv();
    let capturedTabId = null;

    chrome.tabs.sendMessage = async (tabId, msg) => {
      capturedTabId = tabId;
      return { received: true };
    };

    // SW 注册 context menu 处理器
    bus.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'contextMenuAsk') {
        chrome.tabs.sendMessage(request.tabId, {
          action: 'handleSelection',
          text: request.selection
        }).then(sendResponse);
        return true;
      }
    });

    const result = await bus.sendMessage({
      action: 'contextMenuAsk',
      selection: 'test text',
      tabId: 55,
      tabUrl: 'https://example.com/page',
      tabTitle: 'Example Page'
    });

    assert.equal(capturedTabId, 55);
    assert.equal(result.received, true);
  });
});
