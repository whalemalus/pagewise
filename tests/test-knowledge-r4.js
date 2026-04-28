import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';
installIndexedDBMock();
const { KnowledgeBase } = await import('../lib/knowledge-base.js');

describe('KnowledgeBase', () => {
  let kb;

  beforeEach(async () => {
    resetIndexedDBMock();
    kb = new KnowledgeBase();
    await kb.init();
  });

  afterEach(() => {
    kb = null;
  });

  it('init does not throw', async () => {
    const fresh = new KnowledgeBase();
    await assert.doesNotReject(() => fresh.init());
  });

  it('saveEntry basic add', async () => {
    const entry = await kb.saveEntry({
      title: 'Test Title',
      content: 'Some content here',
      sourceUrl: 'https://example.com',
    });
    assert.ok(entry);
    assert.ok(entry.id);
    assert.equal(entry.title, 'Test Title');
    assert.equal(entry.content, 'Some content here');
    assert.equal(entry.sourceUrl, 'https://example.com');
  });

  it('saveEntry then getAllEntries finds it', async () => {
    await kb.saveEntry({ title: 'Doc A', content: 'Body A' });
    await kb.saveEntry({ title: 'Doc B', content: 'Body B' });
    const all = await kb.getAllEntries();
    assert.ok(Array.isArray(all));
    assert.equal(all.length, 2);
    const titles = all.map(e => e.title).sort();
    assert.deepEqual(titles, ['Doc A', 'Doc B']);
  });

  it('saveEntry with tags stores tags', async () => {
    const entry = await kb.saveEntry({
      title: 'Tagged',
      content: 'Content',
      tags: ['javascript', 'tutorial'],
    });
    assert.ok(Array.isArray(entry.tags));
    assert.deepEqual(entry.tags.sort(), ['javascript', 'tutorial'].sort());
  });

  it('searchByTag filters by tag', async () => {
    await kb.saveEntry({ title: 'JS Guide', content: 'JS stuff', tags: ['javascript'] });
    await kb.saveEntry({ title: 'Python Guide', content: 'Python stuff', tags: ['python'] });
    await kb.saveEntry({ title: 'Web Dev', content: 'Web stuff', tags: ['javascript', 'html'] });

    const jsEntries = await kb.searchByTag('javascript');
    assert.equal(jsEntries.length, 2);
    const titles = jsEntries.map(e => e.title).sort();
    assert.deepEqual(titles, ['JS Guide', 'Web Dev']);
  });

  it('searchByTag with no match returns empty', async () => {
    await kb.saveEntry({ title: 'Something', content: 'Body', tags: ['python'] });
    const result = await kb.searchByTag('nonexistent');
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('search basic query finds results', async () => {
    await kb.saveEntry({ title: 'JavaScript Basics', content: 'Learn JS from scratch' });
    await kb.saveEntry({ title: 'Python Guide', content: 'Learn Python basics' });

    const results = await kb.search('JavaScript');
    assert.ok(results.length >= 1);
    const found = results.some(e => e.title === 'JavaScript Basics');
    assert.ok(found, 'should find entry with JavaScript in title');
  });

  it('search with empty query returns all entries', async () => {
    await kb.saveEntry({ title: 'A', content: 'Alpha' });
    await kb.saveEntry({ title: 'B', content: 'Beta' });
    const results = await kb.search('');
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 2);
  });

  it('deleteEntry removes entry from store', async () => {
    const entry = await kb.saveEntry({ title: 'To Delete', content: 'Ephemeral' });
    const id = entry.id;

    await kb.deleteEntry(id);
    const all = await kb.getAllEntries();
    assert.equal(all.length, 0);
    const found = all.find(e => e.id === id);
    assert.equal(found, undefined);
  });

  it('getStats returns statistics object', async () => {
    await kb.saveEntry({ title: 'A', content: 'Body A', tags: ['x'] });
    await kb.saveEntry({ title: 'B', content: 'Body B', tags: ['y', 'x'] });
    await kb.saveEntry({ title: 'C', content: 'Body C' });

    const stats = await kb.getStats();
    assert.ok(stats, 'stats should not be null');
    assert.equal(typeof stats, 'object');
    assert.equal(stats.totalEntries, 3);
    assert.ok(typeof stats.totalTags === 'number');
    assert.ok(Array.isArray(stats.recentEntries));
    assert.ok(Array.isArray(stats.topTags));
  });
});
