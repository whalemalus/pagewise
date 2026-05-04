# REQUIREMENTS — Iteration #3 (R63)

> **任务**: R63: 链接健康检查 LinkHealthCheck — `lib/bookmark-link-checker.js`
> **阶段**: Phase C — BookmarkGraph V2.0 (R63-R72)
> **复杂度**: Medium
> **日期**: 2026-05-04

---

## 用户故事

作为一名积累了数百个技术书签的开发者，我希望能**一键检测哪些书签链接已经失效**（404、域名过期、页面被删除），以便清理无效收藏，保持知识库的可靠性。

---

## 验收标准

### AC-1: 批量链接检测
- `checkAll(bookmarks)` 接受书签数组，逐个检测链接健康状态
- 每个链接返回状态结果：`{ id, url, status: 'alive'|'dead'|'redirect'|'unknown', statusCode, checkedAt, error? }`
- `status` 判定规则：
  - HTTP 2xx → `alive`
  - HTTP 3xx → `redirect`（附带 `redirectUrl`）
  - HTTP 4xx/5xx → `dead`
  - 网络超时/DNS 失败/连接拒绝 → `dead`（附带 `error` 描述）
  - 非 HTTP URL（`chrome://`、`javascript:`、`data:`） → `unknown`，不发起请求

### AC-2: 并发控制与速率限制
- 默认并发数上限为 5（可配置，范围 1-10）
- 默认单次请求超时 8 秒（可配置，范围 3-30 秒）
- 同域名请求自动排队，避免短时间对同一服务器发送过多请求（每域名 QPS ≤ 2）
- 支持 `cancel()` 方法中断正在进行的检查

### AC-3: 进度回调与增量报告
- 支持 `onProgress(checked, total, result)` 回调，每检测完一个链接触发
- 支持 `onComplete(report)` 回调，全部完成后触发
- `report` 包含：`{ total, alive, dead, redirect, unknown, duration, results[] }`
- `getReport()` 方法在任意时刻返回当前已检测的结果快照

### AC-4: 结果持久化与查询
- 检测结果通过 `chrome.storage.session` 暂存（当次会话有效）
- `getDeadLinks()` → 返回所有失效链接列表
- `getRedirectLinks()` → 返回所有重定向链接列表
- `getResultsByStatus(status)` → 按状态过滤
- `getLastCheckedAt()` → 返回最后检测时间

### AC-5: 边界条件处理
- 空数组输入 → 返回空报告，不报错
- URL 无效（无法解析） → 标记为 `unknown`，附带 `error: 'invalid-url'`
- 全部书签数 > 1000 → 仍能正常完成（性能不退化为 O(n²)）
- 检测过程中浏览器休眠/网络断开 → 恢复后继续或优雅终止

---

## 技术约束

### 权限变更
- **需要新增 `host_permissions`**: `"<all_urls>"`
  - 原因：书签链接指向任意域名，当前 manifest 仅授权 API 端点和 localhost
  - 影响：Chrome Web Store 审核时需在隐私说明中声明此权限用途（"用于检测书签链接有效性"）
  - 替代方案分析：若不添加 `<all_urls>`，则只能通过 `no-cors` 模式发请求，无法获取状态码，只能判断"可达"或"不可达"，功能大打折扣 → **建议添加**

### 架构约束
- **纯 ES Module**，不引入外部依赖（与现有 `lib/` 模块风格一致）
- **使用 `fetch()` HEAD 请求**（`method: 'HEAD'`），最小化带宽消耗
  - 对于拒绝 HEAD 请求的服务器，回退为 GET 请求并设置 `AbortController` 限制读取量
- **在 Service Worker 中执行**：通过 `background/service-worker.js` 中转，不在 content script 或 sidebar 中直接发起请求（Content Script 受 CORS 限制）
- **不使用 `XMLHttpRequest`**：MV3 要求使用 `fetch`
- 遵循现有 Bookmark typedef：`{ id, title, url, folderPath?, tags?, status? }`

### 性能约束
- 100 个书签完成检测时间 < 60 秒（并发 5）
- 1000 个书签完成检测时间 < 10 分钟
- 单次检测不阻塞 UI 线程（异步执行）
- 内存峰值 < 10 MB（不缓存响应 body）

### 代码风格
- JSDoc 注释（与 `bookmark-dedup.js`、`bookmark-folder-analyzer.js` 等一致）
- 类导出：`export class BookmarkLinkChecker`
- 测试文件：`tests/test-bookmark-link-checker-e2e.js`
- 测试框架：`node:test` + `node:assert/strict`（与现有 E2E 测试一致）

---

## 依赖关系

### 直接依赖
| 依赖 | 类型 | 说明 |
|------|------|------|
| `lib/error-handler.js` | 已存在 | 网络错误分类（`classifyStorageError` 等效分类网络错误） |
| `lib/log-store.js` | 已存在 | 日志记录（`logInfo`, `logWarn`, `logError`） |
| `background/service-worker.js` | 已修改 | 新增消息路由 `linkCheck` action，调用 `BookmarkLinkChecker` |
| `manifest.json` | 已修改 | 新增 `<all_urls>` host permission |

### 间接依赖（上游，已完成）
| 依赖 | 说明 |
|------|------|
| `lib/bookmark-collector.js` (R43) | 提供书签数据源 |
| `lib/bookmark-status.js` (R58) | 可联动：dead 链接自动标记特殊状态 |

### 下游消费者（后续迭代）
| 消费者 | 说明 |
|--------|------|
| `lib/bookmark-dedup.js` (R60) | 结合 dead 链接辅助去重决策 |
| `options/options.js` (R51) | 选项页新增"链接健康"面板 |
| `lib/bookmark-recommender.js` (R48) | 推荐时降低 dead 链接权重 |
| R69 BookmarkStatistics | 链接健康统计图表 |

---

## API 设计概要（非代码，接口约定）

```
class BookmarkLinkChecker

  constructor(options?)
    options.concurrency  : number  (default 5, range 1-10)
    options.timeout      : number  (default 8000ms, range 3000-30000ms)
    options.onProgress   : (checked, total, result) => void
    options.onComplete   : (report) => void

  checkAll(bookmarks: Bookmark[]): Promise<Report>
    → 主入口，执行全量检测，返回完整报告

  checkOne(url: string, bookmarkId?: string): Promise<LinkResult>
    → 单链接检测

  cancel(): void
    → 中断正在进行的批量检测

  getReport(): Report
    → 获取当前结果快照

  getDeadLinks(): LinkResult[]
  getRedirectLinks(): LinkResult[]
  getResultsByStatus(status): LinkResult[]
  getLastCheckedAt(): number | null

Types:
  LinkResult = {
    id:        string,
    url:       string,
    status:    'alive' | 'dead' | 'redirect' | 'unknown',
    statusCode: number | null,
    redirectUrl: string | null,
    checkedAt: number,
    error:     string | null,
    duration:  number,          // 请求耗时 (ms)
  }

  Report = {
    total:     number,
    alive:     number,
    dead:      number,
    redirect:  number,
    unknown:   number,
    duration:  number,          // 总耗时 (ms)
    results:   LinkResult[],
  }
```

---

## 集成点（Service Worker 消息路由）

在 `background/service-worker.js` 中新增消息处理器：

- **消息 action**: `"linkCheck"`
- **输入**: `{ action: 'linkCheck', bookmarks: Bookmark[], options?: {} }`
- **输出**: 通过 `sendResponse` 返回 `Report`
- **进度推送**: 使用 `chrome.runtime.sendMessage` 向 sidebar/popup 推送进度更新（复用现有消息通道模式）

---

## 不在范围内

- ❌ 自动修复/替换死链（后续迭代考虑）
- ❌ Wayback Machine / 互联网档案馆查找（API 外部依赖）
- ❌ 链接变更监控/定时检测（后续迭代考虑，需 alarm 权限）
- ❌ 截图对比检测页面内容变化（R64 考虑）
- ❌ 与 Chrome DevTools Network 面板联动

---

## 测试计划

| # | 场景 | 预期 |
|---|------|------|
| 1 | 空书签数组输入 | 返回空报告，alive=0, dead=0 |
| 2 | 有效 URL (200) | status=alive, statusCode=200 |
| 3 | 404 URL | status=dead, statusCode=404 |
| 4 | 重定向 URL (301) | status=redirect, redirectUrl 非空 |
| 5 | 超时 URL (8s) | status=dead, error 含 'timeout' |
| 6 | 无效 URL 格式 | status=unknown, error='invalid-url' |
| 7 | `chrome://` 等非 HTTP URL | status=unknown, 不发请求 |
| 8 | 并发限制验证 (concurrency=2) | 任意时刻进行中的请求 ≤ 2 |
| 9 | cancel() 中断 | 中断后已检测结果保留，未检测的不继续 |
| 10 | onProgress 回调次数 | 回调次数 = 书签总数 |
| 11 | 同域名限流 | 同域名请求间隔 ≥ 500ms |
| 12 | 1000 书签性能 | 全部完成，无内存溢出 |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-04 | R63 | 初始创建 — LinkHealthCheck 需求文档 |
