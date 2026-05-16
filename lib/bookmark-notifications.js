/**
 * NotificationManager — 书签通知管理器
 *
 * 管理书签相关通知的生命周期:
 *   - notify(message, type)           — 创建并发送通知
 *   - getNotifications(filter)        — 获取通知列表 (支持过滤)
 *   - markAsRead(id)                  — 标记通知为已读
 *   - clearAll()                      — 清空所有通知
 *   - getUnreadCount()                — 获取未读通知数量
 *
 * 支持的通知类型: info / warning / expired / duplicate / update
 *
 * 纯前端实现，不依赖外部 API。
 *
 * @module lib/bookmark-notifications
 */

// ==================== 常量 ====================

/** 支持的通知类型 */
const NOTIFICATION_TYPES = ['info', 'warning', 'expired', 'duplicate', 'update']

/** 通知存储上限 */
const MAX_NOTIFICATIONS = 1000

// ==================== NotificationManager ====================

/**
 * 书签通知管理器
 */
class NotificationManager {
  /**
   * @param {Object} [options={}]
   * @param {function} [options.now] — 自定义时间源 (用于测试)
   */
  constructor(options = {}) {
    /** @type {ManagedNotification[]} 通知列表 */
    this._notifications = []

    /** @type {number} 通知 ID 计数器 */
    this._idCounter = 0

    // 依赖注入
    this._nowFn = options.now || (() => Date.now())
  }

  // ----------------------------------------------------------------
  //  核心方法
  // ----------------------------------------------------------------

  /**
   * 创建并发送通知
   *
   * @param {string} message — 通知消息内容
   * @param {string} type    — 通知类型 (info / warning / expired / duplicate / update)
   * @returns {ManagedNotification} 创建的通知对象
   * @throws {Error} 参数不合法时抛出
   */
  notify(message, type) {
    if (typeof message !== 'string' || message.trim() === '') {
      throw new Error('message 必须是非空字符串')
    }

    if (!NOTIFICATION_TYPES.includes(type)) {
      throw new Error(`不支持的通知类型: "${type}". 支持: ${NOTIFICATION_TYPES.join(', ')}`)
    }

    const notification = {
      id: this._generateId(),
      message: message.trim(),
      type,
      read: false,
      timestamp: this._nowFn(),
    }

    this._notifications.push(notification)

    // 裁剪超出上限
    if (this._notifications.length > MAX_NOTIFICATIONS) {
      this._notifications = this._notifications.slice(-MAX_NOTIFICATIONS)
    }

    return { ...notification }
  }

  /**
   * 获取通知列表，支持按类型和已读状态过滤
   *
   * @param {Object} [filter={}]
   * @param {string} [filter.type]  — 按通知类型过滤
   * @param {boolean} [filter.read] — 按已读状态过滤
   * @param {number} [filter.limit] — 最多返回条数
   * @returns {ManagedNotification[]}
   */
  getNotifications(filter = {}) {
    let results = [...this._notifications]

    if (filter.type !== undefined) {
      results = results.filter(n => n.type === filter.type)
    }

    if (filter.read !== undefined) {
      results = results.filter(n => n.read === filter.read)
    }

    if (filter.limit !== undefined && typeof filter.limit === 'number' && filter.limit > 0) {
      results = results.slice(-filter.limit)
    }

    return results
  }

  /**
   * 标记指定通知为已读
   *
   * @param {string} id — 通知 ID
   * @returns {boolean} 是否找到并标记成功
   * @throws {Error} id 参数不合法时抛出
   */
  markAsRead(id) {
    if (typeof id !== 'string' || id.trim() === '') {
      throw new Error('id 必须是非空字符串')
    }

    const notification = this._notifications.find(n => n.id === id)
    if (!notification) {
      return false
    }

    notification.read = true
    return true
  }

  /**
   * 清空所有通知
   */
  clearAll() {
    this._notifications = []
  }

  /**
   * 获取未读通知数量
   *
   * @returns {number} 未读通知数量
   */
  getUnreadCount() {
    return this._notifications.filter(n => !n.read).length
  }

  // ----------------------------------------------------------------
  //  内部方法
  // ----------------------------------------------------------------

  /**
   * 生成唯一通知 ID
   *
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
 * @typedef {Object} ManagedNotification
 * @property {string}  id        — 通知 ID
 * @property {string}  message   — 通知消息
 * @property {string}  type      — 通知类型
 * @property {boolean} read      — 是否已读
 * @property {number}  timestamp — 时间戳
 */

export {
  NotificationManager,
  NOTIFICATION_TYPES,
  MAX_NOTIFICATIONS,
}
export default NotificationManager
