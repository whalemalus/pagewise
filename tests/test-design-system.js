import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const css = readFileSync('sidebar/sidebar.css', 'utf-8');

describe('设计系统 CSS 变量', () => {
  it('包含 --bg-primary', () => {
    assert.ok(css.includes('--bg-primary:'));
  });

  it('包含 --accent-gradient', () => {
    assert.ok(css.includes('--accent-gradient'));
  });

  it('包含 --radius-lg', () => {
    assert.ok(css.includes('--radius-lg'));
  });

  it('包含 --shadow-lg', () => {
    assert.ok(css.includes('--shadow-lg'));
  });

  it('包含 --transition-spring', () => {
    assert.ok(css.includes('--transition-spring'));
  });

  it('包含 --font-sans', () => {
    assert.ok(css.includes('--font-sans:'));
  });

  it('包含 --font-mono', () => {
    assert.ok(css.includes('--font-mono:'));
  });

  it('包含滚动条样式', () => {
    assert.ok(css.includes('::-webkit-scrollbar'));
  });

  it('包含 antialiasing', () => {
    assert.ok(css.includes('-webkit-font-smoothing'));
  });

  it('圆角值已定义', () => {
    const match = css.match(/--radius:\s*(\d+)px/);
    assert.ok(match, '应定义 --radius');
    assert.ok(parseInt(match[1]) >= 4, '--radius 应 >= 4px');
  });
});
