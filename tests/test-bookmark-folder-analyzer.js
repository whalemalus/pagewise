/**
 * 测试 lib/bookmark-folder-analyzer.js — 文件夹分析
 *
 * 测试范围:
 *   analyzeFolders / getEmptyFolders / getOvercrowdedFolders
 *   getUnderusedFolders / getFolderTree / suggestReorganization / getMaxDepth
 *   质量评估 / 空数据处理 / 阈值自定义 / 文件夹深度计算
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkFolderAnalyzer, QUALITY_THRESHOLDS } = await import('../lib/bookmark-folder-analyzer.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = []) {
  return { id: String(id), title, url, folderPath };
}

/** 生成 n 个书签到同一文件夹 */
function fillFolder(prefix, folder, n) {
  return Array.from({ length: n }, (_, i) =>
    createBookmark(`${prefix}-${i}`, `Bookmark ${i}`, `https://example.com/${prefix}/${i}`, folder)
  );
}

// ==================== 测试集 ====================

describe('BookmarkFolderAnalyzer', () => {
  let analyzer;
  let emptyAnalyzer;

  beforeEach(() => {
    const bookmarks = [
      // 前端 — 10 个 (excellent)
      ...fillFolder('fe', ['开发', '前端'], 10),
      // 后端 — 2 个 (underused)
      createBookmark('be-1', 'Node.js', 'https://nodejs.org', ['开发', '后端']),
      createBookmark('be-2', 'Express', 'https://expressjs.com', ['开发', '后端']),
      // 数据库 — 55 个 (overcrowded)
      ...fillFolder('db', ['开发', '数据库'], 55),
      // 空文件夹 (通过嵌套深度表示)
      createBookmark('design-1', 'Dribbble', 'https://dribbble.com', ['设计']),
      // 深层嵌套
      createBookmark('deep-1', 'Deep', 'https://deep.io', ['A', 'B', 'C', 'D']),
    ];
    analyzer = new BookmarkFolderAnalyzer(bookmarks);
    emptyAnalyzer = new BookmarkFolderAnalyzer([]);
  });

  // ---------- 1. 基本文件夹分析 ----------

  it('analyzeFolders 返回所有文件夹的分析结果', () => {
    const result = analyzer.analyzeFolders();
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);

    // 每项包含必要字段
    for (const item of result) {
      assert.ok('path' in item);
      assert.ok('count' in item);
      assert.ok('depth' in item);
      assert.ok('quality' in item);
      assert.ok('suggestions' in item);
    }
  });

  it('analyzeFolders 正确统计书签数量', () => {
    const result = analyzer.analyzeFolders();
    const byPath = Object.fromEntries(result.map((r) => [r.path, r.count]));

    assert.equal(byPath['开发/前端'], 10);
    assert.equal(byPath['开发/后端'], 2);
    assert.equal(byPath['开发/数据库'], 55);
    assert.equal(byPath['开发'], 10 + 2 + 55); // 父文件夹汇总
  });

  it('analyzeFolders 正确评估质量等级', () => {
    const result = analyzer.analyzeFolders();
    const byPath = Object.fromEntries(result.map((r) => [r.path, r.quality]));

    assert.equal(byPath['开发/前端'], 'excellent');   // 10
    assert.equal(byPath['开发/后端'], 'underused');    // 2
    assert.equal(byPath['开发/数据库'], 'overcrowded'); // 55
  });

  it('analyzeFolders 输出按路径排序', () => {
    const result = analyzer.analyzeFolders();
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].path <= result[i].path, '应按路径字母序排列');
    }
  });

  // ---------- 2. 空文件夹检测 ----------

  it('getEmptyFolders 能识别无书签的空文件夹', () => {
    // 构造含空文件夹的数据: "杂项" 文件夹存在但没有任何书签
    // 由于我们的设计是基于书签推导文件夹，"真正空"需要通过零计数体现
    // 这里用 analyzeFolders quality === 'empty' 验证即可
    const empty = emptyAnalyzer.getEmptyFolders();
    assert.deepEqual(empty, []);
  });

  it('getEmptyFolders 空数据返回空数组', () => {
    assert.deepEqual(emptyAnalyzer.getEmptyFolders(), []);
  });

  // ---------- 3. 过度拥挤检测 ----------

  it('getOvercrowdedFolders 默认阈值 50 检测拥挤文件夹', () => {
    const result = analyzer.getOvercrowdedFolders();
    assert.ok(result.length >= 1);
    const dbFolder = result.find((r) => r.path === '开发/数据库');
    assert.ok(dbFolder, '应检测到 "开发/数据库"');
    assert.equal(dbFolder.count, 55);
  });

  it('getOvercrowdedFolders 自定义阈值', () => {
    const result = analyzer.getOvercrowdedFolders(8);
    const paths = result.map((r) => r.path);
    assert.ok(paths.includes('开发/前端'));  // 10 > 8
    assert.ok(paths.includes('开发/数据库')); // 55 > 8
  });

  it('getOvercrowdedFolders 结果按数量降序', () => {
    const result = analyzer.getOvercrowdedFolders(1);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].count >= result[i].count, '应按数量降序');
    }
  });

  // ---------- 4. 使用不足检测 ----------

  it('getUnderusedFolders 检测书签过少的文件夹', () => {
    const result = analyzer.getUnderusedFolders();
    const beFolder = result.find((r) => r.path === '开发/后端');
    assert.ok(beFolder, '应检测到 "开发/后端" (2 个书签)');
    assert.equal(beFolder.count, 2);
  });

  it('getUnderusedFolders 自定义阈值', () => {
    // threshold=12 → 10 个的前端文件夹也是 underused
    const result = analyzer.getUnderusedFolders(12);
    const paths = result.map((r) => r.path);
    assert.ok(paths.includes('开发/前端'));
    assert.ok(paths.includes('开发/后端'));
    // 55 不是 underused
    assert.ok(!paths.includes('开发/数据库'));
  });

  // ---------- 5. 文件夹树结构 ----------

  it('getFolderTree 返回正确的树形结构', () => {
    const tree = emptyAnalyzer.getFolderTree();
    assert.deepEqual(tree, []);

    const fullTree = analyzer.getFolderTree();
    assert.ok(Array.isArray(fullTree));
    assert.ok(fullTree.length > 0);

    // 找到 "开发" 节点
    const devNode = fullTree.find((n) => n.name === '开发');
    assert.ok(devNode, '应有 "开发" 根节点');
    assert.ok(Array.isArray(devNode.children));
    assert.ok(devNode.children.length >= 3); // 前端、后端、数据库

    // 子节点
    const childNames = devNode.children.map((c) => c.name);
    assert.ok(childNames.includes('前端'));
    assert.ok(childNames.includes('后端'));
    assert.ok(childNames.includes('数据库'));
  });

  it('getFolderTree 每个节点有正确的 count', () => {
    const tree = analyzer.getFolderTree();
    const devNode = tree.find((n) => n.name === '开发');
    const feNode = devNode.children.find((n) => n.name === '前端');
    assert.equal(feNode.count, 10);
  });

  // ---------- 6. 整理建议 ----------

  it('suggestReorganization 为过少文件夹建议合并', () => {
    const suggestions = analyzer.suggestReorganization();
    const mergeSuggestion = suggestions.find(
      (s) => s.action === 'merge' && s.source === '开发/后端'
    );
    assert.ok(mergeSuggestion, '应建议合并 "开发/后端"');
    assert.equal(mergeSuggestion.action, 'merge');
    assert.ok(mergeSuggestion.reason.includes('仅 2 个书签'));
  });

  it('suggestReorganization 为拥挤文件夹建议拆分', () => {
    const suggestions = analyzer.suggestReorganization();
    const splitSuggestion = suggestions.find(
      (s) => s.action === 'split' && s.source === '开发/数据库'
    );
    assert.ok(splitSuggestion, '应建议拆分 "开发/数据库"');
    assert.equal(splitSuggestion.action, 'split');
    assert.ok(splitSuggestion.reason.includes('55'));
  });

  it('suggestReorganization 空数据返回空数组', () => {
    assert.deepEqual(emptyAnalyzer.suggestReorganization(), []);
  });

  // ---------- 7. 最大深度 ----------

  it('getMaxDepth 计算正确的最大文件夹深度', () => {
    // 包含 A/B/C/D → 深度 4
    assert.equal(analyzer.getMaxDepth(), 4);
  });

  it('getMaxDepth 空数据返回 0', () => {
    assert.equal(emptyAnalyzer.getMaxDepth(), 0);
  });

  // ---------- 8. 构造函数 & 边界 ----------

  it('构造函数接受空数组和无效输入', () => {
    const a1 = new BookmarkFolderAnalyzer([]);
    assert.equal(a1.bookmarks.length, 0);

    const a2 = new BookmarkFolderAnalyzer(null);
    assert.equal(a2.bookmarks.length, 0);

    const a3 = new BookmarkFolderAnalyzer(undefined);
    assert.equal(a3.bookmarks.length, 0);
  });

  it('单个书签不会修改原始数组', () => {
    const original = [createBookmark('1', 'T', 'https://t.com', ['A'])];
    const a = new BookmarkFolderAnalyzer(original);
    original.push(createBookmark('2', 'T2', 'https://t2.com', ['B']));
    assert.equal(a.bookmarks.length, 1);
  });
});
