/**
 * test-depth-cost-estimator.js — Cost Estimator 深度测试
 *
 * 测试范围:
 *   findClosestModel       — 精确匹配、前缀匹配、子串匹配、null/无效输入
 *   getModelPricing        — 已知模型定价、未知模型默认定价
 *   getAllModelPricing      — 排序、完整性
 *   estimateCost           — token 计算、空输入、零 token、大数量
 *   estimateMessagesCost   — 消息数组估算、默认 maxTokens、空消息
 *   estimateSavingsFromCache — 缓存命中节省、边界条件
 *   formatCost / formatCostCNY — 格式化、边界值
 *   usdToCents / centsToUsd   — 转换精度
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  USD_TO_CNY,
  MODEL_PRICING,
  findClosestModel,
  getModelPricing,
  getAllModelPricing,
  estimateCost,
  estimateMessagesCost,
  estimateSavingsFromCache,
  formatCost,
  formatCostCNY,
  usdToCents,
  centsToUsd,
} = await import('../lib/cost-estimator.js')

// ── token 计算 ─────────────────────────────────────────────────────────────────

describe('Cost Estimator — token 计算', () => {

  it('1. estimateCost: 正常 input/output token 费用计算', () => {
    // gpt-4o: input $2.50/1M, output $10.00/1M
    const r = estimateCost('gpt-4o', 1000, 500)
    const expectedInputUsd = (1000 / 1_000_000) * 2.50
    const expectedOutputUsd = (500 / 1_000_000) * 10.00
    assert.equal(r.inputUsd, expectedInputUsd)
    assert.equal(r.outputUsd, expectedOutputUsd)
    assert.equal(r.usd, expectedInputUsd + expectedOutputUsd)
    assert.equal(r.cny, r.usd * USD_TO_CNY)
    assert.equal(r.model, 'gpt-4o')
  })

  it('2. estimateCost: 1M token 大数量计算', () => {
    const r = estimateCost('claude-sonnet-4-6', 1_000_000, 1_000_000)
    // claude-sonnet-4-6: input $3.00/1M, output $15.00/1M
    assert.equal(r.inputUsd, 3.00)
    assert.equal(r.outputUsd, 15.00)
    assert.equal(r.usd, 18.00)
  })

  it('3. estimateMessagesCost: 消息数组正确估算 token 数', () => {
    const messages = [
      { role: 'user', content: 'Hello world' },     // 11 chars → ceil(11/3)=4 + 4 overhead = 8
      { role: 'assistant', content: 'Hi there!' },   // 9 chars → ceil(9/3)=3 + 4 = 7
    ]
    const r = estimateMessagesCost('gpt-4o', messages, 100)
    // inputTokens = 8 + 7 + 4(system) = 19
    assert.equal(r.inputTokens, 19)
    assert.equal(r.outputTokens, 100)
    assert.ok(r.total > 0)
  })

  it('4. estimateMessagesCost: 空消息数组使用系统开销', () => {
    const r = estimateMessagesCost('gpt-4o', [], 200)
    // 空数组 → 0 + 4(system) = 4
    assert.equal(r.inputTokens, 4)
    assert.equal(r.outputTokens, 200)
  })
})

// ── 成本估算 ───────────────────────────────────────────────────────────────────

describe('Cost Estimator — 成本估算', () => {

  it('5. estimateCost: 零 token 返回零费用', () => {
    const r = estimateCost('gpt-4o', 0, 0)
    assert.equal(r.usd, 0)
    assert.equal(r.cny, 0)
    assert.equal(r.inputUsd, 0)
    assert.equal(r.outputUsd, 0)
  })

  it('6. estimateCost: 负数 token 被修正为 0', () => {
    const r = estimateCost('gpt-4o', -100, -50)
    assert.equal(r.usd, 0)
    assert.equal(r.cny, 0)
  })

  it('7. estimateCost: 本地模型 (ollama) 费用为 0', () => {
    const r = estimateCost('llama3', 10000, 5000)
    assert.equal(r.usd, 0)
    assert.equal(r.cny, 0)
    assert.equal(r.model, 'llama3')
  })

  it('8. estimateCost: null/undefined token 视为 0', () => {
    const r = estimateCost('gpt-4o', null, undefined)
    assert.equal(r.usd, 0)
    assert.equal(r.cny, 0)
  })
})

// ── 模型价格 ───────────────────────────────────────────────────────────────────

describe('Cost Estimator — 模型价格', () => {

  it('9. findClosestModel: 精确匹配', () => {
    assert.equal(findClosestModel('gpt-4o'), 'gpt-4o')
    assert.equal(findClosestModel('Claude-SONNET-4-6'), 'claude-sonnet-4-6')
  })

  it('10. findClosestModel: 前缀匹配（带日期后缀）', () => {
    assert.equal(findClosestModel('gpt-4o-2024-08-06'), 'gpt-4o')
    assert.equal(findClosestModel('gpt-4-turbo-2024-04-09'), 'gpt-4-turbo')
  })

  it('11. findClosestModel: 子串匹配', () => {
    // 'some-deepseek-chat-v2' contains 'deepseek-chat'
    assert.equal(findClosestModel('some-deepseek-chat-v2'), 'deepseek-chat')
  })

  it('12. getModelPricing: 未知模型返回默认定价', () => {
    const r = getModelPricing('my-custom-model')
    assert.equal(r.input, 3.00)
    assert.equal(r.output, 15.00)
    assert.equal(r.family, 'unknown')
    assert.equal(r.modelName, 'my-custom-model')
  })

  it('13. getModelPricing: null/undefined 返回默认定价', () => {
    const r = getModelPricing(null)
    assert.equal(r.family, 'unknown')
    assert.equal(r.modelName, 'unknown')

    const r2 = getModelPricing(undefined)
    assert.equal(r2.family, 'unknown')
  })

  it('14. getAllModelPricing: 按 input 价格升序排列', () => {
    const list = getAllModelPricing()
    assert.ok(list.length >= Object.keys(MODEL_PRICING).length)
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].input >= list[i - 1].input,
        `Expected ${list[i].input} >= ${list[i - 1].input} at index ${i}`)
    }
  })
})

// ── 批量计算 ───────────────────────────────────────────────────────────────────

describe('Cost Estimator — 批量计算与格式化', () => {

  it('15. estimateSavingsFromCache: 多次命中节省正确', () => {
    // deepseek-chat: input $0.27/1M
    const r = estimateSavingsFromCache('deepseek-chat', 10000, 5)
    // savedTokens = (5-1) * 10000 = 40000
    const expectedUsd = (40000 / 1_000_000) * 0.27
    assert.equal(r.usd, expectedUsd)
    assert.equal(r.cny, expectedUsd * USD_TO_CNY)
  })

  it('16. estimateSavingsFromCache: 命中 1 次节省为 0', () => {
    const r = estimateSavingsFromCache('gpt-4o', 10000, 1)
    assert.equal(r.usd, 0)
    assert.equal(r.cny, 0)
  })

  it('17. estimateSavingsFromCache: 0 token 返回 0', () => {
    const r = estimateSavingsFromCache('gpt-4o', 0, 10)
    assert.equal(r.usd, 0)
  })

  it('18. formatCost: 正常格式化为 $X.XX', () => {
    assert.equal(formatCost(1.234), '$1.23')
    assert.equal(formatCost(0), '$0.00')
    assert.equal(formatCost(null), '$0.00')
    assert.equal(formatCost(NaN), '$0.00')
  })

  it('19. formatCost: 极小值显示 <$0.01', () => {
    assert.equal(formatCost(0.001), '<$0.01')
    assert.equal(formatCost(0.0001), '<$0.01')
  })

  it('20. formatCostCNY: 正确转换为人民币', () => {
    const r = formatCostCNY(1.0)
    assert.equal(r, '¥' + (1.0 * USD_TO_CNY).toFixed(2))
  })

  it('21. usdToCents / centsToUsd: 往返转换精度', () => {
    assert.equal(usdToCents(1.23), 123)
    assert.equal(usdToCents(0), 0)
    assert.equal(usdToCents(null), 0)
    assert.equal(centsToUsd(123), 1.23)
    assert.equal(centsToUsd(0), 0)
    assert.equal(centsToUsd(null), 0)
  })

  it('22. formatCostCNY: null/NaN 返回 ¥0.00', () => {
    assert.equal(formatCostCNY(null), '¥0.00')
    assert.equal(formatCostCNY(NaN), '¥0.00')
  })

  it('23. estimateMessagesCost: 默认 maxTokens 为 4096', () => {
    const r = estimateMessagesCost('gpt-4o', [{ role: 'user', content: 'hi' }])
    assert.equal(r.outputTokens, 4096)
  })

  it('24. findClosestModel: 非字符串输入返回 null', () => {
    assert.equal(findClosestModel(null), null)
    assert.equal(findClosestModel(undefined), null)
    assert.equal(findClosestModel(123), null)
    assert.equal(findClosestModel(''), null)
  })

  it('25. estimateCost: DeepSeek 模型费率正确', () => {
    // deepseek-reasoner: input $0.55/1M, output $2.19/1M
    const r = estimateCost('deepseek-reasoner', 1_000_000, 1_000_000)
    assert.equal(r.inputUsd, 0.55)
    assert.equal(r.outputUsd, 2.19)
    assert.equal(r.model, 'deepseek-reasoner')
  })
})
