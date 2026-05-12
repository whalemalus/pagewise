/**
 * Browser Compatibility Layer 测试
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock, uninstallChromeMock } from './helpers/chrome-mock.js';

describe('BrowserCompat', () => {
  let browserCompat;

  beforeEach(async () => {
    installChromeMock();
    // Dynamic import to get fresh module with chrome mock installed
    browserCompat = await import('../lib/browser-compat.js');
  });

  afterEach(() => {
    uninstallChromeMock();
  });

  // ==================== detectBrowser ====================

  describe('detectBrowser', () => {
    it('returns "chrome" when only chrome namespace exists', () => {
      // In test environment, only chrome is defined (via mock)
      globalThis.chrome.runtime.id = 'test-id';
      delete globalThis.browser;
      const result = browserCompat.detectBrowser();
      assert.equal(result, 'chrome');
    });

    it('returns "firefox" when browser.runtime.getBrowserInfo exists', () => {
      globalThis.browser = {
        runtime: {
          id: 'test-id',
          getBrowserInfo: () => Promise.resolve({ name: 'Firefox' })
        }
      };
      const result = browserCompat.detectBrowser();
      assert.equal(result, 'firefox');
      delete globalThis.browser;
    });

    it('returns "edge" when userAgent contains Edg/', () => {
      // Mock navigator via defineProperty (navigator is a getter in Node.js)
      const origDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
        },
        writable: true,
        configurable: true
      });
      delete globalThis.browser;
      const result = browserCompat.detectBrowser();
      assert.equal(result, 'edge');
      // Restore
      if (origDescriptor) {
        Object.defineProperty(globalThis, 'navigator', origDescriptor);
      }
    });

    it('returns "unknown" when no namespace exists', () => {
      const origChrome = globalThis.chrome;
      delete globalThis.chrome;
      delete globalThis.browser;
      const result = browserCompat.detectBrowser();
      assert.equal(result, 'unknown');
      globalThis.chrome = origChrome;
    });
  });

  // ==================== isFirefox / isChromium ====================

  describe('isFirefox', () => {
    it('returns false in test environment (chrome mock)', () => {
      delete globalThis.browser;
      assert.equal(browserCompat.isFirefox(), false);
    });

    it('returns true when browser namespace has getBrowserInfo', () => {
      globalThis.browser = {
        runtime: {
          id: 'test-id',
          getBrowserInfo: () => Promise.resolve({ name: 'Firefox' })
        }
      };
      assert.equal(browserCompat.isFirefox(), true);
      delete globalThis.browser;
    });
  });

  describe('isChromium', () => {
    it('returns true in test environment (chrome mock)', () => {
      delete globalThis.browser;
      assert.equal(browserCompat.isChromium(), true);
    });

    it('returns false for Firefox', () => {
      globalThis.browser = {
        runtime: {
          id: 'test-id',
          getBrowserInfo: () => Promise.resolve({ name: 'Firefox' })
        }
      };
      assert.equal(browserCompat.isChromium(), false);
      delete globalThis.browser;
    });
  });

  // ==================== PW object ====================

  describe('PW', () => {
    it('PW.storage exists and is usable', () => {
      assert.ok(browserCompat.PW.storage);
      assert.ok(browserCompat.PW.storage.local);
      assert.ok(browserCompat.PW.storage.sync);
      assert.ok(browserCompat.PW.storage.session);
    });

    it('PW.storage.local.get works', async () => {
      // Set a value via chrome mock
      await globalThis.chrome.storage.local.set({ testKey: 'testValue' });
      const result = await browserCompat.PW.storage.local.get('testKey');
      assert.equal(result.testKey, 'testValue');
    });

    it('PW.storage.sync.get works', async () => {
      await globalThis.chrome.storage.sync.set({ apiKey: 'test-123' });
      const result = await browserCompat.PW.storage.sync.get('apiKey');
      assert.equal(result.apiKey, 'test-123');
    });

    it('PW.storage.sync.set works', async () => {
      await browserCompat.PW.storage.sync.set({ model: 'gpt-4o' });
      const result = await globalThis.chrome.storage.sync.get('model');
      assert.equal(result.model, 'gpt-4o');
    });

    it('PW.runtime exists', () => {
      assert.ok(browserCompat.PW.runtime);
      assert.ok(browserCompat.PW.runtime.id);
    });

    it('PW.runtime.sendMessage works', async () => {
      const response = await browserCompat.PW.runtime.sendMessage({ action: 'test' });
      assert.ok(response);
      assert.equal(response.received, true);
    });

    it('PW.tabs exists', () => {
      assert.ok(browserCompat.PW.tabs);
      assert.equal(typeof browserCompat.PW.tabs.query, 'function');
      assert.equal(typeof browserCompat.PW.tabs.sendMessage, 'function');
    });

    it('PW.tabs.query works', async () => {
      const tabs = await browserCompat.PW.tabs.query({ active: true });
      assert.ok(Array.isArray(tabs));
    });

    it('PW.tabs.sendMessage works', async () => {
      const response = await browserCompat.PW.tabs.sendMessage(1, { action: 'test' });
      assert.ok(response);
    });
  });

  // ==================== Side Panel helpers ====================

  describe('Side Panel helpers', () => {
    it('PW.sidePanel returns undefined when no sidePanel API', () => {
      // Chrome mock doesn't have sidePanel, so it should be undefined
      assert.equal(browserCompat.PW.sidePanel, undefined);
    });

    it('PW.sidebarAction returns undefined when no sidebarAction API', () => {
      assert.equal(browserCompat.PW.sidebarAction, undefined);
    });

    it('openSidePanel does not throw when no API available', async () => {
      // Should not throw even without side panel API
      await assert.doesNotReject(() => browserCompat.openSidePanel(1));
    });

    it('closeSidePanel does not throw when no API available', async () => {
      await assert.doesNotReject(() => browserCompat.closeSidePanel(1));
    });

    it('setSidePanelBehavior does not throw when no API available', async () => {
      await assert.doesNotReject(() => browserCompat.setSidePanelBehavior({ openPanelOnActionClick: true }));
    });

    it('openSidePanel uses sidePanel.open when available', async () => {
      let opened = false;
      globalThis.chrome.sidePanel = {
        open: (opts) => { opened = true; return Promise.resolve(); }
      };
      await browserCompat.openSidePanel(42);
      assert.ok(opened);
      delete globalThis.chrome.sidePanel;
    });

    it('openSidePanel falls back to sidebarAction.open', async () => {
      delete globalThis.chrome.sidePanel;
      let opened = false;
      globalThis.chrome.sidebarAction = {
        open: (opts) => { opened = true; return Promise.resolve(); }
      };
      await browserCompat.openSidePanel(42);
      assert.ok(opened);
      delete globalThis.chrome.sidebarAction;
    });

    it('closeSidePanel uses sidePanel.close when available', async () => {
      let closed = false;
      globalThis.chrome.sidePanel = {
        close: (opts) => { closed = true; return Promise.resolve(); }
      };
      await browserCompat.closeSidePanel(42);
      assert.ok(closed);
      delete globalThis.chrome.sidePanel;
    });

    it('setSidePanelBehavior delegates to sidePanel.setPanelBehavior', async () => {
      let behaviorSet = false;
      globalThis.chrome.sidePanel = {
        setPanelBehavior: (opts) => { behaviorSet = true; return Promise.resolve(); }
      };
      await browserCompat.setSidePanelBehavior({ openPanelOnActionClick: true });
      assert.ok(behaviorSet);
      delete globalThis.chrome.sidePanel;
    });
  });

  // ==================== Context Menu helpers ====================

  describe('Context Menu helpers', () => {
    it('PW.contextMenus returns undefined when no API', () => {
      // Chrome mock doesn't set contextMenus
      // PW.contextMenus getter accesses the raw API which may not have it
      const menus = browserCompat.PW.contextMenus;
      // In mock environment, it should be undefined
      assert.equal(menus, undefined);
    });

    it('createContextMenu returns undefined when no API', () => {
      const result = browserCompat.createContextMenu({ id: 'test' });
      assert.equal(result, undefined);
    });

    it('onContextMenuClicked does not throw when no API', () => {
      assert.doesNotThrow(() => {
        browserCompat.onContextMenuClicked(() => {});
      });
    });

    it('createContextMenu delegates to contextMenus.create when available', () => {
      let created = false;
      globalThis.chrome.contextMenus = {
        create: (props) => { created = true; return props.id; }
      };
      const id = browserCompat.createContextMenu({ id: 'test-menu' });
      assert.ok(created);
      assert.equal(id, 'test-menu');
      delete globalThis.chrome.contextMenus;
    });

    it('createContextMenu falls back to menus namespace (Firefox)', () => {
      globalThis.chrome.menus = {
        create: (props) => props.id
      };
      delete globalThis.chrome.contextMenus;
      const id = browserCompat.createContextMenu({ id: 'ff-menu' });
      assert.equal(id, 'ff-menu');
      delete globalThis.chrome.menus;
    });

    it('onContextMenuClicked delegates to contextMenus.onClicked', () => {
      let registered = false;
      globalThis.chrome.contextMenus = {
        onClicked: {
          addListener: (cb) => { registered = true; }
        }
      };
      browserCompat.onContextMenuClicked(() => {});
      assert.ok(registered);
      delete globalThis.chrome.contextMenus;
    });
  });

  // ==================== getRawAPI ====================

  describe('getRawAPI', () => {
    it('returns the chrome object in test environment', () => {
      const api = browserCompat.getRawAPI();
      assert.ok(api);
      assert.ok(api.storage);
      assert.ok(api.runtime);
    });
  });

  // ==================== promisify ====================

  describe('promisify', () => {
    it('wraps callback-style API into Promise', async () => {
      const callbackFn = (data, callback) => {
        callback({ result: 'ok' });
      };
      const result = await browserCompat.promisify(callbackFn, 'test');
      assert.deepEqual(result, { result: 'ok' });
    });

    it('rejects when lastError is set', async () => {
      globalThis.chrome.runtime.lastError = { message: 'test error' };
      const callbackFn = (callback) => {
        callback(null);
      };
      await assert.rejects(
        () => browserCompat.promisify(callbackFn),
        (err) => {
          assert.ok(err.message.includes('test error'));
          return true;
        }
      );
      // Clean up
      delete globalThis.chrome.runtime.lastError;
    });
  });

  // ==================== getLastError ====================

  describe('getLastError', () => {
    it('returns null when no error', () => {
      delete globalThis.chrome.runtime.lastError;
      assert.equal(browserCompat.getLastError(), null);
    });

    it('returns error message when lastError exists', () => {
      globalThis.chrome.runtime.lastError = { message: 'something broke' };
      assert.equal(browserCompat.getLastError(), 'something broke');
      delete globalThis.chrome.runtime.lastError;
    });
  });

  // ==================== Firefox namespace simulation ====================

  describe('Firefox simulation', () => {
    beforeEach(() => {
      // Simulate Firefox: set up browser namespace
      globalThis.browser = {
        runtime: {
          id: 'firefox-ext-id',
          getBrowserInfo: () => Promise.resolve({ name: 'Firefox', version: '128.0' }),
          sendMessage: (msg) => Promise.resolve({ received: true, source: 'firefox' }),
        },
        storage: {
          local: {
            get: (keys) => Promise.resolve({}),
            set: (items) => Promise.resolve(),
          },
          sync: {
            get: (keys) => Promise.resolve({}),
            set: (items) => Promise.resolve(),
          },
          session: {
            get: (keys) => Promise.resolve({}),
            set: (items) => Promise.resolve(),
          },
        },
        tabs: {
          query: (info) => Promise.resolve([{ id: 1, url: 'https://example.com' }]),
          sendMessage: (tabId, msg) => Promise.resolve({ content: 'test' }),
        },
        menus: {
          create: (props) => props.id,
          onClicked: {
            addListener: (cb) => {},
          },
        },
        sidebarAction: {
          open: () => Promise.resolve(),
          close: () => Promise.resolve(),
          toggle: () => Promise.resolve(),
        },
      };
    });

    afterEach(() => {
      delete globalThis.browser;
    });

    it('detectBrowser returns "firefox"', () => {
      assert.equal(browserCompat.detectBrowser(), 'firefox');
    });

    it('isFirefox returns true', () => {
      assert.equal(browserCompat.isFirefox(), true);
    });

    it('PW.runtime uses browser.runtime', async () => {
      const response = await browserCompat.PW.runtime.sendMessage({ action: 'test' });
      assert.equal(response.source, 'firefox');
    });

    it('PW.tabs uses browser.tabs', async () => {
      const tabs = await browserCompat.PW.tabs.query({});
      assert.equal(tabs[0].url, 'https://example.com');
    });

    it('PW.contextMenus uses browser.menus', () => {
      const menus = browserCompat.PW.contextMenus;
      assert.ok(menus);
      assert.equal(typeof menus.create, 'function');
    });

    it('PW.sidebarAction returns Firefox sidebarAction', () => {
      const action = browserCompat.PW.sidebarAction;
      assert.ok(action);
      assert.equal(typeof action.open, 'function');
    });

    it('PW.sidePanel returns undefined in Firefox', () => {
      assert.equal(browserCompat.PW.sidePanel, undefined);
    });

    it('openSidePanel uses sidebarAction.open in Firefox', async () => {
      let opened = false;
      globalThis.browser.sidebarAction.open = () => { opened = true; return Promise.resolve(); };
      await browserCompat.openSidePanel(1);
      assert.ok(opened);
    });
  });

  // ==================== Edge namespace simulation ====================

  describe('Edge simulation', () => {
    let origDescriptor;

    beforeEach(() => {
      origDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120.0.0.0'
        },
        writable: true,
        configurable: true
      });
    });

    afterEach(() => {
      if (origDescriptor) {
        Object.defineProperty(globalThis, 'navigator', origDescriptor);
      }
    });

    it('detectBrowser returns "edge"', () => {
      delete globalThis.browser;
      assert.equal(browserCompat.detectBrowser(), 'edge');
    });

    it('isChromium returns true for Edge', () => {
      delete globalThis.browser;
      assert.equal(browserCompat.isChromium(), true);
    });
  });

  // ==================== Default export ====================

  describe('default export', () => {
    it('default export is PW object', () => {
      assert.ok(browserCompat.default);
      assert.equal(browserCompat.default, browserCompat.PW);
    });
  });
});
