/**
 * 测试 lib/bookmark-keyboard-shortcuts.js — BookmarkKeyboardShortcuts
 *
 * 书签图谱面板快捷键管理:
 *   - 默认绑定定义 (搜索/缩放/刷新)
 *   - 事件匹配 matchAction
 *   - 注册/分发 on/off/dispatch
 *   - 自定义绑定 (get/set/reset)
 *   - 冲突检测
 *   - 快捷键禁用/启用
 *
 * AC: 单元测试 ≥ 20 个用例
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

const {
  BookmarkKeyboardShortcuts,
  DEFAULT_GRAPH_SHORTCUTS,
  GRAPH_SHORTCUT_LABELS,
  GRAPH_SHORTCUT_CATEGORIES,
} = await import('../lib/bookmark-keyboard-shortcuts.js');

// ==================== 常量导出 ====================

describe('DEFAULT_GRAPH_SHORTCUTS', () => {
  it('导出 DEFAULT_GRAPH_SHORTCUTS 对象', () => {
    assert.ok(DEFAULT_GRAPH_SHORTCUTS);
    assert.equal(typeof DEFAULT_GRAPH_SHORTCUTS, 'object');
  });

  it('包含 5 个快捷键动作', () => {
    const keys = Object.keys(DEFAULT_GRAPH_SHORTCUTS);
    assert.equal(keys.length, 5);
    assert.ok(keys.includes('search'));
    assert.ok(keys.includes('zoomIn'));
    assert.ok(keys.includes('zoomOut'));
    assert.ok(keys.includes('resetZoom'));
    assert.ok(keys.includes('refresh'));
  });

  it('每个绑定包含 key + 4 个修饰键布尔字段', () => {
    for (const binding of Object.values(DEFAULT_GRAPH_SHORTCUTS)) {
      assert.equal(typeof binding.key, 'string', 'key should be string');
      assert.equal(typeof binding.ctrl, 'boolean', 'ctrl should be boolean');
      assert.equal(typeof binding.meta, 'boolean', 'meta should be boolean');
      assert.equal(typeof binding.shift, 'boolean', 'shift should be boolean');
      assert.equal(typeof binding.alt, 'boolean', 'alt should be boolean');
    }
  });

  it('search 默认 Ctrl+F', () => {
    const s = DEFAULT_GRAPH_SHORTCUTS.search;
    assert.equal(s.key, 'f');
    assert.equal(s.ctrl, true);
  });

  it('zoomIn 默认 = (加号键)', () => {
    const z = DEFAULT_GRAPH_SHORTCUTS.zoomIn;
    assert.equal(z.key, '=');
    assert.equal(z.ctrl, false);
  });

  it('zoomOut 默认 - (减号键)', () => {
    const z = DEFAULT_GRAPH_SHORTCUTS.zoomOut;
    assert.equal(z.key, '-');
    assert.equal(z.ctrl, false);
  });

  it('resetZoom 默认 0', () => {
    const z = DEFAULT_GRAPH_SHORTCUTS.resetZoom;
    assert.equal(z.key, '0');
    assert.equal(z.ctrl, false);
  });

  it('refresh 默认 F5', () => {
    const r = DEFAULT_GRAPH_SHORTCUTS.refresh;
    assert.equal(r.key, 'F5');
    assert.equal(r.ctrl, false);
  });
});

describe('GRAPH_SHORTCUT_LABELS', () => {
  it('每个 action 有中文标签', () => {
    for (const action of Object.keys(DEFAULT_GRAPH_SHORTCUTS)) {
      assert.ok(GRAPH_SHORTCUT_LABELS[action], `Missing label for ${action}`);
      assert.ok(GRAPH_SHORTCUT_LABELS[action].length > 0);
    }
  });
});

describe('GRAPH_SHORTCUT_CATEGORIES', () => {
  it('包含搜索、缩放、刷新三个分类', () => {
    assert.ok(GRAPH_SHORTCUT_CATEGORIES.search);
    assert.ok(GRAPH_SHORTCUT_CATEGORIES.zoom);
    assert.ok(GRAPH_SHORTCUT_CATEGORIES.refresh);
  });

  it('每个分类包含对应 action 列表', () => {
    assert.ok(Array.isArray(GRAPH_SHORTCUT_CATEGORIES.search.actions));
    assert.ok(GRAPH_SHORTCUT_CATEGORIES.search.actions.includes('search'));
    assert.ok(GRAPH_SHORTCUT_CATEGORIES.zoom.actions.includes('zoomIn'));
    assert.ok(GRAPH_SHORTCUT_CATEGORIES.zoom.actions.includes('zoomOut'));
    assert.ok(GRAPH_SHORTCUT_CATEGORIES.zoom.actions.includes('resetZoom'));
    assert.ok(GRAPH_SHORTCUT_CATEGORIES.refresh.actions.includes('refresh'));
  });
});

// ==================== 构造与状态 ====================

describe('BookmarkKeyboardShortcuts — constructor', () => {
  let ctx;

  beforeEach(() => {
    ctx = setupTestEnv();
  });

  it('默认 enabled = true', () => {
    const ks = new BookmarkKeyboardShortcuts();
    assert.equal(ks.isEnabled(), true);
  });

  it('可通过构造函数参数禁用', () => {
    const ks = new BookmarkKeyboardShortcuts({ enabled: false });
    assert.equal(ks.isEnabled(), false);
  });
});

// ==================== enable / disable ====================

describe('BookmarkKeyboardShortcuts — enable/disable', () => {
  let ks;

  beforeEach(() => {
    ks = new BookmarkKeyboardShortcuts();
  });

  it('disable() 设置 enabled=false', () => {
    ks.disable();
    assert.equal(ks.isEnabled(), false);
  });

  it('enable() 恢复 enabled=true', () => {
    ks.disable();
    ks.enable();
    assert.equal(ks.isEnabled(), true);
  });

  it('重复 enable 不报错', () => {
    ks.enable();
    ks.enable();
    assert.equal(ks.isEnabled(), true);
  });
});

// ==================== matchAction ====================

describe('BookmarkKeyboardShortcuts — matchAction', () => {
  let ks;

  beforeEach(() => {
    ks = new BookmarkKeyboardShortcuts();
  });

  it('Ctrl+F 匹配 search', () => {
    const event = { key: 'f', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(ks.matchAction(event), 'search');
  });

  it('= 键匹配 zoomIn', () => {
    const event = { key: '=', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(ks.matchAction(event), 'zoomIn');
  });

  it('+ 键匹配 zoomIn（Shift+= 产生的 + 也匹配）', () => {
    const event = { key: '+', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(ks.matchAction(event), 'zoomIn');
  });

  it('- 键匹配 zoomOut', () => {
    const event = { key: '-', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(ks.matchAction(event), 'zoomOut');
  });

  it('0 键匹配 resetZoom', () => {
    const event = { key: '0', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(ks.matchAction(event), 'resetZoom');
  });

  it('F5 匹配 refresh', () => {
    const event = { key: 'F5', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(ks.matchAction(event), 'refresh');
  });

  it('不匹配的键返回 null', () => {
    const event = { key: 'x', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(ks.matchAction(event), null);
  });

  it('Ctrl+F 中多余 Shift 不匹配', () => {
    const event = { key: 'f', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
    assert.equal(ks.matchAction(event), null);
  });

  it('disabled 时返回 null', () => {
    ks.disable();
    const event = { key: 'f', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(ks.matchAction(event), null);
  });
});

// ==================== on / off 注册回调 ====================

describe('BookmarkKeyboardShortcuts — on/off', () => {
  let ks;

  beforeEach(() => {
    ks = new BookmarkKeyboardShortcuts();
  });

  it('注册回调后 dispatch 触发', () => {
    let called = false;
    ks.on('search', () => { called = true; });
    ks.dispatch('search');
    assert.equal(called, true);
  });

  it('同一 action 可注册多个回调', () => {
    let count = 0;
    ks.on('search', () => { count++; });
    ks.on('search', () => { count++; });
    ks.dispatch('search');
    assert.equal(count, 2);
  });

  it('off 移除指定回调', () => {
    let count = 0;
    const cb = () => { count++; };
    ks.on('search', cb);
    ks.off('search', cb);
    ks.dispatch('search');
    assert.equal(count, 0);
  });

  it('off 移除不存在的回调不报错', () => {
    ks.off('search', () => {});
    assert.ok(true);
  });

  it('dispatch 传入 action 参数给回调', () => {
    let receivedAction = null;
    ks.on('zoomIn', (action) => { receivedAction = action; });
    ks.dispatch('zoomIn');
    assert.equal(receivedAction, 'zoomIn');
  });
});

// ==================== handleEvent 综合 ====================

describe('BookmarkKeyboardShortcuts — handleEvent', () => {
  let ks;

  beforeEach(() => {
    ks = new BookmarkKeyboardShortcuts();
  });

  it('handleEvent 匹配并分发', () => {
    let dispatched = null;
    ks.on('search', (action) => { dispatched = action; });
    const event = { key: 'f', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    const result = ks.handleEvent(event);
    assert.equal(result, 'search');
    assert.equal(dispatched, 'search');
  });

  it('handleEvent 不匹配返回 null 且不分发', () => {
    let dispatched = false;
    ks.on('search', () => { dispatched = true; });
    const event = { key: 'z', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    const result = ks.handleEvent(event);
    assert.equal(result, null);
    assert.equal(dispatched, false);
  });

  it('handleEvent disabled 时返回 null', () => {
    ks.disable();
    let dispatched = false;
    ks.on('search', () => { dispatched = true; });
    const event = { key: 'f', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    const result = ks.handleEvent(event);
    assert.equal(result, null);
    assert.equal(dispatched, false);
  });
});

// ==================== getBindings / setBinding ====================

describe('BookmarkKeyboardShortcuts — getBindings/setBinding', () => {
  let ctx;
  let ks;

  beforeEach(() => {
    ctx = setupTestEnv();
    ks = new BookmarkKeyboardShortcuts();
  });

  it('getBindings 默认返回 DEFAULT_GRAPH_SHORTCUTS 副本', async () => {
    const bindings = await ks.getBindings();
    assert.deepEqual(bindings, DEFAULT_GRAPH_SHORTCUTS);
  });

  it('setBinding 修改单个绑定', async () => {
    await ks.setBinding('search', { key: 'f', ctrl: false, meta: true, shift: false, alt: false });
    const bindings = await ks.getBindings();
    assert.equal(bindings.search.meta, true);
    assert.equal(bindings.search.ctrl, false);
  });

  it('setBinding 保留其他绑定不变', async () => {
    await ks.setBinding('search', { key: 'j', ctrl: true, meta: false, shift: false, alt: false });
    const bindings = await ks.getBindings();
    assert.equal(bindings.zoomIn.key, '=');
    assert.equal(bindings.refresh.key, 'F5');
  });

  it('resetBindings 恢复默认值', async () => {
    await ks.setBinding('search', { key: 'j', ctrl: true, meta: false, shift: false, alt: false });
    await ks.resetBindings();
    const bindings = await ks.getBindings();
    assert.deepEqual(bindings, DEFAULT_GRAPH_SHORTCUTS);
  });

  it('setBinding 对不存在的 action 不影响其他绑定', async () => {
    await ks.setBinding('unknown', { key: 'z', ctrl: true, meta: false, shift: false, alt: false });
    const bindings = await ks.getBindings();
    assert.deepEqual(bindings, DEFAULT_GRAPH_SHORTCUTS);
  });
});

// ==================== 冲突检测 ====================

describe('BookmarkKeyboardShortcuts — detectConflict', () => {
  let ctx;
  let ks;

  beforeEach(() => {
    ctx = setupTestEnv();
    ks = new BookmarkKeyboardShortcuts();
  });

  it('新绑定与已有绑定冲突时返回 true', async () => {
    const result = await ks.detectConflict('zoomOut', DEFAULT_GRAPH_SHORTCUTS.search);
    assert.equal(result.conflict, true);
    assert.equal(result.conflictAction, 'search');
  });

  it('新绑定无冲突时返回 false', async () => {
    const newBinding = { key: 'g', ctrl: true, meta: false, shift: false, alt: false };
    const result = await ks.detectConflict('search', newBinding);
    assert.equal(result.conflict, false);
  });

  it('修改自身绑定不算冲突', async () => {
    const result = await ks.detectConflict('search', DEFAULT_GRAPH_SHORTCUTS.search);
    assert.equal(result.conflict, false);
  });

  it('null binding 不算冲突', async () => {
    const result = await ks.detectConflict('search', null);
    assert.equal(result.conflict, false);
  });
});

// ==================== 格式化显示 ====================

describe('BookmarkKeyboardShortcuts — formatBinding', () => {
  it('格式化 Ctrl+F', () => {
    const ks = new BookmarkKeyboardShortcuts();
    const display = ks.formatBinding({ key: 'f', ctrl: true, meta: false, shift: false, alt: false });
    assert.equal(display, 'Ctrl+F');
  });

  it('格式化 F5', () => {
    const ks = new BookmarkKeyboardShortcuts();
    const display = ks.formatBinding({ key: 'F5', ctrl: false, meta: false, shift: false, alt: false });
    assert.equal(display, 'F5');
  });

  it('null 绑定显示 无', () => {
    const ks = new BookmarkKeyboardShortcuts();
    assert.equal(ks.formatBinding(null), '无');
  });
});

// ==================== getShortcutsSummary ====================

describe('BookmarkKeyboardShortcuts — getShortcutsSummary', () => {
  let ctx;

  beforeEach(() => {
    ctx = setupTestEnv();
  });

  it('返回每个 action 的标签和格式化绑定', async () => {
    const ks = new BookmarkKeyboardShortcuts();
    const summary = await ks.getShortcutsSummary();
    assert.ok(Array.isArray(summary));
    assert.equal(summary.length, 5);

    const searchEntry = summary.find(s => s.action === 'search');
    assert.ok(searchEntry);
    assert.equal(searchEntry.label, '搜索');
    assert.equal(searchEntry.display, 'Ctrl+F');
    assert.equal(searchEntry.category, 'search');
  });

  it('summary 包含 category 字段', async () => {
    const ks = new BookmarkKeyboardShortcuts();
    const summary = await ks.getShortcutsSummary();
    for (const entry of summary) {
      assert.ok(entry.category, `Missing category for ${entry.action}`);
    }
  });
});

// ==================== destroy ====================

describe('BookmarkKeyboardShortcuts — destroy', () => {
  it('destroy 后回调被清除', () => {
    const ks = new BookmarkKeyboardShortcuts();
    let called = false;
    ks.on('search', () => { called = true; });
    ks.destroy();
    ks.dispatch('search');
    assert.equal(called, false);
  });
});
