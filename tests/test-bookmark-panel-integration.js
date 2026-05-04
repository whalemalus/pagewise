/**
 * 测试 BookmarkGraph Phase 1 核心修复 — 集成测试
 *
 * 测试范围:
 *   R1: render/init 顺序 — init 先于 render 完成
 *   R2: BookmarkCollector 错误处理 — API 不存在返回空数组
 *   R3: 加载状态 — markLoading + loading spinner
 *   R4: 错误状态 + 重试按钮
 *   R5: 空状态引导 — 引导信息 + 刷新按钮
 *   R6-R10: 完整集成流程
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
 * 创建 mock document，支持 createElement (含递归 textContent)
 */
function createMockDocument() {
  return {
    createElement(tag) {
      const children = [];
      const listeners = {};
      const attrs = {};
      let _textContent = '';
      let _innerHTML = '';
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        get innerHTML() { return _innerHTML; },
        set innerHTML(v) { _innerHTML = v; },
        get textContent() {
          // 拼接自身文字 + innerHTML 中的纯文本 + 子元素文字
          const selfText = _textContent || _innerHTML.replace(/<[^>]+>/g, '');
          if (children.length > 0) {
            return selfText + children.map(c => c.textContent).join('');
          }
          return selfText;
        },
        set textContent(v) { _textContent = v; },
        href: '',
        title: '',
        value: '',
        type: '',
        placeholder: '',
        disabled: false,
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

function createMockContainer() {
  const mockDoc = createMockDocument();
  return mockDoc.createElement('div');
}

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
  };
}

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

// ==================== 构建完整面板 ====================

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

  panel._doc = mockDoc;
  return panel;
}

/**
 * 模拟 options.js 中 createTabManager 的 TabManager 逻辑
 * (与 test-bookmark-options-tab.js 中 buildTabManager 一致)
 */
function buildTabManager({ settingsPanel, bookmarkPanel, panel }) {
  let currentTab = 'settings';

  function switchTab(tabName) {
    if (tabName === currentTab) return;

    if (tabName === 'bookmark') {
      settingsPanel.style.display = 'none';
      bookmarkPanel.style.display = 'block';
      if (panel) {
        if (panel.markLoading) panel.markLoading();
        panel.render(bookmarkPanel);
        panel.init()
          .then(() => {
            panel.render(bookmarkPanel);
          })
          .catch(() => {
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

describe('BookmarkGraph Phase 1 — 核心修复集成测试', () => {

  // ─── R1: render/init 顺序修复 ───────────────────────────────────────────────

  it('R1-1. TabManager: markLoading 先于 render，init 完成后重新 render', async () => {
    const mockDoc = createMockDocument();
    const panel = createFullPanel({ _doc: mockDoc });
    const settingsPanel = createMockContainer();
    const bookmarkPanel = createMockContainer();
    bookmarkPanel.style = { display: '' };
    settingsPanel.style = { display: '' };

    const manager = buildTabManager({
      settingsPanel,
      bookmarkPanel,
      panel,
    });

    manager.switchTab('bookmark');

    // 第一次 render 是在 markLoading 后，应显示加载状态
    const stateBeforeInit = panel.getState();
    // state.loading 会在 init() 内部设置为 true
    // 此时 render 已被调用，container 应有子元素
    assert.ok(bookmarkPanel.children.length > 0, 'render 后应有子元素');

    // 等待 init 完成 (会再次 render)
    await new Promise(r => setTimeout(r, 20));

    const stateAfterInit = panel.getState();
    assert.equal(stateAfterInit.initialized, true, 'init 完成后应已初始化');
    assert.equal(stateAfterInit.bookmarkCount, sampleBookmarks.length, '书签数应正确');

    // 重新 render 后应显示图谱 (不是空状态)
    assert.ok(bookmarkPanel.children.length > 0, '重新 render 后应有子元素');
  });

  it('R1-2. markLoading() 方法设置 loading=true 和清空 error', () => {
    const panel = new BookmarkPanel();
    panel._state.error = 'some error';
    panel.markLoading();

    const state = panel.getState();
    assert.equal(state.loading, true, '应设置 loading=true');
    assert.equal(state.error, '', '应清空 error');
  });

  // ─── R2: BookmarkCollector 错误处理 ─────────────────────────────────────────

  it('R2-1. BookmarkPanel: collector.collect() 返回空数组时显示空状态', async () => {
    const collector = { async collect() { return []; } };
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel({ collector });
    panel._doc = mockDoc;

    await panel.init();

    const state = panel.getState();
    assert.equal(state.initialized, true, '应已初始化');
    assert.equal(state.bookmarkCount, 0, '书签数应为 0');
    assert.equal(state.error, '', '不应有错误');

    // 渲染应显示空状态
    const container = createMockContainer();
    panel.render(container);
    assert.ok(container.textContent.includes('暂无书签'), '应显示空状态');
  });

  it('R2-2. BookmarkPanel: collector.collect() 失败时显示错误状态', async () => {
    const collector = { async collect() { throw new Error('API unavailable'); } };
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel({ collector });
    panel._doc = mockDoc;

    let thrown = false;
    try {
      await panel.init();
    } catch {
      thrown = true;
    }

    assert.equal(thrown, true, 'init 应抛出异常');
    assert.equal(panel.getState().error, 'API unavailable', '应设置错误信息');

    // 渲染应显示错误状态
    const container = createMockContainer();
    panel.render(container);
    assert.ok(container.textContent.includes('加载失败'), '应显示错误信息');
  });

  // ─── R3: 加载状态 spinner ───────────────────────────────────────────────────

  it('R3-1. render() loading 状态显示 spinner 和加载文字', () => {
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel();
    panel._doc = mockDoc;
    panel.markLoading();

    const container = createMockContainer();
    panel.render(container);

    assert.equal(container.children.length, 1, '应渲染一个元素');
    assert.equal(container.children[0].className, 'bookmark-panel-loading', 'class 应为 loading');
    assert.ok(container.textContent.includes('正在加载书签数据'), '应显示加载文字');
  });

  it('R3-2. _renderLoadingSpinner 创建带 role=status 的元素', () => {
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel();
    panel._doc = mockDoc;

    const spinner = panel._renderLoadingSpinner();
    assert.equal(spinner.className, 'bookmark-panel-spinner', 'class 应为 spinner');
    assert.equal(spinner.getAttribute('role'), 'status', 'role 应为 status');
    assert.equal(spinner.getAttribute('aria-label'), '加载中', 'aria-label 应为 加载中');
  });

  it('R3-3. render 未初始化且非 loading 时显示空状态 (不是加载)', () => {
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel();
    panel._doc = mockDoc;

    const container = createMockContainer();
    panel.render(container);

    assert.ok(container.textContent.includes('暂无书签'), '未初始化且非 loading 应显示空状态');
  });

  // ─── R4: 错误状态 + 重试按钮 ────────────────────────────────────────────────

  it('R4-1. _renderError 显示错误信息和重试按钮', () => {
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel();
    panel._doc = mockDoc;

    const container = createMockContainer();
    panel._renderError(container, '测试错误');

    assert.ok(container.textContent.includes('加载失败: 测试错误'), '应显示错误信息');

    // 查找重试按钮
    const errorDiv = container.children[0];
    assert.equal(errorDiv.className, 'bookmark-panel-error', 'class 应为 error');
    assert.ok(errorDiv.children.length >= 2, '应有至少 2 个子元素 (消息 + 重试按钮)');

    const retryBtn = errorDiv.children.find(c => c.className === 'bookmark-panel-error-retry');
    assert.ok(retryBtn, '应有重试按钮');
    assert.equal(retryBtn.textContent, '重试', '按钮文字应为 "重试"');
    assert.ok(retryBtn._listeners.click, '应绑定 click 事件');
  });

  it('R4-2. 错误状态 render 显示重试按钮 (通过 render 路径)', () => {
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel();
    panel._doc = mockDoc;
    panel._state.error = 'Network error';

    const container = createMockContainer();
    panel.render(container);

    assert.ok(container.textContent.includes('加载失败: Network error'), '应显示错误信息');
    assert.ok(container.textContent.includes('重试'), '应显示重试按钮');
  });

  // ─── R5: 空状态引导 ────────────────────────────────────────────────────────

  it('R5-1. _renderEmpty 显示引导信息和刷新按钮', () => {
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel();
    panel._doc = mockDoc;

    const container = createMockContainer();
    panel._renderEmpty(container);

    assert.ok(container.textContent.includes('暂无书签数据'), '应显示空状态标题');
    assert.ok(container.textContent.includes('Ctrl+D'), '应包含快捷键引导');
    assert.ok(container.textContent.includes('添加书签'), '应包含添加书签提示');
    assert.ok(container.textContent.includes('刷新书签'), '应有刷新按钮');
  });

  it('R5-2. 空状态刷新按钮绑定 refresh 事件', () => {
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel();
    panel._doc = mockDoc;

    const container = createMockContainer();
    panel._renderEmpty(container);

    // 遍历查找刷新按钮
    const emptyDiv = container.children[0];
    const refreshBtn = emptyDiv.children.find(c => c.className === 'bookmark-panel-empty-refresh');
    assert.ok(refreshBtn, '应有刷新按钮');
    assert.equal(refreshBtn.textContent, '刷新书签', '按钮文字应为 "刷新书签"');
    assert.ok(refreshBtn._listeners.click, '应绑定 click 事件');
  });

  it('R5-3. render() 未初始化时渲染空状态 (含引导)', () => {
    const mockDoc = createMockDocument();
    const panel = new BookmarkPanel();
    panel._doc = mockDoc;

    const container = createMockContainer();
    panel.render(container);

    assert.ok(container.textContent.includes('暂无书签数据'), '应显示空状态标题');
    assert.ok(container.textContent.includes('刷新书签'), '应显示刷新按钮');
  });

  // ─── R6: 完整流程: 打开 → 加载 → 显示图谱 ──────────────────────────────────

  it('R6. 完整流程: 打开 → 加载 → 显示图谱', async () => {
    const visualizer = createMockVisualizer();
    const panel = createFullPanel({ visualizer });
    const container = createMockContainer();

    // Step 1: markLoading + render (加载状态)
    panel.markLoading();
    panel.render(container);
    assert.ok(container.textContent.includes('正在加载'), 'Step 1: 应显示加载状态');

    // Step 2: init (异步)
    await panel.init(sampleBookmarks);

    // Step 3: 重新 render (图谱)
    panel.render(container);

    const state = panel.getState();
    assert.equal(state.initialized, true, 'Step 3: 应已初始化');
    assert.equal(state.bookmarkCount, 10, 'Step 3: 书签数应为 10');
    assert.ok(visualizer._graphData !== null, 'Step 3: visualizer 应收到图谱数据');
    assert.ok(visualizer._graphData.nodes.length > 0, 'Step 3: 图谱应有节点');
    assert.ok(visualizer._clickCallback !== null, 'Step 3: 应注册点击回调');
  });

  // ─── R7: 点击节点 → 显示详情 ────────────────────────────────────────────────

  it('R7. 点击节点 → 高亮 + 显示详情面板', async () => {
    const visualizer = createMockVisualizer();
    const panel = createFullPanel({ visualizer });
    await panel.init(sampleBookmarks);

    const container = createMockContainer();
    panel.render(container);

    // 点击节点
    panel.handleNodeClick('1');

    // 验证高亮
    assert.equal(visualizer._highlighted, '1', '节点应被高亮');

    // 验证详情面板
    const detailData = panel._detailPanel.getPanelData();
    assert.ok(detailData !== null, '详情面板应有数据');
    assert.equal(detailData.bookmark.id, '1', '详情应为书签 1');
    assert.equal(detailData.bookmark.title, 'React 官方文档', '标题应正确');
    assert.ok(detailData.similarBookmarks.length > 0, '应有相似书签推荐');
  });

  // ─── R8: 搜索 → 高亮匹配节点 ───────────────────────────────────────────────

  it('R8. 搜索 → 高亮匹配节点 + 重置', async () => {
    const visualizer = createMockVisualizer();
    const panel = createFullPanel({ visualizer });
    await panel.init(sampleBookmarks);

    // 搜索
    panel.search('react');
    assert.equal(visualizer._searchQuery, 'react', '搜索词应传递到 visualizer');

    // 重置
    panel.search('');
    assert.equal(visualizer._searchQuery, null, '空搜索应重置高亮');
  });

  // ─── R9: refresh 重新加载 ──────────────────────────────────────────────────

  it('R9. refresh() 重新采集 + 重建 + 重新渲染', async () => {
    const visualizer = createMockVisualizer();
    const collector = createMockCollector(sampleBookmarks);
    const panel = createFullPanel({ visualizer, collector });
    const container = createMockContainer();

    // 首次初始化
    panel.markLoading();
    panel.render(container);
    await panel.init(sampleBookmarks);
    panel.render(container);

    assert.equal(panel.getState().bookmarkCount, 10, '初始应有 10 个书签');

    // 刷新 (会重新 collect + render)
    await panel.refresh();

    const state = panel.getState();
    assert.equal(state.initialized, true, 'refresh 后应已初始化');
    assert.equal(state.bookmarkCount, 10, 'refresh 后书签数应正确');
  });

  // ─── R10: 错误 → 重试 → 成功 ───────────────────────────────────────────────

  it('R10. init 失败 → render 错误状态 → refresh 重试成功', async () => {
    const mockDoc = createMockDocument();
    let failOnce = true;
    const collector = {
      async collect() {
        if (failOnce) {
          failOnce = false;
          throw new Error('Temporary network error');
        }
        return [...sampleBookmarks];
      },
    };

    const panel = createFullPanel({ _doc: mockDoc, collector });
    const container = createMockContainer();

    // Step 1: 标记 loading，首次 render 显示加载状态
    panel.markLoading();
    panel.render(container);
    assert.ok(container.textContent.includes('正在加载'), '应先显示加载状态');

    // Step 2: init 失败
    let thrown = false;
    try {
      await panel.init();
    } catch {
      thrown = true;
    }
    assert.equal(thrown, true, 'init 应抛出异常');
    assert.equal(panel.getState().error, 'Temporary network error', '应设置错误信息');

    // Step 3: render 显示错误状态 (含重试按钮)
    panel.render(container);
    assert.ok(container.textContent.includes('加载失败'), '应显示错误信息');
    assert.ok(container.textContent.includes('重试'), '应显示重试按钮');

    // Step 4: refresh 重试成功
    await panel.refresh();

    const state = panel.getState();
    assert.equal(state.initialized, true, '重试后应已初始化');
    assert.equal(state.error, '', '重试后不应有错误');
    assert.equal(state.bookmarkCount, sampleBookmarks.length, '重试后书签数应正确');
  });

  // ─── 完整生命周期: TabManager + BookmarkPanel ───────────────────────────────

  it('完整生命周期: TabManager + BookmarkPanel 全流程', async () => {
    const mockDoc = createMockDocument();
    const visualizer = createMockVisualizer();
    const panel = createFullPanel({ _doc: mockDoc, visualizer });

    const settingsPanel = { style: { display: '' }, children: [] };
    const bookmarkPanel = {
      style: { display: '' },
      children: [],
      innerHTML: '',
      textContent: '',
      appendChild(child) { this.children.push(child); return child; },
    };

    const manager = buildTabManager({
      settingsPanel,
      bookmarkPanel,
      panel,
    });

    // Step 1: 初始状态
    assert.equal(manager.getCurrentTab(), 'settings');

    // Step 2: 切换到图谱
    manager.switchTab('bookmark');
    assert.equal(bookmarkPanel.style.display, 'block');
    assert.equal(settingsPanel.style.display, 'none');

    // Step 3: 等待 init 完成
    await new Promise(r => setTimeout(r, 30));
    assert.equal(panel.getState().initialized, true, 'panel 应已初始化');

    // Step 4: 搜索
    panel.search('react');
    assert.equal(visualizer._searchQuery, 'react');

    // Step 5: 节点点击
    panel.handleNodeClick('1');
    assert.equal(visualizer._highlighted, '1');
    assert.ok(panel._detailPanel.getPanelData() !== null, '详情面板应有数据');

    // Step 6: 切换离开
    manager.switchTab('settings');
    assert.equal(bookmarkPanel.style.display, 'none');
    assert.equal(settingsPanel.style.display, 'block');

    // Step 7: 重新切回
    manager.switchTab('bookmark');
    assert.equal(bookmarkPanel.style.display, 'block');

    await new Promise(r => setTimeout(r, 30));
    assert.equal(panel.getState().initialized, true, '重新切回后应重新初始化');
  });
});
