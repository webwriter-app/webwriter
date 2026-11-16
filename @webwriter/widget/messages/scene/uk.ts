import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Вибір скасовано." : count === 1 ? "Вибрано 1 елемент." : `Вибрано елементів: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Переміщено." : `Переміщено елементів: ${count}.`),
  notMoved: "Не переміщено.",
  port: (port, node) => `${port}: ${node}`,
  linkPort: port => `З’єднати від ${port}`,
  wiring: (from, count) => (count === 1 ? `З’єднання від «${from}». Його приймає 1 порт. Стрілки — вибір, Enter — з’єднати, Escape — скасувати.` : `З’єднання від «${from}». Портів, які його приймають: ${count}. Стрілки — вибір, Enter — з’єднати, Escape — скасувати.`),
  target: (to, index, count) => `${to}, ${index} з ${count}.`,
  noTarget: "Жоден порт не приймає це з’єднання.",
  connected: (from, to) => `«${from}» з’єднано з «${to}».`,
  notConnected: "Не з’єднано.",
} satisfies Catalog<SceneMessages>
