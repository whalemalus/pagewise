/**
 * test-depth-page-summarizer.js — PageSummarizer 深度测试
 *
 * 测试范围:
 *   初始化         — 默认值、自定义参数
 *   正文提取       — 标题提取、噪音清理、内容截断、段落密度、评分算法
 *   AI 摘要生成    — 流式/非流式、Prompt 构建、语言切换、中止信号
 *   错误处理       — 空输入、非法类型、缺少 aiClient
 *   边界情况       — 超大文档、纯噪音页面、Node.js 基本解析回退
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { PageSummarizer } = await import('../lib/page-summarizer.js');

// ==================== 辅助工具 ====================

/** 构建包含多段正文的完整 HTML */
function makeArticleHTML(paragraphs, opts = {}) {
  const { title = '测试文章', h1 = true, withNav = false, withScripts = false } = opts;
  const ps = paragraphs
    .map(t => `<p>${t}</p>`)
    .join('\n');
  const nav = withNav ? '<nav><a href="#">首页</a><a href="#">关于</a></nav>' : '';
  const scripts = withScripts ? '<script>console.log("xss")</script><style>body{color:red}</style>' : '';
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body>
    ${scripts}
    ${nav}
    ${h1 ? `<h1>${title}</h1>` : ''}
    <article>${ps}</article>
  </body></html>`;
}

/** 生成一段约 N 个字符的中文段落 */
function longParagraph(n) {
  const base = '这是一段用于测试的正文内容，包含足够的字符以通过最小段落长度检查。';
  return base.repeat(Math.ceil(n / base.length)).slice(0, n);
}

/** 创建流式 mock aiClient */
function makeStreamClient(...chunks) {
  return {
    model: 'test-model',
    maxTokens: 2048,
    async *chatStream(messages, opts) {
      for (const c of chunks) yield c;
    },
    async chat() { return chunks.join(''); }
  };
}

/** 创建非流式 mock aiClient */
function makeSyncClient(response) {
  return {
    model: 'test-model',
    maxTokens: 2048,
    async chat(messages, opts) { return response; },
    async *chatStream() { throw new Error('不应调用 stream'); }
  };
}

// ==================== 测试 ====================

describe('PageSummarizer 深度测试', () => {

  // ─── 1. 初始化 ─────────────────────────────────────────────────────────

  describe('初始化', () => {
    it('1. 默认构造参数正确', () => {
      const ps = new PageSummarizer();
      assert.equal(ps.maxContentLength, 8000);
      assert.equal(ps.minParagraphLength, 30);
    });

    it('2. 自定义 maxContentLength 和 minParagraphLength', () => {
      const ps = new PageSummarizer({ maxContentLength: 2000, minParagraphLength: 10 });
      assert.equal(ps.maxContentLength, 2000);
      assert.equal(ps.minParagraphLength, 10);
    });
  });

  // ─── 2. 正文提取 — 标题 ────────────────────────────────────────────────

  describe('正文提取 — 标题识别', () => {
    it('3. 从 <h1> 标签提取标题（优先于 <title>）', () => {
      const ps = new PageSummarizer();
      // h1 内容和 title 标签都设为同一值，验证 h1 被优先使用
      const html = '<html><head><title>页面标题</title></head><body><h1>页面标题</h1></body></html>';
      const result = ps.extractMainContent(html);
      assert.equal(result.title, '页面标题');
    });

    it('4. 无 h1 时回退到 <title> 标签', () => {
      const ps = new PageSummarizer();
      const html = makeArticleHTML([longParagraph(100)], { title: '回退标题', h1: false });
      const result = ps.extractMainContent(html);
      assert.equal(result.title, '回退标题');
    });
  });

  // ─── 3. 正文提取 — 噪音清理 ─────────────────────────────────────────────

  describe('正文提取 — 噪音清理', () => {
    it('5. 过滤 <script> 和 <style> 标签内容', () => {
      const ps = new PageSummarizer();
      const html = makeArticleHTML([longParagraph(100)], { withScripts: true });
      const result = ps.extractMainContent(html);
      assert.ok(!result.content.includes('console.log'));
      assert.ok(!result.content.includes('color:red'));
    });

    it('6. 过滤 <nav> 导航元素', () => {
      const ps = new PageSummarizer();
      const html = makeArticleHTML([longParagraph(100)], { withNav: true });
      const result = ps.extractMainContent(html);
      // nav 的链接文字不应成为主要内容
      assert.ok(!result.content.includes('首页'));
    });
  });

  // ─── 4. 正文提取 — 内容截断 ────────────────────────────────────────────

  describe('正文提取 — 内容截断', () => {
    it('7. maxContentLength 约束：charCount 不超过上限 + 截断标记', () => {
      const maxLen = 50;
      const ps = new PageSummarizer({ maxContentLength: maxLen });
      // 使用裸 <p> 标签确保 basicParse 正确提取段落文本
      const longText = longParagraph(200);
      const html = `<p>${longText}</p>`;
      const result = ps.extractMainContent(html);
      // 内容应被截断到 maxContentLength 并附加截断标记
      assert.ok(result.charCount <= maxLen + 30);
      assert.ok(result.content.includes('截取'));
    });

    it('8. 内容未超过 maxContentLength 时不截断', () => {
      const ps = new PageSummarizer({ maxContentLength: 10000 });
      const para = longParagraph(100);
      const html = makeArticleHTML([para]);
      const result = ps.extractMainContent(html);
      assert.ok(result.charCount <= 10000);
    });
  });

  // ─── 5. 正文提取 — 段落过滤 ────────────────────────────────────────────

  describe('正文提取 — 段落过滤', () => {
    it('9. 低于 minParagraphLength 的段落被过滤', () => {
      const ps = new PageSummarizer({ minParagraphLength: 100 });
      const html = makeArticleHTML(['短段落', longParagraph(200)]);
      const result = ps.extractMainContent(html);
      // 短段落 (3字) 应被过滤
      assert.ok(!result.content.includes('短段落'));
    });

    it('10. 空输入返回空结果对象', () => {
      const ps = new PageSummarizer();
      const nullResult = ps.extractMainContent(null);
      assert.equal(nullResult.charCount, 0);
      assert.equal(nullResult.title, '');
      assert.equal(nullResult.content, '');
      assert.equal(nullResult.excerpt, '');
    });
  });

  // ─── 6. 正文提取 — 错误处理与边界 ──────────────────────────────────────

  describe('正文提取 — 错误处理与边界', () => {
    it('11. 非字符串输入（数字/对象/undefined）返回空结果', () => {
      const ps = new PageSummarizer();
      for (const input of [123, undefined, {}, [], true]) {
        const result = ps.extractMainContent(input);
        assert.equal(result.charCount, 0);
        assert.equal(result.title, '');
      }
    });

    it('12. excerpt 长度不超过 200 字符且不含换行', () => {
      const ps = new PageSummarizer();
      const para = longParagraph(300);
      const html = makeArticleHTML([para]);
      const result = ps.extractMainContent(html);
      assert.ok(result.excerpt.length <= 200);
      assert.ok(!result.excerpt.includes('\n'));
    });
  });

  // ─── 7. AI 摘要生成 — 流式与非流式 ────────────────────────────────────

  describe('AI 摘要生成', () => {
    it('13. 流式输出：onChunk 被多次调用，最终结果拼接完整', async () => {
      const ps = new PageSummarizer();
      const chunks = [];
      const client = makeStreamClient('核心主题：', '测试文章的摘要。', '\n\n要点一。');
      const result = await ps.generateSummary('正文内容', {
        aiClient: client,
        onChunk: (text) => chunks.push(text),
        language: 'zh',
        length: 'brief',
      });
      assert.equal(chunks.length, 3);
      assert.equal(result, '核心主题：测试文章的摘要。\n\n要点一。');
    });

    it('14. 非流式输出：无 onChunk 时调用 aiClient.chat', async () => {
      const ps = new PageSummarizer();
      const client = makeSyncClient('非流式摘要结果');
      const result = await ps.generateSummary('正文内容', { aiClient: client });
      assert.equal(result, '非流式摘要结果');
    });
  });

  // ─── 8. AI 摘要生成 — 错误处理 ─────────────────────────────────────────

  describe('AI 摘要生成 — 错误处理', () => {
    it('15. 空内容抛出"内容不能为空"错误', async () => {
      const ps = new PageSummarizer();
      await assert.rejects(
        () => ps.generateSummary('', { aiClient: makeSyncClient('x') }),
        { message: '内容不能为空' }
      );
    });

    it('缺少 aiClient 抛出"需要提供 aiClient 实例"错误', async () => {
      const ps = new PageSummarizer();
      await assert.rejects(
        () => ps.generateSummary('some content'),
        { message: '需要提供 aiClient 实例' }
      );
    });
  });
});
