# 设计文档 — 迭代 30: L3.2 知识图谱可视化增强

> 日期: 2026-04-30
> 前置: L1.2 实体/概念提取, L2.1 自动分类, L2.3 矛盾检测, L3.1 Wiki 浏览模式

---

## 目标

在现有知识图谱（纯 Q&A 节点 + 相似度边）基础上，增加 wiki 视图：

1. **节点类型区分**: 实体(圆形) / 概念(方形) / Q&A(菱形)
2. **边类型区分**: 引用(实线) / 关联(虚线) / 矛盾(红色虚线)
3. **聚焦子图**: 点击节点后展示以该节点为中心的 N 跳关联子图
4. **图谱导出**: 将 Canvas 图谱导出为 PNG 图片

---

## 架构设计

### 新增/修改文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `lib/knowledge-graph.js` | 修改 | 新增 4 个导出函数 |
| `tests/test-knowledge-graph-wiki.js` | 新增 | 单元测试 |
| `sidebar/sidebar.js` | 修改 | 集成 wiki 图谱渲染 |
| `docs/IMPLEMENTATION.md` | 修改 | 记录实现 |
| `docs/CHANGELOG.md` | 修改 | 记录变更 |
| `docs/TODO.md` | 修改 | 标记完成 |

### 数据模型扩展

#### 节点形状 (NODE_SHAPES)

```js
export const NODE_SHAPES = {
  CIRCLE: 'circle',   // 实体
  SQUARE: 'square',   // 概念
  DIAMOND: 'diamond', // Q&A
};
```

#### 边类型 (EDGE_TYPES)

```js
export const EDGE_TYPES = {
  REFERENCE: 'reference',  // 引用关系（wikilink）— 实线
  RELATION: 'relation',    // 关联关系（共现/相似度）— 虚线
  CONTRADICTION: 'contradiction', // 矛盾 — 红色虚线
};
```

### 核心函数

#### `buildWikiGraphData(options)`

从 Wiki 数据源构建图谱数据。合并实体、概念和 Q&A 为统一节点，每种类型使用不同形状和颜色。

- 输入: `{ entries, relations, entities, concepts, contradictions, maxNodes }`
- 输出: `{ nodes, edges, tagColorMap }`

节点字段扩展：
```
{
  id, label, group, tags, color, size,
  shape: NODE_SHAPES.CIRCLE | SQUARE | DIAMOND,
  nodeType: 'entity' | 'concept' | 'qa',
  entry: <原始数据>,
}
```

边字段扩展：
```
{
  source, target, weight,
  edgeType: EDGE_TYPES.REFERENCE | RELATION | CONTRADICTION,
  label: string,  // 边描述
}
```

#### `classifyEdgeType(sourceNode, targetNode, contradictions)`

根据两个节点的类型和是否存在矛盾记录，判定边类型。

逻辑：
- 两个节点之间有矛盾记录 → CONTRADICTION
- entity↔qa 或 concept↔qa（wikilink 引用）→ REFERENCE
- 其他（相似度/共现）→ RELATION

#### `extractSubgraph(nodes, edges, nodeId, depth=1)`

以指定节点为中心，提取 N 跳可达的子图。

- 使用 BFS 遍历邻接表
- `depth=1` 返回直接邻居
- `depth=2` 返回两跳邻居
- 返回 `{ nodes, edges }`（子集）

#### `exportGraphToDataURL(canvas)`

将 Canvas 内容导出为 PNG data URL。

- 调用 `canvas.toDataURL('image/png')`
- 返回 base64 data URL 字符串

---

## 绘制规则

### 节点绘制

| 形状 | 绘制方法 | 适用类型 |
|------|---------|---------|
| 圆形 | `arc()` | entity |
| 正方形 | `rect()` 旋转 0° | concept |
| 菱形 | `moveTo/lineTo` 45° 旋转 | qa |

### 边绘制

| 类型 | 样式 | 颜色 |
|------|------|------|
| REFERENCE | 实线 `setLineDash([])` | `rgba(99, 102, 241, 0.5)` 蓝色 |
| RELATION | 虚线 `setLineDash([5,5])` | `rgba(180, 180, 180, 0.4)` 灰色 |
| CONTRADICTION | 虚线 `setLineDash([5,5])` | `rgba(239, 68, 68, 0.7)` 红色 |

### 聚焦模式

进入聚焦模式后：
1. 调用 `extractSubgraph()` 获取子图
2. 只绘制子图中的节点和边
3. 中心节点高亮（更大尺寸 + 发光效果）
4. 显示「返回全景」按钮

---

## 测试计划

共约 30 个测试用例：

1. `buildWikiGraphData` — 8 个测试（空输入、实体节点形状、概念节点形状、QA 节点形状、混合数据、最大节点限制、tagColorMap、节点大小缩放）
2. `classifyEdgeType` — 6 个测试（entity→qa=REFERENCE、concept→qa=REFERENCE、entity→entity=RELATION、矛盾检测、边界条件）
3. `extractSubgraph` — 8 个测试（空输入、单节点、1跳子图、2跳子图、孤立节点、循环图、未知节点、边的子集过滤）
4. `exportGraphToDataURL` — 3 个测试（返回字符串、data URL 格式、空 canvas）
5. 集成测试 — 3 个测试（完整 pipeline、wiki/普通模式互转、子图布局后坐标有效）

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 节点类型太多导致图谱混乱 | 保持形状简洁（3 种），颜色仍按标签区分 |
| 聚焦子图 BFS 跳数过大 | 限制 maxDepth=2，超出截断 |
| Canvas 导出大图 OOM | 导出前检查 canvas 尺寸，过大则降采样 |
