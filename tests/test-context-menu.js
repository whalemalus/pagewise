import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { logInfo, logError, logWarn, getLogs, getLogsByModule, clearLogs } from '../lib/log-store.js';

// logDebug is not in the original import list from the test file spec, but it's needed
// We need to import it separately
import { logDebug } from '../lib/log-store.js';

beforeEach(() => { clearLogs(); });

describe('Context Menu 日志记录', () => {
  it('右键提问应记录 info 日志', () => {
    logInfo('context-menu', '右键菜单触发: contextMenuAsk', { selection: 'test code', tabId: 1 });
    const logs = getLogsByModule('context-menu');
    assert.equal(logs.length, 1);
    assert.ok(logs[0].message.includes('contextMenuAsk'));
  });

  it('消息发送失败应记录 error 日志', () => {
    logError('context-menu', '消息发送失败，已重试 8 次', { error: 'Could not establish connection', action: 'contextMenuAsk' });
    const errors = getLogsByModule('context-menu').filter(l => l.level === 'error');
    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes('重试'));
  });

  it('侧边栏打开失败应记录 error', () => {
    logError('context-menu', '打开侧边栏失败', { error: 'No tab with id' });
    const errors = getLogs().filter(l => l.level === 'error');
    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes('侧边栏'));
  });

  it('handlePendingAction 去重应记录 debug', () => {
    logDebug('sidebar', 'handlePendingAction 去重跳过', { key: 'contextMenuAsk:test' });
    const logs = getLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'debug');
  });

  it('右键提问成功应记录 info', () => {
    logInfo('sidebar', '右键提问发送成功');
    const logs = getLogsByModule('sidebar');
    assert.equal(logs.length, 1);
    assert.ok(logs[0].message.includes('成功'));
  });

  it('右键提问但选中文本为空应记录 warn', () => {
    logWarn('sidebar', '右键提问但选中文本为空');
    const warns = getLogs().filter(l => l.level === 'warn');
    assert.equal(warns.length, 1);
  });

  it('sendMessage 失败应记录 error', () => {
    logError('sidebar', '右键提问发送失败', { error: 'API key not configured' });
    const errors = getLogs().filter(l => l.level === 'error');
    assert.equal(errors.length, 1);
    assert.ok(errors[0].data.includes('API key'));
  });

  it('多个模块日志可分别筛选', () => {
    logInfo('context-menu', 'test1');
    logInfo('sidebar', 'test2');
    logError('context-menu', 'test3');
    assert.equal(getLogsByModule('context-menu').length, 2);
    assert.equal(getLogsByModule('sidebar').length, 1);
  });

  it('日志包含时间戳和模块名', () => {
    logInfo('context-menu', '测试消息');
    const log = getLogs()[0];
    assert.ok(log.timestamp > 0);
    assert.equal(log.module, 'context-menu');
    assert.equal(log.message, '测试消息');
  });

  it('快捷键触发应记录日志', () => {
    logInfo('shortcut', '快捷键触发: summarize-page', { tabId: 1 });
    const logs = getLogsByModule('shortcut');
    assert.equal(logs.length, 1);
    assert.ok(logs[0].message.includes('summarize-page'));
  });
});
