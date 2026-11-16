var yue_Hant_default = {
  selection: (count) => count === 0 ? "已經取消選取。" : count === 1 ? "已經揀咗 1 項。" : `已經揀咗嘅項目數量：${count}。`,
  moving: (x, y) => `x ${x}，y ${y}。`,
  moved: (count) => count === 1 ? "已經移動。" : `已經移動嘅項目數量：${count}。`,
  notMoved: "冇移動。",
  port: (port, node) => `${node}嘅${port}`,
  linkPort: (port) => `由${port}開始連線`,
  wiring: (from, count) => count === 1 ? `由${from}開始連線。可以接受呢條線嘅接口數量：1。用方向鍵揀，㩒 Enter 連接，㩒 Esc 取消。` : `由${from}開始連線。可以接受呢條線嘅接口數量：${count}。用方向鍵揀，㩒 Enter 連接，㩒 Esc 取消。`,
  target: (to, index, count) => `${to}，第 ${index} 個，共 ${count} 個。`,
  noTarget: "冇接口可以接受呢條線。",
  connected: (from, to) => `已經將${from}連接咗去${to}。`,
  notConnected: "未連接。"
};
export {
  yue_Hant_default as default
};
