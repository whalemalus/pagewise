# 变更日志 — 智阅 PageWise

> 所有重要变更都会记录在此文件。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

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

## [Unreleased]

### 新增
- 项目飞轮迭代模板（CLAUDE.md、docs/）
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
