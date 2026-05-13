/**
 * BookmarkCore — 核心存储 + CRUD
 * 合并: collector, indexer, status, preview
 */

import { getStatusLabel } from './bookmark-i18n.js'

// ==================== BookmarkCollector ====================

export class BookmarkCollector {
  constructor() {
    this.bookmarks = [];
    this._urlIndex = new Map();
  }

  async collect() {
    this.bookmarks = [];
    this._urlIndex = new Map();
    if (typeof chrome === 'undefined' || !chrome.bookmarks) {
      console.warn('BookmarkCollector: chrome.bookmarks API not available, returning empty array');
      return this.bookmarks;
    }
    let tree;
    try { tree = await chrome.bookmarks.getTree(); }
    catch (err) { console.warn(`BookmarkCollector: Failed to read bookmark tree: ${err.message}`); return this.bookmarks; }
    if (!tree || !Array.isArray(tree) || tree.length === 0) return this.bookmarks;
    for (const rootNode of tree) this._walk(rootNode, []);
    return this.bookmarks;
  }

  normalize(node, folderPath = []) {
    if (!node || !node.url) return null;
    const title = node.title || '';
    const dateAdded = node.dateAdded || 0;
    return {
      id: String(node.id), title, url: node.url,
      folderPath: [...folderPath], dateAdded,
      dateAddedISO: dateAdded ? new Date(dateAdded).toISOString() : '',
    };
  }

  getStats() {
    const total = this.bookmarks.length;
    const domainDistribution = {};
    for (const bm of this.bookmarks) {
      try {
        const domain = new URL(bm.url).hostname.replace(/^www\./, '');
        domainDistribution[domain] = (domainDistribution[domain] || 0) + 1;
      } catch { domainDistribution['unknown'] = (domainDistribution['unknown'] || 0) + 1; }
    }
    const folderSet = new Set();
    for (const bm of this.bookmarks) {
      for (let i = 1; i <= bm.folderPath.length; i++) folderSet.add(bm.folderPath.slice(0, i).join('/'));
    }
    return { total, folders: folderSet.size, domainDistribution };
  }

  _walk(node, currentPath) {
    if (!node) return;
    const isFolder = !!(node.children && !node.url);
    const nextPath = isFolder && node.title ? [...currentPath, node.title] : currentPath;
    if (!isFolder) {
      const normalized = this.normalize(node, currentPath);
      if (normalized) {
        this.bookmarks.push(normalized);
        const existing = this._urlIndex.get(normalized.url);
        if (existing) existing.push(normalized); else this._urlIndex.set(normalized.url, [normalized]);
      }
    }
    if (node.children) { for (const child of node.children) this._walk(child, nextPath); }
  }
}

// ==================== BookmarkIndexer ====================

export class BookmarkIndexer {
  constructor() {
    this._invertedIndex = new Map();
    this._bookmarkStore = new Map();
    this._folderIndex = new Map();
  }

  buildIndex(bookmarks) {
    this._invertedIndex.clear(); this._bookmarkStore.clear(); this._folderIndex.clear();
    if (!Array.isArray(bookmarks)) return;
    for (const bm of bookmarks) this.addBookmark(bm);
  }

  search(query, options = {}) {
    if (!query || typeof query !== 'string') return [];
    const { folder, tags, limit = 50 } = options;
    const tokens = _tokenize(query.trim());
    if (tokens.length === 0) return [];
    let candidateIds = null;
    for (const token of tokens) {
      const matchedIds = this._invertedIndex.get(token);
      if (!matchedIds) return [];
      if (candidateIds === null) { candidateIds = new Set(matchedIds); }
      else {
        const intersection = new Set();
        for (const id of candidateIds) { if (matchedIds.has(id)) intersection.add(id); }
        candidateIds = intersection;
      }
      if (candidateIds.size === 0) return [];
    }
    if (candidateIds === null) return [];
    let results = [];
    for (const id of candidateIds) {
      const bm = this._bookmarkStore.get(id);
      if (!bm) continue;
      if (folder && !_matchesFolder(bm, folder)) continue;
      if (tags && tags.length > 0 && !_matchesTags(bm, tags)) continue;
      results.push({ id, score: _computeIndexScore(bm, tokens), bookmark: bm });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  addBookmark(bookmark) {
    if (!bookmark || !bookmark.id) return;
    const id = String(bookmark.id);
    this._bookmarkStore.set(id, bookmark);
    for (const token of _extractTokens(bookmark)) {
      let entry = this._invertedIndex.get(token);
      if (!entry) { entry = new Set(); this._invertedIndex.set(token, entry); }
      entry.add(id);
    }
    if (bookmark.folderPath && Array.isArray(bookmark.folderPath)) {
      const folderKey = bookmark.folderPath.join('/');
      if (folderKey) {
        let folderSet = this._folderIndex.get(folderKey);
        if (!folderSet) { folderSet = new Set(); this._folderIndex.set(folderKey, folderSet); }
        folderSet.add(id);
      }
    }
  }

  removeBookmark(id) {
    const strId = String(id);
    if (!this._bookmarkStore.has(strId)) return false;
    const bm = this._bookmarkStore.get(strId);
    for (const token of _extractTokens(bm)) {
      const entry = this._invertedIndex.get(token);
      if (entry) { entry.delete(strId); if (entry.size === 0) this._invertedIndex.delete(token); }
    }
    if (bm.folderPath && Array.isArray(bm.folderPath)) {
      const folderKey = bm.folderPath.join('/');
      if (folderKey) {
        const folderSet = this._folderIndex.get(folderKey);
        if (folderSet) { folderSet.delete(strId); if (folderSet.size === 0) this._folderIndex.delete(folderKey); }
      }
    }
    this._bookmarkStore.delete(strId);
    return true;
  }

  getSize() { return { bookmarks: this._bookmarkStore.size, tokens: this._invertedIndex.size, folders: this._folderIndex.size }; }
}

// ==================== BookmarkStatusManager ====================

export const VALID_STATUSES = ['unread', 'reading', 'read'];

export class BookmarkStatusManager {
  #bookmarkMap = new Map();
  #statusMap = new Map();
  #tick = 0;

  constructor(bookmarks = []) {
    if (!Array.isArray(bookmarks)) throw new TypeError('bookmarks must be an array');
    for (const bm of bookmarks) { if (bm && bm.id) this.#bookmarkMap.set(String(bm.id), bm); }
  }

  setStatus(bookmarkId, status) {
    const id = String(bookmarkId);
    if (!VALID_STATUSES.includes(status)) return false;
    if (!this.#bookmarkMap.has(id)) return false;
    this.#statusMap.set(id, { status, updatedAt: ++this.#tick });
    return true;
  }

  getStatus(bookmarkId) {
    const id = String(bookmarkId);
    if (!this.#bookmarkMap.has(id)) return null;
    const record = this.#statusMap.get(id);
    return record ? record.status : 'unread';
  }

  batchSetStatus(bookmarkIds, status) {
    if (!Array.isArray(bookmarkIds)) return 0;
    if (!VALID_STATUSES.includes(status)) return 0;
    let count = 0;
    for (const id of bookmarkIds) { if (this.setStatus(id, status)) count++; }
    return count;
  }

  getByStatus(status) {
    if (!VALID_STATUSES.includes(status)) return [];
    const results = [];
    for (const [id, bm] of this.#bookmarkMap) { if (this.getStatus(id) === status) results.push(bm); }
    return results;
  }

  getStatusCounts() {
    const counts = { unread: 0, reading: 0, read: 0 };
    for (const [id] of this.#bookmarkMap) { counts[this.getStatus(id)]++; }
    return counts;
  }

  markAllAsRead(bookmarkIds) { return this.batchSetStatus(bookmarkIds, 'read'); }

  getRecentlyRead(limit = 10) {
    const entries = [];
    for (const [id, record] of this.#statusMap) {
      if (record.status === 'read' && this.#bookmarkMap.has(id))
        entries.push({ bookmark: this.#bookmarkMap.get(id), updatedAt: record.updatedAt });
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries.slice(0, limit).map(e => e.bookmark);
  }
}

// ==================== BookmarkContentPreview ====================

export const DEFAULT_OPTIONS = Object.freeze({ maxLength: 200, includeTags: true, includeStatus: true, includeFolder: true });

/**
 * 状态标签 — i18n 代理对象
 * 访问时动态获取当前语言的翻译，未初始化时回退到中文
 */
export const STATUS_LABELS = new Proxy({}, {
  get(_, prop) {
    return getStatusLabel(prop) || prop
  },
})

export class BookmarkContentPreview {
  static extractUrlInfo(url) {
    try {
      const p = new URL(url);
      return { domain: p.hostname, path: p.pathname, protocol: p.protocol.replace(':', ''), favicon: `${p.protocol}//${p.hostname}/favicon.ico` };
    } catch { return { domain: '', path: '', protocol: '', favicon: '' }; }
  }

  static generateTextPreview(bookmark, opts) {
    if (!bookmark || typeof bookmark !== 'object') return '';
    const o = { ...DEFAULT_OPTIONS, ...opts };
    const parts = [];
    if (bookmark.title) parts.push(bookmark.title);
    if (bookmark.url) { const info = BookmarkContentPreview.extractUrlInfo(bookmark.url); if (info.domain) parts.push(`[${info.domain}]`); }
    if (o.includeFolder && bookmark.folderPath?.length > 0) parts.push(`📂 ${bookmark.folderPath.join(' > ')}`);
    if (o.includeTags && bookmark.tags?.length > 0) parts.push(`🏷 ${bookmark.tags.join(', ')}`);
    if (o.includeStatus && bookmark.status) parts.push(`(${STATUS_LABELS[bookmark.status] || bookmark.status})`);
    return BookmarkContentPreview._truncate(parts.join(' · '), o.maxLength);
  }

  static generateHtmlPreview(bookmark, opts) {
    if (!bookmark || typeof bookmark !== 'object') return '';
    const o = { ...DEFAULT_OPTIONS, ...opts };
    const esc = BookmarkContentPreview._escapeHtml;
    const lines = [];
    lines.push(`<div class="preview-title">${esc(bookmark.title || '(无标题)')}</div>`);
    if (bookmark.url) { const info = BookmarkContentPreview.extractUrlInfo(bookmark.url); lines.push(`<a class="preview-url" href="${esc(bookmark.url)}" target="_blank">${esc(info.domain)}</a>`); }
    if (o.includeFolder && bookmark.folderPath?.length > 0) lines.push(`<div class="preview-folder">📂 ${esc(bookmark.folderPath.join(' > '))}</div>`);
    if (o.includeTags && bookmark.tags?.length > 0) { const tagHtml = bookmark.tags.map(t => `<span class="preview-tag">${esc(t)}</span>`).join(' '); lines.push(`<div class="preview-tags">🏷 ${tagHtml}</div>`); }
    if (o.includeStatus && bookmark.status) lines.push(`<div class="preview-status">${esc(STATUS_LABELS[bookmark.status] || bookmark.status)}</div>`);
    return `<div class="bookmark-preview">${lines.join('')}</div>`;
  }

  static generateSnapshotPreview(bookmark, snapshotContent, opts) {
    if (!bookmark || typeof bookmark !== 'object') return '';
    const o = { ...DEFAULT_OPTIONS, ...opts };
    const parts = [BookmarkContentPreview.generateTextPreview(bookmark, { ...o, maxLength: Number.MAX_SAFE_INTEGER })];
    if (snapshotContent && typeof snapshotContent === 'string') { parts.push(`\n---\n${BookmarkContentPreview._truncate(snapshotContent.replace(/\s+/g, ' ').trim(), o.maxLength)}`); }
    return BookmarkContentPreview._truncate(parts.join(''), o.maxLength + 50);
  }

  static _truncate(text, maxLen) {
    if (typeof text !== 'string' || !Number.isFinite(maxLen) || maxLen <= 0) return '';
    return text.length <= maxLen ? text : text.slice(0, maxLen) + '...';
  }

  static _escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

// ==================== 共享工具函数 ====================

/** 中英文混合分词 */
function _tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const tokens = [];
  const segments = text.match(/[一-鿿]|[a-zA-Z]+|[0-9]+/g) || [];
  for (const seg of segments) {
    if (/[一-鿿]/.test(seg)) { for (const char of seg) tokens.push(char); }
    else if (/[a-zA-Z]/.test(seg)) tokens.push(seg.toLowerCase());
    else tokens.push(seg);
  }
  return tokens;
}

/** 从 URL 提取关键词 */
function _tokenizeUrl(url) {
  const tokens = [];
  try {
    const parsed = new URL(url);
    for (const part of parsed.hostname.replace(/^www\./, '').split('.').filter(Boolean)) { if (part.length > 1) tokens.push(part.toLowerCase()); }
    for (const seg of parsed.pathname.split('/').filter(s => s.length > 0)) { for (const p of seg.split(/[-_]/).filter(s => s.length > 1)) tokens.push(p.toLowerCase()); }
  } catch { /* invalid URL */ }
  return tokens;
}

/** 从书签提取所有可索引 token */
function _extractTokens(bookmark) {
  const allTokens = [];
  if (bookmark.title) allTokens.push(..._tokenize(bookmark.title));
  if (bookmark.url) allTokens.push(..._tokenizeUrl(bookmark.url));
  if (bookmark.folderPath && Array.isArray(bookmark.folderPath)) { for (const f of bookmark.folderPath) allTokens.push(..._tokenize(f)); }
  if (bookmark.tags && Array.isArray(bookmark.tags)) { for (const t of bookmark.tags) allTokens.push(..._tokenize(t)); }
  return [...new Set(allTokens)];
}

/** 评分 */
function _computeIndexScore(bookmark, queryTokens) {
  let score = 0;
  const titleTokens = bookmark.title ? _tokenize(bookmark.title) : [];
  const titleText = (bookmark.title || '').toLowerCase();
  const urlTokens = bookmark.url ? _tokenizeUrl(bookmark.url) : [];
  const folderTokens = [];
  if (bookmark.folderPath && Array.isArray(bookmark.folderPath)) { for (const f of bookmark.folderPath) folderTokens.push(..._tokenize(f)); }
  for (const qt of queryTokens) {
    if (titleTokens.includes(qt)) score += 10;
    if (titleText.includes(qt)) score += 5;
    if (urlTokens.includes(qt)) score += 3;
    if (folderTokens.includes(qt)) score += 2;
  }
  return score;
}

/** 文件夹匹配 */
function _matchesFolder(bookmark, folder) {
  if (!bookmark.folderPath || !Array.isArray(bookmark.folderPath)) return false;
  const folderLower = folder.toLowerCase();
  return bookmark.folderPath.some(f => f.toLowerCase().includes(folderLower));
}

/** 标签匹配 */
function _matchesTags(bookmark, tags) {
  if (!bookmark.tags || !Array.isArray(bookmark.tags)) return false;
  const bmTags = new Set(bookmark.tags.map(t => t.toLowerCase()));
  return tags.every(t => bmTags.has(t.toLowerCase()));
}
