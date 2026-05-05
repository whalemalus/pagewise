# R65: 语义搜索 BookmarkSemanticSearch — 需求文档

> 迭代: R65
> 日期: 2026-05-05
> 复杂度: High (新模块 + 现有模块改造)

---

## 一、背景与动机

### 现状

当前 `BookmarkSearch` 是纯关键词搜索引擎：倒排索引精确匹配 + 图谱拓扑扩展。用户必须输入与书签标题/URL/标签**字面一致**的关键词才能命中。

`EmbeddingEngine` (迭代 #7) 已在知识库 (`KnowledgeBase`) 上验证了 TF-IDF 语义搜索的可行性，但该能力**未延伸到书签域**。

### 问题

| 场景 | 关键词搜索表现 | 期望 |
|------|--------------|------|
| 用户输入 "React 状态管理" 想找 Redux 书签 | ❌ 无命中（标题无"状态管理"） | ✅ 理解语义关联 |
| 用户输入 "CSS 弹性布局" 想找 Flexbox 书签 | ❌ 无命中（中英术语不同） | ✅ 跨语言同义词匹配 |
| 用户输入 "调试 React hooks" | ⚠️ 只命中标题含 "debug" 的 | ✅ 理解 "调试" = "debug" |
| 用户搜索 "类似这篇的书签"（以书签内容为查询） | ❌ 不支持 | ✅ 以文搜文 |

### 竞品参照

- **Readwise**: 按标注文本做语义搜索
- **Obsidian**: 基于本地索引的模糊搜索 + 向量插件
- **市场空白** (MARKET-ANALYSIS.md): "跨会话知识关联 — 每次对话都是独立的" → 语义搜索是关联的基础能力

---

## 二、用户故事

**US-1 (核心)**
作为 PageWise 用户，我希望能用自然语言（而非精确关键词）搜索我的书签库，例如输入 "前端框架性能对比" 就能找到相关书签，而无需记住确切标题。

**US-2 (以文搜文)**
作为 PageWise 用户，我希望能以某个已有书签为查询，找到内容相似的其他书签，从而发现知识关联。

**US-3 (混合搜索)**
作为 PageWise 用户，我希望搜索结果同时包含关键词精确匹配和语义相关结果，且精确匹配优先展示。

---

## 三、验收标准

### AC1: 语义向量索引构建
- `BookmarkSemanticSearch` 能从书签的标题 + 标签 + 内容摘要构建 TF-IDF 语义向量
- 支持增量更新：新增/删除书签时更新索引，无需全量重建
- 索引构建 1000 条书签 < 5 秒

### AC2: 语义搜索 API
- `semanticSearch(query, options)` 接受自然语言查询，返回按相关度排序的书签列表
- 每个结果包含: `{ id, score, bookmark, matchType: 'semantic' | 'keyword' | 'hybrid', highlights? }`
- 搜索响应 < 200ms（1000 条书签规模）

### AC3: 混合搜索（Hybrid Search）
- 合并关键词搜索结果 (来自 `BookmarkSearch`) 和语义搜索结果
- 精确关键词匹配权重 > 语义匹配权重（可配置比例，默认 0.6:0.4）
- 支持排序策略: `relevance`（混合分数）| `semantic-only` | `keyword-only`

### AC4: 以文搜文 (Similar Bookmarks)
- `findSimilar(bookmarkId, limit?)` 返回与指定书签最相似的 N 个书签
- 相似度计算基于 TF-IDF 向量余弦相似度
- 返回结果中不包含查询书签自身

### AC5: 向量持久化与缓存
- 文档向量可缓存至内存，避免重复计算
- 支持 `invalidateCache(bookmarkId)` 用于书签内容更新后清除缓存
- 可选: 通过 `chrome.storage.local` 持久化向量缓存（跨会话复用）

### AC6: 测试覆盖
- 单元测试 ≥ 25 个测试用例
- 覆盖: 索引构建、语义搜索、混合搜索、以文搜文、增量更新、缓存失效、边界条件
- 所有测试通过，不破坏现有测试

---

## 四、功能详述

### 4.1 模块接口

```
BookmarkSemanticSearch
├── constructor(embeddingEngine?, bookmarkSearch?)
├── buildIndex(bookmarks[])         — 全量构建 TF-IDF 词汇表 + 文档向量
├── addBookmark(bookmark)           — 增量添加
├── removeBookmark(bookmarkId)      — 增量删除
├── semanticSearch(query, opts?)    — 纯语义搜索
├── hybridSearch(query, opts?)      — 混合搜索 (关键词 + 语义)
├── findSimilar(bookmarkId, limit?) — 以文搜文
├── invalidateCache(bookmarkId?)    — 缓存失效
├── getStats()                      — 索引统计
└── _mergeResults(keyword, semantic, ratio) — 内部: 结果合并
```

### 4.2 书签 → 文档向量的字段权重

| 字段 | 权重 | 说明 |
|------|------|------|
| title | 3.0 | 标题是最核心的语义信号 |
| tags | 2.0 | 标签是用户/自动分类的结果 |
| contentPreview | 1.5 | 来自 BookmarkContentPreview 的摘要 |
| folderPath | 1.0 | 文件夹路径提供上下文 |
| url | 0.5 | 域名/路径关键词 |

复用 `EmbeddingEngine.FIELD_WEIGHTS` 的思想，但为书签域定义独立权重表。

### 4.3 混合搜索流程

```
用户输入 query
       │
       ├──── BookmarkSearch.search(query) ──── keywordResults[]
       │         (倒排索引 + 图谱扩展)
       │
       └──── EmbeddingEngine.search(query, docs) ──── semanticResults[]
                   (TF-IDF 余弦相似度)
       │
       ▼
  mergeResults(keywordResults, semanticResults, ratio=0.6:0.4)
       │
       ▼
  统一排序 → 返回 hybridResults[]
```

### 4.4 以文搜文流程

```
bookmarkId → 查找书签对象 → generateDocumentVector(bookmark)
                                │
                                ▼
                   与所有其他文档向量计算余弦相似度
                                │
                                ▼
                   排序 → 返回 top-N (排除自身)
```

优化: 利用 `BookmarkGraphEngine.getSimilar()` 的倒排索引做预筛选，只对候选集做精确向量计算。

---

## 五、技术约束

| 约束 | 说明 |
|------|------|
| 零外部依赖 | 纯 ES Module，复用现有 `EmbeddingEngine`，不引入新第三方库 |
| 纯 JS 实现 | TF-IDF + 余弦相似度，不使用 WebAssembly 或外部 AI 模型 |
| 不依赖 DOM | 所有方法为纯函数 / 纯数据操作，可在 Node.js 环境测试 |
| Chrome 扩展兼容 | 向量缓存可选存 `chrome.storage.local`，但核心逻辑不依赖浏览器 API |
| 内存约束 | 1000 条书签的向量缓存应 < 2MB 内存 |
| 性能预算 | 索引构建 < 5s / 搜索 < 200ms / 以文搜文 < 300ms (均为 1000 条规模) |
| 遵循现有模式 | JSDoc 注释 + export class + node:test 测试 |

---

## 六、依赖关系

### 6.1 模块依赖图

```
BookmarkSemanticSearch (新建, R65)
  ├── EmbeddingEngine (已存在, 迭代 #7) — TF-IDF 核心算法
  ├── BookmarkSearch (已存在, R47)      — 关键词搜索结果输入
  ├── BookmarkContentPreview (已存在, R64) — 内容摘要作为向量化输入
  └── BookmarkCollector (已存在, R43)    — 标准书签对象格式
```

### 6.2 数据流依赖

```
BookmarkCollector  ──书签对象──→  BookmarkIndexer  ──索引──→  BookmarkSearch
                                      │                           │
                                      │                           │
         BookmarkContentPreview ──摘要──→  EmbeddingEngine  ──向量──→  BookmarkSemanticSearch (R65)
                                      │
                                      └── BookmarkGraphEngine ──图谱──→ (混合搜索预筛选)
```

### 6.3 被依赖 (下游)

- **BookmarkSearch**: 可被扩展为调用 `BookmarkSemanticSearch` 的混合搜索入口
- **Sidebar UI**: 搜索面板可切换 "关键词 / 语义 / 混合" 模式
- **BookmarkDetailPanel**: "相似书签" 功能依赖 `findSimilar()`

---

## 七、非功能需求

| 维度 | 要求 |
|------|------|
| 性能 | 搜索 < 200ms，索引 < 5s，以文搜文 < 300ms |
| 内存 | 向量缓存 < 2MB (1000 条) |
| 准确性 | 语义搜索 Top-5 命中率 > 60% (中等规模书签库) |
| 可测试性 | 100% 方法有单元测试，不依赖浏览器环境 |
| 向后兼容 | 不修改 `EmbeddingEngine` / `BookmarkSearch` 的现有公开接口 |

---

## 八、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| TF-IDF 对短文本效果差 | 书签标题通常很短 (5-20 字) | 合并 title + tags + contentPreview 组成文档 |
| 中文 bigram 分词粒度粗 | 无法识别 "机器学习" 这样的语义单元 | 接受当前粒度，后续迭代可引入词典 |
| 内存随书签数量线性增长 | 书签数过多时缓存膨胀 | 设置缓存上限 (5000 条)，超出时 LRU 淘汰 |
| 混合搜索权重需调优 | 不同用户的最佳比例不同 | 默认 0.6:0.4，通过搜索历史自适应调整 |

---

## 九、验收测试场景 (示例)

| # | 场景 | 预期 |
|---|------|------|
| T1 | 书签库含 "Redux - Predictable state container"，搜索 "状态管理" | 语义命中，score > 0 |
| T2 | 书签库含 "CSS Flexbox Guide"，搜索 "弹性布局" | 语义命中 (英文标签匹配) |
| T3 | 搜索 "React" (关键词精确匹配 + 语义) | 混合结果，精确匹配排序靠前 |
| T4 | `findSimilar()` 对 React 教程书签 | 返回其他 React 相关书签 |
| T5 | 新增书签后增量更新，语义搜索能命中 | 增量索引生效 |
| T6 | 空书签库搜索 | 返回空数组，不报错 |
| T7 | 1000 条书签搜索耗时 | < 200ms |

---

## 十、文件清单 (预估)

| 文件 | 操作 |
|------|------|
| `lib/bookmark-semantic-search.js` | **新建** — 语义搜索核心模块 |
| `tests/test-bookmark-semantic-search.js` | **新建** — 单元测试 |
| `lib/embedding-engine.js` | **不修改** — 复用现有接口 |
| `lib/bookmark-search.js` | **不修改** — 作为混合搜索的输入来源 |
| `docs/CHANGELOG.md` | 追加 R65 变更记录 |
