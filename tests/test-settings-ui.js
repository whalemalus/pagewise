import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const css = readFileSync('sidebar/sidebar.css', 'utf-8');

describe('设置面板设计', () => {
  it('CSS 包含 settings-group', () => {
    assert.ok(css.includes('.settings-group'));
  });

  it('CSS 包含 settings-item', () => {
    assert.ok(css.includes('.settings-item'));
  });

  it('CSS 包含 toggle-switch', () => {
    assert.ok(css.includes('.toggle-switch'));
  });

  it('CSS toggle 有滑动伪元素', () => {
    assert.ok(css.includes('.toggle-switch::after'));
  });

  it('CSS 包含 btn-primary 渐变', () => {
    assert.ok(css.includes('.btn-primary'));
  });

  it('CSS 包含 btn-secondary', () => {
    assert.ok(css.includes('.btn-secondary'));
  });

  it('CSS 包含 btn-danger', () => {
    assert.ok(css.includes('.btn-danger'));
  });

  it('CSS 输入框 focus 效果', () => {
    assert.ok(css.includes('.settings-input:focus'));
  });

  it('CSS 设置项 hover 效果', () => {
    assert.ok(css.includes('.settings-item:hover'));
  });

  it('CSS 按钮 hover 上浮', () => {
    assert.ok(css.includes('.btn-primary:hover'));
  });
});
