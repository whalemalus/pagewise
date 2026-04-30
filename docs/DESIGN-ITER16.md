# 设计文档 — 迭代 #16: Notion/Obsidian/飞书同步

> 日期: 2026-04-30
> 状态: 实现中

## 背景

用户在 PageWise 中积累的知识条目需要与日常工作流工具（Notion、Obsidian、飞书）打通。
当前仅支持 Markdown/JSON 导出到本地文件，无法自动同步到外部平台。
用户需要手动复制粘贴，工作流断裂。

## 需求

1. 支持将知识条目同步到 Notion（通过 Notion API）
2. 支持将知识条目同步到 Obsidian（通过 Local REST API 插件 + Markdown 生成）
3. 支持将知识条目同步到飞书文档（通过飞书开放 API）
4. 每个平台独立配置（API Token / 端点 / 目标位置）
5. 支持单条同步和批量同步
6. 同步状态追踪（已同步/待同步/失败）
7. 条目转 Markdown 格式适配（含 frontmatter）
8. 错误重试机制

## 架构设计

### 核心模块: `lib/sync-engine.js`

```
┌──────────────────────────────────────────────────┐
│                SyncEngine                         │
├──────────────────────────────────────────────────┤
│ registerAdapter(name, adapter)                   │
│ sync(entry, platform, config) → SyncResult       │
│ syncBatch(entries, platform, config) → SyncResult│
│ getSyncState(entryId) → SyncState                │
│ markSynced(entryId, platform, remoteId)          │
│ markFailed(entryId, platform, error)             │
│ loadConfig() → Promise<SyncConfig>               │
│ saveConfig(config) → Promise<void>               │
│ getSupportedPlatforms() → string[]               │
├──────────────────────────────────────────────────┤
│ - adapters: Map<string, SyncAdapter>             │
│ - syncStates: Map<string, SyncState>             │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│         SyncAdapter (Interface)                   │
├──────────────────────────────────────────────────┤
│ name: string                                      │
│ icon: string                                      │
│ testConnection(config) → Promise<boolean>         │
│ sync(entry, config) → Promise<SyncResult>         │
│ formatEntry(entry) → formatted object             │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│              NotionAdapter                        │
├──────────────────────────────────────────────────┤
│ testConnection() — GET /v1/users/me               │
│ sync(entry) — POST /v1/pages (创建 database page) │
│ formatEntry() — 构造 Notion page properties       │
│ API: https://api.notion.com/v1                    │
│ Auth: Bearer {token}                              │
│ Required: token, databaseId                       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│             ObsidianAdapter                       │
├──────────────────────────────────────────────────┤
│ testConnection() — GET /vault/ (检查连接)          │
│ sync(entry) — PUT /vault/{path} (创建/更新文件)    │
│ formatEntry() — Markdown + YAML frontmatter       │
│ API: http://localhost:27123 (Obsidian REST 插件)   │
│ Auth: Authorization: Bearer {apiKey}              │
│ Required: apiUrl, apiKey, vaultPath               │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│              FeishuAdapter                        │
├──────────────────────────────────────────────────┤
│ testConnection() — GET /open-apis/auth/v3/...     │
│ sync(entry) — POST /open-apis/docx/v1/documents   │
│ formatEntry() — 飞书文档 block 结构                │
│ API: https://open.feishu.cn/open-apis             │
│ Auth: tenant_access_token                         │
│ Required: appId, appSecret, folderToken           │
└──────────────────────────────────────────────────┘
```

### 条目格式化策略

所有适配器共享 `entryToMarkdown(entry)` 基础格式化方法，输出标准 Markdown：
- YAML frontmatter（标签、分类、来源、时间）
- 问题/回答/摘要结构化展示
- 平台适配器在此基础上做平台特定格式化

### 同步状态

```
SyncState {
  entryId: number
  platform: string
  status: 'synced' | 'pending' | 'failed'
  remoteId: string | null     // 远程平台的文档 ID
  remoteUrl: string | null    // 远程文档链接
  lastSyncAt: string          // ISO 时间
  error: string | null        // 错误信息
  retryCount: number
}
```

### 配置存储

使用 `chrome.storage.sync` 存储同步配置：
```json
{
  "syncConfig": {
    "notion": { "token": "...", "databaseId": "..." },
    "obsidian": { "apiUrl": "http://localhost:27123", "apiKey": "...", "vaultPath": "PageWise" },
    "feishu": { "appId": "...", "appSecret": "...", "folderToken": "..." }
  }
}
```

## 文件清单

| 操作 | 文件 |
|------|------|
| 新增 | `lib/sync-engine.js` |
| 新增 | `tests/test-sync-engine.js` |
| 修改 | `sidebar/sidebar.js`（集成同步功能） |
| 修改 | `docs/IMPLEMENTATION.md` |
| 修改 | `docs/CHANGELOG.md` |
| 修改 | `docs/TODO.md` |
