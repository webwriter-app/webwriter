import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Тандоо жокко чыгарылды." : count === 1 ? "1 элемент тандалды." : `Тандалган элементтердин саны: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Жылдырылды." : `Жылдырылган элементтердин саны: ${count}.`),
  notMoved: "Жылдырылган жок.",
  port: (port, node) => `${node}: ${port}`,
  linkPort: port => `Байланышты ушул жерден баштоо: ${port}`,
  wiring: (from, count) => (count === 1 ? `Байланыштын башталышы: ${from}. 1 порт кабыл алат. Тандоо үчүн жебе баскычтары, байланыштыруу үчүн Enter, жокко чыгаруу үчүн Escape.` : `Байланыштын башталышы: ${from}. Кабыл алган порттордун саны: ${count}. Тандоо үчүн жебе баскычтары, байланыштыруу үчүн Enter, жокко чыгаруу үчүн Escape.`),
  target: (to, index, count) => `${to}, ${index} / ${count}.`,
  noTarget: "Бир дагы порт бул байланышты кабыл албайт.",
  connected: (from, to) => `Байланыштырылды: ${from} жана ${to}.`,
  notConnected: "Байланыштырылган жок.",
} satisfies Catalog<SceneMessages>
