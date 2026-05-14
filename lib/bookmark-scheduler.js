/**
 * BookmarkScheduler — 书签定时任务调度器
 *
 * 管理书签相关定时任务的创建、执行、取消和监控:
 *   - scheduleCheckLinks(interval, options) — 定时死链检测
 *   - scheduleBackup(interval, options)     — 定时书签备份
 *   - scheduleCleanup(interval, options)    — 定时重复/空文件夹清理
 *   - getActiveSchedules()                  — 列出活跃任务
 *   - cancelSchedule(taskId)                — 取消定时任务
 *   - runScheduleNow(taskId)                — 手动立即执行任务
 *
 * 通过依赖注入 handler 实现具体任务逻辑，调度器本身只负责
 * 计时器管理和任务生命周期。
 *
 * 纯前端实现，不依赖外部 API。
 *
 * @module lib/bookmark-scheduler
 */

// ==================== 常量 ====================

/** 支持的任务类型 */
const TASK_TYPES = ['check-links', 'backup', 'cleanup']

/** 最小调度间隔 (ms) — 防止过于频繁的执行 */
const MIN_INTERVAL = 1000

/** 最大调度间隔 (ms) — ~30天 */
const MAX_INTERVAL = 30 * 24 * 60 * 60 * 1000

/** 最大同时活跃任务数 */
const MAX_TASKS = 20

/** 最大事件日志条数 */
const MAX_EVENT_LOG = 200

/** 默认调度间隔 (ms) */
const DEFAULT_INTERVALS = {
  'check-links': 24 * 60 * 60 * 1000,  // 24 小时
  'backup':      7  * 24 * 60 * 60 * 1000,  // 7 天
  'cleanup':     24 * 60 * 60 * 1000,  // 24 小时
}

// ==================== 辅助函数 ====================

/**
 * 验证间隔值
 *
 * @param {number} interval — 间隔毫秒数
 * @param {string} taskType — 任务类型 (用于错误消息)
 * @throws {Error} 如果间隔无效
 */
function validateInterval(interval, taskType) {
  if (typeof interval !== 'number' || !isFinite(interval)) {
    throw new Error(`${taskType}: interval 必须是有效数字`)
  }
  if (interval < MIN_INTERVAL) {
    throw new Error(`${taskType}: interval 不能小于 ${MIN_INTERVAL}ms`)
  }
  if (interval > MAX_INTERVAL) {
    throw new Error(`${taskType}: interval 不能大于 ${MAX_INTERVAL}ms`)
  }
}

/**
 * 生成唯一任务 ID
 * @returns {string}
 */
function generateTaskId() {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `sched-${ts}-${rand}`
}

// ==================== BookmarkScheduler ====================

/**
 * 书签定时任务调度器
 */
class BookmarkScheduler {
  /**
   * @param {Object} [options={}]
   * @param {function} [options.setInterval]   — 自定义 setInterval (用于测试)
   * @param {function} [options.clearInterval] — 自定义 clearInterval (用于测试)
   * @param {function} [options.now]           — 自定义时间源 (用于测试)
   */
  constructor(options = {}) {
    /** @type {Map<string, ScheduleEntry>} 活跃任务表 */
    this._schedules = new Map()

    /** @type {Map<string, any>} taskId → timer handle */
    this._timers = new Map()

    /** @type {Map<string, function>} taskType → handler */
    this._handlers = new Map()

    /** @type {EventLogEntry[]} 执行事件日志 */
    this._eventLog = []

    /** @type {number} 任务 ID 计数器 */
    this._idCounter = 0

    // 依赖注入 (便于测试)
    this._setIntervalFn = options.setInterval || (typeof setInterval !== 'undefined' ? setInterval.bind(globalThis) : null)
    this._clearIntervalFn = options.clearInterval || (typeof clearInterval !== 'undefined' ? clearInterval.bind(globalThis) : null)
    this._nowFn = options.now || (() => Date.now())
  }

  // ----------------------------------------------------------------
  //  Handler 注册
  // ----------------------------------------------------------------

  /**
   * 注册任务类型的执行处理器
   *
   * @param {string} taskType — 任务类型 ('check-links' | 'backup' | 'cleanup')
   * @param {function} handler — 任务执行函数: async (options) => result
   * @returns {BookmarkScheduler} this (链式调用)
   */
  registerHandler(taskType, handler) {
    if (!TASK_TYPES.includes(taskType)) {
      throw new Error(`未知任务类型: "${taskType}". 支持: ${TASK_TYPES.join(', ')}`)
    }
    if (typeof handler !== 'function') {
      throw new Error('handler 必须是函数')
    }
    this._handlers.set(taskType, handler)
    return this
  }

  // ----------------------------------------------------------------
  //  调度方法
  // ----------------------------------------------------------------

  /**
   * 创建定时死链检测任务
   *
   * @param {number} [interval] — 间隔毫秒数 (默认 24h)
   * @param {Object} [options={}] — 传递给 handler 的选项
   * @param {number} [options.concurrency] — 并发数
   * @param {number} [options.timeout] — 超时
   * @returns {string} taskId
   */
  scheduleCheckLinks(interval, options = {}) {
    const ms = interval ?? DEFAULT_INTERVALS['check-links']
    return this._createSchedule('check-links', ms, options)
  }

  /**
   * 创建定时书签备份任务
   *
   * @param {number} [interval] — 间隔毫秒数 (默认 7天)
   * @param {Object} [options={}] — 传递给 handler 的选项
   * @param {string} [options.format] — 备份格式
   * @returns {string} taskId
   */
  scheduleBackup(interval, options = {}) {
    const ms = interval ?? DEFAULT_INTERVALS['backup']
    return this._createSchedule('backup', ms, options)
  }

  /**
   * 创建定时清理任务 (重复/空文件夹)
   *
   * @param {number} [interval] — 间隔毫秒数 (默认 24h)
   * @param {Object} [options={}] — 传递给 handler 的选项
   * @param {string} [options.strategy] — 清理策略
   * @returns {string} taskId
   */
  scheduleCleanup(interval, options = {}) {
    const ms = interval ?? DEFAULT_INTERVALS['cleanup']
    return this._createSchedule('cleanup', ms, options)
  }

  // ----------------------------------------------------------------
  //  管理方法
  // ----------------------------------------------------------------

  /**
   * 获取所有活跃调度任务
   *
   * @returns {ScheduleInfo[]}
   */
  getActiveSchedules() {
    const result = []

    for (const [, entry] of this._schedules.entries()) {
      result.push({
        taskId: entry.taskId,
        type: entry.type,
        interval: entry.interval,
        createdAt: entry.createdAt,
        lastRunAt: entry.lastRunAt,
        nextRunAt: entry.nextRunAt,
        runCount: entry.runCount,
        status: entry.paused ? 'paused' : 'active',
        options: { ...entry.options },
      })
    }

    return result
  }

  /**
   * 取消定时任务
   *
   * @param {string} taskId
   * @returns {boolean} 是否成功取消
   */
  cancelSchedule(taskId) {
    if (!taskId || typeof taskId !== 'string') {
      return false
    }

    const entry = this._schedules.get(taskId)
    if (!entry) {
      return false
    }

    // 清除定时器
    const timer = this._timers.get(taskId)
    if (timer !== undefined && this._clearIntervalFn) {
      this._clearIntervalFn(timer)
    }

    this._timers.delete(taskId)
    this._schedules.delete(taskId)

    // 记录事件
    this._logEvent(taskId, entry.type, 'cancelled', null)

    return true
  }

  /**
   * 手动立即执行定时任务
   *
   * @param {string} taskId
   * @returns {Promise<{success: boolean, result: any, error: string|null}>}
   */
  async runScheduleNow(taskId) {
    if (!taskId || typeof taskId !== 'string') {
      return { success: false, result: null, error: 'taskId 无效' }
    }

    const entry = this._schedules.get(taskId)
    if (!entry) {
      return { success: false, result: null, error: `任务 ${taskId} 不存在` }
    }

    return this._executeTask(entry)
  }

  /**
   * 暂停定时任务 (不取消，只是暂停计时器)
   *
   * @param {string} taskId
   * @returns {boolean}
   */
  pauseSchedule(taskId) {
    const entry = this._schedules.get(taskId)
    if (!entry || entry.paused) return false

    const timer = this._timers.get(taskId)
    if (timer !== undefined && this._clearIntervalFn) {
      this._clearIntervalFn(timer)
    }
    this._timers.delete(taskId)

    entry.paused = true
    entry.nextRunAt = null

    this._logEvent(taskId, entry.type, 'paused', null)
    return true
  }

  /**
   * 恢复已暂停的定时任务
   *
   * @param {string} taskId
   * @returns {boolean}
   */
  resumeSchedule(taskId) {
    const entry = this._schedules.get(taskId)
    if (!entry || !entry.paused) return false

    entry.paused = false
    this._startTimer(entry)

    this._logEvent(taskId, entry.type, 'resumed', null)
    return true
  }

  /**
   * 获取任务执行事件日志
   *
   * @param {Object} [options={}]
   * @param {string} [options.taskId] — 过滤特定任务
   * @param {string} [options.type] — 过滤特定类型
   * @param {number} [options.limit=50] — 最多返回条数
   * @returns {EventLogEntry[]}
   */
  getEventLog(options = {}) {
    let logs = [...this._eventLog]

    if (options.taskId) {
      logs = logs.filter(e => e.taskId === options.taskId)
    }
    if (options.type) {
      logs = logs.filter(e => e.type === options.type)
    }

    const limit = options.limit ?? 50
    return logs.slice(-limit)
  }

  /**
   * 获取调度器统计信息
   *
   * @returns {{ totalTasks: number, activeTasks: number, pausedTasks: number, totalRuns: number, logSize: number }}
   */
  getStats() {
    let active = 0
    let paused = 0
    let totalRuns = 0

    for (const entry of this._schedules.values()) {
      if (entry.paused) paused++
      else active++
      totalRuns += entry.runCount
    }

    return {
      totalTasks: this._schedules.size,
      activeTasks: active,
      pausedTasks: paused,
      totalRuns,
      logSize: this._eventLog.length,
    }
  }

  /**
   * 取消所有定时任务并清理
   */
  cancelAll() {
    for (const taskId of [...this._schedules.keys()]) {
      this.cancelSchedule(taskId)
    }
  }

  /**
   * 获取单个任务详情
   *
   * @param {string} taskId
   * @returns {ScheduleInfo|null}
   */
  getSchedule(taskId) {
    const entry = this._schedules.get(taskId)
    if (!entry) return null

    return {
      taskId: entry.taskId,
      type: entry.type,
      interval: entry.interval,
      createdAt: entry.createdAt,
      lastRunAt: entry.lastRunAt,
      nextRunAt: entry.nextRunAt,
      runCount: entry.runCount,
      status: entry.paused ? 'paused' : 'active',
      options: { ...entry.options },
    }
  }

  // ----------------------------------------------------------------
  //  内部方法
  // ----------------------------------------------------------------

  /**
   * 创建调度任务
   *
   * @param {string} type
   * @param {number} interval
   * @param {Object} options
   * @returns {string} taskId
   * @private
   */
  _createSchedule(type, interval, options) {
    validateInterval(interval, type)

    if (this._schedules.size >= MAX_TASKS) {
      throw new Error(`已达到最大任务数 (${MAX_TASKS})，请先取消其他任务`)
    }

    const taskId = this._generateTaskId()
    const now = this._nowFn()

    const entry = {
      taskId,
      type,
      interval,
      options: { ...options },
      createdAt: now,
      lastRunAt: null,
      nextRunAt: now + interval,
      runCount: 0,
      paused: false,
    }

    this._schedules.set(taskId, entry)
    this._startTimer(entry)

    this._logEvent(taskId, type, 'created', null)

    return taskId
  }

  /**
   * 启动定时器
   * @param {ScheduleEntry} entry
   * @private
   */
  _startTimer(entry) {
    if (!this._setIntervalFn) return

    const timer = this._setIntervalFn(() => {
      this._executeTask(entry)
    }, entry.interval)

    this._timers.set(entry.taskId, timer)
  }

  /**
   * 执行任务
   * @param {ScheduleEntry} entry
   * @returns {Promise<{success: boolean, result: any, error: string|null}>}
   * @private
   */
  async _executeTask(entry) {
    const handler = this._handlers.get(entry.type)
    if (!handler) {
      const error = `未注册 "${entry.type}" 类型的 handler`
      this._logEvent(entry.taskId, entry.type, 'error', { error })
      return { success: false, result: null, error }
    }

    const now = this._nowFn()
    entry.lastRunAt = now
    entry.runCount++
    entry.nextRunAt = now + entry.interval

    this._logEvent(entry.taskId, entry.type, 'started', null)

    try {
      const result = await handler(entry.options)
      this._logEvent(entry.taskId, entry.type, 'completed', { result })
      return { success: true, result, error: null }
    } catch (err) {
      const error = err.message || String(err)
      this._logEvent(entry.taskId, entry.type, 'error', { error })
      return { success: false, result: null, error }
    }
  }

  /**
   * 记录事件日志
   * @param {string} taskId
   * @param {string} type
   * @param {string} action
   * @param {*} detail
   * @private
   */
  _logEvent(taskId, type, action, detail) {
    this._eventLog.push({
      taskId,
      type,
      action,
      detail: detail || null,
      timestamp: this._nowFn(),
    })

    // 裁剪日志
    if (this._eventLog.length > MAX_EVENT_LOG) {
      this._eventLog = this._eventLog.slice(-MAX_EVENT_LOG)
    }
  }

  /**
   * 生成唯一任务 ID
   * @returns {string}
   * @private
   */
  _generateTaskId() {
    this._idCounter++
    return `sched-${this._idCounter}-${this._nowFn().toString(36)}`
  }
}

/**
 * @typedef {Object} ScheduleEntry
 * @property {string}  taskId
 * @property {string}  type
 * @property {number}  interval
 * @property {Object}  options
 * @property {number}  createdAt
 * @property {number|null} lastRunAt
 * @property {number|null} nextRunAt
 * @property {number}  runCount
 * @property {boolean} paused
 */

/**
 * @typedef {Object} ScheduleInfo
 * @property {string}  taskId
 * @property {string}  type
 * @property {number}  interval
 * @property {number}  createdAt
 * @property {number|null} lastRunAt
 * @property {number|null} nextRunAt
 * @property {number}  runCount
 * @property {string}  status — 'active' | 'paused'
 * @property {Object}  options
 */

/**
 * @typedef {Object} EventLogEntry
 * @property {string}  taskId
 * @property {string}  type
 * @property {string}  action — 'created' | 'started' | 'completed' | 'error' | 'cancelled' | 'paused' | 'resumed'
 * @property {*}       detail
 * @property {number}  timestamp
 */

export {
  BookmarkScheduler,
  TASK_TYPES,
  MIN_INTERVAL,
  MAX_INTERVAL,
  MAX_TASKS,
  MAX_EVENT_LOG,
  DEFAULT_INTERVALS,
  validateInterval,
  generateTaskId,
}
export default BookmarkScheduler
