/**
 * 测试 lib/contradiction-detector.js — L2.3 矛盾检测
 *
 * 覆盖场景：
 *   1-4:   buildContradictionPrompt — 提示词构建
 *   5-12:  parseContradictionResponse — AI 响应解析
 *   13-16: detectContradictions — 主检测流程
 *   17-19: findCandidateEntries — 候选条目筛选
 *   20-22: extractVersionNumbers — 版本号提取
 *   23-25: detectVersionContradictions — 版本号矛盾快速检测
 *   26-28: severity / type 过滤与格式化
 *   29-31: buildContradictionWarningHtml — UI 告警 HTML 生成
 *   32-34: 边界条件与错误处理
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRADICTION_SEVERITY,
  CONTRADICTION_TYPE,
  buildContradictionPrompt,
  parseContradictionResponse,
  detectContradictions,
  findCandidateEntries,
  extractVersionNumbers,
  detectVersionContradictions,
  filterContradictions,
  buildContradictionWarningHtml,
} from '../lib/contradiction-detector.js';

// ==================== Test Data ====================

const newEntry = {
  id: 10,
  title: 'React 19 新特性',
  question: 'React 19 有哪些新特性？',
  answer: 'React 19 引入了 React Compiler，支持自动记忆化。React 18 使用的是 Concurrent Mode，而 React 19 将其设为默认行为。新的 use() hook 可以在渲染中读取 Promise 和 Context。',
  tags: ['react', 'javascript', 'frontend'],
  sourceUrl: 'https://react.dev/blog/2024/react-19',
  createdAt: '2026-04-30T10:00:00Z',
};

const existingEntry1 = {
  id: 1,
  title: 'React 18 Concurrent Mode',
  question: '什么是 React 的 Concurrent Mode？',
  answer: 'React 18 引入了 Concurrent Mode，这是一个可选功能，需要使用 createRoot API 显式启用。它允许 React 中断渲染以处理高优先级更新。React 17 不支持 Concurrent Mode。',
  tags: ['react', 'javascript'],
  sourceUrl: 'https://react.dev/blog/2022/react-18',
  createdAt: '2026-01-15T10:00:00Z',
};

const existingEntry2 = {
  id: 2,
  title: 'Docker 容器入门',
  question: '什么是 Docker？',
  answer: 'Docker 是一个容器化平台。Docker 24.0 引入了 BuildKit 作为默认构建器。',
  tags: ['docker', 'devops'],
  sourceUrl: 'https://docs.docker.com',
  createdAt: '2026-02-20T10:00:00Z',
};

const existingEntry3 = {
  id: 3,
  title: 'React 18 Hooks 使用',
  question: '如何使用 React Hooks？',
  answer: 'React Hooks 在 React 16.8 引入。useState 和 useEffect 是最常用的。React 18 新增了 useId、useTransition 等 Hooks。所有 Hooks 都需要在组件顶层调用。',
  tags: ['react', 'hooks'],
  sourceUrl: 'https://react.dev/reference/react',
  createdAt: '2026-03-10T10:00:00Z',
};

/** 模拟 AI 矛盾检测响应 */
const mockContradictionResponse = JSON.stringify({
  contradictions: [
    {
      existingEntryId: 1,
      description: '新回答称 Concurrent Mode 在 React 19 中成为默认行为，但已有知识记录它是 React 18 的可选功能，需要显式启用。这可能反映了版本间的政策变化。',
      severity: 'medium',
      type: 'fact_change',
      conflictingFacts: {
        new: 'React 19 将 Concurrent Mode 设为默认行为',
        existing: 'React 18 的 Concurrent Mode 是可选功能，需使用 createRoot 显式启用',
      },
    },
  ],
});

/** 创建模拟 AI 客户端 */
function createMockAI(response) {
  return {
    async chat(messages, options) {
      return { content: response };
    },
  };
}

// ==================== 测试 ====================

// --- 1-4: buildContradictionPrompt ---

describe('contradiction-detector — buildContradictionPrompt', () => {
  it('生成的提示词包含新条目的标题和问题', () => {
    const prompt = buildContradictionPrompt(newEntry, [existingEntry1]);
    assert.ok(prompt.includes('React 19 新特性'));
    assert.ok(prompt.includes('React 19 有哪些新特性'));
  });

  it('生成的提示词包含已有条目的信息', () => {
    const prompt = buildContradictionPrompt(newEntry, [existingEntry1]);
    assert.ok(prompt.includes('React 18 Concurrent Mode'));
    assert.ok(prompt.includes('Concurrent Mode'));
  });

  it('多个已有条目都被包含在提示词中', () => {
    const prompt = buildContradictionPrompt(newEntry, [existingEntry1, existingEntry3]);
    assert.ok(prompt.includes('[ID: 1]'));
    assert.ok(prompt.includes('[ID: 3]'));
  });

  it('空已有条目列表时返回合理的提示词', () => {
    const prompt = buildContradictionPrompt(newEntry, []);
    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.length > 0);
    assert.ok(prompt.includes('React 19 新特性'));
  });
});

// --- 5-12: parseContradictionResponse ---

describe('contradiction-detector — parseContradictionResponse', () => {
  it('解析标准 JSON 响应', () => {
    const result = parseContradictionResponse(mockContradictionResponse);
    assert.ok(Array.isArray(result.contradictions));
    assert.equal(result.contradictions.length, 1);
    assert.equal(result.contradictions[0].existingEntryId, 1);
    assert.equal(result.contradictions[0].severity, 'medium');
    assert.equal(result.contradictions[0].type, 'fact_change');
  });

  it('解析 markdown 代码块包裹的 JSON', () => {
    const wrapped = '```json\n' + mockContradictionResponse + '\n```';
    const result = parseContradictionResponse(wrapped);
    assert.equal(result.contradictions.length, 1);
    assert.equal(result.contradictions[0].existingEntryId, 1);
  });

  it('解析空矛盾列表', () => {
    const response = JSON.stringify({ contradictions: [] });
    const result = parseContradictionResponse(response);
    assert.deepEqual(result.contradictions, []);
  });

  it('null 输入返回空结构', () => {
    const result = parseContradictionResponse(null);
    assert.deepEqual(result.contradictions, []);
  });

  it('非字符串输入返回空结构', () => {
    const result = parseContradictionResponse(123);
    assert.deepEqual(result.contradictions, []);
  });

  it('无效 JSON 返回空结构', () => {
    const result = parseContradictionResponse('not json at all');
    assert.deepEqual(result.contradictions, []);
  });

  it('缺少 contradictions 字段返回空结构', () => {
    const result = parseContradictionResponse(JSON.stringify({ data: 'something' }));
    assert.deepEqual(result.contradictions, []);
  });

  it('自动规范化不合法的 severity 值', () => {
    const response = JSON.stringify({
      contradictions: [{
        existingEntryId: 1,
        description: '测试',
        severity: 'extreme',
        type: 'fact_change',
      }],
    });
    const result = parseContradictionResponse(response);
    assert.equal(result.contradictions[0].severity, 'low');
  });
});

// --- 13-16: detectContradictions ---

describe('contradiction-detector — detectContradictions', () => {
  it('检测到矛盾时返回矛盾列表（AI 检测 + 版本启发式）', async () => {
    const ai = createMockAI(mockContradictionResponse);
    const result = await detectContradictions(newEntry, [existingEntry1], ai);
    assert.ok(Array.isArray(result.contradictions));
    // AI 检测到 1 条 fact_change + 版本启发式可能发现版本差异
    assert.ok(result.contradictions.length >= 1);
    // 至少包含 AI 检测到的矛盾
    const aiDetected = result.contradictions.find(c => c.type === 'fact_change');
    assert.ok(aiDetected, '应包含 AI 检测到的 fact_change 类型矛盾');
    assert.equal(aiDetected.existingEntryId, 1);
    assert.ok(aiDetected.description.length > 0);
  });

  it('无矛盾时返回空列表（使用无版本号的条目）', async () => {
    const noVersionEntry = {
      ...newEntry,
      answer: 'React Compiler 支持自动记忆化，是一个优化工具。',
    };
    const noVersionExisting = {
      ...existingEntry1,
      answer: 'React 是一个用于构建用户界面的 JavaScript 库。',
    };
    const noContradiction = JSON.stringify({ contradictions: [] });
    const ai = createMockAI(noContradiction);
    const result = await detectContradictions(noVersionEntry, [noVersionExisting], ai);
    assert.deepEqual(result.contradictions, []);
  });

  it('AI 调用失败时安全降级，保留版本启发式结果', async () => {
    const ai = {
      async chat() { throw new Error('API error'); },
    };
    // 使用有版本号的条目，版本启发式应仍然工作
    const result = await detectContradictions(newEntry, [existingEntry1], ai);
    assert.ok(Array.isArray(result.contradictions));
    // 版本启发式检测到 React 19 vs React 17/18 的差异
    assert.ok(result.contradictions.length >= 1);
    assert.ok(result.contradictions.every(c => c.type === 'version_conflict'));
  });

  it('AI 调用失败 + 无版本号条目 = 空结果', async () => {
    const noVersionEntry = {
      ...newEntry,
      answer: 'React Compiler 支持自动记忆化。',
    };
    const noVersionExisting = {
      ...existingEntry1,
      answer: 'React 是一个 UI 库。',
    };
    const ai = {
      async chat() { throw new Error('API error'); },
    };
    const result = await detectContradictions(noVersionEntry, [noVersionExisting], ai);
    assert.deepEqual(result.contradictions, []);
  });

  it('已有条目为空时跳过 AI 调用，直接返回空', async () => {
    let chatCalled = false;
    const ai = {
      async chat() { chatCalled = true; return { content: '' }; },
    };
    const result = await detectContradictions(newEntry, [], ai);
    assert.deepEqual(result.contradictions, []);
    assert.equal(chatCalled, false);
  });
});

// --- 17-19: findCandidateEntries ---

describe('contradiction-detector — findCandidateEntries', () => {
  it('通过共享标签找到相关条目', () => {
    const candidates = findCandidateEntries(newEntry, [existingEntry1, existingEntry2, existingEntry3]);
    assert.ok(candidates.some(e => e.id === 1));
    assert.ok(candidates.some(e => e.id === 3));
    assert.ok(!candidates.some(e => e.id === 2));
  });

  it('无共享标签时返回空数组', () => {
    const entry = { ...newEntry, tags: ['python', 'ml'] };
    const candidates = findCandidateEntries(entry, [existingEntry1, existingEntry2]);
    assert.equal(candidates.length, 0);
  });

  it('支持实体名称匹配', () => {
    const entryWithEntities = {
      ...newEntry,
      tags: [],
      entities: [{ name: 'Docker' }],
    };
    const existingWithEntities = [
      { ...existingEntry1, tags: [], entities: [{ name: 'React' }] },
      { ...existingEntry2, tags: [], entities: [{ name: 'Docker' }] },
    ];
    const candidates = findCandidateEntries(entryWithEntities, existingWithEntities);
    assert.ok(candidates.some(e => e.id === 2));
  });

  it('限制候选条目数量（默认最大 20）', () => {
    const manyEntries = Array.from({ length: 30 }, (_, i) => ({
      id: 100 + i,
      title: `Entry ${i}`,
      question: `Question ${i}?`,
      answer: `Answer ${i}`,
      tags: ['react'],
    }));
    const candidates = findCandidateEntries(newEntry, manyEntries);
    assert.ok(candidates.length <= 20);
  });
});

// --- 20-22: extractVersionNumbers ---

describe('contradiction-detector — extractVersionNumbers', () => {
  it('提取标准版本号', () => {
    const versions = extractVersionNumbers('React 19 引入了新特性，React 18 使用 Concurrent Mode');
    assert.ok(versions.length >= 2);
    const versionStrings = versions.map(v => v.version);
    assert.ok(versionStrings.some(v => v.includes('19')));
    assert.ok(versionStrings.some(v => v.includes('18')));
  });

  it('提取带前缀的版本号', () => {
    const versions = extractVersionNumbers('Docker v24.0 引入了 BuildKit');
    assert.ok(versions.length >= 1);
    assert.ok(versions.some(v => v.version.includes('24.0') || v.version.includes('24')));
  });

  it('无版本号时返回空数组', () => {
    const versions = extractVersionNumbers('这是一个关于编程的通用问题');
    assert.equal(versions.length, 0);
  });

  it('提取 Node.js 版本格式', () => {
    const versions = extractVersionNumbers('Node.js 22.22.2 和 Node 18.x');
    assert.ok(versions.length >= 1);
  });
});

// --- 23-25: detectVersionContradictions ---

describe('contradiction-detector — detectVersionContradictions', () => {
  it('检测版本号矛盾', () => {
    const newAns = 'React 19 引入了新的编译器，React 18 Concurrent Mode 是可选的';
    const existingAns = 'React 18 引入了 Concurrent Mode，这是默认行为';
    const result = detectVersionContradictions(newAns, existingAns, 1);
    assert.ok(Array.isArray(result));
  });

  it('无版本矛盾时返回空数组', () => {
    const newAns = 'Docker 是容器化平台';
    const existingAns = 'Kubernetes 是容器编排系统';
    const result = detectVersionContradictions(newAns, existingAns, 1);
    assert.equal(result.length, 0);
  });

  it('null 输入返回空数组', () => {
    const result = detectVersionContradictions(null, 'text', 1);
    assert.equal(result.length, 0);
    const result2 = detectVersionContradictions('text', null, 1);
    assert.equal(result2.length, 0);
  });
});

// --- 26-28: filterContradictions ---

describe('contradiction-detector — filterContradictions', () => {
  const contradictions = [
    { existingEntryId: 1, severity: 'high', type: 'fact_change', description: '高严重性' },
    { existingEntryId: 2, severity: 'low', type: 'outdated', description: '低严重性' },
    { existingEntryId: 3, severity: 'medium', type: 'version_conflict', description: '中严重性' },
  ];

  it('按严重性过滤', () => {
    const high = filterContradictions(contradictions, { minSeverity: 'high' });
    assert.equal(high.length, 1);
    assert.equal(high[0].severity, 'high');
  });

  it('按类型过滤', () => {
    const versionOnly = filterContradictions(contradictions, { types: ['version_conflict'] });
    assert.equal(versionOnly.length, 1);
    assert.equal(versionOnly[0].type, 'version_conflict');
  });

  it('空列表返回空数组', () => {
    const result = filterContradictions([], {});
    assert.deepEqual(result, []);
  });
});

// --- 29-31: buildContradictionWarningHtml ---

describe('contradiction-detector — buildContradictionWarningHtml', () => {
  const contradictions = [
    {
      existingEntryId: 1,
      description: '新回答称 Concurrent Mode 在 React 19 中成为默认行为',
      severity: 'medium',
      type: 'fact_change',
      conflictingFacts: {
        new: 'React 19 将 Concurrent Mode 设为默认行为',
        existing: 'React 18 的 Concurrent Mode 是可选功能',
      },
    },
  ];

  it('生成包含警告图标的 HTML', () => {
    const html = buildContradictionWarningHtml(contradictions, { existingEntryTitle: 'React 18 Concurrent Mode' });
    assert.ok(html.includes('⚠️'));
    assert.ok(typeof html === 'string');
    assert.ok(html.length > 0);
  });

  it('包含矛盾描述', () => {
    const html = buildContradictionWarningHtml(contradictions);
    assert.ok(html.includes('Concurrent Mode'));
    assert.ok(html.includes('React 19'));
  });

  it('包含操作按钮', () => {
    const html = buildContradictionWarningHtml(contradictions);
    assert.ok(html.includes('查看'));
    assert.ok(html.includes('忽略'));
  });

  it('多个矛盾都显示', () => {
    const multiple = [
      ...contradictions,
      {
        existingEntryId: 3,
        description: '另一条矛盾',
        severity: 'high',
        type: 'version_conflict',
      },
    ];
    const html = buildContradictionWarningHtml(multiple);
    assert.ok(html.includes('Concurrent Mode'));
    assert.ok(html.includes('另一条矛盾'));
  });

  it('空矛盾列表返回空字符串', () => {
    const html = buildContradictionWarningHtml([]);
    assert.equal(html, '');
  });
});

// --- 32-34: 边界条件 ---

describe('contradiction-detector — 边界条件', () => {
  it('CONTRADICTION_SEVERITY 常量包含 high / medium / low', () => {
    assert.equal(CONTRADICTION_SEVERITY.HIGH, 'high');
    assert.equal(CONTRADICTION_SEVERITY.MEDIUM, 'medium');
    assert.equal(CONTRADICTION_SEVERITY.LOW, 'low');
  });

  it('CONTRADICTION_TYPE 常量包含预期类型', () => {
    assert.equal(CONTRADICTION_TYPE.FACT_CHANGE, 'fact_change');
    assert.equal(CONTRADICTION_TYPE.VERSION_CONFLICT, 'version_conflict');
    assert.equal(CONTRADICTION_TYPE.OUTDATED, 'outdated');
    assert.equal(CONTRADICTION_TYPE.DEFINITIONAL, 'definitional');
  });

  it('buildContradictionPrompt 截断过长的已有条目答案', () => {
    const longAnswerEntry = {
      ...existingEntry1,
      answer: 'A'.repeat(2000),
    };
    const prompt = buildContradictionPrompt(newEntry, [longAnswerEntry]);
    assert.ok(!prompt.includes('A'.repeat(2000)));
    assert.ok(prompt.includes('A'.repeat(100)));
  });

  it('parseContradictionResponse 处理多余的文本包裹', () => {
    const wrapped = '好的，我来分析一下。\n\n' + mockContradictionResponse + '\n\n以上是我的分析。';
    const result = parseContradictionResponse(wrapped);
    assert.equal(result.contradictions.length, 1);
  });

  it('detectContradictions 记录检测时间戳', async () => {
    const ai = createMockAI(mockContradictionResponse);
    const result = await detectContradictions(newEntry, [existingEntry1], ai);
    assert.ok(result.detectedAt);
    assert.ok(new Date(result.detectedAt).getTime() > 0);
  });

  it('parseContradictionResponse 正确归一化 severity 大小写', () => {
    const response = JSON.stringify({
      contradictions: [
        { existingEntryId: 1, description: 'test', severity: 'HIGH', type: 'fact_change' },
        { existingEntryId: 2, description: 'test', severity: 'Medium', type: 'fact_change' },
        { existingEntryId: 3, description: 'test', severity: 'low', type: 'fact_change' },
      ],
    });
    const result = parseContradictionResponse(response);
    assert.equal(result.contradictions[0].severity, 'high');
    assert.equal(result.contradictions[1].severity, 'medium');
    assert.equal(result.contradictions[2].severity, 'low');
  });
});
