/**
 * E2E 测试 lib/ai-cache.js — AICache 类 + generateCacheKey 全方法覆盖
 *
 * 测试范围：
 *   构造函数, get, set, delete, has, clear, size, generateCacheKey,
 *   evictExpired, stats, LRU 淘汰, TTL 过期, 并发读写, 边界值
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AICache, generateCacheKey } from '../lib/ai-cache.js';

// ---------- 辅助 ----------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================================================================
//  1. 构造函数 — 默认值
// ================================================================

describe('AICache 构造函数 — 默认值', () => {
  it('无参数时 maxSize=50, ttlMs=1800000', () => {
    const cache = new AICache();
    assert.equal(cache.maxSize, 50);
    assert.equal(cache.ttlMs, 30 * 60 * 1000);
  });

  it('自定义选项正确赋值', () => {
    const cache = new AICache({ maxSize: 10, ttlMs: 60000 });
    assert.equal(cache.maxSize, 10);
    assert.equal(cache.ttlMs, 60000);
  });

  it('初始状态 size=0, stats 全零', () => {
    const cache = new AICache();
    assert.equal(cache.size(), 0);
    assert.deepEqual(cache.stats(), { hits: 0, misses: 0, evictions: 0, size: 0 });
  });
});

// ================================================================
//  2. set + get — 基本缓存命中
// ================================================================

describe('AICache set + get — 缓存命中', () => {
  let cache;
  beforeEach(() => { cache = new AICache({ ttlMs: 60000 }); });

  it('set 后 get 返回值含 cachedAt', () => {
    cache.set('k1', { content: 'hello' });
    const result = cache.get('k1');
    assert.equal(result.content, 'hello');
    assert.equal(typeof result.cachedAt, 'number');
    assert.ok(result.cachedAt <= Date.now());
  });

  it('get 返回浅拷贝（顶层独立，嵌套引用共享）', () => {
    cache.set('k2', { content: 'original', nested: { a: 1 } });
    const r1 = cache.get('k2');
    // 顶层属性独立（spread 复制）
    r1.content = 'modified';
    const r2 = cache.get('k2');
    assert.equal(r2.content, 'original');
    // 嵌套对象是共享引用
    r1.nested.a = 999;
    const r3 = cache.get('k2');
    assert.equal(r3.nested.a, 999, '嵌套对象是共享引用');
  });

  it('多次 get 同一键均命中', () => {
    cache.set('k3', { value: 42 });
    assert.equal(cache.get('k3').value, 42);
    assert.equal(cache.get('k3').value, 42);
    assert.equal(cache.get('k3').value, 42);
    assert.equal(cache.stats().hits, 3);
  });
});

// ================================================================
//  3. get — 缓存未命中
// ================================================================

describe('AICache get — 缓存未命中', () => {
  it('不存在的键返回 null', () => {
    const cache = new AICache();
    assert.equal(cache.get('nonexistent'), null);
  });

  it('未命中时 misses 计数器递增', () => {
    const cache = new AICache();
    cache.get('a');
    cache.get('b');
    cache.get('a');
    assert.equal(cache.stats().misses, 3);
  });
});

// ================================================================
//  4. TTL 过期
// ================================================================

describe('AICache TTL 过期', () => {
  it('超过 ttlMs 后 get 返回 null', async () => {
    const cache = new AICache({ ttlMs: 50 });
    cache.set('expire', { data: 'old' });
    await sleep(80);
    assert.equal(cache.get('expire'), null);
    assert.equal(cache.stats().misses, 1);
  });

  it('超过 ttlMs 后 has 返回 false', async () => {
    const cache = new AICache({ ttlMs: 50 });
    cache.set('expire2', { data: 'old' });
    assert.equal(cache.has('expire2'), true);
    await sleep(80);
    assert.equal(cache.has('expire2'), false);
  });

  it('在 ttlMs 内 get 正常返回', async () => {
    const cache = new AICache({ ttlMs: 5000 });
    cache.set('alive', { data: 'live' });
    await sleep(30);
    const result = cache.get('alive');
    assert.equal(result.data, 'live');
  });
});

// ================================================================
//  5. LRU 淘汰
// ================================================================

describe('AICache LRU 淘汰', () => {
  it('超过 maxSize 时淘汰最老条目', () => {
    const cache = new AICache({ maxSize: 3, ttlMs: 60000 });
    cache.set('a', { v: 1 });
    cache.set('b', { v: 2 });
    cache.set('c', { v: 3 });
    assert.equal(cache.size(), 3);

    // 插入第 4 个，应淘汰 'a'
    cache.set('d', { v: 4 });
    assert.equal(cache.size(), 3);
    assert.equal(cache.get('a'), null);
    assert.equal(cache.get('d').v, 4);
    assert.equal(cache.stats().evictions, 1);
  });

  it('LRU 访问刷新：get 后条目变为最新', () => {
    const cache = new AICache({ maxSize: 3, ttlMs: 60000 });
    cache.set('a', { v: 1 });
    cache.set('b', { v: 2 });
    cache.set('c', { v: 3 });

    // 访问 'a'，使其变为最新
    cache.get('a');

    // 插入 'd'，应淘汰 'b'（最久未访问）
    cache.set('d', { v: 4 });
    assert.equal(cache.get('a').v, 1, 'a 应保留');
    assert.equal(cache.get('b'), null, 'b 应被淘汰');
    assert.equal(cache.get('d').v, 4);
  });

  it('连续淘汰直到 size 稳定', () => {
    const cache = new AICache({ maxSize: 2, ttlMs: 60000 });
    for (let i = 0; i < 10; i++) {
      cache.set(`k${i}`, { i });
    }
    assert.equal(cache.size(), 2);
    // 最后两个应保留
    assert.equal(cache.get('k8').i, 8);
    assert.equal(cache.get('k9').i, 9);
    assert.equal(cache.stats().evictions, 8);
  });
});

// ================================================================
//  6. set 更新已有键
// ================================================================

describe('AICache set — 更新已有键', () => {
  it('重复 set 同一键不增加 size', () => {
    const cache = new AICache({ maxSize: 5, ttlMs: 60000 });
    cache.set('dup', { v: 1 });
    assert.equal(cache.size(), 1);
    cache.set('dup', { v: 2 });
    assert.equal(cache.size(), 1);
    assert.equal(cache.get('dup').v, 2);
  });

  it('更新已有键不触发 evictions', () => {
    const cache = new AICache({ maxSize: 3, ttlMs: 60000 });
    cache.set('a', { v: 1 });
    cache.set('a', { v: 2 });
    cache.set('a', { v: 3 });
    assert.equal(cache.stats().evictions, 0);
  });
});

// ================================================================
//  7. maxSize=0 — 禁用缓存
// ================================================================

describe('AICache maxSize=0 — 禁用缓存', () => {
  it('maxSize=0 时不存入任何条目', () => {
    const cache = new AICache({ maxSize: 0, ttlMs: 60000 });
    cache.set('k', { v: 1 });
    assert.equal(cache.size(), 0);
    assert.equal(cache.get('k'), null);
  });

  it('set 仍递增 evictions 计数器', () => {
    const cache = new AICache({ maxSize: 0, ttlMs: 60000 });
    cache.set('k1', { v: 1 });
    cache.set('k2', { v: 2 });
    assert.equal(cache.stats().evictions, 2);
  });
});

// ================================================================
//  8. delete
// ================================================================

describe('AICache delete', () => {
  it('删除存在的键返回 true', () => {
    const cache = new AICache({ ttlMs: 60000 });
    cache.set('k', { v: 1 });
    assert.equal(cache.delete('k'), true);
    assert.equal(cache.get('k'), null);
    assert.equal(cache.size(), 0);
  });

  it('删除不存在的键返回 false', () => {
    const cache = new AICache();
    assert.equal(cache.delete('ghost'), false);
  });
});

// ================================================================
//  9. has
// ================================================================

describe('AICache has', () => {
  it('存在的有效键返回 true', () => {
    const cache = new AICache({ ttlMs: 60000 });
    cache.set('k', { v: 1 });
    assert.equal(cache.has('k'), true);
  });

  it('不存在的键返回 false', () => {
    const cache = new AICache();
    assert.equal(cache.has('nope'), false);
  });

  it('过期的键返回 false 并清理', async () => {
    const cache = new AICache({ ttlMs: 50 });
    cache.set('k', { v: 1 });
    await sleep(80);
    assert.equal(cache.has('k'), false);
    assert.equal(cache.size(), 0, '过期键应被清理');
  });
});

// ================================================================
//  10. clear
// ================================================================

describe('AICache clear', () => {
  it('清除所有条目', () => {
    const cache = new AICache({ ttlMs: 60000 });
    cache.set('a', { v: 1 });
    cache.set('b', { v: 2 });
    cache.set('c', { v: 3 });
    assert.equal(cache.size(), 3);
    cache.clear();
    assert.equal(cache.size(), 0);
    assert.equal(cache.get('a'), null);
  });

  it('对空缓存调用 clear 不报错', () => {
    const cache = new AICache();
    cache.clear();
    assert.equal(cache.size(), 0);
  });
});

// ================================================================
//  11. evictExpired — 主动清理过期条目
// ================================================================

describe('AICache evictExpired', () => {
  it('清理过期条目并返回数量', async () => {
    const cache = new AICache({ ttlMs: 50 });
    cache.set('a', { v: 1 });
    cache.set('b', { v: 2 });
    await sleep(80);
    cache.set('c', { v: 3 }); // 新条目，未过期
    const evicted = cache.evictExpired();
    assert.equal(evicted, 2);
    assert.equal(cache.size(), 1);
    assert.equal(cache.get('c').v, 3);
  });

  it('无过期条目时返回 0', () => {
    const cache = new AICache({ ttlMs: 60000 });
    cache.set('a', { v: 1 });
    assert.equal(cache.evictExpired(), 0);
    assert.equal(cache.size(), 1);
  });
});

// ================================================================
//  12. stats — 统计计数器
// ================================================================

describe('AICache stats', () => {
  it('综合场景统计正确', async () => {
    const cache = new AICache({ maxSize: 2, ttlMs: 50 });
    cache.set('a', { v: 1 });
    cache.set('b', { v: 2 });
    cache.get('a');           // hit: LRU → store=[b, a]
    cache.get('x');           // miss
    cache.set('c', { v: 3 }); // store满 → evict最老'b' → store=[a, c], evictions=1
    await sleep(80);
    cache.get('b');           // miss: 已不在 store 中

    const s = cache.stats();
    assert.equal(s.hits, 1);
    assert.equal(s.misses, 2);
    assert.equal(s.evictions, 1);
    // size() 返回 _store.size，不检查 TTL；a 和 c 仍在 store 中（只是已过期）
    assert.equal(s.size, 2);
  });
});

// ================================================================
//  13. generateCacheKey — 文本消息
// ================================================================

describe('generateCacheKey — 文本消息', () => {
  it('基本文本消息生成 32 字符十六进制键', () => {
    const key = generateCacheKey({
      messages: [{ role: 'user', content: '你好' }],
      systemPrompt: '你是助手',
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    });
    assert.equal(typeof key, 'string');
    assert.equal(key.length, 32);
    assert.match(key, /^[0-9a-f]{32}$/);
  });

  it('相同输入生成相同键（确定性）', () => {
    const opts = {
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: 'sys',
      model: 'gpt-4o',
      maxTokens: 2048,
      protocol: 'openai'
    };
    const k1 = generateCacheKey(opts);
    const k2 = generateCacheKey(opts);
    assert.equal(k1, k2);
  });

  it('不同输入生成不同键', () => {
    const k1 = generateCacheKey({
      messages: [{ role: 'user', content: '问题 A' }],
      systemPrompt: '', model: 'gpt-4o', maxTokens: 4096, protocol: 'openai'
    });
    const k2 = generateCacheKey({
      messages: [{ role: 'user', content: '问题 B' }],
      systemPrompt: '', model: 'gpt-4o', maxTokens: 4096, protocol: 'openai'
    });
    assert.notEqual(k1, k2);
  });

  it('空消息数组仍生成有效键', () => {
    const key = generateCacheKey({
      messages: [],
      systemPrompt: 'sys', model: 'm', maxTokens: 100, protocol: 'openai'
    });
    assert.equal(typeof key, 'string');
    assert.equal(key.length, 32);
  });

  it('多条消息组合到键中', () => {
    const k1 = generateCacheKey({
      messages: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' }
      ],
      systemPrompt: '', model: 'm', maxTokens: 100, protocol: 'openai'
    });
    const k2 = generateCacheKey({
      messages: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' }
      ],
      systemPrompt: '', model: 'm', maxTokens: 100, protocol: 'openai'
    });
    assert.notEqual(k1, k2, '不同消息数应产生不同键');
  });

  it('默认参数生成有效键', () => {
    const key = generateCacheKey({
      messages: [{ role: 'user', content: 'test' }]
    });
    assert.equal(typeof key, 'string');
    assert.equal(key.length, 32);
  });
});

// ================================================================
//  14. generateCacheKey — 图片消息不缓存
// ================================================================

describe('generateCacheKey — 图片消息', () => {
  it('含 image_url 类型的 message 返回 null', () => {
    const key = generateCacheKey({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '描述这张图' },
          { type: 'image_url', image_url: { url: 'https://example.com/img.png' } }
        ]
      }],
      systemPrompt: '', model: 'gpt-4o', maxTokens: 4096, protocol: 'openai'
    });
    assert.equal(key, null);
  });

  it('含 image 类型的 message 返回 null', () => {
    const key = generateCacheKey({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '看图' },
          { type: 'image', source: { type: 'base64', data: '...' } }
        ]
      }],
      systemPrompt: '', model: 'claude', maxTokens: 4096, protocol: 'claude'
    });
    assert.equal(key, null);
  });

  it('纯文本数组 content 正常生成键', () => {
    const key = generateCacheKey({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '段落一' },
          { type: 'text', text: '段落二' }
        ]
      }],
      systemPrompt: '', model: 'm', maxTokens: 100, protocol: 'openai'
    });
    assert.equal(typeof key, 'string');
    assert.equal(key.length, 32);
  });
});

// ================================================================
//  15. set 深拷贝 value
// ================================================================

describe('AICache set — 浅拷贝', () => {
  it('set 浅拷贝：顶层属性独立，嵌套引用共享', () => {
    const cache = new AICache({ ttlMs: 60000 });
    const original = { content: 'hello', data: [1, 2, 3] };
    cache.set('shallow', original);
    original.content = 'changed';
    original.data.push(4);
    const cached = cache.get('shallow');
    // 顶层属性被 spread 复制
    assert.equal(cached.content, 'hello');
    // 嵌套数组是共享引用
    assert.deepEqual(cached.data, [1, 2, 3, 4]);
  });
});

// ================================================================
//  16. 并发读写 — 大量 set/get 交叉操作
// ================================================================

describe('AICache 并发读写', () => {
  it('交替 set/get 不产生异常', () => {
    const cache = new AICache({ maxSize: 10, ttlMs: 60000 });
    for (let i = 0; i < 100; i++) {
      cache.set(`k${i}`, { i });
      cache.get(`k${Math.max(0, i - 5)}`);
      if (i % 10 === 0) cache.delete(`k${i - 3}`);
    }
    assert.ok(cache.size() <= 10);
  });

  it('异步并发 get/set 结果一致', async () => {
    const cache = new AICache({ maxSize: 50, ttlMs: 60000 });
    const ops = [];
    for (let i = 0; i < 50; i++) {
      ops.push(
        (async () => {
          cache.set(`async${i}`, { i });
          await sleep(1);
          const r = cache.get(`async${i}`);
          return r?.i;
        })()
      );
    }
    const results = await Promise.all(ops);
    results.forEach((val, i) => {
      assert.equal(val, i, `async${i} 应返回 ${i}`);
    });
  });
});

// ================================================================
//  17. 边界值 — maxSize=1
// ================================================================

describe('AICache 边界值 — maxSize=1', () => {
  it('maxSize=1 时只保留最新条目', () => {
    const cache = new AICache({ maxSize: 1, ttlMs: 60000 });
    cache.set('first', { v: 1 });
    assert.equal(cache.size(), 1);
    cache.set('second', { v: 2 });
    assert.equal(cache.size(), 1);
    assert.equal(cache.get('first'), null);
    assert.equal(cache.get('second').v, 2);
  });
});

// ================================================================
//  18. 边界值 — 空字符串键
// ================================================================

describe('AICache 边界值 — 空字符串键', () => {
  it('空字符串可作为有效键', () => {
    const cache = new AICache({ ttlMs: 60000 });
    cache.set('', { v: 'empty key' });
    assert.equal(cache.get('').v, 'empty key');
    assert.equal(cache.has(''), true);
    assert.equal(cache.delete(''), true);
    assert.equal(cache.get(''), null);
  });
});

// ================================================================
//  19. 边界值 — 超大 value
// ================================================================

describe('AICache 边界值 — 超大 value', () => {
  it('存取大型对象正常', () => {
    const cache = new AICache({ ttlMs: 60000 });
    const bigContent = 'x'.repeat(100000);
    cache.set('big', { content: bigContent, meta: { a: 1, b: 2, c: [3, 4, 5] } });
    const result = cache.get('big');
    assert.equal(result.content.length, 100000);
    assert.deepEqual(result.meta, { a: 1, b: 2, c: [3, 4, 5] });
  });
});
