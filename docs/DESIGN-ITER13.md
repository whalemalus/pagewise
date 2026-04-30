# 设计文档 — 迭代 #13: 批量摘要

> 目标: 提高高密度阅读效率
> 日期: 2026-04-30

---

## 1. 需求分析

### 用户痛点
- 长文页面（技术文档、博客、论文）阅读费时
- 不知道哪些段落值得深入阅读
- 现有单次摘要只能覆盖全文概述，无法深入到段落级别
- 高密度页面（如 API 参考、规格文档）需要结构化理解

### 功能目标
- 自动将长文分段，生成每段摘要
- 提供全文概述 + 各段摘要 + 关键要点
- 估算阅读时间，帮助用户分配阅读精力
- 智能压缩策略，确保不超出 Token 限制

## 2. 设计决策

### D026: 分段策略
- **选择**: 按 Markdown 标题（h1-h3 / # / ## / ###）优先分段，其次按双换行分段，最后按固定字符数分段
- **理由**: 标题是最自然的内容结构划分，符合大多数技术文档的组织方式
- **Fallback**: 无标题时按 500 字符一段切分，保证内容不丢失

### D027: AI 调用方式
- **选择**: 单次 AI 调用（将所有分段合并进一个 prompt）
- **理由**: 多次调用成本高、速度慢；单次调用通过压缩策略可覆盖大多数场景
- **压缩策略**: 当总内容超过 maxChars（默认 6000）时，按比例截取各段首尾

### D028: 输出格式
- **选择**: 结构化 Markdown（全文概述 → 阅读建议 → 逐段摘要 → 关键要点）
- **理由**: Markdown 格式与现有 renderMarkdown 渲染器兼容
- **解析**: AI 输出通过正则解析为 sections 数组，支持 fallback（整体作为单段摘要）

## 3. 模块设计

### 3.1 lib/batch-summary.js — 批量摘要核心模块

```
// === 分段 ===

splitIntoSections(content, options) → Section[]
  - options.strategy: 'heading' | 'paragraph' | 'fixed' (默认 'heading')
  - options.maxSectionChars: 每段最大字符数 (默认 3000)
  - options.minSectionChars: 每段最小字符数 (默认 50)
  - Section: { id, title, content, level, charCount }

// === 压缩 ===

compressSections(sections, maxTotalChars) → Section[]
  - 按比例截取各段，保留首尾
  - 总字符数不超过 maxTotalChars
  - 每段至少保留 100 字符

// === Prompt 构建 ===

buildBatchSummaryPrompt(sections) → string
  - 生成结构化 prompt，要求 AI 按段摘要
  - 包含段落编号和标题信息

// === 响应解析 ===

parseBatchSummaryResponse(text, sections) → BatchSummary
  - BatchSummary: { overview, readingTime, sectionSummaries[], keyPoints[] }
  - sectionSummaries: { sectionId, title, summary, keyPoint, importance }
  - importance: 'high' | 'medium' | 'low'

// === 阅读时间估算 ===

estimateReadingTime(text, wpm) → { minutes, label }
  - wpm: 中文 ~400 字/分钟，英文 ~200 词/分钟
  - label: "约 5 分钟" / "< 1 分钟"

// === 高级入口 ===

summarizeContent(content, aiClient, options) → BatchSummary
  - 完整流程：分段 → 压缩 → 调用 AI → 解析 → 返回结果
  - options: { maxChars, strategy, maxSectionChars, model, maxTokens }
```

### 3.2 sidebar/sidebar.js — 集成

新增方法：
```
batchSummarize()
  - 检查当前页面内容
  - 调用 summarizeContent()
  - 渲染结果到消息面板

showBatchSummaryResult(summary)
  - 渲染全文概述
  - 渲染逐段摘要（可折叠）
  - 渲染关键要点列表
  - 显示阅读时间
```

### 3.3 UI 组件

```
批量摘要面板
├── 📊 全文概述
├── ⏱️ 预计阅读时间
├── 📋 关键要点（精简列表）
├── 📑 逐段摘要（可折叠区域）
│   ├── [High] 第一段标题 → 摘要
│   ├── [Med]  第二段标题 → 摘要
│   └── ...
└── 💡 建议优先阅读的段落
```

## 4. 测试计划

### test-batch-summary.js
1. splitIntoSections — 按标题分段
2. splitIntoSections — 按段落分段
3. splitIntoSections — 按固定字符数分段
4. splitIntoSections — 空内容
5. splitIntoSections — 单段内容（无标题）
6. splitIntoSections — 多级标题（h1+h2+h3）
7. splitIntoSections — minSectionChars 合并过短段
8. compressSections — 正常压缩
9. compressSections — 已在限制内不压缩
10. compressSections — 空段数组
11. buildBatchSummaryPrompt — 包含段落编号和标题
12. buildBatchSummaryPrompt — 空段数组
13. parseBatchSummaryResponse — 正常解析
14. parseBatchSummaryResponse — AI 返回非结构化文本
15. parseBatchSummaryResponse — 空响应
16. estimateReadingTime — 中文文本
17. estimateReadingTime — 英文文本
18. estimateReadingTime — 空文本
19. estimateReadingTime — 混合语言
20. summarizeContent — 集成测试（mock AI）
