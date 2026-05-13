/**
 * BookmarkBatch — 批量操作模块
 *
 * 提供批量书签管理功能:
 *   - batchDelete(bookmarks, ids)          — 批量删除
 *   - batchTag(bookmarks, ids, tags, action) — 批量添加/移除标签
 *   - batchMove(bookmarks, ids, targetFolder) — 批量移动到文件夹
 *   - batchExport(bookmarks, ids, format)    — 批量导出为 JSON/HTML/CSV
 *
 * 所有方法返回 { success, failed, results, errors } 统一结构。
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
 * @typedef {Object} BatchResult
 * @property {number}     success  — 成功数量
 * @property {number}     failed   — 失败数量
 * @property {Object[]}   results  — 成功项详情
 * @property {Object[]}   errors   — 失败项详情 { id, reason }
 */

// ==================== 辅助函数 ====================

/**
 * 标签归一化: 小写、trim、去特殊字符
 * @param {string} tag
 * @returns {string}
 */
function normalizeTag(tag) {
  if (typeof tag !== 'string') return '';
  return tag
    .toLowerCase()
    .trim()
    .replace(/\s{2,}/g, '-')
    .replace(/[^\p{L}\p{N}_\-]/gu, '')
    .slice(0, 30);
}

/**
 * 构建 id → bookmark 查找表
 * @param {Bookmark[]} bookmarks
 * @returns {Map<string, Bookmark>}
 */
function buildIdMap(bookmarks) {
  const map = new Map();
  if (!Array.isArray(bookmarks)) return map;
  for (const bm of bookmarks) {
    map.set(String(bm.id), bm);
  }
  return map;
}

/**
 * 创建标准批处理结果容器
 * @returns {BatchResult}
 */
function createResult() {
  return { success: 0, failed: 0, results: [], errors: [] };
}

/**
 * 深拷贝一个书签（简单结构）
 * @param {Bookmark} bm
 * @returns {Bookmark}
 */
function cloneBookmark(bm) {
  return {
    ...bm,
    folderPath: Array.isArray(bm.folderPath) ? [...bm.folderPath] : [],
    tags: Array.isArray(bm.tags) ? [...bm.tags] : [],
  };
}

// ==================== 批量删除 ====================

/**
 * 批量删除书签
 *
 * @param {Bookmark[]} bookmarks — 书签数组 (原数组不变，返回过滤后的新数组)
 * @param {string[]}   ids       — 要删除的书签 id 列表
 * @returns {BatchResult & { remaining: Bookmark[] }}
 */
export function batchDelete(bookmarks, ids) {
  const result = createResult();
  result.remaining = [];

  if (!Array.isArray(bookmarks)) return result;
  if (!Array.isArray(ids) || ids.length === 0) {
    result.remaining = bookmarks.map(cloneBookmark);
    return result;
  }

  const deleteSet = new Set(ids.map(String));
  const idMap = buildIdMap(bookmarks);

  // 检查每个要删除的 id 是否存在
  for (const id of deleteSet) {
    if (idMap.has(id)) {
      result.success++;
      result.results.push({ id, title: idMap.get(id).title });
    } else {
      result.failed++;
      result.errors.push({ id, reason: 'bookmark not found' });
    }
  }

  // 构建 remaining 列表
  for (const bm of bookmarks) {
    if (!deleteSet.has(String(bm.id))) {
      result.remaining.push(cloneBookmark(bm));
    }
  }

  return result;
}

// ==================== 批量标签 ====================

/**
 * 批量添加或移除标签
 *
 * @param {Bookmark[]} bookmarks — 书签数组 (原数组不变，返回修改后的新数组)
 * @param {string[]}   ids       — 目标书签 id 列表
 * @param {string[]}   tags      — 要操作的标签列表
 * @param {'add'|'remove'} action — 'add' 添加标签, 'remove' 移除标签
 * @returns {BatchResult & { updated: Bookmark[] }}
 */
export function batchTag(bookmarks, ids, tags, action) {
  const result = createResult();
  result.updated = [];

  if (!Array.isArray(bookmarks)) return result;
  if (!Array.isArray(ids) || ids.length === 0) {
    result.updated = bookmarks.map(cloneBookmark);
    return result;
  }
  if (!Array.isArray(tags) || tags.length === 0) {
    result.updated = bookmarks.map(cloneBookmark);
    return result;
  }
  if (action !== 'add' && action !== 'remove') {
    result.updated = bookmarks.map(cloneBookmark);
    result.errors.push({ id: '*', reason: `invalid action: "${action}", must be "add" or "remove"` });
    result.failed = ids.length;
    return result;
  }

  const targetSet = new Set(ids.map(String));
  const normalizedTags = tags.map(normalizeTag).filter(Boolean);
  const idMap = buildIdMap(bookmarks);

  // 验证所有 ids 是否存在
  for (const id of targetSet) {
    if (!idMap.has(id)) {
      result.failed++;
      result.errors.push({ id, reason: 'bookmark not found' });
    }
  }

  for (const bm of bookmarks) {
    const id = String(bm.id);
    const clone = cloneBookmark(bm);

    if (targetSet.has(id) && idMap.has(id)) {
      if (action === 'add') {
        const existing = new Set(clone.tags);
        let added = 0;
        for (const tag of normalizedTags) {
          if (!existing.has(tag)) {
            clone.tags.push(tag);
            existing.add(tag);
            added++;
          }
        }
        if (added > 0) {
          result.success++;
          result.results.push({ id, tagsAdded: added, newTags: [...clone.tags] });
        } else {
          // All tags already present — still counts as success (idempotent)
          result.success++;
          result.results.push({ id, tagsAdded: 0, newTags: [...clone.tags] });
        }
      } else {
        // remove
        const removeSet = new Set(normalizedTags);
        const before = clone.tags.length;
        clone.tags = clone.tags.filter(t => !removeSet.has(t));
        const removed = before - clone.tags.length;
        result.success++;
        result.results.push({ id, tagsRemoved: removed, newTags: [...clone.tags] });
      }
    }

    result.updated.push(clone);
  }

  return result;
}

// ==================== 批量移动 ====================

/**
 * 批量移动书签到指定文件夹
 *
 * @param {Bookmark[]} bookmarks    — 书签数组 (原数组不变，返回修改后的新数组)
 * @param {string[]}   ids          — 目标书签 id 列表
 * @param {string[]}   targetFolder — 目标文件夹路径 (如 ["前端", "React"])
 * @returns {BatchResult & { moved: Bookmark[] }}
 */
export function batchMove(bookmarks, ids, targetFolder) {
  const result = createResult();
  result.moved = [];

  if (!Array.isArray(bookmarks)) return result;
  if (!Array.isArray(ids) || ids.length === 0) {
    result.moved = bookmarks.map(cloneBookmark);
    return result;
  }
  if (!Array.isArray(targetFolder) || targetFolder.length === 0) {
    result.moved = bookmarks.map(cloneBookmark);
    result.errors.push({ id: '*', reason: 'targetFolder must be a non-empty array' });
    result.failed = ids.length;
    return result;
  }

  // 验证 targetFolder 每一层都是有效字符串
  for (let i = 0; i < targetFolder.length; i++) {
    if (typeof targetFolder[i] !== 'string' || !targetFolder[i].trim()) {
      result.moved = bookmarks.map(cloneBookmark);
      result.errors.push({ id: '*', reason: `invalid folder segment at index ${i}` });
      result.failed = ids.length;
      return result;
    }
  }

  const targetSet = new Set(ids.map(String));
  const idMap = buildIdMap(bookmarks);
  const cleanFolder = targetFolder.map(s => s.trim());

  // 验证所有 ids 是否存在
  for (const id of targetSet) {
    if (!idMap.has(id)) {
      result.failed++;
      result.errors.push({ id, reason: 'bookmark not found' });
    }
  }

  for (const bm of bookmarks) {
    const id = String(bm.id);
    const clone = cloneBookmark(bm);

    if (targetSet.has(id) && idMap.has(id)) {
      const oldFolder = [...clone.folderPath];
      clone.folderPath = [...cleanFolder];
      result.success++;
      result.results.push({ id, from: oldFolder, to: [...cleanFolder] });
    }

    result.moved.push(clone);
  }

  return result;
}

// ==================== 批量导出 ====================

/** 支持的导出格式 */
const SUPPORTED_FORMATS = new Set(['json', 'html', 'csv']);

/**
 * 将选中的书签导出为指定格式的字符串
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @param {string[]}   ids       — 要导出的书签 id 列表; 空数组表示导出全部
 * @param {'json'|'html'|'csv'} format — 导出格式
 * @returns {{ content: string, count: number, format: string, errors: Object[] }}
 */
export function batchExport(bookmarks, ids, format) {
  const errors = [];

  if (!Array.isArray(bookmarks)) {
    return { content: '', count: 0, format: format || '', errors };
  }

  if (!SUPPORTED_FORMATS.has(format)) {
    errors.push({ id: '*', reason: `unsupported format: "${format}", use json/html/csv` });
    return { content: '', count: 0, format: format || '', errors };
  }

  // 确定要导出的书签列表
  let selected;
  if (!Array.isArray(ids) || ids.length === 0) {
    selected = bookmarks.map(cloneBookmark);
  } else {
    const idSet = new Set(ids.map(String));
    const idMap = buildIdMap(bookmarks);
    selected = [];
    for (const id of idSet) {
      const bm = idMap.get(id);
      if (bm) {
        selected.push(cloneBookmark(bm));
      } else {
        errors.push({ id, reason: 'bookmark not found' });
      }
    }
  }

  let content = '';
  switch (format) {
    case 'json':
      content = _exportJSON(selected);
      break;
    case 'html':
      content = _exportHTML(selected);
      break;
    case 'csv':
      content = _exportCSV(selected);
      break;
  }

  return { content, count: selected.length, format, errors };
}

/**
 * 导出为 JSON 字符串
 * @param {Bookmark[]} bookmarks
 * @returns {string}
 * @private
 */
function _exportJSON(bookmarks) {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    count: bookmarks.length,
    bookmarks: bookmarks,
  };
  return JSON.stringify(data, null, 2);
}

/**
 * 导出为 HTML (Chrome 书签格式)
 * @param {Bookmark[]} bookmarks
 * @returns {string}
 * @private
 */
function _exportHTML(bookmarks) {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  for (const bm of bookmarks) {
    const title = _escapeHTML(bm.title || '');
    const url = _escapeHTML(bm.url || '');
    const dateAdded = bm.dateAdded ? Math.floor(bm.dateAdded / 1000) : 0;
    const tags = Array.isArray(bm.tags) ? bm.tags.join(',') : '';
    const folderPath = Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : '';

    lines.push(
      `    <DT><A HREF="${url}" ADD_DATE="${dateAdded}" TAGS="${_escapeHTML(tags)}">${title}</A>`
    );
    if (folderPath) {
      lines.push(`    <!-- folder: ${_escapeHTML(folderPath)} -->`);
    }
  }

  lines.push('</DL><p>');
  return lines.join('\n');
}

/**
 * 导出为 CSV 字符串
 * @param {Bookmark[]} bookmarks
 * @returns {string}
 * @private
 */
function _exportCSV(bookmarks) {
  const header = 'title,url,folderPath,tags,dateAdded,status';
  const rows = bookmarks.map(bm => {
    const title = _escapeCsv(bm.title || '');
    const url = _escapeCsv(bm.url || '');
    const folderPath = _escapeCsv(
      Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : ''
    );
    const tags = _escapeCsv(
      Array.isArray(bm.tags) ? bm.tags.join(';') : ''
    );
    const dateAdded = bm.dateAdded
      ? new Date(bm.dateAdded).toISOString().split('T')[0]
      : '';
    const status = _escapeCsv(bm.status || '');
    return `${title},${url},${folderPath},${tags},"${dateAdded}",${status}`;
  });
  return [header, ...rows].join('\n');
}

/**
 * HTML 转义
 * @param {string} str
 * @returns {string}
 * @private
 */
function _escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * CSV 字段转义
 * @param {string} val
 * @returns {string}
 * @private
 */
function _escapeCsv(val) {
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return '"' + str + '"';
}
