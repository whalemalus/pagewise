# 需求文档 — R78: 性能优化 BookmarkPerformanceOptimization

> 迭代: Phase D · 第 6/10 轮
> 日期: 2026-05-12
> 作者: Plan Agent

---

## 用户故事

**作为** PageWise 用户，**我希望**书签图谱功能在 10000+ 书签时依然流畅响应，**以便**我的大型收藏库不会因为数据量增长而出现卡顿、页面冻结或内存溢出。

### 背景

PageWise 的 BookmarkGraph 系统经过 R43-R77 共 35 轮迭代，已构建了从采集、索引、图谱构建、可视化到语义搜索的完整链路。当前所有模块均为**同步全量计算**——一次性将全部书签加载到内存并执行 CPU 密集型操作。这种设计在 < 500 书签时表现良好，但：

- **R45 BookmarkGraphEngine**: `buildGraph()` 内含混合相似度计算（Jaccard + 域名 + 文件夹），虽有倒排索引优化避免 O(n²)，但在万级书签时候选对仍然巨大，主线程会卡顿 5-15 秒
- **R44 BookmarkIndexer**: `buildIndex()` 一次性 `clear()` 后全量重建倒排索引，万级书签时索引构建内存峰值过高
- **R46 BookmarkVisualizer**: 力导向仿真每帧 O(n²) 斥力计算，1000 节点已到性能边界，5000+ 节点完全不可用
- **R65 BookmarkSemanticSearch**: TF-IDF 全量向量化 + 余弦相似度矩阵，万级书签时构建时间不可接受

---

## 验收标准

### AC-1: 批处理引擎 — 分批执行避免主线程阻塞

**给定** 一个包含 10000 个书签的数组，**当** 调用 `buildGraphBatched(bookmarks)` 进行图谱构建时，**那么**：
- 书签被分成不超过 500 个/批的批次
- 每批之间通过 `setTimeout(0)` 让出主线程
- 可选的 `onProgress(current, total)` 回调被正确调用
- 最终返回的 `{ nodes, edges }` 与全量构建结果一致
- 浏览器 UI 不会被冻结（主线程单次阻塞 < 50ms）

**适用方法**: `buildGraphBatched()`、`buildIndexBatched()`、`computeSimilarityBatched()`

### AC-2: Web Worker 卸载 — CPU 密集操作移至后台线程

**给定** 一个创建好的 Worker 封装，**当** 调用 `runInWorker('computeSimilarity', data)` 时，**那么**：
- 相似度计算在 Worker 线程执行，主线程不被阻塞
- 通过 `postMessage` 双向通信返回结果
- Worker 创建使用 `URL.createObjectURL` 动态生成脚本，不需要额外文件
- 计算失败时通过 Promise reject 返回错误信息
- Worker 在计算完成后可被正确销毁，不产生内存泄漏

**适用操作**: 相似度计算、TF-IDF 向量化、聚类分析

### AC-3: 虚拟化渲染 — 视口裁剪只渲染可见节点

**给定** 一个包含 10000 个节点的图谱数据和一个 800×600 的视口，**当** 调用 `getVisibleNodes(graphData, viewport)` 时，**那么**：
- 只返回视口范围内（含边距缓冲区）的节点
- 返回结果格式 `{ visibleNodes, visibleEdges }`，数量远小于总节点数
- 缓冲区默认为视口尺寸的 20%（防止缩放时边缘节点闪烁）
- 响应时间 < 5ms

### AC-4: LRU 缓存管理 — 自动淘汰过期数据

**给定** 一个缓存 Map 和 maxSize 限制，**当** 缓存条目超过 maxSize 时调用 `trimCache(cacheMap, maxSize)`，**那么**：
- 最近最少访问的条目被淘汰
- 缓存大小回落到 maxSize 以内
- 默认 cacheMaxSize = 5000
- 不影响剩余条目的访问顺序

### AC-5: 性能基准 — 满足分层 SLA

| 数据规模 | 图谱构建 | 索引构建 | 搜索响应 | 语义搜索 |
|----------|----------|----------|----------|----------|
| 100 书签 | < 200ms | < 100ms | < 50ms | < 100ms |
| 1,000 书签 | < 2s | < 1s | < 100ms | < 500ms |
| 10,000 书签 | < 10s | < 5s | < 200ms | < 2s |

> 注: 以上为单线程批处理模式的时间。Web Worker 模式下主线程阻塞时间为 0ms，总耗时可能略长但 UI 保持流畅。

---

## 技术约束

| 约束 | 说明 |
|------|------|
| **零外部依赖** | 不引入打包工具（webpack/rollup），保持 ES Module 原生加载 |
| **MV3 兼容** | Web Worker 必须兼容 Chrome Extension Manifest V3 的 Service Worker 环境。注意：Service Worker 中不能使用 `new Worker()`，需通过 `offscreen` 文档或降级到批处理模式 |
| **向后兼容** | 不改变现有模块（R43-R77）的任何公开函数签名。所有优化通过封装层（装饰器/代理模式）透明提供 |
| **纯 ES Module** | `lib/bookmark-performance.js` 保持与现有模块一致的导入/导出风格 |
| **Node.js 可测试** | 所有核心逻辑可在 `node:test` 中测试（Worker 部分 mock 测试） |
| **内存上限** | 单次操作内存增量 < 100MB（10000 书签场景） |

---

## 依赖关系

### 上游依赖（本次迭代消费的模块）

| 模块 | 文件 | 优化切入点 |
|------|------|-----------|
| BookmarkGraphEngine | `lib/bookmark-graph.js` | `buildGraph()` → 包装为 `buildGraphBatched()` |
| BookmarkIndexer | `lib/bookmark-indexer.js` | `buildIndex()` → 包装为 `buildIndexBatched()` |
| BookmarkVisualizer | `lib/bookmark-visualizer.js` | 提供 `getVisibleNodes()` 视口裁剪数据 |
| BookmarkSemanticSearch | `lib/bookmark-semantic-search.js` | `buildIndex()` + TF-IDF 计算 → Worker 卸载 |
| BookmarkClusterer | `lib/bookmark-clusterer.js` | 聚类计算 → Worker 卸载 |
| BookmarkRecommender | `lib/bookmark-recommender.js` | 相似推荐 → 缓存加速 |

### 下游影响（本次迭代受益的模块）

| 模块 | 受益方式 |
|------|---------|
| BookmarkPopup (`popup/bookmark-overview.js`) | 万级书签概览统计不再卡顿 |
| BookmarkOptionsPage (`options/bookmark-panel.js`) | 图谱标签页打开后全量渲染变分批渲染 |
| BookmarkSearch (`lib/bookmark-search.js`) | 搜索结果缓存，重复查询 0ms 响应 |
| BookmarkSmartCollections (`lib/bookmark-smart-collections.js`) | 大集合更新通过批处理完成 |

### 同期迭代依赖

- 无阻塞依赖。R78 为独立性能层，不依赖 R79-R82 的任何功能

---

## 实现策略概述

> 以下为概要说明，详见 DESIGN-ITER4.md

### 核心设计原则: 封装而非侵入

```
现有调用方
    │
    ▼
BookmarkPerformanceOptimizer  ← 新增封装层
    │
    ├─ buildGraphBatched()  ──→  BookmarkGraphEngine.buildGraph()
    ├─ buildIndexBatched()  ──→  BookmarkIndexer.buildIndex()
    ├─ runInWorker()        ──→  动态创建 Worker
    ├─ getVisibleNodes()    ──→  视口裁剪逻辑
    ├─ trimCache()          ──→  LRU 淘汰逻辑
    └─ getPerformanceStats() ──→  性能统计
```

### 新增文件

| 文件 | 用途 |
|------|------|
| `lib/bookmark-performance.js` | 性能优化器核心模块 |
| `tests/test-bookmark-performance.js` | 单元测试（8+ 用例） |

### 不修改的文件

现有 `lib/bookmark-*.js` 模块不做任何改动，保持 API 稳定。

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| MV3 Service Worker 不支持 `new Worker()` | 高 | 高 | 通过 `chrome.offscreen` 文档创建 Worker，或降级为批处理模式 |
| 批处理导致总时间增加 | 中 | 低 | 首批无延迟，仅后续批次 `setTimeout(0)`，实测影响 < 10% |
| 虚拟化裁剪遗漏边缘节点 | 低 | 中 | 20% 缓冲区 + 缩放/平移时动态刷新 |
| LRU 淘汰热点数据 | 低 | 中 | 支持 `protectKeys()` 标记不可淘汰条目 |

---

## 测试计划

| 用例 | 类型 | 覆盖标准 |
|------|------|---------|
| 100 书签批处理结果与全量一致 | 单元 | AC-1, AC-5 |
| 1000 书签批处理进度回调正确 | 单元 | AC-1 |
| 10000 书签图谱构建不超时 | 基准 | AC-5 |
| Worker 创建/通信/销毁生命周期 | 单元 | AC-2 |
| Worker 计算失败正确 reject | 单元 | AC-2 |
| getVisibleNodes 返回视口内节点 | 单元 | AC-3 |
| trimCache LRU 顺序正确 | 单元 | AC-4 |
| trimCache protectKeys 不被淘汰 | 单元 | AC-4 |
| 性能统计 getPerformanceStats 返回正确字段 | 单元 | 辅助 |
| 端到端: 采集→索引→图谱→搜索全链路万级书签 | E2E | AC-1~AC-5 |

**最低要求**: 8+ 单元测试用例，1 个 E2E 基准测试用例
