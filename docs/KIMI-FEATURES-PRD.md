# Kimi 特性引入 — 详细实现计划

> 优先级: P0 (立即开始)
> 预计周期: 4-6 周
> 参考: docs/KIMI-EXTENSION-ANALYSIS.md

---

## 一、任务清单

### KIMI-P0-001: SelectionFloatingToolbar (1-2周)

**目标**: 参考 Kimi 的划线浮动按钮设计，实现选中文字后弹出快捷操作栏

**现有基础**: PageWise 已有 `getSelectionInfo()` 和 `applyHighlight()` 函数

**实现步骤**:

1. **创建浮动工具栏 UI 组件** (lib/selection-toolbar.js)
   ```
   - 监听 document.mouseup 事件
   - 检测是否有选中文本
   - 计算选区位置（getBoundingClientRect）
   - 在选区上方/下方显示浮动按钮
   - 按钮样式：圆角、阴影、半透明背景
   ```

2. **实现 4 个快捷操作**
   - **解释**: 将选中文本发送给 AI，请求解释
   - **翻译**: 自动检测语言，翻译为中文/英文
   - **总结**: 对选中文本生成简短摘要
   - **问AI**: 打开 Side Panel，预填选中文本为问题

3. **与现有高亮系统集成**
   - 浮动工具栏与高亮功能共存
   - 高亮操作后自动隐藏工具栏
   - 工具栏不干扰页面正常选择

4. **键盘快捷键支持**
   - Ctrl+Shift+E: 解释选中文本
   - Ctrl+Shift+T: 翻译选中文本
   - Ctrl+Shift+S: 总结选中文本

**测试要点**:
- 选中短文本（1-5字）
- 选中长文本（100+字）
- 选中跨段落文本
- 选中代码块
- 选中链接/图片 alt 文本
- 浮动按钮位置边界检测（不超出视口）

---

### KIMI-P0-002: PageSummaryButton (1周)

**目标**: 在 Side Panel 顶部添加一键全文总结按钮

**现有基础**: PageWise 已有 AI 客户端和页面内容提取能力

**实现步骤**:

1. **添加「总结全文」按钮到 Side Panel**
   ```
   - 位置: Side Panel 顶部工具栏
   - 图标: 📄 或类似
   - 点击触发全文总结流程
   ```

2. **页面内容提取优化**
   - 使用 Readability.js 算法提取正文
   - 过除导航、广告、页脚等干扰内容
   - 保留标题、段落、列表、代码块结构

3. **AI 总结 Prompt 设计**
   ```
   请对以下内容生成结构化摘要:
   1. 核心主题（一句话）
   2. 关键要点（3-5个）
   3. 重要细节（如有）
   4. 行动建议（如有）

   内容:
   {page_content}
   ```

4. **流式输出实现**
   - 使用现有 ai-client.js 的流式 API
   - 实时显示生成过程
   - 支持停止生成

5. **结果保存功能**
   - 一键保存摘要到知识库
   - 自动关联当前页面 URL
   - 添加「摘要」标签

**测试要点**:
- 短文章（<1000字）
- 长文章（>5000字）
- 技术文档
- 新闻文章
- 博客文章
- 流式输出中断恢复

---

### KIMI-P0-003: ExploreModeShortcut (1周)

**目标**: 实现 Ctrl+J Explore 快捷模式

**实现步骤**:

1. **注册快捷键**
   ```json
   // manifest.json
   "commands": {
     "explore": {
       "description": "Explore 模式",
       "suggested_key": { "default": "Ctrl+J" }
     }
   }
   ```

2. **模式状态管理**
   - Service Worker 维护模式状态
   - Content Script 通过消息同步状态
   - 状态栏显示当前模式

3. **Explore 模式行为**
   - 划线: 自动显示解释浮动框
   - 截图: 自动 OCR 识别文字
   - 点击链接: 预览内容摘要
   - 点击图片: 识别图片内容

4. **退出机制**
   - Esc 键退出
   - 再次 Ctrl+J 切换
   - 点击页面空白处退出

---

### KIMI-P0-004: ChatModeShortcut (1周)

**目标**: 实现 Ctrl+K Chat 快捷模式

**实现步骤**:

1. **注册快捷键**
   ```json
   "commands": {
     "chat": {
       "description": "Chat 模式",
       "suggested_key": { "default": "Ctrl+K" }
     }
   }
   ```

2. **显示方式切换**
   - 全局浮窗: 居中显示，可拖动
   - 侧边栏: 右侧固定面板
   - 记住用户偏好

3. **上下文自动携带**
   - 自动提取当前页面标题和 URL
   - 自动提取页面主要摘要
   - 在 Chat 开始时注入上下文

4. **@ 引用功能**
   - 输入 @ 弹出页面元素列表
   - 支持引用: 标题、段落、图片、链接
   - 引用内容高亮显示

---

### KIMI-P0-005: SelectionEnhancement (1-2周)

**目标**: 增强选中文本智能处理

**实现步骤**:

1. **内容类型检测**
   - 代码片段: 检测语言特征（关键字、缩进）
   - URL: 正则匹配 http/https 链接
   - 错误信息: 检测 Error/Exception/Traceback
   - 数学公式: 检测数字和运算符
   - 英文: 字符比例判断

2. **智能处理策略**
   ```
   if (isCode) → 代码解释 + 语法高亮
   if (isURL) → 链接预览 + 内容摘要
   if (isError) → 搜索解决方案
   if (isMath) → 计算结果
   if (isEnglish) → 翻译 + 例句
   else → 通用解释
   ```

3. **结果展示**
   - 浮动卡片显示结果
   - 支持复制结果
   - 一键保存到知识库

---

### KIMI-P0-006: QuickActionMenu (3-5天)

**目标**: 增强 Chrome 右键菜单

**实现步骤**:

1. **注册 Context Menu**
   ```javascript
   chrome.contextMenus.create({
     id: 'pagewise-explain',
     title: '用 PageWise 解释',
     contexts: ['selection']
   });
   ```

2. **菜单项设计**
   - 选中文本: 解释、翻译、总结
   - 右键图片: 识别文字、描述图片
   - 右键链接: 预览内容、保存书签

3. **点击处理**
   - 打开 Side Panel
   - 执行对应操作
   - 显示结果

---

## 二、技术依赖

| 依赖 | 用途 | 版本 |
|------|------|------|
| Readability.js | 页面正文提取 | 已有 |
| Tesseract.js | OCR 文字识别 | 需引入 |
| marked.js | Markdown 渲染 | 已有 |

---

## 三、验收标准

### 功能验收
- [ ] 所有快捷键正常工作
- [ ] 浮动工具栏样式美观
- [ ] 全文总结结果准确
- [ ] Explore/Chat 模式切换流畅
- [ ] 选中文本智能检测准确
- [ ] 右键菜单功能完整

### 性能验收
- [ ] 浮动工具栏显示 < 100ms
- [ ] 全文总结响应 < 3s (首token)
- [ ] 模式切换 < 200ms
- [ ] 不影响页面正常性能

### 兼容性验收
- [ ] Chrome 最新版
- [ ] Edge 最新版
- [ ] 不与现有功能冲突
- [ ] 不与高亮系统冲突
