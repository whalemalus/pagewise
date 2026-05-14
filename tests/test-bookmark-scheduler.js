/**
 * 测试 lib/bookmark-scheduler.js — 书签定时任务调度器
 *
 * 测试范围:
 *   BookmarkScheduler 构造 / registerHandler / scheduleCheckLinks / scheduleBackup
 *   scheduleCleanup / getActiveSchedules / cancelSchedule / runScheduleNow
 *   pauseSchedule / resumeSchedule / getEventLog / getStats / cancelAll / getSchedule
 *   边界情况 / 常量导出
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  BookmarkScheduler,
  TASK_TYPES,
  MIN_INTERVAL,
  MAX_INTERVAL,
  MAX_TASKS,
  MAX_EVENT_LOG,
  DEFAULT_INTERVALS,
  validateInterval,
  generateTaskId,
} = await import('../lib/bookmark-scheduler.js')

// ==================== 测试辅助 ====================

/**
 * 创建一个 mock timer 环境，返回 scheduler 和控制函数
 */
function createTestEnv(initialTime = 1000000) {
  let currentTime = initialTime
  const timers = new Map()
  let nextTimerId = 1

  const fakeSetInterval = (fn, ms) => {
    const id = nextTimerId++
    timers.set(id, { fn, ms, active: true })
    return id
  }

  const fakeClearInterval = (id) => {
    timers.delete(id)
  }

  const fakeNow = () => currentTime

  const scheduler = new BookmarkScheduler({
    setInterval: fakeSetInterval,
    clearInterval: fakeClearInterval,
    now: fakeNow,
  })

  // 手动触发所有活跃定时器 (模拟时间流逝)
  const tickAll = async () => {
    for (const [, timer] of timers) {
      if (timer.active) {
        await timer.fn()
      }
    }
  }

  const advanceTime = (ms) => {
    currentTime += ms
  }

  const getTimerCount = () => timers.size

  return { scheduler, tickAll, advanceTime, getTimerCount, fakeNow: () => currentTime }
}

// ==================== 构造函数 ====================

describe('BookmarkScheduler 构造', () => {
  it('应创建空调度器', () => {
    const scheduler = new BookmarkScheduler()
    const schedules = scheduler.getActiveSchedules()
    assert.equal(schedules.length, 0)
  })

  it('应正确初始化统计信息', () => {
    const scheduler = new BookmarkScheduler()
    const stats = scheduler.getStats()
    assert.equal(stats.totalTasks, 0)
    assert.equal(stats.activeTasks, 0)
    assert.equal(stats.pausedTasks, 0)
    assert.equal(stats.totalRuns, 0)
    assert.equal(stats.logSize, 0)
  })
})

// ==================== 常量导出 ====================

describe('常量导出', () => {
  it('应导出正确的 TASK_TYPES', () => {
    assert.deepEqual(TASK_TYPES, ['check-links', 'backup', 'cleanup'])
  })

  it('应导出 MIN_INTERVAL 和 MAX_INTERVAL', () => {
    assert.equal(MIN_INTERVAL, 1000)
    assert.ok(MAX_INTERVAL > 0)
    assert.equal(MAX_INTERVAL, 30 * 24 * 60 * 60 * 1000)
  })

  it('应导出 MAX_TASKS', () => {
    assert.equal(MAX_TASKS, 20)
  })

  it('应导出 DEFAULT_INTERVALS', () => {
    assert.equal(DEFAULT_INTERVALS['check-links'], 24 * 60 * 60 * 1000)
    assert.equal(DEFAULT_INTERVALS['backup'], 7 * 24 * 60 * 60 * 1000)
    assert.equal(DEFAULT_INTERVALS['cleanup'], 24 * 60 * 60 * 1000)
  })

  it('应导出 validateInterval 和 generateTaskId 函数', () => {
    assert.equal(typeof validateInterval, 'function')
    assert.equal(typeof generateTaskId, 'function')
  })
})

// ==================== validateInterval ====================

describe('validateInterval', () => {
  it('应接受有效间隔', () => {
    assert.doesNotThrow(() => validateInterval(5000, 'test'))
    assert.doesNotThrow(() => validateInterval(MIN_INTERVAL, 'test'))
    assert.doesNotThrow(() => validateInterval(MAX_INTERVAL, 'test'))
  })

  it('应拒绝非数字', () => {
    assert.throws(() => validateInterval('5000', 'test'), /有效数字/)
    assert.throws(() => validateInterval(null, 'test'), /有效数字/)
    assert.throws(() => validateInterval(NaN, 'test'), /有效数字/)
    assert.throws(() => validateInterval(Infinity, 'test'), /有效数字/)
  })

  it('应拒绝小于 MIN_INTERVAL 的间隔', () => {
    assert.throws(() => validateInterval(500, 'test'), /不能小于/)
  })

  it('应拒绝大于 MAX_INTERVAL 的间隔', () => {
    assert.throws(() => validateInterval(MAX_INTERVAL + 1, 'test'), /不能大于/)
  })
})

// ==================== generateTaskId ====================

describe('generateTaskId', () => {
  it('应生成以 sched- 开头的字符串', () => {
    const id = generateTaskId()
    assert.ok(id.startsWith('sched-'))
    assert.ok(typeof id === 'string')
    assert.ok(id.length > 6)
  })

  it('应生成不同的 ID', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) {
      ids.add(generateTaskId())
    }
    assert.equal(ids.size, 100)
  })
})

// ==================== registerHandler ====================

describe('registerHandler', () => {
  it('应注册有效的 handler', () => {
    const scheduler = new BookmarkScheduler()
    const result = scheduler.registerHandler('check-links', async () => {})
    assert.equal(result, scheduler) // 链式调用
  })

  it('应支持链式注册多个 handler', () => {
    const scheduler = new BookmarkScheduler()
    scheduler
      .registerHandler('check-links', async () => {})
      .registerHandler('backup', async () => {})
      .registerHandler('cleanup', async () => {})
    // 不应抛错
  })

  it('应拒绝未知任务类型', () => {
    const scheduler = new BookmarkScheduler()
    assert.throws(() => scheduler.registerHandler('unknown', async () => {}), /未知任务类型/)
  })

  it('应拒绝非函数 handler', () => {
    const scheduler = new BookmarkScheduler()
    assert.throws(() => scheduler.registerHandler('check-links', 'not-fn'), /handler 必须是函数/)
    assert.throws(() => scheduler.registerHandler('check-links', null), /handler 必须是函数/)
  })
})

// ==================== scheduleCheckLinks ====================

describe('scheduleCheckLinks', () => {
  it('应创建定时链接检查任务并返回 taskId', () => {
    const { scheduler } = createTestEnv()
    const taskId = scheduler.scheduleCheckLinks(5000)
    assert.ok(typeof taskId === 'string')
    assert.ok(taskId.startsWith('sched-'))
  })

  it('应使用默认间隔 (24h) 当未指定 interval', () => {
    const { scheduler } = createTestEnv()
    const taskId = scheduler.scheduleCheckLinks()
    const info = scheduler.getSchedule(taskId)
    assert.equal(info.interval, DEFAULT_INTERVALS['check-links'])
  })

  it('应记录到活跃调度列表', () => {
    const { scheduler } = createTestEnv()
    scheduler.scheduleCheckLinks(5000)
    const schedules = scheduler.getActiveSchedules()
    assert.equal(schedules.length, 1)
    assert.equal(schedules[0].type, 'check-links')
    assert.equal(schedules[0].status, 'active')
  })
})

// ==================== scheduleBackup ====================

describe('scheduleBackup', () => {
  it('应创建定时备份任务', () => {
    const { scheduler } = createTestEnv()
    const taskId = scheduler.scheduleBackup(10000, { format: 'netscape' })
    const info = scheduler.getSchedule(taskId)
    assert.equal(info.type, 'backup')
    assert.equal(info.interval, 10000)
    assert.equal(info.options.format, 'netscape')
  })

  it('应使用默认间隔 (7天) 当未指定 interval', () => {
    const { scheduler } = createTestEnv()
    const taskId = scheduler.scheduleBackup()
    const info = scheduler.getSchedule(taskId)
    assert.equal(info.interval, DEFAULT_INTERVALS['backup'])
  })
})

// ==================== scheduleCleanup ====================

describe('scheduleCleanup', () => {
  it('应创建定时清理任务', () => {
    const { scheduler } = createTestEnv()
    const taskId = scheduler.scheduleCleanup(86400000, { strategy: 'keep-newest' })
    const info = scheduler.getSchedule(taskId)
    assert.equal(info.type, 'cleanup')
    assert.equal(info.options.strategy, 'keep-newest')
  })

  it('应使用默认间隔 (24h) 当未指定 interval', () => {
    const { scheduler } = createTestEnv()
    const taskId = scheduler.scheduleCleanup()
    const info = scheduler.getSchedule(taskId)
    assert.equal(info.interval, DEFAULT_INTERVALS['cleanup'])
  })
})

// ==================== getActiveSchedules ====================

describe('getActiveSchedules', () => {
  it('应列出所有活跃任务', () => {
    const { scheduler } = createTestEnv()
    scheduler.scheduleCheckLinks(5000)
    scheduler.scheduleBackup(10000)
    scheduler.scheduleCleanup(15000)

    const schedules = scheduler.getActiveSchedules()
    assert.equal(schedules.length, 3)
    const types = schedules.map(s => s.type).sort()
    assert.deepEqual(types, ['backup', 'check-links', 'cleanup'])
  })

  it('取消后不应出现在列表中', () => {
    const { scheduler } = createTestEnv()
    const id1 = scheduler.scheduleCheckLinks(5000)
    scheduler.scheduleBackup(10000)
    scheduler.cancelSchedule(id1)

    const schedules = scheduler.getActiveSchedules()
    assert.equal(schedules.length, 1)
    assert.equal(schedules[0].type, 'backup')
  })

  it('暂停的任务应标记为 paused', () => {
    const { scheduler } = createTestEnv()
    const id = scheduler.scheduleCheckLinks(5000)
    scheduler.pauseSchedule(id)

    const schedules = scheduler.getActiveSchedules()
    assert.equal(schedules.length, 1)
    assert.equal(schedules[0].status, 'paused')
  })
})

// ==================== cancelSchedule ====================

describe('cancelSchedule', () => {
  it('应成功取消存在的任务', () => {
    const { scheduler } = createTestEnv()
    const taskId = scheduler.scheduleCheckLinks(5000)
    const result = scheduler.cancelSchedule(taskId)
    assert.equal(result, true)
    assert.equal(scheduler.getActiveSchedules().length, 0)
  })

  it('取消不存在的任务应返回 false', () => {
    const { scheduler } = createTestEnv()
    assert.equal(scheduler.cancelSchedule('nonexistent'), false)
  })

  it('应接受空/null taskId 并返回 false', () => {
    const { scheduler } = createTestEnv()
    assert.equal(scheduler.cancelSchedule(''), false)
    assert.equal(scheduler.cancelSchedule(null), false)
    assert.equal(scheduler.cancelSchedule(undefined), false)
  })

  it('应清除定时器', () => {
    const { scheduler, getTimerCount } = createTestEnv()
    scheduler.scheduleCheckLinks(5000)
    assert.equal(getTimerCount(), 1)
    scheduler.cancelSchedule(scheduler.getActiveSchedules()[0].taskId)
    assert.equal(getTimerCount(), 0)
  })

  it('应记录取消事件到日志', () => {
    const { scheduler } = createTestEnv()
    const taskId = scheduler.scheduleCheckLinks(5000)
    scheduler.cancelSchedule(taskId)
    const logs = scheduler.getEventLog({ taskId })
    const cancelLog = logs.find(e => e.action === 'cancelled')
    assert.ok(cancelLog)
    assert.equal(cancelLog.type, 'check-links')
  })
})

// ==================== runScheduleNow ====================

describe('runScheduleNow', () => {
  it('应手动执行任务并返回成功', async () => {
    const { scheduler } = createTestEnv()
    let handlerCalled = false
    scheduler.registerHandler('check-links', async () => {
      handlerCalled = true
      return { deadLinks: 3 }
    })

    const taskId = scheduler.scheduleCheckLinks(5000)
    const result = await scheduler.runScheduleNow(taskId)

    assert.equal(result.success, true)
    assert.equal(handlerCalled, true)
    assert.deepEqual(result.result, { deadLinks: 3 })
    assert.equal(result.error, null)
  })

  it('应更新 lastRunAt 和 runCount', async () => {
    const { scheduler, advanceTime } = createTestEnv()
    scheduler.registerHandler('backup', async () => 'ok')

    const taskId = scheduler.scheduleBackup(10000)
    advanceTime(500)
    await scheduler.runScheduleNow(taskId)

    const info = scheduler.getSchedule(taskId)
    assert.equal(info.runCount, 1)
    assert.ok(info.lastRunAt > 0)
  })

  it('应处理 handler 抛出的错误', async () => {
    const { scheduler } = createTestEnv()
    scheduler.registerHandler('cleanup', async () => {
      throw new Error('cleanup failed')
    })

    const taskId = scheduler.scheduleCleanup(5000)
    const result = await scheduler.runScheduleNow(taskId)

    assert.equal(result.success, false)
    assert.equal(result.error, 'cleanup failed')
  })

  it('应处理未注册 handler 的情况', async () => {
    const { scheduler } = createTestEnv()
    // 不注册任何 handler
    const taskId = scheduler.scheduleCheckLinks(5000)
    const result = await scheduler.runScheduleNow(taskId)

    assert.equal(result.success, false)
    assert.ok(result.error.includes('未注册'))
  })

  it('不存在的任务应返回错误', async () => {
    const { scheduler } = createTestEnv()
    const result = await scheduler.runScheduleNow('nonexistent')
    assert.equal(result.success, false)
    assert.ok(result.error.includes('不存在'))
  })

  it('无效 taskId 应返回错误', async () => {
    const { scheduler } = createTestEnv()
    const result = await scheduler.runScheduleNow('')
    assert.equal(result.success, false)
    assert.ok(result.error.includes('无效'))
  })

  it('多次执行应累加 runCount', async () => {
    const { scheduler } = createTestEnv()
    scheduler.registerHandler('check-links', async () => 'ok')

    const taskId = scheduler.scheduleCheckLinks(5000)
    await scheduler.runScheduleNow(taskId)
    await scheduler.runScheduleNow(taskId)
    await scheduler.runScheduleNow(taskId)

    const info = scheduler.getSchedule(taskId)
    assert.equal(info.runCount, 3)
  })
})

// ==================== pauseSchedule / resumeSchedule ====================

describe('pauseSchedule 和 resumeSchedule', () => {
  it('应暂停活跃任务', () => {
    const { scheduler, getTimerCount } = createTestEnv()
    const taskId = scheduler.scheduleCheckLinks(5000)
    assert.equal(getTimerCount(), 1)

    const result = scheduler.pauseSchedule(taskId)
    assert.equal(result, true)
    assert.equal(getTimerCount(), 0)

    const info = scheduler.getSchedule(taskId)
    assert.equal(info.status, 'paused')
    assert.equal(info.nextRunAt, null)
  })

  it('应恢复已暂停的任务', () => {
    const { scheduler, getTimerCount } = createTestEnv()
    const taskId = scheduler.scheduleCheckLinks(5000)
    scheduler.pauseSchedule(taskId)
    assert.equal(getTimerCount(), 0)

    const result = scheduler.resumeSchedule(taskId)
    assert.equal(result, true)
    assert.equal(getTimerCount(), 1)

    const info = scheduler.getSchedule(taskId)
    assert.equal(info.status, 'active')
  })

  it('暂停不存在的任务应返回 false', () => {
    const { scheduler } = createTestEnv()
    assert.equal(scheduler.pauseSchedule('nonexistent'), false)
  })

  it('恢复未暂停的任务应返回 false', () => {
    const { scheduler } = createTestEnv()
    const taskId = scheduler.scheduleCheckLinks(5000)
    assert.equal(scheduler.resumeSchedule(taskId), false)
  })
})

// ==================== getEventLog ====================

describe('getEventLog', () => {
  it('应记录任务创建事件', () => {
    const { scheduler } = createTestEnv()
    scheduler.scheduleCheckLinks(5000)
    const logs = scheduler.getEventLog()
    assert.ok(logs.length >= 1)
    assert.equal(logs[0].action, 'created')
    assert.equal(logs[0].type, 'check-links')
  })

  it('应按 taskId 过滤日志', async () => {
    const { scheduler } = createTestEnv()
    scheduler.registerHandler('check-links', async () => 'ok')
    scheduler.registerHandler('backup', async () => 'ok')

    const id1 = scheduler.scheduleCheckLinks(5000)
    const id2 = scheduler.scheduleBackup(10000)
    await scheduler.runScheduleNow(id1)

    const logs = scheduler.getEventLog({ taskId: id1 })
    for (const log of logs) {
      assert.equal(log.taskId, id1)
    }
    // id1 应有 created + started + completed
    assert.ok(logs.length >= 3)
  })

  it('应按 type 过滤日志', () => {
    const { scheduler } = createTestEnv()
    scheduler.scheduleCheckLinks(5000)
    scheduler.scheduleBackup(10000)

    const logs = scheduler.getEventLog({ type: 'backup' })
    for (const log of logs) {
      assert.equal(log.type, 'backup')
    }
  })

  it('应支持 limit 参数', () => {
    const { scheduler } = createTestEnv()
    scheduler.registerHandler('check-links', async () => 'ok')

    scheduler.scheduleCheckLinks(5000)
    scheduler.scheduleBackup(10000)
    scheduler.scheduleCleanup(15000)

    const logs = scheduler.getEventLog({ limit: 2 })
    assert.ok(logs.length <= 2)
  })
})

// ==================== getStats ====================

describe('getStats', () => {
  it('应正确统计活跃和暂停任务', () => {
    const { scheduler } = createTestEnv()
    scheduler.scheduleCheckLinks(5000)
    scheduler.scheduleBackup(10000)
    const id3 = scheduler.scheduleCleanup(15000)
    scheduler.pauseSchedule(id3)

    const stats = scheduler.getStats()
    assert.equal(stats.totalTasks, 3)
    assert.equal(stats.activeTasks, 2)
    assert.equal(stats.pausedTasks, 1)
  })

  it('应正确统计执行次数', async () => {
    const { scheduler } = createTestEnv()
    scheduler.registerHandler('check-links', async () => 'ok')

    const id = scheduler.scheduleCheckLinks(5000)
    await scheduler.runScheduleNow(id)
    await scheduler.runScheduleNow(id)

    const stats = scheduler.getStats()
    assert.equal(stats.totalRuns, 2)
  })

  it('应报告日志大小', () => {
    const { scheduler } = createTestEnv()
    scheduler.scheduleCheckLinks(5000)
    scheduler.scheduleBackup(10000)

    const stats = scheduler.getStats()
    assert.ok(stats.logSize >= 2) // 至少2个 created 事件
  })
})

// ==================== cancelAll ====================

describe('cancelAll', () => {
  it('应取消所有任务', () => {
    const { scheduler, getTimerCount } = createTestEnv()
    scheduler.scheduleCheckLinks(5000)
    scheduler.scheduleBackup(10000)
    scheduler.scheduleCleanup(15000)

    assert.equal(scheduler.getActiveSchedules().length, 3)
    scheduler.cancelAll()
    assert.equal(scheduler.getActiveSchedules().length, 0)
    assert.equal(getTimerCount(), 0)
  })

  it('空调度器上 cancelAll 不应抛错', () => {
    const { scheduler } = createTestEnv()
    assert.doesNotThrow(() => scheduler.cancelAll())
  })
})

// ==================== getSchedule ====================

describe('getSchedule', () => {
  it('应返回任务详情', () => {
    const { scheduler } = createTestEnv()
    const taskId = scheduler.scheduleCheckLinks(5000, { concurrency: 3 })
    const info = scheduler.getSchedule(taskId)

    assert.ok(info)
    assert.equal(info.taskId, taskId)
    assert.equal(info.type, 'check-links')
    assert.equal(info.interval, 5000)
    assert.equal(info.runCount, 0)
    assert.equal(info.status, 'active')
    assert.equal(info.options.concurrency, 3)
    assert.ok(info.createdAt > 0)
    assert.ok(info.nextRunAt > 0)
    assert.equal(info.lastRunAt, null)
  })

  it('不存在的任务应返回 null', () => {
    const { scheduler } = createTestEnv()
    assert.equal(scheduler.getSchedule('nonexistent'), null)
  })
})

// ==================== 定时器回调触发 ====================

describe('定时器回调执行', () => {
  it('定时器回调应触发 handler 执行', async () => {
    const { scheduler, tickAll } = createTestEnv()
    let executed = false
    scheduler.registerHandler('check-links', async () => {
      executed = true
      return 'done'
    })

    scheduler.scheduleCheckLinks(5000)
    await tickAll()

    assert.equal(executed, true)
    const stats = scheduler.getStats()
    assert.equal(stats.totalRuns, 1)
  })
})

// ==================== 边界情况 ====================

describe('边界情况', () => {
  it('应拒绝过小的间隔', () => {
    const { scheduler } = createTestEnv()
    assert.throws(() => scheduler.scheduleCheckLinks(500), /不能小于/)
  })

  it('应拒绝过大的间隔', () => {
    const { scheduler } = createTestEnv()
    assert.throws(() => scheduler.scheduleCheckLinks(MAX_INTERVAL + 1), /不能大于/)
  })

  it('应拒绝 NaN 间隔', () => {
    const { scheduler } = createTestEnv()
    assert.throws(() => scheduler.scheduleCheckLinks(NaN), /有效数字/)
  })

  it('应拒绝 Infinity 间隔', () => {
    const { scheduler } = createTestEnv()
    assert.throws(() => scheduler.scheduleCheckLinks(Infinity), /有效数字/)
  })

  it('应支持创建多个同类任务', () => {
    const { scheduler } = createTestEnv()
    const id1 = scheduler.scheduleCheckLinks(5000)
    const id2 = scheduler.scheduleCheckLinks(10000)
    const id3 = scheduler.scheduleCheckLinks(15000)

    assert.notEqual(id1, id2)
    assert.notEqual(id2, id3)
    assert.equal(scheduler.getActiveSchedules().length, 3)
  })

  it('handler 异步返回结果应正确传递', async () => {
    const { scheduler } = createTestEnv()
    const expected = { report: { total: 10, dead: 2 } }
    scheduler.registerHandler('check-links', async () => expected)

    const taskId = scheduler.scheduleCheckLinks(5000)
    const result = await scheduler.runScheduleNow(taskId)
    assert.deepEqual(result.result, expected)
  })

  it('handler 返回 undefined 应正常处理', async () => {
    const { scheduler } = createTestEnv()
    scheduler.registerHandler('backup', async () => {})

    const taskId = scheduler.scheduleBackup(5000)
    const result = await scheduler.runScheduleNow(taskId)
    assert.equal(result.success, true)
    assert.equal(result.result, undefined)
  })

  it('handler 中抛出非 Error 对象应正常处理', async () => {
    const { scheduler } = createTestEnv()
    scheduler.registerHandler('cleanup', async () => {
      throw 'string error'  // eslint-disable-line no-throw-literal
    })

    const taskId = scheduler.scheduleCleanup(5000)
    const result = await scheduler.runScheduleNow(taskId)
    assert.equal(result.success, false)
    assert.equal(result.error, 'string error')
  })
})
