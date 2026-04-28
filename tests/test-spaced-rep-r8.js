/**
 * 测试 lib/spaced-repetition.js — SM-2 间隔复习调度
 *
 * 8 个场景覆盖：初始化、首次复习、多次递增、失败重置、到期筛选、空输入、日期格式化、过期处理
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { calculateNextReview, getDueCards, formatReviewDate, initializeReviewData } = await import('../lib/spaced-repetition.js');

// ==================== 间隔复习 ====================

describe('spaced-repetition', () => {

  // ---- 1. initializeReviewData 返回对象含 interval/ease/repetitions ----
  it('initializeReviewData 返回对象含 interval/ease/repetitions', () => {
    const data = initializeReviewData();
    assert.equal(typeof data.interval, 'number');
    assert.equal(data.interval, 1);
    assert.equal(typeof data.easeFactor, 'number');
    assert.equal(data.easeFactor, 2.5);
    assert.equal(typeof data.repetitions, 'number');
    assert.equal(data.repetitions, 0);
    assert.equal(typeof data.nextReview, 'number');
    assert.equal(typeof data.lastReview, 'number');
  });

  // ---- 2. calculateNextReview 第一次复习（repetitions=0） ----
  it('calculateNextReview 第一次复习（repetitions=0）间隔为 1 天', () => {
    const data = initializeReviewData();
    const result = calculateNextReview(4, data);
    assert.equal(result.interval, 1);
    assert.equal(result.repetitions, 1);
    assert.ok(result.nextReview > data.nextReview);
    // nextReview 应约为 now + 1 天
    const dayMs = 86400000;
    assert.ok(Math.abs(result.nextReview - Date.now() - dayMs) < 2000);
  });

  // ---- 3. calculateNextReview 多次复习后 interval 递增 ----
  it('calculateNextReview 多次复习后 interval 递增', () => {
    let data = initializeReviewData();
    // 第一次：quality=4 → interval=1
    data = calculateNextReview(4, data);
    assert.equal(data.interval, 1);
    assert.equal(data.repetitions, 1);

    // 第二次：quality=4 → interval=6（SM-2 第二次固定 6 天）
    data = calculateNextReview(4, data);
    assert.equal(data.interval, 6);
    assert.equal(data.repetitions, 2);

    // 第三次：quality=4 → interval = round(6 * easeFactor)
    data = calculateNextReview(4, data);
    assert.ok(data.interval > 6, `expected interval > 6, got ${data.interval}`);
    assert.equal(data.repetitions, 3);
  });

  // ---- 4. calculateNextReview quality=0 重置 ----
  it('calculateNextReview quality=0 重置 repetitions 和 interval', () => {
    let data = initializeReviewData();
    // 先做几次成功复习累积间隔
    data = calculateNextReview(5, data);
    data = calculateNextReview(5, data);
    data = calculateNextReview(5, data);
    assert.ok(data.interval > 1);
    assert.equal(data.repetitions, 3);

    // 质量=0：完全不记得，重置
    const result = calculateNextReview(0, data);
    assert.equal(result.repetitions, 0);
    assert.equal(result.interval, 1);
  });

  // ---- 5. getDueCards 筛选到期卡片 ----
  it('getDueCards 筛选到期卡片', () => {
    const now = Date.now();
    const entries = [
      {
        question: 'Q1',
        answer: 'A1',
        review: { nextReview: now - 1000 }  // 已到期
      },
      {
        question: 'Q2',
        answer: 'A2',
        review: { nextReview: now + 86400000 }  // 明天才到期
      },
      {
        question: 'Q3',
        answer: 'A3',
        review: { nextReview: now - 86400000 }  // 昨天就到期
      }
    ];

    const due = getDueCards(entries);
    assert.equal(due.length, 2);
    // 按 nextReview 排序，最早的在前
    assert.equal(due[0].question, 'Q3');
    assert.equal(due[1].question, 'Q1');
  });

  // ---- 6. getDueCards 空输入返回空 ----
  it('getDueCards 空输入返回空数组', () => {
    const result = getDueCards([]);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  // ---- 7. formatReviewDate 格式化日期 ----
  it('formatReviewDate 格式化日期', () => {
    const now = new Date();
    // 今天
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime();
    assert.equal(formatReviewDate(today), '今天');

    // 明天
    const tomorrow = today + 86400000;
    assert.equal(formatReviewDate(tomorrow), '明天');

    // 3 天后
    const threeDays = today + 3 * 86400000;
    assert.equal(formatReviewDate(threeDays), '3 天后');

    // 超过 7 天，格式为 X月Y日
    const farFuture = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 15, 12).getTime();
    const expected = `${new Date(farFuture).getMonth() + 1}月${new Date(farFuture).getDate()}日`;
    assert.equal(formatReviewDate(farFuture), expected);
  });

  // ---- 8. formatReviewDate 过期日期处理 ----
  it('formatReviewDate 过期日期返回 N 天前', () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime() - 86400000;
    assert.equal(formatReviewDate(yesterday), '1 天前');

    const fiveDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime() - 5 * 86400000;
    assert.equal(formatReviewDate(fiveDaysAgo), '5 天前');
  });

});
