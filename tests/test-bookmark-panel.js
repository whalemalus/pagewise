/**
 * 测试 options/bookmark-panel.js — 选项页书签图谱标签页
 *
 * 测试范围:
 *   init (初始化) / render (渲染) / destroy (清理)
 *   search (搜索高亮) / handleNodeClick (节点点击 → 详情)
 *   handleSimilarClick (相似书签切换) / applyFilters (过滤器)
 *   getFolders / getTags / getState / getBookmarks
 *   空状态 / 错误状态 / 加载状态 / 安全降级
 *
 * 使用 mock DOM + mock Canvas + mock 子模块
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkPanel } = await import('../options/bookmark-panel.js');
const { BookmarkIndexer } = await import('../lib/bookmark-indexer.js');
const { BookmarkGraphEngine } = await import('../lib/bookmark-graph.js');
const { BookmarkDetailPanel } = await import('../lib/bookmark-detail-panel.js');
const { BookmarkSearch } = await import('../lib/bookmark-search.js');
const { BookmarkRecommender } = await import('../lib/bookmark-recommender.js');

// ==================== Mock DOM ====================

/**
 * 创建 mock document，支持 createElement
 */
function createMockDocument() {
  return {
    createElement(tag) {
      const children = [];
      const listeners = {};
      const attrs = {};
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        textContent: '',
        href: '',
        title: '',
        value: '',
        type: '',
        placeholder: '',
        disabled: false,
        checked: false,
        target: '',
        children,
        appendChild(child) { children.push(child); return child; },
        remove() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        setAttribute(k, v) { attrs[k] = v; },
        getAttribute(k) { return attrs[k]; },
        addEventListener(type, fn) {
          if (!listeners[type]) listeners[type] = [];
          listeners[type].push(fn);
        },
        removeEventListener() {},
        _listeners: listeners,
        _attrs: attrs,
        _emit(type, data) {
          if (listeners[type]) {
            for (const fn of listeners[type]) fn(data);
          }
        },
      };
      return el;
    },
  };
}

/**
 * 创建 mock 容器元素
 */
function createMockContainer() {
  const mockDoc = createMockDocument();
  const container = mockDoc.createElement('div');
  container.appendChild = function (child) {
    this.children.push(child);
    return child;
  };
  return container;
}

/**
 * 创建 mock visualizer
 */
function createMockVisualizer() {
  return {
    _graphData: null,
    _clickCallback: null,
    _highlighted: null,
    _searchQuery: null,
    render(data) { this._graphData = data; },
    onNodeClick(cb) { this._clickCallback = cb; },
    highlight(id) { this._highlighted = String(id); },
    searchHighlight(q) { this._searchQuery = q; },
    resetHighlight() { this._highlighted = null; this._searchQuery = null; },
    destroy() {},
    stop() {},
  };
}

/**
 * 创建 mock collector
 */
function createMockCollector(bookmarks) {
  return {
    _bookmarks: bookmarks,
    async collect() { return [...this._bookmarks]; },
  };
}

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = [], status) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    status: status || 'unread',
    dateAdded: 1700000000000 + Number(id) * 86400000,
    dateAddedISO: new Date(1700000000000 + Number(id) * 86400000).toISOString(),
  };
}

const sampleBookmarks = [
  createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端'], ['react', 'frontend']),
  createBookmark('2', 'Vue.js 入门教程', 'https://vuejs.org', ['技术', '前端'], ['vue', 'frontend']),
  createBookmark('3', 'Node.js 后端开发指南', 'https://nodejs.org', ['技术', '后端'], ['nodejs', 'backend']),
  createBookmark('4', 'Python Machine Learning', 'https://scikit-learn.org', ['技术', 'AI'], ['python', 'ml']),
  createBookmark('5', 'GitHub 开源项目推荐', 'https://github.com/trending', ['工具'], ['github']),
  createBookmark('6', 'JavaScript 高级程序设计', 'https://javascript.info', ['技术', '前端', 'JS'], ['javascript', 'frontend']),
  createBookmark('7', 'TypeScript Handbook', 'https://typescriptlang.org', ['技术', '前端'], ['typescript', 'frontend'], 'reading'),
  createBookmark('8', 'CSS Grid 完全指南', 'https://css-tricks.com/grid', ['技术', '前端', 'CSS'], ['css', 'grid']),
  createBookmark('9', 'React Hooks 深入', 'https://react.dev/reference/hooks', ['技术', '前端'], ['react', 'hooks'], 'read'),
  createBookmark('10', 'GitHub Actions CI/CD', 'https://github.com/features/actions', ['工具', 'DevOps'], ['github', 'cicd']),
];

// ==================== 构建完整面板 (复用) ====================

function createFullPanel(overrides = {}) {
  const mockDoc = overrides._doc || createMockDocument();
  const indexer = new BookmarkIndexer();
  const graphEngine = new BookmarkGraphEngine();
  const detailPanel = new BookmarkDetailPanel();
  const search = new BookmarkSearch(indexer, graphEngine);
  const recommender = new BookmarkRecommender(graphEngine);
  const visualizer = overrides.visualizer || createMockVisualizer();
  const collector = overrides.collector || createMockCollector(sampleBookmarks);

  const panel = new BookmarkPanel({
    collector,
    indexer,
    graphEngine,
    visualizer,
    detailPanel,
    search,
    recommender,
  });

  // 注入 mock document
  panel._doc = mockDoc;

  return panel;
}

// ==================== 测试 ====================

describe('BookmarkPanel', () => {

  // ─── 1. 构造函数 ────────────────────────────────────────────────────────────

  it('1. 构造函数 — 创建实例，初始状态正确', () => {
    const panel = new BookmarkPanel();
    const state = panel.getState();

    assert.ok(panel instanceof BookmarkPanel, '应成功创建实例');
    assert.equal(state.initialized, false, '初始应未初始化');
    assert.equal(state.loading, false, '初始不应加载中');
    assert.equal(state.error, '', '初始应无错误');
    assert.equal(state.bookmarkCount, 0, '初始书签数应为 0');
    assert.deepEqual(panel.getBookmarks(), [], '初始书签列表应为空');
  });

  // ─── 2. init 初始化 ────────────────────────────────────────────────────────

  it('2. init 采集书签并构建索引/图谱', async () => {
    const panel = createFullPanel();
    await panel.init(sampleBookmarks);

    const state = panel.getState();
    assert.equal(state.initialized, true, '应已初始化');
    assert.equal(state.loading, false, '加载应完成');
    assert.equal(state.error, '', '应无错误');
    assert.equal(state.bookmarkCount, sampleBookmarks.length, `书签数应为 ${sampleBookmarks.length}`);

    const bookmarks = panel.getBookmarks();
    assert.equal(bookmarks.length, sampleBookmarks.length, 'getBookmarks 应返回完整列表');
  });

  // ─── 3. init 使用 collector 采集 ──────────────────────────────────────────

  it('3. init 通过 collector 采集书签 (不传参)', async () => {
    const collector = createMockCollector(sampleBookmarks);
    const indexer = new BookmarkIndexer();
    const graphEngine = new BookmarkGraphEngine();
    const mockDoc = createMockDocument();

    const panel = new BookmarkPanel({ collector, indexer, graphEngine });
    panel._doc = mockDoc;
    await panel.init(); // 不传书签参数

    const state = panel.getState();
    assert.equal(state.initialized, true, '应已初始化');
    assert.equal(state.bookmarkCount, sampleBookmarks.length, '应通过 collector 采集到书签');
  });

  // ─── 4. render 完整渲染 ────────────────────────────────────────────────────

  it('4. render 渲染三栏布局并调用 visualizer', async () => {
    const visualizer = createMockVisualizer();
    const panel = createFullPanel({ visualizer });
    await panel.init(sampleBookmarks);

    const container = createMockContainer();
    panel.render(container);

    assert.equal(container.children.length, 1, '应有一个顶层布局元素');

    // 验证 visualizer.render 被调用
    assert.ok(visualizer._graphData !== null, 'visualizer.render 应被调用');
    assert.ok(visualizer._graphData.nodes.length > 0, '图谱应有节点');
    assert.ok(visualizer._clickCallback !== null, '应注册节点点击回调');
  });

  // ─── 5. render 空状态 ─────────────────────────────────────────────────────

  it('5. render 无书签时显示空状态', async () => {
    const collector = createMockCollector([]);
    const indexer = new BookmarkIndexer();
    const graphEngine = new BookmarkGraphEngine();
    const mockDoc = createMockDocument();

    const panel = new BookmarkPanel({ collector, indexer, graphEngine });
    panel._doc = mockDoc;
    await panel.init([]);

    const container = createMockContainer();
    panel.render(container);

    assert.equal(container.children.length, 1, '应渲染一个元素');
    assert.ok(container.children[0].textContent.includes('暂无书签'), '应显示空状态提示');
  });

  // ─── 6. destroy 清理资源 ──────────────────────────────────────────────────

  it('6. destroy 清理所有 DOM 引用和子模块', async () => {
    const visualizer = createMockVisualizer();
    const panel = createFullPanel({ visualizer });
    await panel.init(sampleBookmarks);

    const container = createMockContainer();
    panel.render(container);

    // destroy
    panel.destroy();

    assert.equal(panel._searchInput, null, 'DOM 引用应被清空');
    assert.equal(panel._container, null, '容器引用应被清空');
    assert.equal(panel._detailContainer, null, '详情容器引用应被清空');
  });

  // ─── 7. search 高亮匹配节点 ───────────────────────────────────────────────

  it('7. search 调用 visualizer.searchHighlight 并可重置', async () => {
    const visualizer = createMockVisualizer();
    const panel = createFullPanel({ visualizer });
    await panel.init(sampleBookmarks);

    // 搜索
    panel.search('react');
    assert.equal(visualizer._searchQuery, 'react', '应传递搜索词到 visualizer');

    // 空搜索应重置
    panel.search('');
    assert.equal(visualizer._searchQuery, null, '空搜索应重置高亮');

    // null 搜索应重置
    panel.search('test');
    panel.search(null);
    assert.equal(visualizer._highlighted, null, 'null 搜索应重置高亮');
  });

  // ─── 8. handleNodeClick 显示详情 ──────────────────────────────────────────

  it('8. handleNodeClick 高亮节点并显示详情面板', async () => {
    const visualizer = createMockVisualizer();
    const panel = createFullPanel({ visualizer });
    await panel.init(sampleBookmarks);

    const container = createMockContainer();
    panel.render(container);

    // 点击第一个书签节点
    panel.handleNodeClick('1');

    // 验证高亮
    assert.equal(visualizer._highlighted, '1', '应高亮被点击的节点');

    // 验证详情面板
    const detailData = panel._detailPanel.getPanelData();
    assert.ok(detailData !== null, '详情面板应有数据');
    assert.equal(detailData.bookmark.id, '1', '详情应显示正确的书签');
    assert.equal(detailData.bookmark.title, 'React 官方文档', '标题应正确');
    assert.ok(detailData.similarBookmarks.length > 0, '应有相似书签');
  });

  // ─── 9. handleSimilarClick 切换到相似书签 ─────────────────────────────────

  it('9. handleSimilarClick 切换到相似书签的详情', async () => {
    const visualizer = createMockVisualizer();
    const panel = createFullPanel({ visualizer });
    await panel.init(sampleBookmarks);

    const container = createMockContainer();
    panel.render(container);

    // 先点击书签 1
    panel.handleNodeClick('1');

    const detailData1 = panel._detailPanel.getPanelData();
    assert.equal(detailData1.bookmark.id, '1', '初始应显示书签 1');

    // 获取相似书签 ID
    const similarId = detailData1.similarBookmarks[0]?.id;
    assert.ok(similarId, '应有相似书签');

    // 切换到相似书签
    panel.handleSimilarClick(similarId);

    // 验证已切换
    const detailData2 = panel._detailPanel.getPanelData();
    assert.equal(detailData2.bookmark.id, similarId, `应切换到相似书签 ${similarId}`);
    assert.equal(visualizer._highlighted, similarId, '应高亮新书签节点');
  });

  // ─── 10. getFolders 返回去重的文件夹列表 ──────────────────────────────────

  it('10. getFolders 返回去重的文件夹列表', async () => {
    const panel = createFullPanel();
    await panel.init(sampleBookmarks);

    const folders = panel.getFolders();
    assert.ok(Array.isArray(folders), '应返回数组');
    assert.ok(folders.length > 0, '应有文件夹');

    // 检查去重
    const uniqueFolders = [...new Set(folders)];
    assert.equal(folders.length, uniqueFolders.length, '应无重复');

    // 应包含 "技术 / 前端"
    assert.ok(folders.includes('技术 / 前端'), '应包含 "技术 / 前端"');
  });

  // ─── 11. getTags 返回去重的标签列表 ──────────────────────────────────────

  it('11. getTags 返回去重的标签列表', async () => {
    const panel = createFullPanel();
    await panel.init(sampleBookmarks);

    const tags = panel.getTags();
    assert.ok(Array.isArray(tags), '应返回数组');
    assert.ok(tags.length > 0, '应有标签');
    assert.ok(tags.includes('react'), '应包含 react 标签');
    assert.ok(tags.includes('frontend'), '应包含 frontend 标签');

    // 无重复
    const uniqueTags = [...new Set(tags)];
    assert.equal(tags.length, uniqueTags.length, '标签应无重复');
  });

  // ─── 12. applyFilters 更新过滤器状态 ─────────────────────────────────────

  it('12. applyFilters 更新过滤器状态', async () => {
    const panel = createFullPanel();
    await panel.init(sampleBookmarks);

    // 初始状态
    assert.equal(panel.getState().activeFilter, '', '初始应无活跃过滤器');

    // 应用文件夹过滤
    panel.applyFilters({ folder: '前端' });
    assert.equal(panel.getState().activeFilter, '前端', '应设置文件夹过滤');

    // 应用状态过滤
    panel.applyFilters({ status: 'reading' });
    assert.equal(panel.getState().activeFilter, 'reading', '应切换到状态过滤');

    // 应用标签过滤
    panel.applyFilters({ tags: ['react'] });
    assert.deepEqual(panel._currentTags, ['react'], '应设置标签过滤');
  });

  // ─── 13. render 无容器抛出异常 ────────────────────────────────────────────

  it('13. render 传入 null/undefined 应抛出异常', async () => {
    const panel = createFullPanel();
    await panel.init(sampleBookmarks);

    assert.throws(
      () => panel.render(null),
      /requires a container element/,
      '传入 null 应抛出异常',
    );
    assert.throws(
      () => panel.render(undefined),
      /requires a container element/,
      '传入 undefined 应抛出异常',
    );
  });

  // ─── 14. init 传播异常 ────────────────────────────────────────────────────

  it('14. init 传播采集器异常并设置错误状态', async () => {
    const collector = {
      async collect() { throw new Error('Network error'); },
    };
    const mockDoc = createMockDocument();

    const panel = new BookmarkPanel({ collector });
    panel._doc = mockDoc;
    let thrown = false;

    try {
      await panel.init();
    } catch (err) {
      thrown = true;
      assert.ok(err.message.includes('Network error'), '应传播原始错误');
    }

    assert.equal(thrown, true, '应抛出异常');
    assert.equal(panel.getState().error, 'Network error', '应设置错误状态');
    assert.equal(panel.getState().loading, false, '加载状态应为 false');
  });

  // ─── 15. render 加载中状态 ────────────────────────────────────────────────

  it('15. render loading 状态显示加载提示', () => {
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel();
    panel._doc = mockDoc;

    // 模拟 loading 状态
    panel._state.loading = true;

    const container = createMockContainer();
    panel.render(container);

    assert.equal(container.children.length, 1, '应渲染一个元素');
    assert.ok(container.children[0].textContent.includes('加载'), '应显示加载提示');
  });

  // ─── 16. init 无依赖时安全降级 ────────────────────────────────────────────

  it('16. init 无任何依赖时安全降级', async () => {
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel();
    panel._doc = mockDoc;
    await panel.init(sampleBookmarks);

    const state = panel.getState();
    assert.equal(state.initialized, true, '应已完成初始化');
    assert.equal(state.bookmarkCount, sampleBookmarks.length, '书签数应正确');

    // render 应正常渲染空状态 (无 visualizer/graphEngine)
    const container = createMockContainer();
    panel.render(container);
    assert.equal(container.children.length, 1, '应渲染元素');
  });
});
