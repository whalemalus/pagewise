/**
 * Unit Tests — lib/i18n-detector.js
 * 多语言支持增强 — 英文文档中文问答优化
 *
 * 使用 node:test (ES Modules)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLanguage,
  detectQuestionLanguage,
  determineResponseLanguage,
  buildMultilingualPrompt,
  stripCodeBlocks,
  LANGUAGE_CODES
} from '../lib/i18n-detector.js';

// ==================== detectLanguage ====================

describe('detectLanguage', () => {

  it('应该检测纯中文文本', () => {
    const result = detectLanguage('这是一个测试文本，用于检测中文语言识别能力。');
    assert.equal(result, 'zh');
  });

  it('应该检测纯英文文本', () => {
    const result = detectLanguage('This is a test text for English language detection. It should be identified correctly.');
    assert.equal(result, 'en');
  });

  it('应该检测日文文本（含平假名）', () => {
    const result = detectLanguage('これは日本語のテキストです。言語検出テストのために使用されます。');
    assert.equal(result, 'ja');
  });

  it('应该检测日文文本（含片假名）', () => {
    const result = detectLanguage('テストメッセージです。カタカナで書かれています。');
    assert.equal(result, 'ja');
  });

  it('应该检测韩文文本', () => {
    const result = detectLanguage('이것은 한국어 텍스트입니다. 언어 감지를 위한 테스트입니다.');
    assert.equal(result, 'ko');
  });

  it('应该检测俄文文本', () => {
    const result = detectLanguage('Это тестовый текст на русском языке для проверки определения языка.');
    assert.equal(result, 'ru');
  });

  it('应该检测阿拉伯文文本', () => {
    const result = detectLanguage('هذا نص اختبار باللغة العربية لاختبار كشف اللغة.');
    assert.equal(result, 'ar');
  });

  it('空文本应该返回 other', () => {
    assert.equal(detectLanguage(''), 'other');
  });

  it('null 输入应该返回 other', () => {
    assert.equal(detectLanguage(null), 'other');
  });

  it('undefined 输入应该返回 other', () => {
    assert.equal(detectLanguage(undefined), 'other');
  });

  it('纯数字应该返回 other', () => {
    assert.equal(detectLanguage('1234567890'), 'other');
  });

  it('混合中文英文（中文为主）应该返回 zh', () => {
    const text = '这是一段中文内容，其中包含了一些English words，但是中文字符占多数。还有更多的中文文本用于确保比率足够高。';
    assert.equal(detectLanguage(text), 'zh');
  });

  it('纯代码内容（无围栏）被检测为英文（合理行为）', () => {
    const code = 'function hello() { return "world"; }\nconst x = 1 + 2;\nconsole.log(x);';
    // 不含围栏代码块时，英文关键字会被识别为英文（合理行为）
    assert.equal(detectLanguage(code), 'en');
  });

  it('围栏代码块内的内容不影响语言检测', () => {
    const text = '```\nfunction hello() { return "world"; }\n```\n```python\ndef test(): pass\n```';
    // 只有代码块没有说明文字 → 移除后为空 → other
    assert.equal(detectLanguage(text), 'other');
  });

  it('应该处理非常短的文本', () => {
    assert.equal(detectLanguage('你好'), 'zh');
    assert.equal(detectLanguage('Hi'), 'en');
  });
});

// ==================== stripCodeBlocks ====================

describe('stripCodeBlocks', () => {

  it('应该移除围栏代码块', () => {
    const text = '这是说明文字\n```javascript\nfunction test() {}\n```\n后续文字';
    const result = stripCodeBlocks(text);
    assert.ok(!result.includes('function'));
    assert.ok(result.includes('这是说明文字'));
    assert.ok(result.includes('后续文字'));
  });

  it('应该移除多个代码块', () => {
    const text = '开头\n```\ncode1\n```\n中间\n```python\ncode2\n```\n结尾';
    const result = stripCodeBlocks(text);
    assert.ok(!result.includes('code1'));
    assert.ok(!result.includes('code2'));
    assert.ok(result.includes('开头'));
    assert.ok(result.includes('中间'));
    assert.ok(result.includes('结尾'));
  });

  it('没有代码块时返回原文', () => {
    const text = '这是纯文本，没有代码块。';
    assert.equal(stripCodeBlocks(text), text);
  });

  it('null/undefined 输入返回空字符串', () => {
    assert.equal(stripCodeBlocks(null), '');
    assert.equal(stripCodeBlocks(undefined), '');
  });
});

// ==================== detectQuestionLanguage ====================

describe('detectQuestionLanguage', () => {

  it('应该检测中文问题', () => {
    assert.equal(detectQuestionLanguage('这段代码是什么意思？'), 'zh');
  });

  it('应该检测英文问题', () => {
    assert.equal(detectQuestionLanguage('What does this code mean?'), 'en');
  });

  it('应该检测日文问题', () => {
    assert.equal(detectQuestionLanguage('このコードはどういう意味ですか？'), 'ja');
  });

  it('混合中英文问题（中文为主）应该返回 zh', () => {
    assert.equal(detectQuestionLanguage('这个 API 的 response 格式是什么？'), 'zh');
  });

  it('空问题应该返回 null', () => {
    assert.equal(detectQuestionLanguage(''), null);
  });

  it('null 输入应该返回 null', () => {
    assert.equal(detectQuestionLanguage(null), null);
  });
});

// ==================== determineResponseLanguage ====================

describe('determineResponseLanguage', () => {

  it('英文页面 + 中文问题 → zh', () => {
    const result = determineResponseLanguage('en', 'zh');
    assert.equal(result, 'zh');
  });

  it('英文页面 + 英文问题 → en', () => {
    const result = determineResponseLanguage('en', 'en');
    assert.equal(result, 'en');
  });

  it('中文页面 + 中文问题 → zh', () => {
    const result = determineResponseLanguage('zh', 'zh');
    assert.equal(result, 'zh');
  });

  it('中文页面 + 英文问题 → en', () => {
    const result = determineResponseLanguage('zh', 'en');
    assert.equal(result, 'en');
  });

  it('日文页面 + 中文问题 → zh', () => {
    const result = determineResponseLanguage('ja', 'zh');
    assert.equal(result, 'zh');
  });

  it('问题语言优先于页面语言', () => {
    const result = determineResponseLanguage('en', 'ko');
    assert.equal(result, 'ko');
  });

  it('无问题语言时，使用页面语言', () => {
    const result = determineResponseLanguage('en', null);
    assert.equal(result, 'en');
  });

  it('无问题语言且无页面语言时，使用首选语言', () => {
    const result = determineResponseLanguage(null, null, 'zh');
    assert.equal(result, 'zh');
  });

  it('首选语言设置可覆盖一切', () => {
    const result = determineResponseLanguage('en', 'en', 'zh');
    assert.equal(result, 'zh');
  });

  it('首选语言为 null 时不覆盖', () => {
    const result = determineResponseLanguage('en', 'zh', null);
    assert.equal(result, 'zh');
  });

  it('韩文页面 + 日文问题 → ja', () => {
    const result = determineResponseLanguage('ko', 'ja');
    assert.equal(result, 'ja');
  });

  it('默认首选语言为 zh', () => {
    const result = determineResponseLanguage('other', null, 'zh');
    assert.equal(result, 'zh');
  });
});

// ==================== buildMultilingualPrompt ====================

describe('buildMultilingualPrompt', () => {

  it('英文页面 + 中文问题 → 包含中英双语指令', () => {
    const prompt = buildMultilingualPrompt('en', 'zh', 'zh');
    assert.ok(prompt.includes('中文'), '应该提到中文');
    assert.ok(prompt.includes('English') || prompt.includes('英文'), '应该提到英文/English');
    assert.ok(prompt.includes('术语'), '应该提到术语翻译');
  });

  it('英文页面 + 英文问题 → 英文回答指令', () => {
    const prompt = buildMultilingualPrompt('en', 'en', 'en');
    assert.ok(prompt.includes('English') || prompt.includes('英文'), '应该提到英文');
  });

  it('中文页面 + 中文问题 → 简单中文指令', () => {
    const prompt = buildMultilingualPrompt('zh', 'zh', 'zh');
    assert.ok(prompt.includes('中文'), '应该提到中文');
  });

  it('日文页面 + 中文问题 → 包含日中双语指令', () => {
    const prompt = buildMultilingualPrompt('ja', 'zh', 'zh');
    assert.ok(prompt.includes('中文'), '应该提到中文');
    assert.ok(prompt.includes('日') || prompt.includes('Japanese'), '应该提到日文');
  });

  it('返回字符串类型', () => {
    const prompt = buildMultilingualPrompt('en', 'zh', 'zh');
    assert.equal(typeof prompt, 'string');
  });

  it('prompt 长度合理', () => {
    const prompt = buildMultilingualPrompt('en', 'zh', 'zh');
    assert.ok(prompt.length > 20, 'prompt 应该有实质内容');
    assert.ok(prompt.length < 2000, 'prompt 不应过长');
  });

  it('英文页面 + 中文问题 prompt 包含关键词汇标注说明', () => {
    const prompt = buildMultilingualPrompt('en', 'zh', 'zh');
    // 应该提到关键词的双语标注策略
    assert.ok(
      prompt.includes('术语') || prompt.includes('词汇') || prompt.includes('关键') || prompt.includes('原文'),
      '应该有术语/关键词标注策略'
    );
  });

  it('同语言页面和问题 → 不产生冗余指令', () => {
    const prompt = buildMultilingualPrompt('zh', 'zh', 'zh');
    // 不应该有大量双语指令
    assert.ok(prompt.length < 300, '同语言场景不应有冗长指令');
  });
});

// ==================== LANGUAGE_CODES ====================

describe('LANGUAGE_CODES', () => {

  it('应该包含所有已支持的语言代码', () => {
    assert.ok(LANGUAGE_CODES.ZH === 'zh');
    assert.ok(LANGUAGE_CODES.EN === 'en');
    assert.ok(LANGUAGE_CODES.JA === 'ja');
    assert.ok(LANGUAGE_CODES.KO === 'ko');
    assert.ok(LANGUAGE_CODES.RU === 'ru');
    assert.ok(LANGUAGE_CODES.AR === 'ar');
    assert.ok(LANGUAGE_CODES.OTHER === 'other');
  });
});

// ==================== 集成场景测试 ====================

describe('集成场景', () => {

  it('完整流程：英文文档 + 中文提问', () => {
    const pageText = `
      React is a JavaScript library for building user interfaces.
      It lets you compose complex UIs from small and isolated pieces of code called "components".
      React has been designed from the start for gradual adoption.
      You can use as little or as much React as you need.
      Whether you want to get a taste of React, add some interactivity to an HTML page,
      or start a complex React-powered app, the links in this section will help you get started.
    `;
    const question = 'React 的组件化是什么意思？';

    const pageLang = detectLanguage(pageText);
    const questionLang = detectQuestionLanguage(question);
    const responseLang = determineResponseLanguage(pageLang, questionLang);
    const prompt = buildMultilingualPrompt(pageLang, questionLang, responseLang);

    assert.equal(pageLang, 'en');
    assert.equal(questionLang, 'zh');
    assert.equal(responseLang, 'zh');
    assert.ok(prompt.includes('中文'), '应该指示用中文回答');
    assert.ok(prompt.length > 20);
  });

  it('完整流程：中文文档 + 英文提问', () => {
    const pageText = 'Vue.js 是一个渐进式 JavaScript 框架。它的核心库只关注视图层，非常容易上手。Vue 的设计哲学是自底向上增量开发的设计。';
    const question = 'What is the design philosophy of Vue?';

    const pageLang = detectLanguage(pageText);
    const questionLang = detectQuestionLanguage(question);
    const responseLang = determineResponseLanguage(pageLang, questionLang);
    const prompt = buildMultilingualPrompt(pageLang, questionLang, responseLang);

    assert.equal(pageLang, 'zh');
    assert.equal(questionLang, 'en');
    assert.equal(responseLang, 'en');
    assert.ok(prompt.includes('English') || prompt.includes('英文'));
  });

  it('完整流程：英文文档 + 英文提问', () => {
    const pageText = 'Node.js is an open-source, cross-platform JavaScript runtime environment. It executes JavaScript code outside a web browser. It allows developers to use JavaScript for server-side scripting.';
    const question = 'What is Node.js used for?';

    const pageLang = detectLanguage(pageText);
    const questionLang = detectQuestionLanguage(question);
    const responseLang = determineResponseLanguage(pageLang, questionLang);
    const prompt = buildMultilingualPrompt(pageLang, questionLang, responseLang);

    assert.equal(pageLang, 'en');
    assert.equal(questionLang, 'en');
    assert.equal(responseLang, 'en');
  });

  it('完整流程：日文文档 + 中文提问', () => {
    const pageText = 'Reactは、Facebookが開発した、ユーザーインターフェースを構築するためのJavaScriptライブラリです。宣言的なビューを作成することで、効率的かつ予測可能な方法でアプリケーションを構築できます。';
    const question = 'React 的核心特点是什么？';

    const pageLang = detectLanguage(pageText);
    const questionLang = detectQuestionLanguage(question);
    const responseLang = determineResponseLanguage(pageLang, questionLang);
    const prompt = buildMultilingualPrompt(pageLang, questionLang, responseLang);

    assert.equal(pageLang, 'ja');
    assert.equal(questionLang, 'zh');
    assert.equal(responseLang, 'zh');
    assert.ok(prompt.includes('中文'));
  });

  it('带代码块的英文文档应正确检测语言', () => {
    const text = `# Getting Started with React

React is a JavaScript library for building user interfaces.

\`\`\`javascript
import React from 'react';
function App() {
  return <h1>Hello World</h1>;
}
\`\`\`

React components let you split the UI into independent, reusable pieces.
They accept inputs called props and return React elements.`;

    const lang = detectLanguage(text);
    assert.equal(lang, 'en');
  });

  it('用户设置首选语言覆盖', () => {
    const pageLang = 'en';
    const questionLang = 'en';
    const preferredLang = 'zh';

    const responseLang = determineResponseLanguage(pageLang, questionLang, preferredLang);
    assert.equal(responseLang, 'zh', '首选语言应覆盖问题语言');
  });
});
