/**
 * BookmarkSecurityAudit — Chrome 扩展安全审计模块
 *
 * 对 manifest.json 进行全面安全审计，包括权限最小化检查、内容脚本安全评估、
 * Content Security Policy 校验，并生成结构化安全报告。
 *
 * 审计范围:
 *   - 权限审计：检测过度权限请求、危险权限、host_permissions 范围
 *   - 内容脚本审计：检测 <all_urls>、run_at 安全性、web_accessible_resources
 *   - CSP 审计：检测缺失 CSP、unsafe-eval、unsafe-inline
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 * - 所有函数为纯函数，接受 manifest 对象作为参数
 */

// ==================== Constants ====================

/** 高危权限 — Chrome Web Store 审核重点关注 */
const DANGEROUS_PERMISSIONS = Object.freeze([
  'debugger',
  'pageCapture',
  'webRequest',
  'webRequestBlocking',
  'declarativeNetRequest',
  'desktopCapture',
  'nativeMessaging',
  'geolocation',
  'notifications',
  'clipboardRead',
  'clipboardWrite',
])

/** 广泛权限 — 允许但需要正当理由 */
const BROAD_PERMISSIONS = Object.freeze([
  'tabs',
  'history',
  'topSites',
  'browsingData',
  'downloads',
])

/** 敏感主机模式 — 过于宽泛 */
const WILDCARD_HOST_PATTERNS = Object.freeze([
  '<all_urls>',
  '*://*/*',
  '*://*/',
  'http://*/*',
  'https://*/*',
])

/** CSP 中不安全的指令值 */
const UNSAFE_CSP_VALUES = Object.freeze([
  "'unsafe-eval'",
  "'unsafe-inline'",
  'data:',
  '*',
])

/** 最小安全 CSP 策略 */
const MINIMAL_CSP = "script-src 'self'; object-src 'self';"

// ==================== Permission Audit ====================

/**
 * 审计 manifest 中的权限配置
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ passed: boolean, issues: string[], warnings: string[], recommendations: string[] }}
 */
export function auditPermissions(manifest) {
  const issues = []
  const warnings = []
  const recommendations = []

  if (!manifest || typeof manifest !== 'object') {
    return {
      passed: false,
      issues: ['manifest must be a non-null object'],
      warnings,
      recommendations,
    }
  }

  // ── permissions ──
  const perms = manifest.permissions
  if (!Array.isArray(perms)) {
    if (perms !== undefined) {
      issues.push('permissions field is not an array')
    }
  } else {
    // 检查高危权限
    for (const perm of perms) {
      if (DANGEROUS_PERMISSIONS.includes(perm)) {
        issues.push(`dangerous permission detected: "${perm}"`)
      }
    }

    // 检查广泛权限
    for (const perm of perms) {
      if (BROAD_PERMISSIONS.includes(perm)) {
        warnings.push(`broad permission detected: "${perm}" — verify necessity`)
      }
    }

    // 权限数量过多
    if (perms.length > 8) {
      warnings.push(`high permission count (${perms.length}) — consider reducing to minimum required`)
    }

    // 推荐使用 activeTab 替代 tabs
    if (perms.includes('tabs') && !perms.includes('activeTab')) {
      recommendations.push('consider using "activeTab" instead of "tabs" for reduced attack surface')
    }
  }

  // ── host_permissions ──
  const hostPerms = manifest.host_permissions
  if (Array.isArray(hostPerms)) {
    for (const pattern of hostPerms) {
      if (WILDCARD_HOST_PATTERNS.includes(pattern)) {
        issues.push(`overly broad host_permission: "${pattern}" — grants access to all websites`)
      }
    }

    // 检查 http 明文
    for (const pattern of hostPerms) {
      if (pattern.startsWith('http://') && !pattern.startsWith('http://localhost') && !pattern.startsWith('http://127.0.0.1')) {
        warnings.push(`host_permission uses insecure HTTP: "${pattern}"`)
      }
    }
  }

  if (issues.length === 0 && warnings.length === 0) {
    recommendations.push('permissions look clean — no excessive access detected')
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    recommendations,
  }
}

// ==================== Content Script Audit ====================

/**
 * 审计 manifest 中的内容脚本安全性
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ passed: boolean, issues: string[], warnings: string[], recommendations: string[] }}
 */
export function auditContentScripts(manifest) {
  const issues = []
  const warnings = []
  const recommendations = []

  if (!manifest || typeof manifest !== 'object') {
    return {
      passed: false,
      issues: ['manifest must be a non-null object'],
      warnings,
      recommendations,
    }
  }

  // ── content_scripts ──
  const contentScripts = manifest.content_scripts
  if (Array.isArray(contentScripts)) {
    for (let i = 0; i < contentScripts.length; i++) {
      const cs = contentScripts[i]
      const prefix = `content_scripts[${i}]`

      // matches 检查
      if (Array.isArray(cs.matches)) {
        for (const match of cs.matches) {
          if (match === '<all_urls>' || match === '*://*/*') {
            issues.push(`${prefix} matches "${match}" — injects into every page, restrict to specific domains`)
          }
        }
      } else if (!cs.matches) {
        issues.push(`${prefix} has no matches defined`)
      }

      // run_at 检查
      if (cs.run_at === 'document_start') {
        warnings.push(`${prefix} runs at document_start — may interfere with page loading`)
      }

      // all_frames 检查
      if (cs.all_frames === true) {
        warnings.push(`${prefix} has all_frames=true — runs in iframes too, verify necessity`)
      }
    }

    if (contentScripts.length > 3) {
      warnings.push(`high content script count (${contentScripts.length}) — may impact performance`)
    }
  }

  // ── web_accessible_resources ──
  const war = manifest.web_accessible_resources
  if (Array.isArray(war)) {
    for (let i = 0; i < war.length; i++) {
      const resource = war[i]
      const prefix = `web_accessible_resources[${i}]`

      if (Array.isArray(resource.matches)) {
        for (const match of resource.matches) {
          if (match === '<all_urls>' || match === '*://*/*') {
            warnings.push(`${prefix} matches "${match}" — exposes resources to all websites`)
          }
        }
      }

      // 检查是否暴露了可执行脚本
      if (Array.isArray(resource.resources)) {
        for (const res of resource.resources) {
          if (res.endsWith('.js') || res.endsWith('.mjs')) {
            warnings.push(`${prefix} exposes script "${res}" — may be used for fingerprinting or attacks`)
          }
        }
      }
    }
  }

  if (issues.length === 0) {
    recommendations.push('content scripts use specific domain matching — good practice')
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    recommendations,
  }
}

// ==================== CSP Audit ====================

/**
 * 审计 manifest 中的 Content Security Policy
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ passed: boolean, issues: string[], warnings: string[], recommendations: string[] }}
 */
export function auditCSP(manifest) {
  const issues = []
  const warnings = []
  const recommendations = []

  if (!manifest || typeof manifest !== 'object') {
    return {
      passed: false,
      issues: ['manifest must be a non-null object'],
      warnings,
      recommendations,
    }
  }

  const csp = manifest.content_security_policy

  // ── CSP 缺失 ──
  if (!csp) {
    issues.push('no content_security_policy defined — extension pages may be vulnerable to XSS')
    recommendations.push('add CSP: "extension_pages": "' + MINIMAL_CSP + '"')
    return { passed: false, issues, warnings, recommendations }
  }

  // ── CSP 类型检查 ──
  if (typeof csp === 'string') {
    // MV2 style string CSP
    warnings.push('CSP is a string (MV2 style) — Manifest V3 should use object format')
    checkCSPDirectives(csp, issues, warnings)
  } else if (typeof csp === 'object') {
    // MV3 object CSP
    if (csp.extension_pages) {
      checkCSPDirectives(csp.extension_pages, issues, warnings)
    } else {
      issues.push('content_security_policy is missing "extension_pages" directive')
    }

    if (csp.sandbox) {
      checkCSPDirectives(csp.sandbox, issues, warnings, 'sandbox')
    }

    // 检查 MV3 不应使用的 directive
    if (csp.content_scripts) {
      warnings.push('CSP "content_scripts" directive is MV2-only — ignored in Manifest V3')
    }
  } else {
    issues.push('content_security_policy has unexpected type')
  }

  if (issues.length === 0) {
    recommendations.push('CSP policy looks secure')
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    recommendations,
  }
}

/**
 * 检查单个 CSP 指令中的不安全值
 *
 * @param {string} policy - CSP 策略字符串
 * @param {string[]} issues - 问题列表（会被修改）
 * @param {string[]} warnings - 警告列表（会被修改）
 * @param {string} [label] - 可选标识
 */
function checkCSPDirectives(policy, issues, warnings, label) {
  if (typeof policy !== 'string') {
    issues.push(`CSP ${label || 'extension_pages'} value is not a string`)
    return
  }

  const prefix = label ? `CSP [${label}]` : 'CSP'

  // 检查 unsafe-eval
  if (policy.includes("'unsafe-eval'")) {
    issues.push(`${prefix} contains 'unsafe-eval' — allows code injection via eval()`)
  }

  // 检查 unsafe-inline
  if (policy.includes("'unsafe-inline'")) {
    issues.push(`${prefix} contains 'unsafe-inline' — allows inline script injection`)
  }

  // 检查 data: 源
  if (policy.includes('data:')) {
    warnings.push(`${prefix} allows 'data:' URIs — potential XSS vector`)
  }

  // 检查通配符源
  const directives = policy.split(';').map(d => d.trim())
  for (const directive of directives) {
    if (directive.includes('*') && !directive.includes("'self'")) {
      warnings.push(`${prefix} directive uses wildcard: "${directive.trim()}"`)
    }
  }

  // 检查是否有 script-src
  const hasScriptSrc = directives.some(d => d.startsWith('script-src'))
  if (!hasScriptSrc) {
    warnings.push(`${prefix} does not define script-src — falls back to default-src`)
  }

  // 检查是否有 object-src
  const hasObjectSrc = directives.some(d => d.startsWith('object-src'))
  if (!hasObjectSrc) {
    warnings.push(`${prefix} does not define object-src — plugins may be loaded`)
  }
}

// ==================== Full Security Report ====================

/**
 * 生成完整的安全审计报告
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ passed: boolean, issues: string[], warnings: string[], recommendations: string[] }}
 */
export function generateSecurityReport(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return {
      passed: false,
      issues: ['manifest must be a non-null object'],
      warnings: [],
      recommendations: [],
    }
  }

  const permResult = auditPermissions(manifest)
  const csResult = auditContentScripts(manifest)
  const cspResult = auditCSP(manifest)

  const allIssues = [
    ...permResult.issues,
    ...csResult.issues,
    ...cspResult.issues,
  ]

  const allWarnings = [
    ...permResult.warnings,
    ...csResult.warnings,
    ...cspResult.warnings,
  ]

  const allRecommendations = [
    ...permResult.recommendations,
    ...csResult.recommendations,
    ...cspResult.recommendations,
  ]

  return {
    passed: allIssues.length === 0,
    issues: allIssues,
    warnings: allWarnings,
    recommendations: allRecommendations,
  }
}

// ==================== Exports ====================

export {
  DANGEROUS_PERMISSIONS,
  BROAD_PERMISSIONS,
  WILDCARD_HOST_PATTERNS,
  UNSAFE_CSP_VALUES,
  MINIMAL_CSP,
}
