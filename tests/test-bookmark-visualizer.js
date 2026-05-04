/**
 * 测试 lib/bookmark-visualizer.js — Canvas 力导向图可视化
 *
 * 测试范围:
 *   render / highlight / searchHighlight / resetHighlight
 *   zoomIn / zoomOut / resetZoom / destroy
 *   力仿真 / 节点半径缩放 / 空图谱 / 单节点 / 数据验证
 *
 * 使用 mock Canvas API (无真实 DOM)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkVisualizer } = await import('../lib/bookmark-visualizer.js');

// ==================== Mock Canvas API ====================

function createMockCanvas(width = 800, height = 600) {
  const operations = [];
  const ctx = {
    clearRect: (...args) => operations.push({ method: 'clearRect', args }),
    fillRect: (...args) => operations.push({ method: 'fillRect', args }),
    arc: (...args) => operations.push({ method: 'arc', args }),
    stroke: () => operations.push({ method: 'stroke' }),
    fill: () => operations.push({ method: 'fill' }),
    beginPath: () => operations.push({ method: 'beginPath' }),
    moveTo: (...args) => operations.push({ method: 'moveTo', args }),
    lineTo: (...args) => operations.push({ method: 'lineTo', args }),
    save: () => operations.push({ method: 'save' }),
    restore: () => operations.push({ method: 'restore' }),
    translate: (...args) => operations.push({ method: 'translate', args }),
    scale: (...args) => operations.push({ method: 'scale', args }),
    fillText: (...args) => operations.push({ method: 'fillText', args }),
    // 属性
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
  };

  const listeners = {};
  const canvas = {
    width,
    height,
    _operations: operations,
    _ctx: ctx,
    getContext: () => ctx,
    addEventListener: (type, handler) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: (type, handler) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter(h => h !== handler);
      }
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    _listeners: listeners,
    _emit: (type, data) => {
      if (listeners[type]) {
        for (const handler of listeners[type]) {
          handler(data);
        }
      }
    },
  };
  return canvas;
}

// ==================== 辅助: 构造图谱数据 ====================

function createGraphData(nodeCount, edges = []) {
  const nodes = [];
  const groups = ['前端', '后端', 'AI', '工具', 'DevOps'];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: String(i),
      label: `Node ${i}`,
      group: groups[i % groups.length],
      size: 1 + (i % 5),
      data: { id: String(i), title: `Node ${i}`, url: `https://example.com/${i}` },
    });
  }
  return { nodes, edges };
}

function createSampleGraph() {
  const nodes = [
    { id: '1', label: 'React 官方文档', group: '前端', size: 3 },
    { id: '2', label: 'Vue.js 教程', group: '前端', size: 2 },
    { id: '3', label: 'Node.js 指南', group: '后端', size: 2 },
    { id: '4', label: 'Python ML', group: 'AI', size: 1 },
    { id: '5', label: 'GitHub 项目', group: '工具', size: 1 },
  ];
  const edges = [
    { source: '1', target: '2', weight: 0.8 },
    { source: '1', target: '3', weight: 0.3 },
    { source: '2', target: '3', weight: 0.4 },
    { source: '3', target: '4', weight: 0.5 },
  ];
  return { nodes, edges };
}

// ==================== Mock requestAnimationFrame ====================

let rafCallbacks = [];
let rafId = 0;

function setupRAF() {
  rafCallbacks = [];
  rafId = 0;
  globalThis.requestAnimationFrame = (cb) => {
    rafCallbacks.push(cb);
    return ++rafId;
  };
  globalThis.cancelAnimationFrame = (id) => {
    // no-op for tests
  };
}

function flushRAF() {
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  for (const cb of cbs) cb();
}

// ==================== 测试 ====================

describe('BookmarkVisualizer', () => {
  let canvas;
  let viz;

  beforeEach(() => {
    setupRAF();
    canvas = createMockCanvas();
    viz = new BookmarkVisualizer(canvas);
  });

  // ─── 1. 基本渲染 ─────────────────────────────────────────────────────────

  it('1. render 渲染图谱数据 — canvas 上执行了绘制操作', () => {
    const graph = createSampleGraph();
    viz.render(graph);

    // 触发几帧
    flushRAF();
    flushRAF();

    const ops = canvas._operations.map(o => o.method);
    assert.ok(ops.includes('clearRect'), '应执行 clearRect');
    assert.ok(ops.includes('fillRect'), '应执行 fillRect (背景)');
    assert.ok(ops.includes('save'), '应执行 save (变换)');
    assert.ok(ops.includes('restore'), '应执行 restore');
    assert.ok(ops.includes('beginPath'), '应执行 beginPath');
    assert.ok(ops.includes('arc'), '应执行 arc (绘制节点)');
    assert.ok(ops.includes('moveTo'), '应执行 moveTo (绘制边)');
    assert.ok(ops.includes('lineTo'), '应执行 lineTo (绘制边)');
  });

  // ─── 2. 高亮功能 ─────────────────────────────────────────────────────────

  it('2. highlight 高亮指定节点及其邻居', () => {
    viz.render(createSampleGraph());
    flushRAF();

    // 高亮节点 '1' (React) — 其邻居为 '2', '3'
    viz.highlight('1');
    flushRAF();

    // 验证高亮状态: 内部 _highlighted 应包含 '1', '2', '3'
    assert.ok(viz._highlighted.has('1'), '应高亮目标节点');
    assert.ok(viz._highlighted.has('2'), '应高亮邻居节点 (edge 1→2)');
    assert.ok(viz._highlighted.has('3'), '应高亮邻居节点 (edge 1→3)');
    assert.ok(!viz._highlighted.has('4'), '不应高亮非邻居节点 4');
    assert.ok(!viz._highlighted.has('5'), '不应高亮孤立节点 5');
  });

  // ─── 3. 搜索高亮 ─────────────────────────────────────────────────────────

  it('3. searchHighlight 按标题模糊匹配高亮', () => {
    viz.render(createSampleGraph());
    flushRAF();

    // 搜索 "React"
    viz.searchHighlight('React');
    assert.ok(viz._highlighted.has('1'), '应匹配 "React 官方文档"');
    assert.equal(viz._highlighted.size, 1, '应只匹配 1 个节点');

    // 搜索 "js" (不区分大小写)
    viz.searchHighlight('js');
    assert.ok(viz._highlighted.has('2'), '应匹配 "Vue.js 教程"');
    assert.ok(viz._highlighted.has('3'), '应匹配 "Node.js 指南"');
    assert.equal(viz._highlighted.size, 2, '应匹配 2 个节点');

    // 空查询应清空高亮
    viz.searchHighlight('');
    assert.equal(viz._highlighted.size, 0, '空查询应清空高亮');
    assert.equal(viz._hasHighlight, false, '空查询应重置 _hasHighlight');
  });

  // ─── 4. resetHighlight ────────────────────────────────────────────────────

  it('4. resetHighlight 重置所有高亮', () => {
    viz.render(createSampleGraph());
    flushRAF();

    viz.highlight('1');
    assert.ok(viz._hasHighlight, 'highlight 后 _hasHighlight 应为 true');

    viz.resetHighlight();
    assert.equal(viz._highlighted.size, 0, 'resetHighlight 应清空 _highlighted');
    assert.equal(viz._hasHighlight, false, 'resetHighlight 应重置 _hasHighlight');
  });

  // ─── 5. 缩放控制 ─────────────────────────────────────────────────────────

  it('5. zoomIn / zoomOut / resetZoom 控制缩放', () => {
    viz.render(createSampleGraph());
    flushRAF();

    const initialScale = viz.getScale();
    assert.equal(initialScale, 1, '初始缩放应为 1');

    // 放大
    viz.zoomIn();
    assert.ok(viz.getScale() > 1, `放大后 scale 应 > 1, 实际 ${viz.getScale()}`);

    // 再放大
    const afterIn = viz.getScale();
    viz.zoomIn();
    assert.ok(viz.getScale() > afterIn, '再次放大 scale 应更大');

    // 缩小
    viz.zoomOut();
    assert.ok(viz.getScale() < afterIn * 1.2, '缩小后 scale 应减小');

    // 重置
    viz.resetZoom();
    assert.equal(viz.getScale(), 1, 'resetZoom 应恢复为 1');
  });

  // ─── 6. 空图谱处理 ───────────────────────────────────────────────────────

  it('6. 空图谱渲染不抛异常', () => {
    // render 空数组
    assert.doesNotThrow(() => viz.render({ nodes: [], edges: [] }));
    assert.doesNotThrow(() => flushRAF());

    // render null
    assert.doesNotThrow(() => viz.render(null));

    // render 缺少字段
    assert.doesNotThrow(() => viz.render({ nodes: null, edges: null }));

    // render 无参数
    assert.doesNotThrow(() => viz.render(undefined));
  });

  // ─── 7. 单节点处理 ───────────────────────────────────────────────────────

  it('7. 单节点图谱正常渲染', () => {
    const graph = createGraphData(1, []);
    assert.doesNotThrow(() => viz.render(graph));
    flushRAF();
    flushRAF();

    // 应该有 arc 操作 (绘制节点)
    const arcOps = canvas._operations.filter(o => o.method === 'arc');
    assert.ok(arcOps.length > 0, '应绘制单个节点');
  });

  // ─── 8. 节点/边数据验证 ──────────────────────────────────────────────────

  it('8. 渲染包含正确数量的节点和边操作', () => {
    const graph = createSampleGraph();
    viz.render(graph);
    flushRAF();

    // 5 个节点应有至少 5 次 arc 调用
    const arcOps = canvas._operations.filter(o => o.method === 'arc');
    assert.ok(arcOps.length >= 5, `应有 >= 5 次 arc, 实际 ${arcOps.length}`);

    // 4 条边应有至少 4 次 moveTo 调用
    const moveToOps = canvas._operations.filter(o => o.method === 'moveTo');
    assert.ok(moveToOps.length >= 4, `应有 >= 4 次 moveTo, 实际 ${moveToOps.length}`);
  });

  // ─── 9. destroy 清理 ────────────────────────────────────────────────────

  it('9. destroy 清理所有资源和事件', () => {
    viz.render(createSampleGraph());
    flushRAF();

    // 记录已注册的监听器数量
    const mouseDownListenersBefore = (canvas._listeners['mousedown'] || []).length;
    assert.ok(mouseDownListenersBefore > 0, '应已注册事件监听器');

    viz.destroy();

    // 事件监听器应被移除
    const mouseDownListenersAfter = (canvas._listeners['mousedown'] || []).length;
    assert.equal(mouseDownListenersAfter, 0, 'destroy 应移除 mousedown 监听器');

    const mouseMoveListenersAfter = (canvas._listeners['mousemove'] || []).length;
    assert.equal(mouseMoveListenersAfter, 0, 'destroy 应移除 mousemove 监听器');

    const wheelListenersAfter = (canvas._listeners['wheel'] || []).length;
    assert.equal(wheelListenersAfter, 0, 'destroy 应移除 wheel 监听器');

    // 内部状态应被清空
    assert.equal(viz._simNodes.size, 0, 'destroy 应清空 _simNodes');
    assert.equal(viz._nodeData.size, 0, 'destroy 应清空 _nodeData');
    assert.equal(viz._edges.length, 0, 'destroy 应清空 _edges');
    assert.equal(viz._onNodeClick, null, 'destroy 应清空回调');
  });

  // ─── 10. 力仿真产生位移 ──────────────────────────────────────────────────

  it('10. 力仿真后节点位置发生改变', () => {
    const graph = createSampleGraph();
    viz.render(graph);

    // 记录初始位置
    const initialPos = new Map();
    for (const [id, simNode] of viz._simNodes) {
      initialPos.set(id, { x: simNode.x, y: simNode.y });
    }

    // 执行若干帧
    for (let i = 0; i < 10; i++) flushRAF();

    // 至少有些节点位置发生了变化
    let changed = 0;
    for (const [id, simNode] of viz._simNodes) {
      const init = initialPos.get(id);
      if (init && (Math.abs(simNode.x - init.x) > 0.01 || Math.abs(simNode.y - init.y) > 0.01)) {
        changed++;
      }
    }
    assert.ok(changed > 0, `力仿真应导致节点移动, 实际 ${changed} 个节点移动`);
  });

  // ─── 11. 节点半径按连接数缩放 ────────────────────────────────────────────

  it('11. 节点半径按连接数缩放 — 高连接数节点更大', () => {
    const graph = createSampleGraph();
    viz.render(graph);
    flushRAF();

    // 节点 '1' 有 2 条边 (连 2, 3), 节点 '5' 有 0 条边
    const node1 = viz._nodeData.get('1');
    const node5 = viz._nodeData.get('5');

    assert.ok(node1._degree === 2, `节点 1 连接数应为 2, 实际 ${node1._degree}`);
    assert.ok(node5._degree === 0, `节点 5 连接数应为 0, 实际 ${node5._degree}`);

    // node1 的半径应大于 node5
    const r1 = viz._nodeRadius(node1);
    const r5 = viz._nodeRadius(node5);
    assert.ok(r1 > r5, `高连接节点半径 ${r1} 应 > 低连接节点半径 ${r5}`);
  });

  // ─── 12. onNodeClick 回调 ─────────────────────────────────────────────────

  it('12. onNodeClick 设置回调函数', () => {
    let calledWith = null;
    viz.onNodeClick((nodeId, nodeData) => {
      calledWith = { nodeId, nodeData };
    });

    // 模拟鼠标点击 — mousedown + mouseup 在同一节点上
    viz.render(createSampleGraph());
    flushRAF();

    // 找到一个节点的世界坐标
    const [nodeId, simNode] = viz._simNodes.entries().next().value;

    // 模拟 mousedown 事件
    canvas._emit('mousedown', {
      clientX: simNode.x,  // 因为 offset=0, scale=1, screen=world
      clientY: simNode.y,
    });

    // 模拟 mouseup 事件
    canvas._emit('mouseup', {
      clientX: simNode.x,
      clientY: simNode.y,
    });

    assert.ok(calledWith !== null, '点击节点应触发回调');
    assert.equal(calledWith.nodeId, nodeId, '回调应传入正确的节点 ID');
  });

  // ─── 13. 多次 render 不抛异常 ─────────────────────────────────────────────

  it('13. 多次 render 替换图谱数据', () => {
    const graph1 = createSampleGraph();
    const graph2 = createGraphData(3, [
      { source: '0', target: '1', weight: 0.5 },
      { source: '1', target: '2', weight: 0.7 },
    ]);

    assert.doesNotThrow(() => viz.render(graph1));
    flushRAF();

    assert.doesNotThrow(() => viz.render(graph2));
    flushRAF();

    // 第二次 render 应使用新数据
    assert.equal(viz._simNodes.size, 3, '应更新为 3 个节点');
    assert.equal(viz._edges.length, 2, '应更新为 2 条边');
  });

  // ─── 14. stop 停止动画 ───────────────────────────────────────────────────

  it('14. stop 停止动画循环, start 重新启动', () => {
    viz.render(createSampleGraph());
    flushRAF();

    assert.equal(viz._running, true, 'render 后应正在运行');

    viz.stop();
    assert.equal(viz._running, false, 'stop 后应停止');

    viz.start();
    assert.equal(viz._running, true, 'start 后应恢复运行');
  });

  // ─── 15. 大图谱不抛异常 ──────────────────────────────────────────────────

  it('15. 100 节点图谱渲染不抛异常', () => {
    const edges = [];
    for (let i = 0; i < 99; i++) {
      edges.push({ source: String(i), target: String(i + 1), weight: 0.3 });
    }
    // 添加一些跨连接
    for (let i = 0; i < 50; i++) {
      edges.push({ source: String(i), target: String(i + 50), weight: 0.2 });
    }
    const graph = createGraphData(100, edges);

    assert.doesNotThrow(() => viz.render(graph));
    // 执行几帧
    assert.doesNotThrow(() => { for (let i = 0; i < 5; i++) flushRAF(); });

    assert.equal(viz._simNodes.size, 100, '应有 100 个仿真节点');
  });
});
