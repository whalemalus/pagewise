/**
 * Chrome API Mock — 用于 PinchTab E2E 测试环境
 *
 * 在浏览器环境中模拟 Chrome Extension API，让 sidebar/options 页面
 * 可以脱离真实扩展独立运行。
 */

(function() {
  'use strict';

  // ==================== Storage Mock ====================
  function createStore() {
    const store = {};
    return {
      get: (keys, callback) => {
        const result = {};
        if (keys === null || keys === undefined) {
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
        if (callback) setTimeout(() => callback(result), 0);
        return Promise.resolve(result);
      },
      set: (items, callback) => {
        Object.assign(store, items);
        if (callback) setTimeout(() => callback(), 0);
        return Promise.resolve();
      },
      remove: (keys, callback) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          delete store[k];
        }
        if (callback) setTimeout(() => callback(), 0);
        return Promise.resolve();
      },
      clear: (callback) => {
        for (const k of Object.keys(store)) {
          delete store[k];
        }
        if (callback) setTimeout(() => callback(), 0);
        return Promise.resolve();
      },
      _store: store
    };
  }

  // ==================== Runtime Mock ====================
  const runtimeListeners = [];

  const runtimeMock = {
    id: 'mock-extension-id-pinchtabs',
    sendMessage: (message, callback) => {
      console.log('[Mock] runtime.sendMessage:', message);
      const response = { received: true, mock: true };
      if (callback) setTimeout(() => callback(response), 0);
      return Promise.resolve(response);
    },
    onMessage: {
      addListener: (fn) => runtimeListeners.push(fn),
      removeListener: (fn) => {
        const idx = runtimeListeners.indexOf(fn);
        if (idx !== -1) runtimeListeners.splice(idx, 1);
      },
      hasListener: (fn) => runtimeListeners.includes(fn)
    },
    getURL: (path) => {
      // 使用相对路径返回，让资源能正确加载
      return chrome.runtime._basePath + path;
    },
    _basePath: '',
    _listeners: runtimeListeners,
    _reset: () => { runtimeListeners.length = 0; }
  };

  // ==================== Tabs Mock ====================
  const tabsMock = {
    query: (queryInfo, callback) => {
      const mockTab = {
        id: 1,
        url: window.location.href,
        title: document.title,
        active: true,
        currentWindow: true
      };
      const results = queryInfo.active === false ? [] : [mockTab];
      if (callback) setTimeout(() => callback(results), 0);
      return Promise.resolve(results);
    },
    sendMessage: (tabId, message, callback) => {
      console.log('[Mock] tabs.sendMessage:', tabId, message);
      const response = { received: true, mock: true };
      if (callback) setTimeout(() => callback(response), 0);
      return Promise.resolve(response);
    },
    create: (createProperties, callback) => {
      console.log('[Mock] tabs.create:', createProperties);
      const tab = { id: 2, ...createProperties };
      if (callback) setTimeout(() => callback(tab), 0);
      return Promise.resolve(tab);
    },
    captureVisibleTab: (windowId, options) => {
      // 返回 1x1 透明 PNG
      return Promise.resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    }
  };

  // ==================== SidePanel Mock ====================
  const sidePanelMock = {
    setOptions: (options) => {
      console.log('[Mock] sidePanel.setOptions:', options);
      return Promise.resolve();
    },
    setPanelBehavior: (behavior) => {
      console.log('[Mock] sidePanel.setPanelBehavior:', behavior);
      return Promise.resolve();
    },
    open: () => {
      console.log('[Mock] sidePanel.open');
      return Promise.resolve();
    }
  };

  // ==================== Bookmarks Mock ====================
  const bookmarksMock = {
    getTree: (callback) => {
      const tree = [{
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: '书签栏',
            children: [
              { id: '2', title: '示例书签', url: 'https://example.com', dateAdded: Date.now() }
            ]
          }
        ]
      }];
      if (callback) setTimeout(() => callback(tree), 0);
      return Promise.resolve(tree);
    },
    search: (query, callback) => {
      console.log('[Mock] bookmarks.search:', query);
      if (callback) setTimeout(() => callback([]), 0);
      return Promise.resolve([]);
    }
  };

  // ==================== Commands Mock ====================
  const commandsListeners = [];
  const commandsMock = {
    onCommand: {
      addListener: (fn) => commandsListeners.push(fn),
      removeListener: (fn) => {
        const idx = commandsListeners.indexOf(fn);
        if (idx !== -1) commandsListeners.splice(idx, 1);
      }
    }
  };

  // ==================== ContextMenus Mock ====================
  const contextMenusMock = {
    create: (properties, callback) => {
      console.log('[Mock] contextMenus.create:', properties);
      if (callback) callback();
    },
    onClicked: {
      addListener: (fn) => {},
      removeListener: (fn) => {}
    }
  };

  // ==================== Permissions Mock ====================
  const permissionsMock = {
    contains: (permissions, callback) => {
      if (callback) setTimeout(() => callback(true), 0);
      return Promise.resolve(true);
    },
    request: (permissions, callback) => {
      if (callback) setTimeout(() => callback(true), 0);
      return Promise.resolve(true);
    }
  };

  // ==================== Identity Mock ====================
  const identityMock = {
    getAuthToken: (options, callback) => {
      console.log('[Mock] identity.getAuthToken');
      if (callback) setTimeout(() => callback('mock-token'), 0);
      return Promise.resolve('mock-token');
    }
  };

  // ==================== Extension Mock ====================
  const extensionMock = {
    getURL: (path) => chrome.runtime.getURL(path),
    getBackgroundPage: (callback) => {
      if (callback) setTimeout(() => callback(null), 0);
      return Promise.resolve(null);
    }
  };

  // ==================== i18n Mock ====================
  const i18nMock = {
    getMessage: (key, substitutions) => {
      // 返回 key 本身作为 fallback
      return key;
    },
    getUILanguage: () => 'zh-CN'
  };

  // ==================== Action Mock ====================
  const actionMock = {
    setBadgeText: (details) => console.log('[Mock] action.setBadgeText:', details),
    setBadgeBackgroundColor: (details) => console.log('[Mock] action.setBadgeBackgroundColor:', details),
    setIcon: (details) => console.log('[Mock] action.setIcon:', details),
    setTitle: (details) => console.log('[Mock] action.setTitle:', details)
  };

  // ==================== 安装 Chrome Mock ====================
  window.chrome = {
    storage: {
      local: createStore(),
      sync: createStore(),
      session: createStore(),
      onChanged: {
        addListener: (fn) => {},
        removeListener: (fn) => {}
      }
    },
    runtime: runtimeMock,
    tabs: tabsMock,
    sidePanel: sidePanelMock,
    bookmarks: bookmarksMock,
    commands: commandsMock,
    contextMenus: contextMenusMock,
    permissions: permissionsMock,
    identity: identityMock,
    extension: extensionMock,
    i18n: i18nMock,
    action: actionMock
  };

  // 标记为 mock 环境
  window.__PINCHTAB_MOCK__ = true;

  console.log('[PinchTab Mock] Chrome API mock installed successfully');
  console.log('[PinchTab Mock] Available APIs:', Object.keys(window.chrome).join(', '));

  // 暴露重置方法，方便测试清理
  window.__resetChromeMock = () => {
    window.chrome.storage.local = createStore();
    window.chrome.storage.sync = createStore();
    window.chrome.storage.session = createStore();
    runtimeMock._reset();
    console.log('[PinchTab Mock] All stores reset');
  };
})();
