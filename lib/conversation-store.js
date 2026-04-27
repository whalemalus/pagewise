/**
 * ConversationStore — 对话历史持久化存储
 *
 * 使用 IndexedDB 按 URL 关联对话历史，支持持久化保存、按 URL 恢复、
 * 搜索对话内容、自动清理过期数据等功能。
 */

const DB_NAME = 'PageWiseConversations';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';
const DEFAULT_EXPIRE_DAYS = 30;

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
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
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
 * 保存/更新对话（按 URL 去重：同一 URL 只保留最新对话）
 * @param {string} url - 页面 URL
 * @param {string} title - 页面标题
 * @param {Array} messages - 消息数组 [{ role, content, timestamp }]
 * @returns {Promise<Object>} 保存的对话记录
 */
export async function saveConversation(url, title, messages) {
  if (!url) {
    throw new Error('url is required');
  }

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('url');

  return new Promise((resolve, reject) => {
    const getRequest = index.get(url);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      const now = new Date().toISOString();

      if (existing) {
        // 更新已有记录
        existing.title = title || existing.title;
        existing.messages = messages;
        existing.updatedAt = now;
        const putRequest = store.put(existing);
        putRequest.onsuccess = () => resolve(existing);
        putRequest.onerror = () => reject(new Error('保存对话失败'));
      } else {
        // 新建记录 — 在 put 前构建完整对象（mock 会 shallow copy）
        const record = {
          url,
          title: title || '',
          messages: messages || [],
          createdAt: now,
          updatedAt: now
        };
        const addRequest = store.add(record);
        addRequest.onsuccess = () => {
          record.id = addRequest.result;
          resolve(record);
        };
        addRequest.onerror = () => reject(new Error('保存对话失败'));
      }
    };

    getRequest.onerror = () => reject(new Error('查询对话失败'));
  });
}

/**
 * 按 URL 获取对话
 * @param {string} url - 页面 URL
 * @returns {Promise<Object|null>} 对话记录或 null
 */
export async function getConversationByUrl(url) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('url');

  return new Promise((resolve, reject) => {
    const request = index.get(url);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('获取对话失败'));
  });
}

/**
 * 获取所有对话（按 updatedAt 倒序）
 * @returns {Promise<Array>} 对话记录数组
 */
export async function getAllConversations() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result || [];
      // 按 updatedAt 倒序排列
      results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      resolve(results);
    };

    request.onerror = () => reject(new Error('获取对话列表失败'));
  });
}

/**
 * 删除指定对话
 * @param {number} id - 对话 ID
 * @returns {Promise<boolean>}
 */
export async function deleteConversation(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(new Error('删除对话失败'));
  });
}

/**
 * 删除超过 N 天的旧对话
 * @param {number} days - 天数（默认 30 天）
 * @returns {Promise<number>} 删除的记录数
 */
export async function deleteOldConversations(days = DEFAULT_EXPIRE_DAYS) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result || [];
      const toDelete = all.filter(c => c.updatedAt < cutoff);

      if (toDelete.length === 0) {
        resolve(0);
        return;
      }

      let deleted = 0;
      for (const item of toDelete) {
        const delReq = store.delete(item.id);
        delReq.onsuccess = () => {
          deleted++;
          if (deleted === toDelete.length) {
            resolve(deleted);
          }
        };
        delReq.onerror = () => {
          deleted++;
          if (deleted === toDelete.length) {
            resolve(deleted);
          }
        };
      }
    };

    request.onerror = () => reject(new Error('清理旧对话失败'));
  });
}

/**
 * 搜索对话内容
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Array>} 匹配的对话记录数组
 */
export async function searchConversations(keyword) {
  if (!keyword) return getAllConversations();

  const all = await getAllConversations();
  const kw = keyword.toLowerCase();

  return all.filter(conv => {
    // 搜索标题
    if (conv.title && conv.title.toLowerCase().includes(kw)) return true;
    // 搜索 URL
    if (conv.url && conv.url.toLowerCase().includes(kw)) return true;
    // 搜索消息内容
    if (Array.isArray(conv.messages)) {
      return conv.messages.some(m =>
        m.content && m.content.toLowerCase().includes(kw)
      );
    }
    return false;
  });
}
