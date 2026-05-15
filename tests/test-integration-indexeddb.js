/**
 * 集成测试 — IndexedDB 存储一致性
 *
 * 验证多模块共享 IndexedDB 存储时的读写一致性、
 * 版本升级兼容性、并发操作和跨模块数据隔离。
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock, uninstallIndexedDBMock } from './helpers/setup.js';

// ==================== 辅助工具 ====================

/** 将 IDBRequest 的 onsuccess/onerror 包装为 Promise */
function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error || new Error('IDB request failed'));
  });
}

/** 模拟 KnowledgeBase 的数据库初始化模式 */
async function initKnowledgeDB(dbName = 'AIAssistantKnowledgeBase', version = 1) {
  const req = indexedDB.open(dbName, version);

  return new Promise((resolve, reject) => {
    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        store.createIndex('sourceUrl', 'sourceUrl', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('tags', 'tags', { multiEntry: true });
        store.createIndex('category', 'category', { unique: false });
      }

      if (!db.objectStoreNames.contains('conversations')) {
        const convStore = db.createObjectStore('conversations', { keyPath: 'id', autoIncrement: true });
        convStore.createIndex('sourceUrl', 'sourceUrl', { unique: false });
        convStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror = (event) => reject(event.target.error);
  });
}

/** 模拟 ConversationStore 的数据库初始化模式 */
async function initConversationDB(dbName = 'PageWiseConversations', version = 1) {
  const req = indexedDB.open(dbName, version);

  return new Promise((resolve, reject) => {
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('conversations')) {
        const store = db.createObjectStore('conversations', { keyPath: 'id', autoIncrement: true });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror = (event) => reject(event.target.error);
  });
}

// ==================== 测试 ====================

describe('IndexedDB 一致性：多模块共享存储', () => {
  beforeEach(() => {
    installIndexedDBMock();
  });

  afterEach(() => {
    resetIndexedDBMock();
    uninstallIndexedDBMock();
  });

  it('KnowledgeBase 和 ConversationStore 使用不同的数据库，互不干扰', async () => {
    const kbDb = await initKnowledgeDB();
    const convDb = await initConversationDB();

    // KB 写入 entries
    const kbTx = kbDb.transaction('entries', 'readwrite');
    const kbStore = kbTx.objectStore('entries');
    const kbReq = kbStore.add({ title: 'KB Entry', content: 'knowledge content', sourceUrl: 'https://a.com', createdAt: Date.now() });
    await reqToPromise(kbReq);

    // ConversationStore 写入 conversations
    const convTx = convDb.transaction('conversations', 'readwrite');
    const convStore = convTx.objectStore('conversations');
    const convReq = convStore.add({ url: 'https://b.com', title: 'Conv', messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await reqToPromise(convReq);

    // 验证各自读取正确
    const kbTx2 = kbDb.transaction('entries', 'readonly');
    const kbEntries = await reqToPromise(kbTx2.objectStore('entries').getAll());
    assert.equal(kbEntries.length, 1);
    assert.equal(kbEntries[0].title, 'KB Entry');

    const convTx2 = convDb.transaction('conversations', 'readonly');
    const convEntries = await reqToPromise(convTx2.objectStore('conversations').getAll());
    assert.equal(convEntries.length, 1);
    assert.equal(convEntries[0].url, 'https://b.com');
  });

  it('同一数据库的 entries 和 conversations store 各自独立', async () => {
    const db = await initKnowledgeDB();
    assert.ok(db.objectStoreNames.contains('entries'));
    assert.ok(db.objectStoreNames.contains('conversations'));

    // 向 entries 写入
    const tx1 = db.transaction('entries', 'readwrite');
    await reqToPromise(tx1.objectStore('entries').add({ title: 'E1', sourceUrl: 'x', createdAt: 1 }));

    // 向 conversations 写入
    const tx2 = db.transaction('conversations', 'readwrite');
    await reqToPromise(tx2.objectStore('conversations').add({ sourceUrl: 'x', createdAt: 'now' }));

    // 验证
    const tx3 = db.transaction('entries', 'readonly');
    const entries = await reqToPromise(tx3.objectStore('entries').getAll());
    assert.equal(entries.length, 1);

    const tx4 = db.transaction('conversations', 'readonly');
    const convs = await reqToPromise(tx4.objectStore('conversations').getAll());
    assert.equal(convs.length, 1);
  });

  it('resetIndexedDBMock 清除所有数据库实例', async () => {
    const db1 = await initKnowledgeDB('TestDB1');
    const db2 = await initConversationDB('TestDB2');

    // 写入数据
    const tx1 = db1.transaction('entries', 'readwrite');
    await reqToPromise(tx1.objectStore('entries').add({ title: 'X', sourceUrl: 'u', createdAt: 1 }));
    const tx2 = db2.transaction('conversations', 'readwrite');
    await reqToPromise(tx2.objectStore('conversations').add({ url: 'u', title: 'C', messages: [], createdAt: 'now', updatedAt: 'now' }));

    // 重置
    resetIndexedDBMock();

    // 重新打开，应该是空的
    const db1b = await initKnowledgeDB('TestDB1');
    const tx1b = db1b.transaction('entries', 'readonly');
    const entries = await reqToPromise(tx1b.objectStore('entries').getAll());
    assert.equal(entries.length, 0);
  });
});

describe('IndexedDB 一致性：数据写入后读取', () => {
  beforeEach(() => {
    installIndexedDBMock();
  });

  afterEach(() => {
    resetIndexedDBMock();
    uninstallIndexedDBMock();
  });

  it('写入条目后立即读取，数据一致', async () => {
    const db = await initKnowledgeDB();
    const record = {
      title: 'React Hooks',
      content: 'Hooks let you use state in function components',
      sourceUrl: 'https://react.dev',
      tags: ['react', 'hooks'],
      category: 'framework',
      createdAt: Date.now()
    };

    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    const addResult = await reqToPromise(store.add(record));
    const id = addResult; // autoIncrement 返回生成的 key

    const tx2 = db.transaction('entries', 'readonly');
    const retrieved = await reqToPromise(tx2.objectStore('entries').get(id));

    assert.ok(retrieved);
    assert.equal(retrieved.title, 'React Hooks');
    assert.equal(retrieved.sourceUrl, 'https://react.dev');
    assert.deepEqual(retrieved.tags, ['react', 'hooks']);
    assert.equal(retrieved.category, 'framework');
  });

  it('put 覆盖已有记录，get 返回最新值', async () => {
    const db = await initKnowledgeDB();

    // 写入初始记录
    const tx1 = db.transaction('entries', 'readwrite');
    await reqToPromise(tx1.objectStore('entries').add({ id: 100, title: 'V1', content: 'old', sourceUrl: 'u', createdAt: 1 }));

    // put 更新
    const tx2 = db.transaction('entries', 'readwrite');
    await reqToPromise(tx2.objectStore('entries').put({ id: 100, title: 'V2', content: 'new', sourceUrl: 'u', createdAt: 1 }));

    // 读取
    const tx3 = db.transaction('entries', 'readonly');
    const result = await reqToPromise(tx3.objectStore('entries').get(100));
    assert.equal(result.title, 'V2');
    assert.equal(result.content, 'new');
  });

  it('delete 删除后 get 返回 undefined', async () => {
    const db = await initKnowledgeDB();

    const tx1 = db.transaction('entries', 'readwrite');
    const addResult = await reqToPromise(tx1.objectStore('entries').add({ title: 'Temp', sourceUrl: 'u', createdAt: 1 }));
    const id = addResult;

    const tx2 = db.transaction('entries', 'readwrite');
    await reqToPromise(tx2.objectStore('entries').delete(id));

    const tx3 = db.transaction('entries', 'readonly');
    const result = await reqToPromise(tx3.objectStore('entries').get(id));
    assert.equal(result, undefined);
  });

  it('getAll 返回所有记录', async () => {
    const db = await initKnowledgeDB();
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    await reqToPromise(store.add({ title: 'A', sourceUrl: 'u1', createdAt: 1 }));
    await reqToPromise(store.add({ title: 'B', sourceUrl: 'u2', createdAt: 2 }));
    await reqToPromise(store.add({ title: 'C', sourceUrl: 'u3', createdAt: 3 }));

    const tx2 = db.transaction('entries', 'readonly');
    const all = await reqToPromise(tx2.objectStore('entries').getAll());
    assert.equal(all.length, 3);
    const titles = all.map(e => e.title).sort();
    assert.deepEqual(titles, ['A', 'B', 'C']);
  });

  it('通过 index 查询按 sourceUrl 检索', async () => {
    const db = await initKnowledgeDB();

    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    await reqToPromise(store.add({ title: 'Page A', sourceUrl: 'https://a.com', createdAt: 1 }));
    await reqToPromise(store.add({ title: 'Page B', sourceUrl: 'https://b.com', createdAt: 2 }));
    await reqToPromise(store.add({ title: 'Page A2', sourceUrl: 'https://a.com', createdAt: 3 }));

    const tx2 = db.transaction('entries', 'readonly');
    const index = tx2.objectStore('entries').index('sourceUrl');
    const results = await reqToPromise(index.getAll('https://a.com'));
    assert.equal(results.length, 2);
    assert.ok(results.every(r => r.sourceUrl === 'https://a.com'));
  });
});

describe('IndexedDB 一致性：版本升级兼容', () => {
  beforeEach(() => {
    installIndexedDBMock();
  });

  afterEach(() => {
    resetIndexedDBMock();
    uninstallIndexedDBMock();
  });

  it('版本升级触发 onupgradeneeded 创建新 store', async () => {
    // 打开 v1 — 只有 entries
    const db1 = await new Promise((resolve, reject) => {
      const req = indexedDB.open('UpgradeTestDB', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('entries')) {
          db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });

    assert.ok(db1.objectStoreNames.contains('entries'));

    // 打开 v2 — 新增 highlights store
    const db2 = await new Promise((resolve, reject) => {
      const req = indexedDB.open('UpgradeTestDB', 2);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('entries')) {
          db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('highlights')) {
          const hlStore = db.createObjectStore('highlights', { keyPath: 'id', autoIncrement: true });
          hlStore.createIndex('url', 'url', { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });

    assert.ok(db2.objectStoreNames.contains('entries'));
    assert.ok(db2.objectStoreNames.contains('highlights'));
    assert.equal(db2.version, 2);
  });

  it('升级后写入新 store 数据并读取一致', async () => {
    // v1
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('UpgradeDataTest', 1);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });

    // v2 — 增加 tags store
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('UpgradeDataTest', 2);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('entries')) {
          d.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        }
        if (!d.objectStoreNames.contains('tags')) {
          d.createObjectStore('tags', { keyPath: 'name' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });

    // 写入新 store
    const tx = db.transaction('tags', 'readwrite');
    await reqToPromise(tx.objectStore('tags').add({ name: 'react', count: 5 }));

    // 读取
    const tx2 = db.transaction('tags', 'readonly');
    const tag = await reqToPromise(tx2.objectStore('tags').get('react'));
    assert.equal(tag.name, 'react');
    assert.equal(tag.count, 5);
  });
});

describe('IndexedDB 一致性：跨模块对话存储模拟', () => {
  beforeEach(() => {
    installIndexedDBMock();
  });

  afterEach(() => {
    resetIndexedDBMock();
    uninstallIndexedDBMock();
  });

  it('ConversationStore 的 save → get 流程一致', async () => {
    const db = await initConversationDB();
    const url = 'https://example.com/page1';
    const title = 'Example Page';
    const messages = [
      { role: 'user', content: 'What is this page about?', timestamp: Date.now() },
      { role: 'assistant', content: 'This is an example page.', timestamp: Date.now() + 1000 }
    ];

    // Save conversation
    const tx = db.transaction('conversations', 'readwrite');
    const store = tx.objectStore('conversations');
    const record = { url, title, messages, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const addResult = await reqToPromise(store.add(record));
    const id = addResult;

    // Get by URL (via index)
    const tx2 = db.transaction('conversations', 'readonly');
    const index = tx2.objectStore('conversations').index('url');
    const retrieved = await reqToPromise(index.get(url));

    assert.ok(retrieved);
    assert.equal(retrieved.url, url);
    assert.equal(retrieved.title, title);
    assert.equal(retrieved.messages.length, 2);
    assert.equal(retrieved.messages[0].content, 'What is this page about?');
  });

  it('同一 URL 的对话可更新（模拟 saveConversation 去重逻辑）', async () => {
    const db = await initConversationDB();
    const url = 'https://example.com/page1';

    // 第一次保存
    const tx1 = db.transaction('conversations', 'readwrite');
    const store1 = tx1.objectStore('conversations');
    const rec1 = { url, title: 'V1', messages: [{ role: 'user', content: 'Hi' }], createdAt: 't1', updatedAt: 't1' };
    const id = await reqToPromise(store1.add(rec1));

    // 更新（模拟 put 覆盖）
    const tx2 = db.transaction('conversations', 'readwrite');
    const store2 = tx2.objectStore('conversations');
    const rec2 = { id, url, title: 'V2', messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello!' }], createdAt: 't1', updatedAt: 't2' };
    await reqToPromise(store2.put(rec2));

    // 读取验证
    const tx3 = db.transaction('conversations', 'readonly');
    const result = await reqToPromise(tx3.objectStore('conversations').get(id));
    assert.equal(result.title, 'V2');
    assert.equal(result.messages.length, 2);
    assert.equal(result.updatedAt, 't2');
  });

  it('deleteConversation 后 getAll 不再包含已删除记录', async () => {
    const db = await initConversationDB();
    const store = (mode) => {
      const tx = db.transaction('conversations', mode);
      return tx.objectStore('conversations');
    };

    // 写入 3 条
    for (let i = 1; i <= 3; i++) {
      await reqToPromise(store('readwrite').add({
        url: `https://page${i}.com`, title: `Page ${i}`, messages: [],
        createdAt: `t${i}`, updatedAt: `t${i}`
      }));
    }

    // 删除 id=2
    await reqToPromise(store('readwrite').delete(2));

    // getAll
    const all = await reqToPromise(store('readonly').getAll());
    assert.equal(all.length, 2);
    assert.ok(all.every(r => r.id !== 2));
  });
});
