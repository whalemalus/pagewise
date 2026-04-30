/**
 * 测试 lib/entity-extractor.js — L1.2 实体/概念自动提取
 *
 * 22 个场景覆盖：
 *   1-4:   buildExtractionPrompt — 提示词构建
 *   5-8:   parseExtractionResponse — AI 响应解析
 *   9-12:  extractEntities — 实体提取主流程
 *   13-16: generateEntityMarkdown / generateConceptMarkdown — Markdown 生成
 *   17-20: buildEntityIndex — 索引生成
 *   21-22: sanitizeFilename — 文件名清理
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExtractionPrompt,
  parseExtractionResponse,
  extractEntities,
  generateEntityMarkdown,
  generateConceptMarkdown,
  buildEntityIndex,
  sanitizeFilename,
  ENTITY_TYPES,
} from '../lib/entity-extractor.js';

// ==================== Test Data ====================

const sampleEntries = [
  {
    id: 1,
    title: 'Docker 容器入门',
    question: '什么是 Docker？如何创建容器？',
    answer: 'Docker 是一个容器化平台，使用 Dockerfile 可以定义镜像。docker build 和 docker run 是核心命令。',
    tags: ['docker', 'devops'],
    category: 'DevOps',
    sourceUrl: 'https://docs.docker.com/get-started',
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-04-01T10:00:00Z',
  },
  {
    id: 2,
    title: 'React Hooks 详解',
    question: '如何使用 React Hooks？',
    answer: 'React Hooks 是 React 16.8 引入的特性。useState 和 useEffect 是最常用的 Hooks。它们允许在函数组件中使用状态和副作用。',
    tags: ['react', 'javascript', 'frontend'],
    category: 'Frontend',
    sourceUrl: 'https://react.dev/reference/react',
    createdAt: '2026-04-02T10:00:00Z',
    updatedAt: '2026-04-02T10:00:00Z',
  },
  {
    id: 3,
    title: 'CI/CD 流水线配置',
    question: '如何用 GitHub Actions 配置 CI/CD？',
    answer: 'GitHub Actions 使用 YAML workflow 文件定义 CI/CD 流水线。可以与 Docker 集成，自动构建和部署容器化应用。',
    tags: ['ci-cd', 'github-actions', 'devops'],
    category: 'DevOps',
    sourceUrl: 'https://docs.github.com/en/actions',
    createdAt: '2026-04-03T10:00:00Z',
    updatedAt: '2026-04-03T10:00:00Z',
  },
];

/** 模拟 AI 响应 JSON */
const sampleAIResponse = JSON.stringify({
  entities: [
    {
      name: 'Docker',
      type: 'tool',
      description: '容器化平台，用于打包、分发和运行应用',
      relatedEntryIds: [1, 3],
    },
    {
      name: 'React',
      type: 'framework',
      description: 'Facebook 开发的前端 UI 框架',
      relatedEntryIds: [2],
    },
    {
      name: 'GitHub Actions',
      type: 'tool',
      description: 'GitHub 提供的 CI/CD 自动化服务',
      relatedEntryIds: [3],
    },
  ],
  concepts: [
    {
      name: '容器化',
      description: '将应用及其依赖打包到轻量级容器中的技术',
      relatedEntryIds: [1, 3],
    },
    {
      name: 'CI/CD',
      description: '持续集成/持续部署，自动化的软件交付流程',
      relatedEntryIds: [3],
    },
    {
      name: 'Hooks',
      description: 'React 中在函数组件中使用状态和副作用的机制',
      relatedEntryIds: [2],
    },
  ],
});

// ==================== Tests ====================

describe('entity-extractor — buildExtractionPrompt', () => {

  // ---- 1. 基本提示词生成 ----
  it('为 Q&A 条目数组生成包含所有条目内容的提示词', () => {
    const prompt = buildExtractionPrompt(sampleEntries);
    assert.ok(typeof prompt === 'string', '应返回字符串');
    assert.ok(prompt.includes('Docker'), '应包含第一个条目的关键词');
    assert.ok(prompt.includes('React'), '应包含第二个条目的关键词');
    assert.ok(prompt.includes('CI/CD') || prompt.includes('CI'), '应包含第三个条目的关键词');
  });

  // ---- 2. 提示词包含 JSON 格式指示 ----
  it('提示词要求 AI 以 JSON 格式返回结果', () => {
    const prompt = buildExtractionPrompt(sampleEntries);
    assert.ok(prompt.includes('JSON') || prompt.includes('json'), '应要求 JSON 格式');
  });

  // ---- 3. 提示词包含条目 ID ----
  it('提示词中包含条目 ID 以便关联', () => {
    const prompt = buildExtractionPrompt(sampleEntries);
    // 条目 ID 应该出现在提示词中（用于 AI 关联回答）
    const idPatterns = [/\b1\b/, /\b2\b/, /\b3\b/];
    for (const p of idPatterns) {
      assert.ok(p.test(prompt), `提示词应包含条目 ID`);
    }
  });

  // ---- 4. 空条目数组 ----
  it('空条目数组返回基础提示词', () => {
    const prompt = buildExtractionPrompt([]);
    assert.ok(typeof prompt === 'string', '应返回字符串');
    assert.ok(prompt.length > 0, '不应为空');
  });

});

describe('entity-extractor — parseExtractionResponse', () => {

  // ---- 5. 正常 JSON 解析 ----
  it('正确解析标准 JSON 响应', () => {
    const result = parseExtractionResponse(sampleAIResponse);
    assert.ok(result.entities, '应包含 entities');
    assert.ok(result.concepts, '应包含 concepts');
    assert.equal(result.entities.length, 3, '应有 3 个实体');
    assert.equal(result.concepts.length, 3, '应有 3 个概念');
  });

  // ---- 6. 实体字段完整性 ----
  it('解析后的实体包含所有必要字段', () => {
    const result = parseExtractionResponse(sampleAIResponse);
    const entity = result.entities[0];
    assert.ok(entity.name, '应有 name');
    assert.ok(entity.type, '应有 type');
    assert.ok(entity.description, '应有 description');
    assert.ok(Array.isArray(entity.relatedEntryIds), 'relatedEntryIds 应为数组');
  });

  // ---- 7. JSON 包裹在 markdown 代码块中 ----
  it('处理 AI 常见的 markdown 代码块包裹', () => {
    const wrapped = '```json\n' + sampleAIResponse + '\n```';
    const result = parseExtractionResponse(wrapped);
    assert.equal(result.entities.length, 3, '应正确解析包裹在代码块中的 JSON');
  });

  // ---- 8. 无效 JSON ----
  it('无效 JSON 返回空结构', () => {
    const result = parseExtractionResponse('This is not JSON at all');
    assert.ok(result.entities, '应有 entities 字段');
    assert.ok(Array.isArray(result.entities), 'entities 应为空数组');
    assert.equal(result.entities.length, 0, 'entities 长度应为 0');
    assert.ok(Array.isArray(result.concepts), 'concepts 应为空数组');
    assert.equal(result.concepts.length, 0, 'concepts 长度应为 0');
  });

});

describe('entity-extractor — sanitizeFilename', () => {

  // ---- 9. 基本清理 ----
  it('清理文件系统不安全字符', () => {
    assert.equal(sanitizeFilename('Docker'), 'Docker');
    assert.equal(sanitizeFilename('CI/CD'), 'CI-CD');
    assert.equal(sanitizeFilename('a:b*c?d'), 'a-b-c-d');
  });

  // ---- 10. 长文件名截断 ----
  it('超过 100 字符的文件名截断到 100', () => {
    const longName = 'A'.repeat(150);
    const result = sanitizeFilename(longName);
    assert.ok(result.length <= 100, `长度 ${result.length} 应 <= 100`);
  });

  // ---- 11. 连续短横线合并 ----
  it('连续的短横线合并为单个', () => {
    assert.equal(sanitizeFilename('a---b'), 'a-b');
    assert.equal(sanitizeFilename('a//b\\\\c'), 'a-b-c');
  });

  // ---- 12. 空字符串 ----
  it('空字符串返回默认名', () => {
    const result = sanitizeFilename('');
    assert.ok(result.length > 0, '不应为空');
  });

});

describe('entity-extractor — generateEntityMarkdown', () => {

  const sampleEntity = {
    name: 'Docker',
    type: 'tool',
    description: '容器化平台，用于打包、分发和运行应用',
    relatedEntryIds: [1, 3],
    relatedEntries: [
      { id: 1, title: 'Docker 容器入门' },
      { id: 3, title: 'CI/CD 流水线配置' },
    ],
    relatedEntities: ['GitHub Actions', '容器化'],
  };

  // ---- 13. 基本 Markdown 结构 ----
  it('生成包含 YAML frontmatter 的 Markdown', () => {
    const md = generateEntityMarkdown(sampleEntity);
    assert.ok(md.startsWith('---'), '应以 YAML frontmatter 开头');
    assert.ok(md.includes('entity_type: "tool"'), '应包含 entity_type 字段');
    assert.ok(md.includes('Docker'), '应包含实体名');
  });

  // ---- 14. 包含相关 Q&A 链接 ----
  it('包含相关 Q&A 条目列表', () => {
    const md = generateEntityMarkdown(sampleEntity);
    assert.ok(md.includes('Docker 容器入门'), '应包含相关条目标题');
    assert.ok(md.includes('CI/CD 流水线配置'), '应包含相关条目标题');
  });

  // ---- 15. 包含关联实体 ----
  it('包含关联实体列表', () => {
    const md = generateEntityMarkdown(sampleEntity);
    assert.ok(md.includes('GitHub Actions'), '应包含关联实体');
    assert.ok(md.includes('容器化'), '应包含关联实体');
  });

  // ---- 16. 包含概述 ----
  it('包含实体概述描述', () => {
    const md = generateEntityMarkdown(sampleEntity);
    assert.ok(md.includes('容器化平台'), '应包含描述文本');
  });

});

describe('entity-extractor — generateConceptMarkdown', () => {

  const sampleConcept = {
    name: '容器化',
    description: '将应用及其依赖打包到轻量级容器中的技术',
    relatedEntryIds: [1, 3],
    relatedEntries: [
      { id: 1, title: 'Docker 容器入门' },
      { id: 3, title: 'CI/CD 流水线配置' },
    ],
    relatedEntities: ['Docker', 'Kubernetes'],
  };

  // ---- 17. 基本 Markdown 结构 ----
  it('生成包含 YAML frontmatter 和 concept 类型的 Markdown', () => {
    const md = generateConceptMarkdown(sampleConcept);
    assert.ok(md.startsWith('---'), '应以 YAML frontmatter 开头');
    assert.ok(md.includes('type: concept'), '应包含 concept 类型');
    assert.ok(md.includes('容器化'), '应包含概念名');
  });

  // ---- 18. 包含相关 Q&A 和关联实体 ----
  it('包含相关 Q&A 和关联实体', () => {
    const md = generateConceptMarkdown(sampleConcept);
    assert.ok(md.includes('Docker 容器入门'), '应包含相关条目');
    assert.ok(md.includes('Docker'), '应包含关联实体');
    assert.ok(md.includes('Kubernetes'), '应包含关联实体');
  });

});

describe('entity-extractor — buildEntityIndex', () => {

  const sampleEntities = [
    { name: 'Docker', type: 'tool', description: '容器化平台', relatedEntryIds: [1, 3] },
    { name: 'React', type: 'framework', description: '前端 UI 框架', relatedEntryIds: [2] },
    { name: 'GitHub Actions', type: 'tool', description: 'CI/CD 服务', relatedEntryIds: [3] },
  ];
  const sampleConcepts = [
    { name: '容器化', description: '容器技术', relatedEntryIds: [1, 3] },
    { name: 'CI/CD', description: '自动交付', relatedEntryIds: [3] },
  ];

  // ---- 19. 基本索引结构 ----
  it('生成包含实体和概念分组的索引 Markdown', () => {
    const md = buildEntityIndex(sampleEntities, sampleConcepts);
    assert.ok(typeof md === 'string', '应返回字符串');
    assert.ok(md.includes('实体'), '应包含"实体"标题');
    assert.ok(md.includes('概念'), '应包含"概念"标题');
    assert.ok(md.includes('Docker'), '应包含实体名');
    assert.ok(md.includes('容器化'), '应包含概念名');
  });

  // ---- 20. 索引按类型分组 ----
  it('实体按类型分组显示', () => {
    const md = buildEntityIndex(sampleEntities, sampleConcepts);
    // 应按实体类型（tool, framework 等）分组
    assert.ok(md.includes('tool') || md.includes('工具'), '应包含实体类型分组');
  });

});

describe('entity-extractor — extractEntities', () => {

  // 创建模拟 AI 客户端
  function createMockAI(response) {
    return {
      async chat(messages, options) {
        return { content: response };
      },
    };
  }

  // ---- 21. 完整提取流程 ----
  it('使用 AI 客户端提取实体和概念，返回结构化结果', async () => {
    const aiClient = createMockAI(sampleAIResponse);
    const result = await extractEntities(sampleEntries, aiClient);
    assert.ok(result.entities, '应包含 entities');
    assert.ok(result.concepts, '应包含 concepts');
    assert.ok(result.entities.length > 0, '应提取到实体');
    assert.ok(result.concepts.length > 0, '应提取到概念');
  });

  // ---- 22. 空条目不调用 AI ----
  it('空条目数组直接返回空结果，不调用 AI', async () => {
    let called = false;
    const aiClient = {
      async chat() { called = true; return { content: '[]' }; },
    };
    const result = await extractEntities([], aiClient);
    assert.equal(called, false, '不应调用 AI');
    assert.equal(result.entities.length, 0, '实体应为空');
    assert.equal(result.concepts.length, 0, '概念应为空');
  });

});
