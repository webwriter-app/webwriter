import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "選択を解除しました。" : count === 1 ? "1 件を選択しました。" : `${count} 件を選択しました。`),
  moving: (x, y) => `x ${x}、y ${y}。`,
  moved: count => (count === 1 ? "移動しました。" : `${count} 件を移動しました。`),
  notMoved: "移動しませんでした。",
  port: (port, node) => `${node}の${port}`,
  linkPort: port => `${port}から接続を開始`,
  wiring: (from, count) => (count === 1 ? `${from}からの接続です。受け付けるポートは 1 件です。矢印キーで選び、Enter キーで接続、Esc キーでキャンセルします。` : `${from}からの接続です。受け付けるポートは ${count} 件です。矢印キーで選び、Enter キーで接続、Esc キーでキャンセルします。`),
  target: (to, index, count) => `${to}、${count} 件中 ${index} 番目。`,
  noTarget: "この接続を受け付けるポートはありません。",
  connected: (from, to) => `${from}を${to}に接続しました。`,
  notConnected: "接続しませんでした。",
} satisfies Catalog<SceneMessages>
