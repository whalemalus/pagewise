/**
 * test-review-session.js — 复习会话管理模块单元测试
 *
 * 覆盖: ReviewSession 类（start/recordCard/finish/getStats）、
 *       saveSession / getRecentSessions / getWeeklyStats / getSessionHistory
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ==================== chrome.storage.local Mock ====================

let storageData = {};

const mockChrome = {
  storage: {
    local: {
      get: async (key) => {
        if (typeof key === 'string') {
          return { [key]: storageData[key] || undefined };
        }
        if (Array.isArray(key)) {
          const result = {};
          for (const k of key) {
            if (storageData[k] !== undefined) result[k] = storageData[k];
          }
          return result;
        }
        return {};
      },
      set: async (items) => {
        Object.assign(storageData, items);
      },
      remove: async (key) => {
        if (typeof key === 'string') delete storageData[key];
      }
    }
  }
};

globalThis.chrome = mockChrome;

// 动态导入模块
const { ReviewSession, saveSession, getRecentSessions, getWeeklyStats, getSessionHistory, SESSIONS_KEY, MAX_SESSIONS } = await import('../lib/review-session.js');

// ==================== ReviewSession 类 ====================

describe('ReviewSession 类', () => {

  beforeEach(() => {
    storageData = {};
  });

  it('new ReviewSession() 应创建未激活的会话', () => {
    const session = new ReviewSession();
    assert.equal(session.isActive, false);
    assert.equal(session.totalCards, 0);
    assert.equal(session.correctCards, 0);
    assert.equal(session.tagFilter, null);
    assert.ok(Array.isArray(session.cardDetails));
    assert.equal(session.cardDetails.length, 0);
  });

  it('start() 应激活会话并记录开始时间', () => {
    const session = new ReviewSession();
    const before = Date.now();
    session.start();
    const after = Date.now();

    assert.equal(session.isActive, true);
    assert.ok(session.startTime >= before && session.startTime <= after);
  });

  it('start("javascript") 应设置标签过滤', () => {
    const session = new ReviewSession();
    session.start('javascript');
    assert.equal(session.tagFilter, 'javascript');
  });

  it('start() 不带参数应清除标签过滤', () => {
    const session = new ReviewSession();
    session.start('python');
    assert.equal(session.tagFilter, 'python');
    session.start();
    assert.equal(session.tagFilter, null);
  });

  it('recordCard() 应累计卡片统计', () => {
    const session = new ReviewSession();
    session.start();

    session.recordCard({ entryId: 'e1', quality: 3, interval: 1, nextReview: Date.now() + 86400000 });
    assert.equal(session.totalCards, 1);
    assert.equal(session.correctCards, 1); // quality >= 3

    session.recordCard({ entryId: 'e2', quality: 1, interval: 1, nextReview: Date.now() + 86400000 });
    assert.equal(session.totalCards, 2);
    assert.equal(session.correctCards, 1); // quality < 3 不算正确

    session.recordCard({ entryId: 'e3', quality: 5, interval: 6, nextReview: Date.now() + 6 * 86400000 });
    assert.equal(session.totalCards, 3);
    assert.equal(session.correctCards, 2);
  });

  it('recordCard() 应存储卡片详情', () => {
    const session = new ReviewSession();
    session.start();

    session.recordCard({ entryId: 'e1', quality: 3, interval: 1, nextReview: 1000 });
    session.recordCard({ entryId: 'e2', quality: 1, interval: 1, nextReview: 2000 });

    assert.equal(session.cardDetails.length, 2);
    assert.equal(session.cardDetails[0].entryId, 'e1');
    assert.equal(session.cardDetails[0].quality, 3);
    assert.equal(session.cardDetails[1].entryId, 'e2');
    assert.equal(session.cardDetails[1].quality, 1);
  });

  it('getStats() 应返回当前统计', () => {
    const session = new ReviewSession();
    session.start();

    session.recordCard({ entryId: 'e1', quality: 3, interval: 1, nextReview: 1000 });
    session.recordCard({ entryId: 'e2', quality: 1, interval: 1, nextReview: 2000 });

    const stats = session.getStats();
    assert.equal(stats.totalCards, 2);
    assert.equal(stats.correctCards, 1);
    assert.equal(stats.accuracy, 50);
    assert.equal(typeof stats.elapsed, 'number');
    assert.ok(stats.elapsed >= 0);
  });

  it('getStats() 无卡片时准确率为 0', () => {
    const session = new ReviewSession();
    session.start();

    const stats = session.getStats();
    assert.equal(stats.totalCards, 0);
    assert.equal(stats.accuracy, 0);
  });

  it('finish() 应结束会话并返回 SessionRecord', () => {
    const session = new ReviewSession();
    const before = Date.now();
    session.start('react');

    session.recordCard({ entryId: 'e1', quality: 3, interval: 1, nextReview: 1000 });
    session.recordCard({ entryId: 'e2', quality: 5, interval: 6, nextReview: 2000 });

    const record = session.finish();
    const after = Date.now();

    assert.equal(session.isActive, false);
    assert.ok(record.id, '应有 id');
    assert.ok(record.startTime >= before && record.startTime <= after);
    assert.ok(record.endTime >= record.startTime);
    assert.ok(record.duration >= 0);
    assert.equal(record.totalCards, 2);
    assert.equal(record.correctCards, 2);
    assert.equal(record.accuracy, 100);
    assert.equal(record.tagFilter, 'react');
    assert.equal(record.cardDetails.length, 2);
  });

  it('finish() 未 start 应抛出错误', () => {
    const session = new ReviewSession();
    assert.throws(() => session.finish(), /未激活/);
  });

  it('recordCard() 未 start 应抛出错误', () => {
    const session = new ReviewSession();
    assert.throws(
      () => session.recordCard({ entryId: 'e1', quality: 3, interval: 1, nextReview: 1000 }),
      /未激活/
    );
  });

  it('重复 start() 应重置会话', () => {
    const session = new ReviewSession();
    session.start();
    session.recordCard({ entryId: 'e1', quality: 3, interval: 1, nextReview: 1000 });

    session.start(); // 重置
    assert.equal(session.totalCards, 0);
    assert.equal(session.cardDetails.length, 0);
  });
});

// ==================== 存储函数 ====================

describe('saveSession', () => {

  beforeEach(() => {
    storageData = {};
  });

  it('应将 SessionRecord 保存到 storage', async () => {
    const record = {
      id: 'test-1',
      startTime: Date.now(),
      endTime: Date.now() + 1000,
      duration: 1000,
      totalCards: 5,
      correctCards: 3,
      accuracy: 60,
      tagFilter: null,
      cardDetails: []
    };

    await saveSession(record);
    const stored = await chrome.storage.local.get(SESSIONS_KEY);
    const sessions = stored[SESSIONS_KEY];
    assert.ok(Array.isArray(sessions));
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, 'test-1');
  });

  it('新会话应添加到列表最前面', async () => {
    const record1 = { id: 'first', startTime: 100, endTime: 200, duration: 100, totalCards: 1, correctCards: 0, accuracy: 0, tagFilter: null, cardDetails: [] };
    const record2 = { id: 'second', startTime: 200, endTime: 300, duration: 100, totalCards: 2, correctCards: 1, accuracy: 50, tagFilter: null, cardDetails: [] };

    await saveSession(record1);
    await saveSession(record2);

    const stored = await chrome.storage.local.get(SESSIONS_KEY);
    assert.equal(stored[SESSIONS_KEY].length, 2);
    assert.equal(stored[SESSIONS_KEY][0].id, 'second');
    assert.equal(stored[SESSIONS_KEY][1].id, 'first');
  });

  it('应限制最大存储数量', async () => {
    const sessions = [];
    for (let i = 0; i < MAX_SESSIONS + 10; i++) {
      sessions.push({
        id: `s-${i}`,
        startTime: i * 100,
        endTime: i * 100 + 50,
        duration: 50,
        totalCards: 1,
        correctCards: 1,
        accuracy: 100,
        tagFilter: null,
        cardDetails: []
      });
    }
    storageData[SESSIONS_KEY] = sessions;

    const newRecord = {
      id: 'new-session',
      startTime: 9999,
      endTime: 10000,
      duration: 1,
      totalCards: 1,
      correctCards: 0,
      accuracy: 0,
      tagFilter: null,
      cardDetails: []
    };
    await saveSession(newRecord);

    const stored = await chrome.storage.local.get(SESSIONS_KEY);
    assert.ok(stored[SESSIONS_KEY].length <= MAX_SESSIONS);
    assert.equal(stored[SESSIONS_KEY][0].id, 'new-session');
  });
});

describe('getRecentSessions', () => {

  beforeEach(() => {
    storageData = {};
  });

  it('无数据时返回空数组', async () => {
    const sessions = await getRecentSessions();
    assert.ok(Array.isArray(sessions));
    assert.equal(sessions.length, 0);
  });

  it('应返回最近的会话列表', async () => {
    const records = [];
    for (let i = 0; i < 5; i++) {
      records.push({
        id: `s-${i}`,
        startTime: i * 1000,
        endTime: i * 1000 + 500,
        duration: 500,
        totalCards: i + 1,
        correctCards: i,
        accuracy: Math.round((i / (i + 1)) * 100),
        tagFilter: null,
        cardDetails: []
      });
    }
    storageData[SESSIONS_KEY] = records;

    const sessions = await getRecentSessions();
    assert.equal(sessions.length, 5);
  });

  it('应支持 limit 参数', async () => {
    const records = [];
    for (let i = 0; i < 10; i++) {
      records.push({ id: `s-${i}`, startTime: i, endTime: i, duration: 0, totalCards: 0, correctCards: 0, accuracy: 0, tagFilter: null, cardDetails: [] });
    }
    storageData[SESSIONS_KEY] = records;

    const sessions = await getRecentSessions(3);
    assert.equal(sessions.length, 3);
  });
});

describe('getWeeklyStats', () => {

  beforeEach(() => {
    storageData = {};
  });

  it('无数据时应返回零值', async () => {
    const stats = await getWeeklyStats();
    assert.equal(stats.totalSessions, 0);
    assert.equal(stats.totalCards, 0);
    assert.equal(stats.totalCorrect, 0);
    assert.equal(stats.avgAccuracy, 0);
  });

  it('应汇总本周的会话数据', async () => {
    const now = Date.now();
    const dayMs = 86400000;

    // 创建本周内 3 个会话
    const records = [
      { id: 's1', startTime: now - dayMs, endTime: now - dayMs + 1000, duration: 1000, totalCards: 5, correctCards: 4, accuracy: 80, tagFilter: null, cardDetails: [] },
      { id: 's2', startTime: now - dayMs * 2, endTime: now - dayMs * 2 + 1000, duration: 1000, totalCards: 3, correctCards: 3, accuracy: 100, tagFilter: null, cardDetails: [] },
      { id: 's3', startTime: now, endTime: now + 1000, duration: 1000, totalCards: 4, correctCards: 2, accuracy: 50, tagFilter: null, cardDetails: [] },
    ];
    storageData[SESSIONS_KEY] = records;

    const stats = await getWeeklyStats();
    // 至少应有今天和昨天的会话
    assert.ok(stats.totalSessions >= 2);
    assert.ok(stats.totalCards >= 7);
  });

  it('7 天前的会话不应纳入本周统计', async () => {
    const now = Date.now();
    const dayMs = 86400000;

    const records = [
      { id: 'old', startTime: now - dayMs * 10, endTime: now - dayMs * 10 + 1000, duration: 1000, totalCards: 100, correctCards: 100, accuracy: 100, tagFilter: null, cardDetails: [] },
    ];
    storageData[SESSIONS_KEY] = records;

    const stats = await getWeeklyStats();
    assert.equal(stats.totalSessions, 0);
    assert.equal(stats.totalCards, 0);
  });
});

describe('getSessionHistory', () => {

  beforeEach(() => {
    storageData = {};
  });

  it('应返回完整的会话历史', async () => {
    const records = [
      { id: 's1', startTime: 100, endTime: 200, duration: 100, totalCards: 1, correctCards: 1, accuracy: 100, tagFilter: null, cardDetails: [] },
      { id: 's2', startTime: 200, endTime: 300, duration: 100, totalCards: 2, correctCards: 1, accuracy: 50, tagFilter: null, cardDetails: [] },
    ];
    storageData[SESSIONS_KEY] = records;

    const history = await getSessionHistory();
    assert.equal(history.length, 2);
    assert.equal(history[0].id, 's1');
    assert.equal(history[1].id, 's2');
  });

  it('无数据时返回空数组', async () => {
    const history = await getSessionHistory();
    assert.ok(Array.isArray(history));
    assert.equal(history.length, 0);
  });
});
