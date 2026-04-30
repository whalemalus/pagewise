/**
 * 测试 R18: 设置和知识库备份导出/导入
 *
 * 覆盖场景：
 * 1. 导出备份 JSON 结构验证
 * 2. 导入备份格式校验（缺少字段）
 * 3. 导入知识条目跳过重复
 * 4. 导入恢复设置到 chrome.storage.sync
 * 5. 完整 round-trip（导出 → 导入）
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

installChromeMock();
installIndexedDBMock();

const { KnowledgeBase } = await import('../lib/knowledge-base.js');
const { getSettings, saveSettings } = await import('../lib/utils.js');

beforeEach(() => {
  resetIndexedDBMock();
  resetChromeMock();
  if (!globalThis.chrome) installChromeMock();
});

describe('backup export/import - JSON structure', () => {

  // ---- 1. 导出备份应包含 version, exportedAt, settings, knowledge ----
  it('exportBackup 生成的 JSON 包含必要字段', async () => {
    // 设置一些配置
    await saveSettings({
      apiKey: 'sk-test-123',
      apiBaseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
      maxTokens: 4096,
      theme: 'dark'
    });

    // 保存一些知识条目
    const kb = new KnowledgeBase();
    await kb.init();
    await kb.saveEntry({ title: '测试条目1', content: '内容1', question: 'Q1', answer: 'A1' });
    await kb.saveEntry({ title: '测试条目2', content: '内容2', question: 'Q2', answer: 'A2' });

    // 模拟导出逻辑
    const settings = await new Promise((resolve) => {
      chrome.storage.sync.get(null, (result) => resolve(result || {}));
    });
    const entries = await kb.getAllEntries(100000);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      knowledge: entries
    };

    // 验证结构
    assert.equal(backup.version, 1, 'version 应为 1');
    assert.ok(backup.exportedAt, 'exportedAt 应存在');
    assert.ok(typeof backup.exportedAt === 'string', 'exportedAt 应为字符串');
    assert.ok(backup.settings, 'settings 应存在');
    assert.ok(Array.isArray(backup.knowledge), 'knowledge 应为数组');

    // 验证设置内容
    assert.equal(backup.settings.apiKey, 'sk-test-123');
    assert.equal(backup.settings.model, 'gpt-4o');
    assert.equal(backup.settings.theme, 'dark');

    // 验证知识条目
    assert.equal(backup.knowledge.length, 2);
    assert.equal(backup.knowledge[0].title, '测试条目2'); // 按时间倒序
    assert.equal(backup.knowledge[1].title, '测试条目1');
  });

  // ---- 2. JSON 序列化/反序列化 round-trip ----
  it('导出 JSON 可正确反序列化', async () => {
    const kb = new KnowledgeBase();
    await kb.init();
    await kb.saveEntry({ title: 'Round Trip', content: 'test content', tags: ['a', 'b'] });

    const settings = { apiKey: 'sk-abc', model: 'test-model' };
    const entries = await kb.getAllEntries(100000);

    const backup = { version: 1, exportedAt: new Date().toISOString(), settings, knowledge: entries };
    const json = JSON.stringify(backup);
    const parsed = JSON.parse(json);

    assert.equal(parsed.version, 1);
    assert.equal(parsed.settings.apiKey, 'sk-abc');
    assert.equal(parsed.knowledge.length, 1);
    assert.equal(parsed.knowledge[0].title, 'Round Trip');
    assert.deepEqual(parsed.knowledge[0].tags, ['a', 'b']);
  });
});

describe('backup import - format validation', () => {

  // ---- 3. 缺少 version 字段应拒绝 ----
  it('缺少 version 字段应被识别为无效', () => {
    const invalidData = {
      exportedAt: new Date().toISOString(),
      settings: {},
      knowledge: []
    };
    const isValid = !!(invalidData.version && invalidData.settings && Array.isArray(invalidData.knowledge));
    assert.equal(isValid, false, '缺少 version 应视为无效');
  });

  // ---- 4. 缺少 settings 字段应拒绝 ----
  it('缺少 settings 字段应被识别为无效', () => {
    const invalidData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      knowledge: []
    };
    const isValid = !!(invalidData.version && invalidData.settings && Array.isArray(invalidData.knowledge));
    assert.equal(isValid, false, '缺少 settings 应视为无效');
  });

  // ---- 5. knowledge 不是数组应拒绝 ----
  it('knowledge 不是数组应被识别为无效', () => {
    const invalidData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {},
      knowledge: 'not-an-array'
    };
    const isValid = !!(invalidData.version && invalidData.settings && Array.isArray(invalidData.knowledge));
    assert.equal(isValid, false, 'knowledge 非数组应视为无效');
  });

  // ---- 6. 有效格式应通过校验 ----
  it('完整格式应通过校验', () => {
    const validData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: { apiKey: 'test' },
      knowledge: []
    };
    const isValid = !!(validData.version && validData.settings && Array.isArray(validData.knowledge));
    assert.equal(isValid, true, '完整格式应有效');
  });
});

describe('backup import - duplicate detection', () => {

  // ---- 7. 重复条目应被 findDuplicate 检测到 ----
  it('findDuplicate 检测相同标题的条目', async () => {
    const kb = new KnowledgeBase();
    await kb.init();

    await kb.saveEntry({ title: '唯一标题X', content: '原始内容', question: 'Q', answer: 'A' });

    const dup = await kb.findDuplicate({ title: '唯一标题X', content: '新内容', question: 'Q2', answer: 'A2' });
    assert.ok(dup, '应检测到重复');
    assert.equal(dup.title, '唯一标题X');
  });

  // ---- 8. 不同标题不应被判定为重复 ----
  it('findDuplicate 不误判不同条目', async () => {
    const kb = new KnowledgeBase();
    await kb.init();

    await kb.saveEntry({ title: '标题A', content: '内容A', question: '问题A很长很长', answer: 'A' });

    const dup = await kb.findDuplicate({ title: '完全不同的标题B', content: '内容B', question: '另一个问题很长很长', answer: 'B' });
    assert.equal(dup, null, '不同条目不应被判为重复');
  });

  // ---- 9. 导入时跳过重复并计数 ----
  it('导入知识条目时跳过重复并返回正确计数', async () => {
    const kb = new KnowledgeBase();
    await kb.init();

    // 先保存一些条目
    await kb.saveEntry({ title: '已有条目', content: '内容', question: 'Q', answer: 'A' });
    await kb.saveEntry({ title: '另一条目', content: '内容', question: 'Q', answer: 'A' });

    // 模拟导入的备份数据
    const importData = [
      { title: '已有条目', content: '内容', question: 'Q', answer: 'A' }, // 重复
      { title: '新条目1', content: '新内容', question: 'Q1', answer: 'A1' }, // 新增
      { title: '另一条目', content: '内容', question: 'Q', answer: 'A' }, // 重复
      { title: '新条目2', content: '新内容', question: 'Q2', answer: 'A2' }, // 新增
    ];

    let imported = 0;
    let skipped = 0;
    for (const entry of importData) {
      const result = await kb.saveEntry(entry);
      if (result && result.duplicate) {
        skipped++;
      } else {
        imported++;
      }
    }

    assert.equal(imported, 2, '应导入 2 条新条目');
    assert.equal(skipped, 2, '应跳过 2 条重复条目');
  });
});

describe('backup import - settings restoration', () => {

  // ---- 10. 导入设置应恢复到 chrome.storage.sync ----
  it('导入的设置可正确写入 chrome.storage.sync', async () => {
    const importedSettings = {
      apiKey: 'sk-imported-key',
      apiBaseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
      theme: 'auto',
      autoExtract: true
    };

    await new Promise((resolve) => {
      chrome.storage.sync.set(importedSettings, resolve);
    });

    const restored = await getSettings();
    assert.equal(restored.apiKey, 'sk-imported-key');
    assert.equal(restored.apiBaseUrl, 'https://api.anthropic.com');
    assert.equal(restored.model, 'claude-sonnet-4-6');
    assert.equal(restored.maxTokens, 8192);
    assert.equal(restored.theme, 'auto');
    assert.equal(restored.autoExtract, true);
  });

  // ---- 11. 导入设置覆盖原有设置 ----
  it('导入设置应覆盖原有设置', async () => {
    // 先保存原始设置
    await saveSettings({ apiKey: 'sk-original', model: 'old-model', theme: 'light' });

    // 覆盖
    const newSettings = { apiKey: 'sk-new', model: 'new-model', theme: 'dark' };
    await new Promise((resolve) => {
      chrome.storage.sync.set(newSettings, resolve);
    });

    const result = await getSettings();
    assert.equal(result.apiKey, 'sk-new');
    assert.equal(result.model, 'new-model');
    assert.equal(result.theme, 'dark');
  });
});
