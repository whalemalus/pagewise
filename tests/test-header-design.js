import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const html = readFileSync('sidebar/sidebar.html', 'utf-8');
const css = readFileSync('sidebar/sidebar.css', 'utf-8');

describe('头部导航设计', () => {
  it('HTML 包含 brand-icon', () => {
    assert.ok(html.includes('brand-icon'));
  });

  it('HTML 包含 SVG 图标', () => {
    assert.ok(html.includes('<svg'));
  });

  it('HTML 6 个 tab 按钮', () => {
    const tabs = html.match(/data-tab="/g);
    assert.ok(tabs && tabs.length >= 6, `应有 6 个 tab，实际 ${tabs?.length}`);
  });

  it('CSS 包含 brand-name 渐变', () => {
    assert.ok(css.includes('background-clip: text'));
  });

  it('CSS 包含 tab pill 样式', () => {
    assert.ok(css.includes('.tabs'));
    assert.ok(css.includes('border-radius'));
  });

  it('CSS 包含 tab-icon 样式', () => {
    assert.ok(css.includes('.tab-icon'));
  });

  it('CSS header 使用 sticky', () => {
    assert.ok(css.includes('position: sticky'));
  });
});
