/**
 * AI Client - 统一支持 Claude / OpenAI / 兼容协议
 *
 * 协议由用户在设置中手动选择：
 *   - Claude 协议：Anthropic 官方 API
 *   - OpenAI 兼容协议：ChatGPT、DeepSeek、本地代理等
 */

export class AIClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.baseUrl = (options.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    this.model = options.model || 'claude-sonnet-4-6';
    this.maxTokens = options.maxTokens || 4096;

    // 协议由用户显式指定，不再自动猜测
    this.protocol = options.protocol || 'openai';
  }

  // ==================== 协议判断 ====================

  isClaude() {
    return this.protocol === 'claude';
  }

  isOpenAI() {
    return this.protocol === 'openai';
  }

  // ==================== 核心调用 ====================

  /**
   * 发送消息（非流式）
   */
  async chat(messages, options = {}) {
    const { url, headers, body } = this.buildRequest(messages, options);
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`API ${response.status}: ${error.error?.message || error.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  /**
   * 流式调用
   */
  async *chatStream(messages, options = {}) {
    const { url, headers, body } = this.buildRequest(messages, { ...options, stream: true });
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`API ${response.status}: ${error.error?.message || error.message || 'Unknown error'}`);
    }

    if (this.isClaude()) {
      yield* this.parseClaudeStream(response);
    } else {
      yield* this.parseOpenAIStream(response);
    }
  }

  // ==================== 请求构建 ====================

  buildRequest(messages, options = {}) {
    const systemPrompt = options.systemPrompt || this.getSystemPrompt();
    const model = options.model || this.model;
    const maxTokens = options.maxTokens || this.maxTokens;
    const stream = options.stream || false;

    if (this.isClaude()) {
      return this.buildClaudeRequest(messages, { systemPrompt, model, maxTokens, stream });
    } else {
      return this.buildOpenAIRequest(messages, { systemPrompt, model, maxTokens, stream });
    }
  }

  buildClaudeRequest(messages, { systemPrompt, model, maxTokens, stream }) {
    // 转换消息格式：处理 vision 内容
    const claudeMessages = messages.map(msg => {
      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map(part => {
            if (part.type === 'text') return { type: 'text', text: part.text };
            if (part.type === 'image_url') {
              return { type: 'image', source: { type: 'url', url: part.image_url.url } };
            }
            if (part.type === 'image') return part;
            return part;
          })
        };
      }
      return msg;
    });

    return {
      url: `${this.baseUrl}/v1/messages`,
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: {
        model,
        max_tokens: maxTokens,
        stream,
        system: systemPrompt,
        messages: claudeMessages
      }
    };
  }

  buildOpenAIRequest(messages, { systemPrompt, model, maxTokens, stream }) {
    // 转换消息格式：将 system prompt 放入 messages 数组头部
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(msg => {
        // 数组格式：可能是 vision 消息或 Claude 格式
        if (typeof msg.content === 'string') return msg;
        if (Array.isArray(msg.content)) {
          // 检测是否包含 vision 元素（image_url / image）
          const hasVision = msg.content.some(
            c => c.type === 'image_url' || c.type === 'image'
          );
          if (hasVision) {
            // 转换为 OpenAI vision 格式，直接保留
            return {
              ...msg,
              content: msg.content.map(c => {
                if (c.type === 'text') return { type: 'text', text: c.text };
                if (c.type === 'image_url') return c;
                if (c.type === 'image' && c.source?.url) {
                  return { type: 'image_url', image_url: { url: c.source.url } };
                }
                return c;
              })
            };
          }
          // 非 vision 数组，合并为字符串
          return { ...msg, content: msg.content.map(c => c.text || c.content || '').join('\n') };
        }
        return msg;
      })
    ];

    return {
      url: `${this.baseUrl}/v1/chat/completions`,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: {
        model,
        max_tokens: maxTokens,
        stream,
        messages: openaiMessages
      }
    };
  }

  // ==================== 响应解析 ====================

  parseResponse(data) {
    if (this.isClaude()) {
      return {
        content: data.content[0].text,
        usage: data.usage,
        model: data.model
      };
    } else {
      return {
        content: data.choices[0].message.content,
        usage: data.usage,
        model: data.model
      };
    }
  }

  // ==================== 流式解析 ====================

  async *parseClaudeStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta') {
            yield parsed.delta.text;
          }
        } catch (e) {
          // 跳过
        }
      }
    }
  }

  async *parseOpenAIStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch (e) {
          // 跳过
        }
      }
    }
  }

  // ==================== 模型发现 ====================

  /**
   * 获取可用模型列表
   * @returns {Promise<string[]>} 模型 ID 列表
   */
  async listModels() {
    if (this.isClaude()) {
      // Anthropic 没有 models endpoint，返回预设列表
      return [
        'claude-sonnet-4-6',
        'claude-opus-4-6',
        'claude-haiku-4-5'
      ];
    }

    // OpenAI 兼容协议：GET {baseUrl}/v1/models
    const url = `${this.baseUrl}/v1/models`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`获取模型列表失败: ${response.status}`);
    }

    const data = await response.json();
    const models = (data.data || [])
      .map(m => m.id)
      .filter(id => id && typeof id === 'string')
      .sort();
    return models;
  }

  // ==================== 测试连接 ====================

  /**
   * 测试 API 连接，返回 { success, model, error }
   */
  async testConnection() {
    try {
      const result = await this.chat([{
        role: 'user',
        content: 'Hi, reply with "OK" only.'
      }], {
        maxTokens: 10,
        systemPrompt: 'Reply with "OK" only.'
      });

      return {
        success: true,
        model: result.model,
        protocol: this.protocol === 'claude' ? 'Claude' : 'OpenAI',
        content: result.content.slice(0, 50)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        protocol: this.protocol === 'claude' ? 'Claude' : 'OpenAI'
      };
    }
  }

  // ==================== 业务方法 ====================

  async askAboutPage(pageContent, userQuestion, conversationHistory = []) {
    const messages = [
      ...conversationHistory,
      { role: 'user', content: this.buildPageQuestionPrompt(pageContent, userQuestion) }
    ];
    return this.chat(messages);
  }

  async *askAboutPageStream(pageContent, userQuestion, conversationHistory = []) {
    const messages = [
      ...conversationHistory,
      { role: 'user', content: this.buildPageQuestionPrompt(pageContent, userQuestion) }
    ];
    yield* this.chatStream(messages);
  }

  async generateSummaryAndTags(content) {
    const response = await this.chat([{
      role: 'user',
      content: `请为以下内容生成：
1. 一段简洁的摘要（2-3句话）
2. 3-5个相关标签（用于分类检索）

内容：
${content.slice(0, 3000)}

请以 JSON 格式返回：
{"summary": "...", "tags": ["tag1", "tag2", "tag3"]}`
    }], {
      maxTokens: 500,
      systemPrompt: '你是一个内容分析助手。只返回 JSON，不要其他文字。'
    });

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { summary: content.slice(0, 200), tags: ['未分类'] };
    }
  }

  buildPageQuestionPrompt(pageContent, question) {
    const content = pageContent?.content || '';
    const title = pageContent?.title || '未知页面';
    const url = pageContent?.url || '';
    const selection = pageContent?.selection || '';
    const codeBlocks = pageContent?.codeBlocks || [];
    const siteName = pageContent?.meta?.siteName;

    let prompt = '';

    if (selection) {
      prompt += `用户在页面中选中了以下文本：\n\n"${selection}"\n\n`;
    }

    if (content) {
      prompt += `当前浏览的网页信息：\n`;
      prompt += `- 标题：${title}\n`;
      prompt += `- 网址：${url}\n`;
      if (siteName) prompt += `- 来源：${siteName}\n`;
      prompt += `\n页面内容：\n${content.slice(0, 8000)}`;

      if (codeBlocks.length > 0) {
        prompt += `\n\n页面中的代码：\n`;
        codeBlocks.slice(0, 5).forEach((block) => {
          prompt += `\`\`\`${block.lang || 'text'}\n${(block.code || '').slice(0, 2000)}\n\`\`\`\n\n`;
        });
      }
    } else {
      prompt += `（未能获取到页面内容，请基于你的知识直接回答）\n`;
      if (title) prompt += `用户当前页面标题：${title}\n`;
    }

    prompt += `\n\n用户的问题：${question}\n\n`;
    prompt += `请给出清晰、有条理的解答。如果涉及代码，请给出具体示例。`;
    return prompt;
  }

  getSystemPrompt() {
    return `你是一个技术知识助手，帮助用户理解他们在浏览网页时遇到的技术内容。

你的职责：
1. 根据用户提供的网页内容，回答他们的技术问题
2. 用清晰、简洁的语言解释复杂概念
3. 如果涉及代码，给出具体示例和解释
4. 将关键知识点整理成结构化的形式，方便后续学习
5. 如果页面内容不足以回答问题，基于你的知识补充说明
6. 当用户需要深入分析代码、诊断错误、生成学习路径时，主动调用可用的技能（Skills）

回答风格：
- 条理清晰，使用标题和列表
- 关键术语给出解释
- 代码示例要有注释
- 适当类比帮助理解`;
  }
}

// ==================== Token 估算（独立函数，可按需 import） ====================

/**
 * 粗略估算文本的 token 数
 * 启发式：字符数 / 3（兼顾英文 ~4字符/token 和中文 ~1.5字符/token）
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 3);
}

/**
 * 估算消息数组的总 token 数（含 role 开销）
 * @param {Array<{role: string, content: string}>} messages
 * @returns {number}
 */
export function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const msg of messages) {
    // 每条消息有约 4 token 的固定开销（role、分隔符等）
    total += 4;
    const content = typeof msg.content === 'string' ? msg.content : '';
    total += estimateTokens(content);
  }
  return total;
}
