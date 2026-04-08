// 存储管理模块
// 使用 chrome.storage.local 存储配置和数据

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

// 导出
if (typeof module !== 'undefined') {
  module.exports = Storage;
}
