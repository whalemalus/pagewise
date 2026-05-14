/**
 * BookmarkDuplicateDetector — 书签重复检测器
 *
 * 在 BookmarkDedup 基础上扩展高级重复检测:
 *   - findExactDuplicates(bookmarks) — 精确 URL 完全匹配
 *   - findFuzzyDuplicates(bookmarks) — 模糊 URL 匹配 (www/trailing slash/params 差异)
 *   - findTitleDuplicates(bookmarks) — 相同标题不同 URL
 *   - mergeDuplicates(duplicateGroups) — 合并重复组，保留最佳元数据
 *   - getDuplicateStats(bookmarks) — 重复统计概览
 *   - cleanDuplicates(bookmarks, strategy) — 基于策略自动清理
 *
 * 纯前端实现，不依赖外部 API。
 *
 * @module lib/bookmark-duplicate-detector
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
 * @typedef {Object} DuplicateGroup
 * @property {string}     reason — 重复原因
 * @property {string}     type — 'exact' | 'fuzzy' | 'title'
 * @property {Bookmark[]} bookmarks — 组内所有书签
 * @property {string}     [normalizedKey] — 匹配用的 key
 */

/**
 * @typedef {Object} DuplicateStats
 * @property {number} totalBookmarks
 * @property {number} exactDuplicateGroups
 * @property {number} exactDuplicateCount
 * @property {number} fuzzyDuplicateGroups
 * @property {number} fuzzyDuplicateCount
 * @property {number} titleDuplicateGroups
 * @property {number} titleDuplicateCount
 * @property {number} totalDuplicateGroups
 * @property {number} totalDuplicateCount
 * @property {number} uniqueBookmarks
 * @property {number} deduplicationRatio — 可节省比例 (0-1)
 */

// ==================== 跟踪参数 ====================

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'dclid', 'twclid',
  'mc_cid', 'mc_eid', 'ref', '_ga', 'yclid', 'gad_source',
]);

// ==================== 清理策略 ====================

const CLEANUP_STRATEGIES = {
  /** 保留最新的书签 */
  'keep-newest': (group) => {
    return group.sort((a, b) => {
      const da = a.dateAdded || a.lastModified || '';
      const db = b.dateAdded || b.lastModified || '';
      return db.localeCompare(da); // 降序 → 最新在前
    });
  },
  /** 保留最旧的书签 (可能是原始书签) */
  'keep-oldest': (group) => {
    return group.sort((a, b) => {
      const da = a.dateAdded || a.lastModified || '';
      const db = b.dateAdded || b.lastModified || '';
      return da.localeCompare(db); // 升序 → 最旧在前
    });
  },
  /** 保留标签最多的书签 */
  'keep-most-tags': (group) => {
    return group.sort((a, b) => {
      const ta = Array.isArray(a.tags) ? a.tags.length : 0;
      const tb = Array.isArray(b.tags) ? b.tags.length : 0;
      return tb - ta;
    });
  },
  /** 保留描述最长的书签 */
  'keep-longest-description': (group) => {
    return group.sort((a, b) => {
      const da = (a.description || '').length;
      const db = (b.description || '').length;
      return db - da;
    });
  },
  /** 保留标题最长的书签 (通常信息量更大) */
  'keep-longest-title': (group) => {
    return group.sort((a, b) => (b.title || '').length - (a.title || '').length);
  },
};

// ==================== BookmarkDuplicateDetector ====================

class BookmarkDuplicateDetector {
  /** @param {Bookmark[]} bookmarks */
  constructor(bookmarks = []) {
    /** @type {Bookmark[]} */
    this.bookmarks = Array.isArray(bookmarks) ? [...bookmarks] : [];
  }

  // ----------------------------------------------------------------
  //  核心检测方法
  // ----------------------------------------------------------------

  /**
   * 精确 URL 重复检测
   *
   * 找出原始 URL 完全相同的书签 (不经过规范化)。
   * 适用于检测复制粘贴产生的完全相同的书签。
   *
   * @param {Bookmark[]} [bookmarks] — 可选，默认使用构造时的书签
   * @returns {DuplicateGroup[]}
   */
  findExactDuplicates(bookmarks) {
    const list = bookmarks || this.bookmarks;
    /** @type {Map<string, Bookmark[]>} */
    const groups = new Map();

    for (const bm of list) {
      if (!bm.url || typeof bm.url !== 'string') continue;
      const key = bm.url.trim();
      if (!key) continue;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bm);
    }

    return [...groups.entries()]
      .filter(([, bms]) => bms.length > 1)
      .map(([key, bms]) => ({
        reason: `URL 精确匹配: ${key}`,
        type: 'exact',
        bookmarks: bms,
        normalizedKey: key,
      }));
  }

  /**
   * 模糊 URL 重复检测
   *
   * 通过 URL 规范化 (移除 www、尾部斜杠、跟踪参数) 找出
   * "本质上相同" 但原始 URL 有细微差异的书签。
   *
   * @param {Bookmark[]} [bookmarks]
   * @returns {DuplicateGroup[]}
   */
  findFuzzyDuplicates(bookmarks) {
    const list = bookmarks || this.bookmarks;
    /** @type {Map<string, Bookmark[]>} */
    const groups = new Map();

    for (const bm of list) {
      if (!bm.url || typeof bm.url !== 'string') continue;
      const normalized = BookmarkDuplicateDetector.normalizeUrl(bm.url);
      if (!normalized) continue;

      if (!groups.has(normalized)) groups.set(normalized, []);
      groups.get(normalized).push(bm);
    }

    // 仅返回组内原始 URL 有差异的 (排除已有的精确重复)
    const results = [];
    for (const [normalizedKey, bms] of groups.entries()) {
      if (bms.length < 2) continue;

      // 检查是否所有 URL 都完全相同
      const uniqueUrls = new Set(bms.map((b) => b.url.trim()));
      if (uniqueUrls.size <= 1) continue; // 精确匹配，由 findExactDuplicates 处理

      results.push({
        reason: `URL 模糊匹配 (规范化后相同: ${normalizedKey})`,
        type: 'fuzzy',
        bookmarks: bms,
        normalizedKey,
      });
    }

    return results;
  }

  /**
   * 标题重复检测
   *
   * 找出标题完全相同但 URL 不同的书签。
   * 这类重复可能是不同来源收录的同一页面。
   *
   * @param {Bookmark[]} [bookmarks]
   * @returns {DuplicateGroup[]}
   */
  findTitleDuplicates(bookmarks) {
    const list = bookmarks || this.bookmarks;
    /** @type {Map<string, Bookmark[]>} */
    const groups = new Map();

    for (const bm of list) {
      if (!bm.title || typeof bm.title !== 'string') continue;
      const key = bm.title.trim().toLowerCase();
      if (!key) continue;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bm);
    }

    // 仅返回标题相同但 URL 不同的组
    return [...groups.entries()]
      .filter(([, bms]) => {
        if (bms.length < 2) return false;
        const urls = new Set(
          bms.map((b) => (b.url || '').trim().toLowerCase()).filter(Boolean)
        );
        return urls.size > 1; // URL 不同才算是"标题重复"
      })
      .map(([key, bms]) => ({
        reason: `标题相同: "${bms[0].title}"`,
        type: 'title',
        bookmarks: bms,
        normalizedKey: key,
      }));
  }

  // ----------------------------------------------------------------
  //  合并与清理
  // ----------------------------------------------------------------

  /**
   * 合并重复组，每组保留最佳元数据的书签，返回要删除的书签
   *
   * "最佳" 由以下因素决定:
   *   - 标签数量多 → 信息更丰富
   *   - 描述长度长 → 信息更完整
   *   - 标题长度长 → 信息更丰富
   *   - URL 不含跟踪参数 → 更干净
   *
   * @param {DuplicateGroup[]} duplicateGroups
   * @returns {{ kept: Bookmark[], removed: Bookmark[], mergeLog: { keptId: string, removedIds: string[], reason: string }[] }}
   */
  mergeDuplicates(duplicateGroups) {
    /** @type {Bookmark[]} */
    const kept = [];
    /** @type {Bookmark[]} */
    const removed = [];
    /** @type {{ keptId: string, removedIds: string[], reason: string }[]} */
    const mergeLog = [];

    for (const group of duplicateGroups) {
      if (!group.bookmarks || group.bookmarks.length < 2) continue;

      // 评分选择最佳书签
      const scored = group.bookmarks.map((bm) => ({
        bookmark: bm,
        score: BookmarkDuplicateDetector._scoreBookmark(bm),
      }));

      scored.sort((a, b) => b.score - a.score);

      const best = scored[0].bookmark;
      const rest = scored.slice(1).map((s) => s.bookmark);

      kept.push(best);
      removed.push(...rest);

      mergeLog.push({
        keptId: best.id,
        removedIds: rest.map((r) => r.id),
        reason: group.reason,
      });
    }

    return { kept, removed, mergeLog };
  }

  /**
   * 获取重复统计概览
   *
   * @param {Bookmark[]} [bookmarks]
   * @returns {DuplicateStats}
   */
  getDuplicateStats(bookmarks) {
    const list = bookmarks || this.bookmarks;
    const exactGroups = this.findExactDuplicates(list);
    const fuzzyGroups = this.findFuzzyDuplicates(list);
    const titleGroups = this.findTitleDuplicates(list);

    const exactCount = exactGroups.reduce((sum, g) => sum + g.bookmarks.length, 0);
    const fuzzyCount = fuzzyGroups.reduce((sum, g) => sum + g.bookmarks.length, 0);
    const titleCount = titleGroups.reduce((sum, g) => sum + g.bookmarks.length, 0);

    const allDuplicateIds = new Set();
    for (const g of [...exactGroups, ...fuzzyGroups, ...titleGroups]) {
      for (const bm of g.bookmarks) {
        allDuplicateIds.add(bm.id);
      }
    }

    return {
      totalBookmarks: list.length,
      exactDuplicateGroups: exactGroups.length,
      exactDuplicateCount: exactCount,
      fuzzyDuplicateGroups: fuzzyGroups.length,
      fuzzyDuplicateCount: fuzzyCount,
      titleDuplicateGroups: titleGroups.length,
      titleDuplicateCount: titleCount,
      totalDuplicateGroups: exactGroups.length + fuzzyGroups.length + titleGroups.length,
      totalDuplicateCount: allDuplicateIds.size,
      uniqueBookmarks: list.length - allDuplicateIds.size + (exactGroups.length + fuzzyGroups.length + titleGroups.length),
      deduplicationRatio: list.length === 0 ? 0 : +(allDuplicateIds.size / list.length).toFixed(4),
    };
  }

  /**
   * 基于策略自动清理重复书签
   *
   * 支持的策略:
   *   - 'keep-newest'            — 保留最新添加的书签
   *   - 'keep-oldest'            — 保留最早添加的书签
   *   - 'keep-most-tags'         — 保留标签最多的书签
   *   - 'keep-longest-description' — 保留描述最长的书签
   *   - 'keep-longest-title'     — 保留标题最长的书签
   *
   * @param {Bookmark[]} [bookmarks]
   * @param {string} [strategy='keep-newest']
   * @returns {{ cleaned: Bookmark[], removed: Bookmark[], strategy: string, groupsProcessed: number }}
   */
  cleanDuplicates(bookmarks, strategy = 'keep-newest') {
    const list = bookmarks || this.bookmarks;
    const sortFn = CLEANUP_STRATEGIES[strategy];
    if (!sortFn) {
      throw new Error(
        `未知清理策略: "${strategy}". 支持的策略: ${Object.keys(CLEANUP_STRATEGIES).join(', ')}`
      );
    }

    // 收集所有重复组 (精确 + 模糊 + 标题)
    const allGroups = [
      ...this.findExactDuplicates(list),
      ...this.findFuzzyDuplicates(list),
      ...this.findTitleDuplicates(list),
    ];

    /** @type {Set<string>} 已处理的书签 ID */
    const processed = new Set();
    /** @type {Bookmark[]} */
    const removed = [];
    let groupsProcessed = 0;

    for (const group of allGroups) {
      // 跳过已有成员被处理过的组
      const unprocessed = group.bookmarks.filter((bm) => !processed.has(bm.id));
      if (unprocessed.length < 2) continue;

      // 按策略排序
      const sorted = sortFn([...unprocessed]);
      const keeper = sorted[0];
      const toRemove = sorted.slice(1);

      processed.add(keeper.id);
      for (const bm of toRemove) {
        processed.add(bm.id);
        removed.push(bm);
      }

      groupsProcessed++;
    }

    // 构建清理后的书签列表
    const removedIds = new Set(removed.map((b) => b.id));
    const cleaned = list.filter((bm) => !removedIds.has(bm.id));

    return { cleaned, removed, strategy, groupsProcessed };
  }

  // ----------------------------------------------------------------
  //  静态工具方法
  // ----------------------------------------------------------------

  /**
   * URL 规范化
   *
   * @param {string} url
   * @returns {string}
   */
  static normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';

    let normalized = url.trim();

    // 移除协议
    normalized = normalized.replace(/^https?:\/\//i, '');

    // 移除 www. 前缀
    normalized = normalized.replace(/^www\./i, '');

    // 分离路径和查询/锚点
    const [rest, fragment] = normalized.split('#');
    const [pathPart, queryPart] = rest.split('?');

    // 处理查询参数 — 移除跟踪参数
    let cleanQuery = '';
    if (queryPart) {
      const params = queryPart.split('&');
      const kept = params.filter((p) => {
        const key = p.split('=')[0].toLowerCase();
        return !TRACKING_PARAMS.has(key) && !key.startsWith('utm_');
      });
      if (kept.length > 0) {
        cleanQuery = '?' + kept.join('&');
      }
    }

    // 重建 URL 并转小写
    let result = pathPart.toLowerCase() + cleanQuery;
    if (fragment !== undefined) {
      result += '#' + fragment.toLowerCase();
    }

    // 移除尾部斜杠 (但保留仅 "/" 的情况)
    if (result.length > 1) {
      result = result.replace(/\/+$/, '');
    }

    return result;
  }

  /**
   * 为书签评分 — 信息越丰富得分越高
   *
   * @param {Bookmark} bm
   * @returns {number}
   * @private
   */
  static _scoreBookmark(bm) {
    let score = 0;

    // 标签数量 (+3 每个)
    if (Array.isArray(bm.tags)) {
      score += bm.tags.length * 3;
    }

    // 描述长度 (+1 每 10 字符，最多 10 分)
    const descLen = (bm.description || '').length;
    score += Math.min(Math.floor(descLen / 10), 10);

    // 标题长度 (+1 每 5 字符，最多 5 分)
    const titleLen = (bm.title || '').length;
    score += Math.min(Math.floor(titleLen / 5), 5);

    // URL 不含跟踪参数 (+5)
    if (bm.url && !TRACKING_PARAMS_RE.test(bm.url)) {
      score += 5;
    }

    // 有 folderPath (+2)
    if (Array.isArray(bm.folderPath) && bm.folderPath.length > 0) {
      score += 2;
    }

    return score;
  }
}

/** 匹配跟踪参数的正则 */
const TRACKING_PARAMS_RE = /[?&](utm_|fbclid|gclid|msclkid|dclid|twclid|mc_cid|mc_eid|yclid|gad_source)/i;

export { BookmarkDuplicateDetector, CLEANUP_STRATEGIES };
export default BookmarkDuplicateDetector;
