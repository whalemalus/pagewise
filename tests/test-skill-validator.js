/**
 * 测试 lib/skill-validator.js — 技能验证与安全扫描
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  parseSkillManifest,
  parseSimpleYaml,
  validateManifest,
  validateSkillPackage,
  validatePackageSize,
  scanCode,
  scanPackage,
  ValidationError,
  ValidationResult,
  SecurityScanResult,
} = await import('../lib/skill-validator.js');

// ==================== YAML Parser ====================

describe('parseSimpleYaml', () => {
  it('parses simple key-value pairs', () => {
    const result = parseSimpleYaml('name: Test\nversion: 1.0.0\nactive: true');
    assert.equal(result.name, 'Test');
    assert.equal(result.version, '1.0.0');
    assert.equal(result.active, true);
  });

  it('parses boolean values', () => {
    const result = parseSimpleYaml('enabled: true\ndisabled: false');
    assert.equal(result.enabled, true);
    assert.equal(result.disabled, false);
  });

  it('parses numeric values', () => {
    const result = parseSimpleYaml('count: 42\nprice: 3.14');
    assert.equal(result.count, 42);
    assert.equal(result.price, 3.14);
  });

  it('parses null values', () => {
    const result = parseSimpleYaml('empty: null\nalso: ~');
    assert.equal(result.empty, null);
    assert.equal(result.also, null);
  });

  it('parses quoted strings', () => {
    const result = parseSimpleYaml('name: "quoted value"\nother: \'single quotes\'');
    assert.equal(result.name, 'quoted value');
    assert.equal(result.other, 'single quotes');
  });

  it('parses inline arrays', () => {
    const result = parseSimpleYaml('tags: [a, b, c]');
    assert.deepEqual(result.tags, ['a', 'b', 'c']);
  });

  it('parses multi-line arrays', () => {
    const yaml = 'items:\n  - one\n  - two\n  - three';
    const result = parseSimpleYaml(yaml);
    assert.deepEqual(result.items, ['one', 'two', 'three']);
  });

  it('skips comments', () => {
    const result = parseSimpleYaml('# This is a comment\nname: Test\n# Another comment');
    assert.equal(result.name, 'Test');
    assert.equal(Object.keys(result).length, 1);
  });

  it('handles empty input', () => {
    const result = parseSimpleYaml('');
    assert.deepEqual(result, {});
  });
});

// ==================== SKILL.md Parser ====================

describe('parseSkillManifest', () => {
  it('parses frontmatter and body', () => {
    const md = '---\nid: test-skill\nname: Test\nversion: 1.0.0\n---\n\n# Test Skill\n\nDescription here.';
    const { frontmatter, body } = parseSkillManifest(md);

    assert.equal(frontmatter.id, 'test-skill');
    assert.equal(frontmatter.name, 'Test');
    assert.equal(frontmatter.version, '1.0.0');
    assert.ok(body.includes('# Test Skill'));
    assert.ok(body.includes('Description here'));
  });

  it('throws on missing frontmatter', () => {
    assert.throws(
      () => parseSkillManifest('# No frontmatter here'),
      /YAML frontmatter/
    );
  });

  it('throws on empty content', () => {
    assert.throws(
      () => parseSkillManifest(''),
      /YAML frontmatter/
    );
  });

  it('parses full skill manifest', () => {
    const md = `---
id: code-explainer
name: Code Explainer
version: 2.1.0
description: Explains code line by line
author: testuser
category: code
license: MIT
homepage: https://example.com
keywords:
  - code
  - explain
  - analyze
parameters:
  - name: code
    type: string
    description: Source code to explain
    required: true
  - name: language
    type: string
    description: Output language
    required: false
trigger:
  type: auto
permissions:
  - ai_chat
  - page_read
---

# Code Explainer

This skill explains code line by line.`;

    const { frontmatter, body } = parseSkillManifest(md);

    assert.equal(frontmatter.id, 'code-explainer');
    assert.equal(frontmatter.name, 'Code Explainer');
    assert.equal(frontmatter.version, '2.1.0');
    assert.equal(frontmatter.author, 'testuser');
    assert.equal(frontmatter.category, 'code');
    assert.equal(frontmatter.license, 'MIT');
    assert.deepEqual(frontmatter.keywords, ['code', 'explain', 'analyze']);
    assert.ok(Array.isArray(frontmatter.parameters));
    assert.equal(frontmatter.parameters.length, 2);
    assert.ok(body.includes('explains code'));
  });
});

// ==================== Manifest Validation ====================

describe('validateManifest', () => {
  const validManifest = {
    id: 'test-skill',
    name: 'Test Skill',
    version: '1.0.0',
    description: 'A test skill',
    author: 'tester',
    category: 'general',
    license: 'MIT'
  };

  it('passes with valid manifest', () => {
    const result = validateManifest(validManifest);
    assert.ok(result.valid);
    assert.equal(result.errors.length, 0);
  });

  it('fails on missing required fields', () => {
    const result = validateManifest({});
    assert.ok(!result.valid);
    assert.ok(result.errors.length >= 7); // 7 required fields
  });

  it('fails on invalid ID format', () => {
    const result = validateManifest({ ...validManifest, id: '123-bad!' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.message.includes('Invalid skill ID')));
  });

  it('passes with valid ID format', () => {
    const result = validateManifest({ ...validManifest, id: 'my-skill-123' });
    assert.ok(result.valid);
  });

  it('fails on ID too long', () => {
    const longId = 'a'.repeat(65);
    const result = validateManifest({ ...validManifest, id: longId });
    assert.ok(!result.valid);
  });

  it('warns on long description', () => {
    const longDesc = 'x'.repeat(201);
    const result = validateManifest({ ...validManifest, description: longDesc });
    assert.ok(result.valid); // Warning, not error
    assert.ok(result.warnings.length > 0);
  });

  it('fails on invalid version format', () => {
    const result = validateManifest({ ...validManifest, version: '1.0' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.message.includes('semver')));
  });

  it('passes with valid semver', () => {
    const result = validateManifest({ ...validManifest, version: '1.2.3' });
    assert.ok(result.valid);
  });

  it('fails on invalid category', () => {
    const result = validateManifest({ ...validManifest, category: 'invalid_cat' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.message.includes('Invalid category')));
  });

  it('passes with all valid categories', () => {
    const categories = ['analysis', 'code', 'debug', 'doc', 'learning', 'export', 'translation', 'general'];
    for (const cat of categories) {
      const result = validateManifest({ ...validManifest, category: cat });
      assert.ok(result.valid, `Category "${cat}" should be valid`);
    }
  });

  it('validates parameters array', () => {
    const result = validateManifest({
      ...validManifest,
      parameters: [
        { name: 'text', type: 'string', description: 'input', required: true },
        { name: 'count', type: 'number', description: 'amount' }
      ]
    });
    assert.ok(result.valid);
  });

  it('fails on invalid parameter type', () => {
    const result = validateManifest({
      ...validManifest,
      parameters: [{ name: 'x', type: 'invalid_type' }]
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.message.includes('invalid type')));
  });

  it('fails on parameter missing name', () => {
    const result = validateManifest({
      ...validManifest,
      parameters: [{ type: 'string' }]
    });
    assert.ok(!result.valid);
  });

  it('fails on invalid trigger type', () => {
    const result = validateManifest({
      ...validManifest,
      trigger: { type: 'invalid' }
    });
    assert.ok(!result.valid);
  });

  it('passes with valid trigger types', () => {
    for (const type of ['manual', 'auto', 'keyword', 'url_pattern']) {
      const result = validateManifest({
        ...validManifest,
        trigger: { type }
      });
      assert.ok(result.valid, `Trigger type "${type}" should be valid`);
    }
  });
});

// ==================== Security Scan ====================

describe('scanCode', () => {
  it('passes clean code', () => {
    const code = `
export default async function execute(params, context) {
  const response = await context.ai.chat([{ role: 'user', content: 'hello' }]);
  return response.content;
}`;
    const result = scanCode(code, 'main.js');
    assert.ok(result.safe);
    assert.equal(result.findings.length, 0);
  });

  it('detects eval()', () => {
    const code = 'const result = eval("1+1");';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
    assert.ok(result.findings.some(f => f.pattern.includes('eval')));
    assert.equal(result.findings[0].risk, 'critical');
  });

  it('detects new Function()', () => {
    const code = 'const fn = new Function("return 1+1");';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
    assert.ok(result.findings.some(f => f.pattern.includes('Function')));
  });

  it('detects chrome.* API access', () => {
    const code = 'chrome.runtime.sendMessage({});';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
    assert.ok(result.findings.some(f => f.pattern.includes('chrome')));
  });

  it('detects XMLHttpRequest', () => {
    const code = 'const xhr = new XMLHttpRequest();';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
  });

  it('detects WebSocket', () => {
    const code = 'const ws = new WebSocket("ws://example.com");';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
  });

  it('detects dynamic import()', () => {
    const code = 'const mod = await import("./evil.js");';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
  });

  it('detects require()', () => {
    const code = 'const fs = require("fs");';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
  });

  it('detects fetch()', () => {
    const code = 'const resp = await fetch("https://evil.com");';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
    assert.equal(result.findings[0].risk, 'medium');
  });

  it('detects DOM manipulation', () => {
    const code = 'document.getElementById("app").innerHTML = "pwned";';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
  });

  it('detects window access', () => {
    const code = 'window.location = "https://evil.com";';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
  });

  it('detects process access', () => {
    const code = 'console.log(process.env.SECRET);';
    const result = scanCode(code, 'main.js');
    assert.ok(!result.safe);
  });

  it('skips single-line comments', () => {
    const code = '// eval("safe comment")\nconst x = 1;';
    const result = scanCode(code, 'main.js');
    assert.ok(result.safe);
  });

  it('reports correct line numbers', () => {
    const code = 'const x = 1;\nconst y = 2;\neval("bad");';
    const result = scanCode(code, 'test.js');
    assert.equal(result.findings[0].line, 3);
    assert.equal(result.findings[0].file, 'test.js');
  });
});

describe('scanPackage', () => {
  it('scans multiple JS files', () => {
    const files = [
      { name: 'main.js', content: 'export default async function() {}' },
      { name: 'bad.js', content: 'eval("evil")' },
      { name: 'README.md', content: '# Safe markdown' }
    ];
    const result = scanPackage(files);
    assert.ok(!result.safe);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].file, 'bad.js');
  });

  it('ignores non-JS files', () => {
    const files = [
      { name: 'README.md', content: 'eval("in markdown is ok")' },
      { name: 'main.js', content: 'export default async function() {}' }
    ];
    const result = scanPackage(files);
    assert.ok(result.safe);
  });
});

// ==================== Package Size Validation ====================

describe('validatePackageSize', () => {
  it('passes normal sized files', () => {
    const files = [
      { name: 'main.js', content: 'x'.repeat(1000) },
      { name: 'README.md', content: 'y'.repeat(500) }
    ];
    const result = validatePackageSize(files);
    assert.ok(result.valid);
  });

  it('warns on disallowed extensions', () => {
    const files = [
      { name: 'main.js', content: 'code' },
      { name: 'data.exe', content: 'bad' }
    ];
    const result = validatePackageSize(files);
    assert.ok(result.valid); // Warning only
    assert.ok(result.warnings.length > 0);
  });
});

// ==================== Full Validation Pipeline ====================

describe('validateSkillPackage', () => {
  const validPackage = [
    {
      name: 'SKILL.md',
      content: '---\nid: test-skill\nname: Test Skill\nversion: 1.0.0\ndescription: A test\nauthor: test\ncategory: general\nlicense: MIT\n---\n\n# Test Skill'
    },
    { name: 'main.js', content: 'export default async function execute(params, context) {\n  return "ok";\n}' },
    { name: 'README.md', content: '# Test Skill\n\nA test skill for PageWise.' }
  ];

  it('passes with valid package', () => {
    const result = validateSkillPackage(validPackage);
    assert.ok(result.valid, result.toString());
  });

  it('fails when SKILL.md is missing', () => {
    const pkg = validPackage.filter(f => f.name !== 'SKILL.md');
    const result = validateSkillPackage(pkg);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.message.includes('SKILL.md')));
  });

  it('fails when main.js is missing', () => {
    const pkg = validPackage.filter(f => f.name !== 'main.js');
    const result = validateSkillPackage(pkg);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.message.includes('main.js')));
  });

  it('fails when README.md is missing', () => {
    const pkg = validPackage.filter(f => f.name !== 'README.md');
    const result = validateSkillPackage(pkg);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.message.includes('README.md')));
  });

  it('fails when SKILL.md has invalid frontmatter', () => {
    const pkg = [
      { name: 'SKILL.md', content: 'No frontmatter here' },
      ...validPackage.filter(f => f.name !== 'SKILL.md')
    ];
    const result = validateSkillPackage(pkg);
    assert.ok(!result.valid);
  });

  it('fails on security violations', () => {
    const pkg = [
      ...validPackage.filter(f => f.name !== 'main.js'),
      { name: 'main.js', content: 'const x = eval("bad");\nexport default async function() { return x; }' }
    ];
    const result = validateSkillPackage(pkg);
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.message.includes('Security')));
  });

  it('handles empty package', () => {
    const result = validateSkillPackage([]);
    assert.ok(!result.valid);
    assert.ok(result.errors.length >= 3); // Missing all required files
  });
});

// ==================== ValidationResult ====================

describe('ValidationResult', () => {
  it('starts valid with no errors', () => {
    const r = new ValidationResult();
    assert.ok(r.valid);
    assert.equal(r.errors.length, 0);
    assert.equal(r.warnings.length, 0);
  });

  it('becomes invalid after adding error', () => {
    const r = new ValidationResult();
    r.addError('test error');
    assert.ok(!r.valid);
    assert.equal(r.errors.length, 1);
  });

  it('warnings do not make it invalid', () => {
    const r = new ValidationResult();
    r.addWarning('test warning');
    assert.ok(r.valid);
    assert.equal(r.warnings.length, 1);
  });

  it('merge combines results', () => {
    const a = new ValidationResult();
    a.addError('err1');
    const b = new ValidationResult();
    b.addWarning('warn1');
    a.merge(b);
    assert.equal(a.errors.length, 1);
    assert.equal(a.warnings.length, 1);
  });

  it('toString formats correctly', () => {
    const r = new ValidationResult();
    r.addError('bad thing', 'field1');
    const str = r.toString();
    assert.ok(str.includes('failed'));
    assert.ok(str.includes('bad thing'));
    assert.ok(str.includes('[field1]'));
  });
});

// ==================== SecurityScanResult ====================

describe('SecurityScanResult', () => {
  it('starts safe with no findings', () => {
    const r = new SecurityScanResult();
    assert.ok(r.safe);
    assert.equal(r.findings.length, 0);
  });

  it('becomes unsafe after finding', () => {
    const r = new SecurityScanResult();
    r.addFinding('main.js', 'eval()', 'critical', 1);
    assert.ok(!r.safe);
    assert.equal(r.criticalCount, 1);
  });

  it('counts by risk level', () => {
    const r = new SecurityScanResult();
    r.addFinding('a.js', 'eval()', 'critical', 1);
    r.addFinding('b.js', 'fetch()', 'medium', 2);
    r.addFinding('c.js', 'XHR', 'high', 3);
    assert.equal(r.criticalCount, 1);
    assert.equal(r.highCount, 1);
  });
});
