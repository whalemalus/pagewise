# 变更日志 — 智阅 PageWise

> 所有重要变更都会记录在此文件。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

---

## [Unreleased]

### 新增
- **R42: Skill Engine + Custom Skills E2E 测试（迭代 #42）**
  - `tests/test-skill-engine-e2e.js`: 23 个 E2E 测试用例，8 个 suite
  - 覆盖: 技能加载→注册→执行完整流程、CRUD 生命周期+引擎同步、参数传递+模板渲染、触发匹配+执行、容量上限(20)、Hook 集成、分类+批量操作、错误处理
  - 发现: saveSkill 不持久化 parameters 字段（设计决策，非 bug）— 参数通过 toEngineSkill 桥接层注入
  - 全套测试 2111 通过（+23 新增），0 失败

### 修复
- **R41: TODO.md 同步修复** — R36-R40 已完成但 TODO.md 未标记，现已修正

- **R41: PDF Extractor E2E 测试（迭代 #41）**
  - `tests/test-pdf-extractor-e2e.js`: 19 个 E2E 测试用例，使用真实 PdfExtractor（非 mock）
  - 覆盖: extractText 返回结构验证、单页/多页 PDF、元数据提取、错误处理（null/空/非PDF）、extractFromUrl mock fetch、HTTP 错误、网络错误
  - `lib/pdf.worker.mjs`: 符号链接到 pdf.worker.min.mjs（pdf.js worker 路径修复）
  - `docs/ISSUES.md`: 设计问题追踪文档

### 修复
- **R40: Page Sense E2E 测试修复** — analyze() API 使用修正（对象参数 vs 位置参数）

### 新增
- **R35: 统一错误处理集成 + _locales 国际化基础（迭代 #35）**
  - `lib/ai-client.js`: 所有错误附带 `.classified` 属性（ErrorType 分类）
  - `lib/knowledge-base.js`: IndexedDB 操作错误使用 `classifyStorageError()` 分类
  - `background/service-worker.js`: 全局错误捕获（self.onerror + unhandledrejection）
  - `_locales/en/messages.json`: 英文 locale（Chrome Web Store 准备）
  - `_locales/zh_CN/messages.json`: 中文 locale

- **L1.2 实体/概念自动提取（迭代 #21）** — 导出时用 AI 自动识别 Q&A 中提到的实体和概念
  - `lib/entity-extractor.js`: 实体/概念自动提取模块
  - `extractEntities(entries, aiClient)`: 从 Q&A 条目中使用 AI 提取实体（人名、工具、框架、API 等）和概念（技术概念、设计模式、方法论）
  - `generateEntityMarkdown(entity)`: 生成实体页 Markdown（含 YAML frontmatter、概述、相关 Q&A 列表、关联实体）
  - `generateConceptMarkdown(concept)`: 生成概念页 Markdown（含 YAML frontmatter、概述、相关 Q&A、关联技术）
  - `buildEntityIndex(entities, concepts)`: 生成实体/概念索引 Markdown（按类型分组）
  - 支持批量处理（大知识库分批调用 AI）和同名去重合并
  - Wikilink 格式 `[[name]]` 预留 L1.3 交叉引用
  - 22 个单元测试覆盖全部核心逻辑

### 变更
- `lib/entity-extractor.js` — 新增模块，纯 ES Module，不依赖 IndexedDB 或 Chrome API

- **PDF 提取引擎增强（迭代 #8）** — 引入 pdf.js 提升 PDF 文本提取可靠性
  - `lib/pdf-extractor.js`: PDF 文本提取器模块（PdfExtractor 类）
  - 使用 pdf.js v3.11.174 (ES Module) 进行可靠 PDF 解析
  - `extractText(arrayBuffer)`: 从 ArrayBuffer 提取全文 + 元数据
  - `extractFromUrl(url)`: 通过 URL 获取并提取
  - background service worker 新增 `extractPdfViaJs` 消息处理
  - content script 自动 fallback: DOM 提取失败时调用 pdf.js
  - manifest.json 新增 `web_accessible_resources` 暴露 pdf.js 文件
  - 9 个单元测试覆盖核心逻辑

### 变更
- `content/content.js` — extractPdfContent 消息处理增加 pdf.js fallback 路径
- `sidebar/sidebar.js` — PDF 提取结果显示页数信息
- `manifest.json` — 新增 web_accessible_resources 配置

## [1.3.0] - 2026-04-30

### 新增
- **AI 响应缓存（迭代 #5）** — 避免对相同请求重复调用 AI API，节省费用并降低延迟
  - `AICache` 类: 纯内存 LRU 缓存（FNV-1a 哈希键、TTL 过期、LRU 淘汰、统计计数）
  - `generateCacheKey()`: 基于 model + messages + systemPrompt + maxTokens + protocol 生成 32 位哈希键
  - 图片消息自动跳过缓存（图片 URL 不稳定且数据量大）
  - `AIClient.cachedChat()`: 带缓存的非流式调用，返回 `{ fromCache: boolean }`
  - `AIClient.cachedChatStream()`: 带缓存的流式调用，命中时一次性 yield 缓存内容
  - `sendMessage()` 集成: 自动使用缓存，命中时显示 `⚡ 缓存命中` 徽章
  - 默认配置: 最多 50 条缓存，30 分钟 TTL
  - 43 个单元测试覆盖全部核心逻辑

### 变更
- `sidebar/sidebar.js` — `chatStream()` 替换为 `cachedChatStream()`，集成 AICache
- `sidebar/sidebar.css` — 新增 `.pw-cache-badge` 缓存命中徽章样式

### 新增
- **R012: 页面高亮关联** — AI 回答中的引用文本（行内代码、引用块）可点击跳转，在页面中高亮并定位到原文位置
  - `_injectQuoteAttributes()`: 渲染后扫描 `<code>`（行内）和 `<blockquote>` 元素，注入 `data-quote` 属性和可点击样式
  - `flashHighlight()`: 在页面中查找文本并创建临时高亮，3 秒后自动淡出并移除 DOM 元素
  - `clearFlashHighlights()`: 清除所有临时高亮，确保同一时刻最多只有一个临时高亮存活
  - `locateAndHighlight` 消息协议: content script 新增 action，支持引用跳转定位
  - CSS 类 `pw-flash-highlight`（临时高亮样式，含淡出动画）和 `pw-quote-link`（可点击引用样式）
  - 引用文本截取策略: 行内代码完整匹配，blockquote 截取前 200 字符
  - 34 个单元测试覆盖全部核心逻辑

### 变更
- `content/content.css` — 新增 `.pw-flash-highlight` 和 `.pw-flash-highlight--fading` 样式
- `sidebar/sidebar.css` — 新增 `.pw-quote-link` 可点击引用样式
- `content/content.js` — 新增 `flashHighlight()`、`clearFlashHighlights()` 函数和 `locateAndHighlight` action
- `lib/message-renderer.js` — 新增 `_injectQuoteAttributes()` 和 `_sendLocateAndHighlight()` 方法

---

## [1.1.1] - 2026-04-28

### 修复
- **Claude API 请求 403 错误** — `buildClaudeRequest` 缺少 `anthropic-dangerous-direct-browser-access: true` header，导致所有 Claude API 调用被拒绝。现已添加该 header，Claude 协议的 AI 问答和测试连接功能恢复正常。
- **侧边栏初始化崩溃** — `init()` 中 IndexedDB 操作（memory.init、loadCustomSkills）失败时会杀死整个初始化链，导致侧边栏空白无响应。现在每个关键步骤都有独立的 try-catch，单个模块失败不影响其他功能。

---

## [1.0.0] - 2026-04-25

### 新增
- 页面内容提取（Reader Mode 策略）
- AI 问答（流式输出、多轮对话）
- 知识库存储（IndexedDB）
- 知识检索（全文搜索、标签筛选）
- 数据导出（Markdown / JSON）
- 技能系统（7 个内置技能）
- 页面感知（6 种页面类型识别）
- 记忆系统（用户画像、知识召回）
- 自进化（隐式反馈、风格自适应)
- 右键菜单「用 智阅 提问」
- 数据导入（JSON / Markdown / 纯文本）

---

## [1.1.0] - 2026-04-27

### 新增
- 对话持久化（chrome.storage.session，24 小时自动过期）
- `/clear` 命令清除对话历史
- 代码块复制按钮（hover 显示，点击复制并反馈）
- Toast 通知系统（info/success/error/warning，动画滑入淡出）
- 对话持久化测试（9 个测试）
- renderMarkdown 代码块复制按钮测试（2 个测试）
- **总计 106 个测试，全部通过**

---

### 新增
- 项目飞轮迭代模板（CLAUDE.md、docs/）
- **对话分支**：从 AI 回答的任意节点分叉，探索不同提问方向
  - 每条 AI 回答新增「🔀 分支」按钮
  - 分支信息条显示当前分支来源问题
  - 「↩️ 返回主对话」按钮快速切换回主线
  - 分支数据内存存储，最多 5 个分支
  - 22 个单元测试覆盖全部分支逻辑
- 测试框架（Node.js 内置 test runner）
- **API 文档专用模式**：
  - 页面感知增强：支持 `/reference/`, `/swagger/`, `/openapi/` URL 模式、Swagger UI 元素检测、HTTP 方法频率检测
  - Content Script：提取 API 端点（Swagger UI / Redoc / 通用 DOM 分析），限制 50 个端点
  - Sidebar：API 文档页面显示「📋 提取 API 端点」和「📊 生成 API 摘要」快捷按钮
  - 端点按方法分组展示，含方法分布统计
  - 10 个新测试（API 文档识别 + 端点提取）
- **AxonHub 风格 API 配置**：提供商卡片选择器（OpenAI/Claude/DeepSeek/Ollama/自定义）
- **模型发现**：一键从 API 获取可用模型列表
- **多配置 Profile**：保存/切换/删除多套 API 配置
- **暗色主题**：CSS 变量切换，支持跟随系统
- **划词提问**：选中文本后浮动按钮直接提问
- **AIClient.listModels()** 方法
- **Profile 存储**：saveProfiles/loadProfiles 工具函数
- Chrome API Mock（tests/helpers/chrome-mock.js）
- IndexedDB Mock（tests/helpers/indexeddb-mock.js）
- utils.js 单元测试（21 个测试套件）
- page-sense.js 单元测试（34 个测试）
- skill-engine.js 单元测试（26 个测试）
- knowledge-base.js 单元测试（19 个测试）
- **YouTube 视频字幕提取与总结**：
  - 页面感知：自动识别 YouTube 视频页面，提取 video ID、标题、频道名
  - 字幕提取：DOM 提取优先，展开面板兜底，ytInitialPlayerResponse API 兜底
  - 快捷操作：YouTube 页面显示「总结视频」「提取字幕」按钮
  - AI 总结：口语化字幕智能总结，含概述、要点、详细总结、金句
  - 字幕截取：前 8000 字符限制
  - 7 个 YouTube 相关测试
- **多页面联合分析**：
  - Background service worker：collectAllTabs / collectTabContent 消息处理
  - 标签页选择弹窗：复选框多选，支持最多 5 个标签页
  - 受限页面检测：chrome:// 等不可访问页面自动跳过并提示
  - 内容截取：每个标签页最多 3000 字符
  - 联合分析 prompt：逐一摘要 + 关联性分析 + 差异对比 + 综合洞察
  - 入口：页面预览面板 header + 问答面板快捷操作
  - 28 个多页面联合分析测试
- **总计 188 个测试，全部通过**
- **多模态图片理解**：
  - Content Script：`extractPageImages()` 提取页面可见图片（>100px，http/https，最多 20 张）
  - Sidebar：页面预览面板显示图片缩略图网格，点击选中后自动填入提问
  - AI Client：`buildOpenAIRequest` / `buildClaudeRequest` 支持 vision 消息格式（image_url / image 数组 content）
  - 模型能力检测：`supportsVision()` 检查当前模型是否支持 vision
  - 不支持 vision 的模型会提示用户切换
  - 5 个 vision 消息格式测试

### 自定义技能系统
- **lib/custom-skills.js**：IndexedDB 存储模块，独立数据库 `pagewise_custom_skills`
- **CRUD 完整**：saveSkill / getAllSkills / getSkillById / deleteSkill / toggleSkill
- **模板语法**：`{{变量名}}` 占位符，renderTemplate / extractTemplateVars
- **技能编辑器 UI**：sidebar.html 内嵌表单，支持新建/编辑/删除
- **自定义标记**：自定义技能在列表中标记为「自定义」徽章
- **数量上限**：最多 20 个自定义技能
- **分类筛选**：新增「自定义」分类标签
- **30 个自定义技能测试，全部通过**
- **总计 218 个测试，全部通过**
- **总计 228 个测试，全部通过**

### GitHub 仓库页面理解（R020）
- **lib/page-sense.js**：
  - 新增 `github-repo` 分析器，精确识别 GitHub 仓库页面
  - 区分页面类型：repo-root, repo-file, repo-issues, repo-pr, repo-wiki, repo-releases
  - 新增 `isGitHubRepoPage(url)` 和 `detectGitHubPageType(url)` 方法
  - `suggestSkills()` 对 github-repo 类型推荐 repo-analyze 技能
- **content/content.js**：
  - 新增 `detectGitHubRepo()` 检测 GitHub 仓库根目录页面
  - 新增 `extractGitHubRepoInfo()` 提取 README、目录结构、描述、语言统计、star/fork 数
  - README 截取前 5000 字符，目录列表截取前 50 项
  - 新增消息处理器 `detectGitHubRepo` 和 `extractGitHubRepoInfo`
- **sidebar/sidebar.js**：
  - 新增 `detectAndShowGitHubRepoActions()` 检测并显示 GitHub 仓库快捷按钮
  - 新增 `showGitHubRepoQuickActions()` 显示「📖 分析这个仓库」和「📋 提取仓库信息」
  - 新增 `githubExtractInfo()` 提取仓库信息结构化展示
  - 新增 `githubAnalyzeRepo()` 使用 AI 生成仓库概览（项目简介、技术栈、目录结构说明、快速开始建议）
- 20 个新测试（GitHub 页面类型识别 + helper 方法 + suggestSkills）

### 飞轮迭代 #14 — 代码执行沙箱

**需求**: AI 回答中的 HTML/JavaScript 代码可以直接在侧边栏运行，显示输出结果

**修改文件**:
- **sidebar/sidebar.js**：
  - `addAIMessage()` 检测 html/javascript 代码块，条件显示「▶️ 运行」消息按钮
  - 新增 `extractRunnableCodeBlocks()` 从 Markdown 提取可运行代码块
  - 新增 `injectCodeBlockRunButtons()` 为每个可运行代码块注入独立运行按钮
  - 新增 `executeCodeSandbox()` 在沙箱 iframe 中执行代码（`sandbox="allow-scripts"`）
  - 新增 `_buildSandboxHtml()` 构建沙箱 HTML 文档（含 console 拦截）
  - 新增 `runAllCodeBlocks()` 运行消息中所有代码块
  - 5 秒超时自动终止，postMessage 通信，Blob URL 隔离
- **sidebar/sidebar.css**：新增 `.code-run-btn` / `.sandbox-result` / `.sandbox-output` 等样式
- **tests/test-code-sandbox.js**：22 个新测试（代码块检测、提取、沙箱 HTML 构建、语言类名检测）
- **docs/REQUIREMENTS.md**：新增 R021 需求

### 飞轮迭代 #17 — 知识图谱可视化

**需求**: Canvas 力导向图可视化展示知识条目之间的关联关系

**新增文件**:
- **lib/knowledge-graph.js**：图谱数据构建与力导向布局模块
  - `buildGraphData(entries, relations)` — 构建图数据（nodes + edges）
  - `forceDirectedLayout(nodes, edges, iterations)` — 力导向布局算法（斥力 + 引力，50 次迭代）
  - 节点大小按关联数量缩放，颜色按标签分类
  - 最大节点数限制 100 个
- **tests/test-knowledge-graph.js**：20 个新测试（图数据构建 + 力布局验证）

**修改文件**:
- **sidebar/sidebar.html**：知识库面板新增「🕸️ 图谱」子标签和 Canvas 容器
- **sidebar/sidebar.js**：
  - 新增 `renderKnowledgeGraph()` — 获取知识条目、计算相似度、运行力布局、绘制图谱
  - 新增 `drawKnowledgeGraph()` — Canvas 绘制节点和边（高亮/淡化效果）
  - 新增 `handleGraphHover()` — 鼠标悬停高亮相关边，tooltip 显示节点名
  - 新增 `handleGraphClick()` — 点击节点跳转到知识详情
  - `switchKnowledgeSubtab()` 支持 graph 子标签切换
- **sidebar/sidebar.css**：图谱面板样式（Canvas 容器 400px 高度、tooltip、工具栏）

### 飞轮迭代 #22 — PDF 阅读

**需求**: 在浏览器中打开 PDF 时，PageWise 可以阅读和问答 PDF 内容

**修改文件**:
- **lib/page-sense.js**：
  - 新增 `pdf` 分析器，识别 PDF 文档页面
  - URL 以 `.pdf` 结尾（含查询参数和锚点）或 `isPdf` 标记
  - `suggestSkills()` 对 pdf 类型推荐 pdf-analyze 技能
  - `toPrompt()` 包含 PDF 文档标记
- **content/content.js**：
  - 新增 `detectPdfPage()` 检测 PDF 页面（URL 模式 + Chrome PDF viewer DOM + embed/iframe）
  - 新增 `extractPdfContent()` 多策略文本提取（text layer → viewer 容器 → 全 body 文本节点）
  - 新增消息处理器 `detectPdfPage` 和 `extractPdfContent`
  - fallback 提示：无法直接提取时引导用户使用复制全文功能
- **sidebar/sidebar.js**：
  - 新增 `detectAndShowPdfActions()` 检测并显示 PDF 快捷按钮
  - 新增 `showPdfQuickActions()` 显示「📄 分析这个 PDF」和「📝 提取 PDF 内容」
  - 新增 `pdfExtractContent()` 提取 PDF 内容并展示
  - 新增 `pdfAnalyze()` 使用 AI 分析 PDF 文档（概述、要点、结构、概念、总结）
  - 新增 `sendPdfAnalysisRequest()` 发送 PDF 内容给 AI
  - 新增 `fetchPdfTextFallback()` 通过 URL 获取 PDF 并用正则提取 Tj/TJ 文本操作符
  - PDF 页面图标更新为 📑
- **tests/test-page-sense.js**：8 个新测试（PDF URL 识别、isPdf 标记、非 PDF 排除、元信息、技能推荐、toPrompt）
- **总计 415 个测试，全部通过**
