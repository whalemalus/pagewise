# 设计文档 — 迭代 #10: API 费用仪表盘

> 目标: 消除用户对 AI API 成本的焦虑
> 日期: 2026-04-30

---

## 1. 需求分析

### 用户痛点
- 用户不知道每次提问花费多少钱
- 不知道一个月大概会花多少
- 担心误操作导致高额费用
- 不同模型价格差异大，无法感知

### 功能目标
- 实时显示 API 使用的估算费用
- 按天/按模型维度展示费用趋势
- 设置预算提醒，防止超支
- 显示缓存节省的费用（正向激励）

## 2. 设计决策

### D022: 纯前端估算 vs API 返回真实费用
- **选择**: 纯前端估算（基于公开定价表）
- **理由**: 不依赖 API 返回 usage 字段的格式一致性，支持所有兼容 API
- **精确度**: 估算误差 < 10%（输入/输出分别计价）

### D023: 费用数据存储位置
- **选择**: 扩展现有 `chrome.storage.local` 的 stats 模块
- **理由**: 复用现有基础设施，数据结构向后兼容
- **新增字段**: `totalEstimatedCost`, `modelUsage`, `cacheSavings`

### D024: 货币单位
- **选择**: 默认 USD，显示时附带 CNY 估算（汇率 1 USD ≈ 7.2 CNY）
- **理由**: API 定价全球统一用 USD，但主要用户群是中文用户

### D025: 定价表更新策略
- **选择**: 写死在代码中，版本更新时手动维护
- **理由**: 模型定价变化频率低（季度级别），不需要动态获取

## 3. 模块设计

### 3.1 lib/cost-estimator.js — 费用估算核心模块

```
MODEL_PRICING = {
  'gpt-4o':          { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':     { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':     { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo':   { input: 0.50,  output: 1.50  },
  'claude-sonnet-4-6':  { input: 3.00,  output: 15.00 },
  'claude-opus-4-6':    { input: 15.00, output: 75.00 },
  'claude-haiku-4-5':   { input: 0.80,  output: 4.00  },
  'deepseek-chat':   { input: 0.27,  output: 1.10  },
  'deepseek-coder':  { input: 0.27,  output: 1.10  },
}
// 价格单位: USD per 1M tokens

estimateCost(model, inputTokens, outputTokens) → { usd, cny }
estimateMessagesCost(model, messages, maxTokens) → { inputCost, outputCost, total }
getModelPricing(model) → pricing info
formatCost(usd) → string like "$1.23"
formatCostCNY(usd) → string like "¥8.86"
estimateSavingsFromCache(model, cachedTokens, hitCount) → { usd, cny }
getAllModelPricing() → pricing table
```

### 3.2 lib/stats.js — 扩展统计字段

新增到 DEFAULT_STATS:
```js
totalEstimatedCost: 0,    // 累计估算费用 (USD cents, 整数)
cacheSavings: 0,          // 缓存节省费用 (USD cents)
modelUsage: {},            // { model: { calls, inputTokens, outputTokens, cost } }
dailyBudgetCents: 0,       // 每日预算 (USD cents, 0=未设置)
monthlyBudgetCents: 0,     // 每月预算 (USD cents, 0=未设置)
```

新增 dailyUsage 数据:
```js
dailyUsage[date] = {
  questions, tokens, highlights,
  cost: 0,           // 当日费用 (USD cents)
  cacheSavings: 0    // 当日缓存节省 (USD cents)
}
```

新增方法:
```
recordCost(model, inputTokens, outputTokens) → void
getCostSummary() → { todayCost, monthCost, totalCost, cacheSavings, budgetStatus }
getDailyCostTrend(days) → [{date, cost, cacheSavings}]
```

### 3.3 sidebar.html — 费用仪表盘 UI

```
费用仪表盘区域（stats-section 内，使用统计卡片下方）
├── 💰 费用概览卡片
│   ├── 今日费用
│   ├── 本月费用
│   ├── 缓存节省
│   └── 累计总费用
├── 📊 预算进度条（如有设置）
├── 📈 7 天费用趋势（柱状图）
├── 🏷️ 模型费用分布（横向条形图）
└── 💡 费用优化建议
```

### 3.4 sidebar.js — 集成

- sendMessage() 成功后: 调用 recordCost() 记录费用
- loadStatsPanel() 中: 加载费用数据并渲染仪表盘
- 预算设置: 设置面板增加预算输入框

## 4. 测试计划

### test-cost-estimator.js
1. estimateCost 基础计算（各模型）
2. estimateCost 边界（0 tokens, 负数, 未知模型）
3. formatCost 格式化
4. formatCostCNY 格式化
5. estimateMessagesCost 消息费用估算
6. estimateSavingsFromCache 缓存节省
7. getModelPricing / getAllModelPricing
8. 定价表数据完整性

### test-stats.js 扩展
1. recordCost 记录费用
2. getCostSummary 费用汇总
3. getDailyCostTrend 趋势数据
4. 预算设置/读取
5. 向后兼容（旧数据无 cost 字段）

