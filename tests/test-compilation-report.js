/**
 * 测试 lib/compilation-report.js — L2.4 知识编译报告
 *
 * 覆盖场景：
 *   1-6:   IngestStats / buildIngestStats — 构建编译统计
 *   7-12:  generateReportMarkdown — Markdown 报告生成
 *   13-18: generateReportHtml — HTML 报告生成
 *   19-22: mergeIngestStats — 合并统计
 *   23-26: computeIngestDiff — 差异计算
 *   27-30: summarizeReport / formatReportSummary — 摘要文本
 *   31-38: 边界条件与错误处理
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  IngestStats,
  buildIngestStats,
  generateReportMarkdown,
  generateReportHtml,
  mergeIngestStats,
  computeIngestDiff,
  summarizeReport,
  formatReportSummary,
} from '../lib/compilation-report.js';

// ==================== Test Data ====================

const sampleEntries = [
  { id: 1, title: 'React 19 新特性', question: 'React 19 有什么新特性?', answer: '...', tags: ['react'], createdAt: '2026-04-30T10:00:00Z' },
  { id: 2, title: 'Docker 入门', question: '什么是 Docker?', answer: '...', tags: ['docker'], createdAt: '2026-04-30T10:01:00Z' },
  { id: 3, title: 'Git 基础', question: 'Git 怎么用?', answer: '...', tags: ['git'], createdAt: '2026-04-30T10:02:00Z' },
];

const sampleEntities = [
  { name: 'React', type: 'framework', description: '前端框架' },
  { name: 'Docker', type: 'tool', description: '容器化工具' },
  { name: 'Git', type: 'tool', description: '版本控制工具' },
];

const sampleConcepts = [
  { name: '容器化', description: '一种虚拟化技术' },
  { name: '组件化', description: 'UI 设计模式' },
];

const sampleCrossRefs = [
  { fromId: 1, toId: 2, relation: 'entity:React' },
  { fromId: 2, toId: 3, relation: 'tag:devops' },
];

const sampleContradictions = [
  { existingEntryId: 1, description: '版本号差异', severity: 'medium', type: 'version_conflict' },
];

const sampleOldEntries = [
  { id: 1, title: 'React 18 新特性', question: 'React 18 有什么新特性?', answer: '...', tags: ['react'], createdAt: '2026-04-29T10:00:00Z' },
];

const sampleOldEntities = [
  { name: 'React', type: 'framework', description: '前端框架' },
];

const sampleOldConcepts = [
  { name: '组件化', description: 'UI 设计模式' },
];

// ==================== 测试 ====================

// --- 1-6: IngestStats / buildIngestStats ---

describe('compilation-report — IngestStats', () => {
  it('创建带默认值的统计对象', () => {
    const stats = new IngestStats();
    assert.equal(stats.newPageCount, 0);
    assert.equal(stats.updatedPageCount, 0);
    assert.deepEqual(stats.newEntities, []);
    assert.deepEqual(stats.newConcepts, []);
    assert.deepEqual(stats.newCrossRefs, []);
    assert.deepEqual(stats.contradictions, []);
    assert.ok(stats.generatedAt);
  });

  it('支持传入初始值', () => {
    const stats = new IngestStats({
      newPageCount: 5,
      updatedPageCount: 2,
      newEntities: sampleEntities,
      newConcepts: sampleConcepts,
      newCrossRefs: sampleCrossRefs,
      contradictions: sampleContradictions,
    });
    assert.equal(stats.newPageCount, 5);
    assert.equal(stats.updatedPageCount, 2);
    assert.equal(stats.newEntities.length, 3);
    assert.equal(stats.newConcepts.length, 2);
    assert.equal(stats.newCrossRefs.length, 2);
    assert.equal(stats.contradictions.length, 1);
  });
});

describe('compilation-report — buildIngestStats', () => {
  it('从新旧条目对比中正确统计新增和更新', () => {
    const stats = buildIngestStats({
      newEntries: sampleEntries,
      oldEntries: sampleOldEntries,
      newEntities: sampleEntities,
      oldEntities: sampleOldEntities,
      newConcepts: sampleConcepts,
      oldConcepts: sampleOldConcepts,
      crossRefs: sampleCrossRefs,
      contradictions: sampleContradictions,
    });
    assert.ok(stats.newPageCount >= 2, '至少 2 条新增');
    assert.ok(stats.updatedPageCount >= 1, '至少 1 条更新');
    assert.equal(stats.newEntities.length, 2, 'Docker 和 Git 是新增实体');
    assert.equal(stats.newConcepts.length, 1, '容器化是新增概念');
    assert.equal(stats.newCrossRefs.length, 2);
    assert.equal(stats.contradictions.length, 1);
  });

  it('无旧条目时所有条目视为新增', () => {
    const stats = buildIngestStats({
      newEntries: sampleEntries,
      oldEntries: [],
      newEntities: sampleEntities,
      oldEntities: [],
      newConcepts: sampleConcepts,
      oldConcepts: [],
      crossRefs: sampleCrossRefs,
      contradictions: [],
    });
    assert.equal(stats.newPageCount, 3);
    assert.equal(stats.updatedPageCount, 0);
    assert.equal(stats.newEntities.length, 3);
    assert.equal(stats.newConcepts.length, 2);
  });

  it('所有条目都已存在时新增为 0', () => {
    const stats = buildIngestStats({
      newEntries: sampleOldEntries,
      oldEntries: sampleOldEntries,
      newEntities: sampleOldEntities,
      oldEntities: sampleOldEntities,
      newConcepts: sampleOldConcepts,
      oldConcepts: sampleOldConcepts,
      crossRefs: [],
      contradictions: [],
    });
    assert.equal(stats.newPageCount, 0);
    assert.equal(stats.updatedPageCount, 1);
    assert.equal(stats.newEntities.length, 0);
    assert.equal(stats.newConcepts.length, 0);
  });

  it('缺少可选参数时优雅降级', () => {
    const stats = buildIngestStats({
      newEntries: sampleEntries,
    });
    assert.equal(stats.newPageCount, 3);
    assert.equal(stats.updatedPageCount, 0);
    assert.deepEqual(stats.newEntities, []);
    assert.deepEqual(stats.newConcepts, []);
    assert.deepEqual(stats.newCrossRefs, []);
    assert.deepEqual(stats.contradictions, []);
  });

  it('空条目列表返回零统计', () => {
    const stats = buildIngestStats({ newEntries: [] });
    assert.equal(stats.newPageCount, 0);
    assert.equal(stats.updatedPageCount, 0);
  });

  it('返回对象是 IngestStats 实例', () => {
    const stats = buildIngestStats({ newEntries: sampleEntries });
    assert.ok(stats instanceof IngestStats);
  });
});

// --- 7-14: generateReportMarkdown ---

describe('compilation-report — generateReportMarkdown', () => {
  const stats = new IngestStats({
    newPageCount: 3,
    updatedPageCount: 1,
    newEntities: sampleEntities,
    newConcepts: sampleConcepts,
    newCrossRefs: sampleCrossRefs,
    contradictions: sampleContradictions,
  });

  it('生成的 Markdown 包含标题', () => {
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('知识编译报告'));
  });

  it('包含新增和更新页面数', () => {
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('3'));
    assert.ok(md.includes('1'));
  });

  it('包含新发现的实体', () => {
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('React'));
    assert.ok(md.includes('Docker'));
    assert.ok(md.includes('Git'));
  });

  it('包含新发现的概念', () => {
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('容器化'));
    assert.ok(md.includes('组件化'));
  });

  it('包含交叉引用信息', () => {
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('交叉引用'));
  });

  it('包含矛盾检测信息', () => {
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('矛盾') || md.includes('冲突'));
  });

  it('无矛盾时不显示矛盾部分', () => {
    const noConflictStats = new IngestStats({
      newPageCount: 2,
      newEntities: [],
      newConcepts: [],
      contradictions: [],
    });
    const md = generateReportMarkdown(noConflictStats);
    assert.ok(!md.includes('⚠️'));
  });

  it('无新增实体时不显示实体部分', () => {
    const noEntityStats = new IngestStats({
      newPageCount: 1,
      newEntities: [],
      newConcepts: [],
      contradictions: [],
    });
    const md = generateReportMarkdown(noEntityStats);
    assert.ok(!md.includes('新发现的实体'));
  });
});

// --- 13-18: generateReportHtml ---

describe('compilation-report — generateReportHtml', () => {
  const stats = new IngestStats({
    newPageCount: 3,
    updatedPageCount: 1,
    newEntities: sampleEntities,
    newConcepts: sampleConcepts,
    newCrossRefs: sampleCrossRefs,
    contradictions: sampleContradictions,
  });

  it('生成有效的 HTML 字符串', () => {
    const html = generateReportHtml(stats);
    assert.ok(typeof html === 'string');
    assert.ok(html.startsWith('<div'));
    assert.ok(html.includes('pw-compilation-report'));
  });

  it('包含新增页面数', () => {
    const html = generateReportHtml(stats);
    assert.ok(html.includes('3'));
  });

  it('包含实体和概念列表', () => {
    const html = generateReportHtml(stats);
    assert.ok(html.includes('React'));
    assert.ok(html.includes('容器化'));
  });

  it('包含矛盾警告', () => {
    const html = generateReportHtml(stats);
    assert.ok(html.includes('矛盾') || html.includes('冲突'));
    assert.ok(html.includes('版本'));
  });

  it('空统计生成简洁 HTML', () => {
    const emptyStats = new IngestStats();
    const html = generateReportHtml(emptyStats);
    assert.ok(html.includes('pw-compilation-report'));
    assert.ok(html.includes('0'));
  });

  it('HTML 正确转义特殊字符', () => {
    const xssStats = new IngestStats({
      newEntities: [{ name: '<script>alert("xss")</script>', type: 'other', description: 'test' }],
    });
    const html = generateReportHtml(xssStats);
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

// --- 19-22: mergeIngestStats ---

describe('compilation-report — mergeIngestStats', () => {
  it('合并两个统计对象', () => {
    const stats1 = new IngestStats({
      newPageCount: 2,
      updatedPageCount: 1,
      newEntities: [{ name: 'React', type: 'framework' }],
      newConcepts: [{ name: '组件化' }],
      newCrossRefs: [{ fromId: 1, toId: 2 }],
      contradictions: [],
    });
    const stats2 = new IngestStats({
      newPageCount: 3,
      updatedPageCount: 0,
      newEntities: [{ name: 'Vue', type: 'framework' }],
      newConcepts: [{ name: '虚拟DOM' }],
      newCrossRefs: [{ fromId: 3, toId: 4 }],
      contradictions: [{ existingEntryId: 1, severity: 'low' }],
    });

    const merged = mergeIngestStats(stats1, stats2);
    assert.equal(merged.newPageCount, 5);
    assert.equal(merged.updatedPageCount, 1);
    assert.equal(merged.newEntities.length, 2);
    assert.equal(merged.newConcepts.length, 2);
    assert.equal(merged.newCrossRefs.length, 2);
    assert.equal(merged.contradictions.length, 1);
  });

  it('合并时去重同名实体', () => {
    const stats1 = new IngestStats({
      newEntities: [{ name: 'React', type: 'framework', description: 'A' }],
    });
    const stats2 = new IngestStats({
      newEntities: [{ name: 'react', type: 'framework', description: 'B' }],
    });

    const merged = mergeIngestStats(stats1, stats2);
    assert.equal(merged.newEntities.length, 1);
    assert.equal(merged.newEntities[0].description, 'B');
  });

  it('合并时去重同名概念', () => {
    const stats1 = new IngestStats({
      newConcepts: [{ name: '容器化', description: 'A' }],
    });
    const stats2 = new IngestStats({
      newConcepts: [{ name: '容器化', description: 'B' }],
    });

    const merged = mergeIngestStats(stats1, stats2);
    assert.equal(merged.newConcepts.length, 1);
  });

  it('合并空统计', () => {
    const stats1 = new IngestStats({ newPageCount: 3 });
    const stats2 = new IngestStats();
    const merged = mergeIngestStats(stats1, stats2);
    assert.equal(merged.newPageCount, 3);
  });

  it('支持合并多个统计（变参）', () => {
    const s1 = new IngestStats({ newPageCount: 1 });
    const s2 = new IngestStats({ newPageCount: 2 });
    const s3 = new IngestStats({ newPageCount: 3 });
    const merged = mergeIngestStats(s1, s2, s3);
    assert.equal(merged.newPageCount, 6);
  });
});

// --- 23-26: computeIngestDiff ---

describe('compilation-report — computeIngestDiff', () => {
  it('正确计算新增和更新', () => {
    const diff = computeIngestDiff(sampleEntries, sampleOldEntries);
    assert.equal(diff.added.length, 2, '新增 2 条 (id 2, 3)');
    assert.equal(diff.updated.length, 1, '更新 1 条 (id 1)');
    assert.equal(diff.removed.length, 0);
  });

  it('旧条目列表为空时全部为新增', () => {
    const diff = computeIngestDiff(sampleEntries, []);
    assert.equal(diff.added.length, 3);
    assert.equal(diff.updated.length, 0);
  });

  it('新条目为空时全部为删除', () => {
    const diff = computeIngestDiff([], sampleOldEntries);
    assert.equal(diff.added.length, 0);
    assert.equal(diff.removed.length, 1);
  });

  it('id 匹配优先', () => {
    const newEntries = [
      { id: 1, title: '完全不同的标题', tags: [], createdAt: '2026-04-30T10:00:00Z' },
    ];
    const oldEntries = [
      { id: 1, title: 'React 新特性', tags: [], createdAt: '2026-04-29T10:00:00Z' },
    ];
    const diff = computeIngestDiff(newEntries, oldEntries);
    assert.equal(diff.updated.length, 1, 'id=1 应匹配为更新');
    assert.equal(diff.added.length, 0);
  });

  it('两个空数组', () => {
    const diff = computeIngestDiff([], []);
    assert.equal(diff.added.length, 0);
    assert.equal(diff.updated.length, 0);
    assert.equal(diff.removed.length, 0);
  });
});

// --- 27-30: summarizeReport / formatReportSummary ---

describe('compilation-report — summarizeReport', () => {
  it('生成一行摘要文本', () => {
    const stats = new IngestStats({
      newPageCount: 5,
      updatedPageCount: 2,
      newEntities: [{ name: 'A' }, { name: 'B' }],
      newConcepts: [{ name: 'C' }],
      newCrossRefs: [{ fromId: 1, toId: 2 }],
      contradictions: [],
    });
    const summary = summarizeReport(stats);
    assert.ok(typeof summary === 'string');
    assert.ok(summary.includes('5'));
    assert.ok(summary.includes('2'));
  });

  it('摘要长度合理（不超过 200 字符）', () => {
    const stats = new IngestStats({
      newPageCount: 10,
      updatedPageCount: 5,
      newEntities: Array.from({ length: 20 }, (_, i) => ({ name: `Entity${i}` })),
      newConcepts: Array.from({ length: 10 }, (_, i) => ({ name: `Concept${i}` })),
      contradictions: [],
    });
    const summary = summarizeReport(stats);
    assert.ok(summary.length <= 200, `摘要过长: ${summary.length}`);
  });
});

describe('compilation-report — formatReportSummary', () => {
  it('生成格式化的多行摘要', () => {
    const stats = new IngestStats({
      newPageCount: 3,
      updatedPageCount: 1,
      newEntities: sampleEntities,
      newConcepts: sampleConcepts,
      newCrossRefs: sampleCrossRefs,
      contradictions: sampleContradictions,
    });
    const formatted = formatReportSummary(stats);
    assert.ok(typeof formatted === 'string');
    assert.ok(formatted.includes('📊'));
    assert.ok(formatted.includes('新增'));
    assert.ok(formatted.includes('实体'));
    assert.ok(formatted.includes('概念'));
  });

  it('无矛盾时不显示矛盾行', () => {
    const stats = new IngestStats({ newPageCount: 1 });
    const formatted = formatReportSummary(stats);
    assert.ok(!formatted.includes('矛盾'));
  });

  it('空统计也能生成格式化摘要', () => {
    const stats = new IngestStats();
    const formatted = formatReportSummary(stats);
    assert.ok(formatted.length > 0);
  });
});

// --- 31-38: 边界条件 ---

describe('compilation-report — 边界条件', () => {
  it('buildIngestStats 接受 undefined 可选参数', () => {
    const stats = buildIngestStats({ newEntries: sampleEntries, oldEntries: undefined });
    assert.equal(stats.newPageCount, 3);
    assert.equal(stats.updatedPageCount, 0);
  });

  it('generateReportMarkdown 处理零统计', () => {
    const stats = new IngestStats();
    const md = generateReportMarkdown(stats);
    assert.ok(typeof md === 'string');
    assert.ok(md.length > 0);
  });

  it('generateReportHtml 处理零统计', () => {
    const stats = new IngestStats();
    const html = generateReportHtml(stats);
    assert.ok(typeof html === 'string');
    assert.ok(html.includes('pw-compilation-report'));
  });

  it('mergeIngestStats 不修改原对象（纯函数）', () => {
    const stats1 = new IngestStats({ newPageCount: 1 });
    const stats2 = new IngestStats({ newPageCount: 2 });
    const original1 = stats1.newPageCount;
    mergeIngestStats(stats1, stats2);
    assert.equal(stats1.newPageCount, original1);
  });

  it('mergeIngestStats 合并时间戳取最新', () => {
    const stats1 = new IngestStats({ newPageCount: 1 });
    stats1.generatedAt = '2026-04-30T10:00:00Z';
    const stats2 = new IngestStats({ newPageCount: 2 });
    stats2.generatedAt = '2026-04-30T12:00:00Z';
    const merged = mergeIngestStats(stats1, stats2);
    assert.equal(merged.generatedAt, '2026-04-30T12:00:00Z');
  });

  it('generateReportMarkdown 包含时间戳', () => {
    const stats = new IngestStats({ newPageCount: 1 });
    const md = generateReportMarkdown(stats);
    assert.ok(md.includes('2026'), '应包含年份');
  });

  it('generateReportHtml 包含统计数字', () => {
    const stats = new IngestStats({
      newPageCount: 5,
      newEntities: [{ name: 'A' }],
      newConcepts: [{ name: 'B' }],
    });
    const html = generateReportHtml(stats);
    assert.ok(html.includes('5'));
    assert.ok(html.includes('A'));
    assert.ok(html.includes('B'));
  });

  it('computeIngestDiff 处理无 id 条目', () => {
    const newEntries = [{ title: 'New', tags: [], createdAt: '2026-04-30T10:00:00Z' }];
    const oldEntries = [{ title: 'Old', tags: [], createdAt: '2026-04-29T10:00:00Z' }];
    const diff = computeIngestDiff(newEntries, oldEntries);
    assert.equal(diff.added.length, 1);
    assert.equal(diff.updated.length, 0);
    assert.equal(diff.removed.length, 1);
  });
});
