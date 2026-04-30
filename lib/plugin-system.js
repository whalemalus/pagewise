/**
 * Plugin System — 模板/插件系统
 *
 * 社区共建技能基础设施：
 * - 插件包格式（PluginManifest）
 * - 插件验证（PluginValidator）
 * - 插件注册表（PluginRegistry，IndexedDB）
 * - 插件管理器（PluginManager，协调安装/卸载/导入/导出）
 * - 语义化版本比较
 */

import { saveSkill, getAllSkills, getSkillById, deleteSkill, toggleSkill } from './custom-skills.js';

// ==================== 常量 ====================

const PLUGIN_DB_NAME = 'pagewise_plugins';
const PLUGIN_DB_VERSION = 1;
const PLUGIN_STORE_NAME = 'plugins';
const MAX_PLUGINS = 50;

// ==================== 版本工具 ====================

/**
 * 解析 semver 版本号为三段数字
 * @param {string} version — 如 "1.2.3" 或 "1.2.3-beta.1"
 * @returns {{ major: number, minor: number, patch: number, prerelease: string }}
 */
export function parseVersion(version) {
  if (!version || typeof version !== 'string') {
    throw new Error(`Invalid version: ${version}`);
  }
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || '',
  };
}

/**
 * 比较两个版本号
 * @returns {number} -1, 0, 1
 */
export function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1;
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1;
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1;

  // pre-release 排序：无 pre-release > 有 pre-release（正式版优先）
  if (va.prerelease && !vb.prerelease) return -1;
  if (!va.prerelease && vb.prerelease) return 1;
  if (va.prerelease && vb.prerelease) {
    return va.prerelease.localeCompare(vb.prerelease);
  }

  return 0;
}

/**
 * 检查版本是否满足范围约束
 * 支持: ^1.0.0 (caret), >=1.0.0, ~1.0.0 (tilde), 精确版本号
 * @param {string} version
 * @param {string} range
 * @returns {boolean}
 */
export function satisfiesVersion(version, range) {
  if (!range || typeof range !== 'string') return true;

  const v = parseVersion(version);

  // Caret: ^1.2.3 → >=1.2.3 <2.0.0
  if (range.startsWith('^')) {
    const base = parseVersion(range.slice(1));
    if (v.major !== base.major) return v.major > base.major;
    if (v.minor !== base.minor) return v.minor > base.minor;
    return v.patch >= base.patch;
  }

  // Tilde: ~1.2.3 → >=1.2.3 <1.3.0
  if (range.startsWith('~')) {
    const base = parseVersion(range.slice(1));
    if (v.major !== base.major) return v.major > base.major;
    if (v.minor !== base.minor) return v.minor > base.minor;
    return v.patch >= base.patch;
  }

  // Greater or equal: >=1.0.0
  if (range.startsWith('>=')) {
    return compareVersions(version, range.slice(2)) >= 0;
  }

  // Exact match
  return compareVersions(version, range) === 0;
}

// ==================== 插件验证 ====================

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * 验证插件 manifest 格式
 * @param {Object} manifest
 * @returns {ValidationResult}
 */
export function validatePlugin(manifest) {
  const errors = [];
  const warnings = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest 必须是一个对象'], warnings: [] };
  }

  // id
  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('id 是必填字段，且必须为字符串');
  } else if (!/^[a-z0-9][a-z0-9_-]*$/i.test(manifest.id)) {
    errors.push('id 仅允许字母、数字、下划线和连字符');
  }

  // name
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('name 是必填字段，且必须为字符串');
  }

  // version
  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('version 是必填字段，且必须为字符串');
  } else {
    try {
      parseVersion(manifest.version);
    } catch {
      errors.push(`version 格式无效: ${manifest.version}（需要 semver 格式如 1.0.0）`);
    }
  }

  // prompt
  if (!manifest.prompt || typeof manifest.prompt !== 'string') {
    errors.push('prompt 是必填字段，且必须为非空字符串');
  } else if (manifest.prompt.trim().length === 0) {
    errors.push('prompt 不能为空白字符串');
  }

  // license (optional, defaults to MIT)
  if (manifest.license !== undefined && typeof manifest.license !== 'string') {
    errors.push('license 必须为字符串');
  }

  // category (optional)
  if (manifest.category !== undefined && typeof manifest.category !== 'string') {
    errors.push('category 必须为字符串');
  }

  // description (optional)
  if (manifest.description !== undefined && typeof manifest.description !== 'string') {
    errors.push('description 必须为字符串');
  }

  // author (optional)
  if (manifest.author !== undefined && typeof manifest.author !== 'string') {
    errors.push('author 必须为字符串');
  }

  // parameters (optional, must be array)
  if (manifest.parameters !== undefined) {
    if (!Array.isArray(manifest.parameters)) {
      errors.push('parameters 必须为数组');
    } else {
      manifest.parameters.forEach((p, i) => {
        if (!p || typeof p !== 'object') {
          errors.push(`parameters[${i}] 必须为对象`);
        } else {
          if (!p.name || typeof p.name !== 'string') {
            errors.push(`parameters[${i}].name 是必填字段`);
          }
          if (p.type && typeof p.type !== 'string') {
            errors.push(`parameters[${i}].type 必须为字符串`);
          }
        }
      });
    }
  }

  // dependencies (optional, must be object with string values)
  if (manifest.dependencies !== undefined) {
    if (typeof manifest.dependencies !== 'object' || Array.isArray(manifest.dependencies)) {
      errors.push('dependencies 必须为对象');
    } else {
      for (const [depId, depRange] of Object.entries(manifest.dependencies)) {
        if (typeof depRange !== 'string') {
          errors.push(`dependencies.${depId} 的版本范围必须为字符串`);
        }
      }
    }
  }

  // tags (optional, must be array of strings)
  if (manifest.tags !== undefined) {
    if (!Array.isArray(manifest.tags)) {
      errors.push('tags 必须为数组');
    } else if (manifest.tags.some(t => typeof t !== 'string')) {
      errors.push('tags 中的每个元素必须为字符串');
    }
  }

  // trigger (optional)
  if (manifest.trigger !== undefined) {
    if (typeof manifest.trigger !== 'object' || manifest.trigger === null) {
      errors.push('trigger 必须为对象');
    } else if (!manifest.trigger.type || typeof manifest.trigger.type !== 'string') {
      errors.push('trigger.type 是必填字段');
    }
  }

  // Warnings
  if (!manifest.description) {
    warnings.push('建议填写 description 以提高可发现性');
  }
  if (!manifest.author) {
    warnings.push('建议填写 author 标明作者');
  }
  if (!manifest.tags || manifest.tags.length === 0) {
    warnings.push('建议添加 tags 以便分类');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ==================== IndexedDB 操作 ====================

function openPluginDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PLUGIN_DB_NAME, PLUGIN_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(PLUGIN_STORE_NAME)) {
        const store = db.createObjectStore(PLUGIN_STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('installedAt', 'installedAt', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function idbRequestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ==================== 插件注册表 ====================

/**
 * PluginRegistry — 管理已安装插件的本地注册表
 */
export class PluginRegistry {
  /**
   * 注册一个插件到注册表
   * @param {Object} manifest
   * @returns {Promise<Object>} 注册后的记录
   */
  async registerPlugin(manifest) {
    const all = await this.getInstalled();

    // 检查是否已存在（更新场景）
    const existing = all.find(p => p.id === manifest.id);
    if (!existing && all.length >= MAX_PLUGINS) {
      throw new Error(`插件数量已达上限（${MAX_PLUGINS} 个）`);
    }

    const record = {
      ...manifest,
      license: manifest.license || 'MIT',
      status: existing ? existing.status : 'installed',
      installedAt: existing ? existing.installedAt : Date.now(),
      updatedAt: Date.now(),
    };

    const db = await openPluginDB();
    const tx = db.transaction(PLUGIN_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PLUGIN_STORE_NAME);
    await idbRequestToPromise(store.put(record));
    db.close();

    return record;
  }

  /**
   * 从注册表移除插件
   * @param {string} id
   * @returns {Promise<void>}
   */
  async unregisterPlugin(id) {
    const db = await openPluginDB();
    const tx = db.transaction(PLUGIN_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PLUGIN_STORE_NAME);
    await idbRequestToPromise(store.delete(id));
    db.close();
  }

  /**
   * 获取所有已安装插件
   * @returns {Promise<Array>}
   */
  async getInstalled() {
    const db = await openPluginDB();
    const tx = db.transaction(PLUGIN_STORE_NAME, 'readonly');
    const store = tx.objectStore(PLUGIN_STORE_NAME);
    const result = await idbRequestToPromise(store.getAll());
    db.close();
    return result || [];
  }

  /**
   * 检查插件是否已安装
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async isInstalled(id) {
    const plugin = await this.getPlugin(id);
    return !!plugin;
  }

  /**
   * 获取单个已安装插件
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getPlugin(id) {
    const db = await openPluginDB();
    const tx = db.transaction(PLUGIN_STORE_NAME, 'readonly');
    const store = tx.objectStore(PLUGIN_STORE_NAME);
    const result = await idbRequestToPromise(store.get(id));
    db.close();
    return result || null;
  }

  /**
   * 更新插件状态
   * @param {string} id
   * @param {'installed' | 'disabled'} status
   * @returns {Promise<void>}
   */
  async updatePluginStatus(id, status) {
    const plugin = await this.getPlugin(id);
    if (!plugin) throw new Error(`插件不存在: ${id}`);

    plugin.status = status;
    plugin.updatedAt = Date.now();

    const db = await openPluginDB();
    const tx = db.transaction(PLUGIN_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PLUGIN_STORE_NAME);
    await idbRequestToPromise(store.put(plugin));
    db.close();
  }

  /**
   * 检查安装冲突（同 ID 或同名不同版本）
   * @param {Object} manifest
   * @returns {Promise<Array<{ type: string, message: string, existing: Object }>>}
   */
  async checkConflicts(manifest) {
    const conflicts = [];
    const all = await this.getInstalled();

    const existing = all.find(p => p.id === manifest.id);
    if (existing) {
      if (existing.version === manifest.version) {
        conflicts.push({
          type: 'already_installed',
          message: `插件 ${manifest.id}@${manifest.version} 已安装`,
          existing,
        });
      } else {
        const cmp = compareVersions(manifest.version, existing.version);
        if (cmp < 0) {
          conflicts.push({
            type: 'downgrade',
            message: `尝试从 v${existing.version} 降级到 v${manifest.version}`,
            existing,
          });
        } else {
          conflicts.push({
            type: 'upgrade',
            message: `将从 v${existing.version} 升级到 v${manifest.version}`,
            existing,
          });
        }
      }
    }

    // 检查依赖
    if (manifest.dependencies) {
      for (const [depId, depRange] of Object.entries(manifest.dependencies)) {
        const depPlugin = all.find(p => p.id === depId);
        if (!depPlugin) {
          conflicts.push({
            type: 'missing_dependency',
            message: `缺少依赖插件: ${depId}`,
            existing: null,
          });
        } else if (!satisfiesVersion(depPlugin.version, depRange)) {
          conflicts.push({
            type: 'incompatible_dependency',
            message: `依赖 ${depId} 版本 ${depPlugin.version} 不满足 ${depRange}`,
            existing: depPlugin,
          });
        }
      }
    }

    return conflicts;
  }
}

// ==================== 插件管理器 ====================

/**
 * @typedef {Object} ImportResult
 * @property {number} success
 * @property {number} failed
 * @property {Array<{ id: string, error: string }>} errors
 */

/**
 * PluginManager — 协调插件安装/卸载/导入/导出
 */
export class PluginManager {
  constructor() {
    this.registry = new PluginRegistry();
  }

  /**
   * 安装插件（验证 → 冲突检查 → 注册 → 保存技能）
   * @param {Object} manifest
   * @returns {Promise<Object>} 安装后的记录
   */
  async install(manifest) {
    // 验证
    const validation = validatePlugin(manifest);
    if (!validation.valid) {
      throw new Error(`插件验证失败: ${validation.errors.join('; ')}`);
    }

    // 冲突检查
    const conflicts = await this.registry.checkConflicts(manifest);
    const blocking = conflicts.filter(c =>
      c.type === 'already_installed' || c.type === 'missing_dependency'
    );
    if (blocking.length > 0) {
      throw new Error(`安装冲突: ${blocking.map(c => c.message).join('; ')}`);
    }

    // 注册到插件注册表
    const pluginRecord = await this.registry.registerPlugin(manifest);

    // 同步保存到 custom-skills
    await saveSkill({
      id: manifest.id,
      name: manifest.name,
      description: manifest.description || '',
      category: manifest.category || 'custom',
      prompt: manifest.prompt,
      parameters: manifest.parameters || [],
      trigger: manifest.trigger || { type: 'manual' },
      enabled: true,
    });

    return pluginRecord;
  }

  /**
   * 卸载插件
   * @param {string} id
   * @returns {Promise<void>}
   */
  async uninstall(id) {
    const plugin = await this.registry.getPlugin(id);
    if (!plugin) {
      throw new Error(`插件不存在: ${id}`);
    }

    // 检查是否被其他插件依赖
    const allPlugins = await this.registry.getInstalled();
    const dependents = allPlugins.filter(p =>
      p.dependencies && p.dependencies[id]
    );
    if (dependents.length > 0) {
      const names = dependents.map(p => p.name || p.id).join(', ');
      throw new Error(`无法卸载: 被以下插件依赖: ${names}`);
    }

    // 从注册表移除
    await this.registry.unregisterPlugin(id);

    // 从 custom-skills 移除（如果存在）
    try {
      await deleteSkill(id);
    } catch {
      // 可能不存在于 custom-skills，忽略
    }
  }

  /**
   * 启用插件
   * @param {string} id
   * @returns {Promise<void>}
   */
  async enable(id) {
    await this.registry.updatePluginStatus(id, 'installed');
    try {
      await toggleSkill(id);
    } catch {
      // ignore if skill not found in custom-skills
    }
  }

  /**
   * 禁用插件
   * @param {string} id
   * @returns {Promise<void>}
   */
  async disable(id) {
    await this.registry.updatePluginStatus(id, 'disabled');
    try {
      const skill = await getSkillById(id);
      if (skill && skill.enabled) {
        await toggleSkill(id);
      }
    } catch {
      // ignore
    }
  }

  /**
   * 将本地自定义技能导出为插件包格式
   * @param {string} skillId
   * @returns {Promise<Object>} PluginManifest
   */
  async exportPlugin(skillId) {
    const skill = await getSkillById(skillId);
    if (!skill) {
      throw new Error(`技能不存在: ${skillId}`);
    }

    // 优先从插件注册表获取完整元数据（含 parameters、version 等）
    let pluginMeta = null;
    try {
      pluginMeta = await this.registry.getPlugin(skillId);
    } catch {
      // registry not available, skip
    }

    return {
      id: skill.id,
      name: skill.name,
      version: pluginMeta?.version || '1.0.0',
      description: skill.description || '',
      author: pluginMeta?.author || '',
      license: pluginMeta?.license || 'MIT',
      category: skill.category || 'custom',
      prompt: skill.prompt || '',
      parameters: pluginMeta?.parameters || skill.parameters || [],
      trigger: skill.trigger || { type: 'manual' },
      tags: pluginMeta?.tags || [],
      homepage: pluginMeta?.homepage || '',
      createdAt: new Date(skill.createdAt || Date.now()).toISOString(),
    };
  }

  /**
   * 导出所有自定义技能为插件包数组
   * @returns {Promise<PluginManifest[]>}
   */
  async exportAll() {
    const skills = await getAllSkills();
    const manifests = [];
    for (const skill of skills) {
      try {
        const manifest = await this.exportPlugin(skill.id);
        manifests.push(manifest);
      } catch {
        // skip failed exports
      }
    }
    return manifests;
  }

  /**
   * 导入单个插件
   * @param {Object|string} json — 插件 JSON 对象或字符串
   * @returns {Promise<Object>}
   */
  async importPlugin(json) {
    const manifest = typeof json === 'string' ? JSON.parse(json) : json;
    return await this.install(manifest);
  }

  /**
   * 批量导入插件
   * @param {Array|Object|string} json — 插件数组、单个对象或 JSON 字符串
   * @returns {Promise<ImportResult>}
   */
  async importBatch(json) {
    let items = json;
    if (typeof json === 'string') {
      items = JSON.parse(json);
    }
    if (!Array.isArray(items)) {
      items = [items];
    }

    const result = { success: 0, failed: 0, errors: [] };

    for (const item of items) {
      try {
        await this.importPlugin(item);
        result.success++;
      } catch (e) {
        result.failed++;
        result.errors.push({
          id: item?.id ?? 'unknown',
          error: e.message,
        });
      }
    }

    return result;
  }

  /**
   * 检查可更新的插件（当前实现：列出所有已安装插件）
   * @returns {Promise<Array>}
   */
  async getUpdatable() {
    const all = await this.registry.getInstalled();
    return all.map(p => ({
      id: p.id,
      name: p.name,
      currentVersion: p.version,
      status: p.status,
    }));
  }
}
