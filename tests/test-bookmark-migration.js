/**
 * Tests for BookmarkMigration — 数据迁移框架
 *
 * 覆盖: 版本检测、v1→v2 迁移、迁移验证、迁移运行器、
 *       迁移路径规划、迁移报告、数据兼容性检查、批量迁移、边界条件
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  VERSION_V1,
  VERSION_V2,
  CURRENT_VERSION,
  SUPPORTED_VERSIONS,
  FORMAT_VERSION_V2,
  MIGRATION_STEPS,
  getMigrationVersion,
  migrateV1ToV2,
  validateMigration,
  runMigration,
  getMigrationPath,
  createMigrationReport,
  checkDataCompatibility,
  batchMigrate,
} from '../lib/bookmark-migration.js'

// ==================== Fixtures ====================

function createV1Data(overrides = {}) {
  return {
    version: 1,
    exportedAt: '2025-01-01T00:00:00.000Z',
    bookmarks: [
      { id: '1', title: 'PageWise', url: 'https://pagewise.dev', folderPath: ['Tools'], tags: ['ai'], status: 'read', dateAdded: 1700000000000, dateAddedISO: '2023-11-14T22:13:20.000Z' },
      { id: '2', title: 'GitHub', url: 'https://github.com', folderPath: ['Dev'], tags: [], status: 'unread', dateAdded: 1700100000000 },
    ],
    clusters: [{ id: 'c1', name: 'Tech', bookmarkIds: ['1', '2'] }],
    tags: [{ name: 'ai', color: '#ff0000' }],
    statuses: [{ bookmarkId: '1', status: 'read', updatedAt: 100 }],
    ...overrides,
  }
}

function createMinimalV1Data() {
  return { version: 1, bookmarks: [], clusters: [], tags: [], statuses: [] }
}

// ==================== Version Constants ====================

describe('version constants', () => {
  it('VERSION_V1 is 1', () => {
    assert.equal(VERSION_V1, 1)
  })

  it('VERSION_V2 is 2', () => {
    assert.equal(VERSION_V2, 2)
  })

  it('CURRENT_VERSION equals VERSION_V2', () => {
    assert.equal(CURRENT_VERSION, VERSION_V2)
  })

  it('SUPPORTED_VERSIONS is a frozen array containing v1 and v2', () => {
    assert.deepEqual([...SUPPORTED_VERSIONS], [1, 2])
    assert.throws(() => { SUPPORTED_VERSIONS.push(3) })
  })

  it('FORMAT_VERSION_V2 is "2.0"', () => {
    assert.equal(FORMAT_VERSION_V2, '2.0')
  })
})

// ==================== getMigrationVersion ====================

describe('getMigrationVersion', () => {
  it('detects v1 data', () => {
    assert.equal(getMigrationVersion(createV1Data()), 1)
  })

  it('detects v2 data', () => {
    const v2 = { version: 2, bookmarks: [] }
    assert.equal(getMigrationVersion(v2), 2)
  })

  it('returns null for null input', () => {
    assert.equal(getMigrationVersion(null), null)
  })

  it('returns null for undefined input', () => {
    assert.equal(getMigrationVersion(undefined), null)
  })

  it('returns null for non-object input', () => {
    assert.equal(getMigrationVersion('string'), null)
    assert.equal(getMigrationVersion(42), null)
    assert.equal(getMigrationVersion(true), null)
  })

  it('returns null for array input', () => {
    assert.equal(getMigrationVersion([1, 2, 3]), null)
  })

  it('returns null for object without version field', () => {
    assert.equal(getMigrationVersion({ bookmarks: [] }), null)
  })

  it('returns null for unsupported version number', () => {
    assert.equal(getMigrationVersion({ version: 99 }), null)
  })

  it('returns null for non-finite version', () => {
    assert.equal(getMigrationVersion({ version: Infinity }), null)
    assert.equal(getMigrationVersion({ version: NaN }), null)
  })

  it('returns null for negative version', () => {
    assert.equal(getMigrationVersion({ version: -1 }), null)
  })
})

// ==================== migrateV1ToV2 ====================

describe('migrateV1ToV2', () => {
  it('produces v2 data with correct version field', () => {
    const { data } = migrateV1ToV2(createV1Data())
    assert.equal(data.version, VERSION_V2)
    assert.equal(data.formatVersion, FORMAT_VERSION_V2)
  })

  it('preserves all bookmarks', () => {
    const input = createV1Data()
    const { data } = migrateV1ToV2(input)
    assert.equal(data.bookmarks.length, input.bookmarks.length)
    assert.equal(data.bookmarks[0].id, '1')
    assert.equal(data.bookmarks[1].id, '2')
  })

  it('preserves bookmark urls', () => {
    const input = createV1Data()
    const { data } = migrateV1ToV2(input)
    assert.equal(data.bookmarks[0].url, 'https://pagewise.dev')
    assert.equal(data.bookmarks[1].url, 'https://github.com')
  })

  it('renames clusters to collections', () => {
    const input = createV1Data()
    const { data } = migrateV1ToV2(input)
    assert.ok(Array.isArray(data.collections))
    assert.equal(data.collections.length, 1)
    assert.equal(data.collections[0].name, 'Tech')
    assert.equal(data.clusters, undefined)
  })

  it('renames statuses to readingProgress', () => {
    const input = createV1Data()
    const { data } = migrateV1ToV2(input)
    assert.ok(Array.isArray(data.readingProgress))
    assert.equal(data.readingProgress.length, 1)
    assert.equal(data.readingProgress[0].bookmarkId, '1')
    assert.equal(data.statuses, undefined)
  })

  it('adds metadata with bookmark count', () => {
    const input = createV1Data()
    const { data } = migrateV1ToV2(input)
    assert.ok(data.metadata)
    assert.equal(data.metadata.bookmarkCount, 2)
    assert.equal(data.metadata.collectionCount, 1)
    assert.equal(data.metadata.tagCount, 1)
    assert.equal(data.metadata.source, 'pagewise')
    assert.equal(data.metadata.generator, 'PageWise-Migration')
    assert.equal(data.metadata.previousVersion, 1)
  })

  it('adds migratedAt timestamp', () => {
    const { data } = migrateV1ToV2(createV1Data())
    assert.ok(data.migratedAt)
    assert.ok(!isNaN(new Date(data.migratedAt).getTime()))
  })

  it('fills in dateAddedISO when missing', () => {
    const input = createV1Data()
    const { data } = migrateV1ToV2(input)
    // bookmark 2 had no dateAddedISO
    assert.ok(data.bookmarks[1].dateAddedISO)
    assert.ok(data.bookmarks[1].dateAddedISO.startsWith('2023'))
  })

  it('does not mutate the original data', () => {
    const input = createV1Data()
    const originalClusters = input.clusters.length
    migrateV1ToV2(input)
    assert.equal(input.clusters.length, originalClusters)
    assert.equal(input.version, 1)
  })

  it('returns warnings for null input', () => {
    const { data, warnings } = migrateV1ToV2(null)
    assert.equal(data, null)
    assert.ok(warnings.length > 0)
  })

  it('returns warnings when version is not v1', () => {
    const { data, warnings } = migrateV1ToV2({ version: 2, bookmarks: [] })
    assert.ok(data)
    assert.ok(warnings.some(w => w.includes('非 v1 格式')))
  })

  it('handles data with missing arrays gracefully', () => {
    const { data, warnings } = migrateV1ToV2({ version: 1 })
    assert.ok(data)
    assert.ok(Array.isArray(data.bookmarks))
    assert.equal(data.bookmarks.length, 0)
    assert.ok(warnings.some(w => w.includes('缺少 bookmarks')))
  })

  it('normalizes bookmark with invalid status to unread', () => {
    const input = { version: 1, bookmarks: [{ id: 'x', title: 'X', url: 'http://x', status: 'invalid', folderPath: [], tags: 'not-array' }], clusters: [], tags: [], statuses: [] }
    const { data } = migrateV1ToV2(input)
    assert.equal(data.bookmarks[0].status, 'unread')
    assert.deepEqual(data.bookmarks[0].tags, [])
    assert.deepEqual(data.bookmarks[0].folderPath, [])
  })

  it('preserves tags data', () => {
    const input = createV1Data()
    const { data } = migrateV1ToV2(input)
    assert.equal(data.tags.length, 1)
    assert.equal(data.tags[0].name, 'ai')
  })
})

// ==================== validateMigration ====================

describe('validateMigration', () => {
  it('validates a successful migration', () => {
    const oldData = createV1Data()
    const { data: newData } = migrateV1ToV2(oldData)
    const result = validateMigration(oldData, newData)
    assert.equal(result.valid, true)
    assert.equal(result.errors.length, 0)
  })

  it('returns stats with bookmark counts', () => {
    const oldData = createV1Data()
    const { data: newData } = migrateV1ToV2(oldData)
    const { stats } = validateMigration(oldData, newData)
    assert.equal(stats.oldBookmarkCount, 2)
    assert.equal(stats.newBookmarkCount, 2)
    assert.equal(stats.oldClusterCount, 1)
    assert.equal(stats.newCollectionCount, 1)
  })

  it('detects missing bookmarks', () => {
    const oldData = createV1Data()
    const newData = migrateV1ToV2(oldData).data
    newData.bookmarks.pop()
    const result = validateMigration(oldData, newData)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('书签数量不一致')))
  })

  it('detects missing bookmark id', () => {
    const oldData = createV1Data()
    const newData = migrateV1ToV2(oldData).data
    newData.bookmarks[0].id = 'changed'
    const result = validateMigration(oldData, newData)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('书签 1 在迁移后丢失')))
  })

  it('detects missing URL', () => {
    const oldData = createV1Data()
    const newData = migrateV1ToV2(oldData).data
    newData.bookmarks[0].url = 'https://changed.com'
    const result = validateMigration(oldData, newData)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('URL')))
  })

  it('detects wrong version in new data', () => {
    const oldData = createV1Data()
    const newData = { version: 1, bookmarks: oldData.bookmarks }
    const result = validateMigration(oldData, newData)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('迁移后版本')))
  })

  it('detects missing metadata', () => {
    const oldData = createV1Data()
    const newData = migrateV1ToV2(oldData).data
    delete newData.metadata
    const result = validateMigration(oldData, newData)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('metadata')))
  })

  it('detects cluster/collection count mismatch', () => {
    const oldData = createV1Data()
    const newData = migrateV1ToV2(oldData).data
    newData.collections.push({ id: 'c2', name: 'Extra' })
    const result = validateMigration(oldData, newData)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('聚类数据数量不一致')))
  })

  it('returns error for null oldData', () => {
    const result = validateMigration(null, { version: 2 })
    assert.equal(result.valid, false)
    assert.ok(result.errors[0].includes('原始数据'))
  })

  it('returns error for null newData', () => {
    const result = validateMigration(createV1Data(), null)
    assert.equal(result.valid, false)
    assert.ok(result.errors[0].includes('迁移后数据'))
  })
})

// ==================== runMigration ====================

describe('runMigration', () => {
  it('migrates v1 to v2 successfully', () => {
    const result = runMigration(createV1Data(), VERSION_V2)
    assert.equal(result.success, true)
    assert.equal(result.data.version, VERSION_V2)
    assert.equal(result.errors.length, 0)
  })

  it('preserves data through full migration path', () => {
    const v1 = createV1Data()
    const result = runMigration(v1, VERSION_V2)
    assert.equal(result.data.bookmarks.length, 2)
    assert.equal(result.data.bookmarks[0].url, 'https://pagewise.dev')
    assert.equal(result.data.collections.length, 1)
  })

  it('returns warning when already at target version', () => {
    const v2Data = migrateV1ToV2(createV1Data()).data
    const result = runMigration(v2Data, VERSION_V2)
    assert.equal(result.success, true)
    assert.ok(result.warnings.some(w => w.includes('已经是目标版本')))
  })

  it('rejects downgrade from v2 to v1', () => {
    const v2Data = migrateV1ToV2(createV1Data()).data
    const result = runMigration(v2Data, VERSION_V1)
    assert.equal(result.success, false)
    assert.ok(result.errors.some(e => e.includes('降级')))
  })

  it('returns error for null data', () => {
    const result = runMigration(null, VERSION_V2)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('为空'))
  })

  it('returns error for missing target version', () => {
    const result = runMigration(createV1Data(), undefined)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('未指定'))
  })

  it('returns error for invalid target version', () => {
    const result = runMigration(createV1Data(), -1)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('无效'))
  })

  it('returns error for unsupported target version', () => {
    const result = runMigration(createV1Data(), 99)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('无法识别') || result.errors[0].includes('不支持'))
  })

  it('returns error for unrecognizable data version', () => {
    const result = runMigration({ version: 99 }, VERSION_V2)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('无法识别'))
  })

  it('does not mutate original data', () => {
    const input = createV1Data()
    const originalVersion = input.version
    const originalClusterLen = input.clusters.length
    runMigration(input, VERSION_V2)
    assert.equal(input.version, originalVersion)
    assert.equal(input.clusters.length, originalClusterLen)
  })

  it('handles minimal data gracefully', () => {
    const result = runMigration(createMinimalV1Data(), VERSION_V2)
    assert.equal(result.success, true)
    assert.equal(result.data.version, VERSION_V2)
    assert.equal(result.data.bookmarks.length, 0)
  })

  it('handles target version null', () => {
    const result = runMigration(createV1Data(), null)
    assert.equal(result.success, false)
    assert.ok(result.errors[0].includes('未指定'))
  })
})

// ==================== MIGRATION_STEPS ====================

describe('MIGRATION_STEPS', () => {
  it('is a frozen array', () => {
    assert.ok(Array.isArray(MIGRATION_STEPS))
    assert.throws(() => { MIGRATION_STEPS.push({}) })
  })

  it('contains v1→v2 step', () => {
    const step = MIGRATION_STEPS.find(s => s.from === VERSION_V1 && s.to === VERSION_V2)
    assert.ok(step, 'should have v1→v2 migration step')
    assert.ok(step.description.includes('v1'))
    assert.ok(step.description.includes('v2'))
  })

  it('each step has from, to, and description', () => {
    for (const step of MIGRATION_STEPS) {
      assert.equal(typeof step.from, 'number')
      assert.equal(typeof step.to, 'number')
      assert.equal(typeof step.description, 'string')
      assert.ok(step.to > step.from, 'to should be greater than from')
    }
  })

  it('individual steps are frozen', () => {
    for (const step of MIGRATION_STEPS) {
      assert.ok(Object.isFrozen(step))
    }
  })
})

// ==================== getMigrationPath ====================

describe('getMigrationPath', () => {
  it('returns path from v1 to v2', () => {
    const path = getMigrationPath(VERSION_V1, VERSION_V2)
    assert.equal(path.possible, true)
    assert.equal(path.steps.length, 1)
    assert.equal(path.steps[0].from, VERSION_V1)
    assert.equal(path.steps[0].to, VERSION_V2)
    assert.equal(path.error, null)
  })

  it('returns empty steps when same version', () => {
    const path = getMigrationPath(VERSION_V2, VERSION_V2)
    assert.equal(path.possible, true)
    assert.equal(path.steps.length, 0)
    assert.equal(path.error, null)
  })

  it('returns error for downgrade', () => {
    const path = getMigrationPath(VERSION_V2, VERSION_V1)
    assert.equal(path.possible, false)
    assert.ok(path.error.includes('降级'))
  })

  it('returns error for non-finite version', () => {
    const path = getMigrationPath(NaN, VERSION_V2)
    assert.equal(path.possible, false)
    assert.ok(path.error.includes('有效数字'))
  })

  it('returns error for unsupported from version', () => {
    const path = getMigrationPath(99, VERSION_V2)
    assert.equal(path.possible, false)
    // fromVersion=99 > toVersion=2, so downgrade check triggers first
    assert.ok(path.error.includes('降级') || path.error.includes('不支持'))
  })

  it('returns error for unsupported to version', () => {
    const path = getMigrationPath(VERSION_V1, 99)
    assert.equal(path.possible, false)
    assert.ok(path.error.includes('不支持的目标版本'))
  })
})

// ==================== createMigrationReport ====================

describe('createMigrationReport', () => {
  it('generates report for v1→v2 migration', () => {
    const { report, error } = createMigrationReport(createV1Data(), VERSION_V2)
    assert.equal(error, null)
    assert.ok(report)
    assert.equal(report.currentVersion, VERSION_V1)
    assert.equal(report.targetVersion, VERSION_V2)
    assert.equal(report.needsMigration, true)
    assert.equal(report.migrationPossible, true)
  })

  it('includes data overview', () => {
    const { report } = createMigrationReport(createV1Data(), VERSION_V2)
    assert.equal(report.dataOverview.bookmarkCount, 2)
    assert.equal(report.dataOverview.clusterCount, 1)
    assert.equal(report.dataOverview.tagCount, 1)
    assert.equal(report.dataOverview.statusCount, 1)
  })

  it('includes expected changes', () => {
    const { report } = createMigrationReport(createV1Data(), VERSION_V2)
    assert.ok(report.expectedChanges.length > 0)
    assert.ok(report.expectedChanges[0].description)
  })

  it('includes compatibility check', () => {
    const { report } = createMigrationReport(createV1Data(), VERSION_V2)
    assert.ok(report.compatibility)
    assert.equal(typeof report.compatibility.compatible, 'boolean')
  })

  it('includes generatedAt timestamp', () => {
    const { report } = createMigrationReport(createV1Data(), VERSION_V2)
    assert.ok(report.generatedAt)
    assert.ok(!isNaN(new Date(report.generatedAt).getTime()))
  })

  it('returns error for null data', () => {
    const { report, error } = createMigrationReport(null, VERSION_V2)
    assert.equal(report, null)
    assert.ok(error.includes('为空'))
  })

  it('returns error for unrecognizable version', () => {
    const { report, error } = createMigrationReport({ version: 99 }, VERSION_V2)
    assert.equal(report, null)
    assert.ok(error.includes('无法识别'))
  })

  it('returns error for invalid target version', () => {
    const { report, error } = createMigrationReport(createV1Data(), -1)
    assert.equal(report, null)
    assert.ok(error.includes('无效'))
  })

  it('shows needsMigration=false when already at target', () => {
    const v2Data = migrateV1ToV2(createV1Data()).data
    const { report } = createMigrationReport(v2Data, VERSION_V2)
    assert.equal(report.needsMigration, false)
    assert.equal(report.expectedChanges.length, 0)
  })

  it('migration path is array of strings', () => {
    const { report } = createMigrationReport(createV1Data(), VERSION_V2)
    assert.ok(Array.isArray(report.migrationPath))
    assert.ok(report.migrationPath.every(s => typeof s === 'string'))
  })
})

// ==================== checkDataCompatibility ====================

describe('checkDataCompatibility', () => {
  it('validates v1 data as compatible', () => {
    const result = checkDataCompatibility(createV1Data())
    assert.equal(result.compatible, true)
    assert.equal(result.version, VERSION_V1)
    assert.equal(result.issues.length, 0)
  })

  it('validates v2 data as compatible', () => {
    const v2Data = migrateV1ToV2(createV1Data()).data
    const result = checkDataCompatibility(v2Data)
    assert.equal(result.compatible, true)
    assert.equal(result.version, VERSION_V2)
    assert.equal(result.issues.length, 0)
  })

  it('returns issues for null data', () => {
    const result = checkDataCompatibility(null)
    assert.equal(result.compatible, false)
    assert.ok(result.issues[0].includes('为空'))
  })

  it('returns issues for array data', () => {
    const result = checkDataCompatibility([1, 2, 3])
    assert.equal(result.compatible, false)
    assert.ok(result.issues[0].includes('数组'))
  })

  it('detects missing version field', () => {
    const result = checkDataCompatibility({ bookmarks: [{ id: '1', url: 'http://x' }] })
    assert.equal(result.compatible, false)
    assert.ok(result.issues.some(i => i.includes('version')))
  })

  it('detects unrecognizable version', () => {
    const result = checkDataCompatibility({ version: 99 })
    assert.equal(result.compatible, false)
    assert.ok(result.issues.some(i => i.includes('无法识别')))
  })

  it('warns about missing optional v1 arrays', () => {
    const result = checkDataCompatibility({ version: 1, bookmarks: [] })
    assert.equal(result.version, VERSION_V1)
    assert.ok(result.warnings.some(w => w.includes('clusters')))
    assert.ok(result.warnings.some(w => w.includes('tags')))
    assert.ok(result.warnings.some(w => w.includes('statuses')))
  })

  it('detects missing bookmark id in v1', () => {
    const data = { version: 1, bookmarks: [{ title: 'X', url: 'http://x' }], clusters: [], tags: [], statuses: [] }
    const result = checkDataCompatibility(data)
    assert.ok(result.issues.some(i => i.includes('缺少 id')))
  })

  it('warns about bookmark without url and title in v1', () => {
    const data = { version: 1, bookmarks: [{ id: '1' }], clusters: [], tags: [], statuses: [] }
    const result = checkDataCompatibility(data)
    assert.ok(result.warnings.some(w => w.includes('url 和 title')))
  })

  it('warns about missing v2 optional fields', () => {
    const data = { version: 2, bookmarks: [] }
    const result = checkDataCompatibility(data)
    assert.ok(result.warnings.some(w => w.includes('formatVersion')))
    assert.ok(result.warnings.some(w => w.includes('collections')))
    assert.ok(result.warnings.some(w => w.includes('readingProgress')))
    assert.ok(result.warnings.some(w => w.includes('metadata')))
  })

  it('v1 data with missing bookmarks array is an issue', () => {
    const data = { version: 1, clusters: [], tags: [], statuses: [] }
    const result = checkDataCompatibility(data)
    assert.ok(result.issues.some(i => i.includes('bookmarks 数组')))
  })

  it('empty v1 data is compatible (empty arrays are valid)', () => {
    const result = checkDataCompatibility(createMinimalV1Data())
    assert.equal(result.compatible, true)
    assert.equal(result.version, VERSION_V1)
  })
})

// ==================== batchMigrate ====================

describe('batchMigrate', () => {
  it('migrates multiple v1 datasets to v2', () => {
    const data1 = createV1Data()
    const data2 = createMinimalV1Data()
    const { results, summary } = batchMigrate([data1, data2], VERSION_V2)
    assert.equal(summary.total, 2)
    assert.equal(summary.succeeded, 2)
    assert.equal(summary.failed, 0)
    assert.equal(results[0].data.version, VERSION_V2)
    assert.equal(results[1].data.version, VERSION_V2)
  })

  it('skips datasets already at target version', () => {
    const v2Data = migrateV1ToV2(createV1Data()).data
    const { summary } = batchMigrate([v2Data], VERSION_V2)
    assert.equal(summary.skipped, 1)
    assert.equal(summary.succeeded, 0)
  })

  it('handles failed items without affecting others', () => {
    const valid = createV1Data()
    const invalid = { version: 99, bookmarks: [] }
    const { results, summary } = batchMigrate([valid, invalid, valid], VERSION_V2)
    assert.equal(summary.total, 3)
    assert.equal(summary.succeeded, 2)
    assert.equal(summary.failed, 1)
    assert.equal(results[1].success, false)
  })

  it('returns empty summary for null input', () => {
    const { results, summary } = batchMigrate(null, VERSION_V2)
    assert.equal(results.length, 0)
    assert.equal(summary.total, 0)
  })

  it('returns empty summary for non-array input', () => {
    const { results, summary } = batchMigrate('not-array', VERSION_V2)
    assert.equal(results.length, 0)
    assert.equal(summary.total, 0)
  })

  it('handles empty array', () => {
    const { results, summary } = batchMigrate([], VERSION_V2)
    assert.equal(results.length, 0)
    assert.equal(summary.total, 0)
    assert.equal(summary.succeeded, 0)
    assert.equal(summary.failed, 0)
    assert.equal(summary.skipped, 0)
  })

  it('each result includes index', () => {
    const { results } = batchMigrate([createV1Data()], VERSION_V2)
    assert.equal(results[0].index, 0)
  })

  it('does not mutate original data', () => {
    const data = createV1Data()
    const originalVersion = data.version
    batchMigrate([data], VERSION_V2)
    assert.equal(data.version, originalVersion)
  })

  it('preserves data through batch migration', () => {
    const data = createV1Data()
    const { results } = batchMigrate([data], VERSION_V2)
    assert.equal(results[0].data.bookmarks.length, 2)
    assert.equal(results[0].data.bookmarks[0].url, 'https://pagewise.dev')
  })
})
