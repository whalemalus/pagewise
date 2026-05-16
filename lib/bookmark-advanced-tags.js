/**
 * AdvancedTagManager — 高级标签管理器
 *
 * 功能:
 *   - Tag Colors: assignColor / getColor, 15 色固定色盘轮转
 *   - Tag Hierarchy: setParent / getChildren / getAncestors
 *   - Tag Statistics: getTagStats → { count, top, coOccurrence }
 *   - Auto-tagging: autoTag 从 title + url 关键词自动打标签
 *
 * @module lib/bookmark-advanced-tags
 */

// ==================== 常量 ====================

/**
 * 15 色色盘 (Material 色系)
 * @type {string[]}
 */
const COLOR_PALETTE = [
  '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
  '#2196F3', '#00BCD4', '#009688', '#4CAF50', '#8BC34A',
  '#CDDC39', '#FFC107', '#FF9800', '#FF5722', '#795548',
]

/**
 * 关键词 → 标签映射 (用于 autoTag)
 * @type {Map<string, string>}
 */
const KEYWORD_TAG_MAP = new Map([
  ['react', 'react'],
  ['vue', 'vue'],
  ['angular', 'angular'],
  ['svelte', 'svelte'],
  ['nextjs', 'nextjs'],
  ['next.js', 'nextjs'],
  ['nuxt', 'nuxt'],
  ['python', 'python'],
  ['django', 'django'],
  ['flask', 'flask'],
  ['fastapi', 'fastapi'],
  ['javascript', 'javascript'],
  ['typescript', 'typescript'],
  ['node.js', 'nodejs'],
  ['nodejs', 'nodejs'],
  ['express', 'express'],
  ['docker', 'docker'],
  ['kubernetes', 'kubernetes'],
  ['k8s', 'kubernetes'],
  ['terraform', 'terraform'],
  ['aws', 'aws'],
  ['azure', 'azure'],
  ['gcp', 'gcp'],
  ['firebase', 'firebase'],
  ['vercel', 'vercel'],
  ['rust', 'rust'],
  ['golang', 'go'],
  [' go ', 'go'],
  ['swift', 'swift'],
  ['kotlin', 'kotlin'],
  ['java', 'java'],
  ['css', 'css'],
  ['tailwind', 'tailwind'],
  ['graphql', 'graphql'],
  ['rest api', 'rest-api'],
  ['websocket', 'websocket'],
  ['machine learning', 'machine-learning'],
  ['deep learning', 'deep-learning'],
  ['llm', 'llm'],
  ['chatgpt', 'chatgpt'],
  ['openai', 'openai'],
  ['gpt', 'gpt'],
  ['tutorial', 'tutorial'],
  ['guide', 'guide'],
  ['cheatsheet', 'cheatsheet'],
  ['documentation', 'documentation'],
  ['api', 'api'],
  ['test', 'testing'],
  ['testing', 'testing'],
  ['jest', 'jest'],
  ['playwright', 'playwright'],
  ['cypress', 'cypress'],
  ['database', 'database'],
  ['sql', 'sql'],
  ['mongodb', 'mongodb'],
  ['redis', 'redis'],
  ['postgresql', 'postgresql'],
  ['mysql', 'mysql'],
  ['git', 'git'],
  ['github', 'github'],
  ['leetcode', 'leetcode'],
  ['algorithm', 'algorithm'],
  ['design pattern', 'design-pattern'],
  ['microservice', 'microservice'],
  ['serverless', 'serverless'],
  ['nginx', 'nginx'],
  ['linux', 'linux'],
  ['security', 'security'],
  ['performance', 'performance'],
  ['devops', 'devops'],
  ['figma', 'figma'],
])

/**
 * 域名 → 标签映射 (用于 autoTag)
 * @type {Map<string, string>}
 */
const DOMAIN_TAG_MAP = new Map([
  ['github.com', 'github'],
  ['stackoverflow.com', 'stackoverflow'],
  ['medium.com', 'medium'],
  ['dev.to', 'dev'],
  ['reddit.com', 'reddit'],
  ['youtube.com', 'youtube'],
  ['twitter.com', 'twitter'],
  ['x.com', 'twitter'],
  ['arxiv.org', 'arxiv'],
  ['leetcode.com', 'leetcode'],
  ['npmjs.com', 'npm'],
  ['npmjs.org', 'npm'],
  ['pypi.org', 'pypi'],
  ['docs.docker.com', 'docker'],
  ['kubernetes.io', 'kubernetes'],
  ['react.dev', 'react'],
  ['vuejs.org', 'vue'],
  ['angular.io', 'angular'],
  ['nextjs.org', 'nextjs'],
  ['rust-lang.org', 'rust'],
  ['go.dev', 'go'],
  ['python.org', 'python'],
  ['typescriptlang.org', 'typescript'],
  ['nodejs.org', 'nodejs'],
  ['vercel.com', 'vercel'],
  ['netlify.com', 'netlify'],
  ['cloudflare.com', 'cloudflare'],
  ['digitalocean.com', 'digitalocean'],
])

// ==================== 主类 ====================

/**
 * AdvancedTagManager
 */
export class AdvancedTagManager {
  /**
   * @param {Object} opts
   * @param {Array<{id:string, title:string, url:string, tags:string[]}>} [opts.bookmarks]
   */
  constructor(opts = {}) {
    /** @type {Array<{id:string, title:string, url:string, tags:string[]}>} */
    this.bookmarks = Array.isArray(opts.bookmarks) ? opts.bookmarks.map(b => ({ ...b, tags: [...(b.tags || [])] })) : []

    /** @type {Map<string, string>} tag → color */
    this._colorMap = new Map()

    /** @type {Map<string, string>} child → parent */
    this._parentMap = new Map()

    /** @type {number} internal color rotation index */
    this._colorIndex = 0
  }

  // ==================== Tag Colors ====================

  /**
   * 为标签分配颜色 (如已分配则直接返回)
   * @param {string} tag
   * @returns {string} hex color
   */
  assignColor(tag) {
    try {
      const key = String(tag || '').trim().toLowerCase()
      if (!key) return COLOR_PALETTE[0]
      if (this._colorMap.has(key)) return this._colorMap.get(key)
      const color = COLOR_PALETTE[this._colorIndex % COLOR_PALETTE.length]
      this._colorIndex++
      this._colorMap.set(key, color)
      return color
    } catch {
      return COLOR_PALETTE[0]
    }
  }

  /**
   * 获取标签颜色 (如未分配则自动分配)
   * @param {string} tag
   * @returns {string} hex color
   */
  getColor(tag) {
    try {
      const key = String(tag || '').trim().toLowerCase()
      if (!key) return COLOR_PALETTE[0]
      if (this._colorMap.has(key)) return this._colorMap.get(key)
      return this.assignColor(key)
    } catch {
      return COLOR_PALETTE[0]
    }
  }

  // ==================== Tag Hierarchy ====================

  /**
   * 设置标签父子关系
   * @param {string} child
   * @param {string} parent
   */
  setParent(child, parent) {
    try {
      const c = String(child || '').trim().toLowerCase()
      const p = String(parent || '').trim().toLowerCase()
      if (!c || !p) return
      if (c === p) return
      this._parentMap.set(c, p)
    } catch { /* ignore */ }
  }

  /**
   * 获取标签的直接子标签
   * @param {string} tag
   * @returns {string[]}
   */
  getChildren(tag) {
    try {
      const key = String(tag || '').trim().toLowerCase()
      if (!key) return []
      const children = []
      for (const [child, parent] of this._parentMap) {
        if (parent === key) children.push(child)
      }
      return children
    } catch {
      return []
    }
  }

  /**
   * 获取标签的所有祖先链 (从父到最顶层)
   * @param {string} tag
   * @returns {string[]}
   */
  getAncestors(tag) {
    try {
      const key = String(tag || '').trim().toLowerCase()
      if (!key) return []
      const ancestors = []
      let current = key
      const visited = new Set()
      while (this._parentMap.has(current) && !visited.has(current)) {
        visited.add(current)
        const parent = this._parentMap.get(current)
        ancestors.push(parent)
        current = parent
      }
      return ancestors
    } catch {
      return []
    }
  }

  // ==================== Tag Statistics ====================

  /**
   * 获取标签统计信息
   * @returns {{ count: Object<string, number>, top: string[], coOccurrence: Array<{tagA:string, tagB:string, count:number}> }}
   */
  getTagStats() {
    try {
      const count = {}
      // count per tag
      for (const bm of this.bookmarks) {
        for (const tag of bm.tags || []) {
          const key = String(tag).trim().toLowerCase()
          count[key] = (count[key] || 0) + 1
        }
      }

      // top tags sorted desc by count
      const top = Object.entries(count)
        .sort((a, b) => b[1] - a[1])
        .map(([t]) => t)

      // co-occurrence
      const coMap = new Map()
      for (const bm of this.bookmarks) {
        const tags = (bm.tags || []).map(t => String(t).trim().toLowerCase()).sort()
        for (let i = 0; i < tags.length; i++) {
          for (let j = i + 1; j < tags.length; j++) {
            const key = `${tags[i]}|${tags[j]}`
            coMap.set(key, (coMap.get(key) || 0) + 1)
          }
        }
      }
      const coOccurrence = []
      for (const [key, cnt] of coMap) {
        const [tagA, tagB] = key.split('|')
        coOccurrence.push({ tagA, tagB, count: cnt })
      }
      coOccurrence.sort((a, b) => b.count - a.count)

      return { count, top, coOccurrence }
    } catch {
      return { count: {}, top: [], coOccurrence: [] }
    }
  }

  // ==================== Auto-tagging ====================

  /**
   * 根据书签的 title + url 自动推荐标签
   * @param {{ title?: string, url?: string }} bookmark
   * @returns {string[]} 建议标签列表 (去重)
   */
  autoTag(bookmark) {
    try {
      const title = String((bookmark && bookmark.title) || '').toLowerCase()
      const url = String((bookmark && bookmark.url) || '').toLowerCase()
      const combined = `${title} ${url}`
      const tags = new Set()

      // 1) keyword matching from title + url
      for (const [keyword, tag] of KEYWORD_TAG_MAP) {
        if (keyword.includes(' ')) {
          // multi-word keyword: plain substring check
          if (combined.includes(keyword)) tags.add(tag)
        } else {
          // single-word: word boundary check via regex
          const re = new RegExp(`(?:^|[\\s/_.-])${escapeRegex(keyword)}(?:$|[\\s/_.-])`, 'i')
          if (re.test(combined)) tags.add(tag)
        }
      }

      // 2) domain matching
      try {
        const hostname = new URL(bookmark && bookmark.url ? bookmark.url : 'https://').hostname.replace(/^www\./, '')
        if (DOMAIN_TAG_MAP.has(hostname)) {
          tags.add(DOMAIN_TAG_MAP.get(hostname))
        }
      } catch { /* invalid url */ }

      return [...tags]
    } catch {
      return []
    }
  }

  // ==================== Static helpers ====================

  /**
   * 获取色盘
   * @returns {string[]}
   */
  static getPalette() {
    return [...COLOR_PALETTE]
  }
}

// ==================== 内部工具 ====================

/**
 * 转义正则特殊字符
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
