# REQUIREMENTS — R36: AI Client E2E 测试

> **任务**: R36: AI Client E2E — API 调用、流式解析、错误重试、超时处理、模型切换
> **模块**: `lib/ai-client.js` + `lib/error-handler.js`（retryWithBackoff）
> **日期**: 2026-05-01
> **测试文件**: `tests/test-ai-client-e2e.js`（扩展现有 20 个用例）

---

## 1. 用户故事

作为 PageWise 开发者，我需要全面的 AI Client E2E 测试覆盖，以确保在各种 API 协议、网络条件、错误场景和模型切换下，AI 调用链路可靠运行，不出现静默失败或数据丢失。

## 2. 验收标准

### AC-1: API 调用 — 双协议完整覆盖
- [ ] OpenAI 协议：`chat()` 成功调用，返回 `{ content, usage, model }`
- [ ] Claude 协议：`chat()` 成功调用，返回 `{ content, usage, model }`
- [ ] 请求体结构正确性验证（URL、headers、body 字段逐一断言）
- [ ] `options.systemPrompt` / `options.model` / `options.maxTokens` 覆盖（运行时参数覆盖构造函数默认值）
- [ ] 多轮消息传递正确性（messages 数组顺序不变、system prompt 位置正确）

### AC-2: 流式解析 — SSE 解析与边界处理
- [ ] OpenAI SSE 格式：多 chunk 逐块 yield，收到 `[DONE]` 正常终止
- [ ] Claude SSE 格式：`content_block_delta` 事件逐块 yield，收到 `[DONE]` 正常终止
- [ ] 混合内容行：包含非 `data:` 前缀的注释/空行被正确跳过
- [ ] 跨 chunk 分割：一个 SSE 事件被拆到两个 TCP chunk（buffer 拼接）时正确重组
- [ ] 流式错误事件：Claude 协议中收到 `type: "error"` 事件时抛出分类错误
- [ ] `response.body` 为 null 时降级到非流式 `chat()` 并 yield 完整结果

### AC-3: 错误分类与重试
- [ ] HTTP 401/403 → `ErrorType.AUTH`，`retryable: false`
- [ ] HTTP 404 → `ErrorType.MODEL_NOT_FOUND`，`retryable: false`
- [ ] HTTP 413 → `ErrorType.TOKEN_LIMIT`，`retryable: false`
- [ ] HTTP 429 → `ErrorType.RATE_LIMIT`，`retryable: true`
- [ ] HTTP 500/502/503 → `ErrorType.SERVER_ERROR`，`retryable: true`
- [ ] 网络层错误（TypeError: Failed to fetch）→ `ErrorType.NETWORK`，`retryable: true`
- [ ] `retryWithBackoff` 对 429 错误执行指数退避重试（最多 3 次）
- [ ] `retryWithBackoff` 对非 429 错误立即抛出（不重试）
- [ ] 所有错误对象都携带 `.classified` 字段（`{ type, message, retryable, originalMessage }`）

### AC-4: 超时处理与请求取消
- [ ] 传入 `AbortController.signal`，abort 后抛出 `AbortError`
- [ ] AbortError 被分类为 `ErrorType.TIMEOUT`，`retryable: true`
- [ ] 超时后流式迭代器（`chatStream`）正确终止，不产生悬挂 Promise
- [ ] `chat()` 和 `chatStream()` 都正确传递 `signal` 到 `fetch()`

### AC-5: 模型切换
- [ ] 运行时通过 `options.model` 覆盖 `client.model`（构造函数默认值不变）
- [ ] `listModels()` — Claude 协议返回 3 个预设模型
- [ ] `listModels()` — OpenAI 协议调用 `GET /v1/models` 并返回排序列表
- [ ] `listModels()` — API 失败时抛出错误
- [ ] 切换协议后 `isClaude()` / `isOpenAI()` 返回正确值
- [ ] `testConnection()` — 成功返回 `{ success, model, protocol }`
- [ ] `testConnection()` — 失败返回 `{ success: false, error, protocol }`

### AC-6: 缓存增强（cachedChat / cachedChatStream）
- [ ] `cachedChat()` — 缓存未命中时调用 `chat()` 并返回 `fromCache: false`
- [ ] `cachedChat()` — 缓存命中时直接返回缓存结果，`fromCache: true`，不发起 fetch
- [ ] `cachedChatStream()` — 缓存命中时一次性 yield 完整缓存内容
- [ ] `cachedChatStream()` — 缓存未命中时正常流式 yield 并在完成后存入缓存
- [ ] 含图片的消息不进入缓存（`generateCacheKey` 返回 null）

### AC-7: 业务方法完整性
- [ ] `askAboutPage()` — 正确拼接对话历史 + 页面问题消息
- [ ] `askAboutPageStream()` — 流式版本正确 yield
- [ ] `generateSummaryAndTags()` — 正常 JSON 响应解析为 `{ summary, tags }`
- [ ] `generateSummaryAndTags()` — 非 JSON 响应回退为 `{ summary: 内容前200字, tags: ['未分类'] }`
- [ ] `generateSummaryAndTags()` — JSON 嵌在 markdown 代码块中时仍能提取
- [ ] `buildPageQuestionPrompt()` — 包含选中文本时拼接 selection 段
- [ ] `buildPageQuestionPrompt()` — 页面内容超过 8000 字符时截断
- [ ] `buildPageQuestionPrompt()` — 无页面内容时包含兜底提示

### AC-8: Token 估算函数
- [ ] `estimateTokens()` — 正常文本按 `length/3` 向上取整
- [ ] `estimateTokens()` — 空/null/undefined/非字符串返回 0
- [ ] `estimateMessagesTokens()` — 每条消息 4 token 开销 + 内容 token
- [ ] `estimateMessagesTokens()` — 空数组 / 非数组返回 0

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 测试框架 | `node:test`（describe/it/beforeEach/afterEach） |
| 断言库 | `node:assert/strict` |
| 模块系统 | ES Module 动态 import |
| fetch Mock | 全局 `globalThis.fetch` 注入/恢复（现有 mockFetch 模式） |
| Chrome Mock | `tests/helpers/chrome-mock.js`（AIClient 本身不依赖 Chrome API，但 import 链可能需要） |
| IndexedDB Mock | `tests/helpers/indexeddb-mock.js` |
| 无外部依赖 | 不引入 nock/msw/sinon 等第三方 mock 库 |
| 测试隔离 | 每个测试前后恢复 fetch/Chrome/IndexedDB 状态 |
| SSE Mock | 使用 ReadableStream + TextEncoder 模拟真实 SSE 响应 |
| 测试数量 | 本次扩展后总用例数 ≥ 45（现有 20 + 新增 25+） |

## 4. 依赖关系

### 模块依赖
| 模块 | 路径 | 依赖类型 |
|------|------|----------|
| AIClient | `lib/ai-client.js` | 被测主体 |
| error-handler | `lib/error-handler.js` | `classifyAIError` / `ErrorType` / `retryWithBackoff` |
| ai-cache | `lib/ai-cache.js` | `AICache` / `generateCacheKey`（cachedChat 测试需要） |
| chrome-mock | `tests/helpers/chrome-mock.js` | 测试基础设施 |
| indexeddb-mock | `tests/helpers/indexeddb-mock.js` | 测试基础设施 |

### 测试数据依赖
| 数据 | 说明 |
|------|------|
| OpenAI SSE 样本 | `data: {"choices":[{"delta":{"content":"X"}}]}` 格式 |
| Claude SSE 样本 | `data: {"type":"content_block_delta","delta":{"text":"X"}}` 格式 |
| 错误响应模板 | 401/403/404/413/429/500/502/503 状态码 + JSON error body |
| 大消息数组 | 用于 token 估算和大上下文测试（100+ 消息） |

### 上下游关系
```
R36 (AI Client E2E) ──→ R37 (AI Cache E2E)
                     ──→ R50 (Error Handler 集成)
                     ──→ R46 (AI Pipeline 集成)

R36 不依赖其他 E2E 测试，可独立执行。
R36 的测试模式和 mock 工具可被 R37、R46 复用。
```

---

## 5. 现有覆盖分析与新增范围

### 已有覆盖（20 用例，保留）
| # | 测试点 | 分类 |
|---|--------|------|
| 1-3 | 构造函数默认值/自定义/baseUrl 清理 | 基础 |
| 4-5 | 协议判断 isClaude/isOpenAI | 基础 |
| 6-7 | buildRequest OpenAI/Claude | 基础 |
| 8-9 | parseResponse 双协议 | 基础 |
| 10-11 | chat 成功调用 双协议 | API 调用 |
| 12-13 | chat 错误处理（401、网络） | 错误 |
| 14-15 | chatStream OpenAI/Claude SSE | 流式 |
| 16 | chatStream body=null 降级 | 流式 |
| 17-19 | listModels 双协议 + 失败 | 模型 |
| 20-22 | testConnection 成功/失败/Claude | 模型 |
| 23 | getSystemPrompt | 基础 |
| 24-27 | buildPageQuestionPrompt 4 场景 | 业务 |
| 28-29 | askAboutPage + 带历史 | 业务 |
| 30-32 | generateSummaryAndTags 3 场景 | 业务 |
| 33-35 | estimateTokens 3 场景 | 工具 |
| 36-39 | estimateMessagesTokens 4 场景 | 工具 |
| 40 | chatStream 网络错误 | 错误 |
| 41 | chatStream API 429 错误 | 错误 |

### 本次新增范围（25+ 用例）
| 分类 | 新增测试点 | 预计用例数 |
|------|-----------|-----------|
| **错误分类完善** | 500/502/503 → SERVER_ERROR、404 → MODEL_NOT_FOUND、413 → TOKEN_LIMIT | 5 |
| **重试机制** | retryWithBackoff 对 429 指数退避重试、非 429 不重试、重试回调 | 3 |
| **超时/取消** | AbortController signal 传递、AbortError 分类、流式 abort 终止 | 3 |
| **模型切换** | options.model 运行时覆盖、协议切换后状态正确 | 2 |
| **流式边界** | 跨 chunk buffer 拼接、非 data 行跳过、Claude error 事件 | 3 |
| **缓存增强** | cachedChat 命中/未命中、cachedChatStream 流式缓存、图片不缓存 | 4 |
| **Vision 格式** | image_url 双向转换（OpenAI ↔ Claude 格式） | 2 |
| **总新增** | | **22+** |

---

## 6. 质量门控

- 所有测试通过（0 failures）
- 测试总数 ≥ 45（现有 ~41 + 新增 ~22 = ~63，含保留和新增）
- 测试文件: `tests/test-ai-client-e2e.js`
- 发现的设计问题记录到 `docs/ISSUES.md`
- 完成后更新 `docs/TODO.md` R36 状态为 `[x]`

---

## 7. 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-05-01 | 初始化 R36 需求文档 |
