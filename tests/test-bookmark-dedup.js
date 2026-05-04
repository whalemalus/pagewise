/**
 * 测试 lib/bookmark-dedup.js — 重复书签检测与清理
 *
 * 测试范围:
 *   normalizeUrl / titleSimilarity / findByExactUrl / findBySimilarTitle
 *   findDuplicates / suggestCleanup / batchRemove
 *   URL 规范化规则 / 标题相似度计算 / 清理建议生成
 *   空输入 / 边界情况
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkDedup } = await import('../lib/bookmark-dedup.js');

// ==================== 辅助: 构造书签 ====================

function bm(id, title, url, folderPath = [], tags = []) {
  return { id: String(id), title, url, folderPath, tags };
}

// ==================== URL 规范化 ====================

describe('BookmarkDedup.normalizeUrl', () => {
  it('应移除 https 协议', () => {
    assert.equal(
      BookmarkDedup.normalizeUrl('https://example.com/page'),
      'example.com/page'
    );
  });

  it('应移除 http 协议', () => {
    assert.equal(
      BookmarkDedup.normalizeUrl('http://example.com/page'),
      'example.com/page'
    );
  });

  it('应移除 www. 前缀', () => {
    assert.equal(
      BookmarkDedup.normalizeUrl('https://www.example.com'),
      'example.com'
    );
  });

  it('应移除尾部斜杠', () => {
    assert.equal(
      BookmarkDedup.normalizeUrl('https://example.com/path/'),
      'example.com/path'
    );
  });

  it('应移除跟踪参数 (utm_*)', () => {
    const url = 'https://example.com/page?title=hello&utm_source=twitter&utm_medium=social';
    assert.equal(
      BookmarkDedup.normalizeUrl(url),
      'example.com/page?title=hello'
    );
  });

  it('应移除 fbclid 和 gclid', () => {
    const url = 'https://example.com/page?ref=abc&fbclid=123&gclid=456';
    assert.equal(
      BookmarkDedup.normalizeUrl(url),
      'example.com/page'
    );
  });

  it('应保留非跟踪查询参数', () => {
    const url = 'https://example.com/search?q=test&page=2';
    assert.equal(
      BookmarkDedup.normalizeUrl(url),
      'example.com/search?q=test&page=2'
    );
  });

  it('应转为小写', () => {
    assert.equal(
      BookmarkDedup.normalizeUrl('https://Example.COM/Path'),
      'example.com/path'
    );
  });

  it('应处理空字符串和 null', () => {
    assert.equal(BookmarkDedup.normalizeUrl(''), '');
    assert.equal(BookmarkDedup.normalizeUrl(null), '');
    assert.equal(BookmarkDedup.normalizeUrl(undefined), '');
  });

  it('应正确处理根路径斜杠', () => {
    // 根路径 "/" 不应被移除（仅一个字符）
    assert.equal(
      BookmarkDedup.normalizeUrl('https://example.com/'),
      'example.com'
    );
  });
});

// ==================== 标题相似度 ====================

describe('BookmarkDedup.titleSimilarity', () => {
  it('相同标题应返回 1', () => {
    assert.equal(BookmarkDedup.titleSimilarity('Hello World', 'Hello World'), 1);
  });

  it('完全不同的标题应返回 0', () => {
    assert.equal(BookmarkDedup.titleSimilarity('Hello', 'xyz abc'), 0);
  });

  it('部分重叠应返回合理值', () => {
    const sim = BookmarkDedup.titleSimilarity('JavaScript Guide', 'JavaScript Tutorial');
    // tokens: {javascript, guide} vs {javascript, tutorial}
    // intersection: {javascript} = 1, union: {javascript, guide, tutorial} = 3
    // Jaccard = 1/3
    assert.ok(sim > 0 && sim < 1, `expected 0 < ${sim} < 1`);
    assert.ok(Math.abs(sim - 1 / 3) < 0.001, `expected ~0.333, got ${sim}`);
  });

  it('忽略大小写', () => {
    assert.equal(BookmarkDedup.titleSimilarity('Hello World', 'hello world'), 1);
  });

  it('两个空标题应返回 1', () => {
    assert.equal(BookmarkDedup.titleSimilarity('', ''), 1);
  });

  it('一个空一个非空应返回 0', () => {
    assert.equal(BookmarkDedup.titleSimilarity('', 'hello'), 0);
    assert.equal(BookmarkDedup.titleSimilarity('hello', ''), 0);
  });

  it('null/undefined 应安全处理', () => {
    assert.equal(BookmarkDedup.titleSimilarity(null, null), 1);
    assert.equal(BookmarkDedup.titleSimilarity(null, 'a'), 0);
    assert.equal(BookmarkDedup.titleSimilarity('a', undefined), 0);
  });

  it('高相似度标题应超过默认阈值 0.7', () => {
    // tokens: {the, complete, javascript, guide, for, beginners} vs {the, complete, javascript, guide, for, developers}
    // intersection: 5 (the, complete, javascript, guide, for), union: 7
    // Jaccard = 5/7 ≈ 0.714
    const sim = BookmarkDedup.titleSimilarity(
      'The Complete JavaScript Guide For Beginners',
      'The Complete JavaScript Guide For Developers'
    );
    assert.ok(sim >= 0.7, `expected >= 0.7, got ${sim}`);
  });
});

// ==================== 精确 URL 去重 ====================

describe('BookmarkDedup.findByExactUrl', () => {
  it('应找到规范化后 URL 相同的书签组', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'Page A', 'https://example.com/page'),
      bm(2, 'Page A (copy)', 'http://www.example.com/page/'),
      bm(3, 'Other', 'https://other.com'),
    ]);

    const groups = dedup.findByExactUrl();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].length, 2);
    assert.equal(groups[0][0].id, '1');
    assert.equal(groups[0][1].id, '2');
  });

  it('应处理带跟踪参数的 URL', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'Page A', 'https://example.com/page?utm_source=twitter'),
      bm(2, 'Page B', 'https://example.com/page?utm_source=facebook'),
      bm(3, 'Page C', 'https://example.com/page'),
    ]);

    const groups = dedup.findByExactUrl();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].length, 3);
  });

  it('无重复时应返回空数组', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'Page A', 'https://a.com'),
      bm(2, 'Page B', 'https://b.com'),
    ]);

    assert.deepEqual(dedup.findByExactUrl(), []);
  });
});

// ==================== 相似标题去重 ====================

describe('BookmarkDedup.findBySimilarTitle', () => {
  it('应找到标题相似的书签组', () => {
    // "The Complete JavaScript Guide For Beginners" vs "The Complete JavaScript Guide For Developers"
    // Jaccard = 5/7 ≈ 0.714 ≥ 0.7
    const dedup = new BookmarkDedup([
      bm(1, 'The Complete JavaScript Guide For Beginners', 'https://a.com'),
      bm(2, 'The Complete JavaScript Guide For Developers', 'https://b.com'),
      bm(3, 'Python Tutorial', 'https://c.com'),
    ]);

    const groups = dedup.findBySimilarTitle();
    assert.ok(groups.length >= 1, 'expected at least 1 group');

    // JS Guide pair should be grouped
    const jsGroup = groups.find((g) => g.some((b) => b.id === '1'));
    assert.ok(jsGroup, 'expected JS group');
    assert.equal(jsGroup.length, 2);
  });

  it('应支持自定义阈值', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'JavaScript Guide', 'https://a.com'),
      bm(2, 'JavaScript Tutorial', 'https://b.com'),
    ]);

    // 低阈值 → 应分组
    const lowThreshold = dedup.findBySimilarTitle(0.3);
    assert.ok(lowThreshold.length >= 1, 'low threshold should group');

    // 高阈值 → 不应分组
    const highThreshold = dedup.findBySimilarTitle(0.9);
    assert.equal(highThreshold.length, 0, 'high threshold should not group');
  });

  it('无相似标题时应返回空数组', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'Apple', 'https://a.com'),
      bm(2, 'Banana', 'https://b.com'),
      bm(3, 'Cherry', 'https://c.com'),
    ]);

    assert.deepEqual(dedup.findBySimilarTitle(), []);
  });
});

// ==================== 综合重复检测 ====================

describe('BookmarkDedup.findDuplicates', () => {
  it('应同时检测 URL 重复和标题相似', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'Example Page', 'https://example.com/page'),
      bm(2, 'Example Page (copy)', 'https://example.com/page'),
      bm(3, 'The Complete JavaScript Guide For Beginners', 'https://js-guide.com'),
      bm(4, 'The Complete JavaScript Guide For Developers', 'https://js-guide-v2.com'),
      bm(5, 'Unrelated', 'https://other.com'),
    ]);

    const results = dedup.findDuplicates();
    assert.ok(results.length >= 2, `expected >= 2 duplicate groups, got ${results.length}`);

    // 每个结果应有 original, duplicates, reason
    for (const r of results) {
      assert.ok(r.original, 'expected original');
      assert.ok(Array.isArray(r.duplicates), 'expected duplicates array');
      assert.ok(r.duplicates.length >= 1, 'expected at least 1 duplicate');
      assert.ok(typeof r.reason === 'string', 'expected reason string');
    }
  });

  it('无重复时应返回空数组', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'Page A', 'https://a.com'),
      bm(2, 'Page B', 'https://b.com'),
    ]);

    assert.deepEqual(dedup.findDuplicates(), []);
  });

  it('空书签数组应返回空结果', () => {
    const dedup = new BookmarkDedup([]);
    assert.deepEqual(dedup.findDuplicates(), []);
  });
});

// ==================== 清理建议 ====================

describe('BookmarkDedup.suggestCleanup', () => {
  it('URL 重复应建议 remove', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'Page A', 'https://example.com/page'),
      bm(2, 'Page A copy', 'https://example.com/page'),
    ]);

    const suggestions = dedup.suggestCleanup();
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].action, 'remove');
    assert.equal(suggestions[0].bookmarkId, '2');
    assert.ok(suggestions[0].reason.includes('删除'), 'reason should mention 删除');
  });

  it('标题相似应建议 merge', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'The Complete JavaScript Guide For Beginners', 'https://a.com'),
      bm(2, 'The Complete JavaScript Guide For Developers', 'https://b.com'),
    ]);

    const suggestions = dedup.suggestCleanup();
    assert.ok(suggestions.length >= 1, 'expected at least 1 suggestion');
    assert.equal(suggestions[0].action, 'merge');
    assert.ok(suggestions[0].reason.includes('合并'), 'reason should mention 合并');
  });

  it('无重复时应返回空数组', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'Page A', 'https://a.com'),
    ]);

    assert.deepEqual(dedup.suggestCleanup(), []);
  });
});

// ==================== 批量删除 ====================

describe('BookmarkDedup.batchRemove', () => {
  it('应移除指定 ID 的书签并返回数量', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'A', 'https://a.com'),
      bm(2, 'B', 'https://b.com'),
      bm(3, 'C', 'https://c.com'),
    ]);

    const removed = dedup.batchRemove(['1', '3']);
    assert.equal(removed, 2);
    assert.equal(dedup.bookmarks.length, 1);
    assert.equal(dedup.bookmarks[0].id, '2');
  });

  it('传入不存在的 ID 应返回 0', () => {
    const dedup = new BookmarkDedup([bm(1, 'A', 'https://a.com')]);

    const removed = dedup.batchRemove(['999']);
    assert.equal(removed, 0);
    assert.equal(dedup.bookmarks.length, 1);
  });

  it('传入空数组应返回 0', () => {
    const dedup = new BookmarkDedup([bm(1, 'A', 'https://a.com')]);

    const removed = dedup.batchRemove([]);
    assert.equal(removed, 0);
  });

  it('传入 null/undefined 应安全返回 0', () => {
    const dedup = new BookmarkDedup([bm(1, 'A', 'https://a.com')]);

    assert.equal(dedup.batchRemove(null), 0);
    assert.equal(dedup.batchRemove(undefined), 0);
  });

  it('应支持数字 ID (自动转字符串)', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'A', 'https://a.com'),
      bm(2, 'B', 'https://b.com'),
    ]);

    const removed = dedup.batchRemove([1, 2]);
    assert.equal(removed, 2);
    assert.equal(dedup.bookmarks.length, 0);
  });
});

// ==================== 综合场景 ====================

describe('BookmarkDedup 综合场景', () => {
  it('端到端: 检测 → 建议 → 批量清理', () => {
    const dedup = new BookmarkDedup([
      bm(1, 'MDN Web Docs', 'https://developer.mozilla.org/en-US/'),
      bm(2, 'MDN Web Docs', 'https://developer.mozilla.org/en-US'),
      bm(3, 'MDN Docs', 'https://developer.mozilla.org/en-US/?utm_source=twitter'),
      bm(4, 'React Official', 'https://react.dev'),
      bm(5, 'React Docs', 'https://reactjs.org'),
      bm(6, 'Vue.js', 'https://vuejs.org'),
    ]);

    // Step 1: 检测重复
    const duplicates = dedup.findDuplicates();
    assert.ok(duplicates.length >= 1, 'expected duplicates');

    // Step 2: 获取清理建议
    const suggestions = dedup.suggestCleanup();
    assert.ok(suggestions.length >= 1, 'expected suggestions');

    // Step 3: 批量清理
    const idsToRemove = suggestions.map((s) => s.bookmarkId);
    const removed = dedup.batchRemove(idsToRemove);
    assert.ok(removed >= 1, `expected >= 1 removed, got ${removed}`);
    assert.equal(dedup.bookmarks.length, 6 - removed);
  });
});
