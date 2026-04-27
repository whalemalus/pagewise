/**
 * 测试 lib/page-sense.js — 页面感知引擎
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// page-sense.js 不依赖 Chrome API，可直接导入
const { PageSense } = await import('../lib/page-sense.js');

let ps;

beforeEach(() => {
  ps = new PageSense();
});

// ==================== 初始化 ====================

describe('PageSense 初始化', () => {
  it('注册了默认分析器', () => {
    assert.ok(ps.analyzers.length > 0, '应有默认分析器');
  });

  it('可通过 register() 添加自定义分析器', () => {
    const count = ps.analyzers.length;
    ps.register({
      id: 'custom',
      detect: () => true,
      extract: () => ({ type: 'custom', label: '自定义', icon: '🔧' }),
    });
    assert.equal(ps.analyzers.length, count + 1);
  });
});

// ==================== 页面类型识别 ====================

describe('PageSense 页面类型识别', () => {
  it('识别 API 文档页面（URL 含 /api/）', () => {
    const result = ps.analyze({
      url: 'https://api.example.com/docs/users',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'api-doc'));
  });

  it('识别 API 文档页面（URL 含 /reference/）', () => {
    const result = ps.analyze({
      url: 'https://example.com/reference/users',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'api-doc'));
  });

  it('识别 API 文档页面（URL 含 /swagger/）', () => {
    const result = ps.analyze({
      url: 'https://example.com/swagger/ui',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'api-doc'));
  });

  it('识别 API 文档页面（URL 含 /openapi/）', () => {
    const result = ps.analyze({
      url: 'https://example.com/openapi/spec',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'api-doc'));
  });

  it('识别 API 文档页面（内容含 endpoint）', () => {
    const result = ps.analyze({
      url: 'https://example.com/page',
      content: 'This endpoint returns a list of users. Request body should include...',
    });
    assert.ok(result.types.some(t => t.type === 'api-doc'));
  });

  it('识别 API 文档页面（Swagger UI 标记）', () => {
    const result = ps.analyze({
      url: 'https://example.com/page',
      content: '',
      hasSwaggerUI: true,
    });
    assert.ok(result.types.some(t => t.type === 'api-doc'));
  });

  it('识别 API 文档页面（多种 HTTP 方法）', () => {
    const result = ps.analyze({
      url: 'https://example.com/page',
      content: 'GET /users POST /users PUT /users DELETE /users',
    });
    assert.ok(result.types.some(t => t.type === 'api-doc'));
  });

  it('识别 GitHub 仓库页面', () => {
    const result = ps.analyze({
      url: 'https://github.com/user/repo',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'code-repo'));
    const repoType = result.types.find(t => t.type === 'code-repo');
    assert.equal(repoType.repo.owner, 'user');
    assert.equal(repoType.repo.repo, 'repo');
  });

  it('识别 GitHub 仓库页面（github-repo 类型）', () => {
    const result = ps.analyze({
      url: 'https://github.com/facebook/react',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'github-repo'), '应识别为 github-repo 类型');
    const ghType = result.types.find(t => t.type === 'github-repo');
    assert.equal(ghType.owner, 'facebook');
    assert.equal(ghType.repo, 'react');
    assert.equal(ghType.pageType, 'repo-root');
    assert.equal(ghType.isRepoRoot, true);
    assert.equal(ghType.icon, '🐙');
  });

  it('GitHub Issue 页面识别为 repo-issues', () => {
    const result = ps.analyze({
      url: 'https://github.com/user/repo/issues',
      content: '',
    });
    const ghType = result.types.find(t => t.type === 'github-repo');
    assert.ok(ghType, '应识别为 github-repo 类型');
    assert.equal(ghType.pageType, 'repo-issues');
    assert.equal(ghType.isRepoRoot, false);
  });

  it('GitHub PR 页面识别为 repo-pr', () => {
    const result = ps.analyze({
      url: 'https://github.com/user/repo/pull/42',
      content: '',
    });
    const ghType = result.types.find(t => t.type === 'github-repo');
    assert.ok(ghType, '应识别为 github-repo 类型');
    assert.equal(ghType.pageType, 'repo-pr');
    assert.equal(ghType.isRepoRoot, false);
  });

  it('GitHub 文件页面识别为 repo-file', () => {
    const result = ps.analyze({
      url: 'https://github.com/user/repo/blob/main/README.md',
      content: '',
    });
    const ghType = result.types.find(t => t.type === 'github-repo');
    assert.ok(ghType, '应识别为 github-repo 类型');
    assert.equal(ghType.pageType, 'repo-file');
    assert.equal(ghType.isRepoRoot, false);
  });

  it('GitHub Wiki 页面识别为 repo-wiki', () => {
    const result = ps.analyze({
      url: 'https://github.com/user/repo/wiki',
      content: '',
    });
    const ghType = result.types.find(t => t.type === 'github-repo');
    assert.ok(ghType, '应识别为 github-repo 类型');
    assert.equal(ghType.pageType, 'repo-wiki');
    assert.equal(ghType.isRepoRoot, false);
  });

  it('GitHub Releases 页面识别为 repo-releases', () => {
    const result = ps.analyze({
      url: 'https://github.com/user/repo/releases',
      content: '',
    });
    const ghType = result.types.find(t => t.type === 'github-repo');
    assert.ok(ghType, '应识别为 github-repo 类型');
    assert.equal(ghType.pageType, 'repo-releases');
    assert.equal(ghType.isRepoRoot, false);
  });

  it('GitHub 仓库根目录末尾有斜杠', () => {
    const result = ps.analyze({
      url: 'https://github.com/user/repo/',
      content: '',
    });
    const ghType = result.types.find(t => t.type === 'github-repo');
    assert.ok(ghType, '应识别为 github-repo 类型');
    assert.equal(ghType.pageType, 'repo-root');
    assert.equal(ghType.isRepoRoot, true);
  });

  it('GitHub 用户页面不识别为 github-repo', () => {
    const result = ps.analyze({
      url: 'https://github.com/user',
      content: '',
    });
    assert.ok(!result.types.some(t => t.type === 'github-repo'), '用户主页不应识别为 github-repo');
  });

  it('GitHub explore 页面不识别为 github-repo', () => {
    const result = ps.analyze({
      url: 'https://github.com/explore',
      content: '',
    });
    assert.ok(!result.types.some(t => t.type === 'github-repo'), 'explore 页面不应识别为 github-repo');
  });

  it('识别 GitLab 仓库页面', () => {
    const result = ps.analyze({
      url: 'https://gitlab.com/group/project',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'code-repo'));
  });

  it('识别 Stack Overflow 问答页面', () => {
    const result = ps.analyze({
      url: 'https://stackoverflow.com/questions/12345',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'qa-page'));
  });

  it('识别知乎问答页面', () => {
    const result = ps.analyze({
      url: 'https://www.zhihu.com/question/12345',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'qa-page'));
  });

  it('识别技术博客（掘金）', () => {
    const result = ps.analyze({
      url: 'https://juejin.cn/post/12345',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'tech-blog'));
  });

  it('识别技术博客（Medium）', () => {
    const result = ps.analyze({
      url: 'https://medium.com/@user/article',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'tech-blog'));
  });

  it('识别含代码的页面', () => {
    const result = ps.analyze({
      url: 'https://example.com/tutorial',
      content: '',
      codeBlocks: [
        { lang: 'javascript', code: 'const x = 1;' },
        { lang: 'python', code: 'print("hello")' },
      ],
    });
    assert.ok(result.types.some(t => t.type === 'code-snippet'));
    const codeType = result.types.find(t => t.type === 'code-snippet');
    assert.equal(codeType.blockCount, 2);
    assert.deepEqual(codeType.languages, ['javascript', 'python']);
  });

  it('仅 1 个代码块不识别为代码页面', () => {
    const result = ps.analyze({
      url: 'https://example.com/page',
      content: '',
      codeBlocks: [{ lang: 'js', code: 'x' }],
    });
    assert.ok(!result.types.some(t => t.type === 'code-snippet'));
  });

  it('识别错误页面', () => {
    const result = ps.analyze({
      url: 'https://example.com/debug',
      content: 'Traceback (most recent call last): Error: something went wrong',
    });
    assert.ok(result.types.some(t => t.type === 'error-page'));
  });

  it('识别 YouTube 视频页面', () => {
    const result = ps.analyze({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Rick Astley - Never Gonna Give You Up',
      content: '',
    });
    assert.ok(result.types.some(t => t.type === 'youtube'));
    const ytType = result.types.find(t => t.type === 'youtube');
    assert.equal(ytType.videoId, 'dQw4w9WgXcQ');
    assert.equal(ytType.label, 'YouTube 视频');
    assert.equal(ytType.icon, '📺');
  });

  it('YouTube 视频页面提取 video ID', () => {
    const result = ps.analyze({
      url: 'https://www.youtube.com/watch?v=abc123&t=60',
      title: 'Test Video',
      content: '',
    });
    const ytType = result.types.find(t => t.type === 'youtube');
    assert.equal(ytType.videoId, 'abc123');
  });

  it('YouTube 短链接不匹配（非 watch 页面）', () => {
    const result = ps.analyze({
      url: 'https://www.youtube.com/shorts/abc123',
      title: 'Short Video',
      content: '',
    });
    assert.ok(!result.types.some(t => t.type === 'youtube'));
  });

  it('YouTube 嵌入页面不匹配（非 watch 页面）', () => {
    const result = ps.analyze({
      url: 'https://www.youtube.com/embed/abc123',
      title: 'Embedded Video',
      content: '',
    });
    assert.ok(!result.types.some(t => t.type === 'youtube'));
  });

  it('YouTube 频道名提取', () => {
    const result = ps.analyze({
      url: 'https://www.youtube.com/watch?v=abc123',
      title: 'Test Video',
      content: 'Channel: TechChannel\nSome video description',
    });
    const ytType = result.types.find(t => t.type === 'youtube');
    assert.equal(ytType.channel, 'TechChannel');
  });

  it('通用页面（无匹配）', () => {
    const result = ps.analyze({
      url: 'https://example.com/random',
      content: 'Hello world, nothing special here.',
    });
    assert.equal(result.types.length, 0);
    assert.equal(result.primaryType.type, 'generic');
  });
});

// ==================== toPrompt ====================

describe('PageSense toPrompt()', () => {
  it('无匹配返回空字符串', () => {
    const prompt = ps.toPrompt({
      url: 'https://example.com/',
      content: '',
    });
    assert.equal(prompt, '');
  });

  it('有匹配返回感知结果', () => {
    const prompt = ps.toPrompt({
      url: 'https://github.com/user/repo',
      content: '',
    });
    assert.ok(prompt.includes('页面感知结果'));
    assert.ok(prompt.includes('代码仓库'));
  });

  it('YouTube 视频返回感知结果包含视频信息', () => {
    const prompt = ps.toPrompt({
      url: 'https://www.youtube.com/watch?v=abc123',
      title: 'Test Video',
      content: 'Channel: TestChannel',
    });
    assert.ok(prompt.includes('YouTube 视频'));
    assert.ok(prompt.includes('abc123'));
    assert.ok(prompt.includes('TestChannel'));
  });
});

// ==================== suggestSkills ====================

describe('PageSense suggestSkills()', () => {
  it('代码页面推荐代码相关技能', () => {
    const suggestions = ps.suggestSkills({
      url: 'https://example.com/tutorial',
      content: '',
      codeBlocks: [
        { lang: 'js', code: 'a' },
        { lang: 'py', code: 'b' },
      ],
    }, null);
    assert.ok(suggestions.some(s => s.skillId === 'code-explain'));
    assert.ok(suggestions.some(s => s.skillId === 'code-review'));
  });

  it('错误页面推荐诊断技能', () => {
    const suggestions = ps.suggestSkills({
      url: 'https://example.com/error',
      content: 'Error: something failed',
    }, null);
    assert.ok(suggestions.some(s => s.skillId === 'error-diagnose'));
  });

  it('API 文档推荐摘要技能', () => {
    const suggestions = ps.suggestSkills({
      url: 'https://api.example.com/docs/reference',
      content: '',
    }, null);
    assert.ok(suggestions.some(s => s.skillId === 'api-summarize'));
  });

  it('YouTube 视频推荐视频总结技能', () => {
    const suggestions = ps.suggestSkills({
      url: 'https://www.youtube.com/watch?v=abc123',
      title: 'Test Video',
      content: '',
    }, null);
    assert.ok(suggestions.some(s => s.skillId === 'video-summarize'));
  });

  it('通用页面无推荐', () => {
    const suggestions = ps.suggestSkills({
      url: 'https://example.com/',
      content: 'nothing',
    }, null);
    assert.equal(suggestions.length, 0);
  });

  it('GitHub 仓库根页面推荐 repo-analyze 技能', () => {
    const suggestions = ps.suggestSkills({
      url: 'https://github.com/user/repo',
      content: '',
    }, null);
    assert.ok(suggestions.some(s => s.skillId === 'repo-analyze'), '应推荐 repo-analyze 技能');
  });
});

// ==================== 提取器 ====================

describe('PageSense 提取器', () => {
  it('extractEndpoints() 提取 HTTP 端点', () => {
    const content = `
      GET /api/users
      POST /api/users/create
      DELETE /api/users/{id}
    `;
    const endpoints = ps.extractEndpoints(content);
    assert.ok(endpoints.length >= 2, `应提取到至少 2 个端点，实际 ${endpoints.length}`);
    assert.ok(endpoints.some(e => e.includes('GET /api/users')));
    assert.ok(endpoints.some(e => e.includes('POST /api/users/create')));
  });

  it('extractEndpoints() 提取 PATCH 端点', () => {
    const content = `
      PATCH /api/items/123
      GET /api/items
    `;
    const endpoints = ps.extractEndpoints(content);
    assert.ok(endpoints.some(e => e.includes('PATCH')));
  });

  it('extractEndpoints() 提取带路径参数的端点', () => {
    const content = 'GET /api/users/{userId}/posts/{postId}';
    const endpoints = ps.extractEndpoints(content);
    assert.ok(endpoints.length >= 1);
    assert.ok(endpoints.some(e => e.includes('{userId}')));
  });

  it('extractEndpoints() 空内容返回空数组', () => {
    assert.deepEqual(ps.extractEndpoints(''), []);
    assert.deepEqual(ps.extractEndpoints(null), []);
  });

  it('extractRepoInfo() 提取 GitHub 仓库信息', () => {
    const info = ps.extractRepoInfo('https://github.com/facebook/react');
    assert.equal(info.owner, 'facebook');
    assert.equal(info.repo, 'react');
  });

  it('extractRepoInfo() 无匹配返回空对象', () => {
    const info = ps.extractRepoInfo('https://example.com');
    assert.deepEqual(info, {});
  });

  it('extractRepoInfo() null 返回空对象', () => {
    assert.deepEqual(ps.extractRepoInfo(null), {});
    assert.deepEqual(ps.extractRepoInfo(undefined), {});
  });

  it('extractErrors() 提取错误信息', () => {
    const content = `
      Error: Cannot find module 'xyz'
      TypeError: undefined is not a function
    `;
    const errors = ps.extractErrors(content);
    assert.ok(errors.length >= 1, `应提取到至少 1 个错误，实际 ${errors.length}`);
  });

  it('extractErrors() 空内容返回空数组', () => {
    assert.deepEqual(ps.extractErrors(''), []);
    assert.deepEqual(ps.extractErrors(null), []);
  });

  it('isGitHubRepoPage() 识别仓库根页面', () => {
    assert.ok(ps.isGitHubRepoPage('https://github.com/user/repo'));
    assert.ok(ps.isGitHubRepoPage('https://github.com/facebook/react'));
    assert.ok(ps.isGitHubRepoPage('https://github.com/user/repo/'));
  });

  it('isGitHubRepoPage() 识别仓库子页面', () => {
    assert.ok(ps.isGitHubRepoPage('https://github.com/user/repo/issues'));
    assert.ok(ps.isGitHubRepoPage('https://github.com/user/repo/pull/42'));
    assert.ok(ps.isGitHubRepoPage('https://github.com/user/repo/blob/main/README.md'));
    assert.ok(ps.isGitHubRepoPage('https://github.com/user/repo/wiki'));
    assert.ok(ps.isGitHubRepoPage('https://github.com/user/repo/releases'));
  });

  it('isGitHubRepoPage() 不匹配非仓库页面', () => {
    assert.ok(!ps.isGitHubRepoPage('https://github.com/user'));
    assert.ok(!ps.isGitHubRepoPage('https://github.com/explore'));
    assert.ok(!ps.isGitHubRepoPage('https://example.com/user/repo'));
    assert.ok(!ps.isGitHubRepoPage(''));
    assert.ok(!ps.isGitHubRepoPage(null));
  });

  it('detectGitHubPageType() 正确识别页面类型', () => {
    assert.equal(ps.detectGitHubPageType('https://github.com/user/repo'), 'repo-root');
    assert.equal(ps.detectGitHubPageType('https://github.com/user/repo/'), 'repo-root');
    assert.equal(ps.detectGitHubPageType('https://github.com/user/repo/issues'), 'repo-issues');
    assert.equal(ps.detectGitHubPageType('https://github.com/user/repo/issues/42'), 'repo-issues');
    assert.equal(ps.detectGitHubPageType('https://github.com/user/repo/pull/42'), 'repo-pr');
    assert.equal(ps.detectGitHubPageType('https://github.com/user/repo/blob/main/README.md'), 'repo-file');
    assert.equal(ps.detectGitHubPageType('https://github.com/user/repo/tree/main/src'), 'repo-file');
    assert.equal(ps.detectGitHubPageType('https://github.com/user/repo/wiki'), 'repo-wiki');
    assert.equal(ps.detectGitHubPageType('https://github.com/user/repo/releases'), 'repo-releases');
  });

  it('detectGitHubPageType() 空 URL 返回 unknown', () => {
    assert.equal(ps.detectGitHubPageType(''), 'unknown');
    assert.equal(ps.detectGitHubPageType(null), 'unknown');
    assert.equal(ps.detectGitHubPageType(undefined), 'unknown');
  });
});
