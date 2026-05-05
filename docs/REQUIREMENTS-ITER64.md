# REQUIREMENTS — R64: BookmarkContentPreview

> 迭代: R64
> 日期: 2026-05-05
> 复杂度: Medium (新模块)

## 用户故事

作为用户，我希望在书签列表/图谱中悬停或点击书签时，能够预览该网页的内容摘要，而无需打开新标签页，从而快速判断书签是否值得深入阅读。

## 验收标准

1. **AC1**: `BookmarkContentPreview` 类能从 URL 提取域名、路径等结构化信息
2. **AC2**: 支持生成书签的纯文本摘要预览（标题 + URL + 文件夹路径 + 标签 + 状态）
3. **AC3**: 支持生成 HTML 格式预览卡片（用于 sidebar/popup 渲染）
4. **AC4**: 支持从已保存的页面快照（knowledge-base）中提取内容片段
5. **AC5**: 预览长度可配置（默认 200 字符截断）
6. **AC6**: 完整的单元测试覆盖（≥ 15 个测试用例）

## 技术约束

- 纯 ES Module，不依赖 DOM
- 不引入新的第三方依赖
- 遵循现有书签模块的 JSDoc + export class 模式
- 测试使用 node:test + node:assert/strict

## 依赖关系

- 输入: BookmarkCollector 的标准书签对象格式
- 可选集成: KnowledgeBase 的页面快照数据
- 输出: 纯文本/HTML 预览字符串，可被 BookmarkDetailPanel 或 sidebar 使用

## 非功能需求

- 预览生成性能: < 5ms（纯字符串拼接，无 I/O）
- 内存: 不缓存预览结果（每次调用实时生成）
