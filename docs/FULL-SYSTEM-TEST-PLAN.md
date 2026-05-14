# PageWise 全系统完整测试计划

## 目标
对 PageWise v2.4.0 进行全系统完整测试，验证需求符合度、功能正确性、可靠性。

## 测试维度

### 1. 需求符合度验证 (30%)
对照 ROADMAP.md 和各 Phase 需求，逐项检查：
- [ ] R1-R97 所有迭代的功能是否已实现
- [ ] 每个模块的验收标准是否满足
- [ ] Chrome Extension MV3 规范是否遵守

### 2. 功能正确性测试 (25%)
每个功能模块端到端验证：
- [ ] AI 问答（多模型支持、流式响应）
- [ ] 知识库管理（搜索、标签、分类）
- [ ] 书签管理（26个 bookmark-* 模块）
- [ ] 高亮标注（创建、编辑、搜索）
- [ ] Wiki 系统（创建、链接、搜索）
- [ ] 学习路径（创建、进度追踪）
- [ ] 间隔复习（SM-2 算法）
- [ ] 技能引擎（加载、执行、自定义技能）
- [ ] 插件系统（注册、生命周期）
- [ ] 导入导出（HTML/JSON/CSV）

### 3. 集成测试 (20%)
- [ ] Service Worker ↔ Content Script 通信
- [ ] Side Panel UI ↔ Background 通信
- [ ] IndexedDB 数据一致性（66个模块共享存储）
- [ ] Chrome API 兼容性（chrome.storage, chrome.tabs 等）

### 4. 可靠性测试 (15%)
- [ ] 错误处理（网络断开、API 超时、IndexedDB 满）
- [ ] 边界情况（空书签、超长文本、特殊字符）
- [ ] Service Worker 休眠/唤醒恢复
- [ ] 数据迁移（版本升级兼容性）

### 5. 浏览器兼容性测试 (10%)
- [ ] Chrome 最新版
- [ ] Edge 最新版
- [ ] Firefox（Manifest V3 支持）

## 当前问题
- 1 个测试失败需要修复
- R97 BookmarkImportExport 未完成

## 执行方式
Claude Code 执行，预计 3-4 轮迭代
