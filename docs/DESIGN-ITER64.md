# DESIGN — R64: BookmarkContentPreview

> 迭代: R64
> 日期: 2026-05-05

## 架构概述

```
BookmarkContentPreview
├── extractUrlInfo(url) → { domain, path, protocol, favicon }
├── generateTextPreview(bookmark, opts) → string
├── generateHtmlPreview(bookmark, opts) → string
└── generateSnapshotPreview(bookmark, snapshot) → string
```

纯数据模块，无状态，所有方法为 static 或 pure function。

## 设计决策

| ID | 决策 | 原因 |
|----|------|------|
| D64-1 | 使用 static 方法而非实例方法 | 预览生成是无状态操作，无需实例化 |
| D64-2 | URL 解析使用 `new URL()` 而非正则 | 更可靠，自动处理各种 URL 格式 |
| D64-3 | 截断使用字符数而非词数 | 中文无空格分词，字符数更通用 |
| D64-4 | HTML 输出使用模板字符串而非 DOM API | 纯字符串输出，兼容 Node.js 测试 |

## 接口设计

### BookmarkContentPreview (export class)

```javascript
/**
 * @typedef {Object} PreviewOptions
 * @property {number}  [maxLength=200]  - 预览最大字符数
 * @property {boolean} [includeTags=true] - 是否包含标签
 * @property {boolean} [includeStatus=true] - 是否包含状态
 * @property {boolean} [includeFolder=true] - 是否包含文件夹路径
 */

export class BookmarkContentPreview {
  /** 从 URL 提取结构化信息 */
  static extractUrlInfo(url) → { domain, path, protocol, favicon }

  /** 生成纯文本预览 */
  static generateTextPreview(bookmark, opts?) → string

  /** 生成 HTML 预览卡片 */
  static generateHtmlPreview(bookmark, opts?) → string

  /** 从页面快照生成内容预览 */
  static generateSnapshotPreview(bookmark, snapshotContent, opts?) → string

  /** 内部: 截断文本 */
  static _truncate(text, maxLen) → string

  /** 内部: 转义 HTML */
  static _escapeHtml(str) → string
}
```

### 书签对象格式 (复用 BookmarkCollector)

```javascript
{
  id: string,
  title: string,
  url: string,
  folderPath: string[],  // ['Frontend', 'React']
  tags: string[],
  status: 'unread' | 'reading' | 'read',
  dateAdded: number
}
```

## 测试计划

1. extractUrlInfo: 正常 URL、带查询参数、特殊字符、无效 URL
2. generateTextPreview: 最小书签、完整书签、截断、空标题
3. generateHtmlPreview: 输出包含关键元素、XSS 转义
4. generateSnapshotPreview: 有快照、无快照、超长内容
5. _truncate: 短文本不截断、长文本截断、中文字符
6. _escapeHtml: <script> 标签、引号、& 符号

## 文件清单

| 文件 | 操作 |
|------|------|
| `lib/bookmark-preview.js` | 新建 |
| `tests/test-bookmark-preview.js` | 新建 |
| `docs/CHANGELOG.md` | 追加 |
| `docs/TODO.md` | 标记 R64 完成 |
