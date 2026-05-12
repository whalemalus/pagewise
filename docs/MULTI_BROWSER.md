# PageWise 多浏览器兼容说明

## 概览

PageWise 支持以下浏览器：

| 浏览器 | 最低版本 | API 模型 | 侧边栏 | 状态 |
|--------|---------|----------|--------|------|
| Chrome | 114+ | chrome.* (MV3 Service Worker) | Side Panel API | ✅ 完整支持 |
| Edge | 114+ | chrome.* (MV3 Service Worker) | Side Panel API | ✅ 完整支持 |
| Brave | 114+ | chrome.* (MV3 Service Worker) | Side Panel API | ✅ 完整支持 |
| Firefox | 128+ | browser.* (WebExtension API) | sidebar_action | ✅ 支持 |

---

## 架构设计

### 浏览器兼容层 (`lib/browser-compat.js`)

核心设计原则：**Feature Detection 优先于 Browser Detection**。

```
┌─────────────────────────────────┐
│           应用代码               │
│  import { PW } from 'browser-compat'  │
│  PW.storage.sync.get(...)       │
│  openSidePanel(tabId)           │
└───────────┬─────────────────────┘
            │
┌───────────▼─────────────────────┐
│      browser-compat.js          │
│  ┌─────────────────────────────┐│
│  │ Feature Detection            ││
│  │ - globalThis.browser? → FW   ││
│  │ - globalThis.chrome? → Chrome││
│  │ - navigator.userAgent → Edge ││
│  └─────────────────────────────┘│
│  ┌─────────────────────────────┐│
│  │ API Wrappers                 ││
│  │ - PW (unified proxy)         ││
│  │ - openSidePanel()            ││
│  │ - closeSidePanel()           ││
│  │ - createContextMenu()        ││
│  │ - promisify()                ││
│  └─────────────────────────────┘│
└───────────┬─────────────────────┘
            │
    ┌───────┴───────┐
    ▼               ▼
chrome.*        browser.*
(Chrome/Edge)   (Firefox)
```

### 统一 API 入口 `PW`

`PW` 对象是一个 Proxy-like 的 getter 模式，自动选择正确的底层 API：

```javascript
import { PW } from '../lib/browser-compat.js';

// 以下代码在所有浏览器上都工作：
await PW.storage.sync.get({ apiKey: '' });
await PW.tabs.query({ active: true });
await PW.runtime.sendMessage({ action: 'test' });
```

### API 差异映射

| PageWise API | Chrome/Edge | Firefox | 说明 |
|-------------|------------|---------|------|
| `PW.storage` | `chrome.storage` | `browser.storage` | 接口相同 |
| `PW.runtime` | `chrome.runtime` | `browser.runtime` | 接口相同 |
| `PW.tabs` | `chrome.tabs` | `browser.tabs` | 接口相同 |
| `PW.bookmarks` | `chrome.bookmarks` | `browser.bookmarks` | 接口相同 |
| `PW.contextMenus` | `chrome.contextMenus` | `browser.menus` | Firefox 命名不同 |
| `PW.sidePanel` | `chrome.sidePanel` | `undefined` | Firefox 不支持 |
| `PW.sidebarAction` | `undefined` | `browser.sidebarAction` | Chrome/Edge 不支持 |
| `openSidePanel()` | `chrome.sidePanel.open()` | `browser.sidebarAction.open()` | 统一封装 |
| `PW.commands` | `chrome.commands` | `browser.commands` | 接口相同 |

---

## Manifest 差异

### Chrome (`manifest.json`)
- 使用 `side_panel` 字段
- `background.service_worker` (ES Module)
- `minimum_chrome_version: "110"`

### Firefox (`manifest.firefox.json`)
- 使用 `sidebar_action` 替代 `side_panel`
- `background.scripts` + `type: "module"`
- 需要 `browser_specific_settings.gecko` 字段
- 不包含 `sidePanel` 权限
- `strict_min_version: "128.0"` (需要 ES Module 支持)

### Edge (`manifest.edge.json`)
- 与 Chrome manifest 基本相同
- Edge 使用 Chromium 内核，API 完全兼容

---

## 打包与发布

### 命令行

```bash
# 单浏览器打包
bash scripts/build.sh chrome    # → dist/pagewise-v2.3.0-chrome.zip
bash scripts/build.sh firefox   # → dist/pagewise-v2.3.0-firefox.zip
bash scripts/build.sh edge      # → dist/pagewise-v2.3.0-edge.zip

# 全部打包
bash scripts/build.sh all
```

### 打包流程

1. 选择对应浏览器的 manifest 文件
2. 复制为 `manifest.json` 到构建目录
3. 复制所有源代码文件
4. 打包为 zip

### 发布渠道

| 浏览器 | 发布平台 | 格式 |
|--------|---------|------|
| Chrome | Chrome Web Store | zip |
| Edge | Edge Add-ons | zip |
| Firefox | addons.mozilla.org (AMO) | zip |

---

## Firefox 特别说明

### 已知差异

1. **Side Panel → Sidebar**
   - Firefox 不支持 `chrome.sidePanel` API
   - 使用 `sidebar_action` 在 manifest 中声明侧边栏
   - 通过 `browser.sidebarAction.open()` / `.close()` 控制

2. **Context Menus 命名空间**
   - Chrome: `chrome.contextMenus`
   - Firefox: `browser.menus`（部分版本兼容 `browser.contextMenus`）

3. **Background Script 类型**
   - Firefox 128+ 支持 ES Module background scripts
   - 使用 `background.scripts` + `"type": "module"` 声明

4. **API 返回值**
   - Chrome: callback-based，部分 API 返回 Promise
   - Firefox: 全部 API 返回 Promise
   - 兼容层自动处理两者差异

### 安装方式（临时加载）

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击「临时加载附加组件」
3. 选择 `manifest.firefox.json`（或打包后的目录中的 `manifest.json`）

### AMO 发布注意事项

- AMO (addons.mozilla.org) 审核较严格
- 确保无 `eval()` 或远程代码执行
- API Key 仅存储在本地 storage，合规
- 需要提供隐私政策文档（PRIVACY.md）

---

## 开发指南

### 添加新的 chrome.* API 调用

在代码中应使用兼容层而非直接调用 `chrome.*`：

```javascript
// ❌ 不要这样写
chrome.storage.sync.get({ key: 'default' }, callback);

// ✅ 应该这样写
import { PW } from '../lib/browser-compat.js';
const result = await PW.storage.sync.get({ key: 'default' });
```

### 特殊 API 处理

对于 Side Panel 等 API 差异，使用 feature detection：

```javascript
import { PW, openSidePanel, isFirefox } from '../lib/browser-compat.js';

// 方式 1：使用统一函数（推荐）
await openSidePanel(tabId);

// 方式 2：Feature detection
if (PW.sidePanel) {
  await PW.sidePanel.open({ tabId });
} else if (PW.sidebarAction) {
  await PW.sidebarAction.open();
}
```

### 测试

浏览器兼容层的测试位于 `tests/test-browser-compat.js`，模拟三种浏览器环境：

```bash
node --test tests/test-browser-compat.js
```

---

## 常见问题

### Q: 为什么不直接用 WebExtension Polyfill？
A: 项目遵循零依赖原则。browser-compat.js 轻量实现覆盖了所需的全部 API，无需引入第三方 polyfill。

### Q: Edge 需要单独维护代码吗？
A: 不需要。Edge 使用 Chromium 内核，与 Chrome 完全共享代码和 manifest。

### Q: Firefox 侧边栏行为和 Chrome 完全一致吗？
A: 基本一致，但 Firefox 的 sidebar 有一些 UI 差异（如宽度调整方式）。核心功能完全相同。

### Q: 如何支持更低版本的 Firefox？
A: Firefox 128+ 是 ES Module background scripts 的最低要求。如需支持更低版本，需要添加构建步骤将 ES modules 合并为单文件。
