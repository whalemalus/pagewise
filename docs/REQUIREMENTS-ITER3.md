# REQUIREMENTS — R82: Phase D 集成测试

> 迭代: R82
> 日期: 2026-05-13
> 复杂度: Complex (集成测试)
> 阶段: Phase D — 集成与打磨 (第 10/10 轮, 里程碑收尾)
> 测试文件: `tests/test-bookmark-phase-d-e2e.js`

---

## 1. 用户故事

作为 PageWise 开发者，Phase D (R73-R81) 已完成 9 个独立模块的单元测试，但我需要确认这些模块在**联合运行**时不产生冲突、数据流正确传递、跨模块边界行为符合预期。本次集成测试将模拟真实用户场景（从首次打开引导 → 采集书签 → 联动知识库 → 智能分类 → 分享导出 → 无障碍操作 → 多语言切换），覆盖 Phase D 全链路，确保整体质量达到 Phase E 发布准备的准入门槛。

---

## 2. 验收标准

### AC1: 跨模块数据流完整性（R73 × R75 × R77）
- **书签→知识库→智能集合→统计** 全链路集成：新书签入库后，通过 R73 知识库联动自动关联知识条目，R75 智能集合根据规则自动归入匹配集合，R77 统计面板实时反映新增数据
- 验证 `BookmarkKnowledgeIntegration` 的关联结果可被 `BookmarkSmartCollections` 正确消费
- 验证 `BookmarkStats` 统计数据在联动/分类/集合操作后均正确更新，无数据丢失或计数偏差
- 测试场景 ≥ 5 个（单书签联动、批量联动、无关联知识条目降级、集合规则冲突、统计快照一致性）

### AC2: 引导向导→设置→功能联调（R81 × R80 × R79）
- **首次安装流程**：R81 Onboarding 完成后，自动应用用户选择的主题（light/dark/system）和自动采集开关，R80 i18n 使用用户选择的语言，R79 Accessibility 的键盘导航和 ARIA 属性在引导流程中正确生效
- 验证 `BookmarkOnboarding` 的 `shouldShowOnboarding()` 与 `BookmarkI18n` 的语言初始化不产生时序冲突
- 验证引导完成后的设置（主题、语言、自动采集）持久化并在下次加载时恢复
- 测试场景 ≥ 4 个（中文引导流程、英文引导流程、引导中断恢复、设置回退触发重新引导）

### AC3: 分享导出→导入→数据一致性（R76 × R73 × R74）
- **分享链路**：通过 R76 导出包含知识库关联数据的分享集合，导入后验证 R73 知识关联关系保留完整，R74 自动分类重新生效
- 验证导出格式（JSON/HTML）包含所有 Phase D 新增字段（`knowledgeLinks`、`smartCollectionRules`、`status`、`i18nLocale`）
- 验证导入后的数据与导出前的数据在语义上等价（允许 ID 重分配）
- 测试场景 ≥ 3 个（纯书签导出导入、含知识关联导出导入、跨语言环境导入）

### AC4: 性能基准在集成场景下的表现（R78 × 全模块）
- 在 10,000 条书签数据集上运行 R73-R81 核心链路，验证：
  - 全链路初始化耗时 < 3 秒（含引导检查 + 书签采集 + 索引构建 + 知识关联 + 集合分类 + 统计计算）
  - 单条书签新增触发联动更新 < 100ms（含知识关联 + 集合匹配 + 统计增量）
  - 内存增量 < 50MB（相对于纯书签基线）
- 验证 R78 `BookmarkPerformanceOpt` 的优化策略（虚拟滚动、懒加载、批量处理）在集成场景下生效

### AC5: 错误隔离与降级传播（全模块）
- 模拟单模块故障（如知识库不可用、AI 服务降级、IndexedDB 写入失败），验证其他模块正常运行不崩溃
- 验证 R73 知识库联动失败时，书签核心功能（采集、搜索、分类、集合）不受影响
- 验证 R80 i18n 模块加载失败时，界面降级为英文默认值，不产生白屏
- 验证 R79 Accessibility 模块不可用时，基础功能（鼠标操作）正常工作
- 测试场景 ≥ 4 个（知识库故障、i18n 故障、Accessibility 故障、IndexedDB 故障降级）

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 测试框架 | `node:test` + `node:assert/strict`，与项目 3993 个现有测试一致 |
| 纯 ES Module | `import` 模式，不引入 CommonJS |
| 零外部依赖 | 不引入任何第三方 npm 包 |
| 无 DOM 依赖 | 纯逻辑层集成测试，Mock Chrome API 和 DOM 环境 |
| 可独立运行 | `node --test tests/test-bookmark-phase-d-e2e.js` 单文件执行 |
| 测试数据规模 | 小数据集（15 条，功能验证）+ 大数据集（10,000 条，性能验证）|
| Mock 策略 | Mock `chrome.storage`、`chrome.bookmarks`、`IndexedDB`、`AIClient`；不 Mock 模块内部逻辑 |
| 不产生副作用 | 测试不修改真实书签、不发送真实 API 请求、不写入持久化存储 |
| 测试用例数 | ≥ 30 个 `it()` 测试用例 |

---

## 4. 依赖关系

### 被测模块（Phase D R73-R81，全部 ✅ 已实现）

| 编号 | 模块 | 文件 | 单测用例数 | 集成关注点 |
|------|------|------|-----------|-----------|
| R73 | BookmarkKnowledgeIntegration | `lib/bookmark-knowledge-integration.js` | 42 | 与知识库的双向关联数据流 |
| R74 | BookmarkOrganize | `lib/bookmark-organize.js` | 0 | 自动分类在联动后的触发时机 |
| R75 | BookmarkSmartCollections | `lib/bookmark-smart-collections.js` | 40 | 规则匹配与知识关联的交叉 |
| R76 | BookmarkSharing | `lib/bookmark-sharing.js` | 60 | 导出格式是否包含全部 Phase D 字段 |
| R77 | BookmarkStats | `lib/bookmark-stats.js` | 19 | 统计数据在联动操作后的准确性 |
| R78 | BookmarkPerformanceOpt | `lib/bookmark-performance-opt.js` | 30 | 优化策略在集成场景的生效验证 |
| R79 | BookmarkAccessibility | `lib/bookmark-accessibility.js` | 49 | 键盘/ARIA 在跨模块场景的正确性 |
| R80 | BookmarkI18n | `lib/bookmark-i18n.js` | 37 | 多语言字符串在全模块的覆盖度 |
| R81 | BookmarkOnboarding | `lib/bookmark-onboarding.js` | 72 | 引导流程与各模块的初始化顺序 |

### 基础设施依赖（上游，✅ 全部已实现）

| 模块 | 文件 | 使用方式 |
|------|------|----------|
| BookmarkCollector (R43) | `lib/bookmark-collector.js` | 提供标准化书签数据源 |
| BookmarkIndexer (R44) | `lib/bookmark-indexer.js` | 提供倒排索引搜索能力 |
| BookmarkGraphEngine (R45) | `lib/bookmark-graph.js` | 提供图谱关联网络 |
| BookmarkClusterer (R53) | `lib/bookmark-clusterer.js` | 提供主题聚类数据 |
| BookmarkKnowledgeLink (R66) | `lib/bookmark-knowledge-link.js` | 提供书签-知识条目关联 |
| KnowledgeBase | `lib/knowledge-base.js` | 提供知识库存储后端 |
| AIClient | `lib/ai-client.js` | Mock 注入，验证 AI 调用链路 |

### 输出产物

| 文件 | 操作 | 说明 |
|------|------|------|
| `tests/test-bookmark-phase-d-e2e.js` | **新建** | Phase D 集成测试（≥ 30 用例） |
| `docs/CHANGELOG.md` | **修改** | 新增 R82 条目 |
| `docs/TODO.md` | **修改** | 标记 R82 状态为 ✅ |
| `docs/ISSUES.md` | **可能修改** | 若发现跨模块 Bug 则记录 |

### 集成测试矩阵

```
         R73  R74  R75  R76  R77  R78  R79  R80  R81
R73  联动  ·    ✓    ✓    ✓    ✓    ·    ·    ·    ·
R74  分类  ✓    ·    ✓    ·    ✓    ·    ·    ·    ·
R75  集合  ✓    ✓    ·    ✓    ✓    ·    ·    ·    ·
R76  分享  ✓    ✓    ✓    ·    ·    ·    ·    ·    ·
R77  统计  ✓    ✓    ✓    ✓    ·    ✓    ·    ·    ·
R78  性能  ✓    ✓    ✓    ✓    ✓    ·    ·    ·    ·
R79  无障  ·    ·    ·    ·    ·    ·    ·    ✓    ✓
R80  国际  ·    ·    ·    ·    ·    ·    ✓    ·    ✓
R81  引导  ·    ·    ·    ·    ·    ·    ✓    ✓    ·
```

> ✓ = 有直接集成测试场景；· = 无直接交互或仅通过基础层间接关联

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-13 | R82 | 初始创建 — Phase D 集成测试需求文档 |
