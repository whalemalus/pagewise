# 设计文档 — 迭代 24: L2.1 Q&A 自动分类

> 日期: 2026-04-30
> 状态: 实现中

## 背景

Level 1 已完成的知识编译基础设施：
- **L1.2** `lib/entity-extractor.js`: 批量提取 Q&A 中的实体/概念（面向导出场景）
- **L1.3** 交叉引用自动生成
- **L1.4** Git 集成

但 L1.2 的实体提取是**批量/导出时**执行的，不适合「每次 AI 回答后实时分类」的场景。
L2.1 需要一个**轻量级、实时**的自动分类器，在每次 AI 回答后立即识别并标记实体/概念。

## 需求

1. **实时分类**: AI 回答保存到知识库时，自动调用 AI 识别 Q&A 中的实体和概念
2. **存储扩展**: IndexedDB 新增 `entities` 和 `concepts` objectStore
3. **关联关系**: 分类结果关联到对应的 Q&A 条目（entryId）
4. **去重合并**: 已存在的实体/概念自动合并新出现的条目关联
5. **非阻塞**: 分类失败不影响主流程（Q&A 正常保存）

## 架构设计

### 新增模块: lib/auto-classifier.js

```
┌─────────────────────────────────────────────────────────────────────┐
│ AutoClassifier                                                      │
│   constructor(aiClient)                                             │
│                                                                     │
│   ── 分类主流程 ──                                                   │
│   classifyEntry(entry) → Promise<{entities[], concepts[]}>           │
│     调用 AI 识别单条 Q&A 中的实体/概念                               │
│                                                                     │
│   ── 存储操作 ──                                                     │
│   saveClassification(entryId, result) → Promise<void>                │
│     将分类结果写入 IndexedDB entities/concepts stores                │
│     并关联到对应 entryId                                             │
│                                                                     │
│   ── 查询操作 ──                                                     │
│   getEntitiesByEntry(entryId) → Promise<Entity[]>                   │
│   getConceptsByEntry(entryId) → Promise<Concept[]>                  │
│   getEntriesByEntity(entityName) → Promise<number[]>                │
│   getEntriesByConcept(conceptName) → Promise<number[]>              │
│   getAllEntities() → Promise<Entity[]>                               │
│   getAllConcepts() → Promise<Concept[]>                              │
│                                                                     │
│   ── 批量操作 ──                                                     │
│   classifyBatch(entries) → Promise<Map<entryId, {entities,concepts}>>│
│   rebuildAll(entries) → Promise<void>                                │
│     全量重编译（清除旧数据后重新分类所有条目）                        │
│                                                                     │
│   ── 编译状态 ──                                                     │
│   getClassificationStatus(entryId) → Promise<ClassificationStatus>  │
│   getStats() → Promise<{entityCount, conceptCount, classifiedCount}>│
│                                                                     │
│   ── 内部方法 ──                                                     │
│   _buildClassificationPrompt(entry) → string                        │
│   _parseClassificationResponse(response) → {entities[], concepts[]} │
│   _findOrCreateEntity(name, type, description, entryId) → Promise   │
│   _findOrCreateConcept(name, description, entryId) → Promise        │
│   _ensureInit() → Promise<void>                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### IndexedDB Schema 扩展

**entities** objectStore:
```js
{
  id: number,           // autoIncrement
  name: string,         // 实体名称（唯一）
  type: string,         // 实体类型（tool, framework, api, ...）
  description: string,  // 描述
  entryIds: number[],   // 关联的 Q&A 条目 ID 列表
  createdAt: string,    // ISO 时间戳
  updatedAt: string     // ISO 时间戳
}
```

**concepts** objectStore:
```js
{
  id: number,           // autoIncrement
  name: string,         // 概念名称（唯一）
  description: string,  // 描述
  entryIds: number[],   // 关联的 Q&A 条目 ID 列表
  createdAt: string,    // ISO 时间戳
  updatedAt: string     // ISO 时间戳
}
```

**entries** objectStore 扩展字段:
```js
{
  ...existing fields,
  classified: boolean,  // 是否已分类
  classifiedAt: string  // 分类时间
}
```

### 分类提示词策略

与 L1.2 的 `buildExtractionPrompt` 不同，L2.1 针对**单条 Q&A**设计：
- 更简洁的提示词（单条 vs 批量）
- 更快的响应（不需要批量上下文）
- 可复用 L1.2 的实体类型定义（`ENTITY_TYPES`）

### 容错策略

- AI 调用失败 → 标记 entry.classified=false，下次可重试
- JSON 解析失败 → 返回空结构，记录 warn 日志
- IndexedDB 写入失败 → 不影响主流程，静默降级

## 文件清单

| 操作 | 文件 |
|------|------|
| 新增 | `lib/auto-classifier.js` — Q&A 自动分类模块 |
| 新增 | `tests/test-auto-classifier.js` — 自动分类测试 |
| 修改 | `docs/IMPLEMENTATION.md` — 记录实现内容 |
| 修改 | `docs/CHANGELOG.md` — 记录变更 |
| 修改 | `docs/TODO.md` — 标记完成 |

## 技术决策

- **纯 ES Module**: 与 entity-extractor.js 保持一致，不依赖 Chrome API
- **单条分类 prompt**: 针对单条 Q&A 优化，比批量 prompt 更精准
- **复用 ENTITY_TYPES**: 与 L1.2 共享实体类型定义
- **去重策略**: 同名实体自动合并 entryIds（case-insensitive）
- **非阻塞设计**: classifyEntry 内部 catch 所有异常，返回空结果而非 throw
