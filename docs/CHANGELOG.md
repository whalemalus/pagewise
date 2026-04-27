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
- Chrome API Mock（tests/helpers/chrome-mock.js）
- IndexedDB Mock（tests/helpers/indexeddb-mock.js）
- utils.js 单元测试（21 个测试套件）
- page-sense.js 单元测试（27 个测试）
- skill-engine.js 单元测试（26 个测试）
- knowledge-base.js 单元测试（19 个测试）
- **总计 95 个测试，全部通过**
