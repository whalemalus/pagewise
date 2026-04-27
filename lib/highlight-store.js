/**
 * HighlightStore — 页面高亮标注存储
 *
 * 使用 chrome.storage.local 存储高亮数据，不占用 sync 配额。
 * 每个 URL 最多保存 50 个高亮。
 */

const HIGHLIGHTS_KEY = 'pagewiseHighlights';
const MAX_HIGHLIGHTS_PER_URL = 50;

/**
 * 获取所有高亮数据
 * @returns {Object} 以 URL 为 key 的高亮映射
 */
export async function getAllHighlights() {
  return new Promise((resolve) => {
    chrome.storage.local.get(HIGHLIGHTS_KEY, (result) => {
      resolve(result[HIGHLIGHTS_KEY] || {});
    });
  });
}

/**
 * 获取指定 URL 的高亮列表
 * @param {string} url
 * @returns {Array} 高亮条目数组
 */
export async function getHighlightsByUrl(url) {
  const all = await getAllHighlights();
  return all[url] || [];
}

/**
 * 保存一个高亮条目
 * @param {{ url: string, text: string, xpath: string, offset: number }} highlight
 * @returns {Object} 保存后的高亮条目（含 id 和 createdAt）
 */
export async function saveHighlight(highlight) {
  const { url, text, xpath, offset } = highlight;
  if (!url || !text) {
    throw new Error('url and text are required');
  }

  const all = await getAllHighlights();
  const urlHighlights = all[url] || [];

  // 每个 URL 最多 50 个高亮
  if (urlHighlights.length >= MAX_HIGHLIGHTS_PER_URL) {
    throw new Error(`最多保存 ${MAX_HIGHLIGHTS_PER_URL} 个高亮`);
  }

  // 去重：同一 URL 下相同文本+位置不重复保存
  const duplicate = urlHighlights.find(
    h => h.text === text && h.xpath === xpath && h.offset === offset
  );
  if (duplicate) {
    return duplicate; // 已存在，直接返回
  }

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    url,
    text,
    xpath: xpath || '',
    offset: offset || 0,
    createdAt: new Date().toISOString()
  };

  urlHighlights.push(entry);
  all[url] = urlHighlights;

  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [HIGHLIGHTS_KEY]: all }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(entry);
      }
    });
  });
}

/**
 * 删除指定高亮
 * @param {string} url - 页面 URL
 * @param {string} id - 高亮 ID
 * @returns {boolean}
 */
export async function deleteHighlight(url, id) {
  const all = await getAllHighlights();
  const urlHighlights = all[url] || [];
  const filtered = urlHighlights.filter(h => h.id !== id);

  if (filtered.length === urlHighlights.length) {
    return false; // 未找到
  }

  if (filtered.length === 0) {
    delete all[url];
  } else {
    all[url] = filtered;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [HIGHLIGHTS_KEY]: all }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * 删除指定 URL 的所有高亮
 * @param {string} url
 * @returns {boolean}
 */
export async function deleteHighlightsByUrl(url) {
  const all = await getAllHighlights();
  if (!all[url]) return false;

  delete all[url];

  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [HIGHLIGHTS_KEY]: all }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * 获取所有高亮（扁平化，用于跨页面展示）
 * @param {number} limit
 * @returns {Array}
 */
export async function getAllHighlightsFlat(limit = 200) {
  const all = await getAllHighlights();
  const flat = [];
  for (const highlights of Object.values(all)) {
    for (const h of highlights) {
      flat.push(h);
      if (flat.length >= limit) return flat;
    }
  }
  // 按时间倒序
  flat.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return flat;
}
