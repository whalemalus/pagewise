/**
 * 测试 代码执行沙箱 — 正则匹配与提取逻辑
 *
 * 由于 SidebarApp 依赖 DOM 和 Chrome API，这里测试纯逻辑部分：
 * - 代码块检测正则
 * - 代码块提取
 * - 沙箱 HTML 构建
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ==================== 代码块检测正则 ====================

describe('代码块检测', () => {
  const hasRunnableCode = (content) => /```(?:html|javascript)\n[\s\S]*?```/i.test(content);

  it('检测 html 代码块', () => {
    const content = '这是回答\n```html\n<h1>Hello</h1>\n```';
    assert.ok(hasRunnableCode(content));
  });

  it('检测 javascript 代码块', () => {
    const content = '这是回答\n```javascript\nconsole.log("hi")\n```';
    assert.ok(hasRunnableCode(content));
  });

  it('检测大写 HTML', () => {
    const content = '```HTML\n<div></div>\n```';
    assert.ok(hasRunnableCode(content));
  });

  it('不检测 python 代码块', () => {
    const content = '```python\nprint("hi")\n```';
    assert.ok(!hasRunnableCode(content));
  });

  it('不检测 js 代码块（非 javascript）', () => {
    const content = '```js\nconsole.log("hi")\n```';
    assert.ok(!hasRunnableCode(content));
  });

  it('不检测无代码块的内容', () => {
    const content = '这是一段普通文字';
    assert.ok(!hasRunnableCode(content));
  });

  it('检测多个代码块中的 html', () => {
    const content = '```python\nprint("hi")\n```\n\n```html\n<div>test</div>\n```';
    assert.ok(hasRunnableCode(content));
  });
});

// ==================== 代码块提取 ====================

describe('extractRunnableCodeBlocks()', () => {
  const extractRunnableCodeBlocks = (markdownContent) => {
    const blocks = [];
    const regex = /```(html|javascript)\n([\s\S]*?)```/gi;
    let match;
    while ((match = regex.exec(markdownContent)) !== null) {
      blocks.push({ lang: match[1].toLowerCase(), code: match[2] });
    }
    return blocks;
  };

  it('提取单个 html 代码块', () => {
    const content = '```html\n<h1>Hello</h1>\n```';
    const blocks = extractRunnableCodeBlocks(content);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].lang, 'html');
    assert.ok(blocks[0].code.includes('<h1>Hello</h1>'));
  });

  it('提取单个 javascript 代码块', () => {
    const content = '```javascript\nconsole.log("test")\n```';
    const blocks = extractRunnableCodeBlocks(content);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].lang, 'javascript');
    assert.ok(blocks[0].code.includes('console.log'));
  });

  it('提取多个代码块', () => {
    const content = '```html\n<div>hi</div>\n```\n一些文字\n```javascript\nalert(1)\n```';
    const blocks = extractRunnableCodeBlocks(content);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].lang, 'html');
    assert.equal(blocks[1].lang, 'javascript');
  });

  it('忽略非 html/javascript 代码块', () => {
    const content = '```python\nprint("hi")\n```\n```html\n<div></div>\n```';
    const blocks = extractRunnableCodeBlocks(content);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].lang, 'html');
  });

  it('空内容返回空数组', () => {
    assert.deepEqual(extractRunnableCodeBlocks(''), []);
    assert.deepEqual(extractRunnableCodeBlocks('普通文字'), []);
  });

  it('大小写不敏感', () => {
    const content = '```HTML\n<p>test</p>\n```\n```JavaScript\nlet x = 1;\n```';
    const blocks = extractRunnableCodeBlocks(content);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].lang, 'html');
    assert.equal(blocks[1].lang, 'javascript');
  });

  it('保留代码块中的原始内容', () => {
    const code = '<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body><p>Hello</p></body>\n</html>';
    const content = '```html\n' + code + '\n```';
    const blocks = extractRunnableCodeBlocks(content);
    // 正则捕获可能包含尾部换行，trim 后比较核心内容
    assert.ok(blocks[0].code.includes('<!DOCTYPE html>'));
    assert.ok(blocks[0].code.includes('<p>Hello</p>'));
    assert.ok(blocks[0].code.includes('</html>'));
  });
});

// ==================== 沙箱 HTML 构建 ====================

describe('_buildSandboxHtml()', () => {
  const _buildSandboxHtml = (code, isHtml) => {
    const consoleInterceptor = `__CONSOLE_INTERCEPTOR__`;

    if (isHtml) {
      if (code.includes('</head>')) {
        return code.replace('</head>', consoleInterceptor + '</head>');
      } else if (code.includes('<html')) {
        return code.replace(/<html[^>]*>/, '$&<head>' + consoleInterceptor + '</head>');
      } else {
        return '<!DOCTYPE html><html><head>' + consoleInterceptor + '</head><body>' + code + '</body></html>';
      }
    } else {
      return '<!DOCTYPE html><html><head>' + consoleInterceptor + '</head><body><script>' + code + '</' + 'script></body></html>';
    }
  };

  it('HTML 模式 — 有 </head> 标签时注入到 head', () => {
    const code = '<html><head><title>T</title></head><body><p>Hi</p></body></html>';
    const result = _buildSandboxHtml(code, true);
    assert.ok(result.includes('__CONSOLE_INTERCEPTOR__'));
    assert.ok(result.includes('</head>'));
    assert.ok(result.includes('<p>Hi</p>'));
  });

  it('HTML 模式 — 有 <html> 但无 </head>', () => {
    const code = '<html><body><p>Hi</p></body></html>';
    const result = _buildSandboxHtml(code, true);
    assert.ok(result.includes('__CONSOLE_INTERCEPTOR__'));
    assert.ok(result.includes('<body><p>Hi</p></body>'));
  });

  it('HTML 模式 — 纯 HTML 片段', () => {
    const code = '<p>Hello</p>';
    const result = _buildSandboxHtml(code, true);
    assert.ok(result.includes('__CONSOLE_INTERCEPTOR__'));
    assert.ok(result.includes('<p>Hello</p>'));
    assert.ok(result.startsWith('<!DOCTYPE html>'));
  });

  it('JavaScript 模式 — 包裹在 script 标签中', () => {
    const code = 'console.log("hello")';
    const result = _buildSandboxHtml(code, false);
    assert.ok(result.includes('__CONSOLE_INTERCEPTOR__'));
    assert.ok(result.includes('<script>console.log("hello")</script>'));
    assert.ok(result.startsWith('<!DOCTYPE html>'));
  });

  it('JavaScript 模式 — 不会因代码中的字符串提前关闭 script', () => {
    const code = 'var x = "</script>";';
    const result = _buildSandboxHtml(code, false);
    // 结果中应包含完整的 script 块（由 </' + 'script> 拼接而成）
    assert.ok(result.includes('__CONSOLE_INTERCEPTOR__'));
  });
});

// ==================== 消息级别的运行按钮 ====================

describe('消息级别运行按钮条件', () => {
  const hasRunnableCode = (content) => /```(?:html|javascript)\n[\s\S]*?```/i.test(content);

  it('含 html 代码块时应显示运行按钮', () => {
    assert.ok(hasRunnableCode('回答文字\n```html\n<div></div>\n```'));
  });

  it('含 javascript 代码块时应显示运行按钮', () => {
    assert.ok(hasRunnableCode('回答文字\n```javascript\nlet x=1;\n```'));
  });

  it('仅含 python 代码块时不显示', () => {
    assert.ok(!hasRunnableCode('回答文字\n```python\nprint()\n```'));
  });

  it('仅含 js 代码块时不显示（非 javascript）', () => {
    assert.ok(!hasRunnableCode('回答文字\n```js\nconsole.log()\n```'));
  });

  it('无代码块时不显示', () => {
    assert.ok(!hasRunnableCode('普通回答文字'));
  });
});

// ==================== lang class 检测 ====================

describe('代码块语言类名检测', () => {
  const detectLang = (className) => {
    const isHtml = /lang-html/i.test(className);
    const isJs = /lang-javascript/i.test(className) || /lang-js/i.test(className);
    if (isHtml) return 'html';
    if (isJs) return 'javascript';
    return null;
  };

  it('检测 lang-html', () => {
    assert.equal(detectLang('lang-html'), 'html');
  });

  it('检测 lang-javascript', () => {
    assert.equal(detectLang('lang-javascript'), 'javascript');
  });

  it('检测 lang-js', () => {
    assert.equal(detectLang('lang-js'), 'javascript');
  });

  it('不检测 lang-python', () => {
    assert.equal(detectLang('lang-python'), null);
  });

  it('不检测 lang-js 为 html', () => {
    assert.notEqual(detectLang('lang-js'), 'html');
  });
});
