/**
 * 测试 lib/bookmark-status.js — 状态标记
 *
 * 测试范围:
 *   setStatus / getStatus / batchSetStatus
 *   getByStatus / getStatusCounts / markAllAsRead / getRecentlyRead
 *   空输入 / 无效状态 / 未知书签 ID
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkStatusManager, VALID_STATUSES } = await import('../lib/bookmark-status.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = []) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    dateAdded: 1700000000000 + Number(id) * 1000,
  };
}

// ==================== 样例数据 ====================

const sampleBookmarks = [
  createBookmark('1', 'React 入门', 'https://react.dev'),
  createBookmark('2', 'Vue 3 教程', 'https://vuejs.org'),
  createBookmark('3', 'CSS Flexbox 指南', 'https://css-tricks.com'),
  createBookmark('4', 'JavaScript 高级程序设计', 'https://example.com/js'),
  createBookmark('5', 'TypeScript 手册', 'https://typescriptlang.org'),
  createBookmark('6', 'Webpack 配置详解', 'https://webpack.js.org'),
  createBookmark('7', 'Vite 入门', 'https://vitejs.dev'),
  createBookmark('8', '前端工程化实践', 'https://example.com/fe'),
];

// ==================== 测试用例 ====================

describe('BookmarkStatusManager', () => {

  // ---------- 1. 设置/获取状态 ----------

  it('默认状态为 unread', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    assert.equal(mgr.getStatus('1'), 'unread');
    assert.equal(mgr.getStatus('5'), 'unread');
  });

  it('setStatus 设置状态后 getStatus 返回新状态', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    assert.equal(mgr.setStatus('1', 'reading'), true);
    assert.equal(mgr.getStatus('1'), 'reading');
    assert.equal(mgr.setStatus('1', 'read'), true);
    assert.equal(mgr.getStatus('1'), 'read');
  });

  it('未知书签 ID 返回 null', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    assert.equal(mgr.getStatus('999'), null);
    assert.equal(mgr.setStatus('999', 'read'), false);
  });

  // ---------- 2. 无效状态处理 ----------

  it('无效状态值返回 false / null', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    assert.equal(mgr.setStatus('1', 'done'), false);
    assert.equal(mgr.setStatus('1', ''), false);
    assert.equal(mgr.setStatus('1', null), false);
    // 状态应保持不变
    assert.equal(mgr.getStatus('1'), 'unread');
  });

  it('getByStatus 传入无效状态返回空数组', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    assert.deepEqual(mgr.getByStatus('invalid'), []);
    assert.deepEqual(mgr.getByStatus(''), []);
  });

  // ---------- 3. 批量状态修改 ----------

  it('batchSetStatus 批量设置状态', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    const count = mgr.batchSetStatus(['1', '2', '3'], 'reading');
    assert.equal(count, 3);
    assert.equal(mgr.getStatus('1'), 'reading');
    assert.equal(mgr.getStatus('2'), 'reading');
    assert.equal(mgr.getStatus('3'), 'reading');
    assert.equal(mgr.getStatus('4'), 'unread');
  });

  it('batchSetStatus 混合有效/无效 ID 只计成功的', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    const count = mgr.batchSetStatus(['1', '999', '3'], 'read');
    assert.equal(count, 2);
    assert.equal(mgr.getStatus('1'), 'read');
    assert.equal(mgr.getStatus('999'), null);
    assert.equal(mgr.getStatus('3'), 'read');
  });

  it('batchSetStatus 传入空数组返回 0', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    assert.equal(mgr.batchSetStatus([], 'read'), 0);
  });

  it('batchSetStatus 无效状态返回 0', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    assert.equal(mgr.batchSetStatus(['1', '2'], 'unknown'), 0);
  });

  // ---------- 4. 按状态过滤 ----------

  it('getByStatus 按状态过滤书签', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    mgr.setStatus('1', 'read');
    mgr.setStatus('2', 'read');
    mgr.setStatus('3', 'reading');

    const readList = mgr.getByStatus('read');
    assert.equal(readList.length, 2);
    assert.ok(readList.every(b => ['1', '2'].includes(b.id)));

    const readingList = mgr.getByStatus('reading');
    assert.equal(readingList.length, 1);
    assert.equal(readingList[0].id, '3');

    const unreadList = mgr.getByStatus('unread');
    assert.equal(unreadList.length, 5);
  });

  // ---------- 5. 状态统计 ----------

  it('getStatusCounts 返回正确的统计', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    // 初始全 unread
    assert.deepEqual(mgr.getStatusCounts(), { unread: 8, reading: 0, read: 0 });

    mgr.batchSetStatus(['1', '2', '3'], 'read');
    mgr.batchSetStatus(['4', '5'], 'reading');
    assert.deepEqual(mgr.getStatusCounts(), { unread: 3, reading: 2, read: 3 });
  });

  // ---------- 6. markAllAsRead ----------

  it('markAllAsRead 批量标记已读', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    mgr.setStatus('1', 'reading');
    const count = mgr.markAllAsRead(['1', '2', '3', '999']);
    assert.equal(count, 3);
    assert.equal(mgr.getStatus('1'), 'read');
    assert.equal(mgr.getStatus('2'), 'read');
    assert.equal(mgr.getStatus('3'), 'read');
    assert.equal(mgr.getStatus('4'), 'unread');
  });

  // ---------- 7. getRecentlyRead ----------

  it('getRecentlyRead 返回最近阅读的书签', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    mgr.markAllAsRead(['1', '2', '3']);
    const recent = mgr.getRecentlyRead(2);
    assert.equal(recent.length, 2);
    assert.equal(recent[0].id, '3');
    assert.equal(recent[1].id, '2');
  });

  it('getRecentlyRead 不包含未读和正在阅读的', () => {
    const mgr = new BookmarkStatusManager(sampleBookmarks);
    mgr.setStatus('1', 'reading');
    mgr.setStatus('2', 'unread');
    const recent = mgr.getRecentlyRead(10);
    assert.equal(recent.length, 0);
  });

  // ---------- 8. 空输入/边界 ----------

  it('空书签数组构造器正常工作', () => {
    const mgr = new BookmarkStatusManager([]);
    assert.equal(mgr.getStatus('1'), null);
    assert.deepEqual(mgr.getStatusCounts(), { unread: 0, reading: 0, read: 0 });
    assert.deepEqual(mgr.getByStatus('unread'), []);
    assert.deepEqual(mgr.getRecentlyRead(), []);
  });

  it('无参构造器等同于空数组', () => {
    const mgr = new BookmarkStatusManager();
    assert.deepEqual(mgr.getStatusCounts(), { unread: 0, reading: 0, read: 0 });
  });

  it('构造器传入非数组抛出 TypeError', () => {
    assert.throws(() => new BookmarkStatusManager('not-array'), TypeError);
  });

  // ---------- 9. VALID_STATUSES 导出 ----------

  it('VALID_STATUSES 导出包含三种状态', () => {
    assert.deepEqual(VALID_STATUSES, ['unread', 'reading', 'read']);
  });

  // ---------- 10. 数字 ID 兼容 ----------

  it('数字 ID 自动转为字符串处理', () => {
    const mgr = new BookmarkStatusManager([
      { id: 1, title: 'A', url: 'https://a.com' },
      { id: 2, title: 'B', url: 'https://b.com' },
    ]);
    assert.equal(mgr.setStatus(1, 'read'), true);
    assert.equal(mgr.getStatus(1), 'read');
    assert.equal(mgr.getStatus('1'), 'read');
  });
});
