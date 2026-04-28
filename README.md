# 智阅 PageWise

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
- 多页面联合分析（同时分析最多 5 个标签页）

### 知识库
- 自动将有价值的问答整理到本地知识库（IndexedDB）
- AI 自动生成摘要和标签
- 全文搜索、标签筛选、按时间浏览
- **语义搜索**：bigram 向量余弦相似度智能搜索
- **知识图谱可视化**：Canvas 力导向图展示知识关联
- **知识关联引擎**：自动发现知识条目间的关联
- 批量管理：批量选择、删除、打标签、导出
- 导出为 Markdown（兼容 Obsidian）或 JSON
- 导入 JSON / Markdown / 纯文本文件

### 技能系统
- 7 个内置技能：代码解释、代码审查、错误诊断、API 摘要、学习路径、知识卡片、Obsidian 导出
- **自定义技能系统**：用户可创建最多 20 个自定义技能
- 根据页面内容自动推荐相关技能
- 支持启用/禁用、手动触发
- AI 可在回答中自动调用技能

### 页面感知
- 自动识别 6 种页面类型：通用网页、API 文档、GitHub 仓库、YouTube、PDF、代码仓库
- 根据页面类型推荐对应操作
- 提取结构化信息（端点、代码语言、错误信息）
- PDF 文档阅读（Chrome PDF viewer）
- YouTube 视频字幕提取与总结

### 智能功能
- **多模态图片理解**：页面图片提取与 AI 视觉问答
- **代码执行沙箱**：AI 回答中的 HTML/JavaScript 代码可在侧边栏直接运行
- **Prompt 模板库**：5 个内置模板 + 自定义模板一键调用
- **对话分支**：从任意 AI 回答节点分叉探索不同方向
- **Token 窗口管理**：对话 token 用量估算与警告
- **学习路径生成**：AI 基于知识库生成个性化学习路线
- **间隔复习系统**：基于 SM-2 算法的知识卡片复习
- **页面高亮标注**：选中文本高亮保存，跨访问持久化

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

### 界面与交互
- AxonHub 风格 API 配置：提供商卡片选择器，模型发现
- 多配置 Profile：保存/切换/删除多套 API 配置
- 暗色主题：CSS 变量切换，支持跟随系统
- 划词提问：选中文本后浮动按钮直接提问
- 新手引导流程：首次安装分步引导
- 数据统计仪表盘：使用统计与趋势分析
- 快捷键：Ctrl+Shift+Y（打开侧边栏）、Ctrl+Shift+S（总结页面）、Ctrl+Shift+X（切换侧边栏）
- 国际化：支持中文和英文界面
- 可访问性：ARIA 标签、键盘导航、焦点管理

### 错误处理
- 全局错误捕获
- 友好错误提示
- 自动重试机制
- Toast 通知系统（info/success/error/warning）

---

## 安装

### 从源码安装（开发者模式）

1. 克隆或下载本仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」，选择项目目录
5. 点击扩展图标，打开侧边栏

### 从打包文件安装

1. 从 Releases 页面下载 `pagewise-v1.0.0.zip`
2. 解压到本地目录
3. 打开 Chrome，访问 `chrome://extensions/`
4. 开启右上角「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的目录

---

## 配置

1. 在侧边栏中切换到「设置」标签
2. 选择 API 协议：
   - **OpenAI 兼容**：ChatGPT、DeepSeek、本地代理（Ollama 等）
   - **Claude**：Anthropic 官方 API
3. 填写 API 地址和 API Key
4. 填写模型名称（如 `gpt-4o`、`claude-sonnet-4-6`、`deepseek-chat`）
5. 点击「测试连接」验证配置

---

## 使用

- **提问**：打开侧边栏，输入问题，AI 会结合当前页面内容回答
- **总结页面**：点击「总结当前页面」按钮或按 Ctrl+Shift+S
- **解释选中内容**：选中文本后点击「解释选中内容」或右键菜单
- **使用技能**：点击「技能」标签，手动运行技能
- **保存知识**：AI 回答后点击「保存」按钮，自动整理到知识库
- **导入导出**：在知识库标签中导入/导出文件
- **复习知识**：使用间隔复习系统回顾已保存的知识

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
│  │  ai-client.js       AI API 客户端（Claude + OpenAI）  │ │
│  │  skill-engine.js    技能注册、发现、执行               │ │
│  │  page-sense.js      页面类型识别、结构化提取           │ │
│  │  memory.js          知识召回、用户画像、自动保存       │ │
│  │  evolution.js       隐式反馈、策略调优、自进化         │ │
│  │  agent-loop.js      任务分解、规划执行                 │ │
│  │  importer.js        多格式导入解析                    │ │
│  │  knowledge-base.js  IndexedDB 知识库存储              │ │
│  │  knowledge-graph.js 知识关联图谱                      │ │
│  │  spaced-repetition.js SM-2 间隔复习                   │ │
│  │  prompt-templates.js Prompt 模板管理                  │ │
│  │  conversation-store.js 对话历史持久化                 │ │
│  │  highlight-store.js 页面高亮存储                      │ │
│  │  learning-path.js   学习路径生成                      │ │
│  │  custom-skills.js   自定义技能管理                    │ │
│  │  stats.js           使用统计                          │ │
│  │  error-handler.js   全局错误处理                      │ │
│  │  onboarding.js      新手引导                          │ │
│  │  utils.js           通用工具函数                      │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  chrome.storage.sync   设置 / API Key                   │ │
│  │  chrome.storage.local  进化状态                         │ │
│  │  chrome.storage.session 对话历史（24h 过期）             │ │
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
| 国际化 | _locales | 中英文支持 |

---

## 文件结构

```
pagewise/
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
├── lib/                          # 核心库（20 个模块）
│   ├── ai-client.js              # AI API 封装（Claude + OpenAI 双协议）
│   ├── skill-engine.js           # 技能引擎
│   ├── page-sense.js             # 页面感知
│   ├── memory.js                 # 记忆系统
│   ├── evolution.js              # 自进化引擎
│   ├── agent-loop.js             # Agent 规划执行
│   ├── importer.js               # 多格式导入
│   ├── knowledge-base.js         # IndexedDB 知识库
│   ├── knowledge-graph.js        # 知识关联图谱
│   ├── spaced-repetition.js      # SM-2 间隔复习
│   ├── prompt-templates.js       # Prompt 模板管理
│   ├── conversation-store.js     # 对话历史持久化
│   ├── highlight-store.js        # 页面高亮存储
│   ├── learning-path.js          # 学习路径生成
│   ├── custom-skills.js          # 自定义技能管理
│   ├── stats.js                  # 使用统计
│   ├── error-handler.js          # 全局错误处理
│   ├── onboarding.js             # 新手引导
│   └── utils.js                  # 工具函数
├── skills/
│   └── builtin-skills.js         # 内置技能集
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── _locales/
│   ├── zh_CN/messages.json       # 中文语言包
│   └── en/messages.json          # 英文语言包
├── tests/                        # 测试套件（23 个测试文件）
│   └── helpers/                  # 测试辅助工具
├── scripts/
│   └── build.sh                  # 打包脚本
├── docs/                         # 项目文档
├── README.md
├── CHANGELOG.md
├── PRIVACY.md
└── LICENSE
```

---

## 测试

项目使用 Node.js 内置 test runner，无需外部依赖。

```bash
# 运行全部测试
node --test tests/test-*.js

# 运行单个测试文件
node --test tests/test-utils.js
```

**测试统计**（v1.0.0）：
- 测试文件：23 个
- 测试套件：122 个
- 测试用例：537 个
- 通过率：100%

覆盖模块：utils、page-sense、skill-engine、knowledge-base、ai-client、conversation-store、highlight-store、onboarding、error-handler、stats、token-estimation、conversation-branch、prompt-templates、multi-tab、code-sandbox、custom-skills、knowledge-graph、spaced-repetition、knowledge-correlation、semantic-search、learning-path、batch-operations、conversation-storage

---

## 打包

```bash
# 生成 Chrome Web Store 上传用的 zip
bash scripts/build.sh

# 输出：dist/pagewise-v1.0.0.zip
```

---

## 隐私与安全

- **API Key**：仅存储在 Chrome 本地同步存储中，不上传任何服务器
- **知识库**：存储在浏览器 IndexedDB，完全本地
- **页面内容**：仅在用户主动操作时提取，发送到用户自己配置的 AI API
- **无追踪**：不收集任何使用数据或分析信息
- **开源透明**：所有代码可审计

详见 [PRIVACY.md](PRIVACY.md)。

---

## 浏览器兼容性

| 浏览器 | 最低版本 | 状态 |
|--------|---------|------|
| Chrome | 114+ | 完整支持（Side Panel API） |
| Edge | 114+ | 完整支持（Chromium 内核） |
| Brave | 114+ | 完整支持 |
| Firefox | - | 不支持（无 Side Panel API） |

---

## 开发指南

### 开发环境

项目无构建步骤，直接修改源码后在 Chrome 扩展管理页面点击刷新即可。

### 项目约定

- **代码风格**：ES Module，const/let 优先，无 var
- **命名**：camelCase（变量/函数），PascalCase（类）
- **注释**：关键函数必须有 JSDoc 注释
- **提交规范**：Conventional Commits（feat/fix/docs/refactor/test）
- **不引入外部依赖**：保持零依赖

### 添加新技能

在 `skills/builtin-skills.js` 中添加：

```javascript
export const mySkill = {
  id: 'my-skill',
  name: '我的技能',
  description: '技能描述',
  category: 'general',
  trigger: (pageContext) => {
    return pageContext.content?.includes('关键词');
  },
  parameters: [
    { name: 'param1', type: 'string', description: '参数说明', required: false }
  ],
  async execute(params, context) {
    const response = await context.ai.chat([...]);
    return response.content;
  }
};
```

### 添加新测试

在 `tests/` 目录创建 `test-xxx.js` 文件，使用 Node.js 内置 `node:test`：

```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('MyModule', () => {
  it('should do something', () => {
    assert.strictEqual(actual, expected);
  });
});
```

---

## 许可证

MIT License
