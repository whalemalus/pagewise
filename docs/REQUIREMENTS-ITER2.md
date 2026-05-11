# REQUIREMENTS — R76: BookmarkSharing (书签分享)

> 迭代: R76
> 日期: 2026-05-11
> 复杂度: Medium (新模块)
> 阶段: Phase D — 集成与打磨 (第 4/10 轮)
> 模块文件: `lib/bookmark-sharing.js`
> 测试文件: `tests/test-bookmark-sharing.js`

---

## 1. 用户故事

作为技术学习者，我精心整理了书签集合（比如"React 学习路径"、"2026 年必读 Rust 文章"），想要分享给同事或朋友一起学习，但现有工具只能导出整个书签库的原始数据——没有上下文、没有排版、没有隐私保护。我希望能将任意书签集合（手动选择或智能集合）导出为**美观、可独立打开的分享包**，同时自动过滤掉个人敏感链接（如内网、登录页），让分享既高效又安全。

---

## 2. 验收标准

### AC1: 书签集合导出（Collection Export）
- `exportCollection(bookmarks[], options)` 方法接收一组书签 + 导出选项
- 支持 3 种输出格式：
  - **JSON** (`format: 'json'`): 结构化数据，含元信息（集合名、描述、创建时间、书签数、版本号），可被 PageWise `importFromJSON()` 重新导入
  - **Markdown** (`format: 'markdown'`): 可读的文档格式，含分组标题、链接列表、标签行，适配 GitHub / 飞书 / Notion 等平台粘贴
  - **HTML** (`format: 'html'`): 自包含 HTML 页面（内联 CSS），可在浏览器中独立打开，包含卡片式布局展示书签信息（标题、URL、标签、状态、文件夹路径）
- 导出结果为纯字符串，由调用方决定如何保存（下载/复制/发送）
- 导出支持 `options.includeMetadata` 控制是否附加统计摘要（总书签数、领域分布、状态分布）

### AC2: 隐私过滤（Privacy Filter）
- `createPrivacyFilter(rules)` 创建隐私过滤器实例
- 内置过滤规则：
  - **域名黑名单**: 自动排除 `localhost`、`127.0.0.1`、`*.internal`、`*.local`、`chrome://`、`chrome-extension://` 等私有/内部域名
  - **URL 参数清理**: 移除跟踪参数（`utm_*`、`fbclid`、`gclid`、`ref`、`source` 等）
  - **敏感路径检测**: 标记含 `/admin`、`/dashboard`、`/settings`、`/account`、`/login` 的 URL 为潜在敏感
- 支持用户自定义规则：
  - `addBlockedDomain(domain)` — 添加域名黑名单条目（支持通配符 `*.example.com`）
  - `addBlockedPattern(pattern)` — 添加 URL 正则匹配黑名单
  - `addBlockedTags(tag[])` — 按标签排除书签
- `applyFilter(bookmarks[])` 返回 `{ filtered, blocked, summary }`：
  - `filtered`: 通过过滤的书签数组
  - `blocked`: 被拦截的书签数组（附带拦截原因）
  - `summary`: 过滤统计（总数/通过/拦截/清理参数数）
- 过滤规则可序列化为 JSON、可从 JSON 恢复，支持持久化到 `chrome.storage.local`

### AC3: 分享包生成（Share Package）
- `createSharePackage(bookmarks[], options)` 生成完整分享包对象
- 分享包数据结构：
  ```
  {
    version: 1,
    collection: { name, description, createdAt, bookmarkCount },
    bookmarks: [ { title, url, tags, folderPath, status, dateAdded } ],
    summary?: { domains, categories, readingProgress },
    exportedAt: ISO string,
    source: 'pagewise',
    privacy: { filteredCount, rulesApplied }
  }
  ```
- 分享包自动包含隐私过滤统计信息（告知接收者有多少条被过滤）
- 当 `bookmarks[]` 为空时返回空分享包（不抛异常），`collection.bookmarkCount = 0`

### AC4: 与 SmartCollections / ImportExport 集成
- `exportCollection(collectionId)` 可直接接受 BookmarkSmartCollections 的集合 ID，自动获取该集合的书签并导出
- 导出的 JSON 格式兼容 BookmarkImportExport 的 `importFromJSON()`，实现循环互操作
- 导出的 HTML 格式中包含"导入到 PageWise"的操作说明（告诉接收者如何使用 JSON 文件导入）

### AC5: 完整测试覆盖
- 单元测试覆盖所有公共 API 方法（≥ 25 个测试用例）
- 测试使用 `node:test` + `node:assert/strict`
- 测试需覆盖：
  - 三种格式导出完整性（JSON / Markdown / HTML）
  - 隐私过滤全部内置规则（域名黑名单、参数清理、敏感路径）
  - 隐私过滤自定义规则（域名通配符、正则、标签）
  - 空书签列表导出
  - 大量书签导出（100+ 条）
  - 分享包字段完整性校验
  - 过滤统计准确性
  - JSON 导出与 ImportExport 的互操作（round-trip）

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 纯 ES Module | `export class` 模式，与项目所有 lib 模块一致 |
| 零外部依赖 | 不引入任何第三方 npm 包（不使用 LZString 等压缩库） |
| 不依赖 Chrome API | 纯数据模块，不直接操作 DOM 或 chrome.* API，SmartCollections 通过构造函数注入（依赖反转） |
| 复用已有数据结构 | 输入书签格式与 BookmarkCollector (R43) 一致：`{ id, title, url, tags, folderPath, status, dateAdded }` |
| 复用 ImportExport | JSON 序列化/反序列化逻辑与 BookmarkImportExport (R61) 的格式保持兼容 |
| XSS 安全 | HTML 导出中所有用户输入字段（title、url、tags）必须 `escapeHtml()`，防止注入 |
| 性能预算 | `exportCollection()` < 100ms（1000 条书签，纯字符串拼接）；`applyFilter()` < 50ms（1000 条） |
| 内存预算 | 不缓存导出结果（每次调用实时生成）；过滤规则集 < 10KB |
| 纯前端架构 | 不使用服务端、不生成真实短链接——分享通过文件下载/剪贴板复制实现 |
| 无网络依赖 | 全部功能离线可用 |

---

## 4. 依赖关系

### 上游依赖（输入）

| 模块 | 文件 | 状态 | 依赖方式 |
|------|------|------|----------|
| BookmarkCollector (R43) | `lib/bookmark-collector.js` | ✅ 已实现 | 复用标准化书签对象格式 `{ id, title, url, tags, folderPath, status, dateAdded }` |
| BookmarkImportExport (R61) | `lib/bookmark-io.js` | ✅ 已实现 | JSON 导出格式兼容，`importFromJSON()` 可导入本模块导出的 JSON |
| BookmarkSmartCollections (R75) | `lib/bookmark-smart-collections.js` | ✅ 已实现 | 可选注入；接受集合 ID 自动获取书签；通过构造函数注入 `smartCollections` 实例 |
| BookmarkContentPreview (R64) | `lib/bookmark-preview.js` | ✅ 可选 | HTML 导出中调用 `generateTextPreview()` 生成书签摘要卡片 |
| BookmarkClusterer (R53) | `lib/bookmark-clusterer.js` | ✅ 可选 | `options.summary` 中注入领域分布统计 |
| BookmarkStatus (R58) | `lib/bookmark-status.js` | ✅ 隐式 | 书签对象的 `status` 字段用于分享包中展示阅读状态 |

### 下游消费者（输出）

| 模块 | 使用方式 |
|------|----------|
| BookmarkImportExport (R61) | JSON 分享包可通过 `importFromJSON()` 重新导入 PageWise |
| BookmarkOptionsPage (R51) | 选项页"分享"按钮：选中书签/集合 → 调用本模块导出 → 下载文件 |
| BookmarkDetailPanel (R47) | 单个书签详情页"分享此书签"按钮（导出单条书签的 JSON/Markdown） |
| BookmarkPopup (R50) | 弹窗概览区"分享集合"快捷入口 |

### 隐式依赖

| 依赖 | 说明 |
|------|------|
| 文件下载机制 | 调用方使用 `URL.createObjectURL()` + `<a download>` 或 `chrome.downloads` API 触发下载 |
| 剪贴板 API | 调用方使用 `navigator.clipboard.writeText()` 复制 Markdown/JSON 到剪贴板 |
| chrome.storage.local | 隐私规则持久化（由调用方负责读写，模块只提供序列化/反序列化） |

---

## 5. 数据模型

```javascript
// ===================== 输入 =====================

// 书签对象（来自 BookmarkCollector R43 标准化格式）
{
  id: string,
  title: string,
  url: string,
  tags: string[],
  folderPath: string[],
  status: 'unread' | 'reading' | 'read',
  dateAdded: number           // timestamp ms
}

// 导出选项
ExportOptions = {
  format: 'json' | 'markdown' | 'html',   // 输出格式（默认 'json'）
  collectionName: string,                   // 集合名称（默认 'Untitled'）
  collectionDescription: string,            // 集合描述（默认 ''）
  includeMetadata: boolean,                 // 是否附加统计摘要（默认 true）
  privacyFilter: PrivacyFilter | null,      // 隐私过滤器（默认 null = 不过滤）
  preview: Function | null                  // 可选的书签预览函数（来自 BookmarkContentPreview）
}

// ===================== 隐私过滤 =====================

// 过滤规则集（可序列化）
PrivacyRules = {
  blockedDomains: string[],      // 域名黑名单 ['*.internal', 'localhost']
  blockedPatterns: string[],     // URL 正则黑名单 ['/admin', '/login']
  blockedTags: string[],         // 标签黑名单 ['private', 'internal']
  stripParams: string[]          // 要清理的 URL 参数 ['utm_*', 'fbclid', 'ref']
}

// 过滤结果
FilterResult = {
  filtered: Bookmark[],          // 通过的书签
  blocked: Array<{               // 被拦截的书签
    bookmark: Bookmark,
    reason: string               // 拦截原因（如 'blocked_domain', 'sensitive_path', 'blocked_tag'）
  }>,
  cleaned: number,               // URL 参数被清理的书签数
  summary: {
    total: number,
    passed: number,
    blocked: number,
    cleaned: number
  }
}

// ===================== 输出 =====================

// 分享包
SharePackage = {
  version: number,               // 格式版本（= 1）
  collection: {
    name: string,
    description: string,
    createdAt: string,           // ISO 日期
    bookmarkCount: number
  },
  bookmarks: Bookmark[],         // 过滤后的书签数组
  summary?: {                    // 当 includeMetadata=true 时存在
    domains: Array<{ domain: string, count: number }>,
    categories: Array<{ category: string, count: number }>,
    readingProgress: { unread: number, reading: number, read: number }
  },
  exportedAt: string,            // ISO 时间戳
  source: 'pagewise',
  privacy: {
    filteredCount: number,       // 被隐私过滤器拦截的书签数
    cleanedCount: number,        // URL 参数被清理的书签数
    rulesApplied: boolean        // 是否应用了隐私过滤
  }
}
```

---

## 6. API 概览

```javascript
export class BookmarkSharing {
  /**
   * @param {Object} opts
   * @param {Object} [opts.smartCollections] — BookmarkSmartCollections 实例（可选）
   * @param {Function} [opts.previewFn] — 书签预览函数（来自 BookmarkContentPreview，可选）
   */
  constructor({ smartCollections, previewFn } = {}) {}

  // ====== 核心导出 ======

  /** 导出书签集合为指定格式字符串 */
  exportCollection(bookmarks, options) → string

  /** 从 SmartCollections ID 导出（自动获取集合书签） */
  exportSmartCollection(collectionId, options) → string

  // ====== 隐私过滤 ======

  /** 创建隐私过滤器 */
  createPrivacyFilter(rules?) → PrivacyFilter

  // ====== 分享包 ======

  /** 生成完整分享包对象 */
  createSharePackage(bookmarks, options) → SharePackage

  /** 将 SharePackage 序列化为 JSON 字符串 */
  serializePackage(pkg) → string

  /** 从 JSON 字符串反序列化 SharePackage */
  deserializePackage(json) → SharePackage | null
}

export class PrivacyFilter {
  constructor(rules?) {}

  /** 添加域名黑名单 */
  addBlockedDomain(domain) → void

  /** 添加 URL 正则黑名单 */
  addBlockedPattern(pattern) → void

  /** 添加标签黑名单 */
  addBlockedTags(tags) → void

  /** 应用过滤 */
  applyFilter(bookmarks) → FilterResult

  /** 序列化规则为 JSON */
  serialize() → string

  /** 从 JSON 恢复规则 */
  static deserialize(json) → PrivacyFilter
}
```

---

## 7. 非功能需求

| 项目 | 要求 |
|------|------|
| 导出性能 | `exportCollection()` < 100ms（1000 条书签） |
| 过滤性能 | `applyFilter()` < 50ms（1000 条书签） |
| HTML 自包含 | 导出 HTML 文件可独立在浏览器中打开，所有 CSS 内联，无外部资源引用 |
| XSS 安全 | HTML 输出中所有动态内容经 `escapeHtml()` 转义 |
| JSON 互操作 | 导出 JSON 可被 `BookmarkImportExport.importFromJSON()` 正确导入 |
| 空数据兼容 | 0 条书签时不抛异常，返回空导出/空分享包 |
| Markdown 可读性 | Markdown 输出可直接粘贴到 GitHub README / 飞书文档 / Notion |
| 文件大小 | 100 条书签的 HTML 导出 < 50KB |
| 隐私默认安全 | 默认内置规则覆盖常见内部域名，用户无需手动配置 |

---

## 8. 输出文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/bookmark-sharing.js` | **新建** | 核心模块：BookmarkSharing 类 + PrivacyFilter 类 |
| `tests/test-bookmark-sharing.js` | **新建** | 单元测试（≥ 25 用例，node:test） |
| `docs/CHANGELOG.md` | **修改** | 新增 R76 条目 |
| `docs/TODO.md` | **修改** | 标记 R76 状态为 ✅ |

---

## 9. 设计决策与理由

### Q1: 为什么不生成短链接/分享 URL？
**决策**: 不使用服务端短链接。
**理由**: PageWise 是本地优先架构，引入后端违背产品定位。分享通过文件下载 + 剪贴板复制实现，与 Obsidian 的分享模式一致。

### Q2: 为什么不支持图片/二维码分享？
**决策**: R76 不做图片导出。
**理由**: 图片生成需要 Canvas 渲染（与 BookmarkVisualizer 共用），复杂度上升。R76 聚焦数据层导出，UI 渲染由调用方（选项页/popup）负责。

### Q3: 为什么 JSON 要兼容 ImportExport 格式？
**理由**: 实现"分享→导入"闭环——同事收到 JSON 文件后，可直接在自己的 PageWise 中导入，无需额外适配。

### Q4: 为什么需要 PrivacyFilter 作为独立类？
**理由**: 隐私过滤是通用能力，不仅用于分享，还可被 BookmarkImportExport (R61) 的 `exportJSON()` 复用。独立类方便测试和扩展。

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-11 | R76 | 初始创建 — BookmarkSharing 需求文档 |
