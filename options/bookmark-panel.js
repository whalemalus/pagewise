/**
 * BookmarkPanel — 选项页中的书签图谱标签页
 *
 * 在选项页中提供完整的书签图谱交互体验，集成:
 *   - BookmarkCollector  — 数据采集
 *   - BookmarkIndexer    — 搜索索引
 *   - BookmarkGraphEngine — 图谱引擎
 *   - BookmarkVisualizer  — 可视化 (Canvas 力导向图)
 *   - BookmarkDetailPanel — 详情面板
 *   - BookmarkSearch      — 综合搜索
 *   - BookmarkRecommender — 相似推荐
 *
 * 页面布局:
 *   左侧: 搜索框 + 过滤器 (文件夹/标签/状态)
 *   中间: Canvas 图谱可视化
 *   右侧: 详情面板
 *
 * 交互流程:
 *   页面加载 → 采集书签 → 构建索引/图谱 → 渲染
 *   搜索 → 高亮匹配节点
 *   点击节点 → 显示详情面板
 *   点击相似书签 → 切换到该书签
 */

/**
 * @typedef {Object} PanelDependencies
 * @property {import('../lib/bookmark-collector.js').BookmarkCollector}   [collector]
 * @property {import('../lib/bookmark-indexer.js').BookmarkIndexer}      [indexer]
 * @property {import('../lib/bookmark-graph.js').BookmarkGraphEngine}    [graphEngine]
 * @property {import('../lib/bookmark-visualizer.js').BookmarkVisualizer}[visualizer]
 * @property {import('../lib/bookmark-detail-panel.js').BookmarkDetailPanel}[detailPanel]
 * @property {import('../lib/bookmark-search.js').BookmarkSearch}        [search]
 * @property {import('../lib/bookmark-recommender.js').BookmarkRecommender}[recommender]
 */

/**
 * @typedef {Object} PanelState
 * @property {boolean}  initialized — 是否已完成初始化
 * @property {boolean}  loading     — 是否正在加载
 * @property {string}   error       — 错误信息 (空串表示无错误)
 * @property {number}   bookmarkCount — 书签总数
 * @property {string}   activeFilter — 当前活跃过滤类型
 */

export class BookmarkPanel {
  /**
   * @param {PanelDependencies} [deps] — 依赖注入
   */
  constructor(deps = {}) {
    this._collector    = deps.collector    || null;
    this._indexer      = deps.indexer      || null;
    this._graphEngine  = deps.graphEngine  || null;
    this._visualizer   = deps.visualizer   || null;
    this._detailPanel  = deps.detailPanel  || null;
    this._search       = deps.search       || null;
    this._recommender  = deps.recommender  || null;

    /** @type {import('../lib/bookmark-collector.js').NormalizedBookmark[]} */
    this._bookmarks = [];

    /** @type {PanelState} */
    this._state = {
      initialized: false,
      loading: false,
      error: '',
      bookmarkCount: 0,
      activeFilter: '',
    };

    /** @type {HTMLElement|null} */
    this._container = null;

    /** DOM 元素引用 */
    this._searchInput = null;
    this._folderFilter = null;
    this._tagFilter = null;
    this._statusFilter = null;
    this._canvasEl = null;
    this._detailContainer = null;
    this._statsBar = null;

    /** 过滤器状态 */
    this._currentFolder = '';
    this._currentTags = [];
    this._currentStatus = '';

    /** DOM 元素工厂 (可被测试覆盖) */
    this._doc = (typeof document !== 'undefined') ? document : null;
  }

  /**
   * 创建 DOM 元素 (可被测试覆盖 _doc)
   * @param {string} tag
   * @returns {HTMLElement}
   */
  _el(tag) {
    if (!this._doc) {
      throw new Error('No document available — set _doc for testing');
    }
    return this._doc.createElement(tag);
  }

  // ==================== 核心 API ====================

  /**
   * 初始化所有子模块 — 采集书签 → 构建索引 → 构建图谱
   *
   * @param {Object[]} [bookmarks] — 可选直接传入书签数组 (测试用)
   * @returns {Promise<void>}
   */
  async init(bookmarks) {
    this._state.loading = true;
    this._state.error = '';

    try {
      // 1. 采集书签
      if (bookmarks && Array.isArray(bookmarks)) {
        this._bookmarks = bookmarks;
      } else if (this._collector) {
        this._bookmarks = await this._collector.collect();
      } else {
        this._bookmarks = [];
      }

      // 2. 构建索引
      if (this._indexer && this._bookmarks.length > 0) {
        this._indexer.buildIndex(this._bookmarks);
      }

      // 3. 构建图谱
      if (this._graphEngine && this._bookmarks.length > 0) {
        this._graphEngine.buildGraph(this._bookmarks);
      }

      // 4. 设置搜索已知标签
      if (this._search) {
        const allTags = this._extractAllTags(this._bookmarks);
        this._search.setKnownTags(allTags);

        // 设置详情面板标签池
        if (this._detailPanel) {
          this._detailPanel.setAllTags(allTags);
        }
      }

      this._state.bookmarkCount = this._bookmarks.length;
      this._state.initialized = true;
      this._state.loading = false;
    } catch (err) {
      this._state.error = err.message || 'Initialization failed';
      this._state.loading = false;
      throw err;
    }
  }

  /**
   * 渲染完整图谱页面到指定容器
   *
   * @param {HTMLElement} container — 容器元素
   */
  render(container) {
    if (!container) {
      throw new Error('BookmarkPanel.render() requires a container element');
    }

    this._container = container;
    container.innerHTML = '';

    // 加载中/错误状态
    if (this._state.loading) {
      this._renderLoading(container);
      return;
    }

    if (this._state.error) {
      this._renderError(container, this._state.error);
      return;
    }

    if (!this._state.initialized || this._bookmarks.length === 0) {
      this._renderEmpty(container);
      return;
    }

    // 构建三栏布局
    const layout = this._createLayout();
    container.appendChild(layout);

    // 渲染图谱
    this._renderGraph();
  }

  /**
   * 标记面板为加载中状态 (外部调用，用于 render() 显示加载动画)
   */
  markLoading() {
    this._state.loading = true;
    this._state.error = '';
  }

  /**
   * 清理所有资源
   */
  destroy() {
    // 停止并销毁可视化器
    if (this._visualizer) {
      this._visualizer.destroy();
    }

    // 隐藏详情面板
    if (this._detailPanel) {
      this._detailPanel.hide();
    }

    // 清空 DOM
    if (this._container) {
      this._container.innerHTML = '';
    }

    // 清空 DOM 引用
    this._searchInput = null;
    this._folderFilter = null;
    this._tagFilter = null;
    this._statusFilter = null;
    this._canvasEl = null;
    this._detailContainer = null;
    this._statsBar = null;
    this._container = null;
  }

  /**
   * 获取面板状态
   * @returns {PanelState}
   */
  getState() {
    return { ...this._state };
  }

  /**
   * 获取当前书签列表
   * @returns {Object[]}
   */
  getBookmarks() {
    return [...this._bookmarks];
  }

  /**
   * 执行搜索 — 高亮匹配节点
   * @param {string} query
   */
  search(query) {
    if (!this._visualizer) return;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      this._visualizer.resetHighlight();
      return;
    }

    this._visualizer.searchHighlight(query.trim());
  }

  /**
   * 点击节点 — 显示详情面板
   * @param {string} nodeId
   */
  handleNodeClick(nodeId) {
    if (!nodeId) return;

    const id = String(nodeId);
    const bookmark = this._bookmarks.find(b => String(b.id) === id);
    if (!bookmark) return;

    // 高亮该节点
    if (this._visualizer) {
      this._visualizer.highlight(id);
    }

    // 获取相似书签 — 统一格式为 { id, title, url, score, bookmark }
    let similar = [];
    if (this._recommender) {
      const recs = this._recommender.recommend(id, 5);
      similar = recs.map(r => ({
        id: String(r.bookmark?.id || r.id || ''),
        title: r.bookmark?.title || r.title || '',
        url: r.bookmark?.url || r.url || '',
        score: r.score,
        bookmark: r.bookmark,
      }));
    } else if (this._graphEngine) {
      const raw = this._graphEngine.getSimilar(id, 5);
      similar = raw.map(item => ({
        id: String(item.id),
        title: item.bookmark?.title || '',
        url: item.bookmark?.url || '',
        score: item.score,
        bookmark: item.bookmark,
      }));
    }

    // 显示详情面板
    if (this._detailPanel) {
      this._detailPanel.show(bookmark, similar);
      this._updateDetailPanel();
    }
  }

  /**
   * 切换到相似书签
   * @param {string} bookmarkId
   */
  handleSimilarClick(bookmarkId) {
    if (!bookmarkId || !this._detailPanel) return;

    const result = this._detailPanel.switchToSimilar(bookmarkId);
    if (result) {
      // 用完整的书签数据重新展示
      const fullBookmark = this._bookmarks.find(b => String(b.id) === String(bookmarkId));
      if (fullBookmark) {
        this.handleNodeClick(bookmarkId);
      }
    }
  }

  /**
   * 应用过滤器
   * @param {{ folder?: string, tags?: string[], status?: string }} filters
   */
  applyFilters(filters = {}) {
    if (filters.folder !== undefined) this._currentFolder = filters.folder;
    if (filters.tags !== undefined) this._currentTags = filters.tags;
    if (filters.status !== undefined) this._currentStatus = filters.status;

    // 更新状态 — 以最后应用的过滤器为准
    const activeParts = [this._currentFolder, this._currentStatus].filter(Boolean);
    this._state.activeFilter = activeParts.length > 0 ? activeParts[activeParts.length - 1] : '';
  }

  /**
   * 刷新 — 重新采集、重建索引/图谱、重新渲染
   * @returns {Promise<void>}
   */
  async refresh() {
    this._state.initialized = false;

    // 先渲染加载状态
    if (this._container) {
      this.markLoading();
      this.render(this._container);
    }

    try {
      await this.init();
    } catch (err) {
      // init 失败时 error 已设置在 init() 内部
    }

    // 重新渲染，显示数据或错误状态
    if (this._container) {
      this.render(this._container);
    }
  }

  // ==================== 查询方法 ====================

  /**
   * 收集书签中所有标签
   * @param {Object[]} bookmarks
   * @returns {string[]}
   */
  _extractAllTags(bookmarks) {
    const tagSet = new Set();
    for (const bm of bookmarks) {
      if (bm.tags && Array.isArray(bm.tags)) {
        for (const tag of bm.tags) {
          tagSet.add(String(tag).trim().toLowerCase());
        }
      }
    }
    return [...tagSet].filter(Boolean);
  }

  /**
   * 获取所有文件夹 (去重)
   * @returns {string[]}
   */
  getFolders() {
    const folderSet = new Set();
    for (const bm of this._bookmarks) {
      if (bm.folderPath && Array.isArray(bm.folderPath) && bm.folderPath.length > 0) {
        folderSet.add(bm.folderPath.join(' / '));
      }
    }
    return [...folderSet].sort();
  }

  /**
   * 获取所有标签 (去重)
   * @returns {string[]}
   */
  getTags() {
    return this._extractAllTags(this._bookmarks);
  }

  // ==================== DOM 构建 ====================

  /**
   * 创建三栏布局: 左侧(搜索+过滤) | 中间(Canvas图谱) | 右侧(详情面板)
   * @returns {HTMLElement}
   */
  _createLayout() {
    const layout = this._el('div');
    layout.className = 'bookmark-panel-layout';

    // 左侧: 搜索 + 过滤器
    const left = this._createLeftPanel();
    layout.appendChild(left);

    // 中间: Canvas 图谱
    const center = this._createCenterPanel();
    layout.appendChild(center);

    // 右侧: 详情面板
    const right = this._createRightPanel();
    layout.appendChild(right);

    return layout;
  }

  /**
   * 创建左侧面板 (搜索框 + 过滤器)
   * @returns {HTMLElement}
   */
  _createLeftPanel() {
    const panel = this._el('div');
    panel.className = 'bookmark-panel-left';

    // 搜索框
    const searchBox = this._el('div');
    searchBox.className = 'bookmark-panel-search';

    const input = this._el('input');
    input.type = 'text';
    input.placeholder = '搜索书签...';
    input.className = 'bookmark-panel-search-input';
    this._searchInput = input;

    input.addEventListener('input', (e) => {
      this.search(e.target.value);
    });

    searchBox.appendChild(input);
    panel.appendChild(searchBox);

    // 文件夹过滤器
    const folderGroup = this._createFilterGroup('文件夹', 'folder');
    this._folderFilter = folderGroup.querySelector('select');
    panel.appendChild(folderGroup);

    // 标签过滤器
    const tagGroup = this._createFilterGroup('标签', 'tags');
    this._tagFilter = tagGroup.querySelector('select');
    panel.appendChild(tagGroup);

    // 状态过滤器
    const statusGroup = this._createFilterGroup('状态', 'status');
    this._statusFilter = statusGroup.querySelector('select');
    panel.appendChild(statusGroup);

    // 统计栏
    const statsBar = this._el('div');
    statsBar.className = 'bookmark-panel-stats';
    statsBar.textContent = `共 ${this._bookmarks.length} 个书签`;
    this._statsBar = statsBar;
    panel.appendChild(statsBar);

    return panel;
  }

  /**
   * 创建过滤器分组
   * @param {string} label — 标签文本
   * @param {string} type — 过滤类型 (folder/tags/status)
   * @returns {HTMLElement}
   */
  _createFilterGroup(label, type) {
    const group = this._el('div');
    group.className = 'bookmark-panel-filter-group';

    const labelEl = this._el('label');
    labelEl.className = 'bookmark-panel-filter-label';
    labelEl.textContent = label;
    group.appendChild(labelEl);

    const select = this._el('select');
    select.className = 'bookmark-panel-filter-select';
    select.setAttribute('data-filter-type', type);

    // 添加 "全部" 选项
    const allOption = this._el('option');
    allOption.value = '';
    allOption.textContent = `全部${label}`;
    select.appendChild(allOption);

    // 根据类型填充选项
    if (type === 'folder') {
      const folders = this.getFolders();
      for (const folder of folders) {
        const opt = this._el('option');
        opt.value = folder;
        opt.textContent = folder;
        select.appendChild(opt);
      }
    } else if (type === 'tags') {
      const tags = this.getTags();
      for (const tag of tags) {
        const opt = this._el('option');
        opt.value = tag;
        opt.textContent = tag;
        select.appendChild(opt);
      }
    } else if (type === 'status') {
      for (const status of ['unread', 'reading', 'read']) {
        const opt = this._el('option');
        opt.value = status;
        const labels = { unread: '待读', reading: '阅读中', read: '已读' };
        opt.textContent = labels[status];
        select.appendChild(opt);
      }
    }

    // 过滤事件
    select.addEventListener('change', (e) => {
      const value = e.target.value;
      const filters = {};
      if (type === 'folder') filters.folder = value;
      else if (type === 'tags') filters.tags = value ? [value] : [];
      else if (type === 'status') filters.status = value;
      this.applyFilters(filters);
    });

    group.appendChild(select);
    return group;
  }

  /**
   * 创建中间面板 (Canvas 图谱)
   * @returns {HTMLElement}
   */
  _createCenterPanel() {
    const panel = this._el('div');
    panel.className = 'bookmark-panel-center';

    const canvas = this._el('canvas');
    canvas.className = 'bookmark-panel-canvas';
    canvas.width = 800;
    canvas.height = 600;
    this._canvasEl = canvas;
    panel.appendChild(canvas);

    return panel;
  }

  /**
   * 创建右侧面板 (详情面板容器)
   * @returns {HTMLElement}
   */
  _createRightPanel() {
    const panel = this._el('div');
    panel.className = 'bookmark-panel-right';

    const detailContainer = this._el('div');
    detailContainer.className = 'bookmark-panel-detail';
    this._detailContainer = detailContainer;

    // 初始提示
    const hint = this._el('div');
    hint.className = 'bookmark-panel-detail-hint';
    hint.textContent = '点击图谱节点查看书签详情';
    detailContainer.appendChild(hint);

    panel.appendChild(detailContainer);
    return panel;
  }

  /**
   * 渲染图谱到 Canvas
   */
  _renderGraph() {
    if (!this._visualizer || !this._graphEngine) return;

    const graphData = this._graphEngine.getGraphData();
    this._visualizer.render(graphData);

    // 注册节点点击回调
    this._visualizer.onNodeClick((nodeId) => {
      this.handleNodeClick(nodeId);
    });
  }

  /**
   * 更新详情面板 DOM
   */
  _updateDetailPanel() {
    if (!this._detailPanel || !this._detailContainer) return;

    const data = this._detailPanel.getPanelData();
    if (!data) return;

    this._detailContainer.innerHTML = '';

    // 标题
    const title = this._el('h3');
    title.className = 'bookmark-panel-detail-title';
    title.textContent = data.bookmark.title || data.bookmark.url;
    this._detailContainer.appendChild(title);

    // URL
    if (data.bookmark.url) {
      const url = this._el('a');
      url.className = 'bookmark-panel-detail-url';
      url.href = data.bookmark.url;
      url.textContent = data.bookmark.url;
      url.target = '_blank';
      this._detailContainer.appendChild(url);
    }

    // 文件夹路径
    if (data.formattedFolderPath && data.formattedFolderPath !== '/') {
      const folder = this._el('div');
      folder.className = 'bookmark-panel-detail-folder';
      folder.textContent = `📁 ${data.formattedFolderPath}`;
      this._detailContainer.appendChild(folder);
    }

    // 添加时间
    if (data.formattedDate) {
      const date = this._el('div');
      date.className = 'bookmark-panel-detail-date';
      date.textContent = `🕐 ${data.formattedDate}`;
      this._detailContainer.appendChild(date);
    }

    // 状态
    const statusEl = this._el('div');
    statusEl.className = 'bookmark-panel-detail-status';
    const statusLabels = { unread: '待读', reading: '阅读中', read: '已读' };
    statusEl.textContent = `状态: ${statusLabels[data.status] || data.status}`;
    this._detailContainer.appendChild(statusEl);

    // 标签
    if (data.tags.length > 0) {
      const tagsEl = this._el('div');
      tagsEl.className = 'bookmark-panel-detail-tags';
      tagsEl.textContent = `标签: ${data.tags.join(', ')}`;
      this._detailContainer.appendChild(tagsEl);
    }

    // 相似书签
    if (data.similarBookmarks.length > 0) {
      const similarHeader = this._el('div');
      similarHeader.className = 'bookmark-panel-detail-similar-header';
      similarHeader.textContent = '相似书签:';
      this._detailContainer.appendChild(similarHeader);

      const similarList = this._el('ul');
      similarList.className = 'bookmark-panel-detail-similar-list';

      for (const similar of data.similarBookmarks) {
        const li = this._el('li');
        li.className = 'bookmark-panel-detail-similar-item';
        li.setAttribute('data-bookmark-id', similar.id);

        const link = this._el('a');
        link.className = 'bookmark-panel-detail-similar-link';
        link.href = '#';
        link.textContent = similar.title;
        link.title = `${(similar.score * 100).toFixed(0)}% 相似`;

        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.handleSimilarClick(similar.id);
        });

        li.appendChild(link);
        similarList.appendChild(li);
      }

      this._detailContainer.appendChild(similarList);
    }
  }

  /**
   * 渲染加载状态 (包含旋转动画)
   * @param {HTMLElement} container
   */
  _renderLoading(container) {
    const el = this._el('div');
    el.className = 'bookmark-panel-loading';
    el.appendChild(this._renderLoadingSpinner());
    const text = this._el('span');
    text.className = 'bookmark-panel-loading-text';
    text.textContent = '正在加载书签数据...';
    el.appendChild(text);
    container.appendChild(el);
  }

  /**
   * 创建加载旋转动画元素
   * @returns {HTMLElement}
   */
  _renderLoadingSpinner() {
    const spinner = this._el('div');
    spinner.className = 'bookmark-panel-spinner';
    spinner.setAttribute('role', 'status');
    spinner.setAttribute('aria-label', '加载中');
    return spinner;
  }

  /**
   * 渲染错误状态 (包含重试按钮)
   * @param {HTMLElement} container
   * @param {string} message
   */
  _renderError(container, message) {
    const el = this._el('div');
    el.className = 'bookmark-panel-error';

    const msg = this._el('div');
    msg.className = 'bookmark-panel-error-message';
    msg.textContent = `加载失败: ${message}`;
    el.appendChild(msg);

    const retryBtn = this._el('button');
    retryBtn.className = 'bookmark-panel-error-retry';
    retryBtn.textContent = '重试';
    retryBtn.addEventListener('click', () => {
      this.refresh();
    });
    el.appendChild(retryBtn);

    container.appendChild(el);
  }

  /**
   * 渲染空状态 (包含引导信息)
   * @param {HTMLElement} container
   */
  _renderEmpty(container) {
    const el = this._el('div');
    el.className = 'bookmark-panel-empty';

    const title = this._el('div');
    title.className = 'bookmark-panel-empty-title';
    title.textContent = '暂无书签数据';
    el.appendChild(title);

    const guide = this._el('div');
    guide.className = 'bookmark-panel-empty-guide';
    guide.innerHTML =
      '<p>💡 您可以通过以下方式添加书签：</p>' +
      '<ul>' +
      '  <li>在浏览器中按 <kbd>Ctrl+D</kbd> 收藏当前页面</li>' +
      '  <li>右键点击页面 → "为此页面添加书签"</li>' +
      '  <li>点击地址栏右侧的 ☆ 图标</li>' +
      '</ul>' +
      '<p>添加书签后，点击下方按钮刷新。</p>';
    el.appendChild(guide);

    const refreshBtn = this._el('button');
    refreshBtn.className = 'bookmark-panel-empty-refresh';
    refreshBtn.textContent = '刷新书签';
    refreshBtn.addEventListener('click', () => {
      this.refresh();
    });
    el.appendChild(refreshBtn);

    container.appendChild(el);
  }
}