import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const html = readFileSync('sidebar/sidebar.html', 'utf-8');
const css = readFileSync('sidebar/sidebar.css', 'utf-8');

describe('聊天界面设计', () => {
  it('CSS 包含消息气泡样式', () => {
    assert.ok(css.includes('.message-bubble'));
  });

  it('CSS 用户消息右对齐', () => {
    assert.ok(css.includes('.message-user'));
  });

  it('CSS 包含输入区域样式', () => {
    assert.ok(css.includes('.input-wrapper'));
  });

  it('CSS 输入框 focus 效果', () => {
    assert.ok(css.includes('.input-wrapper:focus-within'));
  });

  it('CSS 发送按钮渐变', () => {
    assert.ok(css.includes('.btn-send'));
    assert.ok(css.includes('accent-gradient'));
  });

  it('CSS 欢迎屏浮动动画', () => {
    assert.ok(css.includes('@keyframes float'));
  });

  it('CSS 思考指示器动画', () => {
    assert.ok(css.includes('.thinking-dots'));
    assert.ok(css.includes('dotPulse'));
  });

  it('CSS 消息进入动画', () => {
    assert.ok(css.includes('@keyframes messageIn'));
  });

  it('HTML 输入区域有 placeholder', () => {
    assert.ok(html.includes('placeholder='));
  });

  it('HTML 发送按钮有 SVG', () => {
    assert.ok(html.includes('btn-send'));
    assert.ok(html.includes('<svg'));
  });
});
