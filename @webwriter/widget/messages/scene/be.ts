import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Выбар скасаваны." : count === 1 ? "Абраны 1 элемент." : `Абрана элементаў: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Перамешчана." : `Перамешчана элементаў: ${count}.`),
  notMoved: "Не перамешчана.",
  port: (port, node) => `${port}: ${node}`,
  linkPort: port => `Злучыць ад ${port}`,
  wiring: (from, count) => (count === 1 ? `Злучэнне ад «${from}». Яго прымае 1 порт. Стрэлкі — выбар, Enter — злучыць, Escape — скасаваць.` : `Злучэнне ад «${from}». Партоў, якія яго прымаюць: ${count}. Стрэлкі — выбар, Enter — злучыць, Escape — скасаваць.`),
  target: (to, index, count) => `${to}, ${index} з ${count}.`,
  noTarget: "Ніводны порт не прымае гэтае злучэнне.",
  connected: (from, to) => `«${from}» злучаны з «${to}».`,
  notConnected: "Не злучана.",
} satisfies Catalog<SceneMessages>
