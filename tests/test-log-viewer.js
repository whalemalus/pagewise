import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addLog, logInfo, logError, logWarn, logDebug, getLogs, clearLogs, exportLogs } from '../lib/log-store.js';

beforeEach(() => { clearLogs(); });

describe('日志查看器功能', () => {
  it('exportLogs 格式正确', () => {
    logInfo('test', 'hello');
    const text = exportLogs();
    assert.ok(text.includes('[INFO]'));
    assert.ok(text.includes('[test]'));
    assert.ok(text.includes('hello'));
  });

  it('exportLogs 多条日志', () => {
    logInfo('mod1', 'msg1');
    logError('mod2', 'msg2');
    const text = exportLogs();
    const lines = text.split('\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes('msg1'));
    assert.ok(lines[1].includes('msg2'));
  });

  it('筛选：按级别', () => {
    logInfo('mod', 'info-msg');
    logError('mod', 'error-msg');
    logDebug('mod', 'debug-msg');
    const errors = getLogs().filter(l => l.level === 'error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'error-msg');
  });

  it('筛选：按模块', () => {
    logInfo('sidebar', 's-msg');
    logInfo('context-menu', 'c-msg');
    const sidebar = getLogs().filter(l => l.module === 'sidebar');
    assert.equal(sidebar.length, 1);
  });

  it('筛选：级别 + 模块组合', () => {
    logInfo('sidebar', 'i1');
    logError('sidebar', 'e1');
    logInfo('context-menu', 'i2');
    const result = getLogs().filter(l => l.module === 'sidebar' && l.level === 'error');
    assert.equal(result.length, 1);
    assert.equal(result[0].message, 'e1');
  });

  it('日志倒序（最新在前）', () => {
    for (let i = 0; i < 5; i++) logInfo('test', `msg-${i}`);
    const logs = getLogs().reverse();
    assert.equal(logs[0].message, 'msg-4');
  });

  it('clearLogs 后 getLogs 返回空', () => {
    logInfo('test', 'msg');
    clearLogs();
    assert.equal(getLogs().length, 0);
  });

  it('exportLogs 空日志返回空字符串', () => {
    assert.equal(exportLogs(), '');
  });

  it('日志 data 字段包含在导出中', () => {
    logError('test', 'fail', { code: 500 });
    const text = exportLogs();
    assert.ok(text.includes('500'));
  });

  it('模块列表去重', () => {
    logInfo('sidebar', 'a');
    logInfo('sidebar', 'b');
    logInfo('context-menu', 'c');
    const modules = [...new Set(getLogs().map(l => l.module))];
    assert.deepEqual(modules.sort(), ['context-menu', 'sidebar']);
  });
});
