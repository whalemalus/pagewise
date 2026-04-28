/**
 * 测试 lib/prompt-templates.js — Prompt 模板库
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock chrome.storage.local
const storage = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => ({ [key]: storage[key] || null }),
      set: async (obj) => {
        Object.assign(storage, obj);
      },
    },
  },
};

const {
  getAllTemplates,
  saveTemplate,
  deleteTemplate,
  renderTemplate,
  getBuiltinTemplates,
  BUILTIN_TEMPLATES,
  MAX_CUSTOM_TEMPLATES,
  STORAGE_KEY,
} = await import('../lib/prompt-templates.js');

beforeEach(() => {
  // 清空存储
  storage[STORAGE_KEY] = null;
});

// ==================== 内置模板 ====================

describe('内置模板', () => {
  it('有 5 个内置模板', () => {
    assert.equal(BUILTIN_TEMPLATES.length, 5);
  });

  it('内置模板包含代码审查', () => {
    const tpl = BUILTIN_TEMPLATES.find(t => t.name === '代码审查');
    assert.ok(tpl, '应存在代码审查模板');
    assert.equal(tpl.isBuiltin, true);
    assert.equal(tpl.category, 'code');
    assert.ok(tpl.content.includes('{{code}}'), '应包含 {{code}} 变量');
  });

  it('内置模板包含错误诊断', () => {
    const tpl = BUILTIN_TEMPLATES.find(t => t.name === '错误诊断');
    assert.ok(tpl);
    assert.equal(tpl.isBuiltin, true);
    assert.equal(tpl.category, 'debug');
  });

  it('内置模板包含概念解释', () => {
    const tpl = BUILTIN_TEMPLATES.find(t => t.name === '概念解释');
    assert.ok(tpl);
    assert.equal(tpl.isBuiltin, true);
    assert.equal(tpl.category, 'learning');
  });

  it('内置模板包含代码重构', () => {
    const tpl = BUILTIN_TEMPLATES.find(t => t.name === '代码重构');
    assert.ok(tpl);
    assert.equal(tpl.isBuiltin, true);
    assert.equal(tpl.category, 'code');
  });

  it('内置模板包含学习笔记', () => {
    const tpl = BUILTIN_TEMPLATES.find(t => t.name === '学习笔记');
    assert.ok(tpl);
    assert.equal(tpl.isBuiltin, true);
    assert.equal(tpl.category, 'learning');
  });

  it('内置模板 ID 以 tpl_builtin_ 开头', () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      assert.ok(tpl.id.startsWith('tpl_builtin_'), `ID "${tpl.id}" 应以 tpl_builtin_ 开头`);
    }
  });

  it('getBuiltinTemplates() 返回副本', () => {
    const a = getBuiltinTemplates();
    const b = getBuiltinTemplates();
    assert.notEqual(a, b, '应返回不同引用');
    assert.deepEqual(a, b, '内容应相同');
  });
});

// ==================== getAllTemplates ====================

describe('getAllTemplates()', () => {
  it('无自定义模板时只返回内置模板', async () => {
    const all = await getAllTemplates();
    assert.equal(all.length, 5);
  });

  it('有自定义模板时返回内置 + 自定义', async () => {
    storage[STORAGE_KEY] = [
      { id: 'tpl_1', name: '自定义', content: 'test', category: 'custom', isBuiltin: false, createdAt: 1 },
    ];
    const all = await getAllTemplates();
    assert.equal(all.length, 6);
  });
});

// ==================== saveTemplate ====================

describe('saveTemplate()', () => {
  it('新建自定义模板', async () => {
    const tpl = await saveTemplate({ name: '我的模板', content: 'Hello {{name}}', category: 'custom' });
    assert.ok(tpl.id.startsWith('tpl_'));
    assert.equal(tpl.name, '我的模板');
    assert.equal(tpl.content, 'Hello {{name}}');
    assert.equal(tpl.isBuiltin, false);
    assert.equal(tpl.category, 'custom');
    assert.ok(tpl.createdAt > 0);
  });

  it('新建模板后 getAllTemplates 包含它', async () => {
    await saveTemplate({ name: '新模板', content: 'test' });
    const all = await getAllTemplates();
    assert.equal(all.length, 6);
  });

  it('更新已有模板', async () => {
    const saved = await saveTemplate({ name: '原始', content: 'before' });
    const updated = await saveTemplate({ id: saved.id, name: '修改后', content: 'after' });
    assert.equal(updated.id, saved.id);
    assert.equal(updated.name, '修改后');
    assert.equal(updated.content, 'after');
  });

  it('更新不存在的模板抛出错误', async () => {
    await assert.rejects(
      () => saveTemplate({ id: 'tpl_nonexist', name: 'x', content: 'y' }),
      { message: '模板不存在' }
    );
  });

  it('默认 category 为 custom', async () => {
    const tpl = await saveTemplate({ name: 'test', content: 'test' });
    assert.equal(tpl.category, 'custom');
  });

  it('达到上限时抛出错误', async () => {
    // 预填 30 个
    const templates = [];
    for (let i = 0; i < MAX_CUSTOM_TEMPLATES; i++) {
      templates.push({ id: `tpl_${i}`, name: `tpl${i}`, content: '', category: 'custom', isBuiltin: false, createdAt: i });
    }
    storage[STORAGE_KEY] = templates;

    await assert.rejects(
      () => saveTemplate({ name: '第31个', content: 'test' }),
      { message: /上限/ }
    );
  });
});

// ==================== deleteTemplate ====================

describe('deleteTemplate()', () => {
  it('删除自定义模板', async () => {
    const saved = await saveTemplate({ name: '待删除', content: 'test' });
    await deleteTemplate(saved.id);
    const all = await getAllTemplates();
    assert.equal(all.length, 5);
  });

  it('删除不存在的模板抛出错误', async () => {
    await assert.rejects(
      () => deleteTemplate('tpl_nonexist'),
      { message: '模板不存在' }
    );
  });

  it('内置模板不可删除', async () => {
    await assert.rejects(
      () => deleteTemplate('tpl_builtin_code_review'),
      { message: '内置模板不可删除' }
    );
  });

  it('删除所有内置模板 ID 均抛出错误', async () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      await assert.rejects(
        () => deleteTemplate(tpl.id),
        { message: '内置模板不可删除' }
      );
    }
  });
});

// ==================== renderTemplate ====================

describe('renderTemplate()', () => {
  it('渲染内置模板（替换变量）', async () => {
    const result = await renderTemplate('tpl_builtin_code_review', { code: 'console.log("hi")' });
    assert.ok(result.includes('console.log("hi")'), '应替换 {{code}}');
    assert.ok(!result.includes('{{code}}'), '不应包含未替换的 {{code}}');
  });

  it('渲染时未提供的变量保持原样', async () => {
    const result = await renderTemplate('tpl_builtin_code_review', {});
    assert.ok(result.includes('{{code}}'), '未提供变量应保持原样');
  });

  it('渲染自定义模板', async () => {
    const saved = await saveTemplate({ name: '问候', content: '你好，{{name}}！今天是{{day}}。' });
    const result = await renderTemplate(saved.id, { name: '小明', day: '周一' });
    assert.equal(result, '你好，小明！今天是周一。');
  });

  it('渲染不存在的模板抛出错误', async () => {
    await assert.rejects(
      () => renderTemplate('tpl_nonexist', {}),
      { message: '模板不存在' }
    );
  });

  it('变量值为空字符串时替换为空', async () => {
    const result = await renderTemplate('tpl_builtin_code_review', { code: '' });
    assert.ok(!result.includes('{{code}}'));
  });

  it('变量值为 undefined 时替换为空', async () => {
    const result = await renderTemplate('tpl_builtin_code_review', { code: undefined });
    assert.ok(!result.includes('{{code}}'));
  });

  it('多个变量全部替换', async () => {
    const saved = await saveTemplate({ name: 'multi', content: '{{a}} + {{b}} = {{c}}' });
    const result = await renderTemplate(saved.id, { a: '1', b: '2', c: '3' });
    assert.equal(result, '1 + 2 = 3');
  });
});
