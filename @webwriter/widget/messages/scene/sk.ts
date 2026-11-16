import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Výber bol zrušený." : count === 1 ? "Vybratá 1 položka." : `Vybraté položky: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Presunuté." : `Presunuté položky: ${count}.`),
  notMoved: "Nepresunuté.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: port => `Prepojiť z: ${port}`,
  wiring: (from, count) => (count === 1 ? `Vodič z: ${from}. Prijíma ho 1 port. Šípkami vyberte, klávesom Enter prepojte, klávesom Escape zrušte.` : `Vodič z: ${from}. Porty, ktoré ho prijímajú: ${count}. Šípkami vyberte, klávesom Enter prepojte, klávesom Escape zrušte.`),
  target: (to, index, count) => `${to}, ${index} z ${count}.`,
  noTarget: "Žiadny port tento vodič neprijíma.",
  connected: (from, to) => `Prepojené: ${from} a ${to}.`,
  notConnected: "Neprepojené.",
} satisfies Catalog<SceneMessages>
