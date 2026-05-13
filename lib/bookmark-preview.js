/**
 * BookmarkContentPreview — 书签内容预览
 *
 * 纯数据模块，无状态，所有方法为 static。
 * 从书签对象生成纯文本或 HTML 格式的摘要预览，
 * 支持 URL 结构化信息提取和页面快照内容预览。
 *
 * 输入: BookmarkCollector 标准书签对象
 * 输出: 纯文本/HTML 预览字符串
 * 无 I/O，性能 < 5ms。
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 * @property {string}   [status] — 'unread' | 'reading' | 'read'
 * @property {number}   [dateAdded]
 */

/**
 * @typedef {Object} PreviewOptions
 * @property {number}  [maxLength=200]   - 预览最大字符数
 * @property {boolean} [includeTags=true]    - 是否包含标签
 * @property {boolean} [includeStatus=true]  - 是否包含状态
 * @property {boolean} [includeFolder=true]  - 是否包含文件夹路径
 */

/** @type {Readonly<PreviewOptions>} */
const DEFAULT_OPTIONS = Object.freeze({
  maxLength: 200,
  includeTags: true,
  includeStatus: true,
  includeFolder: true,
});

/**
 * @type {Readonly<Record<string, string>>} 状态映射
 * 优先使用 i18n 本地化标签；i18n 未初始化时回退到中文
 */
import { getStatusLabel } from './bookmark-i18n.js'

const STATUS_LABELS = new Proxy({}, {
  get(_, prop) {
    return getStatusLabel(prop) || prop
  },
})

class BookmarkContentPreview {

  // ==================== URL 解析 ====================

  /**
   * 从 URL 提取结构化信息
   * @param {string} url
   * @returns {{ domain: string, path: string, protocol: string, favicon: string }}
   */
  static extractUrlInfo(url) {
    try {
      const parsed = new URL(url);
      return {
        domain: parsed.hostname,
        path: parsed.pathname,
        protocol: parsed.protocol.replace(':', ''),
        favicon: `${parsed.protocol}//${parsed.hostname}/favicon.ico`,
      };
    } catch {
      return { domain: '', path: '', protocol: '', favicon: '' };
    }
  }

  // ==================== 纯文本预览 ====================

  /**
   * 生成纯文本预览
   * @param {Bookmark} bookmark
   * @param {PreviewOptions} [opts]
   * @returns {string}
   */
  static generateTextPreview(bookmark, opts) {
    if (!bookmark || typeof bookmark !== 'object') return '';

    const o = { ...DEFAULT_OPTIONS, ...opts };
    const parts = [];

    // 标题
    if (bookmark.title) {
      parts.push(bookmark.title);
    }

    // URL 域名
    if (bookmark.url) {
      const info = BookmarkContentPreview.extractUrlInfo(bookmark.url);
      if (info.domain) {
        parts.push(`[${info.domain}]`);
      }
    }

    // 文件夹路径
    if (o.includeFolder && bookmark.folderPath && bookmark.folderPath.length > 0) {
      parts.push(`📂 ${bookmark.folderPath.join(' > ')}`);
    }

    // 标签
    if (o.includeTags && bookmark.tags && bookmark.tags.length > 0) {
      parts.push(`🏷 ${bookmark.tags.join(', ')}`);
    }

    // 状态
    if (o.includeStatus && bookmark.status) {
      const label = STATUS_LABELS[bookmark.status] || bookmark.status;
      parts.push(`(${label})`);
    }

    const text = parts.join(' · ');
    return BookmarkContentPreview._truncate(text, o.maxLength);
  }

  // ==================== HTML 预览 ====================

  /**
   * 生成 HTML 预览卡片
   * @param {Bookmark} bookmark
   * @param {PreviewOptions} [opts]
   * @returns {string}
   */
  static generateHtmlPreview(bookmark, opts) {
    if (!bookmark || typeof bookmark !== 'object') return '';

    const o = { ...DEFAULT_OPTIONS, ...opts };
    const esc = BookmarkContentPreview._escapeHtml;
    const lines = [];

    // 标题
    const title = esc(bookmark.title || '(无标题)');
    lines.push(`<div class="preview-title">${title}</div>`);

    // URL + 域名
    if (bookmark.url) {
      const info = BookmarkContentPreview.extractUrlInfo(bookmark.url);
      const safeUrl = esc(bookmark.url);
      const domain = esc(info.domain);
      lines.push(`<a class="preview-url" href="${safeUrl}" target="_blank">${domain}</a>`);
    }

    // 文件夹路径
    if (o.includeFolder && bookmark.folderPath && bookmark.folderPath.length > 0) {
      const folder = esc(bookmark.folderPath.join(' > '));
      lines.push(`<div class="preview-folder">📂 ${folder}</div>`);
    }

    // 标签
    if (o.includeTags && bookmark.tags && bookmark.tags.length > 0) {
      const tagHtml = bookmark.tags.map(t => `<span class="preview-tag">${esc(t)}</span>`).join(' ');
      lines.push(`<div class="preview-tags">🏷 ${tagHtml}</div>`);
    }

    // 状态
    if (o.includeStatus && bookmark.status) {
      const label = STATUS_LABELS[bookmark.status] || bookmark.status;
      lines.push(`<div class="preview-status">${esc(label)}</div>`);
    }

    return `<div class="bookmark-preview">${lines.join('')}</div>`;
  }

  // ==================== 快照预览 ====================

  /**
   * 从页面快照生成内容预览
   * @param {Bookmark} bookmark
   * @param {string} snapshotContent — 页面快照文本内容
   * @param {PreviewOptions} [opts]
   * @returns {string}
   */
  static generateSnapshotPreview(bookmark, snapshotContent, opts) {
    if (!bookmark || typeof bookmark !== 'object') return '';

    const o = { ...DEFAULT_OPTIONS, ...opts };
    const esc = BookmarkContentPreview._escapeHtml;

    const parts = [];

    // 书签基础预览（不截断，保留完整信息）
    const base = BookmarkContentPreview.generateTextPreview(bookmark, { ...o, maxLength: Number.MAX_SAFE_INTEGER });
    parts.push(base);

    // 快照摘要
    if (snapshotContent && typeof snapshotContent === 'string') {
      // 移除多余空白，提取摘要
      const cleaned = snapshotContent.replace(/\s+/g, ' ').trim();
      const snippet = BookmarkContentPreview._truncate(cleaned, o.maxLength);
      parts.push(`\n---\n${snippet}`);
    }

    const text = parts.join('');
    return BookmarkContentPreview._truncate(text, o.maxLength + 50); // 允许略超，包含分隔符
  }

  // ==================== 内部工具 ====================

  /**
   * 截断文本，超长加 "..."
   * @param {string} text
   * @param {number} maxLen
   * @returns {string}
   */
  static _truncate(text, maxLen) {
    if (typeof text !== 'string') return '';
    if (!Number.isFinite(maxLen) || maxLen <= 0) return '';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  }

  /**
   * 转义 HTML 特殊字符: < > & " '
   * @param {string} str
   * @returns {string}
   */
  static _escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// ==================== 导出 ====================

export { BookmarkContentPreview, DEFAULT_OPTIONS, STATUS_LABELS };
