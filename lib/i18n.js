/**
 * i18n — PageWise 国际化基础设施
 *
 * 功能：
 * 1. 语言包加载机制（zh-CN, en-US）
 * 2. 翻译函数 t(key, params)
 * 3. 语言切换 API
 * 4. 从 chrome.storage 读取语言偏好
 *
 * 设计约束：
 * - 纯手写，不引入外部 i18n 库
 * - 向后兼容：未翻译的 key 返回原始 key
 * - 支持参数插值 {{name}}
 */

// ==================== 语言包缓存 ====================

const _loadedLocales = {};
let _currentLocale = 'zh-CN';
let _fallbackLocale = 'en-US';
const _listeners = [];

// ==================== 默认语言包 ====================

const BUILTIN_ZH = {
  'app.name': '智阅',
  'tab.chat': '问答',
  'tab.skills': '技能',
  'tab.knowledge': '知识',
  'tab.wiki': 'Wiki',
  'tab.page': '页面',
  'tab.settings': '设置',
  'tab.bookmarks': '书签',
  'tab.logs': '日志',
};

const BUILTIN_EN = {
  'app.name': 'PageWise',
  'tab.chat': 'Chat',
  'tab.skills': 'Skills',
  'tab.knowledge': 'Knowledge',
  'tab.wiki': 'Wiki',
  'tab.page': 'Page',
  'tab.settings': 'Settings',
  'tab.bookmarks': 'Bookmarks',
  'tab.logs': 'Logs',
};

// ==================== 语言包加载 ====================

/**
 * 注册语言包（手动注入）
 * @param {string} locale - 语言代码（如 'zh-CN'）
 * @param {Object} messages - 消息键值对
 */
export function registerLocale(locale, messages) {
  _loadedLocales[locale] = { ...messages };
}

/**
 * 通过 fetch 加载语言包 JSON 文件
 * @param {string} locale - 语言代码
 * @param {string} url - JSON 文件 URL
 * @returns {Promise<Object>} 语言包对象
 */
export async function loadLocaleFromURL(locale, url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[i18n] Failed to load locale ${locale} from ${url}: ${resp.status}`);
      return {};
    }
    const messages = await resp.json();
    _loadedLocales[locale] = messages;
    return messages;
  } catch (err) {
    console.warn(`[i18n] Error loading locale ${locale}:`, err);
    return {};
  }
}

// ==================== 语言偏好管理 ====================

/**
 * 从 chrome.storage.sync 读取语言偏好
 * @returns {Promise<string>} 语言代码
 */
export async function getPreferredLanguage() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ language: 'zh-CN' }, (result) => {
        resolve(result.language || 'zh-CN');
      });
    });
  }
  return _currentLocale;
}

/**
 * 保存语言偏好到 chrome.storage.sync
 * @param {string} locale - 语言代码
 */
export async function setPreferredLanguage(locale) {
  _currentLocale = locale;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ language: locale }, resolve);
    });
  }
}

// ==================== 语言切换 API ====================

/**
 * 获取当前语言
 * @returns {string}
 */
export function getCurrentLocale() {
  return _currentLocale;
}

/**
 * 获取回退语言
 * @returns {string}
 */
export function getFallbackLocale() {
  return _fallbackLocale;
}

/**
 * 设置当前语言
 * @param {string} locale
 */
export function setLocale(locale) {
  const old = _currentLocale;
  _currentLocale = locale;
  if (old !== locale) {
    _notifyListeners(locale, old);
  }
}

/**
 * 设置回退语言
 * @param {string} locale
 */
export function setFallbackLocale(locale) {
  _fallbackLocale = locale;
}

/**
 * 监听语言切换
 * @param {Function} callback - (newLocale, oldLocale) => void
 * @returns {Function} 取消监听函数
 */
export function onLocaleChange(callback) {
  _listeners.push(callback);
  return () => {
    const idx = _listeners.indexOf(callback);
    if (idx !== -1) _listeners.splice(idx, 1);
  };
}

function _notifyListeners(newLocale, oldLocale) {
  for (const fn of _listeners) {
    try {
      fn(newLocale, oldLocale);
    } catch (e) {
      console.error('[i18n] Listener error:', e);
    }
  }
}

// ==================== 翻译函数 ====================

/**
 * 翻译函数
 *
 * @param {string} key - 消息键（如 'sidebar.title'）
 * @param {Object} [params] - 插值参数（如 { name: 'PageWise' }）
 * @param {string} [locale] - 指定语言（默认使用当前语言）
 * @returns {string} 翻译后的文本；未找到时返回原始 key
 *
 * @example
 * t('welcome.message') // '你好！我是你的技术知识助手'
 * t('welcome.greeting', { name: 'PageWise' }) // '你好，PageWise！'
 */
export function t(key, params, locale) {
  if (!key) return '';

  const loc = locale || _currentLocale;

  // 按优先级查找：当前语言 → 回退语言 → 原始 key
  let template = _resolveKey(key, loc);

  // 参数插值
  if (template !== null && params && typeof params === 'object') {
    template = _interpolate(template, params);
  }

  return template !== null ? template : key;
}

/**
 * 检查 key 是否存在
 * @param {string} key
 * @param {string} [locale]
 * @returns {boolean}
 */
export function hasTranslation(key, locale) {
  const loc = locale || _currentLocale;
  return _resolveKey(key, loc) !== null;
}

/**
 * 获取当前语言的所有消息
 * @returns {Object}
 */
export function getAllMessages() {
  return { ...(_loadedLocales[_currentLocale] || {}) };
}

/**
 * 获取支持的语言列表
 * @returns {string[]}
 */
export function getSupportedLocales() {
  return Object.keys(_loadedLocales);
}

// ==================== DOM 自动翻译 ====================

/**
 * 自动翻译页面中带 data-i18n 属性的元素
 *
 * 支持的属性：
 * - data-i18n="key" → 设置 textContent
 * - data-i18n-placeholder="key" → 设置 placeholder
 * - data-i18n-title="key" → 设置 title
 * - data-i18n-aria-label="key" → 设置 ariaLabel
 *
 * @param {HTMLElement|Document} [root=document] - 根元素
 */
export function translateDOM(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const elements = doc.querySelectorAll('[data-i18n]');
  for (const el of elements) {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key);
    }
  }

  const placeholders = doc.querySelectorAll('[data-i18n-placeholder]');
  for (const el of placeholders) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.placeholder = t(key);
    }
  }

  const titles = doc.querySelectorAll('[data-i18n-title]');
  for (const el of titles) {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.title = t(key);
    }
  }

  const ariaLabels = doc.querySelectorAll('[data-i18n-aria-label]');
  for (const el of ariaLabels) {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key) {
      el.setAttribute('aria-label', t(key));
    }
  }

  const htmlEl = doc.documentElement || doc.querySelector('html');
  if (htmlEl) {
    htmlEl.setAttribute('lang', _currentLocale);
  }
}

/**
 * 更新 CSS 逻辑属性以支持 RTL 语言
 * @param {HTMLElement|Document} [root=document]
 */
export function applyDirection(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const htmlEl = doc.documentElement || doc.querySelector('html');
  if (!htmlEl) return;

  const rtlLocales = ['ar', 'he', 'fa', 'ur'];
  const baseLocale = _currentLocale.split('-')[0];
  const isRTL = rtlLocales.includes(baseLocale);

  htmlEl.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
}

// ==================== 初始化 ====================

/**
 * 初始化 i18n 系统
 *
 * 流程：
 * 1. 从 chrome.storage 读取语言偏好
 * 2. 加载对应语言包
 * 3. 设置当前语言
 * 4. 翻译 DOM
 *
 * @param {Object} [options]
 * @param {Object} [options.locales] - 预加载的语言包 { 'zh-CN': {...}, 'en-US': {...} }
 * @param {string} [options.defaultLocale] - 默认语言
 * @param {string} [options.fallback] - 回退语言
 * @param {boolean} [options.translatePage=true] - 是否自动翻译页面
 * @returns {Promise<string>} 最终使用的语言
 */
export async function initI18n(options = {}) {
  const {
    locales = null,
    defaultLocale = null,
    fallback = 'en-US',
    translatePage = true,
  } = options;

  _fallbackLocale = fallback;

  if (locales) {
    for (const [loc, messages] of Object.entries(locales)) {
      registerLocale(loc, messages);
    }
  }

  if (!_loadedLocales['zh-CN']) {
    registerLocale('zh-CN', BUILTIN_ZH);
  }
  if (!_loadedLocales['en-US']) {
    registerLocale('en-US', BUILTIN_EN);
  }

  let preferred = await getPreferredLanguage();

  if (!preferred && defaultLocale) {
    preferred = defaultLocale;
  }

  _currentLocale = preferred || 'zh-CN';

  if (translatePage && typeof document !== 'undefined') {
    translateDOM();
    applyDirection();
  }

  return _currentLocale;
}

// ==================== 内部工具函数 ====================

/**
 * 解析嵌套的 key（支持点号分隔和扁平 key）
 * @param {string} key
 * @param {string} locale
 * @returns {string|null}
 */
function _resolveKey(key, locale) {
  const current = _loadedLocales[locale];
  if (current) {
    // 1. 先尝试直接访问扁平 key（如 'app.name' 作为完整键名）
    if (current[key] !== undefined && current[key] !== null) return current[key];
    // 2. 再尝试嵌套访问（如 obj.app.name）
    const val = _getNestedValue(current, key);
    if (val !== undefined && val !== null) return val;
  }

  if (locale !== _fallbackLocale) {
    const fallback = _loadedLocales[_fallbackLocale];
    if (fallback) {
      if (fallback[key] !== undefined && fallback[key] !== null) return fallback[key];
      const val = _getNestedValue(fallback, key);
      if (val !== undefined && val !== null) return val;
    }
  }

  return null;
}

/**
 * 获取嵌套对象中的值
 * @param {Object} obj
 * @param {string} path
 * @returns {*}
 */
function _getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * 参数插值：将 {{key}} 替换为 params[key]
 * @param {string} template
 * @param {Object} params
 * @returns {string}
 */
function _interpolate(template, params) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return params[name] !== undefined ? String(params[name]) : match;
  });
}
