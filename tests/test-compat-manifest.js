/**
 * QA005 — 浏览器兼容性测试：Manifest V3 格式
 *
 * 验证三个 manifest 文件（Chrome/Edge/Firefox）均符合 MV3 规范，
 * 权限声明最小化，结构正确，无 MV2 遗留字段。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadManifest(name) {
  const file = name === 'chrome' ? 'manifest.json' : `manifest.${name}.json`;
  return JSON.parse(readFileSync(join(ROOT, file), 'utf-8'));
}

const chrome  = loadManifest('chrome');
const edge    = loadManifest('edge');
const firefox = loadManifest('firefox');

// ==================== manifest_version ====================

describe('manifest_version = 3（MV3 格式）', () => {
  it('Chrome manifest_version 为 3', () => {
    assert.equal(chrome.manifest_version, 3);
  });

  it('Edge manifest_version 为 3', () => {
    assert.equal(edge.manifest_version, 3);
  });

  it('Firefox manifest_version 为 3', () => {
    assert.equal(firefox.manifest_version, 3);
  });
});

// ==================== 不含 MV2 遗留字段 ====================

describe('不含 MV2 遗留字段', () => {
  const mv2Fields = [
    'background.scripts',  // MV2 直接在 background 下的 scripts（非嵌套在 service_worker 里）
    'browser_action',
    'page_action',
    'web_accessible_resources',  // MV2 的 flat array 形式
  ];

  for (const manifest of [
    { name: 'Chrome', m: chrome },
    { name: 'Edge',   m: edge },
    { name: 'Firefox', m: firefox },
  ]) {
    it(`${manifest.name} 不含 browser_action（MV2 遗留）`, () => {
      assert.equal(manifest.m.browser_action, undefined);
    });

    it(`${manifest.name} 不含 page_action（MV2 遗留）`, () => {
      assert.equal(manifest.m.page_action, undefined);
    });

    it(`${manifest.name} 使用 action 而非 browser_action`, () => {
      assert.ok(manifest.m.action, `${manifest.name} 应有 action 字段`);
      assert.equal(typeof manifest.m.action, 'object');
    });
  }
});

// ==================== 权限声明最小化 ====================

describe('权限声明最小化', () => {
  const dangerousPerms = [
    'debugger', 'pageCapture', 'proxy', 'webRequestBlocking',
    'notifications', 'geolocation', 'nativeMessaging',
  ];

  for (const manifest of [
    { name: 'Chrome', m: chrome },
    { name: 'Edge',   m: edge },
    { name: 'Firefox', m: firefox },
  ]) {
    it(`${manifest.name} 不含危险/过度权限`, () => {
      const perms = manifest.m.permissions || [];
      for (const dp of dangerousPerms) {
        assert.ok(!perms.includes(dp), `${manifest.name} 不应请求 ${dp} 权限`);
      }
    });

    it(`${manifest.name} permissions 为数组`, () => {
      assert.ok(Array.isArray(manifest.m.permissions));
    });

    it(`${manifest.name} host_permissions 为数组`, () => {
      assert.ok(Array.isArray(manifest.m.host_permissions));
    });
  }
});

// ==================== Service Worker 声明 ====================

describe('Service Worker 声明', () => {
  it('Chrome 使用 background.service_worker', () => {
    assert.equal(typeof chrome.background.service_worker, 'string');
    assert.ok(chrome.background.service_worker.endsWith('.js'));
  });

  it('Edge 使用 background.service_worker', () => {
    assert.equal(typeof edge.background.service_worker, 'string');
  });

  it('Firefox 使用 background.scripts 数组（MV3 兼容方式）', () => {
    assert.ok(Array.isArray(firefox.background.scripts));
    assert.ok(firefox.background.scripts.length > 0);
    assert.ok(firefox.background.scripts[0].endsWith('.js'));
  });

  it('所有 manifest background.type = "module"', () => {
    assert.equal(chrome.background.type, 'module');
    assert.equal(edge.background.type, 'module');
    assert.equal(firefox.background.type, 'module');
  });
});

// ==================== content_security_policy ====================

describe('Content Security Policy', () => {
  it('Chrome CSP 为对象格式（MV3）', () => {
    assert.equal(typeof chrome.content_security_policy, 'object');
    assert.equal(typeof chrome.content_security_policy.extension_pages, 'string');
  });

  it('CSP 不允许 unsafe-eval', () => {
    const csp = chrome.content_security_policy.extension_pages;
    assert.ok(!csp.includes("'unsafe-eval'"), 'CSP 不应含 unsafe-eval');
  });

  it('CSP 不允许 unsafe-inline', () => {
    const csp = chrome.content_security_policy.extension_pages;
    assert.ok(!csp.includes("'unsafe-inline'"), 'CSP 不应含 unsafe-inline');
  });
});

// ==================== 侧边栏 API 差异 ====================

describe('侧边栏 API 差异', () => {
  it('Chrome 使用 sidePanel', () => {
    assert.ok(chrome.side_panel, 'Chrome manifest 应含 side_panel');
    assert.equal(typeof chrome.side_panel.default_path, 'string');
  });

  it('Edge 使用 sidePanel', () => {
    assert.ok(edge.side_panel, 'Edge manifest 应含 side_panel');
  });

  it('Firefox 使用 sidebar_action（MV3 兼容）', () => {
    assert.ok(firefox.sidebar_action, 'Firefox manifest 应含 sidebar_action');
    assert.equal(typeof firefox.sidebar_action.default_panel, 'string');
  });

  it('Firefox 不含 sidePanel（Firefox 不支持此 API）', () => {
    assert.equal(firefox.side_panel, undefined);
  });
});

// ==================== Firefox 特有字段 ====================

describe('Firefox 特有字段', () => {
  it('Firefox 含 browser_specific_settings.gecko', () => {
    assert.ok(firefox.browser_specific_settings);
    assert.ok(firefox.browser_specific_settings.gecko);
    assert.equal(typeof firefox.browser_specific_settings.gecko.id, 'string');
    assert.ok(firefox.browser_specific_settings.gecko.id.includes('@'));
  });

  it('Chrome/Edge 不含 browser_specific_settings', () => {
    assert.equal(chrome.browser_specific_settings, undefined);
    assert.equal(edge.browser_specific_settings, undefined);
  });
});

// ==================== 公共必需字段 ====================

describe('公共必需字段一致性', () => {
  const requiredFields = ['name', 'version', 'permissions', 'host_permissions', 'action', 'icons'];

  for (const manifest of [
    { name: 'Chrome',  m: chrome },
    { name: 'Edge',    m: edge },
    { name: 'Firefox', m: firefox },
  ]) {
    for (const field of requiredFields) {
      it(`${manifest.name} 含有 ${field}`, () => {
        assert.ok(manifest.m[field] !== undefined, `${manifest.name} 缺少 ${field}`);
      });
    }
  }
});

// ==================== 图标声明 ====================

describe('图标声明完整性', () => {
  for (const manifest of [
    { name: 'Chrome',  m: chrome },
    { name: 'Edge',    m: edge },
    { name: 'Firefox', m: firefox },
  ]) {
    it(`${manifest.name} 声明了 16/48/128 图标`, () => {
      const icons = manifest.m.icons;
      assert.ok(icons['16'], '缺少 16px 图标');
      assert.ok(icons['48'], '缺少 48px 图标');
      assert.ok(icons['128'], '缺少 128px 图标');
    });

    it(`${manifest.name} action.default_icon 声明了图标`, () => {
      const di = manifest.m.action.default_icon;
      assert.ok(di['16']);
      assert.ok(di['48']);
      assert.ok(di['128']);
    });
  }
});

// ==================== 最低版本声明 ====================

describe('最低浏览器版本声明', () => {
  it('Chrome 声明 minimum_chrome_version >= 100', () => {
    assert.ok(chrome.minimum_chrome_version, '应声明 minimum_chrome_version');
    const ver = parseInt(chrome.minimum_chrome_version, 10);
    assert.ok(ver >= 100, `minimum_chrome_version 应 >= 100, 实际: ${ver}`);
  });

  it('Edge 声明 minimum_chrome_version >= 100', () => {
    assert.ok(edge.minimum_chrome_version);
    const ver = parseInt(edge.minimum_chrome_version, 10);
    assert.ok(ver >= 100);
  });

  it('Firefox 声明 gecko strict_min_version >= 109', () => {
    const minVer = firefox.browser_specific_settings?.gecko?.strict_min_version;
    assert.ok(minVer, '应声明 strict_min_version');
    const ver = parseInt(minVer, 10);
    assert.ok(ver >= 109, `strict_min_version 应 >= 109, 实际: ${ver}`);
  });
});
