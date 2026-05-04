/**
 * BookmarkGraphEngine — 书签图谱引擎
 *
 * 从书签数组构建相似度图谱，支持:
 *   - 混合相似度算法 (Jaccard + 域名匹配 + 文件夹重叠)
 *   - Top-K 相似书签推荐
 *   - 按域名/文件夹的聚类
 *   - 优化: 使用倒排索引避免 O(n²) 全量计算
 *
 * 性能: 1000 书签图谱构建 < 10 秒
 */

/**
 * @typedef {Object} NormalizedBookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} folderPath
 */

/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} label
 * @property {string} group
 * @property {number} size
 * @property {Object} data — 原始书签数据
 */

/**
 * @typedef {Object} GraphEdge
 * @property {string} source
 * @property {string} target
 * @property {number} weight — 相似度分数 (0-1)
 */

/**
 * @typedef {Object} GraphData
 * @property {GraphNode[]} nodes
 * @property {GraphEdge[]} edges
 */

export class BookmarkGraphEngine {
  constructor() {
    /** @type {Map<string, NormalizedBookmark>} id → bookmark */
    this._bookmarkStore = new Map();
    /** @type {Map<string, Set<string>>} token → Set<bookmarkId> (倒排索引) */
    this._tokenIndex = new Map();
    /** @type {Map<string, Set<string>>} domain → Set<bookmarkId> */
    this._domainIndex = new Map();
    /** @type {Map<string, Set<string>>} folderKey → Set<bookmarkId> */
    this._folderIndex = new Map();
    /** @type {Map<string, Set<string>>} id → Set<neighborId> (缓存连接关系) */
    this._adjacency = new Map();
    /** @type {GraphData} */
    this._graph = { nodes: [], edges: [] };
    /** @type {number} 相似度阈值 — 低于此值的边不加入图谱 */
    this._threshold = 0.1;
  }

  // ==================== 核心 API ====================

  /**
   * 从书签数组构建图谱
   * @param {NormalizedBookmark[]} bookmarks
   * @returns {GraphData} { nodes, edges }
   */
  buildGraph(bookmarks) {
    // 重置状态
    this._bookmarkStore.clear();
    this._tokenIndex.clear();
    this._domainIndex.clear();
    this._folderIndex.clear();
    this._adjacency.clear();
    this._graph = { nodes: [], edges: [] };

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return this._graph;
    }

    // 1. 存储书签并建立索引
    for (const bm of bookmarks) {
      if (!bm || !bm.id) continue;
      const id = String(bm.id);
      this._bookmarkStore.set(id, bm);
      this._adjacency.set(id, new Set());

      // 标题 token 倒排索引
      const tokens = this._tokenizeTitle(bm.title || '');
      for (const token of tokens) {
        let entry = this._tokenIndex.get(token);
        if (!entry) {
          entry = new Set();
          this._tokenIndex.set(token, entry);
        }
        entry.add(id);
      }

      // 域名索引
      const domain = this._extractDomain(bm.url || '');
      if (domain) {
        let dEntry = this._domainIndex.get(domain);
        if (!dEntry) {
          dEntry = new Set();
          this._domainIndex.set(domain, dEntry);
        }
        dEntry.add(id);
      }

      // 文件夹索引
      const folderKey = this._getFolderKey(bm.folderPath);
      if (folderKey) {
        let fEntry = this._folderIndex.get(folderKey);
        if (!fEntry) {
          fEntry = new Set();
          this._folderIndex.set(folderKey, fEntry);
        }
        fEntry.add(id);
      }
    }

    // 2. 使用倒排索引生成候选对 (避免 O(n²))
    const edgeMap = new Map(); // "id1-id2" → weight
    const allIds = [...this._bookmarkStore.keys()];

    // 基于共享 token 的候选对
    for (const [, idSet] of this._tokenIndex) {
      const ids = [...idSet];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          this._maybeAddEdge(ids[i], ids[j], edgeMap);
        }
      }
    }

    // 基于共享域名的候选对
    for (const [, idSet] of this._domainIndex) {
      const ids = [...idSet];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          this._maybeAddEdge(ids[i], ids[j], edgeMap);
        }
      }
    }

    // 基于共享文件夹的候选对
    for (const [, idSet] of this._folderIndex) {
      const ids = [...idSet];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          this._maybeAddEdge(ids[i], ids[j], edgeMap);
        }
      }
    }

    // 3. 构建边数组
    const edges = [];
    for (const [key, weight] of edgeMap) {
      if (weight < this._threshold) continue;
      const [source, target] = key.split('\x00');
      edges.push({ source, target, weight });
      this._adjacency.get(source)?.add(target);
      this._adjacency.get(target)?.add(source);
    }

    // 4. 构建节点数组
    const nodes = allIds.map(id => {
      const bm = this._bookmarkStore.get(id);
      const connCount = this._adjacency.get(id)?.size || 0;
      return {
        id,
        label: bm.title || bm.url || id,
        group: this._assignGroup(bm),
        size: 1 + Math.min(connCount, 20), // 1-21 缩放
        data: bm,
      };
    });

    this._graph = { nodes, edges };
    return this._graph;
  }

  /**
   * 计算两个书签的相似度 (0-1)
   *
   * 混合策略:
   *   0.4 × Jaccard(titleTokens) +
   *   0.3 × domainMatch +
   *   0.3 × folderOverlap
   *
   * @param {NormalizedBookmark|string} a — 书签或 ID
   * @param {NormalizedBookmark|string} b — 书签或 ID
   * @returns {number} 相似度分数 (0-1)
   */
  similarity(a, b) {
    const bmA = typeof a === 'string' ? this._bookmarkStore.get(a) : a;
    const bmB = typeof b === 'string' ? this._bookmarkStore.get(b) : b;

    if (!bmA || !bmB) return 0;

    // 1. 标题 Jaccard 相似度 (0.4)
    const tokensA = this._tokenizeTitle(bmA.title || '');
    const tokensB = this._tokenizeTitle(bmB.title || '');
    const jaccard = this._jaccard(tokensA, tokensB);

    // 2. 域名匹配 (0.3)
    const domainA = this._extractDomain(bmA.url || '');
    const domainB = this._extractDomain(bmB.url || '');
    const domainMatch = (domainA && domainB && domainA === domainB) ? 1 : 0;

    // 3. 文件夹重叠 (0.3)
    const folderOverlap = this._folderOverlapScore(
      bmA.folderPath || [],
      bmB.folderPath || [],
    );

    return 0.4 * jaccard + 0.3 * domainMatch + 0.3 * folderOverlap;
  }

  /**
   * 获取 Top-K 相似书签
   * @param {string} bookmarkId
   * @param {number} [topK=5]
   * @returns {Array<{ id: string, score: number, bookmark: Object }>}
   */
  getSimilar(bookmarkId, topK = 5) {
    const id = String(bookmarkId);
    const bm = this._bookmarkStore.get(id);
    if (!bm) return [];

    // 优先使用已计算的邻接边
    const neighbors = this._adjacency.get(id);
    const scored = [];

    if (neighbors && neighbors.size > 0) {
      // 从已有的边中查找权重
      for (const nId of neighbors) {
        const score = this.similarity(id, nId);
        scored.push({
          id: nId,
          score,
          bookmark: this._bookmarkStore.get(nId),
        });
      }
    } else {
      // 如果没有预计算的邻居，回退到全量计算
      for (const [otherId] of this._bookmarkStore) {
        if (otherId === id) continue;
        const score = this.similarity(id, otherId);
        if (score > 0) {
          scored.push({
            id: otherId,
            score,
            bookmark: this._bookmarkStore.get(otherId),
          });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * 返回当前图谱数据
   * @returns {GraphData}
   */
  getGraphData() {
    return {
      nodes: [...this._graph.nodes],
      edges: [...this._graph.edges],
    };
  }

  /**
   * 返回按域名/文件夹的聚类
   * @returns {{ byDomain: Map<string, Object[]>, byFolder: Map<string, Object[]> }}
   */
  getClusters() {
    const byDomain = new Map();
    const byFolder = new Map();

    for (const [id, bm] of this._bookmarkStore) {
      // 域名聚类
      const domain = this._extractDomain(bm.url || '');
      if (domain) {
        if (!byDomain.has(domain)) byDomain.set(domain, []);
        byDomain.get(domain).push({ id, title: bm.title, url: bm.url });
      }

      // 文件夹聚类
      const folderKey = this._getFolderKey(bm.folderPath);
      if (folderKey) {
        if (!byFolder.has(folderKey)) byFolder.set(folderKey, []);
        byFolder.get(folderKey).push({ id, title: bm.title, url: bm.url });
      }
    }

    return { byDomain, byFolder };
  }

  // ==================== 相似度计算 ====================

  /**
   * 可能添加边 — 计算相似度，超过阈值则记录
   * @param {string} id1
   * @param {string} id2
   * @param {Map<string, number>} edgeMap
   */
  _maybeAddEdge(id1, id2, edgeMap) {
    const key = id1 < id2 ? `${id1}\x00${id2}` : `${id2}\x00${id1}`;
    if (edgeMap.has(key)) return; // 已计算过

    const score = this.similarity(id1, id2);
    edgeMap.set(key, score);
  }

  /**
   * Jaccard 相似度
   * @param {string[]} setA
   * @param {string[]} setB
   * @returns {number} 0-1
   */
  _jaccard(setA, setB) {
    if (setA.length === 0 && setB.length === 0) return 0;
    const a = new Set(setA);
    const b = new Set(setB);
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * 文件夹路径重叠评分
   * 计算两个 folderPath 的公共前缀占比
   * @param {string[]} pathA
   * @param {string[]} pathB
   * @returns {number} 0-1
   */
  _folderOverlapScore(pathA, pathB) {
    if (!pathA || !pathB || pathA.length === 0 || pathB.length === 0) return 0;
    const maxLen = Math.max(pathA.length, pathB.length);
    let common = 0;
    for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
      if (pathA[i] === pathB[i]) {
        common++;
      } else {
        break;
      }
    }
    return common / maxLen;
  }

  // ==================== 工具方法 ====================

  /**
   * 标题分词 — 复用 BookmarkIndexer 的分词策略
   * @param {string} title
   * @returns {string[]}
   */
  _tokenizeTitle(title) {
    if (!title || typeof title !== 'string') return [];
    const tokens = [];
    const segments = title.match(/[一-鿿]|[a-zA-Z]+|[0-9]+/g) || [];
    for (const seg of segments) {
      if (/[一-鿿]/.test(seg)) {
        for (const char of seg) {
          tokens.push(char);
        }
      } else if (/[a-zA-Z]/.test(seg)) {
        tokens.push(seg.toLowerCase());
      } else {
        tokens.push(seg);
      }
    }
    return tokens;
  }

  /**
   * 从 URL 提取域名
   * @param {string} url
   * @returns {string} 去掉 www. 的域名，或空字符串
   */
  _extractDomain(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * 文件夹路径 → 索引键
   * @param {string[]} folderPath
   * @returns {string}
   */
  _getFolderKey(folderPath) {
    if (!folderPath || !Array.isArray(folderPath) || folderPath.length === 0) return '';
    return folderPath.join('/');
  }

  /**
   * 为书签分配分组 (优先文件夹 → 域名 → "default")
   * @param {NormalizedBookmark} bm
   * @returns {string}
   */
  _assignGroup(bm) {
    // 优先使用第一级文件夹
    if (bm.folderPath && bm.folderPath.length > 0) {
      return bm.folderPath[0];
    }
    // 回退到域名
    const domain = this._extractDomain(bm.url || '');
    if (domain) return domain;
    return 'default';
  }
}
