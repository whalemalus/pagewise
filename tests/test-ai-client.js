/**
 * 测试 lib/ai-client.js — listModels 方法
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './helpers/setup.js';

installChromeMock();

const { AIClient } = await import('../lib/ai-client.js');

describe('AIClient.listModels()', () => {
  it('Claude 协议返回预设模型列表', async () => {
    const client = new AIClient({
      apiKey: 'test-key',
      protocol: 'claude',
      baseUrl: 'https://api.anthropic.com'
    });
    const models = await client.listModels();
    assert.ok(Array.isArray(models));
    assert.ok(models.includes('claude-sonnet-4-6'));
    assert.ok(models.includes('claude-opus-4-6'));
    assert.ok(models.includes('claude-haiku-4-5'));
  });

  it('Claude 协议返回 3 个模型', async () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'claude' });
    const models = await client.listModels();
    assert.equal(models.length, 3);
  });
});

describe('AIClient 协议判断', () => {
  it('默认协议为 openai', () => {
    const client = new AIClient({ apiKey: 'test' });
    assert.equal(client.protocol, 'openai');
    assert.equal(client.isOpenAI(), true);
    assert.equal(client.isClaude(), false);
  });

  it('指定 claude 协议', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'claude' });
    assert.equal(client.protocol, 'claude');
    assert.equal(client.isClaude(), true);
    assert.equal(client.isOpenAI(), false);
  });
});

describe('AIClient 构造函数', () => {
  it('默认值正确', () => {
    const client = new AIClient();
    assert.equal(client.apiKey, '');
    assert.equal(client.model, 'claude-sonnet-4-6');
    assert.equal(client.maxTokens, 4096);
    assert.equal(client.protocol, 'openai');
  });

  it('自定义选项', () => {
    const client = new AIClient({
      apiKey: 'sk-test',
      baseUrl: 'https://custom.api.com',
      model: 'gpt-4o',
      maxTokens: 8192,
      protocol: 'openai'
    });
    assert.equal(client.apiKey, 'sk-test');
    assert.equal(client.baseUrl, 'https://custom.api.com');
    assert.equal(client.model, 'gpt-4o');
    assert.equal(client.maxTokens, 8192);
  });

  it('baseUrl 末尾斜杠被去除', () => {
    const client = new AIClient({ baseUrl: 'https://api.openai.com/' });
    assert.equal(client.baseUrl, 'https://api.openai.com');
  });
});

describe('AIClient vision 消息格式', () => {
  it('OpenAI 请求保留 image_url 数组格式', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: '这是什么图片？' },
        { type: 'image_url', image_url: { url: 'https://example.com/img.png' } }
      ]
    }];
    const { body } = client.buildOpenAIRequest(messages, {
      systemPrompt: 'test', model: 'gpt-4o', maxTokens: 100, stream: false
    });
    const userMsg = body.messages[1];
    assert.ok(Array.isArray(userMsg.content), 'content 应为数组');
    assert.equal(userMsg.content[0].type, 'text');
    assert.equal(userMsg.content[0].text, '这是什么图片？');
    assert.equal(userMsg.content[1].type, 'image_url');
    assert.equal(userMsg.content[1].image_url.url, 'https://example.com/img.png');
  });

  it('Claude 请求将 image_url 转换为 image.source 格式', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'claude' });
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: '描述这张图' },
        { type: 'image_url', image_url: { url: 'https://example.com/pic.jpg' } }
      ]
    }];
    const { body } = client.buildClaudeRequest(messages, {
      systemPrompt: 'test', model: 'claude-sonnet-4-6', maxTokens: 100, stream: false
    });
    const userMsg = body.messages[0];
    assert.ok(Array.isArray(userMsg.content), 'content 应为数组');
    assert.equal(userMsg.content[0].type, 'text');
    assert.equal(userMsg.content[0].text, '描述这张图');
    assert.equal(userMsg.content[1].type, 'image');
    assert.equal(userMsg.content[1].source.type, 'url');
    assert.equal(userMsg.content[1].source.url, 'https://example.com/pic.jpg');
  });

  it('OpenAI 请求：非 vision 数组仍合并为字符串', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' }
      ]
    }];
    const { body } = client.buildOpenAIRequest(messages, {
      systemPrompt: 'test', model: 'gpt-4o', maxTokens: 100, stream: false
    });
    const userMsg = body.messages[1];
    assert.equal(typeof userMsg.content, 'string', '非 vision 数组应合并为字符串');
    assert.ok(userMsg.content.includes('hello'));
    assert.ok(userMsg.content.includes('world'));
  });

  it('OpenAI 请求：字符串格式 content 不受影响', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
    const messages = [{ role: 'user', content: '普通文本' }];
    const { body } = client.buildOpenAIRequest(messages, {
      systemPrompt: 'test', model: 'gpt-4o', maxTokens: 100, stream: false
    });
    assert.equal(body.messages[1].content, '普通文本');
  });

  it('Claude 请求：image 类型直接透传', () => {
    const client = new AIClient({ apiKey: 'test', protocol: 'claude' });
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: '看图' },
        { type: 'image', source: { type: 'url', url: 'https://example.com/x.png' } }
      ]
    }];
    const { body } = client.buildClaudeRequest(messages, {
      systemPrompt: 'test', model: 'claude-sonnet-4-6', maxTokens: 100, stream: false
    });
    assert.equal(body.messages[0].content[1].type, 'image');
    assert.equal(body.messages[0].content[1].source.url, 'https://example.com/x.png');
  });
});
