# VERIFICATION.md — Iteration #14 Review

> **迭代**: #14 — 离线回答保存 — AI 回答离线可用
> **审查日期**: 2026-04-30
> **审查员**: Guard Agent

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | 离线存储库已完成，但 sidebar.js **未做任何集成**，仅添加了一行未使用的 import |
| 代码质量 | ⚠️ | 库代码质量良好，mock 增强合理；存在 2 个轻微隐患 |
| 测试覆盖 | ✅ | 25 个测试全部通过，覆盖所有 9 个导出函数及边界场景 |
| 文档同步 | ⚠️ | DESIGN-ITER14.md 完善；CHANGELOG.md 未更新；TODO.md 未标记完成 |

---

## 详细审查

### 1. 功能完整性 — ❌ 不通过

**设计文档要求的 6 项需求：**

| # | 需求 | 状态 | 说明 |
|---|------|------|------|
| 1 | AI 回答成功后自动持久化到 IndexedDB | ❌ 未实现 | sidebar.js 中 `addOfflineAnswer` 已导入但**从未调用** |
| 2 | 离线/API 失败时自动查找并展示缓存回答 | ❌ 未实现 | `sendMessage()` 的 catch 块未添加离线回退逻辑 |
| 3 | 缓存条目带完整元数据 | ✅ 已实现 | `offline-answer-store.js` 数据结构包含 url/title/model/createdAt |
| 4 | LRU 淘汰策略（默认 200 条） | ⚠️ 未触发 | `evictOverflow()` 已实现但**无调用点** |
| 5 | 支持搜索/浏览历史缓存回答 | ⚠️ 未集成 | `searchOfflineAnswers()` 已实现但**无 UI 调用** |
| 6 | 缓存命中时显示「💾 离线缓存」徽章 | ❌ 未实现 | 无任何 UI 相关代码 |

**核心问题**: `sidebar/sidebar.js` 的唯一改动是一行 import 语句（第 30 行）：

```js
import { addOfflineAnswer, getOfflineAnswer, searchOfflineAnswers, evictOverflow, getOfflineStats } from '../lib/offline-answer-store.js';
```

在 6684 行的 sidebar.js 中，这 5 个函数 **零次被调用**。这意味着：
- AI 回答完成后不会自动保存到 IndexedDB
- 网络失败时不会回退到离线缓存
- 没有 UI 标记告知用户缓存状态
- 没有淘汰机制防止数据膨胀

### 2. 代码质量 — ⚠️ 有轻微问题

#### ✅ 正面评价
- `lib/offline-answer-store.js` 模块设计清晰，API 命名一致
- 输入验证完整（cacheKey/answer 必填校验）
- 每个函数都有详细的 JSDoc 注释
- IndexedDB cursor mock 的 `delete()` 方法实现准确，符合真实 IndexedDB 行为

#### ⚠️ 发现的问题

**问题 1: `openDB()` 重复创建连接**
每个公共函数都独立调用 `openDB()`，这意味着每次操作都发起 `indexedDB.open()`。虽然 IndexedDB 有连接复用机制，但更优做法是缓存数据库连接引用：

```js
// 当前实现（每次操作都 open）
export async function getOfflineAnswer(cacheKey) {
  const db = await openDB(); // 每次都 open
  // ...
}

// 建议改进
let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => { /* ... */ });
  return _dbPromise;
}
```

严重程度：**低** — IndexedDB 规范中 `indexedDB.open()` 对相同 name+version 会复用连接，但更好的实践是缓存 Promise。

**问题 2: `evictOverflow()` 错误处理不严格**
当 `store.delete()` 触发 `onerror` 时，当前代码仍计入 `deleted` 计数并可能 resolve Promise，这意味着即使删除失败也返回成功数：

```js
req.onerror = () => {
  deleted++;                                    // ← 失败也计入
  if (deleted === toDelete.length) resolve(deleted);  // ← 可能误导调用方
};
```

严重程度：**低** — 在正常 IndexedDB 环境下 delete 很少失败，但理想情况下应区分成功/失败数。

### 3. 测试覆盖 — ✅ 通过

```
# tests 25
# suites 9
# pass 25
# fail 0
```

| 测试套件 | 用例数 | 覆盖场景 |
|----------|--------|----------|
| addOfflineAnswer | 5 | 正常保存、缺 cacheKey、缺 answer、upsert 覆盖、不同 key |
| getOfflineAnswer | 2 | 查找到、未找到返回 null |
| getOfflineAnswersByUrl | 2 | URL 匹配、无匹配 |
| getAllOfflineAnswers | 2 | 倒序排列、空数据 |
| deleteOfflineAnswer | 2 | 删除成功、不影响其他记录 |
| clearOfflineAnswers | 1 | 全部清空 |
| searchOfflineAnswers | 5 | 问题搜索、内容搜索、大小写不敏感、无匹配、空关键词、多匹配 |
| evictOverflow | 3 | 超限淘汰、未超限、默认参数 |
| getOfflineStats | 2 | 统计信息、空数据 |

**评价**: 测试覆盖全面，边界场景考虑充分。IndexedDB mock 的 cursor.delete() 增强支持了 `clearOfflineAnswers()` 的正确测试。

### 4. 文档同步 — ⚠️ 部分缺失

| 文档 | 状态 | 说明 |
|------|------|------|
| DESIGN-ITER14.md | ✅ 存在 | 架构设计完善，数据结构、文件清单清晰 |
| CHANGELOG.md | ❌ 未更新 | 无迭代 #14 的条目 |
| TODO.md | ❌ 未标记 | `离线回答保存` 仍标记为 `- [ ]`（未完成） |
| R14 迭代报告 | ❌ 缺失 | `docs/reports/` 目录无 R14 报告（R13 已存在） |

### 5. 安全质量 — ✅ 无问题

- ✅ 无硬编码 API 密钥
- ✅ 无 innerHTML / XSS 风险（纯数据操作模块）
- ✅ IndexedDB 仅使用 origin 隔离，安全
- ✅ 无 eval() 或动态代码执行
- ✅ 搜索函数使用 `String.includes()` 而非正则注入

---

## 发现的问题

### 🔴 P0 — 阻塞级

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| 1 | sidebar.js 未集成离线保存 | `sidebar/sidebar.js` | 仅 import，无任何调用。设计文档要求的自动保存、离线回退、UI 标记均未实现 |

### 🟡 P1 — 建议修复

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| 2 | CHANGELOG.md 未更新 | `CHANGELOG.md` | 需添加迭代 #14 条目 |
| 3 | TODO.md 未标记完成 | `docs/TODO.md` | `离线回答保存` 仍为未完成状态 |
| 4 | 缺少 R14 迭代报告 | `docs/reports/` | 前序迭代均有报告，本次缺失 |

### 🟢 P2 — 可选优化

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| 5 | openDB 未缓存连接 | `lib/offline-answer-store.js` | 每次操作都 open，建议缓存 Promise |
| 6 | evictOverflow 错误处理 | `lib/offline-answer-store.js` | delete 失败时仍计入 deleted 计数 |

---

## 返工任务清单

### 必须完成（不完成则迭代 #14 不应视为交付）

- [ ] **R1**: `sidebar/sidebar.js` — 在 `sendMessage()` 流式完成后调用 `addOfflineAnswer()` 自动保存回答
- [ ] **R2**: `sidebar/sidebar.js` — 在 `sendMessage()` catch 块中检测网络错误，调用 `getOfflineAnswer()` 回退展示
- [ ] **R3**: `sidebar/sidebar.js` — 缓存命中时渲染 `💾 离线缓存` 徽章
- [ ] **R4**: `sidebar/sidebar.js` — 在合适位置调用 `evictOverflow()` 防止数据膨胀
- [ ] **R5**: `CHANGELOG.md` — 添加迭代 #14 的条目
- [ ] **R6**: `docs/TODO.md` — 将 `离线回答保存` 标记为 `[x]`

### 建议完成

- [ ] **S1**: `lib/offline-answer-store.js` — 缓存 `openDB()` Promise，避免重复 open
- [ ] **S2**: `lib/offline-answer-store.js` — `evictOverflow()` 区分成功/失败删除计数
- [ ] **S3**: 新增 `docs/reports/2026-04-30-R14.md` 迭代报告

---

## 结论

**判定: ❌ 不通过 — 需返工**

`lib/offline-answer-store.js` 作为独立库模块质量优秀，测试完备（25/25 通过）。但迭代的核心价值——"AI 回答离线可用"——**未在 sidebar.js 中落地**。当前状态是"基础设施就绪，但未连接"：库存在但无调用，导入存在但无使用。

返工重点在于 sidebar.js 集成（R1-R4），预计工作量约 1-2 小时。
