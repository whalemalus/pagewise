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
