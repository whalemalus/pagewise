/**
 * ContextMenuManager — 右键增强菜单管理器
 *
 * 统一管理 PageWise 右键菜单项的注册、点击处理与动作分发。
 * 支持三种上下文：选中文本、图片、链接。
 *
 * 菜单项：
 *   选中文本 → "用 PageWise 解释" / "翻译" / "总结"
 *   右键图片 → "识别图片文字" / "描述图片"
 *   右键链接 → "预览链接内容" / "保存为书签"
 */

'use strict';

import { createContextMenu, onContextMenuClicked, PW } from './browser-compat.js';
import { logInfo, logWarn, logError } from './log-store.js';

// ==================== 菜单定义 ====================

/**
 * 所有右键菜单项定义
 * @type {Array<{id: string, title: string, contexts: string[], parentId?: string, type?: string}>}
 */
const MENU_DEFINITIONS = [
  // ---------- 选中文本 ----------
  {
    id: 'pagewise-explain',
    title: '用 PageWise 解释',
    contexts: ['selection'],
    group: 'selection',
  },
  {
    id: 'pagewise-translate',
    title: '翻译',
    contexts: ['selection'],
    group: 'selection',
  },
  {
    id: 'pagewise-summarize',
    title: '总结',
    contexts: ['selection'],
    group: 'selection',
  },

  // ---------- 图片 ----------
  {
    id: 'pagewise-ocr',
    title: '识别图片文字',
    contexts: ['image'],
    group: 'image',
  },
  {
    id: 'pagewise-describe-image',
    title: '描述图片',
    contexts: ['image'],
    group: 'image',
  },

  // ---------- 链接 ----------
  {
    id: 'pagewise-preview-link',
    title: '预览链接内容',
    contexts: ['link'],
    group: 'link',
  },
  {
    id: 'pagewise-save-bookmark',
    title: '保存为书签',
    contexts: ['link'],
    group: 'link',
  },
];

// ==================== 动作映射 ====================

/**
 * 菜单项 ID → 内部动作名映射
 * @type {Object<string, string>}
 */
const ACTION_MAP = {
  'pagewise-explain':        'contextMenuExplain',
  'pagewise-translate':      'contextMenuTranslate',
  'pagewise-summarize':      'contextMenuSummarize',
  'pagewise-ocr':            'contextMenuOCR',
  'pagewise-describe-image': 'contextMenuDescribeImage',
  'pagewise-preview-link':   'contextMenuPreviewLink',
  'pagewise-save-bookmark':  'contextMenuSaveBookmark',
};

// ==================== ContextMenuManager ====================

class ContextMenuManager {
  /**
   * @param {Object} [options]
   * @param {Function} [options.createFn]   — 自定义创建菜单函数（默认用 browser-compat createContextMenu）
   * @param {Function} [options.onClickFn]  — 自定义点击监听函数
   * @param {Function} [options.onAction]   — 菜单动作回调 (action, info, tab) => void
   * @param {Function} [options.sendMessage] — 发送消息到 sidebar 的函数
   */
  constructor(options = {}) {
    /** @type {Function} */
    this._createFn = options.createFn || createContextMenu;
    /** @type {Function} */
    this._onClickFn = options.onClickFn || onContextMenuClicked;
    /** @type {Function|null} */
    this._onAction = options.onAction || null;
    /** @type {Function|null} */
    this._sendMessage = options.sendMessage || null;
    /** @type {boolean} 是否已注册 */
    this._registered = false;
    /** @type {Map<string, Object>} 已注册的菜单项 */
    this._items = new Map();
    /** @type {Array} 收集的事件日志（测试用） */
    this._eventLog = [];
  }

  // ==================== 注册菜单 ====================

  /**
   * 注册所有右键菜单项
   * 幂等操作：重复调用不会创建重复菜单
   */
  registerMenus() {
    if (this._registered) {
      logWarn('context-menu-manager', '菜单已注册，跳过重复注册');
      return;
    }

    for (const def of MENU_DEFINITIONS) {
      try {
        const created = this._createFn({
          id: def.id,
          title: def.title,
          contexts: def.contexts,
        });
        this._items.set(def.id, { ...def, created: true });
        logInfo('context-menu-manager', `菜单项已创建: ${def.id}`, { title: def.title });
      } catch (err) {
        logError('context-menu-manager', `菜单项创建失败: ${def.id}`, { error: err.message });
      }
    }

    this._registered = true;
    logInfo('context-menu-manager', '所有菜单项注册完成', { count: this._items.size });
  }

  /**
   * 监听菜单点击事件
   * 在 registerMenus() 之后调用
   */
  listenForClicks() {
    this._onClickFn((info, tab) => {
      this._handleClick(info, tab);
    });
  }

  // ==================== 点击处理 ====================

  /**
   * 处理菜单点击事件
   * @param {Object} info  — chrome.contextMenus.OnClickData
   * @param {Object} tab   — chrome.tabs.Tab
   * @returns {Object} 动作数据
   * @private
   */
  _handleClick(info, tab) {
    const menuItemId = info.menuItemId;

    // 检查是否是我们的菜单项
    const action = ACTION_MAP[menuItemId];
    if (!action) {
      logWarn('context-menu-manager', `未知菜单项: ${menuItemId}`);
      return null;
    }

    // 构建动作数据
    const data = this._buildActionData(action, info, tab);

    logInfo('context-menu-manager', `菜单动作触发: ${action}`, {
      menuItemId,
      selection: (info.selectionText || '').slice(0, 100),
      srcUrl: info.srcUrl || '',
      linkUrl: info.linkUrl || '',
      tabId: tab?.id,
    });

    // 记录事件
    this._eventLog.push({ action, info, tab, timestamp: Date.now() });

    // 回调
    if (this._onAction) {
      this._onAction(action, info, tab);
    }

    // 发送到侧边栏
    if (this._sendMessage) {
      this._sendMessage(data);
    }

    return data;
  }

  /**
   * 构建发送到 sidebar 的动作数据
   * @param {string} action
   * @param {Object} info
   * @param {Object} tab
   * @returns {Object}
   * @private
   */
  _buildActionData(action, info, tab) {
    const base = {
      action,
      tabId: tab?.id,
      tabUrl: tab?.url,
      tabTitle: tab?.title,
      timestamp: Date.now(),
      source: 'contextMenu',
    };

    switch (action) {
      case 'contextMenuExplain':
      case 'contextMenuTranslate':
      case 'contextMenuSummarize':
        return { ...base, selection: info.selectionText || '', type: 'selection' };

      case 'contextMenuOCR':
      case 'contextMenuDescribeImage':
        return {
          ...base,
          imageUrl: info.srcUrl || '',
          pageUrl: info.pageUrl || tab?.url || '',
          type: 'image',
        };

      case 'contextMenuPreviewLink':
      case 'contextMenuSaveBookmark':
        return {
          ...base,
          linkUrl: info.linkUrl || '',
          linkText: info.linkText || info.selectionText || '',
          type: 'link',
        };

      default:
        return base;
    }
  }

  // ==================== 查询方法 ====================

  /** @returns {boolean} */
  get registered() {
    return this._registered;
  }

  /** @returns {Map<string, Object>} */
  get items() {
    return new Map(this._items);
  }

  /** @returns {number} 已注册菜单项数量 */
  get count() {
    return this._items.size;
  }

  /** @returns {Array} 事件日志 */
  get eventLog() {
    return [...this._eventLog];
  }

  /**
   * 获取所有菜单定义（静态）
   * @returns {Array}
   */
  static get MENU_DEFINITIONS() {
    return [...MENU_DEFINITIONS];
  }

  /**
   * 获取动作映射（静态）
   * @returns {Object}
   */
  static get ACTION_MAP() {
    return { ...ACTION_MAP };
  }

  /**
   * 获取指定上下文的菜单项
   * @param {'selection'|'image'|'link'} context
   * @returns {Array}
   */
  getItemsByContext(context) {
    return MENU_DEFINITIONS.filter(def => def.contexts.includes(context));
  }

  /**
   * 获取指定分组的菜单项
   * @param {'selection'|'image'|'link'} group
   * @returns {Array}
   */
  getItemsByGroup(group) {
    return MENU_DEFINITIONS.filter(def => def.group === group);
  }

  /**
   * 根据菜单项 ID 获取动作名
   * @param {string} menuItemId
   * @returns {string|undefined}
   */
  getAction(menuItemId) {
    return ACTION_MAP[menuItemId];
  }
}

export { ContextMenuManager, MENU_DEFINITIONS, ACTION_MAP };
export default ContextMenuManager;
