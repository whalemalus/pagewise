# TODO — 智阅 PageWise

> 驱动下一轮迭代的待办事项
> 更新日期: 2026-05-01

---

## 🔥 本次迭代 — 功能测试 & 可靠性测试飞轮 (R36-R65)

> 目标：端到端验证每个功能点，确保可靠性，发现设计问题提 Issue
> 不做新功能，只做测试覆盖 + 质量保障

### Phase 1: 核心模块 E2E 测试 (R36-R45)

- [x] R36: AI Client E2E — API 调用、流式解析、错误重试、超时处理、模型切换
- [x] R37: AI Cache E2E — 缓存命中/未命中、过期清理、LRU 淘汰、容量上限、并发读写
- [x] R38: Knowledge Base E2E — 增删改查、全文搜索、标签过滤、分页、数据完整性
- [x] R39: Conversation Store E2E — 创建/恢复/分支/合并对话、持久化、大对话性能
- [x] R40: Page Sense + Content E2E — 页面内容提取、动态页面、iframe、懒加载内容
- [x] R41: PDF Extractor E2E — 各类 PDF 解析、大文件、加密 PDF、表格/图片提取
- [x] R42: Skill Engine + Custom Skills E2E — 技能加载/执行/参数传递、自定义技能 CRUD
- [ ] R43: Spaced Repetition E2E — 卡片创建/复习/评分/间隔调整、连续学习天数
- [ ] R44: Knowledge Graph + Entity Extractor E2E — 实体识别、关系构建、图查询
- [ ] R45: Wiki Store + Query E2E — Wiki CRUD、查询语法、类型过滤、分页

### Phase 2: 集成测试 (R46-R50)

- [ ] R46: AI Pipeline 集成 — Page Sense → AI Client → Knowledge Base 完整流程
- [ ] R47: Sidebar 面板集成 — 面板切换、状态保持、数据同步、UI 响应
- [ ] R48: 搜索+检索集成 — 倒排索引 + 语义搜索 + 知识图谱联合查询
- [ ] R49: Settings 全局集成 — 设置变更传播、导入导出、默认值回退
- [ ] R50: Error Handler 全局集成 — 错误捕获→分类→用户通知→恢复流程

### Phase 3: 边界 & 可靠性测试 (R51-R55)

- [ ] R51: Network Resilience — 断网、慢网、超时、DNS 失败、SSL 错误
- [ ] R52: Storage Limits — IndexedDB 配额耗尽、数据损坏、并发写入、版本升级
- [ ] R53: Large Data — 大对话(1000+ 消息)、大知识库(10000+ 条目)、大 PDF(100MB)
- [ ] R54: Concurrent Access — 多 Tab 同时操作、Service Worker 重启、消息乱序
- [ ] R55: Input Validation — 恶意输入、XSS 注入、超长文本、特殊字符、空值

### Phase 4: 跨模块集成 (R56-R60)

- [ ] R56: Knowledge → Learning 联动 — 知识条目自动创建复习卡片
- [ ] R57: Wiki ↔ Knowledge 双向同步 — Wiki 更新同步到知识库
- [ ] R58: Contradiction Detector — 检测知识库中的矛盾信息
- [ ] R59: Batch Summary + Cost — 批量摘要的成本估算准确性
- [ ] R60: Highlight ↔ Knowledge 关联 — 高亮标注与知识条目关联

### Phase 5: 设计审查 & Issue 提交 (R61-R65)

- [ ] R61: API 一致性审查 — 所有模块的方法命名、参数风格、返回值格式
- [ ] R62: Error Handling 一致性审查 — 错误分类、错误消息、用户可见性
- [ ] R63: Performance Hotspot 审查 — 内存泄漏、不必要的重渲染、O(n²) 算法
- [ ] R64: Security Audit — 权限检查、数据隔离、CSP 合规、API Key 保护
- [ ] R65: 设计问题汇总 + GitHub Issue 提交 — 收集所有发现的问题

---

## ✅ 已完成

### v2.0.0 (2026-04-30)
- [x] MessageRenderer 模块拆分
- [x] KnowledgePanel 模块拆分
- [x] 倒排索引搜索优化
- [x] 虚拟滚动
- [x] 消息懒渲染
- [x] 停止生成按钮
- [x] 键盘快捷键
- [x] 智能错误处理
- [x] 代码语法高亮
- [x] 对话历史面板
- [x] 知识图谱增强
- [x] 间隔重复 + 连续学习天数
- [x] 截图提问
- [x] 统计仪表盘
- [x] 引导向导
- [x] 性能监控
- [x] 设置导入导出
- [x] Chrome Web Store 准备
- [x] 页面高亮关联 (R012)
- [x] 统一错误处理模式
- [x] JSDoc 注释补充
- [x] ESLint 警告修复
