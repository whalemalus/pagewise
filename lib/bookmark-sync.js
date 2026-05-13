/**
 * BookmarkSync — 数据同步模块
 *
 * 提供基于 Chrome Sync API 的书签跨设备同步功能，包括冲突解决。
 *
 * 功能:
 *   - initSync(storage) — 初始化同步引擎
 *   - syncToCloud(bookmarks) — 推送书签到 Chrome Sync
 *   - syncFromCloud() — 从 Chrome Sync 拉取书签
 *   - resolveConflict(local, remote) — 冲突解决策略
 *   - getLastSyncTime() — 获取最后同步时间戳
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API（通过 storage 注入适配）
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 * - 所有函数为纯函数（除了 initSync 依赖注入的 storage）
 */

// ==================== Sync Status Constants ====================

/** 同步状态：空闲 */
export const SYNC_STATUS_IDLE = 'idle'

/** 同步状态：同步中 */
export const SYNC_STATUS_SYNCING = 'syncing'

/** 同步状态：成功 */
export const SYNC_STATUS_SUCCESS = 'success'

/** 同步状态：失败 */
export const SYNC_STATUS_ERROR = 'error'

/** 同步状态：配额超限 */
export const SYNC_STATUS_QUOTA_EXCEEDED = 'quota_exceeded'

/** 同步状态：网络错误 */
export const SYNC_STATUS_NETWORK_ERROR = 'network_error'

/** 同步状态：冲突 */
export const SYNC_STATUS_CONFLICT = 'conflict'

/** 冲突解决策略：本地优先 */
export const CONFLICT_STRATEGY_LOCAL = 'local_wins'

/** 冲突解决策略：远程优先 */
export const CONFLICT_STRATEGY_REMOTE = 'remote_wins'

/** 冲突解决策略：合并 */
export const CONFLICT_STRATEGY_MERGE = 'merge'

/** 同步数据 key */
export const SYNC_KEY = 'pagewise-sync-data'

/** 同步时间 key */
export const SYNC_TIME_KEY = 'pagewise-sync-time'

/** 同步格式版本 */
export const SYNC_FORMAT_VERSION = '1.0'

/** Chrome Sync 每项配额上限 (bytes) */
export const SYNC_ITEM_MAX_BYTES = 8192

/** Chrome Sync 总配额上限 (bytes) */
export const SYNC_TOTAL_MAX_BYTES = 102400

// ==================== Internal State ====================

let _storage = null
let _currentStatus = SYNC_STATUS_IDLE
let _lastSyncTime = null
let _lastError = null

// ==================== Sync Engine ====================

/**
 * 初始化同步引擎
 *
 * @param {object} storage — 存储对象，需实现 get/set/remove 方法
 * @returns {{ success: boolean, status: string, errors: string[] }}
 */
export function initSync(storage) {
  const errors = []

  if (!storage) {
    return { success: false, status: SYNC_STATUS_ERROR, errors: ['存储对象不能为空'] }
  }

  if (typeof storage.get !== 'function') {
    errors.push('存储对象缺少 get 方法')
  }
  if (typeof storage.set !== 'function') {
    errors.push('存储对象缺少 set 方法')
  }
  if (typeof storage.remove !== 'function') {
    errors.push('存储对象缺少 remove 方法')
  }

  if (errors.length > 0) {
    return { success: false, status: SYNC_STATUS_ERROR, errors }
  }

  _storage = storage
  _currentStatus = SYNC_STATUS_IDLE
  _lastError = null

  return { success: true, status: SYNC_STATUS_IDLE, errors: [] }
}

/**
 * 获取当前同步状态
 *
 * @returns {string} 当前状态常量
 */
export function getSyncStatus() {
  return _currentStatus
}

/**
 * 获取最后一次错误信息
 *
 * @returns {string|null}
 */
export function getLastError() {
  return _lastError
}

/**
 * 重置同步引擎内部状态
 */
export function resetSync() {
  _storage = null
  _currentStatus = SYNC_STATUS_IDLE
  _lastSyncTime = null
  _lastError = null
}

// ==================== Sync Operations ====================

/**
 * 估算数据的字节大小
 *
 * @param {*} data — 待估算数据
 * @returns {number} 字节数
 */
export function estimateBytes(data) {
  if (data === null || data === undefined) return 0
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length
  } catch {
    return Infinity
  }
}

/**
 * 推送书签到 Chrome Sync
 *
 * @param {Array} bookmarks — 书签数组
 * @returns {Promise<{ success: boolean, status: string, syncedCount: number, errors: string[] }>}
 */
export async function syncToCloud(bookmarks) {
  const errors = []

  if (!_storage) {
    return { success: false, status: SYNC_STATUS_ERROR, syncedCount: 0, errors: ['同步引擎未初始化，请先调用 initSync'] }
  }

  if (!Array.isArray(bookmarks)) {
    return { success: false, status: SYNC_STATUS_ERROR, syncedCount: 0, errors: ['bookmarks 必须是数组'] }
  }

  _currentStatus = SYNC_STATUS_SYNCING

  const syncData = {
    version: SYNC_FORMAT_VERSION,
    syncedAt: new Date().toISOString(),
    bookmarkCount: bookmarks.length,
    bookmarks: JSON.parse(JSON.stringify(bookmarks)),
  }

  // 检查配额
  const dataSize = estimateBytes(syncData)
  if (dataSize > SYNC_ITEM_MAX_BYTES) {
    // 尝试分片
    const chunks = splitBookmarks(syncData.bookmarks, SYNC_ITEM_MAX_BYTES)
    if (chunks.length === 0) {
      _currentStatus = SYNC_STATUS_ERROR
      _lastError = '无法分割书签数据以适应配额'
      return { success: false, status: SYNC_STATUS_ERROR, syncedCount: 0, errors: [_lastError] }
    }

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunkKey = `${SYNC_KEY}-chunk-${i}`
        const chunkData = {
          version: SYNC_FORMAT_VERSION,
          chunkIndex: i,
          totalChunks: chunks.length,
          syncedAt: syncData.syncedAt,
          bookmarks: chunks[i],
        }
        await _storage.set(chunkKey, chunkData)
      }
      await _storage.set(SYNC_TIME_KEY, { time: syncData.syncedAt, chunks: chunks.length })
      await _storage.remove(SYNC_KEY)
    } catch (err) {
      const errMsg = classifyError(err)
      _currentStatus = errMsg.status
      _lastError = errMsg.message
      return { success: false, status: errMsg.status, syncedCount: 0, errors: [errMsg.message] }
    }
  } else {
    try {
      await _storage.set(SYNC_KEY, syncData)
      await _storage.set(SYNC_TIME_KEY, { time: syncData.syncedAt, chunks: 0 })
      // 清理旧的分片数据
      await cleanupChunks()
    } catch (err) {
      const errMsg = classifyError(err)
      _currentStatus = errMsg.status
      _lastError = errMsg.message
      return { success: false, status: errMsg.status, syncedCount: 0, errors: [errMsg.message] }
    }
  }

  _lastSyncTime = syncData.syncedAt
  _currentStatus = SYNC_STATUS_SUCCESS
  _lastError = null

  return { success: true, status: SYNC_STATUS_SUCCESS, syncedCount: bookmarks.length, errors: [] }
}

/**
 * 从 Chrome Sync 拉取书签
 *
 * @returns {Promise<{ success: boolean, status: string, bookmarks: Array|null, errors: string[], warnings: string[] }>}
 */
export async function syncFromCloud() {
  const errors = []
  const warnings = []

  if (!_storage) {
    return { success: false, status: SYNC_STATUS_ERROR, bookmarks: null, errors: ['同步引擎未初始化，请先调用 initSync'], warnings }
  }

  _currentStatus = SYNC_STATUS_SYNCING

  try {
    // 尝试读取分片数据
    const timeData = await _storage.get(SYNC_TIME_KEY)
    if (timeData && timeData.chunks > 0) {
      return await readChunkedData(timeData, errors, warnings)
    }

    // 尝试读取完整数据
    const syncData = await _storage.get(SYNC_KEY)

    if (syncData === null || syncData === undefined) {
      _currentStatus = SYNC_STATUS_IDLE
      _lastError = null
      return { success: true, status: SYNC_STATUS_IDLE, bookmarks: [], errors: [], warnings: ['云端无同步数据'] }
    }

    // 验证数据格式
    if (typeof syncData !== 'object' || Array.isArray(syncData)) {
      _currentStatus = SYNC_STATUS_ERROR
      _lastError = '云端数据格式无效'
      return { success: false, status: SYNC_STATUS_ERROR, bookmarks: null, errors: [_lastError], warnings }
    }

    if (!Array.isArray(syncData.bookmarks)) {
      _currentStatus = SYNC_STATUS_ERROR
      _lastError = '云端书签数据损坏：bookmarks 不是数组'
      return { success: false, status: SYNC_STATUS_ERROR, bookmarks: null, errors: [_lastError], warnings }
    }

    if (syncData.version !== SYNC_FORMAT_VERSION) {
      warnings.push(`云端格式版本 ${syncData.version} 与本地版本 ${SYNC_FORMAT_VERSION} 不匹配`)
    }

    // 深拷贝以避免引用问题
    const bookmarks = JSON.parse(JSON.stringify(syncData.bookmarks))

    // 验证每个书签
    const validBookmarks = []
    for (let i = 0; i < bookmarks.length; i++) {
      const bm = bookmarks[i]
      if (bm && typeof bm === 'object' && bm.id !== undefined) {
        validBookmarks.push(bm)
      } else {
        warnings.push(`书签索引 ${i} 结构无效，已跳过`)
      }
    }

    _lastSyncTime = timeData ? timeData.time : null
    _currentStatus = SYNC_STATUS_SUCCESS
    _lastError = null

    return { success: true, status: SYNC_STATUS_SUCCESS, bookmarks: validBookmarks, errors: [], warnings }
  } catch (err) {
    const errMsg = classifyError(err)
    _currentStatus = errMsg.status
    _lastError = errMsg.message
    return { success: false, status: errMsg.status, bookmarks: null, errors: [errMsg.message], warnings }
  }
}

// ==================== Conflict Resolution ====================

/**
 * 解决本地与远程书签的冲突
 *
 * @param {Array} local — 本地书签数组
 * @param {Array} remote — 远程书签数组
 * @param {string} [strategy=CONFLICT_STRATEGY_MERGE] — 解决策略
 * @returns {{ success: boolean, bookmarks: Array|null, strategy: string, added: number, removed: number, updated: number, errors: string[] }}
 */
export function resolveConflict(local, remote, strategy = CONFLICT_STRATEGY_MERGE) {
  const errors = []

  if (!Array.isArray(local)) {
    return { success: false, bookmarks: null, strategy, added: 0, removed: 0, updated: 0, errors: ['local 必须是数组'] }
  }

  if (!Array.isArray(remote)) {
    return { success: false, bookmarks: null, strategy, added: 0, removed: 0, updated: 0, errors: ['remote 必须是数组'] }
  }

  if (![CONFLICT_STRATEGY_LOCAL, CONFLICT_STRATEGY_REMOTE, CONFLICT_STRATEGY_MERGE].includes(strategy)) {
    return { success: false, bookmarks: null, strategy, added: 0, removed: 0, updated: 0, errors: [`不支持的冲突策略: ${strategy}`] }
  }

  // 深拷贝避免修改原始数据
  const localCopy = JSON.parse(JSON.stringify(local))
  const remoteCopy = JSON.parse(JSON.stringify(remote))

  if (strategy === CONFLICT_STRATEGY_LOCAL) {
    return { success: true, bookmarks: localCopy, strategy, added: 0, removed: 0, updated: 0, errors: [] }
  }

  if (strategy === CONFLICT_STRATEGY_REMOTE) {
    return { success: true, bookmarks: remoteCopy, strategy, added: 0, removed: 0, updated: 0, errors: [] }
  }

  // 合并策略
  return mergeBookmarks(localCopy, remoteCopy, strategy)
}

/**
 * 合并本地和远程书签
 *
 * @param {Array} local — 本地书签（深拷贝后）
 * @param {Array} remote — 远程书签（深拷贝后）
 * @param {string} strategy — 策略标识
 * @returns {{ success: boolean, bookmarks: Array, strategy: string, added: number, removed: number, updated: number, errors: string[] }}
 */
function mergeBookmarks(local, remote, strategy) {
  const localMap = new Map()
  for (const bm of local) {
    if (bm && bm.id !== undefined) {
      localMap.set(String(bm.id), bm)
    }
  }

  const remoteMap = new Map()
  for (const bm of remote) {
    if (bm && bm.id !== undefined) {
      remoteMap.set(String(bm.id), bm)
    }
  }

  const merged = []
  let added = 0
  let removed = 0
  let updated = 0

  // 以本地为基准进行合并
  const processedIds = new Set()

  for (const [id, localBm] of localMap) {
    processedIds.add(id)
    const remoteBm = remoteMap.get(id)

    if (remoteBm) {
      // 两者都存在，取更新的一方
      const localTime = localBm.updatedAt || localBm.createdAt || ''
      const remoteTime = remoteBm.updatedAt || remoteBm.createdAt || ''

      if (remoteTime > localTime) {
        merged.push(remoteBm)
        updated++
      } else {
        merged.push(localBm)
        if (remoteTime && localTime && remoteTime !== localTime) {
          updated++
        }
      }
    } else {
      // 仅本地存在
      merged.push(localBm)
    }
  }

  // 添加仅远程存在的书签
  for (const [id, remoteBm] of remoteMap) {
    if (!processedIds.has(id)) {
      merged.push(remoteBm)
      added++
    }
  }

  return { success: true, bookmarks: merged, strategy, added, removed, updated, errors: [] }
}

// ==================== Last Sync Time ====================

/**
 * 获取最后同步时间
 *
 * @returns {Promise<string|null>} ISO 时间字符串或 null
 */
export async function getLastSyncTime() {
  if (!_storage) {
    return _lastSyncTime
  }

  try {
    const timeData = await _storage.get(SYNC_TIME_KEY)
    if (timeData && timeData.time) {
      _lastSyncTime = timeData.time
      return timeData.time
    }
    return _lastSyncTime
  } catch {
    return _lastSyncTime
  }
}

// ==================== Helpers ====================

/**
 * 将书签数组分割为适合配额限制的多个分片
 *
 * @param {Array} bookmarks — 书签数组
 * @param {number} maxBytes — 每个分片最大字节数
 * @returns {Array<Array>} 分片后的书签数组
 */
export function splitBookmarks(bookmarks, maxBytes) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) return []
  if (typeof maxBytes !== 'number' || maxBytes <= 0) return []

  const chunks = []
  let currentChunk = []
  let currentSize = 0

  for (const bm of bookmarks) {
    const bmSize = estimateBytes(bm)
    if (bmSize > maxBytes) {
      // 单个书签超过配额，跳过
      continue
    }

    if (currentSize + bmSize > maxBytes && currentChunk.length > 0) {
      chunks.push(currentChunk)
      currentChunk = []
      currentSize = 0
    }

    currentChunk.push(bm)
    currentSize += bmSize
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

/**
 * 清理旧的分片数据
 *
 * @returns {Promise<void>}
 */
async function cleanupChunks() {
  if (!_storage) return

  try {
    // 尝试删除可能存在的分片 key
    for (let i = 0; i < 100; i++) {
      const chunkKey = `${SYNC_KEY}-chunk-${i}`
      const exists = await _storage.get(chunkKey)
      if (exists === null || exists === undefined) break
      await _storage.remove(chunkKey)
    }
  } catch {
    // 清理失败不影响主流程
  }
}

/**
 * 读取分片数据并组装
 *
 * @param {object} timeData — 时间元数据
 * @param {string[]} errors — 错误数组
 * @param {string[]} warnings — 警告数组
 * @returns {Promise<object>} 同步结果
 */
async function readChunkedData(timeData, errors, warnings) {
  const totalChunks = timeData.chunks
  const allBookmarks = []

  for (let i = 0; i < totalChunks; i++) {
    const chunkKey = `${SYNC_KEY}-chunk-${i}`
    const chunk = await _storage.get(chunkKey)

    if (!chunk || !Array.isArray(chunk.bookmarks)) {
      _currentStatus = SYNC_STATUS_ERROR
      _lastError = `分片 ${i} 数据损坏或缺失`
      return { success: false, status: SYNC_STATUS_ERROR, bookmarks: null, errors: [_lastError], warnings }
    }

    allBookmarks.push(...chunk.bookmarks)
  }

  // 验证每个书签
  const validBookmarks = []
  for (let i = 0; i < allBookmarks.length; i++) {
    const bm = allBookmarks[i]
    if (bm && typeof bm === 'object' && bm.id !== undefined) {
      validBookmarks.push(bm)
    } else {
      warnings.push(`书签索引 ${i} 结构无效，已跳过`)
    }
  }

  _lastSyncTime = timeData.time
  _currentStatus = SYNC_STATUS_SUCCESS
  _lastError = null

  return { success: true, status: SYNC_STATUS_SUCCESS, bookmarks: validBookmarks, errors: [], warnings }
}

/**
 * 分类错误类型
 *
 * @param {Error} err — 错误对象
 * @returns {{ status: string, message: string }}
 */
function classifyError(err) {
  const msg = err.message || String(err)

  if (msg.includes('QUOTA_BYTES') || msg.includes('quota') || msg.includes('QuotaExceededError')) {
    return { status: SYNC_STATUS_QUOTA_EXCEEDED, message: `同步配额超限: ${msg}` }
  }

  if (msg.includes('network') || msg.includes('Network') || msg.includes('fetch') || msg.includes('offline')) {
    return { status: SYNC_STATUS_NETWORK_ERROR, message: `网络错误: ${msg}` }
  }

  return { status: SYNC_STATUS_ERROR, message: `同步错误: ${msg}` }
}
