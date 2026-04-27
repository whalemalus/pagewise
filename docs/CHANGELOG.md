# 变更日志 — 智阅 PageWise

> 所有重要变更都会记录在此文件。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

---

## [1.0.0] - 2026-04-25

### 新增
- 页面内容提取（Reader Mode 策略）
- AI 问答（流式输出、多轮对话）
- 知识库存储（IndexedDB）
- 知识检索（全文搜索、标签筛选）
- 数据导出（Markdown / JSON）
- 技能系统（7 个内置技能）
- 页面感知（6 种页面类型识别）
- 记忆系统（用户画像、知识召回）
- 自进化（隐式反馈、风格自适应)
- 右键菜单「用 智阅 提问」
- 数据导入（JSON / Markdown / 纯文本）

---

## [1.1.0] - 2026-04-27

### 新增
- 对话持久化（chrome.storage.session，24 小时自动过期）
- `/clear` 命令清除对话历史
- 代码块复制按钮（hover 显示，点击复制并反馈）
- Toast 通知系统（info/success/error/warning，动画滑入淡出）
- 对话持久化测试（9 个测试）
- renderMarkdown 代码块复制按钮测试（2 个测试）
- **总计 106 个测试，全部通过**

---

## [Unreleased]

### 新增
- 项目飞轮迭代模板（CLAUDE.md、docs/）
- 测试框架（Node.js 内置 test runner）
- **AxonHub 风格 API 配置**：提供商卡片选择器（OpenAI/Claude/DeepSeek/Ollama/自定义）
- **模型发现**：一键从 API 获取可用模型列表
- **多配置 Profile**：保存/切换/删除多套 API 配置
- **暗色主题**：CSS 变量切换，支持跟随系统
- **划词提问**：选中文本后浮动按钮直接提问
- **AIClient.listModels()** 方法
- **Profile 存储**：saveProfiles/loadProfiles 工具函数
- Chrome API Mock（tests/helpers/chrome-mock.js）
- IndexedDB Mock（tests/helpers/indexeddb-mock.js）
- utils.js 单元测试（21 个测试套件）
- page-sense.js 单元测试（34 个测试）
- skill-engine.js 单元测试（26 个测试）
- knowledge-base.js 单元测试（19 个测试）
- **YouTube 视频字幕提取与总结**：
  - 页面感知：自动识别 YouTube 视频页面，提取 video ID、标题、频道名
  - 字幕提取：DOM 提取优先，展开面板兜底，ytInitialPlayerResponse API 兜底
  - 快捷操作：YouTube 页面显示「总结视频」「提取字幕」按钮
  - AI 总结：口语化字幕智能总结，含概述、要点、详细总结、金句
  - 字幕截取：前 8000 字符限制
  - 7 个 YouTube 相关测试
- **多页面联合分析**：
  - Background service worker：collectAllTabs / collectTabContent 消息处理
  - 标签页选择弹窗：复选框多选，支持最多 5 个标签页
  - 受限页面检测：chrome:// 等不可访问页面自动跳过并提示
  - 内容截取：每个标签页最多 3000 字符
  - 联合分析 prompt：逐一摘要 + 关联性分析 + 差异对比 + 综合洞察
  - 入口：页面预览面板 header + 问答面板快捷操作
  - 28 个多页面联合分析测试
- **总计 188 个测试，全部通过**

### 自定义技能系统
- **lib/custom-skills.js**：IndexedDB 存储模块，独立数据库 `pagewise_custom_skills`
- **CRUD 完整**：saveSkill / getAllSkills / getSkillById / deleteSkill / toggleSkill
- **模板语法**：`{{变量名}}` 占位符，renderTemplate / extractTemplateVars
- **技能编辑器 UI**：sidebar.html 内嵌表单，支持新建/编辑/删除
- **自定义标记**：自定义技能在列表中标记为「自定义」徽章
- **数量上限**：最多 20 个自定义技能
- **分类筛选**：新增「自定义」分类标签
- **30 个自定义技能测试，全部通过**
- **总计 218 个测试，全部通过**
