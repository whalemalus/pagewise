# REQUIREMENTS — Iteration #35

> **任务**: R35: 统一错误处理集成 + _locales 国际化基础
> **复杂度**: Complex（4+ 文件，架构级变更）
> **日期**: 2026-05-01

---

## R35-A: error-handler.js 全模块集成

### 用户故事
作为用户，当 AI 请求失败、存储异常或网络错误时，我希望能看到友好的错误提示（而非白屏或无响应），并且错误被统一记录便于排查。

### 验收标准
1. `lib/error-handler.js` 被所有主要模块导入并使用（至少 sidebar.js, ai-client.js, knowledge-base.js, wiki-store.js, conversation-store.js）
2. 所有异步操作（fetch, IndexedDB 操作）包裹在 try-catch 中，调用 `ErrorHandler.handle()` 或 `ErrorHandler.wrapAsync()`
3. 错误分类：`network`, `api`, `storage`, `permission`, `unknown` 五类
4. 用户可见错误通过 Toast 通知展示（复用现有 Toast 系统）
5. 所有现有测试继续通过（1873+ tests）
6. 新增 error-handler 集成测试

### 技术约束
- 不引入新的错误处理库，使用现有 `lib/error-handler.js`
- 保持 ES Module 风格
- 不改变现有 API 接签名

### 依赖
- `lib/error-handler.js`（已存在）
- `lib/toast.js` 或等效 Toast 系统（已存在）

---

## R35-B: _locales 国际化基础

### 用户故事
作为英语用户，Chrome Web Store 页面和扩展名称应正确显示英文；作为中文用户，界面默认中文。

### 验收标准
1. 创建 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json`
2. `manifest.json` 中的 `__MSG_extName__` 和 `__MSG_extDescription__` 正确解析
3. 至少覆盖 manifest 级别的国际化（扩展名、描述）
4. 不破坏现有功能

### 技术约束
- Chrome Extension i18n 标准格式
- 默认语言: zh_CN

### 依赖
- 无
