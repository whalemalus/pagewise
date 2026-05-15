/**
 * test-depth-shortcuts.js — shortcuts 深度测试
 *
 * 测试范围 (15 用例):
 *   注册快捷键   — 写入完整自定义、空配置回退、字段缺失回退、多次覆盖写入
 *   触发执行     — matchShortcut 多修饰键精确匹配、功能键、边界 binding
 *   冲突检测     — 多 action 轮询与标签匹配、bindingsEqual 全字段缺失
 *   启用/禁用    — captureKeyFromEvent 清除后重新录制、空绑定格式化
 *   destroy      — resetShortcuts 幂等性、重置后 storage 状态验证
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  getShortcuts,
  saveShortcuts,
  resetShortcuts,
  formatShortcutDisplay,
  matchShortcut,
  captureKeyFromEvent,
  detectConflict,
  bindingsEqual,
} from '../lib/shortcuts.js';

// ==================== 注册快捷键 ====================

describe('注册快捷键 — 写入完整自定义配置后读回完全一致', () => {
  let ctx;
  beforeEach(() => { ctx = setupTestEnv(); });

  it('保存含全部 action 的自定义配置后 getShortcuts 完全匹配', async () => {
    const custom = {
      sendMessage: { key: 'Enter', ctrl: false, meta: true, shift: false, alt: false },
      focusSearch: { key: 'j', ctrl: true, meta: false, shift: true, alt: false },
      clearChat:   { key: 'F5', ctrl: false, meta: false, shift: false, alt: true },
    };
    await saveShortcuts(custom);
    const loaded = await getShortcuts();
    assert.deepEqual(loaded, custom);
  });
});

describe('注册快捷键 — 保存空对象后全部回退默认值', () => {
  let ctx;
  beforeEach(() => { ctx = setupTestEnv(); });

  it('空 {} 存储时 getShortcuts 返回 DEFAULT_SHORTCUTS', async () => {
    await chrome.storage.sync.set({ customShortcuts: {} });
    const loaded = await getShortcuts();
    assert.deepEqual(loaded, DEFAULT_SHORTCUTS);
  });
});

describe('注册快捷键 — 部分字段缺失回退到默认修饰键', () => {
  let ctx;
  beforeEach(() => { ctx = setupTestEnv(); });

  it('只存 key 不存修饰键时回退到默认修饰键', async () => {
    await chrome.storage.sync.set({ customShortcuts: {
      sendMessage: { key: 's' },
      focusSearch: { key: 'f' },
      clearChat:   { key: 'd' },
    }});
    const loaded = await getShortcuts();
    assert.equal(loaded.sendMessage.ctrl, DEFAULT_SHORTCUTS.sendMessage.ctrl);
    assert.equal(loaded.sendMessage.meta, DEFAULT_SHORTCUTS.sendMessage.meta);
    assert.equal(loaded.focusSearch.ctrl, DEFAULT_SHORTCUTS.focusSearch.ctrl);
    assert.equal(loaded.clearChat.ctrl, DEFAULT_SHORTCUTS.clearChat.ctrl);
  });
});

describe('注册快捷键 — 多次连续覆盖写入', () => {
  let ctx;
  beforeEach(() => { ctx = setupTestEnv(); });

  it('连续 3 次 save 最终以最后写入为准', async () => {
    const make = (k1, k2, k3) => ({
      sendMessage: { key: k1, ctrl: true, meta: false, shift: false, alt: false },
      focusSearch: { key: k2, ctrl: true, meta: false, shift: false, alt: false },
      clearChat:   { key: k3, ctrl: true, meta: false, shift: false, alt: false },
    });
    await saveShortcuts(make('a', 'b', 'c'));
    await saveShortcuts(make('d', 'e', 'f'));
    await saveShortcuts(make('x', 'y', 'z'));

    const loaded = await getShortcuts();
    assert.equal(loaded.sendMessage.key, 'x');
    assert.equal(loaded.focusSearch.key, 'y');
    assert.equal(loaded.clearChat.key, 'z');
  });
});

// ==================== 触发执行 (matchShortcut 深度) ====================

describe('触发执行 — 三修饰键 Ctrl+Shift+Alt+K 精确匹配', () => {
  it('三修饰键完全匹配时返回 true', () => {
    const binding = { key: 'k', ctrl: true, meta: false, shift: true, alt: true };
    const event = { key: 'k', ctrlKey: true, metaKey: false, shiftKey: true, altKey: true };
    assert.ok(matchShortcut(event, binding));
  });

  it('缺少一个修饰键时返回 false', () => {
    const binding = { key: 'k', ctrl: true, meta: false, shift: true, alt: true };
    const event = { key: 'k', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
    assert.ok(!matchShortcut(event, binding));
  });
});

describe('触发执行 — 功能键 F1/F12 无修饰键直接匹配', () => {
  it('F1 和 F12 无修饰键匹配成功', () => {
    const f1Bind = { key: 'F1', ctrl: false, meta: false, shift: false, alt: false };
    assert.ok(matchShortcut({ key: 'F1', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, f1Bind));

    const f12Bind = { key: 'F12', ctrl: false, meta: false, shift: false, alt: false };
    assert.ok(matchShortcut({ key: 'F12', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, f12Bind));
  });
});

describe('触发执行 — binding 为空字符串/null/undefined 全部返回 false', () => {
  it('空 key、null、undefined 均不匹配', () => {
    const event = { key: 'a', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    assert.ok(!matchShortcut(event, { key: '' }));
    assert.ok(!matchShortcut(event, null));
    assert.ok(!matchShortcut(event, undefined));
  });
});

// ==================== 冲突检测 ====================

describe('冲突检测 — 多 action 轮询与标签匹配', () => {
  const shortcuts = {
    sendMessage: { key: 'Enter', ctrl: true, meta: true, shift: false, alt: false },
    focusSearch: { key: 'k', ctrl: true, meta: true, shift: false, alt: false },
    clearChat:   { key: 'n', ctrl: true, meta: true, shift: false, alt: false },
  };

  it('新绑定与 clearChat 冲突时返回正确的 conflictLabel', () => {
    const result = detectConflict(shortcuts, 'focusSearch', { key: 'n', ctrl: true, meta: true, shift: false, alt: false });
    assert.equal(result.conflict, true);
    assert.equal(result.conflictAction, 'clearChat');
    assert.equal(result.conflictLabel, SHORTCUT_LABELS.clearChat);
  });

  it('新绑定与 sendMessage 冲突时返回 sendMessage 的标签', () => {
    const result = detectConflict(shortcuts, 'clearChat', { key: 'Enter', ctrl: true, meta: true, shift: false, alt: false });
    assert.equal(result.conflict, true);
    assert.equal(result.conflictAction, 'sendMessage');
    assert.equal(result.conflictLabel, '发送消息');
  });
});

describe('冲突检测 — bindingsEqual 全字段缺失视为 false', () => {
  it('只有 key 的对象与完整对象比较缺失修饰键按 false 处理', () => {
    const a = { key: 'k' };
    const b = { key: 'k', ctrl: false, meta: false, shift: false, alt: false };
    assert.ok(bindingsEqual(a, b));
  });

  it('空对象 {} 之间比较返回 true（normalize 后 key 均为空串）', () => {
    // normalize 将 undefined key → '', undefined 修饰键 → false
    // 所以 bindingsEqual({}, {}) === true
    assert.ok(bindingsEqual({}, {}));
  });
});

// ==================== 启用/禁用 ====================

describe('启用/禁用 — captureKeyFromEvent 清除后重新录制', () => {
  it('Backspace 清除得到空 key 绑定，格式化显示「无」', () => {
    const cleared = captureKeyFromEvent({ key: 'Backspace', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
    assert.deepEqual(cleared, { key: '', ctrl: false, meta: false, shift: false, alt: false });
    assert.equal(formatShortcutDisplay(cleared), '无');
  });
});

// ==================== destroy (resetShortcuts 幂等性) ====================

describe('destroy — resetShortcuts 多次调用幂等性', () => {
  let ctx;
  beforeEach(() => { ctx = setupTestEnv(); });

  it('连续调用 3 次 resetShortcuts 结果始终等于 DEFAULT_SHORTCUTS', async () => {
    await resetShortcuts();
    const v1 = await getShortcuts();
    await resetShortcuts();
    const v2 = await getShortcuts();
    await resetShortcuts();
    const v3 = await getShortcuts();

    assert.deepEqual(v1, DEFAULT_SHORTCUTS);
    assert.deepEqual(v2, DEFAULT_SHORTCUTS);
    assert.deepEqual(v3, DEFAULT_SHORTCUTS);
  });
});

describe('destroy — 重置后 storage 中 customShortcuts 等于 DEFAULT_SHORTCUTS', () => {
  let ctx;
  beforeEach(() => { ctx = setupTestEnv(); });

  it('resetShortcuts 后直接读 storage 确认数据正确', async () => {
    await saveShortcuts({
      sendMessage: { key: 'q', ctrl: true, meta: false, shift: false, alt: false },
      focusSearch: { key: 'w', ctrl: true, meta: false, shift: false, alt: false },
      clearChat:   { key: 'e', ctrl: true, meta: false, shift: false, alt: false },
    });
    await resetShortcuts();
    const raw = await chrome.storage.sync.get({ customShortcuts: {} });
    assert.deepEqual(raw.customShortcuts, DEFAULT_SHORTCUTS);
  });
});
