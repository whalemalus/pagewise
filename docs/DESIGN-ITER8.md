# DESIGN-ITER8.md — PDF 提取引擎增强

> 迭代: R8
> 日期: 2026-04-30
> 角色: Plan Agent

---

## 设计决策

### D008: 使用 pdfjsLib 进行 PDF 文本提取

**决策**: 引入 Mozilla 的 pdf.js 库（CDN 或本地 bundle）作为主要 PDF 提取引擎。

**原因**:
- Chrome 内置 PDF viewer 的 shadow DOM 无法可靠访问
- 正则匹配 PDF 二进制对压缩/加密 PDF 无效
- pdf.js 是业界标准的纯 JS PDF 解析库，支持所有 PDF 特性

**替代方案**:
1. ~~Chrome PDF viewer DOM 提取~~ — shadow DOM 无法访问
2. ~~正则匹配 PDF 二进制~~ — 不可靠
3. **pdf.js (选定)** — 成熟可靠，纯 JS，无外部依赖

### 实现方案

#### 新增文件: `lib/pdf-extractor.js`

```
lib/pdf-extractor.js
├── class PdfExtractor
│   ├── constructor() — 初始化 pdf.js worker
│   ├── extractText(arrayBuffer) — 从 PDF ArrayBuffer 提取文本
│   ├── extractFromUrl(url) — 通过 fetch 获取 PDF 并提取
│   └── getMetadata(arrayBuffer) — 提取 PDF 元数据（标题、作者等）
```

**核心流程**:
1. `fetch(url)` → `arrayBuffer()`
2. `pdfjsLib.getDocument({data: arrayBuffer})` → `pdfDoc`
3. 遍历 `pdfDoc.numPages` 页，每页 `page.getTextContent()`
4. 合并文本，保留段落分隔

**Worker 配置**:
- 使用 `pdfjsLib.GlobalWorkerOptions.workerSrc` 指向本地 worker 文件
- 或使用 CDN: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`

#### 修改文件: `content/content.js`

- `extractPdfContent()` 改为调用 `PdfExtractor.extractText()`
- 保留 DOM 提取作为快速路径（如果能提取到内容则跳过 pdf.js）
- 新增消息处理: `extractPdfViaJs` — 通过 pdf.js 提取

#### 修改文件: `sidebar/sidebar.js`

- `pdfExtractContent()` 和 `pdfAnalyze()` 使用新的提取引擎
- 移除 `fetchPdfTextFallback()` 中的正则匹配逻辑，改为调用 pdf.js

#### 修改文件: `manifest.json`

- 添加 pdf.js CDN 到 `content_security_policy`（如果使用 CDN）
- 或添加本地 pdf.js 文件到 `web_accessible_resources`

### 测试计划

1. **单元测试**: `tests/test-pdf-extractor.js`
   - 测试 `extractText()` 基本功能
   - 测试空 PDF、加密 PDF 的错误处理
   - 测试元数据提取

2. **集成测试**: 现有 `tests/test-page-sense.js` PDF 测试继续通过

### 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/pdf-extractor.js` | 新增 | PDF 提取引擎 |
| `content/content.js` | 修改 | 集成新提取器 |
| `sidebar/sidebar.js` | 修改 | 使用新提取器 |
| `manifest.json` | 修改 | 添加 pdf.js 资源 |
| `tests/test-pdf-extractor.js` | 新增 | 提取器测试 |

---

*Plan Agent 生成 | 2026-04-30*
