/**
 * BookmarkAIRecommendations — AI 智能推荐
 *
 * 分析用户收藏模式，调用 LLM 获取个性化学习推荐。
 * 包含收藏画像分析、AI 推荐生成、缓存管理、降级策略。
 *
 * 三种推荐类型:
 *   - pattern:      基于收藏模式的学习建议
 *   - gap-filling:  知识盲区领域的入门资源
 *   - depth:        已学领域的进阶方向
 *
 * 纯 ES Module，不依赖 DOM 或 Chrome API。
 * AIClient 通过构造函数注入 (依赖反转)。
 */

// ==================== 常量 ====================

/** 缓存 TTL: 30 分钟 */
const DEFAULT_CACHE_TTL = 30 * 60 * 1000;

/** 最近收藏时间窗口: 30 天 */
const RECENT_DAYS = 30;
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;

/** 难度关键词规则 (与 BookmarkLearningPath 保持一致) */
const DIFFICULTY_RULES = [
  {
    level: 'beginner',
    keywords: [
      'tutorial', 'getting started', 'introduction', 'beginner', 'basics',
      'quick start', 'first steps', 'hello world', 'starter',
      '入门', '教程', '快速上手', '基础', '初学', '新手',
    ],
  },
  {
    level: 'intermediate',
    keywords: [
      'advanced', 'deep dive', 'best practices', 'patterns', 'practical',
      'hands-on', 'cookbook', 'in practice', 'tips', 'tricks',
      '进阶', '最佳实践', '实战', '实践', '技巧',
    ],
  },
  {
    level: 'advanced',
    keywords: [
      'architecture', 'internals', 'performance', 'optimization', 'source code',
      'under the hood', 'scaling', 'benchmark', 'profiling', 'production-ready',
      '源码', '架构', '性能优化', '深入理解', '底层', '原理',
    ],
  },
];

/** Prompt 模板 — 系统角色 */
const SYSTEM_PROMPT = `你是一位资深技术学习顾问。你的任务是根据用户的技术书签收藏画像，为其推荐下一步学习方向。

要求:
1. 返回严格 JSON 格式，不要包含 markdown 代码块标记
2. 推荐 3-8 条，每条包含 type/category/summary/reason/suggestedTopics/confidence 字段
3. reason 至少 20 个中文字符
4. summary 不超过 50 字
5. suggestedTopics 为 1-3 个具体主题
6. confidence 为 0-1 之间的浮点数
7. type 为 "pattern" (收藏模式建议) / "gap-filling" (盲区入门) / "depth" (深度进阶)`;

// ==================== BookmarkAIRecommendations ====================

export class BookmarkAIRecommendations {
  /**
   * @param {Object} options
   * @param {Object}  options.aiClient         — AIClient 实例 (必需)
   * @param {Object}  [options.recommender]    — BookmarkRecommender 实例 (降级用)
   * @param {Object}  [options.clusterer]      — BookmarkClusterer 实例 (可选)
   * @param {Object}  [options.gapDetector]    — BookmarkGapDetector 实例 (可选)
   * @param {Object}  [options.learningPath]   — BookmarkLearningPath 实例 (可选)
   * @param {Object}  [options.progress]       — BookmarkLearningProgress 实例 (可选)
   * @param {number}  [options.cacheTtl]       — 缓存 TTL 毫秒 (默认 30min)
   */
  constructor(options = {}) {
    if (!options.aiClient) {
      throw new Error('BookmarkAIRecommendations requires an AIClient instance');
    }

    /** @type {Object} AIClient 实例 */
    this._aiClient = options.aiClient;
    /** @type {Object|null} BookmarkRecommender 降级推荐器 */
    this._recommender = options.recommender || null;
    /** @type {Object|null} BookmarkClusterer */
    this._clusterer = options.clusterer || null;
    /** @type {Object|null} BookmarkGapDetector */
    this._gapDetector = options.gapDetector || null;
    /** @type {Object|null} BookmarkLearningPath */
    this._learningPath = options.learningPath || null;
    /** @type {Object|null} BookmarkLearningProgress */
    this._progress = options.progress || null;

    /** @type {number} 缓存 TTL */
    this._cacheTtl = options.cacheTtl ?? DEFAULT_CACHE_TTL;

    // --- 内部状态 ---
    /** @type {Object|null} 缓存的推荐结果 */
    this._cachedResult = null;
    /** @type {number} 缓存生成时间 */
    this._cacheTime = 0;
    /** @type {Object|null} 缓存的画像 */
    this._cachedProfile = null;
    /** @type {'ai'|'fallback'|'cache'|null} 上次推荐来源 */
    this._lastSource = null;
    /** @type {Array} 全量书签 */
    this._bookmarks = [];
  }

  // ==================== 公共 API ====================

  /**
   * 分析用户收藏模式，生成结构化画像。
   * 纯本地计算，不调用 AI API。
   *
   * @param {Array}  bookmarks — 全量书签数组
   * @param {Object} [context] — 可选上下文 { clusters, gapResult, progressSummary }
   * @returns {Object} 用户画像
   */
  analyzeProfile(bookmarks, context = {}) {
    if (!Array.isArray(bookmarks)) {
      throw new Error('bookmarks must be an array');
    }

    this._bookmarks = bookmarks;

    // 1. 高频域名 Top-5
    const domainMap = new Map();
    for (const bm of bookmarks) {
      const domain = this._extractDomain(bm.url || '');
      if (domain) {
        domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
      }
    }
    const total = bookmarks.length || 1;
    const topDomains = [...domainMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => ({
        domain,
        count,
        ratio: Math.round((count / total) * 100) / 100,
      }));

    // 2. 领域分布 Top-5
    const categoryMap = new Map();
    for (const bm of bookmarks) {
      const category = this._inferCategory(bm);
      if (category) {
        categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      }
    }
    const topCategories = [...categoryMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({
        category,
        count,
        ratio: Math.round((count / total) * 100) / 100,
      }));

    // 3. 知识强项与盲区
    let strengths = [];
    let gaps = [];

    if (context.clusters && context.clusters instanceof Map) {
      for (const [cat, bms] of context.clusters) {
        const count = bms.length;
        if (count >= 10) strengths.push(cat);
        else if (count <= 2) gaps.push(cat);
      }
    } else if (context.gapResult) {
      strengths = context.gapResult.strengths || [];
      gaps = context.gapResult.gaps || [];
    } else {
      // 从 categoryMap 推断
      for (const [cat, count] of categoryMap) {
        if (count >= 10) strengths.push(cat);
        else if (count <= 2) gaps.push(cat);
      }
    }

    // 4. 近 30 天收藏焦点
    const now = Date.now();
    const recentCutoff = now - RECENT_MS;
    const recentCategoryMap = new Map();
    for (const bm of bookmarks) {
      const ts = bm.dateAdded || 0;
      if (ts >= recentCutoff) {
        const category = this._inferCategory(bm);
        if (category) {
          recentCategoryMap.set(category, (recentCategoryMap.get(category) || 0) + 1);
        }
      }
    }
    const recentFocus = [...recentCategoryMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));

    // 5. 阅读概况
    let readCount = 0;
    let readingCount = 0;
    let unreadCount = 0;
    for (const bm of bookmarks) {
      const status = bm.status || 'unread';
      if (status === 'read') readCount++;
      else if (status === 'reading') readingCount++;
      else unreadCount++;
    }
    const readingProgress = {
      read: readCount,
      reading: readingCount,
      unread: unreadCount,
      readRatio: total > 0 ? Math.round((readCount / total) * 100) / 100 : 0,
    };

    // 6. 难度分布
    const difficultyDistribution = { beginner: 0, intermediate: 0, advanced: 0 };
    for (const bm of bookmarks) {
      const diff = this._judgeDifficulty(bm);
      difficultyDistribution[diff] = (difficultyDistribution[diff] || 0) + 1;
    }

    const profile = {
      totalBookmarks: bookmarks.length,
      topDomains,
      topCategories,
      strengths,
      gaps,
      recentFocus,
      readingProgress,
      difficultyDistribution,
    };

    this._cachedProfile = profile;
    return profile;
  }

  /**
   * 获取 AI 智能推荐。
   * 优先使用缓存，缓存过期则调用 AIClient，失败则降级到规则推荐。
   *
   * @param {Object} [context] — 可选上下文 (同 analyzeProfile)
   * @returns {Promise<Object>} 推荐结果
   */
  async getRecommendations(context = {}) {
    // 1. 检查缓存
    if (this._cachedResult && this._isCacheValid()) {
      this._lastSource = 'cache';
      return {
        ...this._cachedResult,
        source: 'cache',
      };
    }

    // 2. 确保画像就绪
    const profile = this._cachedProfile || this.analyzeProfile(this._bookmarks, context);

    // 3. 尝试 AI 推荐
    try {
      const result = await this._getAIRecommendations(profile);
      this._cachedResult = result;
      this._cacheTime = Date.now();
      this._lastSource = 'ai';
      return result;
    } catch (err) {
      // AI 不可用，降级
      return this._fallbackRecommend(profile, context);
    }
  }

  /**
   * 清除推荐缓存
   */
  clearCache() {
    this._cachedResult = null;
    this._cacheTime = 0;
  }

  /**
   * 获取上次推荐的来源
   * @returns {'ai'|'fallback'|'cache'|null}
   */
  getLastSource() {
    return this._lastSource;
  }

  // ==================== AI 推荐 ====================

  /**
   * 调用 AIClient 获取推荐
   * @param {Object} profile — 用户画像
   * @returns {Promise<Object>}
   * @private
   */
  async _getAIRecommendations(profile) {
    const prompt = this._buildPrompt(profile);

    const response = await this._aiClient.chat(
      [{ role: 'user', content: prompt }],
      { systemPrompt: SYSTEM_PROMPT }
    );

    const content = response.content || '';
    const recommendations = this._parseAIResponse(content);

    // AI 返回空推荐 → 视为解析失败，触发降级
    if (recommendations.length === 0) {
      throw new Error('AI returned empty or invalid recommendations');
    }

    return {
      recommendations,
      profile,
      source: 'ai',
      generatedAt: Date.now(),
      model: response.model || 'unknown',
      promptTokens: response.usage?.prompt_tokens || response.usage?.input_tokens || 0,
    };
  }

  /**
   * 构建推荐 prompt
   * 只发送统计摘要，不发送原始书签全文
   * @param {Object} profile
   * @returns {string}
   * @private
   */
  _buildPrompt(profile) {
    // 精简画像为 prompt 友好的 JSON
    const summary = {
      totalBookmarks: profile.totalBookmarks,
      topDomains: profile.topDomains.map(d => `${d.domain}(${d.count})`),
      topCategories: profile.topCategories.map(c => `${c.category}(${c.count})`),
      strengths: profile.strengths,
      gaps: profile.gaps,
      recentFocus: profile.recentFocus.map(r => `${r.category}(${r.count})`),
      readingProgress: `已读${profile.readingProgress.read}/在读${profile.readingProgress.reading}/未读${profile.readingProgress.unread}`,
      difficulty: `入门${profile.difficultyDistribution.beginner}/进阶${profile.difficultyDistribution.intermediate}/高级${profile.difficultyDistribution.advanced}`,
    };

    return `以下是用户的技术书签收藏画像:

${JSON.stringify(summary, null, 2)}

请基于此画像为用户推荐 3-8 条学习建议，返回严格 JSON 格式:
{
  "recommendations": [
    {
      "type": "pattern|gap-filling|depth",
      "category": "领域名",
      "summary": "建议概述（不超过50字）",
      "reason": "推荐理由（至少20个中文字符的详细说明）",
      "suggestedTopics": ["具体主题1", "具体主题2"],
      "confidence": 0.85
    }
  ]
}`;
  }

  /**
   * 解析 AI 返回的 JSON
   * @param {string} content — AI 返回的文本
   * @returns {Array} 推荐列表
   * @private
   */
  _parseAIResponse(content) {
    if (!content || typeof content !== 'string') return [];

    // 尝试提取 JSON (可能包含 markdown 代码块标记)
    let jsonStr = content.trim();

    // 移除 markdown 代码块标记
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    jsonStr = jsonStr.trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return [];
    }

    // 字段校验
    if (!parsed || !Array.isArray(parsed.recommendations)) return [];

    const valid = [];
    for (const rec of parsed.recommendations) {
      if (!rec || typeof rec !== 'object') continue;

      const type = rec.type;
      if (!['pattern', 'gap-filling', 'depth'].includes(type)) continue;

      if (typeof rec.category !== 'string' || !rec.category) continue;
      if (typeof rec.summary !== 'string' || !rec.summary) continue;
      if (typeof rec.reason !== 'string' || rec.reason.length < 20) continue;

      let topics = rec.suggestedTopics;
      if (!Array.isArray(topics)) topics = [];
      topics = topics.filter(t => typeof t === 'string').slice(0, 3);
      if (topics.length === 0) continue;

      let confidence = rec.confidence;
      if (typeof confidence !== 'number' || isNaN(confidence)) confidence = 0.5;
      confidence = Math.max(0, Math.min(1, confidence));

      valid.push({
        type,
        category: rec.category,
        summary: rec.summary.slice(0, 50),
        reason: rec.reason,
        suggestedTopics: topics,
        confidence,
      });
    }

    return valid.slice(0, 8);
  }

  // ==================== 降级推荐 ====================

  /**
   * AI 不可用时的降级推荐
   * @param {Object} profile
   * @param {Object} context
   * @returns {Object}
   * @private
   */
  _fallbackRecommend(profile, context) {
    const recommendations = [];

    // 1. 盲区推荐: 从 gaps 中生成
    for (const gap of profile.gaps.slice(0, 3)) {
      recommendations.push({
        type: 'gap-filling',
        category: gap,
        summary: `建议补充「${gap}」领域的基础知识`,
        reason: `您的收藏中「${gap}」领域覆盖不足，作为技术学习者，补充此领域有助于构建更完整的知识体系，避免技术栈单一化。`,
        suggestedTopics: [`${gap} 入门教程`, `${gap} 实战指南`],
        confidence: 0.7,
      });
    }

    // 2. 深度推荐: 从 strengths 中生成
    for (const strength of profile.strengths.slice(0, 2)) {
      recommendations.push({
        type: 'depth',
        category: strength,
        summary: `「${strength}」领域可深入学习进阶主题`,
        reason: `您在「${strength}」领域已有较好的收藏基础，建议进一步探索高级主题以提升技术深度，从应用层面向底层原理过渡。`,
        suggestedTopics: [`${strength} 架构设计`, `${strength} 性能优化`],
        confidence: 0.6,
      });
    }

    // 3. 模式推荐: 从 topCategories 中生成
    if (profile.topCategories.length >= 2) {
      const top1 = profile.topCategories[0].category;
      const top2 = profile.topCategories[1]?.category;
      if (top2) {
        recommendations.push({
          type: 'pattern',
          category: top1,
          summary: `建议关注「${top1}」与「${top2}」的交叉领域`,
          reason: `您的收藏集中在「${top1}」和「${top2}」两个领域，探索两者的交叉应用可以帮助您建立更全面的技术视野和解决复杂问题的能力。`,
          suggestedTopics: [`${top1}与${top2}集成`, `全栈${top1}实践`],
          confidence: 0.5,
        });
      }
    }

    const result = {
      recommendations,
      profile,
      source: 'fallback',
      generatedAt: Date.now(),
      model: 'rule-based',
      promptTokens: 0,
    };

    this._cachedResult = result;
    this._cacheTime = Date.now();
    this._lastSource = 'fallback';
    return result;
  }

  // ==================== 内部工具方法 ====================

  /**
   * 检查缓存是否有效
   * @returns {boolean}
   * @private
   */
  _isCacheValid() {
    if (!this._cachedResult) return false;
    return (Date.now() - this._cacheTime) < this._cacheTtl;
  }

  /**
   * 从 URL 提取域名
   * @param {string} url
   * @returns {string}
   * @private
   */
  _extractDomain(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * 推断书签所属领域
   * @param {Object} bookmark
   * @returns {string}
   * @private
   */
  _inferCategory(bookmark) {
    // 优先从 folderPath 推断
    if (bookmark.folderPath && bookmark.folderPath.length > 0) {
      return bookmark.folderPath[0];
    }
    // 从 tags 推断
    if (bookmark.tags && bookmark.tags.length > 0) {
      return bookmark.tags[0];
    }
    return '其他';
  }

  /**
   * 判断书签难度等级
   * 复用 BookmarkLearningPath 的规则
   * @param {Object} bookmark
   * @returns {'beginner'|'intermediate'|'advanced'}
   * @private
   */
  _judgeDifficulty(bookmark) {
    const text = [
      bookmark.title || '',
      (bookmark.tags || []).join(' '),
      (bookmark.folderPath || []).join(' '),
    ].join(' ').toLowerCase();

    for (const rule of DIFFICULTY_RULES) {
      for (const kw of rule.keywords) {
        if (text.includes(kw.toLowerCase())) {
          return rule.level;
        }
      }
    }
    return 'intermediate';
  }
}
