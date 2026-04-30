# 设计文档 — 迭代 #5: AI 响应缓存

> 日期: 2026-04-30
> 状态: 实现中

---

## 1. 概述

本轮迭代实现 **AI 响应缓存**，核心目标是避免对相同或高度相似的请求重复调用 AI API，从而：
- 节省 API 费用（用户重复提问同一页面同一问题时直接返回缓存）
- 降低响应延迟（缓存命中时 0 网络开销）
- 减少不必要的 API 调用（技能触发、自动摘要等场景）

### 数据流

```
用户提问 → sendMessage()
              ↓
    generateCacheKey(messages, systemPrompt, model, ...)
              ↓
    cache.get(key) 命中？
      ├─ 是 → 直接返回缓存响应（标记为 cached）
      └─ 否 → AIClient.chatStream(messages, ...)
                  ↓
        完整响应收集中...
                  ↓
        cache.set(key, fullResponse) 存入缓存
                  ↓
        返回响应给用户
```

---

## 2. 需要修改的文件列表

| 文件 | 变更类型 | 改动范围 |
|------|----------|----------|
| `lib/ai-cache.js` | 新建 | AI 响应缓存核心模块 |
| `lib/ai-client.js` | 修改 | 新增 `cachedChat()` 和 `cachedChatStream()` 方法 |
| `sidebar/sidebar.js` | 修改 | `sendMessage()` 中集成缓存查询/存储逻辑 |
| `tests/test-ai-cache.js` | 新建 | 缓存模块单元测试 |
| `docs/CHANGELOG.md` | 修改 | 记录变更 |
| `docs/TODO.md` | 修改 | 标记完成 |
| `docs/IMPLEMENTATION.md` | 修改 | 记录实现内容 |

---

## 3. 新增模块: lib/ai-cache.js

### 3.1 类: `AICache`

**职责**: 管理 AI 响应的内存缓存，基于请求内容的哈希键进行存取。

**设计**: 纯内存 LRU 缓存（不持久化到 IndexedDB），生命周期与扩展进程一致。

```
AICache(options)
  - options.maxSize: number = 50          // 最大缓存条目数
  - options.ttlMs: number = 30 * 60 * 1000 // 默认 30 分钟 TTL

方法:
  get(key: string): { content: string, usage?: object, model?: string, cachedAt: number } | null
  set(key: string, value: object): void
  delete(key: string): boolean
  clear(): void
  has(key: string): boolean
  size(): number
  stats(): { hits: number, misses: number, evictions: number, size: number }
  evictExpired(): number  // 清理过期条目，返回清理数量
```

### 3.2 辅助函数

```
generateCacheKey(options: {
  messages: Array,
  systemPrompt: string,
  model: string,
  maxTokens: number,
  protocol: string
}): string

流程:
1. 构建键字符串:
   - model + "|" + maxTokens + "|" + protocol + "|" + systemPrompt
   - 对每条消息: role + ":" + content(text-only，排除图片)
2. 使用 FNV-1a 哈希生成 32 位十六进制字符串
3. 如果消息中包含图片 URL，附加图片 URL 到键中（图片问答不缓存）

注意:
- 包含 image_url / image 类型 content 的消息不参与缓存（图片数据太大且不稳定）
- systemPrompt 完整参与哈希（记忆、页面感知等都会影响）
```

### 3.3 LRU 策略

- 使用 Map 的插入序（ES6 Map 保证迭代顺序）
- `get()` 命中时删除再重新插入，使其变为最新
- 容量满时删除 Map 中第一个条目（最久未使用）

### 3.4 过期清理

- `get()` 时检查 TTL，过期返回 null 并删除
- 提供 `evictExpired()` 主动清理

---

## 4. 集成方案

### 4.1 AIClient 集成

新增方法:
```
cachedChat(messages, options, cache)
cachedChatStream(messages, options, cache)
```

`cachedChat` 流程:
1. 调用 `generateCacheKey()` 生成键
2. `cache.get(key)` 查询
3. 命中 → 直接返回 `{ ...cached, fromCache: true }`
4. 未命中 → 调用 `this.chat(messages, options)`
5. 成功后 `cache.set(key, result)`
6. 返回 `{ ...result, fromCache: false }`

`cachedChatStream` 流程:
1. 调用 `generateCacheKey()` 生成键
2. `cache.get(key)` 查询
3. 命中 → 一次性 yield 缓存内容，返回
4. 未命中 → 调用 `this.chatStream(messages, options)` 逐 chunk yield
5. 收集完整响应
6. 成功后 `cache.set(key, { content: fullResponse })`
7. 最终 yield 一个 `__cache_store__` 标记（内部使用）

### 4.2 Sidebar 集成

在 `sendMessage()` 中:
1. 在构建 messages 数组后、调用 chatStream 前，检查缓存
2. 缓存命中时:
   - 跳过 loading 动画
   - 直接渲染缓存内容
   - 显示 "⚡ 缓存命中" 标记
3. 缓存未命中时:
   - 正常调用 chatStream
   - 响应完成后存入缓存

---

## 5. 设计决策

### D019: 内存缓存 vs IndexedDB 持久化

**问题**: 缓存应该存在内存中还是 IndexedDB？

**决策**: 纯内存缓存。

**原因**:
1. AI 响应缓存是"锦上添花"，丢失不影响功能
2. IndexedDB 异步读写增加复杂度，缓存优势被抵消
3. 扩展进程生命周期内足够，关闭/刷新时自然清理
4. 避免 IndexedDB 存储空间占用（单次 AI 响应可能很长）

### D020: 缓存键生成策略

**问题**: 如何确定两个请求"相同"？

**决策**: 完整哈希（model + messages + systemPrompt + maxTokens + protocol）。

**原因**:
1. 不同 model 的回答质量/风格差异大，不应混合缓存
2. systemPrompt 包含记忆和页面感知上下文，变化时应重新请求
3. maxTokens 影响回答长度
4. 包含图片的消息不缓存（图片 URL 不稳定，base64 数据过大）

### D021: 流式响应缓存时机

**问题**: 流式响应应该在什么时候缓存？

**决策**: 流式完成后一次性缓存完整文本。

**原因**:
1. 流式中途可能因 abort/error 中断，不应缓存不完整响应
2. 完整文本可以直接渲染，无需重新流式处理
3. 缓存命中时"一次性"渲染完整内容，体验更快

---

## 6. 测试要点

| 测试项 | 验证方式 |
|--------|---------|
| 缓存存取基本功能 | set → get 返回相同值 |
| TTL 过期 | 设置 1ms TTL → 等待 → get 返回 null |
| LRU 淘汰 | maxSize=2 → 存 3 条 → 第一条被淘汰 |
| 缓存键一致性 | 相同输入生成相同键 |
| 缓存键区分性 | 不同 model/messages 生成不同键 |
| 图片消息不缓存 | 包含 image_url 的消息生成 null 键 |
| 缓存统计 | hits/misses/evictions 计数正确 |
| 主动清理过期 | evictExpired() 正确清理 |
| delete/has/clear/size | 基础操作正确 |
| cachedChat 命中 | 不调用底层 chat，返回 fromCache: true |
| cachedChat 未命中 | 调用底层 chat，缓存结果 |
| cachedChatStream 命中 | 一次性 yield 缓存内容 |
| cachedChatStream 未命中 | 正常流式，完成后缓存 |

---

## 7. 实现顺序

1. **lib/ai-cache.js** — 核心缓存模块（无依赖）
2. **tests/test-ai-cache.js** — 单元测试
3. **lib/ai-client.js** — 新增 cachedChat/cachedChatStream
4. **sidebar/sidebar.js** — 集成缓存
5. **文档更新**
