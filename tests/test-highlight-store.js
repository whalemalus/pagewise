/**
 * 测试 lib/highlight-store.js — 页面高亮存储
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock, uninstallChromeMock } from './helpers/setup.js';

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

// ==================== saveHighlight ====================

describe('saveHighlight()', () => {
  it('保存高亮并返回带 id 和 createdAt 的条目', async () => {
    const entry = await saveHighlight({
      url: 'https://example.com/page',
      text: 'Hello World',
      xpath: '/html/body/p[1]',
      offset: 5
    });

    assert.ok(entry.id, '应有 id');
    assert.ok(entry.createdAt, '应有 createdAt');
    assert.equal(entry.url, 'https://example.com/page');
    assert.equal(entry.text, 'Hello World');
    assert.equal(entry.xpath, '/html/body/p[1]');
    assert.equal(entry.offset, 5);
  });

  it('缺少 url 时抛出错误', async () => {
    await assert.rejects(
      () => saveHighlight({ text: 'test' }),
      { message: 'url and text are required' }
    );
  });

  it('缺少 text 时抛出错误', async () => {
    await assert.rejects(
      () => saveHighlight({ url: 'https://example.com' }),
      { message: 'url and text are required' }
    );
  });

  it('相同文本+xpath+offset 不重复保存（去重）', async () => {
    const data = {
      url: 'https://example.com',
      text: 'duplicate text',
      xpath: '/html/body/div[1]',
      offset: 10
    };

    const first = await saveHighlight(data);
    const second = await saveHighlight(data);

    assert.equal(first.id, second.id, '应返回同一条目');
  });

  it('不同位置的相同文本可以分别保存', async () => {
    const first = await saveHighlight({
      url: 'https://example.com',
      text: 'same text',
      xpath: '/html/body/p[1]',
      offset: 0
    });

    const second = await saveHighlight({
      url: 'https://example.com',
      text: 'same text',
      xpath: '/html/body/p[2]',
      offset: 5
    });

    assert.notEqual(first.id, second.id, '应为不同条目');
  });

  it('每个 URL 最多保存 50 个高亮', async () => {
    const url = 'https://example.com/limit-test';

    for (let i = 0; i < 50; i++) {
      await saveHighlight({ url, text: `text-${i}`, offset: i });
    }

    await assert.rejects(
      () => saveHighlight({ url, text: 'overflow', offset: 99 }),
      { message: '最多保存 50 个高亮' }
    );
  });

  it('空字符串 xpath 和 offset 默认为 0', async () => {
    const entry = await saveHighlight({
      url: 'https://example.com',
      text: 'minimal data'
    });

    assert.equal(entry.xpath, '');
    assert.equal(entry.offset, 0);
  });
});

// ==================== getHighlightsByUrl ====================

describe('getHighlightsByUrl()', () => {
  it('返回指定 URL 的高亮列表', async () => {
    await saveHighlight({ url: 'https://a.com', text: 'text1' });
    await saveHighlight({ url: 'https://a.com', text: 'text2' });
    await saveHighlight({ url: 'https://b.com', text: 'text3' });

    const highlights = await getHighlightsByUrl('https://a.com');
    assert.equal(highlights.length, 2);
    assert.ok(highlights.every(h => h.url === 'https://a.com'));
  });

  it('无高亮时返回空数组', async () => {
    const highlights = await getHighlightsByUrl('https://nonexistent.com');
    assert.deepEqual(highlights, []);
  });
});

// ==================== getAllHighlights ====================

describe('getAllHighlights()', () => {
  it('返回以 URL 为 key 的映射', async () => {
    await saveHighlight({ url: 'https://a.com', text: 't1' });
    await saveHighlight({ url: 'https://b.com', text: 't2' });

    const all = await getAllHighlights();
    assert.ok(all['https://a.com'], '应有 a.com 的高亮');
    assert.ok(all['https://b.com'], '应有 b.com 的高亮');
    assert.equal(all['https://a.com'].length, 1);
    assert.equal(all['https://b.com'].length, 1);
  });

  it('无数据时返回空对象', async () => {
    const all = await getAllHighlights();
    assert.deepEqual(all, {});
  });
});

// ==================== deleteHighlight ====================

describe('deleteHighlight()', () => {
  it('删除指定高亮', async () => {
    const entry = await saveHighlight({ url: 'https://example.com', text: 'to delete' });
    const result = await deleteHighlight('https://example.com', entry.id);

    assert.equal(result, true);

    const remaining = await getHighlightsByUrl('https://example.com');
    assert.equal(remaining.length, 0);
  });

  it('删除不存在的 ID 返回 false', async () => {
    await saveHighlight({ url: 'https://example.com', text: 'exists' });
    const result = await deleteHighlight('https://example.com', 'nonexistent-id');
    assert.equal(result, false);
  });

  it('删除后不影响其他高亮', async () => {
    const e1 = await saveHighlight({ url: 'https://example.com', text: 'keep' });
    const e2 = await saveHighlight({ url: 'https://example.com', text: 'remove' });

    await deleteHighlight('https://example.com', e2.id);

    const remaining = await getHighlightsByUrl('https://example.com');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, e1.id);
  });
});

// ==================== deleteHighlightsByUrl ====================

describe('deleteHighlightsByUrl()', () => {
  it('删除指定 URL 的所有高亮', async () => {
    await saveHighlight({ url: 'https://to-delete.com', text: 't1' });
    await saveHighlight({ url: 'https://to-delete.com', text: 't2' });
    await saveHighlight({ url: 'https://keep.com', text: 't3' });

    const result = await deleteHighlightsByUrl('https://to-delete.com');
    assert.equal(result, true);

    const all = await getAllHighlights();
    assert.ok(!all['https://to-delete.com'], '已删除的 URL 不应存在');
    assert.ok(all['https://keep.com'], '保留的 URL 应存在');
  });

  it('删除不存在的 URL 返回 false', async () => {
    const result = await deleteHighlightsByUrl('https://nonexistent.com');
    assert.equal(result, false);
  });
});

// ==================== getAllHighlightsFlat ====================

describe('getAllHighlightsFlat()', () => {
  it('返回扁平化列表，按时间倒序', async () => {
    // 清空存储确保干净环境
    resetChromeMock();

    await saveHighlight({ url: 'https://a.com', text: 'first', offset: 0 });
    // 稍等确保时间戳不同
    await new Promise(r => setTimeout(r, 10));
    await saveHighlight({ url: 'https://b.com', text: 'second', offset: 0 });

    const flat = await getAllHighlightsFlat();
    assert.equal(flat.length, 2);
    // 后保存的在前（倒序）
    assert.equal(flat[0].text, 'second');
    assert.equal(flat[1].text, 'first');
  });

  it('遵守 limit 参数', async () => {
    for (let i = 0; i < 10; i++) {
      await saveHighlight({ url: `https://test-${i}.com`, text: `text-${i}` });
    }

    const flat = await getAllHighlightsFlat(5);
    assert.equal(flat.length, 5);
  });

  it('无数据时返回空数组', async () => {
    const flat = await getAllHighlightsFlat();
    assert.deepEqual(flat, []);
  });
});
