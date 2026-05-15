/**
 * test-depth-log-store.js — LogStore 深度测试
 *
 * 测试范围:
 *   addLog          — 添加日志条目、级别、模块、数据截断
 *   logDebug/Info/Warn/Error — 便捷方法
 *   getLogs         — 返回完整日志（副本）
 *   getLogsByModule — 按模块筛选
 *   getLogsByLevel  — 按级别筛选
 *   clearLogs       — 清空日志
 *   exportLogs      — 导出为文本格式
 *   MAX_LOGS        — 超过 500 条自动裁剪
 *   recordMetric    — 性能指标记录
 *   getMetrics / getMetricsByCategory / getRecentMetrics — 指标查询
 *   getPerformanceStats — 统计 avg/p50/p95
 *   clearMetrics    — 清空指标
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  LogLevel,
  addLog,
  logDebug, logInfo, logWarn, logError,
  getLogs,
  getLogsByModule,
  getLogsByLevel,
  clearLogs,
  exportLogs,
  recordMetric,
  getMetrics,
  getMetricsByCategory,
  getRecentMetrics,
  getPerformanceStats,
  clearMetrics,
} = await import('../lib/log-store.js')

// ── 测试 ─────────────────────────────────────────────────────────────────────

describe('LogStore', () => {

  beforeEach(() => {
    clearLogs()
    clearMetrics()
  })

  // ─── addLog ─────────────────────────────────────────────────────────────

  describe('addLog — 添加日志', () => {
    it('1. addLog 返回带 id/timestamp/level/module/message 的条目', () => {
      const entry = addLog('info', 'core', 'hello')
      assert.ok(entry.id)
      assert.ok(typeof entry.timestamp === 'number')
      assert.equal(entry.level, 'info')
      assert.equal(entry.module, 'core')
      assert.equal(entry.message, 'hello')
      assert.equal(entry.data, null)
    })

    it('2. 附带 data 时 data 被 JSON.stringify 并截断到 500 字符', () => {
      const bigData = { info: 'x'.repeat(600) }
      const entry = addLog('debug', 'mod', 'msg', bigData)
      assert.ok(entry.data.length <= 500)
      assert.ok(entry.data.startsWith('{'))
    })

    it('3. LogLevel 常量包含 debug/info/warn/error', () => {
      assert.equal(LogLevel.DEBUG, 'debug')
      assert.equal(LogLevel.INFO, 'info')
      assert.equal(LogLevel.WARN, 'warn')
      assert.equal(LogLevel.ERROR, 'error')
    })
  })

  // ─── 便捷方法 ───────────────────────────────────────────────────────────

  describe('logDebug/Info/Warn/Error — 便捷方法', () => {
    it('4. logDebug 记录 debug 级别', () => {
      logDebug('auth', 'token refreshed')
      assert.equal(getLogs().length, 1)
      assert.equal(getLogs()[0].level, 'debug')
    })

    it('5. logError 记录 error 级别并携带 data', () => {
      logError('api', 'request failed', { code: 500 })
      const logs = getLogs()
      assert.equal(logs[0].level, 'error')
      assert.ok(logs[0].data.includes('500'))
    })
  })

  // ─── 筛选 ───────────────────────────────────────────────────────────────

  describe('getLogsByLevel — 按级别筛选', () => {
    it('6. 只返回指定级别的日志', () => {
      logInfo('a', 'msg1')
      logWarn('a', 'msg2')
      logError('a', 'msg3')
      logInfo('a', 'msg4')
      const warns = getLogsByLevel('warn')
      assert.equal(warns.length, 1)
      assert.equal(warns[0].message, 'msg2')
    })

    it('7. 无匹配时返回空数组', () => {
      logInfo('a', 'msg')
      assert.deepEqual(getLogsByLevel('error'), [])
    })
  })

  describe('getLogsByModule — 按模块筛选', () => {
    it('8. 只返回指定模块的日志', () => {
      logInfo('sidebar', 'open')
      logInfo('ai-client', 'call')
      logWarn('sidebar', 'resize')
      const sidebar = getLogsByModule('sidebar')
      assert.equal(sidebar.length, 2)
      assert.ok(sidebar.every(l => l.module === 'sidebar'))
    })
  })

  // ─── clearLogs / exportLogs ─────────────────────────────────────────────

  describe('clearLogs — 清空日志', () => {
    it('9. clearLogs() 清空后 getLogs() 返回 []', () => {
      logInfo('m', 'a')
      logInfo('m', 'b')
      clearLogs()
      assert.deepEqual(getLogs(), [])
    })
  })

  describe('exportLogs — 导出为文本', () => {
    it('10. 导出格式包含 ISO 时间、级别、模块、消息', () => {
      logWarn('ai-client', 'slow request', { ms: 3000 })
      const text = exportLogs()
      assert.ok(text.includes('[WARN]'))
      assert.ok(text.includes('[ai-client]'))
      assert.ok(text.includes('slow request'))
      assert.ok(text.includes('ms'))
    })

    it('11. 多条日志用换行符分隔', () => {
      logInfo('a', 'first')
      logInfo('b', 'second')
      const lines = exportLogs().split('\n')
      assert.equal(lines.length, 2)
    })
  })

  // ─── MAX_LOGS 裁剪 ─────────────────────────────────────────────────────

  describe('MAX_LOGS — 超过 500 条自动裁剪', () => {
    it('12. 超过 500 条后只保留最新 500 条', () => {
      for (let i = 0; i < 520; i++) addLog('info', 'stress', `msg-${i}`)
      const logs = getLogs()
      assert.equal(logs.length, 500)
      // 最新条目应是 msg-519
      assert.ok(logs[logs.length - 1].message.includes('msg-519'))
    })
  })

  // ─── 性能指标 ───────────────────────────────────────────────────────────

  describe('recordMetric — 记录性能指标', () => {
    it('13. 记录指标并可按类别查询', () => {
      recordMetric('api', 150.123, { model: 'gpt-4' })
      recordMetric('extraction', 30)
      const apiMetrics = getMetricsByCategory('api')
      assert.equal(apiMetrics.length, 1)
      assert.equal(apiMetrics[0].category, 'api')
      assert.equal(apiMetrics[0].durationMs, 150.12) // 保留两位小数
    })

    it('14. getRecentMetrics(n) 返回最近 n 条，可选 category', () => {
      recordMetric('api', 10)
      recordMetric('api', 20)
      recordMetric('rendering', 30)
      const recent = getRecentMetrics(2)
      assert.equal(recent.length, 2)
      const apiRecent = getRecentMetrics(5, 'api')
      assert.equal(apiRecent.length, 2)
    })
  })

  describe('getPerformanceStats — 性能统计', () => {
    it('15. 正确计算 avg/p50/p95/min/max/count', () => {
      const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      durations.forEach(d => recordMetric('api', d))
      const stats = getPerformanceStats('api')
      assert.equal(stats.count, 10)
      assert.equal(stats.avg, 55)
      assert.equal(stats.min, 10)
      assert.equal(stats.max, 100)
      assert.equal(stats.p50, 60)  // sorted[floor(10*0.5)] = sorted[5] = 60
      assert.equal(stats.p95, 100) // sorted[floor(10*0.95)] = sorted[9] = 100
    })

    it('无数据时返回全零统计', () => {
      const stats = getPerformanceStats()
      assert.deepEqual(stats, { avg: 0, p50: 0, p95: 0, count: 0, min: 0, max: 0 })
    })

    it('clearMetrics 清空后 getMetrics 返回 []', () => {
      recordMetric('api', 100)
      clearMetrics()
      assert.deepEqual(getMetrics(), [])
    })
  })
})
