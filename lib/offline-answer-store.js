/**
 * OfflineAnswerStore — 离线回答持久化存储（迭代 #14）
 *
 * 将 AI 回答持久化到 IndexedDB，实现离线可用。
 * 当用户断网或 API 不可用时，可从本地缓存中查找并展示历史回答。
 *
 * 数据库: PageWiseOfflineAnswers
 * Object Store: answers (keyPath: cacheKey)
 * Index: url, createdAt
 */

const DB_NAME = 'PageWiseOfflineAnswers';
const DB_VERSION = 1;
const STORE_NAME = 'answers';
const DEFAULT_MAX_ENTRIES = 200;

/**
 * 打开数据库连接
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'cacheKey'
        });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(new Error(`IndexedDB error: ${event.target.error}`));
    };
  });
}

/**
 * 保存一条离线回答
 * @param {Object} entry
 * @param {string} entry.cacheKey - 缓存键（哈希）
 * @param {string} entry.url - 页面 URL
 * @param {string} entry.title - 页面标题
 * @param {string} entry.question - 用户问题
 * @param {string} entry.answer - AI 回答
 * @param {string} entry.model - 模型名称
 * @param {string} entry.createdAt - ISO 时间戳
 * @returns {Promise<Object>} 保存的记录
 */
export async function addOfflineAnswer(entry) {
  if (!entry.cacheKey) {
    throw new Error('cacheKey is required');
  }
  if (!entry.answer) {
    throw new Error('answer is required');
  }

  const record = {
    cacheKey: entry.cacheKey,
    url: entry.url || '',
    title: entry.title || '',
    question: entry.question || '',
    answer: entry.answer,
    model: entry.model || '',
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve({ ...record });
    request.onerror = () => reject(new Error('保存离线回答失败'));
  });
}

/**
 * 按 cacheKey 获取离线回答
 * @param {string} cacheKey
 * @returns {Promise<Object|null>}
 */
export async function getOfflineAnswer(cacheKey) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(cacheKey);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('获取离线回答失败'));
  });
}

/**
 * 按 URL 获取所有离线回答
 * @param {string} url - 页面 URL
 * @returns {Promise<Array>}
 */
export async function getOfflineAnswersByUrl(url) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('url');

  return new Promise((resolve, reject) => {
    const request = index.getAll(url);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error('按 URL 获取离线回答失败'));
  });
}

/**
 * 获取所有离线回答（按 createdAt 倒序）
 * @returns {Promise<Array>}
 */
export async function getAllOfflineAnswers() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      resolve(results);
    };
    request.onerror = () => reject(new Error('获取所有离线回答失败'));
  });
}

/**
 * 删除指定 cacheKey 的离线回答
 * @param {string} cacheKey
 * @returns {Promise<boolean>}
 */
export async function deleteOfflineAnswer(cacheKey) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(cacheKey);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(new Error('删除离线回答失败'));
  });
}

/**
 * 清空所有离线回答
 * @returns {Promise<void>}
 */
export async function clearOfflineAnswers() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(new Error('清空离线回答失败'));
  });
}

/**
 * 搜索离线回答（按问题和回答内容关键词匹配）
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Array>} 匹配的记录数组（createdAt 倒序）
 */
export async function searchOfflineAnswers(keyword) {
  const all = await getAllOfflineAnswers();

  if (!keyword) return all;

  const kw = keyword.toLowerCase();
  return all.filter(entry => {
    if (entry.question && entry.question.toLowerCase().includes(kw)) return true;
    if (entry.answer && entry.answer.toLowerCase().includes(kw)) return true;
    return false;
  });
}

/**
 * LRU 淘汰：当条目数超过 maxEntries 时删除最旧的条目
 * @param {number} [maxEntries=200] - 最大条目数
 * @returns {Promise<number>} 删除的条目数
 */
export async function evictOverflow(maxEntries = DEFAULT_MAX_ENTRIES) {
  const all = await getAllOfflineAnswers();

  if (all.length <= maxEntries) return 0;

  // all 已按 createdAt 倒序排列，末尾的是最旧的
  const toDelete = all.slice(maxEntries);
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    let deleted = 0;
    for (const entry of toDelete) {
      const req = store.delete(entry.cacheKey);
      req.onsuccess = () => {
        deleted++;
        if (deleted === toDelete.length) resolve(deleted);
      };
      req.onerror = () => {
        deleted++;
        if (deleted === toDelete.length) resolve(deleted);
      };
    }
  });
}

/**
 * 获取离线回答统计信息
 * @returns {Promise<{ count: number, oldest: string|null, newest: string|null }>}
 */
export async function getOfflineStats() {
  const all = await getAllOfflineAnswers();

  if (all.length === 0) {
    return { count: 0, oldest: null, newest: null };
  }

  // all 已倒序：[0]=newest, [last]=oldest
  return {
    count: all.length,
    newest: all[0].createdAt,
    oldest: all[all.length - 1].createdAt,
  };
}
