/**
 * Agent Loop - 自主规划执行引擎
 *
 * 借鉴 OpenCode / Claude Code 的 Agent 模式：
 * 1. 接收用户目标
 * 2. 分解为步骤
 * 3. 逐步执行（可调用技能、读取页面、查询知识库）
 * 4. 根据结果决定下一步
 * 5. 汇总输出
 */

export class AgentLoop {
  constructor({ aiClient, skillEngine, pageSense, memory, onStep, onMessage }) {
    this.ai = aiClient;
    this.skills = skillEngine;
    this.pageSense = pageSense;
    this.memory = memory;
    this.onStep = onStep || (() => {});
    this.onMessage = onMessage || (() => {});
    this.maxSteps = 10;
    this.running = false;
  }

  /**
   * 执行一个任务
   */
  async run(goal, pageContext) {
    this.running = true;
    const steps = [];
    const startTime = Date.now();

    try {
      // 1. 生成执行计划
      this.onStep({ type: 'planning', message: '正在分析任务...' });
      const plan = await this.plan(goal, pageContext);
      this.onStep({ type: 'plan', message: '执行计划', data: plan });

      // 2. 逐步执行
      for (let i = 0; i < Math.min(plan.steps.length, this.maxSteps); i++) {
        if (!this.running) break;

        const step = plan.steps[i];
        this.onStep({ type: 'executing', message: `步骤 ${i + 1}: ${step.action}`, data: step });

        const result = await this.executeStep(step, pageContext, steps);
        steps.push({ ...step, result, status: 'done' });

        this.onStep({ type: 'step-done', message: `完成: ${step.action}`, data: result });

        // 如果步骤失败，决定是否继续
        if (result.error && !step.optional) {
          this.onStep({ type: 'error', message: `步骤失败: ${result.error}` });
          break;
        }
      }

      // 3. 汇总结果
      this.onStep({ type: 'summarizing', message: '正在汇总...' });
      const summary = await this.summarize(goal, steps, pageContext);

      return {
        success: true,
        goal,
        steps,
        summary,
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        goal,
        steps,
        error: error.message,
        duration: Date.now() - startTime
      };
    } finally {
      this.running = false;
    }
  }

  stop() {
    this.running = false;
  }

  // ==================== 规划 ====================

  async plan(goal, pageContext) {
    // 从记忆中获取相关历史
    const memories = await this.memory?.recall(goal) || [];
    const memoryHint = memories.length > 0
      ? `\n相关历史记忆：\n${memories.map(m => `- ${m.content}`).join('\n')}`
      : '';

    // 获取可用技能
    const skillsPrompt = this.skills.toPrompt();

    const response = await this.ai.chat([{
      role: 'user',
      content: `你是一个任务规划器。根据用户的目标，分解为可执行的步骤。

用户目标：${goal}
${pageContext?.title ? `当前页面：${pageContext.title} (${pageContext.url})` : ''}
${memoryHint}

${skillsPrompt}

请以 JSON 格式返回执行计划：
{
  "analysis": "对任务的理解",
  "steps": [
    {
      "id": 1,
      "action": "步骤描述",
      "type": "skill|query|analyze|output",
      "skillId": "如果是调用技能，填技能ID",
      "params": {},
      "optional": false,
      "reason": "为什么需要这一步"
    }
  ]
}

规则：
- 步骤尽量少，3-7 步为宜
- 优先使用技能
- 最后一步应该是汇总输出
- 只返回 JSON`
    }], {
      maxTokens: 1500,
      systemPrompt: '你是任务规划器。只返回 JSON。'
    });

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch[0]);
    } catch {
      // 解析失败，回退到简单执行
      return {
        analysis: '直接回答',
        steps: [{ id: 1, action: '直接回答用户问题', type: 'analyze', optional: false }]
      };
    }
  }

  // ==================== 执行步骤 ====================

  async executeStep(step, pageContext, previousResults) {
    try {
      switch (step.type) {
        case 'skill':
          return await this.executeSkillStep(step, pageContext);

        case 'query':
          return await this.executeQueryStep(step, pageContext);

        case 'analyze':
          return await this.executeAnalyzeStep(step, pageContext, previousResults);

        case 'output':
          return { content: '准备输出' };

        default:
          return { content: `未知步骤类型: ${step.type}` };
      }
    } catch (error) {
      return { error: error.message };
    }
  }

  async executeSkillStep(step, pageContext) {
    const skillId = step.skillId;
    if (!this.skills.get(skillId)) {
      return { error: `技能 ${skillId} 不存在` };
    }

    const params = {
      ...step.params,
      pageContext
    };

    const result = await this.skills.execute(skillId, params, { ai: this.ai, memory: this.memory });
    return { skillId, content: result };
  }

  async executeQueryStep(step, pageContext) {
    // 查询知识库
    const results = await this.memory?.recall(step.action) || [];
    return { content: results.map(r => r.content).join('\n') || '无相关记录' };
  }

  async executeAnalyzeStep(step, pageContext, previousResults) {
    // 用 AI 分析
    const context = previousResults.map(r => r.result?.content || '').filter(Boolean).join('\n\n');

    const response = await this.ai.chat([{
      role: 'user',
      content: `分析以下内容，完成步骤：${step.action}

${context ? `前面步骤的结果：\n${context}\n\n` : ''}
${pageContext?.content ? `页面内容：\n${pageContext.content.slice(0, 4000)}` : ''}

请给出分析结果。`
    }], { maxTokens: 2000 });

    return { content: response.content };
  }

  // ==================== 汇总 ====================

  async summarize(goal, steps, pageContext) {
    const stepsSummary = steps
      .filter(s => s.result && !s.result.error)
      .map(s => `【${s.action}】\n${typeof s.result.content === 'string' ? s.result.content.slice(0, 500) : JSON.stringify(s.result.content)}`)
      .join('\n\n');

    const response = await this.ai.chat([{
      role: 'user',
      content: `根据以下执行结果，为用户汇总一份清晰的最终回答。

用户目标：${goal}

执行过程：
${stepsSummary}

请给出结构化的最终回答，包含关键发现和结论。`
    }], { maxTokens: 3000 });

    return response.content;
  }
}
