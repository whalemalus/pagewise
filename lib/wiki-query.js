/**
 * Wiki Query — L3.4 LLM Wiki 查询引擎
 *
 * 让用户对整个 Wiki 提问，而非对单个页面提问。
 * 核心能力：
 *   - 智能选择与问题最相关的 wiki 页面构建上下文
 *   - 构建 wiki 专用的系统提示词和用户消息
 *   - 从 AI 回答中提取引用的 wiki 页面
 *   - 判断回答是否值得归档回 wiki
 *
 * 设计原则：
 *   - 纯 ES Module，不依赖 IndexedDB 或 Chrome API
 *   - 与 WikiStore / AIClient 完全解耦
 *   - 纯函数：输入数据 → 输出结果，无副作用
 *
 * @module wiki-query
 */

// ==================== 常量 ====================

/** 默认查询选项 */
export const DEFAULT_QUERY_OPTIONS = {
  maxPages: 10,        // 最多选择的页面数
  maxTokens: 6000,     // 上下文最大 token 预算
  minScore: 0,         // 最低相关性分数
};

/** 页面类型中文标签 */
const PAGE_TYPE_DISPLAY = {
  entity: '实体',
  concept: '概念',
  qa: '知识',
};

/** 归档最低回答长度（字符数） */
const ARCHIVE_MIN_LENGTH = 100;

/** Token 估算：中文约 1.5 字符/token，英文约 4 字符/token，折中取 3 */
const CHARS_PER_TOKEN = 3;

// ==================== Token 估算 ====================

/**
 * 粗略估算文本 token 数
 *
 * @param {string} text - 文本
 * @returns {number} 估算 token 数
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ==================== 评分与选择 ====================

/**
 * 将问题分解为关键词
 *
 * @param {string} question - 用户问题
 * @returns {string[]} 关键词数组（已去停用词、小写化）
 */
export function extractKeywords(question) {
  if (!question || typeof question !== 'string') return [];

  // 中英文停用词
  const stopWords = new Set([
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
    '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
    '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '吗', '呢',
    '吧', '啊', '哦', '嗯', '哈', '呀', '哪', '怎么', '什么', '为什么',
    '如何', '哪些', '请', '能', '可以', '告诉', '介绍', '解释', '说明',
    '一下', '一些', '关于', '对', '与', '和', '或', '但', '而', '如果',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you',
    'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
    'she', 'her', 'hers', 'herself', 'its', 'itself', 'they', 'them',
    'their', 'theirs', 'themselves', 'about', 'up', 'down',
  ]);

  // 分词：中文逐字拆分 + 英文按空格/标点拆分
  const lower = question.toLowerCase();

  // 先提取英文单词（连续字母/数字）
  const englishWords = lower.match(/[a-z][a-z0-9]*/g) || [];

  // 再提取中文词（连续中文字符，>=2 字符才保留为有意义的词）
  const chineseChunks = lower.match(/[一-鿿]+/g) || [];
  const chineseWords = [];
  for (const chunk of chineseChunks) {
    // 2-4 字的连续中文作为关键词（覆盖大多数中文复合词）
    if (chunk.length >= 2 && chunk.length <= 4) {
      chineseWords.push(chunk);
    }
    // 超长中文文本，用滑动窗口提取 2-gram 和 3-gram
    if (chunk.length > 4) {
      for (let i = 0; i <= chunk.length - 2; i++) {
        chineseWords.push(chunk.slice(i, i + 2));
      }
      for (let i = 0; i <= chunk.length - 3; i++) {
        chineseWords.push(chunk.slice(i, i + 3));
      }
    }
  }

  const allTokens = [...englishWords, ...chineseWords];
  const filtered = allTokens.filter(t => t.length > 0 && !stopWords.has(t));

  return [...new Set(filtered)];
}

/**
 * 计算单个页面与问题的相关性分数
 *
 * 评分规则：
 *   - 标题完全匹配关键词: +10
 *   - 标题包含关键词: +5
 *   - 标签匹配关键词: +3
 *   - 内容包含关键词: +1
 *
 * @param {Object} page - Wiki 页面对象
 * @param {string[]} keywords - 问题关键词列表
 * @returns {number} 相关性分数
 */
export function scorePage(page, keywords) {
  if (!page || !Array.isArray(keywords) || keywords.length === 0) return 0;

  let score = 0;
  const titleLower = (page.title || '').toLowerCase();
  const contentLower = (page.content || '').toLowerCase();
  const tags = Array.isArray(page.tags) ? page.tags : [];

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();

    // 标题完全匹配
    if (titleLower === kw) {
      score += 10;
    }
    // 标题包含
    else if (titleLower.includes(kw)) {
      score += 5;
    }

    // 标签匹配
    for (const tag of tags) {
      if (tag && tag.toLowerCase().includes(kw)) {
        score += 3;
        break; // 每个关键词对每个页面只计算一次标签分数
      }
    }

    // 内容包含
    if (contentLower.includes(kw)) {
      score += 1;
    }
  }

  return score;
}

/**
 * 智能选择与问题最相关的 wiki 页面
 *
 * @param {Array<Object>} pages - Wiki 页面数组
 * @param {string} question - 用户问题
 * @param {Object} [options] - 选项
 * @param {number} [options.maxPages=10] - 最多选择的页面数
 * @param {number} [options.maxTokens=6000] - token 预算
 * @param {number} [options.minScore=0] - 最低相关性分数
 * @returns {Array<Object>} 排序后的相关页面列表
 */
export function selectRelevantPages(pages, question, options = {}) {
  const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };
  const { maxPages, maxTokens, minScore } = opts;

  if (!Array.isArray(pages) || pages.length === 0) return [];
  if (!question || typeof question !== 'string') return [];

  const keywords = extractKeywords(question);
  if (keywords.length === 0) {
    // 没有有效关键词时，返回前 maxPages 个页面
    return pages.slice(0, maxPages);
  }

  // 评分
  const scored = [];
  for (const page of pages) {
    if (!page || !page.id) continue;
    const s = scorePage(page, keywords);
    if (s > minScore) {
      scored.push({ page, score: s });
    }
  }

  // 按分数降序排序
  scored.sort((a, b) => b.score - a.score);

  // 限制页面数和 token 预算
  const selected = [];
  let totalTokens = 0;

  for (const { page } of scored) {
    if (selected.length >= maxPages) break;
    const pageTokens = estimateTokens(page.content || '');
    if (totalTokens + pageTokens > maxTokens && selected.length > 0) break;
    selected.push(page);
    totalTokens += pageTokens;
  }

  return selected;
}

// ==================== 上下文构建 ====================

/**
 * 将选中的页面构建为 LLM 可读的上下文文本
 *
 * 格式：
 * ```
 * ## [实体] React
 * 内容...
 *
 * ## [知识] Docker 入门
 * 内容...
 * ```
 *
 * @param {Array<Object>} selectedPages - 选中的页面列表
 * @param {Object} [options] - 选项
 * @param {number} [options.maxTokens=6000] - 总 token 预算
 * @param {Function} [options.formatter] - 自定义格式化器 (page) => string
 * @returns {string} 格式化后的上下文文本
 */
export function buildWikiContext(selectedPages, options = {}) {
  if (!Array.isArray(selectedPages) || selectedPages.length === 0) return '';

  const maxTokens = options.maxTokens || 6000;
  const formatter = options.formatter || defaultPageFormatter;

  const parts = [];
  let totalTokens = 0;

  for (const page of selectedPages) {
    if (!page) continue;

    let formatted = formatter(page);
    const partTokens = estimateTokens(formatted);

    // 如果单个页面超出剩余预算，截断
    if (totalTokens + partTokens > maxTokens) {
      const remainingChars = (maxTokens - totalTokens) * CHARS_PER_TOKEN;
      if (remainingChars <= 0) break;
      formatted = formatted.slice(0, Math.max(0, Math.floor(remainingChars))) + '\n...(已截断)';
    }

    parts.push(formatted);
    totalTokens += estimateTokens(formatted);

    if (totalTokens >= maxTokens) break;
  }

  return parts.join('\n\n');
}

/**
 * 默认页面格式化器
 *
 * @param {Object} page - Wiki 页面
 * @returns {string} 格式化后的文本
 */
function defaultPageFormatter(page) {
  const typeLabel = PAGE_TYPE_DISPLAY[page.type] || page.type || '页面';
  const title = page.title || '未命名';
  const content = page.content || '';

  return `## [${typeLabel}] ${title}\n${content}`;
}

// ==================== Prompt 构建 ====================

/**
 * 生成 Wiki 查询专用的系统提示词
 *
 * @returns {string} 系统提示词
 */
export function buildWikiSystemPrompt() {
  return `你是一个知识库助手，基于用户的个人 Wiki 知识库来回答问题。

你的职责：
1. 基于提供的 Wiki 页面内容回答用户问题，优先引用 Wiki 中已有的知识
2. 在回答中明确标注引用来源，使用格式：[来源: 页面标题]
3. 如果 Wiki 中没有相关信息，基于你的知识补充说明，并标注为「外部知识」
4. 将相关知识点进行归纳总结，帮助用户建立知识关联
5. 如果发现 Wiki 中存在可能过时或矛盾的知识，主动提醒用户

回答风格：
- 条理清晰，使用标题和列表
- 每个关键点标注来源
- 适当补充 Wiki 中没有的扩展知识`;
}

/**
 * 组装 Wiki 查询的完整用户消息
 *
 * @param {string} context - wiki 上下文文本
 * @param {string} question - 用户问题
 * @returns {string} 完整的用户消息
 */
export function buildWikiQuestionPrompt(context, question) {
  if (!question || typeof question !== 'string') return '';

  let prompt = '';

  if (context && typeof context === 'string' && context.trim()) {
    prompt += `以下是从 Wiki 知识库中检索到的相关页面：\n\n${context}\n\n`;
  } else {
    prompt += `（Wiki 知识库中没有找到与问题直接相关的页面）\n\n`;
  }

  prompt += `用户的问题：${question}\n\n`;
  prompt += `请基于以上 Wiki 知识回答。每引用一个知识点时标注来源。`;

  return prompt;
}

// ==================== 引用提取 ====================

/**
 * 从 AI 回答中提取引用的 wiki 页面
 *
 * 支持的引用格式：
 *   - [来源: 页面标题]
 *   - [来源: 页面标题](pageId)
 *   - （来源：页面标题）
 *
 * @param {string} response - AI 回答文本
 * @param {Map<string, Object>} pageMap - 页面 ID → 页面对象的映射
 * @returns {Array<Object>} 被引用的页面对象列表（去重）
 */
export function extractPageReferences(response, pageMap) {
  if (!response || typeof response !== 'string') return [];
  if (!pageMap || !(pageMap instanceof Map)) return [];

  const seen = new Set();
  const references = [];

  // 匹配 [来源: xxx] 或 [来源: xxx](yyy)
  const regex = /\[来源[:：]\s*([^\]\)]+)\](?:\(([^\)]+)\))?/g;
  let match;

  while ((match = regex.exec(response)) !== null) {
    const titleOrId = (match[2] || match[1] || '').trim();
    if (!titleOrId || seen.has(titleOrId)) continue;

    // 先按 ID 查找
    let page = pageMap.get(titleOrId);

    // 按标题查找
    if (!page) {
      for (const [id, p] of pageMap) {
        if (p.title && p.title.toLowerCase() === titleOrId.toLowerCase()) {
          page = p;
          break;
        }
      }
    }

    if (page) {
      seen.add(titleOrId);
      references.push(page);
    }
  }

  // 也匹配 （来源：xxx）
  const regex2 = /（来源[：:]\s*([^）]+)）/g;
  while ((match = regex2.exec(response)) !== null) {
    const titleOrId = (match[1] || '').trim();
    if (!titleOrId || seen.has(titleOrId)) continue;

    let page = pageMap.get(titleOrId);
    if (!page) {
      for (const [id, p] of pageMap) {
        if (p.title && p.title.toLowerCase() === titleOrId.toLowerCase()) {
          page = p;
          break;
        }
      }
    }

    if (page) {
      seen.add(titleOrId);
      references.push(page);
    }
  }

  return references;
}

// ==================== 归档判断 ====================

/**
 * 判断回答是否值得归档回 wiki
 *
 * 启发式规则：
 *   - 回答长度 >= 100 字符
 *   - 非空内容
 *
 * @param {string} question - 用户问题
 * @param {string} answer - AI 回答
 * @returns {boolean} 是否值得归档
 */
export function isAnswerWorthArchiving(question, answer) {
  if (!answer || typeof answer !== 'string') return false;
  const trimmed = answer.trim();
  if (trimmed.length < ARCHIVE_MIN_LENGTH) return false;
  // 排除错误消息
  if (trimmed.startsWith('⚠️') || trimmed.startsWith('❌')) return false;
  return true;
}

/**
 * 构建归档提示词
 *
 * 生成用于 AI 的提示词，让 AI 将问答对整理为 wiki 页面格式。
 *
 * @param {string} question - 用户问题
 * @param {string} answer - AI 回答
 * @returns {string} 归档提示词
 */
export function buildAnswerArchivePrompt(question, answer) {
  if (!question || !answer) return '';

  return `请将以下问答整理为知识库条目格式，返回 JSON：

问答内容：
问题：${question}
回答：${answer}

请返回如下 JSON 格式：
{
  "title": "简洁的标题（10字以内）",
  "question": "整理后的规范问题",
  "answer": "整理后的完整回答",
  "tags": ["相关标签1", "相关标签2"]
}

只返回 JSON，不要其他内容。`;
}

// ==================== WikiQueryEngine 类 ====================

/**
 * Wiki 查询引擎
 *
 * 封装完整的 Wiki 查询流程：
 *   1. 加载页面
 *   2. 智能选择相关页面
 *   3. 构建上下文
 *   4. 构建 prompt
 *   5. 提取引用
 *   6. 归档
 *
 * 使用方式：
 *   const engine = new WikiQueryEngine();
 *   const { context, systemPrompt, userPrompt, selectedPages } = engine.prepareQuery(pages, question);
 *   // 发送给 AI ...
 *   const refs = engine.extractReferences(response, pages);
 *   const archive = engine.prepareArchive(question, response);
 */
export class WikiQueryEngine {
  constructor(options = {}) {
    /** @type {Object} 查询选项 */
    this.options = { ...DEFAULT_QUERY_OPTIONS, ...options };
  }

  /**
   * 准备 Wiki 查询
   *
   * @param {Array<Object>} pages - 所有 wiki 页面
   * @param {string} question - 用户问题
   * @returns {Object} 查询准备结果
   */
  prepareQuery(pages, question) {
    const selectedPages = selectRelevantPages(pages, question, this.options);
    const context = buildWikiContext(selectedPages, { maxTokens: this.options.maxTokens });
    const systemPrompt = buildWikiSystemPrompt();
    const userPrompt = buildWikiQuestionPrompt(context, question);

    return {
      selectedPages,
      context,
      systemPrompt,
      userPrompt,
      stats: {
        totalPages: Array.isArray(pages) ? pages.length : 0,
        selectedCount: selectedPages.length,
        contextTokens: estimateTokens(context),
      },
    };
  }

  /**
   * 从 AI 回答中提取引用
   *
   * @param {string} response - AI 回答
   * @param {Array<Object>} pages - 所有 wiki 页面
   * @returns {Array<Object>} 被引用的页面
   */
  extractReferences(response, pages) {
    const pageMap = new Map();
    if (Array.isArray(pages)) {
      for (const page of pages) {
        if (page && page.id) pageMap.set(page.id, page);
      }
    }
    return extractPageReferences(response, pageMap);
  }

  /**
   * 准备归档
   *
   * @param {string} question - 用户问题
   * @param {string} answer - AI 回答
   * @returns {Object|null} 归档信息，不值得归档时返回 null
   */
  prepareArchive(question, answer) {
    if (!isAnswerWorthArchiving(question, answer)) return null;

    return {
      worthArchiving: true,
      archivePrompt: buildAnswerArchivePrompt(question, answer),
    };
  }
}
