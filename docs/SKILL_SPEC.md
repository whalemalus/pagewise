# PageWise Skill Specification v1.0

> This document defines the format, API, and publishing process for PageWise community skills.

## 1. Skill Directory Structure

A skill package must follow this directory layout:

```
my-skill/
├── SKILL.md          # Skill manifest (required)
├── main.js           # Skill entry point (required)
├── README.md         # Documentation (required)
├── test.js           # Automated tests (optional)
├── assets/           # Static assets (optional)
│   └── icon.svg
└── locales/          # i18n translations (optional)
    ├── en.json
    └── zh.json
```

### 1.1 File Descriptions

| File | Required | Description |
|------|----------|-------------|
| `SKILL.md` | Yes | Skill manifest with metadata, parameters, and configuration |
| `main.js` | Yes | Skill logic exported as default |
| `README.md` | Yes | Human-readable documentation, usage examples |
| `test.js` | No | Self-test suite for the skill |
| `assets/` | No | Icons, templates, or other static resources |
| `locales/` | No | Translation files for i18n support |

## 2. SKILL.md Format Specification

`SKILL.md` is a YAML-frontmatter Markdown file that declares skill metadata.

### 2.1 Required Fields

```yaml
---
id: my-awesome-skill        # Unique skill ID (lowercase, hyphens, max 64 chars)
name: Awesome Skill          # Human-readable name (max 100 chars)
version: 1.0.0               # Semantic version (MAJOR.MINOR.PATCH)
description: Brief summary   # One-line description (max 200 chars)
author: Your Name            # Author name or GitHub handle
category: analysis           # Skill category
license: MIT                 # SPDX license identifier
---
```

### 2.2 Optional Fields

```yaml
---
# ... required fields ...

# Detailed description (Markdown body of SKILL.md)
# Write usage instructions, examples, and notes below the frontmatter.

homepage: https://example.com           # Project homepage URL
repository: https://github.com/user/repo # Source code repository
keywords: [summarize, analysis, ai]     # Search keywords (max 10)
minVersion: 2.0.0                       # Minimum PageWise version required

# Parameter definitions
parameters:
  - name: text
    type: string
    description: The text to analyze
    required: true
  - name: language
    type: string
    description: Output language
    required: false
    default: en

# Trigger configuration
trigger:
  type: auto              # manual | auto | keyword | url_pattern
  conditions:
    keywords: [error, exception, trace]   # For keyword type
    urlPattern: ".*\\/api\\/.*"           # For url_pattern type

# Security declarations
permissions:
  - ai_chat               # Can call AI chat API
  - page_read             # Can read current page content
  - storage_read           # Can read from IndexedDB
  # Note: storage_write, network, eval are RESTRICTED

# i18n
locales:
  en: locales/en.json
  zh: locales/zh.json
---
```

### 2.3 Valid Categories

| Category | Description |
|----------|-------------|
| `analysis` | Content analysis, summarization |
| `code` | Code-related operations |
| `debug` | Error diagnosis, debugging |
| `doc` | Documentation processing |
| `learning` | Study aids, flashcards, paths |
| `export` | Content export/formatting |
| `translation` | Language translation |
| `general` | General-purpose skills |

### 2.4 Parameter Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text value | `"hello world"` |
| `number` | Numeric value | `42`, `3.14` |
| `boolean` | True/false | `true` |
| `enum` | Fixed set of values | Options in `values` field |
| `object` | JSON object | `{"key": "value"}` |

## 3. Skill API Interface

### 3.1 main.js Export

```javascript
/**
 * @param {Object} params - User-supplied parameters
 * @param {Object} context - Runtime context
 * @param {Object} context.ai - AI client (chat method)
 * @param {Object} context.page - Current page data
 * @param {Object} context.storage - Skill-local storage
 * @returns {Promise<string|Object>} - Skill result
 */
export default async function execute(params, context) {
  const { text, language = 'en' } = params;
  const response = await context.ai.chat([{
    role: 'user',
    content: `Analyze the following text in ${language}:\n\n${text}`
  }]);
  return response.content;
}
```

### 3.2 Context Object

| Property | Type | Description |
|----------|------|-------------|
| `context.ai` | `Object` | AI client with `chat(messages, options)` method |
| `context.page` | `Object` | Current page: `{ title, url, content, codeBlocks }` |
| `context.storage` | `Object` | Skill-scoped storage: `get(key)`, `set(key, value)`, `delete(key)` |
| `context.skills` | `Object` | Access to other skills: `execute(skillId, params)` |

### 3.3 Return Value

- `string` - Plain text result displayed to user
- `Object` - Structured result with `{ type, content, metadata }`

## 4. Security Model

### 4.1 Permission Levels

| Level | Permission | Risk |
|-------|-----------|------|
| Safe | `ai_chat`, `page_read`, `storage_read` | Low |
| Moderate | `storage_write` | Medium |
| Restricted | `network`, `eval`, `dom_write` | High |

### 4.2 Prohibited Operations

The following are **never** allowed in community skills:

- `eval()`, `new Function()`, or dynamic code execution
- `fetch()` to arbitrary URLs (only through `context.ai` proxy)
- Direct DOM manipulation of PageWise UI
- Access to `chrome.*` extension APIs
- `XMLHttpRequest` or WebSocket connections
- Modification of extension storage outside skill scope
- File system access
- `import()` dynamic imports
- `setTimeout`/`setInterval` with code strings

### 4.3 Validation Pipeline

Every skill passes through the validation pipeline before execution:

```
1. Format Check   → SKILL.md schema validation
2. Code Scan      → Static analysis for prohibited APIs
3. Size Check     → Total package size <= 500KB
4. Permission Check → Only declared permissions used
5. Version Check  → Compatible with current PageWise
```

## 5. Publishing Process

### 5.1 Creating a Skill

1. Create a directory following the structure in Section 1
2. Fill in `SKILL.md` with all required fields
3. Implement `main.js` with the `execute()` export
4. Write `README.md` with usage instructions
5. Optionally add `test.js` for automated tests
6. Run `PageWise Skill Validator` to check your skill

### 5.2 Exporting a Skill

Skills can be exported as `.pwskill` ZIP files:

```javascript
import { SkillPackageManager } from './lib/skill-store.js';

const pkg = new SkillPackageManager();
const zipBlob = await pkg.exportSkill('my-skill-id');
// zipBlob can be saved as my-skill.pwskill
```

### 5.3 Installing a Skill

```javascript
// From file
await pkg.importSkill(zipBlob);

// From GitHub repository
await pkg.installFromGitHub('user/repo');

// From remote URL
await pkg.installFromUrl('https://example.com/skill.pwskill');
```

### 5.4 Version Management

Skills follow Semantic Versioning:

- **MAJOR**: Breaking changes to parameters or API
- **MINOR**: New parameters or features (backward compatible)
- **PATCH**: Bug fixes

Version constraints are checked during import:

```
skill.minVersion: "2.0.0"  → requires PageWise >= 2.0.0
skill.version: "1.2.3"     → skill's own version
```

### 5.5 Community Workflow

```
1. Fork → Create skill repository
2. Develop → Follow spec, write tests
3. Validate → Run skill validator locally
4. Submit → Create .pwskill package
5. Review → Community code review
6. Publish → Listed in skill marketplace
7. Update → Version bump, changelog
```

## 6. Skill Package Format (.pwskill)

The `.pwskill` file is a standard ZIP archive containing:

```
skill.pwskill (ZIP)
├── SKILL.md          # Manifest
├── main.js           # Entry point
├── README.md         # Documentation
├── test.js           # Tests (optional)
├── assets/           # Resources (optional)
├── locales/          # Translations (optional)
└── .skillmeta.json   # Auto-generated metadata
    {
      "exportedAt": "2026-05-13T00:00:00Z",
      "exportedBy": "PageWise/2.0.0",
      "checksum": "sha256:..."
    }
```

## 7. Rating and Review System

### 7.1 Rating Schema

```javascript
{
  skillId: "my-skill",
  rating: 4.5,          // 1-5 stars
  reviewCount: 42,
  reviews: [
    {
      author: "user123",
      rating: 5,
      comment: "Great skill!",
      version: "1.2.0",
      createdAt: "2026-05-01T00:00:00Z"
    }
  ],
  installCount: 1500,
  lastUpdated: "2026-05-10T00:00:00Z"
}
```

### 7.2 Trust Levels

| Level | Criteria | Badge |
|-------|----------|-------|
| New | < 10 installs, no reviews | None |
| Popular | >= 100 installs, rating >= 3.5 | Popular |
| Trusted | >= 500 installs, rating >= 4.0, verified author | Trusted |
| Official | Published by PageWise team | Official |
