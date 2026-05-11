/**
 * 测试 lib/bookmark-sharing.js — 书签分享引擎
 *
 * 测试范围:
 *   创建可分享集合 (createShareableCollection)
 *   导出 JSON / 文本 / Base64 / 分享链接
 *   隐私控制: stripPersonalData / anonymizeUrls / includeFields
 *   导入分享数据 (importSharedCollection)
 *   边界: 空数据/无效输入/异常处理
 *   进度回调
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const {
  BookmarkSharing,
  SHAREABLE_FIELDS,
  PERSONAL_FIELDS,
} = await import('../lib/bookmark-sharing.js');

// ==================== 辅助函数 ====================

function createBookmark(id, overrides = {}) {
  return {
    id: String(id),
    title: `Bookmark ${id}`,
    url: `https://example.com/page-${id}`,
    folderPath: ['Tech', 'Frontend'],
    tags: ['javascript', 'react'],
    status: 'unread',
    dateAdded: Date.now() - Number(id) * 86400000,
    ...overrides,
  };
}

const sampleBookmarks = [
  createBookmark('1'),
  createBookmark('2', { title: 'React Guide', url: 'https://react.dev/learn', tags: ['react', 'guide'], status: 'read' }),
  createBookmark('3', { title: 'Node.js API', url: 'https://nodejs.org/api', folderPath: ['Backend'], tags: ['nodejs'], status: 'reading' }),
];

// ==================== 常量测试 ====================

describe('BookmarkSharing constants', () => {
  it('SHAREABLE_FIELDS 包含所有书签字段', () => {
    assert.deepEqual(SHAREABLE_FIELDS, ['id', 'title', 'url', 'folderPath', 'tags', 'status', 'dateAdded']);
  });

  it('PERSONAL_FIELDS 包含个人信息字段', () => {
    assert.deepEqual(PERSONAL_FIELDS, ['folderPath', 'tags', 'status']);
  });
});

// ==================== 构造函数 ====================

describe('BookmarkSharing constructor', () => {
  it('默认参数创建', () => {
    const bs = new BookmarkSharing();
    assert.deepEqual(bs.bookmarks, []);
    assert.equal(bs.onProgress, null);
  });

  it('自定义参数创建', () => {
    const cb = () => {};
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks, onProgress: cb });
    assert.equal(bs.bookmarks.length, 3);
    assert.equal(bs.onProgress, cb);
  });
});

// ==================== createShareableCollection ====================

describe('createShareableCollection', () => {
  let bs;

  beforeEach(() => {
    bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
  });

  it('默认创建可分享集合', () => {
    const result = bs.createShareableCollection();
    assert.equal(result.version, 1);
    assert.equal(result.type, 'bookmark-share');
    assert.equal(result.bookmarks.length, 3);
    assert.ok(result.sharedAt);
    assert.ok(result.metadata);
  });

  it('包含集合名称和描述', () => {
    const result = bs.createShareableCollection({
      collectionName: '前端资源',
      description: 'React 和 JS 学习资料',
      author: 'Alice',
    });
    assert.equal(result.collectionName, '前端资源');
    assert.equal(result.description, 'React 和 JS 学习资料');
    assert.equal(result.author, 'Alice');
  });

  it('metadata 包含正确的统计', () => {
    const result = bs.createShareableCollection();
    assert.equal(result.metadata.totalBookmarks, 3);
    assert.ok(result.metadata.uniqueDomains > 0);
    assert.ok(result.metadata.uniqueTags > 0);
  });

  it('空书签列表', () => {
    const emptyBs = new BookmarkSharing({ bookmarks: [] });
    const result = emptyBs.createShareableCollection();
    assert.equal(result.bookmarks.length, 0);
    assert.equal(result.metadata.totalBookmarks, 0);
  });
});

// ==================== 隐私控制 ====================

describe('隐私控制', () => {
  let bs;

  beforeEach(() => {
    bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
  });

  it('stripPersonalData 移除个人信息字段', () => {
    const result = bs.createShareableCollection({ stripPersonalData: true });
    for (const bm of result.bookmarks) {
      assert.equal(bm.folderPath, undefined);
      assert.equal(bm.tags, undefined);
      assert.equal(bm.status, undefined);
      assert.ok(bm.id);
      assert.ok(bm.title);
      assert.ok(bm.url);
    }
  });

  it('anonymizeUrls 匿名化 URL', () => {
    const result = bs.createShareableCollection({ anonymizeUrls: true });
    for (const bm of result.bookmarks) {
      assert.ok(bm.url);
      // URL 应保留域名但路径被替换
      assert.ok(bm.url.startsWith('https://'));
      assert.ok(!bm.url.includes('/page-'));
    }
  });

  it('includeFields 白名单过滤', () => {
    const result = bs.createShareableCollection({
      includeFields: ['id', 'title', 'url'],
    });
    for (const bm of result.bookmarks) {
      assert.ok(bm.id);
      assert.ok(bm.title);
      assert.ok(bm.url);
      assert.equal(bm.folderPath, undefined);
      assert.equal(bm.tags, undefined);
      assert.equal(bm.status, undefined);
      assert.equal(bm.dateAdded, undefined);
    }
  });

  it('includeFields 忽略非法字段', () => {
    const result = bs.createShareableCollection({
      includeFields: ['id', 'title', 'nonexistent', 'hack'],
    });
    for (const bm of result.bookmarks) {
      assert.ok(bm.id);
      assert.ok(bm.title);
      assert.equal(bm.nonexistent, undefined);
      assert.equal(bm.hack, undefined);
    }
  });

  it('同时使用 stripPersonalData 和 anonymizeUrls', () => {
    const result = bs.createShareableCollection({
      stripPersonalData: true,
      anonymizeUrls: true,
    });
    for (const bm of result.bookmarks) {
      assert.equal(bm.folderPath, undefined);
      assert.equal(bm.tags, undefined);
      assert.equal(bm.status, undefined);
      assert.ok(bm.url.includes('…'));
    }
  });
});

// ==================== exportShareJSON ====================

describe('exportShareJSON', () => {
  it('导出有效 JSON', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const json = bs.exportShareJSON({ collectionName: '测试' });
    const parsed = JSON.parse(json);
    assert.equal(parsed.type, 'bookmark-share');
    assert.equal(parsed.collectionName, '测试');
    assert.equal(parsed.bookmarks.length, 3);
  });

  it('空书签导出', () => {
    const bs = new BookmarkSharing({ bookmarks: [] });
    const json = bs.exportShareJSON();
    const parsed = JSON.parse(json);
    assert.equal(parsed.bookmarks.length, 0);
  });
});

// ==================== exportShareText ====================

describe('exportShareText', () => {
  it('包含集合名称', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const text = bs.exportShareText({ collectionName: '前端资源' });
    assert.ok(text.includes('前端资源'));
  });

  it('包含每本书签的标题', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const text = bs.exportShareText();
    assert.ok(text.includes('Bookmark 1'));
    assert.ok(text.includes('React Guide'));
    assert.ok(text.includes('Node.js API'));
  });

  it('包含 URL', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const text = bs.exportShareText();
    assert.ok(text.includes('https://example.com/page-1'));
  });

  it('包含描述和作者', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const text = bs.exportShareText({
      description: '学习资源',
      author: 'Bob',
    });
    assert.ok(text.includes('学习资源'));
    assert.ok(text.includes('Bob'));
  });

  it('stripPersonalData 时不含标签', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const text = bs.exportShareText({ stripPersonalData: true });
    assert.ok(!text.includes('标签:'));
  });

  it('不包含标签当书签无标签', () => {
    const bm = [createBookmark('1', { tags: [] })];
    const bs = new BookmarkSharing({ bookmarks: bm });
    const text = bs.exportShareText();
    assert.ok(!text.includes('标签:'));
  });

  it('空书签', () => {
    const bs = new BookmarkSharing({ bookmarks: [] });
    const text = bs.exportShareText({ collectionName: '空集合' });
    assert.ok(text.includes('空集合'));
    assert.ok(text.includes('书签数量: 0'));
  });
});

// ==================== exportShareBase64 ====================

describe('exportShareBase64', () => {
  it('导出 Base64 字符串', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const b64 = bs.exportShareBase64();
    assert.ok(typeof b64 === 'string');
    assert.ok(b64.length > 0);
    // Base64 只包含合法字符
    assert.ok(/^[A-Za-z0-9+/=]+$/.test(b64));
  });

  it('Base64 可解码回有效 JSON', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const b64 = bs.exportShareBase64({ collectionName: '测试' });
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    assert.equal(parsed.collectionName, '测试');
    assert.equal(parsed.bookmarks.length, 3);
  });
});

// ==================== generateShareLink ====================

describe('generateShareLink', () => {
  it('生成 data: URI', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const link = bs.generateShareLink();
    assert.ok(link.startsWith('data:application/json;base64,'));
  });

  it('链接可解码为有效 JSON', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const link = bs.generateShareLink({ collectionName: '测试' });
    const base64 = link.split(',')[1];
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    assert.equal(parsed.collectionName, '测试');
  });
});

// ==================== importSharedCollection ====================

describe('importSharedCollection', () => {
  it('从 JSON 字符串导入', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const json = bs.exportShareJSON({ collectionName: '测试' });
    const result = BookmarkSharing.importSharedCollection(json);
    assert.ok(result);
    assert.equal(result.type, 'bookmark-share');
    assert.equal(result.collectionName, '测试');
    assert.equal(result.bookmarks.length, 3);
  });

  it('从 Base64 编码导入', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const b64 = bs.exportShareBase64();
    const result = BookmarkSharing.importSharedCollection(b64);
    assert.ok(result);
    assert.equal(result.bookmarks.length, 3);
  });

  it('从 data: URI 导入', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const link = bs.generateShareLink();
    const result = BookmarkSharing.importSharedCollection(link);
    assert.ok(result);
    assert.equal(result.bookmarks.length, 3);
  });

  it('无效 JSON 返回 null', () => {
    assert.equal(BookmarkSharing.importSharedCollection('not json'), null);
  });

  it('null 输入返回 null', () => {
    assert.equal(BookmarkSharing.importSharedCollection(null), null);
  });

  it('undefined 输入返回 null', () => {
    assert.equal(BookmarkSharing.importSharedCollection(undefined), null);
  });

  it('非字符串输入返回 null', () => {
    assert.equal(BookmarkSharing.importSharedCollection(123), null);
  });

  it('缺少 type 字段返回 null', () => {
    const data = JSON.stringify({ bookmarks: [] });
    assert.equal(BookmarkSharing.importSharedCollection(data), null);
  });

  it('type 不匹配返回 null', () => {
    const data = JSON.stringify({ type: 'wrong', bookmarks: [] });
    assert.equal(BookmarkSharing.importSharedCollection(data), null);
  });

  it('缺少 bookmarks 返回 null', () => {
    const data = JSON.stringify({ type: 'bookmark-share' });
    assert.equal(BookmarkSharing.importSharedCollection(data), null);
  });

  it('bookmarks 不是数组返回 null', () => {
    const data = JSON.stringify({ type: 'bookmark-share', bookmarks: 'not-array' });
    assert.equal(BookmarkSharing.importSharedCollection(data), null);
  });
});

// ==================== round-trip 测试 ====================

describe('分享数据 round-trip', () => {
  it('导出→导入→数据一致', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const json = bs.exportShareJSON({ collectionName: 'Round Trip' });
    const imported = BookmarkSharing.importSharedCollection(json);

    assert.equal(imported.collectionName, 'Round Trip');
    assert.equal(imported.bookmarks.length, 3);
    assert.equal(imported.bookmarks[0].title, 'Bookmark 1');
    assert.equal(imported.bookmarks[1].title, 'React Guide');
    assert.equal(imported.bookmarks[2].title, 'Node.js API');
  });

  it('Base64 导出→导入', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const b64 = bs.exportShareBase64({ author: 'Test' });
    const imported = BookmarkSharing.importSharedCollection(b64);

    assert.equal(imported.author, 'Test');
    assert.equal(imported.bookmarks.length, 3);
  });

  it('分享链接→导入', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const link = bs.generateShareLink({ description: '链接测试' });
    const imported = BookmarkSharing.importSharedCollection(link);

    assert.equal(imported.description, '链接测试');
    assert.equal(imported.bookmarks.length, 3);
  });

  it('隐私过滤 round-trip', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    const json = bs.exportShareJSON({
      stripPersonalData: true,
      anonymizeUrls: true,
      collectionName: '隐私测试',
    });
    const imported = BookmarkSharing.importSharedCollection(json);

    assert.equal(imported.bookmarks.length, 3);
    for (const bm of imported.bookmarks) {
      assert.equal(bm.folderPath, undefined);
      assert.equal(bm.tags, undefined);
      assert.equal(bm.status, undefined);
      assert.ok(bm.url.includes('…'));
    }
  });
});

// ==================== _anonymizeUrl ====================

describe('_anonymizeUrl', () => {
  it('正常 URL 匿名化', () => {
    const result = BookmarkSharing._anonymizeUrl('https://example.com/path/to/page?q=1');
    assert.ok(result.startsWith('https://example.com'));
    assert.ok(result.includes('…'));
    assert.ok(!result.includes('/path/to/page'));
  });

  it('无效 URL 返回默认值', () => {
    const result = BookmarkSharing._anonymizeUrl('not-a-url');
    assert.equal(result, 'https://example.com/…');
  });
});

// ==================== _simpleHash ====================

describe('_simpleHash', () => {
  it('相同输入产生相同哈希', () => {
    const h1 = BookmarkSharing._simpleHash('test');
    const h2 = BookmarkSharing._simpleHash('test');
    assert.equal(h1, h2);
  });

  it('不同输入产生不同哈希', () => {
    const h1 = BookmarkSharing._simpleHash('abc');
    const h2 = BookmarkSharing._simpleHash('def');
    assert.notEqual(h1, h2);
  });

  it('返回字符串', () => {
    const h = BookmarkSharing._simpleHash('hello');
    assert.equal(typeof h, 'string');
    assert.ok(h.length > 0);
  });
});

// ==================== _buildMetadata ====================

describe('_buildMetadata', () => {
  it('统计正确', () => {
    const meta = BookmarkSharing._buildMetadata(sampleBookmarks);
    assert.equal(meta.totalBookmarks, 3);
    assert.ok(meta.uniqueDomains > 0);
    assert.ok(meta.uniqueTags > 0);
  });

  it('空书签列表', () => {
    const meta = BookmarkSharing._buildMetadata([]);
    assert.equal(meta.totalBookmarks, 0);
    assert.equal(meta.uniqueDomains, 0);
    assert.equal(meta.uniqueTags, 0);
  });

  it('无标签书签', () => {
    const bm = [createBookmark('1', { tags: undefined, url: 'https://a.com' })];
    const meta = BookmarkSharing._buildMetadata(bm);
    assert.equal(meta.totalBookmarks, 1);
    assert.equal(meta.uniqueDomains, 1);
    assert.equal(meta.uniqueTags, 0);
  });

  it('无效 URL 不计入域名', () => {
    const bm = [createBookmark('1', { url: 'not-a-url' })];
    const meta = BookmarkSharing._buildMetadata(bm);
    assert.equal(meta.uniqueDomains, 0);
  });
});

// ==================== 进度回调 ====================

describe('进度回调', () => {
  it('createShareableCollection 触发进度回调', () => {
    const events = [];
    const bs = new BookmarkSharing({
      bookmarks: sampleBookmarks,
      onProgress: (phase, current, total) => events.push({ phase, current, total }),
    });

    bs.createShareableCollection();

    assert.ok(events.length > 0);
    assert.ok(events.some(e => e.phase === 'create-start'));
    assert.ok(events.some(e => e.phase === 'create-done'));
    assert.ok(events.some(e => e.phase === 'create-progress'));
  });

  it('exportShareJSON 触发进度回调', () => {
    const events = [];
    const bs = new BookmarkSharing({
      bookmarks: sampleBookmarks,
      onProgress: (phase) => events.push(phase),
    });

    bs.exportShareJSON();

    assert.ok(events.includes('create-start'));
    assert.ok(events.includes('create-done'));
  });

  it('exportShareText 触发进度回调', () => {
    const events = [];
    const bs = new BookmarkSharing({
      bookmarks: sampleBookmarks,
      onProgress: (phase) => events.push(phase),
    });

    bs.exportShareText();

    assert.ok(events.includes('create-start'));
    assert.ok(events.includes('create-done'));
  });

  it('exportShareBase64 触发进度回调', () => {
    const events = [];
    const bs = new BookmarkSharing({
      bookmarks: sampleBookmarks,
      onProgress: (phase) => events.push(phase),
    });

    bs.exportShareBase64();

    assert.ok(events.includes('create-start'));
    assert.ok(events.includes('create-done'));
  });

  it('无进度回调时不报错', () => {
    const bs = new BookmarkSharing({ bookmarks: sampleBookmarks });
    assert.doesNotThrow(() => {
      bs.createShareableCollection();
      bs.exportShareJSON();
      bs.exportShareText();
      bs.exportShareBase64();
      bs.generateShareLink();
    });
  });
});

// ==================== 边界情况 ====================

describe('边界情况', () => {
  it('大量书签', () => {
    const manyBookmarks = Array.from({ length: 500 }, (_, i) => createBookmark(i));
    const bs = new BookmarkSharing({ bookmarks: manyBookmarks });
    const result = bs.createShareableCollection();
    assert.equal(result.bookmarks.length, 500);
    assert.equal(result.metadata.totalBookmarks, 500);
  });

  it('书签字段缺失', () => {
    const incomplete = [{ id: '1' }, { title: 'No URL' }, { url: 'https://a.com' }];
    const bs = new BookmarkSharing({ bookmarks: incomplete });
    const result = bs.createShareableCollection();
    assert.equal(result.bookmarks.length, 3);
  });

  it('特殊字符在标题中', () => {
    const bm = [createBookmark('1', { title: '<script>alert("xss")</script>' })];
    const bs = new BookmarkSharing({ bookmarks: bm });
    const json = bs.exportShareJSON();
    const parsed = JSON.parse(json);
    assert.ok(parsed.bookmarks[0].title.includes('<script>'));
    // JSON 序列化会正确转义
  });

  it('中文标题和标签', () => {
    const bm = [createBookmark('1', { title: '中文标题', tags: ['标签一', '标签二'] })];
    const bs = new BookmarkSharing({ bookmarks: bm });
    const text = bs.exportShareText();
    assert.ok(text.includes('中文标题'));
  });

  it('dateAdded 为 undefined', () => {
    const bm = [createBookmark('1', { dateAdded: undefined })];
    const bs = new BookmarkSharing({ bookmarks: bm });
    const result = bs.createShareableCollection();
    assert.equal(result.bookmarks[0].dateAdded, undefined);
  });
});
