/**
 * BookmarkKeyboardShortcuts — 书签图谱快捷键管理 (R71)
 *
 * 管理书签图谱面板内的键盘快捷键:
 *   - 搜索聚焦: Ctrl+F / ⌘+F
 *   - 图谱缩放: +/-/0 (放大/缩小/重置)
 *   - 刷新图谱: F5
 *   - 支持自定义绑定 (chrome.storage.sync 持久化)
 *   - 冲突检测 + 启用/禁用
 *
 * 纯逻辑模块，不直接操作 DOM，通过回调分发事件。
 *
 * 依赖:
 *   - chrome.storage.sync (可选，用于持久化自定义绑定)
 */

import { storageGet, storageSet } from './storage-adapter.js'

// ==================== 常量 ====================

/** chrome.storage.sync 存储 key */
const STORAGE_KEY = 'bookmarkGraphShortcuts';

/** 默认图谱快捷键绑定 */
export const DEFAULT_GRAPH_SHORTCUTS = {
  search:    { key: 'f', ctrl: true,  meta: false, shift: false, alt: false },  // 搜索聚焦
  zoomIn:    { key: '=', ctrl: false, meta: false, shift: false, alt: false },  // 放大 (含 + 键)
  zoomOut:   { key: '-', ctrl: false, meta: false, shift: false, alt: false },  // 缩小
  resetZoom: { key: '0', ctrl: false, meta: false, shift: false, alt: false },  // 重置缩放
  refresh:   { key: 'F5', ctrl: false, meta: false, shift: false, alt: false }, // 刷新图谱
};

/** 快捷键操作显示名称 */
export const GRAPH_SHORTCUT_LABELS = {
  search:    '搜索',
  zoomIn:    '放大',
  zoomOut:   '缩小',
  resetZoom: '重置缩放',
  refresh:   '刷新图谱',
};

/** 快捷键分类 (用于设置 UI 分组展示) */
export const GRAPH_SHORTCUT_CATEGORIES = {
  search: {
    label: '搜索',
    actions: ['search'],
  },
  zoom: {
    label: '缩放',
    actions: ['zoomIn', 'zoomOut', 'resetZoom'],
  },
  refresh: {
    label: '刷新',
    actions: ['refresh'],
  },
};

// ==================== BookmarkKeyboardShortcuts ====================

export class BookmarkKeyboardShortcuts {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.enabled=true] — 初始启用状态
   */
  constructor(options = {}) {
    /** @type {boolean} */
    this._enabled = options.enabled !== false;

    /** @type {Map<string, Function[]>} action → callback[] */
    this._handlers = new Map();

    /** @type {Object|null} 缓存的自定义绑定 (null = 未加载) */
    this._cachedBindings = null;
  }

  // ==================== 状态控制 ====================

  /**
   * 是否已启用
   * @returns {boolean}
   */
  isEnabled() {
    return this._enabled;
  }

  /**
   * 启用快捷键
   */
  enable() {
    this._enabled = true;
  }

  /**
   * 禁用快捷键 (禁用后 matchAction/handleEvent 返回 null)
   */
  disable() {
    this._enabled = false;
  }

  // ==================== 事件匹配 ====================

  /**
   * 检查 keydown 事件匹配哪个 action
   * @param {Object} event — keydown 事件 (或兼容对象)
   * @returns {string|null} action 名称，不匹配返回 null
   */
  matchAction(event) {
    if (!this._enabled || !event) return null;

    const bindings = this._cachedBindings || DEFAULT_GRAPH_SHORTCUTS;

    for (const [action, binding] of Object.entries(bindings)) {
      if (this._matchBinding(event, binding)) {
        return action;
      }
    }
    return null;
  }

  /**
   * 处理 keydown 事件: 匹配 + 分发回调
   * @param {Object} event
   * @returns {string|null} 匹配的 action，不匹配返回 null
   */
  handleEvent(event) {
    const action = this.matchAction(event);
    if (action !== null) {
      this.dispatch(action);
    }
    return action;
  }

  // ==================== 回调管理 ====================

  /**
   * 注册 action 回调
   * @param {string} action
   * @param {Function} callback — (action) => void
   */
  on(action, callback) {
    if (!this._handlers.has(action)) {
      this._handlers.set(action, []);
    }
    this._handlers.get(action).push(callback);
  }

  /**
   * 移除 action 回调
   * @param {string} action
   * @param {Function} callback
   */
  off(action, callback) {
    const list = this._handlers.get(action);
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx !== -1) list.splice(idx, 1);
  }

  /**
   * 手动分发 action (触发已注册的回调)
   * @param {string} action
   */
  dispatch(action) {
    const list = this._handlers.get(action);
    if (!list) return;
    for (const cb of [...list]) {
      try {
        cb(action);
      } catch {
        // 回调异常不影响其他回调
      }
    }
  }

  // ==================== 绑定管理 ====================

  /**
   * 获取当前快捷键绑定 (合并自定义 + 默认)
   * @returns {Promise<Object>}
   */
  async getBindings() {
    // 如果已有缓存且没有 Chrome API，直接返回默认值
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return { ...DEFAULT_GRAPH_SHORTCUTS };
    }

    const result = await storageGet({ [STORAGE_KEY]: {} });
    const saved = result[STORAGE_KEY] || {};
    const merged = {};
    for (const [action, defaultBinding] of Object.entries(DEFAULT_GRAPH_SHORTCUTS)) {
      const savedBinding = saved[action] || {};
      merged[action] = {
        key: savedBinding.key ?? defaultBinding.key,
        ctrl: savedBinding.ctrl ?? defaultBinding.ctrl,
        meta: savedBinding.meta ?? defaultBinding.meta,
        shift: savedBinding.shift ?? defaultBinding.shift,
        alt: savedBinding.alt ?? defaultBinding.alt,
      };
    }
    this._cachedBindings = merged;
    return merged;
  }

  /**
   * 设置单个 action 的快捷键绑定
   * @param {string} action
   * @param {{ key: string, ctrl?: boolean, meta?: boolean, shift?: boolean, alt?: boolean }} binding
   * @returns {Promise<void>}
   */
  async setBinding(action, binding) {
    if (!DEFAULT_GRAPH_SHORTCUTS[action]) return;

    const bindings = await this.getBindings();
    bindings[action] = {
      key: binding.key,
      ctrl: !!binding.ctrl,
      meta: !!binding.meta,
      shift: !!binding.shift,
      alt: !!binding.alt,
    };
    this._cachedBindings = bindings;

    if (typeof chrome !== 'undefined' && chrome.storage) {
      return storageSet({ [STORAGE_KEY]: bindings });
    }
  }

  /**
   * 重置为默认绑定
   * @returns {Promise<void>}
   */
  async resetBindings() {
    const defaults = { ...DEFAULT_GRAPH_SHORTCUTS };
    this._cachedBindings = defaults;

    if (typeof chrome !== 'undefined' && chrome.storage) {
      return storageSet({ [STORAGE_KEY]: defaults });
    }
  }

  // ==================== 冲突检测 ====================

  /**
   * 检测新绑定是否与已有快捷键冲突
   * @param {string} excludeAction — 排除的 action (正在修改的)
   * @param {Object} newBinding — 新绑定
   * @returns {Promise<{ conflict: boolean, conflictAction: string|null, conflictLabel: string|null }>}
   */
  async detectConflict(excludeAction, newBinding) {
    if (!newBinding || !newBinding.key) {
      return { conflict: false, conflictAction: null, conflictLabel: null };
    }

    const bindings = await this.getBindings();
    for (const [action, binding] of Object.entries(bindings)) {
      if (action === excludeAction) continue;
      if (this._bindingsEqual(binding, newBinding)) {
        return {
          conflict: true,
          conflictAction: action,
          conflictLabel: GRAPH_SHORTCUT_LABELS[action] || action,
        };
      }
    }

    return { conflict: false, conflictAction: null, conflictLabel: null };
  }

  // ==================== 格式化 ====================

  /**
   * 格式化快捷键绑定为可读字符串
   * @param {Object|null} binding
   * @returns {string}
   */
  formatBinding(binding) {
    if (!binding || !binding.key) return '无';

    const parts = [];
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.alt) parts.push('Alt');
    if (binding.shift) parts.push('Shift');
    if (binding.meta) parts.push('Meta');

    let keyName = binding.key;
    if (keyName === ' ') keyName = 'Space';
    else if (keyName.length === 1) keyName = keyName.toUpperCase();

    parts.push(keyName);
    return parts.join('+');
  }

  /**
   * 获取快捷键摘要 (用于设置 UI 展示)
   * @returns {Promise<Array<{ action: string, label: string, display: string, binding: Object, category: string }>>}
   */
  async getShortcutsSummary() {
    const bindings = await this.getBindings();
    const summary = [];

    for (const [category, catInfo] of Object.entries(GRAPH_SHORTCUT_CATEGORIES)) {
      for (const action of catInfo.actions) {
        const binding = bindings[action];
        summary.push({
          action,
          label: GRAPH_SHORTCUT_LABELS[action] || action,
          display: this.formatBinding(binding),
          binding,
          category,
        });
      }
    }

    return summary;
  }

  // ==================== 清理 ====================

  /**
   * 清理所有资源
   */
  destroy() {
    this._handlers.clear();
    this._cachedBindings = null;
  }

  // ==================== 内部方法 ====================

  /**
   * 检查 keydown 事件是否匹配指定绑定
   * @param {Object} event
   * @param {Object} binding
   * @returns {boolean}
   */
  _matchBinding(event, binding) {
    if (!binding || !binding.key) return false;

    // 支持 zoomIn 的特殊匹配: 默认 = 但也接受 +
    const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    let bindingKey = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key;

    // zoomIn 特殊: = 也匹配 + (用户按 Shift+= 产生 +)
    if (bindingKey === '=' && eventKey === '+') return true;
    if (bindingKey === '+' && eventKey === '=') return true;

    if (eventKey !== bindingKey) return false;

    // 修饰键精确匹配
    if (binding.ctrl !== !!event.ctrlKey) return false;
    if (binding.alt !== !!event.altKey) return false;
    if (binding.shift !== !!event.shiftKey) return false;
    if (binding.meta !== !!event.metaKey) return false;

    return true;
  }

  /**
   * 判断两个绑定是否相同
   * @param {Object} a
   * @param {Object} b
   * @returns {boolean}
   */
  _bindingsEqual(a, b) {
    if (!a || !b) return false;
    const norm = (o) => ({
      key: (o.key || '').toLowerCase(),
      ctrl: !!o.ctrl,
      meta: !!o.meta,
      shift: !!o.shift,
      alt: !!o.alt,
    });
    const na = norm(a);
    const nb = norm(b);
    return na.key === nb.key
      && na.ctrl === nb.ctrl
      && na.meta === nb.meta
      && na.shift === nb.shift
      && na.alt === nb.alt;
  }
}
