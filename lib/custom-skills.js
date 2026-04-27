/**
 * Custom Skills — 用户自定义技能存储模块
 *
 * 使用 IndexedDB 存储用户创建的自定义技能。
 * 支持 CRUD 操作和 {{变量}} 模板语法。
 */

const DB_NAME = 'pagewise_custom_skills';
const DB_VERSION = 1;
const STORE_NAME = 'skills';
const MAX_SKILLS = 20;

/**
 * 打开 IndexedDB 数据库连接
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * 将 IDBRequest 包装为 Promise
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 保存/更新一个自定义技能
 * @param {Object} skill - 技能对象
 * @returns {Promise<Object>} 保存后的技能
 */
export async function saveSkill(skill) {
  if (!skill || !skill.name || !skill.prompt) {
    throw new Error('技能必须包含 name 和 prompt 字段');
  }

  const all = await getAllSkills();

  // 新建时检查上限
  const isUpdate = all.some(s => s.id === skill.id);
  if (!isUpdate && all.length >= MAX_SKILLS) {
    throw new Error(`自定义技能数量已达上限（${MAX_SKILLS} 个）`);
  }

  const record = {
    id: skill.id || 'skill_' + Date.now(),
    name: skill.name,
    description: skill.description || '',
    category: skill.category || 'custom',
    prompt: skill.prompt,
    trigger: skill.trigger || { type: 'manual' },
    enabled: skill.enabled !== false,
    createdAt: skill.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await requestToPromise(store.put(record));
  db.close();

  return record;
}

/**
 * 获取所有自定义技能
 * @returns {Promise<Array>}
 */
export async function getAllSkills() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const result = await requestToPromise(store.getAll());
  db.close();
  return result || [];
}

/**
 * 根据 ID 获取单个技能
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export async function getSkillById(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const result = await requestToPromise(store.get(id));
  db.close();
  return result;
}

/**
 * 删除指定技能
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteSkill(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await requestToPromise(store.delete(id));
  db.close();
}

/**
 * 切换技能启用/禁用状态
 * @param {string} id
 * @returns {Promise<Object>} 更新后的技能
 */
export async function toggleSkill(id) {
  const skill = await getSkillById(id);
  if (!skill) {
    throw new Error(`技能不存在: ${id}`);
  }

  skill.enabled = !skill.enabled;
  skill.updatedAt = Date.now();

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await requestToPromise(store.put(skill));
  db.close();

  return skill;
}

/**
 * 渲染模板：将 {{变量}} 替换为实际值
 * @param {string} template - 包含 {{变量}} 的模板字符串
 * @param {Object} vars - 变量键值对
 * @returns {string} 替换后的字符串
 */
export function renderTemplate(template, vars = {}) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : match;
  });
}

/**
 * 提取模板中的变量名列表
 * @param {string} template
 * @returns {string[]} 变量名数组（去重）
 */
export function extractTemplateVars(template) {
  if (!template) return [];
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  const vars = matches.map(m => m.replace(/\{\{|\}\}/g, ''));
  return [...new Set(vars)];
}
