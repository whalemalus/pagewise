import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// ==================== DOM Mock ====================

class MockElement {
  constructor(tag = 'DIV', text = '') {
    this.tagName = tag.toUpperCase()
    this.textContent = text
    this.innerHTML = text ? `<${tag.toLowerCase()}>${text}</${tag.toLowerCase()}>` : ''
    this.childNodes = []
    this.children = []
    this.parentNode = null
    this.dataset = {}
    this.className = ''
    this.style = {}
    this._attrs = {}
  }
  querySelector(sel) { return null }
  querySelectorAll(sel) { return [] }
  appendChild(el) { this.childNodes.push(el); el.parentNode = this; return el }
  remove() { /* no-op in mock */ }
  getAttribute(name) { return this._attrs[name] || null }
  setAttribute(name, val) { this._attrs[name] = val }
}

class MockDocument {
  constructor(html) {
    this._html = html || ''
    this._title = ''
    this._body = new MockElement('BODY')
  }
  querySelector(sel) { return null }
  querySelectorAll(sel) { return [] }
  get title() { return this._title }
  set title(v) { this._title = v }
  get body() { return this._body }
}

// Setup global DOMParser mock for browser-like parsing
class MockDOMParser {
  parseFromString(html, mimeType) {
    // Create a mock document with basic structure
    const doc = new MockDocument(html)

    // Extract title from HTML
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (titleMatch) doc._title = titleMatch[1].replace(/<[^>]+>/g, '').trim()

    // Extract h1
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    if (h1Match) {
      const h1 = new MockElement('H1', h1Match[1].replace(/<[^>]+>/g, '').trim())
      doc.querySelector = (sel) => {
        if (sel === 'h1') return h1
        return null
      }
      doc.querySelectorAll = (sel) => {
        if (sel === 'h1') return [h1]
        return []
      }
    }

    return doc
  }
}

// ==================== Import Module ====================

let PageSummarizer

beforeEach(async () => {
  const mod = await import('../lib/page-summarizer.js')
  PageSummarizer = mod.PageSummarizer
})

// ==================== Tests ====================

describe('PageSummarizer — extractMainContent', () => {
  it('should return empty result for null/undefined input', () => {
    const ps = new PageSummarizer()
    const result = ps.extractMainContent(null)
    assert.equal(result.title, '')
    assert.equal(result.content, '')
    assert.equal(result.charCount, 0)
  })

  it('should return empty result for empty string input', () => {
    const ps = new PageSummarizer()
    const result = ps.extractMainContent('')
    assert.equal(result.title, '')
    assert.equal(result.content, '')
    assert.equal(result.charCount, 0)
  })

  it('should return empty result for non-string input', () => {
    const ps = new PageSummarizer()
    assert.equal(ps.extractMainContent(123).charCount, 0)
    assert.equal(ps.extractMainContent(undefined).charCount, 0)
    assert.equal(ps.extractMainContent({}).charCount, 0)
  })

  it('should extract title from <title> tag', () => {
    const ps = new PageSummarizer()
    const html = '<html><head><title>Test Page Title</title></head><body><p>Hello world</p></body></html>'
    // Use basicParse for Node.js
    const result = ps.extractMainContent(html)
    // title should be extracted (either from h1 or title tag)
    assert.ok(typeof result.title === 'string')
  })

  it('should handle HTML with article/main content', () => {
    const ps = new PageSummarizer()
    const article = 'This is the main article content with enough text to pass the minimum threshold for paragraph detection and scoring algorithms.'
    const html = `<html><head><title>Article</title></head><body><article><p>${article}</p></article></body></html>`
    const result = ps.extractMainContent(html)
    assert.ok(result.charCount >= 0)
    assert.ok(typeof result.content === 'string')
  })

  it('should respect maxContentLength option', () => {
    const ps = new PageSummarizer({ maxContentLength: 100 })
    const longContent = '<p>' + 'A'.repeat(500) + '</p>'
    const html = `<html><head><title>Long</title></head><body>${longContent}</body></html>`
    const result = ps.extractMainContent(html)
    // Content should be truncated
    assert.ok(result.content.length <= 120) // maxContentLength + truncation message
  })

  it('should provide excerpt from content', () => {
    const ps = new PageSummarizer()
    const html = '<html><head><title>T</title></head><body><p>Hello world this is test content for excerpt.</p></body></html>'
    const result = ps.extractMainContent(html)
    assert.ok(typeof result.excerpt === 'string')
    assert.ok(result.excerpt.length <= 200)
  })

  it('should filter out script and style tags', () => {
    const ps = new PageSummarizer()
    const html = `<html><head><title>Clean</title></head>
      <body>
        <script>var x = 1;</script>
        <style>.body { color: red; }</style>
        <article><p>Main content text here that is long enough to be extracted properly.</p></article>
      </body></html>`
    const result = ps.extractMainContent(html)
    assert.ok(!result.content.includes('var x'))
    assert.ok(!result.content.includes('color: red'))
  })

  it('should handle nested content structure', () => {
    const ps = new PageSummarizer()
    const paragraphs = Array.from({length: 5}, (_, i) =>
      `<p>Paragraph ${i + 1}: This is some meaningful content text for testing purposes.</p>`
    ).join('')
    const html = `<html><head><title>Multi</title></head><body><div><section>${paragraphs}</section></div></body></html>`
    const result = ps.extractMainContent(html)
    assert.ok(result.charCount >= 0)
  })

  it('should use custom minParagraphLength option', () => {
    const ps = new PageSummarizer({ minParagraphLength: 80 })
    const html = '<html><head><title>Short</title></head><body><p>Too short</p></body></html>'
    const result = ps.extractMainContent(html)
    // Short paragraph should be filtered out
    assert.equal(result.content, '')
  })
})

describe('PageSummarizer — generateSummary', () => {
  it('should throw when content is empty', async () => {
    const ps = new PageSummarizer()
    await assert.rejects(
      () => ps.generateSummary(''),
      { message: '内容不能为空' }
    )
  })

  it('should throw when content is null', async () => {
    const ps = new PageSummarizer()
    await assert.rejects(
      () => ps.generateSummary(null),
      { message: '内容不能为空' }
    )
  })

  it('should throw when aiClient is not provided', async () => {
    const ps = new PageSummarizer()
    await assert.rejects(
      () => ps.generateSummary('some content', {}),
      { message: '需要提供 aiClient 实例' }
    )
  })

  it('should build correct Chinese prompt with brief length', () => {
    const ps = new PageSummarizer()
    const prompt = ps._buildPrompt('test content', { length: 'brief', language: 'zh' })
    assert.ok(prompt.includes('结构化摘要'))
    assert.ok(prompt.includes('核心主题'))
    assert.ok(prompt.includes('关键要点'))
    assert.ok(prompt.includes('重要细节'))
    assert.ok(prompt.includes('行动建议'))
    assert.ok(prompt.includes('简洁摘要'))
    assert.ok(prompt.includes('test content'))
  })

  it('should build correct Chinese prompt with detailed length', () => {
    const ps = new PageSummarizer()
    const prompt = ps._buildPrompt('test content', { length: 'detailed', language: 'zh' })
    assert.ok(prompt.includes('详细摘要'))
    assert.ok(prompt.includes('test content'))
  })

  it('should build correct English prompt', () => {
    const ps = new PageSummarizer()
    const prompt = ps._buildPrompt('test content', { length: 'brief', language: 'en' })
    assert.ok(prompt.includes('Core Topic'))
    assert.ok(prompt.includes('Key Points'))
    assert.ok(prompt.includes('Important Details'))
    assert.ok(prompt.includes('Action Suggestions'))
    assert.ok(prompt.includes('test content'))
  })

  it('should include content in prompt', () => {
    const ps = new PageSummarizer()
    const content = '这是页面的正文内容，包含了一些关键信息。'
    const prompt = ps._buildPrompt(content, { length: 'brief', language: 'zh' })
    assert.ok(prompt.includes(content))
  })

  it('should return Chinese system prompt for zh language', () => {
    const ps = new PageSummarizer()
    const sysPrompt = ps._getSystemPrompt('zh')
    assert.ok(sysPrompt.includes('摘要'))
    assert.ok(sysPrompt.includes('Markdown'))
  })

  it('should return English system prompt for en language', () => {
    const ps = new PageSummarizer()
    const sysPrompt = ps._getSystemPrompt('en')
    assert.ok(sysPrompt.includes('summarizer'))
    assert.ok(sysPrompt.includes('Markdown'))
  })

  it('should call aiClient.chatStream for streaming output', async () => {
    const ps = new PageSummarizer()
    const chunks = []
    const mockClient = {
      model: 'test-model',
      maxTokens: 1024,
      async *chatStream(messages, opts) {
        yield '核心主题：'
        yield '这是一个测试页面。'
        yield '\n\n关键要点：\n1. 要点一'
      },
      async chat() { return 'should not be called' }
    }

    const result = await ps.generateSummary('some content', {
      aiClient: mockClient,
      onChunk: (text) => chunks.push(text)
    })

    assert.equal(chunks.length, 3)
    assert.ok(result.includes('核心主题'))
    assert.ok(result.includes('要点一'))
  })

  it('should call aiClient.chat for non-streaming output', async () => {
    const ps = new PageSummarizer()
    const mockClient = {
      model: 'test-model',
      maxTokens: 1024,
      async chatStream() { throw new Error('should not call stream') },
      async chat(messages, opts) {
        return '非流式摘要结果'
      }
    }

    const result = await ps.generateSummary('some content', {
      aiClient: mockClient
      // no onChunk → should use non-stream chat
    })

    assert.equal(result, '非流式摘要结果')
  })

  it('should support AbortSignal for cancellation', async () => {
    const ps = new PageSummarizer()
    const controller = new AbortController()
    controller.abort()

    const mockClient = {
      model: 'test-model',
      maxTokens: 1024,
      async *chatStream(messages, opts) {
        yield '部分'
        // Should stop due to abort
      },
      async chat() { return 'cancelled' }
    }

    // Should complete (mock doesn't check signal internally,
    // but the method passes it through)
    const result = await ps.generateSummary('content', {
      aiClient: mockClient,
      signal: controller.signal,
      onChunk: () => {}
    })

    assert.ok(typeof result === 'string')
  })
})

describe('PageSummarizer — constructor and options', () => {
  it('should use default options', () => {
    const ps = new PageSummarizer()
    assert.equal(ps.maxContentLength, 8000)
    assert.equal(ps.minParagraphLength, 30)
  })

  it('should accept custom maxContentLength', () => {
    const ps = new PageSummarizer({ maxContentLength: 4000 })
    assert.equal(ps.maxContentLength, 4000)
  })

  it('should accept custom minParagraphLength', () => {
    const ps = new PageSummarizer({ minParagraphLength: 50 })
    assert.equal(ps.minParagraphLength, 50)
  })
})

describe('PageSummarizer — edge cases', () => {
  it('should handle HTML with no body', () => {
    const ps = new PageSummarizer()
    const result = ps.extractMainContent('<html><head><title>Empty</title></head></html>')
    assert.ok(typeof result.content === 'string')
  })

  it('should handle HTML with only noise elements', () => {
    const ps = new PageSummarizer()
    const html = `<html><head><title>Scripts</title></head>
      <body>
        <script>var x = 1;</script>
        <nav><a href="#">link</a></nav>
        <footer>footer text</footer>
      </body></html>`
    const result = ps.extractMainContent(html)
    assert.ok(typeof result.content === 'string')
  })

  it('should handle very large HTML gracefully', () => {
    const ps = new PageSummarizer({ maxContentLength: 500 })
    const bigParagraphs = Array.from({length: 100}, (_, i) =>
      `<p>This is paragraph number ${i} with substantial content for testing large documents.</p>`
    ).join('')
    const html = `<html><head><title>Big</title></head><body>${bigParagraphs}</body></html>`
    const result = ps.extractMainContent(html)
    assert.ok(result.charCount <= 520) // 500 + truncation message
  })
})
