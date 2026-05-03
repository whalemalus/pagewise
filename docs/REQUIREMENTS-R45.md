# R45: Knowledge Panel E2E 测试需求

## 任务
创建 tests/test-knowledge-panel-e2e.js，测试 lib/knowledge-panel.js 的 KnowledgePanel 类。

## API 清单
- constructor({ memory, knowledgeList, knowledgeDetail, emptyKnowledge, ... }) — 初始化面板
- async loadKnowledgeList() — 加载知识列表（虚拟滚动）
- showKnowledgeList() — 显示列表视图
- async searchKnowledge() — 搜索知识
- async loadKnowledgeTags() — 加载标签
- async showKnowledgeDetail(id) — 显示详情
- async loadRelatedEntries(entryId) — 加载相关条目
- async deleteEntry() — 删除当前条目
- async batchDelete() — 批量删除
- async batchTag() — 批量打标签
- async exportMarkdown() — 导出 Markdown
- async exportJson() — 导出 JSON
- _initVirtualScroll() — 初始化虚拟滚动
- _cleanupVirtualScroll() — 清理虚拟滚动
- _renderVirtualItems() — 渲染虚拟列表项

## 测试模板
需要 mock: document, IntersectionObserver, chrome.runtime, MemorySystem
```javascript
// 参考 test-message-renderer-e2e.js 的 DOM mock 模式
```

## 要求
- 至少 20 个测试场景
- 覆盖：loadKnowledgeList、searchKnowledge、showKnowledgeDetail、deleteEntry、batchDelete、batchTag、export、虚拟滚动初始化/清理
- 边界：空列表、大量条目、搜索无结果、重复删除
- 运行 node --test tests/test-knowledge-panel-e2e.js 确认通过
- git commit -m "test: R45 Knowledge Panel E2E — 20+ test scenarios"
