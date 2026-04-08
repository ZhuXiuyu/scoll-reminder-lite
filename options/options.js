// Options 页面脚本
// 详细设置界面逻辑

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  await loadStats();
  bindEvents();
});

// 加载配置
async function loadConfig() {
  try {
    const response = await sendMessage({ type: 'GET_CONFIG' });
    if (!response || !response.config) return;

    const config = response.config;

    // 更新阈值设置
    document.getElementById('timeWindow').value = config.threshold.timeWindow / (60 * 1000);
    document.getElementById('scrollCount').value = config.threshold.scrollCount;
    document.getElementById('cooldown').value = config.cooldown / (60 * 1000);

    // 更新网站列表
    renderWebsiteTable(config.websites);
  } catch (error) {
    console.error('Error loading config:', error);
    showError('加载配置失败');
  }
}

// 加载统计数据
async function loadStats() {
  try {
    const response = await sendMessage({ type: 'GET_STATS' });
    if (!response || !response.stats) return;

    const stats = response.stats;

    // 更新统计卡片
    document.getElementById('totalTriggers').textContent = stats.today.triggers;
    document.getElementById('totalLeave').textContent = stats.today.leave;
    document.getElementById('totalContinue').textContent = stats.today.continue;
    document.getElementById('streakDays').textContent = stats.streak;

    // 渲染本周趋势图
    renderWeeklyChart(stats);
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// 渲染网站表格
function renderWebsiteTable(websites) {
  const tbody = document.getElementById('websiteTableBody');

  if (!websites || websites.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #999;">暂无监测网站</td></tr>';
    return;
  }

  tbody.innerHTML = websites.map(site => `
    <tr>
      <td>${escapeHtml(site.domain)}</td>
      <td>
        <input type="checkbox" ${site.enabled ? 'checked' : ''}
               data-domain="${escapeHtml(site.domain)}"
               class="website-toggle">
      </td>
      <td>
        <button class="btn btn-secondary btn-sm delete-btn"
                data-domain="${escapeHtml(site.domain)}"
                style="padding: 6px 12px; font-size: 12px;">
          删除
        </button>
      </td>
    </tr>
  `).join('');

  // 绑定复选框事件
  tbody.querySelectorAll('.website-toggle').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const domain = e.target.dataset.domain;
      try {
        await sendMessage({
          type: 'UPDATE_WEBSITE',
          action: 'toggle',
          domain: domain
        });
        showSuccess('设置已更新');
      } catch (error) {
        console.error('Error toggling website:', error);
        showError('更新失败');
      }
    });
  });

  // 绑定删除按钮事件
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const domain = e.target.dataset.domain;
      if (confirm(`确定要删除 ${domain} 吗？`)) {
        try {
          await sendMessage({
            type: 'UPDATE_WEBSITE',
            action: 'remove',
            domain: domain
          });
          await loadConfig();
          showSuccess('已删除');
        } catch (error) {
          console.error('Error removing website:', error);
          showError('删除失败');
        }
      }
    });
  });
}

// 渲染本周趋势图
function renderWeeklyChart(stats) {
  const chartContainer = document.getElementById('weeklyChart');

  // 获取最近7天的数据
  const days = [];
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayName = i === 0 ? '今天' : dayNames[date.getDay()];

    const dayStats = stats.daily[dateStr] || { triggers: 0 };
    days.push({
      name: dayName,
      value: dayStats.triggers
    });
  }

  // 计算最大值用于比例
  const maxValue = Math.max(...days.map(d => d.value), 1);

  chartContainer.innerHTML = `
    <h3 style="font-size: 14px; margin-bottom: 12px;">本周趋势</h3>
    ${days.map(day => `
      <div class="chart-row">
        <div class="chart-label">${day.name}</div>
        <div class="chart-bar">
          <div class="chart-fill" style="width: ${(day.value / maxValue * 100)}%"></div>
        </div>
        <div class="chart-value">${day.value}</div>
      </div>
    `).join('')}
  `;
}

// 绑定事件
function bindEvents() {
  // 阈值设置自动保存
  ['timeWindow', 'scrollCount', 'cooldown'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveThresholdSettings);
  });

  // 添加网站
  document.getElementById('addWebsiteBtn').addEventListener('click', async () => {
    const input = document.getElementById('newWebsiteDomain');
    const domain = input.value.trim();

    if (!domain) return;

    if (!domain.includes('.') || domain.includes(' ')) {
      showError('请输入有效的域名，如: example.com');
      return;
    }

    try {
      await sendMessage({
        type: 'UPDATE_WEBSITE',
        action: 'add',
        domain: domain
      });

      input.value = '';
      await loadConfig();
      showSuccess('添加成功');
    } catch (error) {
      console.error('Error adding website:', error);
      showError('添加失败');
    }
  });

  // 回车添加
  document.getElementById('newWebsiteDomain').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('addWebsiteBtn').click();
    }
  });

  // 清除所有数据
  document.getElementById('clearDataBtn').addEventListener('click', async () => {
    if (confirm('确定要清除所有数据吗？这将删除所有设置和统计数据，不可恢复。')) {
      try {
        await chrome.storage.local.clear();
        showSuccess('数据已清除');
        setTimeout(() => {
          location.reload();
        }, 1000);
      } catch (error) {
        console.error('Error clearing data:', error);
        showError('清除失败');
      }
    }
  });
}

// 保存阈值设置
async function saveThresholdSettings() {
  try {
    const config = await sendMessage({ type: 'GET_CONFIG' });
    if (!config || !config.config) return;

    const newConfig = config.config;
    newConfig.threshold.timeWindow = parseInt(document.getElementById('timeWindow').value) * 60 * 1000;
    newConfig.threshold.scrollCount = parseInt(document.getElementById('scrollCount').value);
    newConfig.cooldown = parseInt(document.getElementById('cooldown').value) * 60 * 1000;

    await sendMessage({
      type: 'UPDATE_CONFIG',
      config: newConfig
    });

    showSuccess('设置已保存');
  } catch (error) {
    console.error('Error saving settings:', error);
    showError('保存失败');
  }
}

// 显示成功消息
function showSuccess(message) {
  const el = document.getElementById('successMessage');
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

// 显示错误消息
function showError(message) {
  const el = document.getElementById('errorMessage');
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
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
