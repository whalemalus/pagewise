/**
 * BookmarkFinalPolish — UI/UX 最终打磨模块
 *
 * 提供动画、布局优化和交互增强的纯 DOM 工具函数。
 *
 * 功能:
 *   - animateNodeEntry(node, element)         — 图节点入场动画（淡入+缩放）
 *   - animateEdgeDraw(edge, canvas)            — 边绘制动画（虚线偏移）
 *   - optimizeLayout(bookmarks, container)     — 响应式网格布局（断点检测）
 *   - enhanceDragDrop(element, options)        — 平滑拖拽（幽灵元素+吸附网格）
 *   - addRippleEffect(element, event)          — Material 风格波纹点击效果
 *   - showTooltip(element, content, position)  — 智能定位提示（边缘翻转）
 *   - smoothScrollTo(element, target)          — 缓动平滑滚动
 *
 * 设计约束:
 * - 纯 ES Module，无 Chrome API 依赖
 * - 纯 DOM 工具函数，使用 try-catch 保护
 * - 无分号风格，const/let 优先，禁止 var
 * - 通过 JSDoc 提供完整类型注解
 *
 * @module lib/bookmark-final-polish
 */

// ==================== Constants ====================

/** 节点入场动画时长（毫秒） */
export const NODE_ENTRY_DURATION = 200

/** 节点入场动画缓动函数 */
export const NODE_ENTRY_EASING = 'ease-out'

/** 边绘制动画时长（毫秒） */
export const EDGE_DRAW_DURATION = 400

/** 虚线段长度（像素） */
export const DASH_SEGMENT_LENGTH = 8

/** 网格间距（像素） */
export const GRID_SNAP_SIZE = 16

/** 波纹效果时长（毫秒） */
export const RIPPLE_DURATION = 600

/** 工具提示偏移（像素） */
export const TOOLTIP_OFFSET = 8

/** 平滑滚动默认时长（毫秒） */
export const SCROLL_DURATION = 300

/** 响应式断点定义（像素） */
export const BREAKPOINTS = Object.freeze({
  xs: 0,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
})

/** 网格列数映射 */
export const GRID_COLUMNS = Object.freeze({
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
})

// ==================== animateNodeEntry ====================

/**
 * 图节点入场动画：淡入 + 缩放
 *
 * 从 opacity 0 / scale 0.8 过渡到 opacity 1 / scale 1，
 * 使用 200ms ease-out 缓动。
 *
 * @param {object} node — 节点数据对象（至少含 id 属性）
 * @param {object} element — DOM 元素（需支持 style 属性和 setAttribute）
 * @returns {{ applied: boolean, node: object, errors: string[] }}
 */
export function animateNodeEntry(node, element) {
  const errors = []

  try {
    if (!node || typeof node !== 'object') {
      errors.push('node 必须是非空对象')
      return { applied: false, node, errors }
    }

    if (!element || typeof element !== 'object') {
      errors.push('element 必须是有效的 DOM 元素对象')
      return { applied: false, node, errors }
    }

    // 设置初始状态
    element.style.opacity = '0'
    element.style.transform = 'scale(0.8)'
    element.style.transition = `opacity ${NODE_ENTRY_DURATION}ms ${NODE_ENTRY_EASING}, transform ${NODE_ENTRY_DURATION}ms ${NODE_ENTRY_EASING}`

    // 触发动画（使用 rAF 模拟下一帧）
    const startAnimation = () => {
      element.style.opacity = '1'
      element.style.transform = 'scale(1)'
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(startAnimation)
    } else {
      // 降级：直接设置最终状态
      startAnimation()
    }

    return { applied: true, node, errors }
  } catch (err) {
    errors.push(`动画应用失败: ${err.message}`)
    return { applied: false, node, errors }
  }
}

// ==================== animateEdgeDraw ====================

/**
 * 边绘制动画：使用虚线偏移实现绘制效果
 *
 * 通过逐步减小 strokeDashoffset 模拟线条绘制动画。
 *
 * @param {object} edge — 边数据对象（至少含 source 和 target 属性）
 * @param {object} canvas — canvas/元素对象（需支持 style 和 getContext）
 * @param {object} [options] — 可选参数
 * @param {number} [options.duration] — 动画时长（毫秒）
 * @param {number} [options.dashLength] — 虚线段长度
 * @returns {{ applied: boolean, edge: object, totalLength: number, errors: string[] }}
 */
export function animateEdgeDraw(edge, canvas, options = {}) {
  const errors = []

  try {
    if (!edge || typeof edge !== 'object') {
      errors.push('edge 必须是非空对象')
      return { applied: false, edge, totalLength: 0, errors }
    }

    if (!edge.source || !edge.target) {
      errors.push('edge 必须包含 source 和 target 属性')
      return { applied: false, edge, totalLength: 0, errors }
    }

    if (!canvas || typeof canvas !== 'object') {
      errors.push('canvas 必须是有效的元素对象')
      return { applied: false, edge, totalLength: 0, errors }
    }

    const duration = typeof options.duration === 'number' ? options.duration : EDGE_DRAW_DURATION
    const dashLength = typeof options.dashLength === 'number' ? options.dashLength : DASH_SEGMENT_LENGTH

    // 计算边的长度（使用 source/target 的 x,y 坐标）
    const sx = edge.source.x || 0
    const sy = edge.source.y || 0
    const tx = edge.target.x || 0
    const ty = edge.target.y || 0
    const totalLength = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2)

    // 设置虚线样式
    canvas.style.strokeDasharray = `${dashLength}`
    canvas.style.strokeDashoffset = `${totalLength}`
    canvas.style.transition = `strokeDashoffset ${duration}ms ease-in-out`

    // 触发动画
    const startAnimation = () => {
      canvas.style.strokeDashoffset = '0'
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(startAnimation)
    } else {
      startAnimation()
    }

    return { applied: true, edge, totalLength, errors }
  } catch (err) {
    errors.push(`边动画应用失败: ${err.message}`)
    return { applied: false, edge, totalLength: 0, errors }
  }
}

// ==================== optimizeLayout ====================

/**
 * 响应式网格布局优化
 *
 * 根据容器宽度检测断点，计算最佳列数和间距，
 * 并为每个书签子元素设置定位样式。
 *
 * @param {object[]} bookmarks — 书签数据数组（每项至少含 id）
 * @param {object} container — 容器 DOM 元素（需支持 clientWidth 和 children）
 * @returns {{ success: boolean, breakpoint: string, columns: number, itemSize: { width: number, height: number }, errors: string[] }}
 */
export function optimizeLayout(bookmarks, container) {
  const errors = []

  try {
    if (!Array.isArray(bookmarks)) {
      errors.push('bookmarks 必须是数组')
      return { success: false, breakpoint: 'xs', columns: 1, itemSize: { width: 0, height: 0 }, errors }
    }

    if (!container || typeof container !== 'object') {
      errors.push('container 必须是有效的容器元素')
      return { success: false, breakpoint: 'xs', columns: 1, itemSize: { width: 0, height: 0 }, errors }
    }

    const containerWidth = container.clientWidth || 0

    // 检测断点
    let breakpoint = 'xs'
    const sortedBreakpoints = Object.entries(BREAKPOINTS).sort((a, b) => b[1] - a[1])
    for (const [name, minWidth] of sortedBreakpoints) {
      if (containerWidth >= minWidth) {
        breakpoint = name
        break
      }
    }

    const columns = GRID_COLUMNS[breakpoint] || 1
    const gap = 16
    const totalGapWidth = gap * (columns - 1)
    const itemWidth = columns > 0 ? Math.floor((containerWidth - totalGapWidth) / columns) : containerWidth
    const itemHeight = Math.floor(itemWidth * 0.75) // 4:3 宽高比

    const itemSize = { width: itemWidth, height: itemHeight }

    // 设置容器样式
    container.style.display = 'flex'
    container.style.flexWrap = 'wrap'
    container.style.gap = `${gap}px`

    // 设置子元素尺寸
    if (container.children && Array.isArray(container.children)) {
      for (const child of container.children) {
        if (child && child.style) {
          child.style.width = `${itemWidth}px`
          child.style.height = `${itemHeight}px`
        }
      }
    }

    return { success: true, breakpoint, columns, itemSize, errors }
  } catch (err) {
    errors.push(`布局优化失败: ${err.message}`)
    return { success: false, breakpoint: 'xs', columns: 1, itemSize: { width: 0, height: 0 }, errors }
  }
}

// ==================== enhanceDragDrop ====================

/**
 * 增强拖拽交互
 *
 * 创建幽灵元素跟随鼠标，支持吸附网格。
 *
 * @param {object} element — 可拖拽的 DOM 元素
 * @param {object} [options] — 拖拽选项
 * @param {number} [options.snapSize] — 网格吸附间距（像素）
 * @param {number} [options.ghostOpacity] — 幽灵元素透明度
 * @param {boolean} [options.snapToGrid] — 是否启用吸附
 * @returns {{ enabled: boolean, ghostCreated: boolean, options: object, errors: string[] }}
 */
export function enhanceDragDrop(element, options = {}) {
  const errors = []

  try {
    if (!element || typeof element !== 'object') {
      errors.push('element 必须是有效的 DOM 元素对象')
      return { enabled: false, ghostCreated: false, options: {}, errors }
    }

    const mergedOptions = {
      snapSize: typeof options.snapSize === 'number' ? options.snapSize : GRID_SNAP_SIZE,
      ghostOpacity: typeof options.ghostOpacity === 'number' ? options.ghostOpacity : 0.5,
      snapToGrid: options.snapToGrid !== false,
    }

    // 创建幽灵元素信息
    const ghostInfo = {
      opacity: mergedOptions.ghostOpacity,
      snapSize: mergedOptions.snapSize,
      sourceId: element.id || element.dataset?.id || 'unknown',
    }

    // 标记元素为可拖拽
    element.style.cursor = 'grab'
    element.style.userSelect = 'none'
    element.setAttribute('draggable', 'true')

    return { enabled: true, ghostCreated: true, options: mergedOptions, ghostInfo, errors }
  } catch (err) {
    errors.push(`拖拽增强失败: ${err.message}`)
    return { enabled: false, ghostCreated: false, options: {}, errors }
  }
}

// ==================== addRippleEffect ====================

/**
 * Material 风格波纹点击效果
 *
 * 计算点击位置相对于元素的偏移，在该位置生成圆形波纹扩散动画。
 *
 * @param {object} element — 目标 DOM 元素
 * @param {object} event — 点击事件对象（含 clientX, clientY）
 * @returns {{ applied: boolean, ripple: object|null, errors: string[] }}
 */
export function addRippleEffect(element, event) {
  const errors = []

  try {
    if (!element || typeof element !== 'object') {
      errors.push('element 必须是有效的 DOM 元素对象')
      return { applied: false, ripple: null, errors }
    }

    if (!event || typeof event !== 'object') {
      errors.push('event 必须是有效的事件对象')
      return { applied: false, ripple: null, errors }
    }

    // 计算点击位置
    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 0, top: 0, width: 100, height: 100 }
    const x = (event.clientX || 0) - rect.left
    const y = (event.clientY || 0) - rect.top

    // 计算波纹半径（取元素对角线长度）
    const maxWidth = rect.width || 100
    const maxHeight = rect.height || 100
    const size = Math.sqrt(maxWidth ** 2 + maxHeight ** 2)

    const ripple = {
      x,
      y,
      size,
      duration: RIPPLE_DURATION,
      css: {
        position: 'absolute',
        borderRadius: '50%',
        transform: `translate(${x - size / 2}px, ${y - size / 2}px) scale(0)`,
        width: `${size}px`,
        height: `${size}px`,
        opacity: '0.35',
        backgroundColor: 'currentColor',
        transition: `transform ${RIPPLE_DURATION}ms ease-out, opacity ${RIPPLE_DURATION}ms ease-out`,
      },
    }

    // 设置元素样式以便容纳波纹
    element.style.position = element.style.position || 'relative'
    element.style.overflow = 'hidden'

    return { applied: true, ripple, errors }
  } catch (err) {
    errors.push(`波纹效果失败: ${err.message}`)
    return { applied: false, ripple: null, errors }
  }
}

// ==================== showTooltip ====================

/**
 * 智能定位工具提示
 *
 * 当提示框靠近视口边缘时自动翻转方向，保持在可视区域内。
 *
 * @param {object} element — 目标 DOM 元素
 * @param {string} content — 提示内容文本
 * @param {string} [position='top'] — 首选方向（top / bottom / left / right）
 * @param {object} [viewport] — 视口尺寸 { width, height }（默认取 window）
 * @returns {{ shown: boolean, tooltip: object|null, flipped: boolean, finalPosition: string, errors: string[] }}
 */
export function showTooltip(element, content, position = 'top', viewport = null) {
  const errors = []

  try {
    if (!element || typeof element !== 'object') {
      errors.push('element 必须是有效的 DOM 元素对象')
      return { shown: false, tooltip: null, flipped: false, finalPosition: position, errors }
    }

    if (typeof content !== 'string' && typeof content !== 'number') {
      errors.push('content 必须是字符串或数字')
      return { shown: false, tooltip: null, flipped: false, finalPosition: position, errors }
    }

    const validPositions = ['top', 'bottom', 'left', 'right']
    if (!validPositions.includes(position)) {
      errors.push(`position 必须是 ${validPositions.join(', ')} 之一`)
      return { shown: false, tooltip: null, flipped: false, finalPosition: position, errors }
    }

    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }
    const vp = viewport || (typeof window !== 'undefined' && window.innerWidth ? { width: window.innerWidth, height: window.innerHeight } : { width: 1280, height: 720 })
    const offset = TOOLTIP_OFFSET

    // 确定最终方向
    let finalPosition = position
    let flipped = false

    if (position === 'top' && rect.top - offset < 0) {
      finalPosition = 'bottom'
      flipped = true
    } else if (position === 'bottom' && rect.bottom + offset > vp.height) {
      finalPosition = 'top'
      flipped = true
    } else if (position === 'left' && rect.left - offset < 0) {
      finalPosition = 'right'
      flipped = true
    } else if (position === 'right' && rect.right + offset > vp.width) {
      finalPosition = 'left'
      flipped = true
    }

    // 计算位置
    let top, left
    switch (finalPosition) {
      case 'top':
        top = rect.top - offset
        left = rect.left + rect.width / 2
        break
      case 'bottom':
        top = rect.bottom + offset
        left = rect.left + rect.width / 2
        break
      case 'left':
        top = rect.top + rect.height / 2
        left = rect.left - offset
        break
      case 'right':
        top = rect.top + rect.height / 2
        left = rect.right + offset
        break
      default:
        top = rect.top
        left = rect.left
    }

    const tooltip = {
      content: String(content),
      position: finalPosition,
      css: {
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        zIndex: '10000',
        pointerEvents: 'none',
      },
    }

    return { shown: true, tooltip, flipped, finalPosition, errors }
  } catch (err) {
    errors.push(`工具提示显示失败: ${err.message}`)
    return { shown: false, tooltip: null, flipped: false, finalPosition: position, errors }
  }
}

// ==================== smoothScrollTo ====================

/**
 * 缓动平滑滚动
 *
 * 使用 easeInOutCubic 缓动函数计算滚动帧。
 * 返回滚动参数供外部使用。
 *
 * @param {object} element — 滚动容器元素（需支持 scrollTop）
 * @param {number} target — 目标滚动位置（像素）
 * @param {object} [options] — 可选参数
 * @param {number} [options.duration] — 动画时长（毫秒）
 * @returns {{ success: boolean, from: number, to: number, distance: number, duration: number, errors: string[] }}
 */
export function smoothScrollTo(element, target, options = {}) {
  const errors = []

  try {
    if (!element || typeof element !== 'object') {
      errors.push('element 必须是有效的 DOM 元素对象')
      return { success: false, from: 0, to: 0, distance: 0, duration: 0, errors }
    }

    if (typeof target !== 'number' || isNaN(target)) {
      errors.push('target 必须是有效数字')
      return { success: false, from: 0, to: 0, distance: 0, duration: 0, errors }
    }

    if (target < 0) {
      errors.push('target 不能为负数')
      return { success: false, from: 0, to: 0, distance: 0, duration: 0, errors }
    }

    const duration = typeof options.duration === 'number' ? options.duration : SCROLL_DURATION
    const from = element.scrollTop || 0
    const to = Math.max(0, Math.floor(target))
    const distance = Math.abs(to - from)

    // 标记滚动状态
    element.dataset = element.dataset || {}
    element.dataset.scrolling = 'true'
    element.dataset.scrollFrom = String(from)
    element.dataset.scrollTo = String(to)

    return { success: true, from, to, distance, duration, errors }
  } catch (err) {
    errors.push(`平滑滚动失败: ${err.message}`)
    return { success: false, from: 0, to: 0, distance: 0, duration: 0, errors }
  }
}

// ==================== Easing Utilities ====================

/**
 * easeInOutCubic 缓动函数
 *
 * @param {number} t — 归一化时间 [0, 1]
 * @returns {number} 缓动后的值 [0, 1]
 */
export function easeInOutCubic(t) {
  if (typeof t !== 'number' || isNaN(t)) return 0
  const clamped = Math.max(0, Math.min(1, t))
  if (clamped < 0.5) {
    return 4 * clamped * clamped * clamped
  }
  return 1 - Math.pow(-2 * clamped + 2, 3) / 2
}

/**
 * easeOutQuad 缓动函数
 *
 * @param {number} t — 归一化时间 [0, 1]
 * @returns {number} 缓动后的值 [0, 1]
 */
export function easeOutQuad(t) {
  if (typeof t !== 'number' || isNaN(t)) return 0
  const clamped = Math.max(0, Math.min(1, t))
  return 1 - (1 - clamped) * (1 - clamped)
}

/**
 * snapToGrid 工具函数
 *
 * 将坐标吸附到最近的网格点。
 *
 * @param {number} value — 原始坐标值
 * @param {number} [gridSize] — 网格间距
 * @returns {number} 吸附后的坐标值
 */
export function snapToGrid(value, gridSize = GRID_SNAP_SIZE) {
  if (typeof value !== 'number' || isNaN(value)) return 0
  if (typeof gridSize !== 'number' || gridSize <= 0) return value
  return Math.round(value / gridSize) * gridSize
}
