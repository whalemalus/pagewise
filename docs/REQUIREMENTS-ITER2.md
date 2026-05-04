# R52: BookmarkGraph MVP E2E 测试 — 需求文档

> 迭代: R52 (Phase A 收官)
> 日期: 2026-05-04
> 复杂度: Medium

## 背景

Phase A (R43-R51) 已完成 BookmarkGraph MVP 全部 9 个模块的开发：
- BookmarkCollector, BookmarkIndexer, BookmarkGraphEngine
- BookmarkVisualizer, BookmarkDetailPanel, BookmarkRecommender
- BookmarkSearch, BookmarkPopup, BookmarkOptionsPage

R52 是 Phase A 的收官迭代，目标是编写全模块集成测试 (E2E)，验证模块间协作正确性。

## 用户故事

作为开发者，我希望有一套完整的端到端测试，确保 BookmarkGraph MVP 的所有模块在集成环境下正常协作，任何模块的修改都不会破坏整体功能。

## 验收标准

1. ✅ 测试文件 `tests/test-bookmark-graph-e2e.js` 存在
2. ✅ 覆盖 MVP 核心流程：采集 → 索引 → 图谱构建 → 搜索 → 推荐
3. ✅ 覆盖边界情况：空书签、重复书签、特殊字符
4. ✅ 所有 E2E 测试通过 (14/14)
5. ✅ 不破坏现有单元测试 (2616/2634 通过，18 个为预存 KnowledgePanel E2E 失败)

## 技术约束

- 使用 `node:test` 框架
- 使用 `tests/helpers/chrome-mock.js` 和 `indexeddb-mock.js`
- ES Module 动态导入
- 每个测试独立，无状态依赖

## 现状

**R52 已在之前的迭代中实现完成**，无需再次实现。本次迭代的目标：
1. 确认 E2E 测试完整且通过
2. 更新 TODO.md 标记完成
3. 生成验证文档

## 附录：R62 (V1.0 E2E) 同样已完成

`tests/test-bookmark-v1-e2e.js` 已存在，15 测试全部通过。R62 也将在本次标记完成。
