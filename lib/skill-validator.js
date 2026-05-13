/**
 * Skill Validator — Community skill format validation & security checks
 *
 * Validates skill packages against the SKILL_SPEC.md specification.
 * Performs static security analysis to detect prohibited operations.
 */

// ==================== Constants ====================

/** Maximum skill package size (500KB) */
const MAX_PACKAGE_SIZE = 500 * 1024

/** Maximum individual file size (200KB) */
const MAX_FILE_SIZE = 200 * 1024

/** Valid skill ID pattern: lowercase, hyphens, numbers, max 64 chars */
const ID_PATTERN = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/

/** Valid semver pattern */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

/** Valid categories */
const VALID_CATEGORIES = [
  'analysis', 'code', 'debug', 'doc', 'learning',
  'export', 'translation', 'general'
]

/** Required files in a skill package */
const REQUIRED_FILES = ['SKILL.md', 'main.js', 'README.md']

/** Allowed file extensions */
const ALLOWED_EXTENSIONS = ['.md', '.js', '.json', '.svg', '.png', '.jpg', '.css', '.txt']

/** Prohibited JavaScript patterns (security) */
const PROHIBITED_PATTERNS = [
  { pattern: /\beval\s*\(/, name: 'eval()', risk: 'critical' },
  { pattern: /new\s+Function\s*\(/, name: 'new Function()', risk: 'critical' },
  { pattern: /\bchrome\./, name: 'chrome.* API access', risk: 'critical' },
  { pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest', risk: 'high' },
  { pattern: /\bWebSocket\b/, name: 'WebSocket', risk: 'high' },
  { pattern: /\bimport\s*\(/, name: 'dynamic import()', risk: 'high' },
  { pattern: /require\s*\(/, name: 'require()', risk: 'high' },
  { pattern: /\bfetch\s*\(/, name: 'fetch() (use context.ai instead)', risk: 'medium' },
  { pattern: /\bsetTimeout\s*\(.*["'`]/s, name: 'setTimeout with string', risk: 'critical' },
  { pattern: /\bsetInterval\s*\(.*["'`]/s, name: 'setInterval with string', risk: 'critical' },
  { pattern: /document\.\s*(write|createElement|getElementById)/, name: 'DOM manipulation', risk: 'high' },
  { pattern: /window\.\s*(open|location|localStorage)/, name: 'window object access', risk: 'high' },
  { pattern: /\bprocess\./, name: 'Node.js process access', risk: 'critical' },
  { pattern: /\brequire\s*\(\s*["']child_process["']\s*\)/, name: 'child_process', risk: 'critical' },
  { pattern: /\brequire\s*\(\s*["']fs["']\s*\)/, name: 'fs module', risk: 'critical' },
  { pattern: /\brequire\s*\(\s*["']net["']\s*\)/, name: 'net module', risk: 'critical' },
]

// ==================== SKILL.md Parser ====================

/**
 * Parse SKILL.md frontmatter and body
 * @param {string} content - SKILL.md content
 * @returns {{frontmatter: Object, body: string}}
 */
export function parseSkillManifest(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md must contain YAML frontmatter delimited by ---')
  }

  const yamlStr = match[1]
  const body = match[2].trim()
  const frontmatter = parseSimpleYaml(yamlStr)

  return { frontmatter, body }
}

/**
 * Simple YAML parser for skill manifests
 * Handles: strings, numbers, booleans, arrays, nested objects (2 levels)
 * @param {string} yaml
 * @returns {Object}
 */
export function parseSimpleYaml(yaml) {
  const result = {}
  const lines = yaml.split(/\r?\n/)
  let currentKey = null
  let currentArray = null
  let currentObject = null
  let inBlock = false
  let blockIndent = 0

  /**
   * Flush pending array/object into result
   */
  function flushPending() {
    if (currentArray !== null && currentKey) {
      if (currentObject !== null) {
        currentArray.push(currentObject)
        currentObject = null
      }
      result[currentKey] = currentArray
      currentArray = null
    } else if (currentObject !== null && currentKey) {
      result[currentKey] = currentObject
      currentObject = null
    }
    currentKey = null
    inBlock = false
  }

  for (const line of lines) {
    // Skip empty lines and comments
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue

    const indent = line.search(/\S/)
    const trimmed = line.trim()

    // Top-level key-value pair
    if (indent === 0) {
      flushPending()

      const colonIdx = trimmed.indexOf(':')
      if (colonIdx > 0) {
        currentKey = trimmed.substring(0, colonIdx).trim()
        const value = trimmed.substring(colonIdx + 1).trim()

        if (value === '' || value === '|' || value === '>') {
          // Value is on next lines (array or multiline)
          inBlock = true
          blockIndent = 0
        } else {
          result[currentKey] = parseYamlValue(value)
          currentKey = null
          inBlock = false
        }
      }
    } else if (indent > 0 && currentKey) {
      // Nested content
      inBlock = true
      if (blockIndent === 0) blockIndent = indent

      if (trimmed.startsWith('- ')) {
        // Array item (indicated by "- ")
        const itemValue = trimmed.substring(2).trim()

        // Save current object before starting new item
        if (currentObject !== null && Object.keys(currentObject).length > 0) {
          if (currentArray === null) currentArray = []
          currentArray.push(currentObject)
          currentObject = null
        }
        if (currentArray === null) currentArray = []

        // Check if array item is an object (has colon, not quoted)
        if (itemValue.includes(': ') && !itemValue.startsWith('"') && !itemValue.startsWith("'")) {
          currentObject = {}
          const objColonIdx = itemValue.indexOf(':')
          const objKey = itemValue.substring(0, objColonIdx).trim()
          const objVal = itemValue.substring(objColonIdx + 1).trim()
          currentObject[objKey] = parseYamlValue(objVal)
        } else {
          // Simple array value
          if (currentObject !== null) {
            currentArray.push(currentObject)
            currentObject = null
          }
          currentArray.push(parseYamlValue(itemValue))
        }
      } else if (trimmed.includes(': ') && !trimmed.startsWith('-')) {
        // Nested key-value (object property)
        const colonIdx = trimmed.indexOf(':')
        const nestedKey = trimmed.substring(0, colonIdx).trim()
        const nestedVal = trimmed.substring(colonIdx + 1).trim()

        if (currentObject !== null) {
          // Adding property to current array item object
          if (nestedVal) {
            currentObject[nestedKey] = parseYamlValue(nestedVal)
          }
        } else {
          // Standalone nested object (not in array context)
          if (currentObject === null) {
            currentObject = {}
          }
          if (nestedVal) {
            currentObject[nestedKey] = parseYamlValue(nestedVal)
          }
        }
      }
    }
  }

  // Save final block
  flushPending()

  return result
}

/**
 * Parse a YAML value string
 */
function parseYamlValue(str) {
  if (!str || str === '~' || str === 'null') return null
  if (str === 'true') return true
  if (str === 'false') return false

  // Quoted string
  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1)
  }

  // Array inline: [a, b, c]
  if (str.startsWith('[') && str.endsWith(']')) {
    return str.slice(1, -1).split(',').map(s => parseYamlValue(s.trim()))
  }

  // Number
  const num = Number(str)
  if (!isNaN(num) && str.trim() !== '') return num

  return str
}

// ==================== Validation ====================

/**
 * Validation error
 */
export class ValidationError extends Error {
  constructor(message, { field = null, severity = 'error' } = {}) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
    this.severity = severity  // 'error' | 'warning'
  }
}

/**
 * Validation result
 */
export class ValidationResult {
  constructor() {
    /** @type {ValidationError[]} */
    this.errors = []
    /** @type {ValidationError[]} */
    this.warnings = []
  }

  get valid() {
    return this.errors.length === 0
  }

  addError(message, field = null) {
    this.errors.push(new ValidationError(message, { field, severity: 'error' }))
  }

  addWarning(message, field = null) {
    this.warnings.push(new ValidationError(message, { field, severity: 'warning' }))
  }

  /**
   * Merge another result into this one
   * @param {ValidationResult} other
   */
  merge(other) {
    this.errors.push(...other.errors)
    this.warnings.push(...other.warnings)
  }

  /**
   * Get summary string
   * @returns {string}
   */
  toString() {
    const lines = []
    if (this.valid) {
      lines.push('Validation passed')
    } else {
      lines.push(`Validation failed with ${this.errors.length} error(s)`)
    }
    if (this.warnings.length > 0) {
      lines.push(`${this.warnings.length} warning(s)`)
    }
    for (const err of this.errors) {
      lines.push(`  ERROR${err.field ? ` [${err.field}]` : ''}: ${err.message}`)
    }
    for (const warn of this.warnings) {
      lines.push(`  WARN${warn.field ? ` [${warn.field}]` : ''}: ${warn.message}`)
    }
    return lines.join('\n')
  }
}

/**
 * Validate SKILL.md manifest fields
 * @param {Object} frontmatter - Parsed frontmatter
 * @returns {ValidationResult}
 */
export function validateManifest(frontmatter) {
  const result = new ValidationResult()

  // Required fields
  const requiredFields = ['id', 'name', 'version', 'description', 'author', 'category', 'license']
  for (const field of requiredFields) {
    if (!frontmatter[field]) {
      result.addError(`Missing required field: ${field}`, field)
    }
  }

  // ID format
  if (frontmatter.id) {
    if (!ID_PATTERN.test(frontmatter.id)) {
      result.addError(
        `Invalid skill ID "${frontmatter.id}": must be lowercase alphanumeric with hyphens, 2-64 chars, start with letter`,
        'id'
      )
    }
  }

  // Name length
  if (frontmatter.name && frontmatter.name.length > 100) {
    result.addError('Skill name exceeds 100 characters', 'name')
  }

  // Version format
  if (frontmatter.version) {
    if (!SEMVER_PATTERN.test(frontmatter.version)) {
      result.addError(`Invalid version "${frontmatter.version}": must be semver (MAJOR.MINOR.PATCH)`, 'version')
    }
  }

  // minVersion format
  if (frontmatter.minVersion) {
    if (!SEMVER_PATTERN.test(String(frontmatter.minVersion))) {
      result.addError(`Invalid minVersion "${frontmatter.minVersion}": must be semver`, 'minVersion')
    }
  }

  // Description length
  if (frontmatter.description && frontmatter.description.length > 200) {
    result.addWarning('Description exceeds 200 characters', 'description')
  }

  // Category
  if (frontmatter.category && !VALID_CATEGORIES.includes(frontmatter.category)) {
    result.addError(
      `Invalid category "${frontmatter.category}": must be one of ${VALID_CATEGORIES.join(', ')}`,
      'category'
    )
  }

  // Parameters validation
  if (frontmatter.parameters) {
    if (!Array.isArray(frontmatter.parameters)) {
      result.addError('Parameters must be an array', 'parameters')
    } else {
      const validTypes = ['string', 'number', 'boolean', 'enum', 'object']
      for (let i = 0; i < frontmatter.parameters.length; i++) {
        const param = frontmatter.parameters[i]
        if (!param.name) {
          result.addError(`Parameter ${i} missing name`, `parameters[${i}]`)
        }
        if (!param.type) {
          result.addError(`Parameter ${i} missing type`, `parameters[${i}]`)
        } else if (!validTypes.includes(param.type)) {
          result.addError(
            `Parameter ${i} has invalid type "${param.type}"`,
            `parameters[${i}]`
          )
        }
      }
    }
  }

  // Trigger validation
  if (frontmatter.trigger) {
    const validTriggerTypes = ['manual', 'auto', 'keyword', 'url_pattern']
    if (!frontmatter.trigger.type || !validTriggerTypes.includes(frontmatter.trigger.type)) {
      result.addError(
        `Invalid trigger type: must be one of ${validTriggerTypes.join(', ')}`,
        'trigger'
      )
    }
  }

  // Keywords validation
  if (frontmatter.keywords) {
    if (!Array.isArray(frontmatter.keywords)) {
      result.addError('Keywords must be an array', 'keywords')
    } else if (frontmatter.keywords.length > 10) {
      result.addWarning('Too many keywords (max 10 recommended)', 'keywords')
    }
  }

  return result
}

// ==================== Security Scan ====================

/**
 * Security scan result
 */
export class SecurityScanResult {
  constructor() {
    /** @type {Array<{file: string, pattern: string, risk: string, line: number}>} */
    this.findings = []
  }

  get safe() {
    return this.findings.length === 0
  }

  get criticalCount() {
    return this.findings.filter(f => f.risk === 'critical').length
  }

  get highCount() {
    return this.findings.filter(f => f.risk === 'high').length
  }

  addFinding(file, pattern, risk, line = 0) {
    this.findings.push({ file, pattern, risk, line })
  }

  toString() {
    if (this.safe) return 'Security scan passed'
    const lines = [`Security scan found ${this.findings.length} issue(s):`]
    for (const f of this.findings) {
      lines.push(`  [${f.risk.toUpperCase()}] ${f.file}:${f.line} — ${f.pattern}`)
    }
    return lines.join('\n')
  }
}

/**
 * Scan JavaScript code for prohibited patterns
 * @param {string} code - JavaScript source code
 * @param {string} filename - Filename for reporting
 * @returns {SecurityScanResult}
 */
export function scanCode(code, filename = 'unknown') {
  const result = new SecurityScanResult()
  const lines = code.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Skip comments
    if (/^\s*\/\//.test(line)) continue

    for (const { pattern, name, risk } of PROHIBITED_PATTERNS) {
      if (pattern.test(line)) {
        result.addFinding(filename, name, risk, i + 1)
      }
    }
  }

  return result
}

/**
 * Scan all JS files in a skill package
 * @param {Array<{name: string, content: string}>} files
 * @returns {SecurityScanResult}
 */
export function scanPackage(files) {
  const result = new SecurityScanResult()

  for (const file of files) {
    if (file.name.endsWith('.js')) {
      const fileResult = scanCode(file.content, file.name)
      result.findings.push(...fileResult.findings)
    }
  }

  return result
}

// ==================== Package Size Validation ====================

/**
 * Validate package file sizes
 * @param {Array<{name: string, content: string|Uint8Array}>} files
 * @returns {ValidationResult}
 */
export function validatePackageSize(files) {
  const result = new ValidationResult()

  let totalSize = 0
  for (const file of files) {
    const size = typeof file.content === 'string' ? file.content.length : file.content.byteLength
    totalSize += size

    if (size > MAX_FILE_SIZE) {
      result.addError(
        `File "${file.name}" exceeds maximum size (${(size / 1024).toFixed(1)}KB > ${MAX_FILE_SIZE / 1024}KB)`,
        file.name
      )
    }

    // Check file extension
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
    if (ext && !ALLOWED_EXTENSIONS.includes(ext) && file.name !== 'SKILL.md') {
      result.addWarning(
        `File "${file.name}" has disallowed extension "${ext}"`,
        file.name
      )
    }
  }

  if (totalSize > MAX_PACKAGE_SIZE) {
    result.addError(
      `Package size exceeds maximum (${(totalSize / 1024).toFixed(1)}KB > ${MAX_PACKAGE_SIZE / 1024}KB)`,
      'package'
    )
  }

  return result
}

// ==================== Full Validation Pipeline ====================

/**
 * Validate a complete skill package
 *
 * @param {Array<{name: string, content: string}>} files - Package files
 * @returns {ValidationResult}
 */
export function validateSkillPackage(files) {
  const result = new ValidationResult()

  // 1. Check required files
  const fileNames = files.map(f => f.name)
  for (const required of REQUIRED_FILES) {
    if (!fileNames.includes(required)) {
      result.addError(`Missing required file: ${required}`)
    }
  }

  // 2. Validate package size
  const sizeResult = validatePackageSize(files)
  result.merge(sizeResult)

  // 3. Parse and validate SKILL.md
  const skillMd = files.find(f => f.name === 'SKILL.md')
  if (skillMd) {
    try {
      const { frontmatter } = parseSkillManifest(skillMd.content)
      const manifestResult = validateManifest(frontmatter)
      result.merge(manifestResult)
    } catch (e) {
      result.addError(`Failed to parse SKILL.md: ${e.message}`, 'SKILL.md')
    }
  }

  // 4. Security scan
  const securityResult = scanPackage(files)
  if (!securityResult.safe) {
    for (const finding of securityResult.findings) {
      if (finding.risk === 'critical') {
        result.addError(
          `Security: ${finding.pattern} found in ${finding.file}:${finding.line}`,
          finding.file
        )
      } else if (finding.risk === 'high') {
        result.addError(
          `Security: ${finding.pattern} found in ${finding.file}:${finding.line}`,
          finding.file
        )
      } else {
        result.addWarning(
          `Security: ${finding.pattern} found in ${finding.file}:${finding.line}`,
          finding.file
        )
      }
    }
  }

  return result
}
