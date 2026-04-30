/**
 * Chrome API Mock — 用于 Node.js 测试环境
 *
 * 模拟 Chrome Extension 常用 API，不依赖真实浏览器。
 */

/** 创建 chrome.storage mock */
export function createStorageMock() {
  const localStore = {};
  const syncStore = {};

  const sessionStore = {};

  function createStore(store) {
    return {
      get: (keys, callback) => {
        const result = {};
        if (keys === null || keys === undefined) {
          // null/undefined: return all items
          Object.assign(result, store);
        } else if (typeof keys === 'string') {
          result[keys] = store[keys] !== undefined ? store[keys] : undefined;
        } else if (Array.isArray(keys)) {
          for (const k of keys) {
            result[k] = store[k] !== undefined ? store[k] : undefined;
          }
        } else if (keys && typeof keys === 'object') {
          for (const [k, defaultVal] of Object.entries(keys)) {
            result[k] = store[k] !== undefined ? store[k] : defaultVal;
          }
        }
        if (callback) callback(result);
        return Promise.resolve(result);
      },
      set: (items, callback) => {
        Object.assign(store, items);
        if (callback) callback();
        return Promise.resolve();
      },
      remove: (keys, callback) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          delete store[k];
        }
        if (callback) callback();
        return Promise.resolve();
      },
      clear: (callback) => {
        for (const k of Object.keys(store)) {
          delete store[k];
        }
        if (callback) callback();
        return Promise.resolve();
      },
    };
  }

  return {
    local: createStore(localStore),
    sync: createStore(syncStore),
    session: createStore(sessionStore),
    _localStore: localStore,
    _syncStore: syncStore,
    _sessionStore: sessionStore,
  };
}

/** 创建 chrome.tabs mock */
export function createTabsMock() {
  let nextTabId = 1;
  const tabs = [];

  return {
    query: (queryInfo, callback) => {
      let results = [...tabs];
      if (queryInfo.active !== undefined) {
        results = results.filter(t => t.active === queryInfo.active);
      }
      if (queryInfo.currentWindow !== undefined) {
        results = results.filter(t => t.currentWindow === queryInfo.currentWindow);
      }
      if (callback) callback(results);
      return Promise.resolve(results);
    },
    sendMessage: (tabId, message, callback) => {
      if (callback) callback({ received: true });
      return Promise.resolve({ received: true });
    },
    create: (createProperties, callback) => {
      const tab = { id: nextTabId++, ...createProperties };
      tabs.push(tab);
      if (callback) callback(tab);
      return Promise.resolve(tab);
    },
    captureVisibleTab: (windowId, options) => {
      // 返回一个假的 base64 PNG data URL
      return Promise.resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    },
    _tabs: tabs,
    _reset: () => { tabs.length = 0; nextTabId = 1; },
  };
}

/** 创建 chrome.runtime mock */
export function createRuntimeMock() {
  const listeners = [];

  return {
    id: 'test-extension-id',
    sendMessage: (message, callback) => {
      if (callback) callback({ received: true });
      return Promise.resolve({ received: true });
    },
    onMessage: {
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      },
      _listeners: listeners,
    },
    getURL: (path) => `chrome-extension://test-id/${path}`,
    _listeners: listeners,
    _reset: () => { listeners.length = 0; },
  };
}

/** 安装全部 Chrome mock 到 globalThis */
export function installChromeMock() {
  globalThis.chrome = {
    storage: createStorageMock(),
    tabs: createTabsMock(),
    runtime: createRuntimeMock(),
  };
  return globalThis.chrome;
}

/** 卸载 mock */
export function uninstallChromeMock() {
  delete globalThis.chrome;
}

/** 重置所有 mock 状态 */
export function resetChromeMock() {
  if (globalThis.chrome) {
    for (const k of Object.keys(globalThis.chrome.storage._syncStore)) {
      delete globalThis.chrome.storage._syncStore[k];
    }
    for (const k of Object.keys(globalThis.chrome.storage._localStore)) {
      delete globalThis.chrome.storage._localStore[k];
    }
    for (const k of Object.keys(globalThis.chrome.storage._sessionStore)) {
      delete globalThis.chrome.storage._sessionStore[k];
    }
    globalThis.chrome.tabs._reset();
    globalThis.chrome.runtime._reset();
  }
}
