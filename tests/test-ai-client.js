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
