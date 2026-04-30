# 设计文档 — 迭代 #19: 学习模式（间隔重复）增强

> 日期: 2026-04-30
> 状态: 实现中

## 背景

迭代 #8 已实现间隔复习基础功能：
- `lib/spaced-repetition.js`: SM-2 算法（calculateNextReview, getDueCards, streak）
- `sidebar.js`: 基础复习流程（startReview → showReviewAnswer → rateReviewCard → closeReview）
- `sidebar.html`: 复习覆盖层（翻转卡片 + Again/Hard/Good/Easy 评分按钮）

但当前实现缺少**学习模式深度**：
1. 无会话级统计（每次复习会话的用时、准确率、卡片数无记录）
2. 无标签过滤（无法按主题/标签聚焦复习）
3. 无键盘快捷键（每次评分都要鼠标点击）
4. 无复习历史记录（无法追踪长期学习趋势）

## 需求

1. **复习会话管理**: 每次复习开始→结束生成一条 Session 记录，含时间戳、卡片数、正确数、用时、标签分布
2. **标签过滤复习**: 复习前可选择特定标签，只复习该标签下的到期卡片
3. **键盘快捷键**: 复习模式下 1=Again, 2=Hard, 3=Good, 4=Easy, Space=翻转
4. **复习历史面板**: 知识库子标签显示历史会话列表 + 本周/本月统计汇总

## 架构设计

### 新增模块: lib/review-session.js

```
┌──────────────────────────────────────────────────────┐
│ class ReviewSession                                   │
│   constructor()                                       │
│   start(tagFilter?) → void                            │
│   recordCard(quality) → void                          │
│   finish() → SessionRecord                            │
│   getStats() → { cards, correct, accuracy, elapsed }  │
├──────────────────────────────────────────────────────┤
│ saveSession(record) → Promise<void>                   │
│ getRecentSessions(limit?) → Promise<SessionRecord[]>  │
│ getWeeklyStats() → Promise<WeeklyStats>               │
│ getSessionHistory() → Promise<SessionRecord[]>         │
└──────────────────────────────────────────────────────┘
```

**SessionRecord 结构:**
```js
{
  id: string,          // 日期+序号
  startTime: number,   // Date.now()
  endTime: number,
  duration: number,    // ms
  totalCards: number,
  correctCards: number,
  accuracy: number,    // 0-100
  tagFilter: string|null,
  cardDetails: [{ entryId, quality, interval, nextReview }]
}
```

**存储**: chrome.storage.local 键 `pagewise_review_sessions`，最多保留 100 条。

### 标签过滤

- 复习面板新增标签选择区域
- 从知识库获取所有标签及其到期卡片数
- 点击标签切换过滤
- "全部" 按钮清除过滤
- 过滤后重新获取到期卡片

### 键盘快捷键

复习模式激活时：
- `Space` 或 `Enter`: 翻转卡片（显示答案）
- `1`: Again (quality=1)
- `2`: Hard (quality=2)
- `3`: Good (quality=3)
- `4`: Easy (quality=5)
- `Escape`: 关闭复习

### 复习历史面板

知识库区域新增 "📊 复习统计" 子标签：
- 本周汇总：复习次数、复习卡片数、平均准确率
- 本月汇总：同上
- 最近 10 次会话列表：时间、卡片数、准确率、用时

## 文件清单

| 操作 | 文件 |
|------|------|
| 新增 | `lib/review-session.js` — 复习会话管理模块 |
| 新增 | `tests/test-review-session.js` — 会话管理测试 |
| 修改 | `sidebar/sidebar.js` — 集成会话管理、标签过滤、键盘快捷键、历史面板 |
| 修改 | `sidebar/sidebar.html` — 标签过滤 UI、历史面板子标签 |
| 修改 | `sidebar/sidebar.css` — 标签过滤样式、历史面板样式 |
| 修改 | `docs/IMPLEMENTATION.md` |
| 修改 | `docs/CHANGELOG.md` |
| 修改 | `docs/TODO.md` |

## 技术决策

- **chrome.storage.local 存储会话历史**: 与 stats.js 模式一致，不依赖 IndexedDB，简化数据模型
- **100 条上限**: 避免存储膨胀，旧记录自动淘汰
- **ReviewSession 类**: 纯状态管理，不依赖 DOM，方便测试
- **标签过滤**: 复用知识库现有标签索引（knowledge-base.js 的 tags index）
