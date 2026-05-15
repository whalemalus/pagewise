import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { SelectionDetector, TYPE_RULES } from '../lib/selection-detector.js'
import { SelectionHandler } from '../lib/selection-handler.js'

// ==================== SelectionDetector Tests ====================

describe('SelectionDetector', () => {
  let detector

  beforeEach(() => {
    detector = new SelectionDetector()
  })

  // --- 基础行为 ---

  it('should return unknown for empty text', () => {
    const result = detector.detectType('')
    assert.equal(result.type, 'unknown')
    assert.equal(result.confidence, 0)
  })

  it('should return unknown for null/undefined input', () => {
    assert.equal(detector.detectType(null).type, 'unknown')
    assert.equal(detector.detectType(undefined).type, 'unknown')
  })

  it('should return unknown for whitespace-only text', () => {
    assert.equal(detector.detectType('   ').type, 'unknown')
  })

  // --- URL 检测 ---

  it('should detect http:// URLs', () => {
    const result = detector.detectType('http://example.com/path?q=1')
    assert.equal(result.type, 'url')
    assert.ok(result.confidence >= 0.9)
  })

  it('should detect https:// URLs', () => {
    const result = detector.detectType('https://github.com/user/repo')
    assert.equal(result.type, 'url')
    assert.ok(result.confidence >= 0.9)
  })

  it('should detect www. URLs', () => {
    const result = detector.detectType('www.google.com')
    assert.equal(result.type, 'url')
    assert.ok(result.confidence >= 0.9)
  })

  // --- 错误检测 ---

  it('should detect TypeError messages', () => {
    const result = detector.detectType('TypeError: Cannot read property "foo" of undefined')
    assert.equal(result.type, 'error')
    assert.ok(result.confidence >= 0.8)
  })

  it('should detect stack trace patterns', () => {
    const result = detector.detectType('    at Object.<anonymous> (/app/index.js:10:5)')
    assert.equal(result.type, 'error')
    assert.ok(result.confidence >= 0.8)
  })

  it('should detect Python traceback', () => {
    const result = detector.detectType('Traceback (most recent call last):\n  File "app.py", line 10\n    foo()\nZeroDivisionError: division by zero')
    assert.equal(result.type, 'error')
    assert.ok(result.confidence >= 0.8)
  })

  it('should detect ECONNREFUSED error', () => {
    const result = detector.detectType('Error: connect ECONNREFUSED 127.0.0.1:3000')
    assert.equal(result.type, 'error')
  })

  // --- 代码检测 ---

  it('should detect JavaScript code (function declaration)', () => {
    const code = 'function hello(name) {\n  console.log("Hello " + name);\n}'
    const result = detector.detectType(code)
    assert.equal(result.type, 'code')
    assert.ok(result.confidence >= 0.8)
  })

  it('should detect JavaScript code (const/arrow)', () => {
    const code = 'const add = (a, b) => a + b;'
    const result = detector.detectType(code)
    assert.equal(result.type, 'code')
  })

  it('should detect Python code (def/class)', () => {
    const code = 'def greet(name):\n    return f"Hello, {name}"'
    const result = detector.detectType(code)
    assert.equal(result.type, 'code')
  })

  it('should detect SQL code', () => {
    const code = 'SELECT id, name FROM users WHERE active = 1 ORDER BY created_at DESC'
    const result = detector.detectType(code)
    assert.equal(result.type, 'code')
    assert.equal(result.language, 'sql')
  })

  it('should detect import/export patterns', () => {
    const code = 'import React from "react";\nexport default function App() {}'
    const result = detector.detectType(code)
    assert.equal(result.type, 'code')
    assert.equal(result.language, 'javascript')
  })

  // --- 数学检测 ---

  it('should detect simple arithmetic', () => {
    const result = detector.detectType('2 + 3 * 4')
    assert.equal(result.type, 'math')
  })

  it('should detect math with functions', () => {
    const result = detector.detectType('sqrt(16) + pow(2, 3)')
    assert.equal(result.type, 'math')
  })

  it('should detect math symbols', () => {
    const result = detector.detectType('∫ x² dx = x³/3 + C')
    assert.equal(result.type, 'math')
  })

  // --- 英文检测 ---

  it('should detect English sentences (20+ chars)', () => {
    const result = detector.detectType('The quick brown fox jumps over the lazy dog')
    assert.equal(result.type, 'english')
    assert.ok(result.confidence >= 0.6)
  })

  it('should not classify short English as english type', () => {
    // Short text that's not URL/error/code/math goes to unknown
    const result = detector.detectType('Hello')
    assert.equal(result.type, 'unknown')
  })

  // --- 批量检测 ---

  it('should support batch detection', () => {
    const texts = [
      'https://example.com',
      'function foo() { return 1; }',
      'Some plain text that is definitely long enough to trigger detection',
    ]
    const results = detector.detectBatch(texts)
    assert.equal(results.length, 3)
    assert.equal(results[0].type, 'url')
    assert.equal(results[1].type, 'code')
    assert.equal(results[2].type, 'english')
  })

  // --- getSupportedTypes ---

  it('should return all supported types', () => {
    const types = detector.getSupportedTypes()
    assert.ok(types.includes('code'))
    assert.ok(types.includes('url'))
    assert.ok(types.includes('error'))
    assert.ok(types.includes('math'))
    assert.ok(types.includes('english'))
    assert.ok(types.includes('unknown'))
  })

  // --- TYPE_RULES ---

  it('should have TYPE_RULES exported with url/error/code/math/english rules', () => {
    assert.ok(Array.isArray(TYPE_RULES))
    const ruleTypes = TYPE_RULES.map(r => r.type)
    assert.ok(ruleTypes.includes('url'))
    assert.ok(ruleTypes.includes('error'))
    assert.ok(ruleTypes.includes('code'))
    assert.ok(ruleTypes.includes('math'))
    assert.ok(ruleTypes.includes('english'))
  })
})

// ==================== SelectionHandler Tests ====================

describe('SelectionHandler', () => {
  let handler
  let emitted

  beforeEach(() => {
    emitted = []
    handler = new SelectionHandler({
      onAction: (action, payload) => emitted.push({ action, payload }),
    })
  })

  it('should explain code and detect JavaScript language', () => {
    const result = handler.explainCode('const x = 42;')
    assert.equal(result.type, 'code')
    assert.equal(result.action, 'explainCode')
    assert.equal(result.payload.language, 'javascript')
    assert.ok(result.payload.prompt.includes('javascript'))
  })

  it('should preview URL and extract domain', () => {
    const result = handler.previewURL('https://github.com/user/repo')
    assert.equal(result.type, 'url')
    assert.equal(result.action, 'previewURL')
    assert.equal(result.payload.domain, 'github.com')
    assert.equal(result.payload.url, 'https://github.com/user/repo')
  })

  it('should normalize www. URLs', () => {
    const result = handler.previewURL('www.example.com')
    assert.equal(result.payload.url, 'https://www.example.com')
  })

  it('should search error and extract error type', () => {
    const result = handler.searchError('TypeError: x is not a function')
    assert.equal(result.type, 'error')
    assert.equal(result.action, 'searchError')
    assert.equal(result.payload.errorType, 'TypeError')
  })

  it('should calculate simple math expressions', () => {
    const result = handler.calculateMath('2 + 3 * 4')
    assert.equal(result.type, 'math')
    assert.equal(result.action, 'calculateMath')
    assert.equal(result.payload.result, 14)
  })

  it('should handle math with power operator', () => {
    const result = handler.calculateMath('2 ^ 8')
    assert.equal(result.payload.result, 256)
  })

  it('should translate english and count words', () => {
    const result = handler.translateEnglish('Hello world, this is a test sentence')
    assert.equal(result.type, 'english')
    assert.equal(result.action, 'translateEnglish')
    assert.ok(result.payload.wordCount > 0)
    assert.equal(result.payload.targetLang, 'zh-CN')
  })

  it('should handle unknown types with general query', () => {
    const result = handler.handleSelection('some random text', 'unknown')
    assert.equal(result.action, 'generalQuery')
    assert.equal(result.type, 'unknown')
  })

  it('should handle empty text gracefully', () => {
    const result = handler.handleSelection('', 'code')
    assert.equal(result.action, 'noop')
  })

  it('should emit onAction callbacks', () => {
    handler.explainCode('let x = 1;')
    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].action, 'explainCode')
  })
})

// ==================== SelectionToolbar Integration Tests ====================

// DOM mocks
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

describe('SelectionToolbar + SelectionEnhancement Integration', () => {
  let toolbar
  let origDoc, origWin
  let sentMessages

  beforeEach(async () => {
    origDoc = globalThis.document
    origWin = globalThis.window

    const mockDoc = {
      _listeners: {},
      _body: new MockElement(),
      addEventListener(ev, fn, opts) { (this._listeners[ev] ||= []).push({ fn, opts }) },
      removeEventListener(ev, fn) { const arr = this._listeners[ev]; if (arr) { this._listeners[ev] = arr.filter(l => l.fn !== fn) } },
      createElement() { return new MockElement() },
      get body() { return this._body },
    }
    const mockWin = { innerWidth: 1200, innerHeight: 800, getSelection() { return null } }
    globalThis.document = mockDoc
    globalThis.window = mockWin
    sentMessages = []
    globalThis.chrome = { runtime: { sendMessage: (msg) => sentMessages.push(msg) } }

    const mod = await import('../lib/selection-toolbar.js')
    toolbar = new mod.SelectionToolbar({ delay: 0 })
  })

  afterEach(() => {
    toolbar?.destroy()
    globalThis.document = origDoc
    globalThis.window = origWin
    delete globalThis.chrome
  })

  it('should have detector and handler injected', () => {
    assert.ok(toolbar.detector)
    assert.ok(toolbar.handler)
  })

  it('should show type-specific button for code selection', () => {
    const code = 'function foo() {\n  console.log("bar");\n}'
    const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
    toolbar.showToolbar(code, rect, { type: 'code', confidence: 0.9 })
    assert.equal(toolbar.currentType, 'code')
    // First button should be "解释代码"
    assert.equal(toolbar._actions[0].id, 'explainCode')
  })

  it('should show type-specific button for URL selection', () => {
    const url = 'https://example.com'
    const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
    toolbar.showToolbar(url, rect, { type: 'url', confidence: 0.95 })
    assert.equal(toolbar.currentType, 'url')
    assert.equal(toolbar._actions[0].id, 'previewURL')
  })

  it('should show type-specific button for error selection', () => {
    const error = 'TypeError: Cannot read property "foo" of undefined'
    const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
    toolbar.showToolbar(error, rect, { type: 'error', confidence: 0.9 })
    assert.equal(toolbar.currentType, 'error')
    assert.equal(toolbar._actions[0].id, 'searchError')
  })

  it('should fall back to base actions for unknown type', () => {
    const text = 'just some random text'
    const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
    toolbar.showToolbar(text, rect, { type: 'unknown', confidence: 0 })
    assert.equal(toolbar.currentType, 'unknown')
    assert.equal(toolbar._actions.length, 4) // only base actions
    assert.equal(toolbar._actions[0].id, 'explain')
  })

  it('should reset type on hideToolbar', () => {
    const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
    toolbar.showToolbar('function f(){}', rect, { type: 'code', confidence: 0.9 })
    assert.equal(toolbar.currentType, 'code')
    toolbar.hideToolbar()
    assert.equal(toolbar.currentType, null)
    assert.equal(toolbar.currentMeta, null)
  })

  it('should include type in sent message', () => {
    const rect = { top: 200, left: 400, width: 100, height: 20, bottom: 220, right: 500 }
    toolbar.showToolbar('https://example.com', rect, { type: 'url', confidence: 0.95 })
    toolbar.triggerAction('previewURL')
    assert.equal(sentMessages.length, 1)
    assert.equal(sentMessages[0].type, 'url')
    assert.equal(sentMessages[0].action, 'selectionPreviewURL')
  })
})
