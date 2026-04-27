/**
 * 测试 lib/utils.js — 工具函数
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock, uninstallChromeMock } from './helpers/setup.js';

// utils.js 依赖 chrome.storage，先安装 mock
installChromeMock();

const {
  getSettings,
  saveSettings,
  truncate,
  formatTime,
  renderMarkdown,
  debounce,
  generateId,
  saveConversation,
  loadConversation,
  clearConversation,
} = await import('../lib/utils.js');

afterEach(() => {
  resetChromeMock();
});

// ==================== truncate ====================

describe('truncate()', () => {
  it('短文本不截断', () => {
    assert.equal(truncate('hello', 10), 'hello');
  });

  it('空文本返回原值', () => {
    assert.equal(truncate('', 10), '');
    assert.equal(truncate(null, 10), null);
    assert.equal(truncate(undefined, 10), undefined);
  });

  it('超长文本截断并加省略号', () => {
    const result = truncate('abcdef', 3);
    assert.equal(result, 'abc...');
  });

  it('默认 maxLength=200', () => {
    const short = 'a'.repeat(200);
    assert.equal(truncate(short), short);

    const long = 'a'.repeat(201);
    assert.equal(truncate(long), 'a'.repeat(200) + '...');
  });
});

// ==================== formatTime ====================

describe('formatTime()', () => {
  it('刚刚（<1分钟）', () => {
    const now = new Date().toISOString();
    assert.equal(formatTime(now), '刚刚');
  });

  it('N 分钟前', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    assert.equal(formatTime(fiveMinAgo), '5 分钟前');
  });

  it('N 小时前', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    assert.equal(formatTime(twoHoursAgo), '2 小时前');
  });

  it('N 天前', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    assert.equal(formatTime(threeDaysAgo), '3 天前');
  });

  it('超过 7 天显示日期', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    const result = formatTime(tenDaysAgo);
    // 应包含月和日信息
    assert.ok(result.length > 0, '应返回日期字符串');
    assert.ok(!result.includes('天前'), '不应是相对时间');
  });
});

// ==================== renderMarkdown ====================

describe('renderMarkdown()', () => {
  it('空文本返回空字符串', () => {
    assert.equal(renderMarkdown(''), '');
    assert.equal(renderMarkdown(null), '');
    assert.equal(renderMarkdown(undefined), '');
  });

  it('粗体和斜体', () => {
    assert.ok(renderMarkdown('**bold**').includes('<strong>bold</strong>'));
    assert.ok(renderMarkdown('*italic*').includes('<em>italic</em>'));
  });

  it('代码块', () => {
    const md = '```js\nconsole.log("hi")\n```';
    const html = renderMarkdown(md);
    assert.ok(html.includes('<pre><code'));
    assert.ok(html.includes('console.log'));
  });

  it('行内代码', () => {
    const html = renderMarkdown('use `npm install`');
    assert.ok(html.includes('<code>npm install</code>'));
  });

  it('标题', () => {
    assert.ok(renderMarkdown('# Title').includes('<h1>Title</h1>'));
    assert.ok(renderMarkdown('## Sub').includes('<h2>Sub</h2>'));
    assert.ok(renderMarkdown('### H3').includes('<h3>H3</h3>'));
    assert.ok(renderMarkdown('#### H4').includes('<h4>H4</h4>'));
  });

  it('链接', () => {
    const html = renderMarkdown('[Google](https://google.com)');
    assert.ok(html.includes('href="https://google.com"'));
    assert.ok(html.includes('Google'));
  });

  it('引用', () => {
    const html = renderMarkdown('> quote');
    assert.ok(html.includes('<blockquote>quote</blockquote>'));
  });

  it('分隔线', () => {
    const html = renderMarkdown('---');
    assert.ok(html.includes('<hr>'));
  });

  it('代码块包含复制按钮', () => {
    const md = '```js\nconsole.log("hi")\n```';
    const html = renderMarkdown(md);
    assert.ok(html.includes('class="code-block-wrapper"'), '应包含 code-block-wrapper');
    assert.ok(html.includes('data-code-copy'), '应包含 data-code-copy 属性');
    assert.ok(html.includes('复制'), '应包含复制按钮文本');
    assert.ok(html.includes('<pre><code'), '应保留 pre/code 结构');
  });

  it('无语言标记的代码块也包含复制按钮', () => {
    const md = '```\nsome code\n```';
    const html = renderMarkdown(md);
    assert.ok(html.includes('code-block-wrapper'));
    assert.ok(html.includes('data-code-copy'));
  });
});

// ==================== debounce ====================

describe('debounce()', () => {
  it('延迟执行', (_, done) => {
    let called = 0;
    const fn = debounce(() => { called++; }, 50);

    fn();
    fn();
    fn();

    // 立即检查不应已调用
    assert.equal(called, 0);

    setTimeout(() => {
      assert.equal(called, 1);
      done();
    }, 100);
  });

  it('传递参数', (_, done) => {
    let result = null;
    const fn = debounce((val) => { result = val; }, 50);

    fn('hello');

    setTimeout(() => {
      assert.equal(result, 'hello');
      done();
    }, 100);
  });
});

// ==================== generateId ====================

describe('generateId()', () => {
  it('返回字符串', () => {
    const id = generateId();
    assert.equal(typeof id, 'string');
    assert.ok(id.length > 0);
  });

  it('多次调用生成不同 ID', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    assert.equal(ids.size, 100, '100 个 ID 应全部不同');
  });
});

// ==================== getSettings / saveSettings ====================

describe('getSettings() / saveSettings()', () => {
  it('返回默认设置', async () => {
    const settings = await getSettings();
    assert.equal(settings.apiKey, '');
    assert.equal(settings.model, 'gpt-4o');
    assert.equal(settings.maxTokens, 4096);
    assert.equal(settings.theme, 'light');
  });

  it('保存并读取设置', async () => {
    await saveSettings({ apiKey: 'test-key-123', model: 'claude-3' });
    const settings = await getSettings();
    assert.equal(settings.apiKey, 'test-key-123');
    assert.equal(settings.model, 'claude-3');
  });
});
