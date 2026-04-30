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

/**
 * 计算学习连续天数（从今天往回数连续有活动的天数）
 * @returns {Promise<number>} 连续天数
 */
export async function getLearningStreak() {
  const stats = await getStats();
  return calculateStreak(stats.dailyUsage);
}

/**
 * 计算连续天数（纯函数，方便测试）
 * @param {object} dailyUsage — { 'YYYY-MM-DD': { questions, tokens, highlights } }
 * @returns {number}
 */
export function calculateStreak(dailyUsage) {
  if (!dailyUsage || typeof dailyUsage !== 'object') return 0;
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const day = dailyUsage[dateStr];
    if (day && (day.questions > 0 || day.tokens > 0 || day.highlights > 0)) {
      streak++;
    } else if (i > 0) {
      // 允许今天还没有数据（i===0 时跳过不算中断）
      break;
    }
  }
  return streak;
}

/**
 * 从知识条目中提取 Top N 标签
 * @param {Array} entries — 知识条目数组
 * @param {number} [limit=5]
 * @returns {Array<{tag: string, count: number}>}
 */
export function getTopTags(entries, limit = 5) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const tagCounts = {};
  for (const entry of entries) {
    if (Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        const t = String(tag).trim();
        if (t) {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * 统计知识条目中的高频词（用于词云）
 * 停用词过滤，只返回有意义的词汇
 * @param {Array} entries — 知识条目数组
 * @param {number} [limit=20]
 * @returns {Array<{word: string, count: number}>}
 */
export function getWordFrequencies(entries, limit = 20) {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const STOP_WORDS = new Set([
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
    '自己', '这', '他', '她', '它', '们', '那', '些', '么', '什么', '怎么', '如何',
    '可以', '能', '被', '把', '从', '对', '为', '与', '或', '但', '而', '以', '及',
    '等', '这个', '那个', '这些', '那些', '如果', '因为', '所以', '虽然', '但是',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
    'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'each',
    'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
    'than', 'too', 'very', 'just', 'about', 'also', 'that', 'this',
    'it', 'its', 'they', 'them', 'their', 'he', 'she', 'him', 'her',
    'his', 'my', 'your', 'we', 'our', 'which', 'what', 'when', 'where',
    'who', 'whom', 'how', 'if', 'then', 'else', 'up', 'out', 'only',
    'over', 'under', 'again', 'further', 'once', 'here', 'there',
    'you', 'your', 'yours', 'me', 'my', 'mine', 'us', 'our', 'ours',
    'function', 'return', 'var', 'let', 'const', 'class', 'import', 'export',
    'default', 'from', 'true', 'false', 'null', 'undefined', 'new', 'delete',
    'typeof', 'instanceof', 'try', 'catch', 'throw', 'finally', 'switch',
    'case', 'break', 'continue', 'while', 'for', 'do', 'if', 'else',
    'async', 'await', 'yield', 'promise', 'this', 'super', 'extends',
    'static', 'get', 'set', 'method', 'string', 'number', 'boolean',
    'object', 'array', 'map', 'set', 'symbol', 'bigint', 'any', 'void',
    '使用', '通过', '进行', '实现', '支持', '提供', '需要', '可以', '用于', '包含',
    '方式', '功能', '系统', '模块', '数据', '信息', '问题', '方法', '内容', '操作',
    '工具', '配置', '管理', '设置', '接口', '服务', '文件', '代码', '程序', '应用'
  ]);

  const wordCounts = {};
  for (const entry of entries) {
    const text = [
      entry.title || '',
      entry.summary || '',
      entry.question || '',
      entry.answer || ''
    ].join(' ');

    // 分词：按空白和标点拆分，过滤短词和停用词
    const words = text.toLowerCase()
      .split(/[\s,;.!?，。；！？、\-\(\)\[\]{}'"''""《》<>\/\\:：]+/)
      .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

    const seen = new Set();
    for (const word of words) {
      if (!seen.has(word)) {
        seen.add(word);
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }
  }

  return Object.entries(wordCounts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * 获取知识库每周增长趋势
 * @param {Array} entries — 知识条目数组
 * @param {number} [weeks=8] — 返回最近几周
 * @returns {Array<{weekLabel: string, count: number}>}
 */
export function getWeeklyGrowth(entries, weeks = 8) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return Array.from({ length: weeks }, (_, i) => ({ weekLabel: `W${weeks - i}`, count: 0 }));
  }

  const now = new Date();
  const weekBuckets = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekLabel = `${(weekStart.getMonth() + 1).toString().padStart(2, '0')}/${weekStart.getDate().toString().padStart(2, '0')}`;

    const count = entries.filter(e => {
      if (!e.createdAt) return false;
      const d = new Date(e.createdAt);
      return d >= weekStart && d < weekEnd;
    }).length;

    weekBuckets.push({ weekLabel, count });
  }

  return weekBuckets;
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

  async function getLearningStreakInner() {
    const stats = await getStatsInner();
    return calculateStreak(stats.dailyUsage);
  }

  return {
    getStats: getStatsInner,
    incrementCounter: incrementCounterInner,
    recordDailyUsage: recordDailyUsageInner,
    recordSkillUsage: recordSkillUsageInner,
    getTopSkills: getTopSkillsInner,
    getUsageTrend: getUsageTrendInner,
    resetStats: resetStatsInner,
    getLearningStreak: getLearningStreakInner,
    calculateStreak,
    getTopTags,
    getWordFrequencies,
    getWeeklyGrowth
  };
}
