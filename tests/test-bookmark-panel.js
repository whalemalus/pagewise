import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { installChromeMock, resetChromeMock } from './helpers/setup.js'

installChromeMock()

const { BookmarkPanel } = await import('../options/bookmark-panel.js')

afterEach(() => { resetChromeMock() })

describe('BookmarkPanel', () => {
  it('should create instance', () => {
    const panel = new BookmarkPanel()
    assert.ok(panel)
  })

  it('should create with dependencies', () => {
    const mockCollector = { collect: async () => [] }
    const panel = new BookmarkPanel({ collector: mockCollector })
    assert.ok(panel)
  })

  it('should throw if no container on render', () => {
    const panel = new BookmarkPanel()
    assert.throws(() => panel.render(null), /container/i)
  })

  it('should have init method', () => {
    const panel = new BookmarkPanel()
    assert.equal(typeof panel.init, 'function')
  })

  it('should have destroy method', () => {
    const panel = new BookmarkPanel()
    assert.equal(typeof panel.destroy, 'function')
  })

  it('should have render method', () => {
    const panel = new BookmarkPanel()
    assert.equal(typeof panel.render, 'function')
  })
})
