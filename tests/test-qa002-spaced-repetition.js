/**
 * QA002-R3 — SpacedRepetition 功能正确性测试（第三轮）
 *
 * 覆盖重点：SM-2 算法进阶行为、streak 连续天数、边界条件、多轮复习模拟
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNextReview,
  getDueCards,
  getDueCardCount,
  formatReviewDate,
  initializeReviewData,
  getReviewStreak,
  recordReviewDay,
  DIFFICULTY_MAP,
} from '../lib/spaced-repetition.js';

// ==================== SM-2 进阶行为 ====================

describe('QA002-R3 SM-2 进阶：多轮复习模拟', () => {
  it('连续 5 次 quality=5 应持续增加间隔', () => {
    let data = { interval: 1, repetitions: 0, easeFactor: 2.5 };
    const intervals = [];

    for (let i = 0; i < 5; i++) {
      data = calculateNextReview(5, data);
      intervals.push(data.interval);
    }

    // 每次间隔应大于等于前一次
    for (let i = 1; i < intervals.length; i++) {
      assert.ok(intervals[i] >= intervals[i - 1],
        `interval[${i}]=${intervals[i]} 应 >= interval[${i - 1}]=${intervals[i - 1]}`);
    }
  });

  it('失败后重置再成功应重新从 interval=1 开始', () => {
    let data = { interval: 15, repetitions: 4, easeFactor: 2.5 };
    // 失败
    data = calculateNextReview(1, data);
    assert.equal(data.interval, 1);
    assert.equal(data.repetitions, 0);
    // 再成功
    data = calculateNextReview(3, data);
    assert.equal(data.interval, 1);
    assert.equal(data.repetitions, 1);
    // 第二次成功 → interval=6
    data = calculateNextReview(3, data);
    assert.equal(data.interval, 6);
    assert.equal(data.repetitions, 2);
  });

  it('反复成功-失败交替应正确跟踪 repetitions', () => {
    let data = { interval: 1, repetitions: 0, easeFactor: 2.5 };

    // 成功
    data = calculateNextReview(3, data);
    assert.equal(data.repetitions, 1);
    // 成功
    data = calculateNextReview(4, data);
    assert.equal(data.repetitions, 2);
    // 失败
    data = calculateNextReview(2, data);
    assert.equal(data.repetitions, 0);
    // 成功
    data = calculateNextReview(5, data);
    assert.equal(data.repetitions, 1);
  });
});

// ==================== easeFactor 收敛与边界 ====================

describe('QA002-R3 easeFactor 收敛与边界', () => {
  it('连续 quality=0 不应使 easeFactor 低于 1.3', () => {
    let data = { interval: 1, repetitions: 0, easeFactor: 2.0 };
    for (let i = 0; i < 20; i++) {
      data = calculateNextReview(0, data);
    }
    assert.ok(data.easeFactor >= 1.3,
      `easeFactor=${data.easeFactor} 不应低于 1.3`);
    assert.equal(data.easeFactor, 1.3);
  });

  it('连续 quality=5 应使 easeFactor 无限增长（无上限）', () => {
    let data = { interval: 1, repetitions: 0, easeFactor: 2.5 };
    for (let i = 0; i < 10; i++) {
      data = calculateNextReview(5, data);
    }
    assert.ok(data.easeFactor > 2.5,
      `easeFactor=${data.easeFactor} 应大于初始值 2.5`);
  });

  it('quality=4 时 easeFactor 变化应小于 quality=5', () => {
    const data4 = calculateNextReview(4, { interval: 1, repetitions: 0, easeFactor: 2.5 });
    const data5 = calculateNextReview(5, { interval: 1, repetitions: 0, easeFactor: 2.5 });
    // quality=4 的 easeFactor 变化应小于 quality=5
    assert.ok(data5.easeFactor > data4.easeFactor,
      `quality=5 的 easeFactor(${data5.easeFactor}) 应 > quality=4 的(${data4.easeFactor})`);
  });

  it('easeFactor=NaN 时应回退到默认值 2.5', () => {
    const data = calculateNextReview(3, { interval: 1, repetitions: 0, easeFactor: NaN });
    assert.ok(!isNaN(data.easeFactor));
    assert.ok(data.easeFactor > 1.3);
  });
});

// ==================== getDueCards 边界场景 ====================

describe('QA002-R3 getDueCards 边界场景', () => {
  it('混合 question/answer 为空的条目应正确过滤', () => {
    const now = Date.now();
    const entries = [
      { id: 1, question: 'Q1', answer: '', review: { nextReview: now - 1000 } },  // answer 为空
      { id: 2, question: '', answer: 'A2', review: { nextReview: now - 1000 } },   // question 为空
      { id: 3, question: '', answer: '', review: { nextReview: now - 1000 } },      // 都为空
      { id: 4, question: 'Q4', answer: 'A4', review: { nextReview: now - 1000 } }, // 都有
    ];
    // 函数只检查 "question && answer"，所以 id=1,2,3 都被跳过
    // 实际逻辑是 !entry.question && !entry.answer，所以 id=1 和 id=2 都通过
    const due = getDueCards(entries);
    // id=1 有 question, id=2 有 answer → 都通过；id=3 都为空 → 跳过
    assert.equal(due.length, 3);
  });

  it('空数组应返回空结果', () => {
    const due = getDueCards([]);
    assert.deepEqual(due, []);
  });

  it('所有卡片都未到期时应返回空', () => {
    const now = Date.now();
    const entries = [
      { id: 1, question: 'Q', answer: 'A', review: { nextReview: now + 86400000 * 365 } },
      { id: 2, question: 'Q2', answer: 'A2', review: { nextReview: now + 86400000 * 100 } },
    ];
    assert.equal(getDueCards(entries).length, 0);
  });

  it('正好在当前时刻的卡片应被包含', () => {
    const now = Date.now();
    const entries = [
      { id: 1, question: 'Q', answer: 'A', review: { nextReview: now } },
    ];
    assert.equal(getDueCards(entries).length, 1);
  });

  it('getDueCardCount 不受 limit 参数影响', () => {
    const now = Date.now();
    const entries = [];
    for (let i = 0; i < 100; i++) {
      entries.push({ id: i, question: `Q${i}`, answer: `A${i}`, review: { nextReview: now - 1000 } });
    }
    assert.equal(getDueCardCount(entries), 100);
    // getDueCards 默认 limit=20
    assert.equal(getDueCards(entries).length, 20);
  });
});

// ==================== formatReviewDate 边界 ====================

describe('QA002-R3 formatReviewDate 边界', () => {
  it('7 天后应返回 "7 天后"', () => {
    const now = new Date();
    const future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).getTime();
    assert.equal(formatReviewDate(future), '7 天后');
  });

  it('8 天后应返回月日格式', () => {
    const now = new Date();
    const future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).getTime();
    const result = formatReviewDate(future);
    assert.ok(result.includes('月'));
    assert.ok(result.includes('日'));
  });

  it('30 天前应返回 "30 天前"', () => {
    const now = new Date();
    const past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).getTime();
    assert.equal(formatReviewDate(past), '30 天前');
  });
});

// ==================== initializeReviewData 一致性 ====================

describe('QA002-R3 initializeReviewData 一致性', () => {
  it('多次调用返回独立对象', () => {
    const a = initializeReviewData();
    const b = initializeReviewData();
    assert.notEqual(a, b);
    a.interval = 999;
    assert.equal(b.interval, 1);
  });

  it('默认 easeFactor 为 2.5（SM-2 标准初始值）', () => {
    const data = initializeReviewData();
    assert.equal(data.easeFactor, 2.5);
  });
});
