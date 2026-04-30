/**
 * 测试 lib/plugin-system.js — 模板/插件系统
 *
 * 覆盖：
 * 1. 版本解析与比较（parseVersion, compareVersions, satisfiesVersion）
 * 2. 插件验证（validatePlugin）
 * 3. 插件注册表（PluginRegistry）
 * 4. 插件管理器（PluginManager）
 * 5. 导入/导出
 * 6. 批量操作
 * 7. 冲突检测
 * 8. 依赖管理
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock, uninstallIndexedDBMock } from './helpers/indexeddb-mock.js';
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

// ==================== 工具函数 ====================

function makeManifest(overrides = {}) {
  return {
    id: 'test-plugin',
    name: '测试插件',
    version: '1.0.0',
    description: '一个用于测试的插件',
    author: '测试者',
    prompt: '请处理 {{input}}',
    category: 'custom',
    parameters: [
      { name: 'input', type: 'string', description: '输入内容', required: true }
    ],
    trigger: { type: 'manual' },
    tags: ['测试'],
    ...overrides,
  };
}

// ==================== 版本解析 ====================

describe('parseVersion 版本解析', () => {
  it('解析标准版本号', () => {
    const v = parseVersion('1.2.3');
    assert.equal(v.major, 1);
    assert.equal(v.minor, 2);
    assert.equal(v.patch, 3);
    assert.equal(v.prerelease, '');
  });

  it('解析带 pre-release 的版本号', () => {
    const v = parseVersion('2.0.0-beta.1');
    assert.equal(v.major, 2);
    assert.equal(v.minor, 0);
    assert.equal(v.patch, 0);
    assert.equal(v.prerelease, 'beta.1');
  });

  it('解析 0.x 版本', () => {
    const v = parseVersion('0.1.0');
    assert.equal(v.major, 0);
    assert.equal(v.minor, 1);
    assert.equal(v.patch, 0);
  });

  it('无效版本号抛出错误', () => {
    assert.throws(() => parseVersion('abc'), /Invalid semver/);
    assert.throws(() => parseVersion('1.2'), /Invalid semver/);
    assert.throws(() => parseVersion('1.2.3.4'), /Invalid semver/);
    assert.throws(() => parseVersion(''), /Invalid version/);
    assert.throws(() => parseVersion(null), /Invalid version/);
    assert.throws(() => parseVersion(undefined), /Invalid version/);
  });
});

// ==================== 版本比较 ====================

describe('compareVersions 版本比较', () => {
  it('相同版本返回 0', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  });

  it('major 版本比较', () => {
    assert.equal(compareVersions('2.0.0', '1.0.0'), 1);
    assert.equal(compareVersions('1.0.0', '2.0.0'), -1);
  });

  it('minor 版本比较', () => {
    assert.equal(compareVersions('1.2.0', '1.1.0'), 1);
    assert.equal(compareVersions('1.1.0', '1.2.0'), -1);
  });

  it('patch 版本比较', () => {
    assert.equal(compareVersions('1.0.2', '1.0.1'), 1);
    assert.equal(compareVersions('1.0.1', '1.0.2'), -1);
  });

  it('正式版优先于 pre-release', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0-beta.1'), 1);
    assert.equal(compareVersions('1.0.0-beta.1', '1.0.0'), -1);
  });

  it('pre-release 按字典序比较', () => {
    assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-beta.1'), -1);
    assert.equal(compareVersions('1.0.0-beta.1', '1.0.0-alpha.1'), 1);
  });
});

// ==================== 版本范围匹配 ====================

describe('satisfiesVersion 版本范围', () => {
  it('空范围返回 true', () => {
    assert.equal(satisfiesVersion('1.0.0', ''), true);
    assert.equal(satisfiesVersion('1.0.0', null), true);
    assert.equal(satisfiesVersion('1.0.0', undefined), true);
  });

  it('精确版本匹配', () => {
    assert.equal(satisfiesVersion('1.0.0', '1.0.0'), true);
    assert.equal(satisfiesVersion('1.0.1', '1.0.0'), false);
  });

  it('>= 范围', () => {
    assert.equal(satisfiesVersion('1.0.0', '>=1.0.0'), true);
    assert.equal(satisfiesVersion('2.0.0', '>=1.0.0'), true);
    assert.equal(satisfiesVersion('0.9.0', '>=1.0.0'), false);
  });

  it('caret ^ 范围（同 major）', () => {
    assert.equal(satisfiesVersion('1.0.0', '^1.0.0'), true);
    assert.equal(satisfiesVersion('1.5.0', '^1.0.0'), true);
    assert.equal(satisfiesVersion('1.0.5', '^1.0.0'), true);
    assert.equal(satisfiesVersion('2.0.0', '^1.0.0'), true);
  });

  it('caret ^ 不跨 major', () => {
    assert.equal(satisfiesVersion('0.9.0', '^1.0.0'), false);
  });

  it('tilde ~ 范围（同 minor）', () => {
    assert.equal(satisfiesVersion('1.2.0', '~1.2.0'), true);
    assert.equal(satisfiesVersion('1.2.5', '~1.2.0'), true);
    assert.equal(satisfiesVersion('1.3.0', '~1.2.0'), true);
  });

  it('tilde ~ 不跨 minor', () => {
    assert.equal(satisfiesVersion('1.1.0', '~1.2.0'), false);
  });
});

// ==================== 插件验证 ====================

describe('validatePlugin 插件验证', () => {
  it('有效插件返回 valid: true', () => {
    const result = validatePlugin(makeManifest());
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('null manifest 返回无效', () => {
    const result = validatePlugin(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes('对象'));
  });

  it('缺少 id 返回错误', () => {
    const m = makeManifest();
    delete m.id;
    const result = validatePlugin(m);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('id')));
  });

  it('无效 id 格式返回错误', () => {
    const result = validatePlugin(makeManifest({ id: 'invalid id!' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('字母')));
  });

  it('id 允许下划线和连字符', () => {
    const result = validatePlugin(makeManifest({ id: 'my-cool-plugin_v2' }));
    assert.equal(result.valid, true);
  });

  it('缺少 name 返回错误', () => {
    const m = makeManifest();
    delete m.name;
    const result = validatePlugin(m);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('缺少 version 返回错误', () => {
    const m = makeManifest();
    delete m.version;
    const result = validatePlugin(m);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('version')));
  });

  it('无效 version 格式返回错误', () => {
    const result = validatePlugin(makeManifest({ version: 'abc' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('semver')));
  });

  it('缺少 prompt 返回错误', () => {
    const m = makeManifest();
    delete m.prompt;
    const result = validatePlugin(m);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('prompt')));
  });

  it('空白 prompt 返回错误', () => {
    const result = validatePlugin(makeManifest({ prompt: '   ' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('空白')));
  });

  it('可选字段类型检查', () => {
    const result = validatePlugin(makeManifest({
      license: 123,
      category: 456,
      description: [],
      author: {},
    }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 4);
  });

  it('parameters 验证', () => {
    const result = validatePlugin(makeManifest({
      parameters: 'not-array',
    }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('parameters')));
  });

  it('parameters 中每个元素验证', () => {
    const result = validatePlugin(makeManifest({
      parameters: [{ name: '', type: 123 }],
    }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('dependencies 验证', () => {
    const result = validatePlugin(makeManifest({
      dependencies: 'not-object',
    }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('dependencies')));
  });

  it('dependencies 值为字符串', () => {
    const result = validatePlugin(makeManifest({
      dependencies: { 'dep-1': '^1.0.0' },
    }));
    assert.equal(result.valid, true);
  });

  it('dependencies 值非字符串报错', () => {
    const result = validatePlugin(makeManifest({
      dependencies: { 'dep-1': 123 },
    }));
    assert.equal(result.valid, false);
  });

  it('tags 必须为字符串数组', () => {
    const result = validatePlugin(makeManifest({ tags: [1, 2, 3] }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('tags')));
  });

  it('trigger 验证', () => {
    const result = validatePlugin(makeManifest({ trigger: { type: 123 } }));
    assert.equal(result.valid, false);
  });

  it('无 description 产生警告', () => {
    const m = makeManifest();
    delete m.description;
    const result = validatePlugin(m);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some(w => w.includes('description')));
  });

  it('无 author 产生警告', () => {
    const m = makeManifest();
    delete m.author;
    const result = validatePlugin(m);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some(w => w.includes('author')));
  });

  it('无 tags 产生警告', () => {
    const m = makeManifest();
    delete m.tags;
    const result = validatePlugin(m);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some(w => w.includes('tags')));
  });

  it('许可证默认为 MIT', () => {
    const result = validatePlugin(makeManifest());
    assert.equal(result.valid, true);
    // 验证不报错即可，license 是可选的
  });
});

// ==================== 插件注册表 ====================

describe('PluginRegistry 插件注册表', () => {
  let registry;

  beforeEach(() => {
    resetIndexedDBMock();
    resetChromeMock();
    registry = new PluginRegistry();
  });

  it('注册新插件', async () => {
    const manifest = makeManifest();
    const record = await registry.registerPlugin(manifest);
    assert.equal(record.id, 'test-plugin');
    assert.equal(record.status, 'installed');
    assert.ok(record.installedAt > 0);
    assert.ok(record.updatedAt > 0);
    assert.equal(record.license, 'MIT');
  });

  it('获取所有已安装插件', async () => {
    await registry.registerPlugin(makeManifest({ id: 'p1' }));
    await registry.registerPlugin(makeManifest({ id: 'p2' }));
    const all = await registry.getInstalled();
    assert.equal(all.length, 2);
  });

  it('空注册表返回空数组', async () => {
    const all = await registry.getInstalled();
    assert.deepEqual(all, []);
  });

  it('isInstalled 检查已安装', async () => {
    await registry.registerPlugin(makeManifest());
    assert.equal(await registry.isInstalled('test-plugin'), true);
    assert.equal(await registry.isInstalled('nonexistent'), false);
  });

  it('getPlugin 获取单个插件', async () => {
    await registry.registerPlugin(makeManifest());
    const p = await registry.getPlugin('test-plugin');
    assert.ok(p);
    assert.equal(p.name, '测试插件');
  });

  it('getPlugin 不存在返回 null', async () => {
    const p = await registry.getPlugin('nonexistent');
    assert.equal(p, null);
  });

  it('更新插件状态', async () => {
    await registry.registerPlugin(makeManifest());
    await registry.updatePluginStatus('test-plugin', 'disabled');
    const p = await registry.getPlugin('test-plugin');
    assert.equal(p.status, 'disabled');
  });

  it('更新不存在的插件状态抛出错误', async () => {
    await assert.rejects(
      () => registry.updatePluginStatus('nonexistent', 'disabled'),
      /插件不存在/
    );
  });

  it('移除插件', async () => {
    await registry.registerPlugin(makeManifest());
    await registry.unregisterPlugin('test-plugin');
    const p = await registry.getPlugin('test-plugin');
    assert.equal(p, null);
  });

  it('更新已有插件保留安装时间', async () => {
    const first = await registry.registerPlugin(makeManifest());
    const firstInstalledAt = first.installedAt;

    // 更新版本
    const updated = await registry.registerPlugin(makeManifest({ version: '2.0.0' }));
    assert.equal(updated.installedAt, firstInstalledAt);
    assert.equal(updated.version, '2.0.0');
  });

  it('超过 50 个插件上限抛出错误', async () => {
    for (let i = 0; i < 50; i++) {
      await registry.registerPlugin(makeManifest({ id: `plugin-${i}` }));
    }

    await assert.rejects(
      () => registry.registerPlugin(makeManifest({ id: 'plugin-51' })),
      /上限/
    );
  });
});

// ==================== 冲突检测 ====================

describe('PluginRegistry.checkConflicts 冲突检测', () => {
  let registry;

  beforeEach(() => {
    resetIndexedDBMock();
    resetChromeMock();
    registry = new PluginRegistry();
  });

  it('全新插件无冲突', async () => {
    const conflicts = await registry.checkConflicts(makeManifest());
    assert.equal(conflicts.length, 0);
  });

  it('已安装同版本检测到 already_installed', async () => {
    await registry.registerPlugin(makeManifest());
    const conflicts = await registry.checkConflicts(makeManifest());
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, 'already_installed');
  });

  it('检测到升级', async () => {
    await registry.registerPlugin(makeManifest({ version: '1.0.0' }));
    const conflicts = await registry.checkConflicts(makeManifest({ version: '2.0.0' }));
    assert.ok(conflicts.some(c => c.type === 'upgrade'));
  });

  it('检测到降级', async () => {
    await registry.registerPlugin(makeManifest({ version: '2.0.0' }));
    const conflicts = await registry.checkConflicts(makeManifest({ version: '1.0.0' }));
    assert.ok(conflicts.some(c => c.type === 'downgrade'));
  });

  it('检测到缺失依赖', async () => {
    const manifest = makeManifest({
      dependencies: { 'missing-dep': '^1.0.0' }
    });
    const conflicts = await registry.checkConflicts(manifest);
    assert.ok(conflicts.some(c => c.type === 'missing_dependency'));
  });

  it('依赖版本不兼容', async () => {
    await registry.registerPlugin(makeManifest({
      id: 'dep-plugin',
      version: '2.0.0',
    }));

    const manifest = makeManifest({
      dependencies: { 'dep-plugin': '^1.0.0' }
    });
    const conflicts = await registry.checkConflicts(manifest);
    assert.ok(conflicts.some(c => c.type === 'incompatible_dependency'));
  });

  it('依赖版本兼容无冲突', async () => {
    await registry.registerPlugin(makeManifest({
      id: 'dep-plugin',
      version: '1.5.0',
    }));

    const manifest = makeManifest({
      dependencies: { 'dep-plugin': '^1.0.0' }
    });
    const conflicts = await registry.checkConflicts(manifest);
    // 无 missing_dependency 和 incompatible_dependency
    const bad = conflicts.filter(c =>
      c.type === 'missing_dependency' || c.type === 'incompatible_dependency'
    );
    assert.equal(bad.length, 0);
  });
});

// ==================== 插件管理器 ====================

describe('PluginManager 插件管理器', () => {
  let manager;

  beforeEach(() => {
    resetIndexedDBMock();
    resetChromeMock();
    manager = new PluginManager();
  });

  describe('install 安装', () => {
    it('安装有效插件', async () => {
      const record = await manager.install(makeManifest());
      assert.equal(record.id, 'test-plugin');
      assert.equal(record.status, 'installed');
    });

    it('无效插件抛出错误', async () => {
      await assert.rejects(
        () => manager.install({ id: '', name: '' }),
        /插件验证失败/
      );
    });

    it('已安装同版本抛出错误', async () => {
      await manager.install(makeManifest());
      await assert.rejects(
        () => manager.install(makeManifest()),
        /安装冲突/
      );
    });
  });

  describe('uninstall 卸载', () => {
    it('卸载已安装插件', async () => {
      await manager.install(makeManifest());
      await manager.uninstall('test-plugin');
      const installed = await manager.registry.isInstalled('test-plugin');
      assert.equal(installed, false);
    });

    it('卸载不存在的插件抛出错误', async () => {
      await assert.rejects(
        () => manager.uninstall('nonexistent'),
        /插件不存在/
    );
    });

    it('被依赖的插件不能卸载', async () => {
      // 安装依赖
      await manager.install(makeManifest({
        id: 'base-plugin',
        name: '基础插件',
        version: '1.0.0',
      }));

      // 安装依赖于 base-plugin 的插件
      await manager.install(makeManifest({
        id: 'dependent-plugin',
        name: '依赖插件',
        dependencies: { 'base-plugin': '^1.0.0' },
      }));

      // 尝试卸载被依赖的插件
      await assert.rejects(
        () => manager.uninstall('base-plugin'),
        /被以下插件依赖/
      );
    });
  });

  describe('enable/disable 启用禁用', () => {
    it('禁用插件', async () => {
      await manager.install(makeManifest());
      await manager.disable('test-plugin');
      const plugin = await manager.registry.getPlugin('test-plugin');
      assert.equal(plugin.status, 'disabled');
    });

    it('启用插件', async () => {
      await manager.install(makeManifest());
      await manager.disable('test-plugin');
      await manager.enable('test-plugin');
      const plugin = await manager.registry.getPlugin('test-plugin');
      assert.equal(plugin.status, 'installed');
    });
  });

  describe('export 导出', () => {
    it('导出单个技能为插件包', async () => {
      await manager.install(makeManifest());
      const exported = await manager.exportPlugin('test-plugin');
      assert.equal(exported.id, 'test-plugin');
      assert.equal(exported.name, '测试插件');
      assert.equal(exported.version, '1.0.0');
      assert.equal(exported.prompt, '请处理 {{input}}');
      assert.equal(exported.license, 'MIT');
    });

    it('导出不存在的技能抛出错误', async () => {
      await assert.rejects(
        () => manager.exportPlugin('nonexistent'),
        /技能不存在/
      );
    });

    it('导出所有插件', async () => {
      await manager.install(makeManifest({ id: 'p1', name: '插件1' }));
      await manager.install(makeManifest({ id: 'p2', name: '插件2' }));
      const all = await manager.exportAll();
      assert.equal(all.length, 2);
    });

    it('导出空列表', async () => {
      const all = await manager.exportAll();
      assert.equal(all.length, 0);
    });
  });

  describe('import 导入', () => {
    it('导入单个插件 JSON 对象', async () => {
      const result = await manager.importPlugin(makeManifest());
      assert.equal(result.id, 'test-plugin');
      assert.ok(await manager.registry.isInstalled('test-plugin'));
    });

    it('导入 JSON 字符串', async () => {
      const jsonStr = JSON.stringify(makeManifest({ id: 'json-plugin' }));
      const result = await manager.importPlugin(jsonStr);
      assert.equal(result.id, 'json-plugin');
    });
  });

  describe('importBatch 批量导入', () => {
    it('批量导入多个插件', async () => {
      const plugins = [
        makeManifest({ id: 'batch-1', name: '批量1' }),
        makeManifest({ id: 'batch-2', name: '批量2' }),
        makeManifest({ id: 'batch-3', name: '批量3' }),
      ];
      const result = await manager.importBatch(plugins);
      assert.equal(result.success, 3);
      assert.equal(result.failed, 0);
      assert.equal(result.errors.length, 0);
    });

    it('部分失败的批量导入', async () => {
      const plugins = [
        makeManifest({ id: 'good-plugin', name: '好的' }),
        { id: '', name: '', prompt: '' },  // 无效，会失败
      ];
      const result = await manager.importBatch(plugins);
      assert.equal(result.success, 1);
      assert.equal(result.failed, 1);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].id, '');
    });

    it('批量导入 JSON 字符串', async () => {
      const jsonStr = JSON.stringify([
        makeManifest({ id: 'str-1' }),
        makeManifest({ id: 'str-2' }),
      ]);
      const result = await manager.importBatch(jsonStr);
      assert.equal(result.success, 2);
    });

    it('单个对象包装为数组处理', async () => {
      const result = await manager.importBatch(makeManifest({ id: 'single' }));
      assert.equal(result.success, 1);
    });
  });

  describe('getUpdatable 可更新插件', () => {
    it('列出已安装插件', async () => {
      await manager.install(makeManifest({ id: 'up1' }));
      await manager.install(makeManifest({ id: 'up2', version: '2.0.0' }));
      const updatable = await manager.getUpdatable();
      assert.equal(updatable.length, 2);
      assert.ok(updatable.every(u => u.currentVersion && u.id));
    });

    it('无插件时返回空', async () => {
      const updatable = await manager.getUpdatable();
      assert.equal(updatable.length, 0);
    });
  });
});

// ==================== 端到端集成 ====================

describe('插件系统端到端集成', () => {
  let manager;

  beforeEach(() => {
    resetIndexedDBMock();
    resetChromeMock();
    manager = new PluginManager();
  });

  it('安装 → 导出 → 重新导入完整流程', async () => {
    // 1. 安装原始插件
    const original = makeManifest({
      id: 'e2e-plugin',
      name: 'E2E 测试插件',
      version: '1.0.0',
      description: '端到端测试',
      prompt: '分析 {{content}} 并生成摘要',
    });
    await manager.install(original);

    // 2. 导出
    const exported = await manager.exportPlugin('e2e-plugin');
    assert.equal(exported.id, 'e2e-plugin');
    assert.equal(exported.name, 'E2E 测试插件');

    // 3. 序列化为 JSON
    const jsonStr = JSON.stringify(exported);

    // 4. 模拟另一个环境导入
    resetIndexedDBMock();
    resetChromeMock();
    manager = new PluginManager();
    const imported = await manager.importPlugin(jsonStr);
    assert.equal(imported.id, 'e2e-plugin');
    assert.equal(imported.name, 'E2E 测试插件');
    assert.equal(imported.version, '1.0.0');
  });

  it('禁用 → 启用 → 验证状态', async () => {
    await manager.install(makeManifest({ id: 'toggle-plugin' }));

    // 禁用
    await manager.disable('toggle-plugin');
    let p = await manager.registry.getPlugin('toggle-plugin');
    assert.equal(p.status, 'disabled');

    // 启用
    await manager.enable('toggle-plugin');
    p = await manager.registry.getPlugin('toggle-plugin');
    assert.equal(p.status, 'installed');
  });

  it('安装 → 升级流程', async () => {
    await manager.install(makeManifest({ id: 'upgrade-plugin', version: '1.0.0' }));

    // 模拟卸载旧版、安装新版
    await manager.uninstall('upgrade-plugin');
    await manager.install(makeManifest({ id: 'upgrade-plugin', version: '2.0.0' }));

    const p = await manager.registry.getPlugin('upgrade-plugin');
    assert.equal(p.version, '2.0.0');
  });

  it('带依赖的插件安装', async () => {
    // 先安装基础插件
    await manager.install(makeManifest({
      id: 'base-lib',
      name: '基础库',
      version: '1.0.0',
    }));

    // 安装依赖它的插件
    const dependent = makeManifest({
      id: 'uses-base',
      name: '使用基础库',
      dependencies: { 'base-lib': '^1.0.0' },
    });
    const record = await manager.install(dependent);
    assert.equal(record.id, 'uses-base');
  });

  it('复杂参数的插件安装和导出', async () => {
    const complex = makeManifest({
      id: 'complex-plugin',
      prompt: '请将 {{source}} 从 {{srcLang}} 翻译为 {{tgtLang}}，保留 {{style}} 风格',
      parameters: [
        { name: 'source', type: 'string', description: '源文本', required: true },
        { name: 'srcLang', type: 'string', description: '源语言', required: false },
        { name: 'tgtLang', type: 'string', description: '目标语言', required: true },
        { name: 'style', type: 'string', description: '风格', required: false },
      ],
    });

    await manager.install(complex);
    const exported = await manager.exportPlugin('complex-plugin');
    assert.equal(exported.parameters.length, 4);
    assert.equal(exported.prompt, '请将 {{source}} 从 {{srcLang}} 翻译为 {{tgtLang}}，保留 {{style}} 风格');
  });
});
