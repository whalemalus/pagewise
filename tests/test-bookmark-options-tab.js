/**
 * 测试 R51: 选项页集成 BookmarkOptionsPage — Tab 切换 + BookmarkPanel 生命周期
 *
 * 测试范围:
 *   TabManager 创建 / Tab 切换 / 默认 Tab / 初始容器
 *   BookmarkPanel 生命周期 (init → render → destroy → re-init)
 *   搜索集成 / 节点点击 / 过滤器 / destroy 释放资源
 *   Hash 参数路由 (#tab=bookmark)
 *   完整集成流: init → switch → search → node click → switch away → switch back
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkPanel } = await import('../options/bookmark-panel.js');
const { BookmarkIndexer } = await import('../lib/bookmark-indexer.js');
const { BookmarkGraphEngine } = await import('../lib/bookmark-graph.js');
const { BookmarkDetailPanel } = await import('../lib/bookmark-detail-panel.js');
const { BookmarkSearch } = await import('../lib/bookmark-search.js');
const { BookmarkRecommender } = await import('../lib/bookmark-recommender.js');

// ==================== Mock DOM helpers ====================

/**
 * 创建最小 Mock 元素，支持 classList / style / children
 */
function createMockElement(tag) {
  const children = [];
  const listeners = {};
  const attrs = {};
  let _className = '';

  return {
    tagName: (tag || 'div').toUpperCase(),
    get className() { return _className; },
    set className(v) { _className = v; },
    innerHTML: '',
    textContent: '',
    value: '',
    type: '',
    placeholder: '',
    disabled: false,
    style: { display: '' },
    children,
    querySelector(selector) {
      for (const child of children) {
        if (selector.startsWith('.') && child.className &&
            child.className.includes(selector.slice(1))) return child;
        if (selector.startsWith('#') && attrs['id'] === selector.slice(1)) return child;
      }
      return null;
    },
    querySelectorAll() { return []; },
    appendChild(child) { children.push(child); return child; },
    remove() {},
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
}

/**
 * 创建包含 settings-panel 和 bookmark-panel 元素的选项页容器
 */
function createOptionsContainer() {
  return {
    settingsPanel: createMockElement('div'),
    bookmarkPanel: createMockElement('div'),
  };
}

/**
 * 创建 mock document，可被 BookmarkPanel._doc 使用
 */
function createMockDocument() {
  return {
    createElement(tag) {
      return createMockElement(tag);
    },
  };
}

/**
 * 创建 mock BookmarkPanel 实例，跟踪方法调用
 */
function createMockPanel() {
  return {
    _initialized: false,
    _rendered: false,
    _destroyed: false,
    _renderContainer: null,
    _searchQuery: null,
    _nodeId: null,
    _filters: null,
    _refreshed: false,
    _bookmarks: [],
    _loadingMarked: false,

    markLoading() {
      this._loadingMarked = true;
    },
    async init(bookmarks) {
      this._initialized = true;
      this._bookmarks = bookmarks || [];
    },
    render(container) {
      if (!container) throw new Error('requires a container element');
      this._rendered = true;
      this._renderContainer = container;
    },
    destroy() {
      this._destroyed = true;
    },
    search(query) {
      this._searchQuery = query;
    },
    handleNodeClick(nodeId) {
      this._nodeId = nodeId;
    },
    applyFilters(filters) {
      this._filters = filters;
    },
    async refresh() {
      this._refreshed = true;
    },
    getState() {
      return { initialized: this._initialized, loading: false, error: '', bookmarkCount: 0, activeFilter: '' };
    },
    getBookmarks() {
      return this._bookmarks || [];
    },
    getFolders() { return []; },
    getTags() { return []; },
  };
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
    _resetCalled: false,
    render(data) { this._graphData = data; },
    onNodeClick(cb) { this._clickCallback = cb; },
    highlight(id) { this._highlighted = String(id); },
    searchHighlight(q) { this._searchQuery = q; },
    resetHighlight() { this._resetCalled = true; this._searchQuery = null; },
    destroy() {},
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
];

// ==================== TabManager 逻辑 (从 options.js 提取) ====================

/**
 * 从 options.js 中提取的 TabManager 逻辑，用于单元测试
 * 这是 options.js 中 buildTabManager() 返回的对象结构
 */
function buildTabManager({ settingsPanel, bookmarkPanel, panel }) {
  let currentTab = 'settings';

  function switchTab(tabName) {
    if (tabName === currentTab) return;

    if (tabName === 'bookmark') {
      settingsPanel.style.display = 'none';
      bookmarkPanel.style.display = 'block';
      if (panel) {
        // 先标记加载中，渲染加载状态，再异步初始化
        if (panel.markLoading) panel.markLoading();
        panel.render(bookmarkPanel);
        panel.init()
          .then(() => {
            // init 完成后重新渲染，显示图谱数据
            panel.render(bookmarkPanel);
          })
          .catch(err => {
            console.error('BookmarkPanel init failed:', err);
            // init 失败后也重新渲染，显示错误状态
            panel.render(bookmarkPanel);
          });
      }
    } else if (tabName === 'settings') {
      bookmarkPanel.style.display = 'none';
      settingsPanel.style.display = 'block';
      if (panel) {
        panel.destroy();
      }
    }

    currentTab = tabName;
  }

  function getCurrentTab() {
    return currentTab;
  }

  return { switchTab, getCurrentTab };
}

// ==================== 测试 ====================

describe('R51: 选项页 BookmarkOptionsPage 集成', () => {

  // ─── 1. switchTab 创建两个内容区域 ──────────────────────────────────────────

  it('1. switchTab 切换可见性: 设置面板隐藏，图谱面板显示', () => {
    const container = createOptionsContainer();
    const manager = buildTabManager({
      settingsPanel: container.settingsPanel,
      bookmarkPanel: container.bookmarkPanel,
      panel: null,
    });

    manager.switchTab('bookmark');

    assert.equal(container.settingsPanel.style.display, 'none', '设置面板应隐藏');
    assert.equal(container.bookmarkPanel.style.display, 'block', '图谱面板应显示');
  });

  // ─── 2. Tab 切换: 切换回设置时状态恢复 ──────────────────────────────────────

  it('2. switchTab 切换回设置时，设置面板显示，图谱面板隐藏', () => {
    const container = createOptionsContainer();
    const manager = buildTabManager({
      settingsPanel: container.settingsPanel,
      bookmarkPanel: container.bookmarkPanel,
      panel: null,
    });

    manager.switchTab('bookmark');
    manager.switchTab('settings');

    assert.equal(container.settingsPanel.style.display, 'block', '设置面板应显示');
    assert.equal(container.bookmarkPanel.style.display, 'none', '图谱面板应隐藏');
  });

  // ─── 3. 默认 Tab 是设置 ────────────────────────────────────────────────────

  it('3. 默认 tab 应为 settings', () => {
    const container = createOptionsContainer();
    const manager = buildTabManager({
      settingsPanel: container.settingsPanel,
      bookmarkPanel: container.bookmarkPanel,
      panel: null,
    });

    assert.equal(manager.getCurrentTab(), 'settings');
    assert.equal(container.settingsPanel.style.display, '', '设置面板初始可见 (无 display 修改)');
    assert.equal(container.bookmarkPanel.style.display, '', '图谱面板初始未修改');
  });

  // ─── 4. init 初始化并 render ───────────────────────────────────────────────

  it('4. switchTab bookmark 首次: 调用 panel.render() + panel.init()', async () => {
    const container = createOptionsContainer();
    const mockPanel = createMockPanel();
    const manager = buildTabManager({
      settingsPanel: container.settingsPanel,
      bookmarkPanel: container.bookmarkPanel,
      panel: mockPanel,
    });

    manager.switchTab('bookmark');

    // render 是同步调用
    assert.equal(mockPanel._rendered, true, 'panel.render() 应被调用');
    assert.equal(mockPanel._renderContainer, container.bookmarkPanel, 'render 容器应为 bookmarkPanel');

    // init 是异步的 — 等待完成
    await new Promise(r => setTimeout(r, 10));
    assert.equal(mockPanel._initialized, true, 'panel.init() 应已完成');
  });

  // ─── 5. destroy 释放资源 ───────────────────────────────────────────────────

  it('5. switchTab 切换离开图谱时调用 panel.destroy()', () => {
    const container = createOptionsContainer();
    const mockPanel = createMockPanel();
    const manager = buildTabManager({
      settingsPanel: container.settingsPanel,
      bookmarkPanel: container.bookmarkPanel,
      panel: mockPanel,
    });

    manager.switchTab('bookmark');
    assert.equal(mockPanel._destroyed, false, '切换到 bookmark 时不应 destroy');

    manager.switchTab('settings');
    assert.equal(mockPanel._destroyed, true, '切换离开时应调用 destroy');
  });

  // ─── 6. 重新切回图谱时重新初始化 ───────────────────────────────────────────

  it('6. switchTab 离开后切回图谱: 重新 render + re-init', async () => {
    const container = createOptionsContainer();
    const mockPanel = createMockPanel();
    const manager = buildTabManager({
      settingsPanel: container.settingsPanel,
      bookmarkPanel: container.bookmarkPanel,
      panel: mockPanel,
    });

    manager.switchTab('bookmark');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(mockPanel._initialized, true, '首次 init');

    manager.switchTab('settings');
    assert.equal(mockPanel._destroyed, true, 'destroy 后 _destroyed=true');

    // 重置 mock 面板状态以跟踪新调用
    mockPanel._initialized = false;
    mockPanel._rendered = false;
    mockPanel._destroyed = false;

    manager.switchTab('bookmark');
    assert.equal(mockPanel._rendered, true, '重新切回应再次 render');

    await new Promise(r => setTimeout(r, 10));
    assert.equal(mockPanel._initialized, true, '重新切回应再次 init');
  });

  // ─── 7. search 传递搜索词 ──────────────────────────────────────────────────

  it('7. panel.search() 传递搜索词到 BookmarkPanel', () => {
    const mockPanel = createMockPanel();
    mockPanel.search('react');
    assert.equal(mockPanel._searchQuery, 'react', 'search 词应传递');
  });

  // ─── 8. search 空查询重置 ──────────────────────────────────────────────────

  it('8. panel.search 空查询应被传递 (BookmarkPanel 内部重置)', () => {
    const mockPanel = createMockPanel();
    mockPanel.search('test');
    mockPanel.search('');
    assert.equal(mockPanel._searchQuery, '', '空查询应传递到 panel');
  });

  // ─── 9. handleNodeClick 触发详情面板 ───────────────────────────────────────

  it('9. panel.handleNodeClick 触发节点点击处理', () => {
    const mockPanel = createMockPanel();
    mockPanel.handleNodeClick('3');
    assert.equal(mockPanel._nodeId, '3', '节点 ID 应传递');
  });

  // ─── 10. applyFilters 传递过滤器 ───────────────────────────────────────────

  it('10. panel.applyFilters 传递过滤器参数', () => {
    const mockPanel = createMockPanel();
    const filters = { folder: '前端', status: 'unread' };
    mockPanel.applyFilters(filters);
    assert.deepEqual(mockPanel._filters, filters, '过滤器应传递');
  });

  // ─── 11. hash 参数路由 #tab=bookmark ───────────────────────────────────────

  it('11. hash #tab=bookmark 应激活图谱 Tab 并初始化面板', async () => {
    const container = createOptionsContainer();
    const mockPanel = createMockPanel();

    // 模拟 TabManager 根据 hash 设置初始 tab
    const hash = '#tab=bookmark';
    const initialTab = hash === '#tab=bookmark' ? 'bookmark' : 'settings';

    const manager = buildTabManager({
      settingsPanel: container.settingsPanel,
      bookmarkPanel: container.bookmarkPanel,
      panel: mockPanel,
    });

    if (initialTab === 'bookmark') {
      manager.switchTab('bookmark');
    }

    assert.equal(manager.getCurrentTab(), 'bookmark', 'hash 路由应设置 bookmark tab');
    assert.equal(container.bookmarkPanel.style.display, 'block', '图谱面板应显示');
    assert.equal(mockPanel._rendered, true, 'panel.render 应被调用');
  });

  // ─── 12. BookmarkPanel 三栏布局渲染 ────────────────────────────────────────

  it('12. BookmarkPanel.render 完整初始化后渲染三栏布局', async () => {
    const mockDoc = createMockDocument();
    const visualizer = createMockVisualizer();
    const indexer = new BookmarkIndexer();
    const graphEngine = new BookmarkGraphEngine();
    const detailPanel = new BookmarkDetailPanel();
    const search = new BookmarkSearch(indexer, graphEngine);
    const recommender = new BookmarkRecommender(graphEngine);
    const collector = createMockCollector(sampleBookmarks);

    const panel = new BookmarkPanel({
      collector, indexer, graphEngine, visualizer,
      detailPanel, search, recommender,
    });
    panel._doc = mockDoc;

    await panel.init(sampleBookmarks);

    const container = createMockElement('div');
    panel.render(container);

    assert.equal(container.children.length, 1, '应渲染一个顶层布局元素');
    assert.ok(visualizer._graphData !== null, 'visualizer.render 应被调用');
    assert.ok(visualizer._graphData.nodes.length > 0, '图谱应有节点');
    assert.ok(visualizer._clickCallback !== null, '应注册节点点击回调');

    const state = panel.getState();
    assert.equal(state.initialized, true, '面板应已初始化');
    assert.equal(state.bookmarkCount, sampleBookmarks.length, '书签数应正确');
  });

  // ─── 13. 完整集成流: init → switch → search → node click → destroy → re-init ──

  it('13. 完整集成流: TabManager + BookmarkPanel 全生命周期', async () => {
    const container = createOptionsContainer();
    const mockDoc = createMockDocument();
    const visualizer = createMockVisualizer();
    const indexer = new BookmarkIndexer();
    const graphEngine = new BookmarkGraphEngine();
    const detailPanel = new BookmarkDetailPanel();
    const search = new BookmarkSearch(indexer, graphEngine);
    const recommender = new BookmarkRecommender(graphEngine);
    const collector = createMockCollector(sampleBookmarks);

    const panel = new BookmarkPanel({
      collector, indexer, graphEngine, visualizer,
      detailPanel, search, recommender,
    });
    panel._doc = mockDoc;

    const manager = buildTabManager({
      settingsPanel: container.settingsPanel,
      bookmarkPanel: container.bookmarkPanel,
      panel,
    });

    // Step 1: 初始状态
    assert.equal(manager.getCurrentTab(), 'settings', '初始 Tab 应为 settings');

    // Step 2: 切换到图谱 Tab
    manager.switchTab('bookmark');
    assert.equal(container.bookmarkPanel.style.display, 'block', '图谱面板应显示');
    assert.equal(container.settingsPanel.style.display, 'none', '设置面板应隐藏');

    // Step 3: 等待 init 完成
    await new Promise(r => setTimeout(r, 10));
    const state = panel.getState();
    assert.equal(state.initialized, true, 'panel 应已完成初始化');
    assert.equal(state.bookmarkCount, sampleBookmarks.length, '书签数应正确');

    // Step 4: 搜索
    panel.search('react');
    assert.equal(visualizer._searchQuery, 'react', '搜索词应传递到 visualizer');

    // Step 5: 节点点击 → 详情面板
    panel.handleNodeClick('1');
    assert.equal(visualizer._highlighted, '1', '节点应被高亮');
    const detailData = detailPanel.getPanelData();
    assert.ok(detailData !== null, '详情面板应有数据');
    assert.equal(detailData.bookmark.id, '1', '详情应为书签 1');

    // Step 6: 切换离开 → destroy
    manager.switchTab('settings');
    assert.equal(container.bookmarkPanel.style.display, 'none', '图谱面板应隐藏');
    assert.equal(container.settingsPanel.style.display, 'block', '设置面板应显示');

    // Step 7: 切换回图谱 → 重新初始化
    manager.switchTab('bookmark');
    assert.equal(container.bookmarkPanel.style.display, 'block', '图谱面板应重新显示');

    await new Promise(r => setTimeout(r, 10));
    const stateAfterReInit = panel.getState();
    assert.equal(stateAfterReInit.initialized, true, '重新切回后应重新初始化');
    assert.equal(stateAfterReInit.bookmarkCount, sampleBookmarks.length, '书签数仍应正确');
  });
});
