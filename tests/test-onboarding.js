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
  let settingsStorage;
  let onboarding;

  beforeEach(() => {
    storage = createMockStorage();
    settingsStorage = createMockStorage();
    onboarding = _createOnboardingModule(storage, settingsStorage);
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

    it('step 3 is test-connection', () => {
      const steps = onboarding.getStepConfig();
      assert.equal(steps[2].id, 'test-connection');
    });

    it('step 4 is first-question', () => {
      const steps = onboarding.getStepConfig();
      assert.equal(steps[3].id, 'first-question');
    });

    it('each step has canSkip field', () => {
      const steps = onboarding.getStepConfig();
      for (const step of steps) {
        assert.ok('canSkip' in step, 'step should have canSkip field');
      }
    });
  });

  describe('getTotalSteps', () => {
    it('returns 4', () => {
      assert.equal(onboarding.getTotalSteps(), 4);
    });
  });

  describe('isAPIConfigured', () => {
    it('returns false when no settings storage provided', async () => {
      const noSettings = _createOnboardingModule(storage, null);
      const result = await noSettings.isAPIConfigured();
      assert.equal(result, false);
    });

    it('returns false when API key is empty', async () => {
      const result = await onboarding.isAPIConfigured();
      assert.equal(result, false);
    });

    it('returns false when API key exists but base URL is empty', async () => {
      await settingsStorage.set({ apiKey: 'sk-test123' });
      const result = await onboarding.isAPIConfigured();
      assert.equal(result, false);
    });

    it('returns true when API key, base URL, and model are all set', async () => {
      await settingsStorage.set({
        apiKey: 'sk-test123',
        apiBaseUrl: 'https://api.openai.com',
        model: 'gpt-4o'
      });
      const result = await onboarding.isAPIConfigured();
      assert.equal(result, true);
    });
  });

  describe('getRecommendedSteps', () => {
    it('returns all 4 steps when API is not configured', async () => {
      const steps = await onboarding.getRecommendedSteps();
      assert.equal(steps.length, 4);
      assert.equal(steps[0].id, 'welcome');
      assert.equal(steps[1].id, 'config');
      assert.equal(steps[2].id, 'test-connection');
      assert.equal(steps[3].id, 'first-question');
    });

    it('skips config and test-connection when API is already configured', async () => {
      await settingsStorage.set({
        apiKey: 'sk-test123',
        apiBaseUrl: 'https://api.openai.com',
        model: 'gpt-4o'
      });
      const steps = await onboarding.getRecommendedSteps();
      assert.equal(steps.length, 2);
      assert.equal(steps[0].id, 'welcome');
      assert.equal(steps[1].id, 'first-question');
      // Verify no config or test-connection steps
      const ids = steps.map(s => s.id);
      assert.ok(!ids.includes('config'), 'should not include config step');
      assert.ok(!ids.includes('test-connection'), 'should not include test-connection step');
    });

    it('returns all steps when settings storage throws', async () => {
      const brokenSettings = {
        get: () => { throw new Error('storage error'); },
        set: async () => {},
        remove: async () => {}
      };
      const module = _createOnboardingModule(storage, brokenSettings);
      const steps = await module.getRecommendedSteps();
      assert.equal(steps.length, 4);
    });
  });

  describe('getSampleQuestion', () => {
    it('returns a non-empty string', () => {
      const q = onboarding.getSampleQuestion();
      assert.ok(typeof q === 'string');
      assert.ok(q.length > 0);
    });

    it('returns questions containing question marks (from the list)', () => {
      // Run multiple times to check it returns from the known list
      const questions = new Set();
      for (let i = 0; i < 20; i++) {
        questions.add(onboarding.getSampleQuestion());
      }
      // All should be from the known list
      for (const q of questions) {
        assert.ok(q.includes('？') || q.includes('?'), `Question should have a question mark: ${q}`);
      }
    });
  });

  describe('getSampleQuestions', () => {
    it('returns an array with at least 3 questions', () => {
      const qs = onboarding.getSampleQuestions();
      assert.ok(Array.isArray(qs));
      assert.ok(qs.length >= 3);
    });

    it('each question is a non-empty string', () => {
      const qs = onboarding.getSampleQuestions();
      for (const q of qs) {
        assert.ok(typeof q === 'string');
        assert.ok(q.length > 0);
      }
    });
  });
});
