/**
 * BookmarkStatistics — 统计仪表盘数据
 *
 * 从书签数组中计算各类统计指标，为仪表盘 UI 提供数据源。
 * 纯 ES Module，不依赖 DOM 或 Chrome API。
 *
 * 支持:
 *   - getTrend: 按日/周/月聚合收藏趋势
 *   - getDistribution: 按文件夹第一级分组的分布数据
 *   - getHeatmap: 星期×小时活跃度热力图 (7×24)
 *   - getSummary: 总览摘要（总数、域名数、Top 文件夹、日均、连续天数）
 */

export class BookmarkStatistics {
  /**
   * @param {Array<{id:string, title:string, url:string, folderPath:string[], dateAdded:number, tags:string[]}>} bookmarks
   */
  constructor(bookmarks = []) {
    /** @type {Array} */
    this.bookmarks = bookmarks;
  }

  /**
   * 按日/周/月聚合收藏趋势
   *
   * @param {'day'|'week'|'month'} [granularity='month'] — 聚合粒度
   * @returns {{period:string, count:number}[]} 按时间升序排列
   */
  getTrend(granularity = 'month') {
    const buckets = new Map();

    for (const bm of this.bookmarks) {
      const d = new Date(bm.dateAdded);
      let key;

      switch (granularity) {
        case 'day': {
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          key = `${y}-${m}-${day}`;
          break;
        }
        case 'week': {
          // ISO week number
          const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          // Adjust to Thursday of this week (ISO 8601)
          tmp.setUTCDate(tmp.getUTCDate() + 3 - ((tmp.getUTCDay() + 6) % 7));
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
          const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
          const isoYear = tmp.getUTCFullYear();
          key = `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
          break;
        }
        case 'month':
        default: {
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          key = `${y}-${m}`;
          break;
        }
      }

      buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    // Sort by period ascending
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, count]) => ({ period, count }));
  }

  /**
   * 按 folderPath[0] 分组的领域分布
   *
   * @returns {{name:string, count:number, percentage:number}[]} 按 count 降序
   */
  getDistribution() {
    const total = this.bookmarks.length;
    if (total === 0) return [];

    const counts = new Map();
    for (const bm of this.bookmarks) {
      const name = (bm.folderPath && bm.folderPath.length > 0) ? bm.folderPath[0] : '(未分类)';
      counts.set(name, (counts.get(name) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / total) * 10000) / 100,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 活跃度热力图
   *
   * @returns {number[][]} 7×24 矩阵 (行=星期 0=Sun..6=Sat, 列=小时 0..23)
   */
  getHeatmap() {
    // Initialize 7×24 matrix with zeros
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));

    for (const bm of this.bookmarks) {
      const d = new Date(bm.dateAdded);
      const day = d.getUTCDay();   // 0=Sun..6=Sat
      const hour = d.getUTCHours(); // 0..23
      matrix[day][hour]++;
    }

    return matrix;
  }

  /**
   * 总览摘要
   *
   * @returns {{total:number, uniqueDomains:number, topFolders:{name:string,count:number}[], avgPerDay:number, streakDays:number}}
   */
  getSummary() {
    const total = this.bookmarks.length;

    if (total === 0) {
      return { total: 0, uniqueDomains: 0, topFolders: [], avgPerDay: 0, streakDays: 0 };
    }

    // Unique domains
    const domains = new Set();
    for (const bm of this.bookmarks) {
      try {
        domains.add(new URL(bm.url).hostname);
      } catch {
        // ignore invalid URLs
      }
    }

    // Top folders (folderPath[0])
    const folderCounts = new Map();
    for (const bm of this.bookmarks) {
      const name = (bm.folderPath && bm.folderPath.length > 0) ? bm.folderPath[0] : '(未分类)';
      folderCounts.set(name, (folderCounts.get(name) || 0) + 1);
    }
    const topFolders = [...folderCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Average per day
    const timestamps = this.bookmarks.map(bm => bm.dateAdded).sort((a, b) => a - b);
    const firstDay = new Date(timestamps[0]);
    const lastDay = new Date(timestamps[timestamps.length - 1]);
    // Normalize to UTC day start
    const firstDayMs = Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), firstDay.getUTCDate());
    const lastDayMs = Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate());
    const spanDays = Math.max(1, Math.round((lastDayMs - firstDayMs) / 86400000) + 1);
    const avgPerDay = Math.round((total / spanDays) * 100) / 100;

    // Longest streak of consecutive days
    const uniqueDays = new Set();
    for (const bm of this.bookmarks) {
      const d = new Date(bm.dateAdded);
      uniqueDays.add(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
    const sortedDays = [...uniqueDays].sort((a, b) => a - b);
    let maxStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      if (sortedDays[i] - sortedDays[i - 1] === 86400000) {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else {
        currentStreak = 1;
      }
    }

    return {
      total,
      uniqueDomains: domains.size,
      topFolders,
      avgPerDay,
      streakDays: sortedDays.length > 0 ? maxStreak : 0,
    };
  }
}
