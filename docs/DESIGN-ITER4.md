# 设计文档 — 迭代 #4: 页面高亮关联 (R012)

> 日期: 2026-04-30
> 状态: 待实现

---

## 1. 概述

本轮迭代实现 **R012: 页面高亮关联**，核心功能是让 AI 回答中的引用文本（行内代码、引用块）可点击跳转，在页面中高亮并定位到原文位置。

### 数据流

```
用户提问 → AI 流式回答
                ↓
    message-renderer.js 渲染 AI 消息
                ↓
    _injectQuoteAttributes() 扫描行内代码/引用块
                ↓ 注入 data-quote + 可点击样式
    用户点击引用文本
                ↓
    chrome.tabs.sendMessage('locateAndHighlight', { text })
                ↓
    content.js locateAndHighlight() 处理
                ↓
    1. 清除旧临时高亮
    2. 页面 TreeWalker 文本搜索
    3. 创建 <span class="pw-flash-highlight"> 包裹
    4. scrollIntoView 滚动定位
    5. 3s 后 opacity 淡出 + DOM 移除
```

---

## 2. 需要修改的文件列表

| 文件 | 改动类型 | 改动范围 |
|------|---------|---------|
| `content/content.js` | 修改 | 新增 `locateAndHighlight` action、`flashHighlight()` 函数、临时高亮清理逻辑 |
| `content/content.css` | 修改 | 新增 `.pw-flash-highlight` 样式（含淡出动画） |
| `lib/message-renderer.js` | 修改 | `_buildAIElement()` 渲染后注入 `data-quote` 属性、绑定点击事件 |
| `sidebar/sidebar.css` | 修改 | 新增 `.pw-quote-link` 可点击引用样式 |
| `docs/DESIGN.md` | 修改 | 追加 D014 设计决策 |

**不修改的文件**:
- `lib/highlight-store.js` — 约束要求不修改已有接口
- `lib/utils.js` — `renderMarkdown()` 不改动，引用标记在 DOM 层面注入而非 Markdown 层面
- `sidebar/sidebar.js` — 无需改动，消息发送通过 `message-renderer` 的 `currentTabId` 直接进行

---

## 3. 新增函数/类

### 3.1 content/content.js — 新增函数

#### `flashHighlight(text)`

**职责**: 在页面中查找文本，创建临时高亮，3 秒后自动消失并移除 DOM 元素。

**设计**: 不修改已有的 `highlightText()`，独立实现，避免影响已有高亮逻辑。

```
flashHighlight(text: string): { success: boolean, error?: string }

流程:
1. 调用 clearFlashHighlights() 清除所有现有临时高亮
2. 使用 TreeWalker 遍历 document.body 文本节点
3. 跳过 SCRIPT/STYLE/NOSCRIPT/pagewise-highlight/pw-flash-highlight 元素
4. 找到文本匹配 → 创建 <span class="pw-flash-highlight">
5. range.surroundContents(span) 包裹
6. span.scrollIntoView({ behavior: 'smooth', block: 'center' })
7. 启动 3s 定时器 → opacity 渐隐动画 → 1s 后 DOM 移除
8. 未找到 → 返回 { success: false, error: '...' }
```

**返回值**:
- `{ success: true }` — 成功高亮并滚动
- `{ success: false, error: '未在页面中找到该内容' }` — 定位失败

#### `clearFlashHighlights()`

**职责**: 移除页面中所有临时高亮元素（`pw-flash-highlight`），取消正在运行的定时器。

```
clearFlashHighlights(): void

流程:
1. 取消全局 _flashTimeout 定时器（如存在）
2. document.querySelectorAll('.pw-flash-highlight')
3. 每个元素: el.replaceWith(document.createTextNode(el.textContent))
4. parent.normalize() 合并相邻文本节点
```

**设计决策**: 使用模块级变量 `_flashTimeout` 跟踪当前定时器，确保同一时刻最多只有一个临时高亮存活，避免页面花掉（对应约束：多引用支持 — 每次点击清除前一个）。

### 3.2 lib/message-renderer.js — 新增方法

#### `_injectQuoteAttributes(messageDiv)`

**职责**: 在 AI 消息 DOM 构建完成后，扫描行内 `<code>` 和 `<blockquote>` 元素，注入 `data-quote` 属性并添加可点击样式。

```
_injectQuoteAttributes(messageDiv: HTMLElement): void

流程:
1. messageDiv.querySelectorAll('code:not(pre code)') → 行内代码
   - 排除 code block 内的 code（pre code 跳过）
   - 设置 data-quote = textContent
   - 添加 class 'pw-quote-link'
   - 绑定 click handler → 发送 locateAndHighlight 消息
2. messageDiv.querySelectorAll('blockquote') → 引用块
   - 设置 data-quote = textContent（截取前 200 字符用于匹配）
   - 添加 class 'pw-quote-link'
   - 绑定 click handler → 发送 locateAndHighlight 消息
3. click handler 内:
   - e.preventDefault()
   - chrome.tabs.sendMessage(this.currentTabId, {
       action: 'locateAndHighlight',
       text: element.dataset.quote
     })
   - 根据返回结果:
     - 成功 → 无额外操作
     - 失败 → this.addSystemMessage('未在页面中找到该内容')
```

**调用时机**: 在 `_buildAIElement()` 尾部，DOM 元素创建完成后调用。

---

## 4. 接口设计

### 4.1 Content Script 消息协议（新增）

```javascript
// 新增 action: locateAndHighlight
{
  action: 'locateAndHighlight',
  text: string        // 要定位的文本片段
}

// 成功响应
{ success: true }

// 失败响应
{ success: false, error: '未在页面中找到该内容' }
```

**向后兼容**: 新增 action，不修改任何已有 action。消息监听器 switch-case 中追加 `case 'locateAndHighlight'` 分支。

### 4.2 DOM 属性约定

| 属性 | 元素 | 值 | 说明 |
|------|------|-----|------|
| `data-quote` | `<code>`, `<blockquote>` | 原文文本 | 可引用的文本内容 |
| `class="pw-quote-link"` | `<code>`, `<blockquote>` | — | 标记为可点击引用 |
| `class="pw-flash-highlight"` | `<span>` | — | 临时高亮标记，3s 后移除 |

### 4.3 CSS 类命名约定

| 类名 | 所在文件 | 用途 | 生命周期 |
|------|---------|------|---------|
| `pagewise-highlight` | content.css | 永久高亮（用户手动保存） | 永久，刷新后通过 storage 恢复 |
| `ai-assistant-highlight` | content.css | 旧版临时高亮（保留兼容） | 手动清除 |
| `pw-flash-highlight` | content.css | 新版临时高亮（AI 引用定位） | 3s 自动消失 + DOM 移除 |
| `pw-quote-link` | sidebar.css | 可点击引用样式 | 消息存在期间 |

---

## 5. 设计决策

### D014: 引用标记注入策略

**问题**: AI 回答中的引用（行内代码、引用块）需要成为可点击的跳转链接，在哪个层面标记？

**备选方案**:

| 方案 | 实现位置 | 优点 | 缺点 |
|------|---------|------|------|
| A: Markdown 渲染层注入 | `renderMarkdown()` 中正则替换时直接生成带 `data-quote` 的 HTML | 一处改动，源头处理 | 污染通用工具函数；`renderMarkdown` 不应包含业务逻辑 |
| B: DOM 后处理注入 ✅ | `_buildAIElement()` 创建 DOM 后扫描注入 | 职责清晰；不改动通用渲染；可精确过滤 | 需要遍历 DOM 元素 |

**决策**: 方案 B — DOM 后处理注入。

**原因**:
1. `renderMarkdown()` 是通用工具函数（`lib/utils.js`），不应承担消息渲染的业务逻辑
2. DOM 层面可以精确区分 `<code>`（行内）和 `<pre><code>`（代码块），Markdown 层面正则处理需额外判断
3. 后处理注入与已有的 `injectCodeBlockRunButtons()` 模式一致，保持代码风格统一

### D015: 临时高亮 — 新函数 vs 修改现有

**问题**: `highlightText()` 已存在但没有自动消失逻辑，是修改它还是新增 `flashHighlight()`？

**决策**: 新增 `flashHighlight()`，保留 `highlightText()` 不变。

**原因**:
1. `highlightText()` 通过消息 action `'highlight'` 被调用（content.js L1336），修改其行为可能影响已有功能
2. `highlightText()` 使用内联 `style.cssText` 设置样式，新函数使用 CSS 类（`pw-flash-highlight`）更利于动画控制
3. 单一职责：`highlightText` 用于通用文本高亮定位，`flashHighlight` 专用于 AI 引用的临时定位

### D016: 临时高亮自动消失 — 动画方案

**问题**: 3 秒后高亮如何消失？

**方案**: CSS transition + JS 控制分阶段执行。

```
阶段 1: 创建高亮 → 立即 scrollIntoView
阶段 2: 等待 3 秒（用户阅读时间）
阶段 3: 添加 .pw-flash-highlight--fading 类 → CSS opacity 0.5s 渐隐
阶段 4: transitionend 事件 → 移除 DOM 元素
```

**原因**:
1. 纯 JS `setTimeout` 设置 opacity 不如 CSS transition 流畅
2. `transitionend` 事件触发后再移除 DOM，避免动画中断
3. 分阶段设计便于后续调整时长参数

### D017: 引用匹配策略 — 精确 vs 模糊

**问题**: AI 回答中的代码片段可能与页面原文不完全一致（AI 可能截取、重组），如何匹配？

**决策**: 使用精确子串匹配（`indexOf`），与已有的 `applyHighlightByText` 一致。

**原因**:
1. AI 引用的是页面原文的直接片段，理应精确匹配
2. 模糊匹配引入误匹配风险（如代码片段匹配到文档中其他位置的同名变量）
3. AC-4 明确要求：找不到时显示友好提示，而不是模糊猜测
4. 后续如需模糊匹配，可在 `flashHighlight` 内部扩展而不影响接口

### D018: 引用文本截取策略

**问题**: 引用块（blockquote）可能很长，用于页面匹配的文本应该多长？

**决策**: `<code>` 行内代码 → 完整文本；`<blockquote>` → 截取前 200 字符。

**原因**:
1. 行内代码通常很短（变量名、函数名、短语），完整匹配更精确
2. 引用块可能包含多段文本，完整匹配失败概率高
3. 200 字符足以定位唯一位置，且 TreeWalker 遍历性能可控（< 200ms 约束）

---

## 6. CSS 样式设计

### 6.1 content/content.css — 新增

```css
/* AI 引用临时高亮 — 定位标记 */
.pw-flash-highlight {
  background: rgba(250, 204, 21, 0.4);       /* 柔和黄色，区别于永久高亮 */
  padding: 2px 4px;
  border-radius: 3px;
  box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.2);  /* 外发光，更醒目 */
  transition: opacity 0.5s ease;
  outline: 1px dashed rgba(250, 204, 21, 0.6);
}

/* 淡出阶段 */
.pw-flash-highlight--fading {
  opacity: 0;
}
```

**与永久高亮的视觉区分**:
- 永久高亮（`pagewise-highlight`）: 纯实色 `#fef08a`，无边框
- 临时高亮（`pw-flash-highlight`）: 半透明 + 外发光 + 虚线边框，暗示临时性质

### 6.2 sidebar/sidebar.css — 新增

```css
/* AI 回答中的可点击引用 */
.pw-quote-link {
  cursor: pointer;
  border-bottom: 1px dashed var(--accent);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.pw-quote-link:hover {
  background: var(--accent-light);
  border-bottom-color: var(--accent-hover);
}
```

---

## 7. 边界情况与错误处理

| 场景 | 处理方式 |
|------|---------|
| AI 引用的文本在页面中不存在 | content script 返回 `{ success: false, error }` → sidebar 显示系统消息"未在页面中找到该内容" |
| 用户快速连续点击多个引用 | `clearFlashHighlights()` 在每次 `flashHighlight()` 前调用，确保只有一个临时高亮 |
| 引用文本跨越 DOM 节点边界 | `range.surroundContents()` 失败时 catch → 继续 TreeWalker 查找下一个匹配 |
| content script 未注入（受限页面） | `chrome.tabs.sendMessage` 抛错 → catch → 显示系统消息"请刷新页面后重试" |
| AI 回答尚未完成时用户点击引用 | 不受影响，引用注入在 `_buildAIElement()` 完成后执行，流式更新不影响已注入的引用 |
| 同一页面多个引用指向同一文本 | 允许多个可点击引用，`flashHighlight` 高亮第一个匹配即可 |

---

## 8. 实现顺序

1. **content/content.css** — 添加 `.pw-flash-highlight` 样式（无依赖）
2. **sidebar/sidebar.css** — 添加 `.pw-quote-link` 样式（无依赖）
3. **content/content.js** — 实现 `flashHighlight()` / `clearFlashHighlights()` + `locateAndHighlight` action
4. **lib/message-renderer.js** — 实现 `_injectQuoteAttributes()` + 在 `_buildAIElement()` 中调用
5. **测试** — 手动验证 + 补充单元测试

---

## 9. 测试要点

| 测试项 | 验证方式 |
|--------|---------|
| 行内代码被标记为可点击引用 | 渲染含 `` `code` `` 的 AI 回答，检查 DOM 中 `code` 元素有 `data-quote` 和 `pw-quote-link` |
| 引用块被标记为可点击引用 | 渲染含 `> quote` 的 AI 回答，检查 `blockquote` 有 `data-quote` 和 `pw-quote-link` |
| 点击引用 → 页面高亮 + 滚动 | 模拟 click → 检查 content script 返回 `{ success: true }`，页面有 `.pw-flash-highlight` 元素 |
| 3 秒后临时高亮自动消失 | `setTimeout` 后检查 `.pw-flash-highlight` 元素已从 DOM 移除 |
| 定位失败 → 友好提示 | 点击引用无效文本 → 检查系统消息"未在页面中找到该内容" |
| 多引用不互相干扰 | 连续点击两个引用 → 页面中最多只有一个 `.pw-flash-highlight` |
| 代码块中的 code 不被标记 | `pre code` 元素不获得 `pw-quote-link` 类 |
| 永久高亮不受影响 | 保存高亮后刷新页面，高亮仍恢复 |
