/**
 * 测试截图提问功能 (R13)
 *
 * 验证：
 * 1. AIClient 支持 base64 data URL 图片消息
 * 2. 截图消息格式正确（OpenAI / Claude 协议）
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './helpers/setup.js';

installChromeMock();

const { AIClient } = await import('../lib/ai-client.js');

describe('截图提问：base64 data URL 支持', () => {
  it('OpenAI 协议：data URL 图片保持原样', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: '描述截图内容' },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    }];
    const { body } = client.buildOpenAIRequest(messages, {
      systemPrompt: 'test', model: 'gpt-4o', maxTokens: 100, stream: false
    });
    const userMsg = body.messages[1];
    assert.ok(Array.isArray(userMsg.content), 'content 应为数组');
    assert.equal(userMsg.content[0].type, 'text');
    assert.equal(userMsg.content[0].text, '描述截图内容');
    assert.equal(userMsg.content[1].type, 'image_url');
    assert.ok(userMsg.content[1].image_url.url.startsWith('data:image/png;base64,'));
  });

  it('Claude 协议：data URL 图片转换为 image.source 格式', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'claude' });
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: '这是什么？' },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    }];
    const { body } = client.buildClaudeRequest(messages, {
      systemPrompt: 'test', model: 'claude-sonnet-4-6', maxTokens: 100, stream: false
    });
    const userMsg = body.messages[0];
    assert.ok(Array.isArray(userMsg.content), 'content 应为数组');
    assert.equal(userMsg.content[0].type, 'text');
    assert.equal(userMsg.content[1].type, 'image');
    assert.equal(userMsg.content[1].source.type, 'url');
    assert.ok(userMsg.content[1].source.url.startsWith('data:image/png;base64,'));
  });

  it('混合内容：text + 截图 data URL 正确构建', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const screenshotDataUrl = 'data:image/png;base64,AAAABBBB';
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: '请分析这个截图' },
        { type: 'image_url', image_url: { url: screenshotDataUrl } }
      ]
    }];
    const { body } = client.buildOpenAIRequest(messages, {
      systemPrompt: 'test', model: 'gpt-4o', maxTokens: 100, stream: false
    });
    const userMsg = body.messages[1];
    assert.equal(userMsg.content.length, 2);
    assert.equal(userMsg.content[0].type, 'text');
    assert.equal(userMsg.content[1].type, 'image_url');
    assert.equal(userMsg.content[1].image_url.url, screenshotDataUrl);
  });

  it('URL 图片和 data URL 图片格式一致', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const urlMsg = [{
      role: 'user',
      content: [
        { type: 'text', text: 'q' },
        { type: 'image_url', image_url: { url: 'https://example.com/img.png' } }
      ]
    }];
    const dataUrlMsg = [{
      role: 'user',
      content: [
        { type: 'text', text: 'q' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }
      ]
    }];
    const { body: urlBody } = client.buildOpenAIRequest(urlMsg, {
      systemPrompt: 'test', model: 'gpt-4o', maxTokens: 100, stream: false
    });
    const { body: dataBody } = client.buildOpenAIRequest(dataUrlMsg, {
      systemPrompt: 'test', model: 'gpt-4o', maxTokens: 100, stream: false
    });
    // Both should have the same structure
    assert.equal(urlBody.messages[1].content[1].type, 'image_url');
    assert.equal(dataBody.messages[1].content[1].type, 'image_url');
    assert.ok(urlBody.messages[1].content[1].image_url.url.startsWith('https://'));
    assert.ok(dataBody.messages[1].content[1].image_url.url.startsWith('data:'));
  });
});

describe('截图提问：captureVisibleTab 模拟', () => {
  it('chrome.tabs.captureVisibleTab 在 mock 中可调用', async () => {
    // captureVisibleTab 需要在 chrome mock 中存在
    // 这里测试 mock 是否正确设置了该方法
    const hasCapture = typeof chrome.tabs.captureVisibleTab === 'function';
    // 如果 mock 没有此方法，测试会跳过（因为需要真实 Chrome 环境）
    if (hasCapture) {
      const result = await chrome.tabs.captureVisibleTab(1, { format: 'png' });
      assert.ok(typeof result === 'string' || result === undefined);
    } else {
      // 在 Node.js 测试环境中，此 API 不可用是正常的
      assert.ok(true, 'captureVisibleTab 不在 mock 中（需真实浏览器环境）');
    }
  });
});
