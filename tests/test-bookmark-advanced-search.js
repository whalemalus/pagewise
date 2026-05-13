/**
 * 测试 lib/bookmark-advanced-search.js — 高级搜索
 *
 * 测试范围:
 *   searchByDateRange (日期范围) / searchByDomain (域名) /
 *   searchByTags (标签 AND/OR) / searchByFolder (文件夹) /
 *   advancedSearch (组合过滤)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  searchByDateRange,
  searchByDomain,
  searchByTags,
  searchByFolder,
  advancedSearch,
} = await import('../lib/bookmark-advanced-search.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = [], dateAdded) {
  const ts = dateAdded ?? 1700000000000 + Number(id) * 86400000;
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    status: 'unread',
    dateAdded: ts,
    dateAddedISO: new Date(ts).toISOString(),
  };
}

const sampleBookmarks = [
  createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端'], ['react', 'frontend']),
  createBookmark('2', 'Vue.js 入门教程', 'https://vuejs.org', ['技术', '前端'], ['vue', 'frontend']),
  createBookmark('3', 'Node.js 后端开发指南', 'https://nodejs.org', ['技术', '后端'], ['nodejs', 'backend']),
  createBookmark('4', 'Python ML 教程', 'https://scikit-learn.org', ['技术', 'AI'], ['python', 'ml']),
  createBookmark('5', 'GitHub 趋势', 'https://github.com/trending', ['工具'], ['github']),
  createBookmark('6', 'GitHub Actions CI/CD', 'https://github.com/features/actions', ['工具', 'DevOps'], ['github', 'cicd']),
  createBookmark('7', 'MDN Web Docs', 'https://developer.mozilla.org', ['技术', '前端', '参考'], ['mdn', 'docs', 'frontend']),
  createBookmark('8', 'Stack Overflow', 'https://stackoverflow.com/questions', ['工具', '社区'], ['stackoverflow', 'qa']),
  createBookmark('9', 'React Hooks 深入', 'https://react.dev/hooks', ['技术', '前端'], ['react', 'hooks']),
  createBookmark('10', 'AWS 控制台', 'https://console.aws.amazon.com', ['技术', '云'], ['aws', 'cloud']),
];

// ==================== 测试 ====================

describe('BookmarkAdvancedSearch', () => {

  // ─── searchByDateRange ────────────────────────────────────────────────────────

  describe('searchByDateRange', () => {
    it('1. 在有效日期范围内过滤书签', () => {
      // bm1 dateAdded = 1700000000000 (id=1), bm5 dateAdded = 1700000000000 + 4*86400000
      const start = new Date(1700000000000);
      const end = new Date(1700000000000 + 4 * 86400000);
      const results = searchByDateRange(sampleBookmarks, start, end);

      assert.ok(results.length >= 1, '应有结果');
      for (const bm of results) {
        assert.ok(bm.dateAdded >= start.getTime(), '日期应 >= 起始日期');
        assert.ok(bm.dateAdded <= end.getTime(), '日期应 <= 结束日期');
      }
    });

    it('2. 日期范围无匹配返回空数组', () => {
      // 未来日期范围，所有书签都不在范围内
      const start = new Date('2099-01-01');
      const end = new Date('2099-12-31');
      const results = searchByDateRange(sampleBookmarks, start, end);

      assert.equal(results.length, 0, '未来日期范围应无结果');
    });

    it('3. searchByDateRange null/无效输入返回空数组', () => {
      assert.deepEqual(searchByDateRange(null, new Date(), new Date()), [], 'null 书签应返回空');
      assert.deepEqual(searchByDateRange(undefined, new Date(), new Date()), [], 'undefined 书签应返回空');
      assert.deepEqual(searchByDateRange(sampleBookmarks, null, new Date()), [], 'null startDate 应返回空');
      assert.deepEqual(searchByDateRange(sampleBookmarks, new Date(), null), [], 'null endDate 应返回空');
      assert.deepEqual(searchByDateRange('not-array', new Date(), new Date()), [], '非数组应返回空');
    });

    it('4. 支持字符串日期和数字时间戳', () => {
      const ts = 1700000000000;
      // 用时间戳
      const byTs = searchByDateRange(sampleBookmarks, ts, ts + 86400000);
      assert.ok(byTs.length >= 1, '数字时间戳应有效');

      // 用 ISO 字符串
      const byStr = searchByDateRange(sampleBookmarks, new Date(ts).toISOString(), new Date(ts + 86400000).toISOString());
      assert.ok(byStr.length >= 1, 'ISO 字符串日期应有效');
    });

    it('5. 交换起止日期仍可正常工作', () => {
      const ts = 1700000000000;
      const results1 = searchByDateRange(sampleBookmarks, new Date(ts), new Date(ts + 86400000));
      const results2 = searchByDateRange(sampleBookmarks, new Date(ts + 86400000), new Date(ts));
      assert.equal(results1.length, results2.length, '交换起止日期应返回相同结果');
    });
  });

  // ─── searchByDomain ───────────────────────────────────────────────────────────

  describe('searchByDomain', () => {
    it('6. 精确域名匹配', () => {
      const results = searchByDomain(sampleBookmarks, 'react.dev');
      assert.ok(results.length > 0, '应匹配 react.dev');
      for (const bm of results) {
        assert.ok(bm.url.includes('react.dev'), `URL 应包含 react.dev: ${bm.url}`);
      }
    });

    it('7. 子域名匹配', () => {
      // console.aws.amazon.com 应匹配 aws.amazon.com
      const results = searchByDomain(sampleBookmarks, 'aws.amazon.com');
      assert.ok(results.length >= 1, 'aws.amazon.com 应匹配子域名');

      const found = results.find(bm => bm.url.includes('console.aws.amazon.com'));
      assert.ok(found, 'console.aws.amazon.com 应匹配 aws.amazon.com');
    });

    it('8. 搜索 github.com 匹配多个书签', () => {
      const results = searchByDomain(sampleBookmarks, 'github.com');
      assert.ok(results.length >= 2, 'github.com 应匹配多个书签');
    });

    it('9. searchByDomain null/无效输入返回空数组', () => {
      assert.deepEqual(searchByDomain(null, 'github.com'), [], 'null 书签应返回空');
      assert.deepEqual(searchByDomain(sampleBookmarks, null), [], 'null domain 应返回空');
      assert.deepEqual(searchByDomain(sampleBookmarks, ''), [], '空域名应返回空');
      assert.deepEqual(searchByDomain(sampleBookmarks, undefined), [], 'undefined domain 应返回空');
    });

    it('10. 忽略 www 前缀', () => {
      const bookmarks = [
        createBookmark('99', '测试', 'https://www.example.com', [], []),
      ];
      const results = searchByDomain(bookmarks, 'example.com');
      assert.equal(results.length, 1, '忽略 www 前缀应匹配');
    });
  });

  // ─── searchByTags ─────────────────────────────────────────────────────────────

  describe('searchByTags', () => {
    it('11. 单标签搜索 (OR 模式)', () => {
      const results = searchByTags(sampleBookmarks, ['react']);
      assert.ok(results.length >= 2, 'react 标签应匹配多个书签');
      for (const bm of results) {
        assert.ok(
          bm.tags.map(t => t.toLowerCase()).includes('react'),
          `${bm.title} 应有 react 标签`,
        );
      }
    });

    it('12. 多标签 AND 模式', () => {
      const results = searchByTags(sampleBookmarks, ['react', 'frontend'], true);
      assert.ok(results.length >= 1, 'AND 模式应有结果');
      for (const bm of results) {
        const tags = bm.tags.map(t => t.toLowerCase());
        assert.ok(tags.includes('react'), `${bm.title} 应有 react 标签`);
        assert.ok(tags.includes('frontend'), `${bm.title} 应有 frontend 标签`);
      }
    });

    it('13. 多标签 OR 模式', () => {
      const resultsOr = searchByTags(sampleBookmarks, ['react', 'python'], false);
      const resultsReact = searchByTags(sampleBookmarks, ['react']);
      const resultsPython = searchByTags(sampleBookmarks, ['python']);

      // OR 结果数应 >= 任一单标签结果
      assert.ok(resultsOr.length >= resultsReact.length, 'OR 结果数应 >= react 单标签');
      assert.ok(resultsOr.length >= resultsPython.length, 'OR 结果数应 >= python 单标签');
      assert.ok(resultsOr.length >= resultsReact.length + resultsPython.length - 1, 'OR 结果应接近两者之和');
    });

    it('14. 标签大小写不敏感', () => {
      const results = searchByTags(sampleBookmarks, ['REACT']);
      assert.ok(results.length >= 1, '大写 REACT 应匹配 react 标签');
    });

    it('15. searchByTags null/无效输入返回空数组', () => {
      assert.deepEqual(searchByTags(null, ['react']), [], 'null 书签应返回空');
      assert.deepEqual(searchByTags(sampleBookmarks, null), [], 'null tags 应返回空');
      assert.deepEqual(searchByTags(sampleBookmarks, []), [], '空 tags 应返回空');
      assert.deepEqual(searchByTags(sampleBookmarks, undefined), [], 'undefined tags 应返回空');
      assert.deepEqual(searchByTags(sampleBookmarks, 'not-array'), [], '非数组 tags 应返回空');
    });

    it('16. 标签不存在时返回空数组', () => {
      const results = searchByTags(sampleBookmarks, ['nonexistent-tag-xyz']);
      assert.equal(results.length, 0, '不存在的标签应返回空');
    });
  });

  // ─── searchByFolder ───────────────────────────────────────────────────────────

  describe('searchByFolder', () => {
    it('17. 精确文件夹路径匹配', () => {
      const results = searchByFolder(sampleBookmarks, '技术/前端');
      assert.ok(results.length >= 1, '技术/前端 应有匹配');
      for (const bm of results) {
        assert.ok(
          bm.folderPath.includes('技术') && bm.folderPath.includes('前端'),
          `${bm.title} 应同时包含技术和前端`,
        );
      }
    });

    it('18. 部分文件夹名匹配', () => {
      const results = searchByFolder(sampleBookmarks, '前端');
      assert.ok(results.length >= 1, '部分匹配 "前端" 应有结果');
      for (const bm of results) {
        assert.ok(
          bm.folderPath.some(f => f.includes('前端')),
          `${bm.title} folderPath 应包含 "前端"`,
        );
      }
    });

    it('19. searchByFolder null/无效输入返回空数组', () => {
      assert.deepEqual(searchByFolder(null, '前端'), [], 'null 书签应返回空');
      assert.deepEqual(searchByFolder(sampleBookmarks, null), [], 'null folderPath 应返回空');
      assert.deepEqual(searchByFolder(sampleBookmarks, ''), [], '空 folderPath 应返回空');
      assert.deepEqual(searchByFolder(sampleBookmarks, undefined), [], 'undefined folderPath 应返回空');
    });

    it('20. 不存在的文件夹返回空数组', () => {
      const results = searchByFolder(sampleBookmarks, '不存在的文件夹');
      assert.equal(results.length, 0, '不存在的文件夹应返回空');
    });

    it('21. 匹配深层路径', () => {
      const bookmarks = [
        createBookmark('99', '测试书签', 'https://test.com', ['技术', '前端', 'React', 'Hooks'], []),
      ];
      const results = searchByFolder(bookmarks, '前端/React');
      assert.equal(results.length, 1, '深层路径 应匹配');
    });
  });

  // ─── advancedSearch 组合过滤 ──────────────────────────────────────────────────

  describe('advancedSearch', () => {
    it('22. 无过滤条件返回全部书签', () => {
      const results = advancedSearch(sampleBookmarks, {});
      assert.equal(results.length, sampleBookmarks.length, '空过滤应返回全部书签');
    });

    it('23. 组合域名 + 标签过滤', () => {
      const results = advancedSearch(sampleBookmarks, {
        domain: 'github.com',
        tags: ['github'],
      });

      assert.ok(results.length >= 1, '应有结果');
      for (const bm of results) {
        assert.ok(bm.url.includes('github.com'), `${bm.title} URL 应含 github.com`);
        assert.ok(bm.tags.map(t => t.toLowerCase()).includes('github'), `${bm.title} 应有 github 标签`);
      }
    });

    it('24. 组合文件夹 + 标签 AND 过滤', () => {
      const results = advancedSearch(sampleBookmarks, {
        folderPath: '前端',
        tags: ['react', 'frontend'],
        matchAll: true,
      });

      assert.ok(results.length >= 1, '应有结果');
      for (const bm of results) {
        assert.ok(bm.folderPath.some(f => f.includes('前端')), `${bm.title} 应在前端文件夹`);
        const tags = bm.tags.map(t => t.toLowerCase());
        assert.ok(tags.includes('react'), `${bm.title} 应有 react 标签`);
        assert.ok(tags.includes('frontend'), `${bm.title} 应有 frontend 标签`);
      }
    });

    it('25. 组合日期 + 域名过滤', () => {
      const ts = 1700000000000;
      const results = advancedSearch(sampleBookmarks, {
        startDate: new Date(ts),
        endDate: new Date(ts + 9 * 86400000),
        domain: 'react.dev',
      });

      assert.ok(results.length >= 1, '应有结果');
      for (const bm of results) {
        assert.ok(bm.dateAdded >= ts, '日期应 >= 起始日期');
        assert.ok(bm.url.includes('react.dev'), 'URL 应含 react.dev');
      }
    });

    it('26. advancedSearch 无匹配返回空数组', () => {
      const results = advancedSearch(sampleBookmarks, {
        domain: 'nonexistent-domain-xyz.com',
        tags: ['nonexistent-tag-xyz'],
      });
      assert.equal(results.length, 0, '所有条件均无匹配应返回空');
    });

    it('27. advancedSearch null/无效输入处理', () => {
      assert.deepEqual(advancedSearch(null, {}), [], 'null 书签应返回空');
      assert.deepEqual(advancedSearch(undefined, {}), [], 'undefined 书签应返回空');
      // null filters 应返回全部
      const r = advancedSearch(sampleBookmarks, null);
      assert.equal(r.length, sampleBookmarks.length, 'null filters 应返回全部');
    });

    it('28. 不修改原始数组', () => {
      const original = [...sampleBookmarks];
      advancedSearch(sampleBookmarks, { domain: 'github.com' });
      assert.equal(sampleBookmarks.length, original.length, '原始数组长度不变');
    });
  });
});
