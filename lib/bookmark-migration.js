/**
 * BookmarkMigration — 数据迁移框架
 *
 * 负责在不同版本的书签数据格式之间进行安全迁移，
 * 包含版本检测、v1→v2 迁移、迁移验证等完整流程。
 *
 * 版本格式说明:
 *   v1: { version: 1, exportedAt, bookmarks[], clusters[], tags[], statuses[] }
 *   v2: { version: 2, formatVersion, exportedAt, migratedAt, metadata,
 *          bookmarks[], collections[], tags[], readingProgress[] }
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 * - 所有函数为纯函数
 */

// ==================== Version Constants ====================

export const VERSION_V1 = 1
export const VERSION_V2 = 2
export const CURRENT_VERSION = VERSION_V2

export const SUPPORTED_VERSIONS = Object.freeze([VERSION_V1, VERSION_V2])

export const FORMAT_VERSION_V2 = '2.0'

// ==================== Version Detection ====================

/**
 * 检测数据当前的版本号
 *
 * @param {object} data - 书签数据对象
 * @returns {number|null} 版本号 (1, 2)，无法识别返回 null
 */
export function getMigrationVersion(data) {
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data)) return null

  const v = data.version
  if (v === undefined || v === null) return null
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    if (SUPPORTED_VERSIONS.includes(v)) return v
  }
  return null
}

// ==================== v1 → v2 Migration ====================

/**
 * 将 v1 格式数据迁移为 v2 格式
 *
 * 主要变更:
 *   - clusters → collections (重命名)
 *   - statuses → readingProgress (重命名)
 *   - 新增 metadata 统计信息
 *   - 新增 formatVersion 字段
 *   - 新增 migratedAt 时间戳
 *   - 为书签新增 dateAddedISO 字段 (如果缺失)
 *
 * @param {object} data - v1 格式数据
 * @returns {{ data: object, warnings: string[] }} 迁移结果
 */
export function migrateV1ToV2(data) {
  const warnings = []

  if (!data || typeof data !== 'object') {
    return { data: null, warnings: ['输入数据为空或非对象'] }
  }

  if (data.version !== VERSION_V1) {
    warnings.push(`数据版本为 ${data.version}，非 v1 格式`)
  }

  // 深拷贝避免修改原始数据
  const bookmarks = Array.isArray(data.bookmarks)
    ? data.bookmarks.map(bm => migrateBookmarkV1ToV2(bm))
    : []
  const collections = Array.isArray(data.clusters) ? deepCopy(data.clusters) : []
  const tags = Array.isArray(data.tags) ? deepCopy(data.tags) : []
  const readingProgress = Array.isArray(data.statuses) ? deepCopy(data.statuses) : []

  if (!Array.isArray(data.bookmarks)) {
    warnings.push('原始数据缺少 bookmarks 数组')
  }
  if (!Array.isArray(data.clusters)) {
    warnings.push('原始数据缺少 clusters 数组')
  }

  const migratedAt = new Date().toISOString()

  const newData = {
    version: VERSION_V2,
    formatVersion: FORMAT_VERSION_V2,
    exportedAt: data.exportedAt || migratedAt,
    migratedAt,
    metadata: {
      bookmarkCount: bookmarks.length,
      collectionCount: collections.length,
      tagCount: tags.length,
      source: 'pagewise',
      generator: 'PageWise-Migration',
      previousVersion: VERSION_V1,
    },
    bookmarks,
    collections,
    tags,
    readingProgress,
  }

  return { data: newData, warnings }
}

/**
 * 迁移单个书签对象从 v1 到 v2 格式
 * - 确保 dateAddedISO 字段存在
 * - 确保 tags 为数组
 * - 确保 status 为有效值
 *
 * @param {object} bm - v1 格式书签
 * @returns {object} v2 格式书签
 */
function migrateBookmarkV1ToV2(bm) {
  if (!bm || typeof bm !== 'object') {
    return { id: 'unknown', title: '', url: '', folderPath: [], tags: [], status: 'unread', dateAdded: 0, dateAddedISO: '' }
  }

  const migrated = { ...bm }

  // 确保 tags 是数组
  if (!Array.isArray(migrated.tags)) {
    migrated.tags = []
  }

  // 确保 folderPath 是数组
  if (!Array.isArray(migrated.folderPath)) {
    migrated.folderPath = []
  }

  // 确保 status 有效
  if (!['unread', 'reading', 'read'].includes(migrated.status)) {
    migrated.status = 'unread'
  }

  // 补充 dateAddedISO
  if (!migrated.dateAddedISO && migrated.dateAdded) {
    try {
      migrated.dateAddedISO = new Date(migrated.dateAdded).toISOString()
    } catch {
      migrated.dateAddedISO = ''
    }
  }

  return migrated
}

// ==================== Migration Validation ====================

/**
 * 验证迁移是否完整保留了所有数据
 *
 * @param {object} oldData - 迁移前的 v1 数据
 * @param {object} newData - 迁移后的 v2 数据
 * @returns {{ valid: boolean, errors: string[], stats: object }}
 */
export function validateMigration(oldData, newData) {
  const errors = []
  const stats = {}

  if (!oldData || typeof oldData !== 'object') {
    return { valid: false, errors: ['原始数据为空或非对象'], stats }
  }
  if (!newData || typeof newData !== 'object') {
    return { valid: false, errors: ['迁移后数据为空或非对象'], stats }
  }

  // 检查版本号已更新
  if (newData.version !== VERSION_V2) {
    errors.push(`迁移后版本应为 ${VERSION_V2}，实际为 ${newData.version}`)
  }

  // 检查书签数量一致
  const oldBookmarks = Array.isArray(oldData.bookmarks) ? oldData.bookmarks : []
  const newBookmarks = Array.isArray(newData.bookmarks) ? newData.bookmarks : []
  stats.oldBookmarkCount = oldBookmarks.length
  stats.newBookmarkCount = newBookmarks.length
  if (oldBookmarks.length !== newBookmarks.length) {
    errors.push(`书签数量不一致: 原始 ${oldBookmarks.length}，迁移后 ${newBookmarks.length}`)
  }

  // 检查每个书签的 id 和 url 保留
  const oldIds = new Set(oldBookmarks.map(bm => bm?.id))
  const newIds = new Set(newBookmarks.map(bm => bm?.id))
  for (const id of oldIds) {
    if (!newIds.has(id)) errors.push(`书签 ${id} 在迁移后丢失`)
  }

  const oldUrls = new Set(oldBookmarks.map(bm => bm?.url).filter(Boolean))
  const newUrls = new Set(newBookmarks.map(bm => bm?.url).filter(Boolean))
  for (const url of oldUrls) {
    if (!newUrls.has(url)) errors.push(`URL ${url} 在迁移后丢失`)
  }

  // 检查 collections 对应 clusters
  const oldClusters = Array.isArray(oldData.clusters) ? oldData.clusters.length : 0
  const newCollections = Array.isArray(newData.collections) ? newData.collections.length : 0
  stats.oldClusterCount = oldClusters
  stats.newCollectionCount = newCollections
  if (oldClusters !== newCollections) {
    errors.push(`聚类数据数量不一致: 原始 ${oldClusters}，迁移后 ${newCollections}`)
  }

  // 检查 tags 保留
  const oldTags = Array.isArray(oldData.tags) ? oldData.tags.length : 0
  const newTags = Array.isArray(newData.tags) ? newData.tags.length : 0
  stats.oldTagCount = oldTags
  stats.newTagCount = newTags
  if (oldTags !== newTags) {
    errors.push(`标签数量不一致: 原始 ${oldTags}，迁移后 ${newTags}`)
  }

  // 检查 readingProgress 对应 statuses
  const oldStatuses = Array.isArray(oldData.statuses) ? oldData.statuses.length : 0
  const newReadingProgress = Array.isArray(newData.readingProgress) ? newData.readingProgress.length : 0
  stats.oldStatusCount = oldStatuses
  stats.newReadingProgressCount = newReadingProgress
  if (oldStatuses !== newReadingProgress) {
    errors.push(`状态数据数量不一致: 原始 ${oldStatuses}，迁移后 ${newReadingProgress}`)
  }

  // 检查 metadata 存在
  if (!newData.metadata) {
    errors.push('迁移后数据缺少 metadata')
  }

  return { valid: errors.length === 0, errors, stats }
}

// ==================== Migration Runner ====================

/**
 * 根据当前版本和目标版本运行迁移路径
 *
 * @param {object} data - 当前数据
 * @param {number} targetVersion - 目标版本号
 * @returns {{ success: boolean, data: object|null, warnings: string[], errors: string[] }}
 */
export function runMigration(data, targetVersion) {
  const warnings = []
  const errors = []

  if (!data || typeof data !== 'object') {
    return { success: false, data: null, warnings, errors: ['输入数据为空或非对象'] }
  }

  if (targetVersion === undefined || targetVersion === null) {
    return { success: false, data: null, warnings, errors: ['未指定目标版本'] }
  }

  if (!Number.isFinite(targetVersion) || targetVersion < 1) {
    return { success: false, data: null, warnings, errors: [`无效的目标版本: ${targetVersion}`] }
  }

  const currentVersion = getMigrationVersion(data)
  if (currentVersion === null) {
    return { success: false, data: null, warnings, errors: ['无法识别数据版本'] }
  }

  if (currentVersion === targetVersion) {
    warnings.push(`数据已经是目标版本 v${targetVersion}，无需迁移`)
    return { success: true, data: deepCopy(data), warnings, errors }
  }

  if (currentVersion > targetVersion) {
    return {
      success: false,
      data: null,
      warnings,
      errors: [`不支持从 v${currentVersion} 降级到 v${targetVersion}`],
    }
  }

  if (!SUPPORTED_VERSIONS.includes(targetVersion)) {
    return {
      success: false,
      data: null,
      warnings,
      errors: [`不支持的目标版本: v${targetVersion}`],
    }
  }

  // 执行逐步迁移
  let currentData = deepCopy(data)
  let migrationWarnings = []

  // v1 → v2
  if (currentVersion === VERSION_V1 && targetVersion >= VERSION_V2) {
    const result = migrateV1ToV2(currentData)
    if (!result.data) {
      return { success: false, data: null, warnings, errors: ['v1→v2 迁移失败'] }
    }
    currentData = result.data
    migrationWarnings.push(...result.warnings)
  }

  return {
    success: true,
    data: currentData,
    warnings: [...warnings, ...migrationWarnings],
    errors,
  }
}

// ==================== Utility ====================

/**
 * 深拷贝 (JSON 安全子集)
 * @param {*} obj
 * @returns {*}
 */
function deepCopy(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch {
    if (Array.isArray(obj)) return obj.map(item => deepCopy(item))
    const copy = {}
    for (const key of Object.keys(obj)) copy[key] = deepCopy(obj[key])
    return copy
  }
}
