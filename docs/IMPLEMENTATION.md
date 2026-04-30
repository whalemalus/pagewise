# IMPLEMENTATION.md — 迭代实现记录

---

## 迭代 21 — L1.2 实体/概念自动提取

> 日期: 2026-04-30
> 任务: L1.2 实体/概念自动提取 — 导出时用 AI 自动识别 Q&A 中提到的实体和概念

### 新增文件

1. **lib/entity-extractor.js** — 实体/概念自动提取模块
   - `ENTITY_TYPES` — 支持的实体类型常量（person, tool, framework, api, language, platform, library, service, other）
   - `buildExtractionPrompt(entries)` — 构建 AI 提示词，指示 AI 从 Q&A 条目中提取实体和概念
   - `parseExtractionResponse(response)` — 解析 AI 返回的 JSON（支持 markdown 代码块包裹）
   - `extractEntities(entries, aiClient, options)` — 主提取流程，支持批量处理和去重合并
   - `generateEntityMarkdown(entity)` — 生成实体页 Markdown（含 YAML frontmatter + 概述 + 相关 Q&A + 关联实体）
   - `generateConceptMarkdown(concept)` — 生成概念页 Markdown（含 YAML frontmatter + 概述 + 相关 Q&A + 关联技术）
   - `buildEntityIndex(entities, concepts)` — 生成实体/概念索引 Markdown（按类型分组）
   - `sanitizeFilename(name)` — 清理文件系统不安全字符

2. **tests/test-entity-extractor.js** — 22 个单元测试

### 设计决策

- **纯 ES Module**：不依赖 IndexedDB 或 Chrome API，与 `KnowledgeBase` 完全解耦
- **批量分批处理**：默认每批 10 条，大知识库分批调用 AI 后合并去重
- **去重策略**：同名实体/概念自动合并 `relatedEntryIds`
- **容错解析**：支持直接 JSON、markdown 代码块包裹、无效输入安全降级
- **Wikilink 格式**：关联实体使用 `[[name]]` 格式，为 L1.3 交叉引用做准备

### 测试结果

- 新增: 22 个测试，全部通过
- 总测试: 1539

---

## 迭代 R8 — PDF 提取引擎增强

> 日期: 2026-04-30
> 任务: PDF 提取引擎增强

## 实现内容

### 新增文件

1. **lib/pdf-extractor.js** — PDF 文本提取器模块
   - `PdfExtractor.extractText(arrayBuffer)` — 从 ArrayBuffer 提取 PDF 文本
   - `PdfExtractor.extractFromUrl(url)` — 通过 URL 获取并提取
   - 使用 pdf.js (ES Module) 进行可靠提取
   - 支持元数据提取（标题、作者等）

2. **lib/pdf.min.mjs** — pdf.js v3.11.174 库文件
3. **lib/pdf.worker.min.mjs** — pdf.js worker 文件

4. **tests/test-pdf-extractor.js** — PDF 提取器单元测试（9 个测试用例）

### 修改文件

1. **background/service-worker.js** — 新增 `extractPdfViaJs` 消息处理
   - 动态加载 `lib/pdf-extractor.js`
   - 通过消息协议供 content script 调用

2. **content/content.js** — 改进 `extractPdfContent` 消息处理
   - 保留 DOM 提取作为快速路径
   - DOM 提取失败时自动 fallback 到 pdf.js
   - 通过 background service worker 调用 PdfExtractor

3. **sidebar/sidebar.js** — 显示页数信息
   - `pdfExtractContent()` 显示 PDF 页数

4. **manifest.json** — 添加 `web_accessible_resources`
   - 暴露 `lib/pdf.min.mjs` 和 `lib/pdf.worker.min.mjs`

## 技术决策

- **通过 background service worker 调用 pdf.js**: 因为 content script 不能直接使用 ES module import，而 background service worker 可以
- **保留 DOM 提取作为快速路径**: 如果 Chrome PDF viewer 的 text layer 可访问，直接使用，避免不必要的 pdf.js 加载
- **web_accessible_resources**: pdf.js 文件需要在 content script 的上下文中可访问

## 测试结果

- 总测试: 156 (原 147 + 新增 9)
- 通过: 156
- 失败: 0

---
*自动生成于 2026-04-30*
