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
