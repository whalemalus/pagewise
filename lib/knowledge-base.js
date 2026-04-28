/**
 * KnowledgeBase - 基于 IndexedDB 的本地知识库
 */

export class KnowledgeBase {
  constructor() {
    this.dbName = 'AIAssistantKnowledgeBase';
    this.dbVersion = 1;
    this.db = null;
  }

  /**
   * 初始化数据库
   */
  async init() {
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
        reject(new Error(`IndexedDB error: ${event.target.error}`));
      };
    });
  }

  /**
   * 确保数据库已初始化
   */
  async ensureInit() {
    if (!this.db) await this.init();
  }

  // ==================== 知识条目 CRUD ====================

  /**
   * 保存知识条目
   */
  async saveEntry(entry) {
    await this.ensureInit();

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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('entries', 'readwrite');
      const store = tx.objectStore('entries');
      const request = store.add(record);

      request.onsuccess = () => resolve({ ...record, id: request.result });
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
        putReq.onsuccess = () => resolve(updated);
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

      request.onsuccess = () => resolve(true);
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
   * 全文搜索（简单实现，遍历匹配）
   */
  async search(query) {
    await this.ensureInit();

    const allEntries = await this.getAllEntries(1000);
    const lowerQuery = query.toLowerCase();

    return allEntries.filter(entry => {
      return (
        entry.title.toLowerCase().includes(lowerQuery) ||
        entry.content.toLowerCase().includes(lowerQuery) ||
        entry.summary.toLowerCase().includes(lowerQuery) ||
        entry.question.toLowerCase().includes(lowerQuery) ||
        entry.answer.toLowerCase().includes(lowerQuery) ||
        entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    });
  }

  /**
   * 获取所有标签及计数
   */
  async getAllTags() {
    await this.ensureInit();

    const allEntries = await this.getAllEntries(10000);
    const tagCount = {};

    allEntries.forEach(entry => {
      (entry.tags || []).forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });

    return Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 获取所有分类及计数
   */
  async getAllCategories() {
    await this.ensureInit();

    const allEntries = await this.getAllEntries(10000);
    const catCount = {};

    allEntries.forEach(entry => {
      const cat = entry.category || '未分类';
      catCount[cat] = (catCount[cat] || 0) + 1;
    });

    return Object.entries(catCount)
      .map(([category, count]) => ({ category, count }))
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
