# VERIFICATION.md — Iteration #15 Review

> **任务**: 多语言支持增强 — 英文文档中文问答优化
> **审查日期**: 2026-04-30
> **审查人**: Guard Agent (Claude)

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | 核心功能断裂：调用方未更新参数，问题语言检测在运行时永远不会生效 |
| 代码质量 | ⚠️ | i18n-detector.js 本身质量良好，但 sidebar 集成存在签名不匹配 |
| 测试覆盖 | ⚠️ | 独立模块 52/52 测试全通过，但缺少集成测试；未覆盖 sidebar 调用链路 |
| 文档同步 | ❌ | TODO.md 未标记完成、CHANGELOG.md 未新增 R15 条目、IMPLEMENTATION.md 未更新 |

**总评: ❌ 不可合入 — 存在阻断性缺陷，需返工**

---

## 发现的问题

### 🔴 P0 — 阻断性缺陷

#### BUG-1: `_buildLanguagePrompt()` 调用签名不匹配（核心功能断裂）

**位置**: `sidebar/sidebar.js` 第 2327 行

**现象**: 函数签名已改为 `_buildLanguagePrompt(pageLang, questionText)`（需要 2 个参数），但唯一的调用方只传了 1 个参数：

```javascript
// 第 2327 行 — 调用方（未更新）
+ this._buildLanguagePrompt(contentWithSelection.language);

// 第 465 行 — 新函数签名
+ _buildLanguagePrompt(pageLang, questionText) {
```

**后果**:
1. `questionText` 在运行时始终为 `undefined`
2. `detectQuestionLanguage(undefined)` 返回 `null`
3. **英文文档 + 中文提问 → 中文回答** 这一 R15 核心场景完全失效
4. 用户在英文文档上用中文提问时，AI 将按页面语言（英文）回答，而非期望的中文

**修复方案**: 将调用处改为：
```javascript
this._buildLanguagePrompt(contentWithSelection.language, text)
```
其中 `text` 是用户输入的问题文本，已在第 2280 行的 `sendMessage(text, selection)` 中可获得。

---

### 🟡 P1 — 重要问题

#### ISSUE-1: 文档未同步更新

| 文档 | 状态 | 缺失 |
|------|------|------|
| `docs/TODO.md` | ❌ | "多语言支持增强" 仍标记为 `[ ]`（未完成），应更新为 `[x]` |
| `docs/CHANGELOG.md` | ❌ | 无 R15 条目，应在 `[Unreleased]` 下新增变更记录 |
| `docs/IMPLEMENTATION.md` | ❌ | 仅包含 R8 内容，未新增 R15 实现记录 |

#### ISSUE-2: 设计文档与实现范围不一致

设计文档 `DESIGN-ITER15.md` 提到：
- 支持语言：zh、en、ja、ko、**fr**、**de**、**es**、ru、**pt**、ar
- `buildMultilingualPrompt()` 签名包含 `pageContent?` 参数

实际实现：
- 仅支持：zh、en、ja、ko、ru、ar（缺失 fr/de/es/pt）
- `buildMultilingualPrompt()` 无 `pageContent?` 参数

**评估**: fr/de/es/pt 属于拉丁字母语言，Unicode 范围与英文相同，需要词频分析才能区分。当前实现简化为 'en' 可接受，但应从设计文档中删除未实现的语言以避免混淆。`pageContent?` 参数的移除是合理简化。

---

### 🟢 P2 — 建议改进

#### SUGGEST-1: 缺少集成测试

52 个测试仅覆盖 `lib/i18n-detector.js` 独立模块。未测试：
- sidebar 中 `_buildLanguagePrompt()` 被正确调用的路径
- `contentWithSelection.language` 和 `text` 参数的传递链路
- `this.settings?.responseLanguage` 设置的读取

建议新增至少 1 个集成测试，验证端到端调用链。

#### SUGGEST-2: `countScripts()` 未导出

`countScripts()` 是纯函数，可独立测试，但未从模块中导出。如有调试/扩展需求，建议导出或标记为内部函数。

---

## 代码亮点 ✅

1. **模块设计清晰** — `i18n-detector.js` 为独立模块，职责单一，API 明确（4 个导出函数），符合设计文档的"可复用"目标
2. **防御性编程** — `detectLanguage()` 对 null/undefined/空字符串/纯数字等边界情况处理完善
3. **代码块剥离** — `stripCodeBlocks()` 避免围栏代码块干扰语言检测，设计合理
4. **语言决策优先级清晰** — 用户设置 > 问题语言 > 页面语言 > 默认中文，符合直觉
5. **跨语言 prompt 策略** — 同语言简单指令 vs 跨语言详细策略（含术语双语标注），对 AI 回答质量有实质提升
6. **测试覆盖全面** — 52 个测试，7 个 describe 分组，覆盖正常/边界/异常/集成场景

---

## 返工任务清单

| # | 优先级 | 任务 | 文件 |
|---|--------|------|------|
| 1 | 🔴 P0 | 修复调用方：`_buildLanguagePrompt(contentWithSelection.language)` → `_buildLanguagePrompt(contentWithSelection.language, text)` | `sidebar/sidebar.js:2327` |
| 2 | 🟡 P1 | 更新 TODO.md：将"多语言支持增强"标记为 `[x]` | `docs/TODO.md` |
| 3 | 🟡 P1 | 更新 CHANGELOG.md：在 `[Unreleased]` 下新增 R15 变更记录 | `docs/CHANGELOG.md` |
| 4 | 🟡 P1 | 更新 IMPLEMENTATION.md：新增 R15 实现记录 | `docs/IMPLEMENTATION.md` |
| 5 | 🟡 P1 | 同步设计文档：移除未实现的 fr/de/es/pt 语言，移除 `pageContent?` 参数描述 | `docs/DESIGN-ITER15.md` |
| 6 | 🟢 P2 | 新增集成测试：验证 sidebar 调用链路和 settings.responseLanguage | `tests/test-i18n-detector.js` |

---

## 结论

**R15 核心模块 `lib/i18n-detector.js` 实现质量优秀**，语言检测算法和多语言 prompt 构建逻辑完善，52 个单元测试全部通过。

**但 sidebar 集成存在阻断性缺陷**：函数签名变更后未同步更新调用方，导致问题语言检测功能在运行时完全失效。这是 R15 最核心的价值点（英文文档中文问答 → 中文回答），必须修复后方可合入。

**合入决策: ❌ BLOCK** — 修复 BUG-1 后可合入。
