/**
 * 测试 lib/bookmark-batch.js — 批量操作
 *
 * 测试范围:
 *   batchDelete — 全部成功、部分失败、空列表
 *   batchTag    — 添加、移除、混合操作
 *   batchMove   — 有效/无效文件夹
 *   batchExport — JSON、HTML、CSV 格式
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  batchDelete,
  batchTag,
  batchMove,
  batchExport,
  batchAddTag,
  batchRemoveTag,
  batchMoveToFolder,
} = await import('../lib/bookmark-batch.js');

// ==================== 辅助函数 ====================

function makeBookmarks() {
  return [
    { id: '1', title: 'React Docs', url: 'https://react.dev', folderPath: ['前端'], tags: ['react'], status: 'read', dateAdded: 1700000000000 },
    { id: '2', title: 'Vue Guide', url: 'https://vuejs.org', folderPath: ['前端'], tags: ['vue'], status: 'unread', dateAdded: 1700100000000 },
    { id: '3', title: 'Node.js', url: 'https://nodejs.org', folderPath: ['后端'], tags: ['node'], status: 'read', dateAdded: 1700200000000 },
    { id: '4', title: 'MDN Web', url: 'https://developer.mozilla.org', folderPath: ['参考'], tags: ['mdn', 'docs'], status: 'unread', dateAdded: 1700300000000 },
    { id: '5', title: 'Stack Overflow', url: 'https://stackoverflow.com', folderPath: [], tags: [], status: 'unread', dateAdded: 1700400000000 },
  ];
}

// ==================== 测试 ====================

describe('BookmarkBatch', () => {

  // ─── batchDelete ────────────────────────────────────────────────────────

  describe('batchDelete', () => {
    it('1. deletes multiple bookmarks successfully', () => {
      const bm = makeBookmarks();
      const result = batchDelete(bm, ['1', '3']);
      assert.equal(result.success, 2);
      assert.equal(result.failed, 0);
      assert.equal(result.remaining.length, 3);
      assert.ok(result.remaining.every(b => b.id !== '1' && b.id !== '3'));
    });

    it('2. returns partial failure when some ids not found', () => {
      const bm = makeBookmarks();
      const result = batchDelete(bm, ['1', '99']);
      assert.equal(result.success, 1);
      assert.equal(result.failed, 1);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].id, '99');
      assert.equal(result.remaining.length, 4);
    });

    it('3. returns all remaining when ids is empty', () => {
      const bm = makeBookmarks();
      const result = batchDelete(bm, []);
      assert.equal(result.success, 0);
      assert.equal(result.failed, 0);
      assert.equal(result.remaining.length, 5);
    });

    it('4. does not mutate the original array', () => {
      const bm = makeBookmarks();
      const originalLength = bm.length;
      batchDelete(bm, ['1', '2']);
      assert.equal(bm.length, originalLength);
    });

    it('5. returns empty remaining when all deleted', () => {
      const bm = makeBookmarks();
      const ids = bm.map(b => b.id);
      const result = batchDelete(bm, ids);
      assert.equal(result.success, 5);
      assert.equal(result.remaining.length, 0);
    });
  });

  // ─── batchTag add ───────────────────────────────────────────────────────

  describe('batchTag add', () => {
    it('6. adds new tags to selected bookmarks', () => {
      const bm = makeBookmarks();
      const result = batchTag(bm, ['1', '2'], ['frontend', 'tutorial'], 'add');
      assert.equal(result.success, 2);
      assert.equal(result.failed, 0);
      const b1 = result.updated.find(b => b.id === '1');
      assert.ok(b1.tags.includes('frontend'));
      assert.ok(b1.tags.includes('tutorial'));
      assert.ok(b1.tags.includes('react')); // original preserved
    });

    it('7. is idempotent — adding existing tags does not duplicate', () => {
      const bm = makeBookmarks();
      const result = batchTag(bm, ['1'], ['react'], 'add');
      assert.equal(result.success, 1);
      const b1 = result.updated.find(b => b.id === '1');
      assert.equal(b1.tags.filter(t => t === 'react').length, 1);
      assert.equal(result.results[0].tagsAdded, 0);
    });

    it('8. returns updated list unchanged when ids is empty', () => {
      const bm = makeBookmarks();
      const result = batchTag(bm, [], ['test'], 'add');
      assert.equal(result.updated.length, 5);
      assert.equal(result.success, 0);
    });

    it('9. marks non-existent ids as failed', () => {
      const bm = makeBookmarks();
      const result = batchTag(bm, ['1', '99'], ['new-tag'], 'add');
      assert.equal(result.success, 1);
      assert.equal(result.failed, 1);
      assert.equal(result.errors[0].id, '99');
    });
  });

  // ─── batchTag remove ────────────────────────────────────────────────────

  describe('batchTag remove', () => {
    it('10. removes tags from selected bookmarks', () => {
      const bm = makeBookmarks();
      const result = batchTag(bm, ['1'], ['react'], 'remove');
      assert.equal(result.success, 1);
      const b1 = result.updated.find(b => b.id === '1');
      assert.ok(!b1.tags.includes('react'));
      assert.equal(result.results[0].tagsRemoved, 1);
    });

    it('11. handles removing non-existent tags gracefully', () => {
      const bm = makeBookmarks();
      const result = batchTag(bm, ['1'], ['nonexistent'], 'remove');
      assert.equal(result.success, 1);
      assert.equal(result.results[0].tagsRemoved, 0);
    });

    it('12. removes tags from multiple bookmarks', () => {
      const bm = makeBookmarks();
      const result = batchTag(bm, ['1', '4'], ['mdn', 'react'], 'remove');
      assert.equal(result.success, 2);
      const b1 = result.updated.find(b => b.id === '1');
      const b4 = result.updated.find(b => b.id === '4');
      assert.ok(!b1.tags.includes('react'));
      assert.ok(!b4.tags.includes('mdn'));
    });
  });

  // ─── batchTag validation ────────────────────────────────────────────────

  describe('batchTag validation', () => {
    it('13. rejects invalid action', () => {
      const bm = makeBookmarks();
      const result = batchTag(bm, ['1'], ['tag'], 'invalid');
      assert.equal(result.success, 0);
      assert.equal(result.failed, 1); // ids.length count as failed
      assert.match(result.errors[0].reason, /invalid action/);
    });

    it('14. does not mutate original bookmarks', () => {
      const bm = makeBookmarks();
      batchTag(bm, ['1'], ['new-tag'], 'add');
      assert.ok(!bm[0].tags.includes('new-tag'));
    });
  });

  // ─── batchMove ──────────────────────────────────────────────────────────

  describe('batchMove', () => {
    it('15. moves bookmarks to target folder', () => {
      const bm = makeBookmarks();
      const result = batchMove(bm, ['1', '2'], ['全栈', '框架']);
      assert.equal(result.success, 2);
      assert.equal(result.failed, 0);
      const b1 = result.moved.find(b => b.id === '1');
      assert.deepEqual(b1.folderPath, ['全栈', '框架']);
    });

    it('16. reports non-existent ids as failed', () => {
      const bm = makeBookmarks();
      const result = batchMove(bm, ['1', '99'], ['目标']);
      assert.equal(result.success, 1);
      assert.equal(result.failed, 1);
      assert.equal(result.errors[0].id, '99');
    });

    it('17. rejects empty targetFolder', () => {
      const bm = makeBookmarks();
      const result = batchMove(bm, ['1'], []);
      assert.equal(result.success, 0);
      assert.equal(result.failed, 1);
      assert.match(result.errors[0].reason, /non-empty/);
    });

    it('18. rejects targetFolder with invalid segments', () => {
      const bm = makeBookmarks();
      const result = batchMove(bm, ['1'], ['valid', '', 'test']);
      assert.equal(result.success, 0);
      assert.match(result.errors[0].reason, /invalid folder segment/);
    });

    it('19. does not mutate original bookmarks', () => {
      const bm = makeBookmarks();
      batchMove(bm, ['1'], ['新文件夹']);
      assert.deepEqual(bm[0].folderPath, ['前端']);
    });
  });

  // ─── batchExport JSON ───────────────────────────────────────────────────

  describe('batchExport JSON', () => {
    it('20. exports selected bookmarks as JSON', () => {
      const bm = makeBookmarks();
      const result = batchExport(bm, ['1', '2'], 'json');
      assert.equal(result.format, 'json');
      assert.equal(result.count, 2);
      const parsed = JSON.parse(result.content);
      assert.equal(parsed.bookmarks.length, 2);
      assert.equal(parsed.bookmarks[0].title, 'React Docs');
    });

    it('21. exports all bookmarks when ids is empty', () => {
      const bm = makeBookmarks();
      const result = batchExport(bm, [], 'json');
      const parsed = JSON.parse(result.content);
      assert.equal(parsed.bookmarks.length, 5);
    });

    it('22. reports non-existent ids as errors', () => {
      const bm = makeBookmarks();
      const result = batchExport(bm, ['1', '99'], 'json');
      assert.equal(result.count, 1);
      assert.equal(result.errors.length, 1);
    });
  });

  // ─── batchExport HTML ───────────────────────────────────────────────────

  describe('batchExport HTML', () => {
    it('23. exports bookmarks as Chrome HTML format', () => {
      const bm = makeBookmarks();
      const result = batchExport(bm, ['1', '3'], 'html');
      assert.equal(result.format, 'html');
      assert.equal(result.count, 2);
      assert.ok(result.content.includes('<!DOCTYPE'));
      assert.ok(result.content.includes('React Docs'));
      assert.ok(result.content.includes('Node.js'));
      assert.ok(result.content.includes('https://react.dev'));
    });

    it('24. escapes HTML special characters in titles', () => {
      const bm = [
        { id: 'x1', title: 'A <bold> & "test"', url: 'https://example.com', tags: [] },
      ];
      const result = batchExport(bm, [], 'html');
      assert.ok(result.content.includes('&lt;'));
      assert.ok(result.content.includes('&amp;'));
      assert.ok(result.content.includes('&quot;'));
    });
  });

  // ─── batchExport CSV ────────────────────────────────────────────────────

  describe('batchExport CSV', () => {
    it('25. exports bookmarks as CSV with header', () => {
      const bm = makeBookmarks();
      const result = batchExport(bm, ['1', '2'], 'csv');
      assert.equal(result.format, 'csv');
      const lines = result.content.split('\n');
      assert.ok(lines[0].includes('title,url,folderPath'));
      assert.equal(lines.length, 3); // header + 2 rows
    });

    it('26. handles commas in CSV fields with quoting', () => {
      const bm = [
        { id: 'c1', title: 'Hello, World', url: 'https://example.com', tags: ['a,b'] },
      ];
      const result = batchExport(bm, [], 'csv');
      assert.ok(result.content.includes('"Hello, World"'));
    });
  });

  // ─── batchExport format validation ──────────────────────────────────────

  describe('batchExport validation', () => {
    it('27. rejects unsupported format', () => {
      const bm = makeBookmarks();
      const result = batchExport(bm, ['1'], 'xml');
      assert.equal(result.count, 0);
      assert.equal(result.content, '');
      assert.match(result.errors[0].reason, /unsupported format/);
    });

    it('28. returns empty content for null bookmarks', () => {
      const result = batchExport(null, ['1'], 'json');
      assert.equal(result.content, '');
      assert.equal(result.count, 0);
    });
  });

  // ─── batchAddTag ────────────────────────────────────────────────────────

  describe('batchAddTag', () => {
    it('29. adds a single tag to selected bookmarks', () => {
      const bm = makeBookmarks();
      const result = batchAddTag(bm, ['1', '2'], 'awesome');
      assert.equal(result.success, 2);
      assert.equal(result.failed, 0);
      const b1 = result.updated.find(b => b.id === '1');
      assert.ok(b1.tags.includes('awesome'));
      assert.ok(b1.tags.includes('react'));
    });

    it('30. is idempotent when tag already exists', () => {
      const bm = makeBookmarks();
      const result = batchAddTag(bm, ['1'], 'react');
      assert.equal(result.success, 1);
      assert.equal(result.results[0].tagsAdded, 0);
    });

    it('31. does not mutate original bookmarks', () => {
      const bm = makeBookmarks();
      batchAddTag(bm, ['1'], 'new-tag');
      assert.ok(!bm[0].tags.includes('new-tag'));
    });

    it('32. reports non-existent ids as failed', () => {
      const bm = makeBookmarks();
      const result = batchAddTag(bm, ['99'], 'tag');
      assert.equal(result.success, 0);
      assert.equal(result.failed, 1);
      assert.equal(result.errors[0].id, '99');
    });
  });

  // ─── batchRemoveTag ─────────────────────────────────────────────────────

  describe('batchRemoveTag', () => {
    it('33. removes a single tag from selected bookmarks', () => {
      const bm = makeBookmarks();
      const result = batchRemoveTag(bm, ['1'], 'react');
      assert.equal(result.success, 1);
      const b1 = result.updated.find(b => b.id === '1');
      assert.ok(!b1.tags.includes('react'));
      assert.equal(result.results[0].tagsRemoved, 1);
    });

    it('34. handles removing non-existent tag gracefully', () => {
      const bm = makeBookmarks();
      const result = batchRemoveTag(bm, ['1'], 'nonexistent');
      assert.equal(result.success, 1);
      assert.equal(result.results[0].tagsRemoved, 0);
    });

    it('35. does not mutate original bookmarks', () => {
      const bm = makeBookmarks();
      batchRemoveTag(bm, ['1'], 'react');
      assert.ok(bm[0].tags.includes('react'));
    });

    it('36. removes tag from multiple bookmarks', () => {
      const bm = makeBookmarks();
      const result = batchRemoveTag(bm, ['1', '4'], 'react');
      assert.equal(result.success, 2);
      const b1 = result.updated.find(b => b.id === '1');
      assert.ok(!b1.tags.includes('react'));
    });
  });

  // ─── batchMoveToFolder ──────────────────────────────────────────────────

  describe('batchMoveToFolder', () => {
    it('37. moves bookmarks using slash-separated path string', () => {
      const bm = makeBookmarks();
      const result = batchMoveToFolder(bm, ['1', '2'], '全栈/框架');
      assert.equal(result.success, 2);
      const b1 = result.moved.find(b => b.id === '1');
      assert.deepEqual(b1.folderPath, ['全栈', '框架']);
    });

    it('38. moves bookmarks using single-segment path', () => {
      const bm = makeBookmarks();
      const result = batchMoveToFolder(bm, ['1'], '收藏夹');
      assert.equal(result.success, 1);
      assert.deepEqual(result.moved[0].folderPath, ['收藏夹']);
    });

    it('39. does not mutate original bookmarks', () => {
      const bm = makeBookmarks();
      batchMoveToFolder(bm, ['1'], '新路径/子路径');
      assert.deepEqual(bm[0].folderPath, ['前端']);
    });

    it('40. reports non-existent ids as failed', () => {
      const bm = makeBookmarks();
      const result = batchMoveToFolder(bm, ['1', '99'], '目标');
      assert.equal(result.success, 1);
      assert.equal(result.failed, 1);
      assert.equal(result.errors[0].id, '99');
    });

    it('41. handles empty folder string gracefully', () => {
      const bm = makeBookmarks();
      const result = batchMoveToFolder(bm, ['1'], '');
      assert.equal(result.success, 0);
      assert.ok(result.errors.length > 0);
    });

    it('42. handles array folder input', () => {
      const bm = makeBookmarks();
      const result = batchMoveToFolder(bm, ['1'], ['A', 'B']);
      assert.equal(result.success, 1);
      assert.deepEqual(result.moved[0].folderPath, ['A', 'B']);
    });
  });
})
