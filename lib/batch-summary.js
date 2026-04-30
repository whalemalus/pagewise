/**
 * Batch Summary — 批量摘要引擎（迭代 #13）
 *
 * 将长文自动分段，生成结构化摘要，提高高密度阅读效率
 *
 * 核心流程：分段 → 压缩 → AI 摘要 → 解析 → 结构化输出
 */

// ==================== 分段 ====================

/**
 * 将内容分段
 * @param {string} content - 原始内容
 * @param {Object} [options] - 分段选项
 * @param {'heading'|'paragraph'|'fixed'} [options.strategy='heading'] - 分段策略
 * @param {number} [options.maxSectionChars=3000] - 每段最大字符数
 * @param {number} [options.minSectionChars=50] - 每段最小字符数（短于此的段会被合并）
 * @returns {Array<{id: number, title: string, content: string, level: number, charCount: number}>}
 */
export function splitIntoSections(content, options = {}) {
  if (!content || typeof content !== "string") return [];

  const {
    strategy = "heading",
    maxSectionChars = 3000,
    minSectionChars = 50
  } = options;

  let sections;

  switch (strategy) {
    case "heading":
      sections = _splitByHeading(content, maxSectionChars);
      break;
    case "paragraph":
      sections = _splitByParagraph(content, maxSectionChars);
      break;
    case "fixed":
      sections = _splitByFixed(content, maxSectionChars);
      break;
    default:
      sections = _splitByHeading(content, maxSectionChars);
  }

  // 合并过短段落
  sections = _mergeShortSections(sections, minSectionChars);

  // 截断过长段落
  sections = sections.map(s => {
    if (s.content.length > maxSectionChars) {
      const truncated = s.content.slice(0, maxSectionChars - 20) + "\n\n[内容已截取…]";
      return { ...s, content: truncated, charCount: truncated.length };
    }
    return s;
  });

  // 重新分配 id
  return sections.map((s, i) => ({ ...s, id: i }));
}

/**
 * 按 Markdown / HTML 标题分段
 * @private
 */
function _splitByHeading(content, maxChars) {
  const lines = content.split("\n");
  const sections = [];
  let currentTitle = "(无标题)";
  let currentLevel = 1;
  let currentLines = [];

  for (const line of lines) {
    // Markdown heading: # Title / ## Title / ### Title
    const mdMatch = line.match(/^(#{1,3})\s+(.+)/);
    // HTML heading: <h1>...</h1> / <h2>...</h2> / <h3>...</h3>
    const htmlMatch = line.match(/^<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/i);

    if (mdMatch || htmlMatch) {
      // 如果已有内容，保存当前段
      if (currentLines.length > 0) {
        const text = currentLines.join("\n").trim();
        if (text.length > 0) {
          sections.push({
            id: sections.length,
            title: currentTitle,
            content: text,
            level: currentLevel,
            charCount: text.length
          });
        }
      }
      // 开始新段
      if (mdMatch) {
        currentLevel = mdMatch[1].length;
        currentTitle = mdMatch[2].trim();
      } else {
        currentLevel = parseInt(htmlMatch[1], 10);
        currentTitle = htmlMatch[2].replace(/<[^>]+>/g, "").trim();
      }
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // 保存最后一段
  if (currentLines.length > 0) {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      sections.push({
        id: sections.length,
        title: currentTitle,
        content: text,
        level: currentLevel,
        charCount: text.length
      });
    }
  }

  // 如果完全没有标题，整个内容作为一段
  if (sections.length === 0 && content.trim().length > 0) {
    const text = content.trim();
    sections.push({
      id: 0,
      title: "(无标题)",
      content: text,
      level: 0,
      charCount: text.length
    });
  }

  return sections;
}

/**
 * 按双换行分段
 * @private
 */
function _splitByParagraph(content, maxChars) {
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  return paragraphs.map((p, i) => {
    const text = p.trim();
    return {
      id: i,
      title: "段落 " + (i + 1),
      content: text,
      level: 0,
      charCount: text.length
    };
  });
}

/**
 * 按固定字符数分段
 * @private
 */
function _splitByFixed(content, maxChars) {
  const sections = [];
  let offset = 0;
  let idx = 0;

  while (offset < content.length) {
    let end = Math.min(offset + maxChars, content.length);
    // 尝试在标点或空格处断开
    if (end < content.length) {
      const breakChars = "\u3002\uff01\uff1f.!?\n\uff1b;\uff0c, ";
      for (let i = end; i > offset + maxChars * 0.5; i--) {
        if (breakChars.includes(content[i])) {
          end = i + 1;
          break;
        }
      }
    }
    const text = content.slice(offset, end).trim();
    if (text.length > 0) {
      sections.push({
        id: idx++,
        title: "段 " + (idx),
        content: text,
        level: 0,
        charCount: text.length
      });
    }
    offset = end;
  }

  return sections;
}

/**
 * 合并过短的段落到相邻段
 * @private
 */
function _mergeShortSections(sections, minChars) {
  if (sections.length <= 1) return sections;

  const merged = [];
  for (let i = 0; i < sections.length; i++) {
    const current = sections[i];
    if (current.charCount < minChars && merged.length > 0) {
      // 合并到前一段
      const prev = merged[merged.length - 1];
      const combined = prev.content + "\n\n" + current.content;
      merged[merged.length - 1] = {
        ...prev,
        content: combined,
        charCount: combined.length
      };
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

// ==================== 压缩 ====================

/**
 * 智能压缩段落，使总字符数不超过 maxTotalChars
 * 按比例截取各段，保留首尾，每段至少保留 100 字符
 * @param {Array} sections - 段落数组
 * @param {number} maxTotalChars - 最大总字符数
 * @returns {Array} 压缩后的段落数组
 */
export function compressSections(sections, maxTotalChars) {
  if (!sections || !Array.isArray(sections) || sections.length === 0) return [];

  const totalChars = sections.reduce((sum, s) => sum + s.charCount, 0);

  // 未超限，不需要压缩
  if (totalChars <= maxTotalChars) return sections.map(s => ({ ...s }));

  const minPerSection = 100;
  const budget = Math.max(maxTotalChars, sections.length * minPerSection);
  const ratio = budget / totalChars;

  return sections.map(s => {
    if (s.charCount <= minPerSection) return { ...s };

    const targetLen = Math.max(minPerSection, Math.floor(s.charCount * ratio));
    if (targetLen >= s.charCount) return { ...s };

    // 保留首尾，中间用 … 连接
    const headLen = Math.floor(targetLen * 0.6);
    const tailLen = targetLen - headLen - 3; // 3 for " … "
    const head = s.content.slice(0, headLen);
    const tail = tailLen > 0 ? s.content.slice(-tailLen) : "";
    const compressed = head + " … " + tail;

    return {
      ...s,
      content: compressed,
      charCount: compressed.length
    };
  });
}

// ==================== Prompt 构建 ====================

/**
 * 构建批量摘要的 AI prompt
 * @param {Array} sections - 段落数组
 * @returns {string} prompt 文本
 */
export function buildBatchSummaryPrompt(sections) {
  if (!sections || !Array.isArray(sections) || sections.length === 0) return "";

  let prompt = "请对以下文档进行批量摘要分析。\n\n";
  prompt += "文档按段落拆分如下：\n\n";

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    prompt += "--- [" + (i + 1) + "] " + s.title + " ---\n";
    prompt += s.content + "\n\n";
  }

  prompt += "请按以下格式输出：\n\n";
  prompt += "## 全文概述\n";
  prompt += "（用 2-3 句话概括全文主旨）\n\n";
  prompt += "## 逐段摘要\n";
  for (let i = 0; i < sections.length; i++) {
    prompt += "### [" + (i + 1) + "] " + sections[i].title + "\n";
    prompt += "（该段摘要，1-2 句话）\n";
    prompt += "\U0001f4cc 核心要点：（一句话核心）\n";
    prompt += "⚠️ 重要性：高/中/低\n\n";
  }
  prompt += "## 关键要点\n";
  prompt += "（列出 3-5 个关键要点，用 - 开头的列表）\n";

  return prompt;
}

// ==================== 响应解析 ====================

/**
 * 解析 AI 的批量摘要响应
 * @param {string} text - AI 返回的文本
 * @param {Array} sections - 原始段落数组（用于校准 sectionId）
 * @returns {{overview: string, sectionSummaries: Array, keyPoints: string[]}}
 */
export function parseBatchSummaryResponse(text, sections) {
  const result = {
    overview: "",
    readingTime: null,
    sectionSummaries: [],
    keyPoints: []
  };

  if (!text || typeof text !== "string") return result;
  if (!sections) sections = [];

  // === 提取全文概述 ===
  const overviewMatch = text.match(/##\s*全文概述\s*\n([\s\S]*?)(?=\n##|\n###|$)/i)
    || text.match(/全文概述[：:\s]*\n?([\s\S]*?)(?=\n#|$)/i);
  if (overviewMatch) {
    result.overview = overviewMatch[1].trim();
  }

  // === 提取逐段摘要 ===
  // Match patterns like: ### [1] Title\ncontent\n  or  ### [2] Title\ncontent
  const sectionRegex = /###?\s*\[(\d+)\]\s*(.*?)\n([\s\S]*?)(?=###?\s*\[\d+\]|##\s*关键要点|$)/gi;
  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(text)) !== null) {
    const sectionIdx = parseInt(sectionMatch[1], 10) - 1; // 1-indexed → 0-indexed
    const title = sectionMatch[2].trim();
    const body = sectionMatch[3].trim();

    // 提取核心要点
    const keyPointMatch = body.match(/\U0001f4cc\s*核心要点[：:]\s*(.+)/i);
    const keyPoint = keyPointMatch ? keyPointMatch[1].trim() : "";

    // 提取重要性
    const importanceMatch = body.match(/⚠️\s*重要性[：:]\s*(高|中|低)/i);
    let importance = "medium";
    if (importanceMatch) {
      const imp = importanceMatch[1].trim();
      if (imp === "高") importance = "high";
      else if (imp === "低") importance = "low";
    }

    // 提取摘要正文（排除标记行）
    const summary = body
      .replace(/\U0001f4cc.*$/gm, "")
      .replace(/⚠️.*$/gm, "")
      .trim();

    const sectionId = (sectionIdx >= 0 && sectionIdx < sections.length) ? sectionIdx : result.sectionSummaries.length;

    result.sectionSummaries.push({
      sectionId,
      title: title || (sections[sectionIdx] ? sections[sectionIdx].title : ""),
      summary,
      keyPoint,
      importance
    });
  }

  // === 提取关键要点 ===
  const keyPointsMatch = text.match(/##\s*关键要点\s*\n([\s\S]*?)$/i)
    || text.match(/关键要点[：:\s]*\n([\s\S]*?)$/i);
  if (keyPointsMatch) {
    const bulletLines = keyPointsMatch[1].match(/^[-•*]\s+(.+)/gm);
    if (bulletLines) {
      result.keyPoints = bulletLines.map(l => l.replace(/^[-•*]\s+/, "").trim());
    }
  }

  return result;
}

// ==================== 阅读时间估算 ====================

/**
 * 估算文本阅读时间
 * 中文 ~400 字/分钟，英文 ~200 词/分钟
 * @param {string} text - 文本
 * @param {number} [wpm] - 自定义每分钟阅读速度（字符/词数）
 * @returns {{minutes: number, label: string}}
 */
export function estimateReadingTime(text, wpm) {
  if (!text || typeof text !== "string") {
    return { minutes: 0, label: "< 1 分钟" };
  }

  // 估算中文字符数和英文单词数
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const totalChars = text.length;

  let minutes;
  if (wpm) {
    // 自定义 wpm：按总字符数计算
    minutes = Math.ceil(totalChars / wpm);
  } else if (chineseChars > englishWords * 2) {
    // 以中文为主
    minutes = Math.ceil(chineseChars / 400);
  } else if (englishWords > chineseChars * 2) {
    // 以英文为主
    minutes = Math.ceil(englishWords / 200);
  } else {
    // 混合语言
    minutes = Math.ceil(totalChars / 300);
  }

  minutes = Math.max(0, minutes);

  let label;
  if (minutes === 0) {
    label = "< 1 分钟";
  } else if (minutes === 1) {
    label = "约 1 分钟";
  } else {
    label = "约 " + minutes + " 分钟";
  }

  return { minutes, label };
}

// ==================== 高级入口 ====================

/**
 * 完整批量摘要流程
 * @param {string} content - 原始内容
 * @param {Object} aiClient - AI 客户端（需实现 chat(messages, options)）
 * @param {Object} [options] - 选项
 * @param {number} [options.maxChars=6000] - 最大内容字符数
 * @param {'heading'|'paragraph'|'fixed'} [options.strategy='heading'] - 分段策略
 * @param {number} [options.maxSectionChars=3000] - 每段最大字符数
 * @param {string} [options.model] - AI 模型
 * @param {number} [options.maxTokens=4096] - 最大输出 token 数
 * @returns {Promise<{overview: string, readingTime: {minutes: number, label: string}, sectionSummaries: Array, keyPoints: string[]}>}
 */
export async function summarizeContent(content, aiClient, options = {}) {
  if (!content || typeof content !== "string") {
    return { overview: "", readingTime: { minutes: 0, label: "< 1 分钟" }, sectionSummaries: [], keyPoints: [] };
  }

  const {
    maxChars = 6000,
    strategy = "heading",
    maxSectionChars = 3000,
    model,
    maxTokens = 4096
  } = options;

  // 1. 分段
  const sections = splitIntoSections(content, { strategy, maxSectionChars });

  if (sections.length === 0) {
    return { overview: "", readingTime: { minutes: 0, label: "< 1 分钟" }, sectionSummaries: [], keyPoints: [] };
  }

  // 2. 压缩
  const compressed = compressSections(sections, maxChars);

  // 3. 构建 prompt
  const prompt = buildBatchSummaryPrompt(compressed);

  // 4. 调用 AI
  let response;
  try {
    response = await aiClient.chat([{
      role: "user",
      content: prompt
    }], {
      maxTokens,
      ...(model ? { model } : {}),
      systemPrompt: "你是一个文档分析助手。请严格按照指定格式输出批量摘要，包含全文概述、逐段摘要（含核心要点和重要性）和关键要点列表。"
    });
  } catch (error) {
    throw new Error("批量摘要失败: " + error.message);
  }

  // 5. 解析响应
  const summary = parseBatchSummaryResponse(response.content, compressed);

  // 6. 计算阅读时间
  summary.readingTime = estimateReadingTime(content);

  return summary;
}
