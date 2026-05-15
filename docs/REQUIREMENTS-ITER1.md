# REQUIREMENTS — R87: BookmarkDocumentation

> 飞轮迭代 Phase 1: 需求分析 (Plan Agent)
> 生成时间: 2026-05-15 09:00

## 用户故事

作为 PageWise 用户，我希望在扩展内查看书签功能的使用指南和 API 文档，以便快速了解如何使用 BookmarkGraph 的各项功能，遇到问题时能自助排查。

## 功能需求

### 1. 使用指南 (User Guide)
- 提供 BookmarkGraph 功能概述
- 分步骤说明核心操作流程（采集→图谱→搜索→推荐）
- 支持 i18n（中英文）

### 2. API 文档 (API Reference)
- 自动收集所有 bookmark-* 模块的导出函数
- 从 JSDoc 注释提取函数签名、参数、返回值
- 按模块分组展示

### 3. 常见问题 (FAQ)
- 预置 10+ 常见问题及解答
- 支持关键词搜索 FAQ
- 按类别分组（功能/性能/数据/兼容性）

### 4. 故障排除 (Troubleshooting)
- 常见错误码及解决方案
- 诊断步骤指引

## 验收标准

1. ✅ `getGuides()` 返回使用指南列表（≥5 个主题）
2. ✅ `getApiDocs()` 返回 API 文档（覆盖所有 bookmark-* 模块的导出函数）
3. ✅ `getFAQ()` 返回 FAQ 列表（≥10 条）
4. ✅ `searchFAQ(keyword)` 支持中英文关键词搜索
5. ✅ `getTroubleshooting()` 返回故障排除指南（≥5 条）
6. ✅ 所有内容支持 i18n key，可通过 `t()` 获取
7. ✅ 纯数据模块，无 DOM/Chrome API 依赖

## 技术约束

- 纯 ES Module，遵循 CLAUDE.md 规范
- 复用 `lib/bookmark-i18n.js` 的 i18n 系统
- 无构建工具，无外部依赖
- 测试使用 `node:test` 框架

## 依赖关系

- `lib/bookmark-i18n.js` — i18n key 注册
- `lib/i18n.js` — 全局 i18n 系统
