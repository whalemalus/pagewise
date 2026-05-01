/**
 * E2E 测试 lib/ai-client.js — AIClient 类全方法覆盖
 *
 * 测试范围：
 *   构造函数, chat, chatStream, buildRequest, parseResponse,
 *   listModels, testConnection, askAboutPage, generateSummaryAndTags,
 *   buildPageQuestionPrompt, getSystemPrompt, estimateTokens, estimateMessagesTokens
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

// ---------- 全局 mock 安装 ----------
installChromeMock();
installIndexedDBMock();

const { AIClient, estimateTokens, estimateMessagesTokens } = await import('../lib/ai-client.js');

// ---------- fetch mock 工具 ----------
let fetchStub = null;

function mockFetch(handler) {
  fetchStub = handler;
  globalThis.fetch = async (...args) => fetchStub(...args);
}

function restoreFetch() {
  fetchStub = null;
  delete globalThis.fetch;
}

// 辅助：构造 OpenAI 风格的成功响应
function openaiResponse(content = 'OK', model = 'gpt-4o') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      model
    })
  };
}

// 辅助：构造 Claude 风格的成功响应
function claudeResponse(content = 'OK', model = 'claude-sonnet-4-6') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: content }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model
    })
  };
}

// 辅助：构造错误响应
function errorResponse(status, message) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } })
  };
}

// 辅助：构建可读流模拟 SSE
function createSSEResponse(lines) {
  const encoder = new TextEncoder();
  const chunks = lines.map(l => encoder.encode(l + '\n'));
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (i < chunks.length) {
              return { value: chunks[i++], done: false };
            }
            return { value: undefined, done: true };
          }
        };
      }
    }
  };
}

// ---------- 每测试前后 ----------
afterEach(() => {
  restoreFetch();
  resetChromeMock();
  resetIndexedDBMock();
});

// ================================================================
//  1. 构造函数
// ================================================================

describe('AIClient 构造函数 — E2E', () => {
  it('无参数时所有属性取默认值', () => {
    const client = new AIClient();
    assert.equal(client.apiKey, '');
    assert.equal(client.baseUrl, 'https://api.anthropic.com');
    assert.equal(client.model, 'claude-sonnet-4-6');
    assert.equal(client.maxTokens, 4096);
    assert.equal(client.protocol, 'openai');
  });

  it('自定义选项全部正确赋值', () => {
    const client = new AIClient({
      apiKey: 'sk-test-123',
      baseUrl: 'https://my-proxy.com',
      model: 'gpt-4o',
      maxTokens: 8192,
      protocol: 'claude'
    });
    assert.equal(client.apiKey, 'sk-test-123');
    assert.equal(client.baseUrl, 'https://my-proxy.com');
    assert.equal(client.model, 'gpt-4o');
    assert.equal(client.maxTokens, 8192);
    assert.equal(client.protocol, 'claude');
  });

  it('baseUrl 末尾斜杠和 /v1 自动清理', () => {
    const c1 = new AIClient({ baseUrl: 'https://a.com/' });
    assert.equal(c1.baseUrl, 'https://a.com');

    const c2 = new AIClient({ baseUrl: 'https://b.com/v1' });
    assert.equal(c2.baseUrl, 'https://b.com');

    const c3 = new AIClient({ baseUrl: 'https://c.com/v1/' });
    assert.equal(c3.baseUrl, 'https://c.com');
  });
});

// ================================================================
//  2. 协议判断 isClaude / isOpenAI
// ================================================================

describe('AIClient 协议判断 — E2E', () => {
  it('默认为 openai', () => {
    const client = new AIClient();
    assert.equal(client.isOpenAI(), true);
    assert.equal(client.isClaude(), false);
  });

  it('protocol=claude 时返回正确', () => {
    const client = new AIClient({ protocol: 'claude' });
    assert.equal(client.isClaude(), true);
    assert.equal(client.isOpenAI(), false);
  });
});

// ================================================================
//  3. buildRequest — OpenAI 协议
// ================================================================

describe('AIClient.buildRequest — OpenAI 协议', () => {
  it('生成正确的 URL、headers 和 body', () => {
    const client = new AIClient({
      apiKey: 'sk-abc',
      protocol: 'openai',
      model: 'gpt-4o',
      maxTokens: 2048
    });
    const messages = [{ role: 'user', content: '你好' }];
    const { url, headers, body } = client.buildRequest(messages, {
      systemPrompt: '你是助手',
      stream: false
    });

    assert.equal(url, 'https://api.anthropic.com/v1/chat/completions');
    assert.equal(headers.Authorization, 'Bearer sk-abc');
    assert.equal(body.model, 'gpt-4o');
    assert.equal(body.max_tokens, 2048);
    assert.equal(body.stream, false);
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[0].content, '你是助手');
    assert.equal(body.messages[1].role, 'user');
    assert.equal(body.messages[1].content, '你好');
  });
});

// ================================================================
//  4. buildRequest — Claude 协议
// ================================================================

describe('AIClient.buildRequest — Claude 协议', () => {
  it('生成正确的 URL、headers 和 body', () => {
    const client = new AIClient({
      apiKey: 'claude-key',
      protocol: 'claude',
      model: 'claude-sonnet-4-6'
    });
    const messages = [{ role: 'user', content: 'hello' }];
    const { url, headers, body } = client.buildRequest(messages, {
      systemPrompt: 'test sys',
      stream: true
    });

    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(headers['x-api-key'], 'claude-key');
    assert.equal(headers['anthropic-version'], '2023-06-01');
    assert.equal(body.model, 'claude-sonnet-4-6');
    assert.equal(body.stream, true);
    assert.equal(body.system, 'test sys');
    assert.equal(body.messages[0].content, 'hello');
  });
});

// ================================================================
//  5. parseResponse — 双协议
// ================================================================

describe('AIClient.parseResponse — E2E', () => {
  it('OpenAI 响应正确解析', () => {
    const client = new AIClient({ protocol: 'openai' });
    const result = client.parseResponse({
      choices: [{ message: { content: '回答内容' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: 'gpt-4o'
    });
    assert.equal(result.content, '回答内容');
    assert.equal(result.model, 'gpt-4o');
    assert.deepEqual(result.usage, { prompt_tokens: 10, completion_tokens: 5 });
  });

  it('Claude 响应正确解析', () => {
    const client = new AIClient({ protocol: 'claude' });
    const result = client.parseResponse({
      content: [{ type: 'text', text: 'Claude 回答' }],
      usage: { input_tokens: 20, output_tokens: 10 },
      model: 'claude-sonnet-4-6'
    });
    assert.equal(result.content, 'Claude 回答');
    assert.equal(result.model, 'claude-sonnet-4-6');
    assert.deepEqual(result.usage, { input_tokens: 20, output_tokens: 10 });
  });
});

// ================================================================
//  6. chat — 成功调用
// ================================================================

describe('AIClient.chat — E2E 成功调用', () => {
  it('OpenAI 协议发送请求并返回解析结果', async () => {
    mockFetch(() => Promise.resolve(openaiResponse('你好呀！')));
    const client = new AIClient({ apiKey: 'sk-test', protocol: 'openai' });
    const result = await client.chat([{ role: 'user', content: '你好' }]);
    assert.equal(result.content, '你好呀！');
    assert.equal(result.model, 'gpt-4o');
  });

  it('Claude 协议发送请求并返回解析结果', async () => {
    mockFetch(() => Promise.resolve(claudeResponse('Hi!')));
    const client = new AIClient({ apiKey: 'ck', protocol: 'claude' });
    const result = await client.chat([{ role: 'user', content: 'Hi' }]);
    assert.equal(result.content, 'Hi!');
  });
});

// ================================================================
//  7. chat — 错误处理
// ================================================================

describe('AIClient.chat — E2E 错误处理', () => {
  it('API 返回 401 时抛出分类错误', async () => {
    mockFetch(() => Promise.resolve(errorResponse(401, 'Unauthorized')));
    const client = new AIClient({ apiKey: 'bad', protocol: 'openai' });
    await assert.rejects(
      () => client.chat([{ role: 'user', content: 'hi' }]),
      (err) => {
        assert.ok(err.message.includes('401'));
        assert.ok(err.classified, '应包含 classified 字段');
        return true;
      }
    );
  });

  it('网络错误时抛出分类错误', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
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

// ================================================================
//  8. chatStream — OpenAI 流式
// ================================================================

describe('AIClient.chatStream — OpenAI 流式', () => {
  it('正确解析 SSE 数据块', async () => {
    const lines = [
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      'data: [DONE]'
    ];
    mockFetch(() => Promise.resolve(createSSEResponse(lines)));

    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    const chunks = [];
    for await (const chunk of client.chatStream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, ['你', '好']);
  });
});

// ================================================================
//  9. chatStream — Claude 流式
// ================================================================

describe('AIClient.chatStream — Claude 流式', () => {
  it('正确解析 content_block_delta 事件', async () => {
    const lines = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" World"}}',
      'data: [DONE]'
    ];
    mockFetch(() => Promise.resolve(createSSEResponse(lines)));

    const client = new AIClient({ apiKey: 'ck', protocol: 'claude' });
    const chunks = [];
    for await (const chunk of client.chatStream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, ['Hello', ' World']);
  });
});

// ================================================================
//  10. chatStream — 无 body 时降级为非流式
// ================================================================

describe('AIClient.chatStream — 降级非流式', () => {
  it('response.body 为 null 时降级到 chat()', async () => {
    // 第一次 fetch 返回 body=null 的响应（给 chatStream），第二次返回正常（给 chat fallback）
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, status: 200, body: null });
      }
      return Promise.resolve(openaiResponse('fallback content'));
    });

    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    const chunks = [];
    for await (const chunk of client.chatStream([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, ['fallback content']);
  });
});

// ================================================================
//  11. listModels — 双协议
// ================================================================

describe('AIClient.listModels — E2E', () => {
  it('Claude 协议返回 3 个预设模型', async () => {
    const client = new AIClient({ protocol: 'claude' });
    const models = await client.listModels();
    assert.equal(models.length, 3);
    assert.ok(models.includes('claude-sonnet-4-6'));
    assert.ok(models.includes('claude-opus-4-6'));
    assert.ok(models.includes('claude-haiku-4-5'));
  });

  it('OpenAI 协议调用 /v1/models 并返回排序列表', async () => {
    mockFetch(() => Promise.resolve({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o' },
          { id: 'gpt-3.5-turbo' },
          { id: 'gpt-4o-mini' }
        ]
      })
    }));

    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    const models = await client.listModels();
    assert.deepEqual(models, ['gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini']);
  });

  it('OpenAI 协议 listModels 失败时抛出错误', async () => {
    mockFetch(() => Promise.resolve(errorResponse(500, 'Server Error')));
    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    await assert.rejects(() => client.listModels(), /500/);
  });
});

// ================================================================
//  12. testConnection — E2E
// ================================================================

describe('AIClient.testConnection — E2E', () => {
  it('成功时返回 success=true 和协议名', async () => {
    mockFetch(() => Promise.resolve(openaiResponse('OK', 'gpt-4o')));
    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    const result = await client.testConnection();
    assert.equal(result.success, true);
    assert.equal(result.protocol, 'OpenAI');
    assert.equal(result.model, 'gpt-4o');
    assert.equal(result.content, 'OK');
  });

  it('失败时返回 success=false 和错误消息', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    const result = await client.testConnection();
    assert.equal(result.success, false);
    assert.ok(result.error.includes('网络错误'));
    assert.equal(result.protocol, 'OpenAI');
  });

  it('Claude 协议返回 protocol=Claude', async () => {
    mockFetch(() => Promise.resolve(claudeResponse('OK')));
    const client = new AIClient({ apiKey: 'ck', protocol: 'claude' });
    const result = await client.testConnection();
    assert.equal(result.success, true);
    assert.equal(result.protocol, 'Claude');
  });
});

// ================================================================
//  13. getSystemPrompt
// ================================================================

describe('AIClient.getSystemPrompt — E2E', () => {
  it('返回非空字符串，包含关键职责描述', () => {
    const client = new AIClient();
    const prompt = client.getSystemPrompt();
    assert.ok(typeof prompt === 'string' && prompt.length > 50);
    assert.ok(prompt.includes('技术知识助手'));
    assert.ok(prompt.includes('代码'));
  });
});

// ================================================================
//  14. buildPageQuestionPrompt
// ================================================================

describe('AIClient.buildPageQuestionPrompt — E2E', () => {
  it('包含完整页面信息的 prompt', () => {
    const client = new AIClient();
    const pageContent = {
      content: 'This is the page body',
      title: 'Test Page',
      url: 'https://example.com',
      selection: 'selected text',
      codeBlocks: [{ lang: 'js', code: 'console.log("hi")' }],
      meta: { siteName: 'Example' }
    };
    const prompt = client.buildPageQuestionPrompt(pageContent, '什么是闭包？');
    assert.ok(prompt.includes('selected text'));
    assert.ok(prompt.includes('Test Page'));
    assert.ok(prompt.includes('https://example.com'));
    assert.ok(prompt.includes('Example'));
    assert.ok(prompt.includes('console.log'));
    assert.ok(prompt.includes('什么是闭包'));
  });

  it('无页面内容时使用提示文本', () => {
    const client = new AIClient();
    const prompt = client.buildPageQuestionPrompt(null, '你好');
    assert.ok(prompt.includes('未能获取到页面内容'));
    assert.ok(prompt.includes('你好'));
  });

  it('无 selection 时不包含选中文本段', () => {
    const client = new AIClient();
    const pageContent = { content: 'body', title: 'T', url: 'https://x.com' };
    const prompt = client.buildPageQuestionPrompt(pageContent, 'q');
    assert.ok(!prompt.includes('选中'));
  });

  it('content 超过 8000 字符时截断', () => {
    const client = new AIClient();
    const longContent = 'A'.repeat(10000);
    const prompt = client.buildPageQuestionPrompt({ content: longContent, title: 'T', url: '' }, 'q');
    // 8000 chars of 'A' + other text
    const contentSection = prompt.split('页面内容：\n')[1] || '';
    assert.ok(contentSection.length <= 8100, '内容应被截断到约 8000 字符');
  });
});

// ================================================================
//  15. askAboutPage
// ================================================================

describe('AIClient.askAboutPage — E2E', () => {
  it('将页面内容和问题组装为消息并调用 chat', async () => {
    mockFetch(() => Promise.resolve(openaiResponse('页面的回答')));
    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    const page = { content: 'page body', title: 'T', url: 'https://x.com' };
    const result = await client.askAboutPage(page, '总结一下');
    assert.equal(result.content, '页面的回答');
  });

  it('带对话历史时历史消息被包含', async () => {
    let capturedBody = null;
    mockFetch(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return openaiResponse('reply');
    });

    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    const history = [
      { role: 'user', content: '之前的问题' },
      { role: 'assistant', content: '之前的回答' }
    ];
    await client.askAboutPage({ content: 'body', title: 'T', url: '' }, '新问题', history);
    assert.equal(capturedBody.messages.length, 4); // system + 2 history + new question
    assert.equal(capturedBody.messages[1].content, '之前的问题');
  });
});

// ================================================================
//  16. generateSummaryAndTags
// ================================================================

describe('AIClient.generateSummaryAndTags — E2E', () => {
  it('解析有效 JSON 响应', async () => {
    const jsonResp = JSON.stringify({ summary: '一段摘要', tags: ['JS', '前端'] });
    mockFetch(() => Promise.resolve(openaiResponse(jsonResp)));

    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    const result = await client.generateSummaryAndTags('一些内容');
    assert.equal(result.summary, '一段摘要');
    assert.deepEqual(result.tags, ['JS', '前端']);
  });

  it('响应不是有效 JSON 时回退到默认值', async () => {
    mockFetch(() => Promise.resolve(openaiResponse('这不是 JSON')));

    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    const result = await client.generateSummaryAndTags('原始内容 ABCDE');
    assert.equal(result.summary, '原始内容 ABCDE');
    assert.deepEqual(result.tags, ['未分类']);
  });

  it('JSON 嵌在 markdown 代码块中时也能提取', async () => {
    const wrapped = '```json\n' + JSON.stringify({ summary: '摘要', tags: ['tag1'] }) + '\n```';
    mockFetch(() => Promise.resolve(openaiResponse(wrapped)));

    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    const result = await client.generateSummaryAndTags('content');
    assert.equal(result.summary, '摘要');
    assert.deepEqual(result.tags, ['tag1']);
  });
});

// ================================================================
//  17. estimateTokens（独立导出函数）
// ================================================================

describe('estimateTokens — E2E', () => {
  it('正常文本按 length/3 向上取整', () => {
    assert.equal(estimateTokens('abc'), 1);           // 3/3 = 1
    assert.equal(estimateTokens('abcd'), 2);          // 4/3 -> 1.33 -> 2
    assert.equal(estimateTokens('a'.repeat(12)), 4);  // 12/3 = 4
  });

  it('空字符串返回 0', () => {
    assert.equal(estimateTokens(''), 0);
  });

  it('null / undefined / 非字符串返回 0', () => {
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
    assert.equal(estimateTokens(42), 0);
  });
});

// ================================================================
//  18. estimateMessagesTokens（独立导出函数）
// ================================================================

describe('estimateMessagesTokens — E2E', () => {
  it('每条消息有 4 token 开销 + 内容 token', () => {
    const messages = [
      { role: 'user', content: 'abc' },     // 4 + ceil(3/3) = 5
      { role: 'assistant', content: 'abcd' } // 4 + ceil(4/3) = 6
    ];
    assert.equal(estimateMessagesTokens(messages), 11);
  });

  it('空数组返回 0', () => {
    assert.equal(estimateMessagesTokens([]), 0);
  });

  it('非数组返回 0', () => {
    assert.equal(estimateMessagesTokens(null), 0);
    assert.equal(estimateMessagesTokens('not array'), 0);
  });

  it('content 为非字符串时视为 0 token', () => {
    const messages = [{ role: 'user', content: null }];
    assert.equal(estimateMessagesTokens(messages), 4);
  });
});

// ================================================================
//  19. chatStream — 网络错误
// ================================================================

describe('AIClient.chatStream — 网络错误', () => {
  it('网络层错误被正确分类并抛出', async () => {
    mockFetch(() => Promise.reject(new TypeError('Network error')));
    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    await assert.rejects(
      async () => {
        for await (const _ of client.chatStream([{ role: 'user', content: 'hi' }])) { /* consume */ }
      },
      (err) => {
        assert.ok(err.message.includes('网络错误'));
        assert.ok(err.classified);
        return true;
      }
    );
  });
});

// ================================================================
//  20. chatStream — API 错误
// ================================================================

describe('AIClient.chatStream — API 错误', () => {
  it('API 返回非 200 状态时抛出分类错误', async () => {
    mockFetch(() => Promise.resolve(errorResponse(429, 'Rate limit')));
    const client = new AIClient({ apiKey: 'sk', protocol: 'openai' });
    await assert.rejects(
      async () => {
        for await (const _ of client.chatStream([{ role: 'user', content: 'hi' }])) { /* consume */ }
      },
      (err) => {
        assert.ok(err.message.includes('429'));
        assert.ok(err.classified);
        return true;
      }
    );
  });
});
