/**
 * Auto Classifier — L2.1 Q&A 自动分类
 *
 * 每次 AI 回答后，自动识别并标记涉及的实体/概念。
 * 与 L1.2 entity-extractor.js 的批量导出场景不同，
 * 本模块面向「实时分类」：单条 Q&A 即时处理，非阻塞。
 *
 * 功能：
 *   - 对单条 Q&A 调用 AI 提取实体和概念
 *   - IndexedDB 持久化存储 entities 和 concepts
 *   - 自动去重合并（同名实体/概念关联多个条目）
 *   - 查询：按条目查实体/概念，按实体/概念查条目
 *   - 全量重编译支持
 *
 * @module auto-classifier
 */

import { ENTITY_TYPES } from './entity-extractor.js';

// ==================== 常量 ====================

/** 分类状态枚举 */
export const CLASSIFICATION_STATUS = {
  UNCLASSIFIED: 'unclassified',
  CLASSIFIED: 'classified',
};

/** 默认 IndexedDB 数据库名 */
const DB_NAME = 'PageWiseAutoClassifier';
/** 数据库版本 */
const DB_VERSION = 1;

// ==================== AutoClassifier ====================

/**
 * Q&A 自动分类器
 *
 * 使用方式：
 *   const classifier = new AutoClassifier(aiClient);
 *   await classifier.init();
 *   const result = await classifier.classifyEntry(entry);
 *   await classifier.saveClassification(entry.id, result);
 */
export class AutoClassifier {
  /**
   * @param {Object} aiClient - AI 客户端（需实现 chat(messages, options) 方法）
   */
  constructor(aiClient) {
    this.aiClient = aiClient;
    this.db = null;
    this._initPromise = null;
  }

  // ==================== 初始化 ====================

  /**
   * 确保 IndexedDB 已初始化
   * @returns {Promise<void>}
   */
  async _ensureInit() {
    if (this.db) return;

    // 防止并发初始化
    if (this._initPromise) {
      await this._initPromise;
      return;
    }

    this._initPromise = this._initDB();
    await this._initPromise;
    this._initPromise = null;
  }

  /**
   * 初始化 IndexedDB 数据库
   * @returns {Promise<void>}
   * @private
   */
  async _initDB() {
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      throw new Error('IndexedDB 不可用');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // entities objectStore
        if (!db.objectStoreNames.contains('entities')) {
          const entityStore = db.createObjectStore('entities', {
            keyPath: 'id',
            autoIncrement: true,
          });
          entityStore.createIndex('name', 'name', { unique: true });
          entityStore.createIndex('type', 'type', { unique: false });
        }

        // concepts objectStore
        if (!db.objectStoreNames.contains('concepts')) {
          const conceptStore = db.createObjectStore('concepts', {
            keyPath: 'id',
            autoIncrement: true,
          });
          conceptStore.createIndex('name', 'name', { unique: true });
        }

        // classification_status objectStore — 跟踪每个条目的分类状态
        if (!db.objectStoreNames.contains('classification_status')) {
          const statusStore = db.createObjectStore('classification_status', {
            keyPath: 'entryId',
          });
          statusStore.createIndex('status', 'status', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onerror = (event) => {
        reject(new Error(`打开数据库失败: ${event.target.error}`));
      };
    });
  }

  // ==================== 提示词构建 ====================

  /**
   * 构建单条 Q&A 的分类提示词
   *
   * @param {Object} entry - Q&A 知识条目
   * @returns {string} AI 提示词
   */
  _buildClassificationPrompt(entry) {
    const parts = [];
    if (entry.title) parts.push(`标题: ${entry.title}`);
    if (entry.question) parts.push(`问题: ${entry.question}`);
    if (entry.answer) parts.push(`回答: ${this._truncateText(entry.answer, 800)}`);
    if (entry.tags && entry.tags.length > 0) parts.push(`标签: ${entry.tags.join(', ')}`);

    const entryText = parts.join('\n');

    return `你是一个知识分析专家。请从以下 Q&A 条目中提取提到的**实体**和**概念**。

## 提取规则

### 实体 (entities)
识别以下类型的实体：
- **person**: 人名（如 Linus Torvalds）
- **tool**: 工具名（如 Docker, Git, Webpack）
- **framework**: 框架名（如 React, Spring, Django）
- **api**: API/协议名（如 REST API, GraphQL, WebSocket）
- **language**: 编程语言（如 JavaScript, Python）
- **platform**: 平台名（如 GitHub, AWS, Kubernetes）
- **library**: 库名（如 Lodash, Axios, NumPy）
- **service**: 服务名（如 GitHub Actions, Vercel）
- **other**: 其他技术实体

### 概念 (concepts)
识别以下类型的概念：
- 技术概念（如容器化、微服务、依赖注入）
- 设计模式（如 MVC、观察者模式）
- 方法论（如 CI/CD、TDD、DevOps）
- 抽象术语（如并发、幂等性、缓存策略）

## 输出要求

请严格以 JSON 格式输出，不要添加其他文字：

\`\`\`json
{
  "entities": [
    {
      "name": "实体名称",
      "type": "tool",
      "description": "简要描述（1-2 句）"
    }
  ],
  "concepts": [
    {
      "name": "概念名称",
      "description": "简要描述（1-2 句）"
    }
  ]
}
\`\`\`

## Q&A 条目

${entryText}`;
  }

  /**
   * 截断文本到指定长度
   * @param {string} text
   * @param {number} maxLen
   * @returns {string}
   * @private
   */
  _truncateText(text, maxLen) {
    if (!text || text.length <= maxLen) return text || '';
    return text.slice(0, maxLen) + '…';
  }

  // ==================== AI 响应解析 ====================

  /**
   * 解析 AI 返回的分类结果
   *
   * @param {string} response - AI 返回的文本
   * @returns {{ entities: Array, concepts: Array }}
   */
  _parseClassificationResponse(response) {
    const empty = { entities: [], concepts: [] };

    if (!response || typeof response !== 'string') return empty;

    let jsonStr = response.trim();

    // 去除 markdown 代码块包裹
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // 尝试找到 JSON 对象
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr);

      const entities = Array.isArray(parsed.entities)
        ? parsed.entities.map(this._normalizeEntity).filter(Boolean)
        : [];

      const concepts = Array.isArray(parsed.concepts)
        ? parsed.concepts.map(this._normalizeConcept).filter(Boolean)
        : [];

      return { entities, concepts };
    } catch {
      return empty;
    }
  }

  /**
   * 规范化实体对象
   * @param {Object} raw
   * @returns {Object|null}
   * @private
   */
  _normalizeEntity(raw) {
    if (!raw || !raw.name) return null;
    return {
      name: String(raw.name).trim(),
      type: ENTITY_TYPES[raw.type?.toUpperCase()] || raw.type || ENTITY_TYPES.OTHER,
      description: String(raw.description || '').trim(),
    };
  }

  /**
   * 规范化概念对象
   * @param {Object} raw
   * @returns {Object|null}
   * @private
   */
  _normalizeConcept(raw) {
    if (!raw || !raw.name) return null;
    return {
      name: String(raw.name).trim(),
      description: String(raw.description || '').trim(),
    };
  }

  // ==================== 分类主流程 ====================

  /**
   * 对单条 Q&A 进行分类
   *
   * 非阻塞设计：AI 调用失败时返回空结构，不抛出异常。
   *
   * @param {Object|null} entry - Q&A 知识条目
   * @param {Object} [options] - 选项
   * @param {string} [options.model] - 指定 AI 模型
   * @returns {Promise<{ entities: Array, concepts: Array }>}
   */
  async classifyEntry(entry, options = {}) {
    if (!entry || !entry.question) {
      return { entities: [], concepts: [] };
    }

    try {
      const prompt = this._buildClassificationPrompt(entry);
      const chatOptions = {};
      if (options.model) chatOptions.model = options.model;

      const response = await this.aiClient.chat(
        [{ role: 'user', content: prompt }],
        chatOptions,
      );

      return this._parseClassificationResponse(response.content || response);
    } catch {
      // AI 调用失败，返回空结构
      return { entities: [], concepts: [] };
    }
  }

  /**
   * 批量分类多条 Q&A
   *
   * @param {Array<Object>} entries - Q&A 条目数组
   * @param {Object} [options] - 选项
   * @returns {Promise<Map<number, { entities: Array, concepts: Array }>>} 条目ID → 分类结果
   */
  async classifyBatch(entries, options = {}) {
    const results = new Map();

    if (!entries || entries.length === 0) return results;

    for (const entry of entries) {
      const result = await this.classifyEntry(entry, options);
      results.set(entry.id, result);
    }

    return results;
  }

  // ==================== 存储操作 ====================

  /**
   * 保存分类结果到 IndexedDB
   *
   * @param {number} entryId - Q&A 条目 ID
   * @param {{ entities: Array, concepts: Array }} result - 分类结果
   * @returns {Promise<void>}
   */
  async saveClassification(entryId, result) {
    await this._ensureInit();

    const { entities, concepts } = result;

    // 保存实体（去重合并）
    for (const entity of entities) {
      await this._findOrCreateEntity(entity.name, entity.type, entity.description, entryId);
    }

    // 保存概念（去重合并）
    for (const concept of concepts) {
      await this._findOrCreateConcept(concept.name, concept.description, entryId);
    }

    // 更新分类状态
    await this._updateClassificationStatus(entryId, CLASSIFICATION_STATUS.CLASSIFIED);
  }

  /**
   * 查找或创建实体（同名实体自动合并 entryIds）
   * @param {string} name
   * @param {string} type
   * @param {string} description
   * @param {number} entryId
   * @returns {Promise<Object>}
   * @private
   */
  async _findOrCreateEntity(name, type, description, entryId) {
    const normalizedName = name.toLowerCase().trim();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entities', 'readwrite');
      const store = tx.objectStore('entities');
      const index = store.index('name');
      const request = index.get(normalizedName);

      request.onsuccess = () => {
        const existing = request.result;

        if (existing) {
          // 合并 entryIds
          const entryIds = new Set(existing.entryIds || []);
          entryIds.add(entryId);
          const updated = {
            ...existing,
            entryIds: [...entryIds],
            description: description || existing.description,
            updatedAt: new Date().toISOString(),
          };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve(updated);
          putReq.onerror = () => reject(new Error('更新实体失败'));
        } else {
          // 创建新实体
          const record = {
            name: normalizedName,
            displayName: name,
            type: type || ENTITY_TYPES.OTHER,
            description: description || '',
            entryIds: [entryId],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const addReq = store.add(record);
          addReq.onsuccess = () => resolve({ ...record, id: addReq.result });
          addReq.onerror = () => reject(new Error('创建实体失败'));
        }
      };

      request.onerror = () => reject(new Error('查询实体失败'));
    });
  }

  /**
   * 查找或创建概念（同名概念自动合并 entryIds）
   * @param {string} name
   * @param {string} description
   * @param {number} entryId
   * @returns {Promise<Object>}
   * @private
   */
  async _findOrCreateConcept(name, description, entryId) {
    const normalizedName = name.toLowerCase().trim();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('concepts', 'readwrite');
      const store = tx.objectStore('concepts');
      const index = store.index('name');
      const request = index.get(normalizedName);

      request.onsuccess = () => {
        const existing = request.result;

        if (existing) {
          // 合并 entryIds
          const entryIds = new Set(existing.entryIds || []);
          entryIds.add(entryId);
          const updated = {
            ...existing,
            entryIds: [...entryIds],
            description: description || existing.description,
            updatedAt: new Date().toISOString(),
          };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve(updated);
          putReq.onerror = () => reject(new Error('更新概念失败'));
        } else {
          // 创建新概念
          const record = {
            name: normalizedName,
            displayName: name,
            description: description || '',
            entryIds: [entryId],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const addReq = store.add(record);
          addReq.onsuccess = () => resolve({ ...record, id: addReq.result });
          addReq.onerror = () => reject(new Error('创建概念失败'));
        }
      };

      request.onerror = () => reject(new Error('查询概念失败'));
    });
  }

  /**
   * 更新条目的分类状态
   * @param {number} entryId
   * @param {string} status
   * @returns {Promise<void>}
   * @private
   */
  async _updateClassificationStatus(entryId, status) {
    await this._ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('classification_status', 'readwrite');
      const store = tx.objectStore('classification_status');
      const record = {
        entryId,
        status,
        classifiedAt: new Date().toISOString(),
      };
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('更新分类状态失败'));
    });
  }

  // ==================== 查询操作 ====================

  /**
   * 获取条目关联的实体列表
   *
   * @param {number} entryId - 条目 ID
   * @returns {Promise<Array<Object>>} 关联的实体列表
   */
  async getEntitiesByEntry(entryId) {
    await this._ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entities', 'readonly');
      const store = tx.objectStore('entities');
      const request = store.getAll();

      request.onsuccess = () => {
        const allEntities = request.result || [];
        const matching = allEntities.filter(
          (entity) => entity.entryIds && entity.entryIds.includes(entryId)
        );
        resolve(matching);
      };

      request.onerror = () => reject(new Error('查询实体失败'));
    });
  }

  /**
   * 获取条目关联的概念列表
   *
   * @param {number} entryId - 条目 ID
   * @returns {Promise<Array<Object>>} 关联的概念列表
   */
  async getConceptsByEntry(entryId) {
    await this._ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('concepts', 'readonly');
      const store = tx.objectStore('concepts');
      const request = store.getAll();

      request.onsuccess = () => {
        const allConcepts = request.result || [];
        const matching = allConcepts.filter(
          (concept) => concept.entryIds && concept.entryIds.includes(entryId)
        );
        resolve(matching);
      };

      request.onerror = () => reject(new Error('查询概念失败'));
    });
  }

  /**
   * 获取实体关联的条目 ID 列表
   *
   * @param {string} entityName - 实体名称
   * @returns {Promise<Array<number>>} 关联的条目 ID 列表
   */
  async getEntriesByEntity(entityName) {
    await this._ensureInit();
    const normalizedName = entityName.toLowerCase().trim();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entities', 'readonly');
      const store = tx.objectStore('entities');
      const index = store.index('name');
      const request = index.get(normalizedName);

      request.onsuccess = () => {
        const entity = request.result;
        resolve(entity ? [...(entity.entryIds || [])] : []);
      };

      request.onerror = () => reject(new Error('查询实体失败'));
    });
  }

  /**
   * 获取概念关联的条目 ID 列表
   *
   * @param {string} conceptName - 概念名称
   * @returns {Promise<Array<number>>} 关联的条目 ID 列表
   */
  async getEntriesByConcept(conceptName) {
    await this._ensureInit();
    const normalized = conceptName.toLowerCase().trim();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('concepts', 'readonly');
      const store = tx.objectStore('concepts');
      const index = store.index('name');
      const request = index.get(normalized);

      request.onsuccess = () => {
        const concept = request.result;
        resolve(concept ? [...(concept.entryIds || [])] : []);
      };

      request.onerror = () => reject(new Error('查询概念失败'));
    });
  }

  /**
   * 获取所有实体
   *
   * @returns {Promise<Array<Object>>}
   */
  async getAllEntities() {
    await this._ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entities', 'readonly');
      const store = tx.objectStore('entities');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('获取实体列表失败'));
    });
  }

  /**
   * 获取所有概念
   *
   * @returns {Promise<Array<Object>>}
   */
  async getAllConcepts() {
    await this._ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('concepts', 'readonly');
      const store = tx.objectStore('concepts');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('获取概念列表失败'));
    });
  }

  // ==================== 编译状态与统计 ====================

  /**
   * 获取条目的分类状态
   *
   * @param {number} entryId - 条目 ID
   * @returns {Promise<string>} 分类状态
   */
  async getClassificationStatus(entryId) {
    await this._ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('classification_status', 'readonly');
      const store = tx.objectStore('classification_status');
      const request = store.get(entryId);

      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.status : CLASSIFICATION_STATUS.UNCLASSIFIED);
      };

      request.onerror = () => reject(new Error('查询分类状态失败'));
    });
  }

  /**
   * 获取分类统计
   *
   * @returns {Promise<{ entityCount: number, conceptCount: number }>}
   */
  async getStats() {
    await this._ensureInit();

    const entities = await this.getAllEntities();
    const concepts = await this.getAllConcepts();

    return {
      entityCount: entities.length,
      conceptCount: concepts.length,
    };
  }

  // ==================== 批量操作 ====================

  /**
   * 全量重编译 — 清除旧数据后重新分类所有条目
   *
   * @param {Array<Object>} entries - 所有 Q&A 条目
   * @param {Object} [aiClient] - 可选覆盖 AI 客户端
   * @returns {Promise<void>}
   */
  async rebuildAll(entries, aiClient) {
    await this._ensureInit();

    const client = aiClient || this.aiClient;

    if (!entries || entries.length === 0) return;

    // 清除旧数据
    await this._clearAll();

    // 重新分类每条
    for (const entry of entries) {
      const classifier = new AutoClassifier(client);
      classifier.db = this.db; // 共享同一个 db 连接
      const result = await classifier.classifyEntry(entry);
      if (result.entities.length > 0 || result.concepts.length > 0) {
        await this.saveClassification(entry.id, result);
      }
    }
  }

  /**
   * 清除所有分类数据
   * @returns {Promise<void>}
   * @private
   */
  async _clearAll() {
    await this._ensureInit();

    const storeNames = ['entities', 'concepts', 'classification_status'];

    // 逐个 store 使用 clear() 清除
    for (const storeName of storeNames) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`清除 ${storeName} 失败`));
      });
    }
  }
}
