# 设计文档 — 迭代 #14: 离线回答保存

> 日期: 2026-04-30
> 状态: 实现中

## 背景

当前 `AICache` 是纯内存 LRU 缓存，扩展重启后所有缓存丢失。当用户断网或 API 不可用时，
无法查看之前已获得的 AI 回答。用户需要 **AI 回答持久化到 IndexedDB**，实现离线可用。

## 需求

1. 每次 AI 回答成功后自动持久化到 IndexedDB
2. 离线 / API 失败时自动查找并展示缓存回答
3. 缓存条目带完整元数据（页面 URL、标题、模型、时间戳）
4. LRU 淘汰策略（默认 200 条上限）
5. 支持搜索/浏览历史缓存回答
6. 缓存命中时显示「💾 离线缓存」徽章

## 架构设计

### 新增模块: `lib/offline-answer-store.js`

```
┌─────────────────────────────────┐
│   OfflineAnswerStore            │
│   (IndexedDB)                   │
├─────────────────────────────────┤
│ add(entry)                      │  保存一条 Q&A 缓存
│ get(cacheKey)                   │  按 cacheKey 精确查找
│ search(keyword)                 │  全文搜索问题/回答
│ getAll()                        │  列出所有缓存（倒序）
│ delete(cacheKey)                │  删除一条
│ clear()                         │  清空全部
│ evictOverflow()                 │  超过 maxEntries 时 LRU 淘汰
│ getStats()                      │  返回 { count, oldest, newest }
└─────────────────────────────────┘
```

#### 条目数据结构

```js
{
  cacheKey: 'a3f8b1c2...',     // FNV-1a 哈希键
  url: 'https://...',
  title: 'Page Title',
  question: '用户问题',
  answer: 'AI 回答全文',
  model: 'gpt-4o',
  createdAt: '2026-04-30T...'
}
```

#### IndexedDB 设计

- 数据库: `PageWiseOfflineAnswers`
- 版本: 1
- Object Store: `answers`
  - keyPath: `cacheKey`
  - Index: `url` (非唯一)
  - Index: `createdAt` (非唯一)

### 与 Sidebar 集成

1. **自动保存**: `sendMessage()` 中 AI 流式输出完成后，调用 `offlineStore.add(...)` 持久化
2. **离线回退**: `sendMessage()` 的 catch 中检测网络错误，自动查找离线缓存并展示
3. **UI 标记**: 缓存命中显示 `💾 离线缓存` 徽章 + 时间戳

### LRU 淘汰策略

`evictOverflow()` 查询所有条目，按 `createdAt` 排序，删除最旧的多余条目，
保证总条目数 ≤ `maxEntries`（默认 200）。

## 文件清单

| 操作 | 文件 |
|------|------|
| 新增 | `lib/offline-answer-store.js` |
| 新增 | `tests/test-offline-answer-store.js` |
| 修改 | `sidebar/sidebar.js`（集成离线保存 + 回退） |
