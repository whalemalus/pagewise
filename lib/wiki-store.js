/**
 * WikiStore — L3.1 Wiki 浏览模式数据层
 *
 * 将知识库中的实体、概念和 Q&A 条目聚合为统一的 Wiki 页面模型。
 * 支持：
 *   - 浏览 wiki 页面（实体/概念/Q&A）
 *   - `[[wikilinks]]` 解析和跳转
 *   - 页面内搜索
 *   - 按标签/类型筛选
 *   - 反向链接查询
 *   - 分页加载
 *
 * 设计原则：
 *   - 核心逻辑为纯函数，不依赖 IndexedDB 或 Chrome API
 *   - IndexedDB 交互通过 WikiStore 类的 _load* 方法隔离
 *   - 与 AutoClassifier / KnowledgeBase 完全解耦
 *
 * @module wiki-store
 */

// ==================== 常量 ====================

/** Wiki 页面类型 */
export const WIKI_PAGE_TYPE = {
  ENTITY: 'entity',
  CONCEPT: 'concept',
  QA: 'qa',
};

/** 页面类型标签 */
export const PAGE_TYPE_LABELS = {
  entity: '实体',
  concept: '概念',
  qa: '知识',
};

/** 页面类型图标 */
export const PAGE_TYPE_ICONS = {
  entity: '🏷️',
  concept: '💡',
  qa: '❓',
};

/** 实体类型标签 */
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

// ==================== 纯函数（不依赖 IndexedDB）====================

/**
 * 生成 Wiki 页面 ID
 *
 * @param {string} type - 页面类型 ('entity' | 'concept' | 'qa')
 * @param {string|number} identifier - 标识符（实体名/概念名/条目ID）
 * @returns {string} 格式: 'entity:react' | 'concept:containerization' | 'qa:42'
 */
export function buildPageId(type, identifier) {
  if (!type || identifier === undefined || identifier === null) return '';
  return `${type}:${String(identifier)}`;
}

/**
 * 解析 Wiki 页面 ID
 *
 * @param {string} pageId - 页面 ID
 * @returns {{ type: string, identifier: string } | null}
 */
export function parsePageId(pageId) {
  if (!pageId || typeof pageId !== 'string') return null;
  const idx = pageId.indexOf(':');
  if (idx <= 0) return null;
  const type = pageId.substring(0, idx);
  const identifier = pageId.substring(idx + 1);
  if (!type || !identifier) return null;
  if (!Object.values(WIKI_PAGE_TYPE).includes(type)) return null;
  return { type, identifier };
}

/**
 * 从实体记录构建 Wiki 页面
 *
 * @param {Object} entity - AutoClassifier 实体记录
 * @returns {Object} Wiki 页面
 */
export function entityToWikiPage(entity) {
  if (!entity || !entity.name) return null;

  const displayName = entity.displayName || entity.name;
  const typeLabel = ENTITY_TYPE_LABELS[entity.type] || entity.type || '其他';

  const content = [
    `# ${displayName}`,
    '',
    `**类型**: ${typeLabel}`,
    '',
  ];

  if (entity.description) {
    content.push(entity.description, '');
  }

  if (entity.entryIds && entity.entryIds.length > 0) {
    content.push(`## 相关知识 (${entity.entryIds.length} 条)`, '');
    for (const entryId of entity.entryIds) {
      content.push(`- [[qa:${entryId}]]`);
    }
    content.push('');
  }

  return {
    id: buildPageId(WIKI_PAGE_TYPE.ENTITY, entity.name),
    type: WIKI_PAGE_TYPE.ENTITY,
    title: displayName,
    content: content.join('\n'),
    tags: [typeLabel, entity.type || 'other'],
    metadata: {
      name: entity.name,
      entityType: entity.type,
      entryCount: entity.entryIds ? entity.entryIds.length : 0,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    },
  };
}

/**
 * 从概念记录构建 Wiki 页面
 *
 * @param {Object} concept - AutoClassifier 概念记录
 * @returns {Object} Wiki 页面
 */
export function conceptToWikiPage(concept) {
  if (!concept || !concept.name) return null;

  const displayName = concept.displayName || concept.name;

  const content = [
    `# ${displayName}`,
    '',
    '**类型**: 概念',
    '',
  ];

  if (concept.description) {
    content.push(concept.description, '');
  }

  if (concept.entryIds && concept.entryIds.length > 0) {
    content.push(`## 相关知识 (${concept.entryIds.length} 条)`, '');
    for (const entryId of concept.entryIds) {
      content.push(`- [[qa:${entryId}]]`);
    }
    content.push('');
  }

  return {
    id: buildPageId(WIKI_PAGE_TYPE.CONCEPT, concept.name),
    type: WIKI_PAGE_TYPE.CONCEPT,
    title: displayName,
    content: content.join('\n'),
    tags: ['概念'],
    metadata: {
      name: concept.name,
      entryCount: concept.entryIds ? concept.entryIds.length : 0,
      createdAt: concept.createdAt,
      updatedAt: concept.updatedAt,
    },
  };
}

/**
 * 从 Q&A 条目构建 Wiki 页面
 *
 * @param {Object} entry - 知识条目
 * @returns {Object} Wiki 页面
 */
export function entryToWikiPage(entry) {
  if (!entry) return null;

  const title = entry.title || entry.question || `知识 #${entry.id}`;
  const content = [
    `# ${title}`,
    '',
  ];

  if (entry.question && entry.question !== title) {
    content.push('## 问题', '', entry.question, '');
  }

  if (entry.answer) {
    content.push('## 回答', '', entry.answer, '');
  }

  const tags = Array.isArray(entry.tags) ? [...entry.tags] : [];

  if (entry.sourceUrl) {
    content.push('## 来源', '', `[${entry.sourceUrl}](${entry.sourceUrl})`, '');
  }

  return {
    id: buildPageId(WIKI_PAGE_TYPE.QA, entry.id),
    type: WIKI_PAGE_TYPE.QA,
    title,
    content: content.join('\n'),
    tags,
    metadata: {
      entryId: entry.id,
      sourceUrl: entry.sourceUrl,
      createdAt: entry.createdAt,
      category: entry.category,
    },
  };
}

/**
 * 从文本中提取 [[wikilinks]]
 *
 * @param {string} text - 包含 wikilinks 的文本
 * @returns {string[]} 提取出的链接目标（pageId 列表）
 */
export function extractWikilinks(text) {
  if (!text || typeof text !== 'string') return [];

  const links = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const target = match[1].trim();
    if (target) {
      links.push(target);
    }
  }

  return links;
}

/**
 * 将文本中的 [[wikilinks]] 替换为可点击的 HTML 链接
 *
 * @param {string} text - 包含 wikilinks 的文本
 * @param {Map<string, Object>} pageMap - 页面 ID → 页面对象的映射
 * @param {Object} [options] - 选项
 * @param {string} [options.cssClass='wiki-link'] - 链接 CSS 类名
 * @returns {string} 替换后的 HTML 字符串
 */
export function renderWikilinks(text, pageMap, options = {}) {
  if (!text || typeof text !== 'string') return text || '';

  const cssClass = options.cssClass || 'wiki-link';

  return text.replace(/\[\[([^\]]+)\]\]/g, (fullMatch, target) => {
    const pageId = target.trim();
    const page = pageMap ? pageMap.get(pageId) : null;
    const label = page ? page.title : pageId;
    return `<a href="#" class="${cssClass}" data-wiki-page="${escapeHtmlAttr(pageId)}" title="${escapeHtmlAttr(pageId)}">${escapeHtml(label)}</a>`;
  });
}

/**
 * 构建反向链接索引
 *
 * 给定所有页面，计算每个页面被哪些页面链接。
 *
 * @param {Array<Object>} pages - Wiki 页面数组
 * @returns {Map<string, string[]>} 页面 ID → 链接到该页面的页面 ID 列表
 */
export function buildBacklinkIndex(pages) {
  const backlinks = new Map();

  if (!Array.isArray(pages)) return backlinks;

  // 初始化
  for (const page of pages) {
    if (page && page.id) {
      backlinks.set(page.id, []);
    }
  }

  // 填充反向链接
  for (const page of pages) {
    if (!page || !page.content) continue;

    const outlinks = extractWikilinks(page.content);
    for (const target of outlinks) {
      if (!backlinks.has(target)) {
        backlinks.set(target, []);
      }
      backlinks.get(target).push(page.id);
    }
  }

  return backlinks;
}

/**
 * 获取页面的出站链接（从 content 中提取 wikilinks）
 *
 * @param {Object} page - Wiki 页面
 * @returns {string[]} 出站链接的页面 ID 列表
 */
export function getOutlinks(page) {
  if (!page || !page.content) return [];
  return extractWikilinks(page.content);
}

/**
 * 构建页面 ID → 页面对象的 Map
 *
 * @param {Array<Object>} pages - Wiki 页面数组
 * @returns {Map<string, Object>}
 */
export function buildPageMap(pages) {
  const map = new Map();
  if (!Array.isArray(pages)) return map;

  for (const page of pages) {
    if (page && page.id) {
      map.set(page.id, page);
    }
  }

  return map;
}

// ==================== 搜索与过滤 ====================

/**
 * 搜索 wiki 页面（关键词匹配）
 *
 * 搜索范围: 标题、内容、标签
 *
 * @param {Array<Object>} pages - Wiki 页面数组
 * @param {string} query - 搜索关键词
 * @returns {Array<Object>} 匹配的页面（按相关性排序）
 */
export function searchPages(pages, query) {
  if (!query || !Array.isArray(pages)) return pages || [];

  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return pages;

  const scored = [];

  for (const page of pages) {
    if (!page) continue;

    let score = 0;

    // 标题匹配（权重最高）
    if (page.title && page.title.toLowerCase().includes(lowerQuery)) {
      score += 10;
      // 完全匹配
      if (page.title.toLowerCase() === lowerQuery) {
        score += 5;
      }
    }

    // 标签匹配
    if (Array.isArray(page.tags)) {
      for (const tag of page.tags) {
        if (tag && tag.toLowerCase().includes(lowerQuery)) {
          score += 3;
        }
      }
    }

    // 内容匹配
    if (page.content && page.content.toLowerCase().includes(lowerQuery)) {
      score += 1;
    }

    if (score > 0) {
      scored.push({ page, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.page);
}

/**
 * 按类型过滤页面
 *
 * @param {Array<Object>} pages - Wiki 页面数组
 * @param {string|string[]} types - 页面类型（可多个）
 * @returns {Array<Object>} 过滤后的页面
 */
export function filterByType(pages, types) {
  if (!Array.isArray(pages)) return [];

  const typeSet = new Set(
    Array.isArray(types) ? types : [types]
  );

  return pages.filter(page => page && typeSet.has(page.type));
}

/**
 * 按标签过滤页面
 *
 * @param {Array<Object>} pages - Wiki 页面数组
 * @param {string|string[]} tags - 标签（可多个，OR 逻辑）
 * @returns {Array<Object>} 过滤后的页面
 */
export function filterByTags(pages, tags) {
  if (!Array.isArray(pages)) return [];

  const tagList = Array.isArray(tags) ? tags : [tags];
  const lowerTags = tagList.map(t => t.toLowerCase().trim()).filter(Boolean);

  if (lowerTags.length === 0) return pages;

  return pages.filter(page => {
    if (!page || !Array.isArray(page.tags)) return false;
    const pageTags = page.tags.map(t => t.toLowerCase().trim());
    return lowerTags.some(t => pageTags.includes(t));
  });
}

/**
 * 分页
 *
 * @param {Array<Object>} items - 元素数组
 * @param {number} page - 页码（从 1 开始）
 * @param {number} pageSize - 每页大小
 * @returns {{ items: Array, total: number, page: number, pageSize: number, totalPages: number }}
 */
export function paginate(items, page = 1, pageSize = 20) {
  const total = Array.isArray(items) ? items.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: Array.isArray(items) ? items.slice(start, end) : [],
    total,
    page: currentPage,
    pageSize,
    totalPages,
  };
}

// ==================== Wikilink 渲染辅助 ====================

/**
 * 转义 HTML 属性值
 * @param {string} str
 * @returns {string}
 */
function escapeHtmlAttr(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 转义 HTML 文本
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ==================== WikiStore 类 ====================

/**
 * Wiki 数据存储层
 *
 * 聚合来自 AutoClassifier（实体/概念）和 KnowledgeBase（Q&A 条目）的数据，
 * 构建统一的 Wiki 页面视图。
 *
 * 使用方式:
 *   const store = new WikiStore();
 *   await store.loadAll(entities, concepts, entries);
 *   const pages = store.getAllPages();
 *   const page = store.getPage('entity:react');
 */
export class WikiStore {
  constructor() {
    /** @type {Map<string, Object>} 页面 ID → 页面对象 */
    this._pageMap = new Map();
    /** @type {Map<string, string[]>} 页面 ID → 反向链接列表 */
    this._backlinkIndex = new Map();
    /** @type {boolean} 是否已加载 */
    this._loaded = false;
    /** @type {Object} 统计信息 */
    this._stats = { entityCount: 0, conceptCount: 0, qaCount: 0, total: 0 };
  }

  /**
   * 加载数据并构建 Wiki 页面
   *
   * @param {Array<Object>} entities - 实体列表（来自 AutoClassifier）
   * @param {Array<Object>} concepts - 概念列表（来自 AutoClassifier）
   * @param {Array<Object>} entries - Q&A 条目列表（来自 KnowledgeBase）
   * @returns {Object} 加载统计
   */
  loadAll(entities, concepts, entries) {
    const pages = [];

    // 转换实体
    if (Array.isArray(entities)) {
      for (const entity of entities) {
        const page = entityToWikiPage(entity);
        if (page) pages.push(page);
      }
    }

    // 转换概念
    if (Array.isArray(concepts)) {
      for (const concept of concepts) {
        const page = conceptToWikiPage(concept);
        if (page) pages.push(page);
      }
    }

    // 转换 Q&A 条目
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const page = entryToWikiPage(entry);
        if (page) pages.push(page);
      }
    }

    // 构建映射和索引
    this._pageMap = buildPageMap(pages);
    this._backlinkIndex = buildBacklinkIndex(pages);
    this._loaded = true;

    // 统计
    const entityCount = pages.filter(p => p.type === WIKI_PAGE_TYPE.ENTITY).length;
    const conceptCount = pages.filter(p => p.type === WIKI_PAGE_TYPE.CONCEPT).length;
    const qaCount = pages.filter(p => p.type === WIKI_PAGE_TYPE.QA).length;

    this._stats = {
      entityCount,
      conceptCount,
      qaCount,
      total: pages.length,
    };

    return { ...this._stats };
  }

  /**
   * 获取所有页面
   *
   * @returns {Array<Object>}
   */
  getAllPages() {
    return [...this._pageMap.values()];
  }

  /**
   * 根据 ID 获取单个页面
   *
   * @param {string} pageId
   * @returns {Object|null}
   */
  getPage(pageId) {
    return this._pageMap.get(pageId) || null;
  }

  /**
   * 搜索页面
   *
   @param {string} query
   * @returns {Array<Object>}
   */
  search(query) {
    return searchPages(this.getAllPages(), query);
  }

  /**
   * 按类型获取页面
   *
   * @param {string|string[]} types
   * @returns {Array<Object>}
   */
  getByType(types) {
    return filterByType(this.getAllPages(), types);
  }

  /**
   * 按标签获取页面
   *
   * @param {string|string[]} tags
   * @returns {Array<Object>}
   */
  getByTags(tags) {
    return filterByTags(this.getAllPages(), tags);
  }

  /**
   * 获取页面的反向链接
   *
   * @param {string} pageId
   * @returns {Array<Object>} 链接到该页面的页面列表
   */
  getBacklinks(pageId) {
    const linkIds = this._backlinkIndex.get(pageId) || [];
    return linkIds
      .map(id => this._pageMap.get(id))
      .filter(Boolean);
  }

  /**
   * 获取页面的出站链接
   *
   * @param {string} pageId
   * @returns {Array<Object>} 该页面链接到的页面列表
   */
  getOutlinksFromPage(pageId) {
    const page = this._pageMap.get(pageId);
    if (!page) return [];

    const linkIds = getOutlinks(page);
    return linkIds
      .map(id => this._pageMap.get(id))
      .filter(Boolean);
  }

  /**
   * 分页获取页面
   *
   * @param {number} page - 页码（从 1 开始）
   * @param {number} pageSize - 每页大小
   * @returns {Object} 分页结果
   */
  getPaginated(page = 1, pageSize = 20) {
    return paginate(this.getAllPages(), page, pageSize);
  }

  /**
   * 获取所有标签（去重）
   *
   * @returns {string[]}
   */
  getAllTags() {
    const tagSet = new Set();
    for (const page of this._pageMap.values()) {
      if (Array.isArray(page.tags)) {
        for (const tag of page.tags) {
          tagSet.add(tag);
        }
      }
    }
    return [...tagSet].sort();
  }

  /**
   * 获取统计信息
   *
   * @returns {Object}
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * 渲染 wikilink（将 [[xxx]] 替换为可点击 HTML）
   *
   * @param {string} text
   * @returns {string}
   */
  renderWikilinks(text) {
    return renderWikilinks(text, this._pageMap);
  }

  /**
   * 解析 wikilink 并返回目标页面
   *
   * @param {string} pageId - wikilink 目标
   * @returns {Object|null}
   */
  resolveWikilink(pageId) {
    return this._pageMap.get(pageId) || null;
  }

  /**
   * 是否已加载数据
   *
   * @returns {boolean}
   */
  isLoaded() {
    return this._loaded;
  }

  /**
   * 清空数据
   */
  clear() {
    this._pageMap.clear();
    this._backlinkIndex.clear();
    this._loaded = false;
    this._stats = { entityCount: 0, conceptCount: 0, qaCount: 0, total: 0 };
  }
}
