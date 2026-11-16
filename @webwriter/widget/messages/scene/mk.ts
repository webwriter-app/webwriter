import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Изборот е поништен." : count === 1 ? "Избран е 1 елемент." : `Избрани елементи: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Преместено." : `Преместени елементи: ${count}.`),
  notMoved: "Не е преместено.",
  port: (port, node) => `${port} на ${node}`,
  linkPort: port => `Поврзи од ${port}`,
  wiring: (from, count) => (count === 1 ? `Врска од ${from}. Ја прифаќа 1 порта. Со стрелките бирате, со Enter поврзувате, со Escape откажувате.` : `Врска од ${from}. Порти што ја прифаќаат: ${count}. Со стрелките бирате, со Enter поврзувате, со Escape откажувате.`),
  target: (to, index, count) => `${to}, ${index} од ${count}.`,
  noTarget: "Ниту една порта не ја прифаќа оваа врска.",
  connected: (from, to) => `${from} е поврзано со ${to}.`,
  notConnected: "Не е поврзано.",
} satisfies Catalog<SceneMessages>
