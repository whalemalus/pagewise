// 日志级别
export const LogLevel = { DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' };

// 最大日志条数（内存中保留最近 500 条）
const MAX_LOGS = 500;

// 内存日志数组
let _logs = [];

/**
 * 添加日志
 * @param {string} level - debug/info/warn/error
 * @param {string} module - 模块名（如 'context-menu', 'ai-client', 'sidebar'）
 * @param {string} message - 日志消息
 * @param {object} [data] - 附加数据
 */
export function addLog(level, module, message, data = null) {
  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
    level,
    module,
    message,
    data: data ? JSON.stringify(data).slice(0, 500) : null
  };
  _logs.push(entry);
  if (_logs.length > MAX_LOGS) _logs = _logs.slice(-MAX_LOGS);
  // 同时输出到 console
  const fn = console[level] || console.log;
  fn(`[PageWise:${module}]`, message, data || '');
  return entry;
}

/** 便捷方法 */
export const logDebug = (mod, msg, data) => addLog('debug', mod, msg, data);
export const logInfo = (mod, msg, data) => addLog('info', mod, msg, data);
export const logWarn = (mod, msg, data) => addLog('warn', mod, msg, data);
export const logError = (mod, msg, data) => addLog('error', mod, msg, data);

/** 获取所有日志 */
export function getLogs() { return [..._logs]; }

/** 按模块筛选 */
export function getLogsByModule(module) { return _logs.filter(l => l.module === module); }

/** 按级别筛选 */
export function getLogsByLevel(level) { return _logs.filter(l => l.level === level); }

/** 清除日志 */
export function clearLogs() { _logs = []; }

/** 导出为文本 */
export function exportLogs() {
  return _logs.map(l => {
    const ts = new Date(l.timestamp).toISOString();
    const data = l.data ? ` | ${l.data}` : '';
    return `[${ts}] [${l.level.toUpperCase()}] [${l.module}] ${l.message}${data}`;
  }).join('\n');
}
