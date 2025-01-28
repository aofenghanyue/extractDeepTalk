// 监听插件安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('DeepSeek Chat Exporter 已安装');
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('chat.deepseek.com')) {
    // 当页面加载完成时，注入content script
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(error => {
      console.error('注入content script失败:', error);
    });
  }
});

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkContentScript') {
    sendResponse({ status: 'ok' });
  }
  return true;
});

// 设置插件图标点击行为
chrome.action.onClicked.addListener((tab) => {
  // 检查是否在DeepSeek网站上
  if (tab.url.startsWith('https://chat.deepseek.com/')) {
    console.log('在DeepSeek页面上');
  }
}); 