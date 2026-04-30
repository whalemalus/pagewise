/**
 * ReviewSession — 复习会话管理模块
 *
 * 管理每次复习会话的生命周期，记录会话统计，并持久化到 chrome.storage.local。
 * 支持标签过滤、键盘快捷键、会话历史查询。
 */

export const SESSIONS_KEY = 'pagewise_review_sessions';
export const MAX_SESSIONS = 100;

/**
 * 复习会话管理类
 *
 * 生命周期: new → start() → recordCard() × N → finish()
 */
export class ReviewSession {
  constructor() {
    /** @type {boolean} 是否正在复习 */
    this.isActive = false;
    /** @type {number} 会话开始时间 */
    this.startTime = 0;
    /** @type {number} 已复习卡片数 */
    this.totalCards = 0;
    /** @type {number} 正确卡片数 (quality >= 3) */
    this.correctCards = 0;
    /** @type {string|null} 标签过滤条件 */
    this.tagFilter = null;
    /** @type {Array<{entryId: string, quality: number, interval: number, nextReview: number}>} 卡片详情 */
    this.cardDetails = [];
  }

  /**
   * 开始一个新的复习会话
   * @param {string|null} [tagFilter=null] - 可选的标签过滤
   */
  start(tagFilter = null) {
    this.isActive = true;
    this.startTime = Date.now();
    this.totalCards = 0;
    this.correctCards = 0;
    this.tagFilter = tagFilter || null;
    this.cardDetails = [];
  }

  /**
   * 记录一张卡片的复习结果
   * @param {{ entryId: string, quality: number, interval: number, nextReview: number }} cardInfo
   */
  recordCard(cardInfo) {
    if (!this.isActive) {
      throw new Error('会话未激活，请先调用 start()');
    }

    this.totalCards++;
    if (cardInfo.quality >= 3) {
      this.correctCards++;
    }
    this.cardDetails.push({
      entryId: cardInfo.entryId,
      quality: cardInfo.quality,
      interval: cardInfo.interval,
      nextReview: cardInfo.nextReview
    });
  }

  /**
   * 获取当前会话统计（不结束会话）
   * @returns {{ totalCards: number, correctCards: number, accuracy: number, elapsed: number }}
   */
  getStats() {
    const elapsed = this.isActive ? Date.now() - this.startTime : 0;
    return {
      totalCards: this.totalCards,
      correctCards: this.correctCards,
      accuracy: this.totalCards > 0 ? Math.round((this.correctCards / this.totalCards) * 100) : 0,
      elapsed
    };
  }

  /**
   * 结束会话并返回 SessionRecord
   * @returns {SessionRecord} 会话记录
   */
  finish() {
    if (!this.isActive) {
      throw new Error('会话未激活，请先调用 start()');
    }

    const endTime = Date.now();
    const duration = endTime - this.startTime;

    /** @type {SessionRecord} */
    const record = {
      id: `s-${this.startTime}-${Math.random().toString(36).slice(2, 6)}`,
      startTime: this.startTime,
      endTime,
      duration,
      totalCards: this.totalCards,
      correctCards: this.correctCards,
      accuracy: this.totalCards > 0 ? Math.round((this.correctCards / this.totalCards) * 100) : 0,
      tagFilter: this.tagFilter,
      cardDetails: [...this.cardDetails]
    };

    this.isActive = false;

    return record;
  }
}

/**
 * @typedef {Object} SessionRecord
 * @property {string} id - 唯一标识
 * @property {number} startTime - 开始时间
 * @property {number} endTime - 结束时间
 * @property {number} duration - 用时（毫秒）
 * @property {number} totalCards - 复习卡片总数
 * @property {number} correctCards - 正确卡片数
 * @property {number} accuracy - 准确率 (0-100)
 * @property {string|null} tagFilter - 标签过滤
 * @property {Array<{entryId: string, quality: number, interval: number, nextReview: number}>} cardDetails
 */

/**
 * 保存会话记录到 chrome.storage.local
 * @param {SessionRecord} record
 */
export async function saveSession(record) {
  try {
    const result = await chrome.storage.local.get(SESSIONS_KEY);
    const sessions = result[SESSIONS_KEY] || [];

    // 新会话插入最前面
    sessions.unshift(record);

    // 超过上限时裁剪尾部
    if (sessions.length > MAX_SESSIONS) {
      sessions.length = MAX_SESSIONS;
    }

    await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
  } catch (_e) {
    // chrome.storage 不可用时静默处理
  }
}

/**
 * 获取最近的会话列表
 * @param {number} [limit=10] - 返回条数
 * @returns {Promise<SessionRecord[]>}
 */
export async function getRecentSessions(limit = 10) {
  try {
    const result = await chrome.storage.local.get(SESSIONS_KEY);
    const sessions = result[SESSIONS_KEY] || [];
    return sessions.slice(0, limit);
  } catch (_e) {
    return [];
  }
}

/**
 * 获取本周复习统计汇总
 * @returns {Promise<{totalSessions: number, totalCards: number, totalCorrect: number, avgAccuracy: number}>}
 */
export async function getWeeklyStats() {
  const empty = { totalSessions: 0, totalCards: 0, totalCorrect: 0, avgAccuracy: 0 };
  try {
    const result = await chrome.storage.local.get(SESSIONS_KEY);
    const sessions = result[SESSIONS_KEY] || [];

    // 本周起始（周一 00:00:00）
    const now = new Date();
    const dayOfWeek = now.getDay() || 7; // 周日=7
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1).getTime();

    const weekSessions = sessions.filter(s => s.startTime >= weekStart);

    if (weekSessions.length === 0) return empty;

    const totalCards = weekSessions.reduce((sum, s) => sum + s.totalCards, 0);
    const totalCorrect = weekSessions.reduce((sum, s) => sum + s.correctCards, 0);

    return {
      totalSessions: weekSessions.length,
      totalCards,
      totalCorrect,
      avgAccuracy: totalCards > 0 ? Math.round((totalCorrect / totalCards) * 100) : 0
    };
  } catch (_e) {
    return empty;
  }
}

/**
 * 获取完整会话历史
 * @returns {Promise<SessionRecord[]>}
 */
export async function getSessionHistory() {
  try {
    const result = await chrome.storage.local.get(SESSIONS_KEY);
    return result[SESSIONS_KEY] || [];
  } catch (_e) {
    return [];
  }
}
