/**
 * KnowledgeGraph — 知识图谱数据构建与力导向布局
 *
 * 纯 Canvas 绘制，不依赖 D3.js 等外部库。
 * 节点数量限制 100 个，力布局迭代 50 次。
 */

const MAX_NODES = 100;
const DEFAULT_ITERATIONS = 50;

/**
 * 预定义的标签颜色映射
 */
const TAG_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
  '#a855f7', '#0ea5e9', '#e11d48', '#22c55e', '#eab308',
];

/**
 * 构建图数据
 * @param {Array} entries - 知识条目数组
 * @param {Array} relations - 关联关系数组 [{source, target, weight}]
 * @param {number} [maxNodes=100] - 最大节点数
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildGraphData(entries, relations, maxNodes = MAX_NODES) {
  if (!entries || !Array.isArray(entries)) return { nodes: [], edges: [], tagColorMap: {} };

  // 收集所有标签并分配颜色
  const tagSet = new Set();
  for (const entry of entries) {
    for (const tag of (entry.tags || [])) {
      tagSet.add(tag);
    }
  }
  const tagColorMap = {};
  let colorIdx = 0;
  for (const tag of tagSet) {
    tagColorMap[tag] = TAG_COLORS[colorIdx % TAG_COLORS.length];
    colorIdx++;
  }

  // 构建节点（限制数量，优先取关联关系中涉及的条目）
  let limitedEntries = entries;
  if (entries.length > maxNodes) {
    const relatedIds = new Set();
    if (relations && Array.isArray(relations)) {
      for (const rel of relations) {
        relatedIds.add(rel.source);
        relatedIds.add(rel.target);
      }
    }
    // 优先保留有关联的条目
    const withRelation = entries.filter(e => relatedIds.has(e.id));
    const withoutRelation = entries.filter(e => !relatedIds.has(e.id));
    limitedEntries = [...withRelation, ...withoutRelation].slice(0, maxNodes);
  }

  const nodeIds = new Set(limitedEntries.map(e => e.id));

  const nodes = limitedEntries.map(entry => {
    const tags = entry.tags || [];
    const primaryTag = tags[0] || entry.category || '未分类';
    return {
      id: entry.id,
      label: entry.title || '未命名',
      group: primaryTag,
      tags: tags,
      color: tagColorMap[primaryTag] || TAG_COLORS[0],
      size: 1, // 基础大小，后续由布局算法根据关联数量调整
      entry: entry,
    };
  });

  // 构建边
  const edges = [];
  if (relations && Array.isArray(relations)) {
    for (const rel of relations) {
      if (nodeIds.has(rel.source) && nodeIds.has(rel.target)) {
        edges.push({
          source: rel.source,
          target: rel.target,
          weight: Math.max(0, Math.min(1, rel.weight || 0.5)),
        });
      }
    }
  }

  // 计算每个节点的关联数量，用于缩放节点大小
  const connectionCount = {};
  for (const node of nodes) connectionCount[node.id] = 0;
  for (const edge of edges) {
    connectionCount[edge.source] = (connectionCount[edge.source] || 0) + 1;
    connectionCount[edge.target] = (connectionCount[edge.target] || 0) + 1;
  }

  for (const node of nodes) {
    const count = connectionCount[node.id] || 0;
    node.size = 6 + Math.min(count * 3, 20); // 6-26px 半径
  }

  return { nodes, edges, tagColorMap };
}

/**
 * 力导向布局算法
 *
 * - 斥力：所有节点互相排斥（库仑力）
 * - 引力：有边的节点互相吸引（弹簧力）
 * - 迭代 N 次后返回节点位置
 *
 * @param {Array} nodes - 节点数组（会就地修改 x, y）
 * @param {Array} edges - 边数组
 * @param {number} [iterations=50] - 迭代次数
 * @param {object} [options] - 额外参数
 * @param {number} [options.width=600] - 画布宽度
 * @param {number} [options.height=400] - 画布高度
 * @returns {Array} 带有 x, y 坐标的节点数组
 */
export function forceDirectedLayout(nodes, edges, iterations = DEFAULT_ITERATIONS, options = {}) {
  const width = options.width || 600;
  const height = options.height || 400;
  const centerX = width / 2;
  const centerY = height / 2;

  if (!nodes || nodes.length === 0) return nodes || [];

  // 初始化位置：圆形分布
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    if (nodes[i].x !== undefined && nodes[i].y !== undefined) continue;
    const angle = (2 * Math.PI * i) / n;
    const radius = Math.min(width, height) * 0.3;
    nodes[i].x = centerX + radius * Math.cos(angle);
    nodes[i].y = centerY + radius * Math.sin(angle);
    nodes[i].vx = 0;
    nodes[i].vy = 0;
  }

  // 构建邻接表
  const adjacency = {};
  for (const node of nodes) adjacency[node.id] = [];
  for (const edge of edges) {
    if (adjacency[edge.source] && adjacency[edge.target]) {
      adjacency[edge.source].push(edge);
      adjacency[edge.target].push(edge);
    }
  }

  // 参数
  const repulsionStrength = 3000;
  const attractionStrength = 0.01;
  const damping = 0.85;
  const minDist = 30;

  // 节点 id 到索引的映射
  const idToIdx = {};
  for (let i = 0; i < n; i++) idToIdx[nodes[i].id] = i;

  for (let iter = 0; iter < iterations; iter++) {
    const temperature = 1 - iter / iterations; // 逐渐冷却

    // 计算斥力（所有节点对）
    for (let i = 0; i < n; i++) {
      nodes[i].fx = 0;
      nodes[i].fy = 0;
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) dist = minDist;

        const force = repulsionStrength / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        nodes[i].fx -= fx;
        nodes[i].fy -= fy;
        nodes[j].fx += fx;
        nodes[j].fy += fy;
      }
    }

    // 计算引力（有边的节点对）
    for (const edge of edges) {
      const si = idToIdx[edge.source];
      const ti = idToIdx[edge.target];
      if (si === undefined || ti === undefined) continue;

      const dx = nodes[ti].x - nodes[si].x;
      const dy = nodes[ti].y - nodes[si].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;

      const force = attractionStrength * dist * (edge.weight || 0.5);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      nodes[si].fx += fx;
      nodes[si].fy += fy;
      nodes[ti].fx -= fx;
      nodes[ti].fy -= fy;
    }

    // 应用力，更新位置
    for (let i = 0; i < n; i++) {
      nodes[i].vx = (nodes[i].vx + nodes[i].fx) * damping;
      nodes[i].vy = (nodes[i].vy + nodes[i].fy) * damping;

      // 限制速度
      const speed = Math.sqrt(nodes[i].vx * nodes[i].vx + nodes[i].vy * nodes[i].vy);
      const maxSpeed = 10 * temperature + 1;
      if (speed > maxSpeed) {
        nodes[i].vx = (nodes[i].vx / speed) * maxSpeed;
        nodes[i].vy = (nodes[i].vy / speed) * maxSpeed;
      }

      nodes[i].x += nodes[i].vx;
      nodes[i].y += nodes[i].vy;

      // 边界约束（留 padding）
      const padding = 40;
      if (nodes[i].x < padding) nodes[i].x = padding;
      if (nodes[i].x > width - padding) nodes[i].x = width - padding;
      if (nodes[i].y < padding) nodes[i].y = padding;
      if (nodes[i].y > height - padding) nodes[i].y = height - padding;
    }
  }

  // 清理临时力属性
  for (const node of nodes) {
    delete node.vx;
    delete node.vy;
    delete node.fx;
    delete node.fy;
  }

  return nodes;
}

/**
 * 应用缩放/平移变换，返回节点屏幕坐标的副本
 *
 * 不修改原始节点数组。屏幕坐标 = 世界坐标 × scale + offset。
 *
 * @param {Array} nodes - 节点数组（含 x, y）
 * @param {{ scale: number, offsetX: number, offsetY: number }} transform - 变换参数
 * @returns {Array} 新节点数组副本，x/y 为屏幕坐标
 */
export function applyZoomTransform(nodes, transform) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) return [];
  const { scale = 1, offsetX = 0, offsetY = 0 } = transform || {};
  return nodes.map(node => ({
    ...node,
    x: node.x * scale + offsetX,
    y: node.y * scale + offsetY,
  }));
}

/**
 * 屏幕坐标转世界坐标（applyZoomTransform 的逆运算）
 *
 * @param {number} sx - 屏幕 X
 * @param {number} sy - 屏幕 Y
 * @param {{ scale: number, offsetX: number, offsetY: number }} transform
 * @returns {{ x: number, y: number }} 世界坐标
 */
export function screenToWorld(sx, sy, transform) {
  const { scale = 1, offsetX = 0, offsetY = 0 } = transform || {};
  if (scale === 0) return { x: sx, y: sy };
  return {
    x: (sx - offsetX) / scale,
    y: (sy - offsetY) / scale,
  };
}

/**
 * 计算小地图上的视口矩形
 *
 * @param {number} canvasW - 主画布屏幕宽度
 * @param {number} canvasH - 主画布屏幕高度
 * @param {{ scale: number, offsetX: number, offsetY: number }} transform
 * @param {number} worldW - 世界坐标宽度
 * @param {number} worldH - 世界坐标高度
 * @param {number} minimapW - 小地图宽度
 * @param {number} minimapH - 小地图高度
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function computeMinimapViewport(canvasW, canvasH, transform, worldW, worldH, minimapW, minimapH) {
  const { scale = 1, offsetX = 0, offsetY = 0 } = transform || {};

  // 小地图的缩放比（世界 → 小地图）
  const mmScaleX = minimapW / worldW;
  const mmScaleY = minimapH / worldH;
  const mmScale = Math.min(mmScaleX, mmScaleY);

  // 当前视口左上角在世界坐标中的位置
  const worldLeft = (-offsetX / scale) || 0;
  const worldTop = (-offsetY / scale) || 0;

  // 视口大小（世界坐标）
  const viewportWorldW = canvasW / scale;
  const viewportWorldH = canvasH / scale;

  // 映射到小地图坐标（避免 -0）
  let x = worldLeft * mmScale || 0;
  let y = worldTop * mmScale || 0;
  let w = viewportWorldW * mmScale;
  let h = viewportWorldH * mmScale;

  // Clamp 到小地图边界内（允许部分超出）
  const minX = -w;
  const minY = -h;
  const maxX = minimapW;
  const maxY = minimapH;
  if (x < minX) x = minX;
  if (y < minY) y = minY;
  if (x > maxX) x = maxX;
  if (y > maxY) y = maxY;

  // 确保最小尺寸
  w = Math.max(w, 4);
  h = Math.max(h, 4);

  return { x, y, w, h };
}

/**
 * 按标签过滤图谱节点和边
 *
 * @param {Array} nodes - 节点数组
 * @param {Array} edges - 边数组
 * @param {Set<string>|null} activeTags - 活跃标签集合，null 表示全部显示
 * @returns {{ visibleNodes: Array, visibleEdges: Array, hiddenCount: number }}
 */
export function filterGraphByTags(nodes, edges, activeTags) {
  if (!nodes || nodes.length === 0) {
    return { visibleNodes: [], visibleEdges: [], hiddenCount: 0 };
  }

  // null = 全部显示
  if (activeTags === null || activeTags === undefined) {
    return { visibleNodes: [...nodes], visibleEdges: [...edges], hiddenCount: 0 };
  }

  // 空集合 = 全部隐藏
  if (activeTags.size === 0) {
    return { visibleNodes: [], visibleEdges: [], hiddenCount: nodes.length };
  }

  // 按 group（主标签）过滤
  const visibleNodes = nodes.filter(n => activeTags.has(n.group));
  const visibleIds = new Set(visibleNodes.map(n => n.id));

  // 只保留两端都在可见节点中的边
  const visibleEdges = edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));

  return {
    visibleNodes,
    visibleEdges,
    hiddenCount: nodes.length - visibleNodes.length,
  };
}

/**
 * 构建增强的 tooltip 文本
 *
 * @param {object} node - 节点 { label, group, tags, size, entry }
 * @param {Array} edges - 所有边
 * @param {object} nodeMap - id → node 映射
 * @returns {string} 多行 tooltip 文本
 */
export function buildTooltipText(node, edges, nodeMap) {
  const lines = [];

  // 第一行：名称
  lines.push(node.label || '未命名');

  // 第二行：标签
  if (node.group) {
    lines.push(`🏷️ ${node.group}`);
  }

  // 第三行：关联数
  let connectionCount = 0;
  if (edges && edges.length > 0) {
    for (const edge of edges) {
      if (edge.source === node.id || edge.target === node.id) {
        connectionCount++;
      }
    }
  }
  lines.push(`🔗 ${connectionCount} 个关联`);

  // 第四行：内容摘要
  if (node.entry && node.entry.content) {
    const preview = node.entry.content.substring(0, 80);
    const suffix = node.entry.content.length > 80 ? '...' : '';
    lines.push(`📝 ${preview}${suffix}`);
  }

  return lines.join('\n');
}

// ==================== L3.2 知识图谱可视化增强 ====================

/**
 * 节点形状枚举
 *
 * - CIRCLE: 圆形（实体）
 * - SQUARE: 正方形（概念）
 * - DIAMOND: 菱形（Q&A）
 */
const NODE_SHAPES = {
  CIRCLE: 'circle',
  SQUARE: 'square',
  DIAMOND: 'diamond',
};

/**
 * 边类型枚举
 *
 * - REFERENCE: 引用关系（wikilink）— 实线
 * - RELATION: 关联关系（共现/相似度）— 虚线
 * - CONTRADICTION: 矛盾 — 红色虚线
 */
const EDGE_TYPES = {
  REFERENCE: 'reference',
  RELATION: 'relation',
  CONTRADICTION: 'contradiction',
};

/**
 * 根据边两端节点类型和矛盾记录，判定边类型
 *
 * @param {Object} sourceNode - 源节点（需含 nodeType 字段）
 * @param {Object} targetNode - 目标节点（需含 nodeType 字段）
 * @param {Array|null} contradictions - 矛盾记录数组 [{ entryId1, entryId2, ... }]
 * @returns {string} EDGE_TYPES 常量
 */
export function classifyEdgeType(sourceNode, targetNode, contradictions) {
  // 检查是否属于矛盾关系
  if (Array.isArray(contradictions) && contradictions.length > 0) {
    const srcId = sourceNode.id || '';
    const tgtId = targetNode.id || '';

    // 从节点 ID 中提取 entryId（格式 'qa:123'）
    const srcEntryId = extractEntryId(srcId);
    const tgtEntryId = extractEntryId(tgtId);

    if (srcEntryId !== null && tgtEntryId !== null) {
      for (const c of contradictions) {
        if (
          (c.entryId1 === srcEntryId && c.entryId2 === tgtEntryId) ||
          (c.entryId1 === tgtEntryId && c.entryId2 === srcEntryId)
        ) {
          return EDGE_TYPES.CONTRADICTION;
        }
      }
    }
  }

  // 引用关系：entity↔qa 或 concept↔qa
  const srcType = sourceNode.nodeType || '';
  const tgtType = targetNode.nodeType || '';
  const types = [srcType, tgtType];
  if (
    (types.includes('entity') && types.includes('qa')) ||
    (types.includes('concept') && types.includes('qa'))
  ) {
    return EDGE_TYPES.REFERENCE;
  }

  // 其他为关联关系
  return EDGE_TYPES.RELATION;
}

/**
 * 从节点 ID 中提取 entryId
 *
 * 支持两种格式：
 * - 'qa:123'（Wiki 页面 ID 格式）
 * - 123（纯数字，直接来自 entry.id）
 *
 * @param {string|number} pageId - 节点 ID
 * @returns {number|null}
 * @private
 */
function extractEntryId(pageId) {
  if (pageId === null || pageId === undefined) return null;

  // 纯数字（直接来自 entry.id）
  if (typeof pageId === 'number') return pageId;

  if (typeof pageId !== 'string') return null;

  // 'qa:123' 格式
  const match = pageId.match(/^qa:(\d+)$/);
  if (match) return parseInt(match[1], 10);

  // 纯数字字符串
  if (/^\d+$/.test(pageId)) return parseInt(pageId, 10);

  return null;
}

/**
 * 从 Wiki 数据源构建图谱数据
 *
 * 合并实体、概念和 Q&A 条目为统一的图节点，每种类型使用不同形状和颜色。
 * 边根据节点类型和矛盾记录分类（引用/关联/矛盾）。
 *
 * @param {Object} options
 * @param {Array} [options.entries] - Q&A 条目数组
 * @param {Array} [options.entities] - 实体数组 [{ name, displayName, type, entryIds, tags }]
 * @param {Array} [options.concepts] - 概念数组 [{ name, displayName, entryIds, tags }]
 * @param {Array} [options.relations] - 关联关系数组 [{ source, target, weight }]
 * @param {Array} [options.contradictions] - 矛盾记录 [{ entryId1, entryId2, severity }]
 * @param {number} [options.maxNodes=100] - 最大节点数
 * @returns {{ nodes: Array, edges: Array, tagColorMap: Object }}
 */
export function buildWikiGraphData(options) {
  const {
    entries,
    entities,
    concepts,
    relations,
    contradictions,
    maxNodes = MAX_NODES,
  } = options || {};

  const hasEntries = Array.isArray(entries) && entries.length > 0;
  const hasEntities = Array.isArray(entities) && entities.length > 0;
  const hasConcepts = Array.isArray(concepts) && concepts.length > 0;

  if (!hasEntries && !hasEntities && !hasConcepts) {
    return { nodes: [], edges: [], tagColorMap: {} };
  }

  // 收集所有标签并分配颜色
  const tagSet = new Set();
  const collectTags = (items) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      for (const tag of (item.tags || [])) {
        tagSet.add(tag);
      }
    }
  };
  collectTags(entries);
  collectTags(entities);
  collectTags(concepts);

  const tagColorMap = {};
  let colorIdx = 0;
  for (const tag of tagSet) {
    tagColorMap[tag] = TAG_COLORS[colorIdx % TAG_COLORS.length];
    colorIdx++;
  }

  // 构建节点列表
  const allNodes = [];

  // 实体节点
  if (hasEntities) {
    for (const entity of entities) {
      const tags = entity.tags || [];
      const primaryTag = tags[0] || entity.type || '实体';
      allNodes.push({
        id: `entity:${entity.name}`,
        label: entity.displayName || entity.name,
        group: primaryTag,
        tags,
        color: tagColorMap[primaryTag] || TAG_COLORS[0],
        size: 1,
        shape: NODE_SHAPES.CIRCLE,
        nodeType: 'entity',
        entry: { ...entity, type: entity.type || 'other' },
      });
    }
  }

  // 概念节点
  if (hasConcepts) {
    for (const concept of concepts) {
      const tags = concept.tags || [];
      const primaryTag = tags[0] || '概念';
      allNodes.push({
        id: `concept:${concept.name}`,
        label: concept.displayName || concept.name,
        group: primaryTag,
        tags,
        color: tagColorMap[primaryTag] || TAG_COLORS[1],
        size: 1,
        shape: NODE_SHAPES.SQUARE,
        nodeType: 'concept',
        entry: { ...concept },
      });
    }
  }

  // Q&A 节点
  if (hasEntries) {
    for (const entry of entries) {
      const tags = entry.tags || [];
      const primaryTag = tags[0] || entry.category || '未分类';
      allNodes.push({
        id: entry.id,
        label: entry.title || '未命名',
        group: primaryTag,
        tags,
        color: tagColorMap[primaryTag] || TAG_COLORS[0],
        size: 1,
        shape: NODE_SHAPES.DIAMOND,
        nodeType: 'qa',
        entry,
      });
    }
  }

  // 限制节点数量
  let nodes = allNodes;
  if (allNodes.length > maxNodes) {
    // 优先保留有关联关系的节点
    const relatedIds = new Set();
    if (Array.isArray(relations)) {
      for (const rel of relations) {
        relatedIds.add(String(rel.source));
        relatedIds.add(String(rel.target));
      }
    }
    const withRelation = allNodes.filter(n => relatedIds.has(String(n.id)));
    const withoutRelation = allNodes.filter(n => !relatedIds.has(String(n.id)));
    nodes = [...withRelation, ...withoutRelation].slice(0, maxNodes);
  }

  const nodeIds = new Set(nodes.map(n => n.id));

  // 构建节点 ID → 节点映射
  const nodeById = {};
  for (const node of nodes) nodeById[node.id] = node;

  // 构建边（带类型分类）
  const edges = [];
  if (Array.isArray(relations)) {
    for (const rel of relations) {
      const srcId = rel.source;
      const tgtId = rel.target;

      if (!nodeIds.has(srcId) || !nodeIds.has(tgtId)) continue;

      const srcNode = nodeById[srcId];
      const tgtNode = nodeById[tgtId];
      const edgeType = classifyEdgeType(srcNode, tgtNode, contradictions);

      edges.push({
        source: srcId,
        target: tgtId,
        weight: Math.max(0, Math.min(1, rel.weight || 0.5)),
        edgeType,
        label: edgeType === EDGE_TYPES.CONTRADICTION ? '矛盾' : '',
      });
    }
  }

  // 计算每个节点的关联数量，用于缩放节点大小
  const connectionCount = {};
  for (const node of nodes) connectionCount[node.id] = 0;
  for (const edge of edges) {
    connectionCount[edge.source] = (connectionCount[edge.source] || 0) + 1;
    connectionCount[edge.target] = (connectionCount[edge.target] || 0) + 1;
  }

  for (const node of nodes) {
    const count = connectionCount[node.id] || 0;
    node.size = 6 + Math.min(count * 3, 20);
  }

  return { nodes, edges, tagColorMap };
}

/**
 * 以指定节点为中心，提取 N 跳可达的子图
 *
 * 使用 BFS 遍历邻接表，限制最大深度为 5。
 *
 * @param {Array} nodes - 所有节点数组
 * @param {Array} edges - 所有边数组
 * @param {string} nodeId - 中心节点 ID
 * @param {number} [depth=1] - 跳数（1=直接邻居，2=两跳）
 * @returns {{ nodes: Array, edges: Array }} 子图
 */
export function extractSubgraph(nodes, edges, nodeId, depth = 1) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { nodes: [], edges: [] };
  }
  if (!Array.isArray(edges)) {
    return { nodes: [], edges: [] };
  }

  // 限制最大深度
  const maxDepth = Math.min(Math.max(1, depth || 1), 5);

  // 构建邻接表（双向）
  const adjacency = {};
  for (const node of nodes) {
    adjacency[node.id] = [];
  }
  for (const edge of edges) {
    if (adjacency[edge.source] && adjacency[edge.target]) {
      adjacency[edge.source].push(edge.target);
      adjacency[edge.target].push(edge.source);
    }
  }

  // 如果 nodeId 不在图中，返回空
  if (!adjacency[nodeId]) {
    return { nodes: [], edges: [] };
  }

  // BFS
  const visited = new Set();
  visited.add(nodeId);
  let frontier = [nodeId];

  for (let d = 0; d < maxDepth; d++) {
    const nextFrontier = [];
    for (const current of frontier) {
      const neighbors = adjacency[current] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextFrontier.push(neighbor);
        }
      }
    }
    frontier = nextFrontier;
  }

  // 构建子图节点
  const nodeMap = {};
  for (const node of nodes) nodeMap[node.id] = node;

  const subgraphNodes = [];
  for (const id of visited) {
    if (nodeMap[id]) {
      subgraphNodes.push(nodeMap[id]);
    }
  }

  // 构建子图边（两端都在子图中）
  const subgraphEdges = edges.filter(
    e => visited.has(e.source) && visited.has(e.target)
  );

  return { nodes: subgraphNodes, edges: subgraphEdges };
}

/**
 * 将 Canvas 内容导出为 data URL（图片）
 *
 * @param {HTMLCanvasElement|null} canvas - Canvas 元素
 * @param {string} [type='image/png'] - 图片 MIME 类型
 * @param {number} [quality] - 图片质量（0-1，仅对 lossy 格式有效）
 * @returns {string|null} data URL 字符串，canvas 为 null 时返回 null
 */
export function exportGraphToDataURL(canvas, type, quality) {
  if (!canvas || typeof canvas.toDataURL !== 'function') return null;
  const mimeType = type || 'image/png';
  if (quality !== undefined) {
    return canvas.toDataURL(mimeType, quality);
  }
  return canvas.toDataURL(mimeType);
}

// ==================== P002 统一图谱：导入 / 去重 / 合并 ====================

/**
 * 对实体名称进行归一化（用于去重比较）
 *
 * - 去除首尾空白
 * - 转小写
 * - 合并连续空格
 *
 * @param {string} name - 实体名称
 * @returns {string} 归一化后的名称
 * @private
 */
function _normalizeEntityName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 对实体类型进行归一化
 *
 * @param {string} type - 实体类型
 * @returns {string} 归一化后的类型
 * @private
 */
function _normalizeEntityType(type) {
  return String(type || 'other').trim().toLowerCase();
}

/**
 * 构建实体去重 key: 归一化名称 + 归一化类型
 *
 * @param {Object} entity - 实体对象 { name, type }
 * @returns {string} 去重 key
 * @private
 */
function _entityKey(entity) {
  const name = _normalizeEntityName(entity.name || entity.label || entity.displayName || '');
  const type = _normalizeEntityType(entity.type || entity.nodeType || entity.group || '');
  return `${type}::${name}`;
}

/**
 * 从远程图谱数据导入实体和关系，与本地数据合并
 *
 * 去重策略：基于 name + type 归一化后的 key。
 *   - 若本地已有同名同类型实体，保留本地实体（local wins），
 *     但合并远程实体的 properties（远程不覆盖本地已有属性）。
 *   - 若本地没有，直接添加远程实体。
 *
 * 关系合并策略：
 *   - 基于 source + target + type 三元组去重。
 *   - 同一关系，weight 取较大值。
 *
 * @param {Object} localGraph - 本地图谱 { nodes: [], edges: [] }
 * @param {Object} remoteGraphData - 远程图谱数据
 *   远程格式支持两种：
 *   1. 标准化格式: { entities: [{ id, name, type, properties }], relations: [{ source, target, type, weight }] }
 *   2. 图谱格式: { nodes: [...], edges: [...] }
 * @param {Object} [options] - 导入选项
 * @param {string} [options.conflictStrategy='local_wins'] - 冲突策略: 'local_wins' | 'remote_wins' | 'skip'
 * @returns {{ mergedNodes: Array, mergedEdges: Array, added: number, updated: number, skipped: number }}
 */
export function importGraphData(localGraph, remoteGraphData, options = {}) {
  const strategy = options.conflictStrategy || 'local_wins';
  const localNodes = (localGraph && localGraph.nodes) ? [...localGraph.nodes] : [];
  const localEdges = (localGraph && localGraph.edges) ? [...localGraph.edges] : [];

  // 解析远程数据：支持两种格式
  let remoteEntities = [];
  let remoteRelations = [];

  if (remoteGraphData) {
    if (Array.isArray(remoteGraphData.entities)) {
      // 标准化格式
      remoteEntities = remoteGraphData.entities;
      remoteRelations = remoteGraphData.relations || [];
    } else if (Array.isArray(remoteGraphData.nodes)) {
      // 图谱格式 → 转换
      remoteEntities = remoteGraphData.nodes.map(node => ({
        id: node.id,
        name: node.label || node.name || '',
        type: node.nodeType || node.group || 'other',
        properties: node.entry || node.properties || {},
      }));
      remoteRelations = (remoteGraphData.edges || []).map(edge => ({
        source: String(edge.source),
        target: String(edge.target),
        type: edge.edgeType || edge.type || 'relation',
        weight: edge.weight || 0.5,
      }));
    }
  }

  // 构建本地索引
  const localByKey = {};
  const localIdByKey = {};
  for (let i = 0; i < localNodes.length; i++) {
    const node = localNodes[i];
    const key = _entityKey(node);
    localByKey[key] = node;
    localIdByKey[key] = String(node.id);
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  // 导入实体
  for (const remoteEntity of remoteEntities) {
    const key = _entityKey(remoteEntity);

    if (localByKey[key]) {
      // 已存在同名同类型实体
      const localNode = localByKey[key];

      if (strategy === 'skip') {
        skipped++;
        continue;
      }

      if (strategy === 'remote_wins') {
        // 用远程数据覆盖本地节点的属性
        const props = remoteEntity.properties || {};
        for (const [k, v] of Object.entries(props)) {
          if (v !== undefined && v !== null) {
            localNode.entry = localNode.entry || {};
            if (localNode.entry[k] === undefined || localNode.entry[k] === null) {
              localNode.entry[k] = v;
            }
          }
        }
        updated++;
        continue;
      }

      // local_wins: 仅合并远程中本地没有的属性
      const remoteProps = remoteEntity.properties || {};
      let hasNewProps = false;
      for (const [k, v] of Object.entries(remoteProps)) {
        if (v !== undefined && v !== null) {
          localNode.entry = localNode.entry || {};
          if (localNode.entry[k] === undefined || localNode.entry[k] === null) {
            localNode.entry[k] = v;
            hasNewProps = true;
          }
        }
      }
      if (hasNewProps) updated++;
      else skipped++;
    } else {
      // 新实体 → 添加
      const remoteId = remoteEntity.id || generateLocalNodeId(remoteEntity.name, remoteEntity.type);
      localNodes.push({
        id: remoteId,
        label: remoteEntity.name || remoteEntity.displayName || '未命名',
        group: remoteEntity.type || 'other',
        tags: (remoteEntity.properties && remoteEntity.properties.tags) || [],
        color: TAG_COLORS[added % TAG_COLORS.length],
        size: 1,
        nodeType: remoteEntity.type || 'other',
        entry: { ...(remoteEntity.properties || {}), type: remoteEntity.type || 'other' },
      });
      localByKey[key] = localNodes[localNodes.length - 1];
      localIdByKey[key] = String(remoteId);
      added++;
    }
  }

  // 构建本地边去重索引
  const edgeKeySet = new Set();
  for (const edge of localEdges) {
    edgeKeySet.add(_edgeKey(edge));
  }

  // 导入关系
  for (const remoteRelation of remoteRelations) {
    const eKey = _remoteEdgeKey(remoteRelation);
    const existingIdx = findExistingEdgeIndex(localEdges, remoteRelation);

    if (existingIdx >= 0) {
      // 已有同类型关系，weight 取较大值
      const existing = localEdges[existingIdx];
      if ((remoteRelation.weight || 0.5) > (existing.weight || 0.5)) {
        existing.weight = remoteRelation.weight;
      }
    } else if (!edgeKeySet.has(eKey)) {
      // 新关系 → 确认 source/target 都存在于合并后的节点中
      const srcExists = localNodes.some(n => String(n.id) === String(remoteRelation.source));
      const tgtExists = localNodes.some(n => String(n.id) === String(remoteRelation.target));
      if (srcExists && tgtExists) {
        localEdges.push({
          source: remoteRelation.source,
          target: remoteRelation.target,
          weight: Math.max(0, Math.min(1, remoteRelation.weight || 0.5)),
          edgeType: remoteRelation.type || 'relation',
        });
        edgeKeySet.add(eKey);
      }
    }
  }

  return { mergedNodes: localNodes, mergedEdges: localEdges, added, updated, skipped };
}

/**
 * 生成本地新节点 ID
 * @private
 */
function generateLocalNodeId(name, type) {
  const n = _normalizeEntityName(name);
  const t = _normalizeEntityType(type);
  return `imported:${t}:${n}`;
}

/**
 * 边去重 key（本地格式）
 * @private
 */
function _edgeKey(edge) {
  const s = String(edge.source);
  const t = String(edge.target);
  const et = edge.edgeType || edge.type || 'relation';
  return `${s}→${t}::${et}`;
}

/**
 * 边去重 key（远程标准化格式）
 * @private
 */
function _remoteEdgeKey(relation) {
  return `${String(relation.source)}→${String(relation.target)}::${relation.type || 'relation'}`;
}

/**
 * 查找本地中已有的同类型边（source→target 或 target→source 视为同一关系）
 * @private
 */
function findExistingEdgeIndex(localEdges, remoteRelation) {
  const rSrc = String(remoteRelation.source);
  const rTgt = String(remoteRelation.target);
  const rType = remoteRelation.type || 'relation';

  for (let i = 0; i < localEdges.length; i++) {
    const e = localEdges[i];
    const eSrc = String(e.source);
    const eTgt = String(e.target);
    const eType = e.edgeType || e.type || 'relation';
    if (eType === rType &&
        ((eSrc === rSrc && eTgt === rTgt) || (eSrc === rTgt && eTgt === rSrc))) {
      return i;
    }
  }
  return -1;
}

export { MAX_NODES, DEFAULT_ITERATIONS, TAG_COLORS, NODE_SHAPES, EDGE_TYPES };
