# VERIFICATION.md — Iteration #26 Review

> **任务**: L2.3 矛盾检测 — 新回答与已有知识冲突时主动提示用户
> **日期**: 2026-04-30
> **审查员**: Guard Agent

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | **库模块完整，但集成缺失** — `contradiction-detector.js` 核心逻辑完整实现，但 `sidebar.js` 仅添加 import 行，从未调用任何导入函数；CSS 样式未编写；用户无法看到「知识冲突」提示 |
| 代码质量 | ✅ | 库代码质量高 — 纯 ES Module、AI 调用安全降级、XSS 防护（escapeHtml）、输入校验、规范化处理；模块与 AutoClassifier/KnowledgeBase 完全解耦 |
| 测试覆盖 | ✅ | **42/42 测试全部通过** — 覆盖提示词构建、AI 响应解析、主检测流程、候选筛选、版本号提取、版本矛盾检测、过滤、HTML 生成、边界条件等全链路 |
| 文档同步 | ❌ | CHANGELOG.md 未新增 L2.3 条目；TODO.md 不存在 |

---

## 发现的问题

### P0 — 致命：sidebar.js 集成完全缺失（死代码）

**第 33 行**导入了 5 个符号：

```js
import { detectContradictions, findCandidateEntries, filterContradictions,
         buildContradictionWarningHtml, CONTRADICTION_SEVERITY }
  from '../lib/contradiction-detector.js';
```

但在整个 `sidebar.js` 中，**没有任何地方调用这些函数**。这是纯粹的死代码导入。

**应有的集成点**（均未实现）：

| 集成点 | 说明 |
|--------|------|
| AI 回答保存后触发 | 保存新 Q&A 条目时，应调用 `findCandidateEntries()` 筛选候选 → `detectContradictions()` 检测矛盾 → `buildContradictionWarningHtml()` 生成提示 |
| UI 渲染 | 矛盾告警 HTML 应插入到 AI 回答区域下方或知识面板中 |
| 用户交互 | "查看"和"忽略"按钮的事件绑定未实现 |

### P1 — 严重：CSS 样式完全缺失

`buildContradictionWarningHtml()` 生成的 HTML 使用了 12 个 CSS 类名：

- `pw-contradiction-warning`
- `pw-contradiction-header`
- `pw-contradiction-icon`
- `pw-contradiction-title`
- `pw-contradiction-list`
- `pw-contradiction-item`
- `pw-contradiction-item-header`
- `pw-contradiction-severity`
- `pw-contradiction-type`
- `pw-contradiction-desc`
- `pw-contradiction-facts` / `pw-fact-new` / `pw-fact-existing`
- `pw-contradiction-actions` / `pw-contradiction-btn`

在 `sidebar.css` 和项目中所有 CSS 文件中**搜索结果为零**。若用户能看到该 HTML，它将以无样式裸文本呈现，严重影响用户体验。

### P2 — 中等：CHANGELOG.md 未更新

CHANGELOG.md 中未记录 L2.3 矛盾检测功能。应新增条目。

### P3 — 低："查看"按钮缺少目标

`buildContradictionWarningHtml()` 中的"查看"按钮设置了 `data-entry-id` 属性，但没有对应的 JavaScript 事件监听器来跳转到已有条目详情。

---

## 代码质量亮点（正面评价）

尽管集成未完成，`lib/contradiction-detector.js` 的实现质量值得肯定：

| 方面 | 评价 |
|------|------|
| 架构设计 | 纯函数模块，无副作用，不依赖 IndexedDB/Chrome API，可独立测试 |
| 错误处理 | AI 调用 `catch` 块安全降级，保留已有的版本启发式结果 |
| XSS 防护 | `escapeHtml()` 正确转义 5 种 HTML 特殊字符 |
| 输入校验 | `normalizeContradiction()` / `normalizeSeverity()` / `normalizeType()` 全面处理非法值 |
| 版本号提取 | 支持 `vX.Y.Z` / `X.Y.Z` / `X.Y` / `X` 多种格式，自动排除年份（2020-2030） |
| 去重策略 | AI 结果与版本启发式结果按 `existingEntryId:type` key 去重合并 |
| 候选筛选 | 支持标签匹配 + 实体匹配双策略，按匹配分数排序 |

---

## 测试详情

```
# tests 42
# suites 9
# pass  42
# fail  0
```

| 测试分组 | 用例数 | 状态 |
|----------|--------|------|
| buildContradictionPrompt | 4 | ✅ 全部通过 |
| parseContradictionResponse | 8 | ✅ 全部通过 |
| detectContradictions | 5 | ✅ 全部通过 |
| findCandidateEntries | 4 | ✅ 全部通过 |
| extractVersionNumbers | 4 | ✅ 全部通过 |
| detectVersionContradictions | 3 | ✅ 全部通过 |
| filterContradictions | 3 | ✅ 全部通过 |
| buildContradictionWarningHtml | 5 | ✅ 全部通过 |
| 边界条件 | 6 | ✅ 全部通过 |

**注意**: 测试仅覆盖 `contradiction-detector.js` 库模块。由于 sidebar.js 集成未实现，无法进行端到端集成测试。

---

## 返工任务清单

> ⚠️ 核心库已完成，以下为集成和补全任务

### Task 1: `sidebar/sidebar.css` — 添加矛盾告警样式

- [ ] 为以下 CSS 类编写样式（共约 12 个选择器）：
  - `.pw-contradiction-warning` — 警告容器（建议：黄色/橙色边框背景）
  - `.pw-contradiction-header` — 头部（图标 + 标题行）
  - `.pw-contradiction-list` — 矛盾列表容器
  - `.pw-contradiction-item` — 单条矛盾卡片
  - `.pw-contradiction-severity` / `.pw-contradiction-type` — 标签样式
  - `.pw-contradiction-desc` — 描述文本
  - `.pw-contradiction-facts` / `.pw-fact-new` / `.pw-fact-existing` — 事实对比区域
  - `.pw-contradiction-actions` / `.pw-contradiction-btn` — 操作按钮
- [ ] 响应式适配：侧边栏窄屏下的布局

### Task 2: `sidebar/sidebar.js` — 集成矛盾检测流程

- [ ] 在 AI 回答完成后、保存 Q&A 条目时触发矛盾检测：
  ```
  saveAnswer() → findCandidateEntries() → detectContradictions() → buildContradictionWarningHtml()
  ```
- [ ] 将生成的 HTML 插入到 AI 回答区域下方
- [ ] 绑定"查看"按钮 → 滚动/跳转到已有条目详情
- [ ] 绑定"忽略"按钮 → 移除告警 DOM 或标记已读
- [ ] 矛盾检测异步执行，不阻塞用户交互（loading 状态可选）

### Task 3: `CHANGELOG.md` — 文档更新

- [ ] 在 `[2.0.0]` 新增部分追加 L2.3 条目：
  ```
  - **矛盾检测**：新回答与已有知识冲突时主动提示用户，支持版本号快速检测 + AI 深度语义检测
  ```

---

## 结论

**⚠️ 审查不通过 — 核心库实现完整，但集成完全缺失**

`lib/contradiction-detector.js` 是一个高质量的独立模块（590 行，42 个测试全通过），但 L2.3 迭代的最终目标——**在侧边栏中向用户展示知识冲突提示**——尚未实现。

当前状态等价于造了一台引擎但没有装到车上。需要完成上述 3 个返工任务，才能让用户真正受益于矛盾检测功能。
