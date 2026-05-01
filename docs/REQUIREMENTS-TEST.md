# 需求文档 — 功能测试 & 可靠性测试飞轮

> 迭代范围: R36-R65 (30 轮)
> 目标: 端到端验证每个功能点，确保可靠性，发现设计问题
> 原则: 不做新功能，只做测试覆盖 + 质量保障

---

## 测试策略

### 每轮迭代产出
1. **测试文件** — `tests/test-{module}-e2e.js` (端到端测试)
2. **测试文件** — `tests/test-{module}-edge.js` (边界测试)
3. **设计问题** — 发现的问题记录到 `docs/ISSUES.md`
4. **进度更新** — `docs/progress.json` 实时更新

### 测试质量标准
- 每个模块至少 **15 个测试场景**
- 必须覆盖: 正常路径、错误路径、边界条件、并发场景
- 测试必须能独立运行 (无外部依赖)
- Mock 必须模拟真实 Chrome API 行为

### 设计问题分类
| 级别 | 说明 | 处理方式 |
|------|------|---------|
| 🔴 P0 | 功能性 Bug | 立即修复 |
| 🟡 P1 | 设计缺陷 | 提 GitHub Issue |
| 🔵 P2 | 优化建议 | 记录到 ISSUES.md |

---

## Phase 1: 核心模块 E2E 测试 (R36-R45)

### R36: AI Client E2E
**模块**: `lib/ai-client.js`
**测试场景**:
- API 调用成功 (Claude/OpenAI/DeepSeek 格式)
- 流式响应解析 (SSE 格式)
- 错误重试 (429/500/503)
- 超时处理
- 模型切换
- API Key 验证
- 请求取消 (AbortController)
- 大上下文处理

### R37: AI Cache E2E
**模块**: `lib/ai-cache.js`
**测试场景**:
- 缓存命中/未命中
- TTL 过期清理
- LRU 淘汰策略
- 容量上限
- 并发读写
- 缓存键生成策略
- 序列化/反序列化

### R38: Knowledge Base E2E
**模块**: `lib/knowledge-base.js`
**测试场景**:
- CRUD 完整流程
- 全文搜索 (中英文)
- 标签过滤 (单标签/多标签)
- 分页查询
- 数据完整性 (字段验证)
- 批量操作
- 导入/导出

### R39: Conversation Store E2E
**模块**: `lib/conversation-store.js`
**测试场景**:
- 创建/恢复对话
- 对话分支/合并
- 持久化/恢复
- 大对话性能 (1000+ 消息)
- 消息排序
- 元数据管理

### R40: Page Sense + Content E2E
**模块**: `lib/page-sense.js`, `content/content.js`
**测试场景**:
- 静态页面内容提取
- 动态页面 (SPA)
- iframe 内容
- 懒加载内容
- 特殊元素 (表格/代码块/公式)
- 页面类型识别

### R41: PDF Extractor E2E
**模块**: `lib/pdf-extractor.js`
**测试场景**:
- 文本 PDF 解析
- 扫描件 PDF (OCR)
- 大文件处理
- 加密 PDF
- 表格提取
- 图片提取

### R42: Skill Engine + Custom Skills E2E
**模块**: `lib/skill-engine.js`, `lib/custom-skills.js`
**测试场景**:
- 技能加载/执行
- 参数传递/验证
- 自定义技能 CRUD
- 技能冲突处理
- 技能权限控制

### R43: Spaced Repetition E2E
**模块**: `lib/spaced-repetition.js`
**测试场景**:
- 卡片创建/删除
- 复习流程
- 评分算法
- 间隔调整
- 连续学习天数
- 统计准确性

### R44: Knowledge Graph + Entity Extractor E2E
**模块**: `lib/knowledge-graph.js`, `lib/entity-extractor.js`
**测试场景**:
- 实体识别 (人名/地名/概念)
- 关系构建
- 图查询 (邻居/路径)
- 图可视化数据
- 大图性能

### R45: Wiki Store + Query E2E
**模块**: `lib/wiki-store.js`, `lib/wiki-query.js`
**测试场景**:
- Wiki CRUD
- 查询语法
- 类型过滤
- 分页
- 全文搜索

---

## Phase 2: 集成测试 (R46-R50)

### R46: AI Pipeline 集成
**流程**: Page Sense → AI Client → Knowledge Base
- 页面内容提取 → AI 处理 → 结果存储
- 错误传播链
- 超时处理链

### R47: Sidebar 面板集成
**模块**: `sidebar/sidebar.js`, `sidebar/sidebar.html`
- 面板切换状态保持
- 数据同步
- UI 响应性

### R48: 搜索+检索集成
**模块**: `lib/embedding-engine.js`, `lib/knowledge-base.js`
- 倒排索引 + 语义搜索联合
- 结果排序/合并
- 性能基准

### R49: Settings 全局集成
**模块**: `lib/utils.js`, `options/`
- 设置变更传播
- 导入/导出
- 默认值回退

### R50: Error Handler 全局集成
**模块**: `lib/error-handler.js`
- 错误捕获 → 分类 → 通知 → 恢复
- 全局错误处理链

---

## Phase 3: 边界 & 可靠性测试 (R51-R55)

### R51: Network Resilience
- 断网场景
- 慢网场景 (高延迟)
- 超时处理
- DNS 失败
- SSL 错误

### R52: Storage Limits
- IndexedDB 配额耗尽
- 数据损坏恢复
- 并发写入冲突
- 版本升级迁移

### R53: Large Data
- 大对话 (1000+ 消息)
- 大知识库 (10000+ 条目)
- 大 PDF (100MB+)

### R54: Concurrent Access
- 多 Tab 同时操作
- Service Worker 重启
- 消息乱序处理

### R55: Input Validation
- 恶意输入
- XSS 注入
- 超长文本
- 特殊字符
- 空值处理

---

## Phase 4: 跨模块集成 (R56-R60)

### R56: Knowledge → Learning 联动
- 知识条目自动创建复习卡片

### R57: Wiki ↔ Knowledge 双向同步
- Wiki 更新同步到知识库

### R58: Contradiction Detector
- 检测知识库中的矛盾信息

### R59: Batch Summary + Cost
- 批量摘要的成本估算准确性

### R60: Highlight ↔ Knowledge 关联
- 高亮标注与知识条目关联

---

## Phase 5: 设计审查 & Issue 提交 (R61-R65)

### R61: API 一致性审查
- 方法命名一致性
- 参数风格一致性
- 返回值格式一致性

### R62: Error Handling 一致性审查
- 错误分类一致性
- 错误消息格式
- 用户可见性

### R63: Performance Hotspot 审查
- 内存泄漏
- 不必要的重渲染
- O(n²) 算法

### R64: Security Audit
- 权限检查
- 数据隔离
- CSP 合规
- API Key 保护

### R65: 设计问题汇总 + GitHub Issue 提交
- 收集所有发现的问题
- 提交到 GitHub Issues
