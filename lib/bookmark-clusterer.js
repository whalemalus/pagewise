/**
 * BookmarkClusterer — 主题聚类引擎
 *
 * 基于关键词/URL模式自动分类书签到技术领域，支持:
 *   - 15+ 技术领域分类（前端/后端/DevOps/AI/数据库等）
 *   - 每个领域定义关键词集合和域名映射规则
 *   - 聚类结果可手动调整 (moveBookmark / mergeCategories)
 *   - 各领域书签数量分布统计
 *
 * 纯规则引擎，不依赖外部 API，支持中文关键词。
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 */

// ==================== 内置领域分类规则 ====================

/**
 * 每个领域的匹配规则:
 *   keywords — 标题/文件夹/tag 中出现任一关键词即命中
 *   domains  — URL 域名包含任一片段即命中
 *
 * 命中权重: keyword=1, domain=3（域名更可信）
 */
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

// ==================== BookmarkClusterer ====================

export class BookmarkClusterer {
  /**
   * @param {Bookmark[]} bookmarks — 书签数组
   */
  constructor(bookmarks) {
    /** @type {Bookmark[]} */
    this._bookmarks = Array.isArray(bookmarks) ? [...bookmarks] : [];
    /** @type {Map<string, Set<string>>} category → bookmarkId set */
    this._assignments = new Map();
    /** @type {Map<string, Set<string>>} 原始自动聚类结果（用于 moveBookmark 校验） */
    this._autoAssignments = new Map();

    // 执行自动聚类
    this._autoCluster();
  }

  // ─── 公共 API ──────────────────────────────────────────────────────────

  /**
   * 执行聚类，返回 Map<category, Bookmark[]>
   * @returns {Map<string, Bookmark[]>}
   */
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

  /**
   * 获取所有分类概览
   * @returns {{ name: string, count: number, keywords: string[] }[]}
   */
  getCategories() {
    const result = [];
    for (const cat of BUILTIN_CATEGORIES) {
      const ids = this._assignments.get(cat.name);
      const count = ids ? ids.size : 0;
      if (count > 0) {
        result.push({ name: cat.name, count, keywords: cat.keywords.slice(0, 10) });
      }
    }
    // 包含"其他"（如果有）
    const otherIds = this._assignments.get('其他');
    if (otherIds && otherIds.size > 0) {
      result.push({ name: '其他', count: otherIds.size, keywords: [] });
    }
    return result;
  }

  /**
   * 将书签从一个分类移到另一个
   * @param {string} bookmarkId
   * @param {string} fromCategory
   * @param {string} toCategory
   * @returns {boolean}
   */
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

  /**
   * 合并两个分类
   * @param {string} cat1
   * @param {string} cat2
   * @param {string} mergedName — 合并后的分类名称
   * @returns {boolean}
   */
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

  /**
   * 查询某个书签所属分类
   * @param {string} bookmarkId
   * @returns {string | null}
   */
  getCategoryForBookmark(bookmarkId) {
    for (const [cat, ids] of this._assignments) {
      if (ids.has(bookmarkId)) return cat;
    }
    return null;
  }

  // ─── 内部方法 ──────────────────────────────────────────────────────────

  /** @private */
  _buildIdMap() {
    /** @type {Map<string, Bookmark>} */
    const map = new Map();
    for (const bm of this._bookmarks) {
      map.set(String(bm.id), bm);
    }
    return map;
  }

  /** @private 自动聚类入口 */
  _autoCluster() {
    /** @type {Map<string, number[]>} category → scores */
    const scores = new Map();

    for (const bm of this._bookmarks) {
      const id = String(bm.id);
      const title = (bm.title || '').toLowerCase();
      const url = (bm.url || '').toLowerCase();
      const folder = (bm.folderPath || []).join(' ').toLowerCase();
      const tags = (bm.tags || []).join(' ').toLowerCase();
      const text = `${title} ${folder} ${tags}`;

      /** @type {Map<string, number>} category → score for this bookmark */
      const catScores = new Map();

      for (const cat of BUILTIN_CATEGORIES) {
        let score = 0;

        // 关键词匹配
        for (const kw of cat.keywords) {
          const kwLower = kw.toLowerCase();
          if (text.includes(kwLower)) {
            score += 1;
          }
        }

        // 域名匹配（权重更高）
        for (const domain of cat.domains) {
          if (url.includes(domain.toLowerCase())) {
            score += 3;
          }
        }

        if (score > 0) {
          catScores.set(cat.name, score);
        }
      }

      // 选择得分最高的分类
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
        // 未匹配任何规则 → "其他"
        if (!this._assignments.has('其他')) {
          this._assignments.set('其他', new Set());
        }
        this._assignments.get('其他').add(id);
      }
    }

    // 保存自动聚类快照
    for (const [cat, ids] of this._assignments) {
      this._autoAssignments.set(cat, new Set(ids));
    }
  }
}
