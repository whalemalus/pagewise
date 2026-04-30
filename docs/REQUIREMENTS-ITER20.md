# 需求文档 — Iteration 20: 知识库导出为 LLM Wiki 格式

> 需求编号: R030
> 优先级: P1
> 迭代: R20
> 飞轮阶段: L1.1 (Level 1 — 知识库 Markdown 导出)
> 日期: 2026-04-30
> 负责: Plan Agent

---

## 一、背景与动机

### 战略定位

本需求是 **LLM Wiki 知识编译系统**（详见 `TODO.md` — "下一阶段"）的基石任务。Karpathy 提出的 LLM Wiki 模式核心理念是：将知识组织为结构化的 Markdown 文件，既能被人类浏览理解，又能作为 LLM 的上下文（RAG 知识源）。

PageWise 当前的知识库存储在 IndexedDB 中，数据以 JSON 形式封闭在浏览器沙箱内。虽然 R12 已实现了 Obsidian 兼容的 Markdown 导出（含 YAML frontmatter、筛选导出、自动备份），但 R12 的导出目标是**备份/迁移**，而 L1.1 的目标是**编译知识为 Wiki**——这是两个本质不同的使用场景。

### 问题陈述

| 问题 | 影响 | 用户场景 |
|------|------|----------|
| R12 导出的 Markdown 是"备份格式"，不构成可浏览的知识体系 | 导出的文件只能用于重新导入 PageWise 或 Obsidian，无法作为独立 Wiki 使用 | "我希望导出后的文件夹本身就是一个结构化的技术知识库" |
| 所有条目导出到一个目录，无分类组织结构 | 200 条知识平铺在一个目录下，无法快速定位 | "我希望按主题分组浏览，而不是在一堆文件里翻找" |
| 没有索引文件，LLM 无法高效索引整个 Wiki | 需要逐文件扫描才能了解 Wiki 全貌 | "我希望有一个 index.md，让 Claude Code 能快速了解我的知识库全貌" |
| 不支持增量导出，每次全量覆盖 | 500 条知识库中只有 5 条新增，却需要重新导出全部 | "我只希望导出上次之后新增或修改的条目" |

### 与 R12 导出的区别

| 维度 | R12 (Obsidian 导出) | L1.1 (LLM Wiki 导出) |
|------|---------------------|----------------------|
| 目标 | 备份/迁移/导入 Obsidian | 构建可浏览+可被 LLM 索引的 Wiki |
| 文件组织 | 扁平目录，每条一个文件 | 按标签/分类分目录 + 自动生成 index.md |
| 索引 | 无 | `index.md` 全局索引（按分类+标签分组） |
| 增量 | 不支持 | 基于 `updatedAt` 的增量导出 |
| 导出入口 | Options 页 + 侧边栏知识面板 | 侧边栏知识面板（新增按钮） |
| 文件系统 API | 不使用 | File System Access API |

---

## 二、用户故事

### US-1: 开发者导出知识库为本地 Wiki

> 作为一名技术开发者，我希望把 PageWise 积累的知识库导出为一个结构化的本地 Wiki 目录（按主题分类、含 index.md 索引），这样我可以直接用 VS Code 或 Obsidian 浏览，也可以将这个目录作为 Claude Code / Cursor 的 `@docs` 上下文，让 LLM 基于我的知识库回答问题。

### US-2: 重度用户增量更新 Wiki

> 作为一名积累了 300+ 条知识的用户，我希望每次只导出新增或修改的条目（而不是全量覆盖），这样我可以在本地维护一个持续增长的技术 Wiki，而不必每次都等待全量导出完成。

---

## 三、验收标准

### AC-1: 文件结构 — 每条 Q&A 独立 Markdown 文件

- [ ] 每条知识条目导出为一个独立的 `.md` 文件
- [ ] 文件头包含 YAML frontmatter，字段如下：

```yaml
---
title: "条目标题"
tags: [tag1, tag2, tag3]
source: "https://原始页面URL"
category: "分类名称"
created: "2026-04-30T12:00:00Z"
updated: "2026-04-30T12:00:00Z"
---
```

- [ ] 正文结构：`## 问题` → 问题内容 → `## 回答` → 回答内容 → `## 摘要` → 摘要内容
- [ ] 问题或回答为空时，对应的 H2 章节省略（不输出空章节）
- [ ] 文件名格式：`{标题}.md`，标题中的文件系统不安全字符（`/ \ : * ? " < > |`）替换为 `-`，连续 `-` 合并为单个
- [ ] 文件名超过 100 字符时截断至 100 字符（不含 `.md` 扩展名）

### AC-2: 目录结构 — 按分类/标签分组

- [ ] 导出的 Wiki 目录结构如下：

```
{用户选择的目录名}/
├── index.md                    # 全局索引
├── {分类1}/                    # 一级分类目录
│   ├── {条目标题}.md
│   ├── {条目标题}.md
│   └── ...
├── {分类2}/
│   ├── {条目标题}.md
│   └── ...
└── _uncategorized/             # 未分类条目（category 为空或 "未分类"）
    └── {条目标题}.md
```

- [ ] `index.md` 自动生成，包含：
  - 标题：`# PageWise 知识库`
  - 导出时间和条目总数
  - 按分类分组的条目列表（每条含标题链接和标签）
  - 按标签的交叉索引（列出每个标签下的条目列表）

- [ ] `index.md` 中的条目使用相对 Markdown 链接：`[条目标题](分类名/条目文件名.md)`
- [ ] 分类名中的文件系统不安全字符同样替换为 `-`

### AC-3: 增量导出

- [ ] 第二次及之后的导出只处理 `updatedAt` 晚于上次导出时间的条目
- [ ] 上次导出时间戳存储在 `chrome.storage.local` 中，key 为 `llmWikiLastExportAt`
- [ ] 增量导出时：
  - 新增条目：创建新文件
  - 修改条目：覆盖已有文件
  - 删除条目：**不自动删除**已有文件（避免误删），但在 index.md 中不再列出已删除条目
- [ ] 增量导出完成后，更新 `llmWikiLastExportAt` 时间戳
- [ ] `index.md` 在每次导出时**全量重建**（反映当前完整知识库状态），不受增量逻辑影响
- [ ] 支持"全量导出"选项（忽略上次导出时间，重新导出所有条目）

### AC-4: 导出交互 — File System Access API

- [ ] 侧边栏知识面板新增「📚 导出为 Wiki」按钮
- [ ] 点击后调用 `window.showDirectoryPicker()` 让用户选择目标目录
- [ ] 选择目录后显示确认对话框：「将导出 X 条知识条目到 {目录名}，是否继续？」
- [ ] 条目数 > 20 时显示进度条（百分比 + 已处理/总数）
- [ ] 导出过程中用户可取消
- [ ] 导出完成后显示 Toast 通知：「✅ Wiki 导出完成：X 个文件，Y 个分类」
- [ ] 导出失败时显示具体错误信息（权限拒绝、磁盘空间不足等）

### AC-5: 向后兼容

- [ ] 现有的 `exportJSON()` 和 `exportMarkdown()` 方法**不做任何修改**
- [ ] R12 的筛选导出、Obsidian 格式导出、自动备份功能**不受影响**
- [ ] 新增模块 `lib/wiki-exporter.js`，所有 LLM Wiki 导出逻辑封装在此模块中
- [ ] `KnowledgeBase` 类不新增方法，`wiki-exporter.js` 通过现有 `getAllEntries()` / `getAggregations()` API 读取数据

---

## 四、技术约束

### TC-1: File System Access API 可用性

- `window.showDirectoryPicker()` 需要 Chrome 86+，本扩展 `minimum_chrome_version` 为 110，满足要求
- File System Access API 在 Chrome 扩展侧边栏（sidePanel）中可用，前提是通过用户手势（click）触发
- **降级方案**：若 `showDirectoryPicker()` 不可用（如 Safari、Firefox 或旧版 Edge），回退为导出为单个 JSON 文件并下载（复用 R12 的 `chrome.downloads.download()` 路径）
- 需在 `manifest.json` 中添加 `'fileSystem'` 权限（`"fileSystem": ["directory", "retainEntries"]`）

### TC-2: 不引入外部依赖

- YAML frontmatter 序列化使用手写的格式化函数（仅需支持 string / array / date 类型），不引入 `js-yaml`
- 复用 R12 `importer.js` 中已有的 `parseSimpleYAML()` 思路，反向实现序列化
- 文件名清理使用正则表达式，不引入 `sanitize-filename` 等第三方库

### TC-3: 内存与性能

- 导出过程使用 cursor 顺序读取（复用现有 `getAllEntries(limit)` 模式），不将全部条目加载到内存
- 每读取一个条目即格式化并写入文件（流式处理），不累积内存
- `index.md` 的生成需要先收集所有条目的元信息（标题、分类、标签），在内存中维护一个轻量级元数据数组（每条约 200 bytes），1000 条 ≈ 200KB，可接受
- 1000 条知识库全量导出耗时目标 < 10 秒

### TC-4: 文件写入策略

- 使用 `FileSystemDirectoryHandle.getFileHandle(name, { create: true })` + `FileSystemWritableFileStream` 写入
- 分类目录使用 `FileSystemDirectoryHandle.getDirectoryHandle(name, { create: true })` 创建
- 增量导出时，通过读取 `llmWikiLastExportAt` 判断是否需要创建新文件或覆盖已有文件
- 写入前检查同名文件（标题清理后可能冲突），冲突时在文件名后追加 `-2`, `-3` 等后缀

### TC-5: 数据映射

Wiki 条目 → IndexedDB 字段映射：

| Wiki 字段 | IndexedDB 字段 | 说明 |
|-----------|---------------|------|
| frontmatter.title | entry.title | 直接映射 |
| frontmatter.tags | entry.tags | 数组 |
| frontmatter.source | entry.sourceUrl | URL |
| frontmatter.category | entry.category | 用于决定存放子目录 |
| frontmatter.created | entry.createdAt | ISO 时间戳 |
| frontmatter.updated | entry.updatedAt | ISO 时间戳 |
| 正文.问题 | entry.question | 非空时输出 |
| 正文.回答 | entry.answer | 非空时输出 |
| 正文.摘要 | entry.summary | 非空时输出 |

---

## 五、依赖关系

| 依赖 | 类型 | 说明 |
|------|------|------|
| R003 (知识库存储) | 数据依赖 | 导出的数据来源，复用 `KnowledgeBase.getAllEntries()` 和 `getAggregations()` |
| R005 (数据导出) | 功能依赖 | 新增导出模式，不修改现有 `exportJSON()` / `exportMarkdown()` |
| R12 (知识库导出增强) | 共存依赖 | L1.1 与 R12 的导出功能并行存在，互不干扰 |
| `lib/knowledge-panel.js` | UI 依赖 | 新增「导出为 Wiki」按钮，需在知识面板导出区域添加 |
| File System Access API | 浏览器 API | Chrome 86+ 的 `showDirectoryPicker()` / `FileSystemWritableFileStream` |
| `chrome.storage.local` | 存储依赖 | 存储 `llmWikiLastExportAt` 增量导出时间戳 |

---

## 六、不在范围内 (Out of Scope)

| 项目 | 原因 | 归属 |
|------|------|------|
| L1.2 实体/概念自动提取 | 需要 AI 调用，复杂度高，独立迭代 | L1.2 |
| L1.3 交叉引用 `[[wikilinks]]` | 依赖 L1.2 的实体提取 | L1.3 |
| L1.4 Git 集成 | 需要 git 命令行或 isomorphic-git 库 | L1.4 |
| Obsidian 插件直接集成 | 超出 Chrome 扩展范围 | 远期 |
| 已删除条目的文件清理 | 避免误删，用户手动管理 | 后续迭代可选 |
| 服务端 Wiki 同步 | 属于 L3.6 范围 | L3.6 |
| Wiki 浏览模式 | 属于 L3.1 范围 | L3.1 |
| 导出筛选（按标签/分类/时间） | R12 已实现，L1.1 保持全量/增量两种模式 | 已完成 (R12) |

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| File System Access API 在 sidePanel 中权限受限 | 中 | 高 | 实现前编写最小 PoC 验证；若不可用则降级为 ZIP 打包下载 |
| 标题清理后大量文件名冲突 | 低 | 中 | 冲突检测 + 数字后缀；同时保留 `id` 信息在 frontmatter 中用于追溯 |
| 大知识库（1000+ 条）导出性能 | 中 | 中 | 流式处理 + 进度反馈 + 可取消；1000 条目标 < 10 秒 |
| `manifest.json` 新增 `fileSystem` 权限导致 Chrome Web Store 审核 | 低 | 中 | `fileSystem` 权限是标准权限，且声明为最小范围（仅 directory + retainEntries） |
| YAML frontmatter 中特殊字符（引号、冒号）导致解析错误 | 低 | 低 | 所有字符串值使用双引号包裹，内部引号转义 |

---

## 八、成功指标

| 指标 | 目标 | 衡量方式 |
|------|------|----------|
| 导出正确性 | 100% 条目成功导出，frontmatter 可被标准 YAML 解析器解析 | 单元测试：构造条目 → 导出 → 读回 → 验证字段 |
| index.md 链接有效性 | 所有相对链接指向实际存在的文件 | 自动化测试：遍历 index.md 中的链接 → 检查文件存在性 |
| 增量导出正确性 | 新增/修改条目正确导出，未变更条目跳过 | 测试：导出 → 修改 1 条 → 再次导出 → 验证仅 1 个文件更新 |
| 性能 | 1000 条全量导出 < 10 秒 | 性能测试（模拟 IndexedDB 环境） |
| 向后兼容 | R12 导出功能零回归 | 回归测试 |

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-04-30 | 初始化 L1.1 需求文档 |
