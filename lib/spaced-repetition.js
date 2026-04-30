/**
 * SpacedRepetition - 基于 Anki SM-2 算法的间隔复习调度模块
 * 
 * SM-2 算法核心：
 * - quality >= 3: 成功回忆，增加间隔
 * - quality < 3: 失败，重置间隔到 1 天
 * - easeFactor 根据每次评分动态调整（最小 1.3）
 */

const MILLISECONDS_PER_DAY = 86400000;
const MAX_DAILY_REVIEWS = 20;
const MIN_EASE_FACTOR = 1.3;
const STREAK_STORAGE_KEY = 'pagewise_review_streak';
const QUALITY_AGAIN = 1;
const QUALITY_HARD = 2;
const QUALITY_GOOD = 3;
const QUALITY_EASY = 5;

/**
 * Difficulty-to-quality mapping for the Again/Hard/Good/Easy UI
 */
export const DIFFICULTY_MAP = {
  again: { quality: QUALITY_AGAIN, label: '重来', emoji: '😰', nextIntervalHint: '1天' },
  hard:  { quality: QUALITY_HARD,  label: '困难', emoji: '🤔', nextIntervalHint: '1天' },
  good:  { quality: QUALITY_GOOD,  label: '良好', emoji: '😊', nextIntervalHint: '按计划' },
  easy:  { quality: QUALITY_EASY,  label: '简单', emoji: '😄', nextIntervalHint: '加倍' }
};

/**
 * 初始化默认复习数据
 * @returns {Object} 默认复习数据
 */
export function initializeReviewData() {
  const now = Date.now();
  return {
    interval: 1,
    repetitions: 0,
    easeFactor: 2.5,
    nextReview: now,
    lastReview: now
  };
}

/**
 * 根据用户评分计算下次复习时间（SM-2 算法）
 * 
 * @param {number} quality - 用户评分 (0-5)
 *   0: 完全不记得
 *   1: 错误，但看到答案后想起
 *   2: 错误，但答案很熟悉
 *   3: 正确，但很费力
 *   4: 正确，略有犹豫
 *   5: 完美回忆
 * @param {Object} currentData - 当前复习数据
 * @param {number} currentData.interval - 当前间隔（天）
 * @param {number} currentData.repetitions - 连续正确次数
 * @param {number} currentData.easeFactor - 难度因子
 * @returns {Object} 更新后的复习数据
 */
export function calculateNextReview(quality, currentData) {
  // 确保 quality 在有效范围内
  quality = Math.max(0, Math.min(5, Math.round(quality)));

  let { interval, repetitions, easeFactor } = currentData;

  // 确保 easeFactor 有默认值
  if (typeof easeFactor !== 'number' || isNaN(easeFactor)) {
    easeFactor = 2.5;
  }

  if (quality >= 3) {
    // 成功回忆
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    // 失败，重置
    repetitions = 0;
    interval = 1;
  }

  // 更新 easeFactor（SM-2 公式）
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < MIN_EASE_FACTOR) {
    easeFactor = MIN_EASE_FACTOR;
  }

  const now = Date.now();
  const nextReview = now + interval * MILLISECONDS_PER_DAY;

  return {
    interval,
    repetitions,
    easeFactor: Math.round(easeFactor * 100) / 100,
    nextReview,
    lastReview: now
  };
}

/**
 * 从知识条目中筛选到期需要复习的卡片
 * 
 * @param {Array} entries - 知识条目数组
 * @param {number} [limit=MAX_DAILY_REVIEWS] - 最多返回条数
 * @returns {Array} 到期的卡片，按 nextReview 排序（最早的在前）
 */
export function getDueCards(entries, limit = MAX_DAILY_REVIEWS) {
  const now = Date.now();
  const dueCards = [];

  for (const entry of entries) {
    // 跳过没有问题或答案的条目
    if (!entry.question && !entry.answer) continue;

    const review = entry.review || initializeReviewData();

    if (review.nextReview <= now) {
      dueCards.push({
        ...entry,
        review
      });
    }
  }

  // 按 nextReview 排序（最紧急的在前）
  dueCards.sort((a, b) => a.review.nextReview - b.review.nextReview);

  return dueCards.slice(0, limit);
}

/**
 * 格式化复习日期
 * 
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的日期描述
 */
export function formatReviewDate(timestamp) {
  const now = new Date();
  const target = new Date(timestamp);

  // 重置时间为当天零点进行比较
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();

  const diffDays = Math.round((targetStart - todayStart) / MILLISECONDS_PER_DAY);

  if (diffDays < 0) {
    return `${Math.abs(diffDays)} 天前`;
  } else if (diffDays === 0) {
    return '今天';
  } else if (diffDays === 1) {
    return '明天';
  } else if (diffDays <= 7) {
    return `${diffDays} 天后`;
  } else {
    const month = target.getMonth() + 1;
    const day = target.getDate();
    return `${month}月${day}日`;
  }
}

/**
 * 获取今日到期卡片数量（不做 limit 裁剪）
 * @param {Array} entries - 知识条目数组
 * @returns {number} 到期卡片数
 */
export function getDueCardCount(entries) {
  return getDueCards(entries, Infinity).length;
}

/**
 * 获取复习连续天数（streak）
 *
 * 使用 localStorage 持久化：
 *   { currentStreak, longestStreak, lastReviewDate (YYYY-MM-DD) }
 *
 * @returns {{ currentStreak: number, longestStreak: number, lastReviewDate: string }}
 */
export function getReviewStreak() {
  try {
    const raw = localStorage.getItem(STREAK_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (_e) {
    // localStorage 不可用时静默处理
  }
  return { currentStreak: 0, longestStreak: 0, lastReviewDate: null };
}

/**
 * 记录今天完成了一次复习，更新 streak
 * @returns {{ currentStreak: number, longestStreak: number, lastReviewDate: string }}
 */
export function recordReviewDay() {
  const streak = getReviewStreak();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  if (streak.lastReviewDate === today) {
    // 今天已记录过，不重复累加
    return streak;
  }

  const yesterday = new Date(Date.now() - MILLISECONDS_PER_DAY).toISOString().slice(0, 10);

  if (streak.lastReviewDate === yesterday) {
    // 连续
    streak.currentStreak += 1;
  } else {
    // 断了或首次
    streak.currentStreak = 1;
  }

  streak.lastReviewDate = today;
  if (streak.currentStreak > streak.longestStreak) {
    streak.longestStreak = streak.currentStreak;
  }

  try {
    localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(streak));
  } catch (_e) {
    // 静默处理
  }

  return streak;
}
