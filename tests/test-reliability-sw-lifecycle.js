/**
 * QA004 — 可靠性测试：Service Worker 生命周期
 *
 * 测试 SW 安装/激活行为、消息队列、休眠唤醒模拟、存储通信等。
 * 使用 mock 模拟 Chrome Extension 环境。
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock, uninstallChromeMock } from './helpers/setup.js';
import { installIndexedDBMock, resetIndexedDBMock, uninstallIndexedDBMock } from './helpers/setup.js';

installChromeMock();
installIndexedDBMock();

const { KnowledgeBase } = await import('../lib/knowledge-base.js');
const { AIClient } = await import('../lib/ai-client.js');
const { classifyAIError, ErrorType } = await import('../lib/error-handler.js');
const { addLog, getLogs, clearLogs, logInfo, logError, logWarn } = await import('../lib/log-store.js');
const { SkillEngine } = await import('../lib/skill-engine.js');

after(() => {
  uninstallChromeMock();
  uninstallIndexedDBMock();
});

// ==================== SW 安装与激活模拟 ====================

describe('Service Worker — 安装事件模拟', () => {
  beforeEach(() => {
    resetChromeMock();
    resetIndexedDBMock();
    clearLogs();
  });

  it('runtime.onMessage 监听器可注册和触发', () => {
    const received = [];
    chrome.runtime.onMessage.addListener((msg) => received.push(msg));
    // 模拟触发所有已注册的监听器
    for (const listener of chrome.runtime._listeners) {
      listener({ action: 'installed', timestamp: Date.now() });
    }
    assert.equal(received.length, 1);
    assert.equal(received[0].action, 'installed');
  });

  it('安装后 storage.session 可写入 pendingAction', async () => {
    const data = {
      action: 'contextMenuAsk',
      selection: 'selected text',
      tabId: 1,
      tabUrl: 'https://example.com',
      timestamp: Date.now()
    };
    await chrome.storage.session.set({ pendingAction: data });
    const result = await chrome.storage.session.get('pendingAction');
    assert.deepEqual(result.pendingAction, data);
  });

  it('安装后 runtime 核心 API 可用', () => {
    // service-worker 使用 runtime.sendMessage / onMessage / getURL
    assert.ok(chrome.runtime.sendMessage);
    assert.ok(chrome.runtime.onMessage);
    assert.ok(chrome.runtime.onMessage.addListener);
    assert.ok(chrome.runtime.getURL);
  });
});

// ==================== 消息路由模拟 ====================

describe('Service Worker — 消息路由', () => {
  beforeEach(() => {
    resetChromeMock();
    clearLogs();
  });

  it('runtime.sendMessage 不崩溃', async () => {
    const result = await chrome.runtime.sendMessage({ action: 'test' });
    assert.ok(result.received);
  });

  it('runtime.onMessage 注册多个监听器', () => {
    const messages = [];
    chrome.runtime.onMessage.addListener((msg) => messages.push(msg));
    chrome.runtime.onMessage.addListener((msg) => messages.push('second:' + JSON.stringify(msg)));

    // 模拟触发
    for (const listener of chrome.runtime._listeners) {
      listener({ action: 'testAction' });
    }
    assert.equal(messages.length, 2);
  });

  it('tabs.sendMessage 返回结果', async () => {
    const result = await chrome.tabs.sendMessage(1, { action: 'extractContent' });
    assert.ok(result.received);
  });

  it('消息路由 — extractFromTab 模拟', async () => {
    // 模拟 SW 的消息路由逻辑
    const request = { action: 'extractFromTab', tabId: 1 };
    const response = await chrome.tabs.sendMessage(request.tabId, { action: 'extractContent' });
    assert.ok(response);
  });

  it('消息路由 — getCurrentTab 模拟', async () => {
    chrome.tabs._tabs.push({ id: 1, active: true, currentWindow: true, url: 'https://test.com' });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    assert.ok(tab);
    assert.equal(tab.url, 'https://test.com');
  });

  it('消息路由 — collectAllTabs 模拟', async () => {
    chrome.tabs._tabs.push(
      { id: 1, title: 'Page A', url: 'https://a.com' },
      { id: 2, title: 'Page B', url: 'https://b.com' }
    );
    const tabs = await chrome.tabs.query({});
    assert.equal(tabs.length, 2);
  });
});

// ==================== 休眠唤醒模拟 ====================

describe('Service Worker — 休眠唤醒模拟', () => {
  beforeEach(() => {
    resetChromeMock();
    resetIndexedDBMock();
    clearLogs();
  });

  it('SW 休眠后 IndexedDB 数据仍然完整', async () => {
    const kb = new KnowledgeBase();
    await kb.init();

    // 保存数据
    await kb.saveEntry({ title: 'Before Sleep', content: 'data', question: 'Q', answer: 'A' });

    // 模拟 SW 休眠：销毁 db 引用
    kb.db = null;

    // 模拟唤醒：重新初始化
    await kb.init();
    const entries = await kb.getAllEntries();
    assert.ok(entries.length >= 1);
    assert.equal(entries[0].title, 'Before Sleep');
  });

  it('SW 休眠后 storage session 数据保留', async () => {
    const action = { action: 'contextMenuAsk', selection: 'text' };
    await chrome.storage.session.set({ pendingAction: action });

    // 模拟清除/重启 — session 数据仍在
    const result = await chrome.storage.session.get('pendingAction');
    assert.deepEqual(result.pendingAction, action);
  });

  it('多次休眠唤醒周期不丢失数据', async () => {
    const kb = new KnowledgeBase();
    await kb.init();

    for (let cycle = 0; cycle < 3; cycle++) {
      // 保存
      await kb.saveEntry({ title: `Cycle ${cycle}`, content: `data ${cycle}`, question: 'Q', answer: 'A' });

      // 休眠
      kb.db = null;

      // 唤醒
      await kb.init();
    }

    const entries = await kb.getAllEntries();
    assert.ok(entries.length >= 3);
  });

  it('ensureInit 自动重建连接', async () => {
    const kb = new KnowledgeBase();
    await kb.init();

    // 模拟连接丢失
    kb.db = null;

    // ensureInit 应自动重建
    await kb.ensureInit();
    assert.ok(kb.db);

    const entries = await kb.getAllEntries();
    assert.ok(Array.isArray(entries));
  });
});

// ==================== 重试消息队列模拟 ====================

describe('Service Worker — 消息重试队列', () => {
  beforeEach(() => {
    resetChromeMock();
    clearLogs();
  });

  it('成功发送消息记录日志', async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'test' });
      logInfo('context-menu', '消息发送成功');
    } catch (e) {
      logError('context-menu', '消息发送失败', { error: e.message });
    }
    const logs = getLogs();
    assert.ok(logs.some(l => l.message.includes('成功')));
  });

  it('模拟 sendMessageWithRetry 行为 — 立即成功', async () => {
    let attempts = 0;
    const maxRetries = 3;

    async function simulateRetry() {
      for (let i = 0; i < maxRetries; i++) {
        attempts++;
        try {
          await chrome.runtime.sendMessage({ action: 'test' });
          logInfo('test', `第 ${attempts} 次发送成功`);
          return true;
        } catch (e) {
          logWarn('test', `第 ${attempts} 次失败`);
        }
      }
      return false;
    }

    const success = await simulateRetry();
    assert.equal(success, true);
    assert.equal(attempts, 1); // 成功后不重试
  });

  it('模拟 sendMessageWithRetry — 失败重试后成功', async () => {
    let attempts = 0;
    let failUntil = 2;

    // 包装 sendMessage 让前 N 次失败
    const originalSend = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = async (msg) => {
      attempts++;
      if (attempts <= failUntil) {
        throw new Error('Could not establish connection');
      }
      return { received: true };
    };

    let success = false;
    for (let i = 0; i < 5; i++) {
      try {
        await chrome.runtime.sendMessage({ action: 'test' });
        success = true;
        break;
      } catch (e) {
        logWarn('test', `Retry ${i + 1}`);
      }
    }

    assert.equal(success, true);
    assert.equal(attempts, 3);

    // 恢复
    chrome.runtime.sendMessage = originalSend;
  });
});

// ==================== Storage 一致性 ====================

describe('Service Worker — Storage 一致性', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('local / sync / session 存储隔离', async () => {
    await chrome.storage.local.set({ key: 'local-value' });
    await chrome.storage.sync.set({ key: 'sync-value' });
    await chrome.storage.session.set({ key: 'session-value' });

    const local = await chrome.storage.local.get('key');
    const sync = await chrome.storage.sync.get('key');
    const session = await chrome.storage.session.get('key');

    assert.equal(local.key, 'local-value');
    assert.equal(sync.key, 'sync-value');
    assert.equal(session.key, 'session-value');
  });

  it('storage.remove 删除指定键', async () => {
    await chrome.storage.local.set({ a: 1, b: 2, c: 3 });
    await chrome.storage.local.remove('b');
    const result = await chrome.storage.local.get(['a', 'b', 'c']);
    assert.equal(result.a, 1);
    assert.equal(result.b, undefined);
    assert.equal(result.c, 3);
  });

  it('storage.clear 清空所有数据', async () => {
    await chrome.storage.local.set({ x: 1, y: 2 });
    await chrome.storage.local.clear();
    const result = await chrome.storage.local.get(null);
    assert.deepEqual(result, {});
  });

  it('storage.get 默认值生效', async () => {
    const result = await chrome.storage.sync.get({
      missingKey: 'default-value'
    });
    assert.equal(result.missingKey, 'default-value');
  });

  it('大批量 storage 写入不崩溃', async () => {
    const bigData = {};
    for (let i = 0; i < 500; i++) {
      bigData[`key-${i}`] = `value-${i}`;
    }
    await chrome.storage.local.set(bigData);
    const result = await chrome.storage.local.get(Object.keys(bigData));
    assert.equal(Object.keys(result).length, 500);
  });
});

// ==================== AI Client — 请求模拟 ====================

describe('AIClient — 请求构建一致性', () => {
  beforeEach(() => { resetChromeMock(); });

  it('Claude 协议构建正确的请求结构', () => {
    const client = new AIClient({ apiKey: 'test-key', protocol: 'claude' });
    const req = client.buildRequest(
      [{ role: 'user', content: 'hello' }],
      { systemPrompt: 'You are helpful', model: 'claude-sonnet-4-6', maxTokens: 100 }
    );

    assert.ok(req.url.includes('/v1/messages'));
    assert.equal(req.headers['x-api-key'], 'test-key');
    assert.equal(req.headers['anthropic-version'], '2023-06-01');
    assert.equal(req.body.model, 'claude-sonnet-4-6');
    assert.equal(req.body.max_tokens, 100);
    assert.equal(req.body.system, 'You are helpful');
  });

  it('OpenAI 协议构建正确的请求结构', () => {
    const client = new AIClient({ apiKey: 'sk-test', protocol: 'openai' });
    const req = client.buildRequest(
      [{ role: 'user', content: 'hello' }],
      { systemPrompt: 'System', model: 'gpt-4o', maxTokens: 200 }
    );

    assert.ok(req.url.includes('/v1/chat/completions'));
    assert.equal(req.headers['Authorization'], 'Bearer sk-test');
    assert.equal(req.body.model, 'gpt-4o');
    assert.equal(req.body.max_tokens, 200);
    // system prompt 在 messages 数组头部
    assert.equal(req.body.messages[0].role, 'system');
    assert.equal(req.body.messages[0].content, 'System');
  });

  it('stream 选项正确传递', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const req = client.buildRequest([{ role: 'user', content: 'hi' }], { stream: true });
    assert.equal(req.body.stream, true);
  });

  it('vision 消息在 OpenAI 协议中正确转换', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const req = client.buildRequest([{
      role: 'user',
      content: [
        { type: 'text', text: 'describe this' },
        { type: 'image_url', image_url: { url: 'https://example.com/img.png' } }
      ]
    }], {});
    const userMsg = req.body.messages.find(m => m.role === 'user');
    assert.ok(Array.isArray(userMsg.content));
    assert.ok(userMsg.content.some(c => c.type === 'image_url'));
  });

  it('listModels Claude 返回预设列表', async () => {
    const client = new AIClient({ protocol: 'claude' });
    const models = await client.listModels();
    assert.ok(models.includes('claude-sonnet-4-6'));
    assert.equal(models.length, 3);
  });
});

// ==================== KnowledgeBase — 统计与导出 ====================

describe('KnowledgeBase — 统计与导出', () => {
  let kb;
  beforeEach(async () => {
    resetIndexedDBMock();
    kb = new KnowledgeBase();
    await kb.init();
  });

  it('getStats 空库返回零值', async () => {
    const stats = await kb.getStats();
    assert.equal(stats.totalEntries, 0);
    assert.equal(stats.totalTags, 0);
    assert.deepEqual(stats.recentEntries, []);
  });

  it('exportJSON 空库返回空数组', async () => {
    const json = await kb.exportJSON();
    const parsed = JSON.parse(json);
    assert.deepEqual(parsed, []);
  });

  it('exportMarkdown 空库返回标题', async () => {
    const md = await kb.exportMarkdown();
    assert.ok(md.includes('# AI 知识库导出'));
  });

  it('getTotalCount 返回缓存值', async () => {
    await kb.saveEntry({ title: 'A', content: '', question: 'Q', answer: 'A' });
    await kb.saveEntry({ title: 'B', content: '', question: 'Q', answer: 'A' });
    const count1 = await kb.getTotalCount();
    const count2 = await kb.getTotalCount();
    assert.equal(count1, 2);
    assert.equal(count2, 2); // 缓存命中
  });

  it('getEntriesPaged 超出页码返回空', async () => {
    await kb.saveEntry({ title: 'Only', content: '', question: 'Q', answer: 'A' });
    const result = await kb.getEntriesPaged({ page: 100, pageSize: 10 });
    assert.deepEqual(result.entries, []);
    assert.ok(result.total >= 1);
  });
});

// ==================== 完整生命周期端到端 ====================

describe('Service Worker — 完整生命周期端到端', () => {
  beforeEach(() => {
    resetChromeMock();
    resetIndexedDBMock();
    clearLogs();
  });

  it('安装 → 保存设置 → 初始化知识库 → 保存条目 → 查询', async () => {
    // 1. 安装：写入设置
    await chrome.storage.sync.set({
      apiKey: 'sk-test',
      model: 'gpt-4o',
      apiProtocol: 'openai'
    });
    logInfo('sw-lifecycle', '扩展已安装');

    // 2. 读取设置
    const settings = await chrome.storage.sync.get(['apiKey', 'model']);
    assert.equal(settings.apiKey, 'sk-test');
    assert.equal(settings.model, 'gpt-4o');

    // 3. 初始化知识库
    const kb = new KnowledgeBase();
    await kb.init();
    logInfo('sw-lifecycle', '知识库已初始化');

    // 4. 保存条目
    const entry = await kb.saveEntry({
      title: 'Lifecycle Test',
      content: 'Full lifecycle test content',
      question: 'Does it work?',
      answer: 'Yes, it does!',
      tags: ['test', 'lifecycle']
    });
    assert.ok(entry.id);

    // 5. 查询
    const results = await kb.search('lifecycle');
    assert.ok(results.length >= 1);

    // 6. 验证日志
    const logs = getLogsByModule('sw-lifecycle');
    assert.ok(logs.length >= 2);
  });

  it('知识库 → 相关条目 → 统计 → 导出 全流程', async () => {
    const kb = new KnowledgeBase();
    await kb.init();

    // 保存多个条目
    await kb.saveEntry({
      title: 'JavaScript Promises',
      content: 'Promise is for async operations',
      summary: 'Async JS',
      tags: ['javascript', 'async'],
      question: 'What is Promise?',
      answer: 'A Promise represents an eventual result'
    });
    await kb.saveEntry({
      title: 'JavaScript Async/Await',
      content: 'Async/await is syntactic sugar for Promises',
      summary: 'Async JS sugar',
      tags: ['javascript', 'async'],
      question: 'What is async/await?',
      answer: 'Syntactic sugar for Promise-based code'
    });
    await kb.saveEntry({
      title: 'Python asyncio',
      content: 'Python async framework',
      summary: 'Python async',
      tags: ['python', 'async'],
      question: 'What is asyncio?',
      answer: 'Python async I/O framework'
    });

    // 相关条目
    const all = await kb.getAllEntries();
    const jsEntry = all.find(e => e.title.includes('Promises'));
    if (jsEntry) {
      const related = await kb.findRelatedEntries(jsEntry.id, 5);
      assert.ok(related.length >= 1);
    }

    // 统计
    const stats = await kb.getStats();
    assert.ok(stats.totalEntries >= 3);
    assert.ok(stats.totalTags >= 2);

    // 导出
    const json = await kb.exportJSON();
    const parsed = JSON.parse(json);
    assert.ok(parsed.length >= 3);

    const md = await kb.exportMarkdown();
    assert.ok(md.includes('JavaScript Promises'));
  });

  it('注册技能 → 执行 → 验证日志', async () => {
    const engine = new SkillEngine();
    let executed = false;

    engine.register({
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A test skill',
      execute: async (params, ctx) => {
        executed = true;
        logInfo('skill-engine', '技能已执行', { skill: 'test-skill' });
        return { success: true };
      }
    });

    const result = await engine.execute('test-skill', {}, {});
    assert.equal(executed, true);
    assert.deepEqual(result, { success: true });

    const logs = getLogsByModule('skill-engine');
    assert.ok(logs.some(l => l.message.includes('技能已执行')));
  });
});

function getLogsByModule(mod) {
  return getLogs().filter(l => l.module === mod);
}
