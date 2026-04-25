# AI 知识助手 (AI Knowledge Assistant)

> 浏览网页时遇到不懂的技术内容？选中即问，AI 即答，自动归档。让每一次浏览都成为学习。

一个 Chrome 浏览器扩展，在你浏览技术网页时提供 AI 智能问答，并将知识自动整理到本地知识库。支持 Claude / ChatGPT / DeepSeek 等多种大模型，具备技能系统、页面感知、记忆学习和自进化能力。

---

## 核心理念

```
浏览 → 提问 → 理解 → 保存 → 回顾 → 进化
```

传统学习流程中，遇到不懂的技术内容需要离开当前页面去搜索、提问、记录，再回来继续看。这个助手让你**不离开当前页面**就能完成整个学习闭环——AI 看到你看的页面，理解你的问题，给出解答，自动归档。知识库会随着使用不断积累，助手也会越用越懂你。

---

## 功能概览

### AI 问答
- 基于当前页面内容的智能问答，AI 能"看到"你在看什么
- 流式输出，实时显示回答
- 支持多轮对话，保持上下文
- 选中文本右键提问，一键总结页面
- 支持 Claude / ChatGPT / DeepSeek / Ollama 等任意兼容 API

### 知识库
- 自动将有价值的问答整理到本地知识库（IndexedDB）
- AI 自动生成摘要和标签
- 全文搜索、标签筛选、按时间浏览
- 导出为 Markdown（兼容 Obsidian）或 JSON
- 导入 JSON / Markdown / 纯文本文件

### 技能系统
- 7 个内置技能：代码解释、代码审查、错误诊断、API 摘要、学习路径、知识卡片、Obsidian 导出
- 根据页面内容自动推荐相关技能
- 支持启用/禁用、手动触发
- AI 可在回答中自动调用技能

### 页面感知
- 自动识别页面类型：代码仓库、API 文档、技术问答、博客、代码片段、错误页面
- 根据页面类型推荐对应操作
- 提取结构化信息（端点、代码语言、错误信息）

### 记忆系统
- 用户画像：自动学习技术水平、常用语言、关注领域
- 知识召回：提问时自动检索相关历史知识
- 加权检索：标题 > 标签 > 问题 > 摘要 > 回答
- AI 语义重排：从候选中选出最相关的知识条目
- 自动保存：判断回答是否有价值，自动存入知识库

### 自进化
- 隐式反馈学习：从用户行为（复制、保存、追问）自动学习偏好
- 回答风格自适应：简洁 / 均衡 / 详细，根据成功模式自动调整
- 用户水平推断：初学者 / 中级 / 高级，调整解释深度
- 检索策略调优：根据重复提问等信号自动扩大/缩小检索范围
- 技能推荐校准：根据使用/忽略情况调整推荐阈值
- 避免模式记忆：记录用户纠正过的行为，下次避免

---

## 快速开始

### 安装

1. 克隆或下载本仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」，选择项目目录
5. 点击扩展图标，打开侧边栏

### 配置

1. 在侧边栏中切换到「设置」标签
2. 选择 API 协议：
   - **OpenAI 兼容**：ChatGPT、DeepSeek、本地代理（Ollama 等）
   - **Claude**：Anthropic 官方 API
3. 填写 API 地址和 API Key
4. 填写模型名称（如 `gpt-4o`、`claude-sonnet-4-6`、`deepseek-chat`）
5. 点击「测试连接」验证配置

### 使用

- **提问**：打开侧边栏，输入问题，AI 会结合当前页面内容回答
- **总结页面**：点击「总结当前页面」按钮
- **解释选中内容**：选中文本后点击「解释选中内容」或右键菜单
- **使用技能**：点击「技能」标签，手动运行技能
- **保存知识**：AI 回答后点击「保存」按钮，自动整理到知识库
- **导入导出**：在知识库标签中导入/导出文件

---

## 技能详情

| 技能 | 分类 | 触发方式 | 功能 |
|------|------|---------|------|
| 解释代码 | code | 页面有代码块时自动推荐 | 逐行解释代码含义，标注关键概念 |
| 代码审查 | code | 页面有代码块时自动推荐 | 从安全性、性能、可读性等维度审查 |
| 错误诊断 | debug | 页面有错误信息时自动推荐 | 分析错误原因，给出修复方案 |
| API 摘要 | doc | URL 含 /api/ 或 /docs/ 时推荐 | 提取端点列表、参数、示例 |
| 学习路径 | learning | 手动触发 | 生成从入门到精通的学习路线图 |
| 知识卡片 | learning | 手动触发 | 将内容转化为 Q&A 格式的复习卡片 |
| Obsidian 导出 | export | 手动触发 | 整理为带 YAML frontmatter 的 Obsidian 笔记 |

---

## 导入格式

知识库支持导入以下格式的文件：

### JSON

从本扩展导出的 JSON 可直接导入，完整保留所有字段。

```json
[
  {
    "title": "React Hooks 详解",
    "tags": ["react", "hooks"],
    "question": "什么是 Hooks？",
    "answer": "Hooks 是 React 16.8 引入的...",
    "sourceUrl": "https://react.dev"
  }
]
```

### Markdown（Obsidian 兼容）

```markdown
---
title: React Hooks 详解
tags: [react, hooks]
source: https://react.dev
date: 2024-01-15
---

正文内容...
```

### Markdown（H2 分隔）

```markdown
## 条目标题 1
标签: tag1, tag2

内容...

## 条目标题 2
标签: tag3

内容...
```

### 纯文本

按空行分隔，每段第一条作为标题。

---

## 技术架构

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Extension (Manifest V3)          │
│                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │ Content      │  │ Sidebar     │  │ Background       │ │
│  │ Script       │  │ Panel       │  │ Service Worker   │ │
│  │              │  │             │  │                  │ │
│  │ DOM 提取     │  │ 对话 UI     │  │ 右键菜单         │ │
│  │ 选中文本     │  │ 技能面板    │  │ 消息路由         │ │
│  │ 高亮定位     │  │ 知识库      │  │ Side Panel 管理  │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘ │
│         └────────────────┼────────────────────┘           │
│  ┌───────────────────────┴──────────────────────────────┐ │
│  │                      Lib Layer                        │ │
│  │                                                        │ │
│  │  ai-client.js     Claude/OpenAI 双协议，流式输出       │ │
│  │  skill-engine.js  技能注册、发现、执行                 │ │
│  │  page-sense.js    页面类型识别、结构化提取             │ │
│  │  memory.js        知识召回、用户画像、自动保存         │ │
│  │  evolution.js     隐式反馈、策略调优、自进化           │ │
│  │  agent-loop.js    任务分解、规划执行                   │ │
│  │  importer.js      多格式导入解析                      │ │
│  │  knowledge-base.js IndexedDB 知识库存储               │ │
│  │  utils.js         通用工具函数                        │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  chrome.storage.sync   设置 / API Key                   │ │
│  │  chrome.storage.local  进化状态                         │ │
│  │  IndexedDB             知识库 / 对话历史                │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │  AI API          │
                │  (Claude/OpenAI) │
                └──────────────────┘
```

### 技术选型

| 模块 | 方案 | 理由 |
|------|------|------|
| 扩展规范 | Manifest V3 | Chrome 最新规范 |
| 构建工具 | 无（原生 JS ES Modules） | 零依赖，直接加载 |
| UI | 原生 HTML/CSS/JS | 轻量，无框架开销 |
| AI API | Claude / OpenAI 兼容 | 支持任意兼容接口 |
| 设置存储 | chrome.storage.sync | 跨设备同步 |
| 进化状态 | chrome.storage.local | 本地持久化 |
| 知识库存储 | IndexedDB | 纯本地，大容量 |

---

## 文件结构

```
ai_assistant_on_browser/
├── manifest.json                 # 扩展配置
├── background/
│   └── service-worker.js         # 后台服务：右键菜单、消息路由
├── content/
│   ├── content.js                # DOM 提取、选中文本、高亮
│   └── content.css
├── sidebar/
│   ├── sidebar.html              # 侧边栏主界面
│   ├── sidebar.css               # 样式（含深色模式）
│   └── sidebar.js                # 核心业务逻辑
├── popup/
│   ├── popup.html                # 扩展弹窗
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html              # 设置页面
│   ├── options.css
│   └── options.js
├── lib/
│   ├── ai-client.js              # AI API 封装（Claude + OpenAI 双协议）
│   ├── skill-engine.js           # 技能引擎
│   ├── page-sense.js             # 页面感知
│   ├── memory.js                 # 记忆系统
│   ├── evolution.js              # 自进化引擎
│   ├── agent-loop.js             # Agent 规划执行
│   ├── importer.js               # 多格式导入
│   ├── knowledge-base.js         # IndexedDB 知识库
│   └── utils.js                  # 工具函数
├── skills/
│   └── builtin-skills.js         # 内置技能集
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── docs/
    └── product-spec.md           # 产品规格说明书
```

---

## 自进化机制

助手通过隐式反馈信号自动学习，无需用户手动评分：

```
用户行为信号                      系统学习
──────────────────────────────────────────────────
复制了回答            →    这种回答风格有效，保持
保存到知识库          →    这类内容有价值，加权
30 秒内追问           →    回答不够深入，增加详细度
重复问同一问题        →    检索不准，扩大搜索范围
忽略推荐的技能        →    技能不匹配，提高推荐阈值
纠正 AI 的说法        →    记录避免模式，下次不再犯
```

进化维度包括：
- **回答风格**：简洁 / 均衡 / 详细
- **代码详细度**：最小 / 中等 / 完整
- **检索策略**：搜索范围、权重分配
- **用户水平**：初学者 / 中级 / 高级
- **技能推荐**：置信度阈值动态调整

---

## 隐私与安全

- **API Key**：仅存储在 Chrome 本地同步存储中，不上传任何服务器
- **知识库**：存储在浏览器 IndexedDB，完全本地
- **页面内容**：仅在用户主动操作时提取，发送到用户自己配置的 AI API
- **无追踪**：不收集任何使用数据或分析信息
- **开源透明**：所有代码可审计

---

## 浏览器兼容性

| 浏览器 | 最低版本 | 状态 |
|--------|---------|------|
| Chrome | 114+ | 完整支持（Side Panel API） |
| Edge | 114+ | 完整支持（Chromium 内核） |
| Brave | 114+ | 完整支持 |
| Firefox | - | 不支持（无 Side Panel API） |

---

## 贡献

欢迎贡献代码、报告问题或提出建议。

### 开发

项目无构建步骤，直接修改源码后在 Chrome 扩展管理页面点击刷新即可。

### 添加新技能

在 `skills/builtin-skills.js` 中添加：

```javascript
export const mySkill = {
  id: 'my-skill',
  name: '我的技能',
  description: '技能描述',
  category: 'general',
  trigger: (pageContext) => {
    // 返回 true 表示当前页面适合此技能
    return pageContext.content?.includes('关键词');
  },
  parameters: [
    { name: 'param1', type: 'string', description: '参数说明', required: false }
  ],
  async execute(params, context) {
    // context.ai - AI 客户端
    // context.memory - 记忆系统
    const response = await context.ai.chat([...]);
    return response.content;
  }
};

// 加入数组
export const allBuiltinSkills = [
  ...existingSkills,
  mySkill
];
```

---

## 未来规划

- [ ] 划词浮动提问按钮
- [ ] 页面高亮关联（AI 回答引用的代码可定位到页面原位置）
- [ ] 快捷键支持（Alt+A 打开侧边栏）
- [ ] 知识图谱可视化
- [ ] 云端同步（可选）
- [ ] 多模型同时对比
- [ ] 间隔重复复习模式（类似 Anki）
- [ ] Firefox 支持

---

## 许可证

MIT License
