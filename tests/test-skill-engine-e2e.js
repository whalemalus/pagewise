/**
 * R42: Skill Engine + Custom Skills E2E Tests
 *
 * 端到端验证技能系统的完整流程：
 * - 技能加载：从 IndexedDB 加载到 SkillEngine
 * - 技能执行：参数传递、模板渲染、hook 集成
 * - 自定义技能 CRUD：创建/读取/更新/删除 + 引擎同步
 * - 边界场景：容量上限、禁用执行、触发匹配
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js'

installIndexedDBMock()

import {
  saveSkill,
  getAllSkills,
  getSkillById,
  deleteSkill,
  toggleSkill,
  renderTemplate,
  extractTemplateVars,
} from '../lib/custom-skills.js'

const { SkillEngine } = await import('../lib/skill-engine.js')

let engine

const make = (overrides = {}) => ({
  id: 'e2e_skill',
  name: 'E2E Skill',
  description: 'An end-to-end test skill',
  prompt: 'Analyze {{topic}} in {{language}}',
  category: 'analysis',
  enabled: true,
  ...overrides,
})

/** 从 custom-skills 记录创建 SkillEngine 兼容的技能对象 */
function toEngineSkill(record) {
  return {
    id: record.id,
    name: record.name,
    description: record.description || '',
    category: record.category || 'custom',
    trigger: record.trigger || null,
    parameters: record.parameters || [],
    enabled: record.enabled !== false,
    execute: async (params, context) => {
      const prompt = renderTemplate(record.prompt, params)
      return { prompt, skillId: record.id }
    },
  }
}

beforeEach(() => {
  resetIndexedDBMock()
  engine = new SkillEngine()
})

afterEach(() => {
  resetIndexedDBMock()
})

// ==================== E2E: 完整加载 + 执行流程 ====================

describe('E2E: 技能加载 → 注册 → 执行', () => {
  it('从 IndexedDB 加载技能到 SkillEngine 并执行', async () => {
    // 1. 创建自定义技能
    await saveSkill(make({ id: 'load_exec', prompt: 'Summarize {{text}}' }))

    // 2. 从 IndexedDB 加载所有技能
    const stored = await getAllSkills()
    assert.equal(stored.length, 1)

    // 3. 转换并注册到引擎
    const engineSkills = stored.map(toEngineSkill)
    engine.registerAll(engineSkills)
    assert.equal(engine.skills.size, 1)

    // 4. 执行并验证参数传递
    const result = await engine.execute('load_exec', { text: 'hello world' })
    assert.equal(result.prompt, 'Summarize hello world')
    assert.equal(result.skillId, 'load_exec')
  })

  it('多技能批量加载 + 分别执行', async () => {
    await saveSkill(make({ id: 'skill_a', name: 'A', prompt: 'Do {{action}}' }))
    await saveSkill(make({ id: 'skill_b', name: 'B', prompt: 'Process {{data}}' }))
    await saveSkill(make({ id: 'skill_c', name: 'C', prompt: 'Review {{code}}' }))

    const stored = await getAllSkills()
    assert.equal(stored.length, 3)

    engine.registerAll(stored.map(toEngineSkill))
    assert.equal(engine.skills.size, 3)

    const r1 = await engine.execute('skill_a', { action: 'analyze' })
    assert.equal(r1.prompt, 'Do analyze')

    const r2 = await engine.execute('skill_b', { data: 'test.csv' })
    assert.equal(r2.prompt, 'Process test.csv')

    const r3 = await engine.execute('skill_c', { code: 'fn main() {}' })
    assert.equal(r3.prompt, 'Review fn main() {}')
  })
})

// ==================== E2E: CRUD + 引擎同步 ====================

describe('E2E: CRUD 生命周期 + 引擎同步', () => {
  it('创建 → 更新 → 重新加载 → 执行更新版本', async () => {
    // 创建 v1
    await saveSkill(make({ id: 'crud_test', prompt: 'V1: {{input}}' }))
    let stored = await getAllSkills()
    engine.registerAll(stored.map(toEngineSkill))
    let r = await engine.execute('crud_test', { input: 'test' })
    assert.equal(r.prompt, 'V1: test')

    // 更新为 v2 (同 id 覆盖)
    await saveSkill(make({ id: 'crud_test', prompt: 'V2: {{input}} improved' }))
    stored = await getAllSkills()
    // 重新创建引擎并加载
    engine = new SkillEngine()
    engine.registerAll(stored.map(toEngineSkill))
    r = await engine.execute('crud_test', { input: 'test' })
    assert.equal(r.prompt, 'V2: test improved')
  })

  it('删除技能后引擎中不再可用', async () => {
    await saveSkill(make({ id: 'to_delete' }))
    let stored = await getAllSkills()
    engine.registerAll(stored.map(toEngineSkill))
    assert.ok(engine.get('to_delete'))

    // 删除
    await deleteSkill('to_delete')
    stored = await getAllSkills()
    assert.equal(stored.length, 0)

    // 引擎需要重新加载（模拟实际使用场景）
    engine = new SkillEngine()
    engine.registerAll(stored.map(toEngineSkill))
    assert.equal(engine.get('to_delete'), undefined)
  })

  it('禁用技能 → 引擎拒绝执行 → 重新启用 → 执行成功', async () => {
    await saveSkill(make({ id: 'toggle_test', prompt: 'Run {{cmd}}' }))
    let stored = await getAllSkills()
    engine.registerAll(stored.map(toEngineSkill))

    // 初始可执行
    await engine.execute('toggle_test', { cmd: 'ls' })

    // 禁用
    await toggleSkill('toggle_test')
    stored = await getAllSkills()
    engine = new SkillEngine()
    engine.registerAll(stored.map(toEngineSkill))

    await assert.rejects(
      () => engine.execute('toggle_test', { cmd: 'ls' }),
      /Skill disabled/
    )

    // 重新启用
    await toggleSkill('toggle_test')
    stored = await getAllSkills()
    engine = new SkillEngine()
    engine.registerAll(stored.map(toEngineSkill))

    const r = await engine.execute('toggle_test', { cmd: 'ls' })
    assert.equal(r.prompt, 'Run ls')
  })
})

// ==================== E2E: 参数传递 + 模板渲染 ====================

describe('E2E: 参数传递 + 模板渲染', () => {
  it('单参数模板替换', async () => {
    await saveSkill(make({ id: 'single_param', prompt: 'Translate {{text}}' }))
    const stored = await getAllSkills()
    engine.registerAll(stored.map(toEngineSkill))

    const r = await engine.execute('single_param', { text: 'Hello' })
    assert.equal(r.prompt, 'Translate Hello')
  })

  it('多参数模板替换', async () => {
    await saveSkill(make({
      id: 'multi_param',
      prompt: '{{action}} {{target}} in {{format}} format',
    }))
    const stored = await getAllSkills()
    engine.registerAll(stored.map(toEngineSkill))

    const r = await engine.execute('multi_param', {
      action: 'Convert',
      target: 'data',
      format: 'JSON',
    })
    assert.equal(r.prompt, 'Convert data in JSON format')
  })

  it('缺失参数保留占位符', async () => {
    await saveSkill(make({ id: 'missing_param', prompt: 'Hello {{name}}, welcome to {{place}}' }))
    const stored = await getAllSkills()
    engine.registerAll(stored.map(toEngineSkill))

    const r = await engine.execute('missing_param', { name: 'Alice' })
    assert.equal(r.prompt, 'Hello Alice, welcome to {{place}}')
  })

  it('空参数对象返回原始模板', async () => {
    await saveSkill(make({ id: 'no_params', prompt: 'Static prompt here' }))
    const stored = await getAllSkills()
    engine.registerAll(stored.map(toEngineSkill))

    const r = await engine.execute('no_params', {})
    assert.equal(r.prompt, 'Static prompt here')
  })

  it('带参数定义的技能 — 通过 toEngineSkill 注入参数元数据', async () => {
    // saveSkill 不保存 parameters 字段（IndexedDB 只存核心字段）
    // 实际使用中，参数元数据通过 toEngineSkill 桥接层注入
    await saveSkill(make({
      id: 'with_meta',
      prompt: 'Analyze {{code}}',
    }))
    const stored = await getAllSkills()

    // 桥接层注入参数定义
    const engineSkills = stored.map(r => ({
      ...toEngineSkill(r),
      parameters: [
        { name: 'code', type: 'string', required: true, description: '源代码' },
      ],
    }))
    engine.registerAll(engineSkills)

    const skill = engine.get('with_meta')
    assert.equal(skill.parameters.length, 1)
    assert.equal(skill.parameters[0].name, 'code')
    assert.equal(skill.parameters[0].required, true)

    // toPrompt 包含参数描述
    const prompt = engine.toPrompt()
    assert.ok(prompt.includes('code(string,必填)'))
    assert.ok(prompt.includes('源代码'))
  })
})

// ==================== E2E: 触发匹配 + 执行 ====================

describe('E2E: 触发匹配 + 执行', () => {
  it('自定义技能带 trigger 条件 → 匹配后执行', async () => {
    // 保存技能时附带 trigger（通过 toEngineSkill 转换）
    await saveSkill(make({
      id: 'code_skill',
      prompt: 'Review {{code}}',
      trigger: { type: 'auto' }, // 存储标记
    }))

    const stored = await getAllSkills()
    // 手动添加 trigger 函数（实际使用中由上层注入）
    const engineSkills = stored.map(r => ({
      ...toEngineSkill(r),
      trigger: (ctx) => ctx.hasCode === true,
    }))
    engine.registerAll(engineSkills)

    // 匹配上下文
    const matched = engine.matchTriggers({ hasCode: true })
    assert.equal(matched.length, 1)
    assert.equal(matched[0].id, 'code_skill')

    // 执行匹配到的技能
    const r = await engine.execute(matched[0].id, { code: 'console.log("hi")' })
    assert.equal(r.prompt, 'Review console.log("hi")')
  })

  it('多个技能触发条件不同 → 按上下文匹配不同技能', async () => {
    await saveSkill(make({ id: 'web_skill', prompt: 'Web {{url}}' }))
    await saveSkill(make({ id: 'code_skill2', prompt: 'Code {{snippet}}' }))
    await saveSkill(make({ id: 'data_skill', prompt: 'Data {{csv}}' }))

    const stored = await getAllSkills()
    const triggerMap = {
      web_skill: (ctx) => ctx.type === 'web',
      code_skill2: (ctx) => ctx.type === 'code',
      data_skill: (ctx) => ctx.type === 'data',
    }
    const engineSkills = stored.map(r => ({
      ...toEngineSkill(r),
      trigger: triggerMap[r.id] || null,
    }))
    engine.registerAll(engineSkills)

    // Web 上下文只匹配 web_skill
    let matched = engine.matchTriggers({ type: 'web' })
    assert.equal(matched.length, 1)
    assert.equal(matched[0].id, 'web_skill')

    // Code 上下文只匹配 code_skill2
    matched = engine.matchTriggers({ type: 'code' })
    assert.equal(matched.length, 1)
    assert.equal(matched[0].id, 'code_skill2')

    // 无匹配上下文
    matched = engine.matchTriggers({ type: 'unknown' })
    assert.equal(matched.length, 0)
  })
})

// ==================== E2E: 容量上限 ====================

describe('E2E: 容量上限 (MAX_SKILLS=20)', () => {
  it('创建 20 个技能后第 21 个抛出错误', async () => {
    for (let i = 0; i < 20; i++) {
      await saveSkill(make({
        id: `limit_skill_${i}`,
        name: `Skill ${i}`,
        prompt: `Task {{input}} #${i}`,
      }))
    }

    const all = await getAllSkills()
    assert.equal(all.length, 20)

    // 第 21 个应失败
    await assert.rejects(
      () => saveSkill(make({ id: 'over_limit', name: 'Over', prompt: 'fail' })),
      /上限/
    )
  })

  it('删除一个后可以再创建新的', async () => {
    for (let i = 0; i < 20; i++) {
      await saveSkill(make({ id: `del_limit_${i}`, name: `S${i}`, prompt: 'p' }))
    }

    await deleteSkill('del_limit_5')
    const all = await getAllSkills()
    assert.equal(all.length, 19)

    // 现在可以再创建
    const saved = await saveSkill(make({ id: 'after_delete', name: 'New', prompt: 'ok' }))
    assert.equal(saved.id, 'after_delete')
  })
})

// ==================== E2E: Hook 集成 ====================

describe('E2E: Hook 集成', () => {
  it('beforeExecute + afterExecute hooks 记录自定义技能执行', async () => {
    await saveSkill(make({ id: 'hook_skill', prompt: 'Do {{task}}' }))
    const stored = await getAllSkills()
    engine.registerAll(stored.map(toEngineSkill))

    const log = []
    engine.on('beforeExecute', async (skill, params) => {
      log.push({ event: 'before', skill: skill.id, params })
    })
    engine.on('afterExecute', async (skill, params, result) => {
      log.push({ event: 'after', skill: skill.id, result })
    })

    await engine.execute('hook_skill', { task: 'review' })

    assert.equal(log.length, 2)
    assert.equal(log[0].event, 'before')
    assert.equal(log[0].skill, 'hook_skill')
    assert.equal(log[1].event, 'after')
    assert.equal(log[1].result.prompt, 'Do review')
  })

  it('onError hook 在自定义技能执行失败时触发', async () => {
    // 创建一个会失败的技能
    const failSkill = {
      id: 'fail_skill',
      name: 'Failing Skill',
      description: 'Always fails',
      category: 'test',
      parameters: [],
      enabled: true,
      execute: async () => { throw new Error('技能执行崩溃') },
    }
    engine.register(failSkill)

    let caughtError = null
    engine.on('onError', async (skill, params, error) => {
      caughtError = error
    })

    await assert.rejects(
      () => engine.execute('fail_skill', {}),
      /技能执行崩溃/
    )
    assert.ok(caughtError)
    assert.equal(caughtError.message, '技能执行崩溃')
  })
})

// ==================== E2E: 分类 + 批量操作 ====================

describe('E2E: 分类 + 批量操作', () => {
  it('按分类筛选后批量注册', async () => {
    await saveSkill(make({ id: 'cat_a1', category: 'analysis', prompt: 'A1' }))
    await saveSkill(make({ id: 'cat_a2', category: 'analysis', prompt: 'A2' }))
    await saveSkill(make({ id: 'cat_c1', category: 'coding', prompt: 'C1' }))

    const stored = await getAllSkills()
    // 只注册 analysis 分类
    const analysisSkills = stored
      .filter(s => s.category === 'analysis')
      .map(toEngineSkill)
    engine.registerAll(analysisSkills)

    assert.equal(engine.skills.size, 2)
    assert.equal(engine.getByCategory('analysis').length, 2)
    assert.equal(engine.getByCategory('coding').length, 0)
  })

  it('toPrompt 只包含已注册的启用技能', async () => {
    await saveSkill(make({ id: 'prompt_a', name: 'Skill A', prompt: 'PA', description: 'Desc A' }))
    await saveSkill(make({ id: 'prompt_b', name: 'Skill B', prompt: 'PB', description: 'Desc B', enabled: false }))

    const stored = await getAllSkills()
    engine.registerAll(stored.map(toEngineSkill))

    const prompt = engine.toPrompt()
    assert.ok(prompt.includes('prompt_a'))
    assert.ok(!prompt.includes('prompt_b')) // 禁用的不出现
  })
})

// ==================== E2E: 错误处理 ====================

describe('E2E: 错误处理', () => {
  it('执行不存在的技能', async () => {
    await assert.rejects(
      () => engine.execute('nonexistent', {}),
      /Skill not found/
    )
  })

  it('空 store 加载后引擎无技能', async () => {
    const stored = await getAllSkills()
    assert.deepEqual(stored, [])
    engine.registerAll(stored.map(toEngineSkill))
    assert.equal(engine.skills.size, 0)
    assert.equal(engine.toPrompt(), '')
  })

  it('保存无效技能（缺少 name）抛出错误', async () => {
    await assert.rejects(
      () => saveSkill({ id: 'no_name', prompt: 'test' }),
      /必须包含 name 和 prompt/
    )
  })

  it('保存无效技能（缺少 prompt）抛出错误', async () => {
    await assert.rejects(
      () => saveSkill({ id: 'no_prompt', name: 'Test' }),
      /必须包含 name 和 prompt/
    )
  })

  it('toggle 不存在的技能抛出错误', async () => {
    await assert.rejects(
      () => toggleSkill('ghost_skill'),
      /技能不存在/
    )
  })
})
