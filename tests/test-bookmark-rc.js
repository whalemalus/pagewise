/**
 * tests/test-bookmark-rc.js — 15 bookmark integration tests
 *
 * Cross-module integration tests exercising how bookmark modules
 * cooperate on real-world data flows: import → dedup → stats → export,
 * backup → validate → restore, migration → validation, error handling
 * across boundaries, and manifest store-readiness checks.
 *
 * Modules under test:
 *   bookmark-io, bookmark-dedup, bookmark-stats, bookmark-migration,
 *   bookmark-backup, bookmark-exporter, bookmark-error-handler, bookmark-store-prep
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const { BookmarkImportExport } = await import('../lib/bookmark-io.js')
const { BookmarkDedup } = await import('../lib/bookmark-dedup.js')
const { BookmarkStatistics } = await import('../lib/bookmark-stats.js')
const {
  getMigrationVersion, migrateV1ToV2, validateMigration,
  runMigration, getMigrationPath, createMigrationReport,
  checkDataCompatibility, batchMigrate, VERSION_V1, VERSION_V2,
} = await import('../lib/bookmark-migration.js')
const {
  createBackup, validateBackup, restoreBackup, computeChecksum,
} = await import('../lib/bookmark-backup.js')
const {
  BookmarkExporter, exportToNetscape, exportToMarkdown,
  exportToCSV, importFromNetscape, importFromMarkdown,
} = await import('../lib/bookmark-exporter.js')
const {
  classifyError, handleBookmarkError, createErrorBoundary, logError,
  ERROR_CATEGORIES,
} = await import('../lib/bookmark-error-handler.js')
const {
  validateManifest, checkIcons, getStoreListing,
  validateContentSecurityPolicy, checkStoreSubmissionReadiness,
} = await import('../lib/bookmark-store-prep.js')

// ==================== Helpers ====================

function bm(id, title, url, folderPath = [], tags = [], status = 'unread', dateAdded = 0) {
  return { id: String(id), title, url, folderPath, tags, status, dateAdded }
}

const SAMPLE_BOOKMARKS = [
  bm('1', 'MDN Web Docs',    'https://developer.mozilla.org/en-US/',  ['Dev'],     ['docs', 'web']),
  bm('2', 'MDN JavaScript',  'https://developer.mozilla.org/en-US/docs/Web/JavaScript', ['Dev', 'JS'], ['docs', 'js']),
  bm('3', 'GitHub',          'https://github.com/',                   ['Dev'],     ['code']),
  bm('4', 'Hacker News',     'https://news.ycombinator.com/',         ['News'],    ['tech']),
  bm('5', 'HN duplicate',    'https://news.ycombinator.com/',         ['Reading'], ['tech']),      // dup of 4
  bm('6', 'MDN Docs (copy)', 'https://developer.mozilla.org/en-US/',  ['Misc'],    ['reference']), // dup of 1
  bm('7', 'Stack Overflow',  'https://stackoverflow.com/',            ['Dev'],     ['qa']),
]

function validManifest() {
  return {
    manifest_version: 3,
    name: 'PageWise',
    version: '1.0.0',
    description: 'AI-powered reading assistant with bookmark intelligence and knowledge graph.',
    icons: { '16': 'icons/16.png', '48': 'icons/48.png', '128': 'icons/128.png' },
    permissions: ['storage', 'sidePanel', 'tabs', 'bookmarks'],
    background: { service_worker: 'background.js' },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
    default_locale: 'en',
  }
}

function makeV1Data(bookmarks) {
  return {
    version: 1,
    exportedAt: '2025-01-01T00:00:00.000Z',
    bookmarks: bookmarks || SAMPLE_BOOKMARKS.slice(0, 3),
    clusters: [{ id: 'c1', label: 'Dev' }],
    tags: ['docs', 'web', 'js'],
    statuses: [{ bookmarkId: '1', status: 'read' }],
  }
}

// ==================== Tests ====================

describe('bookmark-rc: cross-module integration', () => {

  // ---- 1 ----
  it('import CSV → dedup → stats counts only unique bookmarks', () => {
    // Export to CSV then re-import via round-trip
    const csv = exportToCSV(SAMPLE_BOOKMARKS)
    const lines = csv.split('\n')
    // Header + 7 data rows
    assert.equal(lines.length, 8)
    assert.ok(lines[0].includes('title'))

    // Dedup on the full set
    const dedup = new BookmarkDedup(SAMPLE_BOOKMARKS)
    const urlGroups = dedup.findByExactUrl()
    // URLs: mdn (1,6), github (3), hn (4,5), stackoverflow (7) → 2 groups with dupes
    assert.equal(urlGroups.length, 2)

    // After batch removal of duplicates, run stats
    const ids = urlGroups.flatMap(g => g.slice(1).map(b => b.id))
    dedup.batchRemove(ids)
    assert.equal(dedup.bookmarks.length, 5)

    const stats = new BookmarkStatistics(dedup.bookmarks)
    const summary = stats.getSummary()
    assert.equal(summary.total, 5)
    assert.ok(summary.uniqueDomains >= 3)
  })

  // ---- 2 ----
  it('Netscape export → re-import preserves URL round-trip', () => {
    const subset = SAMPLE_BOOKMARKS.slice(0, 3)
    const html = exportToNetscape(subset)
    assert.ok(html.includes('<!DOCTYPE NETSCAPE'))

    const reimported = importFromNetscape(html)
    assert.equal(reimported.length, 3)

    const origUrls = new Set(subset.map(b => b.url))
    for (const rb of reimported) {
      assert.ok(origUrls.has(rb.url), `URL ${rb.url} should survive round-trip`)
    }
  })

  // ---- 3 ----
  it('Markdown export → re-import preserves folder hierarchy', () => {
    const subset = SAMPLE_BOOKMARKS.slice(0, 4)
    const md = exportToMarkdown(subset)
    assert.ok(md.startsWith('# Bookmarks'))

    const reimported = importFromMarkdown(md)
    assert.equal(reimported.length, 4)

    // Check folders are preserved
    const devBms = reimported.filter(b => b.folderPath.includes('Dev'))
    assert.ok(devBms.length >= 2, 'Dev folder should have 2+ bookmarks')
    const newsBms = reimported.filter(b => b.folderPath.includes('News'))
    assert.equal(newsBms.length, 1)
  })

  // ---- 4 ----
  it('backup create → validate → restore round-trip with dedup stats', () => {
    // Create backup from deduped data
    const dedup = new BookmarkDedup(SAMPLE_BOOKMARKS)
    const dupes = dedup.findDuplicates()
    const ids = dupes.flatMap(d => d.duplicates.map(x => x.id))
    dedup.batchRemove(ids)

    const result = createBackup(dedup.bookmarks, { description: 'deduped backup' })
    assert.ok(result.success)
    assert.equal(result.backup.bookmarkCount, dedup.bookmarks.length)
    assert.equal(result.backup.data.metadata.description, 'deduped backup')

    // Validate
    const valid = validateBackup(result.backup)
    assert.ok(valid.valid)
    assert.equal(valid.errors.length, 0)

    // Restore
    const restored = restoreBackup(result.backup)
    assert.ok(restored.success)
    assert.equal(restored.bookmarks.length, dedup.bookmarks.length)
    assert.equal(restored.metadata.description, 'deduped backup')

    // Stats on restored data should match
    const stats = new BookmarkStatistics(restored.bookmarks)
    assert.equal(stats.getSummary().total, dedup.bookmarks.length)
  })

  // ---- 5 ----
  it('v1 migration → validate → backup → restore preserves all data', () => {
    const v1 = makeV1Data()
    const migrated = runMigration(v1, VERSION_V2)
    assert.ok(migrated.success)
    assert.equal(migrated.data.version, VERSION_V2)
    assert.equal(migrated.data.bookmarks.length, v1.bookmarks.length)
    assert.ok(migrated.data.metadata)

    // Validate migration integrity
    const valid = validateMigration(v1, migrated.data)
    assert.ok(valid.valid, `Migration errors: ${valid.errors.join(', ')}`)
    assert.equal(valid.stats.oldBookmarkCount, valid.stats.newBookmarkCount)

    // Backup the migrated data
    const backupResult = createBackup(migrated.data.bookmarks)
    assert.ok(backupResult.success)

    // Restore and verify count
    const restored = restoreBackup(backupResult.backup)
    assert.ok(restored.success)
    assert.equal(restored.bookmarks.length, v1.bookmarks.length)
  })

  // ---- 6 ----
  it('IO import/export JSON round-trip with full graph data', () => {
    const data = {
      bookmarks: SAMPLE_BOOKMARKS.slice(0, 3),
      clusters: [{ id: 'c1' }],
      tags: ['docs'],
      statuses: [],
    }
    const io = new BookmarkImportExport(data)
    const jsonStr = io.exportJSON()
    assert.ok(jsonStr.includes('"version": 1'))

    const io2 = new BookmarkImportExport()
    const imported = io2.importFromJSON(jsonStr)
    assert.equal(imported.bookmarks.length, 3)
    assert.equal(imported.clusters.length, 1)
    assert.equal(imported.tags.length, 1)
  })

  // ---- 7 ----
  it('IO Chrome HTML import → export → dedup full pipeline', () => {
    const chromeHTML = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<DL><p>',
      '    <DT><H3>Dev</H3>',
      '    <DL><p>',
      '        <DT><A HREF="https://example.com/" ADD_DATE="1700000000">Example</A>',
      '        <DT><A HREF="https://example.com/" ADD_DATE="1700000100">Example Copy</A>',
      '    </DL><p>',
      '    <DT><A HREF="https://other.com/" ADD_DATE="1700000200">Other</A>',
      '</DL><p>',
    ].join('\n')

    const io = new BookmarkImportExport()
    const imported = io.importFromChromeHTML(chromeHTML)
    assert.equal(imported.length, 3)

    // Dedup: two bookmarks with same URL
    const dedup = new BookmarkDedup(imported)
    const urlGroups = dedup.findByExactUrl()
    assert.ok(urlGroups.length >= 1, 'Should detect duplicate URL group')

    // Stats on deduped
    dedup.batchRemove(urlGroups.flatMap(g => g.slice(1).map(b => b.id)))
    const stats = new BookmarkStatistics(dedup.bookmarks)
    assert.equal(stats.getSummary().total, 2)
  })

  // ---- 8 ----
  it('error handler wraps async dedup + stats pipeline with fallback', async () => {
    const handler = handleBookmarkError(
      new TypeError('invalid bookmark format'),
      { operation: 'dedup', component: 'BookmarkDedup' }
    )
    assert.equal(handler.category, ERROR_CATEGORIES.VALIDATION)
    assert.equal(handler.context.operation, 'dedup')
    assert.ok(handler.recovery.length > 0)

    // createErrorBoundary wraps a failing stats computation
    const failingStats = async () => { throw new Error('storage quota exceeded') }
    const fallback = (err) => {
      const classified = classifyError(err)
      return { category: classified, fallbackUsed: true }
    }

    const wrapped = createErrorBoundary(failingStats, fallback)
    const result = await wrapped()
    assert.equal(result.category, ERROR_CATEGORIES.STORAGE)
    assert.equal(result.fallbackUsed, true)
  })

  // ---- 9 ----
  it('classifyError correctly categorizes all ERROR_CATEGORIES', () => {
    assert.equal(classifyError(new Error('fetch failed')), ERROR_CATEGORIES.NETWORK)
    assert.equal(classifyError(new Error('permission denied')), ERROR_CATEGORIES.PERMISSION)
    assert.equal(classifyError(new Error('quota exceeded')), ERROR_CATEGORIES.STORAGE)
    assert.equal(classifyError(new TypeError('bad type')), ERROR_CATEGORIES.VALIDATION)
    assert.equal(classifyError(new Error('something random')), ERROR_CATEGORIES.UNKNOWN)
    assert.equal(classifyError(null), ERROR_CATEGORIES.UNKNOWN)

    // Explicit category field
    assert.equal(classifyError({ category: 'network' }), ERROR_CATEGORIES.NETWORK)

    // String error
    assert.equal(classifyError('storage full'), ERROR_CATEGORIES.STORAGE)

    // Name-based
    assert.equal(classifyError({ name: 'NetworkError' }), ERROR_CATEGORIES.NETWORK)
    assert.equal(classifyError({ name: 'QuotaExceededError' }), ERROR_CATEGORIES.STORAGE)
    assert.equal(classifyError({ name: 'SecurityError' }), ERROR_CATEGORIES.PERMISSION)
  })

  // ---- 10 ----
  it('logError produces structured log with category, stack, and context', () => {
    const err = new Error('indexeddb quota_exceeded write failed')
    err.stack = 'Error: indexeddb quota_exceeded write failed\n    at test.js:1:1'
    const log = logError(err, { operation: 'save', component: 'BookmarkStore' })

    assert.equal(log.level, 'ERROR')
    assert.equal(log.category, ERROR_CATEGORIES.STORAGE)
    assert.ok(log.message.includes('quota_exceeded'))
    assert.ok(log.stack.includes('test.js'))
    assert.equal(log.context.operation, 'save')
    assert.equal(log.context.component, 'BookmarkStore')
    assert.ok(log.timestamp)
  })

  // ---- 11 ----
  it('migration: getMigrationVersion + checkDataCompatibility + getMigrationPath', () => {
    const v1 = makeV1Data()
    assert.equal(getMigrationVersion(v1), VERSION_V1)

    const v2Result = migrateV1ToV2(v1)
    assert.equal(getMigrationVersion(v2Result.data), VERSION_V2)

    // Compatibility check
    const compatV1 = checkDataCompatibility(v1)
    assert.ok(compatV1.compatible)
    assert.equal(compatV1.version, VERSION_V1)

    const compatV2 = checkDataCompatibility(v2Result.data)
    assert.ok(compatV2.compatible)
    assert.equal(compatV2.version, VERSION_V2)

    // Migration path
    const path = getMigrationPath(VERSION_V1, VERSION_V2)
    assert.ok(path.possible)
    assert.equal(path.steps.length, 1)
    assert.equal(path.steps[0].from, VERSION_V1)
  })

  // ---- 12 ----
  it('createMigrationReport produces complete pre-migration analysis', () => {
    const v1 = makeV1Data(SAMPLE_BOOKMARKS)
    const { report, error } = createMigrationReport(v1, VERSION_V2)

    assert.equal(error, null)
    assert.equal(report.currentVersion, VERSION_V1)
    assert.equal(report.targetVersion, VERSION_V2)
    assert.ok(report.needsMigration)
    assert.ok(report.migrationPossible)
    assert.equal(report.dataOverview.bookmarkCount, SAMPLE_BOOKMARKS.length)
    assert.equal(report.dataOverview.clusterCount, 1)
    assert.ok(report.compatibility.compatible)
    assert.ok(report.expectedChanges.length >= 1)
  })

  // ---- 13 ----
  it('batchMigrate handles mixed v1 datasets and same-version skip', () => {
    const v1a = makeV1Data(SAMPLE_BOOKMARKS.slice(0, 2))
    const v1b = makeV1Data(SAMPLE_BOOKMARKS.slice(2, 4))

    // First migrate one to v2 to test skip
    const v2Data = runMigration(v1b, VERSION_V2).data

    const result = batchMigrate([v1a, v2Data], VERSION_V2)
    assert.equal(result.summary.total, 2)
    assert.equal(result.summary.succeeded, 1)
    assert.equal(result.summary.skipped, 1)
    assert.equal(result.summary.failed, 0)
  })

  // ---- 14 ----
  it('store-prep: validateManifest + checkStoreSubmissionReadiness on valid manifest', () => {
    const manifest = validManifest()
    const result = validateManifest(manifest)
    assert.ok(result.valid)
    assert.equal(result.errors.length, 0)

    const readiness = checkStoreSubmissionReadiness(manifest, {
      availableLocales: ['en', 'zh_CN'],
      messagesByLocale: {
        en: { extName: { message: 'PageWise' }, extDescription: { message: 'desc' } },
        zh_CN: { extName: { message: '智阅' }, extDescription: { message: '描述' } },
      },
    })
    assert.ok(readiness.ready)
    assert.ok(readiness.score >= 80)
    // All required checks should pass
    for (const check of readiness.checks) {
      assert.ok(check.passed, `Check "${check.label}" should pass: ${check.detail}`)
    }
  })

  // ---- 15 ----
  it('store-prep: broken manifest fails validation and readiness checks', () => {
    const broken = {
      manifest_version: 2,
      name: '',
      version: 'bad',
      description: 'x'.repeat(200),
      icons: { '16': 'a.png' },
      permissions: ['debugger', '<all_urls>'],
      background: {},
      content_security_policy: { extension_pages: "script-src 'self' 'unsafe-eval'" },
    }

    const result = validateManifest(broken)
    assert.ok(!result.valid)
    assert.ok(result.errors.length >= 3)

    const icons = checkIcons(broken)
    assert.ok(!icons.valid)
    assert.ok(icons.missing.includes('48'))
    assert.ok(icons.missing.includes('128'))

    const csp = validateContentSecurityPolicy(broken)
    assert.ok(!csp.valid)
    assert.ok(csp.errors.some(e => e.includes('unsafe-eval')))

    const listing = getStoreListing(broken)
    assert.ok(!listing.isValid)
    assert.ok(listing.errors.length >= 1)

    const readiness = checkStoreSubmissionReadiness(broken)
    assert.ok(!readiness.ready)
    assert.ok(readiness.score < 50)
  })
})
