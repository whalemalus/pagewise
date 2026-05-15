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
    this.value = ''
    this.placeholder = ''
    this.rows = 0
    this._attributes = {}
    this._className = ''
    this._selectionStart = 0
    this._selectionEnd = 0
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
  focus() {}
  setSelectionRange(start, end) { this._selectionStart = start; this._selectionEnd = end }
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
}

class MockStorage {
  constructor() { this._data = {} }
  async get(key) { return { [key]: this._data[key] } }
  async set(obj) { Object.assign(this._data, obj) }
}

// ==================== Tests ====================

describe('ChatMode', () => {
  let ChatMode
  let chatMode
  let origDoc, origChrome, origRAF

  beforeEach(async () => {
    origDoc = globalThis.document
    origChrome = globalThis.chrome
    origRAF = globalThis.requestAnimationFrame

    globalThis.document = new MockDocument()
    globalThis.chrome = { runtime: { sendMessage: () => {} } }
    globalThis.requestAnimationFrame = (cb) => cb()

    const mod = await import('../lib/chat-mode.js')
    ChatMode = mod.ChatMode
    chatMode = new ChatMode()
  })

  afterEach(() => {
    chatMode?.destroy()
    globalThis.document = origDoc
    globalThis.chrome = origChrome
    globalThis.requestAnimationFrame = origRAF
  })

  // ==================== 1. 构造函数 ====================

  describe('constructor', () => {
    it('should initialize as closed', () => {
      assert.equal(chatMode.isOpen(), false)
    })

    it('should have default display mode as sidebar', () => {
      assert.equal(chatMode.getDisplayMode(), 'sidebar')
    })

    it('should accept custom options', () => {
      const cm = new ChatMode({
        defaultDisplayMode: 'floating',
        maxContextLength: 200,
        chatPromptPrefix: '你好：'
      })
      assert.equal(cm.getDisplayMode(), 'floating')
      assert.equal(cm._maxContextLength, 200)
      assert.equal(cm._chatPromptPrefix, '你好：')
      cm.destroy()
    })

    it('should have null pageContext initially', () => {
      assert.equal(chatMode.getPageContext(), null)
    })
  })

  // ==================== 2. open / close ====================

  describe('open', () => {
    it('should activate chat mode', async () => {
      await chatMode.open()
      assert.equal(chatMode.isOpen(), true)
    })

    it('should accept pageContext parameter', async () => {
      const ctx = { title: 'Test Page', url: 'https://example.com', summary: 'A test page' }
      await chatMode.open(ctx)
      assert.deepEqual(chatMode.getPageContext(), ctx)
    })

    it('should not re-open if already open', async () => {
      await chatMode.open({ title: 'First' })
      await chatMode.open({ title: 'Second' })
      // Context should remain from first open
      assert.equal(chatMode.getPageContext().title, 'First')
    })

    it('should register keydown listener on open', async () => {
      await chatMode.open()
      const doc = globalThis.document
      assert.ok(doc._listeners['keydown']?.length > 0, 'keydown listener should be registered')
    })

    it('should create floating panel when display mode is floating', async () => {
      chatMode = new ChatMode({ defaultDisplayMode: 'floating' })
      await chatMode.open()
      assert.ok(chatMode._floatingEl, 'floating panel should exist')
      assert.ok(chatMode._floatingEl.classList.contains('pw-chat-floating-panel'))
    })

    it('should not create floating panel when display mode is sidebar', async () => {
      await chatMode.open()
      assert.equal(chatMode._floatingEl, null, 'no floating panel in sidebar mode')
    })
  })

  describe('close', () => {
    it('should deactivate chat mode', async () => {
      await chatMode.open()
      chatMode.close()
      assert.equal(chatMode.isOpen(), false)
    })

    it('should be safe to call when not open', () => {
      chatMode.close()
      assert.equal(chatMode.isOpen(), false)
    })

    it('should remove floating panel on close', async () => {
      chatMode = new ChatMode({ defaultDisplayMode: 'floating' })
      await chatMode.open()
      assert.ok(chatMode._floatingEl)
      chatMode.close()
      assert.equal(chatMode._floatingEl, null)
    })
  })

  // ==================== 3. toggleDisplayMode ====================

  describe('toggleDisplayMode', () => {
    it('should switch from sidebar to floating', async () => {
      assert.equal(chatMode.getDisplayMode(), 'sidebar')
      const newMode = await chatMode.toggleDisplayMode()
      assert.equal(newMode, 'floating')
      assert.equal(chatMode.getDisplayMode(), 'floating')
    })

    it('should switch from floating to sidebar', async () => {
      chatMode = new ChatMode({ defaultDisplayMode: 'floating' })
      assert.equal(chatMode.getDisplayMode(), 'floating')
      const newMode = await chatMode.toggleDisplayMode()
      assert.equal(newMode, 'sidebar')
      assert.equal(chatMode.getDisplayMode(), 'sidebar')
    })

    it('should toggle back and forth', async () => {
      await chatMode.toggleDisplayMode()
      assert.equal(chatMode.getDisplayMode(), 'floating')
      await chatMode.toggleDisplayMode()
      assert.equal(chatMode.getDisplayMode(), 'sidebar')
      await chatMode.toggleDisplayMode()
      assert.equal(chatMode.getDisplayMode(), 'floating')
    })

    it('should save display mode to storage', async () => {
      const storage = new MockStorage()
      chatMode = new ChatMode({ storage })
      await chatMode.toggleDisplayMode()
      const saved = await storage.get('pw-chat-display-mode')
      assert.equal(saved['pw-chat-display-mode'], 'floating')
    })

    it('should create floating panel when toggling to floating while open', async () => {
      await chatMode.open()
      await chatMode.toggleDisplayMode()
      assert.ok(chatMode._floatingEl, 'floating panel should be created')
    })

    it('should remove floating panel when toggling to sidebar while open', async () => {
      chatMode = new ChatMode({ defaultDisplayMode: 'floating' })
      await chatMode.open()
      assert.ok(chatMode._floatingEl)
      await chatMode.toggleDisplayMode()
      assert.equal(chatMode._floatingEl, null)
    })
  })

  // ==================== 4. displayMode persistence ====================

  describe('display mode persistence', () => {
    it('should restore display mode from storage on open', async () => {
      const storage = new MockStorage()
      await storage.set({ 'pw-chat-display-mode': 'floating' })

      chatMode = new ChatMode({ storage })
      assert.equal(chatMode.getDisplayMode(), 'sidebar') // default before restore

      await chatMode.open()
      assert.equal(chatMode.getDisplayMode(), 'floating') // restored from storage
    })

    it('should keep default mode when storage is empty', async () => {
      const storage = new MockStorage()
      chatMode = new ChatMode({ storage })
      await chatMode.open()
      assert.equal(chatMode.getDisplayMode(), 'sidebar')
    })
  })

  // ==================== 5. buildContextPrompt ====================

  describe('buildContextPrompt', () => {
    it('should return empty string when no context', () => {
      assert.equal(chatMode.buildContextPrompt(), '')
    })

    it('should build prompt from page context', () => {
      chatMode.setPageContext({
        title: 'Test Page',
        url: 'https://example.com',
        summary: 'This is a test page about AI'
      })
      const prompt = chatMode.buildContextPrompt()
      assert.ok(prompt.includes('页面标题：Test Page'))
      assert.ok(prompt.includes('页面链接：https://example.com'))
      assert.ok(prompt.includes('页面摘要：This is a test page about AI'))
    })

    it('should truncate long summaries', () => {
      chatMode = new ChatMode({ maxContextLength: 20 })
      chatMode.setPageContext({
        title: 'Test',
        summary: 'A'.repeat(50)
      })
      const prompt = chatMode.buildContextPrompt()
      assert.ok(prompt.includes('...'))
      // The summary part should be truncated to 20 chars + '...'
      assert.ok(prompt.includes('A'.repeat(20) + '...'))
    })

    it('should prepend chatPromptPrefix when set', () => {
      chatMode = new ChatMode({ chatPromptPrefix: '请回答：' })
      chatMode.setPageContext({ title: 'My Page', url: '' })
      const prompt = chatMode.buildContextPrompt()
      assert.ok(prompt.startsWith('[页面上下文]'))
      assert.ok(prompt.endsWith('请回答：'))
    })

    it('should return only prefix when no context but prefix is set', () => {
      chatMode = new ChatMode({ chatPromptPrefix: '你好' })
      assert.equal(chatMode.buildContextPrompt(), '你好')
    })

    it('should handle partial context (title only)', () => {
      chatMode.setPageContext({ title: 'Only Title' })
      const prompt = chatMode.buildContextPrompt()
      assert.ok(prompt.includes('页面标题：Only Title'))
      assert.ok(!prompt.includes('页面链接'))
      assert.ok(!prompt.includes('页面摘要'))
    })
  })

  // ==================== 6. setPageContext / getPageContext ====================

  describe('setPageContext / getPageContext', () => {
    it('should set and get page context', () => {
      const ctx = { title: 'T', url: 'U', summary: 'S' }
      chatMode.setPageContext(ctx)
      assert.deepEqual(chatMode.getPageContext(), ctx)
    })

    it('should allow overwriting context', () => {
      chatMode.setPageContext({ title: 'Old' })
      chatMode.setPageContext({ title: 'New' })
      assert.equal(chatMode.getPageContext().title, 'New')
    })
  })

  // ==================== 7. keyboard shortcuts ====================

  describe('keyboard handling', () => {
    it('should open on Ctrl+K when closed', async () => {
      const doc = globalThis.document
      // Manually register the event and invoke
      chatMode._registerEvents()
      const keydownHandler = doc._listeners['keydown']?.find(
        l => l.fn === chatMode._boundKeyDown
      )?.fn
      assert.ok(keydownHandler, 'keydown handler should be registered')

      keydownHandler({
        key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false,
        preventDefault: () => {}
      })
      assert.equal(chatMode.isOpen(), true)
    })

    it('should close on Escape when open', async () => {
      await chatMode.open()
      const doc = globalThis.document
      const keydownHandler = doc._listeners['keydown']?.find(
        l => l.fn === chatMode._boundKeyDown
      )?.fn

      keydownHandler({
        key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
        preventDefault: () => {}
      })
      assert.equal(chatMode.isOpen(), false)
    })

    it('should not re-open on Ctrl+K when already open', async () => {
      await chatMode.open({ title: 'First' })
      const doc = globalThis.document
      const keydownHandler = doc._listeners['keydown']?.find(
        l => l.fn === chatMode._boundKeyDown
      )?.fn

      keydownHandler({
        key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false,
        preventDefault: () => {}
      })
      // Still open, context unchanged
      assert.equal(chatMode.isOpen(), true)
      assert.equal(chatMode.getPageContext().title, 'First')
    })

    it('should support Cmd+K for macOS', async () => {
      const doc = globalThis.document
      chatMode._registerEvents()
      const keydownHandler = doc._listeners['keydown']?.find(
        l => l.fn === chatMode._boundKeyDown
      )?.fn

      keydownHandler({
        key: 'k', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false,
        preventDefault: () => {}
      })
      assert.equal(chatMode.isOpen(), true)
    })

    it('should not trigger on Ctrl+Shift+K', async () => {
      chatMode._registerEvents()
      const doc = globalThis.document
      const keydownHandler = doc._listeners['keydown']?.find(
        l => l.fn === chatMode._boundKeyDown
      )?.fn

      keydownHandler({
        key: 'k', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false,
        preventDefault: () => {}
      })
      assert.equal(chatMode.isOpen(), false)
    })
  })

  // ==================== 8. chrome.runtime messages ====================

  describe('chrome.runtime messaging', () => {
    it('should send openChat message on open', async () => {
      let sent = null
      globalThis.chrome = { runtime: { sendMessage: (msg) => { sent = msg } } }

      await chatMode.open({ title: 'Page', url: 'https://page.com' })
      assert.ok(sent)
      assert.equal(sent.action, 'openChat')
      assert.equal(sent.displayMode, 'sidebar')
      assert.equal(sent.pageContext.title, 'Page')
    })

    it('should send closeChat message on close', async () => {
      let sent = null
      globalThis.chrome = { runtime: { sendMessage: (msg) => { sent = msg } } }

      await chatMode.open()
      chatMode.close()
      assert.ok(sent)
      assert.equal(sent.action, 'closeChat')
    })

    it('should handle chrome.runtime not available gracefully', async () => {
      globalThis.chrome = undefined
      // Should not throw
      await chatMode.open()
      chatMode.close()
      assert.equal(chatMode.isOpen(), false)
    })
  })

  // ==================== 9. floating panel ====================

  describe('floating panel', () => {
    it('should create panel with correct class name', async () => {
      chatMode = new ChatMode({ defaultDisplayMode: 'floating' })
      await chatMode.open()
      assert.ok(chatMode._floatingEl)
      assert.ok(chatMode._floatingEl.classList.contains('pw-chat-floating-panel'))
    })

    it('should set dialog role and aria-label', async () => {
      chatMode = new ChatMode({ defaultDisplayMode: 'floating' })
      await chatMode.open()
      const el = chatMode._floatingEl
      assert.equal(el.getAttribute('role'), 'dialog')
      assert.equal(el.getAttribute('aria-label'), 'Chat 模式')
    })

    it('should display page context in panel header area', async () => {
      chatMode = new ChatMode({ defaultDisplayMode: 'floating' })
      await chatMode.open({ title: 'My Article', url: 'https://a.com' })
      const preview = chatMode._floatingEl.childNodes.find(
        c => c.className === 'pw-chat-context-preview'
      )
      assert.ok(preview, 'context preview should exist')
      assert.ok(preview.textContent.includes('My Article'))
    })

    it('should add visible class via requestAnimationFrame', async () => {
      chatMode = new ChatMode({ defaultDisplayMode: 'floating' })
      await chatMode.open()
      assert.ok(chatMode._floatingEl.classList.contains('pw-chat-floating-panel--visible'))
    })
  })

  // ==================== 10. destroy ====================

  describe('destroy', () => {
    it('should clean up all resources', async () => {
      chatMode = new ChatMode({ defaultDisplayMode: 'floating' })
      await chatMode.open({ title: 'Test' })
      assert.ok(chatMode._floatingEl)

      chatMode.destroy()
      assert.equal(chatMode.isOpen(), false)
      assert.equal(chatMode._floatingEl, null)
      assert.equal(chatMode._pageContext, null)
    })

    it('should remove event listeners', async () => {
      await chatMode.open()
      const doc = globalThis.document
      assert.ok(doc._listeners['keydown']?.length > 0)

      chatMode.destroy()
      assert.equal(doc._listeners['keydown']?.filter(
        l => l.fn === chatMode._boundKeyDown
      ).length, 0)
    })
  })

  // ==================== 11. exports ====================

  describe('exports', () => {
    it('should export ChatMode as named export', async () => {
      const mod = await import('../lib/chat-mode.js')
      assert.ok(mod.ChatMode)
      assert.equal(typeof mod.ChatMode, 'function')
    })

    it('should export ChatMode as default export', async () => {
      const mod = await import('../lib/chat-mode.js')
      assert.ok(mod.default)
      assert.equal(mod.default, mod.ChatMode)
    })

    it('should export DISPLAY constants', async () => {
      const mod = await import('../lib/chat-mode.js')
      assert.equal(mod.DISPLAY_FLOATING, 'floating')
      assert.equal(mod.DISPLAY_SIDEBAR, 'sidebar')
    })

    it('should export STORAGE_KEY_DISPLAY_MODE', async () => {
      const mod = await import('../lib/chat-mode.js')
      assert.equal(mod.STORAGE_KEY_DISPLAY_MODE, 'pw-chat-display-mode')
    })
  })
})
