/**
 * BookmarkOverview — 弹窗中的书签概览模块
 *
 * 在 popup 中展示书签统计、分布、最近添加、搜索等信息，
 * 并提供与选项页/原网页的跳转交互。
 *
 * 功能:
 *   - 书签总数统计
 *   - 领域/文件夹分布 Top-5
 *   - 最近添加 5 条书签
 *   - 待读 (unread) 数量
 *   - 实时搜索过滤
 *   - "查看完整图谱"按钮 → 打开选项页
 *   - 点击书签 → 打开原网页
 */

import { t as i18nT, registerLocale } from '../lib/i18n.js'
import { BOOKMARK_I18N_KEYS, bookmarkZhCN, bookmarkEnUS, getStatusLabel, getStatusLabels } from '../lib/bookmark-i18n.js'

// 确保书签语言包已注册（幂等操作）
let _bookmarkLocaleRegistered = false
function _ensureLocale() {
  if (!_bookmarkLocaleRegistered) {
    registerLocale('zh-CN', bookmarkZhCN)
    registerLocale('en-US', bookmarkEnUS)
    _bookmarkLocaleRegistered = true
  }
}

/**
 * 书签模块翻译辅助函数
 * 将短 key 映射到全局 i18n key
 */
function bt(key, params) {
  _ensureLocale()
  const i18nKey = BOOKMARK_I18N_KEYS[key]
  return i18nKey ? i18nT(i18nKey, params) : key
}

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} folderPath
 * @property {string[]} [tags]
 * @property {string}   [status]     — unread / reading / read
 * @property {number}   [dateAdded]  — 添加时间戳 (ms)
 */

/**
 * @typedef {Object} OverviewStats
 * @property {number}  totalCount      — 书签总数
 * @property {number}  unreadCount     — 待读数量
 * @property {Array<{name:string, count:number}>} topFolders — Top-5 文件夹
 * @property {Array<{name:string, count:number}>} topDomains — Top-5 域名
 * @property {Bookmark[]} recentBookmarks — 最近添加 5 条
 */

/**
 * @typedef {Object} OverviewCallbacks
 * @property {(url: string) => void}        [openUrl]        — 打开原网页
 * @property {() => void}                    [openOptionsPage]— 打开选项页
 */

export class BookmarkOverview {
  /**
   * @param {Object} deps — 依赖注入
   * @param {import('../lib/bookmark-collector.js').BookmarkCollector}  [deps.collector]
   * @param {import('../lib/bookmark-indexer.js').BookmarkIndexer}     [deps.indexer]
   * @param {import('../lib/bookmark-graph.js').BookmarkGraphEngine}   [deps.graphEngine]
   * @param {import('../lib/bookmark-search.js').BookmarkSearch}       [deps.search]
   * @param {OverviewCallbacks} [deps.callbacks]
   */
  constructor(deps = {}) {
    this._collector = deps.collector || null;
    this._indexer = deps.indexer || null;
    this._graphEngine = deps.graphEngine || null;
    this._search = deps.search || null;
    this._callbacks = deps.callbacks || {};

    /** @type {Bookmark[]} */
    this._bookmarks = [];
    /** @type {Bookmark[]} — 当前过滤后的书签列表 */
    this._filteredBookmarks = [];
    /** @type {OverviewStats} */
    this._stats = null;
    /** @type {string} 当前搜索关键词 */
    this._searchQuery = '';
    /** @type {HTMLElement|null} */
    this._container = null;
    /** @type {boolean} */
    this._initialized = false;
  }

  // ==================== 核心 API ====================

  /**
   * 初始化 — 加载书签数据，构建索引和图谱
   *
   * @param {Bookmark[]} [bookmarks] — 可选直接传入书签数组 (测试用)
   * @returns {Promise<void>}
   */
  async init(bookmarks) {
    if (bookmarks && Array.isArray(bookmarks)) {
      // 直接传入书签 (测试/预加载模式)
      this._bookmarks = bookmarks;
    } else if (this._collector) {
      // 通过 collector 采集
      try {
        this._bookmarks = await this._collector.collect();
      } catch (err) {
        console.error('BookmarkOverview: collect failed', err);
        this._bookmarks = [];
      }
    } else {
      this._bookmarks = [];
    }

    // 构建索引
    if (this._indexer && this._bookmarks.length > 0) {
      this._indexer.buildIndex(this._bookmarks);
    }

    // 构建图谱
    if (this._graphEngine && this._bookmarks.length > 0) {
      this._graphEngine.buildGraph(this._bookmarks);
    }

    this._filteredBookmarks = [...this._bookmarks];
    this._stats = this._computeStats(this._bookmarks);
    this._initialized = true;
  }

  /**
   * 渲染概览 UI 到指定容器
   *
   * @param {HTMLElement} container
   */
  render(container) {
    if (!container) {
      throw new Error('BookmarkOverview.render() requires a container element');
    }
    this._container = container;

    // 清空容器
    container.innerHTML = '';

    if (!this._initialized || this._bookmarks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'overview-empty';
      empty.textContent = bt('panel.empty.title');
      container.appendChild(empty);
      return;
    }

    const stats = this._stats;

    // ─── 搜索框 ───
    const searchBox = this._createSearchBox();
    container.appendChild(searchBox);

    // ─── 统计概览 ───
    const statsSection = this._createStatsSection(stats);
    container.appendChild(statsSection);

    // ─── 领域分布 ───
    const domainSection = this._createDistributionSection(
      bt('overview.domainDistribution'),
      stats.topDomains,
    );
    container.appendChild(domainSection);

    // ─── 文件夹分布 ───
    const folderSection = this._createDistributionSection(
      bt('overview.folderDistribution'),
      stats.topFolders,
    );
    container.appendChild(folderSection);

    // ─── 最近添加 ───
    const recentSection = this._createRecentSection(stats.recentBookmarks);
    container.appendChild(recentSection);

    // ─── 查看完整图谱按钮 ───
    const graphBtn = this._createGraphButton();
    container.appendChild(graphBtn);

    // ─── 书签列表 (搜索结果) ───
    const listSection = this._createBookmarkList(this._filteredBookmarks);
    container.appendChild(listSection);
  }

  /**
   * 刷新数据 — 重新采集、重算统计、重新渲染
   *
   * @returns {Promise<void>}
   */
  async refresh() {
    this._initialized = false;
    this._searchQuery = '';
    await this.init();

    if (this._container) {
      this.render(this._container);
    }
  }

  /**
   * 获取当前统计数据
   *
   * @returns {OverviewStats}
   */
  getStats() {
    return this._stats || this._computeStats(this._bookmarks);
  }

  /**
   * 执行搜索过滤 (同步，可直接调用)
   *
   * @param {string} query
   * @returns {Bookmark[]}
   */
  filter(query) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      this._filteredBookmarks = [...this._bookmarks];
      this._searchQuery = '';
    } else {
      this._searchQuery = query.trim();
      this._filteredBookmarks = this._filterBookmarks(this._bookmarks, this._searchQuery);
    }

    // 更新列表 UI (如果已渲染)
    this._updateBookmarkList();
    return this._filteredBookmarks;
  }

  // ==================== 数据计算 ====================

  /**
   * 计算概览统计
   *
   * @param {Bookmark[]} bookmarks
   * @returns {OverviewStats}
   */
  _computeStats(bookmarks) {
    const totalCount = bookmarks.length;
    const unreadCount = bookmarks.filter(b =>
      !b.status || b.status === 'unread',
    ).length;

    // 文件夹分布
    const folderCounts = new Map();
    for (const bm of bookmarks) {
      if (bm.folderPath && Array.isArray(bm.folderPath) && bm.folderPath.length > 0) {
        const key = bm.folderPath.join(' / ');
        folderCounts.set(key, (folderCounts.get(key) || 0) + 1);
      }
    }

    // 域名分布
    const domainCounts = new Map();
    for (const bm of bookmarks) {
      try {
        const url = new URL(bm.url);
        const domain = url.hostname.replace(/^www\./, '');
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      } catch {
        // 忽略非法 URL
      }
    }

    // 排序取 Top-5
    const topFolders = [...folderCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const topDomains = [...domainCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // 最近添加 5 条 (按 dateAdded 降序)
    const recentBookmarks = [...bookmarks]
      .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
      .slice(0, 5);

    return {
      totalCount,
      unreadCount,
      topFolders,
      topDomains,
      recentBookmarks,
    };
  }

  /**
   * 书签过滤 (关键词匹配标题 / URL / 文件夹)
   *
   * @param {Bookmark[]} bookmarks
   * @param {string} query
   * @returns {Bookmark[]}
   */
  _filterBookmarks(bookmarks, query) {
    const lower = query.toLowerCase();
    const tokens = lower.split(/\s+/).filter(Boolean);

    return bookmarks.filter(bm => {
      const title = (bm.title || '').toLowerCase();
      const url = (bm.url || '').toLowerCase();
      const folder = (bm.folderPath || []).join(' ').toLowerCase();
      const tags = (bm.tags || []).join(' ').toLowerCase();
      const haystack = `${title} ${url} ${folder} ${tags}`;

      return tokens.every(token => haystack.includes(token));
    });
  }

  // ==================== DOM 构建 ====================

  /**
   * 创建搜索框
   * @returns {HTMLElement}
   */
  _createSearchBox() {
    const wrapper = document.createElement('div');
    wrapper.className = 'overview-search';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = bt('search.placeholder');
    input.className = 'overview-search-input';
    input.value = this._searchQuery;

    input.addEventListener('input', (e) => {
      this.filter(e.target.value);
    });

    wrapper.appendChild(input);
    return wrapper;
  }

  /**
   * 创建统计概览区域
   * @param {OverviewStats} stats
   * @returns {HTMLElement}
   */
  _createStatsSection(stats) {
    const section = document.createElement('div');
    section.className = 'overview-stats';

    const totalEl = document.createElement('div');
    totalEl.className = 'overview-stat-item';
    totalEl.innerHTML = '';
    const totalLabel = document.createElement('span');
    totalLabel.className = 'overview-stat-label';
    totalLabel.textContent = bt('stats.total');
    const totalValue = document.createElement('span');
    totalValue.className = 'overview-stat-value';
    totalValue.textContent = String(stats.totalCount);
    totalEl.appendChild(totalLabel);
    totalEl.appendChild(totalValue);

    const unreadEl = document.createElement('div');
    unreadEl.className = 'overview-stat-item';
    const unreadLabel = document.createElement('span');
    unreadLabel.className = 'overview-stat-label';
    unreadLabel.textContent = bt('stats.unread');
    const unreadValue = document.createElement('span');
    unreadValue.className = 'overview-stat-value';
    unreadValue.textContent = String(stats.unreadCount);
    unreadEl.appendChild(unreadLabel);
    unreadEl.appendChild(unreadValue);

    section.appendChild(totalEl);
    section.appendChild(unreadEl);

    return section;
  }

  /**
   * 创建分布区域 (域名/文件夹)
   * @param {string} title
   * @param {Array<{name:string, count:number}>} items
   * @returns {HTMLElement}
   */
  _createDistributionSection(title, items) {
    const section = document.createElement('div');
    section.className = 'overview-distribution';

    const header = document.createElement('h3');
    header.className = 'overview-section-title';
    header.textContent = title;
    section.appendChild(header);

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'overview-distribution-empty';
      empty.textContent = bt('overview.noData');
      section.appendChild(empty);
      return section;
    }

    const list = document.createElement('ul');
    list.className = 'overview-distribution-list';

    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'overview-distribution-item';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'overview-distribution-name';
      nameSpan.textContent = item.name;
      const countSpan = document.createElement('span');
      countSpan.className = 'overview-distribution-count';
      countSpan.textContent = String(item.count);
      li.appendChild(nameSpan);
      li.appendChild(countSpan);
      list.appendChild(li);
    }

    section.appendChild(list);
    return section;
  }

  /**
   * 创建最近添加区域
   * @param {Bookmark[]} recentBookmarks
   * @returns {HTMLElement}
   */
  _createRecentSection(recentBookmarks) {
    const section = document.createElement('div');
    section.className = 'overview-recent';

    const header = document.createElement('h3');
    header.className = 'overview-section-title';
    header.textContent = bt('overview.recentlyAdded');
    section.appendChild(header);

    if (recentBookmarks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'overview-recent-empty';
      empty.textContent = bt('overview.recentBookmarks');
      section.appendChild(empty);
      return section;
    }

    const list = document.createElement('ul');
    list.className = 'overview-recent-list';

    for (const bm of recentBookmarks) {
      const li = this._createBookmarkItem(bm);
      list.appendChild(li);
    }

    section.appendChild(list);
    return section;
  }

  /**
   * 创建 "查看完整图谱" 按钮
   * @returns {HTMLElement}
   */
  _createGraphButton() {
    const btn = document.createElement('button');
    btn.className = 'overview-graph-btn';
    btn.textContent = bt('overview.viewGraph');

    btn.addEventListener('click', () => {
      if (this._callbacks.openOptionsPage) {
        this._callbacks.openOptionsPage();
      }
    });

    return btn;
  }

  /**
   * 创建书签列表 (搜索结果)
   * @param {Bookmark[]} bookmarks
   * @returns {HTMLElement}
   */
  _createBookmarkList(bookmarks) {
    const section = document.createElement('div');
    section.className = 'overview-bookmark-list';
    section.setAttribute('data-section', 'bookmark-list');

    if (bookmarks.length === 0 && this._searchQuery) {
      const empty = document.createElement('div');
      empty.className = 'overview-no-results';
      empty.textContent = bt('overview.noResults');
      section.appendChild(empty);
      return section;
    }

    // 限制显示最多 20 条
    const displayBookmarks = bookmarks.slice(0, 20);
    const list = document.createElement('ul');
    list.className = 'overview-bookmark-items';

    for (const bm of displayBookmarks) {
      const li = this._createBookmarkItem(bm);
      list.appendChild(li);
    }

    section.appendChild(list);

    // 显示总数提示
    if (bookmarks.length > 20) {
      const more = document.createElement('div');
      more.className = 'overview-more-hint';
      more.textContent = bt('overview.moreHint', { shown: 20, total: bookmarks.length });
      section.appendChild(more);
    }

    return section;
  }

  /**
   * 创建单个书签项
   * @param {Bookmark} bm
   * @returns {HTMLElement}
   */
  _createBookmarkItem(bm) {
    const li = document.createElement('li');
    li.className = 'overview-bookmark-item';
    li.setAttribute('data-bookmark-id', bm.id);

    const titleLink = document.createElement('a');
    titleLink.className = 'overview-bookmark-title';
    titleLink.textContent = bm.title || bm.url;
    titleLink.href = '#';
    titleLink.title = bm.url || '';

    titleLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (this._callbacks.openUrl) {
        this._callbacks.openUrl(bm.url);
      }
    });

    const meta = document.createElement('div');
    meta.className = 'overview-bookmark-meta';

    if (bm.folderPath && bm.folderPath.length > 0) {
      const folderSpan = document.createElement('span');
      folderSpan.className = 'overview-bookmark-folder';
      folderSpan.textContent = bm.folderPath.join(' / ');
      meta.appendChild(folderSpan);
    }

    const status = bm.status || 'unread';
    const statusSpan = document.createElement('span');
    statusSpan.className = `overview-bookmark-status overview-bookmark-status--${status}`;
    statusSpan.textContent = getStatusLabel(status) || status;
    meta.appendChild(statusSpan);

    li.appendChild(titleLink);
    li.appendChild(meta);

    return li;
  }

  /**
   * 更新书签列表 (搜索过滤后)
   */
  _updateBookmarkList() {
    if (!this._container) return;

    // 移除旧列表
    const oldList = this._container.querySelector('[data-section="bookmark-list"]');
    if (oldList) {
      oldList.remove();
    }

    // 追加新列表
    const newList = this._createBookmarkList(this._filteredBookmarks);
    this._container.appendChild(newList);
  }
}
