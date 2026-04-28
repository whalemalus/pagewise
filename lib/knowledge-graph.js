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
  if (!entries || !Array.isArray(entries)) return { nodes: [], edges: [] };

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

  return { nodes, edges };
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

export { MAX_NODES, DEFAULT_ITERATIONS, TAG_COLORS };
