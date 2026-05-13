/**
 * BookmarkSearch — 书签搜索模块
 * 合并: search, recommender, semantic-search, ai-recommender
 */

import { EmbeddingEngine } from './embedding-engine.js';

// ==================== BookmarkSearch ====================

/**
 * BookmarkSearch — 书签搜索
 *
 * 整合 BookmarkIndexer（倒排索引）与 BookmarkGraphEngine（图谱），
 * 提供综合搜索、条件过滤、搜索建议。
 *
 * 功能:
 *   - 综合搜索: 索引关键词匹配 + 图谱相关性扩展
 *   - 条件过滤: 文件夹 / 标签 / 状态
 *   - 搜索建议: 基于标签 + 热门搜索，支持 200ms 防抖
 *   - 多排序: relevance / date / title
 */

/**
 * @typedef {Object} SearchOptions
 * @property {string}   [folder]   — 按文件夹过滤
 * @property {string[]} [tags]     — 按标签过滤
 * @property {string}   [status]   — 按状态过滤 (unread/reading/read)
 * @property {string}   [sortBy]   — 排序方式 (relevance/date/title)
 * @property {number}   [limit]    — 结果数量限制 (默认 20)
 */

/**
 * @typedef {Object} SearchFilters
 * @property {string}   [folder]   — 文件夹关键词
 * @property {string[]} [tags]     — 标签数组
 * @property {string}   [status]   — 状态
 * @property {string}   [domain]   — 域名过滤
 * @property {string}   [sortBy]   — 排序
 * @property {number}   [limit]    — 数量限制
 */

/**
 * @typedef {Object} SearchResult
 * @property {string}   id          — 书签 ID
 * @property {number}   score       — 综合分数
 * @property {Object}   bookmark    — 书签对象
 * @property {string[]} [highlights]— 高亮 token 列表
 */

export class BookmarkSearch {
  /**
   * @param {import('./bookmark-indexer.js').BookmarkIndexer} indexer
   * @param {import('./bookmark-graph.js').BookmarkGraphEngine} graphEngine
   */
  constructor(indexer, graphEngine) {
    if (!indexer) {
      throw new Error('BookmarkSearch requires a BookmarkIndexer instance');
    }
    if (!graphEngine) {
      throw new Error('BookmarkSearch requires a BookmarkGraphEngine instance');
    }

    /** @type {import('./bookmark-indexer.js').BookmarkIndexer} */
    this._indexer = indexer;
    /** @type {import('./bookmark-graph.js').BookmarkGraphEngine} */
    this._graphEngine = graphEngine;

    /** @type {Map<string, number>} query → count — 热门搜索记录 */
    this._searchHistory = new Map();
    /** @type {string[]} 累积所有已知标签 */
    this._knownTags = [];
    /** @type {number|null} 防抖定时器 ID */
    this._debounceTimer = null;
    /** @type {number} 防抖延迟 (ms) */
    this._debounceDelay = 200;
  }

  // ==================== 核心 API ====================

  /**
   * 综合搜索 — 索引匹配 + 图谱扩展
   *
   * 流程:
   *   1. 用 indexer 做关键词搜索，获得初始结果
   *   2. 对 top 结果用图谱引擎找相似书签，补充相关结果
   *   3. 合并去重、应用过滤、排序、限制
   *
   * @param {string}       query   — 搜索关键词
   * @param {SearchOptions} [options] — 搜索选项
   * @returns {SearchResult[]}
   */
  search(query, options = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return [];
    }

    const trimmed = query.trim();
    const {
      folder,
      tags,
      status,
      sortBy = 'relevance',
      limit = 20,
    } = options;

    // 记录搜索历史
    this._recordSearch(trimmed);

    // 1. 索引搜索
    const indexResults = this._indexer.search(trimmed, { folder, tags, limit: 100 });

    // 2. 图谱扩展 — 对 top-5 结果找相似书签
    const graphExpanded = this._expandWithGraph(indexResults, 5);

    // 3. 合并去重
    const merged = this._mergeResults(indexResults, graphExpanded);

    // 4. 应用过滤 (folder / tags / status) — 图谱扩展结果也需要过滤
    let filtered = merged;
    if (folder) {
      filtered = filtered.filter(r => this._matchesFolder(r.bookmark, folder));
    }
    if (tags && tags.length > 0) {
      filtered = filtered.filter(r => this._matchesTags(r.bookmark, tags));
    }
    if (status) {
      filtered = filtered.filter(r => {
        const bmStatus = r.bookmark.status || 'unread';
        return bmStatus === status;
      });
    }

    // 5. 计算高亮 token
    const queryTokens = this._tokenize(trimmed);
    for (const result of filtered) {
      result.highlights = this._computeHighlights(result.bookmark, queryTokens);
    }

    // 6. 排序
    this._sortResults(filtered, sortBy, queryTokens);

    // 7. 限制
    return filtered.slice(0, limit);
  }

  /**
   * 按条件过滤 — 不做关键词搜索，纯粹条件过滤
   *
   * @param {SearchFilters} filters
   * @returns {SearchResult[]}
   */
  searchByFilter(filters = {}) {
    const {
      folder,
      tags,
      status,
      domain,
      sortBy = 'date',
      limit = 50,
    } = filters;

    // 用空查询或 * 获取所有书签 — 通过 indexer 索引获取
    // 先用一个很宽泛的搜索或遍历图谱节点
    const graphData = this._graphEngine.getGraphData();
    let results = [];

    for (const node of graphData.nodes) {
      const bm = node.data;
      if (!bm) continue;

      // 文件夹过滤
      if (folder && !this._matchesFolder(bm, folder)) continue;

      // 标签过滤
      if (tags && tags.length > 0 && !this._matchesTags(bm, tags)) continue;

      // 状态过滤
      if (status) {
        const bmStatus = bm.status || 'unread';
        if (bmStatus !== status) continue;
      }

      // 域名过滤
      if (domain && !this._matchesDomain(bm, domain)) continue;

      results.push({
        id: String(bm.id),
        score: 1,
        bookmark: bm,
      });
    }

    // 排序
    this._sortResults(results, sortBy, []);

    return results.slice(0, limit);
  }

  /**
   * 搜索建议 — 基于已有标签 + 热门搜索
   *
   * @param {string} partial — 用户输入的部分文本
   * @returns {string[]} 建议列表
   */
  getSearchSuggestions(partial) {
    if (!partial || typeof partial !== 'string') return [];

    const lower = partial.toLowerCase().trim();
    if (lower.length === 0) return [];

    const suggestions = [];

    // 1. 基于标签
    for (const tag of this._knownTags) {
      if (tag.toLowerCase().includes(lower) && !suggestions.includes(tag)) {
        suggestions.push(tag);
      }
    }

    // 2. 基于热门搜索
    const sorted = [...this._searchHistory.entries()]
      .sort((a, b) => b[1] - a[1]);

    for (const [query] of sorted) {
      if (query.toLowerCase().includes(lower) && !suggestions.includes(query)) {
        suggestions.push(query);
      }
    }

    // 3. 基于书签标题 (从图谱节点)
    const graphData = this._graphEngine.getGraphData();
    for (const node of graphData.nodes) {
      const title = node.label || '';
      if (title.toLowerCase().includes(lower) && !suggestions.includes(title)) {
        suggestions.push(title);
      }
    }

    return suggestions.slice(0, 10);
  }

  /**
   * 注册已知标签 (用于搜索建议)
   * @param {string[]} tags
   */
  setKnownTags(tags) {
    if (Array.isArray(tags)) {
      this._knownTags = [...new Set(tags)];
    }
  }

  /**
   * 防抖版搜索建议
   *
   * @param {string}   partial  — 输入文本
   * @param {Function} callback — 回调函数 (suggestions: string[]) => void
   */
  getSearchSuggestionsDebounced(partial, callback) {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      const results = this.getSearchSuggestions(partial);
      callback(results);
    }, this._debounceDelay);
  }

  /**
   * 获取搜索统计
   * @returns {{ totalBookmarks: number, totalTokens: number, searchHistorySize: number, knownTagsCount: number }}
   */
  getStats() {
    const size = this._indexer.getSize();
    return {
      totalBookmarks: size.bookmarks,
      totalTokens: size.tokens,
      searchHistorySize: this._searchHistory.size,
      knownTagsCount: this._knownTags.length,
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 图谱扩展 — 对 top-N 结果查找相似书签
   * @param {SearchResult[]} indexResults — 索引搜索结果
   * @param {number}         topN         — 用前 N 个做扩展
   * @returns {SearchResult[]} 扩展结果
   */
  _expandWithGraph(indexResults, topN) {
    const expanded = [];
    const seen = new Set(indexResults.map(r => String(r.id)));

    const top = indexResults.slice(0, topN);
    for (const result of top) {
      const similar = this._graphEngine.getSimilar(result.id, 3);
      for (const item of similar) {
        const id = String(item.id);
        if (!seen.has(id)) {
          seen.add(id);
          expanded.push({
            id,
            // 扩展结果分数减半，保证索引结果优先
            score: item.score * 0.5,
            bookmark: item.bookmark,
          });
        }
      }
    }

    return expanded;
  }

  /**
   * 合并索引结果和图谱扩展结果，去重
   * @param {SearchResult[]} indexResults
   * @param {SearchResult[]} graphResults
   * @returns {SearchResult[]}
   */
  _mergeResults(indexResults, graphResults) {
    const merged = new Map();

    for (const r of indexResults) {
      merged.set(String(r.id), r);
    }

    for (const r of graphResults) {
      const id = String(r.id);
      if (!merged.has(id)) {
        merged.set(id, r);
      } else {
        // 两个来源都命中 → 加分
        const existing = merged.get(id);
        existing.score += r.score * 0.3;
      }
    }

    return [...merged.values()];
  }

  /**
   * 对结果排序
   * @param {SearchResult[]} results
   * @param {string}         sortBy
   * @param {string[]}       queryTokens
   */
  _sortResults(results, sortBy, queryTokens) {
    switch (sortBy) {
      case 'relevance':
        results.sort((a, b) => b.score - a.score);
        break;

      case 'date':
        results.sort((a, b) => {
          const dateA = a.bookmark.dateAdded || 0;
          const dateB = b.bookmark.dateAdded || 0;
          return dateB - dateA;
        });
        break;

      case 'title':
        results.sort((a, b) => {
          const titleA = (a.bookmark.title || '').toLowerCase();
          const titleB = (b.bookmark.title || '').toLowerCase();
          return titleA.localeCompare(titleB);
        });
        break;

      default:
        results.sort((a, b) => b.score - a.score);
    }
  }

  /**
   * 计算高亮 token
   * @param {Object}   bookmark
   * @param {string[]} queryTokens
   * @returns {string[]}
   */
  _computeHighlights(bookmark, queryTokens) {
    const highlights = [];
    const titleTokens = this._tokenize(bookmark.title || '');

    for (const qt of queryTokens) {
      if (titleTokens.includes(qt)) {
        highlights.push(qt);
      }
    }

    return highlights;
  }

  /**
   * 记录搜索历史
   * @param {string} query
   */
  _recordSearch(query) {
    const normalized = query.toLowerCase().trim();
    const count = this._searchHistory.get(normalized) || 0;
    this._searchHistory.set(normalized, count + 1);
  }

  /**
   * 中英文混合分词
   * @param {string} text
   * @returns {string[]}
   */
  _tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    const tokens = [];
    const segments = text.match(/[一-鿿]|[a-zA-Z]+|[0-9]+/g) || [];
    for (const seg of segments) {
      if (/[一-鿿]/.test(seg)) {
        for (const char of seg) {
          tokens.push(char);
        }
      } else if (/[a-zA-Z]/.test(seg)) {
        tokens.push(seg.toLowerCase());
      } else {
        tokens.push(seg);
      }
    }
    return tokens;
  }

  /**
   * 检查书签是否匹配文件夹条件
   * @param {Object} bookmark
   * @param {string} folder
   * @returns {boolean}
   */
  _matchesFolder(bookmark, folder) {
    if (!bookmark.folderPath || !Array.isArray(bookmark.folderPath)) return false;
    const folderLower = folder.toLowerCase();
    return bookmark.folderPath.some(f => f.toLowerCase().includes(folderLower));
  }

  /**
   * 检查书签是否匹配标签条件
   * @param {Object}   bookmark
   * @param {string[]} tags
   * @returns {boolean}
   */
  _matchesTags(bookmark, tags) {
    if (!bookmark.tags || !Array.isArray(bookmark.tags)) return false;
    const bmTags = new Set(bookmark.tags.map(t => t.toLowerCase()));
    return tags.every(t => bmTags.has(t.toLowerCase()));
  }

  /**
   * 检查书签是否匹配域名条件
   * @param {Object} bookmark
   * @param {string} domain
   * @returns {boolean}
   */
  _matchesDomain(bookmark, domain) {
    if (!bookmark.url) return false;
    try {
      const bmDomain = new URL(bookmark.url).hostname.replace(/^www\./, '').toLowerCase();
      return bmDomain.includes(domain.toLowerCase());
    } catch {
      return false;
    }
  }
}
