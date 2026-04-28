# 迭代 #4 需求文档 — 用户体验增强

## 需求概览

| ID | 需求 | 优先级 | 涉及文件 |
|----|------|--------|----------|
| R040 | 停止回答按钮 | P0 | sidebar.html, sidebar.js, sidebar.css |
| R041 | 清空当前会话按钮 | P0 | sidebar.html, sidebar.js, sidebar.css |
| R042 | 右键提问自动弹出侧边栏 | P0 | background/service-worker.js |
| R043 | 显示 AI 思考过程 | P0 | sidebar.js, sidebar.css |

---

## R040: 停止回答按钮

### 描述
AI 正在流式回答时，在输入区域显示一个"停止"按钮。点击后中断 fetch 请求，保留已收到的部分回答。

### 实现方案
1. 在 `sendMessage()` 开始时创建 `AbortController`，将 `signal` 传递给 `chatStream()`
2. `chatStream()` 中 fetch 使用 `{ signal }` 参数
3. 在输入区域添加"停止"按钮（⏹️），AI 回答开始时显示，回答结束/中断时隐藏
4. 点击停止按钮调用 `abortController.abort()`
5. catch AbortError 时显示"（已停止）"而不是错误提示

### UI 要求
- 按钮位置：输入框右侧，发送按钮旁边
- 显示时机：AI 开始回答后替换发送按钮
- 隐藏时机：AI 回答完成或停止后恢复发送按钮
- 样式：红色系，hover 加深

---

## R041: 清空当前会话按钮

### 描述
在对话区域 header（和 📥📤🔄 按钮同一行）添加一个"清空对话"按钮。

### 实现方案
1. 在 sidebar.html 的 action-buttons 区域（line 32-34 附近）添加按钮
2. 点击执行：清空 conversationHistory、清空 chatArea innerHTML、清空 session storage
3. 复用已有的 `/clear` 命令逻辑

### UI 要求
- 位置：📤 按钮后面
- 图标：🗑️
- 需要确认弹窗（confirm）

---

## R042: 右键提问自动弹出侧边栏

### 描述
用户右键选择"向智阅提问"后，侧边栏应自动弹出，不需要手动点击插件图标。

### 实现方案
检查 `background/service-worker.js` 中的 `contextMenus.onClicked` listener。当前代码（line 38）已经有 `await chrome.sidePanel.open({ tabId: tab.id })`。如果这不起作用，可能是因为：
1. 需要在 manifest.json 中添加 `sidePanel` 的 `default_path` 配置
2. 或者 `chrome.sidePanel.open()` 需要在用户手势（user gesture）上下文中调用

**修复方案**：确保 `contextMenus.onClicked` 回调中正确调用 `chrome.sidePanel.open()`。如果 MV3 限制导致无法在 contextMenu 回调中打开 sidePanel，改用消息传递：service-worker 发消息给 content script，content script 调用 `chrome.runtime.sendMessage` 触发打开。

---

## R043: 显示 AI 思考过程

### 描述
当前 AI 回答时只显示 3 个跳动的点（typing indicator），用户不知道 AI 是否在工作。需要改进为：
1. 显示"正在思考..."文字（代替 3 个点）
2. 收到第一个 chunk 后立即开始显示内容（即使只有 1-2 个字）
3. 如果超过 5 秒没有收到 chunk，显示"仍在等待响应..."

### 实现方案
1. 修改 `showLoading()` 方法，返回的 loadingEl 中包含文字"正在思考..."而非 3 个点
2. 在 `sendMessage()` 的 for await 循环中，第一个 chunk 到达时立即创建 messageEl 并显示
3. 添加一个 5 秒定时器，如果还没收到 chunk，更新 loading 文字为"仍在等待响应..."

### UI 要求
- 思考中：显示 "🤔 正在思考..." 带脉冲动画
- 等待中：显示 "⏳ 仍在等待响应..." 带脉冲动画
- 收到响应：立即切换为流式文字显示
