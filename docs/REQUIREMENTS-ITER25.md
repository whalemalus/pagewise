# 需求文档 — Iteration 25: L2.2 知识关联增强

> 需求编号: R036
> 优先级: P1
> 迭代: R25
> 飞轮阶段: L2.2 (Level 2 — 知识编译引擎)
> 日期: 2026-04-30
> 负责: Plan Agent

---

## 一、背景与动机

### 战略定位

本需求是 LLM Wiki 知识编译系统 Level 2 的第二步。L2.1 已实现 Q&A 实时自动分类——每次 AI 回答后自动提取并存储实体/概念，建立了"条目 ↔ 实体/概念"的双向索引。但 L2.1 的关联是**一维的**：只记录了"条目 A 包含实体 X"，没有回答更深层的问题：

- 实体 X 和实体 Y 之间是什么关系？
- 概念 A 和概念 B 是同类、上下位还是并列？
- 多条 Q&A 反复提到 X + Y，说明它们之间的关联有多强？

L2.2 将在 L2.1 的实体/概念数据之上，建立**实体间的深度关联网络**，使知识从"扁平的索引"进化为"可推理的图谱"。

在竞品分析中，**跨会话知识关联**被列为"市场空白——没人做好"的领域。L2.2 是 PageWise 在这一方向的核心投入。

### 问题陈述

| 问题 | 影响 | 用户场景 |
|------|------|----------|
| L2.1 只记录了实体/概念 → 条目的映射，没有实体 → 实体的关联 | 知识图谱只能展示"标签共现"，无法展示实体间的语义关系 | "Docker 和 Kubernetes 经常一起出现，但图谱上它们没有直接连线" |
| 同一概念的不同表述无法统一（如"CI/CD" vs "持续集成/持续部署"） | 知识被割裂为多个孤立节点 | "我搜了 CI/CD 也搜了持续集成，但知识库里是两条独立概念" |
| 实体关联没有强度信息 | 无法区分"强关联"和"弱关联"，所有关系等权重展示 | "React 和 Redux 关联很深，React 和 jQuery 只是偶尔提到，但在图谱上看起来一样" |
| 概念之间缺乏层次关系 | LLM 推理时无法沿 is-a / part-of 链路推理 | "容器化 → Docker → Docker Compose 是一个递进关系，但知识库里看不出来" |
| 现有知识图谱（`knowledge-graph.js`）仅基于标签构建节点/边 | 图谱信息密度低，无法反映实体间的真实关系网络 | "图谱上只有按标签分组的节点，看不出技术栈之间的依赖关系" |

### 与已有功能的关系

| 功能 | L2.2 如何利用 |
|------|---------------|
| L2.1 `AutoClassifier` | 直接读取 `entities` 和 `concepts` objectStore 中的数据作为关联分析的输入 |
| L2.1 的实体/概念 → 条目映射 | 通过共享条目推导实体共现关系 |
| `EmbeddingEngine` (TF-IDF) | 可复用向量余弦相似度计算，作为关联强度的一个维度 |
| `KnowledgeGraph` | 关联数据将作为新的边（edge）数据源，增强图谱密度 |
| L1.3 交叉引用 | L2.2 的关联数据可用于增强 `[[wikilinks]]` 的排序和推荐 |

---

## 二、用户故事

### US-1: 开发者浏览知识图谱时看到实体间的真实关系

> 作为一名技术开发者，我希望知识图谱不仅显示标签分组，还能展示实体之间的关联关系（如"Docker → 容器化 → Kubernetes"），这样我可以直观地看到我的知识网络中哪些技术是紧密关联的。

### US-2: AI 回答时自动利用实体关联进行深度推理

> 作为一名 PageWise 用户，当我问一个关于 React 的问题时，我希望 AI 能自动知道 Redux、Hooks、JSX 是紧密关联的概念，在回答中自然地串联相关知识，而不是只基于当前页面内容。

### US-3: 查看单个实体的关联子图

> 作为一名技术学习者，我想点击知识库中的"Docker"实体，看到它关联了哪些技术（Kubernetes、容器化、OCI、Docker Compose），以及关联强度，帮助我理解技术栈的全貌。

---

## 三、验收标准

### AC-1: 实体共现分析 — 基于共享条目建立实体关联

- [ ] 新增 IndexedDB objectStore `entity_relations`，存储实体对之间的关联关系
- [ ] 当两个实体同时出现在 ≥ 1 个 Q&A 条目中时，自动建立关联记录
- [ ] 关联记录结构：`{ entityA: string, entityB: string, type: string, strength: number, coOccurrences: number[], createdAt: string, updatedAt: string }`
- [ ] 关联为无向关系：`(entityA, entityB)` 和 `(entityB, entityA)` 只存储一条记录（按字母序排列 key）
- [ ] 当 L2.1 新分类一条 Q&A 后，自动触发该条目涉及实体的共现分析（增量更新，非全量重建）
- [ ] 100 个实体规模下，单次增量共现分析耗时 < 100ms

### AC-2: 关联类型识别 — 区分 is-a / part-of / related-to

- [ ] 通过 AI 对实体对进行关系分类（仅对共现 ≥ 2 次的实体对触发，减少 API 调用）
- [ ] 支持三种关联类型：
  - `is_a`：上下位关系（如 Docker → 容器运行时）
  - `part_of`：组成关系（如 React Hooks → React）
  - `related_to`：一般关联（如 Docker ↔ Kubernetes）
- [ ] 关联类型识别使用轻量级 prompt，一次请求处理最多 10 个实体对
- [ ] AI 调用失败时默认类型为 `related_to`，不影响主流程
- [ ] 用户可在知识图谱中手动修改关联类型（覆盖 AI 判断）

### AC-3: 关联强度评分 — 量化实体间关系的紧密程度

- [ ] 关联强度 `strength` 为 0-1 之间的浮点数
- [ ] 强度计算综合以下维度：
  - **共现频率**（权重 0.5）：两实体共享条目数 / 总条目数
  - **语义相似度**（权重 0.3）：复用 `EmbeddingEngine` 计算实体描述的 TF-IDF 余弦相似度
  - **关系类型加权**（权重 0.2）：`is_a` 和 `part_of` 基础分 0.8，`related_to` 基础分 0.5
- [ ] 强度值随新条目增加自动更新（增量计算，非全量重算）
- [ ] 强度 ≥ 0.7 的关联在图谱中以粗线/深色显示，< 0.3 的以虚线/浅色显示

### AC-4: 概念层次关系 — 自动识别概念间的 is-a / part-of 结构

- [ ] 新增 IndexedDB objectStore `concept_relations`，结构与 `entity_relations` 类似
- [ ] AI 识别概念间的层次关系：`is_a`（如"CI/CD" → "DevOps 实践"）、`part_of`（如"依赖注入" → "控制反转"）、`related_to`（如"微服务" ↔ "容器化"）
- [ ] 层次关系识别与实体关系识别共用同一个 AI 请求（减少 API 调用）
- [ ] 支持概念合并提示：如果两个概念描述高度相似（余弦相似度 ≥ 0.85），提示用户是否合并

### AC-5: 知识图谱增强 — 关联数据可视化

- [ ] 现有知识图谱（`knowledge-graph.js`）新增实体/概念节点类型
- [ ] 节点类型区分：实体（圆形）/ 概念（六边形）/ Q&A 条目（菱形，现有）
- [ ] 边类型区分：`is_a`（带箭头实线）/ `part_of`（带箭头虚线）/ `related_to`（无向实线）
- [ ] 边的粗细/透明度由 `strength` 值映射（0 → 透明虚线，1 → 粗实线）
- [ ] 点击实体/概念节点时，高亮其一级关联子图（关联节点 + 边）
- [ ] 图谱支持按关联类型筛选（如只显示 `is_a` 关系）
- [ ] 100 个实体 + 200 条关联边的渲染性能 < 500ms

### AC-6: 实体关联查询 API

- [ ] `RelationEngine` 提供以下查询方法：
  - `getRelatedEntities(entityName)` → `[{ name, type, strength, relationType }]`
  - `getRelatedConcepts(conceptName)` → `[{ name, strength, relationType }]`
  - `getRelationPath(entityA, entityB)` → 最短关联路径（BFS，最大深度 5）
  - `getStrongRelations(threshold)` → 强度超过阈值的所有关联
  - `getRelationStats()` → 关联统计（总数、按类型分布、平均强度）
- [ ] 所有查询方法从 IndexedDB 读取，不依赖内存缓存（支持大数据量）

---

## 四、技术约束

### TC-1: 复用已有基础设施，不引入新外部依赖

- 所有逻辑使用纯 JavaScript 实现，与现有代码风格一致
- 复用 `EmbeddingEngine` 的 TF-IDF 余弦相似度（`embedding-engine.js`）
- 复用 `AutoClassifier` 的 IndexedDB 连接管理机制
- 不引入 D3.js、Neo4j 或其他图数据库

### TC-2: AI 调用最小化

- 关联类型识别（AC-2）是唯一需要 AI 调用的步骤，其他均为确定性算法
- AI 调用策略：共现 ≥ 2 次的实体对才触发类型识别，减少 API 成本
- 批量处理：一次请求最多 10 个实体对（而非逐对请求）
- AI 调用失败降级为 `related_to`，完全不影响主流程

### TC-3: IndexedDB Schema 设计

**`entity_relations` objectStore:**
```js
{
  id: number,              // autoIncrement
  entityA: string,         // 实体名称（字母序靠前）
  entityB: string,         // 实体名称（字母序靠后）
  relationType: string,    // 'is_a' | 'part_of' | 'related_to'
  strength: number,        // 0-1 关联强度
  coOccurrenceCount: number, // 共现条目数
  entryIds: number[],      // 共现条目 ID 列表
  classifiedBy: string,    // 'ai' | 'manual' — 来源标记
  createdAt: string,
  updatedAt: string
}
```

**`concept_relations` objectStore:**
```js
{
  id: number,
  conceptA: string,
  conceptB: string,
  relationType: string,    // 'is_a' | 'part_of' | 'related_to'
  strength: number,
  coOccurrenceCount: number,
  entryIds: number[],
  classifiedBy: string,
  createdAt: string,
  updatedAt: string
}
```

**索引设计:**
- `entity_relations`: 索引 `entityA`、`entityB`、复合索引 `[entityA, entityB]`（唯一）
- `concept_relations`: 索引 `conceptA`、`conceptB`、复合索引 `[conceptA, conceptB]`（唯一）

### TC-4: 增量更新而非全量重建

- L2.1 每次分类新条目后，触发增量共现分析：仅处理该条目涉及的实体/概念对
- 增量更新逻辑：`newEntityPairs = combinations(newEntry.entities, 2)` → 对每一对更新或创建关联记录
- 强度评分的增量更新：`newStrength = f(updatedCoOccurrenceCount, totalEntries)`，不需要重算所有关联
- 全量重建仅在用户手动触发"重建关联"时执行

### TC-5: 内存与性能

- 100 个实体 → 最大理论关联对数 C(100,2) = 4,950，实际共现关联通常 < 500 条
- 500 条关联记录的内存占用 < 200KB
- 增量共现分析（单条新 Q&A）：< 100ms
- 全量重建（100 条 Q&A + 100 个实体）：< 3 秒
- 图谱渲染（100 节点 + 200 边）：< 500ms

### TC-6: 纯 ES Module，不依赖 Chrome API

- `RelationEngine` 作为纯 ES Module，与 `auto-classifier.js`、`entity-extractor.js` 保持一致
- IndexedDB 操作使用与 `AutoClassifier` 相同的异步 Promise 封装模式
- 不直接依赖 `chrome.*` API，UI 层通过回调/事件与引擎交互

---

## 五、依赖关系

| 依赖 | 类型 | 说明 |
|------|------|------|
| L2.1 (R035) Q&A 自动分类 | **强依赖** | 关联分析的输入数据来自 L2.1 的 `entities` 和 `concepts` objectStore |
| `lib/auto-classifier.js` | 代码依赖 | 读取实体/概念数据；分类完成后触发增量关联更新 |
| `lib/embedding-engine.js` | 代码依赖 | 复用 TF-IDF 余弦相似度计算，作为关联强度维度之一 |
| `lib/knowledge-graph.js` | 代码依赖 | 扩展图谱数据结构，新增实体/概念节点和关联边 |
| `lib/ai-client.js` | 运行时依赖 | AI 关联类型识别（AC-2），仅在共现 ≥ 2 次时触发 |
| `lib/knowledge-base.js` | 数据依赖 | 读取条目数据用于全量重建场景 |

### 依赖链

```
L2.1 实时分类（实体/概念提取）
         ↓
L2.2 共现分析 → 关联类型识别 → 强度评分 → 图谱增强
         ↑                    ↑
  EmbeddingEngine         ai-client
  (TF-IDF 相似度)      (关系类型分类)
```

L2.2 在 L2.1 完成后执行。当 L2.1 分类新条目时，L2.2 自动触发增量关联更新。

---

## 六、文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `lib/relation-engine.js` | 关联引擎核心模块：共现分析、类型识别、强度评分、查询 API |
| 新增 | `tests/test-relation-engine.js` | 关联引擎单元测试 |
| 修改 | `lib/auto-classifier.js` | 分类完成后触发 `RelationEngine.updateForEntry()` |
| 修改 | `lib/knowledge-graph.js` | 扩展 `buildGraphData()` 支持实体/概念节点和关联边 |
| 修改 | `docs/IMPLEMENTATION.md` | 记录实现内容 |
| 修改 | `docs/CHANGELOG.md` | 记录变更 |
| 修改 | `docs/TODO.md` | 标记 L2.2 完成 |

---

## 七、不在范围内 (Out of Scope)

| 项目 | 原因 | 归属 |
|------|------|------|
| L2.3 矛盾检测 | 独立迭代，需要语义对比 | L2.3 |
| L2.4 知识编译报告 | 独立迭代 | L2.4 |
| L3.2 知识图谱可视化增强（UI 交互层） | L2.2 提供数据层，L3.2 完善 UI | L3.2 |
| L3.4 LLM Wiki 查询（Ask Wiki） | 利用关联数据进行跨条目推理，属于更高级功能 | L3.4 |
| 用户手动创建/编辑关联关系的 UI 界面 | L2.2 仅提供 API 级别的手动修改能力（`classifyBy: 'manual'`），完整 UI 留给后续迭代 | 后续 |
| 同义词消歧/概念合并的自动执行 | L2.2 仅提示用户，不自动合并（需要用户确认） | 用户决策 |
| 关联关系的导入/导出（与 Obsidian 元数据互通） | 属于 L3.6 服务器同步范畴 | L3.6 |

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| AI 关联类型识别成本随实体对数量增长 | 中 | 中 | 仅对共现 ≥ 2 次的实体对触发；批量处理 10 对/次；用户可手动标记 |
| IndexedDB 复合索引在部分浏览器版本中不支持 | 低 | 高 | 回退方案：使用两个单列索引 + 内存中过滤组合 |
| EmbeddingEngine 的 TF-IDF 相似度对短描述文本精度低 | 中 | 低 | 短文本（< 20 字符）相似度降权；仅作为强度的辅助维度 |
| 增量更新时 IndexedDB 事务竞争（与 L2.1 并发写入） | 低 | 中 | 使用独立的 DB 连接（与 AutoClassifier 分开的 objectStore），避免事务锁冲突 |
| 关联数量爆炸（N 个实体最多 N*(N-1)/2 条关联） | 低 | 中 | 仅存储有共现的关联；设置上限 5000 条关联（超出时淘汰最低强度） |

---

## 九、成功指标

| 指标 | 目标 | 衡量方式 |
|------|------|----------|
| 关联覆盖率 | 50+ 条 Q&A 的知识库中，≥ 80% 的实体有至少 1 条关联 | 自动化测试：`getRelationStats()` 中孤立实体比例 < 20% |
| 关联类型准确率 | AI 识别的关联类型准确率 ≥ 70%（人工抽检） | 抽样 20 条关联，人工验证 |
| 增量更新性能 | 单条 Q&A 分类后的关联增量更新 < 100ms | 性能测试 |
| 图谱增强效果 | 知识图谱中实体/概念节点可见，边按强度区分粗细 | 视觉验证 |
| 向后兼容 | L2.1 自动分类功能零回归 | 回归测试 |
| AI 成本控制 | 100 个实体的关联类型识别 AI 调用 ≤ 10 次 | 日志统计 |

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-04-30 | 初始化 L2.2 需求文档 |
