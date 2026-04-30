# 设计文档 — 智阅 PageWise

> 最后更新: 2026-04-26

---

## 架构概述

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Content   │  │ Sidebar  │  │ Popup    │  │Options │ │
│  │ Script    │  │ (Main UI)│  │ (Quick)  │  │(Config)│ │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └───┬────┘ │
│        │             │             │            │      │
│        └──────┬──────┴──────┬──────┘            │      │
│               │             │                   │      │
│          ┌────▼────┐  ┌────▼────┐         ┌────▼────┐ │
│          │ Service  │  │   Lib   │         │ Storage │ │
│          │ Worker   │  │ (Core)  │         │(IndexedDB)│
│          └────┬────┘  └────┬────┘         └─────────┘ │
│               │            │                          │
│               └─────┬──────┘                          │
│                     │                                 │
│              ┌──────▼──────┐                          │
│              │  AI Client  │                          │
│              │ (Multi-API) │                          │
│              └─────────────┘                          │
└─────────────────────────────────────────────────────────┘
```

## 核心模块

### ai-client.js — AI 客户端
- 统一封装 Anthropic / OpenAI 兼容 API
- 流式输出支持
- Token 计数和限制

### knowledge-base.js — 知识库
- IndexedDB 存储
- CRUD 操作
- 全文搜索

### skill-engine.js — 技能引擎
- 技能注册与发现
- 页面类型匹配
- 技能执行管道

### memory.js — 记忆系统
- 用户画像管理
- 知识召回（加权检索）
- 偏好学习

### evolution.js — 自进化
- 隐式反馈收集
- 策略自动调优
- 模式学习

---

## 设计决策记录

| ID | 日期 | 决策 | 原因 |
|----|------|------|------|
| D001 | 2026-04-26 | 使用 IndexedDB 而非 localStorage | 支持全文搜索、结构化查询 |
| D002 | 2026-04-26 | 不引入构建工具 | 保持简单，Chrome 直接加载 |
| D003 | 2026-04-26 | 使用 ES Modules | 代码组织清晰，MV3 原生支持 |

---

### D004: 测试框架选型
- **决策日期**: 2026-04-26
- **方案选择**: Node.js 内置 test runner (node:test)
- **备选方案**:
  1. Jest（功能全但重，需 npm 安装）
  2. Vitest（需构建工具链）
  3. Node.js 内置 test runner ✅（零依赖，够用）
- **Mock 策略**:
  - Chrome API: 自定义 mock (tests/helpers/chrome-mock.js)
  - IndexedDB: 自定义 mock (tests/helpers/indexeddb-mock.js)
- **测试覆盖**: 144 个测试，覆盖 utils/page-sense/skill-engine/knowledge-base/conversation-store/highlight-store

### D005: ES Module 测试适配
- **决策日期**: 2026-04-26
- **问题**: 源码是 ES Module (import/export)，Node.js 测试需要适配
- **方案**: 测试文件使用 dynamic import() 加载源码，顶部安装 Chrome mock

### D006: 对话持久化方案
- **决策日期**: 2026-04-27
- **问题**: 关闭侧边栏后对话历史丢失
- **方案选择**: chrome.storage.session
- **备选方案**:
  1. IndexedDB — 持久但过重，对话是临时数据
  2. chrome.storage.local — 持久存储，不需要跨会话保留
  3. chrome.storage.session ✅ — 会话级存储，浏览器关闭自动清理，API 简单
- **过期策略**: 24 小时自动过期，避免恢复过时对话
- **保存格式**: `{ conversationHistory, currentPageUrl, timestamp }`

### D007: 代码块复制按钮
- **决策日期**: 2026-04-27
- **方案**: renderMarkdown 正则替换时包裹 `<div class="code-block-wrapper">` + `<button data-code-copy>`
- **事件委托**: chatArea 上统一监听 click，避免每个按钮单独绑定

### D008: Toast 通知系统
- **决策日期**: 2026-04-27
- **方案**: 固定定位容器 + 动态创建 toast 元素
- **动画**: CSS transform translateX 滑入，opacity 淡出
- **生命周期**: 3 秒自动消失，支持点击关闭

### D009: API 配置重设计（AxonHub 风格）
- **决策日期**: 2026-04-26
- **问题**: 原始表单式配置对不熟悉 API 的用户不友好
- **方案**: 借鉴 AxonHub 思路，提供预设+自动填充+模型发现
- **提供商预设**: OpenAI/Claude/DeepSeek/Ollama/自定义
- **Profile 系统**: 保存多套配置，快速切换（如日常用 DeepSeek，复杂任务用 Claude）
- **模型发现**: OpenAI 协议调用 GET /v1/models，Claude 使用预设列表

### D010: 暗色主题实现
- **决策日期**: 2026-04-26
- **方案**: CSS 变量 + data-theme 属性
- **支持**: light/dark/auto（跟随系统）

### D011: YouTube 字幕提取方案
- **决策日期**: 2026-04-27
- **问题**: YouTube 视频字幕需要从页面中提取，支持总结和问答
- **方案选择**: 三层策略递进提取
  1. **DOM 提取优先**: 检查 `ytd-transcript-segment-renderer` 元素，直接从已展开的字幕面板获取
  2. **展开面板兜底**: 自动点击字幕按钮展开面板，等待 1.5s 后再次 DOM 提取
  3. **API 兜底**: 从 `window.ytInitialPlayerResponse` 获取 captionTracks URL，获取 XML 字幕
- **字幕格式**: `{ segments: [{ text, start, duration }], fullText: '...' }`
- **截取限制**: 前 8000 字符（避免 token 溢出）
- **总结 Prompt**: 考虑口语化特点，提示 AI 处理断句和同音错误
- **交互**: YouTube 页面显示「📺 总结这个视频」和「📝 提取视频字幕」快捷按钮

### D012: 多页面联合分析
- **决策日期**: 2026-04-27
- **问题**: 用户可能需要同时分析多个标签页的内容，找出关联和差异
- **方案选择**: Background service worker + 弹窗选择器 + 联合 prompt
- **消息协议**:
  - `collectAllTabs`: 返回所有标签页信息（id, title, url）
  - `collectTabContent(tabIds)`: 并行收集指定标签页内容
- **约束**:
  - 最多同时分析 5 个标签页（避免 token 超限）
  - 每个标签页内容截取前 3000 字符
  - chrome:// 等受限页面自动跳过并提示
- **联合分析 Prompt**: 逐一摘要 → 关联性分析 → 差异对比 → 综合洞察
- **入口**: 页面预览面板 header 区域 + 问答面板欢迎消息区

### D013: API 文档端点提取
- **决策日期**: 2026-04-27
- **问题**: API 文档页面需要提取结构化端点信息，帮助开发者快速理解 API
- **方案选择**: 三层策略递进提取（与 YouTube 字幕类似）
  1. **Swagger UI DOM 优先**: 提取 `.opblock` 元素的 method、path、description、params
  2. **Redoc DOM 兜底**: 提取 `[data-section-id^="operation"]` 等 Redoc 特有元素
  3. **通用文本匹配兜底**: 正则匹配 `METHOD /path` 模式
- **去重**: 按 `METHOD path` 去重，最多 50 个端点
- **页面检测**: URL 模式 + Swagger UI 元素 + HTTP 方法频率 + 通用关键词

### D014: 引用标记注入策略
- **决策日期**: 2026-04-30
- **问题**: AI 回答中的引用（行内代码、引用块）需要成为可点击跳转链接，在哪个层面标记？
- **方案选择**: **B: DOM 后处理注入** — `_buildAIElement()` 创建 DOM 后扫描注入
- **原因**: `renderMarkdown()` 是通用工具函数，不应承担业务逻辑；DOM 层面可精确区分 `<code>` 和 `<pre><code>`；与 `injectCodeBlockRunButtons()` 模式一致

### D015: 临时高亮 — 新函数 vs 修改现有
- **决策日期**: 2026-04-30
- **问题**: `highlightText()` 已存在但没有自动消失逻辑，修改还是新增？
- **方案选择**: **新增 `flashHighlight()`**，保留 `highlightText()` 不变
- **原因**: 避免影响已有高亮逻辑；新函数使用 CSS 类（`pw-flash-highlight`）更利于动画控制；单一职责

### D016: 临时高亮自动消失 — 动画方案
- **决策日期**: 2026-04-30
- **问题**: 3 秒后高亮如何消失？
- **方案选择**: **CSS transition + JS 控制分阶段执行** — 创建高亮 → scrollIntoView → 3s 等待 → 添加 `.pw-flash-highlight--fading` → CSS opacity 0.5s 渐隐 → transitionend 移除 DOM
- **原因**: 纯 JS setTimeout 设置 opacity 不如 CSS transition 流畅；transitionend 触发后再移除 DOM 避免动画中断

### D017: 引用匹配策略 — 精确 vs 模糊
- **决策日期**: 2026-04-30
- **问题**: AI 引用的代码片段可能与页面原文不完全一致，如何匹配？
- **方案选择**: **精确子串匹配（indexOf）**，与 `applyHighlightByText` 一致
- **原因**: AI 引用的是页面原文的直接片段；模糊匹配引入误匹配风险；AC-4 要求找不到时显示友好提示

### D018: 引用文本截取策略
- **决策日期**: 2026-04-30
- **问题**: 引用块（blockquote）可能很长，用于匹配的文本应该多长？
- **方案选择**: `<code>` 完整文本；`<blockquote>` 截取前 200 字符
- **原因**: 行内代码通常很短，完整匹配更精确；引用块 200 字符足以定位唯一位置，且 TreeWalker 遍历性能可控

## 已知技术债务

| ID | 描述 | 优先级 | 状态 |
|----|------|--------|------|
| TD001 | 无测试覆盖 | 高 | 待解决 |
| TD002 | ai-client.js 错误处理不完善 | 中 | 待解决 |
| TD003 | knowledge-base.js 缺少索引优化 | 低 | 待评估 |
