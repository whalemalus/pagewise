/**
 * BookmarkMigration — 数据迁移框架
 *
 * 负责在不同版本的书签数据格式之间进行安全迁移，
 * 包含版本检测、v1→v2 迁移、迁移验证、迁移报告、
 * 数据兼容性检查、批量迁移和迁移路径规划等完整流程。
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

// ==================== Migration Steps Registry ====================

/**
 * 迁移步骤注册表 — 可扩展的迁移路径
 *
 * 每个步骤包含 from/to 版本和描述。
 * runMigration 内部根据版本号调用对应的迁移函数。
 */
export const MIGRATION_STEPS = Object.freeze([
  Object.freeze({
    from: VERSION_V1,
    to: VERSION_V2,
    description: 'v1→v2: clusters→collections, statuses→readingProgress, 新增 metadata',
  }),
])

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

// ==================== Migration Path ====================

/**
 * 获取从 fromVersion 到 toVersion 所需的迁移步骤列表
 *
 * @param {number} fromVersion — 起始版本
 * @param {number} toVersion   — 目标版本
 * @returns {{ possible: boolean, steps: object[], error: string|null }}
 */
export function getMigrationPath(fromVersion, toVersion) {
  if (!Number.isFinite(fromVersion) || !Number.isFinite(toVersion)) {
    return { possible: false, steps: [], error: '版本号必须是有效数字' }
  }

  if (fromVersion === toVersion) {
    return { possible: true, steps: [], error: null }
  }

  if (fromVersion > toVersion) {
    return { possible: false, steps: [], error: `不支持从 v${fromVersion} 降级到 v${toVersion}` }
  }

  if (!SUPPORTED_VERSIONS.includes(fromVersion)) {
    return { possible: false, steps: [], error: `不支持的起始版本: v${fromVersion}` }
  }
  if (!SUPPORTED_VERSIONS.includes(toVersion)) {
    return { possible: false, steps: [], error: `不支持的目标版本: v${toVersion}` }
  }

  // 收集从 fromVersion 到 toVersion 之间的所有步骤
  const steps = []
  for (const step of MIGRATION_STEPS) {
    if (step.from >= fromVersion && step.to <= toVersion) {
      steps.push(step)
    }
  }

  if (steps.length === 0) {
    return { possible: false, steps: [], error: `找不到从 v${fromVersion} 到 v${toVersion} 的迁移路径` }
  }

  return { possible: true, steps, error: null }
}

// ==================== Migration Report ====================

/**
 * 生成迁移报告（不执行迁移）
 *
 * 分析当前数据并生成详细的迁移计划，包含:
 *   - 当前版本 / 目标版本
 *   - 数据概况 (书签数/聚类数/标签数)
 *   - 所需迁移步骤
 *   - 预计变更
 *   - 兼容性检查结果
 *
 * @param {object} data          — 当前数据
 * @param {number} targetVersion — 目标版本号
 * @returns {{ report: object|null, error: string|null }}
 */
export function createMigrationReport(data, targetVersion) {
  if (!data || typeof data !== 'object') {
    return { report: null, error: '输入数据为空或非对象' }
  }

  const currentVersion = getMigrationVersion(data)
  if (currentVersion === null) {
    return { report: null, error: '无法识别数据版本' }
  }

  if (!Number.isFinite(targetVersion) || targetVersion < 1) {
    return { report: null, error: `无效的目标版本: ${targetVersion}` }
  }

  const path = getMigrationPath(currentVersion, targetVersion)

  // 数据概况
  const dataOverview = {
    bookmarkCount: Array.isArray(data.bookmarks) ? data.bookmarks.length : 0,
    clusterCount: Array.isArray(data.clusters) ? data.clusters.length : 0,
    collectionCount: Array.isArray(data.collections) ? data.collections.length : 0,
    tagCount: Array.isArray(data.tags) ? data.tags.length : 0,
    statusCount: Array.isArray(data.statuses) ? data.statuses.length : 0,
    readingProgressCount: Array.isArray(data.readingProgress) ? data.readingProgress.length : 0,
  }

  // 兼容性检查
  const compatibility = checkDataCompatibility(data)

  // 预计变更
  const expectedChanges = []
  if (currentVersion < targetVersion) {
    for (const step of path.steps) {
      expectedChanges.push({
        step: `${step.from}→${step.to}`,
        description: step.description,
      })
    }
  }

  const report = {
    currentVersion,
    targetVersion,
    needsMigration: currentVersion !== targetVersion,
    migrationPossible: path.possible,
    migrationPath: path.steps.map(s => `${s.from}→${s.to}`),
    expectedChanges,
    dataOverview,
    compatibility,
    generatedAt: new Date().toISOString(),
  }

  if (path.error) {
    report.error = path.error
  }

  return { report, error: null }
}

// ==================== Data Compatibility Check ====================

/**
 * 检查数据格式兼容性
 *
 * 验证数据结构是否符合已知版本规范，返回详细的兼容性报告。
 *
 * @param {object} data — 待检查的数据
 * @returns {{ compatible: boolean, version: number|null, issues: string[], warnings: string[] }}
 */
export function checkDataCompatibility(data) {
  const issues = []
  const warnings = []

  if (!data || typeof data !== 'object') {
    return { compatible: false, version: null, issues: ['数据为空或非对象'], warnings }
  }

  if (Array.isArray(data)) {
    return { compatible: false, version: null, issues: ['数据为数组而非对象'], warnings }
  }

  const version = getMigrationVersion(data)
  if (version === null) {
    // 尝试猜测版本
    if (data.bookmarks && !data.version) {
      issues.push('数据缺少 version 字段')
    } else {
      issues.push('无法识别数据版本')
    }
    return { compatible: false, version: null, issues, warnings }
  }

  // v1 格式检查
  if (version === VERSION_V1) {
    if (!Array.isArray(data.bookmarks)) {
      issues.push('v1 数据缺少 bookmarks 数组')
    } else {
      // 检查书签字段完整性
      for (let i = 0; i < data.bookmarks.length; i++) {
        const bm = data.bookmarks[i]
        if (!bm.id && bm.id !== 0) {
          issues.push(`书签 #${i} 缺少 id 字段`)
        }
        if (!bm.url && !bm.title) {
          warnings.push(`书签 #${i} 缺少 url 和 title`)
        }
      }
    }
    if (!Array.isArray(data.clusters)) {
      warnings.push('v1 数据缺少 clusters 数组')
    }
    if (!Array.isArray(data.tags)) {
      warnings.push('v1 数据缺少 tags 数组')
    }
    if (!Array.isArray(data.statuses)) {
      warnings.push('v1 数据缺少 statuses 数组')
    }
  }

  // v2 格式检查
  if (version === VERSION_V2) {
    if (!data.formatVersion) {
      warnings.push('v2 数据缺少 formatVersion 字段')
    }
    if (!Array.isArray(data.bookmarks)) {
      issues.push('v2 数据缺少 bookmarks 数组')
    }
    if (!Array.isArray(data.collections)) {
      warnings.push('v2 数据缺少 collections 数组')
    }
    if (!Array.isArray(data.readingProgress)) {
      warnings.push('v2 数据缺少 readingProgress 数组')
    }
    if (!data.metadata) {
      warnings.push('v2 数据缺少 metadata 字段')
    }
  }

  return {
    compatible: issues.length === 0,
    version,
    issues,
    warnings,
  }
}

// ==================== Batch Migration ====================

/**
 * 批量迁移多个数据集
 *
 * 对每个数据集独立执行迁移，互不影响。
 * 某个数据集迁移失败不影响其他数据集。
 *
 * @param {object[]} dataArray    — 数据对象数组
 * @param {number}   targetVersion — 目标版本号
 * @returns {{ results: object[], summary: object }}
 */
export function batchMigrate(dataArray, targetVersion) {
  if (!Array.isArray(dataArray)) {
    return {
      results: [],
      summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
    }
  }

  const results = []
  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < dataArray.length; i++) {
    const item = dataArray[i]
    const result = runMigration(item, targetVersion)

    if (result.success) {
      // 检查是否是跳过的（已经是目标版本）
      const currentVersion = getMigrationVersion(item)
      if (currentVersion === targetVersion) {
        skipped++
      } else {
        succeeded++
      }
    } else {
      failed++
    }

    results.push({
      index: i,
      ...result,
    })
  }

  return {
    results,
    summary: {
      total: dataArray.length,
      succeeded,
      failed,
      skipped,
    },
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

// ==================== Exports Summary ====================
//
// 版本常量: VERSION_V1, VERSION_V2, CURRENT_VERSION, SUPPORTED_VERSIONS, FORMAT_VERSION_V2
// 迁移注册: MIGRATION_STEPS
// 核心函数: getMigrationVersion, migrateV1ToV2, validateMigration, runMigration
// 路径规划: getMigrationPath
// 报告生成: createMigrationReport
// 兼容检查: checkDataCompatibility
// 批量迁移: batchMigrate
