import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

let mockFetchResult, mockFetchCalls = [];
globalThis.fetch = async (url, opts) => {
  mockFetchCalls.push({ url, opts });
  if (mockFetchResult instanceof Error) throw mockFetchResult;
  return mockFetchResult;
};

// Mock ReadableStream for streaming tests
class MockReadableStream {
  constructor(chunks) { this.chunks = chunks; }
  getReader() {
    const chunks = [...this.chunks];
    return {
      read: async () => {
        if (chunks.length === 0) return { done: true, value: undefined };
        return { done: false, value: new TextEncoder().encode(chunks.shift()) };
      }
    };
  }
}

const { AIClient, estimateTokens, estimateMessagesTokens } = await import('../lib/ai-client.js');

describe('estimateTokens', () => {
  beforeEach(() => {
    mockFetchCalls = [];
    mockFetchResult = undefined;
  });

  afterEach(() => {
    mockFetchCalls = [];
    mockFetchResult = undefined;
  });

  it('空字符串返回 0', () => {
    assert.equal(estimateTokens(''), 0);
  });

  it('null / undefined / falsy 返回 0', () => {
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
    assert.equal(estimateTokens(0), 0);
    assert.equal(estimateTokens(false), 0);
  });

  it('英文文本估算合理（~4 chars/token → length/3 向上取整）', () => {
    // 12 chars / 3 = 4
    assert.equal(estimateTokens('Hello World!'), 4);
    // 13 chars / 3 ≈ 4.33 → 5
    assert.equal(estimateTokens('Hello World!!'), 5);
  });

  it('中文文本估算合理（中文每个字符约 1-2 token，length/3 仍适用）', () => {
    // 4 中文字符 / 3 ≈ 1.33 → 2
    assert.equal(estimateTokens('你好世界'), 2);
    // 6 中文字符 / 3 = 2
    assert.equal(estimateTokens('你好世界你好'), 2);
    // 7 中文字符 / 3 ≈ 2.33 → 3
    assert.equal(estimateTokens('你好世界你好世'), 3);
  });
});

describe('estimateMessagesTokens', () => {
  beforeEach(() => {
    mockFetchCalls = [];
    mockFetchResult = undefined;
  });

  afterEach(() => {
    mockFetchCalls = [];
    mockFetchResult = undefined;
  });

  it('非数组返回 0', () => {
    assert.equal(estimateMessagesTokens(null), 0);
    assert.equal(estimateMessagesTokens(undefined), 0);
    assert.equal(estimateMessagesTokens('not an array'), 0);
  });

  it('空数组返回 0', () => {
    assert.equal(estimateMessagesTokens([]), 0);
  });

  it('单条消息：4 开销 + 内容 token', () => {
    // "Hello" = 5 chars → ceil(5/3) = 2, + 4 开销 = 6
    const result = estimateMessagesTokens([{ role: 'user', content: 'Hello' }]);
    assert.equal(result, 6);
  });

  it('多条消息估算累加', () => {
    const messages = [
      { role: 'system', content: 'Hi' },   // 4 + ceil(2/3)=1 = 5
      { role: 'user', content: 'Hello' },  // 4 + ceil(5/3)=2 = 6
      { role: 'assistant', content: 'OK' } // 4 + ceil(2/3)=1 = 5
    ];
    assert.equal(estimateMessagesTokens(messages), 16);
  });

  it('content 非字符串时按空字符串处理', () => {
    const result = estimateMessagesTokens([{ role: 'user', content: 123 }]);
    // content 非字符串 → '' → 0 tokens, + 4 开销 = 4
    assert.equal(result, 4);
  });
});

describe('AIClient constructor', () => {
  beforeEach(() => {
    mockFetchCalls = [];
    mockFetchResult = undefined;
  });

  afterEach(() => {
    mockFetchCalls = [];
    mockFetchResult = undefined;
  });

  it('默认值设置正确', () => {
    const client = new AIClient({});
    assert.equal(client.apiKey, '');
    assert.equal(client.baseUrl, 'https://api.anthropic.com');
    assert.equal(client.model, 'claude-sonnet-4-6');
    assert.equal(client.maxTokens, 4096);
    assert.equal(client.protocol, 'openai');
  });

  it('自定义选项覆盖默认值', () => {
    const client = new AIClient({
      apiKey: 'sk-test-123',
      baseUrl: 'https://custom.api.com/',
      model: 'gpt-4',
      maxTokens: 8192,
      protocol: 'claude'
    });
    assert.equal(client.apiKey, 'sk-test-123');
    assert.equal(client.baseUrl, 'https://custom.api.com'); // 尾部斜杠去除
    assert.equal(client.model, 'gpt-4');
    assert.equal(client.maxTokens, 8192);
    assert.equal(client.protocol, 'claude');
  });
});

describe('buildRequest — OpenAI 协议', () => {
  let client;

  beforeEach(() => {
    mockFetchCalls = [];
    mockFetchResult = undefined;
    client = new AIClient({
      apiKey: 'sk-openai-key',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
      protocol: 'openai'
    });
  });

  afterEach(() => {
    mockFetchCalls = [];
    mockFetchResult = undefined;
  });

  it('headers 包含 Authorization Bearer', () => {
    const { headers } = client.buildRequest([{ role: 'user', content: 'hi' }]);
    assert.equal(headers['Authorization'], 'Bearer sk-openai-key');
    assert.equal(headers['Content-Type'], 'application/json');
  });

  it('body.messages 格式：system 作为首条消息', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    const { body } = client.buildRequest(messages, { systemPrompt: 'You are helpful.' });
    // system 消息在 messages 头部
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[0].content, 'You are helpful.');
    assert.equal(body.messages[1].role, 'user');
    assert.equal(body.messages[1].content, 'hello');
    // body 没有独立的 system 字段
    assert.equal(body.system, undefined);
  });

  it('url 为 /v1/chat/completions', () => {
    const { url } = client.buildRequest([{ role: 'user', content: 'hi' }]);
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  });
});

describe('buildRequest — Claude 协议', () => {
  let client;

  beforeEach(() => {
    mockFetchCalls = [];
    mockFetchResult = undefined;
    client = new AIClient({
      apiKey: 'sk-ant-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-6',
      protocol: 'claude'
    });
  });

  afterEach(() => {
    mockFetchCalls = [];
    mockFetchResult = undefined;
  });

  it('headers 包含 x-api-key 和 anthropic-version', () => {
    const { headers } = client.buildRequest([{ role: 'user', content: 'hi' }]);
    assert.equal(headers['x-api-key'], 'sk-ant-test');
    assert.equal(headers['anthropic-version'], '2023-06-01');
    assert.equal(headers['content-type'], 'application/json');
  });

  it('body 格式差异：system 为独立参数', () => {
    const messages = [{ role: 'user', content: 'hello' }];
    const { body } = client.buildRequest(messages, { systemPrompt: 'Be concise.' });
    // system 是 body 的顶级字段，不在 messages 里
    assert.equal(body.system, 'Be concise.');
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, 'user');
    assert.equal(body.messages[0].content, 'hello');
  });

  it('url 为 /v1/messages', () => {
    const { url } = client.buildRequest([{ role: 'user', content: 'hi' }]);
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
  });
});
