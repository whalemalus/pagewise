/**
 * 测试 lib/skill-engine.js — 技能引擎
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { SkillEngine } = await import('../lib/skill-engine.js');

let engine;

beforeEach(() => {
  engine = new SkillEngine();
});

/** 创建测试技能 */
function makeSkill(overrides = {}) {
  return {
    id: 'test-skill',
    name: '测试技能',
    description: '一个测试技能',
    category: 'testing',
    execute: async (params) => `result: ${JSON.stringify(params)}`,
    ...overrides,
  };
}

// ==================== 注册 ====================

describe('SkillEngine 注册', () => {
  it('register() 注册技能', () => {
    engine.register(makeSkill());
    assert.equal(engine.skills.size, 1);
    assert.ok(engine.get('test-skill'));
  });

  it('register() 缺少必要字段抛出错误', () => {
    assert.throws(() => engine.register({}), /must have id, name, and execute/);
    assert.throws(() => engine.register({ id: 'x' }), /must have id, name, and execute/);
    assert.throws(() => engine.register({ id: 'x', name: 'y' }), /must have id, name, and execute/);
  });

  it('register() 覆盖已有技能', () => {
    engine.register(makeSkill({ description: 'v1' }));
    engine.register(makeSkill({ description: 'v2' }));
    assert.equal(engine.skills.size, 1);
    assert.equal(engine.get('test-skill').description, 'v2');
  });

  it('register() 默认属性', () => {
    engine.register(makeSkill());
    const skill = engine.get('test-skill');
    assert.equal(skill.category, 'testing');
    assert.equal(skill.trigger, null);
    assert.deepEqual(skill.parameters, []);
    assert.equal(skill.enabled, true);
  });

  it('registerAll() 批量注册', () => {
    engine.registerAll([
      makeSkill({ id: 'a', name: 'A' }),
      makeSkill({ id: 'b', name: 'B' }),
      makeSkill({ id: 'c', name: 'C' }),
    ]);
    assert.equal(engine.skills.size, 3);
  });

  it('register() enabled=false 禁用技能', () => {
    engine.register(makeSkill({ enabled: false }));
    const skill = engine.get('test-skill');
    assert.equal(skill.enabled, false);
  });
});

// ==================== 查询 ====================

describe('SkillEngine 查询', () => {
  beforeEach(() => {
    engine.registerAll([
      makeSkill({ id: 'code-explain', name: '代码解释', category: 'code' }),
      makeSkill({ id: 'code-review', name: '代码审查', category: 'code' }),
      makeSkill({ id: 'translate', name: '翻译', category: 'general' }),
      makeSkill({ id: 'disabled-skill', name: '禁用技能', enabled: false }),
    ]);
  });

  it('get() 获取指定技能', () => {
    const skill = engine.get('code-explain');
    assert.ok(skill);
    assert.equal(skill.name, '代码解释');
  });

  it('get() 不存在返回 undefined', () => {
    assert.equal(engine.get('nonexistent'), undefined);
  });

  it('getAll() 返回所有技能', () => {
    assert.equal(engine.getAll().length, 4);
  });

  it('getEnabled() 只返回启用的', () => {
    const enabled = engine.getEnabled();
    assert.equal(enabled.length, 3);
    assert.ok(!enabled.some(s => s.id === 'disabled-skill'));
  });

  it('getByCategory() 按分类筛选', () => {
    const codeSkills = engine.getByCategory('code');
    assert.equal(codeSkills.length, 2);
    assert.ok(codeSkills.every(s => s.category === 'code'));
  });
});

// ==================== 触发匹配 ====================

describe('SkillEngine 触发匹配', () => {
  it('matchTriggers() 匹配触发条件', () => {
    engine.register(makeSkill({
      id: 'has-code',
      name: '代码技能',
      trigger: (ctx) => (ctx.codeBlocks?.length || 0) >= 2,
    }));

    const matched = engine.matchTriggers({
      codeBlocks: [{ lang: 'js' }, { lang: 'py' }],
    });
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 'has-code');
  });

  it('matchTriggers() 不匹配条件', () => {
    engine.register(makeSkill({
      id: 'has-code',
      name: '代码技能',
      trigger: (ctx) => (ctx.codeBlocks?.length || 0) >= 2,
    }));

    const matched = engine.matchTriggers({
      codeBlocks: [{ lang: 'js' }],
    });
    assert.equal(matched.length, 0);
  });

  it('matchTriggers() 跳过无 trigger 的技能', () => {
    engine.register(makeSkill({ id: 'no-trigger' }));
    const matched = engine.matchTriggers({});
    assert.equal(matched.length, 0);
  });

  it('matchTriggers() 跳过禁用技能', () => {
    engine.register(makeSkill({
      id: 'disabled',
      enabled: false,
      trigger: () => true,
    }));
    const matched = engine.matchTriggers({});
    assert.equal(matched.length, 0);
  });

  it('matchTriggers() trigger 异常时安全跳过', () => {
    engine.register(makeSkill({
      id: 'bad-trigger',
      trigger: () => { throw new Error('boom'); },
    }));
    // 不应抛出
    const matched = engine.matchTriggers({});
    assert.equal(matched.length, 0);
  });
});

// ==================== 执行 ====================

describe('SkillEngine 执行', () => {
  it('execute() 正确执行技能', async () => {
    engine.register(makeSkill({
      execute: async (params) => `echo: ${params.text}`,
    }));

    const result = await engine.execute('test-skill', { text: 'hello' });
    assert.equal(result, 'echo: hello');
  });

  it('execute() 技能不存在抛出错误', async () => {
    await assert.rejects(
      () => engine.execute('nonexistent'),
      /Skill not found: nonexistent/
    );
  });

  it('execute() 技能禁用抛出错误', async () => {
    engine.register(makeSkill({ enabled: false }));
    await assert.rejects(
      () => engine.execute('test-skill'),
      /Skill disabled: test-skill/
    );
  });

  it('execute() 执行 before/after hooks', async () => {
    const log = [];

    engine.on('beforeExecute', async (skill) => {
      log.push(`before:${skill.id}`);
    });
    engine.on('afterExecute', async (skill, params, result) => {
      log.push(`after:${skill.id}:${result}`);
    });

    engine.register(makeSkill({
      execute: async () => 'done',
    }));

    await engine.execute('test-skill', {});
    assert.deepEqual(log, ['before:test-skill', 'after:test-skill:done']);
  });

  it('execute() 错误时触发 onError hook', async () => {
    let caughtError = null;

    engine.on('onError', async (skill, params, error) => {
      caughtError = error;
    });

    engine.register(makeSkill({
      execute: async () => { throw new Error('技能执行失败'); },
    }));

    await assert.rejects(
      () => engine.execute('test-skill', {}),
      /技能执行失败/
    );
    assert.ok(caughtError, 'onError hook 应被调用');
  });
});

// ==================== Hooks ====================

describe('SkillEngine Hooks', () => {
  it('on() 注册 hook', () => {
    const handler = async () => {};
    engine.on('beforeExecute', handler);
    assert.equal(engine.hooks.beforeExecute.length, 1);
  });

  it('on() 无效事件名忽略', () => {
    engine.on('invalidEvent', () => {});
    // 不抛出，hooks 不变
  });
});

// ==================== toPrompt ====================

describe('SkillEngine toPrompt()', () => {
  it('无技能返回空字符串', () => {
    assert.equal(engine.toPrompt(), '');
  });

  it('有技能返回 prompt 片段', () => {
    engine.register(makeSkill({
      id: 'summarize',
      name: '总结',
      description: '对内容进行总结',
      parameters: [
        { name: 'text', type: 'string', required: true, description: '待总结文本' },
      ],
    }));

    const prompt = engine.toPrompt();
    assert.ok(prompt.includes('你可以使用以下技能'));
    assert.ok(prompt.includes('summarize'));
    assert.ok(prompt.includes('对内容进行总结'));
    assert.ok(prompt.includes('text(string,必填)'));
    assert.ok(prompt.includes('[SKILL:'));
  });

  it('禁用技能不出现在 prompt 中', () => {
    engine.register(makeSkill({ enabled: false }));
    const prompt = engine.toPrompt();
    assert.equal(prompt, '');
  });
});
