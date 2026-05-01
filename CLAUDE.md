# CLAUDE.md — 智阅 PageWise 项目指南

> **Claude Code 每次启动时自动读取此文件。所有编码任务必须遵守以下规范。**

## 项目概述
智阅 PageWise 是一个 Chrome 浏览器扩展（Manifest V3），帮助用户在浏览技术网页时即时向 AI 提问，并将回答自动整理成结构化知识库。

## 技术栈
- **平台**: Chrome Extension Manifest V3
- **语言**: JavaScript (ES Modules, 无 TypeScript)
- **存储**: IndexedDB (纯本地，无后端)
- **AI**: 支持 Claude / OpenAI / DeepSeek / Ollama 等兼容 API
- **构建**: 无打包工具，直接加载解压目录
- **测试**: Node.js 内置测试框架 `node:test`

## 项目结构
```
pagewise/
├── background/     # Service Worker (后台)
│   └── service-worker.js
├── content/        # Content Script (注入页面)
│   ├── content.js
│   └── content.css
├── sidebar/        # Side Panel UI
│   ├── sidebar.html
│   ├── sidebar.js
│   └── sidebar.css
├── popup/          # 弹出窗口
├── options/        # 设置页面
├── lib/            # 核心库 (35+ 模块)
│   ├── ai-client.js          # AI API 客户端
│   ├── conversation-store.js  # 对话存储
│   ├── knowledge-base.js     # 知识库
│   ├── embedding-engine.js   # 语义搜索引擎
│   ├── page-sense.js         # 页面感知
│   ├── skill-engine.js       # 技能引擎
│   ├── wiki-store.js         # Wiki 系统
│   ├── highlight-store.js    # 高亮标注
│   ├── learning-path.js      # 学习路径
│   ├── spaced-repetition.js  # 间隔复习
│   ├── plugin-system.js      # 插件系统
│   ├── message-renderer.js   # 消息渲染
│   ├── error-handler.js      # 错误处理
│   ├── cost-estimator.js     # 成本估算
│   └── utils.js              # 工具函数
├── skills/         # 内置技能定义
├── tests/          # 测试文件 (70+ 文件)
│   └── helpers/    # 测试辅助 (chrome-mock, indexeddb-mock)
├── icons/          # 图标资源
├── scripts/        # 构建脚本
└── docs/           # 项目文档
```

## 开发规范

### 代码风格
- ES Module（`import/export`），`const/let` 优先，禁止 `var`
- 命名：camelCase（变量/函数），PascalCase（类/构造函数）
- 关键函数必须有 JSDoc 注释
- 所有异步操作必须 `try-catch`
- 无分号风格（与现有代码一致）

### Chrome API
- 使用 Promise 风格（`chrome.*` API）
- Service Worker 中不能使用 `window`、`document`
- Content Script 中访问页面 DOM 需通过 `chrome.runtime.sendMessage`

### 提交规范
Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

## 测试

### 运行命令
```bash
# 运行全部测试
node --test tests/test-*.js

# 运行单个测试文件
node --test tests/test-embedding-engine.js

# 运行并查看详细输出
node --test tests/test-*.js 2>&1 | grep -E "^(not ok|# (tests|pass|fail))"
```

### 测试规范
- 使用 `node:test` 框架（`describe`, `it`, `beforeEach`）
- 使用 `node:assert/strict` 断言
- Chrome API mock: `tests/helpers/chrome-mock.js`
- IndexedDB mock: `tests/helpers/indexeddb-mock.js`
- **必须全部通过后才能 commit**
- 当前测试数: 1873（保持或增加，不能减少）

## 质量门控体系

### 评分维度（满分 100%）
| 维度 | 权重 | 评分标准 |
|------|------|----------|
| 需求符合度 | 30% | 功能是否完整实现，边界情况是否处理 |
| 代码质量 | 25% | 可读性、复杂度、设计模式、JSDoc |
| 安全性 | 20% | 注入风险、认证、数据泄露、硬编码密钥 |
| 性能 | 15% | 算法效率、内存使用、懒加载 |
| 测试覆盖 | 10% | 关键逻辑有测试、测试数不减少 |

### 质量门控规则
- **≥90%**: ✅ 通过，可以 commit
- **80-89%**: ⚠️ 需修复后重新验证
- **<80%**: ❌ 必须返工，最多重试 3 轮
- 每轮返工必须在 `docs/VERIFICATION.md` 记录评分和改进建议

### 自动门控循环
```
实现代码 → 运行测试 → 质量评分 → ≥90%? → commit
                              ↓ <90%
                    记录问题 → 修复 → 重新评分（最多3轮）
```

## 重要约束
- 不引入构建工具（webpack/vite 等），保持纯 JS 加载
- 不引入 TypeScript，保持简单
- 所有数据存储在本地 IndexedDB，不依赖后端服务
- Chrome Extension MV3 规范，不使用 MV2 API
- 权限最小化原则，manifest.json 中只声明必要权限
- 修改代码后必须运行测试确认无回归
