/**
 * BookmarkStorePrep — Chrome Web Store 发布准备模块
 *
 * 校验 manifest.json 是否满足 Chrome Web Store 发布要求，检查图标完整性、
 * 权限最小化、描述长度等，并生成商店 listing 元数据。
 *
 * 校验规则:
 *   - manifest_version 必须为 3
 *   - 必须包含 name、version、description
 *   - description 长度不超过 132 字符
 *   - icons 必须包含 16、48、128 三个尺寸
 *   - permissions 不包含高危权限（如 debugger、<all_urls> 等）
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 * - 所有函数为纯函数，接受 manifest 对象作为参数
 */

// ==================== Constants ====================

/** Chrome Web Store 短描述最大长度 */
const MAX_DESCRIPTION_LENGTH = 132

/** Chrome Web Store 要求的图标尺寸 */
const REQUIRED_ICON_SIZES = ['16', '48', '128']

/** Chrome Web Store 审核不允许的高危权限 */
const DANGEROUS_PERMISSIONS = Object.freeze([
  'debugger',
  'pageCapture',
  'webRequest',
  'webRequestBlocking',
  'declarativeNetRequest',
  'desktopCapture',
  'nativeMessaging',
])

/** Chrome Web Store 推荐类别 */
const STORE_CATEGORIES = Object.freeze({
  primary: 'Productivity',
  secondary: 'Developer Tools',
})

/** Chrome Web Store 截图规范 */
const SCREENSHOT_SPECS = Object.freeze({
  promotional: {
    sizes: [{ width: 1400, height: 560 }],
    maxSize: '1MB',
    format: 'PNG or JPEG',
    count: { min: 1, max: 5 },
  },
  screenshots: {
    sizes: [
      { width: 1280, height: 800 },
      { width: 640, height: 400 },
    ],
    maxSize: '2MB',
    format: 'PNG or JPEG',
    count: { min: 1, max: 5 },
  },
})

/** 权限正当理由模板 */
const PERMISSION_JUSTIFICATIONS = Object.freeze({
  storage: '用于在浏览器本地存储用户设置、对话历史和知识库数据。',
  sidePanel: '用于在浏览器侧边栏中显示 AI 问答面板，提供沉浸式阅读交互体验。',
  contextMenus: '用于在右键菜单中添加"向 AI 提问"等快捷操作入口。',
  tabs: '用于获取当前标签页的 URL 和标题，以便 AI 理解用户正在阅读的页面上下文。',
  activeTab: '用于仅在用户主动操作时访问当前标签页内容，遵循最小权限原则。',
  bookmarks: '用于读取和管理浏览器书签，实现书签智能分析和知识图谱功能。',
  notifications: '用于在死链检测完成、新书签等事件时向用户推送浏览器通知。',
  alarms: '用于设置定时任务，如定期链接检查、自动备份等周期性操作。',
})

/** CSP 安全策略要求 */
const CSP_REQUIREMENTS = Object.freeze({
  required: ["script-src 'self'", "object-src 'self'"],
  forbidden: ["'unsafe-eval'", "'unsafe-inline'", 'data:', 'http:', 'https:'],
})

// ==================== Core Functions ====================

/**
 * 校验 manifest.json 是否满足 Chrome Web Store 发布要求
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateManifest(manifest) {
  const errors = []
  const warnings = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest must be a non-null object'], warnings }
  }

  // ── manifest_version ──
  if (manifest.manifest_version !== 3) {
    errors.push('manifest_version must be 3 (Manifest V3)')
  }

  // ── name ──
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('name is required and must be a non-empty string')
  }

  // ── version ──
  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('version is required and must be a non-empty string (e.g. "1.0.0")')
  } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    warnings.push('version should follow semver format (e.g. "1.0.0")')
  }

  // ── description ──
  if (!manifest.description || typeof manifest.description !== 'string') {
    errors.push('description is required and must be a non-empty string')
  } else {
    if (manifest.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} chars (got ${manifest.description.length})`)
    }
    if (manifest.description.startsWith('__MSG_') || manifest.description.endsWith('__')) {
      warnings.push('description uses i18n placeholder — Chrome Web Store requires a plain-text description for review')
    }
  }

  // ── icons ──
  const iconResult = checkIcons(manifest)
  errors.push(...iconResult.errors)
  warnings.push(...iconResult.warnings)

  // ── permissions ──
  const perms = manifest.permissions
  if (!Array.isArray(perms)) {
    warnings.push('permissions is not an array — consider explicitly listing required permissions')
  } else {
    for (const perm of perms) {
      if (DANGEROUS_PERMISSIONS.includes(perm)) {
        warnings.push(`permission "${perm}" is considered dangerous — Chrome Web Store review may require justification`)
      }
    }
  }

  // ── host_permissions (informational) ──
  const hostPerms = manifest.host_permissions
  if (Array.isArray(hostPerms)) {
    const allUrls = hostPerms.filter(h => h === '<all_urls>' || h === '*://*/*')
    if (allUrls.length > 0) {
      warnings.push(`host_permissions contains broad pattern "${allUrls[0]}" — may trigger extra review scrutiny`)
    }
  }

  // ── content_scripts ──
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.matches) && cs.matches.includes('<all_urls>')) {
        warnings.push('content_scripts matches "<all_urls>" — consider limiting to specific hosts')
      }
    }
  }

  // ── optional: service_worker ──
  if (!manifest.background) {
    warnings.push('no background service_worker defined')
  } else if (!manifest.background.service_worker) {
    warnings.push('background.service_worker is not set')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 检查 manifest 中的图标是否满足 Chrome Web Store 要求
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ valid: boolean, errors: string[], warnings: string[], found: string[], missing: string[] }}
 */
export function checkIcons(manifest) {
  const errors = []
  const warnings = []
  const found = []
  const missing = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest must be a non-null object'], warnings, found, missing }
  }

  const icons = manifest.icons

  if (!icons || typeof icons !== 'object') {
    for (const size of REQUIRED_ICON_SIZES) {
      missing.push(size)
      errors.push(`missing required icon size: ${size}`)
    }
    return { valid: false, errors, warnings, found, missing }
  }

  for (const size of REQUIRED_ICON_SIZES) {
    if (icons[size] && typeof icons[size] === 'string' && icons[size].length > 0) {
      found.push(size)
    } else {
      missing.push(size)
      errors.push(`missing required icon size: ${size}`)
    }
  }

  // Extra icon sizes are fine but note them
  const extraSizes = Object.keys(icons).filter(s => !REQUIRED_ICON_SIZES.includes(s))
  if (extraSizes.length > 0) {
    warnings.push(`additional icon sizes present: ${extraSizes.join(', ')}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    found,
    missing,
  }
}

/**
 * 根据 manifest 生成 Chrome Web Store listing 元数据
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {object} Store listing metadata
 */
export function getStoreListing(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return {
      name: '',
      version: '',
      description: '',
      shortDescription: '',
      permissions: [],
      hostPermissions: [],
      iconPaths: {},
      category: STORE_CATEGORIES.primary,
      manifestVersion: 0,
      isValid: false,
    }
  }

  const name = manifest.name || ''
  const version = manifest.version || ''
  const rawDescription = manifest.description || ''
  const shortDescription = rawDescription.length > MAX_DESCRIPTION_LENGTH
    ? rawDescription.slice(0, MAX_DESCRIPTION_LENGTH)
    : rawDescription

  const iconPaths = {}
  if (manifest.icons && typeof manifest.icons === 'object') {
    for (const [size, path] of Object.entries(manifest.icons)) {
      iconPaths[size] = path
    }
  }

  const permissions = Array.isArray(manifest.permissions)
    ? [...manifest.permissions]
    : []

  const hostPermissions = Array.isArray(manifest.host_permissions)
    ? [...manifest.host_permissions]
    : []

  const validation = validateManifest(manifest)

  return {
    name,
    version,
    description: rawDescription,
    shortDescription,
    permissions,
    hostPermissions,
    iconPaths,
    category: STORE_CATEGORIES.primary,
    manifestVersion: manifest.manifest_version || 0,
    isValid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
  }
}

// ==================== CSP Validation ====================

/**
 * 校验 manifest 中的 Content Security Policy
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ valid: boolean, errors: string[], warnings: string[], policy: string|null }}
 */
export function validateContentSecurityPolicy(manifest) {
  const errors = []
  const warnings = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest must be a non-null object'], warnings, policy: null }
  }

  const csp = manifest.content_security_policy

  if (!csp) {
    errors.push('content_security_policy is missing — Chrome Web Store requires explicit CSP')
    return { valid: false, errors, warnings, policy: null }
  }

  let policyStr = ''
  if (typeof csp === 'string') {
    policyStr = csp
  } else if (typeof csp === 'object' && csp.extension_pages) {
    policyStr = csp.extension_pages
  } else {
    errors.push('content_security_policy must be a string or object with extension_pages')
    return { valid: false, errors, warnings, policy: null }
  }

  // Check forbidden directives
  for (const forbidden of CSP_REQUIREMENTS.forbidden) {
    if (policyStr.includes(forbidden)) {
      errors.push(`CSP contains forbidden directive: ${forbidden}`)
    }
  }

  // Check required directives
  for (const required of CSP_REQUIREMENTS.required) {
    const directive = required.split(' ')[0]
    if (!policyStr.includes(directive)) {
      warnings.push(`CSP missing recommended directive: ${required}`)
    }
  }

  // Sandbox warning
  if (manifest.content_security_policy.sandbox) {
    warnings.push('CSP has sandbox policy — verify it does not restrict extension functionality')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    policy: policyStr,
  }
}

// ==================== Permission Justification ====================

/**
 * 为 manifest 中的每个权限生成 Chrome Web Store 审核正当理由
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ permissions: Array<{ permission: string, justification: string, hasTemplate: boolean }> }}
 */
export function generatePermissionJustification(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return { permissions: [] }
  }

  const perms = Array.isArray(manifest.permissions) ? manifest.permissions : []
  const result = []

  for (const perm of perms) {
    const template = PERMISSION_JUSTIFICATIONS[perm]
    result.push({
      permission: perm,
      justification: template || `需要 ${perm} 权限以支持扩展功能。请补充具体使用场景说明。`,
      hasTemplate: !!template,
    })
  }

  return { permissions: result }
}

// ==================== Screenshot Spec ====================

/**
 * 返回 Chrome Web Store 截图规范
 *
 * @returns {object} 截图规格信息
 */
export function getScreenshotSpec() {
  return {
    promotional: { ...SCREENSHOT_SPECS.promotional },
    screenshots: { ...SCREENSHOT_SPECS.screenshots },
    tips: [
      '推荐使用 1280×800 分辨率截图',
      '展示核心功能：侧边栏问答、知识图谱、书签分析',
      '截图应清晰展示扩展在真实网页中的使用场景',
      '第一张截图最重要，将显示在商店列表的首位',
      '可在截图中添加简短说明文字',
    ],
  }
}

// ==================== Language Support ====================

/**
 * 从 manifest 和 locales 信息中检测语言支持情况
 *
 * @param {object} manifest - manifest.json 对象
 * @param {object} [localesInfo] - { availableLocales: string[], messagesByLocale: Record<string, object> }
 * @returns {{ defaultLocale: string|null, availableLocales: string[], isIntl: boolean, warnings: string[] }}
 */
export function detectLanguageSupport(manifest, localesInfo) {
  const warnings = []

  if (!manifest || typeof manifest !== 'object') {
    return { defaultLocale: null, availableLocales: [], isIntl: false, warnings: ['manifest is invalid'] }
  }

  const defaultLocale = manifest.default_locale || null

  if (!defaultLocale) {
    warnings.push('default_locale is not set — Chrome Web Store will default to English')
  }

  const availableLocales = (localesInfo && Array.isArray(localesInfo.availableLocales))
    ? localesInfo.availableLocales
    : []

  if (availableLocales.length === 0) {
    warnings.push('no locale files detected — extension will use fallback strings only')
  }

  // Validate each locale has required keys
  if (localesInfo && localesInfo.messagesByLocale) {
    for (const locale of availableLocales) {
      const messages = localesInfo.messagesByLocale[locale]
      if (!messages || typeof messages !== 'object') {
        warnings.push(`locale "${locale}" has no messages`)
        continue
      }
      if (!messages.extName) {
        warnings.push(`locale "${locale}" is missing required key: extName`)
      }
      if (!messages.extDescription) {
        warnings.push(`locale "${locale}" is missing required key: extDescription`)
      }
    }
  }

  return {
    defaultLocale,
    availableLocales: [...availableLocales],
    isIntl: availableLocales.length >= 2,
    warnings,
  }
}

// ==================== Improvement Suggestions ====================

/**
 * 分析 manifest 并生成 Chrome Web Store 改进建议
 *
 * @param {object} manifest - manifest.json 对象
 * @returns {{ suggestions: Array<{ severity: 'error'|'warning'|'info', message: string }>, score: number }}
 */
export function suggestManifestImprovements(manifest) {
  const suggestions = []

  if (!manifest || typeof manifest !== 'object') {
    return { suggestions: [{ severity: 'error', message: 'manifest is invalid' }], score: 0 }
  }

  // ── Required fields ──
  if (!manifest.name) {
    suggestions.push({ severity: 'error', message: 'name is required' })
  }
  if (!manifest.version) {
    suggestions.push({ severity: 'error', message: 'version is required' })
  }
  if (!manifest.description) {
    suggestions.push({ severity: 'error', message: 'description is required' })
  }
  if (!manifest.icons || Object.keys(manifest.icons).length === 0) {
    suggestions.push({ severity: 'error', message: 'icons are required' })
  }

  // ── CSP ──
  if (!manifest.content_security_policy) {
    suggestions.push({ severity: 'error', message: 'add content_security_policy for security' })
  }

  // ── default_locale ──
  if (!manifest.default_locale) {
    suggestions.push({ severity: 'warning', message: 'set default_locale for i18n support' })
  }

  // ── Minimum Chrome version ──
  if (!manifest.minimum_chrome_version) {
    suggestions.push({ severity: 'warning', message: 'set minimum_chrome_version to avoid compatibility issues' })
  }

  // ── Manifest V3 ──
  if (manifest.manifest_version !== 3) {
    suggestions.push({ severity: 'error', message: 'must use Manifest V3 for Chrome Web Store' })
  }

  // ── Content scripts ──
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.matches) && cs.matches.includes('<all_urls>')) {
        suggestions.push({ severity: 'warning', message: 'content_scripts uses <all_urls> — consider limiting scope' })
        break
      }
    }
  }

  // ── Host permissions ──
  if (Array.isArray(manifest.host_permissions)) {
    const broad = manifest.host_permissions.filter(h => h === '<all_urls>' || h === '*://*/*')
    if (broad.length > 0) {
      suggestions.push({ severity: 'warning', message: 'host_permissions has broad patterns — may trigger extra review' })
    }
  }

  // ── Info suggestions ──
  if (!manifest.author) {
    suggestions.push({ severity: 'info', message: 'consider adding author field for credibility' })
  }
  if (!manifest.options_page && !manifest.options_ui) {
    suggestions.push({ severity: 'info', message: 'consider adding options page for user configuration' })
  }
  if (!manifest.action && !manifest.browser_action) {
    suggestions.push({ severity: 'info', message: 'no action/browser_action defined — users may not know how to activate' })
  }

  // Score: 100 = perfect, deductions for each issue
  let score = 100
  for (const s of suggestions) {
    if (s.severity === 'error') score -= 20
    else if (s.severity === 'warning') score -= 10
    else if (s.severity === 'info') score -= 3
  }
  score = Math.max(0, score)

  return { suggestions, score }
}

// ==================== Submission Readiness ====================

/**
 * 综合检查 manifest 是否准备好提交到 Chrome Web Store
 *
 * @param {object} manifest - manifest.json 对象
 * @param {object} [localesInfo] - locales 信息（可选）
 * @returns {{ ready: boolean, score: number, checks: Array<{ id: string, label: string, passed: boolean, detail: string }> }}
 */
export function checkStoreSubmissionReadiness(manifest, localesInfo) {
  const checks = []

  if (!manifest || typeof manifest !== 'object') {
    return {
      ready: false,
      score: 0,
      checks: [{ id: 'manifest-valid', label: 'manifest 有效性', passed: false, detail: 'manifest must be a non-null object' }],
    }
  }

  // 1. Manifest validation
  const validation = validateManifest(manifest)
  checks.push({
    id: 'manifest-valid',
    label: 'manifest.json 格式校验',
    passed: validation.valid,
    detail: validation.valid ? '所有必填字段正确' : `错误: ${validation.errors.join('; ')}`,
  })

  // 2. Icon completeness
  const iconResult = checkIcons(manifest)
  checks.push({
    id: 'icons-complete',
    label: '图标完整性 (16/48/128px)',
    passed: iconResult.valid,
    detail: iconResult.valid ? '所有必需图标尺寸已配置' : `缺少: ${iconResult.missing.join(', ')}`,
  })

  // 3. CSP configuration
  const cspResult = validateContentSecurityPolicy(manifest)
  checks.push({
    id: 'csp-configured',
    label: 'Content Security Policy',
    passed: cspResult.valid,
    detail: cspResult.valid ? 'CSP 安全策略已配置' : `问题: ${cspResult.errors.join('; ')}`,
  })

  // 4. Permission safety
  const perms = Array.isArray(manifest.permissions) ? manifest.permissions : []
  const dangerousFound = perms.filter(p => DANGEROUS_PERMISSIONS.includes(p))
  checks.push({
    id: 'permissions-safe',
    label: '权限安全性检查',
    passed: dangerousFound.length === 0,
    detail: dangerousFound.length === 0 ? '无高危权限' : `包含高危权限: ${dangerousFound.join(', ')}`,
  })

  // 5. Description length
  const desc = manifest.description || ''
  const isI18n = desc.startsWith('__MSG_')
  checks.push({
    id: 'description-valid',
    label: '描述长度检查 (≤132字符)',
    passed: isI18n || (desc.length > 0 && desc.length <= MAX_DESCRIPTION_LENGTH),
    detail: isI18n ? '使用 i18n 占位符（需确保实际翻译≤132字符）' : `长度: ${desc.length}/${MAX_DESCRIPTION_LENGTH}`,
  })

  // 6. Language support
  const langResult = detectLanguageSupport(manifest, localesInfo)
  checks.push({
    id: 'i18n-support',
    label: '多语言支持 (i18n)',
    passed: langResult.availableLocales.length >= 2,
    detail: langResult.availableLocales.length >= 2
      ? `支持 ${langResult.availableLocales.join(', ')}`
      : `仅支持 ${langResult.availableLocales.length} 个语言，建议至少 2 个`,
  })

  // 7. Content scripts safety
  let contentScriptsSafe = true
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.matches) && cs.matches.includes('<all_urls>')) {
        contentScriptsSafe = false
      }
    }
  }
  checks.push({
    id: 'content-scripts-safe',
    label: 'Content Scripts 范围检查',
    passed: contentScriptsSafe,
    detail: contentScriptsSafe ? 'content_scripts 范围合理' : 'content_scripts 使用 <all_urls>，建议缩小范围',
  })

  // 8. Background service worker
  const hasSW = manifest.background && manifest.background.service_worker
  checks.push({
    id: 'service-worker',
    label: 'Background Service Worker',
    passed: !!hasSW,
    detail: hasSW ? `已配置: ${manifest.background.service_worker}` : '未配置 background service_worker',
  })

  // Compute score
  const passed = checks.filter(c => c.passed).length
  const score = Math.round((passed / checks.length) * 100)

  // Ready = all required checks pass (manifest valid + icons + CSP + permissions + description)
  const requiredIds = ['manifest-valid', 'icons-complete', 'csp-configured', 'permissions-safe', 'description-valid']
  const ready = requiredIds.every(id => checks.find(c => c.id === id)?.passed)

  return { ready, score, checks }
}
