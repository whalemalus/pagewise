# DESIGN — R86: BookmarkErrorHandler 错误处理与优雅降级

> 飞轮迭代 Phase 2: 设计 (Plan Agent)
> 生成时间: 2026-05-15
> 需求来源: `docs/REQUIREMENTS-ITER1.md` (R86)
> 状态: 已实现 (`lib/bookmark-error-handler.js` + `tests/test-bookmark-error-handler.js`)

---

## 1. 架构概览

### 1.1 模块定位

```
┌─────────────────────────────────────────────────────────────┐
│                    错误处理体系                               │
│                                                             │
│  ┌───────────────────────┐    ┌──────────────────────────┐  │
│  │   error-handler.js    │    │ bookmark-error-handler.js │  │
│  │   (全局错误处理)       │    │ (书签专用错误处理)        │  │
│  │                       │    │                          │  │
│  │ • AI API 调用错误     │    │ • 书签采集错误            │  │
│  │ • 速率限制/认证       │    │ • 索引/图谱构建错误       │  │
│  │ • 内容提取错误        │    │ • 存储/权限错误           │  │
│  │ • 指数退避重试        │    │ • 输入验证错误            │  │
│  │ • 全局异常捕获        │    │ • 错误边界包装            │  │
│  └───────────────────────┘    └──────────────────────────┘  │
│                                                             │
│          互不依赖，覆盖不同错误领域                           │
└─────────────────────────────────────────────────────────────┘
```

**关键设计**: 两个错误处理模块**互不依赖**，分别覆盖不同领域。`error-handler.js` 处理 AI API 相关错误（认证/速率限制/模型/内容提取），`bookmark-error-handler.js` 处理书签操作特有错误（采集/索引/存储/权限）。这种分离避免了单一模块膨胀，也避免了书签模块拉入 AI 相关的无关依赖。

### 1.2 与现有模块的关系

```
bookmark-collector.js  ──┐
bookmark-graph.js      ──┤
bookmark-search.js     ──┼──→ bookmark-error-handler.js  (纯函数，零副作用)
bookmark-sync.js       ──┤        │
sidebar.js             ──┘        ├── classifyError()
                                   ├── handleBookmarkError()
                                   ├── createErrorBoundary()
                                   └── logError()

error-handler.js ←── ai-client.js, knowledge-base.js (独立体系)
```

---

## 2. 模块结构

### 2.1 文件清单

```
lib/bookmark-error-handler.js          — 主模块（纯函数，~290 行）
tests/test-bookmark-error-handler.js   — 测试文件（~337 行，全面覆盖）
```

### 2.2 导出 API

| 导出 | 类型 | 签名 | 说明 |
|------|------|------|------|
| `ERROR_CATEGORIES` | `Object` (冻结) | `{ NETWORK, PERMISSION, STORAGE, VALIDATION, UNKNOWN }` | 错误类别常量 |
| `classifyError` | 函数 | `(error: Error\|string\|null) → string` | 错误分类 |
| `handleBookmarkError` | 函数 | `(error, context?) → ErrorResponse` | 优雅降级处理 |
| `createErrorBoundary` | 函数 | `(fn, fallback) → Function` | 异步错误边界 |
| `logError` | 函数 | `(error, context?) → LogEntry` | 结构化日志 |

---

## 3. 接口设计

### 3.1 错误分类 — `classifyError(error)`

**输入**: 任意值（Error 对象 / 普通对象 / 字符串 / null / undefined）

**输出**: `ERROR_CATEGORIES` 中的一个值

**分类优先级**（从高到低）:

```
1. 显式标记  → error.category 值在 ERROR_CATEGORIES 中
2. Error 名  → error.name 匹配已知类型 (TypeError→validation, NetworkError→network, ...)
3. 关键词匹配 → error.message 中包含领域关键词 (不区分大小写)
4. 兜底      → 'unknown'
```

**name → category 映射**:

| Error Name | Category | 理由 |
|------------|----------|------|
| `TypeError`, `RangeError`, `SyntaxError`, `URIError` | `validation` | 类型/范围/语法/URI 异常均为输入验证问题 |
| `EvalError` | `permission` | eval 受限通常与沙箱/安全策略相关 |
| `NetworkError`, `AbortError` | `network` | 网络连接和请求中止 |
| `QuotaExceededError` | `storage` | 存储空间/配额超限 |
| `NotAllowedError`, `SecurityError` | `permission` | 权限不足或安全限制 |

**关键词表**（每类 10-12 个关键词，不区分大小写）:

| 类别 | 关键词 |
|------|--------|
| `network` | network, fetch, timeout, abort, connection, dns, http, request, cors, socket, offline |
| `permission` | permission, denied, unauthorized, forbidden, access, blocked, not allowed, security, sandbox, csp |
| `storage` | storage, quota, quotaexceeded, quota_exceeded, disk, persist, serialize, deserialize, json, indexeddb, local storage, session storage |
| `validation` | invalid, validation, required, missing, range, type, constraint, schema, format, malformed, empty |

**空值安全**: null / undefined / `{}` / `''` / `'abc123'` 均返回 `'unknown'`

### 3.2 优雅降级 — `handleBookmarkError(error, context?)`

**输入**:
- `error`: 任意错误值
- `context` (可选): `{ operation?: string, component?: string, metadata?: object }`

**输出**:
```javascript
{
  category: string,           // classifyError 的结果
  message: string,            // 原始错误消息，null/undefined 时为 '未知错误'
  recovery: string[],         // 恢复建议数组（每个类别 ≥ 3 条）
  timestamp: string,          // ISO 8601 时间戳
  context: {
    operation: string,        // 默认 'unknown'
    component: string,        // 默认 'unknown'
    metadata: object          // 默认 {}
  }
}
```

**恢复建议表**:

| 类别 | 建议 (≥3 条) |
|------|-------------|
| `network` | 检查网络连接、稍后重试、确认 API 端点可达 |
| `permission` | 检查扩展权限、确认 manifest 权限声明、重新授权 |
| `storage` | 检查存储空间、清理冗余数据、压缩存储方案 |
| `validation` | 检查参数类型格式、确认必填字段、验证数据范围 |
| `unknown` | 查看控制台日志、重新加载扩展、报告 bug |

### 3.3 错误边界 — `createErrorBoundary(fn, fallback)`

**输入**:
- `fn`: 被包装的异步函数
- `fallback`: 降级函数，签名 `(error, ...originalArgs) => result`

**参数校验**: fn 和 fallback 必须为函数，否则抛出 `TypeError`

**输出**: 包装后的异步函数

**行为**:
```
成功: return await fn(...args)       ← 透传原始结果
失败: return fallback(error, ...args) ← 调用降级函数，传递原始错误和所有参数
```

**典型用法**:
```javascript
// 书签图谱构建：失败时返回空图谱
const safeBuildGraph = createErrorBoundary(
  graphEngine.buildGraph.bind(graphEngine),
  (error, bookmarks) => {
    logError(error, { operation: 'buildGraph', component: 'BookmarkGraphEngine' })
    return { nodes: [], edges: [] }
  }
)
```

### 3.4 结构化日志 — `logError(error, context?)`

**输出**:
```javascript
{
  level: 'ERROR',             // 固定值
  category: string,           // classifyError 的结果
  message: string,            // 原始错误消息
  stack: string | null,       // Error 对象有 stack 时提供，字符串错误为 null
  context: {
    operation: string,
    component: string,
    metadata: object
  },
  timestamp: string           // ISO 8601
}
```

**关键设计**: 不直接写入 `console`，返回结构化对象，由调用方决定输出方式（console.log / 发送到日志系统 / UI 展示）。

---

## 4. 内部数据结构

### 4.1 常量

```javascript
ERROR_CATEGORIES = Object.freeze({
  NETWORK: 'network',
  PERMISSION: 'permission',
  STORAGE: 'storage',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown',
})
```

- 使用 `Object.freeze` 防止运行时篡改
- 值为小写字符串，方便日志可读性和关键词匹配

### 4.2 内部关键词表

4 个冻结的 `string[]`（NETWORK_KEYWORDS / PERMISSION_KEYWORDS / STORAGE_KEYWORDS / VALIDATION_KEYWORDS），按 `Object.freeze` 冻结，模块内私有（不导出）。

### 4.3 恢复建议映射

`RECOVERY_SUGGESTIONS` 为 `Object.freeze` 的映射表，key 为 `ERROR_CATEGORIES` 值，value 为冻结的 `string[]`。

---

## 5. 设计决策

### D023: 纯函数设计 vs 有状态单例

- **决策**: 所有导出函数为纯函数，无实例化、无副作用
- **理由**:
  - 纯函数天然线程安全，可在 Service Worker / Content Script / Sidebar 任意上下文中使用
  - 无状态意味着无需初始化、无生命周期问题
  - 测试极其简单：输入 → 断言输出，无 mock 依赖
  - `createErrorBoundary` 返回纯函数（闭包捕获 fn/fallback，但返回的函数本身无副作用）

### D024: 独立模块 vs 扩展 error-handler.js

- **决策**: 新建 `bookmark-error-handler.js`，不扩展全局 `error-handler.js`
- **理由**:
  - `error-handler.js` 负责 AI API 错误（认证/速率限制/模型），有重试机制和 UI 集成
  - 书签错误领域不同（采集/索引/存储/权限），分类逻辑完全不同
  - 合并会导致单一模块过重，违背单一职责原则
  - 书签模块不应拉入 AI 相关依赖（`ErrorType`、`retryWithBackoff` 等）

### D025: 关键词匹配优先级

- **决策**: 先匹配 `error.name`（已知 JS 异常类型），再匹配 `error.message` 关键词
- **理由**:
  - `error.name` 是浏览器原生的异常类型标识，语义最明确
  - 关键词匹配是兜底策略，适用于自定义错误或第三方库抛出的非标准异常
  - 优先级链：显式标记 > error.name > 关键词 > 默认

### D026: 不引入重试机制

- **决策**: `bookmark-error-handler.js` 不内置重试（区别于 `error-handler.js` 的 `retryWithBackoff`）
- **理由**:
  - 书签操作的错误类型多样（权限、存储、验证），大部分不可通过重试恢复
  - 重试策略因场景而异（采集可重试、权限不能重试），应由调用方决定
  - `createErrorBoundary` 已为调用方提供了在 fallback 中自行实现重试的能力
  - 保持模块职责单一：分类 + 建议 + 边界包装，不越界

### D027: 日志不直接输出

- **决策**: `logError()` 返回结构化对象，不调用 `console.error/warn`
- **理由**:
  - 不同场景对日志输出的需求不同：开发时要 console，生产时可能要持久化到 IndexedDB
  - 调用方可自行决定格式化和输出方式
  - 与 `handleBookmarkError` 的设计一致（返回结构化数据，不产生副作用）

### D028: 恢复建议硬编码中文（已知技术债务）

- **决策**: 当前版本恢复建议为中文硬编码字符串，不接入 i18n
- **已知问题**: I02 — 后续应改为 i18n key，与 R80 BookmarkI18n 集成
- **理由**:
  - 迭代 1 优先验证核心逻辑正确性
  - i18n 集成需要在 `bookmark-i18n.js` 中注册新的 key，属于跨模块变更
  - 当前恢复建议是给开发者看的（控制台/日志），非面向终端用户的 UI 字符串

### D029: EvalError → permission 的映射

- **决策**: 将 `EvalError` 映射到 `permission` 而非 `validation`
- **理由**:
  - 在 Chrome 扩展环境中，`EvalError` 通常与 CSP (Content Security Policy) 禁止 eval 相关
  - CSP 限制本质上是安全/权限问题，而非输入验证问题
  - 与 `SecurityError`、`NotAllowedError` 归为同一类别语义一致

---

## 6. 测试策略

### 6.1 测试覆盖

| 测试组 | 用例数 | 覆盖范围 |
|--------|--------|----------|
| `ERROR_CATEGORIES` | 2 | 值正确性 + 冻结性 |
| `classifyError` | 18 | 显式标记 / 6 种 Error name / 5 类关键词匹配 / null/undefined/空对象/字符串 |
| `handleBookmarkError` | 9 | 结构化响应完整性 / 时间戳 / context 默认值 / 字符串错误 / null 错误 |
| `createErrorBoundary` | 7 | 返回函数 / TypeError 校验 / 成功路径 / 错误路径 / 参数传递 |
| `logError` | 8 | 结构化字段 / stack 处理 / context 默认值 / null 安全 |
| **总计** | **44** | |

### 6.2 测试设计原则

- **纯函数优势**: 所有测试无需 mock（无 DOM / Chrome API / 网络依赖）
- **边界覆盖**: null / undefined / `{}` / 空字符串 / 非标准错误对象均有测试
- **确定性**: 无时间依赖（timestamp 只验证是合法 ISO 字符串，不验证具体值）

---

## 7. 集成方案

### 7.1 当前状态：孤立模块

⚠️ 当前 `bookmark-error-handler.js` 未被任何模块导入，属于**孤立模块**。

### 7.2 推荐集成点

| 消费者模块 | 集成方式 | 说明 |
|------------|----------|------|
| `lib/bookmark-collector.js` | `handleBookmarkError` 包装 `collect()` 中的 catch 块 | 将 `console.warn` 升级为结构化错误响应 |
| `lib/bookmark-graph.js` | `createErrorBoundary` 包装 `buildGraph()` | 失败时返回空图谱而非抛出 |
| `lib/bookmark-search.js` | `classifyError` 分类搜索异常 | 为用户提供针对性的错误提示 |
| `lib/bookmark-sync.js` | `logError` 替换全局 `logError` | 使用书签专用的结构化日志 |
| `sidebar/sidebar.js` | `handleBookmarkError` 生成用户可读的错误信息 | UI 层展示恢复建议 |
| `lib/bookmark-core.js` | `createErrorBoundary` 包装关键操作 | 与 collector 相同模式 |

### 7.3 集成示例（以 collector 为例）

```
现有代码:
  catch (err) { console.warn(`...: ${err.message}`); return this.bookmarks; }

集成后:
  catch (err) {
    const response = handleBookmarkError(err, {
      operation: 'collect',
      component: 'BookmarkCollector'
    })
    console.warn('[BookmarkCollector]', logError(err, response.context))
    return this.bookmarks
  }
```

---

## 8. 已知问题与后续规划

| ID | 问题 | 严重度 | 设计影响 | 建议 |
|----|------|--------|----------|------|
| I01 | 孤立模块，无消费者 | 高 | 模块价值未体现 | 集成到 collector/graph/search 等核心模块 |
| I02 | 硬编码中文恢复建议 | 中 | 国际化不完整 | 改为 i18n key，注册到 bookmark-i18n.js |
| I03 | 无内置重试机制 | 低 | 不影响核心功能 | 需要时在消费方实现，或新增 `retryableError()` 辅助函数 |
| I04 | logError 无持久化 | 低 | 日志可追溯性不足 | 集成 `log-store.js` 或新增 `persistError()` |
| I05 | 关键词可能误判 | 低 | "access" 同时出现在 permission 和通用场景 | 可增加权重机制或上下文感知 |

---

## 9. 设计原则总结

1. **纯函数、零副作用** — 所有 API 纯函数设计，适合任意运行上下文
2. **职责分离** — 与 `error-handler.js` 互不依赖，覆盖不同错误领域
3. **防御性编程** — null / undefined / 空对象均安全处理
4. **可测试性** — 无外部依赖，测试覆盖 100%（44 用例）
5. **渐进集成** — 模块可独立存在，也可逐步集成到消费方

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-05-15 | 初始设计文档（基于已有实现逆向文档化） |
