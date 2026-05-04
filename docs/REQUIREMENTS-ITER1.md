# R51: 选项页集成 BookmarkOptionsPage — 需求文档

> 创建日期: 2026-05-04
> 状态: 📋 待开发
> 优先级: P0 (MVP)
> 复杂度: Medium

---

## 1. 用户故事

**作为**一个书签量很大的程序员，
**我想要**在 PageWise 选项页中通过标签页切换查看书签图谱，
**以便**在完整的可视化界面中浏览、搜索、探索我的书签知识网络，而非仅通过弹窗看到概览摘要。

---

## 2. 验收标准

| # | 验收条件 | 验证方式 |
|---|---------|---------|
| AC-1 | 选项页顶部新增 Tab 导航栏，包含 **「设置」** 和 **「书签图谱」** 两个标签页，默认显示「设置」；切换标签页时原页面内容不丢失（输入框值、勾选状态等） | 手动 + E2E |
| AC-2 | 切换到「书签图谱」标签页后，自动调用 `BookmarkPanel.init()` 采集书签 → 构建索引/图谱 → 渲染三栏布局（左: 搜索+过滤、中: Canvas 力导向图、右: 详情面板），加载期间显示 loading 指示器 | E2E |
| AC-3 | 在图谱标签页内，搜索框实时过滤并高亮 Canvas 上匹配的节点；文件夹/标签/状态过滤器可独立或组合使用，图谱仅显示满足过滤条件的节点 | E2E |
| AC-4 | 点击 Canvas 图谱节点后，右侧面板显示该书签的标题、URL（可点击新标签打开）、文件夹路径、添加时间、状态、标签，以及 Top-5 相似书签列表 | E2E |
| AC-5 | 切换离开图谱标签页时调用 `BookmarkPanel.destroy()` 释放 Canvas 和事件监听器，防止内存泄漏；再次切回时重新 init | E2E |

---

## 3. 技术约束

### 3.1 代码结构

| 约束 | 说明 |
|------|------|
| 入口文件 | `options/bookmark-panel.js`（已有 `BookmarkPanel` 类，本次不修改类内部逻辑） |
| 修改范围 | `options/options.html`（新增 Tab 导航 + 图谱容器 `<div id="bookmark-panel">`）<br>`options/options.js`（新增 Tab 切换逻辑 + BookmarkPanel 实例管理）<br>`options/options.css`（新增 Tab 导航样式 + 三栏布局样式） |
| 现有页面 | 当前 `options.html` 是纯单栏设置页面（max-width: 640px），无 Tab 导航；改造需保持原有设置页功能完全不变 |

### 3.2 布局设计

```
┌──────────────────────────────────────────────────────┐
│ 智阅 PageWise                                          │
│ ┌──────────┬──────────┐                                │
│ │ ⚙ 设置    │ 🕸 书签图谱 │  ← Tab 导航                 │
│ └──────────┴──────────┘                                │
│                                                        │
│  [设置标签页]                    [图谱标签页]            │
│  现有单栏设置内容                左栏 | 中栏 | 右栏       │
│  (max-width: 640px)            搜索  Canvas 详情面板    │
│                                过滤  力导向图 相似推荐    │
│                                统计  (800×600)          │
└──────────────────────────────────────────────────────┘
```

- **设置标签页**: 保持现有 `max-width: 640px` 居中布局不变
- **图谱标签页**: 全宽布局（`max-width: 100%`），内部三栏 `grid: 240px 1fr 280px`
- Tab 切换通过 CSS `display: none/block` 实现，**不使用**路由或页面跳转

### 3.3 依赖关系

```
R043 BookmarkCollector   ✅ 已实现 — lib/bookmark-collector.js
R044 BookmarkIndexer     ✅ 已实现 — lib/bookmark-indexer.js
R045 BookmarkGraphEngine ✅ 已实现 — lib/bookmark-graph.js
R046 BookmarkVisualizer  ✅ 已实现 — lib/bookmark-visualizer.js
R047 BookmarkDetailPanel ✅ 已实现 — lib/bookmark-detail-panel.js
R048 BookmarkRecommender ✅ 已实现 — lib/bookmark-recommender.js
R049 BookmarkSearch      ✅ 已实现 — lib/bookmark-search.js

本次 R51 是**集成层**，将上述 7 个模块通过 BookmarkPanel 类组装到选项页中。
```

### 3.4 Manifest 权限

`bookmarks` 权限已在 `manifest.json` 中声明（参见 DESIGN-BOOKMARK.md D001 决策），本次无需修改。

### 3.5 性能要求

| 指标 | 目标 |
|------|------|
| Tab 切换响应 | < 100ms（不含首次图谱初始化） |
| 首次图谱渲染（1000 条书签） | < 15s（采集 + 索引 + 图谱构建 + Canvas 渲染） |
| 内存释放 | destroy() 后 Canvas 事件监听器全部清除 |

### 3.6 浏览器兼容

- Chrome 116+ (Manifest V3)
- ES Module (`type="module"`)
- 不引入外部框架依赖

---

## 4. 依赖关系

### 4.1 上游（被本需求依赖）

| 需求 | 模块 | 状态 |
|------|------|------|
| R043 | `lib/bookmark-collector.js` | ✅ 已实现 |
| R044 | `lib/bookmark-indexer.js` | ✅ 已实现 |
| R045 | `lib/bookmark-graph.js` | ✅ 已实现 |
| R046 | `lib/bookmark-visualizer.js` | ✅ 已实现 |
| R047 | `lib/bookmark-detail-panel.js` | ✅ 已实现 |
| R048 | `lib/bookmark-recommender.js` | ✅ 已实现 |
| R049 | `lib/bookmark-search.js` | ✅ 已实现 |

### 4.2 下游（依赖本需求）

| 需求 | 说明 |
|------|------|
| R050 Popup 概览 | 弹窗中「查看完整图谱」按钮需跳转到选项页图谱标签页 (`options.html#tab=bookmark`) |
| R052 MVP 测试 | E2E 测试需覆盖 Tab 切换 + 图谱完整交互链路 |

### 4.3 改动文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `options/options.html` | **修改** | 新增 Tab 导航结构 + `<div id="bookmark-panel">` 容器 |
| `options/options.js` | **修改** | 新增 Tab 切换逻辑 + BookmarkPanel 实例化/生命周期管理 |
| `options/options.css` | **修改** | 新增 Tab 导航样式 + 图谱三栏布局样式 |
| `options/bookmark-panel.js` | **不修改** | 现有 API 完全满足集成需求 |

---

## 5. 风险与注意事项

| 风险 | 缓解措施 |
|------|---------|
| 现有 options.js 是 `DOMContentLoaded` 内联初始化，引入 Tab 切换后逻辑可能冲突 | 将设置页初始化逻辑封装为函数，Tab 切换时按需调用，不重复绑定事件 |
| Canvas 在 `display: none` 时宽度为 0，切回后图谱可能变形 | 切换回图谱 Tab 时调用 `visualizer.resize()` 或重新 render |
| 用户无书签或书签权限未授予时的空状态 | BookmarkPanel 已有 `_renderEmpty` 和 `_renderError` 兜底，需确认 UI 提示文案 |
| 选项页全宽布局下设置标签页会显得过宽 | 设置标签页保持 `max-width: 640px` 居中，仅图谱标签页全宽 |

---

## 6. 测试策略

| 测试类型 | 范围 | 最少用例数 |
|---------|------|-----------|
| 单元测试 | Tab 切换逻辑、BookmarkPanel 生命周期 | 5 |
| 集成测试 | Tab 切换 ↔ BookmarkPanel.init/destroy 完整链路 | 3 |
| E2E 测试 | 搜索 → 高亮 → 点击节点 → 详情面板 → 相似推荐 | 5 |

**总测试用例数: ≥ 13**

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-04 | R051 | 初始创建需求文档 |
