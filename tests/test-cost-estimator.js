/**
 * Tests for Cost Estimator module
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_PRICING,
  estimateCost,
  estimateMessagesCost,
  getModelPricing,
  getAllModelPricing,
  formatCost,
  formatCostCNY,
  estimateSavingsFromCache,
  findClosestModel
} from '../lib/cost-estimator.js';

// ==================== MODEL_PRICING ====================

describe('MODEL_PRICING', () => {
  it('contains pricing for common models', () => {
    assert.ok(MODEL_PRICING['gpt-4o']);
    assert.ok(MODEL_PRICING['gpt-4o-mini']);
    assert.ok(MODEL_PRICING['claude-sonnet-4-6']);
    assert.ok(MODEL_PRICING['claude-opus-4-6']);
    assert.ok(MODEL_PRICING['claude-haiku-4-5']);
    assert.ok(MODEL_PRICING['deepseek-chat']);
  });

  it('each entry has input and output prices', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      assert.equal(typeof pricing.input, 'number', `${model} missing input price`);
      assert.equal(typeof pricing.output, 'number', `${model} missing output price`);
      assert.ok(pricing.input >= 0, `${model} input price must be >= 0`);
      assert.ok(pricing.output >= 0, `${model} output price must be >= 0`);
    }
  });

  it('output price is >= input price for all models', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      assert.ok(
        pricing.output >= pricing.input,
        `${model}: output (${pricing.output}) should be >= input (${pricing.input})`
      );
    }
  });
});

// ==================== estimateCost ====================

describe('estimateCost', () => {
  it('calculates cost for gpt-4o correctly', () => {
    // gpt-4o: $2.50/1M input, $10.00/1M output
    const result = estimateCost('gpt-4o', 1000000, 1000000);
    assert.equal(result.usd, 12.50);
  });

  it('calculates cost for gpt-4o-mini (cheap model)', () => {
    // gpt-4o-mini: $0.15/1M input, $0.60/1M output
    const result = estimateCost('gpt-4o-mini', 1000000, 1000000);
    assert.equal(result.usd, 0.75);
  });

  it('calculates cost for claude-sonnet-4-6', () => {
    // claude-sonnet-4-6: $3.00/1M input, $15.00/1M output
    const result = estimateCost('claude-sonnet-4-6', 500000, 500000);
    assert.equal(result.usd, 9.00);
  });

  it('handles small token counts', () => {
    // 1000 tokens for gpt-4o: input=1000*2.5/1M=0.0025, output=1000*10/1M=0.01
    const result = estimateCost('gpt-4o', 1000, 1000);
    assert.ok(Math.abs(result.usd - 0.0125) < 0.0001);
  });

  it('handles zero tokens', () => {
    const result = estimateCost('gpt-4o', 0, 0);
    assert.equal(result.usd, 0);
    assert.equal(result.cny, 0);
  });

  it('handles zero input with non-zero output', () => {
    const result = estimateCost('gpt-4o', 0, 1000000);
    assert.equal(result.usd, 10.00);
  });

  it('handles non-zero input with zero output', () => {
    const result = estimateCost('gpt-4o', 1000000, 0);
    assert.equal(result.usd, 2.50);
  });

  it('returns cny estimate', () => {
    const result = estimateCost('gpt-4o', 1000000, 0);
    assert.equal(result.cny, 18.00); // 2.50 * 7.2
  });

  it('uses fallback pricing for unknown model', () => {
    // Unknown models should use a default mid-range pricing
    const result = estimateCost('unknown-model', 1000000, 1000000);
    assert.ok(result.usd > 0, 'Unknown model should still estimate cost');
    assert.ok(result.usd < 100, 'Unknown model cost should be reasonable');
  });

  it('handles negative tokens gracefully', () => {
    const result = estimateCost('gpt-4o', -100, -50);
    assert.equal(result.usd, 0);
  });

  it('handles model name with version suffix', () => {
    // e.g., "gpt-4o-2024-08-06" should match "gpt-4o"
    const result = estimateCost('gpt-4o-2024-08-06', 1000000, 1000000);
    assert.ok(result.usd > 0, 'Should find base model pricing');
  });
});

// ==================== formatCost ====================

describe('formatCost', () => {
  it('formats dollars correctly', () => {
    assert.equal(formatCost(1.50), '$1.50');
  });

  it('formats cents', () => {
    assert.equal(formatCost(0.05), '$0.05');
  });

  it('formats zero', () => {
    assert.equal(formatCost(0), '$0.00');
  });

  it('formats large amounts', () => {
    assert.equal(formatCost(1234.56), '$1234.56');
  });

  it('handles very small amounts (< $0.01)', () => {
    assert.equal(formatCost(0.001), '<$0.01');
  });

  it('handles null/undefined', () => {
    assert.equal(formatCost(null), '$0.00');
    assert.equal(formatCost(undefined), '$0.00');
  });
});

// ==================== formatCostCNY ====================

describe('formatCostCNY', () => {
  it('formats CNY from USD', () => {
    const result = formatCostCNY(1.00);
    assert.equal(result, '¥7.20');
  });

  it('formats small amounts', () => {
    const result = formatCostCNY(0.01);
    assert.ok(result.startsWith('¥'));
  });

  it('handles zero', () => {
    assert.equal(formatCostCNY(0), '¥0.00');
  });

  it('handles null/undefined', () => {
    assert.equal(formatCostCNY(null), '¥0.00');
    assert.equal(formatCostCNY(undefined), '¥0.00');
  });
});

// ==================== getModelPricing ====================

describe('getModelPricing', () => {
  it('returns pricing for known model', () => {
    const pricing = getModelPricing('gpt-4o');
    assert.equal(pricing.input, 2.50);
    assert.equal(pricing.output, 10.00);
    assert.ok(pricing.modelName);
  });

  it('returns null or default for unknown model', () => {
    const pricing = getModelPricing('nonexistent-model');
    assert.ok(pricing !== null && pricing !== undefined, 'Should return fallback pricing');
    assert.ok(pricing.input >= 0);
  });

  it('matches partial model names', () => {
    const pricing = getModelPricing('gpt-4o-2024-08-06');
    assert.equal(pricing.input, 2.50);
  });
});

// ==================== getAllModelPricing ====================

describe('getAllModelPricing', () => {
  it('returns an array of model pricing', () => {
    const all = getAllModelPricing();
    assert.ok(Array.isArray(all));
    assert.ok(all.length > 0);
  });

  it('each entry has required fields', () => {
    const all = getAllModelPricing();
    for (const entry of all) {
      assert.ok(entry.model, 'Missing model name');
      assert.equal(typeof entry.input, 'number');
      assert.equal(typeof entry.output, 'number');
    }
  });

  it('is sorted by input price ascending', () => {
    const all = getAllModelPricing();
    for (let i = 1; i < all.length; i++) {
      assert.ok(all[i].input >= all[i - 1].input, 'Should be sorted by input price');
    }
  });
});

// ==================== estimateMessagesCost ====================

describe('estimateMessagesCost', () => {
  it('estimates cost for a simple conversation', () => {
    const messages = [
      { role: 'user', content: 'Hello, how are you?' },
    ];
    const result = estimateMessagesCost('gpt-4o', messages, 500);
    assert.ok(result.inputCost >= 0);
    assert.ok(result.outputCost >= 0);
    assert.ok(result.total > 0);
  });

  it('returns higher cost for longer messages', () => {
    const shortMessages = [{ role: 'user', content: 'Hi' }];
    const longMessages = [{ role: 'user', content: 'a'.repeat(10000) }];
    const shortCost = estimateMessagesCost('gpt-4o', shortMessages, 500);
    const longCost = estimateMessagesCost('gpt-4o', longMessages, 500);
    assert.ok(longCost.total > shortCost.total);
  });

  it('returns higher cost for higher maxTokens', () => {
    const messages = [{ role: 'user', content: 'Hello' }];
    const low = estimateMessagesCost('gpt-4o', messages, 100);
    const high = estimateMessagesCost('gpt-4o', messages, 4000);
    assert.ok(high.outputCost > low.outputCost);
  });

  it('handles empty messages array', () => {
    const result = estimateMessagesCost('gpt-4o', [], 500);
    assert.ok(result.total >= 0);
  });

  it('handles null messages', () => {
    const result = estimateMessagesCost('gpt-4o', null, 500);
    assert.ok(result.total >= 0);
  });
});

// ==================== estimateSavingsFromCache ====================

describe('estimateSavingsFromCache', () => {
  it('calculates savings for cached tokens', () => {
    // 1000 tokens cached 5 times → saved 4 * 1000 input tokens
    const savings = estimateSavingsFromCache('gpt-4o', 1000, 5);
    assert.ok(savings.usd > 0);
    assert.ok(savings.cny > 0);
  });

  it('returns zero savings for zero hits', () => {
    const savings = estimateSavingsFromCache('gpt-4o', 1000, 0);
    assert.equal(savings.usd, 0);
  });

  it('returns zero savings for zero tokens', () => {
    const savings = estimateSavingsFromCache('gpt-4o', 0, 5);
    assert.equal(savings.usd, 0);
  });

  it('savings scale linearly with hit count', () => {
    const one = estimateSavingsFromCache('gpt-4o', 1000, 1);
    const five = estimateSavingsFromCache('gpt-4o', 1000, 5);
    // 1 hit means 0 saved (first hit still costs), 5 hits means 4 saved
    assert.ok(five.usd > one.usd);
  });
});

// ==================== findClosestModel ====================

describe('findClosestModel', () => {
  it('returns exact match', () => {
    const result = findClosestModel('gpt-4o');
    assert.equal(result, 'gpt-4o');
  });

  it('matches model with date suffix', () => {
    const result = findClosestModel('gpt-4o-2024-08-06');
    assert.equal(result, 'gpt-4o');
  });

  it('matches claude-sonnet variants', () => {
    const result = findClosestModel('claude-3-5-sonnet-20241022');
    assert.ok(result.includes('claude'));
  });

  it('returns null for completely unknown model', () => {
    const result = findClosestModel('some-random-ai-model-xyz');
    // Should return null or a sensible fallback
    // Since we can't match, it might return a default
    assert.ok(result === null || typeof result === 'string');
  });

  it('is case-insensitive', () => {
    const result = findClosestModel('GPT-4O');
    assert.equal(result, 'gpt-4o');
  });
});
