# 飞轮迭代 R1: sidebar.js 代码拆分 — 消息系统

## 目标
将 sidebar.js (6,553行) 中的消息渲染相关代码提取到独立模块 `lib/message-renderer.js`。

## 当前状态
消息相关函数散布在 sidebar.js 中，被调用 148 次。这些函数依赖 `this.chatArea`、`this.escapeHtml()` 等实例属性。

## 需要提取的函数
1. `addAIMessage(content)` — 创建 AI 消息（含 action 按钮）
2. `addUserMessage(text, selection)` — 创建用户消息
3. `addSystemMessage(text)` — 创建系统消息
4. `updateAIMessage(messageEl, content)` — 更新 AI 消息内容
5. `showLoading()` — 显示加载动画
6. `handleMessageAction(action, messageEl)` — 处理复制/保存/高亮/分支
7. `injectCodeBlockRunButtons(messageEl, content)` — 注入代码块运行按钮

## 实现方案
1. 创建 `lib/message-renderer.js`，导出 `MessageRenderer` 类
2. 构造函数接收依赖: `{ chatArea, escapeHtml, scrollToBottom, memory, aiClient, conversationHistory, currentPageContent, currentTabId, branches, addSystemMessage }`
3. sidebar.js 中 `new MessageRenderer(...)` 实例化，消息方法委托给它
4. 保留原有方法签名不变（调用方不感知变化）

## 验收标准
- [ ] sidebar.js 减少 500+ 行
- [ ] 新增 `lib/message-renderer.js`
- [ ] 所有 134 个测试通过
- [ ] git commit: `refactor: extract message system to lib/message-renderer.js`
