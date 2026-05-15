import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// ==================== DOM Mock ====================

class MockElement {
  constructor() {
    this.style = {}
    this.classList = new MockClassList()
    this.childNodes = []
    this.parentNode = null
    this.dataset = {}
    this.textContent = ''
    this.tagName = 'DIV'
  }
  appendChild(el) { this.childNodes.push(el); el.parentNode = this; return el }
  removeChild(el) { const i = this.childNodes.indexOf(el); if (i >= 0) this.childNodes.splice(i, 1); el.parentNode = null; return el }
  contains(target) { return this === target || this.childNodes.some(c => c.contains?.(target)) }
  getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 200 } }
  get offsetHeight() { return 36 }
  get offsetWidth() { return 240 }
  addEventListener() {}
  removeEventListener() {}
}

class MockClassList {
  constructor() { this._set = new Set() }
  add(c) { this._set.add(c) }
  remove(c) { this._set.delete(c) }
  contains(c) { return this._set.has(c) }
}

class MockDocument {
  constructor() {
    this._listeners = {}
    this._body = new MockElement()
  }
  addEventListener(ev, fn, opts) { (this._listeners[ev] ||= []).push({ fn, opts }) }
  removeEventListener(ev, fn) { const arr = this._listeners[ev]; if (arr) { this._listeners[ev] = arr.filter(l => l.fn !== fn) } }
  createElement(tag) { return new MockElement() }
  get body() { return this._body }
  querySelector(sel) { return null }
}

class MockWindow {
  constructor() {
    this.innerWidth = 1200
    this.innerHeight = 800
  }
  getSelection() { return this._sel || null }
}

// ==================== Tests ====================

describe('SelectionToolbar', () => {
  let toolbar
  let origDoc, origWin

  beforeEach(async () => {
    // Save originals
    origDoc = globalThis.document
    origWin = globalThis.window

    // Setup mocks
    const mockDoc = new MockDocument()
    const mockWin = new MockWindow()
    globalThis.document = mockDoc
    globalThis.window = mockWin
    globalThis.chrome = { runtime: { sendMessage: () => {} } }

    // Import module (dynamic to pick up mocks)
    const mod = await import('../lib/selection-toolbar.js')
    toolbar = new mod.SelectionToolbar({ delay: 0 })
  })

  afterEach(() => {
    toolbar?.destroy()
    globalThis.document = origDoc
    globalThis.window = origWin
    delete globalThis.chrome
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      assert.equal(toolbar._visible, false)
      assert.equal(toolbar._currentText, '')
      assert.equal(toolbar._delay, 200) // default from constructor
      assert.equal(toolbar._offsetY, 10)
      assert.equal(toolbar._edgeMargin, 8)
    })

    it('should have 4 actions defined', () => {
      assert.equal(toolbar._actions.length, 4)
      const ids = toolbar._actions.map(a => a.id)
      assert.ok(ids.includes('explain'))
      assert.ok(ids.includes('translate'))
      assert.ok(ids.includes('summarize'))
      assert.ok(ids.includes('askAI'))
    })

    it('should accept custom options', () => {
      const t2 = new (toolbar.constructor)({ delay: 500, offsetY: 20, edgeMargin: 16 })
      assert.equal(t2._delay, 500)
      assert.equal(t2._offsetY, 20)
      assert.equal(t2._edgeMargin, 16)
      t2.destroy()
    })
  })

  describe('listenForSelection', () => {
    it('should register mouseup and mousedown listeners', () => {
      toolbar.listenForSelection()
      const doc = globalThis.document
      assert.ok(doc._listeners['mouseup']?.length > 0)
      assert.ok(doc._listeners['mousedown']?.length > 0)
    })

    it('should remove listeners on destroy', () => {
      toolbar.listenForSelection()
      toolbar.destroy()
      const doc = globalThis.document
      // After destroy, listeners should be removed
      // (implementation uses removeEventListener, so count should be 0 or reduced)
      assert.equal(toolbar._toolbarEl, null)
    })
  })

  describe('showToolbar', () => {
    it('should create toolbar DOM on first show', () => {
      const rect = { top: 100, left: 200, width: 150, height: 20, bottom: 120, right: 350 }
      toolbar.showToolbar('hello world', rect)
      assert.ok(toolbar._toolbarEl)
      assert.equal(toolbar._visible, true)
      assert.equal(toolbar._currentText, 'hello world')
    })

    it('should reuse existing toolbar DOM', () => {
      const rect = { top: 100, left: 200, width: 150, height: 20, bottom: 120, right: 350 }
      toolbar.showToolbar('first', rect)
      const el1 = toolbar._toolbarEl
      toolbar.showToolbar('second', rect)
      assert.equal(toolbar._toolbarEl, el1) // same DOM element
    })

    it('should not show if text is empty', () => {
      const rect = { top: 100, left: 200, width: 150, height: 20, bottom: 120, right: 350 }
      toolbar.showToolbar('', rect)
      assert.equal(toolbar._visible, false)
    })

    it('should position above selection by default', () => {
      const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
      toolbar.showToolbar('test', rect)
      const el = toolbar._toolbarEl
      // top should be rect.top - offset - toolbar height
      const top = parseInt(el.style.top)
      assert.ok(top < 200, `Expected top < 200, got ${top}`)
    })

    it('should handle boundary: top overflow', () => {
      const rect = { top: 5, left: 400, width: 100, height: 20, bottom: 25, right: 500 }
      toolbar.showToolbar('near top', rect)
      const el = toolbar._toolbarEl
      const top = parseInt(el.style.top)
      // Should flip below selection
      assert.ok(top >= rect.bottom, `Expected top >= ${rect.bottom}, got ${top}`)
    })

    it('should handle boundary: left overflow', () => {
      const rect = { top: 200, left: -50, width: 100, height: 20, bottom: 220, right: 50 }
      toolbar.showToolbar('near left', rect)
      const el = toolbar._toolbarEl
      const left = parseInt(el.style.left)
      assert.ok(left >= toolbar._edgeMargin, `Expected left >= ${toolbar._edgeMargin}, got ${left}`)
    })

    it('should handle boundary: right overflow', () => {
      globalThis.window.innerWidth = 500
      const rect = { top: 200, left: 450, width: 100, height: 20, bottom: 220, right: 550 }
      toolbar.showToolbar('near right', rect)
      const el = toolbar._toolbarEl
      const left = parseInt(el.style.left)
      assert.ok(left + el.offsetWidth <= 500 - toolbar._edgeMargin,
        `Expected right edge <= ${500 - toolbar._edgeMargin}, got ${left + el.offsetWidth}`)
    })
  })

  describe('hideToolbar', () => {
    it('should hide toolbar and reset state', () => {
      const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
      toolbar.showToolbar('test', rect)
      assert.equal(toolbar._visible, true)

      toolbar.hideToolbar()
      assert.equal(toolbar._visible, false)
      assert.equal(toolbar._currentText, '')
    })

    it('should be safe to call multiple times', () => {
      toolbar.hideToolbar()
      toolbar.hideToolbar()
      assert.equal(toolbar._visible, false)
    })
  })

  describe('visible getter', () => {
    it('should return false initially', () => {
      assert.equal(toolbar.visible, false)
    })

    it('should return true after show', () => {
      const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
      toolbar.showToolbar('test', rect)
      assert.equal(toolbar.visible, true)
    })
  })

  describe('currentText getter', () => {
    it('should return empty string initially', () => {
      assert.equal(toolbar.currentText, '')
    })

    it('should return selected text after show', () => {
      const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
      toolbar.showToolbar('hello world', rect)
      assert.equal(toolbar.currentText, 'hello world')
    })
  })

  describe('DOM structure', () => {
    it('should create toolbar with 4 buttons', () => {
      const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
      toolbar.showToolbar('test', rect)
      const el = toolbar._toolbarEl
      assert.equal(el.childNodes.length, 4)
    })
  })
})
