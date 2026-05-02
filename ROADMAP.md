# ROADMAP — 智阅 PageWise

> 项目路线图，每月更新
> 最后更新: 2026-05-02

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

## 🚧 当前阶段 — 功能测试 & 可靠性测试飞轮 (R36-R65)

### Phase 1: 核心模块 E2E 测试 (R36-R45)
- [x] R36: AI Client E2E
- [x] R37: AI Cache E2E
- [x] R38: Knowledge Base E2E
- [x] R39: Conversation Store E2E
- [x] R40: Page Sense + Content E2E
- [x] R41: PDF Extractor E2E
- [x] R42: Skill Engine + Custom Skills E2E
- [ ] **R43: Spaced Repetition E2E** ← 下一步
- [ ] R44: Knowledge Graph + Entity Extractor E2E
- [ ] R45: Wiki Store + Query E2E

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

### v2.2.0 — 高级功能
- [ ] Plugin 生态系统
- [ ] 多设备同步 (需后端)
- [ ] AI Agent 自主浏览学习
- [ ] 协作知识库

### v3.0.0 — 平台化
- [ ] Firefox / Edge 支持
- [ ] Web App 版本
- [ ] 开放 API

---

*基于飞轮迭代流程 (flywheel-iteration v1.2.0)*
