import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "已取消選取。" : count === 1 ? "已選取 1 個項目。" : `已選取項目數：${count}。`),
  moving: (x, y) => `x ${x}，y ${y}。`,
  moved: count => (count === 1 ? "已移動。" : `已移動項目數：${count}。`),
  notMoved: "未移動。",
  port: (port, node) => `${node}的${port}`,
  linkPort: port => `從${port}開始連線`,
  wiring: (from, count) => (count === 1 ? `從${from}開始連線。可接受此連線的連接埠數：1。使用方向鍵選擇，按 Enter 連線，按 Esc 取消。` : `從${from}開始連線。可接受此連線的連接埠數：${count}。使用方向鍵選擇，按 Enter 連線，按 Esc 取消。`),
  target: (to, index, count) => `${to}，第 ${index} 個，共 ${count} 個。`,
  noTarget: "沒有連接埠可接受此連線。",
  connected: (from, to) => `已將${from}連線到${to}。`,
  notConnected: "未連線。",
} satisfies Catalog<SceneMessages>
