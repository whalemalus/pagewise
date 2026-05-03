# R43: Memory E2E 测试需求

## 任务
创建 tests/test-memory-e2e.js，测试 lib/memory.js 的 MemorySystem 类。

## API 清单
- constructor() → init() → loadUserProfile()
- saveUserProfile() — 保存到 chrome.storage.sync
- learnFromInteraction(question, answer, pageContext) — 学习用户画像
  - pageContext.codeBlocks[].lang → 学习编程语言
  - pageContext.url → 学习领域（域名），domains 最多 20 个
- recall(query, aiClient=null) — 三层检索
- extractKeywords(query) — 中英文关键词提取，过滤停用词
- scoreRelevance(entry, keywords, query) — 评分：标题5/标签4/问题3/摘要2/回答1
- aiRerank(query, candidates, aiClient) — AI 重排序 top5
- autoSaveIfWorth(question, answer, pageContext, aiClient) — 自动保存
  - 条件：answer.length >= 100 且包含技术关键词
- toPrompt(query, aiClient=null) — 生成 AI 上下文
- extractDomain(url) — 提取域名
- getAllEntries/getEntry/deleteEntry/getAllTags/exportMarkdown/exportJSON — 透传

## 测试模板
```javascript
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js'
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js'
installChromeMock()
installIndexedDBMock()
const { MemorySystem } = await import('../lib/memory.js')
let memory
beforeEach(async () => { memory = new MemorySystem(); await memory.init() })
afterEach(() => { resetChromeMock(); resetIndexedDBMock() })
```

## 要求
- 至少 25 个测试场景
- 覆盖：初始化、用户画像学习、recall 检索、关键词提取、评分、自动保存、toPrompt、边界情况、错误降级
- 运行 node --test tests/test-memory-e2e.js 确认通过
- git commit -m "test: R43 Memory E2E — 25+ test scenarios"
