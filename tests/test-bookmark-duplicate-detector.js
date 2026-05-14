/**
 * 测试 lib/bookmark-duplicate-detector.js — 书签重复检测器
 *
 * 测试范围:
 *   findExactDuplicates / findFuzzyDuplicates / findTitleDuplicates
 *   mergeDuplicates / getDuplicateStats / cleanDuplicates
 *   normalizeUrl / _scoreBookmark
 *   清理策略 / 边界情况 / 综合场景
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkDuplicateDetector, CLEANUP_STRATEGIES } = await import('../lib/bookmark-duplicate-detector.js');

// ==================== 辅助: 构造书签 ====================

function bm(id, title, url, opts = {}) {
  return {
    id: String(id),
    title,
    url,
    folderPath: opts.folderPath || [],
    tags: opts.tags || [],
    description: opts.description || '',
    dateAdded: opts.dateAdded || '',
    lastModified: opts.lastModified || '',
  };
}

// ==================== normalizeUrl ====================

describe('BookmarkDuplicateDetector.normalizeUrl', () => {
  it('应移除 https 协议', () => {
    assert.equal(
      BookmarkDuplicateDetector.normalizeUrl('https://example.com/page'),
      'example.com/page'
    );
  });

  it('应移除 www. 前缀', () => {
    assert.equal(
      BookmarkDuplicateDetector.normalizeUrl('https://www.example.com/page'),
      'example.com/page'
    );
  });

  it('应移除尾部斜杠', () => {
    assert.equal(
      BookmarkDuplicateDetector.normalizeUrl('https://example.com/path/'),
      'example.com/path'
    );
  });

  it('应移除跟踪参数', () => {
    const url = 'https://example.com/page?title=hello&utm_source=twitter';
    assert.equal(
      BookmarkDuplicateDetector.normalizeUrl(url),
      'example.com/page?title=hello'
    );
  });

  it('应处理空/null/undefined', () => {
    assert.equal(BookmarkDuplicateDetector.normalizeUrl(''), '');
    assert.equal(BookmarkDuplicateDetector.normalizeUrl(null), '');
    assert.equal(BookmarkDuplicateDetector.normalizeUrl(undefined), '');
  });
});

// ==================== findExactDuplicates ====================

describe('BookmarkDuplicateDetector.findExactDuplicates', () => {
  it('应找出 URL 完全相同的重复书签', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Page A', 'https://example.com/page'),
      bm(2, 'Page A copy', 'https://example.com/page'),
      bm(3, 'Other', 'https://other.com'),
    ]);

    const groups = detector.findExactDuplicates();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].bookmarks.length, 2);
    assert.equal(groups[0].type, 'exact');
  });

  it('规范化后相同但原始不同不应算作精确重复', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Page A', 'https://example.com/page'),
      bm(2, 'Page A', 'https://www.example.com/page'),
    ]);

    const groups = detector.findExactDuplicates();
    assert.equal(groups.length, 0, '原始 URL 不同不应是精确重复');
  });

  it('无重复时应返回空数组', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'A', 'https://a.com'),
      bm(2, 'B', 'https://b.com'),
    ]);

    assert.deepEqual(detector.findExactDuplicates(), []);
  });

  it('空输入应返回空数组', () => {
    const detector = new BookmarkDuplicateDetector([]);
    assert.deepEqual(detector.findExactDuplicates(), []);
  });

  it('应支持传入自定义书签数组', () => {
    const detector = new BookmarkDuplicateDetector([]);
    const bookmarks = [
      bm(1, 'X', 'https://x.com'),
      bm(2, 'X dup', 'https://x.com'),
    ];

    const groups = detector.findExactDuplicates(bookmarks);
    assert.equal(groups.length, 1);
  });
});

// ==================== findFuzzyDuplicates ====================

describe('BookmarkDuplicateDetector.findFuzzyDuplicates', () => {
  it('应找出 www vs 非 www 的模糊重复', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Example', 'https://example.com/page'),
      bm(2, 'Example www', 'https://www.example.com/page'),
      bm(3, 'Other', 'https://other.com'),
    ]);

    const groups = detector.findFuzzyDuplicates();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, 'fuzzy');
    assert.equal(groups[0].bookmarks.length, 2);
  });

  it('应找出尾部斜杠差异的模糊重复', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Page', 'https://example.com/page'),
      bm(2, 'Page slash', 'https://example.com/page/'),
    ]);

    const groups = detector.findFuzzyDuplicates();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].bookmarks.length, 2);
  });

  it('应找出跟踪参数差异的模糊重复', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Page', 'https://example.com/page'),
      bm(2, 'Page utm', 'https://example.com/page?utm_source=twitter'),
      bm(3, 'Page fb', 'https://example.com/page?fbclid=abc123'),
    ]);

    const groups = detector.findFuzzyDuplicates();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].bookmarks.length, 3);
  });

  it('应排除精确匹配 (已由 findExactDuplicates 处理)', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'A', 'https://example.com/page'),
      bm(2, 'A exact', 'https://example.com/page'),
    ]);

    const fuzzy = detector.findFuzzyDuplicates();
    assert.equal(fuzzy.length, 0, '精确匹配不应出现在模糊重复中');
  });

  it('无模糊重复时应返回空数组', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'A', 'https://a.com'),
      bm(2, 'B', 'https://b.com'),
    ]);

    assert.deepEqual(detector.findFuzzyDuplicates(), []);
  });
});

// ==================== findTitleDuplicates ====================

describe('BookmarkDuplicateDetector.findTitleDuplicates', () => {
  it('应找出标题相同但 URL 不同的书签', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'React Tutorial', 'https://reactjs.org/tutorial'),
      bm(2, 'React Tutorial', 'https://react.dev/tutorial'),
      bm(3, 'Vue Guide', 'https://vuejs.org/guide'),
    ]);

    const groups = detector.findTitleDuplicates();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, 'title');
    assert.equal(groups[0].bookmarks.length, 2);
  });

  it('标题和 URL 都相同时不应出现在标题重复中', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Page', 'https://example.com'),
      bm(2, 'Page', 'https://example.com'),
    ]);

    const groups = detector.findTitleDuplicates();
    assert.equal(groups.length, 0, 'URL 相同不应出现在标题重复中');
  });

  it('应忽略大小写差异', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'React Tutorial', 'https://a.com'),
      bm(2, 'react tutorial', 'https://b.com'),
    ]);

    const groups = detector.findTitleDuplicates();
    assert.equal(groups.length, 1);
  });

  it('无标题重复时应返回空数组', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Apple', 'https://a.com'),
      bm(2, 'Banana', 'https://b.com'),
    ]);

    assert.deepEqual(detector.findTitleDuplicates(), []);
  });
});

// ==================== mergeDuplicates ====================

describe('BookmarkDuplicateDetector.mergeDuplicates', () => {
  it('应保留信息最丰富的书签', () => {
    const detector = new BookmarkDuplicateDetector();
    const group = {
      reason: 'test',
      type: 'exact',
      bookmarks: [
        bm(1, 'Page', 'https://example.com', { tags: [], description: '' }),
        bm(2, 'Page', 'https://example.com', { tags: ['a', 'b', 'c'], description: 'Long description here' }),
      ],
      normalizedKey: 'example.com',
    };

    const result = detector.mergeDuplicates([group]);
    assert.equal(result.kept.length, 1);
    assert.equal(result.kept[0].id, '2'); // 标签更多
    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].id, '1');
  });

  it('mergeLog 应记录合并信息', () => {
    const detector = new BookmarkDuplicateDetector();
    const group = {
      reason: 'URL 模糊匹配',
      type: 'fuzzy',
      bookmarks: [
        bm(1, 'A', 'https://a.com'),
        bm(2, 'A', 'https://www.a.com'),
      ],
      normalizedKey: 'a.com',
    };

    const result = detector.mergeDuplicates([group]);
    assert.equal(result.mergeLog.length, 1);
    assert.equal(result.mergeLog[0].removedIds.length, 1);
    assert.ok(result.mergeLog[0].reason.includes('模糊匹配'));
  });

  it('空组应被跳过', () => {
    const detector = new BookmarkDuplicateDetector();
    const result = detector.mergeDuplicates([]);
    assert.equal(result.kept.length, 0);
    assert.equal(result.removed.length, 0);
  });

  it('单元素组应被跳过', () => {
    const detector = new BookmarkDuplicateDetector();
    const result = detector.mergeDuplicates([{
      reason: 'test',
      type: 'exact',
      bookmarks: [bm(1, 'A', 'https://a.com')],
    }]);
    assert.equal(result.kept.length, 0);
  });
});

// ==================== getDuplicateStats ====================

describe('BookmarkDuplicateDetector.getDuplicateStats', () => {
  it('应返回正确的统计信息', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Page A', 'https://example.com/page'),
      bm(2, 'Page A copy', 'https://example.com/page'),
      bm(3, 'Page A www', 'https://www.example.com/page'),
      bm(4, 'Unique', 'https://unique.com'),
    ]);

    const stats = detector.getDuplicateStats();
    assert.equal(stats.totalBookmarks, 4);
    assert.ok(stats.exactDuplicateGroups >= 1, 'should have exact duplicates');
    assert.ok(stats.fuzzyDuplicateGroups >= 1, 'should have fuzzy duplicates');
    assert.ok(stats.totalDuplicateGroups >= 1, 'should have total duplicates');
    assert.ok(stats.deduplicationRatio > 0, 'ratio should be > 0');
  });

  it('空书签数组应返回全零统计', () => {
    const detector = new BookmarkDuplicateDetector([]);
    const stats = detector.getDuplicateStats();
    assert.equal(stats.totalBookmarks, 0);
    assert.equal(stats.exactDuplicateGroups, 0);
    assert.equal(stats.fuzzyDuplicateGroups, 0);
    assert.equal(stats.titleDuplicateGroups, 0);
    assert.equal(stats.deduplicationRatio, 0);
  });

  it('无重复时应返回正确统计', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'A', 'https://a.com'),
      bm(2, 'B', 'https://b.com'),
    ]);

    const stats = detector.getDuplicateStats();
    assert.equal(stats.totalBookmarks, 2);
    assert.equal(stats.totalDuplicateGroups, 0);
    assert.equal(stats.deduplicationRatio, 0);
  });
});

// ==================== cleanDuplicates ====================

describe('BookmarkDuplicateDetector.cleanDuplicates', () => {
  it('keep-newest 策略应保留最新书签', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Page', 'https://example.com', { dateAdded: '2024-01-01' }),
      bm(2, 'Page new', 'https://example.com', { dateAdded: '2025-01-01' }),
    ]);

    const result = detector.cleanDuplicates(null, 'keep-newest');
    assert.equal(result.cleaned.length, 1);
    assert.equal(result.cleaned[0].id, '2');
    assert.equal(result.removed.length, 1);
    assert.equal(result.strategy, 'keep-newest');
    assert.equal(result.groupsProcessed, 1);
  });

  it('keep-oldest 策略应保留最旧书签', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Page', 'https://example.com', { dateAdded: '2024-01-01' }),
      bm(2, 'Page new', 'https://example.com', { dateAdded: '2025-01-01' }),
    ]);

    const result = detector.cleanDuplicates(null, 'keep-oldest');
    assert.equal(result.cleaned.length, 1);
    assert.equal(result.cleaned[0].id, '1');
  });

  it('keep-most-tags 策略应保留标签最多的书签', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Page', 'https://example.com', { tags: [] }),
      bm(2, 'Page tagged', 'https://example.com', { tags: ['a', 'b', 'c'] }),
    ]);

    const result = detector.cleanDuplicates(null, 'keep-most-tags');
    assert.equal(result.cleaned.length, 1);
    assert.equal(result.cleaned[0].id, '2');
  });

  it('keep-longest-description 策略应保留描述最长的书签', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'Page', 'https://example.com', { description: 'short' }),
      bm(2, 'Page desc', 'https://example.com', { description: 'A much longer and more detailed description' }),
    ]);

    const result = detector.cleanDuplicates(null, 'keep-longest-description');
    assert.equal(result.cleaned.length, 1);
    assert.equal(result.cleaned[0].id, '2');
  });

  it('keep-longest-title 策略应保留标题最长的书签', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'X', 'https://example.com'),
      bm(2, 'Longer Title Here', 'https://example.com'),
    ]);

    const result = detector.cleanDuplicates(null, 'keep-longest-title');
    assert.equal(result.cleaned.length, 1);
    assert.equal(result.cleaned[0].id, '2');
  });

  it('未知策略应抛出错误', () => {
    const detector = new BookmarkDuplicateDetector([
      bm(1, 'A', 'https://a.com'),
    ]);

    assert.throws(() => {
      detector.cleanDuplicates(null, 'unknown-strategy');
    }, /未知清理策略/);
  });

  it('无重复时应返回原始列表', () => {
    const bookmarks = [
      bm(1, 'A', 'https://a.com'),
      bm(2, 'B', 'https://b.com'),
    ];
    const detector = new BookmarkDuplicateDetector(bookmarks);

    const result = detector.cleanDuplicates();
    assert.equal(result.cleaned.length, 2);
    assert.equal(result.removed.length, 0);
    assert.equal(result.groupsProcessed, 0);
  });

  it('应支持传入自定义书签数组', () => {
    const detector = new BookmarkDuplicateDetector([]);
    const bookmarks = [
      bm(1, 'A', 'https://example.com'),
      bm(2, 'A', 'https://example.com'),
    ];

    const result = detector.cleanDuplicates(bookmarks, 'keep-newest');
    assert.equal(result.cleaned.length, 1);
    assert.equal(result.removed.length, 1);
  });
});

// ==================== _scoreBookmark ====================

describe('BookmarkDuplicateDetector._scoreBookmark', () => {
  it('标签越多分数越高', () => {
    const low = BookmarkDuplicateDetector._scoreBookmark(bm(1, 'A', 'https://a.com', { tags: [] }));
    const high = BookmarkDuplicateDetector._scoreBookmark(bm(2, 'A', 'https://a.com', { tags: ['x', 'y', 'z'] }));
    assert.ok(high > low, `expected ${high} > ${low}`);
  });

  it('描述越长分数越高', () => {
    const low = BookmarkDuplicateDetector._scoreBookmark(bm(1, 'A', 'https://a.com', { description: '' }));
    const high = BookmarkDuplicateDetector._scoreBookmark(bm(2, 'A', 'https://a.com', { description: 'A'.repeat(100) }));
    assert.ok(high > low, `expected ${high} > ${low}`);
  });

  it('有 folderPath 应加分', () => {
    const without = BookmarkDuplicateDetector._scoreBookmark(bm(1, 'A', 'https://a.com'));
    const with_ = BookmarkDuplicateDetector._scoreBookmark(bm(2, 'A', 'https://a.com', { folderPath: ['dev'] }));
    assert.ok(with_ > without, `expected ${with_} > ${without}`);
  });
});

// ==================== CLEANUP_STRATEGIES ====================

describe('CLEANUP_STRATEGIES', () => {
  it('应包含所有 5 种策略', () => {
    const keys = Object.keys(CLEANUP_STRATEGIES);
    assert.ok(keys.includes('keep-newest'));
    assert.ok(keys.includes('keep-oldest'));
    assert.ok(keys.includes('keep-most-tags'));
    assert.ok(keys.includes('keep-longest-description'));
    assert.ok(keys.includes('keep-longest-title'));
    assert.equal(keys.length, 5);
  });

  it('每个策略都应是函数', () => {
    for (const [key, fn] of Object.entries(CLEANUP_STRATEGIES)) {
      assert.equal(typeof fn, 'function', `${key} should be a function`);
    }
  });
});

// ==================== 综合场景 ====================

describe('BookmarkDuplicateDetector 综合场景', () => {
  it('端到端: 检测所有类型重复 → 统计 → 清理', () => {
    const bookmarks = [
      bm(1, 'MDN Web Docs', 'https://developer.mozilla.org/en-US/', {
        tags: ['docs', 'web'], description: 'MDN Web Docs homepage',
        dateAdded: '2024-01-01',
      }),
      bm(2, 'MDN Web Docs', 'https://developer.mozilla.org/en-US/', {
        tags: ['reference'],
        dateAdded: '2025-01-01',
      }),
      bm(3, 'MDN Web Docs', 'https://www.developer.mozilla.org/en-US/', {
        tags: ['web'],
        dateAdded: '2024-06-01',
      }),
      bm(4, 'React Tutorial', 'https://reactjs.org/tutorial', {
        dateAdded: '2024-03-01',
      }),
      bm(5, 'React Tutorial', 'https://react.dev/tutorial', {
        dateAdded: '2024-06-01',
      }),
      bm(6, 'Vue.js', 'https://vuejs.org', { dateAdded: '2024-01-01' }),
    ];

    const detector = new BookmarkDuplicateDetector(bookmarks);

    // Step 1: 检测各类重复
    const exact = detector.findExactDuplicates();
    assert.ok(exact.length >= 1, 'expected exact duplicates');

    const title = detector.findTitleDuplicates();
    assert.ok(title.length >= 1, 'expected title duplicates');

    // Step 2: 获取统计
    const stats = detector.getDuplicateStats();
    assert.equal(stats.totalBookmarks, 6);
    assert.ok(stats.totalDuplicateGroups >= 2, 'expected >= 2 duplicate groups');

    // Step 3: 清理
    const result = detector.cleanDuplicates(null, 'keep-most-tags');
    assert.ok(result.cleaned.length < 6, 'should have fewer bookmarks after cleaning');
    assert.ok(result.removed.length >= 1, 'should have removed some');
  });

  it('应正确处理只有 URL 差异的模糊重复 + 标题重复的交叉', () => {
    const bookmarks = [
      bm(1, 'Same Title', 'https://example.com/page', { dateAdded: '2024-01-01' }),
      bm(2, 'Same Title', 'https://example.com/page?utm_source=twitter', { dateAdded: '2025-01-01' }),
      bm(3, 'Same Title', 'https://other.com/page', { dateAdded: '2024-06-01' }),
    ];

    const detector = new BookmarkDuplicateDetector(bookmarks);

    const fuzzy = detector.findFuzzyDuplicates();
    assert.ok(fuzzy.length >= 1, 'expected fuzzy duplicates');

    const title = detector.findTitleDuplicates();
    assert.ok(title.length >= 1, 'expected title duplicates');

    // cleanDuplicates should handle overlapping groups
    const result = detector.cleanDuplicates();
    assert.ok(result.cleaned.length >= 1, 'should keep at least 1');
  });

  it('大量书签应能正常工作', () => {
    const bookmarks = [];
    for (let i = 0; i < 200; i++) {
      bookmarks.push(bm(i, `Page ${i % 50}`, `https://example.com/page${i % 100}`));
    }

    const detector = new BookmarkDuplicateDetector(bookmarks);
    const stats = detector.getDuplicateStats();
    assert.ok(stats.totalDuplicateGroups > 0, 'should find some duplicates');
    assert.ok(stats.deduplicationRatio > 0, 'ratio should be > 0');
  });
});
