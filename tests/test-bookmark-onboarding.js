/**
 * Tests for BookmarkOnboarding — 引导向导
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { _createBookmarkOnboardingModule } from '../lib/bookmark-onboarding.js'

function createMockStorage() {
  const store = {}
  return {
    async get(keys) {
      const result = {}
      if (keys === null || keys === undefined) {
        Object.assign(result, store)
      } else if (typeof keys === 'string') {
        result[keys] = store[keys] !== undefined ? store[keys] : undefined
      } else if (Array.isArray(keys)) {
        for (const k of keys) {
          result[k] = store[k] !== undefined ? store[k] : undefined
        }
      } else if (keys && typeof keys === 'object') {
        for (const [k, defaultVal] of Object.entries(keys)) {
          result[k] = store[k] !== undefined ? store[k] : defaultVal
        }
      }
      return result
    },
    async set(obj) { Object.assign(store, obj) },
    async remove(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys]
      for (const k of keyList) delete store[k]
    },
    _store: store
  }
}

describe('BookmarkOnboarding Module', () => {
  let storage
  let mod

  beforeEach(() => {
    storage = createMockStorage()
    mod = _createBookmarkOnboardingModule(storage)
  })

  // ==================== shouldShowOnboarding ====================

  describe('shouldShowOnboarding', () => {
    it('returns true when onboarding has not been completed', async () => {
      const result = await mod.shouldShowOnboarding()
      assert.equal(result, true)
    })

    it('returns false when onboarding has been completed', async () => {
      await storage.set({ bookmarkOnboardingCompleted: true })
      const result = await mod.shouldShowOnboarding()
      assert.equal(result, false)
    })

    it('returns true when stored value is false', async () => {
      await storage.set({ bookmarkOnboardingCompleted: false })
      const result = await mod.shouldShowOnboarding()
      assert.equal(result, true)
    })

    it('returns true when stored value is null', async () => {
      await storage.set({ bookmarkOnboardingCompleted: null })
      const result = await mod.shouldShowOnboarding()
      assert.equal(result, true)
    })
  })

  // ==================== completeOnboarding ====================

  describe('completeOnboarding', () => {
    it('sets bookmarkOnboardingCompleted to true in storage', async () => {
      await mod.completeOnboarding()
      const data = await storage.get('bookmarkOnboardingCompleted')
      assert.equal(data.bookmarkOnboardingCompleted, true)
    })

    it('overwrites existing false value', async () => {
      await storage.set({ bookmarkOnboardingCompleted: false })
      await mod.completeOnboarding()
      const data = await storage.get('bookmarkOnboardingCompleted')
      assert.equal(data.bookmarkOnboardingCompleted, true)
    })

    it('saves completion timestamp', async () => {
      const before = Date.now()
      await mod.completeOnboarding()
      const data = await storage.get('bookmarkOnboardingCompletedAt')
      assert.ok(data.bookmarkOnboardingCompletedAt >= before)
      assert.ok(data.bookmarkOnboardingCompletedAt <= Date.now())
    })
  })

  // ==================== resetOnboarding ====================

  describe('resetOnboarding', () => {
    it('removes completion flag from storage', async () => {
      await storage.set({ bookmarkOnboardingCompleted: true })
      await mod.resetOnboarding()
      const data = await storage.get('bookmarkOnboardingCompleted')
      assert.equal(data.bookmarkOnboardingCompleted, undefined)
    })

    it('removes completion timestamp', async () => {
      await storage.set({ bookmarkOnboardingCompletedAt: Date.now() })
      await mod.resetOnboarding()
      const data = await storage.get('bookmarkOnboardingCompletedAt')
      assert.equal(data.bookmarkOnboardingCompletedAt, undefined)
    })

    it('works when onboarding was never completed', async () => {
      await mod.resetOnboarding()
      const data = await storage.get('bookmarkOnboardingCompleted')
      assert.equal(data.bookmarkOnboardingCompleted, undefined)
    })
  })

  // ==================== Steps Configuration ====================

  describe('getSteps', () => {
    it('returns an array of steps', () => {
      const steps = mod.getSteps()
      assert.ok(Array.isArray(steps))
      assert.ok(steps.length > 0)
    })

    it('returns exactly 4 steps', () => {
      const steps = mod.getSteps()
      assert.equal(steps.length, 4)
    })

    it('each step has required fields (id, title, description, icon)', () => {
      const steps = mod.getSteps()
      for (const step of steps) {
        assert.ok(step.id, `step should have id`)
        assert.ok(typeof step.title === 'string' && step.title.length > 0, `step ${step.id} should have title`)
        assert.ok(typeof step.description === 'string' && step.description.length > 0, `step ${step.id} should have description`)
        assert.ok(step.icon, `step ${step.id} should have icon`)
      }
    })

    it('step ids are: welcome, features, theme, autoCollect', () => {
      const steps = mod.getSteps()
      const ids = steps.map(s => s.id)
      assert.deepEqual(ids, ['welcome', 'features', 'theme', 'autoCollect'])
    })

    it('each step has canSkip field as boolean', () => {
      const steps = mod.getSteps()
      for (const step of steps) {
        assert.equal(typeof step.canSkip, 'boolean', `step ${step.id} canSkip should be boolean`)
      }
    })

    it('steps are returned as copies (not mutating internal state)', () => {
      const steps1 = mod.getSteps()
      const steps2 = mod.getSteps()
      assert.deepEqual(steps1, steps2)
      steps1[0].title = 'modified'
      assert.notEqual(steps2[0].title, 'modified')
    })
  })

  describe('getTotalSteps', () => {
    it('returns 4', () => {
      assert.equal(mod.getTotalSteps(), 4)
    })

    it('matches getSteps().length', () => {
      assert.equal(mod.getTotalSteps(), mod.getSteps().length)
    })
  })

  // ==================== Step Navigation ====================

  describe('getCurrentStepIndex', () => {
    it('returns 0 by default (no saved progress)', async () => {
      const idx = await mod.getCurrentStepIndex()
      assert.equal(idx, 0)
    })

    it('returns saved progress index', async () => {
      await storage.set({ bookmarkOnboardingStep: 2 })
      const idx = await mod.getCurrentStepIndex()
      assert.equal(idx, 2)
    })

    it('returns 0 when saved index is negative', async () => {
      await storage.set({ bookmarkOnboardingStep: -1 })
      const idx = await mod.getCurrentStepIndex()
      assert.equal(idx, 0)
    })

    it('clamps to last step when saved index exceeds step count', async () => {
      await storage.set({ bookmarkOnboardingStep: 99 })
      const idx = await mod.getCurrentStepIndex()
      assert.equal(idx, mod.getTotalSteps() - 1)
    })
  })

  describe('setCurrentStepIndex', () => {
    it('saves the step index to storage', async () => {
      await mod.setCurrentStepIndex(2)
      const data = await storage.get('bookmarkOnboardingStep')
      assert.equal(data.bookmarkOnboardingStep, 2)
    })

    it('overwrites previous value', async () => {
      await mod.setCurrentStepIndex(1)
      await mod.setCurrentStepIndex(3)
      const data = await storage.get('bookmarkOnboardingStep')
      assert.equal(data.bookmarkOnboardingStep, 3)
    })
  })

  describe('nextStep', () => {
    it('advances to next step and returns new index', async () => {
      const idx = await mod.nextStep()
      assert.equal(idx, 1)
    })

    it('saves the new step index', async () => {
      await mod.nextStep()
      const saved = await storage.get('bookmarkOnboardingStep')
      assert.equal(saved.bookmarkOnboardingStep, 1)
    })

    it('advances from step 1 to step 2', async () => {
      await mod.setCurrentStepIndex(1)
      const idx = await mod.nextStep()
      assert.equal(idx, 2)
    })

    it('does not advance past the last step', async () => {
      const total = mod.getTotalSteps()
      await mod.setCurrentStepIndex(total - 1)
      const idx = await mod.nextStep()
      assert.equal(idx, total - 1)
    })

    it('returns -1 when onboarding was already completed', async () => {
      await mod.completeOnboarding()
      const idx = await mod.nextStep()
      assert.equal(idx, -1)
    })
  })

  describe('prevStep', () => {
    it('goes back to previous step and returns new index', async () => {
      await mod.setCurrentStepIndex(2)
      const idx = await mod.prevStep()
      assert.equal(idx, 1)
    })

    it('saves the new step index', async () => {
      await mod.setCurrentStepIndex(2)
      await mod.prevStep()
      const saved = await storage.get('bookmarkOnboardingStep')
      assert.equal(saved.bookmarkOnboardingStep, 1)
    })

    it('does not go below 0', async () => {
      const idx = await mod.prevStep()
      assert.equal(idx, 0)
    })

    it('goes from 1 to 0', async () => {
      await mod.setCurrentStepIndex(1)
      const idx = await mod.prevStep()
      assert.equal(idx, 0)
    })
  })

  describe('goToStep', () => {
    it('jumps to specified step', async () => {
      const idx = await mod.goToStep(3)
      assert.equal(idx, 3)
    })

    it('saves the step index', async () => {
      await mod.goToStep(3)
      const saved = await storage.get('bookmarkOnboardingStep')
      assert.equal(saved.bookmarkOnboardingStep, 3)
    })

    it('clamps to 0 for negative values', async () => {
      const idx = await mod.goToStep(-5)
      assert.equal(idx, 0)
    })

    it('clamps to last step for values exceeding total', async () => {
      const idx = await mod.goToStep(100)
      assert.equal(idx, mod.getTotalSteps() - 1)
    })
  })

  // ==================== User Preferences ====================

  describe('getThemeChoices', () => {
    it('returns an array of theme options', () => {
      const choices = mod.getThemeChoices()
      assert.ok(Array.isArray(choices))
      assert.ok(choices.length > 0)
    })

    it('has at least 3 theme options (light, dark, system)', () => {
      const choices = mod.getThemeChoices()
      assert.ok(choices.length >= 3)
    })

    it('each choice has id, label, icon', () => {
      const choices = mod.getThemeChoices()
      for (const choice of choices) {
        assert.ok(choice.id, 'choice should have id')
        assert.ok(choice.label, 'choice should have label')
        assert.ok(choice.icon, 'choice should have icon')
      }
    })

    it('includes light, dark, and system options', () => {
      const choices = mod.getThemeChoices()
      const ids = choices.map(c => c.id)
      assert.ok(ids.includes('light'), 'should include light')
      assert.ok(ids.includes('dark'), 'should include dark')
      assert.ok(ids.includes('system'), 'should include system')
    })
  })

  describe('setUserTheme', () => {
    it('saves theme choice to storage', async () => {
      await mod.setUserTheme('dark')
      const data = await storage.get('bookmarkOnboardingTheme')
      assert.equal(data.bookmarkOnboardingTheme, 'dark')
    })

    it('rejects invalid theme values', async () => {
      await assert.rejects(
        () => mod.setUserTheme('rainbow'),
        /invalid/i
      )
    })

    it('accepts light', async () => {
      await mod.setUserTheme('light')
      const data = await storage.get('bookmarkOnboardingTheme')
      assert.equal(data.bookmarkOnboardingTheme, 'light')
    })

    it('accepts dark', async () => {
      await mod.setUserTheme('dark')
      const data = await storage.get('bookmarkOnboardingTheme')
      assert.equal(data.bookmarkOnboardingTheme, 'dark')
    })

    it('accepts system', async () => {
      await mod.setUserTheme('system')
      const data = await storage.get('bookmarkOnboardingTheme')
      assert.equal(data.bookmarkOnboardingTheme, 'system')
    })
  })

  describe('getUserTheme', () => {
    it('returns null when no theme is set', async () => {
      const theme = await mod.getUserTheme()
      assert.equal(theme, null)
    })

    it('returns saved theme value', async () => {
      await storage.set({ bookmarkOnboardingTheme: 'dark' })
      const theme = await mod.getUserTheme()
      assert.equal(theme, 'dark')
    })
  })

  describe('setAutoCollect', () => {
    it('saves autoCollect enabled state as true', async () => {
      await mod.setAutoCollect(true)
      const data = await storage.get('bookmarkOnboardingAutoCollect')
      assert.equal(data.bookmarkOnboardingAutoCollect, true)
    })

    it('saves autoCollect disabled state as false', async () => {
      await mod.setAutoCollect(false)
      const data = await storage.get('bookmarkOnboardingAutoCollect')
      assert.equal(data.bookmarkOnboardingAutoCollect, false)
    })

    it('rejects non-boolean values', async () => {
      await assert.rejects(
        () => mod.setAutoCollect('yes'),
        /invalid/i
      )
    })
  })

  describe('getAutoCollect', () => {
    it('returns null when not set', async () => {
      const val = await mod.getAutoCollect()
      assert.equal(val, null)
    })

    it('returns true when enabled', async () => {
      await storage.set({ bookmarkOnboardingAutoCollect: true })
      const val = await mod.getAutoCollect()
      assert.equal(val, true)
    })

    it('returns false when disabled', async () => {
      await storage.set({ bookmarkOnboardingAutoCollect: false })
      const val = await mod.getAutoCollect()
      assert.equal(val, false)
    })
  })

  // ==================== Features Intro ====================

  describe('getCoreFeatures', () => {
    it('returns an array of core features', () => {
      const features = mod.getCoreFeatures()
      assert.ok(Array.isArray(features))
      assert.ok(features.length > 0)
    })

    it('has at least 3 core features', () => {
      const features = mod.getCoreFeatures()
      assert.ok(features.length >= 3)
    })

    it('each feature has id, title, description, icon', () => {
      const features = mod.getCoreFeatures()
      for (const f of features) {
        assert.ok(f.id, 'feature should have id')
        assert.ok(typeof f.title === 'string' && f.title.length > 0, 'feature should have title')
        assert.ok(typeof f.description === 'string' && f.description.length > 0, 'feature should have description')
        assert.ok(f.icon, 'feature should have icon')
      }
    })

    it('includes bookmark collection feature', () => {
      const features = mod.getCoreFeatures()
      const ids = features.map(f => f.id)
      assert.ok(ids.includes('bookmarkCollect'), 'should include bookmarkCollect')
    })

    it('includes knowledge graph feature', () => {
      const features = mod.getCoreFeatures()
      const ids = features.map(f => f.id)
      assert.ok(ids.includes('knowledgeGraph'), 'should include knowledgeGraph')
    })

    it('includes AI recommendation feature', () => {
      const features = mod.getCoreFeatures()
      const ids = features.map(f => f.id)
      assert.ok(ids.includes('aiRecommend'), 'should include aiRecommend')
    })
  })

  // ==================== Progress Tracking ====================

  describe('getProgress', () => {
    it('returns progress object with current and total', async () => {
      const progress = await mod.getProgress()
      assert.equal(typeof progress.current, 'number')
      assert.equal(typeof progress.total, 'number')
    })

    it('defaults to step 1 of total steps', async () => {
      const progress = await mod.getProgress()
      assert.equal(progress.current, 1)
      assert.equal(progress.total, mod.getTotalSteps())
    })

    it('reflects saved step index', async () => {
      await mod.setCurrentStepIndex(2)
      const progress = await mod.getProgress()
      assert.equal(progress.current, 3)  // 1-indexed
      assert.equal(progress.total, mod.getTotalSteps())
    })

    it('returns percentage', async () => {
      await mod.setCurrentStepIndex(1)
      const progress = await mod.getProgress()
      assert.equal(typeof progress.percentage, 'number')
      assert.ok(progress.percentage > 0 && progress.percentage <= 100)
    })
  })

  // ==================== Complete Flow Integration ====================

  describe('complete flow integration', () => {
    it('full onboarding flow: navigate through all steps and complete', async () => {
      // Should show onboarding
      assert.equal(await mod.shouldShowOnboarding(), true)

      // Step 0: Welcome
      let idx = await mod.getCurrentStepIndex()
      assert.equal(idx, 0)

      // Step 1: Features
      idx = await mod.nextStep()
      assert.equal(idx, 1)

      // Step 2: Theme
      idx = await mod.nextStep()
      assert.equal(idx, 2)
      await mod.setUserTheme('dark')

      // Step 3: Auto-collect
      idx = await mod.nextStep()
      assert.equal(idx, 3)
      await mod.setAutoCollect(true)

      // Complete
      await mod.completeOnboarding()
      assert.equal(await mod.shouldShowOnboarding(), false)
    })

    it('full flow with back navigation', async () => {
      await mod.nextStep() // 0 → 1
      await mod.nextStep() // 1 → 2
      let idx = await mod.prevStep() // 2 → 1
      assert.equal(idx, 1)
      idx = await mod.nextStep() // 1 → 2
      assert.equal(idx, 2)
    })

    it('reset allows showing onboarding again', async () => {
      await mod.completeOnboarding()
      assert.equal(await mod.shouldShowOnboarding(), false)
      await mod.resetOnboarding()
      assert.equal(await mod.shouldShowOnboarding(), true)
    })

    it('preferences persist across module instances', async () => {
      await mod.setUserTheme('dark')
      await mod.setAutoCollect(true)
      await mod.completeOnboarding()

      // Create new module instance with same storage
      const mod2 = _createBookmarkOnboardingModule(storage)
      assert.equal(await mod2.shouldShowOnboarding(), false)
      assert.equal(await mod2.getUserTheme(), 'dark')
      assert.equal(await mod2.getAutoCollect(), true)
    })
  })

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('module works with empty storage', async () => {
      const progress = await mod.getProgress()
      assert.equal(progress.current, 1)
      assert.equal(progress.total, 4)
    })

    it('getSteps returns a fresh copy each time', () => {
      const steps1 = mod.getSteps()
      steps1.push({ id: 'extra' })
      const steps2 = mod.getSteps()
      assert.equal(steps2.length, mod.getTotalSteps())
    })

    it('completeOnboarding can be called multiple times', async () => {
      await mod.completeOnboarding()
      await mod.completeOnboarding()
      assert.equal(await mod.shouldShowOnboarding(), false)
    })

    it('nextStep after completion returns -1', async () => {
      await mod.completeOnboarding()
      const idx = await mod.nextStep()
      assert.equal(idx, -1)
    })
  })
})
