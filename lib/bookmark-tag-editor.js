/**
 * BookmarkTagEditor — 标签手动编辑器
 *
 * 功能:
 *   - 为单个书签添加/删除/设置标签
 *   - 标签自动补全（基于已有标签库 + 书签内置标签）
 *   - 批量编辑标签（多个书签同时添加/删除）
 *   - 标签规范化（小写、去空格、去特殊字符）
 *
 * @module lib/bookmark-tag-editor
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}  id
 * @property {string}  title
 * @property {string}  url
 * @property {string[]} tags
 */

export class BookmarkTagEditor {
  /** @type {Map<string, Bookmark>} */
  #bookmarks;

  /** @type {Set<string>} — 全局已有标签库 */
  #existingTags;

  /**
   * @param {{ bookmarks: Bookmark[], existingTags?: string[] }} opts
   */
  constructor({ bookmarks = [], existingTags = [] } = {}) {
    // 建立 id → bookmark 映射（深拷贝 tags 数组避免污染原始数据）
    this.#bookmarks = new Map();
    for (const bm of bookmarks) {
      this.#bookmarks.set(bm.id, {
        ...bm,
        tags: [...(bm.tags || [])].map((t) => BookmarkTagEditor.normalizeTag(t)).filter(Boolean),
      });
    }

    // 合并已有标签库 + 书签内置标签
    this.#existingTags = new Set();
    for (const t of existingTags) {
      const norm = BookmarkTagEditor.normalizeTag(t);
      if (norm) this.#existingTags.add(norm);
    }
    for (const bm of this.#bookmarks.values()) {
      for (const t of bm.tags) {
        this.#existingTags.add(t);
      }
    }
  }

  // ==================== 静态方法 ====================

  /**
   * 标签规范化
   *  - 转小写
   *  - 去除首尾空格
   *  - 连续空格替换为单个连字符
   *  - 移除特殊字符（保留中文、字母、数字、连字符、下划线）
   *  - 最大长度 30 字符
   *
   * @param {string} tag
   * @returns {string}
   */
  static normalizeTag(tag) {
    if (typeof tag !== 'string') return '';
    let result = tag
      .toLowerCase()
      .trim()
      .replace(/\s{2,}/g, '-')         // 连续空格 → 连字符
      .replace(/[^\p{L}\p{N}_\-]/gu, '') // 保留: Unicode字母(含中文)、数字、_、-
      .slice(0, 30);
    return result;
  }

  // ==================== 查询 ====================

  /**
   * 获取指定书签的标签列表
   * @param {string} bookmarkId
   * @returns {string[]}
   */
  getTags(bookmarkId) {
    const bm = this.#bookmarks.get(bookmarkId);
    return bm ? [...bm.tags] : [];
  }

  /**
   * 获取全局去重标签（排序）
   * @returns {string[]}
   */
  getAllTags() {
    return [...this.#existingTags].sort();
  }

  // ==================== 单书签编辑 ====================

  /**
   * 为书签添加标签
   * @param {string} bookmarkId
   * @param {string} tag
   * @returns {boolean} 是否成功添加（false = 书签不存在或标签已存在）
   */
  addTag(bookmarkId, tag) {
    const bm = this.#bookmarks.get(bookmarkId);
    if (!bm) return false;

    const norm = BookmarkTagEditor.normalizeTag(tag);
    if (!norm) return false;

    if (bm.tags.includes(norm)) return false;

    bm.tags.push(norm);
    this.#existingTags.add(norm);
    return true;
  }

  /**
   * 为书签删除标签
   * @param {string} bookmarkId
   * @param {string} tag
   * @returns {boolean} 是否成功删除
   */
  removeTag(bookmarkId, tag) {
    const bm = this.#bookmarks.get(bookmarkId);
    if (!bm) return false;

    const norm = BookmarkTagEditor.normalizeTag(tag);
    const idx = bm.tags.indexOf(norm);
    if (idx === -1) return false;

    bm.tags.splice(idx, 1);
    return true;
  }

  /**
   * 覆盖书签的全部标签
   * @param {string} bookmarkId
   * @param {string[]} tags
   */
  setTags(bookmarkId, tags) {
    const bm = this.#bookmarks.get(bookmarkId);
    if (!bm) return;

    const normalized = tags
      .map((t) => BookmarkTagEditor.normalizeTag(t))
      .filter(Boolean);

    bm.tags = [...new Set(normalized)];
    for (const t of bm.tags) {
      this.#existingTags.add(t);
    }
  }

  // ==================== 自动补全 ====================

  /**
   * 标签自动补全
   * @param {string} partial - 用户输入片段（已自动规范化前缀匹配）
   * @param {number} [limit=10] - 最大返回数
   * @returns {string[]}
   */
  getAutocomplete(partial, limit = 10) {
    if (typeof partial !== 'string' || !partial.trim()) return [];
    const prefix = BookmarkTagEditor.normalizeTag(partial);
    if (!prefix) return [];

    const results = [];
    for (const tag of this.#existingTags) {
      if (tag.startsWith(prefix)) {
        results.push(tag);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  // ==================== 批量操作 ====================

  /**
   * 批量为多个书签添加标签
   * @param {string[]} bookmarkIds
   * @param {string} tag
   * @returns {number} 成功添加的数量
   */
  batchAddTag(bookmarkIds, tag) {
    let count = 0;
    for (const id of bookmarkIds) {
      if (this.addTag(id, tag)) count++;
    }
    return count;
  }

  /**
   * 批量为多个书签删除标签
   * @param {string[]} bookmarkIds
   * @param {string} tag
   * @returns {number} 成功删除的数量
   */
  batchRemoveTag(bookmarkIds, tag) {
    let count = 0;
    for (const id of bookmarkIds) {
      if (this.removeTag(id, tag)) count++;
    }
    return count;
  }
}
