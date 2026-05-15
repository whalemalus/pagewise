/**
 * QA002 功能正确性测试（第二轮） — 高亮标注模块
 *
 * 测试范围：
 *   高亮创建、删除、持久化、ID 唯一性、去重、跨 URL 管理、
 *   限制边界、扁平化查询、空值处理
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/setup.js';

installChromeMock();

const {
  saveHighlight,
  getHighlightsByUrl,
  getAllHighlights,
  deleteHighlight,
  deleteHighlightsByUrl,
  getAllHighlightsFlat,
} = await import('../lib/highlight-store.js');

afterEach(() => {
  resetChromeMock();
});

// ==================== 1. 创建高亮 ====================

describe('QA002-highlight: 创建高亮', () => {
  it('成功创建高亮并返回完整结构', async () => {
    const entry = await saveHighlight({
      url: 'https://test.com/article',
      text: '重要段落',
      xpath: '/html/body/div/p[1]',
      offset: 10,
    });
    assert.ok(entry.id, '应有 id');
    assert.ok(entry.createdAt, '应有 createdAt');
    assert.equal(entry.url, 'https://test.com/article');
    assert.equal(entry.text, '重要段落');
    assert.equal(entry.xpath, '/html/body/div/p[1]');
    assert.equal(entry.offset, 10);
  });

  it('ID 格式为 base36+随机后缀（时间+随机拼接）', async () => {
    const entry = await saveHighlight({ url: 'https://test.com', text: 'id-test' });
    // base36 日期 + 6 位随机字符
    assert.match(entry.id, /^[a-z0-9]{6,}[a-z0-9]{6}$/);
  });

  it('createdAt 为有效 ISO 时间字符串', async () => {
    const entry = await saveHighlight({ url: 'https://test.com', text: 'time-test' });
    const parsed = new Date(entry.createdAt);
    assert.ok(!isNaN(parsed.getTime()), 'createdAt 应是有效日期');
    assert.equal(entry.createdAt, parsed.toISOString());
  });

  it('多次创建返回不同 ID', async () => {
    const e1 = await saveHighlight({ url: 'https://test.com', text: 'a' });
    const e2 = await saveHighlight({ url: 'https://test.com', text: 'b' });
    assert.notEqual(e1.id, e2.id);
  });

  it('缺少 url 时抛出明确错误', async () => {
    await assert.rejects(
      () => saveHighlight({ text: 'no-url' }),
      { message: 'url and text are required' }
    );
  });

  it('缺少 text 时抛出明确错误', async () => {
    await assert.rejects(
      () => saveHighlight({ url: 'https://test.com' }),
      { message: 'url and text are required' }
    );
  });
});

// ==================== 2. 去重机制 ====================

describe('QA002-highlight: 去重', () => {
  it('完全相同的 text+xpath+offset 不重复保存', async () => {
    const data = { url: 'https://test.com', text: 'dup', xpath: '/p[1]', offset: 0 };
    const first = await saveHighlight(data);
    const second = await saveHighlight(data);
    assert.equal(first.id, second.id);
    // 确认存储中只有一条
    const list = await getHighlightsByUrl('https://test.com');
    assert.equal(list.length, 1);
  });

  it('相同文本但不同 xpath 可以分别保存', async () => {
    const e1 = await saveHighlight({ url: 'https://test.com', text: 'same', xpath: '/p[1]', offset: 0 });
    const e2 = await saveHighlight({ url: 'https://test.com', text: 'same', xpath: '/p[2]', offset: 0 });
    assert.notEqual(e1.id, e2.id);
    const list = await getHighlightsByUrl('https://test.com');
    assert.equal(list.length, 2);
  });

  it('相同文本+xpath 但不同 offset 可以分别保存', async () => {
    const e1 = await saveHighlight({ url: 'https://test.com', text: 'same', xpath: '/p[1]', offset: 0 });
    const e2 = await saveHighlight({ url: 'https://test.com', text: 'same', xpath: '/p[1]', offset: 5 });
    assert.notEqual(e1.id, e2.id);
  });
});

// ==================== 3. 删除高亮 ====================

describe('QA002-highlight: 删除高亮', () => {
  it('删除存在的高亮返回 true', async () => {
    const entry = await saveHighlight({ url: 'https://test.com', text: 'to-delete' });
    const result = await deleteHighlight('https://test.com', entry.id);
    assert.equal(result, true);
  });

  it('删除后该高亮不再出现在列表中', async () => {
    const entry = await saveHighlight({ url: 'https://test.com', text: 'vanish' });
    await deleteHighlight('https://test.com', entry.id);
    const list = await getHighlightsByUrl('https://test.com');
    assert.equal(list.length, 0);
  });

  it('删除不存在的 ID 返回 false', async () => {
    await saveHighlight({ url: 'https://test.com', text: 'exists' });
    const result = await deleteHighlight('https://test.com', 'ghost-id-999');
    assert.equal(result, false);
  });

  it('删除一个高亮不影响同 URL 下的其他高亮', async () => {
    const e1 = await saveHighlight({ url: 'https://test.com', text: 'keep' });
    const e2 = await saveHighlight({ url: 'https://test.com', text: 'drop' });
    await deleteHighlight('https://test.com', e2.id);
    const list = await getHighlightsByUrl('https://test.com');
    assert.equal(list.length, 1);
    assert.equal(list[0].id, e1.id);
    assert.equal(list[0].text, 'keep');
  });
});

// ==================== 4. 按 URL 批量删除 ====================

describe('QA002-highlight: 按 URL 批量删除', () => {
  it('删除指定 URL 下全部高亮', async () => {
    await saveHighlight({ url: 'https://batch.com', text: 'a' });
    await saveHighlight({ url: 'https://batch.com', text: 'b' });
    await saveHighlight({ url: 'https://batch.com', text: 'c' });
    await saveHighlight({ url: 'https://keep.com', text: 'safe' });

    const result = await deleteHighlightsByUrl('https://batch.com');
    assert.equal(result, true);

    const all = await getAllHighlights();
    assert.ok(!all['https://batch.com'], 'batch.com 的高亮应全部删除');
    assert.ok(all['https://keep.com'], 'keep.com 的高亮应保留');
  });

  it('URL 没有高亮时返回 false', async () => {
    const result = await deleteHighlightsByUrl('https://nope.com');
    assert.equal(result, false);
  });
});

// ==================== 5. 持久化（跨查询保持） ====================

describe('QA002-highlight: 持久化', () => {
  it('保存后重新查询可获得相同数据', async () => {
    const entry = await saveHighlight({
      url: 'https://persist.com',
      text: '持久化测试文本',
      xpath: '/html/body/article',
      offset: 42,
    });

    // 模拟再次加载
    const all = await getAllHighlights();
    const found = all['https://persist.com'].find(h => h.id === entry.id);
    assert.ok(found, '应能通过 getAllHighlights 找到');
    assert.equal(found.text, '持久化测试文本');
    assert.equal(found.xpath, '/html/body/article');
    assert.equal(found.offset, 42);
  });

  it('多个 URL 的数据独立持久化', async () => {
    await saveHighlight({ url: 'https://site-a.com', text: 'A的高亮' });
    await saveHighlight({ url: 'https://site-b.com', text: 'B的高亮' });

    const aList = await getHighlightsByUrl('https://site-a.com');
    const bList = await getHighlightsByUrl('https://site-b.com');

    assert.equal(aList.length, 1);
    assert.equal(bList.length, 1);
    assert.equal(aList[0].text, 'A的高亮');
    assert.equal(bList[0].text, 'B的高亮');
  });
});

// ==================== 6. 每 URL 限制 ====================

describe('QA002-highlight: 每 URL 50 条限制', () => {
  it('达到 50 条后新增抛出错误', async () => {
    const url = 'https://limit-test.com';
    for (let i = 0; i < 50; i++) {
      await saveHighlight({ url, text: `text-${i}`, offset: i });
    }
    await assert.rejects(
      () => saveHighlight({ url, text: 'overflow', offset: 99 }),
      { message: '最多保存 50 个高亮' }
    );
  });

  it('删除一条后可以再添加一条', async () => {
    const url = 'https://limit-recover.com';
    for (let i = 0; i < 50; i++) {
      await saveHighlight({ url, text: `fill-${i}`, offset: i });
    }
    const list = await getHighlightsByUrl(url);
    await deleteHighlight(url, list[0].id);

    const entry = await saveHighlight({ url, text: 'recovered', offset: 99 });
    assert.ok(entry.id, '应能成功保存');
  });
});

// ==================== 7. 扁平化查询 ====================

describe('QA002-highlight: getAllHighlightsFlat', () => {
  it('返回跨 URL 的扁平列表并按时间倒序', async () => {
    resetChromeMock();
    await saveHighlight({ url: 'https://a.com', text: 'first' });
    await new Promise(r => setTimeout(r, 10));
    await saveHighlight({ url: 'https://b.com', text: 'second' });
    await new Promise(r => setTimeout(r, 10));
    await saveHighlight({ url: 'https://c.com', text: 'third' });

    const flat = await getAllHighlightsFlat();
    assert.equal(flat.length, 3);
    assert.equal(flat[0].text, 'third');
    assert.equal(flat[2].text, 'first');
  });

  it('limit 参数限制返回数量', async () => {
    for (let i = 0; i < 20; i++) {
      await saveHighlight({ url: `https://flat-${i}.com`, text: `text-${i}` });
    }
    const flat = await getAllHighlightsFlat(5);
    assert.equal(flat.length, 5);
  });

  it('无数据时返回空数组', async () => {
    resetChromeMock();
    const flat = await getAllHighlightsFlat();
    assert.deepEqual(flat, []);
  });
});

// ==================== 8. 空值与边界处理 ====================

describe('QA002-highlight: 边界条件', () => {
  it('xpath 和 offset 缺失时使用默认值', async () => {
    const entry = await saveHighlight({ url: 'https://test.com', text: 'minimal' });
    assert.equal(entry.xpath, '');
    assert.equal(entry.offset, 0);
  });

  it('查询不存在的 URL 返回空数组', async () => {
    const list = await getHighlightsByUrl('https://nonexistent.com');
    assert.deepEqual(list, []);
  });

  it('getAllHighlights 无数据时返回空对象', async () => {
    const all = await getAllHighlights();
    assert.deepEqual(all, {});
  });
});
