/**
 * QA002 功能正确性测试（第二轮） — 学习路径模块
 *
 * 测试范围：
 *   创建学习路径、构建主题统计、生成 prompt、
 *   解析 AI 响应（直接 JSON / 代码块 / 混合文本）、
 *   路径验证、HTML 渲染、阶段节点管理、边界条件
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTopicStats,
  buildLearningPathPrompt,
  parseLearningPathResponse,
  validateLearningPath,
  renderLearningPathHTML
} from '../lib/learning-path.js';

// ==================== 测试数据 ====================

const sampleEntries = [
  { id: 1, title: 'JS 基础', tags: ['javascript', '入门'], category: '编程' },
  { id: 2, title: 'JS 闭包', tags: ['javascript', '高级'], category: '编程' },
  { id: 3, title: 'React 组件', tags: ['react', 'javascript', '前端'], category: '前端' },
  { id: 4, title: 'Python 入门', tags: ['python', '入门'], category: '编程' },
  { id: 5, title: 'Docker 实践', tags: ['docker', 'devops'], category: '运维' },
  { id: 6, title: 'CSS Grid', tags: ['css', '前端'], category: '前端' },
];

const validPath = {
  stages: [
    {
      title: '基础入门',
      description: '学习 JavaScript 和 Python 基础语法',
      topics: ['javascript', 'python'],
      estimatedTime: '2-3 小时',
      entries: [{ id: 1, title: 'JS 基础' }, { id: 4, title: 'Python 入门' }],
    },
    {
      title: '前端进阶',
      description: '掌握 React 组件和 CSS 布局',
      topics: ['react', 'css'],
      estimatedTime: '3-4 小时',
      entries: [{ id: 3, title: 'React 组件' }, { id: 6, title: 'CSS Grid' }],
    },
    {
      title: '工程化实践',
      description: '学习容器化和 DevOps',
      topics: ['docker'],
      estimatedTime: '2 小时',
      entries: [{ id: 5, title: 'Docker 实践' }],
    },
  ],
};

// ==================== 1. 主题统计构建 ====================

describe('QA002-learning-path: 主题统计', () => {
  it('从条目的 tags 构建正确的主题计数', () => {
    const result = buildTopicStats(sampleEntries);
    assert.equal(result.totalCount, 6);

    const jsTopic = result.topics.find(t => t.name === 'javascript');
    assert.ok(jsTopic, '应有 javascript 主题');
    assert.equal(jsTopic.count, 3); // 条目 1, 2, 3
    assert.deepEqual(jsTopic.entryIds, [1, 2, 3]);
  });

  it('按 count 降序排列', () => {
    const result = buildTopicStats(sampleEntries);
    for (let i = 1; i < result.topics.length; i++) {
      assert.ok(result.topics[i - 1].count >= result.topics[i].count, '应按 count 降序');
    }
  });

  it('无 tags 时回退到 category', () => {
    const entries = [
      { id: 1, tags: [], category: 'AI' },
      { id: 2, tags: [], category: 'AI' },
    ];
    const result = buildTopicStats(entries);
    assert.equal(result.topics.length, 1);
    assert.equal(result.topics[0].name, 'AI');
    assert.equal(result.topics[0].count, 2);
  });

  it('无 tags 无 category 使用默认"未分类"', () => {
    const entries = [
      { id: 1, tags: [] },
      { id: 2, tags: [] },
    ];
    const result = buildTopicStats(entries);
    assert.equal(result.topics[0].name, '未分类');
    assert.equal(result.topics[0].count, 2);
  });

  it('空数组返回空结果', () => {
    const result = buildTopicStats([]);
    assert.deepEqual(result, { topics: [], totalCount: 0 });
  });

  it('null 输入安全处理', () => {
    const result = buildTopicStats(null);
    assert.deepEqual(result, { topics: [], totalCount: 0 });
  });

  it('同一条目的 entryIds 不重复', () => {
    const entries = [
      { id: 1, tags: ['a', 'b'], category: 'c' },
    ];
    const result = buildTopicStats(entries);
    for (const topic of result.topics) {
      assert.equal(topic.entryIds.length, new Set(topic.entryIds).size);
    }
  });
});

// ==================== 2. 创建路径 — Prompt 构建 ====================

describe('QA002-learning-path: Prompt 构建', () => {
  it('生成包含主题列表的 prompt', () => {
    const topics = [
      { name: 'javascript', count: 5 },
      { name: 'react', count: 3 },
    ];
    const prompt = buildLearningPathPrompt(topics);
    assert.ok(prompt.includes('javascript'));
    assert.ok(prompt.includes('5'));
    assert.ok(prompt.includes('react'));
    assert.ok(prompt.includes('JSON'));
    assert.ok(prompt.includes('stages'));
  });

  it('空主题返回提示文本', () => {
    const prompt = buildLearningPathPrompt([]);
    assert.ok(prompt.includes('没有'));
    assert.ok(prompt.includes('建议'));
  });

  it('null 输入返回提示文本', () => {
    const prompt = buildLearningPathPrompt(null);
    assert.ok(prompt.includes('没有'));
  });
});

// ==================== 3. 解析 AI 响应 ====================

describe('QA002-learning-path: 解析 AI 响应', () => {
  it('直接解析纯 JSON 响应', () => {
    const json = JSON.stringify(validPath);
    const result = parseLearningPathResponse(json);
    assert.ok(result);
    assert.equal(result.stages.length, 3);
    assert.equal(result.stages[0].title, '基础入门');
  });

  it('从 markdown 代码块中提取 JSON', () => {
    const response = '以下是学习路径：\n```json\n' + JSON.stringify(validPath) + '\n```\n希望对你有帮助！';
    const result = parseLearningPathResponse(response);
    assert.ok(result);
    assert.equal(result.stages.length, 3);
  });

  it('从混合文本中匹配 JSON 对象', () => {
    const response = '根据你的知识库分析，\n' + JSON.stringify(validPath) + '\n以上是推荐路径。';
    const result = parseLearningPathResponse(response);
    assert.ok(result);
    assert.ok(result.stages);
  });

  it('非 JSON 文本返回 null', () => {
    assert.equal(parseLearningPathResponse('这是一段普通文字'), null);
  });

  it('缺少 stages 字段返回 null', () => {
    assert.equal(parseLearningPathResponse('{"data":[1,2,3]}'), null);
  });

  it('null/undefined 输入返回 null', () => {
    assert.equal(parseLearningPathResponse(null), null);
    assert.equal(parseLearningPathResponse(undefined), null);
  });
});

// ==================== 4. 路径验证 ====================

describe('QA002-learning-path: 路径验证', () => {
  it('有效路径返回 true', () => {
    assert.equal(validateLearningPath(validPath), true);
  });

  it('null 返回 false', () => {
    assert.equal(validateLearningPath(null), false);
  });

  it('缺少 stages 返回 false', () => {
    assert.equal(validateLearningPath({}), false);
    assert.equal(validateLearningPath({ stages: 'not-array' }), false);
  });

  it('空 stages 数组返回 false', () => {
    assert.equal(validateLearningPath({ stages: [] }), false);
  });

  it('阶段缺少 title 返回 false', () => {
    const path = { stages: [{ description: 'desc', topics: ['t1'] }] };
    assert.equal(validateLearningPath(path), false);
  });

  it('阶段缺少 description 返回 false', () => {
    const path = { stages: [{ title: 't', topics: ['t1'] }] };
    assert.equal(validateLearningPath(path), false);
  });

  it('阶段 topics 非数组返回 false', () => {
    const path = { stages: [{ title: 't', description: 'd', topics: 'not-array' }] };
    assert.equal(validateLearningPath(path), false);
  });

  it('单阶段路径也能通过验证', () => {
    const path = {
      stages: [{ title: '全部内容', description: '一次性学习', topics: ['a'] }],
    };
    assert.equal(validateLearningPath(path), true);
  });
});

// ==================== 5. HTML 渲染 ====================

describe('QA002-learning-path: HTML 渲染', () => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  it('渲染完整的多阶段学习路径', () => {
    const html = renderLearningPathHTML(validPath, esc);
    assert.ok(html.includes('learning-path'));
    assert.ok(html.includes('基础入门'));
    assert.ok(html.includes('前端进阶'));
    assert.ok(html.includes('工程化实践'));
    assert.ok(html.includes('javascript'));
    assert.ok(html.includes('react'));
    assert.ok(html.includes('docker'));
  });

  it('渲染阶段编号和连接线', () => {
    const html = renderLearningPathHTML(validPath, esc);
    assert.ok(html.includes('lp-stage-number'));
    assert.ok(html.includes('lp-connector-line'), '阶段间应有连接线');
  });

  it('渲染预计时间', () => {
    const html = renderLearningPathHTML(validPath, esc);
    assert.ok(html.includes('2-3 小时'));
    assert.ok(html.includes('3-4 小时'));
  });

  it('渲染推荐阅读条目', () => {
    const html = renderLearningPathHTML(validPath, esc);
    assert.ok(html.includes('推荐阅读'));
    assert.ok(html.includes('JS 基础'));
    assert.ok(html.includes('React 组件'));
  });

  it('无条目的阶段不显示推荐阅读', () => {
    const path = {
      stages: [{
        title: '测试阶段',
        description: '这是纯理论阶段，不需要查阅任何资料',
        topics: ['t1'],
        estimatedTime: '1h',
        entries: [],
      }],
    };
    const html = renderLearningPathHTML(path, esc);
    assert.ok(!html.includes('推荐阅读'));
  });

  it('空路径返回空字符串', () => {
    assert.equal(renderLearningPathHTML(null, esc), '');
    assert.equal(renderLearningPathHTML({ stages: [] }, esc), '');
    assert.equal(renderLearningPathHTML({}, esc), '');
  });

  it('escapeHtml 被正确调用', () => {
    const maliciousPath = {
      stages: [{
        title: '<script>alert(1)</script>',
        description: '安全测试 & 验证',
        topics: ['xss'],
        estimatedTime: '1h',
      }],
    };
    const html = renderLearningPathHTML(maliciousPath, esc);
    assert.ok(!html.includes('<script>'), 'HTML 应被转义');
    assert.ok(html.includes('&lt;script&gt;'), '转义后应包含实体');
    assert.ok(html.includes('&amp;'), '& 符号应被转义');
  });
});
