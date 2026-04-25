/**
 * Skill Engine - 可扩展技能系统
 *
 * 借鉴 Claude Code 的 Skill 概念：
 * - 技能是可注册、可发现、可执行的能力单元
 * - 内置技能 + 用户自定义技能
 * - 技能可以被 AI 自动调用，也可以被用户手动触发
 */

export class SkillEngine {
  constructor() {
    this.skills = new Map();
    this.hooks = {
      beforeExecute: [],
      afterExecute: [],
      onError: []
    };
  }

  // ==================== 注册 ====================

  /**
   * 注册一个技能
   */
  register(skill) {
    if (!skill.id || !skill.name || !skill.execute) {
      throw new Error('Skill must have id, name, and execute()');
    }
    this.skills.set(skill.id, {
      id: skill.id,
      name: skill.name,
      description: skill.description || '',
      category: skill.category || 'general',
      trigger: skill.trigger || null,       // 自动触发条件
      parameters: skill.parameters || [],    // 参数定义
      execute: skill.execute,
      enabled: skill.enabled !== false
    });
  }

  /**
   * 批量注册
   */
  registerAll(skills) {
    skills.forEach(s => this.register(s));
  }

  // ==================== 查询 ====================

  get(id) {
    return this.skills.get(id);
  }

  getAll() {
    return [...this.skills.values()];
  }

  getEnabled() {
    return this.getAll().filter(s => s.enabled);
  }

  getByCategory(category) {
    return this.getAll().filter(s => s.category === category);
  }

  /**
   * 根据页面上下文自动匹配可触发的技能
   */
  matchTriggers(pageContext) {
    return this.getEnabled().filter(skill => {
      if (!skill.trigger) return false;
      try {
        return skill.trigger(pageContext);
      } catch {
        return false;
      }
    });
  }

  // ==================== 执行 ====================

  async execute(skillId, params, context) {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    if (!skill.enabled) throw new Error(`Skill disabled: ${skillId}`);

    // before hooks
    for (const hook of this.hooks.beforeExecute) {
      await hook(skill, params);
    }

    try {
      const result = await skill.execute(params, context);

      // after hooks
      for (const hook of this.hooks.afterExecute) {
        await hook(skill, params, result);
      }

      return result;
    } catch (error) {
      for (const hook of this.hooks.onError) {
        await hook(skill, params, error);
      }
      throw error;
    }
  }

  // ==================== Hooks ====================

  on(event, handler) {
    if (this.hooks[event]) {
      this.hooks[event].push(handler);
    }
  }

  // ==================== 生成给 AI 的技能描述 ====================

  /**
   * 生成技能列表的 prompt 片段，供 AI 决策调用
   */
  toPrompt() {
    const skills = this.getEnabled();
    if (skills.length === 0) return '';

    let prompt = '\n你可以使用以下技能（Skills）来辅助回答：\n\n';
    skills.forEach(skill => {
      prompt += `### ${skill.id}\n`;
      prompt += `${skill.description}\n`;
      if (skill.parameters.length > 0) {
        prompt += `参数：${skill.parameters.map(p => `${p.name}(${p.type}${p.required ? ',必填' : ',可选'}): ${p.description}`).join('；')}\n`;
      }
      prompt += '\n';
    });
    prompt += '要调用技能，请在回答中使用格式：`[SKILL:技能ID:参数JSON]`\n';
    return prompt;
  }
}
