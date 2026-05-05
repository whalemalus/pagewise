# 版本发布记录 — 智阅 PageWise

> 所有重要变更都会记录在此文件。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

---

## [2.3.0] - 2026-05-04

BookmarkGraph Phase 5 — 测试验证与发布，完成书签知识图谱功能的全面测试和发布准备。

### 新增

- **Popup 书签图谱入口**：弹窗新增「🔖 书签图谱」按钮，一键跳转侧边栏书签标签页
- **Sidebar 书签标签页**：侧边栏新增完整的书签管理标签页，包含搜索、文件夹导航、详情面板
- **Options 页书签图谱**：设置页新增「🕸 书签图谱」标签页，提供全屏图谱可视化体验
- **书签详情面板**：点击图谱节点显示书签详情，包含相似书签推荐
- **书签搜索功能**：支持标题、URL、文件夹、标签多维搜索过滤
- **BookmarkOverview 模块**：Popup 中的书签概览，展示统计、分布、最近添加
- **BookmarkPanel 模块**：Options 页的书签图谱面板，三栏布局（搜索+图谱+详情）
- **17 个书签功能模块**：BookmarkCollector、BookmarkIndexer、BookmarkGraphEngine、BookmarkVisualizer、BookmarkDetailPanel、BookmarkSearch、BookmarkRecommender、BookmarkClusterer、BookmarkStatusManager、BookmarkTagger、BookmarkDedup、BookmarkFolderAnalyzer、BookmarkGapDetector、BookmarkImportExport、BookmarkTagEditor、BookmarkLearningPath、BookmarkLinkChecker

### 测试

- 书签相关测试：478 个测试用例，全部通过
- 测试文件：24 个书签测试文件
- 测试覆盖：collector、indexer、graph、visualizer、detail-panel、search、recommender、clusterer、status、tagger、dedup、folder-analyzer、gap-detector、io、tag-editor、learning-path、overview、panel、panel-integration、options-tab、link-checker-e2e、graph-e2e、v1-e2e
- 全量测试：2662/2680 通过（18 个预先存在的 KnowledgePanel E2E 失败，与 BookmarkGraph 无关）

### 验收标准

- ✅ 所有书签测试通过 (478/478)
- ✅ Popup 有书签图谱按钮
- ✅ Sidebar 有书签标签页
- ✅ Options 页书签图谱可以正常显示
- ✅ 点击节点可以显示详情
- ✅ 搜索功能正常

---

## [2.0.0] - 2026-04-30

v2.0.0 里程碑版本 — 20 轮飞轮迭代，新增大量功能、性能优化与架构重构。

### 新增

- **截图视觉问答**：页面截图捕获，支持视觉 AI 问答
- **性能监控**：响应时间追踪，实时显示 AI 请求耗时
- **增强统计仪表盘**：连续使用天数（streak）追踪 + 趋势图表
- **增强间隔复习**：连续复习天数追踪（streak tracking）
- **增强新手引导**：自动检测用户环境，智能推荐配置
- **持久化对话历史面板**：IndexedDB 全量持久化，支持浏览和搜索历史对话
- **代码语法高亮**：AI 回答中的代码块自动语法高亮
- **智能错误处理**：自动重试机制，网络错误友好提示
- **快捷键系统**：Ctrl+Shift+Y 打开侧边栏、Ctrl+Shift+S 总结页面、Ctrl+Shift+X 切换侧边栏
- **停止生成按钮**：AbortController 支持，随时中断 AI 回答
- **知识条目去重检测**：保存时自动检测 title/question/answer 重复，跳过重复条目

### 性能优化

- **虚拟滚动**：知识列表大数据量高性能渲染
- **倒排索引**：知识库搜索索引，大幅加速全文检索
- **懒渲染消息**：大对话历史懒加载渲染，减少内存占用

### 架构重构

- **MessageRenderer 类提取**：消息渲染逻辑从 sidebar.js 提取为独立类，sidebar.js 减少 125 行
- **KnowledgePanel 类提取**：知识面板逻辑提取为独立类，22 个方法委托，sidebar.js 减少 646 行
- sidebar.js 总共瘦身约 771 行，代码可维护性大幅提升

### 修复

- 修复 KnowledgePanel 重复导入导致的模块加载错误
- 修复知识列表删除后不刷新 + 学习路径生成超时 120s
- 修复 Profile 选择器暗色主题样式 — 背景、边框、下拉箭头

### 测试

- 新增 10 个测试文件：performance-metrics、screenshot、onboarding、history-panel、keyboard-shortcuts、message-renderer-lazy、error-handler、animations、e2e-qa、settings-ui 等
- 测试文件总数：48 个

---

## [1.0.0] - 2026-04-28

首个正式发布版本。经过 33 轮飞轮迭代，从零构建完整的 Chrome 扩展。

### 新增

#### 核心功能
- **页面内容提取**：Reader Mode 策略智能提取网页正文
- **AI 问答**：流式输出、多轮对话、Markdown 渲染、代码块复制按钮
- **知识库存储**：基于 IndexedDB 的本地知识库
- **知识检索**：全文搜索、标签筛选、语义搜索（bigram 向量余弦相似度）
- **数据导入导出**：支持 Markdown / JSON / 纯文本格式
- **技能系统**：7 个内置技能 + 自定义技能系统（最多 20 个）
- **页面感知**：6 种页面类型自动识别（通用网页、API 文档、GitHub 仓库、YouTube、PDF、代码仓库）
- **记忆系统**：用户画像、知识召回、加权检索、AI 语义重排
- **自进化**：隐式反馈、风格自适应、用户水平推断、检索策略调优
- **右键菜单**：「用 智阅 提问」和「用 AI 总结此页面」
- **多页面联合分析**：同时分析最多 5 个标签页

#### 页面类型支持
- **API 文档专用模式**：自动提取端点列表，按方法分组展示
- **GitHub 仓库页面理解**：自动分析 README、目录结构、语言统计
- **YouTube 视频字幕提取与总结**：DOM 提取 + 多策略兜底
- **PDF 文档阅读**：多策略文本提取，支持 Chrome PDF viewer
- **代码仓库识别**：支持 GitHub、GitLab 等代码托管平台

#### 智能功能
- **多模态图片理解**：页面图片提取与 AI 视觉问答
- **代码执行沙箱**：AI 回答中的 HTML/JavaScript 代码可在侧边栏直接运行
- **Prompt 模板库**：5 个内置模板 + 自定义模板一键调用（最多 20 个）
- **对话分支**：从任意 AI 回答节点分叉探索不同方向（最多 10 个分支）
- **Token 窗口管理**：对话 token 用量估算与警告
- **学习路径生成**：AI 基于知识库生成个性化学习路线
- **间隔复习系统**：基于 SM-2 算法的知识卡片复习
- **知识图谱可视化**：Canvas 力导向图展示知识关联
- **知识关联引擎**：自动发现知识条目间的关联
- **页面高亮标注**：选中文本高亮保存，跨访问持久化

#### 界面与交互
- **AxonHub 风格 API 配置**：提供商卡片选择器，模型发现
- **多配置 Profile**：保存/切换/删除多套 API 配置
- **暗色主题**：CSS 变量切换，支持跟随系统
- **划词提问**：选中文本后浮动按钮直接提问
- **页面内容预览面板**：透明展示 AI 看到的内容
- **数据统计仪表盘**：使用统计与趋势分析
- **新手引导流程**：首次安装分步引导
- **Toast 通知系统**：info/success/error/warning 动画提示
- **代码块复制按钮**：hover 显示，一键复制
- **快捷键系统**：Ctrl+Shift+Y（打开侧边栏）、Ctrl+Shift+S（总结页面）、Ctrl+Shift+X（切换侧边栏）
- **国际化**：支持中文和英文界面
- **可访问性**：ARIA 标签、键盘导航、焦点管理

#### 数据管理
- **知识库批量管理**：批量选择/删除/打标签/导出
- **对话历史持久化**：chrome.storage.session，24 小时自动过期
- **对话存储**：IndexedDB 持久化，支持搜索、按时间筛选
- **对话导出**：导出为 Markdown 文件

#### 技术基础设施
- **错误处理全面升级**：全局捕获/友好提示/重试机制
- **性能优化**：分页加载/搜索缓存/懒加载
- **Chrome API Mock**：tests/helpers/chrome-mock.js
- **IndexedDB Mock**：tests/helpers/indexeddb-mock.js
- **打包脚本**：scripts/build.sh 一键生成 Chrome Web Store 上传包

### 测试

- 建立测试框架（Node.js 内置 test runner，零外部依赖）
- 测试文件：23 个
- 测试套件：122 个
- 测试用例：537 个，全部通过
- 覆盖模块：utils、page-sense、skill-engine、knowledge-base、ai-client、conversation-store、highlight-store、onboarding、error-handler、stats、token-estimation、conversation-branch、prompt-templates、multi-tab、code-sandbox、custom-skills、knowledge-graph、spaced-repetition、knowledge-correlation、semantic-search、learning-path、batch-operations、conversation-storage

### Chrome Web Store 准备

- 权限最小化审查：4 个权限（storage、sidePanel、contextMenus、tabs）
- 中英文 description 字段（通过 i18n）
- 隐私政策文档（PRIVACY.md）
- 商店 listing 描述（STORE-LISTING.md）
- 打包脚本（scripts/build.sh）

### 修复

- 修复打包脚本未包含 `_locales` 目录的问题
