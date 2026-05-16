# ROADMAP — 智阅 PageWise

> 项目路线图，每月更新
> 最后更新: 2026-05-16

---

## 📍 当前状态

| 指标 | 数值 |
|------|------|
| 版本 | v3.0.0 |
| 迭代轮次 | R102 |
| 测试总数 | 5857 (pass 5857, fail 0) |
| 测试套件 | 1315 |
| 测试文件 | 201 |
| 核心代码 | ~48,855 行 (lib/), 119 模块 |
| 测试代码 | ~70,446 行 (tests/) |
| Bookmark 模块 | 59 个 (lib/) |
| Bookmark 测试 | 65 个 (tests/) |
| CI/CD | ✅ GitHub Actions (lint + test + release) |

---

## ✅ 已完成里程碑

### v3.0.0 — BookmarkGraph v3.0.0 里程碑 (2026-05-16)

经过 102 轮飞轮迭代，全面完成书签知识图谱系统、深度测试、兼容性验证与可靠性保障。

#### 书签知识图谱核心 (R43-R74)
- [x] BookmarkCollector — 书签采集器 (R43)
- [x] BookmarkIndexer — 倒排索引搜索 (R44)
- [x] BookmarkGraphEngine — 图谱构建引擎 (R45)
- [x] BookmarkVisualizer — Canvas 力导向图 (R46)
- [x] BookmarkDetailPanel — 详情面板 (R47)
- [x] BookmarkRecommender — 相似推荐 (R48)
- [x] BookmarkSearch — 综合搜索 (R49)
- [x] BookmarkPopup — 弹窗概览 (R50)
- [x] BookmarkOptionsPage — 选项页图谱标签 (R51)
- [x] BookmarkGraph MVP E2E 测试 (R52)
- [x] BookmarkClusterer — 自动聚类 (R53)
- [x] BookmarkStatusManager — 状态管理 (R54)
- [x] BookmarkTagger — 标签系统 (R55)
- [x] BookmarkDedup — 重复检测 (R56)
- [x] BookmarkFolderAnalyzer — 文件夹分析 (R57)
- [x] BookmarkGapDetector — 知识空白检测 (R58)
- [x] BookmarkImportExport — 导入导出 (R59)
- [x] BookmarkTagEditor — 标签编辑器 (R60)
- [x] BookmarkLearningPath — 学习路径 (R61)
- [x] BookmarkLinkChecker — 链接健康检查 (R63)
- [x] BookmarkContentPreview — 书签内容预览 (R64)
- [x] BookmarkSemanticSearch — 语义搜索引擎 (R65)
- [x] BookmarkKnowledgeCorrelation — 知识关联 (R66)
- [x] BookmarkLearningProgress — 学习进度追踪 (R67)
- [x] BookmarkAIRecommendations — AI 智能推荐 (R68)
- [x] BookmarkStatistics — 统计仪表盘 (R69)
- [x] BookmarkDarkTheme — 暗色主题适配 (R70)
- [x] BookmarkKeyboardShortcuts — 快捷键系统 (R71)
- [x] BookmarkGraph V2.0 E2E 测试 (R72)
- [x] BookmarkKnowledgeIntegration — 书签-知识库联动 (R73)
- [x] BookmarkAutoCategorize — 自动分类引擎 (R74)

#### 书签高级功能 (R75-R102)
- [x] BookmarkSmartCollections — 智能集合 (R75)
- [x] BookmarkSharing — 书签分享 (R76)
- [x] BookmarkAdvancedAnalytics — 高级分析 (R77)
- [x] BookmarkPerformanceOptimization — 性能优化 (R78)
- [x] BookmarkI18n — 国际化 (R80)
- [x] BookmarkOnboarding — 引导向导 (R81)
- [x] BookmarkStorePrep — Chrome Web Store 准备 (R83)
- [x] BookmarkSecurityAudit — 安全审计 (R84)
- [x] BookmarkPerformanceBenchmark — 性能基准 (R85)
- [x] BookmarkErrorHandler — 错误处理 (R86)
- [x] BookmarkDocumentation — 用户文档 (R87)
- [x] BookmarkMigration — 数据迁移 (R88)
- [x] BookmarkBackup — 备份恢复 (R89)
- [x] BookmarkFinalPolish — UI/UX 打磨 (R90)
- [x] BookmarkSync — 多设备同步 (R93)
- [x] BookmarkBatch — 批量操作 (R95)
- [x] BookmarkSearchHistory — 搜索历史 (R96)
- [x] BookmarkScheduler — 定时任务 (R97)
- [x] BookmarkNotifications — 通知系统 (R98)
- [x] BookmarkAdvancedTags — 高级标签 (R99)
- [x] BookmarkAnalytics — 访问统计 (R100)
- [x] BookmarkDuplicateDetector — 重复检测 V2 (R102)

#### 基础设施
- [x] GitHub CI/CD — 自动化 lint + test + release
- [x] KnowledgePanel E2E 17 个失败测试修复
- [x] 5857 测试全部通过 (100%)

### v2.3.0 — BookmarkGraph 功能完善 (2026-05-05)
- [x] BookmarkContentPreview — 书签内容预览 (R64)
- [x] BookmarkSemanticSearch — 语义搜索引擎 (R65)
- [x] BookmarkKnowledgeCorrelation — 知识关联 (R66)
- [x] BookmarkLearningProgress — 学习进度追踪 (R67)
- [x] BookmarkAIRecommendations — AI 智能推荐 (R68)
- [x] BookmarkStatistics — 统计仪表盘 (R69)
- [x] BookmarkDarkTheme — 暗色主题适配 (R70)
- [x] BookmarkKeyboardShortcuts — 快捷键系统 (R71)
- [x] BookmarkGraph V2.0 E2E 测试 (R72)
- [x] BookmarkKnowledgeIntegration — 书签-知识库联动 (R73)
- [x] BookmarkAutoCategorize — 自动分类引擎 (R74)

### v2.2.0 — BookmarkGraph 书签知识图谱 (2026-05-04)
- [x] BookmarkCollector — 书签采集器 (R43)
- [x] BookmarkIndexer — 倒排索引搜索 (R44)
- [x] BookmarkGraphEngine — 图谱构建引擎 (R45)
- [x] BookmarkVisualizer — Canvas 力导向图 (R46)
- [x] BookmarkDetailPanel — 详情面板 (R47)
- [x] BookmarkRecommender — 相似推荐 (R48)
- [x] BookmarkSearch — 综合搜索 (R49)
- [x] BookmarkPopup — 弹窗概览 (R50)
- [x] BookmarkOptionsPage — 选项页图谱标签 (R51)
- [x] BookmarkGraph MVP E2E 测试 (R52)
- [x] BookmarkClusterer — 自动聚类 (R53)
- [x] BookmarkStatusManager — 状态管理 (R54)
- [x] BookmarkTagger — 标签系统 (R55)
- [x] BookmarkDedup — 重复检测 (R56)
- [x] BookmarkFolderAnalyzer — 文件夹分析 (R57)
- [x] BookmarkGapDetector — 知识空白检测 (R58)
- [x] BookmarkImportExport — 导入导出 (R59)
- [x] BookmarkTagEditor — 标签编辑器 (R60)
- [x] BookmarkLearningPath — 学习路径 (R61)
- [x] BookmarkLinkChecker — 链接健康检查 (R63)

### v2.0.0 — 核心功能完善 (2026-04-30)
- [x] MessageRenderer / KnowledgePanel 模块拆分
- [x] 倒排索引搜索优化 + 虚拟滚动 + 消息懒渲染
- [x] 停止生成按钮 + 键盘快捷键
- [x] 智能错误处理 + 代码语法高亮
- [x] 对话历史面板 + 知识图谱增强
- [x] 间隔重复 + 连续学习天数
- [x] 截图提问 + 统计仪表盘 + 引导向导
- [x] 性能监控 + 设置导入导出
- [x] Chrome Web Store 准备

### LLM Wiki 知识编译系统 (R19-R34)
- [x] L1: 知识库导出为 Wiki 格式、实体提取、交叉引用、Git 集成
- [x] L2: Q&A 自动分类、知识关联增强、矛盾检测、编译报告、增量编译
- [x] L3: Wiki 浏览模式、图谱可视化增强、自动 Ingest、LLM 查询、Lint 工具、服务器同步

### v2.1.0 — 质量与可靠性 (R35-R42)
- [x] R35: 统一错误处理集成 + _locales 国际化基础
- [x] R36-R42: 核心模块 E2E 测试飞轮 (AI Client, AI Cache, Knowledge Base, Conversation Store, Page Sense, PDF Extractor, Skill Engine)
- [x] 59 个测试回归修复

---

## 🚧 当前阶段 — E2E 测试续接 + Chrome Web Store 发布

### Phase 1: 核心模块 E2E 测试 (剩余部分)
- [x] R36: AI Client E2E
- [x] R37: AI Cache E2E
- [x] R38: Knowledge Base E2E
- [x] R39: Conversation Store E2E
- [x] R40: Page Sense + Content E2E
- [x] R41: PDF Extractor E2E
- [x] R42: Skill Engine + Custom Skills E2E
- [ ] **R103: Spaced Repetition E2E** ← 下一步
- [ ] R104: Knowledge Graph + Entity Extractor E2E
- [ ] R105: Wiki Store + Query E2E

### Phase 1.5: Chrome Web Store 发布
- [ ] Chrome Web Store 提交 (使用 R83 StorePrep 材料)
- [ ] 权限最小化最终审查
- [ ] 隐私政策更新 (覆盖新功能)
- [ ] 商店 Listing 最终确认

### Phase 2: 集成测试 (R106-R110)
- [ ] R106: AI Pipeline 集成 (Page Sense → AI → KB)
- [ ] R107: Sidebar 面板集成
- [ ] R108: 搜索+检索集成 (倒排索引 + 语义搜索 + 知识图谱)
- [ ] R109: Settings 全局集成
- [ ] R110: Error Handler 全局集成

### Phase 3: 边界 & 可靠性测试 (R111-R115)
- [ ] R111: Network Resilience
- [ ] R112: Storage Limits
- [ ] R113: Large Data (1000+ messages, 10000+ KB entries)
- [ ] R114: Concurrent Access (多 Tab, SW 重启)
- [ ] R115: Input Validation (XSS, 超长文本)

### Phase 4: 跨模块集成 (R116-R120)
- [ ] R116: Knowledge → Learning 联动
- [ ] R117: Wiki ↔ Knowledge 双向同步
- [ ] R118: Contradiction Detector
- [ ] R119: Batch Summary + Cost
- [ ] R120: Highlight ↔ Knowledge 关联

### Phase 5: 设计审查 & Issue 提交 (R121-R125)
- [ ] R121: API 一致性审查
- [ ] R122: Error Handling 一致性审查
- [ ] R123: Performance Hotspot 审查
- [ ] R124: Security Audit
- [ ] R125: 设计问题汇总 + GitHub Issue 提交

---

## 🔮 未来规划

### v3.1.0 — Chrome Web Store 首次上架
- [ ] Chrome Web Store 提交与审核
- [ ] 用户反馈收集机制
- [ ] 自动更新推送

### v3.2.0 — 智能化增强
- [ ] Bookmark 知识图谱与主知识库深度融合
- [ ] AI Agent 自主浏览学习
- [ ] 多设备同步 (需后端)

### v4.0.0 — 平台化
- [ ] Plugin 生态系统
- [ ] Firefox / Edge 支持
- [ ] Web App 版本
- [ ] 开放 API

---

*基于飞轮迭代流程 (flywheel-iteration v1.2.0)*
*最后更新: 2026-05-16 by 周回顾自动任务*
