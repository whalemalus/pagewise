/**
 * BookmarkOnboarding — 书签引导向导模块
 *
 * 首次安装时显示分步引导，帮助用户了解核心功能并完成初始设置。
 * 使用 chrome.storage.local 存储引导状态和用户偏好。
 *
 * 引导步骤:
 *   1. welcome     — 欢迎页，介绍产品定位
 *   2. features    — 核心功能介绍（书签采集、知识图谱、AI 推荐）
 *   3. theme       — 选择主题偏好（浅色/深色/跟随系统）
 *   4. autoCollect — 启用/禁用自动书签采集
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API（通过依赖注入）
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 * - 与现有 lib/onboarding.js（通用引导）互补，不冲突
 */

// ==================== Storage Keys ====================

const STORAGE_KEYS = Object.freeze({
  completed: 'bookmarkOnboardingCompleted',
  completedAt: 'bookmarkOnboardingCompletedAt',
  step: 'bookmarkOnboardingStep',
  theme: 'bookmarkOnboardingTheme',
  autoCollect: 'bookmarkOnboardingAutoCollect',
})

// ==================== Valid Theme Values ====================

const VALID_THEMES = ['light', 'dark', 'system']

// ==================== Onboarding Steps ====================

const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: '欢迎使用书签智能助手',
    description: 'PageWise 可以将你的浏览器书签转化为智能知识网络，帮助你更高效地管理和发现知识。',
    icon: '👋',
    canSkip: true,
  },
  {
    id: 'features',
    title: '核心功能',
    description: '了解 PageWise 书签助手的三大核心能力。',
    icon: '✨',
    canSkip: true,
  },
  {
    id: 'theme',
    title: '选择主题',
    description: '选择你喜欢的界面主题风格，可以随时在设置中更改。',
    icon: '🎨',
    canSkip: true,
  },
  {
    id: 'autoCollect',
    title: '自动采集',
    description: '是否启用书签自动采集？启用后 PageWise 会自动分析新添加的书签。',
    icon: '📥',
    canSkip: true,
  },
]

// ==================== Core Features ====================

const CORE_FEATURES = [
  {
    id: 'bookmarkCollect',
    title: '智能书签采集',
    description: '自动读取并分析你的浏览器书签，构建结构化知识索引。',
    icon: '🔖',
  },
  {
    id: 'knowledgeGraph',
    title: '知识图谱',
    description: '将书签之间的关联关系可视化，发现隐藏的知识联系。',
    icon: '🕸️',
  },
  {
    id: 'aiRecommend',
    title: 'AI 智能推荐',
    description: '基于你的阅读习惯和知识结构，推荐有价值的学习内容。',
    icon: '🤖',
  },
]

// ==================== Theme Choices ====================

const THEME_CHOICES = [
  { id: 'light', label: '浅色', icon: '☀️' },
  { id: 'dark', label: '深色', icon: '🌙' },
  { id: 'system', label: '跟随系统', icon: '💻' },
]

// ==================== Module Factory ====================

/**
 * 创建 BookmarkOnboarding 模块实例
 *
 * @param {object} storage - chrome.storage.local 兼容接口 (get/set/remove)
 * @returns {object} BookmarkOnboarding API
 */
export function _createBookmarkOnboardingModule(storage) {
  return {
    // ─── Completion State ───

    /**
     * 检查是否需要显示引导向导
     * @returns {Promise<boolean>}
     */
    async shouldShowOnboarding() {
      const data = await storage.get(STORAGE_KEYS.completed)
      return !data[STORAGE_KEYS.completed]
    },

    /**
     * 标记引导完成
     * @returns {Promise<void>}
     */
    async completeOnboarding() {
      await storage.set({
        [STORAGE_KEYS.completed]: true,
        [STORAGE_KEYS.completedAt]: Date.now(),
      })
    },

    /**
     * 重置引导状态（设置中重新触发用）
     * @returns {Promise<void>}
     */
    async resetOnboarding() {
      await storage.remove([
        STORAGE_KEYS.completed,
        STORAGE_KEYS.completedAt,
        STORAGE_KEYS.step,
      ])
    },

    // ─── Steps Configuration ───

    /**
     * 获取引导步骤配置
     * @returns {Array<object>} 步骤副本数组
     */
    getSteps() {
      return ONBOARDING_STEPS.map(s => ({ ...s }))
    },

    /**
     * 获取步骤总数
     * @returns {number}
     */
    getTotalSteps() {
      return ONBOARDING_STEPS.length
    },

    // ─── Step Navigation ───

    /**
     * 获取当前步骤索引 (0-based)
     * @returns {Promise<number>}
     */
    async getCurrentStepIndex() {
      const data = await storage.get(STORAGE_KEYS.step)
      const idx = data[STORAGE_KEYS.step]
      if (typeof idx !== 'number' || idx < 0) return 0
      return Math.min(idx, ONBOARDING_STEPS.length - 1)
    },

    /**
     * 设置当前步骤索引
     * @param {number} index
     * @returns {Promise<void>}
     */
    async setCurrentStepIndex(index) {
      await storage.set({ [STORAGE_KEYS.step]: index })
    },

    /**
     * 前进到下一步
     * @returns {Promise<number>} 新的步骤索引，已完成返回 -1
     */
    async nextStep() {
      const completed = await this.shouldShowOnboarding()
      if (!completed) {
        // Already completed — check the stored flag directly
        const data = await storage.get(STORAGE_KEYS.completed)
        if (data[STORAGE_KEYS.completed]) return -1
      }

      const current = await this.getCurrentStepIndex()
      const maxIdx = ONBOARDING_STEPS.length - 1
      const next = Math.min(current + 1, maxIdx)
      await this.setCurrentStepIndex(next)
      return next
    },

    /**
     * 后退到上一步
     * @returns {Promise<number>} 新的步骤索引
     */
    async prevStep() {
      const current = await this.getCurrentStepIndex()
      const prev = Math.max(current - 1, 0)
      await this.setCurrentStepIndex(prev)
      return prev
    },

    /**
     * 跳转到指定步骤
     * @param {number} index
     * @returns {Promise<number>} 实际跳转到的步骤索引
     */
    async goToStep(index) {
      const clamped = Math.max(0, Math.min(index, ONBOARDING_STEPS.length - 1))
      await this.setCurrentStepIndex(clamped)
      return clamped
    },

    // ─── User Preferences ───

    /**
     * 获取主题选项列表
     * @returns {Array<object>}
     */
    getThemeChoices() {
      return THEME_CHOICES.map(c => ({ ...c }))
    },

    /**
     * 设置用户主题偏好
     * @param {'light'|'dark'|'system'} theme
     * @returns {Promise<void>}
     */
    async setUserTheme(theme) {
      if (!VALID_THEMES.includes(theme)) {
        throw new Error(`Invalid theme: ${theme}. Must be one of: ${VALID_THEMES.join(', ')}`)
      }
      await storage.set({ [STORAGE_KEYS.theme]: theme })
    },

    /**
     * 获取用户主题偏好
     * @returns {Promise<string|null>}
     */
    async getUserTheme() {
      const data = await storage.get(STORAGE_KEYS.theme)
      return data[STORAGE_KEYS.theme] ?? null
    },

    /**
     * 设置自动采集开关
     * @param {boolean} enabled
     * @returns {Promise<void>}
     */
    async setAutoCollect(enabled) {
      if (typeof enabled !== 'boolean') {
        throw new Error(`Invalid autoCollect value: must be boolean, got ${typeof enabled}`)
      }
      await storage.set({ [STORAGE_KEYS.autoCollect]: enabled })
    },

    /**
     * 获取自动采集开关状态
     * @returns {Promise<boolean|null>}
     */
    async getAutoCollect() {
      const data = await storage.get(STORAGE_KEYS.autoCollect)
      return data[STORAGE_KEYS.autoCollect] ?? null
    },

    // ─── Core Features ───

    /**
     * 获取核心功能列表（用于 features 步骤展示）
     * @returns {Array<object>}
     */
    getCoreFeatures() {
      return CORE_FEATURES.map(f => ({ ...f }))
    },

    // ─── Progress Tracking ───

    /**
     * 获取引导进度
     * @returns {Promise<{current: number, total: number, percentage: number}>}
     */
    async getProgress() {
      const stepIdx = await this.getCurrentStepIndex()
      const total = ONBOARDING_STEPS.length
      return {
        current: stepIdx + 1,
        total,
        percentage: Math.round(((stepIdx + 1) / total) * 100),
      }
    },
  }
}

/** 默认实例（使用 chrome.storage.local），仅在浏览器环境中可用 */
export const bookmarkOnboarding =
  typeof chrome !== 'undefined' && chrome.storage
    ? _createBookmarkOnboardingModule(chrome.storage.local)
    : null
