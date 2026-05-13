/**
 * BookmarkShortcuts — 快捷键管理模块 (R91)
 *
 * 提供通用快捷键注册、注销、事件处理与格式化显示功能。
 *
 * 功能:
 *   - registerShortcut(action, keyCombo) — 注册快捷键
 *   - unregisterShortcut(action) — 注销快捷键
 *   - getShortcuts() — 获取所有已注册快捷键
 *   - handleKeyboardEvent(event) — 处理键盘事件并匹配快捷键
 *   - formatShortcut(keyCombo) — 格式化快捷键为可读字符串
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 */

// ==================== 默认快捷键 ====================

/**
 * 默认快捷键映射
 * @type {Record<string, { key: string, ctrl?: boolean, meta?: boolean, shift?: boolean, alt?: boolean }>}
 */
export const DEFAULT_SHORTCUTS = {
  addBookmark:     { key: 'b', ctrl: true,  meta: false, shift: false, alt: false },
  searchBookmarks: { key: 'k', ctrl: true,  meta: false, shift: false, alt: false },
  openManager:     { key: 'b', ctrl: true,  meta: false, shift: true,  alt: false },
  deleteBookmark:  { key: 'Delete', ctrl: false, meta: false, shift: false, alt: false },
  copyUrl:         { key: 'c', ctrl: true,  meta: false, shift: true,  alt: false },
}

// ==================== 快捷键注册表 ====================

/**
 * 快捷键注册表 — 管理所有已注册的快捷键
 */
export class BookmarkShortcuts {
  constructor() {
    /** @type {Map<string, object>} action → keyCombo */
    this._shortcuts = new Map()

    /** @type {Map<string, Function>} action → handler */
    this._handlers = new Map()

    // 加载默认快捷键
    for (const [action, keyCombo] of Object.entries(DEFAULT_SHORTCUTS)) {
      this._shortcuts.set(action, { ...keyCombo })
    }
  }

  // ==================== 注册 / 注销 ====================

  /**
   * 注册一个快捷键
   *
   * @param {string} action — 操作名称
   * @param {{ key: string, ctrl?: boolean, meta?: boolean, shift?: boolean, alt?: boolean }} keyCombo — 按键组合
   * @param {Function} [handler] — 可选的事件处理函数
   * @returns {{ success: boolean, error?: string }}
   */
  registerShortcut(action, keyCombo, handler) {
    if (!action || typeof action !== 'string') {
      return { success: false, error: 'action must be a non-empty string' }
    }

    if (!keyCombo || typeof keyCombo !== 'object' || !keyCombo.key) {
      return { success: false, error: 'keyCombo must be an object with a key property' }
    }

    if (typeof keyCombo.key !== 'string' || keyCombo.key.length === 0) {
      return { success: false, error: 'keyCombo.key must be a non-empty string' }
    }

    // 检测冲突: 是否有其他 action 已使用相同的按键组合
    for (const [existingAction, existingCombo] of this._shortcuts) {
      if (existingAction === action) continue
      if (this._combosEqual(existingCombo, keyCombo)) {
        return {
          success: false,
          error: `shortcut conflict: "${existingAction}" already uses this key combination`,
        }
      }
    }

    const normalized = {
      key: keyCombo.key,
      ctrl: !!keyCombo.ctrl,
      meta: !!keyCombo.meta,
      shift: !!keyCombo.shift,
      alt: !!keyCombo.alt,
    }

    this._shortcuts.set(action, normalized)

    if (typeof handler === 'function') {
      this._handlers.set(action, handler)
    }

    return { success: true }
  }

  /**
   * 注销一个快捷键
   *
   * @param {string} action — 操作名称
   * @returns {{ success: boolean, error?: string }}
   */
  unregisterShortcut(action) {
    if (!action || typeof action !== 'string') {
      return { success: false, error: 'action must be a non-empty string' }
    }

    if (!this._shortcuts.has(action)) {
      return { success: false, error: `action "${action}" is not registered` }
    }

    this._shortcuts.delete(action)
    this._handlers.delete(action)

    return { success: true }
  }

  // ==================== 查询 ====================

  /**
   * 获取所有已注册的快捷键
   * @returns {Record<string, object>}
   */
  getShortcuts() {
    const result = {}
    for (const [action, keyCombo] of this._shortcuts) {
      result[action] = { ...keyCombo }
    }
    return result
  }

  // ==================== 事件处理 ====================

   /**
   * 处理键盘事件，匹配并执行对应的快捷键操作
   *
   * @param {Object} event — 键盘事件 (或兼容对象)
   * @param {string} event.key — 按键名称
   * @param {boolean} [event.ctrlKey] — Ctrl 是否按下
   * @param {boolean} [event.metaKey] — Meta 是否按下
   * @param {boolean} [event.shiftKey] — Shift 是否按下
   * @param {boolean} [event.altKey] — Alt 是否按下
   * @returns {{ matched: boolean, action?: string }}
   */
  handleKeyboardEvent(event) {
    if (!event || typeof event !== 'object') {
      return { matched: false }
    }

    const eventKey = event.key || ''
    const eventCtrl = !!event.ctrlKey
    const eventMeta = !!event.metaKey
    const eventShift = !!event.shiftKey
    const eventAlt = !!event.altKey

    for (const [action, combo] of this._shortcuts) {
      const comboKey = combo.key.length === 1 ? combo.key.toLowerCase() : combo.key
      const evtKey = eventKey.length === 1 ? eventKey.toLowerCase() : eventKey

      if (comboKey !== evtKey) continue
      if (!!combo.ctrl !== eventCtrl) continue
      if (!!combo.meta !== eventMeta) continue
      if (!!combo.shift !== eventShift) continue
      if (!!combo.alt !== eventAlt) continue

      // 匹配成功 — 调用 handler (如果有)
      const handler = this._handlers.get(action)
      if (handler) {
        handler(action)
      }

      return { matched: true, action }
    }

    return { matched: false }
  }

  // ==================== 格式化 ====================

  /**
   * 格式化快捷键组合为可读字符串
   *
   * @param {{ key: string, ctrl?: boolean, meta?: boolean, shift?: boolean, alt?: boolean }} keyCombo
   * @returns {string} 例如 "Ctrl+Shift+B"
   */
  formatShortcut(keyCombo) {
    if (!keyCombo || !keyCombo.key) {
      return ''
    }

    const parts = []
    if (keyCombo.ctrl) parts.push('Ctrl')
    if (keyCombo.alt) parts.push('Alt')
    if (keyCombo.shift) parts.push('Shift')
    if (keyCombo.meta) parts.push('Meta')

    let keyName = keyCombo.key

    // 特殊按键名称映射
    const SPECIAL_KEYS = {
      ' ': 'Space',
      'Delete': 'Del',
      'Backspace': 'Bksp',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'Escape': 'Esc',
      'Enter': '↵',
      'Tab': '⇥',
    }

    if (SPECIAL_KEYS[keyName]) {
      keyName = SPECIAL_KEYS[keyName]
    } else if (keyName.length === 1) {
      keyName = keyName.toUpperCase()
    }

    parts.push(keyName)
    return parts.join('+')
  }

  // ==================== 内部方法 ====================

  /**
   * 判断两个按键组合是否相同
   * @param {object} a
   * @param {object} b
   * @returns {boolean}
   */
  _combosEqual(a, b) {
    const na = {
      key: (a.key || '').toLowerCase(),
      ctrl: !!a.ctrl,
      meta: !!a.meta,
      shift: !!a.shift,
      alt: !!a.alt,
    }
    const nb = {
      key: (b.key || '').toLowerCase(),
      ctrl: !!b.ctrl,
      meta: !!b.meta,
      shift: !!b.shift,
      alt: !!b.alt,
    }
    return na.key === nb.key
      && na.ctrl === nb.ctrl
      && na.meta === nb.meta
      && na.shift === nb.shift
      && na.alt === nb.alt
  }
}
