import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const css = readFileSync('sidebar/sidebar.css', 'utf-8');

describe('动画系统', () => {
  it('包含面板切换动画', () => {
    assert.ok(css.includes('@keyframes panelIn'));
  });

  it('包含骨架屏 shimmer', () => {
    assert.ok(css.includes('@keyframes shimmer'));
    assert.ok(css.includes('.skeleton'));
  });

  it('包含脉冲动画', () => {
    assert.ok(css.includes('@keyframes pulseRing'));
  });

  it('包含加载旋转', () => {
    assert.ok(css.includes('@keyframes spin'));
    assert.ok(css.includes('.loading-spinner'));
  });

  it('包含淡入淡出', () => {
    assert.ok(css.includes('@keyframes fadeIn'));
    assert.ok(css.includes('@keyframes fadeOut'));
  });

  it('包含滑入动画', () => {
    assert.ok(css.includes('@keyframes slideUp'));
  });

  it('包含缩放弹入', () => {
    assert.ok(css.includes('@keyframes scaleIn'));
  });

  it('包含 toast 改进', () => {
    assert.ok(css.includes('.toast.show'));
    assert.ok(css.includes('backdrop-filter'));
  });

  it('包含减少动画偏好', () => {
    assert.ok(css.includes('prefers-reduced-motion'));
  });

  it('包含涟漪按钮效果', () => {
    assert.ok(css.includes('.btn-ripple'));
  });
});
