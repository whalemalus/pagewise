/**
 * test-depth-bookmark-graph.js — BookmarkGraph 深度测试
 *
 * 测试范围 (15 用例):
 *   buildGraph      — 空输入、null/undefined、基本构建、节点属性、边权重
 *   applyTransform  — 缩放、重置缩放、平移、空图缩放
 *   filterByTags    — 按标签过滤、空标签、多标签、标签建议、状态切换
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  BookmarkGraphEngine,
  BookmarkVisualizer,
  BookmarkDetailPanel,
} = await import('../lib/bookmark-graph.js');

// ── 辅助工厂 ────────────────────────────────────────────────────────────────

function bm(overrides = {}) {
  return {
    id: String(overrides.id ?? Math.random().toString(36).slice(2, 8)),
    title: overrides.title ?? 'Test Bookmark',
    url: overrides.url ?? 'https://example.com/page',
    folderPath: overrides.folderPath ?? ['Bookmarks Bar'],
    tags: overrides.tags ?? [],
    status: overrides.status ?? 'unread',
    dateAdded: overrides.dateAdded ?? Date.now(),
    ...overrides,
  };
}

/** 创建最小化 canvas mock，满足 BookmarkVisualizer 构造函数 */
function createCanvasMock(w = 800, h = 600) {
  const listeners = {};
  return {
    width: w,
    height: h,
    getContext() {
      return {
        clearRect() {},
        fillRect() {},
        fillText() {},
        beginPath() {},
        arc() {},
        moveTo() {},
        lineTo() {},
        fill() {},
        stroke() {},
        save() {},
        restore() {},
        translate() {},
        scale() {},
        measureText() { return { width: 0 }; },
        set fillStyle(v) {},
        set strokeStyle(v) {},
        set lineWidth(v) {},
        set globalAlpha(v) {},
        set font(v) {},
        set textAlign(v) {},
        set textBaseline(v) {},
      };
    },
    addEventListener(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    removeEventListener(event, fn) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(f => f !== fn);
      }
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: w, height: h };
    },
    _listeners: listeners,
  };
}

// ==================== buildGraph ====================

describe('buildGraph — 空输入', () => {
  it('空数组 → 返回 { nodes: [], edges: [] }', () => {
    const engine = new BookmarkGraphEngine();
    const result = engine.buildGraph([]);
    assert.deepEqual(result, { nodes: [], edges: [] });
  });

  it('null / undefined → 返回空图', () => {
    const engine = new BookmarkGraphEngine();
    assert.deepEqual(engine.buildGraph(null), { nodes: [], edges: [] });
    assert.deepEqual(engine.buildGraph(undefined), { nodes: [], edges: [] });
  });

  it('只含无 id 元素 → 过滤后节点为空', () => {
    const engine = new BookmarkGraphEngine();
    const result = engine.buildGraph([{ title: 'no id' }, null, { id: '' }]);
    // id 为 '' 是 falsy，应被跳过
    assert.equal(result.nodes.length, 0);
  });
});

describe('buildGraph — 基本构建', () => {
  it('单个书签 → 1 节点 0 边', () => {
    const engine = new BookmarkGraphEngine();
    const b = bm({ id: 'a1', title: 'Node Test' });
    const result = engine.buildGraph([b]);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.edges.length, 0);
    assert.equal(result.nodes[0].id, 'a1');
    assert.equal(result.nodes[0].label, 'Node Test');
  });

  it('同域名 + 相似标题 → 产生边', () => {
    const engine = new BookmarkGraphEngine();
    const bookmarks = [
      bm({ id: 'e1', title: 'JavaScript 指南', url: 'https://developer.mozilla.org/a' }),
      bm({ id: 'e2', title: 'JavaScript 教程', url: 'https://developer.mozilla.org/b' }),
    ];
    const result = engine.buildGraph(bookmarks);
    assert.equal(result.nodes.length, 2);
    assert.ok(result.edges.length >= 1, '同域名 + 共享 token 应产生至少 1 条边');
    const edge = result.edges[0];
    assert.ok(edge.weight > 0 && edge.weight <= 1);
  });
});

describe('buildGraph — 节点属性', () => {
  it('节点含 id / label / group / size / data 五属性', () => {
    const engine = new BookmarkGraphEngine();
    const b = bm({ id: 'n1', title: '属性测试', url: 'https://test.com', folderPath: ['Docs'] });
    const result = engine.buildGraph([b]);
    const node = result.nodes[0];
    assert.equal(node.id, 'n1');
    assert.equal(node.label, '属性测试');
    assert.equal(node.group, 'Docs');
    assert.ok(typeof node.size === 'number' && node.size >= 1);
    assert.deepEqual(node.data, b);
  });

  it('group 优先级: folderPath > 域名 > default', () => {
    const engine = new BookmarkGraphEngine();
    const withFolder = bm({ id: 'g1', title: 'F', url: 'https://x.com', folderPath: ['MyFolder'] });
    const withDomain = bm({ id: 'g2', title: 'D', url: 'https://y.com', folderPath: [] });
    const neither = bm({ id: 'g3', title: 'N', url: '', folderPath: [] });
    const result = engine.buildGraph([withFolder, withDomain, neither]);
    const map = new Map(result.nodes.map(n => [n.id, n.group]));
    assert.equal(map.get('g1'), 'MyFolder');
    assert.equal(map.get('g2'), 'y.com');
    assert.equal(map.get('g3'), 'default');
  });
});

// ==================== applyTransform (Visualizer 缩放/平移) ====================

describe('applyTransform — 缩放', () => {
  it('zoomIn 后 scale > 1', () => {
    const canvas = createCanvasMock();
    const viz = new BookmarkVisualizer(canvas);
    viz.zoomIn();
    assert.ok(viz.getScale() > 1, `scale 应 > 1, 实际 ${viz.getScale()}`);
    viz.destroy();
  });

  it('zoomOut 后 scale < 1', () => {
    const canvas = createCanvasMock();
    const viz = new BookmarkVisualizer(canvas);
    viz.zoomOut();
    assert.ok(viz.getScale() < 1, `scale 应 < 1, 实际 ${viz.getScale()}`);
    viz.destroy();
  });

  it('zoomIn + zoomOut → scale 回到 ≈1', () => {
    const canvas = createCanvasMock();
    const viz = new BookmarkVisualizer(canvas);
    viz.zoomIn();
    viz.zoomOut();
    assert.ok(Math.abs(viz.getScale() - 1) < 0.01, `scale 应接近 1, 实际 ${viz.getScale()}`);
    viz.destroy();
  });

  it('resetZoom → scale 回到 1', () => {
    const canvas = createCanvasMock();
    const viz = new BookmarkVisualizer(canvas);
    viz.zoomIn();
    viz.zoomIn();
    viz.resetZoom();
    assert.equal(viz.getScale(), 1);
    viz.destroy();
  });
});

// ==================== filterByTags (DetailPanel 标签过滤) ====================

describe('filterByTags — 空标签操作', () => {
  it('addTag 空字符串 → 返回 false', () => {
    const panel = new BookmarkDetailPanel();
    panel.show(bm({ id: 't1', tags: [] }));
    assert.equal(panel.addTag(''), false);
    assert.equal(panel.addTag(null), false);
    assert.equal(panel.addTag('   '), false);
  });

  it('removeTag 不存在的标签 → 返回 false', () => {
    const panel = new BookmarkDetailPanel();
    panel.show(bm({ id: 't2', tags: ['js'] }));
    assert.equal(panel.removeTag('python'), false);
  });
});

describe('filterByTags — 按标签过滤', () => {
  it('addTag 后 getTags 包含新标签', () => {
    const panel = new BookmarkDetailPanel();
    panel.show(bm({ id: 't3', tags: [] }));
    const added = panel.addTag('javascript');
    assert.equal(added, true);
    assert.ok(panel.getTags().includes('javascript'));
  });

  it('addTag 重复标签 → 返回 false，不重复添加', () => {
    const panel = new BookmarkDetailPanel();
    panel.show(bm({ id: 't4', tags: ['go'] }));
    assert.equal(panel.addTag('go'), false);
    assert.equal(panel.getTags().filter(t => t === 'go').length, 1);
  });

  it('removeTag 成功 → 标签不再存在', () => {
    const panel = new BookmarkDetailPanel();
    panel.show(bm({ id: 't5', tags: ['rust', 'wasm'] }));
    const removed = panel.removeTag('rust');
    assert.equal(removed, true);
    assert.deepEqual(panel.getTags(), ['wasm']);
  });

  it('getTagSuggestions 按前缀匹配', () => {
    const panel = new BookmarkDetailPanel();
    panel.show(bm({ id: 't6', tags: [] }));
    panel.setAllTags(['javascript', 'java', 'python', 'typescript']);
    const suggestions = panel.getTagSuggestions('java');
    assert.deepEqual(suggestions, ['javascript', 'java']);
  });

  it('setAllTags → 过滤空值并小写化，getTagSuggestions 正确匹配', () => {
    const panel = new BookmarkDetailPanel();
    panel.show(bm({ id: 't7', tags: [] }));
    panel.setAllTags(['  Docker ', '', null, 'K8S']);
    // 'do' 应匹配小写化后的 'docker'
    const suggestions = panel.getTagSuggestions('do');
    assert.ok(suggestions.includes('docker'), '应包含小写化的 docker');
    // 'k8' 应匹配小写化后的 'k8s'
    const s2 = panel.getTagSuggestions('k8');
    assert.ok(s2.includes('k8s'), '应包含小写化的 k8s');
  });
});

// ==================== 额外覆盖 — setStatus + similarity ====================

describe('setStatus — 有效/无效状态', () => {
  it('设置有效状态 → 返回 true，getStatus 反映新值', () => {
    const panel = new BookmarkDetailPanel();
    panel.show(bm({ id: 's1' }));
    assert.equal(panel.setStatus('reading'), true);
    assert.equal(panel.getStatus(), 'reading');
  });

  it('设置无效状态 → 返回 false', () => {
    const panel = new BookmarkDetailPanel();
    panel.show(bm({ id: 's2' }));
    assert.equal(panel.setStatus('done'), false);
    assert.equal(panel.getStatus(), 'unread');
  });
});

describe('similarity — 两个书签的相似度', () => {
  it('完全相同的书签 → 相似度为 1', () => {
    const engine = new BookmarkGraphEngine();
    const b = bm({ id: 'x1', title: 'Test', url: 'https://a.com', folderPath: ['A'] });
    engine.buildGraph([b]);
    // 相同书签不计算自身，但用对象直接调用
    const score = engine.similarity(b, b);
    assert.equal(score, 1);
  });

  it('完全不同 → 相似度为 0', () => {
    const engine = new BookmarkGraphEngine();
    const a = bm({ id: 'd1', title: 'Alpha', url: 'https://a.com', folderPath: ['A'] });
    const b = bm({ id: 'd2', title: 'Beta', url: 'https://b.com', folderPath: ['B'] });
    const score = engine.similarity(a, b);
    assert.equal(score, 0);
  });
});
