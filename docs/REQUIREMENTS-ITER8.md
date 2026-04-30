# REQUIREMENTS-ITER8.md — PDF 提取可靠性提升

> 迭代: R8
> 日期: 2026-04-30
> 角色: Plan Agent

---

## 现状分析

PDF 支持已部分实现:
- ✅ PDF 页面检测 (content/content.js: `detectPdfPage()`)
- ✅ 页面感知类型 (lib/page-sense.js: `pdf` 类型)
- ✅ 侧边栏快捷按钮 (sidebar/sidebar.js: `showPdfQuickActions()`)
- ✅ DOM 文本提取 (content/content.js: `extractPdfContent()`)
- ✅ 正则 fallback (sidebar/sidebar.js: `fetchPdfTextFallback()`)
- ✅ AI 分析功能 (sidebar/sidebar.js: `pdfAnalyze()`)
- ✅ 页面感知测试 (tests/test-page-sense.js: PDF 识别测试)

## 问题

1. **Chrome PDF viewer shadow DOM 无法访问**: `extractPdfContent()` 的策略 1/2 依赖 `.text-layer` 和 `#viewer`，但 Chrome 内置 PDF viewer 使用 shadow DOM，这些选择器通常匹配不到
2. **正则 fallback 不可靠**: `fetchPdfTextFallback()` 用正则匹配 PDF 二进制中的 `Tj`/`TJ` 操作符，对压缩/加密 PDF 无效
3. **缺少 pdf.js 集成**: 没有使用 Chrome 内置的 pdf.js (`chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/`) 或 PDF.js 库进行可靠提取
4. **无 PDF 提取测试**: 只有页面感知测试，没有 `extractPdfContent()` 的单元测试

## 本次迭代目标

提升 PDF 文本提取的可靠性，从"经常需要 fallback"提升到"大多数 PDF 可直接提取"。

### R022: PDF 提取引擎增强

**验收标准**:
1. 使用 `pdfjsLib` (通过 CDN 或 bundle) 进行可靠 PDF 文本提取
2. `extractPdfContent()` 成功率从 ~40% 提升到 ~80%
3. 新增 `lib/pdf-extractor.js` 模块，封装 PDF 提取逻辑
4. content script 通过消息调用 extractor，不直接依赖 DOM
5. 所有现有测试继续通过
6. 新增 PDF extractor 单元测试

**技术约束**:
- 不引入 npm 依赖（Chrome Extension MV3 无打包工具）
- 可以使用 `chrome.runtime.getURL()` 加载本地 pdf.js worker
- PDF 二进制通过 `fetch` + `arrayBuffer` 获取

---

*Plan Agent 生成 | 2026-04-30*
