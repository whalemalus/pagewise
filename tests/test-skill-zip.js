/**
 * 测试 lib/skill-zip.js — ZIP 归档工具
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { createZip, readZip, readZipAsText, crc32 } = await import('../lib/skill-zip.js');

// ==================== CRC32 ====================

describe('crc32', () => {
  it('computes CRC32 for empty data', () => {
    const result = crc32(new Uint8Array(0));
    assert.equal(result, 0);
  });

  it('computes CRC32 for "hello"', () => {
    const data = new TextEncoder().encode('hello');
    const result = crc32(data);
    assert.equal(typeof result, 'number');
    assert.ok(result > 0);
  });

  it('computes same CRC for same input', () => {
    const data = new TextEncoder().encode('test data');
    const a = crc32(data);
    const b = crc32(data);
    assert.equal(a, b);
  });

  it('computes different CRC for different input', () => {
    const a = crc32(new TextEncoder().encode('hello'));
    const b = crc32(new TextEncoder().encode('world'));
    assert.notEqual(a, b);
  });

  it('returns unsigned 32-bit integer', () => {
    const data = new TextEncoder().encode('pagewise');
    const result = crc32(data);
    assert.ok(result >= 0);
    assert.ok(result <= 0xFFFFFFFF);
    assert.equal(result, result >>> 0); // unsigned
  });
});

// ==================== Create ZIP ====================

describe('createZip', () => {
  it('creates a valid ZIP from single file', () => {
    const zip = createZip([{ name: 'test.txt', content: 'hello' }]);
    assert.ok(zip instanceof Uint8Array);
    assert.ok(zip.length > 0);
    // Check local file header signature: PK\x03\x04
    assert.equal(zip[0], 0x50); // P
    assert.equal(zip[1], 0x4B); // K
    assert.equal(zip[2], 0x03);
    assert.equal(zip[3], 0x04);
  });

  it('creates ZIP with multiple files', () => {
    const files = [
      { name: 'a.txt', content: 'file a' },
      { name: 'b.txt', content: 'file b' },
      { name: 'c.txt', content: 'file c' }
    ];
    const zip = createZip(files);
    assert.ok(zip.length > 0);
  });

  it('handles empty file content', () => {
    const zip = createZip([{ name: 'empty.txt', content: '' }]);
    assert.ok(zip instanceof Uint8Array);
    assert.ok(zip.length > 0);
  });

  it('handles binary content (Uint8Array)', () => {
    const content = new Uint8Array([0, 1, 2, 3, 255]);
    const zip = createZip([{ name: 'binary.dat', content }]);
    assert.ok(zip instanceof Uint8Array);
  });

  it('handles filenames with special characters', () => {
    const zip = createZip([{ name: 'dir/nested/file.txt', content: 'nested' }]);
    assert.ok(zip.length > 0);
  });
});

// ==================== Read ZIP ====================

describe('readZip', () => {
  it('reads back a single file', () => {
    const original = 'Hello, PageWise!';
    const zip = createZip([{ name: 'test.txt', content: original }]);
    const files = readZip(zip);

    assert.equal(files.length, 1);
    assert.equal(files[0].name, 'test.txt');
    assert.equal(new TextDecoder().decode(files[0].content), original);
  });

  it('reads back multiple files', () => {
    const input = [
      { name: 'SKILL.md', content: '---\nid: test\n---\n# Test' },
      { name: 'main.js', content: 'export default async function() {}' },
      { name: 'README.md', content: '# Test Skill' }
    ];
    const zip = createZip(input);
    const files = readZip(zip);

    assert.equal(files.length, 3);

    const decoder = new TextDecoder();
    assert.equal(files[0].name, 'SKILL.md');
    assert.equal(decoder.decode(files[0].content), input[0].content);

    assert.equal(files[1].name, 'main.js');
    assert.equal(decoder.decode(files[1].content), input[1].content);

    assert.equal(files[2].name, 'README.md');
    assert.equal(decoder.decode(files[2].content), input[2].content);
  });

  it('preserves empty file content', () => {
    const zip = createZip([{ name: 'empty.txt', content: '' }]);
    const files = readZip(zip);
    assert.equal(files.length, 1);
    assert.equal(files[0].content.length, 0);
  });

  it('preserves binary content', () => {
    const binaryContent = new Uint8Array([0, 1, 2, 255, 254]);
    const zip = createZip([{ name: 'bin.dat', content: binaryContent }]);
    const files = readZip(zip);

    assert.equal(files.length, 1);
    assert.deepEqual(files[0].content, binaryContent);
  });

  it('throws on invalid data', () => {
    assert.throws(
      () => readZip(new Uint8Array([0, 0, 0, 0])),
      /Invalid ZIP/
    );
  });

  it('handles many files', () => {
    const input = [];
    for (let i = 0; i < 20; i++) {
      input.push({ name: `file_${i}.txt`, content: `Content of file ${i}` });
    }
    const zip = createZip(input);
    const files = readZip(zip);
    assert.equal(files.length, 20);
  });
});

// ==================== readZipAsText ====================

describe('readZipAsText', () => {
  it('returns files as text strings', () => {
    const input = [
      { name: 'a.txt', content: 'hello' },
      { name: 'b.txt', content: 'world' }
    ];
    const zip = createZip(input);
    const files = readZipAsText(zip);

    assert.equal(files.length, 2);
    assert.equal(typeof files[0].content, 'string');
    assert.equal(files[0].content, 'hello');
    assert.equal(files[1].content, 'world');
  });

  it('round-trips UTF-8 content', () => {
    const utf8Content = '你好世界 🎉 مرحبا';
    const zip = createZip([{ name: 'utf8.txt', content: utf8Content }]);
    const files = readZipAsText(zip);
    assert.equal(files[0].content, utf8Content);
  });
});

// ==================== Round-trip ====================

describe('ZIP round-trip', () => {
  it('createZip → readZipAsText preserves content exactly', () => {
    const input = [
      { name: 'SKILL.md', content: '---\nid: my-skill\nname: My Skill\nversion: 1.0.0\n---\n\n# Test' },
      { name: 'main.js', content: 'export default async function execute(params, ctx) {\n  return "ok";\n}' },
      { name: 'README.md', content: '# My Skill\n\nA community skill for PageWise.' }
    ];

    const zip = createZip(input);
    const output = readZipAsText(zip);

    assert.equal(output.length, input.length);
    for (let i = 0; i < input.length; i++) {
      assert.equal(output[i].name, input[i].name);
      assert.equal(output[i].content, input[i].content);
    }
  });
});
