// Background Service Worker
// 主入口，包含所有功能

// ===== Storage 模块 =====
const Storage = {
  // 默认配置
  defaults: {
    enabled: true,
    mode: 'blacklist', // 'blacklist' | 'whitelist'
    websites: [
      { domain: 'twitter.com', enabled: true },
      { domain: 'x.com', enabled: true },
      { domain: 'xiaohongshu.com', enabled: true },
      { domain: 'douyin.com', enabled: true },
      { domain: 'weibo.com', enabled: true },
      { domain: 'instagram.com', enabled: true },
      { domain: 'facebook.com', enabled: true },
      { domain: 'zhihu.com', enabled: true },
      { domain: 'youtube.com', enabled: false },
      { domain: 'bilibili.com', enabled: false },
      { domain: 'toutiao.com', enabled: false },
      { domain: 'reddit.com', enabled: false },
      { domain: 'taobao.com', enabled: false },
      { domain: 'jd.com', enabled: false }
    ],
    whitelist: [
      'file://',
      'localhost',
      '127.0.0.1',
      '192.168.'
    ],
    // 触发阈值
    threshold: {
      timeWindow: 1 * 60 * 1000, // 1分钟（毫秒）
      scrollCount: 3
    },
    // 冷却时间
    cooldown: 5 * 60 * 1000, // 5分钟（毫秒）
    // 标签页切换暂停时间
    pauseTimeout: 30 * 1000 // 30秒（毫秒）
  },

  // 获取配置
  async getConfig() {
    const result = await chrome.storage.local.get('config');
    return { ...this.defaults, ...result.config };
  },

  // 保存配置
  async setConfig(config) {
    await chrome.storage.local.set({ config });
  },

  // 获取统计数据
  async getStats() {
    const result = await chrome.storage.local.get('stats');
    const today = new Date().toISOString().split('T')[0];

    return result.stats || {
      daily: {},
      today: {
        date: today,
        triggers: 0,
        leave: 0,
        continue: 0,
        byWebsite: {}
      },
      streak: 0,
      lastLeaveDate: null
    };
  },

  // 更新统计数据
  async updateStats(update) {
    const stats = await this.getStats();
    const today = new Date().toISOString().split('T')[0];

    // 检查是否是新的一天
    if (stats.today.date !== today) {
      // 保存昨天的数据
      stats.daily[stats.today.date] = { ...stats.today };
      // 重置今天
      stats.today = {
        date: today,
        triggers: 0,
        leave: 0,
        continue: 0,
        byWebsite: {}
      };
    }

    // 应用更新
    if (update.trigger) {
      stats.today.triggers++;
    }
    if (update.leave) {
      stats.today.leave++;
      // 更新 streak
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (stats.lastLeaveDate === yesterdayStr || stats.lastLeaveDate === today) {
        if (stats.lastLeaveDate !== today) {
          stats.streak++;
          stats.lastLeaveDate = today;
        }
      } else {
        stats.streak = 1;
        stats.lastLeaveDate = today;
      }
    }
    if (update.continue) {
      stats.today.continue++;
    }
    if (update.website) {
      stats.today.byWebsite[update.website] = (stats.today.byWebsite[update.website] || 0) + 1;
    }

    await chrome.storage.local.set({ stats });
    return stats;
  },

  // 检查网站是否应该被监测
  async shouldMonitor(hostname) {
    const config = await this.getConfig();

    // 检查插件是否启用
    if (!config.enabled) {
      console.log('[Scroll Reminder] Extension disabled');
      return false;
    }

    // 检查是否在白名单中
    for (const white of config.whitelist) {
      if (hostname.includes(white)) {
        console.log('[Scroll Reminder] Hostname in whitelist:', hostname);
        return false;
      }
    }

    if (config.mode === 'whitelist') {
      // 白名单模式：监测所有不在白名单中的网站
      console.log('[Scroll Reminder] Whitelist mode, monitoring:', hostname);
      return true;
    } else {
      // 黑名单模式：只监测列表中启用的网站
      // 移除 hostname 的 www. 前缀进行匹配
      const normalizedHostname = hostname.replace(/^www\./, '');
      const website = config.websites.find(w => {
        const normalizedDomain = w.domain.replace(/^www\./, '');
        return normalizedHostname === normalizedDomain ||
               normalizedHostname.endsWith('.' + normalizedDomain) ||
               normalizedDomain.endsWith('.' + normalizedHostname);
      });
      const shouldMonitor = website ? website.enabled : false;
      console.log('[Scroll Reminder] Blacklist mode, hostname:', hostname, 'normalized:', normalizedHostname, 'website:', website, 'shouldMonitor:', shouldMonitor);
      return shouldMonitor;
    }
  },

  // 添加网站到监测列表
  async addWebsite(domain) {
    const config = await this.getConfig();
    if (!config.websites.find(w => w.domain === domain)) {
      config.websites.push({ domain, enabled: true });
      await this.setConfig(config);
    }
  },

  // 从监测列表移除网站
  async removeWebsite(domain) {
    const config = await this.getConfig();
    config.websites = config.websites.filter(w => w.domain !== domain);
    await this.setConfig(config);
  },

  // 切换网站启用状态
  async toggleWebsite(domain) {
    const config = await this.getConfig();
    const website = config.websites.find(w => w.domain === domain);
    if (website) {
      website.enabled = !website.enabled;
      await this.setConfig(config);
    }
  }
};

// ===== Counter 模块 =====
const Counter = {
  // 存储每个标签页的状态
  tabs: new Map(),

  // 冷却中的网站
  cooldowns: new Map(),

  // 初始化
  init() {
    // 监听标签页更新
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.url) {
        this.resetTab(tabId, new URL(changeInfo.url).hostname);
      }
    });

    // 监听标签页关闭
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.tabs.delete(tabId);
    });

    // 监听标签页切换
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await this.handleTabActivated(activeInfo.tabId);
    });

    // 监听窗口焦点变化
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // 窗口失去焦点，暂停所有标签页
        this.pauseAllTabs();
      } else {
        // 窗口获得焦点，恢复当前标签页
        const [activeTab] = await chrome.tabs.query({ active: true, windowId });
        if (activeTab) {
          await this.handleTabActivated(activeTab.id);
        }
      }
    });
  },

  // 重置标签页状态
  resetTab(tabId, hostname) {
    this.tabs.set(tabId, {
      hostname,
      count: 0,
      firstScrollTime: null,
      lastScrollTime: null,
      paused: false,
      pausedAt: null,
      interventionLevel: 0
    });
  },

  // 处理标签页激活
  async handleTabActivated(tabId) {
    const config = await Storage.getConfig();
    const now = Date.now();

    // 暂停其他所有标签页
    for (const [id, state] of this.tabs) {
      if (id !== tabId && !state.paused) {
        state.paused = true;
        state.pausedAt = now;
      }
    }

    // 恢复当前标签页
    const currentState = this.tabs.get(tabId);
    if (currentState && currentState.paused) {
      const pausedDuration = now - currentState.pausedAt;

      if (pausedDuration > config.pauseTimeout) {
        // 暂停超过30秒，清零
        this.resetTab(tabId, currentState.hostname);
      } else {
        // 暂停未超过30秒，恢复计数
        currentState.paused = false;
        currentState.pausedAt = null;
      }
    }
  },

  // 暂停所有标签页
  pauseAllTabs() {
    const now = Date.now();
    for (const state of this.tabs.values()) {
      if (!state.paused) {
        state.paused = true;
        state.pausedAt = now;
      }
    }
  },

  // 记录一次 scroll
  async recordScroll(tabId, hostname) {
    // 检查是否在冷却期
    if (this.isInCooldown(hostname)) {
      return { triggered: false, level: 0 };
    }

    // 获取或创建标签页状态
    let state = this.tabs.get(tabId);
    if (!state || state.hostname !== hostname) {
      this.resetTab(tabId, hostname);
      state = this.tabs.get(tabId);
    }

    // 如果处于暂停状态，不记录
    if (state.paused) {
      return { triggered: false, level: 0 };
    }

    const config = await Storage.getConfig();
    const now = Date.now();

    // 检查时间窗口
    if (state.firstScrollTime && (now - state.firstScrollTime > config.threshold.timeWindow)) {
      // 超过时间窗口，重置计数
      state.count = 0;
      state.firstScrollTime = null;
      state.interventionLevel = 0;
    }

    // 记录 scroll
    state.count++;
    state.lastScrollTime = now;
    if (!state.firstScrollTime) {
      state.firstScrollTime = now;
    }

    // 检查是否触发干预
    if (state.count >= config.threshold.scrollCount) {
      state.interventionLevel++;

      // 更新统计数据
      await Storage.updateStats({
        trigger: true,
        website: hostname
      });

      return {
        triggered: true,
        level: state.interventionLevel,
        count: state.count
      };
    }

    return { triggered: false, level: 0 };
  },

  // 检查网站是否在冷却期
  isInCooldown(hostname) {
    const cooldownEnd = this.cooldowns.get(hostname);
    if (cooldownEnd && Date.now() < cooldownEnd) {
      return true;
    }
    // 清理过期的冷却
    if (cooldownEnd && Date.now() >= cooldownEnd) {
      this.cooldowns.delete(hostname);
    }
    return false;
  },

  // 设置冷却期
  async setCooldown(hostname) {
    const config = await Storage.getConfig();
    this.cooldowns.set(hostname, Date.now() + config.cooldown);
  },

  // 用户选择"离开"
  async handleLeave(tabId, hostname) {
    // 清零该网站的所有标签页计数
    for (const [id, state] of this.tabs) {
      if (state.hostname === hostname) {
        this.resetTab(id, hostname);
      }
    }

    // 更新统计数据
    await Storage.updateStats({ leave: true });

    // 关闭当前标签页
    await chrome.tabs.remove(tabId);
  },

  // 用户选择"继续"
  async handleContinue(tabId, hostname) {
    // 设置冷却期
    await this.setCooldown(hostname);

    // 更新统计数据
    await Storage.updateStats({ continue: true });

    // 重置当前标签页的干预级别，但保留计数
    const state = this.tabs.get(tabId);
    if (state) {
      state.interventionLevel = 0;
    }
  }
};

// 初始化 Counter
Counter.init();

// ===== 消息处理 =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;
  const hostname = sender.tab && sender.tab.url ? new URL(sender.tab.url).hostname : null;

  (async () => {
    try {
      switch (message.type) {
        case 'CHECK_MONITORING': {
          if (!hostname) {
            sendResponse({ shouldMonitor: false });
            return;
          }
          const shouldMonitor = await Storage.shouldMonitor(hostname);
          sendResponse({ shouldMonitor });
          break;
        }

        case 'RECORD_SCROLL': {
          if (!tabId || !hostname) {
            sendResponse({ triggered: false });
            return;
          }
          const result = await Counter.recordScroll(tabId, hostname);
          sendResponse(result);
          break;
        }

        case 'LEAVE_PAGE': {
          if (!tabId || !hostname) {
            sendResponse({ error: 'No tab or hostname' });
            return;
          }
          await Counter.handleLeave(tabId, hostname);
          sendResponse({ success: true });
          break;
        }

        case 'CONTINUE_BROWSING': {
          if (!tabId || !hostname) {
            sendResponse({ error: 'No tab or hostname' });
            return;
          }
          await Counter.handleContinue(tabId, hostname);
          sendResponse({ success: true });
          break;
        }

        case 'GET_CONFIG': {
          const config = await Storage.getConfig();
          sendResponse({ config });
          break;
        }

        case 'GET_STATS': {
          const stats = await Storage.getStats();
          sendResponse({ stats });
          break;
        }

        case 'UPDATE_WEBSITE': {
          if (message.action === 'add') {
            await Storage.addWebsite(message.domain);
          } else if (message.action === 'remove') {
            await Storage.removeWebsite(message.domain);
          } else if (message.action === 'toggle') {
            await Storage.toggleWebsite(message.domain);
          }
          const updatedConfig = await Storage.getConfig();
          sendResponse({ config: updatedConfig });
          break;
        }

        case 'SET_MODE': {
          const currentConfig = await Storage.getConfig();
          currentConfig.mode = message.mode;
          await Storage.setConfig(currentConfig);
          sendResponse({ success: true });
          break;
        }

        case 'TOGGLE_ENABLED': {
          const cfg = await Storage.getConfig();
          cfg.enabled = !cfg.enabled;
          await Storage.setConfig(cfg);
          sendResponse({ enabled: cfg.enabled });
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background error:', error);
      sendResponse({ error: error.message });
    }
  })();

  return true;
});

// 安装时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('Scroll Reminder installed');
    const config = await Storage.getConfig();
    await Storage.setConfig(config);
  }
});
