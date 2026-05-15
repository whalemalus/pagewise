/**
 * Tests for BookmarkDocumentation — 用户文档与帮助系统模块
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOC_MODULES,
  DOC_FAQ,
  DOC_SECTIONS,
  DOC_CATEGORIES,
  getDocIndex,
  getModuleDoc,
  searchDocs,
  getFAQ,
  validateDocCompleteness,
  generateAPITable,
} from '../lib/bookmark-documentation.js'

// ==================== DOC_CATEGORIES 常量 ====================

describe('DOC_CATEGORIES', () => {
  it('应包含所有文档分类', () => {
    assert.ok(DOC_CATEGORIES.CORE)
    assert.ok(DOC_CATEGORIES.SEARCH)
    assert.ok(DOC_CATEGORIES.ANALYSIS)
    assert.ok(DOC_CATEGORIES.AI)
    assert.ok(DOC_CATEGORIES.UI)
    assert.ok(DOC_CATEGORIES.DATA)
    assert.ok(DOC_CATEGORIES.INFRA)
  })

  it('应为冻结对象', () => {
    assert.ok(Object.isFrozen(DOC_CATEGORIES))
  })
})

// ==================== DOC_MODULES 常量 ====================

describe('DOC_MODULES', () => {
  it('应为非空数组', () => {
    assert.ok(Array.isArray(DOC_MODULES))
    assert.ok(DOC_MODULES.length > 0)
  })

  it('每个模块应有 name, category, description, exports 字段', () => {
    for (const mod of DOC_MODULES) {
      assert.ok(typeof mod.name === 'string', `${mod} should have name`)
      assert.ok(typeof mod.category === 'string', `${mod.name} should have category`)
      assert.ok(typeof mod.description === 'string', `${mod.name} should have description`)
      assert.ok(Array.isArray(mod.exports), `${mod.name} should have exports array`)
    }
  })

  it('每个导出项应有 name 和 signature 字段', () => {
    for (const mod of DOC_MODULES) {
      for (const exp of mod.exports) {
        assert.ok(typeof exp.name === 'string', `${mod.name} export should have name`)
        assert.ok(typeof exp.signature === 'string', `${mod.name}.${exp.name} should have signature`)
      }
    }
  })

  it('模块 name 应与文件名一致的命名模式', () => {
    for (const mod of DOC_MODULES) {
      assert.ok(
        mod.name.startsWith('Bookmark'),
        `模块名 "${mod.name}" 应以 Bookmark 开头`
      )
    }
  })

  it('模块 category 应属于已知分类', () => {
    const knownCategories = Object.values(DOC_CATEGORIES)
    for (const mod of DOC_MODULES) {
      assert.ok(
        knownCategories.includes(mod.category),
        `模块 "${mod.name}" 的 category "${mod.category}" 不属于已知分类`
      )
    }
  })
})

// ==================== DOC_FAQ 常量 ====================

describe('DOC_FAQ', () => {
  it('应为非空数组', () => {
    assert.ok(Array.isArray(DOC_FAQ))
    assert.ok(DOC_FAQ.length > 0)
  })

  it('每个 FAQ 应有 question, answer, category 字段', () => {
    for (const faq of DOC_FAQ) {
      assert.ok(typeof faq.question === 'string', 'FAQ should have question')
      assert.ok(typeof faq.answer === 'string', 'FAQ should have answer')
      assert.ok(typeof faq.category === 'string', 'FAQ should have category')
    }
  })

  it('FAQ question 不应为空', () => {
    for (const faq of DOC_FAQ) {
      assert.ok(faq.question.trim().length > 0, 'FAQ question should not be empty')
    }
  })

  it('FAQ answer 不应为空', () => {
    for (const faq of DOC_FAQ) {
      assert.ok(faq.answer.trim().length > 0, 'FAQ answer should not be empty')
    }
  })
})

// ==================== DOC_SECTIONS 常量 ====================

describe('DOC_SECTIONS', () => {
  it('应为非空数组', () => {
    assert.ok(Array.isArray(DOC_SECTIONS))
    assert.ok(DOC_SECTIONS.length > 0)
  })

  it('每个章节应有 id, title, content 字段', () => {
    for (const section of DOC_SECTIONS) {
      assert.ok(typeof section.id === 'string', 'section should have id')
      assert.ok(typeof section.title === 'string', 'section should have title')
      assert.ok(typeof section.content === 'string', 'section should have content')
    }
  })

  it('章节 id 应唯一', () => {
    const ids = DOC_SECTIONS.map(s => s.id)
    const unique = new Set(ids)
    assert.equal(ids.length, unique.size, '章节 id 应唯一')
  })

  it('章节 id 不应为空', () => {
    for (const section of DOC_SECTIONS) {
      assert.ok(section.id.trim().length > 0, 'section id should not be empty')
    }
  })
})

// ==================== getDocIndex ====================

describe('getDocIndex', () => {
  it('应返回包含 sections 和 modules 的对象', () => {
    const index = getDocIndex()
    assert.ok(Array.isArray(index.sections))
    assert.ok(Array.isArray(index.modules))
    assert.ok(typeof index.totalModules === 'number')
    assert.ok(typeof index.totalSections === 'number')
  })

  it('索引应包含正确的统计数字', () => {
    const index = getDocIndex()
    assert.equal(index.totalModules, DOC_MODULES.length)
    assert.equal(index.totalSections, DOC_SECTIONS.length)
  })

  it('索引 sections 应包含 id 和 title', () => {
    const index = getDocIndex()
    for (const section of index.sections) {
      assert.ok(section.id)
      assert.ok(section.title)
    }
  })

  it('索引 modules 应按 category 分组', () => {
    const index = getDocIndex()
    for (const mod of index.modules) {
      assert.ok(mod.name)
      assert.ok(mod.category)
    }
  })
})

// ==================== getModuleDoc ====================

describe('getModuleDoc', () => {
  it('应返回存在的模块文档', () => {
    const firstModule = DOC_MODULES[0]
    const doc = getModuleDoc(firstModule.name)
    assert.ok(doc)
    assert.equal(doc.name, firstModule.name)
  })

  it('应返回包含所有字段的文档', () => {
    const firstModule = DOC_MODULES[0]
    const doc = getModuleDoc(firstModule.name)
    assert.ok(doc.description)
    assert.ok(Array.isArray(doc.exports))
    assert.ok(doc.category)
    assert.ok(typeof doc.complexity === 'string')
  })

  it('不存在的模块应返回 null', () => {
    const doc = getModuleDoc('NonExistentModule')
    assert.equal(doc, null)
  })

  it('null 输入应返回 null', () => {
    assert.equal(getModuleDoc(null), null)
  })

  it('undefined 输入应返回 null', () => {
    assert.equal(getModuleDoc(undefined), null)
  })

  it('大小写不敏感匹配', () => {
    if (DOC_MODULES.length > 0) {
      const name = DOC_MODULES[0].name
      const doc = getModuleDoc(name.toLowerCase())
      assert.ok(doc)
    }
  })
})

// ==================== searchDocs ====================

describe('searchDocs', () => {
  it('应返回匹配结果数组', () => {
    const results = searchDocs('书签')
    assert.ok(Array.isArray(results))
  })

  it('应能搜索模块描述', () => {
    const firstModule = DOC_MODULES[0]
    if (firstModule && firstModule.description) {
      const keyword = firstModule.description.slice(0, 2)
      const results = searchDocs(keyword)
      assert.ok(results.some(r => r.type === 'module'))
    }
  })

  it('应能搜索 FAQ', () => {
    const results = searchDocs('FAQ')
    assert.ok(Array.isArray(results))
  })

  it('空查询应返回空数组', () => {
    const results = searchDocs('')
    assert.deepEqual(results, [])
  })

  it('null 查询应返回空数组', () => {
    const results = searchDocs(null)
    assert.deepEqual(results, [])
  })

  it('应能搜索章节内容', () => {
    const results = searchDocs('安装')
    assert.ok(results.some(r => r.type === 'section'))
  })

  it('应返回结果包含 type, name, relevance 字段', () => {
    const results = searchDocs('搜索')
    for (const r of results) {
      assert.ok(r.type, 'result should have type')
      assert.ok(r.name, 'result should have name')
      assert.ok(typeof r.relevance === 'number', 'result should have relevance score')
    }
  })

  it('无匹配应返回空数组', () => {
    const results = searchDocs('zzzzzzzznotfound')
    assert.deepEqual(results, [])
  })
})

// ==================== getFAQ ====================

describe('getFAQ', () => {
  it('无参数应返回所有 FAQ', () => {
    const faqs = getFAQ()
    assert.equal(faqs.length, DOC_FAQ.length)
  })

  it('应能按 category 过滤', () => {
    if (DOC_FAQ.length > 0) {
      const category = DOC_FAQ[0].category
      const faqs = getFAQ(category)
      assert.ok(faqs.length > 0)
      for (const faq of faqs) {
        assert.equal(faq.category, category)
      }
    }
  })

  it('不存在的 category 应返回空数组', () => {
    const faqs = getFAQ('nonexistent_category')
    assert.deepEqual(faqs, [])
  })

  it('返回结果应包含 question 和 answer', () => {
    const faqs = getFAQ()
    for (const faq of faqs) {
      assert.ok(faq.question)
      assert.ok(faq.answer)
    }
  })
})

// ==================== validateDocCompleteness ====================

describe('validateDocCompleteness', () => {
  it('应返回验证结果对象', () => {
    const result = validateDocCompleteness()
    assert.ok(typeof result.complete === 'boolean')
    assert.ok(typeof result.totalModules === 'number')
    assert.ok(typeof result.documentedModules === 'number')
    assert.ok(Array.isArray(result.covered))
    assert.ok(Array.isArray(result.missing))
  })

  it('documentedModules 应等于覆盖数组长度', () => {
    const result = validateDocCompleteness()
    assert.equal(result.documentedModules, result.covered.length)
  })

  it('totalModules 应等于 covered + missing 的长度', () => {
    const result = validateDocCompleteness()
    assert.equal(result.totalModules, result.covered.length + result.missing.length)
  })

  it('coverageRate 应在 0 到 1 之间', () => {
    const result = validateDocCompleteness()
    assert.ok(result.coverageRate >= 0)
    assert.ok(result.coverageRate <= 1)
  })
})

// ==================== generateAPITable ====================

describe('generateAPITable', () => {
  it('无参数应生成所有模块的 API 表', () => {
    const table = generateAPITable()
    assert.ok(typeof table === 'string')
    assert.ok(table.length > 0)
  })

  it('应包含 Markdown 表头', () => {
    const table = generateAPITable()
    assert.ok(table.includes('| 模块 |'))
    assert.ok(table.includes('|---'))
  })

  it('应包含模块名', () => {
    if (DOC_MODULES.length > 0) {
      const table = generateAPITable()
      assert.ok(table.includes(DOC_MODULES[0].name))
    }
  })

  it('指定模块名应只生成该模块的 API 表', () => {
    if (DOC_MODULES.length > 0) {
      const name = DOC_MODULES[0].name
      const table = generateAPITable([name])
      assert.ok(table.includes(name))
    }
  })

  it('空数组参数应返回空表头', () => {
    const table = generateAPITable([])
    assert.ok(typeof table === 'string')
    assert.ok(table.includes('|'))
  })
})
