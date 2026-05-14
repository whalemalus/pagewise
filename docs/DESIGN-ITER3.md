# 设计文档 — R85: 性能基准测试 BookmarkPerformanceBenchmark

> 迭代: R3 (2026-05-14)
> 任务: R85: 性能基准测试 BookmarkPerformanceBenchmark

## 架构决策

### 1. 单一类设计

采用 `BookmarkPerformanceBenchmark` 单一类，包含四个基准方法和内部统计工具方法。

```
BookmarkPerformanceBenchmark
├── benchmarkSearch(bookmarks, query, iterations)  → stats
├── benchmarkSort(bookmarks, iterations)            → stats
├── benchmarkDedup(bookmarks, iterations)           → stats
├── benchmarkMemory(bookmarks)                      → memoryReport
├── _computeStats(latencies)                        → stats
├── _percentile(sorted, p)                          → number
└── _emptyResult(iterations)                        → stats
```

### 2. 统计模型

返回统一的统计结构:
```javascript
{ avg, min, max, p50, p95, p99, iterations }
```

百分位数使用**线性插值**算法（与业界标准一致）。

### 3. 内存估算模型

简化估算（非 V8 heap 快照）:
- 字符串: 48 bytes 基础 + 2 bytes/char (UTF-16)
- 数组: 64 bytes + 8 bytes/元素 (引用)
- 对象: 96 bytes 基础开销
- 其他属性: 40 bytes/书签

### 4. 边界处理策略

所有公共方法对 `null`/空输入统一返回 `_emptyResult()`，不抛异常。

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `lib/bookmark-performance-benchmark.js` | 286 行，性能基准测试模块 |
| 新增 | `tests/test-bookmark-performance-benchmark.js` | 298 行，30 个测试用例 |

## 接口设计

```javascript
const bench = new BookmarkPerformanceBenchmark();

// 搜索基准
const searchStats = bench.benchmarkSearch(bookmarks, 'react', 100);
// → { avg: 1.23, min: 0.8, max: 2.1, p50: 1.1, p95: 1.9, p99: 2.05, iterations: 100 }

// 排序基准
const sortStats = bench.benchmarkSort(bookmarks, 100);

// 去重基准
const dedupStats = bench.benchmarkDedup(bookmarks, 100);

// 内存估算
const memReport = bench.benchmarkMemory(bookmarks);
// → { totalBytes: 123456, perBookmarkBytes: 617, count: 200, breakdown: {...} }
```
