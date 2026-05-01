# IMPLEMENTATION — Iteration #35

> **日期**: 2026-05-01
> **任务**: R35: 统一错误处理集成 + _locales 国际化基础

---

## 实际实现内容

### R35-A: error-handler.js 全模块集成

#### lib/ai-client.js（Sub Agent 实现）
- 导入 `classifyAIError`, `ErrorType` from `./error-handler.js`
- `chat()` 方法：网络错误和 API 错误的 catch 块中使用 `classifyAIError()` 分类，错误对象附加 `.classified` 属性
- `chatStream()` 方法：同上处理
- `listModels()` 方法：API 错误使用 `classifyAIError()` 分类
- Claude 流解析错误事件：使用 `classifyAIError()` 分类
- **兼容性**: 保持原始错误消息格式（如 "API 401:", "网络错误:"），确保 sidebar.js 现有的 classifyAIError 调用不受影响

#### lib/knowledge-base.js（Sub Agent 实现）
- 导入 `classifyStorageError` from `./error-handler.js`
- `open()` IndexedDB 错误：使用 `classifyStorageError()` 分类
- `saveEntry()` 错误：使用 `classifyStorageError()` 分类
- `updateEntry()` 错误（getReq 和 putReq）：使用 `classifyStorageError()` 分类
- `deleteEntry()` 错误：使用 `classifyStorageError()` 分类
- `getEntry()` 错误：使用 `classifyStorageError()` 分类
- `getAllEntries()` 游标错误：使用 `classifyStorageError()` 分类
- 所有错误对象附加 `.classified` 属性

#### background/service-worker.js（Sub Agent 实现 + Guard Agent 修正）
- 添加全局错误捕获：`self.onerror` + `self.addEventListener('unhandledrejection')`
- Guard Agent 移除未使用的 `classifyAIError` import

### R35-B: _locales 国际化基础（Plan Agent 实现）

#### _locales/en/messages.json（新建）
- extName: "PageWise - AI Reading Assistant"
- extDescription: Chrome Web Store 英文描述

#### _locales/zh_CN/messages.json（新建）
- extName: "智阅 PageWise"
- extDescription: Chrome Web Store 中文描述

#### manifest.json（无需修改）
- 已有 `default_locale: "zh_CN"` 配置

---

## 测试结果
- 总测试: 1873
- 通过: 1873
- 失败: 0
- 回归: 无

## Git 提交
```
2de3271 feat: add global error capture to service-worker - R35
+ Guard Agent: remove unused import
```
