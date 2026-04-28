/**
 * 测试 lib/prompt-templates.js + lib/stats.js — 模板与统计
 *
 * 10 个场景覆盖：saveTemplate、getAllTemplates、deleteTemplate、renderTemplate（含变量/无变量）、
 * incrementCounter、getStats、recordDailyUsage、getTopSkills、resetStats
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

installChromeMock();
installIndexedDBMock();

const {
  getAllTemplates,
  saveTemplate,
  deleteTemplate,
  renderTemplate,
} = await import('../lib/prompt-templates.js');

const {
  getStats,
  incrementCounter,
  recordDailyUsage,
  getTopSkills,
  resetStats,
} = await import('../lib/stats.js');

beforeEach(() => {
  resetIndexedDBMock();
  resetChromeMock();
  // 重新安装 chrome mock（resetChromeMock 清空了 storage 但保留引用）
  if (!globalThis.chrome) installChromeMock();
});

// ==================== prompt-templates ====================

describe('prompt-templates', () => {

  // ---- 1. saveTemplate 基本保存 ----
  it('saveTemplate 保存自定义模板后可查到', async () => {
    const tpl = {
      name: '自定义模板',
      content: '请帮我优化以下代码：\n{{code}}',
      category: 'code',
    };
    const saved = await saveTemplate(tpl);
    assert.ok(saved.id, '应自动生成 id');
    const all = await getAllTemplates();
    const found = all.find(t => t.id === saved.id);
    assert.ok(found, '应能找到刚保存的模板');
    assert.equal(found.name, '自定义模板');
  });

  // ---- 2. getAllTemplates 返回数组，包含内置模板 ----
  it('getAllTemplates 返回数组且包含内置模板', async () => {
    const all = await getAllTemplates();
    assert.ok(Array.isArray(all), '返回值应为数组');
    assert.ok(all.length >= 5, '至少包含 5 个内置模板');
    const codeReview = all.find(t => t.id === 'tpl_builtin_code_review');
    assert.ok(codeReview, '应含代码审查内置模板');
    assert.equal(codeReview.isBuiltin, true);
  });

  // ---- 3. deleteTemplate 删除后查不到 ----
  it('deleteTemplate 删除自定义模板后查不到', async () => {
    const saved = await saveTemplate({
      name: '待删除',
      content: '临时模板',
      category: 'temp',
    });
    let all = await getAllTemplates();
    assert.ok(all.find(t => t.id === saved.id), '保存后应存在');

    await deleteTemplate(saved.id);
    all = await getAllTemplates();
    assert.ok(!all.find(t => t.id === saved.id), '删除后不应存在');
  });

  // ---- 4. renderTemplate 替换变量 {{var}} ----
  it('renderTemplate 替换 {{var}} 占位符', async () => {
    const saved = await saveTemplate({
      name: '渲染测试',
      content: '请分析 {{language}} 中的 {{topic}} 问题',
      category: 'learning',
    });
    const result = await renderTemplate(saved.id, {
      language: 'JavaScript',
      topic: '闭包',
    });
    assert.equal(result, '请分析 JavaScript 中的 闭包 问题');
  });

  // ---- 5. renderTemplate 无变量返回原文 ----
  it('renderTemplate 无变量时返回原始内容', async () => {
    const saved = await saveTemplate({
      name: '无变量',
      content: '这是一段固定文本，没有任何变量。',
      category: 'misc',
    });
    const result = await renderTemplate(saved.id);
    assert.equal(result, '这是一段固定文本，没有任何变量。');
  });

});

// ==================== stats ====================

describe('stats', () => {

  // ---- 6. incrementCounter 递增 ----
  it('incrementCounter 递增计数器', async () => {
    const v1 = await incrementCounter('totalQuestions');
    assert.equal(v1, 1);
    const v2 = await incrementCounter('totalQuestions');
    assert.equal(v2, 2);
    const v3 = await incrementCounter('totalQuestions', 3);
    assert.equal(v3, 5);
  });

  // ---- 7. getStats 返回统计对象 ----
  it('getStats 返回包含默认字段的统计对象', async () => {
    const stats = await getStats();
    assert.ok(stats, '应返回统计对象');
    assert.equal(typeof stats.totalQuestions, 'number');
    assert.equal(typeof stats.totalKnowledgeEntries, 'number');
    assert.equal(typeof stats.totalHighlights, 'number');
    assert.ok(typeof stats.lastUpdated === 'number', '应含 lastUpdated');
    assert.ok(typeof stats.skillUsage === 'object', '应含 skillUsage');
    assert.ok(typeof stats.dailyUsage === 'object', '应含 dailyUsage');
  });

  // ---- 8. recordDailyUsage 记录日期 ----
  it('recordDailyUsage 记录每日使用数据', async () => {
    await recordDailyUsage('2026-04-28', { questions: 5, tokens: 1200 });
    await recordDailyUsage('2026-04-28', { questions: 3, highlights: 2 });
    const stats = await getStats();
    const day = stats.dailyUsage['2026-04-28'];
    assert.ok(day, '应有 2026-04-28 的记录');
    assert.equal(day.questions, 8, 'questions 应累加为 8');
    assert.equal(day.tokens, 1200, 'tokens 应为 1200');
    assert.equal(day.highlights, 2, 'highlights 应为 2');
  });

  // ---- 9. getTopSkills 返回排行 ----
  it('getTopSkills 返回按使用次数降序排列的技能列表', async () => {
    const { recordSkillUsage } = await import('../lib/stats.js');
    await recordSkillUsage('skill_a');
    await recordSkillUsage('skill_a');
    await recordSkillUsage('skill_a');
    await recordSkillUsage('skill_b');
    await recordSkillUsage('skill_b');
    await recordSkillUsage('skill_c');

    const top = await getTopSkills(3);
    assert.ok(Array.isArray(top), '应返回数组');
    assert.equal(top.length, 3);
    assert.equal(top[0].skillId, 'skill_a');
    assert.equal(top[0].count, 3);
    assert.equal(top[1].skillId, 'skill_b');
    assert.equal(top[1].count, 2);
    assert.equal(top[2].skillId, 'skill_c');
    assert.equal(top[2].count, 1);
  });

  // ---- 10. resetStats 重置 ----
  it('resetStats 重置所有统计数据为默认值', async () => {
    await incrementCounter('totalQuestions', 99);
    await recordDailyUsage('2026-04-28', { questions: 10 });
    const before = await getStats();
    assert.ok(before.totalQuestions > 0, '重置前应有数据');

    await resetStats();
    const after = await getStats();
    assert.equal(after.totalQuestions, 0, 'totalQuestions 应归零');
    assert.equal(after.totalKnowledgeEntries, 0);
    assert.equal(after.totalHighlights, 0);
    assert.deepEqual(after.dailyUsage, {}, 'dailyUsage 应为空');
  });

});
