/**
 * 测试 lib/bookmark-shortcuts.js — 快捷键管理
 *
 * 测试范围:
 *   registerShortcut / unregisterShortcut / getShortcuts /
 *   handleKeyboardEvent / formatShortcut / DEFAULT_SHORTCUTS
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkShortcuts, DEFAULT_SHORTCUTS } = await import('../lib/bookmark-shortcuts.js');

// ==================== 辅助函数 ====================

function makeEvent(key, { ctrl = false, meta = false, shift = false, alt = false } = {}) {
  return { key, ctrlKey: ctrl, metaKey: meta, shiftKey: shift, altKey: alt }
}

function fresh() {
  return new BookmarkShortcuts()
}

// ==================== 测试 ====================

describe('BookmarkShortcuts', () => {

  // ─── DEFAULT_SHORTCUTS ─────────────────────────────────────────────────

  describe('DEFAULT_SHORTCUTS', () => {
    it('1. exports a non-empty defaults map', () => {
      assert.ok(DEFAULT_SHORTCUTS)
      assert.ok(Object.keys(DEFAULT_SHORTCUTS).length > 0)
    })

    it('2. each default entry has required properties', () => {
      for (const [action, combo] of Object.entries(DEFAULT_SHORTCUTS)) {
        assert.ok(typeof combo.key === 'string' && combo.key.length > 0, `${action} missing key`)
        assert.equal(typeof combo.ctrl, 'boolean', `${action} missing ctrl`)
        assert.equal(typeof combo.meta, 'boolean', `${action} missing meta`)
        assert.equal(typeof combo.shift, 'boolean', `${action} missing shift`)
        assert.equal(typeof combo.alt, 'boolean', `${action} missing alt`)
      }
    })
  })

  // ─── constructor ───────────────────────────────────────────────────────

  describe('constructor', () => {
    it('3. loads default shortcuts on construction', () => {
      const s = fresh()
      const all = s.getShortcuts()
      for (const action of Object.keys(DEFAULT_SHORTCUTS)) {
        assert.ok(all[action], `missing default action: ${action}`)
      }
    })
  })

  // ─── registerShortcut ──────────────────────────────────────────────────

  describe('registerShortcut', () => {
    it('4. registers a new valid shortcut', () => {
      const s = fresh()
      const result = s.registerShortcut('myAction', { key: 'x', ctrl: true })
      assert.equal(result.success, true)
      const all = s.getShortcuts()
      assert.ok(all['myAction'])
      assert.equal(all['myAction'].key, 'x')
    })

    it('5. rejects empty action', () => {
      const s = fresh()
      const result = s.registerShortcut('', { key: 'a' })
      assert.equal(result.success, false)
      assert.match(result.error, /non-empty string/)
    })

    it('6. rejects non-string action', () => {
      const s = fresh()
      const result = s.registerShortcut(123, { key: 'a' })
      assert.equal(result.success, false)
    })

    it('7. rejects keyCombo without key property', () => {
      const s = fresh()
      const result = s.registerShortcut('test', { ctrl: true })
      assert.equal(result.success, false)
      assert.match(result.error, /key property/)
    })

    it('8. rejects keyCombo with empty key', () => {
      const s = fresh()
      const result = s.registerShortcut('test', { key: '' })
      assert.equal(result.success, false)
    })

    it('9. detects conflict with existing shortcut', () => {
      const s = fresh()
      // addBookmark default uses Ctrl+B
      const result = s.registerShortcut('custom', { key: 'b', ctrl: true })
      assert.equal(result.success, false)
      assert.match(result.error, /conflict/)
    })

    it('10. allows re-registering the same action with a new key', () => {
      const s = fresh()
      const result = s.registerShortcut('addBookmark', { key: 'j', ctrl: true, shift: true })
      assert.equal(result.success, true)
      const all = s.getShortcuts()
      assert.equal(all['addBookmark'].key, 'j')
    })

    it('11. registers with optional handler', () => {
      const s = fresh()
      let called = false
      s.registerShortcut('custom', { key: 'z', ctrl: true }, () => { called = true })
      s.handleKeyboardEvent(makeEvent('z', { ctrl: true }))
      assert.equal(called, true)
    })

    it('12. normalizes boolean fields in keyCombo', () => {
      const s = fresh()
      s.registerShortcut('norm', { key: 'q', ctrl: undefined, shift: null })
      const all = s.getShortcuts()
      assert.equal(all['norm'].ctrl, false)
      assert.equal(all['norm'].shift, false)
      assert.equal(all['norm'].meta, false)
      assert.equal(all['norm'].alt, false)
    })
  })

  // ─── unregisterShortcut ───────────────────────────────────────────────

  describe('unregisterShortcut', () => {
    it('13. unregisters an existing shortcut', () => {
      const s = fresh()
      const result = s.unregisterShortcut('addBookmark')
      assert.equal(result.success, true)
      const all = s.getShortcuts()
      assert.equal(all['addBookmark'], undefined)
    })

    it('14. fails to unregister a non-existent action', () => {
      const s = fresh()
      const result = s.unregisterShortcut('nonExistent')
      assert.equal(result.success, false)
      assert.match(result.error, /not registered/)
    })

    it('15. rejects empty action on unregister', () => {
      const s = fresh()
      const result = s.unregisterShortcut('')
      assert.equal(result.success, false)
    })
  })

  // ─── getShortcuts ─────────────────────────────────────────────────────

  describe('getShortcuts', () => {
    it('16. returns a copy (mutation does not affect internal state)', () => {
      const s = fresh()
      const all = s.getShortcuts()
      all['addBookmark'].key = 'MUTATED'
      const all2 = s.getShortcuts()
      assert.equal(all2['addBookmark'].key, 'b')
    })
  })

  // ─── handleKeyboardEvent ──────────────────────────────────────────────

  describe('handleKeyboardEvent', () => {
    it('17. matches Ctrl+B → addBookmark', () => {
      const s = fresh()
      const result = s.handleKeyboardEvent(makeEvent('b', { ctrl: true }))
      assert.equal(result.matched, true)
      assert.equal(result.action, 'addBookmark')
    })

    it('18. matches Ctrl+K → searchBookmarks', () => {
      const s = fresh()
      const result = s.handleKeyboardEvent(makeEvent('k', { ctrl: true }))
      assert.equal(result.matched, true)
      assert.equal(result.action, 'searchBookmarks')
    })

    it('19. returns matched:false for unmatched combo', () => {
      const s = fresh()
      const result = s.handleKeyboardEvent(makeEvent('q'))
      assert.equal(result.matched, false)
    })

    it('20. returns matched:false for null event', () => {
      const s = fresh()
      const result = s.handleKeyboardEvent(null)
      assert.equal(result.matched, false)
    })

    it('21. distinguishes modifier keys correctly', () => {
      const s = fresh()
      // Ctrl+Shift+B should be openManager, not addBookmark
      const result = s.handleKeyboardEvent(makeEvent('b', { ctrl: true, shift: true }))
      assert.equal(result.matched, true)
      assert.equal(result.action, 'openManager')
    })

    it('22. calls handler when action matches', () => {
      const s = fresh()
      let calledAction = null
      s.registerShortcut('custom', { key: 'f', alt: true }, (action) => { calledAction = action })
      s.handleKeyboardEvent(makeEvent('f', { alt: true }))
      assert.equal(calledAction, 'custom')
    })

    it('23. handles special keys (Delete)', () => {
      const s = fresh()
      const result = s.handleKeyboardEvent(makeEvent('Delete'))
      assert.equal(result.matched, true)
      assert.equal(result.action, 'deleteBookmark')
    })

    it('24. is case-insensitive for single-char keys', () => {
      const s = fresh()
      const result = s.handleKeyboardEvent(makeEvent('B', { ctrl: true }))
      assert.equal(result.matched, true)
      assert.equal(result.action, 'addBookmark')
    })
  })

  // ─── formatShortcut ───────────────────────────────────────────────────

  describe('formatShortcut', () => {
    it('25. formats Ctrl+B', () => {
      const s = fresh()
      assert.equal(s.formatShortcut({ key: 'b', ctrl: true }), 'Ctrl+B')
    })

    it('26. formats Ctrl+Shift+B', () => {
      const s = fresh()
      assert.equal(s.formatShortcut({ key: 'b', ctrl: true, shift: true }), 'Ctrl+Shift+B')
    })

    it('27. formats plain key', () => {
      const s = fresh()
      assert.equal(s.formatShortcut({ key: 'Delete' }), 'Del')
    })

    it('28. formats arrow keys', () => {
      const s = fresh()
      assert.equal(s.formatShortcut({ key: 'ArrowUp' }), '↑')
      assert.equal(s.formatShortcut({ key: 'ArrowDown' }), '↓')
    })

    it('29. returns empty string for null/undefined input', () => {
      const s = fresh()
      assert.equal(s.formatShortcut(null), '')
      assert.equal(s.formatShortcut(undefined), '')
    })

    it('30. formats Escape and Enter', () => {
      const s = fresh()
      assert.equal(s.formatShortcut({ key: 'Escape' }), 'Esc')
      assert.equal(s.formatShortcut({ key: 'Enter' }), '↵')
    })
  })
})
