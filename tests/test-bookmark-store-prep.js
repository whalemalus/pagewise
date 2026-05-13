/**
 * Tests for BookmarkStorePrep — Chrome Web Store 发布准备
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateManifest, checkIcons, getStoreListing } from '../lib/bookmark-store-prep.js'

// ==================== Test Fixtures ====================

/**
 * 创建一个有效的最小 manifest 用于测试
 */
function createValidManifest() {
  return {
    manifest_version: 3,
    name: 'PageWise',
    version: '2.4.0',
    description: 'Browse the web with AI — ask questions about any page, auto-organize answers into a smart knowledge base.',
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    permissions: ['storage', 'activeTab'],
    background: {
      service_worker: 'background/service-worker.js',
      type: 'module',
    },
  }
}

// ==================== validateManifest ====================

describe('validateManifest', () => {
  it('returns valid for a correct manifest', () => {
    const result = validateManifest(createValidManifest())
    assert.equal(result.valid, true)
    assert.equal(result.errors.length, 0)
  })

  it('returns errors for null manifest', () => {
    const result = validateManifest(null)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('non-null object')))
  })

  it('returns errors for undefined manifest', () => {
    const result = validateManifest(undefined)
    assert.equal(result.valid, false)
    assert.ok(result.errors.length > 0)
  })

  it('returns errors for non-object manifest', () => {
    const result = validateManifest('not-an-object')
    assert.equal(result.valid, false)
  })

  // ── manifest_version ──

  it('requires manifest_version to be 3', () => {
    const m = createValidManifest()
    m.manifest_version = 2
    const result = validateManifest(m)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('manifest_version')))
  })

  it('rejects missing manifest_version', () => {
    const m = createValidManifest()
    delete m.manifest_version
    const result = validateManifest(m)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('manifest_version')))
  })

  // ── name ──

  it('requires name to be present', () => {
    const m = createValidManifest()
    delete m.name
    const result = validateManifest(m)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('name')))
  })

  it('rejects empty name', () => {
    const m = createValidManifest()
    m.name = ''
    const result = validateManifest(m)
    assert.equal(result.valid, false)
  })

  // ── version ──

  it('requires version to be present', () => {
    const m = createValidManifest()
    delete m.version
    const result = validateManifest(m)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('version')))
  })

  it('warns on non-semver version format', () => {
    const m = createValidManifest()
    m.version = 'v1'
    const result = validateManifest(m)
    assert.ok(result.warnings.some(w => w.includes('semver')))
  })

  // ── description ──

  it('requires description to be present', () => {
    const m = createValidManifest()
    delete m.description
    const result = validateManifest(m)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('description')))
  })

  it('rejects description exceeding 132 chars', () => {
    const m = createValidManifest()
    m.description = 'A'.repeat(133)
    const result = validateManifest(m)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('exceeds 132')))
  })

  it('accepts description at exactly 132 chars', () => {
    const m = createValidManifest()
    m.description = 'B'.repeat(132)
    const result = validateManifest(m)
    // should not have description length error
    assert.ok(!result.errors.some(e => e.includes('exceeds')))
  })

  it('warns on i18n placeholder description', () => {
    const m = createValidManifest()
    m.description = '__MSG_extDescription__'
    const result = validateManifest(m)
    assert.ok(result.warnings.some(w => w.includes('i18n placeholder')))
  })

  // ── icons ──

  it('requires icons 16, 48, 128', () => {
    const m = createValidManifest()
    delete m.icons
    const result = validateManifest(m)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('icon size: 16')))
    assert.ok(result.errors.some(e => e.includes('icon size: 48')))
    assert.ok(result.errors.some(e => e.includes('icon size: 128')))
  })

  it('rejects missing icon 48', () => {
    const m = createValidManifest()
    delete m.icons['48']
    const result = validateManifest(m)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('icon size: 48')))
  })

  // ── permissions ──

  it('warns on dangerous permissions', () => {
    const m = createValidManifest()
    m.permissions = ['storage', 'debugger']
    const result = validateManifest(m)
    assert.ok(result.warnings.some(w => w.includes('debugger') && w.includes('dangerous')))
  })

  it('warns when permissions is not an array', () => {
    const m = createValidManifest()
    m.permissions = 'storage'
    const result = validateManifest(m)
    assert.ok(result.warnings.some(w => w.includes('not an array')))
  })

  // ── host_permissions ──

  it('warns on <all_urls> host_permissions', () => {
    const m = createValidManifest()
    m.host_permissions = ['<all_urls>']
    const result = validateManifest(m)
    assert.ok(result.warnings.some(w => w.includes('broad pattern')))
  })

  it('warns on wildcard host_permissions', () => {
    const m = createValidManifest()
    m.host_permissions = ['*://*/*']
    const result = validateManifest(m)
    assert.ok(result.warnings.some(w => w.includes('broad pattern')))
  })

  // ── content_scripts ──

  it('warns on <all_urls> content_scripts matches', () => {
    const m = createValidManifest()
    m.content_scripts = [{ matches: ['<all_urls>'], js: ['content.js'] }]
    const result = validateManifest(m)
    assert.ok(result.warnings.some(w => w.includes('content_scripts') && w.includes('<all_urls>')))
  })

  // ── background ──

  it('warns on missing background', () => {
    const m = createValidManifest()
    delete m.background
    const result = validateManifest(m)
    assert.ok(result.warnings.some(w => w.includes('no background service_worker')))
  })

  it('warns on missing service_worker in background', () => {
    const m = createValidManifest()
    m.background = { type: 'module' }
    const result = validateManifest(m)
    assert.ok(result.warnings.some(w => w.includes('service_worker is not set')))
  })

  // ── multiple errors ──

  it('collects multiple errors at once', () => {
    const result = validateManifest({
      manifest_version: 2,
      version: '1.0.0',
    })
    assert.equal(result.valid, false)
    assert.ok(result.errors.length >= 2)
  })

  // ── return structure ──

  it('returns object with valid, errors, warnings', () => {
    const result = validateManifest(createValidManifest())
    assert.equal(typeof result.valid, 'boolean')
    assert.ok(Array.isArray(result.errors))
    assert.ok(Array.isArray(result.warnings))
  })
})

// ==================== checkIcons ====================

describe('checkIcons', () => {
  it('returns valid when all required sizes present', () => {
    const m = createValidManifest()
    const result = checkIcons(m)
    assert.equal(result.valid, true)
    assert.deepEqual(result.found, ['16', '48', '128'])
    assert.deepEqual(result.missing, [])
  })

  it('returns invalid when icons object is missing', () => {
    const m = createValidManifest()
    delete m.icons
    const result = checkIcons(m)
    assert.equal(result.valid, false)
    assert.equal(result.missing.length, 3)
    assert.deepEqual(result.found, [])
  })

  it('returns invalid when icons is null', () => {
    const m = createValidManifest()
    m.icons = null
    const result = checkIcons(m)
    assert.equal(result.valid, false)
    assert.equal(result.missing.length, 3)
  })

  it('detects missing icon 16', () => {
    const m = createValidManifest()
    delete m.icons['16']
    const result = checkIcons(m)
    assert.equal(result.valid, false)
    assert.ok(result.missing.includes('16'))
    assert.ok(result.found.includes('48'))
    assert.ok(result.found.includes('128'))
  })

  it('detects missing icon 128', () => {
    const m = createValidManifest()
    delete m.icons['128']
    const result = checkIcons(m)
    assert.equal(result.valid, false)
    assert.ok(result.missing.includes('128'))
    assert.deepEqual(result.found, ['16', '48'])
  })

  it('rejects empty string icon path', () => {
    const m = createValidManifest()
    m.icons['48'] = ''
    const result = checkIcons(m)
    assert.equal(result.valid, false)
    assert.ok(result.missing.includes('48'))
  })

  it('warns about extra icon sizes', () => {
    const m = createValidManifest()
    m.icons['32'] = 'icons/icon32.png'
    m.icons['256'] = 'icons/icon256.png'
    const result = checkIcons(m)
    assert.equal(result.valid, true)
    assert.ok(result.warnings.some(w => w.includes('additional icon sizes')))
    assert.ok(result.warnings.some(w => w.includes('32')))
    assert.ok(result.warnings.some(w => w.includes('256')))
  })

  it('returns errors array and found/missing arrays', () => {
    const result = checkIcons(createValidManifest())
    assert.ok(Array.isArray(result.errors))
    assert.ok(Array.isArray(result.warnings))
    assert.ok(Array.isArray(result.found))
    assert.ok(Array.isArray(result.missing))
  })

  it('handles non-object manifest', () => {
    const result = checkIcons(null)
    assert.equal(result.valid, false)
    assert.ok(result.errors.length > 0)
  })

  it('handles non-string icon values', () => {
    const m = createValidManifest()
    m.icons['48'] = 12345
    const result = checkIcons(m)
    assert.equal(result.valid, false)
    assert.ok(result.missing.includes('48'))
  })
})

// ==================== getStoreListing ====================

describe('getStoreListing', () => {
  it('returns listing metadata for valid manifest', () => {
    const m = createValidManifest()
    const listing = getStoreListing(m)
    assert.equal(listing.name, 'PageWise')
    assert.equal(listing.version, '2.4.0')
    assert.ok(listing.description.length > 0)
    assert.ok(listing.shortDescription.length > 0)
    assert.equal(listing.isValid, true)
  })

  it('includes all icon paths', () => {
    const m = createValidManifest()
    const listing = getStoreListing(m)
    assert.equal(listing.iconPaths['16'], 'icons/icon16.png')
    assert.equal(listing.iconPaths['48'], 'icons/icon48.png')
    assert.equal(listing.iconPaths['128'], 'icons/icon128.png')
  })

  it('includes permissions as a copy', () => {
    const m = createValidManifest()
    const listing = getStoreListing(m)
    assert.ok(Array.isArray(listing.permissions))
    assert.deepEqual(listing.permissions, m.permissions)
    // Verify it's a copy
    listing.permissions.push('extra')
    assert.equal(m.permissions.length, 2)
  })

  it('includes hostPermissions as a copy', () => {
    const m = createValidManifest()
    m.host_permissions = ['https://api.example.com/*']
    const listing = getStoreListing(m)
    assert.deepEqual(listing.hostPermissions, ['https://api.example.com/*'])
    listing.hostPermissions.push('extra')
    assert.equal(m.host_permissions.length, 1)
  })

  it('truncates description to 132 chars in shortDescription', () => {
    const m = createValidManifest()
    m.description = 'X'.repeat(200)
    const listing = getStoreListing(m)
    assert.equal(listing.shortDescription.length, 132)
    assert.equal(listing.description.length, 200)
  })

  it('keeps shortDescription equal to description when within limit', () => {
    const m = createValidManifest()
    m.description = 'Short description'
    const listing = getStoreListing(m)
    assert.equal(listing.shortDescription, listing.description)
  })

  it('sets category to Productivity', () => {
    const listing = getStoreListing(createValidManifest())
    assert.equal(listing.category, 'Productivity')
  })

  it('includes manifest version', () => {
    const listing = getStoreListing(createValidManifest())
    assert.equal(listing.manifestVersion, 3)
  })

  it('includes validation errors and warnings', () => {
    const m = createValidManifest()
    m.description = 'A'.repeat(200)
    const listing = getStoreListing(m)
    assert.ok(listing.errors.length > 0)
    assert.equal(listing.isValid, false)
  })

  it('returns safe defaults for null manifest', () => {
    const listing = getStoreListing(null)
    assert.equal(listing.name, '')
    assert.equal(listing.version, '')
    assert.equal(listing.description, '')
    assert.equal(listing.shortDescription, '')
    assert.deepEqual(listing.permissions, [])
    assert.deepEqual(listing.hostPermissions, [])
    assert.deepEqual(listing.iconPaths, {})
    assert.equal(listing.category, 'Productivity')
    assert.equal(listing.manifestVersion, 0)
    assert.equal(listing.isValid, false)
  })

  it('returns safe defaults for undefined manifest', () => {
    const listing = getStoreListing(undefined)
    assert.equal(listing.isValid, false)
    assert.equal(listing.name, '')
  })

  it('handles manifest with missing optional fields', () => {
    const listing = getStoreListing({
      manifest_version: 3,
      name: 'Test',
      version: '1.0.0',
      description: 'A test extension',
      icons: { '16': 'i16.png', '48': 'i48.png', '128': 'i128.png' },
    })
    assert.equal(listing.name, 'Test')
    assert.deepEqual(listing.permissions, [])
    assert.deepEqual(listing.hostPermissions, [])
  })

  it('does not mutate the input manifest', () => {
    const m = createValidManifest()
    const original = JSON.stringify(m)
    getStoreListing(m)
    assert.equal(JSON.stringify(m), original)
  })
})

// ==================== Integration: Real manifest.json ====================

describe('integration: real manifest patterns', () => {
  it('a clean manifest with safe permissions passes validation', () => {
    const m = createValidManifest()
    m.permissions = ['storage', 'sidePanel', 'contextMenus', 'tabs', 'activeTab', 'bookmarks']
    m.host_permissions = [
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
    ]
    const result = validateManifest(m)
    assert.equal(result.valid, true)
    assert.equal(result.errors.length, 0)
  })

  it('manifest with debugger permission fails with warning', () => {
    const m = createValidManifest()
    m.permissions = ['storage', 'debugger']
    const result = validateManifest(m)
    assert.ok(result.warnings.some(w => w.includes('debugger')))
  })

  it('manifest with all three required icons passes icon check', () => {
    const m = createValidManifest()
    const result = checkIcons(m)
    assert.equal(result.valid, true)
    assert.equal(result.found.length, 3)
  })

  it('getStoreListing with full real manifest returns complete metadata', () => {
    const m = createValidManifest()
    m.host_permissions = ['https://api.anthropic.com/*', 'https://api.openai.com/*']
    m.content_scripts = [{ matches: ['https://example.com/*'], js: ['content.js'] }]
    m.options_page = 'options/options.html'
    m.side_panel = { default_path: 'sidebar/sidebar.html' }

    const listing = getStoreListing(m)
    assert.equal(listing.name, 'PageWise')
    assert.equal(listing.isValid, true)
    assert.equal(listing.hostPermissions.length, 2)
    assert.equal(listing.category, 'Productivity')
  })
})
