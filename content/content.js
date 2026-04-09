// Scroll Reminder Lite - Content Script
// 核心功能：路由判定、防抖计数、时间衰减、三级干预

(function() {
  'use strict';

  // 防止重复注入
  if (window.scrollReminderLiteInjected) return;
  window.scrollReminderLiteInjected = true;

  // ===== 配置 =====
  const CONFIG = {
    DEBOUNCE_MS: 400,           // 防抖时间
    DECAY_INTERVAL_S: 60,       // 衰减间隔（秒）
    LEVEL1_THRESHOLD: 3,        // 呼吸警戒线
    LEVEL2_THRESHOLD: 6,        // 灵魂拷问
    LEVEL3_THRESHOLD: 9,        // 强制隔离
    LEVEL1_COOLDOWN_S: 5,       // Level 1 冷却
    LEVEL2_COOLDOWN_S: 10,      // Level 2 冷却
    INITIAL_GRACE_PERIOD_MS: 3000, // 初始冷却期（3秒）
  };

  // 默认站点路由规则
  const SITE_RULES = {
    'zhihu.com': {
      type: 'whitelist',
      allow: [/^\/search/, /^\/people\//, /^\/collection\//, /^\/education/, /^\/consult/]
    },
    'bilibili.com': {
      type: 'whitelist',
      allow: [/^\/video\//, /^\/search/, /^\/fav/],
      hostnameAllow: ['space.bilibili.com']
    },
    'xiaohongshu.com': {
      type: 'whitelist',
      allow: [/^\/user\/profile/, /^\/search\//]
    },
    'weibo.com': {
      type: 'whitelist',
      allow: [/^\/u\//, /^\/search/]
    },
    'douyin.com': {
      type: 'global'
    },
    'tiktok.com': {
      type: 'global'
    },
    'youtube.com': {
      type: 'blacklist',
      block: [/^\/shorts/]
    }
  };

  // ===== 状态 =====
  let state = {
    enabled: true,
    count: 0,
    lastScrollTime: 0,
    debounceTimer: null,
    decayTimer: null,
    isSuspended: false,
    suspendEndTime: 0,
    currentLevel: 0,
    levelCooldownEnd: 0,
    initTime: Date.now(),  // 页面初始化时间
    listenersAdded: false  // 事件监听器是否已添加
  };

  // ===== 初始化 =====
  async function init() {
    // 始终注册消息监听，以便响应配置变更
    setupMessageListener();

    // 检查是否应该监控当前页面
    const shouldMonitor = await checkShouldMonitor();
    if (!shouldMonitor) {
      console.log('[Scroll Reminder] Not monitoring this page');
      return;
    }

    console.log('[Scroll Reminder] Monitoring started for', location.hostname);
    startMonitoring();
  }

  // 开始监控
  function startMonitoring() {
    setupEventListeners();
    startDecayTimer();
  }

  // ===== 消息监听 =====
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'enabledChanged') {
        handleEnabledChange(message.enabled);
      } else if (message.type === 'sitesChanged' || message.type === 'customSitesChanged') {
        handleSitesChange();
      }
    });
  }

  // 处理插件启用状态变更
  async function handleEnabledChange(enabled) {
    if (!enabled) {
      // 禁用：清理所有干预和状态
      cleanupInterventions();
      state.enabled = false;
    } else {
      // 启用：重新检查是否应该监控
      state.enabled = true;
      const shouldMonitor = await checkShouldMonitor();
      if (shouldMonitor && !state.debounceTimer) {
        startMonitoring();
      }
    }
  }

  // 处理站点配置变更
  async function handleSitesChange() {
    const shouldMonitor = await checkShouldMonitor();
    const isCurrentlyMonitoring = state.debounceTimer !== null;

    if (!shouldMonitor && isCurrentlyMonitoring) {
      // 不应该监控但正在监控：停止监控
      cleanupInterventions();
    } else if (shouldMonitor && !isCurrentlyMonitoring) {
      // 应该监控但没在监控：启动监控
      startMonitoring();
    }
    // 其他情况：状态已经正确，无需操作
  }

  // 清理所有干预元素和状态
  function cleanupInterventions() {
    // 移除所有干预元素
    const elements = [
      '#sr-glow', '#sr-toast', '#sr-l2-overlay', '#sr-overlay'
    ];
    elements.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) el.remove();
    });

    // 恢复滚动
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    // 清理定时器
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    if (state.decayTimer) {
      clearInterval(state.decayTimer);
      state.decayTimer = null;
    }

    // 重置状态
    state.count = 0;
    state.currentLevel = 0;
    state.isSuspended = false;

    // 移除事件监听器
    removeEventListeners();
  }

  // ===== 路由判定 =====
  async function checkShouldMonitor() {
    // 检查插件是否启用
    const result = await chrome.storage.local.get(['enabled', 'enabledSites', 'customSites']);
    if (result.enabled === false) return false;

    const hostname = location.hostname;
    const pathname = location.pathname;

    // 检查自定义网站（全局监控）
    const customSites = result.customSites || [];
    for (const domain of customSites) {
      // domain 是纯净域名如 'github.com'
      // hostname 可能是 'github.com' 或 'www.github.com' 或 'gist.github.com'
      const cleanHostname = hostname.replace(/^www\./, '');
      if (cleanHostname === domain || cleanHostname.endsWith('.' + domain)) {
        return true;
      }
    }

    // 检查默认站点
    const enabledSites = result.enabledSites || {};
    for (const [siteKey, rule] of Object.entries(SITE_RULES)) {
      if (!hostname.includes(siteKey)) continue;

      // 检查该站点是否被用户启用（siteKey 是域名如 'bilibili.com'）
      const isEnabled = enabledSites[siteKey] !== false;
      if (!isEnabled) return false;

      // 路由判定
      if (rule.type === 'global') {
        return true;
      } else if (rule.type === 'whitelist') {
        // 白名单放行：如果匹配 allow 规则，则不监控
        if (rule.allow) {
          for (const pattern of rule.allow) {
            if (pattern.test(pathname)) return false;
          }
        }
        // 检查 hostname 白名单
        if (rule.hostnameAllow) {
          for (const allowedHost of rule.hostnameAllow) {
            if (hostname === allowedHost || hostname.endsWith('.' + allowedHost)) return false;
          }
        }
        return true;
      } else if (rule.type === 'blacklist') {
        // 黑名单监控：只有匹配 block 规则才监控
        if (rule.block) {
          for (const pattern of rule.block) {
            if (pattern.test(pathname)) return true;
          }
        }
        return false;
      }
    }

    return false;
  }

  // ===== 事件监听 =====
  function setupEventListeners() {
    // 滚轮事件 - 使用相同的函数引用以便移除
    window.addEventListener('wheel', handleScrollStart, { passive: true });
    window.addEventListener('wheel', handleScrollEnd, { passive: true });

    // 触摸事件
    window.addEventListener('touchmove', handleScrollStart, { passive: true });
    window.addEventListener('touchend', handleScrollEnd, { passive: true });

    // 标记事件监听器已添加
    state.listenersAdded = true;
  }

  // 移除事件监听器
  function removeEventListeners() {
    if (!state.listenersAdded) return;

    window.removeEventListener('wheel', handleScrollStart, { passive: true });
    window.removeEventListener('wheel', handleScrollEnd, { passive: true });
    window.removeEventListener('touchmove', handleScrollStart, { passive: true });
    window.removeEventListener('touchend', handleScrollEnd, { passive: true });

    state.listenersAdded = false;
  }

  // Scroll 开始（触发防抖）
  function handleScrollStart() {
    if (!shouldCount()) return;

    // 清除之前的结束定时器
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
  }

  // Scroll 结束（防抖后计数）
  function handleScrollEnd() {
    if (!shouldCount()) return;

    // 设置防抖定时器
    state.debounceTimer = setTimeout(() => {
      incrementCount();
    }, CONFIG.DEBOUNCE_MS);
  }

  // 是否应该计数
  function shouldCount() {
    // 检查初始冷却期（进入页面后3秒内不统计）
    if (Date.now() - state.initTime < CONFIG.INITIAL_GRACE_PERIOD_MS) {
      return false;
    }

    // 检查暂停状态
    if (state.isSuspended && Date.now() < state.suspendEndTime) {
      return false;
    }
    state.isSuspended = false;

    // 检查冷却状态
    if (Date.now() < state.levelCooldownEnd) {
      return false;
    }

    return true;
  }

  // 增加计数
  function incrementCount() {
    state.count++;
    state.lastScrollTime = Date.now();
    console.log('[Scroll Reminder] Count:', state.count);

    // 检查干预层级
    checkIntervention();
  }

  // 时间衰减定时器
  function startDecayTimer() {
    state.decayTimer = setInterval(() => {
      if (state.count > 0 && state.lastScrollTime > 0) {
        const secondsSinceLastScroll = (Date.now() - state.lastScrollTime) / 1000;
        const decayAmount = Math.floor(secondsSinceLastScroll / CONFIG.DECAY_INTERVAL_S);

        if (decayAmount > 0) {
          state.count = Math.max(0, state.count - decayAmount);
          console.log('[Scroll Reminder] Decay applied, new count:', state.count);
        }
      }
    }, 10000); // 每10秒检查一次
  }

  // ===== 干预检查 =====
  function checkIntervention() {
    const count = state.count;

    if (count >= CONFIG.LEVEL3_THRESHOLD && state.currentLevel < 3) {
      state.currentLevel = 3;
      showLevel3Intervention();
    } else if (count >= CONFIG.LEVEL2_THRESHOLD && state.currentLevel < 2) {
      state.currentLevel = 2;
      showLevel2Intervention();
    } else if (count >= CONFIG.LEVEL1_THRESHOLD && state.currentLevel < 1) {
      state.currentLevel = 1;
      showLevel1Intervention();
    }
  }

  // ===== Level 1: 呼吸警戒线 =====
  function showLevel1Intervention() {
    console.log('[Scroll Reminder] Level 1: 呼吸警戒线');

    // 移除已有的光晕
    const existingGlow = document.getElementById('sr-glow');
    if (existingGlow) existingGlow.remove();

    // 创建光晕元素 - v1.0 范围颜色 + 呼吸效果
    const glow = document.createElement('div');
    glow.id = 'sr-glow';
    glow.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 2147483647;
      box-shadow: inset 0 0 60px 20px rgba(255, 102, 0, 0.6);
      animation: sr-breathe 2s ease-in-out infinite;
    `;

    // 添加动画样式 - 呼吸效果
    const style = document.createElement('style');
    style.textContent = `
      @keyframes sr-breathe {
        0%, 100% { box-shadow: inset 0 0 60px 20px rgba(255, 102, 0, 0.4); }
        50% { box-shadow: inset 0 0 80px 30px rgba(255, 102, 0, 0.75); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(glow);

    // 3秒后渐隐消失
    setTimeout(() => {
      glow.style.transition = 'opacity 1s';
      glow.style.opacity = '0';
      setTimeout(() => glow.remove(), 1000);
    }, 3000);

    // 设置冷却期
    state.levelCooldownEnd = Date.now() + CONFIG.LEVEL1_COOLDOWN_S * 1000;
  }

  // ===== Level 2: 灵魂拷问软提醒 =====
  function showLevel2Intervention() {
    console.log('[Scroll Reminder] Level 2: 灵魂拷问');

    // 创建毛玻璃遮罩
    const overlay = document.createElement('div');
    overlay.id = 'sr-l2-overlay';
    overlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.3) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      z-index: 2147483646 !important;
      opacity: 0;
      transition: opacity 0.4s ease;
      pointer-events: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
    `;
    document.body.appendChild(overlay);

    // 创建 Toast
    const toast = document.createElement('div');
    toast.id = 'sr-toast';
    toast.style.cssText = `
      position: fixed;
      top: 40px;
      left: 50%;
      transform: translateX(-50%) translateY(-100px);
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      color: white;
      padding: 14px 24px;
      border-radius: 12px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 2147483647;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      white-space: nowrap;
    `;
    toast.textContent = '👀 嘿，你是不是又开始漫无目的地刷了？';
    document.body.appendChild(toast);

    // 下拉动画（遮罩和toast同时）
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    // 4秒后上滑消失，遮罩同步淡出
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(-100px)';
      overlay.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
        overlay.remove();
      }, 400);
    }, 4000);

    // 设置冷却期
    state.levelCooldownEnd = Date.now() + CONFIG.LEVEL2_COOLDOWN_S * 1000;
  }

  // ===== Level 3: 强制物理隔离 =====
  function showLevel3Intervention() {
    console.log('[Scroll Reminder] Level 3: 强制物理隔离');

    // 锁定页面滚动
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // 创建遮罩
    const overlay = document.createElement('div');
    overlay.id = 'sr-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(15px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // 创建弹窗
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #ffffff;
      border-radius: 16px;
      padding: 28px;
      max-width: 360px;
      width: 90%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    `;

    modal.innerHTML = `
      <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #333;">该停下来了</h2>
      <p style="font-size: 14px; color: #666; margin-bottom: 24px; line-height: 1.6;">
        你已经滚动了多次，是时候做个选择了。
      </p>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="sr-btn-3min" style="
          padding: 12px 20px;
          background: #f0f0f0;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          color: #333;
        ">给我 3 分钟收尾</button>

        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="sr-btn-custom" style="
            flex: 1;
            padding: 12px 20px;
            background: #f0f0f0;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            color: #333;
          ">查资料模式</button>
          <input type="number" id="sr-custom-min" value="15" min="1" max="120" style="
            width: 60px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
            text-align: center;
          ">
          <span style="font-size: 14px; color: #666;">分钟</span>
        </div>

        <button id="sr-btn-leave" style="
          padding: 12px 20px;
          background: #ff4444;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          color: white;
          font-weight: 500;
        ">离开此页 (推荐)</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 绑定按钮事件
    modal.querySelector('#sr-btn-3min').addEventListener('click', () => {
      suspendForMinutes(3);
      closeIntervention(overlay);
    });

    modal.querySelector('#sr-btn-custom').addEventListener('click', () => {
      const minutes = parseInt(modal.querySelector('#sr-custom-min').value) || 15;
      suspendForMinutes(minutes);
      closeIntervention(overlay);
    });

    modal.querySelector('#sr-btn-leave').addEventListener('click', () => {
      window.location.href = 'about:blank';
    });
  }

  // 暂停指定分钟
  function suspendForMinutes(minutes) {
    state.isSuspended = true;
    state.suspendEndTime = Date.now() + minutes * 60 * 1000;
    state.count = 0;
    state.currentLevel = 0;
    console.log(`[Scroll Reminder] Suspended for ${minutes} minutes`);
  }

  // 关闭干预弹窗
  function closeIntervention(overlay) {
    // 恢复滚动
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    // 移除遮罩
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s';
    setTimeout(() => overlay.remove(), 300);
  }

  // 启动
  init();
})();
