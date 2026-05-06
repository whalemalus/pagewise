/**
 * 测试 lib/bookmark-stats.js — BookmarkStatistics 统计仪表盘
 *
 * 测试范围:
 *   getTrend — 日/周/月聚合趋势
 *   getDistribution — 按文件夹第一级分组
 *   getHeatmap — 7×24 活跃度矩阵
 *   getSummary — 总览摘要
 *
 * AC: 单元测试 ≥ 8 个测试用例
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkStatistics } = await import('../lib/bookmark-stats.js');

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

/** 返回指定 UTC 时间戳的 ms (方便构造可控日期) */
function utcMs(year, month, day, hour = 0, minute = 0) {
  return Date.UTC(year, month - 1, day, hour, minute);
}

// ==================== 样本数据 ====================

const sampleBookmarks = [
  createBookmark('1', 'React Hooks', 'https://react.dev/hooks', ['前端', 'React'], ['react']),
  createBookmark('2', 'Node.js Docs', 'https://nodejs.org/docs', ['后端', 'Node'], ['node']),
  createBookmark('3', 'Python ML', 'https://python.org/ml', ['AI', 'ML'], ['python']),
  createBookmark('4', 'CSS Grid', 'https://css-tricks.com/grid', ['前端', 'CSS'], ['css']),
  createBookmark('5', 'Docker Guide', 'https://docker.com/arch', ['DevOps'], ['docker']),
];

// ==================== 构造函数 ====================

describe('BookmarkStatistics constructor', () => {
  it('should accept empty array (default)', () => {
    const stats = new BookmarkStatistics();
    assert.deepEqual(stats.bookmarks, []);
  });

  it('should store bookmarks reference', () => {
    const stats = new BookmarkStatistics(sampleBookmarks);
    assert.equal(stats.bookmarks.length, 5);
  });
});

// ==================== getTrend ====================

describe('getTrend', () => {
  it('should return empty array for empty bookmarks', () => {
    const stats = new BookmarkStatistics([]);
    assert.deepEqual(stats.getTrend('month'), []);
    assert.deepEqual(stats.getTrend('day'), []);
    assert.deepEqual(stats.getTrend('week'), []);
  });

  it('should group by month (default)', () => {
    // sampleBookmarks dateAdded = 1700000000000 + id*86400000
    // id=1 → 1700000000000 + 86400000 = 1700086400000 → 2023-11-16 (UTC)
    // id=5 → 1700000000000 + 432000000 = 1700432000000 → 2023-11-20 (UTC)
    // All in same month → 2023-11
    const stats = new BookmarkStatistics(sampleBookmarks);
    const trend = stats.getTrend('month');
    assert.equal(trend.length, 1);
    assert.equal(trend[0].period, '2023-11');
    assert.equal(trend[0].count, 5);
  });

  it('should group by day', () => {
    const stats = new BookmarkStatistics(sampleBookmarks);
    const trend = stats.getTrend('day');
    // 5 bookmarks on consecutive days → 5 separate day buckets
    assert.equal(trend.length, 5);
    assert.ok(trend.every(e => e.count === 1));
    // Sorted ascending
    for (let i = 1; i < trend.length; i++) {
      assert.ok(trend[i].period >= trend[i - 1].period);
    }
  });

  it('should group by week', () => {
    const stats = new BookmarkStatistics(sampleBookmarks);
    const trend = stats.getTrend('week');
    assert.ok(trend.length >= 1);
    const total = trend.reduce((sum, e) => sum + e.count, 0);
    assert.equal(total, 5);
  });

  it('should not mutate the input array', () => {
    const copy = [...sampleBookmarks];
    const stats = new BookmarkStatistics(copy);
    stats.getTrend('month');
    assert.equal(copy.length, 5);
    assert.deepEqual(copy, sampleBookmarks);
  });
});

// ==================== getDistribution ====================

describe('getDistribution', () => {
  it('should return empty array for empty bookmarks', () => {
    const stats = new BookmarkStatistics([]);
    assert.deepEqual(stats.getDistribution(), []);
  });

  it('should group by first folder level and sort by count desc', () => {
    const stats = new BookmarkStatistics(sampleBookmarks);
    const dist = stats.getDistribution();
    // folderPath[0]: 前端(2), 后端(1), AI(1), DevOps(1)
    assert.equal(dist.length, 4);
    assert.equal(dist[0].name, '前端');
    assert.equal(dist[0].count, 2);
    // All percentages sum to 100
    const totalPct = dist.reduce((s, e) => s + e.percentage, 0);
    assert.ok(Math.abs(totalPct - 100) < 0.1);
  });

  it('should use (未分类) for empty folderPath', () => {
    const bms = [
      { id: '1', title: 'A', url: 'https://a.com', folderPath: [], dateAdded: 1000, tags: [] },
      { id: '2', title: 'B', url: 'https://b.com', folderPath: ['Tech'], dateAdded: 2000, tags: [] },
    ];
    const stats = new BookmarkStatistics(bms);
    const dist = stats.getDistribution();
    assert.equal(dist.length, 2);
    const uncat = dist.find(d => d.name === '(未分类)');
    assert.ok(uncat);
    assert.equal(uncat.count, 1);
    assert.equal(uncat.percentage, 50);
  });
});

// ==================== getHeatmap ====================

describe('getHeatmap', () => {
  it('should return zero-filled 7×24 matrix for empty bookmarks', () => {
    const stats = new BookmarkStatistics([]);
    const heat = stats.getHeatmap();
    assert.equal(heat.length, 7);
    for (const row of heat) {
      assert.equal(row.length, 24);
      assert.ok(row.every(v => v === 0));
    }
  });

  it('should count bookmarks in correct [day][hour] cell', () => {
    const bms = [
      { id: '1', title: 'A', url: 'https://a.com', folderPath: [], tags: [],
        dateAdded: utcMs(2026, 1, 4, 10, 30) },  // 2026-01-04 is Sunday, 10:xx → [0][10]
      { id: '2', title: 'B', url: 'https://b.com', folderPath: [], tags: [],
        dateAdded: utcMs(2026, 1, 4, 10, 45) },  // Same day & hour → [0][10] again
      { id: '3', title: 'C', url: 'https://c.com', folderPath: [], tags: [],
        dateAdded: utcMs(2026, 1, 5, 14, 0) },   // Monday 14:xx → [1][14]
    ];
    const stats = new BookmarkStatistics(bms);
    const heat = stats.getHeatmap();
    assert.equal(heat[0][10], 2);
    assert.equal(heat[1][14], 1);
    assert.equal(heat[0][0], 0); // untouched cell
  });
});

// ==================== getSummary ====================

describe('getSummary', () => {
  it('should return zeroed summary for empty bookmarks', () => {
    const stats = new BookmarkStatistics([]);
    const s = stats.getSummary();
    assert.equal(s.total, 0);
    assert.equal(s.uniqueDomains, 0);
    assert.deepEqual(s.topFolders, []);
    assert.equal(s.avgPerDay, 0);
    assert.equal(s.streakDays, 0);
  });

  it('should compute correct summary fields', () => {
    const stats = new BookmarkStatistics(sampleBookmarks);
    const s = stats.getSummary();
    assert.equal(s.total, 5);
    // Domains: react.dev, nodejs.org, python.org, css-tricks.com, docker.com → 5
    assert.equal(s.uniqueDomains, 5);
    // Top folders sorted by count: 前端(2), 后端(1), AI(1), DevOps(1)
    assert.ok(s.topFolders.length <= 5);
    assert.equal(s.topFolders[0].name, '前端');
    assert.equal(s.topFolders[0].count, 2);
    // avgPerDay and streakDays are numbers
    assert.ok(typeof s.avgPerDay === 'number');
    assert.ok(typeof s.streakDays === 'number');
    assert.ok(s.streakDays >= 1);
  });

  it('should compute streakDays for consecutive-day bookmarks', () => {
    // Create 4 bookmarks on 4 consecutive days
    const bms = [
      { id: '1', title: 'A', url: 'https://a.com', folderPath: ['X'], tags: [],
        dateAdded: utcMs(2026, 3, 1, 10, 0) },
      { id: '2', title: 'B', url: 'https://b.com', folderPath: ['X'], tags: [],
        dateAdded: utcMs(2026, 3, 2, 10, 0) },
      { id: '3', title: 'C', url: 'https://c.com', folderPath: ['Y'], tags: [],
        dateAdded: utcMs(2026, 3, 3, 10, 0) },
      { id: '4', title: 'D', url: 'https://d.com', folderPath: ['Y'], tags: [],
        dateAdded: utcMs(2026, 3, 4, 10, 0) },
    ];
    const stats = new BookmarkStatistics(bms);
    const s = stats.getSummary();
    assert.equal(s.total, 4);
    assert.equal(s.streakDays, 4);
    assert.equal(s.topFolders.length, 2);
    assert.equal(s.avgPerDay, 1);
  });

  it('should handle same-domain bookmarks (uniqueDomains dedup)', () => {
    const bms = [
      { id: '1', title: 'A', url: 'https://example.com/a', folderPath: ['F'], tags: [], dateAdded: 1000 },
      { id: '2', title: 'B', url: 'https://example.com/b', folderPath: ['F'], tags: [], dateAdded: 2000 },
    ];
    const stats = new BookmarkStatistics(bms);
    const s = stats.getSummary();
    assert.equal(s.uniqueDomains, 1);
    assert.equal(s.topFolders[0].name, 'F');
    assert.equal(s.topFolders[0].count, 2);
  });
});

// ==================== 纯函数验证 (不修改输入) ====================

describe('pure function guarantee', () => {
  it('getDistribution should not mutate bookmarks', () => {
    const copy = sampleBookmarks.map(b => ({ ...b, folderPath: [...b.folderPath] }));
    const stats = new BookmarkStatistics(copy);
    stats.getDistribution();
    assert.deepEqual(copy, sampleBookmarks);
  });

  it('getHeatmap should not mutate bookmarks', () => {
    const copy = sampleBookmarks.map(b => ({ ...b }));
    const stats = new BookmarkStatistics(copy);
    stats.getHeatmap();
    assert.deepEqual(copy, sampleBookmarks);
  });

  it('getSummary should not mutate bookmarks', () => {
    const copy = sampleBookmarks.map(b => ({ ...b }));
    const stats = new BookmarkStatistics(copy);
    stats.getSummary();
    assert.deepEqual(copy, sampleBookmarks);
  });
});
