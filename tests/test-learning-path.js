/**
 * 测试 lib/learning-path.js — 学习路径生成
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopicStats,
  buildLearningPathPrompt,
  parseLearningPathResponse,
  validateLearningPath,
  renderLearningPathHTML
} from '../lib/learning-path.js';

// ==================== 主题统计 ====================

describe('buildTopicStats()', () => {
  it('空数组返回空对象', () => {
    const result = buildTopicStats([]);
    assert.deepEqual(result, { topics: [], totalCount: 0 });
  });

  it('null 输入安全处理', () => {
    const result = buildTopicStats(null);
    assert.deepEqual(result, { topics: [], totalCount: 0 });
  });

  it('从标签构建主题统计', () => {
    const entries = [
      { id: 1, title: 'JS 基础', tags: ['javascript', '基础'], category: '编程' },
      { id: 2, title: 'JS 闭包', tags: ['javascript', '高级'], category: '编程' },
      { id: 3, title: 'Python 入门', tags: ['python', '基础'], category: '编程' },
      { id: 4, title: 'React 组件', tags: ['react', 'javascript'], category: '前端' },
    ];

    const result = buildTopicStats(entries);
    assert.ok(result.topics.length > 0);
    assert.equal(result.totalCount, 4);

    // javascript 标签出现 3 次
    const jsTopic = result.topics.find(t => t.name === 'javascript');
    assert.ok(jsTopic, '应有 javascript 主题');
    assert.equal(jsTopic.count, 3);
    assert.deepEqual(jsTopic.entryIds, [1, 2, 4]);
  });

  it('按条目数量降序排列', () => {
    const entries = [
      { id: 1, tags: ['a'], category: 'cat1' },
      { id: 2, tags: ['b', 'a'], category: 'cat1' },
      { id: 3, tags: ['c', 'b', 'a'], category: 'cat1' },
    ];
    const result = buildTopicStats(entries);
    // a 出现 3 次，b 出现 2 次，c 出现 1 次
    assert.equal(result.topics[0].name, 'a');
    assert.equal(result.topics[0].count, 3);
  });

  it('使用 category 作为后备主题', () => {
    const entries = [
      { id: 1, tags: [], category: '前端开发' },
      { id: 2, tags: [], category: '后端开发' },
    ];
    const result = buildTopicStats(entries);
    const topics = result.topics.map(t => t.name);
    assert.ok(topics.includes('前端开发'));
    assert.ok(topics.includes('后端开发'));
  });

  it('无标签无分类时使用默认分类', () => {
    const entries = [
      { id: 1, tags: [] },
      { id: 2, tags: [], category: '' },
    ];
    const result = buildTopicStats(entries);
    const uncatTopic = result.topics.find(t => t.name === '未分类');
    assert.ok(uncatTopic, '应有未分类主题');
    assert.equal(uncatTopic.count, 2);
  });
});

// ==================== Prompt 构建 ====================

describe('buildLearningPathPrompt()', () => {
  it('生成包含主题统计的 prompt', () => {
    const topics = [
      { name: 'javascript', count: 5 },
      { name: 'react', count: 3 },
      { name: 'css', count: 2 },
    ];
    const prompt = buildLearningPathPrompt(topics);
    assert.ok(prompt.includes('javascript'));
    assert.ok(prompt.includes('5'));
    assert.ok(prompt.includes('react'));
    assert.ok(prompt.includes('JSON'));
  });

  it('空主题返回提示', () => {
    const prompt = buildLearningPathPrompt([]);
    assert.ok(prompt.includes('没有'));
  });
});

// ==================== 响应解析 ====================

describe('parseLearningPathResponse()', () => {
  it('解析有效 JSON 响应', () => {
    const jsonResponse = JSON.stringify({
      stages: [
        {
          title: '基础入门',
          description: '学习基础概念',
          topics: ['javascript', 'html'],
          estimatedTime: '2-3 小时',
          entries: [
            { id: 1, title: 'JS 基础' }
          ]
        }
      ]
    });

    const result = parseLearningPathResponse(jsonResponse);
    assert.ok(result.stages);
    assert.equal(result.stages.length, 1);
    assert.equal(result.stages[0].title, '基础入门');
  });

  it('从 markdown 代码块中提取 JSON', () => {
    const response = '以下是学习路径：\n```json\n{"stages":[{"title":"阶段1","description":"desc","topics":["t1"],"estimatedTime":"1h","entries":[]}]}\n```\n祝你学习愉快！';
    const result = parseLearningPathResponse(response);
    assert.ok(result.stages);
    assert.equal(result.stages.length, 1);
  });

  it('无效 JSON 返回 null', () => {
    const result = parseLearningPathResponse('这不是 JSON');
    assert.equal(result, null);
  });

  it('缺少 stages 字段返回 null', () => {
    const result = parseLearningPathResponse(JSON.stringify({ data: [] }));
    assert.equal(result, null);
  });
});

// ==================== 路径验证 ====================

describe('validateLearningPath()', () => {
  it('有效路径返回 true', () => {
    const path = {
      stages: [
        {
          title: '基础入门',
          description: '学习基础概念',
          topics: ['javascript', 'html'],
          estimatedTime: '2-3 小时',
          entries: [{ id: 1, title: 'JS 基础' }]
        }
      ]
    };
    assert.equal(validateLearningPath(path), true);
  });

  it('null 输入返回 false', () => {
    assert.equal(validateLearningPath(null), false);
  });

  it('空 stages 返回 false', () => {
    assert.equal(validateLearningPath({ stages: [] }), false);
  });

  it('缺少 title 的阶段返回 false', () => {
    const path = {
      stages: [{ description: 'desc', topics: ['t1'], estimatedTime: '1h', entries: [] }]
    };
    assert.equal(validateLearningPath(path), false);
  });
});

// ==================== HTML 渲染 ====================

describe('renderLearningPathHTML()', () => {
  const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  it('渲染多个阶段卡片', () => {
    const path = {
      stages: [
        {
          title: '第一阶段：基础',
          description: '学习基础概念',
          topics: ['javascript', 'html'],
          estimatedTime: '2-3 小时',
          entries: [
            { id: 1, title: 'JS 基础' },
            { id: 2, title: 'HTML 入门' }
          ]
        },
        {
          title: '第二阶段：进阶',
          description: '深入学习',
          topics: ['react', 'vue'],
          estimatedTime: '4-5 小时',
          entries: [
            { id: 3, title: 'React 组件' }
          ]
        }
      ]
    };

    const html = renderLearningPathHTML(path, escapeHtml);
    assert.ok(html.includes('第一阶段'));
    assert.ok(html.includes('第二阶段'));
    assert.ok(html.includes('learning-path'));
    assert.ok(html.includes('javascript'));
    assert.ok(html.includes('react'));
    assert.ok(html.includes('2-3 小时'));
    assert.ok(html.includes('JS 基础'));
  });

  it('空路径返回空字符串', () => {
    assert.equal(renderLearningPathHTML(null, escapeHtml), '');
    assert.equal(renderLearningPathHTML({ stages: [] }, escapeHtml), '');
  });

  it('无条目的阶段也能正常渲染', () => {
    const path = {
      stages: [
        {
          title: '阶段1',
          description: '描述',
          topics: ['t1'],
          estimatedTime: '1h',
          entries: []
        }
      ]
    };
    const html = renderLearningPathHTML(path, escapeHtml);
    assert.ok(html.includes('阶段1'));
    assert.ok(!html.includes('推荐阅读'));
  });
});
