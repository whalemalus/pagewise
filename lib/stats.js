/**
 * Stats — 使用统计数据模块
 * 通过 chrome.storage.local 存储各类使用统计
 */

const STATS_KEY = 'pagewise_stats';

const DEFAULT_STATS = {
  totalQuestions: 0,
  totalKnowledgeEntries: 0,
  totalHighlights: 0,
  totalReviewSessions: 0,
  totalTokensUsed: 0,
  skillUsage: {},        // { skillId: count }
  dailyUsage: {},        // { '2026-04-26': { questions: 5, tokens: 1234 } }
  lastUpdated: 0
};

/**
 * 获取完整统计数据
 * @returns {Promise<object>}
 */
export async function getStats() {
  try {
    const result = await chrome.storage.local.get(STATS_KEY);
    const stored = result[STATS_KEY] || {};
    return { ...DEFAULT_STATS, ...stored, skillUsage: { ...DEFAULT_STATS.skillUsage, ...stored.skillUsage }, dailyUsage: { ...DEFAULT_STATS.dailyUsage, ...stored.dailyUsage } };
  } catch (e) {
    return { ...DEFAULT_STATS };
  }
}

/**
 * 保存统计数据
 * @param {object} stats
 */
async function saveStats(stats) {
  stats.lastUpdated = Date.now();
  try {
    await chrome.storage.local.set({ [STATS_KEY]: stats });
  } catch (e) {
    // 静默处理
  }
}

/**
 * 增加计数器
 * @param {string} key — 计数器键名
 * @param {number} [value=1] — 增加量
 * @returns {Promise<number>} 新值
 */
export async function incrementCounter(key, value = 1) {
  const stats = await getStats();
  if (typeof stats[key] !== 'number') {
    stats[key] = 0;
  }
  stats[key] += value;
  await saveStats(stats);
  return stats[key];
}

/**
 * 记录每日使用
 * @param {string} date — 日期字符串 'YYYY-MM-DD'
 * @param {object} data — { questions?: number, tokens?: number, highlights?: number }
 */
export async function recordDailyUsage(date, data) {
  const stats = await getStats();
  if (!stats.dailyUsage[date]) {
    stats.dailyUsage[date] = { questions: 0, tokens: 0, highlights: 0 };
  }
  const day = stats.dailyUsage[date];
  if (data.questions) day.questions += data.questions;
  if (data.tokens) day.tokens += data.tokens;
  if (data.highlights) day.highlights += data.highlights;
  await saveStats(stats);
}

/**
 * 记录技能使用
 * @param {string} skillId
 */
export async function recordSkillUsage(skillId) {
  const stats = await getStats();
  if (!stats.skillUsage[skillId]) {
    stats.skillUsage[skillId] = 0;
  }
  stats.skillUsage[skillId]++;
  await saveStats(stats);
}

/**
 * 获取最常用技能
 * @param {number} [limit=5] — 返回数量
 * @returns {Promise<Array<{skillId: string, count: number}>>}
 */
export async function getTopSkills(limit = 5) {
  const stats = await getStats();
  return Object.entries(stats.skillUsage)
    .map(([skillId, count]) => ({ skillId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * 获取最近 N 天的使用趋势
 * @param {number} [days=7]
 * @returns {Promise<Array<{date: string, questions: number, tokens: number}>>}
 */
export async function getUsageTrend(days = 7) {
  const stats = await getStats();
  const trend = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayData = stats.dailyUsage[dateStr] || { questions: 0, tokens: 0, highlights: 0 };
    trend.push({ date: dateStr, ...dayData });
  }
  return trend;
}

/**
 * 重置所有统计数据
 */
export async function resetStats() {
  await saveStats({ ...DEFAULT_STATS });
}

// 测试辅助：允许注入自定义 storage
let _testStorage = null;

/**
 * 设置测试用的 storage mock
 * @param {object|null} storage
 */
export function _setTestStorage(storage) {
  _testStorage = storage;
}

/**
 * 替换 chrome 引用（用于测试）
 */
export function _getChromeRef() {
  return typeof chrome !== 'undefined' ? chrome : null;
}

// 重写内部方法以支持测试环境
export function _createStatsModule(storageImpl) {
  const impl = storageImpl || {
    async get(key) {
      if (_testStorage) return _testStorage[key] ? { [key]: _testStorage[key] } : {};
      return chrome.storage.local.get(key);
    },
    async set(obj) {
      if (_testStorage) {
        Object.assign(_testStorage, obj);
        return;
      }
      return chrome.storage.local.set(obj);
    }
  };

  async function getStatsInner() {
    try {
      const result = await impl.get(STATS_KEY);
      const stored = result[STATS_KEY] || {};
      return {
        ...DEFAULT_STATS,
        ...stored,
        skillUsage: { ...DEFAULT_STATS.skillUsage, ...stored.skillUsage },
        dailyUsage: { ...DEFAULT_STATS.dailyUsage, ...stored.dailyUsage }
      };
    } catch (e) {
      return { ...DEFAULT_STATS };
    }
  }

  async function saveStatsInner(stats) {
    stats.lastUpdated = Date.now();
    try {
      await impl.set({ [STATS_KEY]: stats });
    } catch (e) {}
  }

  async function incrementCounterInner(key, value = 1) {
    const stats = await getStatsInner();
    if (typeof stats[key] !== 'number') stats[key] = 0;
    stats[key] += value;
    await saveStatsInner(stats);
    return stats[key];
  }

  async function recordDailyUsageInner(date, data) {
    const stats = await getStatsInner();
    if (!stats.dailyUsage[date]) stats.dailyUsage[date] = { questions: 0, tokens: 0, highlights: 0 };
    const day = stats.dailyUsage[date];
    if (data.questions) day.questions += data.questions;
    if (data.tokens) day.tokens += data.tokens;
    if (data.highlights) day.highlights += data.highlights;
    await saveStatsInner(stats);
  }

  async function recordSkillUsageInner(skillId) {
    const stats = await getStatsInner();
    if (!stats.skillUsage[skillId]) stats.skillUsage[skillId] = 0;
    stats.skillUsage[skillId]++;
    await saveStatsInner(stats);
  }

  async function getTopSkillsInner(limit = 5) {
    const stats = await getStatsInner();
    return Object.entries(stats.skillUsage)
      .map(([skillId, count]) => ({ skillId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async function getUsageTrendInner(days = 7) {
    const stats = await getStatsInner();
    const trend = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = stats.dailyUsage[dateStr] || { questions: 0, tokens: 0, highlights: 0 };
      trend.push({ date: dateStr, ...dayData });
    }
    return trend;
  }

  async function resetStatsInner() {
    await saveStatsInner({ ...DEFAULT_STATS });
  }

  return {
    getStats: getStatsInner,
    incrementCounter: incrementCounterInner,
    recordDailyUsage: recordDailyUsageInner,
    recordSkillUsage: recordSkillUsageInner,
    getTopSkills: getTopSkillsInner,
    getUsageTrend: getUsageTrendInner,
    resetStats: resetStatsInner
  };
}
