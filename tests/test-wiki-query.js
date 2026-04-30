/**
 * 测试 lib/wiki-query.js — L3.4 LLM Wiki 查询引擎
 *
 * 覆盖场景：
 *   1-2:   estimateTokens — Token 估算
 *   3-6:   extractKeywords — 关键词提取
 *   7-10:  scorePage — 页面评分
 *   11-18: selectRelevantPages — 智能选择相关页面
 *   19-24: buildWikiContext — 上下文构建
 *   25-27: buildWikiSystemPrompt — 系统提示词
 *   28-30: buildWikiQuestionPrompt — 用户消息
 *   31-35: extractPageReferences — 引用提取
 *   36-38: isAnswerWorthArchiving — 归档判断
 *   39-41: buildAnswerArchivePrompt — 归档提示词
 *   42-45: WikiQueryEngine — 集成测试
 *   46-50: 边界条件与错误处理
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_QUERY_OPTIONS,
  estimateTokens,
  extractKeywords,
  scorePage,
  selectRelevantPages,
  buildWikiContext,
  buildWikiSystemPrompt,
  buildWikiQuestionPrompt,
  extractPageReferences,
  isAnswerWorthArchiving,
  buildAnswerArchivePrompt,
  WikiQueryEngine,
} from '../lib/wiki-query.js';

// ==================== Test Data ====================

const samplePages = [
  {
    id: 'entity:react',
    type: 'entity',
    title: 'React',
    content: '# React\n\nReact 是一个用于构建用户界面的 JavaScript 框架。\n\n## 相关知识\n- [[qa:1]]\n- [[qa:3]]',
    tags: ['框架', 'framework'],
  },
  {
    id: 'entity:docker',
    type: 'entity',
    title: 'Docker',
    content: '# Docker\n\nDocker 是一个开源的容器化平台，用于自动化应用程序的部署。',
    tags: ['工具', 'tool'],
  },
  {
    id: 'concept:containerization',
    type: 'concept',
    title: '容器化',
    content: '# 容器化\n\n容器化是一种轻量级的虚拟化技术，将应用及其依赖打包到一个可移植的容器中。',
    tags: ['概念'],
  },
  {
    id: 'qa:1',
    type: 'qa',
    title: 'React 19 新特性',
    content: '# React 19 新特性\n\n## 问题\nReact 19 有什么新特性?\n\n## 回答\nReact 19 引入了 Server Components 和 Actions。',
    tags: ['react', 'frontend'],
    metadata: { entryId: 1, sourceUrl: 'https://react.dev/blog' },
  },
  {
    id: 'qa:2',
    type: 'qa',
    title: 'Docker 入门',
    content: '# Docker 入门\n\n## 问题\n什么是 Docker?\n\n## 回答\nDocker 是一个开源的容器化平台。',
    tags: ['docker', 'devops'],
    metadata: { entryId: 2 },
  },
  {
    id: 'qa:3',
    type: 'qa',
    title: 'Git 分支策略',
    content: '# Git 分支策略\n\n## 问题\nGit 分支策略有哪些?\n\n## 回答\n常见的有 Git Flow、GitHub Flow 和 Trunk-Based Development。',
    tags: ['git', 'workflow'],
    metadata: { entryId: 3 },
  },
];

// ==================== 1-2: estimateTokens ====================

describe('estimateTokens', () => {
  it('should estimate tokens for Chinese text', () => {
    const tokens = estimateTokens('这是一段中文文本');
    assert.ok(tokens > 0);
    assert.ok(tokens <= 10); // ~8 chars → ~3 tokens
  });

  it('should return 0 for empty/null input', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
    assert.equal(estimateTokens(123), 0);
  });
});

// ==================== 3-6: extractKeywords ====================

describe('extractKeywords', () => {
  it('should extract meaningful keywords from Chinese question', () => {
    const keywords = extractKeywords('React 有什么新特性?');
    assert.ok(keywords.includes('react'));
    assert.ok(keywords.includes('新特性'));
  });

  it('should extract keywords from English question', () => {
    const keywords = extractKeywords('What are Docker containers?');
    assert.ok(keywords.includes('docker'));
    assert.ok(keywords.includes('containers'));
  });

  it('should filter stop words', () => {
    const keywords = extractKeywords('请问怎么使用 Docker?');
    // "怎么" and "使用" are not stop words but common query words
    // "请" and "问" should be filtered (请 is a stop word)
    assert.ok(!keywords.includes('请'));
    assert.ok(keywords.includes('docker'));
  });

  it('should return empty for invalid input', () => {
    assert.deepEqual(extractKeywords(''), []);
    assert.deepEqual(extractKeywords(null), []);
    assert.deepEqual(extractKeywords(undefined), []);
    assert.deepEqual(extractKeywords(123), []);
  });
});

// ==================== 7-10: scorePage ====================

describe('scorePage', () => {
  it('should score higher for title match', () => {
    const score = scorePage(samplePages[0], ['react']);
    assert.ok(score >= 5); // title includes "React"
  });

  it('should score for tag match', () => {
    const page = { id: 'test', title: 'Test', content: '', tags: ['react', 'frontend'] };
    const score = scorePage(page, ['react']);
    assert.ok(score >= 3); // tag match
  });

  it('should score for content match', () => {
    const page = { id: 'test', title: 'Unrelated', content: 'This mentions react somewhere', tags: [] };
    const score = scorePage(page, ['react']);
    assert.ok(score >= 1); // content match
  });

  it('should return 0 for no keywords or invalid input', () => {
    assert.equal(scorePage(null, ['react']), 0);
    assert.equal(scorePage(samplePages[0], []), 0);
    assert.equal(scorePage(samplePages[0], null), 0);
  });
});

// ==================== 11-18: selectRelevantPages ====================

describe('selectRelevantPages', () => {
  it('should return empty for empty pages', () => {
    assert.deepEqual(selectRelevantPages([], 'React?'), []);
    assert.deepEqual(selectRelevantPages(null, 'React?'), []);
  });

  it('should return empty for empty question', () => {
    assert.deepEqual(selectRelevantPages(samplePages, ''), []);
    assert.deepEqual(selectRelevantPages(samplePages, null), []);
  });

  it('should select React-related pages for React question', () => {
    const result = selectRelevantPages(samplePages, 'React 新特性是什么?');
    assert.ok(result.length > 0);
    // React entity or React 19 QA should be in top results
    const ids = result.map(p => p.id);
    assert.ok(ids.some(id => id.includes('react')));
  });

  it('should select Docker-related pages for Docker question', () => {
    const result = selectRelevantPages(samplePages, 'Docker 容器怎么用?');
    assert.ok(result.length > 0);
    const ids = result.map(p => p.id);
    assert.ok(ids.some(id => id.includes('docker')));
  });

  it('should respect maxPages limit', () => {
    const result = selectRelevantPages(samplePages, '什么是容器化? Docker 和 Git 的关系?', { maxPages: 2 });
    assert.ok(result.length <= 2);
  });

  it('should sort by relevance (higher score first)', () => {
    const result = selectRelevantPages(samplePages, 'Docker 容器化');
    // Docker entity should score higher than Git
    if (result.length >= 2) {
      // The first result should be more relevant
      const firstId = result[0].id;
      assert.ok(firstId.includes('docker') || firstId.includes('container'));
    }
  });

  it('should return pages when question has no matching keywords', () => {
    // Pure English stop words — no valid keywords after filtering
    const result = selectRelevantPages(samplePages, 'the is are');
    // When all keywords are stop words, extractKeywords returns empty → returns first N pages
    assert.ok(result.length > 0);
  });

  it('should handle pages without content gracefully', () => {
    const pages = [
      { id: 'test:1', type: 'entity', title: 'Test', content: '', tags: [] },
    ];
    const result = selectRelevantPages(pages, 'Test');
    assert.ok(result.length >= 0); // Should not crash
  });
});

// ==================== 19-24: buildWikiContext ====================

describe('buildWikiContext', () => {
  it('should return empty string for empty pages', () => {
    assert.equal(buildWikiContext([]), '');
    assert.equal(buildWikiContext(null), '');
  });

  it('should format pages with type and title', () => {
    const context = buildWikiContext([samplePages[0]]);
    assert.ok(context.includes('[实体]'));
    assert.ok(context.includes('React'));
  });

  it('should include page content', () => {
    const context = buildWikiContext([samplePages[0]]);
    assert.ok(context.includes('JavaScript 框架'));
  });

  it('should separate multiple pages with blank lines', () => {
    const context = buildWikiContext([samplePages[0], samplePages[1]]);
    assert.ok(context.includes('[实体] React'));
    assert.ok(context.includes('[实体] Docker'));
    // Pages are separated by double newline
    const sections = context.split('\n\n').filter(s => s.startsWith('##'));
    assert.ok(sections.length >= 2);
  });

  it('should respect maxTokens budget by truncating', () => {
    const context = buildWikiContext(samplePages, { maxTokens: 50 });
    // With very small token budget, should be truncated
    assert.ok(context.length < samplePages.reduce((sum, p) => sum + (p.content || '').length, 0));
  });

  it('should support custom formatter', () => {
    const context = buildWikiContext([samplePages[0]], {
      formatter: (page) => `CUSTOM: ${page.title}`,
    });
    assert.ok(context.startsWith('CUSTOM: React'));
  });
});

// ==================== 25-27: buildWikiSystemPrompt ====================

describe('buildWikiSystemPrompt', () => {
  it('should return non-empty string', () => {
    const prompt = buildWikiSystemPrompt();
    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.length > 0);
  });

  it('should contain key instructions', () => {
    const prompt = buildWikiSystemPrompt();
    assert.ok(prompt.includes('Wiki'));
    assert.ok(prompt.includes('引用'));
  });

  it('should mention source attribution format', () => {
    const prompt = buildWikiSystemPrompt();
    assert.ok(prompt.includes('来源'));
  });
});

// ==================== 28-30: buildWikiQuestionPrompt ====================

describe('buildWikiQuestionPrompt', () => {
  it('should include context and question', () => {
    const prompt = buildWikiQuestionPrompt('wiki context here', 'What is React?');
    assert.ok(prompt.includes('wiki context here'));
    assert.ok(prompt.includes('What is React?'));
  });

  it('should handle empty context', () => {
    const prompt = buildWikiQuestionPrompt('', 'What is React?');
    assert.ok(prompt.includes('没有找到'));
    assert.ok(prompt.includes('What is React?'));
  });

  it('should return empty for empty question', () => {
    assert.equal(buildWikiQuestionPrompt('context', ''), '');
    assert.equal(buildWikiQuestionPrompt('context', null), '');
  });
});

// ==================== 31-35: extractPageReferences ====================

describe('extractPageReferences', () => {
  const pageMap = new Map();
  for (const page of samplePages) {
    pageMap.set(page.id, page);
  }

  it('should extract references by title', () => {
    const response = '根据 [来源: React] 的内容，React 19 引入了新特性。';
    const refs = extractPageReferences(response, pageMap);
    assert.ok(refs.length === 1);
    assert.equal(refs[0].id, 'entity:react');
  });

  it('should extract references by pageId', () => {
    const response = '参见 [来源: React](entity:react)。';
    const refs = extractPageReferences(response, pageMap);
    assert.ok(refs.length === 1);
    assert.equal(refs[0].id, 'entity:react');
  });

  it('should handle multiple references', () => {
    const response = '根据 [来源: React] 和 [来源: Docker](entity:docker)，可以...';
    const refs = extractPageReferences(response, pageMap);
    assert.equal(refs.length, 2);
  });

  it('should deduplicate references', () => {
    const response = '参考 [来源: React] ... 再次参考 [来源: React]';
    const refs = extractPageReferences(response, pageMap);
    assert.equal(refs.length, 1);
  });

  it('should return empty for no references', () => {
    const response = '这是一段没有引用的回答。';
    const refs = extractPageReferences(response, pageMap);
    assert.deepEqual(refs, []);
  });
});

// ==================== 36-38: isAnswerWorthArchiving ====================

describe('isAnswerWorthArchiving', () => {
  it('should return true for substantial answer', () => {
    const answer = 'Docker 是一个开源的容器化平台，它允许开发者将应用程序及其依赖打包到轻量级、可移植的容器中。容器可以在任何支持 Docker 的环境中运行，确保应用行为的一致性。Docker 的核心概念包括镜像(image)、容器(container)和仓库(registry)。';
    assert.equal(isAnswerWorthArchiving('What is Docker?', answer), true);
  });

  it('should return false for short answer', () => {
    assert.equal(isAnswerWorthArchiving('Q?', '是的'), false);
    assert.equal(isAnswerWorthArchiving('Q?', ''), false);
  });

  it('should return false for error messages', () => {
    const answer = '⚠️ API 调用失败，请检查网络连接。';
    assert.equal(isAnswerWorthArchiving('Q?', answer), false);
  });
});

// ==================== 39-41: buildAnswerArchivePrompt ====================

describe('buildAnswerArchivePrompt', () => {
  it('should generate archive prompt with question and answer', () => {
    const prompt = buildAnswerArchivePrompt('What is Docker?', 'Docker is a container platform...');
    assert.ok(prompt.includes('What is Docker?'));
    assert.ok(prompt.includes('Docker is a container platform'));
    assert.ok(prompt.includes('JSON'));
  });

  it('should request title extraction', () => {
    const prompt = buildAnswerArchivePrompt('test question', 'test answer with enough content');
    assert.ok(prompt.includes('title'));
  });

  it('should request tags', () => {
    const prompt = buildAnswerArchivePrompt('test question', 'test answer with enough content');
    assert.ok(prompt.includes('tags'));
  });

  it('should return empty for missing inputs', () => {
    assert.equal(buildAnswerArchivePrompt('', 'answer'), '');
    assert.equal(buildAnswerArchivePrompt('question', ''), '');
    assert.equal(buildAnswerArchivePrompt(null, null), '');
  });
});

// ==================== 42-45: WikiQueryEngine ====================

describe('WikiQueryEngine', () => {
  it('should prepare query with all components', () => {
    const engine = new WikiQueryEngine();
    const result = engine.prepareQuery(samplePages, 'React 新特性');

    assert.ok(Array.isArray(result.selectedPages));
    assert.ok(typeof result.context === 'string');
    assert.ok(typeof result.systemPrompt === 'string');
    assert.ok(typeof result.userPrompt === 'string');
    assert.ok(result.stats.totalPages > 0);
  });

  it('should extract references from response', () => {
    const engine = new WikiQueryEngine();
    const response = '根据 [来源: React] 的内容...';
    const refs = engine.extractReferences(response, samplePages);
    assert.ok(refs.length === 1);
    assert.equal(refs[0].title, 'React');
  });

  it('should prepare archive for good answers', () => {
    const engine = new WikiQueryEngine();
    const longAnswer = 'Docker 是一个开源的容器化平台。'.repeat(10);
    const archive = engine.prepareArchive('What is Docker?', longAnswer);
    assert.ok(archive !== null);
    assert.equal(archive.worthArchiving, true);
    assert.ok(typeof archive.archivePrompt === 'string');
  });

  it('should return null archive for short answers', () => {
    const engine = new WikiQueryEngine();
    const archive = engine.prepareArchive('Q?', 'no');
    assert.equal(archive, null);
  });
});

// ==================== 46-50: 边界条件 ====================

describe('edge cases', () => {
  it('selectRelevantPages should handle pages with undefined fields', () => {
    const pages = [
      { id: 'a' },  // missing title, content, tags
      { id: 'b', title: null, content: undefined, tags: null },
    ];
    const result = selectRelevantPages(pages, 'test');
    assert.ok(Array.isArray(result));
    // Should not crash
  });

  it('buildWikiContext should handle null page in array', () => {
    const context = buildWikiContext([null, samplePages[0], undefined]);
    assert.ok(context.includes('React'));
  });

  it('extractPageReferences should handle non-Map pageMap', () => {
    assert.deepEqual(extractPageReferences('test', null), []);
    assert.deepEqual(extractPageReferences('test', undefined), []);
    assert.deepEqual(extractPageReferences('test', {}), []);
  });

  it('extractKeywords should handle mixed Chinese/English', () => {
    const keywords = extractKeywords('React 框架和 Docker 容器的关系');
    assert.ok(keywords.includes('react'));
    assert.ok(keywords.includes('docker'));
    assert.ok(keywords.includes('框架'));
    assert.ok(keywords.includes('容器'));
  });

  it('WikiQueryEngine should use custom options', () => {
    const engine = new WikiQueryEngine({ maxPages: 2, maxTokens: 500 });
    const result = engine.prepareQuery(samplePages, 'React Docker Git');
    assert.ok(result.selectedPages.length <= 2);
  });
});
