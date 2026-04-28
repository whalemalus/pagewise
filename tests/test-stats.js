/**
 * Tests for Stats module
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _createStatsModule } from '../lib/stats.js';

function createMockStorage() {
  const store = {};
  return {
    async get(key) { return store[key] ? { [key]: store[key] } : {}; },
    async set(obj) { Object.assign(store, obj); },
    _store: store
  };
}

describe('Stats Module', () => {
  let stats;
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
    stats = _createStatsModule(storage);
  });

  describe('getStats', () => {
    it('returns default stats when empty', async () => {
      const s = await stats.getStats();
      assert.equal(s.totalQuestions, 0);
      assert.equal(s.totalKnowledgeEntries, 0);
      assert.equal(s.totalHighlights, 0);
      assert.equal(s.totalReviewSessions, 0);
      assert.equal(s.totalTokensUsed, 0);
      assert.deepEqual(s.skillUsage, {});
      assert.deepEqual(s.dailyUsage, {});
    });
  });

  describe('incrementCounter', () => {
    it('increments by 1 by default', async () => {
      await stats.incrementCounter('totalQuestions');
      const s = await stats.getStats();
      assert.equal(s.totalQuestions, 1);
    });

    it('increments by custom value', async () => {
      await stats.incrementCounter('totalTokensUsed', 500);
      const s = await stats.getStats();
      assert.equal(s.totalTokensUsed, 500);
    });

    it('accumulates multiple increments', async () => {
      await stats.incrementCounter('totalQuestions');
      await stats.incrementCounter('totalQuestions');
      await stats.incrementCounter('totalQuestions', 3);
      const s = await stats.getStats();
      assert.equal(s.totalQuestions, 5);
    });

    it('initializes non-existent numeric key to 0 then increments', async () => {
      await stats.incrementCounter('totalHighlights', 10);
      const s = await stats.getStats();
      assert.equal(s.totalHighlights, 10);
    });

    it('returns the new value', async () => {
      const val = await stats.incrementCounter('totalQuestions', 7);
      assert.equal(val, 7);
    });
  });

  describe('recordDailyUsage', () => {
    it('records questions for a day', async () => {
      await stats.recordDailyUsage('2026-04-26', { questions: 5 });
      const s = await stats.getStats();
      assert.equal(s.dailyUsage['2026-04-26'].questions, 5);
      assert.equal(s.dailyUsage['2026-04-26'].tokens, 0);
    });

    it('records tokens for a day', async () => {
      await stats.recordDailyUsage('2026-04-26', { tokens: 1234 });
      const s = await stats.getStats();
      assert.equal(s.dailyUsage['2026-04-26'].tokens, 1234);
    });

    it('accumulates daily usage', async () => {
      await stats.recordDailyUsage('2026-04-26', { questions: 3, tokens: 100 });
      await stats.recordDailyUsage('2026-04-26', { questions: 2, tokens: 200 });
      const s = await stats.getStats();
      assert.equal(s.dailyUsage['2026-04-26'].questions, 5);
      assert.equal(s.dailyUsage['2026-04-26'].tokens, 300);
    });

    it('records highlights', async () => {
      await stats.recordDailyUsage('2026-04-27', { highlights: 3 });
      const s = await stats.getStats();
      assert.equal(s.dailyUsage['2026-04-27'].highlights, 3);
    });
  });

  describe('recordSkillUsage', () => {
    it('records first use of a skill', async () => {
      await stats.recordSkillUsage('summarize');
      const s = await stats.getStats();
      assert.equal(s.skillUsage.summarize, 1);
    });

    it('accumulates skill usage', async () => {
      await stats.recordSkillUsage('summarize');
      await stats.recordSkillUsage('summarize');
      await stats.recordSkillUsage('explain');
      const s = await stats.getStats();
      assert.equal(s.skillUsage.summarize, 2);
      assert.equal(s.skillUsage.explain, 1);
    });
  });

  describe('getTopSkills', () => {
    it('returns empty array when no usage', async () => {
      const top = await stats.getTopSkills();
      assert.deepEqual(top, []);
    });

    it('returns skills sorted by count descending', async () => {
      await stats.recordSkillUsage('a');
      await stats.recordSkillUsage('a');
      await stats.recordSkillUsage('a');
      await stats.recordSkillUsage('b');
      await stats.recordSkillUsage('b');
      await stats.recordSkillUsage('c');
      const top = await stats.getTopSkills();
      assert.equal(top.length, 3);
      assert.equal(top[0].skillId, 'a');
      assert.equal(top[0].count, 3);
      assert.equal(top[1].skillId, 'b');
      assert.equal(top[1].count, 2);
      assert.equal(top[2].skillId, 'c');
      assert.equal(top[2].count, 1);
    });

    it('respects limit parameter', async () => {
      await stats.recordSkillUsage('a');
      await stats.recordSkillUsage('a');
      await stats.recordSkillUsage('b');
      await stats.recordSkillUsage('c');
      const top = await stats.getTopSkills(2);
      assert.equal(top.length, 2);
      assert.equal(top[0].skillId, 'a');
      assert.equal(top[1].skillId, 'b');
    });

    it('defaults to limit 5', async () => {
      for (let i = 0; i < 10; i++) {
        await stats.recordSkillUsage(`skill_${i}`);
      }
      const top = await stats.getTopSkills();
      assert.equal(top.length, 5);
    });
  });

  describe('getUsageTrend', () => {
    it('returns N days of data with zeros for missing days', async () => {
      const trend = await stats.getUsageTrend(7);
      assert.equal(trend.length, 7);
      for (const day of trend) {
        assert.ok(day.date);
        assert.equal(day.questions, 0);
        assert.equal(day.tokens, 0);
      }
    });

    it('includes data for today if recorded', async () => {
      const today = new Date().toISOString().split('T')[0];
      await stats.recordDailyUsage(today, { questions: 5, tokens: 100 });
      const trend = await stats.getUsageTrend(3);
      const todayEntry = trend.find(d => d.date === today);
      assert.ok(todayEntry);
      assert.equal(todayEntry.questions, 5);
      assert.equal(todayEntry.tokens, 100);
    });

    it('returns correct number of days', async () => {
      const trend = await stats.getUsageTrend(3);
      assert.equal(trend.length, 3);
    });
  });

  describe('resetStats', () => {
    it('resets all stats to default', async () => {
      await stats.incrementCounter('totalQuestions', 10);
      await stats.recordSkillUsage('test');
      await stats.resetStats();
      const s = await stats.getStats();
      assert.equal(s.totalQuestions, 0);
      assert.deepEqual(s.skillUsage, {});
    });
  });

  describe('lastUpdated', () => {
    it('sets lastUpdated on save', async () => {
      const before = Date.now();
      await stats.incrementCounter('totalQuestions');
      const s = await stats.getStats();
      assert.ok(s.lastUpdated >= before);
    });
  });
});
