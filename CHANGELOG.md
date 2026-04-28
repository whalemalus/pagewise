# 版本发布记录 — 智阅 PageWise

> 所有重要变更都会记录在此文件。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

---

## [1.0.0] - 2026-04-25

首个正式发布版本。

### 新增

#### 核心功能
- **页面内容提取**：Reader Mode 策略智能提取网页正文
- **AI 问答**：流式输出、多轮对话、Markdown 渲染
- **知识库存储**：基于 IndexedDB 的本地知识库
- **知识检索**：全文搜索、标签筛选、语义搜索（bigram 向量余弦相似度）
- **数据导入导出**：支持 Markdown / JSON / 纯文本格式
- **技能系统**：7 个内置技能，自定义技能系统（用户可创建，最多 20 个）
- **页面感知**：6 种页面类型自动识别（通用网页、API 文档、GitHub 仓库、YouTube、PDF、代码仓库）
- **记忆系统**：用户画像、知识召回
- **自进化**：隐式反馈、风格自适应
- **右键菜单**：「用 智阅 提问」和「用 AI 总结此页面」

#### 页面类型支持
- **API 文档专用模式**：自动提取端点列表，按方法分组展示
- **GitHub 仓库页面理解**：自动分析 README、目录结构、语言统计
- **YouTube 视频字幕提取与总结**：DOM 提取 + 多策略兜底
- **PDF 文档阅读**：多策略文本提取，支持 Chrome PDF viewer
- **多页面联合分析**：同时分析最多 5 个标签页

#### 智能功能
- **多模态图片理解**：页面图片提取与 AI 视觉问答
- **代码执行沙箱**：AI 回答中的代码可在侧边栏直接运行
- **Prompt 模板库**：内置模板 + 自定义模板一键调用
- **对话分支**：从任意 AI 回答节点分叉探索不同方向
- **Token 窗口管理**：对话 token 用量估算与警告
- **学习路径生成**：AI 基于知识库生成个性化学习路线
- **间隔复习系统**：基于 SM-2 算法的知识卡片复习
- **知识图谱可视化**：Canvas 力导向图展示知识关联
- **知识关联引擎**：自动发现知识条目间的关联

#### 界面与交互
- **AxonHub 风格 API 配置**：提供商卡片选择器，模型发现
- **多配置 Profile**：保存/切换/删除多套 API 配置
- **暗色主题**：CSS 变量切换，支持跟随系统
- **划词提问**：选中文本后浮动按钮直接提问
- **页面内容预览面板**：透明展示 AI 看到的内容
- **数据统计仪表盘**：使用统计与趋势分析
- **新手引导流程**：首次安装分步引导
- **Toast 通知系统**：info/success/error/warning 动画提示
- **代码块复制按钮**：hover 显示，一键复制
- **快捷键系统**：Ctrl+Shift+Y（打开侧边栏）、Ctrl+Shift+S（总结页面）、Ctrl+Shift+X（切换侧边栏）

#### 数据管理
- **知识库批量管理**：批量选择/删除/打标签/导出
- **对话历史持久化**：chrome.storage.session，24 小时自动过期
- **对话导出**：导出为 Markdown 文件
- **页面高亮标注**：选中文本高亮保存，跨访问持久化
- **语义搜索**：bigram 向量余弦相似度智能搜索

#### 技术基础设施
- **错误处理全面升级**：全局捕获/友好提示/重试机制
- **性能优化**：分页加载/搜索缓存/懒加载
- **Chrome API Mock**：tests/helpers/chrome-mock.js
- **IndexedDB Mock**：tests/helpers/indexeddb-mock.js

### 测试

- 建立测试框架（Node.js 内置 test runner）
- 核心模块单元测试：415 个测试，全部通过
- 覆盖模块：utils、page-sense、skill-engine、knowledge-base、ai-client、conversation-store、highlight-store、onboarding、error-handler、stats、token-estimation、conversation-branch、prompt-templates、multi-tab、code-sandbox、custom-skills、knowledge-graph、spaced-repetition、knowledge-correlation、semantic-search、learning-path、batch-operations、conversation-storage

### Chrome Web Store 准备

- 权限最小化审查：移除未使用的 `activeTab` 权限
- 添加中英文 `description` 字段
- 创建隐私政策文档（PRIVACY.md）
- 创建商店 listing 描述（STORE-LISTING.md）
- 创建打包脚本（scripts/build.sh）
