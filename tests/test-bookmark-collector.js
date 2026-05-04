/**
 * 测试 lib/bookmark-collector.js — 书签采集器
 *
 * 测试范围:
 *   collect / normalize / getStats / 边界情况
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';

installChromeMock();

const { BookmarkCollector } = await import('../lib/bookmark-collector.js');

// ==================== 辅助: 构造 mock 书签树 ====================

/**
 * 创建简单书签树 mock
 */
function createMockTree(children) {
  return [{
    id: '0',
    title: '',
    children: children || [],
  }];
}

/**
 * 创建文件夹节点
 */
function folder(id, title, children = []) {
  return { id, title, children };
}

/**
 * 创建书签节点
 */
function bookmark(id, title, url, dateAdded = 1609459200000) {
  return { id, title, url, dateAdded };
}

// ==================== 测试 ====================

describe('BookmarkCollector', () => {
  let collector;

  beforeEach(() => {
    resetChromeMock();
    collector = new BookmarkCollector();
  });

  afterEach(() => {
    resetChromeMock();
  });

  // ─── 1. 基本采集功能 ────────────────────────────────────────────────────────

  it('1. collect() 返回标准化书签数组', async () => {
    chrome.bookmarks = {
      getTree: async () => createMockTree([
        bookmark('1', 'React', 'https://react.dev', 1700000000000),
        bookmark('2', 'MDN', 'https://developer.mozilla.org', 1700000001000),
      ]),
    };

    const result = await collector.collect();

    assert.equal(result.length, 2, '应采集到 2 个书签');
    assert.equal(result[0].id, '1');
    assert.equal(result[0].title, 'React');
    assert.equal(result[0].url, 'https://react.dev');
    assert.ok(result[0].dateAddedISO, '应有 ISO 日期');
    assert.deepEqual(result[0].folderPath, []);
  });

  // ─── 2. 空书签树 ────────────────────────────────────────────────────────────

  it('2. 空书签树返回空数组', async () => {
    chrome.bookmarks = {
      getTree: async () => createMockTree([]),
    };

    const result = await collector.collect();

    assert.equal(result.length, 0, '空书签树应返回 0 个书签');
  });

  it('3. getTree 返回空数组时返回空结果', async () => {
    chrome.bookmarks = {
      getTree: async () => [],
    };

    const result = await collector.collect();

    assert.equal(result.length, 0, '空 tree 数组应返回 0 个书签');
  });

  // ─── 4. 嵌套文件夹处理 ──────────────────────────────────────────────────────

  it('4. 正确处理嵌套文件夹路径', async () => {
    chrome.bookmarks = {
      getTree: async () => createMockTree([
        folder('10', '技术', [
          folder('11', '前端', [
            bookmark('20', 'React Docs', 'https://react.dev'),
            bookmark('21', 'Vue Docs', 'https://vuejs.org'),
          ]),
          folder('12', '后端', [
            bookmark('22', 'Node.js', 'https://nodejs.org'),
          ]),
        ]),
      ]),
    };

    const result = await collector.collect();

    assert.equal(result.length, 3);

    const react = result.find(b => b.title === 'React Docs');
    assert.deepEqual(react.folderPath, ['技术', '前端'], 'React 应在 技术/前端 路径下');

    const vue = result.find(b => b.title === 'Vue Docs');
    assert.deepEqual(vue.folderPath, ['技术', '前端'], 'Vue 应在 技术/前端 路径下');

    const node = result.find(b => b.title === 'Node.js');
    assert.deepEqual(node.folderPath, ['技术', '后端'], 'Node.js 应在 技术/后端 路径下');
  });

  // ─── 5. 跳过文件夹节点 ──────────────────────────────────────────────────────

  it('5. 跳过无 URL 的文件夹节点', async () => {
    chrome.bookmarks = {
      getTree: async () => createMockTree([
        folder('10', '空文件夹', []),
        bookmark('11', 'Google', 'https://google.com'),
      ]),
    };

    const result = await collector.collect();

    assert.equal(result.length, 1, '文件夹不应出现在结果中');
    assert.equal(result[0].title, 'Google');
  });

  // ─── 6. 重复书签处理 (同 URL 不同文件夹) ────────────────────────────────────

  it('6. 同 URL 不同文件夹的重复书签都保留', async () => {
    chrome.bookmarks = {
      getTree: async () => createMockTree([
        folder('10', '前端', [
          bookmark('20', 'React', 'https://react.dev'),
        ]),
        folder('11', '框架', [
          bookmark('21', 'React Framework', 'https://react.dev'),
        ]),
      ]),
    };

    const result = await collector.collect();

    assert.equal(result.length, 2, '两个同 URL 不同文件夹的书签都应保留');
    assert.equal(result[0].url, 'https://react.dev');
    assert.equal(result[1].url, 'https://react.dev');
    assert.deepEqual(result[0].folderPath, ['前端']);
    assert.deepEqual(result[1].folderPath, ['框架']);

    // URL 索引应包含两个
    const reactBookmarks = collector._urlIndex.get('https://react.dev');
    assert.equal(reactBookmarks.length, 2, 'URL 索引应包含两个条目');
  });

  // ─── 7. 特殊字符处理 ────────────────────────────────────────────────────────

  it('7. 正确处理特殊字符标题', async () => {
    chrome.bookmarks = {
      getTree: async () => createMockTree([
        bookmark('1', 'C++ & STL <reference>', 'https://cppreference.com'),
        bookmark('2', '日本語ブックマーク', 'https://example.jp'),
        bookmark('3', '🚀 Emoji Title ⭐', 'https://emoji.example.com'),
        bookmark('4', '', 'https://empty-title.example.com'),
      ]),
    };

    const result = await collector.collect();

    assert.equal(result.length, 4);
    assert.equal(result[0].title, 'C++ & STL <reference>');
    assert.equal(result[1].title, '日本語ブックマーク');
    assert.equal(result[2].title, '🚀 Emoji Title ⭐');
    assert.equal(result[3].title, '', '空标题应保留为空字符串');
  });

  // ─── 8. normalize() 方法 ────────────────────────────────────────────────────

  it('8. normalize 正确转换节点', () => {
    const node = bookmark('42', 'Test', 'https://example.com', 1700000000000);
    const normalized = collector.normalize(node, ['文件夹A']);

    assert.equal(normalized.id, '42');
    assert.equal(normalized.title, 'Test');
    assert.equal(normalized.url, 'https://example.com');
    assert.deepEqual(normalized.folderPath, ['文件夹A']);
    assert.equal(normalized.dateAdded, 1700000000000);
    assert.ok(normalized.dateAddedISO.includes('2023'));
  });

  it('9. normalize 对 null 节点返回 null', () => {
    const result = collector.normalize(null);
    assert.equal(result, null);
  });

  it('10. normalize 对无 URL 节点返回 null', () => {
    const result = collector.normalize({ id: '1', title: '文件夹' });
    assert.equal(result, null);
  });

  it('11. normalize 对无 dateAdded 的节点 dateAdded 为 0', () => {
    const node = { id: '99', title: 'No Date', url: 'https://example.com' };
    const result = collector.normalize(node);

    assert.equal(result.dateAdded, 0);
    assert.equal(result.dateAddedISO, '');
  });

  // ─── 12. getStats() 统计信息 ────────────────────────────────────────────────

  it('12. getStats 返回正确的统计信息', async () => {
    chrome.bookmarks = {
      getTree: async () => createMockTree([
        folder('10', '前端', [
          bookmark('20', 'React', 'https://react.dev'),
          bookmark('21', 'MDN', 'https://developer.mozilla.org'),
        ]),
        folder('11', '工具', [
          bookmark('22', 'GitHub', 'https://github.com'),
          bookmark('23', 'Google', 'https://www.google.com'),
        ]),
      ]),
    };

    await collector.collect();
    const stats = collector.getStats();

    assert.equal(stats.total, 4, '总数应为 4');
    assert.ok(stats.folders >= 2, '至少有 2 个文件夹');
    assert.ok(stats.domainDistribution['react.dev'] === 1);
    assert.ok(stats.domainDistribution['developer.mozilla.org'] === 1);
    assert.ok(stats.domainDistribution['github.com'] === 1);
    assert.ok(stats.domainDistribution['google.com'] === 1, 'www.google.com 应去掉 www 前缀');
  });

  // ─── 13. 无书签时 getStats 返回零值 ──────────────────────────────────────────

  it('13. 无书签时 getStats 返回零值', () => {
    const stats = collector.getStats();

    assert.equal(stats.total, 0);
    assert.equal(stats.folders, 0);
    assert.deepEqual(stats.domainDistribution, {});
  });

  // ─── 14. collect() 在 getTree 失败时返回空数组 (R2 修复) ────────────────────

  it('14. collect() 在 getTree 失败时返回空数组并打印警告', async () => {
    chrome.bookmarks = {
      getTree: async () => { throw new Error('Permission denied'); },
    };

    const result = await collector.collect();
    assert.equal(result.length, 0, 'getTree 失败应返回空数组');
  });

  it('14b. collect() 在 chrome.bookmarks 不存在时返回空数组', async () => {
    // 临时保存并删除 chrome.bookmarks
    const savedBookmarks = chrome.bookmarks;
    chrome.bookmarks = undefined;

    const result = await collector.collect();
    assert.equal(result.length, 0, 'API 不存在应返回空数组');

    // 恢复
    chrome.bookmarks = savedBookmarks;
  });

  // ─── 15. 深层嵌套 (3+ 层文件夹) ─────────────────────────────────────────────

  it('15. 支持 3+ 层深度嵌套文件夹', async () => {
    chrome.bookmarks = {
      getTree: async () => createMockTree([
        folder('10', '技术', [
          folder('11', '前端', [
            folder('12', 'React', [
              folder('13', 'Hooks', [
                bookmark('30', 'useState', 'https://react.dev/reference/react/useState'),
              ]),
            ]),
          ]),
        ]),
      ]),
    };

    const result = await collector.collect();

    assert.equal(result.length, 1);
    assert.deepEqual(
      result[0].folderPath,
      ['技术', '前端', 'React', 'Hooks'],
      '应包含完整 4 层路径',
    );
  });

  // ─── 16. 大批量书签性能 (1000+) ─────────────────────────────────────────────

  it('16. 采集 1000+ 书签在 5 秒内完成', async () => {
    // 构造 1200 个书签的 mock 树
    const children = [];
    for (let i = 0; i < 1200; i++) {
      const folderIdx = Math.floor(i / 100);
      if (i % 100 === 0) {
        children.push(folder(`f${folderIdx}`, `Folder ${folderIdx}`, []));
      }
      children[children.length - 1].children.push(
        bookmark(`b${i}`, `Bookmark ${i}`, `https://example.com/page/${i}`, Date.now() + i),
      );
    }

    chrome.bookmarks = {
      getTree: async () => createMockTree(children),
    };

    const start = Date.now();
    const result = await collector.collect();
    const elapsed = Date.now() - start;

    assert.equal(result.length, 1200, '应采集到 1200 个书签');
    assert.ok(elapsed < 5000, `采集时间 ${elapsed}ms 应 < 5000ms`);

    const stats = collector.getStats();
    assert.equal(stats.total, 1200);
  });

  // ─── 17. Chrome 根节点结构 (多根节点) ────────────────────────────────────────

  it('17. 处理 Chrome 典型根结构 (书签栏+其他+移动)', async () => {
    chrome.bookmarks = {
      getTree: async () => [{
        id: '0', title: '', children: [
          folder('1', '书签栏', [
            bookmark('10', 'GitHub', 'https://github.com'),
          ]),
          folder('2', '其他书签', [
            bookmark('20', 'StackOverflow', 'https://stackoverflow.com'),
          ]),
          folder('3', '移动设备书签', [
            bookmark('30', 'MDN', 'https://developer.mozilla.org'),
          ]),
        ],
      }],
    };

    const result = await collector.collect();

    assert.equal(result.length, 3);
    assert.deepEqual(result[0].folderPath, ['书签栏']);
    assert.deepEqual(result[1].folderPath, ['其他书签']);
    assert.deepEqual(result[2].folderPath, ['移动设备书签']);
  });

  // ─── 18. normalize 不修改原 folderPath 数组 ──────────────────────────────────

  it('18. normalize 返回的 folderPath 是副本，不影响原数组', () => {
    const path = ['技术', '前端'];
    const result = collector.normalize(
      bookmark('1', 'Test', 'https://example.com'),
      path,
    );

    result.folderPath.push('modified');
    assert.equal(path.length, 2, '原始路径不应被修改');
  });
});
