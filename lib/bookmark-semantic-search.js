/**
 * BookmarkSemanticSearch — 语义搜索引擎
 *
 * 迭代 R65: 语义搜索 BookmarkSemanticSearch
 *
 * 设计决策:
 *   - 复用 EmbeddingEngine (迭代 #7) 的 TF-IDF 核心算法
 *   - 为书签域定义独立字段权重 (title: 3.0, tags: 2.0, contentPreview: 1.5, folderPath: 1.0, url: 0.5)
 *   - 纯 ES Module，零外部依赖，不依赖 DOM
 *   - 支持增量更新 (addBookmark / removeBookmark)
 *   - 混合搜索合并关键词 + 语义结果，默认权重 0.6:0.4
 *   - 向量缓存支持失效与清除
 *
 * 接口:
 *   constructor(embeddingEngine?, bookmarkSearch?)
 *   buildIndex(bookmarks[])         — 全量构建 TF-IDF 词汇表 + 文档向量
 *   addBookmark(bookmark)           — 增量添加
 *   removeBookmark(bookmarkId)      — 增量删除
 *   semanticSearch(query, opts?)    — 纯语义搜索
 *   hybridSearch(query, opts?)      — 混合搜索 (关键词 + 语义)
 *   findSimilar(bookmarkId, limit?) — 以文搜文
 *   invalidateCache(bookmarkId?)    — 缓存失效
 *   getStats()                      — 索引统计
 *   _mergeResults(keyword, semantic, ratio) — 内部: 结果合并
 */

import { EmbeddingEngine } from './embedding-engine.js';

/**
 * @typedef {Object} SemanticSearchResult
 * @property {string}  id        — 书签 ID
 * @property {number}  score     — 语义相关度分数 (0-1)
 * @property {Object}  bookmark  — 原始书签对象
 * @property {string}  matchType — 'semantic' | 'keyword' | 'hybrid'
 */

/**
 * @typedef {Object} SearchOptions
 * @property {number} [limit=20]   — 结果数量限制
 * @property {string} [sortBy]     — 排序策略: 'relevance' | 'semantic-only' | 'keyword-only'
 */

export class BookmarkSemanticSearch {
  /**
   * 书签域字段权重
   * - title: 3.0 — 标题是最核心的语义信号
   * - tags: 2.0 — 标签是用户/自动分类的结果
   * - contentPreview: 1.5 — 来自 BookmarkContentPreview 的摘要
   * - folderPath: 1.0 — 文件夹路径提供上下文
   * - url: 0.5 — 域名/路径关键词
   */
  static FIELD_WEIGHTS = Object.freeze({
    title: 3.0,
    tags: 2.0,
    contentPreview: 1.5,
    folderPath: 1.0,
    url: 0.5,
  });

  /**
   * @param {EmbeddingEngine} [embeddingEngine] — 可选，自定义 EmbeddingEngine 实例
   * @param {Object}          [bookmarkSearch]  — 可选，BookmarkSearch 实例用于混合搜索
   */
  constructor(embeddingEngine, bookmarkSearch) {
    /** @type {EmbeddingEngine} */
    this._embeddingEngine = embeddingEngine || new EmbeddingEngine();
    /** @type {Object|null} BookmarkSearch 实例 */
    this._bookmarkSearch = bookmarkSearch || null;

    /** @type {Map<string, Object>} bookmarkId → bookmark object */
    this._bookmarkStore = new Map();
    /** @type {Map<string, Map>} bookmarkId → TF-IDF 向量 */
    this._documentVectors = new Map();
    /** @type {Map<string, number>} term → 文档频率 */
    this._vocabulary = new Map();
    /** @type {number} 索引中的文档总数 */
    this._documentCount = 0;
  }

  // ==================== 索引构建 ====================

  /**
   * 全量构建 TF-IDF 词汇表 + 文档向量
   *
   * 流程:
   *   1. 清空旧索引
   *   2. 存储所有书签
   *   3. 对每本书签生成带字段权重的文档文本
   *   4. 构建词汇表 (document frequency)
   *   5. 为 EmbeddingEngine 设置词汇表和文档数
   *   6. 为每本书签生成 TF-IDF 文档向量
   *
   * @param {Object[]} bookmarks — 标准化书签数组
   */
  buildIndex(bookmarks) {
    // 清空旧索引
    this._bookmarkStore.clear();
    this._documentVectors.clear();
    this._vocabulary = new Map();
    this._documentCount = 0;

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) return;

    // 1. 存储所有书签
    for (const bm of bookmarks) {
      if (bm && bm.id) {
        this._bookmarkStore.set(String(bm.id), bm);
      }
    }

    this._documentCount = this._bookmarkStore.size;
    if (this._documentCount === 0) return;

    // 2. 构建词汇表 — 统计每个 term 出现在多少个文档中 (document frequency)
    const tempVocab = new Map();

    for (const [id, bm] of this._bookmarkStore) {
      const text = this._getWeightedText(bm);
      const tokens = new Set(this._embeddingEngine.tokenize(text));

      for (const token of tokens) {
        tempVocab.set(token, (tempVocab.get(token) || 0) + 1);
      }
    }

    this._vocabulary = tempVocab;

    // 3. 通过 EmbeddingEngine 的 buildVocabulary 设置 IDF 计算基础
    //    我们手动设置内部状态，而不是传入 entries
    this._embeddingEngine._vocabulary = new Map(this._vocabulary);
    this._embeddingEngine._docCount = this._documentCount;
    this._embeddingEngine._vectorCache.clear();

    // 4. 为每本书签生成文档向量 (使用书签域的字段权重)
    for (const [id, bm] of this._bookmarkStore) {
      const vec = this._generateBookmarkVector(bm);
      if (vec.size > 0) {
        this._documentVectors.set(id, vec);
      }
    }
  }

  /**
   * 增量添加书签到索引
   *
   * @param {Object} bookmark — 标准化书签对象
   */
  addBookmark(bookmark) {
    if (!bookmark || !bookmark.id) return;

    const id = String(bookmark.id);
    this._bookmarkStore.set(id, bookmark);

    // 更新词汇表
    const text = this._getWeightedText(bookmark);
    const tokens = new Set(this._embeddingEngine.tokenize(text));

    for (const token of tokens) {
      this._vocabulary.set(token, (this._vocabulary.get(token) || 0) + 1);
    }

    this._documentCount = this._bookmarkStore.size;

    // 更新 EmbeddingEngine 内部状态
    this._embeddingEngine._vocabulary = new Map(this._vocabulary);
    this._embeddingEngine._docCount = this._documentCount;
    this._embeddingEngine._vectorCache.delete(id);

    // 生成文档向量
    const vec = this._generateBookmarkVector(bookmark);
    if (vec.size > 0) {
      this._documentVectors.set(id, vec);
    }
  }

  /**
   * 增量删除书签
   *
   * @param {string} bookmarkId — 书签 ID
   * @returns {boolean} 是否成功删除
   */
  removeBookmark(bookmarkId) {
    const id = String(bookmarkId);

    if (!this._bookmarkStore.has(id)) return false;

    const bookmark = this._bookmarkStore.get(id);

    // 更新词汇表 — 减少 term 的文档频率
    const text = this._getWeightedText(bookmark);
    const tokens = new Set(this._embeddingEngine.tokenize(text));

    for (const token of tokens) {
      const count = this._vocabulary.get(token) || 0;
      if (count <= 1) {
        this._vocabulary.delete(token);
      } else {
        this._vocabulary.set(token, count - 1);
      }
    }

    // 删除存储
    this._bookmarkStore.delete(id);
    this._documentVectors.delete(id);
    this._embeddingEngine._vectorCache.delete(id);

    this._documentCount = this._bookmarkStore.size;

    // 更新 EmbeddingEngine 内部状态
    this._embeddingEngine._vocabulary = new Map(this._vocabulary);
    this._embeddingEngine._docCount = this._documentCount;

    return true;
  }

  // ==================== 语义搜索 ====================

  /**
   * 纯语义搜索 — 基于 TF-IDF 余弦相似度
   *
   * @param {string}       query — 自然语言查询
   * @param {SearchOptions} [opts]
   * @returns {SemanticSearchResult[]}
   */
  semanticSearch(query, opts = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) return [];

    const { limit = 20 } = opts;
    const trimmed = query.trim();

    // 生成查询向量 (使用 EmbeddingEngine 的标准 tokenize + TF-IDF)
    const queryVec = this._embeddingEngine.generateVector(trimmed);
    if (queryVec.size === 0) return [];

    // 与所有文档向量计算余弦相似度
    const scored = [];

    for (const [id, docVec] of this._documentVectors) {
      const score = this._embeddingEngine.cosineSimilarity(queryVec, docVec);
      if (score > 0) {
        scored.push({
          id,
          score,
          bookmark: this._bookmarkStore.get(id),
          matchType: 'semantic',
        });
      }
    }

    // 按分数降序排序
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
  }

  // ==================== 混合搜索 ====================

  /**
   * 混合搜索 — 合并关键词搜索结果和语义搜索结果
   *
   * 流程:
   *   1. 如果有 BookmarkSearch，执行关键词搜索
   *   2. 执行语义搜索
   *   3. 合并结果 (精确匹配权重 > 语义匹配权重)
   *
   * @param {string}       query — 搜索查询
   * @param {SearchOptions} [opts]
   * @returns {SemanticSearchResult[]}
   */
  hybridSearch(query, opts = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) return [];

    const { limit = 20, sortBy = 'relevance' } = opts;
    const ratio = 0.6; // keyword weight

    // 1. 关键词搜索 (如果有 BookmarkSearch)
    let keywordResults = [];
    if (this._bookmarkSearch) {
      const kwResults = this._bookmarkSearch.search(query, { limit: 100 });
      keywordResults = kwResults.map(r => ({
        id: r.id,
        score: r.score,
        bookmark: r.bookmark,
        matchType: 'keyword',
      }));
    }

    // 2. 语义搜索
    const semanticResults = this.semanticSearch(query, { limit: 100 });

    // 3. 合并结果
    let merged = this._mergeResults(keywordResults, semanticResults, ratio);

    // 4. 排序策略
    switch (sortBy) {
      case 'semantic-only':
        merged = merged.filter(r => r.matchType === 'semantic' || r.matchType === 'hybrid');
        merged.sort((a, b) => {
          const sa = a.matchType === 'hybrid' ? a._semanticScore || a.score : a.score;
          const sb = b.matchType === 'hybrid' ? b._semanticScore || b.score : b.score;
          return sb - sa;
        });
        break;

      case 'keyword-only':
        merged = merged.filter(r => r.matchType === 'keyword' || r.matchType === 'hybrid');
        merged.sort((a, b) => b.score - a.score);
        break;

      case 'relevance':
      default:
        merged.sort((a, b) => b.score - a.score);
        break;
    }

    return merged.slice(0, limit);
  }

  // ==================== 以文搜文 ====================

  /**
   * 以文搜文 — 查找与指定书签最相似的书签
   *
   * @param {string} bookmarkId — 查询书签 ID
   * @param {number} [limit=5]  — 返回数量
   * @returns {SemanticSearchResult[]}
   */
  findSimilar(bookmarkId, limit = 5) {
    const id = String(bookmarkId);

    if (!this._documentVectors.has(id)) return [];

    const queryVec = this._documentVectors.get(id);
    if (!queryVec || queryVec.size === 0) return [];

    const scored = [];

    for (const [docId, docVec] of this._documentVectors) {
      if (docId === id) continue; // 排除自身

      const score = this._embeddingEngine.cosineSimilarity(queryVec, docVec);
      if (score > 0) {
        scored.push({
          id: docId,
          score,
          bookmark: this._bookmarkStore.get(docId),
          matchType: 'semantic',
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  // ==================== 缓存管理 ====================

  /**
   * 清除向量缓存
   *
   * @param {string} [bookmarkId] — 指定书签 ID；无参数则清除全部缓存
   */
  invalidateCache(bookmarkId) {
    if (bookmarkId) {
      const id = String(bookmarkId);
      this._documentVectors.delete(id);
      this._embeddingEngine._vectorCache.delete(id);
    } else {
      this._documentVectors.clear();
      this._embeddingEngine._vectorCache.clear();
    }
  }

  // ==================== 统计 ====================

  /**
   * 获取索引统计信息
   *
   * @returns {{ totalBookmarks: number, vocabularySize: number, documentCount: number }}
   */
  getStats() {
    return {
      totalBookmarks: this._bookmarkStore.size,
      vocabularySize: this._vocabulary.size,
      documentCount: this._documentCount,
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 生成书签的带字段权重的文本
   *
   * 按照 BOOKMARK_FIELD_WEIGHTS 定义的权重，对不同字段的 token 进行重复以实现加权。
   * title 重复 3 次，tags 重复 2 次，contentPreview 重复 1.5 次 (向上取整)，
   * folderPath 重复 1 次，url 重复 0.5 次 (至少 1 次出现)。
   *
   * @param {Object} bookmark
   * @returns {string} 加权后的文档文本
   */
  _getWeightedText(bookmark) {
    const weights = BookmarkSemanticSearch.FIELD_WEIGHTS;
    const parts = [];

    // title (weight 3.0 → 重复 3 次)
    if (bookmark.title) {
      for (let i = 0; i < Math.round(weights.title); i++) {
        parts.push(bookmark.title);
      }
    }

    // tags (weight 2.0 → 重复 2 次)
    if (bookmark.tags && Array.isArray(bookmark.tags)) {
      const tagText = bookmark.tags.join(' ');
      for (let i =  0; i < Math.round(weights.tags); i++) {
        parts.push(tagText);
      }
    }

    // contentPreview (weight 1.5 → 重复 2 次, 向上取整)
    if (bookmark.contentPreview) {
      const rounds = Math.max(1, Math.round(weights.contentPreview));
      for (let i = 0; i < rounds; i++) {
        parts.push(bookmark.contentPreview);
      }
    }

    // folderPath (weight 1.0 → 1 次)
    if (bookmark.folderPath && Array.isArray(bookmark.folderPath)) {
      parts.push(bookmark.folderPath.join(' '));
    }

    // url (weight 0.5 → 1 次, 但 weight < 1 所以只出现 1 次)
    if (bookmark.url) {
      parts.push(bookmark.url);
    }

    return parts.join(' ');
  }

  /**
   * 为书签生成 TF-IDF 文档向量 (使用书签域字段权重)
   *
   * @param {Object} bookmark
   * @returns {Map<string, number>} TF-IDF 向量
   */
  _generateBookmarkVector(bookmark) {
    const weights = BookmarkSemanticSearch.FIELD_WEIGHTS;
    const termWeights = {};

    for (const [field, weight] of Object.entries(weights)) {
      let text;

      if (field === 'tags') {
        text = (bookmark.tags && Array.isArray(bookmark.tags)) ? bookmark.tags.join(' ') : '';
      } else if (field === 'folderPath') {
        text = (bookmark.folderPath && Array.isArray(bookmark.folderPath)) ? bookmark.folderPath.join(' ') : '';
      } else {
        text = bookmark[field] || '';
      }

      if (!text) continue;

      const tokens = this._embeddingEngine.tokenize(text);
      if (tokens.length === 0) continue;

      const fieldTf = {};
      for (const t of tokens) fieldTf[t] = (fieldTf[t] || 0) + 1;
      const totalTokens = tokens.length;

      for (const [term, count] of Object.entries(fieldTf)) {
        const tfVal = count / totalTokens;
        const idfVal = this._documentCount > 0 ? this._idf(term) : 1;
        const w = tfVal * idfVal * weight;
        if (w > 0) termWeights[term] = (termWeights[term] || 0) + w;
      }
    }

    const vec = new Map();
    for (const [term, w] of Object.entries(termWeights)) vec.set(term, w);
    return vec;
  }

  /**
   * 计算 IDF (Inverse Document Frequency)
   *
   * @param {string} term
   * @returns {number}
   */
  _idf(term) {
    const df = this._vocabulary.get(term) || 0;
    return Math.log(this._documentCount + 1) - Math.log(1 + df);
  }

  /**
   * 合并关键词搜索结果和语义搜索结果
   *
   * @param {SemanticSearchResult[]} keywordResults  — 关键词搜索结果
   * @param {SemanticSearchResult[]} semanticResults — 语义搜索结果
   * @param {number}                 ratio           — 关键词权重 (0-1)，语义权重 = 1 - ratio
   * @returns {SemanticSearchResult[]} 合并后的结果
   */
  _mergeResults(keywordResults, semanticResults, ratio = 0.6) {
    const merged = new Map();
    const semanticWeight = 1 - ratio;

    // 归一化: 将各来源的 score 归一化到 [0, 1]
    const keywordMax = keywordResults.length > 0
      ? Math.max(...keywordResults.map(r => r.score))
      : 1;
    const semanticMax = semanticResults.length > 0
      ? Math.max(...semanticResults.map(r => r.score))
      : 1;

    // 1. 添加关键词结果
    for (const r of keywordResults) {
      const normalizedScore = keywordMax > 0 ? (r.score / keywordMax) * ratio : 0;
      merged.set(r.id, {
        ...r,
        score: normalizedScore,
        matchType: 'keyword',
        _keywordScore: r.score,
      });
    }

    // 2. 添加/合并语义结果
    for (const r of semanticResults) {
      const normalizedScore = semanticMax > 0 ? (r.score / semanticMax) * semanticWeight : 0;

      if (merged.has(r.id)) {
        // 双向命中 → hybrid
        const existing = merged.get(r.id);
        existing.score += normalizedScore;
        existing.matchType = 'hybrid';
        existing._semanticScore = r.score;
      } else {
        merged.set(r.id, {
          ...r,
          score: normalizedScore,
          matchType: 'semantic',
          _semanticScore: r.score,
        });
      }
    }

    // 按合并后的分数降序排序
    const results = [...merged.values()];
    results.sort((a, b) => b.score - a.score);

    return results;
  }
}
