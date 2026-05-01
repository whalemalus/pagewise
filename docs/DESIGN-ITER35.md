# DESIGN — Iteration #35

> **任务**: R35: 统一错误处理集成 + _locales 国际化基础
> **日期**: 2026-05-01
> **复杂度**: Complex（4+ 文件）

---

## 架构概述

当前状态：`lib/error-handler.js` 已定义完整的错误分类体系（ErrorType 枚举、classifyAIError、classifyStorageError、retryWithBackoff、installGlobalErrorHandler），但仅在 sidebar.js 中使用 5 次。其他模块各自处理错误。

目标状态：所有模块统一使用 error-handler.js 的分类和处理机制。

## 设计决策

### D035-1: ai-client.js 集成 error-handler
**决策**: 在 ai-client.js 的 chat() 和 chatStream() 方法中，catch 块使用 `classifyAIError()` 分类后重新抛出带有分类信息的错误。
**原因**: 当前 ai-client.js 抛出 `new Error('网络错误: ...')` 或 `new Error('API 401: ...')`，sidebar.js 再用 `classifyAIError()` 解析。如果 ai-client.js 直接分类，错误信息更准确，且 background/service-worker.js 也能受益。
**实现**:
```javascript
// ai-client.js - chat() 方法
import { classifyAIError, retryWithBackoff, ErrorType } from './error-handler.js'

// 在 catch 块中：
catch (fetchError) {
  const classified = classifyAIError(fetchError);
  const error = new Error(classified.message);
  error.classified = classified;
  throw error;
}
```

### D035-2: knowledge-base.js 集成 classifyStorageError
**决策**: knowledge-base.js 的 IndexedDB 操作使用 `classifyStorageError()` 包装错误。
**原因**: 当前直接 throw `new Error('存储不可用')`，没有区分 quota exceeded vs blocked vs 一般失败。
**实现**:
```javascript
import { classifyStorageError } from './error-handler.js'
// 在 IndexedDB 操作的 catch 块中使用
```

### D035-3: background/service-worker.js 安装全局错误捕获
**决策**: 在 service-worker.js 的 activate 事件中安装 `self.onerror` 全局捕获。
**原因**: Service Worker 中的未捕获错误会导致 SW 被终止，用户无感知。全局捕获后可以通过 chrome.notifications 提示用户。
**注意**: Service Worker 没有 window 对象，需要适配。

### D035-4: _locales 创建
**决策**: 创建 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json`，覆盖 manifest 级别字段。
**原因**: manifest.json 使用 `__MSG_extName__` 但没有 locale 文件，Chrome Web Store 提交会失败。
**实现**: 最小化 — 只覆盖 extName 和 extDescription。

## 需要修改的文件列表

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `lib/ai-client.js` | 修改 | 导入 error-handler，catch 块使用 classifyAIError |
| `lib/knowledge-base.js` | 修改 | 导入 classifyStorageError，IndexedDB 错误分类 |
| `background/service-worker.js` | 修改 | 安装全局错误捕获 |
| `_locales/en/messages.json` | 新建 | 英文 locale |
| `_locales/zh_CN/messages.json` | 新建 | 中文 locale |
| `manifest.json` | 检查 | 确认 default_locale |

## 测试策略

1. 现有 1873 测试必须全部通过（不回归）
2. 新增测试文件 `tests/test-error-handler-integration.js`：
   - 测试 ai-client 抛出的错误包含 classified 属性
   - 测试 knowledge-base 的 storage 错误被正确分类
   - 测试 retryWithBackoff 在 ai-client 中的行为

## 已知风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| ai-client 错误格式改变导致 sidebar.js 的 classifyAIError 匹配失败 | 中 | 错误提示变 generic | 保持错误消息中包含关键字（如 "API 401"） |
| Service Worker 全局错误捕获与 Chrome 内部机制冲突 | 低 | SW 崩溃 | 测试后验证 |
