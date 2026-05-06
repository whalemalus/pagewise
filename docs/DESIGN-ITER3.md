# DESIGN — Iteration #3 (R69: BookmarkStatistics)

> **日期**: 2026-05-06 20:00 (UTC+8)
> **任务**: R69: 统计仪表盘 BookmarkStatistics

## 架构概述

纯数据计算模块，输入书签数组，输出结构化统计数据。遵循现有 BookmarkGraph 模块模式（ES Module, JSDoc, 无外部依赖）。

## 类设计

```
BookmarkStatistics
├── getTrend(bookmarks, granularity?)    → [{period, count}]
├── getDistribution(bookmarks)           → [{name, count, percentage}]
├── getHeatmap(bookmarks)                → number[7][24]
└── getSummary(bookmarks)                → {total, uniqueDomains, topFolders, avgPerDay, streakDays}
```

## 数据流

```
Chrome Bookmark Tree
    ↓ BookmarkCollector.collect()
[{id, title, url, folderPath, dateAdded}]
    ↓ BookmarkStatistics.getTrend/getDistribution/getHeatmap/getSummary
结构化统计数据
    ↓ UI 层 (future: BookmarkStatsPanel)
Canvas 图表渲染
```

## 设计决策

| ID | 决策 | 原因 |
|----|------|------|
| D001 | 纯函数设计，不维护内部状态 | 统计是无副作用的计算，每次传入书签数组即可 |
| D002 | folderPath[0] 作为领域分类 | 复用现有书签数据结构，第一级文件夹即"领域" |
| D003 | dateAdded 字段用于时间统计 | 书签对象已有 dateAdded (Unix ms)，无需额外字段 |
| D004 | heatmap 用 7×24 矩阵 | 行=星期(0=Sun..6=Sat)，列=小时(0..23)，标准热力图格式 |

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/bookmark-stats.js` | 新增 | BookmarkStatistics 类 |
| `tests/test-bookmark-stats.js` | 新增 | 8+ 测试用例 |

## 测试策略

- 每个公开方法至少 2 个测试（正常 + 边界）
- 空数组测试
- 单元素数组测试
- 大数据量性能测试（1000 条）
