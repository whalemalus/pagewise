/**
 * BookmarkStatusManager — 状态标记
 *
 * 管理书签的阅读状态: unread / reading / read。
 * 支持单个/批量设置状态、按状态过滤、状态统计、
 * 批量标记已读、获取最近阅读列表。
 *
 * 状态值:
 *   - unread:  未读（默认）
 *   - reading: 正在阅读
 *   - read:    已读
 *
 * 纯前端实现，不依赖外部 API。
 */

/** @type {string[]} 合法状态列表 */
const VALID_STATUSES = ['unread', 'reading', 'read'];

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 */

class BookmarkStatusManager {
  /** @type {Map<string, Bookmark>} id → bookmark 快速查找 */
  #bookmarkMap = new Map();

  /** @type {Map<string, {status: string, updatedAt: number}>} id → 状态记录 */
  #statusMap = new Map();

  /** @type {number} 单调递增计数器，确保排序稳定性 */
  #tick = 0;

  /**
   * @param {Bookmark[]} bookmarks
   */
  constructor(bookmarks = []) {
    if (!Array.isArray(bookmarks)) {
      throw new TypeError('bookmarks must be an array');
    }
    for (const bm of bookmarks) {
      if (bm && bm.id) {
        this.#bookmarkMap.set(String(bm.id), bm);
      }
    }
  }

  // ==================== 核心方法 ====================

  /**
   * 设置单个书签状态
   * @param {string} bookmarkId
   * @param {string} status — 'unread' | 'reading' | 'read'
   * @returns {boolean} 是否设置成功
   */
  setStatus(bookmarkId, status) {
    const id = String(bookmarkId);
    if (!VALID_STATUSES.includes(status)) return false;
    if (!this.#bookmarkMap.has(id)) return false;

    this.#statusMap.set(id, { status, updatedAt: ++this.#tick });
    return true;
  }

  /**
   * 获取单个书签状态
   * @param {string} bookmarkId
   * @returns {'unread' | 'reading' | 'read' | null}
   */
  getStatus(bookmarkId) {
    const id = String(bookmarkId);
    if (!this.#bookmarkMap.has(id)) return null;

    const record = this.#statusMap.get(id);
    return record ? record.status : 'unread';
  }

  /**
   * 批量设置状态
   * @param {string[]} bookmarkIds
   * @param {string}   status
   * @returns {number} 成功设置的数量
   */
  batchSetStatus(bookmarkIds, status) {
    if (!Array.isArray(bookmarkIds)) return 0;
    if (!VALID_STATUSES.includes(status)) return 0;

    let count = 0;
    for (const id of bookmarkIds) {
      if (this.setStatus(id, status)) count++;
    }
    return count;
  }

  /**
   * 按状态过滤书签
   * @param {string} status
   * @returns {Bookmark[]}
   */
  getByStatus(status) {
    if (!VALID_STATUSES.includes(status)) return [];

    const results = [];
    for (const [id, bm] of this.#bookmarkMap) {
      if (this.getStatus(id) === status) {
        results.push(bm);
      }
    }
    return results;
  }

  /**
   * 获取各状态的数量统计
   * @returns {{unread: number, reading: number, read: number}}
   */
  getStatusCounts() {
    const counts = { unread: 0, reading: 0, read: 0 };
    for (const [id] of this.#bookmarkMap) {
      const status = this.getStatus(id);
      counts[status]++;
    }
    return counts;
  }

  /**
   * 批量标记为已读
   * @param {string[]} bookmarkIds
   * @returns {number} 成功标记的数量
   */
  markAllAsRead(bookmarkIds) {
    return this.batchSetStatus(bookmarkIds, 'read');
  }

  /**
   * 获取最近阅读的书签（按 updatedAt 降序）
   * @param {number} [limit=10] 最多返回数量
   * @returns {Bookmark[]}
   */
  getRecentlyRead(limit = 10) {
    const entries = [];
    for (const [id, record] of this.#statusMap) {
      if (record.status === 'read' && this.#bookmarkMap.has(id)) {
        entries.push({ bookmark: this.#bookmarkMap.get(id), updatedAt: record.updatedAt });
      }
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries.slice(0, limit).map(e => e.bookmark);
  }
}

// ==================== 导出 ====================

export { BookmarkStatusManager, VALID_STATUSES };
