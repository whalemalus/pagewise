# 需求文档 — R72: BookmarkGraph V2.0 E2E 测试

> **日期**: 2026-05-07
> **迭代**: R72 (BookmarkGraph V2.0)
> **类型**: 测试需求
> **依赖**: R063–R071 (V2.0 全部功能模块已实现)

---

## 1. 用户故事

**作为**一个收藏了大量技术书签的开发者，**我希望** BookmarkGraph V2.0 的所有高级功能（链接健康检查、语义搜索、知识关联、学习进度追踪、AI 推荐、统计仪表盘、暗色主题、快捷键）经过端到端测试验证，**以便**在使用图谱管理书签时确保功能可靠、数据准确、性能达标。

**作为**开发者，**我希望** 通过自动化 E2E 测试覆盖 V2.0 模块间的集成链路（如"语义搜索→知识关联→AI 推荐"全链路），**以便**在后续迭代中放心重构而不会引入回归缺陷。

---

## 2. 验收标准

### AC-1: 全模块覆盖
- V2.0 全部 9 个模块均纳入 E2E 测试范围（对应 R063–R071）：
  - R063: BookmarkLinkChecker（链接健康检查）
  - R064: BookmarkContentPreview（内容预览）
  - R065: BookmarkSemanticSearch（语义搜索）
  - R066: BookmarkKnowledgeCorrelation（知识关联）
  - R067: BookmarkLearningProgress（学习进度追踪）
  - R068: BookmarkAIRecommendations（AI 推荐）
  - R069: BookmarkStatistics（统计仪表盘）
  - R070: BookmarkDarkTheme（暗色主题）
  - R071: BookmarkKeyboardShortcuts（快捷键）
- 每个模块 **至少 8 个** 测试用例（总计 ≥ 72 个测试用例）

### AC-2: 集成测试覆盖模块间交互
- 至少覆盖以下 3 条关键集成链路：
  1. **语义搜索 + 知识关联**: 构建语义索引 → 搜索 → 关联知识条目 → 验证双向跳转数据
  2. **AI 推荐 + 统计 + 聚类**: 书签统计 → 聚类结果 → AI 推荐画像分析 → 降级推荐验证
  3. **全管线端到端**: 采集 → 索引 → 图谱 → 语义搜索 → 知识关联 → 学习进度 → 统计汇总
- 集成测试验证数据在模块间正确流转，无丢失或格式错误

### AC-3: 性能测试达标
- 1000 书签图谱构建时间 < 10 秒
- 1000 书签语义索引构建时间 < 5 秒
- 1000 书签统计计算时间 < 1 秒
- 知识关联索引（100 书签 × 100 条目）构建时间 < 5 秒

### AC-4: 边界与错误处理
- 每个模块的空输入（空数组 / null / undefined）不抛异常，返回安全默认值
- BookmarkLinkChecker 处理：无效 URL、非 HTTP 协议（chrome:// 等）、超时、并发上限
- BookmarkLearningProgress 处理：重复开始会话（幂等）、无活跃会话时结束（抛 Error）、会话超时自动结束
- BookmarkAIRecommendations 处理：AI 不可用时降级到规则推荐、缓存过期后刷新、JSON 解析失败

### AC-5: 全部测试通过
- `node --test tests/test-bookmark-graph-v2-e2e.js` 全部通过
- 不引入任何外部测试依赖（零 npm 依赖）
- 不修改现有 MVP E2E 测试 (`test-bookmark-graph-e2e.js`)，两个测试文件独立运行

---

## 3. 技术约束

### 3.1 测试基础设施
- **测试框架**: Node.js 内置 `node:test`（`describe`, `it`, `beforeEach`）
- **断言库**: `node:assert/strict`
- **Mock 策略**:
  - Chrome API: 复用 `tests/helpers/setup.js` 的 `installChromeMock()` / `resetChromeMock()`
  - IndexedDB: 复用 `tests/helpers/indexeddb-mock.js` 的 mock
  - `fetch` API: 测试 `BookmarkLinkChecker` 时需 mock `globalThis.fetch`，模拟 alive/dead/redirect/timeout 响应
  - AIClient: 测试 `BookmarkAIRecommendations` 时需注入 mock aiClient（返回预设 JSON 响应或抛异常触发降级）
- **无浏览器环境**: 所有测试在 Node.js 环境运行，不使用 Puppeteer / Playwright

### 3.2 被测模块清单与关键 API

| 模块 | 文件 | 关键测试 API |
|------|------|-------------|
| BookmarkLinkChecker | `lib/bookmark-link-checker.js` | `checkAll()`, `checkOne()`, `cancel()`, `getReport()`, `getDeadLinks()` |
| BookmarkContentPreview | `lib/bookmark-preview.js` | `generateTextPreview()`, `generateHtmlPreview()`, `generateSnapshotPreview()`, `extractUrlInfo()` |
| BookmarkSemanticSearch | `lib/bookmark-semantic-search.js` | `buildIndex()`, `semanticSearch()`, `hybridSearch()`, `findSimilar()`, `addBookmark()`, `removeBookmark()`, `invalidateCache()` |
| BookmarkKnowledgeCorrelation | `lib/bookmark-knowledge-link.js` | `buildIndex()`, `getRelatedEntries()`, `getRelatedBookmarks()`, `getCorrelationStrength()`, `suggestCorrelations()`, `addEntry()`, `removeEntry()` |
| BookmarkLearningProgress | `lib/bookmark-learning-progress.js` | `init()`, `startSession()`, `endSession()`, `getBookmarkProgress()`, `getOverallProgress()`, `getStats()`, `getDailyStats()`, `exportData()`, `importData()` |
| BookmarkAIRecommendations | `lib/bookmark-ai-recommender.js` | `analyzeProfile()`, `getRecommendations()`, `clearCache()`, `getLastSource()` |
| BookmarkStatistics | `lib/bookmark-stats.js` | `getTrend()`, `getDistribution()`, `getHeatmap()`, `getSummary()` |
| BookmarkDarkTheme | `lib/bookmark-dark-theme.js` | `getThemeColors()`, `getGraphColors()`, `getGroupColors()`, `generateCssVariables()`, `setMode()`, `getMode()`, `toggle()`, `onChange()` |
| BookmarkKeyboardShortcuts | `lib/bookmark-keyboard-shortcuts.js` | `register()`, `unregister()`, `handleKeyboardEvent()`, `getBindings()`, `setCustomBinding()`, `resetBinding()`, `loadFromStorage()`, `saveToStorage()`, `enable()`, `disable()` |

### 3.3 模拟数据要求
- 标准化书签数据: `{ id, title, url, folderPath[], tags[], status, dateAdded, contentPreview }`
- 标准化知识条目: `{ id, title, question, answer, summary, sourceUrl, tags[] }`
- 至少准备 **20 条** 书签 + **10 条** 知识条目作为共享 fixture
- 覆盖多域名、多文件夹、多标签的分布，以测试聚类和关联

### 3.4 代码规范
- 纯 ES Module（`import`/`export`）
- 不引入 `node_modules` 依赖
- 不使用任何 DOM API
- 文件命名: `tests/test-bookmark-graph-v2-e2e.js`

---

## 4. 依赖关系

### 4.1 上游依赖（已实现）
| 需求 | 模块 | 状态 |
|------|------|------|
| R043 | BookmarkCollector | ✅ 已实现 |
| R044 | BookmarkIndexer | ✅ 已实现 |
| R045 | BookmarkGraphEngine | ✅ 已实现 |
| R048 | BookmarkRecommender | ✅ 已实现 |
| R049 | BookmarkSearch | ✅ 已实现 |
| R047 | BookmarkDetailPanel | ✅ 已实现 |
| R063 | BookmarkLinkChecker | ✅ 已实现 |
| R064 | BookmarkContentPreview | ✅ 已实现 |
| R065 | BookmarkSemanticSearch | ✅ 已实现 |
| R066 | BookmarkKnowledgeCorrelation | ✅ 已实现 |
| R067 | BookmarkLearningProgress | ✅ 已实现 |
| R068 | BookmarkAIRecommendations | ✅ 已实现 |
| R069 | BookmarkStatistics | ✅ 已实现 |
| R070 | BookmarkDarkTheme | ✅ 已实现 |
| R071 | BookmarkKeyboardShortcuts | ✅ 已实现 |

### 4.2 基础设施依赖
| 依赖 | 文件 | 用途 |
|------|------|------|
| Chrome Mock | `tests/helpers/chrome-mock.js` | 模拟 chrome.bookmarks API |
| IndexedDB Mock | `tests/helpers/indexeddb-mock.js` | 模拟 IndexedDB (LearningProgress 测试) |
| EmbeddingEngine | `lib/embedding-engine.js` | SemanticSearch & KnowledgeCorrelation 的 TF-IDF 引擎 |
| BookmarkLearningPath | `lib/bookmark-learning-path.js` | LearningProgress 的难度判定依赖 |

### 4.3 下游影响
- **不影响**: MVP E2E 测试 (`test-bookmark-graph-e2e.js`) — 两个测试文件独立
- **不影响**: 其他现有测试文件
- **输出**: 测试结果用于验证 V2.0 版本发布就绪度

### 4.4 阻塞风险
| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| IndexedDB mock 不支持 LearningProgress 的所有操作 | AC-1 覆盖率不足 | 需确认 `indexeddb-mock.js` 支持 `getAll()`, `index()`, `put()` |
| EmbeddingEngine 的 TF-IDF 在 Node.js 环境行为差异 | 语义搜索测试不准确 | 使用固定数据验证确定性输出 |
| AIClient mock 的 JSON 响应解析 | AI 推荐测试不稳定 | 准备多种 AI 响应 fixture（合法/非法/空） |

---

## 5. 成功信号

- `node --test tests/test-bookmark-graph-v2-e2e.js` 输出 **≥ 72 pass, 0 fail**
- 所有性能断言通过（1000 书签 < 10s 图谱构建等）
- 集成测试覆盖 3 条关键数据流路径
- 边界条件测试覆盖空输入、异常输入

## 6. 失败信号

- 任何模块测试用例 < 8 个
- 集成测试缺失（仅有孤立的单元级 E2E）
- 引入 `node_modules` 依赖
- 现有 MVP 测试回归 (`test-bookmark-graph-e2e.js` 变红)

---

## 7. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-05-07 | 初始创建：R72 BookmarkGraph V2.0 E2E 测试需求 |
