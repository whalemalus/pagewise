/**
 * 测试 lib/knowledge-graph.js — 知识图谱数据与力导向布局
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphData, forceDirectedLayout, MAX_NODES, DEFAULT_ITERATIONS } from '../lib/knowledge-graph.js';

// ==================== 图数据构建 ====================

describe('buildGraphData()', () => {
  const sampleEntries = [
    { id: 1, title: 'JavaScript 基础', tags: ['javascript', '基础'], category: '编程' },
    { id: 2, title: 'JavaScript 闭包', tags: ['javascript', '高级'], category: '编程' },
    { id: 3, title: 'Python 入门', tags: ['python', '基础'], category: '编程' },
    { id: 4, title: 'React 组件', tags: ['react', 'javascript'], category: '前端' },
    { id: 5, title: 'Vue 入门', tags: ['vue', '前端'], category: '前端' },
  ];

  const sampleRelations = [
    { source: 1, target: 2, weight: 0.8 },
    { source: 1, target: 3, weight: 0.3 },
    { source: 1, target: 4, weight: 0.6 },
    { source: 4, target: 5, weight: 0.5 },
  ];

  it('空输入返回空图', () => {
    assert.deepEqual(buildGraphData(null, null), { nodes: [], edges: [] });
    assert.deepEqual(buildGraphData([], []), { nodes: [], edges: [] });
  });

  it('构建节点数组', () => {
    const { nodes } = buildGraphData(sampleEntries, sampleRelations);
    assert.equal(nodes.length, 5);
    assert.equal(nodes[0].id, 1);
    assert.equal(nodes[0].label, 'JavaScript 基础');
    assert.ok(Array.isArray(nodes[0].tags));
    assert.ok(typeof nodes[0].color === 'string');
  });

  it('构建边数组', () => {
    const { edges } = buildGraphData(sampleEntries, sampleRelations);
    assert.equal(edges.length, 4);
    assert.equal(edges[0].source, 1);
    assert.equal(edges[0].target, 2);
    assert.ok(edges[0].weight >= 0 && edges[0].weight <= 1);
  });

  it('过滤无效边（节点不存在）', () => {
    const relations = [
      { source: 1, target: 2, weight: 0.5 },
      { source: 1, target: 999, weight: 0.5 }, // 不存在的节点
    ];
    const { edges } = buildGraphData(sampleEntries, relations);
    assert.equal(edges.length, 1);
  });

  it('节点大小按关联数量缩放', () => {
    const { nodes } = buildGraphData(sampleEntries, sampleRelations);
    // 节点 1 有 3 条关联，应比其他节点大
    const node1 = nodes.find(n => n.id === 1);
    const node5 = nodes.find(n => n.id === 5);
    assert.ok(node1.size > node5.size, `node1.size=${node1.size} 应 > node5.size=${node5.size}`);
  });

  it('节点颜色按标签分类', () => {
    const { nodes } = buildGraphData(sampleEntries, sampleRelations);
    // 同一主标签的节点颜色应相同
    const jsNodes = nodes.filter(n => n.group === 'javascript');
    if (jsNodes.length >= 2) {
      assert.equal(jsNodes[0].color, jsNodes[1].color);
    }
  });

  it('限制最大节点数', () => {
    const manyEntries = Array.from({ length: 150 }, (_, i) => ({
      id: i + 1,
      title: `Entry ${i + 1}`,
      tags: ['tag'],
    }));
    const { nodes } = buildGraphData(manyEntries, [], 100);
    assert.ok(nodes.length <= 100, `nodes.length=${nodes.length} 应 <= 100`);
  });

  it('weight 裁剪到 0-1 范围', () => {
    const relations = [
      { source: 1, target: 2, weight: -0.5 },
      { source: 2, target: 3, weight: 1.5 },
    ];
    const { edges } = buildGraphData(sampleEntries, relations);
    assert.equal(edges[0].weight, 0);
    assert.equal(edges[1].weight, 1);
  });

  it('无 tags 时默认 group 为分类或未分类', () => {
    const entries = [{ id: 100, title: 'No Tags', category: '测试' }];
    const { nodes } = buildGraphData(entries, []);
    assert.equal(nodes[0].group, '测试');
  });
});

// ==================== 力导向布局 ====================

describe('forceDirectedLayout()', () => {
  it('空节点返回空数组', () => {
    const result = forceDirectedLayout([], []);
    assert.deepEqual(result, []);
  });

  it('null 节点安全处理', () => {
    const result = forceDirectedLayout(null, []);
    assert.deepEqual(result, []);
  });

  it('单节点保持位置', () => {
    const nodes = [{ id: 1, label: 'A', size: 10 }];
    const result = forceDirectedLayout(nodes, [], 10, { width: 600, height: 400 });
    assert.equal(result.length, 1);
    assert.ok(typeof result[0].x === 'number');
    assert.ok(typeof result[0].y === 'number');
  });

  it('节点不重叠（5 节点 50 次迭代）', () => {
    const nodes = [
      { id: 1, label: 'A', size: 10 },
      { id: 2, label: 'B', size: 10 },
      { id: 3, label: 'C', size: 10 },
      { id: 4, label: 'D', size: 10 },
      { id: 5, label: 'E', size: 10 },
    ];
    const edges = [
      { source: 1, target: 2, weight: 0.5 },
      { source: 2, target: 3, weight: 0.5 },
      { source: 3, target: 4, weight: 0.5 },
      { source: 4, target: 5, weight: 0.5 },
    ];

    forceDirectedLayout(nodes, edges, 50, { width: 600, height: 400 });

    // 验证所有节点对之间的最小距离
    let minDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }
    }
    assert.ok(minDist > 5, `节点最小间距 ${minDist} 应 > 5px，不应完全重叠`);
  });

  it('节点不重叠（10 节点 50 次迭代）', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      label: `N${i + 1}`,
      size: 8,
    }));
    const edges = [
      { source: 1, target: 2, weight: 0.5 },
      { source: 2, target: 3, weight: 0.5 },
      { source: 3, target: 4, weight: 0.5 },
      { source: 4, target: 5, weight: 0.5 },
      { source: 5, target: 6, weight: 0.5 },
      { source: 6, target: 7, weight: 0.5 },
      { source: 7, target: 8, weight: 0.5 },
      { source: 8, target: 9, weight: 0.5 },
      { source: 9, target: 10, weight: 0.5 },
    ];

    forceDirectedLayout(nodes, edges, 50, { width: 600, height: 400 });

    let minDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }
    }
    assert.ok(minDist > 5, `10 节点最小间距 ${minDist} 应 > 5px`);
  });

  it('有边的节点距离比无关节点更近', () => {
    const nodes = [
      { id: 1, label: 'A', size: 10 },
      { id: 2, label: 'B', size: 10 },
      { id: 3, label: 'C', size: 10 },
    ];
    const edges = [
      { source: 1, target: 2, weight: 0.8 }, // A-B 相连
    ];

    forceDirectedLayout(nodes, edges, 50, { width: 600, height: 400 });

    const distAB = Math.sqrt(
      (nodes[1].x - nodes[0].x) ** 2 + (nodes[1].y - nodes[0].y) ** 2
    );
    const distAC = Math.sqrt(
      (nodes[2].x - nodes[0].x) ** 2 + (nodes[2].y - nodes[0].y) ** 2
    );
    // A-B 有边相连，应比 A-C（无边）更近
    assert.ok(distAB < distAC, `A-B 距离 ${distAB.toFixed(1)} 应 < A-C 距离 ${distAC.toFixed(1)}`);
  });

  it('节点位置在画布边界内', () => {
    const nodes = [
      { id: 1, label: 'A', size: 10 },
      { id: 2, label: 'B', size: 10 },
      { id: 3, label: 'C', size: 10 },
    ];
    const edges = [];

    const w = 500;
    const h = 300;
    forceDirectedLayout(nodes, edges, 50, { width: w, height: h });

    for (const node of nodes) {
      assert.ok(node.x >= 30, `node.x=${node.x} 应 >= 30`);
      assert.ok(node.x <= w - 30, `node.x=${node.x} 应 <= ${w - 30}`);
      assert.ok(node.y >= 30, `node.y=${node.y} 应 >= 30`);
      assert.ok(node.y <= h - 30, `node.y=${node.y} 应 <= ${h - 30}`);
    }
  });

  it('返回的节点不含临时力属性', () => {
    const nodes = [{ id: 1, label: 'A', size: 10 }];
    const result = forceDirectedLayout(nodes, [], 10);
    assert.equal(result[0].vx, undefined);
    assert.equal(result[0].vy, undefined);
    assert.equal(result[0].fx, undefined);
    assert.equal(result[0].fy, undefined);
  });

  it('默认迭代次数为 50', () => {
    assert.equal(DEFAULT_ITERATIONS, 50);
  });

  it('最大节点数为 100', () => {
    assert.equal(MAX_NODES, 100);
  });

  it('默认参数无 options 也正常工作', () => {
    const nodes = [
      { id: 1, label: 'A', size: 10 },
      { id: 2, label: 'B', size: 10 },
    ];
    const result = forceDirectedLayout(nodes, [], 10);
    assert.equal(result.length, 2);
    assert.ok(typeof result[0].x === 'number');
    assert.ok(typeof result[0].y === 'number');
  });
});
