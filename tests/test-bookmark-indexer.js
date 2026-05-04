/**
 * 测试 lib/bookmark-indexer.js — 书签索引器
 *
 * 测试范围:
 *   buildIndex / search / addBookmark / removeBookmark / getSize
 *   中英文分词 / 多关键词 AND / 文件夹过滤 / 标签过滤 / 性能
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkIndexer } = await import('../lib/bookmark-indexer.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = []) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    dateAdded: 1700000000000 + Number(id) * 1000,
    dateAddedISO: new Date(1700000000000 + Number(id) * 1000).toISOString(),
    ...(tags.length > 0 ? { tags } : {}),
  };
}

const sampleBookmarks = [
  createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端']),
  createBookmark('2', 'Vue.js 入门教程', 'https://vuejs.org', ['技术', '前端']),
  createBookmark('3', 'Node.js 后端开发指南', 'https://nodejs.org', ['技术', '后端']),
  createBookmark('4', 'Python Machine Learning', 'https://scikit-learn.org', ['技术', 'AI']),
  createBookmark('5', 'GitHub 开源项目推荐', 'https://github.com/trending', ['工具']),
  createBookmark('6', 'JavaScript 高级程序设计', 'https://javascript.info', ['技术', '前端', 'JS']),
  createBookmark('7', 'TypeScript Handbook', 'https://typescriptlang.org', ['技术', '前端']),
  createBookmark('8', 'CSS Grid 完全指南', 'https://css-tricks.com/grid', ['技术', '前端', 'CSS']),
];

// ==================== 测试 ====================

describe('BookmarkIndexer', () => {
  let indexer;

  beforeEach(() => {
    indexer = new BookmarkIndexer();
  });

  // ─── 1. 基本索引构建 ─────────────────────────────────────────────────────────

  it('1. buildIndex 构建索引后 getSize 返回正确数量', () => {
    indexer.buildIndex(sampleBookmarks);

    const size = indexer.getSize();
    assert.equal(size.bookmarks, 8, '应索引 8 个书签');
    assert.ok(size.tokens > 0, '应有索引 token');
    assert.ok(size.folders > 0, '应有文件夹索引');
  });

  // ─── 2. 中文搜索 ─────────────────────────────────────────────────────────────

  it('2. 中文关键词搜索返回匹配结果', () => {
    indexer.buildIndex(sampleBookmarks);

    const results = indexer.search('文档');
    assert.ok(results.length > 0, '应有匹配结果');
    assert.ok(results.some(r => r.bookmark.title.includes('文档')),
      '结果中应包含标题含"文档"的书签');
  });

  // ─── 3. 英文搜索 ─────────────────────────────────────────────────────────────

  it('3. 英文关键词搜索返回匹配结果', () => {
    indexer.buildIndex(sampleBookmarks);

    const results = indexer.search('React');
    assert.ok(results.length > 0, '应有匹配结果');
    assert.ok(results.some(r => r.bookmark.title.includes('React')),
      '结果中应包含含"React"的书签');
  });

  // ─── 4. 多关键词 AND 搜索 ────────────────────────────────────────────────────

  it('4. 多关键词搜索使用 AND 逻辑', () => {
    indexer.buildIndex(sampleBookmarks);

    const results = indexer.search('JavaScript 高级');
    assert.ok(results.length > 0, '应有匹配结果');
    assert.ok(results.some(r => r.bookmark.title.includes('JavaScript 高级')),
      '结果应匹配所有关键词');
  });

  it('5. 不完全匹配时返回空结果 (AND 逻辑)', () => {
    indexer.buildIndex(sampleBookmarks);

    const results = indexer.search('React Python');
    // 无书签同时包含 "React" 和 "Python"
    assert.equal(results.length, 0, 'AND 逻辑: 无同时匹配的书签应返回空');
  });

  // ─── 5. 空索引/空查询处理 ────────────────────────────────────────────────────

  it('6. 空索引搜索返回空结果', () => {
    indexer.buildIndex([]);

    const results = indexer.search('React');
    assert.deepEqual(results, [], '空索引应返回空结果');
  });

  it('7. 空查询返回空结果', () => {
    indexer.buildIndex(sampleBookmarks);

    assert.deepEqual(indexer.search(''), [], '空字符串查询应返回空');
    assert.deepEqual(indexer.search(null), [], 'null 查询应返回空');
    assert.deepEqual(indexer.search(undefined), [], 'undefined 查询应返回空');
  });

  it('8. buildIndex(null) 不抛异常', () => {
    indexer.buildIndex(null);
    assert.equal(indexer.getSize().bookmarks, 0, '传入 null 应安全处理');
  });

  // ─── 6. 增量添加书签 ─────────────────────────────────────────────────────────

  it('9. addBookmark 增量添加书签可搜索', () => {
    indexer.buildIndex(sampleBookmarks);

    const newBookmark = createBookmark('100', 'Deno 运行时入门', 'https://deno.land', ['技术', '后端']);
    indexer.addBookmark(newBookmark);

    const results = indexer.search('Deno');
    assert.ok(results.length > 0, '新增的书签应可搜索到');
    assert.equal(results[0].bookmark.id, '100');
  });

  it('10. addBookmark 不影响已有索引', () => {
    indexer.buildIndex(sampleBookmarks);

    const newBookmark = createBookmark('200', '测试书签', 'https://test.com', ['测试']);
    indexer.addBookmark(newBookmark);

    // 原有搜索仍有效
    const results = indexer.search('React');
    assert.ok(results.length > 0, '原有书签应仍可搜索');

    // 新书签也可搜索
    const newResults = indexer.search('测试书签');
    assert.ok(newResults.length > 0, '新书签应可搜索');
  });

  // ─── 7. 增量删除书签 ─────────────────────────────────────────────────────────

  it('11. removeBookmark 删除书签后不可搜索', () => {
    indexer.buildIndex(sampleBookmarks);

    const removed = indexer.removeBookmark('1');
    assert.equal(removed, true, '删除应返回 true');

    // 搜索 "React 官方文档" 中 "官方" 只在该书签出现
    const size = indexer.getSize();
    assert.equal(size.bookmarks, 7, '索引大小应减 1');
  });

  it('12. removeBookmark 不存在的 ID 返回 false', () => {
    indexer.buildIndex(sampleBookmarks);

    const removed = indexer.removeBookmark('nonexistent');
    assert.equal(removed, false, '删除不存在的书签应返回 false');
  });

  // ─── 8. 按文件夹过滤 ─────────────────────────────────────────────────────────

  it('13. search 支持按文件夹过滤', () => {
    indexer.buildIndex(sampleBookmarks);

    const frontendResults = indexer.search('技术', { folder: '前端' });
    assert.ok(frontendResults.length > 0, '应有前端文件夹的结果');
    for (const r of frontendResults) {
      assert.ok(r.bookmark.folderPath.includes('前端'),
        `书签 "${r.bookmark.title}" 应在前端文件夹下`);
    }

    const backendResults = indexer.search('技术', { folder: '后端' });
    assert.ok(backendResults.length > 0, '应有后端文件夹的结果');
    for (const r of backendResults) {
      assert.ok(r.bookmark.folderPath.includes('后端'),
        `书签 "${r.bookmark.title}" 应在后端文件夹下`);
    }
  });

  // ─── 9. 按标签过滤 ──────────────────────────────────────────────────────────

  it('14. search 支持按标签过滤', () => {
    const taggedBookmarks = [
      createBookmark('1', 'React 教程', 'https://react.dev', ['前端'], ['javascript', 'frontend']),
      createBookmark('2', 'Vue 教程', 'https://vuejs.org', ['前端'], ['javascript', 'frontend']),
      createBookmark('3', 'Django 教程', 'https://djangoproject.com', ['后端'], ['python', 'backend']),
    ];

    indexer.buildIndex(taggedBookmarks);

    const results = indexer.search('教程', { tags: ['javascript'] });
    assert.equal(results.length, 2, '标签 "javascript" 应匹配 2 个书签');
    for (const r of results) {
      assert.ok(r.bookmark.tags.includes('javascript'));
    }

    const pyResults = indexer.search('教程', { tags: ['python'] });
    assert.equal(pyResults.length, 1, '标签 "python" 应匹配 1 个书签');
  });

  // ─── 10. URL 关键词搜索 ──────────────────────────────────────────────────────

  it('15. 通过 URL 域名关键词搜索', () => {
    indexer.buildIndex(sampleBookmarks);

    const results = indexer.search('github');
    assert.ok(results.length > 0, '搜索域名关键词应有结果');
    assert.ok(results.some(r => r.bookmark.url.includes('github.com')));
  });

  // ─── 11. 搜索结果按匹配度排序 ────────────────────────────────────────────────

  it('16. 搜索结果按匹配分数降序排列', () => {
    const bookmarks = [
      createBookmark('1', 'JavaScript 教程', 'https://example.com', ['技术']),
      createBookmark('2', 'JavaScript 高级程序设计', 'https://javascript.info', ['技术', '前端']),
    ];

    indexer.buildIndex(bookmarks);

    const results = indexer.search('JavaScript');
    assert.ok(results.length === 2, '应有 2 个结果');
    // 包含 "JavaScript" 的标题 + URL 的应分数更高
    assert.ok(results[0].score >= results[1].score, '分数应降序排列');
  });

  // ─── 12. limit 参数 ─────────────────────────────────────────────────────────

  it('17. search limit 参数限制返回数量', () => {
    indexer.buildIndex(sampleBookmarks);

    const results = indexer.search('技术', { limit: 3 });
    assert.ok(results.length <= 3, '结果数不应超过 limit');
  });

  // ─── 13. 性能测试 (1000 条书签) ──────────────────────────────────────────────

  it('18. 构建 1000 条书签索引 < 3 秒', () => {
    const bigBookmarks = [];
    for (let i = 0; i < 1000; i++) {
      const folderIdx = Math.floor(i / 100);
      bigBookmarks.push(
        createBookmark(
          String(i),
          `Bookmark ${i} 书签标题${i}`,
          `https://example.com/page/${i}`,
          [`Folder${folderIdx}`, `Sub${i % 10}`],
        ),
      );
    }

    const start = Date.now();
    indexer.buildIndex(bigBookmarks);
    const elapsed = Date.now() - start;

    assert.equal(indexer.getSize().bookmarks, 1000, '应索引 1000 个书签');
    assert.ok(elapsed < 3000, `索引构建时间 ${elapsed}ms 应 < 3000ms`);
  });

  it('19. 1000 条书签中搜索响应 < 100ms', () => {
    const bigBookmarks = [];
    for (let i = 0; i < 1000; i++) {
      const folderIdx = Math.floor(i / 100);
      bigBookmarks.push(
        createBookmark(
          String(i),
          `Bookmark ${i} 技术文章 ${i % 3 === 0 ? 'React' : i % 3 === 1 ? 'Vue' : 'Angular'}`,
          `https://example.com/page/${i}`,
          [`Folder${folderIdx}`, `Sub${i % 10}`],
        ),
      );
    }

    indexer.buildIndex(bigBookmarks);

    const start = Date.now();
    const results = indexer.search('React');
    const elapsed = Date.now() - start;

    assert.ok(results.length > 0, '应有搜索结果');
    assert.ok(elapsed < 100, `搜索响应时间 ${elapsed}ms 应 < 100ms`);
  });

  // ─── 14. 中文混合搜索 ────────────────────────────────────────────────────────

  it('20. 中英文混合查询搜索', () => {
    indexer.buildIndex(sampleBookmarks);

    const results = indexer.search('前端 TypeScript');
    assert.ok(results.length > 0, '中英文混合搜索应有结果');
    const ts = results.find(r => r.bookmark.title.includes('TypeScript'));
    assert.ok(ts, '应找到 TypeScript Handbook');
  });

  // ─── 15. 文件夹索引层级 ──────────────────────────────────────────────────────

  it('21. 文件夹层级索引正确构建', () => {
    indexer.buildIndex(sampleBookmarks);

    const size = indexer.getSize();
    assert.ok(size.folders >= 5, `应有多个文件夹层级，实际 ${size.folders}`);
  });

  // ─── 16. 删除后再次添加 ─────────────────────────────────────────────────────

  it('22. 删除后重新添加同一 ID 可正常搜索', () => {
    indexer.buildIndex(sampleBookmarks);

    indexer.removeBookmark('1');

    // 重新添加
    const newBookmark = createBookmark('1', 'React 新版文档', 'https://react.dev/new', ['技术', '前端']);
    indexer.addBookmark(newBookmark);

    const results = indexer.search('新版');
    assert.ok(results.length > 0, '重新添加的书签应可搜索');
    assert.equal(results[0].bookmark.title, 'React 新版文档');
  });

  // ─── 17. URL 路径分词 ────────────────────────────────────────────────────────

  it('23. URL 路径中的关键词可被搜索', () => {
    indexer.buildIndex(sampleBookmarks);

    const results = indexer.search('trending');
    assert.ok(results.length > 0, 'URL 路径中的 "trending" 应可搜索');
    assert.ok(results.some(r => r.bookmark.url.includes('trending')));
  });

  // ─── 18. 无 folderPath 书签处理 ──────────────────────────────────────────────

  it('24. 无 folderPath 的书签正确索引和搜索', () => {
    const bookmarks = [
      createBookmark('1', '无文件夹书签', 'https://example.com'),
      // folderPath = [] (默认)
    ];

    indexer.buildIndex(bookmarks);
    assert.equal(indexer.getSize().bookmarks, 1);

    const results = indexer.search('无文件夹');
    assert.ok(results.length > 0, '无 folderPath 的书签应可搜索');
  });
});
