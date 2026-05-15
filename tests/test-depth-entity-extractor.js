/**
 * test-depth-entity-extractor.js — EntityExtractor 深度测试
 *
 * 测试范围 (15 用例):
 *   提示词构建      — 空条目默认提示、有条目时包含标题/问题/回答
 *   响应解析        — 空/null 输入、直接 JSON、markdown 代码块包裹、解析失败、实体类型归一化
 *   文件名清理      — 空/null → unnamed、替换不安全字符、截断超长名称
 *   Markdown 生成   — 实体页、概念页
 *   索引生成        — 包含实体和概念分组
 *   常量验证        — ENTITY_TYPES 包含 9 种类型
 *   批量提取        — extractEntities 空条目返回空
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  ENTITY_TYPES,
  buildExtractionPrompt,
  parseExtractionResponse,
  extractEntities,
  sanitizeFilename,
  generateEntityMarkdown,
  generateConceptMarkdown,
  buildEntityIndex,
} = await import('../lib/entity-extractor.js');

// ==================== 提示词构建 ====================

describe('buildExtractionPrompt — 空条目返回默认提示', () => {
  it('null entries → 含 "无输入条目" 的默认提示', () => {
    const prompt = buildExtractionPrompt(null);
    assert.ok(prompt.includes('无输入条目'));
  });

  it('空数组 → 同样返回默认提示', () => {
    const prompt = buildExtractionPrompt([]);
    assert.ok(prompt.includes('无输入条目'));
  });
});

describe('buildExtractionPrompt — 有条目时包含标题和问题', () => {
  it('单条目 → 提示词含标题、问题、回答片段', () => {
    const entries = [{
      id: 1,
      title: '什么是 Docker?',
      question: '请解释 Docker 容器化技术',
      answer: 'Docker 是一种容器化平台，它允许开发者将应用打包到轻量级容器中运行。',
      tags: ['docker', 'devops'],
    }];
    const prompt = buildExtractionPrompt(entries);
    assert.ok(prompt.includes('什么是 Docker?'));
    assert.ok(prompt.includes('请解释 Docker 容器化技术'));
    assert.ok(prompt.includes('Docker 是一种容器化平台'));
    assert.ok(prompt.includes('docker'));
    assert.ok(prompt.includes('JSON'));
  });

  it('多条目 → 含分隔符 ---', () => {
    const entries = [
      { id: 1, title: 'A', question: 'Q1', answer: 'A1' },
      { id: 2, title: 'B', question: 'Q2', answer: 'A2' },
    ];
    const prompt = buildExtractionPrompt(entries);
    assert.ok(prompt.includes('---'));
    assert.ok(prompt.includes('[ID: 1]'));
    assert.ok(prompt.includes('[ID: 2]'));
  });
});

// ==================== 响应解析 ====================

describe('parseExtractionResponse — 空/null 输入返回空结构', () => {
  it('null → { entities: [], concepts: [] }', () => {
    const result = parseExtractionResponse(null);
    assert.deepEqual(result.entities, []);
    assert.deepEqual(result.concepts, []);
  });

  it('空字符串 → 空结构', () => {
    const result = parseExtractionResponse('');
    assert.deepEqual(result.entities, []);
    assert.deepEqual(result.concepts, []);
  });

  it('非字符串 → 空结构', () => {
    const result = parseExtractionResponse(12345);
    assert.deepEqual(result.entities, []);
    assert.deepEqual(result.concepts, []);
  });
});

describe('parseExtractionResponse — 解析直接 JSON', () => {
  it('合法 JSON → 正确提取实体和概念', () => {
    const json = JSON.stringify({
      entities: [
        { name: 'Docker', type: 'tool', description: '容器化工具', relatedEntryIds: [1] },
      ],
      concepts: [
        { name: '容器化', description: '应用打包技术', relatedEntryIds: [1] },
      ],
    });
    const result = parseExtractionResponse(json);
    assert.equal(result.entities.length, 1);
    assert.equal(result.entities[0].name, 'Docker');
    assert.equal(result.entities[0].type, 'tool');
    assert.deepEqual(result.entities[0].relatedEntryIds, [1]);
    assert.equal(result.concepts.length, 1);
    assert.equal(result.concepts[0].name, '容器化');
  });
});

describe('parseExtractionResponse — markdown 代码块包裹的 JSON', () => {
  it('```json ... ``` → 正确解析', () => {
    const wrapped = '```json\n{"entities":[{"name":"React","type":"framework","description":"UI 框架","relatedEntryIds":[2]}],"concepts":[]}\n```';
    const result = parseExtractionResponse(wrapped);
    assert.equal(result.entities.length, 1);
    assert.equal(result.entities[0].name, 'React');
    assert.equal(result.entities[0].type, 'framework');
    assert.deepEqual(result.concepts, []);
  });
});

describe('parseExtractionResponse — 解析失败返回空结构', () => {
  it('非法文本 → 空结构（不抛异常）', () => {
    const result = parseExtractionResponse('this is not json at all!!!');
    assert.deepEqual(result.entities, []);
    assert.deepEqual(result.concepts, []);
  });
});

describe('parseExtractionResponse — 实体类型归一化', () => {
  it('小写类型如 "tool" 保持不变', () => {
    const json = JSON.stringify({
      entities: [{ name: 'Git', type: 'tool', description: 'VCS' }],
      concepts: [],
    });
    const result = parseExtractionResponse(json);
    assert.equal(result.entities[0].type, 'tool');
  });

  it('大写 "TOOL" → 归一化为 "tool"', () => {
    const json = JSON.stringify({
      entities: [{ name: 'Git', type: 'TOOL', description: 'VCS' }],
      concepts: [],
    });
    const result = parseExtractionResponse(json);
    assert.equal(result.entities[0].type, 'tool');
  });

  it('未知类型保留原值', () => {
    const json = JSON.stringify({
      entities: [{ name: 'Thing', type: 'custom_type', description: '' }],
      concepts: [],
    });
    const result = parseExtractionResponse(json);
    assert.equal(result.entities[0].type, 'custom_type');
  });

  it('缺失 name 的实体被过滤掉', () => {
    const json = JSON.stringify({
      entities: [
        { type: 'tool', description: 'no name' },
        { name: 'Valid', type: 'tool', description: 'ok' },
      ],
      concepts: [],
    });
    const result = parseExtractionResponse(json);
    assert.equal(result.entities.length, 1);
    assert.equal(result.entities[0].name, 'Valid');
  });
});

// ==================== 文件名清理 ====================

describe('sanitizeFilename — 空/null 返回 unnamed', () => {
  it('null → "unnamed"', () => {
    assert.equal(sanitizeFilename(null), 'unnamed');
  });

  it('空字符串 → "unnamed"', () => {
    assert.equal(sanitizeFilename(''), 'unnamed');
  });

  it('非字符串 → "unnamed"', () => {
    assert.equal(sanitizeFilename(123), 'unnamed');
  });
});

describe('sanitizeFilename — 替换不安全字符', () => {
  it('包含 / : * ? 等 → 替换为 -', () => {
    const result = sanitizeFilename('file/name:*?"<>|test');
    assert.ok(!result.includes('/'));
    assert.ok(!result.includes(':'));
    assert.ok(!result.includes('*'));
    assert.ok(!result.includes('?'));
    assert.ok(!result.includes('"'));
    assert.ok(!result.includes('<'));
    assert.ok(!result.includes('>'));
    assert.ok(!result.includes('|'));
    assert.ok(result.includes('-'));
  });

  it('连续多个 - 合并为单个', () => {
    const result = sanitizeFilename('a---b');
    assert.ok(!result.includes('--'));
    assert.equal(result, 'a-b');
  });

  it('首尾 - 被去除', () => {
    const result = sanitizeFilename('--hello--');
    assert.equal(result, 'hello');
  });
});

describe('sanitizeFilename — 截断超长名称', () => {
  it('超过 100 字符截断', () => {
    const longName = 'a'.repeat(150);
    const result = sanitizeFilename(longName);
    assert.ok(result.length <= 100);
  });
});

// ==================== Markdown 生成 ====================

describe('generateEntityMarkdown — 实体页生成', () => {
  it('含 YAML frontmatter、标题、类型标签、概述', () => {
    const entity = {
      name: 'Docker',
      type: 'tool',
      description: '容器化平台',
      relatedEntries: [{ id: 1, title: '什么是 Docker?' }],
      relatedEntities: ['Kubernetes'],
    };
    const md = generateEntityMarkdown(entity);
    assert.ok(md.includes('---'));
    assert.ok(md.includes('title: "Docker"'));
    assert.ok(md.includes('type: entity'));
    assert.ok(md.includes('entity_type: "tool"'));
    assert.ok(md.includes('# Docker'));
    assert.ok(md.includes('容器化平台'));
    assert.ok(md.includes('什么是 Docker?'));
    assert.ok(md.includes('[[Kubernetes]]'));
  });

  it('最少字段 → 不含相关问答和关联实体章节', () => {
    const entity = { name: 'Minimal', type: 'other', description: 'desc' };
    const md = generateEntityMarkdown(entity);
    assert.ok(md.includes('# Minimal'));
    assert.ok(!md.includes('## 相关问答'));
    assert.ok(!md.includes('## 关联实体'));
  });
});

describe('generateConceptMarkdown — 概念页生成', () => {
  it('含 YAML frontmatter、标题、概述', () => {
    const concept = {
      name: '微服务架构',
      description: '将应用拆分为小型服务的架构模式',
      relatedEntries: [{ id: 5, title: '微服务入门' }],
      relatedEntities: ['Docker', 'Kubernetes'],
    };
    const md = generateConceptMarkdown(concept);
    assert.ok(md.includes('title: "微服务架构"'));
    assert.ok(md.includes('type: concept'));
    assert.ok(md.includes('# 微服务架构'));
    assert.ok(md.includes('将应用拆分为小型服务'));
    assert.ok(md.includes('微服务入门'));
    assert.ok(md.includes('[[Docker]]'));
  });

  it('无关联 → 不含关联技术章节', () => {
    const concept = { name: 'Test', description: 'd' };
    const md = generateConceptMarkdown(concept);
    assert.ok(!md.includes('## 关联技术'));
  });
});

// ==================== 索引生成 ====================

describe('buildEntityIndex — 索引包含实体和概念', () => {
  it('多类型实体分组 + 概念列表', () => {
    const entities = [
      { name: 'Docker', type: 'tool', description: '容器化工具', relatedEntryIds: [1] },
      { name: 'React', type: 'framework', description: 'UI 框架', relatedEntryIds: [2] },
      { name: 'Linus Torvalds', type: 'person', description: 'Linux 之父', relatedEntryIds: [] },
    ];
    const concepts = [
      { name: '容器化', description: '打包技术', relatedEntryIds: [1] },
    ];
    const index = buildEntityIndex(entities, concepts);
    assert.ok(index.includes('# 实体与概念索引'));
    assert.ok(index.includes('实体: 3 个'));
    assert.ok(index.includes('概念: 1 个'));
    assert.ok(index.includes('Docker'));
    assert.ok(index.includes('React'));
    assert.ok(index.includes('容器化'));
    // 按类型分组标题
    assert.ok(index.includes('工具'));
    assert.ok(index.includes('框架'));
  });

  it('空实体和概念 → 仍生成标题', () => {
    const index = buildEntityIndex([], []);
    assert.ok(index.includes('# 实体与概念索引'));
    assert.ok(index.includes('实体: 0 个'));
    assert.ok(index.includes('概念: 0 个'));
  });
});

// ==================== 常量验证 ====================

describe('ENTITY_TYPES — 常量包含 9 种类型', () => {
  it('PERSON/TOOL/FRAMEWORK/API/LANGUAGE/PLATFORM/LIBRARY/SERVICE/OTHER', () => {
    assert.equal(ENTITY_TYPES.PERSON, 'person');
    assert.equal(ENTITY_TYPES.TOOL, 'tool');
    assert.equal(ENTITY_TYPES.FRAMEWORK, 'framework');
    assert.equal(ENTITY_TYPES.API, 'api');
    assert.equal(ENTITY_TYPES.LANGUAGE, 'language');
    assert.equal(ENTITY_TYPES.PLATFORM, 'platform');
    assert.equal(ENTITY_TYPES.LIBRARY, 'library');
    assert.equal(ENTITY_TYPES.SERVICE, 'service');
    assert.equal(ENTITY_TYPES.OTHER, 'other');
    assert.equal(Object.keys(ENTITY_TYPES).length, 9);
  });
});

// ==================== 批量提取 ====================

describe('extractEntities — 空条目返回空结果', () => {
  it('null entries → { entities: [], concepts: [] }', async () => {
    const result = await extractEntities(null, {});
    assert.deepEqual(result.entities, []);
    assert.deepEqual(result.concepts, []);
  });

  it('空数组 → 空结果', async () => {
    const result = await extractEntities([], {});
    assert.deepEqual(result.entities, []);
    assert.deepEqual(result.concepts, []);
  });
});

