/**
 * BookmarkSharing — 书签分享引擎
 *
 * 功能:
 *   1. createShareableCollection() — 从智能集合创建可分享数据
 *   2. exportShareJSON()          — 导出分享 JSON (含隐私过滤)
 *   3. exportShareText()          — 导出人类可读的文本摘要
 *   4. exportShareBase64()        — 导出 URL 安全的 Base64 编码
 *   5. importSharedCollection()   — 从分享数据导入集合
 *   6. generateShareLink()        — 生成 data: URI 分享链接
 *
 * 隐私控制:
 *   - stripPersonalData: 移除文件夹路径、标签、状态等个人信息
 *   - anonymizeUrls: 将 URL 替换为域名摘要
 *   - includeFields: 白名单控制导出字段
 *
 * 纯数据模块，不依赖 DOM 或 Chrome API。
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 * @property {string}   [status]
 * @property {number}   [dateAdded]
 */

/**
 * @typedef {Object} ShareOptions
 * @property {boolean}  [stripPersonalData=false] — 移除文件夹/标签/状态
 * @property {boolean}  [anonymizeUrls=false]      — URL 替换为域名摘要
 * @property {string[]} [includeFields]            — 白名单字段 (默认全部)
 * @property {string}   [collectionName='']        — 集合名称
 * @property {string}   [description='']           — 集合描述
 * @property {string}   [author='']                — 分享者名称
 */

/**
 * @typedef {Object} ShareableCollection
 * @property {number}      version
 * @property {string}      type — 固定 'bookmark-share'
 * @property {string}      collectionName
 * @property {string}      description
 * @property {string}      author
 * @property {string}      sharedAt — ISO 时间戳
 * @property {Bookmark[]}  bookmarks
 * @property {Object}      metadata — 统计信息
 */

/** @type {string[]} 可分享的书签字段 */
const SHAREABLE_FIELDS = ['id', 'title', 'url', 'folderPath', 'tags', 'status', 'dateAdded'];

/** @type {string[]} 个人信息字段 */
const PERSONAL_FIELDS = ['folderPath', 'tags', 'status'];

class BookmarkSharing {
  /**
   * @param {Object}      opts
   * @param {Bookmark[]}  [opts.bookmarks=[]]
   * @param {Function}    [opts.onProgress] — 进度回调 (phase, current, total)
   */
  constructor({ bookmarks = [], onProgress = null } = {}) {
    this.bookmarks = bookmarks;
    this.onProgress = onProgress;
  }

  /** @private */
  _notify(phase, current, total) {
    if (typeof this.onProgress === 'function') {
      this.onProgress(phase, current, total);
    }
  }

  // ==================== 创建可分享集合 ====================

  /**
   * 从书签数组创建可分享的集合数据
   * @param {ShareOptions} [options={}]
   * @returns {ShareableCollection}
   */
  createShareableCollection(options = {}) {
    const {
      stripPersonalData = false,
      anonymizeUrls = false,
      includeFields = null,
      collectionName = '',
      description = '',
      author = '',
    } = options;

    this._notify('create-start', 0, this.bookmarks.length);

    const filteredBookmarks = this.bookmarks.map((bm, i) => {
      this._notify('create-progress', i + 1, this.bookmarks.length);
      return BookmarkSharing._filterBookmark(bm, {
        stripPersonalData,
        anonymizeUrls,
        includeFields,
      });
    });

    const collection = {
      version: 1,
      type: 'bookmark-share',
      collectionName,
      description,
      author,
      sharedAt: new Date().toISOString(),
      bookmarks: filteredBookmarks,
      metadata: BookmarkSharing._buildMetadata(filteredBookmarks),
    };

    this._notify('create-done', this.bookmarks.length, this.bookmarks.length);
    return collection;
  }

  // ==================== 导出 JSON ====================

  /**
   * 导出分享 JSON 字符串
   * @param {ShareOptions} [options={}]
   * @returns {string}
   */
  exportShareJSON(options = {}) {
    const collection = this.createShareableCollection(options);
    return JSON.stringify(collection, null, 2);
  }

  // ==================== 导出文本摘要 ====================

  /**
   * 导出人类可读的文本摘要
   * @param {ShareOptions} [options={}]
   * @returns {string}
   */
  exportShareText(options = {}) {
    const collection = this.createShareableCollection(options);
    const lines = [];

    if (collection.collectionName) {
      lines.push(`📚 ${collection.collectionName}`);
      lines.push('');
    }

    if (collection.description) {
      lines.push(collection.description);
      lines.push('');
    }

    if (collection.author) {
      lines.push(`分享者: ${collection.author}`);
    }

    lines.push(`分享时间: ${collection.sharedAt}`);
    lines.push(`书签数量: ${collection.bookmarks.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const bm of collection.bookmarks) {
      lines.push(`• ${bm.title}`);
      if (bm.url) {
        lines.push(`  ${bm.url}`);
      }
      if (bm.tags && bm.tags.length > 0) {
        lines.push(`  标签: ${bm.tags.join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  // ==================== 导出 Base64 ====================

  /**
   * 导出 URL 安全的 Base64 编码
   * @param {ShareOptions} [options={}]
   * @returns {string}
   */
  exportShareBase64(options = {}) {
    const json = this.exportShareJSON(options);
    return BookmarkSharing._encodeBase64(json);
  }

  // ==================== 生成分享链接 ====================

  /**
   * 生成 data: URI 分享链接
   * @param {ShareOptions} [options={}]
   * @returns {string}
   */
  generateShareLink(options = {}) {
    const base64 = this.exportShareBase64(options);
    return `data:application/json;base64,${base64}`;
  }

  // ==================== 导入分享数据 ====================

  /**
   * 从分享数据导入集合
   * @param {string} data — JSON 字符串或 Base64 编码
   * @returns {ShareableCollection|null}
   */
  static importSharedCollection(data) {
    if (!data || typeof data !== 'string') {
      return null;
    }

    let jsonStr = data;

    // 尝试 Base64 解码
    if (data.startsWith('data:')) {
      const base64Part = data.split(',')[1];
      if (base64Part) {
        jsonStr = BookmarkSharing._decodeBase64(base64Part);
      }
    } else if (/^[A-Za-z0-9+/=]+$/.test(data.trim()) && data.length > 20) {
      // 可能是纯 Base64
      try {
        jsonStr = BookmarkSharing._decodeBase64(data.trim());
      } catch {
        // 不是 Base64，当作 JSON 处理
        jsonStr = data;
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return null;
    }

    // 验证基本结构
    if (!parsed || parsed.type !== 'bookmark-share' || !Array.isArray(parsed.bookmarks)) {
      return null;
    }

    return parsed;
  }

  // ==================== 隐私过滤 ====================

  /**
   * 过滤单个书签的字段
   * @private
   * @param {Bookmark} bm
   * @param {Object} opts
   * @returns {Bookmark}
   */
  static _filterBookmark(bm, { stripPersonalData, anonymizeUrls, includeFields }) {
    const result = {};
    const fields = includeFields || SHAREABLE_FIELDS;

    for (const field of fields) {
      if (!SHAREABLE_FIELDS.includes(field)) continue;

      // 跳过个人信息字段
      if (stripPersonalData && PERSONAL_FIELDS.includes(field)) continue;

      if (bm[field] !== undefined) {
        result[field] = bm[field];
      }
    }

    // URL 匿名化
    if (anonymizeUrls && result.url) {
      result.url = BookmarkSharing._anonymizeUrl(result.url);
    }

    return result;
  }

  /**
   * URL 匿名化: 保留域名，替换路径为哈希
   * @private
   * @param {string} url
   * @returns {string}
   */
  static _anonymizeUrl(url) {
    try {
      const parsed = new URL(url);
      const pathHash = BookmarkSharing._simpleHash(parsed.pathname + parsed.search);
      return `${parsed.protocol}//${parsed.host}/…${pathHash}`;
    } catch {
      return 'https://example.com/…';
    }
  }

  /**
   * 简单哈希函数 (非加密用途)
   * @private
   * @param {string} str
   * @returns {string}
   */
  static _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return Math.abs(hash).toString(36).slice(0, 6);
  }

  /**
   * 构建元数据统计
   * @private
   * @param {Bookmark[]} bookmarks
   * @returns {Object}
   */
  static _buildMetadata(bookmarks) {
    const domains = new Set();
    const allTags = new Set();

    for (const bm of bookmarks) {
      if (bm.url) {
        try {
          domains.add(new URL(bm.url).host);
        } catch {
          // 无效 URL
        }
      }
      if (Array.isArray(bm.tags)) {
        for (const tag of bm.tags) {
          allTags.add(tag);
        }
      }
    }

    return {
      totalBookmarks: bookmarks.length,
      uniqueDomains: domains.size,
      uniqueTags: allTags.size,
    };
  }

  // ==================== Base64 编码/解码 ====================

  /**
   * URL 安全的 Base64 编码
   * @private
   * @param {string} str
   * @returns {string}
   */
  static _encodeBase64(str) {
    // 环境兼容: 优先 btoa，回退 Buffer
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(str)));
    }
    return Buffer.from(str, 'utf-8').toString('base64');
  }

  /**
   * Base64 解码
   * @private
   * @param {string} base64
   * @returns {string}
   */
  static _decodeBase64(base64) {
    if (typeof atob === 'function') {
      return decodeURIComponent(escape(atob(base64)));
    }
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
}

export { BookmarkSharing, SHAREABLE_FIELDS, PERSONAL_FIELDS };
