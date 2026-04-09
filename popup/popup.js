// Popup 脚本 - Scroll Reminder Lite
// 极简设置面板

const DEFAULT_SITES = {
  'xiaohongshu.com': { name: '小红书', domain: 'xiaohongshu.com', enabled: true },
  'bilibili.com': { name: '哔哩哔哩', domain: 'bilibili.com', enabled: true },
  'zhihu.com': { name: '知乎', domain: 'zhihu.com', enabled: true },
  'weibo.com': { name: '微博', domain: 'weibo.com', enabled: true },
  'douyin.com': { name: '抖音/TikTok', domain: 'douyin.com', enabled: true },
  'youtube.com': { name: 'YouTube (仅 Shorts)', domain: 'youtube.com', enabled: true }
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindEvents();
});

// 加载设置
async function loadSettings() {
  const result = await chrome.storage.local.get(['enabledSites', 'customSites', 'enabled']);

  // 插件启用状态
  const enabled = result.enabled !== false; // 默认启用
  updateToggleUI(enabled);

  // 默认站点
  const enabledSites = result.enabledSites || {};
  renderDefaultSites(enabledSites);

  // 自定义站点
  const customSites = result.customSites || [];
  renderCustomSites(customSites);
}

// 渲染默认站点列表
function renderDefaultSites(enabledSites) {
  const container = document.getElementById('defaultSites');

  container.innerHTML = Object.entries(DEFAULT_SITES).map(([key, site]) => {
    const isEnabled = enabledSites[key] !== false; // 默认启用
    return `
      <div class="site-item">
        <div class="site-info">
          <span class="site-name">${site.name}</span>
          <span class="site-domain">${site.domain}</span>
        </div>
        <input type="checkbox" class="site-checkbox" data-key="${key}" ${isEnabled ? 'checked' : ''}>
      </div>
    `;
  }).join('');

  // 绑定复选框事件
  container.querySelectorAll('.site-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const key = e.target.dataset.key;
      const result = await chrome.storage.local.get('enabledSites');
      const enabledSites = result.enabledSites || {};
      enabledSites[key] = e.target.checked;
      await chrome.storage.local.set({ enabledSites });

      // 通知所有标签页站点配置已变更
      await notifyAllTabs({ type: 'sitesChanged', enabledSites });
    });
  });
}

// 渲染自定义站点列表
function renderCustomSites(customSites) {
  const container = document.getElementById('customList');

  if (customSites.length === 0) {
    container.innerHTML = '<div style="color: #999; font-size: 12px; padding: 8px 0;">暂无自定义网站</div>';
    return;
  }

  container.innerHTML = customSites.map(domain => `
    <div class="custom-item">
      <span class="custom-domain">${escapeHtml(domain)}</span>
      <button class="delete-btn" data-domain="${escapeHtml(domain)}">删除</button>
    </div>
  `).join('');

  // 绑定删除按钮
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const domain = e.target.dataset.domain;
      const result = await chrome.storage.local.get('customSites');
      let customSites = result.customSites || [];
      customSites = customSites.filter(d => d !== domain);
      await chrome.storage.local.set({ customSites });
      renderCustomSites(customSites);

      // 通知所有标签页自定义站点已变更
      await notifyAllTabs({ type: 'customSitesChanged', customSites });
    });
  });
}

// 更新开关UI
function updateToggleUI(enabled) {
  const toggle = document.getElementById('enabledToggle');
  const siteList = document.getElementById('defaultSites');
  const customSection = document.getElementById('customSection');
  const disabledNotice = document.getElementById('disabledNotice');

  if (enabled) {
    toggle.classList.add('active');
    siteList.classList.remove('disabled');
    customSection.classList.remove('disabled');
    disabledNotice.classList.remove('show');
  } else {
    toggle.classList.remove('active');
    siteList.classList.add('disabled');
    customSection.classList.add('disabled');
    disabledNotice.classList.add('show');
  }
}

// 绑定事件
function bindEvents() {
  // 启用开关
  document.getElementById('enabledToggle').addEventListener('click', async () => {
    const result = await chrome.storage.local.get('enabled');
    const newEnabled = result.enabled === false; // 切换状态
    await chrome.storage.local.set({ enabled: newEnabled });
    updateToggleUI(newEnabled);

    // 通知所有标签页插件状态已变更
    await notifyAllTabs({ type: 'enabledChanged', enabled: newEnabled });
  });

  // 添加自定义网站
  document.getElementById('addBtn').addEventListener('click', async () => {
    const input = document.getElementById('customInput');
    const rawInput = input.value.trim().toLowerCase();

    if (!rawInput) return;

    // 提取纯净域名（去掉协议、路径、查询参数）
    let domain = rawInput;
    try {
      // 尝试作为 URL 解析
      if (domain.includes('://')) {
        const url = new URL(domain);
        domain = url.hostname;
      } else if (domain.includes('/')) {
        // 没有协议但有路径，添加协议再解析
        const url = new URL('https://' + domain);
        domain = url.hostname;
      }
      // 去掉 www. 前缀
      domain = domain.replace(/^www\./, '');
    } catch (e) {
      // 解析失败，使用原始输入
    }

    if (!domain.includes('.') || domain.includes(' ')) {
      alert('请输入有效的域名，如: v2ex.com');
      return;
    }

    const result = await chrome.storage.local.get('customSites');
    let customSites = result.customSites || [];

    if (customSites.includes(domain)) {
      alert('该域名已存在');
      return;
    }

    customSites.push(domain);
    await chrome.storage.local.set({ customSites });
    input.value = '';
    renderCustomSites(customSites);

    // 通知所有标签页自定义站点已变更
    await notifyAllTabs({ type: 'customSitesChanged', customSites });
  });

  // 回车添加
  document.getElementById('customInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('addBtn').click();
    }
  });
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 通知所有标签页配置变更
async function notifyAllTabs(message) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      // 只向 http/https 页面发送消息
      if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch (e) {
          // 忽略无法接收消息的标签页（未注入 content script 的页面）
        }
      }
    }
  } catch (e) {
    console.error('[Scroll Reminder] Failed to notify tabs:', e);
  }
}
