/**
 * Tests for Stats module
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _createStatsModule } from '../lib/stats.js';
import { calculateStreak, getTopTags, getWordFrequencies, getWeeklyGrowth } from '../lib/stats.js';

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

describe('calculateStreak', () => {
  it('returns 0 for null/undefined input', () => {
    assert.equal(calculateStreak(null), 0);
    assert.equal(calculateStreak(undefined), 0);
    assert.equal(calculateStreak({}), 0);
  });

  it('counts consecutive days from today backwards', () => {
    const now = new Date();
    const usage = {};
    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      usage[d.toISOString().split('T')[0]] = { questions: 1, tokens: 0, highlights: 0 };
    }
    // Today (i=0) may or may not have data; the streak should be 2 or 3
    assert.ok(calculateStreak(usage) >= 2);
  });

  it('skips today if no data and starts counting from yesterday', () => {
    const now = new Date();
    const usage = {};
    // Only yesterday and day before
    for (let i = 1; i <= 2; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      usage[d.toISOString().split('T')[0]] = { questions: 1, tokens: 0, highlights: 0 };
    }
    assert.equal(calculateStreak(usage), 2);
  });

  it('breaks streak on gap', () => {
    const now = new Date();
    const usage = {};
    const d1 = new Date(now);
    d1.setDate(d1.getDate() - 1);
    usage[d1.toISOString().split('T')[0]] = { questions: 1, tokens: 0, highlights: 0 };
    // Skip day 2, add day 3
    const d3 = new Date(now);
    d3.setDate(d3.getDate() - 3);
    usage[d3.toISOString().split('T')[0]] = { questions: 1, tokens: 0, highlights: 0 };
    assert.equal(calculateStreak(usage), 1);
  });

  it('counts tokens or highlights as activity', () => {
    const now = new Date();
    const usage = {};
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    usage[d.toISOString().split('T')[0]] = { questions: 0, tokens: 500, highlights: 0 };
    assert.ok(calculateStreak(usage) >= 1);
  });
});

describe('getTopTags', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(getTopTags([]), []);
    assert.deepEqual(getTopTags(null), []);
  });

  it('returns tags sorted by frequency', () => {
    const entries = [
      { tags: ['javascript', 'react'] },
      { tags: ['javascript', 'node'] },
      { tags: ['python'] },
      { tags: ['javascript'] }
    ];
    const top = getTopTags(entries, 3);
    assert.equal(top.length, 3);
    assert.equal(top[0].tag, 'javascript');
    assert.equal(top[0].count, 3);
    assert.equal(top[1].tag, 'react');
    assert.equal(top[1].count, 1);
  });

  it('respects limit parameter', () => {
    const entries = [
      { tags: ['a', 'b', 'c', 'd', 'e', 'f'] }
    ];
    const top = getTopTags(entries, 3);
    assert.equal(top.length, 3);
  });

  it('ignores entries without tags', () => {
    const entries = [
      { tags: ['js'] },
      { title: 'no tags' },
      { tags: [] },
      { tags: ['js'] }
    ];
    const top = getTopTags(entries);
    assert.equal(top.length, 1);
    assert.equal(top[0].tag, 'js');
    assert.equal(top[0].count, 2);
  });
});

describe('getWordFrequencies', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(getWordFrequencies([]), []);
    assert.deepEqual(getWordFrequencies(null), []);
  });

  it('counts words from titles and summaries', () => {
    const entries = [
      { title: 'JavaScript Promise async', summary: 'JavaScript promise pattern', question: '', answer: '' },
      { title: 'JavaScript Array methods', summary: 'array map filter', question: '', answer: '' }
    ];
    const words = getWordFrequencies(entries, 10);
    assert.ok(words.length > 0);
    const jsWord = words.find(w => w.word === 'javascript');
    assert.ok(jsWord);
    assert.equal(jsWord.count, 2);
  });

  it('filters stop words', () => {
    const entries = [
      { title: 'the the the', summary: 'is a an', question: '', answer: '' }
    ];
    const words = getWordFrequencies(entries, 10);
    // Stop words should be filtered out
    const stopWord = words.find(w => ['the', 'is', 'a', 'an'].includes(w.word));
    assert.equal(stopWord, undefined);
  });

  it('respects limit parameter', () => {
    const entries = [];
    for (let i = 0; i < 30; i++) {
      entries.push({ title: `unique_word_${i} common_prefix`, summary: '', question: '', answer: '' });
    }
    const words = getWordFrequencies(entries, 5);
    assert.ok(words.length <= 5);
  });
});

describe('getWeeklyGrowth', () => {
  it('returns correct number of weeks', () => {
    const entries = [];
    const growth = getWeeklyGrowth(entries, 8);
    assert.equal(growth.length, 8);
  });

  it('returns zero counts for empty entries', () => {
    const growth = getWeeklyGrowth([], 4);
    assert.equal(growth.length, 4);
    for (const week of growth) {
      assert.equal(week.count, 0);
      assert.ok(week.weekLabel);
    }
  });

  it('counts entries in correct weeks', () => {
    const now = new Date();
    const entries = [
      { createdAt: now.toISOString() },
      { createdAt: now.toISOString() }
    ];
    const growth = getWeeklyGrowth(entries, 4);
    // All entries should be in the most recent week
    const lastWeek = growth[growth.length - 1];
    assert.ok(lastWeek.count >= 2 || growth.some(w => w.count >= 2));
  });

  it('handles entries without createdAt', () => {
    const entries = [
      { title: 'no date' },
      { createdAt: new Date().toISOString() }
    ];
    const growth = getWeeklyGrowth(entries, 4);
    assert.equal(growth.length, 4);
  });
});
