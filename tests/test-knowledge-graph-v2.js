/**
 * 测试 lib/knowledge-graph.js — 知识图谱可视化增强 (R18)
 *
 * 新增功能：缩放变换、小地图、标签过滤、增强 Tooltip
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGraphData,
  forceDirectedLayout,
  applyZoomTransform,
  screenToWorld,
  computeMinimapViewport,
  filterGraphByTags,
  buildTooltipText,
} from '../lib/knowledge-graph.js';

// ==================== Fixtures ====================

const sampleEntries = [
  { id: 1, title: 'JavaScript 基础', tags: ['javascript', '基础'], category: '编程', content: 'JS 是一门动态语言' },
  { id: 2, title: 'JavaScript 闭包', tags: ['javascript', '高级'], category: '编程', content: '闭包是函数和其词法环境的组合' },
  { id: 3, title: 'Python 入门', tags: ['python', '基础'], category: '编程', content: 'Python 是一门解释型语言' },
  { id: 4, title: 'React 组件', tags: ['react', 'javascript'], category: '前端', content: 'React 使用组件化开发' },
  { id: 5, title: 'Vue 入门', tags: ['vue', '前端'], category: '前端', content: 'Vue 是渐进式框架' },
];

const sampleRelations = [
  { source: 1, target: 2, weight: 0.8 },
  { source: 1, target: 3, weight: 0.3 },
  { source: 1, target: 4, weight: 0.6 },
  { source: 4, target: 5, weight: 0.5 },
];

// ==================== applyZoomTransform ====================

describe('applyZoomTransform()', () => {
  it('identity transform returns copy with same coordinates', () => {
    const nodes = [
      { id: 1, x: 100, y: 200, label: 'A' },
      { id: 2, x: 300, y: 400, label: 'B' },
    ];
    const transform = { scale: 1, offsetX: 0, offsetY: 0 };
    const result = applyZoomTransform(nodes, transform);

    assert.equal(result.length, 2);
    assert.equal(result[0].x, 100);
    assert.equal(result[0].y, 200);
    assert.equal(result[1].x, 300);
    assert.equal(result[1].y, 400);
  });

  it('does not modify original nodes', () => {
    const nodes = [{ id: 1, x: 100, y: 200, label: 'A', size: 10 }];
    const transform = { scale: 2, offsetX: 50, offsetY: 50 };
    const result = applyZoomTransform(nodes, transform);

    assert.equal(nodes[0].x, 100);
    assert.equal(nodes[0].y, 200);
    assert.notEqual(result[0], nodes[0]); // different object
  });

  it('scale 2x without offset', () => {
    const nodes = [{ id: 1, x: 100, y: 200, label: 'A', size: 10 }];
    const transform = { scale: 2, offsetX: 0, offsetY: 0 };
    const result = applyZoomTransform(nodes, transform);

    // screen = world * scale + offset
    assert.equal(result[0].x, 200);
    assert.equal(result[0].y, 400);
  });

  it('scale 2x with offset', () => {
    const nodes = [{ id: 1, x: 100, y: 200, label: 'A', size: 10 }];
    const transform = { scale: 2, offsetX: 30, offsetY: 50 };
    const result = applyZoomTransform(nodes, transform);

    assert.equal(result[0].x, 230); // 100*2 + 30
    assert.equal(result[0].y, 450); // 200*2 + 50
  });

  it('scale 0.5x (zoom out)', () => {
    const nodes = [{ id: 1, x: 400, y: 300, label: 'A', size: 10 }];
    const transform = { scale: 0.5, offsetX: 0, offsetY: 0 };
    const result = applyZoomTransform(nodes, transform);

    assert.equal(result[0].x, 200);
    assert.equal(result[0].y, 150);
  });

  it('preserves node properties (label, size, color, etc.)', () => {
    const nodes = [{ id: 1, x: 100, y: 200, label: 'Test', size: 15, color: '#ff0000', group: 'js', tags: ['a'] }];
    const transform = { scale: 2, offsetX: 0, offsetY: 0 };
    const result = applyZoomTransform(nodes, transform);

    assert.equal(result[0].label, 'Test');
    assert.equal(result[0].size, 15);
    assert.equal(result[0].color, '#ff0000');
    assert.equal(result[0].group, 'js');
    assert.deepEqual(result[0].tags, ['a']);
  });

  it('empty nodes returns empty array', () => {
    const result = applyZoomTransform([], { scale: 1, offsetX: 0, offsetY: 0 });
    assert.deepEqual(result, []);
  });

  it('negative offset works', () => {
    const nodes = [{ id: 1, x: 100, y: 100, label: 'A', size: 10 }];
    const transform = { scale: 1, offsetX: -50, offsetY: -50 };
    const result = applyZoomTransform(nodes, transform);

    assert.equal(result[0].x, 50);
    assert.equal(result[0].y, 50);
  });
});

// ==================== screenToWorld ====================

describe('screenToWorld()', () => {
  it('identity transform: screen == world', () => {
    const transform = { scale: 1, offsetX: 0, offsetY: 0 };
    const result = screenToWorld(100, 200, transform);
    assert.equal(result.x, 100);
    assert.equal(result.y, 200);
  });

  it('inverse of scale 2x', () => {
    const transform = { scale: 2, offsetX: 0, offsetY: 0 };
    const result = screenToWorld(200, 400, transform);
    assert.equal(result.x, 100);
    assert.equal(result.y, 200);
  });

  it('inverse of scale+offset', () => {
    const transform = { scale: 2, offsetX: 30, offsetY: 50 };
    // screen = world * 2 + 30 → world = (screen - 30) / 2
    const result = screenToWorld(230, 450, transform);
    assert.equal(result.x, 100);
    assert.equal(result.y, 200);
  });

  it('round-trip: applyZoomTransform then screenToWorld', () => {
    const nodes = [{ id: 1, x: 150, y: 250, label: 'A', size: 10 }];
    const transform = { scale: 1.5, offsetX: 20, offsetY: 40 };
    const transformed = applyZoomTransform(nodes, transform);
    const back = screenToWorld(transformed[0].x, transformed[0].y, transform);

    assert.ok(Math.abs(back.x - 150) < 0.01, `Expected ~150, got ${back.x}`);
    assert.ok(Math.abs(back.y - 250) < 0.01, `Expected ~250, got ${back.y}`);
  });

  it('zoom-out scale 0.5', () => {
    const transform = { scale: 0.5, offsetX: 0, offsetY: 0 };
    const result = screenToWorld(100, 150, transform);
    assert.equal(result.x, 200);
    assert.equal(result.y, 300);
  });
});

// ==================== computeMinimapViewport ====================

describe('computeMinimapViewport()', () => {
  it('identity transform: viewport covers full canvas', () => {
    const result = computeMinimapViewport(600, 400, { scale: 1, offsetX: 0, offsetY: 0 }, 600, 400, 120, 80);
    // Minimap is 120x80, world is 600x400
    // scale = min(120/600, 80/400) = min(0.2, 0.2) = 0.2
    // viewport x = 0, y = 0, w = 600*0.2=120, h = 400*0.2=80
    assert.equal(result.x, 0);
    assert.equal(result.y, 0);
    assert.equal(result.w, 120);
    assert.equal(result.h, 80);
  });

  it('zoomed-in: viewport smaller than minimap', () => {
    const result = computeMinimapViewport(600, 400, { scale: 2, offsetX: 0, offsetY: 0 }, 600, 400, 120, 80);
    // At scale 2, visible world area is 300x200
    // minimapScale = 0.2
    // viewport = 300*0.2=60 x 200*0.2=40
    assert.equal(result.w, 60);
    assert.equal(result.h, 40);
  });

  it('panned: viewport position changes', () => {
    const result = computeMinimapViewport(600, 400, { scale: 1, offsetX: -100, offsetY: -50 }, 600, 400, 120, 80);
    // minimapScale = 0.2
    // viewport x = (0 - (-100/1)) * 0.2 = 100*0.2 = 20
    // viewport y = (0 - (-50/1)) * 0.2 = 50*0.2 = 10
    assert.equal(result.x, 20);
    assert.equal(result.y, 10);
  });

  it('result fields are numbers', () => {
    const result = computeMinimapViewport(600, 400, { scale: 1, offsetX: 0, offsetY: 0 }, 600, 400, 120, 80);
    assert.equal(typeof result.x, 'number');
    assert.equal(typeof result.y, 'number');
    assert.equal(typeof result.w, 'number');
    assert.equal(typeof result.h, 'number');
  });

  it('viewport is clamped to minimap bounds', () => {
    // Pan far away - viewport should be clamped
    const result = computeMinimapViewport(600, 400, { scale: 1, offsetX: -10000, offsetY: -10000 }, 600, 400, 120, 80);
    assert.ok(result.x >= -result.w, 'x should allow partial visibility');
    assert.ok(result.y >= -result.h, 'y should allow partial visibility');
  });
});

// ==================== filterGraphByTags ====================

describe('filterGraphByTags()', () => {
  const { nodes, edges } = buildGraphData(sampleEntries, sampleRelations);

  it('null activeTags shows all', () => {
    const result = filterGraphByTags(nodes, edges, null);
    assert.equal(result.visibleNodes.length, nodes.length);
    assert.equal(result.visibleEdges.length, edges.length);
    assert.equal(result.hiddenCount, 0);
  });

  it('empty Set hides all', () => {
    const result = filterGraphByTags(nodes, edges, new Set());
    assert.equal(result.visibleNodes.length, 0);
    assert.equal(result.visibleEdges.length, 0);
    assert.equal(result.hiddenCount, nodes.length);
  });

  it('filtering by one tag shows matching nodes', () => {
    // Find the tag that matches node group
    const jsTag = nodes[0].group; // primary tag of first node
    const result = filterGraphByTags(nodes, edges, new Set([jsTag]));
    assert.ok(result.visibleNodes.length > 0, 'Should have visible nodes');
    assert.ok(result.visibleNodes.length <= nodes.length);

    // All visible nodes should have the matching group
    for (const node of result.visibleNodes) {
      assert.equal(node.group, jsTag);
    }
  });

  it('only edges between visible nodes are kept', () => {
    const allGroups = new Set(nodes.map(n => n.group));
    const firstGroup = nodes[0].group;
    const result = filterGraphByTags(nodes, edges, new Set([firstGroup]));

    const visibleIds = new Set(result.visibleNodes.map(n => n.id));
    for (const edge of result.visibleEdges) {
      assert.ok(visibleIds.has(edge.source), `Edge source ${edge.source} should be in visible nodes`);
      assert.ok(visibleIds.has(edge.target), `Edge target ${edge.target} should be in visible nodes`);
    }
  });

  it('hiddenCount equals total minus visible', () => {
    const result = filterGraphByTags(nodes, edges, new Set([nodes[0].group]));
    assert.equal(result.hiddenCount, nodes.length - result.visibleNodes.length);
  });

  it('all tags selected shows everything', () => {
    const allGroups = new Set(nodes.map(n => n.group));
    const result = filterGraphByTags(nodes, edges, allGroups);
    assert.equal(result.visibleNodes.length, nodes.length);
    assert.equal(result.visibleEdges.length, edges.length);
    assert.equal(result.hiddenCount, 0);
  });

  it('empty nodes returns empty result', () => {
    const result = filterGraphByTags([], [], new Set(['any']));
    assert.equal(result.visibleNodes.length, 0);
    assert.equal(result.visibleEdges.length, 0);
    assert.equal(result.hiddenCount, 0);
  });
});

// ==================== buildTooltipText ====================

describe('buildTooltipText()', () => {
  const { nodes, edges } = buildGraphData(sampleEntries, sampleRelations);
  const nodeMap = {};
  for (const node of nodes) nodeMap[node.id] = node;

  it('returns multi-line string', () => {
    const text = buildTooltipText(nodes[0], edges, nodeMap);
    assert.ok(typeof text === 'string');
    assert.ok(text.includes('\n'), 'Should have multiple lines');
  });

  it('includes node label', () => {
    const text = buildTooltipText(nodes[0], edges, nodeMap);
    assert.ok(text.includes(nodes[0].label), `Tooltip should include label "${nodes[0].label}"`);
  });

  it('includes group/tag info', () => {
    const text = buildTooltipText(nodes[0], edges, nodeMap);
    assert.ok(text.includes(nodes[0].group), `Tooltip should include group "${nodes[0].group}"`);
  });

  it('includes connection count', () => {
    const text = buildTooltipText(nodes[0], edges, nodeMap);
    // Node 1 (JavaScript 基础) has 3 connections
    assert.ok(text.includes('3') || text.includes('关联'), 'Should mention connections');
  });

  it('includes content preview from entry', () => {
    const text = buildTooltipText(nodes[0], edges, nodeMap);
    // Entry 1 has content: 'JS 是一门动态语言'
    assert.ok(text.includes('JS') || text.includes('动态'), 'Should include content preview');
  });

  it('handles node with no connections', () => {
    const isolatedNode = { id: 999, label: 'Isolated', group: 'test', size: 6 };
    const text = buildTooltipText(isolatedNode, [], {});
    assert.ok(text.includes('Isolated'));
    assert.ok(text.includes('0'));
  });

  it('truncates long content', () => {
    const longEntry = { id: 100, title: 'Long', tags: ['test'], content: 'A'.repeat(500) };
    const { nodes: longNodes } = buildGraphData([longEntry], []);
    const text = buildTooltipText(longNodes[0], [], {});
    // Should be truncated to reasonable length
    const lines = text.split('\n');
    const totalLen = lines.join('').length;
    assert.ok(totalLen < 400, `Tooltip should be concise, got ${totalLen} chars`);
  });
});

// ==================== integration ====================

describe('knowledge-graph-v2 集成', () => {
  it('full pipeline: build → layout → filter → transform', () => {
    const { nodes, edges, tagColorMap } = buildGraphData(sampleEntries, sampleRelations);
    forceDirectedLayout(nodes, edges, 10, { width: 600, height: 400 });

    const allGroups = new Set(nodes.map(n => n.group));
    const filtered = filterGraphByTags(nodes, edges, allGroups);

    const transform = { scale: 1.5, offsetX: 10, offsetY: 20 };
    const transformed = applyZoomTransform(filtered.visibleNodes, transform);

    assert.ok(transformed.length > 0);
    assert.ok(typeof transformed[0].x === 'number');
    assert.ok(typeof transformed[0].y === 'number');
  });

  it('screenToWorld round-trips with applyZoomTransform', () => {
    const { nodes } = buildGraphData(sampleEntries, []);
    forceDirectedLayout(nodes, [], 5, { width: 600, height: 400 });

    const transform = { scale: 2.5, offsetX: -30, offsetY: 40 };
    const transformed = applyZoomTransform(nodes, transform);

    for (let i = 0; i < nodes.length; i++) {
      const world = screenToWorld(transformed[i].x, transformed[i].y, transform);
      assert.ok(Math.abs(world.x - nodes[i].x) < 0.01,
        `Node ${i}: expected worldX=${nodes[i].x}, got ${world.x}`);
      assert.ok(Math.abs(world.y - nodes[i].y) < 0.01,
        `Node ${i}: expected worldY=${nodes[i].y}, got ${world.y}`);
    }
  });
});
