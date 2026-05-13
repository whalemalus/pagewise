/**
 * GraphExport — 统一图谱导出/导入模块
 *
 * 提供 JSON-LD 标准格式导出、增量导出、实体与关系的标准化表示。
 * 用于 PageWise 与 DocMind 共享知识图谱数据。
 *
 * @module graph-export
 */

/** JSON-LD 上下文定义 */
const JSONLD_CONTEXT = {
  '@context': {
    pw: 'https://pagewise.app/ontology#',
    name: 'pw:name',
    type: 'pw:type',
    properties: 'pw:properties',
    source: { '@id': 'pw:source', '@type': '@id' },
    target: { '@id': 'pw:target', '@type': '@id' },
    weight: 'pw:weight',
    updatedAt: { '@id': 'pw:updatedAt', '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
    createdAt: { '@id': 'pw:createdAt', '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
  },
};

/**
 * 生成唯一 ID（基于名称+类型的确定性 ID）
 *
 * @param {string} name - 实体名称
 * @param {string} type - 实体类型
 * @returns {string} 标准化 ID
 */
export function generateEntityId(name, type) {
  const normalizedName = String(name || '').trim().toLowerCase();
  const normalizedType = String(type || 'other').trim().toLowerCase();
  return `pw:${normalizedType}:${normalizedName}`;
}

/**
 * 标准化实体对象为导出格式
 *
 * @param {Object} node - 图谱节点（来自 buildGraphData / buildWikiGraphData）
 * @returns {{ id: string, name: string, type: string, properties: Object }}
 */
export function normalizeEntity(node) {
  if (!node) return null;

  const entry = node.entry || {};
  const name = node.label || entry.name || entry.displayName || '未命名';
  const type = node.nodeType || entry.type || node.group || 'other';

  const properties = {};
  // 保留非内部属性
  const skipKeys = new Set(['id', 'name', 'displayName', 'type', 'entry', 'x', 'y', 'vx', 'vy', 'fx', 'fy', 'color', 'size', 'shape']);
  for (const [key, value] of Object.entries(entry)) {
    if (!skipKeys.has(key) && value !== undefined && value !== null) {
      properties[key] = value;
    }
  }
  // 附加标签
  if (node.tags && node.tags.length > 0) {
    properties.tags = node.tags;
  }
  // 附加时间戳
  if (entry.createdAt) properties.createdAt = entry.createdAt;
  if (entry.updatedAt) properties.updatedAt = entry.updatedAt;

  return {
    id: node.id != null ? String(node.id) : generateEntityId(name, type),
    name,
    type,
    properties,
  };
}

/**
 * 标准化关系对象为导出格式
 *
 * @param {Object} edge - 图谱边
 * @returns {{ source: string, target: string, type: string, weight: number }}
 */
export function normalizeRelation(edge) {
  if (!edge) return null;

  return {
    source: String(edge.source),
    target: String(edge.target),
    type: edge.edgeType || edge.type || 'relation',
    weight: typeof edge.weight === 'number' ? Math.max(0, Math.min(1, edge.weight)) : 0.5,
  };
}

/**
 * 将图谱数据导出为 JSON-LD 格式
 *
 * @param {Object} graphData - { nodes: [], edges: [] }（来自 buildGraphData 或 buildWikiGraphData）
 * @param {Object} [options] - 导出选项
 * @param {string} [options.graphId] - 图谱标识符
 * @param {string} [options.source] - 数据来源标识（如 'pagewise', 'docmind'）
 * @returns {Object} JSON-LD 文档
 */
export function exportToJSONLD(graphData, options = {}) {
  if (!graphData || (!graphData.nodes && !graphData.edges)) {
    return {
      ...JSONLD_CONTEXT,
      '@type': 'pw:KnowledgeGraph',
      '@id': options.graphId || 'pw:graph:default',
      'pw:entities': [],
      'pw:relations': [],
      'pw:exportedAt': new Date().toISOString(),
      'pw:source': options.source || 'pagewise',
    };
  }

  const entities = (graphData.nodes || [])
    .map(normalizeEntity)
    .filter(Boolean);

  const relations = (graphData.edges || [])
    .map(normalizeRelation)
    .filter(Boolean);

  return {
    ...JSONLD_CONTEXT,
    '@type': 'pw:KnowledgeGraph',
    '@id': options.graphId || 'pw:graph:default',
    'pw:entities': entities,
    'pw:relations': relations,
    'pw:entityCount': entities.length,
    'pw:relationCount': relations.length,
    'pw:exportedAt': new Date().toISOString(),
    'pw:source': options.source || 'pagewise',
  };
}

/**
 * 仅导出实体列表（标准化格式）
 *
 * @param {Object} graphData - { nodes: [] }
 * @returns {Array<{ id: string, name: string, type: string, properties: Object }>}
 */
export function exportEntities(graphData) {
  if (!graphData || !Array.isArray(graphData.nodes)) return [];
  return graphData.nodes.map(normalizeEntity).filter(Boolean);
}

/**
 * 仅导出关系列表（标准化格式）
 *
 * @param {Object} graphData - { edges: [] }
 * @returns {Array<{ source: string, target: string, type: string, weight: number }>}
 */
export function exportRelations(graphData) {
  if (!graphData || !Array.isArray(graphData.edges)) return [];
  return graphData.edges.map(normalizeRelation).filter(Boolean);
}

/**
 * 增量导出：只导出指定时间戳之后变更的实体和关系
 *
 * 使用 updatedAt 或 createdAt 判断是否在时间窗口内。
 * 关系的时间戳取两端实体较新者的 updatedAt。
 *
 * @param {Object} graphData - { nodes: [], edges: [] }
 * @param {string|number|Date} sinceTimestamp - 起始时间戳
 * @param {Object} [options] - 导出选项
 * @returns {Object} JSON-LD 文档（仅包含变更部分）
 */
export function exportIncremental(graphData, sinceTimestamp, options = {}) {
  if (!graphData) return exportToJSONLD(null, options);

  const since = new Date(sinceTimestamp).getTime();
  if (isNaN(since)) return exportToJSONLD(graphData, options);

  // 过滤变更的节点
  const changedNodes = (graphData.nodes || []).filter(node => {
    const entry = node.entry || {};
    const itemTime = new Date(entry.updatedAt || entry.createdAt || 0).getTime();
    return itemTime > since;
  });

  // 构建变更节点 ID 集合
  const changedIds = new Set(changedNodes.map(n => String(n.id)));

  // 过滤变更的边：任一端点在变更集合中的边也算变更
  const changedEdges = (graphData.edges || []).filter(edge => {
    return changedIds.has(String(edge.source)) || changedIds.has(String(edge.target));
  });

  const result = exportToJSONLD(
    { nodes: changedNodes, edges: changedEdges },
    options,
  );
  result['pw:incrementalSince'] = sinceTimestamp;
  return result;
}

export { JSONLD_CONTEXT };
