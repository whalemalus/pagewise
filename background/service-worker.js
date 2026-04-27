/**
 * Background Service Worker
 * 处理扩展的后台逻辑：右键菜单、消息路由、Side Panel 管理
 */

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
});

// ==================== 右键菜单 ====================

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const action = info.menuItemId === 'askAI' ? 'contextMenuAsk' : 'contextMenuSummarize';
  const data = {
    action,
    selection: info.selectionText || '',
    tabId: tab.id,
    tabUrl: tab.url,
    tabTitle: tab.title
  };

  // 方式1：写入 session storage（侧边栏初始化时会读取）
  await chrome.storage.session.set({ pendingAction: data });

  // 打开侧边栏
  await chrome.sidePanel.open({ tabId: tab.id });

  // 方式2：带重试的消息发送（侧边栏已打开时兜底）
  sendMessageWithRetry(data, 5, 400);
});

/**
 * 带重试的消息发送
 * 侧边栏可能还没加载完 listener，需要重试几次
 */
function sendMessageWithRetry(data, maxRetries, interval) {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    chrome.runtime.sendMessage(data).catch(() => {});
    if (attempts >= maxRetries) clearInterval(timer);
  }, interval);
}

// ==================== Side Panel 配置 ====================

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ==================== 快捷键 ====================

/**
 * 跟踪侧边栏开关状态（按 tabId）
 * @type {Set<number>}
 */
const openSidePanels = new Set();

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  switch (command) {
    case 'summarize-page': {
      // 打开侧边栏并发送总结指令
      await chrome.sidePanel.open({ tabId: tab.id });
      openSidePanels.add(tab.id);
      const data = {
        action: 'shortcutSummarize',
        tabId: tab.id,
        tabUrl: tab.url,
        tabTitle: tab.title
      };
      sendMessageWithRetry(data, 5, 400);
      break;
    }

    case 'toggle-sidebar': {
      if (openSidePanels.has(tab.id)) {
        try {
          await chrome.sidePanel.close({ tabId: tab.id });
        } catch (e) {
          // close 可能不可用，静默处理
        }
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
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'getCurrentTab':
      chrome.tabs.query({ active: true, currentWindow: true })
        .then(([tab]) => sendResponse(tab))
        .catch(err => sendResponse({ error: err.message }));
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
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'collectTabContent': {
      const tabIds = request.tabIds || [];
      if (tabIds.length === 0) {
        sendResponse([]);
        return false;
      }
      // 最多同时分析 5 个标签页
      const limitedIds = tabIds.slice(0, 5);
      const promises = limitedIds.map(async (tabId) => {
        try {
          const response = await chrome.tabs.sendMessage(tabId, { action: 'extractContent' });
          if (response && response.content) {
            // 截取前 3000 字符，避免 token 超限
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
