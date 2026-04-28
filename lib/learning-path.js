/**
 * LearningPath — 学习路径生成
 *
 * 基于知识库内容，AI 自动生成个性化学习路线图。
 * 纯前端实现，不引入外部依赖。
 */

/**
 * 从知识条目中构建主题统计
 * @param {Array} entries - 知识条目数组
 * @returns {{ topics: Array<{name: string, count: number, entryIds: Array}>, totalCount: number }}
 */
export function buildTopicStats(entries) {
  if (!entries || !Array.isArray(entries)) {
    return { topics: [], totalCount: 0 };
  }

  const topicMap = {};

  for (const entry of entries) {
    const tags = (entry.tags && entry.tags.length > 0)
      ? entry.tags
      : [entry.category || '未分类'];

    for (const tag of tags) {
      const name = tag || '未分类';
      if (!topicMap[name]) {
        topicMap[name] = { name, count: 0, entryIds: [] };
      }
      topicMap[name].count++;
      if (!topicMap[name].entryIds.includes(entry.id)) {
        topicMap[name].entryIds.push(entry.id);
      }
    }
  }

  const topics = Object.values(topicMap)
    .sort((a, b) => b.count - a.count);

  return { topics, totalCount: entries.length };
}

/**
 * 构建学习路径 prompt
 * @param {Array} topics - 主题统计数组
 * @returns {string} - 发送给 AI 的 prompt
 */
export function buildLearningPathPrompt(topics) {
  if (!topics || topics.length === 0) {
    return '用户的知识库中没有足够的主题内容来生成学习路径。请建议用户先积累一些知识条目。';
  }

  const topicList = topics
    .map(t => `- ${t.name}：${t.count} 条相关知识`)
    .join('\n');

  return `基于用户的知识库内容，生成一个个性化的学习路径。

知识库主题统计：
${topicList}

要求：
1. 将主题组织成 3-5 个学习阶段
2. 每个阶段包含 2-4 个主题
3. 从基础到进阶排列
4. 每个阶段给出简要描述和学习建议
5. 每个阶段给出预计学习时间
6. 用 JSON 格式返回

JSON 结构示例：
{
  "stages": [
    {
      "title": "阶段标题",
      "description": "阶段描述和学习建议",
      "topics": ["主题1", "主题2"],
      "estimatedTime": "预计时间",
      "recommendedEntries": []
    }
  ]
}

注意：
- 只基于上述主题统计来组织学习路径，不要引入外部知识
- 按从基础到进阶的顺序排列
- 只返回 JSON，不要其他文字`;
}

/**
 * 解析 AI 返回的学习路径响应
 * @param {string} response - AI 响应文本
 * @returns {Object|null} - 解析后的学习路径，或 null
 */
export function parseLearningPathResponse(response) {
  if (!response || typeof response !== 'string') return null;

  // 尝试直接解析
  let parsed = tryParseJSON(response);
  if (parsed && parsed.stages) return parsed;

  // 尝试从 markdown 代码块中提取 JSON
  const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    parsed = tryParseJSON(codeBlockMatch[1].trim());
    if (parsed && parsed.stages) return parsed;
  }

  // 尝试查找 JSON 对象
  const jsonMatch = response.match(/\{[\s\S]*"stages"[\s\S]*\}/);
  if (jsonMatch) {
    parsed = tryParseJSON(jsonMatch[0]);
    if (parsed && parsed.stages) return parsed;
  }

  return null;
}

/**
 * 安全解析 JSON
 * @param {string} str
 * @returns {Object|null}
 */
function tryParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * 验证学习路径结构是否有效
 * @param {Object} path - 学习路径对象
 * @returns {boolean}
 */
export function validateLearningPath(path) {
  if (!path || !path.stages || !Array.isArray(path.stages) || path.stages.length === 0) {
    return false;
  }

  for (const stage of path.stages) {
    if (!stage.title || typeof stage.title !== 'string') return false;
    if (!stage.description || typeof stage.description !== 'string') return false;
    if (!Array.isArray(stage.topics)) return false;
  }

  return true;
}

/**
 * 将学习路径渲染为 HTML
 * @param {Object} path - 学习路径对象
 * @param {Function} escapeHtml - HTML 转义函数
 * @returns {string} - HTML 字符串
 */
export function renderLearningPathHTML(path, escapeHtml) {
  if (!path || !path.stages || path.stages.length === 0) return '';

  const esc = escapeHtml || ((s) => s);

  return `<div class="learning-path">
    ${path.stages.map((stage, index) => `
      <div class="lp-stage">
        <div class="lp-stage-connector">
          <div class="lp-stage-number">${index + 1}</div>
          ${index < path.stages.length - 1 ? '<div class="lp-connector-line"></div>' : ''}
        </div>
        <div class="lp-stage-card">
          <div class="lp-stage-header">
            <h3 class="lp-stage-title">${esc(stage.title)}</h3>
            ${stage.estimatedTime ? `<span class="lp-stage-time">⏱ ${esc(stage.estimatedTime)}</span>` : ''}
          </div>
          <div class="lp-stage-desc">${esc(stage.description)}</div>
          ${stage.topics && stage.topics.length > 0 ? `
            <div class="lp-stage-topics">
              ${stage.topics.map(t => `<span class="lp-topic-tag">${esc(t)}</span>`).join('')}
            </div>
          ` : ''}
          ${stage.entries && stage.entries.length > 0 ? `
            <div class="lp-stage-entries">
              <div class="lp-entries-label">📚 推荐阅读</div>
              ${stage.entries.map(e => `<div class="lp-entry-item" data-id="${e.id}">${esc(e.title || '未命名')}</div>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('')}
  </div>`;
}
