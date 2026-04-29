import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addLog, logDebug, logInfo, logWarn, logError, getLogs, getLogsByModule, getLogsByLevel, clearLogs, exportLogs, LogLevel } from '../lib/log-store.js';

beforeEach(() => { clearLogs(); });

describe('log-store', () => {

  it('addLog — 基本添加一条日志', () => {
    const entry = addLog('info', 'ai-client', 'request started');
    assert.ok(entry);
    assert.equal(entry.level, 'info');
    assert.equal(entry.module, 'ai-client');
    assert.equal(entry.message, 'request started');
    assert.equal(getLogs().length, 1);
  });

  it('addLog — 返回带 id 和 timestamp 的对象', () => {
    const entry = addLog('warn', 'sidebar', 'slow render');
    assert.ok(typeof entry.id === 'string');
    assert.ok(entry.id.length > 0);
    assert.ok(typeof entry.timestamp === 'number');
    assert.ok(entry.timestamp > 0);
  });

  it('addLog — 带 data 参数时 data 被 JSON 序列化', () => {
    const entry = addLog('info', 'test', 'with data', { key: 'value' });
    assert.equal(typeof entry.data, 'string');
    assert.ok(entry.data.includes('value'));
  });

  it('addLog — 不传 data 时 data 为 null', () => {
    const entry = addLog('info', 'test', 'no data');
    assert.equal(entry.data, null);
  });

  it('logDebug / logInfo / logWarn / logError 便捷方法', () => {
    logDebug('m', 'd msg');
    logInfo('m', 'i msg');
    logWarn('m', 'w msg');
    logError('m', 'e msg');
    const logs = getLogs();
    assert.equal(logs.length, 4);
    assert.equal(logs[0].level, 'debug');
    assert.equal(logs[1].level, 'info');
    assert.equal(logs[2].level, 'warn');
    assert.equal(logs[3].level, 'error');
  });

  it('getLogs 返回所有日志', () => {
    addLog('info', 'a', 'msg1');
    addLog('info', 'b', 'msg2');
    addLog('info', 'c', 'msg3');
    assert.equal(getLogs().length, 3);
  });

  it('getLogs 返回副本，修改不影响内部', () => {
    addLog('info', 'mod', 'msg');
    const copy = getLogs();
    copy.push({ fake: true });
    assert.equal(getLogs().length, 1);
  });

  it('getLogsByModule 按模块筛选', () => {
    addLog('info', 'ai-client', 'msg1');
    addLog('info', 'sidebar', 'msg2');
    addLog('info', 'ai-client', 'msg3');
    const filtered = getLogsByModule('ai-client');
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every(l => l.module === 'ai-client'));
  });

  it('getLogsByModule 无匹配返回空数组', () => {
    addLog('info', 'sidebar', 'msg');
    assert.deepEqual(getLogsByModule('nonexistent'), []);
  });

  it('getLogsByLevel 按级别筛选', () => {
    addLog('info', 'mod', 'i');
    addLog('warn', 'mod', 'w');
    addLog('error', 'mod', 'e');
    addLog('info', 'mod', 'i2');
    const warns = getLogsByLevel('warn');
    assert.equal(warns.length, 1);
    assert.equal(warns[0].level, 'warn');
    const infos = getLogsByLevel('info');
    assert.equal(infos.length, 2);
  });

  it('clearLogs 清除后 getLogs 返回空', () => {
    addLog('info', 'mod', 'msg1');
    addLog('info', 'mod', 'msg2');
    assert.equal(getLogs().length, 2);
    clearLogs();
    assert.equal(getLogs().length, 0);
  });

  it('exportLogs 格式包含时间戳、级别、模块、消息', () => {
    addLog('info', 'ai-client', 'hello world');
    const text = exportLogs();
    assert.ok(text.includes('INFO'));
    assert.ok(text.includes('[ai-client]'));
    assert.ok(text.includes('hello world'));
    // ISO 时间戳格式校验
    assert.ok(/\d{4}-\d{2}-\d{2}T/.test(text));
  });

  it('exportLogs 包含 data 时用竖线分隔', () => {
    addLog('error', 'mod', 'fail', { code: 500 });
    const text = exportLogs();
    assert.ok(text.includes(' | '));
    assert.ok(text.includes('500'));
  });

  it('exportLogs 空日志返回空字符串', () => {
    assert.equal(exportLogs(), '');
  });

  it('MAX_LOGS 限制 — 超过 500 条只保留最近 500', () => {
    for (let i = 0; i < 510; i++) {
      addLog('info', 'test', `msg-${i}`);
    }
    const logs = getLogs();
    assert.equal(logs.length, 500);
    // 最早的应是 msg-10（msg-0 ~ msg-9 被丢弃）
    assert.equal(logs[0].message, 'msg-10');
    assert.equal(logs[499].message, 'msg-509');
  });

  it('LogLevel 常量值正确', () => {
    assert.equal(LogLevel.DEBUG, 'debug');
    assert.equal(LogLevel.INFO, 'info');
    assert.equal(LogLevel.WARN, 'warn');
    assert.equal(LogLevel.ERROR, 'error');
  });

});
