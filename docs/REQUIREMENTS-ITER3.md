# REQUIREMENTS — Iteration #3 (R77: BookmarkAdvancedAnalytics)

## 用户故事

作为 PageWise 用户，我希望获得书签收藏行为的高级分析洞察，以便了解自己的收藏模式、学习效率和知识覆盖情况，从而优化学习策略。

## 功能需求

### 1. 收藏模式分析 (Collection Pattern Analysis)
- **FR-1.1**: 分析收藏的时间模式 — 工作日 vs 周末、上午 vs 下午 vs 晚间
- **FR-1.2**: 分析收藏的突发性 — 识别"收藏爆发期"（单日收藏 > 平均值 2 倍）
- **FR-1.3**: 分析收藏的领域偏好 — 按时间维度看领域偏好的变化趋势
- **FR-1.4**: 输出收藏模式摘要 — 包含活跃时段、偏好领域、收藏节奏

### 2. 学习效率分析 (Learning Efficiency Analysis)
- **FR-2.1**: 计算学习投入产出比 — 已学习书签数 / 总书签数
- **FR-2.2**: 分析各领域学习进度差异 — 哪些领域学得多、哪些被忽略
- **FR-2.3**: 识别"收藏但未学"的书签 — 占比和数量
- **FR-2.4**: 生成学习效率评分 — 0-100 分

### 3. 知识覆盖度分析 (Knowledge Coverage Analysis)
- **FR-3.1**: 综合覆盖度评估 — 结合聚类、标签、领域分布
- **FR-3.2**: 知识深度 vs 广度分析 — 深耕少数领域 vs 广泛涉猎
- **FR-3.3**: 识别知识断层 — 有高级内容但缺少基础的领域
- **FR-3.4**: 输出知识图谱概览 — 领域、深度、广度指标

## 验收标准

1. `getCollectionPatterns()` 返回时间模式、突发期、领域偏好的分析结果
2. `getLearningEfficiency()` 返回效率评分和各维度分析
3. `getKnowledgeCoverage()` 返回覆盖度、深度/广度、断层检测结果
4. `generateReport()` 返回完整分析报告（整合上述三个维度）
5. 空数据不报错，返回合理的零值
6. 单元测试 ≥ 30 用例，全部通过

## 技术约束

- 纯 ES Module，不依赖 DOM 或 Chrome API
- 复用现有模块: BookmarkStatistics, BookmarkLearningProgress, BookmarkGapDetector, BookmarkClusterer
- 无状态模块（构造函数接收数据，不持有 IndexedDB 连接）
- 遵循项目代码规范: JSDoc、无分号、camelCase

## 依赖关系

- `lib/bookmark-stats.js` — BookmarkStatistics (趋势、分布、热力图)
- `lib/bookmark-gap-detector.js` — BookmarkGapDetector (领域覆盖度)
- `lib/bookmark-clusterer.js` — BookmarkClusterer (主题聚类)
- `lib/bookmark-learning-progress.js` — BookmarkLearningProgress (学习进度，可选)
- `lib/bookmark-status.js` — BookmarkStatus (已读/未读状态)

## 复杂度: Medium

## 测试: 30+ 用例
