# IMPLEMENTATION.md — 迭代实现记录

---

## 迭代 R65 — 语义搜索 BookmarkSemanticSearch

> 日期: 2026-05-05
> 任务: R65 语义搜索 BookmarkSemanticSearch — 书签库自然语言语义搜索

### 新增文件

1. **lib/bookmark-semantic-search.js** — 语义搜索引擎核心模块
   - `BookmarkSemanticSearch.FIELD_WEIGHTS` — 书签域字段权重 (title: 3.0, tags: 2.0, contentPreview: 1.5, folderPath: 1.0, url: 0.5)
   - `constructor(embeddingEngine?, bookmarkSearch?)` — 可选注入引擎
   - `buildIndex(bookmarks[])` — 全量构建 TF-IDF 词汇表 + 文档向量
   - `addBookmark(bookmark)` / `removeBookmark(bookmarkId)` — 增量更新
   - `semanticSearch(query, opts?)` — 纯语义搜索 (TF-IDF 余弦相似度)
   - `hybridSearch(query, opts?)` — 混合搜索 (关键词 0.6 + 语义 0.4)
   - `findSimilar(bookmarkId, limit?)` — 以文搜文
   - `invalidateCache(bookmarkId?)` — 缓存失效
   - `getStats()` — 索引统计
   - `_getWeightedText(bookmark)` — 生成带字段权重的文档文本
   - `_generateBookmarkVector(bookmark)` — 生成书签 TF-IDF 向量
   - `_idf(term)` — 计算逆文档频率
   - `_mergeResults(keyword, semantic, ratio)` — 结果合并归一化

2. **tests/test-bookmark-semantic-search.js** — 35 个单元测试

### 设计决策

- **复用 EmbeddingEngine**: 不重新实现 TF-IDF，直接复用迭代 #7 的 `EmbeddingEngine` 核心算法
- **书签域独立字段权重**: 不同于知识库域的权重 (title: 3.0, summary: 2.0)，书签域使用 contentPreview 替代 summary
- **归一化合并策略**: 关键词和语义结果各自先归一化到 [0, 1]，再按 0.6:0.4 权重混合
- **增量更新**: addBookmark/removeBookmark 直接修改词汇表的 document frequency，无需全量重建
- **可选依赖注入**: BookmarkSearch 可选注入，无注入时 hybridSearch 退化为纯语义搜索
- **纯 ES Module**: 不依赖 DOM/Chrome API，可在 Node.js 环境测试

### 依赖关系

```
BookmarkSemanticSearch (新建, R65)
  ├── EmbeddingEngine (已存在, 迭代 #7) — TF-IDF 核心算法
  ├── BookmarkSearch (已存在, R47)      — 关键词搜索结果输入 (可选)
  ├── BookmarkContentPreview (已存在, R64) — contentPreview 字段作为向量化输入
  └── BookmarkCollector (已存在, R43)    — 标准书签对象格式
```

### 测试结果

- 新增: 35 个测试，全部通过
- 总测试: 35 (本模块)

---

## 迭代 R51 — 选项页集成 BookmarkOptionsPage

> 日期: 2026-05-04
> 任务: R51 选项页集成 BookmarkOptionsPage — 将 BookmarkPanel 集成到选项页，新增 Tab 导航

### 新增文件

1. **tests/test-bookmark-options-tab.js** — 13 个单元测试
   - Tab 创建 / Tab 切换 / 默认 Tab / 初始容器
   - BookmarkPanel 生命周期: init → render → destroy → re-init
   - 搜索集成 / 节点点击 / 过滤器传递
   - Hash 路由 #tab=bookmark
   - 完整集成流: init → switch → search → node click → destroy → re-init

### 修改文件

1. **options/options.html** — 新增 Tab 导航结构 + 图谱面板容器
   - `<nav class="tab-nav">` 包含 "⚙ 设置" 和 "🕸 书签图谱" 两个 Tab 按钮
   - `<div id="settings-panel">` 包裹原有设置表单
   - `<div id="bookmark-panel">` 作为 BookmarkPanel 渲染容器 (初始 `display: none`)

2. **options/options.js** — 新增 TabManager + BookmarkPanel 集成
   - `createTabManager()` — Tab 切换核心逻辑:
     - `switchTab('bookmark')`: 隐藏设置面板 → 显示图谱面板 → `panel.render()` + `panel.init()`
     - `switchTab('settings')`: 隐藏图谱面板 → 显示设置面板 → `panel.destroy()` 释放 Canvas/事件
   - 导入 BookmarkPanel 及全部 7 个依赖模块 (Collector/Indexer/GraphEngine/Visualizer/DetailPanel/Search/Recommender)
   - Hash 路由支持: `#tab=bookmark` 直接跳转图谱标签页
   - 导出 `createTabManager` 供测试使用

3. **options/options.css** — 新增 Tab 导航样式 + 图谱三栏布局样式
   - Tab 导航: `.tab-nav` / `.tab-btn` / `.tab-btn.active`
   - 三栏布局: `.bookmark-panel-layout` (`grid: 240px 1fr 280px`)
   - 左侧面板: 搜索框 / 过滤器组 / 统计栏
   - 中间面板: Canvas 图谱
   - 右侧面板: 详情面板 / 标题 / URL / 文件夹 / 日期 / 标签 / 相似推荐
   - 状态消息: loading / error / empty

### 设计决策

- **Tab 切换使用 CSS display:none/block**: 不使用路由或页面跳转，保持设置页输入值不丢失
- **懒初始化 BookmarkPanel**: 切换到图谱 Tab 时才 render + init，避免不看图谱时浪费资源
- **destroy 释放资源**: 切换离开时调用 `panel.destroy()` 释放 Canvas 事件监听器，防止内存泄漏
- **Hash 路由**: `#tab=bookmark` 支持从 Popup "查看完整图谱" 按钮直接跳转
- **设置标签页保持 640px**: 图谱全宽但设置页不改变原有布局

### 测试结果

- 新增: 13 个测试，全部通过
- 已有 BookmarkPanel: 16 个测试，全部通过
- 总测试: 445 (bookmark 模块)

---

## 迭代 21 — L1.2 实体/概念自动提取

> 日期: 2026-04-30
> 任务: L1.2 实体/概念自动提取 — 导出时用 AI 自动识别 Q&A 中提到的实体和概念

### 新增文件

1. **lib/entity-extractor.js** — 实体/概念自动提取模块
   - `ENTITY_TYPES` — 支持的实体类型常量（person, tool, framework, api, language, platform, library, service, other）
   - `buildExtractionPrompt(entries)` — 构建 AI 提示词，指示 AI 从 Q&A 条目中提取实体和概念
   - `parseExtractionResponse(response)` — 解析 AI 返回的 JSON（支持 markdown 代码块包裹）
   - `extractEntities(entries, aiClient, options)` — 主提取流程，支持批量处理和去重合并
   - `generateEntityMarkdown(entity)` — 生成实体页 Markdown（含 YAML frontmatter + 概述 + 相关 Q&A + 关联实体）
   - `generateConceptMarkdown(concept)` — 生成概念页 Markdown（含 YAML frontmatter + 概述 + 相关 Q&A + 关联技术）
   - `buildEntityIndex(entities, concepts)` — 生成实体/概念索引 Markdown（按类型分组）
   - `sanitizeFilename(name)` — 清理文件系统不安全字符

2. **tests/test-entity-extractor.js** — 22 个单元测试

### 设计决策

- **纯 ES Module**：不依赖 IndexedDB 或 Chrome API，与 `KnowledgeBase` 完全解耦
- **批量分批处理**：默认每批 10 条，大知识库分批调用 AI 后合并去重
- **去重策略**：同名实体/概念自动合并 `relatedEntryIds`
- **容错解析**：支持直接 JSON、markdown 代码块包裹、无效输入安全降级
- **Wikilink 格式**：关联实体使用 `[[name]]` 格式，为 L1.3 交叉引用做准备

### 测试结果

- 新增: 22 个测试，全部通过
- 总测试: 1539

---

## 迭代 R8 — PDF 提取引擎增强

> 日期: 2026-04-30
> 任务: PDF 提取引擎增强

## 实现内容

### 新增文件

1. **lib/pdf-extractor.js** — PDF 文本提取器模块
   - `PdfExtractor.extractText(arrayBuffer)` — 从 ArrayBuffer 提取 PDF 文本
   - `PdfExtractor.extractFromUrl(url)` — 通过 URL 获取并提取
   - 使用 pdf.js (ES Module) 进行可靠提取
   - 支持元数据提取（标题、作者等）

2. **lib/pdf.min.mjs** — pdf.js v3.11.174 库文件
3. **lib/pdf.worker.min.mjs** — pdf.js worker 文件

4. **tests/test-pdf-extractor.js** — PDF 提取器单元测试（9 个测试用例）

### 修改文件

1. **background/service-worker.js** — 新增 `extractPdfViaJs` 消息处理
   - 动态加载 `lib/pdf-extractor.js`
   - 通过消息协议供 content script 调用

2. **content/content.js** — 改进 `extractPdfContent` 消息处理
   - 保留 DOM 提取作为快速路径
   - DOM 提取失败时自动 fallback 到 pdf.js
   - 通过 background service worker 调用 PdfExtractor

3. **sidebar/sidebar.js** — 显示页数信息
   - `pdfExtractContent()` 显示 PDF 页数

4. **manifest.json** — 添加 `web_accessible_resources`
   - 暴露 `lib/pdf.min.mjs` 和 `lib/pdf.worker.min.mjs`

## 技术决策

- **通过 background service worker 调用 pdf.js**: 因为 content script 不能直接使用 ES module import，而 background service worker 可以
- **保留 DOM 提取作为快速路径**: 如果 Chrome PDF viewer 的 text layer 可访问，直接使用，避免不必要的 pdf.js 加载
- **web_accessible_resources**: pdf.js 文件需要在 content script 的上下文中可访问

## 测试结果

- 总测试: 156 (原 147 + 新增 9)
- 通过: 156
- 失败: 0

---
*自动生成于 2026-04-30*
