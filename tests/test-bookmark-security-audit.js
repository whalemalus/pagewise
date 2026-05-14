/**
 * 测试 lib/bookmark-security-audit.js — Chrome 扩展安全审计模块
 *
 * 测试范围:
 *   常量导出 / 权限审计 / 内容脚本审计 / CSP 审计 / 综合报告 / 边界情况
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  auditPermissions,
  auditContentScripts,
  auditCSP,
  generateSecurityReport,
  DANGEROUS_PERMISSIONS,
  BROAD_PERMISSIONS,
  WILDCARD_HOST_PATTERNS,
  UNSAFE_CSP_VALUES,
  MINIMAL_CSP,
} = await import('../lib/bookmark-security-audit.js')

// ==================== 辅助函数 ====================

function minimalManifest(overrides = {}) {
  return {
    manifest_version: 3,
    name: 'Test Extension',
    version: '1.0.0',
    permissions: ['storage'],
    content_scripts: [{
      matches: ['https://example.com/*'],
      js: ['content.js'],
    }],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    ...overrides,
  }
}

// ==================== 常量导出测试 ====================

describe('常量导出', () => {
  it('DANGEROUS_PERMISSIONS 是冻结数组', () => {
    assert.ok(Array.isArray(DANGEROUS_PERMISSIONS))
    assert.ok(DANGEROUS_PERMISSIONS.length > 0)
    assert.ok(Object.isFrozen(DANGEROUS_PERMISSIONS))
  })

  it('BROAD_PERMISSIONS 是冻结数组', () => {
    assert.ok(Array.isArray(BROAD_PERMISSIONS))
    assert.ok(Object.isFrozen(BROAD_PERMISSIONS))
  })

  it('WILDCARD_HOST_PATTERNS 包含 <all_urls>', () => {
    assert.ok(WILDCARD_HOST_PATTERNS.includes('<all_urls>'))
    assert.ok(WILDCARD_HOST_PATTERNS.includes('*://*/*'))
  })

  it('UNSAFE_CSP_VALUES 包含 unsafe-eval', () => {
    assert.ok(UNSAFE_CSP_VALUES.includes("'unsafe-eval'"))
    assert.ok(UNSAFE_CSP_VALUES.includes("'unsafe-inline'"))
  })

  it('MINIMAL_CSP 是安全字符串', () => {
    assert.equal(typeof MINIMAL_CSP, 'string')
    assert.ok(MINIMAL_CSP.includes("'self'"))
    assert.ok(!MINIMAL_CSP.includes('unsafe'))
  })
})

// ==================== 权限审计测试 ====================

describe('auditPermissions', () => {
  it('安全权限配置应通过', () => {
    const manifest = minimalManifest({ permissions: ['storage', 'activeTab'] })
    const result = auditPermissions(manifest)
    assert.equal(result.passed, true)
    assert.equal(result.issues.length, 0)
  })

  it('检测高危权限 debugger', () => {
    const manifest = minimalManifest({ permissions: ['storage', 'debugger'] })
    const result = auditPermissions(manifest)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('debugger')))
  })

  it('检测高危权限 nativeMessaging', () => {
    const manifest = minimalManifest({ permissions: ['nativeMessaging'] })
    const result = auditPermissions(manifest)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('nativeMessaging')))
  })

  it('检测广泛权限 tabs 并给出警告', () => {
    const manifest = minimalManifest({ permissions: ['tabs'] })
    const result = auditPermissions(manifest)
    assert.ok(result.warnings.some(w => w.includes('tabs')))
    // 没有 activeTab 时给出建议
    assert.ok(result.recommendations.some(r => r.includes('activeTab')))
  })

  it('权限数量过多 (>8) 触发警告', () => {
    const manyPerms = ['storage', 'tabs', 'bookmarks', 'history', 'activeTab', 'alarms', 'notifications', 'clipboardWrite', 'geolocation']
    const manifest = minimalManifest({ permissions: manyPerms })
    const result = auditPermissions(manifest)
    assert.ok(result.warnings.some(w => w.includes('high permission count')))
  })

  it('检测过度宽泛的 host_permissions', () => {
    const manifest = minimalManifest({ host_permissions: ['<all_urls>'] })
    const result = auditPermissions(manifest)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('<all_urls>')))
  })

  it('检测 HTTP 明文 host_permission', () => {
    const manifest = minimalManifest({ host_permissions: ['http://example.com/*'] })
    const result = auditPermissions(manifest)
    assert.ok(result.warnings.some(w => w.includes('insecure HTTP')))
  })

  it('允许 localhost HTTP', () => {
    const manifest = minimalManifest({ host_permissions: ['http://localhost/*'] })
    const result = auditPermissions(manifest)
    assert.ok(!result.warnings.some(w => w.includes('insecure HTTP')))
  })

  it('null manifest 返回失败', () => {
    const result = auditPermissions(null)
    assert.equal(result.passed, false)
    assert.ok(result.issues.length > 0)
  })

  it('permissions 非数组时检测', () => {
    const manifest = minimalManifest({ permissions: 'storage' })
    const result = auditPermissions(manifest)
    assert.ok(result.issues.some(i => i.includes('not an array')))
  })
})

// ==================== 内容脚本审计测试 ====================

describe('auditContentScripts', () => {
  it('安全的内容脚本配置应通过', () => {
    const manifest = minimalManifest()
    const result = auditContentScripts(manifest)
    assert.equal(result.passed, true)
  })

  it('检测 <all_urls> matches', () => {
    const manifest = minimalManifest({
      content_scripts: [{
        matches: ['<all_urls>'],
        js: ['content.js'],
      }],
    })
    const result = auditContentScripts(manifest)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('<all_urls>')))
  })

  it('检测 *://*/* matches', () => {
    const manifest = minimalManifest({
      content_scripts: [{
        matches: ['*://*/*'],
        js: ['content.js'],
      }],
    })
    const result = auditContentScripts(manifest)
    assert.equal(result.passed, false)
  })

  it('检测 document_start 警告', () => {
    const manifest = minimalManifest({
      content_scripts: [{
        matches: ['https://example.com/*'],
        js: ['content.js'],
        run_at: 'document_start',
      }],
    })
    const result = auditContentScripts(manifest)
    assert.ok(result.warnings.some(w => w.includes('document_start')))
  })

  it('检测 all_frames=true 警告', () => {
    const manifest = minimalManifest({
      content_scripts: [{
        matches: ['https://example.com/*'],
        js: ['content.js'],
        all_frames: true,
      }],
    })
    const result = auditContentScripts(manifest)
    assert.ok(result.warnings.some(w => w.includes('all_frames')))
  })

  it('内容脚本过多 (>3) 触发警告', () => {
    const manifest = minimalManifest({
      content_scripts: [
        { matches: ['https://a.com/*'], js: ['a.js'] },
        { matches: ['https://b.com/*'], js: ['b.js'] },
        { matches: ['https://c.com/*'], js: ['c.js'] },
        { matches: ['https://d.com/*'], js: ['d.js'] },
      ],
    })
    const result = auditContentScripts(manifest)
    assert.ok(result.warnings.some(w => w.includes('high content script count')))
  })

  it('检测暴露 JS 资源的 web_accessible_resources', () => {
    const manifest = minimalManifest({
      web_accessible_resources: [{
        matches: ['https://example.com/*'],
        resources: ['lib/injected.js'],
      }],
    })
    const result = auditContentScripts(manifest)
    assert.ok(result.warnings.some(w => w.includes('exposes script')))
  })

  it('null manifest 返回失败', () => {
    const result = auditContentScripts(null)
    assert.equal(result.passed, false)
  })

  it('安全配置给出正面建议', () => {
    const manifest = minimalManifest()
    const result = auditContentScripts(manifest)
    assert.ok(result.recommendations.some(r => r.includes('specific domain')))
  })
})

// ==================== CSP 审计测试 ====================

describe('auditCSP', () => {
  it('安全 CSP 应通过', () => {
    const manifest = minimalManifest()
    const result = auditCSP(manifest)
    assert.equal(result.passed, true)
    assert.ok(result.recommendations.some(r => r.includes('secure')))
  })

  it('检测缺失 CSP', () => {
    const manifest = minimalManifest({ content_security_policy: undefined })
    const result = auditCSP(manifest)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('no content_security_policy')))
  })

  it('检测 unsafe-eval', () => {
    const manifest = minimalManifest({
      content_security_policy: {
        extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self';",
      },
    })
    const result = auditCSP(manifest)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('unsafe-eval')))
  })

  it('检测 unsafe-inline', () => {
    const manifest = minimalManifest({
      content_security_policy: {
        extension_pages: "script-src 'self' 'unsafe-inline'; object-src 'self';",
      },
    })
    const result = auditCSP(manifest)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('unsafe-inline')))
  })

  it('检测 data: 源警告', () => {
    const manifest = minimalManifest({
      content_security_policy: {
        extension_pages: "script-src 'self' data:; object-src 'self';",
      },
    })
    const result = auditCSP(manifest)
    assert.ok(result.warnings.some(w => w.includes('data:')))
  })

  it('MV2 风格字符串 CSP 给出警告', () => {
    const manifest = minimalManifest({
      content_security_policy: "script-src 'self'; object-src 'self';",
    })
    const result = auditCSP(manifest)
    assert.ok(result.warnings.some(w => w.includes('MV2 style')))
  })

  it('MV3 CSP 缺失 extension_pages 检测', () => {
    const manifest = minimalManifest({
      content_security_policy: {
        sandbox: "script-src 'self';",
      },
    })
    const result = auditCSP(manifest)
    assert.ok(result.issues.some(i => i.includes('missing "extension_pages"')))
  })

  it('检测 content_scripts directive (MV2-only)', () => {
    const manifest = minimalManifest({
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self';",
        content_scripts: "script-src 'self';",
      },
    })
    const result = auditCSP(manifest)
    assert.ok(result.warnings.some(w => w.includes('MV2-only')))
  })

  it('null manifest 返回失败', () => {
    const result = auditCSP(null)
    assert.equal(result.passed, false)
  })

  it('检测通配符源警告', () => {
    const manifest = minimalManifest({
      content_security_policy: {
        extension_pages: "script-src *; object-src 'self';",
      },
    })
    const result = auditCSP(manifest)
    assert.ok(result.warnings.some(w => w.includes('wildcard')))
  })
})

// ==================== 综合报告测试 ====================

describe('generateSecurityReport', () => {
  it('安全 manifest 生成通过报告', () => {
    const manifest = minimalManifest()
    const result = generateSecurityReport(manifest)
    assert.equal(result.passed, true)
    assert.equal(result.issues.length, 0)
  })

  it('综合报告聚合所有子审计结果', () => {
    const manifest = minimalManifest({
      permissions: ['debugger'],
      host_permissions: ['<all_urls>'],
      content_security_policy: undefined,
    })
    const result = generateSecurityReport(manifest)
    assert.equal(result.passed, false)
    // 应包含来自权限、CSP 的问题
    assert.ok(result.issues.length >= 2)
  })

  it('综合报告包含 warnings 和 recommendations', () => {
    const manifest = minimalManifest({
      permissions: ['tabs'],
    })
    const result = generateSecurityReport(manifest)
    assert.ok(result.warnings.length > 0 || result.recommendations.length > 0)
  })

  it('null manifest 返回失败', () => {
    const result = generateSecurityReport(null)
    assert.equal(result.passed, false)
    assert.ok(result.issues.some(i => i.includes('manifest must be')))
  })

  it('返回值结构完整', () => {
    const result = generateSecurityReport(minimalManifest())
    assert.ok('passed' in result)
    assert.ok(Array.isArray(result.issues))
    assert.ok(Array.isArray(result.warnings))
    assert.ok(Array.isArray(result.recommendations))
  })
})

// ==================== 边界情况测试 ====================

describe('边界情况', () => {
  it('空 permissions 数组不报错', () => {
    const manifest = minimalManifest({ permissions: [] })
    const result = auditPermissions(manifest)
    assert.equal(result.passed, true)
  })

  it('无 content_scripts 字段不报错', () => {
    const manifest = minimalManifest()
    delete manifest.content_scripts
    const result = auditContentScripts(manifest)
    assert.equal(result.passed, true)
  })

  it('无 host_permissions 不报错', () => {
    const manifest = minimalManifest()
    delete manifest.host_permissions
    const result = auditPermissions(manifest)
    assert.equal(result.passed, true)
  })

  it('多个高危权限全部检测', () => {
    const manifest = minimalManifest({
      permissions: ['debugger', 'nativeMessaging', 'geolocation'],
    })
    const result = auditPermissions(manifest)
    assert.equal(result.passed, false)
    assert.ok(result.issues.length >= 3)
  })

  it('sandbox CSP 也被审计', () => {
    const manifest = minimalManifest({
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self';",
        sandbox: "script-src 'self' 'unsafe-eval';",
      },
    })
    const result = auditCSP(manifest)
    assert.ok(result.issues.some(i => i.includes('sandbox')))
  })
})
