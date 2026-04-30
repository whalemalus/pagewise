# VERIFICATION.md — Iteration #24 Review

> **任务**: L2.1 Q&A 自动分类 — 每次 AI 回答后，自动识别并标记涉及的实体/概念
> **日期**: 2026-04-30
> **审查员**: Guard Agent

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | 核心模块功能完整，但设计文档与实现存在 schema 分歧（独立 DB vs 扩展现有 DB），且未与主知识库集成 |
| 代码质量 | ⚠️ | 整体架构清晰，容错设计好；存在 ENTITY_TYPES lookup 逻辑隐患和 rebuildAll 中不必要的实例创建 |
| 测试覆盖 | ✅ | 31 个测试全部通过，9 个测试套件覆盖全部核心路径（提示词、解析、分类、存储、查询、统计、重编译） |
| 文档同步 | ❌ | CHANGELOG.md、TODO.md、IMPLEMENTATION.md 均未更新，新文件未 git add |

---

## 详细分析

### 1. 功能完整性 ⚠️

#### 设计文档 vs 实现的差异

设计文档 (`DESIGN-ITER24.md`) 要求：
- 扩展**现有** `entries` objectStore，新增 `classified` 和 `classifiedAt` 字段
- 分类结果关联到**现有**知识库的条目

实际实现：
- 创建**独立** IndexedDB 数据库 `PageWiseAutoClassifier`（DB_VERSION=1）
- 新增三个 objectStore：`entities`、`concepts`、`classification_status`
- **未修改现有知识库 schema**

**评估**: 独立数据库的设计在模块解耦上更优，但与设计文档不一致，需要决定：
- (a) 更新设计文档，认可独立 DB 方案
- (b) 修改实现，扩展现有 DB

#### 缺失的集成点

设计文档标题明确要求「每次 AI 回答后」自动分类，但当前实现：
- `AutoClassifier` 类已完整实现 `classifyEntry()` 和 `saveClassification()` 方法
- **未在 sidebar.js / background.js 中集成调用**（即 AI 回答保存后不会触发分类）
- 这意味着虽然模块本身可用，但**功能在实际产品中不可达**

**结论**: 模块层功能完整，但系统集成层缺失。本次迭代如果只聚焦模块层是可以接受的，但应在后续迭代立即补上集成。

### 2. 代码质量 ⚠️

#### 问题 1: ENTITY_TYPES 查找逻辑 (低风险)

```js
// auto-classifier.js:262
type: ENTITY_TYPES[raw.type?.toUpperCase()] || raw.type || ENTITY_TYPES.OTHER,
```

`ENTITY_TYPES` 定义为 `{ TOOL: 'tool', FRAMEWORK: 'framework', ... }`，值为 **小写**。当 AI 返回 `type: "tool"` 时：
- `raw.type.toUpperCase()` → `"TOOL"`
- `ENTITY_TYPES["TOOL"]` → `"tool"` ✅ 实际能匹配

当 AI 返回 `type: "Tool"` 时：
- `raw.type.toUpperCase()` → `"TOOL"`
- `ENTITY_TYPES["TOOL"]` → `"tool"` ✅ 也能匹配

当 AI 返回不识别的类型 `type: "database"` 时：
- `ENTITY_TYPES["DATABASE"]` → `undefined`
- 回退到 `raw.type` → `"database"` — 未映射到 `ENTITY_TYPES.OTHER`

**风险**: 低。AI 返回未知类型时会存入原始值，不会归类到 "other"。影响有限但不符合设计意图。

#### 问题 2: rebuildAll 创建冗余实例

```js
// auto-classifier.js:698-699
const classifier = new AutoClassifier(client);
classifier.db = this.db; // 共享同一个 db 连接
```

每次循环都创建新的 `AutoClassifier` 实例再手动注入 `db`，逻辑上可以直接调用 `this.classifyEntry(entry)` 然后 `this.saveClassification()`，无需创建新实例。

#### 问题 3: getEntitiesByEntry / getConceptsByEntry 使用全表扫描

```js
// auto-classifier.js:509-514
const request = store.getAll();
request.onsuccess = () => {
  const allEntities = request.result || [];
  const matching = allEntities.filter(
    (entity) => entity.entryIds && entity.entryIds.includes(entryId)
  );
```

`entryIds` 是数组字段，当前没有为它建立索引。对于数据量小的场景没问题，但如果实体/概念数量增长到数百条，全表扫描效率会下降。可考虑为 `entryIds` 建立 `multiEntry` 索引。

#### 正面评价

- ✅ 非阻塞设计：`classifyEntry()` catch 所有异常返回空结构
- ✅ `_ensureInit()` 防并发初始化（单例 Promise 模式）
- ✅ `_truncateText()` 防止超长回答导致 prompt 过大
- ✅ 响应解析健壮：支持 markdown 代码块包裹、null/undefined 输入
- ✅ 去重合并使用 `Set`，防止 entryIds 重复

### 3. 测试覆盖 ✅

**运行结果**: 31 passed / 0 failed / 0 skipped

| 测试套件 | 测试数 | 状态 |
|----------|--------|------|
| _buildClassificationPrompt | 4 | ✅ |
| _parseClassificationResponse | 6 | ✅ |
| classifyEntry | 4 | ✅ |
| classifyBatch | 3 | ✅ |
| IndexedDB 存储操作 | 4 | ✅ |
| 扩展查询 | 4 | ✅ |
| 编译状态与统计 | 3 | ✅ |
| rebuildAll | 2 | ✅ |
| CLASSIFICATION_STATUS 常量 | 1 | ✅ |

#### 回归测试
- `test-entity-extractor.js`: 22 passed / 0 failed ✅ — 无回归

#### 测试缺口（建议补充）

| 缺失场景 | 优先级 |
|----------|--------|
| 同一条目二次分类不产生重复 entryIds | 中 |
| `_normalizeEntity` 对未知 type 的回退行为 | 低 |
| AI 响应为 `{ "entities": "not_array" }` 畸形 JSON | 低 |
| `_clearAll()` 清除后 `getStats()` 返回零 | 低 |

### 4. 文档同步 ❌

| 文档 | 状态 | 说明 |
|------|------|------|
| `docs/CHANGELOG.md` | ❌ 未更新 | 缺少 L2.1 的新增条目 |
| `docs/TODO.md` | ❌ 未更新 | `L2.1 Q&A 自动分类` 仍标记为 `[ ]`（未完成） |
| `docs/IMPLEMENTATION.md` | ❌ 未更新 | 缺少迭代 24 的实现记录 |
| `docs/DESIGN-ITER24.md` | ✅ 存在 | 设计文档已创建，但 schema 与实现不一致 |
| Git 状态 | ❌ 未暂存 | `lib/auto-classifier.js` 和 `tests/test-auto-classifier.js` 未 `git add` |

### 5. 安全质量 ✅

- ✅ 无硬编码密钥或凭证
- ✅ 无 XSS 风险（数据写入 IndexedDB，不涉及 DOM 渲染）
- ✅ AI 响应解析后通过 `_normalizeEntity` / `_normalizeConcept` 规范化，防止注入原始 AI 输出
- ✅ `_truncateText` 限制输入长度，防止 prompt 注入

---

## 发现的问题

### P0 — 阻塞性问题

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 1 | 文档未同步 | CHANGELOG.md, TODO.md, IMPLEMENTATION.md | 迭代完成的标准流程要求更新这些文档 |
| 2 | 新文件未暂存到 Git | git status | `lib/auto-classifier.js` 和 `tests/test-auto-classifier.js` 为 untracked 状态 |

### P1 — 需要讨论

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 3 | Schema 设计与文档不一致 | DESIGN-ITER24.md vs auto-classifier.js | 设计要求扩展现有 entries store，实现创建了独立 DB |
| 4 | 无系统集成 | sidebar.js / background.js | 模块独立可用，但未在 AI 回答流程中调用 |

### P2 — 建议改进

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 5 | ENTITY_TYPES 未知类型不回退到 OTHER | auto-classifier.js:262 | 低风险，AI 返回未识别类型时存入原始值 |
| 6 | rebuildAll 冗余实例化 | auto-classifier.js:698 | 可直接复用 `this` |
| 7 | 按 entryId 查询使用全表扫描 | auto-classifier.js:509 | 可用 multiEntry 索引优化 |

---

## 返工任务清单

### 必须完成（本次迭代交付前）

- [ ] **R1**: 更新 `docs/CHANGELOG.md` — 在 `[Unreleased]` 下新增 L2.1 条目
- [ ] **R2**: 更新 `docs/TODO.md` — 将 L2.1 标记为 `[x]` 完成
- [ ] **R3**: 更新 `docs/IMPLEMENTATION.md` — 新增迭代 24 实现记录
- [ ] **R4**: `git add` 新文件，确保工作区干净

### 建议完成（可后续迭代处理）

- [ ] **R5**: 更新 `docs/DESIGN-ITER24.md` — 记录独立 DB 的设计决策理由，或修改实现
- [ ] **R6**: 修复 `_normalizeEntity` — 未知类型统一回退到 `ENTITY_TYPES.OTHER`
- [ ] **R7**: 简化 `rebuildAll` — 直接复用 `this.classifyEntry()` 而非创建新实例

---

## 结论

`lib/auto-classifier.js` 模块**代码质量良好，测试覆盖充分**（31/31 通过），核心功能（AI 分类、IndexedDB 存储、去重合并、查询、重编译）均完整实现。主要问题集中在**文档同步缺失**和**设计-实现不一致**，属于流程合规问题而非技术缺陷。

**审查结果**: ⚠️ **有条件通过** — 完成 R1-R4 后可合并。

---
*自动生成于 2026-04-30*
*Guard Agent — 飞轮迭代 R24 审查*
