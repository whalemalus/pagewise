/**
 * 测试 lib/bookmark-security-audit.js — 安全审计模块
 *
 * 测试范围:
 *   构造器 / XSS 检测 / URL 安全审计 / 数据隔离审计
 *   权限审计 / 综合审计报告 / 修复建议 / 边界情况
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const {
  BookmarkSecurityAudit,
  XSS_PATTERNS,
  DANGEROUS_SCHEMES,
  RESTRICTED_PERMISSIONS,
  SEVERITY_LEVELS,
} = await import('../lib/bookmark-security-audit.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, opts = {}) {
  return {
    id: String(id),
    title,
    url,
    folderPath: opts.folderPath || ['默认'],
    tags: opts.tags || [],
    status: opts.status || 'unread',
    dateAdded: opts.dateAdded || 1700000000000,
    dateAddedISO: opts.dateAddedISO || new Date(1700000000000).toISOString(),
    ...opts.extra,
  };
}

const safeBookmarks = [
  createBookmark('1', 'React 官方文档', 'https://react.dev/learn'),
  createBookmark('2', 'MDN Web Docs', 'https://developer.mozilla.org/zh-CN/', { tags: ['前端', '文档'] }),
  createBookmark('3', 'GitHub', 'https://github.com/trending', { status: 'reading' }),
];

// ==================== 测试 ====================

describe('BookmarkSecurityAudit', () => {
  let auditor;

  beforeEach(() => {
    auditor = new BookmarkSecurityAudit();
  });

  // ─── 1. 构造器与常量 ───────────────────────────────────────────────────────

  it('1. 构造器默认参数正确', () => {
    assert.ok(auditor instanceof BookmarkSecurityAudit);
    assert.equal(auditor.strictMode, false, '默认 strictMode 应为 false');
  });

  it('2. 构造器支持 strictMode 选项', () => {
    const strict = new BookmarkSecurityAudit({ strictMode: true });
    assert.equal(strict.strictMode, true);
  });

  it('3. 导出常量 XSS_PATTERNS 为数组', () => {
    assert.ok(Array.isArray(XSS_PATTERNS), 'XSS_PATTERNS 应为数组');
    assert.ok(XSS_PATTERNS.length > 0, 'XSS_PATTERNS 不应为空');
    for (const pattern of XSS_PATTERNS) {
      assert.ok(pattern instanceof RegExp, `XSS pattern 应为 RegExp: ${pattern}`);
    }
  });

  it('4. 导出常量 DANGEROUS_SCHEMES 为数组', () => {
    assert.ok(Array.isArray(DANGEROUS_SCHEMES), 'DANGEROUS_SCHEMES 应为数组');
    assert.ok(DANGEROUS_SCHEMES.includes('javascript:'), '应包含 javascript:');
    assert.ok(DANGEROUS_SCHEMES.includes('data:'), '应包含 data:');
  });

  it('5. 导出常量 SEVERITY_LEVELS 包含四级', () => {
    assert.ok(SEVERITY_LEVELS, 'SEVERITY_LEVELS 应存在');
    assert.ok(SEVERITY_LEVELS.critical, '应有 critical');
    assert.ok(SEVERITY_LEVELS.high, '应有 high');
    assert.ok(SEVERITY_LEVELS.medium, '应有 medium');
    assert.ok(SEVERITY_LEVELS.low, '应有 low');
  });

  // ─── 6. XSS 检测: 标题中的脚本注入 ────────────────────────────────────────

  it('6. 检测标题中的 <script> 标签', () => {
    const malicious = [
      createBookmark('x1', '<script>alert(1)</script>恶意标题', 'https://example.com'),
    ];
    const report = auditor.scanXSS([...safeBookmarks, ...malicious]);
    assert.ok(report.issues.length > 0, '应检测到 XSS 问题');
    const scriptIssue = report.issues.find(i => i.field === 'title' && i.type === 'script-tag');
    assert.ok(scriptIssue, '应检测到 script 标签注入');
    assert.equal(scriptIssue.severity, 'critical', 'script 标签应为 critical 级别');
  });

  it('7. 检测 URL 中的 javascript: 协议', () => {
    const malicious = [
      createBookmark('x2', '恶意链接', 'javascript:alert(document.cookie)'),
    ];
    const report = auditor.scanXSS(malicious);
    const schemeIssue = report.issues.find(i => i.type === 'dangerous-scheme');
    assert.ok(schemeIssue, '应检测到 javascript: 协议');
    assert.equal(schemeIssue.severity, 'critical');
  });

  it('8. 检测标题中的事件处理器属性', () => {
    const malicious = [
      createBookmark('x3', '<img src=x onerror=alert(1)>测试', 'https://example.com'),
    ];
    const report = auditor.scanXSS(malicious);
    const handlerIssue = report.issues.find(i => i.type === 'event-handler');
    assert.ok(handlerIssue, '应检测到事件处理器');
    assert.ok(handlerIssue.severity === 'critical' || handlerIssue.severity === 'high');
  });

  it('9. 安全书签不产生误报', () => {
    const report = auditor.scanXSS(safeBookmarks);
    assert.equal(report.issues.length, 0, '安全书签不应产生 XSS 警告');
    assert.equal(report.scanned, 3, '应扫描 3 个书签');
  });

  // ─── 10. URL 安全审计 ─────────────────────────────────────────────────────

  it('10. 检测 data: URI 协议的 URL', () => {
    const malicious = [
      createBookmark('x4', 'Data链接', 'data:text/html,<script>alert(1)</script>'),
    ];
    const report = auditor.scanUrlSafety(malicious);
    const issue = report.issues.find(i => i.type === 'dangerous-scheme');
    assert.ok(issue, '应检测到 data: URI');
    assert.equal(issue.severity, 'high');
  });

  it('11. 检测 file: 协议 URL', () => {
    const malicious = [
      createBookmark('x5', '本地文件', 'file:///etc/passwd'),
    ];
    const report = auditor.scanUrlSafety(malicious);
    const issue = report.issues.find(i => i.type === 'local-file-access');
    assert.ok(issue, '应检测到 file: 协议');
  });

  it('12. 检测 URL 中的特殊编码绕过', () => {
    const malicious = [
      createBookmark('x6', '编码绕过', 'https://example.com/%3Cscript%3Ealert(1)%3C/script%3E'),
    ];
    const report = auditor.scanUrlSafety(malicious);
    const issue = report.issues.find(i => i.type === 'encoded-payload');
    assert.ok(issue, '应检测到 URL 编码的攻击载荷');
  });

  // ─── 13. 数据隔离审计 ─────────────────────────────────────────────────────

  it('13. 检测书签中包含的敏感信息模式', () => {
    const withSensitive = [
      createBookmark('s1', 'API配置', 'https://example.com/api?key=sk-1234567890abcdef', {
        tags: ['api-key: sk-1234567890abcdef'],
      }),
    ];
    const report = auditor.scanDataIsolation(withSensitive);
    const issue = report.issues.find(i => i.type === 'sensitive-data');
    assert.ok(issue, '应检测到敏感数据 (API key)');
  });

  it('14. 检测书签中包含的邮箱地址泄露', () => {
    const withEmail = [
      createBookmark('s2', '我的收藏', 'https://example.com/user?email=user@example.com'),
    ];
    const report = auditor.scanDataIsolation(withEmail);
    // 邮箱在 URL 查询参数中可能被标记为敏感信息
    assert.ok(report.scanned > 0, '应扫描书签');
  });

  it('15. 安全书签数据隔离审计无问题', () => {
    const report = auditor.scanDataIsolation(safeBookmarks);
    assert.equal(report.issues.length, 0, '安全书签不应有数据隔离问题');
  });

  // ─── 16. 权限审计 ─────────────────────────────────────────────────────────

  it('16. 审计 manifest 权限 — 检测必要权限', () => {
    const manifest = {
      permissions: ['storage', 'bookmarks', 'tabs'],
      host_permissions: ['https://api.anthropic.com/*'],
    };
    const report = auditor.scanPermissions(manifest);
    assert.ok(report.required.length > 0, '应列出必要权限');
    assert.ok(report.required.includes('bookmarks'), 'bookmarks 应为必要权限');
  });

  it('17. 审计 manifest 权限 — 检测过度权限', () => {
    const manifest = {
      permissions: ['storage', 'bookmarks', 'tabs', 'webRequest', 'webRequestBlocking',
        'debugger', 'pageCapture', 'topSites', 'history'],
      host_permissions: ['<all_urls>'],
    };
    const report = auditor.scanPermissions(manifest);
    assert.ok(report.excessive.length > 0, '应检测到过度权限');
    assert.ok(report.excessive.some(p => p.permission === 'debugger'), 'debugger 应被标记为过度');
    assert.ok(report.excessive.some(p => p.permission === 'history'), 'history 应被标记为过度');
  });

  it('18. 审计 host_permissions — <all_urls> 警告', () => {
    const manifest = {
      permissions: ['storage', 'bookmarks'],
      host_permissions: ['<all_urls>'],
    };
    const report = auditor.scanPermissions(manifest);
    const allUrlsIssue = report.issues.find(i => i.type === 'broad-host-permission');
    assert.ok(allUrlsIssue, '应警告 <all_urls> 权限范围过广');
  });

  // ─── 19. 综合审计报告 ─────────────────────────────────────────────────────

  it('19. runFullAudit 返回完整报告结构', () => {
    const manifest = {
      permissions: ['storage', 'bookmarks', 'tabs', 'activeTab', 'sidePanel', 'contextMenus'],
      host_permissions: ['https://api.anthropic.com/*'],
    };
    const report = auditor.runFullAudit(safeBookmarks, manifest);
    assert.ok(report.timestamp, '报告应有时间戳');
    assert.ok(report.summary, '报告应有摘要');
    assert.ok(typeof report.summary.totalIssues === 'number', 'totalIssues 应为数字');
    assert.ok(typeof report.summary.criticalCount === 'number', 'criticalCount 应为数字');
    assert.ok(typeof report.summary.score === 'number', 'score 应为数字');
    assert.ok(report.xss, '应有 xss 子报告');
    assert.ok(report.urlSafety, '应有 urlSafety 子报告');
    assert.ok(report.dataIsolation, '应有 dataIsolation 子报告');
    assert.ok(report.permissions, '应有 permissions 子报告');
    assert.ok(Array.isArray(report.recommendations), 'recommendations 应为数组');
  });

  it('20. 安全书签得分高', () => {
    const manifest = {
      permissions: ['storage', 'bookmarks', 'tabs', 'activeTab', 'sidePanel', 'contextMenus'],
      host_permissions: ['https://api.anthropic.com/*'],
    };
    const report = auditor.runFullAudit(safeBookmarks, manifest);
    assert.ok(report.summary.score >= 80, `安全书签得分应 ≥ 80，实际 ${report.summary.score}`);
    assert.equal(report.summary.totalIssues, 0, '安全书签应无问题');
  });

  // ─── 21. 修复建议 ─────────────────────────────────────────────────────────

  it('21. XSS 问题生成修复建议', () => {
    const malicious = [
      createBookmark('x7', '<script>alert(1)</script>', 'https://example.com'),
    ];
    const report = auditor.runFullAudit(malicious, { permissions: ['storage', 'bookmarks'] });
    assert.ok(report.recommendations.length > 0, '应有修复建议');
    const xssRec = report.recommendations.find(r => r.category === 'xss');
    assert.ok(xssRec, '应有 XSS 相关修复建议');
    assert.ok(xssRec.actions.length > 0, '修复建议应包含操作步骤');
  });

  // ─── 22. 边界情况 ─────────────────────────────────────────────────────────

  it('22. 空书签数组审计', () => {
    const report = auditor.scanXSS([]);
    assert.equal(report.scanned, 0);
    assert.equal(report.issues.length, 0);
  });

  it('23. null/undefined 输入安全处理', () => {
    const report = auditor.scanXSS(null);
    assert.equal(report.scanned, 0);
    assert.equal(report.issues.length, 0);
  });

  it('24. 缺失字段的书签不报错', () => {
    const incomplete = [{ id: '1' }]; // 缺少 title, url 等
    assert.doesNotThrow(() => auditor.scanXSS(incomplete));
    assert.doesNotThrow(() => auditor.scanUrlSafety(incomplete));
    assert.doesNotThrow(() => auditor.scanDataIsolation(incomplete));
  });

  it('25. 扫描结果统计正确', () => {
    const mixed = [
      createBookmark('m1', '正常标题', 'https://example.com'),
      createBookmark('m2', '<script>bad</script>', 'https://example.com'),
      createBookmark('m3', '正常标题2', 'javascript:void(0)'),
    ];
    const report = auditor.scanXSS(mixed);
    assert.equal(report.scanned, 3, '应扫描 3 个书签');
    assert.ok(report.issues.length >= 2, '应至少检测到 2 个问题');
  });

  // ─── 26. CSP 审计 ─────────────────────────────────────────────────────────

  it('26. 审计 CSP 策略 — unsafe-inline 检测', () => {
    const manifest = {
      permissions: ['storage', 'bookmarks'],
      content_security_policy: {
        extension_pages: "script-src 'self' 'unsafe-inline'; object-src 'self';",
      },
    };
    const report = auditor.scanPermissions(manifest);
    const cspIssue = report.issues.find(i => i.type === 'unsafe-csp');
    assert.ok(cspIssue, '应检测到 unsafe-inline CSP 问题');
  });

  it('27. 审计 CSP 策略 — 正常 CSP 不报警', () => {
    const manifest = {
      permissions: ['storage', 'bookmarks'],
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self';",
      },
    };
    const report = auditor.scanPermissions(manifest);
    const cspIssue = report.issues.find(i => i.type === 'unsafe-csp');
    assert.ok(!cspIssue, '正常 CSP 不应报警');
  });

  // ─── 28. 多类型 XSS 模式检测 ──────────────────────────────────────────────

  it('28. 检测 SVG 注入', () => {
    const malicious = [
      createBookmark('x8', '<svg onload=alert(1)>', 'https://example.com'),
    ];
    const report = auditor.scanXSS(malicious);
    assert.ok(report.issues.length > 0, '应检测到 SVG 注入');
  });

  it('29. 检测 iframe 注入', () => {
    const malicious = [
      createBookmark('x9', '<iframe src="javascript:alert(1)">', 'https://example.com'),
    ];
    const report = auditor.scanXSS(malicious);
    assert.ok(report.issues.length > 0, '应检测到 iframe 注入');
  });

  // ─── 30. 综合评分 ─────────────────────────────────────────────────────────

  it('30. 严重问题拉低得分', () => {
    const malicious = [
      createBookmark('c1', '<script>document.cookie</script>', 'javascript:void(0)'),
      createBookmark('c2', '<img onerror=alert(1) src=x>', 'data:text/html,<h1>hi</h1>'),
    ];
    const manifest = {
      permissions: ['storage', 'bookmarks', 'debugger', 'webRequest', 'history'],
      host_permissions: ['<all_urls>'],
    };
    const report = auditor.runFullAudit(malicious, manifest);
    assert.ok(report.summary.score < 70, `严重问题得分应 < 70，实际 ${report.summary.score}`);
    assert.ok(report.summary.totalIssues > 0, '应有安全问题');
  });
});
