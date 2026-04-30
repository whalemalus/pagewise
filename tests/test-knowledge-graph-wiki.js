/**
 * 测试 lib/knowledge-graph.js — L3.2 知识图谱可视化增强
 *
 * 新增功能：
 *   - buildWikiGraphData: 从 Wiki 数据源构建图谱（节点/边类型区分）
 *   - classifyEdgeType: 边类型分类（引用/关联/矛盾）
 *   - extractSubgraph: 聚焦到单个节点的 N 跳子图
 *   - exportGraphToDataURL: 导出图谱为图片
 *   - NODE_SHAPES / EDGE_TYPES 常量
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWikiGraphData,
  classifyEdgeType,
  extractSubgraph,
  exportGraphToDataURL,
  NODE_SHAPES,
  EDGE_TYPES,
} from '../lib/knowledge-graph.js';

// ==================== Fixtures ====================

const sampleEntries = [
  { id: 1, title: 'JavaScript 基础', tags: ['javascript', '基础'], category: '编程', content: 'JS 是一门动态语言' },
  { id: 2, title: 'JavaScript 闭包', tags: ['javascript', '高级'], category: '编程', content: '闭包是函数和其词法环境的组合' },
  { id: 3, title: 'Python 入门', tags: ['python', '基础'], category: '编程', content: 'Python 是一门解释型语言' },
];

const sampleEntities = [
  { name: 'react', displayName: 'React', type: 'framework', entryIds: [1], tags: ['前端'] },
  { name: 'nodejs', displayName: 'Node.js', type: 'platform', entryIds: [1, 2], tags: ['后端'] },
];

const sampleConcepts = [
  { name: 'closure', displayName: '闭包', entryIds: [2], tags: ['javascript'] },
  { name: 'event-loop', displayName: '事件循环', entryIds: [1, 2], tags: ['javascript'] },
];

const sampleRelations = [
  { source: 1, target: 2, weight: 0.8 },
  { source: 1, target: 3, weight: 0.3 },
];

const sampleContradictions = [
  { entryId1: 1, entryId2: 2, severity: 'high', description: '版本号冲突' },
];

// ==================== NODE_SHAPES / EDGE_TYPES 常量 ====================

describe('NODE_SHAPES 常量', () => {
  it('定义了三种形状', () => {
    assert.equal(NODE_SHAPES.CIRCLE, 'circle');
    assert.equal(NODE_SHAPES.SQUARE, 'square');
    assert.equal(NODE_SHAPES.DIAMOND, 'diamond');
  });
});

describe('EDGE_TYPES 常量', () => {
  it('定义了三种边类型', () => {
    assert.equal(EDGE_TYPES.REFERENCE, 'reference');
    assert.equal(EDGE_TYPES.RELATION, 'relation');
    assert.equal(EDGE_TYPES.CONTRADICTION, 'contradiction');
  });
});

// ==================== buildWikiGraphData ====================

describe('buildWikiGraphData()', () => {
  it('空输入返回空图', () => {
    const result = buildWikiGraphData({});
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.tagColorMap, {});
  });

  it('只有 entries 时 Q&A 节点使用 DIAMOND 形状', () => {
    const result = buildWikiGraphData({ entries: sampleEntries });
    assert.ok(result.nodes.length > 0);
    for (const node of result.nodes) {
      assert.equal(node.shape, NODE_SHAPES.DIAMOND, `Q&A node should have DIAMOND shape, got ${node.shape}`);
      assert.equal(node.nodeType, 'qa');
    }
  });

  it('实体节点使用 CIRCLE 形状', () => {
    const result = buildWikiGraphData({ entities: sampleEntities });
    const entityNodes = result.nodes.filter(n => n.nodeType === 'entity');
    assert.ok(entityNodes.length > 0, 'Should have entity nodes');
    for (const node of entityNodes) {
      assert.equal(node.shape, NODE_SHAPES.CIRCLE);
    }
  });

  it('概念节点使用 SQUARE 形状', () => {
    const result = buildWikiGraphData({ concepts: sampleConcepts });
    const conceptNodes = result.nodes.filter(n => n.nodeType === 'concept');
    assert.ok(conceptNodes.length > 0, 'Should have concept nodes');
    for (const node of conceptNodes) {
      assert.equal(node.shape, NODE_SHAPES.SQUARE);
    }
  });

  it('混合数据包含三种节点类型', () => {
    const result = buildWikiGraphData({
      entries: sampleEntries,
      entities: sampleEntities,
      concepts: sampleConcepts,
      relations: sampleRelations,
    });
    const types = new Set(result.nodes.map(n => n.nodeType));
    assert.ok(types.has('entity'), 'Should have entity nodes');
    assert.ok(types.has('concept'), 'Should have concept nodes');
    assert.ok(types.has('qa'), 'Should have QA nodes');
  });

  it('节点大小按关联数量缩放', () => {
    const result = buildWikiGraphData({
      entries: sampleEntries,
      entities: sampleEntities,
      concepts: sampleConcepts,
      relations: sampleRelations,
    });
    // 有多个 relation 的节点应该更大
    const nodeWithMoreRelations = result.nodes.find(n => {
      let count = 0;
      for (const e of result.edges) {
        if (e.source === n.id || e.target === n.id) count++;
      }
      return count >= 2;
    });
    const nodeWithFewerRelations = result.nodes.find(n => {
      let count = 0;
      for (const e of result.edges) {
        if (e.source === n.id || e.target === n.id) count++;
      }
      return count <= 1;
    });
    if (nodeWithMoreRelations && nodeWithFewerRelations) {
      assert.ok(nodeWithMoreRelations.size >= nodeWithFewerRelations.size,
        'Node with more relations should be at least as large');
    }
  });

  it('限制最大节点数', () => {
    const manyEntries = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1, title: `Entry ${i + 1}`, tags: ['tag'], content: 'test',
    }));
    const result = buildWikiGraphData({ entries: manyEntries, maxNodes: 50 });
    assert.ok(result.nodes.length <= 50, `Expected <= 50 nodes, got ${result.nodes.length}`);
  });

  it('返回 tagColorMap', () => {
    const result = buildWikiGraphData({ entries: sampleEntries });
    assert.ok(typeof result.tagColorMap === 'object');
  });

  it('edges 包含 edgeType 字段', () => {
    const result = buildWikiGraphData({
      entries: sampleEntries,
      entities: sampleEntities,
      concepts: sampleConcepts,
      relations: sampleRelations,
    });
    for (const edge of result.edges) {
      assert.ok(typeof edge.edgeType === 'string', `Edge should have edgeType, got ${typeof edge.edgeType}`);
      assert.ok(
        [EDGE_TYPES.REFERENCE, EDGE_TYPES.RELATION, EDGE_TYPES.CONTRADICTION].includes(edge.edgeType),
        `Invalid edgeType: ${edge.edgeType}`
      );
    }
  });

  it('矛盾关系生成 CONTRADICTION 类型的边', () => {
    const result = buildWikiGraphData({
      entries: sampleEntries,
      relations: sampleRelations,
      contradictions: sampleContradictions,
    });
    const contradictionEdges = result.edges.filter(e => e.edgeType === EDGE_TYPES.CONTRADICTION);
    assert.ok(contradictionEdges.length > 0, 'Should have at least one contradiction edge');
    assert.equal(contradictionEdges[0].edgeType, EDGE_TYPES.CONTRADICTION);
  });

  it('实体节点保留 metadata', () => {
    const result = buildWikiGraphData({ entities: sampleEntities });
    const reactNode = result.nodes.find(n => n.label === 'React');
    assert.ok(reactNode, 'Should find React node');
    assert.ok(reactNode.entry, 'Entity node should have entry data');
    assert.equal(reactNode.entry.type, 'framework');
  });
});

// ==================== classifyEdgeType ====================

describe('classifyEdgeType()', () => {
  it('entity→qa 返回 REFERENCE', () => {
    const src = { id: 'e:react', nodeType: 'entity' };
    const tgt = { id: 'qa:1', nodeType: 'qa' };
    const result = classifyEdgeType(src, tgt, []);
    assert.equal(result, EDGE_TYPES.REFERENCE);
  });

  it('concept→qa 返回 REFERENCE', () => {
    const src = { id: 'c:closure', nodeType: 'concept' };
    const tgt = { id: 'qa:2', nodeType: 'qa' };
    const result = classifyEdgeType(src, tgt, []);
    assert.equal(result, EDGE_TYPES.REFERENCE);
  });

  it('qa→entity 返回 REFERENCE（方向无关）', () => {
    const src = { id: 'qa:1', nodeType: 'qa' };
    const tgt = { id: 'e:react', nodeType: 'entity' };
    const result = classifyEdgeType(src, tgt, []);
    assert.equal(result, EDGE_TYPES.REFERENCE);
  });

  it('entity→entity 返回 RELATION', () => {
    const src = { id: 'e:react', nodeType: 'entity' };
    const tgt = { id: 'e:nodejs', nodeType: 'entity' };
    const result = classifyEdgeType(src, tgt, []);
    assert.equal(result, EDGE_TYPES.RELATION);
  });

  it('qa→qa 返回 RELATION', () => {
    const src = { id: 'qa:1', nodeType: 'qa' };
    const tgt = { id: 'qa:2', nodeType: 'qa' };
    const result = classifyEdgeType(src, tgt, []);
    assert.equal(result, EDGE_TYPES.RELATION);
  });

  it('有矛盾记录时返回 CONTRADICTION', () => {
    const src = { id: 'qa:1', nodeType: 'qa' };
    const tgt = { id: 'qa:2', nodeType: 'qa' };
    const contradictions = [{ entryId1: 1, entryId2: 2, severity: 'high' }];
    const result = classifyEdgeType(src, tgt, contradictions);
    assert.equal(result, EDGE_TYPES.CONTRADICTION);
  });

  it('矛盾记录反向也应匹配', () => {
    const src = { id: 'qa:2', nodeType: 'qa' };
    const tgt = { id: 'qa:1', nodeType: 'qa' };
    const contradictions = [{ entryId1: 1, entryId2: 2, severity: 'medium' }];
    const result = classifyEdgeType(src, tgt, contradictions);
    assert.equal(result, EDGE_TYPES.CONTRADICTION);
  });

  it('null/undefined contradictions 返回 RELATION', () => {
    const src = { id: 'qa:1', nodeType: 'qa' };
    const tgt = { id: 'qa:2', nodeType: 'qa' };
    assert.equal(classifyEdgeType(src, tgt, null), EDGE_TYPES.RELATION);
    assert.equal(classifyEdgeType(src, tgt, undefined), EDGE_TYPES.RELATION);
  });

  it('概念→概念 返回 RELATION', () => {
    const src = { id: 'c:closure', nodeType: 'concept' };
    const tgt = { id: 'c:event-loop', nodeType: 'concept' };
    const result = classifyEdgeType(src, tgt, []);
    assert.equal(result, EDGE_TYPES.RELATION);
  });
});

// ==================== extractSubgraph ====================

describe('extractSubgraph()', () => {
  const graphNodes = [
    { id: 'n1', label: 'Center', nodeType: 'qa' },
    { id: 'n2', label: 'Neighbor A', nodeType: 'entity' },
    { id: 'n3', label: 'Neighbor B', nodeType: 'concept' },
    { id: 'n4', label: 'Far C', nodeType: 'qa' },
    { id: 'n5', label: 'Farthest D', nodeType: 'entity' },
    { id: 'n6', label: 'Isolated', nodeType: 'qa' },
  ];

  const graphEdges = [
    { source: 'n1', target: 'n2', edgeType: 'reference' },
    { source: 'n1', target: 'n3', edgeType: 'relation' },
    { source: 'n2', target: 'n4', edgeType: 'relation' },
    { source: 'n4', target: 'n5', edgeType: 'reference' },
  ];

  it('空输入返回空结果', () => {
    const result = extractSubgraph([], [], 'n1');
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
  });

  it('null 输入安全处理', () => {
    const result = extractSubgraph(null, null, 'n1');
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
  });

  it('depth=1 返回直接邻居', () => {
    const result = extractSubgraph(graphNodes, graphEdges, 'n1', 1);
    const ids = new Set(result.nodes.map(n => n.id));
    assert.ok(ids.has('n1'), 'Should include center node');
    assert.ok(ids.has('n2'), 'Should include direct neighbor A');
    assert.ok(ids.has('n3'), 'Should include direct neighbor B');
    assert.ok(!ids.has('n4'), 'Should NOT include 2-hop node');
    assert.ok(!ids.has('n5'), 'Should NOT include 3-hop node');
    assert.ok(!ids.has('n6'), 'Should NOT include isolated node');
  });

  it('depth=2 返回两跳可达节点', () => {
    const result = extractSubgraph(graphNodes, graphEdges, 'n1', 2);
    const ids = new Set(result.nodes.map(n => n.id));
    assert.ok(ids.has('n1'), 'Center');
    assert.ok(ids.has('n2'), '1-hop');
    assert.ok(ids.has('n3'), '1-hop');
    assert.ok(ids.has('n4'), '2-hop');
    assert.ok(!ids.has('n5'), 'Should NOT include 3-hop node');
    assert.ok(!ids.has('n6'), 'Should NOT include isolated node');
  });

  it('孤立节点只返回自己', () => {
    const result = extractSubgraph(graphNodes, graphEdges, 'n6', 2);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].id, 'n6');
    assert.equal(result.edges.length, 0);
  });

  it('未知节点 ID 返回空', () => {
    const result = extractSubgraph(graphNodes, graphEdges, 'nonexistent', 2);
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
  });

  it('边只保留两端都在子图中的', () => {
    const result = extractSubgraph(graphNodes, graphEdges, 'n1', 1);
    const nodeIds = new Set(result.nodes.map(n => n.id));
    for (const edge of result.edges) {
      assert.ok(nodeIds.has(edge.source), `Edge source ${edge.source} should be in subgraph`);
      assert.ok(nodeIds.has(edge.target), `Edge target ${edge.target} should be in subgraph`);
    }
  });

  it('循环图不会无限递归', () => {
    const cycleNodes = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];
    const cycleEdges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' },
    ];
    const result = extractSubgraph(cycleNodes, cycleEdges, 'a', 10);
    assert.equal(result.nodes.length, 3, 'All nodes in cycle should be found');
  });

  it('depth 默认为 1', () => {
    const result = extractSubgraph(graphNodes, graphEdges, 'n1');
    const ids = new Set(result.nodes.map(n => n.id));
    assert.ok(!ids.has('n4'), 'Default depth=1 should not include 2-hop nodes');
  });

  it('节点数据完整保留', () => {
    const result = extractSubgraph(graphNodes, graphEdges, 'n1', 1);
    const center = result.nodes.find(n => n.id === 'n1');
    assert.equal(center.label, 'Center');
    assert.equal(center.nodeType, 'qa');
  });
});

// ==================== exportGraphToDataURL ====================

describe('exportGraphToDataURL()', () => {
  it('null canvas 返回 null', () => {
    const result = exportGraphToDataURL(null);
    assert.equal(result, null);
  });

  it('返回字符串格式的 data URL', () => {
    // 模拟 canvas
    const mockCanvas = {
      toDataURL: (type) => `data:${type};base64,iVBORw0KGgo=`,
    };
    const result = exportGraphToDataURL(mockCanvas);
    assert.equal(typeof result, 'string');
    assert.ok(result.startsWith('data:image/png'), `Should start with data:image/png, got ${result.substring(0, 30)}`);
  });

  it('默认使用 PNG 格式', () => {
    let calledType = null;
    const mockCanvas = {
      toDataURL: (type) => { calledType = type; return 'data:image/png;base64,abc'; },
    };
    exportGraphToDataURL(mockCanvas);
    assert.equal(calledType, 'image/png');
  });

  it('支持自定义质量参数', () => {
    let calledArgs = null;
    const mockCanvas = {
      toDataURL: (...args) => { calledArgs = args; return 'data:image/jpeg;base64,abc'; },
    };
    exportGraphToDataURL(mockCanvas, 'image/jpeg', 0.8);
    assert.deepEqual(calledArgs, ['image/jpeg', 0.8]);
  });
});

// ==================== 集成测试 ====================

describe('wiki-graph 集成', () => {
  it('完整 pipeline: buildWikiGraphData → extractSubgraph', () => {
    const result = buildWikiGraphData({
      entries: sampleEntries,
      entities: sampleEntities,
      concepts: sampleConcepts,
      relations: sampleRelations,
    });

    assert.ok(result.nodes.length > 0, 'Should produce nodes');

    // 选取第一个节点做子图提取
    const centerId = result.nodes[0].id;
    const subgraph = extractSubgraph(result.nodes, result.edges, centerId, 1);

    assert.ok(subgraph.nodes.length >= 1, 'Subgraph should have at least the center node');
    assert.ok(subgraph.nodes.length <= result.nodes.length, 'Subgraph should not exceed full graph');
  });

  it('wiki 模式与普通模式共存', () => {
    const wikiResult = buildWikiGraphData({
      entries: sampleEntries,
      entities: sampleEntities,
      concepts: sampleConcepts,
      relations: sampleRelations,
    });

    // 验证有不同类型的节点
    const nodeTypes = new Set(wikiResult.nodes.map(n => n.nodeType));
    assert.ok(nodeTypes.size > 1, 'Wiki mode should have multiple node types');

    // 验证有不同类型的边
    const edgeTypes = new Set(wikiResult.edges.map(e => e.edgeType));
    assert.ok(edgeTypes.size >= 1, 'Should have at least one edge type');
  });

  it('subgraph 中的边 edgeType 保留', () => {
    const result = buildWikiGraphData({
      entries: sampleEntries,
      entities: sampleEntities,
      concepts: sampleConcepts,
      relations: sampleRelations,
    });

    if (result.nodes.length > 0 && result.edges.length > 0) {
      const centerId = result.edges[0].source;
      const subgraph = extractSubgraph(result.nodes, result.edges, centerId, 1);

      for (const edge of subgraph.edges) {
        assert.ok(typeof edge.edgeType === 'string', 'Subgraph edges should preserve edgeType');
      }
    }
  });
});
