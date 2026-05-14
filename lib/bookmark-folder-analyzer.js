/**
 * BookmarkFolderAnalyzer — 文件夹分析
 *
 * 分析书签文件夹结构，统计各文件夹的书签数量和分布，
 * 识别低质量文件夹（过少/过多/空），并建议整理方案。
 *
 * 质量评估规则:
 *   - 优秀 (excellent): 5-30 个书签
 *   - 正常 (normal):    3-4 个书签
 *   - 过少 (underused): < 3 个书签 — 建议合并
 *   - 过多 (overcrowded): > 50 个书签 — 建议拆分子文件夹
 *   - 空 (empty):       0 个书签 — 建议删除
 *
 * 纯前端实现，不依赖外部 API。
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 */

// ==================== 常量 ====================

const QUALITY_THRESHOLDS = {
  EXCELLENT_MIN: 5,
  EXCELLENT_MAX: 30,
  UNDERUSED_MAX: 3,       // < 3 → underused
  OVERCROWDED_MIN: 50,    // > 50 → overcrowded
};

const DEFAULT_OVERCROWDED = 50;
const DEFAULT_UNDERUSED = 3;

// ==================== 主类 ====================

class BookmarkFolderAnalyzer {
  /** @param {Bookmark[]} bookmarks */
  constructor(bookmarks = []) {
    /** @type {Bookmark[]} */
    this.bookmarks = Array.isArray(bookmarks) ? [...bookmarks] : [];
  }

  // ----------------------------------------------------------------
  //  核心方法
  // ----------------------------------------------------------------

  /**
   * 分析所有文件夹
   * @returns {{path: string, count: number, depth: number, quality: string, suggestions: string[]}[]}
   */
  analyzeFolders() {
    const map = this._buildFolderMap();
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folderPath, count]) => ({
        path: folderPath,
        count,
        depth: this._calcDepth(folderPath),
        quality: this._assessQuality(count),
        suggestions: this._makeSuggestions(folderPath, count),
      }));
  }

  /**
   * 获取空文件夹列表
   * @returns {string[]}
   */
  getEmptyFolders() {
    return this.analyzeFolders()
      .filter((f) => f.quality === 'empty')
      .map((f) => f.path);
  }

  /**
   * 获取过度拥挤的文件夹
   * @param {number} [threshold=50]
   * @returns {{path: string, count: number}[]}
   */
  getOvercrowdedFolders(threshold = DEFAULT_OVERCROWDED) {
    const map = this._buildFolderMap();
    return [...map.entries()]
      .filter(([, count]) => count > threshold)
      .map(([folderPath, count]) => ({ path: folderPath, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 获取使用不足的文件夹
   * @param {number} [threshold=3]
   * @returns {{path: string, count: number}[]}
   */
  getUnderusedFolders(threshold = DEFAULT_UNDERUSED) {
    const map = this._buildFolderMap();
    return [...map.entries()]
      .filter(([, count]) => count > 0 && count < threshold)
      .map(([folderPath, count]) => ({ path: folderPath, count }))
      .sort((a, b) => a.count - b.count);
  }

  /**
   * 获取文件夹树形结构
   * @returns {{name: string, children: object[], count: number}[]}
   */
  getFolderTree() {
    const map = this._buildFolderMap();
    const root = { name: 'root', children: new Map(), count: 0 };

    for (const [folderPath, count] of map.entries()) {
      const parts = folderPath.split('/').filter(Boolean);
      let node = root;
      for (const part of parts) {
        if (!node.children.has(part)) {
          node.children.set(part, { name: part, children: new Map(), count: 0 });
        }
        node = node.children.get(part);
      }
      node.count = count;
    }

    return this._serializeTree(root);
  }

  /**
   * 建议整理方案
   * @returns {{action: string, source: string, target: string, reason: string}[]}
   */
  suggestReorganization() {
    const suggestions = [];
    const map = this._buildFolderMap();
    const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    // 空文件夹 → 建议删除
    for (const [folderPath, count] of entries) {
      if (count === 0) {
        suggestions.push({
          action: 'delete',
          source: folderPath,
          target: '',
          reason: `文件夹 "${folderPath}" 为空，建议删除`,
        });
      }
    }

    // 过少 → 建议合并到同级文件夹
    const underused = entries.filter(([, c]) => c > 0 && c < QUALITY_THRESHOLDS.UNDERUSED_MAX);
    for (const [folderPath, count] of underused) {
      const parent = this._parentPath(folderPath);
      const siblings = entries.filter(
        ([fp, c]) => this._parentPath(fp) === parent && fp !== folderPath && c > 0
      );
      const mergeTarget = siblings.length > 0
        ? siblings.sort((a, b) => a[1] - b[1])[0][0]
        : parent || '(root)';
      suggestions.push({
        action: 'merge',
        source: folderPath,
        target: mergeTarget,
        reason: `文件夹 "${folderPath}" 仅 ${count} 个书签，建议合并到 "${mergeTarget}"`,
      });
    }

    // 过多 → 建议拆分
    const overcrowded = entries.filter(([, c]) => c > QUALITY_THRESHOLDS.OVERCROWDED_MIN);
    for (const [folderPath, count] of overcrowded) {
      suggestions.push({
        action: 'split',
        source: folderPath,
        target: `${folderPath}/子分类`,
        reason: `文件夹 "${folderPath}" 有 ${count} 个书签，建议拆分为子文件夹`,
      });
    }

    return suggestions;
  }

  /**
   * 获取最大文件夹深度
   * @returns {number}
   */
  getMaxDepth() {
    const map = this._buildFolderMap();
    if (map.size === 0) return 0;
    let max = 0;
    for (const folderPath of map.keys()) {
      const d = this._calcDepth(folderPath);
      if (d > max) max = d;
    }
    return max;
  }

  /**
   * 分析文件夹结构 (深度分布、宽度分布、统计摘要)
   * @returns {{totalFolders: number, maxDepth: number, depthDistribution: Record<number, number>, widthDistribution: Record<number, number>, avgBookmarksPerFolder: number}}
   */
  analyzeFolderStructure() {
    const map = this._buildFolderMap();
    const depthDistribution = {};
    const widthDistribution = {};

    for (const [folderPath, count] of map.entries()) {
      const depth = this._calcDepth(folderPath);
      depthDistribution[depth] = (depthDistribution[depth] || 0) + 1;
      // 宽度按书签数量分桶 (0-5, 6-10, 11-30, 31-50, 50+)
      const bucket = count <= 5 ? '0-5' : count <= 10 ? '6-10' : count <= 30 ? '11-30' : count <= 50 ? '31-50' : '50+';
      widthDistribution[bucket] = (widthDistribution[bucket] || 0) + 1;
    }

    const totalCount = [...map.values()].reduce((a, b) => a + b, 0);

    return {
      totalFolders: map.size,
      maxDepth: this.getMaxDepth(),
      depthDistribution,
      widthDistribution,
      avgBookmarksPerFolder: map.size === 0 ? 0 : +(totalCount / map.size).toFixed(2),
    };
  }

  /**
   * 查找重复书签 (同一 URL 出现在不同文件夹)
   * @returns {{url: string, folders: string[], count: number}[]}
   */
  getDuplicateBookmarks() {
    const urlMap = new Map(); // url → Set of folder paths

    for (const bm of this.bookmarks) {
      if (!bm.url) continue;
      const normalized = this._normalizeUrl(bm.url);
      const folders = Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : '(root)';
      if (!urlMap.has(normalized)) {
        urlMap.set(normalized, new Set());
      }
      urlMap.get(normalized).add(folders);
    }

    const duplicates = [];
    for (const [url, folderSet] of urlMap.entries()) {
      if (folderSet.size > 1) {
        duplicates.push({
          url,
          folders: [...folderSet].sort(),
          count: folderSet.size,
        });
      }
    }

    return duplicates.sort((a, b) => b.count - a.count);
  }

  /**
   * 获取每个文件夹的统计信息
   * @returns {{folder: string, count: number, urls: string[], lastModified: string|null}[]}
   */
  getFolderStats() {
    const statsMap = new Map(); // folder → { urls, modified }

    for (const bm of this.bookmarks) {
      const folders = Array.isArray(bm.folderPath) ? bm.folderPath : [];
      const leaf = folders.length > 0 ? folders.join('/') : '(root)';

      if (!statsMap.has(leaf)) {
        statsMap.set(leaf, { urls: [], modified: bm.lastModified || bm.dateAdded || null });
      }
      const entry = statsMap.get(leaf);
      if (bm.url) entry.urls.push(bm.url);

      // 取最新的修改时间
      const bmDate = bm.lastModified || bm.dateAdded || null;
      if (bmDate && (!entry.modified || bmDate > entry.modified)) {
        entry.modified = bmDate;
      }
    }

    return [...statsMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folder, data]) => ({
        folder,
        count: data.urls.length,
        urls: data.urls,
        lastModified: data.modified,
      }));
  }

  /**
   * 智能文件夹组织建议 (基于内容分析)
   * @returns {{folder: string, suggestedName: string, reason: string, confidence: number}[]}
   */
  suggestOrganization() {
    const suggestions = [];
    const map = this._buildFolderMap();

    // 策略 1: 空文件夹 → 删除
    for (const [folderPath, count] of map.entries()) {
      if (count === 0) {
        suggestions.push({
          folder: folderPath,
          suggestedName: null,
          reason: '空文件夹，建议删除',
          confidence: 1.0,
        });
      }
    }

    // 策略 2: 拥挤文件夹 → 基于 URL 关键词建议子分类
    const overcrowded = [...map.entries()].filter(([, c]) => c > QUALITY_THRESHOLDS.OVERCROWDED_MIN);
    for (const [folderPath] of overcrowded) {
      const folderBookmarks = this.bookmarks.filter(
        (bm) => Array.isArray(bm.folderPath) && bm.folderPath.join('/') === folderPath
      );
      const urlKeywords = this._extractUrlKeywords(folderBookmarks);
      for (const keyword of urlKeywords.slice(0, 3)) {
        suggestions.push({
          folder: folderPath,
          suggestedName: `${folderPath}/${keyword}`,
          reason: `基于 URL 关键词 "${keyword}" 建议拆分子文件夹`,
          confidence: 0.7,
        });
      }
    }

    // 策略 3: 使用不足的文件夹 → 建议合并
    const underused = [...map.entries()].filter(
      ([, c]) => c > 0 && c < QUALITY_THRESHOLDS.UNDERUSED_MAX
    );
    for (const [folderPath] of underused) {
      const parent = this._parentPath(folderPath);
      suggestions.push({
        folder: folderPath,
        suggestedName: parent || '(root)',
        reason: `文件夹书签过少，建议合并到上级 "${parent || '(root)'}"`,
        confidence: 0.8,
      });
    }

    // 策略 4: 深度过大 → 建议扁平化
    for (const [folderPath] of map.entries()) {
      if (this._calcDepth(folderPath) > 4) {
        suggestions.push({
          folder: folderPath,
          suggestedName: this._flattenPath(folderPath),
          reason: `文件夹嵌套过深 (${this._calcDepth(folderPath)} 层)，建议扁平化`,
          confidence: 0.6,
        });
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 导出文件夹树
   * @param {'text'|'json'} [format='text']
   * @returns {string}
   */
  exportFolderTree(format = 'text') {
    const tree = this.getFolderTree();

    if (format === 'json') {
      return JSON.stringify(tree, null, 2);
    }

    // text format: indented text
    const lines = [];
    const renderNode = (node, indent) => {
      const prefix = '  '.repeat(indent);
      const countStr = node.count > 0 ? ` (${node.count})` : '';
      lines.push(`${prefix}${node.name}${countStr}`);
      for (const child of node.children) {
        renderNode(child, indent + 1);
      }
    };
    for (const node of tree) {
      renderNode(node, 0);
    }
    return lines.join('\n');
  }

  // ----------------------------------------------------------------
  //  内部方法
  // ----------------------------------------------------------------

  /**
   * 构建文件夹 → 书签数量映射
   * @returns {Map<string, number>}
   * @private
   */
  _buildFolderMap() {
    const map = new Map();

    for (const bm of this.bookmarks) {
      const folders = Array.isArray(bm.folderPath) ? bm.folderPath : [];

      // 每层文件夹都计数
      for (let i = 0; i <= folders.length; i++) {
        const sub = folders.slice(0, i).join('/');
        if (sub === '') continue; // 跳过根路径
        map.set(sub, (map.get(sub) || 0) + 1);
      }
    }

    return map;
  }

  /**
   * 计算文件夹深度 (以 / 分隔的层级数)
   * @private
   */
  _calcDepth(folderPath) {
    return folderPath.split('/').filter(Boolean).length;
  }

  /**
   * 评估文件夹质量
   * @private
   */
  _assessQuality(count) {
    if (count === 0) return 'empty';
    if (count < QUALITY_THRESHOLDS.UNDERUSED_MAX) return 'underused';
    if (count > QUALITY_THRESHOLDS.OVERCROWDED_MIN) return 'overcrowded';
    if (count >= QUALITY_THRESHOLDS.EXCELLENT_MIN && count <= QUALITY_THRESHOLDS.EXCELLENT_MAX) {
      return 'excellent';
    }
    return 'normal';
  }

  /**
   * 根据质量生成建议文字
   * @private
   */
  _makeSuggestions(folderPath, count) {
    const q = this._assessQuality(count);
    switch (q) {
      case 'empty':
        return ['建议删除空文件夹'];
      case 'underused':
        return ['书签过少，建议合并到同级文件夹'];
      case 'overcrowded':
        return ['书签过多，建议拆分为子文件夹'];
      case 'excellent':
        return ['书签数量适中，结构良好'];
      default:
        return [];
    }
  }

  /**
   * 获取父文件夹路径
   * @private
   */
  _parentPath(folderPath) {
    const parts = folderPath.split('/').filter(Boolean);
    parts.pop();
    return parts.join('/');
  }

  /**
   * 规范化 URL (去尾部斜杠、小写化 scheme/host)
   * @private
   */
  _normalizeUrl(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname.replace(/\/+$/, '') + u.search + u.hash;
    } catch {
      return url.replace(/\/+$/, '');
    }
  }

  /**
   * 从 URL 中提取关键词作为子分类建议
   * @private
   */
  _extractUrlKeywords(bookmarks) {
    const freq = new Map();
    for (const bm of bookmarks) {
      if (!bm.url) continue;
      try {
        const hostname = new URL(bm.url).hostname.replace(/^www\./, '');
        const parts = hostname.split('.').filter((p) => p.length > 3 && !['com', 'org', 'net', 'io', 'dev'].includes(p));
        for (const p of parts) {
          freq.set(p, (freq.get(p) || 0) + 1);
        }
      } catch { /* skip invalid URLs */ }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  }

  /**
   * 扁平化过深的路径 (保留首尾)
   * @private
   */
  _flattenPath(folderPath) {
    const parts = folderPath.split('/').filter(Boolean);
    if (parts.length <= 2) return folderPath;
    return parts[0] + '/' + parts[parts.length - 1];
  }

  /**
   * 递归序列化树 (将 Map 转为数组)
   * @private
   */
  _serializeTree(node) {
    const children = [];
    for (const child of node.children.values()) {
      children.push({
        name: child.name,
        children: this._serializeTree(child),
        count: child.count,
      });
    }
    return children;
  }
}

export { BookmarkFolderAnalyzer, QUALITY_THRESHOLDS };
