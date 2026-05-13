/**
 * BookmarkAccessibility — 书签面板无障碍支持 (R79)
 *
 * 为书签图谱面板提供完整的无障碍功能:
 *   - 键盘导航: Arrow Up/Down/Enter/Escape/Home/End
 *   - 屏幕阅读器: aria-label, role, live regions
 *   - 焦点管理: 焦点陷阱 (focus trap), 焦点环 (focus ring)
 *   - 颜色对比度: WCAG AA 审计工具 (≥ 4.5:1)
 *
 * 纯逻辑模块，不直接操作 DOM，通过属性/回调与 UI 层交互。
 *
 * 无外部依赖，纯 ES Module。
 */

// ==================== 常量 ====================

/** ARIA 角色定义 */
export const ARIA_ROLES = {
  bookmarksList: 'list',
  bookmarkItem: 'listitem',
  folderNav: 'toolbar',
  liveRegion: 'status',
  detailPanel: 'dialog',
  searchBox: 'search',
}

/** 焦点陷阱可聚焦元素选择器 */
export const FOCUS_TRAP_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
]

/** 键盘导航按键常量 */
export const KEYBOARD_NAV_KEYS = {
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  ENTER: 'Enter',
  ESCAPE: 'Escape',
  HOME: 'Home',
  END: 'End',
  TAB: 'Tab',
}

/** 书签状态中文映射 */
const STATUS_LABELS = {
  unread: '待读',
  reading: '阅读中',
  read: '已读',
}

/** 已知 CSS 变量色彩对比度检查对 */
const CONTRAST_PAIRS = [
  { selector: '--text-primary on --bg-primary', fg: '#18181b', bg: '#fafafa' },
  { selector: '--text-secondary on --bg-primary', fg: '#71717a', bg: '#fafafa' },
  { selector: '--text-muted on --bg-primary', fg: '#70707b', bg: '#fafafa' },
  { selector: '--text-primary on --bg-elevated', fg: '#18181b', bg: '#ffffff' },
  { selector: '--text-secondary on --bg-elevated', fg: '#71717a', bg: '#ffffff' },
  { selector: '--text-muted on --bg-elevated', fg: '#70707b', bg: '#ffffff' },
  { selector: '--accent on --bg-primary', fg: '#6366f1', bg: '#fafafa' },
  { selector: '--info on --info-light', fg: '#3b82f6', bg: '#eff6ff' },
  { selector: '--danger on --danger-light', fg: '#ef4444', bg: '#fef2f2' },
  { selector: '--warning on --warning-light', fg: '#f59e0b', bg: '#fffbeb' },
  { selector: '--text-inverse on --accent', fg: '#ffffff', bg: '#6366f1' },
  { selector: 'bk-status-unread on --info-light', fg: '#2563eb', bg: '#eff6ff' },
  { selector: 'bk-status-reading on --warning-light', fg: '#b45309', bg: '#fffbeb' },
  { selector: 'bk-status-read on --success-light', fg: '#15803d', bg: '#f0fdf4' },
]

// ==================== 颜色工具函数 ====================

/**
 * 将 HEX 颜色解析为 RGB
 * @param {string} hex — #RRGGBB 或 RRGGBB
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
  const clean = hex.replace(/^#/, '')
  const num = parseInt(clean, 16)
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  }
}

/**
 * 计算相对亮度 (WCAG 2.1)
 * @param {string} hex
 * @returns {number} 0-1
 */
function getRelativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  const toLinear = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * 计算两个 HEX 颜色的对比度
 * @param {string} fg — 前景色
 * @param {string} bg — 背景色
 * @returns {number} 对比度 (1-21)
 */
export function getContrastRatio(fg, bg) {
  const l1 = getRelativeLuminance(fg)
  const l2 = getRelativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 检查是否满足 WCAG AA 对比度要求
 * @param {string} fg
 * @param {string} bg
 * @param {boolean} [isLargeText=false] — 大文本阈值 3:1
 * @returns {boolean}
 */
export function meetsWCAG_AA(fg, bg, isLargeText = false) {
  const ratio = getContrastRatio(fg, bg)
  return isLargeText ? ratio >= 3 : ratio >= 4.5
}

// ==================== BookmarkAccessibility ====================

export class BookmarkAccessibility {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.enabled=false] — 初始启用状态
   */
  constructor(options = {}) {
    this._enabled = options.enabled === true
    this._traps = []
    this._announcers = []
    this._handlers = []
  }

  // ==================== 状态控制 ====================

  /**
   * 是否已启用
   * @returns {boolean}
   */
  isEnabled() {
    return this._enabled
  }

  /**
   * 启用无障碍功能
   */
  enable() {
    this._enabled = true
  }

  /**
   * 禁用无障碍功能
   */
  disable() {
    this._enabled = false
  }

  /**
   * 切换启用/禁用
   */
  toggle() {
    this._enabled = !this._enabled
  }

  // ==================== 键盘导航 ====================

  /**
   * 创建键盘导航处理器
   *
   * @param {Object} config
   * @param {Array} config.items — 可聚焦元素列表
   * @param {Function} config.getActiveIndex — 获取当前活跃索引
   * @param {Function} config.setActiveIndex — 设置当前活跃索引
   * @param {Function} config.onSelect — 选中回调 (index) => void
   * @param {Function} config.onEscape — Escape 回调 () => void
   * @param {Function} [config.onNavigate] — 导航回调 (index, direction) => void
   * @returns {Function} keydown 事件处理器
   */
  createKeyHandler(config) {
    const {
      items = [],
      getActiveIndex = () => -1,
      setActiveIndex = () => {},
      onSelect = () => {},
      onEscape = () => {},
      onNavigate = () => {},
    } = config

    return (event) => {
      if (!this._enabled) return

      const { key } = event
      const currentIndex = getActiveIndex()
      const itemCount = items.length

      if (itemCount === 0) return

      switch (key) {
        case KEYBOARD_NAV_KEYS.DOWN:
        case KEYBOARD_NAV_KEYS.RIGHT: {
          event.preventDefault()
          const next = Math.min(currentIndex + 1, itemCount - 1)
          if (next !== currentIndex) {
            setActiveIndex(next)
            items[next]?.focus?.()
            onNavigate(next, 'down')
          }
          break
        }

        case KEYBOARD_NAV_KEYS.UP:
        case KEYBOARD_NAV_KEYS.LEFT: {
          event.preventDefault()
          const prev = Math.max(currentIndex - 1, 0)
          if (prev !== currentIndex) {
            setActiveIndex(prev)
            items[prev]?.focus?.()
            onNavigate(prev, 'up')
          }
          break
        }

        case KEYBOARD_NAV_KEYS.HOME: {
          event.preventDefault()
          setActiveIndex(0)
          items[0]?.focus?.()
          onNavigate(0, 'home')
          break
        }

        case KEYBOARD_NAV_KEYS.END: {
          event.preventDefault()
          const last = itemCount - 1
          setActiveIndex(last)
          items[last]?.focus?.()
          onNavigate(last, 'end')
          break
        }

        case KEYBOARD_NAV_KEYS.ENTER: {
          event.preventDefault()
          onSelect(currentIndex)
          break
        }

        case KEYBOARD_NAV_KEYS.ESCAPE: {
          event.preventDefault()
          onEscape()
          break
        }
      }
    }
  }

  // ==================== 焦点陷阱 ====================

  /**
   * 创建焦点陷阱
   * 将 Tab 焦点限制在容器内，形成循环。
   *
   * @param {Element|Object} container — DOM 容器
   * @returns {{ activate: Function, deactivate: Function, isActive: Function }}
   */
  createFocusTrap(container) {
    let active = false
    let previousFocus = null

    const getFocusableElements = () => {
      const selector = FOCUS_TRAP_SELECTORS.join(', ')
      return Array.from(container.querySelectorAll(selector))
    }

    const handleKeydown = (event) => {
      if (!active) return
      if (event.key !== KEYBOARD_NAV_KEYS.TAB) return

      const focusable = getFocusableElements()
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey) {
        // Shift+Tab: 如果当前焦点在第一个元素，跳到最后一个
        if (container.activeElement === first || !container.contains(container.activeElement)) {
          event.preventDefault()
          last.focus()
        }
      } else {
        // Tab: 如果当前焦点在最后一个元素，跳到第一个
        if (container.activeElement === last || !container.contains(container.activeElement)) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    // 阻止焦点逃逸到容器外
    const handleFocusIn = (event) => {
      if (!active) return
      if (!container.contains(event.target)) {
        const focusable = getFocusableElements()
        if (focusable.length > 0) {
          focusable[0].focus()
        }
      }
    }

    return {
      activate() {
        if (active) return
        active = true
        previousFocus = container.activeElement || null
        container.addEventListener('keydown', handleKeydown)
        container.addEventListener('focusin', handleFocusIn)

        // 自动聚焦第一个可聚焦元素
        const focusable = getFocusableElements()
        if (focusable.length > 0) {
          focusable[0].focus()
        }
      },

      deactivate() {
        if (!active) return
        active = false
        container.removeEventListener('keydown', handleKeydown)
        container.removeEventListener('focusin', handleFocusIn)

        // 恢复之前的焦点
        if (previousFocus && previousFocus.focus) {
          previousFocus.focus()
        }
      },

      isActive() {
        return active
      },
    }
  }

  // ==================== ARIA 属性生成 ====================

  /**
   * 生成书签列表容器的 ARIA 属性
   * @param {Object} opts
   * @param {number} opts.count — 书签数量
   * @returns {Object} 属性键值对
   */
  getBookmarkListAriaAttrs(opts = {}) {
    const count = opts.count || 0
    return {
      role: ARIA_ROLES.bookmarksList,
      'aria-label': `书签列表，共 ${count} 个书签`,
    }
  }

  /**
   * 生成单个书签条目的 ARIA 属性
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.url
   * @param {string} opts.status — unread | reading | read
   * @param {number} opts.index — 当前索引 (0-based)
   * @param {number} opts.total — 总数
   * @returns {Object}
   */
  getBookmarkItemAriaAttrs(opts = {}) {
    const {
      title = '',
      url = '',
      status = 'unread',
      index = 0,
      total = 0,
    } = opts

    const statusLabel = STATUS_LABELS[status] || status
    const label = [
      title || url,
      statusLabel,
      `${index + 1} / ${total}`,
    ].join(', ')

    return {
      role: ARIA_ROLES.bookmarkItem,
      tabindex: '0',
      'aria-label': label,
    }
  }

  /**
   * 生成 Live Region 属性
   * @returns {Object}
   */
  getLiveRegionAttrs() {
    return {
      'aria-live': 'polite',
      'aria-atomic': 'true',
      role: ARIA_ROLES.liveRegion,
    }
  }

  /**
   * 生成文件夹导航的 ARIA 属性
   * @returns {Object}
   */
  getFolderNavAriaAttrs() {
    return {
      role: ARIA_ROLES.folderNav,
      'aria-label': '书签文件夹导航',
    }
  }

  /**
   * 生成状态徽章的 ARIA 属性
   * @param {string} status — unread | reading | read
   * @returns {Object}
   */
  getStatusAriaAttrs(status) {
    return {
      role: 'status',
      'aria-label': STATUS_LABELS[status] || status,
    }
  }

  /**
   * 生成详情面板的 ARIA 属性
   * @param {Object} opts
   * @param {string} opts.title — 书签标题
   * @returns {Object}
   */
  getDetailPanelAriaAttrs(opts = {}) {
    return {
      role: ARIA_ROLES.detailPanel,
      'aria-label': `书签详情: ${opts.title || ''}`,
      'aria-modal': 'true',
    }
  }

  /**
   * 生成搜索框的 ARIA 属性
   * @returns {Object}
   */
  getSearchBoxAriaAttrs() {
    return {
      role: ARIA_ROLES.searchBox,
      'aria-label': '搜索书签',
    }
  }

  // ==================== Live Region 公告 ====================

  /**
   * 创建屏幕阅读器公告器
   * @param {Object|Element} container — DOM 容器
   * @returns {{ announce: Function, destroy: Function }}
   */
  createAnnouncer(container) {
    let liveEl = null

    const ensureElement = () => {
      if (liveEl) return liveEl

      // 尝试查找已存在的 live region
      if (container.querySelector) {
        liveEl = container.querySelector('[aria-live]')
      }

      if (!liveEl) {
        // 创建一个 sr-only 的 live region
        liveEl = {
          _textContent: '',
          setAttribute: () => {},
          getAttribute: () => '',
          style: {},
          set textContent(v) { this._textContent = v },
          get textContent() { return this._textContent },
        }
        if (container.appendChild) {
          container.appendChild(liveEl)
        }
      }

      return liveEl
    }

    return {
      /**
       * 向屏幕阅读器公告消息
       * @param {string} message
       */
      announce(message) {
        if (!this._enabled && !this._enabled) return
        const el = ensureElement()
        // 清空再设置，确保屏幕阅读器会重新读
        el.textContent = ''
        // 使用微任务确保浏览器有时间检测变化
        setTimeout(() => {
          el.textContent = message
        }, 50)
      },

      /**
       * 销毁公告器
       */
      destroy() {
        if (liveEl && container.removeChild) {
          try { container.removeChild(liveEl) } catch { /* ignore */ }
        }
        liveEl = null
      },
    }
  }

  // ==================== 对比度审计 ====================

  /**
   * 审计预定义色彩组合的 WCAG AA 对比度
   * @returns {Array<{ selector: string, foreground: string, background: string, ratio: number, passes: boolean }>}
   */
  static auditContrast() {
    return CONTRAST_PAIRS.map((pair) => {
      const ratio = getContrastRatio(pair.fg, pair.bg)
      return {
        selector: pair.selector,
        foreground: pair.fg,
        background: pair.bg,
        ratio: Math.round(ratio * 100) / 100,
        passes: ratio >= 4.5,
      }
    })
  }

  // ==================== 无障碍 HTML 属性工具 ====================

  /**
   * 将属性对象转为 HTML 属性字符串
   * @param {Object} attrs
   * @returns {string}
   */
  static attrsToString(attrs) {
    return Object.entries(attrs)
      .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
      .join(' ')
  }

  /**
   * 为书签列表项生成无障碍 HTML 属性字符串
   * @param {Object} opts
   * @returns {string}
   */
  getBookmarkItemAttrString(opts) {
    return BookmarkAccessibility.attrsToString(this.getBookmarkItemAriaAttrs(opts))
  }

  /**
   * 为书签列表容器生成无障碍 HTML 属性字符串
   * @param {Object} opts
   * @returns {string}
   */
  getBookmarkListAttrString(opts) {
    return BookmarkAccessibility.attrsToString(this.getBookmarkListAriaAttrs(opts))
  }

  // ==================== 清理 ====================

  /**
   * 清理所有资源
   */
  destroy() {
    this._enabled = false
    this._traps.forEach(t => {
      if (t.deactivate) t.deactivate()
    })
    this._traps = []
    this._announcers.forEach(a => {
      if (a.destroy) a.destroy()
    })
    this._announcers = []
    this._handlers = []
  }
}
