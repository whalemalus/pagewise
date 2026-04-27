/**
 * 测试 lib/custom-skills.js — 自定义技能存储模块
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock, uninstallIndexedDBMock } from './helpers/indexeddb-mock.js';

// 安装 IndexedDB mock
installIndexedDBMock();

const {
  saveSkill,
  getAllSkills,
  getSkillById,
  deleteSkill,
  toggleSkill,
  renderTemplate,
  extractTemplateVars
} = await import('../lib/custom-skills.js');

// ==================== 测试工具 ====================

function makeSkill(overrides = {}) {
  return {
    name: '测试技能',
    description: '一个用于测试的技能',
    category: 'custom',
    prompt: '请帮我处理 {{input}}',
    trigger: { type: 'manual' },
    ...overrides
  };
}

// ==================== 模板渲染 ====================

describe('renderTemplate 模板渲染', () => {
  it('替换单个变量', () => {
    const result = renderTemplate('请翻译为 {{lang}}：{{code}}', { lang: 'Python', code: 'console.log("hi")' });
    assert.equal(result, '请翻译为 Python：console.log("hi")');
  });

  it('替换多个同名变量', () => {
    const result = renderTemplate('{{x}} + {{x}} = {{x}}', { x: '1' });
    assert.equal(result, '1 + 1 = 1');
  });

  it('未提供的变量保留原始占位符', () => {
    const result = renderTemplate('请翻译为 {{lang}}', {});
    assert.equal(result, '请翻译为 {{lang}}');
  });

  it('空模板返回空字符串', () => {
    assert.equal(renderTemplate('', {}), '');
    assert.equal(renderTemplate(null, {}), '');
    assert.equal(renderTemplate(undefined, {}), '');
  });

  it('无变量的模板原样返回', () => {
    assert.equal(renderTemplate('这是一个普通文本', {}), '这是一个普通文本');
  });

  it('数字类型的变量值被转为字符串', () => {
    const result = renderTemplate('数量: {{count}}', { count: 42 });
    assert.equal(result, '数量: 42');
  });
});

// ==================== 模板变量提取 ====================

describe('extractTemplateVars 变量提取', () => {
  it('提取单个变量', () => {
    assert.deepEqual(extractTemplateVars('{{name}}'), ['name']);
  });

  it('提取多个变量', () => {
    const vars = extractTemplateVars('{{a}} {{b}} {{c}}');
    assert.deepEqual(vars, ['a', 'b', 'c']);
  });

  it('去重', () => {
    const vars = extractTemplateVars('{{x}} {{y}} {{x}}');
    assert.deepEqual(vars, ['x', 'y']);
  });

  it('空模板返回空数组', () => {
    assert.deepEqual(extractTemplateVars(''), []);
    assert.deepEqual(extractTemplateVars(null), []);
  });

  it('无变量返回空数组', () => {
    assert.deepEqual(extractTemplateVars('无变量文本'), []);
  });
});

// ==================== CRUD 操作 ====================

describe('saveSkill 保存技能', () => {
  beforeEach(() => {
    resetIndexedDBMock();
  });

  it('保存新技能并返回完整记录', async () => {
    const saved = await saveSkill(makeSkill({ name: '代码翻译' }));
    assert.ok(saved.id.startsWith('skill_'));
    assert.equal(saved.name, '代码翻译');
    assert.equal(saved.enabled, true);
    assert.ok(saved.createdAt > 0);
    assert.ok(saved.updatedAt > 0);
  });

  it('保存带有自定义 id 的技能', async () => {
    const saved = await saveSkill(makeSkill({ id: 'skill_custom_123', name: '自定义ID' }));
    assert.equal(saved.id, 'skill_custom_123');
  });

  it('更新已有技能', async () => {
    const saved = await saveSkill(makeSkill({ name: '原始名称' }));
    await saveSkill({ ...saved, name: '更新后名称' });

    const all = await getAllSkills();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, '更新后名称');
  });

  it('缺少 name 抛出错误', async () => {
    await assert.rejects(
      () => saveSkill({ prompt: 'test' }),
      /必须包含 name 和 prompt/
    );
  });

  it('缺少 prompt 抛出错误', async () => {
    await assert.rejects(
      () => saveSkill({ name: 'test' }),
      /必须包含 name 和 prompt/
    );
  });

  it('null 参数抛出错误', async () => {
    await assert.rejects(
      () => saveSkill(null),
      /必须包含 name 和 prompt/
    );
  });
});

describe('getAllSkills 获取所有', () => {
  beforeEach(() => {
    resetIndexedDBMock();
  });

  it('空数据库返回空数组', async () => {
    const all = await getAllSkills();
    assert.deepEqual(all, []);
  });

  it('返回所有保存的技能', async () => {
    await saveSkill(makeSkill({ id: 'skill_1', name: 'A' }));
    await saveSkill(makeSkill({ id: 'skill_2', name: 'B' }));
    await saveSkill(makeSkill({ id: 'skill_3', name: 'C' }));

    const all = await getAllSkills();
    assert.equal(all.length, 3);
  });
});

describe('getSkillById 获取单个', () => {
  beforeEach(() => {
    resetIndexedDBMock();
  });

  it('获取存在的技能', async () => {
    const saved = await saveSkill(makeSkill({ name: '查找我' }));
    const found = await getSkillById(saved.id);
    assert.ok(found);
    assert.equal(found.name, '查找我');
  });

  it('获取不存在的技能返回 undefined', async () => {
    const found = await getSkillById('nonexistent_id');
    assert.equal(found, undefined);
  });
});

describe('deleteSkill 删除', () => {
  beforeEach(() => {
    resetIndexedDBMock();
  });

  it('删除存在的技能', async () => {
    const saved = await saveSkill(makeSkill({ name: '要删除的' }));
    await deleteSkill(saved.id);

    const found = await getSkillById(saved.id);
    assert.equal(found, undefined);
  });

  it('删除后不影响其他技能', async () => {
    const a = await saveSkill(makeSkill({ id: 'skill_del_a', name: '保留' }));
    const b = await saveSkill(makeSkill({ id: 'skill_del_b', name: '删除' }));
    await deleteSkill(b.id);

    const all = await getAllSkills();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, '保留');
  });

  it('删除不存在的技能不抛出错误', async () => {
    await assert.doesNotReject(() => deleteSkill('nonexistent_id'));
  });
});

describe('toggleSkill 切换状态', () => {
  beforeEach(() => {
    resetIndexedDBMock();
  });

  it('禁用已启用的技能', async () => {
    const saved = await saveSkill(makeSkill({ name: '切换测试', enabled: true }));
    const toggled = await toggleSkill(saved.id);
    assert.equal(toggled.enabled, false);
  });

  it('启用已禁用的技能', async () => {
    const saved = await saveSkill(makeSkill({ name: '切换测试', enabled: false }));
    const toggled = await toggleSkill(saved.id);
    assert.equal(toggled.enabled, true);
  });

  it('连续切换两次回到原状态', async () => {
    const saved = await saveSkill(makeSkill({ name: '连续切换', enabled: true }));
    await toggleSkill(saved.id);
    const final = await toggleSkill(saved.id);
    assert.equal(final.enabled, true);
  });

  it('不存在的技能抛出错误', async () => {
    await assert.rejects(
      () => toggleSkill('nonexistent_id'),
      /技能不存在/
    );
  });
});

// ==================== 上限测试 ====================

describe('技能数量上限', () => {
  beforeEach(() => {
    resetIndexedDBMock();
  });

  it('超过 20 个时抛出错误', async () => {
    for (let i = 0; i < 20; i++) {
      await saveSkill(makeSkill({ id: `skill_limit_${i}`, name: `技能${i}` }));
    }

    await assert.rejects(
      () => saveSkill(makeSkill({ name: '第21个' })),
      /上限/
    );
  });

  it('更新已有技能不受上限限制', async () => {
    for (let i = 0; i < 20; i++) {
      await saveSkill(makeSkill({ id: `skill_upd_${i}`, name: `技能${i}` }));
    }

    const all = await getAllSkills();
    const first = all[0];

    // 更新应该成功
    await assert.doesNotReject(() =>
      saveSkill({ ...first, name: '更新后的技能' })
    );
  });
});
