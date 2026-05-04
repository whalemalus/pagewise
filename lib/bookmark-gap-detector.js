/**
 * BookmarkGapDetector — 知识盲区检测
 *
 * 分析用户书签在各技术领域的覆盖度，识别知识盲区和薄弱环节，
 * 并基于领域关联性推荐补充方向。
 *
 * 覆盖度等级:
 *   - 充分 (well-covered): 书签数 >= 10
 *   - 一般 (moderate):     书签数 3-9
 *   - 不足 (weak):         书签数 1-2
 *   - 盲区 (gap):          书签数 0
 *
 * 推荐逻辑:
 *   - 盲区领域: 推荐入门主题
 *   - 弱项领域: 推荐进阶主题
 *   - 考虑关联领域（学前端建议也学 CSS/设计）
 *
 * 纯前端实现，不依赖外部 API。
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 */

// ==================== 领域定义 ====================

/** 领域目录 — 所有可分析的技术领域及其关联 */
const DOMAIN_CATALOG = [
  {
    name: '前端',
    relatedDomains: ['设计', '测试', '性能'],
    entryTopics: ['HTML/CSS 基础', 'JavaScript 入门', '响应式布局', 'DOM 操作'],
    advancedTopics: ['React/Vue 框架深入', '前端工程化', '微前端架构', 'SSR/SSG'],
  },
  {
    name: '后端',
    relatedDomains: ['数据库', '安全', '架构'],
    entryTopics: ['Node.js 入门', 'REST API 设计', 'Express 快速上手', 'Python Flask 基础'],
    advancedTopics: ['微服务架构', 'gRPC 通信', '消息队列', '分布式系统'],
  },
  {
    name: '数据库',
    relatedDomains: ['后端', '数据', '性能'],
    entryTopics: ['SQL 基础语法', 'MySQL 入门', 'Redis 快速上手', '数据库设计基础'],
    advancedTopics: ['索引优化', '分库分表', '分布式数据库', 'NoSQL 实践'],
  },
  {
    name: 'DevOps',
    relatedDomains: ['云服务', '安全', '工具'],
    entryTopics: ['Docker 入门', 'Linux 基础命令', 'CI/CD 概念', 'Nginx 配置'],
    advancedTopics: ['Kubernetes 集群管理', 'Terraform IaC', '可观测性体系建设', 'GitOps'],
  },
  {
    name: 'AI/ML',
    relatedDomains: ['数据', '后端', '云服务'],
    entryTopics: ['Python 数据科学基础', '机器学习概览', 'ChatGPT Prompt 工程', 'TensorFlow 入门'],
    advancedTopics: ['LLM 微调实战', '模型部署与推理优化', '多模态模型', 'RAG 系统设计'],
  },
  {
    name: '移动开发',
    relatedDomains: ['前端', '设计', '测试'],
    entryTopics: ['Flutter 快速上手', 'React Native 入门', 'iOS 开发基础', 'Android 基础'],
    advancedTopics: ['原生性能优化', '跨平台状态管理', '移动 CI/CD', 'App 架构设计'],
  },
  {
    name: '安全',
    relatedDomains: ['后端', 'DevOps', '云服务'],
    entryTopics: ['HTTPS 原理', 'OAuth 2.0 入门', 'XSS/CSRF 防护', '密码学基础'],
    advancedTopics: ['渗透测试实战', '零信任架构', '安全审计', '威胁建模'],
  },
  {
    name: '云服务',
    relatedDomains: ['DevOps', '后端', '安全'],
    entryTopics: ['AWS/GCP 基础服务', 'Serverless 入门', 'CDN 原理', '对象存储'],
    advancedTopics: ['多云架构', '云原生应用设计', '成本优化', '灾备方案'],
  },
  {
    name: '数据',
    relatedDomains: ['数据库', 'AI/ML', '工具'],
    entryTopics: ['Pandas 数据处理', '数据可视化入门', 'SQL 数据分析', 'ETL 基础概念'],
    advancedTopics: ['实时数据管道', '数据湖架构', 'Spark 分布式计算', '数据治理'],
  },
  {
    name: '测试',
    relatedDomains: ['前端', '后端', '工具'],
    entryTopics: ['Jest 单元测试入门', '测试驱动开发 TDD', 'E2E 测试概念', '代码覆盖率'],
    advancedTopics: ['Playwright 高级用法', '性能测试', '混沌工程', '测试策略设计'],
  },
  {
    name: '设计',
    relatedDomains: ['前端', '移动开发'],
    entryTopics: ['Figma 基础操作', 'UI 设计原则', '色彩搭配', '排版基础'],
    advancedTopics: ['设计系统构建', '交互设计进阶', '动效设计', '无障碍设计'],
  },
  {
    name: '工具',
    relatedDomains: ['DevOps', '测试', '架构'],
    entryTopics: ['Git 基础操作', 'VS Code 技巧', 'npm 包管理', 'Markdown 写作'],
    advancedTopics: ['Git 高级工作流', 'Monorepo 管理', '自定义 CLI 开发', '编辑器插件开发'],
  },
  {
    name: '架构',
    relatedDomains: ['后端', 'DevOps', '云服务'],
    entryTopics: ['设计模式入门', 'RESTful 架构', 'MVC 架构', '客户端-服务器模型'],
    advancedTopics: ['领域驱动设计 DDD', '事件驱动架构', 'CQRS 模式', '微服务拆分策略'],
  },
  {
    name: '性能',
    relatedDomains: ['前端', '后端', '数据库'],
    entryTopics: ['Web 性能指标 Core Web Vitals', '浏览器渲染原理', '缓存策略', '代码分割'],
    advancedTopics: ['全链路性能优化', '负载测试与容量规划', '数据库查询优化', 'CDN 策略'],
  },
];

/** 领域名 → 领域配置 的快速索引 */
const DOMAIN_MAP = new Map(DOMAIN_CATALOG.map(d => [d.name, d]));

// ==================== 覆盖度等级阈值 ====================

const THRESHOLDS = {
  wellCovered: 10,  // >= 10
  moderate: 3,      // 3 - 9
  weak: 1,          // 1 - 2
  // 0 → gap
};

// ==================== 主类 ====================

class BookmarkGapDetector {
  /**
   * @param {Object} options
   * @param {Bookmark[]}               options.bookmarks - 用户书签列表
   * @param {Map<string, Bookmark[]>}  [options.clusters] - 聚类结果 (领域名 → 书签数组)
   * @param {Map<string, number>}      [options.tags] - 标签频率 (标签名 → 出现次数)
   */
  constructor({ bookmarks = [], clusters = new Map(), tags = new Map() } = {}) {
    this.bookmarks = bookmarks;
    this.clusters = clusters;
    this.tags = tags;

    // 建立所有领域名集合（聚类结果中的 + 目录中的）
    this.allDomains = new Set([
      ...DOMAIN_CATALOG.map(d => d.name),
      ...clusters.keys(),
    ]);
  }

  // ==================== 核心方法 ====================

  /**
   * 检测所有领域的知识盲区
   * @returns {{domain: string, coverage: string, gaps: string[], recommendations: string[]}[]}
   */
  detectGaps() {
    const result = [];
    for (const domainName of this.allDomains) {
      const count = this._countDomain(domainName);
      const level = this._coverageLevel(count);
      const domainConf = DOMAIN_MAP.get(domainName);

      const gaps = [];
      const recommendations = [];

      if (level === 'gap') {
        gaps.push(`${domainName} 领域完全没有书签，属于知识盲区`);
        if (domainConf) {
          recommendations.push(`建议从入门主题开始: ${domainConf.entryTopics.slice(0, 2).join('、')}`);
          // 关联领域
          for (const related of domainConf.relatedDomains) {
            const relatedCount = this._countDomain(related);
            if (relatedCount >= THRESHOLDS.moderate) {
              recommendations.push(`可借助已有 ${related} 知识，关联学习 ${domainName}`);
            }
          }
        }
      } else if (level === 'weak') {
        gaps.push(`${domainName} 领域仅有 ${count} 个书签，覆盖不足`);
        if (domainConf) {
          recommendations.push(`建议补充入门和进阶内容: ${domainConf.entryTopics[0]}、${domainConf.advancedTopics[0]}`);
        }
      }

      result.push({
        domain: domainName,
        coverage: level,
        gaps,
        recommendations,
      });
    }
    return result;
  }

  /**
   * 获取各领域的覆盖度分布
   * @returns {{domain: string, count: number, percentage: number, level: string}[]}
   */
  getDomainCoverage() {
    const totalBookmarks = this.bookmarks.length || 1; // 避免除零
    const result = [];
    for (const domainName of this.allDomains) {
      const count = this._countDomain(domainName);
      const percentage = Math.round((count / totalBookmarks) * 100);
      result.push({
        domain: domainName,
        count,
        percentage,
        level: this._coverageLevel(count),
      });
    }
    // 按书签数量降序
    result.sort((a, b) => b.count - a.count);
    return result;
  }

  /**
   * 获取知识补充推荐
   * @param {number} [limit=5] - 最多返回几条推荐
   * @returns {{domain: string, reason: string, suggestedTopics: string[]}[]}
   */
  getRecommendations(limit = 5) {
    const recs = [];
    for (const domainName of this.allDomains) {
      const count = this._countDomain(domainName);
      const level = this._coverageLevel(count);
      const domainConf = DOMAIN_MAP.get(domainName);
      if (!domainConf) continue;

      if (level === 'gap') {
        recs.push({
          domain: domainName,
          reason: `${domainName} 是知识盲区，完全缺少相关资料`,
          suggestedTopics: [...domainConf.entryTopics],
        });
      } else if (level === 'weak') {
        recs.push({
          domain: domainName,
          reason: `${domainName} 覆盖不足（仅 ${count} 个书签），需要补充`,
          suggestedTopics: [domainConf.entryTopics[0], ...domainConf.advancedTopics.slice(0, 2)],
        });
      }
    }

    // 盲区优先，然后弱项；同级别按数量升序
    recs.sort((a, b) => {
      const aCount = this._countDomain(a.domain);
      const bCount = this._countDomain(b.domain);
      return aCount - bCount; // 少的排前面
    });

    return recs.slice(0, limit);
  }

  /**
   * 获取强项领域（书签数 >= 10，按数量降序）
   * @returns {{domain: string, count: number}[]}
   */
  getStrengths() {
    return this._getDomainsByLevel('well-covered')
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 获取弱项领域（书签数 < 3，按数量升序）
   * @returns {{domain: string, count: number}[]}
   */
  getWeaknesses() {
    const weak = this._getDomainsByLevel('weak');
    const gap = this._getDomainsByLevel('gap');
    return [...gap, ...weak].sort((a, b) => a.count - b.count);
  }

  /**
   * 生成完整知识盲区报告
   * @returns {{summary: Object, strengths: Object[], weaknesses: Object[], recommendations: Object[]}}
   */
  generateReport() {
    const coverage = this.getDomainCoverage();
    const strengths = this.getStrengths();
    const weaknesses = this.getWeaknesses();
    const recommendations = this.getRecommendations();

    const wellCovered = coverage.filter(c => c.level === 'well-covered').length;
    const moderate = coverage.filter(c => c.level === 'moderate').length;
    const weak = coverage.filter(c => c.level === 'weak').length;
    const gap = coverage.filter(c => c.level === 'gap').length;

    const summary = {
      totalBookmarks: this.bookmarks.length,
      totalDomains: this.allDomains.size,
      wellCovered,
      moderate,
      weak,
      gap,
      coverageRatio: this.allDomains.size > 0
        ? Math.round(((wellCovered + moderate) / this.allDomains.size) * 100)
        : 0,
    };

    return { summary, strengths, weaknesses, recommendations };
  }

  // ==================== 内部辅助 ====================

  /**
   * 统计某个领域的书签数量
   * 优先使用聚类结果，若无聚类则按标签频率估算
   * @param {string} domain
   * @returns {number}
   * @private
   */
  _countDomain(domain) {
    // 方式1: 聚类结果中有直接数据
    if (this.clusters.has(domain)) {
      return this.clusters.get(domain).length;
    }
    // 方式2: 基于标签频率估算
    const domainLower = domain.toLowerCase();
    if (this.tags.has(domainLower)) {
      return this.tags.get(domainLower);
    }
    // 方式3: 也检查原始大小写
    if (this.tags.has(domain)) {
      return this.tags.get(domain);
    }
    return 0;
  }

  /**
   * 根据书签数量判断覆盖度等级
   * @param {number} count
   * @returns {string} 'well-covered' | 'moderate' | 'weak' | 'gap'
   * @private
   */
  _coverageLevel(count) {
    if (count >= THRESHOLDS.wellCovered) return 'well-covered';
    if (count >= THRESHOLDS.moderate) return 'moderate';
    if (count >= THRESHOLDS.weak) return 'weak';
    return 'gap';
  }

  /**
   * 获取指定等级的所有领域
   * @param {string} level
   * @returns {{domain: string, count: number}[]}
   * @private
   */
  _getDomainsByLevel(level) {
    const result = [];
    for (const domainName of this.allDomains) {
      const count = this._countDomain(domainName);
      if (this._coverageLevel(count) === level) {
        result.push({ domain: domainName, count });
      }
    }
    return result;
  }
}

export { BookmarkGapDetector, DOMAIN_CATALOG, THRESHOLDS };
