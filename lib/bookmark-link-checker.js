/**
 * BookmarkLinkChecker — 链接健康检查
 *
 * 批量检测书签链接的有效性（HTTP HEAD 请求），
 * 支持并发控制、速率限制、进度回调和结果持久化。
 *
 * 纯 ES Module，不依赖外部库。
 *
 * @module BookmarkLinkChecker
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 */

/**
 * @typedef {Object} LinkResult
 * @property {string}      id
 * @property {string}      url
 * @property {'alive'|'dead'|'redirect'|'unknown'} status
 * @property {number|null}  statusCode
 * @property {string|null}  redirectUrl
 * @property {number}       checkedAt
 * @property {string|null}  error
 * @property {number}       duration
 */

/**
 * @typedef {Object} Report
 * @property {number}       total
 * @property {number}       alive
 * @property {number}       dead
 * @property {number}       redirect
 * @property {number}       unknown
 * @property {number}       duration
 * @property {LinkResult[]} results
 */

// ==================== 常量 ====================

/** 非 HTTP 协议前缀，不发起请求 */
const NON_HTTP_PREFIXES = [
  'chrome://', 'chrome-extension://', 'about:',
  'javascript:', 'data:', 'blob:', 'file:',
  'edge://', 'brave://', 'opera://', 'vivaldi://',
];

/** 默认配置 */
const DEFAULT_OPTIONS = {
  concurrency: 5,
  timeout: 8000,
  onProgress: null,
  onComplete: null,
};

// ==================== BookmarkLinkChecker ====================

export class BookmarkLinkChecker {
  /**
   * @param {Object} [options]
   * @param {number} [options.concurrency=5]  并发上限 (1-10)
   * @param {number} [options.timeout=8000]   单次请求超时 ms (3000-30000)
   * @param {function|null} [options.onProgress]  (checked, total, result) => void
   * @param {function|null} [options.onComplete]  (report) => void
   */
  constructor(options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    /** @type {number} */
    this.concurrency = Math.max(1, Math.min(10, opts.concurrency ?? 5));
    /** @type {number} */
    this.timeout = Math.max(3000, Math.min(30000, opts.timeout ?? 8000));
    /** @type {function|null} */
    this.onProgress = opts.onProgress || null;
    /** @type {function|null} */
    this.onComplete = opts.onComplete || null;

    /** @type {LinkResult[]} */
    this.results = [];
    /** @type {boolean} */
    this._cancelled = false;
    /** @type {number|null} */
    this._lastCheckedAt = null;
    /** @type {Map<string, number>} 域名 → 上次请求时间 (ms) */
    this._domainTimestamps = new Map();

    // 统计计数器
    this._alive = 0;
    this._dead = 0;
    this._redirect = 0;
    this._unknown = 0;
  }

  // ==================== 公开方法 ====================

  /**
   * 批量检测所有书签链接
   *
   * @param {Bookmark[]} bookmarks
   * @returns {Promise<Report>}
   */
  async checkAll(bookmarks) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return this._emptyReport();
    }

    this._cancelled = false;
    this.results = [];
    this._alive = 0;
    this._dead = 0;
    this._redirect = 0;
    this._unknown = 0;
    this._lastCheckedAt = null;
    this._domainTimestamps.clear();

    const total = bookmarks.length;
    const startTime = Date.now();

    // 并发控制队列
    let index = 0;
    const workers = [];

    const worker = async () => {
      while (index < bookmarks.length && !this._cancelled) {
        const currentIndex = index++;
        const bookmark = bookmarks[currentIndex];

        // 域名限流
        await this._throttleDomain(bookmark.url);

        if (this._cancelled) break;

        const result = await this.checkOne(bookmark.url, bookmark.id);
        this.results.push(result);
        this._updateCounters(result);
        this._lastCheckedAt = result.checkedAt;

        // 进度回调
        if (this.onProgress) {
          try {
            this.onProgress(this.results.length, total, result);
          } catch (e) {
            // 回调异常不中断检测
          }
        }
      }
    };

    // 启动并发 worker
    for (let i = 0; i < Math.min(this.concurrency, bookmarks.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    const duration = Date.now() - startTime;

    const report = this._buildReport(total, duration);

    // 完成回调
    if (this.onComplete) {
      try {
        this.onComplete(report);
      } catch (e) {
        // 回调异常不中断
      }
    }

    return report;
  }

  /**
   * 检测单个链接
   *
   * @param {string} url
   * @param {string} [bookmarkId='']
   * @returns {Promise<LinkResult>}
   */
  async checkOne(url, bookmarkId = '') {
    const startTime = Date.now();

    // 无效 URL → unknown（先检查格式，再检查协议）
    if (!this._isValidUrl(url)) {
      return this._makeResult(bookmarkId, url, 'unknown', null, null, startTime, 'invalid-url');
    }

    // 非 HTTP URL → unknown
    if (this._isNonHttp(url)) {
      return this._makeResult(bookmarkId, url, 'unknown', null, null, startTime, 'non-http-protocol');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      let response;
      try {
        // 先尝试 HEAD 请求
        response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'manual',
          mode: 'no-cors',
        });
      } catch (headError) {
        // HEAD 失败时回退为 GET（某些服务器拒绝 HEAD）
        if (!controller.signal.aborted) {
          try {
            response = await fetch(url, {
              method: 'GET',
              signal: controller.signal,
              redirect: 'manual',
              mode: 'no-cors',
            });
          } catch (getError) {
            clearTimeout(timeoutId);
            throw getError;
          }
        } else {
          clearTimeout(timeoutId);
          throw headError;
        }
      }

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      // no-cors 模式下 status 为 0，opaque response 视为 alive
      if (response.type === 'opaque') {
        return this._makeResult(bookmarkId, url, 'alive', 0, null, startTime, null, duration);
      }

      const statusCode = response.status;

      // 3xx 重定向
      if (statusCode >= 300 && statusCode < 400) {
        const redirectUrl = response.headers?.get('location') || null;
        return this._makeResult(bookmarkId, url, 'redirect', statusCode, redirectUrl, startTime, null, duration);
      }

      // 2xx 成功
      if (statusCode >= 200 && statusCode < 300) {
        return this._makeResult(bookmarkId, url, 'alive', statusCode, null, startTime, null, duration);
      }

      // 4xx/5xx 失败
      return this._makeResult(bookmarkId, url, 'dead', statusCode, null, startTime, `HTTP ${statusCode}`, duration);

    } catch (error) {
      const duration = Date.now() - startTime;

      if (error.name === 'AbortError') {
        return this._makeResult(bookmarkId, url, 'dead', null, null, startTime, 'timeout', duration);
      }

      // 网络错误
      const errorMsg = error.message || 'network-error';
      return this._makeResult(bookmarkId, url, 'dead', null, null, startTime, errorMsg, duration);
    }
  }

  /**
   * 中断正在进行的批量检测
   */
  cancel() {
    this._cancelled = true;
  }

  /**
   * 获取当前结果快照
   *
   * @returns {Report}
   */
  getReport() {
    const total = this.results.length;
    const duration = total > 0
      ? (this.results[this.results.length - 1]?.checkedAt || 0) - (this.results[0]?.checkedAt || 0)
      : 0;
    return this._buildReport(total, duration);
  }

  /**
   * 获取所有失效链接
   *
   * @returns {LinkResult[]}
   */
  getDeadLinks() {
    return this.getResultsByStatus('dead');
  }

  /**
   * 获取所有重定向链接
   *
   * @returns {LinkResult[]}
   */
  getRedirectLinks() {
    return this.getResultsByStatus('redirect');
  }

  /**
   * 按状态过滤结果
   *
   * @param {'alive'|'dead'|'redirect'|'unknown'} status
   * @returns {LinkResult[]}
   */
  getResultsByStatus(status) {
    return this.results.filter(r => r.status === status);
  }

  /**
   * 返回最后检测时间
   *
   * @returns {number|null}
   */
  getLastCheckedAt() {
    return this._lastCheckedAt;
  }

  // ==================== 内部方法 ====================

  /**
   * 域名限流：同域名请求间隔 ≥ 500ms (QPS ≤ 2)
   *
   * @param {string} url
   * @returns {Promise<void>}
   */
  async _throttleDomain(url) {
    let domain;
    try {
      domain = new URL(url).hostname;
    } catch {
      return; // 无效 URL，不做限流
    }

    const now = Date.now();
    const lastTime = this._domainTimestamps.get(domain) || 0;
    const elapsed = now - lastTime;

    if (elapsed < 500) {
      await this._sleep(500 - elapsed);
    }

    this._domainTimestamps.set(domain, Date.now());
  }

  /**
   * 判断是否为非 HTTP 协议
   *
   * @param {string} url
   * @returns {boolean}
   */
  _isNonHttp(url) {
    if (!url || typeof url !== 'string') return true;
    const lower = url.toLowerCase().trim();
    return !lower.startsWith('http://') && !lower.startsWith('https://')
      || NON_HTTP_PREFIXES.some(prefix => lower.startsWith(prefix));
  }

  /**
   * 判断 URL 格式是否有效
   *
   * @param {string} url
   * @returns {boolean}
   */
  _isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 构造 LinkResult
   *
   * @returns {LinkResult}
   */
  _makeResult(id, url, status, statusCode, redirectUrl, startTime, error = null, duration = null) {
    return {
      id: id || '',
      url,
      status,
      statusCode: statusCode ?? null,
      redirectUrl: redirectUrl ?? null,
      checkedAt: Date.now(),
      error: error ?? null,
      duration: duration ?? (Date.now() - startTime),
    };
  }

  /**
   * 更新统计计数器
   *
   * @param {LinkResult} result
   */
  _updateCounters(result) {
    switch (result.status) {
      case 'alive': this._alive++; break;
      case 'dead': this._dead++; break;
      case 'redirect': this._redirect++; break;
      case 'unknown': this._unknown++; break;
    }
  }

  /**
   * 构造报告
   *
   * @param {number} total
   * @param {number} duration
   * @returns {Report}
   */
  _buildReport(total, duration) {
    return {
      total,
      alive: this._alive,
      dead: this._dead,
      redirect: this._redirect,
      unknown: this._unknown,
      duration,
      results: [...this.results],
    };
  }

  /**
   * 空报告
   *
   * @returns {Report}
   */
  _emptyReport() {
    return {
      total: 0,
      alive: 0,
      dead: 0,
      redirect: 0,
      unknown: 0,
      duration: 0,
      results: [],
    };
  }

  /**
   * 异步等待
   *
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
