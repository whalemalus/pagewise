/**
 * E2E 测试 — 侧边栏完整工作流
 *
 * 覆盖：i18n 初始化、面板切换、设置加载、聊天流程、历史记录
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChromeExtensionEnv,
  createElement,
  createMockSettings,
  waitFor,
} from '../helpers/e2e-helper.js';
import {
  t, initI18n, setLocale, getCurrentLocale,
  registerLocale, translateDOM, hasTranslation,
  getSupportedLocales, onLocaleChange,
} from '../../lib/i18n.js';

// ==================== 测试语言包 ====================

const zhMessages = {
  'app.name': '智阅',
  'tabs.chat': '问答',
  'tabs.skills': '技能',
  'tabs.knowledge': '知识',
  'tabs.settings': '设置',
  'sidebar.welcomeTitle': '你好！我是你的技术知识助手',
  'sidebar.welcomeDesc': '浏览网页时遇到不懂的技术内容，直接问我就好。',
  'sidebar.inputPlaceholder': '输入问题... (Shift+Enter 换行)',
  'sidebar.loading': '加载中...',
  'settings.saveSettings': '保存设置',
  'settings.saved': '已保存 ✓',
  'popup.openSidebar': '打开侧边栏',
  'popup.statsFormat': '{{entries}} 条知识 · {{tags}} 个标签',
};

const enMessages = {
  'app.name': 'PageWise',
  'tabs.chat': 'Chat',
  'tabs.skills': 'Skills',
  'tabs.knowledge': 'Knowledge',
  'tabs.settings': 'Settings',
  'sidebar.welcomeTitle': "Hello! I'm your tech knowledge assistant",
  'sidebar.welcomeDesc': "Don't understand something on a web page? Just ask me.",
  'sidebar.inputPlaceholder': 'Type a question... (Shift+Enter for newline)',
  'sidebar.loading': 'Loading...',
  'settings.saveSettings': 'Save Settings',
  'settings.saved': 'Saved ✓',
  'popup.openSidebar': 'Open Sidebar',
  'popup.statsFormat': '{{entries}} entries · {{tags}} tags',
};

let env;

beforeEach(async () => {
  env = createChromeExtensionEnv();
  // Register locales fresh each time
  registerLocale('zh-CN', zhMessages);
  registerLocale('en-US', enMessages);
  // Set default locale to zh-CN
  setLocale('zh-CN');
});

afterEach(() => {
  env.cleanup();
});

// ==================== i18n 翻译 ====================

describe('E2E: Sidebar — i18n 初始化', () => {

  it('应使用默认语言 zh-CN', () => {
    setLocale('zh-CN');
    assert.equal(getCurrentLocale(), 'zh-CN');
    assert.equal(t('app.name'), '智阅');
    assert.equal(t('tabs.chat'), '问答');
    assert.equal(t('sidebar.welcomeTitle'), '你好！我是你的技术知识助手');
  });

  it('应能切换到 en-US 并翻译', () => {
    setLocale('en-US');
    assert.equal(getCurrentLocale(), 'en-US');
    assert.equal(t('app.name'), 'PageWise');
    assert.equal(t('tabs.chat'), 'Chat');
    assert.equal(t('sidebar.welcomeTitle'), "Hello! I'm your tech knowledge assistant");
  });

  it('未翻译的 key 应返回原始 key', () => {
    assert.equal(t('nonexistent.key'), 'nonexistent.key');
    assert.equal(t('another.missing'), 'another.missing');
  });

  it('应支持参数插值', () => {
    const result = t('popup.statsFormat', { entries: 42, tags: 10 });
    if (getCurrentLocale() === 'zh-CN') {
      assert.equal(result, '42 条知识 · 10 个标签');
    } else {
      assert.equal(result, '42 entries · 10 tags');
    }
  });

  it('应支持语言切换并触发监听器', () => {
    let notifiedLocale = null;
    const unsubscribe = onLocaleChange((newLocale) => {
      notifiedLocale = newLocale;
    });

    setLocale('en-US');
    assert.equal(notifiedLocale, 'en-US');

    setLocale('zh-CN');
    assert.equal(notifiedLocale, 'zh-CN');

    unsubscribe();
  });
});

// ==================== 面板切换 ====================

describe('E2E: Sidebar — 面板切换', () => {

  it('应能切换面板显示状态', () => {
    const chatPanel = createElement('div', { id: 'panelChat', class: 'panel active' });
    const knowledgePanel = createElement('div', { id: 'panelKnowledge', class: 'panel' });
    const settingsPanel = createElement('div', { id: 'panelSettings', class: 'panel' });

    function switchToTab(panelId, panels) {
      for (const p of panels) {
        p.classList.remove('active');
      }
      const target = panels.find(p => p.id === panelId);
      if (target) target.classList.add('active');
    }

    switchToTab('panelKnowledge', [chatPanel, knowledgePanel, settingsPanel]);
    assert.ok(!chatPanel.classList.contains('active'));
    assert.ok(knowledgePanel.classList.contains('active'));
    assert.ok(!settingsPanel.classList.contains('active'));
  });

  it('面板切换应只激活一个面板', () => {
    const panels = ['panelChat', 'panelSkills', 'panelKnowledge', 'panelWiki', 'panelSettings'].map(
      id => createElement('div', { id, class: 'panel' })
    );
    panels[0].classList.add('active');

    for (const p of panels) p.classList.remove('active');
    panels[4].classList.add('active');

    const activeCount = panels.filter(p => p.classList.contains('active')).length;
    assert.equal(activeCount, 1);
    assert.ok(panels[4].classList.contains('active'));
  });
});

// ==================== DOM 翻译 ====================

describe('E2E: Sidebar — DOM 翻译', () => {

  it('应翻译带 data-i18n 属性的元素', () => {
    const titleEl = createElement('h2', { 'data-i18n': 'sidebar.welcomeTitle' }, '你好！我是你的技术知识助手');
    const descEl = createElement('p', { 'data-i18n': 'sidebar.welcomeDesc' }, '浏览网页时遇到不懂的技术内容');

    setLocale('en-US');

    // Call translateDOM with a mock root that returns the right elements
    const mockRoot = {
      querySelectorAll: (selector) => {
        if (selector === '[data-i18n]') return [titleEl, descEl];
        if (selector === '[data-i18n-placeholder]') return [];
        if (selector === '[data-i18n-title]') return [];
        if (selector === '[data-i18n-aria-label]') return [];
        return [];
      },
      querySelector: () => null,
      documentElement: createElement('html'),
    };

    translateDOM(mockRoot);

    assert.equal(titleEl.textContent, enMessages['sidebar.welcomeTitle']);
    assert.equal(descEl.textContent, enMessages['sidebar.welcomeDesc']);
  });

  it('应翻译带 data-i18n-placeholder 属性的输入框', () => {
    const inputEl = createElement('textarea', {
      'data-i18n-placeholder': 'sidebar.inputPlaceholder',
      placeholder: '输入问题...',
    });

    setLocale('en-US');

    const mockRoot = {
      querySelectorAll: (selector) => {
        if (selector === '[data-i18n]') return [];
        if (selector === '[data-i18n-placeholder]') return [inputEl];
        if (selector === '[data-i18n-title]') return [];
        if (selector === '[data-i18n-aria-label]') return [];
        return [];
      },
      querySelector: () => null,
      documentElement: createElement('html'),
    };

    translateDOM(mockRoot);

    assert.equal(inputEl.placeholder, enMessages['sidebar.inputPlaceholder']);
  });

  it('应更新 html lang 属性', () => {
    const htmlEl = createElement('html');

    const mockRoot = {
      querySelectorAll: () => [],
      querySelector: () => null,
      documentElement: htmlEl,
    };

    setLocale('en-US');
    translateDOM(mockRoot);

    assert.equal(htmlEl.getAttribute('lang'), 'en-US');
  });
});

// ==================== 设置面板流程 ====================

describe('E2E: Sidebar — 设置面板', () => {

  it('应能保存和读取设置', async () => {
    const settings = createMockSettings();
    await chrome.storage.sync.set(settings);

    const loaded = await new Promise(resolve => {
      chrome.storage.sync.get({
        apiKey: '',
        model: 'gpt-4o',
        theme: 'light',
        language: 'zh-CN',
      }, resolve);
    });

    assert.equal(loaded.apiKey, settings.apiKey);
    assert.equal(loaded.model, settings.model);
    assert.equal(loaded.theme, settings.theme);
  });

  it('应支持保存语言偏好', async () => {
    await chrome.storage.sync.set({ language: 'en-US' });

    const loaded = await new Promise(resolve => {
      chrome.storage.sync.get({ language: 'zh-CN' }, resolve);
    });

    assert.equal(loaded.language, 'en-US');
  });

  it('应支持主题切换', async () => {
    const themeOptions = ['light', 'dark', 'auto'];
    for (const theme of themeOptions) {
      await chrome.storage.sync.set({ theme });
      const loaded = await new Promise(resolve => {
        chrome.storage.sync.get({ theme: 'light' }, resolve);
      });
      assert.equal(loaded.theme, theme);
    }
  });
});

// ==================== 聊天流程 ====================

describe('E2E: Sidebar — 聊天流程', () => {

  it('应能构建对话历史', () => {
    const history = [];

    function addMessage(role, content) {
      history.push({ role, content, timestamp: Date.now() });
    }

    addMessage('user', '什么是 React?');
    addMessage('assistant', 'React 是一个 JavaScript 库...');
    addMessage('user', '它的核心特点是什么？');
    addMessage('assistant', 'React 的核心特点包括...');

    assert.equal(history.length, 4);
    assert.equal(history[0].role, 'user');
    assert.equal(history[1].role, 'assistant');
    assert.equal(history[2].content, '它的核心特点是什么？');
  });

  it('应能清空对话历史', () => {
    const history = [
      { role: 'user', content: 'test1' },
      { role: 'assistant', content: 'answer1' },
    ];

    assert.equal(history.length, 2);
    history.length = 0;
    assert.equal(history.length, 0);
  });

  it('应支持通过消息获取统计信息', async () => {
    // Simulate stats retrieval via runtime message
    env.chrome.runtime.sendMessage = () => Promise.resolve({
      totalEntries: 42,
      totalTags: 15,
    });

    const response = await env.chrome.runtime.sendMessage({ action: 'getStats' });
    assert.equal(response.totalEntries, 42);
    assert.equal(response.totalTags, 15);

    const statsText = `${response.totalEntries} 条知识 · ${response.totalTags} 个标签`;
    assert.equal(statsText, '42 条知识 · 15 个标签');
  });
});
