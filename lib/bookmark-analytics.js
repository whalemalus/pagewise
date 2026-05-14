/**
 * BookmarkAnalytics — 书签分析仪表盘
 *
 * 提供书签集合的多维度分析:
 *   - getOverview(bookmarks)      — 总数、文件夹数、标签数、域名数概览
 *   - getTimeline(bookmarks)      — 按日/周/月统计书签添加时间线
 *   - getDomainStats(bookmarks)   — 按域名统计书签数量（Top N）
 *   - getTagStats(bookmarks)      — 标签使用频率统计
 *   - getFolderDepth(bookmarks)   — 文件夹深度分布
 *   - getGrowthRate(bookmarks)    — 书签增长率（按月/季度）
 *
 * 纯前端实现，不依赖外部 API。
 *
 * @module lib/bookmark-analytics
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 * @property {string}   [description]
 * @property {string}   [dateAdded]
 * @property {string}   [lastModified]
 */

/**
 * @typedef {Object} Overview
 * @property {number} totalBookmarks
 * @property {number} totalFolders   — 不同 folderPath 数量
 * @property {number} totalTags      — 不同标签数
 * @property {number} totalDomains   — 不同域名数
 * @property {number} bookmarksWithTags      — 有标签的书签数
 * @property {number} bookmarksWithFolders   — 有 folderPath 的书签数
 * @property {number} bookmarksWithoutUrl    — 无 URL 的书签数
 * @property {number} avgTagsPerBookmark     — 平均每书签标签数
 */

/**
 * @typedef {Object} TimelineEntry
 * @property {string} period  — 时间段标识 (如 '2024-01-15', '2024-W03', '2024-01')
 * @property {number} count   — 该时间段新增书签数
 */

/**
 * @typedef {Object} DomainEntry
 * @property {string} domain
 * @property {number} count
 * @property {number} percentage — 占比 (0-100)
 */

/**
 * @typedef {Object} TagEntry
 * @property {string} tag
 * @property {number} count
 * @property {number} percentage — 占比 (0-100)
 */

/**
 * @typedef {Object} FolderDepthEntry
 * @property {number} depth   — 0=根目录, 1=一级文件夹, ...
 * @property {number} count   — 该深度的书签数
 * @property {number} percentage — 占比 (0-100)
 */

/**
 * @typedef {Object} GrowthEntry
 * @property {string} period       — 时间段标识 (如 '2024-01')
 * @property {number} count        — 该时间段新增数
 * @property {number} cumulative   — 累计总数
 * @property {number|null} growthRate — 增长率 (与上期比)，第一期为 null
 */

// ==================== BookmarkAnalytics ====================

class BookmarkAnalytics {
  /**
   * 概览统计
   *
   * @param {Bookmark[]} bookmarks
   * @returns {Overview}
   */
  static getOverview(bookmarks) {
    const list = Array.isArray(bookmarks) ? bookmarks : [];

    const folders = new Set();
    const tags = new Set();
    const domains = new Set();
    let bookmarksWithTags = 0;
    let bookmarksWithFolders = 0;
    let bookmarksWithoutUrl = 0;
    let totalTagCount = 0;

    for (const bm of list) {
      // 文件夹
      if (Array.isArray(bm.folderPath) && bm.folderPath.length > 0) {
        bookmarksWithFolders++;
        // 注册每一级路径
        for (let i = 1; i <= bm.folderPath.length; i++) {
          folders.add(bm.folderPath.slice(0, i).join('/'));
        }
      }

      // 标签
      if (Array.isArray(bm.tags) && bm.tags.length > 0) {
        bookmarksWithTags++;
        totalTagCount += bm.tags.length;
        for (const tag of bm.tags) {
          if (typeof tag === 'string' && tag.trim()) {
            tags.add(tag.trim().toLowerCase());
          }
        }
      }

      // 域名
      if (bm.url && typeof bm.url === 'string') {
        const domain = BookmarkAnalytics._extractDomain(bm.url);
        if (domain) domains.add(domain);
      } else {
        bookmarksWithoutUrl++;
      }
    }

    return {
      totalBookmarks: list.length,
      totalFolders: folders.size,
      totalTags: tags.size,
      totalDomains: domains.size,
      bookmarksWithTags,
      bookmarksWithFolders,
      bookmarksWithoutUrl,
      avgTagsPerBookmark: list.length === 0
        ? 0
        : +(totalTagCount / list.length).toFixed(2),
    };
  }

  /**
   * 时间线分析 — 书签按时间添加的趋势
   *
   * @param {Bookmark[]} bookmarks
   * @param {'daily'|'weekly'|'monthly'} [granularity='daily']
   * @returns {TimelineEntry[]} 按时间升序排列
   */
  static getTimeline(bookmarks, granularity = 'daily') {
    const list = Array.isArray(bookmarks) ? bookmarks : [];
    /** @type {Map<string, number>} */
    const counts = new Map();

    for (const bm of list) {
      if (!bm.dateAdded) continue;
      const key = BookmarkAnalytics._toPeriod(bm.dateAdded, granularity);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    // 按时间升序
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, count]) => ({ period, count }));
  }

  /**
   * 域名统计 — 按域名统计书签数量
   *
   * @param {Bookmark[]} bookmarks
   * @param {number} [topN=20] — 返回前 N 个域名
   * @returns {DomainEntry[]} 按 count 降序
   */
  static getDomainStats(bookmarks, topN = 20) {
    const list = Array.isArray(bookmarks) ? bookmarks : [];
    /** @type {Map<string, number>} */
    const counts = new Map();
    let withDomain = 0;

    for (const bm of list) {
      if (!bm.url || typeof bm.url !== 'string') continue;
      const domain = BookmarkAnalytics._extractDomain(bm.url);
      if (!domain) continue;
      counts.set(domain, (counts.get(domain) || 0) + 1);
      withDomain++;
    }

    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([domain, count]) => ({
        domain,
        count,
        percentage: withDomain === 0 ? 0 : +((count / withDomain) * 100).toFixed(2),
      }));
  }

  /**
   * 标签使用频率统计
   *
   * @param {Bookmark[]} bookmarks
   * @param {number} [topN=20] — 返回前 N 个标签
   * @returns {TagEntry[]} 按 count 降序
   */
  static getTagStats(bookmarks, topN = 20) {
    const list = Array.isArray(bookmarks) ? bookmarks : [];
    /** @type {Map<string, number>} */
    const counts = new Map();
    let totalTagUsages = 0;

    for (const bm of list) {
      if (!Array.isArray(bm.tags)) continue;
      for (const tag of bm.tags) {
        if (typeof tag !== 'string' || !tag.trim()) continue;
        const normalized = tag.trim().toLowerCase();
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
        totalTagUsages++;
      }
    }

    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([tag, count]) => ({
        tag,
        count,
        percentage: totalTagUsages === 0 ? 0 : +((count / totalTagUsages) * 100).toFixed(2),
      }));
  }

  /**
   * 文件夹深度分布
   *
   * @param {Bookmark[]} bookmarks
   * @returns {FolderDepthEntry[]} 按 depth 升序
   */
  static getFolderDepth(bookmarks) {
    const list = Array.isArray(bookmarks) ? bookmarks : [];
    /** @type {Map<number, number>} */
    const depthCounts = new Map();

    for (const bm of list) {
      const depth = Array.isArray(bm.folderPath) ? bm.folderPath.length : 0;
      depthCounts.set(depth, (depthCounts.get(depth) || 0) + 1);
    }

    const total = list.length;

    return [...depthCounts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([depth, count]) => ({
        depth,
        count,
        percentage: total === 0 ? 0 : +((count / total) * 100).toFixed(2),
      }));
  }

  /**
   * 书签增长率分析
   *
   * @param {Bookmark[]} bookmarks
   * @param {'monthly'|'quarterly'} [granularity='monthly']
   * @returns {GrowthEntry[]} 按时间升序
   */
  static getGrowthRate(bookmarks, granularity = 'monthly') {
    const list = Array.isArray(bookmarks) ? bookmarks : [];

    // 先按月收集
    /** @type {Map<string, number>} */
    const monthlyCounts = new Map();

    for (const bm of list) {
      if (!bm.dateAdded) continue;
      const month = BookmarkAnalytics._toPeriod(bm.dateAdded, 'monthly');
      if (!month) continue;
      monthlyCounts.set(month, (monthlyCounts.get(month) || 0) + 1);
    }

    // 如果是季度，合并月份
    /** @type {Map<string, number>} */
    const periodCounts = new Map();

    if (granularity === 'quarterly') {
      for (const [month, count] of monthlyCounts.entries()) {
        const quarter = BookmarkAnalytics._monthToQuarter(month);
        periodCounts.set(quarter, (periodCounts.get(quarter) || 0) + count);
      }
    } else {
      for (const [month, count] of monthlyCounts.entries()) {
        periodCounts.set(month, count);
      }
    }

    // 排序并计算累计与增长率
    const sorted = [...periodCounts.entries()].sort(([a], [b]) => a.localeCompare(b));
    /** @type {GrowthEntry[]} */
    const result = [];
    let cumulative = 0;
    let prevCount = 0;

    for (const [period, count] of sorted) {
      cumulative += count;
      const growthRate = prevCount === 0 ? null : +(((count - prevCount) / prevCount) * 100).toFixed(2);
      result.push({ period, count, cumulative, growthRate });
      prevCount = count;
    }

    return result;
  }

  // ----------------------------------------------------------------
  //  内部工具
  // ----------------------------------------------------------------

  /**
   * 从 URL 提取域名
   * @param {string} url
   * @returns {string}
   * @private
   */
  static _extractDomain(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      // 先尝试用 URL 构造
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      // 回退：手动提取
      let cleaned = url.trim().replace(/^https?:\/\//i, '');
      const slash = cleaned.indexOf('/');
      if (slash !== -1) cleaned = cleaned.slice(0, slash);
      cleaned = cleaned.replace(/^www\./i, '').toLowerCase();
      return cleaned || '';
    }
  }

  /**
   * 将日期字符串转换为时间段标识
   * @param {string} dateStr
   * @param {'daily'|'weekly'|'monthly'} granularity
   * @returns {string}
   * @private
   */
  static _toPeriod(dateStr, granularity) {
    if (!dateStr || typeof dateStr !== 'string') return '';

    // 支持 ISO 格式和常见日期格式
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    if (granularity === 'daily') {
      return `${year}-${month}-${day}`;
    }

    if (granularity === 'weekly') {
      // ISO 周数计算
      const jan4 = new Date(year, 0, 4);
      const dayOfYear = Math.floor((d - jan4) / 86400000);
      const weekNum = Math.floor((dayOfYear + jan4.getDay()) / 7) + 1;
      return `${year}-W${String(weekNum).padStart(2, '0')}`;
    }

    // monthly
    return `${year}-${month}`;
  }

  /**
   * 月份标识转季度标识
   * @param {string} monthKey — 'YYYY-MM'
   * @returns {string} — 'YYYY-Q1' 等
   * @private
   */
  static _monthToQuarter(monthKey) {
    const parts = monthKey.split('-');
    if (parts.length < 2) return monthKey;
    const year = parts[0];
    const m = parseInt(parts[1], 10);
    const q = Math.ceil(m / 3);
    return `${year}-Q${q}`;
  }
}

export { BookmarkAnalytics };
export default BookmarkAnalytics;
