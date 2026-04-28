/**
 * 测试 lib/knowledge-base.js — 批量操作
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/setup.js';

// 先安装 IndexedDB mock，再导入 knowledge-base
installIndexedDBMock();
const { KnowledgeBase } = await import('../lib/knowledge-base.js');

let kb;

beforeEach(async () => {
  resetIndexedDBMock();
  installIndexedDBMock();
  kb = new KnowledgeBase();
  await kb.init();
});

afterEach(() => {
  resetIndexedDBMock();
});

// ==================== batchDelete ====================

describe('KnowledgeBase batchDelete', () => {
  it('批量删除多条记录', async () => {
    const e1 = await kb.saveEntry({ title: '条目1' });
    const e2 = await kb.saveEntry({ title: '条目2' });
    const e3 = await kb.saveEntry({ title: '条目3' });

    const deleted = await kb.batchDelete([e1.id, e3.id]);
    assert.equal(deleted, 2);

    const remaining = await kb.getAllEntries();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].title, '条目2');
  });

  it('空数组返回 0', async () => {
    const deleted = await kb.batchDelete([]);
    assert.equal(deleted, 0);
  });

  it('超过 100 条抛出错误', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    await assert.rejects(
      () => kb.batchDelete(ids),
      { message: '批量操作最多支持 100 条' }
    );
  });

  it('部分 id 不存在时不影响其他删除', async () => {
    const e1 = await kb.saveEntry({ title: '存在' });
    const deleted = await kb.batchDelete([e1.id, 99999]);
    // 99999 不存在，deleteEntry 会尝试删除但不报错（mock 中 delete 是幂等的）
    assert.ok(deleted >= 1);
    const found = await kb.getEntry(e1.id);
    assert.equal(found, null);
  });

  it('非数组参数返回 0', async () => {
    const deleted = await kb.batchDelete(null);
    assert.equal(deleted, 0);
  });
});

// ==================== batchAddTag ====================

describe('KnowledgeBase batchAddTag', () => {
  beforeEach(async () => {
    await kb.saveEntry({ title: '条目A', tags: ['existing'] });
    await kb.saveEntry({ title: '条目B', tags: [] });
    await kb.saveEntry({ title: '条目C', tags: ['existing'] });
  });

  it('批量添加标签', async () => {
    const entries = await kb.getAllEntries();
    const ids = entries.map(e => e.id);

    const updated = await kb.batchAddTag(ids, 'new-tag');
    assert.equal(updated, 3);

    // 验证标签已添加
    for (const id of ids) {
      const entry = await kb.getEntry(id);
      assert.ok(entry.tags.includes('new-tag'), `${entry.title} 应含 new-tag`);
    }
  });

  it('已有标签不会重复添加', async () => {
    const entries = await kb.getAllEntries();
    const ids = entries.map(e => e.id);

    const updated = await kb.batchAddTag(ids, 'existing');
    // 只有条目B（无 existing 标签）会被更新
    assert.equal(updated, 1);
  });

  it('空数组返回 0', async () => {
    const updated = await kb.batchAddTag([], 'tag');
    assert.equal(updated, 0);
  });

  it('空标签抛出错误', async () => {
    const entries = await kb.getAllEntries();
    const ids = entries.map(e => e.id);
    await assert.rejects(
      () => kb.batchAddTag(ids, ''),
      { message: '标签不能为空' }
    );
  });

  it('超过 100 条抛出错误', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    await assert.rejects(
      () => kb.batchAddTag(ids, 'tag'),
      { message: '批量操作最多支持 100 条' }
    );
  });

  it('部分 id 不存在时不影响其他更新', async () => {
    const entries = await kb.getAllEntries();
    const updated = await kb.batchAddTag([entries[0].id, 99999], 'new-tag');
    assert.equal(updated, 1);
  });
});
