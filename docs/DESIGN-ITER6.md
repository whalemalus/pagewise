# 设计文档 — 迭代 #6: 技能推荐算法优化

> 日期: 2026-04-30
> 状态: 待实现

---

## 1. 概述

本轮迭代优化技能推荐算法，从简单的 switch-case 硬编码映射升级为**多信号加权评分系统**，使推荐更精准、更个性化。

### 问题

当前 `PageSense.suggestSkills()` 的问题：
1. 硬编码映射 — 每种页面类型固定推荐 1-2 个技能，无灵活性
2. 无评分机制 — 推荐结果是二元的（推荐/不推荐），无法排序
3. 无个性化 — 不考虑用户历史、偏好、技术水平
4. 无置信度 — 无法区分"强烈推荐"和"勉强相关"
5. 自定义技能不参与推荐 — 用户创建的技能无法被自动发现
6. `EvolutionEngine` 已有的 `_skillSuccess` / `_skillIgnore` 数据未被利用

### 目标

- 多信号加权评分（页面类型、内容信号、用户画像、使用历史、反馈）
- 置信度排序，top-N 输出
- 自定义技能自动匹配
- 复用 EvolutionEngine 的 skillSuccess / skillIgnore 数据
- 与现有 suggestSkills() API 向后兼容

---

## 2. 架构设计

### 2.1 新增模块: lib/skill-recommender.js

```
SkillRecommender
├── recommend(pageContext, options) → SkillRecommendation[]
├── _scorePageType(pageTypes, skill) → number
├── _scoreContentSignals(pageContext, skill) → number
├── _scoreUserProfile(userProfile, skill) → number
├── _scoreUsageHistory(skillId, evolution) → number
├── _scoreSkillMatch(skill, pageContext) → number
├── _buildReason(scoreBreakdown) → string
└── _fuzzyMatch(text, keywords) → number
```

### 2.2 推荐结果格式

```javascript
{
  skillId: 'code-explain',
  skillName: '解释代码',
  confidence: 0.85,         // 0-1 置信度
  reason: '页面包含 JavaScript/Python 代码',
  source: 'builtin'          // 'builtin' | 'custom'
}
```

### 2.3 信号权重

| 信号源 | 权重 | 说明 |
|--------|------|------|
| 页面类型匹配 (pageType) | 0.35 | 基于 PageSense 分析结果 |
| 内容信号 (content) | 0.25 | 代码块、错误、API 特征等 |
| 用户画像 (profile) | 0.15 | 编程语言偏好、技术水平 |
| 使用历史 (history) | 0.15 | 技能使用频率、成功/忽略比 |
| 技能触发匹配 (trigger) | 0.10 | SkillEngine 的 trigger 函数 |

### 2.4 阈值与去重

- 最低置信度阈值：0.25（可配置）
- 最多推荐：5 个（可配置）
- 相同 skillId 去重（取最高分数）

---

## 3. 与现有系统集成

### 3.1 PageSense.suggestSkills() 升级

保留原有方法签名 `suggestSkills(pageContext, skillEngine)` 做向后兼容。

新增 `suggestSkillsRanked(pageContext, skillEngine, options)` 调用 SkillRecommender。

### 3.2 sidebar.js 集成

```javascript
// 替换旧逻辑
const suggestions = this.pageSense.suggestSkills(response, this.skills);
// → 新逻辑
const suggestions = this.pageSense.suggestSkillsRanked(response, this.skills, {
  userProfile: this.memory.userProfile,
  evolution: this.evolution,
  customSkills: this.customSkills,
  maxResults: 5
});
```

---

## 4. 设计决策

| ID | 决策 | 原因 |
|----|------|------|
| D022 | 独立 SkillRecommender 类 | 单一职责，可独立测试，不膨胀 PageSense |
| D023 | 加权评分模型 | 可解释、可调参、相比 ML 模型更轻量 |
| D024 | 复用 EvolutionEngine 的 _skillSuccess/_skillIgnore | 避免重复存储，数据一致性 |
| D025 | 自定义技能模糊匹配 | 基于 category + description 关键词，简单有效 |

