/**
 * 测试 快捷键自定义模块 (R11)
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { setupTestEnv } from './helpers/setup.js';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  CHROME_COMMANDS,
  getShortcuts,
  saveShortcuts,
  resetShortcuts,
  formatShortcutDisplay,
  matchShortcut,
  captureKeyFromEvent,
  detectConflict,
  bindingsEqual,
} from '../lib/shortcuts.js';

// ==================== 数据结构 ====================

describe('快捷键默认配置', () => {
  it('DEFAULT_SHORTCUTS 包含 3 个侧边栏快捷键', () => {
    assert.equal(Object.keys(DEFAULT_SHORTCUTS).length, 3);
    assert.ok(DEFAULT_SHORTCUTS.sendMessage);
    assert.ok(DEFAULT_SHORTCUTS.focusSearch);
    assert.ok(DEFAULT_SHORTCUTS.clearChat);
  });

  it('每个默认快捷键包含 key + 4 个修饰键布尔字段', () => {
    for (const binding of Object.values(DEFAULT_SHORTCUTS)) {
      assert.ok(typeof binding.key === 'string', 'key should be string');
      assert.ok(typeof binding.ctrl === 'boolean', 'ctrl should be boolean');
      assert.ok(typeof binding.meta === 'boolean', 'meta should be boolean');
      assert.ok(typeof binding.shift === 'boolean', 'shift should be boolean');
      assert.ok(typeof binding.alt === 'boolean', 'alt should be boolean');
    }
  });

  it('SHORTCUT_LABELS 包含每个 action 的中文名称', () => {
    for (const action of Object.keys(DEFAULT_SHORTCUTS)) {
      assert.ok(SHORTCUT_LABELS[action], `Missing label for ${action}`);
      assert.ok(SHORTCUT_LABELS[action].length > 0);
    }
  });

  it('CHROME_COMMANDS 包含 3 个 Chrome 全局快捷键', () => {
    assert.equal(CHROME_COMMANDS.length, 3);
    for (const cmd of CHROME_COMMANDS) {
      assert.ok(cmd.command);
      assert.ok(cmd.label);
      assert.ok(cmd.defaultKey);
    }
  });
});

// ==================== 存储操作 ====================

describe('getShortcuts / saveShortcuts / resetShortcuts', () => {
  let ctx;

  beforeEach(() => {
    ctx = setupTestEnv();
  });

  it('getShortcuts 在空存储时返回默认值', async () => {
    const shortcuts = await getShortcuts();
    assert.deepEqual(shortcuts, DEFAULT_SHORTCUTS);
  });

  it('saveShortcuts 保存后 getShortcuts 可读取', async () => {
    const custom = {
      sendMessage: { key: 'Enter', ctrl: true, meta: false, shift: false, alt: false },
      focusSearch: { key: 'f', ctrl: true, meta: false, shift: true, alt: false },
      clearChat:   { key: 'n', ctrl: true, meta: true, shift: false, alt: false },
    };
    await saveShortcuts(custom);
    const loaded = await getShortcuts();
    assert.deepEqual(loaded, custom);
  });

  it('getShortcuts 缺失字段回退默认值', async () => {
    // 保存一个部分配置（只存 focusSearch，缺其他）
    await chrome.storage.sync.set({ customShortcuts: {
      focusSearch: { key: 'f', ctrl: true, meta: false, shift: true, alt: false },
    }});
    const loaded = await getShortcuts();
    // focusSearch 应该是自定义的
    assert.equal(loaded.focusSearch.key, 'f');
    assert.equal(loaded.focusSearch.shift, true);
    // sendMessage 应该是默认值
    assert.equal(loaded.sendMessage.key, 'Enter');
    assert.equal(loaded.sendMessage.ctrl, true);
    assert.equal(loaded.sendMessage.meta, true);
    // clearChat 应该是默认值
    assert.equal(loaded.clearChat.key, 'n');
  });

  it('getShortcuts 回退缺失的单个修饰键字段', async () => {
    await chrome.storage.sync.set({ customShortcuts: {
      sendMessage: { key: 'Enter' },
      // ctrl, meta, shift, alt 全部缺失
    }});
    const loaded = await getShortcuts();
    // 缺失字段回退到默认值
    assert.equal(loaded.sendMessage.ctrl, true);
    assert.equal(loaded.sendMessage.meta, true);
    assert.equal(loaded.sendMessage.shift, false);
    assert.equal(loaded.sendMessage.alt, false);
  });

  it('resetShortcuts 恢复出厂默认值', async () => {
    // 先自定义
    await saveShortcuts({
      sendMessage: { key: 's', ctrl: true, meta: false, shift: true, alt: false },
      focusSearch: { key: 'f', ctrl: true, meta: false, shift: true, alt: false },
      clearChat:   { key: 'd', ctrl: true, meta: false, shift: true, alt: false },
    });
    // 重置
    await resetShortcuts();
    const loaded = await getShortcuts();
    assert.deepEqual(loaded, DEFAULT_SHORTCUTS);
  });
});

// ==================== formatShortcutDisplay ====================

describe('formatShortcutDisplay', () => {
  it('格式化 Ctrl+K', () => {
    assert.equal(
      formatShortcutDisplay({ key: 'k', ctrl: true, meta: false, shift: false, alt: false }),
      'Ctrl+K'
    );
  });

  it('格式化 Ctrl+Shift+Enter', () => {
    assert.equal(
      formatShortcutDisplay({ key: 'Enter', ctrl: true, meta: false, shift: true, alt: false }),
      'Ctrl+Shift+Enter'
    );
  });

  it('格式化 Alt+F5', () => {
    assert.equal(
      formatShortcutDisplay({ key: 'F5', ctrl: false, meta: false, shift: false, alt: true }),
      'Alt+F5'
    );
  });

  it('格式化 Meta+K（⌘ 键）', () => {
    assert.equal(
      formatShortcutDisplay({ key: 'k', ctrl: false, meta: true, shift: false, alt: false }),
      'Meta+K'
    );
  });

  it('单字母 key 自动大写', () => {
    assert.equal(
      formatShortcutDisplay({ key: 'a', ctrl: true, meta: false, shift: false, alt: false }),
      'Ctrl+A'
    );
  });

  it('保留功能键名原样', () => {
    assert.equal(
      formatShortcutDisplay({ key: 'F1', ctrl: false, meta: false, shift: false, alt: false }),
      'F1'
    );
  });

  it('Space 键显示为 Space', () => {
    assert.equal(
      formatShortcutDisplay({ key: ' ', ctrl: true, meta: false, shift: false, alt: false }),
      'Ctrl+Space'
    );
  });

  it('null 或无 key 显示「无」', () => {
    assert.equal(formatShortcutDisplay(null), '无');
    assert.equal(formatShortcutDisplay({ key: '' }), '无');
    assert.equal(formatShortcutDisplay({}), '无');
  });

  it('Enter 键名保留原样', () => {
    assert.equal(
      formatShortcutDisplay({ key: 'Enter', ctrl: true, meta: true, shift: false, alt: false }),
      'Ctrl+Meta+Enter'
    );
  });
});

// ==================== matchShortcut ====================

describe('matchShortcut', () => {
  it('匹配 Ctrl+K 事件', () => {
    const event = { key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    const binding = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    assert.ok(matchShortcut(event, binding));
  });

  it('key 不匹配时返回 false', () => {
    const event = { key: 'j', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    const binding = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    assert.ok(!matchShortcut(event, binding));
  });

  it('大小写不敏感（单字母）', () => {
    const event = { key: 'K', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    const binding = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    assert.ok(matchShortcut(event, binding));
  });

  it('缺少必要修饰键时返回 false', () => {
    const event = { key: 'k', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    const binding = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    assert.ok(!matchShortcut(event, binding));
  });

  it('event 有多余修饰键时返回 false', () => {
    const event = { key: 'k', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
    const binding = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    assert.ok(!matchShortcut(event, binding));
  });

  it('Meta+K 匹配 metaKey', () => {
    const event = { key: 'k', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false };
    const binding = { key: 'k', ctrl: false, meta: true, shift: false, alt: false };
    assert.ok(matchShortcut(event, binding));
  });

  it('Ctrl+Meta+Enter 匹配双修饰键', () => {
    const event = { key: 'Enter', ctrlKey: true, metaKey: true, shiftKey: false, altKey: false };
    const binding = { key: 'Enter', ctrl: true, meta: true, shift: false, alt: false };
    assert.ok(matchShortcut(event, binding));
  });

  it('F12 单键匹配', () => {
    const event = { key: 'F12', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    const binding = { key: 'F12', ctrl: false, meta: false, shift: false, alt: false };
    assert.ok(matchShortcut(event, binding));
  });

  it('null binding 返回 false', () => {
    const event = { key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    assert.ok(!matchShortcut(event, null));
    assert.ok(!matchShortcut(event, { key: '' }));
  });
});

// ==================== captureKeyFromEvent ====================

describe('captureKeyFromEvent', () => {
  it('Escape 返回 null（取消录制）', () => {
    const event = { key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(captureKeyFromEvent(event), null);
  });

  it('Backspace 返回空 key（清除绑定）', () => {
    const event = { key: 'Backspace', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    const result = captureKeyFromEvent(event);
    assert.equal(result.key, '');
    assert.equal(result.ctrl, false);
  });

  it('Delete 返回空 key（清除绑定）', () => {
    const event = { key: 'Delete', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    const result = captureKeyFromEvent(event);
    assert.equal(result.key, '');
  });

  it('Ctrl+K 捕获成功', () => {
    const event = { key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    const result = captureKeyFromEvent(event);
    assert.equal(result.key, 'k');
    assert.equal(result.ctrl, true);
    assert.equal(result.meta, false);
  });

  it('Ctrl+Shift+F 捕获成功', () => {
    const event = { key: 'f', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
    const result = captureKeyFromEvent(event);
    assert.equal(result.key, 'f');
    assert.equal(result.ctrl, true);
    assert.equal(result.shift, true);
  });

  it('F12 单键（功能键）捕获成功', () => {
    const event = { key: 'F12', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    const result = captureKeyFromEvent(event);
    assert.equal(result.key, 'F12');
    assert.equal(result.ctrl, false);
  });

  it('无修饰键的单字母返回 null（防止误触）', () => {
    const event = { key: 'a', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(captureKeyFromEvent(event), null);
  });

  it('无修饰键的数字返回 null', () => {
    const event = { key: '5', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(captureKeyFromEvent(event), null);
  });

  it('Shift+单字母返回 null（Shift 不算有效修饰键用于防误触）', () => {
    const event = { key: 'A', ctrlKey: false, metaKey: false, shiftKey: true, altKey: false };
    assert.equal(captureKeyFromEvent(event), null);
  });

  it('Ctrl+Enter 捕获成功', () => {
    const event = { key: 'Enter', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    const result = captureKeyFromEvent(event);
    assert.equal(result.key, 'Enter');
    assert.equal(result.ctrl, true);
  });

  it('Alt+Shift+T 捕获成功', () => {
    const event = { key: 't', ctrlKey: false, metaKey: false, shiftKey: true, altKey: true };
    const result = captureKeyFromEvent(event);
    assert.equal(result.key, 't');
    assert.equal(result.alt, true);
    assert.equal(result.shift, true);
  });
});

// ==================== detectConflict ====================

describe('detectConflict', () => {
  const shortcuts = {
    sendMessage: { key: 'Enter', ctrl: true, meta: true, shift: false, alt: false },
    focusSearch: { key: 'k', ctrl: true, meta: true, shift: false, alt: false },
    clearChat:   { key: 'n', ctrl: true, meta: true, shift: false, alt: false },
  };

  it('无冲突时返回 conflict=false', () => {
    const newBinding = { key: 'f', ctrl: true, meta: false, shift: true, alt: false };
    const result = detectConflict(shortcuts, 'focusSearch', newBinding);
    assert.equal(result.conflict, false);
    assert.equal(result.conflictAction, null);
  });

  it('与另一 action 冲突时返回 conflict=true', () => {
    const newBinding = { key: 'n', ctrl: true, meta: true, shift: false, alt: false };
    const result = detectConflict(shortcuts, 'focusSearch', newBinding);
    assert.equal(result.conflict, true);
    assert.equal(result.conflictAction, 'clearChat');
    assert.equal(result.conflictLabel, '清空对话');
  });

  it('排除正在修改的 action 自身不算冲突', () => {
    const newBinding = { key: 'k', ctrl: true, meta: true, shift: false, alt: false };
    const result = detectConflict(shortcuts, 'focusSearch', newBinding);
    assert.equal(result.conflict, false);
  });

  it('null binding 不算冲突', () => {
    const result = detectConflict(shortcuts, 'focusSearch', null);
    assert.equal(result.conflict, false);
  });

  it('空 key 不算冲突', () => {
    const result = detectConflict(shortcuts, 'focusSearch', { key: '', ctrl: false, meta: false, shift: false, alt: false });
    assert.equal(result.conflict, false);
  });
});

// ==================== bindingsEqual ====================

describe('bindingsEqual', () => {
  it('相同绑定返回 true', () => {
    const a = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    const b = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    assert.ok(bindingsEqual(a, b));
  });

  it('不同 key 返回 false', () => {
    const a = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    const b = { key: 'j', ctrl: true, meta: false, shift: false, alt: false };
    assert.ok(!bindingsEqual(a, b));
  });

  it('不同修饰键返回 false', () => {
    const a = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    const b = { key: 'k', ctrl: false, meta: true, shift: false, alt: false };
    assert.ok(!bindingsEqual(a, b));
  });

  it('大小写不敏感', () => {
    const a = { key: 'K', ctrl: true, meta: false, shift: false, alt: false };
    const b = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    assert.ok(bindingsEqual(a, b));
  });

  it('缺失字段视为 false', () => {
    const a = { key: 'k', ctrl: true };
    const b = { key: 'k', ctrl: true, meta: false, shift: false, alt: false };
    assert.ok(bindingsEqual(a, b));
  });

  it('null 参数返回 false', () => {
    assert.ok(!bindingsEqual(null, { key: 'k' }));
    assert.ok(!bindingsEqual({ key: 'k' }, null));
    assert.ok(!bindingsEqual(null, null));
  });
});

// ==================== sidebar.js 集成验证 ====================

describe('sidebar.js — 快捷键动态匹配集成', () => {
  let js;

  before(() => {
    js = readFileSync('sidebar/sidebar.js', 'utf-8');
  });

  it('sidebar.js 导入 shortcuts 模块', () => {
    assert.ok(js.includes("from '../lib/shortcuts.js'"), 'Should import shortcuts module');
  });

  it('sidebar.js 导入 getShortcuts', () => {
    assert.ok(js.includes('getShortcuts'));
  });

  it('bindEvents 中使用 matchShortcut 做动态匹配', () => {
    assert.ok(js.includes('matchShortcut'), 'Should use matchShortcut for dynamic key matching');
  });

  it('不再硬编码 e.key === \'k\' 匹配', () => {
    // 旧的硬编码方式应该被替换
    assert.ok(!js.includes("e.key === 'k' && (e.ctrlKey || e.metaKey)"),
      'Should not have hardcoded Ctrl+K check');
  });

  it('不再硬编码 e.key === \'n\' 匹配', () => {
    assert.ok(!js.includes("e.key === 'n' && (e.ctrlKey || e.metaKey)"),
      'Should not have hardcoded Ctrl+N check');
  });

  it('init 或 loadSettings 中加载快捷键配置', () => {
    assert.ok(js.includes('this.shortcuts'), 'Sidebar should store shortcuts on instance');
  });

  it('加载快捷键后重新绑定事件', () => {
    assert.ok(js.includes('loadShortcuts'), 'Should have loadShortcuts method');
  });
});

// ==================== options.html 集成验证 ====================

describe('options.html — 快捷键设置区域', () => {
  let html;

  before(() => {
    html = readFileSync('options/options.html', 'utf-8');
  });

  it('包含快捷键 section', () => {
    assert.ok(html.includes('快捷键'), 'Should have shortcuts section');
  });

  it('包含 Chrome 全局快捷键引导', () => {
    assert.ok(html.includes('chrome://extensions/shortcuts'), 'Should link to Chrome shortcuts page');
  });

  it('包含恢复默认按钮', () => {
    assert.ok(html.includes('btnResetShortcuts') || html.includes('恢复默认'),
      'Should have reset shortcuts button');
  });
});

// ==================== options.js 集成验证 ====================

describe('options.js — 快捷键设置逻辑', () => {
  let js;

  before(() => {
    js = readFileSync('options/options.js', 'utf-8');
  });

  it('导入 shortcuts 模块', () => {
    assert.ok(js.includes("from '../lib/shortcuts.js'") || js.includes('shortcuts'));
  });

  it('使用 getShortcuts 加载配置', () => {
    assert.ok(js.includes('getShortcuts'));
  });

  it('使用 saveShortcuts 保存配置', () => {
    assert.ok(js.includes('saveShortcuts'));
  });

  it('使用 resetShortcuts 恢复默认', () => {
    assert.ok(js.includes('resetShortcuts'));
  });

  it('使用 captureKeyFromEvent 捕获按键', () => {
    assert.ok(js.includes('captureKeyFromEvent'));
  });

  it('使用 detectConflict 检测冲突', () => {
    assert.ok(js.includes('detectConflict'));
  });

  it('使用 formatShortcutDisplay 格式化显示', () => {
    assert.ok(js.includes('formatShortcutDisplay'));
  });
});

// ==================== options.css 集成验证 ====================

describe('options.css — 快捷键样式', () => {
  let css;

  before(() => {
    css = readFileSync('options/options.css', 'utf-8');
  });

  it('包含快捷键相关样式类', () => {
    assert.ok(
      css.includes('shortcut') || css.includes('keybind'),
      'Should have shortcut-related CSS classes'
    );
  });
});
