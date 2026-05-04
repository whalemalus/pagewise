/**
 * 测试 lib/bookmark-tag-editor.js — 标签手动编辑
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BookmarkTagEditor } from '../lib/bookmark-tag-editor.js';

// ==================== 测试数据 ====================

function makeBookmark(id, title, url, tags = []) {
  return { id: String(id), title, url, tags };
}

function makeFixture() {
  const bookmarks = [
    makeBookmark('1', 'React Tutorial', 'https://react.dev', ['react', 'javascript']),
    makeBookmark('2', 'Vue.js Guide', 'https://vuejs.org', ['vue', 'javascript']),
    makeBookmark('3', 'Python Basics', 'https://python.org', ['python', 'tutorial']),
    makeBookmark('4', 'Go Concurrency', 'https://go.dev', []),
  ];
  const existingTags = ['react', 'javascript', 'vue', 'python', 'tutorial', 'go', 'rust'];
  return new BookmarkTagEditor({ bookmarks, existingTags });
}

// ==================== 测试 ====================

describe('BookmarkTagEditor', () => {
  // ---- 1. 标签规范化 ----
  describe('normalizeTag (静态方法)', () => {
    it('转小写 + 去首尾空格', () => {
      assert.equal(BookmarkTagEditor.normalizeTag('  JavaScript  '), 'javascript');
    });

    it('连续空格替换为连字符', () => {
      assert.equal(BookmarkTagEditor.normalizeTag('machine  learning'), 'machine-learning');
    });

    it('移除特殊字符（保留中文）', () => {
      assert.equal(BookmarkTagEditor.normalizeTag('AI@#$助手!'), 'ai助手');
    });

    it('保留连字符和下划线', () => {
      assert.equal(BookmarkTagEditor.normalizeTag('dev-ops_tools'), 'dev-ops_tools');
    });

    it('最大长度 30 字符截断', () => {
      const long = 'a'.repeat(50);
      assert.equal(BookmarkTagEditor.normalizeTag(long).length, 30);
    });

    it('非字符串输入返回空字符串', () => {
      assert.equal(BookmarkTagEditor.normalizeTag(null), '');
      assert.equal(BookmarkTagEditor.normalizeTag(undefined), '');
      assert.equal(BookmarkTagEditor.normalizeTag(123), '');
    });

    it('纯特殊字符返回空字符串', () => {
      assert.equal(BookmarkTagEditor.normalizeTag('###'), '');
    });
  });

  // ---- 2. 获取标签 ----
  describe('getTags / getAllTags', () => {
    it('getTags 返回指定书签标签的副本', () => {
      const editor = makeFixture();
      const tags = editor.getTags('1');
      assert.deepEqual(tags.sort(), ['javascript', 'react']);
    });

    it('不存在的书签返回空数组', () => {
      const editor = makeFixture();
      assert.deepEqual(editor.getTags('999'), []);
    });

    it('getAllTags 返回全局去重排序标签', () => {
      const editor = makeFixture();
      const all = editor.getAllTags();
      // 应包含构造时的 existingTags + 书签内置标签
      assert.ok(all.includes('react'));
      assert.ok(all.includes('go'));
      assert.ok(all.includes('rust'));
      // 验证排序
      const sorted = [...all].sort();
      assert.deepEqual(all, sorted);
    });
  });

  // ---- 3. 添加标签 ----
  describe('addTag', () => {
    it('成功添加新标签返回 true', () => {
      const editor = makeFixture();
      assert.equal(editor.addTag('1', 'frontend'), true);
      assert.ok(editor.getTags('1').includes('frontend'));
    });

    it('重复添加返回 false', () => {
      const editor = makeFixture();
      assert.equal(editor.addTag('1', 'react'), false);
    });

    it('不存在的书签返回 false', () => {
      const editor = makeFixture();
      assert.equal(editor.addTag('999', 'newtag'), false);
    });

    it('空标签返回 false', () => {
      const editor = makeFixture();
      assert.equal(editor.addTag('1', ''), false);
      assert.equal(editor.addTag('1', '###'), false);
    });

    it('标签自动规范化后添加', () => {
      const editor = makeFixture();
      editor.addTag('1', '  Deep  Learning  ');
      const tags = editor.getTags('1');
      assert.ok(tags.includes('deep-learning'));
    });
  });

  // ---- 4. 删除标签 ----
  describe('removeTag', () => {
    it('成功删除已有标签返回 true', () => {
      const editor = makeFixture();
      assert.equal(editor.removeTag('1', 'react'), true);
      assert.ok(!editor.getTags('1').includes('react'));
    });

    it('删除不存在的标签返回 false', () => {
      const editor = makeFixture();
      assert.equal(editor.removeTag('1', 'nonexistent'), false);
    });

    it('不存在的书签返回 false', () => {
      const editor = makeFixture();
      assert.equal(editor.removeTag('999', 'react'), false);
    });
  });

  // ---- 5. 覆盖标签 ----
  describe('setTags', () => {
    it('覆盖书签全部标签', () => {
      const editor = makeFixture();
      editor.setTags('1', ['web', 'frontend', 'framework']);
      const tags = editor.getTags('1').sort();
      assert.deepEqual(tags, ['framework', 'frontend', 'web']);
    });

    it('去重 + 规范化', () => {
      const editor = makeFixture();
      editor.setTags('2', ['Vue', 'VUE', '  vue  ']);
      assert.deepEqual(editor.getTags('2'), ['vue']);
    });

    it('不存在的书签不抛错', () => {
      const editor = makeFixture();
      editor.setTags('999', ['tag']);
      // 不应抛错
    });
  });

  // ---- 6. 自动补全 ----
  describe('getAutocomplete', () => {
    it('前缀匹配已有标签', () => {
      const editor = makeFixture();
      const results = editor.getAutocomplete('rea');
      assert.ok(results.includes('react'));
    });

    it('限制返回数量', () => {
      const editor = makeFixture();
      const results = editor.getAutocomplete('j', 1);
      assert.ok(results.length <= 1);
    });

    it('空输入返回空数组', () => {
      const editor = makeFixture();
      assert.deepEqual(editor.getAutocomplete(''), []);
      assert.deepEqual(editor.getAutocomplete('   '), []);
    });

    it('中文前缀匹配', () => {
      const editor = new BookmarkTagEditor({
        bookmarks: [makeBookmark('1', 'test', 'http://t', ['教程', '教程入门'])],
        existingTags: ['教程', '教程入门'],
      });
      const results = editor.getAutocomplete('教程');
      assert.ok(results.length >= 1);
    });
  });

  // ---- 7. 批量操作 ----
  describe('batchAddTag / batchRemoveTag', () => {
    it('批量添加标签返回成功数量', () => {
      const editor = makeFixture();
      const count = editor.batchAddTag(['1', '2', '4'], 'web');
      assert.equal(count, 3);
      assert.ok(editor.getTags('1').includes('web'));
      assert.ok(editor.getTags('2').includes('web'));
      assert.ok(editor.getTags('4').includes('web'));
    });

    it('批量添加时已有标签的不重复计算', () => {
      const editor = makeFixture();
      // '1' 已有 'react'
      const count = editor.batchAddTag(['1', '2'], 'react');
      assert.equal(count, 1); // 只有 '2' 成功
    });

    it('批量删除标签返回成功数量', () => {
      const editor = makeFixture();
      const count = editor.batchRemoveTag(['1', '2'], 'javascript');
      assert.equal(count, 2); // 两个都有 javascript
      assert.ok(!editor.getTags('1').includes('javascript'));
      assert.ok(!editor.getTags('2').includes('javascript'));
    });

    it('批量删除不存在标签的书签不计入成功', () => {
      const editor = makeFixture();
      const count = editor.batchRemoveTag(['1', '2', '3'], 'go');
      assert.equal(count, 0); // 没有任何书签有 'go'
    });

    it('混合有效/无效 id 不影响结果', () => {
      const editor = makeFixture();
      const count = editor.batchAddTag(['1', '999', '2'], 'newtag');
      assert.equal(count, 2);
    });
  });
});
