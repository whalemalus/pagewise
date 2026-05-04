/**
 * 测试 lib/bookmark-gap-detector.js — 知识盲区检测
 *
 * 测试范围:
 *   detectGaps / getDomainCoverage / getRecommendations
 *   getStrengths / getWeaknesses / generateReport
 *   覆盖度等级判断 / 空数据处理 / 关联领域推荐
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkGapDetector, DOMAIN_CATALOG, THRESHOLDS } = await import('../lib/bookmark-gap-detector.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], tags = []) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    tags,
    dateAdded: 1700000000000 + Number(id) * 1000,
  };
}

// ==================== 辅助: 构造聚类数据 ====================

function createClusters(entries) {
  // entries: { 前端: [bm1, bm2], 后端: [bm3], ... }
  return new Map(Object.entries(entries));
}

function createTags(entries) {
  // entries: { 前端: 15, 后端: 5, ... }
  return new Map(Object.entries(entries));
}

// ==================== 样例数据 ====================

const sampleBookmarks = [
  createBookmark('1', 'React 入门', 'https://react.dev', ['前端']),
  createBookmark('2', 'Vue 3 教程', 'https://vuejs.org', ['前端']),
  createBookmark('3', 'CSS Flexbox 指南', 'https://css-tricks.com', ['前端']),
  createBookmark('4', 'JavaScript 高级程序设计', 'https://example.com/js', ['前端']),
  createBookmark('5', 'TypeScript 手册', 'https://typescriptlang.org', ['前端']),
  createBookmark('6', 'Webpack 配置详解', 'https://webpack.js.org', ['前端']),
  createBookmark('7', 'Vite 入门', 'https://vitejs.dev', ['前端']),
  createBookmark('8', '前端工程化实践', 'https://example.com/fe', ['前端']),
  createBookmark('9', 'Node.js 入门', 'https://nodejs.org', ['后端']),
  createBookmark('10', 'Django 教程', 'https://djangoproject.com', ['后端']),
  createBookmark('11', 'MySQL 基础', 'https://mysql.com', ['数据库']),
  createBookmark('12', 'Redis 实战', 'https://redis.io', ['数据库']),
  createBookmark('13', 'Docker 快速上手', 'https://docker.com', ['DevOps']),
  createBookmark('14', 'Kubernetes 入门', 'https://kubernetes.io', ['DevOps']),
  createBookmark('15', '前端性能优化', 'https://example.com/perf', ['前端']),
  createBookmark('16', 'Tailwind CSS 实战', 'https://tailwindcss.com', ['前端']),
];

const sampleClusters = createClusters({
  '前端': sampleBookmarks.filter(b => b.folderPath.includes('前端')),
  '后端': sampleBookmarks.filter(b => b.folderPath.includes('后端')),
  '数据库': sampleBookmarks.filter(b => b.folderPath.includes('数据库')),
  'DevOps': sampleBookmarks.filter(b => b.folderPath.includes('DevOps')),
});

const sampleTags = createTags({
  '前端': 10,
  '后端': 2,
  '数据库': 2,
  'DevOps': 2,
  'AI/ML': 5,
});

// ==================== 测试用例 ====================

describe('BookmarkGapDetector — 基本构造与覆盖度等级', () => {
  it('构造函数接受空参数不报错', () => {
    const detector = new BookmarkGapDetector();
    assert.ok(detector, '应成功构造实例');
    assert.equal(detector.bookmarks.length, 0, 'bookmarks 默认为空数组');
  });

  it('覆盖度等级: >= 10 为 well-covered', () => {
    const clusters = createClusters({ '前端': new Array(10).fill(null).map((_, i) => createBookmark(i, 't', 'u')) });
    const detector = new BookmarkGapDetector({
      bookmarks: clusters.get('前端'),
      clusters,
    });
    const coverage = detector.getDomainCoverage();
    const fe = coverage.find(c => c.domain === '前端');
    assert.equal(fe.level, 'well-covered', '10 个书签应为 well-covered');
  });

  it('覆盖度等级: 3-9 为 moderate', () => {
    const clusters = createClusters({ '后端': new Array(5).fill(null).map((_, i) => createBookmark(i, 't', 'u')) });
    const detector = new BookmarkGapDetector({ clusters });
    const coverage = detector.getDomainCoverage();
    const be = coverage.find(c => c.domain === '后端');
    assert.equal(be.level, 'moderate', '5 个书签应为 moderate');
  });

  it('覆盖度等级: 1-2 为 weak', () => {
    const clusters = createClusters({ '安全': [createBookmark('1', 't', 'u')] });
    const detector = new BookmarkGapDetector({ clusters });
    const coverage = detector.getDomainCoverage();
    const sec = coverage.find(c => c.domain === '安全');
    assert.equal(sec.level, 'weak', '1 个书签应为 weak');
  });

  it('覆盖度等级: 0 为 gap', () => {
    const detector = new BookmarkGapDetector({ bookmarks: [], clusters: new Map() });
    const coverage = detector.getDomainCoverage();
    const design = coverage.find(c => c.domain === '设计');
    assert.ok(design, '应包含设计领域');
    assert.equal(design.level, 'gap', '0 个书签应为 gap');
    assert.equal(design.count, 0);
  });
});

describe('BookmarkGapDetector — 盲区检测 detectGaps()', () => {
  it('detectGaps 返回所有领域的检测结果', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const gaps = detector.detectGaps();
    assert.ok(Array.isArray(gaps), '应返回数组');
    assert.ok(gaps.length >= 14, '应包含至少 14 个领域');
    for (const g of gaps) {
      assert.ok(typeof g.domain === 'string', '每项应有 domain');
      assert.ok(typeof g.coverage === 'string', '每项应有 coverage');
      assert.ok(Array.isArray(g.gaps), '每项应有 gaps 数组');
      assert.ok(Array.isArray(g.recommendations), '每项应有 recommendations 数组');
    }
  });

  it('gap 领域应有盲区描述和入门推荐', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const gaps = detector.detectGaps();
    const gapItems = gaps.filter(g => g.coverage === 'gap');
    assert.ok(gapItems.length > 0, '应存在盲区领域');
    for (const g of gapItems) {
      assert.ok(g.gaps.length > 0, `${g.domain} 盲区应有描述`);
      assert.ok(g.gaps[0].includes('完全没有书签'), '描述应包含"完全没有书签"');
    }
  });

  it('weak 领域应有覆盖不足描述和进阶推荐', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const gaps = detector.detectGaps();
    const weakItems = gaps.filter(g => g.coverage === 'weak');
    assert.ok(weakItems.length > 0, '应存在弱项领域');
    for (const g of weakItems) {
      assert.ok(g.gaps.length > 0, `${g.domain} 弱项应有描述`);
      assert.ok(g.gaps[0].includes('覆盖不足'), '描述应包含"覆盖不足"');
    }
  });

  it('well-covered 领域应无 gaps 和 recommendations', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const gaps = detector.detectGaps();
    const strongItems = gaps.filter(g => g.coverage === 'well-covered');
    for (const g of strongItems) {
      assert.equal(g.gaps.length, 0, `${g.domain} 充分领域不应有 gaps`);
      assert.equal(g.recommendations.length, 0, `${g.domain} 充分领域不应有 recommendations`);
    }
  });
});

describe('BookmarkGapDetector — 强项与弱项识别', () => {
  it('getStrengths 返回 well-covered 领域并按数量降序', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const strengths = detector.getStrengths();
    assert.ok(strengths.length > 0, '应有强项领域');
    for (const s of strengths) {
      assert.ok(s.count >= 10, `${s.domain} 应 >= 10 个书签`);
    }
    // 检查降序
    for (let i = 1; i < strengths.length; i++) {
      assert.ok(strengths[i - 1].count >= strengths[i].count, '应按数量降序');
    }
  });

  it('getWeaknesses 返回 gap + weak 领域并按数量升序', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const weaknesses = detector.getWeaknesses();
    assert.ok(weaknesses.length > 0, '应有弱项领域');
    for (const w of weaknesses) {
      assert.ok(w.count < 3, `${w.domain} 应 < 3 个书签`);
    }
    // 检查升序
    for (let i = 1; i < weaknesses.length; i++) {
      assert.ok(weaknesses[i - 1].count <= weaknesses[i].count, '应按数量升序');
    }
  });
});

describe('BookmarkGapDetector — 推荐生成', () => {
  it('getRecommendations 默认返回最多 5 条', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const recs = detector.getRecommendations();
    assert.ok(recs.length <= 5, `默认最多 5 条，实际 ${recs.length}`);
    for (const r of recs) {
      assert.ok(typeof r.domain === 'string', '应有 domain');
      assert.ok(typeof r.reason === 'string', '应有 reason');
      assert.ok(Array.isArray(r.suggestedTopics), '应有 suggestedTopics 数组');
      assert.ok(r.suggestedTopics.length > 0, 'suggestedTopics 不为空');
    }
  });

  it('getRecommendations 支持自定义 limit', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const recs = detector.getRecommendations(2);
    assert.ok(recs.length <= 2, `limit=2 最多 2 条，实际 ${recs.length}`);
  });

  it('getRecommendations 盲区排在弱项前面', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const recs = detector.getRecommendations();
    let sawWeak = false;
    for (const r of recs) {
      const count = sampleClusters.has(r.domain) ? sampleClusters.get(r.domain).length : 0;
      if (count === 0) {
        assert.equal(sawWeak, false, '盲区推荐不应出现在弱项之后');
      } else {
        sawWeak = true;
      }
    }
  });

  it('盲区领域推荐包含关联领域提示', () => {
    // 后端有 3 个书签 (moderate) 且是安全的 relatedDomain
    const clusters = createClusters({
      '后端': [createBookmark('1', 't', 'u'), createBookmark('2', 't', 'u'), createBookmark('3', 't', 'u')],
    });
    const detector = new BookmarkGapDetector({ clusters });
    const gaps = detector.detectGaps();
    const secGap = gaps.find(g => g.domain === '安全');
    assert.ok(secGap, '安全应存在');
    assert.equal(secGap.coverage, 'gap', '安全应为盲区');
    const hasRelated = secGap.recommendations.some(r => r.includes('后端') && r.includes('关联学习'));
    assert.ok(hasRelated, '盲区推荐应包含关联领域提示');
  });
});

describe('BookmarkGapDetector — 报告生成 generateReport()', () => {
  it('generateReport 返回完整结构', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const report = detector.generateReport();
    assert.ok(report.summary, '应有 summary');
    assert.ok(Array.isArray(report.strengths), '应有 strengths 数组');
    assert.ok(Array.isArray(report.weaknesses), '应有 weaknesses 数组');
    assert.ok(Array.isArray(report.recommendations), '应有 recommendations 数组');
  });

  it('summary 包含正确的统计信息', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const { summary } = detector.generateReport();
    assert.equal(summary.totalBookmarks, sampleBookmarks.length, '总书签数应正确');
    assert.ok(summary.totalDomains >= 14, '总领域数 >= 14');
    assert.ok(summary.wellCovered >= 0, 'wellCovered >= 0');
    assert.ok(summary.moderate >= 0, 'moderate >= 0');
    assert.ok(summary.weak >= 0, 'weak >= 0');
    assert.ok(summary.gap >= 0, 'gap >= 0');
    assert.ok(summary.coverageRatio >= 0 && summary.coverageRatio <= 100, 'coverageRatio 在 0-100');
    // 各等级之和应等于总领域数
    assert.equal(
      summary.wellCovered + summary.moderate + summary.weak + summary.gap,
      summary.totalDomains,
      '各等级之和应等于总领域数'
    );
  });
});

describe('BookmarkGapDetector — 空数据处理', () => {
  it('完全空数据不报错', () => {
    const detector = new BookmarkGapDetector();
    assert.doesNotThrow(() => {
      detector.detectGaps();
      detector.getDomainCoverage();
      detector.getRecommendations();
      detector.getStrengths();
      detector.getWeaknesses();
      detector.generateReport();
    });
  });

  it('空书签时所有领域为 gap', () => {
    const detector = new BookmarkGapDetector({ bookmarks: [] });
    const coverage = detector.getDomainCoverage();
    for (const c of coverage) {
      assert.equal(c.level, 'gap', `${c.domain} 空书签时应为 gap`);
      assert.equal(c.count, 0);
    }
  });

  it('空书签时 strengths 为空', () => {
    const detector = new BookmarkGapDetector({ bookmarks: [] });
    assert.equal(detector.getStrengths().length, 0, '无强项');
  });

  it('空书签时 weaknesses 包含所有领域', () => {
    const detector = new BookmarkGapDetector({ bookmarks: [] });
    const weaknesses = detector.getWeaknesses();
    assert.equal(weaknesses.length, 14, '14 个领域全部为弱项');
  });

  it('空书签时 report 的 coverageRatio 为 0', () => {
    const detector = new BookmarkGapDetector({ bookmarks: [] });
    const { summary } = detector.generateReport();
    assert.equal(summary.coverageRatio, 0, 'coverageRatio 应为 0');
    assert.equal(summary.totalBookmarks, 0);
    assert.equal(summary.wellCovered, 0);
    assert.equal(summary.gap, summary.totalDomains);
  });
});

describe('BookmarkGapDetector — 标签频率估算', () => {
  it('无聚类时基于标签频率估算覆盖度', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      tags: sampleTags,
    });
    const coverage = detector.getDomainCoverage();
    const fe = coverage.find(c => c.domain === '前端');
    assert.equal(fe.count, 10, '前端标签频率 10 → count=10');
    assert.equal(fe.level, 'well-covered');

    const be = coverage.find(c => c.domain === '后端');
    assert.equal(be.count, 2, '后端标签频率 2 → count=2');
    assert.equal(be.level, 'weak');
  });

  it('聚类优先于标签频率', () => {
    // 聚类里前端有 10 个书签，标签里前端有 3 个
    const tags = createTags({ '前端': 3 });
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
      tags,
    });
    const coverage = detector.getDomainCoverage();
    const fe = coverage.find(c => c.domain === '前端');
    assert.equal(fe.count, sampleClusters.get('前端').length, '应使用聚类结果而非标签频率');
  });
});

describe('BookmarkGapDetector — getDomainCoverage 排序', () => {
  it('getDomainCoverage 按书签数量降序排列', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const coverage = detector.getDomainCoverage();
    for (let i = 1; i < coverage.length; i++) {
      assert.ok(
        coverage[i - 1].count >= coverage[i].count,
        `${coverage[i - 1].domain}(${coverage[i - 1].count}) >= ${coverage[i].domain}(${coverage[i].count})`
      );
    }
  });

  it('getDomainCoverage 每项包含 percentage 字段', () => {
    const detector = new BookmarkGapDetector({
      bookmarks: sampleBookmarks,
      clusters: sampleClusters,
    });
    const coverage = detector.getDomainCoverage();
    for (const c of coverage) {
      assert.ok(typeof c.percentage === 'number', `${c.domain} 应有 percentage`);
      assert.ok(c.percentage >= 0, 'percentage >= 0');
    }
  });
});

describe('BookmarkGapDetector — 自定义领域聚类', () => {
  it('聚类中的自定义领域也会被纳入分析', () => {
    const customClusters = createClusters({
      '前端': sampleBookmarks.slice(0, 5),
      '区块链': [createBookmark('99', 'Bitcoin 白皮书', 'https://bitcoin.org')],
    });
    const detector = new BookmarkGapDetector({ clusters: customClusters });
    const coverage = detector.getDomainCoverage();
    const blockchain = coverage.find(c => c.domain === '区块链');
    assert.ok(blockchain, '应包含自定义领域 区块链');
    assert.equal(blockchain.count, 1, '区块链应有 1 个书签');
    assert.equal(blockchain.level, 'weak');
  });
});
