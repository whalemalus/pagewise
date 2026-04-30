# VERIFICATION.md — Iteration #4 Review

> **审查日期**: 2026-04-30
> **审查人**: Guard Agent (Claude)
> **审查范围**: 知识库性能优化（索引、分页）+ R012 页面高亮关联
> **测试结果**: 984 pass / 0 fail / 3 cancelled（全量测试通过）

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | R012 页面高亮关联功能完整实现；知识库性能优化核心方法（N-gram 索引、分页）已实现，但 `searchPaged()` 是"假分页"（全量加载后切片）；TODO.md 中"知识库性能优化"未勾选 |
| 代码质量 | ⚠️ | 整体架构清晰，JSDoc 完善，CSS/JS 类名一致；但 `getTotalCount()` 实现有性能反模式，N-gram 索引内存开销大，存在代码重复 |
| 测试覆盖 | ⚠️ | 新增 70 个测试（test-highlight-link: 34, test-knowledge-perf: 36）全部通过；但 highlight-link 测试使用了自建 Mock 而非真实代码，实际只验证了 mock 逻辑而非 production 代码 |
| 文档同步 | ⚠️ | CHANGELOG / DESIGN / IMPLEMENTATION / REQUIREMENTS 均已更新且质量高；但 TODO.md 中"知识库性能优化"未勾选完成 |
| 安全质量 | ✅ | 无硬编码密钥；无 XSS 风险（使用 textContent + createElement 而非 innerHTML）；消息协议向后兼容 |

---

## 发现的问题

### P1 — 高优先级

#### 问题 1: `getTotalCount()` 使用 `getAll()` 加载全部条目再计数 — 性能反模式

**文件**: `lib/knowledge-base.js` 第 328-341 行

**现象**: `getTotalCount()` 调用 `store.getAll()` 加载所有条目到内存，仅为了获取 `.length`。当知识库有数千条时，这意味着把所有条目的完整数据（title、content、summary 等）全部加载到内存。

**影响**: 
- 1000 条 × 每条 ~2KB 内容 ≈ 2MB 无谓的内存分配
- `getAll()` 无法被 IndexedDB 优化为仅扫描主键
- 与"性能优化"的目标直接矛盾

**建议**: 使用 IndexedDB 的 `count()` 方法：
```javascript
async getTotalCount() {
  await this.ensureInit();
  if (this._entryCount !== null) return this._entryCount;
  return new Promise((resolve, reject) => {
    const tx = this.db.transaction('entries', 'readonly');
    const store = tx.objectStore('entries');
    const request = store.count();  // ← 仅扫描索引，不加载数据
    request.onsuccess = () => {
      this._entryCount = request.result;
      resolve(this._entryCount);
    };
    request.onerror = () => reject(new Error('获取条目数量失败'));
  });
}
```

#### 问题 2: `searchPaged()` 是"假分页" — 全量搜索后切片

**文件**: `lib/knowledge-base.js` 第 676-707 行

**现象**: `searchPaged()` 调用 `this.search(query)` 获取全部匹配结果，然后用 `allResults.slice(offset, offset + pageSize)` 做切片。如果搜索匹配 500 条，每次翻页都会先搜索全部 500 条再切片。

**影响**:
- 搜索成本不随 pageSize 减小而降低
- 命名为 "Paged" 暗示数据库级分页，实际是内存级切片
- 在大数据集上搜索结果本身可能很大

**建议**: 
- 短期：在 JSDoc 中明确标注"客户端分页（全量搜索后切片）"，避免误导
- 长期：如果搜索结果数量大，考虑在 `_buildIndex()` 构建后直接在候选集上做 cursor 级分页

#### 问题 3: N-gram 索引内存开销可能爆炸性增长

**文件**: `lib/knowledge-base.js` `_extractNgrams()` 第 424-439 行

**现象**: 对每个条目的全部文本字段（title + content + summary + question + answer + tags）生成所有 3-gram。一个 500 字符的条目产生 ~500 个 ngram 条目。

**影响估算**:
- 1000 条 × 500 字符/条 × 3 bytes/ngram ≈ 1.5M Map entries
- 每个 Map entry 的 key (string) + value (Set<id>) 内存开销 ~50-100 bytes
- 总计 75MB-150MB — 对浏览器扩展来说偏高

**建议**: 
- 考虑只对 title 和 tags 建 ngram 索引（而非全部字段）
- 或限制 ngram 索引仅在查询短于 ngramSize 时惰性构建
- 或在 ngram 索引超过阈值时自动降级为全量扫描

---

### P2 — 中优先级

#### 问题 4: highlight-link 测试与 production 代码存在断联

**文件**: `tests/test-highlight-link.js`

**现象**: 测试文件在第 126-181 行自建了 `createFlashHighlightLogic()` 和 `createInjectQuoteAttributesLogic()` 函数，重新实现了核心逻辑的简化版本。这些 mock 函数并没有 import 或引用实际的 `content/content.js` 或 `lib/message-renderer.js` 中的代码。

**影响**: 如果 production 代码中 `flashHighlight()` 或 `_injectQuoteAttributes()` 出现 bug，这些测试不会捕获，因为它们测试的是 mock 版本。

**建议**: 
- 至少添加集成测试，验证 `content.js` 中 `locateAndHighlight` 消息分支的路由正确性
- 或提取核心逻辑为可测试的纯函数（如从 content.js 中提取 TreeWalker 搜索逻辑为独立函数），在测试中直接引用

#### 问题 5: `_injectQuoteAttributes()` 重复调用会累积事件监听器

**文件**: `lib/message-renderer.js` 第 362-417 行

**现象**: 虽然测试中验证了"多次调用不产生重复标记"（data-quote 和 class 不会重复），但 `addEventListener('click', ...)` 每次调用都会在同一个元素上追加新的事件监听器。如果 `_buildAIElement()` 因流式更新等原因被多次调用，click handler 会累积。

**影响**: 同一元素被点击时发送多条 `locateAndHighlight` 消息，可能导致 `flashHighlight()` 被多次调用（虽然 `clearFlashHighlights()` 会先清理，但消息通信本身有开销）。

**建议**: 
- 在注入前检查是否已有 `data-quote` 属性，有则跳过：
```javascript
if (code.hasAttribute('data-quote')) continue;
```
- 或在注入前移除旧的事件监听器

#### 问题 6: `_extractWords()` 与 `_extractNgrams()` 存在代码重复

**文件**: `lib/knowledge-base.js` 第 406-439 行

**现象**: 两个函数的文本拼接逻辑（title + content + summary + question + answer + tags）完全相同，但 `_extractWords` 包含 `language` 字段而 `_extractNgrams` 不包含。

**影响**: 
- 如果后续新增文本字段，需要在两处同步修改，容易遗漏
- `language` 字段的不一致是有意还是疏忽不明确

**建议**: 提取公共的 `_getSearchableText(entry)` 方法，两个函数共享：
```javascript
_getSearchableText(entry) {
  return [
    entry.title || '', entry.content || '', entry.summary || '',
    entry.question || '', entry.answer || '', entry.language || '',
    ...(entry.tags || [])
  ].join(' ').toLowerCase();
}
```

---

### P3 — 低优先级

#### 问题 7: TODO.md 中"知识库性能优化（索引、分页）"未勾选

**文件**: `docs/TODO.md` 第 36 行

**现象**: `- [ ] 知识库性能优化（索引、分页）` 仍然显示为未完成，但 N-gram 索引、`getTotalCount()`、`getEntriesPaged()`、`searchPaged()` 均已实现，且 `test-knowledge-perf.js` 有 36 个测试覆盖。

**建议**: 更新为 `- [x] 知识库性能优化（索引、分页）`

#### 问题 8: REQUIREMENTS-ITER4.md AC-1 措辞与实现不完全一致

**文件**: `docs/REQUIREMENTS-ITER4.md` 第 27 行

**现象**: AC-1 写道"页面中对应文本被高亮标记（`.pagewise-highlight` 样式）"，但实现使用的是 `pw-flash-highlight` 样式。AC-2 中提到 `ai-assistant-highlight` 类，但实际也用了 `pw-flash-highlight`。

**影响**: AC 描述的类名与实现不一致，可能导致后续维护者混淆。

**建议**: 将 AC-1 更新为：
> 页面中对应文本被临时高亮标记（`.pw-flash-highlight` 样式，黄色半透明 + 外发光，3 秒后自动消失），并自动滚动到可视区域中央

#### 问题 9: `flashHighlight()` 的 transitionend 兜底定时器未清理

**文件**: `content/content.js` 第 340-350 行

**现象**: transitionend 事件后会移除 DOM 元素，但兜底的 `setTimeout(() => {...}, 1000)` 不会被取消。如果 transitionend 正常触发，兜底 setTimeout 仍在 1 秒后执行，此时 `span.parentNode` 已为 null，虽然不会出错但存在不必要的 timer 残留。

**建议**: 使用变量引用兜底 setTimeout，在 transitionend 处理中 `clearTimeout(fallbackTimer)`。

#### 问题 10: REQUIREMENTS-ITER4.md 引用了未修改的 `lib/highlight-store.js`

**文件**: `docs/REQUIREMENTS-ITER4.md` 第 12 行

**现象**: "涉及文件"表格中列出了 `lib/highlight-store.js`，但实际代码变更中该文件未被修改。

**影响**: 轻微 — 文档精确性问题。

---

## 跨文件一致性检查

| 检查项 | 结果 | 详情 |
|--------|------|------|
| CSS 类名 `pw-flash-highlight` | ✅ | content.css 定义 ↔ content.js 使用，完全一致 |
| CSS 类名 `pw-flash-highlight--fading` | ✅ | content.css 定义 ↔ content.js `classList.add()`，完全一致 |
| CSS 类名 `pw-quote-link` | ✅ | sidebar.css 定义 ↔ message-renderer.js 使用，完全一致 |
| 消息 action `locateAndHighlight` | ✅ | message-renderer.js 发送 ↔ content.js switch-case 接收，完全一致 |
| 响应格式 `{ success, error? }` | ✅ | content.js 返回 ↔ message-renderer.js 判断，完全一致 |
| blockquote 截取 200 字符 | ✅ | message-renderer.js `.slice(0, 200)` ↔ 测试验证，一致 |
| `_injectQuoteAttributes` 调用位置 | ✅ | 在 `_buildAIElement()` 尾部，DOM 构建完成后调用 |

---

## 返工任务清单

| # | 优先级 | 任务 | 文件 | 预估工时 |
|---|--------|------|------|---------|
| 1 | P1 | `getTotalCount()` 改用 `store.count()` 替代 `store.getAll()` | `lib/knowledge-base.js` | 15min |
| 2 | P1 | `searchPaged()` JSDoc 标注"客户端分页（全量搜索后切片）"，或重构为数据库级分页 | `lib/knowledge-base.js` | 15min |
| 3 | P1 | N-gram 索引增加内存保护（限制范围或惰性构建策略） | `lib/knowledge-base.js` | 1h |
| 4 | P2 | highlight-link 测试增加与 production 代码的真实连接 | `tests/test-highlight-link.js` | 2h |
| 5 | P2 | `_injectQuoteAttributes()` 添加 `data-quote` 已存在检查，防止事件监听器累积 | `lib/message-renderer.js` | 15min |
| 6 | P2 | 提取 `_getSearchableText()` 消除 `_extractWords` / `_extractNgrams` 代码重复 | `lib/knowledge-base.js` | 20min |
| 7 | P3 | TODO.md 中"知识库性能优化"标记为完成 | `docs/TODO.md` | 2min |
| 8 | P3 | REQUIREMENTS-ITER4.md AC-1/AC-2 中的类名与实现对齐 | `docs/REQUIREMENTS-ITER4.md` | 5min |
| 9 | P3 | `flashHighlight()` transitionend 兜底 timer 清理 | `content/content.js` | 10min |
| 10 | P3 | REQUIREMENTS-ITER4.md "涉及文件" 移除未修改的 `highlight-store.js` | `docs/REQUIREMENTS-ITER4.md` | 2min |

---

## 总结

本轮迭代包含两个功能域的变更：**R012 页面高亮关联**（主体）和**知识库性能优化**（N-gram 索引 + 分页）。代码架构整体清晰，文档充分，测试数量充足且全部通过。

主要风险点在于：
1. **性能优化本身存在性能反模式**（`getTotalCount()` 用 `getAll()` 计数、N-gram 内存开销），需要修复后才能体现"性能优化"的目标
2. **测试与 production 代码断联**（highlight-link 测试自建 mock 而非引用真实代码），降低了测试的信任价值
3. **TODO.md 未同步更新**，知识库性能优化功能已实现但未勾选

建议完成 P1 返工项后再合入 master。
