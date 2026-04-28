/**
 * Tests for Token estimation functions
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, estimateMessagesTokens } from '../lib/ai-client.js';

describe('estimateTokens', () => {
  it('returns 0 for empty/null/undefined input', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
    assert.equal(estimateTokens(123), 0);
  });

  it('estimates English text tokens (chars/3)', () => {
    // 12 chars -> ceil(12/3) = 4
    assert.equal(estimateTokens('hello world!'), 4);
  });

  it('estimates Chinese text tokens', () => {
    // 6 Chinese chars -> ceil(6/3) = 2
    assert.equal(estimateTokens('你好世界测试'), 2);
  });

  it('estimates mixed text tokens', () => {
    const text = 'Hello 你好世界'; // 12 chars -> 4
    assert.equal(estimateTokens(text), 4);
  });

  it('handles short text', () => {
    assert.equal(estimateTokens('a'), 1);   // ceil(1/3) = 1
    assert.equal(estimateTokens('ab'), 1);  // ceil(2/3) = 1
    assert.equal(estimateTokens('abc'), 1); // ceil(3/3) = 1
    assert.equal(estimateTokens('abcd'), 2); // ceil(4/3) = 2
  });
});

describe('estimateMessagesTokens', () => {
  it('returns 0 for empty/invalid input', () => {
    assert.equal(estimateMessagesTokens([]), 0);
    assert.equal(estimateMessagesTokens(null), 0);
    assert.equal(estimateMessagesTokens(undefined), 0);
  });

  it('estimates single message tokens', () => {
    // 1 message: 4 (overhead) + ceil(5/3) = 4 + 2 = 6
    const messages = [{ role: 'user', content: 'hello' }];
    assert.equal(estimateMessagesTokens(messages), 6);
  });

  it('estimates multiple messages tokens', () => {
    const messages = [
      { role: 'user', content: 'hello' },   // 4 + 2 = 6
      { role: 'assistant', content: 'world' } // 4 + 2 = 6
    ];
    assert.equal(estimateMessagesTokens(messages), 12);
  });

  it('handles messages with non-string content gracefully', () => {
    const messages = [
      { role: 'user', content: null },
      { role: 'assistant', content: 42 }
    ];
    // Each message: 4 + 0 = 4, total = 8
    assert.equal(estimateMessagesTokens(messages), 8);
  });

  it('estimates longer conversation', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'This is a test message with some content.' // 41 chars -> ceil(41/3) = 14
    }));
    // 10 messages * (4 + 14) = 180
    assert.equal(estimateMessagesTokens(messages), 180);
  });
});
