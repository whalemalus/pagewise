# 需求文档 — Iteration 11: 快捷键自定义

> 需求编号: R022
> 优先级: P1
> 迭代: R11
> 日期: 2026-04-30
> 负责: Plan Agent

---

## 一、背景与动机

### 问题陈述

PageWise 当前定义了 **6 组快捷键**，分为两层：

| 层级 | 快捷键 | 功能 | 定义位置 |
|------|--------|------|----------|
| Chrome 全局 | `Ctrl+Shift+Y` | 打开侧边栏 | manifest.json → commands |
| Chrome 全局 | `Ctrl+Shift+S` | 总结当前页面 | manifest.json → commands |
| Chrome 全局 | `Ctrl+Shift+X` | 打开/关闭侧边栏 | manifest.json → commands |
| 侧边栏内 | `Ctrl+Enter` | 发送消息 | sidebar.js (硬编码) |
| 侧边栏内 | `Ctrl+K` | 聚焦搜索框 | sidebar.js (硬编码) |
| 侧边栏内 | `Ctrl+N` | 清空对话 | sidebar.js (硬编码) |

**用户冲突投诉根因分析：**

1. **`Ctrl+K`** — 与 VS Code 命令面板、Chrome 地址栏搜索、Notion 等高频工具冲突严重
2. **`Ctrl+N`** — 与所有编辑器的「新建文件」冲突
3. **`Ctrl+Shift+S`** — 与 Chrome DevTools 的「另存为」、IDE 的「全部保存」冲突
4. **无自定义入口** — 用户发现问题后无法修改，只能卸载或忍受

### 竞品参考

- **Sider / Monica**: 支持在设置页自定义全局快捷键
- **Obsidian**: 完全可自定义的快捷键系统，支持冲突检测
- **VS Code**: 快捷键自定义已成为桌面工具的标配

---

## 二、用户故事

### US-1: 技术开发者调整快捷键避免 IDE 冲突

> 作为一名在 VS Code 中工作的前端开发者，我希望将 PageWise 的 `Ctrl+K` 改为 `Ctrl+Shift+F`，这样 PageWise 的搜索快捷键就不会覆盖 VS Code 的命令面板。

### US-2: 重度用户查看并记忆当前快捷键

> 作为一名每天使用 PageWise 的开发者，我希望在设置页看到所有快捷键的统一列表，这样我能快速查阅而不必逐个记忆。

---

## 三、验收标准

### AC-1: 设置页显示快捷键自定义区域

- [ ] Options 页面新增「快捷键」section，与「API 配置」「行为设置」同级
- [ ] 展示全部 6 个快捷键的当前绑定值（分 Chrome 全局 / 侧边栏内 两组）
- [ ] 每个快捷键显示「操作名称 + 当前组合键 + 修改按钮」

### AC-2: 侧边栏内快捷键可自定义

- [ ] 用户可在 Options 页点击「修改」，通过**按键捕获**（按键盘组合键而非手动输入）设置新的组合键
- [ ] 支持 Ctrl/⌘ + 字母/数字/功能键 的组合，以及单独功能键（如 F1–F12）
- [ ] 修改后保存到 `chrome.storage.sync`，侧边栏下次打开时读取新配置生效
- [ ] 提供「恢复默认」按钮，一键重置为出厂默认值
- [ ] 设置页显示每个快捷键的默认值（灰色小字），方便用户参考

### AC-3: Chrome 全局快捷键引导修改

- [ ] Chrome 全局快捷键（3 个 commands）展示为**只读 + 引导链接**
- [ ] 显示提示文字：「Chrome 全局快捷键请前往 [chrome://extensions/shortcuts] 修改」
- [ ] 提供一键复制 `chrome://extensions/shortcuts` 的按钮
- [ ] 不在扩展内直接修改 manifest.json 的 commands（Chrome 不允许运行时修改）

### AC-4: 快捷键冲突检测

- [ ] 用户设置新快捷键时，自动检测是否与 PageWise 内**其他已设快捷键**冲突
- [ ] 冲突时弹出警告提示：「该快捷键已绑定到 [操作名]，继续将覆盖原有绑定」
- [ ] 用户可选择「覆盖」或「取消」
- [ ] 不阻断用户保存（允许高级用户有意覆盖）

### AC-5: 按键捕获交互体验

- [ ] 点击「修改」后进入**录制模式**，显示「请按下快捷键…」提示
- [ ] 录制模式下按 Escape 取消，不绑定 Escape 本身
- [ ] 录制模式下按 Backspace/Delete 恢复为「无绑定」状态
- [ ] 录制完成后立即显示新组合键，支持「确认」或「取消」
- [ ] 不接受无修饰键的单字母绑定（防止误触），F 键除外

---

## 四、技术约束

### TC-1: Chrome Manifest V3 commands 限制

Chrome MV3 的 `commands` 在 `manifest.json` 中只能声明 `suggested_key`，用户修改必须通过 `chrome://extensions/shortcuts` 原生页面。**扩展代码在运行时无法读取或修改 commands 的实际绑定值。** 因此：

- Chrome 全局快捷键部分仅做**展示和引导**，不做运行时自定义
- 侧边栏内快捷键完全由扩展代码控制，可以实现自定义

### TC-2: 存储方式

- 使用 `chrome.storage.sync` 存储自定义快捷键配置，实现跨设备同步
- 配置 key: `customShortcuts`
- 数据结构示例：

```json
{
  "customShortcuts": {
    "sendMessage": { "key": "Enter", "ctrl": true, "meta": true },
    "focusSearch": { "key": "k", "ctrl": true, "meta": true },
    "clearChat": { "key": "n", "ctrl": true, "meta": true }
  }
}
```

- 缺失字段时回退到默认值（向后兼容）

### TC-3: Sidebar 快捷键加载时机

- `sidebar.js` 初始化时从 `chrome.storage.sync` 读取快捷键配置
- 当前硬编码的 `bindEvents()` 中的 `e.key === 'k'` 等判断改为动态匹配
- 无需热重载：用户修改设置后重新打开侧边栏即可生效

### TC-4: 不引入外部依赖

- 按键捕获使用原生 `keydown` 事件实现
- 不引入第三方快捷键库（如 Mousetrap、hotkeys-js）
- 设置 UI 使用现有 Options 页面的 CSS 框架

### TC-5: 向后兼容

- 升级后首次打开时，`customShortcuts` 为空，自动使用默认值
- 不影响现有用户的使用体验

---

## 五、依赖关系

| 依赖 | 类型 | 说明 |
|------|------|------|
| R002 (AI 问答) | 功能依赖 | 快捷键触发的「发送消息」功能依赖 AI 问答模块 |
| manifest.json commands | 系统依赖 | Chrome 全局快捷键由 manifest 声明，只能引导用户去 chrome://extensions/shortcuts 修改 |
| chrome.storage.sync | API 依赖 | 用于跨设备同步快捷键配置 |
| options/options.html | UI 依赖 | 快捷键设置 UI 嵌入现有 Options 页面 |
| sidebar/sidebar.js | 代码依赖 | 核心修改点，需将硬编码快捷键改为动态读取配置 |

---

## 六、不在范围内 (Out of Scope)

| 项目 | 原因 |
|------|------|
| 运行时修改 Chrome 全局快捷键 | MV3 技术限制，不可行 |
| 快捷键方案导入/导出 | 当前用户量不需要 |
| 快捷键与第三方扩展的冲突检测 | 无法读取其他扩展的快捷键配置 |
| Vim 模式 / Emacs 模式 | 不符合目标用户画像 |
| 鼠标手势自定义 | 不在本迭代范围内 |

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 用户设置的快捷键与浏览器/操作系统冲突 | 中 | 低 | 文档提示常见冲突组合；冲突检测仅限扩展内部 |
| chrome.storage.sync 配额限制 | 低 | 低 | 快捷键数据量极小（<1KB），远低于 100KB 配额 |
| 侧边栏焦点丢失导致快捷键不响应 | 中 | 中 | 快捷键绑定在 sidebar iframe 的 document 上，已有 focus 管理逻辑 |

---

## 八、成功指标

| 指标 | 目标 | 衡量方式 |
|------|------|----------|
| 快捷键冲突投诉归零 | 0 条/月 | GitHub Issues / 反馈渠道 |
| 设置页快捷键区域访问率 | >30% DAU | 页面访问统计（如接入） |
| 用户自定义快捷键比例 | >10% 用户 | chrome.storage.sync 数据抽样 |

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-04-30 | 初始化 R022 需求文档 |
