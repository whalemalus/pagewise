// 日志级别
export const LogLevel = { DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' };

// 最大日志条数（内存中保留最近 500 条）
const MAX_LOGS = 500;

// 最大性能指标条数（保留最近 100 条）
const MAX_METRICS = 100;

// 内存日志数组
let _logs = [];

// 性能指标数组
let _metrics = [];

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

// ==================== 性能指标 ====================

/**
 * 记录性能指标
 * @param {string} category - 类别 ('api' | 'extraction' | 'rendering')
 * @param {number} durationMs - 耗时（毫秒）
 * @param {object} [data] - 附加数据（如模型名、字数等）
 */
export function recordMetric(category, durationMs, data = null) {
  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
    category,
    durationMs: Math.round(durationMs * 100) / 100, // 保留两位小数
    data: data ? JSON.stringify(data).slice(0, 300) : null
  };
  _metrics.push(entry);
  if (_metrics.length > MAX_METRICS) _metrics = _metrics.slice(-MAX_METRICS);
  return entry;
}

/** 获取所有性能指标 */
export function getMetrics() { return [..._metrics]; }

/** 按类别获取性能指标 */
export function getMetricsByCategory(category) {
  return _metrics.filter(m => m.category === category);
}

/**
 * 获取最近 N 条性能指标
 * @param {number} n - 最多返回条数（默认 20）
 * @param {string} [category] - 可选按类别筛选
 */
export function getRecentMetrics(n = 20, category = null) {
  const source = category ? _metrics.filter(m => m.category === category) : _metrics;
  return source.slice(-n);
}

/**
 * 计算性能统计（avg / p50 / p95）
 * @param {string} [category] - 可选按类别筛选；不传则对全部指标计算
 * @returns {{ avg: number, p50: number, p95: number, count: number, min: number, max: number }}
 */
export function getPerformanceStats(category = null) {
  const source = category
    ? _metrics.filter(m => m.category === category)
    : _metrics;

  if (source.length === 0) {
    return { avg: 0, p50: 0, p95: 0, count: 0, min: 0, max: 0 };
  }

  const durations = source.map(m => m.durationMs).sort((a, b) => a - b);
  const count = durations.length;
  const sum = durations.reduce((acc, v) => acc + v, 0);
  const avg = Math.round((sum / count) * 100) / 100;
  const p50 = durations[Math.floor(count * 0.5)];
  const p95 = durations[Math.floor(count * 0.95)] || durations[count - 1];
  const min = durations[0];
  const max = durations[count - 1];

  return { avg, p50, p95, count, min, max };
}

/** 清除性能指标 */
export function clearMetrics() { _metrics = []; }
