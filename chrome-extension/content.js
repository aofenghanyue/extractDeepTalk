// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'exportPDF') {
    // 使用立即执行异步函数包裹
    (async () => {
      try {
        const result = await handleExport(request.options);
        sendResponse({ success: true, data: result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    // 保持通道开放
    return true;
  }

  // 对于其他未处理的消息类型，不需要保持通道开放
  return false;
});


const DEBUG_CONTAINER = true; // 一键开关，设为false关闭容器调试信息
let temp_a = 0;

async function handleExport(options) {
  try {
    // 使用更可靠的方式获取对话内容
    function findChatContainer() {
      if (DEBUG_CONTAINER) console.groupCollapsed('[DEBUG] 开始查找聊天容器');
      // 1. 获取视口宽度
      const viewportWidth = window.innerWidth;

      // 2. 获取所有可能的容器
      const allDivs = document.getElementsByTagName('div');
      let bestContainer = null;
      let maxScore = 0;

      const debugCandidates = []; // 调试用候选容器数组

      for (const div of allDivs) {
        if (DEBUG_CONTAINER) {
          console.log(temp_a++, div);
        }
        // 获取元素的位置信息
        const rect = div.getBoundingClientRect();
        const debugInfo = { // 调试信息对象
          class: div.className,
          rect: { left: rect.left, width: rect.width, height: rect.height },
          scores: {},
          children: div.children.length
        };


        // // 跳过左侧区域的元素（通常是历史列表）
        // if (rect.left < viewportWidth * 0.3) {
        //   continue;
        // }

        // 跳过太小的容器
        // if (rect.width < viewportWidth * 0.4 || rect.height < 300) {
        //   continue;
        // }

        let score = 0;
        const children = div.children;
        const html = div.innerHTML.toLowerCase();
        const text = div.textContent.toLowerCase();

        // 基础评分标准
        if (children.length >= 2) score += 5;

        // 内容特征评分
        if (html.includes('markdown')) score += 10;
        if (div.getElementsByTagName('pre').length > 0) score += 8;
        if (div.getElementsByTagName('p').length > 0) score += 5;

        // 位置评分
        const horizontalCenter = rect.left + rect.width / 2;
        if (Math.abs(horizontalCenter - viewportWidth / 2) < viewportWidth * 0.2) {
          score += 15; // 靠近页面中心的容器更可能是主要内容
        }

        // 检查是否有交替的用户和AI消息
        let lastWasUser = false;
        let messageCount = 0;
        let hasMarkdown = false;

        for (const child of children) {
          const childHtml = child.innerHTML.toLowerCase();
          const childRect = child.getBoundingClientRect();

          // 跳过太窄的子元素
          if (childRect.width < rect.width * 0.2) {
            continue;
          }

          const isUser = childHtml.includes('user') || childHtml.includes('human');
          const isAI = childHtml.includes('deepseek') || childHtml.includes('assistant');

          if (childHtml.includes('markdown')) {
            hasMarkdown = true;
          }

          if ((isUser && !lastWasUser) || (isAI && lastWasUser)) {
            messageCount++;
            lastWasUser = isUser;
          }
        }

        if (hasMarkdown) score += 10;
        if (messageCount >= 2) score += 20;

        // 额外的内容检查
        const codeBlocks = div.querySelectorAll('pre, code');
        if (codeBlocks.length > 0) {
          score += Math.min(codeBlocks.length * 3, 15); // 最多加15分
        }

        // 检查是否包含典型的聊天界面元素
        if (html.includes('chat') || html.includes('message') || html.includes('conversation')) {
          score += 10;
        }

        // 检查元素的样式特征
        const computedStyle = window.getComputedStyle(div);
        if (computedStyle.overflow === 'auto' || computedStyle.overflow === 'scroll') {
          score += 5; // 可滚动的容器更可能是聊天内容区
        }

        if (DEBUG_CONTAINER) {
          debugInfo.scores = {
            leftRegion: rect.left >= viewportWidth * 0.3 ? '通过' : '跳过',
            minSize: (rect.width >= viewportWidth * 0.4 && rect.height >= 300) ? '通过' : '跳过',
            markdown: html.includes('markdown') ? '+10' : '-',
            preTags: div.getElementsByTagName('pre').length,
            centerScore: Math.abs(horizontalCenter - viewportWidth / 2) < viewportWidth * 0.2 ? '+15' : '-',
            messageCount,
            codeBlocks: codeBlocks.length
          };
          debugCandidates.push(debugInfo);
        }

        // 更新最佳容器
        if (score > maxScore) {
          maxScore = score;
          bestContainer = div;
          console.log('找到更好的容器，分数:', score, div);
        }
      }

      // 日志
      if (DEBUG_CONTAINER) {
        console.table(debugCandidates.sort((a, b) => b.score - a.score).slice(0, 5));
        console.log('最终候选容器:', bestContainer);
        console.groupEnd();
      }

      if (!bestContainer || maxScore < 30) { // 设置一个最低分数阈值
        throw new Error('未找到合适的对话内容容器');
      }


      return bestContainer;
    }

    const chatContainer = findChatContainer();

    // 创建新的容器用于导出
    const exportContainer = document.createElement('div');
    exportContainer.className = 'export-container';
    console.log('聊天容器子元素:', Array.from(chatContainer.children).map(el => ({
      className: el.className,
      text: el.textContent.trim().substring(0, 50),
      width: el.offsetWidth,
      children: el.children.length
    })));
    // 获取所有对话消息
    const messages_container = Array.from(chatContainer.children).filter(el => {
      // 获取元素的位置信息
      const rect = el.getBoundingClientRect();

      // 过滤条件
      const isInput = el.querySelector('textarea, input, button');
      const isEmpty = el.textContent.trim() === '';
      const hasContent = el.textContent.length > 10;
      const isWideEnough = rect.width > chatContainer.getBoundingClientRect().width * 0.25;
      // 输出每个el及判定结果
      console.log('el', el, {
        isInput,
        isEmpty,
        hasContent,
        isWideEnough
      });
      return !isInput && !isEmpty && hasContent && isWideEnough;
    });
    if (DEBUG_CONTAINER) {
      console.log('messages_container', messages_container);
    }
    const messages = Array.from(messages_container[0].children).filter(child => {
      const rect = child.getBoundingClientRect();
      if (DEBUG_CONTAINER) {

        const debugInfo = {
          className: child.className,

          text: child.textContent.slice(0, 30),
          widthRatio: (rect.width / messages_container[0].offsetWidth).toFixed(2),
          height: rect.height


        };
        console.log('消息子元素分析:', debugInfo);
      }
      return (
        rect.height > 50 && // 最小高度限制
        rect.width > messages_container[0].offsetWidth * 0.6 && // 宽度占容器60%以上
        child.textContent.trim().length > 20 // 更严格的文本长度
      );



    });

    // 输出messages
    console.log('messages', messages);
    // 添加详细的元素分析
    console.log('解析到的消息元素:', messages.map(el => ({
      className: el.className,
      children: el.children.length,
      textSnippet: el.textContent.slice(0, 50).replace(/\n/g, ' '),
      width: el.offsetWidth,
      height: el.offsetHeight
    })));

    messages.forEach((message) => {
      const messageClone = message.cloneNode(true);


      // 通过内容和特征判断消息类型
      const isUser = (() => {
        const text = messageClone.textContent.toLowerCase();
        const html = messageClone.innerHTML.toLowerCase();
        return html.includes('textarea') ||
          html.includes('input') ||
          html.includes('user') ||
          html.includes('human') ||
          messageClone.querySelector('textarea, input') !== null;
      })();

      // 创建新的消息容器
      const newMessage = document.createElement('div');
      newMessage.className = isUser ? 'message user-message' : 'message assistant-message';

      // 添加角色标识
      const roleLabel = document.createElement('div');
      roleLabel.className = 'role-label';
      roleLabel.textContent = isUser ? '用户' : 'DeepSeek';
      newMessage.appendChild(roleLabel);

      let prevSibling = null;
      // 新增思考过程检测逻辑
      const isThinking = (() => {
        // 1. 查找当前消息中的.ds-markdown元素
        const markdownElement = messageClone.querySelector('.ds-markdown');
        if (!markdownElement) return false;

        // 2. 获取最近的具有class的父容器
        const parentContainer = markdownElement.closest('[class]');
        if (!parentContainer) return false;

        // 3. 获取所有兄弟元素并定位当前元素位置
        const siblings = Array.from(parentContainer.parentElement.children);
        const markdownIndex = siblings.findIndex(el => el.contains(markdownElement));

        // 4. 检查前一个兄弟元素是否包含思考内容

        if (markdownIndex > 0) {
          prevSibling = siblings[markdownIndex - 1];
          // 使用更精确的正则匹配
          const hasThinking = /已深度思考（用时\s+\d+\s+秒）/.test(prevSibling.textContent);

          console.log('思考过程检测详情：', {
            parentClass: parentContainer.className,
            prevSiblingHTML: prevSibling.outerHTML.substring(0, 100), // 用于验证结构
            hasThinking
          });

          return hasThinking;
        }
        return false;
      })();
      console.log('思考过程检测结果：', {
        isThinking,
        text: messageClone.textContent.substring(0, 50)
      });
      // 处理思考过程
      if (isThinking) {
        console.log('处理思考过程消息：', prevSibling);
        if (!options.includeThinking) {
          console.log('跳过思考过程消息（用户未选择导出）');
          return; // 跳过当前消息

        }
        // 添加思考过程特殊样式
        if (prevSibling) {
          const contentDiv = prevSibling.querySelector(':scope > div:nth-child(2)');


          // if (contentDiv) {
          //   contentDiv.style.cssText = `
          //   font-style: italic !important;
          //   color: #666 !important;
          //   border-left: 3px solid #ddd !important;
          //   padding: 10px !important;
          //   margin: 10px 0 !important;
          // `;
          // }
          if (DEBUG_CONTAINER) {
            console.log('contentDiv', contentDiv);
          }
        }
      }


      // 提取消息内容
      const content = (() => {
        // 移除所有输入框、按钮等交互元素，但保留文本内容
        messageClone.querySelectorAll('textarea, input').forEach(el => {
          // 如果是文本输入框，保留其值作为文本内容
          if (el.value && el.value.trim()) {
            const textNode = document.createTextNode(el.value);
            el.parentNode.replaceChild(textNode, el);
          } else {
            el.remove();
          }
        });

        // 移除按钮
        messageClone.querySelectorAll('button').forEach(el => el.remove());


        // 创建内容包装器
        const wrapper = document.createElement('div');
        wrapper.className = 'content-wrapper';

        if (DEBUG_CONTAINER) {
          console.log('messageClone', messageClone);
        }
        // 查找主要内容容器
        const mainContent = messageClone.querySelector('[class*="markdown"], [class*="content"], [class*="text"]');
        if (DEBUG_CONTAINER) {
          console.log('mainContent', mainContent);
        }

        if (mainContent) {
          // 如果找到主要内容容器，直接使用它
          const clone = mainContent.cloneNode(true);


          clone.querySelectorAll('.katex-html').forEach(el => el.remove());

          // 保留MathML公式层（katex-mathml）
          clone.querySelectorAll('.katex-mathml').forEach(mathml => {
            // 确保MathML可见
            mathml.removeAttribute('aria-hidden');
          });

          // // 处理内部的思考过程元素
          // if (!options.includeThinking) {
          //   clone.querySelectorAll(thinkingSelectors).forEach(el => el.remove());
          // } else {
          //   clone.querySelectorAll(thinkingSelectors).forEach(el => {
          //     el.style.color = '#666';
          //     el.style.fontStyle = 'italic';
          //     el.style.margin = '10px 0';
          //     el.style.padding = '10px';
          //     el.style.borderLeft = '3px solid #ddd';
          //     el.style.background = '#f8f9fa';
          //   });
          // }

          wrapper.appendChild(clone);
        } else {
          // 如果没有找到主要内容容器，则尝试提取用户输入或其他内容
          let userContent = null;

          // 1. 尝试从文本区域或输入框获取
          const inputElement = messageClone.querySelector('textarea, input[type="text"]');
          if (inputElement && inputElement.value) {
            userContent = document.createElement('p');
            userContent.textContent = inputElement.value;
          }

          // 2. 尝试从显示文本的元素获取
          if (!userContent) {
            const textElements = messageClone.querySelectorAll('p, div, span');
            for (const el of textElements) {
              if (el.textContent.trim() && !el.querySelector('textarea, input, button')) {
                userContent = el.cloneNode(true);
                break;
              }
            }
          }

          // 3. 如果还是没找到，使用所有文本内容
          if (!userContent && messageClone.textContent.trim()) {
            userContent = document.createElement('p');
            userContent.textContent = messageClone.textContent.trim();
          }

          if (userContent) {
            wrapper.appendChild(userContent);
          }
        }
        if (DEBUG_CONTAINER) {
          console.log('wrapper', wrapper);
        }
        return wrapper;

      })();

      if (content) {
        // 处理代码块
        if (!options.includeCode) {

          content.querySelectorAll('pre, code, [class*="code"]').forEach(el => el.remove());
        } else {
          content.querySelectorAll('pre, code, [class*="code"]').forEach(el => {
            // 移除语言标签和复制按钮的多余边框
            if (el.classList.contains('md-code-block-banner-wrap') ||
              el.classList.contains('md-code-block-action')) {
              el.remove(); // 直接移除操作栏
              return;
            }

            // 仅保留代码区域的样式
            if (el.tagName === 'PRE') {
              el.style.cssText = `
                background: #f6f8fa !important;
                padding: 12px !important;
                border-radius: 6px !important;
                margin: 8px 0 !important;
                border: 1px solid #e1e4e8 !important;
                font-family: Consolas, Monaco, "Courier New", monospace !important;
                font-size: 14px !important;
                overflow-x: auto !important;
              `;
            }
            
          });
        }

        // 处理图片
        if (!options.includeImages) {
          content.querySelectorAll('img, [class*="image"]').forEach(el => el.remove());
        } else {
          content.querySelectorAll('img, [class*="image"]').forEach(el => {
            el.style.maxWidth = '100%';
            el.style.height = 'auto';
            el.style.margin = '10px 0';
            el.style.display = 'block';
          });
        }

        // 确保段落和其他块级元素有适当的间距
        content.querySelectorAll('p, div, pre, ul, ol').forEach(el => {
          if (el.style.margin === '') {
            el.style.margin = '8px 0';
          }
        });
        if (DEBUG_CONTAINER) {
          console.log('content2', content);
        }

        if (isThinking && prevSibling) {
          // 直接克隆整个思考容器
          const thinkingClone = prevSibling.cloneNode(true).querySelector(':scope > div:nth-child(2)');
          // thinkingClone前面添加一个div，内容为“深度思考内容”，且样式为加粗斜体
          const thinkingClone2 = document.createElement('div');
          thinkingClone2.textContent = '深度思考内容';
          thinkingClone2.style.cssText = `
            font-weight: bold;
            font-style: italic;
            margin-bottom: 10px;
            margin-top: 10px;
          `;
          thinkingClone.insertBefore(thinkingClone2, thinkingClone.firstChild);
          // 添加思考过程标识
          thinkingClone.classList.add('thinking-process');


          // 将思考内容插入到消息容器开头
          newMessage.insertBefore(thinkingClone, newMessage.firstChild);

          // 统一应用样式
          thinkingClone.style.cssText = `
            font-style: italic;
            color: #666;
            border-left: 3px solid #ddd;
            padding: 10px;
            margin: 10px 0;
          `;
        }

        newMessage.appendChild(content);
      }


      exportContainer.appendChild(newMessage);
    });

    // 更新样式以支持新的内容结构
    const style = document.createElement('style');
    style.textContent = `
      .export-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #24292e;
      }
      .message {
        margin: 20px 0;
        padding: 20px;
        border-radius: 8px;
        line-height: 1.6;
        position: relative;
      }
      .role-label {
        font-weight: bold;
        margin-bottom: 10px;
        color: #666;
        font-size: 14px;
      }
      .user-message {
        background: #f8f9fa;
        margin-left: 40px;
        border-left: 4px solid #0366d6;
      }
      .assistant-message {
        background: #fff;
        margin-right: 40px;
        border-left: 4px solid #28a745;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .content-wrapper {
        font-size: 15px;
      }
      .content-wrapper > * {
        margin: 6px 0;
      }
      .content-wrapper p {
        line-height: 1.6;
      }
      .content-wrapper [class*="process"],
      .content-wrapper [class*="thought"],
      .content-wrapper [class*="step"] {
        color: #666;
        font-style: italic;
        margin: 10px 0;
        padding: 10px;
        border-left: 3px solid #ddd;
        background: #f8f9fa;
      }
      .md-code-block {
        border: none !important; /* 移除外层边框 */
        padding: 0 !important;
      }
      .md-code-block pre {
        border: 1px solid #e1e4e8 !important; /* 仅保留代码区域边框 */
      }
      pre {
        margin: 8px 0;
        overflow-x: auto;
        line-height: 1.4 !important;
      }
      code {
        font-size: 14px;
        margin: 0 3px !important;
        padding: 2 4px !important;
      }
      img {
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      @media print {
        body {
          background: white;
        }
        .export-container {
          margin: 0;
          padding: 0;
        }
        .message {
          break-inside: auto;
          page-break-inside: auto;
          margin: 10px 0;
          padding: 15px;
        }
        .user-message, .assistant-message {
          box-shadow: none;
          border-left-width: 2px;
          margin: 10px 20px;
        }
        pre, code {
          white-space: pre-wrap;
          word-wrap: break-word;
          border: 1px solid #ddd;
          break-inside: auto;
          page-break-inside: auto;
        }
        img {
          max-height: 90vh;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .content-wrapper [class*="process"],
        .content-wrapper [class*="thought"],
        .content-wrapper [class*="step"] {
          border-left-color: #999;
          background: none;
          break-inside: auto;
          page-break-inside: auto;
        }
        /* 防止在不适当的地方分页 */
        h1, h2, h3, h4, h5, h6 {
          break-after: avoid;
          page-break-after: avoid;
        }
        /* 确保代码块不会在不适当的地方分页 */
        pre {
          break-inside: auto;
          page-break-inside: auto;
          margin: 10px 0;
        }
      }
    `;

    // 创建导出文档
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>DeepSeek对话导出</title>
          ${style.outerHTML}
        </head>
        <body>
          ${exportContainer.outerHTML}
          <script>
            // 处理代码块的语法高亮
            document.querySelectorAll('pre code').forEach(block => {
              block.style.display = 'block';
              block.style.overflow = 'auto';
            });
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();

    // 等待图片加载完成
    if (options.includeImages) {
      await new Promise(resolve => {
        const images = printWindow.document.getElementsByTagName('img');
        let loadedImages = 0;
        const totalImages = images.length;

        if (totalImages === 0) {
          resolve();
        } else {
          for (const img of images) {
            if (img.complete) {
              loadedImages++;
              if (loadedImages === totalImages) resolve();
            } else {
              img.onload = () => {
                loadedImages++;
                if (loadedImages === totalImages) resolve();
              };
              img.onerror = () => {
                loadedImages++;
                if (loadedImages === totalImages) resolve();
              };
            }
          }
        }
      });
    }

    // 触发打印
    printWindow.print();

    return { success: true };
  } catch (error) {
    console.error('导出错误:', error);
    return { success: false, error: error.message };
  }
} 
