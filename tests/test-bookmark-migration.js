/**
 * Tests for BookmarkMigration — 数据迁移框架
 *
 * 覆盖: 版本检测、v1→v2 迁移、迁移验证、迁移运行器、边界条件
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  VERSION_V1,
  VERSION_V2,
  CURRENT_VERSION,
  SUPPORTED_VERSIONS,
  FORMAT_VERSION_V2,
  getMigrationVersion,
  migrateV1ToV2,
  validateMigration,
  runMigration,
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
