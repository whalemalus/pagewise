# IMPLEMENTATION.md — 迭代 R8 实现记录

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
