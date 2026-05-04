/**
 * 测试 popup/bookmark-overview.js — 弹窗概览
 *
 * 测试范围:
 *   init() / getStats() / filter() / render() / refresh()
 *   统计计算 / 搜索过滤 / DOM 构建 / 交互回调
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkOverview } = await import('../popup/bookmark-overview.js');

// ==================== DOM Stub (Node.js 环境无真实 DOM) ====================

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.type = '';
    this.placeholder = '';
    this.href = '';
    this.title = '';
    this.id = '';
    this._attrs = {};
    this._children = [];
    this._listeners = {};
  }

  appendChild(child) {
    this._children.push(child);
    return child;
  }

  remove() {
    // no-op
  }

  setAttribute(key, value) {
    this._attrs[key] = value;
  }

  getAttribute(key) {
    return this._attrs[key];
  }

  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  querySelector(selector) {
    // 简单选择器支持: [data-section="bookmark-list"]
    for (const child of this._getAllChildren()) {
      if (child._attrs && this._matchSelector(child, selector)) {
        return child;
      }
    }
    return null;
  }

  _getAllChildren() {
    const result = [];
    const stack = [...this._children];
    while (stack.length > 0) {
      const el = stack.pop();
      result.push(el);
      if (el._children) {
        stack.push(...el._children);
      }
    }
    return result;
  }

  _matchSelector(el, selector) {
    // [attr="value"] 匹配
    const attrMatch = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
    if (attrMatch) {
      return el._attrs[attrMatch[1]] === attrMatch[2];
    }
    // .class 匹配
    if (selector.startsWith('.')) {
      return el.className && el.className.includes(selector.slice(1));
    }
    return false;
  }

  /** 触发事件 (测试辅助) */
  _emit(event, eventData = {}) {
    const handlers = this._listeners[event] || [];
    for (const handler of handlers) {
      handler(eventData);
    }
  }
}

// 在 global 上设置 DOM stub
const savedGlobals = {};
const domStub = {
  createElement(tag) {
    return new MockElement(tag);
  },
};

// 保存并替换全局变量
function setupDomStub() {
  savedGlobals.document = globalThis.document;
  savedGlobals.window = globalThis.window;
  globalThis.document = domStub;
  globalThis.window = {};
}

function teardownDomStub() {
  if (savedGlobals.document !== undefined) {
    globalThis.document = savedGlobals.document;
  } else {
    delete globalThis.document;
  }
  if (savedGlobals.window !== undefined) {
    globalThis.window = savedGlobals.window;
  } else {
    delete globalThis.window;
  }
}

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = [], status = 'unread') {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    status,
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

// ==================== 测试 ====================

describe('BookmarkOverview', () => {
  let overview;
  let openedUrls;
  let optionsPageOpened;

  beforeEach(() => {
    setupDomStub();
    openedUrls = [];
    optionsPageOpened = false;

    overview = new BookmarkOverview({
      callbacks: {
        openUrl: (url) => openedUrls.push(url),
        openOptionsPage: () => { optionsPageOpened = true; },
      },
    });
  });

  // ─── 1. 构造函数 — 默认状态 ─────────────────────────────────────────────────

  it('1. 构造函数 — 默认状态正确', () => {
    const ov = new BookmarkOverview();
    assert.ok(ov instanceof BookmarkOverview, '应成功创建实例');
    assert.equal(ov._initialized, false, '初始状态应为未初始化');
    assert.deepEqual(ov._bookmarks, [], '初始书签列表应为空');
    assert.equal(ov._searchQuery, '', '初始搜索词应为空');
  });

  // ─── 2. init() 加载书签数据 ─────────────────────────────────────────────────

  it('2. init() — 直接传入书签数组初始化成功', async () => {
    await overview.init(sampleBookmarks);

    assert.equal(overview._initialized, true, '初始化后应为 true');
    assert.equal(overview._bookmarks.length, sampleBookmarks.length, '书签数量应一致');
    assert.deepEqual(overview._filteredBookmarks, overview._bookmarks, '过滤列表应等于全部');
  });

  // ─── 3. getStats() 统计数据 ─────────────────────────────────────────────────

  it('3. getStats() — 统计数据正确', async () => {
    await overview.init(sampleBookmarks);
    const stats = overview.getStats();

    assert.equal(stats.totalCount, 10, '书签总数应为 10');
    // unread: 1(react) + 2(vue) + 3(node) + 4(python) + 5(github) + 6(js) + 8(css) + 10(actions) = 8
    assert.equal(stats.unreadCount, 8, '待读数量应为 8');
    assert.ok(Array.isArray(stats.topFolders), 'topFolders 应为数组');
    assert.ok(Array.isArray(stats.topDomains), 'topDomains 应为数组');
    assert.ok(Array.isArray(stats.recentBookmarks), 'recentBookmarks 应为数组');
  });

  // ─── 4. getStats() Top-5 文件夹分布 ─────────────────────────────────────────

  it('4. getStats() — 文件夹分布 Top-5 正确排序', async () => {
    await overview.init(sampleBookmarks);
    const stats = overview.getStats();

    // "技术 / 前端" 有 4 条: 1,2,7,9 (完整路径精确匹配)
    // 注意: ID 6 (技术/前端/JS) 和 ID 8 (技术/前端/CSS) 是不同路径
    assert.ok(stats.topFolders.length > 0, '应有文件夹分布');
    const topFolder = stats.topFolders[0];
    assert.equal(topFolder.name, '技术 / 前端', 'Top-1 文件夹应为 "技术 / 前端"');
    assert.equal(topFolder.count, 4, '应有 4 条书签');

    // 验证降序排列
    for (let i = 1; i < stats.topFolders.length; i++) {
      assert.ok(
        stats.topFolders[i - 1].count >= stats.topFolders[i].count,
        `文件夹分布应降序排列: ${stats.topFolders[i - 1].count} >= ${stats.topFolders[i].count}`,
      );
    }
  });

  // ─── 5. getStats() Top-5 域名分布 ──────────────────────────────────────────

  it('5. getStats() — 域名分布 Top-5 正确', async () => {
    await overview.init(sampleBookmarks);
    const stats = overview.getStats();

    assert.ok(stats.topDomains.length > 0, '应有域名分布');
    // react.dev 有 2 条 (ID 1, 9), github.com 有 2 条 (ID 5, 10)
    const reactDomain = stats.topDomains.find(d => d.name === 'react.dev');
    const githubDomain = stats.topDomains.find(d => d.name === 'github.com');
    assert.ok(reactDomain, '应包含 react.dev');
    assert.equal(reactDomain.count, 2, 'react.dev 应有 2 条');
    assert.ok(githubDomain, '应包含 github.com');
    assert.equal(githubDomain.count, 2, 'github.com 应有 2 条');

    // 验证最多 5 项
    assert.ok(stats.topDomains.length <= 5, '域名分布应最多 5 项');
  });

  // ─── 6. getStats() 最近添加 ────────────────────────────────────────────────

  it('6. getStats() — 最近添加 5 条按时间降序', async () => {
    await overview.init(sampleBookmarks);
    const stats = overview.getStats();

    assert.equal(stats.recentBookmarks.length, 5, '最近添加应为 5 条');

    // 应按 dateAdded 降序
    for (let i = 1; i < stats.recentBookmarks.length; i++) {
      assert.ok(
        stats.recentBookmarks[i - 1].dateAdded >= stats.recentBookmarks[i].dateAdded,
        '最近添加应按时间降序',
      );
    }

    // 最新应是 ID=10
    assert.equal(stats.recentBookmarks[0].id, '10', '最新应为 ID=10');
  });

  // ─── 7. filter() 实时搜索过滤 ──────────────────────────────────────────────

  it('7. filter() — 关键词过滤书签', async () => {
    await overview.init(sampleBookmarks);

    // 搜索 "react"
    const results = overview.filter('react');
    assert.ok(results.length > 0, '"react" 应有匹配结果');
    for (const bm of results) {
      const haystack = `${bm.title} ${bm.url} ${(bm.folderPath || []).join(' ')} ${(bm.tags || []).join(' ')}`.toLowerCase();
      assert.ok(haystack.includes('react'), `书签 "${bm.title}" 应包含 "react"`);
    }

    // 搜索中文
    const cnResults = overview.filter('文档');
    assert.ok(cnResults.length > 0, '"文档" 应有匹配结果');
    assert.ok(cnResults.some(b => b.title.includes('文档')), '应包含 "文档" 标题的书签');
  });

  // ─── 8. filter() 空查询重置 ────────────────────────────────────────────────

  it('8. filter() — 空查询重置为全部书签', async () => {
    await overview.init(sampleBookmarks);

    // 先过滤
    overview.filter('react');
    assert.ok(overview._filteredBookmarks.length < sampleBookmarks.length, '过滤后应减少');

    // 空查询重置
    const resetResults = overview.filter('');
    assert.equal(resetResults.length, sampleBookmarks.length, '空查询应恢复全部');
    assert.equal(overview._searchQuery, '', '搜索词应清空');

    const resetResults2 = overview.filter(null);
    assert.equal(resetResults2.length, sampleBookmarks.length, 'null 查询应恢复全部');
  });

  // ─── 9. filter() 多关键词 AND 逻辑 ────────────────────────────────────────

  it('9. filter() — 多关键词 AND 过滤', async () => {
    await overview.init(sampleBookmarks);

    // "react hooks" 应同时匹配两个词
    const results = overview.filter('react hooks');
    assert.ok(results.length > 0, '"react hooks" 应有结果');
    for (const bm of results) {
      const haystack = `${bm.title} ${bm.url} ${(bm.folderPath || []).join(' ')} ${(bm.tags || []).join(' ')}`.toLowerCase();
      assert.ok(haystack.includes('react'), `应包含 "react": ${bm.title}`);
      assert.ok(haystack.includes('hooks'), `应包含 "hooks": ${bm.title}`);
    }
  });

  // ─── 10. render() DOM 结构 ─────────────────────────────────────────────────

  it('10. render() — 渲染完整 DOM 结构', async () => {
    await overview.init(sampleBookmarks);
    const container = new MockElement('div');
    overview.render(container);

    // 应包含多个子元素
    assert.ok(container._children.length >= 6, '应有至少 6 个子区域');

    // 检查是否有搜索框
    const searchInputs = [];
    const findInputs = (el) => {
      if (el.tagName === 'input') searchInputs.push(el);
      for (const child of (el._children || [])) findInputs(child);
    };
    findInputs(container);
    assert.ok(searchInputs.length > 0, '应有搜索输入框');
    assert.equal(searchInputs[0].placeholder, '搜索书签...', '搜索框 placeholder 应正确');
  });

  // ─── 11. render() 空数据 ───────────────────────────────────────────────────

  it('11. render() — 未初始化时显示空状态', () => {
    const emptyOverview = new BookmarkOverview();
    const container = new MockElement('div');
    emptyOverview.render(container);

    assert.equal(container._children.length, 1, '应有 1 个子元素');
    assert.equal(container._children[0].className, 'overview-empty', '应为空状态元素');
    assert.equal(container._children[0].textContent, '暂无书签数据', '应显示暂无数据提示');
  });

  // ─── 12. render() 无容器应抛异常 ───────────────────────────────────────────

  it('12. render() — 无容器应抛出异常', async () => {
    await overview.init(sampleBookmarks);
    assert.throws(
      () => overview.render(null),
      /requires a container element/,
      '无容器应抛出异常',
    );
  });

  // ─── 13. render() 点击书签触发回调 ─────────────────────────────────────────

  it('13. render() — 点击书签触发 openUrl 回调', async () => {
    await overview.init(sampleBookmarks);
    const container = new MockElement('div');
    overview.render(container);

    // 查找所有书签标题链接并模拟点击
    const findLinks = (el) => {
      const links = [];
      if (el.tagName === 'a' && el.className.includes('overview-bookmark-title')) {
        links.push(el);
      }
      for (const child of (el._children || [])) {
        links.push(...findLinks(child));
      }
      return links;
    };

    const links = findLinks(container);
    assert.ok(links.length > 0, '应有书签链接');

    // 点击第一个
    links[0]._emit('click', { preventDefault: () => {} });
    assert.ok(openedUrls.length > 0, '点击后应触发 openUrl 回调');
    assert.ok(openedUrls[0].startsWith('https://'), '打开的 URL 应以 https:// 开头');
  });

  // ─── 14. render() 点击图谱按钮触发回调 ─────────────────────────────────────

  it('14. render() — 点击查看完整图谱触发回调', async () => {
    await overview.init(sampleBookmarks);
    const container = new MockElement('div');
    overview.render(container);

    // 查找图谱按钮
    const findGraphBtn = (el) => {
      if (el.className && el.className.includes('overview-graph-btn')) return el;
      for (const child of (el._children || [])) {
        const found = findGraphBtn(child);
        if (found) return found;
      }
      return null;
    };

    const btn = findGraphBtn(container);
    assert.ok(btn, '应有图谱按钮');
    assert.ok(btn.textContent.includes('查看完整图谱'), '按钮文字应包含"查看完整图谱"');

    btn._emit('click');
    assert.equal(optionsPageOpened, true, '应触发 openOptionsPage 回调');
  });

  // ─── 15. render() 搜索框输入触发过滤 ───────────────────────────────────────

  it('15. render() — 搜索框输入触发实时过滤', async () => {
    await overview.init(sampleBookmarks);
    const container = new MockElement('div');
    overview.render(container);

    // 查找搜索输入框
    const findInput = (el) => {
      if (el.tagName === 'input') return el;
      for (const child of (el._children || [])) {
        const found = findInput(child);
        if (found) return found;
      }
      return null;
    };

    const input = findInput(container);
    assert.ok(input, '应有搜索输入框');

    // 模拟输入
    input.value = 'python';
    input._emit('input', { target: input });
    assert.equal(overview._searchQuery, 'python', '搜索词应更新');
    assert.ok(overview._filteredBookmarks.length < sampleBookmarks.length, '过滤后结果应减少');
  });

  // ─── 16. filter() 标签匹配 ─────────────────────────────────────────────────

  it('16. filter() — 支持按标签过滤', async () => {
    await overview.init(sampleBookmarks);

    const results = overview.filter('ml');
    assert.ok(results.length > 0, '"ml" 应匹配到结果');

    // "Python Machine Learning" 有 ml 标签
    const found = results.find(bm => bm.tags && bm.tags.includes('ml'));
    assert.ok(found, '应找到有 ml 标签的书签');
  });

  // ─── 17. refresh() 刷新数据 ────────────────────────────────────────────────

  it('17. refresh() — 刷新重置状态', async () => {
    await overview.init(sampleBookmarks);

    // 先过滤
    overview.filter('react');
    assert.ok(overview._searchQuery.length > 0, '搜索词应非空');

    // mock init 用新数据刷新
    const newBookmarks = [
      createBookmark('100', 'Deno 入门', 'https://deno.land', ['技术', '后端']),
    ];
    // 重写 init 以使用新数据
    overview._collector = null;
    overview.init = async function(bm) {
      this._bookmarks = bm || [];
      this._filteredBookmarks = [...this._bookmarks];
      this._stats = this._computeStats(this._bookmarks);
      this._initialized = true;
    };

    await overview.refresh(newBookmarks);
    assert.equal(overview._searchQuery, '', '刷新后搜索词应清空');
  });
});
