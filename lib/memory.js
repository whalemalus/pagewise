/**
 * Memory - 增强记忆系统
 *
 * 借鉴 Claude Code 的 Memory 概念：
 * - 用户记忆：偏好、知识水平、常用语言
 * - 反馈记忆：用户纠正过的行为
 * - 项目记忆：当前网站/项目的上下文
 * - 知识记忆：学到的技术知识点
 *
 * 在 KnowledgeBase 之上增加语义关联和自动学习
 */

import { KnowledgeBase } from './knowledge-base.js';

export class MemorySystem {
  constructor() {
    this.kb = new KnowledgeBase();
    this.userProfile = null;
    this.sessionContext = {};
  }

  async init() {
    await this.kb.init();
    await this.loadUserProfile();
  }

  // ==================== 用户画像 ====================

  async loadUserProfile() {
    try {
      const data = await chrome.storage.sync.get('userProfile');
      this.userProfile = data.userProfile || {
        level: 'intermediate',    // beginner / intermediate / advanced
        languages: [],            // 常用编程语言
        domains: [],              // 擅长领域
        preferences: {},          // 回答偏好
        interactions: 0           // 交互次数
      };
    } catch {
      this.userProfile = {
        level: 'intermediate',
        languages: [],
        domains: [],
        preferences: {},
        interactions: 0
      };
    }
  }

  async saveUserProfile() {
    await chrome.storage.sync.set({ userProfile: this.userProfile });
  }

  /**
   * 从用户交互中学习画像
   */
  async learnFromInteraction(question, answer, pageContext) {
    this.userProfile.interactions++;

    // 学习编程语言
    if (pageContext?.codeBlocks) {
      const langs = pageContext.codeBlocks.map(b => b.lang).filter(Boolean);
      langs.forEach(lang => {
        if (!this.userProfile.languages.includes(lang)) {
          this.userProfile.languages.push(lang);
        }
      });
    }

    // 学习领域
    if (pageContext?.url) {
      const domain = this.extractDomain(pageContext.url);
      if (domain && !this.userProfile.domains.includes(domain)) {
        this.userProfile.domains.push(domain);
        if (this.userProfile.domains.length > 20) {
          this.userProfile.domains.shift();
        }
      }
    }

    await this.saveUserProfile();
  }

  // ==================== 记忆回忆 ====================

  /**
   * 根据查询回忆相关记忆（增强版）
   * 三层检索：关键词匹配 → 语义重排 → AI 精排
   */
  async recall(query, aiClient = null) {
    const memories = [];

    // 1. 关键词初筛（快速，本地）
    const keywords = this.extractKeywords(query);
    const candidates = await this.keywordSearch(keywords);

    // 2. 相关性评分排序
    const scored = candidates.map(entry => ({
      entry,
      score: this.scoreRelevance(entry, keywords, query)
    })).sort((a, b) => b.score - a.score);

    const topEntries = scored.slice(0, 8).map(s => s.entry);

    // 3. AI 重排序（如果有 AI client，取 top5 做语义精排）
    let finalEntries = topEntries.slice(0, 5);
    if (aiClient && topEntries.length > 3) {
      try {
        finalEntries = await this.aiRerank(query, topEntries, aiClient);
      } catch {
        // AI 重排失败，用评分结果
      }
    }

    // 4. 构建记忆结果
    finalEntries.forEach(entry => {
      memories.push({
        type: 'knowledge',
        content: entry.summary || entry.answer?.slice(0, 200) || entry.content?.slice(0, 200),
        source: entry.sourceUrl,
        title: entry.title,
        tags: entry.tags
      });
    });

    // 5. 用户画像信息
    if (this.userProfile.languages.length > 0) {
      memories.push({
        type: 'user-profile',
        content: `用户常用语言：${this.userProfile.languages.join(', ')}`
      });
    }

    return memories;
  }

  /**
   * 从查询中提取关键词
   */
  extractKeywords(query) {
    // 中文分词（简单实现：按标点和空格分割，过滤停用词）
    const stopwords = new Set([
      '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
      '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
      '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些',
      '什么', '怎么', '如何', '为什么', '请', '帮', '帮我', '告诉', '下',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
      'at', 'by', 'from', 'as', 'into', 'about', 'like', 'through', 'this',
      'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'how', 'when',
      'where', 'why', 'please', 'help', 'tell', 'me'
    ]);

    // 提取英文单词和中文片段
    const tokens = query
      .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
      .split(/\s+/)
      .map(t => t.toLowerCase().trim())
      .filter(t => t.length >= 2 && !stopwords.has(t));

    // 保留原始查询作为整体匹配
    return [...new Set([...tokens, query.trim()])];
  }

  /**
   * 关键词搜索（加权匹配）
   */
  async keywordSearch(keywords) {
    const allEntries = await this.kb.getAllEntries(500);
    if (allEntries.length === 0) return [];

    const matched = new Set();

    for (const keyword of keywords) {
      const lower = keyword.toLowerCase();
      for (const entry of allEntries) {
        if (
          entry.title?.toLowerCase().includes(lower) ||
          entry.summary?.toLowerCase().includes(lower) ||
          entry.question?.toLowerCase().includes(lower) ||
          entry.answer?.toLowerCase().includes(lower) ||
          entry.tags?.some(t => t.toLowerCase().includes(lower))
        ) {
          matched.add(entry);
        }
      }
    }

    return [...matched];
  }

  /**
   * 计算条目与查询的相关性分数
   */
  scoreRelevance(entry, keywords, query) {
    let score = 0;
    const lowerQuery = query.toLowerCase();

    for (const kw of keywords) {
      const lower = kw.toLowerCase();

      // 标题匹配权重最高
      if (entry.title?.toLowerCase().includes(lower)) score += 5;

      // 标签匹配
      if (entry.tags?.some(t => t.toLowerCase().includes(lower))) score += 4;

      // 问题匹配
      if (entry.question?.toLowerCase().includes(lower)) score += 3;

      // 摘要匹配
      if (entry.summary?.toLowerCase().includes(lower)) score += 2;

      // 回答匹配
      if (entry.answer?.toLowerCase().includes(lower)) score += 1;
    }

    // 完整查询匹配加分
    if (entry.title?.toLowerCase().includes(lowerQuery)) score += 3;
    if (entry.question?.toLowerCase().includes(lowerQuery)) score += 2;

    // 时间衰减（越新越相关）
    const age = Date.now() - new Date(entry.createdAt).getTime();
    const dayAge = age / (1000 * 60 * 60 * 24);
    score *= Math.max(0.5, 1 - dayAge / 365);

    return score;
  }

  /**
   * AI 重排序：让 AI 从候选中选出最相关的
   */
  async aiRerank(query, candidates, aiClient) {
    const items = candidates.map((e, i) =>
      `[${i}] ${e.title} | ${e.summary || e.question || ''} | 标签: ${(e.tags || []).join(',')}`
    ).join('\n');

    const response = await aiClient.chat([{
      role: 'user',
      content: `从以下知识条目中，选出与用户问题最相关的 5 个，按相关性排序。

用户问题：${query}

候选条目：
${items}

只返回最相关的条目编号，用逗号分隔，如：0,3,1,5,2`
    }], {
      maxTokens: 50,
      systemPrompt: '只返回数字编号，用逗号分隔。'
    });

    try {
      const indices = response.content.match(/\d+/g)?.map(Number) || [];
      return indices
        .filter(i => i >= 0 && i < candidates.length)
        .slice(0, 5)
        .map(i => candidates[i]);
    } catch {
      return candidates.slice(0, 5);
    }
  }

  // ==================== 自动保存 ====================

  /**
   * 自动判断是否值得保存
   */
  async autoSaveIfWorth(question, answer, pageContext, aiClient) {
    // 规则1：答案足够长（有实质内容）
    if (answer.length < 100) return null;

    // 规则2：是技术内容
    const techKeywords = ['function', 'class', 'api', 'error', 'bug', 'code', 'debug',
      'config', 'install', 'deploy', 'database', 'algorithm', '框架', '函数', '配置'];
    const isTech = techKeywords.some(kw =>
      (question + answer).toLowerCase().includes(kw)
    );
    if (!isTech) return null;

    // 规则3：不在知识库中重复
    const existing = await this.kb.search(question.slice(0, 50));
    if (existing.length > 0) return null;

    // 值得保存，生成摘要和标签
    try {
      const { summary, tags } = await aiClient.generateSummaryAndTags(
        `问题：${question}\n回答：${answer.slice(0, 2000)}`
      );

      const entry = await this.kb.saveEntry({
        title: pageContext?.title || '自动保存',
        content: pageContext?.content?.slice(0, 3000) || '',
        summary,
        sourceUrl: pageContext?.url || '',
        sourceTitle: pageContext?.title || '',
        tags,
        category: tags[0] || '自动保存',
        question,
        answer: answer.slice(0, 5000)
      });

      return entry;
    } catch {
      return null;
    }
  }

  // ==================== 知识库透传 ====================

  async getAllEntries(limit) { return this.kb.getAllEntries(limit); }
  async getEntry(id) { return this.kb.getEntry(id); }
  async deleteEntry(id) { return this.kb.deleteEntry(id); }
  async getAllTags() { return this.kb.getAllTags(); }
  async exportMarkdown() { return this.kb.exportMarkdown(); }
  async exportJSON() { return this.kb.exportJSON(); }

  // ==================== 工具 ====================

  extractDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      const parts = hostname.split('.');
      return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    } catch {
      return null;
    }
  }

  /**
   * 生成给 AI 的记忆上下文 prompt
   */
  async toPrompt(query, aiClient = null) {
    const memories = await this.recall(query, aiClient);
    if (memories.length === 0) return '';

    let prompt = '\n相关记忆（来自你的知识库）：\n';
    memories.forEach(m => {
      prompt += `- [${m.type}] ${m.content}\n`;
    });

    if (this.userProfile.level) {
      prompt += `\n用户水平：${this.userProfile.level}`;
      if (this.userProfile.languages.length > 0) {
        prompt += `，常用语言：${this.userProfile.languages.join(', ')}`;
      }
      prompt += '\n';
    }

    return prompt;
  }
}
