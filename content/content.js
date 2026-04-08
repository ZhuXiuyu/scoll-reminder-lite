// Scroll Reminder - Content Script
// 检测 scroll 行为并触发干预

(function() {
  'use strict';

  // 防止重复注入
  if (window.scrollReminderInjected) return;
  window.scrollReminderInjected = true;

  // 状态
  let isMonitoring = false;
  let lastScrollTime = 0;
  let scrollThrottleTimer = null;

  // 初始化
  async function init() {
    console.log('[Scroll Reminder] Content script initialized on', location.hostname);

    try {
      // 检查是否应该监测当前网站
      const response = await sendMessage({ type: 'CHECK_MONITORING' });
      console.log('[Scroll Reminder] CHECK_MONITORING response:', response);

      if (!response || !response.shouldMonitor) {
        console.log('[Scroll Reminder] Not monitoring this site');
        return;
      }

      isMonitoring = true;
      setupEventListeners();
      console.log('[Scroll Reminder] Monitoring started for', location.hostname);
    } catch (error) {
      console.error('[Scroll Reminder] Init error:', error);
    }
  }

  // 设置事件监听
  function setupEventListeners() {
    // 鼠标滚轮
    window.addEventListener('wheel', handleScroll, { passive: true });

    // 触摸滑动
    window.addEventListener('touchmove', handleScroll, { passive: true });

    // 键盘翻页
    window.addEventListener('keydown', handleKeyDown, { passive: true });

    // 滚动条拖拽检测（通过 mousedown 在滚动条区域）
    window.addEventListener('mousedown', handleMouseDown, { passive: true });

    // 监听来自 background 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'PING') {
        sendResponse({ pong: true });
      }
    });
  }

  // 处理 scroll 事件
  function handleScroll(event) {
    if (!isMonitoring) return;

    // 节流：同一时间点的大量 scroll 事件只算一次
    const now = Date.now();
    if (now - lastScrollTime < 100) return;
    lastScrollTime = now;

    // 清除之前的定时器
    if (scrollThrottleTimer) {
      clearTimeout(scrollThrottleTimer);
    }

    // 延迟发送，避免过于频繁的通信
    scrollThrottleTimer = setTimeout(() => {
      recordScroll();
    }, 50);
  }

  // 处理键盘事件
  function handleKeyDown(event) {
    if (!isMonitoring) return;

    // PageDown, PageUp, Space, Arrow keys
    if (['PageDown', 'PageUp', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      recordScroll();
    }
  }

  // 处理鼠标按下（检测滚动条拖拽）
  function handleMouseDown(event) {
    if (!isMonitoring) return;

    // 检测是否点击在滚动条区域
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const scrollbarWidth = 20; // 估计的滚动条宽度

    // 垂直滚动条区域
    const isVerticalScrollbar = event.clientX > windowWidth - scrollbarWidth;
    // 水平滚动条区域
    const isHorizontalScrollbar = event.clientY > windowHeight - scrollbarWidth;

    if (isVerticalScrollbar || isHorizontalScrollbar) {
      // 监听 mouseup 来确认是一次完整的拖拽
      const handleMouseUp = () => {
        recordScroll();
        document.removeEventListener('mouseup', handleMouseUp);
      };
      document.addEventListener('mouseup', handleMouseUp);
    }
  }

  // 记录 scroll 并检查是否触发干预
  async function recordScroll() {
    try {
      const response = await sendMessage({ type: 'RECORD_SCROLL' });

      if (response && response.triggered) {
        handleIntervention(response.level);
      }
    } catch (error) {
      console.error('[Scroll Reminder] Error recording scroll:', error);
    }
  }

  // 处理干预
  function handleIntervention(level) {
    switch (level) {
      case 1:
        showGlowEffect();
        break;
      case 2:
        showDimEffect();
        break;
      case 3:
        showModal();
        break;
      default:
        if (level > 3) {
          // 超过3次继续强制弹窗
          showModal();
        }
    }
  }

  // 阶段1：边缘光晕
  function showGlowEffect() {
    // 移除已有的光晕
    removeExistingElement('.scroll-reminder-glow');

    const glow = document.createElement('div');
    glow.className = 'scroll-reminder-glow';
    document.body.appendChild(glow);

    // 3秒后自动移除
    setTimeout(() => {
      glow.remove();
    }, 3000);
  }

  // 阶段2：页面变暗 + 浮动提示
  function showDimEffect() {
    // 移除已有的变暗效果
    removeExistingElement('.scroll-reminder-dim');
    removeExistingElement('.scroll-reminder-toast');

    const dim = document.createElement('div');
    dim.className = 'scroll-reminder-dim';
    document.body.appendChild(dim);

    const toast = document.createElement('div');
    toast.className = 'scroll-reminder-toast';
    toast.innerHTML = `
      <div class="scroll-reminder-toast-icon">⚠️</div>
      <div>短时间内已 scroll 多次</div>
    `;
    document.body.appendChild(toast);

    // 3秒后自动移除
    setTimeout(() => {
      dim.remove();
      toast.remove();
    }, 3000);
  }

  // 阶段3：强制弹窗
  function showModal() {
    // 如果已经有弹窗，不再显示
    if (document.querySelector('.scroll-reminder-overlay')) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'scroll-reminder-overlay';
    overlay.innerHTML = `
      <div class="scroll-reminder-modal">
        <div class="scroll-reminder-modal-icon">🛑</div>
        <div class="scroll-reminder-modal-title">注意</div>
        <div class="scroll-reminder-modal-message">
          短时间内已经 scroll 多次，是否继续浏览？
        </div>
        <div class="scroll-reminder-modal-buttons">
          <button class="scroll-reminder-btn scroll-reminder-btn-primary" id="sr-btn-leave">
            离开此页
          </button>
          <button class="scroll-reminder-btn scroll-reminder-btn-secondary" id="sr-btn-continue">
            继续浏览
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // 绑定按钮事件
    overlay.querySelector('#sr-btn-leave').addEventListener('click', handleLeave);
    overlay.querySelector('#sr-btn-continue').addEventListener('click', handleContinue);

    // 阻止点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        e.stopPropagation();
      }
    });
  }

  // 处理"离开此页"
  async function handleLeave() {
    try {
      await sendMessage({ type: 'LEAVE_PAGE' });
      // 关闭当前标签页
      window.close();
    } catch (error) {
      console.error('[Scroll Reminder] Error leaving page:', error);
      // 如果无法关闭，至少移除弹窗
      removeModal();
    }
  }

  // 处理"继续浏览"
  async function handleContinue() {
    try {
      await sendMessage({ type: 'CONTINUE_BROWSING' });
      removeModal();
    } catch (error) {
      console.error('[Scroll Reminder] Error continuing:', error);
      removeModal();
    }
  }

  // 移除弹窗
  function removeModal() {
    const overlay = document.querySelector('.scroll-reminder-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  // 移除已有元素
  function removeExistingElement(selector) {
    const existing = document.querySelector(selector);
    if (existing) {
      existing.remove();
    }
  }

  // 发送消息到 background
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 启动
  init();
})();
