/**
 * 测试 lib/auto-classifier.js — L2.1 Q&A 自动分类
 *
 * 覆盖场景：
 *   1-4:   _buildClassificationPrompt — 分类提示词构建
 *   5-10:  _parseClassificationResponse — AI 响应解析
 *   11-14: classifyEntry — 单条分类主流程
 *   15-18: classifyBatch — 批量分类
 *   19-22: IndexedDB 存储操作（save / get）
 *   23-26: 扩展查询（byEntity / byConcept）
 *   27-29: 编译状态与统计
 *   30-31: rebuildAll 全量重编译
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import { AutoClassifier, CLASSIFICATION_STATUS } from '../lib/auto-classifier.js';
import { ENTITY_TYPES } from '../lib/entity-extractor.js';
import {
  installIndexedDBMock,
  resetIndexedDBMock,
  uninstallIndexedDBMock,
} from './helpers/indexeddb-mock.js';

// ==================== Test Data ====================

const sampleEntry = {
  id: 1,
  title: 'Docker 容器入门',
  question: '什么是 Docker？如何创建容器？',
  answer: 'Docker 是一个容器化平台，使用 Dockerfile 可以定义镜像。docker build 和 docker run 是核心命令。Kubernetes 可以编排多个 Docker 容器。',
  tags: ['docker', 'devops'],
  category: 'DevOps',
  sourceUrl: 'https://docs.docker.com/get-started',
  createdAt: '2026-04-01T10:00:00Z',
  updatedAt: '2026-04-01T10:00:00Z',
};

const sampleEntry2 = {
  id: 2,
  title: 'React Hooks 详解',
  question: '如何使用 React Hooks？',
  answer: 'React Hooks 是 React 16.8 引入的特性。useState 和 useEffect 是最常用的 Hooks。它们允许在函数组件中使用状态和副作用。',
  tags: ['react', 'javascript', 'frontend'],
  category: 'Frontend',
  sourceUrl: 'https://react.dev/reference/react',
  createdAt: '2026-04-02T10:00:00Z',
  updatedAt: '2026-04-02T10:00:00Z',
};

const sampleClassificationResult = {
  entities: [
    {
      name: 'Docker',
      type: 'tool',
      description: '容器化平台，用于打包、分发和运行应用',
    },
    {
      name: 'Kubernetes',
      type: 'platform',
      description: '容器编排系统，用于管理多个 Docker 容器',
    },
  ],
  concepts: [
    {
      name: '容器化',
      description: '将应用及其依赖打包到轻量级容器中的技术',
    },
    {
      name: 'Dockerfile',
      description: '定义 Docker 镜像构建步骤的文本文件',
    },
  ],
};

const sampleClassificationJSON = JSON.stringify(sampleClassificationResult);

/** 创建模拟 AI 客户端 */
function createMockAI(response) {
  return {
    async chat(messages, options) {
      return { content: response };
    },
  };
}

// ==================== Tests ====================

describe('auto-classifier — _buildClassificationPrompt', () => {
  let classifier;

  beforeEach(() => {
    resetIndexedDBMock();
    classifier = new AutoClassifier(createMockAI(''));
  });

  it('生成的提示词包含条目标题和问题', () => {
    const prompt = classifier._buildClassificationPrompt(sampleEntry);
    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.includes(sampleEntry.title), '应包含标题');
    assert.ok(prompt.includes(sampleEntry.question), '应包含问题');
  });

  it('生成的提示词包含条目回答内容', () => {
    const prompt = classifier._buildClassificationPrompt(sampleEntry);
    assert.ok(prompt.includes('容器化平台') || prompt.includes('Docker'), '应包含回答关键词');
  });

  it('生成的提示词要求 JSON 格式返回', () => {
    const prompt = classifier._buildClassificationPrompt(sampleEntry);
    assert.ok(prompt.includes('JSON') || prompt.includes('json'), '应要求 JSON 格式');
  });

  it('生成的提示词包含实体类型说明', () => {
    const prompt = classifier._buildClassificationPrompt(sampleEntry);
    assert.ok(
      prompt.includes('tool') || prompt.includes('framework') || prompt.includes('工具'),
      '应提及实体类型'
    );
  });
});

describe('auto-classifier — _parseClassificationResponse', () => {
  let classifier;

  beforeEach(() => {
    resetIndexedDBMock();
    classifier = new AutoClassifier(createMockAI(''));
  });

  it('正确解析标准 JSON 响应', () => {
    const result = classifier._parseClassificationResponse(sampleClassificationJSON);
    assert.equal(result.entities.length, 2, '应有 2 个实体');
    assert.equal(result.concepts.length, 2, '应有 2 个概念');
  });

  it('解析后的实体包含必要字段', () => {
    const result = classifier._parseClassificationResponse(sampleClassificationJSON);
    const entity = result.entities[0];
    assert.ok(entity.name, '应有 name');
    assert.ok(entity.type, '应有 type');
    assert.ok(entity.description, '应有 description');
  });

  it('解析后的概念包含必要字段', () => {
    const result = classifier._parseClassificationResponse(sampleClassificationJSON);
    const concept = result.concepts[0];
    assert.ok(concept.name, '应有 name');
    assert.ok(concept.description, '应有 description');
  });

  it('处理 markdown 代码块包裹的 JSON', () => {
    const wrapped = '```json\n' + sampleClassificationJSON + '\n```';
    const result = classifier._parseClassificationResponse(wrapped);
    assert.equal(result.entities.length, 2);
    assert.equal(result.concepts.length, 2);
  });

  it('无效 JSON 返回空结构', () => {
    const result = classifier._parseClassificationResponse('not valid json');
    assert.ok(Array.isArray(result.entities), 'entities 应为数组');
    assert.equal(result.entities.length, 0, 'entities 应为空');
    assert.ok(Array.isArray(result.concepts), 'concepts 应为数组');
    assert.equal(result.concepts.length, 0, 'concepts 应为空');
  });

  it('null/undefined 输入返回空结构', () => {
    const result1 = classifier._parseClassificationResponse(null);
    assert.equal(result1.entities.length, 0);
    const result2 = classifier._parseClassificationResponse(undefined);
    assert.equal(result2.entities.length, 0);
  });
});

describe('auto-classifier — classifyEntry', () => {
  beforeEach(() => {
    resetIndexedDBMock();
  });

  it('对单条 Q&A 进行分类，返回实体和概念', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    const result = await classifier.classifyEntry(sampleEntry);
    assert.ok(result.entities, '应包含 entities');
    assert.ok(result.concepts, '应包含 concepts');
    assert.equal(result.entities.length, 2, '应有 2 个实体');
    assert.equal(result.concepts.length, 2, '应有 2 个概念');
  });

  it('AI 调用失败时不抛出异常，返回空结构', async () => {
    const aiClient = {
      async chat() { throw new Error('API Error'); },
    };
    const classifier = new AutoClassifier(aiClient);
    const result = await classifier.classifyEntry(sampleEntry);
    assert.equal(result.entities.length, 0, '实体应为空');
    assert.equal(result.concepts.length, 0, '概念应为空');
  });

  it('空条目不调用 AI，直接返回空结构', async () => {
    let called = false;
    const aiClient = {
      async chat() { called = true; return { content: '[]' }; },
    };
    const classifier = new AutoClassifier(aiClient);
    const result = await classifier.classifyEntry(null);
    assert.equal(called, false, '不应调用 AI');
    assert.equal(result.entities.length, 0);
  });

  it('传入 model 选项时会传递给 AI 客户端', async () => {
    let receivedOptions = null;
    const aiClient = {
      async chat(messages, options) {
        receivedOptions = options;
        return { content: sampleClassificationJSON };
      },
    };
    const classifier = new AutoClassifier(aiClient);
    await classifier.classifyEntry(sampleEntry, { model: 'gpt-4o' });
    assert.ok(receivedOptions, '应传递选项');
    assert.equal(receivedOptions.model, 'gpt-4o');
  });
});

describe('auto-classifier — classifyBatch', () => {
  beforeEach(() => {
    resetIndexedDBMock();
  });

  it('批量分类多条 Q&A', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    const results = await classifier.classifyBatch([sampleEntry, sampleEntry2]);
    assert.ok(results instanceof Map, '应返回 Map');
    assert.equal(results.size, 2, '应有 2 个结果');
    assert.ok(results.has(1), '应包含条目 1');
    assert.ok(results.has(2), '应包含条目 2');
  });

  it('空数组返回空 Map', async () => {
    const aiClient = createMockAI('');
    const classifier = new AutoClassifier(aiClient);
    const results = await classifier.classifyBatch([]);
    assert.ok(results instanceof Map);
    assert.equal(results.size, 0);
  });

  it('单条失败不影响其他条目', async () => {
    let callCount = 0;
    const aiClient = {
      async chat() {
        callCount++;
        if (callCount === 1) throw new Error('First call fails');
        return { content: sampleClassificationJSON };
      },
    };
    const classifier = new AutoClassifier(aiClient);
    const results = await classifier.classifyBatch([sampleEntry, sampleEntry2]);
    assert.equal(results.size, 2, '应有 2 个结果');
    const first = results.get(1);
    assert.equal(first.entities.length, 0, '第一条应为空');
    const second = results.get(2);
    assert.ok(second.entities.length > 0, '第二条应有实体');
  });
});

describe('auto-classifier — IndexedDB 存储操作', () => {
  beforeEach(() => {
    resetIndexedDBMock();
    installIndexedDBMock();
  });

  after(() => {
    uninstallIndexedDBMock();
  });

  it('saveClassification 将实体和概念写入 IndexedDB', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    await classifier.saveClassification(1, sampleClassificationResult);

    const entities = await classifier.getAllEntities();
    assert.ok(entities.length >= 2, '应保存至少 2 个实体');

    const concepts = await classifier.getAllConcepts();
    assert.ok(concepts.length >= 2, '应保存至少 2 个概念');
  });

  it('getEntitiesByEntry 获取条目关联的实体', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    await classifier.saveClassification(1, sampleClassificationResult);

    const entities = await classifier.getEntitiesByEntry(1);
    assert.ok(entities.length >= 2, '应有至少 2 个关联实体');
    // 所有实体的 entryIds 应包含 1
    for (const e of entities) {
      assert.ok(e.entryIds.includes(1), `实体 ${e.name} 应关联到条目 1`);
    }
  });

  it('getConceptsByEntry 获取条目关联的概念', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    await classifier.saveClassification(1, sampleClassificationResult);

    const concepts = await classifier.getConceptsByEntry(1);
    assert.ok(concepts.length >= 2, '应有至少 2 个关联概念');
    for (const c of concepts) {
      assert.ok(c.entryIds.includes(1), `概念 ${c.name} 应关联到条目 1`);
    }
  });

  it('同名实体自动合并 entryIds', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    // 两次保存，同一个 Docker 实体关联到不同条目
    await classifier.saveClassification(1, sampleClassificationResult);
    await classifier.saveClassification(2, sampleClassificationResult);

    const entities = await classifier.getAllEntities();
    // 实体名存储为 lowercase（normalized），但有 displayName 保留原始大小写
    const docker = entities.find(e => e.displayName === 'Docker' || e.name === 'docker');
    assert.ok(docker, '应存在 Docker 实体');
    assert.ok(docker.entryIds.includes(1), '应关联条目 1');
    assert.ok(docker.entryIds.includes(2), '应关联条目 2');
  });
});

describe('auto-classifier — 扩展查询', () => {
  beforeEach(() => {
    resetIndexedDBMock();
    installIndexedDBMock();
  });

  after(() => {
    uninstallIndexedDBMock();
  });

  it('getEntriesByEntity 获取实体关联的条目 ID 列表', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    await classifier.saveClassification(1, sampleClassificationResult);
    const entryIds = await classifier.getEntriesByEntity('Docker');
    assert.ok(entryIds.includes(1), '应包含条目 ID 1');
  });

  it('getEntriesByConcept 获取概念关联的条目 ID 列表', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    await classifier.saveClassification(1, sampleClassificationResult);
    const entryIds = await classifier.getEntriesByConcept('容器化');
    assert.ok(entryIds.includes(1), '应包含条目 ID 1');
  });

  it('getEntriesByEntity 对不存在的实体返回空数组', async () => {
    const aiClient = createMockAI('');
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    const entryIds = await classifier.getEntriesByEntity('NonExistent');
    assert.equal(entryIds.length, 0, '应返回空数组');
  });

  it('getEntriesByConcept 对不存在的概念返回空数组', async () => {
    const aiClient = createMockAI('');
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    const entryIds = await classifier.getEntriesByConcept('NonExistent');
    assert.equal(entryIds.length, 0, '应返回空数组');
  });
});

describe('auto-classifier — 编译状态与统计', () => {
  beforeEach(() => {
    resetIndexedDBMock();
    installIndexedDBMock();
  });

  after(() => {
    uninstallIndexedDBMock();
  });

  it('getClassificationStatus 返回条目的分类状态', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    // 保存前状态
    const statusBefore = await classifier.getClassificationStatus(1);
    assert.equal(statusBefore, CLASSIFICATION_STATUS.UNCLASSIFIED);

    // 保存后状态
    await classifier.saveClassification(1, sampleClassificationResult);
    const statusAfter = await classifier.getClassificationStatus(1);
    assert.equal(statusAfter, CLASSIFICATION_STATUS.CLASSIFIED);
  });

  it('getStats 返回正确的统计数据', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    await classifier.saveClassification(1, sampleClassificationResult);

    const stats = await classifier.getStats();
    assert.ok(stats.entityCount >= 2, '实体数应 >= 2');
    assert.ok(stats.conceptCount >= 2, '概念数应 >= 2');
  });

  it('初始状态下统计为零', async () => {
    const aiClient = createMockAI('');
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    const stats = await classifier.getStats();
    assert.equal(stats.entityCount, 0, '初始实体数应为 0');
    assert.equal(stats.conceptCount, 0, '初始概念数应为 0');
  });
});

describe('auto-classifier — rebuildAll', () => {
  beforeEach(() => {
    resetIndexedDBMock();
    installIndexedDBMock();
  });

  after(() => {
    uninstallIndexedDBMock();
  });

  it('rebuildAll 清除旧数据后重新分类', async () => {
    const aiClient = createMockAI(sampleClassificationJSON);
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    // 先保存旧数据
    await classifier.saveClassification(1, sampleClassificationResult);

    // 重建
    await classifier.rebuildAll([sampleEntry, sampleEntry2], aiClient);

    // 验证结果（每条都重新分类了）
    const entities = await classifier.getAllEntities();
    assert.ok(entities.length > 0, '重建后应有实体');
  });

  it('空条目数组不调用 AI', async () => {
    let called = false;
    const aiClient = {
      async chat() { called = true; return { content: '[]' }; },
    };
    const classifier = new AutoClassifier(aiClient);
    await classifier._ensureInit();

    await classifier.rebuildAll([], aiClient);
    assert.equal(called, false, '空数组不应调用 AI');
  });
});

describe('auto-classifier — CLASSIFICATION_STATUS 常量', () => {
  it('包含 UNCLASSIFIED 和 CLASSIFIED', () => {
    assert.ok(CLASSIFICATION_STATUS.UNCLASSIFIED, '应有 UNCLASSIFIED');
    assert.ok(CLASSIFICATION_STATUS.CLASSIFIED, '应有 CLASSIFIED');
  });
});
