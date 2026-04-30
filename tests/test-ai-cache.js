/**
 * 测试 lib/ai-cache.js — AI 响应缓存
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { AICache, generateCacheKey } = await import('../lib/ai-cache.js');

// ==================== generateCacheKey ====================

describe('generateCacheKey — 基本功能', () => {
  it('相同输入生成相同键', () => {
    const opts = {
      messages: [{ role: 'user', content: '什么是 JavaScript？' }],
      systemPrompt: '你是一个助手',
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    };
    const key1 = generateCacheKey(opts);
    const key2 = generateCacheKey(opts);
    assert.equal(key1, key2);
  });

  it('返回 32 位十六进制字符串', () => {
    const key = generateCacheKey({
      messages: [{ role: 'user', content: 'test' }],
      systemPrompt: '',
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    });
    assert.match(key, /^[0-9a-f]{32}$/, '应返回 32 位十六进制哈希');
  });

  it('不同消息生成不同键', () => {
    const key1 = generateCacheKey({
      messages: [{ role: 'user', content: '什么是 React？' }],
      systemPrompt: '助手',
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    });
    const key2 = generateCacheKey({
      messages: [{ role: 'user', content: '什么是 Vue？' }],
      systemPrompt: '助手',
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    });
    assert.notEqual(key1, key2);
  });

  it('不同 model 生成不同键', () => {
    const base = {
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: 'sys',
      maxTokens: 4096,
      protocol: 'openai'
    };
    const key1 = generateCacheKey({ ...base, model: 'gpt-4o' });
    const key2 = generateCacheKey({ ...base, model: 'gpt-3.5-turbo' });
    assert.notEqual(key1, key2);
  });

  it('不同 systemPrompt 生成不同键', () => {
    const base = {
      messages: [{ role: 'user', content: 'hello' }],
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    };
    const key1 = generateCacheKey({ ...base, systemPrompt: '你是助手A' });
    const key2 = generateCacheKey({ ...base, systemPrompt: '你是助手B' });
    assert.notEqual(key1, key2);
  });

  it('不同 protocol 生成不同键', () => {
    const base = {
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: 'sys',
      model: 'gpt-4o',
      maxTokens: 4096
    };
    const key1 = generateCacheKey({ ...base, protocol: 'openai' });
    const key2 = generateCacheKey({ ...base, protocol: 'claude' });
    assert.notEqual(key1, key2);
  });

  it('多轮对话按顺序区分', () => {
    const base = {
      systemPrompt: 'sys',
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    };
    const key1 = generateCacheKey({
      ...base,
      messages: [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q2' }
      ]
    });
    const key2 = generateCacheKey({
      ...base,
      messages: [
        { role: 'user', content: 'Q2' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q1' }
      ]
    });
    assert.notEqual(key1, key2);
  });

  it('空消息数组返回有效键', () => {
    const key = generateCacheKey({
      messages: [],
      systemPrompt: 'sys',
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    });
    assert.ok(key);
    assert.match(key, /^[0-9a-f]{32}$/);
  });
});

describe('generateCacheKey — 图片消息', () => {
  it('包含 image_url 的消息返回 null', () => {
    const key = generateCacheKey({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '这是什么？' },
          { type: 'image_url', image_url: { url: 'https://example.com/img.png' } }
        ]
      }],
      systemPrompt: 'sys',
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    });
    assert.equal(key, null, '含图片的消息不应缓存');
  });

  it('包含 image 类型（Claude 格式）的消息返回 null', () => {
    const key = generateCacheKey({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '描述图片' },
          { type: 'image', source: { type: 'url', url: 'https://example.com/pic.jpg' } }
        ]
      }],
      systemPrompt: 'sys',
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      protocol: 'claude'
    });
    assert.equal(key, null, '含图片的消息不应缓存');
  });

  it('纯文本消息正常生成键', () => {
    const key = generateCacheKey({
      messages: [{ role: 'user', content: '纯文本问题' }],
      systemPrompt: 'sys',
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    });
    assert.ok(key);
    assert.match(key, /^[0-9a-f]{32}$/);
  });

  it('只包含文本的数组内容正常生成键', () => {
    const key = generateCacheKey({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '第一段' },
          { type: 'text', text: '第二段' }
        ]
      }],
      systemPrompt: 'sys',
      model: 'gpt-4o',
      maxTokens: 4096,
      protocol: 'openai'
    });
    assert.ok(key);
    assert.match(key, /^[0-9a-f]{32}$/);
  });
});

// ==================== AICache ====================

describe('AICache — 构造函数', () => {
  it('默认 maxSize 和 ttlMs', () => {
    const cache = new AICache();
    assert.equal(cache.maxSize, 50);
    assert.equal(cache.ttlMs, 30 * 60 * 1000);
  });

  it('自定义 maxSize 和 ttlMs', () => {
    const cache = new AICache({ maxSize: 10, ttlMs: 60000 });
    assert.equal(cache.maxSize, 10);
    assert.equal(cache.ttlMs, 60000);
  });
});

describe('AICache — 基本存取', () => {
  let cache;
  beforeEach(() => {
    cache = new AICache({ maxSize: 10, ttlMs: 60000 });
  });

  it('set 后 get 返回相同值', () => {
    cache.set('key1', { content: 'hello', model: 'gpt-4o' });
    const result = cache.get('key1');
    assert.ok(result);
    assert.equal(result.content, 'hello');
    assert.equal(result.model, 'gpt-4o');
  });

  it('get 不存在的键返回 null', () => {
    assert.equal(cache.get('nonexistent'), null);
  });

  it('has 检查存在性', () => {
    assert.equal(cache.has('key1'), false);
    cache.set('key1', { content: 'hello' });
    assert.equal(cache.has('key1'), true);
  });

  it('delete 删除条目', () => {
    cache.set('key1', { content: 'hello' });
    assert.equal(cache.delete('key1'), true);
    assert.equal(cache.get('key1'), null);
  });

  it('delete 不存在的键返回 false', () => {
    assert.equal(cache.delete('nonexistent'), false);
  });

  it('clear 清除所有条目', () => {
    cache.set('key1', { content: 'a' });
    cache.set('key2', { content: 'b' });
    cache.clear();
    assert.equal(cache.size(), 0);
    assert.equal(cache.get('key1'), null);
  });

  it('size 返回条目数', () => {
    assert.equal(cache.size(), 0);
    cache.set('key1', { content: 'a' });
    assert.equal(cache.size(), 1);
    cache.set('key2', { content: 'b' });
    assert.equal(cache.size(), 2);
  });

  it('get 返回的值包含 cachedAt 时间戳', () => {
    const before = Date.now();
    cache.set('key1', { content: 'hello' });
    const result = cache.get('key1');
    assert.ok(result.cachedAt >= before);
    assert.ok(result.cachedAt <= Date.now());
  });
});

describe('AICache — TTL 过期', () => {
  it('过期条目返回 null', async () => {
    const cache = new AICache({ maxSize: 10, ttlMs: 1 }); // 1ms TTL
    cache.set('key1', { content: 'hello' });
    // 等待过期
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(cache.get('key1'), null);
  });

  it('过期后 has 返回 false', async () => {
    const cache = new AICache({ maxSize: 10, ttlMs: 1 });
    cache.set('key1', { content: 'hello' });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(cache.has('key1'), false);
  });

  it('过期后 size 减少', async () => {
    const cache = new AICache({ maxSize: 10, ttlMs: 1 });
    cache.set('key1', { content: 'hello' });
    await new Promise(resolve => setTimeout(resolve, 10));
    // get 触发清理
    cache.get('key1');
    assert.equal(cache.size(), 0);
  });

  it('evictExpired 主动清理过期条目', async () => {
    const cache = new AICache({ maxSize: 10, ttlMs: 1 });
    cache.set('key1', { content: 'a' });
    cache.set('key2', { content: 'b' });
    await new Promise(resolve => setTimeout(resolve, 10));
    const evicted = cache.evictExpired();
    assert.equal(evicted, 2);
    assert.equal(cache.size(), 0);
  });

  it('evictExpired 不清理未过期条目', async () => {
    const cache = new AICache({ maxSize: 10, ttlMs: 60000 });
    cache.set('key1', { content: 'a' });
    cache.set('key2', { content: 'b' });
    const evicted = cache.evictExpired();
    assert.equal(evicted, 0);
    assert.equal(cache.size(), 2);
  });
});

describe('AICache — LRU 淘汰', () => {
  it('超过 maxSize 淘汰最久未访问的条目', () => {
    const cache = new AICache({ maxSize: 2, ttlMs: 60000 });
    cache.set('key1', { content: 'a' });
    cache.set('key2', { content: 'b' });
    cache.set('key3', { content: 'c' }); // 触发淘汰 key1
    assert.equal(cache.size(), 2);
    assert.equal(cache.get('key1'), null, 'key1 应被淘汰');
    assert.ok(cache.get('key2'), 'key2 应保留');
    assert.ok(cache.get('key3'), 'key3 应保留');
  });

  it('get 命中刷新 LRU 顺序', () => {
    const cache = new AICache({ maxSize: 2, ttlMs: 60000 });
    cache.set('key1', { content: 'a' });
    cache.set('key2', { content: 'b' });
    cache.get('key1'); // 刷新 key1 的访问时间
    cache.set('key3', { content: 'c' }); // 淘汰 key2（最久未访问）
    assert.ok(cache.get('key1'), 'key1 被访问过，应保留');
    assert.equal(cache.get('key2'), null, 'key2 未被访问，应被淘汰');
    assert.ok(cache.get('key3'), 'key3 应保留');
  });
});

describe('AICache — 统计', () => {
  it('stats 返回初始零值', () => {
    const cache = new AICache();
    const stats = cache.stats();
    assert.equal(stats.hits, 0);
    assert.equal(stats.misses, 0);
    assert.equal(stats.evictions, 0);
    assert.equal(stats.size, 0);
  });

  it('get 命中增加 hits 计数', () => {
    const cache = new AICache();
    cache.set('key1', { content: 'a' });
    cache.get('key1');
    cache.get('key1');
    assert.equal(cache.stats().hits, 2);
  });

  it('get 未命中增加 misses 计数', () => {
    const cache = new AICache();
    cache.get('nonexistent');
    cache.get('also-not');
    assert.equal(cache.stats().misses, 2);
  });

  it('LRU 淘汰增加 evictions 计数', () => {
    const cache = new AICache({ maxSize: 1, ttlMs: 60000 });
    cache.set('key1', { content: 'a' });
    cache.set('key2', { content: 'b' }); // 淘汰 key1
    assert.equal(cache.stats().evictions, 1);
  });

  it('过期 get 计为 miss', async () => {
    const cache = new AICache({ maxSize: 10, ttlMs: 1 });
    cache.set('key1', { content: 'a' });
    await new Promise(resolve => setTimeout(resolve, 10));
    cache.get('key1');
    assert.equal(cache.stats().misses, 1);
    assert.equal(cache.stats().hits, 0);
  });
});

describe('AICache — 边界情况', () => {
  it('覆盖已有键的值', () => {
    const cache = new AICache();
    cache.set('key1', { content: 'old' });
    cache.set('key1', { content: 'new' });
    assert.equal(cache.get('key1').content, 'new');
    assert.equal(cache.size(), 1);
  });

  it('maxSize=0 时所有条目立即淘汰', () => {
    const cache = new AICache({ maxSize: 0, ttlMs: 60000 });
    cache.set('key1', { content: 'a' });
    assert.equal(cache.size(), 0);
  });

  it('大量条目正确淘汰', () => {
    const cache = new AICache({ maxSize: 5, ttlMs: 60000 });
    for (let i = 0; i < 10; i++) {
      cache.set(`key${i}`, { content: `value${i}` });
    }
    assert.equal(cache.size(), 5);
    // key0-key4 应被淘汰，key5-key9 应保留
    for (let i = 0; i < 5; i++) {
      assert.equal(cache.get(`key${i}`), null, `key${i} 应被淘汰`);
    }
    for (let i = 5; i < 10; i++) {
      assert.ok(cache.get(`key${i}`), `key${i} 应保留`);
    }
  });

  it('缓存值可以包含复杂对象', () => {
    const cache = new AICache();
    const value = {
      content: '很长的AI回答...',
      usage: { prompt_tokens: 100, completion_tokens: 200 },
      model: 'gpt-4o',
      metadata: { finish_reason: 'stop' }
    };
    cache.set('key1', value);
    const result = cache.get('key1');
    assert.equal(result.content, value.content);
    assert.deepEqual(result.usage, value.usage);
    assert.equal(result.model, value.model);
    assert.deepEqual(result.metadata, value.metadata);
  });
});

// ==================== AICache — 集成测试（cachedChat / cachedChatStream 通过 ai-client.js 的方法调用） ====================
// 这些测试在集成到 AIClient 后再添加，见下方

describe('AICache — 集成到 AIClient', () => {
  it('cachedChat 未命中时调用底层 chat 并缓存', async () => {
    const { AIClient } = await import('../lib/ai-client.js');
    const cache = new AICache({ maxSize: 10, ttlMs: 60000 });

    // 创建 mock AIClient
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    let chatCalled = 0;
    const mockResult = { content: 'AI 回答', usage: { total_tokens: 50 }, model: 'gpt-4o' };
    client.chat = async () => { chatCalled++; return mockResult; };

    const messages = [{ role: 'user', content: '你好' }];
    const result = await client.cachedChat(messages, { systemPrompt: 'sys' }, cache);

    assert.equal(chatCalled, 1, '应调用底层 chat');
    assert.equal(result.content, 'AI 回答');
    assert.equal(result.fromCache, false, '首次应标记为非缓存');
    assert.equal(cache.size(), 1, '应缓存一条');
  });

  it('cachedChat 命中时直接返回缓存，不调用底层 chat', async () => {
    const { AIClient } = await import('../lib/ai-client.js');
    const cache = new AICache({ maxSize: 10, ttlMs: 60000 });

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    let chatCalled = 0;
    client.chat = async () => { chatCalled++; return { content: 'AI 回答', model: 'gpt-4o' }; };

    const messages = [{ role: 'user', content: '你好' }];
    const opts = { systemPrompt: 'sys' };

    // 第一次调用
    const result1 = await client.cachedChat(messages, opts, cache);
    assert.equal(chatCalled, 1);
    assert.equal(result1.fromCache, false);

    // 第二次调用 — 应命中缓存
    const result2 = await client.cachedChat(messages, opts, cache);
    assert.equal(chatCalled, 1, '不应再次调用底层 chat');
    assert.equal(result2.fromCache, true, '应标记为缓存命中');
    assert.equal(result2.content, 'AI 回答');
  });

  it('cachedChat 图片消息不缓存', async () => {
    const { AIClient } = await import('../lib/ai-client.js');
    const cache = new AICache({ maxSize: 10, ttlMs: 60000 });

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    let chatCalled = 0;
    client.chat = async () => { chatCalled++; return { content: '图片描述', model: 'gpt-4o' }; };

    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: '这是什么？' },
        { type: 'image_url', image_url: { url: 'https://example.com/img.png' } }
      ]
    }];

    await client.cachedChat(messages, { systemPrompt: 'sys' }, cache);
    assert.equal(cache.size(), 0, '图片消息不应被缓存');
  });

  it('cachedChatStream 未命中时正常流式 + 缓存完成', async () => {
    const { AIClient } = await import('../lib/ai-client.js');
    const cache = new AICache({ maxSize: 10, ttlMs: 60000 });

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });

    // Mock chatStream 为 async generator
    async function* mockStream() {
      yield 'Hello';
      yield ' World';
    }
    client.chatStream = mockStream;

    const messages = [{ role: 'user', content: '你好' }];
    const chunks = [];
    for await (const chunk of client.cachedChatStream(messages, { systemPrompt: 'sys' }, cache)) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, ['Hello', ' World']);
    assert.equal(cache.size(), 1, '完成后应缓存完整响应');
    assert.equal(cache.size(), 1, '完成后应缓存完整响应');
  });

  it('cachedChatStream 命中时一次性 yield 缓存内容', async () => {
    const { AIClient } = await import('../lib/ai-client.js');
    const cache = new AICache({ maxSize: 10, ttlMs: 60000 });

    // 预填充缓存
    const { generateCacheKey: genKey } = await import('../lib/ai-cache.js');
    const messages = [{ role: 'user', content: '你好' }];
    const opts = { systemPrompt: 'sys', model: 'gpt-4o', maxTokens: 4096, protocol: 'openai' };
    const key = genKey({ ...opts, messages });
    cache.set(key, { content: '缓存的回答', model: 'gpt-4o' });

    const client = new AIClient({ apiKey: 'test', protocol: 'openai', model: 'gpt-4o' });
    let streamCalled = false;
    client.chatStream = async function*() { streamCalled = true; yield '不应调用'; };

    const chunks = [];
    for await (const chunk of client.cachedChatStream(messages, opts, cache)) {
      chunks.push(chunk);
    }

    assert.equal(streamCalled, false, '不应调用底层 chatStream');
    assert.deepEqual(chunks, ['缓存的回答'], '应一次性 yield 缓存内容');
  });
});
