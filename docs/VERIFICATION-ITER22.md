# VERIFICATION.md — Iteration #22 Review

> **L1.3 交叉引用自动生成** — 导出的 Markdown 页面之间自动建立 `[[wikilinks]]`
> 审查日期: 2026-04-30
> 审查人: Guard Agent

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | **零实现** — 无任何代码变更，5 个验收标准（AC-1 至 AC-5）均未实现 |
| 代码质量 | ❌ | 无法评估 — 不存在可审查的代码 |
| 测试覆盖 | ❌ | 零测试 — 无 `test-cross-reference.js` 或任何相关测试文件 |
| 文档同步 | ❌ | TODO.md 中 L1.3 仍标记 `[ ]`；CHANGELOG.md 无 R22 记录；IMPLEMENTATION.md 无 R22 章节 |

---

## 测试结果

```
# 新增测试: 0
# 通过: 0
# 失败: 0
```

无测试可运行。全项目既有测试未执行回归验证（因为无代码变更，回归不适用）。

---

## 详细审查

### 代码变更分析

```
$ git diff HEAD --stat
(empty — 0 files changed, 0 insertions, 0 deletions)
```

**Git 工作树状态**:
- `master` 分支，与 `origin/master` 同步
- 仅有 2 个未跟踪文件：`docs/REQUIREMENTS-ITER22.md`（需求文档）和 `docs/reports/2026-04-30-R21.md`（R21 报告）
- 无已暂存或已修改的文件

### 验收标准覆盖状态

| AC | 描述 | 状态 |
|----|------|------|
| AC-1 | 基于实体匹配的跨条目链接 | ❌ 未实现 |
| AC-2 | 基于标签关联的辅助链接 | ❌ 未实现 |
| AC-3 | 实体/概念页面的交叉引用 | ❌ 未实现 |
| AC-4 | 孤立页面自动补链 | ❌ 未实现 |
| AC-5 | 集成到导出流程 | ❌ 未实现 |

### 预期新增文件（均缺失）

| 文件 | 用途 | 状态 |
|------|------|------|
| `lib/cross-reference.js` | 交叉引用核心模块 | ❌ 不存在 |
| `tests/test-cross-reference.js` | 单元测试 | ❌ 不存在 |

### 预期修改文件（均无变更）

| 文件 | 预期变更 | 状态 |
|------|----------|------|
| `lib/entity-extractor.js` | 实体页/概念页 Markdown 生成改用 `[[wikilinks]]` | ❌ 无变更 |
| `docs/CHANGELOG.md` | 新增 R22 条目 | ❌ 无变更 |
| `docs/TODO.md` | L1.3 标记 `[x]` | ❌ 无变更 |
| `docs/IMPLEMENTATION.md` | 新增 R22 实现记录 | ❌ 无变更 |

---

## 发现的问题

### CRITICAL — 迭代完全未实施

**问题**: 迭代 22 的需求文档 `docs/REQUIREMENTS-ITER22.md` 已就绪，但**没有任何实现代码**。这不是"代码有缺陷"的情况，而是"代码不存在"的情况。

**根因分析**（推测）:
- Plan Agent 正确产出了详尽的需求文档（8 个章节、5 个验收标准、6 个技术约束）
- 但 Implement Agent 可能未被调度，或调度时发生了跳过
- 需求文档的 `Status: ??`（untracked）表明它可能刚生成但尚未触发下游实现

**影响**:
- L1.1（Wiki 导出）和 L1.2（实体提取）的产出物仍为孤立的文件集合
- `[[wikilinks]]` 交叉引用机制完全缺失
- 用户在 Obsidian 中打开导出目录时，图谱视图仍为孤立节点

---

## 返工任务清单

| # | 优先级 | 任务 | 估计工时 | 依赖 |
|---|--------|------|----------|------|
| 1 | **P0** | **创建 `lib/cross-reference.js`** — 实现交叉引用核心模块 | 2h | 无 |
| | | - `buildInvertedIndex(entities, concepts, entries)` — 构建实体→条目倒排索引 | | |
| | | - `computeEntityLinks(entries, entityIndex)` — 基于共享实体建立条目间双向链接 | | |
| | | - `computeTagLinks(entries, existingLinks)` — 基于共享标签建立辅助链接（每标签最多 3 个，总计 ≤ 10） | | |
| | | - `patchOrphanPages(entries, allLinks, categoryMap)` — 孤立页面自动补链（≥ 2 出站链接） | | |
| | | - `injectCrossReferences(fileHandle, entryLinks, progressCallback)` — 文件回写（读取→注入 `## 相关主题`→重写） | | |
| | | - `buildEntityPageLinks(entities, concepts)` — 实体/概念页内部链接升级为 `[[wikilinks]]` | | |
| 2 | **P0** | **创建 `tests/test-cross-reference.js`** — 单元测试 | 1.5h | #1 |
| | | - 倒排索引构建测试（多实体、无实体、大小写不敏感） | | |
| | | - 实体链接测试（双向链接、无共享实体、自引用排除） | | |
| | | - 标签链接测试（≤ 3 条限制、≥ 10 总链接上限） | | |
| | | - 孤立页面补链测试（同分类优先、全局回退、`related: auto` 标记） | | |
| | | - 文件注入测试（`## 相关主题` 追加、已有章节替换、frontmatter 不被破坏） | | |
| | | - Wikilink 格式测试（`\|` 和 `#` 转义、`[[文件名\|显示标题]]` 语法） | | |
| | | - 预期: ≥ 20 个测试用例 | | |
| 3 | **P0** | **更新 `lib/entity-extractor.js`** — 实体/概念页链接格式升级 | 30min | #1 |
| | | - `generateEntityMarkdown()`: "相关问答" 章节的 `entries/xxx.md` 相对路径 → `[[条目标题]]` | | |
| | | - `generateConceptMarkdown()`: 同上 | | |
| | | - "关联实体" 章节确保使用 `[[实体名]]` 格式（L1.2 部分已实现，需验证一致性） | | |
| 4 | **P0** | **集成到导出流程** — 进度条阶段 + index.md 统计 | 30min | #1, #3 |
| | | - 在 `sidebar.js` 的导出流程中，L1.2 之后追加 L1.3 阶段 | | |
| | | - 进度条显示 "正在建立交叉引用…" | | |
| | | - `index.md` 末尾追加 `> 交叉引用: X 条双向链接 \| Y 个孤立页面已补链` | | |
| 5 | **P1** | **更新文档** | 15min | #1-#4 |
| | | - `docs/CHANGELOG.md`: 新增 R22 条目 | | |
| | | - `docs/TODO.md`: L1.3 标记 `[x]` | | |
| | | - `docs/IMPLEMENTATION.md`: 新增 R22 实现记录 | | |

**估计总工时**: ~4.5 小时

---

## 技术评审意见（针对需求文档，预审）

虽然代码未实现，需求文档质量高，提前给出技术评审意见以便实现时参考：

### 1. 倒排索引构建策略 ✅

需求 TC-5 提出的 `Map<entityNameLower, Set<entryId>>` 方案合理。注意大小写折叠需统一（建议 `toLocaleLowerCase()` 以处理 Unicode）。

### 2. 文件回写安全性 ⚠️

TC-6 的 `truncate` 模式覆盖整个文件是正确的，但需要确保：
- 回写前 `## 相关主题` 注入后 YAML frontmatter 完整性不被破坏
- 建议先用正则定位 `---\n...\n---` 和正文位置，仅修改正文部分

### 3. `[[wikilinks]]` 标题冲突风险 ⚠️

如果两个不同条目有相同标题（虽然概率低），`[[wikilinks]]` 在 Obsidian 中会解析到第一个匹配文件。建议在倒排索引中检查标题唯一性，冲突时使用 `[[文件名|显示标题]]` 语法。

### 4. 性能目标可行性 ✅

TC-3 目标 1000 条 < 3 秒。倒排索引构建是 O(N) 扫描，链接计算是 O(E × N)（E=实体数，N=条目数），纯内存操作，目标可行。

---

## 最终结论

**❌ 未通过 — 迭代完全未实施**

本次 Guard Review 检测到一个**严重流程问题**：需求文档已就绪但代码实现完全缺失。这不是代码质量问题，而是实现阶段的彻底跳过。

**建议行动**:
1. 立即创建 `lib/cross-reference.js` 并实现全部 5 个验收标准
2. 同步编写 ≥ 20 个单元测试
3. 集成到现有导出流程
4. 修复 R21 Guard Review 遗留的 P1 问题（`escapeYamlString` YAML 转义）
5. 全部完成后重新提交 Guard Review
