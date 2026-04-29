/**
 * Background Service Worker
 * 处理扩展的后台逻辑：右键菜单、消息路由、Side Panel 管理
 */

import { logInfo, logError, logWarn } from '../lib/log-store.js';

// ==================== 初始化 ====================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'askAI',
    title: '用 智阅 提问',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'summarizePage',
    title: '用 AI 总结此页面',
    contexts: ['page']
  });

  logInfo('service-worker', '扩展已安装/更新');
});

// ==================== 右键菜单 ====================

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const action = info.menuItemId === 'askAI' ? 'contextMenuAsk' : 'contextMenuSummarize';
  const selection = info.selectionText || '';
  
  logInfo('context-menu', `右键菜单触发: ${action}`, { 
    selection: selection.slice(0, 100), 
    tabId: tab.id, 
    url: tab.url 
  });

  const data = {
    action,
    selection,
    tabId: tab.id,
    tabUrl: tab.url,
    tabTitle: tab.title,
    timestamp: Date.now()
  };

  try {
    // 方式1：写入 session storage
    await chrome.storage.session.set({ pendingAction: data });
    logInfo('context-menu', 'pendingAction 已写入 session storage');
  } catch (e) {
    logError('context-menu', '写入 session storage 失败', { error: e.message });
  }

  try {
    // 打开侧边栏
    await chrome.sidePanel.open({ tabId: tab.id });
    logInfo('context-menu', '侧边栏已打开');
  } catch (e) {
    logError('context-menu', '打开侧边栏失败', { error: e.message });
  }

  // 方式2：带重试的消息发送
  sendMessageWithRetry(data, 8, 300);
});

/**
 * 带重试 + 日志的消息发送
 */
function sendMessageWithRetry(data, maxRetries, interval) {
  let attempts = 0;
  const timer = setInterval(async () => {
    attempts++;
    try {
      await chrome.runtime.sendMessage(data);
      logInfo('context-menu', `消息发送成功 (第 ${attempts} 次)`);
      clearInterval(timer);
    } catch (e) {
      const msg = e.message || '';
      if (attempts >= maxRetries) {
        logError('context-menu', `消息发送失败，已重试 ${maxRetries} 次`, { 
          error: msg,
          action: data.action,
          selection: data.selection?.slice(0, 50)
        });
        clearInterval(timer);
      } else {
        logWarn('context-menu', `消息发送失败 (第 ${attempts}/${maxRetries} 次)，${interval}ms 后重试`, { error: msg });
      }
    }
  }, interval);
}

// ==================== Side Panel 配置 ====================

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ==================== 快捷键 ====================

const openSidePanels = new Set();

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  logInfo('shortcut', `快捷键触发: ${command}`, { tabId: tab.id });

  switch (command) {
    case 'summarize-page': {
      await chrome.sidePanel.open({ tabId: tab.id });
      openSidePanels.add(tab.id);
      const data = {
        action: 'shortcutSummarize',
        tabId: tab.id,
        tabUrl: tab.url,
        tabTitle: tab.title,
        timestamp: Date.now()
      };
      sendMessageWithRetry(data, 5, 400);
      break;
    }

    case 'toggle-sidebar': {
      if (openSidePanels.has(tab.id)) {
        try {
          await chrome.sidePanel.close({ tabId: tab.id });
        } catch (e) {}
        openSidePanels.delete(tab.id);
      } else {
        await chrome.sidePanel.open({ tabId: tab.id });
        openSidePanels.add(tab.id);
      }
      break;
    }
  }
});

// ==================== 消息路由 ====================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'extractFromTab':
      chrome.tabs.sendMessage(request.tabId, { action: 'extractContent' })
        .then(sendResponse)
        .catch(err => {
          logError('message-router', 'extractFromTab 失败', { tabId: request.tabId, error: err.message });
          sendResponse({ error: err.message });
        });
      return true;

    case 'getCurrentTab':
      chrome.tabs.query({ active: true, currentWindow: true })
        .then(([tab]) => sendResponse(tab))
        .catch(err => {
          logError('message-router', 'getCurrentTab 失败', { error: err.message });
          sendResponse({ error: err.message });
        });
      return true;

    case 'collectAllTabs':
      chrome.tabs.query({})
        .then(tabs => {
          const tabInfos = tabs.map(t => ({
            id: t.id,
            title: t.title || '未知页面',
            url: t.url || '',
            favIconUrl: t.favIconUrl || ''
          }));
          sendResponse(tabInfos);
        })
        .catch(err => {
          logError('message-router', 'collectAllTabs 失败', { error: err.message });
          sendResponse({ error: err.message });
        });
      return true;

    case 'collectTabContent': {
      const tabIds = request.tabIds || [];
      if (tabIds.length === 0) {
        sendResponse([]);
        return false;
      }
      const limitedIds = tabIds.slice(0, 5);
      const promises = limitedIds.map(async (tabId) => {
        try {
          const response = await chrome.tabs.sendMessage(tabId, { action: 'extractContent' });
          if (response && response.content) {
            return {
              tabId,
              title: response.title || '未知页面',
              url: response.url || '',
              content: (response.content || '').slice(0, 3000),
              codeBlocks: response.codeBlocks || []
            };
          }
          return { tabId, error: '页面内容为空' };
        } catch (err) {
          const msg = err.message || '';
          if (msg.includes('Cannot access') || msg.includes('Receiving end does not exist')) {
            return { tabId, error: '无法访问该页面（可能是 chrome:// 等受限页面）' };
          }
          return { tabId, error: msg || '提取失败' };
        }
      });
      Promise.all(promises).then(results => sendResponse(results));
      return true;
    }

    case 'openSettings':
      chrome.runtime.openOptionsPage();
      break;
  }
});
