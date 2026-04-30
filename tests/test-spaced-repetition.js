/**
 * test-spaced-repetition.js — 间隔复习模块单元测试
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNextReview,
  getDueCards,
  getDueCardCount,
  formatReviewDate,
  initializeReviewData,
  getReviewStreak,
  recordReviewDay,
  DIFFICULTY_MAP
} from '../lib/spaced-repetition.js';

describe('initializeReviewData', () => {
  it('应返回包含所有必要字段的默认对象', () => {
    const data = initializeReviewData();
    assert.equal(data.interval, 1);
    assert.equal(data.repetitions, 0);
    assert.equal(data.easeFactor, 2.5);
    assert.equal(typeof data.nextReview, 'number');
    assert.equal(typeof data.lastReview, 'number');
    assert.ok(data.nextReview > 0);
    assert.ok(data.lastReview > 0);
  });

  it('nextReview 和 lastReview 应约等于当前时间', () => {
    const before = Date.now();
    const data = initializeReviewData();
    const after = Date.now();
    assert.ok(data.nextReview >= before && data.nextReview <= after);
    assert.ok(data.lastReview >= before && data.lastReview <= after);
  });
});

describe('calculateNextReview', () => {
  it('quality=5 首次复习应设置 interval=1', () => {
    const current = { interval: 1, repetitions: 0, easeFactor: 2.5 };
    const result = calculateNextReview(5, current);
    assert.equal(result.interval, 1);
    assert.equal(result.repetitions, 1);
  });

  it('quality=5 第二次复习应设置 interval=6', () => {
    const current = { interval: 1, repetitions: 1, easeFactor: 2.5 };
    const result = calculateNextReview(5, current);
    assert.equal(result.interval, 6);
    assert.equal(result.repetitions, 2);
  });

  it('quality=5 第三次复习应按 easeFactor 计算间隔', () => {
    const current = { interval: 6, repetitions: 2, easeFactor: 2.5 };
    const result = calculateNextReview(5, current);
    // interval = round(6 * 2.5) = 15
    assert.equal(result.interval, 15);
    assert.equal(result.repetitions, 3);
  });

  it('quality=3（刚好及格）应算作成功', () => {
    const current = { interval: 1, repetitions: 0, easeFactor: 2.5 };
    const result = calculateNextReview(3, current);
    assert.equal(result.interval, 1);
    assert.equal(result.repetitions, 1);
  });

  it('quality=2（不及格）应重置间隔', () => {
    const current = { interval: 15, repetitions: 3, easeFactor: 2.5 };
    const result = calculateNextReview(2, current);
    assert.equal(result.interval, 1);
    assert.equal(result.repetitions, 0);
  });

  it('quality=0（完全忘记）应重置间隔', () => {
    const current = { interval: 30, repetitions: 5, easeFactor: 2.5 };
    const result = calculateNextReview(0, current);
    assert.equal(result.interval, 1);
    assert.equal(result.repetitions, 0);
  });

  it('easeFactor 不应低于 1.3', () => {
    const current = { interval: 1, repetitions: 0, easeFactor: 1.3 };
    const result = calculateNextReview(0, current);
    assert.ok(result.easeFactor >= 1.3);
  });

  it('quality=5 应增加 easeFactor', () => {
    const current = { interval: 1, repetitions: 0, easeFactor: 2.5 };
    const result = calculateNextReview(5, current);
    assert.ok(result.easeFactor > 2.5);
  });

  it('quality=0 应降低 easeFactor', () => {
    const current = { interval: 1, repetitions: 0, easeFactor: 2.5 };
    const result = calculateNextReview(0, current);
    assert.ok(result.easeFactor < 2.5);
  });

  it('nextReview 应等于当前时间 + interval 天', () => {
    const current = { interval: 1, repetitions: 1, easeFactor: 2.5 };
    const before = Date.now();
    const result = calculateNextReview(5, current);
    const after = Date.now();
    const expectedMin = before + result.interval * 86400000;
    const expectedMax = after + result.interval * 86400000;
    assert.ok(result.nextReview >= expectedMin);
    assert.ok(result.nextReview <= expectedMax);
  });

  it('quality 超出范围应被夹紧', () => {
    const current = { interval: 1, repetitions: 0, easeFactor: 2.5 };
    const result = calculateNextReview(10, current);
    // quality=10 被夹紧为 5，应成功
    assert.equal(result.repetitions, 1);

    const result2 = calculateNextReview(-5, current);
    // quality=-5 被夹紧为 0，应失败
    assert.equal(result2.repetitions, 0);
  });

  it('easeFactor 未定义时应使用默认值 2.5', () => {
    const current = { interval: 1, repetitions: 0 };
    const result = calculateNextReview(5, current);
    // 不应报错，且 easeFactor 应合理
    assert.ok(result.easeFactor > 2.0);
  });
});

describe('getDueCards', () => {
  it('应返回 nextReview <= 当前时间的条目', () => {
    const now = Date.now();
    const entries = [
      {
        id: 1,
        question: 'Q1',
        answer: 'A1',
        review: { interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: now - 1000, lastReview: now - 86400000 }
      },
      {
        id: 2,
        question: 'Q2',
        answer: 'A2',
        review: { interval: 10, repetitions: 3, easeFactor: 2.5, nextReview: now + 86400000 * 5, lastReview: now }
      }
    ];

    const due = getDueCards(entries);
    assert.equal(due.length, 1);
    assert.equal(due[0].id, 1);
  });

  it('应跳过没有 question 和 answer 的条目', () => {
    const now = Date.now();
    const entries = [
      { id: 1, question: '', answer: '', review: { nextReview: now - 1000 } },
      { id: 2, question: 'Q', answer: 'A', review: { nextReview: now - 1000 } }
    ];

    const due = getDueCards(entries);
    assert.equal(due.length, 1);
    assert.equal(due[0].id, 2);
  });

  it('没有 review 字段的条目应使用默认值（默认到期）', () => {
    const entries = [
      { id: 1, question: 'Q', answer: 'A' }
    ];

    const due = getDueCards(entries);
    assert.equal(due.length, 1);
    assert.equal(due[0].id, 1);
  });

  it('应按 nextReview 排序（最早的在前）', () => {
    const now = Date.now();
    const entries = [
      {
        id: 1, question: 'Q1', answer: 'A1',
        review: { nextReview: now - 3000, interval: 1, repetitions: 0, easeFactor: 2.5, lastReview: now }
      },
      {
        id: 2, question: 'Q2', answer: 'A2',
        review: { nextReview: now - 1000, interval: 1, repetitions: 0, easeFactor: 2.5, lastReview: now }
      },
      {
        id: 3, question: 'Q3', answer: 'A3',
        review: { nextReview: now - 2000, interval: 1, repetitions: 0, easeFactor: 2.5, lastReview: now }
      }
    ];

    const due = getDueCards(entries);
    assert.equal(due.length, 3);
    assert.equal(due[0].id, 1); // 最早到期
    assert.equal(due[1].id, 3);
    assert.equal(due[2].id, 2);
  });

  it('应遵守 limit 限制', () => {
    const now = Date.now();
    const entries = [];
    for (let i = 0; i < 30; i++) {
      entries.push({
        id: i,
        question: `Q${i}`,
        answer: `A${i}`,
        review: { nextReview: now - 1000, interval: 1, repetitions: 0, easeFactor: 2.5, lastReview: now }
      });
    }

    const due = getDueCards(entries, 5);
    assert.equal(due.length, 5);
  });

  it('默认 limit 应为 20', () => {
    const now = Date.now();
    const entries = [];
    for (let i = 0; i < 25; i++) {
      entries.push({
        id: i,
        question: `Q${i}`,
        answer: `A${i}`,
        review: { nextReview: now - 1000, interval: 1, repetitions: 0, easeFactor: 2.5, lastReview: now }
      });
    }

    const due = getDueCards(entries);
    assert.equal(due.length, 20);
  });

  it('没有到期卡片时应返回空数组', () => {
    const now = Date.now();
    const entries = [
      {
        id: 1, question: 'Q', answer: 'A',
        review: { nextReview: now + 86400000, interval: 1, repetitions: 0, easeFactor: 2.5, lastReview: now }
      }
    ];

    const due = getDueCards(entries);
    assert.equal(due.length, 0);
  });
});

describe('getDueCardCount', () => {
  it('应返回所有到期卡片数（不受默认 limit=20 限制）', () => {
    const now = Date.now();
    const entries = [];
    for (let i = 0; i < 50; i++) {
      entries.push({
        id: i,
        question: `Q${i}`,
        answer: `A${i}`,
        review: { nextReview: now - 1000, interval: 1, repetitions: 0, easeFactor: 2.5, lastReview: now }
      });
    }

    const count = getDueCardCount(entries);
    assert.equal(count, 50);
  });

  it('无到期卡片时返回 0', () => {
    const now = Date.now();
    const entries = [
      { id: 1, question: 'Q', answer: 'A', review: { nextReview: now + 86400000 } }
    ];
    assert.equal(getDueCardCount(entries), 0);
  });
});

describe('DIFFICULTY_MAP', () => {
  it('应包含 again/hard/good/easy 四个键', () => {
    assert.ok(DIFFICULTY_MAP.again);
    assert.ok(DIFFICULTY_MAP.hard);
    assert.ok(DIFFICULTY_MAP.good);
    assert.ok(DIFFICULTY_MAP.easy);
  });

  it('again 应映射到 quality=1', () => {
    assert.equal(DIFFICULTY_MAP.again.quality, 1);
  });

  it('hard 应映射到 quality=2', () => {
    assert.equal(DIFFICULTY_MAP.hard.quality, 2);
  });

  it('good 应映射到 quality=3', () => {
    assert.equal(DIFFICULTY_MAP.good.quality, 3);
  });

  it('easy 应映射到 quality=5', () => {
    assert.equal(DIFFICULTY_MAP.easy.quality, 5);
  });

  it('每个条目应有 label 和 emoji', () => {
    for (const key of ['again', 'hard', 'good', 'easy']) {
      assert.ok(DIFFICULTY_MAP[key].label, `${key} missing label`);
      assert.ok(DIFFICULTY_MAP[key].emoji, `${key} missing emoji`);
      assert.ok(DIFFICULTY_MAP[key].nextIntervalHint, `${key} missing nextIntervalHint`);
    }
  });
});

describe('formatReviewDate', () => {
  it('今天的时间戳应返回"今天"', () => {
    const now = Date.now();
    assert.equal(formatReviewDate(now), '今天');
  });

  it('明天的时间戳应返回"明天"', () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    assert.equal(formatReviewDate(tomorrow), '明天');
  });

  it('3 天后应返回"3 天后"', () => {
    const now = new Date();
    const future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).getTime();
    assert.equal(formatReviewDate(future), '3 天后');
  });

  it('昨天应返回"1 天前"', () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    assert.equal(formatReviewDate(yesterday), '1 天前');
  });

  it('超过 7 天应返回日期格式', () => {
    const now = new Date();
    const future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10).getTime();
    const result = formatReviewDate(future);
    // 应该包含"月"和"日"
    assert.ok(result.includes('月'));
    assert.ok(result.includes('日'));
  });
});

describe('getReviewStreak', () => {
  it('应返回包含 currentStreak/longestStreak/lastReviewDate 的对象', () => {
    const streak = getReviewStreak();
    assert.equal(typeof streak.currentStreak, 'number');
    assert.equal(typeof streak.longestStreak, 'number');
    // lastReviewDate 可以是 null 或 string
    assert.ok(streak.lastReviewDate === null || typeof streak.lastReviewDate === 'string');
  });
});

describe('recordReviewDay', () => {
  it('首次记录应设置 currentStreak=1', () => {
    // 清理 localStorage
    try { localStorage.clear(); } catch (_e) {}

    const streak = recordReviewDay();
    assert.equal(streak.currentStreak, 1);
    assert.equal(streak.longestStreak, 1);
    assert.ok(streak.lastReviewDate);
  });

  it('同一天重复调用不应增加 streak', () => {
    try { localStorage.clear(); } catch (_e) {}

    const first = recordReviewDay();
    const second = recordReviewDay();
    assert.equal(first.currentStreak, second.currentStreak);
    assert.equal(first.lastReviewDate, second.lastReviewDate);
  });
});
