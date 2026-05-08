/**
 * BookmarkKnowledgeIntegration — 书签-知识库联动
 *
 * 迭代 R73: 书签-知识库联动 BookmarkKnowledgeIntegration
 *
 * 设计决策:
 *   - 编排层: 桥接 BookmarkKnowledgeCorrelation (R66) 与实际数据源
 *   - 双向导航: 书签→知识条目 和 知识条目→书签，带导航提示
 *   - 知识增强: enrichBookmark/enrichEntry 为数据附加跨域上下文
 *   - 仪表盘: getDashboard 提供联动概览 (高关联书签/建议/孤立节点)
 *   - 依赖注入: correlationEngine/embeddingEngine 通过构造函数注入，便于测试
 *   - 纯 ES Module: 不依赖 DOM/Chrome API
 *   - 安全降级: destroy 后所有 API 返回空结果，不抛异常
 *
 * 接口:
 *   constructor(options?)
 *   init(bookmarks, entries)               — 初始化联动引擎
 *   sync(bookmarks?, entries?)             — 同步/刷新数据
 *   isReady()                              — 是否就绪
 *   getKnowledgeForBookmark(bookmarkId, opts?) — 书签→知识条目
 *   getBookmarksForEntry(entryId, opts?)       — 知识条目→书签
 *   buildNavigationLinks(bookmarkId)       — 构建书签导航链接
 *   buildEntryNavLinks(entryId)            — 构建条目导航链接
 *   getBookmarkKnowledgeSummary(bookmarkId) — 书签知识摘要
 *   getEntryKnowledgeSummary(entryId)      — 条目知识摘要
 *   enrichBookmark(bookmarkId)             — 为书签附加知识上下文
 *   enrichEntry(entryId)                   — 为条目附加书签上下文
 *   getIntegrationStats()                  — 联动统计
 *   getDashboard()                         — 仪表盘数据
 *   destroy()                              — 清理资源
 */

import { BookmarkKnowledgeCorrelation } from './bookmark-knowledge-link.js';

// ==================== 默认配置 ====================

/** 默认关联阈值 */
const DEFAULT_CORRELATION_THRESHOLD = 0.15;

/** 默认返回结果上限 */
const DEFAULT_MAX_RESULTS = 10;

/** 仪表盘 Top-N */
const DASHBOARD_TOP_N = 5;

/** 导航提示模板 */
const NAV_HINTS = {
  strong: '强关联 — URL/标题/标签高度匹配',
  medium: '中等关联 — 内容领域相关',
  weak: '弱关联 — 部分特征相似',
};

// ==================== BookmarkKnowledgeIntegration ====================

export class BookmarkKnowledgeIntegration {
  /**
   * @param {Object} [options]
   * @param {Object} [options.correlationEngine] — 自定义 BookmarkKnowledgeCorrelation 实例
   * @param {number} [options.correlationThreshold] — 关联阈值
   * @param {number} [options.maxResults] — 默认返回上限
   */
  constructor(options = {}) {
    /** @type {BookmarkKnowledgeCorrelation} */
    this._correlationEngine = options.correlationEngine || new BookmarkKnowledgeCorrelation();

    /** @type {number} 关联阈值 */
    this._correlationThreshold = options.correlationThreshold ?? DEFAULT_CORRELATION_THRESHOLD;

    /** @type {number} 默认返回上限 */
    this._maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;

    /** @type {boolean} 是否就绪 */
    this._ready = false;

    /** @type {number|null} 上次同步时间 */
    this._syncedAt = null;

    /** @type {Map<string, Object>} bookmarkId → bookmark (快速查找) */
    this._bookmarkMap = new Map();

    /** @type {Map<number, Object>} entryId → entry (快速查找) */
    this._entryMap = new Map();
  }

  // ==================== 生命周期 ====================

  /**
   * 初始化联动引擎 — 全量构建关联索引
   *
   * @param {Object[]|null} bookmarks — 书签数组
   * @param {Object[]|null} entries   — 知识条目数组
   */
  init(bookmarks, entries) {
    const safeBookmarks = Array.isArray(bookmarks) ? bookmarks : [];
    const safeEntries = Array.isArray(entries) ? entries : [];

    this._bookmarkMap.clear();
    this._entryMap.clear();

    for (const bm of safeBookmarks) {
      if (bm && bm.id) {
        this._bookmarkMap.set(String(bm.id), bm);
      }
    }

    for (const entry of safeEntries) {
      if (entry && entry.id != null) {
        this._entryMap.set(Number(entry.id), entry);
      }
    }

    this._correlationEngine.buildIndex(safeBookmarks, safeEntries);
    this._ready = true;
    this._syncedAt = Date.now();
  }

  /**
   * 同步/刷新数据 — 支持增量或全量刷新
   *
   * @param {Object[]} [bookmarks] — 新书签数组
   * @param {Object[]} [entries]   — 新知识条目数组
   */
  sync(bookmarks, entries) {
    if (!this._ready) {
      this.init(bookmarks, entries);
      return;
    }

    // 如果提供了新数据，全量重建
    if (Array.isArray(bookmarks) || Array.isArray(entries)) {
      this.init(
        Array.isArray(bookmarks) ? bookmarks : [...this._bookmarkMap.values()],
        Array.isArray(entries) ? entries : [...this._entryMap.values()],
      );
    }

    this._syncedAt = Date.now();
  }

  /**
   * 是否就绪
   * @returns {boolean}
   */
  isReady() {
    return this._ready;
  }

  // ==================== 核心查询 API ====================

  /**
   * 获取书签关联的知识条目 — 带导航提示
   *
   * @param {string|number} bookmarkId — 书签 ID
   * @param {Object} [opts]
   * @param {number} [opts.limit]     — 返回上限
   * @param {number} [opts.minScore]  — 最低关联度
   * @returns {Array<{score: number, matchTypes: string[], entry: Object, navigationHint: string}>}
   */
  getKnowledgeForBookmark(bookmarkId, opts = {}) {
    if (!this._ready) return [];

    const { limit = this._maxResults, minScore } = opts;

    const results = this._correlationEngine.getRelatedEntries(bookmarkId, { limit: 100 });

    return results
      .filter(r => minScore != null ? r.score >= minScore : true)
      .slice(0, limit)
      .map(r => ({
        score: r.score,
        matchTypes: r.matchTypes,
        entry: r.entry,
        navigationHint: this._buildNavHint(r.score, r.matchTypes),
      }));
  }

  /**
   * 获取知识条目关联的书签 — 带导航提示
   *
   * @param {number|string} entryId — 条目 ID
   * @param {Object} [opts]
   * @param {number} [opts.limit]    — 返回上限
   * @param {number} [opts.minScore] — 最低关联度
   * @returns {Array<{score: number, matchTypes: string[], bookmark: Object, navigationHint: string}>}
   */
  getBookmarksForEntry(entryId, opts = {}) {
    if (!this._ready) return [];

    const { limit = this._maxResults, minScore } = opts;

    const results = this._correlationEngine.getRelatedBookmarks(entryId, { limit: 100 });

    return results
      .filter(r => minScore != null ? r.score >= minScore : true)
      .slice(0, limit)
      .map(r => ({
        score: r.score,
        matchTypes: r.matchTypes,
        bookmark: r.bookmark,
        navigationHint: this._buildNavHint(r.score, r.matchTypes),
      }));
  }

  // ==================== 导航链接构建 ====================

  /**
   * 构建书签→知识条目的导航链接
   *
   * @param {string|number} bookmarkId — 书签 ID
   * @returns {Object|null} { bookmark, knowledgeLinks[], totalLinks }
   */
  buildNavigationLinks(bookmarkId) {
    if (!this._ready) return null;

    const bmId = String(bookmarkId);
    const bookmark = this._bookmarkMap.get(bmId);
    if (!bookmark) return null;

    const related = this.getKnowledgeForBookmark(bmId);

    const knowledgeLinks = related.map(r => ({
      entryId: r.entry.id,
      entryTitle: r.entry.title || r.entry.question || '未命名',
      entrySummary: r.entry.summary || '',
      score: r.score,
      matchTypes: r.matchTypes,
      navigationHint: r.navigationHint,
    }));

    return {
      bookmark,
      knowledgeLinks,
      totalLinks: knowledgeLinks.length,
    };
  }

  /**
   * 构建知识条目→书签的导航链接
   *
   * @param {number|string} entryId — 条目 ID
   * @returns {Object|null} { entry, bookmarkLinks[], totalLinks }
   */
  buildEntryNavLinks(entryId) {
    if (!this._ready) return null;

    const eId = Number(entryId);
    const entry = this._entryMap.get(eId);
    if (!entry) return null;

    const related = this.getBookmarksForEntry(eId);

    const bookmarkLinks = related.map(r => ({
      bookmarkId: r.bookmark.id,
      bookmarkTitle: r.bookmark.title || '未命名',
      bookmarkUrl: r.bookmark.url || '',
      score: r.score,
      matchTypes: r.matchTypes,
      navigationHint: r.navigationHint,
    }));

    return {
      entry,
      bookmarkLinks,
      totalLinks: bookmarkLinks.length,
    };
  }

  // ==================== 知识摘要 ====================

  /**
   * 获取书签的知识摘要 — 关联条目数量、平均分、Top 条目、匹配类型分布
   *
   * @param {string|number} bookmarkId — 书签 ID
   * @returns {Object|null}
   */
  getBookmarkKnowledgeSummary(bookmarkId) {
    if (!this._ready) return null;

    const bmId = String(bookmarkId);
    const bookmark = this._bookmarkMap.get(bmId);
    if (!bookmark) return null;

    const related = this.getKnowledgeForBookmark(bmId);

    const avgScore = related.length > 0
      ? Math.round(related.reduce((s, r) => s + r.score, 0) / related.length * 1000) / 1000
      : 0;

    // 统计匹配类型分布
    const typeCount = { url: 0, title: 0, tag: 0 };
    for (const r of related) {
      for (const t of r.matchTypes) {
        if (t in typeCount) typeCount[t]++;
      }
    }

    return {
      bookmark,
      totalRelatedEntries: related.length,
      avgCorrelationScore: avgScore,
      topEntries: related.slice(0, DASHBOARD_TOP_N).map(r => ({
        entry: r.entry,
        score: r.score,
        matchTypes: r.matchTypes,
      })),
      matchTypeDistribution: Object.entries(typeCount)
        .map(([type, count]) => ({ type, count })),
    };
  }

  /**
   * 获取知识条目的书签摘要
   *
   * @param {number|string} entryId — 条目 ID
   * @returns {Object|null}
   */
  getEntryKnowledgeSummary(entryId) {
    if (!this._ready) return null;

    const eId = Number(entryId);
    const entry = this._entryMap.get(eId);
    if (!entry) return null;

    const related = this.getBookmarksForEntry(eId);

    const avgScore = related.length > 0
      ? Math.round(related.reduce((s, r) => s + r.score, 0) / related.length * 1000) / 1000
      : 0;

    return {
      entry,
      totalRelatedBookmarks: related.length,
      avgCorrelationScore: avgScore,
      topBookmarks: related.slice(0, DASHBOARD_TOP_N).map(r => ({
        bookmark: r.bookmark,
        score: r.score,
        matchTypes: r.matchTypes,
      })),
    };
  }

  // ==================== 知识增强 ====================

  /**
   * 为书签附加知识上下文 — enrichBookmark
   *
   * @param {string|number} bookmarkId — 书签 ID
   * @returns {Object|null} { bookmark, knowledgeContext[], knowledgeCount, enrichmentScore }
   */
  enrichBookmark(bookmarkId) {
    if (!this._ready) return null;

    const bmId = String(bookmarkId);
    const bookmark = this._bookmarkMap.get(bmId);
    if (!bookmark) return null;

    const related = this.getKnowledgeForBookmark(bmId);

    const knowledgeContext = related.map(r => ({
      entryId: r.entry.id,
      title: r.entry.title || r.entry.question || '',
      summary: r.entry.summary || '',
      category: r.entry.category || '未分类',
      tags: r.entry.tags || [],
      score: r.score,
      matchTypes: r.matchTypes,
    }));

    const enrichmentScore = related.length > 0
      ? Math.min(1, Math.round(related.reduce((s, r) => s + r.score, 0) / Math.max(related.length, 1) * 100) / 100)
      : 0;

    return {
      bookmark,
      knowledgeContext,
      knowledgeCount: knowledgeContext.length,
      enrichmentScore,
    };
  }

  /**
   * 为知识条目附加书签上下文 — enrichEntry
   *
   * @param {number|string} entryId — 条目 ID
   * @returns {Object|null} { entry, bookmarkContext[], bookmarkCount, enrichmentScore }
   */
  enrichEntry(entryId) {
    if (!this._ready) return null;

    const eId = Number(entryId);
    const entry = this._entryMap.get(eId);
    if (!entry) return null;

    const related = this.getBookmarksForEntry(eId);

    const bookmarkContext = related.map(r => ({
      bookmarkId: r.bookmark.id,
      title: r.bookmark.title || '',
      url: r.bookmark.url || '',
      folderPath: r.bookmark.folderPath || [],
      tags: r.bookmark.tags || [],
      status: r.bookmark.status || 'unread',
      score: r.score,
      matchTypes: r.matchTypes,
    }));

    const enrichmentScore = related.length > 0
      ? Math.min(1, Math.round(related.reduce((s, r) => s + r.score, 0) / Math.max(related.length, 1) * 100) / 100)
      : 0;

    return {
      entry,
      bookmarkContext,
      bookmarkCount: bookmarkContext.length,
      enrichmentScore,
    };
  }

  // ==================== 统计与仪表盘 ====================

  /**
   * 获取联动统计信息
   *
   * @returns {{ totalBookmarks: number, totalEntries: number, totalCorrelations: number,
   *             associatedBookmarks: number, associatedEntries: number,
   *             avgCorrelationsPerBookmark: number, coverageRate: number, syncedAt: number|null }}
   */
  getIntegrationStats() {
    if (!this._ready) {
      return {
        totalBookmarks: 0,
        totalEntries: 0,
        totalCorrelations: 0,
        associatedBookmarks: 0,
        associatedEntries: 0,
        avgCorrelationsPerBookmark: 0,
        coverageRate: 0,
        syncedAt: null,
      };
    }

    const base = this._correlationEngine.getStats();

    const coverageRate = base.totalBookmarks > 0
      ? Math.round((base.associatedBookmarks / base.totalBookmarks) * 1000) / 1000
      : 0;

    return {
      ...base,
      coverageRate,
      syncedAt: this._syncedAt,
    };
  }

  /**
   * 获取仪表盘数据 — 一站式联动概览
   *
   * @returns {{ stats: Object, topCorrelatedBookmarks: Array, suggestions: Array,
   *             orphanBookmarks: Array, orphanEntries: Array }}
   */
  getDashboard() {
    const stats = this.getIntegrationStats();

    if (!this._ready) {
      return {
        stats,
        topCorrelatedBookmarks: [],
        suggestions: [],
        orphanBookmarks: [],
        orphanEntries: [],
      };
    }

    // Top 关联书签 — 按关联条目数降序
    const bookmarkCorrelationCounts = [];
    for (const [bmId] of this._bookmarkMap) {
      const related = this._correlationEngine.getRelatedEntries(bmId, { limit: 100 });
      if (related.length > 0) {
        const avgScore = related.reduce((s, r) => s + r.score, 0) / related.length;
        bookmarkCorrelationCounts.push({
          bookmark: this._bookmarkMap.get(bmId),
          correlationCount: related.length,
          avgScore: Math.round(avgScore * 1000) / 1000,
        });
      }
    }
    bookmarkCorrelationCounts.sort((a, b) => b.correlationCount - a.correlationCount);

    // 孤立书签 — 无任何关联条目
    const orphanBookmarks = [];
    for (const [bmId, bookmark] of this._bookmarkMap) {
      const related = this._correlationEngine.getRelatedEntries(bmId, { limit: 1 });
      if (related.length === 0) {
        orphanBookmarks.push(bookmark);
      }
    }

    // 孤立条目 — 无任何关联书签
    const orphanEntries = [];
    for (const [entryId, entry] of this._entryMap) {
      const related = this._correlationEngine.getRelatedBookmarks(entryId, { limit: 1 });
      if (related.length === 0) {
        orphanEntries.push(entry);
      }
    }

    // 关联建议
    const suggestions = this._correlationEngine.suggestCorrelations({ limit: DASHBOARD_TOP_N });

    return {
      stats,
      topCorrelatedBookmarks: bookmarkCorrelationCounts.slice(0, DASHBOARD_TOP_N),
      suggestions,
      orphanBookmarks,
      orphanEntries,
    };
  }

  // ==================== 资源管理 ====================

  /**
   * 清理所有资源
   */
  destroy() {
    this._ready = false;
    this._syncedAt = null;
    this._bookmarkMap.clear();
    this._entryMap.clear();
    // 重建空白关联引擎
    this._correlationEngine.buildIndex([], []);
  }

  // ==================== 内部方法 ====================

  /**
   * 根据关联度和匹配类型生成导航提示
   *
   * @param {number}   score      — 关联度 (0-1)
   * @param {string[]} matchTypes — 匹配类型数组
   * @returns {string} 导航提示文本
   */
  _buildNavHint(score, matchTypes) {
    if (score >= 0.6) return NAV_HINTS.strong;
    if (score >= 0.3) return NAV_HINTS.medium;
    return NAV_HINTS.weak;
  }
}
