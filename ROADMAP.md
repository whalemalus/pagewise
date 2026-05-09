# ROADMAP — 智阅 PageWise

> 项目路线图，每月更新
> 最后更新: 2026-05-09

---

## 📍 当前状态

| 指标 | 数值 |
|------|------|
| 版本 | v2.3.0 |
| 迭代轮次 | R74 |
| 测试总数 | 2992 (pass 2975, fail 17) |
| 测试文件 | 115 |
| 核心代码 | ~26,773 行 (lib/), 66 模块 |
| 测试代码 | ~29,000+ 行 (tests/) |
| Bookmark 模块 | 26 个 (13,898 行) |

---

## ✅ 已完成里程碑

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

## 🚧 当前阶段 — 技术债务清理 + E2E 测试续接

### Phase 0: 技术债务 (P0, 本周优先)
- [ ] **修复 KnowledgePanel E2E 17 个失败测试** — 已持续 3 周，需专项修复
- [ ] **更新迭代引擎** — Phase 5 超时、Phase 1/2 文档持久化问题

### Phase 1: 核心模块 E2E 测试 (R36-R45, 未完成部分)
- [x] R36: AI Client E2E
- [x] R37: AI Cache E2E
- [x] R38: Knowledge Base E2E
- [x] R39: Conversation Store E2E
- [x] R40: Page Sense + Content E2E
- [x] R41: PDF Extractor E2E
- [x] R42: Skill Engine + Custom Skills E2E
- [ ] **R75: Spaced Repetition E2E** ← 下一步
- [ ] R76: Knowledge Graph + Entity Extractor E2E
- [ ] R77: Wiki Store + Query E2E

### Phase 1.5: Bookmark 系列质量巩固
- [ ] Bookmark 模块集成测试 (26 模块联动)
- [ ] BookmarkDarkTheme P1 修复 (removeListener, system 模式监听)
- [ ] Bookmark E2E 全链路测试 (采集→图谱→搜索→推荐)

### Phase 2: 集成测试 (R46-R50)
- [ ] R46: AI Pipeline 集成 (Page Sense → AI → KB)
- [ ] R47: Sidebar 面板集成
- [ ] R48: 搜索+检索集成 (倒排索引 + 语义搜索 + 知识图谱)
- [ ] R49: Settings 全局集成
- [ ] R50: Error Handler 全局集成

### Phase 3: 边界 & 可靠性测试 (R51-R55)
- [ ] R51: Network Resilience
- [ ] R52: Storage Limits
- [ ] R53: Large Data (1000+ messages, 10000+ KB entries)
- [ ] R54: Concurrent Access (多 Tab, SW 重启)
- [ ] R55: Input Validation (XSS, 超长文本)

### Phase 4: 跨模块集成 (R56-R60)
- [ ] R56: Knowledge → Learning 联动
- [ ] R57: Wiki ↔ Knowledge 双向同步
- [ ] R58: Contradiction Detector
- [ ] R59: Batch Summary + Cost
- [ ] R60: Highlight ↔ Knowledge 关联

### Phase 5: 设计审查 & Issue 提交 (R61-R65)
- [ ] R61: API 一致性审查
- [ ] R62: Error Handling 一致性审查
- [ ] R63: Performance Hotspot 审查
- [ ] R64: Security Audit
- [ ] R65: 设计问题汇总 + GitHub Issue 提交

---

## 🔮 未来规划

### v2.4.0 — Bookmark 智能化增强
- [ ] Bookmark 知识图谱与主知识库深度融合
- [ ] Bookmark 学习进度可视化
- [ ] Bookmark 多设备同步

### v3.0.0 — 平台化
- [ ] Plugin 生态系统
- [ ] 多设备同步 (需后端)
- [ ] AI Agent 自主浏览学习
- [ ] Firefox / Edge 支持
- [ ] Web App 版本
- [ ] 开放 API

---

*基于飞轮迭代流程 (flywheel-iteration v1.2.0)*
*最后更新: 2026-05-09 by 周回顾自动任务*
