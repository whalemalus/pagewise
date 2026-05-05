/**
 * BookmarkKnowledgeCorrelation — 知识关联引擎
 *
 * 迭代 R66: 知识关联 BookmarkKnowledgeCorrelation
 *
 * 设计决策:
 *   - 复用 EmbeddingEngine (迭代 #7) 的 TF-IDF 核心算法进行语义相似度计算
 *   - 多维关联: URL 精确匹配 (0.4) + 标题语义相似 (0.3) + 标签重叠 (0.3)
 *   - 纯 ES Module，零外部依赖，不依赖 DOM/Chrome API
 *   - 支持增量更新 (addEntry / removeEntry)
 *   - 双向查询: 书签→条目 和 条目→书签
 *   - 关联强度可视化支持: 返回分项得分和总体得分
 *   - 关联建议: 未关联但高相似度的书签-条目对
 *
 * 接口:
 *   constructor(embeddingEngine?)
 *   buildIndex(bookmarks[], entries[])   — 全量构建关联索引
 *   addEntry(entry)                      — 增量添加知识条目
 *   removeEntry(entryId)                 — 增量删除知识条目
 *   getRelatedEntries(bookmarkId, opts?) — 获取书签关联的知识条目
 *   getRelatedBookmarks(entryId, opts?)  — 获取知识条目关联的书签
 *   getCorrelationStrength(bookmarkId, entryId) — 获取指定书签-条目的关联强度
 *   suggestCorrelations(opts?)           — 生成关联建议
 *   getCorrelationSummary(bookmarkId)    — 获取书签关联摘要
 *   getStats()                           — 统计信息
 */

import { EmbeddingEngine } from './embedding-engine.js';

/**
 * @typedef {Object} CorrelationResult
 * @property {number}  score      — 综合关联度 (0-1)
 * @property {string[]} matchTypes — 命中的匹配类型: 'url' | 'title' | 'tag'
 * @property {Object}  entry      — 知识条目对象
 */

/**
 * @typedef {Object} BookmarkCorrelationResult
 * @property {number}  score      — 综合关联度 (0-1)
 * @property {string[]} matchTypes — 命中的匹配类型
 * @property {Object}  bookmark   — 书签对象
 */

/**
 * @typedef {Object} CorrelationStrength
 * @property {number} urlMatch          — URL 匹配 (0 or 1)
 * @property {number} titleSimilarity   — 标题相似度 (0-1)
 * @property {number} tagOverlap        — 标签重叠度 (0-1)
 * @property {number} total             — 综合得分 (0-1)
 */

/**
 * @typedef {Object} CorrelationSuggestion
 * @property {Object}  bookmark — 书签对象
 * @property {Object}  entry    — 知识条目对象
 * @property {number}  score    — 关联度得分
 * @property {string}  reason   — 建议原因
 */

// ==================== 关联权重 ====================

/** URL 精确匹配权重 */
const URL_MATCH_WEIGHT = 0.4;

/** 标题语义相似度权重 */
const TITLE_SIMILARITY_WEIGHT = 0.3;

/** 标签重叠度权重 */
const TAG_OVERLAP_WEIGHT = 0.3;

/** 关联阈值 — 低于此值不认为有关联 */
const CORRELATION_THRESHOLD = 0.15;

/** 建议阈值 — 建议中的最低关联度 */
const SUGGESTION_THRESHOLD = 0.2;

export class BookmarkKnowledgeCorrelation {
  /**
   * @param {EmbeddingEngine} [embeddingEngine] — 可选，自定义 EmbeddingEngine 实例
   */
  constructor(embeddingEngine) {
    /** @type {EmbeddingEngine} */
    this._embeddingEngine = embeddingEngine || new EmbeddingEngine();

    /** @type {Map<string, Object>} bookmarkId → bookmark object */
    this._bookmarkStore = new Map();
    /** @type {Map<number, Object>} entryId → entry object */
    this._entryStore = new Map();

    /**
     * 关联缓存: Map<bookmarkId, Map<entryId, CorrelationStrength>>
     * 惰性计算 — 首次 buildIndex 时全量计算，增量更新时局部重算
     */
    this._correlationCache = new Map();

    /** @type {Map<string, Set<number>>} normalizedUrl → Set<entryId> (URL 倒排索引) */
    this._urlIndex = new Map();
    /** @type {Map<string, Set<string>>} normalizedUrl → Set<bookmarkId> (书签 URL 索引) */
    this._bookmarkUrlIndex = new Map();
    /** @type {Map<string, Set<number>>} tag → Set<entryId> (标签倒排索引) */
    this._entryTagIndex = new Map();
    /** @type {Map<string, Set<string>>} tag → Set<bookmarkId> (书签标签索引) */
    this._bookmarkTagIndex = new Map();
  }

  // ==================== 核心 API ====================

  /**
   * 全量构建关联索引
   *
   * 流程:
   *   1. 清空所有索引和缓存
   *   2. 存储书签和知识条目
   *   3. 构建 URL 倒排索引和标签倒排索引
   *   4. 计算所有书签-条目对的关联度
   *
   * @param {Object[]} bookmarks — 标准化书签数组
   * @param {Object[]} entries   — 知识条目数组
   */
  buildIndex(bookmarks, entries) {
    // 1. 清空
    this._bookmarkStore.clear();
    this._entryStore.clear();
    this._correlationCache.clear();
    this._urlIndex.clear();
    this._bookmarkUrlIndex.clear();
    this._entryTagIndex.clear();
    this._bookmarkTagIndex.clear();

    if (!Array.isArray(bookmarks) || !Array.isArray(entries)) return;

    // 2. 存储
    for (const bm of bookmarks) {
      if (bm && bm.id) {
        this._bookmarkStore.set(String(bm.id), bm);
      }
    }
    for (const entry of entries) {
      if (entry && entry.id != null) {
        this._entryStore.set(Number(entry.id), entry);
      }
    }

    if (this._bookmarkStore.size === 0 || this._entryStore.size === 0) return;

    // 3. 构建索引
    this._buildUrlIndex();
    this._buildTagIndex();

    // 4. 全量计算关联度
    this._computeAllCorrelations();
  }

  /**
   * 增量添加知识条目
   *
   * @param {Object} entry — 知识条目对象
   */
  addEntry(entry) {
    if (!entry || entry.id == null) return;

    const id = Number(entry.id);
    this._entryStore.set(id, entry);

    // 更新 URL 索引
    const url = this._normalizeUrl(entry.sourceUrl || '');
    if (url) {
      if (!this._urlIndex.has(url)) this._urlIndex.set(url, new Set());
      this._urlIndex.get(url).add(id);
    }

    // 更新标签索引
    if (entry.tags && Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        const normalized = this._normalizeTag(tag);
        if (!normalized) continue;
        if (!this._entryTagIndex.has(normalized)) this._entryTagIndex.set(normalized, new Set());
        this._entryTagIndex.get(normalized).add(id);
      }
    }

    // 为新条目计算与所有书签的关联度
    for (const [bmId, bookmark] of this._bookmarkStore) {
      const strength = this._computeCorrelation(bookmark, entry);
      if (strength.total >= CORRELATION_THRESHOLD) {
        if (!this._correlationCache.has(bmId)) this._correlationCache.set(bmId, new Map());
        this._correlationCache.get(bmId).set(id, strength);
      }
    }
  }

  /**
   * 增量删除知识条目
   *
   * @param {number|string} entryId — 条目 ID
   * @returns {boolean} 是否成功删除
   */
  removeEntry(entryId) {
    const id = Number(entryId);

    if (!this._entryStore.has(id)) return false;

    const entry = this._entryStore.get(id);

    // 从 URL 索引移除
    const url = this._normalizeUrl(entry.sourceUrl || '');
    if (url && this._urlIndex.has(url)) {
      this._urlIndex.get(url).delete(id);
      if (this._urlIndex.get(url).size === 0) this._urlIndex.delete(url);
    }

    // 从标签索引移除
    if (entry.tags && Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        const normalized = this._normalizeTag(tag);
        if (normalized && this._entryTagIndex.has(normalized)) {
          this._entryTagIndex.get(normalized).delete(id);
          if (this._entryTagIndex.get(normalized).size === 0) this._entryTagIndex.delete(normalized);
        }
      }
    }

    // 从关联缓存移除
    for (const [, entryMap] of this._correlationCache) {
      entryMap.delete(id);
    }

    // 移除条目
    this._entryStore.delete(id);

    return true;
  }

  /**
   * 获取书签关联的知识条目
   *
   * @param {string|number} bookmarkId — 书签 ID
   * @param {Object} [opts]
   * @param {number} [opts.limit=10] — 返回数量限制
   * @returns {CorrelationResult[]}
   */
  getRelatedEntries(bookmarkId, opts = {}) {
    const bmId = String(bookmarkId);
    const { limit = 10 } = opts;

    if (!this._bookmarkStore.has(bmId)) return [];

    const entryMap = this._correlationCache.get(bmId);
    if (!entryMap || entryMap.size === 0) return [];

    const results = [];
    for (const [entryId, strength] of entryMap) {
      if (strength.total < CORRELATION_THRESHOLD) continue;
      const entry = this._entryStore.get(entryId);
      if (!entry) continue;

      const matchTypes = [];
      if (strength.urlMatch > 0) matchTypes.push('url');
      if (strength.titleSimilarity > 0.1) matchTypes.push('title');
      if (strength.tagOverlap > 0) matchTypes.push('tag');

      results.push({
        score: strength.total,
        matchTypes,
        entry,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 获取知识条目关联的书签
   *
   * @param {number|string} entryId — 条目 ID
   * @param {Object} [opts]
   * @param {number} [opts.limit=10] — 返回数量限制
   * @returns {BookmarkCorrelationResult[]}
   */
  getRelatedBookmarks(entryId, opts = {}) {
    const id = Number(entryId);
    const { limit = 10 } = opts;

    if (!this._entryStore.has(id)) return [];

    const results = [];
    for (const [bmId, entryMap] of this._correlationCache) {
      const strength = entryMap.get(id);
      if (!strength || strength.total < CORRELATION_THRESHOLD) continue;

      const bookmark = this._bookmarkStore.get(bmId);
      if (!bookmark) continue;

      const matchTypes = [];
      if (strength.urlMatch > 0) matchTypes.push('url');
      if (strength.titleSimilarity > 0.1) matchTypes.push('title');
      if (strength.tagOverlap > 0) matchTypes.push('tag');

      results.push({
        score: strength.total,
        matchTypes,
        bookmark,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 获取指定书签-条目的关联强度详情
   *
   * @param {string|number} bookmarkId — 书签 ID
   * @param {number|string} entryId    — 条目 ID
   * @returns {CorrelationStrength|null}
   */
  getCorrelationStrength(bookmarkId, entryId) {
    const bmId = String(bookmarkId);
    const eId = Number(entryId);

    if (!this._bookmarkStore.has(bmId) || !this._entryStore.has(eId)) return null;

    const entryMap = this._correlationCache.get(bmId);
    if (!entryMap) return null;

    return entryMap.get(eId) || null;
  }

  /**
   * 生成关联建议 — 推荐未建立但高相似度的书签-条目对
   *
   * @param {Object} [opts]
   * @param {number} [opts.limit=10] — 最多返回建议数
   * @returns {CorrelationSuggestion[]}
   */
  suggestCorrelations(opts = {}) {
    const { limit = 10 } = opts;
    const suggestions = [];

    for (const [bmId, entryMap] of this._correlationCache) {
      const bookmark = this._bookmarkStore.get(bmId);
      if (!bookmark) continue;

      for (const [entryId, strength] of entryMap) {
        if (strength.total < SUGGESTION_THRESHOLD) continue;
        const entry = this._entryStore.get(entryId);
        if (!entry) continue;

        // 生成建议原因
        const reasons = [];
        if (strength.urlMatch > 0) reasons.push('同一来源 URL');
        if (strength.titleSimilarity > 0.3) reasons.push('标题内容相似');
        if (strength.tagOverlap > 0.3) reasons.push('标签高度重叠');
        if (reasons.length === 0 && strength.total >= SUGGESTION_THRESHOLD) {
          reasons.push('综合内容关联');
        }

        suggestions.push({
          bookmark,
          entry,
          score: strength.total,
          reason: reasons.join(' + '),
        });
      }
    }

    suggestions.sort((a, b) => b.score - a.score);
    return suggestions.slice(0, limit);
  }

  /**
   * 获取书签关联摘要
   *
   * @param {string|number} bookmarkId — 书签 ID
   * @returns {Object|null} { bookmark, relatedEntries, totalRelated, avgScore }
   */
  getCorrelationSummary(bookmarkId) {
    const bmId = String(bookmarkId);

    if (!this._bookmarkStore.has(bmId)) return null;

    const bookmark = this._bookmarkStore.get(bmId);
    const relatedEntries = this.getRelatedEntries(bmId, { limit: 50 });

    const avgScore = relatedEntries.length > 0
      ? relatedEntries.reduce((sum, r) => sum + r.score, 0) / relatedEntries.length
      : 0;

    return {
      bookmark,
      relatedEntries,
      totalRelated: relatedEntries.length,
      avgScore: Math.round(avgScore * 1000) / 1000,
    };
  }

  /**
   * 获取统计信息
   *
   * @returns {{ totalBookmarks: number, totalEntries: number, totalCorrelations: number,
   *             associatedBookmarks: number, associatedEntries: number,
   *             avgCorrelationsPerBookmark: number }}
   */
  getStats() {
    let totalCorrelations = 0;
    const associatedBookmarkIds = new Set();
    const associatedEntryIds = new Set();

    for (const [bmId, entryMap] of this._correlationCache) {
      for (const [entryId, strength] of entryMap) {
        if (strength.total >= CORRELATION_THRESHOLD) {
          totalCorrelations++;
          associatedBookmarkIds.add(bmId);
          associatedEntryIds.add(entryId);
        }
      }
    }

    const totalBookmarks = this._bookmarkStore.size;
    const totalEntries = this._entryStore.size;

    return {
      totalBookmarks,
      totalEntries,
      totalCorrelations,
      associatedBookmarks: associatedBookmarkIds.size,
      associatedEntries: associatedEntryIds.size,
      avgCorrelationsPerBookmark: totalBookmarks > 0
        ? Math.round((totalCorrelations / totalBookmarks) * 100) / 100
        : 0,
    };
  }

  // ==================== 内部方法 ====================

  /**
   * URL 规范化 — 移除协议/www/尾斜杠/fragment，转小写
   *
   * @param {string} url
   * @returns {string} 规范化后的 URL，无效 URL 返回空字符串
   */
  _normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const u = new URL(url);
      let normalized = u.hostname.replace(/^www\./, '') + u.pathname;
      normalized = normalized.replace(/\/+$/, '').toLowerCase();
      return normalized;
    } catch {
      return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
    }
  }

  /**
   * 标签规范化 — 小写、去首尾空格
   *
   * @param {string} tag
   * @returns {string}
   */
  _normalizeTag(tag) {
    if (!tag || typeof tag !== 'string') return '';
    return tag.trim().toLowerCase();
  }

  /**
   * 构建 URL 倒排索引
   */
  _buildUrlIndex() {
    // 书签 URL 索引
    for (const [id, bm] of this._bookmarkStore) {
      const url = this._normalizeUrl(bm.url || '');
      if (url) {
        if (!this._bookmarkUrlIndex.has(url)) this._bookmarkUrlIndex.set(url, new Set());
        this._bookmarkUrlIndex.get(url).add(id);
      }
    }

    // 知识条目 URL 索引
    for (const [id, entry] of this._entryStore) {
      const url = this._normalizeUrl(entry.sourceUrl || '');
      if (url) {
        if (!this._urlIndex.has(url)) this._urlIndex.set(url, new Set());
        this._urlIndex.get(url).add(id);
      }
    }
  }

  /**
   * 构建标签倒排索引
   */
  _buildTagIndex() {
    // 书签标签索引
    for (const [id, bm] of this._bookmarkStore) {
      if (bm.tags && Array.isArray(bm.tags)) {
        for (const tag of bm.tags) {
          const normalized = this._normalizeTag(tag);
          if (!normalized) continue;
          if (!this._bookmarkTagIndex.has(normalized)) this._bookmarkTagIndex.set(normalized, new Set());
          this._bookmarkTagIndex.get(normalized).add(id);
        }
      }
    }

    // 知识条目标签索引
    for (const [id, entry] of this._entryStore) {
      if (entry.tags && Array.isArray(entry.tags)) {
        for (const tag of entry.tags) {
          const normalized = this._normalizeTag(tag);
          if (!normalized) continue;
          if (!this._entryTagIndex.has(normalized)) this._entryTagIndex.set(normalized, new Set());
          this._entryTagIndex.get(normalized).add(id);
        }
      }
    }
  }

  /**
   * 全量计算所有书签-条目对的关联度
   *
   * 优化: 使用 URL 倒排索引和标签索引缩小候选集
   */
  _computeAllCorrelations() {
    for (const [bmId, bookmark] of this._bookmarkStore) {
      const entryMap = new Map();

      for (const [entryId, entry] of this._entryStore) {
        const strength = this._computeCorrelation(bookmark, entry);
        if (strength.total >= CORRELATION_THRESHOLD) {
          entryMap.set(entryId, strength);
        }
      }

      if (entryMap.size > 0) {
        this._correlationCache.set(bmId, entryMap);
      }
    }
  }

  /**
   * 计算单个书签-条目对的关联强度
   *
   * 综合关联度 = urlMatch * 0.4 + titleSimilarity * 0.3 + tagOverlap * 0.3
   *
   * @param {Object} bookmark
   * @param {Object} entry
   * @returns {CorrelationStrength}
   */
  _computeCorrelation(bookmark, entry) {
    const urlMatch = this._computeUrlMatch(bookmark, entry);
    const titleSimilarity = this._computeTitleSimilarity(bookmark, entry);
    const tagOverlap = this._computeTagOverlap(bookmark, entry);

    const total = urlMatch * URL_MATCH_WEIGHT
                + titleSimilarity * TITLE_SIMILARITY_WEIGHT
                + tagOverlap * TAG_OVERLAP_WEIGHT;

    return {
      urlMatch: Math.round(urlMatch * 1000) / 1000,
      titleSimilarity: Math.round(titleSimilarity * 1000) / 1000,
      tagOverlap: Math.round(tagOverlap * 1000) / 1000,
      total: Math.round(total * 1000) / 1000,
    };
  }

  /**
   * URL 匹配: 比较书签 URL 和条目 sourceUrl 的规范化形式
   *
   * @param {Object} bookmark
   * @param {Object} entry
   * @returns {number} 0 or 1
   */
  _computeUrlMatch(bookmark, entry) {
    const bmUrl = this._normalizeUrl(bookmark.url || '');
    const entryUrl = this._normalizeUrl(entry.sourceUrl || '');

    if (!bmUrl || !entryUrl) return 0;

    // 精确匹配
    if (bmUrl === entryUrl) return 1;

    // 包含匹配 — 如 domain.com/path1 包含 domain.com/path
    if (bmUrl.startsWith(entryUrl + '/') || entryUrl.startsWith(bmUrl + '/')) return 0.7;

    // 同域名匹配
    const bmDomain = bmUrl.split('/')[0];
    const entryDomain = entryUrl.split('/')[0];
    if (bmDomain === entryDomain && bmDomain.length > 0) return 0.3;

    return 0;
  }

  /**
   * 标题语义相似度 — 基于 EmbeddingEngine 的 TF-IDF 余弦相似度
   *
   * @param {Object} bookmark
   * @param {Object} entry
   * @returns {number} 0-1
   */
  _computeTitleSimilarity(bookmark, entry) {
    const bmText = [bookmark.title || '', (bookmark.contentPreview || '')].join(' ');
    const entryText = [entry.title || '', entry.question || '', (entry.summary || '')].join(' ');

    if (!bmText.trim() || !entryText.trim()) return 0;

    try {
      const bmVec = this._embeddingEngine.generateVector(bmText);
      const entryVec = this._embeddingEngine.generateVector(entryText);

      if (bmVec.size === 0 || entryVec.size === 0) return 0;

      return this._embeddingEngine.cosineSimilarity(bmVec, entryVec);
    } catch {
      return 0;
    }
  }

  /**
   * 标签重叠度 — Jaccard 系数
   *
   * @param {Object} bookmark
   * @param {Object} entry
   * @returns {number} 0-1
   */
  _computeTagOverlap(bookmark, entry) {
    const bmTags = new Set(
      (bookmark.tags || []).map(t => this._normalizeTag(t)).filter(Boolean)
    );
    const entryTags = new Set(
      (entry.tags || []).map(t => this._normalizeTag(t)).filter(Boolean)
    );

    if (bmTags.size === 0 || entryTags.size === 0) return 0;

    let intersection = 0;
    for (const tag of bmTags) {
      if (entryTags.has(tag)) intersection++;
    }

    const union = bmTags.size + entryTags.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}
