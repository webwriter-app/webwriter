var zh_default = {
  selection: (count) => count === 0 ? "已取消选择。" : count === 1 ? "已选中 1 项。" : `已选中项目数：${count}。`,
  moving: (x, y) => `x ${x}，y ${y}。`,
  moved: (count) => count === 1 ? "已移动。" : `已移动项目数：${count}。`,
  notMoved: "未移动。",
  port: (port, node) => `${node}的${port}`,
  linkPort: (port) => `从${port}开始连线`,
  wiring: (from, count) => count === 1 ? `从${from}开始连线。可接受此连线的端口数：1。使用方向键选择，按 Enter 连接，按 Esc 取消。` : `从${from}开始连线。可接受此连线的端口数：${count}。使用方向键选择，按 Enter 连接，按 Esc 取消。`,
  target: (to, index, count) => `${to}，第 ${index} 个，共 ${count} 个。`,
  noTarget: "没有端口可接受此连线。",
  connected: (from, to) => `已将${from}连接到${to}。`,
  notConnected: "未连接。"
};
export {
  zh_default as default
};
