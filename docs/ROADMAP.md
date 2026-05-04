# ROADMAP — 智阅 PageWise

> 项目路线图
> 最后更新: 2026-05-03

---

## 📍 当前状态

| 指标 | 数值 |
|------|------|
| 版本 | v1.5.1 |
| 迭代轮次 | R42 |
| 测试总数 | 2111 (pass 2111, fail 0) |
| 测试文件 | 79 |
| 核心代码 | ~16,704 行 (lib/) |
| 测试代码 | ~24,051 行 (tests/) |

---

## 🗺️ 路线图总览

```
Phase A: BookmarkGraph MVP (R43-R52)       → 书签采集 + 图谱 + 可视化
Phase B: BookmarkGraph V1.0 (R53-R62)      → 主题聚类 + 学习路径 + 标签
Phase C: BookmarkGraph V2.0 (R63-R72)      → 语义搜索 + AI 推荐 + 知识关联
Phase D: 集成与打磨 (R73-R82)              → PageWise 联动 + 性能 + i18n
Phase E: 发布准备 (R83-R92)                → 安全 + 文档 + Chrome Web Store
```

---

## ✅ 已完成里程碑

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

## 🚧 Phase A: BookmarkGraph MVP (R43-R52)

> 目标：让书签从"堆积"变成"可探索的知识网络"

- [ ] **R43: 书签采集器 BookmarkCollector** — `lib/bookmark-collector.js`
  - 递归读取 Chrome 书签树，标准化数据
  - 复杂度: Medium

- [ ] **R44: 书签索引器 BookmarkIndexer** — `lib/bookmark-indexer.js`
  - 倒排索引，支持中英文搜索
  - 复杂度: Medium

- [ ] **R45: 书签图谱引擎 BookmarkGraphEngine** — `lib/bookmark-graph.js`
  - 关键词相似度构建关联网络
  - 复杂度: Complex

- [ ] **R46: 图谱可视化 BookmarkVisualizer** — `lib/bookmark-visualizer.js`
  - Canvas 力导向图，缩放/拖拽/搜索
  - 复杂度: Complex

- [ ] **R47: 详情面板 BookmarkDetailPanel** — `lib/bookmark-detail-panel.js`
  - 点击节点显示详情 + 相似推荐
  - 复杂度: Medium

- [ ] **R48: 相似推荐 BookmarkRecommender** — `lib/bookmark-recommender.js`
  - Top-5 相似书签推荐
  - 复杂度: Medium

- [ ] **R49: 书签搜索 BookmarkSearch** — `lib/bookmark-search.js`
  - 实时搜索 + 过滤
  - 复杂度: Simple

- [ ] **R50: 弹窗概览 BookmarkPopup** — `popup/bookmark-overview.js`
  - 快速概览 + 搜索入口
  - 复杂度: Medium

- [ ] **R51: 选项页集成 BookmarkOptionsPage** — `options/bookmark-panel.js`
  - 完整图谱视图
  - 复杂度: Medium

- [ ] **R52: MVP E2E 测试** — 全模块测试
  - 复杂度: Medium

---

## 📋 Phase B: BookmarkGraph V1.0 (R53-R62)

> 目标：智能分类 + 学习路径 + 知识管理

- [ ] **R53: 主题聚类 TopicClustering** — 自动识别技术领域
- [ ] **R54: 学习路径 LearningPathFromBookmarks** — 基于主题依赖推荐
- [ ] **R55: 标签自动生成 AutoTagGeneration** — 智能标签
- [ ] **R56: 标签手动编辑 TagManualEditing** — 用户自定义
- [ ] **R57: 知识盲区检测 KnowledgeGapDetection** — 发现薄弱领域
- [ ] **R58: 状态标记 BookmarkStatusMarking** — 已读/待读/在读
- [ ] **R59: 文件夹分析 FolderAnalysis** — 整理建议
- [ ] **R60: 重复检测 DuplicateDetection** — 去重合并
- [ ] **R61: 数据导入导出 BookmarkImportExport** — JSON/CSV
- [ ] **R62: V1.0 E2E 测试**

---

## 📋 Phase C: BookmarkGraph V2.0 (R63-R72)

> 目标：AI 驱动 + 知识关联

- [ ] **R63: 链接健康检查 LinkHealthCheck** — 失效检测
- [ ] **R64: 书签内容预览 BookmarkContentPreview** — 页面摘要
- [ ] **R65: 语义搜索 BookmarkSemanticSearch** — 嵌入引擎
- [ ] **R66: 知识关联 BookmarkKnowledgeCorrelation** — 与 Q&A 联动
- [ ] **R67: 学习进度追踪 BookmarkLearningProgress** — 进度管理
- [ ] **R68: AI 推荐 BookmarkAIRecommendations** — 智能推荐
- [ ] **R69: 统计仪表盘 BookmarkStatistics** — 数据可视化
- [ ] **R70: 暗色主题 BookmarkDarkTheme** — 暗色模式
- [ ] **R71: 快捷键 BookmarkKeyboardShortcuts** — 快捷操作
- [ ] **R72: V2.0 E2E 测试**

---

## 📋 Phase D: 集成与打磨 (R73-R82)

> 目标：与 PageWise 核心深度融合

- [ ] **R73: 书签-知识库联动** — 双向关联
- [ ] **R74: 自动分类** — 新书签自动归类
- [ ] **R75: 智能集合** — 规则驱动的动态集合
- [ ] **R76: 书签分享** — 导出可分享集合
- [ ] **R77: 高级分析** — 收藏模式分析
- [ ] **R78: 性能优化** — 10000+ 书签支持
- [ ] **R79: 无障碍** — 键盘导航 + 屏幕阅读器
- [ ] **R80: 国际化** — 中英文界面
- [ ] **R81: 引导向导** — 首次使用引导
- [ ] **R82: Phase D 集成测试**

---

## 📋 Phase E: 发布准备 (R83-R92)

> 目标：Chrome Web Store 上架

- [ ] **R83: Store 准备** — manifest + 截图
- [ ] **R84: 安全审计** — XSS + 数据隔离
- [ ] **R85: 性能基准** — 基准测试
- [ ] **R86: 错误处理** — 全局错误捕获
- [ ] **R87: 用户文档** — 使用指南
- [ ] **R88: 数据迁移** — 版本升级兼容
- [ ] **R89: 备份恢复** — 数据安全
- [ ] **R90: UI 打磨** — 动画 + 交互细节
- [ ] **R91: RC 测试** — 发布候选
- [ ] **R92: v3.0.0 发布** — 正式版
