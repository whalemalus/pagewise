# DESIGN — Iteration #3 (R77: BookmarkAdvancedAnalytics)

## 架构

`BookmarkAdvancedAnalytics` 是一个纯数据编排模块，组合现有模块的输出，计算高级分析指标。

```
输入: bookmarks[], options{clusters?, tags?, learningRecords?, statusMap?}
                ↓
┌───────────────────────────────────────────────────┐
│         BookmarkAdvancedAnalytics                  │
│                                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Collection   │  │ Learning     │  │ Knowledge │ │
│  │ Patterns     │  │ Efficiency   │  │ Coverage  │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                │                │        │
│  内部方法:                │                │        │
│  _analyzeTimePattern     │                │        │
│  _detectBursts           │                │        │
│  _analyzeDomainShift     │                │        │
│                          │                │        │
│  _calcEfficiencyScore    │                │        │
│  _analyzeDomainProgress  │                │        │
│                          │                │        │
│  _assessCoverage         │                │        │
│  _analyzeDepthBreadth    │                │        │
│  _detectKnowledgeGaps    │                │        │
└───────────────────────────────────────────────────┘
                ↓
         generateReport() → 完整分析报告
```

## 公开 API

### 构造函数
```javascript
constructor(bookmarks, options)
```
- `bookmarks`: Array — 书签数组
- `options.clusters`: Map — 聚类结果 (可选)
- `options.tags`: Map — 标签频率 (可选)
- `options.statusMap`: Map<string, string> — bookmarkId → 'unread'|'reading'|'read' (可选)
- `options.learningStats`: Object — 学习统计 {totalTime, studiedBookmarks, ...} (可选)

### 公开方法

| 方法 | 返回 | 说明 |
|------|------|------|
| `getCollectionPatterns()` | `{timePattern, bursts, domainTrend, summary}` | 收藏模式分析 |
| `getLearningEfficiency()` | `{score, readRatio, domainProgress, neglected}` | 学习效率分析 |
| `getKnowledgeCoverage()` | `{coverage, depth, breadth, gaps, overview}` | 知识覆盖度分析 |
| `generateReport()` | 完整报告对象 | 整合三个维度 |

## 内部方法

### 收藏模式
- `_analyzeTimePattern()`: 按 weekday/weekend + morning/afternoon/evening 分桶
- `_detectBursts(threshold)`: 找到日均 2 倍以上的爆发日
- `_analyzeDomainShift()`: 按月统计领域分布变化

### 学习效率
- `_calcEfficiencyScore()`: 综合评分 (readRatio 40% + domainCoverage 30% + consistency 30%)
- `_analyzeDomainProgress()`: 各领域已读/未读比
- `_findNeglected(threshold)`: 识别收藏但未学的领域

### 知识覆盖
- `_assessCoverage()`: 基于聚类/标签/文件夹的覆盖度
- `_analyzeDepthBreadth()`: 深度 = 最大领域占比, 广度 = 领域分布均匀度 (Shannon entropy)
- `_detectKnowledgeGaps()`: 有高级内容但缺基础的领域

## 设计决策

1. **组合而非继承** — 不继承 BookmarkStatistics 等模块，而是在构造函数中接收数据，内部计算
2. **无状态** — 不持有 IndexedDB 连接，所有数据通过构造函数传入
3. **可选依赖** — clusters, tags, statusMap, learningStats 均为可选，缺失时降级处理
4. **Shannon entropy** — 用于计算广度，值越高表示分布越均匀

## 文件

- `lib/bookmark-advanced-analytics.js` — 主模块 (~300 行)
- `tests/test-bookmark-advanced-analytics.js` — 测试 (~400 行, 30+ 用例)
