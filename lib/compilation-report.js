/**
 * Compilation Report — L2.4 知识编译报告
 *
 * 每次 ingest 后生成编译报告，汇总本次编译过程中的所有变化：
 *   - 新增/更新的页面数
 *   - 新发现的实体/概念
 *   - 新建立的交叉引用
 *   - 检测到的矛盾
 *
 * 设计原则：
 *   - 纯 ES Module，不依赖 IndexedDB 或 Chrome API
 *   - 与 AutoClassifier / ContradictionDetector / KnowledgeBase 完全解耦
 *   - 纯函数：输入数据 → 输出报告，无副作用
 *   - 支持 Markdown 和 HTML 两种输出格式
 *
 * @module compilation-report
 */

// ==================== 常量 ====================

/** 报告级别枚举 */
export const REPORT_LEVEL = {
  SUMMARY: 'summary',     // 一行摘要
  BRIEF: 'brief',         // 简要报告
  DETAILED: 'detailed',   // 详细报告
};

/** 矛盾严重性图标映射 */
const SEVERITY_ICONS = {
  high: '🔴',
  medium: '🟡',
  low: '🔵',
};

/** 矛盾严重性标签 */
const SEVERITY_LABELS = {
  high: '严重',
  medium: '中等',
  low: '轻微',
};

/** 实体类型中文映射 */
const ENTITY_TYPE_LABELS = {
  person: '人物',
  tool: '工具',
  framework: '框架',
  api: 'API',
  language: '编程语言',
  platform: '平台',
  library: '库',
  service: '服务',
  other: '其他',
};

// ==================== 数据结构 ====================

/**
 * 编译统计类
 *
 * 表示一次 ingest 过程中所有变化的汇总数据。
 * 所有字段均可选，缺失时取默认值。
 */
export class IngestStats {
  /**
   * @param {Object} [data] - 初始数据
   * @param {number} [data.newPageCount=0] - 新增页面数
   * @param {number} [data.updatedPageCount=0] - 更新页面数
   * @param {Array} [data.newEntities=[]] - 新发现的实体列表
   * @param {Array} [data.newConcepts=[]] - 新发现的概念列表
   * @param {Array} [data.newCrossRefs=[]] - 新建立的交叉引用
   * @param {Array} [data.contradictions=[]] - 检测到的矛盾
   * @param {string} [data.generatedAt] - 报告生成时间
   */
  constructor(data = {}) {
    this.newPageCount = data.newPageCount || 0;
    this.updatedPageCount = data.updatedPageCount || 0;
    this.newEntities = data.newEntities ? [...data.newEntities] : [];
    this.newConcepts = data.newConcepts ? [...data.newConcepts] : [];
    this.newCrossRefs = data.newCrossRefs ? [...data.newCrossRefs] : [];
    this.contradictions = data.contradictions ? [...data.contradictions] : [];
    this.generatedAt = data.generatedAt || new Date().toISOString();
  }
}

// ==================== 构建统计 ====================

/**
 * 从 ingest 数据构建编译统计
 *
 * 对比新旧条目、实体、概念列表，计算差异。
 *
 * @param {Object} params - 参数
 * @param {Array} params.newEntries - 本次 ingest 后的所有条目
 * @param {Array} [params.oldEntries=[]] - ingest 前的已有条目
 * @param {Array} [params.newEntities=[]] - 本次发现的所有实体
 * @param {Array} [params.oldEntities=[]] - 已有的实体
 * @param {Array} [params.newConcepts=[]] - 本次发现的所有概念
 * @param {Array} [params.oldConcepts=[]] - 已有的概念
 * @param {Array} [params.crossRefs=[]] - 新建的交叉引用
 * @param {Array} [params.contradictions=[]] - 检测到的矛盾
 * @returns {IngestStats} 编译统计
 */
export function buildIngestStats(params) {
  const newEntries = params.newEntries || [];
  const oldEntries = params.oldEntries || [];
  const newEntities = params.newEntities || [];
  const oldEntities = params.oldEntities || [];
  const newConcepts = params.newConcepts || [];
  const oldConcepts = params.oldConcepts || [];
  const crossRefs = params.crossRefs || [];
  const contradictions = params.contradictions || [];

  // 计算新增/更新页面
  const diff = computeIngestDiff(newEntries, oldEntries);

  // 计算新增实体（按名称去重）
  const oldEntityNames = new Set(
    oldEntities.map(e => (e.name || '').toLowerCase().trim())
  );
  const addedEntities = newEntities.filter(
    e => !oldEntityNames.has((e.name || '').toLowerCase().trim())
  );

  // 计算新增概念（按名称去重）
  const oldConceptNames = new Set(
    oldConcepts.map(c => (c.name || '').toLowerCase().trim())
  );
  const addedConcepts = newConcepts.filter(
    c => !oldConceptNames.has((c.name || '').toLowerCase().trim())
  );

  return new IngestStats({
    newPageCount: diff.added.length,
    updatedPageCount: diff.updated.length,
    newEntities: addedEntities,
    newConcepts: addedConcepts,
    newCrossRefs: crossRefs,
    contradictions: contradictions,
  });
}

// ==================== 差异计算 ====================

/**
 * 计算两个条目列表之间的差异
 *
 * 按 id 匹配判断新增/更新/删除。
 * 无 id 时视为新增。
 *
 * @param {Array} newEntries - 新条目列表
 * @param {Array} oldEntries - 旧条目列表
 * @returns {{ added: Array, updated: Array, removed: Array }}
 */
export function computeIngestDiff(newEntries, oldEntries) {
  const newE = newEntries || [];
  const oldE = oldEntries || [];

  // 建立旧条目的 id → entry 映射
  const oldById = new Map();
  for (const entry of oldE) {
    if (entry.id != null) {
      oldById.set(entry.id, entry);
    }
  }

  // 建立新条目的 id 集合（用于判断删除）
  const newIds = new Set();
  for (const entry of newE) {
    if (entry.id != null) {
      newIds.add(entry.id);
    }
  }

  const added = [];
  const updated = [];

  for (const entry of newE) {
    if (entry.id != null && oldById.has(entry.id)) {
      updated.push(entry);
    } else {
      added.push(entry);
    }
  }

  // 旧条目中不在新列表里的视为删除
  const removed = [];
  for (const entry of oldE) {
    if (entry.id == null) {
      // 无 id 的旧条目无法匹配，视为已删除
      removed.push(entry);
    } else if (!newIds.has(entry.id)) {
      removed.push(entry);
    }
  }

  return { added, updated, removed };
}

// ==================== Markdown 报告 ====================

/**
 * 生成 Markdown 格式的编译报告
 *
 * @param {IngestStats} stats - 编译统计
 * @returns {string} Markdown 内容
 */
export function generateReportMarkdown(stats) {
  const lines = [];
  const ts = stats.generatedAt || new Date().toISOString();
  const dateStr = ts.split('T')[0] || ts;

  // 标题
  lines.push(`# 📊 知识编译报告`);
  lines.push('');
  lines.push(`> 生成时间: ${dateStr}`);
  lines.push('');

  // 概览
  lines.push('## 📄 页面变化');
  lines.push('');
  lines.push(`| 指标 | 数量 |`);
  lines.push(`|------|------|`);
  lines.push(`| ➕ 新增页面 | **${stats.newPageCount}** |`);
  lines.push(`| 🔄 更新页面 | **${stats.updatedPageCount}** |`);
  lines.push('');

  // 新发现的实体
  if (stats.newEntities && stats.newEntities.length > 0) {
    lines.push('## 🏷️ 新发现的实体');
    lines.push('');
    for (const entity of stats.newEntities) {
      const typeLabel = ENTITY_TYPE_LABELS[entity.type] || entity.type || '其他';
      lines.push(`- **${entity.name}** (${typeLabel}) — ${entity.description || '无描述'}`);
    }
    lines.push('');
  }

  // 新发现的概念
  if (stats.newConcepts && stats.newConcepts.length > 0) {
    lines.push('## 💡 新发现的概念');
    lines.push('');
    for (const concept of stats.newConcepts) {
      lines.push(`- **${concept.name}** — ${concept.description || '无描述'}`);
    }
    lines.push('');
  }

  // 交叉引用
  if (stats.newCrossRefs && stats.newCrossRefs.length > 0) {
    lines.push('## 🔗 新建交叉引用');
    lines.push('');
    lines.push(`共建立 **${stats.newCrossRefs.length}** 条交叉引用。`);
    lines.push('');
    for (const ref of stats.newCrossRefs.slice(0, 10)) {
      const relLabel = ref.relation || '关联';
      lines.push(`- 条目 #${ref.fromId} ↔ 条目 #${ref.toId} (${relLabel})`);
    }
    if (stats.newCrossRefs.length > 10) {
      lines.push(`- ... 等共 ${stats.newCrossRefs.length} 条`);
    }
    lines.push('');
  }

  // 矛盾检测
  if (stats.contradictions && stats.contradictions.length > 0) {
    lines.push('## ⚠️ 检测到的矛盾');
    lines.push('');
    for (const c of stats.contradictions) {
      const icon = SEVERITY_ICONS[c.severity] || '🔵';
      const severityLabel = SEVERITY_LABELS[c.severity] || '未知';
      lines.push(`- ${icon} **[${severityLabel}]** ${c.description || '未描述'}`);
    }
    lines.push('');
  }

  // 页脚
  lines.push('---');
  lines.push(`*由 PageWise 知识编译引擎自动生成*`);

  return lines.join('\n');
}

// ==================== HTML 报告 ====================

/**
 * 生成 HTML 格式的编译报告
 *
 * 用于在侧边栏中展示，使用 pw- 前缀 CSS 类避免样式冲突。
 *
 * @param {IngestStats} stats - 编译统计
 * @returns {string} HTML 字符串
 */
export function generateReportHtml(stats) {
  const ts = stats.generatedAt || new Date().toISOString();
  const dateStr = ts.split('T')[0] || ts;

  let html = '<div class="pw-compilation-report">';

  // Header
  html += '<div class="pw-report-header">';
  html += '<span class="pw-report-icon">📊</span>';
  html += `<span class="pw-report-title">知识编译报告</span>`;
  html += `<span class="pw-report-date">${escapeHtml(dateStr)}</span>`;
  html += '</div>';

  // Stats cards
  html += '<div class="pw-report-stats">';
  html += buildStatCard('📄', '新增页面', stats.newPageCount, 'new');
  html += buildStatCard('🔄', '更新页面', stats.updatedPageCount, 'updated');
  html += buildStatCard('🏷️', '新实体', (stats.newEntities || []).length, 'entity');
  html += buildStatCard('💡', '新概念', (stats.newConcepts || []).length, 'concept');
  html += buildStatCard('🔗', '交叉引用', (stats.newCrossRefs || []).length, 'xref');
  html += '</div>';

  // New entities list
  if (stats.newEntities && stats.newEntities.length > 0) {
    html += '<div class="pw-report-section">';
    html += '<div class="pw-report-section-title">🏷️ 新发现的实体</div>';
    html += '<div class="pw-report-entity-list">';
    for (const entity of stats.newEntities) {
      const typeLabel = ENTITY_TYPE_LABELS[entity.type] || entity.type || '其他';
      html += '<div class="pw-report-entity-item">';
      html += `<span class="pw-report-entity-name">${escapeHtml(entity.name)}</span>`;
      html += `<span class="pw-report-entity-type">${escapeHtml(typeLabel)}</span>`;
      if (entity.description) {
        html += `<span class="pw-report-entity-desc">${escapeHtml(entity.description)}</span>`;
      }
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
  }

  // New concepts list
  if (stats.newConcepts && stats.newConcepts.length > 0) {
    html += '<div class="pw-report-section">';
    html += '<div class="pw-report-section-title">💡 新发现的概念</div>';
    html += '<div class="pw-report-concept-list">';
    for (const concept of stats.newConcepts) {
      html += '<div class="pw-report-concept-item">';
      html += `<span class="pw-report-concept-name">${escapeHtml(concept.name)}</span>`;
      if (concept.description) {
        html += `<span class="pw-report-concept-desc">${escapeHtml(concept.description)}</span>`;
      }
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
  }

  // Cross references
  if (stats.newCrossRefs && stats.newCrossRefs.length > 0) {
    html += '<div class="pw-report-section">';
    html += `<div class="pw-report-section-title">🔗 新建交叉引用 (${stats.newCrossRefs.length})</div>`;
    html += '<div class="pw-report-xref-list">';
    for (const ref of stats.newCrossRefs.slice(0, 10)) {
      const relLabel = ref.relation || '关联';
      html += '<div class="pw-report-xref-item">';
      html += `<span>条目 #${ref.fromId} ↔ #${ref.toId}</span>`;
      html += `<span class="pw-report-xref-relation">${escapeHtml(relLabel)}</span>`;
      html += '</div>';
    }
    if (stats.newCrossRefs.length > 10) {
      html += `<div class="pw-report-xref-more">... 等共 ${stats.newCrossRefs.length} 条</div>`;
    }
    html += '</div>';
    html += '</div>';
  }

  // Contradictions
  if (stats.contradictions && stats.contradictions.length > 0) {
    html += '<div class="pw-report-section pw-report-contradictions">';
    html += `<div class="pw-report-section-title">⚠️ 检测到 ${stats.contradictions.length} 条矛盾</div>`;
    html += '<div class="pw-report-contradiction-list">';
    for (const c of stats.contradictions) {
      const icon = SEVERITY_ICONS[c.severity] || '🔵';
      const severityLabel = SEVERITY_LABELS[c.severity] || '未知';
      html += '<div class="pw-report-contradiction-item">';
      html += `<span class="pw-report-contradiction-severity">${icon} ${severityLabel}</span>`;
      html += `<span class="pw-report-contradiction-desc">${escapeHtml(c.description || '未描述')}</span>`;
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * 构建统计卡片 HTML
 * @param {string} icon - 图标
 * @param {string} label - 标签
 * @param {number} value - 数值
 * @param {string} type - 类型标识
 * @returns {string}
 */
function buildStatCard(icon, label, value, type) {
  return `<div class="pw-report-stat-card pw-report-stat-${type}">` +
    `<span class="pw-report-stat-icon">${icon}</span>` +
    `<span class="pw-report-stat-value">${value}</span>` +
    `<span class="pw-report-stat-label">${escapeHtml(label)}</span>` +
    '</div>';
}

// ==================== 统计合并 ====================

/**
 * 合并多个编译统计（纯函数，不修改原对象）
 *
 * 累加页面数、合并实体/概念（去重）、合并交叉引用和矛盾。
 * 时间戳取最新的。
 *
 * @param  {...IngestStats} statsList - 要合并的统计对象
 * @returns {IngestStats} 合并后的统计
 */
export function mergeIngestStats(...statsList) {
  const result = new IngestStats();
  // 初始化时间戳为空，让循环中的比较逻辑正确选择最新的
  result.generatedAt = '';

  for (const stats of statsList) {
    result.newPageCount += stats.newPageCount || 0;
    result.updatedPageCount += stats.updatedPageCount || 0;
    result.newCrossRefs.push(...(stats.newCrossRefs || []));
    result.contradictions.push(...(stats.contradictions || []));

    // 取最新时间戳
    if (stats.generatedAt && stats.generatedAt > result.generatedAt) {
      result.generatedAt = stats.generatedAt;
    }
  }

  // 实体去重（后出现的优先）
  result.newEntities = deduplicateByName(
    statsList.flatMap(s => s.newEntities || [])
  );

  // 概念去重（后出现的优先）
  result.newConcepts = deduplicateByName(
    statsList.flatMap(s => s.newConcepts || [])
  );

  return result;
}

/**
 * 按名称去重，后出现的优先
 * @param {Array} items - 实体或概念数组
 * @returns {Array} 去重后的数组
 */
function deduplicateByName(items) {
  const map = new Map();
  for (const item of items) {
    const key = (item.name || '').toLowerCase().trim();
    if (key) {
      map.set(key, { ...item }); // 后者覆盖前者
    }
  }
  return [...map.values()];
}

// ==================== 摘要文本 ====================

/**
 * 生成一行文本摘要
 *
 * @param {IngestStats} stats - 编译统计
 * @returns {string} 单行摘要（≤ 200 字符）
 */
export function summarizeReport(stats) {
  const parts = [];
  parts.push(`新增 ${stats.newPageCount} 页`);
  if (stats.updatedPageCount > 0) {
    parts.push(`更新 ${stats.updatedPageCount} 页`);
  }
  if (stats.newEntities.length > 0) {
    parts.push(`${stats.newEntities.length} 新实体`);
  }
  if (stats.newConcepts.length > 0) {
    parts.push(`${stats.newConcepts.length} 新概念`);
  }
  if (stats.newCrossRefs.length > 0) {
    parts.push(`${stats.newCrossRefs.length} 引用`);
  }
  if (stats.contradictions.length > 0) {
    parts.push(`${stats.contradictions.length} 矛盾`);
  }

  return parts.join('，');
}

/**
 * 生成格式化的多行摘要（带图标）
 *
 * @param {IngestStats} stats - 编译统计
 * @returns {string} 格式化摘要
 */
export function formatReportSummary(stats) {
  const lines = [];
  lines.push('📊 编译报告');

  // 页面变化
  const pageParts = [];
  pageParts.push(`📄 新增 ${stats.newPageCount}`);
  if (stats.updatedPageCount > 0) {
    pageParts.push(`🔄 更新 ${stats.updatedPageCount}`);
  }
  lines.push(pageParts.join(' | '));

  // 实体和概念
  if (stats.newEntities.length > 0 || stats.newConcepts.length > 0) {
    const kcParts = [];
    if (stats.newEntities.length > 0) {
      kcParts.push(`🏷️ ${stats.newEntities.length} 新实体`);
    }
    if (stats.newConcepts.length > 0) {
      kcParts.push(`💡 ${stats.newConcepts.length} 新概念`);
    }
    lines.push(kcParts.join(' | '));
  }

  // 交叉引用
  if (stats.newCrossRefs.length > 0) {
    lines.push(`🔗 ${stats.newCrossRefs.length} 新交叉引用`);
  }

  // 矛盾
  if (stats.contradictions.length > 0) {
    lines.push(`⚠️ ${stats.contradictions.length} 条矛盾待处理`);
  }

  return lines.join('\n');
}

// ==================== 辅助函数 ====================

/**
 * 转义 HTML 特殊字符
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
