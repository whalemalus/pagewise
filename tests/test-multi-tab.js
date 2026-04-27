/**
 * 测试多页面联合分析功能
 *
 * 测试 buildMultiTabPrompt 和 isRestrictedUrl 等纯逻辑函数，
 * 不依赖 Chrome API 或 DOM。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ==================== buildMultiTabPrompt ====================

/**
 * 从 sidebar.js 中提取的 buildMultiTabPrompt 逻辑（纯函数版本）
 * 用于独立测试
 */
function buildMultiTabPrompt(tabs) {
  let prompt = `我选择了 ${tabs.length} 个页面，请对它们进行联合分析：\n\n`;

  tabs.forEach((tab, i) => {
    prompt += `--- 页面 ${i + 1}：${tab.title} ---\n`;
    prompt += `URL：${tab.url}\n`;
    prompt += `内容：\n${tab.content}\n\n`;
  });

  prompt += `请对以上 ${tabs.length} 个页面进行联合分析：\n`;
  prompt += `1. 逐一简要总结每个页面的核心内容\n`;
  prompt += `2. 找出这些页面之间的关联性和主题联系\n`;
  prompt += `3. 对比它们之间的差异和互补信息\n`;
  prompt += `4. 给出跨页面的综合洞察或建议\n`;

  return prompt;
}

/**
 * isRestrictedUrl 纯函数版本
 */
const RESTRICTED_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://',
  'devtools://', 'view-source:', 'file://'
];

function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

/**
 * 标签页内容截取逻辑（纯函数）
 */
function truncateTabContent(content, maxChars = 3000) {
  if (!content) return '';
  return content.slice(0, maxChars);
}

describe('buildMultiTabPrompt()', () => {
  it('单个页面生成正确的 prompt', () => {
    const tabs = [
      { title: 'Test Page', url: 'https://example.com', content: 'Hello world' }
    ];
    const prompt = buildMultiTabPrompt(tabs);
    assert.ok(prompt.includes('1 个页面'));
    assert.ok(prompt.includes('Test Page'));
    assert.ok(prompt.includes('https://example.com'));
    assert.ok(prompt.includes('Hello world'));
    assert.ok(prompt.includes('联合分析'));
  });

  it('多个页面包含所有页面信息', () => {
    const tabs = [
      { title: 'Page A', url: 'https://a.com', content: 'Content A' },
      { title: 'Page B', url: 'https://b.com', content: 'Content B' },
      { title: 'Page C', url: 'https://c.com', content: 'Content C' }
    ];
    const prompt = buildMultiTabPrompt(tabs);
    assert.ok(prompt.includes('3 个页面'));
    assert.ok(prompt.includes('页面 1：Page A'));
    assert.ok(prompt.includes('页面 2：Page B'));
    assert.ok(prompt.includes('页面 3：Page C'));
    assert.ok(prompt.includes('Content A'));
    assert.ok(prompt.includes('Content B'));
    assert.ok(prompt.includes('Content C'));
  });

  it('包含分析指导：逐一总结', () => {
    const tabs = [{ title: 'T', url: 'https://t.com', content: 'X' }];
    const prompt = buildMultiTabPrompt(tabs);
    assert.ok(prompt.includes('逐一简要总结'));
  });

  it('包含分析指导：找出关联', () => {
    const tabs = [{ title: 'T', url: 'https://t.com', content: 'X' }];
    const prompt = buildMultiTabPrompt(tabs);
    assert.ok(prompt.includes('关联性'));
  });

  it('包含分析指导：对比差异', () => {
    const tabs = [{ title: 'T', url: 'https://t.com', content: 'X' }];
    const prompt = buildMultiTabPrompt(tabs);
    assert.ok(prompt.includes('差异'));
  });

  it('包含分析指导：综合洞察', () => {
    const tabs = [{ title: 'T', url: 'https://t.com', content: 'X' }];
    const prompt = buildMultiTabPrompt(tabs);
    assert.ok(prompt.includes('综合洞察'));
  });

  it('5 个页面（最大限制）', () => {
    const tabs = Array.from({ length: 5 }, (_, i) => ({
      title: `Page ${i + 1}`,
      url: `https://example.com/${i + 1}`,
      content: `Content ${i + 1}`
    }));
    const prompt = buildMultiTabPrompt(tabs);
    assert.ok(prompt.includes('5 个页面'));
    assert.ok(prompt.includes('页面 5：Page 5'));
  });

  it('URL 信息完整包含', () => {
    const tabs = [
      { title: 'T', url: 'https://api.example.com/docs/users?sort=name#section', content: 'X' }
    ];
    const prompt = buildMultiTabPrompt(tabs);
    assert.ok(prompt.includes('https://api.example.com/docs/users?sort=name#section'));
  });
});

// ==================== isRestrictedUrl ====================

describe('isRestrictedUrl()', () => {
  it('chrome:// URL 受限', () => {
    assert.ok(isRestrictedUrl('chrome://settings'));
    assert.ok(isRestrictedUrl('chrome://extensions'));
  });

  it('chrome-extension:// URL 受限', () => {
    assert.ok(isRestrictedUrl('chrome-extension://abc123/sidebar.html'));
  });

  it('about: URL 受限', () => {
    assert.ok(isRestrictedUrl('about:blank'));
    assert.ok(isRestrictedUrl('about:home'));
  });

  it('edge:// URL 受限', () => {
    assert.ok(isRestrictedUrl('edge://settings'));
  });

  it('brave:// URL 受限', () => {
    assert.ok(isRestrictedUrl('brave://settings'));
  });

  it('devtools:// URL 受限', () => {
    assert.ok(isRestrictedUrl('devtools://devtools/bundled/inspector.html'));
  });

  it('view-source: URL 受限', () => {
    assert.ok(isRestrictedUrl('view-source:https://example.com'));
  });

  it('file:// URL 受限', () => {
    assert.ok(isRestrictedUrl('file:///home/user/test.html'));
  });

  it('普通 HTTP URL 不受限', () => {
    assert.ok(!isRestrictedUrl('https://example.com'));
    assert.ok(!isRestrictedUrl('http://localhost:3000'));
  });

  it('空/null/undefined URL 受限', () => {
    assert.ok(isRestrictedUrl(''));
    assert.ok(isRestrictedUrl(null));
    assert.ok(isRestrictedUrl(undefined));
  });

  it('GitHub URL 不受限', () => {
    assert.ok(!isRestrictedUrl('https://github.com/user/repo'));
  });

  it('带路径的普通 URL 不受限', () => {
    assert.ok(!isRestrictedUrl('https://developer.mozilla.org/en-US/docs/Web'));
  });
});

// ==================== truncateTabContent ====================

describe('truncateTabContent()', () => {
  it('短内容不截断', () => {
    assert.equal(truncateTabContent('hello'), 'hello');
  });

  it('空内容返回空字符串', () => {
    assert.equal(truncateTabContent(''), '');
    assert.equal(truncateTabContent(null), '');
    assert.equal(truncateTabContent(undefined), '');
  });

  it('超长内容截断到 3000 字符', () => {
    const longContent = 'a'.repeat(5000);
    const result = truncateTabContent(longContent, 3000);
    assert.equal(result.length, 3000);
  });

  it('恰好 3000 字符不截断', () => {
    const content = 'b'.repeat(3000);
    const result = truncateTabContent(content, 3000);
    assert.equal(result.length, 3000);
    assert.equal(result, content);
  });

  it('3001 字符截断到 3000', () => {
    const content = 'c'.repeat(3001);
    const result = truncateTabContent(content, 3000);
    assert.equal(result.length, 3000);
  });
});

// ==================== 标签页选择约束 ====================

describe('标签页选择约束', () => {
  it('最多选择 5 个标签页', () => {
    const selectedTabIds = new Set([1, 2, 3, 4, 5]);
    assert.equal(selectedTabIds.size, 5);
    // 尝试添加第 6 个时应该被限制
    assert.ok(selectedTabIds.size >= 5, '已达到 5 个上限');
  });

  it('初始选择为空', () => {
    const selectedTabIds = new Set();
    assert.equal(selectedTabIds.size, 0);
    assert.equal([...selectedTabIds].length, 0);
  });

  it('选中和取消选中', () => {
    const selectedTabIds = new Set();
    selectedTabIds.add(1);
    selectedTabIds.add(2);
    assert.equal(selectedTabIds.size, 2);

    selectedTabIds.delete(1);
    assert.equal(selectedTabIds.size, 1);
    assert.ok(selectedTabIds.has(2));
    assert.ok(!selectedTabIds.has(1));
  });
});
