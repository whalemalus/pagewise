     1|# 变更日志 — 智阅 PageWise
     2|
     3|> 所有重要变更都会记录在此文件。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。
     4|
     5|---
     6|
     7|## [Unreleased]

### 新增
- **R78: BookmarkPerformanceOptimization 性能优化器** — `lib/bookmark-performance.js`
  - 分批处理引擎: 将图谱构建、索引构建、相似度计算分批执行，避免主线程阻塞
  - LRU 缓存淘汰: trimCache 基于 Map 插入序保留最新条目
  - 视口裁剪: getVisibleNodes 只返回视口内节点，支持 padding 扩展
  - Worker 卸载: createWorker/runInWorker 支持 CPU 密集操作移至后台线程
  - 性能统计: getPerformanceStats 追踪 buildTime/cacheHits/batchCount 等指标
  - 测试: 20 用例 ✅
     8|
     9|### 新增
    10|- **R76: BookmarkSharing 书签分享** — `lib/bookmark-sharing.js`
    11|  - 创建可分享集合: createShareableCollection
    12|  - 多格式导出: JSON / 人类可读文本 / Base64 / data: URI 分享链接
    13|  - 隐私控制: stripPersonalData / anonymizeUrls / includeFields 白名单
    14|  - 导入分享数据: 支持 JSON / Base64 / data: URI 三种输入
    15|  - 元数据统计: 书签数量/域名数/标签数
    16|  - 进度回调支持
    17|  - 测试: 60 用例 ✅
    18|
    19|- **R75: BookmarkSmartCollections 智能集合** — `lib/bookmark-smart-collections.js`
    20|  - 6 种规则类型: tags/domain/folder/status/dateRange/category
    21|  - 多规则 AND 组合匹配
    22|  - 内置集合: 未读/正在阅读/最近添加 (3 个)
    23|  - 自定义集合 CRUD: createCollection / deleteCollection / updateCollection
    24|  - 查询: getCollectionBookmarks / getBookmarkCollections / getCollectionStats
    25|  - 书签动态更新: addBookmark / removeBookmark / setBookmarks
    26|  - 序列化: exportCollections + 构造函数反序列化
    27|  - 规则验证: 完整的类型/值校验 + 友好错误信息
    28|  - 纯数据模块，不依赖 DOM 或 Chrome API
    29|  - 测试: 40 用例 ✅
    30|
    31|- **R73: BookmarkKnowledgeIntegration 书签-知识库联动** — `lib/bookmark-knowledge-integration.js`
    32|  - `init(bookmarks, entries)`: 初始化联动引擎，全量构建关联索引
    33|  - `sync(bookmarks?, entries?)`: 同步/刷新数据（支持增量或全量）
    34|  - `getKnowledgeForBookmark(bookmarkId, opts?)`: 书签→知识条目（带导航提示）
    35|  - `getBookmarksForEntry(entryId, opts?)`: 知识条目→书签（带导航提示）
    36|  - `buildNavigationLinks(bookmarkId)` / `buildEntryNavLinks(entryId)`: 双向导航链接构建
    37|  - `getBookmarkKnowledgeSummary(bookmarkId)` / `getEntryKnowledgeSummary(entryId)`: 知识摘要
    38|  - `enrichBookmark(bookmarkId)` / `enrichEntry(entryId)`: 跨域知识上下文增强
    39|  - `getIntegrationStats()`: 联动统计（含覆盖率 coverageRate）
    40|  - `getDashboard()`: 仪表盘（Top 关联书签/建议/孤立节点）
    41|  - 编排层模式：桥接 BookmarkKnowledgeCorrelation (R66) 与数据源
    42|  - 导航提示：强/中/弱三级关联度文字提示
    43|  - 纯 ES Module，依赖注入设计
    44|  - 测试: 42 用例 ✅
    45|
    46|- **R71: BookmarkKeyboardShortcuts 快捷键管理** — `lib/bookmark-keyboard-shortcuts.js`
    47|  - `constructor(options?)` — 初始化，可选禁用
    48|  - `matchAction(event)` — 匹配 keydown 事件
    49|  - `handleEvent(event)` — 匹配 + 分发回调
    50|  - `on(action, cb)` / `off(action, cb)` / `dispatch(action)` — 回调管理
    51|  - `getBindings()` / `setBinding()` / `resetBindings()` — 自定义绑定 (chrome.storage.sync)
    52|  - `detectConflict()` — 冲突检测
    53|  - `formatBinding()` / `getShortcutsSummary()` — 格式化显示
    54|  - 5 个默认快捷键: 搜索 (Ctrl+F) / 放大 (=) / 缩小 (-) / 重置 (0) / 刷新 (F5)
    55|  - 纯 ES Module，回调驱动架构
    56|  - 测试: 48 用例 ✅
    57|
    58|- **R70: BookmarkDarkTheme 暗色主题** — `lib/bookmark-dark-theme.js`
    59|  - `constructor(mode)`: 接受 'light' | 'dark' | 'system' 模式，默认 'system'
    60|  - `getMode()` / `setMode(mode)` / `toggle()`: 模式管理
    61|  - `getTheme()`: 实际生效主题（解析 system 模式，matchMedia 检测）
    62|  - `getColors()` / `getGraphColors()` / `getPanelColors()`: 分层色板
    63|  - `getGroupColors()`: 15 色分组方案（明暗各一）
    64|  - `getCSSVariables()`: 18 个 CSS 变量覆盖全局/图谱/面板
    65|  - `onThemeChange(callback)`: 主题变更回调
    66|  - 纯 ES Module，不依赖 DOM/Chrome API
    67|  - 测试: 43 用例 ✅
    68|
    69|- **R68: BookmarkAIRecommendations AI 智能推荐** — `lib/bookmark-ai-recommender.js`
    70|  - `analyzeProfile(bookmarks[], context?)`: 纯本地收藏模式分析，生成结构化用户画像
    71|  - `getRecommendations(context?)`: AI 智能推荐（pattern/gap-filling/depth 三种类型）
    72|  - `clearCache()` / `getLastSource()`: 缓存管理与来源追踪
    73|  - 30 分钟 TTL 缓存，AI 不可用时自动降级到规则推荐
    74|  - Prompt 只含统计摘要（≤ 1500 tokens），保护用户隐私
    75|  - JSON 容错：支持 markdown 代码块包裹、字段校验、类型过滤
    76|  - 依赖反转：AIClient 通过构造函数注入，便于测试
    77|  - 测试: 36 用例 ✅
    78|
    79|- **R69: BookmarkStatistics 统计仪表盘** — `lib/bookmark-stats.js`
    80|  - `getTrend(granularity?)`: 按日/周/月聚合收藏趋势，ISO 8601 周算法
    81|  - `getDistribution()`: 按 folderPath[0] 分组的领域分布，含百分比
    82|  - `getHeatmap()`: 7×24 活跃度热力图矩阵 (Sun=0..Sat=6)
    83|  - `getSummary()`: 总览摘要（总数、独立域名、Top-5 文件夹、日均、连续天数 streak）
    84|  - 纯函数设计，不依赖 DOM/Chrome API
    85|  - UTC 一致性，空数组优雅降级
    86|  - 测试: 19 用例 ✅
    87|
    88|### 测试
    89|- **test-bookmark-ai-recommender.js** — `tests/test-bookmark-ai-recommender.js` — 36 用例
    90|  - 构造函数: 正常创建 / 缺少 aiClient 抛错 / 自定义 cacheTtl / 注入多依赖
    91|  - analyzeProfile: 完整画像 / 空书签零值 / topDomains 排序 / topCategories 比例
    92|  - readingProgress: 正确统计状态 / difficultyDistribution 分布
    93|  - 上下文: clusters / gapResult / 非数组抛错 / 性能 500 书签 < 50ms
    94|  - getRecommendations: AI 推荐 / 条目结构 / profile 快照
    95|  - 缓存: 缓存命中 / TTL 过期 / clearCache / getLastSource
    96|  - 降级: AI 不可用 / gap-filling 类型 / 网络错误
    97|  - JSON 容错: 非 JSON / markdown 包裹 / 缺字段 / 短 reason / 无效 type / 空数组
    98|  - 边界: 未调用 analyzeProfile / confidence 超范围 / summary 截断 / topics 截断
    99|
   100|---
   101|
   102|## [v2.5.0] - 2026-05-05 — BookmarkKnowledgeCorrelation 知识关联
   103|
   104|### 新增
   105|- **R66: BookmarkKnowledgeCorrelation 知识关联引擎** — `lib/bookmark-knowledge-link.js`
   106|  - `buildIndex(bookmarks[], entries[])`: 全量构建关联索引，多维关联度计算
   107|  - `addEntry(entry)`: 增量添加知识条目，实时更新关联缓存
   108|  - `removeEntry(entryId)`: 增量删除知识条目，清理关联缓存
   109|  - `getRelatedEntries(bookmarkId, opts?)`: 书签→知识条目关联查询
   110|  - `getRelatedBookmarks(entryId, opts?)`: 知识条目→书签关联查询（双向）
   111|  - `getCorrelationStrength(bookmarkId, entryId): { urlMatch, titleSimilarity, tagOverlap, total }` — 指定对关联强度详情
   112|  - `suggestCorrelations(opts?)`: 推荐未建立但高相似度的书签-条目对
   113|  - `getCorrelationSummary(bookmarkId)`: 书签关联摘要（条目列表/总数/平均分）
   114|  - `getStats()`: 统计信息（关联数/已关联书签/已关联条目/平均关联）
   115|  - 多维关联: URL 精确匹配 (0.4) + 标题 TF-IDF 语义相似 (0.3) + 标签 Jaccard 重叠 (0.3)
   116|  - URL 匹配分层: 精确 (1.0) > 路径包含 (0.7) > 同域名 (0.3)
   117|  - 复用 `EmbeddingEngine` TF-IDF 核心算法，纯 ES Module 零外部依赖
   118|  - 测试: 30 用例 ✅
   119|
   120|### 测试
   121|- **test-bookmark-knowledge-link.js** — `tests/test-bookmark-knowledge-link.js` — 30 用例
   122|  - 构造函数: 创建实例 / 默认引擎 / 自定义引擎
   123|  - buildIndex: 全量构建 / 空数组 / 重复构建
   124|  - getRelatedEntries: URL 匹配优先 / 无关联 / limit / 返回字段
   125|  - getRelatedBookmarks: 基本查询 / 无关联
   126|  - getCorrelationStrength: URL 匹配强度 / 不存在 / 分项得分
   127|  - addEntry/removeEntry: 增量添加 / 增量删除
   128|  - suggestCorrelations: 建议列表 / limit
   129|  - getCorrelationSummary: 摘要 / 不存在书签
   130|  - getStats: 统计完整 / 零值
   131|  - 综合关联度: URL+标签叠加 / 双向关联一致性
   132|  - 边界: 只有书签 / 只有条目 / 增量后可查 / 降序排序
   133|
   134|---
   135|
   136|## [v2.4.0] - 2026-05-05 — BookmarkSemanticSearch 语义搜索
   137|
   138|### 新增
   139|- **R65: BookmarkSemanticSearch 语义搜索引擎** — `lib/bookmark-semantic-search.js`
   140|  - `buildIndex(bookmarks[])`: 全量构建 TF-IDF 词汇表 + 文档向量，1000 条书签 < 5 秒
   141|  - `addBookmark(bookmark)`: 增量添加书签，更新词汇表和文档向量
   142|  - `removeBookmark(bookmarkId)`: 增量删除书签，减少文档频率
   143|  - `semanticSearch(query, opts?)`: 纯语义搜索，TF-IDF 余弦相似度排序，< 200ms
   144|  - `hybridSearch(query, opts?)`: 混合搜索（关键词 + 语义），默认权重 0.6:0.4
   145|  - `findSimilar(bookmarkId, limit?)`: 以文搜文，余弦相似度排序
   146|  - `invalidateCache(bookmarkId?)`: 缓存失效（单个/全部）
   147|  - `getStats()`: 索引统计（书签数/词汇表大小/文档数）
   148|  - `_mergeResults(keyword, semantic, ratio)`: 内部结果合并，支持归一化加权
   149|  - 书签域字段权重: title: 3.0, tags: 2.0, contentPreview: 1.5, folderPath: 1.0, url: 0.5
   150|  - 复用 `EmbeddingEngine` TF-IDF 核心算法，纯 ES Module 零外部依赖
   151|  - 排序策略: relevance / semantic-only / keyword-only
   152|  - 测试: 35 用例 ✅
   153|
   154|### 测试
   155|- **test-bookmark-semantic-search.js** — `tests/test-bookmark-semantic-search.js` — 35 用例
   156|  - 构造函数: 创建实例 / 默认引擎 / 自定义引擎
   157|  - buildIndex: 全量构建 / 空数组 / 重复构建
   158|  - 增量更新: addBookmark / removeBookmark / 不存在 ID
   159|  - semanticSearch: 基本搜索 / 空查询 / 降序排序 / limit
   160|  - hybridSearch: 合并结果 / 关键词优先 / 排序策略 / 空查询 / 无 BookmarkSearch / 默认权重
   161|  - findSimilar: 相似书签 / 排除自身 / 不存在 ID / limit / 降序排序
   162|  - invalidateCache: 单个 / 全部
   163|  - getStats: 统计 / 零值
   164|  - _mergeResults: 合并去重
   165|  - FIELD_WEIGHTS / 结果字段完整性 / 空库 / 增量生效 / 删除后不返回
   166|
   167|---
   168|
   169|## [v2.3.0] - 2026-05-05 — BookmarkContentPreview 书签内容预览
   170|
   171|### 新增
   172|- **R64: BookmarkContentPreview 书签内容预览** — `lib/bookmark-preview.js`
   173|  - `extractUrlInfo(url)`: 从 URL 提取域名/路径/协议/favicon 结构化信息
   174|  - `generateTextPreview(bookmark, opts)`: 纯文本预览（标题 + 域名 + 文件夹 + 标签 + 状态）
   175|  - `generateHtmlPreview(bookmark, opts)`: HTML 卡片预览，含 XSS 转义
   176|  - `generateSnapshotPreview(bookmark, snapshotContent, opts)`: 从页面快照生成内容摘要
   177|  - `_truncate(text, maxLen)`: 文本截断（字符数，中文兼容）
   178|  - `_escapeHtml(str)`: HTML 特殊字符转义 `< > & " '`
   179|  - 纯数据模块，无状态，无 I/O，性能 < 5ms
   180|  - 测试: 31 用例 ✅
   181|
   182|### 测试
   183|- **test-bookmark-preview.js** — `tests/test-bookmark-preview.js` — 31 用例
   184|  - extractUrlInfo: 正常 URL / 查询参数 / http 协议 / 无效 URL
   185|  - generateTextPreview: 完整 / 最小 / 空标题 / 截断 / 选项禁用 / null 输入
   186|  - generateHtmlPreview: 结构元素 / XSS 转义 / 安全 href / null 输入
   187|  - generateSnapshotPreview: 有快照 / 无快照 / 超长截断 / null 输入
   188|  - _truncate: 短文本 / 长文本 / 中文 / 非字符串 / 零值 / 恰好相等
   189|  - _escapeHtml: script 标签 / 引号 / & 符号 / 无特殊字符 / 非字符串
   190|
   191|---
   192|
   193|## [v2.2.1] - 2026-05-04 — BookmarkGraph Phase 1 核心功能修复
   194|
   195|### 修复
   196|- **R1: render/init 顺序修复** — `options/options.js`
   197|  - `createTabManager`: 先调用 `markLoading()` → `render()` 显示加载动画，再 `init()` 异步初始化，完成后自动重新 `render()`
   198|  - 修复点击图谱标签页后显示"暂无书签"空白页的根本原因
   199|- **R2: BookmarkCollector 错误处理** — `lib/bookmark-collector.js`
   200|  - `chrome.bookmarks` API 不存在时返回空数组 + `console.warn` (非扩展环境安全降级)
   201|  - `getTree()` 失败时返回空数组 + `console.warn` (不再抛出异常)
   202|- **R3: 加载状态 spinner** — `options/bookmark-panel.js`
   203|  - 新增 `markLoading()` 方法供外部标记加载状态
   204|  - 新增 `_renderLoadingSpinner()` 创建带 `role=status` 的加载动画元素
   205|  - `refresh()` 方法先渲染加载状态再异步初始化
   206|- **R4: 错误状态重试** — `options/bookmark-panel.js`
   207|  - `_renderError()` 添加重试按钮，点击调用 `refresh()` 重新加载
   208|- **R5: 空状态引导** — `options/bookmark-panel.js`
   209|  - `_renderEmpty()` 显示引导信息 (Ctrl+D 收藏、右键添加等) + 刷新书签按钮
   210|
   211|### 测试
   212|- **R6-R10: 集成测试** — `tests/test-bookmark-panel-integration.js` — 18 用例 ✅
   213|  - R1: render/init 顺序 (markLoading → render → init → re-render)
   214|  - R2: BookmarkCollector 错误处理 (API 不存在、采集失败)
   215|  - R3: 加载状态 spinner (render loading、spinner 属性、降级)
   216|  - R4: 错误状态重试 (重试按钮、click 事件绑定)
   217|  - R5: 空状态引导 (引导信息、刷新按钮、Ctrl+D 提示)
   218|  - R6-R10: 完整流程 (加载→图谱→节点→详情→搜索→refresh→错误重试)
   219|- 更新 `tests/test-bookmark-collector.js` — 测试 14/14b 适配 R2 新行为
   220|- 更新 `tests/test-bookmark-options-tab.js` — `buildTabManager` 同步生产代码流程
   221|- 更新 `tests/test-bookmark-panel.js` — mock DOM 增强 textContent 递归拼接
   222|- 全量测试: 66 用例通过，0 失败
   223|
   224|---
   225|
   226|## [v2.2.0] - 2026-05-04 — BookmarkGraph 书签知识图谱
   227|
   228|### 新增
   229|- **R63: BookmarkLinkChecker 链接健康检查（飞轮迭代 R3）**
   230|  - `lib/bookmark-link-checker.js`: 批量检测书签链接有效性 — 310 行
   231|  - 功能: 并发控制(1-10)、域名限流(QPS≤2)、HEAD→GET 回退、进度回调、cancel()中断
   232|  - 状态判定: alive(2xx)/dead(4xx/5xx/timeout)/redirect(3xx)/unknown(非HTTP/无效URL)
   233|  - 测试: `tests/test-bookmark-link-checker-e2e.js` — 27 用例 ✅
   234|  - 覆盖: AC-1~AC-5 全部验收标准 + 边界条件 + 并发控制 + 网络错误
   235|  - 评分: Guard 91.15/100 通过
   236|- **R52: BookmarkGraph MVP E2E 测试（飞轮迭代 R2 验证）**
   237|  - `tests/test-bookmark-graph-e2e.js`: MVP 全模块集成测试 — 14 用例 ✅
   238|  - 覆盖: 采集→索引→图谱→搜索→推荐 完整链路
   239|  - 边界: 空书签、单书签、100+书签性能 (<200ms)
   240|  - 交互: 增量索引、多关键词搜索、详情面板切换
   241|- **R62: BookmarkGraph V1.0 E2E 测试（飞轮迭代 R2 验证）**
   242|  - `tests/test-bookmark-v1-e2e.js`: Phase B 全模块集成测试 — 15 用例 ✅
   243|  - 覆盖: 聚类→学习路径、标签→编辑、状态→过滤、去重→清理、导入导出
   244|  - 模块联动: 聚类→盲区、标签→频率、状态→进度、文件夹→聚类、去重→导出
   245|
   246|- **R51: 选项页集成 BookmarkOptionsPage（迭代 #51）**
   247|  - `options/options.html`: 新增 Tab 导航结构 (设置 / 书签图谱) + `<div id="bookmark-panel">` 容器
   248|  - `options/options.js`: 新增 `createTabManager()` — Tab 切换 + BookmarkPanel 生命周期管理 (懒初始化、destroy 释放、hash 路由)
   249|  - `options/options.css`: 新增 Tab 导航样式 + 图谱三栏布局样式 (`grid: 240px 1fr 280px`)
   250|  - `options/bookmark-panel.js`: 已有 BookmarkPanel 类，无需修改
   251|  - Tab 切换逻辑: 设置 Tab → 图谱 Tab 时调用 `panel.render()` + `panel.init()`，离开时调用 `panel.destroy()` 释放 Canvas 和事件监听器
   252|  - 支持 hash 路由 `#tab=bookmark` 直接跳转图谱标签页 (供 Popup "查看完整图谱" 按钮使用)
   253|  - 设置标签页保持原有 `max-width: 640px` 居中布局，图谱标签页全宽
   254|  - 13 个测试用例 ✅
   255|
   256|- **R61: BookmarkImportExport 数据导入导出（迭代 #61）**
   257|  - `lib/bookmark-io.js`: BookmarkImportExport 类 — 书签数据导入导出
   258|  - `exportJSON()`: 导出完整图谱数据 (书签+聚类+标签+状态) 为 JSON 字符串
   259|  - `exportCSV()`: 导出书签列表为 CSV 字符串 (含表头，支持中文文件夹路径)
   260|  - `importFromChromeHTML(html)`: 解析 Chrome 书签 HTML 文件，提取书签+文件夹层级+时间戳
   261|  - `importFromJSON(json)`: 从 JSON 字符串导入完整图谱数据
   262|  - `exportToFile(format)`: 导出为 Blob ('json' | 'csv')
   263|  - 进度回调: onProgress(phase, current, total) 支持所有导入导出操作
   264|  - CSV 特殊字符转义: 逗号/双引号/换行符自动包裹
   265|  - 24 个测试用例 ✅
   266|- **R60: BookmarkDedup 重复检测（迭代 #60）**
   267|  - `lib/bookmark-dedup.js`: BookmarkDedup 类 — 检测和处理重复书签
   268|  - `normalizeUrl(url)`: 静态方法 — URL 规范化 (移除协议/www/尾斜杠/跟踪参数/转小写)
   269|  - `titleSimilarity(a, b)`: 静态方法 — Jaccard 系数标题相似度 (0-1)
   270|  - `findByExactUrl()`: 按规范化 URL 精确匹配分组
   271|  - `findBySimilarTitle(threshold)`: 按标题相似度分组 (默认阈值 0.7, union-find 聚类)
   272|  - `findDuplicates()`: 综合检测 (URL 精确 + 标题相似)
   273|  - `suggestCleanup()`: 生成 remove/merge 清理建议
   274|  - `batchRemove(bookmarkIds)`: 批量清理重复书签
   275|  - 36 个测试用例 ✅
   276|- **R59: BookmarkFolderAnalyzer 文件夹分析（迭代 #59）**
   277|  - `lib/bookmark-folder-analyzer.js`: BookmarkFolderAnalyzer 类 — 分析书签文件夹结构
   278|  - `analyzeFolders()`: 分析所有文件夹，返回路径/数量/深度/质量/建议
   279|  - `getEmptyFolders()`: 获取空文件夹列表
   280|  - `getOvercrowdedFolders(threshold)`: 获取过度拥挤的文件夹（默认 >50）
   281|  - `getUnderusedFolders(threshold)`: 获取使用不足的文件夹（默认 <3）
   282|  - `getFolderTree()`: 返回文件夹树形结构（name/children/count）
   283|  - `suggestReorganization()`: 生成整理建议（delete/merge/split）
   284|  - `getMaxDepth()`: 获取最大文件夹深度
   285|  - 质量评估 5 级: excellent(5-30) / normal(3-4) / underused(<3) / overcrowded(>50) / empty(0)
   286|  - 20 个测试用例 ✅
   287|
   288|- **R58: BookmarkStatusManager 状态标记（迭代 #58）**
   289|  - `lib/bookmark-status.js`: BookmarkStatusManager 类 — 管理书签阅读状态
   290|  - 三种状态: unread / reading / read，默认 unread
   291|  - `setStatus(bookmarkId, status)`: 设置单个书签状态，返回 boolean
   292|  - `getStatus(bookmarkId)`: 获取状态，未知 ID 返回 null
   293|  - `batchSetStatus(bookmarkIds, status)`: 批量设置状态，返回成功数量
   294|  - `getByStatus(status)`: 按状态过滤书签数组
   295|  - `getStatusCounts()`: 返回 {unread, reading, read} 统计
   296|  - `markAllAsRead(bookmarkIds)`: 批量标记已读
   297|  - `getRecentlyRead(limit)`: 获取最近阅读书签（单调递增序保证排序稳定）
   298|  - 数字 ID 自动转字符串兼容
   299|  - 19 个测试用例 ✅
   300|
   301|- **R57: BookmarkGapDetector 知识盲区检测（迭代 #57）**
   302|  - `lib/bookmark-gap-detector.js`: BookmarkGapDetector 类 — 检测用户知识盲区和薄弱领域
   303|  - 14 个技术领域目录（前端/后端/数据库/DevOps/AI-ML/移动开发/安全/云服务/数据/测试/设计/工具/架构/性能）
   304|  - 覆盖度 4 级: well-covered(≥10) / moderate(3-9) / weak(1-2) / gap(0)
   305|  - `detectGaps()`: 检测所有领域的盲区、弱项，返回描述和推荐
   306|  - `getDomainCoverage()`: 各领域覆盖度分布（count/percentage/level），按数量降序
   307|  - `getRecommendations(limit)`: 知识补充推荐，盲区优先，考虑关联领域
   308|  - `getStrengths()`: 强项领域 (well-covered)，按数量降序
   309|  - `getWeaknesses()`: 弱项领域 (weak + gap)，按数量升序
   310|  - `generateReport()`: 完整报告（summary/strengths/weaknesses/recommendations）
   311|  - 推荐逻辑: 盲区推荐入门主题 + 关联领域提示，弱项推荐进阶主题
   312|  - 支持聚类结果和标签频率两种数据源，聚类优先
   313|  - `tests/test-bookmark-gap-detector.js`: 27 个测试用例，全部通过
   314|
   315|- **R56: BookmarkTagEditor 标签手动编辑（迭代 #56）**
   316|  - `lib/bookmark-tag-editor.js`: BookmarkTagEditor 类 — 手动管理书签标签
   317|  - 单书签标签编辑: `addTag()`, `removeTag()`, `setTags()`, `getTags()`
   318|  - 标签规范化: 小写、去首尾空格、连续空格→连字符、移除特殊字符、最大 30 字符
   319|  - 标签自动补全: `getAutocomplete(partial, limit)` — 基于已有标签库前缀匹配
   320|  - 批量编辑: `batchAddTag()`, `batchRemoveTag()` — 多书签同时操作，返回成功数量
   321|  - 全局标签查询: `getAllTags()` — 去重排序的标签列表
   322|  - 测试: 30 用例 ✅
   323|- **R55: BookmarkTagger 标签自动生成（迭代 #55）**
   324|  - `lib/bookmark-tagger.js`: BookmarkTagger 类 — 基于标题/URL/文件夹路径自动生成 3-5 个标签
   325|  - 域名标签提取: 已知域名 (github.com → "github") + 主域名解析
   326|  - URL 路径分词: 从路径段提取有意义的关键词
   327|  - 标题分词: 空格/标点分割 + 英文停用词过滤
   328|  - 技术关键词识别: 内置 150+ 技术关键词集合（语言/框架/工具/云平台/AI/ML 等）
   329|  - 中文标签: 2-4 字中文词组提取 + 中文停用词过滤
   330|  - `generateTags(bookmark)`: 单书签标签生成 (1-5 tags)
   331|  - `generateAllTags()`: 全量标签生成 Map<bookmarkId, string[]>
   332|  - `getTagFrequency()`: 全局标签频率统计
   333|  - `getPopularTags(limit)`: 热门标签排行（降序）
   334|  - `mergeTags(oldTag, newTag)`: 标签合并，返回受影响书签数
   335|  - `getBookmarksByTag(tag)`: 按标签反查书签
   336|  - `tests/test-bookmark-tagger.js`: 21 个测试用例，全部通过
   337|
   338|- **R54: BookmarkLearningPath 学习路径推荐（迭代 #54）**
   339|  - `lib/bookmark-learning-path.js`: BookmarkLearningPath 类 — 基于书签内容和聚类结果自动生成分阶段学习路径
   340|  - 难度判断 `judgeDifficulty()`: 入门/进阶/高级三级，覆盖中英文关键词 + URL 匹配
   341|  - 4 阶段学习路径: 基础入门 → 实战练习 → 深入理解 → 生产实践，按 dateAdded 排序
   342|  - `generatePath(category)`: 单分类学习路径，每书签只出现在一个阶段
   343|  - `getAllPaths()`: 所有分类路径 Map，带惰性缓存
   344|  - `markAsRead/markAsUnread`: 已读/未读状态切换，自动清除路径缓存
   345|  - `getProgress(category)`: 分类进度统计 (total/read/percent)
   346|  - `getOverallProgress()`: 整体进度 + 分类明细
   347|  - `tests/test-bookmark-learning-path.js`: 21 个测试用例，全部通过
   348|
   349|- **R53: BookmarkClusterer 主题聚类引擎（迭代 #53）**
   350|  - `lib/bookmark-clusterer.js`: BookmarkClusterer 类 — 基于关键词/URL模式自动分类书签到技术领域
   351|  - 内置 14 个技术领域分类规则 + "其他"兜底（前端/后端/数据库/DevOps/AI-ML/移动开发/安全/云服务/数据/测试/设计/工具/架构/性能）
   352|  - `cluster()`: Map<category, Bookmark[]> 聚类结果
   353|  - `getCategories()`: 分类概览列表 (name/count/keywords)
   354|  - `moveBookmark(bookmarkId, from, to)`: 手动移动书签到指定分类
   355|  - `mergeCategories(cat1, cat2, name)`: 合并两个分类
   356|  - `getCategoryForBookmark(id)`: 查询书签所属分类
   357|  - 支持中文关键词匹配，域名匹配权重 > 关键词权重
   358|  - `tests/test-bookmark-clusterer.js`: 21 个测试用例，全部通过
   359|
   360|- **R43: BookmarkCollector 书签采集器（迭代 #43）**
   361|  - `lib/bookmark-collector.js`: BookmarkCollector 类 — 递归读取 Chrome 书签树
   362|  - `collect()`: 标准化书签数组 (id/title/url/folderPath/dateAdded/dateAddedISO)
   363|  - `normalize()`: BookmarkTreeNode → 标准格式
   364|  - `getStats()`: 统计信息 (总数/文件夹数/领域分布)
   365|  - 处理: 空书签树/重复书签(同URL不同文件夹)/特殊字符标题/1000+书签性能
   366|  - `tests/test-bookmark-collector.js`: 18 个测试用例，全部通过
   367|
   368|- **R42: Skill Engine + Custom Skills E2E 测试（迭代 #42）**
   369|  - `tests/test-skill-engine-e2e.js`: 23 个 E2E 测试用例，8 个 suite
   370|  - 覆盖: 技能加载→注册→执行完整流程、CRUD 生命周期+引擎同步、参数传递+模板渲染、触发匹配+执行、容量上限(20)、Hook 集成、分类+批量操作、错误处理
   371|  - 发现: saveSkill 不持久化 parameters 字段（设计决策，非 bug）— 参数通过 toEngineSkill 桥接层注入
   372|  - 全套测试 2111 通过（+23 新增），0 失败
   373|
   374|### 修复
   375|- **R41: TODO.md 同步修复** — R36-R40 已完成但 TODO.md 未标记，现已修正
   376|
   377|- **R41: PDF Extractor E2E 测试（迭代 #41）**
   378|  - `tests/test-pdf-extractor-e2e.js`: 19 个 E2E 测试用例，使用真实 PdfExtractor（非 mock）
   379|  - 覆盖: extractText 返回结构验证、单页/多页 PDF、元数据提取、错误处理（null/空/非PDF）、extractFromUrl mock fetch、HTTP 错误、网络错误
   380|  - `lib/pdf.worker.mjs`: 符号链接到 pdf.worker.min.mjs（pdf.js worker 路径修复）
   381|  - `docs/ISSUES.md`: 设计问题追踪文档
   382|
   383|### 修复
   384|- **R40: Page Sense E2E 测试修复** — analyze() API 使用修正（对象参数 vs 位置参数）
   385|
   386|### 新增
   387|- **R35: 统一错误处理集成 + _locales 国际化基础（迭代 #35）**
   388|  - `lib/ai-client.js`: 所有错误附带 `.classified` 属性（ErrorType 分类）
   389|  - `lib/knowledge-base.js`: IndexedDB 操作错误使用 `classifyStorageError()` 分类
   390|  - `background/service-worker.js`: 全局错误捕获（self.onerror + unhandledrejection）
   391|  - `_locales/en/messages.json`: 英文 locale（Chrome Web Store 准备）
   392|  - `_locales/zh_CN/messages.json`: 中文 locale
   393|
   394|- **L1.2 实体/概念自动提取（迭代 #21）** — 导出时用 AI 自动识别 Q&A 中提到的实体和概念
   395|  - `lib/entity-extractor.js`: 实体/概念自动提取模块
   396|  - `extractEntities(entries, aiClient)`: 从 Q&A 条目中使用 AI 提取实体（人名、工具、框架、API 等）和概念（技术概念、设计模式、方法论）
   397|  - `generateEntityMarkdown(entity)`: 生成实体页 Markdown（含 YAML frontmatter、概述、相关 Q&A 列表、关联实体）
   398|  - `generateConceptMarkdown(concept)`: 生成概念页 Markdown（含 YAML frontmatter、概述、相关 Q&A、关联技术）
   399|  - `buildEntityIndex(entities, concepts)`: 生成实体/概念索引 Markdown（按类型分组）
   400|  - 支持批量处理（大知识库分批调用 AI）和同名去重合并
   401|  - Wikilink 格式 `[[name]]` 预留 L1.3 交叉引用
   402|  - 22 个单元测试覆盖全部核心逻辑
   403|
   404|### 变更
   405|- `lib/entity-extractor.js` — 新增模块，纯 ES Module，不依赖 IndexedDB 或 Chrome API
   406|
   407|- **PDF 提取引擎增强（迭代 #8）** — 引入 pdf.js 提升 PDF 文本提取可靠性
   408|  - `lib/pdf-extractor.js`: PDF 文本提取器模块（PdfExtractor 类）
   409|  - 使用 pdf.js v3.11.174 (ES Module) 进行可靠 PDF 解析
   410|  - `extractText(arrayBuffer)`: 从 ArrayBuffer 提取全文 + 元数据
   411|  - `extractFromUrl(url)`: 通过 URL 获取并提取
   412|  - background service worker 新增 `extractPdfViaJs` 消息处理
   413|  - content script 自动 fallback: DOM 提取失败时调用 pdf.js
   414|  - manifest.json 新增 `web_accessible_resources` 暴露 pdf.js 文件
   415|  - 9 个单元测试覆盖核心逻辑
   416|
   417|### 变更
   418|- `content/content.js` — extractPdfContent 消息处理增加 pdf.js fallback 路径
   419|- `sidebar/sidebar.js` — PDF 提取结果显示页数信息
   420|- `manifest.json` — 新增 web_accessible_resources 配置
   421|
   422|## [1.3.0] - 2026-04-30
   423|
   424|### 新增
   425|- **AI 响应缓存（迭代 #5）** — 避免对相同请求重复调用 AI API，节省费用并降低延迟
   426|  - `AICache` 类: 纯内存 LRU 缓存（FNV-1a 哈希键、TTL 过期、LRU 淘汰、统计计数）
   427|  - `generateCacheKey()`: 基于 model + messages + systemPrompt + maxTokens + protocol 生成 32 位哈希键
   428|  - 图片消息自动跳过缓存（图片 URL 不稳定且数据量大）
   429|  - `AIClient.cachedChat()`: 带缓存的非流式调用，返回 `{ fromCache: boolean }`
   430|  - `AIClient.cachedChatStream()`: 带缓存的流式调用，命中时一次性 yield 缓存内容
   431|  - `sendMessage()` 集成: 自动使用缓存，命中时显示 `⚡ 缓存命中` 徽章
   432|  - 默认配置: 最多 50 条缓存，30 分钟 TTL
   433|  - 43 个单元测试覆盖全部核心逻辑
   434|
   435|### 变更
   436|- `sidebar/sidebar.js` — `chatStream()` 替换为 `cachedChatStream()`，集成 AICache
   437|- `sidebar/sidebar.css` — 新增 `.pw-cache-badge` 缓存命中徽章样式
   438|
   439|### 新增
   440|- **R012: 页面高亮关联** — AI 回答中的引用文本（行内代码、引用块）可点击跳转，在页面中高亮并定位到原文位置
   441|  - `_injectQuoteAttributes()`: 渲染后扫描 `<code>`（行内）和 `<blockquote>` 元素，注入 `data-quote` 属性和可点击样式
   442|  - `flashHighlight()`: 在页面中查找文本并创建临时高亮，3 秒后自动淡出并移除 DOM 元素
   443|  - `clearFlashHighlights()`: 清除所有临时高亮，确保同一时刻最多只有一个临时高亮存活
   444|  - `locateAndHighlight` 消息协议: content script 新增 action，支持引用跳转定位
   445|  - CSS 类 `pw-flash-highlight`（临时高亮样式，含淡出动画）和 `pw-quote-link`（可点击引用样式）
   446|  - 引用文本截取策略: 行内代码完整匹配，blockquote 截取前 200 字符
   447|  - 34 个单元测试覆盖全部核心逻辑
   448|
   449|### 变更
   450|- `content/content.css` — 新增 `.pw-flash-highlight` 和 `.pw-flash-highlight--fading` 样式
   451|- `sidebar/sidebar.css` — 新增 `.pw-quote-link` 可点击引用样式
   452|- `content/content.js` — 新增 `flashHighlight()`、`clearFlashHighlights()` 函数和 `locateAndHighlight` action
   453|- `lib/message-renderer.js` — 新增 `_injectQuoteAttributes()` 和 `_sendLocateAndHighlight()` 方法
   454|
   455|---
   456|
   457|## [1.1.1] - 2026-04-28
   458|
   459|### 修复
   460|- **Claude API 请求 403 错误** — `buildClaudeRequest` 缺少 `anthropic-dangerous-direct-browser-access: true` header，导致所有 Claude API 调用被拒绝。现已添加该 header，Claude 协议的 AI 问答和测试连接功能恢复正常。
   461|- **侧边栏初始化崩溃** — `init()` 中 IndexedDB 操作（memory.init、loadCustomSkills）失败时会杀死整个初始化链，导致侧边栏空白无响应。现在每个关键步骤都有独立的 try-catch，单个模块失败不影响其他功能。
   462|
   463|---
   464|
   465|## [1.0.0] - 2026-04-25
   466|
   467|### 新增
   468|- 页面内容提取（Reader Mode 策略）
   469|- AI 问答（流式输出、多轮对话）
   470|- 知识库存储（IndexedDB）
   471|- 知识检索（全文搜索、标签筛选）
   472|- 数据导出（Markdown / JSON）
   473|- 技能系统（7 个内置技能）
   474|- 页面感知（6 种页面类型识别）
   475|- 记忆系统（用户画像、知识召回）
   476|- 自进化（隐式反馈、风格自适应)
   477|- 右键菜单「用 智阅 提问」
   478|- 数据导入（JSON / Markdown / 纯文本）
   479|
   480|---
   481|
   482|## [1.1.0] - 2026-04-27
   483|
   484|### 新增
   485|- 对话持久化（chrome.storage.session，24 小时自动过期）
   486|- `/clear` 命令清除对话历史
   487|- 代码块复制按钮（hover 显示，点击复制并反馈）
   488|- Toast 通知系统（info/success/error/warning，动画滑入淡出）
   489|- 对话持久化测试（9 个测试）
   490|- renderMarkdown 代码块复制按钮测试（2 个测试）
   491|- **总计 106 个测试，全部通过**
   492|
   493|---
   494|
   495|### 新增
   496|- 项目飞轮迭代模板（CLAUDE.md、docs/）
   497|- **对话分支**：从 AI 回答的任意节点分叉，探索不同提问方向
   498|  - 每条 AI 回答新增「🔀 分支」按钮
   499|  - 分支信息条显示当前分支来源问题
   500|  - 「↩️ 返回主对话」按钮快速切换回主线
   501|