import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Изборът е премахнат." : count === 1 ? "Избран е 1 елемент." : `Избрани елементи: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Преместено." : `Преместени елементи: ${count}.`),
  notMoved: "Не е преместено.",
  port: (port, node) => `${port} на ${node}`,
  linkPort: port => `Свързване от ${port}`,
  wiring: (from, count) => (count === 1 ? `Връзка от ${from}. Приема я 1 порт. Със стрелките избирате, с Enter свързвате, с Escape откажете.` : `Връзка от ${from}. Портове, които я приемат: ${count}. Със стрелките избирате, с Enter свързвате, с Escape откажете.`),
  target: (to, index, count) => `${to}, ${index} от ${count}.`,
  noTarget: "Никой порт не приема тази връзка.",
  connected: (from, to) => `${from} е свързан с ${to}.`,
  notConnected: "Не е свързано.",
} satisfies Catalog<SceneMessages>
