/**
 * 测试 lib/bookmark-release.js — 版本发布管理
 *
 * 测试范围:
 *   validateRelease (发布验证) / generateReleaseNotes (发布说明) /
 *   checkDependencies (依赖检查) / getVersionInfo (版本信息) /
 *   isValidSemver / compareVersions / RELEASE_CHECKLIST
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  validateRelease,
  generateReleaseNotes,
  checkDependencies,
  getVersionInfo,
  isValidSemver,
  compareVersions,
  RELEASE_CHECKLIST,
} = await import('../lib/bookmark-release.js')

// ==================== 辅助: 构造 manifest / packageJson ====================

function createManifest(overrides = {}) {
  return {
    manifest_version: 3,
    name: '__MSG_extName__',
    version: '2.4.0',
    default_locale: 'zh_CN',
    description: '智阅 PageWise 扩展',
    author: 'PageWise',
    permissions: ['storage', 'sidePanel', 'contextMenus', 'tabs', 'activeTab', 'bookmarks'],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    background: {
      service_worker: 'background/service-worker.js',
      type: 'module',
    },
    ...overrides,
  }
}

function createPackageJson(overrides = {}) {
  return {
    name: 'pagewise',
    version: '2.4.0',
    private: true,
    type: 'module',
    description: '智阅 PageWise - Chrome 浏览器扩展',
    dependencies: {
      'openai': '^4.0.0',
    },
    devDependencies: {
      'eslint': '^8.0.0',
    },
    ...overrides,
  }
}

// ==================== 测试 ====================

describe('BookmarkRelease', () => {

  // ─── RELEASE_CHECKLIST ──────────────────────────────────────────────────────

  describe('RELEASE_CHECKLIST', () => {
    it('1. 发布检查清单应为非空数组', () => {
      assert.ok(Array.isArray(RELEASE_CHECKLIST), '应为数组')
      assert.ok(RELEASE_CHECKLIST.length >= 5, '清单至少 5 项')
    })

    it('2. 清单项应包含 id / label / category', () => {
      for (const item of RELEASE_CHECKLIST) {
        assert.ok(typeof item.id === 'string' && item.id.length > 0, `id 应为非空字符串: ${JSON.stringify(item)}`)
        assert.ok(typeof item.label === 'string' && item.label.length > 0, `label 应为非空字符串: ${JSON.stringify(item)}`)
        assert.ok(typeof item.category === 'string' && item.category.length > 0, `category 应为非空字符串: ${JSON.stringify(item)}`)
      }
    })

    it('3. 清单项 id 不应重复', () => {
      const ids = RELEASE_CHECKLIST.map(item => item.id)
      const unique = new Set(ids)
      assert.equal(ids.length, unique.size, '清单 id 应唯一')
    })
  })

  // ─── isValidSemver ──────────────────────────────────────────────────────────

  describe('isValidSemver', () => {
    it('4. 有效 semver 版本号', () => {
      assert.ok(isValidSemver('1.0.0'), '1.0.0 应有效')
      assert.ok(isValidSemver('0.0.1'), '0.0.1 应有效')
      assert.ok(isValidSemver('10.20.30'), '10.20.30 应有效')
      assert.ok(isValidSemver('1.0.0-alpha.1'), '1.0.0-alpha.1 应有效')
      assert.ok(isValidSemver('1.0.0+build.123'), '1.0.0+build.123 应有效')
    })

    it('5. 无效 semver 版本号', () => {
      assert.ok(!isValidSemver(''), '空字符串应无效')
      assert.ok(!isValidSemver(null), 'null 应无效')
      assert.ok(!isValidSemver(undefined), 'undefined 应无效')
      assert.ok(!isValidSemver('1.0'), '1.0 应无效 (缺少 patch)')
      assert.ok(!isValidSemver('v1.0.0'), 'v1.0.0 应无效 (含 v 前缀)')
      assert.ok(!isValidSemver('abc'), 'abc 应无效')
      assert.ok(!isValidSemver('1.0.0.0'), '1.0.0.0 应无效 (四段)')
    })
  })

  // ─── compareVersions ────────────────────────────────────────────────────────

  describe('compareVersions', () => {
    it('6. 版本比较: 大于/等于/小于', () => {
      assert.equal(compareVersions('1.0.0', '1.0.0'), 0, '相等应返回 0')
      assert.equal(compareVersions('2.0.0', '1.0.0'), 1, '大于应返回 1')
      assert.equal(compareVersions('1.0.0', '2.0.0'), -1, '小于应返回 -1')
      assert.equal(compareVersions('1.2.3', '1.2.2'), 1, 'patch 比较')
      assert.equal(compareVersions('1.2.2', '1.2.3'), -1, 'patch 比较')
      assert.equal(compareVersions('1.3.0', '1.2.9'), 1, 'minor 比较')
    })

    it('7. compareVersions 处理空值', () => {
      assert.equal(compareVersions(null, '1.0.0'), 0, 'null 应返回 0')
      assert.equal(compareVersions('1.0.0', null), 0, 'null 应返回 0')
      assert.equal(compareVersions(undefined, '1.0.0'), 0, 'undefined 应返回 0')
    })
  })

  // ─── validateRelease ────────────────────────────────────────────────────────

  describe('validateRelease', () => {
    it('8. 正常 manifest/package.json 应通过验证 (ready)', () => {
      const manifest = createManifest()
      const packageJson = createPackageJson()
      const result = validateRelease(manifest, packageJson)

      assert.ok(result.ready, '正常配置应 ready')
      assert.ok(Array.isArray(result.checks), 'checks 应为数组')
      assert.ok(result.checks.length >= 5, 'checks 至少 5 项')
      assert.ok(result.checks.every(c => c.passed), '所有检查应通过')
    })

    it('9. 缺少图标应不通过验证', () => {
      const manifest = createManifest({ icons: {} })
      const packageJson = createPackageJson()
      const result = validateRelease(manifest, packageJson)

      assert.ok(!result.ready, '缺少图标应不 ready')
      const iconCheck = result.checks.find(c => c.id === 'icons-present')
      assert.ok(iconCheck, '应有 icons-present 检查')
      assert.ok(!iconCheck.passed, '图标检查应失败')
      assert.ok(iconCheck.message.includes('缺少'), '消息应包含"缺少"')
    })

    it('10. 版本不一致应不通过验证', () => {
      const manifest = createManifest({ version: '2.4.0' })
      const packageJson = createPackageJson({ version: '2.5.0' })
      const result = validateRelease(manifest, packageJson)

      assert.ok(!result.ready, '版本不一致应不 ready')
      const versionCheck = result.checks.find(c => c.id === 'version-match')
      assert.ok(!versionCheck.passed, '版本匹配检查应失败')
    })

    it('11. 无效版本号应不通过验证', () => {
      const manifest = createManifest({ version: 'not-a-version' })
      const packageJson = createPackageJson({ version: 'not-a-version' })
      const result = validateRelease(manifest, packageJson)

      assert.ok(!result.ready, '无效版本号应不 ready')
      const semverCheck = result.checks.find(c => c.id === 'version-valid')
      assert.ok(!semverCheck.passed, 'semver 检查应失败')
    })

    it('12. null/无效输入处理', () => {
      const r1 = validateRelease(null, createPackageJson())
      assert.ok(!r1.ready, 'null manifest 应不 ready')

      const r2 = validateRelease(createManifest(), null)
      assert.ok(!r2.ready, 'null packageJson 应不 ready')

      const r3 = validateRelease(null, null)
      assert.ok(!r3.ready, '两者都 null 应不 ready')
    })

    it('13. 缺少 CSP 应不通过', () => {
      const manifest = createManifest({ content_security_policy: undefined })
      const result = validateRelease(manifest, createPackageJson())

      assert.ok(!result.ready, '缺 CSP 应不 ready')
      const cspCheck = result.checks.find(c => c.id === 'csp-configured')
      assert.ok(!cspCheck.passed, 'CSP 检查应失败')
    })

    it('14. 缺少权限应不通过', () => {
      const manifest = createManifest({ permissions: [] })
      const result = validateRelease(manifest, createPackageJson())

      assert.ok(!result.ready, '缺权限应不 ready')
      const permCheck = result.checks.find(c => c.id === 'permissions-valid')
      assert.ok(!permCheck.passed, '权限检查应失败')
    })
  })

  // ─── generateReleaseNotes ───────────────────────────────────────────────────

  describe('generateReleaseNotes', () => {
    it('15. 单个版本发布说明格式正确', () => {
      const changelog = {
        version: '2.5.0',
        date: '2026-05-13',
        added: ['BookmarkRelease 发布管理模块', '发布检查清单'],
        fixed: ['修复书签排序问题'],
      }
      const notes = generateReleaseNotes(changelog)

      assert.ok(notes.includes('## 2.5.0 (2026-05-13)'), '应有版本标题')
      assert.ok(notes.includes('### ✅ 新增'), '应有新增部分')
      assert.ok(notes.includes('- BookmarkRelease 发布管理模块'), '应列出新增项')
      assert.ok(notes.includes('### 🐛 修复'), '应有修复部分')
      assert.ok(notes.includes('- 修复书签排序问题'), '应列出修复项')
    })

    it('16. 多个版本发布说明', () => {
      const changelog = [
        { version: '2.5.0', added: ['功能 A'] },
        { version: '2.4.1', fixed: ['Bug B'] },
      ]
      const notes = generateReleaseNotes(changelog)

      assert.ok(notes.includes('## 2.5.0'), '应含 v2.5.0')
      assert.ok(notes.includes('## 2.4.1'), '应含 v2.4.1')
      assert.ok(notes.includes('功能 A'), '应含新增内容')
      assert.ok(notes.includes('Bug B'), '应含修复内容')
    })

    it('17. 空/无内容返回空字符串', () => {
      assert.equal(generateReleaseNotes(null), '', 'null 应返回空')
      assert.equal(generateReleaseNotes(undefined), '', 'undefined 应返回空')
      assert.equal(generateReleaseNotes([]), '', '空数组应返回空')
    })

    it('18. 无分类条目显示"暂无变更记录"', () => {
      const changelog = { version: '2.6.0' }
      const notes = generateReleaseNotes(changelog)
      assert.ok(notes.includes('暂无变更记录'), '应显示暂无记录')
    })

    it('19. 支持 added/changed/fixed/removed 所有分类', () => {
      const changelog = {
        version: '3.0.0',
        date: '2026-06-01',
        added: ['新功能 A'],
        changed: ['变更 B'],
        fixed: ['修复 C'],
        removed: ['移除 D'],
      }
      const notes = generateReleaseNotes(changelog)

      assert.ok(notes.includes('### ✅ 新增'), '应有新增')
      assert.ok(notes.includes('### 🔄 变更'), '应有变更')
      assert.ok(notes.includes('### 🐛 修复'), '应有修复')
      assert.ok(notes.includes('### 🗑️ 移除'), '应有移除')
      assert.ok(notes.includes('- 新功能 A'), '新增内容')
      assert.ok(notes.includes('- 变更 B'), '变更内容')
      assert.ok(notes.includes('- 修复 C'), '修复内容')
      assert.ok(notes.includes('- 移除 D'), '移除内容')
    })
  })

  // ─── checkDependencies ──────────────────────────────────────────────────────

  describe('checkDependencies', () => {
    it('20. 有合法依赖应通过检查', () => {
      const packageJson = {
        dependencies: { 'openai': '^4.0.0' },
        devDependencies: { 'eslint': '^8.0.0' },
      }
      const result = checkDependencies(packageJson)

      assert.ok(result.ok, '合法依赖应 ok')
      assert.deepEqual(result.missing, [], '无缺失依赖')
      assert.ok(result.declared.includes('openai'), '应列出 openai')
      assert.ok(result.declared.includes('eslint'), '应列出 eslint')
    })

    it('21. 空版本号依赖应标记为缺失', () => {
      const packageJson = {
        dependencies: { 'openai': '' },
        devDependencies: { 'eslint': '^8.0.0' },
      }
      const result = checkDependencies(packageJson)

      assert.ok(!result.ok, '空版本号应不 ok')
      assert.ok(result.missing.includes('openai'), 'openai 应标记为缺失')
    })

    it('22. null/无效输入处理', () => {
      const r1 = checkDependencies(null)
      assert.ok(!r1.ok, 'null 应不 ok')
      assert.deepEqual(r1.declared, [], 'null 应返回空 declared')

      const r2 = checkDependencies(undefined)
      assert.ok(!r2.ok, 'undefined 应不 ok')

      const r3 = checkDependencies('not-object')
      assert.ok(!r3.ok, '字符串应不 ok')
    })

    it('23. 无依赖应正常返回', () => {
      const result = checkDependencies({ name: 'test' })
      assert.ok(result.ok, '无依赖应 ok')
      assert.deepEqual(result.declared, [], '无声明依赖')
      assert.deepEqual(result.missing, [], '无缺失依赖')
    })

    it('24. peerDependencies 和 optionalDependencies 也被检查', () => {
      const packageJson = {
        peerDependencies: { 'react': '>=17.0.0' },
        optionalDependencies: { 'fsevents': '^2.0.0' },
      }
      const result = checkDependencies(packageJson)

      assert.ok(result.ok, '合法 peer/optional 应 ok')
      assert.ok(result.declared.includes('react'), '应列出 react')
      assert.ok(result.declared.includes('fsevents'), '应列出 fsevents')
    })
  })

  // ─── getVersionInfo ─────────────────────────────────────────────────────────

  describe('getVersionInfo', () => {
    it('25. 正常获取版本信息', () => {
      const manifest = createManifest()
      const packageJson = createPackageJson()
      const info = getVersionInfo(manifest, packageJson)

      assert.equal(info.manifestVersion, '2.4.0', 'manifest 版本')
      assert.equal(info.packageVersion, '2.4.0', 'package 版本')
      assert.ok(info.versionsMatch, '版本应一致')
      assert.ok(!info.isPreRelease, '不应为预发布')
      assert.equal(info.versionParts.major, 2, 'major')
      assert.equal(info.versionParts.minor, 4, 'minor')
      assert.equal(info.versionParts.patch, 0, 'patch')
      assert.ok(info.manifestVersion3, '应为 Manifest V3')
      assert.ok(info.name.length > 0, '应有名称')
      assert.ok(info.description.length > 0, '应有描述')
      assert.ok(info.author.length > 0, '应有作者')
    })

    it('26. 版本不一致时 versionsMatch 为 false', () => {
      const manifest = createManifest({ version: '2.4.0' })
      const packageJson = createPackageJson({ version: '1.0.0' })
      const info = getVersionInfo(manifest, packageJson)

      assert.ok(!info.versionsMatch, '版本不一致应为 false')
    })

    it('27. 预发布版本检测', () => {
      const manifest = createManifest({ version: '3.0.0-beta.1' })
      const packageJson = createPackageJson({ version: '3.0.0-beta.1' })
      const info = getVersionInfo(manifest, packageJson)

      assert.ok(info.isPreRelease, '含 - 的版本应为预发布')
    })

    it('28. null/空输入处理', () => {
      const info = getVersionInfo(null, null)

      assert.equal(info.manifestVersion, '', 'null manifest 版本应为空')
      assert.equal(info.packageVersion, '', 'null package 版本应为空')
      assert.ok(!info.versionsMatch, '两者为空应不匹配')
      assert.equal(info.versionParts.major, 0, 'major 应为 0')
      assert.equal(info.versionParts.minor, 0, 'minor 应为 0')
      assert.equal(info.versionParts.patch, 0, 'patch 应为 0')
    })

    it('29. 缺少字段的 manifest 处理', () => {
      const info = getVersionInfo({}, {})

      assert.equal(info.manifestVersion, '', '无 version 应为空')
      assert.ok(!info.manifestVersion3, '无 manifest_version 应非 V3')
      assert.equal(info.name, '', '无 name 应为空')
      assert.equal(info.description, '', '无 description 应为空')
      assert.equal(info.author, '', '无 author 应为空')
    })
  })
})
