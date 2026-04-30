/**
 * Contradiction Detector — L2.3 矛盾检测
 *
 * 新回答与已有知识冲突时主动提示用户。
 * 对比新 Q&A 与已有同主题 Q&A，检测事实性矛盾（如版本号不同、API 变化），
 * 在侧边栏显示「⚠️ 知识冲突」提示，让用户确认。
 *
 * 设计原则：
 *   - 纯 ES Module，不依赖 IndexedDB 或 Chrome API
 *   - 与 AutoClassifier / KnowledgeBase 完全解耦
 *   - AI 调用失败时安全降级，不抛异常
 *   - 支持版本号快速启发式检测 + AI 深度语义检测
 *
 * @module contradiction-detector
 */

// ==================== 常量 ====================

/** 矛盾严重性枚举 */
export const CONTRADICTION_SEVERITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/** 严重性排序权重（数值越大越严重） */
const SEVERITY_WEIGHT = {
  high: 3,
  medium: 2,
  low: 1,
};

/** 矛盾类型枚举 */
export const CONTRADICTION_TYPE = {
  FACT_CHANGE: 'fact_change',         // 事实变更（如特性归属版本变化）
  VERSION_CONFLICT: 'version_conflict', // 版本号冲突
  OUTDATED: 'outdated',               // 信息过时
  DEFINITIONAL: 'definitional',       // 定义性矛盾（概念定义不同）
};

/** 合法 severity 值集合 */
const VALID_SEVERITIES = new Set([
  CONTRADICTION_SEVERITY.HIGH,
  CONTRADICTION_SEVERITY.MEDIUM,
  CONTRADICTION_SEVERITY.LOW,
]);

/** 合法 type 值集合 */
const VALID_TYPES = new Set(Object.values(CONTRADICTION_TYPE));

/** 版本号匹配正则（支持 vX.Y.Z, X.Y.Z, X.Y, X 等格式） */
const VERSION_REGEX = /\b(?:v?)(\d+(?:\.\d+){0,2}(?:\.\d+)?)\b/g;

/** 默认最大候选条目数 */
const MAX_CANDIDATES = 20;

/** 默认截断长度 */
const DEFAULT_TRUNCATE = 600;

// ==================== 提示词构建 ====================

/**
 * 构建矛盾检测的 AI 提示词
 *
 * @param {Object} newEntry - 新的 Q&A 条目
 * @param {Array<Object>} existingEntries - 已有的同主题 Q&A 条目
 * @returns {string} AI 提示词
 */
export function buildContradictionPrompt(newEntry, existingEntries) {
  const newParts = [];
  if (newEntry.title) newParts.push(`标题: ${newEntry.title}`);
  if (newEntry.question) newParts.push(`问题: ${newEntry.question}`);
  if (newEntry.answer) newParts.push(`回答: ${truncateText(newEntry.answer, DEFAULT_TRUNCATE)}`);
  if (newEntry.tags && newEntry.tags.length > 0) newParts.push(`标签: ${newEntry.tags.join(', ')}`);
  const newText = newParts.join('\n');

  let existingText = '（无已有知识条目）';
  if (existingEntries && existingEntries.length > 0) {
    existingText = existingEntries.map((entry, idx) => {
      const parts = [];
      parts.push(`[ID: ${entry.id || idx + 1}]`);
      if (entry.title) parts.push(`标题: ${entry.title}`);
      if (entry.question) parts.push(`问题: ${entry.question}`);
      if (entry.answer) parts.push(`回答: ${truncateText(entry.answer, DEFAULT_TRUNCATE)}`);
      if (entry.tags && entry.tags.length > 0) parts.push(`标签: ${entry.tags.join(', ')}`);
      return parts.join('\n');
    }).join('\n---\n');
  }

  return `你是一个知识一致性分析专家。请对比以下**新 Q&A 条目**与**已有知识条目**，检测是否存在矛盾或冲突。

## 矛盾类型

- **fact_change**: 事实变更 — 同一技术的特性描述在新旧条目中不一致（如"功能 A 在版本 X 中引入" vs "功能 A 在版本 Y 中引入"）
- **version_conflict**: 版本号冲突 — 关于同一技术的版本号信息不一致
- **outdated**: 信息过时 — 已有条目的信息可能已被新条目取代
- **definitional**: 定义性矛盾 — 同一概念/技术在新旧条目中的定义或描述不一致

## 严重性级别

- **high**: 直接矛盾，可能导致用户做出错误决策
- **medium**: 存在潜在冲突，需要用户关注确认
- **low**: 轻微差异，可能只是信息更新

## 输出要求

请严格以 JSON 格式输出，不要添加其他文字：

\`\`\`json
{
  "contradictions": [
    {
      "existingEntryId": 1,
      "description": "矛盾的详细描述（1-3 句话）",
      "severity": "high",
      "type": "fact_change",
      "conflictingFacts": {
        "new": "新条目中的关键事实陈述",
        "existing": "已有条目中的关键事实陈述"
      }
    }
  ]
}
\`\`\`

如果没有发现矛盾，请返回：
\`\`\`json
{"contradictions": []}
\`\`\`

## 新 Q&A 条目

${newText}

## 已有知识条目

${existingText}`;
}

/**
 * 截断文本到指定长度
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncateText(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  return text.slice(0, maxLen) + '…';
}

// ==================== AI 响应解析 ====================

/**
 * 解析 AI 返回的矛盾检测结果
 *
 * 支持直接 JSON、markdown 代码块包裹、以及多余文本包裹。
 * 解析失败时返回空结构。
 *
 * @param {string} response - AI 返回的文本
 * @returns {{ contradictions: Array }}
 */
export function parseContradictionResponse(response) {
  const empty = { contradictions: [] };

  if (!response || typeof response !== 'string') return empty;

  let jsonStr = response.trim();

  // 去除 markdown 代码块包裹
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // 尝试找到 JSON 对象
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.contradictions)) return empty;

    const contradictions = parsed.contradictions
      .map(normalizeContradiction)
      .filter(Boolean);

    return { contradictions };
  } catch {
    return empty;
  }
}

/**
 * 规范化单条矛盾记录
 * @param {Object} raw - 原始矛盾记录
 * @returns {Object|null}
 */
function normalizeContradiction(raw) {
  if (!raw || raw.existingEntryId == null) return null;

  return {
    existingEntryId: raw.existingEntryId,
    description: String(raw.description || '').trim(),
    severity: normalizeSeverity(raw.severity),
    type: normalizeType(raw.type),
    conflictingFacts: raw.conflictingFacts || null,
  };
}

/**
 * 规范化 severity 值
 * @param {string} value
 * @returns {string}
 */
function normalizeSeverity(value) {
  if (!value) return CONTRADICTION_SEVERITY.LOW;
  const normalized = String(value).toLowerCase().trim();
  return VALID_SEVERITIES.has(normalized) ? normalized : CONTRADICTION_SEVERITY.LOW;
}

/**
 * 规范化 type 值
 * @param {string} value
 * @returns {string}
 */
function normalizeType(value) {
  if (!value) return CONTRADICTION_TYPE.FACT_CHANGE;
  const normalized = String(value).toLowerCase().trim();
  return VALID_TYPES.has(normalized) ? normalized : CONTRADICTION_TYPE.FACT_CHANGE;
}

// ==================== 候选条目筛选 ====================

/**
 * 从已有条目中筛选可能与新条目矛盾的候选条目
 *
 * 策略：
 *   1. 标签重叠 — 共享标签的条目更可能讨论同一主题
 *   2. 实体重叠 — 引用相同实体的条目也可能相关
 *   3. 结果限制在 MAX_CANDIDATES 以内
 *
 * @param {Object} newEntry - 新条目
 * @param {Array<Object>} existingEntries - 已有条目列表
 * @param {number} [maxCandidates=20] - 最大候选数
 * @returns {Array<Object>} 候选条目
 */
export function findCandidateEntries(newEntry, existingEntries, maxCandidates = MAX_CANDIDATES) {
  if (!newEntry || !existingEntries || existingEntries.length === 0) return [];

  // 收集新条目的特征集
  const newTags = new Set((newEntry.tags || []).map(t => t.toLowerCase().trim()));
  const newEntities = new Set(
    (newEntry.entities || []).map(e => (e.name || '').toLowerCase().trim()).filter(Boolean)
  );

  // 如果既没有标签也没有实体，无法筛选
  if (newTags.size === 0 && newEntities.size === 0) return [];

  // 对每个已有条目计算匹配分数
  const scored = [];
  for (const entry of existingEntries) {
    if (entry.id === newEntry.id) continue; // 跳过自身

    let score = 0;

    // 标签匹配
    const entryTags = (entry.tags || []).map(t => t.toLowerCase().trim());
    for (const tag of entryTags) {
      if (newTags.has(tag)) score++;
    }

    // 实体匹配
    const entryEntities = (entry.entities || [])
      .map(e => (e.name || '').toLowerCase().trim())
      .filter(Boolean);
    for (const entity of entryEntities) {
      if (newEntities.has(entity)) score++;
    }

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  // 按匹配分数降序排列
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxCandidates).map(s => s.entry);
}

// ==================== 版本号提取 ====================

/**
 * 从文本中提取版本号及其上下文
 *
 * @param {string} text - 输入文本
 * @returns {Array<{ version: string, index: number }>} 版本号列表
 */
export function extractVersionNumbers(text) {
  if (!text || typeof text !== 'string') return [];

  const versions = [];
  const regex = new RegExp(VERSION_REGEX.source, VERSION_REGEX.flags);
  let match;

  while ((match = regex.exec(text)) !== null) {
    const version = match[1];
    // 至少包含一个点号或多于一个数字（排除纯数字如年份 2026）
    // 也包含主版本号（如 React 18、React 19）
    const numParts = version.split('.');
    if (numParts.length >= 2 || (numParts.length === 1 && parseInt(version) > 0 && parseInt(version) < 1000)) {
      // 排除明显的年份（2020-2030）
      const numVal = parseInt(version);
      if (numVal >= 2020 && numVal <= 2030 && numParts.length === 1) continue;

      versions.push({
        version,
        index: match.index,
        context: text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20),
      });
    }
  }

  return versions;
}

// ==================== 版本号矛盾快速检测 ====================

/**
 * 基于版本号的快速矛盾检测（启发式，不需要 AI）
 *
 * 如果新旧文本中提到同一技术的不同版本号但描述相同特性，
 * 则可能存在版本矛盾。
 *
 * @param {string} newAnswer - 新条目的回答
 * @param {string} existingAnswer - 已有条目的回答
 * @param {number} existingEntryId - 已有条目 ID
 * @returns {Array<Object>} 可能的版本矛盾列表
 */
export function detectVersionContradictions(newAnswer, existingAnswer, existingEntryId) {
  if (!newAnswer || !existingAnswer) return [];

  const newVersions = extractVersionNumbers(newAnswer);
  const existingVersions = extractVersionNumbers(existingAnswer);

  if (newVersions.length === 0 || existingVersions.length === 0) return [];

  const contradictions = [];

  // 检查是否存在同一技术上下文中提到不同版本号
  // 策略：查找两个文本中出现的相同技术名 + 不同版本号的组合
  const newVersionSet = new Set(newVersions.map(v => v.version));
  const existingVersionSet = new Set(existingVersions.map(v => v.version));

  // 找到出现在两边但版本号不同的情况
  const newOnly = [...newVersionSet].filter(v => !existingVersionSet.has(v));
  const existingOnly = [...existingVersionSet].filter(v => !newVersionSet.has(v));

  // 如果两边有各自独有的版本号，可能存在矛盾
  if (newOnly.length > 0 && existingOnly.length > 0) {
    // 提取共同的技术名称上下文
    const newContext = newVersions.map(v => v.context).join(' ');
    const existingContext = existingVersions.map(v => v.context).join(' ');

    // 检查是否有重叠的技术术语
    const newWords = new Set(newContext.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const existingWords = new Set(existingContext.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const overlap = [...newWords].filter(w => existingWords.has(w));

    if (overlap.length > 0) {
      contradictions.push({
        existingEntryId,
        description: `版本号差异: 新条目提到 ${newOnly.join(', ')}，已有条目提到 ${existingOnly.join(', ')}`,
        severity: CONTRADICTION_SEVERITY.LOW,
        type: CONTRADICTION_TYPE.VERSION_CONFLICT,
        conflictingFacts: {
          new: `版本: ${newOnly.join(', ')}`,
          existing: `版本: ${existingOnly.join(', ')}`,
        },
      });
    }
  }

  return contradictions;
}

// ==================== 矛盾过滤 ====================

/**
 * 过滤矛盾列表
 *
 * @param {Array<Object>} contradictions - 矛盾列表
 * @param {Object} options - 过滤选项
 * @param {string} [options.minSeverity] - 最低严重性
 * @param {Array<string>} [options.types] - 限定类型
 * @returns {Array<Object>} 过滤后的矛盾列表
 */
export function filterContradictions(contradictions, options = {}) {
  if (!contradictions || contradictions.length === 0) return [];

  let filtered = [...contradictions];

  // 按严重性过滤
  if (options.minSeverity) {
    const minWeight = SEVERITY_WEIGHT[options.minSeverity] || 0;
    filtered = filtered.filter(c => (SEVERITY_WEIGHT[c.severity] || 0) >= minWeight);
  }

  // 按类型过滤
  if (options.types && Array.isArray(options.types) && options.types.length > 0) {
    const typeSet = new Set(options.types);
    filtered = filtered.filter(c => typeSet.has(c.type));
  }

  return filtered;
}

// ==================== 矛盾检测主流程 ====================

/**
 * 检测新条目与已有条目之间的矛盾
 *
 * 流程：
 *   1. 筛选候选条目（标签/实体匹配）
 *   2. 版本号快速启发式检测
 *   3. AI 深度语义矛盾检测
 *   4. 合并去重结果
 *
 * @param {Object} newEntry - 新条目
 * @param {Array<Object>} existingEntries - 已有条目列表
 * @param {Object} aiClient - AI 客户端
 * @param {Object} [options] - 选项
 * @param {string} [options.model] - 指定 AI 模型
 * @param {boolean} [options.skipVersionCheck=false] - 跳过版本号快速检测
 * @returns {Promise<{ contradictions: Array, detectedAt: string }>}
 */
export async function detectContradictions(newEntry, existingEntries, aiClient, options = {}) {
  if (!existingEntries || existingEntries.length === 0) {
    return { contradictions: [], detectedAt: new Date().toISOString() };
  }

  const allContradictions = [];

  // Step 1: 版本号快速检测（不需要 AI）
  if (!options.skipVersionCheck) {
    for (const existing of existingEntries) {
      const versionContradictions = detectVersionContradictions(
        newEntry.answer,
        existing.answer,
        existing.id
      );
      allContradictions.push(...versionContradictions);
    }
  }

  // Step 2: AI 深度语义矛盾检测
  try {
    const prompt = buildContradictionPrompt(newEntry, existingEntries);
    const chatOptions = {};
    if (options.model) chatOptions.model = options.model;

    const response = await aiClient.chat(
      [{ role: 'user', content: prompt }],
      chatOptions,
    );

    const aiResult = parseContradictionResponse(response.content || response);

    // 合并 AI 检测结果（去重：以 existingEntryId + type 为 key）
    const seen = new Set(allContradictions.map(c => `${c.existingEntryId}:${c.type}`));
    for (const c of aiResult.contradictions) {
      const key = `${c.existingEntryId}:${c.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        allContradictions.push(c);
      }
    }
  } catch {
    // AI 调用失败时安全降级，保留已有的版本号矛盾
  }

  // 按严重性排序（高 → 中 → 低）
  allContradictions.sort((a, b) =>
    (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0)
  );

  return {
    contradictions: allContradictions,
    detectedAt: new Date().toISOString(),
  };
}

// ==================== UI HTML 生成 ====================

/**
 * 生成矛盾告警的 HTML
 *
 * 在侧边栏 AI 回答下方显示「⚠️ 知识冲突」提示框。
 *
 * @param {Array<Object>} contradictions - 矛盾列表
 * @param {Object} [options] - 选项
 * @param {string} [options.existingEntryTitle] - 已有条目标题（单条时显示）
 * @returns {string} HTML 字符串
 */
export function buildContradictionWarningHtml(contradictions, options = {}) {
  if (!contradictions || contradictions.length === 0) return '';

  const severityIcons = {
    high: '🔴',
    medium: '🟡',
    low: '🔵',
  };

  const severityLabels = {
    high: '严重冲突',
    medium: '潜在冲突',
    low: '轻微差异',
  };

  const typeLabels = {
    fact_change: '事实变更',
    version_conflict: '版本冲突',
    outdated: '信息过时',
    definitional: '定义差异',
  };

  let html = '<div class="pw-contradiction-warning">';
  html += '<div class="pw-contradiction-header">';
  html += `<span class="pw-contradiction-icon">⚠️</span>`;
  html += `<span class="pw-contradiction-title">检测到 ${contradictions.length} 条知识冲突</span>`;
  html += '</div>';

  html += '<div class="pw-contradiction-list">';

  for (const c of contradictions) {
    const icon = severityIcons[c.severity] || severityIcons.low;
    const severityLabel = severityLabels[c.severity] || '未知';
    const typeLabel = typeLabels[c.type] || c.type;

    html += '<div class="pw-contradiction-item">';
    html += `<div class="pw-contradiction-item-header">`;
    html += `<span class="pw-contradiction-severity">${icon} ${severityLabel}</span>`;
    html += `<span class="pw-contradiction-type">${typeLabel}</span>`;
    html += '</div>';

    html += `<div class="pw-contradiction-desc">${escapeHtml(c.description)}</div>`;

    if (c.conflictingFacts) {
      html += '<div class="pw-contradiction-facts">';
      if (c.conflictingFacts.new) {
        html += `<div class="pw-fact-new"><strong>🆕 新说法:</strong> ${escapeHtml(c.conflictingFacts.new)}</div>`;
      }
      if (c.conflictingFacts.existing) {
        html += `<div class="pw-fact-existing"><strong>📌 已有:</strong> ${escapeHtml(c.conflictingFacts.existing)}</div>`;
      }
      html += '</div>';
    }

    html += '<div class="pw-contradiction-actions">';
    html += `<button class="pw-contradiction-btn pw-contradiction-view" data-entry-id="${c.existingEntryId}">查看</button>`;
    html += `<button class="pw-contradiction-btn pw-contradiction-dismiss" data-entry-id="${c.existingEntryId}">忽略</button>`;
    html += '</div>';

    html += '</div>';
  }

  html += '</div>';
  html += '</div>';

  return html;
}

/**
 * 转义 HTML 特殊字符
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
