/**
 * SkillStore — 在线技能商店客户端
 *
 * 从远程 API 获取可安装的技能列表，支持一键安装到本地 IndexedDB。
 * 支持技能导入/导出、版本管理、GitHub 集成、评分评论。
 */

import { saveSkill, getSkillById, getAllSkills, deleteSkill } from './custom-skills.js';
import { createZip, readZipAsText } from './skill-zip.js';
import { validateSkillPackage, parseSkillManifest } from './skill-validator.js';

const DEFAULT_API_URL = 'https://api.clawhub.com/v1/skills';
const GITHUB_API_BASE = 'https://api.github.com';
const PAGEWISE_VERSION = '2.0.0';

// ==================== SkillStore (Original) ====================

export class SkillStore {
  /**
   * @param {string} apiUrl - 技能商店 API 地址
   */
  constructor(apiUrl = DEFAULT_API_URL) {
    this.apiUrl = apiUrl;
  }

  /**
   * 从远程 API 获取技能列表
   * @returns {Promise<Array>} 技能列表，失败时返回空数组
   */
  async fetchSkills() {
    try {
      const resp = await fetch(this.apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!resp.ok) {
        console.warn(`SkillStore fetch failed: HTTP ${resp.status}`);
        return [];
      }
      const data = await resp.json();
      return Array.isArray(data) ? data : (data.skills || data.data || []);
    } catch (e) {
      console.warn('SkillStore fetch error:', e.message);
      return [];
    }
  }

  /**
   * 安装技能到本地 IndexedDB
   * @param {Object} skill - 技能对象（必须包含 id, name, prompt）
   * @returns {Promise<Object>} 保存后的技能
   */
  async installSkill(skill) {
    if (!skill || !skill.id || !skill.name) {
      throw new Error('技能数据不完整');
    }
    return await saveSkill({
      id: skill.id,
      name: skill.name,
      description: skill.description || '',
      category: skill.category || 'custom',
      prompt: skill.prompt || '',
      parameters: skill.parameters || [],
      trigger: skill.trigger || { type: 'manual' },
      enabled: true
    });
  }

  /**
   * 检查技能是否已安装
   * @param {string} skillId
   * @returns {Promise<boolean>}
   */
  async isInstalled(skillId) {
    const existing = await getSkillById(skillId);
    return !!existing;
  }
}

// ==================== SkillPackageManager (Import/Export) ====================

/**
 * SkillPackageManager — 社区技能导入/导出与版本管理
 */
export class SkillPackageManager {
  constructor() {
    /** @type {Object|null} - Injection point for fetch (testability) */
    this._fetch = null
  }

  /**
   * Export a skill from IndexedDB as a .pwskill ZIP archive
   *
   * @param {string} skillId - Skill ID to export
   * @param {Object} [options] - Export options
   * @param {string} [options.author] - Author name
   * @param {string} [options.license] - License identifier
   * @returns {Promise<Uint8Array>} ZIP archive data
   */
  async exportSkill(skillId, options = {}) {
    const skill = await getSkillById(skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    const version = skill.version || '1.0.0'
    const author = options.author || 'PageWise User'
    const license = options.license || 'MIT'

    // Build SKILL.md with frontmatter
    const skillMd = [
      '---',
      `id: ${skill.id}`,
      `name: ${skill.name}`,
      `version: ${version}`,
      `description: ${skill.description || ''}`,
      `author: ${author}`,
      `category: ${skill.category || 'general'}`,
      `license: ${license}`,
      '---',
      '',
      `# ${skill.name}`,
      '',
      skill.description || '',
      '',
      '## Parameters',
      '',
      ...(skill.parameters || []).map(p =>
        `- **${p.name}** (${p.type || 'string'}${p.required ? ', required' : ''}): ${p.description || ''}`
      ),
      ''
    ].join('\n')

    // Build main.js
    const mainJs = [
      `// Skill: ${skill.name}`,
      `// Auto-exported by PageWise`,
      '',
      `export default async function execute(params, context) {`,
      `  ${skill.prompt ? `const prompt = \`${skill.prompt.replace(/`/g, '\\`')}\`;` : 'const prompt = "No prompt configured";'}`,
      `  const response = await context.ai.chat([{ role: 'user', content: prompt }]);`,
      `  return response.content;`,
      `}`,
      ''
    ].join('\n')

    // Build README.md
    const readme = [
      `# ${skill.name}`,
      '',
      skill.description || '',
      '',
      '## Usage',
      '',
      'Install this skill from the PageWise skill marketplace.',
      '',
      '## Parameters',
      '',
      ...(skill.parameters || []).map(p =>
        `- \`${p.name}\` (${p.type || 'string'}): ${p.description || ''}`
      ),
      ''
    ].join('\n')

    // Metadata
    const meta = {
      exportedAt: new Date().toISOString(),
      exportedBy: `PageWise/${PAGEWISE_VERSION}`,
      skillId: skill.id,
      version
    }

    // Create ZIP
    const files = [
      { name: 'SKILL.md', content: skillMd },
      { name: 'main.js', content: mainJs },
      { name: 'README.md', content: readme },
      { name: '.skillmeta.json', content: JSON.stringify(meta, null, 2) }
    ]

    return createZip(files)
  }

  /**
   * Import a skill from a .pwskill ZIP archive
   *
   * @param {Uint8Array} zipData - ZIP archive data
   * @param {Object} [options] - Import options
   * @param {boolean} [options.validate=true] - Run validation pipeline
   * @param {boolean} [options.overwrite=false] - Overwrite existing skill
   * @returns {Promise<Object>} Installed skill record
   */
  async importSkill(zipData, options = {}) {
    const { validate = true, overwrite = false } = options

    // 1. Extract ZIP
    let files
    try {
      files = readZipAsText(zipData)
    } catch (e) {
      throw new Error(`Failed to read skill package: ${e.message}`)
    }

    if (files.length === 0) {
      throw new Error('Skill package is empty')
    }

    // 2. Validate
    if (validate) {
      const validation = validateSkillPackage(files)
      if (!validation.valid) {
        throw new Error(`Skill validation failed:\n${validation.toString()}`)
      }
    }

    // 3. Parse manifest
    const skillMd = files.find(f => f.name === 'SKILL.md')
    if (!skillMd) {
      throw new Error('Missing SKILL.md in package')
    }

    const { frontmatter } = parseSkillManifest(skillMd.content)

    // 4. Check version compatibility
    if (frontmatter.minVersion) {
      if (!isVersionCompatible(PAGEWISE_VERSION, frontmatter.minVersion)) {
        throw new Error(
          `Skill requires PageWise >= ${frontmatter.minVersion}, current: ${PAGEWISE_VERSION}`
        )
      }
    }

    // 5. Check overwrite
    const existing = await getSkillById(frontmatter.id)
    if (existing && !overwrite) {
      // Check if imported version is newer
      const existingVer = existing.version || '0.0.0'
      if (!isNewerVersion(frontmatter.version, existingVer)) {
        throw new Error(
          `Skill "${frontmatter.id}" already installed (${existingVer} >= ${frontmatter.version}). Use overwrite option to force.`
        )
      }
    }

    // 6. Install
    const mainJs = files.find(f => f.name === 'main.js')

    const skillRecord = {
      id: frontmatter.id,
      name: frontmatter.name,
      description: frontmatter.description || '',
      category: frontmatter.category || 'general',
      prompt: mainJs ? mainJs.content : '',
      version: frontmatter.version,
      author: frontmatter.author,
      license: frontmatter.license,
      parameters: frontmatter.parameters || [],
      trigger: frontmatter.trigger || { type: 'manual' },
      enabled: true,
      installedAt: Date.now()
    }

    return await saveSkill(skillRecord)
  }

  /**
   * Check for version updates for an installed skill
   *
   * @param {string} skillId - Skill ID to check
   * @param {string} latestVersion - Latest available version
   * @returns {Promise<{updateAvailable: boolean, currentVersion: string, latestVersion: string}>}
   */
  async checkForUpdate(skillId, latestVersion) {
    const skill = await getSkillById(skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    const currentVersion = skill.version || '1.0.0'
    return {
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      currentVersion,
      latestVersion
    }
  }

  /**
   * Get version history for an installed skill
   *
   * @param {string} skillId
   * @returns {Promise<Object>} Version info
   */
  async getVersionInfo(skillId) {
    const skill = await getSkillById(skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    return {
      id: skill.id,
      name: skill.name,
      version: skill.version || '1.0.0',
      installedAt: skill.installedAt || null,
      updatedAt: skill.updatedAt || null
    }
  }
}

// ==================== SkillCommunityHub (GitHub + Reviews) ====================

/**
 * SkillCommunityHub — GitHub integration and community features
 */
export class SkillCommunityHub {
  constructor(options = {}) {
    this.githubApiBase = options.githubApiBase || GITHUB_API_BASE
    this._fetch = options.fetch || null
  }

  /**
   * Get the effective fetch function
   * @returns {Function}
   */
  _getFetch() {
    return this._fetch || (typeof fetch !== 'undefined' ? fetch : null)
  }

  /**
   * Install a skill from a GitHub repository
   *
   * Expects the repo to contain SKILL.md and main.js at the root
   * or in a specified subdirectory.
   *
   * @param {string} repo - GitHub repo in "owner/repo" format
   * @param {Object} [options] - Options
   * @param {string} [options.branch] - Branch to use (default: main)
   * @param {string} [options.path] - Subdirectory path within repo
   * @returns {Promise<{files: Array, manifest: Object}>} Fetched skill data
   */
  async fetchFromGitHub(repo, options = {}) {
    const { branch = 'main', path = '' } = options

    if (!repo || !repo.includes('/')) {
      throw new Error('Invalid repo format. Expected "owner/repo"')
    }

    const fetchFn = this._getFetch()
    if (!fetchFn) {
      throw new Error('fetch is not available')
    }

    const basePath = path ? `${path}/` : ''
    const requiredFiles = ['SKILL.md', 'main.js', 'README.md']
    const files = []

    for (const filename of requiredFiles) {
      const url = `${this.githubApiBase}/repos/${repo}/contents/${basePath}${filename}?ref=${branch}`

      try {
        const resp = await fetchFn(url, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'PageWise-SkillInstaller'
          }
        })

        if (!resp.ok) {
          if (resp.status === 404) {
            throw new Error(`File not found: ${basePath}${filename}`)
          }
          throw new Error(`GitHub API error: HTTP ${resp.status}`)
        }

        const data = await resp.json()

        if (data.encoding === 'base64') {
          const content = base64Decode(data.content)
          files.push({ name: filename, content })
        } else if (data.content) {
          files.push({ name: filename, content: data.content })
        }
      } catch (e) {
        if (e.message.includes('not found') || e.message.includes('HTTP')) {
          throw e
        }
        throw new Error(`Failed to fetch ${filename}: ${e.message}`)
      }
    }

    // Fetch optional files
    const optionalFiles = ['test.js']
    for (const filename of optionalFiles) {
      const url = `${this.githubApiBase}/repos/${repo}/contents/${basePath}${filename}?ref=${branch}`

      try {
        const resp = await fetchFn(url, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'PageWise-SkillInstaller'
          }
        })

        if (resp.ok) {
          const data = await resp.json()
          if (data.encoding === 'base64') {
            files.push({ name: filename, content: base64Decode(data.content) })
          } else if (data.content) {
            files.push({ name: filename, content: data.content })
          }
        }
      } catch {
        // Optional file, silently skip
      }
    }

    // Parse manifest
    const skillMd = files.find(f => f.name === 'SKILL.md')
    if (!skillMd) {
      throw new Error('SKILL.md not found in repository')
    }

    const { frontmatter } = parseSkillManifest(skillMd.content)

    return { files, manifest: frontmatter }
  }

  /**
   * Install a skill fetched from GitHub
   *
   * @param {string} repo - GitHub repo
   * @param {Object} [options] - Options
   * @returns {Promise<Object>} Installed skill record
   */
  async installFromGitHub(repo, options = {}) {
    const { files, manifest } = await this.fetchFromGitHub(repo, options)

    // Validate
    const validation = validateSkillPackage(files)
    if (!validation.valid) {
      throw new Error(`Skill validation failed:\n${validation.toString()}`)
    }

    // Install via PackageManager
    const pkg = new SkillPackageManager()
    const zipData = createZip(files)
    return pkg.importSkill(zipData, { overwrite: options.overwrite || false })
  }
}

// ==================== Skill Review / Rating (IndexedDB) ====================

const REVIEW_DB_NAME = 'pagewise_skill_reviews'
const REVIEW_DB_VERSION = 1
const REVIEW_STORE_NAME = 'reviews'
const STATS_STORE_NAME = 'stats'

/**
 * Open the review database
 * @returns {Promise<IDBDatabase>}
 */
function openReviewDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REVIEW_DB_NAME, REVIEW_DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(REVIEW_STORE_NAME)) {
        const store = db.createObjectStore(REVIEW_STORE_NAME, { keyPath: 'id', autoIncrement: true })
        store.createIndex('skillId', 'skillId', { unique: false })
        store.createIndex('author', 'author', { unique: false })
      }
      if (!db.objectStoreNames.contains(STATS_STORE_NAME)) {
        db.createObjectStore(STATS_STORE_NAME, { keyPath: 'skillId' })
      }
    }

    request.onsuccess = (event) => resolve(event.target.result)
    request.onerror = (event) => reject(event.target.error)
  })
}

/**
 * Wrap IDBRequest as Promise
 */
function r2p(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * SkillCommunityReviews — Rating and review system
 */
export class SkillCommunityReviews {
  /**
   * Add a review for a skill
   *
   * @param {Object} review - Review data
   * @param {string} review.skillId - Skill ID
   * @param {string} review.author - Reviewer name
   * @param {number} review.rating - Rating (1-5)
   * @param {string} [review.comment] - Review comment
   * @param {string} [review.version] - Skill version reviewed
   * @returns {Promise<Object>} Saved review
   */
  async addReview(review) {
    if (!review.skillId) throw new Error('Missing skillId')
    if (!review.author) throw new Error('Missing author')
    if (typeof review.rating !== 'number' || review.rating < 1 || review.rating > 5) {
      throw new Error('Rating must be a number between 1 and 5')
    }

    const record = {
      skillId: review.skillId,
      author: review.author,
      rating: Math.round(review.rating * 10) / 10,
      comment: review.comment || '',
      version: review.version || '',
      createdAt: Date.now()
    }

    const db = await openReviewDB()
    const tx = db.transaction([REVIEW_STORE_NAME, STATS_STORE_NAME], 'readwrite')
    const reviewStore = tx.objectStore(REVIEW_STORE_NAME)
    const statsStore = tx.objectStore(STATS_STORE_NAME)

    const saved = await r2p(reviewStore.add(record))

    // Update stats
    const allReviews = await r2p(reviewStore.index('skillId').getAll(review.skillId))
    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0)
    const avgRating = Math.round((totalRating / allReviews.length) * 10) / 10

    const stats = {
      skillId: review.skillId,
      rating: avgRating,
      reviewCount: allReviews.length,
      lastUpdated: Date.now()
    }
    await r2p(statsStore.put(stats))

    db.close()

    return { ...record, id: saved }
  }

  /**
   * Get all reviews for a skill
   *
   * @param {string} skillId
   * @returns {Promise<Array>} Reviews list
   */
  async getReviews(skillId) {
    const db = await openReviewDB()
    const tx = db.transaction(REVIEW_STORE_NAME, 'readonly')
    const store = tx.objectStore(REVIEW_STORE_NAME)
    const reviews = await r2p(store.index('skillId').getAll(skillId))
    db.close()
    return reviews || []
  }

  /**
   * Get rating stats for a skill
   *
   * @param {string} skillId
   * @returns {Promise<Object>} Rating stats
   */
  async getStats(skillId) {
    const db = await openReviewDB()
    const tx = db.transaction(STATS_STORE_NAME, 'readonly')
    const store = tx.objectStore(STATS_STORE_NAME)
    const stats = await r2p(store.get(skillId))
    db.close()

    return stats || {
      skillId,
      rating: 0,
      reviewCount: 0,
      lastUpdated: null
    }
  }

  /**
   * Delete a review by author and skill
   *
   * @param {string} skillId
   * @param {string} author
   * @returns {Promise<boolean>} Whether a review was deleted
   */
  async deleteReview(skillId, author) {
    const db = await openReviewDB()
    const tx = db.transaction([REVIEW_STORE_NAME, STATS_STORE_NAME], 'readwrite')
    const store = tx.objectStore(REVIEW_STORE_NAME)
    const reviews = await r2p(store.index('skillId').getAll(skillId))
    const toDelete = reviews.find(r => r.author === author)

    if (!toDelete) {
      db.close()
      return false
    }

    await r2p(store.delete(toDelete.id))

    // Recalculate stats
    const remaining = reviews.filter(r => r.id !== toDelete.id)
    const statsStore = tx.objectStore(STATS_STORE_NAME)

    if (remaining.length === 0) {
      await r2p(statsStore.delete(skillId))
    } else {
      const totalRating = remaining.reduce((sum, r) => sum + r.rating, 0)
      const avgRating = Math.round((totalRating / remaining.length) * 10) / 10
      await r2p(statsStore.put({
        skillId,
        rating: avgRating,
        reviewCount: remaining.length,
        lastUpdated: Date.now()
      }))
    }

    db.close()
    return true
  }
}

// ==================== Version Utilities ====================

/**
 * Parse a semver string into components
 * @param {string} version
 * @returns {{major: number, minor: number, patch: number}}
 */
export function parseVersion(version) {
  const parts = String(version).split('.')
  return {
    major: parseInt(parts[0], 10) || 0,
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0
  }
}

/**
 * Compare two semver versions
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)

  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1
  return 0
}

/**
 * Check if version a is newer than version b
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function isNewerVersion(a, b) {
  return compareVersions(a, b) > 0
}

/**
 * Check if current version meets minimum requirement
 * @param {string} current
 * @param {string} minimum
 * @returns {boolean}
 */
export function isVersionCompatible(current, minimum) {
  return compareVersions(current, minimum) >= 0
}

/**
 * Base64 decode (works in both browser and Node.js)
 * @param {string} str
 * @returns {string}
 */
function base64Decode(str) {
  const cleaned = str.replace(/\s/g, '')
  if (typeof atob !== 'undefined') {
    return atob(cleaned)
  }
  // Node.js fallback
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(cleaned, 'base64').toString('utf-8')
  }
  throw new Error('No base64 decoder available')
}
