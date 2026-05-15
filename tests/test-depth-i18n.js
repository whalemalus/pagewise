/**
 * test-depth-i18n.js — i18n 深度测试
 *
 * 测试范围:
 *   registerLocale / getSupportedLocales  — 语言包注册
 *   setLocale / getCurrentLocale          — 语言切换
 *   setFallbackLocale / getFallbackLocale — 回退语言管理
 *   t()                                   — 翻译函数、参数插值、回退机制
 *   hasTranslation                        — key 存在性检查
 *   onLocaleChange                        — 语言切换监听
 *   initI18n                              — 初始化流程
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const i18n = await import('../lib/i18n.js')

// ── 每个测试前重置状态 ──────────────────────────────────────────────────────

beforeEach(() => {
  i18n.setLocale('zh-CN')
  i18n.setFallbackLocale('en-US')
  // 注册内建语言包
  i18n.registerLocale('zh-CN', {
    'app.name': '智阅',
    'tab.chat': '问答',
    'tab.settings': '设置',
    'welcome.greeting': '你好，{{name}}！',
    'app.nested.key': '嵌套扁平键',
  })
  i18n.registerLocale('en-US', {
    'app.name': 'PageWise',
    'tab.chat': 'Chat',
    'tab.settings': 'Settings',
    'welcome.greeting': 'Hello, {{name}}!',
    'only.en': 'English only',
  })
})

// ── 语言包注册与管理 ────────────────────────────────────────────────────────

describe('i18n — 语言包注册', () => {

  it('1. registerLocale 注册语言包后可通过 getSupportedLocales 查询', () => {
    i18n.registerLocale('ja-JP', { 'app.name': 'ページワイズ' })
    const locales = i18n.getSupportedLocales()
    assert.ok(locales.includes('ja-JP'))
  })

  it('2. registerLocale 覆盖已有语言包', () => {
    i18n.registerLocale('zh-CN', { 'custom.key': '自定义' })
    assert.equal(i18n.t('custom.key'), '自定义')
    // 之前内建的 key 丢失后会回退到 fallback（en-US → 'PageWise'）
    assert.equal(i18n.t('app.name'), 'PageWise')
  })

  it('3. getAllMessages 返回当前语言的消息对象副本', () => {
    const msgs = i18n.getAllMessages()
    assert.equal(msgs['app.name'], '智阅')
    // 修改副本不影响原语言包
    msgs['app.name'] = 'CHANGED'
    assert.equal(i18n.t('app.name'), '智阅')
  })
})

// ── 语言切换 ────────────────────────────────────────────────────────────────

describe('i18n — 语言切换', () => {

  it('4. setLocale 切换当前语言', () => {
    i18n.setLocale('en-US')
    assert.equal(i18n.getCurrentLocale(), 'en-US')
  })

  it('5. getCurrentLocale / getFallbackLocale 返回正确值', () => {
    assert.equal(i18n.getCurrentLocale(), 'zh-CN')
    assert.equal(i18n.getFallbackLocale(), 'en-US')
    i18n.setFallbackLocale('zh-CN')
    assert.equal(i18n.getFallbackLocale(), 'zh-CN')
  })

  it('6. setLocale 切换后 t() 使用新语言翻译', () => {
    i18n.setLocale('zh-CN')
    assert.equal(i18n.t('app.name'), '智阅')
    i18n.setLocale('en-US')
    assert.equal(i18n.t('app.name'), 'PageWise')
  })

  it('7. setLocale 相同语言不触发通知', () => {
    let called = false
    const unsub = i18n.onLocaleChange(() => { called = true })
    i18n.setLocale('zh-CN') // 已经是 zh-CN
    assert.equal(called, false)
    unsub()
  })
})

// ── 翻译函数 t() ────────────────────────────────────────────────────────────

describe('i18n — t() 翻译函数', () => {

  it('8. 基本翻译：当前语言的 key 正确返回', () => {
    assert.equal(i18n.t('app.name'), '智阅')
    assert.equal(i18n.t('tab.chat'), '问答')
  })

  it('9. 参数插值：{{name}} 被正确替换', () => {
    const result = i18n.t('welcome.greeting', { name: 'PageWise' })
    assert.equal(result, '你好，PageWise！')
    i18n.setLocale('en-US')
    assert.equal(i18n.t('welcome.greeting', { name: 'World' }), 'Hello, World!')
  })

  it('10. 缺失参数保留原始占位符', () => {
    const result = i18n.t('welcome.greeting')
    assert.equal(result, '你好，{{name}}！')
  })

  it('11. 空 key 返回空字符串', () => {
    assert.equal(i18n.t(''), '')
    assert.equal(i18n.t(null), '')
    assert.equal(i18n.t(undefined), '')
  })

  it('12. 指定 locale 参数覆盖当前语言', () => {
    i18n.setLocale('zh-CN')
    assert.equal(i18n.t('app.name', null, 'en-US'), 'PageWise')
  })
})

// ── 回退机制 ────────────────────────────────────────────────────────────────

describe('i18n — 回退机制', () => {

  it('13. 当前语言缺失 key 时回退到 fallback 语言', () => {
    i18n.setLocale('zh-CN')
    // 'only.en' 只在 en-US 中定义
    assert.equal(i18n.t('only.en'), 'English only')
  })

  it('14. 当前语言和 fallback 均缺失 key 时返回原始 key', () => {
    assert.equal(i18n.t('nonexistent.key'), 'nonexistent.key')
    assert.equal(i18n.t('deeply.nested.missing.key'), 'deeply.nested.missing.key')
  })

  it('15. hasTranslation 正确检查 key 存在性（含回退）', () => {
    i18n.setLocale('zh-CN')
    assert.equal(i18n.hasTranslation('app.name'), true)
    assert.equal(i18n.hasTranslation('only.en'), true)   // 在 fallback 中
    assert.equal(i18n.hasTranslation('missing.key'), false)
  })
})

// ── 动态切换监听 ────────────────────────────────────────────────────────────

describe('i18n — onLocaleChange 监听', () => {

  it('16. 切换语言时监听器被调用并收到新旧语言', () => {
    let receivedNew = null
    let receivedOld = null
    const unsub = i18n.onLocaleChange((newLoc, oldLoc) => {
      receivedNew = newLoc
      receivedOld = oldLoc
    })
    i18n.setLocale('en-US')
    assert.equal(receivedNew, 'en-US')
    assert.equal(receivedOld, 'zh-CN')
    unsub()
  })

  it('17. 取消订阅后不再收到通知', () => {
    let callCount = 0
    const unsub = i18n.onLocaleChange(() => { callCount++ })
    i18n.setLocale('en-US')
    assert.equal(callCount, 1)
    unsub()
    i18n.setLocale('zh-CN')
    assert.equal(callCount, 1) // 不再增加
  })

  it('18. 多个监听器独立工作', () => {
    let count1 = 0, count2 = 0
    const unsub1 = i18n.onLocaleChange(() => { count1++ })
    const unsub2 = i18n.onLocaleChange(() => { count2++ })
    i18n.setLocale('en-US')
    assert.equal(count1, 1)
    assert.equal(count2, 1)
    unsub1()
    i18n.setLocale('zh-CN')
    assert.equal(count1, 1) // 已取消
    assert.equal(count2, 2)
    unsub2()
  })
})

// ── initI18n 初始化 ─────────────────────────────────────────────────────────

describe('i18n — initI18n', () => {

  it('19. initI18n 注册自定义语言包并设置语言', async () => {
    const locale = await i18n.initI18n({
      locales: { 'fr-FR': { 'app.name': 'PageSage' } },
      defaultLocale: 'fr-FR',
      fallback: 'en-US',
      translatePage: false,
    })
    // 可能从 chrome.storage 读取到 zh-CN（无 chrome 环境），也可能用 defaultLocale
    assert.ok(typeof locale === 'string')
    assert.ok(i18n.getSupportedLocales().includes('fr-FR'))
    // 回退语言应被设置
    assert.equal(i18n.getFallbackLocale(), 'en-US')
  })

  it('20. initI18n 确保内建语言包存在', async () => {
    await i18n.initI18n({ translatePage: false })
    const locales = i18n.getSupportedLocales()
    assert.ok(locales.includes('zh-CN'))
    assert.ok(locales.includes('en-US'))
  })
})
