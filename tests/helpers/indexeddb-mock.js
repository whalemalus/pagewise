/**
 * IndexedDB 内存 Mock — 用于 knowledge-base.js 测试
 *
 * 实现 IndexedDB 的核心子集，支持：
 * - open / onupgradeneeded / onsuccess
 * - createObjectStore / createIndex
 * - transaction / objectStore
 * - add / get / put / delete / getAll / openCursor
 */

/** 简易 IDBRequest */
class MockIDBRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
  }
}

/** 简易 IDBCursorWithValue — 真实模拟 cursor 行为 */
class MockIDBCursorWithValue {
  constructor(values, direction, req, store) {
    this._values = direction === 'prev' ? [...values].reverse() : [...values];
    this._index = 0;
    this._req = req;
    this._store = store || null;
    // 初始值
    this.value = this._values.length > 0 ? this._values[0] : undefined;
  }

  /**
   * 删除当前游标指向的记录。
   * 真实 IndexedDB 行为：返回 IDBRequest，完成后触发 onsuccess。
   */
  delete() {
    const req = new MockIDBRequest();
    const currentValue = this.value;
    if (currentValue && this._store) {
      const key = this._store.keyPath ? currentValue[this._store.keyPath] : currentValue.id;
      this._store._records.delete(key);
    }
    Promise.resolve().then(() => {
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  /**
   * 推进游标到下一条记录。
   * 真实 IndexedDB 行为：再次触发同一 request 的 onsuccess，
   * event.target.result 是更新后的 cursor 或 null（遍历完毕）。
   */
  continue() {
    this._index++;
    if (this._index < this._values.length) {
      this.value = this._values[this._index];
      // 更新 request.result 为自身（cursor 已推进）
      this._req.result = this;
    } else {
      // 遍历完毕：真实 IndexedDB 返回 null
      this.value = undefined;
      this._req.result = null;
    }
    // 异步触发 onsuccess
    const req = this._req;
    Promise.resolve().then(() => {
      if (req.onsuccess) {
        req.onsuccess({ target: req });
      }
    });
  }
}

/** 简易 IDBObjectStore */
class MockIDBObjectStore {
  constructor(name, options = {}) {
    this.name = name;
    this.keyPath = options.keyPath || null;
    this.autoIncrement = options.autoIncrement || false;
    this._records = new Map();
    this._nextId = 1;
    this._indexes = {};
  }

  createIndex(indexName, keyPath, options = {}) {
    this._indexes[indexName] = {
      name: indexName,
      keyPath,
      unique: options.unique || false,
      multiEntry: options.multiEntry || false,
    };
  }

  index(name) {
    const idxDef = this._indexes[name];
    if (!idxDef) throw new Error(`Index not found: ${name}`);
    return new MockIDBIndex(this, idxDef);
  }

  add(record) {
    const req = new MockIDBRequest();
    Promise.resolve().then(() => {
      try {
        let key;
        if (this.autoIncrement) {
          key = this._nextId++;
        } else if (this.keyPath) {
          key = record[this.keyPath];
        }
        const stored = { ...record, [this.keyPath || 'id']: key };
        this._records.set(key, stored);
        req.result = key;
        if (req.onsuccess) req.onsuccess({ target: req });
      } catch (e) {
        req.error = e;
        if (req.onerror) req.onerror({ target: req });
      }
    });
    return req;
  }

  get(key) {
    const req = new MockIDBRequest();
    Promise.resolve().then(() => {
      req.result = this._records.get(key) || undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  put(record) {
    const req = new MockIDBRequest();
    Promise.resolve().then(() => {
      try {
        const key = this.keyPath ? record[this.keyPath] : record.id;
        this._records.set(key, { ...record });
        req.result = key;
        if (req.onsuccess) req.onsuccess({ target: req });
      } catch (e) {
        req.error = e;
        if (req.onerror) req.onerror({ target: req });
      }
    });
    return req;
  }

  delete(key) {
    const req = new MockIDBRequest();
    Promise.resolve().then(() => {
      this._records.delete(key);
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  getAll() {
    const req = new MockIDBRequest();
    Promise.resolve().then(() => {
      req.result = [...this._records.values()];
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  count() {
    const req = new MockIDBRequest();
    Promise.resolve().then(() => {
      req.result = this._records.size;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  openCursor(range, direction) {
    const req = new MockIDBRequest();
    const values = [...this._records.values()];
    Promise.resolve().then(() => {
      if (values.length === 0) {
        // 无记录：直接返回 null
        req.result = null;
        if (req.onsuccess) req.onsuccess({ target: req });
      } else {
        const cursor = new MockIDBCursorWithValue(values, direction, req, this);
        req.result = cursor;
        if (req.onsuccess) req.onsuccess({ target: req });
      }
    });
    return req;
  }

  /**
   * 清除 store 中所有记录
   * @returns {MockIDBRequest}
   */
  clear() {
    const req = new MockIDBRequest();
    this._records.clear();
    this._nextId = 1;
    Promise.resolve().then(() => {
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
}

/** 简易 IDBIndex */
class MockIDBIndex {
  constructor(store, def) {
    this._store = store;
    this._def = def;
  }

  get(key) {
    const req = new MockIDBRequest();
    Promise.resolve().then(() => {
      for (const record of this._store._records.values()) {
        const fieldVal = record[this._def.keyPath];
        if (this._def.multiEntry && Array.isArray(fieldVal)) {
          if (fieldVal.includes(key)) {
            req.result = record;
            if (req.onsuccess) req.onsuccess({ target: req });
            return;
          }
        } else {
          if (fieldVal === key) {
            req.result = record;
            if (req.onsuccess) req.onsuccess({ target: req });
            return;
          }
        }
      }
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  getAll(key) {
    const req = new MockIDBRequest();
    Promise.resolve().then(() => {
      const results = [];
      for (const record of this._store._records.values()) {
        const fieldVal = record[this._def.keyPath];
        if (this._def.multiEntry && Array.isArray(fieldVal)) {
          if (key === undefined || fieldVal.includes(key)) {
            results.push(record);
          }
        } else {
          if (key === undefined || fieldVal === key) {
            results.push(record);
          }
        }
      }
      req.result = results;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  openCursor(range, direction) {
    return this._store.openCursor(range, direction);
  }
}

/** 简易 IDBTransaction */
class MockIDBTransaction {
  constructor(db, storeNames, mode) {
    this._db = db;
    this._storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.mode = mode;
  }

  objectStore(name) {
    const store = this._db._stores[name];
    if (!store) throw new Error(`Object store not found: ${name}`);
    return store;
  }
}

/** 简易 IDBDatabase */
class MockIDBDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this._stores = {};
    this.objectStoreNames = {
      contains: (name) => !!this._stores[name],
    };
  }

  createObjectStore(name, options = {}) {
    const store = new MockIDBObjectStore(name, options);
    this._stores[name] = store;
    return store;
  }

  transaction(storeNames, mode) {
    return new MockIDBTransaction(this, storeNames, mode);
  }

  close() {
    // No-op for mock
  }
}

/** IndexedDB mock 顶层对象 */
const mockDBs = {};

export const mockIndexedDB = {
  open(name, version) {
    const req = new MockIDBRequest();

    Promise.resolve().then(() => {
      const existing = mockDBs[name];
      const existingVersion = existing ? existing.version : 0;
      const newVersion = version || 1;

      // 如果已存在且版本相同，复用已有 DB（含 stores 和数据）
      if (existing && newVersion === existingVersion) {
        req.result = existing;
        if (req.onsuccess) req.onsuccess({ target: req });
        return;
      }

      const db = new MockIDBDatabase(name, newVersion);

      // 如果需要升级，触发 onupgradeneeded
      if (!existing || newVersion > existingVersion) {
        if (req.onupgradeneeded) {
          req.onupgradeneeded({ target: { result: db } });
        }
      }

      mockDBs[name] = db;
      req.result = db;
      if (req.onsuccess) req.onsuccess({ target: req });
    });

    return req;
  },
  deleteDatabase(name) {
    delete mockDBs[name];
  },
};

/** 重置所有 mock 数据库 */
export function resetIndexedDBMock() {
  for (const key of Object.keys(mockDBs)) {
    delete mockDBs[key];
  }
}

/** 安装到 globalThis */
export function installIndexedDBMock() {
  globalThis.indexedDB = mockIndexedDB;
  return mockIndexedDB;
}

/** 卸载 */
export function uninstallIndexedDBMock() {
  delete globalThis.indexedDB;
}
