# Scroll Reminder

防止在社交媒体上无意识 scroll 摄入碎片化信息的浏览器扩展。

## 功能特性

- **渐进式干预**：从边缘光晕 → 页面变暗 → 强制弹窗，逐步提醒
- **智能检测**：检测鼠标滚轮、触摸滑动、滚动条拖拽、键盘翻页
- **标签页感知**：切换标签页时暂停计数，30秒内返回继续累积
- **灵活配置**：支持黑名单/白名单模式，可自定义监测网站
- **数据统计**：记录触发次数、选择离开/继续的比例、连续成功天数

## 安装方法

### Chrome / Edge

1. 下载本项目代码
2. 打开 Chrome/Edge 扩展管理页面：`chrome://extensions` 或 `edge://extensions`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择本项目文件夹
6. 完成安装

## 使用方法

1. 点击浏览器工具栏的 🛑 图标打开设置
2. 在"监测网站"中添加你想要控制的网站
3. 选择"黑名单模式"或"白名单模式"
4. 在目标网站上 scroll，达到阈值后会收到提醒

## 默认监测网站

- Twitter/X (twitter.com, x.com)
- 小红书 (xiaohongshu.com)
- 抖音网页版 (douyin.com)
- 微博 (weibo.com)
- Instagram (instagram.com)
- Facebook (facebook.com)
- 知乎 (zhihu.com)

## 触发逻辑

- **时间窗口**：2 分钟
- **Scroll 次数**：3 次
- **冷却时间**：选择"继续浏览"后 5 分钟内不再提醒

## 技术栈

- Manifest V3
- Vanilla JavaScript
- CSS3 (backdrop-filter, animations)

## 隐私说明

- 所有数据存储在浏览器本地，不上传服务器
- 不收集用户浏览的具体内容
- 开源代码，可审计

## 项目结构

```
scroll-reminder/
├── manifest.json          # 扩展配置
├── background/            # 后台脚本
│   ├── background.js      # 主入口
│   ├── counter.js         # 计数器逻辑
│   └── storage.js         # 数据存储
├── content/               # 内容脚本
│   ├── content.js         # 页面检测
│   └── content.css        # 干预样式
├── popup/                 # 快速设置弹窗
│   ├── popup.html
│   └── popup.js
├── options/               # 详细设置页面
│   ├── options.html
│   └── options.js
└── icons/                 # 图标
    ├── icon.svg
    └── README.md
```

## 开发计划

- [x] 核心检测功能
- [x] 渐进式干预 UI
- [x] 设置界面
- [x] 数据统计
- [ ] Firefox 支持
- [ ] 专注模式（定时开启）

## License

MIT
