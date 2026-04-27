/**
 * Page Sense - 页面感知引擎
 *
 * 自动识别页面类型、提取结构化数据、发现可操作元素
 * 让 AI "理解" 当前在看什么
 */

export class PageSense {
  constructor() {
    this.analyzers = [];
    this.registerDefaultAnalyzers();
  }

  // ==================== 注册分析器 ====================

  register(analyzer) {
    this.analyzers.push(analyzer);
  }

  registerDefaultAnalyzers() {
    // API 文档页面
    this.register({
      id: 'api-doc',
      detect: (ctx) => {
        const url = (ctx.url || '').toLowerCase();
        const text = (ctx.content || '').toLowerCase();

        // URL 模式匹配
        const urlPatterns = ['/api/', '/docs/', '/reference/', '/swagger/', '/openapi/'];
        if (urlPatterns.some(p => url.includes(p))) return true;

        // Swagger UI 元素
        if (ctx.hasSwaggerUI) return true;

        // 页面内容特征：包含大量 HTTP 方法
        const httpMethods = ['get', 'post', 'put', 'delete', 'patch'];
        const methodCount = httpMethods.filter(m => {
          const regex = new RegExp('\\b' + m + '\\b', 'gi');
          return (text.match(regex) || []).length > 0;
        }).length;
        if (methodCount >= 3) return true;

        // 通用 API 文档关键词
        return text.includes('endpoint') || text.includes('request') || text.includes('response');
      },
      extract: (ctx) => ({
        type: 'api-doc',
        label: 'API 文档',
        icon: '📡',
        endpoints: this.extractEndpoints(ctx.content)
      })
    });

    // 代码仓库页面
    this.register({
      id: 'code-repo',
      detect: (ctx) => {
        return ctx.url?.includes('github.com') || ctx.url?.includes('gitlab.com')
          || ctx.url?.includes('gitee.com');
      },
      extract: (ctx) => ({
        type: 'code-repo',
        label: '代码仓库',
        icon: '📦',
        repo: this.extractRepoInfo(ctx.url),
        repoPageType: this.detectGitHubPageType(ctx.url)
      })
    });

    // GitHub 仓库页面（更精确的识别）
    this.register({
      id: 'github-repo',
      detect: (ctx) => {
        const url = ctx.url || '';
        return this.isGitHubRepoPage(url);
      },
      extract: (ctx) => {
        const url = ctx.url || '';
        const info = this.extractRepoInfo(url);
        const pageType = this.detectGitHubPageType(url);
        const typeLabels = {
          'repo-root': '仓库主页',
          'repo-file': '文件浏览',
          'repo-issues': 'Issue 列表',
          'repo-pr': 'Pull Requests',
          'repo-wiki': 'Wiki',
          'repo-releases': '发布版本'
        };
        return {
          type: 'github-repo',
          label: typeLabels[pageType] || 'GitHub 仓库',
          icon: '🐙',
          owner: info.owner,
          repo: info.repo,
          pageType,
          isRepoRoot: pageType === 'repo-root'
        };
      }
    });

    // Stack Overflow / 问答页面
    this.register({
      id: 'qa-page',
      detect: (ctx) => {
        return ctx.url?.includes('stackoverflow.com') || ctx.url?.includes('segmentfault.com')
          || ctx.url?.includes('zhihu.com/question');
      },
      extract: (ctx) => ({
        type: 'qa-page',
        label: '技术问答',
        icon: '💬'
      })
    });

    // 技术博客
    this.register({
      id: 'tech-blog',
      detect: (ctx) => {
        const url = ctx.url || '';
        return url.includes('medium.com') || url.includes('dev.to')
          || url.includes('juejin.cn') || url.includes('cnblogs.com')
          || url.includes('csdn.net') || url.includes('jianshu.com');
      },
      extract: (ctx) => ({
        type: 'tech-blog',
        label: '技术博客',
        icon: '📝'
      })
    });

    // YouTube 视频页面
    this.register({
      id: 'youtube',
      detect: (ctx) => {
        return ctx.url?.includes('youtube.com/watch');
      },
      extract: (ctx) => {
        const url = ctx.url || '';
        const videoIdMatch = url.match(/[?&]v=([^&]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : '';
        const title = ctx.title || '';
        const channelMatch = ctx.content?.match(/(?:频道|Channel)[:\s]*(.*?)(?:\n|$)/i);
        const channel = channelMatch ? channelMatch[1].trim() : '';
        return {
          type: 'youtube',
          label: 'YouTube 视频',
          icon: '📺',
          videoId,
          title,
          channel,
          hasSubtitles: ctx.subtitles != null
        };
      }
    });

    // 含代码的页面
    this.register({
      id: 'code-snippet',
      detect: (ctx) => {
        return (ctx.codeBlocks?.length || 0) >= 2;
      },
      extract: (ctx) => ({
        type: 'code-snippet',
        label: '代码片段',
        icon: '💻',
        languages: [...new Set(ctx.codeBlocks.map(b => b.lang).filter(Boolean))],
        blockCount: ctx.codeBlocks.length
      })
    });

    // 问题/错误页面
    this.register({
      id: 'error-page',
      detect: (ctx) => {
        const text = (ctx.content || '').toLowerCase();
        return text.includes('error') || text.includes('exception')
          || text.includes('traceback') || text.includes('bug');
      },
      extract: (ctx) => ({
        type: 'error-page',
        label: '错误/问题',
        icon: '🐛',
        errors: this.extractErrors(ctx.content)
      })
    });
  }

  // ==================== 核心方法 ====================

  /**
   * 分析页面，返回感知结果
   */
  analyze(pageContext) {
    const results = [];

    for (const analyzer of this.analyzers) {
      try {
        if (analyzer.detect(pageContext)) {
          results.push(analyzer.extract(pageContext));
        }
      } catch (e) {
        // 跳过失败的分析器
      }
    }

    return {
      types: results,
      primaryType: results[0] || { type: 'generic', label: '通用页面', icon: '📄' },
      summary: this.buildSummary(results, pageContext)
    };
  }

  /**
   * 生成页面感知的 prompt 片段
   */
  toPrompt(pageContext) {
    const analysis = this.analyze(pageContext);
    if (analysis.types.length === 0) return '';

    let prompt = `\n页面感知结果：\n`;
    analysis.types.forEach(t => {
      prompt += `- ${t.icon} ${t.label}`;
      if (t.languages) prompt += ` (语言: ${t.languages.join(', ')})`;
      if (t.endpoints) prompt += ` (${t.endpoints.length} 个端点)`;
      if (t.errors) prompt += ` (发现 ${t.errors.length} 个错误)`;
      if (t.type === 'youtube' && t.videoId) prompt += ` (视频ID: ${t.videoId})`;
      if (t.type === 'youtube' && t.channel) prompt += ` (频道: ${t.channel})`;
      if (t.type === 'github-repo') prompt += ` (${t.owner}/${t.repo}, ${t.pageType})`;
      prompt += '\n';
    });

    return prompt;
  }

  /**
   * 根据页面类型推荐技能
   */
  suggestSkills(pageContext, skillEngine) {
    const analysis = this.analyze(pageContext);
    const suggestions = [];

    for (const type of analysis.types) {
      switch (type.type) {
        case 'code-snippet':
          suggestions.push({ skillId: 'code-explain', reason: '页面包含代码，可以解释' });
          suggestions.push({ skillId: 'code-review', reason: '可以对代码进行审查' });
          break;
        case 'error-page':
          suggestions.push({ skillId: 'error-diagnose', reason: '发现错误信息，可以诊断' });
          break;
        case 'api-doc':
          suggestions.push({ skillId: 'api-summarize', reason: 'API 文档，可以生成摘要' });
          break;
        case 'youtube':
          suggestions.push({ skillId: 'video-summarize', reason: 'YouTube 视频，可以总结内容' });
          break;
        case 'github-repo':
          suggestions.push({ skillId: 'repo-analyze', reason: 'GitHub 仓库，可以分析仓库结构' });
          break;
      }
    }

    return suggestions;
  }

  // ==================== 提取器 ====================

  extractEndpoints(content) {
    if (!content) return [];
    const patterns = [
      /(GET|POST|PUT|DELETE|PATCH)\s+\/[\w\-/{}]+/gi,
      /`\/api\/[\w\-/{}]+`/gi
    ];
    const endpoints = [];
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      endpoints.push(...matches.slice(0, 10));
    }
    return [...new Set(endpoints)];
  }

  /**
   * 判断 URL 是否为 GitHub 仓库页面（精确匹配 owner/repo 格式）
   * @param {string} url
   * @returns {boolean}
   */
  isGitHubRepoPage(url) {
    if (!url) return false;
    // 匹配 github.com/{owner}/{repo} 模式，owner 和 repo 不含斜杠
    return /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url)
      || /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(issues|pull|wiki|releases|tree|blob|actions|projects|security|graphs|pulse|settings|commit|compare)(\/.*)?$/.test(url);
  }

  /**
   * 检测 GitHub 仓库页面的具体类型
   * @param {string} url
   * @returns {string} 页面类型: repo-root, repo-file, repo-issues, repo-pr, repo-wiki, repo-releases
   */
  detectGitHubPageType(url) {
    if (!url) return 'unknown';
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/(.*))?/);
    if (!match) return 'unknown';

    const path = match[3] || '';
    if (!path) return 'repo-root';

    const firstSegment = path.split('/')[0];
    switch (firstSegment) {
      case 'issues': return 'repo-issues';
      case 'pull': return 'repo-pr';
      case 'wiki': return 'repo-wiki';
      case 'releases': return 'repo-releases';
      case 'blob': return 'repo-file';
      case 'tree': return 'repo-file';
      default: return 'repo-file';
    }
  }

  extractRepoInfo(url) {
    if (!url) return {};
    const match = url.match(/(?:github\.com|gitlab\.com|gitee\.com)\/([^/]+)\/([^/?#]+)/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
    return {};
  }

  extractErrors(content) {
    if (!content) return [];
    const patterns = [
      /Error[:\s].{10,100}/gi,
      /Exception[:\s].{10,100}/gi,
      /Traceback \(most recent call last\)[\s\S]{10,500}/gi,
      /Uncaught .{10,100}/gi
    ];
    const errors = [];
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      errors.push(...matches.slice(0, 5));
    }
    return [...new Set(errors)];
  }

  buildSummary(types, ctx) {
    const labels = types.map(t => t.label).join('、');
    return `页面类型：${labels || '通用'}`;
  }
}
