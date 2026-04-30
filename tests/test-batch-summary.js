/**
 * Tests for Batch Summary module (迭代 #13)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitIntoSections,
  compressSections,
  buildBatchSummaryPrompt,
  parseBatchSummaryResponse,
  estimateReadingTime,
  summarizeContent
} from '../lib/batch-summary.js';

// ==================== splitIntoSections ====================

describe('splitIntoSections', () => {
  it('splits by markdown headings (# / ## / ###)', () => {
    const content = [
      '# 第一章 介绍',
      '',
      '这是第一章的内容，需要一些文字来确保分段正确。',
      '',
      '## 1.1 背景',
      '',
      '背景内容在这里，包含足够的文字。',
      '',
      '## 1.2 目标',
      '',
      '目标内容在这里，同样需要足够长。',
      '',
      '# 第二章 方法',
      '',
      '方法论内容，描述具体的技术方案。'
    ].join('\n');

    const sections = splitIntoSections(content, { strategy: 'heading' });
    assert.ok(sections.length >= 3, `Expected >= 3 sections, got ${sections.length}`);
    assert.equal(sections[0].title, '第一章 介绍');
    assert.ok(sections[0].level >= 1);
    assert.ok(sections[0].content.includes('这是第一章'));
  });

  it('splits by paragraphs (double newline)', () => {
    const content = [
      '第一段内容，足够长以超过最小字符限制，这里我们添加更多文字来确保。',
      '',
      '第二段内容，同样需要足够长，避免被合并到其他段落中去。这样就满足了。',
      '',
      '第三段也是类似，我们需要足够的文字来保证分段逻辑正确运行。'
    ].join('\n');

    const sections = splitIntoSections(content, { strategy: 'paragraph', minSectionChars: 10 });
    assert.ok(sections.length >= 2, `Expected >= 2 sections, got ${sections.length}`);
  });

  it('splits by fixed character count', () => {
    const content = '这是一段很长的文字。'.repeat(50); // ~500 chars
    const sections = splitIntoSections(content, { strategy: 'fixed', maxSectionChars: 100 });
    assert.ok(sections.length >= 4, `Expected >= 4 sections, got ${sections.length}`);
    for (const s of sections) {
      assert.ok(s.charCount <= 120, `Section too long: ${s.charCount}`);
    }
  });

  it('returns empty array for empty content', () => {
    const sections = splitIntoSections('', { strategy: 'heading' });
    assert.equal(sections.length, 0);
  });

  it('returns empty array for null/undefined content', () => {
    assert.equal(splitIntoSections(null).length, 0);
    assert.equal(splitIntoSections(undefined).length, 0);
  });

  it('returns single section for short content with no headings', () => {
    const content = '这是一段简短的文本，没有标题。';
    const sections = splitIntoSections(content, { strategy: 'heading' });
    assert.equal(sections.length, 1);
    assert.equal(sections[0].id, 0);
    assert.equal(sections[0].title, '(无标题)');
    assert.ok(sections[0].content.includes('简短的文本'));
  });

  it('handles multi-level headings (h1 + h2 + h3)', () => {
    const content = [
      '# 大标题',
      '',
      '大标题下的前言内容，需要超过最小字符数限制以确保不被合并。',
      '',
      '## 中标题',
      '',
      '中标题的内容，同样需要足够的文字。',
      '',
      '### 小标题',
      '',
      '小标题的详细内容部分。',
      '',
      '## 另一个中标题',
      '',
      '更多内容写在这里。'
    ].join('\n');

    const sections = splitIntoSections(content, { strategy: 'heading' });
    assert.ok(sections.length >= 3, `Expected >= 3 sections, got ${sections.length}`);

    // 检查层级
    const levels = sections.map(s => s.level);
    assert.ok(levels.some(l => l === 1), 'Should have h1 level');
    assert.ok(levels.some(l => l === 2), 'Should have h2 level');
  });

  it('merges sections shorter than minSectionChars', () => {
    const content = [
      '# 标题一',
      '',
      '短。',
      '',
      '# 标题二',
      '',
      '这也非常短。',
      '',
      '# 标题三',
      '',
      '这个段落足够长，超过了最小字符数的要求，所以应该独立成为一个段落。这里有更多内容。'
    ].join('\n');

    const sections = splitIntoSections(content, {
      strategy: 'heading',
      minSectionChars: 30
    });
    assert.ok(sections.length < 3, `Expected < 3 sections (merging), got ${sections.length}`);
  });

  it('each section has required fields', () => {
    const content = '# 标题\n\n内容文本，需要超过五十字符以确保不被合并到其他段落中去。';
    const sections = splitIntoSections(content, { strategy: 'heading' });
    for (const s of sections) {
      assert.equal(typeof s.id, 'number');
      assert.equal(typeof s.title, 'string');
      assert.equal(typeof s.content, 'string');
      assert.equal(typeof s.level, 'number');
      assert.equal(typeof s.charCount, 'number');
    }
  });

  it('truncates very long sections to maxSectionChars', () => {
    const longContent = '很长的内容。'.repeat(500);
    const content = '# 标题\n\n' + longContent;
    const sections = splitIntoSections(content, {
      strategy: 'heading',
      maxSectionChars: 500
    });
    for (const s of sections) {
      assert.ok(s.charCount <= 600, `Section too long: ${s.charCount}`);
    }
  });

  it('handles HTML headings when content has h1-h3 tags', () => {
    const content = '<h1>标题一</h1>\n<p>内容一，需要超过最小字符限制确保不被合并到其他段落。</p>\n<h2>标题二</h2>\n<p>内容二，同样需要足够长的文字来通过最小字符限制。</p>';
    const sections = splitIntoSections(content, { strategy: 'heading' });
    assert.ok(sections.length >= 2, `Expected >= 2 sections for HTML headings, got ${sections.length}`);
  });
});

// ==================== compressSections ====================

describe('compressSections', () => {
  it('compresses sections to fit within maxTotalChars', () => {
    const sections = [
      { id: 0, title: 'A', content: 'a'.repeat(3000), level: 1, charCount: 3000 },
      { id: 1, title: 'B', content: 'b'.repeat(3000), level: 1, charCount: 3000 },
      { id: 2, title: 'C', content: 'c'.repeat(3000), level: 1, charCount: 3000 },
    ];
    const compressed = compressSections(sections, 3000);
    const total = compressed.reduce((sum, s) => sum + s.charCount, 0);
    assert.ok(total <= 3200, `Total ${total} exceeds limit`);
    assert.equal(compressed.length, 3, 'All sections should be preserved');
  });

  it('does not compress when within limit', () => {
    const sections = [
      { id: 0, title: 'A', content: 'short text', level: 1, charCount: 10 },
      { id: 1, title: 'B', content: 'another short', level: 1, charCount: 13 },
    ];
    const compressed = compressSections(sections, 5000);
    assert.equal(compressed.length, 2);
    assert.equal(compressed[0].content, 'short text');
    assert.equal(compressed[1].content, 'another short');
  });

  it('returns empty array for empty input', () => {
    const compressed = compressSections([], 3000);
    assert.equal(compressed.length, 0);
  });

  it('returns empty array for null input', () => {
    const compressed = compressSections(null, 3000);
    assert.equal(compressed.length, 0);
  });

  it('preserves at least 100 chars per section', () => {
    const sections = [
      { id: 0, title: 'A', content: 'x'.repeat(5000), level: 1, charCount: 5000 },
      { id: 1, title: 'B', content: 'y'.repeat(5000), level: 1, charCount: 5000 },
    ];
    const compressed = compressSections(sections, 500);
    for (const s of compressed) {
      assert.ok(s.charCount >= 100, `Section ${s.id} too short: ${s.charCount}`);
    }
  });

  it('adds compression markers when text is truncated', () => {
    const sections = [
      { id: 0, title: 'A', content: '开始内容。' + '中'.repeat(2000) + '。结束内容。', level: 1, charCount: 2020 },
    ];
    const compressed = compressSections(sections, 500);
    assert.ok(
      compressed[0].content.includes('…') || compressed[0].content.length < 2020,
      'Should truncate or add marker'
    );
  });
});

// ==================== buildBatchSummaryPrompt ====================

describe('buildBatchSummaryPrompt', () => {
  it('builds prompt with section IDs and titles', () => {
    const sections = [
      { id: 0, title: '引言', content: '这是引言内容。', level: 1, charCount: 7 },
      { id: 1, title: '正文', content: '这是正文内容。', level: 1, charCount: 7 },
    ];
    const prompt = buildBatchSummaryPrompt(sections);
    assert.ok(prompt.includes('[1]'), 'Should include section number [1]');
    assert.ok(prompt.includes('[2]'), 'Should include section number [2]');
    assert.ok(prompt.includes('引言'), 'Should include first section title');
    assert.ok(prompt.includes('正文'), 'Should include second section title');
  });

  it('includes section content in prompt', () => {
    const sections = [
      { id: 0, title: '标题', content: '独特的测试内容ABC', level: 1, charCount: 9 },
    ];
    const prompt = buildBatchSummaryPrompt(sections);
    assert.ok(prompt.includes('独特的测试内容ABC'));
  });

  it('includes output format instructions', () => {
    const sections = [
      { id: 0, title: 'T', content: 'C', level: 1, charCount: 1 },
    ];
    const prompt = buildBatchSummaryPrompt(sections);
    assert.ok(prompt.includes('概述') || prompt.includes('摘要'));
  });

  it('returns empty string for empty sections', () => {
    const prompt = buildBatchSummaryPrompt([]);
    assert.equal(prompt, '');
  });

  it('returns empty string for null sections', () => {
    const prompt = buildBatchSummaryPrompt(null);
    assert.equal(prompt, '');
  });

  it('handles single section', () => {
    const sections = [
      { id: 0, title: '唯一段', content: '内容。', level: 1, charCount: 3 },
    ];
    const prompt = buildBatchSummaryPrompt(sections);
    assert.ok(prompt.includes('[1]'));
    assert.ok(prompt.includes('唯一段'));
  });
});

// ==================== parseBatchSummaryResponse ====================

describe('parseBatchSummaryResponse', () => {
  it('parses structured response with overview and sections', () => {
    const aiText = `## 全文概述
本文介绍了批量摘要功能的设计和实现。

## 逐段摘要

### [1] 引言
介绍了功能背景。
📌 核心要点：功能背景和动机
⚠️ 重要性：高

### [2] 实现
描述了技术实现细节。
📌 核心要点：技术方案
⚠️ 重要性：中

## 关键要点
- 批量摘要提高阅读效率
- 智能分段是核心
- 压缩策略保证不超 Token`;

    const sections = [
      { id: 0, title: '引言', content: '', level: 1, charCount: 0 },
      { id: 1, title: '实现', content: '', level: 1, charCount: 0 },
    ];

    const result = parseBatchSummaryResponse(aiText, sections);
    assert.ok(result.overview.includes('批量摘要'));
    assert.equal(result.sectionSummaries.length, 2);
    assert.equal(result.sectionSummaries[0].sectionId, 0);
    assert.equal(result.sectionSummaries[0].importance, 'high');
    assert.ok(result.keyPoints.length >= 2);
  });

  it('handles unstructured response as fallback', () => {
    const aiText = '这是一段非结构化的摘要文本，AI 没有按照指定格式返回。包含了关于页面内容的整体概述。';

    const sections = [
      { id: 0, title: '段落', content: '', level: 1, charCount: 0 },
    ];

    const result = parseBatchSummaryResponse(aiText, sections);
    // 即使非结构化也应产生结果，不崩溃
    assert.ok(typeof result.overview === 'string');
    assert.ok(Array.isArray(result.sectionSummaries));
    assert.ok(Array.isArray(result.keyPoints));
  });

  it('handles empty response', () => {
    const result = parseBatchSummaryResponse('', []);
    assert.equal(result.overview, '');
    assert.equal(result.sectionSummaries.length, 0);
    assert.equal(result.keyPoints.length, 0);
  });

  it('handles null response', () => {
    const result = parseBatchSummaryResponse(null, []);
    assert.equal(result.overview, '');
  });

  it('parses key points list', () => {
    const aiText = `## 全文概述
概述内容。

## 关键要点
- 第一个要点
- 第二个要点
- 第三个要点`;

    const result = parseBatchSummaryResponse(aiText, []);
    assert.ok(result.keyPoints.length >= 2, `Expected >= 2 key points, got ${result.keyPoints.length}`);
    assert.ok(result.keyPoints.some(p => p.includes('第一个')));
  });

  it('extracts importance levels', () => {
    const aiText = `## 逐段摘要
### [1] 段A
摘要A
⚠️ 重要性：高

### [2] 段B
摘要B
⚠️ 重要性：低`;

    const sections = [
      { id: 0, title: '段A', content: '', level: 1, charCount: 0 },
      { id: 1, title: '段B', content: '', level: 1, charCount: 0 },
    ];

    const result = parseBatchSummaryResponse(aiText, sections);
    if (result.sectionSummaries.length >= 2) {
      const high = result.sectionSummaries.find(s => s.importance === 'high');
      const low = result.sectionSummaries.find(s => s.importance === 'low');
      assert.ok(high, 'Should find high importance section');
      assert.ok(low, 'Should find low importance section');
    }
  });
});

// ==================== estimateReadingTime ====================

describe('estimateReadingTime', () => {
  it('estimates time for Chinese text', () => {
    const text = '中'.repeat(800);
    const result = estimateReadingTime(text);
    assert.ok(result.minutes >= 1 && result.minutes <= 3);
    assert.ok(result.label.includes('分钟'));
  });

  it('estimates time for English text', () => {
    const words = Array(400).fill('word').join(' ');
    const result = estimateReadingTime(words);
    assert.ok(result.minutes >= 1 && result.minutes <= 3);
  });

  it('returns "< 1 分钟" for very short text', () => {
    const result = estimateReadingTime('短');
    assert.ok(result.minutes <= 1);
    assert.ok(result.label.includes('1'));
  });

  it('returns 0 for empty text', () => {
    const result = estimateReadingTime('');
    assert.equal(result.minutes, 0);
    assert.ok(result.label.includes('1'));
  });

  it('returns 0 for null/undefined', () => {
    const result = estimateReadingTime(null);
    assert.equal(result.minutes, 0);
  });

  it('handles mixed Chinese and English text', () => {
    const text = '这是中文内容 mixed with English words and 继续中文'.repeat(10);
    const result = estimateReadingTime(text);
    assert.ok(result.minutes >= 1);
    assert.ok(result.label.includes('分钟'));
  });

  it('allows custom wpm parameter', () => {
    const text = '字'.repeat(200);
    const slow = estimateReadingTime(text, 100);
    const fast = estimateReadingTime(text, 1000);
    assert.ok(slow.minutes > fast.minutes, 'Slower WPM should give more minutes');
  });
});

// ==================== summarizeContent (integration) ====================

describe('summarizeContent', () => {
  it('performs full pipeline with mock AI client', async () => {
    const mockAI = {
      async chat(messages, options) {
        return {
          content: `## 全文概述\n这是一个测试文档的概述。

## 逐段摘要
### [1] 引言
这是引言的摘要。
📌 核心要点：介绍背景
⚠️ 重要性：高

### [2] 正文
这是正文的摘要。
📌 核心要点：详细说明
⚠️ 重要性：中

## 关键要点
- 要点一：测试成功
- 要点二：功能完整`
        };
      }
    };

    const content = '# 引言\n\n这是引言部分的内容，介绍功能背景。\n\n# 正文\n\n这是正文的详细内容，描述技术方案。';

    const result = await summarizeContent(content, mockAI);
    assert.ok(result.overview.length > 0, 'Should have overview');
    assert.ok(result.sectionSummaries.length >= 1, 'Should have section summaries');
    assert.ok(result.keyPoints.length >= 1, 'Should have key points');
    assert.ok(result.readingTime, 'Should have reading time');
    assert.ok(result.readingTime.label, 'Reading time should have label');
  });

  it('handles empty content gracefully', async () => {
    const mockAI = {
      async chat() { return { content: '' }; }
    };
    const result = await summarizeContent('', mockAI);
    assert.ok(result);
    assert.equal(result.sectionSummaries.length, 0);
  });

  it('handles AI error gracefully', async () => {
    const mockAI = {
      async chat() { throw new Error('API Error'); }
    };
    const content = '# 标题\n\n一些内容描述。';
    try {
      await summarizeContent(content, mockAI);
      assert.fail('Should throw');
    } catch (e) {
      assert.ok(e.message.includes('API Error') || e.message.includes('批量摘要'));
    }
  });

  it('respects maxChars option for compression', async () => {
    let receivedPrompt = '';
    const mockAI = {
      async chat(messages, options) {
        receivedPrompt = messages[0].content;
        return {
          content: '## 全文概述\n概述。\n\n## 关键要点\n- 要点'
        };
      }
    };

    const longContent = '# 标题\n\n' + '很长的内容。'.repeat(1000);
    await summarizeContent(longContent, mockAI, { maxChars: 1000 });
    assert.ok(receivedPrompt.length < 3000, `Prompt too long: ${receivedPrompt.length}`);
  });

  it('uses custom strategy option', async () => {
    const mockAI = {
      async chat() {
        return { content: '## 全文概述\n概述。\n\n## 关键要点\n- 要点' };
      }
    };

    const content = '段落一，需要足够长的文字来超过最小字符限制。\n\n段落二，同样需要足够的文字确保分段正确。\n\n段落三，也要达到足够的长度。';
    const result = await summarizeContent(content, mockAI, { strategy: 'paragraph' });
    assert.ok(result, 'Should work with paragraph strategy');
  });
});
