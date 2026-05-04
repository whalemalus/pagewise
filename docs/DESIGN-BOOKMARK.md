# BookmarkGraph 架构设计文档

> 最后更新: 2026-05-03

---

## 架构概述

BookmarkGraph 作为 PageWise 的新功能模块，采用**插件式架构**，复用现有基础设施，最小化对核心代码的侵入。

```
┌─────────────────────────────────────────────────────────────┐
│                      PageWise Extension                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Sidebar  │  │  Popup   │  │ Options  │  │ Content  │   │
│  │  Panel   │  │  Window  │  │   Page   │  │  Script  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┘   │
│       │              │              │                        │
│  ┌────┴──────────────┴──────────────┴───────────────────┐   │
│  │              BookmarkGraph Module (新)                │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │   │
│  │  │  Collector   │ │  Indexer    │ │  GraphEngine │    │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘    │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │   │
│  │  │  Visualizer  │ │  DetailPanel│ │ Recommender │    │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              复用的现有模块                            │   │
│  │  knowledge-graph.js │ embedding-engine.js │ utils.js  │   │
│  │  learning-path.js   │ entity-extractor.js │ ...       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              存储层                                    │   │
│  │  IndexedDB: bookmarks │ graph │ tags │ status         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 设计决策记录

| ID | 日期 | 决策 | 原因 |
|----|------|------|------|
| D001 | 2026-05-03 | 新增 `bookmarks` 权限 | Chrome 书签 API 需要此权限 |
| D002 | 2026-05-03 | 书签数据存储在独立 IndexedDB store | 避免污染现有知识库数据 |
| D003 | 2026-05-03 | 复用 knowledge-graph.js 的图谱结构 | 保持数据结构一致性 |
| D004 | 2026-05-03 | 使用 Canvas 渲染力导向图 | 性能优于 SVG（1000+ 节点） |
| D005 | 2026-05-03 | 书签分析在 Service Worker 中执行 | 利用后台能力，不阻塞 UI |
| D006 | 2026-05-03 | 关键词相似度用 Jaccard + TF-IDF 混合 | MVP 阶段简单有效，后续可升级为语义相似度 |

---

## 模块设计

### 1. BookmarkCollector（书签采集器）

**职责**: 读取 Chrome 书签树，输出标准化数据

```javascript
// lib/bookmark-collector.js
export class BookmarkCollector {
  /**
   * 递归读取 Chrome 书签树
   * @returns {Promise<Bookmark[]>} 标准化书签数组
   */
  async collect() { ... }

  /**
   * 将 Chrome 书签节点转为标准格式
   * @param {chrome.bookmarks.BookmarkTreeNode} node
   * @returns {Bookmark}
   */
  normalize(node) { ... }
}

/**
 * @typedef {Object} Bookmark
 * @property {string} id - Chrome 书签 ID
 * @property {string} title - 标题
 * @property {string} url - URL
 * @property {string[]} folderPath - 文件夹路径
 * @property {number} dateAdded - 添加时间戳
 * @property {string[]} tags - 标签（自动生成+手动）
 * @property {string} status - 状态: unread/reading/read
 */
```

**数据流**: Chrome Bookmarks API → normalize() → IndexedDB

### 2. BookmarkIndexer（书签索引器）

**职责**: 建立倒排索引，支持快速搜索

```javascript
// lib/bookmark-indexer.js
export class BookmarkIndexer {
  /**
   * 对书签数组建立索引
   * @param {Bookmark[]} bookmarks
   */
  buildIndex(bookmarks) { ... }

  /**
   * 搜索书签
   * @param {string} query
   * @returns {Bookmark[]} 匹配的书签
   */
  search(query) { ... }
}
```

**索引结构**:
```javascript
{
  "token": ["bookmarkId1", "bookmarkId2", ...],
  // 例: "react": ["bm_001", "bm_042", "bm_103"]
}
```

### 3. BookmarkGraphEngine（图谱引擎）

**职责**: 构建书签关联网络

```javascript
// lib/bookmark-graph.js
export class BookmarkGraphEngine {
  /**
   * 从书签构建图谱
   * @param {Bookmark[]} bookmarks
   * @returns {GraphData} { nodes, edges }
   */
  buildGraph(bookmarks) { ... }

  /**
   * 计算两个书签的相似度
   * @param {Bookmark} a
   * @param {Bookmark} b
   * @returns {number} 0-1 相似度分数
   */
  similarity(a, b) { ... }

  /**
   * 获取相似书签
   * @param {string} bookmarkId
   * @param {number} topK
   * @returns {SimilarBookmark[]}
   */
  getSimilar(bookmarkId, topK = 5) { ... }
}
```

**相似度算法** (MVP):
```
similarity(a, b) = 
  0.4 * jaccard(titleTokens(a), titleTokens(b)) +
  0.3 * domainMatch(a.url, b.url) +
  0.3 * folderOverlap(a.folderPath, b.folderPath)
```

### 4. BookmarkVisualizer（可视化）

**职责**: Canvas 力导向图渲染

```javascript
// lib/bookmark-visualizer.js
export class BookmarkVisualizer {
  constructor(canvas) { ... }

  /**
   * 渲染图谱
   * @param {GraphData} graphData
   */
  render(graphData) { ... }

  /**
   * 高亮节点
   * @param {string} nodeId
   */
  highlight(nodeId) { ... }

  /**
   * 搜索并高亮
   * @param {string} query
   */
  searchHighlight(query) { ... }
}
```

**渲染策略**:
- 节点: 圆形，大小按连接数缩放
- 颜色: 按文件夹/主题分类（15色方案）
- 边: 粗细按相似度缩放
- 交互: 拖拽节点、滚轮缩放、双击展开

### 5. BookmarkDetailPanel（详情面板）

**职责**: 显示书签详情和相似推荐

```
┌─────────────────────────────┐
│ 📄 书签标题                  │
│ 🔗 https://example.com      │
│ 📁 技术 > 前端 > React       │
│ 🏷️ react, hooks, tutorial   │
│ 📅 2026-03-15               │
│ 📊 状态: 待读                │
├─────────────────────────────┤
│ 相似书签 (5)                 │
│ • React Hooks 完全指南       │
│ • React 性能优化实战         │
│ • ...                       │
├─────────────────────────────┤
│ [打开] [编辑标签] [标记已读] │
└─────────────────────────────┘
```

---

## 存储设计

### IndexedDB Stores

```javascript
// 新增 stores（不修改现有 stores）
const BOOKMARK_STORES = {
  bookmarks: 'bookmarks',     // 书签原始数据
  graph: 'bookmarkGraph',     // 图谱数据 (nodes, edges)
  tags: 'bookmarkTags',       // 标签数据
  status: 'bookmarkStatus',   // 状态标记
  index: 'bookmarkIndex',     // 倒排索引
  cache: 'bookmarkCache',     // 分析缓存
};
```

### 数据迁移策略

首次使用时：
1. 读取 Chrome 书签树
2. 分析并建立索引
3. 构建图谱
4. 缓存到 IndexedDB

后续使用：
1. 检查缓存是否过期（24小时）
2. 增量更新（只处理新增/删除的书签）

---

## UI 集成方案

### Popup（弹窗）

新增"书签概览"区域：
```
┌─────────────────────────────┐
│ 📊 书签概览                  │
│ 总计: 523 个                 │
│ 领域: 12 个                  │
│ 待读: 89 个                  │
├─────────────────────────────┤
│ 🔍 搜索书签...               │
├─────────────────────────────┤
│ 最近添加 (3)                 │
│ • Vue3 完整指南              │
│ • Docker 实战               │
│ • ...                       │
├─────────────────────────────┤
│ [查看完整图谱 →]             │
└─────────────────────────────┘
```

### Sidebar（侧边栏）

新增第 6 个标签页：`[书签]`

### Options Page（选项页）

新增"书签图谱"标签页，包含：
- 完整力导向图
- 搜索/过滤面板
- 详情面板
- 统计面板

---

## 权限变更

```json
{
  "permissions": [
    "storage",
    "sidePanel",
    "contextMenus",
    "tabs",
    "activeTab",
    "bookmarks"  // 新增
  ]
}
```

---

## 性能预算

| 操作 | 目标 | 策略 |
|------|------|------|
| 书签采集 | < 5s (1000条) | 批量读取，增量更新 |
| 索引构建 | < 3s (1000条) | Web Worker 后台执行 |
| 图谱构建 | < 10s (1000条) | 相似度计算优化，采样策略 |
| 图谱渲染 | > 30fps | Canvas 渲染，视口裁剪 |
| 搜索响应 | < 100ms | 倒排索引，内存缓存 |

---

## 已知技术债务

| ID | 描述 | 优先级 | 状态 |
|----|------|--------|------|
| TD001 | MVP 用关键词相似度，后续需升级为语义相似度 | 中 | 规划中 |
| TD002 | Canvas 渲染无 Accessibility 支持 | 低 | 待解决 |
| TD003 | 大量书签（5000+）可能影响首次分析速度 | 中 | 待优化 |
