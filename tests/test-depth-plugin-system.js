/**
 * test-depth-plugin-system.js — Plugin System 深度测试
 *
 * 测试范围:
 *   注册插件    — registerPlugin、重复注册更新、上限
 *   启用/禁用   — updatePluginStatus 流转
 *   插件生命周期 — install → enable → disable → uninstall
 *   错误隔离    — 验证失败、依赖缺失、被依赖保护、批量部分失败
 *   卸载        — unregisterPlugin、依赖检查
 *   版本工具    — parseVersion / compareVersions / satisfiesVersion
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';

// 安装 mock（必须在 import 之前）
installChromeMock();
installIndexedDBMock();

const {
  parseVersion,
  compareVersions,
  satisfiesVersion,
  validatePlugin,
  PluginRegistry,
  PluginManager,
} = await import('../lib/plugin-system.js');

// ==================== 辅助函数 ====================

function makeManifest(overrides = {}) {
  return {
    id: 'test-plugin',
    name: '测试插件',
    version: '1.0.0',
    description: '深度测试插件',
    author: '测试者',
    prompt: '请处理 {{input}}',
    category: 'custom',
    parameters: [{ name: 'input', type: 'string', description: '输入内容', required: true }],
    trigger: { type: 'manual' },
    tags: ['测试'],
    ...overrides,
  };
}

// ==================== 测试 ====================

describe('Plugin System 深度测试', () => {

  // ─── 1. 版本工具 ──────────────────────────────────────────────────────

  describe('版本工具 — parseVersion / compareVersions / satisfiesVersion', () => {
    it('1. parseVersion 解析标准 semver 和 pre-release', () => {
      const v1 = parseVersion('1.2.3');
      assert.equal(v1.major, 1);
      assert.equal(v1.minor, 2);
      assert.equal(v1.patch, 3);
      assert.equal(v1.prerelease, '');

      const v2 = parseVersion('2.0.0-rc.1');
      assert.equal(v2.major, 2);
      assert.equal(v2.prerelease, 'rc.1');
    });

    it('2. compareVersions major/minor/patch 三级排序', () => {
      assert.equal(compareVersions('2.0.0', '1.0.0'), 1);
      assert.equal(compareVersions('1.2.0', '1.1.0'), 1);
      assert.equal(compareVersions('1.0.2', '1.0.1'), 1);
      assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
      // 正式版优先于 pre-release
      assert.equal(compareVersions('1.0.0', '1.0.0-alpha'), 1);
      assert.equal(compareVersions('1.0.0-alpha', '1.0.0'), -1);
    });

    it('3. satisfiesVersion caret ^ / tilde ~ / >= / 精确匹配', () => {
      // caret
      assert.equal(satisfiesVersion('1.5.0', '^1.0.0'), true);
      assert.equal(satisfiesVersion('2.0.0', '^1.0.0'), false);
      // tilde
      assert.equal(satisfiesVersion('1.2.5', '~1.2.0'), true);
      assert.equal(satisfiesVersion('1.1.0', '~1.2.0'), false);
      // >=
      assert.equal(satisfiesVersion('3.0.0', '>=1.0.0'), true);
      assert.equal(satisfiesVersion('0.9.0', '>=1.0.0'), false);
      // exact
      assert.equal(satisfiesVersion('1.0.0', '1.0.0'), true);
      assert.equal(satisfiesVersion('1.0.1', '1.0.0'), false);
      // empty/null → always true
      assert.equal(satisfiesVersion('9.9.9', ''), true);
      assert.equal(satisfiesVersion('9.9.9', null), true);
    });
  });

  // ─── 2. 插件验证 ──────────────────────────────────────────────────────

  describe('插件验证 — validatePlugin', () => {
    it('4. 完整有效 manifest 返回 valid:true，零错误', () => {
      const result = validatePlugin(makeManifest());
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('5. 缺失所有必填字段时，errors 包含 id/name/version/prompt 四项', () => {
      const result = validatePlugin({});
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('id')));
      assert.ok(result.errors.some(e => e.includes('name')));
      assert.ok(result.errors.some(e => e.includes('version')));
      assert.ok(result.errors.some(e => e.includes('prompt')));
    });

    it('6. 非对象输入（null/字符串/数字）均返回 invalid', () => {
      for (const input of [null, 'string', 42, undefined]) {
        const result = validatePlugin(input);
        assert.equal(result.valid, false);
        assert.ok(result.errors.length >= 1);
      }
    });
  });

  // ─── 3. 注册插件 ──────────────────────────────────────────────────────

  describe('注册插件 — PluginRegistry', () => {
    let registry;

    beforeEach(() => {
      resetIndexedDBMock();
      resetChromeMock();
      registry = new PluginRegistry();
    });

    it('7. registerPlugin 后 status 默认为 installed，license 默认为 MIT', async () => {
      const record = await registry.registerPlugin(makeManifest());
      assert.equal(record.status, 'installed');
      assert.equal(record.license, 'MIT');
      assert.ok(record.installedAt > 0);
      assert.ok(record.updatedAt > 0);
    });

    it('8. 重复注册同 ID 同版本保留原 installedAt（更新场景）', async () => {
      const first = await registry.registerPlugin(makeManifest());
      const second = await registry.registerPlugin(makeManifest({ description: '更新描述' }));
      assert.equal(first.installedAt, second.installedAt);
      assert.equal(second.description, '更新描述');
    });

    it('9. getInstalled / getPlugin / isInstalled 联动正确', async () => {
      await registry.registerPlugin(makeManifest({ id: 'alpha' }));
      await registry.registerPlugin(makeManifest({ id: 'beta', version: '2.0.0' }));

      const all = await registry.getInstalled();
      assert.equal(all.length, 2);

      const alpha = await registry.getPlugin('alpha');
      assert.equal(alpha.id, 'alpha');
      assert.equal(alpha.version, '1.0.0');

      assert.equal(await registry.isInstalled('alpha'), true);
      assert.equal(await registry.isInstalled('nonexistent'), false);
    });
  });

  // ─── 4. 启用/禁用 ─────────────────────────────────────────────────────

  describe('启用/禁用 — 状态流转', () => {
    let registry;

    beforeEach(() => {
      resetIndexedDBMock();
      resetChromeMock();
      registry = new PluginRegistry();
    });

    it('10. 禁用后 status 变为 disabled，启用后恢复为 installed', async () => {
      await registry.registerPlugin(makeManifest());

      await registry.updatePluginStatus('test-plugin', 'disabled');
      let p = await registry.getPlugin('test-plugin');
      assert.equal(p.status, 'disabled');

      await registry.updatePluginStatus('test-plugin', 'installed');
      p = await registry.getPlugin('test-plugin');
      assert.equal(p.status, 'installed');
    });

    it('11. updatePluginStatus 不存在的插件抛出"插件不存在"错误', async () => {
      await assert.rejects(
        () => registry.updatePluginStatus('ghost', 'disabled'),
        /插件不存在/
      );
    });
  });

  // ─── 5. 插件生命周期 ──────────────────────────────────────────────────

  describe('插件生命周期 — PluginManager', () => {
    let manager;

    beforeEach(() => {
      resetIndexedDBMock();
      resetChromeMock();
      manager = new PluginManager();
    });

    it('12. 完整生命周期 install → disable → enable → uninstall', async () => {
      // install
      const record = await manager.install(makeManifest());
      assert.equal(record.status, 'installed');
      assert.ok(await manager.registry.isInstalled('test-plugin'));

      // disable
      await manager.disable('test-plugin');
      let p = await manager.registry.getPlugin('test-plugin');
      assert.equal(p.status, 'disabled');

      // enable
      await manager.enable('test-plugin');
      p = await manager.registry.getPlugin('test-plugin');
      assert.equal(p.status, 'installed');

      // uninstall
      await manager.uninstall('test-plugin');
      assert.equal(await manager.registry.isInstalled('test-plugin'), false);
    });

    it('13. install 验证失败不注册，注册表保持空', async () => {
      await assert.rejects(
        () => manager.install({ id: '', name: '', prompt: '' }),
        /插件验证失败/
      );
      const all = await manager.registry.getInstalled();
      assert.equal(all.length, 0);
    });
  });

  // ─── 6. 错误隔离 ──────────────────────────────────────────────────────

  describe('错误隔离', () => {
    let manager;

    beforeEach(() => {
      resetIndexedDBMock();
      resetChromeMock();
      manager = new PluginManager();
    });

    it('14. 卸载被依赖的插件抛出错误，不影响被依赖插件的数据', async () => {
      // 安装基础插件
      await manager.install(makeManifest({ id: 'base', name: '基础', version: '1.0.0' }));
      // 安装依赖者
      await manager.install(makeManifest({
        id: 'consumer',
        name: '消费者',
        dependencies: { base: '^1.0.0' },
      }));

      // 尝试卸载被依赖的 base → 应该失败
      await assert.rejects(
        () => manager.uninstall('base'),
        /被以下插件依赖/
      );

      // base 仍存在
      assert.ok(await manager.registry.isInstalled('base'));
      // consumer 也仍存在
      assert.ok(await manager.registry.isInstalled('consumer'));
    });

    it('15. 批量导入中部分失败不影响成功项，返回正确计数', async () => {
      const items = [
        makeManifest({ id: 'good-1', name: '好1' }),
        { id: '', name: '', prompt: '' }, // 无效 → 失败
        makeManifest({ id: 'good-2', name: '好2', version: '2.0.0' }),
        makeManifest({ id: 'good-1', name: '好1' }), // 重复 → 冲突失败
      ];
      const result = await manager.importBatch(items);
      assert.equal(result.success, 2);    // good-1, good-2
      assert.equal(result.failed, 2);     // 无效 + 重复
      assert.equal(result.errors.length, 2);
      assert.ok(await manager.registry.isInstalled('good-1'));
      assert.ok(await manager.registry.isInstalled('good-2'));
    });
  });
});
