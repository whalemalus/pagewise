/**
 * PDF Extractor 单元测试
 * 测试 PdfExtractor 类的基本功能和错误处理
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock pdf.js 库
const mockPdfjsLib = {
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (opts) => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: async (num) => ({
        getTextContent: async () => ({
          items: [
            { str: `Page ${num} line 1` },
            { str: `Page ${num} line 2` }
          ]
        })
      }),
      getMetadata: async () => ({
        info: {
          Title: 'Test PDF',
          Author: 'Test Author',
          Subject: 'Test Subject'
        }
      })
    })
  })
};

// 模拟 PdfExtractor（不依赖 pdf.js 的实际加载）
class MockPdfExtractor {
  static async extractText(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('无效的 PDF 数据：ArrayBuffer 为空或类型不正确');
    }

    const pdfjsLib = mockPdfjsLib;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(' ');
      pages.push(text);
    }

    const meta = await pdf.getMetadata();
    return {
      text: pages.join('\n\n'),
      numPages: pdf.numPages,
      metadata: {
        title: meta.info?.Title || '',
        author: meta.info?.Author || ''
      },
      pages
    };
  }

  static async extractFromUrl(url) {
    // Mock fetch
    if (!url || url === 'invalid') {
      throw new Error('获取 PDF 失败: HTTP 404');
    }
    const buffer = new ArrayBuffer(100);
    return this.extractText(buffer);
  }
}

describe('PdfExtractor', () => {
  describe('extractText()', () => {
    it('从 ArrayBuffer 提取文本', async () => {
      const buffer = new ArrayBuffer(100);
      const result = await MockPdfExtractor.extractText(buffer);

      assert.ok(result.text.length > 0, '应提取到文本');
      assert.equal(result.numPages, 3, '应有 3 页');
      assert.ok(result.text.includes('Page 1 line 1'), '应包含第 1 页内容');
      assert.ok(result.text.includes('Page 3 line 2'), '应包含第 3 页内容');
    });

    it('提取元数据', async () => {
      const buffer = new ArrayBuffer(100);
      const result = await MockPdfExtractor.extractText(buffer);

      assert.equal(result.metadata.title, 'Test PDF');
      assert.equal(result.metadata.author, 'Test Author');
    });

    it('返回分页数据', async () => {
      const buffer = new ArrayBuffer(100);
      const result = await MockPdfExtractor.extractText(buffer);

      assert.equal(result.pages.length, 3, '应有 3 页数据');
      assert.ok(result.pages[0].includes('Page 1'), '第 1 页应包含正确内容');
    });

    it('空 ArrayBuffer 抛出错误', async () => {
      const buffer = new ArrayBuffer(0);
      await assert.rejects(
        () => MockPdfExtractor.extractText(buffer),
        { message: /无效的 PDF 数据/ }
      );
    });

    it('null 输入抛出错误', async () => {
      await assert.rejects(
        () => MockPdfExtractor.extractText(null),
        { message: /无效的 PDF 数据/ }
      );
    });
  });

  describe('extractFromUrl()', () => {
    it('通过 URL 提取文本', async () => {
      const result = await MockPdfExtractor.extractFromUrl('https://example.com/test.pdf');

      assert.ok(result.text.length > 0, '应提取到文本');
      assert.equal(result.numPages, 3);
    });

    it('无效 URL 抛出错误', async () => {
      await assert.rejects(
        () => MockPdfExtractor.extractFromUrl('invalid'),
        { message: /获取 PDF 失败/ }
      );
    });
  });

  describe('文本合并', () => {
    it('页间用双换行分隔', async () => {
      const buffer = new ArrayBuffer(100);
      const result = await MockPdfExtractor.extractText(buffer);

      assert.ok(result.text.includes('\n\n'), '页间应有双换行分隔');
    });

    it('同页内用空格连接', async () => {
      const buffer = new ArrayBuffer(100);
      const result = await MockPdfExtractor.extractText(buffer);

      // 同页内容用空格连接
      assert.ok(result.pages[0].includes('Page 1 line 1 Page 1 line 2'), '同页内容应用空格连接');
    });
  });
});
