# VERIFICATION.md — Iteration #20 Review

> 审查日期: 2026-04-30
> 审查员: Guard Agent
> 迭代: #20 — L1.1 知识库导出为 LLM Wiki 格式
> 需求文档: `docs/REQUIREMENTS-ITER20.md`

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | **零实现** — 无新增代码文件、无现有文件修改。仅有需求文档，无任何功能代码 |
| 代码质量 | ❌ | **无代码可审查** — `lib/wiki-exporter.js` 未创建，所有 5 个验收标准（AC-1 至 AC-5）均未实现 |
| 测试覆盖 | ❌ | **零测试** — 无 `tests/test-wiki-exporter.js` 或任何相关测试文件 |
| 文档同步 | ⚠️ | `docs/REQUIREMENTS-ITER20.md` 已创建（质量良好），但 CHANGELOG.md 未更新、TODO.md L1.1 未标记完成 |

---

## 需求文档质量评估

虽然代码未交付，但 `docs/REQUIREMENTS-ITER20.md` 需求文档本身质量**优秀**：

- ✅ 背景与动机清晰，与 R12 导出的区别对比表到位
- ✅ 两个用户故事 (US-1, US-2) 场景明确
- ✅ 5 个验收标准 (AC-1 ~ AC-5) 可测试、可度量
- ✅ 5 个技术约束 (TC-1 ~ TC-5) 含降级方案、性能目标
- ✅ 依赖关系和 Out of Scope 清晰界定
- ✅ 风险矩阵含缓解措施
- ✅ 数据映射表（Wiki 字段 → IndexedDB 字段）准确无误

---

## 功能清单核对（期望 vs 实际）

### 验收标准对照

| AC | 需求 | 期望产物 | 实际 | 状态 |
|------|------|------|------|------|
| AC-1 | 文件结构 — 每条 Q&A 独立 .md + YAML frontmatter | `lib/wiki-exporter.js` 中的 `formatEntryAsWikiMarkdown(entry)` | 不存在 | ❌ |
| AC-2 | 目录结构 — 按分类分组 + index.md 索引 | `lib/wiki-exporter.js` 中的 `generateIndexMd()` | 不存在 | ❌ |
| AC-3 | 增量导出 — `updatedAt` 基于时间戳 + `chrome.storage.local` | `lib/wiki-exporter.js` 中的增量逻辑 | 不存在 | ❌ |
| AC-4 | 导出交互 — File System Access API + 进度条 + Toast | sidebar.html 新增按钮 + sidebar.js handler | 不存在 | ❌ |
| AC-5 | 向后兼容 — 不修改现有 export 方法 | `knowledge-base.js` 未修改 | ✅（空合规） | ✅ |

### 文件变更期望 vs 实际

| 文件 | 期望变更 | 实际变更 | 状态 |
|------|------|------|------|
| `lib/wiki-exporter.js` | **新增** — 所有 Wiki 导出逻辑 | 不存在 | ❌ |
| `sidebar/sidebar.html` | 新增「📚 导出为 Wiki」按钮 | 无变更 | ❌ |
| `sidebar/sidebar.js` | 新增 Wiki 导出 handler + 进度 UI | 无变更 | ❌ |
| `sidebar/sidebar.css` | 新增进度条样式 | 无变更 | ❌ |
| `manifest.json` | 新增 `fileSystem` 权限 | 无变更 | ❌ |
| `tests/test-wiki-exporter.js` | **新增** — 单元测试 | 不存在 | ❌ |
| `lib/knowledge-base.js` | **不应修改**（AC-5 向后兼容） | 未修改 | ✅ |
| `lib/knowledge-panel.js` | **不应修改**（wiki-exporter 通过现有 API 读数据） | 未修改 | ✅ |
| `docs/CHANGELOG.md` | 新增 R20 条目 | 未更新 | ❌ |
| `docs/TODO.md` | L1.1 标记 `[x]` | 仍为 `- [ ]` | ❌ |

---

## 发现的问题

### 🔴 P0 — 零实现：全部功能代码缺失

**严重程度**: 阻断 (Blocker)

迭代 #20 的实现**完全不存在**。代码库中：
- 没有 `lib/wiki-exporter.js`
- 没有任何文件被修改
- 没有任何测试被创建
- Git 中仅有 1 个 untracked 文件：`docs/REQUIREMENTS-ITER20.md`

这表明 Plan Agent 仅完成了需求文档编写，Build Agent 未执行或执行失败。

### 🔴 P0 — manifest.json 未添加 fileSystem 权限

**文件**: `manifest.json`

需求 TC-1 明确要求添加 `"fileSystem"` 权限以支持 File System Access API：
```json
"permissions": [
  "storage",
  "sidePanel",
  "contextMenus",
  "tabs",
  "activeTab",
  "fileSystem"     // ← 需要新增
]
```
以及对应的 `fileSystem` 字段声明。当前 manifest.json 无任何变更。

### 🔴 P0 — 测试覆盖为零

**期望**: 至少包含以下测试场景（参照需求文档 §八 成功指标）：
1. `formatWikiFrontmatter()` — 构造条目 → 序列化 → 验证 YAML 可解析
2. `sanitizeFileName()` — 特殊字符替换、长度截断、连续 `-` 合并
3. `formatEntryAsWikiMarkdown()` — 完整条目 → 验证 frontmatter + 正文结构
4. `generateIndexMd()` — 多分类条目 → 验证分类分组 + 标签交叉索引 + 链接有效性
5. 增量导出 — 模拟 `updatedAt` 时间戳过滤
6. 文件名冲突 — 同名条目追加 `-2` / `-3` 后缀
7. 空字段处理 — question/answer/summary 为空时章节省略
8. 向后兼容 — 确认 `exportJSON()` / `exportMarkdown()` 未被修改

**实际**: 无任何测试文件。0 通过 / 0 失败。

### 🟡 P1 — 文档同步缺失

| 文件 | 问题 | 修复建议 |
|------|------|------|
| `docs/CHANGELOG.md` | 无 R20 条目 | 在 `[Unreleased]` 下添加「L1.1 知识库导出为 LLM Wiki 格式」条目 |
| `docs/TODO.md` | L93 `L1.1` 仍为 `- [ ]` | 完成后标记为 `[x]` |
| `docs/ROADMAP-20.md` | 未检查是否需更新 | 确认 ROADMAP 与实际交付一致 |

---

## 返工任务清单

### Phase 1: 核心模块 (lib/wiki-exporter.js)

| # | 优先级 | 任务 | 文件 | 估时 |
|---|--------|------|------|------|
| 1 | 🔴 P0 | 创建 `lib/wiki-exporter.js`，实现以下纯函数： | `lib/wiki-exporter.js` | 60min |
|   |        | — `sanitizeFileName(title)` — 清理文件系统不安全字符，截断 100 字符，合并连续 `-` | | |
|   |        | — `serializeYAML(fields)` — 手写 YAML frontmatter 序列化（支持 string/array/date） | | |
|   |        | — `formatEntryAsWikiMarkdown(entry)` — 生成完整 Wiki 条目 .md 内容 | | |
|   |        | — `generateIndexMd(entries)` — 生成全局索引（分类分组 + 标签交叉索引） | | |
|   |        | — `exportWiki(memory, options)` — 主流程（增量/全量、File System Access API 交互） | | |
| 2 | 🔴 P0 | `exportWiki()` 实现 File System Access API 调用： | `lib/wiki-exporter.js` | 30min |
|   |        | — `showDirectoryPicker()` 获取目录句柄 | | |
|   |        | — `getDirectoryHandle(name, { create: true })` 创建分类子目录 | | |
|   |        | — `getFileHandle(name, { create: true })` + `createWritable()` 写入文件 | | |
| 3 | 🔴 P0 | 增量导出逻辑： | `lib/wiki-exporter.js` | 20min |
|   |        | — 读取 `chrome.storage.local` 的 `llmWikiLastExportAt` | | |
|   |        | — 按 `updatedAt` 过滤新增/修改条目 | | |
|   |        | — `index.md` 全量重建，不受增量逻辑影响 | | |
|   |        | — 导出完成后更新 `llmWikiLastExportAt` | | |
| 4 | 🔴 P0 | 降级方案：`showDirectoryPicker()` 不可用时回退为 JSON 文件下载 | `lib/wiki-exporter.js` | 15min |

### Phase 2: UI 集成

| # | 优先级 | 任务 | 文件 | 估时 |
|---|--------|------|------|------|
| 5 | 🔴 P0 | `manifest.json` 添加 `fileSystem` 权限 | `manifest.json` | 2min |
| 6 | 🔴 P0 | `sidebar.html` 知识面板导出区域新增「📚 导出为 Wiki」按钮 | `sidebar/sidebar.html` | 5min |
| 7 | 🔴 P0 | `sidebar.js` 新增 Wiki 导出 handler（确认对话框、进度条、Toast 通知、错误处理） | `sidebar/sidebar.js` | 30min |
| 8 | 🟡 P1 | `sidebar.css` 新增进度条样式（`.wiki-export-progress`、`.wiki-export-progress-bar`） | `sidebar/sidebar.css` | 10min |

### Phase 3: 测试

| # | 优先级 | 任务 | 文件 | 估时 |
|---|--------|------|------|------|
| 9 | 🔴 P0 | 编写单元测试，覆盖上述 8 个测试场景 | `tests/test-wiki-exporter.js` | 45min |
| 10 | 🔴 P0 | 运行全部测试，确保 0 失败 + 无回归 | — | 10min |

### Phase 4: 文档

| # | 优先级 | 任务 | 文件 | 估时 |
|---|--------|------|------|------|
| 11 | 🟡 P1 | 更新 CHANGELOG.md — 新增 R20 条目 | `docs/CHANGELOG.md` | 5min |
| 12 | 🟡 P1 | 更新 TODO.md — L1.1 标记 `[x]` | `docs/TODO.md` | 2min |

**总估时**: ~4.5h

---

## 审核结论

**判定: ❌ 不通过 (FAIL)**

迭代 #20 **仅产出了高质量的需求文档**，但**零实现**：
- 没有创建 `lib/wiki-exporter.js`
- 没有修改 `sidebar.html` / `sidebar.js` / `sidebar.css` / `manifest.json`
- 没有编写任何测试
- 没有更新 CHANGELOG.md / TODO.md

代码库 git 状态中唯一的变更是一个 untracked 的需求文档 (`docs/REQUIREMENTS-ITER20.md`)。

**需求文档本身质量优秀**（AC 可测试、TC 完整、风险矩阵到位），可作为 Build Agent 的直接输入。建议立即启动返工，从 Phase 1 核心模块开始实现。