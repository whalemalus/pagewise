# IMPLEMENTATION.md — 迭代实现记录

---

## 迭代 R75 — 智能集合 BookmarkSmartCollections

> 日期: 2026-05-11
> 任务: R75 智能集合 BookmarkSmartCollections — 基于规则的动态集合引擎

### 新增文件

1. **lib/bookmark-smart-collections.js** — 智能集合引擎
   - `constructor(bookmarks?, savedCollections?)` — 初始化，加载内置+已保存集合
   - `createCollection(name, rules)` — 创建自定义集合
   - `deleteCollection(collectionId)` — 删除自定义集合（内置不可删）
   - `updateCollection(collectionId, updates)` — 更新名称/规则
   - `getCollection(collectionId)` — 获取单个集合
   - `listCollections()` — 列出所有集合
   - `getCollectionBookmarks(collectionId)` — 获取集合匹配的书签
   - `getBookmarkCollections(bookmarkId)` — 获取书签所属的所有集合
   - `getCollectionStats()` — 获取所有集合及书签数
   - `addBookmark(bookmark)` / `removeBookmark(id)` / `setBookmarks(list)` — 书签动态更新
   - `exportCollections()` — 导出自定义集合（序列化）
   - `#validateRule(rule)` — 规则格式校验
   - `#evaluateRules(rules)` / `#bookmarkMatchesRules(bm, rules)` — 规则评估引擎
   - `#matchesRule(bm, rule)` — 单规则匹配分发
   - `#matchesTags` / `#matchesDomain` / `#matchesFolder` / `#matchesDateRange` / `#matchesCategory` — 6 种匹配器

2. **tests/test-bookmark-smart-collections.js** — 40 个单元测试
   - 构造与内置集合 (3)
   - 自定义集合创建 — 6 种规则类型 (7)
   - 多规则 AND 组合 (2)
   - 集合管理 CRUD (4)
   - 书签动态更新 (3)
   - 书签所属集合查询 (1)
   - 集合统计 (1)
   - 序列化/反序列化 (2)
   - 规则验证异常 (6)
   - 边界情况 (4)
   - 导出常量 (3)
   - 域名/时间细节 (4)

### 设计决策

1. **AND 逻辑**: 多规则全部匹配才归入集合（简单、可预测）
2. **纯数据模块**: 不依赖 DOM 或 Chrome API，易于测试和复用
3. **内置集合保护**: `builtin: true` 标记，不可删除/修改
4. **惰性评估**: 每次查询遍历全部书签评估规则（无缓存，数据量小时足够快）
5. **序列化兼容**: exportCollections() 导出 JSON，构造函数第二参数恢复

---

## 迭代 R73 — 书签-知识库联动 BookmarkKnowledgeIntegration

> 日期: 2026-05-08
> 任务: R73 书签-知识库联动 BookmarkKnowledgeIntegration — 书签与 PageWise 知识库双向关联

### 新增文件

1. **lib/bookmark-knowledge-integration.js** — 书签-知识库联动编排模块
   - `constructor(options?)` — 接受 correlationEngine / correlationThreshold / maxResults
   - `init(bookmarks, entries)` — 初始化联动引擎，全量构建关联索引
   - `sync(bookmarks?, entries?)` — 同步/刷新数据（支持增量或全量）
   - `isReady()` — 引擎就绪状态检查
   - `getKnowledgeForBookmark(bookmarkId, opts?)` — 书签→知识条目（带导航提示）
   - `getBookmarksForEntry(entryId, opts?)` — 知识条目→书签（带导航提示）
   - `buildNavigationLinks(bookmarkId)` — 构建书签→知识条目导航链接
   - `buildEntryNavLinks(entryId)` — 构建知识条目→书签导航链接
   - `getBookmarkKnowledgeSummary(bookmarkId)` — 书签知识摘要（条目数/平均分/Top/类型分布）
   - `getEntryKnowledgeSummary(entryId)` — 条目书签摘要
   - `enrichBookmark(bookmarkId)` — 为书签附加知识上下文
   - `enrichEntry(entryId)` — 为条目附加书签上下文
   - `getIntegrationStats()` — 联动统计（含覆盖率 coverageRate）
   - `getDashboard()` — 仪表盘数据（Top 关联书签/建议/孤立节点）
   - `destroy()` — 清理资源
   - `_buildNavHint(score, matchTypes)` — 导航提示生成

2. **tests/test-bookmark-knowledge-integration.js** — 42 个单元测试

### 设计决策

- **编排层模式**: BookmarkKnowledgeIntegration 作为编排层，桥接 BookmarkKnowledgeCorrelation (R66) 与实际数据源，不重复实现关联算法
- **导航提示**: 每条关联结果附带 navigationHint 文本（强/中/弱），基于关联度阈值 (≥0.6 强、≥0.3 中、<0.3 弱)
- **知识增强**: enrichBookmark/enrichEntry 为原始数据附加跨域上下文，包含 enrichmentScore 量化增强程度
- **仪表盘聚合**: getDashboard 一站式返回 Top 关联书签、关联建议、孤立书签/条目，用于 UI 展示
- **安全降级**: destroy 后所有 API 返回空结果，不抛异常
- **依赖注入**: correlationEngine 通过构造函数注入，便于测试和扩展
- **纯 ES Module**: 不依赖 DOM/Chrome API

### 依赖关系

```
BookmarkKnowledgeIntegration (新建, R73)
  └── BookmarkKnowledgeCorrelation (已存在, R66)  — 关联引擎核心
       └── EmbeddingEngine (已存在, 迭代 #7)      — TF-IDF 算法
```

### 测试结果

- 新增: 42 个测试，全部通过
- 总测试: 42 (本模块)

---

## 迭代 R71 — 快捷键 BookmarkKeyboardShortcuts

> 日期: 2026-05-07
> 任务: R71 快捷键 BookmarkKeyboardShortcuts — 书签图谱面板键盘快捷操作

### 新增文件

1. **lib/bookmark-keyboard-shortcuts.js** — 书签图谱快捷键管理模块
   - `constructor(options?)` — 初始化，可选 `{ enabled: false }` 禁用
   - `isEnabled()` / `enable()` / `disable()` — 启用/禁用控制
   - `matchAction(event)` — 匹配 keydown 事件，返回 action 名称或 null
   - `handleEvent(event)` — 匹配 + 自动分发回调，返回匹配的 action
   - `on(action, callback)` / `off(action, callback)` — 注册/移除回调
   - `dispatch(action)` — 手动分发 action
   - `getBindings()` / `setBinding(action, binding)` / `resetBindings()` — 绑定管理 (chrome.storage.sync 持久化)
   - `detectConflict(excludeAction, newBinding)` — 冲突检测
   - `formatBinding(binding)` — 格式化快捷键显示
   - `getShortcutsSummary()` — 获取摘要 (action + label + display + category)
   - `destroy()` — 清理资源
   - 导出: `DEFAULT_GRAPH_SHORTCUTS`, `GRAPH_SHORTCUT_LABELS`, `GRAPH_SHORTCUT_CATEGORIES` 常量

2. **tests/test-bookmark-keyboard-shortcuts.js** — 48 个单元测试

### 默认快捷键

| Action     | 默认绑定 | 说明         |
|------------|----------|-------------|
| search     | Ctrl+F   | 搜索聚焦     |
| zoomIn     | = (含 +) | 图谱放大     |
| zoomOut    | -        | 图谱缩小     |
| resetZoom  | 0        | 重置缩放     |
| refresh    | F5       | 刷新图谱     |

### 设计决策

- **纯 ES Module**: 不依赖 DOM，通过回调分发事件
- **回调驱动**: 使用 on/off/dispatch 模式，UI 层注册具体操作
- **zoomIn 特殊处理**: 默认 `=` 键，但 `+` 也自动匹配（用户按 Shift+= 产生 +）
- **精确修饰键匹配**: 多余修饰键不算匹配（避免快捷键劫持）
- **缓存优化**: 自定义绑定加载后缓存在内存中，避免重复读 storage
- **Chrome API 可选**: 无 chrome.storage.sync 时降级使用默认绑定
- **异常安全**: 回调异常不影响其他回调

### 依赖关系

```
BookmarkKeyboardShortcuts (新建, R71)
  └── chrome.storage.sync (可选, 用于持久化自定义绑定)
```

### 测试结果

- 新增: 48 个测试，全部通过

---

## 迭代 R70 — 暗色主题 BookmarkDarkTheme

> 日期: 2026-05-07
> 任务: R70 暗色主题 BookmarkDarkTheme — 图谱及面板暗色模式

### 新增文件

1. **lib/bookmark-dark-theme.js** — 暗色主题管理模块
   - `constructor(mode)` — 接受 'light' | 'dark' | 'system' 模式，默认 'system'
   - `getMode()` — 获取当前模式设置
   - `setMode(mode)` — 设置主题模式，相同模式不触发回调
   - `toggle()` — 切换明暗（system 模式下切换为与当前相反的显式模式）
   - `getTheme()` — 获取实际生效的主题名称（解析 system 模式）
   - `getColors()` — 获取完整主题色板（含 graph + panel 子对象）
   - `getGraphColors()` — 图谱专用颜色（背景/边/高亮/标签/节点边框/淡化边）
   - `getPanelColors()` — 面板通用颜色（背景/边框/文字/强调色/输入框）
   - `getGroupColors()` — 15 色分组方案（明暗各一，暗色亮度更高适配深色背景）
   - `getCSSVariables()` — CSS 变量键值对（可注入 <style> 或 documentElement）
   - `onThemeChange(callback)` — 注册主题变更回调
   - `destroy()` — 清理所有回调
   - `_detectSystemTheme()` — 检测系统 prefers-color-scheme（matchMedia 不可用时降级 light）
   - 导出: `LIGHT_THEME`, `DARK_THEME`, `THEME_MODES` 常量

2. **tests/test-bookmark-dark-theme.js** — 43 个单元测试

### 设计决策

- **纯 ES Module**: 不依赖 DOM/Chrome API，可在任意环境使用
- **三层颜色架构**: 全局色 → 图谱色 → 面板色，分层管理避免耦合
- **system 模式**: 通过 matchMedia('prefers-color-scheme: dark') 检测，不可用时降级 light
- **toggle 智能切换**: system 模式下 toggle 设置与当前生效主题相反的显式模式
- **不可变返回**: getColors/getGraphColors/getPanelColors/getGroupColors 返回浅拷贝，防止外部变异
- **深色色板设计**: 背景 '#1a1a2e'/'#16213e'，文字 '#e0e0e0'/'#c8c8e0'，节点分组色提亮适配
- **回调安全**: 回调异常不影响主题切换逻辑
- **CSS 变量**: 18 个变量覆盖全局、图谱、面板三个维度

### 依赖关系

```
BookmarkDarkTheme (新建, R70)
  └── 无外部依赖 (纯数据 + 颜色方案)
```

### 测试结果

- 新增: 43 个测试，全部通过
- 总测试: 43 (本模块)

---

## 迭代 R68 — AI 推荐 BookmarkAIRecommendations

> 日期: 2026-05-06
> 任务: R68 AI 推荐 BookmarkAIRecommendations — 基于 LLM 的智能学习推荐

### 新增文件

1. **lib/bookmark-ai-recommender.js** — AI 智能推荐核心模块
   - `constructor(options)` — 接受 aiClient/recommender/clusterer/gapDetector/learningPath/progress/cacheTtl
   - `analyzeProfile(bookmarks[], context?)` — 纯本地画像分析 (< 50ms/500 书签)
     - topDomains: 高频域名 Top-5
     - topCategories: 领域分布 Top-5
     - strengths: 知识强项领域 (覆盖率 ≥ moderate)
     - gaps: 知识盲区领域 (覆盖率 ≤ weak)
     - recentFocus: 近 30 天收藏焦点
     - readingProgress: 已读/在读/未读统计
     - difficultyDistribution: 入门/进阶/高级分布
   - `getRecommendations(context?)` — AI 智能推荐 (3 种类型: pattern/gap-filling/depth)
   - `clearCache()` — 手动清除推荐缓存
   - `getLastSource()` — 获取推荐来源 ('ai' | 'fallback' | 'cache')
   - `_getAIRecommendations(profile)` — 调用 AIClient 获取 AI 推荐
   - `_buildPrompt(profile)` — 构建推荐 prompt (只含统计摘要，≤ 1500 tokens)
   - `_parseAIResponse(content)` — 解析 AI JSON 响应 (含 markdown 代码块处理 + 字段校验)
   - `_fallbackRecommend(profile, context)` — AI 不可用时降级到规则推荐
   - `_isCacheValid()` — 缓存 TTL 检查 (默认 30 分钟)
   - `_extractDomain(url)` / `_inferCategory(bookmark)` / `_judgeDifficulty(bookmark)` — 内部工具

2. **tests/test-bookmark-ai-recommender.js** — 36 个单元测试

### 设计决策

- **依赖反转**: AIClient 通过构造函数注入，不硬编码 import，便于测试 mock
- **画像纯本地计算**: analyzeProfile 不调用 AI，基于书签元数据统计
- **Prompt 只含统计摘要**: 不发送原始书签全文，保护隐私 + 控制 token 量
- **3 种推荐类型**: pattern (收藏模式) / gap-filling (盲区入门) / depth (深度进阶)
- **30 分钟缓存 TTL**: 同一时间窗口内重复调用返回缓存，减少 API 消耗
- **降级策略**: AI 不可用时自动生成基于规则的推荐，标注 source='fallback'
- **JSON 容错**: 支持 markdown 代码块包裹、字段缺失、类型错误等异常情况
- **复用难度规则**: 与 BookmarkLearningPath 保持一致的难度判定逻辑

### 依赖关系

```
BookmarkAIRecommendations (新建, R68)
  ├── AIClient (已存在, 迭代 #2)           — AI 推荐核心调用
  ├── BookmarkRecommender (已存在, R48)     — 降级规则推荐 (可选)
  ├── BookmarkClusterer (已存在, R53)       — 领域聚类 (可选)
  ├── BookmarkGapDetector (已存在, R57)     — 知识盲区 (可选)
  ├── BookmarkLearningPath (已存在, R54)    — 难度判定 (可选)
  └── BookmarkLearningProgress (已存在, R67) — 学习进度 (可选)
```

### 测试结果

- 新增: 36 个测试，全部通过
- 总测试: 36 (本模块)

---

## 迭代 R66 — 知识关联 BookmarkKnowledgeCorrelation

> 日期: 2026-05-05
> 任务: R66 知识关联 BookmarkKnowledgeCorrelation — 书签与知识库 Q&A 条目的双向关联

### 新增文件

1. **lib/bookmark-knowledge-link.js** — 知识关联引擎核心模块
   - `BookmarkKnowledgeCorrelation.FIELD_WEIGHTS` — 多维关联权重常量 (URL: 0.4, title: 0.3, tag: 0.3)
   - `constructor(embeddingEngine?)` — 可选注入引擎
   - `buildIndex(bookmarks[], entries[])` — 全量构建关联索引 (URL 倒排 + 标签倒排 + 语义向量)
   - `addEntry(entry)` — 增量添加知识条目
   - `removeEntry(entryId)` — 增量删除知识条目
   - `getRelatedEntries(bookmarkId, opts?)` — 书签→知识条目 关联查询
   - `getRelatedBookmarks(entryId, opts?)` — 知识条目→书签 关联查询 (双向)
   - `getCorrelationStrength(bookmarkId, entryId)` — 指定对关联强度详情
   - `suggestCorrelations(opts?)` — 未关联高相似度对建议
   - `getCorrelationSummary(bookmarkId)` — 书签关联摘要
   - `getStats()` — 统计信息 (关联数/已关联书签/已关联条目/平均关联)
   - `_normalizeUrl(url)` — URL 规范化 (移除协议/www/尾斜杠/fragment)
   - `_normalizeTag(tag)` — 标签规范化
   - `_buildUrlIndex()` / `_buildTagIndex()` — URL 和标签倒排索引构建
   - `_computeAllCorrelations()` — 全量关联度计算
   - `_computeCorrelation(bookmark, entry)` — 单对关联度计算
   - `_computeUrlMatch(bookmark, entry)` — URL 匹配 (精确/包含/同域名)
   - `_computeTitleSimilarity(bookmark, entry)` — TF-IDF 余弦相似度
   - `_computeTagOverlap(bookmark, entry)` — Jaccard 系数

2. **tests/test-bookmark-knowledge-link.js** — 30 个单元测试

### 设计决策

- **复用 EmbeddingEngine**: 不重新实现 TF-IDF，直接复用迭代 #7 的核心算法计算标题语义相似度
- **多维关联度**: URL 精确匹配 (0.4) + 标题语义相似 (0.3) + 标签重叠 (0.3)，三个维度各自独立计算
- **URL 匹配分层**: 精确匹配 (1.0) > 路径包含 (0.7) > 同域名 (0.3) > 无匹配 (0)
- **关联阈值 0.15**: 低于此值不认为有关联，避免噪声
- **双向查询**: 基于同一关联缓存实现书签→条目和条目→书签双向查询
- **增量更新**: addEntry/removeEntry 直接修改缓存，无需全量重建
- **纯 ES Module**: 不依赖 DOM/Chrome API，可在 Node.js 环境测试

### 依赖关系

```
BookmarkKnowledgeCorrelation (新建, R66)
  ├── EmbeddingEngine (已存在, 迭代 #7)  — TF-IDF 核心算法
  ├── BookmarkCollector 标准格式 (R43)    — 书签对象输入
  └── KnowledgeBase 条目格式 (现有)       — 知识条目对象输入
```

### 测试结果

- 新增: 30 个测试，全部通过
- 总测试: 30 (本模块)

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
