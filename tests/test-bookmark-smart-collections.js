/**
 * 测试 lib/bookmark-smart-collections.js — 智能集合引擎
 *
 * 测试范围:
 *   创建/删除/更新/列表集合
 *   规则匹配: tags/domain/folder/status/dateRange/category
 *   多规则 AND 组合
 *   内置集合 (unread/reading/recent)
 *   书签增删后集合自动更新
 *   序列化/反序列化
 *   边界: 空数据/无效输入/异常处理
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const {
  BookmarkSmartCollections,
  VALID_RULE_TYPES,
  VALID_STATUSES,
  BUILTIN_COLLECTIONS,
} = await import('../lib/bookmark-smart-collections.js');

// ==================== 辅助函数 ====================

function createBookmark(id, overrides = {}) {
  return {
    id: String(id),
    title: `Bookmark ${id}`,
    url: `https://example.com/page-${id}`,
    folderPath: ['Tech'],
    tags: [],
    status: 'unread',
    dateAdded: Date.now() - Number(id) * 86400000,
    ...overrides,
  };
}

const sampleBookmarks = [
  createBookmark('1', {
    title: 'React 入门教程',
    url: 'https://react.dev/learn',
    folderPath: ['前端', 'React'],
    tags: ['react', '入门'],
    status: 'read',
    dateAdded: Date.now() - 2 * 86400000,
  }),
  createBookmark('2', {
    title: 'Vue 3 组合式 API',
    url: 'https://vuejs.org/guide',
    folderPath: ['前端', 'Vue'],
    tags: ['vue', 'api'],
    status: 'unread',
    dateAdded: Date.now() - 1 * 86400000,
  }),
  createBookmark('3', {
    title: 'Docker 容器化部署',
    url: 'https://docker.com/get-started',
    folderPath: ['DevOps', 'Docker'],
    tags: ['docker', '容器'],
    status: 'reading',
    dateAdded: Date.now() - 10 * 86400000,
  }),
  createBookmark('4', {
    title: 'Python 机器学习入门',
    url: 'https://python.org/ml',
    folderPath: ['AI', 'Python'],
    tags: ['python', 'ml'],
    status: 'unread',
    dateAdded: Date.now() - 3 * 86400000,
  }),
  createBookmark('5', {
    title: 'PostgreSQL 性能优化',
    url: 'https://postgresql.org/docs/performance',
    folderPath: ['数据库'],
    tags: ['postgres', '性能'],
    status: 'read',
    dateAdded: Date.now() - 20 * 86400000,
  }),
  createBookmark('6', {
    title: 'TypeScript 高级类型',
    url: 'https://typescriptlang.org/docs/advanced',
    folderPath: ['前端', 'TypeScript'],
    tags: ['typescript', '类型'],
    status: 'unread',
    dateAdded: Date.now() - 0.5 * 86400000,
  }),
];

// ==================== 测试用例 ====================

describe('BookmarkSmartCollections', () => {

  // ---------- 1. 构造与内置集合 ----------

  it('空构造函数创建包含内置集合', () => {
    const sc = new BookmarkSmartCollections();
    const cols = sc.listCollections();
    assert.equal(cols.length, 3);
    assert.ok(cols.every(c => c.builtin));
  });

  it('内置集合: unread 匹配未读书签', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const bms = sc.getCollectionBookmarks('builtin-unread');
    assert.equal(bms.length, 3); // 2, 4, 6
    assert.ok(bms.every(b => b.status === 'unread'));
  });

  it('内置集合: reading 匹配正在阅读的书签', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const bms = sc.getCollectionBookmarks('builtin-reading');
    assert.equal(bms.length, 1); // 3
    assert.equal(bms[0].id, '3');
  });

  // ---------- 2. 创建自定义集合 ----------

  it('createCollection 创建标签规则集合', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('前端框架', [{ type: 'tags', value: ['react', 'vue'] }]);
    assert.equal(col.name, '前端框架');
    assert.equal(col.builtin, false);
    assert.ok(col.id.startsWith('custom-'));

    const bms = sc.getCollectionBookmarks(col.id);
    assert.equal(bms.length, 2); // 1(react), 2(vue)
  });

  it('createCollection 创建域名规则集合', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('官方文档', [{ type: 'domain', value: 'react.dev' }]);
    const bms = sc.getCollectionBookmarks(col.id);
    assert.equal(bms.length, 1);
    assert.equal(bms[0].id, '1');
  });

  it('createCollection 创建文件夹规则集合', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('前端技术', [{ type: 'folder', value: ['前端'] }]);
    const bms = sc.getCollectionBookmarks(col.id);
    assert.equal(bms.length, 3); // 1, 2, 6
  });

  it('createCollection 创建状态规则集合', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('已读资料', [{ type: 'status', value: 'read' }]);
    const bms = sc.getCollectionBookmarks(col.id);
    assert.equal(bms.length, 2); // 1, 5
  });

  it('createCollection 创建时间范围规则集合', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const fiveDaysAgo = Date.now() - 5 * 86400000;
    const col = sc.createCollection('近5天', [{ type: 'dateRange', value: { start: fiveDaysAgo } }]);
    const bms = sc.getCollectionBookmarks(col.id);
    // 1(2天), 2(1天), 4(3天), 6(0.5天) = 4个
    assert.equal(bms.length, 4);
  });

  it('createCollection 创建分类规则集合', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('AI 相关', [{ type: 'category', value: '机器学习' }]);
    const bms = sc.getCollectionBookmarks(col.id);
    assert.ok(bms.length >= 1);
    assert.ok(bms.some(b => b.id === '4'));
  });

  // ---------- 3. 多规则 AND 组合 ----------

  it('多规则 AND: 标签+状态', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('未读前端', [
      { type: 'tags', value: ['react', 'vue', 'typescript'] },
      { type: 'status', value: 'unread' },
    ]);
    const bms = sc.getCollectionBookmarks(col.id);
    assert.equal(bms.length, 2); // 2(vue/unread), 6(ts/unread)
  });

  it('多规则 AND: 文件夹+时间范围', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const threeDaysAgo = Date.now() - 3 * 86400000;
    const col = sc.createCollection('近期前端', [
      { type: 'folder', value: ['前端'] },
      { type: 'dateRange', value: { start: threeDaysAgo } },
    ]);
    const bms = sc.getCollectionBookmarks(col.id);
    // 1(2天/前端), 2(1天/前端), 6(0.5天/前端) = 3个
    assert.equal(bms.length, 3);
  });

  // ---------- 4. 集合管理 ----------

  it('deleteCollection 删除自定义集合', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('临时', [{ type: 'tags', value: ['test'] }]);
    assert.equal(sc.deleteCollection(col.id), true);
    assert.equal(sc.getCollection(col.id), null);
    assert.equal(sc.listCollections().length, 3); // 只剩内置
  });

  it('deleteCollection 不可删除内置集合', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    assert.equal(sc.deleteCollection('builtin-unread'), false);
    assert.ok(sc.getCollection('builtin-unread'));
  });

  it('updateCollection 更新名称和规则', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('测试', [{ type: 'tags', value: ['react'] }]);
    const updated = sc.updateCollection(col.id, {
      name: '新名称',
      rules: [{ type: 'tags', value: ['vue'] }],
    });
    assert.equal(updated.name, '新名称');
    const bms = sc.getCollectionBookmarks(col.id);
    assert.equal(bms.length, 1);
    assert.equal(bms[0].id, '2');
  });

  it('updateCollection 对内置集合返回 null', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const result = sc.updateCollection('builtin-unread', { name: 'hack' });
    assert.equal(result, null);
  });

  // ---------- 5. 书签动态更新 ----------

  it('addBookmark 后集合自动包含新书签', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('Docker', [{ type: 'tags', value: ['docker'] }]);
    assert.equal(sc.getCollectionBookmarks(col.id).length, 1); // 只有 3

    sc.addBookmark(createBookmark('7', {
      title: 'Docker Compose 教程',
      url: 'https://docker.com/compose',
      tags: ['docker', 'compose'],
    }));
    assert.equal(sc.getCollectionBookmarks(col.id).length, 2);
  });

  it('removeBookmark 后集合自动排除书签', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('Vue', [{ type: 'tags', value: ['vue'] }]);
    assert.equal(sc.getCollectionBookmarks(col.id).length, 1);

    sc.removeBookmark('2');
    assert.equal(sc.getCollectionBookmarks(col.id).length, 0);
  });

  it('setBookmarks 批量替换书签', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    const col = sc.createCollection('React', [{ type: 'tags', value: ['react'] }]);
    assert.equal(sc.getCollectionBookmarks(col.id).length, 1);

    sc.setBookmarks([
      createBookmark('10', { tags: ['react'] }),
      createBookmark('11', { tags: ['react'] }),
    ]);
    assert.equal(sc.getCollectionBookmarks(col.id).length, 2);
  });

  // ---------- 6. 书签所属集合查询 ----------

  it('getBookmarkCollections 返回书签所属所有集合', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    sc.createCollection('前端标签', [{ type: 'tags', value: ['react'] }]);
    sc.createCollection('前端文件夹', [{ type: 'folder', value: ['前端'] }]);

    const cols = sc.getBookmarkCollections('1');
    // 应包含: builtin-unread? 不, status=read
    // builtin-recent? 2天 < 7天, 是
    // 前端标签? tags=react, 是
    // 前端文件夹? folder=前端, 是
    const colIds = cols.map(c => c.id);
    assert.ok(colIds.includes('custom-1'));
    assert.ok(colIds.includes('custom-2'));
  });

  // ---------- 7. 集合统计 ----------

  it('getCollectionStats 返回所有集合及书签数', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    sc.createCollection('标签集合', [{ type: 'tags', value: ['python'] }]);

    const stats = sc.getCollectionStats();
    assert.equal(stats.length, 4); // 3 内置 + 1 自定义

    const tagStat = stats.find(s => s.collection.id === 'custom-1');
    assert.equal(tagStat.count, 1); // 只有 bookmark 4
  });

  // ---------- 8. 序列化/反序列化 ----------

  it('exportCollections 只导出自定义集合', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    sc.createCollection('自定义A', [{ type: 'tags', value: ['react'] }]);
    sc.createCollection('自定义B', [{ type: 'status', value: 'read' }]);

    const exported = sc.exportCollections();
    assert.equal(exported.length, 2);
    assert.ok(exported.every(c => !c.builtin));
  });

  it('反序列化恢复自定义集合', () => {
    const sc1 = new BookmarkSmartCollections(sampleBookmarks);
    sc1.createCollection('恢复测试', [{ type: 'tags', value: ['vue'] }]);

    const exported = sc1.exportCollections();
    const sc2 = new BookmarkSmartCollections(sampleBookmarks, exported);

    const cols = sc2.listCollections();
    assert.equal(cols.length, 4); // 3 内置 + 1 恢复
    const restored = cols.find(c => c.name === '恢复测试');
    assert.ok(restored);
    assert.equal(sc2.getCollectionBookmarks(restored.id).length, 1);
  });

  // ---------- 9. 规则验证 ----------

  it('无效规则类型抛出异常', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    assert.throws(
      () => sc.createCollection('bad', [{ type: 'invalid', value: 'x' }]),
      /invalid rule type/
    );
  });

  it('无效状态值抛出异常', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    assert.throws(
      () => sc.createCollection('bad', [{ type: 'status', value: 'done' }]),
      /invalid status/
    );
  });

  it('缺少 value 抛出异常', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    assert.throws(
      () => sc.createCollection('bad', [{ type: 'tags' }]),
      /rule\.value is required/
    );
  });

  it('tags 规则 value 非数组抛出异常', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    assert.throws(
      () => sc.createCollection('bad', [{ type: 'tags', value: 'react' }]),
      /tags rule value must be an array/
    );
  });

  it('name 为空抛出异常', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    assert.throws(
      () => sc.createCollection('', [{ type: 'tags', value: ['x'] }]),
      /name must be a non-empty string/
    );
  });

  it('rules 为空数组抛出异常', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    assert.throws(
      () => sc.createCollection('test', []),
      /rules must be a non-empty array/
    );
  });

  // ---------- 10. 边界情况 ----------

  it('空书签列表, 集合返回空结果', () => {
    const sc = new BookmarkSmartCollections([]);
    const bms = sc.getCollectionBookmarks('builtin-unread');
    assert.deepEqual(bms, []);
  });

  it('无效集合 ID 返回空', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    assert.deepEqual(sc.getCollectionBookmarks('nonexistent'), []);
    assert.equal(sc.getCollection('nonexistent'), null);
  });

  it('构造函数不传参不报错', () => {
    const sc = new BookmarkSmartCollections();
    assert.equal(sc.listCollections().length, 3);
  });

  it('getBookmarkCollections 未知书签返回空', () => {
    const sc = new BookmarkSmartCollections(sampleBookmarks);
    assert.deepEqual(sc.getBookmarkCollections('999'), []);
  });

  // ---------- 11. 导出常量 ----------

  it('VALID_RULE_TYPES 包含所有规则类型', () => {
    assert.deepEqual(VALID_RULE_TYPES, ['tags', 'domain', 'folder', 'status', 'dateRange', 'category']);
  });

  it('VALID_STATUSES 包含三种状态', () => {
    assert.deepEqual(VALID_STATUSES, ['unread', 'reading', 'read']);
  });

  it('BUILTIN_COLLECTIONS 有 3 个内置集合', () => {
    assert.equal(BUILTIN_COLLECTIONS.length, 3);
    assert.ok(BUILTIN_COLLECTIONS.every(c => c.builtin));
  });

  // ---------- 12. 域名匹配细节 ----------

  it('域名匹配: 子域名也匹配', () => {
    const sc = new BookmarkSmartCollections([
      createBookmark('100', { url: 'https://docs.react.dev/guide' }),
    ]);
    const col = sc.createCollection('React 官方', [{ type: 'domain', value: 'react.dev' }]);
    assert.equal(sc.getCollectionBookmarks(col.id).length, 1);
  });

  it('域名匹配: 无效 URL 不匹配', () => {
    const sc = new BookmarkSmartCollections([
      createBookmark('101', { url: 'not-a-url' }),
    ]);
    const col = sc.createCollection('测试', [{ type: 'domain', value: 'example.com' }]);
    assert.equal(sc.getCollectionBookmarks(col.id).length, 0);
  });

  // ---------- 13. 时间范围细节 ----------

  it('dateRange 只有 start', () => {
    const sc = new BookmarkSmartCollections([
      createBookmark('200', { dateAdded: Date.now() - 1000 }),
      createBookmark('201', { dateAdded: Date.now() - 100 * 86400000 }),
    ]);
    const col = sc.createCollection('近期', [{ type: 'dateRange', value: { start: Date.now() - 86400000 } }]);
    assert.equal(sc.getCollectionBookmarks(col.id).length, 1);
  });

  it('dateRange 只有 end', () => {
    const sc = new BookmarkSmartCollections([
      createBookmark('202', { dateAdded: Date.now() - 1000 }),
      createBookmark('203', { dateAdded: Date.now() - 100 * 86400000 }),
    ]);
    const col = sc.createCollection('老书签', [{ type: 'dateRange', value: { end: Date.now() - 50 * 86400000 } }]);
    assert.equal(sc.getCollectionBookmarks(col.id).length, 1);
  });

  it('无 dateAdded 的书签不匹配 dateRange', () => {
    const sc = new BookmarkSmartCollections([
      createBookmark('204', { dateAdded: undefined }),
    ]);
    const col = sc.createCollection('时间', [{ type: 'dateRange', value: { start: 0 } }]);
    assert.equal(sc.getCollectionBookmarks(col.id).length, 0);
  });
});
