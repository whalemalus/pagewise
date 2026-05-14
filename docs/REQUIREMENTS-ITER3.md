# 需求文档 — R85: 性能基准测试 BookmarkPerformanceBenchmark

> 迭代: R3 (2026-05-14)
> 任务: R85: 性能基准测试 BookmarkPerformanceBenchmark
> 复杂度: Medium

## 用户故事

作为 PageWise 用户，我希望了解书签操作（搜索、排序、去重）在不同数据量下的性能表现，以便评估扩展在大规模书签场景下的可用性。

## 验收标准

1. ✅ `benchmarkSearch(bookmarks, query, iterations)` — 搜索基准测试，返回 avg/min/max/p50/p95/p99 统计
2. ✅ `benchmarkSort(bookmarks, iterations)` — 排序基准测试（按 dateAdded 降序）
3. ✅ `benchmarkDedup(bookmarks, iterations)` — 去重基准测试（URL 精确匹配）
4. ✅ `benchmarkMemory(bookmarks)` — 内存估算（字符串/数组/对象开销模型）
5. ✅ 边界处理: 空数组、null 输入、iterations=0 均返回全零结果
6. ✅ 统计正确性: min ≤ p50 ≤ p95 ≤ p99 ≤ max（百分位单调递增）
7. ✅ 大规模场景: 支持 100/1000/10000 书签基准测试

## 技术约束

- 纯 ES Module，不引入外部基准测试库
- 使用 `performance.now()` 高精度计时
- 依赖 `BookmarkIndexer`（搜索）和 `BookmarkDedup`（去重）
- 内存估算为简化模型（非 V8 heap 快照）

## 依赖关系

- `lib/bookmark-indexer.js` — 搜索索引
- `lib/bookmark-dedup.js` — URL 去重
