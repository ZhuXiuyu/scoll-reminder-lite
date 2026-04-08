// 计数器管理模块
// 管理每个标签页的 scroll 计数和时间窗口

importScripts('storage.js');

const Counter = {
  // 存储每个标签页的状态
  // tabId -> { hostname, count, firstScrollTime, lastScrollTime, paused, pausedAt, interventionLevel }
  tabs: new Map(),

  // 冷却中的网站
  // hostname -> cooldownEndTime
  cooldowns: new Map(),

  // 初始化
  async init() {
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
      interventionLevel: 0 // 0: 无, 1: 边缘光晕, 2: 变暗, 3: 强制弹窗
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
  },

  // 获取标签页状态
  getTabState(tabId) {
    return this.tabs.get(tabId);
  }
};

// 初始化
Counter.init();

// 导出
if (typeof module !== 'undefined') {
  module.exports = Counter;
}
