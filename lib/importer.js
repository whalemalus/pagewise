/**
 * Importer - 知识库导入工具
 *
 * 支持格式：
 * 1. JSON - 本扩展导出的格式（完整还原）
 * 2. Markdown - Obsidian 风格（YAML frontmatter + 正文）
 * 3. Markdown - 简单格式（H2 分隔多个条目）
 * 4. 纯文本 - 每段一个条目（空行分隔）
 */

/**
 * 解析导入文件，返回条目数组
 */
export async function parseImportFiles(files) {
  const allEntries = [];

  for (const file of files) {
    const text = await readFile(file);
    const ext = file.name.split('.').pop().toLowerCase();

    let entries = [];

    if (ext === 'json') {
      entries = parseJSON(text, file.name);
    } else if (ext === 'md' || ext === 'markdown') {
      entries = parseMarkdown(text, file.name);
    } else if (ext === 'txt') {
      entries = parseText(text, file.name);
    } else {
      // 尝试 JSON 解析
      try {
        entries = parseJSON(text, file.name);
      } catch {
        entries = parseText(text, file.name);
      }
    }

    allEntries.push(...entries);
  }

  return allEntries;
}

/**
 * 读取文件内容
 */
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`无法读取文件: ${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

// ==================== JSON 格式 ====================

function parseJSON(text, filename) {
  const data = JSON.parse(text);
  const items = Array.isArray(data) ? data : [data];

  return items.map(item => ({
    title: item.title || '导入条目',
    content: item.content || '',
    summary: item.summary || '',
    sourceUrl: item.sourceUrl || item.url || '',
    sourceTitle: item.sourceTitle || item.title || '',
    tags: normalizeTags(item.tags),
    category: item.category || item.tags?.[0] || '导入',
    question: item.question || '',
    answer: item.answer || '',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  }));
}

// ==================== Markdown 格式 ====================

function parseMarkdown(text, filename) {
  // 先尝试 Obsidian frontmatter 格式
  const obsidianEntries = parseObsidianMarkdown(text);
  if (obsidianEntries.length > 0) return obsidianEntries;

  // 再尝试 H2 分隔格式
  const h2Entries = parseH2Markdown(text);
  if (h2Entries.length > 0) return h2Entries;

  // 整个文件作为一个条目
  return [{
    title: filename.replace(/\.(md|markdown)$/i, ''),
    content: text,
    summary: text.slice(0, 200),
    sourceUrl: '',
    sourceTitle: filename,
    tags: [],
    category: '导入',
    question: '',
    answer: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }];
}

/**
 * Obsidian 风格：YAML frontmatter + 正文
 *
 * ---
 * title: 标题
 * tags: [tag1, tag2]
 * source: https://...
 * date: 2024-01-01
 * ---
 * 正文内容...
 */
function parseObsidianMarkdown(text) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = text.match(frontmatterRegex);

  if (!match) return [];

  const yamlStr = match[1];
  const body = match[2].trim();
  const meta = parseSimpleYAML(yamlStr);

  // 如果 frontmatter 中有 title，认为是有效条目
  if (!meta.title && !meta.aliases) return [];

  return [{
    title: meta.title || meta.aliases?.[0] || '导入条目',
    content: body,
    summary: meta.description || body.slice(0, 200),
    sourceUrl: meta.source || meta.url || '',
    sourceTitle: meta.title || '',
    tags: normalizeTags(meta.tags),
    category: meta.category || meta.tags?.[0] || '导入',
    question: '',
    answer: body,
    createdAt: meta.date || meta.created || new Date().toISOString(),
    updatedAt: meta.updated || new Date().toISOString()
  }];
}

/**
 * 简单 YAML 解析（只支持 key: value 和 key: [array]）
 */
function parseSimpleYAML(yaml) {
  const result = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // 数组 [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
    }
    // 去除引号
    else if ((value.startsWith('"') && value.endsWith('"')) ||
             (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // 布尔
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;

    result[key] = value;
  }

  return result;
}

/**
 * H2 分隔格式：每个 ## 标题是一个条目
 *
 * ## 条目标题1
 * 标签: tag1, tag2
 * 来源: https://...
 *
 * 内容正文...
 *
 * ## 条目标题2
 * ...
 */
function parseH2Markdown(text) {
  const sections = text.split(/^## /m).filter(s => s.trim());
  if (sections.length < 2) return []; // 至少 2 个 H2 才认为是分隔格式

  return sections.map(section => {
    const lines = section.split('\n');
    const title = lines[0].trim();
    let remaining = lines.slice(1).join('\n').trim();

    // 提取元信息行
    let tags = [];
    let sourceUrl = '';
    let date = '';

    const metaLines = remaining.split('\n');
    const contentStartIdx = metaLines.findIndex(line => {
      if (line.match(/^[标签tags|标签|tags|tag]\s*[:：]/i)) {
        tags = line.replace(/^[^:：]+[:：]\s*/, '').split(/[,，]/).map(t => t.trim()).filter(Boolean);
        return false;
      }
      if (line.match(/^[来源|source|url]\s*[:：]/i)) {
        sourceUrl = line.replace(/^[^:：]+[:：]\s*/, '').trim();
        return false;
      }
      if (line.match(/^[日期|date|time]\s*[:：]/i)) {
        date = line.replace(/^[^:：]+[:：]\s*/, '').trim();
        return false;
      }
      // 空行之前的都是元信息
      if (line.trim() === '' && tags.length > 0) return true;
      // 非元信息行
      return !line.match(/^[a-zA-Z\u4e00-\u9fff]+\s*[:：]/);
    });

    const metaEnd = contentStartIdx === -1 ? 0 : contentStartIdx;
    const metaLinesCount = metaEnd > 0 ? metaEnd : 0;

    // 跳过元信息行，取正文
    if (tags.length > 0 || sourceUrl) {
      remaining = metaLines.slice(metaLinesCount).join('\n').trim();
    }

    return {
      title: title || '导入条目',
      content: remaining,
      summary: remaining.slice(0, 200),
      sourceUrl,
      sourceTitle: title,
      tags: normalizeTags(tags),
      category: tags[0] || '导入',
      question: '',
      answer: remaining,
      createdAt: date || new Date().toISOString(),
      updatedAt: date || new Date().toISOString()
    };
  });
}

// ==================== 纯文本格式 ====================

function parseText(text, filename) {
  // 按双换行分段
  const sections = text.split(/\n{2,}/).filter(s => s.trim());

  if (sections.length <= 1) {
    return [{
      title: filename.replace(/\.txt$/i, ''),
      content: text,
      summary: text.slice(0, 200),
      sourceUrl: '',
      sourceTitle: filename,
      tags: [],
      category: '导入',
      question: '',
      answer: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }];
  }

  return sections.map((section, i) => {
    const lines = section.split('\n');
    const firstLine = lines[0].trim();
    const content = lines.slice(1).join('\n').trim() || firstLine;
    const title = firstLine.length < 80 ? firstLine : firstLine.slice(0, 80) + '...';

    return {
      title,
      content,
      summary: content.slice(0, 200),
      sourceUrl: '',
      sourceTitle: filename,
      tags: [],
      category: '导入',
      question: '',
      answer: content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });
}

// ==================== 工具 ====================

function normalizeTags(tags) {
  if (!tags) return [];
  if (typeof tags === 'string') return tags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  return [];
}
