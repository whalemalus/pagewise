/**
 * Evolution Engine - 自进化系统
 *
 * 通过隐式反馈信号驱动系统自动优化，无需用户显式评分。
 *
 * 核心信号：
 * - 用户复制了回答 → 回答质量高
 * - 用户保存到知识库 → 内容有价值
 * - 用户立即追问 → 上次回答不够好
 * - 用户重新提问同一问题 → 上次回答没解决
 * - 用户划词后提问 → 有明确意图
 * - 用户忽略推荐技能 → 技能不匹配
 *
 * 进化维度：
 * 1. 用户画像校准（技术水平、偏好深度）
 * 2. 检索权重调优（什么知识有用）
 * 3. Prompt 策略进化（什么风格有效）
 * 4. 技能模式发现（从行为中发现新模式）
 */

export class EvolutionEngine {
  constructor() {
    this.interactions = [];       // 交互记录
    this.signals = [];            // 信号记录
    this.strategies = {};         // 当前策略参数
    this.evolutionLog = [];       // 进化日志

    this.loadState();
  }

  // ==================== 初始化 ====================

  async loadState() {
    try {
      const data = await chrome.storage.local.get(['evolutionState']);
      if (data.evolutionState) {
        this.interactions = data.evolutionState.interactions || [];
        this.signals = data.evolutionState.signals || [];
        this.strategies = data.evolutionState.strategies || this.defaultStrategies();
        this.evolutionLog = data.evolutionState.evolutionLog || [];
      } else {
        this.strategies = this.defaultStrategies();
      }
    } catch {
      this.strategies = this.defaultStrategies();
    }
  }

  async saveState() {
    try {
      // 只保留最近 500 条交互和信号，防止膨胀
      const state = {
        interactions: this.interactions.slice(-500),
        signals: this.signals.slice(-500),
        strategies: this.strategies,
        evolutionLog: this.evolutionLog.slice(-100)
      };
      await chrome.storage.local.set({ evolutionState: state });
    } catch {}
  }

  defaultStrategies() {
    return {
      // 回答策略
      answerStyle: 'balanced',       // concise / balanced / detailed
      codeDetailLevel: 'medium',     // minimal / medium / verbose
      useAnalogies: true,
      useBulletPoints: true,

      // 检索策略
      retrievalTopK: 5,
      recencyWeight: 0.3,            // 时间衰减权重
      tagWeight: 0.4,                // 标签匹配权重
      titleWeight: 0.5,              // 标题匹配权重

      // Prompt 策略
      systemPromptVersion: 1,
      personalityTraits: [],          // 从交互中学到的性格偏好

      // 技能策略
      autoSkillThreshold: 0.7,       // 自动触发技能的置信度阈值

      // 统计
      totalInteractions: 0,
      successfulInteractions: 0,
      lastEvolution: null
    };
  }

  // ==================== 信号采集 ====================

  /**
   * 记录一次交互
   */
  recordInteraction(interaction) {
    const record = {
      id: Date.now().toString(36),
      timestamp: new Date().toISOString(),
      question: interaction.question,
      answerLength: interaction.answer?.length || 0,
      pageType: interaction.pageType || 'generic',
      pageUrl: interaction.pageUrl || '',
      skillsUsed: interaction.skillsUsed || [],
      retrievalHits: interaction.retrievalHits || 0,
      signals: [],
      ...interaction
    };

    this.interactions.push(record);
    this.strategies.totalInteractions++;
    return record.id;
  }

  /**
   * 记录显式信号（用户主动操作）
   */
  recordSignal(type, interactionId, data = {}) {
    const signal = {
      type,
      interactionId,
      timestamp: new Date().toISOString(),
      ...data
    };

    this.signals.push(signal);

    // 关联到交互记录
    const interaction = this.interactions.find(i => i.id === interactionId);
    if (interaction) {
      interaction.signals.push(type);
    }

    // 触发即时学习
    this.processSignal(signal);
  }

  /**
   * 记录隐式信号（自动检测）
   */
  detectImplicitSignals(interactionId, context) {
    const signals = [];

    // 信号1：回答后用户立即追问（可能上次没答好）
    if (context.followUpWithin30s) {
      signals.push('quick_followup');
    }

    // 信号2：用户重新问了类似问题
    if (context.repeatedQuestion) {
      signals.push('repeated_question');
    }

    // 信号3：回答很短但用户没追问（可能已经解决了）
    if (context.answerLength < 100 && !context.followUp) {
      signals.push('quick_resolution');
    }

    // 信号4：用户在回答中选中了文本（可能在提取关键信息）
    if (context.textSelectedAfterAnswer) {
      signals.push('text_selected');
    }

    signals.forEach(type => this.recordSignal(type, interactionId));
    return signals;
  }

  // ==================== 信号处理 ====================

  /**
   * 处理信号，即时调优
   */
  processSignal(signal) {
    switch (signal.type) {
      case 'copied':
        // 用户复制了回答 → 回答质量高，记录为成功模式
        this.onAnswerCopied(signal);
        break;

      case 'saved_to_kb':
        // 保存到知识库 → 内容有价值
        this.onSavedToKB(signal);
        break;

      case 'quick_followup':
        // 快速追问 → 可能需要更详细的回答
        this.onQuickFollowup(signal);
        break;

      case 'repeated_question':
        // 重复提问 → 上次回答不充分
        this.onRepeatedQuestion(signal);
        break;

      case 'skill_used':
        // 技能被使用 → 记录技能有效性
        this.onSkillUsed(signal);
        break;

      case 'skill_ignored':
        // 推荐的技能没被用 → 不匹配
        this.onSkillIgnored(signal);
        break;

      case 'positive_feedback':
        // 用户点赞/好评
        this.onPositiveFeedback(signal);
        break;

      case 'negative_feedback':
        // 用户点踩/纠正
        this.onNegativeFeedback(signal);
        break;
    }

    this.saveState();
  }

  // ==================== 即时学习 ====================

  onAnswerCopied(signal) {
    this.strategies.successfulInteractions++;

    // 找到对应的交互记录
    const interaction = this.interactions.find(i => i.id === signal.interactionId);
    if (!interaction) return;

    // 记录成功的回答模式
    const pattern = {
      pageType: interaction.pageType,
      answerLength: interaction.answerLength,
      style: this.strategies.answerStyle,
      timestamp: signal.timestamp
    };

    if (!this.strategies._successPatterns) this.strategies._successPatterns = [];
    this.strategies._successPatterns.push(pattern);
    this.strategies._successPatterns = this.strategies._successPatterns.slice(-50);
  }

  onSavedToKB(signal) {
    this.strategies.successfulInteractions++;

    // 用户认为有价值的内容，增加对应领域的检索权重
    const interaction = this.interactions.find(i => i.id === signal.interactionId);
    if (interaction?.pageUrl) {
      this.boostDomain(interaction.pageUrl);
    }
  }

  onQuickFollowup(signal) {
    // 可能需要更详细的回答
    const interaction = this.interactions.find(i => i.id === signal.interactionId);
    if (!interaction) return;

    // 如果回答很短，建议增加详细度
    if (interaction.answerLength < 500) {
      this.evolve('answer_detail', 'increased', '用户在短回答后追问');
    }
  }

  onRepeatedQuestion(signal) {
    // 重复提问，说明上次不充分
    this.evolve('retrieval_expand', 'wider', '用户重复提问，扩大检索范围');
  }

  onSkillUsed(signal) {
    // 记录技能使用成功
    if (!this.strategies._skillSuccess) this.strategies._skillSuccess = {};
    const skillId = signal.data?.skillId;
    if (skillId) {
      this.strategies._skillSuccess[skillId] = (this.strategies._skillSuccess[skillId] || 0) + 1;
    }
  }

  onSkillIgnored(signal) {
    // 推荐的技能没被用，降低该页面类型下该技能的推荐权重
    if (!this.strategies._skillIgnore) this.strategies._skillIgnore = {};
    const key = `${signal.data?.pageType}:${signal.data?.skillId}`;
    this.strategies._skillIgnore[key] = (this.strategies._skillIgnore[key] || 0) + 1;
  }

  onPositiveFeedback(signal) {
    this.strategies.successfulInteractions++;
    this.evolve('approach_confirmed', 'keep', '用户正面反馈');
  }

  onNegativeFeedback(signal) {
    // 用户纠正，记录避免模式
    const correction = signal.data?.correction || '';
    if (correction) {
      if (!this.strategies._avoidPatterns) this.strategies._avoidPatterns = [];
      this.strategies._avoidPatterns.push({
        correction,
        timestamp: signal.timestamp
      });
      this.strategies._avoidPatterns = this.strategies._avoidPatterns.slice(-30);
    }
  }

  // ==================== 进化执行 ====================

  /**
   * 执行一次进化
   */
  evolve(dimension, value, reason) {
    const entry = {
      dimension,
      value,
      reason,
      timestamp: new Date().toISOString(),
      previousValue: this.strategies[dimension]
    };

    this.evolutionLog.push(entry);
    this.strategies.lastEvolution = entry.timestamp;

    // 应用进化
    switch (dimension) {
      case 'answer_detail':
        this.strategies.answerStyle = value === 'increased' ? 'detailed' : 'concise';
        break;

      case 'answer_style':
        this.strategies.answerStyle = value;
        break;

      case 'code_detail':
        this.strategies.codeDetailLevel = value;
        break;

      case 'retrieval_expand':
        this.strategies.retrievalTopK = Math.min(10, this.strategies.retrievalTopK + 1);
        break;

      case 'retrieval_narrow':
        this.strategies.retrievalTopK = Math.max(3, this.strategies.retrievalTopK - 1);
        break;
    }
  }

  // ==================== 定期批量进化 ====================

  /**
   * 定期分析所有信号，批量进化
   * 每 20 次交互或每天运行一次
   */
  async batchEvolve() {
    const recentInteractions = this.interactions.slice(-50);
    if (recentInteractions.length < 10) return;

    const recentSignals = this.signals.slice(-100);

    // 分析1：回答风格偏好
    this.analyzeStylePreference(recentInteractions, recentSignals);

    // 分析2：检索效果
    this.analyzeRetrievalEffectiveness(recentInteractions, recentSignals);

    // 分析3：技能使用模式
    this.analyzeSkillPatterns(recentInteractions, recentSignals);

    // 分析4：技术水平推断
    this.analyzeUserLevel(recentInteractions);

    await this.saveState();

    this.evolutionLog.push({
      dimension: 'batch_evolve',
      value: `${recentInteractions.length} interactions analyzed`,
      reason: '定期批量进化',
      timestamp: new Date().toISOString()
    });
  }

  analyzeStylePreference(interactions, signals) {
    // 找到用户复制/保存过的交互
    const successfulIds = new Set(
      signals.filter(s => s.type === 'copied' || s.type === 'saved_to_kb')
        .map(s => s.interactionId)
    );

    const successful = interactions.filter(i => successfulIds.has(i.id));
    if (successful.length < 3) return;

    // 分析成功回答的特征
    const avgLength = successful.reduce((sum, i) => sum + i.answerLength, 0) / successful.length;

    if (avgLength > 1500) {
      this.evolve('answer_style', 'detailed', `成功回答平均长度 ${Math.round(avgLength)} 字，用户偏好详细回答`);
    } else if (avgLength < 300) {
      this.evolve('answer_style', 'concise', `成功回答平均长度 ${Math.round(avgLength)} 字，用户偏好简洁回答`);
    } else {
      this.evolve('answer_style', 'balanced', `成功回答平均长度 ${Math.round(avgLength)} 字，保持平衡`);
    }
  }

  analyzeRetrievalEffectiveness(interactions, signals) {
    // 如果有检索命中但用户仍然重复提问，说明检索不准
    const repeated = signals.filter(s => s.type === 'repeated_question');
    const withRetrieval = interactions.filter(i => i.retrievalHits > 0);

    if (repeated.length > 3 && withRetrieval.length > 5) {
      // 检索不准，扩大范围
      this.evolve('retrieval_expand', 'wider', `${repeated.length} 次重复提问，检索可能不准`);
    }
  }

  analyzeSkillPatterns(interactions, signals) {
    const skillSuccess = this.strategies._skillSuccess || {};
    const skillIgnore = this.strategies._skillIgnore || {};

    // 找出成功率低的技能
    for (const [skillId, ignoreCount] of Object.entries(skillIgnore)) {
      const successCount = skillSuccess[skillId] || 0;
      if (ignoreCount > successCount * 2) {
        // 该技能推荐过于频繁，提高阈值
        this.strategies.autoSkillThreshold = Math.min(0.9,
          this.strategies.autoSkillThreshold + 0.05
        );
      }
    }
  }

  analyzeUserLevel(interactions) {
    // 根据提问内容推断技术水平
    const questions = interactions.map(i => i.question).join(' ');

    const advancedTerms = ['架构', '设计模式', '源码', '原理', '底层', '性能优化',
      'architecture', 'pattern', 'internals', 'implementation'];
    const beginnerTerms = ['什么是', '怎么用', '入门', '教程', '基础', '新手',
      'what is', 'how to use', 'tutorial', 'beginner', 'getting started'];

    const advancedCount = advancedTerms.filter(t => questions.includes(t)).length;
    const beginnerCount = beginnerTerms.filter(t => questions.includes(t)).length;

    if (advancedCount > beginnerCount * 2) {
      this.strategies._inferredLevel = 'advanced';
    } else if (beginnerCount > advancedCount * 2) {
      this.strategies._inferredLevel = 'beginner';
    } else {
      this.strategies._inferredLevel = 'intermediate';
    }
  }

  // ==================== 策略输出 ====================

  /**
   * 获取当前策略的 prompt 片段
   */
  getStrategyPrompt() {
    let prompt = '';

    // 回答风格
    switch (this.strategies.answerStyle) {
      case 'concise':
        prompt += '\n回答要求：简洁精炼，直击要点，避免冗余。';
        break;
      case 'detailed':
        prompt += '\n回答要求：详细全面，给出完整解释和示例。';
        break;
      default:
        prompt += '\n回答要求：清晰有条理，平衡详细度。';
    }

    // 代码详细度
    switch (this.strategies.codeDetailLevel) {
      case 'minimal':
        prompt += '代码示例简短，只给关键部分。';
        break;
      case 'verbose':
        prompt += '代码示例完整，包含注释和错误处理。';
        break;
    }

    // 避免模式
    const avoids = this.strategies._avoidPatterns || [];
    if (avoids.length > 0) {
      const recent = avoids.slice(-5).map(a => a.correction).join('；');
      prompt += `\n避免：${recent}`;
    }

    // 推断的用户水平
    if (this.strategies._inferredLevel) {
      const levelMap = { beginner: '初学者', intermediate: '中级', advanced: '高级' };
      prompt += `\n用户水平：${levelMap[this.strategies._inferredLevel] || '中级'}`;
    }

    return prompt;
  }

  /**
   * 获取检索策略参数
   */
  getRetrievalConfig() {
    return {
      topK: this.strategies.retrievalTopK,
      recencyWeight: this.strategies.recencyWeight,
      tagWeight: this.strategies.tagWeight,
      titleWeight: this.strategies.titleWeight
    };
  }

  /**
   * 获取技能推荐阈值
   */
  getSkillThreshold() {
    return this.strategies.autoSkillThreshold;
  }

  // ==================== 辅助 ====================

  boostDomain(url) {
    try {
      const domain = new URL(url).hostname;
      if (!this.strategies._domainBoost) this.strategies._domainBoost = {};
      this.strategies._domainBoost[domain] = (this.strategies._domainBoost[domain] || 0) + 1;
    } catch {}
  }

  /**
   * 获取进化统计
   */
  getStats() {
    return {
      totalInteractions: this.strategies.totalInteractions,
      successfulInteractions: this.strategies.successfulInteractions,
      successRate: this.strategies.totalInteractions > 0
        ? Math.round(this.strategies.successfulInteractions / this.strategies.totalInteractions * 100)
        : 0,
      evolutionCount: this.evolutionLog.length,
      currentStyle: this.strategies.answerStyle,
      inferredLevel: this.strategies._inferredLevel || 'intermediate',
      lastEvolution: this.strategies.lastEvolution
    };
  }

  /**
   * 重置进化状态
   */
  async reset() {
    this.interactions = [];
    this.signals = [];
    this.strategies = this.defaultStrategies();
    this.evolutionLog = [];
    await this.saveState();
  }
}
