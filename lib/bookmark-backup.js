/**
 * BookmarkBackup — 书签备份、验证与恢复模块
 *
 * 提供书签数据的创建备份、完整性验证和备份恢复功能。
 *
 * 功能:
 *   - createBackup(bookmarks, options)  — 将书签数据打包为带时间戳和校验和的备份对象
 *   - validateBackup(backupData)        — 检查备份结构完整性和版本兼容性
 *   - restoreBackup(backupData)         — 验证并返回恢复后的书签数据
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 * - 所有函数为纯函数
 * - 通过 JSDoc 提供完整的类型注解
 *
 * @module lib/bookmark-backup
 */

// ==================== Constants ====================

/** 备份格式版本 */
export const BACKUP_FORMAT_VERSION = '1.0'

/** 支持的版本列表 */
export const SUPPORTED_VERSIONS = Object.freeze(['1.0'])

// ==================== Internal Helpers ====================

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

/**
 * 生成唯一备份 ID
 *
 * @returns {string} 形如 `backup-{timestamp}-{random}` 的 ID
 */
function generateBackupId() {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `backup-${ts}-${rand}`
}

/**
 * 深拷贝可序列化数据
 *
 * @param {*} data — 任意可 JSON 序列化的数据
 * @returns {*} 深拷贝后的数据
 */
function deepCopy(data) {
  return JSON.parse(JSON.stringify(data))
}

// ==================== createBackup ====================

/**
 * 将书签数据打包为 JSON 备份对象
 *
 * 返回的备份对象包含:
 * - version — 格式版本
 * - backupId — 唯一标识
 * - timestamp — ISO 8601 创建时间
 * - bookmarkCount — 书签数量
 * - checksum — 数据校验和
 * - data — { bookmarks, metadata }
 *
 * @param {Array} bookmarks — 书签数组
 * @param {object} [options={}] — 备份选项
 * @param {string} [options.description] — 备份描述
 * @param {object} [options.metadata]    — 额外元数据
 * @returns {{ success: boolean, backup: object|null, errors: string[] }}
 */
export function createBackup(bookmarks, options = {}) {
  const errors = []

  if (!Array.isArray(bookmarks)) {
    return { success: false, backup: null, errors: ['bookmarks 必须是数组'] }
  }

  let bookmarksCopy
  try {
    bookmarksCopy = deepCopy(bookmarks)
  } catch (err) {
    return { success: false, backup: null, errors: [`书签数据无法序列化: ${err.message}`] }
  }

  const timestamp = new Date().toISOString()
  const backupId = generateBackupId()

  // 构建 metadata
  const metadata = {}
  if (options.description) {
    metadata.description = String(options.description)
  }
  if (options.metadata && typeof options.metadata === 'object') {
    try {
      Object.assign(metadata, deepCopy(options.metadata))
    } catch {
      // 元数据不可序列化时忽略
    }
  }

  const data = {
    bookmarks: bookmarksCopy,
    metadata,
  }

  const dataStr = JSON.stringify(data)
  const checksum = computeChecksum(dataStr)

  const backup = {
    version: BACKUP_FORMAT_VERSION,
    backupId,
    timestamp,
    bookmarkCount: bookmarksCopy.length,
    checksum,
    data,
  }

  return { success: true, backup, errors }
}

// ==================== validateBackup ====================

/**
 * 检查备份结构完整性和版本兼容性
 *
 * 验证项:
 * - 数据非空且为对象
 * - version 字段存在且兼容
 * - backupId、timestamp、checksum 字段存在且有效
 * - data 字段存在且包含 bookmarks 数组
 * - checksum 与实际数据匹配
 * - bookmarkCount 一致性（警告级别）
 *
 * @param {*} backupData — 待验证的备份数据
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateBackup(backupData) {
  const errors = []
  const warnings = []

  // null / undefined 检查
  if (backupData === null || backupData === undefined) {
    return { valid: false, errors: ['备份数据为空或未定义'], warnings }
  }

  // 类型检查
  if (typeof backupData !== 'object' || Array.isArray(backupData)) {
    return { valid: false, errors: ['备份数据必须是非数组对象'], warnings }
  }

  // version 字段检查
  if (backupData.version === undefined || backupData.version === null) {
    errors.push('缺少 version 字段')
  } else if (!SUPPORTED_VERSIONS.includes(backupData.version)) {
    errors.push(`版本不兼容: ${backupData.version}，支持的版本: ${SUPPORTED_VERSIONS.join(', ')}`)
  }

  // backupId 检查
  if (!backupData.backupId || typeof backupData.backupId !== 'string') {
    errors.push('缺少或无效的 backupId 字段')
  }

  // timestamp 检查
  if (!backupData.timestamp) {
    errors.push('缺少 timestamp 字段')
  } else {
    const parsed = new Date(backupData.timestamp)
    if (isNaN(parsed.getTime())) {
      errors.push('timestamp 不是有效的日期字符串')
    }
  }

  // checksum 检查
  if (!backupData.checksum || typeof backupData.checksum !== 'string') {
    errors.push('缺少或无效的 checksum 字段')
  }

  // data 字段检查
  if (!backupData.data || typeof backupData.data !== 'object') {
    errors.push('缺少 data 字段或类型不正确')
  } else {
    // data.bookmarks 检查
    if (!Array.isArray(backupData.data.bookmarks)) {
      errors.push('data.bookmarks 必须是数组')
    }

    // 校验和验证
    if (backupData.checksum && Array.isArray(backupData.data.bookmarks)) {
      try {
        const dataStr = JSON.stringify(backupData.data)
        const expected = computeChecksum(dataStr)
        if (expected !== backupData.checksum) {
          errors.push('校验和不匹配，备份数据可能已损坏')
        }
      } catch {
        errors.push('无法计算校验和，数据可能已损坏')
      }
    }
  }

  // bookmarkCount 一致性检查 (警告)
  if (Array.isArray(backupData.data?.bookmarks) && backupData.bookmarkCount !== undefined) {
    if (backupData.bookmarkCount !== backupData.data.bookmarks.length) {
      warnings.push(`bookmarkCount 声明 ${backupData.bookmarkCount}，实际 ${backupData.data.bookmarks.length}`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ==================== restoreBackup ====================

/**
 * 验证并返回恢复后的书签数据
 *
 * 流程:
 * 1. 调用 validateBackup 验证备份完整性
 * 2. 深拷贝书签数据以避免引用问题
 * 3. 过滤掉结构无效的书签（无 id 字段的条目）
 * 4. 恢复 metadata（如果存在）
 *
 * @param {*} backupData — 备份对象
 * @returns {{ success: boolean, bookmarks: Array|null, metadata: object|null, errors: string[], warnings: string[] }}
 */
export function restoreBackup(backupData) {
  const errors = []
  const warnings = []

  // 先验证
  const validation = validateBackup(backupData)
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
    restoredBookmarks = deepCopy(backupData.data.bookmarks)
  } catch (err) {
    return {
      success: false,
      bookmarks: null,
      metadata: null,
      errors: [`备份书签数据无法反序列化: ${err.message}`],
      warnings,
    }
  }

  // 恢复元数据
  let restoredMetadata = null
  if (backupData.data.metadata && typeof backupData.data.metadata === 'object') {
    try {
      restoredMetadata = deepCopy(backupData.data.metadata)
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
