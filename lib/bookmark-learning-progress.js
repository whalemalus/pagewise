/**
 * BookmarkLearningProgress — 学习进度追踪
 *
 * 记录学习会话（开始/结束时间）、计算书签级/领域级/全局学习进度、
 * 提供学习统计（streak、日均时长、最活跃领域）和趋势数据。
 * 数据持久化到 IndexedDB（learningProgress store）。
 *
 * 纯 ES Module，不依赖 DOM 或 Chrome API。
 * 复用 BookmarkLearningPath.judgeDifficulty() 静态方法推算难度。
 */

import { BookmarkLearningPath } from './bookmark-learning-path.js';

// ==================== 常量 ====================

const TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟
const DB_NAME = 'pagewise_learning_progress';
const DB_VERSION = 1;
const STORE_NAME = 'learningProgress';

/** 难度等级 → 预期学习时长 (秒) */
const EXPECTED_TIME = {
  beginner: 600,       // 10 分钟
  intermediate: 1200,  // 20 分钟
  advanced: 1800,      // 30 分钟
};

// ==================== BookmarkLearningProgress ====================

export class BookmarkLearningProgress {
  /** 难度→预期时长映射，可从外部访问 */
  static EXPECTED_TIME = { ...EXPECTED_TIME };

  /**
   * @param {Object} options
   * @param {number}  [options.timeoutMs]  会话超时毫秒 (默认 30min)
   * @param {string}  [options.dbName]     IndexedDB 数据库名
   * @param {number}  [options.dbVersion]  IndexedDB 版本号
   * @param {Array}   [options.bookmarks]  书签数组 (用于难度判定)
   */
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    this._dbName = options.dbName ?? DB_NAME;
    this._dbVersion = options.dbVersion ?? DB_VERSION;
    this._bookmarks = options.bookmarks || [];
    this._bookmarksMap = new Map();
    for (const b of this._bookmarks) {
      this._bookmarksMap.set(String(b.id), b);
    }

    /** @type {Map<string, {id:any, bookmarkId:string, startTime:number, endTime:null, duration:0, timedOut:false, timerId:any}>} */
    this._activeSessions = new Map();
    this._db = null;
  }

  // ─── 初始化 ──────────────────────────────────────────────────────────

  /**
   * 打开 IndexedDB 连接，创建 store 和 indexes
   */
  async init() {
    this._db = await this._openDB();
  }

  // ─── 会话管理 ────────────────────────────────────────────────────────

  /**
   * 开始学习会话。同一书签已有活跃会话则返回已有会话。
   * @param {string} bookmarkId
   * @returns {Promise<Object>} session 对象
   */
  async startSession(bookmarkId) {
    const bid = String(bookmarkId);

    // 已有活跃会话 → 返回现有
    if (this._activeSessions.has(bid)) {
      return this._activeSessions.get(bid);
    }

    const session = {
      id: null, // IDB auto-increment
      bookmarkId: bid,
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      timedOut: false,
    };

    // 写入 IndexedDB
    const id = await this._addRecord(session);
    session.id = id;

    // 设置超时定时器
    const timerId = setTimeout(async () => {
      try {
        await this._endSessionInternal(bid, true);
      } catch (_) { /* 超时结束时会话可能已被手动结束 */ }
    }, this.timeoutMs);
    session._timerId = timerId;

    this._activeSessions.set(bid, session);
    return { ...session, _timerId: undefined };
  }

  /**
   * 结束学习会话
   * @param {string} bookmarkId
   * @returns {Promise<Object>} 结束后的 session 对象
   */
  async endSession(bookmarkId) {
    const bid = String(bookmarkId);
    if (!this._activeSessions.has(bid)) {
      throw new Error(`No active session for bookmark: ${bid}`);
    }
    return this._endSessionInternal(bid, false);
  }

  // ─── 进度查询 ────────────────────────────────────────────────────────

  /**
   * 获取单个书签的学习进度
   * @param {string} bookmarkId
   * @returns {Promise<Object>} bookmark progress summary
   */
  async getBookmarkProgress(bookmarkId) {
    const bid = String(bookmarkId);
    const records = await this._getRecordsByBookmark(bid);

    let totalTime = 0;
    let sessionCount = 0;
    let lastStudiedAt = 0;

    for (const r of records) {
      if (r.endTime !== null) {
        sessionCount++;
        if (r.duration > 0) {
          totalTime += r.duration;
        }
        if (r.endTime > lastStudiedAt) {
          lastStudiedAt = r.endTime;
        }
      }
    }

    const bookmark = this._bookmarksMap.get(bid);
    const difficulty = bookmark
      ? BookmarkLearningPath.judgeDifficulty(bookmark)
      : 'intermediate';
    const expectedTime = EXPECTED_TIME[difficulty] || EXPECTED_TIME.intermediate;
    const progress = Math.min(totalTime / expectedTime, 1.0);

    return {
      bookmarkId: bid,
      totalTime: Math.round(totalTime),
      sessionCount,
      lastStudiedAt,
      progress,
      difficulty,
      expectedTime,
    };
  }

  /**
   * 获取某个类别的学习进度
   * @param {string} category
   * @param {Map<string, Bookmark[]>} [clusterMap] 聚类结果
   * @returns {Promise<Object>}
   */
  async getCategoryProgress(category, clusterMap) {
    const bookmarks = clusterMap ? clusterMap.get(category) || [] : [];
    const totalBookmarks = bookmarks.length;
    let studiedBookmarks = 0;
    let totalTime = 0;
    let totalProgress = 0;

    for (const b of bookmarks) {
      const bp = await this.getBookmarkProgress(b.id);
      if (bp.totalTime > 0) {
        studiedBookmarks++;
        totalTime += bp.totalTime;
      }
      totalProgress += bp.progress;
    }

    return {
      category,
      totalBookmarks,
      studiedBookmarks,
      totalTime: Math.round(totalTime),
      avgProgress: totalBookmarks > 0 ? totalProgress / totalBookmarks : 0,
    };
  }

  /**
   * 获取全局学习进度
   * @returns {Promise<Object>}
   */
  async getOverallProgress() {
    const totalBookmarks = this._bookmarks.length;
    let studiedBookmarks = 0;
    let totalTime = 0;
    let totalProgress = 0;

    for (const b of this._bookmarks) {
      const bp = await this.getBookmarkProgress(b.id);
      if (bp.totalTime > 0) {
        studiedBookmarks++;
        totalTime += bp.totalTime;
      }
      totalProgress += bp.progress;
    }

    return {
      totalBookmarks,
      studiedBookmarks,
      totalTime: Math.round(totalTime),
      avgProgress: totalBookmarks > 0 ? totalProgress / totalBookmarks : 0,
    };
  }

  // ─── 统计 ────────────────────────────────────────────────────────────

  /**
   * 获取全局学习统计
   * @returns {Promise<Object>}
   */
  async getStats() {
    const allRecords = await this._getAllRecords();
    let totalTime = 0;
    let totalSessions = 0;
    const categoryTime = new Map();

    for (const r of allRecords) {
      if (r.endTime !== null) {
        if (r.duration > 0) {
          totalTime += r.duration;
        }
        totalSessions++;

        // 按类别统计
        const bookmark = this._bookmarksMap.get(r.bookmarkId);
        if (bookmark && bookmark.folderPath && bookmark.folderPath.length > 0) {
          const cat = bookmark.folderPath[0];
          categoryTime.set(cat, (categoryTime.get(cat) || 0) + r.duration);
        }
      }
    }

    // 计算 streak
    const streak = this._calculateStreak(allRecords);

    // 日均学习时长
    const studyDays = this._getUniqueDays(allRecords);
    const dailyAverage = studyDays.size > 0
      ? Math.round(totalTime / studyDays.size)
      : 0;

    // 最活跃领域
    let mostActiveCategory = '';
    let maxTime = 0;
    for (const [cat, t] of categoryTime) {
      if (t > maxTime) {
        maxTime = t;
        mostActiveCategory = cat;
      }
    }

    return {
      totalTime: Math.round(totalTime),
      totalSessions,
      dailyAverage,
      streak,
      mostActiveCategory,
    };
  }

  /**
   * 获取最近 N 天的每日学习统计
   * @param {number} days
   * @returns {Promise<Array<{date:string, totalTime:number, sessions:number}>>}
   */
  async getDailyStats(days) {
    const allRecords = await this._getAllRecords();
    const result = [];

    // 生成最近 N 天的日期 (UTC+8)
    for (let i = days - 1; i >= 0; i--) {
      const date = this._getDateUTC8Offset(-i);
      const dayRecords = allRecords.filter(r => {
        if (r.endTime === null) return false;
        return this._timestampToDateUTC8(r.endTime) === date;
      });

      let totalTime = 0;
      for (const r of dayRecords) {
        totalTime += r.duration;
      }

      result.push({
        date,
        totalTime: Math.round(totalTime),
        sessions: dayRecords.length,
      });
    }

    return result;
  }

  // ─── 导入导出 ────────────────────────────────────────────────────────

  /**
   * 导出所有学习记录为 JSON 对象
   * @returns {Promise<{sessions: Array}>}
   */
  async exportData() {
    const records = await this._getAllRecords();
    return {
      sessions: records.map(r => ({
        bookmarkId: r.bookmarkId,
        startTime: r.startTime,
        endTime: r.endTime,
        duration: r.duration,
        timedOut: r.timedOut,
      })),
    };
  }

  /**
   * 导入学习记录（合并去重）
   * @param {{sessions: Array}} json
   * @returns {Promise<{imported: number, skipped: number}>}
   */
  async importData(json) {
    if (!json || !Array.isArray(json.sessions)) {
      throw new Error('Invalid import data: sessions must be an array');
    }

    // 获取现有记录用于去重
    const existing = await this._getAllRecords();
    const existingSet = new Set(
      existing.map(r => `${r.bookmarkId}|${r.startTime}|${r.endTime}`)
    );

    let imported = 0;
    let skipped = 0;

    for (const session of json.sessions) {
      const key = `${session.bookmarkId}|${session.startTime}|${session.endTime}`;
      if (existingSet.has(key)) {
        skipped++;
      } else {
        await this._addRecord({
          bookmarkId: session.bookmarkId,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: session.duration,
          timedOut: session.timedOut || false,
        });
        existingSet.add(key);
        imported++;
      }
    }

    return { imported, skipped };
  }

  // ─── 内部方法 ────────────────────────────────────────────────────────

  /**
   * 内部结束会话实现
   * @private
   */
  async _endSessionInternal(bookmarkId, timedOut) {
    const session = this._activeSessions.get(bookmarkId);
    if (!session) throw new Error(`No active session for bookmark: ${bookmarkId}`);

    // 清除超时定时器
    if (session._timerId) {
      clearTimeout(session._timerId);
    }

    const now = Date.now();
    session.endTime = now;
    session.duration = Math.round((now - session.startTime) / 1000);
    session.timedOut = timedOut;

    // 更新 IndexedDB 记录
    await this._updateRecord(session);

    // 移除活跃会话
    this._activeSessions.delete(bookmarkId);

    return {
      id: session.id,
      bookmarkId: session.bookmarkId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration,
      timedOut: session.timedOut,
    };
  }

  /**
   * 打开 IndexedDB 连接
   * @private
   */
  _openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this._dbName, this._dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('bookmarkId', 'bookmarkId', { unique: false });
          store.createIndex('startTime', 'startTime', { unique: false });
        }
      };

      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 添加记录到 IndexedDB
   * @private
   */
  _addRecord(record) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(record);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 更新记录
   * @private
   */
  _updateRecord(record) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 按 bookmarkId 查询所有记录
   * @private
   */
  _getRecordsByBookmark(bookmarkId) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('bookmarkId');
      const req = index.getAll(bookmarkId);
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 获取所有记录
   * @private
   */
  _getAllRecords() {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 计算连续学习天数 (streak)
   * 从今天开始向前遍历，连续有学习记录的天数。
   * 按 UTC+8 自然日切割。
   * @private
   */
  _calculateStreak(records) {
    const days = this._getUniqueDays(records);
    if (days.size === 0) return 0;

    const sorted = [...days].sort().reverse();
    const today = this._getDateUTC8Offset(0);

    // 必须从今天或昨天开始才算 streak
    let streak = 0;
    let expectedDate = today;

    for (const date of sorted) {
      if (date === expectedDate) {
        streak++;
        expectedDate = this._getDateUTC8Offset(-streak);
      } else if (date < expectedDate) {
        // 缺少天数，streak 中断
        break;
      }
    }

    return streak;
  }

  /**
   * 获取记录中所有唯一的 UTC+8 日期
   * @private
   */
  _getUniqueDays(records) {
    const days = new Set();
    for (const r of records) {
      if (r.endTime !== null) {
        days.add(this._timestampToDateUTC8(r.endTime));
      }
    }
    return days;
  }

  /**
   * 时间戳转 UTC+8 日期字符串 'YYYY-MM-DD'
   * @private
   */
  _timestampToDateUTC8(timestamp) {
    const utcMs = timestamp + 8 * 60 * 60 * 1000;
    const d = new Date(utcMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * 获取今天/偏移的 UTC+8 日期字符串
   * @param {number} offsetDays 偏移天数 (负数为过去)
   * @private
   */
  _getDateUTC8Offset(offsetDays) {
    const now = Date.now() + offsetDays * 86400000;
    return this._timestampToDateUTC8(now);
  }
}
