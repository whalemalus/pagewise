# VERIFICATION.md — Iteration #18 Review

> 审查日期: 2026-04-30
> 审查员: Guard Agent
> 迭代: #18 — 知识图谱可视化增强

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | lib 层 5 个函数完整实现且质量好；但 UI 集成（sidebar.js）仅完成了导入和 DOM 引用，缺少全部交互逻辑 |
| 代码质量 | ✅ | knowledge-graph.js 纯函数设计、JSDoc 齐全、边界防御完善、不修改原始数据 |
| 测试覆盖 | ✅ | 34 个测试 / 6 个 suite 全部通过；覆盖正常路径、边界条件、往返(round-trip)一致性 |
| 文档同步 | ❌ | CHANGELOG.md 未更新 R18；TODO.md 未标记完成；sidebar.html/sidebar.css 未修改 |

## 功能清单核对

| 设计文档需求 | lib 层 | UI 层 | 测试 | 状态 |
|------|------|------|------|------|
| ① 缩放与平移 (zoom/pan) | ✅ applyZoomTransform, screenToWorld | ❌ 无 wheel/drag handler | ✅ | ⚠️ 缺 UI |
| ② 小地图 (Minimap) | ✅ computeMinimapViewport | ❌ 无 canvas 渲染, HTML 元素缺失 | ✅ | ⚠️ 缺 UI |
| ③ 标签过滤 | ✅ filterGraphByTags | ❌ 无标签按钮切换逻辑 | ✅ | ⚠️ 缺 UI |
| ④ 增强 Tooltip | ✅ buildTooltipText | ❌ 未替换旧 tooltip 逻辑 | ✅ | ⚠️ 缺 UI |
| ⑤ 重置视图 | N/A | ❌ 无 click handler, HTML 元素缺失 | ❌ | ❌ |

## 发现的问题

### 🔴 P0 — sidebar.html 缺少 DOM 元素（运行时崩溃）

**文件**: `sidebar/sidebar.html`

`sidebar.js` 引用了 `graphMinimapCanvas` 和 `btnResetZoom`，但 HTML 中不存在这两个元素：

```js
// sidebar.js L345-346 — 本次新增
this.graphMinimapCanvas = document.getElementById('graphMinimapCanvas');  // → null
this.btnResetZoom = document.getElementById('btnResetZoom');              // → null
```

sidebar.html graph 区域 (L340-357) 中没有任何 `graphMinimapCanvas` 或 `btnResetZoom`。
当前不会立即崩溃（仅保存 null 引用），但后续任何调用 `this.graphMinimapCanvas.getContext()` 都会抛出 TypeError。

**修复**: 在 `sidebar.html` L347（`knowledgeGraphCanvas` 之后）添加：
```html
<canvas id="graphMinimapCanvas" class="graph-minimap" width="120" height="80"></canvas>
<button class="btn-reset-zoom" id="btnResetZoom" title="重置视图">🔄</button>
```

### 🔴 P1 — sidebar.js 交互逻辑未实现

**文件**: `sidebar/sidebar.js`

diff 仅包含 2 行新增代码：
1. 扩展 import（加入 5 个新函数）
2. 2 个 DOM 引用

以下核心交互逻辑**完全缺失**：

| 功能 | 需要的代码 | 状态 |
|------|------|------|
| 滚轮缩放 | `canvas.addEventListener('wheel', ...)` | ❌ |
| 拖拽平移 | `mousedown/mousemove/mouseup` handler | ❌ |
| 双击放大 | `dblclick` handler | ❌ |
| 小地图渲染 | `drawMinimap()` — 绘制节点 + 视口矩形 | ❌ |
| 小地图点击跳转 | minimap canvas click handler | ❌ |
| 标签过滤 toggle | legend item click → `filterGraphByTags()` | ❌ |
| Tooltip 增强 | 替换旧 tooltip 为 `buildTooltipText()` | ❌ |
| 重置按钮 | `btnResetZoom` click handler | ❌ |
| 状态管理 | `this.graphTransform = { scale, offsetX, offsetY }` | ❌ |

**影响**: 导入的 5 个函数和 2 个 DOM 引用当前是**死代码**。

### 🟡 P2 — sidebar.css 缺少小地图样式

**文件**: `sidebar/sidebar.css`

设计文档要求 120×80px 右下角覆盖层小地图。当前 CSS 中没有 `.graph-minimap`、`.btn-reset-zoom` 等样式。

已有 `.graph-legend-item.inactive` 样式可用于标签过滤，这部分 OK。

### 🟡 P3 — buildTooltipText XSS 风险

**文件**: `lib/knowledge-graph.js` L400

```js
const preview = node.entry.content.substring(0, 80);
lines.push(`📝 ${preview}${suffix}`);
```

如果 `entry.content` 包含恶意 HTML（例如从导入的外部文档），且 tooltip 使用 `innerHTML` 渲染，存在 XSS 风险。

**建议**: 在 `buildTooltipText` 中对 content 做 HTML 实体转义，或确保调用方使用 `textContent`。

### 🟢 P4 — 文档未同步

| 文件 | 问题 |
|------|------|
| `docs/CHANGELOG.md` | 仅有 R17 条目，缺少 R18 |
| `docs/TODO.md` | L29 "知识图谱可视化" 仍为 `- [ ]` 未勾选 |
| `docs/IMPLEMENTATION.md` | 未更新 |

### 🟢 P5 — buildTooltipText 未使用 nodeMap 参数

**文件**: `lib/knowledge-graph.js` L377

函数签名接受 `nodeMap` 参数，但函数体内从未使用它。如果设计意图是显示关联节点名称（如 "关联: A, B, C"），应实现；否则移除该参数以避免误导。

## 返工任务清单

| # | 优先级 | 任务 | 文件 | 估时 |
|---|--------|------|------|------|
| 1 | 🔴 P0 | 在 sidebar.html 中添加 `graphMinimapCanvas` + `btnResetZoom` 元素 | sidebar.html | 5min |
| 2 | 🔴 P1 | 实现 zoom/pan 交互（wheel + drag + dblclick） | sidebar.js | 45min |
| 3 | 🔴 P1 | 实现 minimap 渲染与点击跳转 | sidebar.js | 30min |
| 4 | 🔴 P1 | 实现标签过滤 toggle（legend click → filterGraphByTags） | sidebar.js | 20min |
| 5 | 🔴 P1 | 替换旧 tooltip 为 buildTooltipText | sidebar.js | 15min |
| 6 | 🔴 P1 | 实现重置按钮 handler | sidebar.js | 5min |
| 7 | 🟡 P2 | 添加小地图/重置按钮 CSS 样式 | sidebar.css | 10min |
| 8 | 🟡 P3 | buildTooltipText 增加 XSS 防护（textContent 兼容） | knowledge-graph.js | 5min |
| 9 | 🟢 P4 | 更新 CHANGELOG.md、TODO.md | docs/ | 5min |

**总估时**: ~2.5h

## 审核结论

**判定: ⚠️ 有条件通过 (Conditional Pass)**

- **lib/knowledge-graph.js**: 质量优秀，5 个纯函数实现完整、测试充分，可直接合入 ✅
- **sidebar.js + sidebar.html + sidebar.css**: UI 集成层**未完成**，仅有导入和 DOM 引用的占位代码 ❌
- 当前状态不应发版，但 lib 层代码无风险，可先行合入并在下一轮完成 UI 集成
