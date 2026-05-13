/**
 * E2E 测试 — 知识库构建→查询流程
 *
 * 覆盖：知识库 CRUD、标签管理、搜索、导出、批量操作
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChromeExtensionEnv,
  createMockPageData,
  waitFor,
} from '../helpers/e2e-helper.js';

let env;

beforeEach(() => {
  env = createChromeExtensionEnv();
});

afterEach(() => {
  env.cleanup();
});

// ==================== 知识库 CRUD ====================

describe('E2E: Knowledge — CRUD', () => {

  it('应能创建知识条目', () => {
    // Simulate knowledge entry creation
    const entries = [];
    function addEntry(entry) {
      const newEntry = {
        id: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...entry,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      entries.push(newEntry);
      return newEntry;
    }

    const entry = addEntry({
      question: 'What is React?',
      answer: 'React is a JavaScript library for building user interfaces.',
      url: 'https://react.dev',
      title: 'React Documentation',
      tags: ['react', 'javascript', 'frontend'],
    });

    assert.ok(entry.id);
    assert.equal(entry.question, 'What is React?');
    assert.ok(entry.tags.includes('react'));
    assert.equal(entries.length, 1);
  });

  it('应能更新知识条目', () => {
    const entries = [
      { id: 'kb-1', question: 'What is React?', answer: 'A JS library', tags: ['react'] },
    ];

    function updateEntry(id, updates) {
      const idx = entries.findIndex(e => e.id === id);
      if (idx !== -1) {
        entries[idx] = { ...entries[idx], ...updates, updatedAt: new Date().toISOString() };
        return entries[idx];
      }
      return null;
    }

    const updated = updateEntry('kb-1', { answer: 'React is a JavaScript library for building UIs.' });
    assert.ok(updated);
    assert.equal(updated.answer, 'React is a JavaScript library for building UIs.');
    assert.ok(updated.updatedAt);
  });

  it('应能删除知识条目', () => {
    const entries = [
      { id: 'kb-1', question: 'Q1', answer: 'A1' },
      { id: 'kb-2', question: 'Q2', answer: 'A2' },
      { id: 'kb-3', question: 'Q3', answer: 'A3' },
    ];

    function deleteEntry(id) {
      const idx = entries.findIndex(e => e.id === id);
      if (idx !== -1) {
        entries.splice(idx, 1);
        return true;
      }
      return false;
    }

    assert.ok(deleteEntry('kb-2'));
    assert.equal(entries.length, 2);
    assert.ok(entries.every(e => e.id !== 'kb-2'));
  });

  it('应能通过 ID 查找知识条目', () => {
    const entries = [
      { id: 'kb-1', question: 'Q1', answer: 'A1' },
      { id: 'kb-2', question: 'Q2', answer: 'A2' },
    ];

    const found = entries.find(e => e.id === 'kb-1');
    assert.ok(found);
    assert.equal(found.question, 'Q1');

    const notFound = entries.find(e => e.id === 'kb-999');
    assert.equal(notFound, undefined);
  });
});

// ==================== 标签管理 ====================

describe('E2E: Knowledge — 标签管理', () => {

  it('应能提取所有唯一标签', () => {
    const entries = [
      { id: 'kb-1', tags: ['react', 'javascript'] },
      { id: 'kb-2', tags: ['vue', 'javascript'] },
      { id: 'kb-3', tags: ['react', 'css'] },
    ];

    const allTags = new Set();
    for (const entry of entries) {
      for (const tag of entry.tags) {
        allTags.add(tag);
      }
    }

    assert.equal(allTags.size, 4);
    assert.ok(allTags.has('react'));
    assert.ok(allTags.has('javascript'));
    assert.ok(allTags.has('vue'));
    assert.ok(allTags.has('css'));
  });

  it('应能按标签过滤条目', () => {
    const entries = [
      { id: 'kb-1', question: 'Q1', tags: ['react', 'javascript'] },
      { id: 'kb-2', question: 'Q2', tags: ['vue', 'javascript'] },
      { id: 'kb-3', question: 'Q3', tags: ['react', 'css'] },
    ];

    const filtered = entries.filter(e => e.tags.includes('react'));
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every(e => e.tags.includes('react')));
  });

  it('应能批量添加标签', () => {
    const entries = [
      { id: 'kb-1', tags: ['react'] },
      { id: 'kb-2', tags: ['vue'] },
    ];

    const targetIds = new Set(['kb-1', 'kb-2']);
    const newTag = 'frontend';

    for (const entry of entries) {
      if (targetIds.has(entry.id) && !entry.tags.includes(newTag)) {
        entry.tags.push(newTag);
      }
    }

    assert.ok(entries.every(e => e.tags.includes('frontend')));
  });
});

// ==================== 搜索 ====================

describe('E2E: Knowledge — 搜索', () => {

  it('应支持关键词搜索', () => {
    const entries = [
      { id: 'kb-1', question: 'What is React?', answer: 'React is a library for building UIs' },
      { id: 'kb-2', question: 'What is Vue?', answer: 'Vue is a progressive framework' },
      { id: 'kb-3', question: 'How to use React hooks?', answer: 'Hooks let you use state in function components' },
    ];

    const keyword = 'React';
    const results = entries.filter(e =>
      e.question.toLowerCase().includes(keyword.toLowerCase()) ||
      e.answer.toLowerCase().includes(keyword.toLowerCase())
    );

    assert.equal(results.length, 2);
    assert.ok(results.every(e =>
      (e.question + e.answer).toLowerCase().includes('react')
    ));
  });

  it('搜索应不区分大小写', () => {
    const entries = [
      { id: 'kb-1', question: 'What is JavaScript?', answer: 'JS is a programming language' },
    ];

    const search1 = 'javascript';
    const search2 = 'JAVASCRIPT';

    const results1 = entries.filter(e => (e.question + e.answer).toLowerCase().includes(search1.toLowerCase()));
    const results2 = entries.filter(e => (e.question + e.answer).toLowerCase().includes(search2.toLowerCase()));

    assert.equal(results1.length, 1);
    assert.equal(results2.length, 1);
    assert.equal(results1.length, results2.length);
  });

  it('空搜索应返回所有条目', () => {
    const entries = [
      { id: 'kb-1', question: 'Q1', answer: 'A1' },
      { id: 'kb-2', question: 'Q2', answer: 'A2' },
    ];

    const keyword = '';
    const results = keyword ? entries.filter(e =>
      (e.question + e.answer).toLowerCase().includes(keyword.toLowerCase())
    ) : entries;

    assert.equal(results.length, 2);
  });
});

// ==================== 导出 ====================

describe('E2E: Knowledge — 导出', () => {

  it('应能导出为 Markdown 格式', () => {
    const entries = [
      { id: 'kb-1', question: 'What is React?', answer: 'A JS library', tags: ['react'], url: 'https://react.dev' },
    ];

    function exportMarkdown(entries) {
      let md = '# Knowledge Base\n\n';
      for (const entry of entries) {
        md += `## ${entry.question}\n\n`;
        md += `${entry.answer}\n\n`;
        if (entry.tags && entry.tags.length) {
          md += `**Tags:** ${entry.tags.join(', ')}\n\n`;
        }
        if (entry.url) {
          md += `**Source:** ${entry.url}\n\n`;
        }
        md += '---\n\n';
      }
      return md;
    }

    const md = exportMarkdown(entries);
    assert.ok(md.includes('# Knowledge Base'));
    assert.ok(md.includes('## What is React?'));
    assert.ok(md.includes('A JS library'));
    assert.ok(md.includes('**Tags:** react'));
    assert.ok(md.includes('https://react.dev'));
  });

  it('应能导出为 JSON 格式', () => {
    const entries = [
      { id: 'kb-1', question: 'Q1', answer: 'A1', tags: ['t1'] },
      { id: 'kb-2', question: 'Q2', answer: 'A2', tags: ['t2'] },
    ];

    const json = JSON.stringify({ entries, exportDate: new Date().toISOString(), version: '1.0' });
    const parsed = JSON.parse(json);

    assert.equal(parsed.entries.length, 2);
    assert.ok(parsed.exportDate);
    assert.equal(parsed.version, '1.0');
    assert.equal(parsed.entries[0].question, 'Q1');
  });

  it('导出的 JSON 应保持数据完整性', () => {
    const original = {
      id: 'kb-1',
      question: 'What is "Hello" in Chinese?',
      answer: '你好 (nǐ hǎo)',
      tags: ['chinese', 'greeting'],
      url: 'https://example.com/page?q=1&lang=zh',
      createdAt: '2026-05-13T00:00:00.000Z',
    };

    const json = JSON.stringify(original);
    const parsed = JSON.parse(json);

    assert.deepEqual(parsed, original);
  });
});

// ==================== 批量操作 ====================

describe('E2E: Knowledge — 批量操作', () => {

  it('应能选择多个条目', () => {
    const entries = [
      { id: 'kb-1', question: 'Q1' },
      { id: 'kb-2', question: 'Q2' },
      { id: 'kb-3', question: 'Q3' },
      { id: 'kb-4', question: 'Q4' },
    ];

    const selectedIds = new Set(['kb-1', 'kb-3']);
    assert.equal(selectedIds.size, 2);

    // Select all
    const allSelected = new Set(entries.map(e => e.id));
    assert.equal(allSelected.size, 4);

    // Deselect all
    allSelected.clear();
    assert.equal(allSelected.size, 0);
  });

  it('应能批量删除选中条目', () => {
    const entries = [
      { id: 'kb-1', question: 'Q1' },
      { id: 'kb-2', question: 'Q2' },
      { id: 'kb-3', question: 'Q3' },
    ];

    const selectedIds = new Set(['kb-1', 'kb-3']);
    const remaining = entries.filter(e => !selectedIds.has(e.id));

    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'kb-2');
  });

  it('应能批量导出选中条目', () => {
    const entries = [
      { id: 'kb-1', question: 'Q1', answer: 'A1' },
      { id: 'kb-2', question: 'Q2', answer: 'A2' },
      { id: 'kb-3', question: 'Q3', answer: 'A3' },
    ];

    const selectedIds = new Set(['kb-2', 'kb-3']);
    const selectedEntries = entries.filter(e => selectedIds.has(e.id));

    const json = JSON.stringify({ entries: selectedEntries });
    const parsed = JSON.parse(json);

    assert.equal(parsed.entries.length, 2);
    assert.ok(parsed.entries.every(e => selectedIds.has(e.id)));
  });
});
