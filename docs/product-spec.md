# AI 知识助手 - 产品规格说明书

> **产品名称：** AI 知识助手 (AI Knowledge Assistant)
> **版本：** v1.0.0
> **载体：** Chrome 浏览器扩展 (Manifest V3)
> **文档日期：** 2026-04-25

---

## 1. 产品概述

### 1.1 产品定位

一款轻量级 Chrome 浏览器扩展，帮助用户在浏览技术网页时，即时向 AI 提问不懂的内容，并将 AI 的回答自动整理成结构化知识库，支持后续检索与复习。

### 1.2 目标用户

| 用户类型 | 场景 | 痛点 |
|---------|------|------|
| 开发者 | 阅读技术文档、Stack Overflow、GitHub | 遇到不理解的概念需要反复搜索 |
| 学生 | 学习编程、阅读教程 | 缺乏即时辅导，知识点分散 |
| 技术管理者 | 快速了解新技术方案 | 时间有限，需要快速提炼要点 |
| 终身学习者 | 浏览技术博客、论文 | 知识碎片化，难以系统整理 |

### 1.3 核心价值主张

```
浏览 → 提问 → 理解 → 保存 → 回顾
```

**一句话描述：** 遇到不懂的技术内容，选中即问，AI 即答，自动归档。

---

## 2. 功能需求

### 2.1 P0 - 核心功能（v1.0）

#### F1: 页面内容提取
- **描述：** 自动或手动提取当前网页的核心内容
- **实现：** Content Script 注入页面，采用 Reader Mode 策略过滤噪音
- **策略：**
  1. 优先提取 `<article>` / `<main>` 标签内容
  2. 兜底：遍历 `<p>`, `<h1-h6>`, `<li>`, `<pre>` 等语义标签
  3. 自动提取代码块（保留语言标识）
  4. 提取页面元信息（标题、描述、作者、来源）
- **限制：** 单次提取内容上限 8000 字符（可在设置中调整）

#### F2: AI 问答
- **描述：** 基于页面内容，回答用户的技术问题
- **交互方式：**
  - 侧边栏输入框提问
  - 右键菜单「用 AI 知识助手提问」（需先选中文本）
  - 快捷操作：「总结当前页面」「解释选中内容」
- **AI 能力：**
  - 结合页面上下文回答
  - 支持流式输出（实时显示）
  - 代码示例与解释
  - 保持多轮对话上下文（最近 6 轮）
- **模型：** Claude Sonnet 4.6（默认），支持切换 Opus / Haiku

#### F3: 知识库存储
- **描述：** 将 AI 回答保存为结构化知识条目
- **存储方式：** IndexedDB（纯本地，无需服务器）
- **条目结构：**
  ```
  {
    id: 自增ID,
    title: 页面标题,
    content: 原始页面内容（截取）,
    summary: AI 生成的摘要,
    sourceUrl: 来源URL,
    sourceTitle: 来源标题,
    tags: AI 自动标签,
    category: 分类,
    question: 用户问题,
    answer: AI 回答,
    createdAt: 创建时间,
    updatedAt: 更新时间
  }
  ```
- **自动生成：** 保存时 AI 自动提取摘要和标签

#### F4: 知识检索
- **描述：** 在知识库中搜索、浏览、筛选已保存的知识
- **能力：**
  - 全文搜索（标题、内容、摘要、问题、回答）
  - 标签筛选
  - 按时间排序
  - 按来源 URL 过滤

#### F5: 数据导出
- **描述：** 将知识库导出为通用格式
- **格式：**
  - Markdown（适合导入 Obsidian / Notion）
  - JSON（结构化数据备份）

### 2.2 P1 - 增强功能（v1.1）

#### F6: 划词提问
- 选中文本后出现浮动按钮
- 点击直接提问，自动附带选中内容

#### F7: 页面高亮关联
- AI 回答中引用的代码或术语，可高亮定位到页面原位置

#### F8: 对话历史
- 按页面 URL 保存对话历史
- 重新访问同一页面时恢复对话

### 2.3 P2 - 远期功能（v2.0）

#### F9: 知识图谱
- 可视化展示知识条目之间的关联
- 按主题聚类

#### F10: 云端同步
- 可选的云端备份（需用户自建或使用第三方服务）

#### F11: 多模型支持
- 支持 OpenAI、本地模型（Ollama）等

#### F12: 学习模式
- 间隔重复复习（类似 Anki）
- 基于知识库生成测验题

---

## 3. 技术架构

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Extension (Manifest V3)          │
│                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │ Content      │  │ Sidebar     │  │ Background       │ │
│  │ Script       │  │ Panel       │  │ Service Worker   │ │
│  │              │  │             │  │                  │ │
│  │ - DOM提取    │  │ - 聊天UI    │  │ - 右键菜单       │ │
│  │ - 选中文本   │  │ - 知识库UI  │  │ - 消息路由       │ │
│  │ - 高亮定位   │  │ - 设置UI    │  │ - SidePanel管理  │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘ │
│         │                │                    │           │
│         └────────────────┼────────────────────┘           │
│                          │                                │
│  ┌───────────────────────┴────────────────────────────┐  │
│  │                    Lib Layer                         │  │
│  │                                                      │  │
│  │  ┌──────────────┐  ┌─────────────┐  ┌───────────┐ │  │
│  │  │ ai-client.js │  │ knowledge-  │  │ utils.js  │ │  │
│  │  │              │  │ base.js     │  │           │ │  │
│  │  │ Claude API   │  │ IndexedDB   │  │ 通用工具  │ │  │
│  │  │ 流式调用     │  │ CRUD        │  │ MD渲染    │ │  │
│  │  └──────────────┘  └─────────────┘  └───────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              chrome.storage.sync                       │  │
│  │              (设置 / API Key)                          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              IndexedDB                                 │  │
│  │              (知识库 / 对话历史)                        │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │  Claude API      │
                │  (Anthropic)     │
                │                  │
                │  /v1/messages    │
                │  Streaming       │
                └──────────────────┘
```

### 3.2 技术选型

| 模块 | 技术方案 | 说明 |
|------|---------|------|
| 扩展规范 | Manifest V3 | Chrome 最新扩展规范 |
| 构建工具 | 无（原生 JS） | 零构建依赖，直接加载 |
| UI | 原生 HTML/CSS/JS | 轻量，无框架依赖 |
| AI API | Claude API (Anthropic) | 支持流式输出，长上下文 |
| 设置存储 | chrome.storage.sync | 跨设备同步设置 |
| 知识库存储 | IndexedDB | 纯本地，大容量 |
| Markdown 渲染 | 自实现（轻量） | 无外部依赖 |
| API 协议 | Claude + OpenAI 双协议 | URL 自动判断 |

### 3.3 文件结构

```
ai_assistant_on_browser/
├── manifest.json                 # 扩展配置
├── background/
│   └── service-worker.js         # 后台服务：右键菜单、消息路由
├── content/
│   ├── content.js                # 内容脚本：DOM 提取、选中文本、高亮
│   └── content.css               # 内容脚本样式
├── sidebar/
│   ├── sidebar.html              # 侧边栏页面
│   ├── sidebar.css               # 侧边栏样式
│   └── sidebar.js                # 侧边栏逻辑：对话、知识库、设置
├── popup/
│   ├── popup.html                # 弹窗页面
│   ├── popup.css                 # 弹窗样式
│   └── popup.js                  # 弹窗逻辑
├── options/
│   ├── options.html              # 设置页面
│   ├── options.css               # 设置样式
│   └── options.js                # 设置逻辑
├── lib/
│   ├── ai-client.js              # Claude API 封装（支持流式）
│   ├── knowledge-base.js         # IndexedDB 知识库封装
│   └── utils.js                  # 通用工具函数
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── docs/
    └── product-spec.md           # 本文档
```

---

## 4. 非功能需求

### 4.1 性能

| 指标 | 目标 |
|------|------|
| 页面内容提取 | < 500ms |
| 侧边栏打开 | < 200ms |
| AI 首字响应 | < 2s |
| 知识库搜索 | < 300ms（1000 条以内） |
| 内存占用 | < 50MB |

### 4.2 安全

- API Key 仅存储在 chrome.storage.sync 中，不上传任何服务器
- 所有 AI 调用直接从浏览器到 Anthropic API，无中间代理
- 知识库存储在 IndexedDB，纯本地
- 不收集任何用户数据或使用分析

### 4.3 兼容性

- Chrome 114+（支持 Side Panel API）
- Edge 114+（Chromium 内核）
- 支持所有网页（通过 `<all_urls>` 权限）

### 4.4 可用性

- 支持浅色 / 深色主题（跟随系统）
- 键盘快捷操作（Enter 发送，Shift+Enter 换行）
- 响应式侧边栏布局

---

## 5. 交互流程

### 5.1 核心使用流程

```
用户浏览技术网页
       │
       ├── 遇到不懂的内容
       │         │
       │         ▼
       │   点击扩展图标 / 快捷键
       │         │
       │         ▼
       │   侧边栏打开，自动提取页面内容
       │         │
       │         ▼
       │   用户输入问题（或使用快捷操作）
       │         │
       │         ▼
       │   AI 结合页面内容流式回答
       │         │
       │         ▼
       │   用户查看回答
       │         │
       │         ├── 满意 → 点击「保存到知识库」
       │         │              │
       │         │              ▼
       │         │      AI 自动生成摘要和标签
       │         │              │
       │         │              ▼
       │         │      保存到 IndexedDB
       │         │
       │         └── 追问 → 继续对话
       │
       └── 后续需要回顾
                 │
                 ▼
          打开知识库面板
                 │
                 ├── 搜索 / 标签筛选
                 ├── 按时间浏览
                 └── 导出为 Markdown
```

### 5.2 右键菜单流程

```
用户选中文本 → 右键 → 「用 AI 知识助手提问」
                              │
                              ▼
                     侧边栏打开，附带选中文本
                              │
                              ▼
                     用户补充问题或直接发送
                              │
                              ▼
                     AI 回答（包含选中文本上下文）
```

---

## 6. 数据模型

### 6.1 知识条目 (Entry)

```typescript
interface KnowledgeEntry {
  id: number;              // 自增主键
  title: string;           // 条目标题（通常为页面标题）
  content: string;         // 原始页面内容（截取前 5000 字符）
  summary: string;         // AI 生成的摘要
  sourceUrl: string;       // 来源 URL
  sourceTitle: string;     // 来源页面标题
  tags: string[];          // AI 生成的标签数组
  category: string;        // 主分类（取第一个标签）
  question: string;        // 用户的问题
  answer: string;          // AI 的回答
  createdAt: string;       // ISO 时间戳
  updatedAt: string;       // ISO 时间戳
}
```

### 6.2 对话记录 (Conversation)

```typescript
interface Conversation {
  id: number;              // 自增主键
  sourceUrl: string;       // 关联的页面 URL
  sourceTitle: string;     // 页面标题
  messages: Message[];     // 消息列表
  createdAt: string;       // ISO 时间戳
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}
```

### 6.3 设置 (Settings)

```typescript
interface Settings {
  apiKey: string;          // Claude API Key
  model: string;           // 模型 ID
  maxTokens: number;       // 最大输出 token 数
  autoExtract: boolean;    // 自动提取页面内容
  autoSave: boolean;       // 自动保存回答
  theme: 'light' | 'dark' | 'auto';  // 主题
  language: string;        // 语言
  maxContentLength: number; // 最大内容提取长度
}
```

---

## 7. API 接口

### 7.1 API 协议支持

支持两种 API 协议，根据 URL 自动判断：

**Claude 协议**（URL 包含 `anthropic`）

```
POST {baseUrl}/v1/messages

Headers:
  x-api-key: {API_KEY}
  anthropic-version: 2023-06-01
  content-type: application/json

Body:
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 4096,
  "stream": true,
  "system": "你是一个技术知识助手...",
  "messages": [{ "role": "user", "content": "..." }]
}
```

**OpenAI 兼容协议**（其他所有 URL）

```
POST {baseUrl}/v1/chat/completions

Headers:
  Authorization: Bearer {API_KEY}
  Content-Type: application/json

Body:
{
  "model": "gpt-4o",
  "max_tokens": 4096,
  "stream": true,
  "messages": [
    { "role": "system", "content": "你是一个技术知识助手..." },
    { "role": "user", "content": "..." }
  ]
}
```

**预置 host_permissions：**
- `https://api.anthropic.com/*` — Claude
- `https://api.openai.com/*` — ChatGPT
- `https://api.deepseek.com/*` — DeepSeek
- `http://localhost/*` / `http://127.0.0.1/*` — 本地模型（Ollama 等）

如需使用其他 API 提供商，在 `manifest.json` 的 `host_permissions` 中添加对应域名即可。

### 7.2 Content Script 消息协议

| Action | 方向 | 参数 | 返回 |
|--------|------|------|------|
| `extractContent` | Sidebar → Content | 无 | `{url, title, content, codeBlocks, meta}` |
| `getSelection` | Sidebar → Content | 无 | `{selection: string}` |
| `highlight` | Sidebar → Content | `{text}` | `{success: boolean}` |
| `ping` | 任意 → Content | 无 | `{alive: true}` |

---

## 8. 里程碑计划

### Phase 1: MVP (v1.0) — 当前
- [x] Manifest V3 项目结构
- [x] 页面内容提取
- [x] 侧边栏 UI（对话 + 知识库 + 设置）
- [x] Claude API 集成（流式输出）
- [x] IndexedDB 知识库
- [x] 右键菜单
- [x] 数据导出（MD / JSON）
- [ ] 图标资源
- [ ] Chrome Web Store 上架

### Phase 2: 增强 (v1.1)
- [ ] 划词浮动提问
- [ ] 页面高亮关联
- [ ] 对话历史持久化
- [ ] 快捷键支持

### Phase 3: 进阶 (v2.0)
- [ ] 知识图谱可视化
- [ ] 云端同步
- [ ] 多模型支持
- [ ] 学习复习模式

---

## 9. 竞品分析

| 产品 | 载体 | AI 问答 | 知识库 | 差异化 |
|------|------|---------|--------|--------|
| Merlin | Chrome 扩展 | ✅ | ❌ | 通用 AI 助手，无知识库 |
| Glarity | Chrome 扩展 | ✅ | ❌ | 侧重页面摘要 |
| Notion Web Clipper | Chrome 扩展 | ❌ | ✅ | 无 AI 问答能力 |
| Obsidian Web | Chrome 扩展 | ❌ | ✅ | 需要 Obsidian 桌面端 |
| **AI 知识助手** | **Chrome 扩展** | **✅** | **✅** | **问答 + 知识库一体化** |

**核心差异化：** 将 AI 问答与知识库管理无缝结合，形成「学习闭环」。

---

## 10. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| Claude API 限流 | 无法使用 AI 功能 | 支持多模型切换，添加重试机制 |
| IndexedDB 容量限制 | 知识库存储受限 | 定期清理，支持导出备份 |
| 页面内容提取不准确 | AI 回答质量下降 | 多策略提取，支持用户手动选择区域 |
| Chrome 扩展政策变更 | 功能受限 | 遵循 Manifest V3 规范，关注政策更新 |
| 用户 API Key 安全 | Key 泄露风险 | 仅本地存储，不上传，添加安全提示 |

---

## 附录 A: 快捷键（规划）

| 快捷键 | 功能 |
|--------|------|
| `Alt + A` | 打开/关闭侧边栏 |
| `Alt + S` | 总结当前页面 |
| `Alt + Q` | 快速提问（附带选中文本） |

## 附录 B: Chrome 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 访问当前活跃标签页 |
| `storage` | 存储设置和 API Key |
| `sidePanel` | 显示侧边栏 |
| `contextMenus` | 创建右键菜单 |
| `tabs` | 获取标签页信息 |
| `host_permissions: api.anthropic.com` | 调用 Claude API |
