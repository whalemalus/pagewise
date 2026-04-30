/**
 * AI Response Cache — 避免重复请求
 *
 * 纯内存 LRU 缓存，基于请求内容哈希键存取 AI 响应。
 * 生命周期与扩展进程一致，关闭时自然清理。
 *
 * @module ai-cache
 */

// ==================== FNV-1a 哈希 ====================

/**
 * FNV-1a 32 位哈希算法（浏览器/Node 通用，无依赖）
 * @param {string} str - 输入字符串
 * @returns {string} 32 位十六进制哈希
 */
function fnv1aHash(str) {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime，>>> 0 确保无符号 32 位
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * 生成 32 位十六进制缓存键（8 字符 FNV-1a × 4 段拼接 → 32 字符）
 * 通过多轮哈希增加散列空间
 * @param {string} str
 * @returns {string} 32 位十六进制字符串
 */
function hash32(str) {
  const h1 = fnv1aHash(str);
  const h2 = fnv1aHash(str + '\x00');
  const h3 = fnv1aHash('\x01' + str);
  const h4 = fnv1aHash(str + '\x02');
  return h1 + h2 + h3 + h4;
}

// ==================== 缓存键生成 ====================

/**
 * 从消息中提取纯文本内容（用于缓存键）
 * @param {string|Array} content
 * @returns {string}
 */
function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const texts = [];
    for (const part of content) {
      if (part.type === 'text') {
        texts.push(part.text || '');
      }
    }
    return texts.join('|');
  }
  return '';
}

/**
 * 检查消息是否包含图片（图片消息不参与缓存）
 * @param {string|Array} content
 * @returns {boolean}
 */
function hasImageContent(content) {
  if (!Array.isArray(content)) return false;
  return content.some(
    part => part.type === 'image_url' || part.type === 'image'
  );
}

/**
 * 生成缓存键
 *
 * @param {Object} options
 * @param {Array} options.messages - 消息数组
 * @param {string} options.systemPrompt - 系统提示
 * @param {string} options.model - 模型名称
 * @param {number} options.maxTokens - 最大 token 数
 * @param {string} options.protocol - 协议类型 (openai|claude)
 * @returns {string|null} 32 位十六进制哈希键，或 null（含图片时不缓存）
 */
export function generateCacheKey(options) {
  const {
    messages = [],
    systemPrompt = '',
    model = '',
    maxTokens = 4096,
    protocol = 'openai'
  } = options;

  // 检查是否包含图片
  for (const msg of messages) {
    if (hasImageContent(msg.content)) {
      return null; // 图片消息不缓存
    }
  }

  // 构建键字符串
  const parts = [
    model,
    String(maxTokens),
    protocol,
    systemPrompt
  ];

  for (const msg of messages) {
    parts.push(msg.role + ':' + extractTextContent(msg.content));
  }

  return hash32(parts.join('||'));
}

// ==================== LRU 缓存 ====================

/**
 * AI 响应缓存
 *
 * @example
 * const cache = new AICache({ maxSize: 50, ttlMs: 30 * 60 * 1000 });
 * cache.set('key', { content: 'AI 回答', model: 'gpt-4o' });
 * const result = cache.get('key'); // { content: '...', model: '...', cachedAt: ... }
 */
export class AICache {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSize=50] - 最大缓存条目数
   * @param {number} [options.ttlMs=1800000] - 条目存活时间（毫秒），默认 30 分钟
   */
  constructor(options = {}) {
    /** @type {Map<string, { value: Object, cachedAt: number }>} */
    this._store = new Map();
    /** @type {number} */
    this.maxSize = options.maxSize ?? 50;
    /** @type {number} */
    this.ttlMs = options.ttlMs ?? 30 * 60 * 1000;

    // 统计
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  /**
   * 获取缓存条目
   * @param {string} key
   * @returns {Object|null} 缓存值（含 cachedAt），或 null（未命中/已过期）
   */
  get(key) {
    if (!this._store.has(key)) {
      this._misses++;
      return null;
    }

    const entry = this._store.get(key);

    // 检查 TTL
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this._store.delete(key);
      this._misses++;
      return null;
    }

    // LRU: 删除并重新插入（Map 迭代序 = 插入序）
    this._store.delete(key);
    this._store.set(key, entry);
    this._hits++;

    return { ...entry.value, cachedAt: entry.cachedAt };
  }

  /**
   * 存入缓存条目
   * @param {string} key
   * @param {Object} value
   */
  set(key, value) {
    // 如果已存在，先删除（确保 size 计算准确）
    if (this._store.has(key)) {
      this._store.delete(key);
    }

    // maxSize=0 时不缓存任何条目
    if (this.maxSize <= 0) {
      this._evictions++;
      return;
    }

    // LRU 淘汰
    while (this._store.size >= this.maxSize) {
      const oldestKey = this._store.keys().next().value;
      this._store.delete(oldestKey);
      this._evictions++;
    }

    this._store.set(key, {
      value: { ...value },
      cachedAt: Date.now()
    });
  }

  /**
   * 删除缓存条目
   * @param {string} key
   * @returns {boolean} 是否存在并被删除
   */
  delete(key) {
    return this._store.delete(key);
  }

  /**
   * 检查键是否存在且未过期
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    if (!this._store.has(key)) return false;
    const entry = this._store.get(key);
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this._store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * 清除所有缓存
   */
  clear() {
    this._store.clear();
  }

  /**
   * 当前缓存条目数
   * @returns {number}
   */
  size() {
    return this._store.size;
  }

  /**
   * 主动清理过期条目
   * @returns {number} 被清理的条目数
   */
  evictExpired() {
    let evicted = 0;
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (now - entry.cachedAt > this.ttlMs) {
        this._store.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  /**
   * 缓存统计
   * @returns {{ hits: number, misses: number, evictions: number, size: number }}
   */
  stats() {
    return {
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      size: this._store.size
    };
  }
}
