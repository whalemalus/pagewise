/**
 * QA002-R3 — SkillEngine 功能正确性测试（第三轮）
 *
 * 覆盖重点：技能树链式调用、并发执行、参数验证、toPrompt 格式、hook 异常安全
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { SkillEngine } = await import('../lib/skill-engine.js');

let engine;

function makeSkill(overrides = {}) {
  return {
    id: 'test-skill',
    name: '测试技能',
    description: '一个测试技能',
    category: 'general',
    execute: async (params) => `result: ${JSON.stringify(params)}`,
    ...overrides,
  };
}

beforeEach(() => {
  engine = new SkillEngine();
});

// ==================== 注册边界 ====================

describe('QA002-R3 注册边界', () => {
  it('缺少 id 时 register 应抛出', () => {
    assert.throws(() => engine.register({ name: 'x', execute: async () => {} }), /must have id, name, and execute/);
  });

  it('缺少 name 时 register 应抛出', () => {
    assert.throws(() => engine.register({ id: 'x', execute: async () => {} }), /must have id, name, and execute/);
  });

  it('缺少 execute 时 register 应抛出', () => {
    assert.throws(() => engine.register({ id: 'x', name: 'y' }), /must have id, name, and execute/);
  });

  it('registerAll 中一个无效技能应阻止后续注册', () => {
    const skills = [
      makeSkill({ id: 'a', name: 'A' }),
      { id: 'bad' }, // 缺少 name 和 execute
      makeSkill({ id: 'c', name: 'C' }),
    ];
    // registerAll 用 forEach，遇到 bad 会抛出，c 不会注册
    assert.throws(() => engine.registerAll(skills));
    assert.equal(engine.skills.size, 1); // 只有 a
  });

  it('重新注册同 id 应覆盖（包括 execute 函数）', async () => {
    engine.register(makeSkill({ execute: async () => 'v1' }));
    engine.register(makeSkill({ execute: async () => 'v2' }));
    const result = await engine.execute('test-skill', {});
    assert.equal(result, 'v2');
  });
});

// ==================== 查询完整性 ====================

describe('QA002-R3 查询完整性', () => {
  beforeEach(() => {
    engine.registerAll([
      makeSkill({ id: 'a', name: 'A', category: 'code' }),
      makeSkill({ id: 'b', name: 'B', category: 'code' }),
      makeSkill({ id: 'c', name: 'C', category: 'learning' }),
      makeSkill({ id: 'd', name: 'D', category: 'code', enabled: false }),
    ]);
  });

  it('getAll 应包含禁用技能', () => {
    assert.equal(engine.getAll().length, 4);
  });

  it('getEnabled 不应包含禁用技能', () => {
    const enabled = engine.getEnabled();
    assert.equal(enabled.length, 3);
    assert.ok(!enabled.some(s => s.id === 'd'));
  });

  it('getByCategory("code") 应包含禁用的', () => {
    const codeSkills = engine.getByCategory('code');
    assert.equal(codeSkills.length, 3); // a, b, d（d 虽禁用但 category=code）
  });

  it('getByCategory("nonexistent") 应返回空', () => {
    assert.equal(engine.getByCategory('nonexistent').length, 0);
  });

  it('get 不存在的 id 返回 undefined', () => {
    assert.equal(engine.get('zzz'), undefined);
  });
});

// ==================== 触发匹配进阶 ====================

describe('QA002-R3 触发匹配进阶', () => {
  it('多个技能同时匹配应返回全部', () => {
    engine.register(makeSkill({ id: 's1', trigger: (ctx) => ctx.hasCode }));
    engine.register(makeSkill({ id: 's2', trigger: (ctx) => ctx.hasCode }));
    engine.register(makeSkill({ id: 's3', trigger: (ctx) => !ctx.hasCode }));

    const matched = engine.matchTriggers({ hasCode: true });
    assert.equal(matched.length, 2);
    assert.ok(matched.every(s => ['s1', 's2'].includes(s.id)));
  });

  it('trigger 返回 falsy 值（0, "", null）应不匹配', () => {
    engine.register(makeSkill({ id: 'falsy', trigger: () => 0 }));
    const matched = engine.matchTriggers({});
    assert.equal(matched.length, 0);
  });

  it('空 context 应安全运行', () => {
    engine.register(makeSkill({ trigger: (ctx) => ctx.foo.bar }));
    // ctx.foo 为 undefined，访问 .bar 会抛出 → matchTriggers 应安全跳过
    const matched = engine.matchTriggers({});
    assert.equal(matched.length, 0);
  });
});

// ==================== 执行进阶 ====================

describe('QA002-R3 执行进阶', () => {
  it('execute 应传递 context 给技能', async () => {
    let receivedCtx = null;
    engine.register(makeSkill({
      execute: async (params, context) => {
        receivedCtx = context;
        return 'ok';
      },
    }));

    const ctx = { pageUrl: 'https://example.com' };
    await engine.execute('test-skill', { text: 'hi' }, ctx);
    assert.deepEqual(receivedCtx, ctx);
  });

  it('多个 beforeExecute hooks 应按注册顺序执行', async () => {
    const log = [];
    engine.on('beforeExecute', async () => { log.push('before-1'); });
    engine.on('beforeExecute', async () => { log.push('before-2'); });
    engine.register(makeSkill({ execute: async () => 'ok' }));

    await engine.execute('test-skill', {});
    assert.deepEqual(log, ['before-1', 'before-2']);
  });

  it('多个 afterExecute hooks 应按注册顺序执行', async () => {
    const log = [];
    engine.on('afterExecute', async () => { log.push('after-1'); });
    engine.on('afterExecute', async () => { log.push('after-2'); });
    engine.register(makeSkill({ execute: async () => 'ok' }));

    await engine.execute('test-skill', {});
    assert.deepEqual(log, ['after-1', 'after-2']);
  });

  it('技能抛异常时不应执行 afterExecute', async () => {
    let afterCalled = false;
    engine.on('afterExecute', async () => { afterCalled = true; });
    engine.register(makeSkill({ execute: async () => { throw new Error('boom'); } }));

    await assert.rejects(() => engine.execute('test-skill', {}));
    assert.equal(afterCalled, false);
  });

  it('并发执行多个技能应各自返回正确结果', async () => {
    engine.register(makeSkill({ id: 'a', execute: async () => 'result-a' }));
    engine.register(makeSkill({ id: 'b', execute: async () => 'result-b' }));

    const [ra, rb] = await Promise.all([
      engine.execute('a', {}),
      engine.execute('b', {}),
    ]);
    assert.equal(ra, 'result-a');
    assert.equal(rb, 'result-b');
  });
});

// ==================== toPrompt 格式验证 ====================

describe('QA002-R3 toPrompt 格式验证', () => {
  it('禁用技能不出现在 prompt 中', () => {
    engine.register(makeSkill({ enabled: false }));
    assert.equal(engine.toPrompt(), '');
  });

  it('含参数的技能应列出参数信息', () => {
    engine.register(makeSkill({
      id: 'my-skill',
      name: '我的技能',
      description: '测试用',
      parameters: [
        { name: 'input', type: 'string', required: true, description: '输入文本' },
        { name: 'mode', type: 'enum', required: false, description: '模式' },
      ],
    }));
    const prompt = engine.toPrompt();
    assert.ok(prompt.includes('input(string,必填)'));
    assert.ok(prompt.includes('mode(enum,可选)'));
  });

  it('含空参数列表的技能不应生成参数行', () => {
    engine.register(makeSkill({
      id: 'no-params',
      name: '无参数',
      description: '没有参数',
      parameters: [],
    }));
    const prompt = engine.toPrompt();
    assert.ok(prompt.includes('no-params'));
    assert.ok(prompt.includes('没有参数'));
    assert.ok(!prompt.includes('参数：'));
  });

  it('prompt 末尾应包含 SKILL 调用格式说明', () => {
    engine.register(makeSkill());
    const prompt = engine.toPrompt();
    assert.ok(prompt.includes('[SKILL:'));
  });
});

// ==================== Hook 异常安全 ====================

describe('QA002-R3 Hook 异常安全', () => {
  it('on() 注册到不存在的事件应静默忽略', () => {
    engine.on('nonexistent', async () => {});
    // hooks 对象不变
    assert.equal(engine.hooks.nonexistent, undefined);
  });

  it('execute 前注册 hook 再注册技能不应冲突', async () => {
    const log = [];
    engine.on('beforeExecute', async (skill) => { log.push(skill.id); });
    engine.register(makeSkill({ execute: async () => 'ok' }));

    await engine.execute('test-skill', {});
    assert.deepEqual(log, ['test-skill']);
  });
});
