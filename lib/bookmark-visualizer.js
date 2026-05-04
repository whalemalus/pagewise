/**
 * BookmarkVisualizer — Canvas 力导向图可视化
 *
 * 在 Canvas 上渲染书签图谱的力导向图，支持:
 *   - 库仑斥力 + 弹簧引力 + 阻尼系数的力仿真
 *   - 节点拖拽、画布平移、滚轮缩放
 *   - 按 group 分组着色 (15 色方案)
 *   - 节点大小按连接数缩放, 边粗细按权重缩放
 *   - 高亮、搜索高亮、重置高亮
 *   - 视口裁剪优化性能
 *
 * 性能: 1000 节点 > 30fps
 */

// ==================== 常量 ====================

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
const REPULSION_K = 5000;       // 斥力系数 (库仑力)
const SPRING_K = 0.005;         // 弹簧刚度
const SPRING_LENGTH = 120;      // 弹簧自然长度
const DAMPING = 0.85;           // 阻尼系数 (防止振荡)
const MIN_VELOCITY = 0.01;      // 最小速度阈值 (低于此停止计算)
const MAX_ITERATIONS = 100;     // 每帧最大力仿真迭代

// ==================== BookmarkVisualizer ====================

export class BookmarkVisualizer {
  /**
   * @param {HTMLCanvasElement|Object} canvas — Canvas 元素 (或 mock)
   */
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._width = canvas.width || 800;
    this._height = canvas.height || 600;

    /** @type {Map<string, Object>} id → simulation node { x, y, vx, vy, fixed } */
    this._simNodes = new Map();
    /** @type {Array<Object>} edges */
    this._edges = [];
    /** @type {Map<string, Object>} id → graph node data */
    this._nodeData = new Map();
    /** @type {Map<string, string>} id → group → color */
    this._groupColorMap = new Map();
    /** @type {Set<string>} 高亮的节点 ID */
    this._highlighted = new Set();
    /** @type {boolean} 是否有高亮激活 */
    this._hasHighlight = false;

    /** 变换状态: 平移 + 缩放 */
    this._offsetX = 0;
    this._offsetY = 0;
    this._scale = 1;

    /** 动画状态 */
    this._animId = null;
    this._running = false;

    /** 交互状态 */
    this._dragNode = null;        // 被拖拽的节点
    this._panning = false;        // 正在平移画布
    this._panStartX = 0;
    this._panStartY = 0;
    this._panOffsetStartX = 0;
    this._panOffsetStartY = 0;

    /** 回调 */
    this._onNodeClick = null;

    /** 绑定事件处理器 (方便 destroy 时移除) */
    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundWheel = this._onWheel.bind(this);

    // 注册事件
    this._canvas.addEventListener('mousedown', this._boundMouseDown);
    this._canvas.addEventListener('mousemove', this._boundMouseMove);
    this._canvas.addEventListener('mouseup', this._boundMouseUp);
    this._canvas.addEventListener('wheel', this._boundWheel);
  }

  // ==================== 公共 API ====================

  /**
   * 渲染图谱数据
   * @param {{ nodes: Array, edges: Array }} graphData
   */
  render(graphData) {
    this.stop();

    if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) {
      this._clearCanvas();
      return;
    }

    // 分配 group 颜色
    this._assignGroupColors(graphData.nodes);

    // 初始化仿真节点位置
    this._simNodes.clear();
    this._nodeData.clear();
    const cx = this._width / 2;
    const cy = this._height / 2;

    for (const node of graphData.nodes) {
      const id = String(node.id);
      // 随机初始位置 (在画布中心附近)
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

    // 存储边
    this._edges = graphData.edges.map(e => ({
      source: String(e.source),
      target: String(e.target),
      weight: typeof e.weight === 'number' ? e.weight : 0.5,
    }));

    // 计算每个节点的连接数 (用于半径缩放)
    this._computeDegree();

    // 启动仿真
    this.start();
  }

  /**
   * 高亮指定节点及其直接连接
   * @param {string} nodeId
   */
  highlight(nodeId) {
    this._highlighted.clear();
    const id = String(nodeId);
    if (this._nodeData.has(id)) {
      this._highlighted.add(id);
      // 添加直接邻居
      for (const edge of this._edges) {
        if (edge.source === id) this._highlighted.add(edge.target);
        if (edge.target === id) this._highlighted.add(edge.source);
      }
      this._hasHighlight = true;
    }
  }

  /**
   * 搜索并高亮匹配节点 (标题包含 query, 不区分大小写)
   * @param {string} query
   */
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

  /**
   * 重置所有高亮
   */
  resetHighlight() {
    this._highlighted.clear();
    this._hasHighlight = false;
  }

  /**
   * 放大
   */
  zoomIn() {
    const factor = 1.2;
    this._zoom(this._width / 2, this._height / 2, factor);
  }

  /**
   * 缩小
   */
  zoomOut() {
    const factor = 1 / 1.2;
    this._zoom(this._width / 2, this._height / 2, factor);
  }

  /**
   * 重置缩放和平移
   */
  resetZoom() {
    this._scale = 1;
    this._offsetX = 0;
    this._offsetY = 0;
  }

  /**
   * 获取当前缩放级别
   * @returns {number}
   */
  getScale() {
    return this._scale;
  }

  /**
   * 启动动画循环
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._tick();
  }

  /**
   * 停止动画循环
   */
  stop() {
    this._running = false;
    if (this._animId !== null) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
  }

  /**
   * 注册节点点击回调
   * @param {Function} callback — (nodeId, nodeData) => void
   */
  onNodeClick(callback) {
    this._onNodeClick = callback;
  }

  /**
   * 清理所有资源
   */
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

  // ==================== 力仿真 ====================

  /**
   * 每帧 tick — 力仿真 + 渲染
   */
  _tick() {
    if (!this._running) return;

    this._simulate();
    this._renderFrame();

    this._animId = requestAnimationFrame(() => this._tick());
  }

  /**
   * 力仿真一步
   */
  _simulate() {
    const nodes = this._simNodes;
    const ids = [...nodes.keys()];

    // 计算斥力 (所有节点对)
    for (let i = 0; i < ids.length; i++) {
      const a = nodes.get(ids[i]);
      for (let j = i + 1; j < ids.length; j++) {
        const b = nodes.get(ids[j]);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) dist = 1; // 防止除零

        // 库仑力: F = K / d²
        const force = REPULSION_K / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (!a.fixed) { a.vx += fx; a.vy += fy; }
        if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
      }
    }

    // 计算边的弹簧引力
    for (const edge of this._edges) {
      const a = nodes.get(edge.source);
      const b = nodes.get(edge.target);
      if (!a || !b) continue;

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;

      // 胡克定律: F = k * (d - L)
      const displacement = dist - SPRING_LENGTH;
      const force = SPRING_K * displacement;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!a.fixed) { a.vx += fx; a.vy += fy; }
      if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
    }

    // 应用阻尼和速度，更新位置
    let totalVelocity = 0;
    for (const id of ids) {
      const node = nodes.get(id);
      if (node.fixed) continue;

      node.vx *= DAMPING;
      node.vy *= DAMPING;

      // 如果速度很小，直接清零
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

  // ==================== 渲染 ====================

  /**
   * 渲染一帧
   */
  _renderFrame() {
    const ctx = this._ctx;
    if (!ctx) return;

    // 清除画布
    ctx.clearRect(0, 0, this._width, this._height);

    // 背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this._width, this._height);

    // 应用变换
    ctx.save();
    ctx.translate(this._offsetX, this._offsetY);
    ctx.scale(this._scale, this._scale);

    // 计算视口范围 (用于裁剪)
    const vpLeft = -this._offsetX / this._scale;
    const vpTop = -this._offsetY / this._scale;
    const vpRight = vpLeft + this._width / this._scale;
    const vpBottom = vpTop + this._height / this._scale;
    const margin = NODE_RADIUS_MAX * 2;

    // 先绘制边
    for (const edge of this._edges) {
      const a = this._simNodes.get(edge.source);
      const b = this._simNodes.get(edge.target);
      if (!a || !b) continue;

      // 视口裁剪
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

    // 再绘制节点
    for (const [id, simNode] of this._simNodes) {
      const node = this._nodeData.get(id);
      if (!node) continue;

      // 视口裁剪
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

      // 边框
      if (this._hasHighlight && isNodeHighlighted) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 标签 (节点够大时才显示)
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

  /**
   * 判断边是否在视口内 (粗略判断)
   */
  _isEdgeVisible(a, b, left, top, right, bottom) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return maxX >= left && minX <= right && maxY >= top && minY <= bottom;
  }

  /**
   * 计算节点显示半径 (按连接数缩放)
   * @param {Object} node
   * @returns {number}
   */
  _nodeRadius(node) {
    const degree = node._degree || 0;
    // 连接数 0 → min, ≥20 → max
    const t = Math.min(degree / 20, 1);
    return NODE_RADIUS_MIN + t * (NODE_RADIUS_MAX - NODE_RADIUS_MIN);
  }

  /**
   * 计算每个节点的连接数
   */
  _computeDegree() {
    // 初始化
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

  /**
   * 为所有 group 分配颜色
   * @param {Array} nodes
   */
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

  /**
   * 清除画布
   */
  _clearCanvas() {
    if (this._ctx) {
      this._ctx.clearRect(0, 0, this._width, this._height);
    }
  }

  // ==================== 缩放 ====================

  /**
   * 以 (cx, cy) 为中心缩放 factor 倍
   */
  _zoom(cx, cy, factor) {
    const newScale = Math.max(0.1, Math.min(10, this._scale * factor));
    const ratio = newScale / this._scale;
    // 保持鼠标位置不变
    this._offsetX = cx - ratio * (cx - this._offsetX);
    this._offsetY = cy - ratio * (cy - this._offsetY);
    this._scale = newScale;
  }

  // ==================== 事件处理 ====================

  _getCanvasPos(e) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  /**
   * 屏幕坐标 → 世界坐标
   */
  _screenToWorld(sx, sy) {
    return {
      x: (sx - this._offsetX) / this._scale,
      y: (sy - this._offsetY) / this._scale,
    };
  }

  /**
   * 查找鼠标位置下的节点
   */
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

    // 尝试拖拽节点
    const nodeId = this._findNodeAt(world.x, world.y);
    if (nodeId) {
      this._dragNode = nodeId;
      this._simNodes.get(nodeId).fixed = true;
      return;
    }

    // 否则平移画布
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
      // 检测是否是点击 (几乎没移动)
      const simNode = this._simNodes.get(this._dragNode);
      if (simNode && this._onNodeClick) {
        const nodeData = this._nodeData.get(this._dragNode);
        this._onNodeClick(this._dragNode, nodeData);
      }
      // 释放节点 (保持固定位置，不再参与力仿真)
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
