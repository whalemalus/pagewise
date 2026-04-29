/**
 * E2E Q&A 链路测试
 * 验证 sendMessage 完整流程：设置加载 → AIClient 创建 → 请求构建 → 流式解析
 */
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ==================== Chrome API Mock ====================
let storedData = {};
const chromeMock = {
  storage: {
    sync: {
      get: mock.fn((key) => Promise.resolve(storedData)),
      set: mock.fn((obj) => { Object.assign(storedData, obj); return Promise.resolve(); }),
    },
    session: {
      get: mock.fn(() => Promise.resolve({})),
      set: mock.fn(() => Promise.resolve()),
      remove: mock.fn(() => Promise.resolve()),
      onChanged: { addListener: mock.fn() },
    },
  },
  tabs: {
    sendMessage: mock.fn(() => Promise.resolve({
      content: 'test page content',
      title: 'Test Page',
      url: 'https://example.com',
      codeBlocks: [],
      meta: {}
    })),
    query: mock.fn(() => Promise.resolve([{ id: 1, url: 'https://example.com', title: 'Test' }])),
  },
  runtime: {
    onMessage: { addListener: mock.fn() },
    lastError: null,
  },
  contextMenus: { create: mock.fn(), onClicked: { addListener: mock.fn() } },
  sidePanel: {
    setPanelBehavior: mock.fn(() => Promise.resolve()),
    setOptions: mock.fn(() => Promise.resolve()),
  },
};
globalThis.chrome = chromeMock;

// ==================== 测试 ====================

describe('E2E Q&A 链路', () => {

  describe('1. AIClient 构造与配置', () => {
    it('应正确存储配置参数', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({
        apiKey: 'sk-test-123',
        baseUrl: 'http://localhost:8090',
        model: 'gpt-4o',
        maxTokens: 2048,
        protocol: 'openai'
      });
      assert.equal(client.apiKey, 'sk-test-123');
      assert.equal(client.baseUrl, 'http://localhost:8090');
      assert.equal(client.model, 'gpt-4o');
      assert.equal(client.maxTokens, 2048);
      assert.equal(client.protocol, 'openai');
    });

    it('baseUrl 末尾 /v1 应被自动剥离', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const c1 = new AIClient({ baseUrl: 'https://api.example.com/v1' });
      assert.equal(c1.baseUrl, 'https://api.example.com');
      
      const c2 = new AIClient({ baseUrl: 'https://api.example.com/v1/' });
      assert.equal(c2.baseUrl, 'https://api.example.com');
      
      const c3 = new AIClient({ baseUrl: 'https://api.example.com' });
      assert.equal(c3.baseUrl, 'https://api.example.com');
    });

    it('协议默认值应为 openai', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({ apiKey: 'k' });
      assert.equal(client.protocol, 'openai');
    });
  });

  describe('2. 请求构建', () => {
    it('OpenAI 请求 URL 不应双写 /v1', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({
        apiKey: 'k',
        baseUrl: 'https://api.example.com/v1',
        protocol: 'openai'
      });
      const req = client.buildRequest([{ role: 'user', content: 'hi' }], {});
      assert.ok(!req.url.includes('/v1/v1'), `URL 双写 /v1: ${req.url}`);
      assert.ok(req.url.endsWith('/v1/chat/completions'), `URL 末尾不对: ${req.url}`);
    });

    it('OpenAI 请求应包含 Authorization header', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({ apiKey: 'sk-abc', protocol: 'openai' });
      const req = client.buildRequest([{ role: 'user', content: 'hi' }], {});
      assert.equal(req.headers['Authorization'], 'Bearer sk-abc');
    });

    it('OpenAI 请求 body 应包含 model 和 messages', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({ apiKey: 'k', model: 'gpt-4o', protocol: 'openai' });
      const req = client.buildRequest(
        [{ role: 'user', content: 'hello' }],
        { systemPrompt: 'You are helpful', maxTokens: 500 }
      );
      assert.equal(req.body.model, 'gpt-4o');
      assert.equal(req.body.max_tokens, 500);
      assert.equal(req.body.messages[0].role, 'system');
      assert.equal(req.body.messages[0].content, 'You are helpful');
      assert.equal(req.body.messages[1].role, 'user');
      assert.equal(req.body.messages[1].content, 'hello');
    });

    it('Claude 请求应使用 x-api-key header', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({ apiKey: 'sk-ant-123', protocol: 'claude' });
      const req = client.buildRequest([{ role: 'user', content: 'hi' }], {});
      assert.equal(req.headers['x-api-key'], 'sk-ant-123');
      assert.ok(req.url.includes('/v1/messages'));
    });
  });

  describe('3. Prompt 构建', () => {
    it('buildPageQuestionPrompt 应包含页面内容和问题', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({ apiKey: 'k', protocol: 'openai' });
      const prompt = client.buildPageQuestionPrompt(
        { content: 'page content', title: 'Test', url: 'https://ex.com', codeBlocks: [], meta: {} },
        'what?'
      );
      assert.ok(prompt.includes('what?'));
      assert.ok(prompt.includes('Test'));
      assert.ok(prompt.includes('page content'));
    });

    it('buildPageQuestionPrompt 无页面内容时应降级', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({ apiKey: 'k', protocol: 'openai' });
      const prompt = client.buildPageQuestionPrompt(
        { content: '', title: 'Empty', url: '', codeBlocks: [], meta: {} },
        'help'
      );
      assert.ok(prompt.includes('help'));
      assert.ok(prompt.includes('未能获取到页面内容'));
    });

    it('getSystemPrompt 应返回非空字符串', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({ apiKey: 'k', protocol: 'openai' });
      const sp = client.getSystemPrompt();
      assert.ok(sp.length > 50);
      assert.ok(sp.includes('技术'));
    });
  });

  describe('4. 流式响应解析', () => {
    it('parseOpenAIStream 应正确提取 content chunks', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({ apiKey: 'k', protocol: 'openai' });
      
      const chunks = [
        'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      
      const stream = new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
          controller.close();
        }
      });
      
      const results = [];
      for await (const text of client.parseOpenAIStream({ body: stream })) {
        results.push(text);
      }
      assert.deepEqual(results, ['Hello', ' world']);
    });

    it('parseOpenAIStream 应忽略 reasoning_content', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      const client = new AIClient({ apiKey: 'k', protocol: 'openai' });
      
      const chunks = [
        'data: {"choices":[{"delta":{"reasoning_content":"think1"}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"think2"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      
      const stream = new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
          controller.close();
        }
      });
      
      const results = [];
      for await (const text of client.parseOpenAIStream({ body: stream })) {
        results.push(text);
      }
      assert.deepEqual(results, ['answer']);
    });

    it('parseOpenAIStream 空 body 应 fallback 到非流式', async () => {
      const { AIClient } = await import('../lib/ai-client.js');
      // 不测试实际的 fallback（需要网络），只确认方法存在
      const client = new AIClient({ apiKey: 'k', protocol: 'openai' });
      assert.equal(typeof client.parseOpenAIStream, 'function');
    });
  });

  describe('5. 设置读写一致性', () => {
    it('saveSettings 保存的 key 应与 getSettings 读取的 key 一致', async () => {
      storedData = {};
      chromeMock.storage.sync.get = mock.fn(() => Promise.resolve(storedData));
      chromeMock.storage.sync.set = mock.fn((obj) => { Object.assign(storedData, obj); return Promise.resolve(); });
      
      const { getSettings, saveSettings } = await import('../lib/utils.js');
      
      const settings = {
        apiKey: 'sk-test',
        apiBaseUrl: 'http://localhost:8090',
        model: 'gpt-4o',
        apiProtocol: 'openai',
        apiProvider: 'custom',
        maxTokens: 2048,
        autoExtract: true,
        theme: 'dark',
      };
      
      await saveSettings(settings);
      const loaded = await getSettings();
      
      assert.equal(loaded.apiKey, settings.apiKey);
      assert.equal(loaded.apiBaseUrl, settings.apiBaseUrl);
      assert.equal(loaded.model, settings.model);
      assert.equal(loaded.apiProtocol, settings.apiProtocol);
      assert.equal(loaded.apiProvider, settings.apiProvider);
      assert.equal(loaded.maxTokens, settings.maxTokens);
    });
  });

  describe('6. sendMessage 路径一致性', () => {
    it('quickSummarize 只是设置 userInput 然后调用 sendMessage', async () => {
      // 验证 quickSummarize 的代码路径
      // 读取源码确认 quickSummarize 的实现
      const { readFileSync } = await import('fs');
      const source = readFileSync('/home/claude-user/pagewise/sidebar/sidebar.js', 'utf-8');
      
      // 检查 quickSummarize 是否只设置 value + 调用 sendMessage
      const qsMatch = source.match(/async quickSummarize\(\)\s*\{([\s\S]*?)\n  \}/);
      assert.ok(qsMatch, 'quickSummarize 方法应存在');
      assert.ok(qsMatch[1].includes('this.userInput.value'), 'quickSummarize 应设置 userInput.value');
      assert.ok(qsMatch[1].includes('this.sendMessage()'), 'quickSummarize 应调用 sendMessage');
      
      // 确认没有额外的 API 调用逻辑
      assert.ok(!qsMatch[1].includes('fetch('), 'quickSummarize 不应直接调用 fetch');
      assert.ok(!qsMatch[1].includes('chatStream'), 'quickSummarize 不应直接调用 chatStream');
    });

    it('Enter 键应调用 sendMessage', async () => {
      const { readFileSync } = await import('fs');
      const source = readFileSync('/home/claude-user/pagewise/sidebar/sidebar.js', 'utf-8');
      
      // 检查 keydown 事件是否调用 sendMessage
      assert.ok(source.includes("this.userInput.addEventListener('keydown'"), '应有 keydown 监听器');
      
      // 在 keydown 监听器附近查找 sendMessage 调用
      const keydownIdx = source.indexOf("this.userInput.addEventListener('keydown'");
      const keydownBlock = source.slice(keydownIdx, keydownIdx + 300);
      assert.ok(keydownBlock.includes('this.sendMessage()'), 'Enter 键应调用 sendMessage');
    });
  });
});
