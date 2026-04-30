/**
 * Entity Extractor — L1.2 实体/概念自动提取
 *
 * 从 Q&A 知识条目中使用 AI 自动识别和提取：
 *   - 实体: 人名、工具名、框架名、API、技术术语
 *   - 概念: 抽象概念、方法论、设计模式
 *
 * 生成独立的实体页和概念页 Markdown 文件（含 YAML frontmatter），
 * 用于 LLM Wiki 知识编译系统。
 *
 * @module entity-extractor
 */

// ==================== 常量 ====================

/** 支持的实体类型 */
export const ENTITY_TYPES = {
  PERSON: 'person',
  TOOL: 'tool',
  FRAMEWORK: 'framework',
  API: 'api',
  LANGUAGE: 'language',
  PLATFORM: 'platform',
  LIBRARY: 'library',
  SERVICE: 'service',
  OTHER: 'other',
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

// ==================== 提示词构建 ====================

/**
 * 构建实体/概念提取的 AI 提示词
 *
 * @param {Array<Object>} entries - Q&A 知识条目数组
 * @returns {string} 发送给 AI 的提示词
 */
export function buildExtractionPrompt(entries) {
  if (!entries || entries.length === 0) {
    return '请从以下 Q&A 条目中提取实体和概念，以 JSON 格式返回。无输入条目时返回空数组。';
  }

  const entryTexts = entries.map((entry, idx) => {
    const parts = [];
    parts.push(`[ID: ${entry.id || idx + 1}]`);
    if (entry.title) parts.push(`标题: ${entry.title}`);
    if (entry.question) parts.push(`问题: ${entry.question}`);
    if (entry.answer) parts.push(`回答: ${truncateText(entry.answer, 500)}`);
    if (entry.tags && entry.tags.length > 0) parts.push(`标签: ${entry.tags.join(', ')}`);
    return parts.join('\n');
  }).join('\n---\n');

  return `你是一个知识分析专家。请从以下 Q&A 条目中提取所有提到的**实体**和**概念**。

## 提取规则

### 实体 (entities)
识别以下类型的实体：
- **person**: 人名（如 Linus Torvalds、Kent Beck）
- **tool**: 工具名（如 Docker、Webpack、Git）
- **framework**: 框架名（如 React、Spring、Django）
- **api**: API/协议名（如 REST API、GraphQL、WebSocket）
- **language**: 编程语言（如 JavaScript、Python、Rust）
- **platform**: 平台名（如 GitHub、AWS、Kubernetes）
- **library**: 库名（如 Lodash、Axios、NumPy）
- **service**: 服务名（如 GitHub Actions、Vercel、Netlify）
- **other**: 其他技术实体

### 概念 (concepts)
识别以下类型的概念：
- 技术概念（如容器化、微服务、依赖注入）
- 设计模式（如 MVC、观察者模式）
- 方法论（如 CI/CD、TDD、DevOps）
- 抽象术语（如并发、幂等性、缓存策略）

## 输出要求

请严格以 JSON 格式输出，不要添加其他文字：

\`\`\`json
{
  "entities": [
    {
      "name": "实体名称",
      "type": "tool",
      "description": "简要描述（1-2 句）",
      "relatedEntryIds": [条目ID列表]
    }
  ],
  "concepts": [
    {
      "name": "概念名称",
      "description": "简要描述（1-2 句）",
      "relatedEntryIds": [条目ID列表]
    }
  ]
}
\`\`\`

## Q&A 条目

${entryTexts}`;
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
 * 解析 AI 返回的实体/概念提取结果
 *
 * 支持直接 JSON 或 markdown 代码块包裹的 JSON。
 * 解析失败时返回空结构（不抛出异常）。
 *
 * @param {string} response - AI 返回的文本
 * @returns {{ entities: Array, concepts: Array }}
 */
export function parseExtractionResponse(response) {
  const empty = { entities: [], concepts: [] };

  if (!response || typeof response !== 'string') return empty;

  // 尝试提取 JSON（可能包裹在 markdown 代码块中）
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

    const entities = Array.isArray(parsed.entities)
      ? parsed.entities.map(normalizeEntity).filter(Boolean)
      : [];

    const concepts = Array.isArray(parsed.concepts)
      ? parsed.concepts.map(normalizeConcept).filter(Boolean)
      : [];

    return { entities, concepts };
  } catch {
    // 解析失败，返回空结构
    return empty;
  }
}

/**
 * 规范化实体对象
 * @param {Object} raw
 * @returns {Object|null}
 */
function normalizeEntity(raw) {
  if (!raw || !raw.name) return null;
  return {
    name: String(raw.name).trim(),
    type: ENTITY_TYPES[raw.type?.toUpperCase()] || raw.type || ENTITY_TYPES.OTHER,
    description: String(raw.description || '').trim(),
    relatedEntryIds: Array.isArray(raw.relatedEntryIds)
      ? raw.relatedEntryIds.filter(id => typeof id === 'number')
      : [],
  };
}

/**
 * 规范化概念对象
 * @param {Object} raw
 * @returns {Object|null}
 */
function normalizeConcept(raw) {
  if (!raw || !raw.name) return null;
  return {
    name: String(raw.name).trim(),
    description: String(raw.description || '').trim(),
    relatedEntryIds: Array.isArray(raw.relatedEntryIds)
      ? raw.relatedEntryIds.filter(id => typeof id === 'number')
      : [],
  };
}

// ==================== 主提取流程 ====================

/**
 * 使用 AI 从 Q&A 条目中提取实体和概念
 *
 * @param {Array<Object>} entries - Q&A 知识条目
 * @param {Object} aiClient - AI 客户端（需实现 chat() 方法）
 * @param {Object} [options] - 可选配置
 * @param {number} [options.batchSize=10] - 每批处理条目数
 * @param {string} [options.model] - 指定 AI 模型
 * @returns {Promise<{ entities: Array, concepts: Array }>}
 */
export async function extractEntities(entries, aiClient, options = {}) {
  if (!entries || entries.length === 0) {
    return { entities: [], concepts: [] };
  }

  const batchSize = options.batchSize || 10;

  // 小批量直接处理
  if (entries.length <= batchSize) {
    return await extractBatch(entries, aiClient, options);
  }

  // 大批量分批处理，合并结果
  const allEntities = [];
  const allConcepts = [];

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const result = await extractBatch(batch, aiClient, options);
    allEntities.push(...result.entities);
    allConcepts.push(...result.concepts);
  }

  // 去重合并（同名实体/概念合并 relatedEntryIds）
  return {
    entities: deduplicateByName(allEntities),
    concepts: deduplicateByName(allConcepts),
  };
}

/**
 * 提取单批条目的实体和概念
 * @param {Array} entries
 * @param {Object} aiClient
 * @param {Object} options
 * @returns {Promise<{ entities: Array, concepts: Array }>}
 */
async function extractBatch(entries, aiClient, options) {
  const prompt = buildExtractionPrompt(entries);

  const chatOptions = {};
  if (options.model) chatOptions.model = options.model;

  const response = await aiClient.chat(
    [{ role: 'user', content: prompt }],
    chatOptions,
  );

  return parseExtractionResponse(response.content || response);
}

/**
 * 按名称去重，合并 relatedEntryIds
 * @param {Array} items - 实体或概念数组
 * @returns {Array} 去重后的数组
 */
function deduplicateByName(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (map.has(key)) {
      const existing = map.get(key);
      // 合并 relatedEntryIds
      const mergedIds = new Set([
        ...existing.relatedEntryIds,
        ...item.relatedEntryIds,
      ]);
      existing.relatedEntryIds = [...mergedIds];
    } else {
      map.set(key, { ...item });
    }
  }
  return [...map.values()];
}

// ==================== 文件名清理 ====================

/**
 * 清理文件名中的不安全字符
 *
 * 规则：
 * - 替换 / \ : * ? " < > | 为 -
 * - 合并连续的 - 为单个
 * - 去除首尾 -
 * - 超过 100 字符时截断
 * - 空字符串返回 'unnamed'
 *
 * @param {string} name - 原始名称
 * @returns {string} 清理后的文件名
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'unnamed';

  let cleaned = name
    // 替换文件系统不安全字符
    .replace(/[\\/:*?"<>|]/g, '-')
    // 合并连续短横线
    .replace(/-{2,}/g, '-')
    // 去除首尾短横线和空格
    .replace(/^[\s-]+|[\s-]+$/g, '');

  // 截断到 100 字符
  if (cleaned.length > 100) {
    cleaned = cleaned.slice(0, 100).replace(/-+$/, '');
  }

  return cleaned || 'unnamed';
}

// ==================== Markdown 生成 ====================

/**
 * 生成实体页的 Markdown 内容
 *
 * @param {Object} entity - 实体对象
 * @param {string} entity.name - 实体名称
 * @param {string} entity.type - 实体类型
 * @param {string} entity.description - 概述描述
 * @param {Array} [entity.relatedEntries] - 关联的 Q&A 条目（含 id, title）
 * @param {Array<string>} [entity.relatedEntities] - 关联的其他实体名称
 * @returns {string} Markdown 内容
 */
export function generateEntityMarkdown(entity) {
  const filename = sanitizeFilename(entity.name);
  const typeLabel = ENTITY_TYPE_LABELS[entity.type] || entity.type || '其他';

  const lines = [];

  // YAML frontmatter
  lines.push('---');
  lines.push(`title: "${escapeYamlString(entity.name)}"`);
  lines.push(`type: entity`);
  lines.push(`entity_type: "${escapeYamlString(entity.type || 'other')}"`);
  lines.push(`created: "${new Date().toISOString()}"`);
  lines.push('---');
  lines.push('');

  // 标题
  lines.push(`# ${entity.name}`);
  lines.push('');

  // 元信息
  lines.push(`> **类型**: ${typeLabel}`);
  lines.push('');
  lines.push('## 概述');
  lines.push('');
  lines.push(entity.description || '暂无描述。');
  lines.push('');

  // 相关 Q&A
  if (entity.relatedEntries && entity.relatedEntries.length > 0) {
    lines.push('## 相关问答');
    lines.push('');
    for (const entry of entity.relatedEntries) {
      lines.push(`- [${entry.title || `条目 #${entry.id}`}](../entries/${sanitizeFilename(entry.title || String(entry.id))}.md)`);
    }
    lines.push('');
  }

  // 关联实体
  if (entity.relatedEntities && entity.relatedEntities.length > 0) {
    lines.push('## 关联实体');
    lines.push('');
    for (const related of entity.relatedEntities) {
      lines.push(`- [[${related}]]`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 生成概念页的 Markdown 内容
 *
 * @param {Object} concept - 概念对象
 * @param {string} concept.name - 概念名称
 * @param {string} concept.description - 概念描述
 * @param {Array} [concept.relatedEntries] - 关联的 Q&A 条目（含 id, title）
 * @param {Array<string>} [concept.relatedEntities] - 关联的实体名称
 * @returns {string} Markdown 内容
 */
export function generateConceptMarkdown(concept) {
  const lines = [];

  // YAML frontmatter
  lines.push('---');
  lines.push(`title: "${escapeYamlString(concept.name)}"`);
  lines.push(`type: concept`);
  lines.push(`created: "${new Date().toISOString()}"`);
  lines.push('---');
  lines.push('');

  // 标题
  lines.push(`# ${concept.name}`);
  lines.push('');

  // 概述
  lines.push('## 概述');
  lines.push('');
  lines.push(concept.description || '暂无描述。');
  lines.push('');

  // 相关 Q&A
  if (concept.relatedEntries && concept.relatedEntries.length > 0) {
    lines.push('## 相关问答');
    lines.push('');
    for (const entry of concept.relatedEntries) {
      lines.push(`- [${entry.title || `条目 #${entry.id}`}](../entries/${sanitizeFilename(entry.title || String(entry.id))}.md)`);
    }
    lines.push('');
  }

  // 关联实体
  if (concept.relatedEntities && concept.relatedEntities.length > 0) {
    lines.push('## 关联技术');
    lines.push('');
    for (const related of concept.relatedEntities) {
      lines.push(`- [[${related}]]`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ==================== 索引生成 ====================

/**
 * 生成实体/概念的索引 Markdown
 *
 * @param {Array} entities - 实体列表
 * @param {Array} concepts - 概念列表
 * @returns {string} 索引 Markdown 内容
 */
export function buildEntityIndex(entities, concepts) {
  const lines = [];

  lines.push('# 实体与概念索引');
  lines.push('');
  lines.push(`> 自动生成于 ${new Date().toISOString()}`);
  lines.push(`> 实体: ${entities.length} 个 | 概念: ${concepts.length} 个`);
  lines.push('');

  // 实体按类型分组
  if (entities.length > 0) {
    lines.push('## 实体');
    lines.push('');

    const grouped = groupEntitiesByType(entities);
    for (const [type, items] of Object.entries(grouped)) {
      const typeLabel = ENTITY_TYPE_LABELS[type] || type;
      lines.push(`### ${typeLabel}`);
      lines.push('');
      for (const entity of items) {
        const link = `entities/${sanitizeFilename(entity.name)}.md`;
        lines.push(`- [${entity.name}](${link}) — ${entity.description || '无描述'} ` +
          `(${entity.relatedEntryIds?.length || 0} 条相关问答)`);
      }
      lines.push('');
    }
  }

  // 概念列表
  if (concepts.length > 0) {
    lines.push('## 概念');
    lines.push('');
    for (const concept of concepts) {
      const link = `concepts/${sanitizeFilename(concept.name)}.md`;
      lines.push(`- [${concept.name}](${link}) — ${concept.description || '无描述'} ` +
        `(${concept.relatedEntryIds?.length || 0} 条相关问答)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 将实体按类型分组
 * @param {Array} entities
 * @returns {Object} { type: [entity, ...] }
 */
function groupEntitiesByType(entities) {
  const groups = {};
  for (const entity of entities) {
    const type = entity.type || 'other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(entity);
  }
  return groups;
}

// ==================== 辅助函数 ====================

/**
 * 转义 YAML 字符串中的特殊字符
 * @param {string} str
 * @returns {string}
 */
function escapeYamlString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}
