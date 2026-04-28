/**
 * Tests for Onboarding module
 */
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { _createOnboardingModule } from '../lib/onboarding.js';

function createMockStorage() {
  const store = {};
  return {
    async get(keys) {
      const result = {};
      if (typeof keys === 'string') {
        result[keys] = store[keys] !== undefined ? store[keys] : undefined;
      } else if (Array.isArray(keys)) {
        for (const k of keys) {
          result[k] = store[k] !== undefined ? store[k] : undefined;
        }
      } else if (keys && typeof keys === 'object') {
        for (const [k, defaultVal] of Object.entries(keys)) {
          result[k] = store[k] !== undefined ? store[k] : defaultVal;
        }
      }
      return result;
    },
    async set(obj) { Object.assign(store, obj); },
    async remove(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) delete store[k];
    },
    _store: store
  };
}

describe('Onboarding Module', () => {
  let storage;
  let onboarding;

  beforeEach(() => {
    storage = createMockStorage();
    onboarding = _createOnboardingModule(storage);
  });

  describe('shouldShowOnboarding', () => {
    it('returns true when onboarding has not been completed', async () => {
      const result = await onboarding.shouldShowOnboarding();
      assert.equal(result, true);
    });

    it('returns false when onboarding has been completed', async () => {
      await storage.set({ onboardingCompleted: true });
      const result = await onboarding.shouldShowOnboarding();
      assert.equal(result, false);
    });

    it('returns true when onboardingCompleted is false', async () => {
      await storage.set({ onboardingCompleted: false });
      const result = await onboarding.shouldShowOnboarding();
      assert.equal(result, true);
    });
  });

  describe('completeOnboarding', () => {
    it('sets onboardingCompleted to true in storage', async () => {
      await onboarding.completeOnboarding();
      const data = await storage.get('onboardingCompleted');
      assert.equal(data.onboardingCompleted, true);
    });

    it('overwrites existing value', async () => {
      await storage.set({ onboardingCompleted: false });
      await onboarding.completeOnboarding();
      const data = await storage.get('onboardingCompleted');
      assert.equal(data.onboardingCompleted, true);
    });
  });

  describe('resetOnboarding', () => {
    it('removes onboardingCompleted from storage', async () => {
      await storage.set({ onboardingCompleted: true });
      await onboarding.resetOnboarding();
      const data = await storage.get('onboardingCompleted');
      assert.equal(data.onboardingCompleted, undefined);
    });

    it('works when onboardingCompleted does not exist', async () => {
      await onboarding.resetOnboarding();
      const data = await storage.get('onboardingCompleted');
      assert.equal(data.onboardingCompleted, undefined);
    });
  });

  describe('getStepConfig', () => {
    it('returns array of 4 steps', () => {
      const steps = onboarding.getStepConfig();
      assert.equal(steps.length, 4);
    });

    it('each step has required fields', () => {
      const steps = onboarding.getStepConfig();
      for (const step of steps) {
        assert.ok(step.id, 'step should have id');
        assert.ok(step.title, 'step should have title');
        assert.ok(step.description, 'step should have description');
      }
    });

    it('step 1 is welcome', () => {
      const steps = onboarding.getStepConfig();
      assert.equal(steps[0].id, 'welcome');
    });

    it('step 2 is config', () => {
      const steps = onboarding.getStepConfig();
      assert.equal(steps[1].id, 'config');
    });

    it('step 3 is try-it', () => {
      const steps = onboarding.getStepConfig();
      assert.equal(steps[2].id, 'try-it');
    });

    it('step 4 is complete', () => {
      const steps = onboarding.getStepConfig();
      assert.equal(steps[3].id, 'complete');
    });
  });
});
