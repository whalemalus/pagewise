# IMPLEMENTATION — R64: BookmarkContentPreview

> 迭代: R64
> 日期: 2026-05-05
> 状态: ✅ 完成

## 实现内容

### lib/bookmark-preview.js (231 行)

`BookmarkContentPreview` 类，6 个 static 方法，纯数据模块无状态：

| 方法 | 行数 | 功能 |
|------|------|------|
| `extractUrlInfo(url)` | 56-68 | URL 解析 → `{ domain, path, protocol, favicon }` |
| `generateTextPreview(bookmark, opts)` | 78-115 | 纯文本预览，支持标签/状态/文件夹开关 |
| `generateHtmlPreview(bookmark, opts)` | 125-163 | HTML 卡片，含 XSS 转义 |
| `generateSnapshotPreview(bookmark, snapshot, opts)` | 174-196 | 快照内容 + 书签信息组合 |
| `_truncate(text, maxLen)` | 206-211 | 字符截断 + `...`，拒绝 Infinity |
| `_escapeHtml(str)` | 218-226 | 转义 `< > & " '` |

### 测试 (31 用例，全部通过)

- extractUrlInfo: 5 用例 (正常/查询参数/无效/空/特殊字符)
- generateTextPreview: 8 用例 (最小/完整/截断/空标题/选项控制)
- generateHtmlPreview: 6 用例 (结构/XSS/标签/状态)
- generateSnapshotPreview: 4 用例 (有快照/无快照/超长/null)
- _truncate: 4 用例 (短文本/长文本/中文/Infinity)
- _escapeHtml: 4 用例 (script标签/引号/&符号/非字符串)

### 设计决策

- 使用 `Object.freeze` 保护默认配置
- `Number.MAX_SAFE_INTEGER` 替代 `Infinity`（Number.isFinite 拒绝 Infinity）
- STATUS_LABELS 中文映射支持国际化需求

## Git 提交

```
b387836 feat: R64 BookmarkContentPreview — 书签内容预览模块
```
