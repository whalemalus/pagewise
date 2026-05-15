import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ContextMenuManager,
  MENU_DEFINITIONS,
  ACTION_MAP,
} from '../lib/context-menu.js';
import { logInfo, logError, logWarn, getLogs, getLogsByModule, clearLogs } from '../lib/log-store.js';
import { logDebug } from '../lib/log-store.js';

beforeEach(() => { clearLogs(); });

// ==================== ContextMenuManager Tests ====================

describe('ContextMenuManager — 菜单注册', () => {
  it('应创建 ContextMenuManager 实例', () => {
    const mgr = new ContextMenuManager();
    assert.ok(mgr);
    assert.equal(mgr.registered, false);
    assert.equal(mgr.count, 0);
  });

  it('registerMenus() 应注册 7 个菜单项', () => {
    const created = [];
    const mgr = new ContextMenuManager({
      createFn: (props) => { created.push(props); return props.id; },
    });
    mgr.registerMenus();

    assert.equal(mgr.count, 7);
    assert.equal(created.length, 7);
    assert.ok(mgr.registered);
  });

  it('registerMenus() 幂等：重复调用不应创建额外菜单项', () => {
    let createCount = 0;
    const mgr = new ContextMenuManager({
      createFn: (props) => { createCount++; return props.id; },
    });
    mgr.registerMenus();
    mgr.registerMenus(); // 第二次调用

    assert.equal(createCount, 7); // 只创建一次
    assert.equal(mgr.count, 7);
    // 应记录 warn 日志
    const warns = getLogs().filter(l => l.level === 'warn');
    assert.ok(warns.some(l => l.message.includes('重复注册')));
  });

  it('选中文本菜单项应有 3 个 (explain/translate/summarize)', () => {
    const selectionItems = MENU_DEFINITIONS.filter(d => d.contexts.includes('selection'));
    assert.equal(selectionItems.length, 3);

    const ids = selectionItems.map(d => d.id);
    assert.ok(ids.includes('pagewise-explain'));
    assert.ok(ids.includes('pagewise-translate'));
    assert.ok(ids.includes('pagewise-summarize'));
  });

  it('图片菜单项应有 2 个 (ocr/describe)', () => {
    const imageItems = MENU_DEFINITIONS.filter(d => d.contexts.includes('image'));
    assert.equal(imageItems.length, 2);

    const ids = imageItems.map(d => d.id);
    assert.ok(ids.includes('pagewise-ocr'));
    assert.ok(ids.includes('pagewise-describe-image'));
  });

  it('链接菜单项应有 2 个 (preview/bookmark)', () => {
    const linkItems = MENU_DEFINITIONS.filter(d => d.contexts.includes('link'));
    assert.equal(linkItems.length, 2);

    const ids = linkItems.map(d => d.id);
    assert.ok(ids.includes('pagewise-preview-link'));
    assert.ok(ids.includes('pagewise-save-bookmark'));
  });
});

describe('ContextMenuManager — 点击处理', () => {
  it('选中"解释"应触发 contextMenuExplain 动作', () => {
    let capturedAction = null;
    const mgr = new ContextMenuManager({
      createFn: (props) => props.id,
      onAction: (action) => { capturedAction = action; },
    });
    mgr.registerMenus();

    const data = mgr._handleClick(
      { menuItemId: 'pagewise-explain', selectionText: 'hello world' },
      { id: 1, url: 'https://example.com', title: 'Test' }
    );

    assert.equal(capturedAction, 'contextMenuExplain');
    assert.equal(data.action, 'contextMenuExplain');
    assert.equal(data.selection, 'hello world');
    assert.equal(data.type, 'selection');
  });

  it('选中"翻译"应触发 contextMenuTranslate', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();

    const data = mgr._handleClick(
      { menuItemId: 'pagewise-translate', selectionText: '翻译这段文字' },
      { id: 2, url: 'https://example.com', title: 'Test' }
    );

    assert.equal(data.action, 'contextMenuTranslate');
    assert.equal(data.selection, '翻译这段文字');
  });

  it('选中"总结"应触发 contextMenuSummarize', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();

    const data = mgr._handleClick(
      { menuItemId: 'pagewise-summarize', selectionText: '需要总结的段落' },
      { id: 3, url: 'https://example.com', title: 'Test' }
    );

    assert.equal(data.action, 'contextMenuSummarize');
    assert.equal(data.selection, '需要总结的段落');
  });

  it('图片"识别文字"应触发 contextMenuOCR', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();

    const data = mgr._handleClick(
      { menuItemId: 'pagewise-ocr', srcUrl: 'https://example.com/img.png', pageUrl: 'https://example.com' },
      { id: 4, url: 'https://example.com', title: 'Test' }
    );

    assert.equal(data.action, 'contextMenuOCR');
    assert.equal(data.imageUrl, 'https://example.com/img.png');
    assert.equal(data.type, 'image');
  });

  it('图片"描述图片"应触发 contextMenuDescribeImage', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();

    const data = mgr._handleClick(
      { menuItemId: 'pagewise-describe-image', srcUrl: 'https://example.com/photo.jpg', pageUrl: 'https://example.com' },
      { id: 5, url: 'https://example.com', title: 'Test' }
    );

    assert.equal(data.action, 'contextMenuDescribeImage');
    assert.equal(data.imageUrl, 'https://example.com/photo.jpg');
    assert.equal(data.type, 'image');
  });

  it('链接"预览链接"应触发 contextMenuPreviewLink', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();

    const data = mgr._handleClick(
      { menuItemId: 'pagewise-preview-link', linkUrl: 'https://example.com/article', linkText: '示例文章' },
      { id: 6, url: 'https://example.com', title: 'Test' }
    );

    assert.equal(data.action, 'contextMenuPreviewLink');
    assert.equal(data.linkUrl, 'https://example.com/article');
    assert.equal(data.linkText, '示例文章');
    assert.equal(data.type, 'link');
  });

  it('链接"保存书签"应触发 contextMenuSaveBookmark', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();

    const data = mgr._handleClick(
      { menuItemId: 'pagewise-save-bookmark', linkUrl: 'https://example.com/page', linkText: '要收藏的页面' },
      { id: 7, url: 'https://example.com', title: 'Test' }
    );

    assert.equal(data.action, 'contextMenuSaveBookmark');
    assert.equal(data.linkUrl, 'https://example.com/page');
    assert.equal(data.type, 'link');
  });

  it('未知菜单项应返回 null 并记录 warn', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();

    const data = mgr._handleClick(
      { menuItemId: 'unknown-item', selectionText: 'test' },
      { id: 1, url: '', title: '' }
    );

    assert.equal(data, null);
    const warns = getLogs().filter(l => l.level === 'warn');
    assert.ok(warns.some(l => l.message.includes('未知菜单项')));
  });
});

describe('ContextMenuManager — 查询与工具方法', () => {
  it('getItemsByContext("selection") 应返回 3 项', () => {
    const mgr = new ContextMenuManager();
    const items = mgr.getItemsByContext('selection');
    assert.equal(items.length, 3);
    items.forEach(item => assert.ok(item.contexts.includes('selection')));
  });

  it('getItemsByGroup("image") 应返回 2 项', () => {
    const mgr = new ContextMenuManager();
    const items = mgr.getItemsByGroup('image');
    assert.equal(items.length, 2);
    items.forEach(item => assert.equal(item.group, 'image'));
  });

  it('getAction 应正确映射菜单项 ID 到动作名', () => {
    const mgr = new ContextMenuManager();
    assert.equal(mgr.getAction('pagewise-explain'), 'contextMenuExplain');
    assert.equal(mgr.getAction('pagewise-translate'), 'contextMenuTranslate');
    assert.equal(mgr.getAction('pagewise-summarize'), 'contextMenuSummarize');
    assert.equal(mgr.getAction('pagewise-ocr'), 'contextMenuOCR');
    assert.equal(mgr.getAction('pagewise-describe-image'), 'contextMenuDescribeImage');
    assert.equal(mgr.getAction('pagewise-preview-link'), 'contextMenuPreviewLink');
    assert.equal(mgr.getAction('pagewise-save-bookmark'), 'contextMenuSaveBookmark');
    assert.equal(mgr.getAction('nonexistent'), undefined);
  });

  it('MENU_DEFINITIONS 静态属性应返回所有 7 项定义', () => {
    const defs = ContextMenuManager.MENU_DEFINITIONS;
    assert.equal(defs.length, 7);
    // 验证每个定义都有必要字段
    for (const def of defs) {
      assert.ok(def.id, `菜单项缺少 id`);
      assert.ok(def.title, `菜单项 ${def.id} 缺少 title`);
      assert.ok(Array.isArray(def.contexts), `菜单项 ${def.id} 的 contexts 不是数组`);
      assert.ok(def.contexts.length > 0, `菜单项 ${def.id} 的 contexts 为空`);
      assert.ok(def.group, `菜单项 ${def.id} 缺少 group`);
    }
  });

  it('ACTION_MAP 静态属性应映射所有 7 个菜单项', () => {
    const map = ContextMenuManager.ACTION_MAP;
    assert.equal(Object.keys(map).length, 7);
    assert.ok(Object.values(map).every(v => typeof v === 'string'));
  });

  it('sendMessage 回调应在点击时被调用', () => {
    const sent = [];
    const mgr = new ContextMenuManager({
      createFn: (p) => p.id,
      sendMessage: (data) => sent.push(data),
    });
    mgr.registerMenus();

    mgr._handleClick(
      { menuItemId: 'pagewise-explain', selectionText: 'some text' },
      { id: 1, url: 'https://example.com', title: 'Test' }
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].action, 'contextMenuExplain');
    assert.equal(sent[0].source, 'contextMenu');
    assert.equal(sent[0].selection, 'some text');
  });

  it('eventLog 应记录所有点击事件', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();

    mgr._handleClick(
      { menuItemId: 'pagewise-explain', selectionText: 'text1' },
      { id: 1, url: '', title: '' }
    );
    mgr._handleClick(
      { menuItemId: 'pagewise-ocr', srcUrl: 'img.png' },
      { id: 2, url: '', title: '' }
    );

    assert.equal(mgr.eventLog.length, 2);
    assert.equal(mgr.eventLog[0].action, 'contextMenuExplain');
    assert.equal(mgr.eventLog[1].action, 'contextMenuOCR');
  });

  it('items 应返回防御性副本', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();
    const items1 = mgr.items;
    const items2 = mgr.items;
    assert.notEqual(items1, items2); // 不同引用
    assert.equal(items1.size, items2.size); // 内容相同
  });
});

describe('ContextMenuManager — 日志记录', () => {
  it('注册菜单应记录 info 日志', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();

    const logs = getLogsByModule('context-menu-manager');
    assert.ok(logs.length > 0);
    assert.ok(logs.some(l => l.message.includes('注册完成')));
  });

  it('创建失败应记录 error 日志', () => {
    const mgr = new ContextMenuManager({
      createFn: () => { throw new Error('API unavailable'); },
    });
    mgr.registerMenus();

    const errors = getLogs().filter(l => l.level === 'error');
    assert.ok(errors.length > 0);
    assert.ok(errors.some(l => l.message.includes('创建失败')));
  });

  it('点击菜单应记录 info 日志', () => {
    const mgr = new ContextMenuManager({ createFn: (p) => p.id });
    mgr.registerMenus();

    mgr._handleClick(
      { menuItemId: 'pagewise-explain', selectionText: 'test text' },
      { id: 1, url: 'https://example.com', title: 'Test' }
    );

    const logs = getLogsByModule('context-menu-manager').filter(l => l.level === 'info');
    assert.ok(logs.some(l => l.message.includes('菜单动作触发')));
  });
});
