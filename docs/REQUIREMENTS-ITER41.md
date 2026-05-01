# R41: PDF Extractor E2E 测试需求

## 用户故事
作为 PageWise 开发者，我需要全面的 PDF Extractor E2E 测试，以确保 PDF 解析在各种场景下可靠工作。

## 验收标准
1. 测试实际 PdfExtractor 类（非 mock），验证真实 pdf.js 集成
2. 覆盖各类 PDF：纯文本、多页、空页面
3. 测试大文件处理（不会 OOM）
4. 测试错误处理：null 输入、空 ArrayBuffer、非 PDF 数据
5. 测试元数据提取完整性
6. 测试 extractFromUrl 的 fetch 成功/失败场景
7. 测试边界条件：单页 PDF、超长文本

## 技术约束
- 使用 node:test 框架
- 使用 node:assert/strict
- ES Module 动态 import
- pdf.js 通过 lib/pdf.min.mjs 加载
- 测试文件: tests/test-pdf-extractor-e2e.js

## 依赖
- lib/pdf-extractor.js (PdfExtractor 类)
- lib/pdf.min.mjs (pdf.js 库)
