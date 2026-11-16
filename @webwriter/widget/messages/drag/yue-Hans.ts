import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `已经拎起${item}。用方向键拣位置，㩒 Enter 放低，㩒 Esc 取消。`,
  pickedLink: item => `而家连紧${item}。用方向键拣要连去边度，㩒 Enter 连接，㩒 Esc 取消。`,
  selected: item => `已经拣咗${item}。请㩒要放嘅位置，或者再㩒一次呢项嚟取消。`,
  nextTarget: "㩒 Tab 键转去下一个目标。",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}第 ${position.index} 个位置，共 ${position.count} 个` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}距离左边 ${x}，距离顶部 ${y}`,
  dropped: (item, target) => (target ? `已经将${item}放咗落${target}。` : `已经放低${item}。`),
  copied: (item, target) => (target ? `已经将${item}加咗落${target}。` : `已经加咗${item}。`),
  linked: (item, target) => `已经将${item}连接咗去${target}。`,
  cancelled: () => "已经取消。",
  notAllowed: "已经取消。呢度而家唔准咁做。",
} satisfies Catalog<DragMessages>
