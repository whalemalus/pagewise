/**
 * QA002 功能正确性测试（第二轮） — Wiki 链接模块
 *
 * 测试范围：
 *   Wiki 页面创建、wikilink 解析与渲染、双向链接（反向链接索引）、
 *   页面搜索、类型/标签过滤、断链检测、WikiStore 集成、
 *   WikiQueryEngine 查询流程
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  WIKI_PAGE_TYPE,
  buildPageId,
  parsePageId,
  entityToWikiPage,
  conceptToWikiPage,
  entryToWikiPage,
  extractWikilinks,
  renderWikilinks,
  buildBacklinkIndex,
  buildPageMap,
  getOutlinks,
  searchPages,
  filterByType,
  filterByTags,
  paginate,
  WikiStore,
} from '../lib/wiki-store.js';

import {
  extractKeywords,
  scorePage,
  selectRelevantPages,
  buildWikiContext,
  buildWikiSystemPrompt,
  buildWikiQuestionPrompt,
  extractPageReferences,
  isAnswerWorthArchiving,
  WikiQueryEngine,
} from '../lib/wiki-query.js';

// ==================== 测试数据 ====================

const entities = [
  { name: 'react', displayName: 'React', type: 'framework', description: 'JS 框架', entryIds: [1, 3], createdAt: '2026-05-01T00:00:00Z' },
  { name: 'docker', displayName: 'Docker', type: 'tool', description: '容器化工具', entryIds: [2], createdAt: '2026-05-01T01:00:00Z' },
  { name: 'python', displayName: 'Python', type: 'language', description: '编程语言', entryIds: [1, 2, 4], createdAt: '2026-05-01T02:00:00Z' },
];

const concepts = [
  { name: 'containerization', displayName: '容器化', description: '轻量级虚拟化', entryIds: [2], createdAt: '2026-05-01T03:00:00Z' },
  { name: 'spa', displayName: '单页应用', description: 'SPA 架构', entryIds: [1, 3], createdAt: '2026-05-01T04:00:00Z' },
];

const entries = [
  { id: 1, title: 'React 基础', question: '什么是 React?', answer: 'React 是 JS 框架', tags: ['react', 'frontend'], sourceUrl: 'https://react.dev', createdAt: '2026-05-01T00:00:00Z' },
  { id: 2, title: 'Docker 入门', question: '什么是 Docker?', answer: 'Docker 是容器化平台', tags: ['docker', 'devops'], sourceUrl: 'https://docker.com', createdAt: '2026-05-01T01:00:00Z' },
  { id: 3, title: 'Git 分支策略', question: 'Git Flow?', answer: 'Git Flow 是分支模型', tags: ['git', 'workflow'], createdAt: '2026-05-01T02:00:00Z' },
  { id: 4, title: 'Python 数据分析', question: 'Python 分析?', answer: 'Pandas + NumPy', tags: ['python', 'data'], createdAt: '2026-05-01T03:00:00Z' },
];

// ==================== 1. 创建 Wiki 页面 ====================

describe('QA002-wiki: 创建 Wiki 页面', () => {
  it('entityToWikiPage 生成正确的页面结构', () => {
    const page = entityToWikiPage(entities[0]);
    assert.ok(page);
    assert.equal(page.id, 'entity:react');
    assert.equal(page.type, 'entity');
    assert.equal(page.title, 'React');
    assert.ok(page.content.includes('JS 框架'));
    assert.ok(page.content.includes('[[qa:1]]'));
    assert.ok(page.content.includes('[[qa:3]]'));
    assert.deepEqual(page.metadata.entryCount, 2);
  });

  it('conceptToWikiPage 生成正确的页面结构', () => {
    const page = conceptToWikiPage(concepts[0]);
    assert.ok(page);
    assert.equal(page.id, 'concept:containerization');
    assert.equal(page.type, 'concept');
    assert.ok(page.content.includes('轻量级虚拟化'));
    assert.ok(page.tags.includes('概念'));
  });

  it('entryToWikiPage 生成正确的页面结构', () => {
    const page = entryToWikiPage(entries[0]);
    assert.ok(page);
    assert.equal(page.id, 'qa:1');
    assert.equal(page.type, 'qa');
    assert.equal(page.title, 'React 基础');
    assert.ok(page.content.includes('JS 框架'));
    assert.ok(page.content.includes('react.dev'));
  });

  it('buildPageId 正确拼接 type:identifier', () => {
    assert.equal(buildPageId('entity', 'react'), 'entity:react');
    assert.equal(buildPageId('qa', 42), 'qa:42');
    assert.equal(buildPageId('', 'test'), '');
    assert.equal(buildPageId('entity', null), '');
  });

  it('parsePageId 正确反解', () => {
    assert.deepEqual(parsePageId('entity:react'), { type: 'entity', identifier: 'react' });
    assert.deepEqual(parsePageId('qa:42'), { type: 'qa', identifier: '42' });
    assert.equal(parsePageId(null), null);
    assert.equal(parsePageId('bad'), null);
    assert.equal(parsePageId('unknown:x'), null);
  });
});

// ==================== 2. 双向链接（反向链接） ====================

describe('QA002-wiki: 双向链接', () => {
  it('buildBacklinkIndex 正确计算反向链接', () => {
    const pages = [
      { id: 'entity:react', content: '参见 [[qa:1]] 和 [[concept:spa]]' },
      { id: 'qa:1', content: '内容' },
      { id: 'concept:spa', content: 'SPA 参见 [[entity:react]]' },
    ];
    const index = buildBacklinkIndex(pages);
    assert.deepEqual(index.get('entity:react'), ['concept:spa']);
    assert.deepEqual(index.get('qa:1'), ['entity:react']);
    assert.deepEqual(index.get('concept:spa'), ['entity:react']);
  });

  it('多个页面链接到同一目标时，反向链接包含所有来源', () => {
    const pages = [
      { id: 'page:a', content: '[[target]]' },
      { id: 'page:b', content: '[[target]]' },
      { id: 'page:c', content: '[[target]]' },
      { id: 'target', content: '' },
    ];
    const index = buildBacklinkIndex(pages);
    const backlinks = index.get('target');
    assert.equal(backlinks.length, 3);
    assert.ok(backlinks.includes('page:a'));
    assert.ok(backlinks.includes('page:b'));
    assert.ok(backlinks.includes('page:c'));
  });

  it('无链接的页面反向链接为空数组', () => {
    const pages = [
      { id: 'orphan', content: '独立页面，无链接' },
      { id: 'other', content: '[[orphan]]' },
    ];
    const index = buildBacklinkIndex(pages);
    assert.deepEqual(index.get('orphan'), ['other']);
    assert.deepEqual(index.get('other'), []);
  });

  it('WikiStore getBacklinks 集成测试', () => {
    const store = new WikiStore();
    store.loadAll(entities, concepts, entries);

    // qa:1 被 entity:react, concept:spa, entity:python 链接
    const backlinks = store.getBacklinks('qa:1');
    const sourceTitles = backlinks.map(p => p.title);
    assert.ok(sourceTitles.includes('React'));
    assert.ok(sourceTitles.includes('单页应用'));
  });

  it('WikiStore getOutlinksFromPage 返回出站链接页面', () => {
    const store = new WikiStore();
    store.loadAll(entities, concepts, entries);

    const outlinks = store.getOutlinksFromPage('entity:react');
    const ids = outlinks.map(p => p.id);
    assert.ok(ids.includes('qa:1'));
    assert.ok(ids.includes('qa:3'));
  });
});

// ==================== 3. Wikilink 解析与渲染 ====================

describe('QA002-wiki: Wikilink 解析与渲染', () => {
  it('extractWikilinks 提取所有 [[...]]', () => {
    const text = '见 [[entity:react]] 和 [[concept:spa]] 以及 [[qa:1]]';
    const links = extractWikilinks(text);
    assert.equal(links.length, 3);
    assert.deepEqual(links, ['entity:react', 'concept:spa', 'qa:1']);
  });

  it('无 wikilink 时返回空数组', () => {
    assert.deepEqual(extractWikilinks('纯文本无链接'), []);
    assert.deepEqual(extractWikilinks(null), []);
  });

  it('renderWikilinks 将有效链接替换为 HTML 锚点', () => {
    const pages = entities.map(e => entityToWikiPage(e));
    const pageMap = buildPageMap(pages);
    const html = renderWikilinks('见 [[entity:react]]', pageMap);
    assert.ok(html.includes('<a'));
    assert.ok(html.includes('data-wiki-page="entity:react"'));
    assert.ok(html.includes('React'));
    assert.ok(html.includes('wiki-link'));
  });

  it('renderWikilinks 对断链仍生成锚点，但文本为 pageId', () => {
    const html = renderWikilinks('见 [[entity:nonexistent]]', new Map());
    assert.ok(html.includes('entity:nonexistent'));
    assert.ok(html.includes('<a'), '断链也生成锚点标签');
    assert.ok(html.includes('class="wiki-link"'), '断链仍使用 wiki-link 类');
  });

  it('自定义 cssClass 生效', () => {
    const html = renderWikilinks('[[entity:x]]', new Map(), { cssClass: 'my-link' });
    assert.ok(html.includes('my-link'));
  });
});

// ==================== 4. 断链检测 ====================

describe('QA002-wiki: 断链检测', () => {
  it('buildPageMap 能检测有效链接', () => {
    const allPages = [
      ...entities.map(e => entityToWikiPage(e)),
      ...concepts.map(c => conceptToWikiPage(c)),
      ...entries.map(e => entryToWikiPage(e)),
    ];
    const pageMap = buildPageMap(allPages);
    assert.ok(pageMap.has('entity:react'), '有效链接目标存在');
    assert.ok(pageMap.has('qa:1'), '有效链接目标存在');
  });

  it('对不存在的页面 resolveWikilink 返回 null', () => {
    const store = new WikiStore();
    store.loadAll(entities, concepts, entries);
    assert.equal(store.resolveWikilink('entity:nonexistent'), null);
    assert.equal(store.resolveWikilink('qa:999'), null);
  });

  it('outlinks 中包含断链（目标不在 pageMap 中）', () => {
    // 构造一个引用不存在页面的 wiki 页面
    const pages = [
      { id: 'entity:a', content: '链接 [[entity:broken]]', title: 'A' },
      { id: 'entity:b', content: '正常', title: 'B' },
    ];
    const pageMap = buildPageMap(pages);
    const outlinks = getOutlinks(pages[0]);
    assert.ok(outlinks.includes('entity:broken'));
    assert.ok(!pageMap.has('entity:broken'), '断链目标不在 pageMap 中');
  });
});

// ==================== 5. 图谱查询（搜索与过滤） ====================

describe('QA002-wiki: 搜索与过滤', () => {
  it('searchPages 按标题匹配并排序', () => {
    const allPages = [
      ...entities.map(e => entityToWikiPage(e)),
      ...concepts.map(c => conceptToWikiPage(c)),
      ...entries.map(e => entryToWikiPage(e)),
    ];
    const results = searchPages(allPages, 'React');
    assert.ok(results.length >= 2);
    // entity 精确匹配得分最高
    assert.equal(results[0].id, 'entity:react');
  });

  it('filterByType 返回指定类型页面', () => {
    const allPages = [
      ...entities.map(e => entityToWikiPage(e)),
      ...concepts.map(c => conceptToWikiPage(c)),
      ...entries.map(e => entryToWikiPage(e)),
    ];
    const entityPages = filterByType(allPages, 'entity');
    assert.equal(entityPages.length, 3);
    assert.ok(entityPages.every(p => p.type === 'entity'));
  });

  it('filterByType 支持多类型筛选', () => {
    const allPages = [
      ...entities.map(e => entityToWikiPage(e)),
      ...concepts.map(c => conceptToWikiPage(c)),
      ...entries.map(e => entryToWikiPage(e)),
    ];
    const filtered = filterByType(allPages, ['entity', 'concept']);
    assert.equal(filtered.length, 5); // 3 entities + 2 concepts
  });

  it('filterByTags 支持 OR 逻辑', () => {
    const pages = entries.map(e => entryToWikiPage(e));
    const filtered = filterByTags(pages, ['react', 'docker']);
    assert.equal(filtered.length, 2);
  });

  it('filterByTags 大小写不敏感', () => {
    const pages = entries.map(e => entryToWikiPage(e));
    const filtered = filterByTags(pages, 'REACT');
    assert.equal(filtered.length, 1);
  });
});

// ==================== 6. WikiStore 集成 ====================

describe('QA002-wiki: WikiStore 集成', () => {
  it('loadAll 返回正确的统计信息', () => {
    const store = new WikiStore();
    const stats = store.loadAll(entities, concepts, entries);
    assert.equal(stats.entityCount, 3);
    assert.equal(stats.conceptCount, 2);
    assert.equal(stats.qaCount, 4);
    assert.equal(stats.total, 9);
  });

  it('loadAll 后 isLoaded 返回 true', () => {
    const store = new WikiStore();
    assert.ok(!store.isLoaded());
    store.loadAll(entities, concepts, entries);
    assert.ok(store.isLoaded());
  });

  it('clear 后 isLoaded 返回 false 且数据为空', () => {
    const store = new WikiStore();
    store.loadAll(entities, concepts, entries);
    store.clear();
    assert.ok(!store.isLoaded());
    assert.equal(store.getAllPages().length, 0);
    assert.equal(store.getStats().total, 0);
  });

  it('getAllTags 返回去重排序的标签列表', () => {
    const store = new WikiStore();
    store.loadAll(entities, concepts, entries);
    const tags = store.getAllTags();
    assert.ok(tags.includes('react'));
    assert.ok(tags.includes('docker'));
    assert.ok(tags.includes('概念'));
    // 标签列表应已排序
    for (let i = 1; i < tags.length; i++) {
      assert.ok(tags[i - 1] <= tags[i], '标签应按字典序排列');
    }
  });

  it('getPaginated 正确分页', () => {
    const store = new WikiStore();
    store.loadAll(entities, concepts, entries);
    const page1 = store.getPaginated(1, 5);
    assert.equal(page1.items.length, 5);
    assert.equal(page1.total, 9);
    assert.equal(page1.totalPages, 2);

    const page2 = store.getPaginated(2, 5);
    assert.equal(page2.items.length, 4);
  });

  it('renderWikilinks 通过 store 渲染内容中的链接', () => {
    const store = new WikiStore();
    store.loadAll(entities, concepts, entries);

    const entityPage = store.getPage('entity:react');
    const html = store.renderWikilinks(entityPage.content);
    assert.ok(html.includes('<a'));
    assert.ok(html.includes('wiki-link'));
  });
});

// ==================== 7. WikiQueryEngine 查询流程 ====================

describe('QA002-wiki: WikiQueryEngine 查询', () => {
  const allPages = [
    ...entities.map(e => entityToWikiPage(e)),
    ...concepts.map(c => conceptToWikiPage(c)),
    ...entries.map(e => entryToWikiPage(e)),
  ];

  it('prepareQuery 选中相关页面并构建上下文', () => {
    const engine = new WikiQueryEngine();
    const result = engine.prepareQuery(allPages, '什么是 React 框架?');
    assert.ok(result.selectedPages.length > 0);
    assert.ok(result.context.length > 0);
    assert.ok(result.systemPrompt.includes('知识库助手'));
    assert.ok(result.userPrompt.includes('什么是 React'));
    assert.ok(result.stats.selectedCount > 0);
  });

  it('extractReferences 从 AI 回答中提取引用', () => {
    const engine = new WikiQueryEngine();
    const response = 'React 是一个框架 [来源: React]，也用于 SPA [来源: 单页应用]';
    const refs = engine.extractReferences(response, allPages);
    assert.ok(refs.length >= 1);
    const titles = refs.map(p => p.title);
    assert.ok(titles.includes('React') || titles.includes('单页应用'));
  });

  it('prepareArchive 对长回答返回归档信息', () => {
    const engine = new WikiQueryEngine();
    const longAnswer = '这是一个非常详细的回答，'.repeat(20) + '包含了很多有价值的知识点。';
    const result = engine.prepareArchive('测试问题', longAnswer);
    assert.ok(result);
    assert.ok(result.worthArchiving);
    assert.ok(result.archivePrompt.length > 0);
  });

  it('prepareArchive 对短回答返回 null', () => {
    const engine = new WikiQueryEngine();
    assert.equal(engine.prepareArchive('q', '短'), null);
  });
});

// ==================== 8. 分页 ====================

describe('QA002-wiki: paginate', () => {
  it('正确分页', () => {
    const items = Array.from({ length: 33 }, (_, i) => ({ id: i }));
    const result = paginate(items, 2, 10);
    assert.equal(result.items.length, 10);
    assert.equal(result.items[0].id, 10);
    assert.equal(result.total, 33);
    assert.equal(result.totalPages, 4);
  });

  it('超出范围页码自动修正到最后一页', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const result = paginate(items, 99, 10);
    assert.equal(result.page, 1);
    assert.equal(result.items.length, 5);
  });

  it('空数组返回空结果', () => {
    const result = paginate([], 1, 10);
    assert.equal(result.items.length, 0);
    assert.equal(result.total, 0);
    assert.equal(result.totalPages, 1);
  });
});
