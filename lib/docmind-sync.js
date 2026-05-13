/**
 * DocMindSyncManager — DocMind 同步管理器
 *
 * 管理自动同步、增量同步（基于时间戳）、冲突处理、同步状态。
 * 依赖 DocMindClient 进行网络通信，依赖 chrome.storage 存储配置。
 *
 * 作为可选模块，不连接 DocMind 也能独立使用。
 */

import { DocMindClient } from './docmind-client.js';

/** 默认同步间隔（毫秒） */
const DEFAULT_SYNC_INTERVAL = 5 * 60 * 1000; // 5 分钟

/** 存储键名 */
const STORAGE_KEY = 'pagewiseDocMind';

/** 同步状态枚举 */
export const SyncStatus = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  SUCCESS: 'success',
  ERROR: 'error',
  DISABLED: 'disabled',
};

/** 冲突策略枚举 */
export const ConflictStrategy = {
  LOCAL_WINS: 'local_wins',
  REMOTE_WINS: 'remote_wins',
  SKIP: 'skip',
};

/**
 * DocMind 同步管理器
 */
export class DocMindSyncManager {
  /**
   * @param {Object} options
   * @param {DocMindClient} [options.client] - DocMind 客户端实例
   * @param {Function} [options.storageGet] - chrome.storage.sync.get 替代（测试用）
   * @param {Function} [options.storageSet] - chrome.storage.sync.set 替代（测试用）
   * @param {number} [options.syncInterval] - 同步间隔（毫秒）
   */
  constructor({ client = null, storageGet = null, storageSet = null, syncInterval = DEFAULT_SYNC_INTERVAL } = {}) {
    this._client = client;
    this._storageGet = storageGet;
    this._storageSet = storageSet;
    this._syncInterval = syncInterval;

    /** @type {{enabled: boolean, serverUrl: string, apiKey: string, lastSyncAt: string|null, conflictStrategy: string}} */
    this._config = {
      enabled: false,
      serverUrl: '',
      apiKey: '',
      lastSyncAt: null,
      conflictStrategy: ConflictStrategy.LOCAL_WINS,
    };

    /** @type {string} 同步状态 */
    this._status = SyncStatus.DISABLED;

    /** @type {string|null} 最后错误信息 */
    this._lastError = null;

    /** @type {number|null} 自动同步定时器 ID */
    this._autoSyncTimer = null;

    /** @type {number|null} 最后同步时间戳（用于增量同步） */
    this._lastSyncTimestamp = null;
  }

  /**
   * 从 chrome.storage 加载 DocMind 配置
   * @returns {Promise<Object>} 配置对象
   */
  async loadConfig() {
    const getter = this._storageGet || this._getDefaultStorageGet();

    return new Promise((resolve) => {
      getter({ [STORAGE_KEY]: this._config }, (result) => {
        this._config = { ...this._config, ...result[STORAGE_KEY] };

        // 如果配置已启用且有服务器信息，初始化客户端
        if (this._config.enabled && this._config.serverUrl && this._config.apiKey) {
          this._initClient();
          this._status = SyncStatus.IDLE;
        } else {
          this._status = SyncStatus.DISABLED;
        }

        if (this._config.lastSyncAt) {
          this._lastSyncTimestamp = new Date(this._config.lastSyncAt).getTime();
        }

        resolve(this._config);
      });
    });
  }

  /**
   * 保存 DocMind 配置到 chrome.storage
   * @param {Object} config - 配置更新
   * @returns {Promise<void>}
   */
  async saveConfig(config) {
    this._config = { ...this._config, ...config };
    const setter = this._storageSet || this._getDefaultStorageSet();

    return new Promise((resolve) => {
      setter({ [STORAGE_KEY]: this._config }, () => {
        // 配置更新后重新初始化客户端
        if (this._config.enabled && this._config.serverUrl && this._config.apiKey) {
          this._initClient();
          this._status = SyncStatus.IDLE;
        } else {
          this._status = SyncStatus.DISABLED;
          this._stopAutoSync();
        }
        resolve();
      });
    });
  }

  /**
   * 切换自动同步
   * @param {boolean} enabled - 是否启用
   * @returns {Promise<void>}
   */
  async toggleAutoSync(enabled) {
    await this.saveConfig({ enabled });

    if (enabled) {
      this._startAutoSync();
    } else {
      this._stopAutoSync();
    }
  }

  /**
   * 执行同步（增量，基于时间戳）
   * @param {Object} options
   * @param {Array} [options.entries] - 知识条目
   * @param {Array} [options.bookmarks] - 书签
   * @returns {Promise<{status: string, knowledge: Object, bookmarks: Object}>}
   */
  async sync({ entries = [], bookmarks = [] } = {}) {
    if (!this._config.enabled) {
      return { status: SyncStatus.DISABLED, knowledge: null, bookmarks: null };
    }

    if (!this._client) {
      return { status: SyncStatus.ERROR, knowledge: null, bookmarks: null };
    }

    this._status = SyncStatus.SYNCING;
    this._lastError = null;

    try {
      // 增量同步：只同步上次同步之后的数据
      const incrementalEntries = this._filterIncremental(entries);
      const incrementalBookmarks = this._filterIncremental(bookmarks);

      const results = { knowledge: null, bookmarks: null };

      // 同步知识条目
      if (incrementalEntries.length > 0) {
        results.knowledge = await this._client.syncKnowledge(incrementalEntries);
      } else {
        results.knowledge = { synced: 0, skipped: 0, errors: [] };
      }

      // 同步书签
      if (incrementalBookmarks.length > 0) {
        results.bookmarks = await this._client.syncBookmarks(incrementalBookmarks);
      } else {
        results.bookmarks = { synced: 0, skipped: 0, errors: [] };
      }

      // 检查是否有错误
      const hasErrors = (results.knowledge.errors && results.knowledge.errors.length > 0) ||
                        (results.bookmarks.errors && results.bookmarks.errors.length > 0);

      if (hasErrors) {
        this._status = SyncStatus.ERROR;
        const allErrors = [
          ...(results.knowledge.errors || []),
          ...(results.bookmarks.errors || []),
        ];
        this._lastError = allErrors.join('; ');
      } else {
        this._status = SyncStatus.SUCCESS;
        const now = new Date().toISOString();
        this._lastSyncTimestamp = Date.now();
        this._config.lastSyncAt = now;
        // 异步保存，不阻塞返回
        this._saveConfigSilent({ lastSyncAt: now });
      }

      return { status: this._status, ...results };
    } catch (err) {
      this._status = SyncStatus.ERROR;
      this._lastError = err.message;
      return { status: SyncStatus.ERROR, knowledge: null, bookmarks: null };
    }
  }

  /**
   * 获取同步状态
   * @returns {{status: string, lastSyncAt: string|null, lastError: string|null, autoSyncEnabled: boolean, conflictStrategy: string}}
   */
  getSyncStatus() {
    return {
      status: this._status,
      lastSyncAt: this._config.lastSyncAt,
      lastError: this._lastError,
      autoSyncEnabled: this._config.enabled,
      conflictStrategy: this._config.conflictStrategy,
    };
  }

  /**
   * 获取当前配置（不包含敏感信息）
   * @returns {{enabled: boolean, serverUrl: string, hasApiKey: boolean, lastSyncAt: string|null, conflictStrategy: string}}
   */
  getConfigSummary() {
    return {
      enabled: this._config.enabled,
      serverUrl: this._config.serverUrl,
      hasApiKey: !!this._config.apiKey,
      lastSyncAt: this._config.lastSyncAt,
      conflictStrategy: this._config.conflictStrategy,
    };
  }

  /**
   * 销毁同步管理器（清理定时器）
   */
  destroy() {
    this._stopAutoSync();
  }

  // ==================== 内部方法 ====================

  /**
   * 初始化 DocMind 客户端
   */
  _initClient() {
    if (this._client) {
      this._client.serverUrl = this._config.serverUrl.replace(/\/+$/, '');
      this._client.apiKey = this._config.apiKey;
      this._client._connected = true;
    } else {
      this._client = new DocMindClient({
        serverUrl: this._config.serverUrl,
        apiKey: this._config.apiKey,
      });
      this._client._connected = true;
    }
  }

  /**
   * 增量过滤：只保留上次同步之后新增或更新的数据
   * @param {Array} items - 数据数组（需要有 createdAt 或 updatedAt 字段）
   * @returns {Array} - 过滤后的数据
   */
  _filterIncremental(items) {
    if (!items || items.length === 0) return [];
    if (!this._lastSyncTimestamp) return items;

    return items.filter(item => {
      const itemTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
      return itemTime > this._lastSyncTimestamp;
    });
  }

  /**
   * 处理冲突
   * @param {Object} local - 本地数据
   * @param {Object} remote - 远程数据
   * @returns {Object|null} - 解决后的数据，或 null（跳过）
   */
  resolveConflict(local, remote) {
    switch (this._config.conflictStrategy) {
      case ConflictStrategy.LOCAL_WINS:
        return local;
      case ConflictStrategy.REMOTE_WINS:
        return remote;
      case ConflictStrategy.SKIP:
        return null;
      default:
        return local;
    }
  }

  /**
   * 启动自动同步定时器
   */
  _startAutoSync() {
    this._stopAutoSync();
    if (this._syncInterval > 0) {
      this._autoSyncTimer = setInterval(() => {
        // 自动同步时仅触发事件，实际同步由调用方提供数据
        // 这里仅更新状态
      }, this._syncInterval);
    }
  }

  /**
   * 停止自动同步定时器
   */
  _stopAutoSync() {
    if (this._autoSyncTimer !== null) {
      clearInterval(this._autoSyncTimer);
      this._autoSyncTimer = null;
    }
  }

  /**
   * 静默保存配置（不抛出错误）
   * @param {Object} partial - 部分配置更新
   */
  async _saveConfigSilent(partial) {
    try {
      this._config = { ...this._config, ...partial };
      const setter = this._storageSet || this._getDefaultStorageSet();
      await new Promise((resolve) => {
        setter({ [STORAGE_KEY]: this._config }, resolve);
      });
    } catch (e) {
      // 静默失败，不阻塞主流程
    }
  }

  /**
   * 获取默认的 storage.get 函数
   */
  _getDefaultStorageGet() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      return chrome.storage.sync.get.bind(chrome.storage.sync);
    }
    // 回退: 直接回调默认值
    return (defaults, callback) => callback(defaults);
  }

  /**
   * 获取默认的 storage.set 函数
   */
  _getDefaultStorageSet() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      return chrome.storage.sync.set.bind(chrome.storage.sync);
    }
    return (items, callback) => { if (callback) callback(); };
  }
}
