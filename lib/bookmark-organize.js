/**
 * BookmarkOrganize — 书签组织模块
 * 合并: clusterer, folder-analyzer, dedup, tag-editor
 */

// ==================== BookmarkClusterer ====================

const BUILTIN_CATEGORIES = [
  {
    name: '前端',
    keywords: [
      'react', 'vue', 'vuejs', 'angular', 'svelte', 'nextjs', 'next.js', 'nuxt',
      'css', 'scss', 'sass', 'tailwind', 'styled-components', 'html', 'dom',
      'javascript', 'typescript', 'ecmascript', 'babel', 'webpack', 'vite', 'rollup',
      'esbuild', 'parcel', 'esbuild',
      '响应式', '前端', '组件', '样式', '布局', '浏览器', '页面渲染',
    ],
    domains: [
      'react.dev', 'reactjs.org', 'vuejs.org', 'angular.io', 'angular.dev',
      'svelte.dev', 'nextjs.org', 'nuxt.com', 'css-tricks.com', 'tailwindcss.com',
      'developer.mozilla.org', 'web.dev', 'caniuse.com', 'w3schools.com',
      'styled-components.com', 'vitejs.dev',
    ],
  },
  {
    name: '后端',
    keywords: [
      'node', 'nodejs', 'python', 'java', 'golang', 'go语言', 'rust', 'php',
      'spring', 'django', 'flask', 'express', 'fastapi', 'nestjs', 'koa', 'gin',
      'ruby', 'rails', 'laravel', 'asp.net',
      '后端', '服务器', 'api开发', '微服务',
    ],
    domains: [
      'nodejs.org', 'spring.io', 'djangoproject.com', 'flask.palletsprojects.com',
      'fastapi.tiangolo.com', 'rubyonrails.org', 'laravel.com', 'expressjs.com',
      'nestjs.com', 'golang.org', 'go.dev', 'rust-lang.org',
    ],
  },
  {
    name: '数据库',
    keywords: [
      'mysql', 'postgres', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
      'sqlite', 'mariadb', 'cassandra', 'dynamodb', 'couchdb', 'neo4j',
      'sql', 'nosql', 'orm', 'prisma', 'sequelize', 'typeorm', 'mongoose',
      '数据库', '数据存储', '索引优化', '查询优化',
    ],
    domains: [
      'mysql.com', 'postgresql.org', 'mongodb.com', 'redis.io', 'elastic.co',
      'sqlite.org', 'mariadb.org', 'prisma.io', 'neo4j.com',
    ],
  },
  {
    name: 'DevOps',
    keywords: [
      'docker', 'kubernetes', 'k8s', 'ci/cd', 'cicd', 'jenkins', 'github actions',
      'gitlab ci', 'terraform', 'ansible', 'puppet', 'chef', 'prometheus', 'grafana',
      'nginx', 'apache', 'caddy', 'helm', 'istio',
      'devops', '部署', '持续集成', '持续交付', '容器化', '编排',
    ],
    domains: [
      'docker.com', 'kubernetes.io', 'jenkins.io', 'terraform.io',
      'ansible.com', 'prometheus.io', 'grafana.com', 'nginx.org',
    ],
  },
  {
    name: 'AI/ML',
    keywords: [
      'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'nlp',
      'natural language', 'computer vision', 'neural network', 'gpt', 'llm',
      'transformer', 'bert', 'openai', 'chatgpt', 'langchain', 'huggingface',
      'stable diffusion', 'midjourney', 'diffusion', 'embedding', 'fine-tune',
      '人工智能', '机器学习', '深度学习', '神经网络', '大模型', '大语言模型',
      '自然语言处理', '计算机视觉', '强化学习', '模型训练',
    ],
    domains: [
      'tensorflow.org', 'pytorch.org', 'openai.com', 'huggingface.co',
      'anthropic.com', 'deepmind.com', 'wandb.ai', 'kaggle.com',
      'paperswithcode.com', 'arxiv.org',
    ],
  },
  {
    name: '移动开发',
    keywords: [
      'android', 'ios', 'react native', 'flutter', 'swift', 'kotlin',
      'xamarin', 'ionic', 'capacitor', 'expo', 'cocoapods',
      '移动开发', '移动应用', 'app开发', '小程序',
    ],
    domains: [
      'developer.android.com', 'developer.apple.com', 'flutter.dev',
      'reactnative.dev', 'kotlinlang.org', 'swift.org', 'expo.dev',
    ],
  },
  {
    name: '安全',
    keywords: [
      'security', 'authentication', 'authorization', 'encryption', 'oauth',
      'jwt', 'ssl', 'tls', 'https', 'cors', 'csrf', 'xss', 'sql injection',
      'owasp', 'penetration', 'vulnerability', 'firewall', 'zero-trust',
      '安全', '认证', '授权', '加密', '漏洞', '渗透测试',
    ],
    domains: [
      'owasp.org', 'letsencrypt.org', 'auth0.com', 'okta.com',
      'security.google.com',
    ],
  },
  {
    name: '云服务',
    keywords: [
      'aws', 'amazon web services', 'azure', 'gcp', 'google cloud',
      'cloud', 'serverless', 'lambda', 's3', 'ec2', 'cloudflare',
      'vercel', 'netlify', 'heroku', 'digitalocean', 'cloud functions',
      '云服务', '云计算', '云原生', '无服务器',
    ],
    domains: [
      'aws.amazon.com', 'azure.microsoft.com', 'cloud.google.com',
      'cloudflare.com', 'vercel.com', 'netlify.com', 'heroku.com',
      'digitalocean.com',
    ],
  },
  {
    name: '数据',
    keywords: [
      'data', 'analytics', 'visualization', 'd3', 'chart', 'tableau',
      'power bi', 'data pipeline', 'etl', 'spark', 'hadoop', 'kafka',
      'airflow', 'data warehouse', 'bigquery', 'pandas', 'numpy',
      '数据', '数据分析', '数据可视化', '数据管道', '大数据',
    ],
    domains: [
      'd3js.org', 'tableau.com', 'powerbi.microsoft.com',
      'kafka.apache.org', 'spark.apache.org', 'pandas.pydata.org',
      'numpy.org',
    ],
  },
  {
    name: '测试',
    keywords: [
      'testing', 'jest', 'cypress', 'playwright', 'selenium', 'mocha',
      'chai', 'vitest', 'unit test', 'integration test', 'e2e',
      'test driven', 'tdd', 'bdd', 'code coverage', 'snapshot',
      '测试', '单元测试', '集成测试', '端到端测试', '自动化测试',
    ],
    domains: [
      'jestjs.io', 'cypress.io', 'playwright.dev', 'selenium.dev',
      'vitest.dev', 'testing-library.com',
    ],
  },
  {
    name: '设计',
    keywords: [
      'design', 'ui', 'ux', 'figma', 'sketch', 'adobe xd', 'photoshop',
      'illustrator', 'prototype', 'wireframe', 'user experience', 'user interface',
      'design system', 'design token', '色彩', '排版',
      '设计', '用户体验', '交互设计', '视觉设计', '原型设计',
    ],
    domains: [
      'figma.com', 'sketch.com', 'adobe.com', 'behance.net',
      'dribbble.com',
    ],
  },
  {
    name: '工具',
    keywords: [
      'git', 'vscode', 'visual studio', 'npm', 'yarn', 'pnpm',
      'editor', 'ide', 'vim', 'neovim', 'emacs', 'intellij',
      'postman', 'insomnia', 'notion', 'obsidian', 'markdown',
      '工具', '编辑器', '开发工具', '效率',
    ],
    domains: [
      'github.com', 'gitlab.com', 'bitbucket.org', 'npmjs.com',
      'yarnpkg.com', 'code.visualstudio.com', 'vim.org',
      'postman.com', 'notion.so', 'obsidian.md',
    ],
  },
  {
    name: '架构',
    keywords: [
      'architecture', 'microservices', 'monolith', 'api', 'rest', 'graphql',
      'grpc', 'websocket', 'event-driven', 'cqrs', 'domain driven', 'ddd',
      'design pattern', 'singleton', 'factory', 'observer', 'mvc', 'mvvm',
      '架构', '微服务', '设计模式', '分布式', '中间件',
    ],
    domains: [
      'graphql.org', 'grpc.io', 'swagger.io', 'openapis.org',
    ],
  },
  {
    name: '性能',
    keywords: [
      'performance', 'optimization', 'caching', 'lazy loading', 'code splitting',
      'tree shaking', 'profiling', 'benchmark', 'memory leak', 'gc',
      'load testing', 'stress testing', 'cdn',
      '性能', '优化', '缓存', '懒加载', '加载速度', '性能监控',
    ],
    domains: [
      'webpagetest.org', 'pagespeed.web.dev', 'gtmetrix.com',
      'lighthouse',
    ],
  },
];

export class BookmarkClusterer {
  constructor(bookmarks) {
    this._bookmarks = Array.isArray(bookmarks) ? [...bookmarks] : [];
    this._assignments = new Map();
    this._autoAssignments = new Map();
    this._autoCluster();
  }

  cluster() {
    const result = new Map();
    const idMap = this._buildIdMap();
    for (const [cat, ids] of this._assignments) {
      const bookmarks = [];
      for (const id of ids) {
        const bm = idMap.get(id);
        if (bm) bookmarks.push(bm);
      }
      if (bookmarks.length > 0) {
        result.set(cat, bookmarks);
      }
    }
    return result;
  }

  getCategories() {
    const result = [];
    for (const cat of BUILTIN_CATEGORIES) {
      const ids = this._assignments.get(cat.name);
      const count = ids ? ids.size : 0;
      if (count > 0) {
        result.push({ name: cat.name, count, keywords: cat.keywords.slice(0, 10) });
      }
    }
    const otherIds = this._assignments.get('其他');
    if (otherIds && otherIds.size > 0) {
      result.push({ name: '其他', count: otherIds.size, keywords: [] });
    }
    return result;
  }

  moveBookmark(bookmarkId, fromCategory, toCategory) {
    const fromSet = this._assignments.get(fromCategory);
    if (!fromSet || !fromSet.has(bookmarkId)) return false;
    fromSet.delete(bookmarkId);
    if (fromSet.size === 0) this._assignments.delete(fromCategory);
    if (!this._assignments.has(toCategory)) {
      this._assignments.set(toCategory, new Set());
    }
    this._assignments.get(toCategory).add(bookmarkId);
    return true;
  }

  mergeCategories(cat1, cat2, mergedName) {
    const set1 = this._assignments.get(cat1);
    const set2 = this._assignments.get(cat2);
    if (!set1 && !set2) return false;
    const merged = new Set();
    if (set1) for (const id of set1) merged.add(id);
    if (set2) for (const id of set2) merged.add(id);
    this._assignments.delete(cat1);
    this._assignments.delete(cat2);
    this._assignments.set(mergedName, merged);
    return true;
  }

  getCategoryForBookmark(bookmarkId) {
    for (const [cat, ids] of this._assignments) {
      if (ids.has(bookmarkId)) return cat;
    }
    return null;
  }

  _buildIdMap() {
    const map = new Map();
    for (const bm of this._bookmarks) {
      map.set(String(bm.id), bm);
    }
    return map;
  }

  _autoCluster() {
    const scores = new Map();
    for (const bm of this._bookmarks) {
      const id = String(bm.id);
      const title = (bm.title || '').toLowerCase();
      const url = (bm.url || '').toLowerCase();
      const folder = (bm.folderPath || []).join(' ').toLowerCase();
      const tags = (bm.tags || []).join(' ').toLowerCase();
      const text = `${title} ${folder} ${tags}`;
      const catScores = new Map();
      for (const cat of BUILTIN_CATEGORIES) {
        let score = 0;
        for (const kw of cat.keywords) {
          const kwLower = kw.toLowerCase();
          if (text.includes(kwLower)) {
            score += 1;
          }
        }
        for (const domain of cat.domains) {
          if (url.includes(domain.toLowerCase())) {
            score += 3;
          }
        }
        if (score > 0) {
          catScores.set(cat.name, score);
        }
      }
      if (catScores.size > 0) {
        let bestCat = '';
        let bestScore = 0;
        for (const [cat, sc] of catScores) {
          if (sc > bestScore) {
            bestScore = sc;
            bestCat = cat;
          }
        }
        if (!this._assignments.has(bestCat)) {
          this._assignments.set(bestCat, new Set());
        }
        this._assignments.get(bestCat).add(id);
      } else {
        if (!this._assignments.has('其他')) {
          this._assignments.set('其他', new Set());
        }
        this._assignments.get('其他').add(id);
      }
    }
    for (const [cat, ids] of this._assignments) {
      this._autoAssignments.set(cat, new Set(ids));
    }
  }
}

// ==================== BookmarkFolderAnalyzer ====================

const QUALITY_THRESHOLDS = {
  EXCELLENT_MIN: 5,
  EXCELLENT_MAX: 30,
  UNDERUSED_MAX: 3,
  OVERCROWDED_MIN: 50,
};

const DEFAULT_OVERCROWDED = 50;
const DEFAULT_UNDERUSED = 3;

class BookmarkFolderAnalyzer {
  constructor(bookmarks = []) {
    this.bookmarks = Array.isArray(bookmarks) ? [...bookmarks] : [];
  }

  analyzeFolders() {
    const map = this._buildFolderMap();
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folderPath, count]) => ({
        path: folderPath,
        count,
        depth: this._calcDepth(folderPath),
        quality: this._assessQuality(count),
        suggestions: this._makeSuggestions(folderPath, count),
      }));
  }

  getEmptyFolders() {
    return this.analyzeFolders()
      .filter((f) => f.quality === 'empty')
      .map((f) => f.path);
  }

  getOvercrowdedFolders(threshold = DEFAULT_OVERCROWDED) {
    const map = this._buildFolderMap();
    return [...map.entries()]
      .filter(([, count]) => count > threshold)
      .map(([folderPath, count]) => ({ path: folderPath, count }))
      .sort((a, b) => b.count - a.count);
  }

  getUnderusedFolders(threshold = DEFAULT_UNDERUSED) {
    const map = this._buildFolderMap();
    return [...map.entries()]
      .filter(([, count]) => count > 0 && count < threshold)
      .map(([folderPath, count]) => ({ path: folderPath, count }))
      .sort((a, b) => a.count - b.count);
  }

  getFolderTree() {
    const map = this._buildFolderMap();
    const root = { name: 'root', children: new Map(), count: 0 };
    for (const [folderPath, count] of map.entries()) {
      const parts = folderPath.split('/').filter(Boolean);
      let node = root;
      for (const part of parts) {
        if (!node.children.has(part)) {
          node.children.set(part, { name: part, children: new Map(), count: 0 });
        }
        node = node.children.get(part);
      }
      node.count = count;
    }
    return this._serializeTree(root);
  }

  suggestReorganization() {
    const suggestions = [];
    const map = this._buildFolderMap();
    const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [folderPath, count] of entries) {
      if (count === 0) {
        suggestions.push({
          action: 'delete',
          source: folderPath,
          target: '',
          reason: `文件夹 "${folderPath}" 为空，建议删除`,
        });
      }
    }
    const underused = entries.filter(([, c]) => c > 0 && c < QUALITY_THRESHOLDS.UNDERUSED_MAX);
    for (const [folderPath, count] of underused) {
      const parent = this._parentPath(folderPath);
      const siblings = entries.filter(
        ([fp, c]) => this._parentPath(fp) === parent && fp !== folderPath && c > 0
      );
      const mergeTarget = siblings.length > 0
        ? siblings.sort((a, b) => a[1] - b[1])[0][0]
        : parent || '(root)';
      suggestions.push({
        action: 'merge',
        source: folderPath,
        target: mergeTarget,
        reason: `文件夹 "${folderPath}" 仅 ${count} 个书签，建议合并到 "${mergeTarget}"`,
      });
    }
    const overcrowded = entries.filter(([, c]) => c > QUALITY_THRESHOLDS.OVERCROWDED_MIN);
    for (const [folderPath, count] of overcrowded) {
      suggestions.push({
        action: 'split',
        source: folderPath,
        target: `${folderPath}/子分类`,
        reason: `文件夹 "${folderPath}" 有 ${count} 个书签，建议拆分为子文件夹`,
      });
    }
    return suggestions;
  }

  getMaxDepth() {
    const map = this._buildFolderMap();
    if (map.size === 0) return 0;
    let max = 0;
    for (const folderPath of map.keys()) {
      const d = this._calcDepth(folderPath);
      if (d > max) max = d;
    }
    return max;
  }

  _buildFolderMap() {
    const map = new Map();
    for (const bm of this.bookmarks) {
      const folders = Array.isArray(bm.folderPath) ? bm.folderPath : [];
      for (let i = 0; i <= folders.length; i++) {
        const sub = folders.slice(0, i).join('/');
        if (sub === '') continue;
        map.set(sub, (map.get(sub) || 0) + 1);
      }
    }
    return map;
  }

  _calcDepth(folderPath) {
    return folderPath.split('/').filter(Boolean).length;
  }

  _assessQuality(count) {
    if (count === 0) return 'empty';
    if (count < QUALITY_THRESHOLDS.UNDERUSED_MAX) return 'underused';
    if (count > QUALITY_THRESHOLDS.OVERCROWDED_MIN) return 'overcrowded';
    if (count >= QUALITY_THRESHOLDS.EXCELLENT_MIN && count <= QUALITY_THRESHOLDS.EXCELLENT_MAX) {
      return 'excellent';
    }
    return 'normal';
  }

  _makeSuggestions(folderPath, count) {
    const q = this._assessQuality(count);
    switch (q) {
      case 'empty':
        return ['建议删除空文件夹'];
      case 'underused':
        return ['书签过少，建议合并到同级文件夹'];
      case 'overcrowded':
        return ['书签过多，建议拆分为子文件夹'];
      case 'excellent':
        return ['书签数量适中，结构良好'];
      default:
        return [];
    }
  }

  _parentPath(folderPath) {
    const parts = folderPath.split('/').filter(Boolean);
    parts.pop();
    return parts.join('/');
  }

  _serializeTree(node) {
    const children = [];
    for (const child of node.children.values()) {
      children.push({
        name: child.name,
        children: this._serializeTree(child),
        count: child.count,
      });
    }
    return children;
  }
}

export { BookmarkFolderAnalyzer, QUALITY_THRESHOLDS };

// ==================== BookmarkDedup ====================

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'dclid', 'twclid',
  'mc_cid', 'mc_eid', 'ref', '_ga',
]);

export class BookmarkDedup {
  constructor(bookmarks = []) {
    this.bookmarks = [...bookmarks];
  }

  static normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let normalized = url.trim();
    normalized = normalized.replace(/^https?:\/\//i, '');
    normalized = normalized.replace(/^www\./i, '');
    const [rest, fragment] = normalized.split('#');
    const [pathPart, queryPart] = rest.split('?');
    let cleanQuery = '';
    if (queryPart) {
      const params = queryPart.split('&');
      const kept = params.filter((p) => {
        const key = p.split('=')[0].toLowerCase();
        return !TRACKING_PARAMS.has(key) && !key.startsWith('utm_');
      });
      if (kept.length > 0) {
        cleanQuery = '?' + kept.join('&');
      }
    }
    let result = pathPart.toLowerCase() + cleanQuery;
    if (fragment !== undefined) {
      result += '#' + fragment.toLowerCase();
    }
    if (result.length > 1) {
      result = result.replace(/\/+$/, '');
    }
    return result;
  }

  static titleSimilarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    if (a === b) return 1;
    const tokensA = BookmarkDedup._tokenize(a);
    const tokensB = BookmarkDedup._tokenize(b);
    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection++;
    }
    const union = tokensA.size + tokensB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  static _tokenize(text) {
    return new Set(
      text
        .toLowerCase()
        .split(/[\s,.;:!?\-_/\\|()[\]{}'"`~@#$%^&*+=<>]+/)
        .filter((t) => t.length > 0)
    );
  }

  findByExactUrl() {
    const groups = new Map();
    for (const bm of this.bookmarks) {
      const normalized = BookmarkDedup.normalizeUrl(bm.url);
      if (!normalized) continue;
      if (!groups.has(normalized)) {
        groups.set(normalized, []);
      }
      groups.get(normalized).push(bm);
    }
    return [...groups.values()].filter((g) => g.length > 1);
  }

  findBySimilarTitle(threshold = 0.7) {
    const n = this.bookmarks.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const rank = new Array(n).fill(0);
    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }
    function union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
      } else if (rank[ra] > rank[rb]) {
        parent[rb] = ra;
      } else {
        parent[rb] = ra;
        rank[ra]++;
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = BookmarkDedup.titleSimilarity(
          this.bookmarks[i].title,
          this.bookmarks[j].title
        );
        if (sim >= threshold) {
          union(i, j);
        }
      }
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(this.bookmarks[i]);
    }
    return [...groups.values()].filter((g) => g.length > 1);
  }

  findDuplicates() {
    const processed = new Set();
    const results = [];
    for (const group of this.findByExactUrl()) {
      const ids = group.map((b) => b.id);
      if (ids.some((id) => processed.has(id))) continue;
      const [original, ...duplicates] = group;
      results.push({
        original,
        duplicates,
        reason: `URL 完全匹配 (规范化: ${BookmarkDedup.normalizeUrl(original.url)})`,
      });
      ids.forEach((id) => processed.add(id));
    }
    for (const group of this.findBySimilarTitle()) {
      const unprocessed = group.filter((b) => !processed.has(b.id));
      if (unprocessed.length < 2) continue;
      const [original, ...duplicates] = unprocessed;
      results.push({
        original,
        duplicates,
        reason: `标题相似度 ≥ 0.7 ("${original.title}")`,
      });
      unprocessed.forEach((b) => processed.add(b.id));
    }
    return results;
  }

  suggestCleanup() {
    const suggestions = [];
    for (const dup of this.findDuplicates()) {
      const { original, duplicates, reason } = dup;
      for (const bm of duplicates) {
        const isUrlDup = reason.startsWith('URL');
        suggestions.push({
          action: isUrlDup ? 'remove' : 'merge',
          bookmarkId: bm.id,
          reason: isUrlDup
            ? `与 #${original.id} URL 重复，建议删除`
            : `与 #${original.id} 标题相似，建议合并`,
        });
      }
    }
    return suggestions;
  }

  batchRemove(bookmarkIds) {
    if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) return 0;
    const idSet = new Set(bookmarkIds.map(String));
    const before = this.bookmarks.length;
    this.bookmarks = this.bookmarks.filter((bm) => !idSet.has(String(bm.id)));
    return before - this.bookmarks.length;
  }
}

// ==================== BookmarkTagEditor ====================

export class BookmarkTagEditor {
  #bookmarks;
  #existingTags;

  constructor({ bookmarks = [], existingTags = [] } = {}) {
    this.#bookmarks = new Map();
    for (const bm of bookmarks) {
      this.#bookmarks.set(bm.id, {
        ...bm,
        tags: [...(bm.tags || [])].map((t) => BookmarkTagEditor.normalizeTag(t)).filter(Boolean),
      });
    }
    this.#existingTags = new Set();
    for (const t of existingTags) {
      const norm = BookmarkTagEditor.normalizeTag(t);
      if (norm) this.#existingTags.add(norm);
    }
    for (const bm of this.#bookmarks.values()) {
      for (const t of bm.tags) {
        this.#existingTags.add(t);
      }
    }
  }

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

  getTags(bookmarkId) {
    const bm = this.#bookmarks.get(bookmarkId);
    return bm ? [...bm.tags] : [];
  }

  getAllTags() {
    return [...this.#existingTags].sort();
  }

  addTag(bookmarkId, tag) {
    const bm = this.#bookmarks.get(bookmarkId);
    if (!bm) return false;
    const norm = BookmarkTagEditor.normalizeTag(tag);
    if (!norm) return false;
    if (bm.tags.includes(norm)) return false;
    bm.tags.push(norm);
    this.#existingTags.add(norm);
    return true;
  }

  removeTag(bookmarkId, tag) {
    const bm = this.#bookmarks.get(bookmarkId);
    if (!bm) return false;
    const norm = BookmarkTagEditor.normalizeTag(tag);
    const idx = bm.tags.indexOf(norm);
    if (idx === -1) return false;
    bm.tags.splice(idx, 1);
    return true;
  }

  setTags(bookmarkId, tags) {
    const bm = this.#bookmarks.get(bookmarkId);
    if (!bm) return;
    const normalized = tags
      .map((t) => BookmarkTagEditor.normalizeTag(t))
      .filter(Boolean);
    bm.tags = [...new Set(normalized)];
    for (const t of bm.tags) {
      this.#existingTags.add(t);
    }
  }

  getAutocomplete(partial, limit = 10) {
    if (typeof partial !== 'string' || !partial.trim()) return [];
    const prefix = BookmarkTagEditor.normalizeTag(partial);
    if (!prefix) return [];
    const results = [];
    for (const tag of this.#existingTags) {
      if (tag.startsWith(prefix)) {
        results.push(tag);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  batchAddTag(bookmarkIds, tag) {
    let count = 0;
    for (const id of bookmarkIds) {
      if (this.addTag(id, tag)) count++;
    }
    return count;
  }

  batchRemoveTag(bookmarkIds, tag) {
    let count = 0;
    for (const id of bookmarkIds) {
      if (this.removeTag(id, tag)) count++;
    }
    return count;
  }
}
