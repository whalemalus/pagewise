# 设计文档 — 迭代 32: L3.4 LLM Wiki 查询

> 日期: 2026-04-30
> 前置: L3.1 Wiki 浏览模式, L2.1 自动分类, L1.2 实体/概念提取

---

## 目标

从「对单个页面提问」升级到「对整个 Wiki 提问」：

1. **Ask Wiki 模式**: 用户可切换到「Ask Wiki」模式，AI 读取整个 wiki 知识库来回答
2. **智能上下文构建**: 自动检索与问题最相关的 wiki 页面构建上下文（而非全量塞入）
3. **回答引用**: AI 回答中自动标注引用的 wiki 页面，并附带来源链接
4. **一键归档**: 有价值的回答可一键归档回 wiki（保存为新的 Q&A 条目）

---

## 架构设计

### 新增/修改文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `lib/wiki-query.js` | 新增 | Wiki 查询核心模块（纯函数） |
| `tests/test-wiki-query.js` | 新增 | 单元测试 |
| `sidebar/sidebar.js` | 修改 | 集成 Ask Wiki 模式 |
| `docs/IMPLEMENTATION.md` | 修改 | 记录实现 |
| `docs/CHANGELOG.md` | 修改 | 记录变更 |
| `docs/TODO.md` | 修改 | 标记完成 |

### 核心设计

#### Wiki 查询引擎 (`lib/wiki-query.js`)

纯 ES Module，不依赖 IndexedDB 或 Chrome API。核心函数：

1. **`selectRelevantPages(pages, question, options)`** — 智能选择与问题最相关的 wiki 页面
   - 使用关键词匹配 + 评分机制（标题 > 标签 > 内容）
   - 支持 `maxPages` 限制（默认 10）和 `maxTokens` 预算（默认 6000）
   - 返回排序后的相关页面列表

2. **`buildWikiContext(selectedPages, options)`** — 将选中的页面构建为 LLM 可读上下文
   - 每个页面格式化为 `## [类型] 标题\n内容...`
   - 控制总 token 预算，超长页面自动截断
   - 支持自定义格式化器

3. **`buildWikiSystemPrompt()`** — 生成 Wiki 查询的系统提示词
   - 指示 AI 基于提供的 wiki 知识回答
   - 要求标注引用来源
   - 引用格式: `[来源: 页面标题](pageId)`

4. **`buildWikiQuestionPrompt(context, question)`** — 组装完整的用户消息
   - 包含 wiki 上下文 + 用户问题

5. **`extractPageReferences(response, pageMap)`** — 从 AI 回答中提取引用的 wiki 页面
   - 解析回答中的引用标记
   - 返回被引用的页面对象列表

6. **`buildAnswerArchivePrompt(question, answer)`** — 构建归档提示词
   - 将问答对格式化为适合归档的 wiki 页面结构
   - 提取标题、标签

7. **`isAnswerWorthArchiving(question, answer)`** — 判断回答是否值得归档
   - 基于回答长度、信息密度等启发式规则

### 集成设计

#### Sidebar 集成

1. **Ask Wiki 模式切换**: 在对话输入区域增加「Ask Wiki」切换按钮
   - 按钮状态: 普通模式(页面问答) / Wiki 模式(全 wiki 问答)
   - 切换时更新 placeholder 文本

2. **`sendWikiMessage()` 方法**: Wiki 模式下的消息发送
   - 加载 wiki 页面 → 智能选择 → 构建上下文 → AI 问答
   - 复用现有 streaming 和缓存机制

3. **归档按钮**: AI 回答后在 wiki 模式下显示「📚 归档到 Wiki」按钮
   - 一键保存问答为新的知识条目

---

## 测试计划

共约 30 个测试用例：

1. `selectRelevantPages` — 8 个测试（空输入、关键词匹配、标题加权、标签加权、maxPages 限制、maxTokens 预算、排序正确性、无匹配返回空）
2. `buildWikiContext` — 6 个测试（空页面、正常格式化、token 截断、自定义格式化器、类型标签、空页面列表）
3. `buildWikiSystemPrompt` — 3 个测试（返回非空字符串、包含关键词、包含引用指令）
4. `buildWikiQuestionPrompt` — 3 个测试（包含上下文、包含问题、空上下文）
5. `extractPageReferences` — 4 个测试（正常提取、无引用、多个引用、大小写不敏感）
6. `isAnswerWorthArchiving` — 3 个测试（长回答=true、短回答=false、空回答=false）
7. `buildAnswerArchivePrompt` — 3 个测试（正常生成、包含标题、包含标签提取）

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Wiki 页面太多导致上下文超长 | `selectRelevantPages` 按相关性排序 + token 预算限制 |
| 关键词匹配不够精准 | 后续可扩展为 embedding 语义匹配 |
| 归档产生重复条目 | 归档前检查已有条目，避免重复 |
| 系统提示词过大消耗太多 token | 控制 prompt 长度，仅选择 top-N 页面 |
