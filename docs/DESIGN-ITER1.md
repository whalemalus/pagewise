# DESIGN — R67: BookmarkLearningProgress

> 迭代: R67
> 日期: 2026-05-06
> 复杂度: Medium (新模块)
> 设计人: Plan Agent (Hermes)

---

## 1. 架构概述

```
┌─────────────────────────────────────────────────┐
│         BookmarkLearningProgress                 │
│         (lib/bookmark-learning-progress.js)      │
├─────────────────────────────────────────────────┤
│  公共 API                                        │
│  ├── startSession(bookmarkId) → session          │
│  ├── endSession(bookmarkId) → session            │
│  ├── getBookmarkProgress(bookmarkId) → summary   │
│  ├── getCategoryProgress(category) → summary     │
│  ├── getOverallProgress() → summary              │
│  ├── getStats() → global stats                   │
│  ├── getDailyStats(days) → daily[]               │
│  ├── exportData() → json                         │
│  └── importData(json) → result                   │
├─────────────────────────────────────────────────┤
│  内部状态                                        │
│  ├── #activeSessions: Map<bookmarkId, session>   │
│  ├── #db: IDBDatabase (lazy init)                │
│  └── #timeoutMs: 30 * 60 * 1000 (30min)         │
├─────────────────────────────────────────────────┤
│  依赖                                            │
│  ├── BookmarkLearningPath.judgeDifficulty() [静态]│
│  ├── IndexedDB (learningProgress store)          │
│  └── BookmarkClusterer [可选，按类别聚合]         │
└─────────────────────────────────────────────────┘
```

---

## 2. 设计决策记录

| ID | 日期 | 决策 | 原因 | 替代方案 |
|----|------|------|------|----------|
| D001 | 2026-05-06 | IndexedDB 持久化 | 与项目一致（knowledge-base.js, conversation-store.js 均使用 IndexedDB）| localStorage（容量限制 5MB）|
| D002 | 2026-05-06 | 内存 Map 存活跃会话 | startSession/endSession 是热路径，需 O(1) 查找 | 每次从 IDB 读取（慢 10x）|
| D003 | 2026-05-06 | 复用 BookmarkLearningPath.judgeDifficulty() | 避免重复逻辑，保持难度判定一致性 | 自建难度规则（维护成本高）|
| D004 | 2026-05-06 | 统计方法按需从 IDB 读取 | 避免缓存全部记录到内存（1000 条 ≈ 200KB）| 全量缓存（内存压力大）|
| D005 | 2026-05-06 | 超时 30 分钟自动结束会话 | 用户可能忘记关闭标签页，防止虚假学习时长 | 无超时（数据不准确）|
| D006 | 2026-05-06 | UTC+8 自然日切割 streak | 与用户感知的"一天"一致 | UTC 切割（跨时区不一致）|
| D007 | 2026-05-06 | 不注入 IndexedDB 实例，自建连接 | 模块独立性高，不依赖外部初始化 | 注入 IDB 实例（耦合度高）|

---

## 3. 数据模型

### 3.1 IndexedDB Store: `learningProgress`

```
Store: learningProgress
  keyPath: id (autoIncrement)
  Indexes:
    - bookmarkId (非唯一，一个书签多条记录)
    - startTime (非唯一，用于时间范围查询)
```

### 3.2 记录结构

```javascript
{
  id: number,           // 自增主键
  bookmarkId: string,   // 书签 ID
  startTime: number,    // Unix timestamp ms
  endTime: number|null, // null = 活跃会话
  duration: number,     // 秒，活跃会话为 0
  timedOut: boolean,    // 是否超时中断
}
```

### 3.3 返回值结构

```javascript
// getBookmarkProgress(bookmarkId)
{
  bookmarkId: string,
  totalTime: number,      // 累计秒数
  sessionCount: number,
  lastStudiedAt: number,  // timestamp
  progress: number,       // 0-1
  difficulty: string,
  expectedTime: number,   // 秒
}

// getCategoryProgress(category)
{
  category: string,
  totalBookmarks: number,
  studiedBookmarks: number,
  totalTime: number,
  avgProgress: number,
}

// getStats()
{
  totalTime: number,
  totalSessions: number,
  dailyAverage: number,
  streak: number,
  mostActiveCategory: string,
}

// getDailyStats(days)
[
  { date: '2026-05-06', totalTime: 3600, sessions: 3 },
  ...
]
```

---

## 4. 实现方案

### 4.1 文件清单

| 文件 | 操作 | 行数估算 |
|------|------|----------|
| `lib/bookmark-learning-progress.js` | 新建 | ~300 行 |
| `tests/test-bookmark-learning-progress.js` | 新建 | ~400 行 (20+ 用例) |

### 4.2 类结构

```javascript
export class BookmarkLearningProgress {
  // 构造
  constructor(options = {})
  
  // 初始化
  async init() → void  // 打开 IndexedDB 连接
  
  // 会话管理
  async startSession(bookmarkId) → session
  async endSession(bookmarkId) → session
  
  // 进度查询
  async getBookmarkProgress(bookmarkId) → summary
  async getCategoryProgress(category, clusterMap) → summary
  async getOverallProgress() → summary
  
  // 统计
  async getStats() → stats
  async getDailyStats(days) → daily[]
  
  // 导入导出
  async exportData() → json
  async importData(json) → { imported, skipped }
  
  // 内部
  #openDB() → IDBDatabase
  #addRecord(record) → void
  #getRecordsByBookmark(bookmarkId) → records[]
  #getRecordsByTimeRange(start, end) → records[]
  #getAllRecords() → records[]
  #calculateStreak(records) → number
  #todayUTC8() → string  // 'YYYY-MM-DD' in UTC+8
}
```

### 4.3 关键算法

**Streak 计算:**
```
1. 获取所有记录的日期（UTC+8 转换）
2. 去重得到学习日期集合
3. 从今天开始向前遍历，连续有记录的天数即为 streak
```

**进度百分比:**
```
progress = min(totalTime / expectedTime, 1.0)
expectedTime = {
  beginner: 600s (10min),
  intermediate: 1200s (20min),
  advanced: 1800s (30min)
}
difficulty = BookmarkLearningPath.judgeDifficulty(bookmark)
```

**超时自动结束:**
```
startSession 时设置 setTimeout(#timeoutMs)
超时触发 → 自动调用 endSession(timedOut=true)
再次 startSession 时清除旧 timer
```

---

## 5. 测试策略

### 测试用例清单 (≥20)

| # | 测试点 | 类型 |
|---|--------|------|
| 1 | 构造函数默认参数 | 单元 |
| 2 | 构造函数自定义参数 | 单元 |
| 3 | startSession 创建会话 | 集成 |
| 4 | startSession 返回活跃会话对象 | 集成 |
| 5 | endSession 结束会话并计算时长 | 集成 |
| 6 | endSession 无活跃会话抛错 | 边界 |
| 7 | 重复 startSession 返回已有会话 | 边界 |
| 8 | 超时自动结束 (mock setTimeout) | 集成 |
| 9 | getBookmarkProgress 计算累计时长 | 集成 |
| 10 | getBookmarkProgress 进度百分比封顶 1.0 | 边界 |
| 11 | getBookmarkProgress 无记录返回零值 | 边界 |
| 12 | getCategoryProgress 按类别汇总 | 集成 |
| 13 | getOverallProgress 全局汇总 | 集成 |
| 14 | getStats 返回总时长/次数/日均 | 集成 |
| 15 | getStats streak 连续天数 | 集成 |
| 16 | getStats streak 中断重置 | 边界 |
| 17 | getDailyStats 返回 N 天数据 | 集成 |
| 18 | getDailyStats 无数据返回空数组 | 边界 |
| 19 | exportData 导出完整数据 | 集成 |
| 20 | importData 导入并合并去重 | 集成 |
| 21 | importData 无效数据抛错 | 边界 |
| 22 | init() 打开 IndexedDB | 集成 |

---

## 6. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| IndexedDB 在测试环境不可用 | 中 | 测试失败 | 使用内存 Map mock（参考 indexeddb-mock.js）|
| judgeDifficulty 依赖变更 | 低 | 进度计算错误 | 锁定调用方式，不修改上游 |
| 时区计算错误 | 中 | streak 不准 | 使用 UTC+8 固定偏移，不依赖 Intl |
| 超时 timer 泄漏 | 低 | 内存泄漏 | endSession 时 clearTimeout |

---

## 7. 已知技术债务

| ID | 描述 | 优先级 | 状态 |
|----|------|--------|------|
| TD001 | 统计方法每次从 IDB 全量读取，大数据量可能慢 | Low | 可后续加缓存 |
| TD002 | 无自动清理旧记录机制 | Low | 1000 条 ≈ 200KB，暂不需 |

---

*设计完成于 2026-05-06 09:20 (Plan Agent)*
