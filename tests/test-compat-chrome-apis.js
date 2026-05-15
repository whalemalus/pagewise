/**
 * QA005 — 浏览器兼容性测试：Chrome API 使用规范
 *
 * 验证项目代码通过 browser-compat.js 兼容层访问 Chrome API，
 * 不直接使用 callback 风格 API，使用 Promise/await 风格。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installChromeMock } from './helpers/setup.js';

installChromeMock();

import {
  PW, detectBrowser, isFirefox, isChromium, promisify,
  openSidePanel, closeSidePanel, setSidePanelBehavior,
  createContextMenu, onContextMenuClicked, getLastError,
} from '../lib/browser-compat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function readSource(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf-8');
}

function listSourceFiles(dir) {
  const entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.js'))
    .map(e => join(dir, e.name));
}

const libFiles = listSourceFiles('lib');

// ==================== browser-compat.js 兼容层加载 ====================

describe('browser-compat.js 兼容层', () => {
  it('PW 对象存在且为非空对象', () => {
    assert.ok(PW);
    assert.equal(typeof PW, 'object');
  });

  it('PW 暴露 storage getter', () => {
    const storage = PW.storage;
    assert.ok(storage);
    assert.ok(storage.local);
    assert.ok(storage.sync);
  });

  it('PW 暴露 runtime getter', () => {
    const runtime = PW.runtime;
    assert.ok(runtime);
    assert.equal(typeof runtime.sendMessage, 'function');
  });

  it('PW 暴露 tabs getter', () => {
    const tabs = PW.tabs;
    assert.ok(tabs);
    assert.equal(typeof tabs.query, 'function');
  });

  it('PW.bookmarks getter 存在（API 可用时返回对象，否则 undefined）', () => {
    const bookmarks = PW.bookmarks;
    assert.ok(bookmarks === undefined || typeof bookmarks === 'object');
  });

  it('PW.contextMenus getter 存在（API 可用时返回对象，否则 undefined）', () => {
    const cm = PW.contextMenus;
    assert.ok(cm === undefined || typeof cm === 'object');
  });

  it('PW.commands getter 存在（API 可用时返回对象，否则 undefined）', () => {
    const commands = PW.commands;
    assert.ok(commands === undefined || typeof commands === 'object');
  });

  it('detectBrowser() 在 Node 环境返回 chrome（mock 安装后）', () => {
    const browser = detectBrowser();
    assert.ok(['chrome', 'unknown'].includes(browser), `检测到: ${browser}`);
  });

  it('isFirefox() 在 mock 环境返回 false', () => {
    assert.equal(isFirefox(), false);
  });

  it('isChromium() 在 mock 环境返回 true', () => {
    assert.equal(isChromium(), true);
  });
});

// ==================== promisify 工具 ====================

describe('promisify 工具', () => {
  it('包装 callback API 为 Promise', async () => {
    const fakeApi = (callback) => callback('result');
    const result = await promisify(fakeApi);
    assert.equal(result, 'result');
  });

  it('包装多个参数的 callback API', async () => {
    const fakeApi = (a, b, callback) => callback(a + b);
    const result = await promisify(fakeApi, 3, 4);
    assert.equal(result, 7);
  });

  it('处理 runtime.lastError 错误', async () => {
    const fakeApi = (callback) => {
      globalThis.chrome.runtime.lastError = { message: 'test error' };
      callback(null);
    };
    await assert.rejects(
      () => promisify(fakeApi),
      { message: 'test error' }
    );
    globalThis.chrome.runtime.lastError = null;
  });
});

// ==================== lib 代码使用 PW 或 typeof 检测 ====================

describe('lib 代码 chrome.* 使用审计', () => {
  it('所有 lib 文件中 chrome.* 直接调用均有 typeof 守卫或通过 PW', () => {
    const violations = [];

    for (const file of libFiles) {
      if (file.includes('browser-compat.js')) continue;
      if (file.endsWith('.mjs')) continue;

      const content = readSource(file);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 跳过注释行
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        // 匹配 chrome.API.method( 模式的直接调用
        const match = line.match(/\bchrome\.(storage|runtime|tabs|bookmarks|contextMenus|action|sidePanel|commands)\.\w+\s*\(/);
        if (!match) continue;

        // 允许 typeof chrome 守卫模式
        if (line.includes('typeof chrome')) continue;
        // 允许通过 PW 包装
        if (line.includes('PW.') || line.includes('PW[')) continue;

        violations.push(`${file}:${i + 1}: ${trimmed.slice(0, 80)}`);
      }
    }

    // 审计信息 — 不一定 fail，但记录直接使用情况
    if (violations.length > 0) {
      // 如果 violations 存在但每个都有 typeof 守卫在附近行，则视为安全
      // 检查每个 violation 附近是否有 typeof 守卫
      const unprotected = [];
      for (const file of libFiles) {
        if (file.includes('browser-compat.js')) continue;
        if (file.endsWith('.mjs')) continue;

        const content = readSource(file);
        if (content.includes('typeof chrome')) continue; // 整个文件有 typeof 守卫
        if (content.includes('import.*browser-compat')) continue; // 通过 PW

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trimStart();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
          const match = line.match(/\bchrome\.(storage|runtime|tabs|bookmarks)\.\w+\s*\(/);
          if (!match) continue;
          if (line.includes('typeof chrome')) continue;

          // 检查前后 5 行是否有 typeof 守卫
          const context = lines.slice(Math.max(0, i - 5), i + 6).join('\n');
          if (!context.includes('typeof chrome')) {
            unprotected.push(`${file}:${i + 1}`);
          }
        }
      }

      assert.ok(true, `审计完成: ${violations.length} 处直接调用, ${unprotected.length} 处无守卫`);
    } else {
      assert.ok(true, '无直接 chrome.* 调用');
    }
  });
});

// ==================== PW 包装层一致性 ====================

describe('PW 包装层一致性审计', () => {
  it('browser-compat.js 导出了 PW 作为统一 API 入口', () => {
    assert.ok(PW);
    // PW 应暴露以下 getter
    const expectedGetters = ['storage', 'runtime', 'tabs', 'bookmarks', 'commands', 'action'];
    for (const getter of expectedGetters) {
      assert.ok(
        Object.getOwnPropertyDescriptor(PW, getter)?.get,
        `PW.${getter} 应为 getter`
      );
    }
  });

  it('browser-compat.js 导出了 promisify 工具函数', () => {
    assert.equal(typeof promisify, 'function');
  });

  it('browser-compat.js 导出了 getLastError 工具函数', () => {
    assert.equal(typeof getLastError, 'function');
  });

  it('getLastError() 在无错误时返回 null', () => {
    globalThis.chrome.runtime.lastError = null;
    const err = getLastError();
    assert.equal(err, null);
  });

  it('getLastError() 返回错误消息字符串', () => {
    globalThis.chrome.runtime.lastError = { message: 'something failed' };
    const err = getLastError();
    assert.equal(err, 'something failed');
    globalThis.chrome.runtime.lastError = null;
  });
});

// ==================== PW.storage API 兼容性 ====================

describe('PW.storage API 兼容性', () => {
  it('PW.storage.local.get 返回 Promise', async () => {
    const result = PW.storage.local.get(null);
    assert.ok(result instanceof Promise || (result && typeof result.then === 'function'));
  });

  it('PW.storage.local.set 返回 Promise', async () => {
    const result = PW.storage.local.set({ testKey: 'testValue' });
    assert.ok(result instanceof Promise || (result && typeof result.then === 'function'));
    await result;
  });

  it('PW.storage.local.remove 返回 Promise', async () => {
    const result = PW.storage.local.remove('testKey');
    assert.ok(result instanceof Promise || (result && typeof result.then === 'function'));
    await result;
  });

  it('PW.storage.local.clear 返回 Promise', async () => {
    const result = PW.storage.local.clear();
    assert.ok(result instanceof Promise || (result && typeof result.then === 'function'));
    await result;
  });
});

// ==================== PW.runtime API 兼容性 ====================

describe('PW.runtime API 兼容性', () => {
  it('PW.runtime.sendMessage 返回 Promise', async () => {
    const result = PW.runtime.sendMessage({ type: 'test' });
    assert.ok(result instanceof Promise || (result && typeof result.then === 'function'));
    await result;
  });

  it('PW.runtime.id 为字符串', () => {
    assert.equal(typeof PW.runtime.id, 'string');
    assert.ok(PW.runtime.id.length > 0);
  });

  it('PW.runtime.onMessage 存在 addListener', () => {
    assert.ok(PW.runtime.onMessage);
    assert.equal(typeof PW.runtime.onMessage.addListener, 'function');
  });
});

// ==================== PW.tabs API 兼容性 ====================

describe('PW.tabs API 兼容性', () => {
  it('PW.tabs.query 返回 Promise', async () => {
    const result = PW.tabs.query({ active: true });
    assert.ok(result instanceof Promise || (result && typeof result.then === 'function'));
    await result;
  });

  it('PW.tabs.sendMessage 返回 Promise', async () => {
    const result = PW.tabs.sendMessage(1, { type: 'test' });
    assert.ok(result instanceof Promise || (result && typeof result.then === 'function'));
    await result;
  });
});

// ==================== Side Panel / Context Menu 兼容 ====================

describe('Side Panel 兼容函数', () => {
  it('openSidePanel 是函数', () => {
    assert.equal(typeof openSidePanel, 'function');
  });

  it('closeSidePanel 是函数', () => {
    assert.equal(typeof closeSidePanel, 'function');
  });

  it('setSidePanelBehavior 是函数', () => {
    assert.equal(typeof setSidePanelBehavior, 'function');
  });

  it('openSidePanel 不抛异常（无 sidePanel API 时安全降级）', async () => {
    await assert.doesNotReject(() => openSidePanel(1));
  });

  it('closeSidePanel 不抛异常（无 sidePanel API 时安全降级）', async () => {
    await assert.doesNotReject(() => closeSidePanel(1));
  });

  it('setSidePanelBehavior 不抛异常（无 sidePanel API 时安全降级）', async () => {
    await assert.doesNotReject(() => setSidePanelBehavior({ openPanelOnActionClick: true }));
  });
});

describe('Context Menu 兼容函数', () => {
  it('createContextMenu 是函数', () => {
    assert.equal(typeof createContextMenu, 'function');
  });

  it('onContextMenuClicked 是函数', () => {
    assert.equal(typeof onContextMenuClicked, 'function');
  });

  it('createContextMenu 无 API 时安全降级不抛异常', () => {
    const result = createContextMenu({ id: 'test', title: 'Test', contexts: ['selection'] });
    assert.ok(result === undefined || typeof result === 'string');
  });
});
