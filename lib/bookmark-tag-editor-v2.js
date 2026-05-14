/**
 * BookmarkTagEditorV2 — 书签标签编辑器增强版
 *
 * 在 BookmarkTagEditor 基础上扩展:
 *   - batchAddTags(bookmarkIds, tags) — 批量为多个书签添加多个标签
 *   - batchRemoveTags(bookmarkIds, tags) — 批量删除多个标签
 *   - mergeTags(oldTag, newTag) — 合并两个标签（全局替换 + 去重）
 *   - getTagSuggestions(bookmark) — 基于内容/URL 智能推荐标签
 *   - getUnusedTags() — 查找未被任何书签使用的标签
 *   - getTagCooccurrence() — 分析标签共现关系
 *
 * @module lib/bookmark-tag-editor-v2
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} tags
 */

/**
 * @typedef {Object} CooccurrenceResult
 * @property {string}   tagA
 * @property {string}   tagB
 * @property {number}   count — 同时出现的书签数
 */

// ==================== 常量 ====================

/**
 * 技术关键词 — 用于智能标签推荐
 */
const TECH_KEYWORDS = new Set([
  'javascript', 'typescript', 'python', 'java', 'kotlin', 'swift', 'ruby',
  'go', 'golang', 'rust', 'c', 'cpp', 'csharp', 'php', 'perl', 'scala',
  'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'remix',
  'css', 'scss', 'tailwind', 'bootstrap', 'sass',
  'node', 'nodejs', 'express', 'fastify', 'koa', 'nestjs', 'django',
  'flask', 'fastapi', 'spring', 'rails', 'laravel',
  'mysql', 'postgresql', 'sqlite', 'mongodb', 'redis', 'elasticsearch',
  'neo4j', 'dynamodb', 'supabase', 'prisma',
  'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins',
  'aws', 'azure', 'gcp', 'firebase', 'vercel', 'netlify', 'cloudflare', 'nginx',
  'tensorflow', 'pytorch', 'keras', 'openai', 'gpt', 'llm', 'chatgpt',
  'transformer', 'bert', 'huggingface', 'langchain', 'ollama',
  'flutter', 'react-native', 'expo', 'android', 'ios', 'swiftui',
  'jest', 'mocha', 'vitest', 'cypress', 'playwright', 'selenium', 'pytest',
  'webpack', 'vite', 'rollup', 'esbuild', 'parcel',
  'git', 'github', 'gitlab', 'jira', 'notion', 'figma',
  'graphql', 'rest', 'grpc', 'websocket', 'trpc', 'openapi',
  'oauth', 'jwt', 'cors', 'csrf', 'xss', 'https',
  'linux', 'bash', 'shell', 'vim', 'vscode', 'eslint', 'prettier',
  'markdown', 'json', 'yaml',
  'machine-learning', 'deep-learning', 'nlp', 'computer-vision',
  'data-science', 'data-analysis', 'data-visualization',
  'algorithm', 'leetcode', 'competitive-programming',
  'design-pattern', 'microservice', 'serverless', 'api',
  'tutorial', 'documentation', 'guide', 'cheatsheet', 'roadmap',
]);

/**
 * 域名 → 推荐标签映射
 */
const DOMAIN_TAG_MAP = {
  'github.com': 'github',
  'stackoverflow.com': 'stackoverflow',
  'medium.com': 'medium',
  'dev.to': 'dev',
  'reddit.com': 'reddit',
  'youtube.com': 'youtube',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'arxiv.org': 'arxiv',
  'leetcode.com': 'leetcode',
  'npmjs.com': 'npm',
  'npmjs.org': 'npm',
  'pypi.org': 'pypi',
  'docs.docker.com': 'docker',
  'kubernetes.io': 'kubernetes',
  'react.dev': 'react',
  'vuejs.org': 'vue',
  'angular.io': 'angular',
  'nextjs.org': 'nextjs',
  'svelte.dev': 'svelte',
  'typescriptlang.org': 'typescript',
  'python.org': 'python',
  'rust-lang.org': 'rust',
  'go.dev': 'go',
  'openai.com': 'openai',
  'anthropic.com': 'anthropic',
  'huggingface.co': 'huggingface',
  'vercel.com': 'vercel',
  'netlify.com': 'netlify',
  'cloud.google.com': 'gcp',
  'aws.amazon.com': 'aws',
  'portal.azure.com': 'azure',
  'firebase.google.com': 'firebase',
  'w3schools.com': 'w3schools',
  'developer.mozilla.org': 'mdn',
  'freecodecamp.org': 'freecodecamp',
};

// ==================== BookmarkTagEditorV2 ====================

export class BookmarkTagEditorV2 {
  /** @type {Map<string, Bookmark>} */
  #bookmarks;

  /** @type {Set<string>} — 全局已有标签库（含外部传入 + 书签内置） */
  #existingTags;

  /**
   * @param {{ bookmarks?: Bookmark[], existingTags?: string[] }} opts
   */
  constructor({ bookmarks = [], existingTags = [] } = {}) {
    // 建立 id → bookmark 映射（深拷贝 tags 避免污染）
    this.#bookmarks = new Map();
    for (const bm of bookmarks) {
      this.#bookmarks.set(String(bm.id), {
        ...bm,
        id: String(bm.id),
        title: bm.title || '',
        url: bm.url || '',
        tags: [...(bm.tags || [])].map(t => BookmarkTagEditorV2.normalizeTag(t)).filter(Boolean),
      });
    }

    // 合并已有标签库 + 书签内置标签
    this.#existingTags = new Set();
    for (const t of existingTags) {
      const norm = BookmarkTagEditorV2.normalizeTag(t);
      if (norm) this.#existingTags.add(norm);
    }
    for (const bm of this.#bookmarks.values()) {
      for (const t of bm.tags) {
        this.#existingTags.add(t);
      }
    }
  }

  // ==================== 静态方法 ====================

  /**
   * 标签规范化
   *  - 转小写
   *  - 去除首尾空格
   *  - 连续空格替换为单个连字符
   *  - 移除特殊字符（保留中文、字母、数字、连字符、下划线）
   *  - 最大长度 30 字符
   *
   * @param {string} tag
   * @returns {string}
   */
  static normalizeTag(tag) {
    if (typeof tag !== 'string') return '';
    let result = tag
      .toLowerCase()
      .trim()
      .replace(/\s{2,}/g, '-')
      .replace(/[^\p{L}\p{N}_\-]/gu, '')
      .slice(0, 30);
    return result;
  }

  // ==================== 查询 ====================

  /**
   * 获取指定书签的标签列表（副本）
   * @param {string} bookmarkId
   * @returns {string[]}
   */
  getTags(bookmarkId) {
    const bm = this.#bookmarks.get(String(bookmarkId));
    return bm ? [...bm.tags] : [];
  }

  /**
   * 获取全局去重排序标签
   * @returns {string[]}
   */
  getAllTags() {
    return [...this.#existingTags].sort();
  }

  /**
   * 获取书签对象（含 title/url/tags）
   * @param {string} bookmarkId
   * @returns {Bookmark|null}
   */
  getBookmark(bookmarkId) {
    const bm = this.#bookmarks.get(String(bookmarkId));
    return bm ? { ...bm, tags: [...bm.tags] } : null;
  }

  /**
   * 获取所有书签数量
   * @returns {number}
   */
  getBookmarkCount() {
    return this.#bookmarks.size;
  }

  // ==================== 批量标签操作 ====================

  /**
   * 批量为多个书签添加多个标签
   *
   * @param {string[]} bookmarkIds — 目标书签 ID 列表
   * @param {string[]} tags — 要添加的标签列表
   * @returns {{ totalAdded: number, details: Map<string, string[]> }} 每个书签实际新增的标签
   */
  batchAddTags(bookmarkIds, tags) {
    const totalAdded = { count: 0 };
    const details = new Map();

    const normalizedTags = (tags || [])
      .map(t => BookmarkTagEditorV2.normalizeTag(t))
      .filter(Boolean);

    for (const rawId of (bookmarkIds || [])) {
      const id = String(rawId);
      const bm = this.#bookmarks.get(id);
      if (!bm) continue;

      const added = [];
      for (const tag of normalizedTags) {
        if (!bm.tags.includes(tag)) {
          bm.tags.push(tag);
          this.#existingTags.add(tag);
          added.push(tag);
          totalAdded.count++;
        }
      }
      if (added.length > 0) {
        details.set(id, added);
      }
    }

    return { totalAdded: totalAdded.count, details };
  }

  /**
   * 批量为多个书签删除多个标签
   *
   * @param {string[]} bookmarkIds — 目标书签 ID 列表
   * @param {string[]} tags — 要删除的标签列表
   * @returns {{ totalRemoved: number, details: Map<string, string[]> }} 每个书签实际删除的标签
   */
  batchRemoveTags(bookmarkIds, tags) {
    const totalRemoved = { count: 0 };
    const details = new Map();

    const normalizedTags = (tags || [])
      .map(t => BookmarkTagEditorV2.normalizeTag(t))
      .filter(Boolean);

    for (const rawId of (bookmarkIds || [])) {
      const id = String(rawId);
      const bm = this.#bookmarks.get(id);
      if (!bm) continue;

      const removed = [];
      for (const tag of normalizedTags) {
        const idx = bm.tags.indexOf(tag);
        if (idx !== -1) {
          bm.tags.splice(idx, 1);
          removed.push(tag);
          totalRemoved.count++;
        }
      }
      if (removed.length > 0) {
        details.set(id, removed);
      }
    }

    return { totalRemoved: totalRemoved.count, details };
  }

  // ==================== 标签合并 ====================

  /**
   * 合并两个标签: 将所有书签中的 oldTag 替换为 newTag，然后去重
   *
   * @param {string} oldTag — 被合并的标签
   * @param {string} newTag — 保留的标签
   * @returns {{ affectedCount: number, affectedIds: string[] }} 受影响的书签数及 ID 列表
   */
  mergeTags(oldTag, newTag) {
    const oldNorm = BookmarkTagEditorV2.normalizeTag(oldTag);
    const newNorm = BookmarkTagEditorV2.normalizeTag(newTag);

    if (!oldNorm || !newNorm || oldNorm === newNorm) {
      return { affectedCount: 0, affectedIds: [] };
    }

    const affectedIds = [];

    for (const [id, bm] of this.#bookmarks) {
      const idx = bm.tags.indexOf(oldNorm);
      if (idx !== -1) {
        // 替换旧标签为新标签
        bm.tags.splice(idx, 1);

        // 如果新标签不存在则添加，避免重复
        if (!bm.tags.includes(newNorm)) {
          bm.tags.push(newNorm);
        }

        affectedIds.push(id);
      }
    }

    // 更新全局标签库
    this.#existingTags.delete(oldNorm);
    this.#existingTags.add(newNorm);

    // 检查旧标签是否还有任何书签在使用
    let stillUsed = false;
    for (const bm of this.#bookmarks.values()) {
      if (bm.tags.includes(oldNorm)) {
        stillUsed = true;
        break;
      }
    }
    if (!stillUsed) {
      this.#existingTags.delete(oldNorm);
    }

    return { affectedCount: affectedIds.length, affectedIds };
  }

  // ==================== 智能标签推荐 ====================

  /**
   * 基于书签内容/URL 智能推荐标签
   *
   * 策略:
   *   1. 域名标签: 已知域名 → 对应标签
   *   2. URL 路径标签: 有意义的路径段
   *   3. 标题关键词: 英文分词 + 技术关键词匹配
   *   4. 已有标签库匹配: 标题中出现的已有标签
   *
   * @param {Object} bookmark — { id?, title, url, tags? }
   * @param {number} [limit=5] — 最大推荐数
   * @returns {string[]} 推荐的标签（不含书签已有的标签）
   */
  getTagSuggestions(bookmark, limit = 5) {
    if (!bookmark || typeof bookmark !== 'object') return [];

    const title = (bookmark.title || '').toLowerCase();
    const url = (bookmark.url || '').toLowerCase();
    const existingBmTags = new Set(
      (bookmark.tags || []).map(t => BookmarkTagEditorV2.normalizeTag(t)).filter(Boolean)
    );

    const candidates = [];

    // 1. 域名标签
    const domainTag = this._extractDomainTag(bookmark.url);
    if (domainTag && !existingBmTags.has(domainTag)) {
      candidates.push(domainTag);
    }

    // 2. URL 路径标签
    const pathTags = this._extractPathTags(bookmark.url);
    for (const pt of pathTags) {
      if (!existingBmTags.has(pt) && pt.length >= 2) {
        candidates.push(pt);
      }
    }

    // 3. 技术关键词匹配（标题 + URL）
    const combined = `${title} ${url}`;
    for (const kw of TECH_KEYWORDS) {
      const regex = new RegExp(`(?:^|[\\s_\\-/\\.])${this._escapeRegex(kw)}(?:$|[\\s_\\-/\\.])`, 'i');
      if (regex.test(combined) && !existingBmTags.has(kw)) {
        candidates.push(kw);
      }
    }

    // 4. 已有标签库中的标签出现在标题里
    for (const tag of this.#existingTags) {
      if (tag.length >= 3 && title.includes(tag) && !existingBmTags.has(tag)) {
        candidates.push(tag);
      }
    }

    // 去重 + 优先级排序
    return this._prioritizeSuggestionCandidates(candidates, limit);
  }

  // ==================== 未使用标签检测 ====================

  /**
   * 查找全局标签库中未被任何书签使用的标签
   *
   * @returns {string[]} 未使用的标签列表（排序）
   */
  getUnusedTags() {
    const usedTags = new Set();
    for (const bm of this.#bookmarks.values()) {
      for (const t of bm.tags) {
        usedTags.add(t);
      }
    }

    const unused = [];
    for (const tag of this.#existingTags) {
      if (!usedTags.has(tag)) {
        unused.push(tag);
      }
    }

    return unused.sort();
  }

  // ==================== 标签共现分析 ====================

  /**
   * 分析标签共现关系 — 找出经常一起出现的标签对
   *
   * @param {number} [minCount=2] — 最小共现次数（低于此值不返回）
   * @returns {CooccurrenceResult[]} 按共现次数降序排列的标签对
   */
  getTagCooccurrence(minCount = 2) {
    const pairMap = new Map(); // "tagA|tagB" → count

    for (const bm of this.#bookmarks.values()) {
      const sorted = [...bm.tags].sort();
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const key = `${sorted[i]}|${sorted[j]}`;
          pairMap.set(key, (pairMap.get(key) || 0) + 1);
        }
      }
    }

    const results = [];
    for (const [key, count] of pairMap) {
      if (count >= minCount) {
        const [tagA, tagB] = key.split('|');
        results.push({ tagA, tagB, count });
      }
    }

    results.sort((a, b) => b.count - a.count);
    return results;
  }

  // ==================== 内部辅助方法 ====================

  /**
   * 从 URL 提取域名标签
   * @param {string} url
   * @returns {string|null}
   * @private
   */
  _extractDomainTag(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

      // 优先匹配已知域名
      for (const [domain, tag] of Object.entries(DOMAIN_TAG_MAP)) {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          return tag;
        }
      }

      // 取主域名
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const main = parts[parts.length - 2];
        if (main && main.length >= 2 && !['com', 'org', 'net', 'io', 'dev', 'app', 'co'].includes(main)) {
          return main;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 从 URL 路径提取标签
   * @param {string} url
   * @returns {string[]}
   * @private
   */
  _extractPathTags(url) {
    if (!url || typeof url !== 'string') return [];
    try {
      const parsed = new URL(url);
      return parsed.pathname
        .split('/')
        .filter(s => s.length > 1 && s.length <= 20)
        .map(s => s.toLowerCase().replace(/\.(html?|php|asp|aspx|jsp)$/i, ''))
        .filter(s => s.length >= 2 && !/^\d+$/.test(s))
        .slice(0, 3);
    } catch {
      return [];
    }
  }

  /**
   * 标签推荐候选排序 — 技术关键词优先
   * @param {string[]} candidates
   * @param {number} limit
   * @returns {string[]}
   * @private
   */
  _prioritizeSuggestionCandidates(candidates, limit) {
    // 去重
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
      const norm = BookmarkTagEditorV2.normalizeTag(c);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        unique.push(norm);
      }
    }

    // 优先级: 技术关键词(0) > 域名映射(1) > 已有标签库(2) > 其他(3)
    const priority = (tag) => {
      if (TECH_KEYWORDS.has(tag)) return 0;
      if (Object.values(DOMAIN_TAG_MAP).includes(tag)) return 1;
      if (this.#existingTags.has(tag)) return 2;
      return 3;
    };

    unique.sort((a, b) => priority(a) - priority(b));
    return unique.slice(0, limit);
  }

  /**
   * 正则转义
   * @param {string} str
   * @returns {string}
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
