# TODO — BookmarkGraph 飞轮迭代计划

> 基于 PRD.md 和 REQUIREMENTS-BOOKMARK.md 规划
> 50 轮迭代: R43 - R92
> 最后更新: 2026-05-03

---

## Phase A: BookmarkGraph MVP (R43-R52) — 10 轮

### 核心功能：书签采集 → 图谱构建 → 可视化 → 搜索

- [x] **R43: 书签采集器 BookmarkCollector** — `lib/bookmark-collector.js`
  - 递归读取 Chrome 书签树
  - 标准化书签对象 (id, title, url, folderPath, dateAdded)
  - 处理空书签/重复书签/特殊字符
  - 测试: 18 用例 ✅
  - 复杂度: Medium

- [x] **R44: 书签索引器 BookmarkIndexer** — `lib/bookmark-indexer.js`
  - 基于标题+URL+文件夹建立倒排索引
  - 支持中英文混合分词 (中文逐字 + bigram)
  - 多关键词 AND 逻辑搜索
  - 按文件夹/标签过滤 + 匹配度排序
  - 测试: 24 用例 ✅
  - 复杂度: Medium

- [x] **R45: 书签图谱引擎 BookmarkGraphEngine** — `lib/bookmark-graph.js`
  - 混合相似度算法 (Jaccard标题 + 域名匹配 + 文件夹重叠)
  - 倒排索引优化候选对生成 (避免 O(n²))
  - 生成图谱数据 {nodes, edges}，支持聚类
  - 测试: 22 用例 ✅
  - 复杂度: Complex

- [x] **R46: 图谱可视化 BookmarkVisualizer** — `lib/bookmark-visualizer.js`
  - Canvas 力导向图渲染 (库仑斥力 + 弹簧引力 + 阻尼)
  - 缩放/拖拽/搜索高亮/点击回调
  - 节点颜色按 group 15 色方案, 大小按连接数缩放
  - 视口裁剪优化, requestAnimationFrame 驱动
  - 测试: 15 用例 ✅
  - 复杂度: Complex

- [x] **R47: 详情面板 BookmarkDetailPanel** — `lib/bookmark-detail-panel.js`
  - 点击节点显示详情 (标题/URL/文件夹/时间)
  - 显示相似书签列表 (Top-5)
  - 点击URL打开原网页 (chrome.tabs.create)
  - 标签编辑 (添加/删除/自动补全) + 状态标记 (unread/reading/read)
  - 操作回调 (onAction) + 异常安全
  - 测试: 22 用例 ✅
  - 复杂度: Medium

- [x] **R48: 相似推荐 BookmarkRecommender** — `lib/bookmark-recommender.js`
  - 基于图谱的 Top-K 相似推荐 (recommend)
  - 基于内容的即时推荐 (recommendByContent)
  - 推荐理由生成: 同域名/同文件夹/标题相似/混合
  - 测试: 15 用例 ✅
  - 复杂度: Medium

- [x] **R49: 书签搜索 BookmarkSearch** — `lib/bookmark-search.js`
  - 综合搜索: 索引关键词匹配 + 图谱相关性扩展
  - 条件过滤: 文件夹 / 标签 / 状态 / 域名
  - 搜索建议: 基于标签 + 热门搜索 + 书签标题
  - 200ms 防抖搜索建议
  - 多排序: relevance / date / title
  - 测试: 22 用例 ✅
  - 复杂度: Medium

- [x] **R50: 弹窗概览 BookmarkPopup** — `popup/bookmark-overview.js`
  - 显示书签总数/领域分布/最近添加/待读数量
  - 快速搜索入口 (实时过滤，中英文多关键词 AND)
  - "查看完整图谱"按钮 (打开选项页)
  - 点击书签打开原网页
  - 测试: 17 用例 ✅
  - 复杂度: Medium

- [x] **R51: 选项页集成 BookmarkOptionsPage** — `options/bookmark-panel.js`
  - 新增"书签图谱"标签页
  - 完整图谱 + 搜索 + 详情面板
  - 与现有标签页风格一致
  - 测试: 13 用例 ✅
  - 复杂度: Medium

- [x] **R52: BookmarkGraph MVP E2E 测试** — `tests/test-bookmark-graph-e2e.js`
  - 全模块集成测试 (Collector → Indexer → Graph → Search → Recommender)
  - 边界情况覆盖 (空书签/单书签/100+书签)
  - 性能基准测试 (100+ 书签 <200ms)
  - 测试: 14 用例 ✅
  - 复杂度: Medium

---

## Phase B: BookmarkGraph V1.0 (R53-R62) — 10 轮

### 增强功能：主题聚类 → 学习路径 → 标签管理 → 重复检测

- [x] **R53: 主题聚类 TopicClustering** — `lib/bookmark-clusterer.js`
  - 基于关键词/URL模式自动分类
  - 支持 15+ 技术领域 (前端/后端/DevOps/AI/数据库等)
  - 聚类结果可手动调整
  - 测试: 21 用例 ✅
  - 复杂度: Complex

- [x] **R54: 学习路径推荐 LearningPathFromBookmarks** — `lib/bookmark-learning-path.js`
  - 分析书签内容难度 (入门/进阶/高级)
  - 生成学习路径: 基础入门 → 实战练习 → 深入理解 → 生产实践
  - 标记已学/待学状态 + 进度统计
  - 复用 `lib/learning-path.js` 路径排序思路
  - 测试: 21 用例 ✅
  - 复杂度: Complex

- [x] **R55: 标签自动生成 AutoTagGeneration** — `lib/bookmark-tagger.js`
  - 基于标题/URL/文件夹生成标签
  - 每个书签 3-5 个标签
  - 标签去重/合并
  - 测试: 21 用例
  - 复杂度: Medium

- [x] **R56: 标签手动编辑 TagManualEditing** — `lib/bookmark-tag-editor.js`
  - 添加/删除/覆盖标签: `addTag()`, `removeTag()`, `setTags()`
  - 标签自动补全: `getAutocomplete(partial, limit)`
  - 批量编辑标签: `batchAddTag()`, `batchRemoveTag()`
  - 标签规范化: 小写、去空格、去特殊字符、最大 30 字符
  - 测试: 30 用例 ✅
  - 复杂度: Simple

- [x] **R57: 知识盲区检测 KnowledgeGapDetection** — `lib/bookmark-gap-detector.js`
  - 分析各领域书签数量分布（14 个技术领域）
  - 识别"热门但资料少"的领域，4 级覆盖度: well-covered / moderate / weak / gap
  - 推荐补充方向（盲区入门 + 关联领域，弱项进阶）
  - 支持聚类结果和标签频率两种数据源
  - 测试: 27 用例 ✅
  - 复杂度: Medium

- [x] **R58: 状态标记 BookmarkStatusMarking** — `lib/bookmark-status.js`
  - 三种状态: unread/reading/read（默认 unread）
  - 状态批量修改 (batchSetStatus / markAllAsRead)
  - 按状态过滤 (getByStatus)
  - 状态统计 (getStatusCounts)
  - 最近阅读 (getRecentlyRead)
  - 单调递增序保证排序稳定性
  - 测试: 19 用例 ✅
  - 复杂度: Simple

- [x] **R59: 文件夹分析 FolderAnalysis** — `lib/bookmark-folder-analyzer.js`
  - 统计各文件夹书签数量和分布
  - 识别低质量文件夹（过少/过多/空）
  - 建议整理方案（合并/拆分/删除）
  - 文件夹深度分析和树形结构
  - 质量评估 5 级: excellent/normal/underused/overcrowded/empty
  - 测试: 20 用例 ✅
  - 复杂度: Simple

- [x] **R60: 重复检测 BookmarkDedup** — `lib/bookmark-dedup.js`
  - URL 规范化去重 (移除协议/www/尾斜杠/跟踪参数)
  - 标题相似度去重 (Jaccard 系数, 可配置阈值, 默认 0.7)
  - findDuplicates() 综合检测 + suggestCleanup() 合并/删除建议
  - batchRemove() 批量清理重复书签
  - 测试: 36 用例 ✅
  - 复杂度: Medium

- [x] **R61: 数据导入导出 BookmarkImportExport** — `lib/bookmark-io.js`
  - `exportJSON()`: 导出完整图谱 (书签+聚类+标签+状态)
  - `exportCSV()`: 导出书签列表 (含表头, 中文路径)
  - `importFromChromeHTML(html)`: 解析 Chrome 书签 HTML
  - `importFromJSON(json)`: 从 JSON 导入完整图谱
  - `exportToFile(format)`: 导出 Blob ('json' | 'csv')
  - 进度回调: onProgress(phase, current, total)
  - 测试: 24 用例 ✅
  - 复杂度: Medium

- [x] **R62: BookmarkGraph V1.0 E2E 测试** — `tests/test-bookmark-v1-e2e.js`
  - 全模块集成测试 (Phase B: Clusterer, LearningPath, Tagger, TagEditor, GapDetector, Status, FolderAnalyzer, Dedup, ImportExport)
  - 模块间交互测试 (聚类→盲区、标签→搜索、去重→导出)
  - 空数据兼容 + 100+书签性能测试
  - 测试: 15 用例 ✅
  - 复杂度: Medium

---

## Phase C: BookmarkGraph V2.0 (R63-R72) — 10 轮

### 高级功能：链接检测 → 语义搜索 → AI 推荐 → 知识关联

- [x] **R63: 链接健康检查 LinkHealthCheck** — `lib/bookmark-link-checker.js`
  - 后台批量检测链接状态
  - 标记失效链接
  - 修复/删除建议
  - 测试: 8+ 用例
  - 复杂度: Medium

- [x] **R64: 书签内容预览 BookmarkContentPreview** — `lib/bookmark-preview.js`
  - extractUrlInfo / generateTextPreview / generateHtmlPreview / generateSnapshotPreview
  - _truncate (中文字符数截断) / _escapeHtml (XSS 安全转义)
  - 纯数据模块，无状态，无 I/O
  - 测试: 31 用例 ✅
  - 复杂度: Complex

- [x] **R65: 语义搜索 BookmarkSemanticSearch** — `lib/bookmark-semantic-search.js`
  - 复用 `lib/embedding-engine.js` TF-IDF 核心算法
  - 自然语言查询: `semanticSearch(query, opts)`
  - 语义相似度排序: TF-IDF 余弦相似度
  - 混合搜索: `hybridSearch(query, opts)` — 关键词 0.6 + 语义 0.4
  - 以文搜文: `findSimilar(bookmarkId, limit)`
  - 增量更新: `addBookmark` / `removeBookmark`
  - 缓存管理: `invalidateCache(bookmarkId?)`
  - 书签域字段权重: title 3.0 / tags 2.0 / contentPreview 1.5 / folderPath 1.0 / url 0.5
  - 测试: 35 用例 ✅
  - 复杂度: Medium

- [x] **R66: 知识关联 BookmarkKnowledgeCorrelation** — `lib/bookmark-knowledge-link.js`
  - 多维关联: URL 精确匹配 (0.4) + 标题 TF-IDF 语义相似 (0.3) + 标签 Jaccard 重叠 (0.3)
  - 双向查询: `getRelatedEntries(bookmarkId)` + `getRelatedBookmarks(entryId)`
  - 关联强度可视化: `getCorrelationStrength()` 返回 URL/标题/标签 分项得分
  - 关联建议: `suggestCorrelations()` 推荐未关联但高相似度对
  - 增量更新: `addEntry()` / `removeEntry()`
  - 关联摘要: `getCorrelationSummary(bookmarkId)` 返回书签关联概览
  - 测试: 30 用例 ✅
  - 复杂度: Complex

- [x] **R67: 学习进度追踪 BookmarkLearningProgress**
  - 记录学习时间
  - 进度百分比
  - 学习统计图表
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R68: AI 推荐 BookmarkAIRecommendations** — `lib/bookmark-ai-recommender.js`
  - 复用 `lib/ai-client.js`
  - 分析收藏模式
  - 推荐相关领域资料
  - 推荐理由说明
  - 测试: 36 用例 ✅
  - 复杂度: Complex

- [x] **R69: 统计仪表盘 BookmarkStatistics** — `lib/bookmark-stats.js`
  - 收藏趋势图
  - 领域分布饼图
  - 活跃度热力图
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R70: 暗色主题 BookmarkDarkTheme** — `lib/bookmark-dark-theme.js`
  - 三种模式: light/dark/system (matchMedia 检测)
  - 图谱节点/边颜色适配 (含 15 色分组明暗方案)
  - 面板暗色适配 (背景/文字/边框/输入框)
  - 18 个 CSS 变量，主题变更回调
  - 测试: 43 用例 ✅
  - 复杂度: Simple

- [x] **R71: 快捷键 BookmarkKeyboardShortcuts** — `lib/bookmark-keyboard-shortcuts.js`
  - 搜索: Ctrl+F
  - 缩放: +/=/−/0
  - 刷新: F5
  - 自定义绑定 (chrome.storage.sync) + 冲突检测
  - 回调驱动 on/off/dispatch 架构
  - 测试: 48 用例 ✅
  - 复杂度: Simple

- [x] **R72: BookmarkGraph V2.0 E2E 测试**
  - 全模块集成测试
  - 性能测试 (1000+ 书签)
  - 测试: 15+ 用例
  - 复杂度: Medium

---

## Phase D: 集成与打磨 (R73-R82) — 10 轮

### 集成：与 PageWise 核心功能联动

- [x] **R73: 书签-知识库联动 BookmarkKnowledgeIntegration** — `lib/bookmark-knowledge-integration.js`
  - 书签与 PageWise 知识库双向关联（编排层，桥接 R66 关联引擎）
  - 从知识库跳转到相关书签 (getBookmarksForEntry / buildEntryNavLinks)
  - 从书签跳转到相关知识 (getKnowledgeForBookmark / buildNavigationLinks)
  - 知识增强: enrichBookmark / enrichEntry 附加跨域上下文
  - 仪表盘: getDashboard (Top 关联书签/建议/孤立节点)
  - 测试: 42 用例 ✅
  - 复杂度: Complex

- [x] **R74: 自动分类 BookmarkAutoCategorize**
  - 新增书签自动分类
  - 基于历史分类学习
  - 分类规则可配置
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R75: 智能集合 BookmarkSmartCollections** — `lib/bookmark-smart-collections.js`
  - 6 种规则类型: tags/domain/folder/status/dateRange/category
  - 多规则 AND 组合
  - 内置集合: 未读/正在阅读/最近添加
  - 自定义集合 CRUD + 序列化/反序列化
  - 书签增删后集合自动更新
  - 测试: 40 用例 ✅
  - 复杂度: Medium

- [x] **R76: 书签分享 BookmarkSharing** — `lib/bookmark-sharing.js`
  - 创建可分享集合 (createShareableCollection)
  - 多格式导出: JSON / 文本 / Base64 / data: URI
  - 隐私控制: stripPersonalData / anonymizeUrls / includeFields
  - 导入分享数据: 支持 JSON / Base64 / data: URI 三种格式
  - 进度回调支持
  - 测试: 60 用例 ✅
  - 复杂度: Medium

- [x] **R77: 高级分析 BookmarkAdvancedAnalytics**
  - 收藏模式分析
  - 学习效率分析
  - 知识覆盖度分析
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R78: 性能优化 BookmarkPerformanceOptimization** — `lib/bookmark-performance.js`
  - 分批处理引擎: buildGraphBatched / buildIndexBatched / computeSimilarityBatched
  - LRU 缓存淘汰: trimCache (Map 插入序实现)
  - 视口裁剪: getVisibleNodes (padding 扩展)
  - Worker 卸载: createWorker / runInWorker (主线程降级)
  - 性能统计: getPerformanceStats (buildTime/cacheHits/totalProcessed)
  - 测试: 20 用例 ✅
  - 复杂度: Complex

- [x] **R79: 无障碍 BookmarkAccessibility**
  - 键盘导航
  - 屏幕阅读器支持
  - ARIA 标签
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R80: 国际化 BookmarkI18n** — `lib/bookmark-i18n.js`
  - 42+ i18n key 覆盖所有用户可见字符串
  - 中英文语言包 (zh-CN / en-US)
  - 语言偏好持久化 (chrome.storage.sync)
  - 日期格式本地化
  - 状态标签本地化
  - 新增语言只需传入翻译文件
  - 测试: 37 用例 ✅
  - 复杂度: Simple

- [x] **R81: 引导向导 BookmarkOnboarding**
  - 首次使用引导
  - 功能介绍
  - 隐私说明
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R82: Phase D 集成测试**
  - 全功能集成测试
  - 端到端用户流程测试
  - 测试: 15+ 用例
  - 复杂度: Medium

---

## Phase E: 发布准备 (R83-R92) — 10 轮

### 打磨：安全 → 性能 → 文档 → 发布

- [x] **R83: Chrome Web Store 准备 BookmarkStorePrep**
  - 更新 manifest.json
  - 更新 _locales
  - 截图准备
  - 测试: 6+ 用例
  - 复杂度: Medium

- [x] **R84: 安全审计 BookmarkSecurityAudit**
  - XSS 防护
  - 数据隔离
  - 权限最小化
  - 测试: 8+ 用例
  - 复杂度: Medium

- [x] **R85: 性能基准测试 BookmarkPerformanceBenchmark**
  - 采集性能基准
  - 渲染性能基准
  - 搜索性能基准
  - 测试: 8+ 用例
  - 复杂度: Medium

- [x] **R86: 错误处理 BookmarkErrorHandler** — `lib/bookmark-error-handler.js`
  - 错误分类: `classifyError()` — 5 类 (network/permission/storage/validation/unknown)
  - 优雅降级: `handleBookmarkError()` — 结构化错误响应 + 恢复建议
  - 错误边界: `createErrorBoundary()` — 异步函数包装 + fallback
  - 结构化日志: `logError()` — 不写 console，返回结构化对象
  - 纯函数设计，零副作用，不依赖 DOM / Chrome API
  - 测试: 48 用例 ✅
  - 复杂度: Medium

- [x] **R87: 用户文档 BookmarkDocumentation**
  - 使用指南
  - API 文档
  - 常见问题
  - 测试: 4+ 用例
  - 复杂度: Simple

- [x] **R88: 数据迁移 BookmarkMigration** — `lib/bookmark-migration.js`
  - 版本升级迁移 (v1→v2: clusters→collections, statuses→readingProgress, 新增 metadata)
  - 数据格式兼容 (checkDataCompatibility: v1/v2 结构验证)
  - 迁移路径规划 (getMigrationPath) + 迁移报告 (createMigrationReport)
  - 批量迁移 (batchMigrate) + 迁移验证 (validateMigration)
  - 测试: 92 用例 ✅
  - 复杂度: Medium

- [ ] **R89: 备份恢复 BookmarkBackupRestore**
  - 书签数据备份
  - 一键恢复
  - 自动备份策略
  - 测试: 6+ 用例
  - 复杂度: Medium

- [ ] **R90: UI/UX 最终打磨 BookmarkFinalPolish**
  - 动画优化
  - 布局微调
  - 交互细节
  - 测试: 6+ 用例
  - 复杂度: Medium

- [ ] **R91: 发布候选版 BookmarkReleaseCandidate**
  - RC 版本测试
  - Bug 修复
  - 性能回归测试
  - 测试: 10+ 用例
  - 复杂度: Medium

- [ ] **R92: BookmarkGraph v3.0.0 正式发布**
  - 最终测试
  - 版本号更新
  - 发布说明
  - 测试: 全量回归
  - 复杂度: Medium

---

## 统计

| Phase | 轮次 | 预计新增模块 | 预计新增测试 |
|-------|------|------------|------------|
| A: MVP | R43-R52 | 9 个 | 90+ |
| B: V1.0 | R53-R62 | 8 个 | 70+ |
| C: V2.0 | R63-R72 | 7 个 | 70+ |
| D: 集成 | R73-R82 | 6 个 | 70+ |
| E: 发布 | R83-R92 | 4 个 | 60+ |
| **总计** | **50 轮** | **34 个** | **360+** |

---

## ✅ 已完成

### 之前迭代 (R1-R42)
- [x] R1-R42: 见 ROADMAP.md

## Phase F: 最终发布 (R93-R102) — 10 轮
- [ ] **R93: 性能优化 BookmarkPerformanceOpt** — 搜索索引预构建/懒加载/虚拟滚动
- [ ] **R94: 数据同步 BookmarkSync** — Chrome Sync API/跨设备同步/冲突解决
- [ ] **R95: 批量操作 BookmarkBatch** — 批量删除/批量标签/批量移动/批量导出
- [ ] **R96: 搜索历史 BookmarkSearchHistory** — 搜索记录/热门搜索/搜索建议/清除历史
- [ ] **R97: 收藏夹导入导出 BookmarkImportExport** — Chrome书签导入/HTML导出/JSON备份/CSV导出
- [ ] **R98: 通知系统 BookmarkNotifications** — 书签过期提醒/重复检测通知/更新提醒
- [ ] **R99: 高级标签 BookmarkAdvancedTags** — 标签颜色/标签层级/标签统计/自动标签
- [ ] **R100: 书签分析 BookmarkAnalytics** — 访问统计/收藏趋势/域名分布/活跃度图表
- [ ] **R101: 最终集成测试 BookmarkFinalIntegration** — 全模块端到端测试/Chrome Web Store提交检查
- [ ] **R102: 版本发布 BookmarkReleaseFinal** — v1.0.0版本号/CHANGELOG/Release Notes/GitHub Release
