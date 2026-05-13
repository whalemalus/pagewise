/**
 * E2E 测试 — 设置同步
 *
 * 覆盖：设置读写、语言偏好同步、配置 Profile、主题切换
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChromeExtensionEnv,
  createMockSettings,
  waitFor,
} from '../helpers/e2e-helper.js';
import {
  t, initI18n, setLocale, getCurrentLocale,
  registerLocale, setPreferredLanguage, getPreferredLanguage,
} from '../../lib/i18n.js';

let env;

beforeEach(() => {
  env = createChromeExtensionEnv();
});

afterEach(() => {
  env.cleanup();
});

// ==================== 设置读写 ====================

describe('E2E: Settings — 读写', () => {

  it('应能保存和读取完整设置', async () => {
    const settings = createMockSettings();
    await env.chrome.storage.sync.set(settings);

    const loaded = await new Promise(resolve => {
      env.chrome.storage.sync.get(null, resolve);
    });

    assert.equal(loaded.apiKey, settings.apiKey);
    assert.equal(loaded.apiProtocol, settings.apiProtocol);
    assert.equal(loaded.apiBaseUrl, settings.apiBaseUrl);
    assert.equal(loaded.model, settings.model);
    assert.equal(loaded.maxTokens, settings.maxTokens);
    assert.equal(loaded.autoExtract, settings.autoExtract);
    assert.equal(loaded.theme, settings.theme);
    assert.equal(loaded.language, settings.language);
  });

  it('应支持更新单个设置字段', async () => {
    await env.chrome.storage.sync.set({ theme: 'light' });
    await env.chrome.storage.sync.set({ theme: 'dark' });

    const loaded = await new Promise(resolve => {
      env.chrome.storage.sync.get({ theme: 'light' }, resolve);
    });
    assert.equal(loaded.theme, 'dark');
  });

  it('未设置的字段应返回默认值', async () => {
    const loaded = await new Promise(resolve => {
      env.chrome.storage.sync.get({
        apiKey: '',
        model: 'gpt-4o',
        theme: 'light',
        language: 'zh-CN',
      }, resolve);
    });

    assert.equal(loaded.apiKey, '');
    assert.equal(loaded.model, 'gpt-4o');
    assert.equal(loaded.theme, 'light');
    assert.equal(loaded.language, 'zh-CN');
  });

  it('应能清除所有设置', async () => {
    await env.chrome.storage.sync.set(createMockSettings());
    await env.chrome.storage.sync.clear();

    const loaded = await new Promise(resolve => {
      env.chrome.storage.sync.get(null, resolve);
    });

    assert.deepEqual(loaded, {});
  });
});

// ==================== 语言偏好同步 ====================

describe('E2E: Settings — 语言偏好同步', () => {

  it('应能保存语言偏好到 storage', async () => {
    registerLocale('zh-CN', { 'app.name': '智阅' });
    registerLocale('en-US', { 'app.name': 'PageWise' });

    await setPreferredLanguage('en-US');
    assert.equal(getCurrentLocale(), 'en-US');

    const loaded = await new Promise(resolve => {
      env.chrome.storage.sync.get({ language: 'zh-CN' }, resolve);
    });
    assert.equal(loaded.language, 'en-US');
  });

  it('应能读取已保存的语言偏好', async () => {
    await env.chrome.storage.sync.set({ language: 'en-US' });

    const preferred = await getPreferredLanguage();
    assert.equal(preferred, 'en-US');
  });

  it('语言切换后翻译应使用新语言', async () => {
    registerLocale('zh-CN', { 'app.name': '智阅' });
    registerLocale('en-US', { 'app.name': 'PageWise' });

    setLocale('zh-CN');
    assert.equal(t('app.name'), '智阅');

    setLocale('en-US');
    assert.equal(t('app.name'), 'PageWise');
  });

  it('语言切换应持久化到 storage', async () => {
    await setPreferredLanguage('en-US');

    // Verify in storage
    const stored = await new Promise(resolve => {
      env.chrome.storage.sync.get({ language: 'zh-CN' }, resolve);
    });
    assert.equal(stored.language, 'en-US');

    // Switch back
    await setPreferredLanguage('zh-CN');
    const stored2 = await new Promise(resolve => {
      env.chrome.storage.sync.get({ language: 'zh-CN' }, resolve);
    });
    assert.equal(stored2.language, 'zh-CN');
  });
});

// ==================== 配置 Profile ====================

describe('E2E: Settings — 配置 Profile', () => {

  it('应能保存多个配置 Profile', async () => {
    const profiles = [
      { id: 'default', name: '默认', settings: { model: 'gpt-4o', apiKey: 'sk-1' } },
      { id: 'work', name: '工作', settings: { model: 'claude-sonnet-4-6', apiKey: 'sk-ant-2' } },
    ];

    await env.chrome.storage.sync.set({ profiles, activeProfileId: 'default' });

    const loaded = await new Promise(resolve => {
      env.chrome.storage.sync.get({ profiles: [], activeProfileId: 'default' }, resolve);
    });

    assert.equal(loaded.profiles.length, 2);
    assert.equal(loaded.profiles[0].name, '默认');
    assert.equal(loaded.profiles[1].name, '工作');
    assert.equal(loaded.activeProfileId, 'default');
  });

  it('应能切换配置 Profile', async () => {
    const profiles = [
      { id: 'default', name: '默认', settings: { model: 'gpt-4o' } },
      { id: 'work', name: '工作', settings: { model: 'claude-sonnet-4-6' } },
    ];

    await env.chrome.storage.sync.set({ profiles, activeProfileId: 'default' });

    // Switch to work profile
    await env.chrome.storage.sync.set({ activeProfileId: 'work' });

    const loaded = await new Promise(resolve => {
      env.chrome.storage.sync.get({ activeProfileId: 'default' }, resolve);
    });
    assert.equal(loaded.activeProfileId, 'work');
  });

  it('应能删除配置 Profile', async () => {
    const profiles = [
      { id: 'default', name: '默认', settings: {} },
      { id: 'work', name: '工作', settings: {} },
    ];

    await env.chrome.storage.sync.set({ profiles });

    // Remove work profile
    const remaining = profiles.filter(p => p.id !== 'work');
    await env.chrome.storage.sync.set({ profiles: remaining });

    const loaded = await new Promise(resolve => {
      env.chrome.storage.sync.get({ profiles: [] }, resolve);
    });
    assert.equal(loaded.profiles.length, 1);
    assert.equal(loaded.profiles[0].id, 'default');
  });
});

// ==================== 主题切换 ====================

describe('E2E: Settings — 主题切换', () => {

  it('应能保存主题设置', async () => {
    for (const theme of ['light', 'dark', 'auto']) {
      await env.chrome.storage.sync.set({ theme });
      const loaded = await new Promise(resolve => {
        env.chrome.storage.sync.get({ theme: 'light' }, resolve);
      });
      assert.equal(loaded.theme, theme);
    }
  });

  it('主题应用应正确设置 body class', () => {
    // Simulate theme application to DOM
    function applyTheme(theme, bodyClassList) {
      bodyClassList.remove('theme-light');
      bodyClassList.remove('theme-dark');
      if (theme === 'dark') {
        bodyClassList.add('theme-dark');
      } else if (theme === 'light') {
        bodyClassList.add('theme-light');
      }
    }

    const mockBody = {
      _classes: new Set(),
      add(cls) { this._classes.add(cls); },
      remove(cls) { this._classes.delete(cls); },
      contains(cls) { return this._classes.has(cls); },
    };

    applyTheme('dark', mockBody);
    assert.ok(mockBody.contains('theme-dark'));
    assert.ok(!mockBody.contains('theme-light'));

    applyTheme('light', mockBody);
    assert.ok(!mockBody.contains('theme-dark'));
    assert.ok(mockBody.contains('theme-light'));
  });
});
