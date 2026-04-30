# 设计文档 — 迭代 28: L2.5 增量编译

> 日期: 2026-04-30

---

## 目标

不是每次全量重新编译，只处理变化部分。通过跟踪每个条目的编译状态、内容哈希和时间戳，实现高效的增量编译。

## 核心设计

### 编译状态枚举

```js
export const COMPILE_STATUS = {
  PENDING: 'pending',       // 新增/已修改，待编译
  COMPILED: 'compiled',     // 已编译，无变化
  STALE: 'stale',           // 关联数据变化，需部分重编译
  FAILED: 'failed',         // 编译失败
};
```

### CompileRecord（编译记录）

每个条目维护一条编译记录：

```js
{
  entryId: number,        // 条目 ID
  status: string,         // COMPILE_STATUS
  contentHash: string,    // 条目内容哈希（FNV-1a 32-bit）
  compiledAt: string,     // 上次编译 ISO 时间
  entityNames: string[],  // 编译时关联的实体名称列表
  conceptNames: string[], // 编译时关联的概念名称列表
}
```

### IncrementalCompiler 类

主类，纯 ES Module，不依赖 IndexedDB 或 Chrome API。

**核心方法：**

1. `computeContentHash(entry)` — 计算条目内容哈希
2. `needsCompilation(entry)` — 判断条目是否需要编译
3. `filterChangedEntries(entries)` — 筛选需要编译的条目
4. `markCompiled(entryId, result)` — 标记已编译
5. `markStale(entryId)` — 标记过期
6. `markFailed(entryId)` — 标记失败
7. `getStatus(entryId)` / `getRecord(entryId)` — 查询状态
8. `getStats()` — 编译统计（各状态计数、缓存命中率）
9. `invalidate(entryId)` — 使缓存失效
10. `invalidateByEntity(entityName)` — 按实体失效
11. `invalidateByConcept(conceptName)` — 按概念失效
12. `getPendingEntries(allEntries)` — 获取待编译条目
13. `buildIncrementalPlan(allEntries, existingEntities, existingConcepts)` — 增量编译计划

### 内容哈希策略

- FNV-1a 32-bit 哈希
- 哈希输入: `entry.question + '||' + entry.answer + '||' + entry.tags.join(',')`

### 增量编译计划

```js
{
  toCompile: [],      // 需要编译的新/修改条目
  toReclassify: [],   // 关联变化，需重分类
  skipped: [],        // 已编译且无变化
  summary: { total, toCompile, toReclassify, skipped }
}
```

### 实体/概念失效机制

- 新实体: 只关联新条目，不重编译已有条目
- 实体更新: 使所有关联条目标记为 STALE
- STALE 条目: 下次只重新分类，不重新提取

## 文件清单

- `lib/incremental-compiler.js` — 主模块
- `tests/test-incremental-compiler.js` — 单元测试
