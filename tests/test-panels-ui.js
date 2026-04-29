import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const css = readFileSync('sidebar/sidebar.css', 'utf-8');

describe('技能 + 知识库面板设计', () => {
  it('CSS 包含 skill-card', () => {
    assert.ok(css.includes('.skill-card'));
  });

  it('CSS 包含 skill-card hover 效果', () => {
    assert.ok(css.includes('.skill-card:hover'));
  });

  it('CSS 包含 toggle 开关', () => {
    assert.ok(css.includes('.skill-toggle'));
  });

  it('CSS toggle 有滑动效果', () => {
    assert.ok(css.includes('.skill-toggle::after'));
  });

  it('CSS 包含 knowledge-card', () => {
    assert.ok(css.includes('.knowledge-card'));
  });

  it('CSS 包含 pill 标签筛选', () => {
    assert.ok(css.includes('.tag-chip'));
    assert.ok(css.includes('border-radius: var(--radius-full)'));
  });

  it('CSS 包含空状态样式', () => {
    assert.ok(css.includes('.empty-state'));
  });

  it('CSS 搜索框 focus 效果', () => {
    assert.ok(css.includes('.skills-search:focus'));
  });

  it('CSS 知识卡片截断', () => {
    assert.ok(css.includes('-webkit-line-clamp'));
  });

  it('CSS 卡片进入动画', () => {
    assert.ok(css.includes('@keyframes fadeIn'));
  });
});
