/**
 * 测试 键盘快捷键（R7）
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const js = readFileSync('sidebar/sidebar.js', 'utf-8');
const html = readFileSync('sidebar/sidebar.html', 'utf-8');

describe('键盘快捷键 — sidebar.js bindEvents()', () => {
  it('Ctrl+Enter 快捷键触发 sendMessage()', () => {
    assert.ok(js.includes("matchShortcut(e, sc.sendMessage)"));
    assert.ok(js.includes('this.sendMessage()'));
  });

  it('Escape 清空 userInput 输入框', () => {
    // 确认在所有弹窗关闭判断之后有清空 userInput 的逻辑
    assert.ok(js.includes("this.userInput && this.userInput.value.trim()"));
    assert.ok(js.includes("this.userInput.value = ''"));
    assert.ok(js.includes("this.userInput.style.height = 'auto'"));
  });

  it('Ctrl+K 聚焦 searchInput', () => {
    assert.ok(js.includes("matchShortcut(e, sc.focusSearch)"));
    assert.ok(js.includes('this.searchInput.focus()'));
    assert.ok(js.includes('this.searchInput.select()'));
  });

  it('Ctrl+N 清空对话', () => {
    assert.ok(js.includes("matchShortcut(e, sc.clearChat)"));
    assert.ok(js.includes('this.clearChat()'));
  });

  it('快捷键处理使用 preventDefault 阻止默认行为', () => {
    const matches = js.match(/e\.preventDefault\(\);/g);
    assert.ok(matches.length >= 4, `Expected at least 4 preventDefault calls, found ${matches.length}`);
  });

  it('发送消息快捷键在 Escape 之前处理（优先级正确）', () => {
    const sendMessagePos = js.indexOf("matchShortcut(e, sc.sendMessage)");
    const escapePos = js.indexOf("// Escape → 依次关闭弹窗");
    assert.ok(sendMessagePos > 0, 'sendMessage shortcut handler found');
    assert.ok(escapePos > 0, 'Escape handler found');
    assert.ok(sendMessagePos < escapePos, 'sendMessage shortcut should be before Escape');
  });
});

describe('发送按钮工具提示 — sidebar.html', () => {
  it('btnSend 按钮有 Ctrl+Enter title 属性', () => {
    assert.ok(html.includes('id="btnSend"'));
    assert.ok(html.includes('title="Ctrl+Enter"'));
  });

  it('btnSend 的 title 属性在 aria-label 之后', () => {
    const btnMatch = html.match(/id="btnSend"[^>]*/);
    assert.ok(btnMatch, 'btnSend button found');
    const attrs = btnMatch[0];
    const ariaPos = attrs.indexOf('aria-label');
    const titlePos = attrs.indexOf('title=');
    assert.ok(ariaPos >= 0, 'aria-label exists');
    assert.ok(titlePos >= 0, 'title exists');
    assert.ok(titlePos > ariaPos, 'title after aria-label');
  });
});
