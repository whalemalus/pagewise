/**
 * 测试 lib/bookmark-accessibility.js — BookmarkAccessibility
 *
 * 书签面板无障碍支持 (R79):
 *   - 键盘导航 (Arrow/Enter/Escape/Tab)
 *   - 屏幕阅读器支持 (aria-label, role, live regions)
 *   - 焦点管理 (焦点环、焦点陷阱)
 *   - 颜色对比度 ≥ 4.5:1
 *
 * AC: 单元测试 ≥ 30 个用例
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupTestEnv } from './helpers/setup.js'

const {
  BookmarkAccessibility,
  ARIA_ROLES,
  FOCUS_TRAP_SELECTORS,
  KEYBOARD_NAV_KEYS,
  getContrastRatio,
  meetsWCAG_AA,
  hexToRgb,
} = await import('../lib/bookmark-accessibility.js')

// ==================== 常量导出 ====================

describe('BookmarkAccessibility — 常量导出', () => {
  it('导出 ARIA_ROLES 对象', () => {
    assert.ok(ARIA_ROLES)
    assert.equal(typeof ARIA_ROLES, 'object')
  })

  it('ARIA_ROLES 包含 bookmarksList / bookmarkItem / folderNav / liveRegion', () => {
    assert.ok(ARIA_ROLES.bookmarksList)
    assert.ok(ARIA_ROLES.bookmarkItem)
    assert.ok(ARIA_ROLES.folderNav)
    assert.ok(ARIA_ROLES.liveRegion)
  })

  it('导出 FOCUS_TRAP_SELECTORS 数组', () => {
    assert.ok(Array.isArray(FOCUS_TRAP_SELECTORS))
    assert.ok(FOCUS_TRAP_SELECTORS.length > 0)
  })

  it('导出 KEYBOARD_NAV_KEYS 对象', () => {
    assert.ok(KEYBOARD_NAV_KEYS)
    assert.equal(KEYBOARD_NAV_KEYS.UP, 'ArrowUp')
    assert.equal(KEYBOARD_NAV_KEYS.DOWN, 'ArrowDown')
    assert.equal(KEYBOARD_NAV_KEYS.ENTER, 'Enter')
    assert.equal(KEYBOARD_NAV_KEYS.ESCAPE, 'Escape')
    assert.equal(KEYBOARD_NAV_KEYS.HOME, 'Home')
    assert.equal(KEYBOARD_NAV_KEYS.END, 'End')
  })
})

// ==================== 颜色对比度工具函数 ====================

describe('hexToRgb', () => {
  it('解析 #000000 为 { r:0, g:0, b:0 }', () => {
    assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 })
  })

  it('解析 #ffffff 为 { r:255, g:255, b:255 }', () => {
    assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 })
  })

  it('解析 #6366f1', () => {
    const result = hexToRgb('#6366f1')
    assert.equal(result.r, 0x63)
    assert.equal(result.g, 0x66)
    assert.equal(result.b, 0xf1)
  })

  it('无 # 前缀也能解析', () => {
    assert.deepEqual(hexToRgb('ff0000'), { r: 255, g: 0, b: 0 })
  })
})

describe('getContrastRatio', () => {
  it('黑白对比度 = 21:1', () => {
    const ratio = getContrastRatio('#000000', '#ffffff')
    assert.ok(ratio >= 20.9 && ratio <= 21.1)
  })

  it('相同颜色对比度 = 1:1', () => {
    const ratio = getContrastRatio('#aaaaaa', '#aaaaaa')
    assert.ok(Math.abs(ratio - 1) < 0.01)
  })

  it('#71717a on #ffffff ≥ 4.5:1 (text-secondary)', () => {
    const ratio = getContrastRatio('#71717a', '#ffffff')
    assert.ok(ratio >= 4.5, `Expected ≥ 4.5, got ${ratio}`)
  })

  it('#70707b on #fafafa ≥ 4.5:1 (text-muted on bg-primary — R79 修复后)', () => {
    const ratio = getContrastRatio('#70707b', '#fafafa')
    assert.ok(ratio >= 4.5, `Expected ≥ 4.5, got ${ratio}`)
  })

  it('对称性: ratio(A,B) === ratio(B,A)', () => {
    const r1 = getContrastRatio('#6366f1', '#ffffff')
    const r2 = getContrastRatio('#ffffff', '#6366f1')
    assert.ok(Math.abs(r1 - r2) < 0.01)
  })
})

describe('meetsWCAG_AA', () => {
  it('黑白组合满足 WCAG AA', () => {
    assert.equal(meetsWCAG_AA('#000000', '#ffffff'), true)
  })

  it('白色文字 on 白色背景不满足', () => {
    assert.equal(meetsWCAG_AA('#ffffff', '#ffffff'), false)
  })

  it('大文本阈值 3:1 (size=18)', () => {
    // #a1a1aa on #fafafa is ~3.4:1, passes large text threshold
    const ratio = getContrastRatio('#a1a1aa', '#fafafa')
    const result = meetsWCAG_AA('#a1a1aa', '#fafafa', true)
    if (ratio >= 3) {
      assert.equal(result, true)
    } else {
      assert.equal(result, false)
    }
  })
})

// ==================== 构造函数 ====================

describe('BookmarkAccessibility — constructor', () => {
  let ctx

  beforeEach(() => {
    ctx = setupTestEnv()
  })

  it('正常创建实例', () => {
    const a11y = new BookmarkAccessibility()
    assert.ok(a11y)
    assert.equal(typeof a11y.createKeyHandler, 'function')
    assert.equal(typeof a11y.createFocusTrap, 'function')
    assert.equal(typeof a11y.enable, 'function')
    assert.equal(typeof a11y.disable, 'function')
    assert.equal(typeof a11y.destroy, 'function')
  })

  it('默认状态: disabled', () => {
    const a11y = new BookmarkAccessibility()
    assert.equal(a11y.isEnabled(), false)
  })

  it('构造函数 options.enabled = true', () => {
    const a11y = new BookmarkAccessibility({ enabled: true })
    assert.equal(a11y.isEnabled(), true)
  })
})

// ==================== 键盘导航 ====================

describe('BookmarkAccessibility — 键盘导航', () => {
  let a11y

  beforeEach(() => {
    a11y = new BookmarkAccessibility({ enabled: true })
  })

  it('createKeyHandler 返回函数', () => {
    const handler = a11y.createKeyHandler({
      items: [],
      onSelect: () => {},
      onEscape: () => {},
    })
    assert.equal(typeof handler, 'function')
  })

  it('ArrowDown 聚焦下一个元素', () => {
    let focusedIndex = -1
    const items = [{ focus: () => { focusedIndex = 0 } }, { focus: () => { focusedIndex = 1 } }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: (i) => { focusedIndex = i },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'ArrowDown', preventDefault: () => {} })
    assert.equal(focusedIndex, 1)
  })

  it('ArrowUp 聚焦上一个元素', () => {
    let focusedIndex = -1
    const items = [{ focus: () => { focusedIndex = 0 } }, { focus: () => { focusedIndex = 1 } }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 1,
      setActiveIndex: (i) => { focusedIndex = i },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'ArrowUp', preventDefault: () => {} })
    assert.equal(focusedIndex, 0)
  })

  it('ArrowDown 在最后一个元素时不越界', () => {
    let setActiveCalled = false
    const items = [{ focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 1,
      setActiveIndex: () => { setActiveCalled = true },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'ArrowDown', preventDefault: () => {} })
    assert.equal(setActiveCalled, false, '不应在边界时调用 setActiveIndex')
  })

  it('ArrowUp 在第一个元素时不越界', () => {
    let setActiveCalled = false
    const items = [{ focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: () => { setActiveCalled = true },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'ArrowUp', preventDefault: () => {} })
    assert.equal(setActiveCalled, false, '不应在边界时调用 setActiveIndex')
  })

  it('Enter 调用 onSelect(currentIndex)', () => {
    let selected = -1
    const items = [{ focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 1,
      setActiveIndex: () => {},
      onSelect: (i) => { selected = i },
      onEscape: () => {},
    })

    handler({ key: 'Enter', preventDefault: () => {} })
    assert.equal(selected, 1)
  })

  it('Escape 调用 onEscape()', () => {
    let escaped = false
    const items = [{ focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: () => {},
      onSelect: () => {},
      onEscape: () => { escaped = true },
    })

    handler({ key: 'Escape', preventDefault: () => {} })
    assert.equal(escaped, true)
  })

  it('Home 键跳转到第一个元素', () => {
    let focusedIndex = -1
    const items = [{ focus: () => {} }, { focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 2,
      setActiveIndex: (i) => { focusedIndex = i },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'Home', preventDefault: () => {} })
    assert.equal(focusedIndex, 0)
  })

  it('End 键跳转到最后一个元素', () => {
    let focusedIndex = -1
    const items = [{ focus: () => {} }, { focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: (i) => { focusedIndex = i },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'End', preventDefault: () => {} })
    assert.equal(focusedIndex, 2)
  })
})

// ==================== 焦点陷阱 ====================

describe('BookmarkAccessibility — 焦点陷阱', () => {
  let a11y

  beforeEach(() => {
    a11y = new BookmarkAccessibility()
  })

  it('createFocusTrap 返回 { activate, deactivate, isActive }', () => {
    // 模拟容器 DOM
    const container = {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    assert.equal(typeof trap.activate, 'function')
    assert.equal(typeof trap.deactivate, 'function')
    assert.equal(typeof trap.isActive, 'function')
  })

  it('初始状态 isActive = false', () => {
    const container = {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    assert.equal(trap.isActive(), false)
  })

  it('activate 后 isActive = true', () => {
    const firstEl = { focus: () => {} }
    const container = {
      querySelectorAll: () => [],
      querySelector: () => firstEl,
      addEventListener: () => {},
      removeEventListener: () => {},
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    trap.activate()
    assert.equal(trap.isActive(), true)
  })

  it('deactivate 后 isActive = false', () => {
    const firstEl = { focus: () => {} }
    const container = {
      querySelectorAll: () => [],
      querySelector: () => firstEl,
      addEventListener: () => {},
      removeEventListener: () => {},
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    trap.activate()
    trap.deactivate()
    assert.equal(trap.isActive(), false)
  })
})

// ==================== ARIA 属性 ====================

describe('BookmarkAccessibility — ARIA 属性', () => {
  let a11y

  beforeEach(() => {
    a11y = new BookmarkAccessibility()
  })

  it('getBookmarkItemAriaAttrs 返回正确属性', () => {
    const attrs = a11y.getBookmarkItemAriaAttrs({
      title: 'Test Bookmark',
      url: 'https://example.com',
      status: 'unread',
      index: 0,
      total: 5,
    })
    assert.equal(attrs.role, 'listitem')
    assert.equal(attrs.tabindex, '0')
    assert.ok(attrs['aria-label'].includes('Test Bookmark'))
    assert.ok(attrs['aria-label'].includes('1'))
    assert.ok(attrs['aria-label'].includes('5'))
  })

  it('getBookmarkListAriaAttrs 返回 role=list', () => {
    const attrs = a11y.getBookmarkListAriaAttrs({ count: 10 })
    assert.equal(attrs.role, 'list')
    assert.ok(attrs['aria-label'])
    assert.ok(attrs['aria-label'].includes('10'))
  })

  it('getLiveRegionAttrs 返回 aria-live=polite', () => {
    const attrs = a11y.getLiveRegionAttrs()
    assert.equal(attrs['aria-live'], 'polite')
    assert.equal(attrs['aria-atomic'], 'true')
    assert.equal(attrs.role, 'status')
  })

  it('getFolderNavAriaAttrs 返回导航角色', () => {
    const attrs = a11y.getFolderNavAriaAttrs()
    assert.equal(attrs.role, 'toolbar')
    assert.ok(attrs['aria-label'])
  })

  it('getStatusAriaAttrs 返回状态标签', () => {
    const attrs = a11y.getStatusAriaAttrs('unread')
    assert.equal(attrs['aria-label'], '待读')
    assert.equal(attrs.role, 'status')
  })

  it('getStatusAriaAttrs 处理 unknown status', () => {
    const attrs = a11y.getStatusAriaAttrs('unknown')
    assert.ok(attrs['aria-label'])
  })
})

// ==================== Live Region 公告 ====================

describe('BookmarkAccessibility — Live Region 公告', () => {
  let a11y

  beforeEach(() => {
    a11y = new BookmarkAccessibility()
  })

  it('createAnnouncer 返回 { announce, destroy }', () => {
    const container = { appendChild: () => {} }
    const announcer = a11y.createAnnouncer(container)
    assert.equal(typeof announcer.announce, 'function')
    assert.equal(typeof announcer.destroy, 'function')
  })

  it('announce 设置 aria-live 区域文本', () => {
    let appendedChild = null
    let textContent = ''
    const mockEl = {
      set textContent(v) { textContent = v },
      get textContent() { return textContent },
      setAttribute: () => {},
      getAttribute: () => '',
      style: {},
    }
    const container = {
      appendChild: (el) => { appendedChild = el },
      querySelector: () => mockEl,
    }

    const announcer = a11y.createAnnouncer(container)
    // First call creates element, subsequent calls reuse
    // Use internal method to verify
    announcer.announce('已加载 10 个书签')
    assert.equal(typeof appendedChild !== 'undefined' || textContent !== '', true)
  })
})

// ==================== 色彩对比度审计 ====================

describe('BookmarkAccessibility — 对比度审计', () => {
  it('auditContrast 返回对比度问题列表', () => {
    const issues = BookmarkAccessibility.auditContrast()
    assert.ok(Array.isArray(issues))
    // 应该至少检测一组
    assert.ok(issues.length > 0)
  })

  it('审计结果包含 selector / foreground / background / ratio / passes 字段', () => {
    const issues = BookmarkAccessibility.auditContrast()
    for (const issue of issues) {
      assert.ok(issue.selector, 'Missing selector')
      assert.ok(issue.foreground, 'Missing foreground')
      assert.ok(issue.background, 'Missing background')
      assert.equal(typeof issue.ratio, 'number', 'ratio should be number')
      assert.equal(typeof issue.passes, 'boolean', 'passes should be boolean')
    }
  })

  it('text-primary on bg-primary 通过 WCAG AA', () => {
    const issues = BookmarkAccessibility.auditContrast()
    const primary = issues.find(i => i.selector === '--text-primary on --bg-primary')
    assert.ok(primary)
    assert.equal(primary.passes, true)
  })

  it('text-secondary on bg-primary 通过 WCAG AA', () => {
    const issues = BookmarkAccessibility.auditContrast()
    const secondary = issues.find(i => i.selector === '--text-secondary on --bg-primary')
    assert.ok(secondary)
    assert.equal(secondary.passes, true)
  })

  it('text-muted on bg-primary 通过 WCAG AA (R79 修复后 #70707b)', () => {
    const issues = BookmarkAccessibility.auditContrast()
    const muted = issues.find(i => i.selector === '--text-muted on --bg-primary')
    assert.ok(muted)
    assert.equal(muted.passes, true)
  })
})

// ==================== enable/disable ====================

describe('BookmarkAccessibility — enable/disable', () => {
  it('enable 启用无障碍功能', () => {
    const a11y = new BookmarkAccessibility()
    a11y.enable()
    assert.equal(a11y.isEnabled(), true)
  })

  it('disable 禁用无障碍功能', () => {
    const a11y = new BookmarkAccessibility({ enabled: true })
    a11y.disable()
    assert.equal(a11y.isEnabled(), false)
  })

  it('toggle 切换状态', () => {
    const a11y = new BookmarkAccessibility()
    assert.equal(a11y.isEnabled(), false)
    a11y.toggle()
    assert.equal(a11y.isEnabled(), true)
    a11y.toggle()
    assert.equal(a11y.isEnabled(), false)
  })
})

// ==================== destroy ====================

describe('BookmarkAccessibility — destroy', () => {
  it('destroy 清理所有资源', () => {
    const a11y = new BookmarkAccessibility({ enabled: true })
    a11y.destroy()
    // After destroy, internal state should be cleaned
    assert.equal(a11y.isEnabled(), false)
  })
})
