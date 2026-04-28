/**
 * Prompt 模板库 — 内置模板 + 自定义模板
 * 使用 chrome.storage.local 存储自定义模板
 */

/** 内置模板（不可删除） */
const BUILTIN_TEMPLATES = [
  {
    id: 'tpl_builtin_code_review',
    name: '代码审查',
    content: '请从以下维度审查这段代码：\n1. 安全性\n2. 性能\n3. 可读性\n\n代码：\n{{code}}',
    category: 'code',
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: 'tpl_builtin_error_diagnose',
    name: '错误诊断',
    content: '请分析以下错误的原因，并给出修复方案：\n\n错误信息：\n{{error}}\n\n相关代码：\n{{code}}',
    category: 'debug',
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: 'tpl_builtin_concept_explain',
    name: '概念解释',
    content: '请用简单易懂的语言解释以下技术概念：\n\n概念：{{concept}}\n\n要求：\n- 使用类比帮助理解\n- 给出一个实际的代码示例\n- 说明常见使用场景',
    category: 'learning',
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: 'tpl_builtin_code_refactor',
    name: '代码重构',
    content: '请对以下代码给出重构建议：\n\n代码：\n{{code}}\n\n要求：\n- 提高可读性和可维护性\n- 遵循最佳实践\n- 保持功能不变',
    category: 'code',
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: 'tpl_builtin_study_notes',
    name: '学习笔记',
    content: '请将以下内容整理成结构化学习笔记：\n\n内容：\n{{content}}\n\n格式要求：\n- 📌 核心要点（3-5 个）\n- 🔍 详细说明\n- 💡 实际应用场景\n- ⚠️ 常见误区\n- 🔗 延伸阅读建议',
    category: 'learning',
    isBuiltin: true,
    createdAt: 0,
  },
];

/** 自定义模板上限 */
const MAX_CUSTOM_TEMPLATES = 30;

/** chrome.storage.local 存储 key */
const STORAGE_KEY = 'promptTemplates';

/**
 * 获取所有模板（内置 + 自定义）
 * @returns {Promise<Array>} 模板列表
 */
async function getAllTemplates() {
  const custom = await _loadCustom();
  return [...BUILTIN_TEMPLATES, ...custom];
}

/**
 * 保存自定义模板（新建或更新）
 * @param {{ id?: string, name: string, content: string, category?: string }} template
 * @returns {Promise<object>} 保存后的模板
 */
async function saveTemplate(template) {
  const custom = await _loadCustom();

  if (template.id) {
    // 更新已有模板
    const idx = custom.findIndex(t => t.id === template.id);
    if (idx === -1) {
      throw new Error('模板不存在');
    }
    custom[idx] = { ...custom[idx], ...template };
    await _saveCustom(custom);
    return custom[idx];
  }

  // 新建
  if (custom.length >= MAX_CUSTOM_TEMPLATES) {
    throw new Error(`自定义模板数量已达上限（${MAX_CUSTOM_TEMPLATES}）`);
  }

  const newTpl = {
    id: 'tpl_' + Date.now(),
    name: template.name,
    content: template.content,
    category: template.category || 'custom',
    isBuiltin: false,
    createdAt: Date.now(),
  };
  custom.push(newTpl);
  await _saveCustom(custom);
  return newTpl;
}

/**
 * 删除自定义模板
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteTemplate(id) {
  // 内置模板不可删除
  if (BUILTIN_TEMPLATES.some(t => t.id === id)) {
    throw new Error('内置模板不可删除');
  }

  const custom = await _loadCustom();
  const idx = custom.findIndex(t => t.id === id);
  if (idx === -1) {
    throw new Error('模板不存在');
  }
  custom.splice(idx, 1);
  await _saveCustom(custom);
}

/**
 * 渲染模板，替换 {{变量}}
 * @param {string} id 模板 ID
 * @param {Record<string, string>} vars 变量键值对
 * @returns {Promise<string>} 渲染后的文本
 */
async function renderTemplate(id, vars = {}) {
  const all = await getAllTemplates();
  const tpl = all.find(t => t.id === id);
  if (!tpl) {
    throw new Error('模板不存在');
  }

  let result = tpl.content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value ?? '');
  }
  return result;
}

/**
 * 获取内置模板（仅供测试）
 * @returns {Array}
 */
function getBuiltinTemplates() {
  return [...BUILTIN_TEMPLATES];
}

// ==================== 内部方法 ====================

/** 从 chrome.storage.local 加载自定义模板 */
async function _loadCustom() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || [];
  } catch {
    return [];
  }
}

/** 保存自定义模板到 chrome.storage.local */
async function _saveCustom(templates) {
  await chrome.storage.local.set({ [STORAGE_KEY]: templates });
}

export {
  getAllTemplates,
  saveTemplate,
  deleteTemplate,
  renderTemplate,
  getBuiltinTemplates,
  BUILTIN_TEMPLATES,
  MAX_CUSTOM_TEMPLATES,
  STORAGE_KEY,
};
