// Popup 脚本
// 快速设置界面逻辑

document.addEventListener('DOMContentLoaded', async () => {
  // 加载配置和统计数据
  await loadConfig();
  await loadStats();

  // 绑定事件
  bindEvents();
});

// 加载配置
async function loadConfig() {
  try {
    const response = await sendMessage({ type: 'GET_CONFIG' });
    if (!response || !response.config) return;

    const config = response.config;

    // 更新启用开关
    const enabledToggle = document.getElementById('enabledToggle');
    if (config.enabled) {
      enabledToggle.classList.add('active');
    } else {
      enabledToggle.classList.remove('active');
    }

    // 更新网站列表
    renderWebsiteList(config.websites);

    // 更新模式选择
    const modeBlacklist = document.getElementById('modeBlacklist');
    const modeWhitelist = document.getElementById('modeWhitelist');
    if (config.mode === 'whitelist') {
      modeWhitelist.checked = true;
    } else {
      modeBlacklist.checked = true;
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
}

// 加载统计数据
async function loadStats() {
  try {
    const response = await sendMessage({ type: 'GET_STATS' });
    if (!response || !response.stats) return;

    const stats = response.stats;

    // 更新今日统计
    document.getElementById('statTriggers').textContent = stats.today.triggers;
    document.getElementById('statLeave').textContent = stats.today.leave;
    document.getElementById('statContinue').textContent = stats.today.continue;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// 渲染网站列表
function renderWebsiteList(websites) {
  const list = document.getElementById('websiteList');

  if (!websites || websites.length === 0) {
    list.innerHTML = '<div class="empty-state">暂无监测网站</div>';
    return;
  }

  list.innerHTML = websites.map(site => `
    <div class="website-item">
      <span class="website-domain">${escapeHtml(site.domain)}</span>
      <input type="checkbox" class="website-checkbox"
             ${site.enabled ? 'checked' : ''}
             data-domain="${escapeHtml(site.domain)}">
    </div>
  `).join('');

  // 绑定复选框事件
  list.querySelectorAll('.website-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const domain = e.target.dataset.domain;
      try {
        await sendMessage({
          type: 'UPDATE_WEBSITE',
          action: 'toggle',
          domain: domain
        });
      } catch (error) {
        console.error('Error toggling website:', error);
      }
    });
  });
}

// 绑定事件
function bindEvents() {
  // 启用开关
  document.getElementById('enabledToggle').addEventListener('click', async () => {
    try {
      const response = await sendMessage({ type: 'TOGGLE_ENABLED' });
      const toggle = document.getElementById('enabledToggle');
      if (response.enabled) {
        toggle.classList.add('active');
      } else {
        toggle.classList.remove('active');
      }
    } catch (error) {
      console.error('Error toggling enabled:', error);
    }
  });

  // 添加网站
  document.getElementById('addBtn').addEventListener('click', async () => {
    const input = document.getElementById('newDomain');
    const domain = input.value.trim();

    if (!domain) return;

    // 简单验证域名格式
    if (!domain.includes('.') || domain.includes(' ')) {
      alert('请输入有效的域名，如: example.com');
      return;
    }

    try {
      await sendMessage({
        type: 'UPDATE_WEBSITE',
        action: 'add',
        domain: domain
      });

      // 清空输入框并刷新列表
      input.value = '';
      await loadConfig();
    } catch (error) {
      console.error('Error adding website:', error);
    }
  });

  // 回车添加
  document.getElementById('newDomain').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('addBtn').click();
    }
  });

  // 模式选择
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      try {
        await sendMessage({
          type: 'SET_MODE',
          mode: e.target.value
        });
      } catch (error) {
        console.error('Error setting mode:', error);
      }
    });
  });

  // 打开详细设置
  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
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

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
