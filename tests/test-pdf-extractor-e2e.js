/**
 * E2E 测试 lib/pdf-extractor.js — PdfExtractor 类全覆盖
 *
 * 测试范围：
 *   extractText: 有效 PDF、多页 PDF、元数据提取、返回结构验证、
 *                pages 数组与 numPages 一致性、单页 PDF、文本非空
 *   extractFromUrl: 正常 URL (mock fetch)、HTTP 错误、网络错误
 *   错误处理: null 输入、空 ArrayBuffer、非 PDF 数据
 *
 * 注意：extractText 内部依赖 pdf.js (pdf.min.mjs)，
 *       extractFromUrl 依赖全局 fetch，使用 node:test mock。
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ---------- 动态导入 ----------
const { PdfExtractor } = await import('../lib/pdf-extractor.js');

// ================================================================
//  辅助：generateMinimalPdf — 生成最小有效 PDF
// ================================================================

/**
 * 生成一个最小有效 PDF 的 ArrayBuffer
 * @param {number} pages - 页数（≥1）
 * @param {Object} [options]
 * @param {string} [options.text] - 所有页共用文本
 * @param {string[]} [options.pageTexts] - 每页独立文本（优先于 text）
 * @param {string} [options.title] - PDF 元数据 title
 * @param {string} [options.author] - PDF 元数据 author
 * @param {string} [options.subject] - PDF 元数据 subject
 * @returns {ArrayBuffer}
 */
function generateMinimalPdf(pages = 1, options = {}) {
  const encoder = new TextEncoder();

  // 对象 ID 分配方案：
  //   1 = Catalog
  //   2 = Pages
  //   3 .. 3+pages-1 = Page objects
  //   3+pages .. 3+2*pages-1 = Content streams
  //   3+2*pages = Font
  //   3+2*pages+1 = Info (optional)
  const catalogId = 1;
  const pagesId = 2;
  const firstPageId = 3;
  const firstStreamId = 3 + pages;
  const fontId = 3 + 2 * pages;

  let pdf = '%PDF-1.4\n';
  const offsets = {};

  function writeObj(id, content) {
    offsets[id] = pdf.length;
    pdf += id + ' 0 obj\n' + content + '\nendobj\n';
  }

  // 1) Catalog
  writeObj(catalogId, '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');

  // 2) Pages
  const kids = [];
  for (let i = 0; i < pages; i++) kids.push((firstPageId + i) + ' 0 R');
  writeObj(pagesId, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages + ' >>');

  // Font
  writeObj(fontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  // Page objects + content streams
  for (let i = 0; i < pages; i++) {
    const pageText =
      (options.pageTexts && options.pageTexts[i]) ||
      options.text ||
      'Hello PDF Test';
    const stream = 'BT /F1 12 Tf 100 700 Td (' + pageText + ') Tj ET';
    const streamId = firstStreamId + i;
    writeObj(
      streamId,
      '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'
    );
    writeObj(
      firstPageId + i,
      '<< /Type /Page /Parent ' + pagesId +
        ' 0 R /MediaBox [0 0 612 792] /Contents ' + streamId +
        ' 0 R /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> >>'
    );
  }

  // 可选 Info 对象（元数据）
  const infoId = fontId + 1;
  const hasInfo = !!(options.title || options.author || options.subject);
  if (hasInfo) {
    let info = '<< ';
    if (options.title) info += '/Title (' + options.title + ') ';
    if (options.author) info += '/Author (' + options.author + ') ';
    if (options.subject) info += '/Subject (' + options.subject + ') ';
    info += '>>';
    writeObj(infoId, info);
  }

  // Xref
  const totalObjs = hasInfo ? infoId + 1 : fontId + 1;
  const xrefOffset = pdf.length;
  let xref = 'xref\n0 ' + totalObjs + '\n';
  xref += '0000000000 65535 f \n';
  for (let i = 1; i < totalObjs; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }

  // Trailer
  let trailer = 'trailer\n<< /Size ' + totalObjs + ' /Root ' + catalogId + ' 0 R';
  if (hasInfo) trailer += ' /Info ' + infoId + ' 0 R';
  trailer += ' >>\nstartxref\n' + xrefOffset + '\n%%EOF';
  pdf += xref + trailer;

  const buffer = encoder.encode(pdf);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

// ================================================================
//  1. extractText — 返回结构验证
// ================================================================

describe('PdfExtractor.extractText — 返回结构验证', () => {
  it('返回对象包含 text / numPages / metadata / pages 四个字段', async () => {
    const buf = generateMinimalPdf(1);
    const result = await PdfExtractor.extractText(buf);
    assert.ok('text' in result, '缺少 text 字段');
    assert.ok('numPages' in result, '缺少 numPages 字段');
    assert.ok('metadata' in result, '缺少 metadata 字段');
    assert.ok('pages' in result, '缺少 pages 字段');
    assert.equal(typeof result.text, 'string');
    assert.equal(typeof result.numPages, 'number');
    assert.equal(typeof result.metadata, 'object');
    assert.ok(Array.isArray(result.pages));
  });

  it('pages 数组长度与 numPages 一致', async () => {
    const buf = generateMinimalPdf(3, {
      pageTexts: ['AAA', 'BBB', 'CCC'],
    });
    const result = await PdfExtractor.extractText(buf);
    assert.equal(result.numPages, 3);
    assert.equal(result.pages.length, 3);
  });
});

// ================================================================
//  2. extractText — 单页 PDF
// ================================================================

describe('PdfExtractor.extractText — 单页 PDF', () => {
  it('提取单页文本内容非空', async () => {
    const buf = generateMinimalPdf(1, { text: 'SinglePageContent' });
    const result = await PdfExtractor.extractText(buf);
    assert.equal(result.numPages, 1);
    assert.equal(result.pages.length, 1);
    assert.ok(result.pages[0].includes('SinglePageContent'));
    assert.ok(result.text.includes('SinglePageContent'));
  });

  it('numPages 为 1', async () => {
    const buf = generateMinimalPdf(1);
    const result = await PdfExtractor.extractText(buf);
    assert.equal(result.numPages, 1);
  });
});

// ================================================================
//  3. extractText — 多页 PDF
// ================================================================

describe('PdfExtractor.extractText — 多页 PDF', () => {
  it('三页 PDF 正确提取各页文本', async () => {
    const buf = generateMinimalPdf(3, {
      pageTexts: ['Alpha', 'Beta', 'Gamma'],
    });
    const result = await PdfExtractor.extractText(buf);
    assert.equal(result.numPages, 3);
    assert.equal(result.pages.length, 3);
    assert.ok(result.pages[0].includes('Alpha'));
    assert.ok(result.pages[1].includes('Beta'));
    assert.ok(result.pages[2].includes('Gamma'));
  });

  it('text 由 pages 拼接（\\n\\n 分隔）', async () => {
    const buf = generateMinimalPdf(2, {
      pageTexts: ['First', 'Second'],
    });
    const result = await PdfExtractor.extractText(buf);
    // text = pages.join('\n\n')
    const expected = result.pages.join('\n\n');
    assert.equal(result.text, expected);
  });
});

// ================================================================
//  4. extractText — 元数据提取
// ================================================================

describe('PdfExtractor.extractText — 元数据提取', () => {
  it('带 title 和 author 的 PDF 返回正确元数据', async () => {
    const buf = generateMinimalPdf(1, {
      title: 'MyTitle',
      author: 'MyAuthor',
      text: 'MetaTest',
    });
    const result = await PdfExtractor.extractText(buf);
    assert.equal(result.metadata.title, 'MyTitle');
    assert.equal(result.metadata.author, 'MyAuthor');
  });

  it('无 Info 对象时 metadata 字段均为默认值', async () => {
    const buf = generateMinimalPdf(1, { text: 'NoMeta' });
    const result = await PdfExtractor.extractText(buf);
    assert.equal(typeof result.metadata, 'object');
    assert.equal(result.metadata.title, '');
  });
});

// ================================================================
//  5. extractText — 错误处理
// ================================================================

describe('PdfExtractor.extractText — 错误处理', () => {
  it('null 输入抛出 "无效的 PDF 数据"', async () => {
    await assert.rejects(
      () => PdfExtractor.extractText(null),
      { message: /无效的 PDF 数据/ }
    );
  });

  it('空 ArrayBuffer 抛出 "无效的 PDF 数据"', async () => {
    await assert.rejects(
      () => PdfExtractor.extractText(new ArrayBuffer(0)),
      { message: /无效的 PDF 数据/ }
    );
  });

  it('非 ArrayBuffer 类型抛出 "无效的 PDF 数据"', async () => {
    await assert.rejects(
      () => PdfExtractor.extractText('not an arraybuffer'),
      { message: /无效的 PDF 数据/ }
    );
  });

  it('非 PDF 内容（随机字节）抛出 "PDF 加载失败"', async () => {
    const randomBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await assert.rejects(
      () => PdfExtractor.extractText(randomBytes.buffer),
      { message: /PDF 加载失败/ }
    );
  });
});

// ================================================================
//  6. extractFromUrl — 正常 URL (mock fetch)
// ================================================================

describe('PdfExtractor.extractFromUrl — 正常 URL', () => {
  it('通过 URL 获取并提取文本', async () => {
    const pdfBuf = generateMinimalPdf(1, { text: 'UrlContent' });

    const fetchMock = mock.method(globalThis, 'fetch', async (url) => ({
      ok: true,
      arrayBuffer: async () => pdfBuf,
    }));

    try {
      const result = await PdfExtractor.extractFromUrl(
        'https://example.com/test.pdf'
      );
      assert.equal(result.numPages, 1);
      assert.ok(result.pages[0].includes('UrlContent'));
      assert.equal(fetchMock.mock.calls.length, 1);
      assert.equal(
        fetchMock.mock.calls[0].arguments[0],
        'https://example.com/test.pdf'
      );
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('多页 PDF 通过 URL 正确提取', async () => {
    const pdfBuf = generateMinimalPdf(2, {
      pageTexts: ['URL-Page1', 'URL-Page2'],
    });

    const fetchMock = mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      arrayBuffer: async () => pdfBuf,
    }));

    try {
      const result = await PdfExtractor.extractFromUrl(
        'https://example.com/multi.pdf'
      );
      assert.equal(result.numPages, 2);
      assert.ok(result.pages[0].includes('URL-Page1'));
      assert.ok(result.pages[1].includes('URL-Page2'));
    } finally {
      fetchMock.mock.restore();
    }
  });
});

// ================================================================
//  7. extractFromUrl — HTTP 错误
// ================================================================

describe('PdfExtractor.extractFromUrl — HTTP 错误', () => {
  it('HTTP 404 抛出 "获取 PDF 失败: HTTP 404"', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 404,
    }));

    try {
      await assert.rejects(
        () => PdfExtractor.extractFromUrl('https://example.com/missing.pdf'),
        { message: /获取 PDF 失败: HTTP 404/ }
      );
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('HTTP 500 抛出 "获取 PDF 失败: HTTP 500"', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 500,
    }));

    try {
      await assert.rejects(
        () => PdfExtractor.extractFromUrl('https://example.com/error.pdf'),
        { message: /获取 PDF 失败: HTTP 500/ }
      );
    } finally {
      fetchMock.mock.restore();
    }
  });
});

// ================================================================
//  8. extractFromUrl — 网络错误
// ================================================================

describe('PdfExtractor.extractFromUrl — 网络错误', () => {
  it('fetch 拒绝时错误向上冒泡', async () => {
    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async () => { throw new Error('Network failure'); }
    );

    try {
      await assert.rejects(
        () => PdfExtractor.extractFromUrl('https://example.com/unreachable.pdf'),
        { message: /Network failure/ }
      );
    } finally {
      fetchMock.mock.restore();
    }
  });
});

// ================================================================
//  9. 边界 — 文本内容验证
// ================================================================

describe('PdfExtractor.extractText — 文本内容验证', () => {
  it('提取的文本包含预期关键词', async () => {
    const buf = generateMinimalPdf(1, { text: 'UniqueKeyword12345' });
    const result = await PdfExtractor.extractText(buf);
    assert.ok(result.text.includes('UniqueKeyword12345'));
  });

  it('每页 pages[i] 内容独立正确', async () => {
    const buf = generateMinimalPdf(4, {
      pageTexts: ['P1-Data', 'P2-Data', 'P3-Data', 'P4-Data'],
    });
    const result = await PdfExtractor.extractText(buf);
    for (let i = 0; i < 4; i++) {
      assert.ok(
        result.pages[i].includes(`P${i + 1}-Data`),
        `第 ${i + 1} 页应包含 P${i + 1}-Data`
      );
    }
  });
});
