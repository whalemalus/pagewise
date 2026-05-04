/**
 * 测试 lib/bookmark-learning-path.js — 学习路径推荐
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BookmarkLearningPath } from '../lib/bookmark-learning-path.js';

// ==================== 测试数据 ====================

function makeBookmark(id, title, url, opts = {}) {
  return {
    id: String(id),
    title,
    url: url || `https://example.com/${id}`,
    dateAdded: opts.dateAdded || Date.now(),
    tags: opts.tags || [],
    folderPath: opts.folderPath || [],
    ...opts.extra,
  };
}

function makeFixture() {
  const bookmarks = [
    // 入门级
    makeBookmark('1', 'React Tutorial for Beginners', 'https://react.dev/learn', {
      dateAdded: 1000, tags: ['react', 'tutorial'],
    }),
    makeBookmark('2', 'Getting Started with Vue.js', 'https://vuejs.org/guide', {
      dateAdded: 2000, tags: ['vue', 'getting started'],
    }),
    makeBookmark('3', 'CSS 入门教程', 'https://example.com/css-intro', {
      dateAdded: 3000, tags: ['css', '入门'],
    }),
    // 进阶级
    makeBookmark('4', 'React Best Practices 2025', 'https://example.com/react-bp', {
      dateAdded: 4000, tags: ['react', 'best practices'],
    }),
    makeBookmark('5', 'Vue 进阶技巧', 'https://example.com/vue-advanced', {
      dateAdded: 5000, tags: ['vue', '进阶'],
    }),
    makeBookmark('6', 'CSS Deep Dive: Grid Layout', 'https://example.com/css-grid', {
      dateAdded: 6000, tags: ['css', 'deep dive'],
    }),
    // 高级
    makeBookmark('7', 'React Architecture Internals', 'https://example.com/react-internals', {
      dateAdded: 7000, tags: ['react', 'architecture'],
    }),
    makeBookmark('8', 'Vue 性能优化指南', 'https://example.com/vue-perf', {
      dateAdded: 8000, tags: ['vue', '性能优化'],
    }),
    makeBookmark('9', 'CSS 源码解析', 'https://example.com/css-source', {
      dateAdded: 9000, tags: ['css', '源码'],
    }),
    // 后端入门
    makeBookmark('10', 'Node.js Tutorial', 'https://nodejs.org/learn', {
      dateAdded: 1500, tags: ['node', 'tutorial'],
    }),
    makeBookmark('11', 'Django 实战教程', 'https://djangoproject.com/start', {
      dateAdded: 2500, tags: ['django', '实战'],
    }),
    makeBookmark('12', 'Go 性能优化 Architecture', 'https://go.dev/perf', {
      dateAdded: 8500, tags: ['go', 'performance', 'architecture'],
    }),
  ];

  const clusters = new Map();
  clusters.set('前端', bookmarks.slice(0, 9));
  clusters.set('后端', bookmarks.slice(9));

  return { bookmarks, clusters };
}

// ==================== 难度判断 ====================

describe('BookmarkLearningPath.judgeDifficulty()', () => {
  it('tutorial / getting started → beginner', () => {
    assert.equal(
      BookmarkLearningPath.judgeDifficulty(makeBookmark('x', 'React Tutorial for Beginners', '')),
      'beginner'
    );
    assert.equal(
      BookmarkLearningPath.judgeDifficulty(makeBookmark('x', 'Getting Started with Node', '')),
      'beginner'
    );
  });

  it('中文关键词入门/教程 → beginner', () => {
    assert.equal(
      BookmarkLearningPath.judgeDifficulty(makeBookmark('x', 'CSS 入门教程', '', { tags: ['入门'] })),
      'beginner'
    );
  });

  it('best practices / deep dive → intermediate', () => {
    assert.equal(
      BookmarkLearningPath.judgeDifficulty(makeBookmark('x', 'React Best Practices', '')),
      'intermediate'
    );
    assert.equal(
      BookmarkLearningPath.judgeDifficulty(makeBookmark('x', 'Vue Deep Dive', '')),
      'intermediate'
    );
  });

  it('architecture / performance / 源码 → advanced', () => {
    assert.equal(
      BookmarkLearningPath.judgeDifficulty(makeBookmark('x', 'React Architecture Internals', '')),
      'advanced'
    );
    assert.equal(
      BookmarkLearningPath.judgeDifficulty(makeBookmark('x', '源码解析', '')),
      'advanced'
    );
    assert.equal(
      BookmarkLearningPath.judgeDifficulty(makeBookmark('x', '性能优化指南', '')),
      'advanced'
    );
  });

  it('无关键词时默认 intermediate', () => {
    assert.equal(
      BookmarkLearningPath.judgeDifficulty(makeBookmark('x', 'Random Article', 'https://example.com')),
      'intermediate'
    );
  });

  it('URL 中的关键词也能识别', () => {
    assert.equal(
      BookmarkLearningPath.judgeDifficulty(makeBookmark('x', 'Learn React', 'https://react.dev/learn/beginner')),
      'beginner'
    );
  });
});

// ==================== 路径生成 ====================

describe('BookmarkLearningPath.generatePath()', () => {
  it('为前端分类生成 4 阶段学习路径', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });
    const path = lp.generatePath('前端');

    assert.equal(path.length, 4);
    assert.equal(path[0].name, '基础入门');
    assert.equal(path[0].level, 'beginner');
    assert.equal(path[1].name, '实战练习');
    assert.equal(path[1].level, 'intermediate');
    assert.equal(path[2].name, '深入理解');
    assert.equal(path[2].level, 'advanced');
    assert.equal(path[3].name, '生产实践');
    assert.equal(path[3].level, 'expert');
  });

  it('各阶段书签按 dateAdded 排序', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });
    const path = lp.generatePath('前端');

    // beginner 阶段应有 3 个入门书签
    const beginner = path[0];
    assert.equal(beginner.bookmarks.length, 3);
    // dateAdded 递增
    for (let i = 1; i < beginner.bookmarks.length; i++) {
      assert.ok(
        beginner.bookmarks[i].dateAdded >= beginner.bookmarks[i - 1].dateAdded,
        '书签应按 dateAdded 排序'
      );
    }
  });

  it('空分类返回 4 个空阶段', () => {
    const lp = new BookmarkLearningPath({ clusters: new Map() });
    const path = lp.generatePath('不存在的分类');
    assert.equal(path.length, 4);
    for (const stage of path) {
      assert.equal(stage.bookmarks.length, 0);
    }
  });

  it('不存在的分类使用 generatePath 返回空路径', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });
    const path = lp.generatePath('AI/ML');
    assert.equal(path.length, 4);
    assert.deepEqual(path.map(s => s.bookmarks.length), [0, 0, 0, 0]);
  });
});

// ==================== getAllPaths ====================

describe('BookmarkLearningPath.getAllPaths()', () => {
  it('为每个聚类分类生成路径', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });
    const allPaths = lp.getAllPaths();

    assert.ok(allPaths instanceof Map);
    assert.ok(allPaths.has('前端'));
    assert.ok(allPaths.has('后端'));
    assert.equal(allPaths.size, 2);
  });

  it('缓存结果——两次调用返回同一对象', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });
    const p1 = lp.getAllPaths();
    const p2 = lp.getAllPaths();
    assert.equal(p1, p2, '应返回缓存引用');
  });
});

// ==================== 已读/未读状态 ====================

describe('BookmarkLearningPath markAsRead / markAsUnread', () => {
  it('markAsRead 后书签标记为已读', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });
    lp.markAsRead('1');

    const path = lp.generatePath('前端');
    const bm1 = path[0].bookmarks.find(b => b.id === '1');
    assert.ok(bm1, '应找到书签 1');
    assert.equal(bm1.read, true);
  });

  it('markAsUnread 后书签标记为未读', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });
    lp.markAsRead('1');
    lp.markAsUnread('1');

    const path = lp.generatePath('前端');
    const bm1 = path[0].bookmarks.find(b => b.id === '1');
    assert.ok(bm1);
    assert.equal(bm1.read, false);
  });

  it('读写操作清除路径缓存', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });
    const p1 = lp.getAllPaths();
    lp.markAsRead('1');
    const p2 = lp.getAllPaths();
    assert.notEqual(p1, p2, '标记已读后缓存应刷新');
  });
});

// ==================== 进度统计 ====================

describe('BookmarkLearningPath.getProgress()', () => {
  it('空分类返回 0 进度', () => {
    const lp = new BookmarkLearningPath({ clusters: new Map() });
    const progress = lp.getProgress('不存在');
    assert.deepEqual(progress, { total: 0, read: 0, percent: 0 });
  });

  it('统计已读/未读比例', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });

    // 前端有 9 个书签，标记 3 个已读
    lp.markAsRead('1');
    lp.markAsRead('2');
    lp.markAsRead('3');

    const progress = lp.getProgress('前端');
    assert.equal(progress.total, 9);
    assert.equal(progress.read, 3);
    assert.equal(progress.percent, 33); // Math.round(3/9*100) = 33
  });
});

describe('BookmarkLearningPath.getOverallProgress()', () => {
  it('整体进度汇总所有分类', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });

    lp.markAsRead('1'); // 前端
    lp.markAsRead('10'); // 后端

    const overall = lp.getOverallProgress();
    assert.equal(overall.total, 12);
    assert.equal(overall.read, 2);
    assert.ok(overall.percent > 0 && overall.percent < 100);
    assert.ok(overall.byCategory.has('前端'));
    assert.ok(overall.byCategory.has('后端'));
  });

  it('无书签时返回 0 进度', () => {
    const lp = new BookmarkLearningPath({ clusters: new Map() });
    const overall = lp.getOverallProgress();
    assert.equal(overall.total, 0);
    assert.equal(overall.read, 0);
    assert.equal(overall.percent, 0);
  });
});

// ==================== 多领域路径 ====================

describe('多领域路径生成', () => {
  it('前端和后端分别生成独立路径', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });

    const frontPath = lp.generatePath('前端');
    const backPath = lp.generatePath('后端');

    // 前端应有 9 个书签分布在不同阶段
    const frontTotal = frontPath.reduce((s, st) => s + st.bookmarks.length, 0);
    assert.equal(frontTotal, 9);

    // 后端应有 3 个书签
    const backTotal = backPath.reduce((s, st) => s + st.bookmarks.length, 0);
    assert.equal(backTotal, 3);

    // 阶段结构一致
    assert.equal(frontPath.length, backPath.length);
  });

  it('多领域进度独立统计', () => {
    const { clusters } = makeFixture();
    const lp = new BookmarkLearningPath({ clusters });

    lp.markAsRead('1'); // 前端
    lp.markAsRead('4'); // 前端
    lp.markAsRead('10'); // 后端

    const frontProg = lp.getProgress('前端');
    const backProg = lp.getProgress('后端');

    assert.equal(frontProg.read, 2);
    assert.equal(backProg.read, 1);

    // 互不影响
    assert.equal(frontProg.total, 9);
    assert.equal(backProg.total, 3);
  });
});
