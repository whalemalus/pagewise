/**
 * Options - 设置页面逻辑 + 书签图谱标签页集成
 *
 * Tab 切换逻辑:
 *   - 默认显示 "设置" 标签页
 *   - 支持 hash 路由 #tab=bookmark 直接跳转图谱标签页
 *   - 切换到图谱 Tab 时: BookmarkPanel.render() → init() (懒初始化)
 *   - 切换离开图谱 Tab 时: BookmarkPanel.destroy() 释放 Canvas/事件
 *   - 再次切回图谱 Tab 时: 重新 render + init
 */

import { KnowledgeBase } from '../lib/knowledge-base.js';
import { AIClient } from '../lib/ai-client.js';
import { getSettings, saveSettings } from '../lib/utils.js';
import { DocMindClient } from '../lib/docmind-client.js';
import { AIGateway } from '../lib/ai-gateway.js';
import { BookmarkPanel } from './bookmark-panel.js';
import { BookmarkCollector } from '../lib/bookmark-collector.js';
import { BookmarkIndexer } from '../lib/bookmark-indexer.js';
import { BookmarkGraphEngine } from '../lib/bookmark-graph.js';
import { BookmarkVisualizer } from '../lib/bookmark-visualizer.js';
import { BookmarkDetailPanel } from '../lib/bookmark-detail-panel.js';
import { BookmarkSearch } from '../lib/bookmark-search.js';
import { BookmarkRecommender } from '../lib/bookmark-recommender.js';

const kb = new KnowledgeBase();

// ==================== TabManager ====================

/**
 * 创建 TabManager — 管理设置/图谱标签页切换和 BookmarkPanel 生命周期
 *
 * @param {Object} options
 * @param {HTMLElement} options.tabNav — Tab 导航栏容器
 * @param {HTMLElement} options.settingsPanel — 设置面板容器
 * @param {HTMLElement} options.bookmarkPanel — 图谱面板容器
 * @param {BookmarkPanel|null} options.panel — BookmarkPanel 实例 (懒创建)
 * @returns {{ switchTab: (tabName: string) => void, getCurrentTab: () => string }}
 *
 * 注意: 此函数的核心逻辑在 tests/test-bookmark-options-tab.js 中通过
 *       buildTabManager() 独立测试。此处为生产代码，包含真实 DOM 操作。
 */
function createTabManager({ tabNav, settingsPanel, bookmarkPanel, panel }) {
  let currentTab = 'settings';
  let panelInstance = panel;

  /** 切换 Tab */
  function switchTab(tabName) {
    if (tabName === currentTab) return;

    // 更新 Tab 按钮样式
    const buttons = tabNav.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (tabName === 'bookmark') {
      // 切换到图谱标签页
      settingsPanel.style.display = 'none';
      bookmarkPanel.style.display = 'block';

      if (panelInstance) {
        // 标记加载中，渲染加载状态，再异步初始化
        panelInstance.markLoading();
        panelInstance.render(bookmarkPanel);
        panelInstance.init()
          .then(() => {
            // init 完成后重新渲染，显示图谱数据
            panelInstance.render(bookmarkPanel);
          })
          .catch(err => {
            console.error('BookmarkPanel init failed:', err);
            // init 失败后也重新渲染，显示错误状态
            panelInstance.render(bookmarkPanel);
          });
      }
    } else if (tabName === 'settings') {
      // 切换回设置标签页
      bookmarkPanel.style.display = 'none';
      settingsPanel.style.display = 'block';

      if (panelInstance) {
        panelInstance.destroy();
      }
    }

    currentTab = tabName;
  }

  /** 获取当前 Tab */
  function getCurrentTab() {
    return currentTab;
  }

  return { switchTab, getCurrentTab };
}

// ==================== 页面初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
  // --- 设置标签页初始化 ---
  const settings = await getSettings();

  document.getElementById('apiProtocol').value = settings.apiProtocol || 'openai';
  document.getElementById('apiBaseUrl').value = settings.apiBaseUrl || 'https://api.openai.com';
  document.getElementById('apiKey').value = settings.apiKey || '';
  document.getElementById('model').value = settings.model || 'gpt-4o';
  document.getElementById('maxTokens').value = settings.maxTokens || 4096;
  document.getElementById('autoExtract').checked = settings.autoExtract || false;
  document.getElementById('autoSave').checked = settings.autoSave || false;
  document.getElementById('theme').value = settings.theme || 'light';

  // 保存设置
  document.getElementById('btnSave').addEventListener('click', async () => {
    const newSettings = {
      apiProtocol: document.getElementById('apiProtocol').value,
      apiBaseUrl: document.getElementById('apiBaseUrl').value.trim().replace(/\/+$/, ''),
      apiKey: document.getElementById('apiKey').value.trim(),
      model: document.getElementById('model').value.trim(),
      maxTokens: parseInt(document.getElementById('maxTokens').value),
      autoExtract: document.getElementById('autoExtract').checked,
      autoSave: document.getElementById('autoSave').checked,
      theme: document.getElementById('theme').value
    };

    await saveSettings(newSettings);

    const status = document.getElementById('saveStatus');
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 2000);
  });

  // 测试连接
  document.getElementById('btnTestConnection').addEventListener('click', async () => {
    const protocol = document.getElementById('apiProtocol').value;
    const baseUrl = document.getElementById('apiBaseUrl').value.trim().replace(/\/+$/, '');
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('model').value.trim();
    const testResult = document.getElementById('testResult');
    const btn = document.getElementById('btnTestConnection');

    if (!apiKey) {
      showTestResult(false, '请先填写 API Key');
      return;
    }

    btn.disabled = true;
    btn.textContent = '测试中...';
    testResult.classList.add('hidden');

    const client = new AIClient({
      apiKey, baseUrl,
      model: model || 'gpt-4o',
      protocol
    });
    const result = await client.testConnection();

    btn.disabled = false;
    btn.textContent = '测试连接';

    if (result.success) {
      showTestResult(true, `${result.protocol} 协议 | 模型: ${result.model} | 响应: "${result.content}"`);
    } else {
      showTestResult(false, `${result.protocol} 协议 | ${result.error}`);
    }
  });

  // 导出 Markdown
  document.getElementById('btnExportMd').addEventListener('click', async () => {
    await kb.init();
    const md = await kb.exportMarkdown();
    downloadFile(md, 'knowledge-base.md', 'text/markdown');
  });

  // 导出 JSON
  document.getElementById('btnExportJson').addEventListener('click', async () => {
    await kb.init();
    const json = await kb.exportJSON();
    downloadFile(json, 'knowledge-base.json', 'application/json');
  });

  // 清除数据
  document.getElementById('btnClearData').addEventListener('click', async () => {
    if (!confirm('确定要清除所有知识库数据吗？此操作不可恢复。')) return;
    if (!confirm('再次确认：这将永久删除所有保存的知识条目。')) return;

    await kb.init();
    const entries = await kb.getAllEntries(100000);
    for (const entry of entries) {
      await kb.deleteEntry(entry.id);
    }
    alert('所有数据已清除');
  });

  // --- DocMind AI 网关初始化 ---
  const aiGatewaySection = document.getElementById('aiGatewaySection');
  const gatewayDot = document.getElementById('gatewayDot');
  const gatewayStatusText = document.getElementById('gatewayStatusText');
  const aiGatewayActions = document.getElementById('aiGatewayActions');

  // 初始化 DocMind 客户端和 AI 网关
  let docMindClient = null;
  let aiGateway = null;

  try {
    const dmConfig = await new Promise((resolve) => {
      chrome.storage.sync.get({ pagewiseDocMind: { enabled: false, serverUrl: '', apiKey: '' } }, (result) => {
        resolve(result.pagewiseDocMind);
      });
    });

    if (dmConfig.enabled && dmConfig.serverUrl && dmConfig.apiKey) {
      docMindClient = new DocMindClient({
        serverUrl: dmConfig.serverUrl,
        apiKey: dmConfig.apiKey,
      });
      docMindClient._connected = true;

      aiGateway = new AIGateway({ client: docMindClient });
      await aiGateway.loadConfig();

      // 显示已连接状态
      gatewayDot.classList.add('connected');
      gatewayStatusText.textContent = 'DocMind 已连接';
      aiGatewayActions.style.display = 'flex';
    } else {
      gatewayStatusText.textContent = 'DocMind 未连接（在 DocMind 设置中配置后可用）';
    }
  } catch (e) {
    gatewayStatusText.textContent = '初始化失败: ' + e.message;
  }

  // 同步 DocMind 配置
  const btnSyncAIConfig = document.getElementById('btnSyncAIConfig');
  if (btnSyncAIConfig) {
    btnSyncAIConfig.addEventListener('click', async () => {
      if (!aiGateway) return;

      const localSettings = {
        apiProtocol: document.getElementById('apiProtocol').value,
        model: document.getElementById('model').value.trim(),
        apiBaseUrl: document.getElementById('apiBaseUrl').value.trim(),
        maxTokens: parseInt(document.getElementById('maxTokens').value),
      };

      gatewayDot.className = 'status-dot syncing';
      gatewayStatusText.textContent = '正在同步...';

      const result = await aiGateway.fetchRemoteConfig(localSettings);

      if (!result.success) {
        gatewayDot.className = 'status-dot error';
        gatewayStatusText.textContent = '同步失败: ' + result.error;
        return;
      }

      if (result.conflict) {
        // 显示冲突
        gatewayDot.className = 'status-dot';
        gatewayStatusText.textContent = '检测到配置冲突';
        showConflict(result.conflict, aiGateway);
        return;
      }

      // 无冲突，直接应用
      const applyResult = await aiGateway.applyRemoteConfig({ skipConflictCheck: true });
      if (applyResult.success && applyResult.settings) {
        applySettingsToUI(applyResult.settings);
        gatewayDot.className = 'status-dot connected';
        gatewayStatusText.textContent = '配置已同步 ✓';
      }
    });
  }

  // 使用远程配置
  const btnUseRemote = document.getElementById('btnUseRemote');
  if (btnUseRemote) {
    btnUseRemote.addEventListener('click', async () => {
      if (!aiGateway) return;
      const result = await aiGateway.forceSyncConfig();
      if (result.success && result.settings) {
        applySettingsToUI(result.settings);
        hideConflict();
        gatewayDot.className = 'status-dot connected';
        gatewayStatusText.textContent = '配置已同步（使用 DocMind 配置）✓';
      }
    });
  }

  // 保留本地配置
  const btnKeepLocal = document.getElementById('btnKeepLocal');
  if (btnKeepLocal) {
    btnKeepLocal.addEventListener('click', async () => {
      if (!aiGateway) return;
      await aiGateway.keepLocalConfig();
      hideConflict();
      gatewayDot.className = 'status-dot connected';
      gatewayStatusText.textContent = '已保留本地配置';
    });
  }

  // 查看可用模型
  const btnShowModels = document.getElementById('btnShowModels');
  if (btnShowModels) {
    btnShowModels.addEventListener('click', async () => {
      if (!aiGateway) return;
      const modelsDiv = document.getElementById('aiGatewayModels');
      const modelsList = document.getElementById('modelsList');

      modelsList.innerHTML = '<em style="color:#9ca3af;">加载中...</em>';
      modelsDiv.style.display = 'block';

      const result = await aiGateway.getAvailableModels();
      if (result.success && result.models.length > 0) {
        modelsList.innerHTML = '';
        const currentModel = document.getElementById('model').value.trim();
        for (const m of result.models) {
          const chip = document.createElement('span');
          chip.className = 'model-chip' + (m.id === currentModel ? ' selected' : '') + (!m.available ? ' unavailable' : '');
          chip.textContent = m.name || m.id;
          chip.title = m.id + (m.family ? ' (' + m.family + ')' : '');
          if (m.available) {
            chip.addEventListener('click', () => {
              document.getElementById('model').value = m.id;
              modelsList.querySelectorAll('.model-chip').forEach(c => c.classList.remove('selected'));
              chip.classList.add('selected');
            });
          }
          modelsList.appendChild(chip);
        }
      } else {
        modelsList.innerHTML = '<em style="color:#9ca3af;">无法获取模型列表: ' + (result.error || '未知错误') + '</em>';
      }
    });
  }

  const btnCloseModels = document.getElementById('btnCloseModels');
  if (btnCloseModels) {
    btnCloseModels.addEventListener('click', () => {
      document.getElementById('aiGatewayModels').style.display = 'none';
    });
  }

  // 查看用量统计
  const btnViewUsage = document.getElementById('btnViewUsage');
  if (btnViewUsage) {
    btnViewUsage.addEventListener('click', async () => {
      if (!aiGateway) return;
      const usageDiv = document.getElementById('aiGatewayUsage');
      const usageStats = document.getElementById('usageStats');

      usageStats.innerHTML = '<em style="color:#9ca3af;">加载中...</em>';
      usageDiv.style.display = 'block';

      const result = await aiGateway.getUsageStats();
      if (result.success && result.usage) {
        const u = result.usage;
        usageStats.innerHTML = [
          usageStatRow('总请求数', u.requestCount.toLocaleString()),
          usageStatRow('总 Token 数', u.totalTokens.toLocaleString()),
          usageStatRow('输入 Token', u.inputTokens.toLocaleString()),
          usageStatRow('输出 Token', u.outputTokens.toLocaleString()),
          usageStatRow('估算费用', '$' + u.totalCostUsd.toFixed(2)),
        ].join('');
      } else {
        usageStats.innerHTML = '<em style="color:#9ca3af;">无法获取用量: ' + (result.error || '未知错误') + '</em>';
      }
    });
  }

  const btnCloseUsage = document.getElementById('btnCloseUsage');
  if (btnCloseUsage) {
    btnCloseUsage.addEventListener('click', () => {
      document.getElementById('aiGatewayUsage').style.display = 'none';
    });
  }

  // --- 书签图谱标签页初始化 ---

  // 创建 BookmarkPanel 实例 (懒初始化: 切换到图谱 Tab 时才 render/init)
  const collector = new BookmarkCollector();
  const indexer = new BookmarkIndexer();
  const graphEngine = new BookmarkGraphEngine();
  const bookmarkPanelEl = document.getElementById('bookmark-panel');
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const visualizer = new BookmarkVisualizer(canvas);
  const detailPanel = new BookmarkDetailPanel();
  const search = new BookmarkSearch(indexer, graphEngine);
  const recommender = new BookmarkRecommender(graphEngine);

  const bookmarkPanel = new BookmarkPanel({
    collector, indexer, graphEngine, visualizer,
    detailPanel, search, recommender,
  });

  // 创建 TabManager
  const tabManager = createTabManager({
    tabNav: document.getElementById('tabNav'),
    settingsPanel: document.getElementById('settings-panel'),
    bookmarkPanel: bookmarkPanelEl,
    panel: bookmarkPanel,
  });

  // 绑定 Tab 按钮事件
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      tabManager.switchTab(tabName);
    });
  });

  // Hash 路由: #tab=bookmark 直接跳转图谱标签页
  if (window.location.hash === '#tab=bookmark') {
    tabManager.switchTab('bookmark');
  }
});

function showTestResult(success, message) {
  const el = document.getElementById('testResult');
  el.classList.remove('hidden', 'success', 'error');
  el.classList.add(success ? 'success' : 'error');
  el.textContent = message;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function applySettingsToUI(settings) {
  if (settings.apiProtocol) document.getElementById('apiProtocol').value = settings.apiProtocol;
  if (settings.apiBaseUrl) document.getElementById('apiBaseUrl').value = settings.apiBaseUrl;
  if (settings.model) document.getElementById('model').value = settings.model;
  if (settings.maxTokens) document.getElementById('maxTokens').value = settings.maxTokens;
}

function showConflict(conflict, gateway) {
  const conflictDiv = document.getElementById('aiGatewayConflict');
  const detailsDiv = document.getElementById('conflictDetails');

  if (!conflict || !conflict.differences) {
    conflictDiv.style.display = 'none';
    return;
  }

  let html = '';
  for (const diff of conflict.differences) {
    html += `<div class="conflict-field">` +
      `<span class="field-name">${diff.field}</span>` +
      `<span class="field-local">本地: ${diff.local}</span>` +
      `<span>→</span>` +
      `<span class="field-remote">DocMind: ${diff.remote}</span>` +
      `</div>`;
  }
  detailsDiv.innerHTML = html;
  conflictDiv.style.display = 'block';
}

function hideConflict() {
  const conflictDiv = document.getElementById('aiGatewayConflict');
  if (conflictDiv) conflictDiv.style.display = 'none';
}

function usageStatRow(label, value) {
  return `<div class="usage-stat-row"><span class="usage-stat-label">${label}</span><span class="usage-stat-value">${value}</span></div>`;
}

export { createTabManager };
