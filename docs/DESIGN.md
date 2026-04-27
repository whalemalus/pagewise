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
- **测试覆盖**: 95 个测试，覆盖 utils/page-sense/skill-engine/knowledge-base

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

## 已知技术债务

| ID | 描述 | 优先级 | 状态 |
|----|------|--------|------|
| TD001 | 无测试覆盖 | 高 | 待解决 |
| TD002 | ai-client.js 错误处理不完善 | 中 | 待解决 |
| TD003 | knowledge-base.js 缺少索引优化 | 低 | 待评估 |
