# VERIFICATION.md — Iteration #21 Review

> **L1.2 实体/概念自动提取** — 导出时用 AI 自动识别 Q&A 中提到的实体和概念
> 审查日期: 2026-04-30
> 审查人: Guard Agent

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ✅ | 8 个导出函数全部实现，覆盖提示词构建→AI 调用→解析→Markdown 生成→索引生成完整流程 |
| 代码质量 | ⚠️ | 整体优秀，ES Module 设计清晰；2 个小问题需关注（见下文） |
| 测试覆盖 | ⚠️ | 22 个测试全部通过，核心路径覆盖良好；缺失批量去重场景和部分边界场景 |
| 文档同步 | ✅ | CHANGELOG.md / TODO.md / IMPLEMENTATION.md 均已更新，TODO 已标记 [x] |

---

## 测试结果

```
# tests 22
# pass  22
# fail  0
```

全部 22 个新测试通过。全项目测试 1542 个（25 个失败为已知既有问题，非本迭代引入）。

> ⚠️ **IMPLEMENTATION.md 记录 "总测试: 1539"**，实际运行结果为 1542 个。建议更正。

---

## 发现的问题

### P1 — YAML 换行符未转义（低风险）

**文件**: `lib/entity-extractor.js` 第 522-527 行

`escapeYamlString()` 仅转义了 `\` 和 `"`，未转义换行符 `\n`。如果 AI 返回的实体/概念名称包含换行符，生成的 YAML frontmatter 将会损坏。

```javascript
// 当前
function escapeYamlString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}
```

**影响**: 实际风险较低（AI 返回的实体名称通常不含换行符），但属于防御性编码缺失。

**建议修复**:
```javascript
function escapeYamlString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}
```

### P2 — normalizeEntity 对字符串型 ID 丢弃（设计决策，非 Bug）

**文件**: `lib/entity-extractor.js` 第 188-189 行

```javascript
relatedEntryIds: Array.isArray(raw.relatedEntryIds)
  ? raw.relatedEntryIds.filter(id => typeof id === 'number')
  : [],
```

仅保留 `typeof === 'number'` 的 ID。如果 AI 返回 `["1", "2"]`（字符串型 ID），这些将被全部丢弃。

**建议**: 增加字符串→数字的转换:
```javascript
.filter(id => typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id)))
.map(id => typeof id === 'string' ? Number(id) : id)
```

### P3 — extractEntities 测试未覆盖批量去重场景

**文件**: `tests/test-entity-extractor.js` 第 320-352 行

当前 `extractEntities` 仅测试了 2 个场景：
1. 正常提取
2. 空条目不调用 AI

缺失测试场景：
- **批量分批处理**：当 entries.length > batchSize 时是否正确分批并合并
- **去重合并**：同名实体在不同批次出现时 relatedEntryIds 是否正确合并
- **options.batchSize 自定义配置**
- **options.model 传递**
- **AI 返回内容在 response.content 或直接在 response 上**（第 270 行 `response.content || response`）

### P4 — IMPLEMENTATION.md 测试总数不准确

**文件**: `docs/IMPLEMENTATION.md` 第 34 行

> 总测试: 1539

实际运行全项目测试总数为 **1542**（含 22 个新增 + 1520 个既有）。

---

## 模块集成状态

`lib/entity-extractor.js` 是纯工具模块，当前 **未被任何入口文件引用**（background.js / popup.js / manifest.json 均无引用）。这是预期行为——模块先完成开发和测试，集成将在后续迭代中进行。

**待集成路径**:
- L1.1 的导出流程（如有）→ 在导出 Q&A 后调用 `extractEntities()` 生成实体/概念页
- L1.3 交叉引用 → 利用 `[[wikilinks]]` 格式

---

## 代码亮点 ✨

1. **容错设计优秀**: `parseExtractionResponse` 支持直接 JSON、markdown 代码块包裹、完全无效输入三种情况，均安全降级
2. **ES Module 纯函数**: 不依赖 IndexedDB/Chrome API，易于单元测试和复用
3. **Wikilink 预留**: `[[name]]` 格式为 L1.3 交叉引用做了良好的前向兼容
4. **sanitizeFilename 覆盖全面**: 处理了文件系统不安全字符、连续短横线合并、长度截断、空值兜底

---

## 返工任务清单

| # | 优先级 | 任务 | 估计工时 |
|---|--------|------|----------|
| 1 | P1 | `escapeYamlString()` 增加 `\n` / `\r` 转义 | 5 min |
| 2 | P2 | `normalizeEntity` 增加字符串 ID → 数字转换 | 5 min |
| 3 | P3 | 补充 extractEntities 批量去重、model 传递等测试（~4 个） | 15 min |
| 4 | P4 | 修正 IMPLEMENTATION.md 中的总测试数 | 2 min |

---

## 最终结论

**✅ 通过（附条件）** — 代码质量良好，22 个测试全部通过，文档同步完整。P1-P2 为防御性编码改进，不阻塞合并。建议在合并前修复 P1（YAML 转义）并补充 P3（批量去重测试），以确保后续集成时的稳定性。
