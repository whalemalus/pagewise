/**
 * test-depth-bookmark-core.js — BookmarkIndexer 深度测试
 *
 * 测试范围:
 *   addBookmark  — 添加书签、重复添加、无效输入
 *   removeBookmark — 删除存在/不存在的书签
 *   search       — 获取存在/不存在的书签（充当 getBookmark）
 *   update       — 更新标题/URL/标签（remove + modified add）
 *   buildIndex   — 列出所有、空列表
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkIndexer } = await import('../lib/bookmark-core.js');

// ==================== 辅助函数 ====================

function makeBookmark(overrides = {}) {
  return {
    id: '1',
    title: 'Test Bookmark',
    url: 'https://example.com',
    folderPath: ['测试'],
    tags: ['test'],
    dateAdded: 1700000000000,
    ...overrides,
  };
}

const SAMPLE_BOOKMARKS = [
  makeBookmark({ id: '1', title: 'React Docs', url: 'https://react.dev', folderPath: ['前端'], tags: ['react', 'docs'] }),
  makeBookmark({ id: '2', title: 'Vue Guide', url: 'https://vuejs.org', folderPath: ['前端'], tags: ['vue'] }),
  makeBookmark({ id: '3', title: 'Node.js', url: 'https://nodejs.org', folderPath: ['后端'], tags: ['node'] }),
  makeBookmark({ id: '4', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', folderPath: ['参考'], tags: ['mdn', 'docs'] }),
  makeBookmark({ id: '5', title: 'Stack Overflow', url: 'https://stackoverflow.com', folderPath: [], tags: [] }),
];

// ==================== 测试 ====================

describe('BookmarkIndexer', () => {
  let indexer;

  beforeEach(() => {
    indexer = new BookmarkIndexer();
  });

  // ─── addBookmark ──────────────────────────────────────────────────────

  describe('addBookmark — 添加书签', () => {
    it('1. 成功添加单个书签', () => {
      const bm = makeBookmark();
      indexer.addBookmark(bm);
      assert.equal(indexer.getSize().bookmarks, 1);
    });

    it('2. 重复添加相同 id 不会新增条目', () => {
      const bm = makeBookmark({ id: '42', title: 'Duplicate' });
      indexer.addBookmark(bm);
      indexer.addBookmark(bm);
      assert.equal(indexer.getSize().bookmarks, 1);
    });

    it('3. 重复添加相同 id 但更新内容后保留最新数据', () => {
      const bm = makeBookmark({ id: '42', title: 'Original' });
      indexer.addBookmark(bm);
      const updated = makeBookmark({ id: '42', title: 'Updated Title' });
      indexer.addBookmark(updated);
      assert.equal(indexer.getSize().bookmarks, 1);
      const results = indexer.search('Updated');
      assert.equal(results.length, 1);
      assert.equal(results[0].bookmark.title, 'Updated Title');
    });

    it('4. 传入 null/undefined 不崩溃且不添加', () => {
      indexer.addBookmark(null);
      indexer.addBookmark(undefined);
      assert.equal(indexer.getSize().bookmarks, 0);
    });

    it('5. 传入无 id 的对象不崩溃且不添加', () => {
      indexer.addBookmark({ title: 'No ID', url: 'https://no-id.example.com' });
      assert.equal(indexer.getSize().bookmarks, 0);
    });

    it('6. 添加多个不同书签正确计数', () => {
      for (const bm of SAMPLE_BOOKMARKS) indexer.addBookmark(bm);
      assert.equal(indexer.getSize().bookmarks, SAMPLE_BOOKMARKS.length);
    });
  });

  // ─── search (getBookmark) ─────────────────────────────────────────────

  describe('search — 获取书签', () => {
    it('7. 通过标题关键词找到已添加的书签', () => {
      indexer.addBookmark(makeBookmark({ id: '1', title: 'React Tutorial', url: 'https://react.dev' }));
      const results = indexer.search('React');
      assert.ok(results.length > 0);
      assert.equal(results[0].bookmark.id, '1');
    });

    it('8. 搜索不存在的关键词返回空数组', () => {
      for (const bm of SAMPLE_BOOKMARKS) indexer.addBookmark(bm);
      const results = indexer.search('NonExistentKeyword12345');
      assert.deepEqual(results, []);
    });

    it('9. 空查询或 null 查询返回空数组', () => {
      for (const bm of SAMPLE_BOOKMARKS) indexer.addBookmark(bm);
      assert.deepEqual(indexer.search(''), []);
      assert.deepEqual(indexer.search(null), []);
      assert.deepEqual(indexer.search(undefined), []);
    });

    it('10. 搜索结果按相关度排序（标题匹配分数更高）', () => {
      indexer.addBookmark(makeBookmark({ id: '1', title: 'JavaScript Guide', url: 'https://js.example.com' }));
      indexer.addBookmark(makeBookmark({ id: '2', title: 'Random Page', url: 'https://example.com/javascript/tutorial' }));
      const results = indexer.search('javascript');
      assert.ok(results.length >= 2);
      // id=1 标题包含 "JavaScript" 应排名靠前
      assert.equal(results[0].bookmark.id, '1');
    });
  });

  // ─── removeBookmark (deleteBookmark) ──────────────────────────────────

  describe('removeBookmark — 删除书签', () => {
    it('11. 删除已存在的书签成功返回 true', () => {
      indexer.addBookmark(makeBookmark({ id: '7' }));
      assert.equal(indexer.removeBookmark('7'), true);
      assert.equal(indexer.getSize().bookmarks, 0);
    });

    it('12. 删除已存在的书签后搜索不到', () => {
      indexer.addBookmark(makeBookmark({ id: '7', title: 'Removable', url: 'https://removable.com' }));
      indexer.removeBookmark('7');
      const results = indexer.search('Removable');
      assert.deepEqual(results, []);
    });

    it('13. 删除不存在的书签返回 false', () => {
      assert.equal(indexer.removeBookmark('999'), false);
      assert.equal(indexer.removeBookmark('nonexistent'), false);
    });

    it('14. 删除一个后其余书签仍可正常搜索', () => {
      for (const bm of SAMPLE_BOOKMARKS) indexer.addBookmark(bm);
      indexer.removeBookmark('1'); // React Docs
      const size = indexer.getSize();
      assert.equal(size.bookmarks, SAMPLE_BOOKMARKS.length - 1);
      const vueResults = indexer.search('Vue');
      assert.ok(vueResults.length > 0);
      assert.equal(vueResults[0].bookmark.id, '2');
    });
  });

  // ─── updateBookmark (update 标题/URL/标签) ────────────────────────────

  describe('updateBookmark — 更新书签', () => {
    it('15. 更新标题：通过 remove + re-add 修改标题', () => {
      indexer.addBookmark(makeBookmark({ id: '10', title: 'Old Title', tags: ['tag1'] }));
      indexer.removeBookmark('10');
      indexer.addBookmark(makeBookmark({ id: '10', title: 'New Title', tags: ['tag1'] }));
      assert.equal(indexer.getSize().bookmarks, 1);
      const results = indexer.search('New');
      assert.ok(results.length > 0);
      assert.equal(results[0].bookmark.title, 'New Title');
      const oldResults = indexer.search('Old');
      assert.equal(oldResults.length, 0);
    });

    it('16. 更新 URL：搜索新 URL 关键词可找到', () => {
      indexer.addBookmark(makeBookmark({ id: '11', title: 'Page', url: 'https://oldsite.example.com' }));
      indexer.removeBookmark('11');
      indexer.addBookmark(makeBookmark({ id: '11', title: 'Page', url: 'https://newsite.example.com' }));
      const results = indexer.search('newsite');
      assert.ok(results.length > 0);
    });

    it('17. 更新标签：新标签可被搜索到', () => {
      indexer.addBookmark(makeBookmark({ id: '12', title: 'Tagged', tags: ['oldTag'] }));
      indexer.removeBookmark('12');
      indexer.addBookmark(makeBookmark({ id: '12', title: 'Tagged', tags: ['newTag'] }));
      const results = indexer.search('newTag');
      assert.ok(results.length > 0);
      assert.deepEqual(results[0].bookmark.tags, ['newTag']);
    });
  });

  // ─── buildIndex (listBookmarks) ───────────────────────────────────────

  describe('buildIndex / listBookmarks — 列出所有 / 空列表', () => {
    it('18. 空索引的 getSize 返回全零', () => {
      const size = indexer.getSize();
      assert.equal(size.bookmarks, 0);
      assert.equal(size.tokens, 0);
      assert.equal(size.folders, 0);
    });

    it('19. buildIndex 批量加载后 getSize 正确', () => {
      indexer.buildIndex(SAMPLE_BOOKMARKS);
      const size = indexer.getSize();
      assert.equal(size.bookmarks, SAMPLE_BOOKMARKS.length);
      assert.ok(size.tokens > 0);
    });

    it('20. buildIndex 后所有书签均可通过搜索命中', () => {
      indexer.buildIndex(SAMPLE_BOOKMARKS);
      for (const bm of SAMPLE_BOOKMARKS) {
        // 用标题第一个单词搜
        const firstWord = bm.title.split(' ')[0];
        if (!firstWord) continue;
        const results = indexer.search(firstWord);
        assert.ok(results.length > 0, `Expected search results for "${firstWord}" from bookmark "${bm.title}"`);
      }
    });
  });
});
