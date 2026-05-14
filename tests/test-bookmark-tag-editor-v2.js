/**
 * 测试 lib/bookmark-tag-editor-v2.js — 标签编辑器增强版
 *
 * 测试范围 (25+ 用例):
 *   - normalizeTag 静态方法
 *   - 构造函数 / 查询方法
 *   - batchAddTags 批量添加
 *   - batchRemoveTags 批量删除
 *   - mergeTags 标签合并
 *   - getTagSuggestions 智能推荐
 *   - getUnusedTags 未使用标签
 *   - getTagCooccurrence 共现分析
 *   - 边界情况 / 空输入
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BookmarkTagEditorV2 } from '../lib/bookmark-tag-editor-v2.js';

// ==================== 测试数据 ====================

function makeBookmark(id, title, url, tags = []) {
  return { id: String(id), title, url, tags };
}

function makeFixture() {
  const bookmarks = [
    makeBookmark('1', 'React Tutorial', 'https://react.dev/learn', ['react', 'javascript', 'tutorial']),
    makeBookmark('2', 'Vue.js Guide', 'https://vuejs.org/guide', ['vue', 'javascript']),
    makeBookmark('3', 'Python Django Tutorial', 'https://docs.djangoproject.com', ['python', 'tutorial']),
    makeBookmark('4', 'Docker 入门教程', 'https://docs.docker.com/get-started', ['docker', 'tutorial']),
    makeBookmark('5', 'Go Concurrency Patterns', 'https://go.dev/doc', []),
    makeBookmark('6', 'Rust Book', 'https://doc.rust-lang.org/book', ['rust']),
    makeBookmark('7', 'TypeScript Handbook', 'https://typescriptlang.org/docs', ['typescript', 'javascript']),
    makeBookmark('8', 'Kubernetes Docs', 'https://kubernetes.io/docs', ['kubernetes', 'docker']),
  ];
  const existingTags = ['react', 'javascript', 'vue', 'python', 'tutorial', 'docker', 'go', 'rust', 'typescript', 'kubernetes', 'unused-old', 'legacy-tag'];
  return new BookmarkTagEditorV2({ bookmarks, existingTags });
}

// ==================== 测试 ====================

describe('BookmarkTagEditorV2 — normalizeTag', () => {
  it('转小写 + 去首尾空格', () => {
    assert.equal(BookmarkTagEditorV2.normalizeTag('  JavaScript  '), 'javascript');
  });

  it('连续空格替换为连字符', () => {
    assert.equal(BookmarkTagEditorV2.normalizeTag('machine  learning'), 'machine-learning');
  });

  it('移除特殊字符（保留中文）', () => {
    assert.equal(BookmarkTagEditorV2.normalizeTag('AI@#$助手!'), 'ai助手');
  });

  it('保留连字符和下划线', () => {
    assert.equal(BookmarkTagEditorV2.normalizeTag('dev-ops_tools'), 'dev-ops_tools');
  });

  it('最大长度 30 字符截断', () => {
    const long = 'a'.repeat(50);
    assert.equal(BookmarkTagEditorV2.normalizeTag(long).length, 30);
  });

  it('非字符串输入返回空字符串', () => {
    assert.equal(BookmarkTagEditorV2.normalizeTag(null), '');
    assert.equal(BookmarkTagEditorV2.normalizeTag(undefined), '');
    assert.equal(BookmarkTagEditorV2.normalizeTag(123), '');
  });
});

describe('BookmarkTagEditorV2 — 构造与查询', () => {
  it('getTags 返回指定书签的标签', () => {
    const editor = makeFixture();
    const tags = editor.getTags('1').sort();
    assert.deepEqual(tags, ['javascript', 'react', 'tutorial']);
  });

  it('不存在的书签返回空数组', () => {
    const editor = makeFixture();
    assert.deepEqual(editor.getTags('999'), []);
  });

  it('getAllTags 返回全局去重排序标签', () => {
    const editor = makeFixture();
    const all = editor.getAllTags();
    assert.ok(all.includes('react'));
    assert.ok(all.includes('unused-old'));
    const sorted = [...all].sort();
    assert.deepEqual(all, sorted);
  });

  it('getBookmark 返回书签深拷贝', () => {
    const editor = makeFixture();
    const bm = editor.getBookmark('1');
    assert.equal(bm.title, 'React Tutorial');
    assert.equal(bm.url, 'https://react.dev/learn');
    assert.ok(bm.tags.includes('react'));
    // 修改不应影响内部状态
    bm.tags.push('hack');
    assert.deepEqual(editor.getTags('1').sort(), ['javascript', 'react', 'tutorial']);
  });

  it('getBookmarkCount 返回书签数', () => {
    const editor = makeFixture();
    assert.equal(editor.getBookmarkCount(), 8);
  });

  it('标签自动规范化存储', () => {
    const editor = new BookmarkTagEditorV2({
      bookmarks: [makeBookmark('1', 'Test', 'https://test.com', ['  Deep  Learning  ', 'AI@#$'])],
    });
    const tags = editor.getTags('1');
    assert.ok(tags.includes('deep-learning'));
    assert.ok(tags.includes('ai'));
  });
});

describe('BookmarkTagEditorV2 — batchAddTags', () => {
  it('批量为多个书签添加多个标签', () => {
    const editor = makeFixture();
    const result = editor.batchAddTags(['1', '2', '5'], ['web', 'frontend', 'modern']);
    assert.equal(result.totalAdded, 9); // 3 bookmarks × 3 tags
    assert.equal(result.details.size, 3);
    assert.ok(editor.getTags('1').includes('web'));
    assert.ok(editor.getTags('1').includes('frontend'));
    assert.ok(editor.getTags('5').includes('modern'));
  });

  it('已存在的标签不重复添加', () => {
    const editor = makeFixture();
    const result = editor.batchAddTags(['1'], ['react', 'javascript', 'newtag']);
    assert.equal(result.totalAdded, 1); // 只有 newtag 被添加
    assert.deepEqual(result.details.get('1'), ['newtag']);
  });

  it('跳过不存在的书签 ID', () => {
    const editor = makeFixture();
    const result = editor.batchAddTags(['1', '999', '2'], ['web']);
    assert.equal(result.totalAdded, 2);
    assert.equal(result.details.size, 2);
    assert.ok(!result.details.has('999'));
  });

  it('标签自动规范化', () => {
    const editor = makeFixture();
    const result = editor.batchAddTags(['1'], ['  Web  Dev  ']);
    assert.equal(result.totalAdded, 1);
    assert.ok(editor.getTags('1').includes('web-dev'));
  });

  it('空输入返回零结果', () => {
    const editor = makeFixture();
    const result = editor.batchAddTags([], ['tag']);
    assert.equal(result.totalAdded, 0);
    assert.equal(result.details.size, 0);
  });

  it('空标签数组返回零结果', () => {
    const editor = makeFixture();
    const result = editor.batchAddTags(['1', '2'], []);
    assert.equal(result.totalAdded, 0);
  });
});

describe('BookmarkTagEditorV2 — batchRemoveTags', () => {
  it('批量从多个书签删除多个标签', () => {
    const editor = makeFixture();
    const result = editor.batchRemoveTags(['1', '2', '7'], ['javascript']);
    assert.equal(result.totalRemoved, 3); // 三个书签都有 javascript
    assert.ok(!editor.getTags('1').includes('javascript'));
    assert.ok(!editor.getTags('2').includes('javascript'));
    assert.ok(!editor.getTags('7').includes('javascript'));
  });

  it('只删除指定标签，保留其余', () => {
    const editor = makeFixture();
    editor.batchRemoveTags(['1'], ['react', 'tutorial']);
    const remaining = editor.getTags('1');
    assert.deepEqual(remaining, ['javascript']);
  });

  it('删除不存在的标签不计入', () => {
    const editor = makeFixture();
    const result = editor.batchRemoveTags(['1', '2'], ['nonexistent']);
    assert.equal(result.totalRemoved, 0);
    assert.equal(result.details.size, 0);
  });

  it('混合有效/无效 ID', () => {
    const editor = makeFixture();
    const result = editor.batchRemoveTags(['1', '999', '3'], ['tutorial']);
    assert.equal(result.totalRemoved, 2); // 1 和 3 有 tutorial
    assert.ok(!result.details.has('999'));
  });

  it('details 只包含有变化的书签', () => {
    const editor = makeFixture();
    // 书签 6 只有 rust，删 javascript 不会影响它
    const result = editor.batchRemoveTags(['1', '6'], ['javascript']);
    assert.equal(result.totalRemoved, 1);
    assert.ok(result.details.has('1'));
    assert.ok(!result.details.has('6'));
  });
});

describe('BookmarkTagEditorV2 — mergeTags', () => {
  it('合并标签替换所有书签中的旧标签', () => {
    const editor = makeFixture();
    const result = editor.mergeTags('tutorial', 'guide');
    assert.equal(result.affectedCount, 3); // 书签 1, 3, 4
    // 验证旧标签消失
    for (const id of ['1', '3', '4']) {
      const tags = editor.getTags(id);
      assert.ok(!tags.includes('tutorial'), `书签 ${id} 不应再有 tutorial`);
      assert.ok(tags.includes('guide'), `书签 ${id} 应有 guide`);
    }
  });

  it('合并后新标签如果已存在则不重复', () => {
    // 制造一个书签同时有 oldTag 和 newTag 的场景
    const editor = new BookmarkTagEditorV2({
      bookmarks: [
        makeBookmark('1', 'A', 'https://a.com', ['old-tag', 'new-tag']),
      ],
      existingTags: ['old-tag', 'new-tag'],
    });
    const result = editor.mergeTags('old-tag', 'new-tag');
    assert.equal(result.affectedCount, 1);
    const tags = editor.getTags('1');
    assert.ok(!tags.includes('old-tag'));
    assert.ok(tags.includes('new-tag'));
    // 确保 new-tag 只出现一次
    assert.equal(tags.filter(t => t === 'new-tag').length, 1);
  });

  it('合并相同标签返回 0', () => {
    const editor = makeFixture();
    const result = editor.mergeTags('react', 'react');
    assert.equal(result.affectedCount, 0);
    assert.deepEqual(result.affectedIds, []);
  });

  it('合并空标签返回 0', () => {
    const editor = makeFixture();
    assert.equal(editor.mergeTags('', 'new').affectedCount, 0);
    assert.equal(editor.mergeTags('old', '').affectedCount, 0);
  });

  it('合并不存在的标签返回 0', () => {
    const editor = makeFixture();
    const result = editor.mergeTags('nonexistent-tag-xyz', 'something');
    assert.equal(result.affectedCount, 0);
  });

  it('合并后全局标签库更新', () => {
    const editor = makeFixture();
    const allBefore = editor.getAllTags();
    assert.ok(allBefore.includes('tutorial'));

    editor.mergeTags('tutorial', 'guide');

    const allAfter = editor.getAllTags();
    assert.ok(!allAfter.includes('tutorial'), 'tutorial 应从全局标签库移除');
    assert.ok(allAfter.includes('guide'), 'guide 应出现在全局标签库');
  });
});

describe('BookmarkTagEditorV2 — getTagSuggestions', () => {
  it('已知域名推荐域名标签', () => {
    const editor = makeFixture();
    const suggestions = editor.getTagSuggestions({
      title: 'Some Article',
      url: 'https://github.com/user/repo',
      tags: [],
    });
    assert.ok(suggestions.includes('github'), `应推荐 github, 实际: ${suggestions}`);
  });

  it('技术关键词匹配', () => {
    const editor = makeFixture();
    const suggestions = editor.getTagSuggestions({
      title: 'Building a REST API with Django',
      url: 'https://example.com/django-api',
      tags: [],
    });
    assert.ok(suggestions.includes('django'), `应推荐 django, 实际: ${suggestions}`);
    assert.ok(suggestions.includes('api'), `应推荐 api, 实际: ${suggestions}`);
  });

  it('不推荐书签已有的标签', () => {
    const editor = makeFixture();
    const suggestions = editor.getTagSuggestions({
      title: 'React Hooks Tutorial',
      url: 'https://react.dev/hooks',
      tags: ['react', 'javascript'],
    });
    assert.ok(!suggestions.includes('react'), '不应推荐已有的 react');
    assert.ok(!suggestions.includes('javascript'), '不应推荐已有的 javascript');
  });

  it('推荐数量受 limit 限制', () => {
    const editor = makeFixture();
    const suggestions = editor.getTagSuggestions({
      title: 'Full Stack Web Development with React TypeScript Node.js GraphQL Docker',
      url: 'https://example.com/fullstack',
      tags: [],
    }, 3);
    assert.ok(suggestions.length <= 3, `最多 3 个, 实际: ${suggestions.length}`);
  });

  it('无效输入返回空数组', () => {
    const editor = makeFixture();
    assert.deepEqual(editor.getTagSuggestions(null), []);
    assert.deepEqual(editor.getTagSuggestions(undefined), []);
    assert.deepEqual(editor.getTagSuggestions('invalid'), []);
  });

  it('空标题和 URL 返回空数组', () => {
    const editor = makeFixture();
    const suggestions = editor.getTagSuggestions({ title: '', url: '', tags: [] });
    assert.deepEqual(suggestions, []);
  });

  it('推荐的标签不包含重复', () => {
    const editor = makeFixture();
    const suggestions = editor.getTagSuggestions({
      title: 'Docker Tutorial for Docker Beginners',
      url: 'https://docs.docker.com/tutorial',
      tags: [],
    });
    const unique = [...new Set(suggestions)];
    assert.equal(suggestions.length, unique.length, '不应有重复推荐');
  });
});

describe('BookmarkTagEditorV2 — getUnusedTags', () => {
  it('找出全局标签库中未使用的标签', () => {
    const editor = makeFixture();
    const unused = editor.getUnusedTags();
    assert.ok(unused.includes('unused-old'), '应包含 unused-old');
    assert.ok(unused.includes('legacy-tag'), '应包含 legacy-tag');
    // 不应包含正在使用的标签
    assert.ok(!unused.includes('react'));
    assert.ok(!unused.includes('tutorial'));
  });

  it('所有标签都在使用时返回空数组', () => {
    const editor = new BookmarkTagEditorV2({
      bookmarks: [
        makeBookmark('1', 'A', 'https://a.com', ['tag-a', 'tag-b']),
        makeBookmark('2', 'B', 'https://b.com', ['tag-c']),
      ],
      existingTags: ['tag-a', 'tag-b', 'tag-c'],
    });
    const unused = editor.getUnusedTags();
    assert.deepEqual(unused, []);
  });

  it('空书签数组时所有标签都未使用', () => {
    const editor = new BookmarkTagEditorV2({
      bookmarks: [],
      existingTags: ['orphan-1', 'orphan-2'],
    });
    const unused = editor.getUnusedTags();
    assert.deepEqual(unused, ['orphan-1', 'orphan-2']);
  });

  it('结果排序', () => {
    const editor = new BookmarkTagEditorV2({
      bookmarks: [],
      existingTags: ['zebra', 'alpha', 'mango'],
    });
    const unused = editor.getUnusedTags();
    assert.deepEqual(unused, ['alpha', 'mango', 'zebra']);
  });
});

describe('BookmarkTagEditorV2 — getTagCooccurrence', () => {
  it('找到同时出现的标签对', () => {
    const editor = new BookmarkTagEditorV2({
      bookmarks: [
        makeBookmark('1', 'A', 'https://a.com', ['react', 'javascript', 'frontend']),
        makeBookmark('2', 'B', 'https://b.com', ['react', 'javascript']),
        makeBookmark('3', 'C', 'https://c.com', ['react', 'javascript', 'web']),
        makeBookmark('4', 'D', 'https://d.com', ['python', 'backend']),
      ],
    });
    const cooccurrence = editor.getTagCooccurrence(2);
    assert.ok(cooccurrence.length > 0, '应有共现结果');

    // react + javascript 共现 3 次
    const pair = cooccurrence.find(c =>
      c.tagA === 'javascript' && c.tagB === 'react'
    );
    assert.ok(pair, '应找到 javascript + react 共现');
    assert.equal(pair.count, 3);
  });

  it('结果按共现次数降序排列', () => {
    const editor = new BookmarkTagEditorV2({
      bookmarks: [
        makeBookmark('1', 'A', 'https://a.com', ['a', 'b', 'c']),
        makeBookmark('2', 'B', 'https://b.com', ['a', 'b']),
        makeBookmark('3', 'C', 'https://c.com', ['a', 'b']),
        makeBookmark('4', 'D', 'https://d.com', ['a', 'c']),
        makeBookmark('5', 'E', 'https://e.com', ['b', 'c']),
      ],
    });
    const cooccurrence = editor.getTagCooccurrence(1);
    for (let i = 1; i < cooccurrence.length; i++) {
      assert.ok(
        cooccurrence[i - 1].count >= cooccurrence[i].count,
        `应按降序: ${cooccurrence[i - 1].count} >= ${cooccurrence[i].count}`
      );
    }
  });

  it('minCount 过滤低频共现', () => {
    const editor = new BookmarkTagEditorV2({
      bookmarks: [
        makeBookmark('1', 'A', 'https://a.com', ['x', 'y']),
        makeBookmark('2', 'B', 'https://b.com', ['x', 'z']),
      ],
    });
    const highThreshold = editor.getTagCooccurrence(100);
    assert.equal(highThreshold.length, 0, '高阈值应无结果');

    const lowThreshold = editor.getTagCooccurrence(1);
    assert.ok(lowThreshold.length > 0, '低阈值应有结果');
  });

  it('单标签书签不产生共现', () => {
    const editor = new BookmarkTagEditorV2({
      bookmarks: [
        makeBookmark('1', 'A', 'https://a.com', ['solo']),
        makeBookmark('2', 'B', 'https://b.com', ['alone']),
      ],
    });
    const cooccurrence = editor.getTagCooccurrence(1);
    assert.equal(cooccurrence.length, 0);
  });

  it('空书签数组返回空结果', () => {
    const editor = new BookmarkTagEditorV2({ bookmarks: [] });
    const cooccurrence = editor.getTagCooccurrence(1);
    assert.deepEqual(cooccurrence, []);
  });

  it('每个结果都有 tagA、tagB、count', () => {
    const editor = new BookmarkTagEditorV2({
      bookmarks: [
        makeBookmark('1', 'A', 'https://a.com', ['p', 'q']),
        makeBookmark('2', 'B', 'https://b.com', ['p', 'q']),
      ],
    });
    const cooccurrence = editor.getTagCooccurrence(1);
    for (const item of cooccurrence) {
      assert.ok(typeof item.tagA === 'string');
      assert.ok(typeof item.tagB === 'string');
      assert.ok(typeof item.count === 'number');
      assert.ok(item.tagA < item.tagB, 'tagA 应按字典序排列在 tagB 前');
    }
  });
});
