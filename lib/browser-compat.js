/**
 * Browser Compatibility Layer
 * 浏览器 API 兼容层 — 自动适配 chrome.* (Chrome/Edge) 和 browser.* (Firefox)
 *
 * 使用 feature detection 优先，而非 browser detection。
 * 统一导出 PW.api 作为跨浏览器 API 访问入口。
 */

// ==================== 浏览器检测 ====================

/**
 * 检测当前浏览器类型（用于 manifest 差异等无法用 feature detection 的场景）
 * @returns {'firefox' | 'chrome' | 'edge' | 'unknown'}
 */
export function detectBrowser() {
  if (typeof globalThis === 'undefined') return 'unknown';

  // Firefox: navigator.userAgent 含 Firefox，且存在 browser.* namespace
  if (typeof globalThis.browser !== 'undefined' && globalThis.browser?.runtime?.getBrowserInfo) {
    return 'firefox';
  }

  // Edge: navigator.userAgent 含 Edg/
  if (typeof navigator !== 'undefined' && navigator.userAgent?.includes('Edg/')) {
    return 'edge';
  }

  // Chrome / Chromium-based
  if (typeof globalThis.chrome !== 'undefined') {
    return 'chrome';
  }

  return 'unknown';
}

/**
 * 是否为 Firefox 环境
 * @returns {boolean}
 */
export function isFirefox() {
  return detectBrowser() === 'firefox';
}

/**
 * 是否为 Chromium 内核 (Chrome/Edge/Brave)
 * @returns {boolean}
 */
export function isChromium() {
  const browser = detectBrowser();
  return browser === 'chrome' || browser === 'edge';
}

// ==================== API 解析 ====================

/**
 * 获取可用的扩展 API namespace
 * Firefox 使用 globalThis.browser（返回 Promise 的 WebExtension API）
 * Chrome/Edge 使用 globalThis.chrome（callback-based API）
 *
 * @returns {object} 扩展 API 对象
 */
function getExtensionAPI() {
  // Feature detection: 如果 browser namespace 存在且有 runtime，优先使用
  // (Firefox 同时暴露 chrome 和 browser，但 browser 是 Promise-based)
  if (typeof globalThis.browser !== 'undefined' &&
      globalThis.browser?.runtime?.id) {
    return globalThis.browser;
  }

  if (typeof globalThis.chrome !== 'undefined' &&
      globalThis.chrome?.runtime?.id) {
    return globalThis.chrome;
  }

  // Node.js 测试环境: 返回 globalThis.chrome（由 chrome-mock 安装）
  if (typeof globalThis.chrome !== 'undefined') {
    return globalThis.chrome;
  }

  // Fallback: 空对象防止报错
  return {};
}

/**
 * 获取可用的扩展 API namespace
 * 返回底层的 chrome 或 browser 对象，不做 Promise 包装。
 *
 * @returns {object} 原始 API 对象 (chrome 或 browser)
 */
export function getRawAPI() {
  return getExtensionAPI();
}

// ==================== 统一 API 入口 ====================

/**
 * 统一包装的扩展 API。
 *
 * 在所有代码中使用 `PW.storage.local.get(...)` 替代 `chrome.storage.local.get(...)`。
 * 自动将 Firefox 的 Promise-based API 转为兼容 Chrome callback 风格，
 * 同时保留 Promise 返回值。
 *
 * 使用方法:
 *   import { PW } from './lib/browser-compat.js';
 *   const result = await PW.storage.sync.get({ key: 'default' });
 */
export const PW = {
  // ---------- storage ----------
  get storage() {
    const api = getExtensionAPI();
    return api.storage;
  },

  // ---------- runtime ----------
  get runtime() {
    const api = getExtensionAPI();
    return api.runtime;
  },

  // ---------- tabs ----------
  get tabs() {
    const api = getExtensionAPI();
    return api.tabs;
  },

  // ---------- bookmarks ----------
  get bookmarks() {
    const api = getExtensionAPI();
    return api.bookmarks;
  },

  // ---------- contextMenus / menus ----------
  get contextMenus() {
    const api = getExtensionAPI();
    // Firefox uses browser.menus instead of browser.contextMenus
    if (api.contextMenus) return api.contextMenus;
    if (api.menus) return api.menus;
    return undefined;
  },

  // ---------- sidePanel / sidebarAction ----------
  get sidePanel() {
    const api = getExtensionAPI();
    // Chrome/Edge: chrome.sidePanel
    if (api.sidePanel) return api.sidePanel;
    // Firefox: sidePanel API not supported
    return undefined;
  },

  get sidebarAction() {
    const api = getExtensionAPI();
    // Firefox: browser.sidebarAction
    if (api.sidebarAction) return api.sidebarAction;
    return undefined;
  },

  // ---------- commands ----------
  get commands() {
    const api = getExtensionAPI();
    return api.commands;
  },

  // ---------- action ----------
  get action() {
    const api = getExtensionAPI();
    return api.action;
  },
};

// ==================== Side Panel 兼容 ====================

/**
 * 打开侧边栏（跨浏览器兼容）
 *
 * Chrome/Edge: 使用 chrome.sidePanel.open()
 * Firefox: 使用 browser.sidebarAction.open() 或 toggle
 *
 * @param {number} tabId - 标签页 ID
 * @returns {Promise<void>}
 */
export async function openSidePanel(tabId) {
  const api = getExtensionAPI();

  // Chrome/Edge: sidePanel API
  if (api.sidePanel?.open) {
    return api.sidePanel.open({ tabId });
  }

  // Firefox: sidebarAction API
  if (api.sidebarAction?.open) {
    return api.sidebarAction.open({ windowId: undefined });
  }

  // Fallback: toggle
  if (api.sidebarAction?.toggle) {
    return api.sidebarAction.toggle({});
  }

  console.warn('[PageWise] No side panel API available');
}

/**
 * 关闭侧边栏（跨浏览器兼容）
 * @param {number} tabId - 标签页 ID
 * @returns {Promise<void>}
 */
export async function closeSidePanel(tabId) {
  const api = getExtensionAPI();

  if (api.sidePanel?.close) {
    return api.sidePanel.close({ tabId });
  }

  if (api.sidebarAction?.close) {
    return api.sidebarAction.close({});
  }

  if (api.sidebarAction?.toggle) {
    return api.sidebarAction.toggle({});
  }
}

/**
 * 配置 Side Panel 行为（跨浏览器兼容）
 * @param {object} options
 * @returns {Promise<void>}
 */
export async function setSidePanelBehavior(options) {
  const api = getExtensionAPI();

  if (api.sidePanel?.setPanelBehavior) {
    return api.sidePanel.setPanelBehavior(options).catch(() => {});
  }

  // Firefox: sidebarAction does not need this configuration
}

// ==================== Context Menu 兼容 ====================

/**
 * 创建右键菜单项（跨浏览器兼容）
 * Chrome: chrome.contextMenus.create()
 * Firefox: browser.menus.create()
 *
 * @param {object} properties - 菜单项属性
 * @returns {string|undefined} 菜单项 ID
 */
export function createContextMenu(properties) {
  const menus = PW.contextMenus;
  if (!menus?.create) {
    console.warn('[PageWise] Context menus API not available');
    return undefined;
  }
  return menus.create(properties);
}

/**
 * 监听右键菜单点击（跨浏览器兼容）
 * @param {Function} callback
 */
export function onContextMenuClicked(callback) {
  const menus = PW.contextMenus;
  if (!menus?.onClicked?.addListener) return;
  menus.onClicked.addListener(callback);
}

// ==================== Promise 兼容工具 ====================

/**
 * 将 callback-based chrome.* API 包装为 Promise
 *
 * @param {Function} apiMethod - chrome.* API 方法
 * @param  {...any} args - 参数
 * @returns {Promise<any>}
 */
export function promisify(apiMethod, ...args) {
  return new Promise((resolve, reject) => {
    apiMethod(...args, (result) => {
      const lastError = getLastError();
      if (lastError) {
        reject(new Error(lastError));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * 获取 runtime.lastError（跨浏览器兼容）
 * @returns {string|null}
 */
export function getLastError() {
  const api = getExtensionAPI();
  const error = api.runtime?.lastError;
  return error?.message || error || null;
}

export default PW;
