/**
 * E2E 测试 — 书签采集→图谱→搜索流程
 *
 * 覆盖：书签采集、图谱构建、搜索、详情查看
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChromeExtensionEnv,
  createMockBookmarkTree,
  countBookmarks,
  waitFor,
} from '../helpers/e2e-helper.js';

let env;

beforeEach(() => {
  env = createChromeExtensionEnv();
  // Load mock bookmarks into the tree
  const tree = createMockBookmarkTree();
  env.bookmarksTree.push(...tree);
});

afterEach(() => {
  env.cleanup();
});

// ==================== 书签采集 ====================

describe('E2E: 书签 — 采集', () => {

  it('应能获取书签树', async () => {
    const tree = await env.chrome.bookmarks.getTree();
    assert.ok(Array.isArray(tree));
    assert.ok(tree.length > 0);
    assert.ok(tree[0].children);
  });

  it('应正确计算书签总数', async () => {
    const tree = await env.chrome.bookmarks.getTree();
    const count = countBookmarks(tree);
    assert.ok(count >= 6, `Expected >= 6 bookmarks, got ${count}`);
  });

  it('应能搜索书签', async () => {
    const results = await env.chrome.bookmarks.search({ query: 'React' });
    assert.ok(results.length > 0);
    assert.ok(results.some(b => b.title.includes('React')));
  });

  it('搜索不存在的书签应返回空', async () => {
    const results = await env.chrome.bookmarks.search({ query: 'NonExistentBookmark12345' });
    assert.equal(results.length, 0);
  });

  it('应能通过 ID 获取书签', async () => {
    const results = await env.chrome.bookmarks.get('3');
    assert.ok(results.length > 0);
    assert.equal(results[0].title, 'React Documentation');
    assert.equal(results[0].url, 'https://react.dev');
  });
});

// ==================== 书签图谱 ====================

describe('E2E: 书签 — 图谱', () => {

  it('应能从书签构建图谱节点', async () => {
    const tree = await env.chrome.bookmarks.getTree();

    // Simulate graph node extraction
    function extractNodes(nodes, parentId = null) {
      const result = [];
      for (const node of nodes) {
        if (node.url) {
          result.push({
            id: node.id,
            label: node.title,
            url: node.url,
            parentId,
            type: 'bookmark',
          });
        }
        if (node.children) {
          result.push(...extractNodes(node.children, node.id));
        }
      }
      return result;
    }

    const nodes = extractNodes(tree);
    assert.ok(nodes.length >= 6);

    // All nodes should have required fields
    for (const node of nodes) {
      assert.ok(node.id);
      assert.ok(node.label);
      assert.ok(node.url);
      assert.equal(node.type, 'bookmark');
    }
  });

  it('应能从书签构建图谱边（文件夹→书签关系）', async () => {
    const tree = await env.chrome.bookmarks.getTree();

    function extractEdges(nodes) {
      const edges = [];
      for (const node of nodes) {
        if (node.children) {
          for (const child of node.children) {
            edges.push({ from: node.id, to: child.id, type: 'contains' });
            if (child.children) {
              edges.push(...extractEdges([child]));
            }
          }
        }
      }
      return edges;
    }

    const edges = extractEdges(tree);
    assert.ok(edges.length > 0);

    // Each edge should have from and to
    for (const edge of edges) {
      assert.ok(edge.from);
      assert.ok(edge.to);
      assert.equal(edge.type, 'contains');
    }
  });

  it('图谱节点数量应等于书签总数', async () => {
    const tree = await env.chrome.bookmarks.getTree();
    const bookmarkCount = countBookmarks(tree);

    function extractLeafNodes(nodes) {
      let count = 0;
      for (const node of nodes) {
        if (node.url) count++;
        if (node.children) count += extractLeafNodes(node.children);
      }
      return count;
    }

    const leafCount = extractLeafNodes(tree);
    assert.equal(leafCount, bookmarkCount);
  });
});

// ==================== 书签搜索 ====================

describe('E2E: 书签 — 搜索', () => {

  it('应支持模糊搜索', async () => {
    const results = await env.chrome.bookmarks.search({ query: 'doc' });
    assert.ok(results.length > 0);
    assert.ok(results.some(b => b.title.toLowerCase().includes('doc')));
  });

  it('应支持按域名搜索', async () => {
    const results = await env.chrome.bookmarks.search({ query: 'github' });
    assert.ok(results.length > 0);
    assert.ok(results.some(b => b.url && b.url.includes('github')));
  });

  it('搜索应区分大小写（统一转小写）', async () => {
    const results1 = await env.chrome.bookmarks.search({ query: 'React' });
    const results2 = await env.chrome.bookmarks.search({ query: 'react' });
    // Both should find results since we lowercase in search
    assert.ok(results1.length > 0);
    assert.ok(results2.length > 0);
  });
});

// ==================== 书签创建和删除 ====================

describe('E2E: 书签 — 创建和删除', () => {

  it('应能创建新书签', async () => {
    const newBookmark = await env.chrome.bookmarks.create({
      title: 'New Test Bookmark',
      url: 'https://example.com/new',
    });

    assert.ok(newBookmark);
    assert.equal(newBookmark.title, 'New Test Bookmark');
    assert.equal(newBookmark.url, 'https://example.com/new');
    assert.ok(newBookmark.id);
  });

  it('创建书签后总数应增加', async () => {
    const treeBefore = await env.chrome.bookmarks.getTree();
    const countBefore = countBookmarks(treeBefore);

    await env.chrome.bookmarks.create({
      title: 'Another Bookmark',
      url: 'https://example.com/another',
    });

    const treeAfter = await env.chrome.bookmarks.getTree();
    const countAfter = countBookmarks(treeAfter);
    assert.equal(countAfter, countBefore + 1);
  });

  it('应能删除书签', async () => {
    const tree = await env.chrome.bookmarks.getTree();
    const countBefore = countBookmarks(tree);

    // Delete bookmark with id '9' (GitHub)
    await env.chrome.bookmarks.removeTree('9');

    const treeAfter = await env.chrome.bookmarks.getTree();
    const countAfter = countBookmarks(treeAfter);
    assert.equal(countAfter, countBefore - 1);
  });
});
