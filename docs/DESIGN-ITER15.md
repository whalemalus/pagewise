# 设计文档 — 迭代 #15: 多语言支持增强

> 日期: 2026-04-30
> 状态: 实现中

## 背景

当前语言检测仅在 content script 中内联实现（`detectPageLanguage`），支持 zh/en/other 三种分类。
侧边栏的 `_buildLanguagePrompt` 方法简单地输出「请优先使用与页面相同的语言回答」，但未处理
常见的**英文文档中文问答**场景——用户阅读英文文档时用中文提问，期望 AI 用中文回答，
同时保留英文术语原文。

## 需求

1. 独立语言检测模块（可复用于 sidebar / content / background）
2. 检测页面内容语言（扩展支持：zh、en、ja、ko、fr、de、es、ru、pt、ar、其他）
3. 检测用户问题语言
4. 根据「用户问题语言」优先决定回答语言（覆盖页面语言检测）
5. 英文文档 + 中文提问 → 中文回答 + 保留英文术语（双语标注）
6. 支持用户设置中指定「首选回答语言」
7. 为 AI 构建精确的多语言系统 prompt 片段

## 架构设计

### 新增模块: `lib/i18n-detector.js`

```
┌─────────────────────────────────────────┐
│          I18nDetector                    │
├─────────────────────────────────────────┤
│ detectLanguage(text)        → string     │  检测文本主语言
│ detectQuestionLanguage(q)   → string     │  检测用户问题语言
│ determineResponseLanguage(  → string     │  决定最佳回答语言
│   pageLang, questionLang,                │
│   preferredLang)                         │
│ buildMultilingualPrompt(   → string     │  构建多语言 system prompt
│   pageLang, questionLang,                │
│   responseLang, pageContent?)            │
└─────────────────────────────────────────┘
```

#### 语言检测策略

1. **CJK 检测**: Unicode 范围 0x4E00-0x9FFF (CJK Unified)、0x3400-0x4DBF (CJK Extension A)
2. **日文检测**: 平假名 0x3040-0x309F、片假名 0x30A0-0x30FF
3. **韩文检测**: 韩文字母 0xAC00-0xD7AF、韩文 Jamo 0x1100-0x11FF
4. **阿拉伯文检测**: 0x0600-0x06FF
5. **西里尔文检测 (俄语)**: 0x0400-0x04FF
6. **拉丁文**: 0x0041-0x024F（英/法/德/西/葡/意等共享，按常见词区分）
7. **代码**: 自动忽略代码块（```...```）避免干扰

#### 语言标识

- `'zh'` — 中文
- `'en'` — 英文
- `'ja'` — 日文
- `'ko'` — 韩文
- `'ar'` — 阿拉伯文
- `'ru'` — 俄文
- `'other'` — 其他/混合语言

#### 交叉语言场景的 prompt 策略

| 页面语言 | 问题语言 | 回答语言 | 额外指令 |
|----------|----------|----------|----------|
| en       | zh       | zh       | 中文回答，保留英文术语，关键术语双语标注 |
| en       | en       | en       | 英文回答 |
| zh       | zh       | zh       | 中文回答 |
| zh       | en       | en       | 英文回答 |
| ja       | zh       | zh       | 中文回答，保留日文术语 |
| en       | ja       | ja       | 日文回答，保留英文术语 |
| *        | *        | preferred| 使用用户设置的首选语言 |

### 与 Sidebar 集成

1. `sidebar/sidebar.js` 中 import `I18nDetector`
2. `_buildLanguagePrompt()` 改为调用 `I18nDetector.buildMultilingualPrompt()`
3. `sendMessage()` 中使用检测到的语言决定 prompt 策略

## 文件清单

| 操作 | 文件 |
|------|------|
| 新增 | `lib/i18n-detector.js` |
| 新增 | `tests/test-i18n-detector.js` |
| 修改 | `sidebar/sidebar.js`（集成 I18nDetector） |
| 修改 | `docs/IMPLEMENTATION.md` |
| 修改 | `docs/CHANGELOG.md` |
| 修改 | `docs/TODO.md` |
