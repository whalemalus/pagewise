/**
 * 测试 lib/wiki-store.js — L3.1 Wiki 浏览模式数据层
 *
 * 覆盖场景：
 *   1-4:   buildPageId / parsePageId — 页面 ID 生成与解析
 *   5-8:   entityToWikiPage — 实体→Wiki页面转换
 *   9-12:  conceptToWikiPage — 概念→Wiki页面转换
 *   13-16: entryToWikiPage — Q&A→Wiki页面转换
 *   17-20: extractWikilinks — Wikilink 提取
 *   21-24: renderWikilinks — Wikilink 渲染为 HTML
 *   25-28: buildBacklinkIndex — 反向链接索引
 *   29-32: searchPages — 关键词搜索
 *   33-36: filterByType — 类型过滤
 *   37-40: filterByTags — 标签过滤
 *   41-44: paginate — 分页
 *   45-48: WikiStore 类 — 集成测试
 *   49-54: 边界条件与错误处理
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  WIKI_PAGE_TYPE,
  PAGE_TYPE_LABELS,
  PAGE_TYPE_ICONS,
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

// ==================== Test Data ====================

const sampleEntities = [
  {
    name: 'react',
    displayName: 'React',
    type: 'framework',
    description: '前端 JavaScript 框架',
    entryIds: [1, 3],
    createdAt: '2026-04-30T10:00:00Z',
    updatedAt: '2026-04-30T10:00:00Z',
  },
  {
    name: 'docker',
    displayName: 'Docker',
    type: 'tool',
    description: '容器化工具',
    entryIds: [2],
    createdAt: '2026-04-30T10:01:00Z',
    updatedAt: '2026-04-30T10:01:00Z',
  },
  {
    name: 'git',
    displayName: 'Git',
    type: 'tool',
    description: '分布式版本控制',
    entryIds: [2, 3],
    createdAt: '2026-04-30T10:02:00Z',
  },
];

const sampleConcepts = [
  {
    name: 'containerization',
    displayName: '容器化',
    description: '一种轻量级虚拟化技术',
    entryIds: [2],
    createdAt: '2026-04-30T10:03:00Z',
  },
  {
    name: 'component-based',
    displayName: '组件化开发',
    description: 'UI 设计模式',
    entryIds: [1, 3],
    createdAt: '2026-04-30T10:04:00Z',
  },
];

const sampleEntries = [
  {
    id: 1,
    title: 'React 19 新特性',
    question: 'React 19 有什么新特性?',
    answer: 'React 19 引入了 Server Components 和 Actions 等新特性。',
    tags: ['react', 'frontend'],
    sourceUrl: 'https://react.dev/blog',
    createdAt: '2026-04-30T10:00:00Z',
  },
  {
    id: 2,
    title: 'Docker 入门',
    question: '什么是 Docker?',
    answer: 'Docker 是一个开源的容器化平台。',
    tags: ['docker', 'devops'],
    sourceUrl: 'https://docs.docker.com',
    createdAt: '2026-04-30T10:01:00Z',
  },
  {
    id: 3,
    title: 'Git 分支策略',
    question: 'Git 分支策略有哪些?',
    answer: '常见的有 Git Flow、GitHub Flow 和 Trunk-Based Development。',
    tags: ['git', 'workflow'],
    createdAt: '2026-04-30T10:02:00Z',
  },
];

// ==================== 1-4: buildPageId / parsePageId ====================

describe('buildPageId', () => {
  it('should build entity page id', () => {
    assert.equal(buildPageId('entity', 'react'), 'entity:react');
  });

  it('should build concept page id', () => {
    assert.equal(buildPageId('concept', 'containerization'), 'concept:containerization');
  });

  it('should build qa page id with numeric id', () => {
    assert.equal(buildPageId('qa', 42), 'qa:42');
  });

  it('should return empty string for invalid inputs', () => {
    assert.equal(buildPageId('', 'react'), '');
    assert.equal(buildPageId('entity', null), '');
    assert.equal(buildPageId(null, 'test'), '');
  });
});

describe('parsePageId', () => {
  it('should parse entity page id', () => {
    const result = parsePageId('entity:react');
    assert.deepEqual(result, { type: 'entity', identifier: 'react' });
  });

  it('should parse concept page id', () => {
    const result = parsePageId('concept:containerization');
    assert.deepEqual(result, { type: 'concept', identifier: 'containerization' });
  });

  it('should parse qa page id', () => {
    const result = parsePageId('qa:42');
    assert.deepEqual(result, { type: 'qa', identifier: '42' });
  });

  it('should return null for invalid inputs', () => {
    assert.equal(parsePageId(null), null);
    assert.equal(parsePageId(''), null);
    assert.equal(parsePageId('invalid'), null);
    assert.equal(parsePageId(':empty'), null);
    assert.equal(parsePageId('unknown:test'), null);
  });
});

// ==================== 5-8: entityToWikiPage ====================

describe('entityToWikiPage', () => {
  it('should convert entity to wiki page', () => {
    const page = entityToWikiPage(sampleEntities[0]);
    assert.ok(page);
    assert.equal(page.id, 'entity:react');
    assert.equal(page.type, WIKI_PAGE_TYPE.ENTITY);
    assert.equal(page.title, 'React');
    assert.ok(page.content.includes('# React'));
    assert.ok(page.content.includes('前端 JavaScript 框架'));
    assert.ok(page.content.includes('[[qa:1]]'));
    assert.ok(page.content.includes('[[qa:3]]'));
    assert.deepEqual(page.metadata.entryCount, 2);
  });

  it('should handle entity without displayName', () => {
    const entity = { name: 'vue', type: 'framework', description: '渐进式框架', entryIds: [] };
    const page = entityToWikiPage(entity);
    assert.ok(page);
    assert.equal(page.title, 'vue');
  });

  it('should handle entity without description', () => {
    const entity = { name: 'test', type: 'other', entryIds: [] };
    const page = entityToWikiPage(entity);
    assert.ok(page);
    assert.ok(!page.content.includes('undefined'));
  });

  it('should return null for invalid entity', () => {
    assert.equal(entityToWikiPage(null), null);
    assert.equal(entityToWikiPage({}), null);
  });
});

// ==================== 9-12: conceptToWikiPage ====================

describe('conceptToWikiPage', () => {
  it('should convert concept to wiki page', () => {
    const page = conceptToWikiPage(sampleConcepts[0]);
    assert.ok(page);
    assert.equal(page.id, 'concept:containerization');
    assert.equal(page.type, WIKI_PAGE_TYPE.CONCEPT);
    assert.equal(page.title, '容器化');
    assert.ok(page.content.includes('轻量级虚拟化'));
    assert.ok(page.content.includes('[[qa:2]]'));
  });

  it('should handle concept without displayName', () => {
    const concept = { name: 'test-concept', description: '测试', entryIds: [] };
    const page = conceptToWikiPage(concept);
    assert.ok(page);
    assert.equal(page.title, 'test-concept');
  });

  it('should have concept tag', () => {
    const page = conceptToWikiPage(sampleConcepts[0]);
    assert.ok(page.tags.includes('概念'));
  });

  it('should return null for invalid concept', () => {
    assert.equal(conceptToWikiPage(null), null);
    assert.equal(conceptToWikiPage({}), null);
  });
});

// ==================== 13-16: entryToWikiPage ====================

describe('entryToWikiPage', () => {
  it('should convert entry to wiki page', () => {
    const page = entryToWikiPage(sampleEntries[0]);
    assert.ok(page);
    assert.equal(page.id, 'qa:1');
    assert.equal(page.type, WIKI_PAGE_TYPE.QA);
    assert.equal(page.title, 'React 19 新特性');
    assert.ok(page.content.includes('React 19'));
    assert.ok(page.content.includes('Server Components'));
    assert.ok(page.content.includes('react.dev'));
    assert.deepEqual(page.tags, ['react', 'frontend']);
  });

  it('should use question as fallback title', () => {
    const entry = { id: 99, answer: '答案', tags: [] };
    const page = entryToWikiPage(entry);
    assert.ok(page);
    assert.equal(page.title, '知识 #99');
  });

  it('should handle entry without tags', () => {
    const entry = { id: 5, title: '测试', question: '问题', answer: '答案' };
    const page = entryToWikiPage(entry);
    assert.ok(Array.isArray(page.tags));
    assert.equal(page.tags.length, 0);
  });

  it('should return null for null entry', () => {
    assert.equal(entryToWikiPage(null), null);
  });
});

// ==================== 17-20: extractWikilinks ====================

describe('extractWikilinks', () => {
  it('should extract wikilinks from text', () => {
    const text = '参见 [[entity:react]] 和 [[concept:containerization]]';
    const links = extractWikilinks(text);
    assert.deepEqual(links, ['entity:react', 'concept:containerization']);
  });

  it('should handle no wikilinks', () => {
    const text = '这是普通文本，没有链接';
    const links = extractWikilinks(text);
    assert.deepEqual(links, []);
  });

  it('should extract multiple wikilinks', () => {
    const text = '[[qa:1]] [[qa:2]] [[qa:3]]';
    const links = extractWikilinks(text);
    assert.equal(links.length, 3);
  });

  it('should handle empty and invalid input', () => {
    assert.deepEqual(extractWikilinks(null), []);
    assert.deepEqual(extractWikilinks(''), []);
    assert.deepEqual(extractWikilinks(123), []);
  });
});

// ==================== 21-24: renderWikilinks ====================

describe('renderWikilinks', () => {
  it('should render wikilinks as clickable HTML', () => {
    const text = '参见 [[entity:react]]';
    const pageMap = buildPageMap(sampleEntities.map(e => entityToWikiPage(e)));
    const html = renderWikilinks(text, pageMap);
    assert.ok(html.includes('<a'));
    assert.ok(html.includes('data-wiki-page="entity:react"'));
    assert.ok(html.includes('React'));
    assert.ok(html.includes('wiki-link'));
  });

  it('should use pageId as label when page not found', () => {
    const text = '链接 [[entity:nonexistent]]';
    const html = renderWikilinks(text, new Map());
    assert.ok(html.includes('entity:nonexistent'));
  });

  it('should handle custom css class', () => {
    const text = '[[entity:test]]';
    const html = renderWikilinks(text, new Map(), { cssClass: 'custom-link' });
    assert.ok(html.includes('custom-link'));
  });

  it('should handle null/empty text', () => {
    assert.equal(renderWikilinks(null, new Map()), '');
    assert.equal(renderWikilinks('', new Map()), '');
  });
});

// ==================== 25-28: buildBacklinkIndex ====================

describe('buildBacklinkIndex', () => {
  it('should build backlink index', () => {
    const pages = [
      { id: 'page:a', content: '链接到 [[page:b]]' },
      { id: 'page:b', content: '链接到 [[page:c]]' },
      { id: 'page:c', content: '没有链接' },
    ];
    const index = buildBacklinkIndex(pages);
    assert.deepEqual(index.get('page:a'), []);
    assert.deepEqual(index.get('page:b'), ['page:a']);
    assert.deepEqual(index.get('page:c'), ['page:b']);
  });

  it('should handle multiple backlinks', () => {
    const pages = [
      { id: 'page:a', content: '[[page:c]]' },
      { id: 'page:b', content: '[[page:c]]' },
      { id: 'page:c', content: '' },
    ];
    const index = buildBacklinkIndex(pages);
    const backlinks = index.get('page:c');
    assert.equal(backlinks.length, 2);
    assert.ok(backlinks.includes('page:a'));
    assert.ok(backlinks.includes('page:b'));
  });

  it('should handle empty array', () => {
    const index = buildBacklinkIndex([]);
    assert.equal(index.size, 0);
  });

  it('should handle null input', () => {
    const index = buildBacklinkIndex(null);
    assert.equal(index.size, 0);
  });
});

// ==================== 29-32: searchPages ====================

describe('searchPages', () => {
  const pages = [
    entityToWikiPage(sampleEntities[0]),   // React
    entityToWikiPage(sampleEntities[1]),   // Docker
    conceptToWikiPage(sampleConcepts[0]),  // 容器化
    entryToWikiPage(sampleEntries[0]),     // React 19
    entryToWikiPage(sampleEntries[2]),     // Git 分支策略
  ];

  it('should find pages by title', () => {
    const results = searchPages(pages, 'React');
    assert.ok(results.length >= 2);
    // Entity match should rank higher
    assert.equal(results[0].type, WIKI_PAGE_TYPE.ENTITY);
  });

  it('should find pages by tag', () => {
    const results = searchPages(pages, 'docker');
    assert.ok(results.length >= 1);
    assert.ok(results.some(p => p.title === 'Docker'));
  });

  it('should find pages by content', () => {
    const results = searchPages(pages, '容器化');
    assert.ok(results.length >= 1);
  });

  it('should return empty for no match', () => {
    const results = searchPages(pages, 'xyznonexistent');
    assert.equal(results.length, 0);
  });
});

// ==================== 33-36: filterByType ====================

describe('filterByType', () => {
  const pages = [
    entityToWikiPage(sampleEntities[0]),
    conceptToWikiPage(sampleConcepts[0]),
    entryToWikiPage(sampleEntries[0]),
    entryToWikiPage(sampleEntries[1]),
  ];

  it('should filter by single type', () => {
    const entities = filterByType(pages, WIKI_PAGE_TYPE.ENTITY);
    assert.equal(entities.length, 1);
    assert.equal(entities[0].type, WIKI_PAGE_TYPE.ENTITY);
  });

  it('should filter by multiple types', () => {
    const result = filterByType(pages, [WIKI_PAGE_TYPE.ENTITY, WIKI_PAGE_TYPE.CONCEPT]);
    assert.equal(result.length, 2);
  });

  it('should return empty for non-matching type', () => {
    const result = filterByType(pages, 'nonexistent');
    assert.equal(result.length, 0);
  });

  it('should handle null input', () => {
    assert.deepEqual(filterByType(null, 'entity'), []);
  });
});

// ==================== 37-40: filterByTags ====================

describe('filterByTags', () => {
  const pages = [
    entryToWikiPage(sampleEntries[0]),  // tags: ['react', 'frontend']
    entryToWikiPage(sampleEntries[1]),  // tags: ['docker', 'devops']
    entryToWikiPage(sampleEntries[2]),  // tags: ['git', 'workflow']
  ];

  it('should filter by single tag', () => {
    const result = filterByTags(pages, 'react');
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'React 19 新特性');
  });

  it('should filter by multiple tags (OR)', () => {
    const result = filterByTags(pages, ['react', 'docker']);
    assert.equal(result.length, 2);
  });

  it('should be case insensitive', () => {
    const result = filterByTags(pages, 'REACT');
    assert.equal(result.length, 1);
  });

  it('should return empty for no match', () => {
    const result = filterByTags(pages, 'nonexistent');
    assert.equal(result.length, 0);
  });
});

// ==================== 41-44: paginate ====================

describe('paginate', () => {
  const items = Array.from({ length: 55 }, (_, i) => ({ id: i + 1 }));

  it('should paginate correctly', () => {
    const result = paginate(items, 1, 20);
    assert.equal(result.items.length, 20);
    assert.equal(result.total, 55);
    assert.equal(result.totalPages, 3);
    assert.equal(result.page, 1);
  });

  it('should handle last page', () => {
    const result = paginate(items, 3, 20);
    assert.equal(result.items.length, 15);
    assert.equal(result.page, 3);
  });

  it('should clamp page to valid range', () => {
    const result = paginate(items, 100, 20);
    assert.equal(result.page, 3); // clamped to last page
  });

  it('should handle empty array', () => {
    const result = paginate([], 1, 20);
    assert.equal(result.items.length, 0);
    assert.equal(result.total, 0);
    assert.equal(result.totalPages, 1);
  });
});

// ==================== 45-48: WikiStore 集成测试 ====================

describe('WikiStore', () => {
  it('should load all data and build pages', () => {
    const store = new WikiStore();
    const stats = store.loadAll(sampleEntities, sampleConcepts, sampleEntries);

    assert.equal(stats.entityCount, 3);
    assert.equal(stats.conceptCount, 2);
    assert.equal(stats.qaCount, 3);
    assert.equal(stats.total, 8);
    assert.ok(store.isLoaded());
  });

  it('should get page by id', () => {
    const store = new WikiStore();
    store.loadAll(sampleEntities, sampleConcepts, sampleEntries);

    const page = store.getPage('entity:react');
    assert.ok(page);
    assert.equal(page.title, 'React');
  });

  it('should resolve wikilinks', () => {
    const store = new WikiStore();
    store.loadAll(sampleEntities, sampleConcepts, sampleEntries);

    const page = store.resolveWikilink('concept:containerization');
    assert.ok(page);
    assert.equal(page.type, WIKI_PAGE_TYPE.CONCEPT);
  });

  it('should get backlinks', () => {
    const store = new WikiStore();
    store.loadAll(sampleEntities, sampleConcepts, sampleEntries);

    // qa:1 is linked by entity:react and concept:component-based
    const backlinks = store.getBacklinks('qa:1');
    assert.ok(backlinks.length >= 2);
    const titles = backlinks.map(b => b.title);
    assert.ok(titles.includes('React'));
    assert.ok(titles.includes('组件化开发'));
  });

  it('should search pages', () => {
    const store = new WikiStore();
    store.loadAll(sampleEntities, sampleConcepts, sampleEntries);

    const results = store.search('Docker');
    assert.ok(results.length >= 1);
    assert.ok(results.some(p => p.title === 'Docker'));
  });

  it('should get all tags', () => {
    const store = new WikiStore();
    store.loadAll(sampleEntities, sampleConcepts, sampleEntries);

    const tags = store.getAllTags();
    assert.ok(tags.length > 0);
    assert.ok(tags.includes('react'));
    assert.ok(tags.includes('docker'));
  });

  it('should get paginated results', () => {
    const store = new WikiStore();
    store.loadAll(sampleEntities, sampleConcepts, sampleEntries);

    const result = store.getPaginated(1, 5);
    assert.equal(result.items.length, 5);
    assert.equal(result.total, 8);
    assert.equal(result.totalPages, 2);
  });

  it('should clear data', () => {
    const store = new WikiStore();
    store.loadAll(sampleEntities, sampleConcepts, sampleEntries);
    assert.ok(store.isLoaded());

    store.clear();
    assert.ok(!store.isLoaded());
    assert.equal(store.getAllPages().length, 0);
  });

  it('should render wikilinks in page content', () => {
    const store = new WikiStore();
    store.loadAll(sampleEntities, sampleConcepts, sampleEntries);

    const entityPage = store.getPage('entity:react');
    const html = store.renderWikilinks(entityPage.content);
    assert.ok(html.includes('<a'));
    assert.ok(html.includes('wiki-link'));
  });
});

// ==================== 49-54: 边界条件 ====================

describe('WikiStore edge cases', () => {
  it('should handle empty data arrays', () => {
    const store = new WikiStore();
    const stats = store.loadAll([], [], []);
    assert.equal(stats.total, 0);
    assert.ok(store.isLoaded());
  });

  it('should handle null data', () => {
    const store = new WikiStore();
    const stats = store.loadAll(null, null, null);
    assert.equal(stats.total, 0);
  });

  it('should handle entity with no entryIds', () => {
    const entity = { name: 'orphan', type: 'other', description: '孤立实体' };
    const page = entityToWikiPage(entity);
    assert.ok(page);
    assert.ok(!page.content.includes('相关知识'));
  });

  it('should handle getOutlinks for page without content', () => {
    assert.deepEqual(getOutlinks(null), []);
    assert.deepEqual(getOutlinks({ id: 'test' }), []);
  });

  it('should handle buildPageMap with null items', () => {
    const map = buildPageMap([null, { id: 'valid' }, undefined]);
    assert.equal(map.size, 1);
    assert.ok(map.has('valid'));
  });

  it('should handle multiple loadAll calls', () => {
    const store = new WikiStore();
    store.loadAll(sampleEntities, sampleConcepts, sampleEntries);
    const stats2 = store.loadAll(
      [sampleEntities[0]],
      [sampleConcepts[0]],
      [sampleEntries[0]]
    );
    assert.equal(stats2.total, 3);
    assert.equal(stats2.entityCount, 1);
  });
});

describe('Wiki page type constants', () => {
  it('should have correct values', () => {
    assert.equal(WIKI_PAGE_TYPE.ENTITY, 'entity');
    assert.equal(WIKI_PAGE_TYPE.CONCEPT, 'concept');
    assert.equal(WIKI_PAGE_TYPE.QA, 'qa');
  });

  it('should have labels for all types', () => {
    assert.ok(PAGE_TYPE_LABELS.entity);
    assert.ok(PAGE_TYPE_LABELS.concept);
    assert.ok(PAGE_TYPE_LABELS.qa);
  });

  it('should have icons for all types', () => {
    assert.ok(PAGE_TYPE_ICONS.entity);
    assert.ok(PAGE_TYPE_ICONS.concept);
    assert.ok(PAGE_TYPE_ICONS.qa);
  });
});
