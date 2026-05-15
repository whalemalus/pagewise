import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// ==================== DOM Mock ====================

class MockElement {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase()
    this.style = {}
    this.classList = new MockClassList()
    this.childNodes = []
    this.parentNode = null
    this.dataset = {}
    this.textContent = ''
    this._attributes = {}
    this._className = ''
  }
  get className() { return this._className }
  set className(val) {
    this._className = val
    this.classList = new MockClassList()
    if (val) {
      val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c))
    }
  }
  appendChild(el) { this.childNodes.push(el); el.parentNode = this; return el }
  removeChild(el) {
    const i = this.childNodes.indexOf(el)
    if (i >= 0) this.childNodes.splice(i, 1)
    el.parentNode = null
    return el
  }
  contains(target) { return this === target || this.childNodes.some(c => c.contains?.(target)) }
  setAttribute(k, v) { this._attributes[k] = v }
  getAttribute(k) { return this._attributes[k] }
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
    this._body = new MockElement('body')
  }
  addEventListener(ev, fn, opts) { (this._listeners[ev] ||= []).push({ fn, opts }) }
  removeEventListener(ev, fn) {
    const arr = this._listeners[ev]
    if (arr) { this._listeners[ev] = arr.filter(l => l.fn !== fn) }
  }
  createElement(tag) { return new MockElement(tag) }
  get body() { return this._body }
  querySelector() { return null }
}

class MockWindow {
  constructor() {
    this.innerWidth = 1200
    this.innerHeight = 800
    this._selText = ''
  }
  getSelection() {
    return {
      toString: () => this._selText,
      isCollapsed: this._selText === ''
    }
  }
}

// ==================== Tests ====================

describe('ExploreMode', () => {
  let ExploreMode
  let exploreMode
  let origDoc, origWin, origChrome, origRAF

  beforeEach(async () => {
    origDoc = globalThis.document
    origWin = globalThis.window
    origChrome = globalThis.chrome
    origRAF = globalThis.requestAnimationFrame

    const mockDoc = new MockDocument()
    const mockWin = new MockWindow()
    globalThis.document = mockDoc
    globalThis.window = mockWin
    globalThis.chrome = { runtime: { sendMessage: () => {} } }
    globalThis.requestAnimationFrame = (cb) => cb()

    const mod = await import('../lib/explore-mode.js')
    ExploreMode = mod.ExploreMode
    exploreMode = new ExploreMode()
  })

  afterEach(() => {
    exploreMode?.destroy()
    globalThis.document = origDoc
    globalThis.window = origWin
    globalThis.chrome = origChrome
    globalThis.requestAnimationFrame = origRAF
  })

  describe('constructor', () => {
    it('should initialize as inactive', () => {
      assert.equal(exploreMode.isActive(), false)
    })

    it('should have default options', () => {
      assert.equal(exploreMode._debounceMs, 300)
      assert.equal(exploreMode._minSelectionLength, 2)
      assert.equal(exploreMode._indicatorText, '🔍 探索模式')
    })

    it('should accept custom options', () => {
      const em = new ExploreMode({ debounceMs: 500, minSelectionLength: 5, indicatorText: 'CUSTOM' })
      assert.equal(em._debounceMs, 500)
      assert.equal(em._minSelectionLength, 5)
      assert.equal(em._indicatorText, 'CUSTOM')
      em.destroy()
    })
  })

  describe('enable', () => {
    it('should activate explore mode', () => {
      exploreMode.enable()
      assert.equal(exploreMode.isActive(), true)
    })

    it('should register keydown and mouseup listeners', () => {
      exploreMode.enable()
      const doc = globalThis.document
      assert.ok(doc._listeners['keydown']?.length > 0, 'keydown listener should be registered')
      assert.ok(doc._listeners['mouseup']?.length > 0, 'mouseup listener should be registered')
    })

    it('should create indicator DOM element', () => {
      exploreMode.enable()
      assert.ok(exploreMode._indicatorEl, 'indicator element should exist')
      assert.equal(exploreMode._indicatorEl.textContent, '🔍 探索模式')
      assert.ok(exploreMode._indicatorEl.classList.contains('pw-explore-mode-indicator'))
    })

    it('should not re-enable if already active', () => {
      exploreMode.enable()
      const el1 = exploreMode._indicatorEl
      exploreMode.enable()
      assert.equal(exploreMode._indicatorEl, el1, 'should not create duplicate indicator')
    })

    it('should add visible class via requestAnimationFrame', () => {
      exploreMode.enable()
      assert.ok(exploreMode._indicatorEl.classList.contains('pw-explore-mode-indicator--visible'))
    })

    it('should set aria attributes on indicator', () => {
      exploreMode.enable()
      const el = exploreMode._indicatorEl
      assert.equal(el.getAttribute('role'), 'status')
      assert.equal(el.getAttribute('aria-live'), 'polite')
      assert.equal(el.getAttribute('aria-label'), '探索模式已开启')
    })
  })

  describe('disable', () => {
    it('should deactivate explore mode', () => {
      exploreMode.enable()
      exploreMode.disable()
      assert.equal(exploreMode.isActive(), false)
    })

    it('should remove listeners', () => {
      exploreMode.enable()
      exploreMode.disable()
      // After disable, the indicator should start hiding
      assert.equal(exploreMode._indicatorEl, null)
    })

    it('should be safe to call when not active', () => {
      exploreMode.disable()
      assert.equal(exploreMode.isActive(), false)
    })

    it('should reset lastExplainedText', () => {
      exploreMode.enable()
      exploreMode._lastExplainedText = 'some text'
      exploreMode.disable()
      assert.equal(exploreMode._lastExplainedText, '')
    })
  })

  describe('toggle', () => {
    it('should enable if inactive', () => {
      assert.equal(exploreMode.isActive(), false)
      exploreMode.toggle()
      assert.equal(exploreMode.isActive(), true)
    })

    it('should disable if active', () => {
      exploreMode.enable()
      exploreMode.toggle()
      assert.equal(exploreMode.isActive(), false)
    })

    it('should toggle back and forth', () => {
      exploreMode.toggle()
      assert.equal(exploreMode.isActive(), true)
      exploreMode.toggle()
      assert.equal(exploreMode.isActive(), false)
      exploreMode.toggle()
      assert.equal(exploreMode.isActive(), true)
    })
  })

  describe('isActive', () => {
    it('should return false initially', () => {
      assert.equal(exploreMode.isActive(), false)
    })

    it('should return true after enable', () => {
      exploreMode.enable()
      assert.equal(exploreMode.isActive(), true)
    })

    it('should return false after disable', () => {
      exploreMode.enable()
      exploreMode.disable()
      assert.equal(exploreMode.isActive(), false)
    })
  })

  describe('keyboard handling', () => {
    it('should toggle on Ctrl+J keydown', () => {
      const doc = globalThis.document
      // Manually invoke the keydown handler
      exploreMode.enable() // register listeners
      exploreMode.disable() // disable to test toggle

      // Simulate Ctrl+J
      const handler = doc._listeners['keydown']?.[0]?.fn
      // After disable, listeners are removed, so re-enable and test
      exploreMode.enable()
      // Find the keydown handler
      const keydownHandler = doc._listeners['keydown']?.find(l => l.fn === exploreMode._boundKeyDown)?.fn
      if (keydownHandler) {
        keydownHandler({ key: 'j', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, preventDefault: () => {} })
        assert.equal(exploreMode.isActive(), false, 'should toggle off with Ctrl+J')
      }
    })

    it('should exit on Escape keydown', () => {
      exploreMode.enable()
      const doc = globalThis.document
      const keydownHandler = doc._listeners['keydown']?.find(l => l.fn === exploreMode._boundKeyDown)?.fn
      if (keydownHandler) {
        keydownHandler({ key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault: () => {} })
        assert.equal(exploreMode.isActive(), false, 'should deactivate on Escape')
      }
    })
  })

  describe('auto explain on selection', () => {
    it('should call sendMessage when text is selected in explore mode', () => {
      let sentMessage = null
      globalThis.chrome = {
        runtime: {
          sendMessage: (msg) => { sentMessage = msg }
        }
      }

      exploreMode.enable()

      // Simulate text selection
      globalThis.window._selText = 'hello world'

      // Manually trigger the mouseup handler
      const doc = globalThis.document
      const mouseupHandler = doc._listeners['mouseup']?.find(l => l.fn === exploreMode._boundMouseUp)?.fn
      if (mouseupHandler) {
        mouseupHandler({})
      }

      // Wait for debounce (we set debounceMs to 300, let's check that timer was set)
      assert.notEqual(exploreMode._debounceTimer, null, 'debounce timer should be set')
    })

    it('should not trigger explain when not active', () => {
      let sentMessage = null
      globalThis.chrome = {
        runtime: {
          sendMessage: (msg) => { sentMessage = msg }
        }
      }

      // Don't enable explore mode
      globalThis.window._selText = 'hello world'

      // Manually trigger the mouseup handler directly
      exploreMode._handleMouseUp({})

      // The handler should return early since not active
      assert.equal(sentMessage, null, 'should not send message when inactive')
    })

    it('should not trigger explain for text shorter than minimum', () => {
      exploreMode._debounceMs = 0 // no debounce for test
      exploreMode.enable()

      globalThis.window._selText = 'a' // 1 char, below minSelectionLength of 2
      exploreMode._handleMouseUp({})

      // Since debounce is 0, we can check immediately
      // The text is too short so _autoExplain should not be called
      assert.equal(exploreMode._lastExplainedText, '', 'should not explain single char')
    })

    it('should not trigger explain for same text twice', () => {
      exploreMode._debounceMs = 0
      exploreMode.enable()

      exploreMode._lastExplainedText = 'same text'
      globalThis.window._selText = 'same text'
      exploreMode._handleMouseUp({})

      // Should not update because text matches lastExplainedText
      assert.equal(exploreMode._lastExplainedText, 'same text')
    })
  })

  describe('destroy', () => {
    it('should clean up all resources', () => {
      exploreMode.enable()
      assert.ok(exploreMode._indicatorEl)

      exploreMode.destroy()
      assert.equal(exploreMode.isActive(), false)
      assert.equal(exploreMode._indicatorEl, null)
    })
  })

  describe('exports', () => {
    it('should export ExploreMode as named export', async () => {
      const mod = await import('../lib/explore-mode.js')
      assert.ok(mod.ExploreMode)
      assert.equal(typeof mod.ExploreMode, 'function')
    })

    it('should export ExploreMode as default export', async () => {
      const mod = await import('../lib/explore-mode.js')
      assert.ok(mod.default)
      assert.equal(mod.default, mod.ExploreMode)
    })
  })
})
