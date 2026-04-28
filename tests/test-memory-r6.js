import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';
installChromeMock();
installIndexedDBMock();
const { MemorySystem } = await import('../lib/memory.js');

describe('MemorySystem', () => {
  let memory;

  beforeEach(async () => {
    resetChromeMock();
    resetIndexedDBMock();
    installIndexedDBMock();
    memory = new MemorySystem();
    await memory.init();
  });

  afterEach(() => {
    memory = null;
  });

  // 1. init 不报错
  it('1. init does not throw', async () => {
    const m = new MemorySystem();
    await assert.doesNotReject(() => m.init());
  });

  // 2. save + recall 基本存取（通过 kb.saveEntry 保存，recall 召回）
  it('2. save entry + recall retrieves it', async () => {
    await memory.kb.saveEntry({
      title: 'JavaScript 闭包',
      content: '闭包是函数和其词法环境的组合',
      summary: '闭包概念介绍',
      tags: ['javascript', 'closure'],
      question: '什么是闭包',
      answer: '闭包是函数和其词法环境的组合'
    });
    const results = await memory.recall('闭包');
    assert.ok(Array.isArray(results), 'recall should return an array');
    assert.ok(results.length > 0, 'should find the saved entry');
    assert.ok(results[0].content.includes('闭包'), 'result should contain keyword');
  });

  // 3. recall 不存在的 key 返回空数组
  it('3. recall non-existent keyword returns empty array', async () => {
    const results = await memory.recall('完全不存在的查询内容_xyz_123');
    assert.ok(Array.isArray(results), 'should return array');
    assert.equal(results.length, 0, 'should be empty for non-existent query');
  });

  // 4. save 覆盖同 key — 更新已有条目
  it('4. updateEntry overwrites existing entry', async () => {
    const entry = await memory.kb.saveEntry({
      title: 'React Hooks',
      summary: 'Hooks 概述',
      tags: ['react'],
      question: '什么是 Hooks',
      answer: 'Hooks 是 React 16.8 的新特性'
    });
    await memory.kb.updateEntry(entry.id, { summary: '更新后的 Hooks 概述' });
    const updated = await memory.kb.getEntry(entry.id);
    assert.equal(updated.summary, '更新后的 Hooks 概述');
  });

  // 5. addFact — 通过 kb.saveEntry 添加事实
  it('5. addFact (saveEntry) adds a knowledge fact', async () => {
    const entry = await memory.kb.saveEntry({
      title: 'HTML5 语义化标签',
      content: '',
      summary: 'header, nav, main, footer 等',
      tags: ['html5'],
      question: '',
      answer: 'HTML5 引入了语义化标签'
    });
    assert.ok(entry.id, 'saved entry should have an id');
    const fetched = await memory.kb.getEntry(entry.id);
    assert.equal(fetched.title, 'HTML5 语义化标签');
  });

  // 6. getFacts 返回数组（getAllEntries）
  it('6. getAllEntries returns an array of facts', async () => {
    await memory.kb.saveEntry({ title: 'Fact A', summary: 'a', tags: ['a'] });
    await memory.kb.saveEntry({ title: 'Fact B', summary: 'b', tags: ['b'] });
    const entries = await memory.kb.getAllEntries();
    assert.ok(Array.isArray(entries), 'should return an array');
    assert.ok(entries.length >= 2, 'should contain at least 2 entries');
  });

  // 7. getContext 返回字符串（上下文拼接） — toPrompt
  it('7. toPrompt returns a non-empty string context', async () => {
    await memory.kb.saveEntry({
      title: 'Python 装饰器',
      summary: 'Python decorator 用法',
      tags: ['python'],
      question: '什么是装饰器',
      answer: '装饰器是修改函数行为的函数'
    });
    const prompt = await memory.toPrompt('装饰器');
    assert.equal(typeof prompt, 'string');
    assert.ok(prompt.length > 0, 'prompt should not be empty');
    assert.ok(prompt.includes('相关记忆'), 'prompt should contain memory section header');
  });

  // 8. getContext 空记忆返回空字符串
  it('8. toPrompt returns empty string on empty memory', async () => {
    const prompt = await memory.toPrompt('不存在的查询_xyz');
    assert.equal(typeof prompt, 'string');
    // 空记忆 + 不匹配查询 → 空字符串
    assert.equal(prompt, '', 'should return empty string when no memory');
  });
});
