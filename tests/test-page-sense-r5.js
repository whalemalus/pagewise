import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './helpers/chrome-mock.js';
installChromeMock();
const { PageSense } = await import('../lib/page-sense.js');

describe('PageSense extraction methods', () => {
  const ps = new PageSense();

  // ---- extractContent ----

  it('extractContent extracts visible text from basic HTML', () => {
    const html = '<html><body><p>Hello World</p><p>Second paragraph</p></body></html>';
    const text = ps.extractContent(html);
    assert.ok(text.includes('Hello World'));
    assert.ok(text.includes('Second paragraph'));
  });

  it('extractContent returns empty string for empty HTML', () => {
    assert.equal(ps.extractContent(''), '');
    assert.equal(ps.extractContent('<html><body></body></html>'), '');
  });

  it('extractContent strips script and style tags', () => {
    const html = '<html><body><script>var x=1;</script><style>.a{color:red}</style><p>Visible</p></body></html>';
    const text = ps.extractContent(html);
    assert.ok(!text.includes('var x'));
    assert.ok(!text.includes('color:red'));
    assert.ok(text.includes('Visible'));
  });

  // ---- extractImages ----

  it('extractImages extracts img src attributes', () => {
    const html = '<html><body><img src="https://example.com/a.png"><img src="/images/b.jpg"></body></html>';
    const images = ps.extractImages(html);
    assert.equal(images.length, 2);
    assert.ok(images.includes('https://example.com/a.png'));
    assert.ok(images.includes('/images/b.jpg'));
  });

  it('extractImages returns empty array when no images', () => {
    const html = '<html><body><p>No images here</p></body></html>';
    const images = ps.extractImages(html);
    assert.deepEqual(images, []);
  });

  // ---- extractMetadata ----

  it('extractMetadata extracts title and description', () => {
    const html = '<html><head><title>My Page</title><meta name="description" content="A test page"></head><body></body></html>';
    const meta = ps.extractMetadata(html);
    assert.equal(meta.title, 'My Page');
    assert.equal(meta.description, 'A test page');
  });

  it('extractMetadata returns defaults when no meta tags', () => {
    const html = '<html><head></head><body></body></html>';
    const meta = ps.extractMetadata(html);
    assert.equal(meta.title, '');
    assert.equal(meta.description, '');
  });

  // ---- extractHeadings ----

  it('extractHeadings extracts h1-h3 headings with levels', () => {
    const html = '<html><body><h1>Title</h1><h2>Subtitle</h2><h3>Section</h3><p>Text</p></body></html>';
    const headings = ps.extractHeadings(html);
    assert.equal(headings.length, 3);
    assert.equal(headings[0].level, 1);
    assert.equal(headings[0].text, 'Title');
    assert.equal(headings[1].level, 2);
    assert.equal(headings[1].text, 'Subtitle');
    assert.equal(headings[2].level, 3);
    assert.equal(headings[2].text, 'Section');
  });
});
