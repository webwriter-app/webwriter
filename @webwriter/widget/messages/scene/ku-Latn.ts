import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Hilbijartin hate rakirin." : count === 1 ? "1 tişt hate hilbijartin." : `Tiştên hilbijartî: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Hate livandin." : `Tiştên hatine livandin: ${count}.`),
  notMoved: "Nehate livandin.",
  port: (port, node) => `${port} ya ${node}`,
  linkPort: port => `Ji ${port} girêde`,
  wiring: (from, count) => (count === 1 ? `Têl ji ${from}. 1 port wê qebûl dike. Tîpên tîran hildibijêrin, Enter girê dide, Escape betal dike.` : `Têl ji ${from}. Portên ku wê qebûl dikin: ${count}. Tîpên tîran hildibijêrin, Enter girê dide, Escape betal dike.`),
  target: (to, index, count) => `${to}, ${index} ji ${count}.`,
  noTarget: "Tu port vî têlî qebûl nake.",
  connected: (from, to) => `${from} bi ${to} re hate girêdan.`,
  notConnected: "Nehate girêdan.",
} satisfies Catalog<SceneMessages>
