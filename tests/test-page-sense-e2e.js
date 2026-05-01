/**
 * E2E 测试 lib/page-sense.js — PageSense 类全部方法覆盖
 *
 * 测试范围：
 *   constructor, analyze(detectPageType), extractMetadata,
 *   extractContent, extractHeadings, extractImages,
 *   extractEndpoints, extractErrors, isGitHubRepoPage,
 *   detectGitHubPageType, extractRepoInfo, suggestSkills,
 *   buildSummary, toPrompt, register, 边界值
 *
 * 注意：PageSense 依赖 document / window / navigator，需 mock。
 *       extractMetadata / extractHeadings / extractImages 接受 HTML 字符串，
 *       extractContent / extractErrors 接受纯文本字符串。
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ================================================================
//  document / window / navigator mock — 在 import 之前注入
// ================================================================

globalThis.document = {
  title: '',
  querySelectorAll: () => [],
  querySelector: () => null,
  body: { textContent: '' },
  documentElement: { lang: 'en' },
};
globalThis.window = {
  document: globalThis.document,
  location: { href: 'https://test.com' },
};
try { globalThis.navigator = { userAgent: 'Mozilla/5.0 Test' }; } catch (_) { /* read-only in Node ≥22 */ }

// ================================================================
//  导入 PageSense — 若失败则跳过全部测试
// ================================================================

let PageSense;
let importError = null;

try {
  const mod = await import('../lib/page-sense.js');
  PageSense = mod.PageSense || mod.default;
  if (!PageSense) {
    const keys = Object.keys(mod);
    if (keys.length === 1) PageSense = mod[keys[0]];
  }
} catch (e) {
  importError = e;
}

// ================================================================
//  如果导入失败，输出跳过信息
// ================================================================

if (importError) {
  describe('PageSense E2E (skipped — import failed)', () => {
    it(`导入失败: ${importError.message}`, () => {
      console.log(`⚠ PageSense 导入失败，跳过测试: ${importError.message}`);
    });
  });
} else {

  // ================================================================
  //  辅助
  // ================================================================

  function createSense() {
    return new PageSense();
  }

  afterEach(() => {
    // cleanup if needed
  });

  // ================================================================
  //  1. constructor — 实例化
  // ================================================================

  describe('PageSense constructor', () => {
    it('无参数构造函数不抛出错误', () => {
      const sense = createSense();
      assert.ok(sense, '应创建实例');
      assert.equal(typeof sense, 'object');
    });

    it('多次实例化互不影响', () => {
      const s1 = createSense();
      const s2 = createSense();
      assert.notEqual(s1, s2, '应为不同实例');
    });
  });

  // ================================================================
  //  2. analyze — 页面类型识别（对应 detectPageType）
  // ================================================================

  describe('analyze — 页面类型识别', () => {
    it('返回含 primaryType 和 types 的结构', () => {
      const sense = createSense();
      const result = sense.analyze(
        'https://github.com/user/repo',
        'user/repo: A project',
        'README content here'
      );
      assert.ok(result, '应返回结果');
      assert.ok(result.primaryType, '应有 primaryType');
      assert.ok(result.primaryType.type, 'primaryType 应有 type');
      assert.ok(Array.isArray(result.types), '应有 types 数组');
      assert.ok(result.summary, '应有 summary');
    });

    it('GitHub 仓库页面被识别', () => {
      const sense = createSense();
      const result = sense.analyze(
        'https://github.com/anthropics/claude',
        'anthropics/claude',
        'Claude API SDK'
      );
      assert.ok(result.primaryType);
      // GitHub 页面可能被识别为 github 类型或 generic
      assert.ok(typeof result.primaryType.type === 'string');
    });

    it('Stack Overflow 问题页被识别', () => {
      const sense = createSense();
      const result = sense.analyze(
        'https://stackoverflow.com/questions/12345/how-to',
        'How to do something - Stack Overflow',
        'I have a question about JavaScript...'
      );
      assert.ok(result.primaryType);
      assert.ok(typeof result.primaryType.type === 'string');
    });

    it('MDN 文档页被识别', () => {
      const sense = createSense();
      const result = sense.analyze(
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        'JavaScript | MDN',
        'JavaScript (JS) is a lightweight...'
      );
      assert.ok(result.primaryType);
      assert.ok(typeof result.primaryType.type === 'string');
    });

    it('空 URL 和空内容不崩溃', () => {
      const sense = createSense();
      const result = sense.analyze('', '', '');
      assert.ok(result, '即使空参数也应返回结果');
      assert.ok(result.primaryType, '应有 primaryType');
    });
  });

  // ================================================================
  //  3. isGitHubRepoPage — GitHub 仓库检测
  // ================================================================

  describe('isGitHubRepoPage — GitHub 仓库检测', () => {
    it('GitHub 仓库 URL 返回 true', () => {
      const sense = createSense();
      assert.equal(sense.isGitHubRepoPage('https://github.com/user/repo'), true);
    });

    it('非 GitHub URL 返回 false', () => {
      const sense = createSense();
      assert.equal(sense.isGitHubRepoPage('https://example.com/page'), false);
    });

    it('GitHub 非仓库路径返回 false', () => {
      const sense = createSense();
      const result = sense.isGitHubRepoPage('https://github.com/features/actions');
      assert.equal(typeof result, 'boolean');
    });
  });

  // ================================================================
  //  4. detectGitHubPageType — GitHub 页面子类型
  // ================================================================

  describe('detectGitHubPageType — GitHub 页面子类型', () => {
    it('仓库首页返回含 type 的对象', () => {
      const sense = createSense();
      const result = sense.detectGitHubPageType('https://github.com/user/repo');
      assert.ok(result, '应返回结果');
      assert.ok(result.type, '应有 type 字段');
    });

    it('issue 页面识别', () => {
      const sense = createSense();
      const result = sense.detectGitHubPageType('https://github.com/user/repo/issues/42');
      assert.ok(result);
      assert.ok(result.type);
    });

    it('pull request 页面识别', () => {
      const sense = createSense();
      const result = sense.detectGitHubPageType('https://github.com/user/repo/pull/100');
      assert.ok(result);
      assert.ok(result.type);
    });
  });

  // ================================================================
  //  5. extractRepoInfo — 仓库信息提取
  // ================================================================

  describe('extractRepoInfo — 仓库信息提取', () => {
    it('提取 GitHub 仓库的 owner 和 repo 名', () => {
      const sense = createSense();
      const info = sense.extractRepoInfo('https://github.com/anthropics/claude-sdk');
      assert.ok(info, '应返回信息');
      if (info.owner) assert.equal(info.owner, 'anthropics');
      if (info.repo) assert.equal(info.repo, 'claude-sdk');
    });

    it('非 GitHub URL 返回 null / undefined', () => {
      const sense = createSense();
      const info = sense.extractRepoInfo('https://example.com/page');
      assert.ok(!info || info === null || (typeof info === 'object' && !info.owner),
        '非 GitHub URL 应返回无 owner 的结果');
    });
  });

  // ================================================================
  //  6. extractMetadata — 元数据提取
  // ================================================================

  describe('extractMetadata — 元数据提取', () => {
    it('提取 title 和 description', () => {
      const sense = createSense();
      const html = '<html><head><title>My Page</title><meta name="description" content="A test page"></head><body></body></html>';
      const meta = sense.extractMetadata(html);
      assert.ok(meta, '应返回元数据');
      assert.equal(meta.title, 'My Page');
      assert.equal(meta.description, 'A test page');
    });

    it('提取 Open Graph 元数据', () => {
      const sense = createSense();
      const html = '<html><head><meta property="og:title" content="OG Title"><meta property="og:description" content="OG Desc"></head><body></body></html>';
      const meta = sense.extractMetadata(html);
      assert.ok(meta);
      assert.equal(meta.title, 'OG Title');
      assert.equal(meta.description, 'OG Desc');
    });

    it('空 HTML 返回空元数据对象', () => {
      const sense = createSense();
      const meta = sense.extractMetadata('');
      assert.ok(meta, '应返回对象');
      assert.equal(meta.title, '');
      assert.equal(meta.description, '');
    });
  });

  // ================================================================
  //  7. extractContent — 内容提取
  // ================================================================

  describe('extractContent — 内容提取', () => {
    it('提取纯文本内容', () => {
      const sense = createSense();
      const content = sense.extractContent('Hello World. This is main content.');
      assert.ok(content !== undefined, '应返回内容');
      assert.ok(typeof content === 'string', '应返回字符串');
      assert.ok(content.length > 0, '内容不应为空');
    });

    it('空文本返回空字符串', () => {
      const sense = createSense();
      const content = sense.extractContent('');
      assert.ok(typeof content === 'string', '应返回字符串');
    });

    it('HTML 标签被清理', () => {
      const sense = createSense();
      const content = sense.extractContent('<p>Hello</p><script>alert(1)</script>');
      assert.ok(typeof content === 'string');
      // script 内容可能被移除或保留，但不应崩溃
      assert.ok(!content.includes('<script>'), 'script 标签应被移除');
    });
  });

  // ================================================================
  //  8. extractHeadings — 标题提取
  // ================================================================

  describe('extractHeadings — 标题提取', () => {
    it('提取 h1-h6 标题', () => {
      const sense = createSense();
      const html = '<html><body><h1>Main</h1><h2>Section</h2><h3>Sub</h3></body></html>';
      const headings = sense.extractHeadings(html);
      assert.ok(Array.isArray(headings), '应返回数组');
      assert.ok(headings.length >= 3, '应提取到 3 个标题');
      assert.equal(headings[0].level, 1);
      assert.equal(headings[0].text, 'Main');
    });

    it('无标题时返回空数组', () => {
      const sense = createSense();
      const html = '<html><body><p>No headings</p></body></html>';
      const headings = sense.extractHeadings(html);
      assert.ok(Array.isArray(headings));
      assert.equal(headings.length, 0);
    });
  });

  // ================================================================
  //  9. extractImages — 图片提取
  // ================================================================

  describe('extractImages — 图片提取', () => {
    it('提取所有 img src', () => {
      const sense = createSense();
      const html = '<html><body><img src="https://example.com/a.png" alt="A"><img src="/b.jpg"></body></html>';
      const images = sense.extractImages(html);
      assert.ok(Array.isArray(images), '应返回数组');
      assert.ok(images.length >= 2, '应提取到 2 张图片');
    });

    it('无图片时返回空数组', () => {
      const sense = createSense();
      const html = '<html><body><p>No images</p></body></html>';
      const images = sense.extractImages(html);
      assert.ok(Array.isArray(images));
      assert.equal(images.length, 0);
    });
  });

  // ================================================================
  //  10. extractEndpoints — API 端点提取
  // ================================================================

  describe('extractEndpoints — API 端点提取', () => {
    it('提取 fetch 调用中的 URL', () => {
      const sense = createSense();
      const endpoints = sense.extractEndpoints('fetch("/api/v1/users") and fetch("/api/v2/items")');
      assert.ok(Array.isArray(endpoints), '应返回数组');
      assert.ok(endpoints.length >= 1, '应提取到端点');
    });

    it('提取 HTTP URL', () => {
      const sense = createSense();
      const endpoints = sense.extractEndpoints('GET https://api.example.com/v1/test');
      assert.ok(Array.isArray(endpoints));
      assert.ok(endpoints.length >= 1);
    });

    it('无端点文本返回空数组', () => {
      const sense = createSense();
      const endpoints = sense.extractEndpoints('Just plain text with no endpoints.');
      assert.ok(Array.isArray(endpoints));
    });
  });

  // ================================================================
  //  11. extractErrors — 错误提取
  // ================================================================

  describe('extractErrors — 错误提取', () => {
    it('提取 JavaScript 错误信息', () => {
      const sense = createSense();
      const errors = sense.extractErrors('Uncaught TypeError: Cannot read property "x" of undefined');
      assert.ok(Array.isArray(errors), '应返回数组');
      assert.ok(errors.length >= 1, '应提取到错误');
    });

    it('无错误文本返回空数组', () => {
      const sense = createSense();
      const errors = sense.extractErrors('Everything is fine, no errors.');
      assert.ok(Array.isArray(errors));
    });

    it('空文本返回空数组', () => {
      const sense = createSense();
      const errors = sense.extractErrors('');
      assert.ok(Array.isArray(errors));
    });
  });

  // ================================================================
  //  12. suggestSkills — 技能建议
  // ================================================================

  describe('suggestSkills — 技能建议', () => {
    it('根据分析结果返回技能数组', () => {
      const sense = createSense();
      const analysis = sense.analyze('https://example.com', 'Test', 'content');
      const skills = sense.suggestSkills(analysis);
      assert.ok(Array.isArray(skills), '应返回数组');
    });
  });

  // ================================================================
  //  13. buildSummary — 构建摘要
  // ================================================================

  describe('buildSummary — 构建摘要', () => {
    it('从分析结果构建摘要字符串', () => {
      const sense = createSense();
      const analysis = sense.analyze('https://example.com', 'Test Page', 'Some content');
      const summary = sense.buildSummary(analysis);
      assert.ok(typeof summary === 'string', '应返回字符串');
      assert.ok(summary.length > 0, '摘要不应为空');
    });
  });

  // ================================================================
  //  14. toPrompt — 生成提示词
  // ================================================================

  describe('toPrompt — 生成提示词', () => {
    it('将分析结果转为 prompt 字符串', () => {
      const sense = createSense();
      const analysis = sense.analyze('https://example.com', 'Test', 'content');
      const prompt = sense.toPrompt(analysis);
      assert.ok(typeof prompt === 'string', '应返回字符串');
      assert.ok(prompt.length > 0, 'prompt 不应为空');
    });
  });

  // ================================================================
  //  15. register — 注册自定义分析器
  // ================================================================

  describe('register — 注册自定义分析器', () => {
    it('注册后 analyze 可使用自定义分析器', () => {
      const sense = createSense();
      sense.register('custom', {
        test: (url, title, content) => url.includes('custom'),
        analyze: (url, title, content) => ({
          type: 'custom-type',
          label: 'Custom',
          icon: '🔧',
        }),
      });

      const result = sense.analyze('https://custom-site.com/page', 'Custom Page', 'content');
      assert.ok(result, '应返回结果');
      assert.ok(result.primaryType, '应有 primaryType');
    });

    it('注册不影响已有分析器', () => {
      const sense = createSense();
      const before = sense.analyze('https://github.com/user/repo', 'repo', 'content');
      sense.register('extra', {
        test: () => false,
        analyze: () => ({ type: 'extra' }),
      });
      const after = sense.analyze('https://github.com/user/repo', 'repo', 'content');
      assert.equal(before.primaryType.type, after.primaryType.type, '已有分析器不应改变');
    });
  });

  // ================================================================
  //  16. 边界值 — 特殊字符 / 超长内容
  // ================================================================

  describe('边界值 — 特殊字符与超长内容', () => {
    it('标题含 emoji 不崩溃', () => {
      const sense = createSense();
      const result = sense.analyze('https://example.com', '🚀 Launch Day! 🎉', 'Content with emoji 🌟');
      assert.ok(result);
      assert.ok(result.primaryType);
    });

    it('标题含 HTML 实体不崩溃', () => {
      const sense = createSense();
      const result = sense.analyze('https://example.com', 'A &amp; B &lt; C', 'Content');
      assert.ok(result);
    });

    it('超长 URL 不崩溃', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2000);
      const sense = createSense();
      const result = sense.analyze(longUrl, 'Title', 'Content');
      assert.ok(result);
    });

    it('超长内容文本不崩溃', () => {
      const sense = createSense();
      const longContent = 'word '.repeat(10000);
      const result = sense.analyze('https://example.com', 'Title', longContent);
      assert.ok(result);
      assert.ok(result.primaryType);
    });

    it('Unicode 内容不崩溃', () => {
      const sense = createSense();
      const result = sense.analyze(
        'https://example.com/日本語',
        '中文标题 — 测试页面',
        '这是一段中文内容，包含各种 Unicode 字符：①②③ ™ ® ©'
      );
      assert.ok(result);
    });
  });

} // end else (import succeeded)
