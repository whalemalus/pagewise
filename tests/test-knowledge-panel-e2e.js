/**
 * E2E 测试 lib/knowledge-panel.js — KnowledgePanel
 *
 * 测试范围：
 *   loadKnowledgeList / searchKnowledge / showKnowledgeDetail /
 *   deleteEntry / batchDelete / batchTag / export / virtual scroll
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ============================================================
// DOM Mock — Minimal HTMLElement + document for KnowledgePanel
// ============================================================

class MockElement {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.style = {};
    this.dataset = {};
    this.value = '';
    this._children = [];
    this.parentNode = null;
    this._eventListeners = {};
    this.classList = {
      _classes: new Set(),
      add: (...c) => c.forEach(cls => this.classList._classes.add(cls)),
      remove: (...c) => c.forEach(cls => this.classList._classes.delete(cls)),
      contains: (c) => this.classList._classes.has(c),
      toggle: (c) => { if (this.classList._classes.has(c)) this.classList._classes.delete(c); else this.classList._classes.add(c); }
    };
  }
  appendChild(child) { this._children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this._children = this._children.filter(c => c !== child); return child; }
  querySelector(sel) {
    for (const c of this._children) {
      if (c.className && sel.startsWith('.') && c.className.includes(sel.slice(1))) return c;
      const found = c.querySelector?.(sel);
      if (found) return found;
    }
    return null;
  }
  querySelectorAll(sel) {
    const results = [];
    for (const c of this._children) {
      if (c.className && sel.startsWith('.') && c.className.includes(sel.slice(1))) results.push(c);
      if (c.querySelectorAll) results.push(...c.querySelectorAll(sel));
    }
    return results;
  }
  addEventListener(event, fn) { (this._eventListeners[event] ??= []).push(fn); }
  removeEventListener(event, fn) { this._eventListeners[event] = (this._eventListeners[event] || []).filter(f => f !== fn); }
  get parentElement() {
    if (!this.parentNode) {
      // Return a mock parent with clientHeight for virtual scroll
      return { clientHeight: 600, scrollTop: 0, addEventListener: () => {}, removeEventListener: () => {} };
    }
    return this.parentNode;
  }
  getBoundingClientRect() { return { top: 0, left: 0, width: 800, height: 600, bottom: 600 }; }
  setAttribute(k, v) { this.dataset[k] = v; }
  getAttribute(k) { return this.dataset[k]; }
  click() { (this._eventListeners['click'] || []).forEach(fn => fn()); }
  remove() { this.parentNode?.removeChild(this); }
  closest(sel) { return null; }
}

class MockIntersectionObserver {
  constructor(cb) { this._cb = cb; this._targets = []; MockIntersectionObserver.instances.push(this); }
  observe(t) { this._targets.push(t); }
  unobserve(t) { this._targets = this._targets.filter(x => x !== t); }
  disconnect() { this._targets = []; }
  _simulate(entries) { this._cb(entries); }
  static instances = [];
}

// Provide a minimal `document` global so KnowledgePanel can call
// document.createElement() / document.createDocumentFragment() in Node.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) { return new MockElement(tag); },
    createDocumentFragment() {
      const frag = new MockElement('fragment');
      frag._isFragment = true;
      return frag;
    },
    body: {
      appendChild(c) { /* no-op */ },
      removeChild(c) { /* no-op */ },
    },
  };
}

// Provide IntersectionObserver globally for KnowledgePanel
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = MockIntersectionObserver;
}

function createMockMemory(entries = []) {
  const memory = {
    getAllEntries: async (limit) => entries.slice(0, limit || entries.length),
    getEntry: async (id) => entries.find(e => e.id === id) || null,
    deleteEntry: async (id) => {
      const idx = entries.findIndex(e => e.id === id);
      if (idx >= 0) { entries.splice(idx, 1); return true; }
      return false;
    },
    saveEntry: async (data) => ({ id: `new-${Date.now()}`, ...data }),
    getAllTags: async () => {
      const tagMap = new Map();
      entries.forEach(e => (e.tags || []).forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1)));
      return [...tagMap].map(([tag, count]) => ({ tag, count }));
    },
    recall: async () => [],
    searchByTag: async (tag) => entries.filter(e => e.tags?.includes(tag)),
    exportMarkdown: async () => entries.map(e => `# ${e.title}\n${e.content}`).join('\n\n'),
    exportJSON: async () => JSON.stringify(entries),
  };

  // memory.kb — provide the same methods KnowledgePanel calls via this.memory.kb.*
  memory.kb = {
    constructor: { RELEVANCE_MODE: 'relevance', getSearchSuggestions: () => [] },
    getAllEntries: memory.getAllEntries,
    getAllLanguages: async () => {
      const langs = new Map();
      entries.forEach(e => {
        const lang = e.language || 'other';
        langs.set(lang, (langs.get(lang) || 0) + 1);
      });
      return [...langs].map(([language, count]) => ({ language, count }));
    },
    search: async (query) => {
      const q = query.toLowerCase();
      return entries.filter(e =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.content || '').toLowerCase().includes(q) ||
        (e.summary || '').toLowerCase().includes(q) ||
        (e.question || '').toLowerCase().includes(q)
      );
    },
    combinedSearch: async (query, limit) => {
      const q = query.toLowerCase();
      const matched = entries.filter(e =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.content || '').toLowerCase().includes(q)
      );
      return matched.slice(0, limit).map(entry => ({ entry, score: 0.9, matchType: 'semantic' }));
    },
    batchDelete: async (ids) => {
      let deleted = 0;
      for (const id of ids) {
        const idx = entries.findIndex(e => e.id === id);
        if (idx >= 0) { entries.splice(idx, 1); deleted++; }
      }
      return deleted;
    },
    batchAddTag: async (ids, tag) => {
      let updated = 0;
      for (const id of ids) {
        const entry = entries.find(e => e.id === id);
        if (entry) {
          if (!entry.tags) entry.tags = [];
          if (!entry.tags.includes(tag)) entry.tags.push(tag);
          updated++;
        }
      }
      return updated;
    },
    findRelatedEntries: async () => [],
  };

  return memory;
}

function createPanel(memory, entries = []) {
  const el = () => new MockElement();
  const deps = {
    knowledgeList: el(), knowledgeDetail: el(), detailContent: el(),
    emptyKnowledge: el(), tagFilter: el(), searchInput: el(),
    batchToolbar: el(), batchFloatingBar: el(), batchCount: el(),
    batchFloatingCount: el(), batchSelectAll: el(), btnSelectMode: el(),
    btnBatchTag: el(), btnBatchDelete: el(), btnBatchExport: el(),
    btnBatchTagFloat: el(), btnBatchDeleteFloat: el(), btnBatchExportFloat: el(),
    btnBatchExit: el(), btnBack: el(), btnEdit: el(), btnDelete: el(),
    btnExportMd: el(), btnExportJson: el(), btnImport: el(), fileImport: el(),
    relatedEntries: el(), relatedList: el(),
    memory: memory || createMockMemory(entries),
    addSystemMessage: () => {},
    showToast: () => {},
    escapeHtml: (s) => (s == null ? '' : String(s)).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])),
    downloadFile: () => {},
    getSearchMode: () => 'keyword',
  };
  // eslint-disable-next-line no-use-before-define
  const { KnowledgePanel } = globalThis._KP || {};
  const panel = new KnowledgePanel(deps);
  return { panel, deps };
}

// ============================================================
// Import (dynamic, after DOM mock is in place)
// ============================================================

const { KnowledgePanel } = await import('../lib/knowledge-panel.js');
globalThis._KP = { KnowledgePanel };

// Mock global confirm/prompt
globalThis.confirm = () => true;
globalThis.prompt = (msg, defaultVal) => defaultVal || 'test-tag';

const ENTRIES = [
  { id: 'e1', title: 'JavaScript Closures', content: 'A closure is...', summary: 'Closures explained', tags: ['javascript', 'closure'], category: 'js', language: 'en', question: 'What is a closure?', answer: 'A closure is a function...', createdAt: new Date().toISOString() },
  { id: 'e2', title: 'Python Decorators', content: 'Decorators wrap functions...', summary: 'Decorators guide', tags: ['python', 'decorator'], category: 'python', language: 'en', question: 'How to use decorators?', answer: 'Use @decorator syntax...', createdAt: new Date().toISOString() },
  { id: 'e3', title: 'React Hooks', content: 'Hooks let you use state...', summary: 'React Hooks intro', tags: ['javascript', 'react', 'hooks'], category: 'frontend', language: 'en', question: 'What are hooks?', answer: 'Hooks are functions...', createdAt: new Date().toISOString() },
];

describe('KnowledgePanel E2E', () => {
  let panel, memory, deps;

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    const entries = ENTRIES.map(e => ({ ...e }));
    memory = createMockMemory(entries);
    ({ panel, deps } = createPanel(memory, entries));
  });

  afterEach(() => {
    MockIntersectionObserver.instances = [];
  });

  // ─── 1. constructor ───────────────────────────────────────────────────────

  it('1. constructor initializes state correctly', () => {
    assert.equal(panel.selectedEntryId, null);
    assert.equal(panel.activeTag, null);
    assert.equal(panel.selectMode, false);
    assert.ok(panel.selectedIds instanceof Set);
    assert.equal(panel.selectedIds.size, 0);
  });

  it('2. constructor stores all DOM element references', () => {
    assert.ok(panel.knowledgeList);
    assert.ok(panel.knowledgeDetail);
    assert.ok(panel.emptyKnowledge);
    assert.ok(panel.memory);
  });

  // ─── 3. loadKnowledgeList ─────────────────────────────────────────────────

  it('3. loadKnowledgeList populates _allFilteredEntries', async () => {
    await panel.loadKnowledgeList();
    assert.equal(panel._allFilteredEntries.length, 3);
  });

  it('4. loadKnowledgeList shows empty state when no entries', async () => {
    const emptyMemory = createMockMemory([]);
    panel.memory = emptyMemory;
    await panel.loadKnowledgeList();
    assert.equal(panel.emptyKnowledge.classList.contains('hidden'), false);
  });

  it('5. loadKnowledgeList hides empty state when entries exist', async () => {
    await panel.loadKnowledgeList();
    assert.equal(panel.emptyKnowledge.classList.contains('hidden'), true);
  });

  // ─── 6. showKnowledgeList ─────────────────────────────────────────────────

  it('6. showKnowledgeList toggles visibility', () => {
    panel.showKnowledgeList();
    assert.equal(panel.knowledgeDetail.classList.contains('hidden'), true);
    assert.equal(panel.knowledgeList.classList.contains('hidden'), false);
  });

  // ─── 7. searchKnowledge ───────────────────────────────────────────────────

  it('7. searchKnowledge filters by title', async () => {
    deps.searchInput.value = 'closure';
    await panel.loadKnowledgeList();
    await panel.searchKnowledge();
    // Should filter to entries matching "closure"
    const filtered = panel._allFilteredEntries;
    assert.ok(filtered.length >= 1);
    assert.ok(filtered.some(e => e.title.toLowerCase().includes('closure')));
  });

  it('8. searchKnowledge with empty query shows all', async () => {
    deps.searchInput.value = '';
    await panel.loadKnowledgeList();
    await panel.searchKnowledge();
    assert.equal(panel._allFilteredEntries.length, 3);
  });

  it('9. searchKnowledge with no match shows empty', async () => {
    deps.searchInput.value = 'zzzznonexistent';
    await panel.loadKnowledgeList();
    await panel.searchKnowledge();
    assert.equal(panel._allFilteredEntries.length, 0);
  });

  // ─── 10. showKnowledgeDetail ──────────────────────────────────────────────

  it('10. showKnowledgeDetail sets selectedEntryId', async () => {
    await panel.showKnowledgeDetail('e1');
    assert.equal(panel.selectedEntryId, 'e1');
  });

  it('11. showKnowledgeDetail toggles list/detail visibility', async () => {
    await panel.showKnowledgeDetail('e1');
    assert.equal(panel.knowledgeList.classList.contains('hidden'), true);
    assert.equal(panel.knowledgeDetail.classList.contains('hidden'), false);
  });

  it('12. showKnowledgeDetail with invalid id does not crash', async () => {
    await assert.doesNotReject(() => panel.showKnowledgeDetail('nonexistent'));
  });

  // ─── 13. deleteEntry ──────────────────────────────────────────────────────

  it('13. deleteEntry removes entry from memory', async () => {
    panel.selectedEntryId = 'e1';
    const before = (await memory.getAllEntries()).length;
    await panel.deleteEntry();
    const after = (await memory.getAllEntries()).length;
    assert.equal(after, before - 1);
  });

  it('14. deleteEntry with no selection does not crash', async () => {
    panel.selectedEntryId = null;
    await assert.doesNotReject(() => panel.deleteEntry());
  });

  // ─── 15. batchDelete ──────────────────────────────────────────────────────

  it('15. batchDelete removes selected entries', async () => {
    panel.selectMode = true;
    panel.selectedIds = new Set(['e1', 'e2']);
    await panel.batchDelete();
    const remaining = await memory.getAllEntries();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'e3');
  });

  it('16. batchDelete with empty selection does not crash', async () => {
    panel.selectMode = true;
    panel.selectedIds = new Set();
    await assert.doesNotReject(() => panel.batchDelete());
  });

  // ─── 17. batchTag ─────────────────────────────────────────────────────────

  it('17. batchTag is callable without errors', async () => {
    panel.selectMode = true;
    panel.selectedIds = new Set(['e1']);
    await assert.doesNotReject(() => panel.batchTag());
  });

  // ─── 18. exportMarkdown ───────────────────────────────────────────────────

  it('18. exportMarkdown calls memory.exportMarkdown', async () => {
    let called = false;
    memory.exportMarkdown = async () => { called = true; return '# Test'; };
    await panel.exportMarkdown();
    assert.equal(called, true);
  });

  // ─── 19. exportJson ───────────────────────────────────────────────────────

  it('19. exportJson calls memory.exportJSON', async () => {
    let called = false;
    memory.exportJSON = async () => { called = true; return '[]'; };
    await panel.exportJson();
    assert.equal(called, true);
  });

  // ─── 20. _initVirtualScroll ───────────────────────────────────────────────

  it('20. _initVirtualScroll creates sentinel and spacers', async () => {
    await panel.loadKnowledgeList();
    panel._initVirtualScroll();
    assert.ok(panel._sentinel);
    assert.ok(panel._spacerTop);
    assert.ok(panel._spacerBottom);
    assert.ok(MockIntersectionObserver.instances.length > 0);
  });

  it('21. _cleanupVirtualScroll disconnects observer', async () => {
    await panel.loadKnowledgeList();
    panel._initVirtualScroll();
    const obs = panel._sentinelObserver;
    panel._cleanupVirtualScroll();
    assert.equal(obs._targets.length, 0);
  });

  // ─── 22. tag filtering ────────────────────────────────────────────────────

  it('22. loadKnowledgeList filters by activeTag', async () => {
    panel.activeTag = 'javascript';
    await panel.loadKnowledgeList();
    const filtered = panel._allFilteredEntries;
    assert.ok(filtered.every(e => e.tags?.includes('javascript')));
  });

  it('23. loadKnowledgeList filters by activeLanguage', async () => {
    panel.activeLanguage = 'en';
    await panel.loadKnowledgeList();
    const filtered = panel._allFilteredEntries;
    assert.ok(filtered.every(e => e.language === 'en'));
  });

  // ─── 24. selectMode ───────────────────────────────────────────────────────

  it('24. selectMode toggles correctly', () => {
    assert.equal(panel.selectMode, false);
    panel.selectMode = true;
    assert.equal(panel.selectMode, true);
  });

  it('25. selectedIds tracks multiple selections', () => {
    panel.selectedIds.add('e1');
    panel.selectedIds.add('e2');
    assert.equal(panel.selectedIds.size, 2);
    assert.ok(panel.selectedIds.has('e1'));
    assert.ok(panel.selectedIds.has('e2'));
    panel.selectedIds.delete('e1');
    assert.equal(panel.selectedIds.size, 1);
  });

  // ─── 26. loadRelatedEntries ───────────────────────────────────────────────

  it('26. loadRelatedEntries is callable', async () => {
    await panel.loadKnowledgeList();
    await assert.doesNotReject(() => panel.loadRelatedEntries('e1'));
  });

  // ─── 27. loadKnowledgeTags ────────────────────────────────────────────────

  it('27. loadKnowledgeTags is callable', async () => {
    await assert.doesNotReject(() => panel.loadKnowledgeTags());
  });

  // ─── 28. edge cases ───────────────────────────────────────────────────────

  it('28. loadKnowledgeList with 1000 entries does not crash', async () => {
    const bigEntries = Array.from({ length: 1000 }, (_, i) => ({
      id: `big-${i}`, title: `Entry ${i}`, content: `Content ${i}`,
      summary: `Summary ${i}`, tags: ['test'], category: 'test',
      language: 'en', createdAt: new Date().toISOString()
    }));
    panel.memory = createMockMemory(bigEntries);
    await assert.doesNotReject(() => panel.loadKnowledgeList());
    assert.equal(panel._allFilteredEntries.length, 1000);
  });

  it('29. double loadKnowledgeList does not duplicate', async () => {
    await panel.loadKnowledgeList();
    await panel.loadKnowledgeList();
    assert.equal(panel._allFilteredEntries.length, 3);
  });

  it('30. entry with missing fields does not crash', async () => {
    const sparse = [{ id: 's1', title: 'Sparse' }];
    panel.memory = createMockMemory(sparse);
    await assert.doesNotReject(() => panel.loadKnowledgeList());
  });
});
