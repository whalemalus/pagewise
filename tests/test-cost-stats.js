/**
 * Tests for Stats module — Cost tracking extensions
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

describe('Stats Cost Tracking', () => {
  let stats;
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
    stats = _createStatsModule(storage);
  });

  describe('default stats has cost fields', () => {
    it('has totalEstimatedCost field', async () => {
      const s = await stats.getStats();
      assert.equal(s.totalEstimatedCost, 0);
    });

    it('has cacheSavings field', async () => {
      const s = await stats.getStats();
      assert.equal(s.cacheSavings, 0);
    });

    it('has modelUsage field', async () => {
      const s = await stats.getStats();
      assert.deepEqual(s.modelUsage, {});
    });

    it('has dailyBudgetCents field', async () => {
      const s = await stats.getStats();
      assert.equal(s.dailyBudgetCents, 0);
    });

    it('has monthlyBudgetCents field', async () => {
      const s = await stats.getStats();
      assert.equal(s.monthlyBudgetCents, 0);
    });
  });

  describe('recordCost', () => {
    it('records cost for a model', async () => {
      await stats.recordCost('gpt-4o', 1000, 500);
      const s = await stats.getStats();
      assert.ok(s.totalEstimatedCost > 0);
      assert.ok(s.modelUsage['gpt-4o']);
      assert.equal(s.modelUsage['gpt-4o'].calls, 1);
      assert.equal(s.modelUsage['gpt-4o'].inputTokens, 1000);
      assert.equal(s.modelUsage['gpt-4o'].outputTokens, 500);
    });

    it('accumulates cost for same model', async () => {
      await stats.recordCost('gpt-4o', 1000, 500);
      await stats.recordCost('gpt-4o', 2000, 1000);
      const s = await stats.getStats();
      assert.equal(s.modelUsage['gpt-4o'].calls, 2);
      assert.equal(s.modelUsage['gpt-4o'].inputTokens, 3000);
      assert.equal(s.modelUsage['gpt-4o'].outputTokens, 1500);
    });

    it('tracks multiple models separately', async () => {
      await stats.recordCost('gpt-4o', 1000, 500);
      await stats.recordCost('claude-sonnet-4-6', 2000, 1000);
      const s = await stats.getStats();
      assert.ok(s.modelUsage['gpt-4o']);
      assert.ok(s.modelUsage['claude-sonnet-4-6']);
      assert.equal(s.modelUsage['gpt-4o'].calls, 1);
      assert.equal(s.modelUsage['claude-sonnet-4-6'].calls, 1);
    });

    it('records cost in daily usage', async () => {
      await stats.recordCost('gpt-4o', 1000, 500);
      const today = new Date().toISOString().split('T')[0];
      const s = await stats.getStats();
      assert.ok(s.dailyUsage[today].cost > 0);
    });
  });

  describe('recordCacheSaving', () => {
    it('records cache savings', async () => {
      await stats.recordCacheSaving('gpt-4o', 1000, 3);
      const s = await stats.getStats();
      assert.ok(s.cacheSavings > 0);
    });

    it('records savings in daily usage', async () => {
      await stats.recordCacheSaving('gpt-4o', 1000, 3);
      const today = new Date().toISOString().split('T')[0];
      const s = await stats.getStats();
      assert.ok(s.dailyUsage[today].cacheSavings > 0);
    });
  });

  describe('setBudget', () => {
    it('sets daily budget', async () => {
      await stats.setBudget({ dailyCents: 100 });
      const s = await stats.getStats();
      assert.equal(s.dailyBudgetCents, 100);
    });

    it('sets monthly budget', async () => {
      await stats.setBudget({ monthlyCents: 3000 });
      const s = await stats.getStats();
      assert.equal(s.monthlyBudgetCents, 3000);
    });

    it('sets both budgets', async () => {
      await stats.setBudget({ dailyCents: 100, monthlyCents: 3000 });
      const s = await stats.getStats();
      assert.equal(s.dailyBudgetCents, 100);
      assert.equal(s.monthlyBudgetCents, 3000);
    });

    it('preserves other fields when setting budget', async () => {
      await stats.incrementCounter('totalQuestions', 5);
      await stats.setBudget({ dailyCents: 100 });
      const s = await stats.getStats();
      assert.equal(s.totalQuestions, 5);
      assert.equal(s.dailyBudgetCents, 100);
    });
  });

  describe('getCostSummary', () => {
    it('returns cost summary with all fields', async () => {
      const summary = await stats.getCostSummary();
      assert.equal(typeof summary.todayCost, 'number');
      assert.equal(typeof summary.monthCost, 'number');
      assert.equal(typeof summary.totalCost, 'number');
      assert.equal(typeof summary.cacheSavings, 'number');
    });

    it('reflects recorded costs', async () => {
      await stats.recordCost('gpt-4o', 1000, 500);
      const summary = await stats.getCostSummary();
      assert.ok(summary.todayCost > 0);
      assert.ok(summary.totalCost > 0);
    });

    it('includes budget info when set', async () => {
      await stats.setBudget({ dailyCents: 500, monthlyCents: 10000 });
      const summary = await stats.getCostSummary();
      assert.equal(summary.dailyBudgetCents, 500);
      assert.equal(summary.monthlyBudgetCents, 10000);
    });
  });

  describe('getCostTrend', () => {
    it('returns 7 days of cost data by default', async () => {
      const trend = await stats.getCostTrend();
      assert.equal(trend.length, 7);
      for (const day of trend) {
        assert.ok(day.date);
        assert.equal(typeof day.cost, 'number');
        assert.equal(typeof day.cacheSavings, 'number');
      }
    });

    it('returns correct number of days', async () => {
      const trend = await stats.getCostTrend(14);
      assert.equal(trend.length, 14);
    });

    it('includes cost for days with data', async () => {
      await stats.recordCost('gpt-4o', 1000, 500);
      const trend = await stats.getCostTrend(3);
      const today = trend[trend.length - 1];
      assert.ok(today.cost > 0);
    });
  });

  describe('backward compatibility', () => {
    it('handles stored stats without cost fields', async () => {
      // Simulate old data format
      storage._store.pagewise_stats = {
        totalQuestions: 10,
        totalTokensUsed: 5000,
        skillUsage: {},
        dailyUsage: {},
        lastUpdated: Date.now()
      };

      const s = await stats.getStats();
      assert.equal(s.totalQuestions, 10);
      assert.equal(s.totalEstimatedCost, 0);
      assert.equal(s.cacheSavings, 0);
      assert.deepEqual(s.modelUsage, {});
    });

    it('handles stored dailyUsage without cost field', async () => {
      storage._store.pagewise_stats = {
        totalQuestions: 5,
        totalTokensUsed: 1000,
        skillUsage: {},
        dailyUsage: {
          '2026-04-29': { questions: 3, tokens: 500 }
        },
        lastUpdated: Date.now()
      };

      const today = new Date().toISOString().split('T')[0];
      const trend = await stats.getCostTrend(3);
      // Should not throw, dailyUsage entries without cost should default to 0
      for (const day of trend) {
        assert.equal(typeof day.cost, 'number');
      }
    });
  });
});
