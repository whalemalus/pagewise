/**
 * BookmarkGraph — 书签图谱模块
 * 合并: graph-engine, canvas-visualizer, detail-panel
 */

// ==================== BookmarkGraphEngine ====================

/**
 * BookmarkGraphEngine — 书签图谱引擎
 *
 * 从书签数组构建相似度图谱，支持:
 *   - 混合相似度算法 (Jaccard + 域名匹配 + 文件夹重叠)
 *   - Top-K 相似书签推荐
 *   - 按域名/文件夹的聚类
 *   - 优化: 使用倒排索引避免 O(n²) 全量计算
 *
 * 性能: 1000 书签图谱构建 < 10 秒
 */

/**
 * @typedef {Object} NormalizedBookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} folderPath
 */

/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} label
 * @property {string} group
 * @property {number} size
 * @property {Object} data — 原始书签数据
 */

/**
 * @typedef {Object} GraphEdge
 * @property {string} source
 * @property {string} target
 * @property {number} weight — 相似度分数 (0-1)
 */

/**
 * @typedef {Object} GraphData
 * @property {GraphNode[]} nodes
 * @property {GraphEdge[]} edges
 */

export class BookmarkGraphEngine {
  constructor() {
    /** @type {Map<string, NormalizedBookmark>} id → bookmark */
    this._bookmarkStore = new Map();
    /** @type {Map<string, Set<string>>} token → Set<bookmarkId> (倒排索引) */
    this._tokenIndex = new Map();
    /** @type {Map<string, Set<string>>} domain → Set<bookmarkId> */
    this._domainIndex = new Map();
    /** @type {Map<string, Set<string>>} folderKey → Set<bookmarkId> */
    this._folderIndex = new Map();
    /** @type {Map<string, Set<string>>} id → Set<neighborId> (缓存连接关系) */
    this._adjacency = new Map();
    /** @type {GraphData} */
    this._graph = { nodes: [], edges: [] };
    /** @type {number} 相似度阈值 — 低于此值的边不加入图谱 */
    this._threshold = 0.1;
  }

  // ==================== 核心 API ====================

  /**
   * 从书签数组构建图谱
   * @param {NormalizedBookmark[]} bookmarks
   * @returns {GraphData} { nodes, edges }
   */
  buildGraph(bookmarks) {
    // 重置状态
    this._bookmarkStore.clear();
    this._tokenIndex.clear();
    this._domainIndex.clear();
    this._folderIndex.clear();
    this._adjacency.clear();
    this._graph = { nodes: [], edges: [] };

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return this._graph;
    }

    // 1. 存储书签并建立索引
    for (const bm of bookmarks) {
      if (!bm || !bm.id) continue;
      const id = String(bm.id);
      this._bookmarkStore.set(id, bm);
      this._adjacency.set(id, new Set());

      // 标题 token 倒排索引
      const tokens = this._tokenizeTitle(bm.title || '');
      for (const token of tokens) {
        let entry = this._tokenIndex.get(token);
        if (!entry) {
          entry = new Set();
          this._tokenIndex.set(token, entry);
        }
        entry.add(id);
      }

      // 域名索引
      const domain = this._extractDomain(bm.url || '');
      if (domain) {
        let dEntry = this._domainIndex.get(domain);
        if (!dEntry) {
          dEntry = new Set();
          this._domainIndex.set(domain, dEntry);
        }
        dEntry.add(id);
      }

      // 文件夹索引
      const folderKey = this._getFolderKey(bm.folderPath);
      if (folderKey) {
        let fEntry = this._folderIndex.get(folderKey);
        if (!fEntry) {
          fEntry = new Set();
          this._folderIndex.set(folderKey, fEntry);
        }
        fEntry.add(id);
      }
    }

    // 2. 使用倒排索引生成候选对 (避免 O(n²))
    const edgeMap = new Map(); // "id1-id2" → weight
    const allIds = [...this._bookmarkStore.keys()];

    // 基于共享 token 的候选对
    for (const [, idSet] of this._tokenIndex) {
      const ids = [...idSet];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          this._maybeAddEdge(ids[i], ids[j], edgeMap);
        }
      }
    }

    // 基于共享域名的候选对
    for (const [, idSet] of this._domainIndex) {
      const ids = [...idSet];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          this._maybeAddEdge(ids[i], ids[j], edgeMap);
        }
      }
    }

    // 基于共享文件夹的候选对
    for (const [, idSet] of this._folderIndex) {
      const ids = [...idSet];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          this._maybeAddEdge(ids[i], ids[j], edgeMap);
        }
      }
    }

    // 3. 构建边数组
    const edges = [];
    for (const [key, weight] of edgeMap) {
      if (weight < this._threshold) continue;
      const [source, target] = key.split('\x00');
      edges.push({ source, target, weight });
      this._adjacency.get(source)?.add(target);
      this._adjacency.get(target)?.add(source);
    }

    // 4. 构建节点数组
    const nodes = allIds.map(id => {
      const bm = this._bookmarkStore.get(id);
      const connCount = this._adjacency.get(id)?.size || 0;
      return {
        id,
        label: bm.title || bm.url || id,
        group: this._assignGroup(bm),
        size: 1 + Math.min(connCount, 20), // 1-21 缩放
        data: bm,
      };
    });

    this._graph = { nodes, edges };
    return this._graph;
  }

  /**
   * 计算两个书签的相似度 (0-1)
   *
   * 混合策略:
   *   0.4 × Jaccard(titleTokens) +
   *   0.3 × domainMatch +
   *   0.3 × folderOverlap
   *
   * @param {NormalizedBookmark|string} a — 书签或 ID
   * @param {NormalizedBookmark|string} b — 书签或 ID
   * @returns {number} 相似度分数 (0-1)
   */
  similarity(a, b) {
    const bmA = typeof a === 'string' ? this._bookmarkStore.get(a) : a;
    const bmB = typeof b === 'string' ? this._bookmarkStore.get(b) : b;

    if (!bmA || !bmB) return 0;

    // 1. 标题 Jaccard 相似度 (0.4)
    const tokensA = this._tokenizeTitle(bmA.title || '');
    const tokensB = this._tokenizeTitle(bmB.title || '');
    const jaccard = this._jaccard(tokensA, tokensB);

    // 2. 域名匹配 (0.3)
    const domainA = this._extractDomain(bmA.url || '');
    const domainB = this._extractDomain(bmB.url || '');
    const domainMatch = (domainA && domainB && domainA === domainB) ? 1 : 0;

    // 3. 文件夹重叠 (0.3)
    const folderOverlap = this._folderOverlapScore(
      bmA.folderPath || [],
      bmB.folderPath || [],
    );

    return 0.4 * jaccard + 0.3 * domainMatch + 0.3 * folderOverlap;
  }

  /**
   * 获取 Top-K 相似书签
   * @param {string} bookmarkId
   * @param {number} [topK=5]
   * @returns {Array<{ id: string, score: number, bookmark: Object }>}
   */
  getSimilar(bookmarkId, topK = 5) {
    const id = String(bookmarkId);
    const bm = this._bookmarkStore.get(id);
    if (!bm) return [];

    // 优先使用已计算的邻接边
    const neighbors = this._adjacency.get(id);
    const scored = [];

    if (neighbors && neighbors.size > 0) {
      // 从已有的边中查找权重
      for (const nId of neighbors) {
        const score = this.similarity(id, nId);
        scored.push({
          id: nId,
          score,
          bookmark: this._bookmarkStore.get(nId),
        });
      }
    } else {
      // 如果没有预计算的邻居，回退到全量计算
      for (const [otherId] of this._bookmarkStore) {
        if (otherId === id) continue;
        const score = this.similarity(id, otherId);
        if (score > 0) {
          scored.push({
            id: otherId,
            score,
            bookmark: this._bookmarkStore.get(otherId),
          });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * 返回当前图谱数据
   * @returns {GraphData}
   */
  getGraphData() {
    return {
      nodes: [...this._graph.nodes],
      edges: [...this._graph.edges],
    };
  }

  /**
   * 返回按域名/文件夹的聚类
   * @returns {{ byDomain: Map<string, Object[]>, byFolder: Map<string, Object[]> }}
   */
  getClusters() {
    const byDomain = new Map();
    const byFolder = new Map();

    for (const [id, bm] of this._bookmarkStore) {
      // 域名聚类
      const domain = this._extractDomain(bm.url || '');
      if (domain) {
        if (!byDomain.has(domain)) byDomain.set(domain, []);
        byDomain.get(domain).push({ id, title: bm.title, url: bm.url });
      }

      // 文件夹聚类
      const folderKey = this._getFolderKey(bm.folderPath);
      if (folderKey) {
        if (!byFolder.has(folderKey)) byFolder.set(folderKey, []);
        byFolder.get(folderKey).push({ id, title: bm.title, url: bm.url });
      }
    }

    return { byDomain, byFolder };
  }

  // ==================== 相似度计算 ====================

  /**
   * 可能添加边 — 计算相似度，超过阈值则记录
   * @param {string} id1
   * @param {string} id2
   * @param {Map<string, number>} edgeMap
   */
  _maybeAddEdge(id1, id2, edgeMap) {
    const key = id1 < id2 ? `${id1}\x00${id2}` : `${id2}\x00${id1}`;
    if (edgeMap.has(key)) return; // 已计算过

    const score = this.similarity(id1, id2);
    edgeMap.set(key, score);
  }

  /**
   * Jaccard 相似度
   * @param {string[]} setA
   * @param {string[]} setB
   * @returns {number} 0-1
   */
  _jaccard(setA, setB) {
    if (setA.length === 0 && setB.length === 0) return 0;
    const a = new Set(setA);
    const b = new Set(setB);
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * 文件夹路径重叠评分
   * 计算两个 folderPath 的公共前缀占比
   * @param {string[]} pathA
   * @param {string[]} pathB
   * @returns {number} 0-1
   */
  _folderOverlapScore(pathA, pathB) {
    if (!pathA || !pathB || pathA.length === 0 || pathB.length === 0) return 0;
    const maxLen = Math.max(pathA.length, pathB.length);
    let common = 0;
    for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
      if (pathA[i] === pathB[i]) {
        common++;
      } else {
        break;
      }
    }
    return common / maxLen;
  }

  // ==================== 工具方法 ====================

  /**
   * 标题分词 — 复用 BookmarkIndexer 的分词策略
   * @param {string} title
   * @returns {string[]}
   */
  _tokenizeTitle(title) {
    if (!title || typeof title !== 'string') return [];
    const tokens = [];
    const segments = title.match(/[一-鿿]|[a-zA-Z]+|[0-9]+/g) || [];
    for (const seg of segments) {
      if (/[一-鿿]/.test(seg)) {
        for (const char of seg) {
          tokens.push(char);
        }
      } else if (/[a-zA-Z]/.test(seg)) {
        tokens.push(seg.toLowerCase());
      } else {
        tokens.push(seg);
      }
    }
    return tokens;
  }

  /**
   * 从 URL 提取域名
   * @param {string} url
   * @returns {string} 去掉 www. 的域名，或空字符串
   */
  _extractDomain(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * 文件夹路径 → 索引键
   * @param {string[]} folderPath
   * @returns {string}
   */
  _getFolderKey(folderPath) {
    if (!folderPath || !Array.isArray(folderPath) || folderPath.length === 0) return '';
    return folderPath.join('/');
  }

  /**
   * 为书签分配分组 (优先文件夹 → 域名 → "default")
   * @param {NormalizedBookmark} bm
   * @returns {string}
   */
  _assignGroup(bm) {
    // 优先使用第一级文件夹
    if (bm.folderPath && bm.folderPath.length > 0) {
      return bm.folderPath[0];
    }
    // 回退到域名
    const domain = this._extractDomain(bm.url || '');
    if (domain) return domain;
    return 'default';
  }
}

// ==================== BookmarkVisualizer ====================

/** 15 色分组方案 */
const GROUP_COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853', '#FF6D01',
  '#46BDC6', '#7B61FF', '#E91E63', '#00BCD4', '#8BC34A',
  '#FF9800', '#9C27B0', '#607D8B', '#795548', '#F44336',
];

/** 节点半径范围 */
const NODE_RADIUS_MIN = 4;
const NODE_RADIUS_MAX = 20;

/** 力仿真参数 */
const REPULSION_K = 5000;
const SPRING_K = 0.005;
const SPRING_LENGTH = 120;
const DAMPING = 0.85;
const MIN_VELOCITY = 0.01;
const MAX_ITERATIONS = 100;

export class BookmarkVisualizer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._width = canvas.width || 800;
    this._height = canvas.height || 600;
    this._simNodes = new Map();
    this._edges = [];
    this._nodeData = new Map();
    this._groupColorMap = new Map();
    this._highlighted = new Set();
    this._hasHighlight = false;
    this._offsetX = 0;
    this._offsetY = 0;
    this._scale = 1;
    this._animId = null;
    this._running = false;
    this._dragNode = null;
    this._panning = false;
    this._panStartX = 0;
    this._panStartY = 0;
    this._panOffsetStartX = 0;
    this._panOffsetStartY = 0;
    this._onNodeClick = null;
    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundWheel = this._onWheel.bind(this);
    this._canvas.addEventListener('mousedown', this._boundMouseDown);
    this._canvas.addEventListener('mousemove', this._boundMouseMove);
    this._canvas.addEventListener('mouseup', this._boundMouseUp);
    this._canvas.addEventListener('wheel', this._boundWheel);
  }

  render(graphData) {
    this.stop();
    if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) {
      this._clearCanvas();
      return;
    }
    this._assignGroupColors(graphData.nodes);
    this._simNodes.clear();
    this._nodeData.clear();
    const cx = this._width / 2;
    const cy = this._height / 2;
    for (const node of graphData.nodes) {
      const id = String(node.id);
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * Math.min(this._width, this._height) * 0.3;
      this._simNodes.set(id, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        fixed: false,
      });
      this._nodeData.set(id, node);
    }
    this._edges = graphData.edges.map(e => ({
      source: String(e.source),
      target: String(e.target),
      weight: typeof e.weight === 'number' ? e.weight : 0.5,
    }));
    this._computeDegree();
    this.start();
  }

  highlight(nodeId) {
    this._highlighted.clear();
    const id = String(nodeId);
    if (this._nodeData.has(id)) {
      this._highlighted.add(id);
      for (const edge of this._edges) {
        if (edge.source === id) this._highlighted.add(edge.target);
        if (edge.target === id) this._highlighted.add(edge.source);
      }
      this._hasHighlight = true;
    }
  }

  searchHighlight(query) {
    this._highlighted.clear();
    if (!query || typeof query !== 'string') {
      this._hasHighlight = false;
      return;
    }
    const q = query.toLowerCase();
    for (const [id, node] of this._nodeData) {
      const label = (node.label || '').toLowerCase();
      if (label.includes(q)) {
        this._highlighted.add(id);
      }
    }
    this._hasHighlight = this._highlighted.size > 0;
  }

  resetHighlight() {
    this._highlighted.clear();
    this._hasHighlight = false;
  }

  zoomIn() {
    const factor = 1.2;
    this._zoom(this._width / 2, this._height / 2, factor);
  }

  zoomOut() {
    const factor = 1 / 1.2;
    this._zoom(this._width / 2, this._height / 2, factor);
  }

  resetZoom() {
    this._scale = 1;
    this._offsetX = 0;
    this._offsetY = 0;
  }

  getScale() {
    return this._scale;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._tick();
  }

  stop() {
    this._running = false;
    if (this._animId !== null) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
  }

  onNodeClick(callback) {
    this._onNodeClick = callback;
  }

  destroy() {
    this.stop();
    this._canvas.removeEventListener('mousedown', this._boundMouseDown);
    this._canvas.removeEventListener('mousemove', this._boundMouseMove);
    this._canvas.removeEventListener('mouseup', this._boundMouseUp);
    this._canvas.removeEventListener('wheel', this._boundWheel);
    this._simNodes.clear();
    this._nodeData.clear();
    this._groupColorMap.clear();
    this._highlighted.clear();
    this._edges = [];
    this._dragNode = null;
    this._onNodeClick = null;
    this._canvas = null;
    this._ctx = null;
  }

  _tick() {
    if (!this._running) return;
    this._simulate();
    this._renderFrame();
    this._animId = requestAnimationFrame(() => this._tick());
  }

  _simulate() {
    const nodes = this._simNodes;
    const ids = [...nodes.keys()];
    for (let i = 0; i < ids.length; i++) {
      const a = nodes.get(ids[i]);
      for (let j = i + 1; j < ids.length; j++) {
        const b = nodes.get(ids[j]);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) dist = 1;
        const force = REPULSION_K / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.fixed) { a.vx += fx; a.vy += fy; }
        if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
      }
    }
    for (const edge of this._edges) {
      const a = nodes.get(edge.source);
      const b = nodes.get(edge.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      const displacement = dist - SPRING_LENGTH;
      const force = SPRING_K * displacement;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.fixed) { a.vx += fx; a.vy += fy; }
      if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
    }
    let totalVelocity = 0;
    for (const id of ids) {
      const node = nodes.get(id);
      if (node.fixed) continue;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed < MIN_VELOCITY) {
        node.vx = 0;
        node.vy = 0;
      } else {
        totalVelocity += speed;
      }
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  _renderFrame() {
    const ctx = this._ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this._width, this._height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this._width, this._height);
    ctx.save();
    ctx.translate(this._offsetX, this._offsetY);
    ctx.scale(this._scale, this._scale);
    const vpLeft = -this._offsetX / this._scale;
    const vpTop = -this._offsetY / this._scale;
    const vpRight = vpLeft + this._width / this._scale;
    const vpBottom = vpTop + this._height / this._scale;
    const margin = NODE_RADIUS_MAX * 2;
    for (const edge of this._edges) {
      const a = this._simNodes.get(edge.source);
      const b = this._simNodes.get(edge.target);
      if (!a || !b) continue;
      if (!this._isEdgeVisible(a, b, vpLeft - margin, vpTop - margin, vpRight + margin, vpBottom + margin)) continue;
      const isHighlighted = this._hasHighlight &&
        this._highlighted.has(edge.source) && this._highlighted.has(edge.target);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (this._hasHighlight && !isHighlighted) {
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.1)';
      } else {
        ctx.strokeStyle = isHighlighted
          ? 'rgba(66, 133, 244, 0.8)'
          : `rgba(150, 150, 150, ${0.15 + edge.weight * 0.45})`;
      }
      ctx.lineWidth = Math.max(0.5, edge.weight * 4);
      ctx.stroke();
    }
    for (const [id, simNode] of this._simNodes) {
      const node = this._nodeData.get(id);
      if (!node) continue;
      if (simNode.x < vpLeft - margin || simNode.x > vpRight + margin ||
          simNode.y < vpTop - margin || simNode.y > vpBottom + margin) continue;
      const r = this._nodeRadius(node);
      const color = this._groupColorMap.get(node.group) || GROUP_COLORS[0];
      const isNodeHighlighted = !this._hasHighlight || this._highlighted.has(id);
      ctx.beginPath();
      ctx.arc(simNode.x, simNode.y, r, 0, Math.PI * 2);
      if (isNodeHighlighted) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      if (this._hasHighlight && isNodeHighlighted) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (r >= 6 && isNodeHighlighted) {
        ctx.fillStyle = '#333';
        ctx.font = `${Math.max(9, r)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.label || '', simNode.x, simNode.y + r + 2);
      }
    }
    ctx.restore();
  }

  _isEdgeVisible(a, b, left, top, right, bottom) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return maxX >= left && minX <= right && maxY >= top && minY <= bottom;
  }

  _nodeRadius(node) {
    const degree = node._degree || 0;
    const t = Math.min(degree / 20, 1);
    return NODE_RADIUS_MIN + t * (NODE_RADIUS_MAX - NODE_RADIUS_MIN);
  }

  _computeDegree() {
    for (const [, node] of this._nodeData) {
      node._degree = 0;
    }
    for (const edge of this._edges) {
      const a = this._nodeData.get(edge.source);
      const b = this._nodeData.get(edge.target);
      if (a) a._degree = (a._degree || 0) + 1;
      if (b) b._degree = (b._degree || 0) + 1;
    }
  }

  _assignGroupColors(nodes) {
    this._groupColorMap.clear();
    let colorIdx = 0;
    for (const node of nodes) {
      const group = node.group || 'default';
      if (!this._groupColorMap.has(group)) {
        this._groupColorMap.set(group, GROUP_COLORS[colorIdx % GROUP_COLORS.length]);
        colorIdx++;
      }
    }
  }

  _clearCanvas() {
    if (this._ctx) {
      this._ctx.clearRect(0, 0, this._width, this._height);
    }
  }

  _zoom(cx, cy, factor) {
    const newScale = Math.max(0.1, Math.min(10, this._scale * factor));
    const ratio = newScale / this._scale;
    this._offsetX = cx - ratio * (cx - this._offsetX);
    this._offsetY = cy - ratio * (cy - this._offsetY);
    this._scale = newScale;
  }

  _getCanvasPos(e) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  _screenToWorld(sx, sy) {
    return {
      x: (sx - this._offsetX) / this._scale,
      y: (sy - this._offsetY) / this._scale,
    };
  }

  _findNodeAt(wx, wy) {
    for (const [id, simNode] of this._simNodes) {
      const node = this._nodeData.get(id);
      if (!node) continue;
      const r = this._nodeRadius(node);
      const dx = wx - simNode.x;
      const dy = wy - simNode.y;
      if (dx * dx + dy * dy <= r * r) {
        return id;
      }
    }
    return null;
  }

  _onMouseDown(e) {
    const pos = this._getCanvasPos(e);
    const world = this._screenToWorld(pos.x, pos.y);
    const nodeId = this._findNodeAt(world.x, world.y);
    if (nodeId) {
      this._dragNode = nodeId;
      this._simNodes.get(nodeId).fixed = true;
      return;
    }
    this._panning = true;
    this._panStartX = pos.x;
    this._panStartY = pos.y;
    this._panOffsetStartX = this._offsetX;
    this._panOffsetStartY = this._offsetY;
  }

  _onMouseMove(e) {
    const pos = this._getCanvasPos(e);
    if (this._dragNode) {
      const world = this._screenToWorld(pos.x, pos.y);
      const simNode = this._simNodes.get(this._dragNode);
      if (simNode) {
        simNode.x = world.x;
        simNode.y = world.y;
        simNode.vx = 0;
        simNode.vy = 0;
      }
      return;
    }
    if (this._panning) {
      this._offsetX = this._panOffsetStartX + (pos.x - this._panStartX);
      this._offsetY = this._panOffsetStartY + (pos.y - this._panStartY);
    }
  }

  _onMouseUp(e) {
    if (this._dragNode) {
      const simNode = this._simNodes.get(this._dragNode);
      if (simNode && this._onNodeClick) {
        const nodeData = this._nodeData.get(this._dragNode);
        this._onNodeClick(this._dragNode, nodeData);
      }
      if (simNode) simNode.fixed = true;
      this._dragNode = null;
      return;
    }
    this._panning = false;
  }

  _onWheel(e) {
    const pos = this._getCanvasPos(e);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this._zoom(pos.x, pos.y, factor);
  }
}

// ==================== BookmarkDetailPanel ====================

const VALID_STATUSES = ['unread', 'reading', 'read'];
const DEFAULT_SIMILAR_LIMIT = 5;

export class BookmarkDetailPanel {
  constructor() {
    this._visible = false;
    this._bookmark = null;
    this._tags = [];
    this._status = 'unread';
    this._similarBookmarks = [];
    this._actionCallbacks = [];
    this._allTags = [];
    this._previousBookmark = null;
  }

  show(bookmark, similarBookmarks = []) {
    if (!bookmark || !bookmark.id) return;
    if (this._bookmark && this._bookmark.id !== bookmark.id) {
      this._previousBookmark = { ...this._bookmark };
    }
    this._bookmark = { ...bookmark };
    this._tags = Array.isArray(bookmark.tags) ? [...bookmark.tags] : [];
    this._status = VALID_STATUSES.includes(bookmark.status) ? bookmark.status : 'unread';
    this._similarBookmarks = Array.isArray(similarBookmarks)
      ? similarBookmarks.slice(0, DEFAULT_SIMILAR_LIMIT).map(s => ({
          id: String(s.id),
          title: s.title || s.bookmark?.title || '',
          url: s.url || s.bookmark?.url || '',
          score: typeof s.score === 'number' ? s.score : 0,
        }))
      : [];
    this._visible = true;
    this._emitAction('show', { bookmarkId: bookmark.id, title: bookmark.title });
  }

  hide() {
    this._visible = false;
    this._emitAction('hide', { bookmarkId: this._bookmark?.id || null });
  }

  update(bookmark) {
    if (!bookmark || !bookmark.id) return;
    if (!this._bookmark) {
      this.show(bookmark);
      return;
    }
    const prevId = this._bookmark.id;
    this._bookmark = { ...bookmark };
    if (bookmark.id === prevId) {
      if (Array.isArray(bookmark.tags) && this._tags.length === 0) {
        this._tags = [...bookmark.tags];
      }
      if (VALID_STATUSES.includes(bookmark.status) && this._status === 'unread') {
        this._status = bookmark.status;
      }
    } else {
      this._tags = Array.isArray(bookmark.tags) ? [...bookmark.tags] : [];
      this._status = VALID_STATUSES.includes(bookmark.status) ? bookmark.status : 'unread';
    }
    this._emitAction('update', { bookmarkId: bookmark.id, title: bookmark.title });
  }

  onAction(callback) {
    if (typeof callback === 'function') {
      this._actionCallbacks.push(callback);
    }
  }

  addTag(tag) {
    if (!tag || typeof tag !== 'string') return false;
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return false;
    if (this._tags.includes(normalized)) return false;
    this._tags.push(normalized);
    this._emitAction('addTag', {
      bookmarkId: this._bookmark?.id || null,
      tag: normalized,
      tags: [...this._tags],
    });
    return true;
  }

  removeTag(tag) {
    if (!tag || typeof tag !== 'string') return false;
    const normalized = tag.trim().toLowerCase();
    const index = this._tags.indexOf(normalized);
    if (index === -1) return false;
    this._tags.splice(index, 1);
    this._emitAction('removeTag', {
      bookmarkId: this._bookmark?.id || null,
      tag: normalized,
      tags: [...this._tags],
    });
    return true;
  }

  getTagSuggestions(input) {
    if (!input || typeof input !== 'string') return [];
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return this._allTags
      .filter(t => t.includes(q) && !this._tags.includes(t))
      .slice(0, 10);
  }

  setAllTags(tags) {
    this._allTags = Array.isArray(tags)
      ? tags.map(t => String(t).trim().toLowerCase()).filter(Boolean)
      : [];
  }

  setStatus(status) {
    if (!VALID_STATUSES.includes(status)) return false;
    if (this._status === status) return false;
    const prevStatus = this._status;
    this._status = status;
    this._emitAction('changeStatus', {
      bookmarkId: this._bookmark?.id || null,
      status,
      prevStatus,
    });
    return true;
  }

  getStatus() {
    return this._status;
  }

  getValidStatuses() {
    return [...VALID_STATUSES];
  }

  updateSimilar(similarBookmarks) {
    this._similarBookmarks = Array.isArray(similarBookmarks)
      ? similarBookmarks.slice(0, DEFAULT_SIMILAR_LIMIT).map(s => ({
          id: String(s.id),
          title: s.title || s.bookmark?.title || '',
          url: s.url || s.bookmark?.url || '',
          score: typeof s.score === 'number' ? s.score : 0,
        }))
      : [];
  }

  switchToSimilar(bookmarkId) {
    if (!bookmarkId) return null;
    const similar = this._similarBookmarks.find(s => s.id === String(bookmarkId));
    if (!similar) return null;
    const bookmark = {
      id: similar.id,
      title: similar.title,
      url: similar.url,
      folderPath: [],
      dateAdded: 0,
      dateAddedISO: '',
    };
    this._emitAction('switchBookmark', {
      fromId: this._bookmark?.id || null,
      toId: bookmarkId,
    });
    return bookmark;
  }

  openUrl() {
    if (!this._bookmark || !this._bookmark.url) return null;
    const url = this._bookmark.url;
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    }
    this._emitAction('openUrl', { bookmarkId: this._bookmark.id, url });
    return url;
  }

  isVisible() {
    return this._visible;
  }

  getPanelData() {
    if (!this._bookmark) return null;
    return {
      bookmark: { ...this._bookmark },
      tags: [...this._tags],
      status: this._status,
      similarBookmarks: [...this._similarBookmarks],
      visible: this._visible,
      formattedDate: this._formatDate(this._bookmark.dateAdded),
      formattedFolderPath: this._formatFolderPath(this._bookmark.folderPath),
    };
  }

  getTags() {
    return [...this._tags];
  }

  _emitAction(action, data) {
    for (const cb of this._actionCallbacks) {
      try {
        cb(action, data);
      } catch {
        // callback error should not affect panel logic
      }
    }
  }

  _formatDate(dateAdded) {
    if (!dateAdded || typeof dateAdded !== 'number') return '';
    try {
      return new Date(dateAdded).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  _formatFolderPath(folderPath) {
    if (!Array.isArray(folderPath) || folderPath.length === 0) return '/';
    return '/' + folderPath.join('/');
  }
}
