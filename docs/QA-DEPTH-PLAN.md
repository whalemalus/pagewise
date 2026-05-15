# PageWise 深度测试迭代计划

## 目标
逐模块补全 PageWise 的功能测试，从 8% 覆盖率提升到 80%+。

## 任务清单

### Round 1 — 书签核心（最高优先级）
- **QA-DEPTH-001**: bookmark-core.js — 书签 CRUD 核心
- **QA-DEPTH-002**: bookmark-search.js + bookmark-semantic-search.js — 搜索
- **QA-DEPTH-003**: bookmark-import-export.js — 导入导出

### Round 2 — AI 与知识（高优先级）
- **QA-DEPTH-004**: embedding-engine.js + knowledge-graph.js — 语义搜索/图谱
- **QA-DEPTH-005**: chat-mode.js + explore-mode.js — Chat/Explore 模式
- **QA-DEPTH-006**: page-summarizer.js + context-menu.js — 页面总结/右键菜单

### Round 3 — 系统模块（中优先级）
- **QA-DEPTH-007**: plugin-system.js — 插件系统
- **QA-DEPTH-008**: shortcuts.js + onboarding.js — 快捷键/引导
- **QA-DEPTH-009**: bookmark-sync.js + bookmark-dedup.js — 同步/去重

### Round 4 — 补充覆盖
- **QA-DEPTH-010**: 剩余 bookmark-* 模块批量测试
- **QA-DEPTH-011**: 剩余 lib 模块批量测试

## 测试规范
- 每个模块 15-25 个测试用例
- 覆盖：正常路径、异常路径、边界条件、空输入、并发
- 使用 node:test + node:assert/strict
- 每轮完成后运行全量测试确认无回归
