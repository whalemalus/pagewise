# R41: PDF Extractor E2E 测试设计

## 设计决策

### D001: 使用真实 PdfExtractor 而非 Mock
- **原因**: E2E 测试的核心价值是验证真实集成，mock 只能验证逻辑
- **方案**: 动态 import('./lib/pdf-extractor.js') 获取实际类
- **风险**: pdf.js 在 Node.js 环境可能有兼容性问题

### D002: 测试用 PDF 数据生成策略
- **方案**: 创建程序化生成的 PDF ArrayBuffer（最小有效 PDF）
- **原因**: 不依赖外部文件，测试自包含
- **备选**: 使用内联 base64 PDF 样本

### D003: 测试分组
1. extractText() — 核心提取功能
   - 有效 ArrayBuffer 提取文本
   - 多页 PDF 提取
   - 元数据提取
   - 返回结构验证
2. extractFromUrl() — URL 提取
   - 正常 URL
   - 404/网络错误
3. 错误处理
   - null/undefined 输入
   - 空 ArrayBuffer
   - 非 PDF 数据（垃圾字节）
   - 损坏的 PDF
4. 边界条件
   - 单页 PDF
   - 空页面（无文本内容）
   - 特殊字符（中文、日文、emoji）

## 修改文件
- 新增: tests/test-pdf-extractor-e2e.js
