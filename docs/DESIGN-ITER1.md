# DESIGN — R87: BookmarkDocumentation

> 飞轮迭代 Phase 2: 设计 (Plan Agent)
> 生成时间: 2026-05-15 09:00

## 架构设计

### 模块结构

```
lib/bookmark-documentation.js  — 主模块（纯数据，无状态）
tests/test-bookmark-documentation.js  — 测试文件
```

### 核心 API

```javascript
// 使用指南
getGuides(lang?) → Guide[]
// { id, title, titleKey, sections: { heading, content, contentKey }[] }

// API 文档
getApiDocs() → ModuleDoc[]
// { moduleName, description, exports: { name, signature, params, returns, description }[] }

// FAQ
getFAQ(lang?) → FAQItem[]
// { id, question, questionKey, answer, answerKey, category }

// FAQ 搜索
searchFAQ(keyword, lang?) → FAQItem[]
// 支持中英文，匹配 question + answer

// 故障排除
getTroubleshooting(lang?) → TroubleshootItem[]
// { id, title, titleKey, symptoms: string[], solutions: string[], solutionKeys: string[] }
```

### 设计决策

1. **纯数据模块**: 所有内容硬编码为静态数据，不依赖文件系统或网络
2. **i18n 集成**: 每条内容附带 i18n key，支持 `t(key)` 动态切换语言
3. **懒加载友好**: 所有函数独立，可按需 import
4. **搜索算法**: FAQ 搜索使用简单的 includes 匹配（中英文逐字 + 关键词）

### i18n Key 命名规范

```
bookmark-doc.guide.{topic}.title
bookmark-doc.guide.{topic}.section.{id}
bookmark-doc.faq.{id}.question
bookmark-doc.faq.{id}.answer
bookmark-doc.troubleshoot.{id}.title
bookmark-doc.troubleshoot.{id}.solution.{n}
```

### 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/bookmark-documentation.js` | 新增 | 主模块 |
| `tests/test-bookmark-documentation.js` | 新增 | 测试文件 |
| `lib/bookmark-i18n.js` | 修改 | 注册新 i18n keys |
| `docs/IMPLEMENTATION.md` | 修改 | 记录实现 |
| `docs/CHANGELOG.md` | 修改 | 记录变更 |
| `docs/TODO.md` | 修改 | 标记完成 |
