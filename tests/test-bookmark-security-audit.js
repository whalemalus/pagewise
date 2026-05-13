/**
 * Tests for BookmarkSecurityAudit — 安全审计模块
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  auditPermissions,
  auditContentScripts,
  auditCSP,
  generateSecurityReport,
  DANGEROUS_PERMISSIONS,
  BROAD_PERMISSIONS,
  WILDCARD_HOST_PATTERNS,
  UNSAFE_CSP_VALUES,
  MINIMAL_CSP,
} from '../lib/bookmark-security-audit.js'

// ==================== Test Fixtures ====================

function createCleanManifest() {
  return {
    manifest_version: 3,
    name: 'PageWise',
    version: '2.4.0',
    description: 'AI-powered browsing assistant',
    icons: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' },
    permissions: ['storage', 'activeTab', 'sidePanel', 'contextMenus'],
    host_permissions: [
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
    ],
    content_scripts: [
      {
        matches: ['https://example.com/*'],
        js: ['content/content.js'],
        run_at: 'document_idle',
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    background: {
      service_worker: 'background/service-worker.js',
      type: 'module',
    },
  }
}

function createDangerousManifest() {
  return {
    manifest_version: 3,
    name: 'DangerousExt',
    version: '1.0.0',
    description: 'A dangerous extension',
    permissions: ['debugger', 'tabs', 'pageCapture', 'webRequest', 'desktopCapture', 'nativeMessaging', 'geolocation', 'notifications', 'history'],
    host_permissions: ['<all_urls>'],
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        run_at: 'document_start',
        all_frames: true,
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'unsafe-eval' 'unsafe-inline'; object-src *;",
    },
    web_accessible_resources: [
      {
        resources: ['lib/helper.js', 'lib/utils.mjs'],
        matches: ['<all_urls>'],
      },
    ],
  }
}

// ==================== auditPermissions ====================

describe('auditPermissions', () => {
  it('passes with minimal safe permissions', () => {
    const result = auditPermissions(createCleanManifest())
    assert.equal(result.passed, true)
    assert.equal(result.issues.length, 0)
  })

  it('fails for null manifest', () => {
    const result = auditPermissions(null)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('non-null object')))
  })

  it('fails for undefined manifest', () => {
    const result = auditPermissions(undefined)
    assert.equal(result.passed, false)
  })

  it('fails for non-object manifest', () => {
    const result = auditPermissions('bad')
    assert.equal(result.passed, false)
  })

  it('detects dangerous permissions', () => {
    const m = createCleanManifest()
    m.permissions = ['storage', 'debugger']
    const result = auditPermissions(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('dangerous') && i.includes('debugger')))
  })

  it('detects multiple dangerous permissions', () => {
    const m = createDangerousManifest()
    const result = auditPermissions(m)
    assert.equal(result.passed, false)
    const dangerousNames = DANGEROUS_PERMISSIONS.filter(p => m.permissions.includes(p))
    for (const name of dangerousNames) {
      assert.ok(result.issues.some(i => i.includes(name)), `should detect: ${name}`)
    }
  })

  it('warns on broad permissions', () => {
    const m = createCleanManifest()
    m.permissions = ['storage', 'tabs', 'history']
    const result = auditPermissions(m)
    assert.ok(result.warnings.some(w => w.includes('broad') && w.includes('tabs')))
    assert.ok(result.warnings.some(w => w.includes('broad') && w.includes('history')))
  })

  it('warns on high permission count', () => {
    const m = createCleanManifest()
    m.permissions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
    const result = auditPermissions(m)
    assert.ok(result.warnings.some(w => w.includes('high permission count')))
  })

  it('does not warn on 8 or fewer permissions', () => {
    const m = createCleanManifest()
    m.permissions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const result = auditPermissions(m)
    assert.ok(!result.warnings.some(w => w.includes('high permission count')))
  })

  it('recommends activeTab when tabs is used without activeTab', () => {
    const m = createCleanManifest()
    m.permissions = ['storage', 'tabs']
    const result = auditPermissions(m)
    assert.ok(result.recommendations.some(r => r.includes('activeTab')))
  })

  it('does not recommend activeTab when already present', () => {
    const m = createCleanManifest()
    m.permissions = ['storage', 'tabs', 'activeTab']
    const result = auditPermissions(m)
    assert.ok(!result.recommendations.some(r => r.includes('activeTab')))
  })

  it('detects wildcard host_permissions', () => {
    const m = createCleanManifest()
    m.host_permissions = ['<all_urls>']
    const result = auditPermissions(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('overly broad') && i.includes('<all_urls>')))
  })

  it('detects *://*/* host_permissions', () => {
    const m = createCleanManifest()
    m.host_permissions = ['*://*/*']
    const result = auditPermissions(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('*://*/*')))
  })

  it('warns on insecure HTTP host_permissions (not localhost)', () => {
    const m = createCleanManifest()
    m.host_permissions = ['http://example.com/*']
    const result = auditPermissions(m)
    assert.ok(result.warnings.some(w => w.includes('insecure HTTP') && w.includes('example.com')))
  })

  it('does not warn on localhost HTTP', () => {
    const m = createCleanManifest()
    m.host_permissions = ['http://localhost/*', 'http://127.0.0.1/*']
    const result = auditPermissions(m)
    assert.ok(!result.warnings.some(w => w.includes('insecure HTTP')))
  })

  it('returns result structure with all fields', () => {
    const result = auditPermissions(createCleanManifest())
    assert.equal(typeof result.passed, 'boolean')
    assert.ok(Array.isArray(result.issues))
    assert.ok(Array.isArray(result.warnings))
    assert.ok(Array.isArray(result.recommendations))
  })

  it('handles missing permissions field', () => {
    const m = createCleanManifest()
    delete m.permissions
    const result = auditPermissions(m)
    assert.equal(result.passed, true)
  })
})

// ==================== auditContentScripts ====================

describe('auditContentScripts', () => {
  it('passes with specific domain matches', () => {
    const result = auditContentScripts(createCleanManifest())
    assert.equal(result.passed, true)
    assert.equal(result.issues.length, 0)
  })

  it('fails for null manifest', () => {
    const result = auditContentScripts(null)
    assert.equal(result.passed, false)
  })

  it('fails for undefined manifest', () => {
    const result = auditContentScripts(undefined)
    assert.equal(result.passed, false)
  })

  it('detects <all_urls> content script matches', () => {
    const m = createCleanManifest()
    m.content_scripts = [{ matches: ['<all_urls>'], js: ['a.js'] }]
    const result = auditContentScripts(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('<all_urls>')))
  })

  it('detects *://*/* content script matches', () => {
    const m = createCleanManifest()
    m.content_scripts = [{ matches: ['*://*/*'], js: ['a.js'] }]
    const result = auditContentScripts(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('*://*/*')))
  })

  it('warns on document_start run_at', () => {
    const m = createCleanManifest()
    m.content_scripts[0].run_at = 'document_start'
    const result = auditContentScripts(m)
    assert.ok(result.warnings.some(w => w.includes('document_start')))
  })

  it('does not warn on document_idle run_at', () => {
    const m = createCleanManifest()
    m.content_scripts[0].run_at = 'document_idle'
    const result = auditContentScripts(m)
    assert.ok(!result.warnings.some(w => w.includes('document_start')))
  })

  it('warns on all_frames=true', () => {
    const m = createCleanManifest()
    m.content_scripts[0].all_frames = true
    const result = auditContentScripts(m)
    assert.ok(result.warnings.some(w => w.includes('all_frames')))
  })

  it('detects missing matches in content script', () => {
    const m = createCleanManifest()
    m.content_scripts = [{ js: ['a.js'] }]
    const result = auditContentScripts(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('no matches')))
  })

  it('warns on web_accessible_resources with <all_urls>', () => {
    const m = createCleanManifest()
    m.web_accessible_resources = [{ resources: ['icon.png'], matches: ['<all_urls>'] }]
    const result = auditContentScripts(m)
    assert.ok(result.warnings.some(w => w.includes('web_accessible_resources') && w.includes('<all_urls>')))
  })

  it('warns when web_accessible_resources exposes .js files', () => {
    const m = createCleanManifest()
    m.web_accessible_resources = [{ resources: ['lib/helper.js'], matches: ['https://example.com/*'] }]
    const result = auditContentScripts(m)
    assert.ok(result.warnings.some(w => w.includes('helper.js') && w.includes('script')))
  })

  it('warns when web_accessible_resources exposes .mjs files', () => {
    const m = createCleanManifest()
    m.web_accessible_resources = [{ resources: ['lib/util.mjs'], matches: ['https://example.com/*'] }]
    const result = auditContentScripts(m)
    assert.ok(result.warnings.some(w => w.includes('util.mjs')))
  })

  it('warns on high content script count', () => {
    const m = createCleanManifest()
    m.content_scripts = [
      { matches: ['https://a.com/*'], js: ['a.js'] },
      { matches: ['https://b.com/*'], js: ['b.js'] },
      { matches: ['https://c.com/*'], js: ['c.js'] },
      { matches: ['https://d.com/*'], js: ['d.js'] },
    ]
    const result = auditContentScripts(m)
    assert.ok(result.warnings.some(w => w.includes('high content script count')))
  })

  it('returns result structure with all fields', () => {
    const result = auditContentScripts(createCleanManifest())
    assert.equal(typeof result.passed, 'boolean')
    assert.ok(Array.isArray(result.issues))
    assert.ok(Array.isArray(result.warnings))
    assert.ok(Array.isArray(result.recommendations))
  })
})

// ==================== auditCSP ====================

describe('auditCSP', () => {
  it('passes with valid MV3 CSP', () => {
    const result = auditCSP(createCleanManifest())
    assert.equal(result.passed, true)
    assert.equal(result.issues.length, 0)
  })

  it('fails for null manifest', () => {
    const result = auditCSP(null)
    assert.equal(result.passed, false)
  })

  it('fails for undefined manifest', () => {
    const result = auditCSP(undefined)
    assert.equal(result.passed, false)
  })

  it('fails when CSP is missing', () => {
    const m = createCleanManifest()
    delete m.content_security_policy
    const result = auditCSP(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('no content_security_policy')))
    assert.ok(result.recommendations.some(r => r.includes(MINIMAL_CSP)))
  })

  it('fails when CSP contains unsafe-eval', () => {
    const m = createCleanManifest()
    m.content_security_policy = {
      extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self';",
    }
    const result = auditCSP(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('unsafe-eval')))
  })

  it('fails when CSP contains unsafe-inline', () => {
    const m = createCleanManifest()
    m.content_security_policy = {
      extension_pages: "script-src 'self' 'unsafe-inline'; object-src 'self';",
    }
    const result = auditCSP(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('unsafe-inline')))
  })

  it('fails when CSP contains both unsafe-eval and unsafe-inline', () => {
    const m = createCleanManifest()
    m.content_security_policy = {
      extension_pages: "script-src 'self' 'unsafe-eval' 'unsafe-inline'; object-src 'self';",
    }
    const result = auditCSP(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('unsafe-eval')))
    assert.ok(result.issues.some(i => i.includes('unsafe-inline')))
  })

  it('warns when CSP allows data: URIs', () => {
    const m = createCleanManifest()
    m.content_security_policy = {
      extension_pages: "script-src 'self' data:; object-src 'self';",
    }
    const result = auditCSP(m)
    assert.ok(result.warnings.some(w => w.includes('data:')))
  })

  it('warns on MV2-style string CSP', () => {
    const m = createCleanManifest()
    m.content_security_policy = "script-src 'self'; object-src 'self';"
    const result = auditCSP(m)
    assert.ok(result.warnings.some(w => w.includes('MV2 style')))
  })

  it('fails when extension_pages is missing in object CSP', () => {
    const m = createCleanManifest()
    m.content_security_policy = { sandbox: "script-src 'self';" }
    const result = auditCSP(m)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('missing "extension_pages"')))
  })

  it('warns on content_scripts CSP directive (MV2-only)', () => {
    const m = createCleanManifest()
    m.content_security_policy = {
      extension_pages: "script-src 'self'; object-src 'self';",
      content_scripts: "script-src 'self';",
    }
    const result = auditCSP(m)
    assert.ok(result.warnings.some(w => w.includes('content_scripts') && w.includes('MV2-only')))
  })

  it('warns when script-src is missing', () => {
    const m = createCleanManifest()
    m.content_security_policy = {
      extension_pages: "object-src 'self';",
    }
    const result = auditCSP(m)
    assert.ok(result.warnings.some(w => w.includes('does not define script-src')))
  })

  it('warns when object-src is missing', () => {
    const m = createCleanManifest()
    m.content_security_policy = {
      extension_pages: "script-src 'self';",
    }
    const result = auditCSP(m)
    assert.ok(result.warnings.some(w => w.includes('does not define object-src')))
  })

  it('warns on wildcard in CSP directive', () => {
    const m = createCleanManifest()
    m.content_security_policy = {
      extension_pages: "script-src *; object-src 'self';",
    }
    const result = auditCSP(m)
    assert.ok(result.warnings.some(w => w.includes('wildcard')))
  })

  it('returns result structure with all fields', () => {
    const result = auditCSP(createCleanManifest())
    assert.equal(typeof result.passed, 'boolean')
    assert.ok(Array.isArray(result.issues))
    assert.ok(Array.isArray(result.warnings))
    assert.ok(Array.isArray(result.recommendations))
  })
})

// ==================== generateSecurityReport ====================

describe('generateSecurityReport', () => {
  it('passes for clean manifest', () => {
    const result = generateSecurityReport(createCleanManifest())
    assert.equal(result.passed, true)
    assert.equal(result.issues.length, 0)
  })

  it('fails for null manifest', () => {
    const result = generateSecurityReport(null)
    assert.equal(result.passed, false)
  })

  it('fails for undefined manifest', () => {
    const result = generateSecurityReport(undefined)
    assert.equal(result.passed, false)
  })

  it('aggregates all issues from sub-audits', () => {
    const m = createDangerousManifest()
    const result = generateSecurityReport(m)
    assert.equal(result.passed, false)
    // Should have permission issues
    assert.ok(result.issues.some(i => i.includes('dangerous')))
    // Should have content script issues
    assert.ok(result.issues.some(i => i.includes('<all_urls>')))
    // Should have CSP issues
    assert.ok(result.issues.some(i => i.includes('unsafe-eval') || i.includes('unsafe-inline')))
  })

  it('includes warnings from all audit areas', () => {
    const m = createDangerousManifest()
    const result = generateSecurityReport(m)
    assert.ok(result.warnings.length > 0)
    // Should have content script warnings
    assert.ok(result.warnings.some(w => w.includes('document_start') || w.includes('all_frames')))
    // Should have web_accessible_resources warnings
    assert.ok(result.warnings.some(w => w.includes('.js') || w.includes('web_accessible_resources')))
  })

  it('includes recommendations from all audit areas', () => {
    const result = generateSecurityReport(createCleanManifest())
    assert.ok(result.recommendations.length > 0)
  })

  it('returns zero issues for a fully clean manifest', () => {
    const m = createCleanManifest()
    const result = generateSecurityReport(m)
    assert.equal(result.passed, true)
    assert.equal(result.issues.length, 0)
  })

  it('handles manifest with no permissions or CSP', () => {
    const m = {
      manifest_version: 3,
      name: 'Minimal',
      version: '1.0.0',
      description: 'A minimal extension',
    }
    const result = generateSecurityReport(m)
    // Missing CSP should be an issue
    assert.ok(result.issues.some(i => i.includes('content_security_policy')))
  })

  it('returns result structure with all fields', () => {
    const result = generateSecurityReport(createCleanManifest())
    assert.equal(typeof result.passed, 'boolean')
    assert.ok(Array.isArray(result.issues))
    assert.ok(Array.isArray(result.warnings))
    assert.ok(Array.isArray(result.recommendations))
  })

  it('reports dangerous manifest as not passed', () => {
    const result = generateSecurityReport(createDangerousManifest())
    assert.equal(result.passed, false)
    assert.ok(result.issues.length >= 3, 'should have multiple issues')
  })
})

// ==================== Constants Exports ====================

describe('exported constants', () => {
  it('exports DANGEROUS_PERMISSIONS as frozen array', () => {
    assert.ok(Array.isArray(DANGEROUS_PERMISSIONS))
    assert.ok(DANGEROUS_PERMISSIONS.includes('debugger'))
    assert.ok(DANGEROUS_PERMISSIONS.includes('nativeMessaging'))
    assert.throws(() => { DANGEROUS_PERMISSIONS.push('x') })
  })

  it('exports BROAD_PERMISSIONS as frozen array', () => {
    assert.ok(Array.isArray(BROAD_PERMISSIONS))
    assert.ok(BROAD_PERMISSIONS.includes('tabs'))
    assert.throws(() => { BROAD_PERMISSIONS.push('x') })
  })

  it('exports WILDCARD_HOST_PATTERNS as frozen array', () => {
    assert.ok(Array.isArray(WILDCARD_HOST_PATTERNS))
    assert.ok(WILDCARD_HOST_PATTERNS.includes('<all_urls>'))
    assert.throws(() => { WILDCARD_HOST_PATTERNS.push('x') })
  })

  it('exports UNSAFE_CSP_VALUES', () => {
    assert.ok(Array.isArray(UNSAFE_CSP_VALUES))
    assert.ok(UNSAFE_CSP_VALUES.includes("'unsafe-eval'"))
    assert.ok(UNSAFE_CSP_VALUES.includes("'unsafe-inline'"))
  })

  it('exports MINIMAL_CSP string', () => {
    assert.equal(typeof MINIMAL_CSP, 'string')
    assert.ok(MINIMAL_CSP.includes("'self'"))
  })
})
