# 需求文档 — R86: BookmarkErrorHandler 错误处理与优雅降级

> 飞轮迭代 Phase 1: 需求分析 (Plan Agent)
> 生成时间: 2026-05-15
> 状态: ✅ 已实现（`lib/bookmark-error-handler.js` + `tests/test-bookmark-error-handler.js`）

---

## 背景

BookmarkGraph 模块群（collector / indexer / graph / search / recommend 等 30+ 模块）在执行过程中可能遇到网络超时、权限不足、存储空间满、输入非法等异常。需要一个统一的错误处理层，对异常进行分类、提供恢复建议、支持错误边界包装，保证书签功能在部分异常下仍能优雅降级而非整体崩溃。

**与全局 `error-handler.js` 的关系**: `error-handler.js` 负责 AI API 调用错误（认证/速率限制/模型）和内容提取错误；`bookmark-error-handler.js` 负责书签操作特有的错误场景（书签采集/索引/存储/权限），两者互不依赖，覆盖不同领域。

---

## 用户故事

> 作为 PageWise 用户，当书签操作遇到错误时（网络中断、存储空间不足、权限缺失等），我希望看到清晰的错误提示和可操作的恢复建议，而不是看到浏览器控制台报错或功能完全不可用。

---

## 验收标准

1. **错误分类完整** — `classifyError(error)` 能将任意输入（Error 对象 / 字符串 / null / undefined）正确分类为 5 个类别之一：`network` | `permission` | `storage` | `validation` | `unknown`
2. **优雅降级响应** — `handleBookmarkError(error, context)` 返回结构化响应，包含类别、原始消息、恢复建议数组、ISO 时间戳和上下文信息；每个错误类别至少有 3 条恢复建议
3. **错误边界包装** — `createErrorBoundary(fn, fallback)` 为异步函数创建错误边界：成功时透传结果，失败时调用 fallback 并传递原始错误和参数；fn/fallback 非函数时抛出 TypeError
4. **结构化日志** — `logError(error, context)` 返回结构化日志对象（level / category / message / stack / context / timestamp），不直接写入 console
5. **纯函数设计** — 所有导出函数为纯函数（无副作用），不依赖 DOM 或 Chrome API

---

## 功能需求

### 1. 错误分类 (classifyError)

- **分类逻辑**（优先级从高到低）:
  1. 显式 `error.category` 字段（如已标记）
  2. `error.name` 匹配已知类型（TypeError/RangeError→validation, NetworkError/AbortError→network, QuotaExceededError→storage, NotAllowedError/SecurityError→permission）
  3. `error.message` 关键词匹配（11 个 network 关键词、10 个 permission 关键词、12 个 storage 关键词、11 个 validation 关键词）
  4. 默认返回 `unknown`
- **关键词匹配**: 不区分大小写
- **空值安全**: null / undefined / 空对象 / 无意义字符串均返回 `unknown`

### 2. 优雅降级 (handleBookmarkError)

- 返回格式: `{ category, message, recovery: string[], timestamp, context: { operation, component, metadata } }`
- 恢复建议按类别差异化:
  - **network**: 检查网络、稍后重试、确认 API 可达
  - **permission**: 检查权限、确认 manifest、重新授权
  - **storage**: 检查存储空间、清理冗余数据、压缩存储
  - **validation**: 检查类型格式、确认必填字段、验证数据范围
  - **unknown**: 查看控制台、重新加载、报告 bug
- context 参数可选，提供 operation/component/metadata 默认值

### 3. 错误边界 (createErrorBoundary)

- 参数校验: fn 和 fallback 必须是函数，否则抛出 TypeError
- 包装逻辑: `async (...args) => { try { return await fn(...args) } catch(e) { return fallback(e, ...args) } }`
- fallback 签名: `(error, ...originalArgs) => result`

### 4. 结构化日志 (logError)

- 返回格式: `{ level: 'ERROR', category, message, stack, context, timestamp }`
- stack 仅在 error 为对象且有 stack 属性时提供，字符串错误为 null
- 不直接输出 console，由调用方决定输出方式

---

## 技术约束

| 约束 | 说明 |
|------|------|
| 模块类型 | 纯 ES Module，4 个命名导出 + 1 个常量导出 |
| 无 DOM 依赖 | 全部为纯函数，可在 Service Worker / Content Script / Sidebar 中使用 |
| 无 Chrome API 依赖 | 不调用 chrome.* API |
| 无构建工具 | 直接加载源文件 |
| 编码风格 | `const/let`，禁止 `var`，无分号，`Object.freeze` 冻结常量 |
| 测试框架 | `node:test` + `node:assert/strict` |
| 常量导出 | `ERROR_CATEGORIES` 为冻结对象，包含 5 个分类值 |

---

## 依赖关系

| 方向 | 模块 | 说明 |
|------|------|------|
| 被依赖 | *(无)* | ⚠️ 当前未被任何模块导入，属于**孤立模块** |
| 可集成 | `lib/bookmark-collector.js` | 书签采集错误应使用 `handleBookmarkError` |
| 可集成 | `lib/bookmark-graph.js` | 图谱构建错误应使用 `createErrorBoundary` |
| 可集成 | `lib/bookmark-search.js` | 搜索异常应使用 `classifyError` 分类 |
| 可集成 | `lib/bookmark-sync.js` | 同步错误可复用（当前使用全局 `logError`） |
| 可集成 | `sidebar/sidebar.js` | UI 层可用 `logError` 生成结构化日志 |
| 无依赖 | `lib/error-handler.js` | 两个模块各自独立，覆盖不同错误领域 |

---

## 已知问题与改进方向

| ID | 问题 | 严重度 | 建议 |
|----|------|--------|------|
| I01 | **孤立模块** — 无任何模块导入使用 | 高 | 应集成到 collector/graph/search 等核心书签模块 |
| I02 | **硬编码中文** — 恢复建议为中文字符串，未接入 i18n | 中 | 应改为 i18n key，与 R80 BookmarkI18n 集成 |
| I03 | **无重试机制** — 只提供分类和建议，无内置重试 | 低 | 可参考全局 `retryWithBackoff` 添加书签操作重试 |
| I04 | **无错误上报/聚合** — logError 只返回对象，无持久化 | 低 | 可集成 `log-store.js` 进行错误日志持久化 |
| I05 | **关键词可能误判** — "access" 同时出现在 permission 和通用场景 | 低 | 可增加权重机制或上下文感知 |

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-05-15 | 初始创建 R86 需求文档（基于已有实现逆向文档化） |
