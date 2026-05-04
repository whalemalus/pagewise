/**
 * BookmarkImportExport — 数据导入导出
 *
 * 功能:
 *   1. exportJSON()      — 导出完整图谱数据 (书签+聚类+标签+状态) 为 JSON 字符串
 *   2. exportCSV()       — 导出书签列表为 CSV 字符串 (含表头)
 *   3. importFromChromeHTML(html) — 解析 Chrome 书签 HTML 导入书签
 *   4. importFromJSON(json)      — 从 JSON 字符串导入完整图谱数据
 *   5. exportToFile(format)      — 导出为 Blob ('json' | 'csv')
 *
 * 纯前端实现，不依赖外部 API。
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 * @property {string}   [status]
 * @property {number}   [dateAdded]
 */

/**
 * @typedef {Object} ExportData
 * @property {Bookmark[]} bookmarks
 * @property {Object[]}   clusters
 * @property {Object[]}   tags
 * @property {Object[]}   statuses
 */

// ==================== BookmarkImportExport ====================

export class BookmarkImportExport {
  /**
   * @param {Object}      opts
   * @param {Bookmark[]}  [opts.bookmarks=[]]
   * @param {Object[]}    [opts.clusters=[]]
   * @param {Object[]}    [opts.tags=[]]
   * @param {Object[]}    [opts.statuses=[]]
   * @param {Function}    [opts.onProgress] — 进度回调 (phase, current, total)
   */
  constructor({ bookmarks = [], clusters = [], tags = [], statuses = [], onProgress = null } = {}) {
    this.bookmarks = bookmarks;
    this.clusters = clusters;
    this.tags = tags;
    this.statuses = statuses;
    this.onProgress = onProgress;
  }

  // ==================== 进度通知 ====================

  /** @private */
  _notify(phase, current, total) {
    if (typeof this.onProgress === 'function') {
      this.onProgress(phase, current, total);
    }
  }

  // ==================== 导出 JSON ====================

  /**
   * 导出完整图谱数据为 JSON 字符串
   * @returns {string}
   */
  exportJSON() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      bookmarks: this.bookmarks,
      clusters: this.clusters,
      tags: this.tags,
      statuses: this.statuses,
    };

    const total = this.bookmarks.length;
    this._notify('export-json-start', 0, total);
    const result = JSON.stringify(data, null, 2);
    this._notify('export-json-done', total, total);
    return result;
  }

  // ==================== 导出 CSV ====================

  /**
   * 导出书签列表为 CSV 字符串
   * @returns {string}
   */
  exportCSV() {
    const header = 'title,url,folderPath,dateAdded,tags,status';
    const total = this.bookmarks.length;
    this._notify('export-csv-start', 0, total);

    const rows = this.bookmarks.map((bm, i) => {
      this._notify('export-csv-progress', i + 1, total);
      return BookmarkImportExport._bmToCsvRow(bm);
    });

    this._notify('export-csv-done', total, total);
    return [header, ...rows].join('\n');
  }

  /**
   * 将单个书签转为 CSV 行
   * @private
   * @param {Bookmark} bm
   * @returns {string}
   */
  static _bmToCsvRow(bm) {
    const title = BookmarkImportExport._escapeCsv(bm.title || '');
    const url = BookmarkImportExport._escapeCsv(bm.url || '');
    const folderPath = BookmarkImportExport._escapeCsv(
      Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : (bm.folderPath || '')
    );
    const dateAdded = bm.dateAdded
      ? new Date(bm.dateAdded).toISOString().split('T')[0]
      : '';
    const tags = BookmarkImportExport._escapeCsv(
      Array.isArray(bm.tags) ? bm.tags.join(',') : (bm.tags || '')
    );
    const status = BookmarkImportExport._escapeCsv(bm.status || '');

    return `${title},${url},${folderPath},"${dateAdded}",${tags},${status}`;
  }

  /**
   * CSV 字段转义：包含逗号/双引号/换行的字段用双引号包裹
   * @private
   * @param {string} val
   * @returns {string}
   */
  static _escapeCsv(val) {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return '"' + str + '"';
  }

  // ==================== 导入 Chrome HTML ====================

  /**
   * 解析 Chrome 书签 HTML 文件，返回 Bookmark[]
   * @param {string} html
   * @returns {Bookmark[]}
   */
  importFromChromeHTML(html) {
    if (!html || typeof html !== 'string') {
      return [];
    }

    const bookmarks = [];
    const folderStack = [];
    let idCounter = 0;

    this._notify('import-html-start', 0, 0);

    // 逐行解析 DT/H3 和 DT/A 标签
    const lines = html.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测 H3 标签 — 文件夹
      const h3Match = line.match(/<H3[^>]*>([^<]*)<\/H3>/i);
      if (h3Match) {
        folderStack.push(h3Match[1].trim());
        continue;
      }

      // 检测关闭的 DL 标签 — 退出文件夹层级
      if (/<\/DL>/i.test(line)) {
        folderStack.pop();
        continue;
      }

      // 检测 A 标签 — 书签
      const aMatch = line.match(
        /<A\s+HREF="([^"]*)"[^>]*ADD_DATE="([^"]*)"[^>]*>([^<]*)<\/A>/i
      );
      if (aMatch) {
        const url = aMatch[1];
        const addDate = parseInt(aMatch[2], 10) * 1000; // Unix → ms
        const title = aMatch[2] ? aMatch[3].trim() : aMatch[3].trim();

        bookmarks.push({
          id: `html-${++idCounter}`,
          title: title,
          url: url,
          folderPath: [...folderStack],
          tags: [],
          status: 'unread',
          dateAdded: isNaN(addDate) ? undefined : addDate,
        });
        continue;
      }

      // 回退: A 标签没有 ADD_DATE
      const aNoDate = line.match(/<A\s+HREF="([^"]*)"[^>]*>([^<]*)<\/A>/i);
      if (aNoDate) {
        bookmarks.push({
          id: `html-${++idCounter}`,
          title: aNoDate[2].trim(),
          url: aNoDate[1],
          folderPath: [...folderStack],
          tags: [],
          status: 'unread',
        });
      }
    }

    this._notify('import-html-done', bookmarks.length, bookmarks.length);
    return bookmarks;
  }

  // ==================== 导入 JSON ====================

  /**
   * 从 JSON 字符串导入完整图谱数据
   * @param {string} json
   * @returns {ExportData}
   */
  importFromJSON(json) {
    if (!json || typeof json !== 'string') {
      return { bookmarks: [], clusters: [], tags: [], statuses: [] };
    }

    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { bookmarks: [], clusters: [], tags: [], statuses: [] };
    }

    const bookmarks = Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [];
    const clusters = Array.isArray(parsed.clusters) ? parsed.clusters : [];
    const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
    const statuses = Array.isArray(parsed.statuses) ? parsed.statuses : [];

    this._notify('import-json-done', bookmarks.length, bookmarks.length);
    return { bookmarks, clusters, tags, statuses };
  }

  // ==================== 导出为 Blob ====================

  /**
   * 导出为 Blob 对象
   * @param {'json'|'csv'} format
   * @returns {Blob}
   */
  exportToFile(format) {
    this._notify('export-file-start', 0, 1);

    let content, mimeType;
    if (format === 'csv') {
      content = this.exportCSV();
      mimeType = 'text/csv;charset=utf-8';
    } else {
      content = this.exportJSON();
      mimeType = 'application/json;charset=utf-8';
    }

    const blob = new Blob([content], { type: mimeType });
    this._notify('export-file-done', 1, 1);
    return blob;
  }
}
