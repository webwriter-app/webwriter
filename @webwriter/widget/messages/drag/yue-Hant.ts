import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `已經拎起${item}。用方向鍵揀位置，㩒 Enter 放低，㩒 Esc 取消。`,
  pickedLink: item => `而家連緊${item}。用方向鍵揀要連去邊度，㩒 Enter 連接，㩒 Esc 取消。`,
  selected: item => `已經揀咗${item}。請㩒要放嘅位置，或者再㩒一次呢項嚟取消。`,
  nextTarget: "㩒 Tab 鍵轉去下一個目標。",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}第 ${position.index} 個位置，共 ${position.count} 個` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}距離左邊 ${x}，距離頂部 ${y}`,
  dropped: (item, target) => (target ? `已經將${item}放咗落${target}。` : `已經放低${item}。`),
  copied: (item, target) => (target ? `已經將${item}加咗落${target}。` : `已經加咗${item}。`),
  linked: (item, target) => `已經將${item}連接咗去${target}。`,
  cancelled: () => "已經取消。",
  notAllowed: "已經取消。呢度而家唔准咁做。",
} satisfies Catalog<DragMessages>
