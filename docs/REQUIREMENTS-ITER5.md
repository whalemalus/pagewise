# 迭代 #5 需求文档 — 技能详情 + 自动刷新

## 需求概览

| ID | 需求 | 优先级 | 涉及文件 |
|----|------|--------|----------|
| R044 | 查看技能 prompt 模板详情 | P1 | sidebar.html, sidebar.js, sidebar.css |
| R045 | 网页刷新时自动刷新插件内容 | P1 | sidebar.js |

---

## R044: 查看技能 prompt 模板详情

### 描述
当前技能列表只显示名称、描述、触发类型。用户希望能查看技能的完整详情，包括：
- 参数列表（名称、类型、描述、是否必填）
- 触发条件详细说明
- 执行逻辑概述

### 实现方案
1. 在每个技能卡片的 footer 添加"详情"按钮（ℹ️）
2. 点击后展开/折叠一个详情区域（在卡片下方）
3. 详情区域显示：
   - **参数表格**：参数名 | 类型 | 描述 | 是否必填
   - **触发条件**：自动/手动 + 具体条件描述
   - **说明**：技能的完整描述文字

### 数据来源
技能对象结构（来自 skills/builtin-skills.js）：
```javascript
{
  id: 'code-explain',
  name: '解释代码',
  description: '逐行解释代码的含义和作用',
  category: 'code',
  parameters: [
    { name: 'code', type: 'string', description: '要解释的代码', required: false }
  ],
  trigger: (ctx) => ...,  // 函数
  execute: async (params, context) => ...  // 函数
}
```

对于内置技能的 trigger 函数，无法直接获取"人类可读描述"。可以：
- 如果 trigger.type === 'auto'，显示"当页面满足特定条件时自动触发"
- 如果是手动触发，显示"用户点击运行时触发"
- parameters 数组直接渲染为表格

### UI 要求
- 详情区域用 slideDown 动画展开
- 参数表格简洁，4 列：参数名 | 类型 | 说明 | 必填
- 无参数时显示"此技能无自定义参数"
- 再次点击"详情"按钮折叠

---

## R045: 网页刷新时自动刷新插件内容

### 描述
当前用户刷新网页后，需要手动点击插件的🔄按钮才能更新页面内容。应该自动检测页面变化并刷新。

### 实现方案
在 sidebar.js 的 init() 或 listenMessages() 中添加 Chrome tabs 事件监听：

```javascript
// 监听标签页更新（URL 变化、刷新、加载完成）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === this.currentTabId && changeInfo.status === 'complete') {
    this.loadPageContext();
    if (this.settings.autoExtract) {
      this.extractContent();
    }
  }
});

// 监听标签页切换
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (activeInfo.windowId === chrome.windows.WINDOW_ID_CURRENT) {
    this.currentTabId = activeInfo.tabId;
    this.loadPageContext();
  }
});
```

### 注意事项
1. `onUpdated` 会触发多次（loading → complete），只在 `changeInfo.status === 'complete'` 时刷新
2. 避免在用户正在输入时打断 — 如果 userInput 有内容，不自动刷新
3. 添加防抖（debounce），300ms 内只触发一次
4. 不要清空当前对话，只更新页面内容缓存（currentPageContent）
