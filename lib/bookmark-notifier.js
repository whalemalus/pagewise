/**
 * BookmarkNotifier — 书签通知系统
 *
 * 管理书签相关事件的通知生成、偏好设置和历史记录:
 *   - notifyDeadLinks(links)         — 通知死链检测结果
 *   - notifyNewBookmarks(count)      — 通知新书签数量
 *   - notifyDuplicates(count)        — 通知重复书签数量
 *   - notifyBackupComplete(path)     — 通知备份完成
 *   - setNotificationPrefs(prefs)    — 设置通知偏好
 *   - getNotificationHistory()       — 获取通知历史
 *
 * 纯前端实现，不依赖外部 API。
 *
 * @module lib/bookmark-notifier
 */

// ==================== 常量 ====================

/** 支持的通知类型 */
const NOTIFICATION_TYPES = [
  'dead-links',
  'new-bookmarks',
  'duplicates',
  'backup-complete',
]

/** 支持的通知渠道 */
const NOTIFICATION_CHANNELS = ['browser', 'badge', 'sound']

/** 支持的通知级别 */
const NOTIFICATION_LEVELS = ['info', 'warning', 'error']

/** 默认通知级别映射 */
const DEFAULT_LEVELS = {
  'dead-links':      'warning',
  'new-bookmarks':   'info',
  'duplicates':      'warning',
  'backup-complete': 'info',
}

/** 默认通知渠道 */
const DEFAULT_CHANNEL = 'browser'

/** 通知历史最大条数 */
const MAX_HISTORY = 500

/** 通知合并间隔 (ms) — 同类通知在此间隔内合并 */
const MERGE_INTERVAL = 5000

// ==================== BookmarkNotifier ====================

/**
 * 书签通知系统
 */
class BookmarkNotifier {
  /**
   * @param {Object} [options={}]
   * @param {function} [options.dispatch] — 自定义通知分发函数 (用于测试)
   * @param {function} [options.now]      — 自定义时间源 (用于测试)
   */
  constructor(options = {}) {
    /** @type {NotificationPrefs} 通知偏好 */
    this._prefs = {
      enabled: true,
      channels: [DEFAULT_CHANNEL],
      levels: { ...DEFAULT_LEVELS },
      types: {},           // type → boolean, 空对象表示全部启用
      sound: false,
      mergeInterval: MERGE_INTERVAL,
    }

    /** @type {NotificationEntry[]} 通知历史 */
    this._history = []

    /** @type {Map<string, number>} 通知类型 → 上次发送时间戳 (用于合并) */
    this._lastSentAt = new Map()

    /** @type {Map<string, Object>} 通知类型 → 合并中的通知数据 */
    this._pendingMerges = new Map()

    /** @type {number} 通知 ID 计数器 */
    this._idCounter = 0

    /** @type {number} 总通知计数 */
    this._totalSent = 0

    // 依赖注入
    this._dispatchFn = options.dispatch || (() => {})
    this._nowFn = options.now || (() => Date.now())
  }

  // ----------------------------------------------------------------
  //  通知方法
  // ----------------------------------------------------------------

  /**
   * 通知死链检测结果
   *
   * @param {Array<{url: string, title?: string, status?: number}>} links — 死链列表
   * @returns {NotificationResult}
   */
  notifyDeadLinks(links) {
    if (!Array.isArray(links)) {
      throw new Error('links 必须是数组')
    }

    if (links.length === 0) {
      return { sent: false, reason: 'no-dead-links', notification: null }
    }

    const notification = this._buildNotification('dead-links', {
      title: `发现 ${links.length} 个死链`,
      body: links.slice(0, 5).map(l => `${l.title || l.url} (${l.status || 'N/A'})`).join('\n'),
      level: links.length > 10 ? 'error' : this._prefs.levels['dead-links'],
      data: { links: links.map(l => ({ ...l })), count: links.length },
    })

    return this._dispatch(notification)
  }

  /**
   * 通知新书签数量
   *
   * @param {number} count — 新书签数量
   * @returns {NotificationResult}
   */
  notifyNewBookmarks(count) {
    if (typeof count !== 'number' || !isFinite(count) || count < 0) {
      throw new Error('count 必须是非负数字')
    }

    if (count === 0) {
      return { sent: false, reason: 'zero-count', notification: null }
    }

    const notification = this._buildNotification('new-bookmarks', {
      title: `新增 ${count} 个书签`,
      body: `系统已收集到 ${count} 个新书签`,
      level: this._prefs.levels['new-bookmarks'],
      data: { count },
    })

    return this._dispatch(notification)
  }

  /**
   * 通知重复书签数量
   *
   * @param {number} count — 重复书签数量
   * @returns {NotificationResult}
   */
  notifyDuplicates(count) {
    if (typeof count !== 'number' || !isFinite(count) || count < 0) {
      throw new Error('count 必须是非负数字')
    }

    if (count === 0) {
      return { sent: false, reason: 'zero-count', notification: null }
    }

    const notification = this._buildNotification('duplicates', {
      title: `发现 ${count} 个重复书签`,
      body: `检测到 ${count} 组重复书签，建议清理`,
      level: this._prefs.levels['duplicates'],
      data: { count },
    })

    return this._dispatch(notification)
  }

  /**
   * 通知备份完成
   *
   * @param {string} path — 备份文件路径
   * @returns {NotificationResult}
   */
  notifyBackupComplete(path) {
    if (typeof path !== 'string' || path.trim() === '') {
      throw new Error('path 必须是非空字符串')
    }

    const notification = this._buildNotification('backup-complete', {
      title: '书签备份完成',
      body: `备份已保存至: ${path}`,
      level: this._prefs.levels['backup-complete'],
      data: { path },
    })

    return this._dispatch(notification)
  }

  // ----------------------------------------------------------------
  //  偏好设置
  // ----------------------------------------------------------------

  /**
   * 设置通知偏好
   *
   * @param {Partial<NotificationPrefs>} prefs — 偏好设置 (部分更新)
   * @returns {NotificationPrefs} 更新后的完整偏好
   */
  setNotificationPrefs(prefs) {
    if (!prefs || typeof prefs !== 'object') {
      throw new Error('prefs 必须是对象')
    }

    // 验证并更新各字段
    if (prefs.enabled !== undefined) {
      if (typeof prefs.enabled !== 'boolean') {
        throw new Error('prefs.enabled 必须是布尔值')
      }
      this._prefs.enabled = prefs.enabled
    }

    if (prefs.channels !== undefined) {
      if (!Array.isArray(prefs.channels)) {
        throw new Error('prefs.channels 必须是数组')
      }
      const invalid = prefs.channels.filter(c => !NOTIFICATION_CHANNELS.includes(c))
      if (invalid.length > 0) {
        throw new Error(`不支持的通知渠道: ${invalid.join(', ')}. 支持: ${NOTIFICATION_CHANNELS.join(', ')}`)
      }
      this._prefs.channels = [...prefs.channels]
    }

    if (prefs.levels !== undefined) {
      if (typeof prefs.levels !== 'object') {
        throw new Error('prefs.levels 必须是对象')
      }
      for (const [type, level] of Object.entries(prefs.levels)) {
        if (!NOTIFICATION_LEVELS.includes(level)) {
          throw new Error(`不支持的通知级别: "${level}". 支持: ${NOTIFICATION_LEVELS.join(', ')}`)
        }
        this._prefs.levels[type] = level
      }
    }

    if (prefs.types !== undefined) {
      if (typeof prefs.types !== 'object') {
        throw new Error('prefs.types 必须是对象')
      }
      for (const [type, enabled] of Object.entries(prefs.types)) {
        if (typeof enabled !== 'boolean') {
          throw new Error(`prefs.types.${type} 必须是布尔值`)
        }
        this._prefs.types[type] = enabled
      }
    }

    if (prefs.sound !== undefined) {
      if (typeof prefs.sound !== 'boolean') {
        throw new Error('prefs.sound 必须是布尔值')
      }
      this._prefs.sound = prefs.sound
    }

    if (prefs.mergeInterval !== undefined) {
      if (typeof prefs.mergeInterval !== 'number' || !isFinite(prefs.mergeInterval) || prefs.mergeInterval < 0) {
        throw new Error('prefs.mergeInterval 必须是非负数字')
      }
      this._prefs.mergeInterval = prefs.mergeInterval
    }

    return this.getNotificationPrefs()
  }

  /**
   * 获取当前通知偏好
   *
   * @returns {NotificationPrefs} 偏好副本
   */
  getNotificationPrefs() {
    return {
      enabled: this._prefs.enabled,
      channels: [...this._prefs.channels],
      levels: { ...this._prefs.levels },
      types: { ...this._prefs.types },
      sound: this._prefs.sound,
      mergeInterval: this._prefs.mergeInterval,
    }
  }

  // ----------------------------------------------------------------
  //  通知历史
  // ----------------------------------------------------------------

  /**
   * 获取通知历史
   *
   * @param {Object} [options={}]
   * @param {string} [options.type]  — 按通知类型过滤
   * @param {number} [options.limit=100] — 最多返回条数
   * @param {number} [options.since] — 只返回该时间戳之后的通知
   * @returns {NotificationEntry[]}
   */
  getNotificationHistory(options = {}) {
    let entries = [...this._history]

    if (options.type) {
      entries = entries.filter(e => e.type === options.type)
    }

    if (options.since !== undefined) {
      entries = entries.filter(e => e.timestamp >= options.since)
    }

    const limit = options.limit ?? 100
    return entries.slice(-limit)
  }

  /**
   * 清空通知历史
   */
  clearHistory() {
    this._history = []
  }

  // ----------------------------------------------------------------
  //  统计
  // ----------------------------------------------------------------

  /**
   * 获取通知统计
   *
   * @returns {NotificationStats}
   */
  getStats() {
    const byType = {}
    for (const entry of this._history) {
      byType[entry.type] = (byType[entry.type] || 0) + 1
    }

    return {
      totalSent: this._totalSent,
      historySize: this._history.length,
      byType,
    }
  }

  // ----------------------------------------------------------------
  //  内部方法
  // ----------------------------------------------------------------

  /**
   * 构建通知对象
   *
   * @param {string} type — 通知类型
   * @param {Object} params
   * @returns {NotificationEntry}
   * @private
   */
  _buildNotification(type, params) {
    return {
      id: this._generateId(),
      type,
      title: params.title,
      body: params.body,
      level: params.level || 'info',
      data: params.data || null,
      timestamp: this._nowFn(),
      channel: [...this._prefs.channels],
    }
  }

  /**
   * 分发通知 (含偏好检查和合并逻辑)
   *
   * @param {NotificationEntry} notification
   * @returns {NotificationResult}
   * @private
   */
  _dispatch(notification) {
    // 全局开关检查
    if (!this._prefs.enabled) {
      return { sent: false, reason: 'disabled', notification }
    }

    // 类型级别检查
    const typeDisabled = this._prefs.types[notification.type] === false
    if (typeDisabled) {
      return { sent: false, reason: 'type-disabled', notification }
    }

    // 合并检查
    const lastSent = this._lastSentAt.get(notification.type)
    const now = this._nowFn()
    if (lastSent !== undefined && (now - lastSent) < this._prefs.mergeInterval) {
      // 合并到待发通知中
      this._pendingMerges.set(notification.type, notification)
      return { sent: false, reason: 'merged', notification }
    }

    // 发送通知
    this._lastSentAt.set(notification.type, now)

    // 如果有挂起的合并通知，也一并记录
    const pending = this._pendingMerges.get(notification.type)
    if (pending) {
      this._pendingMerges.delete(notification.type)
      // 将挂起通知的数据合并到当前通知
      if (pending.data && notification.data) {
        if (pending.data.links && notification.data.links) {
          notification.data = {
            ...notification.data,
            links: [...new Set([...pending.data.links, ...notification.data.links])],
            count: notification.data.count + (pending.data.count || 0),
          }
        } else if (notification.data.count !== undefined && pending.data.count !== undefined) {
          notification.data = { count: notification.data.count + pending.data.count }
          notification.title = `合并通知: 共 ${notification.data.count} 条`
        }
      }
    }

    // 记录到历史
    this._history.push(notification)
    this._totalSent++

    // 裁剪历史
    if (this._history.length > MAX_HISTORY) {
      this._history = this._history.slice(-MAX_HISTORY)
    }

    // 执行分发
    try {
      this._dispatchFn(notification)
    } catch {
      // 分发失败不影响记录
    }

    return { sent: true, reason: null, notification }
  }

  /**
   * 生成唯一通知 ID
   * @returns {string}
   * @private
   */
  _generateId() {
    this._idCounter++
    return `notif-${this._idCounter}-${this._nowFn().toString(36)}`
  }
}

// ==================== 导出 ====================

/**
 * @typedef {Object} NotificationPrefs
 * @property {boolean}  enabled       — 全局通知开关
 * @property {string[]} channels      — 通知渠道
 * @property {Object}   levels        — 各类型通知级别
 * @property {Object}   types         — 各类型启用/禁用
 * @property {boolean}  sound         — 是否播放声音
 * @property {number}   mergeInterval — 合并间隔 (ms)
 */

/**
 * @typedef {Object} NotificationEntry
 * @property {string}  id        — 通知 ID
 * @property {string}  type      — 通知类型
 * @property {string}  title     — 通知标题
 * @property {string}  body      — 通知正文
 * @property {string}  level     — 通知级别
 * @property {*}       data      — 附加数据
 * @property {number}  timestamp — 时间戳
 * @property {string[]} channel  — 通知渠道
 */

/**
 * @typedef {Object} NotificationResult
 * @property {boolean}            sent         — 是否已发送
 * @property {string|null}       reason       — 未发送原因
 * @property {NotificationEntry|null} notification — 通知对象
 */

/**
 * @typedef {Object} NotificationStats
 * @property {number} totalSent   — 总发送数
 * @property {number} historySize — 历史记录数
 * @property {Object} byType      — 各类型发送数
 */

export {
  BookmarkNotifier,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_LEVELS,
  DEFAULT_LEVELS,
  DEFAULT_CHANNEL,
  MAX_HISTORY,
  MERGE_INTERVAL,
}
export default BookmarkNotifier
