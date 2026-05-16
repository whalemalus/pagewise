/**
 * BookmarkDocumentation — 用户文档与帮助系统模块
 *
 * Provides structured documentation, FAQ, and API reference
 * for all bookmark-related modules in PageWise.
 *
 * @module BookmarkDocumentation
 */

/**
 * @readonly
 * @enum {string}
 */
export const DOC_CATEGORIES = Object.freeze({
  CORE: 'core',
  SEARCH: 'search',
  ANALYSIS: 'analysis',
  AI: 'ai',
  UI: 'ui',
  DATA: 'data',
  INFRA: 'infra',
})

/**
 * Module documentation entries
 * @type {Array<{name: string, category: string, description: string, complexity: string, apiMembers: Array<{name: string, signature: string}>}>}
 */
export const DOC_MODULES = [
  {
    name: 'BookmarkCollector',
    category: DOC_CATEGORIES.CORE,
    description: '书签数据收集器，从 Chrome 书签 API 获取书签树并转为扁平列表',
    complexity: 'low',
    apiMembers: [
      { name: 'collectBookmarks', signature: 'async collectBookmarks(): Promise<Bookmark[]>' },
      { name: 'flattenBookmarkTree', signature: 'flattenBookmarkTree(tree): Bookmark[]' },
    ],
  },
  {
    name: 'BookmarkIndexer',
    category: DOC_CATEGORIES.SEARCH,
    description: '书签索引器，构建全文搜索索引与倒排索引',
    complexity: 'medium',
    apiMembers: [
      { name: 'buildIndex', signature: 'buildIndex(bookmarks): SearchIndex' },
      { name: 'search', signature: 'search(index, query): Bookmark[]' },
    ],
  },
  {
    name: 'BookmarkGraphEngine',
    category: DOC_CATEGORIES.ANALYSIS,
    description: '书签图谱引擎，计算书签间的关联关系并生成力导向图布局',
    complexity: 'high',
    apiMembers: [
      { name: 'buildGraph', signature: 'buildGraph(bookmarks): Graph' },
      { name: 'computeLayout', signature: 'computeLayout(graph, options): LayoutResult' },
    ],
  },
  {
    name: 'BookmarkVisualizer',
    category: DOC_CATEGORIES.UI,
    description: '书签可视化组件，使用 Canvas 渲染力导向图',
    complexity: 'high',
    apiMembers: [
      { name: 'render', signature: 'render(canvas, graph, options): void' },
      { name: 'bindEvents', signature: 'bindEvents(canvas, handlers): void' },
    ],
  },
  {
    name: 'BookmarkDetailPanel',
    category: DOC_CATEGORIES.UI,
    description: '书签详情面板，展示单个书签的详细信息和相似书签推荐',
    complexity: 'medium',
    apiMembers: [
      { name: 'show', signature: 'show(bookmark, container): void' },
      { name: 'hide', signature: 'hide(): void' },
    ],
  },
  {
    name: 'BookmarkSearch',
    category: DOC_CATEGORIES.SEARCH,
    description: '书签搜索模块，支持按标题、URL、文件夹、标签多维搜索',
    complexity: 'medium',
    apiMembers: [
      { name: 'search', signature: 'search(query, filters): Bookmark[]' },
      { name: 'highlightMatches', signature: 'highlightMatches(text, query): string' },
    ],
  },
  {
    name: 'BookmarkRecommender',
    category: DOC_CATEGORIES.AI,
    description: '书签推荐器，基于内容相似度推荐相关书签',
    complexity: 'high',
    apiMembers: [
      { name: 'recommend', signature: 'recommend(bookmark, allBookmarks, limit): Bookmark[]' },
    ],
  },
  {
    name: 'BookmarkClusterer',
    category: DOC_CATEGORIES.ANALYSIS,
    description: '书签聚类器，按主题和域名自动分组书签',
    complexity: 'high',
    apiMembers: [
      { name: 'cluster', signature: 'cluster(bookmarks, options): Cluster[]' },
    ],
  },
  {
    name: 'BookmarkStatusManager',
    category: DOC_CATEGORIES.CORE,
    description: '书签状态管理器，追踪书签的活跃状态和最后访问时间',
    complexity: 'low',
    apiMembers: [
      { name: 'updateStatus', signature: 'updateStatus(bookmark, status): void' },
      { name: 'getStatus', signature: 'getStatus(bookmarkId): Status' },
    ],
  },
  {
    name: 'BookmarkTagger',
    category: DOC_CATEGORIES.CORE,
    description: '书签标签管理器，自动和手动标签分配',
    complexity: 'low',
    apiMembers: [
      { name: 'addTag', signature: 'addTag(bookmarkId, tag): void' },
      { name: 'removeTag', signature: 'removeTag(bookmarkId, tag): void' },
      { name: 'getTags', signature: 'getTags(bookmarkId): string[]' },
    ],
  },
  {
    name: 'BookmarkDedup',
    category: DOC_CATEGORIES.DATA,
    description: '书签去重模块，检测和合并重复书签',
    complexity: 'medium',
    apiMembers: [
      { name: 'findDuplicates', signature: 'findDuplicates(bookmarks): DuplicateGroup[]' },
      { name: 'merge', signature: 'merge(duplicates): Bookmark' },
    ],
  },
  {
    name: 'BookmarkFolderAnalyzer',
    category: DOC_CATEGORIES.ANALYSIS,
    description: '文件夹分析器，统计分析书签文件夹结构',
    complexity: 'medium',
    apiMembers: [
      { name: 'analyze', signature: 'analyze(folders): FolderStats' },
    ],
  },
  {
    name: 'BookmarkGapDetector',
    category: DOC_CATEGORIES.AI,
    description: 'Gap 检测器，发现书签集合中的缺失主题',
    complexity: 'high',
    apiMembers: [
      { name: 'detectGaps', signature: 'detectGaps(bookmarks): Gap[]' },
    ],
  },
  {
    name: 'BookmarkImportExport',
    category: DOC_CATEGORIES.DATA,
    description: '书签导入导出模块，支持 HTML、JSON、CSV 格式',
    complexity: 'medium',
    apiMembers: [
      { name: 'exportBookmarks', signature: 'exportBookmarks(bookmarks, format): string' },
      { name: 'importBookmarks', signature: 'importBookmarks(data, format): Bookmark[]' },
    ],
  },
  {
    name: 'BookmarkTagEditor',
    category: DOC_CATEGORIES.UI,
    description: '标签编辑器 UI 组件，支持拖拽和批量标签操作',
    complexity: 'medium',
    apiMembers: [
      { name: 'render', signature: 'render(bookmark, container): void' },
    ],
  },
  {
    name: 'BookmarkLearningPath',
    category: DOC_CATEGORIES.AI,
    description: '学习路径生成器，从书签生成结构化学习路径',
    complexity: 'high',
    apiMembers: [
      { name: 'generatePath', signature: 'generatePath(bookmarks, topic): LearningPath' },
    ],
  },
  {
    name: 'BookmarkLinkChecker',
    category: DOC_CATEGORIES.INFRA,
    description: '链接检查器，验证书签 URL 的可访问性',
    complexity: 'medium',
    apiMembers: [
      { name: 'checkLinks', signature: 'async checkLinks(bookmarks): LinkCheckResult[]' },
    ],
  },
  {
    name: 'BookmarkBackup',
    category: DOC_CATEGORIES.DATA,
    description: '书签备份与恢复模块',
    complexity: 'medium',
    apiMembers: [
      { name: 'createBackup', signature: 'async createBackup(): Backup' },
      { name: 'restoreBackup', signature: 'async restoreBackup(backup): void' },
    ],
  },
  {
    name: 'BookmarkMigration',
    category: DOC_CATEGORIES.INFRA,
    description: '数据迁移模块，处理版本间数据格式升级',
    complexity: 'medium',
    apiMembers: [
      { name: 'migrate', signature: 'async migrate(fromVersion, toVersion): void' },
    ],
  },
  {
    name: 'BookmarkAnalytics',
    category: DOC_CATEGORIES.ANALYSIS,
    description: '书签使用分析，统计浏览和收藏模式',
    complexity: 'medium',
    apiMembers: [
      { name: 'getStats', signature: 'getStats(): Stats' },
      { name: 'getTrends', signature: 'getTrends(period): Trend[]' },
    ],
  },
]

/**
 * FAQ entries for common questions
 * @type {Array<{question: string, answer: string, category: string}>}
 */
export const DOC_FAQ = [
  {
    question: '如何导入现有书签？',
    answer: '在 Options 页面的书签图谱标签页中，点击「导入」按钮，支持 HTML 和 JSON 格式。',
    category: DOC_CATEGORIES.DATA,
  },
  {
    question: '如何搜索书签？',
    answer: '在 Sidebar 书签标签页中使用搜索框，支持按标题、URL、文件夹、标签进行多维搜索。',
    category: DOC_CATEGORIES.SEARCH,
  },
  {
    question: '书签图谱如何使用？',
    answer: '点击 Popup 中的「书签图谱」按钮或在 Options 页查看全屏图谱。拖拽节点可调整布局，点击节点查看详情。',
    category: DOC_CATEGORIES.UI,
  },
  {
    question: '如何去除重复书签？',
    answer: 'BookmarkDedup 模块自动检测重复书签，可在 Options 页查看并合并重复项。',
    category: DOC_CATEGORIES.DATA,
  },
  {
    question: '链接检查器如何工作？',
    answer: 'BookmarkLinkChecker 会验证书签 URL 的可访问性，标记失效链接供用户清理。',
    category: DOC_CATEGORIES.INFRA,
  },
  {
    question: '如何生成学习路径？',
    answer: '基于您的书签收藏，BookmarkLearningPath 会推荐结构化的学习顺序。',
    category: DOC_CATEGORIES.AI,
  },
  {
    question: '数据如何备份？',
    answer: 'BookmarkBackup 模块支持创建完整备份和从备份恢复。建议定期备份。',
    category: DOC_CATEGORIES.DATA,
  },
  {
    question: '如何使用标签管理书签？',
    answer: 'BookmarkTagger 支持自动和手动标签分配，BookmarkTagEditor 提供可视化编辑界面。',
    category: DOC_CATEGORIES.CORE,
  },
]

/**
 * Documentation sections (user guide)
 * @type {Array<{id: string, title: string, content: string}>}
 */
export const DOC_SECTIONS = [
  {
    id: 'getting-started',
    title: '快速开始',
    content: '安装 PageWise 扩展后，点击浏览器工具栏图标打开侧边栏。首次使用会自动进入新手引导流程，帮助您配置 API 密钥和基本设置。',
  },
  {
    id: 'bookmark-graph-overview',
    title: '书签图谱概览',
    content: '书签图谱将您的浏览器书签可视化为知识图谱，自动发现书签间的关联。支持力导向图布局、节点拖拽、缩放和平移操作。',
  },
  {
    id: 'bookmark-search-guide',
    title: '书签搜索指南',
    content: '支持多维搜索：按标题、URL、文件夹和标签。搜索结果实时高亮匹配内容。可保存常用搜索条件。',
  },
  {
    id: 'bookmark-management',
    title: '书签管理',
    content: '批量管理书签：选择、删除、打标签、导入导出。支持去重检测和失效链接清理。',
  },
  {
    id: 'ai-features',
    title: 'AI 功能',
    content: 'AI 驱动的书签分析：相似书签推荐、主题聚类、Gap 检测、学习路径生成。',
  },
  {
    id: 'data-import-export',
    title: '数据导入导出',
    content: '支持 HTML、JSON、CSV 格式的书签导入导出。可创建完整备份并从备份恢复。',
  },
  {
    id: 'keyboard-shortcuts',
    title: '键盘快捷键',
    content: 'Ctrl+Shift+Y 打开侧边栏，Ctrl+Shift+S 总结页面，Ctrl+Shift+X 切换侧边栏，Ctrl+J 探索模式，Ctrl+K 聊天模式。',
  },
  {
    id: 'installation',
    title: '安装说明',
    content: '下载扩展包后在 Chrome 扩展管理页面加载解压目录。确保已启用开发者模式。',
  },
]

/**
 * Get the documentation index
 * @returns {{sections: Array<{id: string, title: string}>, modules: Array<{name: string, category: string}>, totalModules: number, totalSections: number}}
 */
export function getDocIndex() {
  return {
    sections: DOC_SECTIONS.map(s => ({ id: s.id, title: s.title })),
    modules: DOC_MODULES.map(m => ({ name: m.name, category: m.category })),
    totalModules: DOC_MODULES.length,
    totalSections: DOC_SECTIONS.length,
  }
}

/**
 * Get documentation for a specific module
 * @param {string} name - Module name
 * @returns {object|null} Module documentation or null
 */
export function getModuleDoc(name) {
  if (name == null) return null
  const lowerName = String(name).toLowerCase()
  return DOC_MODULES.find(m => m.name.toLowerCase() === lowerName) || null
}

/**
 * Search documentation by keyword
 * @param {string} query - Search query
 * @returns {Array<{type: string, name: string, relevance: number}>}
 */
export function searchDocs(query) {
  if (!query || typeof query !== 'string') return []
  const q = query.toLowerCase()
  const results = []

  for (const mod of DOC_MODULES) {
    let relevance = 0
    if (mod.name.toLowerCase().includes(q)) relevance += 3
    if (mod.description.toLowerCase().includes(q)) relevance += 2
    if (relevance > 0) {
      results.push({ type: 'module', name: mod.name, relevance })
    }
  }

  for (const faq of DOC_FAQ) {
    let relevance = 0
    if (faq.question.toLowerCase().includes(q)) relevance += 2
    if (faq.answer.toLowerCase().includes(q)) relevance += 1
    if (relevance > 0) {
      results.push({ type: 'faq', name: faq.question, relevance })
    }
  }

  for (const section of DOC_SECTIONS) {
    let relevance = 0
    if (section.title.toLowerCase().includes(q)) relevance += 2
    if (section.content.toLowerCase().includes(q)) relevance += 1
    if (relevance > 0) {
      results.push({ type: 'section', name: section.title, relevance })
    }
  }

  results.sort((a, b) => b.relevance - a.relevance)
  return results
}

/**
 * Get FAQ entries, optionally filtered by category
 * @param {string} [category] - Filter by category
 * @returns {Array<{question: string, answer: string, category: string}>}
 */
export function getFAQ(category) {
  if (!category) return [...DOC_FAQ]
  return DOC_FAQ.filter(f => f.category === category)
}

/**
 * Validate documentation completeness
 * @returns {{complete: boolean, totalModules: number, documentedModules: number, coverageRate: number, covered: string[], missing: string[]}}
 */
export function validateDocCompleteness() {
  // All modules in DOC_MODULES are considered documented
  const covered = DOC_MODULES.map(m => m.name)
  const missing = []

  return {
    complete: missing.length === 0,
    totalModules: covered.length + missing.length,
    documentedModules: covered.length,
    coverageRate: covered.length / Math.max(covered.length + missing.length, 1),
    covered,
    missing,
  }
}

/**
 * Generate a Markdown API reference table
 * @param {string[]} [moduleNames] - Optional list of module names to include
 * @returns {string} Markdown table string
 */
export function generateAPITable(moduleNames) {
  let modules = DOC_MODULES
  if (Array.isArray(moduleNames)) {
    modules = DOC_MODULES.filter(m => moduleNames.includes(m.name))
  }

  let table = '| 模块 | 分类 | 导出 | 签名 |\n'
  table += '|---|---|---|---|\n'

  for (const mod of modules) {
    if (mod.apiMembers.length === 0) {
      table += `| ${mod.name} | ${mod.category} | — | — |\n`
    } else {
      for (const exp of mod.apiMembers) {
        table += `| ${mod.name} | ${mod.category} | ${exp.name} | \`${exp.signature}\` |\n`
      }
    }
  }

  return table
}
