# REQUIREMENTS — Iteration #3 (R69: BookmarkStatistics)

> **日期**: 2026-05-06 20:00 (UTC+8)
> **任务**: R69: 统计仪表盘 BookmarkStatistics
> **复杂度**: Medium (2 文件)

## 需求描述

新增 `lib/bookmark-stats.js` 模块，从书签数据中计算统计数据，为仪表盘提供数据源。纯数据计算，不依赖 DOM 或 Chrome API。

## 功能需求

### R69-1: 收藏趋势数据 (Trend)
- 输入: 书签数组
- 输出: 按日/周/月聚合的收藏数量时间序列
- 格式: `[{ period: '2026-01', count: 15 }, ...]`
- 支持参数: `granularity` ('day' | 'week' | 'month')

### R69-2: 领域分布数据 (Distribution)
- 输入: 书签数组
- 输出: 按文件夹路径第一级分组的书签数量
- 格式: `[{ name: '前端', count: 42, percentage: 35.5 }, ...]`
- 排序: 按 count 降序

### R69-3: 活跃度热力图数据 (Heatmap)
- 输入: 书签数组
- 输出: 按星期×时段的二维矩阵 (7天 × 24时段)
- 格式: `[[0,0,3,5,...], ...]` (7行 × 24列)
- 用途: 渲染 Canvas 热力图

### R69-4: 总览摘要 (Summary)
- 输入: 书签数组
- 输出: `{ total, uniqueDomains, topFolders, avgPerDay, streakDays }`
- 含: 总数、独立域名数、Top-5 文件夹、日均收藏数、连续收藏天数

## 验收标准

1. `BookmarkStatistics` 类可实例化，所有方法为纯函数（不修改输入）
2. 空书签数组 → 各方法返回空结构（不抛异常）
3. 测试用例 ≥ 8 个
4. 全部测试通过: `node --test tests/test-bookmark-stats.js`
5. 不引入新依赖（纯 JS 计算）

## 成功信号

- 所有方法对 1000 条书签的计算耗时 < 50ms
- 空输入/边界输入不抛异常
- 测试覆盖 4 个公开方法 + 边界情况

## 失败信号

- 任何方法抛出未捕获异常
- 测试数 < 6
- 引入 DOM/Chrome API 依赖
