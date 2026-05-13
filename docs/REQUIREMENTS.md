# 需求文档 — 智阅 PageWise

> 最后更新: 2026-04-26

## 需求状态图例
- ✅ 已实现
- 🔨 进行中
- 📋 待开发
- ❌ 已放弃

---

## P0 — 核心功能（v1.0）

### ✅ R001: 页面内容提取
- **描述**: 自动提取当前网页核心内容（Reader Mode 策略）
- **验收标准**: 能正确提取 article/main 标签，兜底提取语义标签
- **限制**: 单次提取上限 8000 字符

### ✅ R002: AI 问答
- **描述**: 基于页面内容回答用户技术问题
- **验收标准**: 支持流式输出、多轮对话（最近 6 轮）、右键菜单提问
- **模型**: 支持 Claude / OpenAI / DeepSeek / Ollama

### ✅ R003: 知识库存储
- **描述**: 将 AI 回答保存为结构化知识条目
- **存储**: IndexedDB
- **自动生成**: 保存时 AI 自动提取摘要和标签

### ✅ R004: 知识检索
- **描述**: 全文搜索、标签筛选、按时间排序

### ✅ R005: 数据导出
- **描述**: 导出为 Markdown / JSON 格式

### ✅ R006: 技能系统
- **描述**: 7 个内置技能，根据页面内容自动推荐

### ✅ R007: 页面感知
- **描述**: 自动识别页面类型，推荐对应操作

### ✅ R008: 记忆系统
- **描述**: 用户画像学习、知识召回、加权检索

### ✅ R009: 自进化
- **描述**: 隐式反馈学习、回答风格自适应、用户水平推断

### ✅ R016: YouTube 视频字幕总结
- **描述**: 自动识别 YouTube 视频页面，提取字幕，支持视频内容总结和问答
- **优先级**: P1
- **依赖**: R002, R007
- **实现**:
  - 页面感知：YouTube 视频页面识别（URL 含 youtube.com/watch）
  - 字幕提取：DOM 提取（展开面板） + API 兜底（ytInitialPlayerResponse）
  - 快捷操作：总结视频、提取字幕按钮
  - AI 总结：针对口语化字幕的智能总结

### ✅ R017: 多页面联合分析
- **描述**: 用户可选择多个浏览器标签页，让 AI 同时分析多个页面的内容
- **优先级**: P1
- **依赖**: R002
- **实现**:
  - 标签页收集：background service worker 提供 collectAllTabs / collectTabContent 消息处理
  - 选择界面：弹窗式标签页列表，支持复选框多选
  - 内容截取：每个标签页最多 3000 字符，最多同时分析 5 个
  - 联合分析 prompt：逐一摘要 + 关联性 + 差异对比 + 综合洞察
  - 受限页面跳过：chrome:// 等无法注入脚本的页面自动标记为不可访问

---

## P1 — 增强功能（v1.1）

### 📋 R010: 划词提问
- **描述**: 选中文本后出现浮动按钮，点击直接提问
- **优先级**: P1
- **依赖**: R002

### 📋 R011: 对话历史
- **描述**: 按页面 URL 保存对话历史，重新访问时恢复
- **优先级**: P1

### 📋 R012: 页面高亮关联
- **描述**: AI 回答中引用的内容可高亮定位到页面原位置
- **优先级**: P1

---

## P2 — 远期功能（v2.0）

### 📋 R013: 知识图谱
### 📋 R014: 云端同步
### 📋 R015: 学习模式（间隔重复）

### ✅ R018: 自定义技能系统
- **描述**: 用户可以创建自己的技能（类似 GPTs），让 PageWise 从工具变成平台
- **优先级**: P1
- **依赖**: R006
- **实现**:
  - IndexedDB 存储：lib/custom-skills.js，独立数据库存储自定义技能
  - CRUD 完整操作：saveSkill / getAllSkills / getSkillById / deleteSkill / toggleSkill
  - 模板语法：支持 `{{变量名}}` 占位符，执行时自动替换
  - 技能编辑器 UI：内嵌在技能面板中，支持新建/编辑/删除
  - 自定义标记：自定义技能在列表中标记为「自定义」徽章
  - 数量上限：最多 20 个自定义技能
  - 分类筛选：新增「自定义」分类筛选标签

### ✅ R019: API 文档专用模式
- **描述**: 识别 API 文档页面（Swagger、OpenAPI、REST API），自动提取端点列表、参数、示例，并提供专用操作
- **优先级**: P1
- **依赖**: R002, R007
- **实现**:
  - 页面感知：URL 匹配 `/api/`, `/docs/`, `/reference/`, `/swagger/`, `/openapi/`；Swagger UI 元素检测；HTTP 方法频率检测
  - 端点提取：Swagger UI (.opblock) DOM 提取 → Redoc DOM 提取 → 通用文本模式匹配
  - 返回格式：`{ endpoints: [{ method, path, description, params }] }`
  - 快捷操作：「📋 提取 API 端点」结构化展示、「📊 生成 API 摘要」AI 总结
  - 约束：最多 50 个端点，不引入外部依赖

### ✅ R020: GitHub 仓库页面理解
- **描述**: 打开 GitHub 仓库页面时，自动分析 README、目录结构、关键文件，提供仓库概览
- **优先级**: P1
- **依赖**: R002, R007
- **实现**:
  - 页面感知：精确识别 GitHub 仓库页面（github-repo 类型），区分 repo-root / repo-file / repo-issues / repo-pr / repo-wiki / repo-releases
  - 新增方法：`isGitHubRepoPage(url)` / `detectGitHubPageType(url)` 用于 URL 模式匹配
  - Content Script：提取 README（.markdown-body，前 5000 字符）、目录结构（前 50 项）、仓库描述、语言统计、star/fork 数
  - Sidebar：仓库根页面显示「📖 分析这个仓库」和「📋 提取仓库信息」快捷按钮
  - AI 概览：项目简介、技术栈、目录结构说明、快速开始建议、亮点与特色
  - 约束：只分析仓库根目录页面，README 截取前 5000 字符，目录列表截取前 50 项

### 🔨 R021: 代码执行沙箱
- **描述**: AI 回答中的 HTML/JavaScript 代码可以直接在侧边栏运行，显示输出结果，实现学习闭环
- **优先级**: P1
- **依赖**: R002
- **实现**:
  - AI 消息操作按钮中添加「▶️ 运行」按钮（仅含 html/javascript 代码块时显示）
  - 每个可运行代码块旁独立「▶️ 运行」按钮
  - 沙箱 iframe 执行：`sandbox="allow-scripts"`，不允许访问父页面 DOM 或网络请求
  - console.log / console.info / console.warn / console.error 输出捕获
  - 错误信息显示（含堆栈）
  - 执行超时 5 秒自动终止
  - 安全：Blob URL 隔离，iframe 隐藏，postMessage 通信
  - 约束：只支持 HTML 和 JavaScript 代码块，不引入外部依赖

### ✅ R80: BookmarkI18n 国际化
- **描述**: 书签面板国际化支持
- **优先级**: P1
- **验收标准**:
  - 中英文界面切换（chrome.i18n API 或自定义 i18n 模块）
  - 所有用户可见字符串外部化（不硬编码中文/英文）
  - 语言偏好持久化存储
  - 新增语言只需添加翻译文件
- **实现**:
  - `lib/bookmark-i18n.js` — 书签 i18n 核心模块
  - 42+ 个 i18n key 覆盖搜索/过滤/状态/统计/面板/详情/概览/集合等
  - 与 `lib/i18n.js` 全局 i18n 系统集成，模块加载自动注册
  - `getStatusLabel()` / `getStatusLabels()` / `formatDateByLocale()` / `createBookmarkT()` 工具函数
  - `validateLocaleCompleteness()` 语言包完整性校验
  - `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json` 同步更新
  - 新增语言只需 `registerBookmarkLocale({ extraLocales: { 'ja-JP': {...} } })`
  - 测试: 37 用例 ✅

### ✅ R79: BookmarkAccessibility 无障碍支持
- **描述**: 书签面板无障碍功能支持
- **优先级**: P1
- **验收标准**:
  - 键盘导航支持（Tab/Enter/Escape/Arrow）
  - 屏幕阅读器支持（aria-label, role, live regions）
  - 焦点管理（焦点环、焦点陷阱）
  - 颜色对比度 ≥ 4.5:1
- **实现**:
  - `lib/bookmark-accessibility.js` — 纯逻辑模块
  - 键盘导航: Arrow Up/Down/Home/End 导航列表，Enter 打开详情，Escape 关闭
  - 焦点陷阱: createFocusTrap 限制 Tab 焦点在详情面板内循环
  - ARIA: role=list/listitem/status/toolbar/dialog/live region
  - Live Region: 书签加载/搜索/详情开关自动公告屏幕阅读器
  - 对比度审计: auditContrast() 检测 WCAG AA ≥ 4.5:1
  - CSS: --text-muted 修复 (3.3:1→4.69:1), 状态徽章对比度, focus-visible, .sr-only, forced-colors
  - 测试: 49 用例

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-13 | R79 | 新增 BookmarkAccessibility 无障碍支持需求 |
| 2026-04-26 | 全部 | 初始化需求文档，从 product-spec.md 提取 |
