/**
 * Popup - 扩展弹窗逻辑
 */

document.addEventListener('DOMContentLoaded', async () => {
  const btnOpenSidebar = document.getElementById('btnOpenSidebar');
  const btnQuickSummary = document.getElementById('btnQuickSummary');
  const btnKnowledge = document.getElementById('btnKnowledge');
  const btnSettings = document.getElementById('btnSettings');
  const statsInfo = document.getElementById('statsInfo');

  // 打开侧边栏
  btnOpenSidebar.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  });

  // 快速总结
  btnQuickSummary.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ tabId: tab.id });
    // 发送总结指令
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'contextMenuSummarize', tabId: tab.id }).catch(() => {});
    }, 300);
    window.close();
  });

  // 打开知识库
  btnKnowledge.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ tabId: tab.id });
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'switchToKnowledge' }).catch(() => {});
    }, 300);
    window.close();
  });

  // 打开设置
  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // 加载统计信息
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStats' });
    if (response?.totalEntries !== undefined) {
      statsInfo.textContent = `${response.totalEntries} 条知识 · ${response.totalTags} 个标签`;
    }
  } catch (e) {
    statsInfo.textContent = '';
  }
});
