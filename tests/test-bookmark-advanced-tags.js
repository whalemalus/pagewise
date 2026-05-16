/**
 * 测试 lib/bookmark-advanced-tags.js — AdvancedTagManager
 *
 * 测试范围 (18 用例):
 *   - Tag Colors: assignColor, getColor, palette, rotation, duplicates
 *   - Tag Hierarchy: setParent, getChildren, getAncestors, cycle guard
 *   - Tag Statistics: getTagStats count/top/coOccurrence
 *   - Auto-tagging: autoTag keyword + domain matching
 *   - Edge cases: empty/null/invalid input
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AdvancedTagManager } from '../lib/bookmark-advanced-tags.js'

// ==================== helpers ====================

function makeBookmark(id, title, url, tags = []) {
  return { id: String(id), title, url, tags }
}

function makeManager(bookmarks) {
  return new AdvancedTagManager({ bookmarks })
}

function sampleBookmarks() {
  return [
    makeBookmark('1', 'React Tutorial', 'https://react.dev/learn', ['react', 'javascript', 'tutorial']),
    makeBookmark('2', 'Vue.js Guide', 'https://vuejs.org/guide', ['vue', 'javascript']),
    makeBookmark('3', 'Python Django Tutorial', 'https://docs.djangoproject.com', ['python', 'tutorial']),
    makeBookmark('4', 'Docker Docs', 'https://docs.docker.com/get-started', ['docker', 'tutorial']),
    makeBookmark('5', 'Rust Book', 'https://doc.rust-lang.org/book', ['rust', 'tutorial']),
    makeBookmark('6', 'Go Concurrency', 'https://go.dev/doc', ['go', 'javascript']),
  ]
}

// ==================== Tag Colors ====================

describe('AdvancedTagManager — Tag Colors', () => {
  it('assignColor 返回 15 色盘中的颜色', () => {
    const m = makeManager()
    const palette = AdvancedTagManager.getPalette()
    const color = m.assignColor('react')
    assert.ok(palette.includes(color))
  })

  it('assignColor 对同一标签返回相同颜色', () => {
    const m = makeManager()
    const c1 = m.assignColor('react')
    const c2 = m.assignColor('react')
    assert.equal(c1, c2)
  })

  it('assignColor 为不同标签分配不同颜色 (前15个)', () => {
    const m = makeManager()
    const colors = new Set()
    for (let i = 0; i < 15; i++) {
      colors.add(m.assignColor(`tag-${i}`))
    }
    assert.equal(colors.size, 15)
  })

  it('getColor 在未分配时自动分配', () => {
    const m = makeManager()
    const c = m.getColor('python')
    const palette = AdvancedTagManager.getPalette()
    assert.ok(palette.includes(c))
    assert.equal(m.getColor('python'), c)
  })

  it('getPalette 返回长度 15 的数组', () => {
    const palette = AdvancedTagManager.getPalette()
    assert.equal(palette.length, 15)
  })

  it('assignColor 空字符串返回第一个颜色', () => {
    const m = makeManager()
    assert.equal(m.assignColor(''), AdvancedTagManager.getPalette()[0])
    assert.equal(m.assignColor(null), AdvancedTagManager.getPalette()[0])
  })
})

// ==================== Tag Hierarchy ====================

describe('AdvancedTagManager — Tag Hierarchy', () => {
  it('setParent / getChildren 建立父子关系', () => {
    const m = makeManager()
    m.setParent('react', 'frontend')
    m.setParent('vue', 'frontend')
    m.setParent('angular', 'frontend')
    const children = m.getChildren('frontend').sort()
    assert.deepEqual(children, ['angular', 'react', 'vue'])
  })

  it('getChildren 无子标签时返回空数组', () => {
    const m = makeManager()
    assert.deepEqual(m.getChildren('nonexistent'), [])
  })

  it('getAncestors 返回完整祖先链', () => {
    const m = makeManager()
    m.setParent('react', 'frontend')
    m.setParent('frontend', 'programming')
    const ancestors = m.getAncestors('react')
    assert.deepEqual(ancestors, ['frontend', 'programming'])
  })

  it('getAncestors 无父标签时返回空数组', () => {
    const m = makeManager()
    assert.deepEqual(m.getAncestors('orphan'), [])
  })

  it('setParent 忽略自引用 (child === parent)', () => {
    const m = makeManager()
    m.setParent('react', 'react')
    assert.deepEqual(m.getAncestors('react'), [])
    assert.deepEqual(m.getChildren('react'), [])
  })

  it('getAncestors 防止循环引用', () => {
    const m = makeManager()
    m.setParent('a', 'b')
    m.setParent('b', 'c')
    m.setParent('c', 'a') // cycle
    const ancestors = m.getAncestors('a')
    // should not infinite loop; should stop
    assert.ok(ancestors.length <= 3)
  })
})

// ==================== Tag Statistics ====================

describe('AdvancedTagManager — Tag Statistics', () => {
  it('getTagStats.count 正确统计标签数量', () => {
    const m = makeManager(sampleBookmarks())
    const stats = m.getTagStats()
    assert.equal(stats.count['tutorial'], 4)
    assert.equal(stats.count['javascript'], 3)
    assert.equal(stats.count['react'], 1)
  })

  it('getTagStats.top 按数量降序排列', () => {
    const m = makeManager(sampleBookmarks())
    const stats = m.getTagStats()
    assert.ok(stats.top.length > 0)
    assert.equal(stats.top[0], 'tutorial')
    // second should be javascript (3 occurrences)
    assert.equal(stats.top[1], 'javascript')
  })

  it('getTagStats.coOccurrence 包含正确的共现对', () => {
    const m = makeManager(sampleBookmarks())
    const stats = m.getTagStats()
    // javascript + tutorial co-occur in bookmark 1
    const pair = stats.coOccurrence.find(
      p => (p.tagA === 'javascript' && p.tagB === 'tutorial') ||
           (p.tagA === 'tutorial' && p.tagB === 'javascript')
    )
    assert.ok(pair, 'coOccurrence should contain javascript+tutorial pair')
    assert.ok(pair.count >= 1)
  })

  it('getTagStats 空书签列表返回空结果', () => {
    const m = makeManager([])
    const stats = m.getTagStats()
    assert.deepEqual(stats.count, {})
    assert.deepEqual(stats.top, [])
    assert.deepEqual(stats.coOccurrence, [])
  })
})

// ==================== Auto-tagging ====================

describe('AdvancedTagManager — Auto-tagging', () => {
  it('autoTag 从标题提取关键词标签', () => {
    const m = makeManager()
    const tags = m.autoTag({ title: 'Learn Python Django REST API', url: 'https://example.com' })
    assert.ok(tags.includes('python'))
    assert.ok(tags.includes('django'))
    assert.ok(tags.includes('rest-api'))
  })

  it('autoTag 从域名提取标签', () => {
    const m = makeManager()
    const tags = m.autoTag({ title: 'Some Page', url: 'https://github.com/user/repo' })
    assert.ok(tags.includes('github'))
  })

  it('autoTag 返回去重标签', () => {
    const m = makeManager()
    const tags = m.autoTag({ title: 'React tutorial', url: 'https://react.dev/docs' })
    // react appears in both keyword match and domain match
    const reactCount = tags.filter(t => t === 'react').length
    assert.equal(reactCount, 1)
  })

  it('autoTag 空输入返回空数组', () => {
    const m = makeManager()
    assert.deepEqual(m.autoTag({}), [])
    assert.deepEqual(m.autoTag(null), [])
    assert.deepEqual(m.autoTag(undefined), [])
  })
})
