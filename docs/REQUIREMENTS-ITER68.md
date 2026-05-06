# REQUIREMENTS — R68: BookmarkAIRecommendations

> 迭代: R68
> 日期: 2026-05-06
> 复杂度: Complex (新模块)
> 阶段: Phase C — BookmarkGraph V2.0 (第 6/10 轮)
> 模块文件: `lib/bookmark-ai-recommender.js`
> 测试文件: `tests/test-bookmark-ai-recommender.js`

---

## 1. 用户故事

作为技术学习者，我收藏了大量技术文档、教程和博客，但常常不知道"下一步该看什么"——书签越攒越多，却没有方向感。我希望 AI 能分析我的收藏模式（哪些领域扎堆、哪些领域空白、已学到什么程度），主动推荐互补性资料和下一个学习目标，并用自然语言解释推荐理由，让我的知识库从"堆积"变成"生长"。

**与 R48 BookmarkRecommender 的区别**：
- R48 是**规则推荐**：基于图谱的域名/文件夹/标题 Jaccard 相似度，输出"同域名: github.com"式模板理由
- R68 是**AI 推荐**：调用 LLM 分析用户全量收藏画像 + 学习进度 + 知识盲区，输出**语义级自然语言推理理由**，并能推荐用户收藏中**尚未覆盖**的互补领域资料

---

## 2. 验收标准

### AC1: 收藏模式分析（Profile Analysis）
- `analyzeProfile(bookmarks[], context?)` 方法接收用户全部书签 + 可选上下文（聚类结果、学习进度、知识盲区）
- 输出结构化用户画像对象，包含：
  - `topDomains`: 高频收藏域名 Top-5（域名 + 数量 + 占比）
  - `topCategories`: 领域分布 Top-5（领域名 + 数量 + 占比）
  - `strengths`: 知识强项领域（覆盖率 ≥ moderate）
  - `gaps`: 知识盲区领域（覆盖率 = weak 或 gap）
  - `recentFocus`: 最近收藏的焦点领域（近 30 天新增书签的领域分布）
  - `readingProgress`: 阅读概况（已读/在读/未读数量及占比）
- 画像生成**不调用 AI API**，纯本地计算，响应 < 50ms（500 条书签）
- 兼容 BookmarkGapDetector 的 14 个领域分类体系

### AC2: AI 智能推荐
- `getRecommendations(context?)` 方法异步调用 AIClient 获取推荐
- 推荐结果包含 3 种类型：
  - **模式推荐 (pattern)**: 基于收藏模式识别出的学习建议（例："你频繁收藏 React 相关内容，建议探索 Vue/Svelte 等替代方案以拓宽视野"）
  - **盲区推荐 (gap-filling)**: 知识盲区领域的入门资源建议（例："你的 DevOps 领域覆盖不足，建议从 Docker 入门开始"）
  - **深度推荐 (depth)**: 在已学领域中推荐进阶方向（例："你已完成 3 篇 Redux 入门阅读，建议学习 Redux Toolkit 或 Zustand"）
- 每条推荐包含：`type`、`category`、`summary`（建议概述）、`reason`（AI 推理理由，≥ 20 字）、`suggestedTopics`（具体主题列表，1-3 个）、`confidence`（置信度 0-1）
- 默认返回 ≥ 3 条、≤ 8 条推荐

### AC3: Prompt 工程与上下文压缩
- 构建推荐 prompt 时**不发送原始书签全文**，只发送从 AC1 画像中提取的统计摘要
- prompt 总 token 量 ≤ 1500 tokens（输入），确保不超出一般 LLM 上下文窗口
- prompt 模板包含：系统角色定义（技术学习顾问）、用户画像 JSON、推荐指令（输出格式约束）
- AI 返回必须是有效 JSON，模块需做 `try/catch` 解析 + 字段校验，解析失败时返回空数组而非抛出异常

### AC4: 缓存与降级策略
- **缓存**: 推荐结果缓存到内存，TTL 默认 30 分钟；同一时间窗口内重复调用 `getRecommendations()` 返回缓存结果
- **降级**: 当 AI 不可用时（无 API key、网络错误、API 限流、JSON 解析失败），自动降级到 R48 BookmarkRecommender 的规则推荐，并在结果中标注 `source: 'fallback'`
- `clearCache()` 方法手动清除缓存
- `getLastSource()` 方法返回 `'ai' | 'fallback' | 'cache'`，标识当前推荐来源

### AC5: 完整测试覆盖
- 单元测试覆盖所有公共 API 方法（≥ 20 个测试用例）
- 测试使用 `node:test` + `node:assert/strict`
- 测试需覆盖：正常 AI 推荐流程、AI 不可用降级流程、缓存命中/过期、画像计算边界（空书签、单书签、大量书签）、JSON 解析失败容错

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 纯 ES Module | `export class` 模式，与项目所有 lib 模块一致 |
| 零外部依赖 | 不引入任何第三方 npm 包，复用项目内已有模块 |
| 不依赖 Chrome API | 业务逻辑层，AIClient 通过构造函数注入（依赖反转），与 R65/R66 同模式 |
| 复用已有数据结构 | 输入书签格式与 `BookmarkCollector` (R43) 一致：`{ id, title, url, tags, folderPath, status, dateAdded }` |
| 复用 AIClient | 通过 `lib/ai-client.js` 的 `chat()` 非流式接口调用 LLM |
| Prompt 安全 | prompt 模板硬编码在模块中，不从外部输入拼接，防止 prompt 注入 |
| 性能预算 | `analyzeProfile()` < 50ms（500 条书签）；`getRecommendations()` 含 AI 调用，缓存命中 < 5ms |
| 内存预算 | 画像对象 < 10KB，推荐缓存 < 100KB |
| JSON 容错 | AI 返回非 JSON、JSON 字段缺失、类型错误均不抛出异常，降级处理 |
| 纯数据模块 | 不直接操作 DOM 或 IndexedDB，数据由调用方注入 |

---

## 4. 依赖关系

### 上游依赖（输入）

| 模块 | 文件 | 状态 | 依赖方式 |
|------|------|------|----------|
| AIClient (迭代 #2) | `lib/ai-client.js` | ✅ 已实现 | 构造函数注入；调用 `chat(messages, opts)` 非流式接口 |
| BookmarkRecommender (R48) | `lib/bookmark-recommender.js` | ✅ 已实现 | 构造函数注入；AI 不可用时作为降级推荐引擎 |
| BookmarkClusterer (R53) | `lib/bookmark-clusterer.js` | ✅ 可选 | `context.clustering` 注入领域聚类 Map → 画像 `topCategories` / `strengths` / `gaps` |
| BookmarkGapDetector (R57) | `lib/bookmark-gap-detector.js` | ✅ 可选 | `context.gaps` 注入盲区检测结果 → 盲区推荐 |
| BookmarkLearningPath (R54) | `lib/bookmark-learning-path.js` | ✅ 可选 | `context.learningPath` 注入学习路径 + `judgeDifficulty()` 难度判定 → 深度推荐 |
| BookmarkLearningProgress (R67) | `lib/bookmark-learning-progress.js` | ✅ 可选 | `context.progress` 注入学习进度统计 → 画像 `readingProgress` + 深度推荐 |
| BookmarkStatus (R58) | `lib/bookmark-status.js` | ✅ 隐式 | 书签对象的 `status` 字段（unread/reading/read），用于画像阅读概况 |

### 下游消费者（输出）

| 模块 | 使用方式 |
|------|----------|
| BookmarkDetailPanel (R47) | 书签详情页展示 AI 推荐"你可能还想看" |
| BookmarkOptionsPage (R51) | 推荐面板：展示 AI 推荐列表 + 推荐理由 |
| BookmarkPopup (R50) | 概览区展示 1-2 条今日推荐摘要 |
| R69: BookmarkStatistics | 推荐采纳率统计（未来迭代） |

### 隐式依赖

| 依赖 | 说明 |
|------|------|
| AIClient 配置 | 需要用户在设置中配置有效的 API key 和模型 |
| 网络连接 | AI 推荐需网络访问 LLM API（降级时不需要） |
| 系统时间 | `Date.now()` 用于缓存 TTL 判断、"最近 30 天"时间窗口 |

---

## 5. 数据模型

```javascript
// ===================== 输入 =====================

// 书签对象（来自 BookmarkCollector R43 标准化格式）
{
  id: string,
  title: string,
  url: string,
  tags: string[],
  folderPath: string[],
  status: 'unread' | 'reading' | 'read',
  dateAdded: number,       // timestamp ms
  contentPreview?: string  // 来自 BookmarkContentPreview R64（可选）
}

// 可选上下文注入
context = {
  clustering?: Map<string, Object[]>,     // 来自 BookmarkClusterer R53
  gaps?: Object,                           // 来自 BookmarkGapDetector R57
  learningPath?: Object,                   // 来自 BookmarkLearningPath R54
  progress?: Object                        // 来自 BookmarkLearningProgress R67
}

// ===================== 输出 =====================

// 用户收藏画像 — analyzeProfile() 返回值
{
  totalBookmarks: number,              // 书签总数
  topDomains: [                        // 高频域名 Top-5
    { domain: string, count: number, ratio: number }
  ],
  topCategories: [                     // 领域分布 Top-5
    { category: string, count: number, ratio: number }
  ],
  strengths: string[],                 // 知识强项领域（覆盖率 ≥ moderate）
  gaps: string[],                      // 知识盲区领域（覆盖率 = weak 或 gap）
  recentFocus: [                       // 近 30 天收藏焦点
    { category: string, count: number }
  ],
  readingProgress: {                   // 阅读概况
    read: number,
    reading: number,
    unread: number,
    readRatio: number                  // 已读占比 0-1
  },
  difficultyDistribution: {            // 难度分布
    beginner: number,
    intermediate: number,
    advanced: number
  }
}

// AI 推荐条目 — getRecommendations() 返回值中的单条
{
  type: 'pattern' | 'gap-filling' | 'depth',  // 推荐类型
  category: string,                             // 关联领域
  summary: string,                              // 建议概述（≤ 50 字）
  reason: string,                               // AI 推理理由（≥ 20 字）
  suggestedTopics: string[],                    // 具体主题列表 (1-3 个)
  confidence: number                            // 置信度 0-1
}

// 推荐结果集 — getRecommendations() 返回值
{
  recommendations: Recommendation[],   // 推荐列表 (3-8 条)
  profile: ProfileSnapshot,            // 本次使用的画像快照
  source: 'ai' | 'fallback' | 'cache', // 推荐来源
  generatedAt: number,                  // 生成时间 (timestamp ms)
  model: string,                        // 使用的 AI 模型名（AI 模式）
  promptTokens: number                  // prompt token 量（AI 模式）
}
```

---

## 6. 非功能需求

| 项目 | 要求 |
|------|------|
| API 调用频率 | 30 分钟 TTL 缓存，同一窗口内不重复调用 LLM |
| Token 消耗 | 单次推荐 prompt 输入 ≤ 1500 tokens |
| 降级延迟 | AI 不可用时降级到规则推荐，总耗时 < 100ms |
| 画像内存 | 画像对象 < 10KB，推荐缓存 < 100KB |
| 空数据兼容 | 0 条书签时返回空画像 + 空推荐，不抛出异常 |
| 大数据兼容 | 1000+ 条书签时画像计算 < 200ms |
| 隐私安全 | prompt 只含统计摘要，不包含用户个人身份信息或书签原文 |

---

## 7. 输出文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/bookmark-ai-recommender.js` | **新建** | 核心模块：BookmarkAIRecommendations 类 |
| `tests/test-bookmark-ai-recommender.js` | **新建** | 单元测试（≥ 20 用例，node:test） |
| `docs/CHANGELOG.md` | **修改** | 新增 R68 条目 |
| `docs/TODO.md` | **修改** | 标记 R68 状态为 ✅ |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-06 | R68 | 初始创建 — BookmarkAIRecommendations 需求文档 |
