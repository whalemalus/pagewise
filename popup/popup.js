/**
 * Popup - 扩展弹窗逻辑
 */

/**
 * 递归计算书签数量
 * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes - 书签树节点
 * @returns {number} 书签总数
 */
function countBookmarks(nodes) {
  let count = 0;
  for (const node of nodes) {
    if (node.url) count++;
    if (node.children) count += countBookmarks(node.children);
  }
  return count;
}

document.addEventListener('DOMContentLoaded', async () => {
  const btnOpenSidebar = document.getElementById('btnOpenSidebar');
  const btnQuickSummary = document.getElementById('btnQuickSummary');
  const btnKnowledge = document.getElementById('btnKnowledge');
  const btnSettings = document.getElementById('btnSettings');
  const btnBookmarks = document.getElementById('btnBookmarks');
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

  // 书签图谱
  btnBookmarks.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    // 延迟后跳转到书签标签页
    setTimeout(() => {
      chrome.tabs.query({ url: chrome.runtime.getURL('options/options.html') }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.update(tabs[0].id, { url: chrome.runtime.getURL('options/options.html#tab=bookmark') });
        }
      });
    }, 100);
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

  // 加载书签统计
  try {
    const bookmarks = await chrome.bookmarks.getTree();
    const count = countBookmarks(bookmarks);
    if (count > 0) {
      const current = statsInfo.textContent;
      statsInfo.textContent = current ? `${current} · ${count} 个书签` : `${count} 个书签`;
    }
  } catch (e) {
    // 忽略错误
  }
});
