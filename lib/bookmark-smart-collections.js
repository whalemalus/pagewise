/**
 * BookmarkSmartCollections — 智能集合引擎
 *
 * 基于规则的动态集合，自动将符合规则的书签归入集合。
 * 支持:
 *   - 规则类型: 标签/领域/文件夹/状态/域名/时间范围
 *   - 多规则组合 (AND 逻辑)
 *   - 集合自动更新 (书签变更后重新评估)
 *   - 内置集合: "未读"、"最近添加"、"本周阅读"
 *   - 自定义集合持久化 (序列化/反序列化)
 *
 * 纯数据模块，不依赖 DOM 或 Chrome API。
 */

import { BOOKMARK_I18N_KEYS, bookmarkZhCN, bookmarkEnUS } from './bookmark-i18n.js'
import { t as i18nT, registerLocale } from './i18n.js'

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 * @property {string}   [status] — 'unread' | 'reading' | 'read'
 * @property {number}   [dateAdded] — 毫秒时间戳
 */

/**
 * @typedef {Object} Rule
 * @property {'tags'|'domain'|'folder'|'status'|'dateRange'|'category'} type
 * @property {*} value — 规则参数 (字符串/字符串数组/日期范围对象)
 */

/**
 * @typedef {Object} SmartCollection
 * @property {string}  id
 * @property {string}  name
 * @property {Rule[]}  rules — 所有规则需同时满足 (AND)
 * @property {boolean} builtin — 是否内置集合
 * @property {number}  createdAt
 */

/** @type {string[]} 合法规则类型 */
const VALID_RULE_TYPES = ['tags', 'domain', 'folder', 'status', 'dateRange', 'category'];

/** @type {string[]} 合法状态值 (与 BookmarkStatusManager 一致) */
const VALID_STATUSES = ['unread', 'reading', 'read'];

class BookmarkSmartCollections {
  /** @type {Map<string, Bookmark>} id → bookmark */
  #bookmarkMap = new Map();

  /** @type {Map<string, SmartCollection>} collectionId → collection */
  #collections = new Map();

  /** @type {number} 自增 ID */
  #nextId = 1;

  /**
   * @param {Bookmark[]} bookmarks
   * @param {SmartCollection[]} [savedCollections] — 反序列化的自定义集合
   */
  constructor(bookmarks = [], savedCollections = []) {
    if (!Array.isArray(bookmarks)) {
      throw new TypeError('bookmarks must be an array');
    }
    for (const bm of bookmarks) {
      if (bm && bm.id) {
        this.#bookmarkMap.set(String(bm.id), bm);
      }
    }
    // 加载内置集合
    for (const bc of BUILTIN_COLLECTIONS) {
      this.#collections.set(bc.id, { ...bc });
    }
    // 加载已保存的自定义集合
    if (Array.isArray(savedCollections)) {
      for (const sc of savedCollections) {
        if (sc && sc.id && sc.name && Array.isArray(sc.rules)) {
          this.#collections.set(sc.id, {
            ...sc,
            builtin: false,
            createdAt: sc.createdAt || Date.now(),
          });
          // 确保 nextId 不冲突
          const numPart = parseInt(sc.id.replace('custom-', ''), 10);
          if (!isNaN(numPart) && numPart >= this.#nextId) {
            this.#nextId = numPart + 1;
          }
        }
      }
    }
  }

  // ==================== 集合管理 ====================

  /**
   * 创建自定义集合
   * @param {string} name
   * @param {Rule[]} rules
   * @returns {SmartCollection} 创建的集合
   * @throws {Error} 规则无效时
   */
  createCollection(name, rules) {
    if (!name || typeof name !== 'string') {
      throw new Error('name must be a non-empty string');
    }
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error('rules must be a non-empty array');
    }
    // 验证每条规则
    for (const rule of rules) {
      this.#validateRule(rule);
    }
    const id = `custom-${this.#nextId++}`;
    const collection = {
      id,
      name: name.trim(),
      rules,
      builtin: false,
      createdAt: Date.now(),
    };
    this.#collections.set(id, collection);
    return { ...collection };
  }

  /**
   * 删除自定义集合 (内置集合不可删除)
   * @param {string} collectionId
   * @returns {boolean}
   */
  deleteCollection(collectionId) {
    const col = this.#collections.get(collectionId);
    if (!col) return false;
    if (col.builtin) return false;
    this.#collections.delete(collectionId);
    return true;
  }

  /**
   * 更新自定义集合的名称和规则
   * @param {string} collectionId
   * @param {{name?: string, rules?: Rule[]}} updates
   * @returns {SmartCollection|null}
   */
  updateCollection(collectionId, updates) {
    const col = this.#collections.get(collectionId);
    if (!col || col.builtin) return null;
    if (updates.name) {
      col.name = updates.name.trim();
    }
    if (updates.rules) {
      for (const rule of updates.rules) {
        this.#validateRule(rule);
      }
      col.rules = updates.rules;
    }
    return { ...col };
  }

  /**
   * 获取单个集合信息
   * @param {string} collectionId
   * @returns {SmartCollection|null}
   */
  getCollection(collectionId) {
    const col = this.#collections.get(collectionId);
    return col ? { ...col } : null;
  }

  /**
   * 获取所有集合列表
   * @returns {SmartCollection[]}
   */
  listCollections() {
    return [...this.#collections.values()].map(c => ({ ...c }));
  }

  // ==================== 查询匹配 ====================

  /**
   * 获取集合中的匹配书签
   * @param {string} collectionId
   * @returns {Bookmark[]}
   */
  getCollectionBookmarks(collectionId) {
    const col = this.#collections.get(collectionId);
    if (!col) return [];
    return this.#evaluateRules(col.rules);
  }

  /**
   * 获取书签所属的所有集合
   * @param {string} bookmarkId
   * @returns {SmartCollection[]}
   */
  getBookmarkCollections(bookmarkId) {
    const bm = this.#bookmarkMap.get(String(bookmarkId));
    if (!bm) return [];
    const result = [];
    for (const col of this.#collections.values()) {
      if (this.#bookmarkMatchesRules(bm, col.rules)) {
        result.push({ ...col });
      }
    }
    return result;
  }

  /**
   * 获取所有集合及其书签数量
   * @returns {{collection: SmartCollection, count: number}[]}
   */
  getCollectionStats() {
    const result = [];
    for (const col of this.#collections.values()) {
      const bookmarks = this.#evaluateRules(col.rules);
      result.push({ collection: { ...col }, count: bookmarks.length });
    }
    return result;
  }

  // ==================== 书签更新 ====================

  /**
   * 添加书签 (增量更新)
   * @param {Bookmark} bookmark
   */
  addBookmark(bookmark) {
    if (bookmark && bookmark.id) {
      this.#bookmarkMap.set(String(bookmark.id), bookmark);
    }
  }

  /**
   * 移除书签
   * @param {string} bookmarkId
   * @returns {boolean}
   */
  removeBookmark(bookmarkId) {
    return this.#bookmarkMap.delete(String(bookmarkId));
  }

  /**
   * 批量更新书签
   * @param {Bookmark[]} bookmarks
   */
  setBookmarks(bookmarks) {
    this.#bookmarkMap.clear();
    for (const bm of bookmarks) {
      if (bm && bm.id) {
        this.#bookmarkMap.set(String(bm.id), bm);
      }
    }
  }

  // ==================== 序列化 ====================

  /**
   * 导出自定义集合 (不含内置集合)
   * @returns {SmartCollection[]}
   */
  exportCollections() {
    return [...this.#collections.values()]
      .filter(c => !c.builtin)
      .map(c => ({ ...c }));
  }

  // ==================== 内部方法 ====================

  /**
   * 验证规则格式
   * @param {Rule} rule
   * @throws {Error}
   */
  #validateRule(rule) {
    if (!rule || typeof rule !== 'object') {
      throw new Error('rule must be an object');
    }
    if (!VALID_RULE_TYPES.includes(rule.type)) {
      throw new Error(`invalid rule type: ${rule.type}. Must be one of: ${VALID_RULE_TYPES.join(', ')}`);
    }
    if (rule.value === undefined || rule.value === null) {
      throw new Error('rule.value is required');
    }
    // 类型特定验证
    if (rule.type === 'status' && !VALID_STATUSES.includes(rule.value)) {
      throw new Error(`invalid status: ${rule.value}. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    if ((rule.type === 'tags' || rule.type === 'folder') && !Array.isArray(rule.value)) {
      throw new Error(`${rule.type} rule value must be an array`);
    }
    if (rule.type === 'dateRange') {
      if (typeof rule.value !== 'object' || (rule.value.start == null && rule.value.end == null)) {
        throw new Error('dateRange rule must have start and/or end timestamp');
      }
    }
  }

  /**
   * 评估规则集，返回匹配的书签列表
   * @param {Rule[]} rules
   * @returns {Bookmark[]}
   */
  #evaluateRules(rules) {
    const result = [];
    for (const bm of this.#bookmarkMap.values()) {
      if (this.#bookmarkMatchesRules(bm, rules)) {
        result.push(bm);
      }
    }
    return result;
  }

  /**
   * 检查书签是否满足所有规则 (AND 逻辑)
   * @param {Bookmark} bookmark
   * @param {Rule[]} rules
   * @returns {boolean}
   */
  #bookmarkMatchesRules(bookmark, rules) {
    for (const rule of rules) {
      if (!this.#matchesRule(bookmark, rule)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 检查书签是否匹配单条规则
   * @param {Bookmark} bookmark
   * @param {Rule} rule
   * @returns {boolean}
   */
  #matchesRule(bookmark, rule) {
    switch (rule.type) {
      case 'tags':
        return this.#matchesTags(bookmark, rule.value);
      case 'domain':
        return this.#matchesDomain(bookmark, rule.value);
      case 'folder':
        return this.#matchesFolder(bookmark, rule.value);
      case 'status':
        return (bookmark.status || 'unread') === rule.value;
      case 'dateRange':
        return this.#matchesDateRange(bookmark, rule.value);
      case 'category':
        return this.#matchesCategory(bookmark, rule.value);
      default:
        return false;
    }
  }

  /**
   * 标签匹配: 书签包含任一指定标签
   */
  #matchesTags(bookmark, tags) {
    if (!Array.isArray(tags) || tags.length === 0) return true;
    const bmTags = (bookmark.tags || []).map(t => t.toLowerCase());
    return tags.some(t => bmTags.includes(t.toLowerCase()));
  }

  /**
   * 域名匹配: URL 包含指定域名片段
   */
  #matchesDomain(bookmark, domain) {
    if (!domain) return true;
    try {
      const url = new URL(bookmark.url);
      return url.hostname.includes(domain.toLowerCase());
    } catch {
      return false;
    }
  }

  /**
   * 文件夹匹配: 书签路径包含任一指定文件夹
   */
  #matchesFolder(bookmark, folders) {
    if (!Array.isArray(folders) || folders.length === 0) return true;
    const path = (bookmark.folderPath || []).map(f => f.toLowerCase());
    return folders.some(f => path.includes(f.toLowerCase()));
  }

  /**
   * 时间范围匹配
   */
  #matchesDateRange(bookmark, range) {
    if (!bookmark.dateAdded) return false;
    const ts = bookmark.dateAdded;
    if (range.start && ts < range.start) return false;
    if (range.end && ts > range.end) return false;
    return true;
  }

  /**
   * 分类匹配: 基于 URL/标题/标签的关键词匹配 (复用 BookmarkClusterer 逻辑)
   */
  #matchesCategory(bookmark, category) {
    if (!category) return true;
    const cat = category.toLowerCase();
    const text = [
      bookmark.title || '',
      ...(bookmark.tags || []),
      ...(bookmark.folderPath || []),
    ].join(' ').toLowerCase();
    // 简单关键词匹配
    const urlDomain = (() => {
      try { return new URL(bookmark.url).hostname.toLowerCase(); } catch { return ''; }
    })();
    return text.includes(cat) || urlDomain.includes(cat);
  }
}

// ==================== 内置集合定义 ====================

const NOW = Date.now();
const ONE_DAY = 86400000;
const ONE_WEEK = 7 * ONE_DAY;

/**
 * 确保书签语言包已注册（幂等操作）
 */
let _bookmarkLocaleRegistered = false
function _ensureLocale() {
  if (!_bookmarkLocaleRegistered) {
    registerLocale('zh-CN', bookmarkZhCN)
    registerLocale('en-US', bookmarkEnUS)
    _bookmarkLocaleRegistered = true
  }
}

/**
 * 翻译辅助函数 — 将短 key 映射到全局 i18n key
 */
function bt(key) {
  _ensureLocale()
  const i18nKey = BOOKMARK_I18N_KEYS[key]
  return i18nKey ? i18nT(i18nKey) : key
}

/** @type {SmartCollection[]} */
const BUILTIN_COLLECTIONS = [
  {
    id: 'builtin-unread',
    name: bt('collection.unread'),
    rules: [{ type: 'status', value: 'unread' }],
    builtin: true,
    createdAt: NOW,
  },
  {
    id: 'builtin-reading',
    name: bt('collection.reading'),
    rules: [{ type: 'status', value: 'reading' }],
    builtin: true,
    createdAt: NOW,
  },
  {
    id: 'builtin-recent',
    name: bt('collection.recent'),
    rules: [{ type: 'dateRange', value: { start: NOW - ONE_WEEK } }],
    builtin: true,
    createdAt: NOW,
  },
];

export {
  BookmarkSmartCollections,
  VALID_RULE_TYPES,
  VALID_STATUSES,
  BUILTIN_COLLECTIONS,
};
