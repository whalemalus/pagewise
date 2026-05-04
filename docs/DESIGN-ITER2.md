# R52: BookmarkGraph MVP E2E 测试 — 设计文档

> 迭代: R52
> 日期: 2026-05-04

## 架构概述

E2E 测试采用两层覆盖策略：

```
MVP E2E (test-bookmark-graph-e2e.js)     V1.0 E2E (test-bookmark-v1-e2e.js)
├── Collector → Indexer → Graph           ├── Clusterer + LearningPath
├── Graph → Search                        ├── Tagger + TagEditor
├── Graph → Recommender                   ├── GapDetector + Status
├── Boundary: empty/dup/special chars     ├── FolderAnalyzer + Dedup
└── Pipeline: full 5-module chain         └── ImportExport + Full pipeline
```

## 模块覆盖矩阵

| 模块 | MVP E2E | V1.0 E2E | 单元测试 |
|------|---------|----------|---------|
| BookmarkCollector | ✅ | ✅ | ✅ 18 cases |
| BookmarkIndexer | ✅ | ✅ | ✅ 24 cases |
| BookmarkGraphEngine | ✅ | ✅ | ✅ 22 cases |
| BookmarkVisualizer | — | — | ✅ 15 cases |
| BookmarkDetailPanel | — | — | ✅ 22 cases |
| BookmarkRecommender | ✅ | — | ✅ 15 cases |
| BookmarkSearch | ✅ | — | ✅ 22 cases |
| BookmarkPopup | — | — | ✅ 17 cases |
| BookmarkOptionsPage | — | — | ✅ 13 cases |
| BookmarkClusterer | — | ✅ | ✅ 21 cases |
| BookmarkLearningPath | — | ✅ | ✅ 21 cases |
| BookmarkTagger | — | ✅ | ✅ 21 cases |
| BookmarkTagEditor | — | ✅ | ✅ 30 cases |
| BookmarkGapDetector | — | ✅ | ✅ 27 cases |
| BookmarkStatus | — | ✅ | ✅ 19 cases |
| BookmarkFolderAnalyzer | — | ✅ | ✅ 20 cases |
| BookmarkDedup | — | ✅ | ✅ 36 cases |
| BookmarkImportExport | — | ✅ | ✅ 24 cases |

## 测试模式

- **MVP E2E**: 使用 `chrome.bookmarks.getTree()` mock，测试 Chrome 书签 API 集成
- **V1.0 E2E**: 使用纯数据对象 mock，测试模块间数据流转
- 两种模式互补：一个测 Chrome API 集成，一个测模块逻辑链路

## 决策记录

| ID | 决策 | 原因 |
|----|------|------|
| D001 | 两个独立 E2E 文件而非一个 | MVP (Phase A) 和 V1.0 (Phase B) 模块集合不同，分开维护更清晰 |
| D002 | MVP E2E 用 Chrome API mock | 测试真实浏览器环境下的采集流程 |
| D003 | V1.0 E2E 用纯数据对象 | Phase B 模块不依赖 Chrome API，纯数据处理更高效 |
