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
 * @property {number}   [visitCount]     — 访问次数
 * @property {string}   [lastVisited]    — 最后访问时间
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

/**
 * @typedef {Object} VisitStats
 * @property {number}   totalVisits        — 总访问次数
 * @property {number}   bookmarksVisited   — 至少访问过一次的书签数
 * @property {number}   unvisitedBookmarks — 从未访问的书签数
 * @property {number}   avgVisits          — 平均每书签访问次数
 * @property {number}   maxVisits          — 最大单书签访问次数
 * @property {Array<{id:string, title:string, url:string, visitCount:number}>} topVisited — 最常访问 Top 10
 * @property {Array<{range:string, count:number}>} distribution — 访问次数分布 (0次, 1-5, 6-10, 11-50, 50+)
 */

/**
 * @typedef {Object} CollectionTrendEntry
 * @property {string} date   — 日期 YYYY-MM-DD
 * @property {number} count  — 当天新增数
 * @property {number} cumulative — 累计总数
 */

/**
 * @typedef {Object} DomainDistEntry
 * @property {string} domain
 * @property {number} count
 * @property {number} percentage — 占比 (0-100)
 * @property {string} color      — 推荐颜色标识 (#hex)
 */

/**
 * @typedef {Object} HeatmapData
 * @property {string[]} labels — 行标签 ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
 * @property {string[]} hours  — 列标签 ['00','01',...,'23']
 * @property {number[][]} matrix — 7×24 矩阵 (行=星期, 列=小时)
 * @property {number} maxValue — 矩阵中最大值
 * @property {number} totalEntries — 热力图涵盖的书签数
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
   * 访问统计 — 基于 visitCount 字段分析书签使用情况
   *
   * @param {Bookmark[]} bookmarks
   * @returns {VisitStats}
   */
  static getVisitStats(bookmarks) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const result = {
      totalVisits: 0,
      bookmarksVisited: 0,
      unvisitedBookmarks: 0,
      avgVisits: 0,
      maxVisits: 0,
      topVisited: [],
      distribution: [
        { range: '0', count: 0 },
        { range: '1-5', count: 0 },
        { range: '6-10', count: 0 },
        { range: '11-50', count: 0 },
        { range: '50+', count: 0 },
      ],
    }

    if (list.length === 0) return result

    for (const bm of list) {
      const vc = typeof bm.visitCount === 'number' && bm.visitCount >= 0 ? bm.visitCount : 0
      result.totalVisits += vc
      if (vc > 0) {
        result.bookmarksVisited++
      } else {
        result.unvisitedBookmarks++
      }
      if (vc > result.maxVisits) result.maxVisits = vc

      // 分布桶
      if (vc === 0) result.distribution[0].count++
      else if (vc <= 5) result.distribution[1].count++
      else if (vc <= 10) result.distribution[2].count++
      else if (vc <= 50) result.distribution[3].count++
      else result.distribution[4].count++
    }

    result.avgVisits = +(result.totalVisits / list.length).toFixed(2)

    // Top 10 最常访问
    result.topVisited = [...list]
      .filter(bm => (bm.visitCount || 0) > 0)
      .sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0))
      .slice(0, 10)
      .map(bm => ({
        id: bm.id,
        title: bm.title || '',
        url: bm.url || '',
        visitCount: bm.visitCount || 0,
      }))

    return result
  }

  /**
   * 收藏趋势 — 最近 N 天每天的新增书签数及累计
   *
   * @param {Bookmark[]} bookmarks
   * @param {number} [days=30] — 回溯天数
   * @returns {CollectionTrendEntry[]} 按日期升序
   */
  static getCollectionTrend(bookmarks, days = 30) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const n = typeof days === 'number' && days > 0 ? Math.floor(days) : 30

    // 构建日期范围
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - (n - 1))

    /** @type {Map<string, number>} */
    const dailyCounts = new Map()

    // 初始化每一天为 0
    for (let i = 0; i < n; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = BookmarkAnalytics._formatDate(d)
      dailyCounts.set(key, 0)
    }

    // 统计每个书签落入哪天
    for (const bm of list) {
      if (!bm.dateAdded) continue
      try {
        const d = new Date(bm.dateAdded)
        if (isNaN(d.getTime())) continue
        const key = BookmarkAnalytics._formatDate(d)
        if (dailyCounts.has(key)) {
          dailyCounts.set(key, dailyCounts.get(key) + 1)
        }
      } catch {
        // ignore parse errors
      }
    }

    // 转为结果数组并计算累计
    const entries = [...dailyCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
    /** @type {CollectionTrendEntry[]} */
    const result = []
    let cumulative = 0

    for (const [date, count] of entries) {
      cumulative += count
      result.push({ date, count, cumulative })
    }

    return result
  }

  /**
   * 域名分布 — 返回适合饼图/柱状图的域名数据
   *
   * @param {Bookmark[]} bookmarks
   * @param {number} [topN=15] — 返回前 N 个域名
   * @returns {DomainDistEntry[]} 按 count 降序
   */
  static getDomainDistribution(bookmarks, topN = 15) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    /** @type {Map<string, number>} */
    const counts = new Map()
    let totalWithDomain = 0

    for (const bm of list) {
      if (!bm.url || typeof bm.url !== 'string') continue
      const domain = BookmarkAnalytics._extractDomain(bm.url)
      if (!domain) continue
      counts.set(domain, (counts.get(domain) || 0) + 1)
      totalWithDomain++
    }

    if (totalWithDomain === 0) return []

    // 预定义颜色板 (饼图用)
    const colors = [
      '#4285F4', '#EA4335', '#FBBC05', '#34A853', '#FF6D01',
      '#46BDC6', '#7B1FA2', '#E91E63', '#009688', '#FF5722',
      '#607D8B', '#9C27B0', '#2196F3', '#CDDC39', '#795548',
    ]

    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([domain, count], idx) => ({
        domain,
        count,
        percentage: +((count / totalWithDomain) * 100).toFixed(2),
        color: colors[idx % colors.length],
      }))
  }

  /**
   * 活跃度热力图 — 星期 × 小时的书签添加热度
   *
   * @param {Bookmark[]} bookmarks
   * @param {number} [weeks=4] — 回溯周数 (用于限定时间范围)
   * @returns {HeatmapData}
   */
  static getActivityHeatmap(bookmarks, weeks = 4) {
    const list = Array.isArray(bookmarks) ? bookmarks : []
    const w = typeof weeks === 'number' && weeks > 0 ? Math.floor(weeks) : 4

    // 7×24 矩阵
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0))
    let totalEntries = 0
    let maxValue = 0

    // 时间范围：最近 w 周
    const now = new Date()
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - (w * 7))

    for (const bm of list) {
      if (!bm.dateAdded) continue
      try {
        const d = new Date(bm.dateAdded)
        if (isNaN(d.getTime())) continue
        if (d < cutoff) continue

        // getUTCDay: 0=Sun,1=Mon,...6=Sat → 转换为 Mon=0,...Sun=6
        const dayIdx = (d.getUTCDay() + 6) % 7
        const hourIdx = d.getUTCHours()
        matrix[dayIdx][hourIdx]++
        totalEntries++

        if (matrix[dayIdx][hourIdx] > maxValue) {
          maxValue = matrix[dayIdx][hourIdx]
        }
      } catch {
        // ignore parse errors
      }
    }

    return {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      hours: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
      matrix,
      maxValue,
      totalEntries,
    }
  }

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
    const parts = monthKey.split('-')
    if (parts.length < 2) return monthKey
    const year = parts[0]
    const m = parseInt(parts[1], 10)
    const q = Math.ceil(m / 3)
    return `${year}-Q${q}`
  }

  /**
   * Date → 'YYYY-MM-DD' 字符串
   * @param {Date} d
   * @returns {string}
   * @private
   */
  static _formatDate(d) {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}

export { BookmarkAnalytics };
export default BookmarkAnalytics;
