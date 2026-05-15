/**
 * QA002 功能正确性测试 — AI 客户端模块
 *
 * 测试范围：API 调用、错误处理、超时、重试、流式响应、testConnection
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ==================== Mock Fetch（全局拦截） ====================

const _originalFetch = globalThis.fetch;
let mockFetchResult;
let mockFetchCalls = [];

function restoreFetchMock() {
  mockFetchCalls = [];
  mockFetchResult = undefined;
  globalThis.fetch = async (url, opts) => {
    mockFetchCalls.push({ url, opts });
    if (mockFetchResult instanceof Error) throw mockFetchResult;
    return mockFetchResult;
  };
}

// 初始安装 mock
restoreFetchMock();

// Mock ReadableStream
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

// ==================== Import 模块 ====================

const { AIClient } = await import('../lib/ai-client.js');

// ==================== Tests ====================

describe('QA002-ai-client: 构造与协议', () => {
  it('默认构造参数正确', () => {
    const client = new AIClient();
    assert.equal(client.apiKey, '');
    assert.equal(client.baseUrl, 'https://api.anthropic.com');
    assert.equal(client.model, 'claude-sonnet-4-6');
    assert.equal(client.maxTokens, 4096);
    assert.equal(client.protocol, 'openai');
  });

  it('isClaude / isOpenAI 根据 protocol 判断', () => {
    const claude = new AIClient({ protocol: 'claude' });
    assert.equal(claude.isClaude(), true);
    assert.equal(claude.isOpenAI(), false);

    const openai = new AIClient({ protocol: 'openai' });
    assert.equal(openai.isClaude(), false);
    assert.equal(openai.isOpenAI(), true);
  });
});

describe('QA002-ai-client: chat() 非流式调用', () => {
  it('OpenAI 协议调用成功并解析响应', async () => {
    restoreFetchMock();
    mockFetchResult = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '你好' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: 'gpt-4o'
      })
    };

    const client = new AIClient({ apiKey: 'sk-test', protocol: 'openai' });
    const result = await client.chat([{ role: 'user', content: '你好' }]);

    assert.equal(result.content, '你好');
    assert.equal(result.model, 'gpt-4o');
    assert.equal(result.usage.prompt_tokens, 10);
    assert.equal(mockFetchCalls.length, 1);
    assert.equal(mockFetchCalls[0].url, 'https://api.anthropic.com/v1/chat/completions');
  });

  it('Claude 协议调用成功并解析响应', async () => {
    restoreFetchMock();
    mockFetchResult = {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ text: 'OK' }],
        usage: { input_tokens: 5, output_tokens: 2 },
        model: 'claude-sonnet-4-6'
      })
    };

    const client = new AIClient({ apiKey: 'sk-ant', protocol: 'claude' });
    const result = await client.chat([{ role: 'user', content: 'test' }]);

    assert.equal(result.content, 'OK');
    assert.equal(result.model, 'claude-sonnet-4-6');
    assert.equal(mockFetchCalls[0].url, 'https://api.anthropic.com/v1/messages');
  });

  it('API 返回 401 时抛出认证错误', async () => {
    restoreFetchMock();
    mockFetchResult = {
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } })
    };

    const client = new AIClient({ apiKey: 'bad-key', protocol: 'openai' });
    await assert.rejects(
      () => client.chat([{ role: 'user', content: 'hi' }]),
      (err) => {
        assert.ok(err.message.includes('401'));
        assert.ok(err.classified);
        return true;
      }
    );
  });

  it('API 返回 429 时错误分类为速率限制', async () => {
    restoreFetchMock();
    mockFetchResult = {
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit exceeded' } })
    };

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    await assert.rejects(
      () => client.chat([{ role: 'user', content: 'hi' }]),
      (err) => {
        assert.equal(err.classified.type, 'rate_limit');
        assert.equal(err.classified.retryable, true);
        return true;
      }
    );
  });

  it('网络错误（fetch 抛异常）时抛出带 classified 的错误', async () => {
    restoreFetchMock();
    mockFetchResult = new Error('ECONNREFUSED');

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    await assert.rejects(
      () => client.chat([{ role: 'user', content: 'hi' }]),
      (err) => {
        assert.ok(err.message.includes('网络错误'));
        assert.ok(err.classified);
        return true;
      }
    );
  });
});

describe('QA002-ai-client: chatStream() 流式调用', () => {
  it('OpenAI 流式调用逐块 yield', async () => {
    restoreFetchMock();
    const sseData = [
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: [DONE]\n\n'
    ];

    mockFetchResult = {
      ok: true,
      status: 200,
      json: async () => ({}),
      body: new MockReadableStream(sseData)
    };

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const chunks = [];
    for await (const chunk of client.chatStream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    assert.equal(chunks.join(''), '你好');
    assert.equal(chunks.length, 2);
  });

  it('Claude 流式调用解析 content_block_delta', async () => {
    restoreFetchMock();
    const sseData = [
      'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"text":" World"}}\n\n',
      'data: {"type":"content_block_stop"}\n\n'
    ];

    mockFetchResult = {
      ok: true,
      status: 200,
      json: async () => ({}),
      body: new MockReadableStream(sseData)
    };

    const client = new AIClient({ apiKey: 'test', protocol: 'claude' });
    const chunks = [];
    for await (const chunk of client.chatStream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    assert.equal(chunks.join(''), 'Hello World');
  });

  it('流式 API 返回错误状态码时抛出', async () => {
    restoreFetchMock();
    mockFetchResult = {
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal error' } }),
      body: null
    };

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    await assert.rejects(
      async () => {
        for await (const _ of client.chatStream([{ role: 'user', content: 'hi' }])) { /* consume */ }
      },
      (err) => {
        assert.ok(err.message.includes('500'));
        return true;
      }
    );
  });

  it('response.body 为 null 时降级为非流式', async () => {
    let callCount = 0;
    globalThis.fetch = async (url, opts) => {
      callCount++;
      const body = JSON.parse(opts.body);
      if (body.stream) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          body: null
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'fallback result' } }],
          usage: {},
          model: 'gpt-4o'
        }),
        body: null
      };
    };

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const chunks = [];
    for await (const chunk of client.chatStream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    assert.equal(chunks.join(''), 'fallback result');
    assert.equal(callCount, 2, '应发 2 次请求（降级）');

    // 恢复 mock
    restoreFetchMock();
  });
});

describe('QA002-ai-client: 超时与信号', () => {
  it('AbortSignal 传递到 fetch', async () => {
    restoreFetchMock();
    mockFetchResult = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: {},
        model: 'gpt-4o'
      })
    };

    const controller = new AbortController();
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    await client.chat([{ role: 'user', content: 'hi' }], { signal: controller.signal });

    assert.ok(mockFetchCalls.length > 0, 'fetch 应被调用');
    assert.ok(mockFetchCalls[0].opts.signal, '应传递 signal');
    assert.equal(mockFetchCalls[0].opts.signal, controller.signal);
  });

  it('AbortError 分类为 timeout', async () => {
    restoreFetchMock();
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetchResult = abortError;

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    await assert.rejects(
      () => client.chat([{ role: 'user', content: 'hi' }]),
      (err) => {
        assert.equal(err.classified.type, 'timeout');
        return true;
      }
    );
  });
});

describe('QA002-ai-client: testConnection()', () => {
  it('连接成功返回 success:true', async () => {
    restoreFetchMock();
    mockFetchResult = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'OK' } }],
        usage: {},
        model: 'gpt-4o'
      })
    };

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const result = await client.testConnection();

    assert.equal(result.success, true);
    assert.equal(result.model, 'gpt-4o');
    assert.equal(result.protocol, 'OpenAI');
  });

  it('连接失败返回 success:false', async () => {
    restoreFetchMock();
    mockFetchResult = new Error('Connection refused');

    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const result = await client.testConnection();

    assert.equal(result.success, false);
    assert.ok(result.error);
    assert.equal(result.protocol, 'OpenAI');
  });
});

describe('QA002-ai-client: buildRequest 格式', () => {
  it('OpenAI 请求 headers 正确', () => {
    restoreFetchMock();
    const client = new AIClient({ apiKey: 'sk-abc', protocol: 'openai' });
    const { headers, url } = client.buildRequest(
      [{ role: 'user', content: 'hi' }],
      { systemPrompt: 'test sys' }
    );
    assert.equal(headers['Authorization'], 'Bearer sk-abc');
    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(url, 'https://api.anthropic.com/v1/chat/completions');
  });

  it('Claude 请求 headers 正确', () => {
    restoreFetchMock();
    const client = new AIClient({ apiKey: 'sk-ant-xyz', protocol: 'claude' });
    const { headers, url } = client.buildRequest(
      [{ role: 'user', content: 'hi' }],
      { systemPrompt: 'test' }
    );
    assert.equal(headers['x-api-key'], 'sk-ant-xyz');
    assert.equal(headers['anthropic-version'], '2023-06-01');
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
  });
});
