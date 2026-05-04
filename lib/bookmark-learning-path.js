/**
 * BookmarkLearningPath — 学习路径推荐
 *
 * 基于书签内容和聚类结果，自动生成从入门到生产实践的分阶段学习路径。
 * 支持难度判断、已读/未读跟踪、分领域进度统计。
 *
 * 复用 lib/learning-path.js 中的路径排序思路（按阶段递进 + 标签匹配）。
 * 纯前端实现，不依赖外部 API。
 */

// ==================== 难度关键词规则 ====================

/**
 * 每个难度等级的匹配关键词（不区分大小写）
 */
const DIFFICULTY_RULES = [
  {
    level: 'beginner',
    label: '入门',
    keywords: [
      'tutorial', 'getting started', 'introduction', 'beginner', 'basics',
      'quick start', 'first steps', 'hello world', 'starter',
      '入门', '教程', '快速上手', '基础', '初学', '新手',
    ],
  },
  {
    level: 'intermediate',
    label: '进阶',
    keywords: [
      'advanced', 'deep dive', 'best practices', 'patterns', 'practical',
      'hands-on', 'cookbook', 'in practice', 'tips', 'tricks',
      '进阶', '最佳实践', '实战', '实践', '技巧',
    ],
  },
  {
    level: 'advanced',
    label: '高级',
    keywords: [
      'architecture', 'internals', 'performance', 'optimization', 'source code',
      'under the hood', 'scaling', 'benchmark', 'profiling', 'production-ready',
      '源码', '架构', '性能优化', '深入理解', '底层', '原理',
    ],
  },
];

// ==================== 学习阶段定义 ====================

/**
 * 标准学习路径的 4 个阶段
 */
const LEARNING_STAGES = [
  { name: '基础入门', level: 'beginner', order: 0 },
  { name: '实战练习', level: 'intermediate', order: 1 },
  { name: '深入理解', level: 'advanced', order: 2 },
  { name: '生产实践', level: 'expert', order: 3 },
];

// ==================== BookmarkLearningPath ====================

export class BookmarkLearningPath {
  /**
   * @param {Object} options
   * @param {Array}  options.bookmarks — 书签数组 {id, title, url, dateAdded?, tags?, folderPath?}
   * @param {Map<string, Array>} options.clusters — 聚类结果 Map<category, Bookmark[]>
   */
  constructor({ bookmarks = [], clusters = new Map() } = {}) {
    /** @type {Array} 全部书签 */
    this._bookmarks = Array.isArray(bookmarks) ? [...bookmarks] : [];
    /** @type {Map<string, Array>} 聚类结果 */
    this._clusters = clusters instanceof Map ? clusters : new Map();
    /** @type {Set<string>} 已读书签 id 集合 */
    this._readSet = new Set();

    // 构建 id→bookmark 快速查找
    /** @type {Map<string, Object>} */
    this._idMap = new Map();
    for (const bm of this._bookmarks) {
      this._idMap.set(String(bm.id), bm);
    }

    // 缓存：各分类路径（惰性计算）
    /** @type {Map<string, Array> | null} */
    this._pathCache = null;
  }

  // ─── 公共 API ──────────────────────────────────────────────────────────

  /**
   * 生成指定分类的学习路径
   * @param {string} category — 聚类分类名
   * @returns {Array<{level: string, bookmarks: Array, order: number}>}
   */
  generatePath(category) {
    const bookmarks = this._clusters.get(category);
    if (!bookmarks || bookmarks.length === 0) {
      return LEARNING_STAGES.map(s => ({ ...s, bookmarks: [] }));
    }

    // 为每个书签打难度标签
    const tagged = bookmarks.map(bm => ({
      bookmark: bm,
      difficulty: BookmarkLearningPath.judgeDifficulty(bm),
    }));

    // 按 dateAdded 排序（早→晚，先收藏的优先学）
    tagged.sort((a, b) => {
      const da = a.bookmark.dateAdded || 0;
      const db = b.bookmark.dateAdded || 0;
      return da - db;
    });

    // 按难度分桶
    const byDifficulty = {
      beginner: [],
      intermediate: [],
      advanced: [],
    };
    for (const t of tagged) {
      byDifficulty[t.difficulty].push(t.bookmark);
    }

    // 将书签分配到各阶段，每本书只出现在一个阶段
    const usedIds = new Set();

    return LEARNING_STAGES.map((stage) => {
      let stageBookmarks;

      if (stage.level === 'expert') {
        // 生产实践：收集剩余未被前 3 个阶段分配的书签作为兜底
        stageBookmarks = tagged
          .filter(t => !usedIds.has(String(t.bookmark.id)))
          .map(t => this._annotate(t.bookmark));
      } else {
        const pool = byDifficulty[stage.level] || [];
        stageBookmarks = pool.map(bm => {
          usedIds.add(String(bm.id));
          return this._annotate(bm);
        });
      }

      return {
        level: stage.level,
        name: stage.name,
        bookmarks: stageBookmarks,
        order: stage.order,
      };
    });
  }

  /**
   * 获取所有分类的学习路径
   * @returns {Map<string, Array>} Map<category, pathStages[]>
   */
  getAllPaths() {
    if (this._pathCache) return this._pathCache;

    const result = new Map();
    for (const [category] of this._clusters) {
      result.set(category, this.generatePath(category));
    }
    this._pathCache = result;
    return result;
  }

  /**
   * 标记书签为已读
   * @param {string} bookmarkId
   */
  markAsRead(bookmarkId) {
    this._readSet.add(String(bookmarkId));
    this._pathCache = null; // 清除缓存
  }

  /**
   * 标记书签为未读
   * @param {string} bookmarkId
   */
  markAsUnread(bookmarkId) {
    this._readSet.delete(String(bookmarkId));
    this._pathCache = null;
  }

  /**
   * 获取某个分类的学习进度
   * @param {string} category
   * @returns {{total: number, read: number, percent: number}}
   */
  getProgress(category) {
    const bookmarks = this._clusters.get(category);
    if (!bookmarks || bookmarks.length === 0) {
      return { total: 0, read: 0, percent: 0 };
    }

    const total = bookmarks.length;
    let read = 0;
    for (const bm of bookmarks) {
      if (this._readSet.has(String(bm.id))) read++;
    }

    return {
      total,
      read,
      percent: total > 0 ? Math.round((read / total) * 100) : 0,
    };
  }

  /**
   * 获取整体学习进度
   * @returns {{total: number, read: number, percent: number, byCategory: Map<string, Object>}}
   */
  getOverallProgress() {
    const byCategory = new Map();
    let totalAll = 0;
    let readAll = 0;

    for (const [category] of this._clusters) {
      const progress = this.getProgress(category);
      byCategory.set(category, progress);
      totalAll += progress.total;
      readAll += progress.read;
    }

    return {
      total: totalAll,
      read: readAll,
      percent: totalAll > 0 ? Math.round((readAll / totalAll) * 100) : 0,
      byCategory,
    };
  }

  // ─── 静态方法 ──────────────────────────────────────────────────────────

  /**
   * 判断单个书签的难度等级
   * @param {Object} bookmark
   * @returns {'beginner' | 'intermediate' | 'advanced'}
   */
  static judgeDifficulty(bookmark) {
    const title = (bookmark.title || '').toLowerCase();
    const url = (bookmark.url || '').toLowerCase();
    const tags = (bookmark.tags || []).join(' ').toLowerCase();
    const folder = (bookmark.folderPath || []).join(' ').toLowerCase();
    const text = `${title} ${url} ${tags} ${folder}`;

    // 按优先级匹配：advanced > intermediate > beginner
    // 越高难度的关键词越具体，优先匹配
    for (let i = DIFFICULTY_RULES.length - 1; i >= 0; i--) {
      const rule = DIFFICULTY_RULES[i];
      for (const kw of rule.keywords) {
        if (text.includes(kw.toLowerCase())) {
          return rule.level;
        }
      }
    }

    // 默认为进阶（无明显标识时认为有一定基础）
    return 'intermediate';
  }

  // ─── 内部方法 ──────────────────────────────────────────────────────────

  /**
   * 为书签附加已读状态
   * @private
   */
  _annotate(bookmark) {
    return {
      ...bookmark,
      read: this._readSet.has(String(bookmark.id)),
    };
  }
}
