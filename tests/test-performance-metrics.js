import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  addLog, getLogs, clearLogs,
  recordMetric, getMetrics, getMetricsByCategory, getRecentMetrics,
  getPerformanceStats, clearMetrics
} from '../lib/log-store.js';

beforeEach(() => {
  clearLogs();
  clearMetrics();
});

describe('performance metrics', () => {

  describe('recordMetric', () => {
    it('records a metric entry with correct fields', () => {
      const entry = recordMetric('api', 150.5);
      assert.ok(entry);
      assert.ok(typeof entry.id === 'string');
      assert.ok(entry.id.length > 0);
      assert.ok(typeof entry.timestamp === 'number');
      assert.ok(entry.timestamp > 0);
      assert.equal(entry.category, 'api');
      assert.equal(entry.durationMs, 150.5);
      assert.equal(entry.data, null);
    });

    it('rounds durationMs to two decimal places', () => {
      const entry = recordMetric('extraction', 123.456789);
      assert.equal(entry.durationMs, 123.46);
    });

    it('serializes data as JSON string', () => {
      const entry = recordMetric('rendering', 10, { type: 'update', length: 500 });
      assert.equal(typeof entry.data, 'string');
      assert.ok(entry.data.includes('"type":"update"'));
      assert.ok(entry.data.includes('500'));
    });

    it('truncates data to 300 chars', () => {
      const longData = { text: 'x'.repeat(400) };
      const entry = recordMetric('api', 50, longData);
      assert.ok(entry.data.length <= 300);
    });
  });

  describe('getMetrics', () => {
    it('returns empty array when no metrics exist', () => {
      assert.deepEqual(getMetrics(), []);
    });

    it('returns all recorded metrics', () => {
      recordMetric('api', 100);
      recordMetric('extraction', 50);
      recordMetric('rendering', 5);
      assert.equal(getMetrics().length, 3);
    });

    it('returns a copy (mutating does not affect internal)', () => {
      recordMetric('api', 100);
      const copy = getMetrics();
      copy.push({ fake: true });
      assert.equal(getMetrics().length, 1);
    });
  });

  describe('getMetricsByCategory', () => {
    it('filters metrics by category', () => {
      recordMetric('api', 100);
      recordMetric('api', 200);
      recordMetric('extraction', 50);
      const apiMetrics = getMetricsByCategory('api');
      assert.equal(apiMetrics.length, 2);
      assert.ok(apiMetrics.every(m => m.category === 'api'));
    });

    it('returns empty for non-existent category', () => {
      recordMetric('api', 100);
      assert.deepEqual(getMetricsByCategory('nonexistent'), []);
    });
  });

  describe('getRecentMetrics', () => {
    it('returns last N metrics', () => {
      for (let i = 0; i < 30; i++) {
        recordMetric('api', i * 10);
      }
      const recent = getRecentMetrics(10);
      assert.equal(recent.length, 10);
      // Should be the last 10 (20-29)
      assert.equal(recent[0].durationMs, 200);
      assert.equal(recent[9].durationMs, 290);
    });

    it('returns all if count < N', () => {
      recordMetric('api', 100);
      recordMetric('api', 200);
      const recent = getRecentMetrics(10);
      assert.equal(recent.length, 2);
    });

    it('filters by category when specified', () => {
      recordMetric('api', 100);
      recordMetric('extraction', 50);
      recordMetric('api', 200);
      recordMetric('rendering', 5);
      const recentApi = getRecentMetrics(20, 'api');
      assert.equal(recentApi.length, 2);
      assert.ok(recentApi.every(m => m.category === 'api'));
    });

    it('defaults to 20 items', () => {
      for (let i = 0; i < 25; i++) {
        recordMetric('api', i);
      }
      assert.equal(getRecentMetrics().length, 20);
    });
  });

  describe('getPerformanceStats', () => {
    it('returns zeros for empty metrics', () => {
      const stats = getPerformanceStats();
      assert.equal(stats.avg, 0);
      assert.equal(stats.p50, 0);
      assert.equal(stats.p95, 0);
      assert.equal(stats.count, 0);
      assert.equal(stats.min, 0);
      assert.equal(stats.max, 0);
    });

    it('calculates correct stats for single entry', () => {
      recordMetric('api', 42);
      const stats = getPerformanceStats('api');
      assert.equal(stats.avg, 42);
      assert.equal(stats.p50, 42);
      assert.equal(stats.p95, 42);
      assert.equal(stats.count, 1);
      assert.equal(stats.min, 42);
      assert.equal(stats.max, 42);
    });

    it('calculates correct avg, min, max', () => {
      recordMetric('api', 100);
      recordMetric('api', 200);
      recordMetric('api', 300);
      const stats = getPerformanceStats('api');
      assert.equal(stats.avg, 200);
      assert.equal(stats.min, 100);
      assert.equal(stats.max, 300);
      assert.equal(stats.count, 3);
    });

    it('calculates correct p50 (median)', () => {
      // 10 values: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
      for (let i = 1; i <= 10; i++) {
        recordMetric('api', i * 10);
      }
      const stats = getPerformanceStats('api');
      // p50 at index floor(10 * 0.5) = 5 => value 60 (0-indexed)
      assert.equal(stats.p50, 60);
    });

    it('calculates correct p95', () => {
      // 20 values: 10, 20, ..., 200
      for (let i = 1; i <= 20; i++) {
        recordMetric('api', i * 10);
      }
      const stats = getPerformanceStats('api');
      // p95 at index floor(20 * 0.95) = 19 => value 200 (0-indexed)
      assert.equal(stats.p95, 200);
    });

    it('filters by category when specified', () => {
      recordMetric('api', 100);
      recordMetric('api', 200);
      recordMetric('extraction', 5000);
      const apiStats = getPerformanceStats('api');
      assert.equal(apiStats.count, 2);
      assert.equal(apiStats.avg, 150);
      assert.equal(apiStats.max, 200);

      const extStats = getPerformanceStats('extraction');
      assert.equal(extStats.count, 1);
      assert.equal(extStats.avg, 5000);
    });

    it('returns zeros for non-existent category', () => {
      recordMetric('api', 100);
      const stats = getPerformanceStats('nonexistent');
      assert.equal(stats.count, 0);
      assert.equal(stats.avg, 0);
    });
  });

  describe('clearMetrics', () => {
    it('clears all metrics', () => {
      recordMetric('api', 100);
      recordMetric('extraction', 50);
      recordMetric('rendering', 5);
      assert.equal(getMetrics().length, 3);
      clearMetrics();
      assert.equal(getMetrics().length, 0);
    });
  });

  describe('MAX_METRICS limit', () => {
    it('keeps only the last 100 metrics', () => {
      for (let i = 0; i < 110; i++) {
        recordMetric('api', i);
      }
      const metrics = getMetrics();
      assert.equal(metrics.length, 100);
      // First entry should be 10 (entries 0-9 dropped)
      assert.equal(metrics[0].durationMs, 10);
      assert.equal(metrics[99].durationMs, 109);
    });
  });

  describe('integration with logs', () => {
    it('metrics are independent from logs (separate arrays)', () => {
      addLog('info', 'test', 'log message');
      recordMetric('api', 150);
      assert.equal(getLogs().length, 1);
      assert.equal(getMetrics().length, 1);
      clearLogs();
      assert.equal(getLogs().length, 0);
      assert.equal(getMetrics().length, 1); // metrics not affected
    });
  });
});
