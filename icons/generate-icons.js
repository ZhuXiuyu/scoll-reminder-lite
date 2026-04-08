// 生成简单的 SVG 图标并转换为 PNG
// 由于浏览器扩展需要 PNG 图标，这里创建一个简单的数据 URI 方案
// 实际使用时可以用在线工具转换，或使用 canvas 生成

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="20" fill="#ff6b6b"/>
  <text x="64" y="88" font-size="80" text-anchor="middle" fill="white">🛑</text>
</svg>
`;

// 实际图标将使用纯色背景 + 简单图形
// 这里创建一个 canvas 来生成 PNG
function generateIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.15);
  ctx.fill();

  // 停止符号
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.25, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL('image/png');
}

// 导出供使用
if (typeof module !== 'undefined') {
  module.exports = { generateIcon };
}
