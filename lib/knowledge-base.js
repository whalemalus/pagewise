/**
 * KnowledgeBase - 基于 IndexedDB 的本地知识库
 */

export class KnowledgeBase {
  constructor() {
    this.dbName = 'AIAssistantKnowledgeBase';
    this.dbVersion = 1;
    this.db = null;
    // 性能优化：LRU 搜索缓存（最多 10 条）
    this._searchCache = new Map();
    this._searchCacheMaxSize = 10;
    // 标签统计缓存
    this._tagsCache = null;
    this._categoriesCache = null;
    // 倒排索引（惰性构建）
    this._searchIndex = null;          // Map<lowercase_word, Set<entry_id>>
    this._indexBuilt = false;
    this._indexEntriesById = new Map(); // Map<id, entry>
  }

  /**
   * 初始化数据库
   */
  async init() {
    // 检查 IndexedDB 是否可用
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      throw new Error('存储不可用，请检查浏览器设置');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 知识条目表
        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('sourceUrl', 'sourceUrl', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('tags', 'tags', { multiEntry: true });
          store.createIndex('category', 'category', { unique: false });
        }

        // 对话历史表
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', {
            keyPath: 'id',
            autoIncrement: true
          });
          convStore.createIndex('sourceUrl', 'sourceUrl', { unique: false });
          convStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        const err = event.target.error;
        if (err && err.name === 'QuotaExceededError') {
          reject(new Error('存储空间不足'));
        } else {
          reject(new Error(`存储不可用，请检查浏览器设置: ${err}`));
        }
      };
    });
  }

  /**
   * 确保数据库已初始化
   */
  async ensureInit() {
    if (!this.db) await this.init();
  }

  /**
   * 清空搜索和统计缓存（在数据变更时调用）
   */
  _invalidateCaches() {
    this._searchCache.clear();
    this._tagsCache = null;
    this._categoriesCache = null;
  }

  /**
   * LRU 缓存读取
   */
  _getCachedSearch(key) {
    if (!this._searchCache.has(key)) return undefined;
    const value = this._searchCache.get(key);
    // 移到末尾（最近使用）
    this._searchCache.delete(key);
    this._searchCache.set(key, value);
    return value;
  }

  /**
   * LRU 缓存写入
   */
  _setCachedSearch(key, value) {
    if (this._searchCache.has(key)) {
      this._searchCache.delete(key);
    } else if (this._searchCache.size >= this._searchCacheMaxSize) {
      // 删除最旧的条目
      const oldest = this._searchCache.keys().next().value;
      this._searchCache.delete(oldest);
    }
    this._searchCache.set(key, value);
  }

  // ==================== 知识条目 CRUD ====================

  /**
   * 保存知识条目
   */
  /**
   * 查找重复条目
   * 通过标题、问题、答案的相似度判断是否重复
   * @param {Object} entry - 待检查的条目
   * @returns {Object|null} - 重复的条目，或 null
   */
  async findDuplicate(entry) {
    const allEntries = await this.getAllEntries(10000);
    const normTitle = (entry.title || '').trim().toLowerCase();
    const normQuestion = (entry.question || '').trim().toLowerCase();
    const normAnswer = (entry.answer || '').trim().toLowerCase();

    for (const existing of allEntries) {
      const exTitle = (existing.title || '').trim().toLowerCase();
      const exQuestion = (existing.question || '').trim().toLowerCase();
      const exAnswer = (existing.answer || '').trim().toLowerCase();

      // 标题完全相同
      if (normTitle && normTitle === exTitle) {
        return existing;
      }

      // 问题完全相同
      if (normQuestion && normQuestion.length > 10 && normQuestion === exQuestion) {
        return existing;
      }

      // 答案高度重叠（前200字符相同）
      if (normAnswer && normAnswer.length > 50 && normAnswer.slice(0, 200) === exAnswer.slice(0, 200)) {
        return existing;
      }
    }

    return null;
  }

  async saveEntry(entry) {
    await this.ensureInit();

    // 查重：标题、问题、答案任一匹配则视为重复
    const duplicate = await this.findDuplicate(entry);
    if (duplicate) {
      return { duplicate: true, existing: duplicate };
    }

    const record = {
      title: entry.title || '未命名',
      content: entry.content || '',
      summary: entry.summary || '',
      sourceUrl: entry.sourceUrl || '',
      sourceTitle: entry.sourceTitle || '',
      tags: entry.tags || [],
      category: entry.category || '未分类',
      question: entry.question || '',
      answer: entry.answer || '',
      language: entry.language || 'other',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readwrite');
      const store = tx.objectStore('entries');
      const request = store.add(record);

      request.onsuccess = () => {
        const savedEntry = { ...record, id: request.result };
        if (this._indexBuilt) {
          this._addToIndex(savedEntry);
        }
        this._invalidateCaches();
        resolve(savedEntry);
      };
      request.onerror = () => reject(new Error('保存失败'));
    });
  }

  /**
   * 更新知识条目
   */
  async updateEntry(id, updates) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readwrite');
      const store = tx.objectStore('entries');
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) {
          reject(new Error('条目不存在'));
          return;
        }

        const updated = {
          ...record,
          ...updates,
          updatedAt: new Date().toISOString()
        };

        const putReq = store.put(updated);
        putReq.onsuccess = () => {
          if (this._indexBuilt) {
            this._removeFromIndex(record.id);
            this._addToIndex(updated);
          }
          this._invalidateCaches();
          resolve(updated);
        };
        putReq.onerror = () => reject(new Error('更新失败'));
      };

      getReq.onerror = () => reject(new Error('读取失败'));
    });
  }

  /**
   * 删除知识条目
   */
  async deleteEntry(id) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readwrite');
      const store = tx.objectStore('entries');
      const request = store.delete(id);

      request.onsuccess = () => {
        if (this._indexBuilt) {
          this._removeFromIndex(id);
        }
        this._invalidateCaches();
        resolve(true);
      };
      request.onerror = () => reject(new Error('删除失败'));
    });
  }

  /**
   * 获取单个条目
   */
  async getEntry(id) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('读取失败'));
    });
  }

  /**
   * 获取所有条目（按时间倒序）
   */
  async getAllEntries(limit = 100, offset = 0) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      const index = store.index('createdAt');
      const results = [];

      const request = index.openCursor(null, 'prev');
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }

        if (skipped < offset) {
          skipped++;
          cursor.continue();
          return;
        }

        results.push(cursor.value);
        cursor.continue();
      };

      request.onerror = () => reject(new Error('查询失败'));
    });
  }

  // ==================== 倒排索引 ====================

  /**
   * 从条目中提取所有可搜索的词（小写去重）
   * @param {Object} entry - 知识条目
   * @returns {string[]} - 词数组
   */
  _extractWords(entry) {
    const text = [
      entry.title || '',
      entry.content || '',
      entry.summary || '',
      entry.question || '',
      entry.answer || '',
      entry.language || '',
      ...(entry.tags || [])
    ].join(' ').toLowerCase();
    return text.split(/[\s,;.!?，。；！？、\-()[\]{}"'""'']+/).filter(Boolean);
  }

  /**
   * 构建完整倒排索引（惰性，首次搜索时调用）
   */
  async _buildIndex() {
    const allEntries = await this.getAllEntries(10000);
    this._searchIndex = new Map();
    this._indexEntriesById = new Map();
    for (const entry of allEntries) {
      this._addToIndex(entry);
    }
    this._indexBuilt = true;
  }

  /**
   * 将单个条目加入倒排索引
   * @param {Object} entry - 知识条目
   */
  _addToIndex(entry) {
    const words = this._extractWords(entry);
    const uniqueWords = new Set(words);
    for (const word of uniqueWords) {
      if (!this._searchIndex.has(word)) {
        this._searchIndex.set(word, new Set());
      }
      this._searchIndex.get(word).add(entry.id);
    }
    this._indexEntriesById.set(entry.id, entry);
  }

  /**
   * 从倒排索引中移除指定条目
   * @param {number|string} id - 条目 ID
   */
  _removeFromIndex(id) {
    const entry = this._indexEntriesById.get(id);
    if (!entry) return;
    const words = this._extractWords(entry);
    const uniqueWords = new Set(words);
    for (const word of uniqueWords) {
      const ids = this._searchIndex.get(word);
      if (ids) {
        ids.delete(id);
        if (ids.size === 0) {
          this._searchIndex.delete(word);
        }
      }
    }
    this._indexEntriesById.delete(id);
  }

  /**
   * 检查条目是否匹配查询（原始 includes 逻辑）
   * @param {string} lowerQuery - 小写查询
   * @param {Object} entry - 知识条目
   * @returns {boolean}
   */
  _matchesEntry(lowerQuery, entry) {
    return (
      entry.title.toLowerCase().includes(lowerQuery) ||
      entry.content.toLowerCase().includes(lowerQuery) ||
      entry.summary.toLowerCase().includes(lowerQuery) ||
      entry.question.toLowerCase().includes(lowerQuery) ||
      entry.answer.toLowerCase().includes(lowerQuery) ||
      entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 全量扫描搜索（原始逻辑，作为回退）
   * @param {string} query - 搜索查询
   * @param {string|null} cacheKey - 缓存键
   * @returns {Promise<Array>}
   */
  async _fullScanSearch(query, cacheKey) {
    const allEntries = await this.getAllEntries(1000);
    const lowerQuery = query.toLowerCase();
    const result = allEntries.filter(entry => this._matchesEntry(lowerQuery, entry));
    if (cacheKey) this._setCachedSearch(cacheKey, result);
    return result;
  }

  /**
   * 按标签搜索
   */
  async searchByTag(tag) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      const index = store.index('tags');
      const request = index.getAll(tag);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('搜索失败'));
    });
  }

  /**
   * 按来源 URL 搜索
   */
  async searchByUrl(url) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readonly');
      const store = tx.objectStore('entries');
      const index = store.index('sourceUrl');
      const request = index.getAll(url);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('搜索失败'));
    });
  }

  /**
   * 全文搜索（基于倒排索引加速，短查询回退全量扫描）
   */
  async search(query) {
    await this.ensureInit();

    // LRU 缓存
    const cacheKey = `search:${query}`;
    const cached = this._getCachedSearch(cacheKey);
    if (cached) return cached;

    const lowerQuery = query.toLowerCase().trim();

    // 短查询（< 3 字符）使用全量扫描回退
    if (lowerQuery.length < 3) {
      return this._fullScanSearch(query, cacheKey);
    }

    // 惰性构建倒排索引
    if (!this._indexBuilt) {
      await this._buildIndex();
    }

    // 使用倒排索引查找候选条目
    const candidateIds = new Set();

    // Phase 1: 精确词匹配
    const queryWords = lowerQuery.split(/[\s,;.!?，。；！？、\-()[\]{}"'""'']+/).filter(Boolean);
    for (const qWord of queryWords) {
      const ids = this._searchIndex.get(qWord);
      if (ids) {
        for (const id of ids) candidateIds.add(id);
      }
    }

    // Phase 2: 若无精确匹配，尝试子串匹配索引键
    if (candidateIds.size === 0) {
      for (const [word, ids] of this._searchIndex) {
        if (word.includes(lowerQuery) || lowerQuery.includes(word)) {
          for (const id of ids) candidateIds.add(id);
        }
      }
    }

    // 若索引无结果，回退到全量扫描
    if (candidateIds.size === 0) {
      return this._fullScanSearch(query, cacheKey);
    }

    // 用原始 includes() 逻辑验证候选结果
    const result = [];
    for (const id of candidateIds) {
      const entry = this._indexEntriesById.get(id);
      if (entry && this._matchesEntry(lowerQuery, entry)) {
        result.push(entry);
      }
    }

    this._setCachedSearch(cacheKey, result);
    return result;
  }

  /**
   * 获取所有标签及计数
   */
  async getAllTags() {
    await this.ensureInit();

    if (this._tagsCache) return this._tagsCache;

    const allEntries = await this.getAllEntries(10000);
    const tagCount = {};

    allEntries.forEach(entry => {
      (entry.tags || []).forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });

    const result = Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
    this._tagsCache = result;
    return result;
  }

  /**
   * 获取所有分类及计数
   */
  async getAllCategories() {
    await this.ensureInit();

    if (this._categoriesCache) return this._categoriesCache;

    const allEntries = await this.getAllEntries(10000);
    const catCount = {};

    allEntries.forEach(entry => {
      const cat = entry.category || '未分类';
      catCount[cat] = (catCount[cat] || 0) + 1;
    });

    const result = Object.entries(catCount)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
    this._categoriesCache = result;
    return result;
  }

  /**
   * 获取所有语言标签及计数
   * @returns {Promise<Array<{language: string, count: number}>>}
   */
  async getAllLanguages() {
    await this.ensureInit();

    const allEntries = await this.getAllEntries(10000);
    const langCount = {};

    allEntries.forEach(entry => {
      const lang = entry.language || 'other';
      langCount[lang] = (langCount[lang] || 0) + 1;
    });

    return Object.entries(langCount)
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ==================== 对话历史 ====================

  /**
   * 保存对话
   */
  async saveConversation(conversation) {
    await this.ensureInit();

    const record = {
      sourceUrl: conversation.sourceUrl || '',
      sourceTitle: conversation.sourceTitle || '',
      messages: conversation.messages || [],
      createdAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('conversations', 'readwrite');
      const store = tx.objectStore('conversations');
      const request = store.add(record);

      request.onsuccess = () => resolve({ ...record, id: request.result });
      request.onerror = () => reject(new Error('保存对话失败'));
    });
  }

  /**
   * 获取对话历史
   */
  async getConversations(sourceUrl, limit = 20) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('conversations', 'readonly');
      const store = tx.objectStore('conversations');
      const index = store.index('sourceUrl');
      const request = index.getAll(sourceUrl);

      request.onsuccess = () => {
        const results = (request.result || [])
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, limit);
        resolve(results);
      };

      request.onerror = () => reject(new Error('查询对话失败'));
    });
  }

  // ==================== 统计 ====================

  /**
   * 获取统计信息
   */
  async getStats() {
    await this.ensureInit();

    const entries = await this.getAllEntries(100000);
    const tags = await this.getAllTags();

    return {
      totalEntries: entries.length,
      totalTags: tags.length,
      recentEntries: entries.slice(0, 5),
      topTags: tags.slice(0, 10),
      categories: await this.getAllCategories()
    };
  }

  /**
   * 导出为 JSON
   */
  async exportJSON() {
    const entries = await this.getAllEntries(100000);
    return JSON.stringify(entries, null, 2);
  }

  // ==================== 批量操作 ====================

  /**
   * 批量删除知识条目
   * @param {Array<number|string>} ids - 要删除的条目 ID 数组
   * @returns {Promise<number>} - 成功删除的数量
   */
  async batchDelete(ids) {
    await this.ensureInit();
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    if (ids.length > 100) throw new Error('批量操作最多支持 100 条');

    let deleted = 0;
    for (const id of ids) {
      try {
        await this.deleteEntry(id);
        deleted++;
      } catch (e) {
        // 单条删除失败不影响其他条目
      }
    }
    return deleted;
  }

  /**
   * 批量添加标签
   * @param {Array<number|string>} ids - 要操作的条目 ID 数组
   * @param {string} tag - 要添加的标签
   * @returns {Promise<number>} - 成功添加的数量
   */
  async batchAddTag(ids, tag) {
    await this.ensureInit();
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    if (!tag || typeof tag !== 'string') throw new Error('标签不能为空');
    if (ids.length > 100) throw new Error('批量操作最多支持 100 条');

    let updated = 0;
    for (const id of ids) {
      try {
        const entry = await this.getEntry(id);
        if (entry) {
          const tags = entry.tags || [];
          if (!tags.includes(tag)) {
            tags.push(tag);
            await this.updateEntry(id, { tags });
            updated++;
          }
        }
      } catch (e) {
        // 单条更新失败不影响其他条目
      }
    }
    return updated;
  }

  // ==================== 知识关联引擎 ====================

  /**
   * 对文本进行 bigram 分词
   * 中文按字符 bigram，英文按空格分词后取 bigram
   * @param {string} text - 输入文本
   * @returns {string[]} - bigram 数组
   */
  static bigrams(text) {
    if (!text) return [];
    const normalized = text.toLowerCase().trim();
    const tokens = [];

    const words = normalized.split(/[\s,;.!?，。；！？、\-\(\)\[\]\{\}]+/).filter(Boolean);

    for (const word of words) {
      if (word.length <= 2) {
        tokens.push(word);
      } else {
        for (let i = 0; i < word.length - 1; i++) {
          tokens.push(word.substring(i, i + 2));
        }
      }
    }
    return tokens;
  }

  /**
   * 计算两段文本的相似度（基于 TF 向量余弦相似度）
   * @param {string} text1 - 文本 1
   * @param {string} text2 - 文本 2
   * @returns {number} - 0-1 之间的相似度分数
   */
  static calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    if (text1 === text2) return 1;

    const tokens1 = KnowledgeBase.bigrams(text1);
    const tokens2 = KnowledgeBase.bigrams(text2);

    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    const tf1 = {};
    const tf2 = {};
    for (const t of tokens1) tf1[t] = (tf1[t] || 0) + 1;
    for (const t of tokens2) tf2[t] = (tf2[t] || 0) + 1;

    const allTerms = new Set([...Object.keys(tf1), ...Object.keys(tf2)]);

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (const term of allTerms) {
      const v1 = tf1[term] || 0;
      const v2 = tf2[term] || 0;
      dotProduct += v1 * v2;
      mag1 += v1 * v1;
      mag2 += v2 * v2;
    }

    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * 构造条目的比较文本（title + summary + tags + question）
   * @param {Object} entry - 知识条目
   * @returns {string} - 合并后的文本
   */
  static getEntryCompareText(entry) {
    const parts = [
      entry.title || '',
      entry.summary || '',
      (entry.tags || []).join(' '),
      entry.question || ''
    ];
    return parts.filter(Boolean).join(' ');
  }

  /**
   * 查找与指定条目相关的条目
   * @param {number|string} entryId - 条目 ID
   * @param {number} limit - 返回数量上限
   * @returns {Promise<Array<{entry: Object, score: number}>>} - 相关条目及相似度分数
   */
  async findRelatedEntries(entryId, limit = 5) {
    await this.ensureInit();

    const targetEntry = await this.getEntry(entryId);
    if (!targetEntry) return [];

    const allEntries = await this.getAllEntries(10000);
    const targetText = KnowledgeBase.getEntryCompareText(targetEntry);

    const scored = [];
    for (const entry of allEntries) {
      if (entry.id === entryId) continue;
      const entryText = KnowledgeBase.getEntryCompareText(entry);
      const score = KnowledgeBase.calculateSimilarity(targetText, entryText);
      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  // ==================== 语义搜索 ====================

  /**
   * 构造条目的搜索比较文本（title + summary + question + answer）
   * @param {Object} entry - 知识条目
   * @returns {string} - 合并后的文本
   */
  static getSearchCompareText(entry) {
    const parts = [
      entry.title || '',
      entry.summary || '',
      entry.question || '',
      entry.answer || ''
    ];
    return parts.filter(Boolean).join(' ');
  }

  /**
   * 语义搜索 — 基于 bigram 向量余弦相似度
   * @param {string} query - 搜索查询
   * @param {Array} entries - 知识条目数组
   * @param {number} limit - 返回数量上限
   * @returns {Array<{entry: Object, score: number}>} - 按相关度排序的结果
   */
  static semanticSearch(query, entries, limit = 20) {
    if (!query || !entries || entries.length === 0) return [];

    const scored = [];
    for (const entry of entries) {
      const text = KnowledgeBase.getSearchCompareText(entry);
      const score = KnowledgeBase.calculateSimilarity(query, text);
      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * 综合搜索 — 先关键词匹配，再语义排序，合并去重
   * @param {string} query - 搜索查询
   * @param {number} limit - 返回数量上限
   * @returns {Promise<Array<{entry: Object, score: number, matchType: string}>>} - 综合搜索结果
   */
  async combinedSearch(query, limit = 20) {
    await this.ensureInit();
    if (!query) return [];

    // LRU 缓存
    const cacheKey = `combined:${query}:${limit}`;
    const cached = this._getCachedSearch(cacheKey);
    if (cached) return cached;

    const allEntries = await this.getAllEntries(1000);

    // 1. 关键词匹配
    const lowerQuery = query.toLowerCase();
    const keywordResults = [];
    const keywordIds = new Set();
    for (const entry of allEntries) {
      const matchTitle = entry.title.toLowerCase().includes(lowerQuery);
      const matchContent = entry.content.toLowerCase().includes(lowerQuery);
      const matchSummary = entry.summary.toLowerCase().includes(lowerQuery);
      const matchQuestion = entry.question.toLowerCase().includes(lowerQuery);
      const matchAnswer = entry.answer.toLowerCase().includes(lowerQuery);
      const matchTags = entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery));

      if (matchTitle || matchContent || matchSummary || matchQuestion || matchAnswer || matchTags) {
        keywordResults.push({ entry, score: 1, matchType: 'keyword' });
        keywordIds.add(entry.id);
      }
    }

    // 2. 语义搜索（对全部条目）
    const semanticResults = KnowledgeBase.semanticSearch(query, allEntries, limit);

    // 3. 合并去重：关键词结果优先，语义结果补充
    const combined = [...keywordResults];
    for (const item of semanticResults) {
      if (!keywordIds.has(item.entry.id)) {
        combined.push({ ...item, matchType: 'semantic' });
      }
    }

    // 按 score 降序排列（关键词匹配 score=1 排最前）
    combined.sort((a, b) => b.score - a.score);
    const result = combined.slice(0, limit);
    this._setCachedSearch(cacheKey, result);
    return result;
  }

  /**
   * 获取搜索推荐词（基于 query 的 bigram 展开匹配已有条目中的高频 bigram）
   * @param {string} query - 搜索查询
   * @param {Array} entries - 知识条目数组
   * @param {number} limit - 推荐数量
   * @returns {string[]} - 推荐搜索词
   */
  static getSearchSuggestions(query, entries, limit = 3) {
    if (!query || !entries || entries.length === 0) return [];

    const queryBigrams = new Set(KnowledgeBase.bigrams(query));

    // 收集所有条目的 bigram → 对应标题
    const bigramTitles = {};
    for (const entry of entries) {
      const entryBigrams = KnowledgeBase.bigrams(
        (entry.title || '') + ' ' + (entry.summary || '') + ' ' + (entry.question || '')
      );
      for (const bg of entryBigrams) {
        if (!bigramTitles[bg]) bigramTitles[bg] = new Set();
        bigramTitles[bg].add(entry.title);
      }
    }

    // 找与 query bigram 有交集的条目标题
    const titleScores = {};
    for (const bg of queryBigrams) {
      if (bigramTitles[bg]) {
        for (const title of bigramTitles[bg]) {
          titleScores[title] = (titleScores[title] || 0) + 1;
        }
      }
    }

    // 排序取 top
    return Object.entries(titleScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([title]) => title);
  }

  /**
   * 标记文本中匹配 query 的字段
   * @param {string} query - 搜索查询
   * @param {Object} entry - 知识条目
   * @returns {Object} - { matchedFields: string[] } 匹配到的字段名列表
   */
  static getMatchedFields(query, entry) {
    if (!query || !entry) return { matchedFields: [] };
    const lowerQuery = query.toLowerCase();
    const fields = [];

    if ((entry.title || '').toLowerCase().includes(lowerQuery)) fields.push('title');
    if ((entry.summary || '').toLowerCase().includes(lowerQuery)) fields.push('summary');
    if ((entry.question || '').toLowerCase().includes(lowerQuery)) fields.push('question');
    if ((entry.answer || '').toLowerCase().includes(lowerQuery)) fields.push('answer');
    if ((entry.content || '').toLowerCase().includes(lowerQuery)) fields.push('content');
    if ((entry.tags || []).some(t => t.toLowerCase().includes(lowerQuery))) fields.push('tags');

    return { matchedFields: fields };
  }

  /**
   * 导出为 Markdown
   */
  async exportMarkdown() {
    const entries = await this.getAllEntries(100000);
    let md = '# AI 知识库导出\n\n';
    md += `导出时间：${new Date().toLocaleString('zh-CN')}\n\n---\n\n`;

    entries.forEach((entry, i) => {
      md += `## ${entry.title}\n\n`;
      md += `**来源：** [${entry.sourceTitle || entry.sourceUrl}](${entry.sourceUrl})\n`;
      md += `**标签：** ${entry.tags.join(', ')}\n`;
      md += `**分类：** ${entry.category}\n`;
      if (entry.language) md += `**语言：** ${entry.language}\n`;
      md += `**时间：** ${new Date(entry.createdAt).toLocaleString('zh-CN')}\n\n`;

      if (entry.question) {
        md += `### 问题\n${entry.question}\n\n`;
      }
      if (entry.answer) {
        md += `### 回答\n${entry.answer}\n\n`;
      }
      if (entry.summary) {
        md += `### 摘要\n${entry.summary}\n\n`;
      }

      md += '---\n\n';
    });

    return md;
  }
}
