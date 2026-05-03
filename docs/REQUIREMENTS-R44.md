# R44: Message Renderer E2E 测试需求

## 任务
创建 tests/test-message-renderer-e2e.js，测试 lib/message-renderer.js 的 MessageRenderer 类。

## API 清单
- constructor({ chatArea, escapeHtml, scrollToBottom, evolution, currentTabId, saveToKnowledgeBase, handleBranch, runAllCodeBlocks, executeCodeSandbox })
- addUserMessage(text, selection='') — 添加用户消息
- addAIMessage(content) — 添加 AI 消息（支持 Markdown、代码块）
- addSystemMessage(text) — 添加系统消息
- _createMessageElement(msg) — 根据消息类型创建元素
- _buildUserElement(text, selection) — 构建用户消息元素
- _buildAIElement(content) — 构建 AI 消息元素（含代码块检测）
- _buildSystemElement(text) — 构建系统消息元素
- handleMessageAction(action, messageEl) — 处理消息操作按钮
- _appendNewMessage(messageDiv) — 追加新消息到 DOM
- destroy() — 清理 observer 和 sentinel

## 已有测试
tests/test-message-renderer-lazy.js (19 tests) 覆盖懒渲染逻辑

## 测试模板
需要 mock: document, IntersectionObserver, chrome.runtime
```javascript
// Minimal DOM mock (参考 test-message-renderer-lazy.js 的 mock 模式)
```

## 要求
- 至少 20 个测试场景
- 覆盖：addUserMessage、addAIMessage、addSystemMessage、_createMessageElement、消息操作按钮、代码块检测、destroy 清理
- 边界：空消息、超长消息、特殊字符、无 chatArea
- 运行 node --test tests/test-message-renderer-e2e.js 确认通过
- git commit -m "test: R44 Message Renderer E2E — 20+ test scenarios"
