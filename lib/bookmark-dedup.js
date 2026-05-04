/**
 * BookmarkDedup — 重复书签检测与清理
 *
 * 提供三种去重策略:
 *   1. URL 完全去重 — 规范化后精确匹配
 *   2. 标题相似度去重 — Jaccard 系数 > 可配置阈值(默认 0.7)
 *   3. 综合 findDuplicates — 合并以上两种策略
 *
 * 额外能力:
 *   - suggestCleanup() 生成合并/删除建议
 *   - batchRemove() 批量清理重复书签
 *
 * 纯前端实现，不依赖外部 API。
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 */

// ==================== 跟踪参数集合 ====================

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'dclid', 'twclid',
  'mc_cid', 'mc_eid', 'ref', '_ga',
]);

// ==================== BookmarkDedup ====================

export class BookmarkDedup {
  /**
   * @param {Bookmark[]} bookmarks
   */
  constructor(bookmarks = []) {
    /** @type {Bookmark[]} */
    this.bookmarks = [...bookmarks];
  }

  // -------------------- URL 规范化 --------------------

  /**
   * 规范化 URL 以便进行去重比较
   *
   * 规则:
   *   - 移除协议 (http/https)
   *   - 移除 www. 前缀
   *   - 移除尾部斜杠
   *   - 移除查询参数中的跟踪参数 (utm_*, fbclid, gclid 等)
   *   - 转小写
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

  // -------------------- 标题相似度 --------------------

  /**
   * 计算两个标题的 Jaccard 相似度 (0-1)
   *
   * - 按空格/标点分词
   * - 忽略大小写
   *
   * @param {string} a
   * @param {string} b
   * @returns {number} 0-1
   */
  static titleSimilarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    if (a === b) return 1;

    const tokensA = BookmarkDedup._tokenize(a);
    const tokensB = BookmarkDedup._tokenize(b);

    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection++;
    }

    const union = tokensA.size + tokensB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * 将文本按空格/标点分词，返回小写 token 集合
   * @param {string} text
   * @returns {Set<string>}
   * @private
   */
  static _tokenize(text) {
    return new Set(
      text
        .toLowerCase()
        .split(/[\s,.;:!?\-_/\\|()[\]{}'"`~@#$%^&*+=<>]+/)
        .filter((t) => t.length > 0)
    );
  }

  // -------------------- 精确 URL 去重 --------------------

  /**
   * 按规范化 URL 分组，返回每组包含 2+ 书签的数组
   *
   * @returns {Bookmark[][]}
   */
  findByExactUrl() {
    /** @type {Map<string, Bookmark[]>} */
    const groups = new Map();

    for (const bm of this.bookmarks) {
      const normalized = BookmarkDedup.normalizeUrl(bm.url);
      if (!normalized) continue;

      if (!groups.has(normalized)) {
        groups.set(normalized, []);
      }
      groups.get(normalized).push(bm);
    }

    return [...groups.values()].filter((g) => g.length > 1);
  }

  // -------------------- 相似标题去重 --------------------

  /**
   * 按标题相似度分组，返回每组包含 2+ 书签的数组
   *
   * @param {number} [threshold=0.7]
   * @returns {Bookmark[][]}
   */
  findBySimilarTitle(threshold = 0.7) {
    const n = this.bookmarks.length;
    /** @type {number[]} parent index for union-find */
    const parent = Array.from({ length: n }, (_, i) => i);
    const rank = new Array(n).fill(0);

    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }

    function union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
      } else if (rank[ra] > rank[rb]) {
        parent[rb] = ra;
      } else {
        parent[rb] = ra;
        rank[ra]++;
      }
    }

    // 比较所有书签对
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = BookmarkDedup.titleSimilarity(
          this.bookmarks[i].title,
          this.bookmarks[j].title
        );
        if (sim >= threshold) {
          union(i, j);
        }
      }
    }

    // 按根分组
    /** @type {Map<number, Bookmark[]>} */
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(this.bookmarks[i]);
    }

    return [...groups.values()].filter((g) => g.length > 1);
  }

  // -------------------- 综合重复检测 --------------------

  /**
   * 综合 URL 精确去重 + 标题相似度去重，去重后返回结果
   *
   * @returns {{ original: Bookmark, duplicates: Bookmark[], reason: string }[]}
   */
  findDuplicates() {
    /** @type {Set<string>} 已被处理的书签 ID */
    const processed = new Set();
    /** @type {{ original: Bookmark, duplicates: Bookmark[], reason: string }[]} */
    const results = [];

    // 1) URL 精确去重
    for (const group of this.findByExactUrl()) {
      // 保留第一个，其余为重复
      const ids = group.map((b) => b.id);
      if (ids.some((id) => processed.has(id))) continue;

      const [original, ...duplicates] = group;
      results.push({
        original,
        duplicates,
        reason: `URL 完全匹配 (规范化: ${BookmarkDedup.normalizeUrl(original.url)})`,
      });
      ids.forEach((id) => processed.add(id));
    }

    // 2) 标题相似度去重 (排除已处理的)
    for (const group of this.findBySimilarTitle()) {
      const unprocessed = group.filter((b) => !processed.has(b.id));
      if (unprocessed.length < 2) continue;

      const [original, ...duplicates] = unprocessed;
      results.push({
        original,
        duplicates,
        reason: `标题相似度 ≥ 0.7 ("${original.title}")`,
      });
      unprocessed.forEach((b) => processed.add(b.id));
    }

    return results;
  }

  // -------------------- 清理建议 --------------------

  /**
   * 基于 findDuplicates() 生成清理建议
   *
   * @returns {{ action: 'remove'|'merge', bookmarkId: string, reason: string }[]}
   */
  suggestCleanup() {
    /** @type {{ action: 'remove'|'merge', bookmarkId: string, reason: string }[]} */
    const suggestions = [];

    for (const dup of this.findDuplicates()) {
      const { original, duplicates, reason } = dup;

      for (const bm of duplicates) {
        // URL 完全匹配 → remove；标题相似 → merge
        const isUrlDup = reason.startsWith('URL');
        suggestions.push({
          action: isUrlDup ? 'remove' : 'merge',
          bookmarkId: bm.id,
          reason: isUrlDup
            ? `与 #${original.id} URL 重复，建议删除`
            : `与 #${original.id} 标题相似，建议合并`,
        });
      }
    }

    return suggestions;
  }

  // -------------------- 批量删除 --------------------

  /**
   * 从内部书签列表中移除指定 ID 的书签
   *
   * @param {string[]} bookmarkIds
   * @returns {number} 实际移除的数量
   */
  batchRemove(bookmarkIds) {
    if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) return 0;

    const idSet = new Set(bookmarkIds.map(String));
    const before = this.bookmarks.length;
    this.bookmarks = this.bookmarks.filter((bm) => !idSet.has(String(bm.id)));
    return before - this.bookmarks.length;
  }
}

export default BookmarkDedup;
