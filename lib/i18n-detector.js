/**
 * I18n Detector — 多语言检测与多语言 prompt 构建
 *
 * 功能：
 * 1. 检测文本主语言（支持 zh/en/ja/ko/ru/ar/other）
 * 2. 检测用户问题语言
 * 3. 根据页面语言 + 问题语言 + 用户设置决定最佳回答语言
 * 4. 构建精确的多语言 system prompt 片段
 *
 * 设计文档: docs/DESIGN-ITER15.md
 */

// ==================== 语言代码常量 ====================

export const LANGUAGE_CODES = {
  ZH: 'zh',
  EN: 'en',
  JA: 'ja',
  KO: 'ko',
  RU: 'ru',
  AR: 'ar',
  OTHER: 'other'
};

// ==================== Unicode 范围检测工具 ====================

/**
 * 统计文本中各 Unicode 脚本的字符数
 * @param {string} text
 * @returns {{ cjk: number, latin: number, hiragana: number, katakana: number, hangul: number, cyrillic: number, arabic: number, total: number }}
 */
function countScripts(text) {
  let cjk = 0;
  let latin = 0;
  let hiragana = 0;
  let katakana = 0;
  let hangul = 0;
  let cyrillic = 0;
  let arabic = 0;

  for (const char of text) {
    const code = char.codePointAt(0);

    // CJK 统一汉字 + 扩展 A + 兼容汉字
    if ((code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0xF900 && code <= 0xFAFF)) {
      cjk++;
      continue;
    }

    // 日文平假名
    if (code >= 0x3040 && code <= 0x309F) {
      hiragana++;
      continue;
    }

    // 日文片假名 + 片假名语音扩展
    if ((code >= 0x30A0 && code <= 0x30FF) ||
        (code >= 0x31F0 && code <= 0x31FF)) {
      katakana++;
      continue;
    }

    // 韩文音节 + Jamo
    if ((code >= 0xAC00 && code <= 0xD7AF) ||
        (code >= 0x1100 && code <= 0x11FF)) {
      hangul++;
      continue;
    }

    // 西里尔字母（俄语等）
    if (code >= 0x0400 && code <= 0x04FF) {
      cyrillic++;
      continue;
    }

    // 阿拉伯字母
    if (code >= 0x0600 && code <= 0x06FF) {
      arabic++;
      continue;
    }

    // 拉丁字母 + 扩展
    if ((code >= 0x0041 && code <= 0x024F) ||
        (code >= 0x1E00 && code <= 0x1EFF)) {
      latin++;
      continue;
    }
  }

  return { cjk, latin, hiragana, katakana, hangul, cyrillic, arabic,
    total: cjk + latin + hiragana + katakana + hangul + cyrillic + arabic };
}

/**
 * 移除围栏代码块（```...```）
 * @param {string} text
 * @returns {string}
 */
export function stripCodeBlocks(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/```[\s\S]*?```/g, '');
}

// ==================== 核心检测函数 ====================

/**
 * 检测文本的主语言
 *
 * @param {string} text - 待检测文本
 * @returns {'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar' | 'other'}
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string') return LANGUAGE_CODES.OTHER;

  // 取前 2000 字符采样，移除代码块避免干扰
  const sample = stripCodeBlocks(text).slice(0, 2000);
  if (!sample.trim()) return LANGUAGE_CODES.OTHER;

  const counts = countScripts(sample);
  if (counts.total === 0) return LANGUAGE_CODES.OTHER;

  // 日文检测（平假名或片假名占比超过阈值）
  const jpRatio = (counts.hiragana + counts.katakana) / counts.total;
  if (jpRatio >= 0.05 && counts.cjk > 0) return LANGUAGE_CODES.JA;

  // 韩文检测
  const koRatio = counts.hangul / counts.total;
  if (koRatio >= 0.3) return LANGUAGE_CODES.KO;

  // 阿拉伯文检测
  const arRatio = counts.arabic / counts.total;
  if (arRatio >= 0.3) return LANGUAGE_CODES.AR;

  // 俄文检测
  const ruRatio = counts.cyrillic / counts.total;
  if (ruRatio >= 0.3) return LANGUAGE_CODES.RU;

  // 中文检测（CJK 字符占比）
  const zhRatio = counts.cjk / counts.total;
  if (zhRatio >= 0.3) return LANGUAGE_CODES.ZH;

  // 英文检测（拉丁字母占比）
  const enRatio = counts.latin / counts.total;
  if (enRatio >= 0.5) return LANGUAGE_CODES.EN;

  return LANGUAGE_CODES.OTHER;
}

/**
 * 检测用户问题语言
 * 短文本检测，返回主语言或 null（无法判断时）
 *
 * @param {string} question - 用户问题
 * @returns {'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar' | null}
 */
export function detectQuestionLanguage(question) {
  if (!question || typeof question !== 'string') return null;

  const trimmed = question.trim();
  if (!trimmed) return null;

  const lang = detectLanguage(trimmed);
  if (lang === LANGUAGE_CODES.OTHER) return null;
  return lang;
}

// ==================== 回答语言决策 ====================

/**
 * 决定最佳回答语言
 *
 * 优先级：
 * 1. 用户设置的首选语言（如果指定）
 * 2. 用户问题语言（如果检测到）
 * 3. 页面语言（如果检测到）
 * 4. 默认 'zh'
 *
 * @param {'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar' | null} pageLang - 页面语言
 * @param {'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar' | null} questionLang - 问题语言
 * @param {'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar' | null} preferredLang - 用户首选语言
 * @returns {'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar'}
 */
export function determineResponseLanguage(pageLang, questionLang, preferredLang = null) {
  // 用户设置的首选语言优先级最高
  if (preferredLang && preferredLang !== 'auto') {
    return preferredLang;
  }

  // 问题语言次之（用户用什么语言提问，期望什么语言回答）
  if (questionLang) {
    return questionLang;
  }

  // 页面语言
  if (pageLang && pageLang !== LANGUAGE_CODES.OTHER) {
    return pageLang;
  }

  // 默认中文
  return 'zh';
}

// ==================== Prompt 构建 ====================

/**
 * 语言代码 → 显示名称映射
 */
const LANG_NAMES = {
  zh: { zh: '中文', en: 'Chinese' },
  en: { zh: '英文', en: 'English' },
  ja: { zh: '日文', en: 'Japanese' },
  ko: { zh: '韩文', en: 'Korean' },
  ru: { zh: '俄文', en: 'Russian' },
  ar: { zh: '阿拉伯文', en: 'Arabic' },
  other: { zh: '其他语言', en: 'other languages' }
};

/**
 * 获取语言的中文名称
 * @param {string} lang
 * @returns {string}
 */
function getLangLabel(lang) {
  return LANG_NAMES[lang]?.zh || LANG_NAMES.other.zh;
}

/**
 * 构建多语言 system prompt 片段
 *
 * 根据页面语言、问题语言、回答语言的组合，生成精确的指令：
 * - 同语言场景：简单语言指令
 * - 跨语言场景：包含术语保留、关键概念双语标注等策略
 *
 * @param {'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar'} pageLang - 页面内容语言
 * @param {'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar' | null} questionLang - 用户问题语言
 * @param {'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar'} responseLang - 决定的回答语言
 * @returns {string} prompt 片段
 */
export function buildMultilingualPrompt(pageLang, questionLang, responseLang) {
  const pageLabel = getLangLabel(pageLang);
  const responseLabel = getLangLabel(responseLang);

  // 场景 1：页面语言和回答语言相同 → 简单指令
  if (pageLang === responseLang) {
    return `\n页面语言：${pageLabel}。请使用${responseLabel}回答用户问题。\n`;
  }

  // 场景 2：跨语言回答 → 详细策略
  const pageLangEn = LANG_NAMES[pageLang]?.en || pageLang;
  const responseLangEn = LANG_NAMES[responseLang]?.en || responseLang;

  let prompt = `\n## 多语言回答策略\n`;
  prompt += `- 页面内容语言：${pageLabel}（${pageLangEn}）\n`;
  prompt += `- 回答语言：${responseLabel}（${responseLangEn}）\n`;
  prompt += `\n要求：\n`;
  prompt += `1. 使用${responseLabel}回答用户问题\n`;

  if (responseLang === 'zh') {
    prompt += `2. 页面中的英文专业术语首次出现时，用「中文（English）」格式双语标注\n`;
    prompt += `3. 代码、变量名、函数名、API 名称等保持原文不翻译\n`;
    prompt += `4. 关键概念如有公认的中英文对照，简要注明\n`;
  } else if (responseLang === 'ja') {
    prompt += `2. 页面中的英文专业术语首次出现时，用「日本語（English）」格式标注\n`;
    prompt += `3. コード、変数名、関数名、API名は原文のまま保持\n`;
  } else if (responseLang === 'en' && (pageLang === 'zh' || pageLang === 'ja' || pageLang === 'ko')) {
    prompt += `2. For technical terms from the source text, keep the original term in parentheses\n`;
    prompt += `3. Code, variable names, function names should remain unchanged\n`;
  } else {
    prompt += `2. Keep original technical terms from the source language alongside translated versions\n`;
    prompt += `3. Code and identifiers should not be translated\n`;
  }

  prompt += `\n`;
  return prompt;
}
