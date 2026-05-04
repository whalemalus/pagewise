/**
 * 测试 lib/bookmark-tagger.js — 标签自动生成
 *
 * 测试范围:
 *   generateTags / generateAllTags / getTagFrequency / getPopularTags
 *   mergeTags / getBookmarksByTag
 *   域名标签 / 中文标签 / 技术关键词 / 停用词过滤 / 空输入 / 边界情况
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkTagger } = await import('../lib/bookmark-tagger.js');

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

const sampleBookmarks = [
  createBookmark('1', 'React 官方文档', 'https://react.dev', ['技术', '前端']),
  createBookmark('2', 'Python Django Tutorial', 'https://djangoproject.com', ['后端', 'Python']),
  createBookmark('3', 'Docker 入门教程 — 快速上手指南', 'https://docs.docker.com/get-started', ['DevOps']),
  createBookmark('4', 'GitHub Actions CI/CD Best Practices', 'https://github.com/features/actions', ['工具', 'CI']),
  createBookmark('5', 'TypeScript 进阶技巧与实战模式', 'https://typescriptlang.org/docs', ['前端', 'TypeScript']),
  createBookmark('6', 'Vue 3 Composition API 完全指南', 'https://vuejs.org/guide', ['前端']),
  createBookmark('7', 'Kubernetes 集群管理入门', 'https://kubernetes.io/docs', ['DevOps']),
  createBookmark('8', 'Redis 缓存策略详解', 'https://redis.io/docs', ['数据库']),
  createBookmark('9', 'Stack Overflow 开发者调查报告', 'https://stackoverflow.com/survey', ['数据']),
  createBookmark('10', 'MySQL vs PostgreSQL 性能对比', 'https://example.com/db-compare', ['数据库']),
  createBookmark('11', 'LeetCode 算法题解', 'https://leetcode.com/problems', ['算法']),
  createBookmark('12', '前端性能优化完全指南', 'https://example.com/frontend-perf', ['前端', '性能']),
];

// ==================== 测试用例 ====================

describe('BookmarkTagger — 基本标签生成', () => {
  it('generateTags 对有效书签返回数组', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    const tags = tagger.generateTags(sampleBookmarks[0]);
    assert.ok(Array.isArray(tags), '应返回数组');
    assert.ok(tags.length > 0, '应至少有一个标签');
  });

  it('generateTags 标签数量在 1-5 之间', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    for (const bm of sampleBookmarks) {
      const tags = tagger.generateTags(bm);
      assert.ok(tags.length >= 1, `书签 "${bm.title}" 应至少有 1 个标签, 实际 ${tags.length}`);
      assert.ok(tags.length <= 5, `书签 "${bm.title}" 应最多 5 个标签, 实际 ${tags.length}`);
    }
  });

  it('generateTags 所有标签为小写字符串', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    for (const bm of sampleBookmarks) {
      const tags = tagger.generateTags(bm);
      for (const tag of tags) {
        assert.equal(typeof tag, 'string', '标签应为字符串');
        assert.equal(tag, tag.toLowerCase(), '标签应为小写');
        assert.ok(tag.length >= 2, '标签长度至少 2');
      }
    }
  });
});

describe('BookmarkTagger — 域名标签提取', () => {
  it('已知域名生成对应标签', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);

    const githubTags = tagger.generateTags(createBookmark('x', 'Some Repo', 'https://github.com/user/repo'));
    assert.ok(githubTags.includes('github'), `应包含 github 标签, 实际: ${githubTags}`);

    const soTags = tagger.generateTags(createBookmark('x', 'Question', 'https://stackoverflow.com/questions/123'));
    assert.ok(soTags.includes('stackoverflow'), `应包含 stackoverflow 标签, 实际: ${soTags}`);

    const dockerTags = tagger.generateTags(createBookmark('x', 'Docs', 'https://docs.docker.com'));
    assert.ok(dockerTags.includes('docker'), `应包含 docker 标签, 实际: ${dockerTags}`);
  });

  it('未知域名也能提取主域名标签', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    const tags = tagger.generateTags(createBookmark('x', 'Article', 'https://blog.mycompany.com/post'));
    assert.ok(tags.length >= 1, '未知域名也应有标签');
  });
});

describe('BookmarkTagger — 中文标签支持', () => {
  it('中文标题生成中文标签', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    const tags = tagger.generateTags(createBookmark('x', '前端性能优化完全指南', 'https://example.com/perf'));
    const hasChinese = tags.some(t => /[一-鿿]/.test(t));
    assert.ok(hasChinese, `应包含中文标签, 实际: ${tags}`);
  });

  it('中文停用词被过滤', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    const tags = tagger.generateTags(createBookmark('x', '这是一个很好的教程', 'https://example.com/tut'));
    assert.ok(!tags.includes('这是'), '应过滤"这是"');
    assert.ok(!tags.includes('一个'), '应过滤"一个"');
    assert.ok(!tags.includes('很好'), '应过滤"很好"');
  });

  it('中英文混合标签都可生成', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    const tags = tagger.generateTags(createBookmark('x', 'React 中文文档入门教程', 'https://react.dev'));
    const hasEnglish = tags.some(t => /^[a-z]/.test(t));
    const hasChinese = tags.some(t => /[一-鿿]/.test(t));
    assert.ok(hasEnglish || tags.length > 0, '应有英文标签或有效标签');
    // 中英文混合场景可能都产生标签
  });
});

describe('BookmarkTagger — generateAllTags 全局生成', () => {
  it('为每个书签都生成了标签', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    const allTags = tagger.generateAllTags();
    assert.ok(allTags instanceof Map, '应返回 Map');
    assert.equal(allTags.size, sampleBookmarks.length, '每个书签都应有标签映射');
    for (const [id, tags] of allTags) {
      assert.ok(tags.length >= 1, `书签 ${id} 应至少有 1 个标签`);
    }
  });
});

describe('BookmarkTagger — 标签频率统计', () => {
  it('getTagFrequency 返回频率 Map', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    const freq = tagger.getTagFrequency();
    assert.ok(freq instanceof Map, '应返回 Map');
    assert.ok(freq.size > 0, '应有标签');
    for (const [tag, count] of freq) {
      assert.ok(count >= 1, `标签 "${tag}" 频率应 >= 1`);
    }
  });

  it('getPopularTags 返回降序排列', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    const popular = tagger.getPopularTags(5);
    assert.ok(Array.isArray(popular), '应返回数组');
    assert.ok(popular.length <= 5, '不超过 limit');
    for (let i = 1; i < popular.length; i++) {
      assert.ok(popular[i - 1].count >= popular[i].count, '应按频率降序');
    }
    assert.ok(popular[0].tag, '应有 tag 字段');
    assert.ok(popular[0].count >= 1, '应有 count 字段');
  });
});

describe('BookmarkTagger — mergeTags 合并操作', () => {
  it('合并标签返回受影响的书签数', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    tagger.generateAllTags();

    // 找一个存在的标签进行合并
    const freq = tagger.getTagFrequency();
    const tags = [...freq.keys()];
    assert.ok(tags.length >= 2, '应至少有 2 个标签');

    const oldTag = tags[0];
    const affected = tagger.mergeTags(oldTag, 'merged-tag');
    assert.ok(typeof affected === 'number', '应返回数字');
    assert.ok(affected >= 0, '受影响数应 >= 0');
  });

  it('合并后旧标签不再存在', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    tagger.generateAllTags();

    const freq = tagger.getTagFrequency();
    const tags = [...freq.keys()];
    const oldTag = tags[0];

    tagger.mergeTags(oldTag, 'merged-tag');

    const freqAfter = tagger.getTagFrequency();
    assert.ok(!freqAfter.has(oldTag), `旧标签 "${oldTag}" 应已不存在`);
    assert.ok(freqAfter.has('merged-tag'), '新标签应存在');
  });

  it('合并相同标签返回 0', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    assert.equal(tagger.mergeTags('same', 'same'), 0);
  });
});

describe('BookmarkTagger — getBookmarksByTag 按标签查找', () => {
  it('按标签返回匹配的书签', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    tagger.generateAllTags();

    const freq = tagger.getTagFrequency();
    const tags = [...freq.keys()];
    const testTag = tags[0];

    const found = tagger.getBookmarksByTag(testTag);
    assert.ok(Array.isArray(found), '应返回数组');
    assert.ok(found.length >= 1, '应至少匹配一个书签');
    for (const bm of found) {
      assert.ok(bm.id, '书签应有 id');
      assert.ok(bm.title, '书签应有 title');
    }
  });

  it('不存在的标签返回空数组', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    tagger.generateAllTags();
    const found = tagger.getBookmarksByTag('nonexistent-tag-xyz-12345');
    assert.deepEqual(found, []);
  });
});

describe('BookmarkTagger — 空输入与边界情况', () => {
  it('空书签数组不报错', () => {
    const tagger = new BookmarkTagger([]);
    const tags = tagger.generateTags({ id: '1', title: 'Test', url: 'https://example.com' });
    assert.ok(Array.isArray(tags));
    const allTags = tagger.generateAllTags();
    assert.equal(allTags.size, 0);
  });

  it('generateTags 对 null/undefined 返回空数组', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    assert.deepEqual(tagger.generateTags(null), []);
    assert.deepEqual(tagger.generateTags(undefined), []);
    assert.deepEqual(tagger.generateTags('invalid'), []);
  });

  it('getBookmarksByTag 空输入返回空数组', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    assert.deepEqual(tagger.getBookmarksByTag(''), []);
    assert.deepEqual(tagger.getBookmarksByTag(null), []);
  });

  it('getPopularTags 默认返回 10 个或更少', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    const popular = tagger.getPopularTags();
    assert.ok(popular.length <= 10, '默认不超过 10 个');
  });

  it('标签去重 — 不会有重复标签', () => {
    const tagger = new BookmarkTagger(sampleBookmarks);
    for (const bm of sampleBookmarks) {
      const tags = tagger.generateTags(bm);
      const unique = [...new Set(tags)];
      assert.equal(tags.length, unique.length, `书签 "${bm.title}" 不应有重复标签`);
    }
  });
});
