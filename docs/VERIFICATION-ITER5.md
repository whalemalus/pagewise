# VERIFICATION.md — Iteration #5 Review

> **审核人**: Guard Agent (Claude)
> **审核日期**: 2026-04-30
> **审核范围**: AI 响应缓存（避免重复请求）

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | 核心功能全部实现，但 sidebar 缓存命中检测使用 TTFT 启发式（<50ms）而非 `fromCache` 标记，存在误判风险 |
| 代码质量 | ⚠️ | 模块设计清晰、JSDoc 完善、无安全漏洞；但测试文件有一行重复断言，设计文档有一处与实现不一致 |
| 测试覆盖 | ⚠️ | 43 个测试全部通过，覆盖核心逻辑；但需求文档中列出的"流式中断不缓存"场景缺少测试 |
| 文档同步 | ✅ | CHANGELOG.md、TODO.md、IMPLEMENTATION.md、DESIGN-ITER5.md 均已更新，TODO 已标记完成 |

**总评**: 本轮迭代功能实现质量较高，模块边界清晰（纯函数 `ai-cache.js` → 缓存增强 `ai-client.js` → UI 集成 `sidebar.js`），测试覆盖全面。存在 **1 个中等问题** 和 **3 个低优先级问题**，建议修复后合并。

---

## 测试结果

```
# tests 43
# suites 9
# pass 43
# fail 0
# cancelled 0
# skipped 0
# duration_ms 417.15
```

**所有 43 个测试通过。**

---

## 发现的问题

### 问题 #1 [中等] — sidebar.js 缓存命中检测使用不可靠的启发式

**位置**: `sidebar/sidebar.js` 第 2386–2388 行

```javascript
// 检测缓存命中：首个 chunk 时 TTFT 极低视为缓存命中
if (ttft < 50) {
  cacheHit = true;
}
```

**问题**: `cachedChatStream()` 在缓存命中时已将缓存内容一次性 yield 出来，但 sidebar 没有使用 `fromCache` 标记，而是用 TTFT（Time to First Token）< 50ms 作为启发式判断。

**风险**:
- **误判为命中**：使用本地模型（如 Ollama）时 TTFT 可能 < 50ms，但实际并非缓存命中
- **误判为未命中**：缓存命中但因渲染线程繁忙导致 TTFT > 50ms 时，不会显示缓存标记
- 可维护性差：50ms 阈值是魔法数字，不同硬件/浏览器表现不同

**根因**: `cachedChatStream` 是 async generator，只能 `yield` 字符串，无法直接携带 `fromCache` 元数据。

**建议修复**:
- 方案 A（推荐）：让 `cachedChatStream` 在缓存命中时先 yield 一个特殊标记（如 `{ type: '__cache_hit__' }` 对象），sidebar 检测到后设置 `cacheHit = true`，后续 chunk 仍为字符串
- 方案 B：sidebar 中在调用 `cachedChatStream` 前先单独调用 `cache.get(key)` 检查是否命中，命中则自行渲染并跳过流式调用
- 方案 C：将 `cachedChatStream` 改为返回 `{ stream, fromCache }` 结构，stream 为 generator，fromCache 为 boolean

---

### 问题 #2 [中等] — 测试缺失：流式中断不缓存场景

**位置**: `tests/test-ai-cache.js`

**问题**: `docs/REQUIREMENTS-ITER5.md` 的验收测试清单第 13 项明确要求：

> `#13 | cachedChatStream() 未命中 → 中断 | 不缓存不完整响应`

但当前测试文件中 **没有** 对应的测试用例。现有的 5 个集成测试覆盖了：
- ✅ cachedChat 未命中/命中/图片不缓存
- ✅ cachedChatStream 未命中 → 完整流式 → 缓存
- ✅ cachedChatStream 命中 → 一次性 yield

**缺失的场景**：模拟 `chatStream` 中途抛出异常（如 abort），验证 `cache.size()` 仍为 0（不缓存不完整响应）。

**建议**: 添加测试用例：
```javascript
it('cachedChatStream 未命中 → 中途中断 → 不缓存不完整响应', async () => {
  const client = new AIClient({ apiKey: 'test', protocol: 'openai' });
  async function* errorStream() {
    yield 'Hello';
    throw new Error('Aborted');
  }
  client.chatStream = errorStream;

  const cache = new AICache({ maxSize: 10, ttlMs: 60000 });
  const messages = [{ role: 'user', content: 'test' }];
  try {
    for await (const chunk of client.cachedChatStream(messages, { systemPrompt: 'sys' }, cache)) {
      // consume
    }
  } catch (e) { /* expected */ }

  assert.equal(cache.size(), 0, '中断的流不应被缓存');
});
```

---

### 问题 #3 [低] — 测试文件中重复断言

**位置**: `tests/test-ai-cache.js` 第 515–516 行

```javascript
assert.equal(cache.size(), 1, '完成后应缓存完整响应');
assert.equal(cache.size(), 1, '完成后应缓存完整响应');  // ← 完全重复
```

**建议**: 删除第 516 行的重复断言。

---

### 问题 #4 [低] — 设计文档与实现不一致

**位置**: `docs/DESIGN-ITER5.md` 第 134 行

```
7. 最终 yield 一个 `__cache_store__` 标记（内部使用）
```

**实际实现**: `cachedChatStream()` 在循环结束后直接调用 `cache.set()`，**没有** 使用 `__cache_store__` 标记。实际实现更简洁，但设计文档应同步更新。

**建议**: 删除 DESIGN-ITER5.md 第 134 行，或改为：
```
7. 流结束后直接调用 cache.set() 存入完整响应
```

---

## 未发现问题的维度

### ✅ 跨文件一致性
- CSS 类名 `.pw-cache-badge` 在 `sidebar.js`（第 2411 行）和 `sidebar.css`（第 3383 行）完全匹配
- 暗色主题适配已实现（`[data-theme="dark"]` + `body.dark` 两种选择器）
- `generateCacheKey()` 签名在 `ai-cache.js`（定义）和 `ai-client.js`（调用）一致
- `AICache` 构造参数在 `ai-cache.js`（定义）和 `sidebar.js`（实例化）一致

### ✅ 安全质量
- 无硬编码 API 密钥（测试中使用 `'test'` 占位符，属于正常 mock）
- 无 XSS 风险（缓存值为纯文本对象，徽章使用 `textContent` 而非 `innerHTML`）
- 无外部依赖引入（FNV-1a 纯 JS 实现，LRU 基于原生 Map）
- 缓存键碰撞风险低（32 字符十六进制哈希 = 128 位空间）

### ✅ 设计完整性
- `maxSize=0` 边界已处理（`set()` 方法第 185–188 行提前返回）
- 缓存值使用浅拷贝（`{ ...value }`）避免引用污染
- LRU 刷新使用"删除-重插入"利用 Map 迭代序
- 图片消息正确跳过缓存（`generateCacheKey` 返回 `null` → `cachedChat`/`cachedChatStream` 跳过缓存逻辑）

### ✅ 文档同步
| 文档 | 状态 | 说明 |
|------|------|------|
| `docs/CHANGELOG.md` | ✅ 已更新 | 记录了迭代 #5 的全部新增和变更 |
| `docs/TODO.md` | ✅ 已更新 | "AI 响应缓存"标记为 `[x]` |
| `docs/IMPLEMENTATION.md` | ✅ 已更新 | 详细的实现记录和文件变更统计 |
| `docs/DESIGN-ITER5.md` | ⚠️ 微小不一致 | 第 134 行 `__cache_store__` 标记未实现（见问题 #4） |
| `docs/REQUIREMENTS-ITER5.md` | ✅ 已更新 | 需求从"技能详情+自动刷新"重写为"AI 响应缓存" |

---

## 返工任务清单

| # | 优先级 | 任务 | 涉及文件 | 工作量 |
|---|--------|------|----------|--------|
| 1 | **P1** | 将 sidebar.js 缓存命中检测从 TTFT 启发式改为基于 `fromCache` 标记 | `lib/ai-client.js`, `sidebar/sidebar.js` | 小 |
| 2 | **P1** | 补充 "cachedChatStream 中途中断不缓存" 测试用例 | `tests/test-ai-cache.js` | 小 |
| 3 | **P3** | 删除测试文件第 516 行重复断言 | `tests/test-ai-cache.js` | 极小 |
| 4 | **P3** | 更新 DESIGN-ITER5.md 第 134 行，删除 `__cache_store__` 相关描述 | `docs/DESIGN-ITER5.md` | 极小 |

---

## 附录：变更文件清单

| 文件 | 变更类型 | 行数 | 审核结论 |
|------|----------|------|----------|
| `lib/ai-cache.js` | 新建 | +270 | ✅ 通过 |
| `lib/ai-client.js` | 修改 | +77 | ✅ 通过 |
| `sidebar/sidebar.js` | 修改 | +44/-5 | ⚠️ 缓存命中检测需改进 |
| `sidebar/sidebar.css` | 修改 | +22 | ✅ 通过 |
| `tests/test-ai-cache.js` | 新建 | +542 | ⚠️ 缺 1 个场景 + 1 行重复 |
| `docs/CHANGELOG.md` | 修改 | +15 | ✅ 通过 |
| `docs/TODO.md` | 修改 | +1/-1 | ✅ 通过 |
| `docs/IMPLEMENTATION.md` | 修改 | +60 | ✅ 通过 |
| `docs/DESIGN-ITER5.md` | 新建 | +215 | ⚠️ 1 处与实现不一致 |
| `docs/REQUIREMENTS-ITER5.md` | 重写 | +171/-74 | ✅ 通过 |
