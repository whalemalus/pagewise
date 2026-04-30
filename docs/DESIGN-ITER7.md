# 设计文档 — 迭代 #7: 语义搜索 (Embedding)

> 日期: 2026-04-30
> 状态: 待实现

---

## 1. 概述

本轮迭代将知识库搜索从**基础 bigram TF 余弦相似度**升级为**加权 TF-IDF 嵌入引擎**，并优化中文分词、字段权重和缓存策略，使知识库从"存了找不到"变为真正可用。

### 问题

当前 `KnowledgeBase.calculateSimilarity()` / `semanticSearch()` 的问题：
1. **无 IDF 加权** — 高频词（如"的"、"是"）与罕见词同等权重，噪音大
2. **中文分词粗糙** — 仅按空格/标点切分，中文连续文本不切词，bigram 覆盖差
3. **无字段权重** — title 和 summary 应比 answer 有更高权重
4. **无停用词过滤** — 标点符号、常见虚词产生噪音 bigram
5. **向量未缓存** — 每次搜索都重新计算所有条目的向量
6. **仅 bigram** — 词汇表太稀疏，同义词无法关联

### 目标

- TF-IDF 加权向量空间模型
- 中文字符级 bigram + 英文 word-level bigram 分词
- 字段权重（title > summary > tags > question > answer）
- 中英文停用词过滤
- 文档向量缓存（按 entry.id）
- 综合搜索分数融合（keyword × 0.4 + semantic × 0.6）
- 性能：1000 条 < 100ms

---

## 2. 架构设计

### 2.1 新增模块: lib/embedding-engine.js

```
EmbeddingEngine
├── tokenize(text) → string[]
├── generateVector(text, options) → Map<term, weight>
├── generateDocumentVector(entry) → Map<term, weight>
├── cosineSimilarity(vec1, vec2) → number
├── buildVocabulary(entries) → void  // 构建 IDF
├── idf(term) → number
├── search(query, entries, limit) → { entry, score }[]
└── invalidateCache(entryId) → void
```

### 2.2 分词策略

```
输入文本 → normalize → 分段(中/英) → tokenize → 过滤停用词 → ngram
```

- **中文分词**: 字符级 bigram（无词典依赖，不引入 jieba 等重依赖）
- **英文分词**: 空格/标点切分 → 小写 → word bigram
- **停用词**: 内置中英文高频停用词表（~100 词）

### 2.3 字段权重

| 字段 | 权重 | 原因 |
|------|------|------|
| title | 3.0 | 标题最能代表条目主题 |
| summary | 2.0 | 摘要是核心概括 |
| tags | 2.0 | 标签是精确分类信号 |
| question | 1.5 | 问题描述条目关注点 |
| answer | 1.0 | 回答内容通常最长、最详尽 |
| content | 0.5 | 原始内容通常很长且噪音多 |

### 2.4 TF-IDF 公式

```
TF(t, d) = count(t in d) / len(d)
IDF(t) = log(N / (1 + df(t)))  // N = 总文档数, df = 包含该词的文档数
weight(t, d) = TF(t, d) × IDF(t) × fieldWeight
```

### 2.5 综合搜索融合

```
finalScore = keywordScore × 0.4 + semanticScore × 0.6
```

当有精确关键词命中时，keywordScore = 1.0；否则 = 0。

---

## 3. 与现有系统集成

### 3.1 KnowledgeBase.combinedSearch() 升级

```javascript
// 现有: KnowledgeBase.calculateSimilarity() — bigram TF
// 升级: EmbeddingEngine — TF-IDF 加权
```

- `combinedSearch()` 改为使用 `EmbeddingEngine` 计算语义分数
- 向后兼容：保留原有 static 方法，新增实例方法
- EmbeddingEngine 实例挂在 KnowledgeBase 上

### 3.2 sidebar.js 无需改动

搜索 UI 调用的是 `kb.combinedSearch()`，接口不变。

---

## 4. 设计决策

| ID | 决策 | 原因 |
|----|------|------|
| D026 | TF-IDF 而非神经网络 Embedding | 纯 JS 零依赖，无需 ONNX.js/WASM，Chrome 扩展体积可控 |
| D027 | 字符级中文 bigram | 无需词典，覆盖率 > 90%，比逐字匹配更语义 |
| D028 | 文档向量缓存 | 避免重复计算，idf 重建时批量失效 |
| D029 | 独立 EmbeddingEngine 类 | 单一职责，可独立测试，可复用 |
| D030 | 停用词表内嵌 | 避免外部文件依赖，Chrome 扩展环境简单 |
