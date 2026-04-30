/**
 * 快捷键管理模块 (R11)
 *
 * 管理侧边栏内快捷键的存储、匹配、冲突检测。
 * Chrome 全局快捷键由 manifest.json 声明，只做展示引导。
 */

/** 默认侧边栏内快捷键配置 */
export const DEFAULT_SHORTCUTS = {
  sendMessage: { key: 'Enter', ctrl: true, meta: true, shift: false, alt: false },
  focusSearch: { key: 'k', ctrl: true, meta: true, shift: false, alt: false },
  clearChat:   { key: 'n', ctrl: true, meta: true, shift: false, alt: false },
};

/** 快捷键操作的显示名称 */
export const SHORTCUT_LABELS = {
  sendMessage: '发送消息',
  focusSearch: '聚焦搜索框',
  clearChat:   '清空对话',
};

/** Chrome 全局快捷键信息（只读展示） */
export const CHROME_COMMANDS = [
  { command: '_execute_action', label: '打开侧边栏', defaultKey: 'Ctrl+Shift+Y', macKey: '⌘+Shift+Y' },
  { command: 'summarize-page',  label: '总结当前页面', defaultKey: 'Ctrl+Shift+S', macKey: '⌘+Shift+S' },
  { command: 'toggle-sidebar',  label: '打开/关闭侧边栏', defaultKey: 'Ctrl+Shift+X', macKey: '⌘+Shift+X' },
];

/** chrome.storage.sync 存储 key */
const STORAGE_KEY = 'customShortcuts';

/**
 * 获取当前侧边栏快捷键配置
 * @returns {Promise<Object>} 快捷键配置（缺失字段回退默认值）
 */
export async function getShortcuts() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [STORAGE_KEY]: {} }, (result) => {
      const saved = result[STORAGE_KEY] || {};
      // 深合并：每个 action 逐字段回退默认值
      const merged = {};
      for (const [action, defaultBinding] of Object.entries(DEFAULT_SHORTCUTS)) {
        const savedBinding = saved[action] || {};
        merged[action] = {
          key: savedBinding.key ?? defaultBinding.key,
          ctrl: savedBinding.ctrl ?? defaultBinding.ctrl,
          meta: savedBinding.meta ?? defaultBinding.meta,
          shift: savedBinding.shift ?? defaultBinding.shift,
          alt: savedBinding.alt ?? defaultBinding.alt,
        };
      }
      resolve(merged);
    });
  });
}

/**
 * 保存侧边栏快捷键配置
 * @param {Object} shortcuts — 快捷键配置
 * @returns {Promise<void>}
 */
export async function saveShortcuts(shortcuts) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: shortcuts }, resolve);
  });
}

/**
 * 重置为出厂默认值
 * @returns {Promise<void>}
 */
export async function resetShortcuts() {
  return saveShortcuts({ ...DEFAULT_SHORTCUTS });
}

/**
 * 格式化快捷键绑定为可读字符串
 * @param {{ key: string, ctrl?: boolean, meta?: boolean, shift?: boolean, alt?: boolean }} binding
 * @returns {string} 如 "Ctrl+K", "Meta+Shift+Enter"
 */
export function formatShortcutDisplay(binding) {
  if (!binding || !binding.key) return '无';

  const parts = [];

  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('Meta');

  // 格式化 key 名
  let keyName = binding.key;
  if (keyName === ' ') keyName = 'Space';
  else if (keyName.length === 1) keyName = keyName.toUpperCase();
  // 保留 Enter, Escape, Backspace, Delete, Tab, ArrowUp 等原名

  parts.push(keyName);
  return parts.join('+');
}

/**
 * 检查 keydown 事件是否匹配指定快捷键绑定
 * @param {KeyboardEvent} event
 * @param {{ key: string, ctrl?: boolean, meta?: boolean, shift?: boolean, alt?: boolean }} binding
 * @returns {boolean}
 */
export function matchShortcut(event, binding) {
  if (!binding || !binding.key) return false;

  // key 匹配（不区分大小写）
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const bindingKey = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key;
  if (eventKey !== bindingKey) return false;

  // 修饰键匹配：binding 要求的修饰键 event 必须有
  if (binding.ctrl && !event.ctrlKey) return false;
  if (binding.alt && !event.altKey) return false;
  if (binding.shift && !event.shiftKey) return false;
  if (binding.meta && !event.metaKey) return false;

  // event 有多余修饰键而 binding 没有，也不匹配
  if (!binding.ctrl && event.ctrlKey) return false;
  if (!binding.alt && event.altKey) return false;
  if (!binding.shift && event.shiftKey) return false;
  if (!binding.meta && event.metaKey) return false;

  return true;
}

/**
 * 从 keydown 事件中提取快捷键绑定对象
 * @param {KeyboardEvent} event
 * @returns {{ key: string, ctrl: boolean, meta: boolean, shift: boolean, alt: boolean } | null}
 *   null = Escape 取消；key 为空字符串 = Backspace/Delete 清除
 */
export function captureKeyFromEvent(event) {
  // Escape 取消录制
  if (event.key === 'Escape') return null;

  // Backspace/Delete 清除绑定
  if (event.key === 'Backspace' || event.key === 'Delete') {
    return { key: '', ctrl: false, meta: false, shift: false, alt: false };
  }

  const key = event.key;

  // 不接受无修饰键的单字母/数字绑定（防止误触），F 键除外
  const isFunctionKey = /^F\d{1,2}$/.test(key);
  const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
  if (!hasModifier && !isFunctionKey) return null;

  return {
    key,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}

/**
 * 检测新绑定是否与已有快捷键冲突
 * @param {Object} shortcuts — 当前所有快捷键配置
 * @param {string} excludeAction — 排除的 action（正在修改的那个）
 * @param {{ key: string, ctrl?: boolean, meta?: boolean, shift?: boolean, alt?: boolean }} newBinding
 * @returns {{ conflict: boolean, conflictAction: string | null, conflictLabel: string | null }}
 */
export function detectConflict(shortcuts, excludeAction, newBinding) {
  if (!newBinding || !newBinding.key) {
    return { conflict: false, conflictAction: null, conflictLabel: null };
  }

  for (const [action, binding] of Object.entries(shortcuts)) {
    if (action === excludeAction) continue;
    if (bindingsEqual(binding, newBinding)) {
      return {
        conflict: true,
        conflictAction: action,
        conflictLabel: SHORTCUT_LABELS[action] || action,
      };
    }
  }

  return { conflict: false, conflictAction: null, conflictLabel: null };
}

/**
 * 判断两个快捷键绑定是否相同
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
export function bindingsEqual(a, b) {
  if (!a || !b) return false;
  const normalize = (o) => ({
    key: (o.key || '').toLowerCase(),
    ctrl: !!o.ctrl,
    meta: !!o.meta,
    shift: !!o.shift,
    alt: !!o.alt,
  });
  const na = normalize(a);
  const nb = normalize(b);
  return na.key === nb.key
    && na.ctrl === nb.ctrl
    && na.meta === nb.meta
    && na.shift === nb.shift
    && na.alt === nb.alt;
}
