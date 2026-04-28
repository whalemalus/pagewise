/**
 * Onboarding Module — 新手引导流程
 *
 * 管理首次安装时的分步引导，帮助用户快速上手。
 * 使用 chrome.storage.local 存储完成状态。
 */

const STORAGE_KEY = 'onboardingCompleted';

/** 引导步骤配置 */
const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: '欢迎使用智阅 PageWise！',
    description: '感谢安装智阅 PageWise！这是一个智能技术知识助手，帮助你在浏览网页时即时向 AI 提问，并自动整理成知识库。',
    icon: '👋',
    highlight: null
  },
  {
    id: 'config',
    title: '配置 API',
    description: '首先，让我们配置 AI 服务商。选择一个提供商，填写你的 API Key，然后测试连接是否正常。',
    icon: '⚙️',
    highlight: 'panelSettings'
  },
  {
    id: 'try-it',
    title: '试用功能',
    description: '现在试试发送你的第一条消息吧！在下方输入框中输入问题，或点击快捷按钮开始体验。',
    icon: '💬',
    highlight: 'panelChat'
  },
  {
    id: 'complete',
    title: '你已准备好开始使用！',
    description: '恭喜！你已经了解了基本功能。随时可以在设置中重新查看引导。开始探索技术知识的世界吧！',
    icon: '🎉',
    highlight: null
  }
];

/**
 * 创建 onboarding 模块实例
 * @param {object} storage - chrome.storage.local 兼容接口
 * @returns {object} onboarding API
 */
export function _createOnboardingModule(storage) {
  return {
    /**
     * 检查是否需要显示引导
     * @returns {Promise<boolean>}
     */
    async shouldShowOnboarding() {
      const data = await storage.get(STORAGE_KEY);
      return !data[STORAGE_KEY];
    },

    /**
     * 标记引导完成
     * @returns {Promise<void>}
     */
    async completeOnboarding() {
      await storage.set({ [STORAGE_KEY]: true });
    },

    /**
     * 重置引导状态（设置中重新触发用）
     * @returns {Promise<void>}
     */
    async resetOnboarding() {
      await storage.remove(STORAGE_KEY);
    },

    /**
     * 获取引导步骤配置
     * @returns {Array<object>}
     */
    getStepConfig() {
      return ONBOARDING_STEPS.map(s => ({ ...s }));
    }
  };
}

/** 默认实例（使用 chrome.storage.local），仅在浏览器环境中可用 */
export const onboarding = typeof chrome !== 'undefined' && chrome.storage
  ? _createOnboardingModule(chrome.storage.local)
  : null;
