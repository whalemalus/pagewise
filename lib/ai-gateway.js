/**
 * AIGateway — 共享 AI 网关模块
 *
 * 管理 PageWise 与 DocMind 之间的 AI 配置同步：
 *   - 从 DocMind 获取 AI 配置（provider、model、API key）
 *   - 一键同步配置到 PageWise 本地设置
 *   - 配置冲突检测与提示
 *   - 通过 DocMind API 获取统一的 token 使用统计
 *
 * 作为可选模块，不影响 PageWise 独立使用。
 *
 * @module ai-gateway
 */

import { DocMindClient } from './docmind-client.js'

/** 存储键名 */
const STORAGE_KEY = 'pagewiseAiGateway'

/**
 * AI 网关同步管理器
 */
export class AIGateway {
  /**
   * @param {Object} options
   * @param {DocMindClient} [options.client] - DocMind 客户端实例
   * @param {Function} [options.storageGet] - chrome.storage.sync.get 替代（测试用）
   * @param {Function} [options.storageSet] - chrome.storage.sync.set 替代（测试用）
   * @param {Function} [options.onConfigSynced] - 配置同步完成回调
   */
  constructor({ client = null, storageGet = null, storageSet = null, onConfigSynced = null } = {}) {
    this._client = client
    this._storageGet = storageGet
    this._storageSet = storageSet
    this._onConfigSynced = onConfigSynced

    /** @type {{enabled: boolean, lastSyncAt: string|null, autoSync: boolean, conflictPolicy: string}} */
    this._config = {
      enabled: false,
      lastSyncAt: null,
      autoSync: false,
      conflictPolicy: 'prompt', // 'prompt' | 'overwrite' | 'keep-local'
    }

    /** @type {Object|null} 上次从 DocMind 获取的 AI 配置 */
    this._remoteConfig = null

    /** @type {Object|null} 上次检测到的冲突 */
    this._lastConflict = null
  }

  /**
   * 从 chrome.storage 加载网关配置
   * @returns {Promise<Object>} 配置对象
   */
  async loadConfig() {
    const getter = this._storageGet || this._getDefaultStorageGet()

    return new Promise((resolve) => {
      getter({ [STORAGE_KEY]: this._config }, (result) => {
        this._config = { ...this._config, ...result[STORAGE_KEY] }
        resolve(this._config)
      })
    })
  }

  /**
   * 保存网关配置到 chrome.storage
   * @param {Object} config - 配置更新
   * @returns {Promise<void>}
   */
  async saveConfig(config) {
    this._config = { ...this._config, ...config }
    const setter = this._storageSet || this._getDefaultStorageSet()

    return new Promise((resolve) => {
      setter({ [STORAGE_KEY]: this._config }, resolve)
    })
  }

  /**
   * 获取当前网关状态
   * @returns {{enabled: boolean, lastSyncAt: string|null, autoSync: boolean, conflictPolicy: string, hasRemoteConfig: boolean, hasConflict: boolean}}
   */
  getStatus() {
    return {
      enabled: this._config.enabled,
      lastSyncAt: this._config.lastSyncAt,
      autoSync: this._config.autoSync,
      conflictPolicy: this._config.conflictPolicy,
      hasRemoteConfig: !!this._remoteConfig,
      hasConflict: !!this._lastConflict,
    }
  }

  /**
   * 从 DocMind 获取 AI 配置
   *
   * @param {Object} [localSettings] - 当前 PageWise 本地 AI 设置（用于冲突检测）
   * @returns {Promise<{success: boolean, config?: Object, conflict?: Object, error?: string}>}
   */
  async fetchRemoteConfig(localSettings = null) {
    if (!this._client) {
      return { success: false, error: 'DocMind 客户端未初始化' }
    }

    const result = await this._client.getAIConfig()
    if (!result.success) {
      return { success: false, error: result.error }
    }

    this._remoteConfig = result.config
    this._lastConflict = null

    // 冲突检测
    if (localSettings) {
      const conflict = this._detectConflict(localSettings, result.config)
      if (conflict) {
        this._lastConflict = conflict
        return { success: true, config: result.config, conflict }
      }
    }

    return { success: true, config: result.config }
  }

  /**
   * 将 DocMind 的 AI 配置应用到 PageWise 本地设置
   *
   * @param {Object} options - 同步选项
   * @param {boolean} [options.skipConflictCheck=false] - 跳过冲突检查
   * @returns {Promise<{success: boolean, settings?: Object, skipped?: boolean, conflict?: Object, error?: string}>}
   */
  async applyRemoteConfig(options = {}) {
    const { skipConflictCheck = false } = options

    if (!this._remoteConfig) {
      // 先获取远程配置
      const fetchResult = await this.fetchRemoteConfig()
      if (!fetchResult.success) {
        return { success: false, error: fetchResult.error }
      }
    }

    // 冲突检查
    if (!skipConflictCheck && this._lastConflict && this._config.conflictPolicy === 'keep-local') {
      return { success: true, skipped: true, conflict: this._lastConflict }
    }

    if (!skipConflictCheck && this._lastConflict && this._config.conflictPolicy === 'prompt') {
      return { success: false, conflict: this._lastConflict, error: '配置冲突，请手动确认' }
    }

    const newSettings = this._buildLocalSettings(this._remoteConfig)

    // 保存到 chrome.storage.sync
    const setter = this._storageSet || this._getDefaultStorageSet()
    await new Promise((resolve) => {
      setter(newSettings, resolve)
    })

    this._config.lastSyncAt = new Date().toISOString()
    await this.saveConfig({ lastSyncAt: this._config.lastSyncAt })

    if (this._onConfigSynced) {
      this._onConfigSynced(newSettings)
    }

    return { success: true, settings: newSettings }
  }

  /**
   * 强制同步（忽略冲突，直接覆盖）
   * @returns {Promise<{success: boolean, settings?: Object, error?: string}>}
   */
  async forceSyncConfig() {
    return this.applyRemoteConfig({ skipConflictCheck: true })
  }

  /**
   * 保留本地配置，忽略远程配置
   * @returns {Promise<void>}
   */
  async keepLocalConfig() {
    this._lastConflict = null
    this._config.lastSyncAt = new Date().toISOString()
    await this.saveConfig({ lastSyncAt: this._config.lastSyncAt })
  }

  /**
   * 从 DocMind 获取可用模型列表
   * @returns {Promise<{success: boolean, models?: Array<Object>, error?: string}>}
   */
  async getAvailableModels() {
    if (!this._client) {
      return { success: false, error: 'DocMind 客户端未初始化', models: [] }
    }

    return this._client.getAvailableModels()
  }

  /**
   * 从 DocMind 获取统一的 AI 使用量统计
   *
   * @param {Object} [options] - 查询选项
   * @param {string} [options.since] - 起始时间（ISO 格式）
   * @param {string} [options.until] - 结束时间（ISO 格式）
   * @returns {Promise<{success: boolean, usage?: Object, error?: string}>}
   */
  async getUsageStats(options = {}) {
    if (!this._client) {
      return { success: false, error: 'DocMind 客户端未初始化' }
    }

    return this._client.getAIUsage(options)
  }

  /**
   * 检测本地设置与远程配置之间的冲突
   * @param {Object} local - 本地设置
   * @param {Object} remote - 远程配置
   * @returns {Object|null} 冲突信息，无冲突返回 null
   */
  _detectConflict(local, remote) {
    const differences = []

    if (remote.protocol && local.apiProtocol && remote.protocol !== local.apiProtocol) {
      differences.push({
        field: 'protocol',
        local: local.apiProtocol,
        remote: remote.protocol,
      })
    }

    if (remote.model && local.model && remote.model !== local.model) {
      differences.push({
        field: 'model',
        local: local.model,
        remote: remote.model,
      })
    }

    if (remote.baseUrl && local.apiBaseUrl && remote.baseUrl !== local.apiBaseUrl) {
      differences.push({
        field: 'baseUrl',
        local: local.apiBaseUrl,
        remote: remote.baseUrl,
      })
    }

    if (remote.maxTokens && local.maxTokens && remote.maxTokens !== local.maxTokens) {
      differences.push({
        field: 'maxTokens',
        local: local.maxTokens,
        remote: remote.maxTokens,
      })
    }

    if (differences.length === 0) return null

    return {
      differences,
      local: {
        protocol: local.apiProtocol,
        model: local.model,
        baseUrl: local.apiBaseUrl,
        maxTokens: local.maxTokens,
      },
      remote: {
        protocol: remote.protocol,
        model: remote.model,
        baseUrl: remote.baseUrl,
        maxTokens: remote.maxTokens,
      },
    }
  }

  /**
   * 将远程 AI 配置转换为 PageWise 本地设置格式
   * @param {Object} remoteConfig - 远程 AI 配置
   * @returns {Object} PageWise 本地设置
   */
  _buildLocalSettings(remoteConfig) {
    return {
      apiProtocol: remoteConfig.protocol || 'openai',
      model: remoteConfig.model || '',
      apiBaseUrl: remoteConfig.baseUrl || '',
      maxTokens: remoteConfig.maxTokens || 4096,
    }
  }

  /**
   * 获取当前配置摘要（不包含敏感信息）
   * @returns {{enabled: boolean, lastSyncAt: string|null, autoSync: boolean, conflictPolicy: string}}
   */
  getConfigSummary() {
    return {
      enabled: this._config.enabled,
      lastSyncAt: this._config.lastSyncAt,
      autoSync: this._config.autoSync,
      conflictPolicy: this._config.conflictPolicy,
    }
  }

  /**
   * 获取上次检测到的冲突
   * @returns {Object|null}
   */
  getLastConflict() {
    return this._lastConflict
  }

  /**
   * 获取上次从 DocMind 获取的远程配置
   * @returns {Object|null}
   */
  getRemoteConfig() {
    return this._remoteConfig
  }

  /**
   * 销毁网关（清理资源）
   */
  destroy() {
    this._remoteConfig = null
    this._lastConflict = null
  }

  // ==================== 内部方法 ====================

  /**
   * 获取默认的 storage.get 函数
   */
  _getDefaultStorageGet() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      return chrome.storage.sync.get.bind(chrome.storage.sync)
    }
    return (defaults, callback) => callback(defaults)
  }

  /**
   * 获取默认的 storage.set 函数
   */
  _getDefaultStorageSet() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      return chrome.storage.sync.set.bind(chrome.storage.sync)
    }
    return (items, callback) => { if (callback) callback() }
  }
}
