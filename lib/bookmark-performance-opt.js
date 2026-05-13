/**
 * BookmarkPerformanceOpt — 性能优化模块
 *
 * 为书签搜索和浏览提供性能优化能力:
 *   - 倒排索引预构建 (buildSearchIndex / searchWithIndex)
 *   - 懒加载分页 (lazyLoadBookmarks)
 *   - 虚拟滚动辅助 (createVirtualScroller)
 *
 * 纯前端实现，不依赖外部 API。
 */

// ==================== 倒排索引构建 ====================

/**
 * 预构建倒排索引，用于快速全文搜索
 *
 * 索引结构: Map<token, Set<bookmarkIndex>>
 *
 * 索引字段: title, url, tags, folderPath
 * 分词规则: 按空白/标点分词，转小写，过滤长度 < 2 的 token
 *
 * @param {Object[]} bookmarks — 书签数组
 * @returns {Object} 索引对象 { index: Map, bookmarks: Object[], tokenCount: number }
 */
export function buildSearchIndex(bookmarks) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return { index: new Map(), bookmarks: bookmarks || [], tokenCount: 0 };
  }

  const index = new Map();
  let tokenCount = 0;

  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i];
    if (!bm) continue;

    const tokens = _tokenizeBookmark(bm);

    for (const token of tokens) {
      let set = index.get(token);
      if (!set) {
        set = new Set();
        index.set(token, set);
      }
      set.add(i);
      tokenCount++;
    }
  }

  return { index, bookmarks, tokenCount };
}

/**
 * 使用预构建索引进行快速搜索
 *
 * 搜索逻辑:
 *   - 将查询字符串分词
 *   - 对单个词: 直接查索引
 *   - 对多个词: 取交集 (AND 语义)
 *   - 支持前缀匹配 (token 以查询词开头)
 *
 * @param {Object} indexObj — buildSearchIndex 返回的索引对象
 * @param {string} query    — 查询字符串
 * @returns {Object[]} 匹配的书签数组
 */
export function searchWithIndex(indexObj, query) {
  if (!indexObj || !indexObj.index || !Array.isArray(indexObj.bookmarks)) return [];
  if (!query || typeof query !== 'string') return [];

  const queryTokens = _tokenize(query);
  if (queryTokens.length === 0) return [];

  const { index, bookmarks } = indexObj;

  // 对每个查询词，收集匹配的索引集合（精确 + 前缀）
  const matchSets = [];

  for (const qToken of queryTokens) {
    const matched = new Set();

    for (const [token, idxSet] of index) {
      if (token === qToken || token.startsWith(qToken)) {
        for (const idx of idxSet) {
          matched.add(idx);
        }
      }
    }

    matchSets.push(matched);
  }

  // 取交集 (AND)
  let result = matchSets[0];
  for (let i = 1; i < matchSets.length; i++) {
    result = _intersect(result, matchSets[i]);
  }

  return [...result]
    .sort((a, b) => a - b)
    .map(idx => bookmarks[idx])
    .filter(Boolean);
}

// ==================== 索引管理 ====================

/**
 * 向索引中添加一个书签
 *
 * @param {Object} indexObj  — 索引对象
 * @param {Object} bookmark  — 新书签
 * @returns {Object} 更新后的索引对象
 */
export function addToIndex(indexObj, bookmark) {
  if (!indexObj || !indexObj.index || !Array.isArray(indexObj.bookmarks)) return indexObj;
  if (!bookmark) return indexObj;

  const idx = indexObj.bookmarks.length;
  indexObj.bookmarks.push(bookmark);

  const tokens = _tokenizeBookmark(bookmark);
  for (const token of tokens) {
    let set = indexObj.index.get(token);
    if (!set) {
      set = new Set();
      indexObj.index.set(token, set);
    }
    set.add(idx);
    indexObj.tokenCount++;
  }

  return indexObj;
}

/**
 * 从索引中移除一个书签（按原始数组下标）
 *
 * 注意: 这会将该位置设为 null，不会重新索引后续元素
 *
 * @param {Object} indexObj  — 索引对象
 * @param {number} bookmarkIndex — 书签下标
 * @returns {Object} 更新后的索引对象
 */
export function removeFromIndex(indexObj, bookmarkIndex) {
  if (!indexObj || !indexObj.index || !Array.isArray(indexObj.bookmarks)) return indexObj;
  if (bookmarkIndex < 0 || bookmarkIndex >= indexObj.bookmarks.length) return indexObj;

  const bm = indexObj.bookmarks[bookmarkIndex];
  if (!bm) return indexObj;

  const tokens = _tokenizeBookmark(bm);
  for (const token of tokens) {
    const set = indexObj.index.get(token);
    if (set) {
      set.delete(bookmarkIndex);
      indexObj.tokenCount--;
      if (set.size === 0) {
        indexObj.index.delete(token);
      }
    }
  }

  indexObj.bookmarks[bookmarkIndex] = null;
  return indexObj;
}

/**
 * 获取索引统计信息
 *
 * @param {Object} indexObj — 索引对象
 * @returns {Object} { uniqueTokens, totalEntries, bookmarksCount, memoryEstimate }
 */
export function getIndexStats(indexObj) {
  if (!indexObj || !indexObj.index) {
    return { uniqueTokens: 0, totalEntries: 0, bookmarksCount: 0, memoryEstimate: 0 };
  }

  let totalEntries = 0;
  for (const [, set] of indexObj.index) {
    totalEntries += set.size;
  }

  const uniqueTokens = indexObj.index.size;
  // 粗略内存估算: 每个 token 约 50 字节, 每个 Set 条目约 8 字节
  const memoryEstimate = uniqueTokens * 50 + totalEntries * 8;

  return {
    uniqueTokens,
    totalEntries,
    bookmarksCount: indexObj.bookmarks ? indexObj.bookmarks.length : 0,
    memoryEstimate,
  };
}

// ==================== 懒加载分页 ====================

/**
 * 分页加载书签
 *
 * @param {Object[]} bookmarks   — 全部书签数组
 * @param {number}   pageSize    — 每页数量 (默认 20)
 * @param {number}   page        — 页码 (从 0 开始)
 * @returns {Object} { items: Object[], page: number, pageSize: number, totalPages: number, total: number, hasMore: boolean }
 */
export function lazyLoadBookmarks(bookmarks, pageSize = 20, page = 0) {
  if (!Array.isArray(bookmarks)) {
    return { items: [], page: 0, pageSize, totalPages: 0, total: 0, hasMore: false };
  }

  const total = bookmarks.length;
  const effectivePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.ceil(total / effectivePageSize);
  const effectivePage = Math.max(0, Math.min(page, Math.max(0, totalPages - 1)));

  const start = effectivePage * effectivePageSize;
  const end = Math.min(start + effectivePageSize, total);
  const items = total === 0 ? [] : bookmarks.slice(start, end);

  return {
    items,
    page: effectivePage,
    pageSize: effectivePageSize,
    totalPages,
    total,
    hasMore: effectivePage < totalPages - 1,
  };
}

// ==================== 虚拟滚动 ====================

/**
 * 创建虚拟滚动器配置
 *
 * 仅渲染可视区域内的元素，适用于大量书签列表场景。
 *
 * @param {HTMLElement|Object} container — 容器元素 (或 { clientHeight } 的模拟对象)
 * @param {Object[]} items    — 全部数据项
 * @param {number}   itemHeight — 每项高度 (px)
 * @returns {Object} 虚拟滚动器实例
 */
export function createVirtualScroller(container, items, itemHeight) {
  if (!container || typeof itemHeight !== 'number' || itemHeight <= 0) {
    return {
      getVisibleRange: () => ({ start: 0, end: 0, offsetY: 0, totalHeight: 0 }),
      getMetrics: () => ({ totalHeight: 0, visibleCount: 0, overscan: 0 }),
      update: () => ({ start: 0, end: 0, offsetY: 0, totalHeight: 0 }),
      destroy: () => {},
    };
  }

  const safeItems = Array.isArray(items) ? items : [];
  const containerHeight = container.clientHeight || 600;
  const overscan = 5;

  let destroyed = false;

  /**
   * 根据滚动位置计算可视范围
   * @param {number} scrollTop — 滚动偏移量
   * @returns {Object} { start, end, offsetY, totalHeight, visibleItems }
   */
  function getVisibleRange(scrollTop = 0) {
    if (destroyed) return { start: 0, end: 0, offsetY: 0, totalHeight: 0 };

    const totalHeight = safeItems.length * itemHeight;
    const visibleCount = Math.ceil(containerHeight / itemHeight);

    let start = Math.floor(scrollTop / itemHeight) - overscan;
    start = Math.max(0, start);

    let end = start + visibleCount + overscan * 2;
    end = Math.min(safeItems.length, end);

    const offsetY = start * itemHeight;
    const visibleItems = safeItems.slice(start, end);

    return { start, end, offsetY, totalHeight, visibleItems };
  }

  /**
   * 获取滚动器度量信息
   * @returns {Object}
   */
  function getMetrics() {
    return {
      totalHeight: safeItems.length * itemHeight,
      visibleCount: Math.ceil(containerHeight / itemHeight),
      overscan,
      itemCount: safeItems.length,
      itemHeight,
      containerHeight,
    };
  }

  /**
   * 更新滚动位置并返回新的可视范围
   * @param {number} scrollTop
   * @returns {Object}
   */
  function update(scrollTop = 0) {
    return getVisibleRange(scrollTop);
  }

  /**
   * 销毁虚拟滚动器
   */
  function destroy() {
    destroyed = true;
  }

  return { getVisibleRange, getMetrics, update, destroy };
}

// ==================== 内部辅助函数 ====================

/**
 * 将书签对象的文本字段提取并分词
 * @param {Object} bm
 * @returns {string[]}
 */
function _tokenizeBookmark(bm) {
  const parts = [];

  if (typeof bm.title === 'string') parts.push(bm.title);
  if (typeof bm.url === 'string') parts.push(bm.url);
  if (Array.isArray(bm.tags)) {
    for (const tag of bm.tags) {
      if (typeof tag === 'string') parts.push(tag);
    }
  }
  if (Array.isArray(bm.folderPath)) {
    for (const folder of bm.folderPath) {
      if (typeof folder === 'string') parts.push(folder);
    }
  }

  return _tokenize(parts.join(' '));
}

/**
 * 通用分词: 按空白和标点分割，转小写，过滤短词
 * @param {string} text
 * @returns {string[]}
 */
function _tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .split(/[\s,./\;:'"!?()[\]{}|@#$%^&*+=~`<>]+/)
    .filter(t => t.length >= 2);
}

/**
 * 两个 Set 的交集
 * @param {Set} a
 * @param {Set} b
 * @returns {Set}
 */
function _intersect(a, b) {
  const result = new Set();
  // 遍历较小的集合
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const val of smaller) {
    if (larger.has(val)) {
      result.add(val);
    }
  }
  return result;
}
