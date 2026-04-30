# 设计文档 — 迭代 #18: 知识图谱可视化增强

> 日期: 2026-04-30
> 状态: 实现中

## 背景

迭代 #17 已实现知识图谱基础功能：
- `lib/knowledge-graph.js`: `buildGraphData()` + `forceDirectedLayout()`
- `sidebar.js`: `renderKnowledgeGraph()` + `drawKnowledgeGraph()` + hover/click 交互
- Canvas 绘制、节点/边渲染、tooltip、详情弹窗

但当前实现缺少**交互深度**：无法缩放/平移大图谱、无法按标签过滤节点、
无全局小地图导航、tooltip 信息不够丰富。

## 需求

1. **缩放与平移**: 鼠标滚轮缩放 + 拖拽平移，支持查看大图谱
2. **小地图 (Minimap)**: 右下角显示全局缩略图 + 当前视口位置
3. **标签过滤**: 工具栏标签按钮，点击切换显示/隐藏特定标签的节点
4. **增强 Tooltip**: 悬停时显示节点名称 + 标签 + 关联数 + 内容摘要
5. **重置视图**: 一键重置缩放/平移回初始状态

## 架构设计

### knowledge-graph.js 新增函数

```
┌──────────────────────────────────────────────────────┐
│ applyZoomTransform(nodes, transform)                  │
│   transform: { scale, offsetX, offsetY }              │
│   → 返回节点屏幕坐标的副本（不修改原节点）              │
├──────────────────────────────────────────────────────┤
│ screenToWorld(sx, sy, transform)                      │
│   屏幕坐标 → 世界坐标                                  │
├──────────────────────────────────────────────────────┤
│ computeMinimapViewport(canvasW, canvasH, transform,   │
│                        worldW, worldH)                │
│   → { x, y, w, h } 在小地图上的视口矩形               │
├──────────────────────────────────────────────────────┤
│ filterGraphByTags(nodes, edges, activeTags)           │
│   activeTags: Set<string> | null (null=显示全部)       │
│   → { visibleNodes, visibleEdges, hiddenCount }       │
├──────────────────────────────────────────────────────┤
│ buildTooltipText(node, edges, nodeMap)                │
│   → string (多行 tooltip 文本)                         │
└──────────────────────────────────────────────────────┘
```

### Zoom/Pan 状态

```js
{
  scale: 1,         // 0.2 ~ 5.0
  offsetX: 0,       // 平移偏移
  offsetY: 0,
  minScale: 0.2,
  maxScale: 5.0
}
```

- 鼠标滚轮: 以鼠标位置为中心缩放
- 鼠标拖拽: 按住左键平移
- 双击: 以点击位置放大 1.5x
- 重置按钮: 回到 scale=1, offset=0

### 小地图

- 120×80px，右下角覆盖层
- 显示所有节点为小圆点（按标签着色）
- 半透明矩形显示当前视口位置
- 点击小地图跳转到对应位置

### 标签过滤

- 工具栏下方显示标签按钮（复用已有 graph-legend 区域）
- 点击标签按钮切换 active/inactive
- inactive 标签的节点和关联边隐藏
- `graph-legend-item.inactive` 样式已存在

## 文件清单

| 操作 | 文件 |
|------|------|
| 修改 | `lib/knowledge-graph.js` — 新增 5 个函数 |
| 新增 | `tests/test-knowledge-graph-v2.js` — 新增函数测试 |
| 修改 | `sidebar/sidebar.js` — 缩放/平移/小地图/过滤/tooltip |
| 修改 | `sidebar/sidebar.css` — 小地图样式、缩放控件 |
| 修改 | `sidebar/sidebar.html` — 小地图 Canvas、重置按钮 |
| 修改 | `docs/IMPLEMENTATION.md` |
| 修改 | `docs/CHANGELOG.md` |
| 修改 | `docs/TODO.md` |
