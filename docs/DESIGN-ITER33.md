# 设计文档 — 迭代 33: L3.5 Wiki Lint 工具

> 日期: 2026-04-30

---

## 目标

定期对 Wiki 健康检查，发现并报告以下问题：

1. **孤立页面** — 没有任何入站链接或出站链接的页面
2. **断裂链接** — `[[wikilink]]` 指向不存在的页面
3. **过时内容** — 长时间未更新的页面
4. **矛盾标记审查** — 未解决的矛盾标记汇总
5. **知识覆盖度报告** — 哪些主题缺少深度
6. **一键修复建议** — 针对每类问题生成具体修复建议

## 设计原则

- 纯 ES Module，不依赖 IndexedDB 或 Chrome API
- 与 WikiStore / ContradictionDetector 完全解耦
- 纯函数：输入数据 → 输出报告，无副作用
- 支持 Markdown 和 HTML 两种输出格式

## 模块结构

### `lib/wiki-lint.js`

**导出常量：**
- `ISSUE_TYPE` — 问题类型枚举（orphan_page, broken_link, outdated_content, unresolved_contradiction, shallow_topic）
- `ISSUE_SEVERITY` — 问题严重性枚举（error, warning, info）
- `DEFAULT_LINT_OPTIONS` — 默认 lint 选项

**导出函数：**
- `detectOrphanPages(pages, backlinkIndex)` — 检测孤立页面
- `detectBrokenLinks(pages, pageMap)` — 检测断裂链接
- `detectOutdatedContent(pages, options)` — 检测过时内容
- `reviewContradictions(contradictions)` — 矛盾标记审查汇总
- `analyzeCoverage(pages, options)` — 知识覆盖度分析
- `generateFixSuggestions(issues)` — 根据问题生成修复建议
- `runWikiLint(pages, contradictions, options)` — 主 lint 流程
- `generateLintReportMarkdown(lintResult)` — Markdown 报告
- `generateLintReportHtml(lintResult)` — HTML 报告
- `LintResult` 类 — lint 结果数据结构

### `tests/test-wiki-lint.js`

测试先行，覆盖所有函数和边界条件。

## 数据结构

```js
// Lint 问题
{
  type: 'orphan_page' | 'broken_link' | 'outdated_content' | 'unresolved_contradiction' | 'shallow_topic',
  severity: 'error' | 'warning' | 'info',
  pageId: 'entity:react',
  title: 'React',
  message: '描述问题',
  details: { ... },
  fixSuggestion: '建议操作',
}

// Lint 结果
{
  issues: [...],
  stats: {
    totalPages: 0,
    orphanCount: 0,
    brokenLinkCount: 0,
    outdatedCount: 0,
    contradictionCount: 0,
    shallowTopicCount: 0,
  },
  coverage: {
    entityCount: 0,
    conceptCount: 0,
    qaCount: 0,
    avgLinksPerPage: 0,
    wellConnectedRatio: 0,
  },
  ranAt: 'ISO date string',
}
```
