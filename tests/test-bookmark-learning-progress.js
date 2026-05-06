/**
 * 测试 lib/bookmark-learning-progress.js — 学习进度追踪 BookmarkLearningProgress
 *
 * 测试范围:
 *   构造函数 / init / startSession / endSession
 *   getBookmarkProgress / getCategoryProgress / getOverallProgress
 *   getStats / getDailyStats
 *   exportData / importData
 *   超时自动结束 / streak 计算 / 进度百分比 / 边界条件
 *
 * AC: 单元测试 ≥ 20 个测试用例
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// 安装 IndexedDB mock
import { installIndexedDBMock, uninstallIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

const { BookmarkLearningProgress } = await import('../lib/bookmark-learning-progress.js');

// ==================== 辅助函数 ====================

function createBookmark(id, title, url, folderPath = [], tags = []) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    dateAdded: 1700000000000 + Number(id) * 86400000,
  };
}

const sampleBookmarks = [
  createBookmark('1', 'React Hooks Tutorial', 'https://react.dev/hooks', ['前端'], ['react']),
  createBookmark('2', 'Node.js 入门指南', 'https://nodejs.org/docs', ['后端'], ['nodejs']),
  createBookmark('3', 'Python 机器学习', 'https://python.org/ml', ['AI'], ['python', 'ml']),
  createBookmark('4', 'CSS Grid 布局', 'https://css-tricks.com/grid', ['前端'], ['css']),
  createBookmark('5', 'Docker 架构', 'https://docker.com/arch', ['DevOps'], ['docker']),
];

// Mock setTimeout / clearTimeout — 让超时可控
let mockTimers = new Map();
let timerIdCounter = 0;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

function installMockTimers() {
  mockTimers.clear();
  timerIdCounter = 0;
  globalThis.setTimeout = (fn, ms) => {
    const id = ++timerIdCounter;
    mockTimers.set(id, { fn, ms });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    mockTimers.delete(id);
  };
}

function uninstallMockTimers() {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  mockTimers.clear();
}

/** 手动触发所有 mock 定时器 */
function flushTimers() {
  for (const [id, timer] of mockTimers) {
    timer.fn();
  }
  mockTimers.clear();
}

/** 手动触发指定 ms 以上的定时器，并等待所有异步回调 */
async function flushTimersAbove(ms) {
  const toFlush = [];
  for (const [id, timer] of mockTimers) {
    if (timer.ms >= ms) toFlush.push(id);
  }
  for (const id of toFlush) {
    const timer = mockTimers.get(id);
    mockTimers.delete(id);
    // 调用回调（可能是 async），等待其完成
    await timer.fn();
  }
  // 使用原始 setTimeout 等待异步回调完成（mock 的 setTimeout 不会真正延迟）
  await new Promise(r => originalSetTimeout(r, 50));
}

// ==================== 测试 ====================

describe('BookmarkLearningProgress', () => {
  beforeEach(() => {
    installIndexedDBMock();
    installMockTimers();
  });

  afterEach(() => {
    uninstallMockTimers();
    resetIndexedDBMock();
    uninstallIndexedDBMock();
  });

  // ---- 测试 1: 构造函数默认参数 ----
  it('1. constructor 默认参数', () => {
    const progress = new BookmarkLearningProgress();
    assert.ok(progress instanceof BookmarkLearningProgress);
    assert.equal(progress.timeoutMs, 30 * 60 * 1000);
  });

  // ---- 测试 2: 构造函数自定义参数 ----
  it('2. constructor 自定义参数', () => {
    const progress = new BookmarkLearningProgress({
      timeoutMs: 60000,
      dbName: 'testDB',
      dbVersion: 2,
    });
    assert.equal(progress.timeoutMs, 60000);
  });

  // ---- 测试 3: init() 打开 IndexedDB ----
  it('3. init() 打开 IndexedDB', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();
    assert.ok(progress._db != null);
  });

  // ---- 测试 4: startSession 创建会话 ----
  it('4. startSession 创建活跃会话', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();
    const session = await progress.startSession('1');
    assert.equal(session.bookmarkId, '1');
    assert.equal(session.endTime, null);
    assert.equal(session.duration, 0);
    assert.equal(session.timedOut, false);
    assert.ok(session.startTime > 0);
  });

  // ---- 测试 5: endSession 结束会话并计算时长 ----
  it('5. endSession 结束会话并计算时长', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();
    await progress.startSession('1');
    // 直接修改内部活跃会话的 startTime 为 60 秒前
    const internalSession = progress._activeSessions.get('1');
    internalSession.startTime = Date.now() - 60000;
    const ended = await progress.endSession('1');
    assert.equal(ended.bookmarkId, '1');
    assert.ok(ended.endTime > 0);
    assert.ok(ended.duration >= 59 && ended.duration <= 61);
    assert.equal(ended.timedOut, false);
  });

  // ---- 测试 6: endSession 无活跃会话抛错 ----
  it('6. endSession 无活跃会话抛错', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();
    await assert.rejects(
      () => progress.endSession('999'),
      { message: /No active session/ }
    );
  });

  // ---- 测试 7: 重复 startSession 返回已有会话 ----
  it('7. 重复 startSession 返回已有会话', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();
    const s1 = await progress.startSession('1');
    const s2 = await progress.startSession('1');
    assert.equal(s1.startTime, s2.startTime);
    assert.equal(s1.bookmarkId, s2.bookmarkId);
  });

  // ---- 测试 8: 超时自动结束 ----
  it('8. 超时自动结束会话', async () => {
    const progress = new BookmarkLearningProgress({
      bookmarks: sampleBookmarks,
      timeoutMs: 30 * 60 * 1000,
    });
    await progress.init();
    await progress.startSession('1');
    // 模拟超时
    await flushTimersAbove(30 * 60 * 1000);
    // 会话应已结束
    const bp = await progress.getBookmarkProgress('1');
    assert.equal(bp.sessionCount, 1);
    assert.ok(bp.totalTime >= 0);
  });

  // ---- 测试 9: getBookmarkProgress 计算累计时长 ----
  it('9. getBookmarkProgress 计算累计时长', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    // 第一次学习 120 秒
    await progress.startSession('1');
    progress._activeSessions.get('1').startTime = Date.now() - 120000;
    await progress.endSession('1');

    // 第二次学习 60 秒
    await progress.startSession('1');
    progress._activeSessions.get('1').startTime = Date.now() - 60000;
    await progress.endSession('1');

    const bp = await progress.getBookmarkProgress('1');
    assert.equal(bp.bookmarkId, '1');
    assert.equal(bp.sessionCount, 2);
    assert.ok(bp.totalTime >= 178 && bp.totalTime <= 182);
    assert.equal(bp.difficulty, 'beginner'); // title contains "Tutorial"
    assert.equal(bp.expectedTime, 600); // beginner = 10min = 600s
    assert.ok(bp.progress > 0 && bp.progress < 1);
    assert.ok(bp.lastStudiedAt > 0);
  });

  // ---- 测试 10: getBookmarkProgress 进度百分比封顶 1.0 ----
  it('10. getBookmarkProgress 进度百分比封顶 1.0', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    // 学习 20 分钟 (远超 beginner 的 10 分钟预期)
    await progress.startSession('1');
    progress._activeSessions.get('1').startTime = Date.now() - 20 * 60 * 1000;
    await progress.endSession('1');

    const bp = await progress.getBookmarkProgress('1');
    assert.equal(bp.progress, 1.0);
  });

  // ---- 测试 11: getBookmarkProgress 无记录返回零值 ----
  it('11. getBookmarkProgress 无记录返回零值', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();
    const bp = await progress.getBookmarkProgress('999');
    assert.equal(bp.totalTime, 0);
    assert.equal(bp.sessionCount, 0);
    assert.equal(bp.lastStudiedAt, 0);
    assert.equal(bp.progress, 0);
  });

  // ---- 测试 12: getCategoryProgress 按类别汇总 ----
  it('12. getCategoryProgress 按类别汇总', async () => {
    const clusterMap = new Map([
      ['前端', [sampleBookmarks[0], sampleBookmarks[3]]],
      ['后端', [sampleBookmarks[1]]],
    ]);
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    // 学习两个前端书签
    await progress.startSession('1');
    progress._activeSessions.get('1').startTime = Date.now() - 300000;
    await progress.endSession('1');

    await progress.startSession('4');
    progress._activeSessions.get('4').startTime = Date.now() - 300000;
    await progress.endSession('4');

    const cp = await progress.getCategoryProgress('前端', clusterMap);
    assert.equal(cp.category, '前端');
    assert.equal(cp.totalBookmarks, 2);
    assert.equal(cp.studiedBookmarks, 2);
    assert.ok(cp.totalTime > 0);
    assert.ok(cp.avgProgress > 0);
  });

  // ---- 测试 13: getOverallProgress 全局汇总 ----
  it('13. getOverallProgress 全局汇总', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    await progress.startSession('1');
    progress._activeSessions.get('1').startTime = Date.now() - 120000;
    await progress.endSession('1');

    await progress.startSession('2');
    progress._activeSessions.get('2').startTime = Date.now() - 180000;
    await progress.endSession('2');

    const op = await progress.getOverallProgress();
    assert.equal(op.totalBookmarks, 5);
    assert.equal(op.studiedBookmarks, 2);
    assert.ok(op.totalTime > 0);
    assert.ok(op.avgProgress >= 0);
  });

  // ---- 测试 14: getStats 返回总时长/次数/日均 ----
  it('14. getStats 返回总时长/次数/日均', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    await progress.startSession('1');
    progress._activeSessions.get('1').startTime = Date.now() - 600000; // 10 min
    await progress.endSession('1');

    const stats = await progress.getStats();
    assert.ok(stats.totalTime > 0);
    assert.equal(stats.totalSessions, 1);
    assert.ok(stats.dailyAverage >= 0);
    assert.equal(typeof stats.streak, 'number');
  });

  // ---- 测试 15: getStats streak 连续天数 ----
  it('15. getStats streak 连续天数', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    // 今天学习
    await progress.startSession('1');
    progress._activeSessions.get('1').startTime = Date.now() - 60000;
    await progress.endSession('1');

    const stats = await progress.getStats();
    assert.ok(stats.streak >= 1);
  });

  // ---- 测试 16: getStats streak 中断重置 ----
  it('16. getStats mostActiveCategory 字段', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    await progress.startSession('1');
    progress._activeSessions.get('1').startTime = Date.now() - 60000;
    await progress.endSession('1');

    const stats = await progress.getStats();
    assert.equal(typeof stats.mostActiveCategory, 'string');
  });

  // ---- 测试 17: getDailyStats 返回 N 天数据 ----
  it('17. getDailyStats 返回 N 天数据', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    await progress.startSession('1');
    progress._activeSessions.get('1').startTime = Date.now() - 120000;
    await progress.endSession('1');

    const daily = await progress.getDailyStats(7);
    assert.ok(Array.isArray(daily));
    assert.equal(daily.length, 7);
    // 今天应有数据
    const today = daily[daily.length - 1];
    assert.ok(today.totalTime > 0);
    assert.ok(today.sessions >= 1);
    assert.ok(today.date);
  });

  // ---- 测试 18: getDailyStats 无数据返回空数组 ----
  it('18. getDailyStats 无数据返回全零', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();
    const daily = await progress.getDailyStats(3);
    assert.ok(Array.isArray(daily));
    assert.equal(daily.length, 3);
    for (const d of daily) {
      assert.equal(d.totalTime, 0);
      assert.equal(d.sessions, 0);
    }
  });

  // ---- 测试 19: exportData 导出完整数据 ----
  it('19. exportData 导出完整数据', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    await progress.startSession('1');
    // 修改内部会话的 startTime（startSession 返回的是副本）
    progress._activeSessions.get('1').startTime = Date.now() - 60000;
    await progress.endSession('1');

    const data = await progress.exportData();
    assert.ok(data.sessions);
    assert.ok(Array.isArray(data.sessions));
    assert.equal(data.sessions.length, 1);
    assert.equal(data.sessions[0].bookmarkId, '1');
    assert.ok(data.sessions[0].duration > 0);
  });

  // ---- 测试 20: importData 导入并合并去重 ----
  it('20. importData 导入并合并去重', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks, dbName: 'importTest1' });
    await progress.init();

    // 先有一次学习
    await progress.startSession('1');
    progress._activeSessions.get('1').startTime = Date.now() - 60000;
    await progress.endSession('1');

    const exported = await progress.exportData();

    // 新实例导入（使用不同 DB 名称避免共享 mock 数据）
    const progress2 = new BookmarkLearningProgress({ bookmarks: sampleBookmarks, dbName: 'importTest2' });
    await progress2.init();
    const result = await progress2.importData(exported);
    assert.ok(result.imported >= 1);

    // 再次导入相同数据 — 应跳过重复
    const result2 = await progress2.importData(exported);
    assert.equal(result2.skipped, exported.sessions.length);
  });

  // ---- 测试 21: importData 无效数据抛错 ----
  it('21. importData 无效数据抛错', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();
    await assert.rejects(
      () => progress.importData(null),
      /invalid/i
    );
    await assert.rejects(
      () => progress.importData({ sessions: 'not-array' }),
      /invalid/i
    );
  });

  // ---- 测试 22: 不同难度预期时长 ----
  it('22. 不同难度等级有不同的预期时长', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    // beginner (React Tutorial) — 600s
    const bp1 = await progress.getBookmarkProgress('1');
    assert.equal(bp1.difficulty, 'beginner');
    assert.equal(bp1.expectedTime, 600);

    // nodejs "入门" = beginner
    const bp2 = await progress.getBookmarkProgress('2');
    assert.equal(bp2.difficulty, 'beginner');

    // Docker "架构" = advanced
    const bp5 = await progress.getBookmarkProgress('5');
    assert.equal(bp5.difficulty, 'advanced');
    assert.equal(bp5.expectedTime, 1800);
  });

  // ---- 测试 23: getCategoryProgress 无 clusterMap 使用默认 ----
  it('23. getCategoryProgress 不提供 clusterMap 使用 bookmarks 自身', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();

    const cp = await progress.getCategoryProgress('前端');
    // 没有 clusterMap 时，无法知道哪些书签属于"前端"
    // 应返回 totalBookmarks=0
    assert.equal(cp.totalBookmarks, 0);
    assert.equal(cp.studiedBookmarks, 0);
  });

  // ---- 测试 24: session 对象包含 id 字段 (IndexedDB autoIncrement) ----
  it('24. startSession 返回对象含 id 字段', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();
    const session = await progress.startSession('1');
    assert.ok(typeof session.id === 'number' || typeof session.id === 'object');
  });

  // ---- 测试 25: 多个书签独立会话 ----
  it('25. 多个书签可以同时有活跃会话', async () => {
    const progress = new BookmarkLearningProgress({ bookmarks: sampleBookmarks });
    await progress.init();
    const s1 = await progress.startSession('1');
    const s2 = await progress.startSession('2');
    assert.equal(s1.bookmarkId, '1');
    assert.equal(s2.bookmarkId, '2');

    const e1 = await progress.endSession('1');
    assert.ok(e1.duration >= 0);
    const e2 = await progress.endSession('2');
    assert.ok(e2.duration >= 0);
  });

  // ---- 测试 26: timedOut 标记 ----
  it('26. 超时结束会话标记 timedOut=true', async () => {
    const progress = new BookmarkLearningProgress({
      bookmarks: sampleBookmarks,
      timeoutMs: 1000,
    });
    await progress.init();
    await progress.startSession('1');
    await flushTimersAbove(1000);
    // 使用原始 setTimeout 等待异步操作完成
    await new Promise(r => originalSetTimeout(r, 50));

    const data = await progress.exportData();
    assert.equal(data.sessions.length, 1);
    assert.equal(data.sessions[0].timedOut, true);
  });

  // ---- 测试 27: expectedTime 三级映射 ----
  it('27. expectedTime 映射: beginner=600, intermediate=1200, advanced=1800', () => {
    assert.equal(BookmarkLearningProgress.EXPECTED_TIME.beginner, 600);
    assert.equal(BookmarkLearningProgress.EXPECTED_TIME.intermediate, 1200);
    assert.equal(BookmarkLearningProgress.EXPECTED_TIME.advanced, 1800);
  });
});
