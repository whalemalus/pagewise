/**
 * Sidebar - 侧边栏主逻辑（集成智能系统）
 */

import { AIClient } from '../lib/ai-client.js';
import { SkillEngine } from '../lib/skill-engine.js';
import { PageSense } from '../lib/page-sense.js';
import { MemorySystem } from '../lib/memory.js';
import { AgentLoop } from '../lib/agent-loop.js';
import { EvolutionEngine } from '../lib/evolution.js';
import { allBuiltinSkills } from '../skills/builtin-skills.js';
import { parseImportFiles } from '../lib/importer.js';
import { getSettings, saveSettings, renderMarkdown, formatTime, debounce, saveConversation, loadConversation, clearConversation } from '../lib/utils.js';

class SidebarApp {
  constructor() {
    this.aiClient = null;
    this.settings = {};
    this.conversationHistory = [];
    this.currentPageContent = null;
    this.selectedEntryId = null;
    this.activeTag = null;
    this.agentRunning = false;

    // 智能系统
    this.skills = new SkillEngine();
    this.pageSense = new PageSense();
    this.memory = new MemorySystem();
    this.evolution = new EvolutionEngine();

    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.memory.init();
    this.skills.registerAll(allBuiltinSkills);
    this.bindElements();
    this.bindEvents();
    this.loadPageContext();
    this.loadKnowledgeTags();
    this.listenMessages();
    this.restoreConversation();
    this.bindCopyButtonEvents();
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
    this.apiProtocolSelect = document.getElementById('apiProtocol');
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

    // Evolution
    this.evolutionStats = document.getElementById('evolutionStats');
    this.evolutionLog = document.getElementById('evolutionLog');
    this.btnResetEvolution = document.getElementById('btnResetEvolution');

    // Toast 容器
    this.toastContainer = document.getElementById('toastContainer');
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
    else if (tabName === 'knowledge') this.loadKnowledgeList();
    else if (tabName === 'settings') { this.loadSettingsForm(); this.loadEvolutionStats(); }
  }

  // ==================== 页面上下文 ====================

  async loadPageContext() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        this.pageTitle.textContent = tab.title || '未知页面';
        this.currentTabId = tab.id;
        this.currentTabUrl = tab.url;
        if (this.settings.autoExtract) this.extractContent();
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
    this.skillsSummary.textContent = `共 ${allSkills.length} 个技能，${enabledCount} 个已启用`;

    if (filtered.length === 0) {
      this.skillsList.innerHTML = `<div class="empty-state"><p>该分类下没有技能</p></div>`;
      return;
    }

    const categoryIcons = {
      code: '💻', debug: '🐛', doc: '📡', learning: '📚', export: '📤', general: '⚙️'
    };

    this.skillsList.innerHTML = filtered.map(skill => `
      <div class="skill-card ${skill.enabled ? '' : 'disabled'}" data-id="${skill.id}">
        <div class="skill-card-header">
          <div class="skill-card-name">
            ${categoryIcons[skill.category] || '⚙️'} ${this.escapeHtml(skill.name)}
          </div>
          <span class="skill-card-category">${this.escapeHtml(skill.category)}</span>
        </div>
        <div class="skill-card-desc">${this.escapeHtml(skill.description)}</div>
        <div class="skill-card-footer">
          <div class="skill-card-trigger">
            ${skill.trigger ? '🟢 自动触发' : '🔵 手动触发'}
          </div>
          <div class="skill-card-actions">
            <button class="skill-run-btn" data-id="${skill.id}" ${skill.enabled ? '' : 'disabled'}>运行</button>
            <button class="skill-toggle ${skill.enabled ? 'on' : ''}" data-id="${skill.id}"></button>
          </div>
        </div>
      </div>
    `).join('');

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

    // 更新统计
    const allSkills = this.skills.getAll();
    const enabledCount = allSkills.filter(s => s.enabled).length;
    this.skillsSummary.textContent = `共 ${allSkills.length} 个技能，${enabledCount} 个已启用`;
  }

  // ==================== 对话功能 ====================

  async sendMessage() {
    const text = this.userInput.value.trim();
    if (!text) return;
    // /clear 命令：清除对话
    if (text === '/clear') {
      this.conversationHistory = [];
      await clearConversation();
      this.chatArea.innerHTML = '';
      this.addSystemMessage('对话已清除');
      this.userInput.value = '';
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

      for await (const chunk of this.aiClient.chatStream(
        [
          ...this.conversationHistory.slice(-6),
          { role: 'user', content: this.aiClient.buildPageQuestionPrompt(contentWithSelection, text) }
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
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-ai';
    messageDiv.innerHTML = `
      <div class="message-bubble">${renderMarkdown(content)}</div>
      <div class="message-actions">
        <button class="msg-action-btn" data-action="copy">复制</button>
        <button class="msg-action-btn" data-action="save">💾 保存</button>
        <button class="msg-action-btn" data-action="highlight">🔍 高亮</button>
      </div>
    `;
    messageDiv.querySelectorAll('.msg-action-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleMessageAction(btn.dataset.action, messageDiv));
    });
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
      case 'save':
        await this.saveToKnowledgeBase(text);
        if (interactionId) this.evolution.recordSignal('saved_to_kb', interactionId);
        break;
      case 'highlight':
        const codeMatch = text.match(/`([^`]+)`/);
        if (codeMatch) {
          chrome.tabs.sendMessage(this.currentTabId, { action: 'highlight', text: codeMatch[1] });
        }
        break;
    }
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

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.chatArea.scrollTop = this.chatArea.scrollHeight;
    });
  }

  // ==================== 知识库 ====================

  async loadKnowledgeList() {
    const entries = await this.memory.getAllEntries(50);
    if (entries.length === 0) {
      this.emptyKnowledge.classList.remove('hidden');
      this.knowledgeList.innerHTML = '';
      this.knowledgeList.appendChild(this.emptyKnowledge);
      return;
    }
    this.emptyKnowledge.classList.add('hidden');
    this.renderKnowledgeList(entries);
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

    this.knowledgeList.innerHTML = filtered.map(entry => `
      <div class="knowledge-item" data-id="${entry.id}">
        <div class="knowledge-item-title">${this.escapeHtml(entry.title)}</div>
        <div class="knowledge-item-summary">${this.escapeHtml(entry.summary || entry.question || '')}</div>
        <div class="knowledge-item-meta">
          <span>${formatTime(entry.createdAt)}</span>
          <div class="knowledge-item-tags">
            ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      </div>
    `).join('');

    this.knowledgeList.querySelectorAll('.knowledge-item').forEach(item => {
      item.addEventListener('click', () => this.showKnowledgeDetail(parseInt(item.dataset.id)));
    });
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
  }

  showKnowledgeList() {
    this.knowledgeDetail.classList.add('hidden');
    this.knowledgeList.classList.remove('hidden');
    this.selectedEntryId = null;
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
      this.loadKnowledgeTags();
    } catch (error) {
      this.addSystemMessage(`保存失败：${error.message}`);
    }
  }

  async searchKnowledge() {
    const query = this.searchInput.value.trim();
    if (!query) { this.loadKnowledgeList(); return; }
    const results = await this.memory.kb.search(query);
    this.renderKnowledgeList(results);
  }

  async deleteEntry() {
    if (!this.selectedEntryId) return;
    if (!confirm('确定删除这条知识？')) return;
    await this.memory.deleteEntry(this.selectedEntryId);
    this.addSystemMessage('已删除');
    this.showKnowledgeList();
    this.loadKnowledgeTags();
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

  // ==================== 设置 ====================

  loadSettingsForm() {
    this.apiProtocolSelect.value = this.settings.apiProtocol || 'openai';
    this.apiBaseUrlInput.value = this.settings.apiBaseUrl || 'https://api.openai.com';
    this.apiKeyInput.value = this.settings.apiKey || '';
    this.modelInput.value = this.settings.model || 'gpt-4o';
    this.maxTokensInput.value = this.settings.maxTokens || 4096;
    this.autoExtractCheckbox.checked = this.settings.autoExtract || false;
    this.themeSelect.value = this.settings.theme || 'light';
  }

  async saveSettingsForm() {
    const newSettings = {
      apiProtocol: this.apiProtocolSelect.value,
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
    this.settingsStatus.classList.remove('hidden');
    setTimeout(() => this.settingsStatus.classList.add('hidden'), 2000);
  }

  async testConnection() {
    const protocol = this.apiProtocolSelect.value;
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
      this.showTestResult(true, `${result.protocol} 协议 | 模型: ${result.model} | 响应: "${result.content}"`);
    } else {
      this.showTestResult(false, `${result.protocol} 协议 | ${result.error}`);
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

  // ==================== 对话持久化 ====================

  /**
   * 恢复对话历史
   */
  async restoreConversation() {
    try {
      const data = await loadConversation(this.currentTabUrl);
      if (data && data.conversationHistory && data.conversationHistory.length > 0) {
        this.conversationHistory = data.conversationHistory;
        // 重新渲染对话
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
      // 静默失败，不影响正常使用
    }
  }

  // ==================== 代码块复制 ====================

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
}

const app = new SidebarApp();
