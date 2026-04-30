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
      console.log('[PageWise] getSettings raw:', result);
      console.log('[PageWise] getSettings parsed:', {
        hasApiKey: !!result.apiKey,
        apiKeyLength: result.apiKey?.length || 0,
        baseUrl: result.apiBaseUrl,
        model: result.model,
        provider: result.apiProvider,
        protocol: result.apiProtocol
      });
      resolve(result);
    });
  });
}

/**
 * 保存设置到 chrome.storage
 */
export async function saveSettings(settings) {
  console.log('[PageWise] saveSettings:', {
    hasApiKey: !!settings.apiKey,
    apiKeyLength: settings.apiKey?.length || 0,
    baseUrl: settings.apiBaseUrl,
    model: settings.model,
    provider: settings.apiProvider,
    protocol: settings.apiProtocol
  });
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

  // 代码块替换 — 带语法高亮
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const highlighted = highlightCode(code, lang);
    return `<div class="code-block-wrapper"><button class="code-copy-btn" data-code-copy title="复制代码">复制</button><pre><code class="lang-${lang}">${highlighted}</code></pre></div>`;
  });

  return text
    // 代码块
    // (code blocks already handled above)
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
 * 语法高亮 — 基于正则，支持多语言
 * @param {string} code - 原始代码字符串
 * @param {string} lang - 语言标识
 * @returns {string} 带高亮 span 的 HTML
 */
export function highlightCode(code, lang) {
  if (!code) return '';

  // 先 HTML 转义
  let escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const l = (lang || '').toLowerCase();

  // 语言关键词映射
  const keywordMap = {
    js:          'abstract|arguments|async|await|boolean|break|byte|case|catch|char|class|const|continue|debugger|default|delete|do|double|else|enum|export|extends|false|final|finally|float|for|from|function|goto|if|implements|import|in|instanceof|int|interface|let|long|native|new|null|of|package|private|protected|public|return|short|static|super|switch|synchronized|this|throw|throws|transient|true|try|typeof|undefined|var|void|volatile|while|with|yield',
    javascript:  'abstract|arguments|async|await|boolean|break|byte|case|catch|char|class|const|continue|debugger|default|delete|do|double|else|enum|export|extends|false|final|finally|float|for|from|function|goto|if|implements|import|in|instanceof|int|interface|let|long|native|new|null|of|package|private|protected|public|return|short|static|super|switch|synchronized|this|throw|throws|transient|true|try|typeof|undefined|var|void|volatile|while|with|yield',
    typescript:  'abstract|arguments|async|await|boolean|break|byte|case|catch|char|class|const|continue|debugger|default|delete|do|double|else|enum|export|extends|false|final|finally|float|for|from|function|goto|if|implements|import|in|instanceof|int|interface|let|long|native|new|null|of|package|private|protected|public|return|short|static|string|super|switch|synchronized|this|throw|throws|transient|true|try|type|typeof|undefined|var|void|volatile|while|with|yield|number|any|void|never|unknown|object|symbol|bigint',
    ts:          'abstract|arguments|async|await|boolean|break|byte|case|catch|char|class|const|continue|debugger|default|delete|do|double|else|enum|export|extends|false|final|finally|float|for|from|function|goto|if|implements|import|in|instanceof|int|interface|let|long|native|new|null|of|package|private|protected|public|return|short|static|string|super|switch|synchronized|this|throw|throws|transient|true|try|type|typeof|undefined|var|void|volatile|while|with|yield|number|any|void|never|unknown|object|symbol|bigint',
    python:      'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield',
    py:          'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield',
    bash:        'if|then|else|elif|fi|for|while|until|do|done|case|esac|function|return|exit|local|export|source|alias|unalias|cd|echo|printf|read|test|set|unset|shift|trap|getopts|in|select|declare|typeset|readonly|true|false',
    sh:          'if|then|else|elif|fi|for|while|until|do|done|case|esac|function|return|exit|local|export|source|alias|unalias|cd|echo|printf|read|test|set|unset|shift|trap|getopts|in|select|declare|typeset|readonly|true|false',
    css:         'import|charset|media|keyframes|font-face|page|supports|namespace|layer|property|initial|inherit|unset|revert|none|auto|block|inline|flex|grid|absolute|relative|fixed|sticky|static',
    html:        '',
    json:        '',
  };

  const keywords = keywordMap[l] || keywordMap.js;

  // 收集所有 token 位置，避免二次匹配
  const tokens = [];

  // 1) 多行注释 /* ... */
  if (l !== 'json' && l !== 'html' && l !== 'css') {
    const multiCommentRe = /\/\*[\s\S]*?\*\//g;
    let m;
    while ((m = multiCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
    // 单行注释 // ...  (不匹配 :// 如 https://)
    const singleCommentRe = /(?<![:\w])\/\/[^\n]*/g;
    while ((m = singleCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
  }
  // Python # 注释
  if (l === 'python' || l === 'py') {
    const pyCommentRe = /#[^\n]*/g;
    let m;
    while ((m = pyCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
  }
  // Bash # 注释
  if (l === 'bash' || l === 'sh') {
    const bashCommentRe = /#[^\n]*/g;
    let m;
    while ((m = bashCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
  }
  // HTML 注释 <!-- ... -->
  if (l === 'html') {
    const htmlCommentRe = /&lt;!--[\s\S]*?--&gt;/g;
    let m;
    while ((m = htmlCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
  }
  // CSS 注释
  if (l === 'css') {
    const cssCommentRe = /\/\*[\s\S]*?\*\//g;
    let m;
    while ((m = cssCommentRe.exec(escaped)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
  }

  // 2) 字符串 "..." '...' `...`
  const strRe = /(["'`])(?:(?!\1|\\).|\\.)*?\1/g;
  let sm;
  while ((sm = strRe.exec(escaped)) !== null) {
    tokens.push({ start: sm.index, end: sm.index + sm[0].length, type: 'string', text: sm[0] });
  }

  // 3) 数字
  const numRe = /\b(?:0x[\da-fA-F]+|0o[0-7]+|0b[01]+|\d+\.?\d*(?:e[+-]?\d+)?)\b/g;
  let nm;
  while ((nm = numRe.exec(escaped)) !== null) {
    tokens.push({ start: nm.index, end: nm.index + nm[0].length, type: 'number', text: nm[0] });
  }

  // 4) 关键词
  if (keywords) {
    const kwRe = new RegExp('\\b(?:' + keywords + ')\\b', 'g');
    let kw;
    while ((kw = kwRe.exec(escaped)) !== null) {
      tokens.push({ start: kw.index, end: kw.index + kw[0].length, type: 'keyword', text: kw[0] });
    }
  }

  // 5) 函数调用  identifier(
  const fnRe = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
  let fm;
  while ((fm = fnRe.exec(escaped)) !== null) {
    tokens.push({ start: fm.index, end: fm.index + fm[1].length, type: 'function', text: fm[1] });
  }

  // 排序并去重（优先 earlier + longer token）
  tokens.sort((a, b) => a.start - b.start || b.end - a.end);

  // 去掉重叠 token（保留先匹配到的）
  const filtered = [];
  let lastEnd = 0;
  for (const t of tokens) {
    if (t.start >= lastEnd) {
      filtered.push(t);
      lastEnd = t.end;
    }
  }

  // 拼接结果
  let result = '';
  let pos = 0;
  for (const t of filtered) {
    if (t.start > pos) {
      result += escaped.slice(pos, t.start);
    }
    const cls = `hl-${t.type}`;
    result += `<span class="${cls}">${t.text}</span>`;
    pos = t.end;
  }
  if (pos < escaped.length) {
    result += escaped.slice(pos);
  }

  return result;
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
 * 节流
 */
export function throttle(fn, interval = 200) {
  let lastTime = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = interval - (now - lastTime);
    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      lastTime = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
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
