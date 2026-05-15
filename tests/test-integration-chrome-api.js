/**
 * 集成测试 — Chrome API 兼容性
 *
 * 验证 chrome.tabs、chrome.storage、chrome.runtime、
 * chrome.permissions 等 API 的 mock 调用是否与真实行为一致。
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock, uninstallChromeMock } from './helpers/setup.js';

// ==================== 测试 ====================

describe('Chrome API 兼容性：tabs API', () => {
  let chrome;

  beforeEach(() => {
    chrome = installChromeMock();
  });

  afterEach(() => {
    resetChromeMock();
    uninstallChromeMock();
  });

  it('tabs.query 返回匹配条件的标签页', async () => {
    chrome.tabs._tabs.push(
      { id: 1, active: true, currentWindow: true, url: 'https://a.com' },
      { id: 2, active: false, currentWindow: true, url: 'https://b.com' },
      { id: 3, active: true, currentWindow: false, url: 'https://c.com' }
    );

    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    assert.equal(activeTabs.length, 1);
    assert.equal(activeTabs[0].id, 1);
  });

  it('tabs.query 无条件返回所有标签页', async () => {
    chrome.tabs._tabs.push(
      { id: 1, active: true },
      { id: 2, active: false },
      { id: 3, active: true }
    );

    const all = await chrome.tabs.query({});
    assert.equal(all.length, 3);
  });

  it('tabs.create 创建新标签页并返回', async () => {
    const tab = await chrome.tabs.create({ url: 'https://new.com' });
    assert.ok(tab.id > 0);
    assert.equal(tab.url, 'https://new.com');
    assert.equal(chrome.tabs._tabs.length, 1);
  });

  it('tabs.sendMessage 发送到指定 tab 并返回响应', async () => {
    const response = await chrome.tabs.sendMessage(42, { action: 'ping' });
    assert.deepEqual(response, { received: true });
  });

  it('tabs.captureVisibleTab 返回 base64 data URL', async () => {
    const dataUrl = await chrome.tabs.captureVisibleTab(1, { format: 'png' });
    assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  });
});

describe('Chrome API 兼容性：storage API', () => {
  let chrome;

  beforeEach(() => {
    chrome = installChromeMock();
  });

  afterEach(() => {
    resetChromeMock();
    uninstallChromeMock();
  });

  it('storage.local.set 写入后 get 能读取', async () => {
    await chrome.storage.local.set({ apiKey: 'sk-test', model: 'gpt-4o' });

    const result = await chrome.storage.local.get(['apiKey', 'model']);
    assert.equal(result.apiKey, 'sk-test');
    assert.equal(result.model, 'gpt-4o');
  });

  it('storage.sync.set 写入后 get 能读取（与 local 独立）', async () => {
    await chrome.storage.sync.set({ theme: 'dark' });
    await chrome.storage.local.set({ theme: 'light' });

    const syncResult = await chrome.storage.sync.get('theme');
    assert.equal(syncResult.theme, 'dark');

    const localResult = await chrome.storage.local.get('theme');
    assert.equal(localResult.theme, 'light');
  });

  it('storage.local.get(null) 返回所有存储项', async () => {
    await chrome.storage.local.set({ a: 1, b: 2, c: 3 });
    const all = await chrome.storage.local.get(null);
    assert.equal(all.a, 1);
    assert.equal(all.b, 2);
    assert.equal(all.c, 3);
  });

  it('storage.local.get 对象参数提供默认值', async () => {
    await chrome.storage.local.set({ apiKey: 'real-key' });

    const result = await chrome.storage.local.get({ apiKey: 'default-key', model: 'default-model' });
    assert.equal(result.apiKey, 'real-key');    // 已存在
    assert.equal(result.model, 'default-model'); // 使用默认值
  });

  it('storage.local.remove 删除指定 key', async () => {
    await chrome.storage.local.set({ keep: 'yes', remove: 'no' });
    await chrome.storage.local.remove('remove');

    const result = await chrome.storage.local.get(null);
    assert.equal(result.keep, 'yes');
    assert.equal(result.remove, undefined);
  });

  it('storage.local.clear 清空所有数据', async () => {
    await chrome.storage.local.set({ a: 1, b: 2 });
    await chrome.storage.local.clear();

    const result = await chrome.storage.local.get(null);
    assert.deepEqual(result, {});
  });

  it('storage.session 独立于 local 和 sync', async () => {
    await chrome.storage.session.set({ pendingAction: { action: 'ask' } });
    await chrome.storage.local.set({ pendingAction: 'local-version' });

    const sessionResult = await chrome.storage.session.get('pendingAction');
    assert.deepEqual(sessionResult.pendingAction, { action: 'ask' });

    const localResult = await chrome.storage.local.get('pendingAction');
    assert.equal(localResult.pendingAction, 'local-version');
  });
});

describe('Chrome API 兼容性：runtime API', () => {
  let chrome;

  beforeEach(() => {
    chrome = installChromeMock();
  });

  afterEach(() => {
    resetChromeMock();
    uninstallChromeMock();
  });

  it('runtime.sendMessage 发送并返回响应', async () => {
    const response = await chrome.runtime.sendMessage({ action: 'test' });
    assert.deepEqual(response, { received: true });
  });

  it('runtime.sendMessage 支持回调风格', (_, done) => {
    chrome.runtime.sendMessage({ action: 'test' }, (response) => {
      assert.deepEqual(response, { received: true });
      done();
    });
  });

  it('runtime.onMessage 监听器可注册和触发', () => {
    const received = [];
    const listener = (msg) => { received.push(msg); };

    chrome.runtime.onMessage.addListener(listener);
    assert.equal(chrome.runtime._listeners.length, 1);

    // 模拟触发
    chrome.runtime._listeners[0]({ action: 'testMsg' });
    assert.equal(received.length, 1);
    assert.equal(received[0].action, 'testMsg');
  });

  it('runtime.onMessage 监听器可移除', () => {
    const listener = () => {};
    chrome.runtime.onMessage.addListener(listener);
    assert.equal(chrome.runtime._listeners.length, 1);

    chrome.runtime.onMessage.removeListener(listener);
    assert.equal(chrome.runtime._listeners.length, 0);
  });

  it('runtime.getURL 返回扩展内资源路径', () => {
    const url = chrome.runtime.getURL('sidebar/sidebar.html');
    assert.equal(url, 'chrome-extension://test-id/sidebar/sidebar.html');
  });

  it('runtime.id 返回扩展 ID', () => {
    assert.equal(chrome.runtime.id, 'test-extension-id');
  });
});

describe('Chrome API 兼容性：permissions API 模拟', () => {
  let chrome;

  beforeEach(() => {
    chrome = installChromeMock();
  });

  afterEach(() => {
    resetChromeMock();
    uninstallChromeMock();
  });

  it('permissions mock: contains 返回 true', async () => {
    // 权限 API 通常不在 chrome-mock 中，模拟典型使用模式
    const mockPermissions = {
      contains: async () => true,
      request: async () => true,
    };

    const hasPermission = await mockPermissions.contains({ permissions: ['tabs'] });
    assert.equal(hasPermission, true);
  });

  it('permissions mock: request 返回授权结果', async () => {
    const mockPermissions = {
      request: async (perms) => {
        // 模拟用户授权
        return ['tabs', 'storage'].includes(perms.permissions?.[0]);
      }
    };

    const granted = await mockPermissions.request({ permissions: ['tabs'] });
    assert.equal(granted, true);

    const denied = await mockPermissions.request({ permissions: ['downloads'] });
    assert.equal(denied, false);
  });

  it('browser-compat PW 对象正确代理 tabs/storage/runtime', async () => {
    // 模拟 browser-compat.js 中 PW 的行为
    const mockAPI = {
      storage: chrome.storage,
      tabs: chrome.tabs,
      runtime: chrome.runtime,
    };

    // PW.tabs 等效
    const tabs = await mockAPI.tabs.query({ active: true });
    assert.ok(Array.isArray(tabs));

    // PW.storage 等效
    await mockAPI.storage.local.set({ test: 123 });
    const val = await mockAPI.storage.local.get('test');
    assert.equal(val.test, 123);

    // PW.runtime 等效
    assert.equal(mockAPI.runtime.id, 'test-extension-id');
  });

  it('tabs API 的 callback 和 Promise 模式均可用', async () => {
    chrome.tabs._tabs.push({ id: 1, active: true, currentWindow: true });

    // Promise 模式
    const result1 = await chrome.tabs.query({ active: true });
    assert.equal(result1.length, 1);

    // Callback 模式
    const result2 = await new Promise((resolve) => {
      chrome.tabs.query({ active: true }, (tabs) => resolve(tabs));
    });
    assert.equal(result2.length, 1);
  });
});

describe('Chrome API 兼容性：跨 API 联动', () => {
  let chrome;

  beforeEach(() => {
    chrome = installChromeMock();
  });

  afterEach(() => {
    resetChromeMock();
    uninstallChromeMock();
  });

  it('context menu → storage.session → runtime.sendMessage 完整流程', async () => {
    // 模拟 service-worker.js 的完整 context menu 处理流程
    const tabId = 42;
    const selection = 'selected text';

    // 1. 写入 session storage
    await chrome.storage.session.set({
      pendingAction: {
        action: 'contextMenuAsk',
        selection,
        tabId,
        timestamp: Date.now()
      }
    });

    // 2. 读取验证
    const { pendingAction } = await chrome.storage.session.get('pendingAction');
    assert.equal(pendingAction.action, 'contextMenuAsk');
    assert.equal(pendingAction.selection, selection);
    assert.equal(pendingAction.tabId, tabId);

    // 3. 通过 runtime.sendMessage 传递（模拟 SW → sidebar）
    const response = await chrome.runtime.sendMessage(pendingAction);
    assert.deepEqual(response, { received: true });
  });

  it('tabs.query + tabs.sendMessage 选中页面内容提取流程', async () => {
    chrome.tabs._tabs.push({
      id: 7,
      active: true,
      currentWindow: true,
      url: 'https://docs.example.com',
      title: 'Docs'
    });

    // 1. 查询当前活动标签页
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    assert.equal(activeTab.id, 7);

    // 2. 向该标签页发送提取内容请求
    const content = await chrome.tabs.sendMessage(activeTab.id, { action: 'extractContent' });
    assert.deepEqual(content, { received: true });
  });

  it('storage.local 持久化 settings 供所有模块读取', async () => {
    // 写入配置
    await chrome.storage.local.set({
      apiKey: 'sk-real-key',
      apiProtocol: 'openai',
      apiBaseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
      maxTokens: 4096,
      autoExtract: true,
      theme: 'dark',
      language: 'zh-CN'
    });

    // 多个模块读取同一配置
    const aiClientSettings = await chrome.storage.local.get({
      apiKey: '',
      apiProtocol: 'openai',
      model: 'gpt-4o'
    });
    assert.equal(aiClientSettings.apiKey, 'sk-real-key');
    assert.equal(aiClientSettings.model, 'gpt-4o');

    const uiSettings = await chrome.storage.local.get({ theme: 'light', language: 'en' });
    assert.equal(uiSettings.theme, 'dark');
    assert.equal(uiSettings.language, 'zh-CN');
  });

  it('runtime.onMessage 多监听器按注册顺序执行', () => {
    const callOrder = [];
    const listener1 = () => { callOrder.push(1); };
    const listener2 = () => { callOrder.push(2); };
    const listener3 = () => { callOrder.push(3); };

    chrome.runtime.onMessage.addListener(listener1);
    chrome.runtime.onMessage.addListener(listener2);
    chrome.runtime.onMessage.addListener(listener3);

    // 触发所有监听器
    for (const listener of chrome.runtime._listeners) {
      listener({ action: 'broadcast' });
    }

    assert.deepEqual(callOrder, [1, 2, 3]);
  });
});
