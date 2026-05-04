/**
 * 测试 lib/bookmark-detail-panel.js — 书签详情面板
 *
 * 测试范围:
 *   show / hide / update / onAction
 *   标签管理 (addTag / removeTag / getTagSuggestions / setAllTags)
 *   状态管理 (setStatus / getStatus / getValidStatuses)
 *   相似书签 (updateSimilar / switchToSimilar)
 *   URL 操作 (openUrl)
 *   查询方法 (isVisible / getPanelData / getTags)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkDetailPanel } = await import('../lib/bookmark-detail-panel.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id, title, url, folderPath = [], opts = {}) {
  return {
    id: String(id),
    title,
    url,
    folderPath,
    dateAdded: 1700000000000 + Number(id) * 86400000,
    dateAddedISO: new Date(1700000000000 + Number(id) * 86400000).toISOString(),
    ...opts,
  };
}

const sampleBookmark = createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端']);
const sampleBookmark2 = createBookmark('2', 'Vue.js 入门', 'https://vuejs.org', ['技术', '前端']);
const sampleBookmark3 = createBookmark('3', 'Node.js 指南', 'https://nodejs.org', ['技术', '后端']);

const sampleSimilar = [
  { id: '2', title: 'Vue.js 入门', url: 'https://vuejs.org', score: 0.85, bookmark: sampleBookmark2 },
  { id: '3', title: 'Node.js 指南', url: 'https://nodejs.org', score: 0.6, bookmark: sampleBookmark3 },
  { id: '4', title: 'TypeScript Handbook', url: 'https://typescriptlang.org', score: 0.5 },
  { id: '5', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', score: 0.3 },
  { id: '6', title: 'CSS Tricks', url: 'https://css-tricks.com', score: 0.2 },
];

// ==================== 测试 ====================

describe('BookmarkDetailPanel', () => {
  let panel;

  beforeEach(() => {
    panel = new BookmarkDetailPanel();
  });

  // ─── 1. show 显示面板 ───────────────────────────────────────────────────

  it('1. show 显示面板并设置书签数据', () => {
    assert.equal(panel.isVisible(), false, '初始状态应不可见');

    panel.show(sampleBookmark, sampleSimilar);

    assert.equal(panel.isVisible(), true, 'show 后应可见');

    const data = panel.getPanelData();
    assert.ok(data !== null, 'getPanelData 应返回数据');
    assert.equal(data.bookmark.id, '1', '书签 ID 应正确');
    assert.equal(data.bookmark.title, 'React 官方文档', '书签标题应正确');
    assert.equal(data.bookmark.url, 'https://react.dev', 'URL 应正确');
    assert.equal(data.status, 'unread', '默认状态应为 unread');
    assert.deepEqual(data.tags, [], '默认标签应为空');
  });

  // ─── 2. show 带相似书签 ────────────────────────────────────────────────

  it('2. show 加载相似书签并限制 Top-5', () => {
    panel.show(sampleBookmark, sampleSimilar);

    const data = panel.getPanelData();
    assert.equal(data.similarBookmarks.length, 5, '应有 5 个相似书签');
    assert.equal(data.similarBookmarks[0].id, '2', '第一个相似书签 ID 应正确');
    assert.equal(data.similarBookmarks[0].score, 0.85, '相似度分数应正确');

    // 超过 5 个应截断
    const tooMany = [...sampleSimilar, { id: '7', title: 'Extra', url: 'https://extra.com', score: 0.1 }];
    panel.show(sampleBookmark, tooMany);
    const data2 = panel.getPanelData();
    assert.equal(data2.similarBookmarks.length, 5, '应限制为 5 个相似书签');
  });

  // ─── 3. show 无效输入 ───────────────────────────────────────────────────

  it('3. show 传入无效数据不改变状态', () => {
    panel.show(null);
    assert.equal(panel.isVisible(), false, 'null 输入应保持不可见');

    panel.show({});
    assert.equal(panel.isVisible(), false, '无 id 的对象应保持不可见');

    panel.show({ id: '' });
    assert.equal(panel.isVisible(), false, '空 id 应保持不可见');
  });

  // ─── 4. hide 隐藏面板 ──────────────────────────────────────────────────

  it('4. hide 隐藏面板', () => {
    panel.show(sampleBookmark);
    assert.equal(panel.isVisible(), true, 'show 后应可见');

    panel.hide();
    assert.equal(panel.isVisible(), false, 'hide 后应不可见');
  });

  // ─── 5. update 更新书签 ────────────────────────────────────────────────

  it('5. update 更新当前书签数据 (同 ID 保留标签)', () => {
    panel.show(sampleBookmark);

    // 添加标签
    panel.addTag('react');
    panel.addTag('frontend');
    assert.deepEqual(panel.getTags(), ['react', 'frontend']);

    // 更新同一书签 (标题变化)
    const updated = { ...sampleBookmark, title: 'React 新文档' };
    panel.update(updated);

    const data = panel.getPanelData();
    assert.equal(data.bookmark.title, 'React 新文档', '标题应更新');
    assert.deepEqual(data.tags, ['react', 'frontend'], '同 ID 更新应保留标签');
  });

  it('6. update 更新为不同 ID 的书签重置标签', () => {
    panel.show(sampleBookmark);
    panel.addTag('react');

    // 更新为不同书签
    panel.update(sampleBookmark2);
    assert.deepEqual(panel.getTags(), [], '不同 ID 更新应重置标签');

    const data = panel.getPanelData();
    assert.equal(data.bookmark.id, '2', '书签 ID 应更新');
  });

  it('7. update 传入无效数据不改变状态', () => {
    panel.show(sampleBookmark);
    panel.update(null);
    assert.equal(panel.isVisible(), true, 'null 更新应保持面板状态');

    panel.update({});
    assert.equal(panel.getPanelData().bookmark.id, '1', '无效更新应保持原书签');
  });

  // ─── 6. onAction 操作回调 ──────────────────────────────────────────────

  it('8. onAction 注册回调并在 show/hide 时触发', () => {
    const actions = [];
    panel.onAction((action, data) => actions.push({ action, data }));

    panel.show(sampleBookmark);
    assert.equal(actions.length, 1, 'show 应触发回调');
    assert.equal(actions[0].action, 'show', '回调 action 应为 show');
    assert.equal(actions[0].data.bookmarkId, '1', '回调应包含书签 ID');

    panel.hide();
    assert.equal(actions.length, 2, 'hide 应触发回调');
    assert.equal(actions[1].action, 'hide', '回调 action 应为 hide');
  });

  it('9. onAction 回调异常不影响面板逻辑', () => {
    // 注册一个会抛异常的回调
    panel.onAction(() => { throw new Error('boom'); });

    assert.doesNotThrow(() => {
      panel.show(sampleBookmark);
    }, '回调异常不应影响 show');

    assert.equal(panel.isVisible(), true, '面板应仍然可见');
  });

  // ─── 7. 标签管理 ────────────────────────────────────────────────────────

  it('10. addTag 添加标签', () => {
    panel.show(sampleBookmark);

    const result = panel.addTag('react');
    assert.equal(result, true, '添加新标签应返回 true');
    assert.deepEqual(panel.getTags(), ['react'], '应包含新标签');

    // 重复添加
    const dup = panel.addTag('react');
    assert.equal(dup, false, '重复标签应返回 false');
    assert.equal(panel.getTags().length, 1, '标签数不应增加');

    // 空标签
    assert.equal(panel.addTag(''), false, '空标签应返回 false');
    assert.equal(panel.addTag(null), false, 'null 标签应返回 false');

    // 大小写归一化
    panel.addTag('Frontend');
    assert.ok(panel.getTags().includes('frontend'), '标签应归一化为小写');
  });

  it('11. removeTag 删除标签', () => {
    panel.show(sampleBookmark);
    panel.addTag('react');
    panel.addTag('frontend');

    const result = panel.removeTag('react');
    assert.equal(result, true, '删除已有标签应返回 true');
    assert.deepEqual(panel.getTags(), ['frontend'], '应只剩 frontend');

    const miss = panel.removeTag('nonexistent');
    assert.equal(miss, false, '删除不存在的标签应返回 false');
  });

  it('12. getTagSuggestions 自动补全', () => {
    panel.show(sampleBookmark);
    panel.setAllTags(['react', 'redux', 'vue', 'vite', 'nodejs', 'reactive', 'frontend']);

    panel.addTag('react');

    const suggestions = panel.getTagSuggestions('re');
    assert.ok(suggestions.includes('redux'), '应包含 redux');
    assert.ok(suggestions.includes('reactive'), '应包含 reactive');
    assert.ok(!suggestions.includes('react'), '已添加的标签不应出现在建议中');

    // 空输入
    assert.deepEqual(panel.getTagSuggestions(''), [], '空输入应返回空数组');
    assert.deepEqual(panel.getTagSuggestions(null), [], 'null 输入应返回空数组');
  });

  // ─── 8. 状态管理 ────────────────────────────────────────────────────────

  it('13. setStatus 更改书签状态', () => {
    panel.show(sampleBookmark);
    assert.equal(panel.getStatus(), 'unread', '初始状态应为 unread');

    const r1 = panel.setStatus('reading');
    assert.equal(r1, true, '设置 reading 应返回 true');
    assert.equal(panel.getStatus(), 'reading', '状态应更新为 reading');

    const r2 = panel.setStatus('read');
    assert.equal(r2, true, '设置 read 应返回 true');
    assert.equal(panel.getStatus(), 'read', '状态应更新为 read');
  });

  it('14. setStatus 无效状态/无变化应返回 false', () => {
    panel.show(sampleBookmark);

    assert.equal(panel.setStatus('invalid'), false, '无效状态应返回 false');
    assert.equal(panel.setStatus('unread'), false, '设置相同状态应返回 false');
    assert.equal(panel.getStatus(), 'unread', '状态应保持不变');
  });

  it('15. getValidStatuses 返回所有允许的状态', () => {
    const statuses = panel.getValidStatuses();
    assert.deepEqual(statuses, ['unread', 'reading', 'read'], '应返回三种状态');
  });

  // ─── 9. 相似书签操作 ───────────────────────────────────────────────────

  it('16. switchToSimilar 切换到相似书签', () => {
    panel.show(sampleBookmark, sampleSimilar);

    const result = panel.switchToSimilar('2');
    assert.ok(result !== null, '切换应返回书签对象');
    assert.equal(result.id, '2', '应切换到 ID 2');
    assert.equal(result.title, 'Vue.js 入门', '标题应正确');

    // 不存在的 ID
    const miss = panel.switchToSimilar('999');
    assert.equal(miss, null, '不存在的相似书签应返回 null');
  });

  it('17. updateSimilar 更新相似书签列表', () => {
    panel.show(sampleBookmark, sampleSimilar);
    assert.equal(panel.getPanelData().similarBookmarks.length, 5);

    panel.updateSimilar([
      { id: '10', title: 'New', url: 'https://new.com', score: 0.9 },
    ]);
    assert.equal(panel.getPanelData().similarBookmarks.length, 1, '应更新为 1 个');
    assert.equal(panel.getPanelData().similarBookmarks[0].id, '10');
  });

  // ─── 10. URL 操作 ──────────────────────────────────────────────────────

  it('18. openUrl 触发打开 URL 回调', () => {
    panel.show(sampleBookmark);

    const actions = [];
    panel.onAction((action, data) => actions.push({ action, data }));

    const url = panel.openUrl();
    assert.equal(url, 'https://react.dev', '应返回正确的 URL');

    const openAction = actions.find(a => a.action === 'openUrl');
    assert.ok(openAction !== undefined, '应触发 openUrl 回调');
    assert.equal(openAction.data.url, 'https://react.dev', '回调应包含 URL');
    assert.equal(openAction.data.bookmarkId, '1', '回调应包含书签 ID');
  });

  it('19. openUrl 无书签时返回 null', () => {
    assert.equal(panel.openUrl(), null, '无书签时应返回 null');
  });

  // ─── 11. getPanelData 完整数据 ──────────────────────────────────────────

  it('20. getPanelData 返回完整面板数据', () => {
    const bookmarkWithTags = createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端'], {
      tags: ['react', 'docs'],
      status: 'reading',
    });

    panel.show(bookmarkWithTags, sampleSimilar);
    panel.setAllTags(['react', 'docs', 'frontend', 'vue']);
    panel.addTag('frontend');

    const data = panel.getPanelData();
    assert.ok(data !== null, '应返回数据');
    assert.equal(data.bookmark.id, '1', '书签 ID 应正确');
    assert.equal(data.status, 'reading', '状态应继承自书签');
    assert.deepEqual(data.tags, ['react', 'docs', 'frontend'], '标签应包含继承+新增');
    assert.equal(data.visible, true, 'visible 应为 true');
    assert.ok(typeof data.formattedDate === 'string', 'formattedDate 应为字符串');
    assert.ok(data.formattedDate.length > 0, 'formattedDate 不应为空');
    assert.equal(data.formattedFolderPath, '/技术/前端', 'formattedFolderPath 应正确');
    assert.equal(data.similarBookmarks.length, 5, '应有 5 个相似书签');
  });

  it('21. getPanelData 无书签时返回 null', () => {
    assert.equal(panel.getPanelData(), null, '无书签时应返回 null');
  });

  // ─── 12. 多回调注册 ────────────────────────────────────────────────────

  it('22. 多个 onAction 回调都应被触发', () => {
    let count1 = 0;
    let count2 = 0;
    panel.onAction(() => count1++);
    panel.onAction(() => count2++);

    panel.show(sampleBookmark);
    assert.equal(count1, 1, '第一个回调应被触发');
    assert.equal(count2, 1, '第二个回调应被触发');

    panel.addTag('test');
    assert.equal(count1, 2, '第一个回调应再次被触发 (addTag)');
    assert.equal(count2, 2, '第二个回调应再次被触发 (addTag)');
  });
});
