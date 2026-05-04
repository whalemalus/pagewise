/**
 * BookmarkRecommender — 相似书签推荐
 *
 * 基于图谱的相似书签推荐，支持:
 *   - 基于已有图谱的 Top-K 推荐 (recommend)
 *   - 基于内容的即时推荐 (recommendByContent)
 *   - 推荐理由生成 (getRecommendationReason)
 *
 * 与 BookmarkGraphEngine 协同，复用其相似度算法。
 */

/**
 * @typedef {Object} Recommendation
 * @property {Object}   bookmark  — 推荐的书签对象
 * @property {number}   score     — 相似度分数 (0-1)
 * @property {string}   reason    — 推荐理由
 * @property {string}   matchType — 'domain' | 'folder' | 'title' | 'mixed'
 */

export class BookmarkRecommender {
  /**
   * @param {import('./bookmark-graph.js').BookmarkGraphEngine} graphEngine
   */
  constructor(graphEngine) {
    if (!graphEngine) {
      throw new Error('BookmarkRecommender requires a BookmarkGraphEngine instance');
    }
    /** @type {import('./bookmark-graph.js').BookmarkGraphEngine} */
    this._engine = graphEngine;
  }

  // ==================== 核心 API ====================

  /**
   * 推荐 Top-K 相似书签 (基于图谱)
   *
   * @param {string} bookmarkId — 源书签 ID
   * @param {number} [topK=5]   — 推荐数量
   * @returns {Recommendation[]}
   */
  recommend(bookmarkId, topK = 5) {
    const id = String(bookmarkId);
    const similar = this._engine.getSimilar(id, topK);

    if (!similar || similar.length === 0) return [];

    const sourceBookmark = this._getBookmark(id);
    if (!sourceBookmark) return [];

    return similar.map(item => {
      const targetBookmark = item.bookmark;
      const reason = this.getRecommendationReason(sourceBookmark, targetBookmark);
      const matchType = this._determineMatchType(sourceBookmark, targetBookmark);

      return {
        bookmark: targetBookmark,
        score: this._roundScore(item.score),
        reason,
        matchType,
      };
    });
  }

  /**
   * 基于内容推荐 (无需预先构建图谱)
   *
   * 对目标书签与候选列表逐一计算相似度，返回 Top-K。
   *
   * @param {Object}   bookmark   — 源书签 (NormalizedBookmark)
   * @param {Object[]} bookmarks  — 候选书签列表
   * @param {number}   [topK=5]   — 推荐数量
   * @returns {Recommendation[]}
   */
  recommendByContent(bookmark, bookmarks, topK = 5) {
    if (!bookmark || !bookmark.id) return [];
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) return [];

    const scored = [];
    for (const candidate of bookmarks) {
      if (!candidate || !candidate.id) continue;
      if (String(candidate.id) === String(bookmark.id)) continue;

      const score = this._engine.similarity(bookmark, candidate);
      if (score <= 0) continue;

      const reason = this.getRecommendationReason(bookmark, candidate);
      const matchType = this._determineMatchType(bookmark, candidate);

      scored.push({
        bookmark: candidate,
        score: this._roundScore(score),
        reason,
        matchType,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * 生成推荐理由
   *
   * 根据两个书签的相似维度生成自然语言理由:
   *   - 同域名: "同域名: github.com"
   *   - 同文件夹: "同文件夹: 技术 > 前端"
   *   - 标题相似: "标题相似: 都包含 'React'"
   *   - 混合: 组合多个因素
   *
   * @param {Object} source — 源书签
   * @param {Object} target — 目标书签
   * @returns {string}
   */
  getRecommendationReason(source, target) {
    if (!source || !target) return '';

    const reasons = [];

    // 1. 域名匹配
    const domainReason = this._getDomainReason(source, target);
    if (domainReason) reasons.push(domainReason);

    // 2. 文件夹匹配
    const folderReason = this._getFolderReason(source, target);
    if (folderReason) reasons.push(folderReason);

    // 3. 标题相似
    const titleReason = this._getTitleReason(source, target);
    if (titleReason) reasons.push(titleReason);

    if (reasons.length === 0) {
      return '相似内容';
    }

    if (reasons.length === 1) {
      return reasons[0];
    }

    // 混合理由: 组合
    return reasons.join('；');
  }

  // ==================== 内部方法 ====================

  /**
   * 获取书签对象 (从图谱引擎)
   * @param {string} id
   * @returns {Object|null}
   */
  _getBookmark(id) {
    // 复用 graphEngine 的节点数据
    const graphData = this._engine.getGraphData();
    const node = graphData.nodes.find(n => n.id === String(id));
    return node ? node.data : null;
  }

  /**
   * 判断匹配类型
   * @param {Object} source
   * @param {Object} target
   * @returns {'domain'|'folder'|'title'|'mixed'}
   */
  _determineMatchType(source, target) {
    const checks = {
      domain: this._isDomainMatch(source, target),
      folder: this._isFolderMatch(source, target),
      title: this._isTitleMatch(source, target),
    };

    const matchCount = Object.values(checks).filter(Boolean).length;

    if (matchCount > 1) return 'mixed';
    if (checks.domain) return 'domain';
    if (checks.folder) return 'folder';
    if (checks.title) return 'title';
    return 'mixed'; // 默认
  }

  /**
   * 域名匹配判断
   * @param {Object} a
   * @param {Object} b
   * @returns {boolean}
   */
  _isDomainMatch(a, b) {
    const dA = this._extractDomain(a.url || '');
    const dB = this._extractDomain(b.url || '');
    return !!(dA && dB && dA === dB);
  }

  /**
   * 文件夹匹配判断
   * @param {Object} a
   * @param {Object} b
   * @returns {boolean}
   */
  _isFolderMatch(a, b) {
    const pA = a.folderPath || [];
    const pB = b.folderPath || [];
    if (pA.length === 0 || pB.length === 0) return false;
    // 至少共享一个共同前缀
    return pA[0] === pB[0];
  }

  /**
   * 标题相似判断
   * @param {Object} a
   * @param {Object} b
   * @returns {boolean}
   */
  _isTitleMatch(a, b) {
    const tokensA = this._tokenizeTitle(a.title || '');
    const tokensB = this._tokenizeTitle(b.title || '');
    if (tokensA.length === 0 || tokensB.length === 0) return false;
    // 至少有一个共同 token 且该 token 非纯数字
    const setB = new Set(tokensB);
    for (const t of tokensA) {
      if (setB.has(t) && !/^\d+$/.test(t)) return true;
    }
    return false;
  }

  /**
   * 生成域名推荐理由
   * @param {Object} a
   * @param {Object} b
   * @returns {string|null}
   */
  _getDomainReason(a, b) {
    const dA = this._extractDomain(a.url || '');
    const dB = this._extractDomain(b.url || '');
    if (dA && dB && dA === dB) {
      return `同域名: ${dA}`;
    }
    return null;
  }

  /**
   * 生成文件夹推荐理由
   * @param {Object} a
   * @param {Object} b
   * @returns {string|null}
   */
  _getFolderReason(a, b) {
    const pA = a.folderPath || [];
    const pB = b.folderPath || [];
    if (pA.length === 0 || pB.length === 0) return null;

    // 找到最长公共前缀
    const common = [];
    for (let i = 0; i < Math.min(pA.length, pB.length); i++) {
      if (pA[i] === pB[i]) {
        common.push(pA[i]);
      } else {
        break;
      }
    }

    if (common.length === 0) return null;
    return `同文件夹: ${common.join(' > ')}`;
  }

  /**
   * 生成标题推荐理由
   * @param {Object} a
   * @param {Object} b
   * @returns {string|null}
   */
  _getTitleReason(a, b) {
    const tokensA = this._tokenizeTitle(a.title || '');
    const tokensB = this._tokenizeTitle(b.title || '');
    if (tokensA.length === 0 || tokensB.length === 0) return null;

    const setB = new Set(tokensB);
    const common = [];
    const seen = new Set();
    for (const t of tokensA) {
      if (setB.has(t) && !seen.has(t) && !/^\d+$/.test(t)) {
        common.push(t);
        seen.add(t);
      }
    }

    if (common.length === 0) return null;

    // 取前 3 个共同 token
    const display = common.slice(0, 3).map(t => `'${t}'`).join('、');
    return `标题相似: 都包含 ${display}`;
  }

  /**
   * 从 URL 提取域名
   * @param {string} url
   * @returns {string}
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
   * 标题分词
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
   * 四舍五入分数到 4 位小数
   * @param {number} score
   * @returns {number}
   */
  _roundScore(score) {
    return Math.round(score * 10000) / 10000;
  }
}
