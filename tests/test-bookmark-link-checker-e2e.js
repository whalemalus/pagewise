/**
 * BookmarkLinkChecker E2E 测试
 *
 * 测试场景：
 * 1. 空书签数组输入
 * 2. 有效 URL (200)
 * 3. 404 URL
 * 4. 重定向 URL (301)
 * 5. 超时 URL
 * 6. 无效 URL 格式
 * 7. 非 HTTP URL (chrome:// 等)
 * 8. 并发限制验证
 * 9. cancel() 中断
 * 10. onProgress 回调次数
 * 11. 同域名限流
 * 12. getReport/getDeadLinks/getRedirectLinks/getResultsByStatus/getLastCheckedAt
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ==================== Mock Setup ====================

// Mock chrome APIs
globalThis.chrome = globalThis.chrome || {};
globalThis.chrome.storage = globalThis.chrome.storage || {};
globalThis.chrome.storage.session = globalThis.chrome.storage.session || {
  get: (keys, cb) => cb && cb({}),
  set: (items, cb) => cb && cb(),
};

// ==================== 动态导入 ====================

// fetch mock 控制器
let fetchMock = null;

// 替换全局 fetch
const originalFetch = globalThis.fetch;

function installFetchMock(handler) {
  fetchMock = handler;
  globalThis.fetch = async (...args) => {
    if (fetchMock) return fetchMock(...args);
    throw new Error('No fetch mock installed');
  };
}

function uninstallFetchMock() {
  fetchMock = null;
  globalThis.fetch = originalFetch;
}

const { BookmarkLinkChecker } = await import('../lib/bookmark-link-checker.js');

// ==================== Helper ====================

function makeBookmark(id, url, title = '') {
  return { id, title: title || `Bookmark ${id}`, url };
}

// ==================== Tests ====================

describe('BookmarkLinkChecker', () => {
  afterEach(() => {
    uninstallFetchMock();
  });

  // --- AC-5: 空数组输入 ---
  describe('空输入', () => {
    it('空数组返回空报告', async () => {
      const checker = new BookmarkLinkChecker();
      const report = await checker.checkAll([]);

      assert.equal(report.total, 0);
      assert.equal(report.alive, 0);
      assert.equal(report.dead, 0);
      assert.equal(report.redirect, 0);
      assert.equal(report.unknown, 0);
      assert.equal(report.results.length, 0);
    });

    it('非数组输入返回空报告', async () => {
      const checker = new BookmarkLinkChecker();
      const report = await checker.checkAll(null);

      assert.equal(report.total, 0);
      assert.equal(report.results.length, 0);
    });
  });

  // --- AC-1: 批量链接检测 ---
  describe('链接检测状态', () => {
    it('有效 URL (200) → alive', async () => {
      installFetchMock(async (url, opts) => {
        return new Response('', { status: 200, type: 'basic' });
      });

      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('https://example.com', 'b1');

      assert.equal(result.status, 'alive');
      assert.equal(result.statusCode, 200);
      assert.equal(result.id, 'b1');
      assert.equal(result.error, null);
      assert.ok(result.duration >= 0);
      assert.ok(result.checkedAt > 0);
    });

    it('404 URL → dead', async () => {
      installFetchMock(async () => {
        return new Response('Not Found', { status: 404, type: 'basic' });
      });

      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('https://example.com/404', 'b2');

      assert.equal(result.status, 'dead');
      assert.equal(result.statusCode, 404);
      assert.ok(result.error.includes('404'));
    });

    it('500 URL → dead', async () => {
      installFetchMock(async () => {
        return new Response('Server Error', { status: 500, type: 'basic' });
      });

      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('https://example.com/500', 'b3');

      assert.equal(result.status, 'dead');
      assert.equal(result.statusCode, 500);
    });

    it('重定向 URL (301) → redirect', async () => {
      installFetchMock(async () => {
        return new Response('', {
          status: 301,
          type: 'basic',
          headers: { Location: 'https://example.com/new' },
        });
      });

      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('https://example.com/old', 'b4');

      assert.equal(result.status, 'redirect');
      assert.equal(result.statusCode, 301);
      assert.equal(result.redirectUrl, 'https://example.com/new');
    });

    it('302 重定向 → redirect', async () => {
      installFetchMock(async () => {
        return new Response('', {
          status: 302,
          type: 'basic',
          headers: { Location: 'https://other.com' },
        });
      });

      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('https://example.com/move', 'b4b');

      assert.equal(result.status, 'redirect');
      assert.equal(result.statusCode, 302);
    });
  });

  // --- AC-5: 边界条件 ---
  describe('边界条件', () => {
    it('超时 URL → dead, error 含 timeout', async () => {
      installFetchMock(async (url, opts) => {
        // 模拟超时：检查 signal
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve(new Response('', { status: 200 }));
          }, 10000);

          if (opts?.signal) {
            opts.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      const checker = new BookmarkLinkChecker({ timeout: 100 }); // 100ms 超时
      const result = await checker.checkOne('https://slow.example.com', 'b5');

      assert.equal(result.status, 'dead');
      assert.ok(result.error && result.error.toLowerCase().includes('timeout'), `Expected timeout error, got: ${result.error}`);
    });

    it('无效 URL 格式 → unknown, error=invalid-url', async () => {
      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('not-a-valid-url', 'b6');

      assert.equal(result.status, 'unknown');
      assert.equal(result.error, 'invalid-url');
    });

    it('chrome:// URL → unknown, 不发请求', async () => {
      let fetchCalled = false;
      installFetchMock(async () => {
        fetchCalled = true;
        return new Response('', { status: 200 });
      });

      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('chrome://settings', 'b7');

      assert.equal(result.status, 'unknown');
      assert.equal(result.error, 'non-http-protocol');
      assert.equal(fetchCalled, false);
    });

    it('javascript: URL → unknown', async () => {
      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('javascript:alert(1)', 'b7b');

      assert.equal(result.status, 'unknown');
      assert.equal(result.error, 'non-http-protocol');
    });

    it('data: URL → unknown', async () => {
      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('data:text/html,<h1>hi</h1>', 'b7c');

      assert.equal(result.status, 'unknown');
      assert.equal(result.error, 'non-http-protocol');
    });
  });

  // --- AC-2: 并发控制 ---
  describe('并发控制', () => {
    it('并发限制验证: concurrency=2 时同时进行的请求 ≤ 2', async () => {
      let inflight = 0;
      let maxInflight = 0;

      installFetchMock(async (url, opts) => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);

        await new Promise(r => setTimeout(r, 50));
        inflight--;
        return new Response('', { status: 200, type: 'basic' });
      });

      const checker = new BookmarkLinkChecker({ concurrency: 2 });
      const bookmarks = Array.from({ length: 6 }, (_, i) =>
        makeBookmark(`b${i}`, `https://example.com/page${i}`)
      );

      await checker.checkAll(bookmarks);

      assert.ok(maxInflight <= 2, `Max inflight was ${maxInflight}, expected ≤ 2`);
      assert.equal(checker.results.length, 6);
    });

    it('cancel() 中断: 已检测结果保留，未检测的不继续', async () => {
      let callCount = 0;

      installFetchMock(async () => {
        callCount++;
        if (callCount >= 3) {
          // 第 3 次调用时检查是否已取消
          await new Promise(r => setTimeout(r, 10));
        }
        return new Response('', { status: 200, type: 'basic' });
      });

      const checker = new BookmarkLinkChecker({ concurrency: 1 });
      const bookmarks = Array.from({ length: 10 }, (_, i) =>
        makeBookmark(`b${i}`, `https://example.com/page${i}`)
      );

      // 在第 2 个完成后取消
      let progressCount = 0;
      checker.onProgress = (checked) => {
        progressCount++;
        if (checked >= 2) {
          checker.cancel();
        }
      };

      const report = await checker.checkAll(bookmarks);

      // 结果数应该 < 总数
      assert.ok(report.results.length < 10, `Expected < 10 results, got ${report.results.length}`);
      assert.ok(report.results.length >= 2, `Expected ≥ 2 results, got ${report.results.length}`);
    });
  });

  // --- AC-3: 进度回调 ---
  describe('进度回调', () => {
    it('onProgress 回调次数 = 检测的书签数', async () => {
      installFetchMock(async () => {
        return new Response('', { status: 200, type: 'basic' });
      });

      let progressCalls = 0;
      const checker = new BookmarkLinkChecker({
        concurrency: 1,
        onProgress: (checked, total, result) => {
          progressCalls++;
          assert.equal(typeof checked, 'number');
          assert.equal(typeof total, 'number');
          assert.ok(result);
        },
      });

      const bookmarks = Array.from({ length: 5 }, (_, i) =>
        makeBookmark(`b${i}`, `https://example.com/page${i}`)
      );

      await checker.checkAll(bookmarks);

      assert.equal(progressCalls, 5);
    });

    it('onComplete 回调触发一次，报告正确', async () => {
      installFetchMock(async () => {
        return new Response('', { status: 200, type: 'basic' });
      });

      let completeReport = null;
      const checker = new BookmarkLinkChecker({
        concurrency: 1,
        onComplete: (report) => {
          completeReport = report;
        },
      });

      const bookmarks = Array.from({ length: 3 }, (_, i) =>
        makeBookmark(`b${i}`, `https://example.com/page${i}`)
      );

      await checker.checkAll(bookmarks);

      assert.ok(completeReport);
      assert.equal(completeReport.total, 3);
      assert.equal(completeReport.alive, 3);
    });
  });

  // --- AC-4: 结果查询方法 ---
  describe('结果查询方法', () => {
    it('getDeadLinks / getRedirectLinks / getResultsByStatus', async () => {
      let callIndex = 0;
      const responses = [
        new Response('', { status: 200, type: 'basic' }),
        new Response('', { status: 404, type: 'basic' }),
        new Response('', { status: 301, type: 'basic', headers: { Location: 'https://new.com' } }),
        new Response('', { status: 500, type: 'basic' }),
      ];

      installFetchMock(async () => {
        return responses[callIndex++] || responses[0];
      });

      const checker = new BookmarkLinkChecker({ concurrency: 1 });
      const bookmarks = [
        makeBookmark('b1', 'https://alive.com'),
        makeBookmark('b2', 'https://dead.com'),
        makeBookmark('b3', 'https://redirect.com'),
        makeBookmark('b4', 'https://error.com'),
      ];

      await checker.checkAll(bookmarks);

      assert.equal(checker.getDeadLinks().length, 2); // 404 + 500
      assert.equal(checker.getRedirectLinks().length, 1); // 301
      assert.equal(checker.getResultsByStatus('alive').length, 1); // 200
      assert.equal(checker.getResultsByStatus('unknown').length, 0);
    });

    it('getReport() 返回当前结果快照', async () => {
      installFetchMock(async () => {
        return new Response('', { status: 200, type: 'basic' });
      });

      const checker = new BookmarkLinkChecker({ concurrency: 1 });
      await checker.checkAll([makeBookmark('b1', 'https://example.com')]);

      const report = checker.getReport();
      assert.equal(report.total, 1);
      assert.equal(report.alive, 1);
      assert.equal(report.results.length, 1);
    });

    it('getLastCheckedAt 初始为 null', () => {
      const checker = new BookmarkLinkChecker();
      assert.equal(checker.getLastCheckedAt(), null);
    });

    it('getLastCheckedAt 检测后有值', async () => {
      installFetchMock(async () => {
        return new Response('', { status: 200, type: 'basic' });
      });

      const checker = new BookmarkLinkChecker({ concurrency: 1 });
      await checker.checkAll([makeBookmark('b1', 'https://example.com')]);

      const lastChecked = checker.getLastCheckedAt();
      assert.ok(lastChecked !== null);
      assert.ok(lastChecked > 0);
    });
  });

  // --- AC-2: 同域名限流 ---
  describe('同域名限流', () => {
    it('同域名请求间隔 ≥ 400ms (允许误差)', async () => {
      const timestamps = [];

      installFetchMock(async (url) => {
        timestamps.push(Date.now());
        return new Response('', { status: 200, type: 'basic' });
      });

      const checker = new BookmarkLinkChecker({ concurrency: 1 });
      const bookmarks = Array.from({ length: 3 }, (_, i) =>
        makeBookmark(`b${i}`, `https://same-domain.com/page${i}`)
      );

      await checker.checkAll(bookmarks);

      // 验证同域名请求间隔
      for (let i = 1; i < timestamps.length; i++) {
        const gap = timestamps[i] - timestamps[i - 1];
        assert.ok(gap >= 400, `Gap between request ${i - 1} and ${i} was ${gap}ms, expected ≥ 400ms`);
      }
    });
  });

  // --- 构造函数参数验证 ---
  describe('构造函数参数', () => {
    it('并发数限制在 1-10', () => {
      const c1 = new BookmarkLinkChecker({ concurrency: 0 });
      assert.equal(c1.concurrency, 1);

      const c2 = new BookmarkLinkChecker({ concurrency: 100 });
      assert.equal(c2.concurrency, 10);

      const c3 = new BookmarkLinkChecker({ concurrency: 5 });
      assert.equal(c3.concurrency, 5);
    });

    it('超时限制在 3000-30000', () => {
      const c1 = new BookmarkLinkChecker({ timeout: 1000 });
      assert.equal(c1.timeout, 3000);

      const c2 = new BookmarkLinkChecker({ timeout: 60000 });
      assert.equal(c2.timeout, 30000);

      const c3 = new BookmarkLinkChecker({ timeout: 8000 });
      assert.equal(c3.timeout, 8000);
    });
  });

  // --- 网络错误处理 ---
  describe('网络错误处理', () => {
    it('网络错误 → dead', async () => {
      installFetchMock(async () => {
        throw new TypeError('Failed to fetch');
      });

      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('https://unreachable.example.com', 'b8');

      assert.equal(result.status, 'dead');
      assert.ok(result.error);
      assert.ok(result.duration >= 0);
    });

    it('DNS 失败 → dead', async () => {
      installFetchMock(async () => {
        throw new TypeError('getaddrinfo ENOTFOUND nonexistent.domain');
      });

      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('https://nonexistent.domain', 'b9');

      assert.equal(result.status, 'dead');
      assert.ok(result.error);
    });
  });

  // --- HEAD 回退 GET ---
  describe('HEAD 回退', () => {
    it('HEAD 失败时回退为 GET', async () => {
      let headAttempts = 0;
      let getAttempts = 0;

      installFetchMock(async (url, opts) => {
        if (opts?.method === 'HEAD') {
          headAttempts++;
          throw new TypeError('Method not allowed');
        }
        if (opts?.method === 'GET') {
          getAttempts++;
          return new Response('', { status: 200, type: 'basic' });
        }
        return new Response('', { status: 200 });
      });

      const checker = new BookmarkLinkChecker();
      const result = await checker.checkOne('https://example.com', 'b10');

      assert.equal(result.status, 'alive');
      assert.equal(headAttempts, 1);
      assert.equal(getAttempts, 1);
    });
  });

  // --- checkAll 综合场景 ---
  describe('checkAll 综合', () => {
    it('混合状态: alive + dead + redirect + unknown', async () => {
      let callIndex = 0;
      const responses = [
        new Response('', { status: 200, type: 'basic' }),
        new Response('', { status: 404, type: 'basic' }),
        new Response('', { status: 302, type: 'basic', headers: { Location: 'https://new.com' } }),
      ];

      installFetchMock(async (url, opts) => {
        if (url.includes('chrome://')) return null; // shouldn't be called
        return responses[callIndex++] || responses[0];
      });

      const checker = new BookmarkLinkChecker({ concurrency: 1 });
      const bookmarks = [
        makeBookmark('b1', 'https://alive.com'),
        makeBookmark('b2', 'https://dead.com'),
        makeBookmark('b3', 'https://redirect.com'),
        makeBookmark('b4', 'chrome://settings'),
        makeBookmark('b5', 'not-a-url'),
      ];

      const report = await checker.checkAll(bookmarks);

      assert.equal(report.total, 5);
      assert.equal(report.alive, 1);
      assert.equal(report.dead, 1);
      assert.equal(report.redirect, 1);
      assert.equal(report.unknown, 2); // chrome:// + invalid
    });
  });
});
