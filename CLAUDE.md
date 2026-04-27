# CLAUDE.md — 智阅 PageWise 项目指南

## 项目概述
智阅 PageWise 是一个 Chrome 浏览器扩展（Manifest V3），帮助用户在浏览技术网页时即时向 AI 提问，并将回答自动整理成结构化知识库。

## 技术栈
- **平台**: Chrome Extension Manifest V3
- **语言**: JavaScript (ES Modules, 无 TypeScript)
- **存储**: IndexedDB (纯本地，无后端)
- **AI**: 支持 Claude / OpenAI / DeepSeek / Ollama 等兼容 API
- **构建**: 无打包工具，直接加载解压目录
- **测试**: 待建立（优先使用原生 `chrome.test` 或轻量框架）

## 项目结构
```
pagewise/
├── background/     # Service Worker (后台)
├── content/        # Content Script (注入页面)
├── sidebar/        # Side Panel UI
├── popup/          # 弹出窗口
├── options/        # 设置页面
├── lib/            # 核心库
│   ├── ai-client.js       # AI API 客户端
│   ├── agent-loop.js      # Agent 循环
│   ├── knowledge-base.js  # 知识库 (IndexedDB)
│   ├── memory.js          # 记忆系统
│   ├── skill-engine.js    # 技能引擎
│   ├── page-sense.js      # 页面感知
│   ├── evolution.js       # 自进化系统
│   ├── importer.js        # 导入导出
│   └── utils.js           # 工具函数
├── skills/         # 内置技能定义
├── icons/          # 图标资源
├── scripts/        # 构建脚本
└── docs/           # 项目文档
```

## 开发规范
- **代码风格**: ES Module，const/let 优先，无 var
- **命名**: camelCase（变量/函数），PascalCase（类）
- **注释**: 关键函数必须有 JSDoc 注释
- **Chrome API**: 使用 Promise 风格（chrome.* API）
- **错误处理**: 所有异步操作必须 try-catch
- **提交规范**: Conventional Commits (feat/fix/docs/refactor/test)

## 迭代流程（飞轮式）
每次迭代必须按顺序完成：
1. 更新 `docs/REQUIREMENTS.md` — 需求变更
2. 更新 `docs/DESIGN.md` — 设计决策
3. 编写测试（`tests/` 目录）— 测试先行
4. 实现代码
5. 运行测试确认通过
6. 更新 `docs/CHANGELOG.md` — 记录变更
7. 更新 `docs/TODO.md` — 规划下一步

## 测试命令
```bash
# 待建立测试框架后补充
# node --test tests/
```

## 重要约束
- 不引入构建工具（webpack/vite 等），保持纯 JS 加载
- 不引入 TypeScript，保持简单
- 所有数据存储在本地 IndexedDB，不依赖后端服务
- Chrome Extension MV3 规范，不使用 MV2 API
- 权限最小化原则，manifest.json 中只声明必要权限
