/**
 * Background Service Worker
 * 处理扩展的后台逻辑：右键菜单、消息路由、Side Panel 管理
 */

// ==================== 初始化 ====================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'askAI',
    title: '用 AI 知识助手提问',
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

    case 'openSettings':
      chrome.runtime.openOptionsPage();
      break;
  }
});
