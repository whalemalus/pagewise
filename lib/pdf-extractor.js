/**
 * PDF 文本提取器 — 使用 pdf.js 进行可靠提取
 * 
 * 在 background service worker 中使用 ES module import 加载 pdf.js
 * 通过消息协议供 content script 和 sidebar 调用
 */

let _pdfjsLib = null;

/**
 * 懒加载 pdf.js 库
 * @returns {Promise<Object>} pdfjsLib
 */
async function loadPdfJs() {
  if (_pdfjsLib) return _pdfjsLib;

  // 动态导入 pdf.js ES module
  const pdfjsModule = await import('./pdf.min.mjs');
  // pdf.js v4 使用命名导出，也可能通过 default 导出
  _pdfjsLib = pdfjsModule;

  // 设置 worker 路径
  // 在 service worker 中，使用 chrome.runtime.getURL 获取扩展内文件路径
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    _pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');
  }

  return _pdfjsLib;
}

/**
 * PDF 文本提取器类
 */
export class PdfExtractor {
  /**
   * 从 ArrayBuffer 中提取 PDF 文本
   * @param {ArrayBuffer} arrayBuffer - PDF 文件的 ArrayBuffer 数据
   * @returns {Promise<{ text: string, numPages: number, metadata: Object, pages: string[] }>}
   */
  static async extractText(arrayBuffer) {
    if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
      throw new Error('无效的 PDF 数据：ArrayBuffer 为空或类型不正确');
    }

    const pdfjsLib = await loadPdfJs();

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (err) {
      throw new Error(`PDF 加载失败: ${err.message}`);
    }

    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(' ');
      pages.push(text);
    }

    // 提取元数据
    let metadata = {};
    try {
      const meta = await pdf.getMetadata();
      metadata = {
        title: meta.info?.Title || '',
        author: meta.info?.Author || '',
        subject: meta.info?.Subject || '',
        keywords: meta.info?.Keywords || '',
        creator: meta.info?.Creator || '',
        producer: meta.info?.Producer || '',
        creationDate: meta.info?.CreationDate || '',
        modDate: meta.info?.ModDate || ''
      };
    } catch (e) {
      // 元数据提取失败不阻断流程
    }

    return {
      text: pages.join('\n\n'),
      numPages: pdf.numPages,
      metadata,
      pages
    };
  }

  /**
   * 通过 URL 获取 PDF 并提取文本
   * @param {string} url - PDF 文件的 URL
   * @returns {Promise<{ text: string, numPages: number, metadata: Object, pages: string[] }>}
   */
  static async extractFromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`获取 PDF 失败: HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return this.extractText(buffer);
  }
}
