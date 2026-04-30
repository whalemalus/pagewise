/**
 * Cost Estimator — API 费用估算模块
 *
 * 基于各模型的公开定价表，估算每次 API 调用的费用。
 * 价格单位: USD per 1M tokens（百万 token）
 *
 * @module cost-estimator
 */

/** USD → CNY 汇率（估算） */
export const USD_TO_CNY = 7.2;

/**
 * 模型定价表
 * key: 模型 ID（小写）
 * value: { input, output } — 每 1M tokens 的 USD 价格
 */
export const MODEL_PRICING = {
  // OpenAI
  'gpt-4o':            { input: 2.50,  output: 10.00, family: 'openai' },
  'gpt-4o-mini':       { input: 0.15,  output: 0.60,  family: 'openai' },
  'gpt-4-turbo':       { input: 10.00, output: 30.00, family: 'openai' },
  'gpt-4':             { input: 30.00, output: 60.00, family: 'openai' },
  'gpt-3.5-turbo':     { input: 0.50,  output: 1.50,  family: 'openai' },
  // Claude
  'claude-sonnet-4-6':    { input: 3.00,  output: 15.00, family: 'claude' },
  'claude-opus-4-6':      { input: 15.00, output: 75.00, family: 'claude' },
  'claude-haiku-4-5':     { input: 0.80,  output: 4.00,  family: 'claude' },
  'claude-3-5-sonnet':    { input: 3.00,  output: 15.00, family: 'claude' },
  'claude-3-5-haiku':     { input: 0.80,  output: 4.00,  family: 'claude' },
  'claude-3-opus':        { input: 15.00, output: 75.00, family: 'claude' },
  // DeepSeek
  'deepseek-chat':     { input: 0.27,  output: 1.10,  family: 'deepseek' },
  'deepseek-coder':    { input: 0.27,  output: 1.10,  family: 'deepseek' },
  'deepseek-reasoner': { input: 0.55,  output: 2.19,  family: 'deepseek' },
  // Ollama / 本地（免费，但展示为 $0 以区别于未知模型）
  'llama3':            { input: 0,     output: 0,     family: 'ollama' },
  'codellama':         { input: 0,     output: 0,     family: 'ollama' },
  'mistral':           { input: 0,     output: 0,     family: 'ollama' },
  'qwen2':             { input: 0,     output: 0,     family: 'ollama' },
};

/**
 * 未知模型的默认定价（中等偏保守估计）
 * 当用户使用不在此表中的模型时，采用此价格估算
 */
const DEFAULT_PRICING = { input: 3.00, output: 15.00, family: 'unknown' };

/**
 * 查找最匹配的模型定价
 * 支持精确匹配、前缀匹配（如 gpt-4o-2024-08-06 → gpt-4o）
 *
 * @param {string} modelId - 模型 ID
 * @returns {string|null} 匹配到的定价表 key，或 null
 */
export function findClosestModel(modelId) {
  if (!modelId || typeof modelId !== 'string') return null;

  const id = modelId.toLowerCase().trim();

  // 精确匹配
  if (MODEL_PRICING[id]) return id;

  // 前缀匹配（去掉日期后缀等）
  // 按 key 长度降序排序，优先匹配更长的前缀
  const keys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (id.startsWith(key)) return key;
  }

  // 子串匹配：如果 modelId 包含定价表中的 key
  for (const key of keys) {
    if (id.includes(key)) return key;
  }

  return null;
}

/**
 * 获取模型定价信息
 * @param {string} modelId - 模型 ID
 * @returns {{ input: number, output: number, family: string, modelName: string }}
 */
export function getModelPricing(modelId) {
  const matchedKey = findClosestModel(modelId);
  if (matchedKey) {
    const p = MODEL_PRICING[matchedKey];
    return { input: p.input, output: p.output, family: p.family, modelName: matchedKey };
  }
  return { ...DEFAULT_PRICING, modelName: modelId || 'unknown' };
}

/**
 * 获取所有模型定价（按 input 价格升序排列）
 * @returns {Array<{ model: string, input: number, output: number, family: string }>}
 */
export function getAllModelPricing() {
  return Object.entries(MODEL_PRICING)
    .map(([model, p]) => ({ model, input: p.input, output: p.output, family: p.family }))
    .sort((a, b) => a.input - b.input);
}

/**
 * 估算 API 调用费用
 * @param {string} model - 模型 ID
 * @param {number} inputTokens - 输入 token 数
 * @param {number} outputTokens - 输出 token 数
 * @returns {{ usd: number, cny: number, inputUsd: number, outputUsd: number, model: string }}
 */
export function estimateCost(model, inputTokens, outputTokens) {
  const input = Math.max(0, inputTokens || 0);
  const output = Math.max(0, outputTokens || 0);

  const pricing = getModelPricing(model);

  const inputUsd = (input / 1_000_000) * pricing.input;
  const outputUsd = (output / 1_000_000) * pricing.output;
  const usd = inputUsd + outputUsd;

  return {
    usd,
    cny: usd * USD_TO_CNY,
    inputUsd,
    outputUsd,
    model: pricing.modelName
  };
}

/**
 * 估算消息数组的 API 调用费用
 * 使用 estimateMessagesTokens 估算输入 token，maxTokens 作为输出 token 上限
 * @param {string} model - 模型 ID
 * @param {Array<{role: string, content: string}>} messages - 消息数组
 * @param {number} maxTokens - 最大输出 token 数
 * @returns {{ inputCost: number, outputCost: number, total: number, inputTokens: number, outputTokens: number }}
 */
export function estimateMessagesCost(model, messages, maxTokens) {
  // 估算输入 token 数
  let inputTokens = 0;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      inputTokens += 4; // role + 分隔符开销
      const content = typeof msg.content === 'string' ? msg.content : '';
      inputTokens += Math.ceil(content.length / 3);
    }
  }

  // 系统 prompt 约 4 token 开销 + 内容
  inputTokens += 4;

  const outputTokens = maxTokens || 4096;

  const cost = estimateCost(model, inputTokens, outputTokens);

  return {
    inputCost: cost.inputUsd,
    outputCost: cost.outputUsd,
    total: cost.usd,
    inputTokens,
    outputTokens
  };
}

/**
 * 估算缓存命中的节省金额
 * 节省的是 input tokens 的费用（避免重复发送上下文）
 * @param {string} model - 模型 ID
 * @param {number} cachedTokens - 缓存命中的 token 数
 * @param {number} hitCount - 缓存命中次数（首次命中不算节省）
 * @returns {{ usd: number, cny: number }}
 */
export function estimateSavingsFromCache(model, cachedTokens, hitCount) {
  if (!cachedTokens || !hitCount || hitCount <= 1) {
    return { usd: 0, cny: 0 };
  }

  const pricing = getModelPricing(model);
  // 节省的 input token 数 = (命中次数 - 1) * 每次 token 数
  const savedTokens = (hitCount - 1) * cachedTokens;
  const usd = (savedTokens / 1_000_000) * pricing.input;

  return { usd, cny: usd * USD_TO_CNY };
}

/**
 * 格式化费用为美元字符串
 * @param {number} usd - 美元金额
 * @returns {string} 格式化字符串，如 "$1.23"
 */
export function formatCost(usd) {
  if (usd == null || isNaN(usd)) return '$0.00';
  if (usd > 0 && usd < 0.01) return '<$0.01';
  return '$' + usd.toFixed(2);
}

/**
 * 格式化费用为人民币字符串
 * @param {number} usd - 美元金额（内部存储用 USD）
 * @returns {string} 格式化字符串，如 "¥8.86"
 */
export function formatCostCNY(usd) {
  if (usd == null || isNaN(usd)) return '¥0.00';
  const cny = usd * USD_TO_CNY;
  if (cny > 0 && cny < 0.01) return '<¥0.01';
  return '¥' + cny.toFixed(2);
}

/**
 * 将费用（美元）转换为整数 cents 存储
 * @param {number} usd - 美元金额
 * @returns {number} cents（整数）
 */
export function usdToCents(usd) {
  if (!usd || isNaN(usd)) return 0;
  return Math.round(usd * 100);
}

/**
 * 将 cents 转回美元
 * @param {number} cents
 * @returns {number} 美元金额
 */
export function centsToUsd(cents) {
  if (!cents || isNaN(cents)) return 0;
  return cents / 100;
}
