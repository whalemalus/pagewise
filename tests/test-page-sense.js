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

  it('识别 API 文档页面（内容含 endpoint）', () => {
    const result = ps.analyze({
      url: 'https://example.com/page',
      content: 'This endpoint returns a list of users. Request body should include...',
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

  it('通用页面无推荐', () => {
    const suggestions = ps.suggestSkills({
      url: 'https://example.com/',
      content: 'nothing',
    }, null);
    assert.equal(suggestions.length, 0);
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
});
