/**
 * 测试对话持久化功能
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock, uninstallChromeMock } from './helpers/setup.js';

installChromeMock();

const { saveConversation, loadConversation, clearConversation } = await import('../lib/utils.js');

afterEach(() => {
  resetChromeMock();
});

describe('saveConversation()', () => {
  it('保存对话历史到 session storage', async () => {
    const history = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' }
    ];
    await saveConversation(history, 'https://example.com');

    const stored = chrome.storage._sessionStore['pagewiseConversation'];
    assert.ok(stored, '应保存到 session storage');
    assert.deepEqual(stored.conversationHistory, history);
    assert.equal(stored.currentPageUrl, 'https://example.com');
    assert.ok(typeof stored.timestamp === 'number');
  });

  it('URL 为空时保存空字符串', async () => {
    await saveConversation([{ role: 'user', content: 'test' }], '');
    const stored = chrome.storage._sessionStore['pagewiseConversation'];
    assert.equal(stored.currentPageUrl, '');
  });

  it('保存空对话历史', async () => {
    await saveConversation([], 'https://example.com');
    const stored = chrome.storage._sessionStore['pagewiseConversation'];
    assert.deepEqual(stored.conversationHistory, []);
  });
});

describe('loadConversation()', () => {
  it('无保存数据时返回 null', async () => {
    const result = await loadConversation();
    assert.equal(result, null);
  });

  it('加载有效的对话历史', async () => {
    const history = [
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'answer' }
    ];
    chrome.storage._sessionStore['pagewiseConversation'] = {
      conversationHistory: history,
      currentPageUrl: 'https://example.com',
      timestamp: Date.now()
    };

    const result = await loadConversation();
    assert.ok(result);
    assert.deepEqual(result.conversationHistory, history);
    assert.equal(result.currentPageUrl, 'https://example.com');
  });

  it('超过 24 小时的对话自动过期', async () => {
    const history = [{ role: 'user', content: 'old' }];
    chrome.storage._sessionStore['pagewiseConversation'] = {
      conversationHistory: history,
      currentPageUrl: 'https://example.com',
      timestamp: Date.now() - 25 * 60 * 60 * 1000 // 25 小时前
    };

    const result = await loadConversation();
    assert.equal(result, null, '超过 24 小时应返回 null');
    assert.equal(chrome.storage._sessionStore['pagewiseConversation'], undefined, '应删除过期数据');
  });

  it('24 小时内的对话不过期', async () => {
    const history = [{ role: 'user', content: 'recent' }];
    chrome.storage._sessionStore['pagewiseConversation'] = {
      conversationHistory: history,
      currentPageUrl: '',
      timestamp: Date.now() - 23 * 60 * 60 * 1000 // 23 小时前
    };

    const result = await loadConversation();
    assert.ok(result, '23 小时前的数据应仍有效');
    assert.deepEqual(result.conversationHistory, history);
  });
});

describe('clearConversation()', () => {
  it('清除保存的对话', async () => {
    chrome.storage._sessionStore['pagewiseConversation'] = {
      conversationHistory: [{ role: 'user', content: 'test' }],
      currentPageUrl: '',
      timestamp: Date.now()
    };

    await clearConversation();
    assert.equal(chrome.storage._sessionStore['pagewiseConversation'], undefined);
  });

  it('无数据时清除不报错', async () => {
    await clearConversation(); // 不应抛出异常
  });
});
