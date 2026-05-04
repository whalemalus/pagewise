/**
 * 测试 lib/bookmark-io.js — 数据导入导出
 *
 * 测试范围:
 *   exportJSON / exportCSV / importFromChromeHTML / importFromJSON / exportToFile
 *   JSON 往返一致性 / CSV 格式 / Chrome HTML 解析
 *   空数据处理 / 特殊字符转义 / 进度回调
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkImportExport } = await import('../lib/bookmark-io.js');

// ==================== 辅助: 构造书签 ====================

function bm(id, title, url, folderPath = [], tags = [], status = 'unread', dateAdded) {
  return { id: String(id), title, url, folderPath, tags, status, ...(dateAdded !== undefined ? { dateAdded } : {}) };
}

const SAMPLE_BOOKMARKS = [
  bm('1', 'GitHub', 'https://github.com', ['开发', '工具'], ['dev', 'git'], 'read', 1704067200000),
  bm('2', 'MDN Web Docs', 'https://developer.mozilla.org', ['开发', '参考'], ['docs'], 'unread', 1704153600000),
  bm('3', 'Hacker News', 'https://news.ycombinator.com', ['资讯'], ['news'], 'archived', 1704240000000),
];

const SAMPLE_CLUSTERS = [
  { id: 'c1', name: '开发资源', bookmarkIds: ['1', '2'] },
];

const SAMPLE_TAGS = [
  { id: 't1', name: 'dev', color: '#4CAF50' },
  { id: 't2', name: 'git', color: '#2196F3' },
];

const SAMPLE_STATUSES = [
  { bookmarkId: '1', status: 'read' },
  { bookmarkId: '3', status: 'archived' },
];

const CHROME_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>开发</H3>
    <DL><p>
        <DT><H3>工具</H3>
        <DL><p>
            <DT><A HREF="https://github.com" ADD_DATE="1704067200">GitHub</A>
        </DL><p>
        <DT><H3>参考</H3>
        <DL><p>
            <DT><A HREF="https://developer.mozilla.org" ADD_DATE="1704153600">MDN Web Docs</A>
        </DL><p>
    </DL><p>
    <DT><H3>资讯</H3>
    <DL><p>
        <DT><A HREF="https://news.ycombinator.com" ADD_DATE="1704240000">Hacker News</A>
    </DL><p>
</DL><p>`;

// ==================== JSON 导出 ====================

describe('BookmarkImportExport.exportJSON', () => {
  it('应输出合法 JSON 字符串', () => {
    const io = new BookmarkImportExport({ bookmarks: SAMPLE_BOOKMARKS });
    const json = io.exportJSON();
    assert.doesNotThrow(() => JSON.parse(json));
  });

  it('应包含完整图谱数据', () => {
    const io = new BookmarkImportExport({
      bookmarks: SAMPLE_BOOKMARKS,
      clusters: SAMPLE_CLUSTERS,
      tags: SAMPLE_TAGS,
      statuses: SAMPLE_STATUSES,
    });
    const data = JSON.parse(io.exportJSON());

    assert.equal(data.bookmarks.length, 3);
    assert.equal(data.clusters.length, 1);
    assert.equal(data.tags.length, 2);
    assert.equal(data.statuses.length, 2);
    assert.ok(data.version);
    assert.ok(data.exportedAt);
  });
});

// ==================== JSON 往返 ====================

describe('BookmarkImportExport JSON 往返', () => {
  it('exportJSON → importFromJSON 应保持数据一致', () => {
    const io = new BookmarkImportExport({
      bookmarks: SAMPLE_BOOKMARKS,
      clusters: SAMPLE_CLUSTERS,
      tags: SAMPLE_TAGS,
      statuses: SAMPLE_STATUSES,
    });

    const json = io.exportJSON();
    const io2 = new BookmarkImportExport();
    const imported = io2.importFromJSON(json);

    assert.deepEqual(imported.bookmarks, SAMPLE_BOOKMARKS);
    assert.deepEqual(imported.clusters, SAMPLE_CLUSTERS);
    assert.deepEqual(imported.tags, SAMPLE_TAGS);
    assert.deepEqual(imported.statuses, SAMPLE_STATUSES);
  });
});

// ==================== JSON 导入 ====================

describe('BookmarkImportExport.importFromJSON', () => {
  it('空字符串应返回空数据', () => {
    const io = new BookmarkImportExport();
    const result = io.importFromJSON('');
    assert.deepEqual(result, { bookmarks: [], clusters: [], tags: [], statuses: [] });
  });

  it('无效 JSON 应返回空数据', () => {
    const io = new BookmarkImportExport();
    const result = io.importFromJSON('{invalid json}');
    assert.deepEqual(result, { bookmarks: [], clusters: [], tags: [], statuses: [] });
  });

  it('缺少字段的 JSON 应返回默认空数组', () => {
    const io = new BookmarkImportExport();
    const result = io.importFromJSON('{"version": 1}');
    assert.deepEqual(result, { bookmarks: [], clusters: [], tags: [], statuses: [] });
  });
});

// ==================== CSV 导出 ====================

describe('BookmarkImportExport.exportCSV', () => {
  it('应包含 CSV 表头', () => {
    const io = new BookmarkImportExport({ bookmarks: SAMPLE_BOOKMARKS });
    const csv = io.exportCSV();
    const lines = csv.split('\n');
    assert.equal(lines[0], 'title,url,folderPath,dateAdded,tags,status');
  });

  it('应为每个书签生成一行', () => {
    const io = new BookmarkImportExport({ bookmarks: SAMPLE_BOOKMARKS });
    const csv = io.exportCSV();
    const lines = csv.split('\n');
    // 表头 + 3 行数据
    assert.equal(lines.length, 4);
  });

  it('应正确包含书签数据内容', () => {
    const io = new BookmarkImportExport({ bookmarks: SAMPLE_BOOKMARKS });
    const csv = io.exportCSV();
    assert.ok(csv.includes('GitHub'));
    assert.ok(csv.includes('https://github.com'));
    assert.ok(csv.includes('开发/工具'));
    assert.ok(csv.includes('"dev,git"'));
    assert.ok(csv.includes('"read"'));
  });

  it('特殊字符应正确转义', () => {
    const special = [bm('x', '含"引号"和,逗号', 'https://test.com', ['有空格 文件夹'], ['ta,g'], 'read')];
    const io = new BookmarkImportExport({ bookmarks: special });
    const csv = io.exportCSV();
    // 包含双引号转义
    assert.ok(csv.includes('含""引号""和,逗号'));
    // 文件夹路径中的逗号不出现（因为是 / 分隔的，但如果逗号在名字里也应该转义）
  });
});

// ==================== Chrome HTML 解析 ====================

describe('BookmarkImportExport.importFromChromeHTML', () => {
  it('应解析 Chrome HTML 书签', () => {
    const io = new BookmarkImportExport();
    const bookmarks = io.importFromChromeHTML(CHROME_HTML);

    assert.equal(bookmarks.length, 3);
    assert.equal(bookmarks[0].title, 'GitHub');
    assert.equal(bookmarks[0].url, 'https://github.com');
  });

  it('应正确解析文件夹层级', () => {
    const io = new BookmarkImportExport();
    const bookmarks = io.importFromChromeHTML(CHROME_HTML);

    assert.deepEqual(bookmarks[0].folderPath, ['开发', '工具']);
    assert.deepEqual(bookmarks[1].folderPath, ['开发', '参考']);
    assert.deepEqual(bookmarks[2].folderPath, ['资讯']);
  });

  it('应正确解析 ADD_DATE 时间戳', () => {
    const io = new BookmarkImportExport();
    const bookmarks = io.importFromChromeHTML(CHROME_HTML);

    // ADD_DATE 是 Unix 秒，转为毫秒
    assert.equal(bookmarks[0].dateAdded, 1704067200 * 1000);
  });

  it('空 HTML 应返回空数组', () => {
    const io = new BookmarkImportExport();
    assert.deepEqual(io.importFromChromeHTML(''), []);
    assert.deepEqual(io.importFromChromeHTML(null), []);
  });

  it('无书签的 HTML 应返回空数组', () => {
    const io = new BookmarkImportExport();
    const html = '<DL><p><DT><H3>空文件夹</H3><DL><p></DL><p></DL><p>';
    assert.deepEqual(io.importFromChromeHTML(html), []);
  });
});

// ==================== exportToFile ====================

describe('BookmarkImportExport.exportToFile', () => {
  it('JSON 格式应返回 Blob', () => {
    const io = new BookmarkImportExport({ bookmarks: SAMPLE_BOOKMARKS });
    const blob = io.exportToFile('json');
    assert.ok(blob instanceof Blob);
    assert.ok(blob.type.includes('json'));
  });

  it('CSV 格式应返回 Blob', () => {
    const io = new BookmarkImportExport({ bookmarks: SAMPLE_BOOKMARKS });
    const blob = io.exportToFile('csv');
    assert.ok(blob instanceof Blob);
    assert.ok(blob.type.includes('csv'));
  });
});

// ==================== 进度回调 ====================

describe('BookmarkImportExport 进度回调', () => {
  it('exportJSON 应调用进度回调', () => {
    const calls = [];
    const io = new BookmarkImportExport({
      bookmarks: SAMPLE_BOOKMARKS,
      onProgress: (phase, current, total) => calls.push({ phase, current, total }),
    });
    io.exportJSON();
    assert.ok(calls.length >= 2);
    assert.equal(calls[0].phase, 'export-json-start');
    assert.equal(calls[calls.length - 1].phase, 'export-json-done');
  });

  it('exportCSV 应调用进度回调', () => {
    const calls = [];
    const io = new BookmarkImportExport({
      bookmarks: SAMPLE_BOOKMARKS,
      onProgress: (phase, current, total) => calls.push({ phase, current, total }),
    });
    io.exportCSV();
    assert.ok(calls.length >= 2);
    assert.equal(calls[0].phase, 'export-csv-start');
    assert.equal(calls[calls.length - 1].phase, 'export-csv-done');
  });

  it('importFromChromeHTML 应调用进度回调', () => {
    const calls = [];
    const io = new BookmarkImportExport({
      onProgress: (phase, current, total) => calls.push({ phase, current, total }),
    });
    io.importFromChromeHTML(CHROME_HTML);
    assert.ok(calls.length >= 2);
    assert.equal(calls[0].phase, 'import-html-start');
    assert.equal(calls[calls.length - 1].phase, 'import-html-done');
  });
});

// ==================== 空数据导出 ====================

describe('BookmarkImportExport 空数据', () => {
  it('无参数构造应可正常导出空 JSON', () => {
    const io = new BookmarkImportExport();
    const json = io.exportJSON();
    const data = JSON.parse(json);
    assert.deepEqual(data.bookmarks, []);
    assert.deepEqual(data.clusters, []);
    assert.deepEqual(data.tags, []);
    assert.deepEqual(data.statuses, []);
  });

  it('无参数构造应可正常导出空 CSV (仅含表头)', () => {
    const io = new BookmarkImportExport();
    const csv = io.exportCSV();
    const lines = csv.split('\n');
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'title,url,folderPath,dateAdded,tags,status');
  });
});

// ==================== 特殊字符 ====================

describe('BookmarkImportExport 特殊字符处理', () => {
  it('书签标题含换行符应正确 CSV 转义', () => {
    const special = [bm('x', '第一行\n第二行', 'https://t.com', [], [])];
    const io = new BookmarkImportExport({ bookmarks: special });
    const csv = io.exportCSV();
    assert.ok(csv.includes('"第一行\n第二行"'));
  });

  it('书签标题含双引号应正确 CSV 转义', () => {
    const special = [bm('x', '他说"你好"', 'https://t.com', [], [])];
    const io = new BookmarkImportExport({ bookmarks: special });
    const csv = io.exportCSV();
    assert.ok(csv.includes('他说""你好""'));
  });
});
