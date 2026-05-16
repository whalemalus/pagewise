/**
 * 测试 lib/bookmark-final-polish.js — UI/UX 最终打磨
 *
 * 测试范围:
 *   - 常量导出 — NODE_ENTRY_DURATION / BREAKPOINTS / GRID_COLUMNS 等
 *   - animateNodeEntry — 正常/无效输入/元素状态设置
 *   - animateEdgeDraw — 正常/缺失属性/自定义选项/长度计算
 *   - optimizeLayout — 不同断点/空数组/子元素设置
 *   - enhanceDragDrop — 默认选项/自定义选项/无效输入
 *   - addRippleEffect — 正常点击/边缘点击/无效输入
 *   - showTooltip — 四方向/边缘翻转/无效输入
 *   - smoothScrollTo — 正常滚动/归零/无效输入
 *   - easeInOutCubic / easeOutQuad — 边界值/NaN/范围
 *   - snapToGrid — 正常/零网格/NaN
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  NODE_ENTRY_DURATION,
  NODE_ENTRY_EASING,
  EDGE_DRAW_DURATION,
  DASH_SEGMENT_LENGTH,
  GRID_SNAP_SIZE,
  RIPPLE_DURATION,
  TOOLTIP_OFFSET,
  SCROLL_DURATION,
  BREAKPOINTS,
  GRID_COLUMNS,
  animateNodeEntry,
  animateEdgeDraw,
  optimizeLayout,
  enhanceDragDrop,
  addRippleEffect,
  showTooltip,
  smoothScrollTo,
  easeInOutCubic,
  easeOutQuad,
  snapToGrid,
} = await import('../lib/bookmark-final-polish.js')

// ==================== DOM 模拟工厂 ====================

/**
 * 创建模拟 DOM 元素
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function mockElement(overrides = {}) {
  return {
    style: {},
    dataset: {},
    id: '',
    clientWidth: 800,
    clientHeight: 600,
    scrollTop: 0,
    children: [],
    setAttribute() {},
    getBoundingClientRect() {
      return { left: 100, top: 100, width: 200, height: 150, right: 300, bottom: 250 }
    },
    ...overrides,
  }
}

/**
 * 创建模拟点击事件
 *
 * @param {number} x
 * @param {number} y
 * @returns {object}
 */
function mockEvent(x = 150, y = 150) {
  return { clientX: x, clientY: y }
}

/**
 * 创建模拟边数据
 *
 * @returns {object}
 */
function mockEdge() {
  return {
    source: { id: 'a', x: 100, y: 200 },
    target: { id: 'b', x: 400, y: 600 },
  }
}

// ==================== 常量 ====================

describe('常量导出', () => {
  it('NODE_ENTRY_DURATION 应为 200', () => {
    assert.equal(NODE_ENTRY_DURATION, 200)
  })

  it('NODE_ENTRY_EASING 应为 ease-out', () => {
    assert.equal(NODE_ENTRY_EASING, 'ease-out')
  })

  it('EDGE_DRAW_DURATION 应为 400', () => {
    assert.equal(EDGE_DRAW_DURATION, 400)
  })

  it('DASH_SEGMENT_LENGTH 应为 8', () => {
    assert.equal(DASH_SEGMENT_LENGTH, 8)
  })

  it('GRID_SNAP_SIZE 应为 16', () => {
    assert.equal(GRID_SNAP_SIZE, 16)
  })

  it('RIPPLE_DURATION 应为 600', () => {
    assert.equal(RIPPLE_DURATION, 600)
  })

  it('TOOLTIP_OFFSET 应为 8', () => {
    assert.equal(TOOLTIP_OFFSET, 8)
  })

  it('SCROLL_DURATION 应为 300', () => {
    assert.equal(SCROLL_DURATION, 300)
  })

  it('BREAKPOINTS 应为冻结对象', () => {
    assert.ok(Object.isFrozen(BREAKPOINTS))
    assert.equal(BREAKPOINTS.xs, 0)
    assert.equal(BREAKPOINTS.sm, 480)
    assert.equal(BREAKPOINTS.md, 768)
    assert.equal(BREAKPOINTS.lg, 1024)
    assert.equal(BREAKPOINTS.xl, 1280)
  })

  it('GRID_COLUMNS 应为冻结对象', () => {
    assert.ok(Object.isFrozen(GRID_COLUMNS))
    assert.equal(GRID_COLUMNS.xs, 1)
    assert.equal(GRID_COLUMNS.sm, 2)
    assert.equal(GRID_COLUMNS.md, 3)
    assert.equal(GRID_COLUMNS.lg, 4)
    assert.equal(GRID_COLUMNS.xl, 5)
  })
})

// ==================== animateNodeEntry ====================

describe('animateNodeEntry', () => {
  it('成功应用入场动画并返回 applied: true', () => {
    const node = { id: 'node-1' }
    const el = mockElement()
    const result = animateNodeEntry(node, el)

    assert.equal(result.applied, true)
    assert.deepEqual(result.node, node)
    assert.equal(result.errors.length, 0)
  })

  it('设置正确的过渡样式', () => {
    const el = mockElement()
    animateNodeEntry({ id: 'n1' }, el)

    assert.equal(el.style.opacity, '1')
    assert.equal(el.style.transform, 'scale(1)')
    assert.ok(el.style.transition.includes('200ms'))
    assert.ok(el.style.transition.includes('ease-out'))
  })

  it('node 为 null 时返回错误', () => {
    const result = animateNodeEntry(null, mockElement())
    assert.equal(result.applied, false)
    assert.ok(result.errors.length > 0)
  })

  it('element 为 null 时返回错误', () => {
    const result = animateNodeEntry({ id: 'n1' }, null)
    assert.equal(result.applied, false)
    assert.ok(result.errors.length > 0)
  })

  it('node 为非对象类型时返回错误', () => {
    const result = animateNodeEntry('bad', mockElement())
    assert.equal(result.applied, false)
  })
})

// ==================== animateEdgeDraw ====================

describe('animateEdgeDraw', () => {
  it('成功应用边绘制动画', () => {
    const edge = mockEdge()
    const canvas = mockElement()
    const result = animateEdgeDraw(edge, canvas)

    assert.equal(result.applied, true)
    assert.equal(result.edge, edge)
    assert.ok(result.totalLength > 0)
    assert.equal(result.errors.length, 0)
  })

  it('计算正确的边长度 (500: 3-4-5 三角形 ×100)', () => {
    const edge = { source: { x: 0, y: 0 }, target: { x: 300, y: 400 } }
    const canvas = mockElement()
    const result = animateEdgeDraw(edge, canvas)

    assert.equal(result.totalLength, 500)
  })

  it('设置虚线样式和过渡', () => {
    const canvas = mockElement()
    animateEdgeDraw(mockEdge(), canvas)

    assert.ok(canvas.style.strokeDasharray.includes('8'))
    assert.equal(canvas.style.strokeDashoffset, '0')
    assert.ok(canvas.style.transition.includes('strokeDashoffset'))
  })

  it('支持自定义 duration 和 dashLength', () => {
    const canvas = mockElement()
    const result = animateEdgeDraw(mockEdge(), canvas, { duration: 800, dashLength: 12 })

    assert.equal(result.applied, true)
    assert.ok(canvas.style.strokeDasharray.includes('12'))
  })

  it('edge 缺少 source 时返回错误', () => {
    const result = animateEdgeDraw({ target: { x: 0, y: 0 } }, mockElement())
    assert.equal(result.applied, false)
    assert.ok(result.errors.length > 0)
  })

  it('edge 为 null 时返回错误', () => {
    const result = animateEdgeDraw(null, mockElement())
    assert.equal(result.applied, false)
  })

  it('canvas 为 null 时返回错误', () => {
    const result = animateEdgeDraw(mockEdge(), null)
    assert.equal(result.applied, false)
  })
})

// ==================== optimizeLayout ====================

describe('optimizeLayout', () => {
  it('大容器应检测 xl 断点', () => {
    const container = mockElement({ clientWidth: 1400 })
    const result = optimizeLayout([], container)

    assert.equal(result.success, true)
    assert.equal(result.breakpoint, 'xl')
    assert.equal(result.columns, 5)
  })

  it('中等容器应检测 md 断点', () => {
    const container = mockElement({ clientWidth: 800 })
    const result = optimizeLayout([], container)

    assert.equal(result.success, true)
    assert.equal(result.breakpoint, 'md')
    assert.equal(result.columns, 3)
  })

  it('小容器应检测 sm 断点', () => {
    const container = mockElement({ clientWidth: 500 })
    const result = optimizeLayout([], container)

    assert.equal(result.success, true)
    assert.equal(result.breakpoint, 'sm')
    assert.equal(result.columns, 2)
  })

  it('极小容器应检测 xs 断点', () => {
    const container = mockElement({ clientWidth: 200 })
    const result = optimizeLayout([], container)

    assert.equal(result.success, true)
    assert.equal(result.breakpoint, 'xs')
    assert.equal(result.columns, 1)
  })

  it('itemSize 使用 4:3 宽高比', () => {
    const container = mockElement({ clientWidth: 800 })
    const result = optimizeLayout([], container)

    const expectedHeight = Math.floor(result.itemSize.width * 0.75)
    assert.equal(result.itemSize.height, expectedHeight)
  })

  it('设置容器 flex 布局样式', () => {
    const container = mockElement({ clientWidth: 800 })
    optimizeLayout([], container)

    assert.equal(container.style.display, 'flex')
    assert.equal(container.style.flexWrap, 'wrap')
    assert.ok(container.style.gap.includes('16'))
  })

  it('子元素设置正确尺寸', () => {
    const child = mockElement()
    const container = mockElement({ clientWidth: 800, children: [child] })
    const result = optimizeLayout([], container)

    assert.equal(child.style.width, `${result.itemSize.width}px`)
    assert.equal(child.style.height, `${result.itemSize.height}px`)
  })

  it('bookmarks 非数组时返回错误', () => {
    const result = optimizeLayout('bad', mockElement())
    assert.equal(result.success, false)
    assert.ok(result.errors.length > 0)
  })

  it('container 为 null 时返回错误', () => {
    const result = optimizeLayout([], null)
    assert.equal(result.success, false)
  })

  it('lg 断点检测 (1024px)', () => {
    const container = mockElement({ clientWidth: 1100 })
    const result = optimizeLayout([], container)
    assert.equal(result.breakpoint, 'lg')
    assert.equal(result.columns, 4)
  })
})

// ==================== enhanceDragDrop ====================

describe('enhanceDragDrop', () => {
  it('成功启用拖拽增强', () => {
    const el = mockElement()
    const result = enhanceDragDrop(el)

    assert.equal(result.enabled, true)
    assert.equal(result.ghostCreated, true)
    assert.equal(result.errors.length, 0)
  })

  it('设置默认幽灵元素选项', () => {
    const result = enhanceDragDrop(mockElement())
    assert.equal(result.options.snapSize, GRID_SNAP_SIZE)
    assert.equal(result.options.ghostOpacity, 0.5)
    assert.equal(result.options.snapToGrid, true)
  })

  it('支持自定义选项', () => {
    const el = mockElement()
    const result = enhanceDragDrop(el, { snapSize: 32, ghostOpacity: 0.3, snapToGrid: false })

    assert.equal(result.options.snapSize, 32)
    assert.equal(result.options.ghostOpacity, 0.3)
    assert.equal(result.options.snapToGrid, false)
  })

  it('设置元素为可拖拽样式', () => {
    const el = mockElement()
    enhanceDragDrop(el)

    assert.equal(el.style.cursor, 'grab')
    assert.equal(el.style.userSelect, 'none')
  })

  it('element 为 null 时返回错误', () => {
    const result = enhanceDragDrop(null)
    assert.equal(result.enabled, false)
    assert.ok(result.errors.length > 0)
  })

  it('记录来源元素 ID', () => {
    const el = mockElement({ id: 'drag-me' })
    const result = enhanceDragDrop(el)
    assert.equal(result.ghostInfo.sourceId, 'drag-me')
  })
})

// ==================== addRippleEffect ====================

describe('addRippleEffect', () => {
  it('成功应用波纹效果', () => {
    const el = mockElement()
    const event = mockEvent(200, 175)
    const result = addRippleEffect(el, event)

    assert.equal(result.applied, true)
    assert.ok(result.ripple !== null)
    assert.equal(result.errors.length, 0)
  })

  it('波纹坐标正确计算', () => {
    const el = mockElement()
    const event = mockEvent(250, 200)
    const result = addRippleEffect(el, event)

    // getBoundingClientRect 返回 left:100, top:100
    assert.equal(result.ripple.x, 150)
    assert.equal(result.ripple.y, 100)
  })

  it('波纹大小为元素对角线', () => {
    const el = mockElement()
    const result = addRippleEffect(el, mockEvent())
    const expectedSize = Math.sqrt(200 ** 2 + 150 ** 2)
    assert.ok(Math.abs(result.ripple.size - expectedSize) < 0.01)
  })

  it('波纹 duration 为 RIPPLE_DURATION', () => {
    const result = addRippleEffect(mockElement(), mockEvent())
    assert.equal(result.ripple.duration, RIPPLE_DURATION)
  })

  it('设置元素 overflow: hidden', () => {
    const el = mockElement()
    addRippleEffect(el, mockEvent())
    assert.equal(el.style.overflow, 'hidden')
  })

  it('element 为 null 时返回错误', () => {
    const result = addRippleEffect(null, mockEvent())
    assert.equal(result.applied, false)
    assert.ok(result.errors.length > 0)
  })

  it('event 为 null 时返回错误', () => {
    const result = addRippleEffect(mockElement(), null)
    assert.equal(result.applied, false)
  })
})

// ==================== showTooltip ====================

describe('showTooltip', () => {
  const largeViewport = { width: 1920, height: 1080 }

  it('成功显示工具提示', () => {
    const result = showTooltip(mockElement(), 'Hello', 'top', largeViewport)
    assert.equal(result.shown, true)
    assert.equal(result.tooltip.content, 'Hello')
    assert.equal(result.errors.length, 0)
  })

  it('top 方向定位正确', () => {
    const result = showTooltip(mockElement(), 'tip', 'top', largeViewport)
    assert.equal(result.finalPosition, 'top')
    assert.equal(result.flipped, false)
    // top = rect.top - offset = 100 - 8 = 92
    assert.equal(result.tooltip.css.top, '92px')
  })

  it('bottom 方向定位正确', () => {
    const result = showTooltip(mockElement(), 'tip', 'bottom', largeViewport)
    assert.equal(result.finalPosition, 'bottom')
    // top = rect.bottom + offset = 250 + 8 = 258
    assert.equal(result.tooltip.css.top, '258px')
  })

  it('left 方向定位正确', () => {
    const result = showTooltip(mockElement(), 'tip', 'left', largeViewport)
    assert.equal(result.finalPosition, 'left')
    // left = rect.left - offset = 100 - 8 = 92
    assert.equal(result.tooltip.css.left, '92px')
  })

  it('right 方向定位正确', () => {
    const result = showTooltip(mockElement(), 'tip', 'right', largeViewport)
    assert.equal(result.finalPosition, 'right')
    // left = rect.right + offset = 300 + 8 = 308
    assert.equal(result.tooltip.css.left, '308px')
  })

  it('靠近顶部边缘时翻转为 bottom', () => {
    const el = mockElement({
      getBoundingClientRect() {
        return { left: 100, top: 2, width: 100, height: 50, right: 200, bottom: 52 }
      },
    })
    const result = showTooltip(el, 'flip', 'top', largeViewport)
    assert.equal(result.flipped, true)
    assert.equal(result.finalPosition, 'bottom')
  })

  it('靠近底部边缘时翻转为 top', () => {
    const el = mockElement({
      getBoundingClientRect() {
        return { left: 100, top: 1040, width: 100, height: 50, right: 200, bottom: 1090 }
      },
    })
    const result = showTooltip(el, 'flip', 'bottom', largeViewport)
    assert.equal(result.flipped, true)
    assert.equal(result.finalPosition, 'top')
  })

  it('靠近左侧边缘时翻转为 right', () => {
    const el = mockElement({
      getBoundingClientRect() {
        return { left: 2, top: 100, width: 100, height: 50, right: 102, bottom: 150 }
      },
    })
    const result = showTooltip(el, 'flip', 'left', largeViewport)
    assert.equal(result.flipped, true)
    assert.equal(result.finalPosition, 'right')
  })

  it('靠近右侧边缘时翻转为 left', () => {
    const el = mockElement({
      getBoundingClientRect() {
        return { left: 1850, top: 100, width: 100, height: 50, right: 1950, bottom: 150 }
      },
    })
    const result = showTooltip(el, 'flip', 'right', { width: 1920, height: 1080 })
    assert.equal(result.flipped, true)
    assert.equal(result.finalPosition, 'left')
  })

  it('tooltip CSS 使用 fixed 定位', () => {
    const result = showTooltip(mockElement(), 'x', 'top', largeViewport)
    assert.equal(result.tooltip.css.position, 'fixed')
    assert.equal(result.tooltip.css.zIndex, '10000')
    assert.equal(result.tooltip.css.pointerEvents, 'none')
  })

  it('element 为 null 时返回错误', () => {
    const result = showTooltip(null, 'x', 'top', largeViewport)
    assert.equal(result.shown, false)
    assert.ok(result.errors.length > 0)
  })

  it('content 不是字符串或数字时返回错误', () => {
    const result = showTooltip(mockElement(), null, 'top', largeViewport)
    assert.equal(result.shown, false)
  })

  it('无效 position 返回错误', () => {
    const result = showTooltip(mockElement(), 'x', 'diagonal', largeViewport)
    assert.equal(result.shown, false)
    assert.ok(result.errors.length > 0)
  })

  it('content 数字被转为字符串', () => {
    const result = showTooltip(mockElement(), 42, 'top', largeViewport)
    assert.equal(result.tooltip.content, '42')
  })
})

// ==================== smoothScrollTo ====================

describe('smoothScrollTo', () => {
  it('成功启动平滑滚动', () => {
    const el = mockElement({ scrollTop: 0 })
    const result = smoothScrollTo(el, 500)

    assert.equal(result.success, true)
    assert.equal(result.from, 0)
    assert.equal(result.to, 500)
    assert.equal(result.distance, 500)
    assert.equal(result.errors.length, 0)
  })

  it('使用默认 SCROLL_DURATION', () => {
    const el = mockElement()
    const result = smoothScrollTo(el, 300)
    assert.equal(result.duration, SCROLL_DURATION)
  })

  it('支持自定义 duration', () => {
    const el = mockElement()
    const result = smoothScrollTo(el, 300, { duration: 500 })
    assert.equal(result.duration, 500)
  })

  it('设置 dataset 滚动状态', () => {
    const el = mockElement({ scrollTop: 100 })
    smoothScrollTo(el, 400)

    assert.equal(el.dataset.scrolling, 'true')
    assert.equal(el.dataset.scrollFrom, '100')
    assert.equal(el.dataset.scrollTo, '400')
  })

  it('距离计算正确', () => {
    const el = mockElement({ scrollTop: 200 })
    const result = smoothScrollTo(el, 800)
    assert.equal(result.distance, 600)
  })

  it('负目标被修正为 0', () => {
    const el = mockElement()
    const result = smoothScrollTo(el, -100)
    assert.equal(result.to, 0)
  })

  it('target 非数字时返回错误', () => {
    const result = smoothScrollTo(mockElement(), 'abc')
    assert.equal(result.success, false)
    assert.ok(result.errors.length > 0)
  })

  it('element 为 null 时返回错误', () => {
    const result = smoothScrollTo(null, 100)
    assert.equal(result.success, false)
  })

  it('NaN target 返回错误', () => {
    const result = smoothScrollTo(mockElement(), NaN)
    assert.equal(result.success, false)
  })
})

// ==================== easeInOutCubic ====================

describe('easeInOutCubic', () => {
  it('t=0 返回 0', () => {
    assert.equal(easeInOutCubic(0), 0)
  })

  it('t=1 返回 1', () => {
    assert.equal(easeInOutCubic(1), 1)
  })

  it('t=0.5 返回 0.5', () => {
    assert.equal(easeInOutCubic(0.5), 0.5)
  })

  it('t<0 钳位到 0', () => {
    assert.equal(easeInOutCubic(-1), 0)
  })

  it('t>1 钳位到 1', () => {
    assert.equal(easeInOutCubic(2), 1)
  })

  it('NaN 返回 0', () => {
    assert.equal(easeInOutCubic(NaN), 0)
  })

  it('非数字返回 0', () => {
    assert.equal(easeInOutCubic('abc'), 0)
  })
})

// ==================== easeOutQuad ====================

describe('easeOutQuad', () => {
  it('t=0 返回 0', () => {
    assert.equal(easeOutQuad(0), 0)
  })

  it('t=1 返回 1', () => {
    assert.equal(easeOutQuad(1), 1)
  })

  it('t=0.5 返回 0.75', () => {
    assert.equal(easeOutQuad(0.5), 0.75)
  })

  it('NaN 返回 0', () => {
    assert.equal(easeOutQuad(NaN), 0)
  })

  it('非数字返回 0', () => {
    assert.equal(easeOutQuad(undefined), 0)
  })
})

// ==================== snapToGrid ====================

describe('snapToGrid', () => {
  it('正常吸附到网格', () => {
    assert.equal(snapToGrid(10, 16), 16)
    // Math.round(0.5) = 1 → 1×16 = 16
    assert.equal(snapToGrid(8, 16), 16)
    assert.equal(snapToGrid(24, 16), 32)
  })

  it('使用默认网格大小', () => {
    assert.equal(snapToGrid(10), 16)
  })

  it('整数倍值不变', () => {
    assert.equal(snapToGrid(32, 16), 32)
    assert.equal(snapToGrid(48, 16), 48)
  })

  it('NaN 输入返回 0', () => {
    assert.equal(snapToGrid(NaN), 0)
  })

  it('非数字输入返回 0', () => {
    assert.equal(snapToGrid('abc'), 0)
  })

  it('零或负网格大小返回原值', () => {
    assert.equal(snapToGrid(10, 0), 10)
    assert.equal(snapToGrid(10, -5), 10)
  })

  it('负值坐标正确吸附', () => {
    assert.equal(snapToGrid(-10, 16), -16)
  })
})
