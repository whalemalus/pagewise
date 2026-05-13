/**
 * BookmarkAdvancedSearch — 高级搜索模块
 *
 * 提供多维度书签过滤:
 *   - 日期范围搜索 (searchByDateRange)
 *   - 域名搜索 (searchByDomain)
 *   - 标签搜索 (searchByTags) — AND / OR 模式
 *   - 文件夹路径搜索 (searchByFolder)
 *   - 组合过滤 (advancedSearch) — 同时应用多个过滤条件
 *
 * 纯前端实现，不依赖外部 API。
 */

// ==================== 日期范围搜索 ====================

/**
 * 按日期范围过滤书签
 *
 * @param {Object[]} bookmarks    — 书签数组
 * @param {Date|string|number} startDate — 起始日期 (包含)
 * @param {Date|string|number} endDate   — 结束日期 (包含)
 * @returns {Object[]} 过滤后的书签
 */
export function searchByDateRange(bookmarks, startDate, endDate) {
  if (!Array.isArray(bookmarks)) return [];
  if (startDate == null || endDate == null) return [];

  const start = _toTimestamp(startDate);
  const end = _toTimestamp(endDate);

  if (start === null || end === null) return [];

  // 保证 start <= end
  const min = Math.min(start, end);
  const max = Math.max(start, end);

  return bookmarks.filter(bm => {
    const ts = _getBookmarkTimestamp(bm);
    if (ts === null) return false;
    return ts >= min && ts <= max;
  });
}

// ==================== 域名搜索 ====================

/**
 * 按域名过滤书签
 *
 * 匹配规则:
 *   - 精确匹配: "github.com" 匹配 "github.com"
 *   - 子域名匹配: "github.com" 匹配 "api.github.com"
 *   - 忽略 www 前缀和大小写
 *
 * @param {Object[]} bookmarks — 书签数组
 * @param {string}   domain    — 目标域名
 * @returns {Object[]} 过滤后的书签
 */
export function searchByDomain(bookmarks, domain) {
  if (!Array.isArray(bookmarks)) return [];
  if (!domain || typeof domain !== 'string') return [];

  const target = domain.trim().toLowerCase().replace(/^www\./, '');
  if (!target) return [];

  return bookmarks.filter(bm => {
    if (!bm || !bm.url || typeof bm.url !== 'string') return false;
    try {
      const hostname = new URL(bm.url).hostname.toLowerCase().replace(/^www\./, '');
      // 精确匹配或子域名匹配
      return hostname === target || hostname.endsWith('.' + target);
    } catch {
      return false;
    }
  });
}

// ==================== 标签搜索 ====================

/**
 * 按标签过滤书签
 *
 * @param {Object[]} bookmarks — 书签数组
 * @param {string[]} tags      — 目标标签数组
 * @param {boolean}  [matchAll=false] — true = AND (所有标签都匹配), false = OR (任一标签匹配)
 * @returns {Object[]} 过滤后的书签
 */
export function searchByTags(bookmarks, tags, matchAll = false) {
  if (!Array.isArray(bookmarks)) return [];
  if (!Array.isArray(tags) || tags.length === 0) return [];

  const targetTags = tags
    .filter(t => t != null && typeof t === 'string')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);

  if (targetTags.length === 0) return [];

  return bookmarks.filter(bm => {
    if (!bm || !Array.isArray(bm.tags)) return false;
    const bmTags = new Set(bm.tags.map(t => String(t).toLowerCase()));

    if (matchAll) {
      // AND: 所有目标标签都必须存在
      return targetTags.every(t => bmTags.has(t));
    } else {
      // OR: 任一目标标签存在即可
      return targetTags.some(t => bmTags.has(t));
    }
  });
}

// ==================== 文件夹搜索 ====================

/**
 * 按文件夹路径过滤书签
 *
 * 匹配规则:
 *   - 精确路径匹配: "技术/前端" 匹配 folderPath ["技术", "前端"]
 *   - 部分匹配: "前端" 匹配 folderPath 中包含 "前端" 的项
 *   - 忽略大小写
 *
 * @param {Object[]} bookmarks  — 书签数组
 * @param {string}   folderPath — 文件夹路径 (用 "/" 分隔的层级路径或单个文件夹名)
 * @returns {Object[]} 过滤后的书签
 */
export function searchByFolder(bookmarks, folderPath) {
  if (!Array.isArray(bookmarks)) return [];
  if (!folderPath || typeof folderPath !== 'string') return [];

  const target = folderPath.trim();
  if (!target) return [];

  // 将路径按 "/" 分割为层级
  const segments = target.split('/').map(s => s.trim()).filter(s => s.length > 0);
  if (segments.length === 0) return [];

  return bookmarks.filter(bm => {
    if (!bm || !Array.isArray(bm.folderPath)) return false;
    const folderArr = bm.folderPath;

    if (segments.length === 1) {
      // 单层: 部分匹配
      const keyword = segments[0].toLowerCase();
      return folderArr.some(f => f.toLowerCase().includes(keyword));
    }

    // 多层: 按顺序连续匹配
    // folderPath ["技术", "前端"] 和 segments ["技术", "前端"] → 匹配
    const lowerFolder = folderArr.map(f => f.toLowerCase());
    const lowerSegments = segments.map(s => s.toLowerCase());

    for (let i = 0; i <= lowerFolder.length - lowerSegments.length; i++) {
      let match = true;
      for (let j = 0; j < lowerSegments.length; j++) {
        if (lowerFolder[i + j] !== lowerSegments[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }

    return false;
  });
}

// ==================== 组合过滤 ====================

/**
 * 高级组合搜索 — 同时应用多个过滤条件
 *
 * 所有提供的条件之间是 AND 关系。
 *
 * @param {Object[]} bookmarks — 书签数组
 * @param {Object}   filters   — 过滤条件
 * @param {Date|string|number} [filters.startDate]  — 起始日期
 * @param {Date|string|number} [filters.endDate]     — 结束日期
 * @param {string}   [filters.domain]    — 域名
 * @param {string[]} [filters.tags]      — 标签数组
 * @param {boolean}  [filters.matchAll]  — 标签匹配模式 (AND/OR)
 * @param {string}   [filters.folderPath] — 文件夹路径
 * @returns {Object[]} 过滤后的书签
 */
export function advancedSearch(bookmarks, filters = {}) {
  if (!Array.isArray(bookmarks)) return [];
  if (!filters || typeof filters !== 'object') return [...bookmarks];

  let results = [...bookmarks];

  // 日期范围
  if (filters.startDate != null && filters.endDate != null) {
    results = searchByDateRange(results, filters.startDate, filters.endDate);
  }

  // 域名
  if (filters.domain) {
    results = searchByDomain(results, filters.domain);
  }

  // 标签
  if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
    results = searchByTags(results, filters.tags, filters.matchAll);
  }

  // 文件夹
  if (filters.folderPath) {
    results = searchByFolder(results, filters.folderPath);
  }

  return results;
}

// ==================== 内部辅助函数 ====================

/**
 * 将各种日期格式转为毫秒时间戳
 * @param {Date|string|number} value
 * @returns {number|null}
 */
function _toTimestamp(value) {
  if (value instanceof Date) {
    const ts = value.getTime();
    return isNaN(ts) ? null : ts;
  }
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  if (typeof value === 'string') {
    const ts = new Date(value).getTime();
    return isNaN(ts) ? null : ts;
  }
  return null;
}

/**
 * 从书签对象提取时间戳 (支持 dateAdded 或 dateAddedISO)
 * @param {Object} bm
 * @returns {number|null}
 */
function _getBookmarkTimestamp(bm) {
  if (!bm) return null;
  if (typeof bm.dateAdded === 'number') return bm.dateAdded;
  if (typeof bm.dateAddedISO === 'string') {
    const ts = new Date(bm.dateAddedISO).getTime();
    return isNaN(ts) ? null : ts;
  }
  return null;
}
