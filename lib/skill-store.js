/**
 * SkillStore — 在线技能商店客户端
 *
 * 从远程 API 获取可安装的技能列表，支持一键安装到本地 IndexedDB。
 */

import { saveSkill, getSkillById } from './custom-skills.js';

const DEFAULT_API_URL = 'https://api.clawhub.com/v1/skills';

export class SkillStore {
  /**
   * @param {string} apiUrl - 技能商店 API 地址
   */
  constructor(apiUrl = DEFAULT_API_URL) {
    this.apiUrl = apiUrl;
  }

  /**
   * 从远程 API 获取技能列表
   * @returns {Promise<Array>} 技能列表，失败时返回空数组
   */
  async fetchSkills() {
    try {
      const resp = await fetch(this.apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!resp.ok) {
        console.warn(`SkillStore fetch failed: HTTP ${resp.status}`);
        return [];
      }
      const data = await resp.json();
      return Array.isArray(data) ? data : (data.skills || data.data || []);
    } catch (e) {
      console.warn('SkillStore fetch error:', e.message);
      return [];
    }
  }

  /**
   * 安装技能到本地 IndexedDB
   * @param {Object} skill - 技能对象（必须包含 id, name, prompt）
   * @returns {Promise<Object>} 保存后的技能
   */
  async installSkill(skill) {
    if (!skill || !skill.id || !skill.name) {
      throw new Error('技能数据不完整');
    }
    return await saveSkill({
      id: skill.id,
      name: skill.name,
      description: skill.description || '',
      category: skill.category || 'custom',
      prompt: skill.prompt || '',
      parameters: skill.parameters || [],
      trigger: skill.trigger || { type: 'manual' },
      enabled: true
    });
  }

  /**
   * 检查技能是否已安装
   * @param {string} skillId
   * @returns {Promise<boolean>}
   */
  async isInstalled(skillId) {
    const existing = await getSkillById(skillId);
    return !!existing;
  }
}
