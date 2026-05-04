/**
 * BookmarkCollector — 书签采集器
 *
 * 递归读取 Chrome 书签树，返回标准化书签数组。
 * 支持 1000+ 书签，采集时间 < 5 秒。
 */

/**
 * @typedef {Object} NormalizedBookmark
 * @property {string}   id            — Chrome 书签 ID
 * @property {string}   title         — 标题
 * @property {string}   url           — URL (书签节点可能无 URL)
 * @property {string[]} folderPath    — 文件夹路径 ["技术", "前端", "React"]
 * @property {number}   dateAdded     — 添加时间戳 (ms)
 * @property {string}   dateAddedISO  — ISO 格式日期
 */

export class BookmarkCollector {
  constructor() {
    /** @type {NormalizedBookmark[]} */
    this.bookmarks = [];
    /** @type {Map<string, NormalizedBookmark[]>} url → bookmarks */
    this._urlIndex = new Map();
  }

  // ==================== 核心采集 ====================

  /**
   * 递归读取 Chrome 书签树，返回标准化书签数组
   * @returns {Promise<NormalizedBookmark[]>}
   */
  async collect() {
    this.bookmarks = [];
    this._urlIndex = new Map();

    let tree;
    try {
      tree = await chrome.bookmarks.getTree();
    } catch (err) {
      throw new Error(`Failed to read bookmark tree: ${err.message}`);
    }

    if (!tree || !Array.isArray(tree) || tree.length === 0) {
      return this.bookmarks;
    }

    // getTree() returns array of root nodes; each has .children
    for (const rootNode of tree) {
      this._walk(rootNode, []);
    }

    return this.bookmarks;
  }

  // ==================== 标准化 ====================

  /**
   * 将 chrome.bookmarks.BookmarkTreeNode 转为标准格式
   * @param {Object} node — Chrome 书签树节点
   * @param {string[]} folderPath — 当前文件夹路径
   * @returns {NormalizedBookmark | null} 标准化书签 (文件夹节点返回 null)
   */
  normalize(node, folderPath = []) {
    if (!node) {
      return null;
    }

    // 跳过无 URL 的节点 (文件夹)
    if (!node.url) {
      return null;
    }

    const title = node.title || '';
    const dateAdded = node.dateAdded || 0;
    const dateAddedISO = dateAdded
      ? new Date(dateAdded).toISOString()
      : '';

    /** @type {NormalizedBookmark} */
    const bookmark = {
      id: String(node.id),
      title,
      url: node.url,
      folderPath: [...folderPath],
      dateAdded,
      dateAddedISO,
    };

    return bookmark;
  }

  // ==================== 统计 ====================

  /**
   * 返回统计信息
   * @returns {{ total: number, folders: number, domainDistribution: Record<string, number> }}
   */
  getStats() {
    const total = this.bookmarks.length;
    const domainDistribution = {};

    // 统计领域分布 (基于 URL 域名)
    for (const bm of this.bookmarks) {
      try {
        const url = new URL(bm.url);
        const domain = url.hostname.replace(/^www\./, '');
        domainDistribution[domain] = (domainDistribution[domain] || 0) + 1;
      } catch {
        // 非法 URL 归入 "unknown"
        domainDistribution['unknown'] = (domainDistribution['unknown'] || 0) + 1;
      }
    }

    // 统计文件夹数: 从所有 folderPath 中收集唯一文件夹路径
    const folderSet = new Set();
    for (const bm of this.bookmarks) {
      if (bm.folderPath.length > 0) {
        // 计入每个层级的文件夹
        for (let i = 1; i <= bm.folderPath.length; i++) {
          folderSet.add(bm.folderPath.slice(0, i).join('/'));
        }
      }
    }

    return {
      total,
      folders: folderSet.size,
      domainDistribution,
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 递归遍历书签树节点
   * @param {Object} node — 当前节点
   * @param {string[]} currentPath — 当前文件夹路径
   */
  _walk(node, currentPath) {
    if (!node) return;

    // 判断是否为文件夹 (有 children 且无 url)
    const isFolder = !!(node.children && !node.url);

    // 文件夹: 将非空标题加入路径; 根节点 (空标题) 不加入
    const nextPath = isFolder && node.title
      ? [...currentPath, node.title]
      : currentPath;

    // 书签节点: 标准化并收集
    if (!isFolder) {
      const normalized = this.normalize(node, currentPath);
      if (normalized) {
        this.bookmarks.push(normalized);
        // 建立 URL → 书签数组 索引 (支持同 URL 不同文件夹)
        const existing = this._urlIndex.get(normalized.url);
        if (existing) {
          existing.push(normalized);
        } else {
          this._urlIndex.set(normalized.url, [normalized]);
        }
      }
    }

    // 递归子节点
    if (node.children) {
      for (const child of node.children) {
        this._walk(child, nextPath);
      }
    }
  }
}
