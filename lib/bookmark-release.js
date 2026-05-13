/**
 * BookmarkRelease — 版本发布管理模块 (R92)
 *
 * 提供发布验证、版本信息、依赖检查与发布清单功能。
 *
 * 功能:
 *   - validateRelease(manifest, packageJson) — 检查发布就绪状态
 *   - generateReleaseNotes(changelog) — 格式化发布说明
 *   - checkDependencies(packageJson) — 验证依赖完整性
 *   - getVersionInfo(manifest, packageJson) — 获取版本信息
 *   - RELEASE_CHECKLIST — 发布检查清单
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 */

// ==================== 发布检查清单 ====================

/**
 * 标准发布检查清单
 * @type {Array<{ id: string, label: string, category: string }>}
 */
export const RELEASE_CHECKLIST = [
  { id: 'version-match',       label: 'manifest.json 与 package.json 版本号一致',   category: '版本' },
  { id: 'version-valid',       label: '版本号遵循 semver 格式 (x.y.z)',              category: '版本' },
  { id: 'icons-present',       label: '已配置 16/48/128px 图标',                     category: '资源' },
  { id: 'permissions-valid',   label: '权限列表合理，无多余权限',                       category: '权限' },
  { id: 'csp-configured',      label: '已配置 Content Security Policy',              category: '安全' },
  { id: 'deps-resolved',       label: '所有依赖已在 package.json 中声明',              category: '依赖' },
  { id: 'no-console-log',      label: '生产代码中无 console.log',                     category: '代码质量' },
  { id: 'default-locale',      label: '已配置 default_locale',                       category: '国际化' },
  { id: 'description-present', label: '扩展描述已填写',                                category: '元数据' },
  { id: 'changelog-updated',   label: 'CHANGELOG 已更新至当前版本',                     category: '文档' },
]

// ==================== 版本工具函数 ====================

/**
 * 检查字符串是否为有效的 semver 版本号
 * @param {string} version
 * @returns {boolean}
 */
export function isValidSemver(version) {
  if (!version || typeof version !== 'string') return false
  return /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(version.trim())
}

/**
 * 比较两个 semver 版本号
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 / 0 / 1
 */
export function compareVersions(a, b) {
  if (!a || !b) return 0
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

// ==================== validateRelease ====================

/**
 * 检查扩展发布就绪状态
 *
 * @param {object} manifest — manifest.json 内容
 * @param {object} packageJson — package.json 内容
 * @returns {{ ready: boolean, checks: Array<{ id: string, passed: boolean, message: string }> }}
 */
export function validateRelease(manifest, packageJson) {
  const checks = []

  if (!manifest || typeof manifest !== 'object') {
    return { ready: false, checks: [{ id: 'input', passed: false, message: 'manifest 无效' }] }
  }
  if (!packageJson || typeof packageJson !== 'object') {
    return { ready: false, checks: [{ id: 'input', passed: false, message: 'packageJson 无效' }] }
  }

  // 1. 版本号一致
  const versionsMatch = manifest.version === packageJson.version
  checks.push({
    id: 'version-match',
    passed: versionsMatch,
    message: versionsMatch
      ? '版本号一致'
      : `manifest(${manifest.version}) 与 package.json(${packageJson.version}) 版本不一致`,
  })

  // 2. semver 格式
  const mv = manifest.version || ''
  const validSemver = isValidSemver(mv)
  checks.push({
    id: 'version-valid',
    passed: validSemver,
    message: validSemver ? '版本号格式正确' : `"${mv}" 不是有效的 semver 版本号`,
  })

  // 3. 图标
  const iconSizes = ['16', '48', '128']
  const manifestIcons = manifest.icons || {}
  const missingIcons = iconSizes.filter(s => !manifestIcons[s])
  const iconsOk = missingIcons.length === 0
  checks.push({
    id: 'icons-present',
    passed: iconsOk,
    message: iconsOk ? '图标完整' : `缺少图标尺寸: ${missingIcons.join(', ')}`,
  })

  // 4. 权限
  const permissions = manifest.permissions || []
  const hasStorage = permissions.includes('storage')
  const hasBookmarks = permissions.includes('bookmarks')
  checks.push({
    id: 'permissions-valid',
    passed: hasStorage && hasBookmarks,
    message: hasStorage && hasBookmarks
      ? '必要权限已声明'
      : `缺少权限: ${[!hasStorage && 'storage', !hasBookmarks && 'bookmarks'].filter(Boolean).join(', ')}`,
  })

  // 5. CSP
  const hasCsp = !!(manifest.content_security_policy && typeof manifest.content_security_policy === 'object')
  checks.push({
    id: 'csp-configured',
    passed: hasCsp,
    message: hasCsp ? 'CSP 已配置' : '未配置 Content Security Policy',
  })

  // 6. 依赖
  const depsResult = checkDependencies(packageJson)
  checks.push({
    id: 'deps-resolved',
    passed: depsResult.ok,
    message: depsResult.ok ? '依赖完整' : `缺少依赖: ${depsResult.missing.join(', ')}`,
  })

  // 7. default_locale
  const hasLocale = !!manifest.default_locale
  checks.push({
    id: 'default-locale',
    passed: hasLocale,
    message: hasLocale ? `默认语言: ${manifest.default_locale}` : '未配置 default_locale',
  })

  // 8. 描述
  const hasDesc = !!(manifest.description && manifest.description.trim())
  checks.push({
    id: 'description-present',
    passed: hasDesc,
    message: hasDesc ? '扩展描述已填写' : '扩展描述为空',
  })

  // 9. manifest_version
  const validManifestVersion = manifest.manifest_version === 3
  checks.push({
    id: 'manifest-version',
    passed: validManifestVersion,
    message: validManifestVersion ? 'Manifest V3' : `不支持的 manifest_version: ${manifest.manifest_version}`,
  })

  // 10. service_worker / background
  const hasBackground = !!(manifest.background && manifest.background.service_worker)
  checks.push({
    id: 'background-present',
    passed: hasBackground,
    message: hasBackground ? 'Background service worker 已配置' : '缺少 background service_worker',
  })

  const ready = checks.every(c => c.passed)

  return { ready, checks }
}

// ==================== generateReleaseNotes ====================

/**
 * 格式化发布说明
 *
 * @param {object | object[]} changelog — 变更日志条目或数组
 *   每个条目: { version: string, date?: string, added?: string[], fixed?: string[], changed?: string[], removed?: string[] }
 * @returns {string} 格式化的发布说明 (Markdown)
 */
export function generateReleaseNotes(changelog) {
  if (!changelog) return ''

  const entries = Array.isArray(changelog) ? changelog : [changelog]
  if (entries.length === 0) return ''

  const sections = []

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue

    const lines = []
    const version = entry.version || '未标记版本'
    const date = entry.date || ''
    lines.push(`## ${version}${date ? ` (${date})` : ''}`)
    lines.push('')

    if (entry.added && entry.added.length > 0) {
      lines.push('### ✅ 新增')
      for (const item of entry.added) {
        lines.push(`- ${item}`)
      }
      lines.push('')
    }

    if (entry.changed && entry.changed.length > 0) {
      lines.push('### 🔄 变更')
      for (const item of entry.changed) {
        lines.push(`- ${item}`)
      }
      lines.push('')
    }

    if (entry.fixed && entry.fixed.length > 0) {
      lines.push('### 🐛 修复')
      for (const item of entry.fixed) {
        lines.push(`- ${item}`)
      }
      lines.push('')
    }

    if (entry.removed && entry.removed.length > 0) {
      lines.push('### 🗑️ 移除')
      for (const item of entry.removed) {
        lines.push(`- ${item}`)
      }
      lines.push('')
    }

    // 如果没有任何分类条目，标记为空版本
    const hasContent = (entry.added && entry.added.length > 0)
      || (entry.changed && entry.changed.length > 0)
      || (entry.fixed && entry.fixed.length > 0)
      || (entry.removed && entry.removed.length > 0)

    if (!hasContent) {
      lines.push('_暂无变更记录_')
      lines.push('')
    }

    sections.push(lines.join('\n'))
  }

  return sections.join('\n').trim()
}

// ==================== checkDependencies ====================

/**
 * 验证 package.json 中所有依赖是否已声明
 *
 * @param {object} packageJson — package.json 内容
 * @returns {{ ok: boolean, missing: string[], declared: string[] }}
 */
export function checkDependencies(packageJson) {
  if (!packageJson || typeof packageJson !== 'object') {
    return { ok: false, missing: [], declared: [] }
  }

  const dependencies = packageJson.dependencies || {}
  const devDependencies = packageJson.devDependencies || {}
  const peerDependencies = packageJson.peerDependencies || {}
  const optionalDependencies = packageJson.optionalDependencies || {}

  const declared = [
    ...Object.keys(dependencies),
    ...Object.keys(devDependencies),
    ...Object.keys(peerDependencies),
    ...Object.keys(optionalDependencies),
  ]

  // 检查 declared 字段中的版本是否有效
  const missing = []
  const allDeps = { ...dependencies, ...devDependencies, ...peerDependencies, ...optionalDependencies }

  for (const [name, version] of Object.entries(allDeps)) {
    if (!version || typeof version !== 'string' || version.trim() === '') {
      missing.push(name)
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    declared: [...new Set(declared)],
  }
}

// ==================== getVersionInfo ====================

/**
 * 获取版本信息摘要
 *
 * @param {object} manifest — manifest.json 内容
 * @param {object} packageJson — package.json 内容
 * @returns {{ manifestVersion: string, packageVersion: string, versionsMatch: boolean, isPreRelease: boolean, versionParts: { major: number, minor: number, patch: number }, manifestVersion3: boolean, name: string, description: string, author: string }}
 */
export function getVersionInfo(manifest, packageJson) {
  if (!manifest || typeof manifest !== 'object') manifest = {}
  if (!packageJson || typeof packageJson !== 'object') packageJson = {}

  const manifestVersion = manifest.version || ''
  const packageVersion = packageJson.version || ''
  const versionsMatch = manifestVersion !== '' && manifestVersion === packageVersion

  const parts = manifestVersion.split('.')
  const major = parseInt(parts[0], 10) || 0
  const minor = parseInt(parts[1], 10) || 0
  const patch = parseInt(parts[2], 10) || 0

  const isPreRelease = /-/.test(manifestVersion)
    || (major === 0 && minor === 0 && patch === 0)

  return {
    manifestVersion,
    packageVersion,
    versionsMatch,
    isPreRelease,
    versionParts: { major, minor, patch },
    manifestVersion3: manifest.manifest_version === 3,
    name: manifest.name || packageJson.name || '',
    description: manifest.description || packageJson.description || '',
    author: manifest.author || '',
  }
}
