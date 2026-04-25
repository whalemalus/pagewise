/**
 * Built-in Skills - 内置技能集
 */

/**
 * 代码解释
 */
export const codeExplainSkill = {
  id: 'code-explain',
  name: '解释代码',
  description: '逐行解释代码的含义和作用',
  category: 'code',
  parameters: [
    { name: 'code', type: 'string', description: '要解释的代码', required: false }
  ],
  trigger: (ctx) => (ctx.codeBlocks?.length || 0) >= 1,
  async execute(params, context) {
    const code = params.code || params.pageContext?.codeBlocks?.[0]?.code || '';
    if (!code) return '没有找到代码';

    const response = await context.ai.chat([{
      role: 'user',
      content: `请逐行解释以下代码的含义和作用，使用中文回答：

\`\`\`
${code.slice(0, 5000)}
\`\`\`

要求：
1. 先给整体概述
2. 再逐段/逐行解释
3. 标注关键概念
4. 如有改进空间，给出建议`
    }], { maxTokens: 3000 });

    return response.content;
  }
};

/**
 * 代码审查
 */
export const codeReviewSkill = {
  id: 'code-review',
  name: '代码审查',
  description: '审查代码质量，发现潜在问题',
  category: 'code',
  parameters: [
    { name: 'code', type: 'string', description: '要审查的代码', required: false }
  ],
  trigger: (ctx) => (ctx.codeBlocks?.length || 0) >= 1,
  async execute(params, context) {
    const code = params.code || params.pageContext?.codeBlocks?.[0]?.code || '';
    if (!code) return '没有找到代码';

    const response = await context.ai.chat([{
      role: 'user',
      content: `请审查以下代码，从以下维度评估：

\`\`\`
${code.slice(0, 5000)}
\`\`\`

审查维度：
1. **安全性** - 是否有安全漏洞（XSS/注入/敏感信息泄露等）
2. **性能** - 是否有性能问题（N+1查询/内存泄漏/不必要的计算等）
3. **可读性** - 命名/结构/注释是否清晰
4. **健壮性** - 错误处理是否完善
5. **最佳实践** - 是否遵循语言/框架的最佳实践

对每个问题给出严重程度（高/中/低）和修复建议。`
    }], { maxTokens: 3000 });

    return response.content;
  }
};

/**
 * 错误诊断
 */
export const errorDiagnoseSkill = {
  id: 'error-diagnose',
  name: '错误诊断',
  description: '分析错误信息，给出修复方案',
  category: 'debug',
  parameters: [
    { name: 'error', type: 'string', description: '错误信息', required: false }
  ],
  trigger: (ctx) => {
    const text = (ctx.content || '').toLowerCase();
    return text.includes('error') || text.includes('exception') || text.includes('traceback');
  },
  async execute(params, context) {
    const errorText = params.error || '';
    const pageContent = params.pageContext?.content?.slice(0, 3000) || '';

    const response = await context.ai.chat([{
      role: 'user',
      content: `请诊断以下错误并给出修复方案：

${errorText || pageContent}

请按以下格式回答：
1. **错误类型** - 这是什么类型的错误
2. **根本原因** - 为什么会发生
3. **修复方案** - 具体怎么修（给出代码）
4. **预防措施** - 如何避免再次发生`
    }], { maxTokens: 3000 });

    return response.content;
  }
};

/**
 * API 文档摘要
 */
export const apiSummarizeSkill = {
  id: 'api-summarize',
  name: 'API 摘要',
  description: '从 API 文档中提取端点、参数、示例',
  category: 'doc',
  trigger: (ctx) => {
    const url = ctx.url || '';
    return url.includes('/api/') || url.includes('/docs/');
  },
  async execute(params, context) {
    const content = params.pageContext?.content?.slice(0, 6000) || '';

    const response = await context.ai.chat([{
      role: 'user',
      content: `请从以下 API 文档中提取关键信息：

${content}

请整理为：
1. **端点列表** - 方法、路径、用途
2. **通用参数** - 认证方式、分页、格式
3. **关键端点详情** - 参数、返回值、示例
4. **快速上手** - 最常用的一两个调用示例`
    }], { maxTokens: 3000 });

    return response.content;
  }
};

/**
 * 生成学习路径
 */
export const learningPathSkill = {
  id: 'learning-path',
  name: '学习路径',
  description: '基于当前内容生成学习路线图',
  category: 'learning',
  async execute(params, context) {
    const content = params.pageContext?.content?.slice(0, 3000) || '';
    const title = params.pageContext?.title || '';

    const response = await context.ai.chat([{
      role: 'user',
      content: `基于以下技术内容，生成一份学习路径：

标题：${title}
内容：${content}

请生成：
1. **前置知识** - 学这个之前需要会什么
2. **学习路线** - 从入门到精通的步骤（5-8步）
3. **每步资源** - 推荐的学习资源/关键词
4. **实践项目** - 每步可以做什么小项目练手
5. **预计时间** - 每步大概需要多久`
    }], { maxTokens: 3000 });

    return response.content;
  }
};

/**
 * 知识卡片生成
 */
export const flashcardSkill = {
  id: 'flashcard',
  name: '生成知识卡片',
  description: '将内容转化为问答式知识卡片，用于复习',
  category: 'learning',
  async execute(params, context) {
    const content = params.pageContext?.content?.slice(0, 3000) || '';

    const response = await context.ai.chat([{
      role: 'user',
      content: `将以下技术内容转化为知识卡片（Q&A 格式）：

${content}

要求：
1. 生成 5-10 张卡片
2. 每张卡片包含：问题 + 简洁答案
3. 覆盖核心概念和关键细节
4. 难度从基础到进阶
5. 用 JSON 格式返回：

[{"q": "问题", "a": "答案", "difficulty": "easy|medium|hard"}]`
    }], { maxTokens: 2000 });

    try {
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : response.content;
    } catch {
      return response.content;
    }
  }
};

/**
 * 导出为 Obsidian 格式
 */
export const exportObsidianSkill = {
  id: 'export-obsidian',
  name: '导出 Obsidian 笔记',
  description: '将当前内容整理为 Obsidian 兼容的 Markdown 笔记',
  category: 'export',
  async execute(params, context) {
    const content = params.pageContext?.content?.slice(0, 5000) || '';
    const title = params.pageContext?.title || '笔记';
    const url = params.pageContext?.url || '';

    const response = await context.ai.chat([{
      role: 'user',
      content: `将以下内容整理为 Obsidian 笔记格式：

标题：${title}
来源：${url}
内容：${content}

要求：
1. YAML frontmatter（tags, aliases, source）
2. 结构化标题层级
3. 关键概念用 [[双链]] 标注
4. 代码块保留语言标识
5. 末尾添加相关笔记链接建议`
    }], { maxTokens: 3000 });

    return response.content;
  }
};

/**
 * 所有内置技能
 */
export const allBuiltinSkills = [
  codeExplainSkill,
  codeReviewSkill,
  errorDiagnoseSkill,
  apiSummarizeSkill,
  learningPathSkill,
  flashcardSkill,
  exportObsidianSkill
];
