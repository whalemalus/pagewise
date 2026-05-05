/**
 * 测试 lib/bookmark-preview.js — 书签内容预览
 *
 * 测试范围:
 *   extractUrlInfo: 正常 URL / 带查询参数 / 无效 URL
 *   generateTextPreview: 最小书签 / 完整书签 / 截断 / 空标题
 *   generateHtmlPreview: 关键元素 / XSS 转义
 *   generateSnapshotPreview: 有快照 / 无快照 / 超长内容
 *   _truncate: 短文本 / 长文本 / 中文字符
 *   _escapeHtml: <script> / 引号 / & 符号
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkContentPreview, DEFAULT_OPTIONS, STATUS_LABELS } = await import('../lib/bookmark-preview.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(overrides = {}) {
  return {
    id: '1',
    title: 'React 入门教程',
    url: 'https://react.dev/learn',
    folderPath: ['前端', 'React'],
    tags: ['javascript', 'react', '入门'],
    status: 'unread',
    dateAdded: 1700000000000,
    ...overrides,
  };
}

// ==================== 测试用例 ====================

describe('BookmarkContentPreview', () => {

  // ==================== extractUrlInfo ====================

  describe('extractUrlInfo', () => {

    it('正常 URL 提取域名/路径/协议/favicon', () => {
      const info = BookmarkContentPreview.extractUrlInfo('https://react.dev/learn');
      assert.equal(info.domain, 'react.dev');
      assert.equal(info.path, '/learn');
      assert.equal(info.protocol, 'https');
      assert.equal(info.favicon, 'https://react.dev/favicon.ico');
    });

    it('带查询参数的 URL 正确提取', () => {
      const info = BookmarkContentPreview.extractUrlInfo('https://example.com/search?q=hello&lang=zh#top');
      assert.equal(info.domain, 'example.com');
      assert.equal(info.path, '/search');
      assert.equal(info.protocol, 'https');
    });

    it('http 协议正确识别', () => {
      const info = BookmarkContentPreview.extractUrlInfo('http://insecure.example.com/page');
      assert.equal(info.protocol, 'http');
      assert.equal(info.favicon, 'http://insecure.example.com/favicon.ico');
    });

    it('无效 URL 返回空字段', () => {
      const info = BookmarkContentPreview.extractUrlInfo('not-a-url');
      assert.equal(info.domain, '');
      assert.equal(info.path, '');
      assert.equal(info.protocol, '');
      assert.equal(info.favicon, '');
    });
  });

  // ==================== generateTextPreview ====================

  describe('generateTextPreview', () => {

    it('完整书签生成包含所有元素的文本', () => {
      const bm = createBookmark();
      const text = BookmarkContentPreview.generateTextPreview(bm);
      assert.ok(text.includes('React 入门教程'));
      assert.ok(text.includes('[react.dev]'));
      assert.ok(text.includes('📂 前端 > React'));
      assert.ok(text.includes('javascript'));
      assert.ok(text.includes('(未读)'));
    });

    it('最小书签只有标题和域名', () => {
      const bm = createBookmark({ folderPath: [], tags: [], status: undefined });
      const text = BookmarkContentPreview.generateTextPreview(bm);
      assert.ok(text.includes('React 入门教程'));
      assert.ok(text.includes('[react.dev]'));
      assert.ok(!text.includes('📂'));
      assert.ok(!text.includes('🏷'));
    });

    it('空标题书签不崩溃', () => {
      const bm = createBookmark({ title: '' });
      const text = BookmarkContentPreview.generateTextPreview(bm);
      assert.ok(typeof text === 'string');
      assert.ok(text.includes('[react.dev]'));
    });

    it('长文本按 maxLength 截断', () => {
      const bm = createBookmark({ title: 'A'.repeat(300) });
      const text = BookmarkContentPreview.generateTextPreview(bm, { maxLength: 100 });
      assert.ok(text.length <= 103); // 100 + "..."
      assert.ok(text.endsWith('...'));
    });

    it('opts 可禁用标签/状态/文件夹', () => {
      const bm = createBookmark();
      const text = BookmarkContentPreview.generateTextPreview(bm, {
        includeTags: false,
        includeStatus: false,
        includeFolder: false,
      });
      assert.ok(text.includes('React 入门教程'));
      assert.ok(!text.includes('📂'));
      assert.ok(!text.includes('🏷'));
      assert.ok(!text.includes('(未读)'));
    });

    it('null/undefined 输入返回空字符串', () => {
      assert.equal(BookmarkContentPreview.generateTextPreview(null), '');
      assert.equal(BookmarkContentPreview.generateTextPreview(undefined), '');
    });
  });

  // ==================== generateHtmlPreview ====================

  describe('generateHtmlPreview', () => {

    it('HTML 输出包含关键结构元素', () => {
      const bm = createBookmark();
      const html = BookmarkContentPreview.generateHtmlPreview(bm);
      assert.ok(html.includes('class="bookmark-preview"'));
      assert.ok(html.includes('class="preview-title"'));
      assert.ok(html.includes('class="preview-url"'));
      assert.ok(html.includes('class="preview-folder"'));
      assert.ok(html.includes('class="preview-tags"'));
      assert.ok(html.includes('class="preview-status"'));
    });

    it('HTML 输出正确转义特殊字符', () => {
      const bm = createBookmark({
        title: '<script>alert("XSS")</script>',
        url: 'https://evil.com/"onload="hack',
      });
      const html = BookmarkContentPreview.generateHtmlPreview(bm);
      assert.ok(!html.includes('<script>'));
      assert.ok(html.includes('&lt;script&gt;'));
      assert.ok(html.includes('&quot;'));
      assert.ok(!html.includes('onload="hack'));
    });

    it('HTML 输出中 URL 是安全的 href', () => {
      const bm = createBookmark({ url: 'https://react.dev/learn?a=1&b=2' });
      const html = BookmarkContentPreview.generateHtmlPreview(bm);
      assert.ok(html.includes('href="https://react.dev/learn?a=1&amp;b=2"'));
    });

    it('null 输入返回空字符串', () => {
      assert.equal(BookmarkContentPreview.generateHtmlPreview(null), '');
    });
  });

  // ==================== generateSnapshotPreview ====================

  describe('generateSnapshotPreview', () => {

    it('有快照内容时包含摘要片段', () => {
      const bm = createBookmark();
      const snapshot = 'This is a long article about React hooks and state management in modern web applications.';
      const preview = BookmarkContentPreview.generateSnapshotPreview(bm, snapshot);
      assert.ok(preview.includes('React 入门教程'));
      assert.ok(preview.includes('React hooks'));
    });

    it('无快照内容时只显示书签基础信息', () => {
      const bm = createBookmark();
      const preview = BookmarkContentPreview.generateSnapshotPreview(bm, null);
      assert.ok(preview.includes('React 入门教程'));
      assert.ok(preview.includes('[react.dev]'));
      assert.ok(!preview.includes('---'));
    });

    it('超长快照内容被截断', () => {
      const bm = createBookmark();
      const longContent = '很长的内容'.repeat(200);
      const preview = BookmarkContentPreview.generateSnapshotPreview(bm, longContent, { maxLength: 200 });
      assert.ok(preview.length <= 260); // maxLength + 50 容差 + 截断标记
    });

    it('null 书签返回空字符串', () => {
      assert.equal(BookmarkContentPreview.generateSnapshotPreview(null, 'content'), '');
    });
  });

  // ==================== _truncate ====================

  describe('_truncate', () => {

    it('短于 maxLength 的文本原样返回', () => {
      assert.equal(BookmarkContentPreview._truncate('hello', 100), 'hello');
    });

    it('超长文本截断并加 "..."', () => {
      const result = BookmarkContentPreview._truncate('abcdef', 3);
      assert.equal(result, 'abc...');
      assert.equal(result.length, 6);
    });

    it('中文字符按字符数截断', () => {
      const result = BookmarkContentPreview._truncate('你好世界欢迎光临', 4);
      assert.equal(result, '你好世界...');
    });

    it('非字符串输入返回空字符串', () => {
      assert.equal(BookmarkContentPreview._truncate(123, 10), '');
      assert.equal(BookmarkContentPreview._truncate(null, 10), '');
      assert.equal(BookmarkContentPreview._truncate(undefined, 10), '');
    });

    it('maxLen <= 0 返回空字符串', () => {
      assert.equal(BookmarkContentPreview._truncate('hello', 0), '');
      assert.equal(BookmarkContentPreview._truncate('hello', -5), '');
    });

    it('恰好等于 maxLen 不截断', () => {
      assert.equal(BookmarkContentPreview._truncate('abc', 3), 'abc');
    });
  });

  // ==================== _escapeHtml ====================

  describe('_escapeHtml', () => {

    it('转义 <script> 标签', () => {
      const result = BookmarkContentPreview._escapeHtml('<script>alert(1)</script>');
      assert.equal(result, '&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('转义双引号和单引号', () => {
      const result = BookmarkContentPreview._escapeHtml('"hello" & \'world\'');
      assert.equal(result, '&quot;hello&quot; &amp; &#39;world&#39;');
    });

    it('转义 & 符号', () => {
      const result = BookmarkContentPreview._escapeHtml('A & B');
      assert.equal(result, 'A &amp; B');
    });

    it('无特殊字符的文本原样返回', () => {
      assert.equal(BookmarkContentPreview._escapeHtml('hello world'), 'hello world');
    });

    it('非字符串输入返回空字符串', () => {
      assert.equal(BookmarkContentPreview._escapeHtml(null), '');
      assert.equal(BookmarkContentPreview._escapeHtml(42), '');
    });
  });

  // ==================== 导出常量 ====================

  describe('导出常量', () => {

    it('DEFAULT_OPTIONS 包含默认值', () => {
      assert.equal(DEFAULT_OPTIONS.maxLength, 200);
      assert.equal(DEFAULT_OPTIONS.includeTags, true);
      assert.equal(DEFAULT_OPTIONS.includeStatus, true);
      assert.equal(DEFAULT_OPTIONS.includeFolder, true);
    });

    it('STATUS_LABELS 包含三种状态映射', () => {
      assert.equal(STATUS_LABELS.unread, '未读');
      assert.equal(STATUS_LABELS.reading, '阅读中');
      assert.equal(STATUS_LABELS.read, '已读');
    });
  });
});
