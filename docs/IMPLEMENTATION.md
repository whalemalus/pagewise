     1|# IMPLEMENTATION.md — 迭代实现记录

---

## 迭代 R80 — 国际化 BookmarkI18n

> 日期: 2026-05-13
> 任务: R80 国际化 BookmarkI18n — 书签模块全面国际化，中英文界面切换，所有用户可见字符串外部化

### 新增文件

1. **lib/bookmark-i18n.js** — 书签国际化模块
   - `BOOKMARK_I18N_KEYS` — 37 个 i18n key 映射表（短 key → 全局 bookmark.* key）
   - `bookmarkZhCN` — 中文语言包（37 条翻译）
   - `bookmarkEnUS` — 英文语言包（37 条翻译）
   - `registerBookmarkLocale(options?)` — 注册语言包到全局 i18n 系统，支持 extraLocales 扩展
   - `getStatusLabel(status, locale?)` — 获取本地化状态标签（unread/reading/read）
   - `getStatusLabels(locale?)` — 获取状态标签映射对象
   - `getLocaleDateOptions(locale?)` — 获取 Intl.DateTimeFormat options
   - `formatDateByLocale(timestamp, locale?)` — 本地化日期格式化
   - `createBookmarkT(locale?)` — 创建书签专用翻译函数（自动映射短 key）
   - `getAllBookmarkKeys()` — 获取所有已定义的 i18n key
   - `validateLocaleCompleteness(locale, messages)` — 检查语言包翻译完整性
   - 模块自动注册：导入时自动将内置语言包注册到全局 i18n 系统

2. **tests/test-bookmark-i18n.js** — 37 个单元测试
   - 常量导出: BOOKMARK_I18N_KEYS 结构/搜索/面板/概览 key (4)
   - 中文语言包: 对象类型/完整性/非空/翻译正确性 (4)
   - 英文语言包: 对象类型/完整性/非空/翻译正确性/中英 key 一致 (5)
   - registerBookmarkLocale: 注册/切换/支持语言列表 (3)
   - createBookmarkT: 返回函数/中英文映射/参数插值/未知 key (5)
   - getStatusLabel: 中文/英文/未知状态/null (4)
   - formatDateByLocale: 有效时间戳/中文/英文/无效/默认 (5)
   - getLocaleDateOptions: 返回对象/hour minute/默认 (3)
   - 语言包完整性: key 格式/无重复/数量一致/插值占位符 (4)

### 修改文件

1. **lib/bookmark-detail-panel.js** — `_formatDate()` 改用 `formatDateByLocale()`
2. **lib/bookmark-preview.js** — `STATUS_LABELS` 从硬编码中文改为 `Proxy` + `getStatusLabel()` 动态获取
3. **lib/bookmark-core.js** — `STATUS_LABELS` 同样改为 `Proxy` + `getStatusLabel()` 代理
4. **lib/bookmark-smart-collections.js** — 内置集合名称改用 `bt()` 翻译函数
5. **options/bookmark-panel.js** — 搜索占位符、过滤器标签等 UI 字符串改用 `bt()` 翻译
6. **popup/bookmark-overview.js** — 空状态、统计标签等 UI 字符串改用 `bt()` 翻译
7. **_locales/en/messages.json** — 新增书签相关 Chrome Web Store 本地化消息
8. **_locales/zh_CN/messages.json** — 新增书签相关 Chrome Web Store 本地化消息
9. **tests/test-bookmark-panel-integration.js** — 集成测试适配 i18n
10. **tests/test-bookmark-preview.js** — 预览测试适配 i18n

### 设计决策

- **命名空间隔离**: 所有书签 i18n key 以 `bookmark.` 前缀命名，避免与其他模块冲突
- **短 key 映射**: 代码中使用 `bt('status.unread')` 简写，内部自动映射到 `bookmark.status.unread`
- **自动注册**: `bookmark-i18n.js` 导入时自动注册语言包，消费方无需手动初始化
- **Proxy 动态标签**: `STATUS_LABELS` 使用 ES6 Proxy 实现动态翻译，语言切换后自动生效
- **全局 i18n 系统集成**: 复用 `lib/i18n.js` 基础设施，不重复造轮子
- **Chrome Web Store 兼容**: `_locales/` 下的消息文件同步更新，满足 Chrome Web Store 审核要求
- **向后兼容**: 未翻译的 key 返回原始 key，不会导致 UI 异常
- **纯 ES Module**: 不引入外部 i18n 库，零依赖

### 依赖关系

```
BookmarkI18n (新建, R80)
  └── i18n.js (已存在) — 全局 i18n 基础设施 (registerLocale/t/setLocale/getCurrentLocale)

消费者:
  ├── BookmarkDetailPanel (R47) — formatDateByLocale
  ├── BookmarkContentPreview (R64) — getStatusLabel (STATUS_LABELS Proxy)
  ├── BookmarkCore (合并模块) — getStatusLabel (STATUS_LABELS Proxy)
  ├── BookmarkSmartCollections (R75) — bt() 翻译内置集合名称
  ├── BookmarkOptionsPage (R51) — bt() 翻译 UI 字符串
  └── BookmarkPopup (R50) — bt() 翻译 UI 字符串
```

### 测试结果

- 新增: 37 个测试，全部通过
- 总测试: 37 (本模块)

---

## 迭代 R78 — 性能优化 BookmarkPerformanceOptimization

> 日期: 2026-05-12
> 任务: R78 性能优化 BookmarkPerformanceOptimization — 万级书签场景下的批处理、缓存、虚拟化和 Worker 卸载

### 新增文件

1. **lib/bookmark-performance.js** — 性能优化器
   - `constructor(options?)` — 配置 batchSize/cacheMaxSize/workerEnabled
   - `buildGraphBatched(bookmarks, onProgress?)` — 分批构建图谱，每批间让出主线程
   - `buildIndexBatched(bookmarks, onProgress?)` — 分批构建倒排索引
   - `computeSimilarityBatched(pairs, onProgress?)` — 分批计算相似度
   - `trimCache(cache, maxSize)` — LRU 缓存淘汰（Map 插入序）
   - `getVisibleNodes(nodes, viewport, padding?)` — 视口裁剪只渲染可见节点
   - `createWorker()` — 创建 Worker 封装（postMessage/terminate）
   - `runInWorker(operation, data)` — Worker 中执行操作（主线程降级）
   - `getPerformanceStats()` — 返回性能统计对象
   - 内部: _computePairSimilarity / _tokenizeTitle / _extractDomain / _jaccard / _yield

2. **tests/test-bookmark-performance.js** — 20 个单元测试
   - 构造器默认值/自定义参数 (2)
   - buildGraphBatched: 基本/进度/空输入/null输入 (4)
   - buildIndexBatched: 基本/进度/空输入 (3)
   - computeSimilarityBatched: 基本/进度/空输入 (3)
   - trimCache: 超限淘汰/未超限保留 (2)
   - getVisibleNodes: 视口内/空视口/padding扩展 (3)
   - getPerformanceStats: 统计记录 (1)
   - createWorker/runInWorker (2)

### 设计决策
- 复用 BookmarkGraphEngine 和 BookmarkIndexer 而非重写，通过分批调用 + setTimeout(0) 实现非阻塞
- 相似度计算在优化器内部实现简化版本（_computePairSimilarity），避免循环依赖
- Worker 封装采用接口模式，Node.js 环境返回模拟对象，浏览器环境可扩展为真实 Worker
- Map 的迭代顺序是插入序，天然支持 LRU 语义（淘汰最早的条目 = 淘汰最久未访问的）
     2|
     3|---
     4|
     5|## 迭代 R75 — 智能集合 BookmarkSmartCollections
     6|
     7|> 日期: 2026-05-11
     8|> 任务: R75 智能集合 BookmarkSmartCollections — 基于规则的动态集合引擎
     9|
    10|### 新增文件
    11|
    12|1. **lib/bookmark-smart-collections.js** — 智能集合引擎
    13|   - `constructor(bookmarks?, savedCollections?)` — 初始化，加载内置+已保存集合
    14|   - `createCollection(name, rules)` — 创建自定义集合
    15|   - `deleteCollection(collectionId)` — 删除自定义集合（内置不可删）
    16|   - `updateCollection(collectionId, updates)` — 更新名称/规则
    17|   - `getCollection(collectionId)` — 获取单个集合
    18|   - `listCollections()` — 列出所有集合
    19|   - `getCollectionBookmarks(collectionId)` — 获取集合匹配的书签
    20|   - `getBookmarkCollections(bookmarkId)` — 获取书签所属的所有集合
    21|   - `getCollectionStats()` — 获取所有集合及书签数
    22|   - `addBookmark(bookmark)` / `removeBookmark(id)` / `setBookmarks(list)` — 书签动态更新
    23|   - `exportCollections()` — 导出自定义集合（序列化）
    24|   - `#validateRule(rule)` — 规则格式校验
    25|   - `#evaluateRules(rules)` / `#bookmarkMatchesRules(bm, rules)` — 规则评估引擎
    26|   - `#matchesRule(bm, rule)` — 单规则匹配分发
    27|   - `#matchesTags` / `#matchesDomain` / `#matchesFolder` / `#matchesDateRange` / `#matchesCategory` — 6 种匹配器
    28|
    29|2. **tests/test-bookmark-smart-collections.js** — 40 个单元测试
    30|   - 构造与内置集合 (3)
    31|   - 自定义集合创建 — 6 种规则类型 (7)
    32|   - 多规则 AND 组合 (2)
    33|   - 集合管理 CRUD (4)
    34|   - 书签动态更新 (3)
    35|   - 书签所属集合查询 (1)
    36|   - 集合统计 (1)
    37|   - 序列化/反序列化 (2)
    38|   - 规则验证异常 (6)
    39|   - 边界情况 (4)
    40|   - 导出常量 (3)
    41|   - 域名/时间细节 (4)
    42|
    43|### 设计决策
    44|
    45|1. **AND 逻辑**: 多规则全部匹配才归入集合（简单、可预测）
    46|2. **纯数据模块**: 不依赖 DOM 或 Chrome API，易于测试和复用
    47|3. **内置集合保护**: `builtin: true` 标记，不可删除/修改
    48|4. **惰性评估**: 每次查询遍历全部书签评估规则（无缓存，数据量小时足够快）
    49|5. **序列化兼容**: exportCollections() 导出 JSON，构造函数第二参数恢复
    50|
    51|---
    52|
    53|## 迭代 R73 — 书签-知识库联动 BookmarkKnowledgeIntegration
    54|
    55|> 日期: 2026-05-08
    56|> 任务: R73 书签-知识库联动 BookmarkKnowledgeIntegration — 书签与 PageWise 知识库双向关联
    57|
    58|### 新增文件
    59|
    60|1. **lib/bookmark-knowledge-integration.js** — 书签-知识库联动编排模块
    61|   - `constructor(options?)` — 接受 correlationEngine / correlationThreshold / maxResults
    62|   - `init(bookmarks, entries)` — 初始化联动引擎，全量构建关联索引
    63|   - `sync(bookmarks?, entries?)` — 同步/刷新数据（支持增量或全量）
    64|   - `isReady()` — 引擎就绪状态检查
    65|   - `getKnowledgeForBookmark(bookmarkId, opts?)` — 书签→知识条目（带导航提示）
    66|   - `getBookmarksForEntry(entryId, opts?)` — 知识条目→书签（带导航提示）
    67|   - `buildNavigationLinks(bookmarkId)` — 构建书签→知识条目导航链接
    68|   - `buildEntryNavLinks(entryId)` — 构建知识条目→书签导航链接
    69|   - `getBookmarkKnowledgeSummary(bookmarkId)` — 书签知识摘要（条目数/平均分/Top/类型分布）
    70|   - `getEntryKnowledgeSummary(entryId)` — 条目书签摘要
    71|   - `enrichBookmark(bookmarkId)` — 为书签附加知识上下文
    72|   - `enrichEntry(entryId)` — 为条目附加书签上下文
    73|   - `getIntegrationStats()` — 联动统计（含覆盖率 coverageRate）
    74|   - `getDashboard()` — 仪表盘数据（Top 关联书签/建议/孤立节点）
    75|   - `destroy()` — 清理资源
    76|   - `_buildNavHint(score, matchTypes)` — 导航提示生成
    77|
    78|2. **tests/test-bookmark-knowledge-integration.js** — 42 个单元测试
    79|
    80|### 设计决策
    81|
    82|- **编排层模式**: BookmarkKnowledgeIntegration 作为编排层，桥接 BookmarkKnowledgeCorrelation (R66) 与实际数据源，不重复实现关联算法
    83|- **导航提示**: 每条关联结果附带 navigationHint 文本（强/中/弱），基于关联度阈值 (≥0.6 强、≥0.3 中、<0.3 弱)
    84|- **知识增强**: enrichBookmark/enrichEntry 为原始数据附加跨域上下文，包含 enrichmentScore 量化增强程度
    85|- **仪表盘聚合**: getDashboard 一站式返回 Top 关联书签、关联建议、孤立书签/条目，用于 UI 展示
    86|- **安全降级**: destroy 后所有 API 返回空结果，不抛异常
    87|- **依赖注入**: correlationEngine 通过构造函数注入，便于测试和扩展
    88|- **纯 ES Module**: 不依赖 DOM/Chrome API
    89|
    90|### 依赖关系
    91|
    92|```
    93|BookmarkKnowledgeIntegration (新建, R73)
    94|  └── BookmarkKnowledgeCorrelation (已存在, R66)  — 关联引擎核心
    95|       └── EmbeddingEngine (已存在, 迭代 #7)      — TF-IDF 算法
    96|```
    97|
    98|### 测试结果
    99|
   100|- 新增: 42 个测试，全部通过
   101|- 总测试: 42 (本模块)
   102|
   103|---
   104|
   105|## 迭代 R71 — 快捷键 BookmarkKeyboardShortcuts
   106|
   107|> 日期: 2026-05-07
   108|> 任务: R71 快捷键 BookmarkKeyboardShortcuts — 书签图谱面板键盘快捷操作
   109|
   110|### 新增文件
   111|
   112|1. **lib/bookmark-keyboard-shortcuts.js** — 书签图谱快捷键管理模块
   113|   - `constructor(options?)` — 初始化，可选 `{ enabled: false }` 禁用
   114|   - `isEnabled()` / `enable()` / `disable()` — 启用/禁用控制
   115|   - `matchAction(event)` — 匹配 keydown 事件，返回 action 名称或 null
   116|   - `handleEvent(event)` — 匹配 + 自动分发回调，返回匹配的 action
   117|   - `on(action, callback)` / `off(action, callback)` — 注册/移除回调
   118|   - `dispatch(action)` — 手动分发 action
   119|   - `getBindings()` / `setBinding(action, binding)` / `resetBindings()` — 绑定管理 (chrome.storage.sync 持久化)
   120|   - `detectConflict(excludeAction, newBinding)` — 冲突检测
   121|   - `formatBinding(binding)` — 格式化快捷键显示
   122|   - `getShortcutsSummary()` — 获取摘要 (action + label + display + category)
   123|   - `destroy()` — 清理资源
   124|   - 导出: `DEFAULT_GRAPH_SHORTCUTS`, `GRAPH_SHORTCUT_LABELS`, `GRAPH_SHORTCUT_CATEGORIES` 常量
   125|
   126|2. **tests/test-bookmark-keyboard-shortcuts.js** — 48 个单元测试
   127|
   128|### 默认快捷键
   129|
   130|| Action     | 默认绑定 | 说明         |
   131||------------|----------|-------------|
   132|| search     | Ctrl+F   | 搜索聚焦     |
   133|| zoomIn     | = (含 +) | 图谱放大     |
   134|| zoomOut    | -        | 图谱缩小     |
   135|| resetZoom  | 0        | 重置缩放     |
   136|| refresh    | F5       | 刷新图谱     |
   137|
   138|### 设计决策
   139|
   140|- **纯 ES Module**: 不依赖 DOM，通过回调分发事件
   141|- **回调驱动**: 使用 on/off/dispatch 模式，UI 层注册具体操作
   142|- **zoomIn 特殊处理**: 默认 `=` 键，但 `+` 也自动匹配（用户按 Shift+= 产生 +）
   143|- **精确修饰键匹配**: 多余修饰键不算匹配（避免快捷键劫持）
   144|- **缓存优化**: 自定义绑定加载后缓存在内存中，避免重复读 storage
   145|- **Chrome API 可选**: 无 chrome.storage.sync 时降级使用默认绑定
   146|- **异常安全**: 回调异常不影响其他回调
   147|
   148|### 依赖关系
   149|
   150|```
   151|BookmarkKeyboardShortcuts (新建, R71)
   152|  └── chrome.storage.sync (可选, 用于持久化自定义绑定)
   153|```
   154|
   155|### 测试结果
   156|
   157|- 新增: 48 个测试，全部通过
   158|
   159|---
   160|
   161|## 迭代 R70 — 暗色主题 BookmarkDarkTheme
   162|
   163|> 日期: 2026-05-07
   164|> 任务: R70 暗色主题 BookmarkDarkTheme — 图谱及面板暗色模式
   165|
   166|### 新增文件
   167|
   168|1. **lib/bookmark-dark-theme.js** — 暗色主题管理模块
   169|   - `constructor(mode)` — 接受 'light' | 'dark' | 'system' 模式，默认 'system'
   170|   - `getMode()` — 获取当前模式设置
   171|   - `setMode(mode)` — 设置主题模式，相同模式不触发回调
   172|   - `toggle()` — 切换明暗（system 模式下切换为与当前相反的显式模式）
   173|   - `getTheme()` — 获取实际生效的主题名称（解析 system 模式）
   174|   - `getColors()` — 获取完整主题色板（含 graph + panel 子对象）
   175|   - `getGraphColors()` — 图谱专用颜色（背景/边/高亮/标签/节点边框/淡化边）
   176|   - `getPanelColors()` — 面板通用颜色（背景/边框/文字/强调色/输入框）
   177|   - `getGroupColors()` — 15 色分组方案（明暗各一，暗色亮度更高适配深色背景）
   178|   - `getCSSVariables()` — CSS 变量键值对（可注入 <style> 或 documentElement）
   179|   - `onThemeChange(callback)` — 注册主题变更回调
   180|   - `destroy()` — 清理所有回调
   181|   - `_detectSystemTheme()` — 检测系统 prefers-color-scheme（matchMedia 不可用时降级 light）
   182|   - 导出: `LIGHT_THEME`, `DARK_THEME`, `THEME_MODES` 常量
   183|
   184|2. **tests/test-bookmark-dark-theme.js** — 43 个单元测试
   185|
   186|### 设计决策
   187|
   188|- **纯 ES Module**: 不依赖 DOM/Chrome API，可在任意环境使用
   189|- **三层颜色架构**: 全局色 → 图谱色 → 面板色，分层管理避免耦合
   190|- **system 模式**: 通过 matchMedia('prefers-color-scheme: dark') 检测，不可用时降级 light
   191|- **toggle 智能切换**: system 模式下 toggle 设置与当前生效主题相反的显式模式
   192|- **不可变返回**: getColors/getGraphColors/getPanelColors/getGroupColors 返回浅拷贝，防止外部变异
   193|- **深色色板设计**: 背景 '#1a1a2e'/'#16213e'，文字 '#e0e0e0'/'#c8c8e0'，节点分组色提亮适配
   194|- **回调安全**: 回调异常不影响主题切换逻辑
   195|- **CSS 变量**: 18 个变量覆盖全局、图谱、面板三个维度
   196|
   197|### 依赖关系
   198|
   199|```
   200|BookmarkDarkTheme (新建, R70)
   201|  └── 无外部依赖 (纯数据 + 颜色方案)
   202|```
   203|
   204|### 测试结果
   205|
   206|- 新增: 43 个测试，全部通过
   207|- 总测试: 43 (本模块)
   208|
   209|---
   210|
   211|## 迭代 R68 — AI 推荐 BookmarkAIRecommendations
   212|
   213|> 日期: 2026-05-06
   214|> 任务: R68 AI 推荐 BookmarkAIRecommendations — 基于 LLM 的智能学习推荐
   215|
   216|### 新增文件
   217|
   218|1. **lib/bookmark-ai-recommender.js** — AI 智能推荐核心模块
   219|   - `constructor(options)` — 接受 aiClient/recommender/clusterer/gapDetector/learningPath/progress/cacheTtl
   220|   - `analyzeProfile(bookmarks[], context?)` — 纯本地画像分析 (< 50ms/500 书签)
   221|     - topDomains: 高频域名 Top-5
   222|     - topCategories: 领域分布 Top-5
   223|     - strengths: 知识强项领域 (覆盖率 ≥ moderate)
   224|     - gaps: 知识盲区领域 (覆盖率 ≤ weak)
   225|     - recentFocus: 近 30 天收藏焦点
   226|     - readingProgress: 已读/在读/未读统计
   227|     - difficultyDistribution: 入门/进阶/高级分布
   228|   - `getRecommendations(context?)` — AI 智能推荐 (3 种类型: pattern/gap-filling/depth)
   229|   - `clearCache()` — 手动清除推荐缓存
   230|   - `getLastSource()` — 获取推荐来源 ('ai' | 'fallback' | 'cache')
   231|   - `_getAIRecommendations(profile)` — 调用 AIClient 获取 AI 推荐
   232|   - `_buildPrompt(profile)` — 构建推荐 prompt (只含统计摘要，≤ 1500 tokens)
   233|   - `_parseAIResponse(content)` — 解析 AI JSON 响应 (含 markdown 代码块处理 + 字段校验)
   234|   - `_fallbackRecommend(profile, context)` — AI 不可用时降级到规则推荐
   235|   - `_isCacheValid()` — 缓存 TTL 检查 (默认 30 分钟)
   236|   - `_extractDomain(url)` / `_inferCategory(bookmark)` / `_judgeDifficulty(bookmark)` — 内部工具
   237|
   238|2. **tests/test-bookmark-ai-recommender.js** — 36 个单元测试
   239|
   240|### 设计决策
   241|
   242|- **依赖反转**: AIClient 通过构造函数注入，不硬编码 import，便于测试 mock
   243|- **画像纯本地计算**: analyzeProfile 不调用 AI，基于书签元数据统计
   244|- **Prompt 只含统计摘要**: 不发送原始书签全文，保护隐私 + 控制 token 量
   245|- **3 种推荐类型**: pattern (收藏模式) / gap-filling (盲区入门) / depth (深度进阶)
   246|- **30 分钟缓存 TTL**: 同一时间窗口内重复调用返回缓存，减少 API 消耗
   247|- **降级策略**: AI 不可用时自动生成基于规则的推荐，标注 source='fallback'
   248|- **JSON 容错**: 支持 markdown 代码块包裹、字段缺失、类型错误等异常情况
   249|- **复用难度规则**: 与 BookmarkLearningPath 保持一致的难度判定逻辑
   250|
   251|### 依赖关系
   252|
   253|```
   254|BookmarkAIRecommendations (新建, R68)
   255|  ├── AIClient (已存在, 迭代 #2)           — AI 推荐核心调用
   256|  ├── BookmarkRecommender (已存在, R48)     — 降级规则推荐 (可选)
   257|  ├── BookmarkClusterer (已存在, R53)       — 领域聚类 (可选)
   258|  ├── BookmarkGapDetector (已存在, R57)     — 知识盲区 (可选)
   259|  ├── BookmarkLearningPath (已存在, R54)    — 难度判定 (可选)
   260|  └── BookmarkLearningProgress (已存在, R67) — 学习进度 (可选)
   261|```
   262|
   263|### 测试结果
   264|
   265|- 新增: 36 个测试，全部通过
   266|- 总测试: 36 (本模块)
   267|
   268|---
   269|
   270|## 迭代 R66 — 知识关联 BookmarkKnowledgeCorrelation
   271|
   272|> 日期: 2026-05-05
   273|> 任务: R66 知识关联 BookmarkKnowledgeCorrelation — 书签与知识库 Q&A 条目的双向关联
   274|
   275|### 新增文件
   276|
   277|1. **lib/bookmark-knowledge-link.js** — 知识关联引擎核心模块
   278|   - `BookmarkKnowledgeCorrelation.FIELD_WEIGHTS` — 多维关联权重常量 (URL: 0.4, title: 0.3, tag: 0.3)
   279|   - `constructor(embeddingEngine?)` — 可选注入引擎
   280|   - `buildIndex(bookmarks[], entries[])` — 全量构建关联索引 (URL 倒排 + 标签倒排 + 语义向量)
   281|   - `addEntry(entry)` — 增量添加知识条目
   282|   - `removeEntry(entryId)` — 增量删除知识条目
   283|   - `getRelatedEntries(bookmarkId, opts?)` — 书签→知识条目 关联查询
   284|   - `getRelatedBookmarks(entryId, opts?)` — 知识条目→书签 关联查询 (双向)
   285|   - `getCorrelationStrength(bookmarkId, entryId)` — 指定对关联强度详情
   286|   - `suggestCorrelations(opts?)` — 未关联高相似度对建议
   287|   - `getCorrelationSummary(bookmarkId)` — 书签关联摘要
   288|   - `getStats()` — 统计信息 (关联数/已关联书签/已关联条目/平均关联)
   289|   - `_normalizeUrl(url)` — URL 规范化 (移除协议/www/尾斜杠/fragment)
   290|   - `_normalizeTag(tag)` — 标签规范化
   291|   - `_buildUrlIndex()` / `_buildTagIndex()` — URL 和标签倒排索引构建
   292|   - `_computeAllCorrelations()` — 全量关联度计算
   293|   - `_computeCorrelation(bookmark, entry)` — 单对关联度计算
   294|   - `_computeUrlMatch(bookmark, entry)` — URL 匹配 (精确/包含/同域名)
   295|   - `_computeTitleSimilarity(bookmark, entry)` — TF-IDF 余弦相似度
   296|   - `_computeTagOverlap(bookmark, entry)` — Jaccard 系数
   297|
   298|2. **tests/test-bookmark-knowledge-link.js** — 30 个单元测试
   299|
   300|### 设计决策
   301|
   302|- **复用 EmbeddingEngine**: 不重新实现 TF-IDF，直接复用迭代 #7 的核心算法计算标题语义相似度
   303|- **多维关联度**: URL 精确匹配 (0.4) + 标题语义相似 (0.3) + 标签重叠 (0.3)，三个维度各自独立计算
   304|- **URL 匹配分层**: 精确匹配 (1.0) > 路径包含 (0.7) > 同域名 (0.3) > 无匹配 (0)
   305|- **关联阈值 0.15**: 低于此值不认为有关联，避免噪声
   306|- **双向查询**: 基于同一关联缓存实现书签→条目和条目→书签双向查询
   307|- **增量更新**: addEntry/removeEntry 直接修改缓存，无需全量重建
   308|- **纯 ES Module**: 不依赖 DOM/Chrome API，可在 Node.js 环境测试
   309|
   310|### 依赖关系
   311|
   312|```
   313|BookmarkKnowledgeCorrelation (新建, R66)
   314|  ├── EmbeddingEngine (已存在, 迭代 #7)  — TF-IDF 核心算法
   315|  ├── BookmarkCollector 标准格式 (R43)    — 书签对象输入
   316|  └── KnowledgeBase 条目格式 (现有)       — 知识条目对象输入
   317|```
   318|
   319|### 测试结果
   320|
   321|- 新增: 30 个测试，全部通过
   322|- 总测试: 30 (本模块)
   323|
   324|---
   325|
   326|## 迭代 R65 — 语义搜索 BookmarkSemanticSearch
   327|
   328|> 日期: 2026-05-05
   329|> 任务: R65 语义搜索 BookmarkSemanticSearch — 书签库自然语言语义搜索
   330|
   331|### 新增文件
   332|
   333|1. **lib/bookmark-semantic-search.js** — 语义搜索引擎核心模块
   334|   - `BookmarkSemanticSearch.FIELD_WEIGHTS` — 书签域字段权重 (title: 3.0, tags: 2.0, contentPreview: 1.5, folderPath: 1.0, url: 0.5)
   335|   - `constructor(embeddingEngine?, bookmarkSearch?)` — 可选注入引擎
   336|   - `buildIndex(bookmarks[])` — 全量构建 TF-IDF 词汇表 + 文档向量
   337|   - `addBookmark(bookmark)` / `removeBookmark(bookmarkId)` — 增量更新
   338|   - `semanticSearch(query, opts?)` — 纯语义搜索 (TF-IDF 余弦相似度)
   339|   - `hybridSearch(query, opts?)` — 混合搜索 (关键词 0.6 + 语义 0.4)
   340|   - `findSimilar(bookmarkId, limit?)` — 以文搜文
   341|   - `invalidateCache(bookmarkId?)` — 缓存失效
   342|   - `getStats()` — 索引统计
   343|   - `_getWeightedText(bookmark)` — 生成带字段权重的文档文本
   344|   - `_generateBookmarkVector(bookmark)` — 生成书签 TF-IDF 向量
   345|   - `_idf(term)` — 计算逆文档频率
   346|   - `_mergeResults(keyword, semantic, ratio)` — 结果合并归一化
   347|
   348|2. **tests/test-bookmark-semantic-search.js** — 35 个单元测试
   349|
   350|### 设计决策
   351|
   352|- **复用 EmbeddingEngine**: 不重新实现 TF-IDF，直接复用迭代 #7 的 `EmbeddingEngine` 核心算法
   353|- **书签域独立字段权重**: 不同于知识库域的权重 (title: 3.0, summary: 2.0)，书签域使用 contentPreview 替代 summary
   354|- **归一化合并策略**: 关键词和语义结果各自先归一化到 [0, 1]，再按 0.6:0.4 权重混合
   355|- **增量更新**: addBookmark/removeBookmark 直接修改词汇表的 document frequency，无需全量重建
   356|- **可选依赖注入**: BookmarkSearch 可选注入，无注入时 hybridSearch 退化为纯语义搜索
   357|- **纯 ES Module**: 不依赖 DOM/Chrome API，可在 Node.js 环境测试
   358|
   359|### 依赖关系
   360|
   361|```
   362|BookmarkSemanticSearch (新建, R65)
   363|  ├── EmbeddingEngine (已存在, 迭代 #7) — TF-IDF 核心算法
   364|  ├── BookmarkSearch (已存在, R47)      — 关键词搜索结果输入 (可选)
   365|  ├── BookmarkContentPreview (已存在, R64) — contentPreview 字段作为向量化输入
   366|  └── BookmarkCollector (已存在, R43)    — 标准书签对象格式
   367|```
   368|
   369|### 测试结果
   370|
   371|- 新增: 35 个测试，全部通过
   372|- 总测试: 35 (本模块)
   373|
   374|---
   375|
   376|## 迭代 R51 — 选项页集成 BookmarkOptionsPage
   377|
   378|> 日期: 2026-05-04
   379|> 任务: R51 选项页集成 BookmarkOptionsPage — 将 BookmarkPanel 集成到选项页，新增 Tab 导航
   380|
   381|### 新增文件
   382|
   383|1. **tests/test-bookmark-options-tab.js** — 13 个单元测试
   384|   - Tab 创建 / Tab 切换 / 默认 Tab / 初始容器
   385|   - BookmarkPanel 生命周期: init → render → destroy → re-init
   386|   - 搜索集成 / 节点点击 / 过滤器传递
   387|   - Hash 路由 #tab=bookmark
   388|   - 完整集成流: init → switch → search → node click → destroy → re-init
   389|
   390|### 修改文件
   391|
   392|1. **options/options.html** — 新增 Tab 导航结构 + 图谱面板容器
   393|   - `<nav class="tab-nav">` 包含 "⚙ 设置" 和 "🕸 书签图谱" 两个 Tab 按钮
   394|   - `<div id="settings-panel">` 包裹原有设置表单
   395|   - `<div id="bookmark-panel">` 作为 BookmarkPanel 渲染容器 (初始 `display: none`)
   396|
   397|2. **options/options.js** — 新增 TabManager + BookmarkPanel 集成
   398|   - `createTabManager()` — Tab 切换核心逻辑:
   399|     - `switchTab('bookmark')`: 隐藏设置面板 → 显示图谱面板 → `panel.render()` + `panel.init()`
   400|     - `switchTab('settings')`: 隐藏图谱面板 → 显示设置面板 → `panel.destroy()` 释放 Canvas/事件
   401|   - 导入 BookmarkPanel 及全部 7 个依赖模块 (Collector/Indexer/GraphEngine/Visualizer/DetailPanel/Search/Recommender)
   402|   - Hash 路由支持: `#tab=bookmark` 直接跳转图谱标签页
   403|   - 导出 `createTabManager` 供测试使用
   404|
   405|3. **options/options.css** — 新增 Tab 导航样式 + 图谱三栏布局样式
   406|   - Tab 导航: `.tab-nav` / `.tab-btn` / `.tab-btn.active`
   407|   - 三栏布局: `.bookmark-panel-layout` (`grid: 240px 1fr 280px`)
   408|   - 左侧面板: 搜索框 / 过滤器组 / 统计栏
   409|   - 中间面板: Canvas 图谱
   410|   - 右侧面板: 详情面板 / 标题 / URL / 文件夹 / 日期 / 标签 / 相似推荐
   411|   - 状态消息: loading / error / empty
   412|
   413|### 设计决策
   414|
   415|- **Tab 切换使用 CSS display:none/block**: 不使用路由或页面跳转，保持设置页输入值不丢失
   416|- **懒初始化 BookmarkPanel**: 切换到图谱 Tab 时才 render + init，避免不看图谱时浪费资源
   417|- **destroy 释放资源**: 切换离开时调用 `panel.destroy()` 释放 Canvas 事件监听器，防止内存泄漏
   418|- **Hash 路由**: `#tab=bookmark` 支持从 Popup "查看完整图谱" 按钮直接跳转
   419|- **设置标签页保持 640px**: 图谱全宽但设置页不改变原有布局
   420|
   421|### 测试结果
   422|
   423|- 新增: 13 个测试，全部通过
   424|- 已有 BookmarkPanel: 16 个测试，全部通过
   425|- 总测试: 445 (bookmark 模块)
   426|
   427|---
   428|
   429|## 迭代 21 — L1.2 实体/概念自动提取
   430|
   431|> 日期: 2026-04-30
   432|> 任务: L1.2 实体/概念自动提取 — 导出时用 AI 自动识别 Q&A 中提到的实体和概念
   433|
   434|### 新增文件
   435|
   436|1. **lib/entity-extractor.js** — 实体/概念自动提取模块
   437|   - `ENTITY_TYPES` — 支持的实体类型常量（person, tool, framework, api, language, platform, library, service, other）
   438|   - `buildExtractionPrompt(entries)` — 构建 AI 提示词，指示 AI 从 Q&A 条目中提取实体和概念
   439|   - `parseExtractionResponse(response)` — 解析 AI 返回的 JSON（支持 markdown 代码块包裹）
   440|   - `extractEntities(entries, aiClient, options)` — 主提取流程，支持批量处理和去重合并
   441|   - `generateEntityMarkdown(entity)` — 生成实体页 Markdown（含 YAML frontmatter + 概述 + 相关 Q&A + 关联实体）
   442|   - `generateConceptMarkdown(concept)` — 生成概念页 Markdown（含 YAML frontmatter + 概述 + 相关 Q&A + 关联技术）
   443|   - `buildEntityIndex(entities, concepts)` — 生成实体/概念索引 Markdown（按类型分组）
   444|   - `sanitizeFilename(name)` — 清理文件系统不安全字符
   445|
   446|2. **tests/test-entity-extractor.js** — 22 个单元测试
   447|
   448|### 设计决策
   449|
   450|- **纯 ES Module**：不依赖 IndexedDB 或 Chrome API，与 `KnowledgeBase` 完全解耦
   451|- **批量分批处理**：默认每批 10 条，大知识库分批调用 AI 后合并去重
   452|- **去重策略**：同名实体/概念自动合并 `relatedEntryIds`
   453|- **容错解析**：支持直接 JSON、markdown 代码块包裹、无效输入安全降级
   454|- **Wikilink 格式**：关联实体使用 `[[name]]` 格式，为 L1.3 交叉引用做准备
   455|
   456|### 测试结果
   457|
   458|- 新增: 22 个测试，全部通过
   459|- 总测试: 1539
   460|
   461|---
   462|
   463|## 迭代 R8 — PDF 提取引擎增强
   464|
   465|> 日期: 2026-04-30
   466|> 任务: PDF 提取引擎增强
   467|
   468|## 实现内容
   469|
   470|### 新增文件
   471|
   472|1. **lib/pdf-extractor.js** — PDF 文本提取器模块
   473|   - `PdfExtractor.extractText(arrayBuffer)` — 从 ArrayBuffer 提取 PDF 文本
   474|   - `PdfExtractor.extractFromUrl(url)` — 通过 URL 获取并提取
   475|   - 使用 pdf.js (ES Module) 进行可靠提取
   476|   - 支持元数据提取（标题、作者等）
   477|
   478|2. **lib/pdf.min.mjs** — pdf.js v3.11.174 库文件
   479|3. **lib/pdf.worker.min.mjs** — pdf.js worker 文件
   480|
   481|4. **tests/test-pdf-extractor.js** — PDF 提取器单元测试（9 个测试用例）
   482|
   483|### 修改文件
   484|
   485|1. **background/service-worker.js** — 新增 `extractPdfViaJs` 消息处理
   486|   - 动态加载 `lib/pdf-extractor.js`
   487|   - 通过消息协议供 content script 调用
   488|
   489|2. **content/content.js** — 改进 `extractPdfContent` 消息处理
   490|   - 保留 DOM 提取作为快速路径
   491|   - DOM 提取失败时自动 fallback 到 pdf.js
   492|   - 通过 background service worker 调用 PdfExtractor
   493|
   494|3. **sidebar/sidebar.js** — 显示页数信息
   495|   - `pdfExtractContent()` 显示 PDF 页数
   496|
   497|4. **manifest.json** — 添加 `web_accessible_resources`
   498|   - 暴露 `lib/pdf.min.mjs` 和 `lib/pdf.worker.min.mjs`
   499|
   500|## 技术决策

---

## 迭代 R85 — 性能基准测试 BookmarkPerformanceBenchmark

> 日期: 2026-05-14
> 任务: R85: 性能基准测试 BookmarkPerformanceBenchmark

### 新增文件

1. **lib/bookmark-performance-benchmark.js** — 性能基准测试模块 (286 行)
   - `BookmarkPerformanceBenchmark.benchmarkSearch(bookmarks, query, iterations)` — 搜索基准测试，基于 BookmarkIndexer
   - `BookmarkPerformanceBenchmark.benchmarkSort(bookmarks, iterations)` — 排序基准测试（dateAdded 降序）
   - `BookmarkPerformanceBenchmark.benchmarkDedup(bookmarks, iterations)` — 去重基准测试（URL 精确匹配）
   - `BookmarkPerformanceBenchmark.benchmarkMemory(bookmarks)` — 内存估算（字符串/数组/对象开销模型）
   - `_computeStats(latencies)` — 延迟统计（avg/min/max/p50/p95/p99）
   - `_percentile(sorted, p)` — 线性插值百分位算法
   - `_emptyResult(iterations)` — 边界条件默认返回值

2. **tests/test-bookmark-performance-benchmark.js** — 30 个单元测试 (298 行)
   - benchmarkSearch: 11 个测试（正常/边界/大规模 100-10000 书签）
   - benchmarkSort: 6 个测试（结构/单调性/空输入/大规模）
   - benchmarkDedup: 6 个测试（结构/单调性/空输入/大规模）
   - benchmarkMemory: 7 个测试（结构/非零/空/null/对比/breakdown 求和/大规模）

### 设计决策

- **纯计算模块**: 不依赖 IndexedDB/Chrome API，使用 `performance.now()` 高精度计时
- **百分位线性插值**: 业界标准算法，处理 length=0/1 边界
- **排序用副本**: 每次迭代用 `[...bookmarks]` 避免原地排序污染
- **内存估算模型**: 简化估算（48 bytes 字符串基础 + 2 bytes/char UTF-16），非 V8 heap 快照
- **统一空结果**: null/空数组/iterations=0 统一返回 `_emptyResult()`，不抛异常

### 测试结果

- 新增: 30 个测试，全部通过
- 全量回归: 4238 tests, 0 fail
   501|