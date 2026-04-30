# 需求文档 — Iteration 12: 知识库导出增强

> 需求编号: R023
> 优先级: P1
> 迭代: R12
> 日期: 2026-04-30
> 负责: Plan Agent

---

## 一、背景与动机

### 问题陈述

PageWise 知识库存储在 IndexedDB 中，数据完全封闭在浏览器扩展沙箱内。当前导出功能（R005）已实现基础的全量 JSON/Markdown 导出，但存在以下问题导致用户产生**锁定感**：

| 问题 | 影响 | 用户声音（假设） |
|------|------|------------------|
| 只能全量导出，不支持按标签/分类/时间筛选 | 200 条知识库中只想导出 10 条相关笔记到 Obsidian，却必须导出全部 | "我只想导出 JavaScript 相关的条目" |
| Markdown 格式为 PageWise 私有格式 | 导入 Obsidian/Notion 后格式不兼容，需要手动整理 | "导出的 Markdown 在 Obsidian 里看起来很乱" |
| 无增量备份机制 | 用户积累 500+ 条目后担心数据丢失，但手动导出太繁琐 | "我怕换电脑数据全没了" |
| 大知识库导出无进度反馈 | 1000+ 条目导出时页面卡死，用户不知道是否成功 | "点了导出按钮没反应，等了很久" |
| 批量导出仅支持 JSON，不支持 Markdown | 选中多条条目后只能导出 JSON，无法直接生成笔记 | "我只想导出选中的几条到 Markdown" |

### 竞品参考

| 竞品 | 导出能力 | 锁定感评分 (1-5，5=最低) |
|------|---------|------------------------|
| **Obsidian** | 原生 Markdown 文件，零锁定 | 5 |
| **Readwise** | CSV/Markdown/Notion 同步，API 开放 | 4 |
| **Notion** | Markdown/HTML/PDF/CSV 全格式导出 | 4 |
| **Sider/Monica** | 无导出功能 | 1 |
| **PageWise (当前)** | 全量 JSON/Markdown，无私有格式兼容 | 2 |

### 用户真正想要的

> "我的数据是**我的**。我随时能把它们完整地搬到任何地方，不丢失任何信息。"

---

## 二、用户故事

### US-1: 开发者按标签筛选导出到 Obsidian

> 作为一名前端开发者，我希望只导出带有 "JavaScript" 和 "React" 标签的知识条目为 Obsidian 兼容的 Markdown（含 YAML frontmatter），这样我可以直接拖入 Obsidian 的知识库文件夹，无需任何后处理。

### US-2: 重度用户设置每周自动备份

> 作为一名积累了 300+ 条知识条目的用户，我希望设置每周自动导出一份 JSON 备份到 Chrome 下载目录，这样即使浏览器崩溃或换电脑，我的数据也不会丢失。

### US-3: 用户验证导出-导入往返一致性

> 作为一名谨慎的用户，我希望导出的 JSON 文件能被完整地重新导入 PageWise，且所有字段（标题、标签、摘要、问答、来源 URL、时间戳）无损还原，这样我确信数据没有被锁定。

---

## 三、验收标准

### AC-1: 选择性导出（按标签/分类/时间范围筛选）

- [ ] Options 页面和侧边栏知识面板的导出区域新增筛选条件：标签（多选）、分类（下拉）、时间范围（起止日期）
- [ ] 筛选条件为空时行为等同于当前全量导出（向后兼容）
- [ ] 筛选后显示「匹配 X 条」的实时计数，导出前让用户确认条目数量
- [ ] 筛选逻辑基于现有 `KnowledgeBase.searchByTag()` / `getAllEntries()` 方法，不在 IndexedDB 层新增查询

### AC-2: Obsidian 兼容 Markdown 格式

- [ ] 新增「导出为 Obsidian Markdown」选项，生成带 YAML frontmatter 的 Markdown 文件
- [ ] YAML frontmatter 包含：`title`, `tags`（YAML 数组）, `source`, `category`, `created`, `updated`
- [ ] 正文部分：问题 → 回答 → 摘要，使用 Markdown 标题层级（### 问题、### 回答、### 摘要）
- [ ] 多条目导出时，每条生成独立 Markdown 文件，打包为 ZIP（条目数 ≤ 20）或合并为单文件（条目数 > 20）
- [ ] 生成的 Markdown 经过 Obsidian 打开后 frontmatter 可正确解析（tags 显示为标签）

### AC-3: 导出-导入往返无损验证

- [ ] 导出的 JSON 格式与 `importer.js` 的 `parseJSON()` 完全兼容（已有字段映射不变）
- [ ] 新增 `exportVersion` 字段（值为 `"2.0"`），用于未来格式升级时的兼容判断
- [ ] 导入时若检测到 `exportVersion`，按版本号选择解析策略；无版本号时按 v1.0 兼容
- [ ] 验收测试：导出 → 删除 → 导入 → 比对，所有字段值一致（包括 `createdAt` 时间戳）

### AC-4: 大知识库导出进度反馈

- [ ] 导出条目数 > 50 时，显示进度条（百分比 + 已处理/总数）
- [ ] 导出过程中用户可取消操作
- [ ] 导出完成后显示 Toast 通知：「已导出 X 条知识条目」
- [ ] 1000 条导出耗时 < 5 秒（基于 IndexedDB cursor 顺序读取，非全量加载）

### AC-5: 自动备份（定时导出）

- [ ] Options 页面新增「自动备份」设置区域
- [ ] 用户可选择备份频率：关闭 / 每天 / 每周 / 每月
- [ ] 用户可选择备份格式：JSON / Markdown
- [ ] 备份文件自动下载到 Chrome 默认下载目录，文件名含日期：`pagewise-backup-2026-04-30.json`
- [ ] 备份触发时机：扩展 Service Worker 唤醒时检查是否到期（使用 `chrome.alarms` API）
- [ ] 备份设置存储在 `chrome.storage.sync`，跨设备同步

---

## 四、技术约束

### TC-1: 不引入外部依赖

- ZIP 打包使用原生 `Compression Streams API`（`new CompressionStream('gzip')`）或简单的 Tar 格式拼接，**不引入 JSZip 等第三方库**
- 若 Compression Streams API 不可用（Chrome 80+ 均支持），回退为单文件合并导出
- YAML 序列化使用手写的简单格式化函数（仅需支持 string / array / date 类型），不引入 `js-yaml`

### TC-2: IndexedDB 导出性能

- 使用 cursor 顺序读取（已有 `getAllEntries(limit)` 模式），不将全部条目加载到内存后再格式化
- 对于 > 500 条的导出，采用流式写入：每读取 50 条即格式化并拼接到输出缓冲区
- 进度回调通过 `postMessage` 从 Worker 或分批 `setTimeout` 切片实现，不阻塞主线程

### TC-3: 自动备份的 Service Worker 生命周期

- Chrome MV3 的 Service Worker 在空闲 30 秒后会被终止
- 使用 `chrome.alarms` API 注册定时任务（最小间隔 1 分钟），确保即使 SW 被终止也能触发
- 备份逻辑在 alarm 触发时执行：初始化 IndexedDB → 读取条目 → 格式化 → `chrome.downloads.download()`
- 备份不依赖 sidebar 或 options 页面打开

### TC-4: 存储与配置

- 自动备份配置存储 key: `autoBackup`
- 数据结构：

```json
{
  "autoBackup": {
    "enabled": true,
    "frequency": "weekly",
    "format": "json",
    "lastBackupAt": "2026-04-30T12:00:00Z"
  }
}
```

- `chrome.storage.sync` 配额：备份配置数据量 < 1KB，远低于 100KB 限制

### TC-5: 向后兼容

- 现有的 `exportJSON()` 和 `exportMarkdown()` 方法签名和行为不变
- 新增方法独立命名：`exportFiltered(options)`, `exportObsidianMarkdown(options)`
- 导入端 `importer.js` 已支持 Obsidian frontmatter 格式（`parseObsidianMarkdown()`），无需修改导入逻辑
- 导出的 JSON 新增 `exportVersion` 字段，但不影响旧版导入器（`parseJSON()` 会忽略未知字段）

### TC-6: ZIP 文件格式

- 条目数 ≤ 20 时打包为 ZIP（每条目一个 `.md` 文件）
- ZIP 格式使用原生实现或手写最小 ZIP 格式生成器（仅需存储模式，不压缩）
- 条目数 > 20 时回退为单文件合并，避免 ZIP 生成的复杂度

---

## 五、依赖关系

| 依赖 | 类型 | 说明 |
|------|------|------|
| R003 (知识库存储) | 数据依赖 | 导出的数据来源，复用 `KnowledgeBase` 的查询方法 |
| R005 (数据导出) | 功能依赖 | 在现有导出基础上增强，`exportJSON()` / `exportMarkdown()` 保持不变 |
| lib/importer.js | 兼容性依赖 | 导出格式必须与现有导入器兼容；Obsidian 格式已由 `parseObsidianMarkdown()` 支持 |
| chrome.alarms API | 系统依赖 | 自动备份的定时触发机制，MV3 标准 API |
| chrome.downloads API | 系统依赖 | 自动备份时触发文件下载，manifest.json 已声明 `downloads` 权限 |
| chrome.storage.sync | API 依赖 | 存储自动备份配置 |
| options/options.html | UI 依赖 | 筛选导出 UI 和自动备份设置嵌入现有 Options 页面 |
| lib/knowledge-panel.js | UI 依赖 | 侧边栏批量导出增加 Markdown 格式选项和筛选支持 |

---

## 六、不在范围内 (Out of Scope)

| 项目 | 原因 |
|------|------|
| Notion/飞书云同步 | 属于 P2 路线图（迭代 27+），需要 OAuth 和云端 API |
| Obsidian 插件直接集成 | 需要 Obsidian 插件开发，超出 Chrome 扩展范围 |
| CSV/HTML 导出格式 | 用户需求低，Markdown 和 JSON 已覆盖主要场景 |
| 增量导出（只导出变更部分） | 实现复杂度高，需要变更日志机制，当前用户量不需要 |
| 加密导出 | 可在后续迭代考虑，当前知识库不包含敏感信息 |
| 云端自动备份（Google Drive 等） | 需要 OAuth 认证，超出本迭代范围 |

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| ZIP 生成在大文件时内存溢出 | 低 | 高 | 条目数 > 20 时回退为单文件；限制单次导出上限 5000 条 |
| chrome.alarms 在电脑休眠后不触发 | 中 | 中 | 扩展唤醒时检查 `lastBackupAt`，补执行错过的备份 |
| Obsidian YAML frontmatter 解析兼容性 | 低 | 中 | 测试 Obsidian 0.15+ 的 frontmatter 解析器；使用标准 YAML 格式 |
| 导出进度回调阻塞主线程 | 中 | 中 | 使用 `requestIdleCallback` 或 `setTimeout` 分批切片 |
| 用户误操作全量导出覆盖文件 | 低 | 低 | 文件名含时间戳，不会覆盖已有文件 |

---

## 八、成功指标

| 指标 | 目标 | 衡量方式 |
|------|------|----------|
| 导出-导入往返无损率 | 100% | 自动化测试：导出 → 清空 → 导入 → 字段比对 |
| Obsidian 兼容性 | frontmatter 正确解析 | 手动验证：导出 → Obsidian 打开 → 检查标签和属性 |
| 大知识库导出耗时 | 1000 条 < 5 秒 | 性能测试 |
| 自动备份可靠性 | 月成功率 > 99% | `lastBackupAt` 与预期时间对比 |
| 锁定感用户反馈降低 | 0 条相关投诉 | GitHub Issues 监控 |

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-04-30 | 初始化 R023 需求文档 |
