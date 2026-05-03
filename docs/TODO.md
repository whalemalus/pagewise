# TODO — 智阅 PageWise

> 驱动下一轮迭代的待办事项
> 更新日期: 2026-05-02

---

## 🔥 本次迭代 — 功能测试 & 可靠性测试飞轮 (R43-R72)

> 目标：端到端验证每个功能点，确保可靠性，发现设计问题提 Issue
> 不做新功能，只做测试覆盖 + 质量保障
> 当前测试: 2111 (全部通过)

### Phase 1: 未覆盖模块 E2E 测试 (R43-R48)

- [ ] R43: Memory E2E — 记忆存储/检索/遗忘、容量限制、持久化、跨会话
- [ ] R44: Message Renderer E2E — 消息渲染/Markdown/代码高亮/懒加载/大消息
- [ ] R45: Knowledge Panel E2E — 面板渲染/数据绑定/交互/刷新/错误状态
- [ ] R46: Agent Loop E2E — 代理循环/工具调用/状态管理/中断恢复
- [ ] R47: Importer E2E — 数据导入/格式识别/大文件/错误处理/进度回调
- [ ] R48: Evolution E2E — 数据演进/版本迁移/向后兼容/回滚

### Phase 2: 已有模块深度 E2E (R49-R58)

- [ ] R49: Spaced Repetition 深度 — 卡片创建/复习/评分/间隔调整/连续天数/统计
- [ ] R50: Knowledge Graph 深度 — 实体识别/关系构建/图查询/路径查找/可视化数据
- [ ] R51: Wiki Store 深度 — CRUD/查询语法/类型过滤/分页/全文搜索/关联
- [ ] R52: Embedding Engine 深度 — 向量生成/相似度计算/批量处理/缓存/降级
- [ ] R53: Error Handler 深度 — 错误捕获/分类/用户通知/恢复流程/日志记录
- [ ] R54: Cost Estimator 深度 — 成本计算/多模型/缓存节省/预算告警/历史统计
- [ ] R55: Stats 深度 — 使用统计/趋势分析/导出/重置/并发更新
- [ ] R56: Highlight Store 深度 — 高亮创建/删除/颜色/关联/导出/大量数据
- [ ] R57: Learning Path 深度 — 路径创建/进度追踪/推荐/完成判定/重置
- [ ] R58: Plugin System 深度 — 插件加载/卸载/钩子/权限/冲突/热更新

### Phase 3: 集成测试 (R59-R64)

- [ ] R59: AI Pipeline 集成 — Page Sense → AI Client → Knowledge Base 完整流程
- [ ] R60: Sidebar 面板集成 — 面板切换/状态保持/数据同步/UI 响应
- [ ] R61: 搜索+检索集成 — 倒排索引 + 语义搜索 + 知识图谱联合查询
- [ ] R62: Settings 全局集成 — 设置变更传播/导入导出/默认值回退
- [ ] R63: Knowledge → Learning 联动 — 知识条目自动创建复习卡片
- [ ] R64: Wiki ↔ Knowledge 双向同步 — Wiki 更新同步到知识库

### Phase 4: 边界 & 可靠性测试 (R65-R70)

- [ ] R65: Network Resilience — 断网/慢网/超时/DNS 失败/SSL 错误
- [ ] R66: Storage Limits — IndexedDB 配额耗尽/数据损坏/并发写入/版本升级
- [ ] R67: Large Data — 大对话(1000+ 消息)/大知识库(10000+ 条目)/大 PDF(100MB)
- [ ] R68: Concurrent Access — 多 Tab 同时操作/Service Worker 重启/消息乱序
- [ ] R69: Input Validation — 恶意输入/XSS 注入/超长文本/特殊字符/空值
- [ ] R70: Cross-Browser Compatibility — Chrome/Firefox/Edge API 差异/降级策略

### Phase 5: 设计审查 & Issue 提交 (R71-R72)

- [ ] R71: 设计合理性审查 — 审查所有模块的设计，识别不合理之处
- [ ] R72: Issue 提交 & 总结 — 将发现的设计问题提交为 GitHub Issue

---

## ✅ 已完成

### v2.1.0 — E2E 测试飞轮 (R36-R42)
- [x] R36: AI Client E2E — API 调用、流式解析、错误重试、超时处理、模型切换
- [x] R37: AI Cache E2E — 缓存命中/未命中、过期清理、LRU 淘汰、容量上限、并发读写
- [x] R38: Knowledge Base E2E — 增删改查、全文搜索、标签过滤、分页、数据完整性
- [x] R39: Conversation Store E2E — 创建/恢复/分支/合并对话、持久化、大对话性能
- [x] R40: Page Sense + Content E2E — 页面内容提取、动态页面、iframe、懒加载内容
- [x] R41: PDF Extractor E2E — 各类 PDF 解析、大文件、加密 PDF、表格/图片提取
- [x] R42: Skill Engine + Custom Skills E2E — 技能加载/执行/参数传递、自定义技能 CRUD
