document.addEventListener('DOMContentLoaded', function() {
  const exportBtn = document.getElementById('exportBtn');
  const includeCode = document.getElementById('includeCode');
  const includeImages = document.getElementById('includeImages');
  const includeThinking = document.getElementById('includeThinking');
  const status = document.getElementById('status');

  async function injectContentScript(tab) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (error) {
      console.error('注入content script失败:', error);
    }
  }

  async function sendMessageWithRetry(tab, message, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        // 尝试发送消息
        const response = await chrome.tabs.sendMessage(tab.id, message);
        return response;
      } catch (error) {
        console.log(`第 ${i + 1} 次尝试失败:`, error);
        
        if (i === maxRetries - 1) {
          throw error; // 最后一次尝试失败
        }
        
        // 重新注入content script
        await injectContentScript(tab);
        
        // 等待一小段时间再重试
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  exportBtn.addEventListener('click', async () => {
    try {
      exportBtn.disabled = true;
      status.textContent = '正在导出...';

      // 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('chat.deepseek.com')) {
        throw new Error('请在DeepSeek Chat页面使用此插件');
      }

      // 发送消息到content script（带重试机制）
      const response = await sendMessageWithRetry(tab, {
        action: 'exportPDF',
        options: {
          includeCode: includeCode.checked,
          includeImages: includeImages.checked,
          includeThinking: includeThinking.checked
        }
      });

      if (response.success) {
        status.textContent = '导出成功！';
      } else {
        throw new Error(response.error || '导出失败');
      }
    } catch (error) {
      status.textContent = `错误：${error.message}`;
      console.error('导出错误:', error);
    } finally {
      exportBtn.disabled = false;
    }
  });
}); 