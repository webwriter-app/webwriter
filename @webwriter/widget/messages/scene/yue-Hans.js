var yue_Hans_default = {
  selection: (count) => count === 0 ? "已经取消选取。" : count === 1 ? "已经拣咗 1 项。" : `已经拣咗嘅项目数量：${count}。`,
  moving: (x, y) => `x ${x}，y ${y}。`,
  moved: (count) => count === 1 ? "已经移动。" : `已经移动嘅项目数量：${count}。`,
  notMoved: "冇移动。",
  port: (port, node) => `${node}嘅${port}`,
  linkPort: (port) => `由${port}开始连线`,
  wiring: (from, count) => count === 1 ? `由${from}开始连线。可以接受呢条线嘅接口数量：1。用方向键拣，㩒 Enter 连接，㩒 Esc 取消。` : `由${from}开始连线。可以接受呢条线嘅接口数量：${count}。用方向键拣，㩒 Enter 连接，㩒 Esc 取消。`,
  target: (to, index, count) => `${to}，第 ${index} 个，共 ${count} 个。`,
  noTarget: "冇接口可以接受呢条线。",
  connected: (from, to) => `已经将${from}连接咗去${to}。`,
  notConnected: "未连接。"
};
export {
  yue_Hans_default as default
};
