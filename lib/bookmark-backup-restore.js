/**
 * BookmarkBackupRestore — 备份与恢复模块
 *
 * 提供书签数据的备份创建、完整性验证、恢复和备份列表管理。
 *
 * 功能:
 *   - createBackup(bookmarks, metadata) — 创建带时间戳和校验和的备份
 *   - validateBackup(backup) — 验证备份完整性
 *   - restoreFromBackup(backup) — 从备份恢复书签数据
 *   - listBackups() — 列出存储中的可用备份
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 * - 所有函数为纯函数（除了 listBackups 依赖注入的 storage）
 */

// ==================== Constants ====================

/** 备份格式版本 */
export const BACKUP_FORMAT_VERSION = '1.0'

/** 备份前缀标识 */
export const BACKUP_PREFIX = 'pagewise-backup'

/** 最大备份数量 */
export const MAX_BACKUPS = 50

// ==================== Checksum ====================

/**
 * 计算字符串的简单校验和 (djb2 变体)
 * 用于备份完整性验证，非加密用途
 *
 * @param {string} str — 待计算字符串
 * @returns {string} 十六进制校验和字符串
 */
export function computeChecksum(str) {
  if (typeof str !== 'string') return '0'
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

// ==================== Backup Creation ====================

/**
 * 创建备份对象
 *
 * @param {Array} bookmarks — 书签数组
 * @param {object} [metadata={}] — 额外元数据
 * @returns {{ success: boolean, backup: object|null, errors: string[] }}
 */
export function createBackup(bookmarks, metadata = {}) {
  const errors = []

  if (!Array.isArray(bookmarks)) {
    return { success: false, backup: null, errors: ['bookmarks 必须是数组'] }
  }

  if (metadata !== null && metadata !== undefined && typeof metadata !== 'object') {
    return { success: false, backup: null, errors: ['metadata 必须是对象'] }
  }

  const timestamp = new Date().toISOString()
  const backupId = `${BACKUP_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // 深拷贝书签数据以避免引用问题
  let bookmarksCopy
  try {
    bookmarksCopy = JSON.parse(JSON.stringify(bookmarks))
  } catch {
    return { success: false, backup: null, errors: ['书签数据无法序列化'] }
  }

  // 深拷贝元数据
  let metadataCopy = {}
  if (metadata && typeof metadata === 'object') {
    try {
      metadataCopy = JSON.parse(JSON.stringify(metadata))
    } catch {
      metadataCopy = {}
    }
  }

  const payload = {
    bookmarks: bookmarksCopy,
    metadata: metadataCopy,
  }

  const payloadStr = JSON.stringify(payload)
  const checksum = computeChecksum(payloadStr)

  const backup = {
    version: BACKUP_FORMAT_VERSION,
    backupId,
    createdAt: timestamp,
    bookmarkCount: bookmarksCopy.length,
    metadata: metadataCopy,
    checksum,
    bookmarks: bookmarksCopy,
  }

  return { success: true, backup, errors: [] }
}

// ==================== Backup Validation ====================

/**
 * 验证备份对象的完整性和格式
 *
 * @param {*} backup — 待验证的备份对象
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateBackup(backup) {
  const errors = []
  const warnings = []

  // null / undefined 检查
  if (backup === null || backup === undefined) {
    return { valid: false, errors: ['备份对象为空或未定义'], warnings }
  }

  // 类型检查
  if (typeof backup !== 'object' || Array.isArray(backup)) {
    return { valid: false, errors: ['备份对象必须是非数组对象'], warnings }
  }

  // 必需字段检查
  if (backup.version === undefined || backup.version === null) {
    errors.push('缺少 version 字段')
  } else if (backup.version !== BACKUP_FORMAT_VERSION) {
    errors.push(`备份格式版本不匹配: 期望 ${BACKUP_FORMAT_VERSION}，实际 ${backup.version}`)
  }

  if (!backup.backupId) {
    errors.push('缺少 backupId 字段')
  }

  if (!backup.createdAt) {
    errors.push('缺少 createdAt 字段')
  } else {
    const parsed = new Date(backup.createdAt)
    if (isNaN(parsed.getTime())) {
      errors.push('createdAt 不是有效的日期字符串')
    }
  }

  if (!backup.checksum) {
    errors.push('缺少 checksum 字段')
  }

  if (!Array.isArray(backup.bookmarks)) {
    errors.push('缺少 bookmarks 数组或类型不正确')
  }

  // 校验和验证
  if (backup.checksum && Array.isArray(backup.bookmarks)) {
    const payload = {
      bookmarks: backup.bookmarks,
      metadata: backup.metadata || {},
    }
    const expected = computeChecksum(JSON.stringify(payload))
    if (expected !== backup.checksum) {
      errors.push('校验和不匹配，备份数据可能已损坏')
    }
  }

  // bookmarkCount 一致性检查
  if (Array.isArray(backup.bookmarks) && backup.bookmarkCount !== undefined) {
    if (backup.bookmarkCount !== backup.bookmarks.length) {
      warnings.push(`bookmarkCount 声明 ${backup.bookmarkCount}，实际 ${backup.bookmarks.length}`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ==================== Backup Restore ====================

/**
 * 从备份恢复书签数据
 *
 * @param {object} backup — 备份对象
 * @returns {{ success: boolean, bookmarks: Array|null, metadata: object|null, errors: string[], warnings: string[] }}
 */
export function restoreFromBackup(backup) {
  const errors = []
  const warnings = []

  // 先验证备份
  const validation = validateBackup(backup)
  if (!validation.valid) {
    return {
      success: false,
      bookmarks: null,
      metadata: null,
      errors: validation.errors,
      warnings: validation.warnings,
    }
  }

  warnings.push(...validation.warnings)

  // 恢复书签数据 (深拷贝)
  let restoredBookmarks
  try {
    restoredBookmarks = JSON.parse(JSON.stringify(backup.bookmarks))
  } catch {
    return {
      success: false,
      bookmarks: null,
      metadata: null,
      errors: ['备份书签数据无法反序列化'],
      warnings,
    }
  }

  // 恢复元数据
  let restoredMetadata = null
  if (backup.metadata && typeof backup.metadata === 'object') {
    try {
      restoredMetadata = JSON.parse(JSON.stringify(backup.metadata))
    } catch {
      warnings.push('元数据无法恢复，已跳过')
    }
  }

  // 验证每个书签的基本结构
  const validBookmarks = []
  for (let i = 0; i < restoredBookmarks.length; i++) {
    const bm = restoredBookmarks[i]
    if (bm && typeof bm === 'object' && bm.id !== undefined) {
      validBookmarks.push(bm)
    } else {
      warnings.push(`书签索引 ${i} 结构无效，已跳过`)
    }
  }

  return {
    success: true,
    bookmarks: validBookmarks,
    metadata: restoredMetadata,
    errors,
    warnings,
  }
}

// ==================== Backup Listing ====================

/**
 * 从存储中列出可用备份
 *
 * @param {object} storage — 存储对象，需实现 list() 方法
 * @returns {Promise<{ success: boolean, backups: object[], errors: string[] }>}
 */
export async function listBackups(storage) {
  const errors = []

  if (!storage || typeof storage.list !== 'function') {
    return { success: false, backups: [], errors: ['存储对象无效或缺少 list 方法'] }
  }

  try {
    const items = await storage.list(BACKUP_PREFIX)

    if (!Array.isArray(items)) {
      return { success: false, backups: [], errors: ['存储返回非数组数据'] }
    }

    // 按创建时间降序排列
    const sorted = items
      .filter(item => item && item.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // 限制最大数量
    const limited = sorted.slice(0, MAX_BACKUPS)

    return { success: true, backups: limited, errors: [] }
  } catch (err) {
    return { success: false, backups: [], errors: [`列出备份失败: ${err.message || err}`] }
  }
}

// ==================== Backup Deletion ====================

/**
 * 删除指定备份
 *
 * @param {object} storage — 存储对象，需实现 remove(key) 方法
 * @param {string} backupId — 备份 ID
 * @returns {Promise<{ success: boolean, errors: string[] }>}
 */
export async function deleteBackup(storage, backupId) {
  const errors = []

  if (!storage || typeof storage.remove !== 'function') {
    return { success: false, errors: ['存储对象无效或缺少 remove 方法'] }
  }

  if (!backupId || typeof backupId !== 'string') {
    return { success: false, errors: ['备份 ID 无效'] }
  }

  try {
    await storage.remove(backupId)
    return { success: true, errors: [] }
  } catch (err) {
    return { success: false, errors: [`删除备份失败: ${err.message || err}`] }
  }
}
