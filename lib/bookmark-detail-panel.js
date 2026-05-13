/**
 * BookmarkDetailPanel — 书签详情面板
 *
 * 点击图谱节点后显示书签详情，支持:
 *   - 书签元数据展示 (标题/URL/文件夹/添加时间)
 *   - 标签编辑 (添加/删除/自动补全)
 *   - 状态标记 (unread/reading/read)
 *   - 相似书签列表 (Top-5)
 *   - 操作回调 (打开URL/编辑标签/标记状态)
 *
 * 设计为纯数据+渲染逻辑，不依赖 DOM，可集成到任意 UI 框架。
 */

import { formatDateByLocale } from './bookmark-i18n.js'

/** 允许的书签状态 */
const VALID_STATUSES = ['unread', 'reading', 'read'];

/** 相似书签默认最大数量 */
const DEFAULT_SIMILAR_LIMIT = 5;

// ==================== BookmarkDetailPanel ====================

export class BookmarkDetailPanel {
  constructor() {
    /** @type {boolean} 面板是否可见 */
    this._visible = false;

    /** @type {Object|null} 当前显示的书签 */
    this._bookmark = null;

    /** @type {Array} 当前书签的标签列表 */
    this._tags = [];

    /** @type {string} 当前书签状态 */
    this._status = 'unread';

    /** @type {Array<{ id: string, title: string, url: string, score: number }>} 相似书签 */
    this._similarBookmarks = [];

    /** @type {Function[]} 操作回调列表 */
    this._actionCallbacks = [];

    /** @type {string[]} 全局标签池 (用于自动补全) */
    this._allTags = [];

    /** @type {Object|null} 上一个显示的书签 (用于 undo) */
    this._previousBookmark = null;
  }

  // ==================== 核心 API ====================

  /**
   * 显示书签详情面板
   * @param {Object} bookmark — 书签对象 (NormalizedBookmark 格式)
   * @param {Array<{ id: string, title: string, url: string, score: number }>} [similarBookmarks=[]] — 相似书签列表
   */
  show(bookmark, similarBookmarks = []) {
    if (!bookmark || !bookmark.id) {
      return;
    }

    // 保存上一个书签 (方便回退)
    if (this._bookmark && this._bookmark.id !== bookmark.id) {
      this._previousBookmark = { ...this._bookmark };
    }

    this._bookmark = { ...bookmark };

    // 初始化标签 — 从书签的 tags 字段读取，或为空
    this._tags = Array.isArray(bookmark.tags)
      ? [...bookmark.tags]
      : [];

    // 初始化状态 — 从书签的 status 字段读取，默认 unread
    this._status = VALID_STATUSES.includes(bookmark.status)
      ? bookmark.status
      : 'unread';

    // 相似书签 — 限制为 Top-5
    this._similarBookmarks = Array.isArray(similarBookmarks)
      ? similarBookmarks.slice(0, DEFAULT_SIMILAR_LIMIT).map(s => ({
          id: String(s.id),
          title: s.title || s.bookmark?.title || '',
          url: s.url || s.bookmark?.url || '',
          score: typeof s.score === 'number' ? s.score : 0,
        }))
      : [];

    this._visible = true;

    this._emitAction('show', {
      bookmarkId: bookmark.id,
      title: bookmark.title,
    });
  }

  /**
   * 隐藏面板
   */
  hide() {
    this._visible = false;
    this._emitAction('hide', { bookmarkId: this._bookmark?.id || null });
  }

  /**
   * 更新当前显示的书签 (保留标签/状态编辑)
   * @param {Object} bookmark — 更新后的书签对象
   */
  update(bookmark) {
    if (!bookmark || !bookmark.id) {
      return;
    }

    if (!this._bookmark) {
      // 如果面板未显示书签，等同于 show
      this.show(bookmark);
      return;
    }

    const prevId = this._bookmark.id;
    this._bookmark = { ...bookmark };

    // 如果 ID 不变，保留已编辑的标签和状态
    if (bookmark.id === prevId) {
      // 仅在 bookmark 有新 tags 且当前标签为空时覆盖
      if (Array.isArray(bookmark.tags) && this._tags.length === 0) {
        this._tags = [...bookmark.tags];
      }
      // 仅在 bookmark 有新 status 时覆盖
      if (VALID_STATUSES.includes(bookmark.status) && this._status === 'unread') {
        this._status = bookmark.status;
      }
    } else {
      // ID 变了，重新初始化标签和状态
      this._tags = Array.isArray(bookmark.tags)
        ? [...bookmark.tags]
        : [];
      this._status = VALID_STATUSES.includes(bookmark.status)
        ? bookmark.status
        : 'unread';
    }

    this._emitAction('update', {
      bookmarkId: bookmark.id,
      title: bookmark.title,
    });
  }

  /**
   * 注册操作回调
   * @param {Function} callback — (action, data) => void
   *   action: 'openUrl' | 'addTag' | 'removeTag' | 'changeStatus' | 'switchBookmark' | 'show' | 'hide' | 'update'
   */
  onAction(callback) {
    if (typeof callback === 'function') {
      this._actionCallbacks.push(callback);
    }
  }

  // ==================== 标签管理 ====================

  /**
   * 添加标签
   * @param {string} tag — 标签文本
   * @returns {boolean} 是否添加成功
   */
  addTag(tag) {
    if (!tag || typeof tag !== 'string') return false;

    const normalized = tag.trim().toLowerCase();
    if (!normalized) return false;

    if (this._tags.includes(normalized)) return false;

    this._tags.push(normalized);
    this._emitAction('addTag', {
      bookmarkId: this._bookmark?.id || null,
      tag: normalized,
      tags: [...this._tags],
    });
    return true;
  }

  /**
   * 删除标签
   * @param {string} tag — 标签文本
   * @returns {boolean} 是否删除成功
   */
  removeTag(tag) {
    if (!tag || typeof tag !== 'string') return false;

    const normalized = tag.trim().toLowerCase();
    const index = this._tags.indexOf(normalized);
    if (index === -1) return false;

    this._tags.splice(index, 1);
    this._emitAction('removeTag', {
      bookmarkId: this._bookmark?.id || null,
      tag: normalized,
      tags: [...this._tags],
    });
    return true;
  }

  /**
   * 标签自动补全
   * @param {string} input — 用户输入
   * @returns {string[]} 匹配的标签建议
   */
  getTagSuggestions(input) {
    if (!input || typeof input !== 'string') return [];

    const q = input.trim().toLowerCase();
    if (!q) return [];

    // 从全局标签池中匹配 (排除已有的)
    return this._allTags
      .filter(t => t.includes(q) && !this._tags.includes(t))
      .slice(0, 10);
  }

  /**
   * 设置全局标签池 (用于自动补全)
   * @param {string[]} tags
   */
  setAllTags(tags) {
    this._allTags = Array.isArray(tags)
      ? tags.map(t => String(t).trim().toLowerCase()).filter(Boolean)
      : [];
  }

  // ==================== 状态管理 ====================

  /**
   * 更改书签状态
   * @param {string} status — 'unread' | 'reading' | 'read'
   * @returns {boolean} 是否更改成功
   */
  setStatus(status) {
    if (!VALID_STATUSES.includes(status)) return false;
    if (this._status === status) return false; // 无变化

    const prevStatus = this._status;
    this._status = status;

    this._emitAction('changeStatus', {
      bookmarkId: this._bookmark?.id || null,
      status,
      prevStatus,
    });
    return true;
  }

  /**
   * 获取当前状态
   * @returns {string}
   */
  getStatus() {
    return this._status;
  }

  /**
   * 获取允许的状态列表
   * @returns {string[]}
   */
  getValidStatuses() {
    return [...VALID_STATUSES];
  }

  // ==================== 相似书签 ====================

  /**
   * 更新相似书签列表
   * @param {Array} similarBookmarks
   */
  updateSimilar(similarBookmarks) {
    this._similarBookmarks = Array.isArray(similarBookmarks)
      ? similarBookmarks.slice(0, DEFAULT_SIMILAR_LIMIT).map(s => ({
          id: String(s.id),
          title: s.title || s.bookmark?.title || '',
          url: s.url || s.bookmark?.url || '',
          score: typeof s.score === 'number' ? s.score : 0,
        }))
      : [];
  }

  /**
   * 切换到相似书签的详情
   * @param {string} bookmarkId
   * @returns {Object|null} 相似书签对象
   */
  switchToSimilar(bookmarkId) {
    if (!bookmarkId) return null;

    const similar = this._similarBookmarks.find(s => s.id === String(bookmarkId));
    if (!similar) return null;

    // 构造一个书签对象用于 show
    const bookmark = {
      id: similar.id,
      title: similar.title,
      url: similar.url,
      folderPath: [],
      dateAdded: 0,
      dateAddedISO: '',
    };

    this._emitAction('switchBookmark', {
      fromId: this._bookmark?.id || null,
      toId: bookmarkId,
    });

    // 不自动 show — 返回给调用方决定 (可能需要重新获取完整书签数据)
    return bookmark;
  }

  // ==================== URL 操作 ====================

  /**
   * 触发打开 URL 的操作
   * 通过 chrome.tabs.create 或回调通知
   * @returns {string|null} 要打开的 URL
   */
  openUrl() {
    if (!this._bookmark || !this._bookmark.url) return null;

    const url = this._bookmark.url;

    // 如果有 chrome.tabs API，直接打开
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    }

    this._emitAction('openUrl', {
      bookmarkId: this._bookmark.id,
      url,
    });

    return url;
  }

  // ==================== 查询方法 ====================

  /**
   * 面板是否可见
   * @returns {boolean}
   */
  isVisible() {
    return this._visible;
  }

  /**
   * 获取当前面板数据 (用于渲染)
   * @returns {Object|null}
   */
  getPanelData() {
    if (!this._bookmark) return null;

    return {
      bookmark: { ...this._bookmark },
      tags: [...this._tags],
      status: this._status,
      similarBookmarks: [...this._similarBookmarks],
      visible: this._visible,
      formattedDate: this._formatDate(this._bookmark.dateAdded),
      formattedFolderPath: this._formatFolderPath(this._bookmark.folderPath),
    };
  }

  /**
   * 获取当前标签列表
   * @returns {string[]}
   */
  getTags() {
    return [...this._tags];
  }

  // ==================== 内部方法 ====================

  /**
   * 触发操作回调
   * @param {string} action
   * @param {Object} data
   */
  _emitAction(action, data) {
    for (const cb of this._actionCallbacks) {
      try {
        cb(action, data);
      } catch {
        // 回调异常不应影响面板逻辑
      }
    }
  }

  /**
   * 格式化日期
   * @param {number} dateAdded — 时间戳 (ms)
   * @returns {string}
   */
  _formatDate(dateAdded) {
    return formatDateByLocale(dateAdded)
  }

  /**
   * 格式化文件夹路径
   * @param {string[]} folderPath
   * @returns {string}
   */
  _formatFolderPath(folderPath) {
    if (!Array.isArray(folderPath) || folderPath.length === 0) return '/';
    return '/' + folderPath.join('/');
  }
}
