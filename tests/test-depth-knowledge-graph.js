/**
 * test-depth-knowledge-graph.js — KnowledgeGraph 深度测试
 *
 * 测试范围 (15 用例):
 *   初始化/构建     — 空输入、基本节点边构建、标签颜色、节点上限截断、weight 裁剪
 *   力导向布局      — 空节点返回空、布局后含 x/y 坐标、有边节点吸引
 *   缩放变换        — 基本 zoom、空输入返回空
 *   坐标转换        — screenToWorld 逆变换
 *   标签过滤        — null 全显、按标签过滤
 *   子图提取        — BFS 两跳可达
 *   Wiki 图谱构建   — 混合实体/概念/QA 节点
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  buildGraphData,
  forceDirectedLayout,
  applyZoomTransform,
  screenToWorld,
  filterGraphByTags,
  extractSubgraph,
  buildWikiGraphData,
  classifyEdgeType,
  buildTooltipText,
  importGraphData,
  MAX_NODES,
  TAG_COLORS,
  NODE_SHAPES,
  EDGE_TYPES,
} = await import('../lib/knowledge-graph.js');

// ==================== 构建图数据 ====================

describe('buildGraphData — null/undefined 输入返回空图', () => {
  it('null entries → 空节点、空边、空 tagColorMap', () => {
    const result = buildGraphData(null, []);
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.tagColorMap, {});
  });

  it('undefined entries → 同样返回空图', () => {
    const result = buildGraphData(undefined, undefined);
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
  });
});

describe('buildGraphData — 基本构建节点和边', () => {
  it('3 个条目 + 2 条关联 → 3 节点 + 2 边', () => {
    const entries = [
      { id: 'a', title: 'Alpha', tags: ['js'] },
      { id: 'b', title: 'Beta', tags: ['js'] },
      { id: 'c', title: 'Gamma', tags: ['py'] },
    ];
    const relations = [
      { source: 'a', target: 'b', weight: 0.8 },
      { source: 'b', target: 'c', weight: 0.6 },
    ];
    const { nodes, edges } = buildGraphData(entries, relations);
    assert.equal(nodes.length, 3);
    assert.equal(edges.length, 2);
    assert.equal(nodes[0].id, 'a');
    assert.equal(nodes[0].label, 'Alpha');
    assert.equal(nodes[0].group, 'js');
  });
});

describe('buildGraphData — 标签颜色分配', () => it('每个标签获得不同颜色', () => {
  const entries = [
    { id: 1, title: 'A', tags: ['alpha'] },
    { id: 2, title: 'B', tags: ['beta'] },
    { id: 3, title: 'C', tags: ['gamma'] },
  ];
  const { tagColorMap } = buildGraphData(entries, []);
  assert.equal(Object.keys(tagColorMap).length, 3);
  assert.ok(tagColorMap['alpha']);
  assert.ok(tagColorMap['beta']);
  assert.ok(tagColorMap['gamma']);
  assert.notEqual(tagColorMap['alpha'], tagColorMap['beta']);
}));

describe('buildGraphData — 超过 maxNodes 时截断', () => it('120 条目 maxNodes=50 → 最多 50 个节点', () => {
  const entries = Array.from({ length: 120 }, (_, i) => ({
    id: `n${i}`, title: `Node ${i}`, tags: ['t'],
  }));
  const { nodes } = buildGraphData(entries, [], 50);
  assert.equal(nodes.length, 50);
}));

describe('buildGraphData — edge weight 裁剪到 [0,1]', () => it('weight=5 被裁剪为 1, weight=-1 裁剪为 0', () => {
  const entries = [
    { id: 'x', title: 'X', tags: [] },
    { id: 'y', title: 'Y', tags: [] },
  ];
  const relations = [
    { source: 'x', target: 'y', weight: 5 },
  ];
  const { edges } = buildGraphData(entries, relations);
  assert.equal(edges[0].weight, 1);

  const relations2 = [
    { source: 'x', target: 'y', weight: -1 },
  ];
  const { edges: edges2 } = buildGraphData(entries, relations2);
  assert.equal(edges2[0].weight, 0);
}));

// ==================== 力导向布局 ====================

describe('forceDirectedLayout — 空节点返回空数组', () => {
  it('null nodes → []', () => {
    const result = forceDirectedLayout(null, []);
    assert.deepEqual(result, []);
  });

  it('空数组 → []', () => {
    const result = forceDirectedLayout([], []);
    assert.deepEqual(result, []);
  });
});

describe('forceDirectedLayout — 节点布局后含 x/y 坐标且在画布范围内', () => {
  it('5 个无连接节点经过布局后均在画布区域内', () => {
    const nodes = [
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' },
    ];
    const width = 600, height = 400;
    const result = forceDirectedLayout(nodes, [], 50, { width, height });
    for (const node of result) {
      assert.ok(typeof node.x === 'number' && !isNaN(node.x), `node ${node.id} x should be number`);
      assert.ok(typeof node.y === 'number' && !isNaN(node.y), `node ${node.id} y should be number`);
      assert.ok(node.x >= 40 && node.x <= width - 40, `node ${node.id} x=${node.x} out of bounds`);
      assert.ok(node.y >= 40 && node.y <= height - 40, `node ${node.id} y=${node.y} out of bounds`);
    }
  });
});

describe('forceDirectedLayout — 布局后清理临时属性', () => {
  it('vx/vy/fx/fy 被删除', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }];
    const edges = [{ source: 'a', target: 'b', weight: 0.5 }];
    const result = forceDirectedLayout(nodes, edges, 10);
    for (const node of result) {
      assert.equal(node.vx, undefined);
      assert.equal(node.vy, undefined);
      assert.equal(node.fx, undefined);
      assert.equal(node.fy, undefined);
    }
  });
});

// ==================== 缩放变换 ====================

describe('applyZoomTransform — 基本缩放和平移', () => {
  it('scale=2, offset=(10,20) → 坐标翻倍再偏移', () => {
    const nodes = [{ id: 'a', x: 100, y: 200 }];
    const result = applyZoomTransform(nodes, { scale: 2, offsetX: 10, offsetY: 20 });
    assert.equal(result.length, 1);
    assert.equal(result[0].x, 210);   // 100*2 + 10
    assert.equal(result[0].y, 420);   // 200*2 + 20
  });

  it('不修改原始节点', () => {
    const nodes = [{ id: 'a', x: 50, y: 50 }];
    applyZoomTransform(nodes, { scale: 3, offsetX: 0, offsetY: 0 });
    assert.equal(nodes[0].x, 50);
    assert.equal(nodes[0].y, 50);
  });
});

describe('applyZoomTransform — 空输入返回空数组', () => {
  it('null → []', () => {
    assert.deepEqual(applyZoomTransform(null, {}), []);
  });

  it('空数组 → []', () => {
    assert.deepEqual(applyZoomTransform([], {}), []);
  });
});

// ==================== 坐标转换 ====================

describe('screenToWorld — applyZoomTransform 的逆运算', () => {
  it('变换后再逆变换得到原始坐标', () => {
    const transform = { scale: 2, offsetX: 30, offsetY: 50 };
    const worldX = 150, worldY = 250;
    // 正变换
    const screenX = worldX * transform.scale + transform.offsetX; // 330
    const screenY = worldY * transform.scale + transform.offsetY; // 550
    // 逆变换
    const result = screenToWorld(screenX, screenY, transform);
    assert.ok(Math.abs(result.x - worldX) < 1e-9, `expected ${worldX}, got ${result.x}`);
    assert.ok(Math.abs(result.y - worldY) < 1e-9, `expected ${worldY}, got ${result.y}`);
  });
});

// ==================== 标签过滤 ====================

describe('filterGraphByTags — null 显示全部', () => {
  it('activeTags=null → 全部可见，hiddenCount=0', () => {
    const nodes = [
      { id: 'a', group: 'js' },
      { id: 'b', group: 'py' },
    ];
    const edges = [{ source: 'a', target: 'b' }];
    const result = filterGraphByTags(nodes, edges, null);
    assert.equal(result.visibleNodes.length, 2);
    assert.equal(result.visibleEdges.length, 1);
    assert.equal(result.hiddenCount, 0);
  });
});

describe('filterGraphByTags — 按标签过滤', () => {
  it('只保留 js 标签节点', () => {
    const nodes = [
      { id: 'a', group: 'js' },
      { id: 'b', group: 'py' },
      { id: 'c', group: 'js' },
    ];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
    ];
    const result = filterGraphByTags(nodes, edges, new Set(['js']));
    assert.equal(result.visibleNodes.length, 2);
    // a→b 两端不全在可见集合中，a→c 两端都在
    assert.equal(result.visibleEdges.length, 1);
    assert.equal(result.hiddenCount, 1);
  });

  it('空集合 → 全部隐藏', () => {
    const nodes = [{ id: 'a', group: 'js' }];
    const result = filterGraphByTags(nodes, [], new Set());
    assert.equal(result.visibleNodes.length, 0);
    assert.equal(result.hiddenCount, 1);
  });
});

// ==================== 子图提取 ====================

describe('extractSubgraph — BFS 两跳可达', () => {
  it('1 跳只含直接邻居，2 跳含邻居的邻居', () => {
    // 链: a - b - c - d
    const nodes = [
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
    ];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'd' },
    ];
    const sub1 = extractSubgraph(nodes, edges, 'a', 1);
    const ids1 = sub1.nodes.map(n => n.id).sort();
    assert.deepEqual(ids1, ['a', 'b']);

    const sub2 = extractSubgraph(nodes, edges, 'a', 2);
    const ids2 = sub2.nodes.map(n => n.id).sort();
    assert.deepEqual(ids2, ['a', 'b', 'c']);
  });

  it('不存在的 nodeId → 空子图', () => {
    const nodes = [{ id: 'a' }];
    const result = extractSubgraph(nodes, [], 'z', 1);
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
  });
});

// ==================== Wiki 图谱构建 ====================

describe('buildWikiGraphData — 混合实体/概念/QA 节点', () => {
  it('三类输入 → 正确数量节点和形状', () => {
    const result = buildWikiGraphData({
      entries: [{ id: 'qa:1', title: 'What is X?', tags: ['tech'] }],
      entities: [{ name: 'React', displayName: 'React', type: 'framework', tags: ['tech'] }],
      concepts: [{ name: 'SPA', displayName: 'SPA', tags: ['arch'] }],
      relations: [],
    });
    assert.equal(result.nodes.length, 3);
    const shapes = result.nodes.map(n => n.shape).sort();
    assert.deepEqual(shapes, ['circle', 'diamond', 'square']);
    // entity 节点 id 格式
    const entityNode = result.nodes.find(n => n.shape === 'circle');
    assert.equal(entityNode.id, 'entity:React');
  });

  it('全空输入 → 空图', () => {
    const result = buildWikiGraphData({});
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
  });
});

// ==================== importGraphData ====================

describe('importGraphData — 基本导入与去重', () => {
  it('远程新实体 added，本地已有同名实体 skipped', () => {
    const local = {
      nodes: [
        { id: 'local:1', label: 'React', group: 'framework', entry: { type: 'framework' } },
      ],
      edges: [],
    };
    const remote = {
      entities: [
        { id: 'r:1', name: 'React', type: 'framework' },
        { id: 'r:2', name: 'Vue', type: 'framework' },
      ],
      relations: [],
    };
    const result = importGraphData(local, remote);
    assert.equal(result.added, 1);   // Vue 是新的
    assert.equal(result.skipped, 1); // React 已存在 (local_wins)
    assert.ok(result.mergedNodes.some(n => n.label === 'Vue'));
  });
});

