# 迭代 #4 需求文档 — 知识库性能优化（索引、分页）

> 最后更新: 2026-04-30
> 需求来源: TODO.md「知识库性能优化（索引、分页）」+ 竞品分析 MARKET-ANALYSIS.md
> 前序迭代: 飞轮 R1-R3（错误处理/JSDoc/ESLint）
> 产品背景: PageWise 的核心差异化是「本地知识库 + AI 理解闭环」（MARKET-ANALYSIS §四），知识库性能直接决定这一护城河的可用性

---

## 需求概览

| ID | 需求 | 优先级 | 涉及文件 |
|----|------|--------|----------|
| PERF-1 | 列表页按需分页加载（替代全量加载） | P0 | lib/knowledge-panel.js, sidebar/sidebar.js |
| PERF-2 | 搜索路径优化（索引预热、缓存策略升级） | P0 | lib/knowledge-base.js |
| PERF-3 | 内存管理 — 大数据集下内存不溢出 | P1 | lib/knowledge-base.js, lib/knowledge-panel.js |
| PERF-4 | IDB 查询路径优化（批量按需读取、键游标分页） | P1 | lib/knowledge-base.js |

---

## 1. 用户故事

**S-1 (列表浏览)**: 作为一名积累了 500+ 条知识的技术人员，我希望打开知识库面板时页面立即显示前 10 条，滚动时无缝加载更多，而不是等待全部条目加载完毕后才看到内容。

**S-2 (搜索)**: 作为一名在知识库中搜索关键词的用户，我希望搜索结果在 300ms 内呈现，并且输入过程中不会因重复查询而卡顿，让我能快速找到想要的知识条目。

**S-3 (内存)**: 作为一名长期使用 PageWise 的用户，我希望知识库增长到 1000+ 条时，侧边栏依然流畅不卡顿，不因为知识积累多而影响日常使用体验。

**S-4 (标签筛选)**: 作为一名通过标签分类知识的用户，我希望点击某个标签时能快速过滤列表，且标签面板的统计数据随时与实际数据保持一致，不会出现已删除标签仍然显示的情况。

---

## 2. 验收标准

### AC-1: 列表首屏加载 ≤ 200ms（500 条数据场景）
- **Given** 知识库中有 500 条记录
- **When** 用户切换到知识库标签页
- **Then** 首屏 10 条条目在 200ms 内渲染完成，用户可立即浏览；后续条目按需加载（每滚动到底部加载下一批），整体无明显白屏等待

### AC-2: 搜索响应 ≤ 300ms（1000 条数据场景）
- **Given** 知识库中有 1000 条记录，倒排索引已预热
- **When** 用户在搜索框输入关键词并触发搜索（debounce 后）
- **Then** 搜索结果在 300ms 内返回并渲染；重复搜索同一关键词命中 LRU 缓存，响应 ≤ 50ms

### AC-3: 内存占用可控 — 索引不全量持有条目副本
- **Given** 知识库中有 1000+ 条记录
- **When** 倒排索引和 N-gram 索引完成构建
- **Then** 索引仅存储 `entry_id → Set<word>` 映射，不持有完整条目对象副本；按需通过 ID 从 IndexedDB 检索条目内容；标签/分类/语言统计缓存在数据变更时正确失效并重建

### AC-4: 虚拟滚动 + 分页协同 — DOM 节点数量恒定
- **Given** 知识库中有 1000 条记录
- **When** 用户滚动知识列表
- **Then** DOM 中 `.knowledge-item` 节点数量始终 ≤ 可视区域 + 缓冲区（约 15-20 个），不因数据量增长而增加；滚动帧率 ≥ 30fps

### AC-5: 去重与关联查询不退化
- **Given** 知识库中有 500 条记录
- **When** 保存新条目触发 `findDuplicate()` 或查看条目详情触发 `findRelatedEntries()`
- **Then** 去重查重性能不低于当前水平（当前全量扫描 500 条 < 50ms）；关联查询在 500 条内 ≤ 100ms；1000 条内 ≤ 200ms

---

## 3. 技术约束

### 3.1 现有代码基础 — 需要优化的瓶颈点

通过代码审查（2026-04-30），识别出以下具体性能瓶颈：

| 瓶颈 | 位置 | 问题 |
|------|------|------|
| **全量加载（UI 层）** | `KnowledgePanel.loadKnowledgeList()` knowledge-panel.js L124 | 调用 `getAllEntries(10000)` 一次性将所有条目加载到内存，再客户端做标签/语言过滤；已有 `getEntriesPaged()` 和 `getEntriesPagedByKey()` 但 UI 层未使用 |
| **搜索后全量切片** | `KnowledgeBase.searchPaged()` knowledge-base.js L873 | 先执行 `search()` 获取全部结果，再 `slice()` 分页，搜索阶段未利用分页 |
| **去重全量扫描** | `KnowledgeBase.findDuplicate()` knowledge-base.js L139 | 索引未构建时回退 `getAllEntries(10000)` 全量扫描；索引构建后利用索引缩小范围，但候选集仍需从 IDB 逐 cursor 遍历 |
| **关联全量扫描** | `KnowledgeBase.findRelatedEntries()` knowledge-base.js L1203 | 索引未构建时全量扫描；索引构建后虽缩小候选范围，但仍对所有候选条目逐条计算 bigram 余弦相似度 |
| **`_getEntriesByIds()` 低效扫描** | knowledge-base.js L555 | 使用 `openCursor()` 遍历整个对象存储来查找指定 ID 的条目，应改为对每个 ID 调用 `store.get(id)` 或使用 IDBKeyRange 批量查询 |
| **`getAggregations()` 未使用缓存** | knowledge-base.js L611 | 每次调用都重新从 IDB 加载全量条目并遍历聚合，不像 `getAllTags()`/`getAllCategories()`/`getAllLanguages()` 有独立缓存 |

### 3.2 现有可复用的基础

| 已有能力 | 位置 | 说明 |
|---------|------|------|
| `getEntriesPaged()` | knowledge-base.js L374 | 已实现基于 cursor + offset 的分页查询，返回 `{ entries, total, page, totalPages }`，但 UI 层未使用 |
| `getEntriesPagedByKey()` | knowledge-base.js L658 | 已实现高效键游标分页（避免 O(offset) 跳过），使用 `lastCreatedAt` + `lastId` 作为游标键，但 UI 层未使用 |
| `getTotalCount()` | knowledge-base.js L349 | 已实现 `IDBObjectStore.count()` + 缓存，可复用 |
| LRU 搜索缓存 | knowledge-base.js `_searchCache` | Map, 最大 10 条，已实现 LRU 淘汰策略，可复用并扩展 |
| 倒排索引 + N-gram 索引 | knowledge-base.js L473 | 已惰性构建；`_addToIndex()` L488 已实现 ID-only 存储（`_indexWordsById` 持有 `Set<word>`，不持有完整条目），可直接复用 |
| 虚拟滚动 | knowledge-panel.js L182 | `_initVirtualScroll()` 已实现 IntersectionObserver + spacer 元素机制，但依赖 `_allFilteredEntries`（全量数据在内存） |
| 索引增量维护 | knowledge-base.js L221, L257, L281 | `saveEntry`/`updateEntry`/`deleteEntry` 均已实现 `_addToIndex()`/`_removeFromIndex()`，无需重新构建 |

### 3.3 性能指标

| 指标 | 当前（估测） | 目标 |
|------|-------------|------|
| 500 条首屏渲染 | ~800ms（全量加载 10000 条上限） | ≤ 200ms |
| 1000 条搜索 | ~500ms（含全量切片开销） | ≤ 300ms |
| 索引内存（1000 条） | 索引本身 ~8MB（ID-only）；UI 层全量加载 ~7MB | 索引 ≤ 8MB；UI 峰值 ≤ 2MB（仅可视区域） |
| 滚动帧率（1000 条） | ~20fps（虚拟滚动依赖全量数据） | ≥ 30fps |
| 索引首次构建（1000 条） | ~1s | ≤ 800ms |
| 标签筛选切换 | ~300ms（全量加载 + 客户端过滤） | ≤ 100ms |

### 3.4 约束条件

- **不引入外部依赖**: 不引入 Dexie.js、Lunr.js 等第三方库
- **IndexedDB 版本不变**: `dbVersion` 保持为 1，不触发 `onupgradeneeded`（现有索引 `sourceUrl`/`createdAt`/`tags`/`category` 已满足需求）
- **API 向后兼容**: `KnowledgeBase` 的公开方法签名（`search`, `getAllEntries`, `saveEntry`, `deleteEntry`, `getEntriesPaged`, `searchPaged` 等）不改变返回类型，内部实现优化
- **不引入构建工具**: 保持 Chrome 直接加载 ES Modules 的方式
- **Service Worker 生命周期**: 索引构建需考虑 Service Worker 可能被终止后重建的场景；索引预热不应阻塞其他功能的初始化

---

## 4. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| `lib/knowledge-base.js` | **强依赖** | 核心优化对象：索引构建路径、IDB 查询优化、缓存策略 |
| `lib/knowledge-panel.js` | **强依赖** | UI 层改造：虚拟滚动对接按需分页 API，替代全量加载 |
| `sidebar/sidebar.js` | **弱依赖** | 知识库 tab 切换时调用 `loadKnowledgeList()`，需适配新 API |
| `lib/utils.js` | **弱依赖** | `debounce`/`throttle` 已有实现，搜索优化可直接使用 |
| 飞轮 R1 (错误处理) | 前置 ✅ | 已完成，确保错误处理模式一致 |
| 飞轮 R2 (JSDoc) | 前置 ✅ | 已完成，新增/修改函数需补充 JSDoc |
| 飞轮 R3 (ESLint) | 前置 ✅ | 已完成，代码风格基线已建立 |
| R003: 知识库存储 | 参考 | 数据模型定义（entries 表结构）不变 |
| R004: 知识检索 | 参考 | 搜索功能接口不变，内部优化 |
| R008: 记忆系统 | 参考 | `MemorySystem` 代理 `KnowledgeBase`，`memory.getAllEntries()` 调用链需审查 |
| R012: 页面高亮关联 | 无关 | 不影响本次优化 |

---

## 5. 术语表

| 术语 | 定义 |
|------|------|
| 倒排索引 (Inverted Index) | `Map<word, Set<entry_id>>` 结构，通过词快速定位包含该词的条目 ID |
| N-gram 索引 | `Map<ngram, Set<entry_id>>` 结构，支持子串匹配的补充索引 |
| 索引预热 (Index Warm-up) | 在知识库初始化时主动构建索引，而非等到首次搜索时惰性构建 |
| LRU 缓存 | Least Recently Used 缓存策略，淘汰最久未使用的条目 |
| 虚拟滚动 | 只渲染可视区域内的 DOM 节点，通过 spacer 元素模拟完整滚动高度 |
| Cursor-based 分页 | IndexedDB 使用 IDBCursor 逐条遍历，跳过 offset 条后取 pageSize 条 |
| 键游标分页 (Key Cursor Paging) | 使用 `IDBKeyRange` 跳转到上次最后条目的 key 位置，避免 O(offset) 跳过开销 |

---

## 6. 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-04-30 | 初始化知识库性能优化需求文档 |
| 2026-04-30 | 补充 PERF-4（IDB 查询路径优化）；修正瓶颈位置行号；新增 S-4（标签筛选用户故事）；补充可复用基础细节；补充术语「键游标分页」 |
