/**
 * BookmarkExporter — 书签导出器增强
 *
 * 支持多种格式的书签导入/导出:
 *   - exportToNetscape(bookmarks)        — Netscape Bookmark File Format
 *   - exportToMarkdown(bookmarks)        — 结构化 Markdown
 *   - exportToOPML(bookmarks)            — OPML (for RSS readers)
 *   - exportToJSONLD(bookmarks)          — JSON-LD with schema.org
 *   - exportToCSV(bookmarks, options)    — CSV with custom columns
 *   - importFromNetscape(htmlString)     — 解析 Netscape 格式
 *   - importFromMarkdown(mdString)       — 解析 Markdown 格式
 *
 * 纯前端实现，不依赖外部 API。
 *
 * @module lib/bookmark-exporter
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 * @property {string}   [description]
 * @property {string}   [dateAdded]
 * @property {string}   [lastModified]
 */

/**
 * 默认 CSV 列配置
 */
const DEFAULT_CSV_COLUMNS = ['title', 'url', 'folderPath', 'tags', 'description', 'dateAdded']

/**
 * CSV 分隔符转义
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * XML 特殊字符转义
 */
function escapeXML(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * HTML 特殊字符转义 (用于 Netscape 格式)
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 将 dateAdded 时间戳转为 Unix 时间戳字符串
 * Chrome 书签的 dateAdded 是微秒级的 WebKit 时间戳
 */
function toUnixTimestamp(dateStr) {
  if (!dateStr) return ''
  // 如果已经是纯数字 (微秒)
  if (/^\d+$/.test(dateStr)) {
    return dateStr
  }
  // 尝试解析为 Date
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  // 返回秒级时间戳 → 微秒级 (与 Netscape 格式一致)
  return String(Math.floor(d.getTime() / 1000))
}

/**
 * 按文件夹路径分组书签
 * @param {Bookmark[]} bookmarks
 * @returns {Map<string, Bookmark[]>} key 是 folderPath.join('/'), value 是该文件夹下的书签
 */
function groupByFolder(bookmarks) {
  const groups = new Map()
  for (const bm of bookmarks) {
    const key = (bm.folderPath && bm.folderPath.length > 0)
      ? bm.folderPath.join('/')
      : ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(bm)
  }
  return groups
}

/**
 * 递归构建文件夹树结构
 * @param {Bookmark[]} bookmarks
 * @returns {Object} 树形结构 { _items: Bookmark[], [folderName]: subTree }
 */
function buildFolderTree(bookmarks) {
  const root = { _items: [] }
  for (const bm of bookmarks) {
    const parts = (bm.folderPath && bm.folderPath.length > 0)
      ? bm.folderPath
      : []
    let node = root
    for (const part of parts) {
      if (!node[part]) node[part] = { _items: [] }
      node = node[part]
    }
    node._items.push(bm)
  }
  return root
}

// ==================== exportToNetscape ====================

/**
 * 导出为 Netscape Bookmark File Format
 *
 * 该格式是浏览器标准书签导入/导出格式，被 Chrome/Firefox/Safari 支持。
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @returns {string} Netscape Bookmark HTML 字符串
 */
function exportToNetscape(bookmarks) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p></DL><p>'
  }

  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ]

  const tree = buildFolderTree(bookmarks)
  _renderNetscapeNode(tree, lines, 1)

  lines.push('</DL><p>')
  return lines.join('\n')
}

/**
 * 递归渲染 Netscape 文件夹节点
 */
function _renderNetscapeNode(node, lines, indent) {
  const pad = '    '.repeat(indent)

  // 先渲染无文件夹的书签
  for (const bm of node._items) {
    const ts = toUnixTimestamp(bm.dateAdded)
    const tsAttr = ts ? ` ADD_DATE="${ts}"` : ''
    const tags = (bm.tags && bm.tags.length > 0)
      ? ` TAGS="${escapeHTML(bm.tags.join(','))}"`
      : ''
    const desc = bm.description
      ? `\n${pad}    <DD>${escapeHTML(bm.description)}`
      : ''
    lines.push(`${pad}<DT><A HREF="${escapeHTML(bm.url)}"${tsAttr}${tags}>${escapeHTML(bm.title)}</A>${desc}`)
  }

  // 再渲染子文件夹
  const subFolders = Object.keys(node).filter(k => k !== '_items').sort()
  for (const folderName of subFolders) {
    lines.push(`${pad}<DT><H3>${escapeHTML(folderName)}</H3>`)
    lines.push(`${pad}<DL><p>`)
    _renderNetscapeNode(node[folderName], lines, indent + 1)
    lines.push(`${pad}</DL><p>`)
  }
}

// ==================== exportToMarkdown ====================

/**
 * 导出为结构化 Markdown
 *
 * 文件夹作为标题层级 (H1/H2/…)，书签作为链接列表。
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @returns {string} Markdown 字符串
 */
function exportToMarkdown(bookmarks) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return '# Bookmarks\n\n_No bookmarks to export._'
  }

  const lines = ['# Bookmarks', '']

  const tree = buildFolderTree(bookmarks)
  _renderMarkdownNode(tree, lines, 2)

  return lines.join('\n')
}

/**
 * 递归渲染 Markdown 文件夹节点
 */
function _renderMarkdownNode(node, lines, headingLevel) {
  const level = Math.min(headingLevel, 6)

  // 先渲染无文件夹书签
  for (const bm of node._items) {
    const tags = (bm.tags && bm.tags.length > 0)
      ? ` \`${bm.tags.join('` `')}\``
      : ''
    const desc = bm.description
      ? `\n  > ${bm.description}`
      : ''
    lines.push(`- [${bm.title}](${bm.url})${tags}${desc}`)
  }

  if (node._items.length > 0) {
    lines.push('')
  }

  // 子文件夹
  const subFolders = Object.keys(node).filter(k => k !== '_items').sort()
  for (const folderName of subFolders) {
    const hashes = '#'.repeat(level)
    lines.push(`${hashes} ${folderName}`)
    lines.push('')
    _renderMarkdownNode(node[folderName], lines, headingLevel + 1)
  }
}

// ==================== exportToOPML ====================

/**
 * 导出为 OPML 格式 (Outline Processor Markup Language)
 *
 * 适用于 RSS 阅读器导入，文件夹作为 outline 节点。
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @returns {string} OPML XML 字符串
 */
function exportToOPML(bookmarks) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Bookmarks</title>\n  </head>\n  <body>\n  </body>\n</opml>'
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>Bookmarks</title>',
    '  </head>',
    '  <body>',
  ]

  const tree = buildFolderTree(bookmarks)
  _renderOPMLNode(tree, lines, 2)

  lines.push('  </body>')
  lines.push('</opml>')
  return lines.join('\n')
}

/**
 * 递归渲染 OPML outline 节点
 */
function _renderOPMLNode(node, lines, indent) {
  const pad = '  '.repeat(indent)

  for (const bm of node._items) {
    const attrs = [
      `text="${escapeXML(bm.title)}"`,
      `type="rss"`,
      `xmlUrl="${escapeXML(bm.url)}"`,
      `htmlUrl="${escapeXML(bm.url)}"`,
    ]
    if (bm.description) {
      attrs.push(`description="${escapeXML(bm.description)}"`)
    }
    lines.push(`${pad}<outline ${attrs.join(' ')} />`)
  }

  const subFolders = Object.keys(node).filter(k => k !== '_items').sort()
  for (const folderName of subFolders) {
    lines.push(`${pad}<outline text="${escapeXML(folderName)}">`)
    _renderOPMLNode(node[folderName], lines, indent + 1)
    lines.push(`${pad}</outline>`)
  }
}

// ==================== exportToJSONLD ====================

/**
 * 导出为 JSON-LD 格式 (schema.org Bookmark 元数据)
 *
 * 使用 schema:WebPage 和 schema:BookmarkAction 语义标注。
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @returns {string} JSON-LD 字符串 (JSON.stringify 格式化)
 */
function exportToJSONLD(bookmarks) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': 'Bookmarks',
      'numberOfItems': 0,
      'itemListElement': [],
    }, null, 2)
  }

  const itemListElement = bookmarks.map((bm, index) => {
    const entry = {
      '@type': 'ListItem',
      'position': index + 1,
      'item': {
        '@type': 'WebPage',
        'name': bm.title || '',
        'url': bm.url || '',
        'identifier': bm.id || '',
      },
    }

    if (bm.description) {
      entry.item.description = bm.description
    }

    if (bm.tags && bm.tags.length > 0) {
      entry.item.keywords = bm.tags.join(', ')
    }

    if (bm.folderPath && bm.folderPath.length > 0) {
      entry.item.genre = bm.folderPath.join(' > ')
    }

    if (bm.dateAdded) {
      entry.item.dateCreated = bm.dateAdded
    }

    if (bm.lastModified) {
      entry.item.dateModified = bm.lastModified
    }

    return entry
  })

  const result = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': 'Bookmarks',
    'numberOfItems': bookmarks.length,
    'itemListElement': itemListElement,
  }

  return JSON.stringify(result, null, 2)
}

// ==================== exportToCSV ====================

/**
 * 导出为 CSV 格式
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @param {Object} [options={}]
 * @param {string[]} [options.columns] — 自定义列名 (从 Bookmark 字段中选择)
 * @param {string}   [options.delimiter=','] — 分隔符
 * @param {boolean}  [options.includeHeader=true] — 是否包含表头
 * @returns {string} CSV 字符串
 */
function exportToCSV(bookmarks, options = {}) {
  const columns = (Array.isArray(options.columns) && options.columns.length > 0)
    ? options.columns
    : DEFAULT_CSV_COLUMNS

  const delimiter = options.delimiter || ','
  const includeHeader = options.includeHeader !== false

  if (!Array.isArray(bookmarks)) {
    return includeHeader ? columns.join(delimiter) : ''
  }

  const lines = []

  if (includeHeader) {
    lines.push(columns.map(c => escapeCSV(c)).join(delimiter))
  }

  for (const bm of bookmarks) {
    const row = columns.map(col => {
      let value = bm[col]
      // 数组字段转为分号分隔字符串
      if (Array.isArray(value)) {
        value = value.join(';')
      }
      return escapeCSV(value)
    })
    lines.push(row.join(delimiter))
  }

  return lines.join('\n')
}

// ==================== importFromNetscape ====================

/**
 * 从 Netscape Bookmark HTML 解析书签
 *
 * @param {string} htmlString — Netscape Bookmark HTML 字符串
 * @returns {Bookmark[]} 解析后的书签数组
 */
function importFromNetscape(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') return []

  const bookmarks = []
  const folderStack = []  // 当前文件夹路径栈

  // 解析文件夹 (H3) 和书签 (A) 行
  const lines = htmlString.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 检测文件夹开始: <DT><H3 ...>FolderName</H3>
    const folderMatch = line.match(/<DT>\s*<H3[^>]*>([^<]*)<\/H3>/i)
    if (folderMatch) {
      folderStack.push(folderMatch[1].trim())
      continue
    }

    // 检测 DL 开始 — 文件夹内容开始 (已在 folderStack 中记录)

    // 检测 DL 结束: </DL>
    if (/<\/DL>/i.test(line)) {
      folderStack.pop()
      continue
    }

    // 检测书签: <DT><A HREF="url" ...>title</A>
    const linkMatch = line.match(/<DT>\s*<A\s+HREF="([^"]*)"[^>]*>([^<]*)<\/A>/i)
    if (linkMatch) {
      const url = linkMatch[1]
      const title = unescapeHTML(linkMatch[2].trim())

      // 提取 ADD_DATE
      const addDateMatch = line.match(/ADD_DATE="(\d+)"/i)
      const addDate = addDateMatch ? addDateMatch[1] : ''

      // 提取 TAGS
      const tagsMatch = line.match(/TAGS="([^"]*)"/i)
      const tags = tagsMatch
        ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean)
        : []

      // 检查下一行是否是 <DD> 描述
      let description = ''
      if (i + 1 < lines.length) {
        const ddMatch = lines[i + 1].match(/<DD>(.*)/i)
        if (ddMatch) {
          description = unescapeHTML(ddMatch[1].trim())
          i++ // 跳过描述行
        }
      }

      bookmarks.push({
        id: `imported-${bookmarks.length + 1}`,
        title,
        url,
        folderPath: [...folderStack],
        tags,
        description,
        dateAdded: addDate || '',
        lastModified: '',
      })
    }
  }

  return bookmarks
}

/**
 * HTML 实体反转义
 */
function unescapeHTML(str) {
  if (!str) return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

// ==================== importFromMarkdown ====================

/**
 * 从 Markdown 解析书签
 *
 * 支持两种格式:
 *   - 列表链接: - [title](url) `tag1` `tag2`
 *   - 引用描述: > description (紧跟书签下一行)
 *   - 标题文件夹: # / ## / ### ... 作为文件夹路径
 *
 * @param {string} mdString — Markdown 字符串
 * @returns {Bookmark[]} 解析后的书签数组
 */
function importFromMarkdown(mdString) {
  if (!mdString || typeof mdString !== 'string') return []

  const bookmarks = []
  const folderStack = []
  const lines = mdString.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 标题检测: # Folder / ## SubFolder
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const name = headingMatch[2].trim()
      // 忽略根标题 "Bookmarks"
      if (level === 1 && /^bookmarks?$/i.test(name)) continue
      // 调整文件夹栈到对应层级 (level 1 → index 0)
      folderStack.length = level - 1
      folderStack[level - 1] = name
      continue
    }

    // 链接检测: - [title](url) or * [title](url)
    const linkMatch = line.match(/^[\s]*[-*]\s+\[([^\]]*)\]\(([^)]+)\)/)
    if (linkMatch) {
      const title = linkMatch[1].trim()
      const url = linkMatch[2].trim()

      // 提取行内标签: `tag`
      const tagMatches = [...line.matchAll(/`([^`]+)`/g)]
      const tags = tagMatches.map(m => m[1]).filter(t => t !== title)

      // 检查下一行是否为描述 (> ...)
      let description = ''
      if (i + 1 < lines.length) {
        const descMatch = lines[i + 1].match(/^\s*>\s*(.*)/)
        if (descMatch) {
          description = descMatch[1].trim()
          i++
        }
      }

      bookmarks.push({
        id: `imported-${bookmarks.length + 1}`,
        title,
        url,
        folderPath: folderStack.filter(Boolean),
        tags,
        description,
        dateAdded: '',
        lastModified: '',
      })
    }
  }

  return bookmarks
}

// ==================== BookmarkExporter 命名空间类 ====================

/**
 * BookmarkExporter — 统一导出入口
 */
class BookmarkExporter {
  static exportToNetscape(bookmarks) { return exportToNetscape(bookmarks) }
  static exportToMarkdown(bookmarks) { return exportToMarkdown(bookmarks) }
  static exportToOPML(bookmarks) { return exportToOPML(bookmarks) }
  static exportToJSONLD(bookmarks) { return exportToJSONLD(bookmarks) }
  static exportToCSV(bookmarks, options) { return exportToCSV(bookmarks, options) }
  static importFromNetscape(htmlString) { return importFromNetscape(htmlString) }
  static importFromMarkdown(mdString) { return importFromMarkdown(mdString) }
}

export {
  BookmarkExporter,
  exportToNetscape,
  exportToMarkdown,
  exportToOPML,
  exportToJSONLD,
  exportToCSV,
  importFromNetscape,
  importFromMarkdown,
}
export default BookmarkExporter
