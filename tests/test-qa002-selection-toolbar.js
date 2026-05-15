/**
 * QA002-R3 — SelectionToolbar 功能正确性测试（第三轮）
 *
 * 覆盖重点：智能类型操作、位置边界算法、动作触发与消息发送、destroy 生命周期
 */

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
    this._listeners = {}
  }
  appendChild(el) { this.childNodes.push(el); el.parentNode = this; return el }
  removeChild(el) { const i = this.childNodes.indexOf(el); if (i >= 0) this.childNodes.splice(i, 1); el.parentNode = null; return el }
  contains(target) {
    if (this === target) return true
    return this.childNodes.some(c => c.contains?.(target))
  }
  getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 200 } }
  get offsetHeight() { return 36 }
  get offsetWidth() { return 240 }
  addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn) }
  removeEventListener(ev, fn) {
    const arr = this._listeners[ev]
    if (arr) this._listeners[ev] = arr.filter(f => f !== fn)
  }
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
  removeEventListener(ev, fn) {
    const arr = this._listeners[ev]
    if (arr) this._listeners[ev] = arr.filter(l => l.fn !== fn)
  }
  createElement(_tag) { return new MockElement() }
  get body() { return this._body }
}

class MockWindow {
  constructor() {
    this.innerWidth = 1200
    this.innerHeight = 800
  }
  getSelection() { return this._sel || null }
}

// ==================== Mock Detector & Handler ====================

class MockDetector {
  constructor(typeMap = {}) {
    this._typeMap = typeMap
  }
  detectType(text) {
    for (const [pattern, result] of Object.entries(this._typeMap)) {
      if (text.includes(pattern)) return result
    }
    return { type: 'unknown', confidence: 0 }
  }
}

class MockHandler {
  constructor() {
    this.calls = []
  }
  handleSelection(text, type, meta) {
    this.calls.push({ text, type, meta })
    return { action: `handle-${type}`, type, payload: {} }
  }
}

// ==================== Tests ====================

describe('QA002-R3 SelectionToolbar', () => {
  let toolbar
  let origDoc, origWin, origChrome

  beforeEach(async () => {
    origDoc = globalThis.document
    origWin = globalThis.window
    origChrome = globalThis.chrome

    const mockDoc = new MockDocument()
    const mockWin = new MockWindow()
    globalThis.document = mockDoc
    globalThis.window = mockWin
    globalThis.chrome = { runtime: { sendMessage: () => {} } }
  })

  afterEach(() => {
    toolbar?.destroy()
    globalThis.document = origDoc
    globalThis.window = origWin
    globalThis.chrome = origChrome
  })

  async function createToolbar(options = {}) {
    const mod = await import('../lib/selection-toolbar.js')
    toolbar = new mod.SelectionToolbar({ delay: 0, ...options })
    return toolbar
  }

  // ==================== 智能类型操作 ====================

  describe('智能类型操作', () => {
    it('检测到 code 类型时应包含 explainCode 按钮', async () => {
      const detector = new MockDetector({ 'fn': { type: 'code', confidence: 0.9 } })
      await createToolbar({ detector })
      const rect = { top: 200, left: 400, width: 150, height: 20, bottom: 220, right: 550 }
      toolbar.showToolbar('function foo() {}', rect, { type: 'code', confidence: 0.9 })

      const ids = toolbar._actions.map(a => a.id)
      assert.ok(ids.includes('explainCode'), `actions 应包含 explainCode，实际: ${ids}`)
      assert.ok(ids.includes('explain'), '应保留基础操作')
    });

    it('检测到 url 类型时应包含 previewURL 按钮', async () => {
      await createToolbar()
      const rect = { top: 200, left: 400, width: 150, height: 20, bottom: 220, right: 550 }
      toolbar.showToolbar('https://example.com', rect, { type: 'url', confidence: 0.95 })

      const ids = toolbar._actions.map(a => a.id)
      assert.ok(ids.includes('previewURL'), `actions 应包含 previewURL，实际: ${ids}`)
    });

    it('检测到 error 类型时应包含 searchError 按钮', async () => {
      await createToolbar()
      const rect = { top: 200, left: 400, width: 150, height: 20, bottom: 220, right: 550 }
      toolbar.showToolbar('TypeError: undefined is not a function', rect, { type: 'error', confidence: 0.9 })

      const ids = toolbar._actions.map(a => a.id)
      assert.ok(ids.includes('searchError'), `actions 应包含 searchError，实际: ${ids}`)
    });

    it('无类型检测结果时应仅显示基础操作', async () => {
      await createToolbar()
      const rect = { top: 200, left: 400, width: 150, height: 20, bottom: 220, right: 550 }
      toolbar.showToolbar('hello world', rect)

      assert.equal(toolbar._actions.length, 4)
      const ids = toolbar._actions.map(a => a.id)
      assert.deepEqual(ids, ['explain', 'translate', 'summarize', 'askAI'])
    });

    it('从 code 切换到 unknown 应移除类型按钮', async () => {
      await createToolbar()
      const rect = { top: 200, left: 400, width: 150, height: 20, bottom: 220, right: 550 }
      // 先显示 code
      toolbar.showToolbar('const x = 1', rect, { type: 'code', confidence: 0.9 })
      assert.ok(toolbar._actions.some(a => a.id === 'explainCode'))

      // 切换到 unknown
      toolbar.showToolbar('hello', rect, { type: 'unknown', confidence: 0 })
      assert.equal(toolbar._actions.length, 4)
      assert.ok(!toolbar._actions.some(a => a.id === 'explainCode'))
    });
  });

  // ==================== 位置计算 ====================

  describe('位置计算', () => {
    it('选区在视口中央时工具栏应位于选区上方', async () => {
      await createToolbar({ offsetY: 15 })
      const rect = { top: 400, left: 300, width: 200, height: 20, bottom: 420, right: 500 }
      toolbar.showToolbar('test text', rect)

      const el = toolbar._toolbarEl
      const top = parseInt(el.style.top)
      // 应该在 rect.top 上方
      assert.ok(top < 400, `top=${top} 应在选区 400 上方`)
    });

    it('选区在顶部时工具栏应翻转到下方', async () => {
      await createToolbar({ offsetY: 10 })
      const rect = { top: 2, left: 300, width: 200, height: 20, bottom: 22, right: 500 }
      toolbar.showToolbar('top text', rect)

      const el = toolbar._toolbarEl
      const top = parseInt(el.style.top)
      // 应在 rect.bottom 以下
      assert.ok(top >= rect.bottom, `top=${top} 应 >= rect.bottom(${rect.bottom})`)
    });

    it('选区在右侧时工具栏应约束到视口内', async () => {
      globalThis.window.innerWidth = 600
      await createToolbar({ edgeMargin: 8 })
      const rect = { top: 400, left: 500, width: 100, height: 20, bottom: 420, right: 600 }
      toolbar.showToolbar('right text', rect)

      const el = toolbar._toolbarEl
      const left = parseInt(el.style.left)
      assert.ok(left + el.offsetWidth <= 600 - 8,
        `工具栏右缘 ${left + el.offsetWidth} 应 <= ${600 - 8}`)
    });

    it('选区在左侧时工具栏不应超出左边界', async () => {
      await createToolbar({ edgeMargin: 8 })
      const rect = { top: 400, left: -100, width: 50, height: 20, bottom: 420, right: -50 }
      toolbar.showToolbar('left text', rect)

      const el = toolbar._toolbarEl
      const left = parseInt(el.style.left)
      assert.ok(left >= 8, `left=${left} 应 >= 8`)
    });
  });

  // ==================== 动作触发 ====================

  describe('动作触发', () => {
    it('triggerAction 应发送 chrome.runtime.sendMessage', async () => {
      let sentMessage = null
      globalThis.chrome = { runtime: { sendMessage: (msg) => { sentMessage = msg } } }

      await createToolbar()
      const rect = { top: 200, left: 400, width: 150, height: 20, bottom: 220, right: 550 }
      toolbar.showToolbar('selected text', rect)

      toolbar.triggerAction('explain')
      assert.ok(sentMessage)
      assert.equal(sentMessage.action, 'selectionExplain')
      assert.equal(sentMessage.selection, 'selected text')
      assert.equal(sentMessage.source, 'selectionToolbar')
      assert.ok(sentMessage.timestamp > 0)
    });

    it('triggerAction 不存在的 actionId 应静默忽略', async () => {
      let sent = false
      globalThis.chrome = { runtime: { sendMessage: () => { sent = true } } }

      await createToolbar()
      toolbar.triggerAction('nonexistent')
      assert.equal(sent, false)
    });

    it('triggerAction 无选中文本时应静默忽略', async () => {
      let sent = false
      globalThis.chrome = { runtime: { sendMessage: () => { sent = true } } }

      await createToolbar()
      // 未 showToolbar，currentText 为空
      toolbar.triggerAction('explain')
      assert.equal(sent, false)
    });

    it('triggerAction 后应自动隐藏工具栏', async () => {
      await createToolbar()
      const rect = { top: 200, left: 400, width: 150, height: 20, bottom: 220, right: 550 }
      toolbar.showToolbar('text', rect)
      assert.equal(toolbar.visible, true)

      toolbar.triggerAction('translate')
      assert.equal(toolbar.visible, false)
    });
  });

  // ==================== destroy 生命周期 ====================

  describe('destroy 生命周期', () => {
    it('destroy 后 toolbar 应完全清理', async () => {
      await createToolbar()
      const rect = { top: 200, left: 400, width: 150, height: 20, bottom: 220, right: 550 }
      toolbar.showToolbar('test', rect)
      assert.ok(toolbar._toolbarEl)

      toolbar.destroy()
      assert.equal(toolbar._toolbarEl, null)
      assert.equal(toolbar.visible, false)
    });

    it('destroy 后重新 listenForSelection 应正常', async () => {
      await createToolbar()
      toolbar.listenForSelection()
      toolbar.destroy()

      // 重新监听
      toolbar.listenForSelection()
      const doc = globalThis.document
      assert.ok(doc._listeners['mouseup']?.length > 0)
    });
  });
});
