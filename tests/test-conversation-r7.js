/**
 * 测试 lib/conversation-store.js — 对话历史持久化存储
 *
 * 8 个场景覆盖：基本 CRUD、覆盖保存、关键词搜索、按时间清理
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

installIndexedDBMock();
const {
  saveConversation,
  getConversationByUrl,
  getAllConversations,
  deleteConversation,
  deleteOldConversations,
  searchConversations,
} = await import('../lib/conversation-store.js');

// ==================== 对话存储 ====================

describe('conversation-store', () => {

  beforeEach(() => {
    resetIndexedDBMock();
    installIndexedDBMock();
  });

  // ---- 1. saveConversation 基本保存 ----
  it('saveConversation 基本保存并返回含 id 的记录', async () => {
    const msgs = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！有什么可以帮你的？' },
    ];
    const result = await saveConversation('https://example.com', '测试页面', msgs);

    assert.ok(result.id, '应生成 id');
    assert.equal(result.url, 'https://example.com');
    assert.equal(result.title, '测试页面');
    assert.deepEqual(result.messages, msgs);
    assert.ok(result.createdAt, '应有 createdAt');
    assert.ok(result.updatedAt, '应有 updatedAt');
  });

  // ---- 2. getConversationByUrl 查找已保存的 ----
  it('getConversationByUrl 查找已保存的对话', async () => {
    const msgs = [{ role: 'user', content: '你好' }];
    await saveConversation('https://example.com/page1', '页面1', msgs);

    const found = await getConversationByUrl('https://example.com/page1');

    assert.ok(found, '应找到对话');
    assert.equal(found.url, 'https://example.com/page1');
    assert.equal(found.title, '页面1');
    assert.deepEqual(found.messages, msgs);
  });

  // ---- 3. getConversationByUrl 不存在返回 null ----
  it('getConversationByUrl 对不存在的 URL 返回 null', async () => {
    const result = await getConversationByUrl('https://not-exist.com');
    assert.equal(result, null, '不存在时应返回 null');
  });

  // ---- 4. getAllConversations 返回数组 ----
  it('getAllConversations 返回按 updatedAt 倒序排列的数组', async () => {
    await saveConversation('https://a.com', '页面A', []);
    await saveConversation('https://b.com', '页面B', []);
    await saveConversation('https://c.com', '页面C', []);

    const all = await getAllConversations();

    assert.ok(Array.isArray(all), '应返回数组');
    assert.equal(all.length, 3, '应有 3 条记录');
    // 倒序：最后保存的排在前面
    for (let i = 0; i < all.length - 1; i++) {
      assert.ok(
        new Date(all[i].updatedAt) >= new Date(all[i + 1].updatedAt),
        '应按 updatedAt 倒序排列'
      );
    }
  });

  // ---- 5. deleteConversation 删除后查不到 ----
  it('deleteConversation 删除后通过 getAllConversations 查不到', async () => {
    const saved = await saveConversation('https://del.com', '待删除', []);

    await deleteConversation(saved.id);

    const all = await getAllConversations();
    assert.equal(all.length, 0, '删除后列表应为空');
    const byUrl = await getConversationByUrl('https://del.com');
    assert.equal(byUrl, null, '按 URL 也应查不到');
  });

  // ---- 6. saveConversation 覆盖同 URL ----
  it('saveConversation 覆盖同 URL 的对话', async () => {
    const msgs1 = [{ role: 'user', content: '第一次' }];
    const msgs2 = [{ role: 'user', content: '第二次' }];

    const first = await saveConversation('https://same.com', '原始标题', msgs1);
    const second = await saveConversation('https://same.com', '新标题', msgs2);

    // 应更新同一条记录
    assert.equal(second.id, first.id, '应更新同一记录（相同 id）');
    assert.equal(second.title, '新标题');
    assert.deepEqual(second.messages, msgs2);

    // 通过 URL 查找也应是更新后的内容
    const found = await getConversationByUrl('https://same.com');
    assert.equal(found.title, '新标题');
    assert.deepEqual(found.messages, msgs2);

    // 总数仍为 1
    const all = await getAllConversations();
    assert.equal(all.length, 1, '同 URL 应只保留一条记录');
  });

  // ---- 7. searchConversations 关键词搜索 ----
  it('searchConversations 按关键词搜索标题和消息内容', async () => {
    await saveConversation('https://a.com', 'JavaScript 教程', [
      { role: 'user', content: '怎么学 JS？' },
    ]);
    await saveConversation('https://b.com', 'Python 入门', [
      { role: 'user', content: 'Python 好学吗？' },
    ]);
    await saveConversation('https://c.com', 'CSS 布局', [
      { role: 'user', content: 'Flex 和 Grid 的区别' },
    ]);

    // 搜索标题中的关键词
    const jsResults = await searchConversations('javascript');
    assert.equal(jsResults.length, 1);
    assert.equal(jsResults[0].url, 'https://a.com');

    // 搜索消息内容中的关键词
    const pythonResults = await searchConversations('Python');
    assert.equal(pythonResults.length, 1);
    assert.equal(pythonResults[0].url, 'https://b.com');

    // 搜索不存在的关键词
    const emptyResults = await searchConversations('不存在的词');
    assert.equal(emptyResults.length, 0);
  });

  // ---- 8. deleteOldConversations 按时间清理 ----
  it('deleteOldConversations 清理超过指定天数的旧对话', async () => {
    // 手动保存两条记录：一条新、一条旧
    const newMsg = [{ role: 'user', content: '新的' }];
    const oldMsg = [{ role: 'user', content: '旧的' }];

    const newConv = await saveConversation('https://new.com', '新对话', newMsg);
    const oldConv = await saveConversation('https://old.com', '旧对话', oldMsg);

    // 直接篡改 updatedAt 使其成为"旧"记录
    const db = await (await import('../lib/conversation-store.js')).default?.() ?? null;
    // 通过 IndexedDB mock 直接修改旧记录的 updatedAt
    const mockDB = globalThis.indexedDB._dbs?.['PageWiseConversations']
      || (() => {
        // 打开数据库获取引用
        return new Promise((resolve) => {
          const req = globalThis.indexedDB.open('PageWiseConversations', 1);
          req.onsuccess = () => resolve(req.result);
        });
      })();

    // 直接修改 mock 中旧记录的时间戳 — 通过 openDB 拿到 store
    // 策略：重新打开 DB 获取底层 store 对象，修改 oldConv 的 updatedAt
    const dbRef = await new Promise((resolve) => {
      const r = globalThis.indexedDB.open('PageWiseConversations', 1);
      r.onsuccess = () => resolve(r.result);
    });
    const storeRef = dbRef._stores['conversations'];
    const oldRecord = storeRef._records.get(oldConv.id);
    oldRecord.updatedAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 天前

    // 清理超过 30 天的
    const deletedCount = await deleteOldConversations(30);
    assert.equal(deletedCount, 1, '应删除 1 条旧记录');

    // 只剩下新对话
    const remaining = await getAllConversations();
    assert.equal(remaining.length, 1, '应只剩 1 条记录');
    assert.equal(remaining[0].url, 'https://new.com');
  });

});
