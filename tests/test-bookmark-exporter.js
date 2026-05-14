/**
 * 测试 lib/bookmark-exporter.js — 书签导出器增强
 *
 * 测试范围:
 *   exportToNetscape / exportToMarkdown / exportToOPML / exportToJSONLD / exportToCSV
 *   importFromNetscape / importFromMarkdown
 *   边界情况 / 综合场景
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  BookmarkExporter,
  exportToNetscape,
  exportToMarkdown,
  exportToOPML,
  exportToJSONLD,
  exportToCSV,
  importFromNetscape,
  importFromMarkdown,
} = await import('../lib/bookmark-exporter.js')

// ==================== 辅助: 构造书签 ====================

function bm(id, title, url, opts = {}) {
  return {
    id: String(id),
    title,
    url,
    folderPath: opts.folderPath || [],
    tags: opts.tags || [],
    description: opts.description || '',
    dateAdded: opts.dateAdded || '',
    lastModified: opts.lastModified || '',
  }
}

const SAMPLE_BOOKMARKS = [
  bm(1, 'GitHub', 'https://github.com', {
    folderPath: ['开发工具'],
    tags: ['code', 'git'],
    description: '代码托管平台',
    dateAdded: '2024-01-15T10:00:00Z',
  }),
  bm(2, 'MDN Web Docs', 'https://developer.mozilla.org', {
    folderPath: ['开发工具', '文档'],
    tags: ['docs', 'web'],
    description: 'Web 开发文档',
    dateAdded: '2024-02-20T12:00:00Z',
  }),
  bm(3, 'Hacker News', 'https://news.ycombinator.com', {
    folderPath: ['新闻'],
    tags: ['tech', 'news'],
    description: '技术新闻',
  }),
  bm(4, 'Root Bookmark', 'https://example.com', {}),
]

// ==================== BookmarkExporter 静态方法 ====================

describe('BookmarkExporter 静态方法', () => {
  it('应通过静态方法访问所有导出函数', () => {
    assert.equal(typeof BookmarkExporter.exportToNetscape, 'function')
    assert.equal(typeof BookmarkExporter.exportToMarkdown, 'function')
    assert.equal(typeof BookmarkExporter.exportToOPML, 'function')
    assert.equal(typeof BookmarkExporter.exportToJSONLD, 'function')
    assert.equal(typeof BookmarkExporter.exportToCSV, 'function')
    assert.equal(typeof BookmarkExporter.importFromNetscape, 'function')
    assert.equal(typeof BookmarkExporter.importFromMarkdown, 'function')
  })

  it('静态方法应产生与独立函数相同的结果', () => {
    const netscape1 = BookmarkExporter.exportToNetscape(SAMPLE_BOOKMARKS)
    const netscape2 = exportToNetscape(SAMPLE_BOOKMARKS)
    assert.equal(netscape1, netscape2)
  })
})

// ==================== exportToNetscape ====================

describe('exportToNetscape', () => {
  it('应生成有效的 Netscape Bookmark 文件头', () => {
    const result = exportToNetscape(SAMPLE_BOOKMARKS)
    assert.ok(result.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>'))
    assert.ok(result.includes('<TITLE>Bookmarks</TITLE>'))
    assert.ok(result.includes('<H1>Bookmarks</H1>'))
  })

  it('应包含书签链接和正确的 HREF', () => {
    const result = exportToNetscape(SAMPLE_BOOKMARKS)
    assert.ok(result.includes('HREF="https://github.com"'))
    assert.ok(result.includes('HREF="https://developer.mozilla.org"'))
    assert.ok(result.includes('>GitHub</A>'))
    assert.ok(result.includes('>MDN Web Docs</A>'))
  })

  it('应生成嵌套文件夹层级 (DT/H3/DL)', () => {
    const result = exportToNetscape(SAMPLE_BOOKMARKS)
    assert.ok(result.includes('<H3>开发工具</H3>'))
    assert.ok(result.includes('<H3>新闻</H3>'))
    assert.ok(result.includes('<H3>文档</H3>'))
  })

  it('应包含 ADD_DATE 和 TAGS 属性', () => {
    const result = exportToNetscape(SAMPLE_BOOKMARKS)
    assert.ok(result.includes('ADD_DATE='))
    assert.ok(result.includes('TAGS="code,git"'))
  })

  it('应包含 DD 描述', () => {
    const result = exportToNetscape(SAMPLE_BOOKMARKS)
    assert.ok(result.includes('<DD>代码托管平台'))
  })

  it('应处理空书签数组', () => {
    const result = exportToNetscape([])
    assert.ok(result.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>'))
    assert.ok(result.includes('<DL><p></DL><p>'))
  })

  it('应处理 null/undefined 输入', () => {
    assert.ok(exportToNetscape(null).includes('<!DOCTYPE'))
    assert.ok(exportToNetscape(undefined).includes('<!DOCTYPE'))
  })
})

// ==================== exportToMarkdown ====================

describe('exportToMarkdown', () => {
  it('应生成 Markdown 标题和书签列表', () => {
    const result = exportToMarkdown(SAMPLE_BOOKMARKS)
    assert.ok(result.startsWith('# Bookmarks'))
    assert.ok(result.includes('- [GitHub](https://github.com)'))
    assert.ok(result.includes('- [MDN Web Docs](https://developer.mozilla.org)'))
  })

  it('应将文件夹映射为 Markdown 标题层级', () => {
    const result = exportToMarkdown(SAMPLE_BOOKMARKS)
    assert.ok(result.includes('## 开发工具'))
    assert.ok(result.includes('## 新闻'))
    assert.ok(result.includes('### 文档'))
  })

  it('应包含标签作为 inline code', () => {
    const result = exportToMarkdown(SAMPLE_BOOKMARKS)
    assert.ok(result.includes('`code`'))
    assert.ok(result.includes('`git`'))
    assert.ok(result.includes('`tech`'))
  })

  it('应包含描述作为引用块', () => {
    const result = exportToMarkdown(SAMPLE_BOOKMARKS)
    assert.ok(result.includes('> 代码托管平台'))
    assert.ok(result.includes('> Web 开发文档'))
  })

  it('应处理空书签数组', () => {
    const result = exportToMarkdown([])
    assert.ok(result.includes('No bookmarks to export'))
  })
})

// ==================== exportToOPML ====================

describe('exportToOPML', () => {
  it('应生成有效的 OPML XML', () => {
    const result = exportToOPML(SAMPLE_BOOKMARKS)
    assert.ok(result.includes('<?xml version="1.0" encoding="UTF-8"?>'))
    assert.ok(result.includes('<opml version="2.0">'))
    assert.ok(result.includes('</opml>'))
  })

  it('应包含 outline 元素和书签属性', () => {
    const result = exportToOPML(SAMPLE_BOOKMARKS)
    assert.ok(result.includes('text="GitHub"'))
    assert.ok(result.includes('xmlUrl="https://github.com"'))
    assert.ok(result.includes('htmlUrl="https://github.com"'))
  })

  it('应将文件夹作为嵌套 outline', () => {
    const result = exportToOPML(SAMPLE_BOOKMARKS)
    assert.ok(result.includes('text="开发工具"'))
    assert.ok(result.includes('text="新闻"'))
  })

  it('应处理包含特殊字符的书签', () => {
    const special = [bm(1, 'A & B "Test"', 'https://example.com?a=1&b=2')]
    const result = exportToOPML(special)
    assert.ok(result.includes('A &amp; B &quot;Test&quot;'))
    assert.ok(result.includes('https://example.com?a=1&amp;b=2'))
  })

  it('应处理空书签数组', () => {
    const result = exportToOPML([])
    assert.ok(result.includes('<opml version="2.0">'))
    assert.ok(result.includes('</opml>'))
  })
})

// ==================== exportToJSONLD ====================

describe('exportToJSONLD', () => {
  it('应生成 JSON-LD 结构 with schema.org 上下文', () => {
    const result = JSON.parse(exportToJSONLD(SAMPLE_BOOKMARKS))
    assert.equal(result['@context'], 'https://schema.org')
    assert.equal(result['@type'], 'ItemList')
    assert.equal(result.numberOfItems, 4)
  })

  it('应包含 ListItem 条目', () => {
    const result = JSON.parse(exportToJSONLD(SAMPLE_BOOKMARKS))
    assert.equal(result.itemListElement.length, 4)
    const first = result.itemListElement[0]
    assert.equal(first['@type'], 'ListItem')
    assert.equal(first.position, 1)
    assert.equal(first.item['@type'], 'WebPage')
    assert.equal(first.item.name, 'GitHub')
    assert.equal(first.item.url, 'https://github.com')
  })

  it('应包含可选字段 (description, keywords, genre)', () => {
    const result = JSON.parse(exportToJSONLD(SAMPLE_BOOKMARKS))
    const item = result.itemListElement[0].item
    assert.equal(item.description, '代码托管平台')
    assert.equal(item.keywords, 'code, git')
    assert.equal(item.genre, '开发工具')
  })

  it('应处理空书签数组', () => {
    const result = JSON.parse(exportToJSONLD([]))
    assert.equal(result.numberOfItems, 0)
    assert.deepEqual(result.itemListElement, [])
  })
})

// ==================== exportToCSV ====================

describe('exportToCSV', () => {
  it('应生成带表头的 CSV', () => {
    const result = exportToCSV(SAMPLE_BOOKMARKS)
    const lines = result.split('\n')
    assert.ok(lines[0].includes('title'))
    assert.ok(lines[0].includes('url'))
    assert.ok(lines[1].includes('GitHub'))
    assert.ok(lines[1].includes('https://github.com'))
  })

  it('应支持自定义列', () => {
    const result = exportToCSV(SAMPLE_BOOKMARKS, { columns: ['title', 'url'] })
    const lines = result.split('\n')
    const headerCols = lines[0].split(',')
    assert.equal(headerCols.length, 2)
    assert.equal(headerCols[0], 'title')
    assert.equal(headerCols[1], 'url')
  })

  it('应将数组字段 (tags/folderPath) 转为分号分隔', () => {
    const result = exportToCSV(SAMPLE_BOOKMARKS)
    const lines = result.split('\n')
    assert.ok(lines[1].includes('code;git'))
    assert.ok(lines[1].includes('开发工具'))
  })

  it('应支持自定义分隔符', () => {
    const result = exportToCSV(SAMPLE_BOOKMARKS, { delimiter: '\t' })
    const lines = result.split('\n')
    assert.ok(lines[0].includes('\t'))
    assert.ok(!lines[0].includes(','))
  })

  it('应支持省略表头', () => {
    const result = exportToCSV(SAMPLE_BOOKMARKS, { includeHeader: false })
    const lines = result.split('\n')
    // 第一行不应是表头
    assert.ok(lines[0].includes('GitHub'))
  })

  it('应正确转义包含逗号的字段', () => {
    const csvBookmarks = [bm(1, 'Hello, World', 'https://example.com')]
    const result = exportToCSV(csvBookmarks)
    assert.ok(result.includes('"Hello, World"'))
  })

  it('应正确转义包含引号的字段', () => {
    const csvBookmarks = [bm(1, 'Say "Hi"', 'https://example.com')]
    const result = exportToCSV(csvBookmarks)
    assert.ok(result.includes('"Say ""Hi"""'))
  })

  it('应处理 null/undefined 输入', () => {
    const result = exportToCSV(null)
    assert.equal(typeof result, 'string')
    const result2 = exportToCSV(undefined)
    assert.equal(typeof result2, 'string')
  })
})

// ==================== importFromNetscape ====================

describe('importFromNetscape', () => {
  it('应解析 Netscape 格式的书签', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>工具</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1705312800">GitHub</A>
        <DD>代码平台
    </DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1705312800">Example</A>
</DL><p>`

    const bookmarks = importFromNetscape(html)
    assert.equal(bookmarks.length, 2)
    assert.equal(bookmarks[0].title, 'GitHub')
    assert.equal(bookmarks[0].url, 'https://github.com')
    assert.deepEqual(bookmarks[0].folderPath, ['工具'])
    assert.equal(bookmarks[0].description, '代码平台')
    assert.equal(bookmarks[1].title, 'Example')
    assert.deepEqual(bookmarks[1].folderPath, [])
  })

  it('应解析嵌套文件夹', () => {
    const html = `<DL><p>
    <DT><H3>开发</H3>
    <DL><p>
        <DT><H3>前端</H3>
        <DL><p>
            <DT><A HREF="https://vuejs.org">Vue</A>
        </DL><p>
    </DL><p>
</DL><p>`

    const bookmarks = importFromNetscape(html)
    assert.equal(bookmarks.length, 1)
    assert.deepEqual(bookmarks[0].folderPath, ['开发', '前端'])
  })

  it('应解析 TAGS 属性', () => {
    const html = `<DL><p>
    <DT><A HREF="https://example.com" TAGS="a,b,c">Tagged</A>
</DL><p>`

    const bookmarks = importFromNetscape(html)
    assert.deepEqual(bookmarks[0].tags, ['a', 'b', 'c'])
  })

  it('应处理空/无效输入', () => {
    assert.deepEqual(importFromNetscape(''), [])
    assert.deepEqual(importFromNetscape(null), [])
    assert.deepEqual(importFromNetscape(undefined), [])
  })
})

// ==================== importFromMarkdown ====================

describe('importFromMarkdown', () => {
  it('应解析 Markdown 链接列表', () => {
    const md = `# Bookmarks

## 工具
- [GitHub](https://github.com)
- [MDN](https://developer.mozilla.org)`

    const bookmarks = importFromMarkdown(md)
    assert.equal(bookmarks.length, 2)
    assert.equal(bookmarks[0].title, 'GitHub')
    assert.equal(bookmarks[0].url, 'https://github.com')
    assert.deepEqual(bookmarks[0].folderPath, ['工具'])
  })

  it('应解析行内标签', () => {
    const md = `- [Example](https://example.com) \`tag1\` \`tag2\``
    const bookmarks = importFromMarkdown(md)
    assert.equal(bookmarks.length, 1)
    assert.deepEqual(bookmarks[0].tags, ['tag1', 'tag2'])
  })

  it('应解析引用描述', () => {
    const md = `- [Example](https://example.com)
  > 这是一段描述`

    const bookmarks = importFromMarkdown(md)
    assert.equal(bookmarks.length, 1)
    assert.equal(bookmarks[0].description, '这是一段描述')
  })

  it('应忽略根 Bookmarks 标题', () => {
    const md = `# Bookmarks

## 文件夹
- [Test](https://test.com)`

    const bookmarks = importFromMarkdown(md)
    assert.equal(bookmarks.length, 1)
    assert.deepEqual(bookmarks[0].folderPath, ['文件夹'])
  })

  it('应处理空/无效输入', () => {
    assert.deepEqual(importFromMarkdown(''), [])
    assert.deepEqual(importFromMarkdown(null), [])
    assert.deepEqual(importFromMarkdown(undefined), [])
  })
})

// ==================== 往返测试: export → import ====================

describe('往返测试 (round-trip)', () => {
  it('Netscape 导出再导入应保留核心数据', () => {
    const bookmarks = [
      bm(1, 'Test Page', 'https://test.com', {
        folderPath: ['Folder A'],
        tags: ['tag1'],
        description: 'A test page',
        dateAdded: '2024-01-01T00:00:00Z',
      }),
    ]

    const exported = exportToNetscape(bookmarks)
    const imported = importFromNetscape(exported)

    assert.equal(imported.length, 1)
    assert.equal(imported[0].title, 'Test Page')
    assert.equal(imported[0].url, 'https://test.com')
    assert.deepEqual(imported[0].folderPath, ['Folder A'])
    assert.equal(imported[0].description, 'A test page')
  })

  it('Markdown 导出再导入应保留核心数据', () => {
    const bookmarks = [
      bm(1, 'Docs', 'https://docs.example.com', {
        folderPath: ['参考'],
        tags: ['ref'],
        description: '参考文档',
      }),
    ]

    const exported = exportToMarkdown(bookmarks)
    const imported = importFromMarkdown(exported)

    assert.equal(imported.length, 1)
    assert.equal(imported[0].title, 'Docs')
    assert.equal(imported[0].url, 'https://docs.example.com')
    assert.deepEqual(imported[0].folderPath, ['参考'])
    assert.deepEqual(imported[0].tags, ['ref'])
    assert.equal(imported[0].description, '参考文档')
  })

  it('无文件夹书签的往返测试', () => {
    const bookmarks = [bm(1, 'Plain', 'https://plain.com')]
    const exported = exportToNetscape(bookmarks)
    const imported = importFromNetscape(exported)
    assert.equal(imported.length, 1)
    assert.equal(imported[0].title, 'Plain')
    assert.deepEqual(imported[0].folderPath, [])
  })
})
