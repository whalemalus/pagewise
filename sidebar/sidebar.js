/**
 * Sidebar - 侧边栏主逻辑（集成智能系统）
 */

import { AIClient, estimateMessagesTokens } from '../lib/ai-client.js';
import { SkillEngine } from '../lib/skill-engine.js';
import { PageSense } from '../lib/page-sense.js';
import { MemorySystem } from '../lib/memory.js';
import { AgentLoop } from '../lib/agent-loop.js';
import { EvolutionEngine } from '../lib/evolution.js';
import { allBuiltinSkills } from '../skills/builtin-skills.js';
import { parseImportFiles } from '../lib/importer.js';
import { saveHighlight, getHighlightsByUrl, getAllHighlightsFlat, deleteHighlight, deleteHighlightsByUrl } from '../lib/highlight-store.js';
import { calculateNextReview, getDueCards, formatReviewDate, initializeReviewData } from '../lib/spaced-repetition.js';
import { buildGraphData, forceDirectedLayout } from '../lib/knowledge-graph.js';
import { getSettings, saveSettings, renderMarkdown, formatTime, debounce, throttle, saveConversation, loadConversation, clearConversation, saveProfiles, loadProfiles } from '../lib/utils.js';
import { saveConversation as saveConversationIDB, getConversationByUrl, getAllConversations, deleteConversation, deleteOldConversations, searchConversations } from '../lib/conversation-store.js';
import { saveSkill as saveCustomSkill, getAllSkills as getAllCustomSkills, getSkillById as getCustomSkillById, deleteSkill as deleteCustomSkill, toggleSkill as toggleCustomSkill, renderTemplate } from '../lib/custom-skills.js';
import { buildTopicStats, buildLearningPathPrompt, parseLearningPathResponse, validateLearningPath, renderLearningPathHTML } from '../lib/learning-path.js';
import { getAllTemplates, saveTemplate as savePromptTemplate, deleteTemplate as deletePromptTemplate, renderTemplate as renderPromptTemplate } from '../lib/prompt-templates.js';
import { getStats, incrementCounter, recordDailyUsage, recordSkillUsage, getTopSkills, getUsageTrend, resetStats } from '../lib/stats.js';

// ==================== 提供商预设 ====================

const PROVIDERS = {
  openai: { name: 'OpenAI', icon: '🟢', protocol: 'openai', baseUrl: 'https://api.openai.com', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  claude: { name: 'Claude', icon: '🟣', protocol: 'claude', baseUrl: 'https://api.anthropic.com', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'] },
  deepseek: { name: 'DeepSeek', icon: '🔵', protocol: 'openai', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'] },
  ollama: { name: 'Ollama', icon: '🟠', protocol: 'openai', baseUrl: 'http://localhost:11434', models: ['llama3', 'codellama', 'mistral', 'qwen2'] },
  custom: { name: '自定义', icon: '⚙️', protocol: 'openai', baseUrl: '', models: [] }
};

class SidebarApp {
  constructor() {
    this.aiClient = null;
    this.settings = {};
    this.conversationHistory = [];
    this.currentPageContent = null;
    this.selectedEntryId = null;
    this.activeTag = null;
    this.agentRunning = false;
    this.historyVisible = false;

    // Provider / Profile 状态
    this.selectedProvider = 'openai';
    this.profiles = [];
    this.activeProfileId = 'default';

    // 智能系统
    this.skills = new SkillEngine();
    this.pageSense = new PageSense();
    this.memory = new MemorySystem();
    this.evolution = new EvolutionEngine();

    // 搜索模式
    this.searchMode = 'keyword'; // 'keyword' | 'semantic'

    // 批量操作状态
    this.selectMode = false;
    this.selectedIds = new Set();

    // 图片问答状态
    this.selectedImageUrl = null;
    this.pageImages = [];

    // 对话分支状态
    this.branches = [];
    this.activeBranchId = null;
    this.mainConversationSnapshot = null; // 主对话快照（进入分支前）

    // 性能优化：分页加载状态
    this._pageSize = 20;
    this._currentPage = 0;
    this._allFilteredEntries = [];
    this._isLoadingMore = false;
    this._hasMoreEntries = true;
    this._loadMoreObserver = null;

    // 性能优化：懒加载标记
    this._statsLoaded = false;

    // 复习系统状态
    this.reviewCards = [];
    this.reviewIndex = 0;
    this.reviewCorrect = 0;
    this.reviewTotal = 0;

    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.memory.init();
    this.skills.registerAll(allBuiltinSkills);
    await this.loadCustomSkills();
    this.bindElements();
    this.bindEvents();
    this.loadPageContext();
    this.loadKnowledgeTags();
    this.listenMessages();
    this.restoreConversation();
    this.bindCopyButtonEvents();
    this.applyTheme();
    this.renderProviderCards();
    await this.loadProfileList();
    this.checkDueReviews();
    this.updateTokenDisplay();

    // 清理超过 30 天的旧对话
    try {
      await deleteOldConversations(30);
    } catch (e) {
      // 静默处理
    }
  }

  // ==================== 初始化 ====================

  bindElements() {
    this.tabs = document.querySelectorAll('.tab');
    this.panels = document.querySelectorAll('.panel');
    this.chatArea = document.getElementById('chatArea');
    this.userInput = document.getElementById('userInput');
    this.btnSend = document.getElementById('btnSend');
    this.selectionHint = document.getElementById('selectionHint');
    this.pageTitle = document.getElementById('pageTitle');
    this.btnExtract = document.getElementById('btnExtract');
    this.btnRefresh = document.getElementById('btnRefresh');
    this.btnSummarize = document.getElementById('btnSummarize');
    this.btnExplain = document.getElementById('btnExplain');
    this.searchInput = document.getElementById('searchInput');
    this.searchModeToggle = document.getElementById('searchModeToggle');
    this.tagFilter = document.getElementById('tagFilter');
    this.knowledgeList = document.getElementById('knowledgeList');
    this.emptyKnowledge = document.getElementById('emptyKnowledge');
    this.knowledgeDetail = document.getElementById('knowledgeDetail');
    this.detailContent = document.getElementById('detailContent');
    this.btnBack = document.getElementById('btnBack');
    this.btnEdit = document.getElementById('btnEdit');
    this.btnDelete = document.getElementById('btnDelete');
    this.btnExportMd = document.getElementById('btnExportMd');
    this.btnExportJson = document.getElementById('btnExportJson');
    this.btnImport = document.getElementById('btnImport');
    this.fileImport = document.getElementById('fileImport');
    this.apiBaseUrlInput = document.getElementById('apiBaseUrl');
    this.apiKeyInput = document.getElementById('apiKey');
    this.modelInput = document.getElementById('model');
    this.maxTokensInput = document.getElementById('maxTokens');
    this.autoExtractCheckbox = document.getElementById('autoExtract');
    this.themeSelect = document.getElementById('theme');
    this.btnSaveSettings = document.getElementById('btnSaveSettings');
    this.settingsStatus = document.getElementById('settingsStatus');
    this.btnTestConnection = document.getElementById('btnTestConnection');
    this.testResult = document.getElementById('testResult');

    // Skills
    this.skillsSummary = document.getElementById('skillsSummary');
    this.skillsList = document.getElementById('skillsList');

    // Skill Editor
    this.skillEditor = document.getElementById('skillEditor');
    this.skillEditorTitle = document.getElementById('skillEditorTitle');
    this.skillEditorId = document.getElementById('skillEditorId');
    this.skillEditorName = document.getElementById('skillEditorName');
    this.skillEditorDesc = document.getElementById('skillEditorDesc');
    this.skillEditorCategory = document.getElementById('skillEditorCategory');
    this.skillEditorPrompt = document.getElementById('skillEditorPrompt');
    this.skillEditorTrigger = document.getElementById('skillEditorTrigger');
    this.btnCreateSkill = document.getElementById('btnCreateSkill');
    this.btnCloseSkillEditor = document.getElementById('btnCloseSkillEditor');
    this.btnCancelSkillEditor = document.getElementById('btnCancelSkillEditor');
    this.btnSaveSkillEditor = document.getElementById('btnSaveSkillEditor');
    this.skillsCustomCount = document.getElementById('skillsCustomCount');

    // Evolution
    this.evolutionStats = document.getElementById('evolutionStats');
    this.evolutionLog = document.getElementById('evolutionLog');
    this.btnResetEvolution = document.getElementById('btnResetEvolution');

    // Related entries
    this.relatedEntries = document.getElementById('relatedEntries');
    this.relatedList = document.getElementById('relatedList');

    // Toast 容器
    this.toastContainer = document.getElementById('toastContainer');

    // 间隔复习
    this.reviewBanner = document.getElementById('reviewBanner');
    this.reviewBannerText = document.getElementById('reviewBannerText');
    this.btnStartReview = document.getElementById('btnStartReview');
    this.reviewOverlay = document.getElementById('reviewOverlay');
    this.reviewProgress = document.getElementById('reviewProgress');
    this.btnCloseReview = document.getElementById('btnCloseReview');
    this.reviewCard = document.getElementById('reviewCard');
    this.reviewQuestion = document.getElementById('reviewQuestion');
    this.btnShowAnswer = document.getElementById('btnShowAnswer');
    this.reviewAnswer = document.getElementById('reviewAnswer');
    this.reviewRating = document.getElementById('reviewRating');
    this.reviewSummary = document.getElementById('reviewSummary');
    this.summaryStats = document.getElementById('summaryStats');
    this.btnReviewDone = document.getElementById('btnReviewDone');

    // API 配置（新）
    this.providerCards = document.getElementById('providerCards');
    this.profileSelect = document.getElementById('profileSelect');
    this.btnSaveProfile = document.getElementById('btnSaveProfile');
    this.btnDeleteProfile = document.getElementById('btnDeleteProfile');
    this.modelSelect = document.getElementById('modelSelect');
    this.btnFetchModels = document.getElementById('btnFetchModels');

    // Page Preview
    this.previewTitle = document.getElementById('previewTitle');
    this.previewMeta = document.getElementById('previewMeta');
    this.previewContent = document.getElementById('previewContent');
    this.previewCode = document.getElementById('previewCode');
    this.previewImages = document.getElementById('previewImages');

    // Highlights
    this.highlightsPanel = document.getElementById('highlightsPanel');
    this.highlightsList = document.getElementById('highlightsList');
    this.highlightsCount = document.getElementById('highlightsCount');
    this.emptyHighlights = document.getElementById('emptyHighlights');
    this.btnClearHighlights = document.getElementById('btnClearHighlights');

    // Knowledge Graph
    this.knowledgeGraphPanel = document.getElementById('knowledgeGraphPanel');
    this.knowledgeGraphCanvas = document.getElementById('knowledgeGraphCanvas');
    this.graphInfo = document.getElementById('graphInfo');
    this.graphTooltip = document.getElementById('graphTooltip');
    this.btnRefreshGraph = document.getElementById('btnRefreshGraph');

    // Learning Path
    this.learningPathPanel = document.getElementById('learningPathPanel');
    this.learningPathContent = document.getElementById('learningPathContent');
    this.learningPathStatus = document.getElementById('learningPathStatus');
    this.btnGenerateLearningPath = document.getElementById('btnGenerateLearningPath');

    // Export Conversation
    this.btnExportConversation = document.getElementById('btnExportConversation');

    // Batch Operations
    this.batchToolbar = document.getElementById('batchToolbar');
    this.batchSelectAll = document.getElementById('batchSelectAll');
    this.batchCount = document.getElementById('batchCount');
    this.btnSelectMode = document.getElementById('btnSelectMode');
    this.btnBatchTag = document.getElementById('btnBatchTag');
    this.btnBatchDelete = document.getElementById('btnBatchDelete');
    this.btnBatchExport = document.getElementById('btnBatchExport');
    this.batchFloatingBar = document.getElementById('batchFloatingBar');
    this.batchFloatingCount = document.getElementById('batchFloatingCount');
    this.btnBatchTagFloat = document.getElementById('btnBatchTagFloat');
    this.btnBatchDeleteFloat = document.getElementById('btnBatchDeleteFloat');
    this.btnBatchExportFloat = document.getElementById('btnBatchExportFloat');
    this.btnBatchExit = document.getElementById('btnBatchExit');

    // History
    this.btnHistory = document.getElementById('btnHistory');
    this.historyPanel = document.getElementById('historyPanel');
    this.historyList = document.getElementById('historyList');
    this.historySearch = document.getElementById('historySearch');
    this.btnClearHistory = document.getElementById('btnClearHistory');

    // Multi-Tab Selector
    this.btnMultiTab = document.getElementById('btnMultiTab');
    this.btnMultiTabChat = document.getElementById('btnMultiTabChat');
    this.tabSelectorModal = document.getElementById('tabSelectorModal');
    this.tabSelectorBody = document.getElementById('tabSelectorBody');
    this.tabSelectorCount = document.getElementById('tabSelectorCount');
    this.tabSelectorClose = document.getElementById('tabSelectorClose');
    this.tabSelectorCancel = document.getElementById('tabSelectorCancel');
    this.tabSelectorConfirm = document.getElementById('tabSelectorConfirm');

    // Prompt 模板
    this.btnTemplate = document.getElementById('btnTemplate');
    this.templatePopup = document.getElementById('templatePopup');
    this.templateList = document.getElementById('templateList');
    this.btnCloseTemplate = document.getElementById('btnCloseTemplate');
    this.btnSaveAsTemplate = document.getElementById('btnSaveAsTemplate');
    this.templateForm = document.getElementById('templateForm');
    this.tplName = document.getElementById('tplName');
    this.tplContent = document.getElementById('tplContent');
    this.tplCategory = document.getElementById('tplCategory');
    this.tplEditId = document.getElementById('tplEditId');
    this.btnCancelTemplateForm = document.getElementById('btnCancelTemplateForm');
    this.btnConfirmTemplateForm = document.getElementById('btnConfirmTemplateForm');

    // 对话分支
    this.branchBar = document.getElementById('branchBar');
    this.branchBarText = document.getElementById('branchBarText');
    this.btnReturnMain = document.getElementById('btnReturnMain');

    // Token 用量显示
    this.tokenDisplay = document.getElementById('tokenDisplay');

    // 使用统计
    this.statsGrid = document.getElementById('statsGrid');
    this.statsSkillsList = document.getElementById('statsSkillsList');
    this.statsTrendChart = document.getElementById('statsTrendChart');
    this.btnResetStats = document.getElementById('btnResetStats');
  }

  bindEvents() {
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
    this.btnSend.addEventListener('click', () => this.sendMessage());
    this.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    this.userInput.addEventListener('input', () => {
      this.userInput.style.height = 'auto';
      this.userInput.style.height = Math.min(this.userInput.scrollHeight, 120) + 'px';
    });
    this.btnExtract.addEventListener('click', () => this.extractContent());
    this.btnRefresh.addEventListener('click', () => this.loadPageContext());
    this.btnSummarize.addEventListener('click', () => this.quickSummarize());
    this.btnExplain.addEventListener('click', () => this.quickExplain());
    this.searchInput.addEventListener('input', debounce(() => this.searchKnowledge(), 300));

    // 搜索模式切换
    if (this.searchModeToggle) {
      this.searchModeToggle.querySelectorAll('.search-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.searchModeToggle.querySelectorAll('.search-mode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.searchMode = btn.dataset.mode;
          // 重新执行搜索
          this.searchKnowledge();
        });
      });
    }
    this.btnBack.addEventListener('click', () => this.showKnowledgeList());
    this.btnDelete.addEventListener('click', () => this.deleteEntry());
    this.btnExportMd.addEventListener('click', () => this.exportMarkdown());
    this.btnExportJson.addEventListener('click', () => this.exportJson());
    this.btnImport.addEventListener('click', () => this.fileImport.click());
    this.fileImport.addEventListener('change', (e) => this.importFiles(e.target.files));
    this.btnSaveSettings.addEventListener('click', () => this.saveSettingsForm());
    this.btnTestConnection.addEventListener('click', () => this.testConnection());

    // 进化数据重置
    this.btnResetEvolution.addEventListener('click', async () => {
      if (!confirm('确定重置所有进化数据？助手将回到初始状态。')) return;
      await this.evolution.reset();
      this.loadEvolutionStats();
      this.addSystemMessage('进化数据已重置');
    });

    // 技能分类筛选
    document.querySelectorAll('.skills-filter .tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.skills-filter .tag-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.loadSkillsList(chip.dataset.category);
      });
    });

    // 技能编辑器
    if (this.btnCreateSkill) {
      this.btnCreateSkill.addEventListener('click', () => this.openSkillEditor());
    }
    if (this.btnCloseSkillEditor) {
      this.btnCloseSkillEditor.addEventListener('click', () => this.closeSkillEditor());
    }
    if (this.btnCancelSkillEditor) {
      this.btnCancelSkillEditor.addEventListener('click', () => this.closeSkillEditor());
    }
    if (this.btnSaveSkillEditor) {
      this.btnSaveSkillEditor.addEventListener('click', () => this.handleSaveSkill());
    }

    // API 配置（新）
    this.btnFetchModels.addEventListener('click', () => this.fetchModels());
    this.btnSaveProfile.addEventListener('click', () => this.saveProfile());
    this.btnDeleteProfile.addEventListener('click', () => this.deleteProfile());
    this.profileSelect.addEventListener('change', () => this.switchProfile(this.profileSelect.value));
    this.modelSelect.addEventListener('change', () => {
      if (this.modelSelect.value) {
        this.modelInput.value = this.modelSelect.value;
      }
    });

    // 知识库子标签切换
    document.querySelectorAll('.knowledge-subtab').forEach(tab => {
      tab.addEventListener('click', () => this.switchKnowledgeSubtab(tab.dataset.subtab));
    });

    // 高亮标注：清空全部
    if (this.btnClearHighlights) {
      this.btnClearHighlights.addEventListener('click', () => this.clearAllHighlights());
    }

    // 知识图谱：刷新
    if (this.btnRefreshGraph) {
      this.btnRefreshGraph.addEventListener('click', () => this.renderKnowledgeGraph());
    }

    // 学习路径：生成
    if (this.btnGenerateLearningPath) {
      this.btnGenerateLearningPath.addEventListener('click', () => this.generateLearningPath());
    }

    // 导出对话
    if (this.btnExportConversation) {
      this.btnExportConversation.addEventListener('click', () => this.exportConversation());
    }

    // 历史对话
    if (this.btnHistory) {
      this.btnHistory.addEventListener('click', () => this.toggleHistoryPanel());
    }
    if (this.historySearch) {
      this.historySearch.addEventListener('input', debounce(() => this.loadHistoryList(), 300));
    }
    if (this.btnClearHistory) {
      this.btnClearHistory.addEventListener('click', () => this.clearAllHistory());
    }

    // 多标签页分析
    if (this.btnMultiTab) {
      this.btnMultiTab.addEventListener('click', () => this.showMultiTabSelector());
    }
    if (this.btnMultiTabChat) {
      this.btnMultiTabChat.addEventListener('click', () => this.showMultiTabSelector());
    }
    if (this.tabSelectorClose) {
      this.tabSelectorClose.addEventListener('click', () => this.hideMultiTabSelector());
    }
    if (this.tabSelectorCancel) {
      this.tabSelectorCancel.addEventListener('click', () => this.hideMultiTabSelector());
    }
    if (this.tabSelectorConfirm) {
      this.tabSelectorConfirm.addEventListener('click', () => this.confirmMultiTabAnalysis());
    }
    if (this.tabSelectorModal) {
      this.tabSelectorModal.querySelector('.tab-selector-overlay')?.addEventListener('click', () => this.hideMultiTabSelector());
    }

    // 间隔复习
    if (this.btnStartReview) {
      this.btnStartReview.addEventListener('click', () => this.startReview());
    }
    if (this.btnShowAnswer) {
      this.btnShowAnswer.addEventListener('click', () => this.showReviewAnswer());
    }
    if (this.btnCloseReview) {
      this.btnCloseReview.addEventListener('click', () => this.closeReview());
    }
    if (this.btnReviewDone) {
      this.btnReviewDone.addEventListener('click', () => this.closeReview());
    }
    // 评分按钮
    document.querySelectorAll('.btn-rate').forEach(btn => {
      btn.addEventListener('click', () => {
        const quality = parseInt(btn.dataset.quality, 10);
        this.rateReviewCard(quality);
      });
    });

    // 批量操作
    if (this.btnSelectMode) {
      this.btnSelectMode.addEventListener('click', () => this.toggleSelectMode());
    }
    if (this.batchSelectAll) {
      this.batchSelectAll.addEventListener('change', () => this.toggleSelectAll());
    }
    // 顶部工具栏按钮
    if (this.btnBatchTag) {
      this.btnBatchTag.addEventListener('click', () => this.batchTag());
    }
    if (this.btnBatchDelete) {
      this.btnBatchDelete.addEventListener('click', () => this.batchDelete());
    }
    if (this.btnBatchExport) {
      this.btnBatchExport.addEventListener('click', () => this.batchExport());
    }
    // 浮动底栏按钮
    if (this.btnBatchTagFloat) {
      this.btnBatchTagFloat.addEventListener('click', () => this.batchTag());
    }
    if (this.btnBatchDeleteFloat) {
      this.btnBatchDeleteFloat.addEventListener('click', () => this.batchDelete());
    }
    if (this.btnBatchExportFloat) {
      this.btnBatchExportFloat.addEventListener('click', () => this.batchExport());
    }
    if (this.btnBatchExit) {
      this.btnBatchExit.addEventListener('click', () => this.toggleSelectMode());
    }

    // Prompt 模板
    if (this.btnTemplate) {
      this.btnTemplate.addEventListener('click', () => this.toggleTemplatePopup());
    }
    if (this.btnCloseTemplate) {
      this.btnCloseTemplate.addEventListener('click', () => this.hideTemplatePopup());
    }
    if (this.btnSaveAsTemplate) {
      this.btnSaveAsTemplate.addEventListener('click', () => this.openTemplateForm());
    }
    if (this.btnCancelTemplateForm) {
      this.btnCancelTemplateForm.addEventListener('click', () => this.closeTemplateForm());
    }
    if (this.btnConfirmTemplateForm) {
      this.btnConfirmTemplateForm.addEventListener('click', () => this.handleSaveTemplate());
    }

    // 对话分支
    if (this.btnReturnMain) {
      this.btnReturnMain.addEventListener('click', () => this.returnToMainConversation());
    }

    // 使用统计重置
    if (this.btnResetStats) {
      this.btnResetStats.addEventListener('click', async () => {
        if (!confirm('确定重置所有统计数据？')) return;
        await resetStats();
        this.loadStatsPanel();
        this.addSystemMessage('统计数据已重置');
      });
    }
  }

  async loadSettings() {
    this.settings = await getSettings();
    if (this.settings.apiKey) {
      this.aiClient = new AIClient({
        apiKey: this.settings.apiKey,
        baseUrl: this.settings.apiBaseUrl,
        model: this.settings.model,
        maxTokens: this.settings.maxTokens,
        protocol: this.settings.apiProtocol
      });
    }
  }

  // ==================== 消息监听 ====================

  async listenMessages() {
    await this.checkPendingAction();
    chrome.storage.session.onChanged.addListener((changes) => {
      if (changes.pendingAction) {
        const action = changes.pendingAction.newValue;
        if (action) {
          chrome.storage.session.remove('pendingAction');
          this.handlePendingAction(action);
        }
      }
    });
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'contextMenuAsk' || request.action === 'contextMenuSummarize') {
        this.handlePendingAction(request);
      } else if (request.action === 'switchToKnowledge') {
        this.switchTab('knowledge');
      } else if (request.action === 'shortcutSummarize') {
        // 快捷键 Ctrl+Shift+S 触发自动总结
        this.quickSummarize();
      }
      sendResponse({ received: true });
    });
  }

  async checkPendingAction() {
    try {
      const { pendingAction } = await chrome.storage.session.get('pendingAction');
      if (pendingAction) {
        await chrome.storage.session.remove('pendingAction');
        this.handlePendingAction(pendingAction);
      }
    } catch (e) {}
  }

  handlePendingAction(data) {
    if (!data || !data.action) return;
    const key = `${data.action}:${data.selection || ''}`;
    const now = Date.now();
    if (this._lastPendingAction === key && now - this._lastPendingTime < 1000) return;
    this._lastPendingAction = key;
    this._lastPendingTime = now;

    this.switchTab('chat');

    if (data.action === 'contextMenuAsk' || data.action === 'askAI') {
      if (data.selection) {
        this.userInput.value = `请解释以下内容：\n"${data.selection}"`;
        setTimeout(() => this.sendMessage(), 500);
      }
    } else if (data.action === 'contextMenuSummarize' || data.action === 'summarizePage') {
      this.userInput.value = '请总结当前页面的核心内容，提炼出关键知识点';
      setTimeout(() => this.sendMessage(), 500);
    }
  }

  // ==================== Tab 切换 ====================

  switchTab(tabName) {
    this.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    this.panels.forEach(p => p.classList.toggle('active', p.id === `panel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`));
    if (tabName === 'skills') this.loadSkillsList();
    else if (tabName === 'knowledge') {
      this.loadKnowledgeList();
      // 高亮面板懒加载：只在切换到高亮子标签时加载
    }
    else if (tabName === 'settings') {
      this.loadSettingsForm();
      this.loadEvolutionStats();
      // 统计面板懒加载：只在首次切换时加载
      if (!this._statsLoaded) {
        this._statsLoaded = true;
        this.loadStatsPanel();
      }
    }
    else if (tabName === 'page') this.loadPagePreview();
  }

  // ==================== 页面上下文 ====================

  async loadPageContext() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        this.pageTitle.textContent = tab.title || '未知页面';
        this.currentTabId = tab.id;
        this.currentTabUrl = tab.url;

        // 检测 YouTube 页面
        const isYouTube = tab.url?.includes('youtube.com/watch');
        this.isYouTubePage = isYouTube;

        if (this.settings.autoExtract) this.extractContent();

        // YouTube 页面显示快捷按钮
        if (isYouTube) {
          this.showYouTubeQuickActions();
        }

        // API 文档页面检测并显示快捷按钮
        this.detectAndShowApiDocActions(tab.id);

        // GitHub 仓库页面检测并显示快捷按钮
        this.detectAndShowGitHubRepoActions(tab.id);

        // PDF 文档页面检测并显示快捷按钮
        this.detectAndShowPdfActions(tab.id);

        // 更新页面图标
        const pageIcon = document.querySelector('.page-icon');
        if (pageIcon) {
          const isPdf = (tab.url || '').toLowerCase().endsWith('.pdf') || (tab.url || '').toLowerCase().includes('.pdf?');
          pageIcon.textContent = isPdf ? '📑' : isYouTube ? '📺' : '📄';
        }
      }
    } catch (e) {
      this.pageTitle.textContent = '无法获取页面信息';
    }
  }

  async extractContent() {
    if (!this.currentTabId) {
      this.addSystemMessage('无法获取当前标签页');
      return false;
    }
    try {
      const response = await chrome.tabs.sendMessage(this.currentTabId, { action: 'extractContent' });
      if (response && response.content) {
        this.currentPageContent = response;
        this.addSystemMessage(`已提取页面内容：${response.content.length} 字，${response.codeBlocks?.length || 0} 个代码块`);

        // 页面感知
        const sense = this.pageSense.analyze(response);
        if (sense.types.length > 0) {
          const icons = sense.types.map(t => `${t.icon} ${t.label}`).join(' | ');
          this.addSystemMessage(`页面类型：${icons}`);
        }

        // 显示推荐技能
        const suggestions = this.pageSense.suggestSkills(response, this.skills);
        if (suggestions.length > 0) {
          this.showSkillSuggestions(suggestions);
        }

        return true;
      }
      this.addSystemMessage('页面内容为空，请确认页面已完全加载');
      return false;
    } catch (e) {
      this.addSystemMessage('提取失败：请刷新页面后重试');
      return false;
    }
  }

  /**
   * 加载页面内容预览面板
   * 当切换到"页面"标签时调用，展示 AI 实际看到的内容
   */
  async loadPagePreview() {
    // 如果还没有提取内容，先尝试提取
    if (!this.currentPageContent) {
      this.previewTitle.textContent = this.pageTitle?.textContent || '-';
      this.previewMeta.textContent = '正在提取页面内容...';
      this.previewContent.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>正在提取...</p></div>';
      this.previewCode.innerHTML = '';
      await this.extractContent();
    }

    if (!this.currentPageContent) {
      this.previewTitle.textContent = this.pageTitle?.textContent || '-';
      this.previewMeta.textContent = '';
      this.previewContent.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><p>无法提取页面内容，请刷新页面后重试</p></div>';
      this.previewCode.innerHTML = '';
      return;
    }

    const { url, title, content, codeBlocks } = this.currentPageContent;

    // 标题
    this.previewTitle.textContent = title || '-';

    // 元信息：URL + 字数
    const charCount = content ? content.length : 0;
    const metaParts = [];
    if (url) metaParts.push(this.escapeHtml(url));
    metaParts.push(`${charCount} 字`);
    if (codeBlocks && codeBlocks.length > 0) {
      metaParts.push(`${codeBlocks.length} 个代码块`);
    }
    this.previewMeta.innerHTML = metaParts.join(' · ');

    // 正文内容（前 2000 字符）
    const MAX_CHARS = 2000;
    if (content && content.length > 0) {
      const displayText = content.slice(0, MAX_CHARS);
      const truncated = content.length > MAX_CHARS;
      let html = `<pre class="page-preview-text">${this.escapeHtml(displayText)}</pre>`;
      if (truncated) {
        html += '<div class="page-preview-truncated">⚠️ 内容已截取，仅显示前 2000 字符（共 ' + charCount + ' 字）</div>';
      }
      this.previewContent.innerHTML = html;
    } else {
      this.previewContent.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>未提取到文本内容</p></div>';
    }

    // 代码块列表
    if (codeBlocks && codeBlocks.length > 0) {
      let codeHtml = '<div class="page-preview-code-header">代码块</div>';
      codeBlocks.forEach((block, i) => {
        const lang = block.lang || 'text';
        const preview = block.code.slice(0, 500);
        const codeTruncated = block.code.length > 500;
        codeHtml += `
          <div class="page-preview-code-block">
            <div class="page-preview-code-lang">${this.escapeHtml(lang)}</div>
            <pre><code>${this.escapeHtml(preview)}${codeTruncated ? '\n... (已截取)' : ''}</code></pre>
          </div>
        `;
      });
      this.previewCode.innerHTML = codeHtml;
    } else {
      this.previewCode.innerHTML = '';
    }
  }

  /**
   * 提取并展示页面图片缩略图
   */
  async loadPageImages() {
    if (!this.previewImages) return;
    this.previewImages.innerHTML = '';

    try {
      if (!this.currentTabId) return;
      const response = await chrome.tabs.sendMessage(this.currentTabId, { action: 'extractPageImages' });
      if (!response || !response.images || response.images.length === 0) return;

      this.pageImages = response.images;

      let html = '<div class="page-preview-images-header">🖼️ 页面图片（点击提问）</div>';
      html += '<div class="image-grid">';
      response.images.forEach((img, i) => {
        const alt = img.alt ? this.escapeHtml(img.alt) : '';
        html += `
          <div class="image-grid-item" data-index="${i}" data-src="${this.escapeHtml(img.src)}" title="${alt || img.src}">
            <img src="${this.escapeHtml(img.src)}" alt="${alt}" loading="lazy" />
            ${alt ? `<span class="image-alt">${alt}</span>` : ''}
            <span class="image-ask-badge">🔍 问AI</span>
          </div>
        `;
      });
      html += '</div>';
      this.previewImages.innerHTML = html;

      // 绑定点击事件
      this.previewImages.querySelectorAll('.image-grid-item').forEach(item => {
        item.addEventListener('click', () => {
          const src = item.dataset.src;
          // 切换选中状态
          const wasSelected = item.classList.contains('selected');
          this.previewImages.querySelectorAll('.image-grid-item').forEach(el => el.classList.remove('selected'));

          if (wasSelected) {
            this.selectedImageUrl = null;
          } else {
            item.classList.add('selected');
            this.selectedImageUrl = src;
            // 切换到聊天 tab 并填入提示
            this.userInput.value = '请解释这张图片的内容';
            this.switchTab('chat');
          }
        });
      });
    } catch (e) {
      // content script 可能未注入，静默处理
    }
  }

  /**
   * 检查当前模型是否支持 vision（视觉）能力
   * @returns {boolean}
   */
  supportsVision() {
    const model = (this.settings.model || '').toLowerCase();
    // 已知支持 vision 的模型关键词
    const visionKeywords = ['gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'claude-sonnet', 'claude-opus', 'claude-haiku'];
    return visionKeywords.some(kw => model.includes(kw));
  }

  showSkillSuggestions(suggestions) {
    const container = document.createElement('div');
    container.className = 'skill-suggestions';
    container.innerHTML = `
      <div class="skill-suggest-label">推荐操作：</div>
      <div class="skill-suggest-btns">
        ${suggestions.map(s => {
          const skill = this.skills.get(s.skillId);
          return skill ? `<button class="skill-suggest-btn" data-skill="${s.skillId}" title="${s.reason}">${skill.name}</button>` : '';
        }).join('')}
      </div>
    `;

    container.querySelectorAll('.skill-suggest-btn').forEach(btn => {
      btn.addEventListener('click', () => this.executeSkill(btn.dataset.skill));
    });

    this.chatArea.appendChild(container);
    this.scrollToBottom();
  }

  async executeSkill(skillId) {
    if (!this.aiClient) {
      this.addSystemMessage('请先配置 API Key');
      this.switchTab('settings');
      return;
    }

    if (!this.currentPageContent) {
      await this.extractContent();
    }

    const skill = this.skills.get(skillId);
    this.addSystemMessage(`正在执行：${skill.name}...`);
    const loadingEl = this.showLoading();

    try {
      const result = await this.skills.execute(skillId, {
        pageContext: this.currentPageContent
      }, { ai: this.aiClient, memory: this.memory });

      loadingEl.remove();

      const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const messageEl = this.addAIMessage(content);

      // 保存到对话历史
      this.conversationHistory.push(
        { role: 'user', content: `[技能] ${skill.name}` },
        { role: 'assistant', content }
      );

      // 记录技能使用统计
      recordSkillUsage(skillId);

    } catch (error) {
      loadingEl.remove();
      this.addSystemMessage(`技能执行失败：${error.message}`);
    }
  }

  // ==================== 技能面板 ====================

  loadSkillsList(category = 'all') {
    const allSkills = this.skills.getAll();
    const filtered = category === 'all'
      ? allSkills
      : allSkills.filter(s => s.category === category);

    const enabledCount = allSkills.filter(s => s.enabled).length;
    const customCount = allSkills.filter(s => s.category === 'custom' || (s.id && s.id.startsWith('skill_'))).length;
    this.skillsSummary.textContent = `共 ${allSkills.length} 个技能，${enabledCount} 个已启用`;
    if (this.skillsCustomCount) {
      this.skillsCustomCount.textContent = customCount > 0 ? `自定义: ${customCount}/20` : '';
    }

    if (filtered.length === 0) {
      this.skillsList.innerHTML = `<div class="empty-state"><p>该分类下没有技能</p></div>`;
      return;
    }

    const categoryIcons = {
      code: '💻', debug: '🐛', doc: '📡', learning: '📚', export: '📤', general: '⚙️', custom: '🔧'
    };

    this.skillsList.innerHTML = filtered.map(skill => {
      const isCustom = skill.id && skill.id.startsWith('skill_');
      return `
      <div class="skill-card ${skill.enabled ? '' : 'disabled'}" data-id="${skill.id}">
        <div class="skill-card-header">
          <div class="skill-card-name">
            ${categoryIcons[skill.category] || '⚙️'} ${this.escapeHtml(skill.name)}
            ${isCustom ? '<span class="skill-badge-custom">自定义</span>' : ''}
          </div>
          <span class="skill-card-category">${this.escapeHtml(skill.category)}</span>
        </div>
        <div class="skill-card-desc">${this.escapeHtml(skill.description)}</div>
        <div class="skill-card-footer">
          <div class="skill-card-trigger">
            ${skill.trigger && skill.trigger.type === 'auto' ? '🟢 自动触发' : '🔵 手动触发'}
          </div>
          <div class="skill-card-actions">
            ${isCustom ? `<button class="skill-card-edit-btn" data-id="${skill.id}">编辑</button>` : ''}
            ${isCustom ? `<button class="skill-card-delete-btn" data-id="${skill.id}">删除</button>` : ''}
            <button class="skill-run-btn" data-id="${skill.id}" ${skill.enabled ? '' : 'disabled'}>运行</button>
            <button class="skill-toggle ${skill.enabled ? 'on' : ''}" data-id="${skill.id}"></button>
          </div>
        </div>
      </div>
    `;
    }).join('');

    // 绑定事件
    this.skillsList.querySelectorAll('.skill-toggle').forEach(btn => {
      btn.addEventListener('click', () => this.toggleSkill(btn.dataset.id, btn));
    });

    this.skillsList.querySelectorAll('.skill-run-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab('chat');
        this.executeSkill(btn.dataset.id);
      });
    });

    // 自定义技能编辑/删除
    this.skillsList.querySelectorAll('.skill-card-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openSkillEditor(btn.dataset.id));
    });

    this.skillsList.querySelectorAll('.skill-card-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleDeleteCustomSkill(btn.dataset.id));
    });
  }

  toggleSkill(skillId, btn) {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    skill.enabled = !skill.enabled;
    btn.classList.toggle('on', skill.enabled);

    const card = btn.closest('.skill-card');
    card.classList.toggle('disabled', !skill.enabled);

    const runBtn = card.querySelector('.skill-run-btn');
    if (runBtn) runBtn.disabled = !skill.enabled;

    // 如果是自定义技能，同步到 IndexedDB
    if (skillId.startsWith('skill_')) {
      toggleCustomSkill(skillId).catch(() => {});
    }

    // 更新统计
    const allSkills = this.skills.getAll();
    const enabledCount = allSkills.filter(s => s.enabled).length;
    this.skillsSummary.textContent = `共 ${allSkills.length} 个技能，${enabledCount} 个已启用`;
  }

  // ==================== 自定义技能管理 ====================

  /**
   * 从 IndexedDB 加载自定义技能并注册到 skillEngine
   */
  async loadCustomSkills() {
    try {
      const customSkills = await getAllCustomSkills();
      for (const skill of customSkills) {
        if (this.skills.get(skill.id)) continue; // 已注册则跳过
        this.skills.register({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.category || 'custom',
          trigger: null,
          parameters: [],
          enabled: skill.enabled,
          execute: async (params, context) => {
            const rendered = renderTemplate(skill.prompt, params);
            if (context && context.ai) {
              return await context.ai.chat([{ role: 'user', content: rendered }]);
            }
            return rendered;
          }
        });
      }
    } catch (e) {
      console.warn('加载自定义技能失败:', e);
    }
  }

  /**
   * 打开技能编辑器（新建或编辑）
   */
  async openSkillEditor(skillId = null) {
    if (!this.skillEditor) return;

    if (skillId) {
      // 编辑模式
      const skill = await getCustomSkillById(skillId);
      if (!skill) return;
      this.skillEditorTitle.textContent = '编辑技能';
      this.skillEditorId.value = skill.id;
      this.skillEditorName.value = skill.name;
      this.skillEditorDesc.value = skill.description || '';
      this.skillEditorCategory.value = skill.category || 'custom';
      this.skillEditorPrompt.value = skill.prompt || '';
      this.skillEditorTrigger.value = skill.trigger?.type || 'manual';
    } else {
      // 新建模式
      this.skillEditorTitle.textContent = '创建自定义技能';
      this.skillEditorId.value = '';
      this.skillEditorName.value = '';
      this.skillEditorDesc.value = '';
      this.skillEditorCategory.value = 'custom';
      this.skillEditorPrompt.value = '';
      this.skillEditorTrigger.value = 'manual';
    }

    this.skillEditor.classList.remove('hidden');
  }

  /**
   * 关闭技能编辑器
   */
  closeSkillEditor() {
    if (this.skillEditor) {
      this.skillEditor.classList.add('hidden');
    }
  }

  /**
   * 保存技能（从编辑器表单）
   */
  async handleSaveSkill() {
    const name = this.skillEditorName.value.trim();
    const description = this.skillEditorDesc.value.trim();
    const category = this.skillEditorCategory.value;
    const prompt = this.skillEditorPrompt.value.trim();
    const triggerType = this.skillEditorTrigger.value;
    const existingId = this.skillEditorId.value;

    if (!name) {
      this.addSystemMessage('请输入技能名称');
      return;
    }
    if (!prompt) {
      this.addSystemMessage('请输入 Prompt 模板');
      return;
    }

    try {
      const skillData = {
        name,
        description,
        category,
        prompt,
        trigger: { type: triggerType }
      };

      if (existingId) {
        skillData.id = existingId;
        // 保留原有的 createdAt
        const existing = await getCustomSkillById(existingId);
        if (existing) skillData.createdAt = existing.createdAt;
      }

      const saved = await saveCustomSkill(skillData);

      // 从 skillEngine 中移除旧的（如果存在），再注册新的
      if (this.skills.get(saved.id)) {
        this.skills.skills.delete(saved.id);
      }

      this.skills.register({
        id: saved.id,
        name: saved.name,
        description: saved.description,
        category: saved.category || 'custom',
        trigger: null,
        parameters: [],
        enabled: saved.enabled,
        execute: async (params, context) => {
          const rendered = renderTemplate(saved.prompt, params);
          if (context && context.ai) {
            return await context.ai.chat([{ role: 'user', content: rendered }]);
          }
          return rendered;
        }
      });

      this.closeSkillEditor();
      this.loadSkillsList();
      this.addSystemMessage(existingId ? `技能「${name}」已更新` : `技能「${name}」已创建`);
    } catch (e) {
      this.addSystemMessage(`保存失败：${e.message}`);
    }
  }

  /**
   * 删除自定义技能
   */
  async handleDeleteCustomSkill(skillId) {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    if (!confirm(`确定删除技能「${skill.name}」？`)) return;

    try {
      await deleteCustomSkill(skillId);
      this.skills.skills.delete(skillId);
      this.loadSkillsList();
      this.addSystemMessage(`技能「${skill.name}」已删除`);
    } catch (e) {
      this.addSystemMessage(`删除失败：${e.message}`);
    }
  }

  // ==================== 对话功能 ====================

  async sendMessage() {
    const text = this.userInput.value.trim();
    if (!text) return;
    // /clear 命令：清除对话
    if (text === '/clear') {
      this.conversationHistory = [];
      this.branches = [];
      this.activeBranchId = null;
      this.mainConversationSnapshot = null;
      this.updateBranchBar();
      await clearConversation();
      this.chatArea.innerHTML = '';
      this.addSystemMessage('对话已清除');
      this.userInput.value = '';
      this.updateTokenDisplay();
      return;
    }

    if (!this.aiClient) {
      this.addSystemMessage('请先在设置中配置 API Key');
      this.switchTab('settings');
      return;
    }

    // 获取选中文本
    let selection = '';
    try {
      const selResponse = await chrome.tabs.sendMessage(this.currentTabId, { action: 'getSelection' });
      selection = selResponse?.selection || '';
    } catch (e) {}

    this.userInput.value = '';
    this.userInput.style.height = 'auto';
    this.addUserMessage(text, selection);

    // 如果没有页面内容，先提取
    if (!this.currentPageContent) {
      const extracted = await this.extractContent();
      if (!extracted) {
        this.currentPageContent = {
          url: this.currentTabUrl || '',
          title: this.pageTitle.textContent || '',
          content: '',
          codeBlocks: [],
          meta: {}
        };
      }
    }

    const contentWithSelection = {
      url: this.currentPageContent?.url || '',
      title: this.currentPageContent?.title || '',
      content: this.currentPageContent?.content || '',
      codeBlocks: this.currentPageContent?.codeBlocks || [],
      meta: this.currentPageContent?.meta || {},
      selection
    };

    // 构建增强 prompt（加入记忆、页面感知、进化策略）
    const memoryPrompt = await this.memory.toPrompt(text, this.aiClient);
    const sensePrompt = this.pageSense.toPrompt(contentWithSelection);
    const skillPrompt = this.skills.toPrompt();
    const evolutionPrompt = this.evolution.getStrategyPrompt();

    const enhancedSystemPrompt = this.aiClient.getSystemPrompt()
      + memoryPrompt + sensePrompt + skillPrompt + evolutionPrompt;

    // 记录交互
    const pageAnalysis = this.pageSense.analyze(contentWithSelection);
    const interactionId = this.evolution.recordInteraction({
      question: text,
      pageType: pageAnalysis.primaryType?.type || 'generic',
      pageUrl: contentWithSelection.url,
      retrievalHits: 0
    });

    const loadingEl = this.showLoading();

    try {
      let fullResponse = '';
      let messageEl = null;

      // 构建用户消息（支持 vision 图片附加）
      const promptText = this.aiClient.buildPageQuestionPrompt(contentWithSelection, text);
      let userMessage;
      if (this.selectedImageUrl) {
        if (!this.supportsVision()) {
          this.addSystemMessage('⚠️ 当前模型不支持图片理解，请切换到支持 vision 的模型（如 GPT-4o、Claude Sonnet 等）');
          this.selectedImageUrl = null;
          return;
        }
        userMessage = {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: this.selectedImageUrl } }
          ]
        };
        this.selectedImageUrl = null; // 用完后清除
      } else {
        userMessage = { role: 'user', content: promptText };
      }

      for await (const chunk of this.aiClient.chatStream(
        [
          ...this.conversationHistory.slice(-6),
          userMessage
        ],
        { systemPrompt: enhancedSystemPrompt }
      )) {
        fullResponse += chunk;
        if (!messageEl) {
          loadingEl.remove();
          messageEl = this.addAIMessage('');
        }
        this.updateAIMessage(messageEl, fullResponse);
      }

      // 检查是否有技能调用指令
      await this.handleSkillCalls(fullResponse, contentWithSelection);

      // 更新交互记录
      const interaction = this.evolution.interactions.find(i => i.id === interactionId);
      if (interaction) {
        interaction.answerLength = fullResponse.length;
      }

      // 保存对话历史
      this.conversationHistory.push(
        { role: 'user', content: text },
        { role: 'assistant', content: fullResponse }
      );

      // 持久化对话到 session storage
      await saveConversation(this.conversationHistory, this.currentTabUrl);

      // 记录使用统计
      const today = new Date().toISOString().split('T')[0];
      const tokenEst = fullResponse.length; // 粗略估算
      incrementCounter('totalQuestions');
      incrementCounter('totalTokensUsed', tokenEst);
      recordDailyUsage(today, { questions: 1, tokens: tokenEst });

      this.updateTokenDisplay();

      // 持久化到 IndexedDB（按 URL 关联）
      try {
        await saveConversationIDB(
          this.currentTabUrl || '',
          this.pageTitle.textContent || '',
          this.conversationHistory
        );
      } catch (e) {
        // IndexedDB 保存失败不影响主流程
      }

      // 自动学习
      await this.memory.learnFromInteraction(text, fullResponse, contentWithSelection);

      // 自动保存到知识库
      const saved = await this.memory.autoSaveIfWorth(text, fullResponse, contentWithSelection, this.aiClient);
      if (saved) {
        this.evolution.recordSignal('saved_to_kb', interactionId);
      }

      // 定期批量进化（每 20 次交互）
      if (this.evolution.strategies.totalInteractions % 20 === 0) {
        this.evolution.batchEvolve();
      }

    } catch (error) {
      loadingEl.remove();
      this.addSystemMessage(`出错了：${error.message}`);
    }
  }

  /**
   * 更新 Token 用量显示
   */
  updateTokenDisplay() {
    if (!this.tokenDisplay) return;

    const TOKEN_WARNING_THRESHOLD = 8000;
    const total = estimateMessagesTokens(this.conversationHistory);
    const formatted = total.toLocaleString();

    if (total >= TOKEN_WARNING_THRESHOLD) {
      this.tokenDisplay.textContent = `⚠️ ~${formatted} tokens`;
      this.tokenDisplay.className = 'token-display token-warning';
      this.tokenDisplay.title = '上下文较长，可能影响回答质量';
    } else {
      this.tokenDisplay.textContent = `📊 ~${formatted} tokens`;
      this.tokenDisplay.className = 'token-display';
      this.tokenDisplay.title = '';
    }
  }

  /**
   * 检测 AI 回答中的技能调用指令 [SKILL:id:params]
   */
  async handleSkillCalls(response, pageContext) {
    const skillPattern = /\[SKILL:(\w+):?({[^}]*})?\]/g;
    let match;
    const calls = [];

    while ((match = skillPattern.exec(response)) !== null) {
      calls.push({ skillId: match[1], params: match[2] ? JSON.parse(match[2]) : {} });
    }

    if (calls.length === 0) return;

    for (const call of calls) {
      if (!this.skills.get(call.skillId)) continue;

      this.addSystemMessage(`自动执行技能：${this.skills.get(call.skillId).name}`);
      try {
        const result = await this.skills.execute(call.skillId, {
          ...call.params,
          pageContext
        }, { ai: this.aiClient, memory: this.memory });

        const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        this.addAIMessage(content);
      } catch (e) {
        this.addSystemMessage(`技能 ${call.skillId} 执行失败：${e.message}`);
      }
    }
  }

  addUserMessage(text, selection = '') {
    const welcome = this.chatArea.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-user';
    messageDiv.innerHTML = `
      <div class="message-bubble">
        ${selection ? `<div class="selection-quote" style="font-size:11px;opacity:0.8;margin-bottom:4px;padding:4px 8px;background:rgba(255,255,255,0.15);border-radius:4px;border-left:2px solid rgba(255,255,255,0.4);">"${this.escapeHtml(selection.slice(0, 200))}"</div>` : ''}
        ${this.escapeHtml(text)}
      </div>
    `;
    this.chatArea.appendChild(messageDiv);
    this.scrollToBottom();
  }

  addAIMessage(content) {
    const hasRunnableCode = /```(?:html|javascript)\n[\s\S]*?```/i.test(content);
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-ai';
    messageDiv.innerHTML = `
      <div class="message-bubble">${renderMarkdown(content)}</div>
      <div class="message-actions">
        <button class="msg-action-btn" data-action="copy">复制</button>
        <button class="msg-action-btn" data-action="save">💾 保存</button>
        <button class="msg-action-btn" data-action="highlight">📌 高亮</button>
        <button class="msg-action-btn" data-action="branch">🔀 分支</button>
        ${hasRunnableCode ? '<button class="msg-action-btn msg-action-run" data-action="run">▶️ 运行</button>' : ''}
      </div>
    `;
    messageDiv.querySelectorAll('.msg-action-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleMessageAction(btn.dataset.action, messageDiv));
    });
    // 为可运行的代码块注入独立的运行按钮
    if (hasRunnableCode) {
      this.injectCodeBlockRunButtons(messageDiv, content);
    }
    this.chatArea.appendChild(messageDiv);
    this.scrollToBottom();
    return messageDiv;
  }

  updateAIMessage(messageEl, content) {
    const bubble = messageEl.querySelector('.message-bubble');
    bubble.innerHTML = renderMarkdown(content);
    this.scrollToBottom();
  }

  addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.innerHTML = `
      <div style="text-align:center;font-size:12px;color:var(--text-muted);padding:4px 0;">
        ${this.escapeHtml(text)}
      </div>
    `;
    this.chatArea.appendChild(messageDiv);
    this.scrollToBottom();
  }

  showLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message message-ai';
    loadingDiv.innerHTML = `
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;
    this.chatArea.appendChild(loadingDiv);
    this.scrollToBottom();
    return loadingDiv;
  }

  async handleMessageAction(action, messageEl) {
    const bubble = messageEl.querySelector('.message-bubble');
    const text = bubble.textContent;

    // 找到最近的交互 ID
    const lastInteraction = this.evolution.interactions.slice(-1)[0];
    const interactionId = lastInteraction?.id;

    switch (action) {
      case 'copy':
        await navigator.clipboard.writeText(text);
        this.addSystemMessage('已复制到剪贴板');
        if (interactionId) this.evolution.recordSignal('copied', interactionId);
        break;
      case 'run':
        this.runAllCodeBlocks(messageEl);
        if (interactionId) this.evolution.recordSignal('code_executed', interactionId);
        break;
      case 'save':
        await this.saveToKnowledgeBase(text);
        if (interactionId) this.evolution.recordSignal('saved_to_kb', interactionId);
        break;
      case 'highlight': {
        // 从当前页面获取选中文本
        let selectionInfo = null;
        try {
          selectionInfo = await chrome.tabs.sendMessage(this.currentTabId, { action: 'getSelectionInfo' });
        } catch (e) {}

        // 如果没有选中文本，尝试从 AI 回答中提取代码
        let textToHighlight = selectionInfo?.text || '';
        let xpath = selectionInfo?.xpath || '';
        let offset = selectionInfo?.offset || 0;

        if (!textToHighlight) {
          const codeMatch = text.match(/`([^`]+)`/);
          if (codeMatch) {
            textToHighlight = codeMatch[1];
            xpath = '';
            offset = 0;
          }
        }

        if (!textToHighlight) {
          this.addSystemMessage('请先在页面中选中文本');
          break;
        }

        try {
          const result = await chrome.tabs.sendMessage(this.currentTabId, {
            action: 'saveHighlight',
            highlight: { text: textToHighlight, xpath, offset }
          });
          if (result?.success) {
            this.addSystemMessage(result.duplicate ? '该文本已高亮 ✓' : '已高亮标注 📌');
            if (!result.duplicate) {
              incrementCounter('totalHighlights');
            }
          } else {
            this.addSystemMessage(`高亮失败：${result?.error || '未知错误'}`);
          }
        } catch (e) {
          this.addSystemMessage('高亮失败：请刷新页面后重试');
        }
        if (interactionId) this.evolution.recordSignal('highlighted', interactionId);
        break;
      }
      case 'branch':
        this.handleBranch(messageEl);
        break;
    }
  }

  // ==================== 对话分支 ====================

  /**
   * 处理分支操作：从当前 AI 回答位置分叉对话
   * @param {HTMLElement} messageEl - AI 消息 DOM 元素
   */
  handleBranch(messageEl) {
    const MAX_BRANCHES = 5;

    // 检查分支数量限制
    if (this.branches.length >= MAX_BRANCHES) {
      this.addSystemMessage(`已达到最大分支数量（${MAX_BRANCHES} 个），请先删除其他分支`);
      return;
    }

    // 找到该消息在 chatArea 中的位置
    const allMessages = Array.from(this.chatArea.querySelectorAll('.message'));
    let messageIndex = -1;
    for (let i = 0; i < allMessages.length; i++) {
      if (allMessages[i] === messageEl) {
        messageIndex = i;
        break;
      }
    }

    if (messageIndex === -1) {
      this.addSystemMessage('无法定位消息');
      return;
    }

    // 找到对应的用户问题（前一条消息）
    let branchQuestion = '';
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (allMessages[i].classList.contains('message-user')) {
        branchQuestion = allMessages[i].querySelector('.message-bubble')?.textContent?.trim() || '';
        break;
      }
    }

    // 保存主对话快照（仅在首次进入分支时）
    if (!this.mainConversationSnapshot) {
      this.mainConversationSnapshot = {
        conversationHistory: [...this.conversationHistory],
        chatAreaHTML: this.chatArea.innerHTML
      };
    }

    // 计算到分支点为止的 user+assistant 消息对数（对应 conversationHistory）
    let historyIndex = 0;
    for (let i = 0; i <= messageIndex; i++) {
      if (allMessages[i].classList.contains('message-user') ||
          allMessages[i].classList.contains('message-ai')) {
        historyIndex++;
      }
    }
    // conversationHistory 是 [user, assistant, user, assistant, ...] 交替排列
    // historyIndex 是 DOM 中 user+ai 消息总数，直接用于 slice
    const branchHistory = this.conversationHistory.slice(0, historyIndex);

    // 创建分支
    const branchId = `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const branchName = `分支 ${this.branches.length + 1}`;

    const branch = {
      id: branchId,
      name: branchName,
      messages: branchHistory,
      branchQuestion: branchQuestion,
      branchPointIndex: messageIndex,
      conversationHistory: [...branchHistory],
      createdAt: new Date().toISOString()
    };

    this.branches.push(branch);
    this.activeBranchId = branchId;

    // 清空当前消息之后的内容（DOM 层面）
    const messages = this.chatArea.querySelectorAll('.message');
    for (let i = messageIndex + 1; i < messages.length; i++) {
      messages[i].remove();
    }

    // 更新对话历史为分支版本
    this.conversationHistory = [...branch.conversationHistory];

    // 显示分支信息条
    this.updateBranchBar();

    this.addSystemMessage(`已创建分支 "${branchName}"，从这里继续探索新方向`);
    this.scrollToBottom();
  }

  /**
   * 返回主对话
   */
  returnToMainConversation() {
    if (!this.mainConversationSnapshot) {
      this.addSystemMessage('没有可返回的主对话');
      return;
    }

    // 保存当前分支的对话历史
    if (this.activeBranchId) {
      const branch = this.branches.find(b => b.id === this.activeBranchId);
      if (branch) {
        branch.conversationHistory = [...this.conversationHistory];
      }
    }

    // 恢复主对话
    this.conversationHistory = [...this.mainConversationSnapshot.conversationHistory];
    this.chatArea.innerHTML = this.mainConversationSnapshot.chatAreaHTML;

    // 重新绑定消息按钮事件
    this.rebindMessageActionEvents();

    // 重置分支状态
    this.activeBranchId = null;
    this.mainConversationSnapshot = null;

    // 隐藏分支信息条
    this.updateBranchBar();

    this.addSystemMessage('已返回主对话');
    this.scrollToBottom();
  }

  /**
   * 更新分支信息条的显示/隐藏
   */
  updateBranchBar() {
    if (!this.branchBar) return;

    const isInBranch = this.activeBranchId !== null;
    this.branchBar.classList.toggle('hidden', !isInBranch);

    if (isInBranch) {
      const branch = this.branches.find(b => b.id === this.activeBranchId);
      if (branch && this.branchBarText) {
        const shortQuestion = branch.branchQuestion.length > 40
          ? branch.branchQuestion.slice(0, 40) + '...'
          : branch.branchQuestion;
        this.branchBarText.textContent = `分支自: ${shortQuestion}`;
      }
    }
  }

  /**
   * 重新绑定聊天区域内所有消息的操作按钮事件
   * （用于从 innerHTML 恢复 DOM 后重新建立事件监听）
   */
  rebindMessageActionEvents() {
    this.chatArea.querySelectorAll('.msg-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const messageDiv = btn.closest('.message');
        if (messageDiv) {
          this.handleMessageAction(btn.dataset.action, messageDiv);
        }
      });
    });
  }

  async quickSummarize() {
    this.userInput.value = '请总结当前页面的核心内容，提炼出关键知识点';
    this.sendMessage();
  }

  async quickExplain() {
    const text = this.userInput.value || '';
    this.userInput.value = text
      ? `请解释以下内容的含义：${text}`
      : '请解释页面中选中的内容，或解释页面的核心技术概念';
    this.sendMessage();
  }

  // ==================== YouTube 功能 ====================

  /**
   * 在欢迎消息区域显示 YouTube 专用快捷按钮
   */
  showYouTubeQuickActions() {
    const welcome = this.chatArea.querySelector('.welcome-message');
    if (!welcome) return;

    // 检查是否已经添加过 YouTube 按钮
    if (welcome.querySelector('.youtube-actions')) return;

    const quickActions = welcome.querySelector('.quick-actions');
    if (!quickActions) return;

    const youtubeDiv = document.createElement('div');
    youtubeDiv.className = 'youtube-actions';
    youtubeDiv.style.cssText = 'margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color);';
    youtubeDiv.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">📺 YouTube 视频工具</div>
      <div class="quick-actions" style="gap: 6px;">
        <button class="btn-quick" id="btnYTSummarize">📺 总结这个视频</button>
        <button class="btn-quick" id="btnYTExtractSubtitles">📝 提取视频字幕</button>
      </div>
    `;

    quickActions.parentNode.insertBefore(youtubeDiv, quickActions.nextSibling);

    // 绑定事件
    document.getElementById('btnYTSummarize')?.addEventListener('click', () => {
      this.youtubeSummarizeVideo();
    });
    document.getElementById('btnYTExtractSubtitles')?.addEventListener('click', () => {
      this.youtubeExtractSubtitles();
    });
  }

  /**
   * 提取 YouTube 视频字幕并显示
   */
  async youtubeExtractSubtitles() {
    if (!this.currentTabId) {
      this.addSystemMessage('无法获取当前标签页');
      return;
    }

    this.addSystemMessage('正在提取视频字幕...');

    try {
      const response = await chrome.tabs.sendMessage(this.currentTabId, {
        action: 'extractYouTubeSubtitles'
      });

      if (response?.success && response.subtitles) {
        const { segments, fullText } = response.subtitles;
        this.youTubeSubtitles = response.subtitles;

        const duration = this.formatYouTubeDuration(
          segments.length > 0 ? segments[segments.length - 1].start + segments[segments.length - 1].duration : 0
        );

        this.addSystemMessage(`✅ 字幕提取成功：${segments.length} 个片段，约 ${fullText.length} 字`);

        // 显示字幕预览
        const preview = fullText.length > 500 ? fullText.slice(0, 500) + '...' : fullText;
        this.addAIMessage(`**视频字幕预览**（共 ${segments.length} 个片段，时长 ${duration}）：\n\n${preview}`);
      } else {
        this.addSystemMessage(`❌ ${response?.error || '未找到视频字幕，可能视频未开启字幕功能'}`);
      }
    } catch (e) {
      this.addSystemMessage('提取失败：请刷新页面后重试');
    }
  }

  /**
   * 总结 YouTube 视频内容
   */
  async youtubeSummarizeVideo() {
    if (!this.currentTabId) {
      this.addSystemMessage('无法获取当前标签页');
      return;
    }

    if (!this.aiClient) {
      this.addSystemMessage('请先在设置中配置 API Key');
      this.switchTab('settings');
      return;
    }

    this.addSystemMessage('正在提取字幕并准备总结...');

    try {
      // 先提取字幕
      const response = await chrome.tabs.sendMessage(this.currentTabId, {
        action: 'extractYouTubeSubtitles'
      });

      if (!response?.success || !response.subtitles) {
        this.addSystemMessage(`❌ ${response?.error || '未找到视频字幕'}`);
        return;
      }

      const { fullText } = response.subtitles;
      const videoTitle = this.pageTitle.textContent || 'YouTube 视频';
      this.youTubeSubtitles = response.subtitles;

      // 使用 AI 总结
      this.switchTab('chat');
      const loadingEl = this.showLoading();

      try {
        let fullResponse = '';
        let messageEl = null;

        const prompt = `请总结以下 YouTube 视频的内容。

视频标题：${videoTitle}
页面链接：${this.currentTabUrl}

视频字幕文本：
${fullText.slice(0, 8000)}

请按照以下格式进行总结：
1. **视频概述**：用 2-3 句话概括视频主要内容
2. **关键要点**：列出 3-5 个核心观点或知识点
3. **详细总结**：按时间线或主题进行详细总结
4. **金句/亮点**：提取视频中的重要观点或引用

注意：字幕是口语化文本，可能有断句不连续或同音错误，请根据上下文合理理解。`;

        for await (const chunk of this.aiClient.chatStream(
          [
            ...this.conversationHistory.slice(-6),
            { role: 'user', content: prompt }
          ],
          { systemPrompt: this.aiClient.getSystemPrompt() + '\n\n用户正在观看 YouTube 视频，你需要根据提取的字幕内容进行总结。字幕是语音转文字的口语化内容，请根据上下文合理理解。' }
        )) {
          fullResponse += chunk;
          if (!messageEl) {
            loadingEl.remove();
            messageEl = this.addAIMessage('');
          }
          this.updateAIMessage(messageEl, fullResponse);
        }

        // 保存对话
        this.conversationHistory.push(
          { role: 'user', content: `📺 总结视频: ${videoTitle}` },
          { role: 'assistant', content: fullResponse }
        );
        await saveConversation(this.conversationHistory, this.currentTabUrl);

        // 持久化到 IndexedDB
        try {
          await saveConversationIDB(
            this.currentTabUrl || '',
            videoTitle,
            this.conversationHistory
          );
        } catch (e) {}

      } catch (error) {
        loadingEl.remove();
        this.addSystemMessage(`总结失败：${error.message}`);
      }
    } catch (e) {
      this.addSystemMessage('提取失败：请刷新页面后重试');
    }
  }

  /**
   * 格式化秒数为可读时长
   * @param {number} seconds
   * @returns {string}
   */
  formatYouTubeDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.chatArea.scrollTop = this.chatArea.scrollHeight;
    });
  }

  // ==================== API 文档功能 ====================

  /**
   * 检测当前页面是否为 API 文档，如果是则显示快捷操作按钮
   * @param {number} tabId - 当前标签页 ID
   */
  async detectAndShowApiDocActions(tabId) {
    if (!tabId) return;
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'detectApiDoc' });
      if (response?.isApiDoc) {
        this.isApiDocPage = true;
        this.showApiDocQuickActions();
      }
    } catch (e) {
      // content script 可能未加载，忽略
    }
  }

  /**
   * 在欢迎消息区域显示 API 文档专用快捷按钮
   */
  showApiDocQuickActions() {
    const welcome = this.chatArea.querySelector('.welcome-message');
    if (!welcome) return;

    // 检查是否已经添加过 API 文档按钮
    if (welcome.querySelector('.api-doc-actions')) return;

    const quickActions = welcome.querySelector('.quick-actions');
    if (!quickActions) return;

    const apiDocDiv = document.createElement('div');
    apiDocDiv.className = 'api-doc-actions';
    apiDocDiv.style.cssText = 'margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color);';
    apiDocDiv.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">📡 API 文档工具</div>
      <div class="quick-actions" style="gap: 6px;">
        <button class="btn-quick" id="btnApiExtractEndpoints">📋 提取 API 端点</button>
        <button class="btn-quick" id="btnApiSummarize">📊 生成 API 摘要</button>
      </div>
    `;

    quickActions.parentNode.insertBefore(apiDocDiv, quickActions.nextSibling);

    // 绑定事件
    document.getElementById('btnApiExtractEndpoints')?.addEventListener('click', () => {
      this.apiExtractEndpoints();
    });
    document.getElementById('btnApiSummarize')?.addEventListener('click', () => {
      this.apiSummarize();
    });
  }

  /**
   * 提取 API 端点并以结构化方式展示
   */
  async apiExtractEndpoints() {
    if (!this.currentTabId) {
      this.addSystemMessage('无法获取当前标签页');
      return;
    }

    this.addSystemMessage('正在提取 API 端点...');

    try {
      const response = await chrome.tabs.sendMessage(this.currentTabId, {
        action: 'extractAPIEndpoints'
      });

      if (!response?.endpoints || response.endpoints.length === 0) {
        this.addSystemMessage('未找到 API 端点，请确认页面已完全加载');
        return;
      }

      const { endpoints } = response;
      this.addSystemMessage(`✅ 已提取 ${endpoints.length} 个 API 端点`);

      // 按方法分组统计
      const stats = {};
      for (const ep of endpoints) {
        stats[ep.method] = (stats[ep.method] || 0) + 1;
      }
      const statsText = Object.entries(stats)
        .map(([method, count]) => `${method}: ${count}`)
        .join(', ');

      // 生成结构化展示
      let display = `**API 端点列表**（共 ${endpoints.length} 个）\n\n`;
      display += `📊 方法分布：${statsText}\n\n`;

      // 按方法分组展示
      const grouped = {};
      for (const ep of endpoints) {
        if (!grouped[ep.method]) grouped[ep.method] = [];
        grouped[ep.method].push(ep);
      }

      const methodOrder = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      for (const method of methodOrder) {
        const group = grouped[method];
        if (!group || group.length === 0) continue;

        display += `### ${method}（${group.length}）\n\n`;
        for (const ep of group) {
          display += `- \`${ep.method} ${ep.path}\``;
          if (ep.description) {
            display += ` — ${ep.description}`;
          }
          if (ep.params && ep.params.length > 0) {
            display += ` | 参数: ${ep.params.join(', ')}`;
          }
          display += '\n';
        }
        display += '\n';
      }

      const messageEl = this.addAIMessage(display);

      // 保存到对话历史
      this.conversationHistory.push(
        { role: 'user', content: '📋 提取 API 端点' },
        { role: 'assistant', content: display }
      );
    } catch (e) {
      this.addSystemMessage('提取失败：请刷新页面后重试');
    }
  }

  /**
   * 生成 API 摘要（使用 AI）
   */
  async apiSummarize() {
    if (!this.currentTabId) {
      this.addSystemMessage('无法获取当前标签页');
      return;
    }

    if (!this.aiClient) {
      this.addSystemMessage('请先在设置中配置 API Key');
      this.switchTab('settings');
      return;
    }

    this.addSystemMessage('正在提取 API 端点并生成摘要...');

    try {
      // 先提取端点
      const response = await chrome.tabs.sendMessage(this.currentTabId, {
        action: 'extractAPIEndpoints'
      });

      if (!response?.endpoints || response.endpoints.length === 0) {
        this.addSystemMessage('未找到 API 端点，请确认页面已完全加载');
        return;
      }

      const { endpoints } = response;
      const apiTitle = this.pageTitle.textContent || 'API 文档';

      // 构建端点摘要文本
      let endpointText = '';
      for (const ep of endpoints) {
        endpointText += `${ep.method} ${ep.path}`;
        if (ep.description) endpointText += ` — ${ep.description}`;
        if (ep.params && ep.params.length > 0) endpointText += ` | 参数: ${ep.params.join(', ')}`;
        endpointText += '\n';
      }

      // 使用 AI 生成摘要
      this.switchTab('chat');
      const loadingEl = this.showLoading();

      try {
        let fullResponse = '';
        let messageEl = null;

        const prompt = `请分析以下 API 文档的端点列表，生成一份结构化的 API 摘要。

API 名称：${apiTitle}
页面链接：${this.currentTabUrl}

端点列表（共 ${endpoints.length} 个）：
${endpointText}

请按照以下格式生成摘要：
1. **API 概述**：简要说明这个 API 的功能和用途
2. **功能分类**：将端点按功能模块分类
3. **核心端点**：列出最重要的端点及其用途
4. **认证方式**：如有相关信息请说明
5. **使用建议**：给出使用这个 API 的建议`;

        for await (const chunk of this.aiClient.chatStream(
          [
            ...this.conversationHistory.slice(-6),
            { role: 'user', content: prompt }
          ],
          { systemPrompt: this.aiClient.getSystemPrompt() + '\n\n用户正在浏览 API 文档页面，你需要根据提取的端点列表生成结构化的 API 摘要。' }
        )) {
          fullResponse += chunk;
          if (!messageEl) {
            loadingEl.remove();
            messageEl = this.addAIMessage('');
          }
          this.updateAIMessage(messageEl, fullResponse);
        }

        // 保存对话
        this.conversationHistory.push(
          { role: 'user', content: `📊 生成 API 摘要: ${apiTitle}` },
          { role: 'assistant', content: fullResponse }
        );
        await saveConversation(this.conversationHistory, this.currentTabUrl);

        // 持久化到 IndexedDB
        try {
          await saveConversationIDB(
            this.currentTabUrl || '',
            apiTitle,
            this.conversationHistory
          );
        } catch (e) {}

      } catch (error) {
        loadingEl.remove();
        this.addSystemMessage(`生成摘要失败：${error.message}`);
      }
    } catch (e) {
      this.addSystemMessage('提取失败：请刷新页面后重试');
    }
  }

  // ==================== GitHub 仓库分析 ====================

  /**
   * 检测当前页面是否为 GitHub 仓库根目录，如果是则显示快捷操作按钮
   * @param {number} tabId - 当前标签页 ID
   */
  async detectAndShowGitHubRepoActions(tabId) {
    if (!tabId) return;
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'detectGitHubRepo' });
      if (response?.isGitHubRepo && response?.isRepoRoot) {
        this.isGitHubRepoPage = true;
        this.gitHubRepoInfo = { owner: response.owner, repo: response.repo };
        this.showGitHubRepoQuickActions();
        // 更新页面图标
        const pageIcon = document.querySelector('.page-icon');
        if (pageIcon) pageIcon.textContent = '🐙';
      }
    } catch (e) {
      // content script 可能未加载，忽略
    }
  }

  /**
   * 在欢迎消息区域显示 GitHub 仓库专用快捷按钮
   */
  showGitHubRepoQuickActions() {
    const welcome = this.chatArea.querySelector('.welcome-message');
    if (!welcome) return;

    // 检查是否已经添加过 GitHub 按钮
    if (welcome.querySelector('.github-repo-actions')) return;

    const quickActions = welcome.querySelector('.quick-actions');
    if (!quickActions) return;

    const repoInfo = this.gitHubRepoInfo || {};
    const repoLabel = repoInfo.owner && repoInfo.repo ? `${repoInfo.owner}/${repoInfo.repo}` : '仓库';

    const githubDiv = document.createElement('div');
    githubDiv.className = 'github-repo-actions';
    githubDiv.style.cssText = 'margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color);';
    githubDiv.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">🐙 GitHub 仓库 — ${this.escapeHtml(repoLabel)}</div>
      <div class="quick-actions" style="gap: 6px;">
        <button class="btn-quick" id="btnGHAnalyzeRepo">📖 分析这个仓库</button>
        <button class="btn-quick" id="btnGHExtractInfo">📋 提取仓库信息</button>
      </div>
    `;

    quickActions.parentNode.insertBefore(githubDiv, quickActions.nextSibling);

    // 绑定事件
    document.getElementById('btnGHAnalyzeRepo')?.addEventListener('click', () => {
      this.githubAnalyzeRepo();
    });
    document.getElementById('btnGHExtractInfo')?.addEventListener('click', () => {
      this.githubExtractInfo();
    });
  }

  /**
   * 提取 GitHub 仓库信息并以结构化方式展示
   */
  async githubExtractInfo() {
    if (!this.currentTabId) {
      this.addSystemMessage('无法获取当前标签页');
      return;
    }

    this.addSystemMessage('正在提取 GitHub 仓库信息...');

    try {
      const response = await chrome.tabs.sendMessage(this.currentTabId, {
        action: 'extractGitHubRepoInfo'
      });

      if (!response || response.error) {
        this.addSystemMessage(`❌ ${response?.error || '无法提取仓库信息，请确认页面已完全加载'}`);
        return;
      }

      const { readme, fileTree, description, languages, owner, repo, stars, forks } = response;
      const repoLabel = owner && repo ? `${owner}/${repo}` : this.gitHubRepoInfo ? `${this.gitHubRepoInfo.owner}/${this.gitHubRepoInfo.repo}` : '仓库';

      let display = `**🐙 GitHub 仓库信息: ${repoLabel}**\n\n`;

      if (description) {
        display += `📝 **描述**: ${description}\n\n`;
      }

      if (stars || forks) {
        const stats = [];
        if (stars) stats.push(`⭐ Stars: ${stars}`);
        if (forks) stats.push(`🍴 Forks: ${forks}`);
        display += `${stats.join(' · ')}\n\n`;
      }

      if (languages.length > 0) {
        display += `💻 **语言**: ${languages.map(l => `${l.name} ${l.percent}`).join(', ')}\n\n`;
      }

      if (fileTree.length > 0) {
        display += `📁 **目录结构**（前 ${fileTree.length} 项）:\n`;
        for (const item of fileTree) {
          display += `  ${item.type === 'dir' ? '📂' : '📄'} ${item.name}\n`;
        }
        display += '\n';
      }

      if (readme) {
        const preview = readme.length > 1000 ? readme.slice(0, 1000) + '...' : readme;
        display += `📖 **README 预览**:\n\n${preview}\n`;
      }

      const messageEl = this.addAIMessage(display);

      // 保存到对话历史
      this.conversationHistory.push(
        { role: 'user', content: `📋 提取仓库信息: ${repoLabel}` },
        { role: 'assistant', content: display }
      );

    } catch (e) {
      this.addSystemMessage('提取失败：请刷新页面后重试');
    }
  }

  /**
   * 分析 GitHub 仓库（使用 AI 生成仓库概览）
   */
  async githubAnalyzeRepo() {
    if (!this.currentTabId) {
      this.addSystemMessage('无法获取当前标签页');
      return;
    }

    if (!this.aiClient) {
      this.addSystemMessage('请先在设置中配置 API Key');
      this.switchTab('settings');
      return;
    }

    this.addSystemMessage('正在提取仓库信息并生成概览...');

    try {
      const response = await chrome.tabs.sendMessage(this.currentTabId, {
        action: 'extractGitHubRepoInfo'
      });

      if (!response || response.error) {
        this.addSystemMessage(`❌ ${response?.error || '无法提取仓库信息，请确认页面已完全加载'}`);
        return;
      }

      const { readme, fileTree, description, languages, owner, repo, stars, forks } = response;
      const repoLabel = owner && repo ? `${owner}/${repo}` : '仓库';

      // 构建文件树文本
      let fileTreeText = '';
      if (fileTree.length > 0) {
        fileTreeText = fileTree.map(item =>
          `${item.type === 'dir' ? '[DIR]' : '[FILE]'} ${item.name}`
        ).join('\n');
      }

      // 构建语言统计文本
      const langText = languages.length > 0
        ? languages.map(l => `${l.name} ${l.percent}`).join(', ')
        : '未检测到';

      // 使用 AI 生成仓库概览
      this.switchTab('chat');
      const loadingEl = this.showLoading();

      try {
        let fullResponse = '';
        let messageEl = null;

        const prompt = `请分析以下 GitHub 仓库，生成一份详细的仓库概览。

仓库名称：${repoLabel}
${description ? `仓库描述：${description}` : ''}
${stars ? `Stars：${stars}` : ''}
${forks ? `Forks：${forks}` : ''}
技术栈/语言：${langText}

目录结构（前 ${fileTree.length} 项）：
${fileTreeText || '无法提取目录结构'}

README 内容（截取前 ${readme.length} 字符）：
${readme || '无法提取 README 内容'}

请按照以下格式生成仓库概览：
1. **项目简介**：这个项目是什么？解决什么问题？
2. **技术栈**：使用了哪些技术、框架、语言？
3. **目录结构说明**：主要目录和文件的作用是什么？
4. **快速开始建议**：如果要使用或参与这个项目，应该从哪里开始？
5. **亮点与特色**：这个项目有什么值得关注的特点？`;

        for await (const chunk of this.aiClient.chatStream(
          [
            ...this.conversationHistory.slice(-6),
            { role: 'user', content: prompt }
          ],
          { systemPrompt: this.aiClient.getSystemPrompt() + '\n\n用户正在浏览 GitHub 仓库页面，你需要根据提取的仓库信息（README、目录结构、描述、语言统计）生成一份结构化的仓库概览。请用中文回答。' }
        )) {
          fullResponse += chunk;
          if (!messageEl) {
            loadingEl.remove();
            messageEl = this.addAIMessage('');
          }
          this.updateAIMessage(messageEl, fullResponse);
        }

        // 保存对话
        this.conversationHistory.push(
          { role: 'user', content: `📖 分析仓库: ${repoLabel}` },
          { role: 'assistant', content: fullResponse }
        );
        await saveConversation(this.conversationHistory, this.currentTabUrl);

        // 持久化到 IndexedDB
        try {
          await saveConversationIDB(
            this.currentTabUrl || '',
            `分析仓库: ${repoLabel}`,
            this.conversationHistory
          );
        } catch (e) {}

      } catch (error) {
        loadingEl.remove();
        this.addSystemMessage(`生成仓库概览失败：${error.message}`);
      }
    } catch (e) {
      this.addSystemMessage('提取失败：请刷新页面后重试');
    }
  }

  // ==================== PDF 文档功能 ====================

  /**
   * 检测当前页面是否为 PDF 文档，如果是则显示快捷操作按钮
   * @param {number} tabId - 当前标签页 ID
   */
  async detectAndShowPdfActions(tabId) {
    if (!tabId) return;
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'detectPdfPage' });
      if (response?.isPdf) {
        this.isPdfPage = true;
        this.pdfUrl = response.pdfUrl;
        this.showPdfQuickActions();
        // 更新页面图标
        const pageIcon = document.querySelector('.page-icon');
        if (pageIcon) pageIcon.textContent = '📑';
      }
    } catch (e) {
      // content script 可能未加载，忽略
    }
  }

  /**
   * 在欢迎消息区域显示 PDF 专用快捷按钮
   */
  showPdfQuickActions() {
    const welcome = this.chatArea.querySelector('.welcome-message');
    if (!welcome) return;

    // 检查是否已经添加过 PDF 按钮
    if (welcome.querySelector('.pdf-actions')) return;

    const quickActions = welcome.querySelector('.quick-actions');
    if (!quickActions) return;

    const pdfDiv = document.createElement('div');
    pdfDiv.className = 'pdf-actions';
    pdfDiv.style.cssText = 'margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color);';
    pdfDiv.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">📑 PDF 文档工具</div>
      <div class="quick-actions" style="gap: 6px;">
        <button class="btn-quick" id="btnPdfAnalyze">📄 分析这个 PDF</button>
        <button class="btn-quick" id="btnPdfExtract">📝 提取 PDF 内容</button>
      </div>
    `;

    quickActions.parentNode.insertBefore(pdfDiv, quickActions.nextSibling);

    // 绑定事件
    document.getElementById('btnPdfAnalyze')?.addEventListener('click', () => {
      this.pdfAnalyze();
    });
    document.getElementById('btnPdfExtract')?.addEventListener('click', () => {
      this.pdfExtractContent();
    });
  }

  /**
   * 提取 PDF 内容并显示
   */
  async pdfExtractContent() {
    if (!this.currentTabId) {
      this.addSystemMessage('无法获取当前标签页');
      return;
    }

    this.addSystemMessage('正在提取 PDF 内容...');

    try {
      const response = await chrome.tabs.sendMessage(this.currentTabId, {
        action: 'extractPdfContent'
      });

      if (!response || response.error) {
        this.addSystemMessage(`❌ ${response?.error || '无法提取 PDF 内容'}`);
        return;
      }

      const { content, title, method, needsFallback, pdfUrl } = response;

      if (needsFallback) {
        this.addSystemMessage(
          '⚠️ 无法直接提取 PDF 文本内容（Chrome PDF viewer 的限制）。\n\n' +
          '💡 **备选方案**：\n' +
          '1. 在 PDF 页面中按 Ctrl+A 全选，Ctrl+C 复制，然后粘贴到对话框\n' +
          '2. 或使用浏览器的「打印」功能将 PDF 转为网页后再提取'
        );
        return;
      }

      // 保存为当前页面内容
      this.currentPageContent = {
        url: pdfUrl,
        title,
        content,
        codeBlocks: [],
        meta: { description: 'PDF 文档', author: '', keywords: '', siteName: '' },
        extractedAt: new Date().toISOString(),
        isPdf: true
      };

      const charCount = content.length;
      this.addSystemMessage(`✅ 已提取 PDF 内容：${charCount} 字（提取方式：${method}）`);

      // 页面感知
      const sense = this.pageSense.analyze(this.currentPageContent);
      if (sense.types.length > 0) {
        const icons = sense.types.map(t => `${t.icon} ${t.label}`).join(' | ');
        this.addSystemMessage(`页面类型：${icons}`);
      }
    } catch (e) {
      this.addSystemMessage('提取失败：请刷新页面后重试');
    }
  }

  /**
   * 使用 AI 分析 PDF 文档
   */
  async pdfAnalyze() {
    if (!this.currentTabId) {
      this.addSystemMessage('无法获取当前标签页');
      return;
    }

    if (!this.aiClient) {
      this.addSystemMessage('请先在设置中配置 API Key');
      this.switchTab('settings');
      return;
    }

    this.addSystemMessage('正在提取并分析 PDF 内容...');

    try {
      const response = await chrome.tabs.sendMessage(this.currentTabId, {
        action: 'extractPdfContent'
      });

      if (!response || response.error) {
        this.addSystemMessage(`❌ ${response?.error || '无法提取 PDF 内容'}`);
        return;
      }

      const { content, title, needsFallback, pdfUrl } = response;

      if (needsFallback) {
        // 内容提取不足，给用户提示
        this.addSystemMessage(
          '⚠️ 无法直接提取 PDF 文本内容（Chrome PDF viewer 的限制）。\n\n' +
          '💡 **备选方案**：\n' +
          '1. 在 PDF 页面中按 Ctrl+A 全选，Ctrl+C 复制，然后粘贴到对话框提问\n' +
          '2. 或使用浏览器的「打印」功能将 PDF 转为网页后再提取\n\n' +
          '我将尝试用 URL 获取 PDF 进行简单文本提取...'
        );

        // 尝试通过 URL 获取 PDF 的简单文本提取
        const fallbackResult = await this.fetchPdfTextFallback(pdfUrl);
        if (fallbackResult && fallbackResult.length > 50) {
          this.sendPdfAnalysisRequest(fallbackResult, title || 'PDF 文档', pdfUrl);
          return;
        }

        this.addSystemMessage('❌ 无法提取 PDF 内容。请手动复制 PDF 文本后粘贴到对话框。');
        return;
      }

      // 保存为当前页面内容
      this.currentPageContent = {
        url: pdfUrl,
        title,
        content,
        codeBlocks: [],
        meta: { description: 'PDF 文档', author: '', keywords: '', siteName: '' },
        extractedAt: new Date().toISOString(),
        isPdf: true
      };

      this.sendPdfAnalysisRequest(content, title || 'PDF 文档', pdfUrl);
    } catch (e) {
      this.addSystemMessage('提取失败：请刷新页面后重试');
    }
  }

  /**
   * 发送 PDF 内容给 AI 进行分析
   * @param {string} content - PDF 文本内容
   * @param {string} title - 文档标题
   * @param {string} pdfUrl - PDF URL
   */
  async sendPdfAnalysisRequest(content, title, pdfUrl) {
    this.switchTab('chat');
    const loadingEl = this.showLoading();

    // 限制内容长度
    const MAX_CHARS = 12000;
    const truncated = content.length > MAX_CHARS;
    const sendContent = content.slice(0, MAX_CHARS);

    try {
      let fullResponse = '';
      let messageEl = null;

      const prompt = `请分析以下 PDF 文档内容，生成一份结构化的文档概览。

文档标题：${title}
${pdfUrl ? `来源：${pdfUrl}` : ''}
内容长度：${content.length} 字${truncated ? '（已截取前 ' + MAX_CHARS + ' 字）' : ''}

文档内容：
${sendContent}

请按照以下格式生成分析：
1. **文档概述**：这份文档的主要内容是什么？
2. **核心要点**：列出 3-5 个关键要点
3. **结构分析**：文档的主要章节/部分有哪些？
4. **关键概念**：涉及哪些重要概念或术语？
5. **总结**：用 2-3 句话总结文档精华`;

      for await (const chunk of this.aiClient.chatStream(
        [
          ...this.conversationHistory.slice(-6),
          { role: 'user', content: prompt }
        ],
        { systemPrompt: this.aiClient.getSystemPrompt() + '\n\n用户正在阅读 PDF 文档，你需要根据提取的文档内容生成结构化的文档分析。请用中文回答。' }
      )) {
        fullResponse += chunk;
        if (!messageEl) {
          loadingEl.remove();
          messageEl = this.addAIMessage('');
        }
        this.updateAIMessage(messageEl, fullResponse);
      }

      // 保存对话
      this.conversationHistory.push(
        { role: 'user', content: `📄 分析 PDF: ${title}` },
        { role: 'assistant', content: fullResponse }
      );
      await saveConversation(this.conversationHistory, this.currentTabUrl);

      // 持久化到 IndexedDB
      try {
        await saveConversationIDB(
          this.currentTabUrl || '',
          `分析 PDF: ${title}`,
          this.conversationHistory
        );
      } catch (e) {}

    } catch (error) {
      loadingEl.remove();
      this.addSystemMessage(`PDF 分析失败：${error.message}`);
    }
  }

  /**
   * 备选方案：通过 URL 获取 PDF 文件并进行简单文本提取
   * 使用正则匹配 PDF 中的文本流，不依赖 PDF.js
   * @param {string} url - PDF 文件 URL
   * @returns {Promise<string>} 提取到的文本
   */
  async fetchPdfTextFallback(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return '';

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 简单的 PDF 文本提取：
      // PDF 文件中，文本通常在 BT (Begin Text) 和 ET (End Text) 标记之间
      // 使用 Tj 和 TJ 操作符显示文本
      const decoder = new TextDecoder('latin1');
      const raw = decoder.decode(bytes);

      const textParts = [];

      // 匹配 Tj 操作符（单个字符串）
      const tjPattern = /\(([^)]*)\)\s*Tj/g;
      let match;
      while ((match = tjPattern.exec(raw)) !== null) {
        const text = match[1].trim();
        if (text.length > 1 && /[\x20-\x7E]/.test(text)) {
          textParts.push(text);
        }
      }

      // 匹配 TJ 操作符（数组字符串）
      const tjArrayPattern = /\[(.*?)\]\s*TJ/g;
      while ((match = tjArrayPattern.exec(raw)) !== null) {
        const arrayContent = match[1];
        const stringPattern = /\(([^)]*)\)/g;
        let strMatch;
        while ((strMatch = stringPattern.exec(arrayContent)) !== null) {
          const text = strMatch[1].trim();
          if (text.length > 1 && /[\x20-\x7E]/.test(text)) {
            textParts.push(text);
          }
        }
      }

      return textParts.join(' ').slice(0, 50000);
    } catch (e) {
      return '';
    }
  }

  // ==================== 知识库 ====================

  async loadKnowledgeList() {
    const entries = await this.memory.getAllEntries(10000);
    if (entries.length === 0) {
      this.emptyKnowledge.classList.remove('hidden');
      this.knowledgeList.innerHTML = '';
      this.knowledgeList.appendChild(this.emptyKnowledge);
      this._allFilteredEntries = [];
      this._hasMoreEntries = false;
      return;
    }
    this.emptyKnowledge.classList.add('hidden');

    // 按标签过滤
    const filtered = this.activeTag
      ? entries.filter(e => e.tags?.includes(this.activeTag))
      : entries;

    // 分页重置
    this._allFilteredEntries = filtered;
    this._currentPage = 0;
    this._hasMoreEntries = true;

    // 仅渲染第一页
    this.knowledgeList.innerHTML = '';
    this.appendKnowledgePage();
    this.setupInfiniteScroll();
  }

  async loadKnowledgeTags() {
    const tags = await this.memory.getAllTags();
    this.renderTagFilter(tags);
  }

  renderTagFilter(tags) {
    if (tags.length === 0) {
      this.tagFilter.innerHTML = '';
      return;
    }
    this.tagFilter.innerHTML = `
      <span class="tag-chip ${!this.activeTag ? 'active' : ''}" data-tag="">全部</span>
      ${tags.slice(0, 15).map(t =>
        `<span class="tag-chip ${this.activeTag === t.tag ? 'active' : ''}" data-tag="${this.escapeHtml(t.tag)}">${this.escapeHtml(t.tag)} (${t.count})</span>`
      ).join('')}
    `;
    this.tagFilter.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.activeTag = chip.dataset.tag || null;
        this.loadKnowledgeList();
        this.loadKnowledgeTags();
      });
    });
  }

  renderKnowledgeList(entries) {
    const filtered = this.activeTag
      ? entries.filter(e => e.tags?.includes(this.activeTag))
      : entries;

    // 保存当前过滤后的条目用于批量操作
    this._currentEntries = filtered;

    if (this.selectMode) {
      this.knowledgeList.classList.add('select-mode');
    } else {
      this.knowledgeList.classList.remove('select-mode');
    }

    this.knowledgeList.innerHTML = filtered.map(entry => `
      <div class="knowledge-item ${this.selectedIds.has(entry.id) ? 'selected' : ''}" data-id="${entry.id}">
        <div class="knowledge-item-checkbox">
          <input type="checkbox" data-id="${entry.id}" ${this.selectedIds.has(entry.id) ? 'checked' : ''}>
        </div>
        <div class="knowledge-item-content">
          <div class="knowledge-item-title">${this.escapeHtml(entry.title)}</div>
          <div class="knowledge-item-summary">${this.escapeHtml(entry.summary || entry.question || '')}</div>
          <div class="knowledge-item-meta">
            <span>${formatTime(entry.createdAt)}</span>
            <div class="knowledge-item-tags">
              ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `).join('');

    this.knowledgeList.querySelectorAll('.knowledge-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (this.selectMode) {
          // 选择模式下，点击切换选中状态
          const checkbox = item.querySelector('input[type="checkbox"]');
          const id = parseInt(item.dataset.id);
          if (e.target.type === 'checkbox') {
            // 直接点击复选框
            if (e.target.checked) {
              this.selectedIds.add(id);
            } else {
              this.selectedIds.delete(id);
            }
          } else {
            // 点击条目，切换复选框
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) {
              this.selectedIds.add(id);
            } else {
              this.selectedIds.delete(id);
            }
          }
          item.classList.toggle('selected', this.selectedIds.has(id));
         this.updateBatchCount();
       } else {
         this.showKnowledgeDetail(parseInt(item.dataset.id));
       }
     });
   });
 }
 /**
  * 追加下一页知识条目（分页加载）
  */
  appendKnowledgePage() {
    if (this._isLoadingMore || !this._hasMoreEntries) return;
    this._isLoadingMore = true;

    const start = this._currentPage * this._pageSize;
    const end = start + this._pageSize;
    const pageEntries = this._allFilteredEntries.slice(start, end);

    if (pageEntries.length === 0) {
      this._hasMoreEntries = false;
      this._isLoadingMore = false;
      return;
    }

    this._currentPage++;
    this._hasMoreEntries = end < this._allFilteredEntries.length;

    // 保存当前过滤后的条目用于批量操作
    this._currentEntries = this._allFilteredEntries.slice(0, end);

    if (this.selectMode) {
      this.knowledgeList.classList.add('select-mode');
    } else {
      this.knowledgeList.classList.remove('select-mode');
    }

    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = pageEntries.map(entry => `
      <div class="knowledge-item ${this.selectedIds.has(entry.id) ? 'selected' : ''}" data-id="${entry.id}">
        <div class="knowledge-item-checkbox">
          <input type="checkbox" data-id="${entry.id}" ${this.selectedIds.has(entry.id) ? 'checked' : ''}>
        </div>
        <div class="knowledge-item-content">
          <div class="knowledge-item-title">${this.escapeHtml(entry.title)}</div>
          <div class="knowledge-item-summary">${this.escapeHtml(entry.summary || entry.question || '')}</div>
          <div class="knowledge-item-meta">
            <span>${formatTime(entry.createdAt)}</span>
            <div class="knowledge-item-tags">
              ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `).join('');

    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild);
    }
    this.knowledgeList.appendChild(fragment);

    // 绑定点击事件（仅绑定新添加的条目）
    this.knowledgeList.querySelectorAll('.knowledge-item:not([data-bound])').forEach(item => {
      item.setAttribute('data-bound', '1');
      item.addEventListener('click', (e) => {
        if (this.selectMode) {
          const checkbox = item.querySelector('input[type="checkbox"]');
          const id = parseInt(item.dataset.id);
          if (e.target.type === 'checkbox') {
            if (e.target.checked) {
              this.selectedIds.add(id);
            } else {
              this.selectedIds.delete(id);
            }
          } else {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) {
              this.selectedIds.add(id);
            } else {
              this.selectedIds.delete(id);
            }
          }
          item.classList.toggle('selected', this.selectedIds.has(id));
          this.updateBatchCount();
        } else {
          this.showKnowledgeDetail(parseInt(item.dataset.id));
        }
      });
    });

    this._isLoadingMore = false;
  }

  /**
   * 设置无限滚动（IntersectionObserver）
   */
  setupInfiniteScroll() {
    // 清除旧的 observer
    if (this._loadMoreObserver) {
      this._loadMoreObserver.disconnect();
      this._loadMoreObserver = null;
    }

    // 移除旧的 sentinel
    const oldSentinel = document.getElementById('loadMoreSentinel');
    if (oldSentinel) oldSentinel.remove();

    if (!this._hasMoreEntries) return;

    // 创建 sentinel 元素
    const sentinel = document.createElement('div');
    sentinel.id = 'loadMoreSentinel';
    sentinel.style.height = '1px';
    sentinel.style.width = '100%';
    this.knowledgeList.appendChild(sentinel);

   this._loadMoreObserver = new IntersectionObserver((entries) => {
     for (const entry of entries) {
       if (entry.isIntersecting && this._hasMoreEntries && !this._isLoadingMore) {
          if (this._searchMode === 'semantic') {
            this.appendSearchPage();
          } else {
            this.appendKnowledgePage();
          }
        }
      }
    }, { root: this.knowledgeList.parentElement, threshold: 0.1 });

    this._loadMoreObserver.observe(sentinel);
  }

  /**
   * 追加下一页语义搜索结果（带匹配分数和高亮）
   */
  appendSearchPage() {
    if (this._isLoadingMore || !this._hasMoreEntries) return;
    this._isLoadingMore = true;

    const start = this._currentPage * this._pageSize;
    const end = start + this._pageSize;
    const pageResults = (this._allSemanticResults || []).slice(start, end);

    if (pageResults.length === 0) {
      this._hasMoreEntries = false;
      this._isLoadingMore = false;
      return;
    }

    this._currentPage++;
    this._hasMoreEntries = end < (this._allSemanticResults || []).length;

    // 保存当前过滤后的条目用于批量操作
    this._currentEntries = (this._allSemanticResults || []).slice(0, end).map(r => r.entry);

    const query = this._searchQuery || '';
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = pageResults.map(result => {
      const entry = result.entry;
      const percent = Math.round(result.score * 100);
      const matchType = result.matchType || 'semantic';
      const titleHtml = this.highlightText(entry.title || '', query);
      const summaryText = entry.summary || entry.question || '';
      const summaryHtml = this.highlightText(summaryText, query);

      return `
        <div class="knowledge-item" data-id="${entry.id}">
          <div class="knowledge-item-header">
            <div class="knowledge-item-title">${titleHtml}</div>
            <div class="search-score-badge ${matchType}">${percent}%</div>
          </div>
          <div class="knowledge-item-summary">${summaryHtml}</div>
          <div class="knowledge-item-meta">
            <span>${formatTime(entry.createdAt)}</span>
            <span class="search-match-type">${matchType === 'keyword' ? '🔤 关键词' : '🧠 语义'}</span>
            <div class="knowledge-item-tags">
              ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');

    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild);
    }
    this.knowledgeList.appendChild(fragment);

    // 绑定点击事件
    this.knowledgeList.querySelectorAll('.knowledge-item:not([data-bound])').forEach(item => {
      item.setAttribute('data-bound', '1');
      item.addEventListener('click', () => this.showKnowledgeDetail(parseInt(item.dataset.id)));
    });

    this._isLoadingMore = false;
  }

  async showKnowledgeDetail(id) {
    const entry = await this.memory.getEntry(id);
   if (!entry) return;

    this.selectedEntryId = id;
    this.knowledgeList.classList.add('hidden');
    this.knowledgeDetail.classList.remove('hidden');

    this.detailContent.innerHTML = `
      <h2>${this.escapeHtml(entry.title)}</h2>
      <div class="meta">
        <div>来源：${this.escapeHtml(entry.sourceTitle || entry.sourceUrl)}</div>
        <div>时间：${formatTime(entry.createdAt)}</div>
        <div>标签：${(entry.tags || []).join(', ')}</div>
        <div>分类：${entry.category}</div>
      </div>
      ${entry.question ? `<div class="section"><div class="section-title">问题</div><div class="section-body">${this.escapeHtml(entry.question)}</div></div>` : ''}
      ${entry.answer ? `<div class="section"><div class="section-title">回答</div><div class="section-body">${renderMarkdown(entry.answer)}</div></div>` : ''}
      ${entry.summary ? `<div class="section"><div class="section-title">摘要</div><div class="section-body">${this.escapeHtml(entry.summary)}</div></div>` : ''}
      ${entry.content ? `<div class="section"><div class="section-title">原始内容</div><div class="section-body" style="max-height:200px;overflow-y:auto;font-size:12px;color:var(--text-secondary);">${this.escapeHtml(entry.content.slice(0, 2000))}</div></div>` : ''}
    `;

    // 加载并展示相关知识
    this.loadRelatedEntries(id);
  }

  showKnowledgeList() {
    this.knowledgeDetail.classList.add('hidden');
    this.knowledgeList.classList.remove('hidden');
    this.selectedEntryId = null;
  }

  // ==================== 批量操作 ====================

  /**
   * 进入/退出选择模式
   */
  toggleSelectMode() {
    this.selectMode = !this.selectMode;
    this.selectedIds.clear();

    // 切换工具栏显示
    this.batchToolbar.classList.toggle('hidden', !this.selectMode);
    this.batchFloatingBar.classList.toggle('hidden', !this.selectMode);

    // 更新按钮文本
    if (this.btnSelectMode) {
      this.btnSelectMode.textContent = this.selectMode ? '✖️ 取消选择' : '☑️ 选择模式';
    }

    // 重置全选复选框
    if (this.batchSelectAll) {
      this.batchSelectAll.checked = false;
    }

    // 更新计数
    this.updateBatchCount();

    // 重新渲染列表
    this.loadKnowledgeList();
  }

  /**
   * 全选/取消全选
   */
  toggleSelectAll() {
    const isChecked = this.batchSelectAll.checked;
    const items = this.knowledgeList.querySelectorAll('.knowledge-item');

    items.forEach(item => {
      const id = parseInt(item.dataset.id);
      const checkbox = item.querySelector('input[type="checkbox"]');
      if (isChecked) {
        this.selectedIds.add(id);
        if (checkbox) checkbox.checked = true;
        item.classList.add('selected');
      } else {
        this.selectedIds.delete(id);
        if (checkbox) checkbox.checked = false;
        item.classList.remove('selected');
      }
    });

    this.updateBatchCount();
  }

  /**
   * 更新批量操作选中计数
   */
  updateBatchCount() {
    const count = this.selectedIds.size;
    const text = `已选 ${count} 条`;
    if (this.batchCount) this.batchCount.textContent = text;
    if (this.batchFloatingCount) this.batchFloatingCount.textContent = text;
  }

  /**
   * 批量删除
   */
  async batchDelete() {
    if (this.selectedIds.size === 0) {
      this.showToast('请先选择要删除的条目', 'warning');
      return;
    }

    const count = this.selectedIds.size;
    if (!confirm(`确定要删除选中的 ${count} 条知识条目吗？此操作不可撤销。`)) {
      return;
    }

    try {
      const ids = Array.from(this.selectedIds);
      const deleted = await this.memory.kb.batchDelete(ids);
      this.showToast(`成功删除 ${deleted} 条知识条目`);
      this.toggleSelectMode();
      this.loadKnowledgeTags();
    } catch (error) {
      this.showToast(`批量删除失败：${error.message}`, 'error');
    }
  }

  /**
   * 批量打标签
   */
  async batchTag() {
    if (this.selectedIds.size === 0) {
      this.showToast('请先选择要打标签的条目', 'warning');
      return;
    }

    const tag = prompt('请输入要添加的标签：');
    if (!tag || !tag.trim()) return;

    try {
      const ids = Array.from(this.selectedIds);
      const updated = await this.memory.kb.batchAddTag(ids, tag.trim());
      this.showToast(`成功为 ${updated} 条知识添加标签「${tag.trim()}」`);
      this.toggleSelectMode();
      this.loadKnowledgeTags();
    } catch (error) {
      this.showToast(`批量打标签失败：${error.message}`, 'error');
    }
  }

  /**
   * 批量导出
   */
  batchExport() {
    if (this.selectedIds.size === 0) {
      this.showToast('请先选择要导出的条目', 'warning');
      return;
    }

    // 从当前渲染的条目中过滤选中的
    const entries = (this._currentEntries || []).filter(e => this.selectedIds.has(e.id));
    if (entries.length === 0) {
      this.showToast('没有找到选中的条目', 'warning');
      return;
    }

    const json = JSON.stringify(entries, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagewise-batch-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast(`已导出 ${entries.length} 条知识条目`);
  }

  /**
   * 加载并渲染与当前条目相关的知识
   */
  async loadRelatedEntries(entryId) {
    if (!this.relatedEntries || !this.relatedList) return;

    try {
      const related = await this.memory.kb.findRelatedEntries(entryId, 5);

      if (related.length === 0) {
        this.relatedEntries.classList.add('hidden');
        return;
      }

      this.relatedEntries.classList.remove('hidden');
      this.relatedList.innerHTML = related.map(({ entry, score }) => {
        const percent = Math.round(score * 100);
        const summary = entry.summary
          ? this.escapeHtml(entry.summary.slice(0, 80)) + (entry.summary.length > 80 ? '...' : '')
          : '';
        return `
          <div class="related-card" data-id="${entry.id}">
            <div class="related-card-header">
              <span class="related-card-title">${this.escapeHtml(entry.title)}</span>
              <span class="related-card-score">${percent}%</span>
            </div>
            ${summary ? `<div class="related-card-summary">${summary}</div>` : ''}
          </div>
        `;
      }).join('');

      // 绑定点击事件
      this.relatedList.querySelectorAll('.related-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = parseInt(card.dataset.id);
          this.showKnowledgeDetail(id);
        });
      });
    } catch (e) {
      // 关联加载失败不阻塞详情展示
      this.relatedEntries.classList.add('hidden');
    }
  }

  async saveToKnowledgeBase(answerText) {
    if (!this.aiClient) return;
    this.addSystemMessage('正在保存到知识库...');
    try {
      const content = this.currentPageContent?.content || '';
      const { summary, tags } = await this.aiClient.generateSummaryAndTags(
        `问题：${this.conversationHistory[this.conversationHistory.length - 2]?.content || ''}\n回答：${answerText}`
      );
      await this.memory.kb.saveEntry({
        title: this.currentPageContent?.title || '未命名',
        content: content.slice(0, 5000),
        summary,
        sourceUrl: this.currentPageContent?.url || this.currentTabUrl || '',
        sourceTitle: this.currentPageContent?.title || '',
        tags,
        category: tags[0] || '未分类',
        question: this.conversationHistory[this.conversationHistory.length - 2]?.content || '',
        answer: answerText
      });
      this.addSystemMessage(`已保存到知识库 ✓ 标签：${tags.join(', ')}`);
      incrementCounter('totalKnowledgeEntries');
      this.loadKnowledgeTags();
    } catch (error) {
      this.addSystemMessage(`保存失败：${error.message}`);
    }
  }

  async searchKnowledge() {
    const query = this.searchInput.value.trim();
    if (!query) {
      this._searchMode = null;
      this._searchQuery = null;
      this.loadKnowledgeList();
      return;
    }

    this._searchQuery = query;

    if (this.searchMode === 'semantic') {
      // 语义搜索 + 综合搜索
      const results = await this.memory.kb.combinedSearch(query, 1000);
      if (results.length === 0) {
        this.renderNoResults(query);
      } else {
        this._searchMode = 'semantic';
        // 按标签过滤
        const filtered = this.activeTag
          ? results.filter(r => r.entry.tags?.includes(this.activeTag))
          : results;
        // 分页重置
        this._allFilteredEntries = filtered.map(r => r.entry);
        this._allSemanticResults = filtered;
        this._currentPage = 0;
        this._hasMoreEntries = true;
        this.knowledgeList.innerHTML = '';
        this.appendSearchPage();
        this.setupInfiniteScroll();
      }
    } else {
      // 关键词搜索（原有逻辑）
      const results = await this.memory.kb.search(query);
      if (results.length === 0) {
        this.renderNoResults(query);
      } else {
        this._searchMode = 'keyword';
        const filtered = this.activeTag
          ? results.filter(e => e.tags?.includes(this.activeTag))
          : results;
        this._allFilteredEntries = filtered;
        this._allSemanticResults = null;
        this._currentPage = 0;
        this._hasMoreEntries = true;
        this.knowledgeList.innerHTML = '';
        this.appendKnowledgePage();
        this.setupInfiniteScroll();
      }
    }
  }

  /**
   * 渲染语义搜索结果（带匹配分数和高亮）
   */
  renderSemanticResults(results, query) {
    const filtered = this.activeTag
      ? results.filter(r => r.entry.tags?.includes(this.activeTag))
      : results;

    this.knowledgeList.innerHTML = filtered.map(result => {
      const entry = result.entry;
      const percent = Math.round(result.score * 100);
      const matchType = result.matchType || 'semantic';

      // 高亮标题
      const titleHtml = this.highlightText(entry.title || '', query);
      const summaryText = entry.summary || entry.question || '';
      const summaryHtml = this.highlightText(summaryText, query);

      return `
        <div class="knowledge-item" data-id="${entry.id}">
          <div class="knowledge-item-header">
            <div class="knowledge-item-title">${titleHtml}</div>
            <div class="search-score-badge ${matchType}">${percent}%</div>
          </div>
          <div class="knowledge-item-summary">${summaryHtml}</div>
          <div class="knowledge-item-meta">
            <span>${formatTime(entry.createdAt)}</span>
            <span class="search-match-type">${matchType === 'keyword' ? '🔤 关键词' : '🧠 语义'}</span>
            <div class="knowledge-item-tags">
              ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.knowledgeList.querySelectorAll('.knowledge-item').forEach(item => {
      item.addEventListener('click', () => this.showKnowledgeDetail(parseInt(item.dataset.id)));
    });
  }

  /**
   * 高亮文本中匹配 query 的部分
   */
  highlightText(text, query) {
    if (!text || !query) return this.escapeHtml(text || '');
    const escaped = this.escapeHtml(text);
    const escapedQuery = this.escapeHtml(query);
    // 不区分大小写的替换
    const regex = new RegExp(escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return escaped.replace(regex, '<mark class="search-highlight">$&</mark>');
  }

  /**
   * 渲染无结果页面（显示推荐搜索词）
   */
  async renderNoResults(query) {
    const KB = this.memory.kb.constructor;
    const allEntries = await this.memory.kb.getAllEntries(500);
    const suggestions = KB.getSearchSuggestions(query, allEntries, 3);

    let html = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>未找到匹配「${this.escapeHtml(query)}」的知识条目</p>
    `;

    if (suggestions.length > 0) {
      html += `<p class="search-suggestions-label">你是否想搜：</p>`;
      html += `<div class="search-suggestions">`;
      for (const suggestion of suggestions) {
        html += `<button class="search-suggestion-btn" data-query="${this.escapeHtml(suggestion)}">${this.escapeHtml(suggestion)}</button>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    this.knowledgeList.innerHTML = html;

    // 绑定推荐按钮事件
    this.knowledgeList.querySelectorAll('.search-suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.searchInput.value = btn.dataset.query;
        this.searchKnowledge();
      });
    });
  }

  async deleteEntry() {
    if (!this.selectedEntryId) return;
    if (!confirm('确定删除这条知识？')) return;
    await this.memory.deleteEntry(this.selectedEntryId);
    this.addSystemMessage('已删除');
    this.showKnowledgeList();
    this.loadKnowledgeTags();
  }

  // ==================== 学习路径生成 ====================

  /**
   * 生成学习路径
   * 从知识库提取标签和主题统计，发送给 AI 生成个性化学习路线图
   */
  async generateLearningPath() {
    if (!this.aiClient) {
      this.showLearningPathStatus('请先在设置中配置 API Key');
      this.switchTab('settings');
      return;
    }

    // 显示加载状态
    this.showLearningPathLoading();

    try {
      // 1. 从知识库提取所有条目
      const entries = await this.memory.kb.getAllEntries(1000);
      if (entries.length === 0) {
        this.showLearningPathStatus('知识库为空，请先保存一些知识条目');
        this.showLearningPathEmpty();
        return;
      }

      // 2. 统计每个主题的知识条目数量
      const topicStats = buildTopicStats(entries);
      if (topicStats.topics.length === 0) {
        this.showLearningPathStatus('没有可用的主题');
        this.showLearningPathEmpty();
        return;
      }

      // 3. 构建 prompt 发送给 AI
      const prompt = buildLearningPathPrompt(topicStats.topics);

      this.showLearningPathStatus('AI 正在分析你的知识库...');

      // 设置 30 秒超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('请求超时（30秒）')), 30000);
      });

      const responsePromise = this.aiClient.chat([{
        role: 'user',
        content: prompt
      }], {
        maxTokens: 2000,
        systemPrompt: '你是一个学习规划助手。基于用户的知识库内容，生成结构化的个性化学习路径。只返回 JSON 格式的结果，不要返回其他内容。'
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);

      // 4. 解析 AI 返回的学习路径
      const learningPath = parseLearningPathResponse(response.content);

      if (!learningPath || !validateLearningPath(learningPath)) {
        this.showLearningPathStatus('AI 返回的内容格式不正确，请重试');
        this.showLearningPathEmpty();
        return;
      }

      // 5. 将条目信息补充到各阶段
      this.enrichLearningPathEntries(learningPath, entries);

      // 6. 渲染学习路径
      this.renderLearningPath(learningPath);
      this.showLearningPathStatus(`基于 ${entries.length} 条知识、${topicStats.topics.length} 个主题生成`);

    } catch (error) {
      if (error.message.includes('超时')) {
        this.showLearningPathStatus('AI 响应超时，请稍后重试');
      } else {
        this.showLearningPathStatus(`生成失败：${error.message}`);
      }
      this.showLearningPathEmpty();
    }
  }

  /**
   * 为学习路径中的每个阶段匹配知识库条目
   */
  enrichLearningPathEntries(learningPath, entries) {
    for (const stage of learningPath.stages) {
      const stageTopics = (stage.topics || []).map(t => t.toLowerCase());
      const matchedEntries = [];

      for (const entry of entries) {
        const entryTags = (entry.tags || []).map(t => t.toLowerCase());
        const entryTitle = (entry.title || '').toLowerCase();
        const matches = stageTopics.some(topic =>
          entryTags.some(tag => tag.includes(topic) || topic.includes(tag)) ||
          entryTitle.includes(topic)
        );
        if (matches) {
          matchedEntries.push({ id: entry.id, title: entry.title });
        }
      }

      // 每个阶段最多显示 5 条推荐阅读
      stage.entries = matchedEntries.slice(0, 5);
    }
  }

  /**
   * 渲染学习路径到面板
   */
  renderLearningPath(learningPath) {
    if (!this.learningPathContent) return;
    const html = renderLearningPathHTML(learningPath, (s) => this.escapeHtml(s));
    this.learningPathContent.innerHTML = html;

    // 绑定推荐条目点击事件
    this.learningPathContent.querySelectorAll('.lp-entry-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.id);
        if (id) {
          this.switchKnowledgeSubtab('entries');
          this.showKnowledgeDetail(id);
        }
      });
    });
  }

  /**
   * 显示学习路径加载动画
   */
  showLearningPathLoading() {
    if (!this.learningPathContent) return;
    this.learningPathContent.innerHTML = `
      <div class="lp-loading">
        <div class="lp-loading-spinner"></div>
        <span>正在生成学习路径...</span>
      </div>
    `;
  }

  /**
   * 显示空状态
   */
  showLearningPathEmpty() {
    if (!this.learningPathContent) return;
    this.learningPathContent.innerHTML = `
      <div class="empty-state" id="emptyLearningPath">
        <div class="empty-icon">🗺️</div>
        <p>点击上方按钮，AI 将基于你的知识库生成个性化学习路径</p>
      </div>
    `;
  }

  /**
   * 显示学习路径状态文字
   */
  showLearningPathStatus(text) {
    if (this.learningPathStatus) {
      this.learningPathStatus.textContent = text;
    }
  }

  // ==================== 高亮标注管理 ====================

  /**
   * 切换知识库子标签（知识条目 / 高亮标注 / 图谱）
   */
  switchKnowledgeSubtab(subtab) {
    document.querySelectorAll('.knowledge-subtab').forEach(t => {
      t.classList.toggle('active', t.dataset.subtab === subtab);
    });

    const isEntries = subtab === 'entries';
    const isHighlights = subtab === 'highlights';
    const isGraph = subtab === 'graph';
    const isLearningPath = subtab === 'learning-path';

    // 知识条目相关元素
    const knowledgeToolbar = this.searchInput?.closest('.knowledge-toolbar');
    const searchBox = this.searchInput?.closest('.search-box');
    const knowledgeActions = document.querySelector('.knowledge-actions');
    const tagFilter = this.tagFilter;
    const knowledgeList = this.knowledgeList;
    const knowledgeDetail = this.knowledgeDetail;

    if (searchBox) searchBox.style.display = isEntries ? '' : 'none';
    if (knowledgeActions) knowledgeActions.style.display = isEntries ? '' : 'none';
    if (tagFilter) tagFilter.style.display = isEntries ? '' : 'none';
    if (knowledgeList) knowledgeList.classList.toggle('hidden', !isEntries);
    if (knowledgeDetail) knowledgeDetail.classList.add('hidden');
    if (this.highlightsPanel) {
      this.highlightsPanel.classList.toggle('hidden', !isHighlights);
    }
    if (this.knowledgeGraphPanel) {
      this.knowledgeGraphPanel.classList.toggle('hidden', !isGraph);
    }
    if (this.learningPathPanel) {
      this.learningPathPanel.classList.toggle('hidden', !isLearningPath);
    }

    if (isHighlights) {
      this.loadHighlights();
    }
    if (isGraph) {
      this.renderKnowledgeGraph();
    }
  }

  /**
   * 渲染知识图谱
   */
  async renderKnowledgeGraph() {
    const canvas = this.knowledgeGraphCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;

    // 设置 canvas 实际像素大小
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 400 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '400px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 400;

    // 清空画布
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-primary').trim() || '#ffffff';
    ctx.fillRect(0, 0, w, h);

    try {
      // 获取知识条目
      const { KnowledgeBase } = await import('../lib/knowledge-base.js');
      const kb = new KnowledgeBase();
      await kb.init();
      const entries = await kb.getAllEntries(100);

      if (!entries || entries.length === 0) {
        this.graphInfo.textContent = '暂无知识条目';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim() || '#9ca3af';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('暂无知识条目，保存知识后即可查看图谱', w / 2, h / 2);
        return;
      }

      // 计算条目间的关联关系
      const relations = [];
      const maxPairs = Math.min(entries.length * 5, 500);
      for (let i = 0; i < entries.length && relations.length < maxPairs; i++) {
        for (let j = i + 1; j < entries.length && relations.length < maxPairs; j++) {
          const text1 = KnowledgeBase.getEntryCompareText(entries[i]);
          const text2 = KnowledgeBase.getEntryCompareText(entries[j]);
          const score = KnowledgeBase.calculateSimilarity(text1, text2);
          if (score > 0.15) {
            relations.push({
              source: entries[i].id,
              target: entries[j].id,
              weight: score,
            });
          }
        }
      }

      // 构建图数据
      const { nodes, edges } = buildGraphData(entries, relations, 100);

      if (nodes.length === 0) {
        this.graphInfo.textContent = '无可用数据';
        return;
      }

      this.graphInfo.textContent = `${nodes.length} 个节点，${edges.length} 条关联`;

      // 运行力导向布局
      forceDirectedLayout(nodes, edges, 50, { width: w, height: h });

      // 保存图数据用于交互
      this._graphNodes = nodes;
      this._graphEdges = edges;
      this._graphCtx = ctx;
      this._graphW = w;
      this._graphH = h;
      this._graphDpr = dpr;
      this._graphCanvas = canvas;
      this._hoveredNode = null;

      // 绘制图谱
      this.drawKnowledgeGraph(nodes, edges, ctx, w, h);

      // 绑定交互事件（仅绑定一次）
      if (!this._graphEventsBound) {
        this._graphEventsBound = true;

        canvas.addEventListener('mousemove', throttle((e) => {
          if (!this._graphNodes) return;
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          this.handleGraphHover(mx, my, e.clientX, e.clientY);
        }, 100));

        canvas.addEventListener('mouseleave', () => {
          if (this._hoveredNode) {
            this._hoveredNode = null;
            this.drawKnowledgeGraph(
              this._graphNodes, this._graphEdges,
              this._graphCtx, this._graphW, this._graphH
            );
            if (this.graphTooltip) this.graphTooltip.classList.add('hidden');
          }
        });

        canvas.addEventListener('click', (e) => {
          if (!this._graphNodes) return;
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          this.handleGraphClick(mx, my);
        });
      }
    } catch (err) {
      console.error('渲染知识图谱失败:', err);
      this.graphInfo.textContent = '图谱加载失败';
      ctx.fillStyle = '#ef4444';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('图谱加载失败: ' + err.message, w / 2, h / 2);
    }
  }

  /**
   * 绘制知识图谱（节点、边、标签）
   */
  drawKnowledgeGraph(nodes, edges, ctx, w, h) {
    ctx.clearRect(0, 0, w, h);

    // 背景
    const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-primary').trim() || '#ffffff';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const hoveredId = this._hoveredNode ? this._hoveredNode.id : null;
    const connectedToHovered = new Set();
    if (hoveredId !== null) {
      for (const edge of edges) {
        if (edge.source === hoveredId) connectedToHovered.add(edge.target);
        if (edge.target === hoveredId) connectedToHovered.add(edge.source);
      }
    }

    // 构建节点索引
    const nodeMap = {};
    for (const node of nodes) nodeMap[node.id] = node;

    // 绘制边
    for (const edge of edges) {
      const src = nodeMap[edge.source];
      const tgt = nodeMap[edge.target];
      if (!src || !tgt) continue;

      const isHighlighted = hoveredId !== null &&
        (edge.source === hoveredId || edge.target === hoveredId);
      const isDimmed = hoveredId !== null && !isHighlighted;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);

      if (isHighlighted) {
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.7)';
        ctx.lineWidth = 1 + edge.weight * 3;
      } else if (isDimmed) {
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.15)';
        ctx.lineWidth = 0.5;
      } else {
        ctx.strokeStyle = `rgba(180, 180, 180, ${0.2 + edge.weight * 0.4})`;
        ctx.lineWidth = 0.5 + edge.weight * 2;
      }
      ctx.stroke();
    }

    // 绘制节点
    for (const node of nodes) {
      const isHovered = hoveredId === node.id;
      const isConnected = connectedToHovered.has(node.id);
      const isDimmed = hoveredId !== null && !isHovered && !isConnected;

      // 节点圆
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);

      if (isHovered) {
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (isDimmed) {
        ctx.fillStyle = node.color;
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 节点标签
      if (!isDimmed) {
        ctx.fillStyle = isHovered
          ? (getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a1a')
          : (getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#6b7280');
        ctx.font = isHovered ? 'bold 12px sans-serif' : '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + node.size + 14);
      }
    }
  }

  /**
   * 处理图谱鼠标悬停
   */
  handleGraphHover(mx, my, clientX, clientY) {
    let hovered = null;
    for (const node of (this._graphNodes || [])) {
      const dx = mx - node.x;
      const dy = my - node.y;
      if (dx * dx + dy * dy <= node.size * node.size) {
        hovered = node;
        break;
      }
    }

    if (hovered !== this._hoveredNode) {
      this._hoveredNode = hovered;
      this.drawKnowledgeGraph(
        this._graphNodes, this._graphEdges,
        this._graphCtx, this._graphW, this._graphH
      );

      if (hovered && this.graphTooltip) {
        this.graphTooltip.textContent = hovered.label;
        this.graphTooltip.style.left = (clientX + 12) + 'px';
        this.graphTooltip.style.top = (clientY - 24) + 'px';
        this.graphTooltip.classList.remove('hidden');
        this._graphCanvas.style.cursor = 'pointer';
      } else {
        if (this.graphTooltip) this.graphTooltip.classList.add('hidden');
        if (this._graphCanvas) this._graphCanvas.style.cursor = 'default';
      }
    } else if (hovered && this.graphTooltip) {
      // 更新 tooltip 位置
      this.graphTooltip.style.left = (clientX + 12) + 'px';
      this.graphTooltip.style.top = (clientY - 24) + 'px';
    }
  }

  /**
   * 处理图谱点击（跳转到知识详情）
   */
  handleGraphClick(mx, my) {
    for (const node of (this._graphNodes || [])) {
      const dx = mx - node.x;
      const dy = my - node.y;
      if (dx * dx + dy * dy <= node.size * node.size) {
        if (node.entry && node.entry.id) {
          // 切换到知识条目子标签并显示详情
          this.switchKnowledgeSubtab('entries');
          this.showKnowledgeDetail(node.entry.id);
        }
        break;
      }
    }
  }

  /**
   * 加载并渲染高亮列表
   */
  async loadHighlights() {
    try {
      const highlights = await getAllHighlightsFlat(200);
      if (!this.highlightsList) return;

      if (highlights.length === 0) {
        this.highlightsList.innerHTML = '';
        if (this.emptyHighlights) {
          this.highlightsList.appendChild(this.emptyHighlights);
          this.emptyHighlights.classList.remove('hidden');
        }
        if (this.highlightsCount) this.highlightsCount.textContent = '0 条高亮';
        return;
      }

      if (this.emptyHighlights) this.emptyHighlights.classList.add('hidden');
      if (this.highlightsCount) {
        this.highlightsCount.textContent = `${highlights.length} 条高亮`;
      }

      this.highlightsList.innerHTML = highlights.map(h => `
        <div class="highlight-item" data-id="${h.id}" data-url="${this.escapeHtml(h.url)}">
          <div class="highlight-item-text">${this.escapeHtml(h.text)}</div>
          <div class="highlight-item-meta">
            <span>${formatTime(h.createdAt)}</span>
            <span class="highlight-item-url" title="${this.escapeHtml(h.url)}">${this.escapeHtml(this.getDomain(h.url))}</span>
          </div>
          <div class="highlight-item-actions">
            <button class="highlight-delete-btn" data-id="${h.id}" data-url="${this.escapeHtml(h.url)}">删除</button>
          </div>
        </div>
      `).join('');

      // 绑定删除事件
      this.highlightsList.querySelectorAll('.highlight-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const url = btn.dataset.url;
          await this.removeHighlight(url, id);
        });
      });
    } catch (e) {
      // 静默处理
    }
  }

  /**
   * 删除单个高亮
   */
  async removeHighlight(url, id) {
    try {
      await deleteHighlight(url, id);
      this.loadHighlights();
      this.addSystemMessage('已删除高亮');
    } catch (e) {
      this.addSystemMessage(`删除失败：${e.message}`);
    }
  }

  /**
   * 清空所有高亮
   */
  async clearAllHighlights() {
    if (!confirm('确定清空所有高亮标注？')) return;
    try {
      const all = await getAllHighlightsFlat(10000);
      const urls = new Set(all.map(h => h.url));
      for (const url of urls) {
        await deleteHighlightsByUrl(url);
      }
      this.loadHighlights();
      this.addSystemMessage('已清空所有高亮标注');
    } catch (e) {
      this.addSystemMessage(`清空失败：${e.message}`);
    }
  }

  /**
   * 从 URL 中提取域名
   */
  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return url;
    }
  }

  async importFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    this.addSystemMessage(`正在导入 ${files.length} 个文件...`);

    try {
      const entries = await parseImportFiles(files);

      if (entries.length === 0) {
        this.addSystemMessage('未能从文件中解析出任何条目');
        return;
      }

      let imported = 0;
      for (const entry of entries) {
        await this.memory.kb.saveEntry(entry);
        imported++;
      }

      this.addSystemMessage(`导入完成 ✓ 共 ${imported} 个条目`);
      this.loadKnowledgeTags();

      // 刷新列表（如果当前在知识库页）
      if (document.getElementById('panelKnowledge').classList.contains('active')) {
        this.loadKnowledgeList();
      }
    } catch (error) {
      this.addSystemMessage(`导入失败：${error.message}`);
    }

    // 清空 file input，允许重复导入同一文件
    this.fileImport.value = '';
  }

  async exportMarkdown() {
    const md = await this.memory.exportMarkdown();
    this.downloadFile(md, 'knowledge-base.md', 'text/markdown');
  }

  async exportJson() {
    const json = await this.memory.exportJSON();
    this.downloadFile(json, 'knowledge-base.json', 'application/json');
  }

  downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 导出当前对话为 Markdown 文件
   * 将 conversationHistory 转为结构化 Markdown 格式并下载
   */
  exportConversation() {
    if (!this.conversationHistory || this.conversationHistory.length === 0) {
      this.showToast('当前没有对话记录可导出', 'warning');
      return;
    }

    const pageTitle = this.pageTitle?.textContent || '未知页面';
    const pageUrl = this.currentTabUrl || '';
    const now = new Date();
    const exportTime = now.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const dateStr = now.toISOString().slice(0, 10);

    // 构建 Markdown
    let md = `# 对话记录 — ${pageTitle}\n`;
    md += `> 来源: ${pageUrl}\n`;
    md += `> 时间: ${exportTime}\n\n`;
    md += `---\n\n`;

    for (const msg of this.conversationHistory) {
      if (msg.role === 'user') {
        md += `**用户**: ${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        md += `**AI**: ${msg.content}\n\n`;
      }
      md += `---\n\n`;
    }

    const filename = `pagewise-对话-${dateStr}.md`;

    this.downloadFile(md, filename, 'text/markdown;charset=utf-8');
  }

  // ==================== 进化状态 ====================

  loadEvolutionStats() {
    const stats = this.evolution.getStats();

    const styleLabels = { concise: '简洁', balanced: '均衡', detailed: '详细' };
    const levelLabels = { beginner: '初学者', intermediate: '中级', advanced: '高级' };

    this.evolutionStats.innerHTML = `
      <div class="evo-stat">
        <div class="evo-stat-value">${stats.totalInteractions}</div>
        <div class="evo-stat-label">总交互次数</div>
      </div>
      <div class="evo-stat">
        <div class="evo-stat-value">${stats.successRate}%</div>
        <div class="evo-stat-label">成功率</div>
      </div>
      <div class="evo-stat">
        <div class="evo-stat-value">${styleLabels[stats.currentStyle] || stats.currentStyle}</div>
        <div class="evo-stat-label">回答风格</div>
      </div>
      <div class="evo-stat">
        <div class="evo-stat-value">${levelLabels[stats.inferredLevel] || stats.inferredLevel}</div>
        <div class="evo-stat-label">推断水平</div>
      </div>
    `;

    // 显示最近的进化日志
    const logs = this.evolution.evolutionLog.slice(-10).reverse();
    if (logs.length > 0) {
      this.evolutionLog.innerHTML = logs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return `<div class="evo-log-entry"><span class="evo-log-time">${time}</span>${log.reason || log.dimension}: ${log.value}</div>`;
      }).join('');
    } else {
      this.evolutionLog.innerHTML = '<div style="color:var(--text-muted);padding:4px 0;">暂无进化记录，助手会随着使用自动学习优化</div>';
    }
  }

  /**
   * 加载使用统计面板
   */
  async loadStatsPanel() {
    try {
      const stats = await getStats();
      const topSkills = await getTopSkills(5);
      const trend = await getUsageTrend(7);

      // 统计卡片网格
      if (this.statsGrid) {
        const cards = [
          { label: '提问次数', value: stats.totalQuestions },
          { label: '知识条目', value: stats.totalKnowledgeEntries },
          { label: '高亮标注', value: stats.totalHighlights },
          { label: '复习次数', value: stats.totalReviewSessions },
          { label: 'Token 消耗', value: stats.totalTokensUsed > 1000 ? `${(stats.totalTokensUsed / 1000).toFixed(1)}k` : stats.totalTokensUsed },
          { label: '使用技能', value: Object.keys(stats.skillUsage).length }
        ];
        this.statsGrid.innerHTML = cards.map(c => `
          <div class="stat-card">
            <div class="stat-card-value">${c.value}</div>
            <div class="stat-card-label">${c.label}</div>
          </div>
        `).join('');
      }

      // Top 技能列表
      if (this.statsSkillsList) {
        if (topSkills.length === 0) {
          this.statsSkillsList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">暂无技能使用记录</div>';
        } else {
          this.statsSkillsList.innerHTML = topSkills.map((s, i) => `
            <div class="stats-skill-item">
              <span class="stats-skill-rank">${i + 1}</span>
              <span class="stats-skill-name">${s.skillId}</span>
              <span class="stats-skill-count">${s.count} 次</span>
            </div>
          `).join('');
        }
      }

      // 7 天趋势图（文本条形图）
      if (this.statsTrendChart) {
        const maxQ = Math.max(...trend.map(d => d.questions), 1);
        trend.reverse(); // 最新的在上
        if (trend.every(d => d.questions === 0 && d.tokens === 0)) {
          this.statsTrendChart.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">暂无使用数据</div>';
        } else {
          this.statsTrendChart.innerHTML = trend.map(d => {
            const pct = Math.round((d.questions / maxQ) * 100);
            const label = d.date.slice(5); // MM-DD
            return `
              <div class="stats-trend-row">
                <span class="stats-trend-date">${label}</span>
                <div class="stats-trend-bar-wrap">
                  <div class="stats-trend-bar" style="width:${pct}%"></div>
                </div>
                <span class="stats-trend-value">${d.questions}</span>
              </div>
            `;
          }).join('');
        }
      }
    } catch (e) {
      // 静默处理
    }
  }

  // ==================== 设置 ====================

  loadSettingsForm() {
    // 根据保存的 provider 选中对应卡片
    const provider = this.settings.apiProvider || 'openai';
    this.selectProvider(provider);
    this.apiBaseUrlInput.value = this.settings.apiBaseUrl || '';
    this.apiKeyInput.value = this.settings.apiKey || '';
    this.modelInput.value = this.settings.model || '';
    this.maxTokensInput.value = this.settings.maxTokens || 4096;
    this.autoExtractCheckbox.checked = this.settings.autoExtract || false;
    this.themeSelect.value = this.settings.theme || 'light';
  }

  async saveSettingsForm() {
    const newSettings = {
      apiProvider: this.selectedProvider,
      apiProtocol: PROVIDERS[this.selectedProvider]?.protocol || 'openai',
      apiBaseUrl: this.apiBaseUrlInput.value.trim().replace(/\/+$/, ''),
      apiKey: this.apiKeyInput.value.trim(),
      model: this.modelInput.value.trim(),
      maxTokens: parseInt(this.maxTokensInput.value),
      autoExtract: this.autoExtractCheckbox.checked,
      theme: this.themeSelect.value
    };
    await saveSettings(newSettings);
    this.settings = newSettings;
    if (newSettings.apiKey) {
      this.aiClient = new AIClient({
        apiKey: newSettings.apiKey,
        baseUrl: newSettings.apiBaseUrl,
        model: newSettings.model,
        maxTokens: newSettings.maxTokens,
        protocol: newSettings.apiProtocol
      });
    }
    this.applyTheme();
    this.showToast('设置已保存', 'success');
  }

  async testConnection() {
    const protocol = PROVIDERS[this.selectedProvider]?.protocol || 'openai';
    const baseUrl = this.apiBaseUrlInput.value.trim().replace(/\/+$/, '');
    const apiKey = this.apiKeyInput.value.trim();
    const model = this.modelInput.value.trim();

    if (!apiKey) { this.showTestResult(false, '请先填写 API Key'); return; }
    if (!baseUrl) { this.showTestResult(false, '请先填写 API 地址'); return; }

    this.btnTestConnection.disabled = true;
    this.btnTestConnection.textContent = '测试中...';
    this.testResult.classList.add('hidden');

    const client = new AIClient({ apiKey, baseUrl, model: model || 'gpt-4o', protocol });
    const result = await client.testConnection();

    this.btnTestConnection.disabled = false;
    this.btnTestConnection.textContent = '测试连接';

    if (result.success) {
      this.showTestResult(true, `${result.protocol} | 模型: ${result.model} | ✓`);
    } else {
      this.showTestResult(false, `${result.protocol} | ${result.error}`);
    }
  }

  showTestResult(success, message) {
    this.testResult.classList.remove('hidden', 'success', 'error');
    this.testResult.classList.add(success ? 'success' : 'error');
    this.testResult.textContent = message;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== 代码执行沙箱 ====================

  /**
   * 从原始 Markdown 内容中提取 HTML/JavaScript 代码块
   * @param {string} markdownContent - 原始 Markdown 文本
   * @returns {Array<{lang: string, code: string}>} 代码块列表
   */
  extractRunnableCodeBlocks(markdownContent) {
    const blocks = [];
    const regex = /```(html|javascript)\n([\s\S]*?)```/gi;
    let match;
    while ((match = regex.exec(markdownContent)) !== null) {
      blocks.push({ lang: match[1].toLowerCase(), code: match[2] });
    }
    return blocks;
  }

  /**
   * 为消息中的可运行代码块注入独立运行按钮
   * @param {HTMLElement} messageEl - 消息 DOM 元素
   * @param {string} rawContent - 原始 Markdown 内容
   */
  injectCodeBlockRunButtons(messageEl, rawContent) {
    const blocks = this.extractRunnableCodeBlocks(rawContent);
    if (blocks.length === 0) return;

    const codeBlockWrappers = messageEl.querySelectorAll('.code-block-wrapper');
    let blockIndex = 0;

    codeBlockWrappers.forEach((wrapper) => {
      const codeEl = wrapper.querySelector('code');
      if (!codeEl) return;

      const langClass = codeEl.className || '';
      const isHtml = /lang-html/i.test(langClass);
      const isJs = /lang-javascript/i.test(langClass) || /lang-js/i.test(langClass);

      if (!isHtml && !isJs) return;

      const lang = isHtml ? 'html' : 'javascript';

      // 找到对应的原始代码块（按顺序匹配）
      const codeData = blocks[blockIndex];
      blockIndex++;
      if (!codeData) return;

      // 添加运行按钮
      const runBtn = document.createElement('button');
      runBtn.className = 'code-run-btn';
      runBtn.textContent = '▶️ 运行';
      runBtn.title = '运行代码';
      runBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.executeCodeSandbox(codeData.code, lang, wrapper);
      });
      wrapper.appendChild(runBtn);
    });
  }

  /**
   * 运行消息中所有可运行的代码块
   * @param {HTMLElement} messageEl - 消息 DOM 元素
   */
  runAllCodeBlocks(messageEl) {
    const bubble = messageEl.querySelector('.message-bubble');
    if (!bubble) return;

    const codeBlockWrappers = bubble.querySelectorAll('.code-block-wrapper');
    codeBlockWrappers.forEach((wrapper) => {
      const runBtn = wrapper.querySelector('.code-run-btn');
      if (runBtn) runBtn.click();
    });
  }

  /**
   * 在沙箱 iframe 中执行代码
   * @param {string} code - 要执行的代码
   * @param {'html'|'javascript'} lang - 代码语言
   * @param {HTMLElement} codeBlockWrapper - 代码块容器 DOM
   */
  executeCodeSandbox(code, lang, codeBlockWrapper) {
    // 移除之前的结果面板
    const existing = codeBlockWrapper.nextElementSibling;
    if (existing && existing.classList.contains('sandbox-result')) {
      existing.remove();
    }

    // 创建结果面板
    const resultPanel = document.createElement('div');
    resultPanel.className = 'sandbox-result';

    const header = document.createElement('div');
    header.className = 'sandbox-result-header';
    header.innerHTML = '<span class="sandbox-result-title">📺 执行结果</span>';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sandbox-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = '关闭结果';
    closeBtn.addEventListener('click', () => resultPanel.remove());
    header.appendChild(closeBtn);

    const outputArea = document.createElement('div');
    outputArea.className = 'sandbox-output';

    resultPanel.appendChild(header);
    resultPanel.appendChild(outputArea);

    // 插入到代码块下方
    codeBlockWrapper.parentNode.insertBefore(resultPanel, codeBlockWrapper.nextSibling);

    // 构建要执行的完整 HTML
    let htmlContent;
    if (lang === 'html') {
      // HTML 模式：注入 console 拦截
      htmlContent = this._buildSandboxHtml(code, true);
    } else {
      // JavaScript 模式：包裹在基本 HTML 中
      htmlContent = this._buildSandboxHtml(code, false);
    }

    // 创建 sandboxed iframe
    const iframe = document.createElement('iframe');
    iframe.className = 'sandbox-iframe';
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    // 超时 5 秒自动终止
    const timeout = setTimeout(() => {
      this._showSandboxOutput(outputArea, [{ type: 'error', text: '⏱️ 执行超时（5 秒），已自动终止' }]);
      this._cleanupIframe(iframe);
    }, 5000);

    // 监听 iframe 消息
    const messageHandler = (event) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== 'sandbox-log') return;

      if (data.action === 'output') {
        this._appendOutput(outputArea, data.entries);
      } else if (data.action === 'error') {
        this._showSandboxError(outputArea, data.message, data.stack);
      } else if (data.action === 'done') {
        clearTimeout(timeout);
        window.removeEventListener('message', messageHandler);
        this._cleanupIframe(iframe);
      }
    };
    window.addEventListener('message', messageHandler);

    // 写入 iframe 内容
    try {
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      iframe.onload = () => {
        URL.revokeObjectURL(url);
      };
      iframe.src = url;
    } catch (err) {
      clearTimeout(timeout);
      window.removeEventListener('message', messageHandler);
      this._showSandboxError(outputArea, err.message);
      this._cleanupIframe(iframe);
    }
  }

  /**
   * 构建沙箱 HTML 文档
   * @param {string} code - 代码内容
   * @param {boolean} isHtml - 是否为 HTML 模式
   * @returns {string} 完整 HTML 字符串
   */
  _buildSandboxHtml(code, isHtml) {
    // console 拦截脚本
    const consoleInterceptor = `
<script>
(function() {
  var entries = [];
  var origConsole = {};
  ['log','info','warn','error','debug'].forEach(function(method) {
    origConsole[method] = console[method];
    console[method] = function() {
      var args = Array.from(arguments).map(function(a) {
        try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
        catch(e) { return String(a); }
      });
      entries.push({ type: method, text: args.join(' ') });
      parent.postMessage({ type: 'sandbox-log', action: 'output', entries: [{ type: method, text: args.join(' ') }] }, '*');
    };
  });

  window.addEventListener('error', function(e) {
    parent.postMessage({ type: 'sandbox-log', action: 'error', message: e.message, stack: e.error ? e.error.stack : '' }, '*');
  });

  window.addEventListener('unhandledrejection', function(e) {
    var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled rejection';
    parent.postMessage({ type: 'sandbox-log', action: 'error', message: msg }, '*');
  });

  window.addEventListener('load', function() {
    setTimeout(function() {
      parent.postMessage({ type: 'sandbox-log', action: 'done' }, '*');
    }, 500);
  });
})();
<\/script>`;

    if (isHtml) {
      // HTML 模式：注入 console 拦截到 <head> 中
      if (code.includes('</head>')) {
        return code.replace('</head>', consoleInterceptor + '</head>');
      } else if (code.includes('<html')) {
        return code.replace(/<html[^>]*>/, '$&<head>' + consoleInterceptor + '</head>');
      } else {
        return '<!DOCTYPE html><html><head>' + consoleInterceptor + '</head><body>' + code + '</body></html>';
      }
    } else {
      // JavaScript 模式
      return '<!DOCTYPE html><html><head>' + consoleInterceptor + '</head><body><script>' + code + '<\/script></body></html>';
    }
  }

  /**
   * 在输出区域追加日志
   * @param {HTMLElement} outputArea
   * @param {Array} entries
   */
  _appendOutput(outputArea, entries) {
    entries.forEach(entry => {
      const line = document.createElement('div');
      line.className = 'sandbox-log sandbox-log-' + entry.type;
      line.textContent = entry.text;
      outputArea.appendChild(line);
    });
    outputArea.scrollTop = outputArea.scrollHeight;
  }

  /**
   * 显示完整的输出结果
   * @param {HTMLElement} outputArea
   * @param {Array} entries
   */
  _showSandboxOutput(outputArea, entries) {
    entries.forEach(entry => {
      const line = document.createElement('div');
      line.className = 'sandbox-log sandbox-log-' + entry.type;
      line.textContent = entry.text;
      outputArea.appendChild(line);
    });
  }

  /**
   * 显示错误信息
   * @param {HTMLElement} outputArea
   * @param {string} message
   * @param {string} [stack]
   */
  _showSandboxError(outputArea, message, stack) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'sandbox-log sandbox-log-error';
    errorDiv.textContent = '❌ ' + message;
    outputArea.appendChild(errorDiv);

    if (stack) {
      const stackDiv = document.createElement('div');
      stackDiv.className = 'sandbox-log sandbox-log-error sandbox-stack';
      stackDiv.textContent = stack;
      outputArea.appendChild(stackDiv);
    }
  }

  /**
   * 清理 iframe
   * @param {HTMLIFrameElement} iframe
   */
  _cleanupIframe(iframe) {
    try {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    } catch (e) {
      // 静默处理
    }
  }

  // ==================== 提供商 / Profile / 模型发现 ====================

  /**
   * 渲染提供商卡片
   */
  renderProviderCards() {
    if (!this.providerCards) return;
    this.providerCards.innerHTML = Object.entries(PROVIDERS).map(([key, p]) => `
      <div class="provider-card ${key === this.selectedProvider ? 'active' : ''}" data-provider="${key}">
        <span class="provider-icon">${p.icon}</span>
        <span class="provider-name">${p.name}</span>
      </div>
    `).join('');

    this.providerCards.querySelectorAll('.provider-card').forEach(card => {
      card.addEventListener('click', () => this.selectProvider(card.dataset.provider));
    });
  }

  /**
   * 选择提供商
   */
  selectProvider(key) {
    if (!PROVIDERS[key]) return;
    this.selectedProvider = key;
    const p = PROVIDERS[key];

    // 更新卡片高亮
    this.providerCards?.querySelectorAll('.provider-card').forEach(card => {
      card.classList.toggle('active', card.dataset.provider === key);
    });

    // 自动填充 URL 和模型
    if (!this.apiBaseUrlInput.value || Object.values(PROVIDERS).some(v => v.baseUrl === this.apiBaseUrlInput.value)) {
      this.apiBaseUrlInput.value = p.baseUrl;
    }
    if (!this.modelInput.value || Object.values(PROVIDERS).some(v => v.models.includes(this.modelInput.value))) {
      this.modelInput.value = p.models[0] || '';
    }

    // 更新模型下拉
    this.updateModelSelect(p.models);
  }

  /**
   * 更新模型下拉列表
   */
  updateModelSelect(models) {
    if (!this.modelSelect) return;
    if (models && models.length > 0) {
      this.modelSelect.classList.remove('hidden');
      this.modelSelect.innerHTML = '<option value="">选择模型...</option>' +
        models.map(m => `<option value="${m}" ${m === this.modelInput.value ? 'selected' : ''}>${m}</option>`).join('');
    } else {
      this.modelSelect.classList.add('hidden');
    }
  }

  /**
   * 从 API 获取模型列表
   */
  async fetchModels() {
    const baseUrl = this.apiBaseUrlInput.value.trim().replace(/\/+$/, '');
    const apiKey = this.apiKeyInput.value.trim();
    const protocol = PROVIDERS[this.selectedProvider]?.protocol || 'openai';

    if (!apiKey) { this.showToast('请先填写 API Key', 'warning'); return; }
    if (!baseUrl) { this.showToast('请先填写 API 地址', 'warning'); return; }

    this.btnFetchModels.disabled = true;
    this.btnFetchModels.textContent = '获取中...';

    try {
      const client = new AIClient({ apiKey, baseUrl, protocol });
      const models = await client.listModels();
      if (models.length > 0) {
        this.updateModelSelect(models);
        this.showToast(`发现 ${models.length} 个模型`, 'success');
      } else {
        this.showToast('未发现可用模型', 'warning');
      }
    } catch (e) {
      this.showToast(`获取失败: ${e.message}`, 'error');
    } finally {
      this.btnFetchModels.disabled = false;
      this.btnFetchModels.textContent = '获取模型';
    }
  }

  /**
   * 加载 Profile 列表
   */
  async loadProfileList() {
    this.profiles = await loadProfiles();
    this.profileSelect.innerHTML = '<option value="default">默认配置</option>' +
      this.profiles.map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`).join('');

    // 如果有上次使用的 profile，恢复它
    if (this.settings.activeProfileId && this.settings.activeProfileId !== 'default') {
      this.profileSelect.value = this.settings.activeProfileId;
      this.switchProfile(this.settings.activeProfileId);
    }
  }

  /**
   * 切换 Profile
   */
  switchProfile(id) {
    this.activeProfileId = id;
    if (id === 'default') return;
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return;

    this.selectProvider(profile.provider || 'custom');
    this.apiBaseUrlInput.value = profile.baseUrl || '';
    this.apiKeyInput.value = profile.apiKey || '';
    this.modelInput.value = profile.model || '';
    this.maxTokensInput.value = profile.maxTokens || 4096;
  }

  /**
   * 保存当前配置为 Profile
   */
  async saveProfile() {
    const name = prompt('配置名称：', PROVIDERS[this.selectedProvider]?.name || '自定义');
    if (!name) return;

    const profile = {
      id: 'profile_' + Date.now(),
      name,
      provider: this.selectedProvider,
      baseUrl: this.apiBaseUrlInput.value.trim(),
      apiKey: this.apiKeyInput.value.trim(),
      model: this.modelInput.value.trim(),
      maxTokens: parseInt(this.maxTokensInput.value) || 4096
    };

    this.profiles.push(profile);
    await saveProfiles(this.profiles);
    await this.loadProfileList();
    this.profileSelect.value = profile.id;
    this.showToast(`配置 "${name}" 已保存`, 'success');
  }

  /**
   * 删除当前选中的 Profile
   */
  async deleteProfile() {
    const id = this.profileSelect.value;
    if (id === 'default') { this.showToast('不能删除默认配置', 'warning'); return; }
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return;
    if (!confirm(`确定删除配置 "${profile.name}"？`)) return;

    this.profiles = this.profiles.filter(p => p.id !== id);
    await saveProfiles(this.profiles);
    await this.loadProfileList();
    this.showToast('配置已删除', 'info');
  }

  /**
   * 应用主题
   */
  applyTheme() {
    const theme = this.settings?.theme || 'light';
    if (theme === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  // ==================== 对话持久化 ====================

  /**
   * 恢复对话历史（优先 IndexedDB，回退 session storage）
   */
  async restoreConversation() {
    try {
      // 优先从 IndexedDB 按 URL 恢复
      const idbConv = await getConversationByUrl(this.currentTabUrl || '');
      if (idbConv && idbConv.messages && idbConv.messages.length > 0) {
        this.conversationHistory = idbConv.messages;
        const welcome = this.chatArea.querySelector('.welcome-message');
        if (welcome) welcome.remove();
        for (const msg of idbConv.messages) {
          if (msg.role === 'user') {
            this.addUserMessage(msg.content);
          } else if (msg.role === 'assistant') {
            this.addAIMessage(msg.content);
          }
        }
        this.addSystemMessage('已恢复之前的对话');
        return;
      }
    } catch (e) {
      // IndexedDB 失败，回退到 session storage
    }

    // 回退到 session storage
    try {
      const data = await loadConversation(this.currentTabUrl);
      if (data && data.conversationHistory && data.conversationHistory.length > 0) {
        this.conversationHistory = data.conversationHistory;
        const welcome = this.chatArea.querySelector('.welcome-message');
        if (welcome) welcome.remove();
        for (const msg of data.conversationHistory) {
          if (msg.role === 'user') {
            this.addUserMessage(msg.content);
          } else if (msg.role === 'assistant') {
            this.addAIMessage(msg.content);
          }
        }
        this.addSystemMessage('已恢复之前的对话');
      }
    } catch (e) {
      // 静默失败
    }
  }

  // ==================== 历史对话面板 ====================

  /**
   * 切换历史面板显隐
   */
  toggleHistoryPanel() {
    this.historyVisible = !this.historyVisible;
    if (this.historyPanel) {
      this.historyPanel.classList.toggle('hidden', !this.historyVisible);
    }
    if (this.historyVisible) {
      this.loadHistoryList();
    }
  }

  /**
   * 加载并渲染历史对话列表
   */
  async loadHistoryList() {
    if (!this.historyList) return;

    try {
      const keyword = this.historySearch?.value?.trim() || '';
      const conversations = keyword
        ? await searchConversations(keyword)
        : await getAllConversations();

      if (conversations.length === 0) {
        this.historyList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">💬</div>
            <p>${keyword ? '没有找到匹配的对话' : '还没有历史对话'}</p>
            <p class="text-muted">对话会自动保存到本地</p>
          </div>
        `;
        return;
      }

      this.historyList.innerHTML = conversations.map(conv => {
        const msgCount = conv.messages ? conv.messages.length : 0;
        const preview = conv.messages && conv.messages.length > 0
          ? conv.messages[conv.messages.length - 1].content.slice(0, 80)
          : '';
        const domain = this.getDomain(conv.url);

        return `
          <div class="history-item" data-id="${conv.id}">
            <div class="history-item-header">
              <span class="history-item-title">${this.escapeHtml(conv.title || domain)}</span>
              <span class="history-item-count">${msgCount} 条</span>
            </div>
            <div class="history-item-preview">${this.escapeHtml(preview)}${preview.length >= 80 ? '...' : ''}</div>
            <div class="history-item-meta">
              <span class="history-item-domain">${this.escapeHtml(domain)}</span>
              <span>${formatTime(conv.updatedAt)}</span>
            </div>
            <div class="history-item-actions">
              <button class="history-delete-btn" data-id="${conv.id}">删除</button>
            </div>
          </div>
        `;
      }).join('');

      // 绑定点击事件
      this.historyList.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => {
          // 如果点击的是删除按钮，不恢复对话
          if (e.target.closest('.history-delete-btn')) return;
          const id = parseInt(item.dataset.id);
          this.restoreHistoryConversation(id);
        });
      });

      // 绑定删除按钮
      this.historyList.querySelectorAll('.history-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset.id);
          try {
            await deleteConversation(id);
            this.loadHistoryList();
            this.addSystemMessage('已删除历史对话');
          } catch (e) {
            this.addSystemMessage(`删除失败：${e.message}`);
          }
        });
      });
    } catch (e) {
      this.historyList.innerHTML = `<div class="empty-state"><p>加载失败</p></div>`;
    }
  }

  /**
   * 恢复指定历史对话
   */
  async restoreHistoryConversation(id) {
    try {
      const all = await getAllConversations();
      const conv = all.find(c => c.id === id);
      if (!conv || !conv.messages || conv.messages.length === 0) return;

      // 切换到问答面板
      this.switchTab('chat');

      // 清空当前对话
      this.chatArea.innerHTML = '';
      this.conversationHistory = conv.messages;

      // 渲染对话
      for (const msg of conv.messages) {
        if (msg.role === 'user') {
          this.addUserMessage(msg.content);
        } else if (msg.role === 'assistant') {
          this.addAIMessage(msg.content);
        }
      }

      this.addSystemMessage(`已恢复对话（来源：${conv.title || this.getDomain(conv.url)}）`);

      // 隐藏历史面板
      this.historyVisible = false;
      if (this.historyPanel) {
        this.historyPanel.classList.add('hidden');
      }

      // 同步到 session storage
      await saveConversation(this.conversationHistory, this.currentTabUrl);
    } catch (e) {
      this.addSystemMessage(`恢复对话失败：${e.message}`);
    }
  }

  /**
   * 清空所有历史对话
   */
  async clearAllHistory() {
    if (!confirm('确定清空所有历史对话？此操作不可撤销。')) return;
    try {
      const all = await getAllConversations();
      for (const conv of all) {
        await deleteConversation(conv.id);
      }
      this.loadHistoryList();
      this.addSystemMessage('已清空所有历史对话');
    } catch (e) {
      this.addSystemMessage(`清空失败：${e.message}`);
    }
  }

  // ==================== 代码块复制 ====================

  // ==================== 多标签页联合分析 ====================

  /** 不可提取内容的 URL 前缀 */
  static RESTRICTED_URL_PREFIXES = [
    'chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://',
    'devtools://', 'view-source:', 'file://'
  ];

  /**
   * 检查 URL 是否为受限页面（无法注入 content script）
   * @param {string} url
   * @returns {boolean}
   */
  static isRestrictedUrl(url) {
    if (!url) return true;
    return SidebarApp.RESTRICTED_URL_PREFIXES.some(prefix => url.startsWith(prefix));
  }

  /**
   * 显示多标签页选择弹窗
   * 从 background 收集所有标签页信息，展示可选列表
   */
  async showMultiTabSelector() {
    if (!this.tabSelectorModal) return;

    try {
      const tabs = await chrome.runtime.sendMessage({ action: 'collectAllTabs' });

      if (!Array.isArray(tabs) || tabs.length === 0) {
        this.showToast('没有可用的标签页', 'warning');
        return;
      }

      // 过滤掉侧边栏自身，限制最多 5 个可选
      const selectableTabs = tabs
        .filter(t => !t.url?.includes('chrome-extension://'))
        .slice(0, 20); // 最多展示 20 个标签页供选择

      this._availableTabs = selectableTabs;
      this._selectedTabIds = new Set();

      // 渲染标签页列表
      this.tabSelectorBody.innerHTML = selectableTabs.map(tab => {
        const restricted = SidebarApp.isRestrictedUrl(tab.url);
        const domain = this.getDomain(tab.url);
        return `
          <label class="tab-selector-item ${restricted ? 'tab-selector-item-restricted' : ''}" data-tab-id="${tab.id}">
            <input type="checkbox" ${restricted ? 'disabled' : ''} data-tab-id="${tab.id}">
            <div class="tab-selector-item-info">
              <div class="tab-selector-item-title">${this.escapeHtml(tab.title)}</div>
              <div class="tab-selector-item-url">${this.escapeHtml(domain)}</div>
            </div>
            ${restricted ? '<span class="tab-selector-item-disabled">不可访问</span>' : ''}
          </label>
        `;
      }).join('');

      if (selectableTabs.length === 0) {
        this.tabSelectorBody.innerHTML = '<div class="tab-selector-empty">没有可用的标签页</div>';
      }

      // 绑定复选框事件
      this.tabSelectorBody.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(cb => {
        cb.addEventListener('change', () => {
          const tabId = parseInt(cb.dataset.tabId);
          if (cb.checked) {
            // 最多选择 5 个
            if (this._selectedTabIds.size >= 5) {
              cb.checked = false;
              this.showToast('最多同时分析 5 个标签页', 'warning');
              return;
            }
            this._selectedTabIds.add(tabId);
          } else {
            this._selectedTabIds.delete(tabId);
          }
          this._updateTabSelectorCount();
        });
      });

      // 点击整行也可切换
      this.tabSelectorBody.querySelectorAll('.tab-selector-item:not(.tab-selector-item-restricted)').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT') return; // 已经由 checkbox 处理
          const cb = item.querySelector('input[type="checkbox"]');
          if (cb) {
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
          }
        });
      });

      this._updateTabSelectorCount();
      this.tabSelectorModal.classList.remove('hidden');
    } catch (e) {
      this.showToast('获取标签页列表失败', 'error');
    }
  }

  /**
   * 隐藏多标签页选择弹窗
   */
  hideMultiTabSelector() {
    if (this.tabSelectorModal) {
      this.tabSelectorModal.classList.add('hidden');
    }
  }

  /**
   * 更新已选标签页计数
   */
  _updateTabSelectorCount() {
    const count = this._selectedTabIds?.size || 0;
    if (this.tabSelectorCount) {
      this.tabSelectorCount.textContent = `已选 ${count} 个（最多 5 个）`;
    }
    if (this.tabSelectorConfirm) {
      this.tabSelectorConfirm.disabled = count === 0;
    }
  }

  /**
   * 确认多标签页分析
   * 收集选中标签页内容并发送给 AI 联合分析
   */
  async confirmMultiTabAnalysis() {
    const selectedIds = [...(this._selectedTabIds || [])];
    if (selectedIds.length === 0) {
      this.showToast('请至少选择一个标签页', 'warning');
      return;
    }

    this.hideMultiTabSelector();
    this.switchTab('chat');

    if (!this.aiClient) {
      this.addSystemMessage('请先在设置中配置 API Key');
      this.switchTab('settings');
      return;
    }

    this.addSystemMessage(`正在收集 ${selectedIds.length} 个标签页的内容...`);
    const loadingEl = this.showLoading();

    try {
      const results = await chrome.runtime.sendMessage({
        action: 'collectTabContent',
        tabIds: selectedIds
      });

      loadingEl.remove();

      if (!Array.isArray(results)) {
        this.addSystemMessage('收集标签页内容失败');
        return;
      }

      // 分离成功和失败的标签页
      const successes = results.filter(r => r.content);
      const failures = results.filter(r => r.error);

      if (failures.length > 0) {
        const failMsg = failures.map(f => {
          const tab = this._availableTabs?.find(t => t.id === f.tabId);
          return `• ${tab?.title || '标签页 ' + f.tabId}：${f.error}`;
        }).join('\n');
        this.addSystemMessage(`以下标签页无法提取内容：\n${failMsg}`);
      }

      if (successes.length === 0) {
        this.addSystemMessage('所有选中的标签页都无法提取内容');
        return;
      }

      this.addSystemMessage(`已收集 ${successes.length} 个标签页内容，正在构建联合分析...`);

      // 构建联合分析 prompt
      const prompt = this.buildMultiTabPrompt(successes);

      // 联合分析的系统提示
      const enhancedSystemPrompt = this.aiClient.getSystemPrompt()
        + '\n\n[多页面联合分析模式]\n用户选择了多个页面进行联合分析。请综合分析所有页面内容，找出它们之间的关联、差异和互补信息。按页面逐一摘要后，给出跨页面的综合分析。';

      const loadingEl2 = this.showLoading();
      let fullResponse = '';
      let messageEl = null;

      for await (const chunk of this.aiClient.chatStream(
        [
          ...this.conversationHistory.slice(-2),
          { role: 'user', content: prompt }
        ],
        { systemPrompt: enhancedSystemPrompt }
      )) {
        fullResponse += chunk;
        if (!messageEl) {
          loadingEl2.remove();
          messageEl = this.addAIMessage('');
        }
        this.updateAIMessage(messageEl, fullResponse);
      }

      // 保存对话
      this.conversationHistory.push(
        { role: 'user', content: `📑 联合分析 ${successes.length} 个标签页` },
        { role: 'assistant', content: fullResponse }
      );
      await saveConversation(this.conversationHistory, this.currentTabUrl);

    } catch (e) {
      loadingEl.remove();
      this.addSystemMessage(`联合分析失败：${e.message}`);
    }
  }

  /**
   * 构建多标签页联合分析的 prompt
   * @param {Array<{title: string, url: string, content: string}>} tabs
   * @returns {string}
   */
  buildMultiTabPrompt(tabs) {
    let prompt = `我选择了 ${tabs.length} 个页面，请对它们进行联合分析：\n\n`;

    tabs.forEach((tab, i) => {
      prompt += `--- 页面 ${i + 1}：${tab.title} ---\n`;
      prompt += `URL：${tab.url}\n`;
      prompt += `内容：\n${tab.content}\n\n`;
    });

    prompt += `请对以上 ${tabs.length} 个页面进行联合分析：\n`;
    prompt += `1. 逐一简要总结每个页面的核心内容\n`;
    prompt += `2. 找出这些页面之间的关联性和主题联系\n`;
    prompt += `3. 对比它们之间的差异和互补信息\n`;
    prompt += `4. 给出跨页面的综合洞察或建议\n`;

    return prompt;
  }

  /**
   * 绑定代码块复制按钮事件委托
   */
  bindCopyButtonEvents() {
    this.chatArea.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-code-copy]');
      if (!btn) return;

      const wrapper = btn.closest('.code-block-wrapper');
      if (!wrapper) return;

      const codeEl = wrapper.querySelector('code');
      if (!codeEl) return;

      const text = codeEl.textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '已复制 ✓';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = '复制';
          btn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        this.showToast('复制失败', 'error');
      }
    });
  }

  // ==================== Toast 通知 ====================

  /**
   * 显示 Toast 通知
   * @param {string} message - 通知内容
   * @param {'info'|'success'|'error'|'warning'} type - 通知类型
   */
  showToast(message, type = 'info') {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-message">${this.escapeHtml(message)}</span>
      <button class="toast-close">&times;</button>
    `;

    // 点击关闭
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 300);
    });

    this.toastContainer.appendChild(toast);

    // 触发动画
    requestAnimationFrame(() => toast.classList.add('toast-show'));

    // 3 秒后自动消失
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
      }
    }, 3000);
  }

  // ==================== 间隔复习 ====================

  /**
   * 检查有多少到期卡片并显示复习提醒
   */
  async checkDueReviews() {
    try {
      const { KnowledgeBase } = await import('../lib/knowledge-base.js');
      const kb = new KnowledgeBase();
      const entries = await kb.getAllEntries(10000);
      const dueCards = getDueCards(entries);

      if (dueCards.length > 0 && this.reviewBanner && this.reviewBannerText) {
        this.reviewBannerText.textContent = `📚 你有 ${dueCards.length} 条知识待复习`;
        this.reviewBanner.classList.remove('hidden');
      }
    } catch (e) {
      // 静默处理
    }
  }

  /**
   * 开始复习模式
   */
  async startReview() {
    try {
      const { KnowledgeBase } = await import('../lib/knowledge-base.js');
      const kb = new KnowledgeBase();
      const entries = await kb.getAllEntries(10000);
      this.reviewCards = getDueCards(entries);

      if (this.reviewCards.length === 0) {
        this.showToast('没有待复习的知识卡片', 'info');
        return;
      }

      this.reviewIndex = 0;
      this.reviewCorrect = 0;
      this.reviewTotal = this.reviewCards.length;

      // 显示复习面板
      this.reviewOverlay.classList.remove('hidden');
      this.reviewSummary.classList.add('hidden');
      this.reviewCard.classList.remove('hidden');
      this.showCurrentReviewCard();
    } catch (e) {
      this.showToast('启动复习失败', 'error');
    }
  }

  /**
   * 显示当前复习卡片
   */
  showCurrentReviewCard() {
    if (this.reviewIndex >= this.reviewCards.length) {
      this.showReviewSummary();
      return;
    }

    const card = this.reviewCards[this.reviewIndex];

    // 更新进度
    this.reviewProgress.textContent = `${this.reviewIndex + 1} / ${this.reviewTotal}`;

    // 显示问题
    const questionText = card.question || card.title || '（无问题）';
    this.reviewQuestion.innerHTML = this.escapeHtml(questionText);

    // 重置答案和评分区域
    this.reviewAnswer.classList.add('hidden');
    this.reviewRating.classList.add('hidden');
    this.btnShowAnswer.classList.remove('hidden');
  }

  /**
   * 显示答案
   */
  showReviewAnswer() {
    const card = this.reviewCards[this.reviewIndex];
    const answerText = card.answer || card.summary || card.content || '（无答案）';

    this.reviewAnswer.innerHTML = renderMarkdown(answerText);
    this.reviewAnswer.classList.remove('hidden');
    this.reviewRating.classList.remove('hidden');
    this.btnShowAnswer.classList.add('hidden');
  }

  /**
   * 评分并更新复习调度
   * @param {number} quality - 评分 (1/3/5)
   */
  async rateReviewCard(quality) {
    const card = this.reviewCards[this.reviewIndex];

    try {
      const currentReview = card.review || initializeReviewData();
      const newReview = calculateNextReview(quality, currentReview);

      // 更新到数据库
      const { KnowledgeBase } = await import('../lib/knowledge-base.js');
      const kb = new KnowledgeBase();
      await kb.updateEntry(card.id, { review: newReview });

      // 统计正确数（quality >= 3 为正确）
      if (quality >= 3) {
        this.reviewCorrect++;
      }
    } catch (e) {
      // 静默处理
    }

    // 下一张
    this.reviewIndex++;
    this.showCurrentReviewCard();
  }

  /**
   * 显示复习完成统计
   */
  showReviewSummary() {
    this.reviewCard.classList.add('hidden');
    this.reviewSummary.classList.remove('hidden');

    const accuracy = this.reviewTotal > 0
      ? Math.round((this.reviewCorrect / this.reviewTotal) * 100)
      : 0;

    this.summaryStats.innerHTML = `
      <div class="stat-item">复习总数：<span class="stat-value">${this.reviewTotal}</span></div>
      <div class="stat-item">正确数：<span class="stat-value">${this.reviewCorrect}</span></div>
      <div class="stat-item">正确率：<span class="stat-value">${accuracy}%</span></div>
    `;

    // 隐藏复习提醒条
    if (this.reviewBanner) {
      this.reviewBanner.classList.add('hidden');
    }

    // 记录复习统计
    incrementCounter('totalReviewSessions');
  }

  /**
   * 关闭复习模式
   */
  closeReview() {
    this.reviewOverlay.classList.add('hidden');
    this.reviewCards = [];
    this.reviewIndex = 0;
    this.reviewCorrect = 0;
    this.reviewTotal = 0;

    // 重新检查是否有到期卡片
    this.checkDueReviews();
  }

  // ==================== Prompt 模板管理 ====================

  /** 切换模板弹窗显示/隐藏 */
  toggleTemplatePopup() {
    if (this.templatePopup.classList.contains('hidden')) {
      this.showTemplatePopup();
    } else {
      this.hideTemplatePopup();
    }
  }

  /** 显示模板弹窗 */
  async showTemplatePopup() {
    this.templatePopup.classList.remove('hidden');
    this.closeTemplateForm();
    await this.renderTemplateList();
  }

  /** 隐藏模板弹窗 */
  hideTemplatePopup() {
    this.templatePopup.classList.add('hidden');
    this.closeTemplateForm();
  }

  /** 渲染模板列表 */
  async renderTemplateList() {
    try {
      const templates = await getAllTemplates();
      if (templates.length === 0) {
        this.templateList.innerHTML = '<div class="template-empty">暂无模板</div>';
        return;
      }

      const categoryIcons = { code: '💻', debug: '🐛', learning: '📖', custom: '⚙️' };

      this.templateList.innerHTML = templates.map(tpl => `
        <div class="template-item" data-id="${tpl.id}">
          <div class="template-item-info">
            <div class="template-item-name">
              ${categoryIcons[tpl.category] || '📋'} ${this._escapeHtml(tpl.name)}
              ${tpl.isBuiltin ? '<span class="template-item-badge">内置</span>' : ''}
            </div>
            <div class="template-item-preview">${this._escapeHtml(tpl.content.substring(0, 60))}</div>
          </div>
          <div class="template-item-actions">
            ${!tpl.isBuiltin ? `<button class="template-item-btn btn-tpl-edit" data-id="${tpl.id}" title="编辑">✏️</button>` : ''}
            ${!tpl.isBuiltin ? `<button class="template-item-btn btn-tpl-delete" data-id="${tpl.id}" title="删除">🗑️</button>` : ''}
          </div>
        </div>
      `).join('');

      // 绑定点击事件：选择模板
      this.templateList.querySelectorAll('.template-item').forEach(item => {
        item.addEventListener('click', (e) => {
          // 如果点的是操作按钮，不触发选择
          if (e.target.closest('.template-item-btn')) return;
          this.selectTemplate(item.dataset.id);
        });
      });

      // 编辑按钮
      this.templateList.querySelectorAll('.btn-tpl-edit').forEach(btn => {
        btn.addEventListener('click', () => this.editTemplate(btn.dataset.id));
      });

      // 删除按钮
      this.templateList.querySelectorAll('.btn-tpl-delete').forEach(btn => {
        btn.addEventListener('click', () => this.handleDeleteTemplate(btn.dataset.id));
      });
    } catch (err) {
      this.templateList.innerHTML = `<div class="template-empty">加载失败: ${err.message}</div>`;
    }
  }

  /** 选择模板并填入输入框 */
  async selectTemplate(id) {
    try {
      const text = await renderPromptTemplate(id, {});
      this.userInput.value = text;
      this.userInput.style.height = 'auto';
      this.userInput.style.height = Math.min(this.userInput.scrollHeight, 120) + 'px';
      this.userInput.focus();
      this.hideTemplatePopup();
    } catch (err) {
      this.showToast(`使用模板失败: ${err.message}`, 'error');
    }
  }

  /** 打开新建模板表单 */
  openTemplateForm() {
    this.tplEditId.value = '';
    this.tplName.value = '';
    this.tplContent.value = this.userInput.value || '';
    this.tplCategory.value = 'custom';
    this.templateForm.classList.remove('hidden');
    this.tplName.focus();
  }

  /** 编辑已有模板 */
  async editTemplate(id) {
    try {
      const templates = await getAllTemplates();
      const tpl = templates.find(t => t.id === id);
      if (!tpl) return;

      this.tplEditId.value = tpl.id;
      this.tplName.value = tpl.name;
      this.tplContent.value = tpl.content;
      this.tplCategory.value = tpl.category || 'custom';
      this.templateForm.classList.remove('hidden');
      this.tplName.focus();
    } catch (err) {
      this.showToast(`编辑失败: ${err.message}`, 'error');
    }
  }

  /** 关闭模板表单 */
  closeTemplateForm() {
    this.templateForm.classList.add('hidden');
    this.tplName.value = '';
    this.tplContent.value = '';
    this.tplEditId.value = '';
  }

  /** 保存模板（新建或更新） */
  async handleSaveTemplate() {
    const name = this.tplName.value.trim();
    const content = this.tplContent.value.trim();
    const category = this.tplCategory.value;
    const editId = this.tplEditId.value;

    if (!name) {
      this.showToast('请输入模板名称', 'error');
      return;
    }
    if (!content) {
      this.showToast('请输入模板内容', 'error');
      return;
    }

    try {
      const tplData = editId ? { id: editId, name, content, category } : { name, content, category };
      await savePromptTemplate(tplData);
      this.showToast(editId ? '模板已更新' : '模板已保存', 'success');
      this.closeTemplateForm();
      await this.renderTemplateList();
    } catch (err) {
      this.showToast(`保存失败: ${err.message}`, 'error');
    }
  }

  /** 删除模板 */
  async handleDeleteTemplate(id) {
    if (!confirm('确定删除此模板？')) return;
    try {
      await deletePromptTemplate(id);
      this.showToast('模板已删除', 'success');
      await this.renderTemplateList();
    } catch (err) {
      this.showToast(`删除失败: ${err.message}`, 'error');
    }
  }

  /** HTML 转义（防 XSS） */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

const app = new SidebarApp();
