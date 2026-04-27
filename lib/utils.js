/**
 * 工具函数
 */

/**
 * 从 chrome.storage 读取设置
 */
export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      apiKey: '',
      apiProtocol: 'openai',
      apiBaseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
      maxTokens: 4096,
      autoExtract: false,
      theme: 'light',
      language: 'zh-CN',
      maxContentLength: 8000
    }, (result) => {
      resolve(result);
    });
  });
}

/**
 * 保存设置到 chrome.storage
 */
export async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, resolve);
  });
}

/**
 * 截断文本
 */
export function truncate(text, maxLength = 200) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * 格式化时间
 */
export function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * 简单的 Markdown 渲染（不依赖外部库）
 */
export function renderMarkdown(text) {
  if (!text) return '';

  return text
    // 代码块
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<div class="code-block-wrapper"><button class="code-copy-btn" data-code-copy title="复制代码">复制</button><pre><code class="lang-$1">$2</code></pre></div>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 标题
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // 粗体 / 斜体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // 无序列表
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // 引用
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // 分隔线
    .replace(/^---$/gm, '<hr>')
    // 段落（双换行）
    .replace(/\n\n/g, '</p><p>')
    // 单换行
    .replace(/\n/g, '<br>');
}

/**
 * 防抖
 */
export function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 生成唯一 ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ==================== 对话持久化 ====================

const CONVERSATION_STORAGE_KEY = 'pagewiseConversation';
const CONVERSATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 小时

/**
 * 保存对话历史到 chrome.storage.session
 * @param {Array} conversationHistory - 对话历史数组
 * @param {string} currentPageUrl - 当前页面 URL
 */
export async function saveConversation(conversationHistory, currentPageUrl) {
  const data = {
    conversationHistory,
    currentPageUrl: currentPageUrl || '',
    timestamp: Date.now()
  };
  return new Promise((resolve) => {
    chrome.storage.session.set({ [CONVERSATION_STORAGE_KEY]: data }, resolve);
  });
}

/**
 * 从 chrome.storage.session 恢复对话历史
 * @param {string} currentUrl - 当前页面 URL，用于判断是否同一页面
 * @returns {{ conversationHistory: Array, currentPageUrl: string, timestamp: number } | null}
 */
export async function loadConversation(currentUrl) {
  return new Promise((resolve) => {
    chrome.storage.session.get(CONVERSATION_STORAGE_KEY, (result) => {
      const data = result[CONVERSATION_STORAGE_KEY];
      if (!data) {
        resolve(null);
        return;
      }
      // 超过 24 小时自动过期
      if (Date.now() - data.timestamp > CONVERSATION_EXPIRY_MS) {
        chrome.storage.session.remove(CONVERSATION_STORAGE_KEY);
        resolve(null);
        return;
      }
      resolve(data);
    });
  });
}

/**
 * 清除保存的对话历史
 */
export async function clearConversation() {
  return new Promise((resolve) => {
    chrome.storage.session.remove(CONVERSATION_STORAGE_KEY, resolve);
  });
}

// ==================== API Profile 管理 ====================

const PROFILES_STORAGE_KEY = 'pagewiseApiProfiles';

/**
 * 保存 API 配置 Profile 列表
 * @param {Array} profiles - Profile 数组
 */
export async function saveProfiles(profiles) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [PROFILES_STORAGE_KEY]: profiles }, resolve);
  });
}

/**
 * 加载 API 配置 Profile 列表
 * @returns {Array} Profile 数组
 */
export async function loadProfiles() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [PROFILES_STORAGE_KEY]: [] }, (result) => {
      resolve(result[PROFILES_STORAGE_KEY]);
    });
  });
}
